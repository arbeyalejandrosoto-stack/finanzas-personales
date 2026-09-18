function formatCurrency(value) {
  const { currency, locale } = Store.data.settings;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return '$' + Math.round(value).toLocaleString();
  }
}

function formatCompact(value) {
  const { locale } = Store.data.settings;
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(Store.data.settings.locale, { month: 'short' });
}

const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/**
 * Animates a number from its current displayed value up/down to `to`, formatting with formatCurrency.
 */
function animateValue(el, to, duration = 900) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const from = parseFloat(el.dataset.rawValue || '0');
  el.dataset.rawValue = to;
  if (reduceMotion || from === to) {
    el.textContent = formatCurrency(to);
    return;
  }
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatCurrency(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/**
 * Runs the count-up animation on every `[data-target]` value inside a freshly-rendered container.
 */
function animateTiles(container) {
  container.querySelectorAll('.value[data-target]').forEach(el => {
    const target = parseFloat(el.dataset.target);
    animateValue(el, target);
  });
}

/**
 * Line chart: ingresos vs gastos over time. Two categorical series (slot 1 blue, slot 2 orange).
 */
function renderLineChart(container, series) {
  container.innerHTML = '';
  const width = container.clientWidth || 560;
  const height = 260;
  const padding = { top: 20, right: 16, bottom: 28, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const maxVal = Math.max(1, ...series.map(s => Math.max(s.income, s.expense)));
  const niceMax = Math.ceil(maxVal / 4) * 4 || 4;
  const stepX = innerW / (series.length - 1 || 1);

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, class: 'chart-svg' });

  const uid = Math.random().toString(36).slice(2, 9);
  const defs = svgEl('defs');
  [['series1', 'var(--series-1)'], ['series2', 'var(--series-2)']].forEach(([name, color]) => {
    const grad = svgEl('linearGradient', { id: `area-${name}-${uid}`, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.32 }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }));
    defs.appendChild(grad);
  });
  svg.appendChild(defs);

  // gridlines (4 steps) + y ticks
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const y = padding.top + innerH - (innerH * i / steps);
    svg.appendChild(svgEl('line', {
      x1: padding.left, x2: width - padding.right, y1: y, y2: y,
      class: 'chart-gridline'
    }));
    const label = svgEl('text', { x: padding.left - 8, y: y + 4, class: 'chart-tick', 'text-anchor': 'end' });
    label.textContent = formatCompact(niceMax * i / steps);
    svg.appendChild(label);
  }

  function pointsFor(key) {
    return series.map((s, i) => {
      const x = padding.left + stepX * i;
      const y = padding.top + innerH - (innerH * s[key] / niceMax);
      return [x, y];
    });
  }

  function path(points) {
    return points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  }

  const incomePts = pointsFor('income');
  const expensePts = pointsFor('expense');
  const baselineY = padding.top + innerH;

  function areaPath(points) {
    return path(points) +
      ` L${points[points.length - 1][0].toFixed(1)},${baselineY} L${points[0][0].toFixed(1)},${baselineY} Z`;
  }

  const incomeArea = svgEl('path', { d: areaPath(incomePts), fill: `url(#area-series1-${uid})`, class: 'chart-area' });
  const expenseArea = svgEl('path', { d: areaPath(expensePts), fill: `url(#area-series2-${uid})`, class: 'chart-area' });
  svg.appendChild(incomeArea);
  svg.appendChild(expenseArea);

  const incomeLine = svgEl('path', { d: path(incomePts), class: 'chart-line series-1' });
  const expenseLine = svgEl('path', { d: path(expensePts), class: 'chart-line series-2' });
  svg.appendChild(incomeLine);
  svg.appendChild(expenseLine);

  // x-axis labels
  series.forEach((s, i) => {
    const x = padding.left + stepX * i;
    const label = svgEl('text', { x, y: height - 6, class: 'chart-tick', 'text-anchor': 'middle' });
    label.textContent = monthLabel(s.key);
    svg.appendChild(label);
  });

  // end markers + direct labels
  function addEndMarker(points, cls, value) {
    const [x, y] = points[points.length - 1];
    svg.appendChild(svgEl('circle', { cx: x, cy: y, r: 4, class: `chart-dot ${cls}` }));
    const label = svgEl('text', {
      x: x - 4, y: y - 10, class: `chart-endlabel ${cls}`, 'text-anchor': 'end'
    });
    label.textContent = formatCompact(value);
    svg.appendChild(label);
  }
  if (series.length) {
    addEndMarker(incomePts, 'series-1', series[series.length - 1].income);
    addEndMarker(expensePts, 'series-2', series[series.length - 1].expense);
  }

  // hover crosshair + tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.style.display = 'none';
  container.style.position = 'relative';

  const hitLayer = svgEl('rect', {
    x: padding.left, y: padding.top, width: innerW, height: innerH,
    fill: 'transparent'
  });

  const crosshair = svgEl('line', { class: 'chart-crosshair', y1: padding.top, y2: padding.top + innerH, style: 'display:none' });
  svg.appendChild(crosshair);
  svg.appendChild(hitLayer);

  hitLayer.addEventListener('mousemove', (e) => {
    const rect = container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let idx = Math.round((mx - padding.left) / stepX);
    idx = Math.max(0, Math.min(series.length - 1, idx));
    const x = padding.left + stepX * idx;
    crosshair.setAttribute('x1', x);
    crosshair.setAttribute('x2', x);
    crosshair.style.display = 'block';
    const s = series[idx];
    tooltip.innerHTML = `<strong>${monthLabel(s.key)}</strong><br>
      <span class="dot series-1"></span> Ingresos: ${formatCurrency(s.income)}<br>
      <span class="dot series-2"></span> Gastos: ${formatCurrency(s.expense)}`;
    tooltip.style.display = 'block';
    tooltip.style.left = Math.min(width - 160, Math.max(0, x - 60)) + 'px';
    tooltip.style.top = '4px';
  });
  hitLayer.addEventListener('mouseleave', () => {
    crosshair.style.display = 'none';
    tooltip.style.display = 'none';
  });

  container.appendChild(svg);
  container.appendChild(tooltip);

  // animated line draw-in
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  [incomeLine, expenseLine].forEach((lineEl, i) => {
    if (reduceMotion) return;
    const length = lineEl.getTotalLength();
    lineEl.style.transition = 'none';
    lineEl.style.strokeDasharray = length;
    lineEl.style.strokeDashoffset = length;
    lineEl.getBoundingClientRect(); // force reflow
    requestAnimationFrame(() => {
      lineEl.style.transition = `stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1) ${i * 0.12}s`;
      lineEl.style.strokeDashoffset = 0;
    });
  });
}

/**
 * Horizontal ranked bar chart: gastos por categoría, cada barra usa el color de su categoría.
 */
function renderBarChart(container, items) {
  container.innerHTML = '';
  if (!items.length) {
    container.innerHTML = '<p class="chart-empty">Sin gastos registrados este mes.</p>';
    return;
  }
  const width = container.clientWidth || 560;
  const rowH = 32;
  const padding = { top: 8, right: 56, bottom: 8, left: 130 };
  const height = padding.top + padding.bottom + items.length * rowH;
  const innerW = width - padding.left - padding.right;
  const maxVal = Math.max(...items.map(i => i.amount));

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, class: 'chart-svg' });

  const bars = [];
  items.forEach((item, i) => {
    const y = padding.top + i * rowH;
    const barW = Math.max(2, innerW * item.amount / maxVal);
    const barH = 20;
    const barY = y + (rowH - barH) / 2;
    const color = item.color || 'var(--series-1)';

    const label = svgEl('text', {
      x: padding.left - 10, y: y + rowH / 2 + 4, class: 'chart-catlabel', 'text-anchor': 'end'
    });
    label.textContent = `${item.emoji ? item.emoji + ' ' : ''}${item.category}`;
    svg.appendChild(label);

    const bar = svgEl('rect', {
      x: padding.left, y: barY, width: 0, height: barH, rx: 4,
      class: 'chart-bar', fill: color
    });
    svg.appendChild(bar);
    bars.push([bar, barW]);

    const valueLabel = svgEl('text', {
      x: padding.left + barW + 8, y: y + rowH / 2 + 4, class: 'chart-value'
    });
    valueLabel.textContent = formatCompact(item.amount);
    svg.appendChild(valueLabel);
  });

  container.appendChild(svg);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  requestAnimationFrame(() => {
    bars.forEach(([bar, barW], i) => {
      if (reduceMotion) { bar.setAttribute('width', barW); return; }
      bar.style.transition = `width .7s cubic-bezier(.22,1,.36,1) ${i * 0.05}s`;
      bar.setAttribute('width', barW);
    });
  });
}

/**
 * Meter: progress fill (accent) over track (lighter step of same ramp).
 */
function renderMeter(container, current, target) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  container.innerHTML = `
    <div class="meter-track">
      <div class="meter-fill" style="width:${pct}%"></div>
    </div>
    <div class="meter-labels">
      <span>${formatCurrency(current)}</span>
      <span class="muted">${pct.toFixed(0)}% de ${formatCurrency(target)}</span>
    </div>
  `;
}
