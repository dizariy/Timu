import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {AUTOMATIC_NEWS_CONTEXT,classifyNewsPriority} from '../dist/news-priority.js';

export const NEWS_SOURCES=[
  {id:'globe-public',name:'GlobeNewswire',market:'US',url:'https://www.globenewswire.com/RssFeed/orgclass/1/feedTitle/GlobeNewswire%20-%20News%20about%20Public%20Companies'},
  {id:'globe-earnings',name:'GlobeNewswire',market:'US',url:'https://www.globenewswire.com/RssFeed/subjectcode/13-Earnings%20Releases%20and%20Operating%20Results/feedTitle/GlobeNewswire%20-%20Earnings%20Releases%20and%20Operating%20Results'},
  {id:'globe-ma',name:'GlobeNewswire',market:'US',url:'https://www.globenewswire.com/RssFeed/subjectcode/27-Mergers%20and%20Acquisitions/feedTitle/GlobeNewswire%20-%20Mergers%20and%20Acquisitions'},
  {id:'prnewswire',name:'PR Newswire',market:'US',url:'https://www.prnewswire.com/rss/news-releases-list.rss'},
  {id:'interfax',name:'Интерфакс',market:'RU',url:'https://www.interfax.ru/rss'},
  {id:'moex',name:'Московская биржа',market:'RU',type:'moex',url:'https://iss.moex.com/iss/sitenews.json?iss.meta=off&limit=100'},
];
const SNAPSHOT=new URL('../dist/data/news-cache.json',import.meta.url);
const CATALOG=new URL('../dist/assets/companies.json',import.meta.url);
const TTL=5*60_000;
let cache,inflight,matcher,initialization,lastAttempt=0;
const decode=value=>String(value||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,code)=>{const n=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);return n>0&&n<=0x10ffff?String.fromCodePoint(n):''}).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,x)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[x]));
export const cleanText=value=>decode(decode(value).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const tag=(body,name)=>body.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]||'';
const safeURL=value=>{try{const u=new URL(cleanText(value));return u.protocol==='https:'?u.href:null}catch{return null}};
export function parseRSS(xml){
  return [...String(xml).matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0,200).map(([,body])=>({title:cleanText(tag(body,'title')),summary:cleanText(tag(body,'description')||tag(body,'content:encoded')),url:safeURL(tag(body,'link')),publishedAt:tag(body,'pubDate')||tag(body,'dc:date')}));
}
const normalize=value=>cleanText(value).toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const nameKey=value=>normalize(value).replace(/(?:\s+(?:incorporated|corporation|corp|inc|limited|ltd|plc|holdings?|group|company|co|ag|nv|sa|se))+$/g,'').replace(/(?:^|\s)(пао|оао|ао|ап|обыкновенные|привилегированные|акции)(?=\s|$)/g,' ').replace(/\s+/g,' ').trim();
const generic=new Set(['international','financial','american','technology','capital','energy','resources','industries','bank','the','global','partners','systems','first','trust','investment','national','united','advanced','public','holdings','strategy','target','click','works','progress','support','range','edge','select','applied','opportunity','future','priority','enterprise','evolution','foundation']);
for(const name of ['nasdaq','people','crane','national bank','global industrial','southern','northern','eastern','western','rocket','block','apple hospitality','credible','evergreen','pioneer','universal'])generic.add(name);
export function buildCompanyMatcher(companies){
  const byId=new Map(companies.map(c=>[c.id||c.symbol,c])),bySymbol=new Map(),aliasMap=new Map();
  const add=(name,c)=>{for(const key of new Set([nameKey(name),normalize(name)])){if(key.length<5||generic.has(key)||/^\d+$/.test(key))continue;const rows=aliasMap.get(key)||[];if(!rows.includes(c))rows.push(c);aliasMap.set(key,rows)}};
  for(const c of companies){bySymbol.set(`${c.market||'US'}:${c.symbol.toUpperCase()}`,c);for(const value of [c.name,c.legalName,...(Array.isArray(c.aliases)?c.aliases:[])])if(value)add(value,c)}
  const ruAliases={SBER:['Сбербанк','Сбербанка'],GAZP:['Газпром','Газпрома'],GMKN:['Норникель','Норникеля'],YDEX:['Яндекс','Яндекса'],LKOH:['Лукойл','Лукойла'],ROSN:['Роснефть','Роснефти'],NVTK:['Новатэк','Новатэка'],MGNT:['Магнит'],CHMF:['Северсталь','Северстали']};
  for(const [symbol,names] of Object.entries(ruAliases)){const c=byId.get('MOEX:'+symbol);if(c)for(const name of names)add(name,c)}
  const aliases=[];
  for(const [key,rows] of aliasMap){const issuers=new Set(rows.map(c=>c.cik||c.market==='RU'&&nameKey(c.name).replace(/ п$/,'')||c.id));if(rows.length===1||issuers.size===1){aliases.push({key:' '+key+' ',company:rows.find(c=>c.securityType==='common_share')||rows[0]})}}
  aliases.sort((a,b)=>b.key.length-a.key.length);
  return (entry,market)=>{
    const title=' '+normalize(entry.title)+' ',text=cleanText(entry.title+' '+entry.summary);
    const found=[];
    for(const m of text.matchAll(/\b(NASDAQ|NYSE(?:\s*AMERICAN)?|AMEX|MOEX)\s*[:：]\s*([A-Z][A-Z0-9.-]{0,10})\b/gi)){const c=bySymbol.get(`${m[1].toUpperCase()==='MOEX'?'RU':'US'}:${m[2].toUpperCase()}`)||bySymbol.get(`US:${m[2].toUpperCase().replace('.','-')}`);if(c&&!found.includes(c))found.push(c)}
    if(found.length)return found.slice(0,3);
    const titles=aliases.filter(a=>{
      if((market&&a.company.market!==market)||!title.includes(a.key))return false;
      if(a.company.market!=='US'||a.key.trim().includes(' '))return true;
      // A short brand in ordinary prose is insufficient evidence of the issuer.
      const suffix=title.startsWith(a.key)?title.slice(a.key.length):'';
      return /^(announces?|reports?|declares?|appoints?|launches?|acquires?|receives?|completes?|enters?|expands?|raises?|increases?|releases?|provides?|to announce|to report)\b/.test(suffix);
    });
    if(titles.length){const max=titles[0].key.length;return titles.filter(a=>a.key.length===max).map(a=>a.company).slice(0,3)}
    return [];
  };
}
export function acceptedLanguage(entry){const url=safeURL(entry.url);if(!url)return false;const language=new URL(url).pathname.match(/\/news-release\/\d{4}\/\d{2}\/\d{2}\/\d+\/\d+\/([^/]+)\//)?.[1];return !language||['en','ru'].includes(language.toLowerCase());}
export function articleKey(entry){const url=safeURL(entry.url);if(!url)return '';const parsed=new URL(url);const release=parsed.hostname.endsWith('globenewswire.com')&&parsed.pathname.match(/\/news-release\/\d{4}\/\d{2}\/\d{2}\/(\d+)\//)?.[1];return release?'globe:'+release:url;}
async function fetchSource(source){
  const response=await fetch(source.url,{redirect:'error',signal:AbortSignal.timeout(12_000),headers:{Accept:'application/rss+xml, application/xml, application/json, text/xml','User-Agent':'timu/1.0 (public company news reader)'}});
  if(!response.ok)throw Error(`HTTP ${response.status}`);
  const reader=response.body.getReader(),chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000){await reader.cancel();throw Error('Feed too large')}chunks.push(value)}
  const bytes=Buffer.concat(chunks),header=bytes.subarray(0,250).toString('ascii');
  const encoding=header.match(/encoding=["']([^"']+)/i)?.[1]||response.headers.get('content-type')?.match(/charset=([^; ]+)/i)?.[1]||'utf-8';
  const body=new TextDecoder(encoding).decode(bytes);
  if(source.type==='moex'){
    const table=JSON.parse(body).sitenews;if(!table?.columns||!table.data)throw Error('Invalid MOEX response');
    return table.data.map(values=>Object.fromEntries(table.columns.map((name,i)=>[name,values[i]]))).map(row=>({title:row.title,summary:'Сообщение Московской биржи. Условия события — в первоисточнике.',publishedAt:row.published_at.replace(' ','T')+'+03:00',url:`https://www.moex.com/n${row.id}`}));
  }
  const rows=parseRSS(body);if(!rows.length)throw Error('Empty feed');return rows;
}
export function makeNews(entry,source,company,previous,now=new Date()){
  const time=Date.parse(entry.publishedAt),url=safeURL(entry.url),title=cleanText(entry.title);
  if(!url||!acceptedLanguage(entry)||!title||title.includes('\ufffd')||!Number.isFinite(time)||time>now.getTime()+300000)return null;
  const article={id:'rss-'+createHash('sha256').update(url).digest('hex').slice(0,20),symbol:company.symbol,companyId:company.id||company.symbol,company:company.name,market:company.market,title,summary:cleanText(entry.summary).slice(0,240),source:source.name,url,publishedAt:new Date(time).toISOString(),addedAt:previous?.addedAt||now.toISOString(),category:'Компании',impact:'neutral',impactNote:'Направление влияния на стоимость акций пока не оценено.',relevance:AUTOMATIC_NEWS_CONTEXT,verified:false};
  return {...article,...classifyNewsPriority(article)};
}
async function initialize(){
  if(initialization)return initialization;
  initialization=(async()=>{
  const data=JSON.parse(await readFile(CATALOG,'utf8'));matcher=buildCompanyMatcher(Array.isArray(data)?data:data.companies);
  try{cache=JSON.parse(await readFile(SNAPSHOT,'utf8'));if(!Array.isArray(cache.news))cache=null}catch{}
  if(!cache){const old=JSON.parse(await readFile(new URL('../dist/news.json',import.meta.url),'utf8'));cache={...old,news:old.news,mode:'snapshot',checkedAt:old.verifiedAt+'T00:00:00Z',sources:[],errors:[]}}
  cache.news=cache.news.map(article=>({...article,...classifyNewsPriority(article),relevance:article.id.startsWith('rss-')?AUTOMATIC_NEWS_CONTEXT:article.relevance}));
  if(cache.matcherVersion!==2){
    cache.news=cache.news.filter(n=>acceptedLanguage(n)&&(!n.id.startsWith('rss-')||matcher(n,n.market).some(c=>(c.id||c.symbol)===(n.companyId||n.symbol))));
    cache.matcherVersion=2;
    try{await writeFile(SNAPSHOT,JSON.stringify(cache))}catch{}
  }
  })().catch(error=>{initialization=null;throw error});
  return initialization;
}
export async function getNews({force=false}={}){
  await initialize();
  if(inflight)return inflight;
  if(lastAttempt&&Date.now()-lastAttempt<(force?60_000:TTL))return structuredClone(cache);
  lastAttempt=Date.now();
  inflight=(async()=>{
    const now=new Date(),sources=[],errors=[],incoming=[];
    const byURL=new Map(cache.news.map(n=>[n.url,n]));
    await Promise.all(NEWS_SOURCES.map(async source=>{
      try{const rows=await fetchSource(source);let matched=0;for(const entry of rows){const companies=matcher(entry,source.market);if(!companies.length)continue;const article=makeNews(entry,source,companies[0],byURL.get(entry.url),now);if(article){article.relatedCompanyIds=companies.map(c=>c.id||c.symbol);incoming.push(article);matched++}}sources.push({name:source.name,url:source.url,status:'ok',received:rows.length,matched,checkedAt:now.toISOString()})}
      catch(error){errors.push({source:source.id,message:error.message});sources.push({name:source.name,url:source.url,status:'unavailable'})}
    }));
    if(!sources.some(s=>s.status==='ok')){cache={...cache,mode:'cached',errors,sources,lastAttemptAt:now.toISOString()};return structuredClone(cache)}
    const articles=new Map();for(const n of [...cache.news,...incoming])if(Date.parse(n.publishedAt)>=now.getTime()-60*86400000)articles.set(articleKey(n),n);
    const news=[...articles.values()].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,600);
    cache={matcherVersion:2,news,checkedAt:now.toISOString(),sources,errors,mode:errors.length?'partial':'live',coverage:{catalog:5857,description:'Публикации доступных источников, сопоставленные со всем каталогом; полнота по каждому эмитенту не гарантируется.'}};
    try{await mkdir(new URL('../dist/data/',import.meta.url),{recursive:true});await writeFile(SNAPSHOT,JSON.stringify(cache))}catch{}
    return structuredClone(cache);
  })().finally(()=>{inflight=null});
  return inflight;
}
export async function getNewsArticle(id){await initialize();return structuredClone(cache.news.find(n=>n.id===id)||null)}
