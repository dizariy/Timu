const symbols = new Map([['золото','XAU'], ['серебро','XAG'], ['платина','XPT']]);
const agroTabs = new Map([['zoloto','XAU'], ['serebro','XAG'], ['platina','XPT']]);

function text(html) {
  return html.replace(/<!--[^]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|#160|#xA0);/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function number(value) {
  if (!/^(?:\d+|\d{1,3}(?: \d{3})+)(?:[.,]\d+)?$/.test(value)) return null;
  const result = Number(value.replace(/ /g, '').replace(',', '.'));
  return Number.isFinite(result) && result > 0 ? result : null;
}

function tableRows(table) {
  return [...table.matchAll(/<tr\b[^>]*>([^]*?)<\/tr>/gi)].map(([,row]) =>
    [...row.matchAll(/<t[hd]\b[^>]*>([^]*?)<\/t[hd]>/gi)].map(([,cell])=>text(cell)));
}

function timestamp(value, pattern) {
  const match = value.match(pattern);
  if (!match) return {asOf:null};
  const [,day,month,year,hour,minute] = match;
  const asOf = `${year}-${month}-${day}`;
  const midnight = new Date(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0,10) !== asOf) return {asOf:null};
  if (!hour || !minute || Number(hour) > 23 || Number(minute) > 59) return {asOf};
  return {asOf, updatedAt:`${asOf}T${hour}:${minute}:00+03:00`};
}

function checkedBar({symbol, mass, fineness, sale, ...detail}) {
  const grams = number(mass ?? '');
  const purity = number(fineness ?? '');
  const price = number(sale ?? '');
  if (!symbol || !grams || grams > 1000 || !price || price > 20_000_000) return null;
  if (fineness != null && (!purity || purity < 900 || purity > 1000)) return null;
  if (price / grams < 1 || price / grams > 10_000) return null;
  return {symbol, grams, purity, price, ...detail};
}

export function parseBelagroprombank(html) {
  const offers = [];
  const stamp = timestamp(text(html), /действуют с (\d{2})\.(\d{2})\.(\d{4})(?:\s+с\s+(\d{2}):(\d{2}))?/i);
  for (const [slug, symbol] of agroTabs) {
    const table = html.match(new RegExp(`data-tab=["']${slug}["'][^>]*>(?:(?!<table\\b)[^])*<table\\b[^>]*>([^]*?)<\\/table>`, 'i'))?.[1];
    if (!table) continue;
    const [header, unit, ...rows] = tableRows(table);
    if (!header || !unit || header.length !== 4 || !/^Номинал слитка \(граммы\)$/i.test(header[0]) ||
        !/^Проба$/i.test(header[1]) || !/^Цена покупки$/i.test(header[2]) || !/^Цена продажи$/i.test(header[3]) ||
        unit.length !== 1 || !/^белорусских рублей$/i.test(unit[0])) continue;
    for (const [mass,fineness,,sale] of rows.filter(row=>row.length===4)) {
      const bar = checkedBar({
        symbol, mass, fineness, sale,
        terms:'Физлица могут оплатить наличными, безналичным переводом или картой. Наличие и отделение следует уточнить.',
        updatedAt:stamp.updatedAt,
      });
      if (bar) offers.push(bar);
    }
  }
  return {...stamp, offers};
}

export function parseMtbank(html) {
  const section = html.match(/<span\b[^>]*class=["'][^"']*\bpricing__title\b[^"']*["'][^>]*>\s*Золото\s*<\/span>([^]*?)<table\b[^>]*>([^]*?)<\/table>/i);
  if (!section) return {asOf:null, offers:[]};
  const stamp = timestamp(text(section[1]), /обновлено:\s*(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/i);
  const [header,...rows] = tableRows(section[2]);
  if (!header || header.length !== 3 || !/^Вес,? грамм(?:ы|ов)?$/i.test(header[0]) ||
    !/^Покупка,?\s*цена за слиток в BYN$/i.test(header[1]) ||
    !/^Продажа,?\s*цена за слиток в BYN$/i.test(header[2])) return {...stamp, offers:[]};
  const offers = rows.filter(row=>row.length===3).map(([mass,,sale])=>checkedBar({
    symbol:'XAU', mass, sale,
    city:'Минск, Гомель, Брест',
    terms:'Пробу и наличие подтверждает отделение. Для физлиц свыше 500 базовых величин оплата только безналичная. В ТЦ Dana Mall нужен предварительный заказ.',
    conditional:true, updatedAt:stamp.updatedAt,
  })).filter(Boolean);
  return {...stamp,offers};
}

const bgpProducts = [
  ['nbrb', 'НБРБ'],
  ['minfin', 'Республика Беларусь'],
];

export function parseBelgazprombank(html) {
  const tables = [];
  for (const [slug,mark] of bgpProducts) {
    const section = html.match(new RegExp(`id=["']subtab-${slug}["'][^>]*>([^]*?)<table\\b[^>]*class=["'][^"']*\\btable-metal\\b[^"']*["'][^>]*>([^]*?)<\\/table>`, 'i'));
    if (!section) continue;
    const stampText = section[1].match(/<span\b[^>]*class=["'][^"']*\bconvert__caption\b[^"']*["'][^>]*>([^]*?)<\/span>/i)?.[1] ?? '';
    const stamp = timestamp(text(stampText), /^(\d{2})\.(\d{2})\.(\d{4})(?:,?\s+(\d{2}):(\d{2}))?$/);
    const [header,...rows] = tableRows(section[2]);
    if (!stamp.asOf || !header || header.length !== 5 || !/^Вид драгоценного металла$/i.test(header[0]) ||
      !/^Проба$/i.test(header[1]) || !/^Масса номинальная \(лигатурная\), в гр\.$/i.test(header[2]) ||
      !/^Покупка цена за слиток, в BYN$/i.test(header[3]) ||
      !/^Продажа цена за слиток, в BYN$/i.test(header[4])) continue;
    const offers = rows.filter(row=>row.length===5).map(([metal,fineness,mass,,sale])=>checkedBar({
      symbol:symbols.get(metal.toLowerCase()), mass, fineness, sale,
      terms:`Маркировка «${mark}». Уточните наличие и адрес отделения у банка.`,
      updatedAt:stamp.updatedAt,
    })).filter(Boolean);
    if (offers.length) tables.push({...stamp,offers});
  }
  const newest = tables.map(table=>table.asOf).sort().at(-1);
  if (!newest) return {asOf:null, offers:[]};
  return {asOf:newest, offers:tables.filter(table=>table.asOf===newest).flatMap(table=>table.offers)};
}

export const belarusBullionProviders = [
  {id:'belagroprombank',name:'Белагропромбанк',url:'https://www.belapb.by/about/spravochnaya-informatsiya/vitriny/dragotsennye-metally/',symbols:['XAU','XAG','XPT'],parse:parseBelagroprombank},
  {id:'mtbank',name:'МТБанк',url:'https://www.mtbank.by/investments/slitki-dragocennyh-metallov/',symbols:['XAU'],parse:parseMtbank},
  {id:'belgazprombank',name:'Белгазпромбанк',url:'https://belgazprombank.by/personal_banking/operacii_s_dragocennimi_metallami/tekuschie_ceni_kupli_prodazhi_mernih_sli/',symbols:['XAU','XAG','XPT'],parse:parseBelgazprombank},
];
