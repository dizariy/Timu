import {parsePriceCSV, calculateMetrics, createDemoSeries, selectPeriod} from './analytics.js';
import {INTRO_HOLD_MS, chooseGradientPhase, createLiquidBanner} from './hero-gradient.js';
import {createCommodityPanel} from './commodities.js';
import {renderPurchaseOffers} from './commodity-offers.js';
import {createNewsFeed,normalizeNews} from './news-client.js';
import {normalizeNewsFilters,matchesNewsFilters,activeFilterCount,defaultNewsFilters,newsDay} from './news-filter.js';
import {createNewsFilterDialog} from './news-controls.js';
import {closeIcon,searchIcon,refreshIcon} from './ui-icons.js';
import {createNewsTranslations,needsTranslation} from './news-translation-client.js';
import {createCurrencyPanel} from './currency.js';
import {CHART_PERIODS,buildDotChartModel,renderDotChart,bindDotChartInspection,bindChartPeriodWheel} from './dot-chart.js';
import {installSoftScrollbars} from './soft-scrollbars.js';
import {createScrollSearch} from './scroll-search.js';
import {NEWS_PRIORITY_LABELS} from './news-priority.js';
const translations=createNewsTranslations();
let lastCurrencyStatus={};
let lastCommodityStatus={};
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {bookmark:'<svg viewBox="0 0 24 24"><path d="M6.5 4.5h11v16L12 17l-5.5 3.5Z"/></svg>'};
const read = (k, fallback) => {try{return JSON.parse(localStorage.getItem(k)) ?? fallback}catch{return fallback}};
const save = (k,v) => {try{localStorage.setItem(k, JSON.stringify(v));return true}catch{return false}};
const state = {savedArticles:normalizeNews({news:read('timu.savedArticles',[])}),feedLimit:30,newsFilters:normalizeNewsFilters(read('timu.newsFilters',null)),news:[], companies:[], filter:'all', query:'', savedOnly:false, saved:new Set(read('timu.saved',[])), following:new Set(read('timu.following',['META','AAPL','NVDA','MSFT'])), imported:read('timu.histories',{}), period:'3M', symbol:null};
const dateFormat = new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'});
const longDateFormat = new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const numberFormat = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2,minimumFractionDigits:2});
const fmtDate = (date,year=false) => (year?longDateFormat:dateFormat).format(new Date(newsDay(date)+'T12:00:00Z')).replace(' г.','');
const percent = n => `${n>0?'+':''}${(n*100).toFixed(2).replace('.',',')}%`;
const fixed = n => numberFormat.format(n);
const companyKey = c => c.id || c.symbol;
const company = key => state.companies.find(c=>companyKey(c)===key) || state.companies.find(c=>c.symbol===key) || {id:key,symbol:key,name:key,colors:null,logo:null};
const hasBrand = c => Boolean(c.logo && Array.isArray(c.colors) && c.colors.length===2);
const color = c => {const colors=hasBrand(c)?c.colors:['#8b3dff','#04002b'];return `--c1:${colors[0]};--c2:${colors[1]}`};
function logo(c){return hasBrand(c) ? `<img src="${escape(c.logo)}" alt="" loading="lazy" width="62" height="62">` : '<svg class="fallback-logo" viewBox="0 0 358 187" aria-hidden="true"><rect width="358" height="187" fill="currentColor" mask="url(#timu-mask)"/></svg>'}
function mini(c){return `<span class="company-mini ${hasBrand(c)?'':'missing-brand'}" style="${color(c)}">${logo(c)}</span>`}
function row(c){return `<button class="company-row" data-company="${escape(companyKey(c))}" aria-label="Открыть ${escape(c.name)}">${mini(c)}<span><strong>${escape(c.name)}</strong><small>${escape(c.symbol)} · ${c.exchange||'NASDAQ'}</small></span></button>`}
function card(n) {
  const text = translations.peek(n) || n;
  const c = company(n.companyId || n.symbol);
  const saved = state.saved.has(n.id);
  const added = n.addedAt || n.publishedAt;
  const label = NEWS_PRIORITY_LABELS[n.priority] || NEWS_PRIORITY_LABELS.ordinary;
  const note = n.priorityNote ? ` · ${n.priorityNote}` : '';
  return `<article data-news-id="${escape(n.id)}" class="news-card ${n.symbol === 'META' ? 'meta' : ''} ${hasBrand(c) ? '' : 'missing-brand'}" style="${color(c)}">
    <button class="company-logo-button" data-company="${escape(n.companyId || n.symbol)}" aria-label="График и новости ${escape(c.name)}">${logo(c)}</button>
    <div class="card-body">
      <div class="card-pills"><time class="pill date priority-${n.priority || 'ordinary'}" datetime="${added}" title="${escape(label + note)}" aria-label="${label}. Добавлено ${fmtDate(added,true)}">${fmtDate(added)}</time></div>
      <button class="news-open" data-news="${n.id}"><h3>${escape(text.title)}</h3><p>${escape(text.summary)}</p></button>
      <div class="card-footer"><span>${escape(n.source)}</span><button class="bookmark" data-save="${n.id}" aria-label="${saved ? 'Удалить из сохранённого' : 'Сохранить новость'}" aria-pressed="${saved}">${icons.bookmark}</button></div>
    </div>
  </article>`;
}
const commodityPanel=createCommodityPanel($('#commodities'),{
  openDialog,
  getDialogContent:()=>$('#dialog-content'),
  renderPurchaseOffers,
  onStatus:status=>{lastCommodityStatus=status;renderDataStatus()},
});
const currencyPanel=createCurrencyPanel($('#currency'),{onStatus:status=>{lastCurrencyStatus=status;renderDataStatus()}});
function renderFeed(){
  const commodity=state.filter==='commodities',currency=state.filter==='currency',market=commodity||currency;
  $('#feed').hidden=market;$('.results-header').hidden=market;$('#company-results').hidden=market;$('.feed-section>.data-note').hidden=false;$('#filter-tools').hidden=market;
  commodityPanel.setActive(commodity);commodityPanel.setQuery(state.query);currencyPanel.setActive(currency);currencyPanel.setQuery(state.query);renderDataStatus();
  const searchLabel=currency?'Найти банк или город':commodity?'Найти металл или сырьё':'Найти компанию или событие';$('#search').placeholder=searchLabel;$('#search').setAttribute('aria-label',searchLabel);
  $('#feed-more').hidden=true;
  if(market)return;
  const q=state.query.toLocaleLowerCase('ru');
  const list=state.news.filter(n=>(state.filter==='all'||n.category===state.filter||n.priority===state.filter)&&(!state.savedOnly||state.saved.has(n.id))&&matchesNewsFilters(n,state.newsFilters)&&(!q||`${n.title} ${n.summary} ${translations.peek(n)?.title||''} ${translations.peek(n)?.summary||''} ${n.company} ${n.symbol}`.toLocaleLowerCase('ru').includes(q)));
  $('#feed').innerHTML=list.length?list.slice(0,state.feedLimit).map(card).join(''):`<div class="empty"><strong>${state.savedOnly?'Пока нет сохранённых новостей':'По этим условиям новостей нет'}</strong><span>${state.savedOnly?'Нажмите на закладку в карточке.':'Измените цвет, дату или запрос.'}</span><button data-reset>Показать все события</button></div>`;
  $('#result-label').textContent=`${state.savedOnly?'Сохранённое':'События компаний'} · ${list.length}`;
  $('#feed-more').hidden=list.length<=state.feedLimit;
  $('#company-results').innerHTML=q?state.companies.filter(c=>`${c.name} ${c.symbol} ${c.aliases||''}`.toLocaleLowerCase('ru').includes(q)).slice(0,5).map(row).join(''):'';
  $('#saved-toggle').setAttribute('aria-pressed',state.savedOnly);$('#saved-toggle').style.color=state.savedOnly?'#8460c5':'';
  const count=activeFilterCount(state.newsFilters);$('#news-filter-label').textContent=count?`Фильтр · ${count}`:'Фильтр';$('#news-filter').setAttribute('aria-pressed',count>0);$('#filter-summary').textContent=count?'Условия применены':'';
}
function renderCompanies(){const list=state.companies.filter(c=>state.following.has(companyKey(c)));$('#company-list').innerHTML=(list.length?list:state.companies.slice(0,4)).slice(0,6).map(row).join('')}
let toastTimer;function toast(message){const host=dialog.open?dialog:document.body;host.append($('#toast'));$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3200)}
let returnFocus,dialogGeneration=0;const dialog=$('#detail-dialog');
const dialogScroll=dialog.querySelector('.dialog-scroll');
dialogScroll.tabIndex=-1;
dialogScroll.autofocus=true;
const softScrollbars=installSoftScrollbars(dialog);
function openDialog(html){dialogGeneration++;returnFocus=dialog.open?returnFocus:document.activeElement;$('#dialog-content').innerHTML=html;if(!dialog.open){dialog.showModal();document.body.classList.add('no-scroll')}dialogScroll.scrollTop=0;softScrollbars.refresh();dialogScroll.focus({preventScroll:true})}
function closeDialog(){dialogGeneration++;dialog.close();document.body.classList.remove('no-scroll');returnFocus?.focus({preventScroll:true})}
$('#dialog-close').addEventListener('click',closeDialog);dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog()});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog()}});
function openNews(id){
  const n=state.news.find(n=>n.id===id);if(!n)return;
  let translated=translations.peek(n),showTranslated=Boolean(translated),loading=false;
  const foreign=needsTranslation(n),text=translated||n;
  openDialog(`<p class="eyebrow article-location"><button class="inline-link" data-company="${escape(n.companyId||n.symbol)}">${escape(n.company)}</button><span aria-hidden="true">/</span><button class="inline-link" id="article-catalog">Компании</button></p><h2 id="dialog-title" class="article-title">${escape(text.title)}</h2><p class="data-note">${fmtDate(n.publishedAt,true)} · ${escape(n.source)}</p><div class="translation-tools" ${foreign?'':'hidden'}><span id="translation-status" role="status">${translated?'Перевод · '+escape(translated.provider):'Переводим на русский…'}</span><button id="translation-toggle" ${translated?'':'disabled'}>${translated?'Оригинал':'На русском'}</button></div><p class="article-body">${escape(text.summary)}</p><div class="context-box"><strong>Почему это имеет значение</strong>${escape(n.relevance)}<p class="priority-reason"><b>${NEWS_PRIORITY_LABELS[n.priority] || NEWS_PRIORITY_LABELS.ordinary}</b> · ${escape(n.priorityNote || 'Категория определена по содержанию публикации.')}</p><p class="impact-explanation impact-${n.impact||'neutral'}">${escape(n.impactNote||'Направление влияния не установлено.')}</p></div><a class="primary-link" href="${escape(n.url)}" target="_blank" rel="noopener noreferrer">Читать первоисточник</a><button class="text-button" data-company="${escape(n.companyId||n.symbol)}">История ${escape(n.company)}</button>`);
  const generation=dialogGeneration,current=()=>dialog.open&&generation===dialogGeneration;
  $('#article-catalog').onclick=openCatalog;
  const showLanguage=()=>{
    if(!current())return;const visible=showTranslated&&translated?translated:n;
    $('#dialog-title').textContent=visible.title;$('.article-body').textContent=visible.summary;
    $('#translation-toggle').textContent=showTranslated?'Оригинал':'Перевод';
    $('#translation-status').textContent=showTranslated?'Перевод · '+translated.provider+' · сверьте важные детали с оригиналом':'Оригинальный текст';
  };
  const requestTranslation=async()=>{
    if(loading)return;loading=true;$('#translation-toggle').disabled=true;$('#translation-status').textContent='Переводим на русский…';
    const result=await translations.translate(n);loading=false;if(!current())return;
    $('#translation-toggle').disabled=false;
    if(result.translated){translated=result;showTranslated=true;showLanguage();const card=$$('.news-card').find(el=>el.dataset.newsId===id);if(card){card.querySelector('h3').textContent=result.title;card.querySelector('.news-open p').textContent=result.summary}}
    else{$('#translation-status').textContent=result.status==='quota'?'Лимит перевода исчерпан. Показан оригинал.':'Перевод временно недоступен. Показан оригинал.';$('#translation-toggle').textContent='Повторить'}
  };
  $('#translation-toggle').onclick=()=>{if(translated){showTranslated=!showTranslated;showLanguage()}else requestTranslation()};
  if(foreign&&!translated)requestTranslation();else if(translated)showLanguage();
}
function seriesFor(symbol){const imported=state.imported[symbol];return imported?.points?.length>=2?imported:{points:createDemoSeries(symbol),demo:true,adjusted:false}}
function openCompany(symbol){state.symbol=symbol;state.period='3M';renderCompany()}
function renderCompany(){const c=company(state.symbol),series=seriesFor(companyKey(c));const following=state.following.has(companyKey(c));const related=state.news.filter(n=>(n.companyId||n.symbol)===companyKey(c)||n.relatedCompanyIds?.includes(companyKey(c)));openDialog(`<div class="modal-company">${mini(c)}<div><h2 id="dialog-title">${escape(c.name)}</h2><p>${c.symbol} · ${escape(c.exchange||'NASDAQ')}</p></div><button class="round raised watch-button" id="follow-company" aria-label="${following?'Убрать из наблюдения':'Добавить в наблюдение'}" aria-pressed="${following}">${icons.bookmark}</button></div><div class="mode-tag">${series.demo?'Демонстрационный индекс · не биржевые котировки':'Ваш CSV · '+(series.adjusted?'скорректированное закрытие':'закрытие без поправки на сплиты и дивиденды')}<br><span>Период данных: ${fmtDate(series.points[0].date,true)} — ${fmtDate(series.points.at(-1).date,true)}</span></div><div id="chart-block"></div><div class="data-actions"><button class="small-button" id="import-csv">Загрузить историю CSV</button>${!series.demo?'<button class="small-button" id="reset-data">Убрать импорт</button>':''}<button class="small-button" id="explain-metrics">О расчётах</button><input type="file" class="file-input" id="csv-file" accept=".csv,text/csv" aria-label="Файл истории цен"></div><p class="import-help">CSV: date, adjusted_close (или close). Даты YYYY-MM-DD. Данные сохраняются только в этом браузере.</p><h3 class="modal-subtitle">Публикации компании <span class="muted">· ${related.length}</span></h3>${related.length?related.map(n=>`<button class="related-item" data-news="${n.id}"><span>${fmtDate(n.publishedAt,true)} · ${escape(n.category)}</span><strong>${escape(n.title)}</strong></button>`).join(''):'<p class="analytics-explainer">В текущей подборке нет публикаций этой компании.</p>'}`);renderChart();$('#follow-company').onclick=()=>{if(state.following.has(companyKey(c)))state.following.delete(companyKey(c));else state.following.add(companyKey(c));save('timu.following',[...state.following]);renderCompanies();$('#follow-company').setAttribute('aria-pressed',state.following.has(companyKey(c)));$('#follow-company').setAttribute('aria-label',state.following.has(companyKey(c))?'Убрать из наблюдения':'Добавить в наблюдение');toast(state.following.has(companyKey(c))?'Компания добавлена в наблюдение':'Компания убрана из наблюдения')};$('#import-csv').onclick=()=>$('#csv-file').click();$('#csv-file').onchange=importCSV;$('#reset-data')?.addEventListener('click',()=>{delete state.imported[companyKey(c)];save('timu.histories',state.imported);renderCompany();toast('Импорт удалён')});$('#explain-metrics').onclick=()=>showInfo('metrics')}
const chartPeriodLabels = {'1M':'1М','3M':'3М','1Y':'1Г','ALL':'Всё'};
const wheelPeriods = CHART_PERIODS.slice(0, 3);
const wheelBoundCharts = new WeakSet();
const returnTone = value => value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';

function renderChart() {
  const series = seriesFor(state.symbol);
  let points = selectPeriod(series.points, state.period);
  if (points.length < 2) {
    points = series.points;
    state.period = 'ALL';
    toast('В выбранном окне мало данных. Показана вся история.');
  }
  const metrics = calculateMetrics(points);
  const last = points.at(-1);
  const unit = series.demo ? 'п.' : 'ед.';
  const description = series.demo ? 'Условный индекс, начало = 100' : 'Цена из вашего файла';
  const countLabel = `${points.length} наблюдений · ${fmtDate(points[0].date)} — ${fmtDate(last.date)}`;
  const model = buildDotChartModel(points);
  const block = $('#chart-block');
  const metricCards = [
    ['Лучшее изменение', metrics.bestDay],
    ['Худшее изменение', metrics.worstDay],
    ['Макс. просадка', metrics.maxDrawdown],
  ];
  const explanation = series.demo
    ? 'Расчёты показаны на синтетическом ряду. Загрузите историю для анализа компании.'
    : `Рост в ${(metrics.upShare * 100).toFixed(1).replace('.', ',')}% интервалов (${metrics.observations} изменений). Это историческая частота, а не вероятность роста завтра. Если в файле пропущены сессии, изменения относятся к соседним наблюдениям.`;

  block.innerHTML = `
    <div class="quote-row">
      <div class="quote-main">
        <strong>${fixed(last.close)}<span class="quote-unit"> ${unit}</span></strong>
        <span class="change ${returnTone(metrics.totalReturn)}">${percent(metrics.totalReturn)} <small>за период</small></span>
      </div>
      <small>${description} · ${fmtDate(last.date)}</small>
    </div>
    <div class="periods" aria-label="Период графика">${CHART_PERIODS.map(period => {
      const selected = state.period === period;
      return `<button data-period="${period}" class="${selected ? 'active' : ''}" aria-pressed="${selected}">${chartPeriodLabels[period]}</button>`;
    }).join('')}</div>
    <div class="chart-wrap">${renderDotChart(points, {formatDate: fmtDate, formatValue: fixed, model})}</div>
    <div class="chart-tooltip" id="chart-tooltip">${countLabel}</div>
    <div class="metrics">${metricCards.map(([label, value]) =>
      `<div class="metric"><span>${label}</span><strong class="${returnTone(value)}">${percent(value)}</strong></div>`,
    ).join('')}</div>
    <p class="analytics-explainer">${explanation}</p>`;

  block.querySelectorAll('[data-period]').forEach(button => {
    button.onclick = () => {
      state.period = button.dataset.period;
      renderChart();
      block.querySelector(`[data-period="${state.period}"]`)?.focus({preventScroll:true});
    };
  });
  const svg = block.querySelector('#price-chart');
  const tooltip = block.querySelector('#chart-tooltip');
  bindDotChartInspection(svg, {
    points, model,
    onInspect: point => { tooltip.textContent = `${fmtDate(point.date,true)} · ${fixed(point.close)} ${unit}`; },
    onReset: () => { tooltip.textContent = countLabel; },
  });
  if (!wheelBoundCharts.has(block)) {
    wheelBoundCharts.add(block);
    bindChartPeriodWheel(block, direction => {
      const current = state.period === 'ALL' ? wheelPeriods.length : wheelPeriods.indexOf(state.period);
      const next = wheelPeriods[current + direction];
      if (!next) return;
      const currentSeries = seriesFor(state.symbol);
      if (selectPeriod(currentSeries.points, next).length < 2) return;
      const chartFocused = document.activeElement === block.querySelector('#price-chart');
      state.period = next;
      renderChart();
      if (chartFocused) block.querySelector('#price-chart').focus({preventScroll:true});
    });
  }
}
async function importCSV(e){const targetSymbol=state.symbol;const file=e.target.files?.[0];if(!file)return;if(file.size>1500000){toast('Файл слишком большой. Максимум 1,5 МБ.');return}try{const parsed=parsePriceCSV(await file.text());if(parsed.points.length<2)throw Error('Для графика нужны минимум две даты.');state.imported[targetSymbol]={...parsed,name:file.name,demo:false};const persisted=save('timu.histories',state.imported);if(dialog.open&&state.symbol===targetSymbol)renderCompany();toast(persisted?'История загружена — статистика пересчитана':'История загружена на эту сессию; хранилище заполнено')}catch(error){toast(error.message||'Не удалось прочитать CSV')}}
function showInfo(section='data'){openDialog(`<h2 id="dialog-title">${section==='metrics'?'Как читается история':'Данные в timu'}</h2><div class="info-prose"><p>Лента автоматически получает публикации из подключённых источников и сопоставляет их с каталогом США и Московской биржи. У каждой публикации есть дата и первоисточник. Полнота новостей по каждому эмитенту зависит от источников; при потере связи остаётся сохранённая лента.</p><h3>Котировки и графики</h3><p>Поток биржевых цен акций ещё не подключён. По умолчанию график компании — явно обозначенный демонстрационный индекс. Вы можете загрузить CSV с реальной историей для конкретной компании. Никакие ключи доступа не запрашиваются в браузере.</p><h3>Что мы рассчитываем</h3><p>Изменение за период: последняя цена / первая − 1. Просадка: самое большое падение от предыдущего максимума. Лучший и худший день: изменения между соседними строками. Доля растущих интервалов: число положительных изменений / число всех изменений.</p><p>Для сопоставимой истории выбирайте скорректированные цены: обычное закрытие может содержать скачки из-за дробления акций. Валюта и периодичность определяются вашим файлом.</p><h3>Вероятности и реакция на новости</h3><p>Частота роста в прошлом не равна вероятности роста завтра. Для оценки реакции на похожие события нужны размеченные даты публикаций, биржевой календарь, скорректированные цены и сравнение с индексом. Без этих данных timu не показывает прогноз.</p><p>Следующий этап — подключение поставщика истории акций и проверка модели на отдельном историческом периоде. Приоритет новости определяется по описанному событию. Оценка возможного влияния на цену показана отдельно.</p><h3>Визуальные материалы</h3><p>Брендовые знаки — библиотека <a href="https://github.com/simple-icons/simple-icons" target="_blank" rel="noopener">Simple Icons</a>. Для отсутствующего логотипа используется timu.</p><button class="small-button" id="replay-intro">Повторить заставку</button></div>`);$('#replay-intro').onclick=()=>{closeDialog();window.scrollTo({top:0,behavior:'instant'});intro(true)}}
document.addEventListener('click',e=>{const c=e.target.closest('[data-company]'),n=e.target.closest('[data-news]'),s=e.target.closest('[data-save]'),f=e.target.closest('[data-filter]');if(c)openCompany(c.dataset.company);else if(n)openNews(n.dataset.news);else if(s){const id=s.dataset.save;state.saved.has(id)?state.saved.delete(id):state.saved.add(id);save('timu.saved',[...state.saved]);state.savedArticles=state.news.filter(n=>state.saved.has(n.id));save('timu.savedArticles',state.savedArticles);renderFeed();toast(state.saved.has(id)?'Сохранено':'Удалено из сохранённого')}else if(f){state.feedLimit=30;state.filter=f.dataset.filter;$$('[data-filter]').forEach(b=>{b.classList.toggle('active',b===f);b.setAttribute('aria-pressed',b===f)});renderFeed()}else if(e.target.closest('[data-reset]')){state.query='';state.filter='all';state.savedOnly=false;state.feedLimit=30;state.newsFilters=defaultNewsFilters();save('timu.newsFilters',state.newsFilters);$('#search').value='';$$('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter==='all');b.setAttribute('aria-pressed',b.dataset.filter==='all')});renderFeed()}const pending=e.target.closest('[data-upcoming]');if(pending)toast(`${pending.dataset.upcoming} — следующий этап. Сейчас работает Домашняя.`)});
$('#saved-toggle').onclick=()=>{if(['commodities','currency'].includes(state.filter)){state.filter='all';state.savedOnly=true;$$('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter==='all');b.setAttribute('aria-pressed',b.dataset.filter==='all')})}else state.savedOnly=!state.savedOnly;renderFeed()};
let catalogPromise,fullCatalogLoaded=false,catalogQuery='',catalogMarket='all',catalogLimit=60;
async function ensureCatalog(){if(fullCatalogLoaded)return;if(catalogPromise)return catalogPromise;catalogPromise=(async()=>{const r=await fetch('assets/companies.json');if(!r.ok)throw Error('Каталог пока недоступен');const data=await r.json();state.companies=Array.isArray(data)?data:data.companies;fullCatalogLoaded=true;renderCompanies();renderFeed()})();try{await catalogPromise}catch(error){catalogPromise=null;throw error}}
async function openCatalog(){catalogQuery='';catalogMarket='all';catalogLimit=60;openDialog('<h2 id="dialog-title">Компании</h2><div class="loading-card">Загружаем каталог…</div>');const requestGeneration=dialogGeneration;try{await ensureCatalog();if(!dialog.open||requestGeneration!==dialogGeneration)return;$('#dialog-content').innerHTML=`<h2 id="dialog-title">Компании</h2><p class="catalog-caption">США и Московская биржа · ${state.companies.length.toLocaleString('ru-RU')} бумаг</p><div class="catalog-search-shell">${searchIcon}<input class="catalog-search" id="catalog-search" type="search" aria-label="Поиск в каталоге" placeholder="Название или тикер" autocomplete="off"><button class="close-control" id="catalog-clear" aria-label="Очистить поиск компаний" disabled>${closeIcon}</button></div><div class="catalog-markets"><button class="active" aria-pressed="true" data-market="all">Все</button><button aria-pressed="false" data-market="US">США</button><button aria-pressed="false" data-market="RU">Мосбиржа</button></div><p class="catalog-count" id="catalog-count"></p><div id="catalog-rows"></div><button id="catalog-more" class="small-button">Показать ещё</button>`;$('#catalog-search').oninput=e=>{catalogQuery=e.target.value.trim().toLocaleLowerCase('ru');catalogLimit=60;$('#catalog-clear').disabled=!e.target.value;renderCatalogRows()};$('#catalog-clear').onclick=()=>{$('#catalog-search').value='';catalogQuery='';catalogLimit=60;$('#catalog-clear').disabled=true;renderCatalogRows();$('#catalog-search').focus()};$$('[data-market]').forEach(b=>b.onclick=()=>{catalogMarket=b.dataset.market;catalogLimit=60;$$('[data-market]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',x===b)});renderCatalogRows()});$('#catalog-more').onclick=()=>{catalogLimit+=60;renderCatalogRows()};renderCatalogRows()}catch(error){if(!dialog.open||requestGeneration!==dialogGeneration)return;$('#dialog-content').innerHTML='<h2 id="dialog-title">Каталог не загрузился</h2><p class="article-body">Проверьте соединение и попробуйте ещё раз.</p>'}}
function renderCatalogRows(){const list=state.companies.filter(c=>(catalogMarket==='all'||c.market===catalogMarket||(!c.market&&catalogMarket==='US'))&&(!catalogQuery||`${c.name} ${c.symbol} ${c.aliases||''}`.toLocaleLowerCase('ru').includes(catalogQuery)));$('#catalog-rows').innerHTML=list.slice(0,catalogLimit).map(row).join('')||'<div class="empty">Ничего не найдено</div>';$('#catalog-count').textContent=`Найдено ${list.length.toLocaleString('ru-RU')} · показано ${Math.min(list.length,catalogLimit)}`;$('#catalog-more').hidden=list.length<=catalogLimit}
$('#all-companies').onclick=openCatalog;$('#catalog-open').onclick=openCatalog;
const goTop=()=>window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});$('#nav-home').onclick=goTop;
$('#dialog-close').innerHTML=closeIcon;
$('#search-close').innerHTML=closeIcon;
$('#search-close').setAttribute('aria-label','Очистить или свернуть поиск');
$('#news-refresh').innerHTML=refreshIcon;
createScrollSearch({
  dialog,
  applyQuery(query) {
    state.feedLimit = 30;
    state.query = query;
    renderFeed();
  }
});
const hero = $('#hero');
const liquidBanner = createLiquidBanner(hero);
let introRunning = false;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function intro(replay = false) {
  if (introRunning) return;
  introRunning = true;
  const brand = $('#brand');
  const splash = $('#splash');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  brand.style.transition = 'none';
  hero.classList.remove('banner-visible');
  const previousPhase = hero.hasAttribute('data-gradient-phase')
    ? Number(hero.dataset.gradientPhase)
    : read('timu.gradientPhase', null);
  const phase = chooseGradientPhase(previousPhase);
  liquidBanner.reset(phase);
  save('timu.gradientPhase', phase);
  brand.classList.remove('light', 'landed');
  brand.dataset.tone = 'dark';
  splash.classList.remove('done');
  splash.style.transition = 'none';
  brand.style.transform = 'none';

  if (!reduced) {
    const bounds = brand.getBoundingClientRect();
    const dx = innerWidth / 2 - (bounds.left + bounds.width / 2);
    const dy = innerHeight / 2 - (bounds.top + bounds.height / 2);
    brand.style.transform = `translate(${dx}px, ${dy}px) scale(1.6)`;
    await wait(replay ? 80 : 200);
    splash.style.transition = 'opacity 950ms ease';
    brand.style.transition = 'transform 1150ms cubic-bezier(.76,0,.19,1)';
    splash.classList.add('done');
    brand.style.transform = 'translate(0,0) scale(1)';
    await wait(1150);
  } else {
    splash.classList.add('done');
  }

  brand.classList.add('landed');
  brand.style.transition = '';
  hero.dataset.logoLandedAt = String(Math.round(performance.now()));
  await wait(INTRO_HOLD_MS);
  liquidBanner.reveal();
  hero.classList.add('banner-visible');
  hero.dataset.bannerShownAt = String(Math.round(performance.now()));
  brand.classList.add('light');
  brand.dataset.tone = 'light';
  introRunning = false;
}
$('#brand').onclick=()=>{goTop();setTimeout(()=>intro(true),350)};
const newsTime=new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'});
let lastNewsStatus={},lastNewsSignature='';
function receiveNews(data){
  const signature=data.news.map(n=>n.id+':'+n.title+':'+n.summary+':'+n.impact+':'+n.priority+':'+n.priorityNote+':'+n.companyId+':'+n.publishedAt).join('|');
  if(signature===lastNewsSignature)return;
  lastNewsSignature=signature;
  const active=document.activeElement, focusId=active?.dataset.save||active?.dataset.news;
  const anchor=scrollY>350&&!['commodities','currency'].includes(state.filter)?$$('.news-card').find(el=>el.getBoundingClientRect().bottom>70):null;
  const anchorId=anchor?.dataset.newsId, anchorTop=anchor?.getBoundingClientRect().top;
  const savedItems=[...new Map([...state.news,...state.savedArticles].filter(n=>state.saved.has(n.id)&&!data.news.some(x=>x.id===n.id)).map(n=>[n.id,n])).values()];
  state.news=[...data.news,...savedItems];renderFeed();
  if(anchorId){const next=$$('.news-card').find(el=>el.dataset.newsId===anchorId);if(next){const delta=next.getBoundingClientRect().top-anchorTop;if(Math.abs(delta)>1)window.scrollBy({top:delta,behavior:'instant'})}}
  if(focusId){$$('[data-save],[data-news]').find(el=>(el.dataset.save||el.dataset.news)===focusId)?.focus({preventScroll:true})}
}
function showNewsStatus(status){
  lastNewsStatus={...lastNewsStatus,...status};
  $('#news-refresh').setAttribute('aria-disabled',Boolean(status.loading));$('#news-refresh').setAttribute('aria-busy',Boolean(status.loading));renderDataStatus();
}
function renderDataStatus(){
  const commodity=state.filter==='commodities',currency=state.filter==='currency',status=currency?lastCurrencyStatus:commodity?lastCommodityStatus:lastNewsStatus;
  const at=status.checkedAt||status.verifiedAt,dated=at&&Number.isFinite(Date.parse(at))?newsTime.format(new Date(at))+' МСК':'';
  const stale=status.stale||status.unavailable||status.mode==='snapshot'||status.mode==='cached'||status.snapshot;
  const waiting=currency?'Обновляем курсы…':commodity?'Обновляем цены…':'Проверяем новые события…';
  const saved=currency?'Сохранённые курсы':commodity?'Сохранённые цены':'Сохранённая лента';
  const done=currency||commodity?'Проверено':'Обновлено';
  const prefix=status.loading?waiting:stale?saved:status.recent?'Уже проверено недавно':status.partial||status.mode==='partial'?'Частично обновлено':done;
  $('#news-status').textContent=prefix+(dated?' · '+dated:'');$('#news-status').classList.toggle('stale',Boolean(stale));
  $('.feed-section>.data-note .status-dot').classList.toggle('checking',Boolean(status.loading));$('.feed-section>.data-note .status-dot').classList.toggle('stale',Boolean(stale));
}
const newsFeed=createNewsFeed({onData:receiveNews,onStatus:status=>showNewsStatus(status.loading?status:{unavailable:false,snapshot:false,...status})});
$('#news-refresh').onclick=()=>newsFeed.refresh(true);
$('#feed-more').onclick=()=>{state.feedLimit+=30;renderFeed()};
$('#news-filter').onclick=createNewsFilterDialog({openDialog,closeDialog,getDialogContent:()=>$('#dialog-content'),getFilters:()=>state.newsFilters,setFilters:filters=>{state.newsFilters=normalizeNewsFilters(filters);state.feedLimit=30;save('timu.newsFilters',state.newsFilters);renderFeed()}});
async function init(){
  intro();
  try{
    const [nr,cr]=await Promise.all([fetch('news.json'),fetch('assets/companies-core.json')]);
    if(!nr.ok||!cr.ok)throw Error('Нет соединения с данными');
    const [n,c]=await Promise.all([nr.json(),cr.json()]);
    state.news=normalizeNews(n);if(!fullCatalogLoaded)state.companies=Array.isArray(c)?c:c.companies;
    renderFeed();renderCompanies();showNewsStatus({...n,snapshot:true});
    setTimeout(()=>ensureCatalog().catch(()=>{}),1200);newsFeed.start();
  }catch(error){$('#feed').innerHTML='<div class="empty"><strong>Лента не загрузилась</strong><span>Проверьте соединение и повторите попытку.</span><button id="retry">Повторить</button></div>';$('#retry').onclick=init;console.error(error)}
}

document.addEventListener('visibilitychange', () => {
  commodityPanel.onVisibility();
  newsFeed.onVisibility();
});

document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement&&!e.target.src.endsWith('timu.png')){e.target.src='assets/timu.png';e.target.classList.add('fallback-logo');e.target.closest('.news-card,.company-mini')?.classList.add('missing-brand')}},true);
init();

