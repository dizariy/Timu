const URALPROM_URL = 'https://www.uralprombank.ru/person/dragotsennye-metally-i-monety/dragotsennye-metally-v-slitkakh/kursy-dragotsennykh-metallov';
const ROSVEKSEL_URL = 'https://www.rsvx.ru/';

const text = html => String(html ?? '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(?:nbsp|thinsp|ensp|emsp);|&#(?:160|8239);|&#x(?:a0|202f);/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function positive(value) {
  const decimal = text(value).replace(/\s+/g, '').replace(',', '.');
  const number = /^\d+(?:\.\d+)?$/.test(decimal) ? Number(decimal) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

function rubles(value) {
  const clean = text(value);
  if (!/\s*(?:₽|руб\.?)$/i.test(clean)) return null;
  return positive(clean.replace(/\s*(?:₽|руб\.?)$/i, ''));
}

function calendarDate(day, month, year) {
  const iso = `${year}-${month}-${day}`;
  return Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso ? iso : null;
}

export function parseUralpromBullion(html) {
  const section = html.match(/<h3\b[^>]*>\s*Мерные слитки,\s*с\s*(\d{2})\.(\d{2})\.(\d{4})\s*(?:\d{1,2}:\d{2}:\d{2})?\s*<\/h3>((?:(?!<h3\b|<\/main>)[\s\S])*?<\/table>)/iu);
  if (!section) throw new Error('Таблица мерных слитков не найдена');
  const asOf = calendarDate(section[1], section[2], section[3]);
  const table = section[4].match(/<table\b[^>]*>([\s\S]+)<\/table>/iu)?.[1];
  if (!asOf || !table || !/Стоимость слитка\s*\(руб\)/iu.test(text(table))) throw new Error('Некорректная таблица мерных слитков');

  const offers = [];
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu)].map(match => text(match[1]));
    if (cells.length !== 3) continue;
    const mass = cells[0].match(/^Золото\s+(\d+(?:[,.]\d+)?)\s*г\.?$/iu);
    if (!mass) continue;
    const grams = positive(mass[1]);
    const price = rubles(cells[2]);
    if (!grams || !price) continue;
    offers.push({
      symbol:'XAU', grams, purity:null, price, conditional:true,
      terms:'Банк указывает стоимость слитка. Проба, наличие и отделение уточняются у банка.',
    });
  }
  if (!offers.length) throw new Error('Цены продажи слитков отсутствуют');
  return {asOf, offers};
}

export function parseRosvekselBullion(html) {
  // The public page contains both certificates and physical bars. Take only
  // exact displayed totals linked to a specific bar option.
  if (!/Стоимость указана без уч[её]та доставки/iu.test(html)) throw new Error('Условия доставки не найдены');
  const options = [...html.matchAll(/<button\b[^>]*aria-label="(\d+)\s*(кг|г) золото (999[,.]9), добавить в набор"[^>]*>[\s\S]*?<\/button>/giu)];
  const offers = [];
  for (const [index, option] of options.entries()) {
    const start = option.index + option[0].length;
    const end = Math.min(options[index + 1]?.index ?? html.length, start + 6500);
    const displayed = html.slice(start, end).match(/<span\b[^>]*class="[^"]*\btabular-nums\b[^"]*\bleading-none\b[^"]*"[^>]*>\s*([^<]*₽)\s*<\/span>/iu)?.[1];
    const price = rubles(displayed);
    const grams = Number(option[1]) * (option[2].toLowerCase() === 'кг' ? 1000 : 1);
    if (!grams || !price) continue;
    offers.push({
      symbol:'XAU', grams, purity:999.9, price, conditional:true,
      terms:'Публичная цена платформы без доставки. Окончательная сумма зависит от адреса и условий заказа.',
    });
  }
  if (!offers.length) throw new Error('Точные цены физических слитков не найдены');
  return {asOf:null, offers};
}

export const russianBullionProviders = Object.freeze([
  {id:'uralprom',name:'Уралпромбанк',url:URALPROM_URL,symbols:['XAU'],parse:parseUralpromBullion},
  {id:'rsvx',name:'Росвексель',url:ROSVEKSEL_URL,symbols:['XAU'],parse:parseRosvekselBullion},
]);
