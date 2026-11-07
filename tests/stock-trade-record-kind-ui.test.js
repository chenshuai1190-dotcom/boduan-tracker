import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { getStockTradeRecordKind, stripStockTradeRecordKind, withStockTradeRecordKind } from '../src/lib/stockTradeRecordKind.js';

const source = readFileSync(new URL('../src/tabs/TradesTab.jsx', import.meta.url), 'utf8');
const pickerSource = source.slice(source.indexOf('export function StockTradeRecordKindPicker'), source.indexOf('export default function TradesTab'));
const helper = new URL('../src/lib/stockTradeRecordKind.js', import.meta.url).href;
const transformed = await transformWithOxc(`import React from ${JSON.stringify(import.meta.resolve('react'))};\nimport { getStockTradeRecordKind, withStockTradeRecordKind } from ${JSON.stringify(helper)};\n${pickerSource}`, 'RecordKindPicker.jsx', { jsx: { runtime: 'classic' } });
const { StockTradeRecordKindPicker: Picker } = await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`);
const walk = value => !React.isValidElement(value) ? [] : [value, ...React.Children.toArray(value.props.children).flatMap(walk)];

test('a new buy defaults to actual trade; choosing historical holding changes only note metadata', () => {
  const draft = Object.freeze({ side: 'buy', symbol: 'MSFT', price: '125.75', shares: '300', date: '2026-07-04', note: '多笔汇总\n[[external:keep]]' });
  let changed;
  const tree = Picker({ draft, onDraftChange: next => { changed = next; } });
  const buttons = walk(tree).filter(node => node.type === 'button');
  assert.deepEqual(buttons.map(node => node.props['aria-pressed']), [true, false]);
  buttons[1].props.onClick();
  assert.equal(getStockTradeRecordKind(changed.note), 'historical_holding');
  assert.equal(stripStockTradeRecordKind(changed.note), draft.note);
  assert.deepEqual({ ...changed, note: draft.note }, draft);
});

test('an edited historical buy refills selection and can return to actual trade without losing its note', () => {
  const draft = { side: 'buy', id: 'existing', note: withStockTradeRecordKind('原始备注', 'historical_holding') };
  let changed;
  const tree = Picker({ draft, onDraftChange: next => { changed = next; } });
  const buttons = walk(tree).filter(node => node.type === 'button');
  assert.deepEqual(buttons.map(node => node.props['aria-pressed']), [false, true]);
  assert.match(renderToStaticMarkup(tree), /日期仅为录入日/);
  buttons[0].props.onClick();
  assert.deepEqual(changed, { ...draft, note: '原始备注' });
});

test('historical holding is unavailable for sells; the picker has complete English labels', () => {
  assert.equal(Picker({ draft: { side: 'sell' }, onDraftChange() {} }), null);
  const html = renderToStaticMarkup(Picker({ draft: { side: 'buy', note: withStockTradeRecordKind('', 'historical_holding') }, englishMode: true, onDraftChange() {} }));
  assert.match(html, /Actual trade/);
  assert.match(html, /Historical holding/);
  assert.match(html, /entry date is not the purchase date/);
  assert.doesNotMatch(html, /实际|历史|录入/);
});
