import fs from 'node:fs/promises';

const currencies = {USD: 431, EUR: 451};
const dayMs = 86_400_000;
const horizon = 7;
const lockTime = 30 * 60 * 1000;
const store = new URL('../dist/data/currency-reference-history.json', import.meta.url);
const dateKey = time => new Date(time).toISOString().slice(0, 10);

export function referenceHistory(rows, id) {
  const points = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.Cur_ID !== id || !Number.isFinite(row.Cur_OfficialRate) ||
        row.Cur_OfficialRate <= 0 || !/^\d{4}-\d{2}-\d{2}T/.test(row.Date)) continue;
    const date = row.Date.slice(0, 10);
    const parsed = Date.parse(date);
    if (Number.isFinite(parsed) && dateKey(parsed) === date) points.set(date, row.Cur_OfficialRate);
  }
  return [...points].sort(([a], [b]) => a.localeCompare(b));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
}

export function estimateReferenceMove(points, today) {
  const observed = points.filter(([date]) => date <= today);
  const asOf = observed.at(-1)?.[0];
  if (!asOf || Date.parse(today) - Date.parse(asOf) > 5 * dayMs) return null;

  // Consecutive equal fixing values are often carried forward over closed days.
  const fixings = observed.filter((point, i) => i === 0 || point[1] !== observed[i - 1][1]);
  const changes = fixings.slice(1).map((point, i) => point[1] / fixings[i][1] - 1);
  if (changes.length < 22) return null;

  const sample = changes.slice(-horizon);
  const estimatedChange = median(sample);
  const errors = changes.slice(horizon).map((actual, index) =>
    Math.abs(actual - median(changes.slice(index, index + horizon))),
  );
  return {asOf, estimatedChange, sampleSize: sample.length, medianError: median(errors), backtestSize: errors.length};
}

let history;
let loaded;
let pending;
let lastAttempt = 0;

async function loadHistory() {
  try {
    history = JSON.parse(await fs.readFile(store, 'utf8'));
  } catch {
    history = {};
  }
}

async function refreshHistory(today) {
  const since = dateKey(Date.parse(today) - 93 * dayMs);
  const replies = await Promise.allSettled(Object.entries(currencies).map(async ([code, id]) => {
    const url = `https://api.nbrb.by/exrates/rates/dynamics/${id}?startdate=${since}&enddate=${today}`;
    const response = await fetch(url, {signal: AbortSignal.timeout(6000), headers: {Accept:'application/json'}});
    if (!response.ok) throw Error('HTTP ' + response.status);
    const rows = await response.json();
    if (referenceHistory(rows, id).length < 25) throw Error('Недостаточно официальных курсов');
    return [code, rows];
  }));
  const results = replies.filter(reply => reply.status === 'fulfilled').map(reply => reply.value);
  if (results.length) {
    history = {...history, ...Object.fromEntries(results)};
    await fs.writeFile(store, JSON.stringify(history)).catch(() => {});
  }
}

export async function getCurrencyForecast(now = Date.now()) {
  const today = dateKey(now + 3 * 60 * 60 * 1000);
  await (loaded ??= loadHistory());
  if (!pending && now - lastAttempt >= lockTime) {
    lastAttempt = now;
    pending = refreshHistory(today).finally(() => {pending = null});
  }
  await pending;
  return Object.fromEntries(Object.entries(currencies).map(([code, id]) =>
    [code, estimateReferenceMove(referenceHistory(history[code], id), today)],
  ));
}
