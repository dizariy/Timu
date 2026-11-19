import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'};
const sendJSON=(res,code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value))};
const server=http.createServer(async(req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return}
  try{
    const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);
    if(pathname==='/api/news/translation'){
      if(req.method==='HEAD'){res.writeHead(200);res.end();return}
      const origin=req.headers.origin;
      if((origin&&origin!==`http://${req.headers.host}`)||req.headers['sec-fetch-site']==='cross-site'){sendJSON(res,403,{error:'Запрос из другого сайта'});return}
      const id=url.searchParams.get('id');if(!id||id.length>120){sendJSON(res,400,{error:'Не указана новость'});return}
      const article=await import('./server/news-data.mjs').then(m=>m.getNewsArticle(id));
      if(!article){sendJSON(res,404,{error:'Новость не найдена'});return}
      try{sendJSON(res,200,await import('./server/news-translation.mjs').then(m=>m.translateNews(article)))}catch{sendJSON(res,503,{translated:false,status:'unavailable'})}
      return;
    }
    if(['/api/news','/api/commodities','/api/currency','/api/commodity-offers'].includes(pathname)){
      if(req.method==='HEAD'){res.writeHead(200);res.end();return}
      const force=url.searchParams.get('force')==='1';
      try {
        if(pathname==='/api/currency'){
          const [data,forecasts]=await Promise.all([
            import('./server/currency-data.mjs').then(m=>m.getCurrencyData({force})),
            import('./server/currency-forecast.mjs').then(m=>m.getCurrencyForecast()).catch(()=>({})),
          ]);
          sendJSON(res,200,{...data,forecasts});
        }else if(pathname==='/api/commodity-offers'){
          sendJSON(res,200,await import('./server/commodity-offers.mjs').then(m=>m.getCommodityOffers()));
        }else if(pathname==='/api/news'){
          sendJSON(res,200,await import('./server/news-data.mjs').then(m=>m.getNews({force})));
        }else{
          sendJSON(res,200,await import('./server/commodity-data.mjs').then(m=>m.getCommodityData({force})));
        }
      }
      catch(error){console.error(pathname,error.message);sendJSON(res,503,{error:'Источник временно недоступен',checkedAt:new Date().toISOString()})}
      return;
    }
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
    const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end('Not found')}
});
server.listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
