const KEY='timu.translations.v1';
export const needsTranslation=article=>/[A-Za-z]{3}/.test(article.title||'')&&!/[А-Яа-яЁё]{3}/.test(article.title||'');
const signature=article=>article.title+'\n'+(article.summary||'');
export function createNewsTranslations(){
  const cache=new Map(),pending=new Map();
  try{for(const item of JSON.parse(localStorage.getItem(KEY)||'[]'))if(item.id&&item.signature&&typeof item.title==='string'&&typeof item.summary==='string'&&item.translated)cache.set(item.id,item)}catch{}
  const peek=article=>{const result=cache.get(article.id);return result?.signature===signature(article)?result:null};
  return {peek,async translate(article){
    const cached=peek(article);if(cached)return cached;
    if(!needsTranslation(article))return {...article,translated:false,status:'original'};
    if(pending.has(article.id))return pending.get(article.id);
    const operation=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),35000);
      try{
        const response=await fetch('/api/news/translation?id='+encodeURIComponent(article.id),{signal:controller.signal,headers:{Accept:'application/json'}});
        if(!response.ok)throw Error('Перевод временно недоступен');
        const data=await response.json();
        if(data.translated&&typeof data.title==='string'&&typeof data.summary==='string'){
          const result={...data,id:article.id,signature:signature(article)};cache.set(article.id,result);
          try{localStorage.setItem(KEY,JSON.stringify([...cache.values()].slice(-150)))}catch{}
          return result;
        }
        return {...article,translated:false,status:data.status||'unavailable',error:data.error};
      }catch{return {...article,translated:false,status:'unavailable'}}
      finally{clearTimeout(timer);pending.delete(article.id)}
    })();pending.set(article.id,operation);return operation;
  }};
}
