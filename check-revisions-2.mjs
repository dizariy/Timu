import assert from 'node:assert/strict';
import {parseMyfin,parseBelarusbank} from './server/currency-data.mjs';
import {normalizeCurrencyData,bestCurrencyOffers,groupCurrencyBanks} from './dist/currency.js';
import {buildDotChartModel,renderDotChart,bindChartPeriodWheel} from './dist/dot-chart.js';
const page=date=>`<h1>Курсы банков Гродно на ${date}</h1><table><tr data-row-type="default" data-bank-sef-alias="bank"><td><img alt="Банк"></td></tr><tr data-bank-sef-alias="bank"><td><a class="currencies-courses__branch-name" href="/bank/bank/department/1">г. Гродно, улица, 1</a><i class="ic-update-time mr-5"></i> 08:48<input data-branch-converter="rates" value="{&quot;USD&quot;:{&quot;buy&quot;:2.98,&quot;sell&quot;:3.02,&quot;multiplier&quot;:1}}"></td></tr></table>`;
for(const date of ['18 ноября 2026','18.11.2026']){
 const [offer]=parseMyfin(page(date),'Гродно');assert.equal(offer.updatedAt,'2026-11-18T05:48:00.000Z');assert.equal(offer.rates.USD.buy,2.98);assert.equal(offer.address,'улица, 1');
}
assert.equal(parseMyfin(page('неизвестно'),'Гродно')[0].updatedAt,null);
const official=parseBelarusbank([{filial_id:'1',name:'Минск',USD_in:'0',USD_out:'3.0',EUR_in:'bad',EUR_out:'0',kurs_date_time:'2026-11-18 09:00:00'}]);
assert.equal(official[0].rates.USD.buy,null);assert.equal(official[0].rates.USD.sell,3);assert.equal(official[0].updatedAt,'2026-11-18T06:00:00.000Z');
const offers=normalizeCurrencyData({offers:[{id:'a',bank:'A',rates:{USD:{buy:2.99,sell:3.02}}},{id:'b',bank:'B',rates:{USD:{buy:2.98,sell:3.01}}},{id:'bad',bank:'Bad',sourceUrl:'javascript:alert(1)',rates:{USD:{buy:0,sell:-1}}}]}).offers;
assert.equal(groupCurrencyBanks([...offers,offers[0]]).length,2);
const best=bestCurrencyOffers(offers,'USD');assert.equal(best.buy.id,'a');assert.equal(best.sell.id,'b');assert.equal(offers.length,2);assert.deepEqual(bestCurrencyOffers(offers,'EUR'),{buy:null,sell:null});
assert.equal(buildDotChartModel([]),null);
for(const count of [1,2,50,67,10000]){
 const points=Array.from({length:count},(_,i)=>({date:'2026-11-18',close:count===1?0:100+Math.sin(i)*10}));
 if(count===10000){points[333].close=0;points[777].close=300}
 const model=buildDotChartModel(points),indices=model.columns.map(c=>c.index);
 assert(indices.includes(0)&&indices.includes(count-1));
 assert.equal(model.columns.length,Math.min(72,count));
 assert(model.dotCount<=72*21);
 if(count===10000)assert(indices.includes(333)&&indices.includes(777));
 assert(model.columns.every(c=>Number.isFinite(c.x)&&Number.isFinite(c.y)&&c.dots.every(d=>Number.isFinite(d.y))));
 const step=model.columns[1]?.x-model.columns[0].x;
 model.columns.forEach(({x,dots},i)=>{
   if(i>0)assert(Math.abs(x-model.columns[i-1].x-step)<1e-9);
   dots.forEach(({y},row)=>{if(row>0)assert(Math.abs(dots[row-1].y-y-7.7)<1e-9)});
 });
}
assert(Number.isFinite(buildDotChartModel([{date:'2026-11-18',close:100},{date:'2026-11-19',close:100}]).min));
assert.throws(()=>buildDotChartModel([{date:'x',close:NaN}]));
const svg=renderDotChart([{date:'2026-11-18',close:1},{date:'2026-11-19',close:2}],{formatValue:()=>'<value>'});assert(svg.includes('&lt;value&gt;'));assert(!svg.includes('price-line'));
assert.equal(new Set([...svg.matchAll(/<circle [^>]* r="([^"]+)"/g)].map(match=>match[1])).size,1);
assert.equal([...svg.matchAll(/class="dot-grid"/g)].length,5);
let wheel;
const wheelSteps=[];
bindChartPeriodWheel({addEventListener:(type,handler,options)=>{
 assert.equal(type,'wheel');assert.equal(options.passive,false);wheel=handler;
}},direction=>wheelSteps.push(direction));
function spin({inChart=true,ctrlKey=false,deltaY=120,timeStamp}) {
 let prevented=false;
 wheel({target:{closest:()=>inChart},ctrlKey,deltaY,deltaX:0,deltaMode:0,timeStamp,preventDefault:()=>{prevented=true}});
 return prevented;
}
assert.equal(spin({inChart:false,timeStamp:0}),false);
assert.equal(spin({ctrlKey:true,timeStamp:1}),false);
assert.equal(spin({timeStamp:20}),true);
assert.equal(spin({timeStamp:35}),true);
assert.equal(spin({timeStamp:290,deltaY:-120}),true);
assert.deepEqual(wheelSteps,[1,-1]);
console.log('Currency ranking, chart grid and extrema, and chart-only period scrolling: passed.');
