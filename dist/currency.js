import {refreshIcon} from './ui-icons.js';
import {bankLogo} from './bank-logos.js';
import {refreshFeedback} from './refresh-feedback.js';

const CURRENCIES={USD:{name:'Доллар США',symbol:'$'},EUR:{name:'Евро',symbol:'€'}};
const REFRESH_MS=5*60*1000,CACHE_KEY='timu.currency.v1';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:4,maximumFractionDigits:4});
const percentage=new Intl.NumberFormat('ru-RU',{style:'percent',maximumFractionDigits:2,minimumFractionDigits:2,signDisplay:'exceptZero'});
const points=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
const stamp=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Minsk'});
const day=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const safeURL=value=>{try{const url=new URL(value);return url.protocol==='https:'?url.href:null}catch{return null}};
const positive=value=>{if(value===null||value===''||typeof value==='boolean')return null;const n=Number(value);return Number.isFinite(n)&&n>0?n:null};
const dateText=value=>validDate(value)?(/^\d{4}-\d{2}-\d{2}$/.test(value)?day.format(new Date(value+'T12:00:00Z')):stamp.format(new Date(value))+' · по Минску'):'время не указано';

export function normalizeCurrencyData(data){
  if(!data||!Array.isArray(data.offers))throw Error('Курсы пока недоступны');
  const seen=new Set(),offers=[];
  for(const item of data.offers){
    if(!item||!String(item.bank||'').trim())continue;
    const rates={};
    for(const code of Object.keys(CURRENCIES)){
      const buy=positive(item.rates?.[code]?.buy),sell=positive(item.rates?.[code]?.sell);
      if(buy!==null||sell!==null)rates[code]={buy,sell};
    }
    if(!Object.keys(rates).length)continue;
    const id=String(item.id||`${item.bank}|${item.city||''}|${item.address||''}`);
    if(seen.has(id))continue;seen.add(id);
    offers.push({id,bank:String(item.bank),city:String(item.city||''),address:String(item.address||''),updatedAt:validDate(item.updatedAt)?item.updatedAt:null,sourceUrl:safeURL(item.sourceUrl),rates});
  }
  const forecasts={};
  for(const code of Object.keys(CURRENCIES)){
    const model=data.forecasts?.[code];
    if(!model||!validDate(model.asOf)||!Number.isFinite(model.estimatedChange)||!Number.isFinite(model.medianError)||model.medianError<0)continue;
    const age=Date.now()-Date.parse(model.asOf);
    if(age>=-86400000&&age<6*86400000)forecasts[code]=model;
  }
  return {checkedAt:validDate(data.checkedAt)?data.checkedAt:null,status:String(data.status||'unknown'),stale:Boolean(data.stale),source:{name:String(data.source?.name||'Источник курсов'),url:safeURL(data.source?.url)},coverage:{label:String(data.coverage?.label||'Полученные предложения банков Беларуси'),complete:data.coverage?.complete===true},offers,forecasts};
}

export function bestCurrencyOffers(offers,code){
  let buy=null,sell=null;
  for(const offer of offers){const rate=offer.rates?.[code];if(!rate)continue;
    if(rate.buy!==null&&Number.isFinite(rate.buy)&&(!buy||rate.buy>buy.rates[code].buy))buy=offer;
    if(rate.sell!==null&&Number.isFinite(rate.sell)&&(!sell||rate.sell<sell.rates[code].sell))sell=offer;
  }
  return {buy,sell};
}

function providerLink(offer,label){const url=offer?.sourceUrl;return url?`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`:escape(label)}
function location(offer){return [offer?.city,offer?.address].filter(Boolean).join(' · ')}
export function groupCurrencyBanks(offers){
  const groups=new Map();for(const offer of offers){if(!groups.has(offer.bank))groups.set(offer.bank,[]);groups.get(offer.bank).push(offer)}
  return [...groups].sort(([a],[b])=>a.localeCompare(b,'ru'));
}
function bankRate(offer,code,side){return `<div role="cell" class="currency-bank-rate">${offer?`<strong>${number.format(offer.rates[code][side])}</strong><span>${providerLink(offer,location(offer))}</span><small>${escape(dateText(offer.updatedAt))}</small>`:'—'}</div>`}
function bankRow([bank,offers],codes){return `<article class="currency-bank-row"><div class="currency-bank-heading"><div class="currency-bank-title">${bankLogo(bank)}<h4>${escape(bank)}</h4></div><p>Пунктов обмена в подборке: ${offers.length}</p></div><div class="currency-table" role="table" aria-label="Лучшие полученные курсы ${escape(bank)}"><div class="currency-table-head" role="row"><span role="columnheader">Валюта</span><span role="columnheader">Покупка банком</span><span role="columnheader">Продажа банком</span></div>${codes.map(code=>{const best=bestCurrencyOffers(offers,code);return `<div class="currency-table-row" role="row"><span role="rowheader">${code}</span>${bankRate(best.buy,code,'buy')}${bankRate(best.sell,code,'sell')}</div>`}).join('')}</div></article>`}

function forecastBadge(forecast){
  if(!forecast)return '';
  const value=Math.abs(forecast.estimatedChange)<0.00005?0:forecast.estimatedChange;
  const [tone,arrow]=value>0?['positive','↑']:value<0?['negative','↓']:['neutral','→'];
  const label='Оценка изменения официального курса НБРБ';
  return `<span class="currency-forecast-value ${tone}" aria-label="${label}: ${percentage.format(value)}" title="${label}"><span aria-hidden="true">${arrow}</span> ${percentage.format(value)}</span>`;
}

function winner(offer,code,side,forecast){
  const title=side==='buy'?`Продать ${code} банку`:`Купить ${code} у банка`;
  return `<div class="currency-best-side">
    <span class="currency-side-label">${title}</span>
    <div class="currency-rate"><span class="currency-rate-line"><strong>${offer?number.format(offer.rates[code][side]):'—'}</strong>${offer?forecastBadge(forecast):''}</span><small>BYN за 1 ${code}</small></div>
    ${offer?`<span class="currency-bank-name">${bankLogo(offer.bank)}${providerLink(offer,offer.bank)}</span>${location(offer)?`<span class="currency-location">${escape(location(offer))}</span>`:''}<span class="currency-offer-time">Обновлено: ${escape(dateText(offer.updatedAt))}</span>`:'<span class="currency-location">Предложений пока нет</span>'}
  </div>`;
}
function bestCard(code,offers,forecast){
  const best=bestCurrencyOffers(offers,code);
  const source='https://api.nbrb.by/exrates/rates/'+(code==='USD'?'431':'451');
  const note=forecast?`<p class="currency-forecast-note">Оценка на следующее обновление <a href="${source}" target="_blank" rel="noopener noreferrer">курса НБРБ</a> по данным на ${escape(dateText(forecast.asOf))}. Типичная ошибка на истории — ${points.format(forecast.medianError*100)} п. п. ${Math.abs(forecast.estimatedChange)<forecast.medianError?'Сигнал слабый. ':''}Курсы отделений меняются отдельно.</p>`:'<p class="currency-forecast-note">Для оценки направления пока нет свежего ряда НБРБ.</p>';
  return `<section class="currency-card" aria-label="Лучшие полученные курсы ${code}">
    <span class="market-card-mark" aria-hidden="true"><span class="currency-mark">${CURRENCIES[code].symbol}</span></span>
    <div class="market-card-surface">
      <div class="currency-card-title"><div><h3>${CURRENCIES[code].name}</h3><span>${code} / BYN</span></div></div>
      <div class="currency-best-grid">${winner(best.buy,code,'buy',forecast)}${winner(best.sell,code,'sell',forecast)}</div>
      ${note}
    </div>
  </section>`;
}

export function createCurrencyPanel(root,{onStatus=()=>{}}={}){
  let active=false,busy=false,data=null,query='',expanded=false,limit=40,timer=null,controller=null,generation=0,lastSuccess=0,notice='',cached=false,pending=null,recent=false;
  try{const stored=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(stored){data=normalizeCurrencyData(stored);cached=true}}catch{}
  function report(){onStatus({loading:busy,checkedAt:data?.checkedAt||null,snapshot:cached,unavailable:Boolean(notice)&&!data?.offers.length,partial:Boolean(notice)||Boolean(data?.stale)||data?.status==='partial',stale:cached||Boolean(data?.stale),recent});}
  function selection(){
    const q=query.trim().toLocaleLowerCase('ru'),codes=/^(usd|доллар(ы|а)?|\$)$/.test(q)?['USD']:/^(eur|евро|€)$/.test(q)?['EUR']:['USD','EUR'];
    const currencyQuery=codes.length===1||['валюта','валюты','курс','курсы','byn','беларусь'].includes(q);
    const offers=(data?.offers||[]).filter(offer=>!q||currencyQuery||`${offer.bank} ${offer.city} ${offer.address}`.toLocaleLowerCase('ru').includes(q));
    return {offers,codes};
  }
  function render(){
    report();if(!active)return;
    const focused=root.contains(document.activeElement)?document.activeElement.closest('[data-currency-action]')?.dataset.currencyAction:null;
    const {offers,codes}=selection(),banks=new Set(offers.map(offer=>offer.bank)),hasData=Boolean(data?.offers.length);
    const sourceURL=data?.source.url;
    if(data?.status==='partial'&&!notice)notice='Часть источников пока недоступна. Лучшие курсы выбраны из полученных предложений.';
    root.innerHTML=`<div class="currency-heading"><div><p class="eyebrow">БЕЛАРУСЬ · НАЛИЧНЫЙ ОБМЕН</p><h2>Валюта</h2></div><button type="button" class="refresh-control" data-currency-action="refresh" aria-label="Обновить курсы валют" aria-busy="${busy}" aria-disabled="${busy}">${refreshIcon}</button></div>${hasData?`<p class="currency-caption">${query.trim()?'Лучшие среди найденных предложений':'Лучшие из полученных предложений'} · BYN за единицу валюты</p>`:''}${notice||cached||data?.stale?`<p class="currency-notice" role="status">${escape(notice||(cached?'Показаны сохранённые курсы. Проверяем обновления…':'Источник вернул сохранённые курсы.'))}</p>`:''}${hasData?`${offers.length?`<div class="currency-cards">${codes.map(code=>bestCard(code,offers,data.forecasts[code])).join('')}</div><button class="currency-expand" type="button" data-currency-action="expand" aria-expanded="${expanded}" aria-controls="currency-bank-list"><span>${expanded?'Скрыть банки':'Все банки'}</span><span class="currency-bank-count">${banks.size}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button><div id="currency-bank-list" class="currency-bank-list" ${expanded?'':'hidden'}><p class="currency-list-caption">${'Лучшие курсы каждого банка'} · ${banks.size}</p>${expanded?groupCurrencyBanks(offers).slice(0,limit).map(bank=>bankRow(bank,codes)).join(''):''}${expanded&&banks.size>limit?'<button type="button" class="small-button currency-more" data-currency-action="more">Показать ещё</button>':''}</div>`:'<div class="currency-empty"><strong>Банки не найдены</strong><p>Попробуйте название банка, город, USD или EUR.</p></div>'}<p class="currency-coverage">${escape(data.coverage.label)}${data.coverage.complete?'':' · список ограничен данными источника'}</p><p class="currency-source">${sourceURL?`<a href="${escape(sourceURL)}" target="_blank" rel="noopener noreferrer">${escape(data.source.name)}</a>`:escape(data.source.name)}<span>Курс зависит от отделения и может измениться до обмена.</span></p>`:`<div class="currency-empty" role="status"><strong>${busy?'Получаем курсы банков…':'Курсы пока недоступны'}</strong><p>${busy?'USD и EUR появятся после ответа источника.':'Сейчас не удалось получить предложения банков. Попробуйте обновить данные.'}</p>${busy?'':'<button type="button" class="small-button" data-currency-action="refresh">Повторить</button>'}</div>`}`;
    if(focused)root.querySelector(`[data-currency-action="${focused}"]`)?.focus({preventScroll:true});
  }
  function schedule(){clearTimeout(timer);if(active&&!document.hidden)timer=setTimeout(()=>refresh(),REFRESH_MS)}
  function cancel(){clearTimeout(timer);generation++;controller?.abort();controller=null;busy=false;pending=null;}
  async function refresh(manual=false){
    if(!active||document.hidden)return;if(busy)return pending;
    const feedback=refreshFeedback(manual);
    clearTimeout(timer);const request=++generation;controller=new AbortController();const requestController=controller,signal=requestController.signal;busy=true;notice='';recent=false;render();
    const timeout=setTimeout(()=>requestController.abort(),45000);
    pending=(async()=>{
      try{
        const response=await fetch(manual?'/api/currency?force=1':'/api/currency',{signal,headers:{Accept:'application/json'},cache:'no-store'});
        if(!response.ok)throw Error('Курсы пока недоступны');
        const next=normalizeCurrencyData(await response.json());
        if(request!==generation||signal.aborted)return;
        recent=Boolean(manual&&next.checkedAt&&next.checkedAt===data?.checkedAt);
        if(!next.offers.length){if(data?.offers.length){cached=true;notice='Источник пока не вернул предложения. Показаны последние сохранённые курсы.'}else{data=next;notice='Источник пока не вернул предложения банков.'}}else{data=next;cached=false;lastSuccess=Date.now();if(data.stale)notice='Источник недоступен. Показаны сохранённые курсы.';try{localStorage.setItem(CACHE_KEY,JSON.stringify(data))}catch{}}
      }catch(error){if(request!==generation)return;notice=data?.offers.length?'Не удалось обновить курсы. Показаны сохранённые данные.':'Не удалось связаться с источником курсов.';cached=Boolean(data?.offers.length)}
      finally{clearTimeout(timeout);await feedback();if(request===generation){busy=false;controller=null;pending=null;if(active)render();schedule()}}
    })();
    return pending;
  }
  function visibility(){if(document.hidden){cancel();report()}else if(active){render();if(!lastSuccess||Date.now()-lastSuccess>=REFRESH_MS||cached)refresh();else schedule()}}
  function click(event){const button=event.target.closest('[data-currency-action]');if(!button||!root.contains(button))return;switch(button.dataset.currencyAction){case'refresh':refresh(true);break;case'expand':expanded=!expanded;render();break;case'more':limit+=40;render();break}}
  root.addEventListener('click',click);document.addEventListener('visibilitychange',visibility);
  return {
    setActive(value){if(active===Boolean(value))return;active=Boolean(value);root.hidden=!active;if(!active){cancel();return}render();if(!lastSuccess||Date.now()-lastSuccess>=REFRESH_MS||cached)refresh();else schedule()},
    setQuery(value){value=String(value||'');if(query===value)return;query=value;limit=40;if(active)render()},
    refresh,
    onVisibility:visibility,
    destroy(){active=false;cancel();root.removeEventListener('click',click);document.removeEventListener('visibilitychange',visibility)}
  };
}
