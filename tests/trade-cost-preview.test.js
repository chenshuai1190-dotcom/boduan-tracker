import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveTradeCostPreview } from '../src/lib/tradeCostPreview.js';

const row = (id, side, date, price, shares, symbol = 'NVDA') => ({ id, symbol, side, date, price, shares });
const buy = row('buy', 'buy', '2026-09-01', 100, 100);
const draft = overrides => ({ symbol: 'NVDA', side: 'buy', date: '2026-10-07', price: '120', shares: '10', ...overrides });
const preview = (stockTrades = [buy], changes = {}, options = {}) => deriveTradeCostPreview({
  stockTrades, draft: draft(changes), holdingsReady: true, ...options,
});
const holding = (cost, shares) => ({ status: 'holding', cost, shares });
const unknown = { status: 'unavailable', cost: null, shares: null };

test('previews buys with the formal active-cycle diluted cost without requiring a market quote', () => {
  const trades = [buy, row('sale', 'sell', '2026-09-02', 150, 20)];
  const result = preview(trades, { price: '90', shares: '20' });
  assert.deepEqual(result.current, holding(87.5, 80));
  assert.deepEqual(result.after, holding(88, 100));
  assert.equal(result.reason, null);
  assert.equal(result.applies, true);
});

test('partial profitable and losing sales change diluted cost while fees retain the formal ledger policy', () => {
  assert.deepEqual(preview([buy], { side: 'sell', price: '150', shares: '20', fee: 25 }).after, holding(87.5, 80));
  assert.deepEqual(preview([buy], { side: 'sell', price: '50', shares: '20' }).after, holding(112.5, 80));
});

test('zero and negative diluted costs remain valid values', () => {
  const zero = preview([buy], { side: 'sell', price: '200', shares: '50' });
  assert.deepEqual(zero.after, holding(0, 50));
  const negative = preview([buy], { side: 'sell', price: '300', shares: '50' });
  assert.deepEqual(negative.after, holding(-100, 50));
  const zeroCurrent = preview([buy, row('sale', 'sell', '2026-09-02', 200, 50)]);
  assert.equal(zeroCurrent.current.cost, 0);
});

test('distinguishes first purchase, full close, and a new cycle without recycling old profits', () => {
  assert.deepEqual(preview([]).current, { status: 'empty', cost: null, shares: 0 });
  assert.deepEqual(preview([]).after, holding(120, 10));
  assert.deepEqual(preview([buy], { side: 'sell', shares: '100' }).after, { status: 'closed', cost: null, shares: 0 });
  const closed = [buy, row('close', 'sell', '2026-09-02', 150, 100)];
  assert.deepEqual(preview(closed).current, { status: 'closed', cost: null, shares: 0 });
  assert.deepEqual(preview(closed, { price: '200' }).after, holding(200, 10));
});

test('unready or failed holdings never become a fabricated empty position', () => {
  for (const options of [{ holdingsReady: false }, { holdingsError: 'failed' }, { stockTrades: null }]) {
    const result = preview([], {}, options);
    assert.deepEqual(result.current, unknown);
    assert.deepEqual(result.after, unknown);
    assert.equal(result.reason, 'holdings-unavailable');
  }
  assert.equal(deriveTradeCostPreview({ stockTrades: [], draft: draft() }).reason, 'holdings-unavailable');
  assert.equal(preview([buy], {}, { scope: 'wave' }).applies, false);
});

test('ordinary preview refuses incomplete, invalid or save-ambiguous quantities and prices', () => {
  for (const changes of [
    { shares: '' }, { price: '' }, { shares: '1.9' }, { shares: '1e2' },
    { shares: NaN }, { shares: Infinity }, { shares: -1 }, { price: 0 }, { price: '120abc' },
    { shares: true }, { price: '0x10' }, { side: 'invalid' }, { currency: 'CNY' },
    { price: Number.MAX_VALUE, shares: 10 },
  ]) {
    const result = preview([buy], changes);
    assert.equal(result.reason, 'invalid-input', JSON.stringify(changes));
    assert.deepEqual(result.current, holding(100, 100));
    assert.deepEqual(result.after, unknown);
  }
  assert.equal(preview([buy], { price: '1e2', shares: '10.0' }).reason, null);
});

test('TQQQ follows Number save semantics and retains its integer-share restriction', () => {
  const result = preview([], { symbol: 'TQQQ', price: '1e2', shares: '1e2' });
  assert.deepEqual(result.after, holding(100, 100));
  assert.equal(preview([], { symbol: 'TQQQ', shares: '1.9' }).reason, 'invalid-input');
});

test('dates and edit identities fail closed while existing current cost remains readable', () => {
  for (const date of ['', null, '2026-02-30', '2026-10-07T00:00:00Z', '2026-2-03']) {
    assert.equal(preview([buy], { date }).reason, 'invalid-date');
  }
  for (const editing of [{ id: 'missing' }, { editingId: 'missing' }]) {
    const result = preview([buy], editing);
    assert.equal(result.reason, 'missing-edit');
    assert.deepEqual(result.after, unknown);
  }
  assert.equal(preview([buy, { ...buy }], { id: buy.id }).reason, 'missing-edit');
  assert.equal(preview([buy], { symbol: 'N VDA' }).reason, 'invalid-input');
});

test('historical sells use the full dated ledger and do not claim closed when later buys reopen', () => {
  const trades = [buy, row('later-buy', 'buy', '2026-09-03', 200, 50)];
  const result = preview(trades, { side: 'sell', date: '2026-09-02', price: '150', shares: '100' });
  assert.deepEqual(result.after, holding(200, 50));
  const impossible = preview([row('future-buy', 'buy', '2026-10-08', 100, 10)], { side: 'sell', shares: '1' });
  assert.equal(impossible.reason, 'ledger-oversell');
  assert.deepEqual(impossible.after, unknown);
});

test('edits replace in place and use the original current ledger for the before value', () => {
  const trades = [buy, row('sale', 'sell', '2026-09-02', 150, 20)];
  const result = preview(trades, { editingId: 'sale', side: 'sell', date: '2026-09-02', price: '120', shares: '20' });
  assert.deepEqual(result.current, holding(87.5, 80));
  assert.deepEqual(result.after, holding(95, 80));
  const moved = preview(trades, { id: 'sale', side: 'sell', date: '2026-08-31', price: '120', shares: '20' });
  assert.equal(moved.reason, 'ledger-oversell');
});

test('same-day UUID trades preserve the production insertion order during append and edit', () => {
  const day = '2026-10-07';
  const trades = [
    row('ffffffff-ffff-4fff-8fff-ffffffffffff', 'buy', day, 100, 10),
    row('00000000-0000-4000-8000-000000000001', 'sell', day, 150, 5),
  ];
  assert.deepEqual(preview(trades, { price: '80', shares: '5' }).after, holding(65, 10));
  const result = preview(trades, { id: trades[0].id, date: day, price: '120', shares: '10' });
  assert.deepEqual(result.current, holding(50, 5));
  assert.deepEqual(result.after, holding(90, 5));
});

test('over-selling and edits that remove shares needed by later sales never expose clamped costs', () => {
  const over = preview([buy], { side: 'sell', shares: '101' });
  assert.equal(over.reason, 'ledger-oversell');
  assert.deepEqual(over.after, unknown);
  const trades = [buy, row('later-sale', 'sell', '2026-09-03', 150, 80)];
  assert.equal(preview(trades, { id: buy.id, date: buy.date, shares: '79' }).reason, 'ledger-oversell');
});

test('editing a symbol validates the old symbol ledger as well as the new one', () => {
  const trades = [buy, row('sale', 'sell', '2026-09-02', 150, 20)];
  const invalid = preview(trades, { id: buy.id, symbol: 'MSFT', date: buy.date, shares: '100' });
  assert.equal(invalid.reason, 'ledger-oversell');
  assert.deepEqual(invalid.current, { status: 'empty', cost: null, shares: 0 });
  assert.deepEqual(invalid.after, unknown);
  const valid = preview([buy], { id: buy.id, symbol: 'MSFT', date: buy.date, shares: '100' });
  assert.deepEqual(valid.after, holding(120, 100));
});

test('invalid relevant ledger data stays unknown instead of silently skipping rows', () => {
  for (const changes of [{ date: 'bad' }, { price: 0 }, { shares: NaN }, { side: 'invalid' }, { currency: 'CNY' }]) {
    const result = preview([{ ...buy, ...changes }]);
    assert.equal(result.reason, 'invalid-ledger');
    assert.deepEqual(result.current, unknown);
    assert.deepEqual(result.after, unknown);
  }
  const result = preview([buy, row('extra-sale', 'sell', '2026-09-02', 100, 101)]);
  assert.equal(result.reason, 'ledger-oversell');
  assert.deepEqual(result.current, unknown);
  assert.deepEqual(preview([buy, { ...buy, symbol: 'MSFT', price: 0 }]).current, holding(100, 100));
});

test('preview never mutates the original ledger or draft', () => {
  const trades = Object.freeze([Object.freeze({ ...buy }), Object.freeze(row('sale', 'sell', '2026-09-02', 150, 20))]);
  const input = Object.freeze(draft({ id: 'sale', side: 'sell', date: '2026-09-02', shares: '10' }));
  const before = JSON.stringify({ trades, input });
  deriveTradeCostPreview({ stockTrades: trades, draft: input, holdingsReady: true });
  assert.equal(JSON.stringify({ trades, input }), before);
});
