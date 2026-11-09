import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewStockDailyRecords, collectReviewStockDailyRecordRanges } from '../src/lib/reviewStockDailyRecordModel.js';
import { isRegularNyseHoliday } from '../src/lib/quoteRefreshPolicy.js';

const OWNER = 'stock-record-owner';
const NOW = Date.parse('2026-11-09T00:00:00Z');
const account = (date, extra = {}) => ({ id: `account-${date}`, user_id: OWNER, snapshot_date: date,
  currency: 'USD', source_version: 'pnl_snapshot_v2', locked_at: `${date}T23:00:00Z`, updated_at: `${date}T23:00:01Z`, ...extra });
const position = (date, symbol = 'NVDA', extra = {}) => ({ id: `position-${symbol}-${date}`, user_id: OWNER,
  snapshot_date: date, symbol, name: symbol, currency: 'USD', held_shares: 10, is_open: true,
  source_version: 'pnl_snapshot_v2', updated_at: `${date}T23:00:01Z`, ...extra });
const sessions = (from, to) => {
  const dates = [];
  for (let date = from; date <= to; date = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)) {
    if (![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) && !isRegularNyseHoliday(date)) dates.push(date);
  }
  return dates;
};
const prices = (start, end, returns = {}) => {
  let close = 100;
  return sessions(start, end).map(date => {
    close *= 1 + (returns[date] || 0) / 100;
    return { date, close };
  });
};
const history = (rows, symbol = 'NVDA', extra = {}) => ({ version: 1, source: 'EODHD_EOD_SPLITS',
  priceBasis: 'split_adjusted_close', currency: 'USD', symbols: [symbol], requestedStartDate: rows[0].date,
  requestedEndDate: rows.at(-1).date, expectedAsOfDate: '2026-11-06', asOfDate: rows.at(-1).date,
  splitBasisDate: '2026-11-06', fetchedAt: '2026-11-08T20:00:00Z',
  series: { [symbol]: { symbol, name: `${symbol} company`, type: 'Common Stock', rows } }, ...extra });
const input = (dates, rows, extra = {}) => ({ expectedUserId: OWNER, now: NOW,
  snapshots: dates.map(date => account(date)), symbolSnapshots: dates.map(date => position(date)), histories: [history(rows)], ...extra });
const sampleRows = () => prices('2025-12-31', '2026-01-12', {
  '2026-01-02': -2, '2026-01-05': -4, '2026-01-06': -3, '2026-01-07': -4,
  '2026-01-08': -5, '2026-01-09': -6, '2026-01-12': -8,
});

test('compares complete natural-year stock history including unheld dates; emits one stable branch and latest timestamp', () => {
  const data = input(['2026-01-06', '2026-01-08', '2026-01-12'], sampleRows());
  const result = buildReviewStockDailyRecords(data);
  assert.equal(result.events.length, 1);
  const event = result.events[0];
  assert.equal(event.id, 'record:stock_daily_return:NVDA:2026');
  assert.equal(event.metric, 'stock_daily_return');
  assert.equal(event.kind, 'record');
  assert.equal(event.startDate, '2026-01-08');
  assert.equal(event.endDate, '2026-01-12');
  assert.equal(event.date, '2026-01-12');
  assert.ok(Math.abs(event.value + 8) < 1e-8);
  assert.equal(event.previousRecordDate, '2026-01-09', 'unheld record remains the hurdle');
  assert.ok(Math.abs(event.previousRecordPct + 6) < 1e-8);
  assert.deepEqual(event.points.map(point => point.date), ['2026-01-08', '2026-01-12']);
  assert.equal(event.points[0].previousRecordDate, '2026-01-05');
  assert.ok(Math.abs(event.points[0].previousRecordPct + 4) < 1e-8);
  assert.equal(event.current, event.points.at(-1));
  assert.deepEqual(event.nodes.map(node => node.point), event.points);
  assert.equal(event.current.dailyPnlUsd, undefined);
  assert.equal(event.current.dailyReturnPct, undefined);
  assert.equal(event.current.netAssetsUsd, undefined);
  assert.equal(result.warnings.length, 0);
  assert.equal(buildReviewStockDailyRecords(input(['2026-01-08'], sampleRows())).events[0].id, event.id);
});

test('only confirmed positive closing holdings qualify; equal declines and nonnegative days never create records', () => {
  assert.equal(buildReviewStockDailyRecords(input(['2026-01-06', '2026-01-07'], sampleRows())).events.length, 0);
  assert.equal(buildReviewStockDailyRecords(input(['2026-01-08'], prices('2025-12-31', '2026-01-08', { '2026-01-08': 2 }))).events.length, 0);
  const event = buildReviewStockDailyRecords(input(['2026-01-02'], sampleRows())).events[0];
  assert.equal(event.previousRecordPct, null);
  assert.equal(event.previousRecordDate, null);
  for (const extra of [{ held_shares: 0 }, { held_shares: null }, { held_shares: '' }, { held_shares: -10 },
    { is_open: false }, { source_version: 'pnl_snapshot_v1' }, { currency: 'CNY' },
    { updated_at: 'invalid' }, { updated_at: '2027-01-01T00:00:00Z' }]) {
    const result = buildReviewStockDailyRecords(input(['2026-01-08'], sampleRows(), {
      symbolSnapshots: [position('2026-01-08', 'NVDA', extra)],
    }));
    assert.equal(result.events.length, 0, JSON.stringify(extra));
  }
});

test('clearing or replacing a current holding does not erase earlier verified events', () => {
  const data = input(['2026-01-08', '2026-01-12'], sampleRows(), {
    symbolSnapshots: [position('2026-01-08'), position('2026-01-12', 'NVDA', { held_shares: 0, is_open: false })],
  });
  const [event] = buildReviewStockDailyRecords(data).events;
  assert.equal(event.date, '2026-01-08');
  assert.equal(event.points.length, 1);
});

test('does not derive historical ownership from ledger entry dates or average-price holding imports', () => {
  const data = input([], sampleRows(), {
    stockTrades: [{ id: 'import', user_id: OWNER, symbol: 'NVDA', trade_date: '2026-01-02', side: 'buy',
      shares: 100, price: 80, note: '[[quote:stock-trade:record-kind=historical_holding:v1]]' }],
    symbolSnapshots: [position('2026-01-12')],
  });
  assert.equal(buildReviewStockDailyRecords(data).events.length, 0, 'a symbol snapshot without the locked account close is insufficient');
  data.snapshots = [account('2026-01-12')];
  assert.deepEqual(buildReviewStockDailyRecords(data).events[0].points.map(point => point.date), ['2026-01-12']);
});

test('ranges start at the last prior-year session and end at last confirmed holding; sold shares do not extend it', () => {
  const data = input(['2026-01-08', '2026-01-12'], sampleRows(), {
    symbolSnapshots: [position('2026-01-08'), position('2026-01-12', 'NVDA', { held_shares: 0 })],
  });
  assert.deepEqual(collectReviewStockDailyRecordRanges(data), {
    ranges: [{ symbol: 'NVDA', year: 2026, startDate: '2025-12-31', endDate: '2026-01-08' }], warnings: [],
  });
});

test('missing January baseline, missing first session and IPO history cannot become year-to-date records', () => {
  for (const rows of [sampleRows().slice(1), sampleRows().filter(row => row.date !== '2026-01-02')]) {
    const data = input(['2026-01-08'], rows);
    const result = buildReviewStockDailyRecords(data);
    assert.equal(result.events.length, 0);
    assert.ok(result.warnings.length > 0);
  }
});

test('a missing trading session halts later records in that year and preserves an earlier verified milestone', () => {
  const rows = sampleRows().filter(row => row.date !== '2026-01-09');
  const result = buildReviewStockDailyRecords(input(['2026-01-08', '2026-01-12'], rows));
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].date, '2026-01-08');
  assert.match(result.warnings.join(' '), /缺口/);
});

test('annual comparison restarts independently after a prior-year gap, with separate stock/year branches', () => {
  const rows2025 = prices('2024-12-31', '2025-01-06', { '2025-01-02': -3, '2025-01-06': -8 }).filter(row => row.date !== '2025-01-03');
  const dates = ['2025-01-02', '2025-01-06', '2026-01-08'];
  const data = input(dates, sampleRows(), { histories: [history(rows2025), history(sampleRows())] });
  const result = buildReviewStockDailyRecords(data);
  assert.deepEqual(result.events.map(event => [event.year, event.date]), [[2026, '2026-01-08'], [2025, '2025-01-02']]);
  assert.equal(new Set(result.events.map(event => event.id)).size, 2);
});

test('invalid and unadjusted prices, synthetic series, mixed currencies and future metadata fail closed', () => {
  const rows = sampleRows(), base = history(rows);
  for (const override of [{ source: 'YAHOO' }, { priceBasis: 'adjusted_close' }, { currency: 'CNY' },
    { synthetic: true }, { expectedAsOfDate: '2026-11-10', splitBasisDate: '2026-11-10' },
    { expectedAsOfDate: '2026-11-05', splitBasisDate: '2026-11-05' },
    { splitBasisDate: '2026-11-05' }, { fetchedAt: '2027-01-01T00:00:00Z' },
    { series: { NVDA: { ...base.series.NVDA, rows: rows.map((row, index) => index === 2 ? { ...row, close: '90' } : row) } } },
    { series: { NVDA: { ...base.series.NVDA, rows: rows.map((row, index) => index === 2 ? { ...row, close: 0 } : row) } } },
    { series: { NVDA: { ...base.series.NVDA, rows: [...rows].reverse() } } },
    { series: { NVDA: { ...base.series.NVDA, rows: [rows[0], rows[0], ...rows.slice(1)] } } }]) {
    const result = buildReviewStockDailyRecords(input(['2026-01-08'], rows, { histories: [{ ...base, ...override }] }));
    assert.equal(result.events.length, 0, JSON.stringify(override));
    assert.ok(result.warnings.length);
  }
});

test('only completed locked v2 account closes corroborate a position, including 17:00 ET boundary', () => {
  for (const extra of [{ source_version: 'pnl_snapshot_v1' }, { locked_at: null }, { currency: 'CNY' },
    { locked_at: '2026-01-08T21:59:59Z' }, { locked_at: '2027-01-01T00:00:00Z' },
    { updated_at: '2027-01-01T00:00:00Z' }, { updated_at: 'invalid' }]) {
    const result = buildReviewStockDailyRecords(input(['2026-01-08'], sampleRows(), { snapshots: [account('2026-01-08', extra)] }));
    assert.equal(result.events.length, 0, JSON.stringify(extra));
    assert.match(result.warnings.join(' '), /收盘依据/, JSON.stringify(extra));
  }
  const result = buildReviewStockDailyRecords(input(['2026-01-08'], sampleRows(), { snapshots: [account('2026-01-08', { locked_at: '2026-01-08T22:00:00Z' })] }));
  assert.equal(result.events.length, 1);
});

test('unverified positive completed positions report a warning, while zero, sold and not-yet-closed rows remain empty', () => {
  for (const extra of [{ source_version: 'pnl_snapshot_v1' }, { currency: 'CNY' }, { updated_at: 'invalid' }]) {
    const data = input(['2026-01-08'], sampleRows(), { symbolSnapshots: [position('2026-01-08', 'NVDA', extra)] });
    const collected = collectReviewStockDailyRecordRanges(data);
    assert.equal(collected.ranges.length, 0);
    assert.match(collected.warnings.join(' '), /收盘依据/);
    assert.deepEqual(buildReviewStockDailyRecords(data), { events: [], warnings: collected.warnings });
  }
  for (const extra of [{ held_shares: 0 }, { held_shares: -1 }, { is_open: false }]) {
    const data = input(['2026-01-08'], sampleRows(), { symbolSnapshots: [position('2026-01-08', 'NVDA', extra)] });
    assert.deepEqual(collectReviewStockDailyRecordRanges(data), { ranges: [], warnings: [] });
  }
  for (const date of ['2026-11-09', '2026-11-10']) {
    const data = input([date], sampleRows());
    assert.deepEqual(collectReviewStockDailyRecordRanges(data), { ranges: [], warnings: [] });
  }
  const beforeCutoff = input(['2026-01-08'], sampleRows(), { now: Date.parse('2026-01-08T21:59:59Z') });
  assert.deepEqual(collectReviewStockDailyRecordRanges(beforeCutoff), { ranges: [], warnings: [] });
});

test('market split basis uses the 16:00 market close while position confirmation keeps its 17:00 cutoff', () => {
  const now = Date.parse('2026-01-08T21:30:00Z');
  const rows = prices('2025-12-31', '2026-01-07', { '2026-01-05': -4 });
  const current = history(rows, 'NVDA', { expectedAsOfDate: '2026-01-08', splitBasisDate: '2026-01-08', fetchedAt: new Date(now).toISOString() });
  const data = input(['2026-01-05'], rows, { now, histories: [current] });
  assert.equal(buildReviewStockDailyRecords(data).events[0].date, '2026-01-05');
  const stale = { ...current, expectedAsOfDate: '2026-01-07', splitBasisDate: '2026-01-07' };
  const result = buildReviewStockDailyRecords({ ...data, histories: [stale] });
  assert.equal(result.events.length, 0);
  assert.ok(result.warnings.length);
});

test('conflicting overlapping stock series are not resolved by arrival order', () => {
  const rows = sampleRows();
  const conflict = rows.map(row => row.date === '2026-01-08' ? { ...row, close: row.close * .5 } : row);
  for (const histories of [[history(rows), history(conflict)], [history(conflict), history(rows)]]) {
    const result = buildReviewStockDailyRecords(input(['2026-01-08'], rows, { histories }));
    assert.equal(result.events.length, 0);
    assert.match(result.warnings.join(' '), /版本不一致/);
  }
});

test('cross-owner rows and duplicates reject the whole read instead of leaking or double counting', () => {
  const data = input(['2026-01-08'], sampleRows());
  assert.throws(() => buildReviewStockDailyRecords({ ...data, snapshots: [account('2026-01-08', { user_id: 'other' })] }), { code: 'REVIEW_ACCOUNT_CHANGED' });
  assert.throws(() => buildReviewStockDailyRecords({ ...data, symbolSnapshots: [position('2026-01-08', 'NVDA', { user_id: 'other' })] }), { code: 'REVIEW_ACCOUNT_CHANGED' });
  assert.throws(() => buildReviewStockDailyRecords({ ...data, snapshots: [account('2026-01-08'), account('2026-01-08', { id: 'duplicate' })] }), { code: 'REVIEW_HISTORY_DUPLICATE' });
  assert.throws(() => buildReviewStockDailyRecords({ ...data, symbolSnapshots: [position('2026-01-08'), position('2026-01-08', 'NVDA', { id: 'duplicate' })] }), { code: 'REVIEW_HISTORY_DUPLICATE' });
  assert.throws(() => collectReviewStockDailyRecordRanges({ ...data, expectedUserId: '' }), { code: 'REVIEW_AUTH_REQUIRED' });
  assert.throws(() => buildReviewStockDailyRecords({ ...data, now: NaN }), { code: 'REVIEW_CLOCK_INVALID' });
});

test('each ticker records its own annual decline independently', () => {
  const data = input(['2026-01-08'], sampleRows(), { symbolSnapshots: [position('2026-01-08'), position('2026-01-08', 'MSFT')],
    histories: [history(sampleRows()), history(sampleRows(), 'MSFT')] });
  assert.deepEqual(buildReviewStockDailyRecords(data).events.map(event => event.symbol), ['MSFT', 'NVDA']);
});

test('split-adjusted closes do not create a crash at a split and tiny floating-point ties do not refresh a record', () => {
  const rows = prices('2025-12-31', '2026-01-08', { '2026-01-05': -5, '2026-01-06': -5 - 1e-10, '2026-01-08': -3 });
  const result = buildReviewStockDailyRecords(input(['2026-01-05', '2026-01-06', '2026-01-08'], rows));
  assert.equal(result.events[0].date, '2026-01-05');
  assert.equal(result.events[0].points.length, 1);
  const flat = prices('2025-12-31', '2026-01-08').map(row => ({ ...row, close: 10 }));
  assert.equal(buildReviewStockDailyRecords(input(['2026-01-08'], flat)).events.length, 0);
});
