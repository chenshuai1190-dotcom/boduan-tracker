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
const {
  default: Entry,
  GenericLedgerTradeHeader: Header,
  GenericLedgerTradeAmount: Amount,
  GenericLedgerTradeMarketReference: MarketReference,
} = await import(moduleUrl(compiled));
const tt = (_key, fallback, values = {}) => fallback.replace(/\{\{(\w+)\}\}/g, (_match, key) => values[key] ?? '');
const draft = Object.freeze({ symbol: 'NVDA', name: '英伟达', price: '123.45', shares: '20', date: '2026-09-10', side: 'buy', currency: 'USD', editingId: 'local-fixture-only' });
function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  if (node.type === Header) return nodes(Header(node.props), predicate);
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
function input(tree, type) { return nodes(tree, node => node.type === 'input' && node.props.type === type)[0]; }
function amountValue(tree) { return nodes(tree, node => node.props.className === 'ledger-entry-amount-value')[0]; }

const marketReference = Object.freeze({ vixReady: true, vixValue: 17.35, vixDataDate: '2026-09-10', stockReady: true, stockDistanceFromHigh: 0.1 });

test('formal-trade fields preserve the original draft and numeric share input contract in the shared two-column structure', () => {
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
  const sideButtons = nodes(tree, node => node.type === 'button' && node.props['aria-pressed'] !== undefined);
  assert.deepEqual(sideButtons.map(node => node.props['aria-pressed']), [true, false]);
  sideButtons[1].props.onClick();
  assert.deepEqual(changed, [
    { ...draft, symbol: 'AAPL', name: '', price: '' },
    { ...draft, price: '125.67' },
    { ...draft, shares: '20.5' },
    { ...draft, date: '2026-09-09' },
    { ...draft, side: 'sell' },
  ]);
  assert.equal(inputs[0].props['aria-label'], '股票代码');
  assert.equal(inputs[1].props.step, '0.01');
  assert.equal(inputs[1].props.inputMode, 'decimal');
  assert.equal(inputs[2].props.step, undefined);
  assert.equal(inputs[2].props.inputMode, 'numeric');
  assert.equal(inputs[2].props.max, undefined);
  assert.equal(inputs[3].props.style.WebkitAppearance, 'none');
  const fields = nodes(tree, node => node.props.className === 'ledger-entry-fields')[0];
  assert.deepEqual(nodes(fields, node => node.type === 'input').map(node => node.props.id), ['generic-ledger-trade-price', 'generic-ledger-trade-shares']);
  assert.doesNotMatch(renderToStaticMarkup(tree), /预计成交额|预计卖出金额/);
});

test('panel identity includes an editable ticker and stock name, with a compatible read-only header export', () => {
  for (const entryDraft of [draft, { ...draft, symbol: '', name: '', price: '' }]) {
    const tree = Entry({ draft: entryDraft, tt, onDraftChange: () => {} });
    assert.equal(input(tree, 'text').props.value, entryDraft.symbol);
    const html = renderToStaticMarkup(tree);
    assert.match(html, /<label[^>]*for="generic-ledger-trade-symbol"[^>]*>股票代码<\/label>/);
    assert.match(html, entryDraft.symbol ? /英伟达/ : /美股/);
  }
  const header = Header({ draft, tt });
  assert.equal(input(header, 'text'), undefined);
  assert.match(renderToStaticMarkup(header), /NVDA.*英伟达/);
  assert.doesNotMatch(renderToStaticMarkup(Header({ draft: { symbol: '' }, tt })), /ledger-entry-logo/);
});

test('clearing price preserves focus and all other draft fields', () => {
  let changed;
  let focusPreserved = false;
  const tree = Entry({ draft, tt, onDraftChange: value => { changed = value; } });
  const clear = nodes(tree, node => node.type === 'button' && node.props['aria-label'] === '清除价格')[0];
  clear.props.onPointerDown({ preventDefault: () => { focusPreserved = true; } });
  clear.props.onClick();
  assert.ok(focusPreserved);
  assert.deepEqual(changed, { ...draft, price: '' });
  const empty = Entry({ draft: { ...draft, price: '' }, tt, onDraftChange: () => {} });
  const emptyClear = nodes(empty, node => node.type === 'button' && node.props['aria-label'] === '清除价格')[0];
  assert.equal(emptyClear.props.disabled, true);
  assert.match(emptyClear.props.className, /invisible pointer-events-none/);
});

test('footer amount is two-decimal USD, buy-only red, and missing or invalid inputs stay unknown', () => {
  for (const fields of [{ price: '' }, { shares: '' }, { price: '0' }, { shares: '-1' }, { price: 'NaN' }, { shares: 'Infinity' }, { price: '1e308', shares: '100' }]) {
    const tree = Amount({ draft: { ...draft, ...fields }, tt });
    assert.equal(amountValue(tree).props.children, '—');
    assert.equal(amountValue(tree).props.style['--ledger-entry-amount-color'], undefined);
  }
  const buy = Amount({ draft, tt });
  assert.match(renderToStaticMarkup(buy), /\$2,469<span[^>]*>\.00<\/span>/);
  assert.equal(amountValue(buy).props.style['--ledger-entry-amount-color'].toUpperCase(), '#FF4B1F');
  const sell = Amount({ draft: { ...draft, side: 'sell' }, tt });
  assert.equal(amountValue(sell).props.style['--ledger-entry-amount-color'], undefined);
  assert.match(renderToStaticMarkup(sell), /预计卖出金额/);
  const fractional = Amount({ draft: { ...draft, price: '100', shares: '0.125' }, tt });
  assert.match(renderToStaticMarkup(fractional), /\$12<span[^>]*>\.50<\/span>/);
  const large = Amount({ draft: { ...draft, price: '1234567.89', shares: '100' }, tt });
  assert.match(renderToStaticMarkup(large), /\$123,456,789<span[^>]*>\.00<\/span>/);
  assert.doesNotMatch(source, /supabase|fetch\(|localStorage|stock_trades/);
});

test('RSI content appears for both sides before the optional buy-only stock market reference', () => {
  const referenceContent = React.createElement('section', { 'data-rsi-reference': true }, 'NVDA RSI(6)');
  const buy = renderToStaticMarkup(Entry({ draft, tt, onDraftChange: () => {}, referenceContent, marketReference }));
  assert.ok(buy.indexOf('data-rsi-reference') < buy.indexOf('data-generic-ledger-market-reference'));
  assert.match(buy, /市场参考/);
  assert.match(buy, /17\.35/);
  assert.match(buy, /数据 2026-09-10/);
  assert.match(buy, /ledger-entry-metric-label">NVDA</);
  assert.match(buy, /10\.0%/);
  assert.match(buy, /距52周高点/);
  assert.doesNotMatch(buy, /仓位|预算|极端交易策略|10%/);
  const sell = renderToStaticMarkup(Entry({ draft: { ...draft, side: 'sell' }, tt, onDraftChange: () => {}, referenceContent, marketReference }));
  assert.match(sell, /NVDA RSI\(6\)/);
  assert.doesNotMatch(sell, /data-generic-ledger-market-reference/);
  const suppliedMarket = renderToStaticMarkup(Entry({ draft, tt, onDraftChange: () => {}, referenceContent, marketReference, showMarketReference: false }));
  assert.match(suppliedMarket, /NVDA RSI\(6\)/);
  assert.doesNotMatch(suppliedMarket, /data-generic-ledger-market-reference/);
});

test('market reference honors readiness and missing values without inventing zero', () => {
  for (const values of [undefined, { ...marketReference, vixReady: false, stockReady: false }, { ...marketReference, vixValue: null, stockDistanceFromHigh: '' }]) {
    const html = renderToStaticMarkup(MarketReference({ symbol: 'aapl', marketReference: values, tt }));
    assert.match(html, /AAPL/);
    assert.match(html, /数据暂不可用/);
    assert.equal((html.match(/>--<\/div>/g) || []).length, 2);
    assert.doesNotMatch(html, /17\.35|10\.0%|0\.0%/);
  }
  const zeroDistance = renderToStaticMarkup(MarketReference({ symbol: 'NVDA', marketReference: { ...marketReference, stockDistanceFromHigh: 0 }, tt }));
  assert.match(zeroDistance, /0\.0%/);
});

test('shared structure uses quiet fields, readable inputs and complete financial numbers', () => {
  assert.match(css, /\.ledger-entry-fields\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.ledger-entry-field\s*\{[^}]*min-height:\s*46px;[^}]*border:\s*1px solid transparent;[^}]*background:\s*var\(--quote-field-bg\);/);
  assert.match(css, /\.ledger-entry-field:focus-within\s*\{[^}]*background:\s*var\(--quote-field-focus-bg\);[^}]*box-shadow:\s*var\(--quote-field-focus-shadow\);/);
  assert.match(css, /\.ledger-entry-input:focus\s*\{[^}]*outline:\s*none;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/);
  assert.match(css, /\.ledger-entry-input\s*\{[^}]*font-size:\s*18px;/);
  assert.match(css, /\.ledger-entry-date\s*\{[^}]*font-size:\s*16px;/);
  assert.match(css, /\.ledger-entry-amount-value\s*\{[^}]*overflow-wrap:\s*anywhere;/);
  assert.doesNotMatch(css, /#f6b54b|#0b0f14|text-overflow:\s*ellipsis|font-weight:\s*[5-9]00/);
  assert.doesNotMatch(source, /text-rose|text-emerald|trades\.cancel|<form/);
});
