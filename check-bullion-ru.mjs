import assert from 'node:assert/strict';
import {parseUralpromBullion,parseRosvekselBullion} from './server/bullion-ru.mjs';

const bank = `<h3>Обезличенные металлические счета, с 18.11.2026 9:00:00</h3>
  <table><tr><td>Золото 5 г</td><td>11 000,00 ₽</td><td>11000,00 ₽</td></tr></table>
  <h3>Мерные слитки, с 19.11.2026 9:00:00</h3>
  <div class="table"><table><tr><td>Вид и масса слитка</td><td>Курс продажи (руб/г)</td><td>Стоимость слитка (руб)</td></tr>
  <tr><td><strong>Золото 5 г</strong></td><td>10&#160;525,00 ₽</td><td>52&#160;625,00 ₽</td></tr>
  <tr><td>Золото 1000 г</td><td>10&nbsp;090,00 ₽</td><td>10&nbsp;088&nbsp;991,00 ₽</td></tr></table></div>`;
const dated = parseUralpromBullion(bank);
assert.equal(dated.asOf,'2026-11-19');
assert.deepEqual(dated.offers.map(({symbol,grams,purity,price,conditional})=>({symbol,grams,purity,price,conditional})),[
  {symbol:'XAU',grams:5,purity:null,price:52625,conditional:true},
  {symbol:'XAU',grams:1000,purity:null,price:10088991,conditional:true},
]);
assert.throws(()=>parseUralpromBullion(bank.replace('Мерные слитки','Обезличенные металлические счета')));
assert.throws(()=>parseUralpromBullion(bank.replace('19.11.2026','31.11.2026')));

const shop = `Стоимость указана без учёта доставки
  <button type="button" aria-label="5 г золото 999,9, добавить в набор">5 г</button>
  <span class="font-medium tabular-nums leading-none">53&#8239;892 ₽</span>
  <button type="button" aria-label="100 г золото 999,9, добавить в набор">100 г</button>
  <span class="font-medium tabular-nums leading-none">1 млн ₽</span>
  Золотой сертификат <span class="font-medium tabular-nums leading-none">998 000 ₽</span>`;
const undated = parseRosvekselBullion(shop);
assert.equal(undated.asOf,null);
assert.equal(undated.offers.length,1);
const [online]=undated.offers;
assert.equal(online.price,53892);
assert.equal(online.purity,999.9);
assert.equal(online.conditional,true);
assert.match(online.terms,/без доставки/);
assert.throws(()=>parseRosvekselBullion(shop.replace('без учёта доставки','с доставкой')));
console.log('Russian bullion parser guardrails passed: physical bar, explicit total, unknown purity, undated and delivery-exclusive price.');
