const fs = require('fs');
const path = require('path');
const dir = __dirname;
const assets = path.join(dir, '../dist/assets');
const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const curated = JSON.parse(fs.readFileSync(path.join(assets, 'companies.json'), 'utf8')).slice(0, 20);
const secURL = 'https://www.sec.gov/files/company_tickers_exchange.json';
const moexURL = 'https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json';
const nasdaqURL = 'https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt';
const otherURL = 'https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt';
function directory(file) {
  const rows = fs.readFileSync(path.join(dir, file), 'utf8').trim().split(/\r?\n/);
  const headers = rows.shift().split('|');
  return rows.filter(r => !r.startsWith('File Creation')).map(r => Object.fromEntries(r.split('|').map((v, i) => [headers[i], v])));
}
const securities = [...directory('nasdaqlisted.txt').map(r => ({ ...r, symbol: r.Symbol, exchange: 'NASDAQ', source: nasdaqURL })),
  ...directory('otherlisted.txt').map(r => ({ ...r, symbol: r['ACT Symbol'], exchange: ({ N: 'NYSE', A: 'NYSE AMERICAN', P: 'NYSE ARCA', Z: 'CBOE', V: 'IEX', F: 'TXSE' })[r.Exchange] || r.Exchange, source: otherURL }))];
const nonStock = /\b(warrants?|rights?|units?|notes?|bonds?|preferred|preference|debentures?|ETFs?|ETNs?|ADW|ZONES|STRATS|fund|trust units|capital trust|fixed.income|Ctf Fltg Rate|depositary shares representing)\b|\d+(?:\.\d+)?%/i;
const normTicker = s => s.replace(/[-\/]/g, '.');
const eligible = securities.filter(r => r['Test Issue'] === 'N' && r.ETF === 'N' && r.symbol !== 'TVE' && !nonStock.test(r['Security Name']));
const byTicker = new Map(eligible.map(r => [normTicker(r.symbol), r]));
const prior = new Map(curated.map(r => [r.symbol, r]));
let companies = read('sec-exchanges.json').data.filter(r => ['Nasdaq', 'NYSE', 'CBOE'].includes(r[3]) && byTicker.has(normTicker(r[2]))).map(r => {
  const listing = byTicker.get(normTicker(r[2]));
  const old = prior.get(r[2]);
  return { id: r[2], symbol: r[2], name: old?.name || r[1], legalName: r[1], securityName: listing['Security Name'], exchange: listing.exchange, market: 'US', currency: 'USD', cik: r[0], logo: old?.logo || null, colors: old?.colors || ['#E67B32', '#F2B572'], source: secURL, listingSource: listing.source, ...(old?.slug ? { slug: old.slug } : {}), ...(old?.brandReference ? { brandReference: old.brandReference } : {}) };
});
const moex = read('moex-tqbr.json').securities;
const ru = moex.data.filter(r => r[6] === 'A' && ['1', '2', 'D'].includes(r[7])).map(r => ({ id: 'MOEX:' + r[0], symbol: r[0], name: r[1], legalName: r[2], exchange: 'MOEX', market: 'RU', currency: r[4] === 'SUR' ? 'RUB' : r[4], isin: r[3], board: 'TQBR', securityType: ({ '1': 'common_share', '2': 'preferred_share', D: 'depositary_receipt' })[r[7]], logo: null, colors: ['#E67B32', '#F2B572'], source: moexURL }));
companies.push(...ru);
const unique = new Map(companies.map(c => [c.id, c]));
companies = [...curated.map(c => unique.get(c.symbol)).filter(Boolean), ...companies.filter(c => !prior.has(c.id)).sort((a, b) => a.market.localeCompare(b.market) || a.name.localeCompare(b.name))];

// Candidate names were matched against SEC issuer names, then manually reviewed
// against the icon metadata's brand website. Ambiguous homonyms are excluded.
const excluded = new Set('allegro bentley bitcoin charles cts dolphin element falcon fathom flower flutter genius globus griddotai here icon indigo inspire keystone kirby launchpad livewire lucid matrix mitsubishi monster motorola neptune norwegian oreilly obsidian octave orange origin paramountplus pelican powers quasar revolut rocket root socket solana spectrum spring spring_creators stellar stryker sui sunrise twenty velocity virgin vitess wise'.split(' '));
const only = { circle: ['CRCL'], cocacola: ['KO'], barclays: ['BCS'], deutschebank: ['DB'], goldmansachs: ['GS'], hilton: ['HLT'], intuit: ['INTU'], marriott: ['MAR'], planet: ['PL'], progress: ['PRGS'], robinhood: ['HOOD'], target: ['TGT'] };
const currentIcons = read('simple-icons-data.json');
const oldIcons = read('simple-icons-v11-data.json').icons;
const iconBySlug = new Map(currentIcons.map(i => [i.slug, i]));
const matches = [];
for (const candidate of read('logo-candidates.json')) {
  if (excluded.has(candidate.slug) || candidate.slug === 'ferrari') continue;
  for (const m of candidate.matches) {
    if (only[candidate.slug] && !only[candidate.slug].includes(m.symbol)) continue;
    if (unique.has(m.symbol)) matches.push({ id: m.symbol, slug: candidate.slug, meta: iconBySlug.get(candidate.slug), version: '16.34.0' });
  }
}
for (const [id, slug, title] of [['MSFT', 'microsoft', 'Microsoft'], ['AMZN', 'amazon', 'Amazon'], ['ADBE', 'adobe', 'Adobe'], ['ORCL', 'oracle', 'Oracle'], ['CRM', 'salesforce', 'Salesforce']]) {
  matches.push({ id, slug, version: '11.15.0', meta: oldIcons.find(x => x.title === title) });
}
for (const [id, slug] of [['META', 'meta'], ['AMD', 'amd'], ['GOOG', 'google'], ['GOOGL', 'google'], ['UBER', 'uber'], ['MOEX:AFLT', 'aeroflot'], ['MOEX:VKCO', 'vk']]) {
  matches.push({ id, slug, version: '16.34.0', meta: iconBySlug.get(slug) });
}
const mix = (hex, amount) => '#' + hex.replace('#', '').match(/../g).map(v => Math.round(parseInt(v, 16) * (1 - amount) + 255 * amount).toString(16).padStart(2, '0')).join('');
async function main() {
  let queue = [...new Map(matches.filter(m => m.meta && unique.has(m.id)).map(m => [m.id, m])).values()];
  let completed = [];
  const downloads = new Map();
  async function download(m) {
    const key = m.version + ':' + m.slug;
    if (!downloads.has(key)) downloads.set(key, (async () => {
      const u = `https://cdn.jsdelivr.net/npm/simple-icons@${m.version}/icons/${m.slug}.svg`;
      const local = path.join(assets, 'logos', m.slug + '.svg');
      if (fs.existsSync(local)) return u;
      const res = await fetch(u, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return null;
      let svg = await res.text();
      if (!svg.startsWith('<svg') || /<script|<image|foreignObject/.test(svg)) return null;
      if (m.slug === 'meta') svg = svg.replace('<path ', '<path fill="#15a8f5" ');
      fs.writeFileSync(path.join(assets, 'logos', m.slug + '.svg'), svg);
      return u;
    })().catch(() => null));
    return downloads.get(key);
  }
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const m = queue.shift(), c = unique.get(m.id);
      const u = await download(m);
      if (!u) continue;
      c.logo = `assets/logos/${m.slug}.svg`;
      c.slug = m.slug;
      c.logoSource = u;
      c.brandReference = { title: m.meta.title, source: m.meta.source, ...(m.meta.guidelines ? { guidelines: m.meta.guidelines } : {}), ...(m.meta.license ? { license: m.meta.license } : {}), packageVersion: m.version };
      if (!prior.has(c.id)) c.colors = ['#' + m.meta.hex, mix(m.meta.hex, 0.35)];
      completed.push({ id: c.id, name: c.legalName, icon: m.meta.title, slug: m.slug, brandSource: m.meta.source, asset: u });
    }
  }));
  const coreIds = [...curated.map(c => c.symbol), 'MOEX:SBER', 'MOEX:SBERP', 'MOEX:GAZP', 'MOEX:LKOH', 'MOEX:YDEX', 'MOEX:T', 'MOEX:ROSN', 'MOEX:GMKN', 'MOEX:OZON', 'MOEX:AFLT', 'MOEX:VKCO', 'MOEX:MOEX'];
  const core = coreIds.map(id => unique.get(id)).filter(Boolean);
  const counts = {};
  companies.forEach(c => counts[c.exchange] = (counts[c.exchange] || 0) + 1);
  const withLogo = companies.filter(c => c.logo).length;
  const meta = { asOf: '2026-10-06', source: 'SEC EDGAR + Nasdaq Trader symbol directories + Moscow Exchange ISS', sources: [secURL, nasdaqURL, otherURL, moexURL], totalCompanies: companies.length, totalListings: companies.length, usListings: companies.filter(c => c.market === 'US').length, moexListings: ru.length, uniqueUsIssuers: new Set(companies.filter(c => c.market === 'US').map(c => c.cik)).size, withLogo, withoutLogo: companies.length - withLogo, exchanges: counts, coreCount: core.length, nasdaqFileCreation: '1005202621:31', scope: 'US exchange-listed common/ordinary/ADR equity listings present in both SEC and Nasdaq directories, plus active MOEX TQBR common/preferred shares and depositary receipts. Not a worldwide universe; multiple share classes can represent one issuer.', logoPackages: ['simple-icons@16.34.0', 'simple-icons@11.15.0'], fallback: 'orange timu mark' };
  fs.writeFileSync(path.join(assets, 'companies.json'), JSON.stringify(companies));
  fs.writeFileSync(path.join(assets, 'companies-core.json'), JSON.stringify(core));
  fs.writeFileSync(path.join(assets, 'catalog-meta.json'), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(dir, 'logo-mappings.json'), JSON.stringify(completed, null, 2));
  const fields = ['id','symbol','name','legalName','exchange','market','currency','cik','isin','securityType','logo','source'];
  const csv = [fields, ...companies.map(c => fields.map(k => c[k] ?? ''))].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  fs.writeFileSync(path.join(dir, 'company-dataset.csv'), '\uFEFF' + csv);
  console.log(JSON.stringify(meta, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
