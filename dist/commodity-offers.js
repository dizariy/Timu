const marketInfo = {
  BY: {name:'Беларусь', currency:'BYN', zone:'Europe/Minsk'},
  RU: {name:'Россия', currency:'RUB', zone:'Europe/Moscow'},
};
const bullion = new Set(['XAU', 'XAG', 'XPT', 'XPD']);
const industrialMetals = new Set(['WB_COPPER', 'WB_ALUMINUM', 'WB_NICKEL', 'WB_ZINC']);
const quoteFreshnessMs = 30 * 60_000;
const clientCacheMs = 10 * 60_000;
const dayMs = 86_400_000;
const panelState = new WeakMap();
const priceFormat = new Intl.NumberFormat('ru-RU', {maximumFractionDigits:2});
const smallNumberFormat = new Intl.NumberFormat('ru-RU', {maximumFractionDigits:4});
const calendarFormat = new Intl.DateTimeFormat('ru-RU', {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'});
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
}[character]));

function safeURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function calendarTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const parsed = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0,10) === value ? parsed : NaN;
}

function localDay(stamp, zone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:zone, year:'numeric', month:'2-digit', day:'2-digit',
  }).formatToParts(stamp);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function marketKeys(market) {
  return marketInfo[market] ? [market] : ['BY', 'RU'];
}

function classifyQuote(provider, offer, region, now, date) {
  if (provider.status === 'cached') return 'Сохранённая цена';
  const quoteDay = calendarTimestamp(provider.asOf);
  if (!Number.isFinite(quoteDay)) return 'Дата цены не указана';
  const age = date - quoteDay;
  const elapsed = now - Date.parse(provider.checkedAt);
  if (provider.status !== 'ok' || age < 0 || age > dayMs || !Number.isFinite(elapsed) ||
      elapsed < -60_000 || elapsed > quoteFreshnessMs) return 'Дата цены требует проверки';
  if (offer.purity === null) return 'Проба не указана';
  if (!provider.url || !offer.terms.trim() || offer.conditional !== false) return 'Условия влияют на итог';
  if (offer.updatedAt && (!Number.isFinite(Date.parse(offer.updatedAt)) ||
      calendarTimestamp(localDay(new Date(offer.updatedAt), region.zone)) !== quoteDay)) {
    return 'Дата цены требует проверки';
  }
  return null;
}

/** Compare a bar only with offers in the same market, weight, currency and fineness. */
export function groupCommodityOffers(data, {symbol, market, grams = null, now = Date.now()} = {}) {
  const fetchedSources = Array.isArray(data?.sources) ? data.sources : [];
  return marketKeys(market).map(key => {
    const region = marketInfo[key];
    const today = calendarTimestamp(localDay(new Date(now), region.zone));
    const rows = [];
    const sources = fetchedSources.filter(source => source?.market === key && source.currency === region.currency);
    for (const source of sources) {
      if (typeof source.id !== 'string' || typeof source.name !== 'string' || !Array.isArray(source.offers)) continue;
      const provider = {...source, url:safeURL(source.url)};
      for (const raw of source.offers) {
        if (raw?.symbol !== symbol || !Number.isFinite(raw.grams) || raw.grams <= 0 ||
            !Number.isFinite(raw.price) || raw.price <= 0) continue;
        const purity = Number.isFinite(raw.purity) && raw.purity > 0 && raw.purity <= 1000 ? raw.purity : null;
        const offer = {...raw, purity, terms:String(raw.terms ?? ''), provider};
        rows.push({...offer, note:classifyQuote(provider, offer, region, now, today)});
      }
    }
    const weights = [...new Set(rows.map(row => row.grams))].sort((a,b) => a-b);
    const relevant = grams === null ? rows : rows.filter(row => row.grams === grams);
    const comparable = new Map();
    for (const row of relevant) {
      if (row.note) continue;
      const groupKey = `${row.grams}:${row.purity}`;
      if (!comparable.has(groupKey)) comparable.set(groupKey, []);
      comparable.get(groupKey).push(row);
    }
    const comparisons = [...comparable.values()]
      .filter(group => new Set(group.map(row => row.provider.id)).size >= 2)
      .map(group => {
        const ordered = group.slice().sort((a,b) => a.price-b.price || a.provider.name.localeCompare(b.provider.name,'ru'));
        return {grams:ordered[0].grams, purity:ordered[0].purity, rows:ordered,
          providers:new Set(ordered.map(row => row.provider.id)).size};
      });
    const ranked = new Set(comparisons.flatMap(group => group.rows));
    const references = relevant.filter(row => !ranked.has(row))
      .sort((a,b) => a.provider.name.localeCompare(b.provider.name,'ru') || a.grams-b.grams);
    const sourceLinks = sources.filter(source => source.symbols?.includes(symbol) && !relevant.some(row => row.provider.id === source.id))
      .map(source => ({name:source.name, url:safeURL(source.url)})).filter(source => source.url);
    return {key, ...region, weights, comparisons, references, sourceLinks};
  });
}

function link(name, url) {
  return url ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(name)} <span aria-hidden="true">↗</span></a>` : escape(name);
}

function formatDate(value) {
  const day = calendarTimestamp(value);
  return Number.isFinite(day) ? calendarFormat.format(new Date(day)) : 'дата не указана';
}

function offerRow(offer, currency) {
  const {provider, price, city, purity, terms, note} = offer;
  return `<li class="purchase-offer">
    <div class="purchase-offer-top">
      <div>${link(provider.name,provider.url)}${city ? `<span class="purchase-meta">${escape(city)}</span>` : ''}</div>
      <strong class="purchase-price">${priceFormat.format(price)} <small>${currency}</small></strong>
    </div>
    <p class="purchase-meta">${smallNumberFormat.format(offer.grams)} г${purity === null ? '' : ` · проба ${smallNumberFormat.format(purity)}`} · ${formatDate(provider.asOf)}</p>
    ${note ? `<p class="purchase-condition">${escape(note)}</p>` : ''}
    ${terms ? `<p class="purchase-terms">${escape(terms)}</p>` : ''}
  </li>`;
}

function externalBullionLinks(region, symbol) {
  if (region !== 'RU') return [];
  const providers = [];
  if (['XAU','XPT','XPD'].includes(symbol)) {
    providers.push({name:'Альфа-Банк', url:'https://alfabank.ru/make-money/metall/bars/'});
  }
  if (['XAU','XAG'].includes(symbol)) {
    providers.push({name:'Россельхозбанк', url:'https://coins.rshb.ru/ingots'});
  }
  return providers;
}

function regionMarkup(region, symbol, grams) {
  const groups = region.comparisons.map(group => {
    const text = `Наименьшая опубликованная цена среди ${group.providers} поставщиков`;
    return `<div class="purchase-comparison">
      <h5>Проба ${smallNumberFormat.format(group.purity)}</h5>
      <p class="purchase-best">${text} · <strong>${priceFormat.format(group.rows[0].price)} ${region.currency}</strong></p>
      <ul class="purchase-offers">${group.rows.map(row => offerRow(row,region.currency)).join('')}</ul>
    </div>`;
  }).join('');
  const references = region.references.length
    ? `<div class="purchase-reference"><h5>Для справки</h5><ul class="purchase-offers">${region.references.map(row => offerRow(row,region.currency)).join('')}</ul></div>`
    : '';
  const otherSources = [...region.sourceLinks, ...externalBullionLinks(region.key,symbol)];
  return `<div class="purchase-region">
    <h4>${region.name} <small>${region.currency}</small></h4>
    ${groups || `<p class="purchase-note">${references ? 'Для сравнения нужны цены минимум двух поставщиков на слитки одной массы и пробы.' : `Нет подтверждённых цен продажи${grams === null ? '' : ` за ${smallNumberFormat.format(grams)} г`}.`}</p>`}
    ${references}
    ${otherSources.length ? `<p class="purchase-links"><span>Ещё источники</span> ${otherSources.map(source => link(source.name,source.url)).join(' ')}</p>` : ''}
  </div>`;
}

function industrialMarkup(item, market) {
  const metal = industrialMetals.has(item.id || item.symbol);
  const tradingVenues = marketKeys(market).map(key => {
    const marketName = marketInfo[key].name;
    const venue = key === 'RU'
      ? link('Петербургская биржа','https://spimex.com/')
      : metal ? link('Белорусская универсальная товарная биржа','https://www.butb.by/') : '';
    return `<div class="purchase-region"><h4>${marketName}</h4>${venue ? `<p class="purchase-links">${venue}</p>` : '<p class="purchase-note">Площадка с проверенными предложениями пока не подключена.</p>'}</div>`;
  }).join('');

  return `<h3>Где купить</h3>
    <p class="purchase-note">Подтверждённых сопоставимых предложений на это сырьё пока нет. Цена поставки зависит от характеристик товара, объёма партии и адреса.</p>
    ${tradingVenues}
    <p class="purchase-terms">При сравнении запросите у поставщиков одинаковую спецификацию, минимальную партию и полную стоимость с НДС, доставкой и комиссиями.</p>`;
}

let savedData = null;
let savedAt = 0;
let pendingRequest = null;

function loadOffers() {
  if (savedData && Date.now() - savedAt < clientCacheMs) return Promise.resolve(savedData);
  if (pendingRequest) return pendingRequest;
  pendingRequest = fetch('/api/commodity-offers', {
    headers:{Accept:'application/json'}, signal:AbortSignal.timeout(15_000),
  }).then(async response => {
    if (!response.ok) throw new Error('Не удалось получить предложения');
    const data = await response.json();
    if (!Array.isArray(data.sources)) throw new Error('Некорректный список источников');
    savedData = data;
    savedAt = Date.now();
    return data;
  }).finally(() => { pendingRequest = null; });
  return pendingRequest;
}

export function renderPurchaseOffers(host, {item, market}) {
  if (!host || !item) return;
  host.classList.add('purchase-panel');
  const symbol = item.id || item.symbol;
  const previous = panelState.get(host);
  const state = {grams:previous?.symbol === symbol ? previous.grams : null, symbol};
  panelState.set(host,state);
  if (!bullion.has(symbol)) {
    host.innerHTML = industrialMarkup(item,market);
    return;
  }
  host.innerHTML = '<h3>Где купить</h3><p class="purchase-note" role="status">Проверяем цены поставщиков…</p>';

  function show(data, focusSelect = false) {
    if (!host.isConnected || panelState.get(host) !== state) return;
    const list = groupCommodityOffers(data,{symbol,market});
    const weights = [...new Set(list.flatMap(region => region.weights))].sort((a,b) => a-b);
    if (!weights.includes(state.grams)) {
      const equalPriceGroups = list.flatMap(region => region.comparisons);
      state.grams = equalPriceGroups.find(group => group.grams === 5)?.grams
        ?? equalPriceGroups[0]?.grams ?? (weights.includes(5) ? 5 : weights[0] ?? null);
    }
    const regions = groupCommodityOffers(data,{symbol,market,grams:state.grams});
    host.innerHTML = `<div class="purchase-heading"><h3>Где купить</h3>
      ${weights.length ? `<label class="purchase-weight">Масса слитка
        <select>${weights.map(weight => `<option value="${weight}"${weight === state.grams ? ' selected' : ''}>${smallNumberFormat.format(weight)} г</option>`).join('')}</select>
      </label>` : ''}
    </div>
    <p class="purchase-note">Указана цена продажи за слиток. Перед покупкой уточните наличие, условия оплаты и итоговую сумму у поставщика.</p>
    ${regions.map(region => regionMarkup(region,symbol,state.grams)).join('')}`;
    const selector = host.querySelector('select');
    selector?.addEventListener('change', () => {
      state.grams = Number(selector.value);
      show(data,true);
    });
    if (focusSelect) selector?.focus();
  }

  loadOffers().then(show).catch(() => {
    if (!host.isConnected || panelState.get(host) !== state) return;
    host.innerHTML = `<h3>Где купить</h3><p class="purchase-note" role="status">Цены поставщиков пока недоступны.</p>
      ${groupCommodityOffers(null,{symbol,market}).map(region => regionMarkup(region,symbol,null)).join('')}
      <button type="button" class="purchase-retry">Проверить ещё раз</button>`;
    host.querySelector('.purchase-retry').addEventListener('click', () => renderPurchaseOffers(host,{item,market}));
  });
}
