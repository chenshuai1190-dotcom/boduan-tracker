import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getStockTradeRecordKind, normalizeStockTradeDraftKind, withStockTradeRecordKind } from '../src/lib/stockTradeRecordKind.js';
import { isTqqqFormalTradeEntry } from '../src/lib/tqqqTradeDiscipline.js';
import { formatTqqqSuggestedPrice } from '../src/lib/tqqqTradePrice.js';

const source = readFileSync(new URL('../src/tabs/TradesTab.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/tabs/TradesTab.css', import.meta.url), 'utf8');

function opener(name, nextName) {
  const start = source.indexOf(`  const ${name} =`);
  const end = source.indexOf(`  const ${nextName} =`, start);
  assert.ok(start >= 0 && end > start, 'execute the production form initializer');
  return new Function('context', `
    const { setTradeEntryScope, setNewTrade, setLookupStatus, setShowAddTrade,
      stockDisplayName, localDateKey, isTqqqFormalTradeEntry, formatTqqqSuggestedPrice } = context;
    ${source.slice(start, end)}
    return ${name};
  `);
}

const createNew = opener('openTradeModal', 'openPositionScenario');
const createEdit = opener('openTradeEditModal', 'openWaveTradeModal');
function fixture(create) {
  const state = {};
  const open = create({
    setTradeEntryScope: value => { state.scope = value; },
    setNewTrade: value => { state.draft = value; },
    setLookupStatus: value => { state.lookup = value; },
    setShowAddTrade: value => { state.visible = value; },
    stockDisplayName: (symbol, name) => name || symbol,
    localDateKey: () => '2026-11-10',
    isTqqqFormalTradeEntry, formatTqqqSuggestedPrice,
  });
  return { state, open };
}

test('ordinary and TQQQ forms expose no actual-trade / historical-holding selector', () => {
  assert.doesNotMatch(source, /StockTradeRecordKindPicker|trade-record-kind|withStockTradeRecordKind/);
  assert.doesNotMatch(css, /trade-record-kind/);
  assert.match(source, /<TqqqTradeEntryPanel\s/);
  assert.match(source, /<GenericLedgerTradeEntryPanel\s/);
});

test('new ordinary and TQQQ entries always initialize as real trades without historical metadata', () => {
  for (const symbol of ['', 'MSFT', 'TQQQ']) {
    for (const side of ['buy', 'sell']) {
      const { state, open } = fixture(createNew);
      open(symbol ? { symbol, name: symbol, currentPrice: 125.75 } : null, side);
      assert.equal(state.scope, 'ledger');
      assert.equal(state.visible, true);
      assert.equal(state.draft.recordKind, 'trade');
      assert.equal(getStockTradeRecordKind(state.draft.note), 'trade');
      assert.equal(state.draft.side, side);
      assert.equal(state.draft.symbol, symbol);
      assert.equal(state.draft.shares, '');
      assert.equal(state.draft.id, undefined);
    }
  }
});

test('editing an existing historical holding preserves its persisted type, average cost, quantity and concurrency timestamp', () => {
  for (const symbol of ['MSFT', 'TQQQ']) {
    for (const note of ['原始用户备注', withStockTradeRecordKind('多笔均价汇总\n[[external:keep]]', 'historical_holding')]) {
      const trade = Object.freeze({ id: 'existing', updatedAt: '2026-11-09T12:01:00Z', recordKind: 'historical_holding',
        symbol, name: symbol, side: 'buy', date: '2026-07-04', price: 125.75, shares: 300, fee: 2.5, currency: 'USD', note });
      const { state, open } = fixture(createEdit);
      open(trade);
      assert.equal(state.draft.recordKind, trade.recordKind);
      assert.equal(state.draft.note, trade.note);
      assert.equal(state.draft.updatedAt, trade.updatedAt);
      assert.equal(state.draft.price, '125.75');
      assert.equal(state.draft.shares, '300');
      assert.equal(state.draft.date, trade.date);
      assert.equal(state.draft.fee, trade.fee);
      assert.equal(state.draft.id, trade.id);
      const edited = normalizeStockTradeDraftKind({ ...state.draft, price: '126.50', shares: '301' });
      assert.equal(edited.recordKind, 'historical_holding', 'ordinary value edits must not reclassify old records');
      assert.equal(edited.note, note, 'legacy metadata and user notes remain intact');
      assert.equal(edited.price, '126.50');
      assert.equal(edited.shares, '301');
    }
  }
});

test('legacy note-only holdings and ordinary trades retain their original representation on edit', () => {
  const notes = ['普通交易备注', withStockTradeRecordKind('旧版本均价记录', 'historical_holding')];
  for (const note of notes) {
    const { state, open } = fixture(createEdit);
    open({ id: 'legacy', symbol: 'MSFT', side: 'buy', price: 100, shares: 2, date: '2026-07-04', note });
    assert.equal(state.draft.recordKind, undefined);
    assert.equal(state.draft.note, note);
    assert.equal(getStockTradeRecordKind(state.draft.note), getStockTradeRecordKind(note));
  }
});
