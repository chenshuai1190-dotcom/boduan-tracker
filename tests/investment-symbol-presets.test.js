import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/components/InvestmentSymbolPresets.jsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../src/pages/InvestmentComparisonPage.jsx', import.meta.url), 'utf8');
const transformed = await transformWithOxc(source, 'InvestmentSymbolPresets.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code.replace(/from (["'])(react|lucide-react)\1/g, (_, quote, module) => `from ${JSON.stringify(import.meta.resolve(module))}`);
const { default: InvestmentSymbolPresets, INVESTMENT_SYMBOL_PRESETS } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const expectedSymbols = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO'];

function textContent(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return React.Children.toArray(node.props?.children).map(textContent).join(' ');
}

function buttonNodes(node) {
  if (!React.isValidElement(node)) return [];
  return [...(node.type === 'button' ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(buttonNodes)];
}

test('presets contain Magnificent Seven then AVGO without market values or provider writes', () => {
  assert.deepEqual(INVESTMENT_SYMBOL_PRESETS.map(item => item.symbol), expectedSymbols);
  for (const item of INVESTMENT_SYMBOL_PRESETS) {
    assert.equal(item.type, 'Common Stock');
    assert.ok(typeof item.name === 'string' && item.name.trim());
    assert.ok(typeof item.nameZh === 'string' && item.nameZh.trim());
    assert.ok(Object.keys(item).every(key => ['symbol', 'name', 'nameZh', 'type', 'currency', 'exchange'].includes(key)));
  }
  assert.equal(/\b(?:fetch|loadInvestmentComparison|searchInvestmentSymbols)\s*\(/.test(source), false);
  assert.equal(/supabase|localStorage|stock_trades|insertStockTrade|service_role/.test(source), false);
});

test('preset buttons render all eight tickers and localized company names', () => {
  for (const englishMode of [false, true]) {
    const props = { side: 0, instruments: [{ symbol: 'QQQ' }, { symbol: 'TQQQ' }], englishMode, onSelect() {} };
    const html = renderToStaticMarkup(React.createElement(InvestmentSymbolPresets, props));
    const tree = InvestmentSymbolPresets(props);
    const buttons = buttonNodes(tree);
    assert.equal(buttons.length, 8);
    for (const item of INVESTMENT_SYMBOL_PRESETS) {
      assert.ok(html.includes(item.symbol));
      const button = buttons.find(node => textContent(node).includes(item.symbol));
      assert.ok(button);
      assert.ok(textContent(button).includes(englishMode ? item.name : item.nameZh));
      assert.equal(Boolean(button.props.disabled), false);
    }
  }
});

test('either picker side disables the opposite instrument and identifies its current selection', () => {
  const instruments = [{ symbol: 'NVDA' }, { symbol: 'AVGO' }];
  for (const side of [0, 1]) {
    for (const englishMode of [false, true]) {
      const props = { side, instruments, englishMode, onSelect() {} };
      const buttons = buttonNodes(InvestmentSymbolPresets(props));
      const current = buttons.find(node => textContent(node).includes(instruments[side].symbol));
      const duplicate = buttons.find(node => textContent(node).includes(instruments[1 - side].symbol));
      assert.equal(Boolean(current.props.disabled), false);
      assert.equal(duplicate.props.disabled, true);
      assert.match(textContent(current), englishMode ? /Current|Selected/i : /当前/);
      assert.match(textContent(duplicate), englishMode ? /Other side|In comparison|Comparing/i : /已在对比/);
      const html = renderToStaticMarkup(React.createElement(InvestmentSymbolPresets, props));
      assert.equal((html.match(/ disabled=""/g) || []).length, 1);
    }
  }
});

test('choosing an enabled preset returns its instrument identity to the controlled parent', () => {
  let selected = null;
  const props = { side: 1, instruments: [{ symbol: 'QQQ' }, { symbol: 'TQQQ' }], englishMode: false, onSelect: item => { selected = item; } };
  const button = buttonNodes(InvestmentSymbolPresets(props)).find(node => textContent(node).includes('AVGO'));
  button.props.onClick();
  assert.deepEqual(selected, INVESTMENT_SYMBOL_PRESETS.find(item => item.symbol === 'AVGO'));
});

test('empty search presents presets without opening the keyboard while typed search keeps its authenticated path', () => {
  assert.ok(pageSource.includes('!normalizedQuery ? <InvestmentSymbolPresets'));
  assert.ok(pageSource.includes('searchSource({ userId, query: normalizedQuery'));
  assert.equal(pageSource.includes('inputRef.current?.focus'), false);
  assert.ok(pageSource.includes('dialogRef.current?.focus'));
});
