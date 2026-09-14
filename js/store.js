const EXPENSE_CATEGORIES = [
  'Alimentación', 'Transporte', 'Vivienda', 'Servicios',
  'Salud', 'Educación', 'Entretenimiento', 'Otros'
];

const INCOME_CATEGORIES = [
  'Salario', 'Freelance', 'Inversiones', 'Regalo', 'Otros'
];

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

function mapTransactionFromDb(t) {
  return {
    id: t.id, type: t.type, amount: Number(t.amount),
    category: t.category, description: t.description || '', date: t.date
  };
}

const Store = {
  data: {
    settings: { currency: 'USD', locale: navigator.language || 'es-ES' },
    transactions: [],
    debts: [],
    savingsGoals: []
  },
  userId: null,

  async loadAll() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    this.userId = user.id;

    const [settingsRes, txRes, debtsRes, goalsRes] = await Promise.all([
      sb.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
      sb.from('transactions').select('*').eq('user_id', user.id),
      sb.from('debts').select('*').eq('user_id', user.id),
      sb.from('savings_goals').select('*').eq('user_id', user.id)
    ]);

    if (settingsRes.data) {
      this.data.settings = { currency: settingsRes.data.currency, locale: settingsRes.data.locale };
    }
    this.data.transactions = (txRes.data || []).map(mapTransactionFromDb);
    this.data.debts = (debtsRes.data || []).map(mapDebtFromDb);
    this.data.savingsGoals = (goalsRes.data || []).map(mapGoalFromDb);
  },

  reset() {
    this.userId = null;
    this.data = {
      settings: { currency: 'USD', locale: navigator.language || 'es-ES' },
      transactions: [], debts: [], savingsGoals: []
    };
  },

  async addTransaction({ type, amount, category, description, date }) {
    await sb.from('transactions').insert({
      user_id: this.userId, type, amount: Number(amount), category,
      description: description || '', date
    });
    await this.loadAll();
  },

  async deleteTransaction(id) {
    await sb.from('transactions').delete().eq('id', id);
    await this.loadAll();
  },

  async addDebt({ name, type, amount, paid, dueDate, description }) {
    await sb.from('debts').insert({
      user_id: this.userId, name, type, amount: Number(amount),
      paid: Number(paid) || 0, due_date: dueDate || null, description: description || ''
    });
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
    await sb.from('savings_goals').insert({
      user_id: this.userId, name, target: Number(target),
      current: Number(current) || 0, deadline: deadline || null
    });
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
    const key = new Date().toISOString().slice(0, 7);
    let income = 0, expense = 0;
    for (const t of this.data.transactions) {
      if (this.getMonthKey(t.date) === key) {
        if (t.type === 'ingreso') income += t.amount; else expense += t.amount;
      }
    }
    return { income, expense };
  },

  getMonthlySeries(months = 6) {
    const now = new Date();
    const keys = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(d.toISOString().slice(0, 7));
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
      .map(([category, amount]) => ({ category, amount }))
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
