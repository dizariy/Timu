/** Price-history utilities. Returns are fractions; no predictive estimates are made. */
const DAY = 86_400_000;
const MAX_ROWS = 10_000;

function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Дата должна быть в формате YYYY-MM-DD.');
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error(`Некорректная дата: ${value}.`);
  }
  return timestamp;
}

function normalizePoints(points, minimum = 1) {
  if (!Array.isArray(points) || points.length < minimum) {
    throw new Error(`Нужно не менее ${minimum} ценовых наблюдений.`);
  }
  if (points.length > MAX_ROWS) throw new Error(`Допускается не более ${MAX_ROWS} строк.`);
  const seen = new Set();
  const normalized = points.map((point) => {
    if (!point || typeof point !== 'object') throw new Error('Некорректная ценовая запись.');
    dateValue(point.date);
    if (seen.has(point.date)) throw new Error(`Повтор даты: ${point.date}.`);
    seen.add(point.date);
    if (typeof point.close !== 'number' || !Number.isFinite(point.close) || point.close <= 0) {
      throw new Error(`Цена на ${point.date} должна быть положительным числом.`);
    }
    return { date: point.date, close: point.close };
  });
  return normalized.sort((a, b) => a.date.localeCompare(b.date));
}

// Small RFC 4180-style reader: escaped quotes, CRLF, and quoted fields supported.
function readCSV(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('CSV-файл пуст.');
  const source = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false, afterQuote = false;
  const commitField = () => { row.push(field.trim()); field = ''; afterQuote = false; };
  const commitRow = () => {
    commitField();
    if (row.some((cell) => cell !== '')) rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS + 1) throw new Error(`Допускается не более ${MAX_ROWS} строк.`);
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; afterQuote = true; }
      else field += char;
    } else if (char === ',' ) {
      commitField();
    } else if (char === '\n' || char === '\r') {
      commitRow();
      if (char === '\r' && source[i + 1] === '\n') i++;
    } else if (char === '"') {
      if (field.trim() !== '' || afterQuote) throw new Error('Некорректные кавычки в CSV.');
      field = ''; quoted = true;
    } else if (afterQuote) {
      if (!/\s/.test(char)) throw new Error('Лишние символы после кавычек в CSV.');
    } else field += char;
  }
  if (quoted) throw new Error('В CSV не закрыты кавычки.');
  if (field !== '' || row.length || afterQuote) commitRow();
  return rows;
}

/** Parse comma-separated date + adjusted_close (preferred) or close columns. */
export function parsePriceCSV(text) {
  const rows = readCSV(text);
  if (rows.length < 2) throw new Error('CSV должен содержать заголовок и ценовые записи.');
  const headers = rows[0].map((header) => header.toLowerCase().trim().replace(/[\s-]+/g, '_'));
  if (new Set(headers).size !== headers.length) throw new Error('Названия колонок CSV повторяются.');
  const dateColumn = headers.indexOf('date');
  const adjustedColumn = headers.indexOf('adjusted_close');
  const closeColumn = adjustedColumn >= 0 ? adjustedColumn : headers.indexOf('close');
  if (dateColumn < 0 || closeColumn < 0) {
    throw new Error('Нужны колонки date и adjusted_close или close.');
  }
  const points = rows.slice(1).map((row, index) => {
    if (row.length !== headers.length) throw new Error(`В строке ${index + 2} неверное число колонок.`);
    const rawPrice = row[closeColumn];
    // Number() alone also accepts hexadecimal and blank input; CSV prices do not.
    if (!/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(rawPrice)) {
      throw new Error(`В строке ${index + 2} некорректная цена.`);
    }
    return { date: row[dateColumn], close: Number(rawPrice) };
  });
  return { points: normalizePoints(points), adjusted: adjustedColumn >= 0 };
}

/** Historical, descriptive metrics only. observations counts successive returns. */
export function calculateMetrics(points) {
  const sorted = normalizePoints(points, 2);
  let peak = sorted[0].close, maxDrawdown = 0;
  let bestDay = -Infinity, worstDay = Infinity, positiveDays = 0;
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i].close;
    const change = current / sorted[i - 1].close - 1;
    if (!Number.isFinite(change)) throw new Error('Цены имеют слишком большой числовой диапазон.');
    bestDay = Math.max(bestDay, change);
    worstDay = Math.min(worstDay, change);
    if (change > 0) positiveDays++;
    peak = Math.max(peak, current);
    maxDrawdown = Math.min(maxDrawdown, current / peak - 1);
  }
  const totalReturn = sorted.at(-1).close / sorted[0].close - 1;
  if (!Number.isFinite(totalReturn)) throw new Error('Цены имеют слишком большой числовой диапазон.');
  return {
    totalReturn, maxDrawdown, bestDay, worstDay,
    upShare: positiveDays / (sorted.length - 1),
    observations: sorted.length - 1,
  };
}

/** Synthetic indexed data (starts at 100); never represents real quotations. */
export function createDemoSeries(symbol) {
  if (typeof symbol !== 'string' || !symbol.trim()) throw new Error('Укажите тикер компании.');
  let seed = 2166136261;
  for (const char of symbol.trim().toUpperCase()) {
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  const random = () => {
    seed += 0x6D2B79F5;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const dates = [];
  for (let stamp = Date.UTC(2026, 9, 2); dates.length < 260; stamp -= DAY) {
    const day = new Date(stamp).getUTCDay();
    if (day !== 0 && day !== 6) dates.push(new Date(stamp).toISOString().slice(0, 10));
  }
  dates.reverse();
  let value = 100;
  const phase = random() * Math.PI * 2;
  return dates.map((date, index) => {
    if (index) {
      const noise = (random() + random() + random() - 1.5) * 0.018;
      const cycle = Math.sin(index / 19 + phase) * 0.0014;
      value *= Math.exp(0.00025 + cycle + noise);
    }
    return { date, close: Math.round(value * 10_000) / 10_000 };
  });
}

/** Calendar periods are anchored to the last available record, not today's date. */
export function selectPeriod(points, period) {
  const sorted = normalizePoints(points);
  if (!['1M', '3M', '1Y', 'ALL'].includes(period)) throw new Error('Неизвестный период.');
  if (period === 'ALL') return sorted;
  const last = new Date(dateValue(sorted.at(-1).date));
  const months = period === '1M' ? 1 : period === '3M' ? 3 : 12;
  const cutoff = new Date(last);
  // Clamp a 29/30/31st to the last day of the target calendar month.
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const endOfMonth = new Date(cutoff);
  endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1, 0);
  cutoff.setUTCDate(Math.min(last.getUTCDate(), endOfMonth.getUTCDate()));
  const lowerBound = cutoff.toISOString().slice(0, 10);
  return sorted.filter((point) => point.date >= lowerBound);
}
