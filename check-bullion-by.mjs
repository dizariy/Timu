import assert from 'node:assert/strict';
import {parseBelagroprombank, parseBelgazprombank, parseMtbank} from './server/bullion-by.mjs';

const agro = `<p>Действуют с 19.11.2026 с 10:00</p><div data-tab="zoloto"><table>
  <tr><th>Номинал слитка (граммы)</th><th>Проба</th><th>Цена покупки</th><th>Цена продажи</th></tr>
  <tr><th>белорусских рублей</th></tr>
  <tr><td>5</td><td>999,9</td><td>2 000,00</td><td>2&nbsp;130,00</td></tr>
  <tr><td>20</td><td>999,9</td><td>7 850,00</td><td>-</td></tr>
  <tr><td>100</td><td>?</td><td>37 000,00</td><td>40 000,00</td></tr>
</table></div>`;
const agroQuote = parseBelagroprombank(agro);
assert.equal(agroQuote.asOf,'2026-11-19');
assert.equal(agroQuote.updatedAt,'2026-11-19T10:00:00+03:00');
assert.deepEqual(agroQuote.offers.map(({price,purity,grams})=>[price,purity,grams]),[[2130,999.9,5]]);
assert.equal(parseBelagroprombank(agro.replace('белорусских рублей','долларов')).offers.length,0);

const mtb = `<span class="pricing__title">Золото</span><em>Обновлено: 19.11.2026 09:30</em>
<table><tr><td>Вес, грамм</td><td>Покупка,<br>цена за слиток в BYN</td><td>Продажа,<br>цена за слиток в BYN</td></tr>
<tr><td>50</td><td>19 000.00</td><td>21 350.00</td></tr></table>`;
const [mtbBar] = parseMtbank(mtb).offers;
assert.deepEqual([mtbBar.price,mtbBar.purity,mtbBar.conditional],[21350,null,true]);
assert.equal(parseMtbank(mtb.replaceAll('за слиток','за грамм')).offers.length,0);

const bgp = `<div id="subtab-nbrb"><span class="convert__caption">18.11.2026, 12:30</span>
<table class="table-metal"><tr><th>Вид драгоценного металла</th><th>Проба</th>
<th>Масса<div>номинальная (лигатурная), в&nbsp;гр.</div></th>
<th>Покупка<div>цена за&nbsp;слиток, в&nbsp;BYN</div></th><th>Продажа<div>цена за&nbsp;слиток, в&nbsp;BYN</div></th></tr>
<tr><td>Платина</td><td>999,5</td><td>10</td><td>1 280.00</td><td>1 700.00</td></tr></table></div>`;
const [bgpBar] = parseBelgazprombank(bgp).offers;
assert.deepEqual([bgpBar.symbol,bgpBar.price,bgpBar.purity,bgpBar.updatedAt],['XPT',1700,999.5,'2026-11-18T12:30:00+03:00']);
assert.equal(parseBelgazprombank(bgp.replace('18.11.2026','31.11.2026')).offers.length,0);
console.log('BY bullion parsers: whole-bar sale prices, currency, purity and dates verified.');
