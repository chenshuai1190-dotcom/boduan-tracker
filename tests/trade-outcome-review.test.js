import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTradeOutcomeReview } from '../src/lib/tradeOutcomeReview.js';
import { isRegularNyseHoliday } from '../src/lib/quoteRefreshPolicy.js';

const NOW = Date.parse('2026-10-11T00:00:00Z');
const trade = { symbol: 'NVDA', date: '2026-01-02', side: 'buy', price: 999, shares: 10 };
function history(overrides = {}) {
  const cursor = new Date('2026-01-02T00:00:00Z');
  const rows = [];
  while (rows.length < 71) {
    const date = cursor.toISOString().slice(0, 10);
    if (![0, 6].includes(cursor.getUTCDay()) && !isRegularNyseHoliday(date)) rows.push({ date, close: 100 + rows.length });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const asOfDate = rows.at(-1).date;
  return { version: 1, source: 'EODHD_EOD', symbol: 'NVDA', name: 'NVIDIA', type: 'Common Stock',
    currency: 'USD', priceBasis: 'adjusted_close', expectedAsOfDate: asOfDate, asOfDate,
    availableFromDate: rows[0].date, fetchedAt: new Date(NOW).toISOString(), stale: false, staleReason: '', rows, ...overrides };
}
const model = (changes = {}) => buildTradeOutcomeReview({ trade, history: history(), now: NOW, ...changes });
const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('uses trade-day completed adjusted close and exactly 5/20/60 subsequent sessions', () => {
  const result = model();
  assert.equal(result.status, 'ready');
  assert.equal(result.baseAdjustedClose, 100);
  assert.equal(result.windows[0].endDate, '2026-01-09');
  assert.equal(result.windows[1].endDate, '2026-02-02');
  result.windows.forEach((window, index) => {
    assert.equal(window.status, 'available');
    assert.equal(window.observedDays, [5, 20, 60][index]);
    approx(window.returnPct, window.days);
    approx(window.maxRisePct, window.days);
    assert.equal(window.maxFallPct, 0);
  });
});

test('max moves use every intervening close and are not drawdown or execution-profit estimates', () => {
  const data = history();
  [100, 120, 80, 110, 90, 105].forEach((close, index) => { data.rows[index].close = close; });
  const result = model({ history: data });
  approx(result.windows[0].returnPct, 5);
  approx(result.windows[0].maxRisePct, 20);
  approx(result.windows[0].maxFallPct, -20);
  assert.equal(result.windows[0].maxRiseDate, '2026-01-05');
  assert.equal(result.windows[0].maxFallDate, '2026-01-06');
  const sold = model({ history: data, trade: { ...trade, side: 'sell', price: 1, shares: 999, fee: 200 } });
  assert.deepEqual(sold.windows, result.windows);
});

test('adjusted-close ratios do not repeat splits/dividends or apply extra TQQQ leverage', () => {
  const data = history({ symbol: 'TQQQ', name: 'TQQQ', type: 'ETF', leverage: 3 });
  data.rows = data.rows.map((row, index) => ({ ...row, close: row.close / 10, rawClose: index < 3 ? 500 : 50, split: '10/1', dividend: 10 }));
  const result = model({ history: data, trade: { ...trade, symbol: 'TQQQ', price: 500 } });
  approx(result.windows[0].returnPct, 5);
  approx(result.windows[2].returnPct, 60);
  assert.equal(model({ history: { ...data, priceBasis: 'close' }, trade: { ...trade, symbol: 'TQQQ' } }).reason, 'invalid_history');
});

test('future closes cannot affect past-cutoff horizons, and unfinished windows have no fabricated results', () => {
  const data = history();
  const result = model({ history: data, asOfDate: '2026-01-09' });
  assert.equal(result.windows[0].status, 'available');
  assert.equal(result.windows[1].status, 'pending');
  assert.equal(result.windows[1].observedDays, 5);
  assert.equal(result.windows[1].returnPct, null);
  assert.equal(result.windows[1].maxRisePct, null);
  data.rows.forEach(row => { if (row.date > '2026-01-09') row.close = 1e9; });
  assert.deepEqual(model({ history: data, asOfDate: '2026-01-09' }).windows, result.windows);
  assert.equal(model({ asOfDate: '2026-01-08' }).windows[0].observedDays, 4);
  assert.equal(model({ asOfDate: '2026-01-08' }).windows[0].returnPct, null);
  assert.equal(model({ asOfDate: '2026-12-31' }).reason, 'invalid_cutoff');
});

test('missing sessions never shift fifth/twentieth/sixtieth-session endpoints', () => {
  const data = history();
  data.rows.splice(8, 1);
  const result = model({ history: data });
  assert.equal(result.windows[0].status, 'available');
  assert.equal(result.windows[1].status, 'missing_data');
  assert.equal(result.windows[1].returnPct, null);
  assert.equal(result.windows[2].status, 'missing_data');
  data.rows.splice(3, 1);
  assert.equal(model({ history: data }).windows[0].status, 'missing_data');
});

test('verified extraordinary exchange closures do not shift or break the five-session result', () => {
  const dates = ['2025-01-03', '2025-01-06', '2025-01-07', '2025-01-08', '2025-01-10', '2025-01-13'];
  const data = history({ rows: dates.map((date, index) => ({ date, close: 100 + index })),
    availableFromDate: dates[0], asOfDate: dates.at(-1), expectedAsOfDate: dates.at(-1) });
  const result = model({ history: data, trade: { ...trade, date: dates[0] } });
  assert.equal(result.windows[0].status, 'available');
  assert.equal(result.windows[0].endDate, '2025-01-13');
  approx(result.windows[0].returnPct, 5);
});

test('trade-date absence, non-session dates and future trades do not borrow a neighbouring close', () => {
  assert.equal(model({ trade: { ...trade, date: '2026-01-03' } }).reason, 'missing_trade_close');
  assert.equal(model({ trade: { ...trade, date: '2026-01-19' } }).reason, 'missing_trade_close');
  assert.equal(model({ trade: { ...trade, date: '2026-10-12' } }).reason, 'awaiting_trade_close');
  const data = history();
  data.rows.splice(1, 1);
  assert.equal(model({ history: data, trade: { ...trade, date: '2026-01-05' } }).reason, 'missing_trade_close');
});

test('malformed data, symbol mismatches and nonpositive prices stay unknown', () => {
  for (const changes of [{ history: null }, { history: history({ symbol: 'QQQ' }) }, { history: history({ source: 'YAHOO' }) },
    { trade: { ...trade, date: '2026-02-30' } }, { trade: { ...trade, symbol: 'NVDA.US' } }, { trade: { ...trade, side: 'short' } }]) {
    const result = model(changes);
    assert.equal(result.status, 'unavailable');
    assert.ok(result.windows.every(window => window.returnPct === null));
  }
  for (const close of [0, -1, null, '100', NaN, Infinity]) {
    const data = history(); data.rows[5].close = close;
    assert.equal(model({ history: data }).reason, 'invalid_history');
  }
});

test('stale data remain explicitly stale without filling the missing latest close', () => {
  const data = history({ expectedAsOfDate: '2026-10-09', stale: true, staleReason: 'provider_unavailable' });
  const result = model({ history: data });
  assert.equal(result.stale, true);
  assert.equal(result.asOfDate, data.asOfDate);
  approx(result.windows[0].returnPct, 5);
});
