import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const STORE=new URL('../.cache/translations.json',import.meta.url);
const PROVIDER='MyMemory';
const DAILY_BUDGET=4800;
const today=ms=>new Date(ms).toISOString().slice(0,10);
const original=article=>({title:String(article.title||''),summary:String(article.summary||''),url:article.url});
const fallback=(article,status)=>({...original(article),original:original(article),translated:false,provider:PROVIDER,status});
export function splitSegments(text,limit=500){
  const segments=[];let current='';
  for(const word of String(text).trim().split(/\s+/u)){
    const candidate=current?current+' '+word:word;
    if(Buffer.byteLength(candidate,'utf8')<=limit){current=candidate;continue;}
    if(current)segments.push(current);current='';
    for(const letter of word){if(Buffer.byteLength(current+letter,'utf8')>limit){segments.push(current);current=''}current+=letter;}
  }
  if(current)segments.push(current);return segments;
}
export function createNewsTranslator({fetcher=fetch,now=Date.now,storeURL=STORE,dailyBudget=DAILY_BUDGET}={}){
  let loaded,serial=Promise.resolve(),ledger={day:today(now()),used:0},cache=new Map(),failures=new Map(),pending=new Map();
  const load=()=>loaded||=(async()=>{if(!storeURL)return;try{const saved=JSON.parse(await readFile(storeURL,'utf8'));if(saved.ledger?.day===today(now()))ledger=saved.ledger;for(const entry of saved.entries||[])if(entry?.key&&entry.value?.translated)cache.set(entry.key,entry.value)}catch{}})();
  async function persist(){if(!storeURL)return;try{await mkdir(new URL('.',storeURL),{recursive:true});await writeFile(storeURL,JSON.stringify({ledger,entries:[...cache].slice(-300).map(([key,value])=>({key,value}))}))}catch{}}
  async function translateSegment(text){
    const url=new URL('https://api.mymemory.translated.net/get');url.searchParams.set('q',text);url.searchParams.set('langpair','en|ru');url.searchParams.set('mt','1');
    const response=await fetcher(url,{signal:AbortSignal.timeout(10000),redirect:'error',headers:{Accept:'application/json'}});
    if(response.status===429)throw Object.assign(Error('quota'),{status:'quota'});
    if(!response.ok)throw Error('unavailable');
    const raw=await response.text();if(Buffer.byteLength(raw)>200000)throw Error('oversize');
    const data=JSON.parse(raw);
    if(data.quotaFinished||Number(data.responseStatus)===429||/used all available|quota|limit/i.test(data.responseDetails||''))throw Object.assign(Error('quota'),{status:'quota'});
    const result=data.responseData?.translatedText;
    if(Number(data.responseStatus)!==200||typeof result!=='string'||!result.trim()||result.length>6000||/MYMEMORY WARNING|INVALID LANGUAGE|QUERY LENGTH LIMIT/i.test(result))throw Error('unavailable');
    return result.trim();
  }
  async function perform(article,key){
    if(ledger.day!==today(now()))ledger={day:today(now()),used:0};
    const {title,summary}=original(article),cost=[...title+summary].length;
    if(cost>2500)return fallback(article,'too_long');
    if(ledger.used+cost>dailyBudget)return fallback(article,'quota');
    ledger.used+=cost;await persist();
    try{
      const translate=async text=>{const output=[];for(const part of splitSegments(text))output.push(await translateSegment(part));return output.join(' ')};
      const translatedTitle=await translate(title),translatedSummary=await translate(summary);
      if(!/[А-Яа-яЁё]/u.test(translatedTitle+' '+translatedSummary))throw Error('No Russian translation');
      const result={title:translatedTitle,summary:translatedSummary,original:original(article),provider:PROVIDER,translated:true,status:'translated',translatedAt:new Date(now()).toISOString()};
      cache.set(key,result);failures.delete(key);await persist();return structuredClone(result);
    }catch(error){const status=error.status==='quota'?'quota':'unavailable';if(status==='quota'){ledger.used=dailyBudget;await persist()}failures.set(key,{until:now()+60000,status});return fallback(article,status)}
  }
  return async article=>{
    if(!article||typeof article.title!=='string'||!article.title.trim())return fallback(article||{},'invalid');
    if(/[А-Яа-яЁё]{3}/u.test(article.title)||!/[A-Za-z]{3}/.test(article.title))return fallback(article,'original');
    await load();const key=createHash('sha256').update(article.title+'\n'+(article.summary||'')).digest('hex');
    if(cache.has(key))return structuredClone(cache.get(key));
    const failed=failures.get(key);if(failed?.until>now())return fallback(article,failed.status);
    if(pending.has(key))return pending.get(key);
    const operation=serial.then(()=>perform(article,key));serial=operation.catch(()=>{});pending.set(key,operation);
    try{return await operation}finally{pending.delete(key)}
  };
}
export const translateNews=createNewsTranslator();
