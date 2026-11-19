import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCBRMetals, parseNBRBMetals, parseWorldBankWorkbook, getCommodityData } from './server/commodity-data.mjs';

const cbr=parseCBRMetals(`<?xml version="1.0"?><Metall>
<Record Date="07.10.2026" Code="1"><Buy>11 413,10</Buy><Sell>11413,10</Sell></Record>
<Record Date="06.10.2026" Code="1"><Buy>11441,31</Buy></Record>
<Record Date="07.10.2026" Code="2"><Buy>170,34</Buy></Record>
<Record Date="07.10.2026" Code="3"><Buy>4771,89</Buy></Record>
<Record Date="07.10.2026" Code="4"><Buy>3255,99</Buy></Record>
<Record Date="31.02.2026" Code="1"><Buy>999</Buy></Record>
<Record Date="07.10.2026" Code="5"><Buy>999</Buy></Record>
<Record Date="07.10.2026" Code="1"><Buy>11413,10</Buy></Record>
</Metall>`);
assert.deepEqual(cbr[0],[{date:'2026-10-06',price:11441.31},{date:'2026-10-07',price:11413.1}]);
assert.equal(cbr[1][0].price,170.34);
assert.equal(cbr[2][0].price,4771.89);
assert.equal(cbr[3][0].price,3255.99);
assert.throws(()=>parseCBRMetals('<html>Access denied</html>'));
assert.throws(()=>parseCBRMetals(null));

const by=parseNBRBMetals([
  {Date:'2026-10-07T00:00:00',MetalId:0,Value:410.77},
  {Date:'2026-10-06T00:00:00',MetalId:0,Value:404.41},
  {Date:'2026-10-07T00:00:00',MetalId:1,Value:6.03},
  {Date:'2026-10-07T00:00:00',MetalId:2,Value:168.14},
  {Date:'2026-10-07T00:00:00',MetalId:3,Value:115.07},
  {Date:'2026-02-31T00:00:00',MetalId:0,Value:100},
  {Date:'2026-10-08T00:00:00',MetalId:0,Value:true},
  {Date:'2026-10-08T00:00:00',MetalId:0,Value:'410.00'},
  {Date:'2026-10-08T00:00:00',MetalId:0,Value:-1},
  {Date:'2026-10-08T00:00:00',MetalId:0,Value:Infinity},
  null,{},
]);
assert.deepEqual(by[0],[{date:'2026-10-06',price:404.41},{date:'2026-10-07',price:410.77}]);
assert.equal(by[1][0].price,6.03);
assert.throws(()=>parseNBRBMetals({error:'unavailable'}));
assert.throws(()=>parseWorldBankWorkbook(Buffer.from('not an XLSX file')));
assert.throws(()=>parseWorldBankWorkbook(Buffer.alloc(70000)));

const snapshot=JSON.parse(await readFile(new URL('./dist/data/commodity-regions.json',import.meta.url),'utf8'));
assert.equal(snapshot.schemaVersion,1);
assert.equal(snapshot.items.length,10);
const ids=new Set();
let dailyCount=0,monthlyCount=0;
for(const item of snapshot.items){
  assert.ok(!ids.has(item.id)); ids.add(item.id);
  assert.ok(Number.isFinite(item.price)&&item.price>0);
  assert.ok(item.source.url.startsWith('https://'));
  const histories=[item.history];
  for(const [region,value] of Object.entries(item.regions)){
    assert.ok(value,`${item.id} ${region} missing`);
    assert.equal(value.currency,region==='RU'?'RUB':'BYN');
    if(value.kind==='official'){
      assert.equal(value.unit,'г');
      assert.equal(value.priceType,'accounting');
      assert.equal(value.source.kind,'accounting');
      assert.ok(value.history.length>=200,'Regional series should contain roughly one year of observations');
      assert.equal(value.history.at(-1).price,value.price);
      assert.equal(value.history.at(-1).date,value.dataAsOf);
      dailyCount+=value.history.length;
    } else {
      assert.equal(value.kind,'converted');
      assert.equal(value.priceType,'converted-monthly-average');
      assert.equal(value.history.length,0,'Never relabel USD history as local-market history');
      assert.ok(Math.abs(value.price-item.price*value.fx.rate)<0.00000001);
      assert.ok(value.source.method.includes('Не котировка местной биржи'));
    }
    histories.push(value.history);
  }
  for(const history of histories){
    for(let index=0;index<history.length;index++){
      const point=history[index];
      assert.match(point.date,/^\d{4}-\d{2}-\d{2}$/);
      assert.equal(new Date(point.date).toISOString().slice(0,10),point.date);
      assert.ok(Number.isFinite(point.price)&&point.price>0);
      if(index)assert.ok(point.date>history[index-1].date,'History must be ordered and deduplicated');
    }
  }
  if(item.id!=='XPD'){
    assert.equal(item.history.length,60);
    assert.equal(item.historyFrequency,'monthly');
    monthlyCount+=item.history.length;
  } else assert.equal(item.history.length,0,'World Bank has no palladium series');
}

// Exercise the disk cache without live HTTP requests or changing the source file.
const OriginalDate=Date,originalFetch=globalThis.fetch;
const frozenTime=OriginalDate.parse(snapshot.updatedAt);
globalThis.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:[frozenTime]));} static now(){return frozenTime;}};
let fetches=0;
globalThis.fetch=async()=>{fetches++;throw new Error('Network is forbidden in this test');};
try{
  const cached=await getCommodityData();
  assert.equal(fetches,0);
  assert.equal(cached.items.length,10);
  cached.items[0].price=-1;
  const again=await getCommodityData();
  assert.ok(again.items[0].price>0,'Consumers must not mutate the shared cache');
}finally{globalThis.Date=OriginalDate;globalThis.fetch=originalFetch;}
console.log(`Commodity checks passed: CBR/NBRB parsing, invalid/duplicate data, corrupt XLSX, ${dailyCount} daily observations, ${monthlyCount} monthly observations, FX semantics and isolated disk cache. No network calls.`);
