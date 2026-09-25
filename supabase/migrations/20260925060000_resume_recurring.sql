-- Reanudar una recurrente no debe generar las ocurrencias del periodo en pausa:
-- avanza el contador hasta la primera fecha >= p_today, conservando el día de anclaje.
create function public.resume_recurring(p_id uuid, p_today date)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.recurring_transactions;
  n integer;
  d date;
begin
  select * into r from public.recurring_transactions
  where id = p_id and user_id = (select auth.uid())
  for update;
  if not found then
    return;
  end if;

  n := r.occurrences;
  d := r.next_date;
  while d < p_today loop
    n := n + 1;
    d := public.recurring_occurrence(r.start_date, r.frequency, n);
  end loop;

  update public.recurring_transactions
  set active = true, occurrences = n, next_date = d
  where id = r.id;
end;
$$;

revoke execute on function public.resume_recurring(uuid, date) from public, anon;
grant execute on function public.resume_recurring(uuid, date) to authenticated;
