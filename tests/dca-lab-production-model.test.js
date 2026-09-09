import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDcaModel, DCA_SYMBOLS } from '../src/lib/dcaLabModel.js';
import { isRegularNyseHoliday } from '../src/lib/quoteRefreshPolicy.js';

// Invented test fixtures in the real wire schema; never a market-data fallback.
const DAY = 86400000;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-11), `${actual} != ${expected}`);
const PLAN = { symbol: 'QQQ', startYear: 2020, endYear: 2025, initial: 10000, amount: 1000, frequency: 'monthly' };
function priceRows(from, through, price = () => 100) {
  const result = [];
  for (let time = Date.parse(`${from}T00:00:00Z`); time <= Date.parse(`${through}T00:00:00Z`); time += DAY) {
    const date = new Date(time).toISOString().slice(0, 10);
    if (![0, 6].includes(new Date(time).getUTCDay()) && !isRegularNyseHoliday(date)) result.push({ date, close: price(date, result.length) });
  }
  return result;
}
function history({ symbol = 'QQQ', from = '2020-01-02', through = '2025-12-31', price, rows = priceRows(from, through, price), expected = rows.at(-1)?.date } = {}) {
  return {
    version: 1, source: 'EODHD_EOD', symbol, name: `${symbol} fixture`, type: 'ETF', currency: 'USD', priceBasis: 'adjusted_close', rows,
    availableFromDate: rows[0]?.date, asOfDate: rows.at(-1)?.date, expectedAsOfDate: expected,
    stale: rows.at(-1)?.date !== expected, staleReason: rows.at(-1)?.date !== expected ? 'incomplete_close' : '', fetchedAt: `${expected}T22:00:00.000Z`,
  };
}
const build = (data = history(), plan = PLAN) => buildDcaModel({ data, plan });

test('real-contract calculation starts on an observed trading day, keeps the requested dates, and has 72 monthly purchases', () => {
  const model = build();
  assert.equal(model.source, 'EODHD_EOD');
  assert.equal(model.startDate, '2020-01-02');
  assert.equal(model.endDate, '2025-12-31');
  assert.equal(model.summary.purchaseCount, 72);
  assert.equal(model.summary.invested, 82000);
  assert.equal(model.purchases[0].amount, 11000);
  close(model.summary.value, 82000);
  close(model.summary.profit, 0);
  close(model.summary.returnPct, 0);
  close(model.summary.averageCost, 100);
  assert.deepEqual(model.period, { requestedStartDate: '2020-01-01', requestedEndDate: '2025-12-31', actualStartDate: '2020-01-02', actualEndDate: '2025-12-31', startAdjusted: true, partialEnd: false });
  assert.ok(model.years.every(row => !row.partial));
});

test('an older source first date does not flag an ordinary January holiday as a shortened history', () => {
  const model = build(history({ from: '2019-12-02' }));
  assert.equal(model.period.startAdjusted, false);
  assert.equal(model.startDate, '2020-01-02');
});

test('a 2026 plan stops at the observed close and labels the current year partial, without future contributions', () => {
  const model = build(history({ through: '2026-09-08' }), { ...PLAN, endYear: 2026 });
  assert.equal(model.endDate, '2026-09-08');
  assert.equal(model.period.partialEnd, true);
  assert.equal(model.summary.purchaseCount, 81);
  assert.equal(model.summary.invested, 91000);
  assert.equal(model.years.at(-1).year, 2026);
  assert.equal(model.years.at(-1).partial, true);
  assert.equal(model.years.at(-1).throughDate, '2026-09-08');
  assert.equal(model.years.at(-1).contribution, 9000);
  assert.ok(model.rows.every(row => row.date <= '2026-09-08'));
  assert.ok(model.purchases.every(row => row.date <= '2026-09-08'));
});

test('week and month contributions use the first real session, including Monday holidays and January weekends', () => {
  const weekly = build(history({ through: '2020-02-07' }), { ...PLAN, endYear: 2020, frequency: 'weekly' });
  assert.deepEqual(weekly.purchases.map(row => row.date), ['2020-01-02', '2020-01-06', '2020-01-13', '2020-01-21', '2020-01-27', '2020-02-03']);
  const monthly = build(history({ from: '2022-01-03', through: '2022-12-30' }), { ...PLAN, startYear: 2022, endYear: 2022 });
  assert.equal(monthly.purchases[0].date, '2022-01-03');
  assert.equal(monthly.purchases[4].date, '2022-05-02');
  assert.equal(monthly.summary.purchaseCount, 12);
  assert.equal(monthly.period.partialEnd, false);
  assert.equal(monthly.years[0].partial, false);
});

test('the same calendar week crossing a year boundary gets no duplicate purchase', () => {
  const model = build(history({ from: '2020-12-28', through: '2021-01-08' }), { ...PLAN, startYear: 2020, endYear: 2021, frequency: 'weekly', initial: 0 });
  assert.deepEqual(model.purchases.map(row => row.date), ['2020-12-28', '2021-01-04']);
  assert.equal(model.years[0].contribution, 1000);
  assert.equal(model.years[1].contribution, 1000);
});

test('IPO inception is explicit and does not backfill years or accumulate nonexistent earlier purchases', () => {
  const data = history({ symbol: 'META', from: '2012-05-18', through: '2012-12-31' });
  const model = build(data, { ...PLAN, symbol: 'META', startYear: 2000, endYear: 2012 });
  assert.equal(model.period.requestedStartDate, '2000-01-01');
  assert.equal(model.period.actualStartDate, '2012-05-18');
  assert.equal(model.period.startAdjusted, true);
  assert.equal(model.years.length, 1);
  assert.equal(model.years[0].partial, true);
  assert.equal(model.summary.purchaseCount, 8);
  assert.equal(model.summary.invested, 18000);
  assert.throws(() => build(data, { ...PLAN, symbol: 'META', startYear: 2000, endYear: 2011 }), { code: 'NO_DATA' });
});

test('only the planned interval is checked for large gaps; outside-plan missing data cannot affect its arithmetic', () => {
  const rows = [...priceRows('2018-01-02', '2018-01-12'), ...priceRows('2020-01-02', '2025-12-31')];
  assert.equal(build(history({ rows })).summary.purchaseCount, 72);
});

test('missing whole months, years, and abnormal long gaps fail closed instead of silently reducing contributions', () => {
  for (const keep of [
    row => !row.date.startsWith('2020-05'),
    row => !row.date.startsWith('2021'),
    row => !(row.date > '2020-05-08' && row.date < '2020-05-27'),
  ]) {
    const rows = priceRows('2020-01-02', '2025-12-31').filter(keep);
    assert.throws(() => build(history({ rows })), { code: 'INCOMPLETE_HISTORY' });
  }
});

test('a missing first or final plan month cannot hide outside the filtered interval', () => {
  for (const month of ['2020-01', '2025-12']) {
    const rows = priceRows('2019-12-02', '2026-01-30').filter(row => !row.date.startsWith(month));
    assert.throws(() => build(history({ rows })), { code: 'INCOMPLETE_HISTORY' });
  }
});

test('non-standard multi-day closures remain valid and never get inserted or interpolated prices', () => {
  const rows = priceRows('2001-09-04', '2001-09-28').filter(row => row.date < '2001-09-11' || row.date > '2001-09-14');
  const model = build(history({ rows }), { ...PLAN, startYear: 2001, endYear: 2001, frequency: 'weekly' });
  assert.deepEqual(model.rows.map(row => row.date), rows.map(row => row.date));
  assert.ok(!model.rows.some(row => row.date === '2001-09-12'));
});

test('prices are already adjusted: raw fields cannot override them and simulation amounts reconcile daily', () => {
  const data = history({ price: (_date, index) => 100 + index * 0.02 });
  for (const row of data.rows) { row.rawClose = 1; row.adjustedClose = 99999; }
  const model = build(data);
  let contributed = 0;
  for (const row of model.rows) {
    contributed += row.contribution;
    close(row.invested, contributed);
    close(row.value, row.shares * row.price);
    close(row.profit, row.value - row.invested);
    close(row.returnPct, row.profit / row.invested * 100);
    close(row.lumpValue, model.summary.invested / model.rows[0].price * row.price);
    close(row.lumpProfit, row.lumpValue - model.summary.invested);
  }
  close(model.summary.averageCost * model.summary.shares, model.summary.invested);
  close(model.purchases.reduce((sum, row) => sum + row.shares, 0), model.summary.shares);
  assert.equal(model.rows[0].price, 100);
});

test('annual net income subtracts that year contributions and reconciles to cumulative profit', () => {
  const model = build(history({ price: (_date, index) => 100 + index * 0.02 }));
  let opening = 0, contribution = 0, profit = 0;
  for (const annual of model.years) {
    close(annual.profit, annual.value - opening - annual.contribution);
    contribution += annual.contribution;
    profit += annual.profit;
    close(annual.invested, contribution);
    assert.equal(annual.throughDate, model.rows.filter(row => row.date.startsWith(String(annual.year))).at(-1).date);
    opening = annual.value;
  }
  close(profit, model.summary.profit);
  close(contribution, model.summary.invested);
});

test('zero initial and initial-only plans remain valid; monetary scaling changes no return or purchase date', () => {
  const data = history({ price: (_date, index) => 100 + index * 0.02 });
  const noInitial = build(data, { ...PLAN, initial: 0 });
  assert.equal(noInitial.purchases[0].amount, 1000);
  assert.equal(noInitial.summary.invested, 72000);
  const initialOnly = build(data, { ...PLAN, amount: 0 });
  assert.equal(initialOnly.summary.purchaseCount, 1);
  close(initialOnly.summary.value, initialOnly.summary.lumpValue);
  const base = build(data), scaled = build(data, { ...PLAN, initial: 50000, amount: 5000 });
  for (const [index, row] of base.rows.entries()) {
    const other = scaled.rows[index];
    for (const key of ['invested', 'value', 'profit', 'lumpValue', 'lumpProfit', 'shares']) close(other[key], row[key] * 5);
    close(other.returnPct, row.returnPct);
    assert.equal(other.date, row.date);
  }
  close(base.summary.averageCost, scaled.summary.averageCost);
});

test('same-total-capital lump sum is fully funded at inception and a declining interval can favor DCA while both lose', () => {
  const data = history({ from: '2022-01-03', through: '2022-12-30', price: (_date, index) => 100 - index * 0.2 });
  const model = build(data, { ...PLAN, startYear: 2022, endYear: 2022 });
  close(model.rows[0].lumpValue, model.summary.invested);
  assert.ok(model.rows[0].lumpValue > model.rows[0].invested);
  assert.ok(model.summary.profit < 0);
  assert.ok(model.summary.lumpProfit < 0);
  assert.ok(model.summary.advantage > 0);
  close(model.summary.advantage, model.summary.value - model.summary.lumpValue);
});

test('validated non-preset tickers are supported without importing development presets or price generation', () => {
  const data = history({ symbol: 'BRK-B' });
  assert.equal(build(data, { ...PLAN, symbol: ' brk-b ' }).source, 'EODHD_EOD');
  assert.equal(DCA_SYMBOLS.length, 11);
  assert.equal(DCA_SYMBOLS.at(-1).symbol, 'AVGO');
});

test('invalid amounts, blank strings, unsupported years and mismatching tickers fail rather than coercing to zero', () => {
  for (const override of [{ initial: '' }, { amount: '1000' }, { initial: null }, { amount: false }, { initial: NaN },
    { amount: Infinity }, { initial: -1 }, { amount: -1 }, { initial: 100000001 }, { amount: 100000001 }, { initial: 0, amount: 0 }]) {
    assert.throws(() => build(history(), { ...PLAN, ...override }), { code: 'INVALID_AMOUNT' });
  }
  for (const override of [{ startYear: 1999 }, { endYear: 2026 }, { startYear: 2020.5 }, { endYear: '2025' }, { startYear: 2025, endYear: 2020 }]) {
    assert.throws(() => build(history(), { ...PLAN, ...override }), { code: 'INVALID_YEAR' });
  }
  assert.throws(() => build(history(), { ...PLAN, symbol: 'SPY' }), { code: 'INVALID_SYMBOL' });
  assert.throws(() => build(history(), { ...PLAN, frequency: 'daily' }), { code: 'INVALID_FREQUENCY' });
  assert.throws(() => build(history(), null), { code: 'INVALID_INPUT' });
});

test('synthetic, raw-price, missing, malformed and identity-invalid histories never render a false-zero portfolio', () => {
  for (const mutate of [
    data => { data.source = 'synthetic'; }, data => { data.priceBasis = 'close'; }, data => { data.currency = 'CNY'; },
    data => { data.symbol = 'qqq'; }, data => { data.type = 'Index'; }, data => { data.name = ''; },
    data => { data.rows = []; }, data => { data.rows[0].close = 0; }, data => { data.rows[0].close = null; },
    data => { data.rows[0].close = '100'; }, data => { data.rows[0].close = Infinity; }, data => { data.rows[0].date = '2020-02-30'; },
    data => { data.rows[0].date = '2020-01-01'; data.availableFromDate = '2020-01-01'; },
    data => { data.rows.reverse(); }, data => { data.rows[1].date = data.rows[0].date; },
    data => { data.rows.pop(); }, data => { data.availableFromDate = '2020-01-03'; },
    data => { data.asOfDate = '2026-01-02'; }, data => { data.staleReason = 'incomplete_close'; },
    data => { data.expectedAsOfDate = '2026-01-02'; }, data => { data.fetchedAt = 'invalid'; },
  ]) {
    const data = history(); mutate(data);
    assert.throws(() => build(data), { code: 'INVALID_DATA' });
  }
  assert.throws(() => buildDcaModel({ plan: PLAN }), { code: 'INVALID_DATA' });
});

test('a stale but valid close stops at its true date and keeps calculation deterministic and inputs immutable', () => {
  const data = history({ through: '2026-09-04', expected: '2026-09-08' });
  const original = structuredClone(data), plan = { ...PLAN, endYear: 2026 };
  const first = build(data, plan), second = build(data, plan);
  assert.deepEqual(first, second);
  assert.deepEqual(data, original);
  assert.equal(first.endDate, '2026-09-04');
  assert.equal(first.years.at(-1).throughDate, '2026-09-04');
  assert.equal(first.period.partialEnd, true);
});
