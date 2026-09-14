// --- Theme ---
(function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    renderAll();
  });
})();

// --- Tabs ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    renderAll();
  });
});

// --- Table toggle ---
document.querySelectorAll('[data-toggle-table]').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = document.getElementById(btn.dataset.toggleTable);
    target.classList.toggle('hidden');
    btn.textContent = target.classList.contains('hidden') ? 'Ver como tabla' : 'Ocultar tabla';
  });
});

// --- Populate category selects ---
function populateCategories() {
  const type = document.getElementById('txType').value;
  const cats = type === 'ingreso' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const select = document.getElementById('txCategory');
  select.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
}
document.getElementById('txType').addEventListener('change', populateCategories);
populateCategories();

// default date = today
document.querySelector('#transactionForm [name="date"]').value = new Date().toISOString().slice(0, 10);

// --- Forms ---
document.getElementById('transactionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await Store.addTransaction({
    type: fd.get('type'), amount: fd.get('amount'),
    category: fd.get('category'), description: fd.get('description'), date: fd.get('date')
  });
  e.target.reset();
  document.querySelector('#transactionForm [name="date"]').value = new Date().toISOString().slice(0, 10);
  populateCategories();
  renderAll();
});

document.getElementById('debtForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await Store.addDebt({
    name: fd.get('name'), type: fd.get('type'), amount: fd.get('amount'),
    paid: fd.get('paid'), dueDate: fd.get('dueDate'), description: fd.get('description')
  });
  e.target.reset();
  renderAll();
});

document.getElementById('savingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await Store.addSavingsGoal({
    name: fd.get('name'), target: fd.get('target'),
    current: fd.get('current'), deadline: fd.get('deadline')
  });
  e.target.reset();
  renderAll();
});

document.getElementById('txFilter').addEventListener('change', renderTransactions);

// --- Settings ---
const currencySelect = document.getElementById('currencySelect');
currencySelect.addEventListener('change', async () => {
  await Store.setCurrency(currencySelect.value);
  renderAll();
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(Store.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finanzas-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('clearBtn').addEventListener('click', async () => {
  if (!confirm('¿Seguro que quieres borrar todos tus datos? Esta acción no se puede deshacer.')) return;
  await Promise.all([
    sb.from('transactions').delete().eq('user_id', Store.userId),
    sb.from('debts').delete().eq('user_id', Store.userId),
    sb.from('savings_goals').delete().eq('user_id', Store.userId)
  ]);
  await Store.loadAll();
  renderAll();
});

// --- Rendering ---
function renderDashboard() {
  const totals = Store.getTotals();
  const heroEl = document.getElementById('heroBalance');
  heroEl.textContent = formatCurrency(totals.balance);
  heroEl.classList.toggle('negative', totals.balance < 0);

  const month = Store.getCurrentMonthTotals();
  const debts = Store.getDebtTotals();
  const savings = Store.getSavingsTotal();

  document.getElementById('kpiRow').innerHTML = `
    <div class="stat-tile"><div class="label">Ingresos del mes</div><div class="value good">${formatCurrency(month.income)}</div></div>
    <div class="stat-tile"><div class="label">Gastos del mes</div><div class="value bad">${formatCurrency(month.expense)}</div></div>
    <div class="stat-tile"><div class="label">Ahorro acumulado</div><div class="value">${formatCurrency(savings)}</div></div>
    <div class="stat-tile"><div class="label">Deuda neta</div><div class="value ${debts.net >= 0 ? 'good' : 'bad'}">${formatCurrency(debts.net)}</div></div>
  `;

  const series = Store.getMonthlySeries(6);
  renderLineChart(document.getElementById('lineChart'), series);
  renderLineTable(series);

  const monthKey = new Date().toISOString().slice(0, 7);
  const catData = Store.getExpensesByCategory(monthKey);
  renderBarChart(document.getElementById('barChart'), catData);
  renderBarTable(catData);
}

function renderLineTable(series) {
  const el = document.getElementById('lineTable');
  el.innerHTML = `<table class="data-table">
    <thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th></tr></thead>
    <tbody>${series.map(s => `<tr><td>${monthLabel(s.key)}</td><td>${formatCurrency(s.income)}</td><td>${formatCurrency(s.expense)}</td></tr>`).join('')}</tbody>
  </table>`;
}

function renderBarTable(items) {
  const el = document.getElementById('barTable');
  if (!items.length) { el.innerHTML = '<p class="muted">Sin datos.</p>'; return; }
  el.innerHTML = `<table class="data-table">
    <thead><tr><th>Categoría</th><th>Monto</th></tr></thead>
    <tbody>${items.map(i => `<tr><td>${i.category}</td><td>${formatCurrency(i.amount)}</td></tr>`).join('')}</tbody>
  </table>`;
}

function renderTransactions() {
  const filter = document.getElementById('txFilter').value;
  const rows = [...Store.data.transactions]
    .filter(t => filter === 'todos' || t.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date));

  document.getElementById('txTableBody').innerHTML = rows.map(t => `
    <tr>
      <td>${t.date}</td>
      <td>${t.type === 'ingreso' ? 'Ingreso' : 'Gasto'}</td>
      <td>${t.category}</td>
      <td>${t.description || '—'}</td>
      <td class="amount ${t.type}">${t.type === 'ingreso' ? '+' : '-'}${formatCurrency(t.amount)}</td>
      <td><button class="delete-btn" data-id="${t.id}">Eliminar</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="muted">Sin transacciones.</td></tr>';

  document.querySelectorAll('#txTableBody .delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await Store.deleteTransaction(btn.dataset.id);
      renderAll();
    });
  });
}

function renderDebts() {
  const totals = Store.getDebtTotals();
  document.getElementById('debtKpiRow').innerHTML = `
    <div class="stat-tile"><div class="label">Yo debo</div><div class="value bad">${formatCurrency(totals.owedByMe)}</div></div>
    <div class="stat-tile"><div class="label">Me deben</div><div class="value good">${formatCurrency(totals.owedToMe)}</div></div>
    <div class="stat-tile"><div class="label">Balance de deudas</div><div class="value ${totals.net >= 0 ? 'good' : 'bad'}">${formatCurrency(totals.net)}</div></div>
  `;

  const list = document.getElementById('debtList');
  const debts = Store.data.debts;
  if (!debts.length) {
    list.innerHTML = '<p class="muted">No tienes deudas registradas.</p>';
    return;
  }
  list.innerHTML = debts.map(d => {
    const pending = d.amount - d.paid;
    return `
    <div class="item-card">
      <div class="item-card-header">
        <strong>${d.name}</strong>
        <span class="tag">${d.type === 'debo' ? 'Yo debo' : 'Me deben'}</span>
      </div>
      ${d.description ? `<div class="muted">${d.description}</div>` : ''}
      <div class="meter-block" data-meter="${d.id}"></div>
      <div class="muted">Pendiente: ${formatCurrency(pending)} ${d.dueDate ? '· Vence: ' + d.dueDate : ''}</div>
      <div class="item-actions">
        <input type="number" min="0.01" step="0.01" placeholder="Abono" data-pay="${d.id}">
        <button class="small-btn" data-pay-btn="${d.id}">Registrar abono</button>
        <button class="delete-btn" data-delete-debt="${d.id}">Eliminar</button>
      </div>
    </div>`;
  }).join('');

  debts.forEach(d => {
    renderMeter(document.querySelector(`[data-meter="${d.id}"]`), d.paid, d.amount);
  });
  list.querySelectorAll('[data-pay-btn]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.payBtn;
      const input = list.querySelector(`[data-pay="${id}"]`);
      const val = parseFloat(input.value);
      if (val > 0) {
        await Store.addDebtPayment(id, val);
        renderAll();
      }
    });
  });
  list.querySelectorAll('[data-delete-debt]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await Store.deleteDebt(btn.dataset.deleteDebt);
      renderAll();
    });
  });
}

function renderSavings() {
  const total = Store.getSavingsTotal();
  const targetTotal = Store.data.savingsGoals.reduce((s, g) => s + g.target, 0);
  document.getElementById('savingsKpiRow').innerHTML = `
    <div class="stat-tile"><div class="label">Ahorrado</div><div class="value good">${formatCurrency(total)}</div></div>
    <div class="stat-tile"><div class="label">Meta total</div><div class="value">${formatCurrency(targetTotal)}</div></div>
  `;

  const list = document.getElementById('savingsList');
  const goals = Store.data.savingsGoals;
  if (!goals.length) {
    list.innerHTML = '<p class="muted">No tienes metas de ahorro registradas.</p>';
    return;
  }
  list.innerHTML = goals.map(g => `
    <div class="item-card">
      <div class="item-card-header">
        <strong>${g.name}</strong>
        ${g.deadline ? `<span class="tag">Meta: ${g.deadline}</span>` : ''}
      </div>
      <div class="meter-block" data-smeter="${g.id}"></div>
      <div class="item-actions">
        <input type="number" min="0.01" step="0.01" placeholder="Aporte" data-contrib="${g.id}">
        <button class="small-btn" data-contrib-btn="${g.id}">Agregar aporte</button>
        <button class="delete-btn" data-delete-goal="${g.id}">Eliminar</button>
      </div>
    </div>
  `).join('');

  goals.forEach(g => {
    renderMeter(document.querySelector(`[data-smeter="${g.id}"]`), g.current, g.target);
  });
  list.querySelectorAll('[data-contrib-btn]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.contribBtn;
      const input = list.querySelector(`[data-contrib="${id}"]`);
      const val = parseFloat(input.value);
      if (val > 0) {
        await Store.addSavingsContribution(id, val);
        renderAll();
      }
    });
  });
  list.querySelectorAll('[data-delete-goal]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await Store.deleteSavingsGoal(btn.dataset.deleteGoal);
      renderAll();
    });
  });
}

function renderAll() {
  currencySelect.value = Store.data.settings.currency;
  renderDashboard();
  renderTransactions();
  renderDebts();
  renderSavings();
}

window.addEventListener('resize', () => {
  if (Auth.user) renderDashboard();
});

// --- Auth-gated bootstrap ---
Auth.init(async (user) => {
  const authScreen = document.getElementById('authScreen');
  const app = document.getElementById('appRoot');
  const userBadge = document.getElementById('userBadge');

  if (user) {
    authScreen.classList.add('hidden');
    app.classList.remove('hidden');
    userBadge.textContent = user.email;
    userBadge.classList.remove('hidden');
    document.getElementById('logoutBtn').classList.remove('hidden');
    await Store.loadAll();
    renderAll();
  } else {
    Store.reset();
    authScreen.classList.remove('hidden');
    app.classList.add('hidden');
    userBadge.classList.add('hidden');
    document.getElementById('logoutBtn').classList.add('hidden');
  }
});
