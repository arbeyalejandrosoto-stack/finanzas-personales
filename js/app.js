// --- Utils ---
// Todo texto ingresado por el usuario (o importado) pasa por aquí antes de ir a innerHTML.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

window.addEventListener('unhandledrejection', (e) => {
  alert('No se pudo completar la acción: ' + (e.reason?.message || e.reason));
});

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

// --- Accent color: apply cached value immediately so there's no flash before login ---
(function initAccentColor() {
  const saved = localStorage.getItem('accentColor');
  if (saved) applyAccentColor(saved);
})();

// --- Tabs (crossfade transition, synced between top tabs and bottom nav) ---
function switchTab(tabName) {
  const next = document.getElementById('tab-' + tabName);
  const current = document.querySelector('.tab-panel.active');
  if (current === next) return;

  document.querySelectorAll('[data-tab]').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });

  if (current) {
    current.classList.remove('visible');
    setTimeout(() => current.classList.remove('active'), 220);
  }
  next.classList.add('active');
  requestAnimationFrame(() => requestAnimationFrame(() => next.classList.add('visible')));
  renderAll();
}

document.querySelectorAll('.tab-btn, .bottom-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
document.querySelectorAll('[data-goto-tab]').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.gotoTab));
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
function categoryOptions(type, valueKey = 'name') {
  const cats = Store.getCategories(type);
  return cats.length
    ? cats.map(c => `<option value="${escapeHtml(c[valueKey])}">${escapeHtml(c.emoji)} ${escapeHtml(c.name)}</option>`).join('')
    : '<option value="" disabled selected>Crea una categoría en Ajustes</option>';
}

function populateCategories() {
  document.getElementById('txCategory').innerHTML = categoryOptions(document.getElementById('txType').value);
  document.getElementById('recCategory').innerHTML = categoryOptions(document.getElementById('recType').value);
  document.getElementById('budgetCategory').innerHTML = categoryOptions('gasto', 'id');
}
document.getElementById('txType').addEventListener('change', populateCategories);
document.getElementById('recType').addEventListener('change', populateCategories);
populateCategories();

function resetDateInputs() {
  document.querySelector('#transactionForm [name="date"]').value = localDateKey();
  document.querySelector('#recurringForm [name="startDate"]').value = localDateKey();
}
resetDateInputs();

// --- Forms ---
document.getElementById('transactionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await Store.addTransaction({
    type: fd.get('type'), amount: fd.get('amount'),
    category: fd.get('category'), description: fd.get('description'), date: fd.get('date')
  });
  e.target.reset();
  resetDateInputs();
  populateCategories();
  renderAll();
});

document.getElementById('recurringForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await Store.addRecurring({
    type: fd.get('type'), amount: fd.get('amount'), category: fd.get('category'),
    description: fd.get('description'), frequency: fd.get('frequency'), startDate: fd.get('startDate')
  });
  e.target.reset();
  resetDateInputs();
  populateCategories();
  renderAll();
});

document.getElementById('budgetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  if (!fd.get('categoryId')) return;
  await Store.setBudget(fd.get('categoryId'), fd.get('amount'));
  e.target.reset();
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

document.getElementById('categoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await Store.addCategory({
    type: fd.get('type'), name: fd.get('name'),
    emoji: fd.get('emoji').trim(), color: fd.get('color')
  });
  e.target.reset();
  document.querySelector('#categoryForm [name="color"]').value = '#2a78d6';
  populateCategories();
  renderAll();
});

document.getElementById('txFilter').addEventListener('change', renderTransactions);

// --- Settings ---
const currencySelect = document.getElementById('currencySelect');
currencySelect.addEventListener('change', async () => {
  await Store.setCurrency(currencySelect.value);
  renderAll();
});

const accentColorInput = document.getElementById('accentColorInput');
accentColorInput.addEventListener('input', () => {
  applyAccentColor(accentColorInput.value);
});
accentColorInput.addEventListener('change', async () => {
  localStorage.setItem('accentColor', accentColorInput.value);
  await Store.setAccentColor(accentColorInput.value);
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(Store.exportData(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finanzas-${localDateKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const importFile = document.getElementById('importFile');

function showImportMessage(msg, isError = false) {
  const el = document.getElementById('importMessage');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.toggle('hidden', !msg);
}

document.getElementById('importBtn').addEventListener('click', () => importFile.click());

importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  importFile.value = ''; // permite volver a elegir el mismo archivo
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) {
    showImportMessage('El archivo supera 5 MB.', true);
    return;
  }
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    showImportMessage('El archivo no es un JSON válido.', true);
    return;
  }
  if (!confirm('Los datos del archivo se agregarán a los actuales (los registros ya existentes se omiten). ¿Continuar?')) return;
  showImportMessage('Importando...');
  try {
    const r = await Store.importData(raw);
    showImportMessage(`Importado: ${r.transactions} transacciones, ${r.debts} deudas, ${r.savingsGoals} metas, ` +
      `${r.categories} categorías, ${r.budgets} presupuestos, ${r.recurring} recurrentes.`);
  } catch (err) {
    showImportMessage('Error al importar: ' + err.message, true);
  }
  applyAccentColor(Store.data.settings.accentColor);
  populateCategories();
  renderAll();
});

document.getElementById('clearBtn').addEventListener('click', async () => {
  if (!confirm('¿Seguro que quieres borrar todos tus datos? Esta acción no se puede deshacer.')) return;
  await Store.clearAll();
  populateCategories();
  renderAll();
});

// --- Rendering ---
function trendBadge(pct, goodWhenUp) {
  if (pct === null) return '';
  const isUp = pct > 0;
  const isFlat = pct === 0;
  const isGood = isFlat ? null : (goodWhenUp ? isUp : !isUp);
  const emoji = isFlat ? '⚪' : (isGood ? '🟢' : '🔴');
  const sign = isUp ? '+' : (isFlat ? '' : '');
  const cls = isFlat ? 'neutral' : (isGood ? 'good' : 'bad');
  return `<div class="trend ${cls}">${emoji} ${sign}${pct.toFixed(0)}% vs mes anterior</div>`;
}

function renderDashboard() {
  const totals = Store.getTotals();
  const heroEl = document.getElementById('heroBalance');
  heroEl.classList.toggle('negative', totals.balance < 0);
  animateValue(heroEl, totals.balance);

  const month = Store.getCurrentMonthTotals();
  const debts = Store.getDebtTotals();
  const savings = Store.getSavingsTotal();
  const trend = Store.getMonthOverMonthTrend();

  document.getElementById('kpiRow').innerHTML = `
    <div class="stat-tile"><div class="tile-icon income">💵</div><div class="label">Ingresos del mes</div><div class="value good" data-target="${month.income}">${formatCurrency(0)}</div>${trendBadge(trend.income, true)}</div>
    <div class="stat-tile"><div class="tile-icon expense">💸</div><div class="label">Gastos del mes</div><div class="value bad" data-target="${month.expense}">${formatCurrency(0)}</div>${trendBadge(trend.expense, false)}</div>
    <div class="stat-tile"><div class="tile-icon savings">🏦</div><div class="label">Ahorro acumulado</div><div class="value" data-target="${savings}">${formatCurrency(0)}</div></div>
    <div class="stat-tile"><div class="tile-icon debt">🤝</div><div class="label">Deuda neta</div><div class="value ${debts.net >= 0 ? 'good' : 'bad'}" data-target="${debts.net}">${formatCurrency(0)}</div></div>
  `;
  animateTiles(document.getElementById('kpiRow'));

  const series = Store.getMonthlySeries(6);
  renderLineChart(document.getElementById('lineChart'), series);
  renderLineTable(series);

  const catData = Store.getExpensesByCategory(currentMonthKey());
  renderBarChart(document.getElementById('barChart'), catData);
  renderBarTable(catData);
  renderBudgets();
}

function renderBudgets() {
  const status = Store.getBudgetStatus();
  const alerts = document.getElementById('budgetAlerts');
  const list = document.getElementById('budgetList');

  const over = status.filter(b => b.level === 'over');
  const warning = status.filter(b => b.level === 'warning');
  const names = items => items.map(b => `${escapeHtml(b.emoji)} ${escapeHtml(b.category)}`).join(', ');
  alerts.innerHTML = [
    over.length ? `<div class="budget-alert over">🚨 Presupuesto superado: ${names(over)}</div>` : '',
    warning.length ? `<div class="budget-alert warning">⚠️ Cerca del límite: ${names(warning)}</div>` : ''
  ].join('');

  if (!status.length) {
    list.innerHTML = '<p class="muted">Aún no tienes presupuestos. Créalos en Ajustes.</p>';
    return;
  }
  list.innerHTML = status.map(b => `
    <div class="budget-row">
      <div class="item-card-header">
        <span><span class="cat-dot" style="background:${b.color}"></span>${escapeHtml(b.emoji)} ${escapeHtml(b.category)}</span>
        <span class="muted">${formatCurrency(b.spent)} de ${formatCurrency(b.amount)}</span>
      </div>
      <div class="meter-track"><div class="meter-fill ${b.level}" style="width:${Math.min(100, b.pct)}%"></div></div>
      <div class="meter-labels">
        <span class="budget-pct ${b.level}">${b.pct.toFixed(0)}%</span>
        <span class="muted">${b.spent <= b.amount
          ? `Disponible: ${formatCurrency(b.amount - b.spent)}`
          : `Excedido: ${formatCurrency(b.spent - b.amount)}`}</span>
      </div>
    </div>
  `).join('');
}

function renderBudgetSettings() {
  const el = document.getElementById('budgetSettingsList');
  const status = Store.getBudgetStatus();
  if (!status.length) { el.innerHTML = '<p class="muted">Sin presupuestos todavía.</p>'; return; }
  el.innerHTML = status.map(b => `
    <div class="category-chip" style="--chip-color:${b.color}">
      <span class="category-chip-emoji">${escapeHtml(b.emoji)}</span>
      <span class="category-chip-name">${escapeHtml(b.category)} · ${formatCurrency(b.amount)}</span>
      <button class="delete-btn" data-delete-budget="${b.id}" title="Eliminar presupuesto">✕</button>
    </div>
  `).join('');
  el.querySelectorAll('[data-delete-budget]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await Store.deleteBudget(btn.dataset.deleteBudget);
      renderAll();
    });
  });
}

const FREQUENCY_LABELS = { semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual', anual: 'Anual' };

function renderRecurring() {
  const list = document.getElementById('recurringList');
  const items = Store.data.recurring;
  if (!items.length) {
    list.innerHTML = '<p class="muted">No tienes transacciones recurrentes.</p>';
    return;
  }
  list.innerHTML = items.map(r => {
    const meta = Store.getCategoryMeta(r.type, r.category);
    return `
    <div class="item-card ${r.active ? '' : 'paused'}">
      <div class="item-card-header">
        <strong><span class="cat-dot" style="background:${meta.color}"></span>${escapeHtml(meta.emoji)} ${escapeHtml(r.description || r.category)}</strong>
        <span class="tag">${FREQUENCY_LABELS[r.frequency]}${r.active ? '' : ' · Pausada'}</span>
      </div>
      <div class="muted">
        <span class="amount ${r.type}">${r.type === 'ingreso' ? '+' : '-'}${formatCurrency(r.amount)}</span>
        · ${escapeHtml(r.category)} · ${r.active ? 'Próxima: ' + r.nextDate : 'Sin programar'}
      </div>
      <div class="item-actions">
        <button class="small-btn" data-toggle-recurring="${r.id}" data-active="${r.active}">${r.active ? 'Pausar' : 'Reanudar'}</button>
        <button class="delete-btn" data-delete-recurring="${r.id}">Eliminar</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('[data-toggle-recurring]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await Store.setRecurringActive(btn.dataset.toggleRecurring, btn.dataset.active !== 'true');
      renderAll();
    });
  });
  list.querySelectorAll('[data-delete-recurring]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta transacción recurrente? Las transacciones ya registradas se conservan.')) return;
      await Store.deleteRecurring(btn.dataset.deleteRecurring);
      renderAll();
    });
  });
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
    <tbody>${items.map(i => `<tr><td><span class="cat-dot" style="background:${i.color}"></span>${escapeHtml(i.emoji)} ${escapeHtml(i.category)}</td><td>${formatCurrency(i.amount)}</td></tr>`).join('')}</tbody>
  </table>`;
}

function renderTransactions() {
  const filter = document.getElementById('txFilter').value;
  const rows = [...Store.data.transactions]
    .filter(t => filter === 'todos' || t.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date));

  document.getElementById('txTableBody').innerHTML = rows.map(t => {
    const meta = Store.getCategoryMeta(t.type, t.category);
    return `
    <tr>
      <td>${t.date}</td>
      <td>${t.type === 'ingreso' ? 'Ingreso' : 'Gasto'}</td>
      <td><span class="cat-dot" style="background:${meta.color}"></span>${escapeHtml(meta.emoji)} ${escapeHtml(t.category)}</td>
      <td>${escapeHtml(t.description) || '—'}</td>
      <td class="amount ${t.type}">${t.type === 'ingreso' ? '+' : '-'}${formatCurrency(t.amount)}</td>
      <td><button class="delete-btn" data-id="${t.id}">Eliminar</button></td>
    </tr>
  `;
  }).join('') || '<tr><td colspan="6" class="muted">Sin transacciones.</td></tr>';

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
    <div class="stat-tile"><div class="tile-icon expense">📤</div><div class="label">Yo debo</div><div class="value bad" data-target="${totals.owedByMe}">${formatCurrency(0)}</div></div>
    <div class="stat-tile"><div class="tile-icon income">📥</div><div class="label">Me deben</div><div class="value good" data-target="${totals.owedToMe}">${formatCurrency(0)}</div></div>
    <div class="stat-tile"><div class="tile-icon debt">⚖️</div><div class="label">Balance de deudas</div><div class="value ${totals.net >= 0 ? 'good' : 'bad'}" data-target="${totals.net}">${formatCurrency(0)}</div></div>
  `;
  animateTiles(document.getElementById('debtKpiRow'));

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
        <strong>${escapeHtml(d.name)}</strong>
        <span class="tag">${d.type === 'debo' ? 'Yo debo' : 'Me deben'}</span>
      </div>
      ${d.description ? `<div class="muted">${escapeHtml(d.description)}</div>` : ''}
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
    <div class="stat-tile"><div class="tile-icon savings">🐷</div><div class="label">Ahorrado</div><div class="value good" data-target="${total}">${formatCurrency(0)}</div></div>
    <div class="stat-tile"><div class="tile-icon neutral">🎯</div><div class="label">Meta total</div><div class="value" data-target="${targetTotal}">${formatCurrency(0)}</div></div>
  `;
  animateTiles(document.getElementById('savingsKpiRow'));

  const list = document.getElementById('savingsList');
  const goals = Store.data.savingsGoals;
  if (!goals.length) {
    list.innerHTML = '<p class="muted">No tienes metas de ahorro registradas.</p>';
    return;
  }
  list.innerHTML = goals.map(g => `
    <div class="item-card">
      <div class="item-card-header">
        <strong>${escapeHtml(g.name)}</strong>
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

function renderCategories() {
  const expenseList = document.getElementById('expenseCategoryList');
  const incomeList = document.getElementById('incomeCategoryList');

  function renderGroup(el, cats) {
    if (!cats.length) { el.innerHTML = '<p class="muted">Sin categorías todavía.</p>'; return; }
    el.innerHTML = cats.map(c => `
      <div class="category-chip" style="--chip-color:${c.color}">
        <span class="cat-dot" style="background:${c.color}"></span>
        <span class="category-chip-emoji">${escapeHtml(c.emoji)}</span>
        <span class="category-chip-name">${escapeHtml(c.name)}</span>
        <button class="delete-btn" data-delete-category="${c.id}" title="Eliminar categoría">✕</button>
      </div>
    `).join('');
  }

  renderGroup(expenseList, Store.getCategories('gasto'));
  renderGroup(incomeList, Store.getCategories('ingreso'));

  document.querySelectorAll('[data-delete-category]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const hasBudget = Store.data.budgets.some(b => b.categoryId === btn.dataset.deleteCategory);
      if (hasBudget && !confirm('Esta categoría tiene un presupuesto que también se eliminará. ¿Continuar?')) return;
      await Store.deleteCategory(btn.dataset.deleteCategory);
      populateCategories();
      renderAll();
    });
  });
}

function renderAll() {
  currencySelect.value = Store.data.settings.currency;
  accentColorInput.value = Store.data.settings.accentColor;
  renderDashboard();
  renderTransactions();
  renderDebts();
  renderSavings();
  renderCategories();
  renderBudgetSettings();
  renderRecurring();
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
    await Store.syncRecurring().catch(err => console.error('Recurrentes:', err));
    await Store.loadAll();
    applyAccentColor(Store.data.settings.accentColor);
    localStorage.setItem('accentColor', Store.data.settings.accentColor);
    populateCategories();
    renderAll();
  } else {
    Store.reset();
    authScreen.classList.remove('hidden');
    app.classList.add('hidden');
    userBadge.classList.add('hidden');
    document.getElementById('logoutBtn').classList.add('hidden');
  }
});
