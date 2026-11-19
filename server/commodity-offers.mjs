import fs from 'node:fs/promises';
import {belarusBullionProviders} from './bullion-by.mjs';
import {russianBullionProviders} from './bullion-ru.mjs';

const store = new URL('../dist/data/commodity-offers-cache.json', import.meta.url);
const marketProviders = [['BY', belarusBullionProviders], ['RU', russianBullionProviders]];
const expiry = 20 * 60 * 1000;
const currencies = {BY:'BYN', RU:'RUB'};
const bullionMetals = new Set(['XAU', 'XAG', 'XPT', 'XPD']);

async function loadSaved() {
  try {
    return JSON.parse(await fs.readFile(store, 'utf8'));
  } catch {
    return {};
  }
}

export function validatedOffers(parsed) {
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(parsed.asOf) ? parsed.asOf : null;
  const offers = [];
  for (const candidate of parsed.offers ?? []) {
    const {symbol, grams, price} = candidate;
    if (!bullionMetals.has(symbol) || !Number.isFinite(grams) || grams <= 0 ||
        !Number.isFinite(price) || price <= 0) continue;
    const purity = Number(candidate.purity);
    const hasPurity = Number.isFinite(purity) && purity > 0 && purity <= 1000;
    offers.push({
      symbol, grams, price, purity: hasPurity ? purity : null,
      city: String(candidate.city ?? ''),
      terms: Array.isArray(candidate.terms) ? candidate.terms.join(' ') : String(candidate.terms ?? ''),
      updatedAt: candidate.updatedAt || null,
      conditional: Boolean(candidate.conditional) || !asOf || !hasPurity,
    });
  }
  if (!offers.length) throw Error('Нет проверяемых цен слитков');
  return {asOf, offers};
}

async function retrieve(source) {
  const response = await fetch(source.url, {
    signal: AbortSignal.timeout(9_000),
    headers: {Accept:'text/html', 'User-Agent':'timu-local/0.7'},
  });
  if (!response.ok) throw Error('HTTP ' + response.status);
  const html = await response.text();
  if (html.length > 4_500_000) throw Error('Большой ответ источника');
  return validatedOffers(source.parse(html));
}

let saved;
let inflight;
let lastAttempt = 0;
let latest;

async function collect() {
  saved ??= await loadSaved();
  const rows = marketProviders.flatMap(([market, providers]) => providers.map(source => ({market, source})));
  const checkedAt = new Date().toISOString();
  const sources = await Promise.all(rows.map(async ({market, source}) => {
    const info = {id:source.id, name:source.name, url:source.url, symbols:source.symbols, market, currency:currencies[market]};
    try {
      const result = await retrieve(source);
      const entry = {...result, checkedAt};
      saved[source.id] = entry;
      return {...info, ...entry, status:'ok'};
    } catch {
      const fallback = saved[source.id];
      return {...info, ...(fallback ?? {offers:[]}), status:fallback?'cached':'unavailable'};
    }
  }));
  if (sources.some(source => source.status === 'ok')) {
    await fs.writeFile(store, JSON.stringify(saved)).catch(() => {});
  }
  return {checkedAt, sources};
}

export async function getCommodityOffers() {
  if (inflight) return inflight;
  if (latest && Date.now() - lastAttempt < expiry) return latest;
  lastAttempt = Date.now();
  inflight = collect().then(result => { latest = result; return result; }).finally(() => { inflight = null; });
  return inflight;
}
