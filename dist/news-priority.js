export const NEWS_PRIORITY_LABELS = Object.freeze({
  urgent: 'Срочное',
  important: 'Важное',
  ordinary: 'Обычное',
});

export const AUTOMATIC_NEWS_CONTEXT = 'Событие связано с компанией из биржевого каталога. Подробности доступны в первоисточнике.';

const standardNote = 'В заголовке и кратком описании не распознано существенное корпоративное событие.';
const lawFirmPromotion = /\b(?:lead plaintiff|investor alert|securities fraud class action reminder|shareholder alert|securities fraud lawsuit deadline)\b|\b(?:investors?|shareholders?)\b.{0,95}\b(?:opportunity to lead|encouraged to contact|urged to contact)\b|(?:напоминает|призывает).{0,90}(?:инвестор|акционер).{0,100}(?:иск|связаться)/iu;
const scheduledResults = /\b(?:to|will)\s+(?:report|release|announce|publish)\b.{0,80}\b(?:earnings|results|financial statements)\b|\b(?:to|will)\s+(?:host|hold|conduct)\b.{0,85}\b(?:conference call|webcast)\b|\b(?:earnings|results)\s+(?:release date|date announcement)\b|\b(?:schedules?|sets?|announces? (?:the )?date (?:of|for))\b.{0,85}\b(?:earnings|results|conference call|webcast)\b|\bannounces?\b.{0,75}\b(?:earnings|results).{0,25}(?:conference call|webcast)\b|\b(?:earnings|results).{0,35}(?:conference call|webcast)\s+(?:alert|dates?)\b|(?:опубликует|представит).{0,55}(?:отч[её]т|финансовые результаты)|дата публикации.{0,45}(?:отч[её]т|результат)/iu;
const scheduledRestriction = /\b(?:voluntary delisting|plans? to delist|proposed delisting|halt lifted|suspension lifted|resumes? trading|resumption of trading|trading (?:resumes|resumed))\b|(?:возобновлен[иы]е?|возобновляет|возобновлены).{0,35}торг|(?:отмен[ае]|сняти[еи]|сняты).{0,35}(?:ограничен|приостанов)/iu;
const conditionalEvent = /\b(?:risks? of|threat of|potential|possible|considering|could face|could lead to)\b.{0,28}\b(?:trading halt|suspension of trading|delisting|bankruptcy|default)\b|(?:риск|угроз[а-яё]*|возможн[а-яё]*).{0,30}(?:приостанов|делистинг|банкротств|дефолт)/iu;
const urgentRules = [
  {
    pattern: /\b(?:trading halt(?:ed)?|halt(?:s|ed|ing)? trading|suspend(?:s|ed|ing)? trading|trading suspension|suspension of trading|(?:nasdaq|nyse)(?:\s+\w+){0,4}\s+delisting notice|receiv(?:e[sd]?|ing)\b.{0,55}\bdelisting notice|receipt of\b.{0,35}\bdelisting notice)\b|приостанов[а-яё]*.{0,24}торг|торг[а-яё]*.{0,36}приостанов|ограничени[а-яё]* кодов расч[её]тов.{0,30}(?:акци|ценн)|(?:уведомлен[а-яё]*|решени[а-яё]*).{0,35}делистинг/iu,
    note: 'Сообщается об ограничении торгов или расчётов либо об уведомлении биржи о делистинге.',
  },
  {
    pattern: /\b(?:fil(?:es|ed|ing) (?:for bankruptcy|for chapter 11|(?:a |voluntary )?petition[s]? .{0,30}chapter 11)|declared bankrupt|defaults? on (?:its |a )?(?:debt|bonds?|loan|interest)|defaulted on (?:its |a )?(?:debt|bonds?|loan|interest)|miss(?:es|ed) (?:its |an? )?(?:interest|debt|bond|coupon) payment)\b|(?:подал[аои]?|под[аё]т).{0,38}заявлен[а-яё]*.{0,22}банкротств|признан[аоы]?.{0,28}банкрот|(?:допустил[аои]?|объявил[аои]?).{0,15}(?:техническ[а-яё]+ )?дефолт|не (?:выплатил[аои]?|погасил[аои]?).{0,28}(?:купон|облигаци)/iu,
    note: 'В сообщении указано заявление о банкротстве, признание банкротом или нарушение платежа по долгу.',
  },
];

const importantRules = [
  {
    pattern: /\b(?:financial|operating|quarterly|fiscal year|year[- ]end|half[- ]year)\s+results\b|\b(?:reports?|announces?)\b.{0,85}\b(?:quarter|fiscal year|year ended)\b.{0,65}\b(?:results|earnings|net income|net profit)\b|\b(?:reports? results|reports? earnings|record sales? (?:and|&) earnings)\b|финансов[а-яё]* результат|отч[её]тност[а-яё]*|(?:выручка|чистая прибыль).{0,38}(?:вырос|снизил|увеличил|сократил)|(?:вырос|снизил|увеличил|сократил)[а-яё]*.{0,22}(?:выручк|прибыл)/iu,
    note: 'В публикации описаны финансовые результаты или изменение финансовых показателей.',
  },
  {
    pattern: /\b(?:quarterly dividend|cash dividend|stock dividend|dividend of|dividend increase|dividend cut|dividend suspension|(?:declares?|increases?|announces?|reduces?|suspends?|distributes?)\s+(?:\w+\s+){0,4}dividends?|(?:share|stock) (?:repurchase|buyback)|repurchase (?:program|authorization)|(?:reverse )?(?:stock|share) split|share consolidation)\b|дивиденд|(?:обратн[а-яё]* )?выкуп[а-яё]* акци|программ[а-яё]* выкуп|дроблени[а-яё]* акци|консолидаци[а-яё]* акци/iu,
    note: 'Публикация касается выплат акционерам, выкупа, дробления или консолидации акций.',
  },
  {
    pattern: /\b(?:definitive (?:merger|acquisition) agreement|agreement to (?:merge with|acquire)|to (?:merge with|acquire)|merger agreement|(?:completes?|closes?)\s+(?:the |its )?(?:merger|acquisition)|acquisition of|business combination agreement|proposed business combination|completes? (?:the )?sale of)\b|(?:заключил[аои]?|подписал[аои]?).{0,45}(?:слияни[а-яё]*|поглощени[а-яё]*|покупк[а-яё]* (?:акци|дол))|(?:объявил[аои]?|завершил[аои]?).{0,38}(?:слияни[а-яё]*|поглощени[а-яё]*)|сделк[а-яё]* по (?:покупке|слиянию|поглощению)/iu,
    note: 'В публикации сообщается о сделке или её подготовке: слияние, приобретение или продажа активов.',
  },
  {
    pattern: /\b(?:(?:raises?|lowers?|cuts?|withdraws?|updates?|announces?|reaffirms?)\b.{0,35}\b(?:financial |quarterly |full[- ]year |fiscal year |annual |earnings |revenue )?guidance|(?:full[- ]year|financial|earnings|revenue) guidance|(?:pricing of|prices?)\b.{0,70}\b(?:public offering|notes offering)|(?:underwritten|registered direct) public offering)\b|(?:повысил|снизил|отозвал|обновил)[а-яё]*.{0,45}прогноз.{0,35}(?:выручк|прибыл|финансов)|(?:размещени[а-яё]*|выпуск[а-яё]*).{0,22}(?:акци|облигаци)/iu,
    note: 'Сообщение касается прогноза самой компании или размещения ценных бумаг.',
  },
  {
    pattern: /\b(?:(?:nasdaq|nyse)(?:\s+\w+){0,4}\s+(?:noncompliance notice|warning letter)|warning letter from (?:nasdaq|nyse)|formal investigation by (?:the )?(?:sec|department of justice)|settlement (?:with|agreement with) (?:the )?(?:sec|(?:u\.?s\.? )?department of justice))\b|(?:суд|регулятор).{0,50}(?:оштрафовал|запретил|возбудил).{0,20}(?:компани|дело)|предписание.{0,22}(?:бирж|регулятор)/iu,
    note: 'Источник сообщает о формальном уведомлении биржи или действии регулятора.',
  },
];

const monthNumbers = {
  january: 1, jan: 1, января: 1, february: 2, feb: 2, февраля: 2, march: 3, mar: 3, марта: 3,
  april: 4, apr: 4, апреля: 4, may: 5, мая: 5, june: 6, jun: 6, июня: 6,
  july: 7, jul: 7, июля: 7, august: 8, aug: 8, августа: 8, september: 9, sep: 9, sept: 9, сентября: 9,
  october: 10, oct: 10, октября: 10, november: 11, nov: 11, ноября: 11, december: 12, dec: 12, декабря: 12,
};

const dayMs = 86_400_000;
function strictUtcDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() + 1 === month && date.getUTCDate() === day ? date.getTime() : null;
}

// Use only explicitly stated effective dates; an RSS timestamp is the publication date.
function effectiveDay(title) {
  const iso = title.match(/(?:\beffective(?: as of| on| from)?|\bstarting|\bfrom|(?:^|\s)с)\s+(\d{4})-(\d{2})-(\d{2})(?!\d)/iu);
  if (iso) return strictUtcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const english = title.match(/\b(?:effective(?: as of| on| from)?|starting|from)\s+([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})(?!\d)/iu);
  if (english) return strictUtcDate(Number(english[3]), monthNumbers[english[1].toLowerCase()], Number(english[2]));

  const russian = title.match(/(?:^|\s)с\s+(\d{1,2})\s+([а-яё]+)\s+(\d{4})(?!\d)/iu);
  if (russian) return strictUtcDate(Number(russian[3]), monthNumbers[russian[2].toLowerCase()], Number(russian[1]));
  return null;
}

function outsideImmediateWindow(title, publishedAt) {
  const date = effectiveDay(title);
  const published = Date.parse(publishedAt);
  if (date === null || !Number.isFinite(published)) return false;
  return Math.abs(date - Math.floor(published / dayMs) * dayMs) > 2 * dayMs;
}

export function classifyNewsPriority(article) {
  const title = String(article.title || '').replace(/\s+/g, ' ').trim();
  const summary = String(article.summary || '').replace(/\s+/g, ' ').trim();
  const body = `${title} ${summary}`;
  if (lawFirmPromotion.test(title)) {
    return {priority: 'ordinary', priorityNote: 'В заголовке распознано обращение к инвесторам или напоминание о судебном сроке.'};
  }

  // Urgency needs an actual event in the headline. Details in the summary
  // can supply context, but cannot elevate a risk, ad or speculation to urgent.
  const urgent = urgentRules.find(rule => rule.pattern.test(title));
  if (urgent) {
    if (scheduledRestriction.test(title)) {
      return {priority: 'important', priorityNote: 'В публикации уточнён статус изменения торгов или расчётов.'};
    }
    if (conditionalEvent.test(title)) {
      return {priority: 'important', priorityNote: 'В публикации описан возможный риск для компании или держателей её бумаг.'};
    }
    if (outsideImmediateWindow(title, article.publishedAt)) {
      return {priority: 'important', priorityNote: `Дата события в заголовке отстоит более чем на два дня от публикации. ${urgent.note}`};
    }
    return {priority: 'urgent', priorityNote: urgent.note};
  }

  if (scheduledResults.test(title)) {
    return {priority: 'ordinary', priorityNote: 'Сообщение анонсирует публикацию отчётности, звонок или презентацию.'};
  }
  const important = importantRules.find(rule => rule.pattern.test(title))
    || importantRules.find(rule => rule.pattern.test(body));
  if (important) return {priority: 'important', priorityNote: important.note};

  if (article.verified && ['Важное', 'important'].includes(article.priority)) {
    return {priority: 'important', priorityNote: 'Важность отмечена в редакционной подборке.'};
  }
  return {priority: 'ordinary', priorityNote: standardNote};
}
