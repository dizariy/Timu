import assert from 'node:assert/strict';
import {estimateReferenceMove, referenceHistory} from './server/currency-forecast.mjs';
import {validatedOffers} from './server/commodity-offers.mjs';
import {buildDotChartModel} from './dist/dot-chart.js';
import {groupCommodityOffers} from './dist/commodity-offers.js';

const date = i => new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10);
const rows = Array.from({length: 50}, (_, i) => ({
  Cur_ID:431, Date:date(i) + 'T00:00:00', Cur_OfficialRate:3 * 1.001 ** i,
}));
rows.push({Cur_ID:451, Date:date(0), Cur_OfficialRate:900});
rows.push({Cur_ID:431, Date:'2026-02-31T00:00:00', Cur_OfficialRate:800});
rows.push({Cur_ID:431, Date:date(22) + 'T00:00:00', Cur_OfficialRate:0});
const history = referenceHistory(rows.reverse(), 431);
assert.equal(history.length, 50);
assert.equal(history[0][0], date(0));
const forecast = estimateReferenceMove(history, date(46));
assert.equal(forecast.asOf, date(46));
assert.equal(forecast.sampleSize, 7);
assert(Math.abs(forecast.estimatedChange - .001) < 1e-12);
assert(forecast.medianError < 1e-12);
assert.equal(estimateReferenceMove(history, date(58)), null);
assert.equal(estimateReferenceMove(history.slice(0, 15), date(14)), null);

const bar = {symbol:'XAU', grams:5, purity:999.9, price:2500};
assert.deepEqual(
  validatedOffers({asOf:date(10), offers:[bar, {...bar,purity:null}, {...bar,price:-1}, {...bar,symbol:'HG'}]})
    .offers.map(offer => offer.conditional), [false, true],
);
assert.equal(validatedOffers({asOf:null, offers:[bar]}).offers[0].conditional, true);
assert.equal(validatedOffers({asOf:date(0), offers:[{...bar,conditional:true}]}).offers[0].conditional, true);

const now = Date.parse('2026-11-19T10:15:00+03:00');
function provider(id, change = {}, priceChange = {}) {
  return {
    id, name:id, url:'https://example.com/', market:'BY', currency:'BYN', asOf:'2026-11-19',
    status:'ok', checkedAt:'2026-11-19T10:00:00+03:00',
    offers:[{...bar, terms:'Выдача в отделении.', conditional:false, ...priceChange}], ...change,
  };
}
const suppliers = [
  provider('current'),
  provider('yesterday', {asOf:'2026-11-18'}, {price:2400}),
  provider('wrong-size', {}, {grams:1, price:80}),
  provider('other-purity', {}, {purity:999, price:300}),
  provider('wrong-currency', {currency:'RUB'}, {price:1}),
  provider('cached', {status:'cached'}, {price:30}),
  provider('old', {checkedAt:'2026-11-19T07:30+03:00'}, {price:20}),
  provider('non-final', {}, {conditional:true, price:10}),
];
const [comparison] = groupCommodityOffers({sources:suppliers}, {symbol:'XAU', market:'BY', grams:5, now});
assert.equal(comparison.comparisons.length, 1);
assert.deepEqual(comparison.comparisons[0].rows.map(offer => offer.provider.id), ['yesterday','current']);
assert(comparison.references.some(offer => offer.provider.id === 'non-final'));
assert.equal(groupCommodityOffers({sources:[suppliers[0], suppliers[0]]}, {symbol:'XAU', market:'BY', now})[0].comparisons.length, 0);

const dots = buildDotChartModel([{date:date(0),close:10},{date:date(1),close:19}]).columns.at(-1).dots;
assert.equal(dots[0].color, '#150d53');
assert(dots.some(dot => dot.color === '#a565ff'));
assert.equal(dots.at(-1).color, '#ffea00');
console.log('Official FX baseline, physical offer comparison, and three chart colors: passed.');
