import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { COMMODITY_SNAPSHOT } from '../dist/commodity-source.js';
import { MONTHLY_COMMODITIES } from '../dist/commodity-monthly.js';

const SNAPSHOT = new URL('../dist/data/commodity-regions.json', import.meta.url);
const WB_URL = 'https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx';
const WB_SOURCE = { name: 'World Bank Pink Sheet', url: 'https://www.worldbank.org/en/research/commodity-markets', kind: 'monthly-average' };
const CBR_SOURCE = { name: 'Банк России', url: 'https://www.cbr.ru/hd_base/metall/', kind: 'accounting', method: 'Официальная учётная цена за грамм. Не цена сделки или продажи слитка.' };
const BY_SOURCE = { name: 'Национальный банк Республики Беларусь', url: 'https://www.nbrb.by/statistics/preciousmetals', kind: 'accounting', method: 'Официальная учётная цена за грамм. Не цена сделки или продажи слитка.' };
const METALS = [
  ['XAU', 'Золото', 'Au', 'Gold'], ['XAG', 'Серебро', 'Ag', 'Silver'],
  ['XPT', 'Платина', 'Pt', 'Platinum'], ['XPD', 'Палладий', 'Pd', null],
];
const MONTHLY = [
  ['WB_COPPER','Медь','Cu','Copper','т'], ['WB_ALUMINUM','Алюминий','Al','Aluminum','т'],
  ['WB_NICKEL','Никель','Ni','Nickel','т'], ['WB_ZINC','Цинк','Zn','Zinc','т'],
  ['WB_BRENT','Нефть Brent','Br','Crude oil, Brent','баррель'], ['WB_GAS_US','Природный газ США','NG','Natural gas, US','млн БТЕ'],
];
let cached;
let loading;
let inflight;
let attemptedAt = 0;
const TTL = 6 * 60 * 60 * 1000;
const day = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year:'numeric',month:'2-digit',day:'2-digit' }).format(date);
const slashDate = value => value.split('-').reverse().join('/');
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const number = value => Number(String(value).replace(/\s/g, '').replace(',', '.'));
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const normalizePoints = points => [...new Map(points.map(point=>[point.date,point])).values()].sort((a,b)=>a.date.localeCompare(b.date));
const xmlText = text => String(text).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");

// All URLs are assembled from this fixed allowlist; request input never supplies a URL.
async function upstream(url, { encoding = 'utf-8', binary = false, timeout = 15_000 } = {}) {
  const parsed = new URL(url);
  const allowed = ['www.cbr.ru','api.nbrb.by','api.gold-api.com','thedocs.worldbank.org'];
  if (parsed.protocol !== 'https:' || !allowed.includes(parsed.hostname)) throw new Error('Unapproved upstream');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(timeout), headers: { Accept: binary ? '*/*' : 'application/json, application/xml, text/xml', 'User-Agent': 'timu-data/1.0 (public market reference data)' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 5_000_000) throw new Error('Upstream response too large');
  return binary ? Buffer.from(bytes) : new TextDecoder(encoding).decode(bytes);
}

export function parseCBRMetals(xml) {
  if (typeof xml !== 'string' || !/<Metall\b/.test(xml)) throw new Error('Invalid CBR metals response');
  const rows = [[],[],[],[]];
  for (const match of xml.matchAll(/<Record\b([^>]*)>([\s\S]*?)<\/Record>/g)) {
    const code = Number(match[1].match(/Code="(\d+)"/)?.[1]);
    const dateRaw = match[1].match(/Date="(\d{2}\.\d{2}\.\d{4})"/)?.[1];
    const value = match[2].match(/<Buy>([^<]+)<\/Buy>/)?.[1];
    const price = number(value);
    const date = dateRaw?.split('.').reverse().join('-');
    if (code >= 1 && code <= 4 && validDate(date) && positive(price)) rows[code-1].push({ date, price });
  }
  return rows.map(normalizePoints);
}

export function parseNBRBMetals(data) {
  const rows = [[],[],[],[]];
  if (!Array.isArray(data)) throw new Error('Invalid NBRB response');
  for (const point of data) {
    if (!point || typeof point !== 'object' || typeof point.Date !== 'string') continue;
    const date=point.Date.slice(0,10);
    if (Number.isInteger(point.MetalId) && point.MetalId >= 0 && point.MetalId <= 3 && validDate(date) && positive(point.Value)) rows[point.MetalId].push({ date, price: point.Value });
  }
  return rows.map(normalizePoints);
}

function requireMetals(rows) {
  if (rows.some(points=>points.length===0)) throw new Error('Incomplete precious-metal history');
  return rows;
}

// Small dependency-free reader for the public XLSX workbook. Only reads XML
// cells, never evaluates formulas/macros or external workbook relationships.
function unzip(buffer) {
  let end = buffer.length - 22;
  while (end >= Math.max(0, buffer.length - 65557) && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || buffer.readUInt32LE(end) !== 0x06054b50) throw new Error('Invalid workbook ZIP');
  let pointer = buffer.readUInt32LE(end+16);
  const count = buffer.readUInt16LE(end+10), entries = new Map();
  if (count > 200) throw new Error('Unexpected workbook structure');
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) throw new Error('Invalid ZIP directory');
    const method = buffer.readUInt16LE(pointer+10), size = buffer.readUInt32LE(pointer+20), rawSize = buffer.readUInt32LE(pointer+24);
    const nameLength=buffer.readUInt16LE(pointer+28), extra=buffer.readUInt16LE(pointer+30), comment=buffer.readUInt16LE(pointer+32), offset=buffer.readUInt32LE(pointer+42);
    const name=buffer.subarray(pointer+46,pointer+46+nameLength).toString();
    if (rawSize > 15_000_000 || size > 5_000_000) throw new Error('Workbook entry too large');
    if (name.endsWith('.xml') || name.endsWith('.rels')) {
      const start=offset+30+buffer.readUInt16LE(offset+26)+buffer.readUInt16LE(offset+28);
      const compressed=buffer.subarray(start,start+size);
      const decoded=method===0 ? compressed : method===8 ? inflateRawSync(compressed,{maxOutputLength:15_000_000}) : null;
      if (!decoded) throw new Error('Unsupported ZIP compression');
      entries.set(name,decoded.toString('utf-8'));
    }
    pointer += 46+nameLength+extra+comment;
  }
  return entries;
}

export function parseWorldBankWorkbook(buffer) {
  const entries=unzip(buffer);
  const workbook=entries.get('xl/workbook.xml') || '';
  const sheetTag=[...workbook.matchAll(/<sheet\b[^>]*\/>/g)].map(match=>match[0]).find(tag=>tag.includes('name="Monthly Prices"'));
  const relId=sheetTag?.match(/r:id="([^"]+)"/)?.[1];
  const relationship=[...(entries.get('xl/_rels/workbook.xml.rels')||'').matchAll(/<Relationship\b[^>]*\/>/g)].map(match=>match[0]).find(tag=>tag.includes(`Id="${relId}"`));
  const target=relationship?.match(/Target="([^"]+)"/)?.[1];
  const sheet=entries.get(target?.startsWith('/') ? target.slice(1) : `xl/${target}`);
  if (!sheet) throw new Error('Monthly Prices worksheet missing');
  const strings=[...(entries.get('xl/sharedStrings.xml')||'').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(match=>[...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t=>xmlText(t[1])).join(''));
  const rows=[];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row=[];
    for (const cell of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref=cell[1].match(/r="([A-Z]+)\d+"/)?.[1];
      if (!ref) continue;
      let column=0; for (const letter of ref) column=column*26+letter.charCodeAt(0)-64;
      const raw=cell[2].match(/<v>([\s\S]*?)<\/v>/)?.[1];
      row[column-1]=cell[1].includes('t="s"') ? strings[Number(raw)] : cell[1].includes('t="inlineStr"') ? xmlText(cell[2].match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1]||'') : raw===undefined ? null : Number.isFinite(Number(raw)) ? Number(raw) : raw;
    }
    rows.push(row);
  }
  const header=rows.find(row=>row.includes('Copper') && row.includes('Gold'));
  if (!header) throw new Error('Workbook price columns missing');
  const series={};
  for (const columnName of [...METALS.map(item=>item[3]).filter(Boolean), ...MONTHLY.map(item=>item[3])]) {
    const column=header.indexOf(columnName);
    if (column<0) continue;
    const history=normalizePoints(rows.filter(row=>/^\d{4}M(0[1-9]|1[0-2])$/.test(row[0]) && positive(row[column])).map(row=>({date:row[0].replace('M','-')+'-01',price:row[column]}))).slice(-60);
    if (history.length) series[columnName]=history;
  }
  const required=[...METALS.map(item=>item[3]).filter(Boolean),...MONTHLY.map(item=>item[3])];
  if(required.some(column=>!series[column]?.length)) throw new Error('Incomplete World Bank price history');
  return { series, publication: rows.flat().find(value=>typeof value==='string' && value.startsWith('Updated on ')) || null };
}

function official(points, currency, source) {
  if (!points?.length) return null;
  const last=points.at(-1);
  return { price:last.price,currency,unit:'г',units:`${currency}/г`,updatedAt:last.date,dataAsOf:last.date,frequency:'daily',kind:'official',status:'official-snapshot',priceType:'accounting',source,history:points };
}
function converted(item, fx, region) {
  if (!fx || !positive(item.price)) return null;
  return { price:item.price*fx.rate,currency:fx.currency,unit:item.unit,units:`${fx.currency}/${item.unit}`,updatedAt:fx.date,dataAsOf:item.dataAsOf,frequency:item.frequency,kind:'converted',priceType:'converted-monthly-average',source:{name:`World Bank × ${fx.source.name}`,url:item.source.url,kind:'converted',method:`Пересчёт мировой средней цены за ${item.dataAsOf.slice(0,7)} по официальному курсу на ${fx.date}. Не котировка местной биржи.`},fx:{...fx},history:[],region };
}

async function refresh() {
  const today=day();
  const start=day(new Date(Date.now()-364*86400000));
  const previous=cached;
  const errors=[];
  const tasks={
    ru:()=>upstream(`https://www.cbr.ru/scripts/xml_metall.asp?date_req1=${slashDate(start)}&date_req2=${slashDate(today)}`,{encoding:'windows-1251'}).then(parseCBRMetals).then(requireMetals),
    by:()=>upstream(`https://api.nbrb.by/bankingots/prices?startdate=${start}&enddate=${today}`).then(JSON.parse).then(parseNBRBMetals).then(requireMetals),
    rub:async()=>{const xml=await upstream(`https://www.cbr.ru/scripts/XML_daily.asp?date_req=${slashDate(today)}`,{encoding:'windows-1251'});const block=[...xml.matchAll(/<Valute\b[^>]*>([\s\S]*?)<\/Valute>/g)].map(match=>match[1]).find(value=>value.includes('<CharCode>USD</CharCode>'));const rate=number(block?.match(/<Value>([^<]+)<\/Value>/)?.[1])/number(block?.match(/<Nominal>([^<]+)<\/Nominal>/)?.[1]);const date=xml.match(/<ValCurs\b[^>]*Date="([^"]+)"/)?.[1]?.split('.').reverse().join('-');if(!positive(rate)||!date)throw new Error('USD/RUB missing');return{currency:'RUB',rate,date,source:{name:'Банк России',url:'https://www.cbr.ru/currency_base/daily/'}};},
    byn:async()=>{const row=JSON.parse(await upstream(`https://api.nbrb.by/exrates/rates/USD?parammode=2&ondate=${today}`));const rate=Number(row.Cur_OfficialRate)/Number(row.Cur_Scale);if(!positive(rate)||!row.Date)throw new Error('USD/BYN missing');return{currency:'BYN',rate,date:row.Date.slice(0,10),source:{name:'НБ РБ',url:'https://www.nbrb.by/statistics/rates/ratesdaily'}};},
    wb:()=>upstream(WB_URL,{binary:true}).then(parseWorldBankWorkbook),
  };
  const data={};
  const regional=Promise.all(Object.entries(tasks).map(async([key,task])=>{
    try{data[key]=await task();}catch(error){errors.push({source:key,message:error.message});}
  }));
  const market=Promise.all(METALS.map(async ([symbol], index)=>{
    if(index)await new Promise(resolve=>setTimeout(resolve,index*1200));
    try {
      const row=JSON.parse(await upstream(`https://api.gold-api.com/price/${symbol}`,{timeout:9000}));
      const quoteTime=Date.parse(row.updatedAt);
      if(row.symbol!==symbol||row.currency!=='USD'||!positive(row.price)||!Number.isFinite(quoteTime)||quoteTime>Date.now()+300_000)throw new Error('Invalid quote');
      return {price:row.price,updatedAt:row.updatedAt,status:Date.now()-quoteTime>900_000?'stale':'live'};
    } catch(error) {
      errors.push({source:symbol,message:error.message});
      return null;
    }
  }));
  const [,quotes]=await Promise.all([regional,market]);
  if(!Object.keys(data).length&&!quotes.some(Boolean)&&previous){
    cached={...previous,status:'cached',errors};
    return responseCopy(cached);
  }
  const items=METALS.map(([symbol,name,code,column],index)=>{
    const old=previous?.items?.find(item=>item.id===symbol);
    const quote=quotes[index]||{...(old||COMMODITY_SNAPSHOT[symbol]),status:'snapshot'};
    const history=data.wb?.series[column] || old?.history || [];
    const oldRegion=region=>old?.regions?.[region] ? {...old.regions[region],status:'cached'} : null;
    const regions={RU:official(data.ru?.[index],'RUB',CBR_SOURCE)||oldRegion('RU'),BY:official(data.by?.[index],'BYN',BY_SOURCE)||oldRegion('BY')};
    return {id:symbol,symbol,name,code,category:'Драгоценные металлы',currency:'USD',unit:'тр. унция',units:'USD/тр. унция',price:quote.price,updatedAt:quote.updatedAt,dataAsOf:quote.updatedAt,frequency:'spot',status:quote.status,source:{name:'Gold API',url:'https://gold-api.com/',kind:'indicative'},history,historyFrequency:'monthly',historySource:WB_SOURCE,regions};
  });
  for(const [symbol,name,code,column,unit] of MONTHLY) {
    const old=previous?.items?.find(item=>item.id===symbol);
    const initial=MONTHLY_COMMODITIES.find(item=>item.id===symbol);
    const history=data.wb?.series[column] || old?.history || initial?.history.map(point=>({date:point.period+'-01',price:point.price})) || [];
    const latest=history.at(-1);
    const item={id:symbol,symbol,name,code,category:symbol.includes('BRENT')||symbol.includes('GAS')?'Энергия':'Цветные металлы',currency:'USD',unit,units:`USD/${unit}`,price:latest?.price||null,updatedAt:latest?.date||null,dataAsOf:latest?.date||null,frequency:'monthly',status:data.wb?'official-snapshot':'snapshot',source:WB_SOURCE,history,historyFrequency:'monthly',historySource:WB_SOURCE,regions:{}};
    item.regions={RU:converted(item,data.rub||previous?.fx?.RU,'RU'),BY:converted(item,data.byn||previous?.fx?.BY,'BY')};
    items.push(item);
  }
  const availability=Object.keys(data).length||quotes.some(Boolean);
  const output={schemaVersion:1,updatedAt:availability?new Date().toISOString():null,status:availability?(errors.length?'partial':'ok'):'unavailable',items,fx:{RU:data.rub||previous?.fx?.RU||null,BY:data.byn||previous?.fx?.BY||null},errors,sources:{CBR:CBR_SOURCE,NBRB:BY_SOURCE,WorldBank:WB_SOURCE},notes:['Региональные цены драгметаллов — учётные цены центральных банков, а не биржевые сделки или цены слитков.','Промышленное сырьё — мировые месячные средние; RUB/BYN являются явно обозначенным валютным пересчётом.','История хранит только опубликованные наблюдения, без интерполяции и прогнозов.']};
  cached=output;
  if(availability)try{await mkdir(new URL('../dist/data/',import.meta.url),{recursive:true});await writeFile(SNAPSHOT,JSON.stringify(output));}catch{/* Read-only deployment: memory cache still works. */}
  return responseCopy(output);
}

function responseCopy(data) {
  const result=structuredClone(data);
  for(const item of result.items) if(item.frequency==='spot'&&item.status==='live'&&Date.now()-Date.parse(item.updatedAt)>900_000)item.status='stale';
  return result;
}

export async function getCommodityData({ force = false } = {}) {
  await (loading ??= readFile(SNAPSHOT,'utf8').then(raw=>{
    const saved=JSON.parse(raw);
    if(saved.schemaVersion===1&&Array.isArray(saved.items))cached=saved;
  }).catch(()=>{}));
  const age=cached ? Date.now()-Date.parse(cached.updatedAt) : Infinity;
  if(cached&&!force&&cached.status!=='cached'&&age<TTL&&day(new Date(cached.updatedAt))===day())return responseCopy(cached);
  if(inflight)return inflight;
  if(cached&&Date.now()-attemptedAt<60_000)return responseCopy(cached);
  attemptedAt=Date.now();
  inflight=refresh().finally(()=>{inflight=null;});
  return inflight;
}
