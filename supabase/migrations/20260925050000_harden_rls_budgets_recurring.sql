-- 1. RLS: solo usuarios autenticados, auth.uid() evaluado una vez por consulta
--    y WITH CHECK explícito en UPDATE para impedir reasignar filas a otro usuario.
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['transactions', 'debts', 'savings_goals', 'categories', 'user_settings'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy "select own" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "insert own" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "update own" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    if t <> 'user_settings' then
      execute format('create policy "delete own" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
    end if;
  end loop;
end $$;

-- Índice redundante: transactions_user_date_idx (user_id, date) ya cubre user_id.
drop index if exists public.transactions_user_id_idx;

-- Integridad: lo abonado/ahorrado nunca supera el total.
alter table public.debts add constraint debts_paid_lte_amount check (paid <= amount);
alter table public.savings_goals add constraint savings_goals_current_lte_target check (current <= target);

-- 2. Presupuestos mensuales por categoría de gasto.
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (user_id, category_id)
);
create index budgets_category_id_idx on public.budgets (category_id);
alter table public.budgets enable row level security;
create policy "select own" on public.budgets for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own" on public.budgets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own" on public.budgets for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own" on public.budgets for delete to authenticated using ((select auth.uid()) = user_id);

-- 3. Transacciones recurrentes.
--    La fecha de la ocurrencia n se calcula desde start_date (no desde la anterior)
--    para que "cada 31" no se desplace a 28 después de febrero.
create table public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('ingreso', 'gasto')),
  amount numeric not null check (amount > 0),
  category text not null,
  description text not null default '',
  frequency text not null check (frequency in ('semanal', 'quincenal', 'mensual', 'anual')),
  start_date date not null,
  occurrences integer not null default 0 check (occurrences >= 0),
  next_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index recurring_transactions_user_next_idx on public.recurring_transactions (user_id, next_date) where active;
alter table public.recurring_transactions enable row level security;
create policy "select own" on public.recurring_transactions for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own" on public.recurring_transactions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own" on public.recurring_transactions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own" on public.recurring_transactions for delete to authenticated using ((select auth.uid()) = user_id);

create function public.recurring_occurrence(p_start date, p_frequency text, p_n integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select (case p_frequency
    when 'semanal'   then p_start + 7 * p_n
    when 'quincenal' then p_start + 14 * p_n
    when 'mensual'   then (p_start + make_interval(months => p_n))::date
    when 'anual'     then (p_start + make_interval(years => p_n))::date
  end);
$$;

-- Genera las transacciones vencidas del usuario actual hasta p_today (fecha local del cliente).
-- SECURITY INVOKER: corre bajo RLS. FOR UPDATE serializa pestañas/dispositivos concurrentes.
create function public.materialize_recurring(p_today date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r record;
  d date;
  n integer;
  created integer := 0;
  max_per_rule constant integer := 400;
  today date := least(p_today, current_date + 1);
begin
  for r in
    select * from public.recurring_transactions
    where user_id = (select auth.uid()) and active and next_date <= today
    for update
  loop
    n := r.occurrences;
    d := r.next_date;
    while d <= today and n - r.occurrences < max_per_rule loop
      insert into public.transactions (user_id, type, amount, category, description, date)
      values (r.user_id, r.type, r.amount, r.category, r.description, d);
      created := created + 1;
      n := n + 1;
      d := public.recurring_occurrence(r.start_date, r.frequency, n);
    end loop;
    update public.recurring_transactions set occurrences = n, next_date = d where id = r.id;
  end loop;
  return created;
end;
$$;

revoke execute on function public.materialize_recurring(date) from public, anon;
grant execute on function public.materialize_recurring(date) to authenticated;
