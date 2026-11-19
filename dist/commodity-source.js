// Public documented endpoint, tested 2026-10-06 with CORS Origin headers.
// https://gold-api.com/docs and https://gold-api.com/terms
// These indicative values are not bid/ask offers. No daily change is supplied.
export const COMMODITIES = Object.freeze([
  { id: 'XAU', symbol: 'XAU', name: 'Золото', code: 'Au', color: '#B2914F' },
  { id: 'XAG', symbol: 'XAG', name: 'Серебро', code: 'Ag', color: '#84919D' },
  { id: 'XPT', symbol: 'XPT', name: 'Платина', code: 'Pt', color: '#687C81' },
  { id: 'XPD', symbol: 'XPD', name: 'Палладий', code: 'Pd', color: '#877F9B' },
  { id: 'HG', symbol: 'HG', name: 'Медь', code: 'Cu', color: '#B17555', category: 'Цветные металлы', unit: 'ед. котировки HG', unitCode: null, unitVerified: false, unitBasis: 'Единица не указана источником. Биржевой контракт CME HG котируется в USD за фунт, но Gold API не подтверждает связь своей серии с этим контрактом.', unitSourceURL: 'https://www.cmegroup.com/education/articles-and-reports/hedging-with-comex-copper-futures' },
].map(asset => Object.freeze({ category: 'Драгоценные металлы', currency: 'USD', unit: 'тр. унция', unitCode: 'ozt', unitBasis: 'Стандартная единица символов XAU/XAG/XPT/XPD; API не передаёт поле unit.', source: 'Gold API', sourceURL: 'https://gold-api.com/', ...asset, dataURL: `https://api.gold-api.com/price/${asset.symbol}` })));

// A real dated fallback; never relabel this as a successful live request.
export const COMMODITY_SNAPSHOT = Object.freeze({
  XAU: Object.freeze({ symbol: 'XAU', name: 'Золото', price: 4123.200195, currency: 'USD', unit: 'тр. унция', updatedAt: '2026-10-06T05:04:39Z', fetchedAt: '2026-10-06T05:04:59.453Z', source: 'Gold API', sourceURL: 'https://gold-api.com/', status: 'snapshot' }),
  XAG: Object.freeze({ symbol: 'XAG', name: 'Серебро', price: 60.686001, currency: 'USD', unit: 'тр. унция', updatedAt: '2026-10-06T05:04:39Z', fetchedAt: '2026-10-06T05:05:00.920Z', source: 'Gold API', sourceURL: 'https://gold-api.com/', status: 'snapshot' }),
  XPT: Object.freeze({ symbol: 'XPT', name: 'Платина', price: 1707, currency: 'USD', unit: 'тр. унция', updatedAt: '2026-10-06T05:04:42Z', fetchedAt: '2026-10-06T05:05:02.287Z', source: 'Gold API', sourceURL: 'https://gold-api.com/', status: 'snapshot' }),
  XPD: Object.freeze({ symbol: 'XPD', name: 'Палладий', price: 1188, currency: 'USD', unit: 'тр. унция', updatedAt: '2026-10-06T05:04:40Z', fetchedAt: '2026-10-06T05:05:03.626Z', source: 'Gold API', sourceURL: 'https://gold-api.com/', status: 'snapshot' }),
  HG: Object.freeze({ symbol: 'HG', name: 'Медь', price: 6.564616, currency: 'USD', unit: 'ед. котировки HG', updatedAt: '2026-10-06T05:04:41Z', fetchedAt: '2026-10-06T05:05:04.956Z', source: 'Gold API', sourceURL: 'https://gold-api.com/', status: 'snapshot' }),
});

const cache = new Map();
const MIN_CACHE_MS = 30_000;
const STALE_AFTER_MS = 15 * 60_000;

export function validateCommodityQuote(body, symbol, now = Date.now()) {
  const asset = COMMODITIES.find(item => item.symbol === symbol);
  if (!asset) throw new Error('Неизвестный металл');
  const timestamp = Date.parse(body?.updatedAt);
  if (body?.symbol !== symbol || body?.currency !== 'USD' || typeof body?.price !== 'number' || !Number.isFinite(body.price) || body.price <= 0 || !Number.isFinite(timestamp) || timestamp > now + 5 * 60_000) {
    throw new Error('Источник вернул некорректную цену или дату');
  }
  return { symbol, name: asset.name, price: body.price, currency: 'USD', unit: asset.unit, updatedAt: new Date(timestamp).toISOString(), fetchedAt: new Date(now).toISOString(), source: asset.source, sourceURL: asset.sourceURL, status: now - timestamp > STALE_AFTER_MS ? 'stale' : 'live' };
}

// The caller schedules different symbols at least 1.2 s apart and refreshes
// no more frequently than once a minute, only while the tab is visible.
export async function fetchCommodity(symbol, { signal } = {}) {
  const asset = COMMODITIES.find(item => item.symbol === symbol);
  if (!asset) throw new Error('Неизвестный металл');
  if (signal?.aborted) throw new DOMException('Запрос отменён', 'AbortError');
  const previous = cache.get(symbol);
  if (previous && Date.now() - previous.receivedAt < MIN_CACHE_MS) {
    return { ...previous.quote, status: Date.now() - Date.parse(previous.quote.updatedAt) > STALE_AFTER_MS ? 'stale' : 'live' };
  }
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new DOMException('Источник не ответил вовремя', 'TimeoutError')), 10_000);
  try {
    const response = await fetch(asset.dataURL, { signal: controller.signal, mode: 'cors', credentials: 'omit', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Источник временно недоступен (${response.status})`);
    const quote = validateCommodityQuote(await response.json(), symbol);
    cache.set(symbol, { quote, receivedAt: Date.now() });
    return { ...quote };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
