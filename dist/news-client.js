import {AUTOMATIC_NEWS_CONTEXT,classifyNewsPriority} from './news-priority.js';
import {refreshFeedback} from './refresh-feedback.js';

const KEY='timu.news.v2';
const INTERVAL=120000;
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:null}catch{return null}};
export function normalizeNews(data){
  const seen=new Set();
  const articles = [];
  for (const article of Array.isArray(data?.news) ? data.news : []) {
    if (!article || typeof article.id !== 'string' || typeof article.title !== 'string'
      || typeof article.symbol !== 'string' || !Number.isFinite(Date.parse(article.publishedAt))) continue;
    const url = safeUrl(article.url);
    if (!url || seen.has(article.id)) continue;
    seen.add(article.id);
    articles.push({
      ...article,
      ...classifyNewsPriority(article),
      url,
      companyId: article.companyId || article.symbol,
      summary: String(article.summary || ''),
      company: String(article.company || article.symbol),
      category: article.category || 'Компании',
      addedAt: article.addedAt || article.publishedAt,
      impact: ['positive', 'negative'].includes(article.impact) ? article.impact : 'neutral',
      impactNote: article.impactNote || 'Влияние на стоимость акций пока не оценено.',
      relevance: article.id.startsWith('rss-') ? AUTOMATIC_NEWS_CONTEXT
        : article.relevance || 'Событие компании. Содержание и даты доступны в первоисточнике.',
    });
  }
  return articles.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,600);
}
export function createNewsFeed({onData,onStatus}){
  let timer,controller,busy=false,stopped=false,checkedAt=null;
  const schedule=()=>{clearTimeout(timer);if(!stopped&&!document.hidden)timer=setTimeout(refresh,INTERVAL)};
  async function refresh(manual=false){
    if(stopped||busy||document.hidden)return;
    busy=true;controller=new AbortController();const request=controller,signal=request.signal;
    const feedback=refreshFeedback(manual);
    const timeout=setTimeout(()=>request.abort(),28000);
    onStatus({loading:true,recent:false});
    try{
      const response=await fetch(manual?'/api/news?force=1':'/api/news',{signal,cache:'no-store'});
      if(!response.ok)throw Error('Лента временно недоступна');
      const data=await response.json(),news=normalizeNews(data);
      if(!news.length)throw Error('Источники пока не вернули публикации');
      const recent=Boolean(manual&&data.checkedAt&&data.checkedAt===checkedAt);
      const snapshot={...data,news};
      await feedback();
      if(signal.aborted)throw signal.reason;
      checkedAt=data.checkedAt||checkedAt;
      try{localStorage.setItem(KEY,JSON.stringify(snapshot))}catch{}
      onData(snapshot);onStatus({...snapshot,loading:false,recent});
    }catch(error){
      await feedback();
      if(!stopped)onStatus({loading:false,unavailable:!document.hidden,recent:false});
    }
    finally{clearTimeout(timeout);controller=null;busy=false;schedule()}
  }
  return {
    async start(){
      let cached;try{cached=JSON.parse(localStorage.getItem(KEY)||'null')}catch{}
      let news=normalizeNews(cached);
      if(!news.length){try{const r=await fetch('data/news-cache.json');if(r.ok){cached=await r.json();news=normalizeNews(cached)}}catch{}}
      if(news.length){checkedAt=cached?.checkedAt||null;onData({...cached,news});onStatus({...cached,snapshot:true})}
      refresh();
    },
    refresh,
    onVisibility(){clearTimeout(timer);if(document.hidden)controller?.abort();else if(!busy)refresh()},
    stop(){stopped=true;clearTimeout(timer);controller?.abort()}
  };
}
