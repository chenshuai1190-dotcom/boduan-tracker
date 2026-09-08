import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInvestmentComparisonModel, getInvestmentComparisonSnapshot, normalizeInvestmentComparisonData, normalizeInvestmentSymbols } from '../src/lib/investmentComparisonModel.js';

// Small invented test fixtures, never market data or application fallback data.
const dates = ['2024-12-30', '2024-12-31', '2025-01-02', '2025-12-31', '2026-01-02', '2026-09-03', '2026-09-04'];
function fixture() {
  return {
    version: 1, source: 'EODHD_EOD', priceBasis: 'adjusted_close', currency: 'USD',
    expectedAsOfDate: '2026-09-04', asOfDate: '2026-09-04', availableFromDate: dates[0],
    fetchedAt: '2026-09-08T12:00:00Z', stale: false, staleReason: '', symbols: ['QQQ', 'TQQQ'],
    series: Object.fromEntries(['QQQ', 'TQQQ'].map((symbol, index) => [symbol, {
      symbol, name: `${symbol} test fixture`, currency: 'USD', type: 'ETF', priceBasis: 'adjusted_close',
      rows: dates.map((date, rowIndex) => ({ date, close: (index ? [20, 24, 12, 18, 10, 11, 12] : [50, 55, 66, 77, 70, 73, 75])[rowIndex] })),
    }])),
  };
}
const build = (options = {}) => buildInvestmentComparisonModel({ data: fixture(), startYear: 2024, principal: 1000000, ...options });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-12), `${actual} != ${expected}`);

test('same principal starts on the first actual common session and uses adjusted price ratios', () => {
  const model = build();
  assert.equal(model.requestedStartDate, '2024-01-01');
  assert.equal(model.actualStartDate, '2024-12-30');
  assert.equal(model.startAdjustmentReason, 'available_history');
  assert.deepEqual(model.points[0].values, { QQQ: 1000000, TQQQ: 1000000 });
  assert.deepEqual(model.points[0].returns, { QQQ: 0, TQQQ: 0 });
  assert.deepEqual(model.points.map((point) => point.date), dates);
  close(model.points.at(-1).values.QQQ, 1500000);
  close(model.points.at(-1).values.TQQQ, 600000);
});

test('all daily totals, profits, percentages and principal scaling remain consistent', () => {
  const model = build(), small = build({ principal: 125000 });
  for (const [index, point] of model.points.entries()) {
    for (const symbol of model.symbols) {
      close(point.values[symbol], model.principal + point.profits[symbol]);
      close(point.returns[symbol], point.profits[symbol] / model.principal * 100);
      close(point.values[symbol], small.points[index].values[symbol] * 8);
      close(point.returns[symbol], small.points[index].returns[symbol]);
    }
  }
});

test('yearly returns compound from the previous year final real close, including negative years', () => {
  const model = build();
  for (const symbol of model.symbols) {
    let opening = model.principal, compounded = model.principal, profit = 0;
    for (const row of model.annual) {
      const value = row.bySymbol[symbol];
      close(value.opening, opening);
      close(value.end, value.opening + value.profit);
      close(value.returnPct, value.profit / value.opening * 100);
      compounded *= 1 + value.returnPct / 100;
      profit += value.profit;
      close(value.end, compounded);
      close(value.cumulativeProfit, profit);
      close(value.cumulativeReturnPct, (compounded / model.principal - 1) * 100);
      opening = value.end;
    }
  }
  close(model.annual[1].bySymbol.QQQ.returnPct, 40);
  close(model.annual[1].bySymbol.TQQQ.returnPct, -25);
  assert.equal(model.annual.at(-1).partial, true);
  assert.equal(model.annual[0].complete, false, 'an investment beginning in December is not a full first year');
  assert.equal(model.annual[0].calendarComplete, true);
  assert.equal(model.annual[0].firstYearPartial, true);
  assert.equal(model.annual[0].periodStartDate, '2024-12-30');
});

test('IPO or later available history moves both purchases together without fabricated earlier points', () => {
  const data = fixture();
  data.series.TQQQ.rows = data.series.TQQQ.rows.slice(2);
  data.availableFromDate = '2025-01-02';
  const model = build({ data });
  assert.equal(model.actualStartDate, '2025-01-02');
  assert.equal(model.actualStartYear, 2025);
  assert.equal(model.startYear, 2024);
  assert.equal(model.points.length, 5);
  assert.equal(model.annual[0].year, 2025);
  assert.deepEqual(model.points[0].values, { QQQ: 1000000, TQQQ: 1000000 });
  assert.equal(model.startAdjustmentReason, 'available_history');
  const later = build({ startYear: 2025 });
  assert.equal(later.actualStartDate, '2025-01-02');
  assert.equal(later.startAdjustmentReason, 'first_session');
  assert.equal(later.firstYearPartial, false, 'January 2 is the first regular 2025 session');
  assert.equal(later.annual[0].complete, true);
});

test('split and dividend raw-close fields never override the adjusted-close contract', () => {
  const data = fixture();
  data.series.QQQ.rows[0].rawClose = 200;
  data.series.QQQ.rows[1].rawClose = 55;
  data.series.QQQ.rows[1].dividend = 2;
  const model = build({ data });
  close(model.points[1].returns.QQQ, 10);
  data.series.QQQ.priceBasis = 'close';
  assert.throws(() => build({ data }), { code: 'INVALID_DATA' });
});

test('malformed, partial, unordered, duplicated, wrong-currency or raw prices fail closed', () => {
  const mutations = [
    (data) => { data.currency = 'CNY'; },
    (data) => { data.priceBasis = 'close'; },
    (data) => { data.source = 'YAHOO'; },
    (data) => { data.series.QQQ.currency = 'HKD'; },
    (data) => { data.series.QQQ.rows[0].close = null; },
    (data) => { data.series.QQQ.rows[0].close = 0; },
    (data) => { data.series.QQQ.rows[0].close = '50'; },
    (data) => { data.series.QQQ.rows[0].close = Infinity; },
    (data) => { data.series.QQQ.rows[0].date = '2024-02-30'; },
    (data) => { data.series.QQQ.rows[0].date = '2024-12-29'; },
    (data) => { data.series.QQQ.rows[1].date = data.series.QQQ.rows[0].date; },
    (data) => { data.series.QQQ.rows.reverse(); },
    (data) => { data.series.QQQ.rows.splice(2, 1); },
    (data) => { data.series.QQQ.rows.pop(); },
    (data) => { data.series.QQQ.type = 'Preferred Stock'; },
    (data) => { data.series.QQQ.symbol = 'SPY'; },
    (data) => { data.availableFromDate = '2025-01-02'; },
    (data) => { data.asOfDate = '2026-09-03'; },
    (data) => { data.expectedAsOfDate = '2026-09-03'; },
  ];
  for (const mutate of mutations) {
    const data = fixture(); mutate(data);
    assert.equal(normalizeInvestmentComparisonData(data), null);
    assert.throws(() => build({ data }), { code: 'INVALID_DATA' });
  }
});

test('integer real-day snapshots never interpolate financial facts or leak future annual rows', () => {
  const model = build();
  for (let progress = 0; progress <= model.points.length - 1; progress += 0.25) {
    const snapshot = getInvestmentComparisonSnapshot(model, progress);
    assert.equal(snapshot.index, Math.floor(progress));
    assert.strictEqual(snapshot.point, model.points[Math.floor(progress)]);
    assert.ok(snapshot.annualRows.every((row) => row.year <= snapshot.point.year && row.throughDate <= snapshot.point.date));
    for (const symbol of model.symbols) close(snapshot.annualRows.at(-1).bySymbol[symbol].end, snapshot.point.values[symbol]);
  }
  const yearEnd = getInvestmentComparisonSnapshot(model, 1);
  assert.equal(yearEnd.annualRows.length, 1);
  assert.equal(yearEnd.annualRows[0].complete, false);
  assert.equal(yearEnd.annualRows[0].calendarComplete, true);
  const nextYear = getInvestmentComparisonSnapshot(model, 2);
  assert.equal(nextYear.annualRows.length, 2);
  assert.equal(nextYear.annualRows[1].partial, true);
  close(nextYear.annualRows[1].bySymbol.TQQQ.returnPct, -50);
  assert.equal(getInvestmentComparisonSnapshot(model, 0).annualRows[0].partial, true);
  assert.equal(getInvestmentComparisonSnapshot(model, model.points.length - 1).isFinal, true);
  for (const progress of [-1, Infinity, NaN, '1', 7]) assert.throws(() => getInvestmentComparisonSnapshot(model, progress), { code: 'INVALID_PROGRESS' });
});

test('principal, starting year, minimum coverage and symbol validation are strict', () => {
  for (const principal of [0, 0.99, -1, 1e9 + 1, Infinity, NaN, null, '100']) assert.throws(() => build({ principal }), { code: 'INVALID_PRINCIPAL' });
  for (const startYear of [1899, 2027, 2024.5, '2024', null]) assert.throws(() => build({ startYear }), { code: 'INVALID_START_YEAR' });
  for (const symbols of [[], ['QQQ'], ['QQQ', 'QQQ'], ['QQQ.US', 'TQQQ'], ['QQQ-', 'TQQQ'], ['QQQ..A', 'TQQQ'], ['BTC.CC', 'TQQQ']]) assert.throws(() => normalizeInvestmentSymbols(symbols), { code: 'INVALID_SYMBOLS' });
  assert.deepEqual(normalizeInvestmentSymbols([' brk.b ', 'SPY']), ['BRK.B', 'SPY']);
  const data = fixture();
  for (const series of Object.values(data.series)) series.rows = series.rows.slice(-1);
  data.availableFromDate = data.asOfDate;
  assert.throws(() => build({ data }), { code: 'INVALID_DATA' });
});

test('stale metadata survives calculation and valid normalizer copies do not mutate source rows', () => {
  const data = fixture();
  data.expectedAsOfDate = '2026-09-08'; data.stale = true; data.staleReason = 'incomplete_close';
  const before = JSON.stringify(data), model = build({ data });
  assert.equal(model.stale, true);
  assert.equal(model.staleReason, 'incomplete_close');
  assert.equal(model.asOfDate, '2026-09-04');
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(build({ data }), model);
});
