import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { marketStrongTextClass, marketTextClass } from '../src/lib/marketColorMode.js';

const tabUrl = new URL('../src/tabs/TradesTab.jsx', import.meta.url);
const source = readFileSync(tabUrl, 'utf8');
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const resolveImports = (code, parent) => code.replace(/(from\s+)(['"])([^'"]+)\2/g, (_, prefix, _quote, path) =>
  `${prefix}${JSON.stringify(path.startsWith('.') ? new URL(path, parent).href : import.meta.resolve(path))}`);
const logoUrl = new URL('../src/components/StockLogo.jsx', import.meta.url);
const logo = await transformWithOxc(readFileSync(logoUrl, 'utf8'), 'StockLogo.jsx', { jsx: { runtime: 'classic' } });
const compiledLogo = moduleUrl(resolveImports(logo.code, logoUrl));
const helpersStart = source.indexOf('const TRADE_FONT =');
const sheetStart = source.indexOf('function PositionProfitScenarioSheet(');
const sheetEnd = source.indexOf('export default function TradesTab(');
assert.ok(helpersStart >= 0 && sheetStart > helpersStart && sheetEnd > sheetStart, 'scenario component boundaries must be explicit');
const sheetSource = source.slice(sheetStart, sheetEnd);
const iconImport = source.match(/import \{[^;]+\} from 'lucide-react';/)?.[0];
assert.ok(iconImport, 'scenario icon imports must come from the actual module');
const isolatedSource = `
  import React from 'react';
  ${iconImport}
  import { marketStrongTextClass, marketTextClass } from '../lib/marketColorMode.js';
  import { splitCurrencyAmount } from '../lib/amountDisplay.js';
  import StockLogo, { stockLogoCandidates } from ${JSON.stringify(compiledLogo)};
  ${source.slice(helpersStart, sheetEnd)}
  export { PositionProfitScenarioSheet };
`;
const transformed = await transformWithOxc(isolatedSource, 'PositionProfitScenarioSheet.jsx', { jsx: { runtime: 'classic' } });
const { PositionProfitScenarioSheet } = await import(moduleUrl(resolveImports(transformed.code, tabUrl)));
const basePosition = Object.freeze({ symbol: 'NVDA', name: 'NVIDIA', heldShares: 100, effectiveCost: 80, currentPrice: 100, week52High: 120 });
const tt = (_key, fallback) => fallback;
function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(text).join('');
}
function renderSheet(overrides = {}) {
  let tree;
  const props = {
    position: basePosition, onClose: () => {}, tt, displayCurrency: 'CNY', displayRate: 7,
    marketColorMode: 'redUpGreenDown', stockNameParts: symbol => ({ title: symbol, subtitle: 'NVIDIA' }),
    ...overrides,
  };
  function Capture() { tree = PositionProfitScenarioSheet(props); return tree; }
  const html = renderToStaticMarkup(React.createElement(Capture));
  return { tree, html };
}
function valueNode(tree, key) {
  const matches = nodes(tree, node => node.props[`data-position-scenario-${key}`] !== undefined);
  assert.equal(matches.length, 1, `exactly one ${key} reading`);
  return matches[0];
}
function shortcuts(tree) { return nodes(tree, node => node.type === 'button' && node.props['aria-pressed'] !== undefined); }

test('scenario report preserves exact CNY valuation, cost-based return and current-price comparison', () => {
  const { tree, html } = renderSheet();
  assert.equal(nodes(tree, node => node.props['data-position-scenario'] !== undefined).length, 1);
  assert.equal(text(valueNode(tree, 'market-value')), '¥70,000.00');
  assert.equal(text(valueNode(tree, 'profit')), '+¥14,000.00');
  assert.equal(text(valueNode(tree, 'delta')), '¥0.00');
  assert.equal(text(valueNode(tree, 'per-dollar')), '¥700.00');
  assert.match(html, /\+25\.00%/);
  assert.match(html, /0\.00%/);
  const price = nodes(tree, node => node.type === 'input')[0];
  assert.equal(price.props.value, '100.000');
  assert.equal(price.props.inputMode, 'decimal');
  assert.equal(price.props.enterKeyHint, 'done');
});

test('USD valuation and negative cost-based returns retain their precise amounts and market preference', () => {
  const usd = renderSheet({ displayCurrency: 'USD', displayRate: 1 });
  assert.equal(text(valueNode(usd.tree, 'market-value')), '$10,000.00');
  assert.equal(text(valueNode(usd.tree, 'profit')), '+$2,000.00');
  assert.equal(text(valueNode(usd.tree, 'per-dollar')), '$100.00');
  const lossPosition = Object.freeze({ ...basePosition, effectiveCost: 125 });
  for (const marketColorMode of ['redUpGreenDown', 'greenUpRedDown']) {
    const gain = renderSheet({ marketColorMode });
    const loss = renderSheet({ position: lossPosition, marketColorMode });
    assert.equal(text(valueNode(loss.tree, 'profit')), '-¥17,500.00');
    assert.match(loss.html, /-20\.00%/);
    const gainClass = valueNode(gain.tree, 'profit').props.className;
    const lossClass = valueNode(loss.tree, 'profit').props.className;
    assert.ok([marketTextClass(1, marketColorMode), marketStrongTextClass(1, marketColorMode)].some(tone => gainClass.includes(tone)));
    assert.ok([marketTextClass(-1, marketColorMode), marketStrongTextClass(-1, marketColorMode)].some(tone => lossClass.includes(tone)));
    assert.notEqual(gainClass, lossClass);
  }
});

test('missing or invalid account inputs show the unavailable state instead of financial zeroes', () => {
  for (const fields of [
    { currentPrice: undefined }, { currentPrice: 'not-a-price' }, { currentPrice: 0 },
    { currentPrice: -10 }, { currentPrice: Infinity }, { heldShares: 0 },
    { heldShares: undefined }, { effectiveCost: undefined }, { effectiveCost: -80 },
  ]) {
    const { tree, html } = renderSheet({ position: { ...basePosition, ...fields } });
    for (const key of ['profit', 'delta', 'market-value', 'per-dollar']) {
      assert.equal(nodes(tree, node => node.props[`data-position-scenario-${key}`] !== undefined).length, 0, `${key} must not display a fabricated zero for ${JSON.stringify(fields)}`);
    }
    assert.match(html, /请输入有效价格/);
  }
});

test('shortcuts expose selected state and disable unavailable price references', () => {
  const ready = shortcuts(renderSheet().tree);
  assert.deepEqual(ready.map(button => [text(button), button.props['aria-pressed'], Boolean(button.props.disabled)]), [
    ['当前价', true, false], ['成本价', false, false], ['52周高', false, false], ['+5%', false, false], ['-5%', false, false],
  ]);
  const missing = shortcuts(renderSheet({ position: { ...basePosition, currentPrice: 0, week52High: undefined } }).tree);
  assert.deepEqual(missing.map(button => Boolean(button.props.disabled)), [true, false, true, true, true]);
  assert.ok(missing.every(button => button.props['aria-pressed'] === false));
});

test('a simulation at the current price does not draw a duplicate simulated marker or label', () => {
  const { tree } = renderSheet();
  const markers = nodes(tree, node => node.props['data-price-position-marker']).map(node => node.props['data-price-position-marker']);
  const labels = nodes(tree, node => node.props['data-price-position-label']).map(node => node.props['data-price-position-label']);
  assert.deepEqual(markers.sort(), ['cost', 'current']);
  assert.deepEqual(labels.sort(), ['cost', 'current']);
  assert.equal(new Set(markers).size, markers.length);
  assert.doesNotMatch(sheetSource, /\bfetch\s*\(|\bsupabase\b|\blocalStorage\b|\baddTrade\b|\bsaveMarginDebt\b/);
});
