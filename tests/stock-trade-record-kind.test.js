import test from 'node:test';
import assert from 'node:assert/strict';
import { getStockTradeRecordKind, withStockTradeRecordKind, stripStockTradeRecordKind, normalizeStockTradeDraftKind } from '../src/lib/stockTradeRecordKind.js';

const marker = '[[quote:stock-trade:record-kind=historical_holding:v1]]';

test('historical holding classification requires our exact explicit metadata', () => {
  for (const note of [null, undefined, '', '历史持仓', '2026-07-04 周末录入', '多笔平均价', `text ${marker}`, `${marker} text`, '[[quote:stock-trade:record-kind=historical_holding:v2]]']) {
    assert.equal(getStockTradeRecordKind(note), 'trade');
  }
  assert.equal(getStockTradeRecordKind(marker), 'historical_holding');
  assert.equal(getStockTradeRecordKind(`用户备注\r\n${marker}`), 'historical_holding');
});

test('classification round trip preserves user notes, whitespace and unknown metadata byte for byte', () => {
  for (const note of ['', '用户备注', ' 前后空格 ', '多行\n备注\n', '多行\r\n备注\r\n', '[[quote:source=import:v1]]\n保留这个信息', '[[quote:stock-trade:record-kind=other:v2]]']) {
    const historical = withStockTradeRecordKind(note, 'historical_holding');
    assert.equal(getStockTradeRecordKind(historical), 'historical_holding');
    assert.equal(stripStockTradeRecordKind(historical), note);
    assert.equal(withStockTradeRecordKind(historical, 'trade'), note);
    assert.equal(withStockTradeRecordKind(historical, 'historical_holding'), historical);
  }
});

test('repeated toggles and duplicate known markers never accumulate or remove foreign metadata', () => {
  const note = '备注\n[[quote:other=value:v1]]';
  assert.equal(withStockTradeRecordKind(`${note}\n${marker}\n${marker}`, 'historical_holding'), `${note}\n${marker}`);
  let updated = note;
  for (let i = 0; i < 10; i += 1) {
    updated = withStockTradeRecordKind(withStockTradeRecordKind(updated, 'historical_holding'), 'trade');
  }
  assert.equal(updated, note);
});

test('switching to sell clears only the display marker and preserves every financial input', () => {
  const note = '成本汇总\n[[quote:import=batch-1:v1]]';
  const draft = Object.freeze({ id: 'manual-1', symbol: 'MSFT', date: '2026-07-04', price: '125.75', shares: '300', fee: 7.5, currency: 'USD', side: 'sell', note: withStockTradeRecordKind(note, 'historical_holding') });
  assert.deepEqual(normalizeStockTradeDraftKind(draft), { ...draft, note });
  assert.equal(getStockTradeRecordKind(draft.note), 'historical_holding', 'the original draft is not mutated');
  const actualTrade = { ...draft, note };
  assert.equal(normalizeStockTradeDraftKind(actualTrade), actualTrade);
  const buy = { ...draft, side: 'buy' };
  assert.equal(normalizeStockTradeDraftKind(buy), buy);
});
