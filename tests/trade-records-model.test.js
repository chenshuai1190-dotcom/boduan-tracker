import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTradeRecordsView, getTradeRecordDateRange, isValidTradeRecordDate } from '../src/lib/tradeRecordsModel.js';
import { withStockTradeRecordKind } from '../src/lib/stockTradeRecordKind.js';

const NOW = new Date('2026-11-11T02:00:00Z');
const trade = (id, fields = {}) => ({ id, symbol: 'MSFT', name: 'Microsoft', side: 'buy', date: '2026-11-10',
  price: 100, shares: 2, fee: 0, currency: 'USD', note: '', recordKind: 'trade', updatedAt: null, ...fields });

test('preset dates use New York calendar boundaries, including midnight, DST, leap February and January', () => {
  assert.deepEqual(getTradeRecordDateRange('today', { now: NOW }), { fromDate: '2026-11-10', toDate: '2026-11-10' });
  assert.deepEqual(getTradeRecordDateRange('month', { now: '2026-11-01T03:30:00Z' }), { fromDate: '2026-10-01', toDate: '2026-10-31' });
  assert.deepEqual(getTradeRecordDateRange('month', { now: NOW }), { fromDate: '2026-11-01', toDate: '2026-11-30' });
  assert.deepEqual(getTradeRecordDateRange('year', { now: NOW }), { fromDate: '2026-01-01', toDate: '2026-12-31' });
  assert.deepEqual(getTradeRecordDateRange('month', { now: '2024-02-05T12:00:00Z' }), { fromDate: '2024-02-01', toDate: '2024-02-29' });
  assert.deepEqual(getTradeRecordDateRange('lastMonth', { now: '2026-01-02T12:00:00Z' }), { fromDate: '2025-12-01', toDate: '2025-12-31' });
  assert.deepEqual(getTradeRecordDateRange('lastMonth', { now: '2024-03-02T12:00:00Z' }), { fromDate: '2024-02-01', toDate: '2024-02-29' });
  assert.deepEqual(getTradeRecordDateRange('year', { now: '2027-01-01T01:30:00Z' }), { fromDate: '2026-01-01', toDate: '2026-12-31' });
  assert.deepEqual(getTradeRecordDateRange('week', { now: '2026-11-08T12:00:00Z' }), { fromDate: '2026-11-02', toDate: '2026-11-08' });
  assert.deepEqual(getTradeRecordDateRange('all', { now: NOW }), { fromDate: null, toDate: null });
});

test('calendar month and year filters retain later-dated saved records so users can inspect or correct them', () => {
  const trades = [trade('today'), trade('later-month', { date: '2026-11-30' }),
    trade('later-year', { date: '2026-12-31' }), trade('next-year', { date: '2027-01-01' })];
  assert.deepEqual(buildTradeRecordsView({ trades, filters: { period: 'month' }, now: NOW }).rows.map(row => row.id),
    ['later-month', 'today']);
  assert.deepEqual(buildTradeRecordsView({ trades, filters: { period: 'year' }, now: NOW }).rows.map(row => row.id),
    ['later-year', 'later-month', 'today']);
  assert.deepEqual(buildTradeRecordsView({ trades, filters: { period: 'today' }, now: NOW }).rows.map(row => row.id), ['today']);
});

test('real calendar dates are required; weekends remain valid manual ledger dates', () => {
  assert.equal(isValidTradeRecordDate('2024-02-29'), true);
  assert.equal(isValidTradeRecordDate('2026-11-07'), true);
  for (const invalid of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-01', '0000-01-01',
    '2026-11-10T00:00:00Z', '2026-1-01', null]) assert.equal(isValidTradeRecordDate(invalid), false);
  const rows = buildTradeRecordsView({ trades: [trade('weekend', { date: '2026-11-07' }),
    trade('invalid', { date: '2026-02-30' })], now: NOW }).rows;
  assert.deepEqual(rows.map(row => row.id), ['weekend']);
});

test('combined symbol, side and inclusive custom date filters affect rows, groups and summary together', () => {
  const trades = [trade('oct', { date: '2026-10-30' }), trade('start', { date: '2026-11-02', fee: 1 }),
    trade('other', { symbol: 'NVDA', name: 'Nvidia', price: 200 }), trade('sell', { side: 'sell', price: 130 }),
    trade('end', { symbol: 'AAPL', name: 'Apple', price: 50, shares: 3, fee: 2, date: '2026-11-10' }),
    trade('after', { date: '2026-11-11' })];
  const view = buildTradeRecordsView({ trades, now: NOW, filters: { symbols: ['msft.us', 'AAPL'], side: 'buy',
    period: 'custom', fromDate: '2026-11-02', toDate: '2026-11-10' } });
  assert.deepEqual(view.rows.map(row => row.id), ['end', 'start']);
  assert.deepEqual(view.groups.map(group => [group.date, group.rows.map(row => row.id)]), [
    ['2026-11-10', ['end']], ['2026-11-02', ['start']],
  ]);
  assert.deepEqual(view.summary, { tradeCount: 2, holdingCount: 0, buyAmountUsd: 350, sellAmountUsd: 0,
    feeUsd: 3, amountsComplete: true, feesComplete: true });
  assert.deepEqual(view.stockOptions.map(row => row.symbol), ['AAPL', 'MSFT', 'NVDA'], 'stock selection options stay available outside the current filter');
});

test('same-day records keep input order under both sorts; updatedAt cannot invent execution chronology', () => {
  const trades = [trade('b', { updatedAt: '2026-11-10T12:00:00Z' }),
    trade('a', { updatedAt: '2026-11-11T12:00:00Z', side: 'sell' }), trade('prior', { date: '2026-11-09' }),
    trade('next', { date: '2026-11-11' })];
  assert.deepEqual(buildTradeRecordsView({ trades, filters: { sort: 'newest' } }).rows.map(row => row.id), ['next', 'b', 'a', 'prior']);
  assert.deepEqual(buildTradeRecordsView({ trades, filters: { sort: 'oldest' } }).rows.map(row => row.id), ['prior', 'b', 'a', 'next']);
});

test('execution amounts exclude fees and never claim that sale proceeds or net cash flow are profit', () => {
  const view = buildTradeRecordsView({ trades: [trade('buy', { price: '12.5', shares: '1.5', fee: '0.5' }),
    trade('sell', { side: 'sell', price: 20, shares: 1.25, fee: 0.25 })] });
  assert.equal(view.rows[0].amountUsd, 18.75);
  assert.equal(view.rows[1].amountUsd, 25);
  assert.equal(view.summary.buyAmountUsd, 18.75);
  assert.equal(view.summary.sellAmountUsd, 25);
  assert.equal(view.summary.feeUsd, 0.75);
  assert.equal(Object.hasOwn(view.summary, 'profit'), false);
});

test('missing or non-USD amounts make only the affected aggregate unknown while preserving the real record', () => {
  for (const incomplete of [{ price: null }, { shares: '' }, { price: 0 }, { price: Infinity },
    { shares: true }, { price: '0x20' }, { price: 1e308, shares: 100 }, { currency: 'HKD' }, { currency: undefined }]) {
    const view = buildTradeRecordsView({ trades: [trade('unknown', incomplete), trade('sell', { side: 'sell', price: 40 })] });
    assert.equal(view.rows.length, 2);
    assert.equal(view.summary.tradeCount, 2);
    assert.equal(view.summary.buyAmountUsd, null);
    assert.equal(view.summary.sellAmountUsd, 80);
    assert.equal(view.summary.amountsComplete, false);
  }
  const nonUsd = buildTradeRecordsView({ trades: [trade('hk', { currency: 'HKD', price: 30, fee: 1 })] });
  assert.equal(nonUsd.rows[0].amount, 60, 'the original-currency amount can still be displayed honestly');
  assert.equal(nonUsd.rows[0].amountUsd, null);
  assert.equal(nonUsd.summary.feeUsd, null);
  assert.equal(nonUsd.summary.feesComplete, false);
});

test('a missing fee remains unknown; confirmed zero is different and does not hide known execution amounts', () => {
  for (const fee of [null, undefined, '', ' ', false, -1, NaN, Infinity]) {
    const view = buildTradeRecordsView({ trades: [trade('fee-missing', { fee })] });
    assert.equal(view.summary.feeUsd, null);
    assert.equal(view.summary.feesComplete, false);
    assert.equal(view.summary.buyAmountUsd, 200);
    assert.equal(view.summary.amountsComplete, true);
  }
  const zero = buildTradeRecordsView({ trades: [trade('zero', { fee: '0' })] });
  assert.equal(zero.summary.feeUsd, 0);
  assert.equal(zero.summary.feesComplete, true);
});

test('existing explicit and legacy note-only holdings stay visible but never inflate actual trade metrics', () => {
  const trades = [trade('actual'), trade('holding', { recordKind: 'historical_holding', price: 500, shares: 100, fee: 50 }),
    trade('legacy', { note: withStockTradeRecordKind('旧均价汇总', 'historical_holding'), currency: 'HKD', fee: null }),
    trade('sell', { side: 'sell', recordKind: 'historical_holding', price: 120 })];
  const view = buildTradeRecordsView({ trades });
  assert.equal(view.rows.length, 4);
  assert.deepEqual(view.rows.map(row => row.isHistoricalHolding), [false, true, true, false]);
  assert.deepEqual(view.summary, { tradeCount: 2, holdingCount: 2, buyAmountUsd: 200, sellAmountUsd: 240,
    feeUsd: 0, amountsComplete: true, feesComplete: true });
  assert.equal(view.stockOptions[0].count, 4);
});

test('symbols and directions are strict; normalization supports .US, case, and real class-share punctuation', () => {
  const trades = [trade('msft', { symbol: ' msft.us ', name: '' }), trade('brk', { symbol: 'brk.b' }),
    trade('spaced', { symbol: 'M SF T' }), trade('bad-side', { side: 'BUY' }), trade('bad-symbol', { symbol: '$MSFT' }),
    trade('named', { symbol: 'MSFT', name: 'Microsoft Corporation' })];
  const result = buildTradeRecordsView({ trades });
  assert.deepEqual(result.rows.map(row => row.symbol), ['MSFT', 'BRK.B', 'MSFT']);
  assert.deepEqual(result.stockOptions, [{ symbol: 'BRK.B', name: 'Microsoft', count: 1 },
    { symbol: 'MSFT', name: 'Microsoft Corporation', count: 2 }]);
});

test('invalid filters fail closed instead of expanding to the entire ledger', () => {
  for (const [filters, error] of [
    [{ period: 'custom' }, 'invalid_date_range'],
    [{ period: 'custom', fromDate: '2026-02-30', toDate: '2026-11-10' }, 'invalid_date_range'],
    [{ period: 'custom', fromDate: '2026-11-11', toDate: '2026-11-10' }, 'invalid_date_range'],
    [{ side: 'BUY' }, 'invalid_side'], [{ sort: 'profit' }, 'invalid_sort'], [{ period: 'nonsense' }, 'invalid_period'],
    [{ symbols: ['M SF T'] }, 'invalid_symbols'], [{ symbols: 'MSFT' }, 'invalid_symbols'],
  ]) {
    const result = buildTradeRecordsView({ trades: [trade('buy')], filters, now: NOW });
    assert.equal(result.filterError, error);
    assert.equal(result.rows.length, 0);
    assert.equal(result.stockOptions.length, 1);
  }
  assert.equal(buildTradeRecordsView({ trades: [trade('buy')], filters: { period: 'month' }, now: 'bad' }).filterError, 'invalid_clock');
});

test('empty data has known zero aggregates, and projection does not mutate records used by edit/delete', () => {
  const empty = buildTradeRecordsView();
  assert.deepEqual(empty.summary, { tradeCount: 0, holdingCount: 0, buyAmountUsd: 0, sellAmountUsd: 0,
    feeUsd: 0, amountsComplete: true, feesComplete: true });
  assert.deepEqual(empty.groups, []);
  const raw = Object.freeze(trade('original', { symbol: ' msft.us ', shares: '2', fee: '0' }));
  const rows = Object.freeze([raw]);
  const projected = buildTradeRecordsView({ trades: rows }).rows[0];
  assert.equal(projected.sourceTrade, raw);
  assert.equal(projected.symbol, 'MSFT');
  assert.equal(raw.symbol, ' msft.us ');
  assert.equal(raw.fee, '0');
});
