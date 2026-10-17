import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatTqqqSuggestedPrice } from '../src/lib/tqqqTradePrice.js';
import { isTqqqFormalTradeEntry, deriveTqqqTradePreview } from '../src/lib/tqqqTradeDiscipline.js';

const trades = readFileSync(new URL('../src/tabs/TradesTab.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

function openDraft(name, endMarker, input, side) {
  const source = trades.slice(trades.indexOf(`const ${name} =`), trades.indexOf(endMarker, trades.indexOf(`const ${name} =`)));
  let draft;
  const noop = () => {};
  const open = new Function('setNewTrade', 'setTradeEntryScope', 'stockDisplayName', 'localDateKey',
    'setLookupStatus', 'setShowAddTrade', 'isTqqqFormalTradeEntry', 'formatTqqqSuggestedPrice', `${source}; return ${name};`)(
    value => { draft = value; }, noop, symbol => symbol, () => '2026-10-16', noop, noop,
    isTqqqFormalTradeEntry, formatTqqqSuggestedPrice,
  );
  open(input, side);
  return draft;
}

function lookupDraft(kind, draft = {}, symbol = 'TQQQ', scope = 'ledger') {
  const start = app.indexOf('// 添加交易表单:');
  const split = app.indexOf('// 2) 不在关注列表', start);
  const source = kind === 'cache' ? app.slice(start, split) : app.slice(split, app.indexOf('const fmt =', split));
  const updater = source.match(/setNewTrade\((t => \(\{[\s\S]*?\}\))\);/)?.[1];
  assert.ok(updater, 'exercise the actual price updater for this entry');
  const apply = new Function('sym', 'tradeEntryScope', 'fromWatchlist', 'stockData', 'displayStockName',
    'isTqqqFormalTradeEntry', 'formatTqqqSuggestedPrice', `return ${updater};`)(
    symbol, scope, { price: 72.8877 }, { price: 72.8877 }, sym => sym,
    isTqqqFormalTradeEntry, formatTqqqSuggestedPrice,
  );
  return apply(draft);
}

test('both position actions prefill two-decimal TQQQ prices and the estimate uses that exact draft', () => {
  for (const side of ['buy', 'sell']) {
    const draft = openDraft('openTradeModal', 'const openPositionScenario =', { symbol: 'TQQQ', currentPrice: 72.8877 }, side);
    assert.equal(draft.price, '72.88');
    assert.equal(draft.side, side);
    const preview = deriveTqqqTradePreview({ draft: { ...draft, shares: '100' } });
    assert.equal(preview.amountUsd, 7288);
    assert.equal(preview.amountUsd, Number(draft.price) * 100);
  }
  const generic = openDraft('openTradeModal', 'const openPositionScenario =', { symbol: 'NVDA', currentPrice: 72.8877 });
  assert.equal(generic.price, '72.8877');
});

test('cache and API suggestions agree, while explicit input and other entry scopes retain their precision', () => {
  for (const kind of ['cache', 'api']) {
    assert.equal(lookupDraft(kind).price, '72.88');
    assert.equal(lookupDraft(kind, { price: '95.125' }).price, '95.125');
    assert.equal(lookupDraft(kind, { price: '1e2' }).price, '1e2');
    assert.equal(lookupDraft(kind, { id: 'old', price: '72.8877' }).price, '72.8877');
    assert.equal(lookupDraft(kind, {}, 'NVDA').price, '72.89');
    assert.equal(lookupDraft(kind, {}, 'TQQQ', 'wave').price, '72.89');
  }
});

test('opening a historical TQQQ trade for editing preserves its original execution price', () => {
  const trade = { id: 'old', symbol: 'TQQQ', price: 72.8877, shares: 100, date: '2026-10-01', side: 'buy' };
  const draft = openDraft('openTradeEditModal', 'const openWaveTradeModal =', trade);
  assert.equal(draft.price, '72.8877');
  assert.equal(draft.id, trade.id);
  assert.equal(trade.price, 72.8877);
});
