import {refreshIcon} from './ui-icons.js';
import {refreshFeedback} from './refresh-feedback.js';
import {COMMODITIES, COMMODITY_SNAPSHOT, fetchCommodity} from './commodity-source.js';
import {MONTHLY_COMMODITIES} from './commodity-monthly.js';
import {CHART_PERIODS, buildDotChartModel, renderDotChart, bindDotChartInspection, bindChartPeriodWheel} from './dot-chart.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numbers = new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
const dates = new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const months = new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'});
const quoteDates=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'});
const shortDates = new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'});
const shortMonths = new Intl.DateTimeFormat('ru-RU',{month:'short',year:'2-digit',timeZone:'UTC'});
const compactNumbers = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1,notation:'compact'});
const PALETTES={XAU:['#e2cb97','#ac8747'],XAG:['#d8e0e8','#8e9dab'],XPT:['#c6dadd','#738e97'],XPD:['#d9cfe5','#9283ab'],WB_COPPER:['#edbd9d','#b5785a'],WB_ALUMINUM:['#d8e3e0','#8a9f9b'],WB_NICKEL:['#d5e0b9','#8b9c6a'],WB_ZINC:['#cadaee','#7a95b3'],WB_BRENT:['#a9b7c4','#617886'],WB_GAS_US:['#bee1e8','#75a6b3']};
const LABELS={XAU:'Золото',XAG:'Серебро',XPT:'Платина',XPD:'Палладий',WB_COPPER:'Медь',WB_ALUMINUM:'Алюминий',WB_NICKEL:'Никель',WB_ZINC:'Цинк',WB_BRENT:'Нефть Brent',WB_GAS_US:'Природный газ'};
const CODES={XAU:'Au',XAG:'Ag',XPT:'Pt',XPD:'Pd',WB_COPPER:'Cu',WB_ALUMINUM:'Al',WB_NICKEL:'Ni',WB_ZINC:'Zn',WB_BRENT:'Br',WB_GAS_US:'NG'};
const COUNTRIES={WORLD:'Мир',RU:'Россия',BY:'Беларусь'};
const MARKETS=Object.keys(COUNTRIES);
const PERIOD_LABELS={'1M':'1М','3M':'3М','1Y':'1Г','ALL':'Всё'};
const WHEEL_PERIODS=CHART_PERIODS.slice(0,3);
const validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const date=value=>validDate(value)?dates.format(new Date(value)):'дата не указана';
const safeURL=value=>{try{const url=new URL(value);return url.protocol==='https:'?url.href:null}catch{return null}};
const delay=(ms,signal)=>new Promise(resolve=>{if(signal.aborted)return resolve();const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',finish);resolve()};const timer=setTimeout(finish,ms);signal.addEventListener('abort',finish,{once:true})});
const sourceObject=item=>typeof item?.source==='object'?item.source:{name:item?.source||'Источник',url:item?.sourceURL};

function pointsFrom(history){
  const seen=new Map();
  for(const point of Array.isArray(history)?history:[]){const rawDate=point.date||point.period&&point.period+'-01',price=Number(point.price??point.close??point.value);if(validDate(rawDate)&&price>0&&Number.isFinite(price))seen.set(rawDate.slice(0,10),{date:rawDate.slice(0,10),price});}
  return [...seen.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function initialItems(){
  return [...COMMODITIES.filter(item=>item.symbol!=='HG').map(item=>({...item,...COMMODITY_SNAPSHOT[item.symbol],frequency:'spot',history:[],regions:{}})),...MONTHLY_COMMODITIES.map(item=>({...item,frequency:'monthly',history:pointsFrom(item.history),regions:{}}))].map(item=>normalizeItem(item));
}
function normalizeRegion(region){
  if(!region||!Number.isFinite(Number(region.price))||Number(region.price)<=0)return null;
  return {...region,price:Number(region.price),updatedAt:region.updatedAt||region.date,kind:region.kind||region.type||'converted',fxDate:region.fxDate||region.fx?.date,fxRate:region.fxRate||region.fx?.rate,fxSource:region.fxSource||region.fx?.source,methodology:region.methodology||region.source?.method,source:sourceObject(region),history:pointsFrom(region.history)};
}
function normalizeItem(item,previous={}){
  const id=item.id||item.symbol,merged={...previous,...item,id};
  return {...merged,price:Number(merged.price),name:LABELS[id]||merged.name,code:CODES[id]||merged.code,symbol:merged.symbol||id,currency:merged.currency||'USD',source:sourceObject(merged),frequency:merged.frequency||merged.cadence||'spot',period:(merged.frequency||merged.cadence)==='monthly'?(merged.dataAsOf||merged.updatedAt||merged.period||'').slice(0,7):merged.period,history:pointsFrom(merged.history),regions:{RU:normalizeRegion(merged.regions?.RU),BY:normalizeRegion(merged.regions?.BY)}};
}
function selectedPoints(points,period){
  if(!points.length||period==='ALL')return points;
  const last=new Date(points.at(-1).date+'T12:00:00Z'),day=last.getUTCDate();last.setUTCDate(1);last.setUTCMonth(last.getUTCMonth()-({ '1M':1,'3M':3,'1Y':12 }[period]||12));
  const end=new Date(last);end.setUTCMonth(end.getUTCMonth()+1,0);last.setUTCDate(Math.min(day,end.getUTCDate()));
  const cutoff=last.toISOString().slice(0,10);return points.filter(point=>point.date>=cutoff);
}
function resourceIdentifier(item) {
  return String(item.symbol).replace(/^WB_/, '').replaceAll('_', ' ');
}

function mark(item, large = false) {
  const [light, dark] = PALETTES[item.id] || PALETTES.XAG;
  return `<span class="resource-mark${large ? ' large' : ''}" style="--metal-light:${light};--metal-dark:${dark}"><strong>${escape(item.code)}</strong><span>${escape(resourceIdentifier(item))}</span></span>`;
}
function regionChip(region,key){return `<span class="resource-region"><span>${COUNTRIES[key]}<small>${region?region.kind==='official'?'учётная цена':'пересчёт':'нет данных'}</small></span><strong>${region?numbers.format(region.price):'—'}${region?`<small>${escape(region.currency)} / ${escape(region.unit||'ед.')}</small>`:''}</strong>${region?`<span class="resource-region-date">${escape(date(region.updatedAt))}</span>`:''}</span>`;}
function periodCaption(item){return item.frequency==='monthly'&&item.period&&validDate(item.period+'-01')?'Среднее · '+months.format(new Date(item.period+'-01T12:00:00Z')):validDate(item.updatedAt)?quoteDates.format(new Date(item.updatedAt))+' МСК':'дата не указана';}
function sourceLink(source){const url=safeURL(source?.url||source?.sourceURL);return url?`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(source.name||source.title||'Источник')}</a>`:escape(source?.name||'Источник не указан');}

function resourceCard(item) {
  const amount = Number.isFinite(item.price) ? numbers.format(item.price) : '—';
  return `<button type="button" class="resource-card" data-resource="${escape(item.id)}" aria-label="${escape(item.name)} — цены и история">
    <span class="market-card-mark" aria-hidden="true">${mark(item)}</span>
    <span class="market-card-surface">
      <span class="resource-body">
        <span class="resource-title"><strong>${escape(item.name)}</strong></span>
        <span class="resource-price">${amount}<small>${escape(item.currency)} / ${escape(item.unit || 'ед.')}</small></span>
        <span class="resource-date">${escape(periodCaption(item))}</span>
      </span>
      <span class="resource-regions">${regionChip(item.regions?.RU,'RU')}${regionChip(item.regions?.BY,'BY')}</span>
    </span>
  </button>`;
}

export function createCommodityPanel(root,{openDialog,getDialogContent,onStatus=()=>{},renderPurchaseOffers=()=>{}}={}){
  let snapshotLoaded=false,active=false,busy=false,query='',timer,controller,lastDataCheck=0,notice='',recent=false,requestGeneration=0,pendingRootRender=false;
  let items=initialItems(),detailId=null,detailMarket='WORLD',detailPeriod='3M';
  try{const cached=JSON.parse(localStorage.getItem('timu.resources.v2')||'null');if(Array.isArray(cached))items=items.map(item=>{const saved=cached.find(row=>row.id===item.id);return saved&&Number.isFinite(saved.price)&&saved.price>0?normalizeItem(saved,item):item})}catch{}
  function detailRoot(){
    const container=getDialogContent?.();
    const dialog=container?.closest('dialog');
    if(dialog&&!dialog.open)return null;
    const detail=container?.querySelector('[data-resource-detail]');
    return detail?.dataset.resourceDetail===detailId?detail:null;
  }
  function render(){
    onStatus({loading:busy,checkedAt:lastDataCheck?new Date(lastDataCheck).toISOString():null,snapshot:!lastDataCheck,unavailable:notice.startsWith('Нет связи'),partial:Boolean(notice),recent});
    if(getDialogContent?.()?.closest('dialog')?.open){pendingRootRender=true;return;}
    pendingRootRender=false;
    const focused=root.contains(document.activeElement)?document.activeElement.closest('[data-resource]')?.dataset.resource:null;
    const refreshFocused=root.contains(document.activeElement)&&document.activeElement.matches('[data-resource-refresh]');
    const list=items.filter(item=>`${item.name} ${item.symbol} ${resourceIdentifier(item)} ${item.code} ${item.id==='WB_GAS_US'?'газ энергия':''} ${item.id==='WB_BRENT'?'нефть энергия':''}`.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));
    root.innerHTML=`<div class="commodity-heading resource-heading"><div><p class="eyebrow">МЕТАЛЛЫ И ЭНЕРГИЯ</p><h2>Сырьё<span class="resource-count">${list.length}</span></h2></div><button class="refresh-control" data-resource-refresh aria-label="Обновить цены" aria-busy="${busy}" aria-disabled="${busy}">${refreshIcon}</button></div><div class="resource-list">${list.map(resourceCard).join('')}</div>${!list.length?'<div class="empty"><strong>Ничего не найдено</strong><span>Попробуйте «золото», «медь» или «нефть».</span></div>':''}`;
    if(focused)[...root.querySelectorAll('[data-resource]')].find(button=>button.dataset.resource===focused)?.focus({preventScroll:true});
    else if(refreshFocused)root.querySelector('[data-resource-refresh]')?.focus({preventScroll:true});
  }
  function viewFor(item){
    const region=detailMarket==='WORLD'?item:item.regions?.[detailMarket];if(!region)return null;
    let history=pointsFrom(region.history);
    if(detailMarket==='WORLD'&&item.frequency==='spot'&&item.historyFrequency==='monthly'&&history.length){const last=history.at(-1);return {...region,history,price:last.price,updatedAt:last.date,frequency:'monthly',source:sourceObject({source:item.historySource}),note:'История показывает месячные средние World Bank. Индикативная текущая цена на карточке и средняя за месяц — разные показатели.'};}
    if(!history.length&&Number.isFinite(region.price)&&validDate(region.updatedAt))history=[{date:region.updatedAt.slice(0,10),price:region.price}];
    return {...region,history,source:sourceObject(region)};
  }
  function detailShell(item){
    return `<div data-resource-detail="${escape(item.id)}">
      <div class="resource-detail-heading">
        ${mark(item,true)}
        <div><p class="eyebrow">МЕТАЛЛЫ И ЭНЕРГИЯ</p><h2 id="dialog-title">${escape(item.name)}</h2><p data-resource-kind></p></div>
      </div>
      <div class="resource-market-tabs" role="group" aria-label="Регион цены">
        ${MARKETS.map(key=>`<button type="button" data-resource-market="${key}" aria-pressed="${key===detailMarket}">${COUNTRIES[key]}</button>`).join('')}
      </div>
      <div data-resource-quote></div>
      <div class="resource-period-tabs" role="group" aria-label="Период истории">
        ${CHART_PERIODS.map(key=>`<button type="button" data-resource-period="${key}" aria-pressed="${key===detailPeriod}">${PERIOD_LABELS[key]}</button>`).join('')}
      </div>
      <div data-resource-chart-area>
        <div class="resource-chart-wrap chart-wrap" data-resource-chart></div>
        <div class="resource-chart-readout" id="chart-tooltip" data-chart-readout></div>
        <div class="resource-chart-summary" data-resource-summary></div>
      </div>
      <div data-purchase-offers></div>
      <div class="resource-method" data-resource-method></div>
    </div>`;
  }

  function setSelection(buttons,key,dataKey){
    for(const button of buttons){
      const active=button.dataset[dataKey]===key;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    }
  }

  function bindDetail(detail){
    const marketTabs=detail.querySelector('.resource-market-tabs');
    marketTabs.addEventListener('click',event=>{
      const button=event.target.closest('[data-resource-market]');
      if(!button||button.dataset.resourceMarket===detailMarket)return;
      detailMarket=button.dataset.resourceMarket;
      renderDetail();
    });
    detail.querySelector('.resource-period-tabs').addEventListener('click',event=>{
      const button=event.target.closest('[data-resource-period]');
      if(!button||button.dataset.resourcePeriod===detailPeriod)return;
      detailPeriod=button.dataset.resourcePeriod;
      renderDetail();
    });
    const chartArea=detail.querySelector('[data-resource-chart-area]');
    bindChartPeriodWheel(chartArea,direction=>{
      const current=detailPeriod==='ALL'?WHEEL_PERIODS.length:WHEEL_PERIODS.indexOf(detailPeriod);
      const next=WHEEL_PERIODS[current+direction];
      if(!next)return;
      detailPeriod=next;
      renderDetail();
    },{canHandle:()=>chartArea.dataset.hasHistory==='true'});
  }

  function renderResourceChart(detail,view){
    const history=view?.history||[];
    const points=selectedPoints(history,detailPeriod).map(point=>({date:point.date,close:point.price}));
    const last=points.at(-1);
    const chart=detail.querySelector('[data-resource-chart]');
    const readout=detail.querySelector('[data-chart-readout]');
    const wasFocused=chart.contains(document.activeElement);
    const monthly=view?.frequency==='monthly';
    const formatDate=(value,long)=>monthly
      ? (long?months:shortMonths).format(new Date(value+'T12:00:00Z'))
      : long?date(value):shortDates.format(new Date(value+'T12:00:00Z'));
    const describe=point=>`${formatDate(point.date,true)} · ${numbers.format(point.close)} ${view.currency}`;

    const wheelEnabled=history.length>1;
    chart.parentElement.dataset.hasHistory=String(wheelEnabled);
    const model=buildDotChartModel(points);
    chart.innerHTML=model
      ? renderDotChart(points,{model,formatDate,wheelEnabled,formatValue:value=>compactNumbers.format(value)})
      : '<p class="resource-chart-empty">В этом периоде нет опубликованных наблюдений.</p>';
    readout.hidden=!last;
    readout.textContent=last?describe(last):'';

    if(model){
      const svg=chart.querySelector('.dot-price-chart');
      bindDotChartInspection(svg,{
        points,model,
        onInspect:point=>{readout.textContent=describe(point);},
        onReset:()=>{readout.textContent=describe(last);},
      });
      if(wasFocused)svg.focus({preventScroll:true});
    }

    const change=points.length>1?last.close/points[0].close-1:null;
    const summary=detail.querySelector('[data-resource-summary]');
    summary.innerHTML=`<span>Наблюдений: ${points.length}${points.length===1?' · для изменения нужны две даты':''}</span>${change!==null?`<strong class="${change>0?'positive':change<0?'negative':''}">${change>0?'+':''}${(change*100).toFixed(2).replace('.',',')}% <small>между первой и последней точками</small></strong>`:''}`;
  }

  function renderDetail(firstOpen=false){
    const item=items.find(row=>row.id===detailId);
    if(!item)return;
    if(firstOpen){
      if(typeof openDialog!=='function')return;
      openDialog(detailShell(item));
    }
    const detail=detailRoot();
    if(!detail)return;
    if(firstOpen)bindDetail(detail);

    const marketChanged=detail.dataset.market!==detailMarket;
    detail.dataset.market=detailMarket;
    const view=viewFor(item);
    let kind='Цена для региона';
    if(detailMarket==='WORLD'){
      kind=view?.frequency==='monthly'?'Мировая средняя за месяц':'Индикативная цена';
    }else if(view){
      kind=view.kind==='official'?'Официальная учётная цена':'Валютный пересчёт';
    }
    detail.querySelector('[data-resource-kind]').textContent=kind;

    const marketTabs=detail.querySelector('.resource-market-tabs');
    marketTabs.style.setProperty('--market-index',MARKETS.indexOf(detailMarket));
    setSelection(marketTabs.querySelectorAll('[data-resource-market]'),detailMarket,'resourceMarket');
    setSelection(detail.querySelectorAll('[data-resource-period]'),detailPeriod,'resourcePeriod');

    detail.querySelector('[data-resource-quote]').innerHTML=view
      ? `<div class="resource-detail-quote"><strong>${Number.isFinite(view.price)?numbers.format(view.price):'—'}<small>${escape(view.currency)} / ${escape(view.unit||'ед.')}</small></strong><span>${escape(date(view.updatedAt))}</span></div>`
      : '<p class="resource-unavailable">Данные для этого региона пока не получены.</p>';
    renderResourceChart(detail,view);

    if(marketChanged){
      const host=document.createElement('div');
      host.dataset.purchaseOffers='';
      detail.querySelector('[data-purchase-offers]').replaceWith(host);
      renderPurchaseOffers(host,{item,market:detailMarket});
    }

    let methodology='';
    if(detailMarket==='WORLD'){
      methodology=view?.frequency==='monthly'
        ? 'График показывает средние цены за опубликованные месяцы. Каждая колонка относится к своему месяцу.'
        : 'Показаны полученные наблюдения поставщика. По одной опубликованной цене нельзя рассчитать изменение.';
    }else if(view){
      methodology=view.kind==='official'
        ? 'Центральный банк публикует учётную цену для оценки металла. У продавцов слитков действуют собственные цены и условия.'
        : 'Показан пересчёт международной цены по опубликованному валютному курсу. Местные продавцы устанавливают свои цены.';
    }
    const fxRate=view?.fxRate?' · '+numbers.format(view.fxRate)+' '+escape(view.currency)+' за 1 USD':'';
    detail.querySelector('[data-resource-method]').innerHTML=`<h3>Как читать эти данные</h3>
      ${methodology?`<p>${methodology}</p>`:''}
      ${view?.note||view?.methodology?`<p>${escape(view.note||view.methodology)}</p>`:''}
      ${view?.fxDate?`<p>Дата курса — ${escape(date(view.fxDate))}${fxRate}.</p>`:''}
      <p>Выбранный период отсчитывается от последнего доступного наблюдения. График показывает опубликованные значения.</p>
      <div class="resource-detail-source">${sourceLink(view?.source||item.source)}${view?.fxSource?sourceLink(typeof view.fxSource==='string'?{name:'Источник валютного курса',url:view.fxSource}:view.fxSource):''}</div>`;
  }
  root.addEventListener('click',event=>{const button=event.target.closest('[data-resource]');if(button&&root.contains(button)){detailId=button.dataset.resource;detailMarket='WORLD';detailPeriod='3M';renderDetail(true);}else if(event.target.closest('[data-resource-refresh]'))refresh(true)});
  document.addEventListener('close',event=>{if(event.target===getDialogContent?.()?.closest('dialog')&&pendingRootRender&&active)render();},true);
  function schedule(){clearTimeout(timer);if(active&&!document.hidden)timer=setTimeout(()=>refresh(),60_000)}
  function mergeRegional(data){
    if(!Array.isArray(data?.items))throw Error('Неверный формат');
    items=items.map(item=>{
      const update=data.items.find(row=>(row.id||row.symbol)===item.id);if(!update||!Number.isFinite(Number(update.price))||Number(update.price)<=0)return item;
      const keepQuote=item.frequency==='spot'&&Date.parse(item.updatedAt)>Date.parse(update.updatedAt);
      return normalizeItem(keepQuote?{...update,price:item.price,updatedAt:item.updatedAt,status:item.status}:update,item);
    });
  }
  async function refresh(manual=false){
    if(busy||!active||document.hidden)return;
    const feedback=refreshFeedback(manual);
    const generation=++requestGeneration;
    busy=true;notice='';recent=false;controller=new AbortController();const signal=controller.signal;
    render();
    let serverData=null,liveSuccess=0;
    try{
      if(!snapshotLoaded){
        try{
          const r=await fetch('data/commodity-regions.json',{signal,cache:'no-cache'});
          if(r.ok){
            const data=await r.json();
            if(!signal.aborted){mergeRegional(data);lastDataCheck=Date.parse(data.updatedAt)||0;render()}
          }
        }catch{}
        snapshotLoaded=!signal.aborted;
      }
      if(signal.aborted)return;
      try{
        const r=await fetch(manual?'/api/commodities?force=1':'/api/commodities',{
          signal:AbortSignal.any([signal,AbortSignal.timeout(45_000)]),
          headers:{Accept:'application/json'},cache:'no-store',
        });
        if(!r.ok)throw Error('Нет связи');
        const data=await r.json();
        if(!signal.aborted){mergeRegional(data);serverData=data}
      }catch{}
      if(signal.aborted)return;
      if(!serverData||['cached','unavailable'].includes(serverData.status)){
        await Promise.all(COMMODITIES.filter(row=>row.symbol!=='HG').map(async(metal,index)=>{
          if(index)await delay(index*1200,signal);
          if(signal.aborted)return;
          try{
            const quote=await fetchCommodity(metal.symbol,{signal});
            if(signal.aborted)return;
            items=items.map(item=>item.id===metal.symbol&&!(Date.parse(item.updatedAt)>Date.parse(quote.updatedAt))?normalizeItem({...item,...quote},item):item);
            if(quote.status==='live')liveSuccess++;
          }catch{}
        }));
      }
      if(!signal.aborted){
        const checkedAt=Date.parse(serverData?.updatedAt)||0;
        const fresh=serverData&&!['cached','unavailable'].includes(serverData.status);
        recent=Boolean(manual&&fresh&&checkedAt&&checkedAt===lastDataCheck);
        lastDataCheck=liveSuccess?Date.now():Math.max(checkedAt,lastDataCheck);
        notice=!fresh&&!liveSuccess?'Нет связи · показаны сохранённые данные':
          !fresh||serverData.status==='partial'?'Проверены не все источники':'';
        try{localStorage.setItem('timu.resources.v2',JSON.stringify(items))}catch{}
      }
    }finally{
      await feedback();
      if(generation!==requestGeneration)return;busy=false;controller=null;
      if(active){render();renderDetail();schedule()}
    }
  }

  return {
    setActive(value){if(active===value)return;active=value;root.hidden=!value;clearTimeout(timer);if(!value){controller?.abort();return;}render();if(!busy)refresh();},
    setQuery(value){if(query===value)return;query=value;if(active)render();},
    onVisibility(){clearTimeout(timer);if(document.hidden)controller?.abort();else if(active&&!busy)refresh();},
  };
}
