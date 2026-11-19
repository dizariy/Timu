export const DOT_CHART_GEOMETRY = Object.freeze({
  width: 560, height: 202, left: 8, right: 507, top: 16, bottom: 170,
});
export const CHART_PERIODS = Object.freeze(['1M', '3M', '1Y', 'ALL']);
const MAX_COLUMNS = 72;
const ROWS = 21;
const DOT_RADIUS = 1.75;
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const shortDate = new Intl.DateTimeFormat('ru-RU', {day:'numeric', month:'short', timeZone:'UTC'});
const valueFormat = new Intl.NumberFormat('ru-RU', {maximumFractionDigits:2});
const defaultDate = date => shortDate.format(new Date(date + 'T12:00:00Z'));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const {width, height, left, right, top, bottom} = DOT_CHART_GEOMETRY;
const plotHeight = bottom - top;

function dotColor(fraction) {
  const dark = [21, 13, 83];
  const violet = [165, 101, 255];
  const yellow = [255, 234, 0];
  const [from, to] = fraction <= .5 ? [dark, violet] : [violet, yellow];
  const progress = fraction <= .5 ? fraction * 2 : (fraction - .5) * 2;
  return '#' + from.map((value, index) =>
    Math.round(value + (to[index] - value) * progress).toString(16).padStart(2, '0'),
  ).join('');
}

function sampledIndices(count, lowIndex, highIndex) {
  const columns = Math.min(count, MAX_COLUMNS);
  if (count <= columns) return Array.from({length: count}, (_, index) => index);
  const indices = Array.from({length: columns}, (_, i) => Math.round(i * (count - 1) / (columns - 1)));
  const required = new Set([0, count - 1, lowIndex, highIndex]);
  for (const index of required) {
    if (indices.includes(index)) continue;
    // Keep both ends and the actual extrema even when a regular sample misses them.
    let nearest = -1;
    for (let i = 1; i < columns - 1; i++) {
      if (required.has(indices[i])) continue;
      if (nearest === -1 || Math.abs(indices[i] - index) < Math.abs(indices[nearest] - index)) nearest = i;
    }
    if (nearest !== -1) indices[nearest] = index;
  }
  return indices.sort((a, b) => a - b);
}

export function buildDotChartModel(points) {
  if (!Array.isArray(points) || !points.length) return null;
  let lowIndex = 0, highIndex = 0;
  for (const [index, point] of points.entries()) {
    if (!Number.isFinite(point.close)) throw new TypeError('Chart observations must have finite closing values.');
    if (point.close < points[lowIndex].close) lowIndex = index;
    if (point.close > points[highIndex].close) highIndex = index;
  }
  const low = points[lowIndex].close, high = points[highIndex].close;
  const pad = Math.max((high - low) * .15, Math.abs(high) * .005, .01);
  const min = low - pad, max = high + pad;
  const indices = sampledIndices(points.length, lowIndex, highIndex);
  const rowHeight = plotHeight / (ROWS - 1);
  const rowForValue = value => clamp(Math.round((value - min) / (max - min) * (ROWS - 1)), 0, ROWS - 1);
  const topRow = Math.max(1, rowForValue(high));
  const middleRow = Math.max(1, Math.round(topRow / 2));
  const rowColors = Array.from({length: ROWS}, (_, row) => {
    if (row >= topRow) return dotColor(1);
    const fraction = row <= middleRow ? row / middleRow * .5 : .5 + (row - middleRow) / (topRow - middleRow) * .5;
    return dotColor(fraction);
  });
  const columns = indices.map((index, slot) => {
    const {date, close} = points[index];
    const highestRow = rowForValue(close);
    const x = left + (indices.length === 1 ? .5 : slot / (indices.length - 1)) * (right - left);
    const dots = Array.from({length: highestRow + 1}, (_, row) => ({
      y: bottom - row * rowHeight, color: rowColors[row],
    }));
    return {index, x, y: dots.at(-1).y, date, close, dots};
  });
  return {
    min, max, columns, count: points.length, shown: columns.length,
    dotCount: columns.reduce((count, column) => count + column.dots.length, 0),
  };
}

function indexAtX(model, x) {
  const columns = model.columns;
  const position = clamp((x - left) / (right - left), 0, 1) * (columns.length - 1);
  const slot = Math.floor(position);
  const first = columns[slot].index;
  const next = columns[slot + 1]?.index ?? first;
  return Math.round(first + (next - first) * (position - slot));
}

function xAtIndex(model, index) {
  const columns = model.columns;
  const next = columns.findIndex(column => column.index >= index);
  if (next <= 0) return next === 0 ? columns[0].x : columns.at(-1).x;
  const before = columns[next - 1], after = columns[next];
  return before.x + (after.x - before.x) * (index - before.index) / (after.index - before.index);
}

export function renderDotChart(points, {
  formatDate = defaultDate, formatValue = value => valueFormat.format(value), model = buildDotChartModel(points),
  wheelEnabled = true,
} = {}) {
  if (!model) return '<svg id="price-chart" class="dot-price-chart" viewBox="0 0 560 202" role="img" aria-label="Нет наблюдений"></svg>';
  const first = points[0], last = points.at(-1);
  const interaction = wheelEnabled ? 'Стрелки показывают значения, колёсико меняет период.' : 'Стрелки показывают значения.';
  const description = `Точечный график: ${formatDate(first.date,true)} — ${formatDate(last.date,true)}. ${model.count} наблюдений. ${interaction}`;
  const detail = model.shown < model.count
    ? `Видно ${model.shown} из ${model.count} наблюдений. Показаны начало, конец и экстремумы. При наведении и с клавиатуры доступны все значения.`
    : 'Каждая колонка соответствует наблюдению. Точная цена доступна при наведении и с клавиатуры.';
  const grid = Array.from({length: 5}, (_, index) => {
    const fraction = index / 4;
    const y = top + fraction * plotHeight;
    const price = escape(formatValue(model.max - fraction * (model.max - model.min)));
    return `<line class="dot-grid" x1="${left}" x2="${right}" y1="${y}" y2="${y}"/><text x="${right + 7}" y="${y + 3}">${price}</text>`;
  }).join('');
  const columns = model.columns.map(column => `<g class="dot-column" data-observation="${column.index}">${column.dots.map(dot =>
    `<circle cx="${column.x.toFixed(2)}" cy="${dot.y.toFixed(2)}" r="${DOT_RADIUS}" fill="${dot.color}"/>`,
  ).join('')}</g>`).join('');
  const timeTicks = model.columns.length <= 4
    ? model.columns.map(column => column.x)
    : Array.from({length: 5}, (_, index) => left + (right - left) * index / 4);
  const dates = timeTicks.map((x, index) => {
    const align = index === 0 ? 'start' : index === timeTicks.length - 1 ? 'end' : 'middle';
    return `<text text-anchor="${align}" x="${x}" y="197">${escape(formatDate(points[indexAtX(model, x)].date))}</text>`;
  }).join('');
  return `<svg id="price-chart" class="dot-price-chart" viewBox="0 0 ${width} ${height}" role="img" tabindex="0" aria-label="${escape(description)}" aria-describedby="chart-tooltip" aria-keyshortcuts="ArrowLeft ArrowRight Home End" data-observations="${model.count}" data-visible-observations="${model.shown}"><title>${escape(description)}</title><desc>${escape(detail)}</desc>${grid}<g class="dot-columns">${columns}</g><line id="chart-marker" class="dot-marker" x1="${left}" x2="${left}" y1="12" y2="177" opacity="0"/>${dates}</svg>`;
}

export function bindDotChartInspection(svg, {points, model, onInspect, onReset}) {
  if (!svg || !model) return;
  const marker = svg.querySelector('#chart-marker');
  let selectedIndex = points.length - 1, shownIndex = -1;
  function inspect(index) {
    if (shownIndex === index) return;
    shownIndex = index;
    const x = xAtIndex(model, index);
    marker.setAttribute('x1', String(x));
    marker.setAttribute('x2', String(x));
    marker.setAttribute('opacity', '1');
    onInspect(points[index]);
  }
  function reset() {
    shownIndex = -1;
    marker.setAttribute('opacity', '0');
    onReset();
  }
  function inspectPointer(event) {
    const rect = svg.getBoundingClientRect();
    if (rect.width) inspect(indexAtX(model, (event.clientX - rect.left) / rect.width * width));
  }
  svg.addEventListener('pointermove', inspectPointer, {passive: true});
  svg.addEventListener('pointerdown', event => {
    svg.classList.add('pointer-inspection');
    inspectPointer(event);
  }, {passive: true});
  function keyboardFocused() {
    return svg.matches(':focus-visible:not(.pointer-inspection)');
  }
  svg.addEventListener('pointerleave', () => {
    if (keyboardFocused()) inspect(selectedIndex);
    else reset();
  });
  svg.addEventListener('focus', () => {
    if (keyboardFocused()) inspect(selectedIndex);
  });
  svg.addEventListener('keydown', event => {
    svg.classList.remove('pointer-inspection');
    if (event.key === 'ArrowLeft') selectedIndex = Math.max(0, selectedIndex - 1);
    else if (event.key === 'ArrowRight') selectedIndex = Math.min(points.length - 1, selectedIndex + 1);
    else if (event.key === 'Home') selectedIndex = 0;
    else if (event.key === 'End') selectedIndex = points.length - 1;
    else return;
    event.preventDefault();
    inspect(selectedIndex);
  });
  svg.addEventListener('blur', () => {
    svg.classList.remove('pointer-inspection');
    reset();
  });
}

export function bindChartPeriodWheel(container, onStep, {canHandle = () => true} = {}) {
  let lastEvent = -Infinity, lastStep = -Infinity, accumulated = 0;
  container.addEventListener('wheel', event => {
    if (!event.target.closest('.chart-wrap') || event.ctrlKey || event.metaKey ||
        !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !canHandle()) return;
    event.preventDefault();
    const moment = event.timeStamp;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1);
    if (moment - lastEvent > 100 || Math.sign(delta) !== Math.sign(accumulated)) accumulated = 0;
    lastEvent = moment;
    if (moment - lastStep < 220) return;
    accumulated += delta;
    if (Math.abs(accumulated) < 32) return;
    onStep(Math.sign(accumulated));
    lastStep = moment;
    accumulated = 0;
  }, {passive: false});
}
