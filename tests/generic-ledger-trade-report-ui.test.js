import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const sourceUrl = new URL('../src/components/GenericLedgerTradeEntryPanel.jsx', import.meta.url);
const source = readFileSync(sourceUrl, 'utf8');
const css = readFileSync(new URL('../src/components/GenericLedgerTradeEntryPanel.css', import.meta.url), 'utf8');
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const resolveImports = (code, parent) => code.replace(/(from\s+)(['"])([^'"]+)\2/g, (_, prefix, _quote, path) =>
  `${prefix}${JSON.stringify(path.startsWith('.') ? new URL(path, parent).href : import.meta.resolve(path))}`);
const logoUrl = new URL('../src/components/StockLogo.jsx', import.meta.url);
const logo = await transformWithOxc(readFileSync(logoUrl, 'utf8'), 'StockLogo.jsx', { jsx: { runtime: 'classic' } });
const compiledLogo = moduleUrl(resolveImports(logo.code, logoUrl));
const transformed = await transformWithOxc(source, 'GenericLedgerTradeEntryPanel.jsx', { jsx: { runtime: 'classic' } });
const compiled = resolveImports(transformed.code.replace(/import\s*(['"])\.\/GenericLedgerTradeEntryPanel\.css\1;?/g, ''), sourceUrl)
  .replace(JSON.stringify(logoUrl.href), JSON.stringify(compiledLogo));
const { default: Entry, GenericLedgerTradeHeader: Header } = await import(moduleUrl(compiled));
const tt = (_key, fallback) => fallback;
const draft = Object.freeze({ symbol: 'NVDA', name: '英伟达', price: '123.45', shares: '20', date: '2026-09-10', side: 'buy', currency: 'USD', editingId: 'local-fixture-only' });
function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
function input(tree, type) { return nodes(tree, node => node.type === 'input' && node.props.type === type)[0]; }

test('formal-trade fields retain exact draft values and independent callbacks in the neutral report form', () => {
  const changed = [];
  const tree = Entry({ draft, tt, onDraftChange: value => changed.push(value) });
  const inputs = nodes(tree, node => node.type === 'input');
  assert.deepEqual(inputs.map(node => [node.props.id, node.props.value]), [
    ['generic-ledger-trade-symbol', 'NVDA'],
    ['generic-ledger-trade-price', '123.45'],
    ['generic-ledger-trade-shares', '20'],
    ['generic-ledger-trade-date', '2026-09-10'],
  ]);
  inputs[0].props.onChange({ target: { value: 'aapl' } });
  inputs[1].props.onChange({ target: { value: '125.67' } });
  inputs[2].props.onChange({ target: { value: '20.5' } });
  inputs[3].props.onChange({ target: { value: '2026-09-09' } });
  assert.deepEqual(changed, [
    { ...draft, symbol: 'AAPL', name: '', price: '' },
    { ...draft, price: '125.67' },
    { ...draft, shares: '20.5' },
    { ...draft, date: '2026-09-09' },
  ]);
  assert.equal(inputs[0].props['aria-label'], '股票代码');
  assert.equal(inputs[1].props.step, '0.01');
  assert.equal(inputs[1].props.inputMode, 'decimal');
  assert.equal(inputs[2].props.inputMode, 'numeric');
  assert.equal(inputs[3].props.style.WebkitAppearance, 'none');
  const html = renderToStaticMarkup(tree);
  assert.match(html, /<label[^>]*for="generic-ledger-trade-symbol"[^>]*>股票代码<\/label>/);
  assert.match(html, /预计成交额/);
  assert.match(html, /\$2,469\.00/);
});

test('blank and ticker-prefilled entries show a clear identity while keeping ticker editing in the first field', () => {
  for (const entryDraft of [draft, { ...draft, symbol: '', name: '', price: '' }]) {
    const header = Header({ draft: entryDraft, tt, editing: Boolean(entryDraft.editingId) });
    assert.equal(input(header, 'text'), undefined);
    const html = renderToStaticMarkup(header);
    assert.match(html, entryDraft.symbol ? /NVDA.*修改正式交易/ : /新增交易.*美股/);
  }
  const blank = Entry({ draft: { ...draft, symbol: '', name: '', price: '' }, tt, onDraftChange: () => {} });
  assert.equal(input(blank, 'text').props.value, '');
  assert.equal(input(blank, 'text').props.placeholder, '输入股票代码,如 NVDA');
  assert.doesNotMatch(renderToStaticMarkup(Header({ draft: { symbol: '' }, tt })), /ledger-entry-logo/);
});

test('clearing price preserves focus, the reserved control column, and all other fields', () => {
  let changed;
  let focusPreserved = false;
  const tree = Entry({ draft, tt, onDraftChange: value => { changed = value; } });
  const clear = nodes(tree, node => node.type === 'button')[0];
  assert.equal(clear.props['aria-label'], '清除价格');
  clear.props.onPointerDown({ preventDefault: () => { focusPreserved = true; } });
  clear.props.onClick();
  assert.ok(focusPreserved);
  assert.deepEqual(changed, { ...draft, price: '' });
  const empty = Entry({ draft: { ...draft, price: '' }, tt, onDraftChange: () => {} });
  const emptyClear = nodes(empty, node => node.type === 'button')[0];
  assert.equal(emptyClear.props.disabled, true);
  assert.match(emptyClear.props.className, /invisible pointer-events-none/);
});

test('display-only amount remains two-decimal USD and missing or invalid fields are not shown as zero', () => {
  for (const fields of [{ price: '' }, { shares: '' }, { price: '0' }, { shares: '-1' }, { price: 'NaN' }, { shares: 'Infinity' }]) {
    const tree = Entry({ draft: { ...draft, ...fields }, tt, onDraftChange: () => { throw new Error('render must not save'); } });
    const amount = nodes(tree, node => node.type === 'strong')[0];
    assert.equal(amount.props.children, '—');
  }
  const large = Entry({ draft: { ...draft, price: '1234567.89', shares: '100' }, tt, onDraftChange: () => {} });
  assert.match(renderToStaticMarkup(large), /\$123,456,789\.00/);
  assert.doesNotMatch(source, /supabase|fetch\(|localStorage|stock_trades/);
});

test('report styling keeps editable text at least 16px, neutral fields, and complete financial numbers', () => {
  assert.match(css, /\.ledger-entry-field\s*\{[^}]*min-height:\s*49px;[^}]*background:\s*#1a1b1d;/);
  assert.match(css, /\.ledger-entry-input\s*\{[^}]*font-size:\s*18px;/);
  assert.match(css, /\.ledger-entry-symbol\s*\{[^}]*font-size:\s*20px;/);
  assert.match(css, /\.ledger-entry-date\s*\{[^}]*font-size:\s*16px;/);
  assert.match(css, /\.ledger-entry-estimate-value\s*\{[^}]*overflow-wrap:\s*anywhere;/);
  assert.doesNotMatch(css, /#f6b54b|#0b0f14|text-overflow:\s*ellipsis|font-weight:\s*[5-9]00/);
  assert.doesNotMatch(source, /text-rose|text-emerald|trades\.cancel|<form/);
});
