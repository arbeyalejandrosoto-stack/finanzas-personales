const DEFAULT_CATEGORIES = [
  { type: 'gasto', name: 'Alimentación', emoji: '🍔', color: '#f97316' },
  { type: 'gasto', name: 'Transporte', emoji: '🚗', color: '#3b82f6' },
  { type: 'gasto', name: 'Vivienda', emoji: '🏠', color: '#8b5cf6' },
  { type: 'gasto', name: 'Servicios', emoji: '💡', color: '#eab308' },
  { type: 'gasto', name: 'Salud', emoji: '🏥', color: '#ef4444' },
  { type: 'gasto', name: 'Educación', emoji: '📚', color: '#06b6d4' },
  { type: 'gasto', name: 'Entretenimiento', emoji: '🎬', color: '#ec4899' },
  { type: 'gasto', name: 'Otros', emoji: '🔖', color: '#6b7280' },
  { type: 'ingreso', name: 'Salario', emoji: '💼', color: '#10b981' },
  { type: 'ingreso', name: 'Freelance', emoji: '💻', color: '#14b8a6' },
  { type: 'ingreso', name: 'Inversiones', emoji: '📈', color: '#22c55e' },
  { type: 'ingreso', name: 'Regalo', emoji: '🎁', color: '#f59e0b' },
  { type: 'ingreso', name: 'Otros', emoji: '🔖', color: '#6b7280' }
];
const FALLBACK_CATEGORY_META = { emoji: '🏷️', color: '#94a3b8' };

function mapCategoryFromDb(c) {
  return { id: c.id, type: c.type, name: c.name, emoji: c.emoji, color: c.color };
}

function mapDebtFromDb(d) {
  return {
    id: d.id, name: d.name, type: d.type, amount: Number(d.amount),
    paid: Number(d.paid), dueDate: d.due_date || '', description: d.description || ''
  };
}

function mapGoalFromDb(g) {
  return {
    id: g.id, name: g.name, target: Number(g.target),
    current: Number(g.current), deadline: g.deadline || ''
  };
}

function mapBudgetFromDb(b) {
  return { id: b.id, categoryId: b.category_id, amount: Number(b.amount) };
}

function mapRecurringFromDb(r) {
  return {
    id: r.id, type: r.type, amount: Number(r.amount), category: r.category,
    description: r.description || '', frequency: r.frequency,
    startDate: r.start_date, occurrences: r.occurrences, nextDate: r.next_date, active: r.active
  };
}

function mapTransactionFromDb(t) {
  return {
    id: t.id, type: t.type, amount: Number(t.amount),
    category: t.category, description: t.description || '', date: t.date
  };
}

const DEFAULT_ACCENT_COLOR = '#2a78d6';
const BUDGET_WARNING_PCT = 80;

// Fecha local YYYY-MM-DD (toISOString usa UTC y desfasa el día/mes según la zona horaria).
function localDateKey(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function currentMonthKey() {
  return localDateKey().slice(0, 7);
}

// Supabase no lanza excepciones: devuelve { error }. Lo convertimos en excepción.
function unwrap(res) {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

// --- Import validation ---
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const FREQUENCIES = ['semanal', 'quincenal', 'mensual', 'anual'];

const isText = (v, max = 200) => typeof v === 'string' && v.trim() !== '' && v.length <= max;
const isPositive = v => Number.isFinite(Number(v)) && Number(v) > 0;
const isDate = v => typeof v === 'string' && DATE_RE.test(v) && !isNaN(Date.parse(v));
const optDate = v => (isDate(v) ? v : null);
const optText = (v, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');
const optId = v => (typeof v === 'string' && UUID_RE.test(v) ? { id: v } : {});
const asArray = v => (Array.isArray(v) ? v : []);

// Transforma el JSON exportado en filas listas para insertar. Las filas inválidas se descartan.
function parseImport(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('El archivo no tiene el formato de exportación.');
  const keys = ['transactions', 'debts', 'savingsGoals', 'categories', 'budgets', 'recurring'];
  if (!keys.some(k => Array.isArray(raw[k]))) throw new Error('El archivo no contiene datos reconocibles.');

  const validType = t => t === 'ingreso' || t === 'gasto';
  const rows = {
    categories: asArray(raw.categories)
      .filter(c => validType(c?.type) && isText(c.name, 40))
      .map(c => ({
        type: c.type, name: c.name.trim(),
        emoji: isText(c.emoji, 8) ? c.emoji : FALLBACK_CATEGORY_META.emoji,
        color: HEX_RE.test(c.color) ? c.color : FALLBACK_CATEGORY_META.color
      })),
    transactions: asArray(raw.transactions)
      .filter(t => validType(t?.type) && isPositive(t.amount) && isText(t.category, 40) && isDate(t.date))
      .map(t => ({
        ...optId(t.id), type: t.type, amount: Number(t.amount), category: t.category,
        description: optText(t.description), date: t.date
      })),
    debts: asArray(raw.debts)
      .filter(d => isText(d?.name) && (d.type === 'debo' || d.type === 'me_deben') && isPositive(d.amount))
      .map(d => ({
        ...optId(d.id), name: d.name, type: d.type, amount: Number(d.amount),
        paid: Math.min(Math.max(Number(d.paid) || 0, 0), Number(d.amount)),
        due_date: optDate(d.dueDate), description: optText(d.description)
      })),
    savingsGoals: asArray(raw.savingsGoals)
      .filter(g => isText(g?.name) && isPositive(g.target))
      .map(g => ({
        ...optId(g.id), name: g.name, target: Number(g.target),
        current: Math.min(Math.max(Number(g.current) || 0, 0), Number(g.target)),
        deadline: optDate(g.deadline)
      })),
    budgets: asArray(raw.budgets)
      .filter(b => isText(b?.category, 40) && isPositive(b.amount))
      .map(b => ({ category: b.category, amount: Number(b.amount) })),
    recurring: asArray(raw.recurring)
      .filter(r => validType(r?.type) && isPositive(r.amount) && isText(r.category, 40) &&
        FREQUENCIES.includes(r.frequency) && isDate(r.startDate))
      .map(r => {
        const nextDate = isDate(r.nextDate) ? r.nextDate : r.startDate;
        // Sin contador válido se re-ancla en la próxima fecha para no regenerar ocurrencias pasadas.
        const anchor = Number.isInteger(r.occurrences) && r.occurrences >= 0
          ? { start_date: r.startDate, occurrences: r.occurrences }
          : { start_date: nextDate, occurrences: 0 };
        return {
          ...optId(r.id), type: r.type, amount: Number(r.amount), category: r.category,
          description: optText(r.description), frequency: r.frequency,
          ...anchor, next_date: nextDate, active: r.active !== false
        };
      })
  };

  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  rows.settings = {
    ...(isText(settings.currency, 3) && /^[A-Z]{3}$/.test(settings.currency) ? { currency: settings.currency } : {}),
    ...(HEX_RE.test(settings.accentColor) ? { accent_color: settings.accentColor } : {})
  };
  return rows;
}

const Store = {
  data: {
    settings: { currency: 'USD', locale: navigator.language || 'es-ES', accentColor: DEFAULT_ACCENT_COLOR },
    transactions: [],
    debts: [],
    savingsGoals: [],
    categories: [],
    budgets: [],
    recurring: []
  },
  userId: null,

  async loadAll() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    this.userId = user.id;

    const [settingsRes, txRes, debtsRes, goalsRes, categoriesRes, budgetsRes, recurringRes] = await Promise.all([
      sb.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
      sb.from('transactions').select('*').eq('user_id', user.id),
      sb.from('debts').select('*').eq('user_id', user.id),
      sb.from('savings_goals').select('*').eq('user_id', user.id),
      sb.from('categories').select('*').eq('user_id', user.id),
      sb.from('budgets').select('*').eq('user_id', user.id),
      sb.from('recurring_transactions').select('*').eq('user_id', user.id).order('next_date')
    ]);

    if (settingsRes.data) {
      this.data.settings = {
        currency: settingsRes.data.currency,
        locale: settingsRes.data.locale,
        accentColor: settingsRes.data.accent_color || DEFAULT_ACCENT_COLOR
      };
    }
    this.data.transactions = (txRes.data || []).map(mapTransactionFromDb);
    this.data.debts = (debtsRes.data || []).map(mapDebtFromDb);
    this.data.savingsGoals = (goalsRes.data || []).map(mapGoalFromDb);
    this.data.categories = (categoriesRes.data || []).map(mapCategoryFromDb);
    this.data.budgets = (budgetsRes.data || []).map(mapBudgetFromDb);
    this.data.recurring = (recurringRes.data || []).map(mapRecurringFromDb);

    if (this.data.categories.length === 0) {
      await sb.from('categories').insert(
        DEFAULT_CATEGORIES.map(c => ({ ...c, user_id: this.userId }))
      );
      const seeded = await sb.from('categories').select('*').eq('user_id', user.id);
      this.data.categories = (seeded.data || []).map(mapCategoryFromDb);
    }
  },

  reset() {
    this.userId = null;
    this.data = {
      settings: { currency: 'USD', locale: navigator.language || 'es-ES', accentColor: DEFAULT_ACCENT_COLOR },
      transactions: [], debts: [], savingsGoals: [], categories: [], budgets: [], recurring: []
    };
  },

  async addTransaction({ type, amount, category, description, date }) {
    unwrap(await sb.from('transactions').insert({
      user_id: this.userId, type, amount: Number(amount), category,
      description: description || '', date
    }));
    await this.loadAll();
  },

  async deleteTransaction(id) {
    await sb.from('transactions').delete().eq('id', id);
    await this.loadAll();
  },

  async addDebt({ name, type, amount, paid, dueDate, description }) {
    unwrap(await sb.from('debts').insert({
      user_id: this.userId, name, type, amount: Number(amount),
      paid: Math.min(Number(paid) || 0, Number(amount)), due_date: dueDate || null, description: description || ''
    }));
    await this.loadAll();
  },

  async addDebtPayment(id, amount) {
    const debt = this.data.debts.find(d => d.id === id);
    if (!debt) return;
    const newPaid = Math.min(debt.amount, debt.paid + Number(amount));
    await sb.from('debts').update({ paid: newPaid }).eq('id', id);
    await this.loadAll();
  },

  async deleteDebt(id) {
    await sb.from('debts').delete().eq('id', id);
    await this.loadAll();
  },

  async addSavingsGoal({ name, target, current, deadline }) {
    unwrap(await sb.from('savings_goals').insert({
      user_id: this.userId, name, target: Number(target),
      current: Math.min(Number(current) || 0, Number(target)), deadline: deadline || null
    }));
    await this.loadAll();
  },

  async addSavingsContribution(id, amount) {
    const goal = this.data.savingsGoals.find(g => g.id === id);
    if (!goal) return;
    const newCurrent = Math.min(goal.target, goal.current + Number(amount));
    await sb.from('savings_goals').update({ current: newCurrent }).eq('id', id);
    await this.loadAll();
  },

  async deleteSavingsGoal(id) {
    await sb.from('savings_goals').delete().eq('id', id);
    await this.loadAll();
  },

  async setCurrency(currency) {
    this.data.settings.currency = currency;
    await sb.from('user_settings').update({ currency }).eq('user_id', this.userId);
  },

  async setAccentColor(color) {
    this.data.settings.accentColor = color;
    await sb.from('user_settings').update({ accent_color: color }).eq('user_id', this.userId);
  },

  async addCategory({ type, name, emoji, color }) {
    unwrap(await sb.from('categories').insert({
      user_id: this.userId, type, name: name.trim(),
      emoji: emoji || FALLBACK_CATEGORY_META.emoji, color
    }));
    await this.loadAll();
  },

  async deleteCategory(id) {
    await sb.from('categories').delete().eq('id', id);
    await this.loadAll();
  },

  // --- Budgets ---

  async setBudget(categoryId, amount) {
    unwrap(await sb.from('budgets').upsert(
      { user_id: this.userId, category_id: categoryId, amount: Number(amount) },
      { onConflict: 'user_id,category_id' }
    ));
    await this.loadAll();
  },

  async deleteBudget(id) {
    unwrap(await sb.from('budgets').delete().eq('id', id));
    await this.loadAll();
  },

  getBudgetStatus(monthKey = currentMonthKey()) {
    const spentByCategory = {};
    for (const t of this.data.transactions) {
      if (t.type !== 'gasto' || this.getMonthKey(t.date) !== monthKey) continue;
      spentByCategory[t.category] = (spentByCategory[t.category] || 0) + t.amount;
    }
    return this.data.budgets
      .map(b => {
        const cat = this.data.categories.find(c => c.id === b.categoryId);
        if (!cat) return null;
        const spent = spentByCategory[cat.name] || 0;
        const pct = (spent / b.amount) * 100;
        const level = pct > 100 ? 'over' : pct >= BUDGET_WARNING_PCT ? 'warning' : 'ok';
        return { ...b, category: cat.name, emoji: cat.emoji, color: cat.color, spent, pct, level };
      })
      .filter(Boolean)
      .sort((a, b) => b.pct - a.pct);
  },

  // --- Recurring transactions ---

  async addRecurring({ type, amount, category, description, frequency, startDate }) {
    unwrap(await sb.from('recurring_transactions').insert({
      user_id: this.userId, type, amount: Number(amount), category,
      description: description || '', frequency,
      start_date: startDate, next_date: startDate
    }));
    await this.syncRecurring();
    await this.loadAll();
  },

  async setRecurringActive(id, active) {
    if (active) {
      // Salta el periodo en pausa en el servidor en vez de generarlo de golpe.
      unwrap(await sb.rpc('resume_recurring', { p_id: id, p_today: localDateKey() }));
      await this.syncRecurring();
    } else {
      unwrap(await sb.from('recurring_transactions').update({ active: false }).eq('id', id));
    }
    await this.loadAll();
  },

  async deleteRecurring(id) {
    unwrap(await sb.from('recurring_transactions').delete().eq('id', id));
    await this.loadAll();
  },

  // Genera en el servidor las ocurrencias vencidas (atómico e idempotente). Devuelve cuántas creó.
  async syncRecurring() {
    return unwrap(await sb.rpc('materialize_recurring', { p_today: localDateKey() })) || 0;
  },

  // --- Export / Import ---

  exportData() {
    const { settings, transactions, debts, savingsGoals, categories, recurring } = this.data;
    const budgets = this.getBudgetStatus().map(b => ({ category: b.category, amount: b.amount }));
    return {
      version: 2, exportedAt: new Date().toISOString(),
      settings, transactions, debts, savingsGoals, categories, budgets, recurring
    };
  },

  // Importa sin duplicar: filas con id existente y categorías repetidas se ignoran,
  // así reimportar el mismo archivo es seguro.
  async importData(raw) {
    const rows = parseImport(raw);
    const withUser = list => list.map(r => ({ ...r, user_id: this.userId }));
    const ignoreById = { onConflict: 'id', ignoreDuplicates: true };

    if (rows.categories.length) {
      unwrap(await sb.from('categories').upsert(withUser(rows.categories),
        { onConflict: 'user_id,type,name', ignoreDuplicates: true }));
    }
    await Promise.all([
      rows.transactions.length && sb.from('transactions').upsert(withUser(rows.transactions), ignoreById).then(unwrap),
      rows.debts.length && sb.from('debts').upsert(withUser(rows.debts), ignoreById).then(unwrap),
      rows.savingsGoals.length && sb.from('savings_goals').upsert(withUser(rows.savingsGoals), ignoreById).then(unwrap),
      rows.recurring.length && sb.from('recurring_transactions').upsert(withUser(rows.recurring), ignoreById).then(unwrap),
      Object.keys(rows.settings).length &&
        sb.from('user_settings').update(rows.settings).eq('user_id', this.userId).then(unwrap)
    ]);

    // Los presupuestos referencian categorías por id: se resuelven tras insertarlas.
    await this.loadAll();
    const budgetRows = rows.budgets
      .map(b => {
        const cat = this.data.categories.find(c => c.type === 'gasto' && c.name === b.category);
        return cat && { user_id: this.userId, category_id: cat.id, amount: b.amount };
      })
      .filter(Boolean);
    if (budgetRows.length) {
      unwrap(await sb.from('budgets').upsert(budgetRows, { onConflict: 'user_id,category_id' }));
    }

    await this.syncRecurring();
    await this.loadAll();
    return {
      transactions: rows.transactions.length, debts: rows.debts.length,
      savingsGoals: rows.savingsGoals.length, categories: rows.categories.length,
      budgets: budgetRows.length, recurring: rows.recurring.length
    };
  },

  async clearAll() {
    const tables = ['transactions', 'debts', 'savings_goals', 'recurring_transactions', 'budgets', 'categories'];
    await Promise.all(tables.map(t => sb.from(t).delete().eq('user_id', this.userId).then(unwrap)));
    await this.loadAll();
  },

  getCategories(type) {
    return this.data.categories.filter(c => c.type === type);
  },

  getCategoryMeta(type, name) {
    const match = this.data.categories.find(c => c.type === type && c.name === name);
    return match || { ...FALLBACK_CATEGORY_META, name };
  },

  // --- Aggregations ---

  getTotals() {
    let income = 0, expense = 0;
    for (const t of this.data.transactions) {
      if (t.type === 'ingreso') income += t.amount; else expense += t.amount;
    }
    return { income, expense, balance: income - expense };
  },

  getMonthKey(dateStr) {
    return dateStr.slice(0, 7); // YYYY-MM
  },

  getCurrentMonthTotals() {
    const key = currentMonthKey();
    let income = 0, expense = 0;
    for (const t of this.data.transactions) {
      if (this.getMonthKey(t.date) === key) {
        if (t.type === 'ingreso') income += t.amount; else expense += t.amount;
      }
    }
    return { income, expense };
  },

  getMonthOverMonthTrend() {
    const [prev, curr] = this.getMonthlySeries(2);
    function pctChange(c, p) {
      if (p === 0) return c === 0 ? null : 100;
      return ((c - p) / p) * 100;
    }
    return {
      income: pctChange(curr.income, prev.income),
      expense: pctChange(curr.expense, prev.expense)
    };
  },

  getMonthlySeries(months = 6) {
    const now = new Date();
    const keys = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(localDateKey(d).slice(0, 7));
    }
    const map = {};
    keys.forEach(k => map[k] = { income: 0, expense: 0 });
    for (const t of this.data.transactions) {
      const k = this.getMonthKey(t.date);
      if (map[k]) {
        if (t.type === 'ingreso') map[k].income += t.amount;
        else map[k].expense += t.amount;
      }
    }
    return keys.map(k => ({ key: k, ...map[k] }));
  },

  getExpensesByCategory(monthKey) {
    const totals = {};
    for (const t of this.data.transactions) {
      if (t.type !== 'gasto') continue;
      if (monthKey && this.getMonthKey(t.date) !== monthKey) continue;
      totals[t.category] = (totals[t.category] || 0) + t.amount;
    }
    return Object.entries(totals)
      .map(([category, amount]) => {
        const meta = this.getCategoryMeta('gasto', category);
        return { category, amount, emoji: meta.emoji, color: meta.color };
      })
      .sort((a, b) => b.amount - a.amount);
  },

  getDebtTotals() {
    let owedByMe = 0, owedToMe = 0;
    for (const d of this.data.debts) {
      const pending = d.amount - d.paid;
      if (d.type === 'debo') owedByMe += pending;
      else owedToMe += pending;
    }
    return { owedByMe, owedToMe, net: owedToMe - owedByMe };
  },

  getSavingsTotal() {
    return this.data.savingsGoals.reduce((sum, g) => sum + g.current, 0);
  }
};
