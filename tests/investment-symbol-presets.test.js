import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { DCA_SYMBOLS } from '../src/lib/dcaLabModel.js';
import { INVESTMENT_SYMBOL_PRESETS as SHARED_PRESETS } from '../src/lib/investmentSymbolPresets.js';

const componentUrl = new URL('../src/components/InvestmentSymbolPresets.jsx', import.meta.url);
const source = readFileSync(componentUrl, 'utf8');
const pickerSource = readFileSync(new URL('../src/components/InvestmentSymbolPicker.jsx', import.meta.url), 'utf8');
const transformed = await transformWithOxc(source, 'InvestmentSymbolPresets.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code.replace(/from (["'])([^"']+)\1/g, (_, quote, module) => `from ${JSON.stringify(module.startsWith('.') ? new URL(module, componentUrl).href : import.meta.resolve(module))}`);
const { default: InvestmentSymbolPresets, INVESTMENT_SYMBOL_PRESETS } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const expectedSymbols = ['QQQ', 'SPY', 'TQQQ', 'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO', 'VGT', 'SMH'];

function textContent(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return React.Children.toArray(node.props?.children).map(textContent).join(' ');
}

function buttonNodes(node) {
  if (!React.isValidElement(node)) return [];
  return [...(node.type === 'button' ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(buttonNodes)];
}

test('comparison and DCA share thirteen ordered instrument identities without prices or provider writes', () => {
  assert.equal(INVESTMENT_SYMBOL_PRESETS, SHARED_PRESETS);
  assert.equal(DCA_SYMBOLS, SHARED_PRESETS, 'DCA aliases the same catalog instead of maintaining a second list');
  assert.deepEqual(INVESTMENT_SYMBOL_PRESETS.map(item => item.symbol), expectedSymbols);
  for (const item of INVESTMENT_SYMBOL_PRESETS) {
    assert.equal(item.type, ['QQQ', 'SPY', 'TQQQ', 'VGT', 'SMH'].includes(item.symbol) ? 'ETF' : 'Common Stock');
    assert.ok(typeof item.name === 'string' && item.name.trim());
    assert.ok(typeof item.nameZh === 'string' && item.nameZh.trim());
    assert.ok(Object.keys(item).every(key => ['symbol', 'name', 'nameZh', 'type', 'currency', 'exchange'].includes(key)));
  }
  assert.equal(/\b(?:fetch|loadInvestmentComparison|searchInvestmentSymbols)\s*\(/.test(source), false);
  assert.equal(/supabase|localStorage|stock_trades|insertStockTrade|service_role/.test(source), false);
});

const buttonSymbol = button => React.Children.toArray(button.props.children[0].props.children).find(node => node.type === 'strong')?.props.children;
const symbolButton = (buttons, symbol) => buttons.find(button => buttonSymbol(button) === symbol);

test('single-investment presets show all thirteen localized choices without disabling any symbol', () => {
  for (const englishMode of [false, true]) {
    const props = { selectedSymbol: 'QQQ', englishMode, onSelect() {} };
    const html = renderToStaticMarkup(React.createElement(InvestmentSymbolPresets, props));
    const tree = InvestmentSymbolPresets(props);
    const buttons = buttonNodes(tree);
    assert.equal(buttons.length, 13);
    assert.deepEqual(buttons.map(buttonSymbol), expectedSymbols);
    for (const item of INVESTMENT_SYMBOL_PRESETS) {
      assert.ok(html.includes(item.symbol));
      const button = symbolButton(buttons, item.symbol);
      assert.ok(button);
      assert.ok(textContent(button).includes(englishMode ? item.name : item.nameZh));
      assert.equal(Boolean(button.props.disabled), false);
    }
  }
});

test('either picker side disables the opposite instrument and identifies its current selection', () => {
  const instruments = ['NVDA', 'AVGO'];
  for (const side of [0, 1]) {
    for (const englishMode of [false, true]) {
      const props = { selectedSymbol: instruments[side], comparisonSymbol: instruments[1 - side], englishMode, onSelect() {} };
      const buttons = buttonNodes(InvestmentSymbolPresets(props));
      const current = symbolButton(buttons, instruments[side]);
      const duplicate = symbolButton(buttons, instruments[1 - side]);
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
  const props = { selectedSymbol: 'TQQQ', comparisonSymbol: 'QQQ', englishMode: false, onSelect: item => { selected = item; } };
  const button = symbolButton(buttonNodes(InvestmentSymbolPresets(props)), 'AVGO');
  button.props.onClick();
  assert.deepEqual(selected, INVESTMENT_SYMBOL_PRESETS.find(item => item.symbol === 'AVGO'));
});

test('ETF presets preserve their type and cannot duplicate the opposite investment', () => {
  for (const symbol of ['QQQ', 'SPY', 'TQQQ', 'VGT', 'SMH']) {
    let selected;
    const props = { selectedSymbol: 'NVDA', onSelect: item => { selected = item; } };
    symbolButton(buttonNodes(InvestmentSymbolPresets(props)), symbol).props.onClick();
    assert.equal(selected.symbol, symbol);
    assert.equal(selected.type, 'ETF');
    const other = { ...props, comparisonSymbol: symbol, onSelect: () => assert.fail('duplicate ETF must not select') };
    const disabled = symbolButton(buttonNodes(InvestmentSymbolPresets(other)), symbol);
    assert.equal(disabled.props.disabled, true);
    disabled.props.onClick();
  }
  assert.match(pickerSource, /股票与 ETF 快捷选择/);
  assert.doesNotMatch(pickerSource, /Magnificent Seven \+ AVGO|美股七姐妹 \+ AVGO/);
});

test('empty search presents presets without opening the keyboard while typed search keeps its authenticated path', () => {
  assert.ok(pickerSource.includes('!normalizedQuery ? <InvestmentSymbolPresets'));
  assert.ok(pickerSource.includes('searchSource({ userId, query: normalizedQuery'));
  assert.equal(pickerSource.includes('inputRef.current?.focus'), false);
  assert.ok(pickerSource.includes('dialogRef.current?.focus'));
});
