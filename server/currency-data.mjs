import fs from 'node:fs/promises';
const STORE=new URL('../dist/data/currency-cache.json',import.meta.url);
const CITIES=[['minsk','Минск'],['brest','Брест'],['vitebsk','Витебск'],['gomel','Гомель'],['grodno','Гродно'],['mogilev','Могилёв']];
const BANK_URL='https://belarusbank.by/api/kursExchange';
const clean=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
const rate=value=>{const n=Number(value);return Number.isFinite(n)&&n>0&&n<100?n:null};
const months=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
function minskTime(date,time){if(!date||!time)return null;const value=date+'T'+time+':00+03:00';return Number.isFinite(Date.parse(value))?new Date(value).toISOString():null}
export function parseMyfin(html,city){
  const header=clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  const dated=header.match(/на (\d{1,2}) ([а-я]+) (\d{4})/i),month=dated?months.indexOf(dated[2].toLowerCase()):-1;
  const numeric=header.match(/на (\d{2})\.(\d{2})\.(\d{4})/);
  const date=dated&&month>=0?`${dated[3]}-${String(month+1).padStart(2,'0')}-${dated[1].padStart(2,'0')}`:numeric?`${numeric[3]}-${numeric[2]}-${numeric[1]}`:null;
  const rows=[...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(m=>m[0]),names=new Map(),offers=[];
  for(const row of rows){if(!/data-row-type="default"/.test(row))continue;const alias=row.match(/data-bank-sef-alias="([^"]+)"/)?.[1],name=row.match(/<img[^>]+alt="([^"]+)"/)?.[1];if(alias&&name)names.set(alias,clean(name))}
  for(const row of rows){
    const alias=row.match(/data-bank-sef-alias="([^"]+)"/)?.[1];
    const branch=row.match(/<a\b[^>]*class="currencies-courses__branch-name"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const raw=row.match(/<input\b[^>]*data-branch-converter="rates"[^>]*value="([^"]+)"/i)?.[1];
    if(!branch||!raw||!names.has(alias))continue;
    let data;try{data=JSON.parse(clean(raw))}catch{continue}
    const rates={};for(const code of ['USD','EUR'])if(data[code]?.multiplier===1){rates[code]={buy:rate(data[code].buy),sell:rate(data[code].sell)}}
    if(!Object.values(rates).some(r=>r.buy||r.sell))continue;
    const time=row.match(/ic-update-time[^>]*><\/i>\s*(\d{1,2}:\d{2})/i)?.[1];
    const path=branch[1];if(!path.startsWith('/bank/'))continue;
    offers.push({id:'myfin:'+path,bank:names.get(alias),bankAlias:alias,city,address:clean(branch[2]).replace(/^г\.\s*[^,]+,\s*/,''),updatedAt:minskTime(date,time?.padStart(5,'0')),sourceUrl:'https://myfin.by'+path,rates});
  }
  if(!offers.length)throw Error('Не распознаны отделения '+city);
  return offers;
}
export function parseBelarusbank(data){
  if(!Array.isArray(data))throw Error('Некорректный ответ Беларусбанка');
  return data.flatMap(item=>{
    if(!item.filial_id||!item.name)return [];
    const rates={};for(const code of ['USD','EUR'])rates[code]={buy:rate(item[code+'_in']),sell:rate(item[code+'_out'])};
    if(!Object.values(rates).some(r=>r.buy||r.sell))return [];
    const time=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(item.kurs_date_time||'')?item.kurs_date_time.replace(' ','T')+'+03:00':null;
    return [{id:'belarusbank:'+item.filial_id,bank:'Беларусбанк',bankAlias:'belarusbank',city:clean(item.name),address:clean([item.street_type,item.street,item.home_number,item.filials_text].filter(Boolean).join(' ')),updatedAt:time&&Number.isFinite(Date.parse(time))?new Date(time).toISOString():null,sourceUrl:'https://belarusbank.by/fizicheskim_licam/obmen_valyut',rates}];
  });
}
async function fetchText(url){const r=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{Accept:'text/html,application/json','User-Agent':'timu-local/0.5'}});if(!r.ok)throw Error('HTTP '+r.status);const text=await r.text();if(text.length>8000000)throw Error('Слишком большой ответ');return text}
let cache=null,loading,pending,lastAttempt=0,lastResponse;
async function refresh(){
  const checkedAt=new Date().toISOString(),sources=[],errors=[],offers=[];
  const jobs=[...CITIES.map(([slug,city])=>({url:'https://myfin.by/currency/'+slug,label:city,parse:text=>parseMyfin(text,city)})),{url:BANK_URL,label:'Беларусбанк',parse:text=>parseBelarusbank(JSON.parse(text))}];
  for(let start=0;start<jobs.length;start+=4){await Promise.all(jobs.slice(start,start+4).map(async job=>{try{const items=job.parse(await fetchText(job.url));if(!items.length)throw Error('Нет предложений');offers.push(...items);sources.push({name:job.label,url:job.url,count:items.length,status:'ok'})}catch(e){errors.push({source:job.label,message:e.message});sources.push({name:job.label,url:job.url,status:'unavailable'})}}))}
  if(!offers.length){if(cache)return {...cache,stale:true,status:'cached',lastAttemptAt:checkedAt,errors};return {checkedAt,status:'unavailable',stale:true,offers:[],coverage:{complete:false,label:'Нет доступных источников'},errors}}
  const official=sources.some(s=>s.name==='Беларусбанк'&&s.status==='ok');
  const unique=[...new Map(offers.filter(o=>!(official&&o.bankAlias==='belarusbank'&&o.id.startsWith('myfin:'))).map(o=>[o.id,o])).values()].sort((a,b)=>a.bank.localeCompare(b.bank,'ru')||a.city.localeCompare(b.city,'ru')||a.address.localeCompare(b.address,'ru'));
  const cityNames=sources.filter(s=>s.status==='ok'&&s.name!=='Беларусбанк').map(s=>s.name);
  const coverage=errors.length?[cityNames.length?'Банки: '+cityNames.join(', '):'',official?'Отделения Беларусбанка по стране':''].filter(Boolean).join(' · '):'Банки областных центров и отделения Беларусбанка по стране';
  cache={checkedAt,status:errors.length?'partial':'ok',stale:false,source:{name:official?(cityNames.length?'Myfin · Беларусбанк':'Беларусбанк'):'Myfin',url:cityNames.length?'https://myfin.by/currency':BANK_URL},coverage:{complete:false,label:coverage},sources,offers:unique,errors};
  await fs.writeFile(STORE,JSON.stringify(cache)).catch(()=>{});return cache;
}
export async function getCurrencyData({force=false}={}){
  await (loading ??= fs.readFile(STORE,'utf8').then(value=>{cache=JSON.parse(value)}).catch(()=>{}));
  if(pending)return pending;
  if(lastResponse&&Date.now()-lastAttempt<60000)return lastResponse;
  if(!force&&cache&&!lastResponse?.stale&&Date.now()-Date.parse(cache.checkedAt)<300000)return cache;
  lastAttempt=Date.now();
  pending=refresh().then(result=>{lastResponse=result;return result});
  try{return await pending}finally{pending=null}
}
