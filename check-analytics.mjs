import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Data URL permits testing this browser ESM module without a package dependency.
const source = await readFile(new URL('./dist/analytics.js', import.meta.url), 'utf8');
const { parsePriceCSV, calculateMetrics, createDemoSeries, selectPeriod } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
const sample = [
  { date: '2024-01-01', close: 100 },
  { date: '2024-01-02', close: 120 },
  { date: '2024-01-03', close: 90 },
  { date: '2024-01-04', close: 99 },
];
const metrics = calculateMetrics(sample);
near(metrics.totalReturn, -0.01);
near(metrics.maxDrawdown, -0.25);
near(metrics.bestDay, 0.2);
near(metrics.worstDay, -0.25);
near(metrics.upShare, 2 / 3);
assert.equal(metrics.observations, 3);
assert.deepEqual(calculateMetrics([...sample].reverse()), metrics);
assert.deepEqual(sample.map((point) => point.date), ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04']);
const flat = calculateMetrics(sample.map((point) => ({ ...point, close: 100 })));
assert.deepEqual(flat, { totalReturn: 0, maxDrawdown: 0, bestDay: 0, worstDay: 0, upShare: 0, observations: 3 });
assert.equal(calculateMetrics(sample.map((point, index) => ({ ...point, close: 100 + index }))).maxDrawdown, 0);
assert.throws(() => calculateMetrics([]));
assert.throws(() => calculateMetrics([sample[0]]));
assert.throws(() => calculateMetrics([{ date: '2024-02-30', close: 2 }, sample[1]]));
assert.throws(() => calculateMetrics([sample[0], sample[0]]));
assert.throws(() => calculateMetrics([{ date: '2024-01-01', close: Infinity }, sample[1]]));

const parsed = parsePriceCSV('\uFEFFDate,Close,Adjusted_Close,Note\r\n2024-02-29,100,50,"comma, here"\r\n2024-02-28,90,45,"quote ""test"""\r\n');
assert.equal(parsed.adjusted, true);
assert.deepEqual(parsed.points, [{ date: '2024-02-28', close: 45 }, { date: '2024-02-29', close: 50 }]);
assert.equal(parsePriceCSV(' date , CLOSE\n2024-01-01,1e2\n\n').points[0].close, 100);
assert.equal(parsePriceCSV('date,close\n2024-01-01,100').adjusted, false);
for (const input of [
  '', 'date,close', 'date,price\n2024-01-01,2',
  'date,close\n2023-02-29,2', 'date,close\n2024-13-01,2',
  'date,close\n2024-01-01,2\n2024-01-01,3',
  'date,close\n2024-01-01,0', 'date,close\n2024-01-01,-2',
  'date,close\n2024-01-01,', 'date,close\n2024-01-01,Infinity',
  'date,close\n2024-01-01,0x10', 'date,close\n2024-01-01,1e999',
  'date,close\n2024-01-01,2,3', 'date,close\n2024-01-01,"2',
  'date,close\n2024-01-01,"2"junk', 'date,close,Close\n2024-01-01,2,3',
  'date,close,adjusted_close\n2024-01-01,100,',
]) assert.throws(() => parsePriceCSV(input), input);
const largeCSV = 'date,close\n' + Array.from({ length: 10_001 }, (_, i) => `${new Date(Date.UTC(1990, 0, 1) + i * 86_400_000).toISOString().slice(0, 10)},100`).join('\n');
assert.throws(() => parsePriceCSV(largeCSV), /10000/);
assert.equal(parsePriceCSV(largeCSV.slice(0, largeCSV.lastIndexOf('\n'))).points.length, 10_000);

const periodPoints = ['2023-03-31', '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-31'].map((date) => ({ date, close: 100 }));
assert.deepEqual(selectPeriod(periodPoints, '1M').map((point) => point.date), ['2024-02-29', '2024-03-01', '2024-03-31']);
assert.equal(selectPeriod(periodPoints, '3M').length, 4);
assert.equal(selectPeriod(periodPoints, '1Y').length, 5);
assert.equal(selectPeriod(periodPoints, 'ALL').length, 5);
assert.throws(() => selectPeriod(periodPoints, '5Y'));
assert.throws(() => selectPeriod([], '1M'));
const leapPoints = ['2023-02-27', '2023-02-28', '2024-02-29'].map((date) => ({ date, close: 100 }));
assert.equal(selectPeriod(leapPoints, '1Y')[0].date, '2023-02-28');

const demo = createDemoSeries('META');
assert.equal(demo.length, 260);
assert.equal(demo[0].close, 100);
assert.equal(demo.at(-1).date, '2026-10-02');
assert.ok(demo.every((point) => point.close > 0 && ![0, 6].includes(new Date(`${point.date}T00:00:00Z`).getUTCDay())));
assert.deepEqual(demo, createDemoSeries(' meta '));
assert.notDeepEqual(demo, createDemoSeries('AAPL'));
assert.throws(() => createDemoSeries(''));
assert.equal(calculateMetrics(demo).observations, 259);
console.log('Analytics checks passed: historical metrics, CSV validation, calendar windows, deterministic synthetic data.');
