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

const msftBuy = row('msft-buy', 'buy', '2026-09-01', 180, 50, 'MSFT');
const marketQuotes = [{ symbol: 'NVDA', price: 100 }, { symbol: 'MSFT', price: 200 }];

test('allocation previews partial buys and sells against all stock market value, independently of execution price', () => {
  const trades = [buy, msftBuy];
  const purchase = preview(trades, { price: '400', shares: '50' }, { quoteRows: marketQuotes });
  assert.deepEqual(purchase.allocation, { current: 0.5, after: 0.6 });
  const sale = preview(trades, { side: 'sell', price: '50', shares: '25' }, { quoteRows: marketQuotes });
  assert.deepEqual(sale.allocation, { current: 0.5, after: 7500 / 17500 });
  assert.deepEqual(preview(trades, { price: '1', shares: '50' }, { quoteRows: marketQuotes }).allocation, purchase.allocation,
    'changing the execution price changes cost but not the market valuation used for stock weight');
});

test('allocation uses production locked-close valuation or current price and accepts its completed-close fallback', () => {
  const trades = [buy, msftBuy];
  const lockedQuotes = [{ symbol: 'NVDA', price: 999, dailyPnlLocked: true, dailyPnlPrice: 80 }, marketQuotes[1]];
  assert.deepEqual(preview(trades, {}, { quoteRows: lockedQuotes }).allocation,
    { current: 8000 / 18000, after: 8800 / 18800 });
  const unlocked = [{ ...lockedQuotes[0], price: 100, dailyPnlLocked: false }, marketQuotes[1]];
  assert.deepEqual(preview(trades, {}, { quoteRows: unlocked }).allocation,
    { current: 0.5, after: 11000 / 21000 });
  const fallback = [{ ...lockedQuotes[0], dailyPnlPrice: null, dailyPnlBaselineClose: 90, previousClose: 70 }, marketQuotes[1]];
  assert.equal(preview(trades, {}, { quoteRows: fallback }).allocation.current, 9000 / 19000);
  const missingLockedClose = [{ ...lockedQuotes[0], dailyPnlPrice: null }, marketQuotes[1]];
  assert.deepEqual(preview(trades, {}, { quoteRows: missingLockedClose }).allocation, { current: null, after: null },
    'a locked position must not silently fall back to a live or execution price');
});

test('known empty and closed positions can be zero while a new holding still requires its own quote', () => {
  assert.deepEqual(preview([], {}, { quoteRows: [] }).allocation, { current: 0, after: null },
    'a valid draft price is not a market quote for a first purchase');
  assert.deepEqual(preview([], {}, { quoteRows: marketQuotes }).allocation, { current: 0, after: 1 });
  const closed = preview([buy], { side: 'sell', shares: '100' }, { quoteRows: [] });
  assert.deepEqual(closed.allocation, { current: null, after: 0 });
  assert.equal(closed.after.status, 'closed');
  const partialPortfolio = preview([buy, msftBuy], { side: 'sell', shares: '100' }, { quoteRows: [marketQuotes[1]] });
  assert.deepEqual(partialPortfolio.allocation, { current: null, after: 0 },
    'after a full close the sold stock quote is no longer needed, while every remaining holding is still valued');
  const oldClosed = [buy, row('close', 'sell', '2026-09-02', 150, 100), msftBuy];
  assert.deepEqual(preview(oldClosed, {}, { quoteRows: marketQuotes }).allocation, { current: 0, after: 1000 / 11000 });
});

test('historical transactions revalue the ending ledger including later reopens instead of subtracting current shares', () => {
  const trades = [buy, row('later-buy', 'buy', '2026-09-03', 200, 20), msftBuy];
  const result = preview(trades, { side: 'sell', date: '2026-09-02', shares: '100', price: '150' }, { quoteRows: marketQuotes });
  assert.deepEqual(result.allocation, { current: 12000 / 22000, after: 2000 / 12000 });
  assert.deepEqual(result.after, holding(200, 20));
  const impossible = preview([buy, msftBuy], { side: 'sell', date: '2026-08-31', shares: '10' }, { quoteRows: marketQuotes });
  assert.deepEqual(impossible.allocation, { current: 0.5, after: null });
  assert.equal(impossible.reason, 'ledger-oversell');
});

test('allocation edits replace the original trade and validate both symbols when moving a transaction', () => {
  const trades = [buy, msftBuy, row('sale', 'sell', '2026-09-02', 150, 20)];
  const changedSale = preview(trades, { editingId: 'sale', side: 'sell', date: '2026-09-02', shares: '40' }, { quoteRows: marketQuotes });
  assert.deepEqual(changedSale.allocation, { current: 8000 / 18000, after: 6000 / 16000 });
  const movedSale = preview(trades, { id: 'sale', symbol: 'MSFT', side: 'sell', date: '2026-09-02', shares: '20' }, { quoteRows: marketQuotes });
  assert.deepEqual(movedSale.allocation, { current: 10000 / 18000, after: 6000 / 16000 });
  const movedBuy = preview([buy, msftBuy], { id: buy.id, symbol: 'MSFT', date: buy.date, shares: '100' }, { quoteRows: marketQuotes });
  assert.deepEqual(movedBuy.allocation, { current: 0.5, after: 1 });
  const breaksOriginal = preview(trades, { id: buy.id, symbol: 'MSFT', date: buy.date, shares: '100' }, { quoteRows: marketQuotes });
  assert.deepEqual(breaksOriginal.allocation, { current: 10000 / 18000, after: null });
  assert.equal(breaksOriginal.reason, 'ledger-oversell');
});

test('missing or invalid denominator quotes never fabricate a larger weight and do not hide valid costs', () => {
  for (const quoteRows of [undefined, null, [], [marketQuotes[0]], [marketQuotes[0], null],
    [marketQuotes[0], { symbol: 'MSFT', price: null }], [marketQuotes[0], { symbol: 'MSFT', price: Infinity }],
    [marketQuotes[0], { symbol: 'MSFT', price: true }], [marketQuotes[0], { symbol: 'MSFT', price: [200] }]]) {
    const result = preview([buy, msftBuy], {}, { quoteRows });
    assert.deepEqual(result.allocation, { current: null, after: null });
    assert.deepEqual(result.current, holding(100, 100));
    assert.equal(result.after.status, 'holding');
    assert.equal(result.reason, null, 'allocation availability must not replace the existing cost-validation reason');
  }
  const newUnquotedStock = preview([msftBuy], {}, { quoteRows: [marketQuotes[1]] });
  assert.deepEqual(newUnquotedStock.allocation, { current: 0, after: null });
  const closedOtherStock = [buy, msftBuy, row('msft-close', 'sell', '2026-09-02', 250, 50, 'MSFT')];
  assert.deepEqual(preview(closedOtherStock, {}, { quoteRows: [marketQuotes[0]] }).allocation, { current: 1, after: 1 },
    'already closed stocks need no current quote');
});

test('a bad unrelated ledger or non-finite portfolio value makes allocation unknown without changing target costs', () => {
  for (const otherRows of [
    [{ ...msftBuy, price: 0 }], [{ ...msftBuy, symbol: '' }], [{ ...msftBuy, currency: 'CNY' }],
    [msftBuy, row('msft-over', 'sell', '2026-09-02', 200, 51, 'MSFT')],
  ]) {
    const result = preview([buy, ...otherRows], {}, { quoteRows: marketQuotes });
    assert.deepEqual(result.allocation, { current: null, after: null });
    assert.deepEqual(result.current, holding(100, 100));
    assert.equal(result.after.status, 'holding');
  }
  const infiniteValue = preview([buy, msftBuy], {}, { quoteRows: [{ symbol: 'NVDA', price: Number.MAX_VALUE }, marketQuotes[1]] });
  assert.deepEqual(infiniteValue.allocation, { current: null, after: null });
  assert.equal(infiniteValue.after.status, 'holding');
  const over = preview([buy, msftBuy], { side: 'sell', shares: '101' }, { quoteRows: marketQuotes });
  assert.deepEqual(over.allocation, { current: 0.5, after: null });
});

test('invalid drafts preserve known current allocation, while unready holdings and wave scope keep both unknown', () => {
  for (const changes of [{ price: '' }, { shares: '1.5' }, { date: '2026-02-30' }, { id: 'missing' }, { side: 'invalid' }]) {
    assert.deepEqual(preview([buy, msftBuy], changes, { quoteRows: marketQuotes }).allocation, { current: 0.5, after: null });
  }
  for (const options of [{ holdingsReady: false }, { holdingsError: 'failed' }, { scope: 'wave' }]) {
    assert.deepEqual(preview([buy, msftBuy], {}, { quoteRows: marketQuotes, ...options }).allocation, { current: null, after: null });
  }
});

test('TQQQ market weight is not multiplied by leverage or limited by its separate ten-percent discipline', () => {
  const trades = [row('tqqq-buy', 'buy', '2026-09-01', 50, 100, 'TQQQ'), msftBuy];
  const quoteRows = [{ symbol: 'TQQQ', price: 80, leverage: 3 }, marketQuotes[1]];
  const result = preview(trades, { symbol: 'tqqq.us', price: '60', shares: '50' }, { quoteRows });
  assert.deepEqual(result.allocation, { current: 8000 / 18000, after: 12000 / 22000 });
  assert.equal(result.reason, null);
});

test('allocation computation leaves frozen quotes, original trades and draft untouched', () => {
  const stockTrades = Object.freeze([Object.freeze({ ...buy }), Object.freeze({ ...msftBuy })]);
  const quoteRows = Object.freeze(marketQuotes.map(quote => Object.freeze({ ...quote })));
  const input = Object.freeze(draft({ side: 'sell', shares: '20' }));
  const before = JSON.stringify({ stockTrades, quoteRows, input });
  const result = deriveTradeCostPreview({ stockTrades, quoteRows, draft: input, holdingsReady: true });
  assert.deepEqual(result.allocation, { current: 0.5, after: 8000 / 18000 });
  assert.equal(JSON.stringify({ stockTrades, quoteRows, input }), before);
});
