const bankAliases = {
  alfabank: ['Альфа Банк', 'Alfa Bank'],
  bvebank: ['Банк БелВЭБ', 'БелВЭБ', 'BelVEB', 'belveb'],
  'bank-vtb': ['Банк ВТБ (Беларусь)', 'Банк ВТБ', 'ВТБ', 'ВТБ Беларусь', 'VTB'],
  dabrabyt: ['Банк Дабрабыт', 'Дабрабыт'],
  reshenie: ['Банк Решение', 'Решение'],
  'rrb-bank': ['Банк РРБ', 'РРБ Банк', 'РРБ'],
  belagroprombank: ['Белагропромбанк'],
  belarusbank: ['Беларусбанк', 'АСБ Беларусбанк', 'ОАО АСБ Беларусбанк'],
  belgazprombank: ['Белгазпромбанк'],
  belinvestbank: ['Белинвестбанк'],
  belinkasgrupp: ['Белинкасгрупп'],
  bnbank: ['БНБ-Банк', 'БНБ'],
  belswissbank: ['БСБ Банк', 'BSB Bank'],
  mtbank: ['МТбанк', 'MTBank'],
  neobank: ['Нео Банк Азия', 'Нео Банк', 'Необанк', 'Neo Bank Asia'],
  paritetbank: ['Паритетбанк'],
  priorbank: ['Приорбанк', 'Priorbank', 'prior'],
  'bps-sberbank': ['Сбер Банк', 'БПС-Сбербанк', 'Сбер', 'Sber Bank'],
  statusbank: ['СтатусБанк', 'StatusBank'],
  technobank: ['Технобанк'],
  tkbank: ['ТК Банк', 'TK Bank'],
  zepterbank: ['Цептер Банк', 'Zepter Bank'],
};

function normalizeBankName(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]/gu, '');
}

const logoKeys = new Map();
for (const [key, names] of Object.entries(bankAliases)) {
  for (const name of [key, ...names]) {
    logoKeys.set(normalizeBankName(name), key);
  }
}

export function bankLogo(bankName) {
  const key = logoKeys.get(normalizeBankName(bankName));
  if (key) {
    return `<span class="bank-logo" data-bank="${key}" aria-hidden="true"><img src="assets/banks/${key}.svg" width="36" height="36" loading="lazy" decoding="async" alt=""></span>`;
  }

  const words = String(bankName ?? '').normalize('NFKC').match(/[\p{Letter}\p{Number}]+/gu) ?? [];
  const initials = words.filter(word => word.toLowerCase() !== 'банк').slice(0, 2)
    .map(word => Array.from(word.toUpperCase())[0]).join('');
  return `<span class="bank-logo bank-logo-fallback" aria-hidden="true">${initials || 'Б'}</span>`;
}
