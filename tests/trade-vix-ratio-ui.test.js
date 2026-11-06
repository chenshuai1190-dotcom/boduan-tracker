import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { formatTradeVixRatio } from '../src/lib/tradeVixRatioDisplay.js';

const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const resolveImports = (code, parent) => code.replace(/(from\s+)(['"])([^'"]+)\2/g, (_, prefix, _quote, path) =>
  `${prefix}${JSON.stringify(path.startsWith('.') ? new URL(path, parent).href : import.meta.resolve(path))}`);
const logoSource = new URL('../src/components/StockLogo.jsx', import.meta.url);
const logo = await transformWithOxc(readFileSync(logoSource, 'utf8'), 'StockLogo.jsx', { jsx: { runtime: 'classic' } });
const compiledLogo = moduleUrl(resolveImports(logo.code, logoSource));

async function loadPanel(name) {
  const sourceUrl = new URL(`../src/components/${name}.jsx`, import.meta.url);
  const source = readFileSync(sourceUrl, 'utf8');
  const transformed = await transformWithOxc(source, `${name}.jsx`, { jsx: { runtime: 'classic' } });
  const compiled = resolveImports(transformed.code.replace(/import\s*(['"])\.\/[^'"]+\.css\1;?/g, ''), sourceUrl)
    .replace(JSON.stringify(logoSource.href), JSON.stringify(compiledLogo));
  return import(moduleUrl(compiled));
}

const [{ default: GenericPanel, GenericLedgerTradeMarketReference }, { default: TqqqPanel }] = await Promise.all([
  loadPanel('GenericLedgerTradeEntryPanel'),
  loadPanel('TqqqTradeEntryPanel'),
]);
const tt = (_key, fallback, values = {}) => fallback.replace(/\{\{(\w+)\}\}/g, (_match, key) => values[key] ?? '');
const marketReference = Object.freeze({
  vixRatioReady: true,
  vixRatioValue: 1.025,
  vixRatioDataDate: '2026-11-05',
  vixRatioBuySignal: true,
  stockReady: true,
  stockDistanceFromHigh: 0.1,
  qqqReady: true,
  qqqDistanceFromHigh: -0.1,
});

function findMarket(node) {
  if (!React.isValidElement(node)) return null;
  if (node.type?.name === 'MarketReference') return node;
  return React.Children.toArray(node.props.children).map(findMarket).find(Boolean) || null;
}

function tqqqPanel(side, reference) {
  return TqqqPanel({ draft: { symbol: 'TQQQ', side }, preview: { inputReady: false }, marketReference: reference, tt, onDraftChange() {} });
}

const renderers = {
  ordinary: reference => renderToStaticMarkup(GenericLedgerTradeMarketReference({ symbol: 'NVDA', marketReference: reference, tt })),
  TQQQ: reference => renderToStaticMarkup(findMarket(tqqqPanel('buy', reference))),
};

test('ratio display keeps three decimals except where rounding would hide which side of one it is on', () => {
  for (const [value, expected] of [
    [0.98, '0.980'], [1, '1.000'], [1.025, '1.025'],
    [0.9999, '0.9999'], [1.0001, '1.0001'],
    [0.99999, '0.99999'], [1.00001, '1.00001'],
    [0.999999, '0.999999'], [1.000001, '1.000001'],
    [1 - Number.EPSILON, '<1.000000'], [1 + Number.EPSILON, '>1.000000'],
  ]) assert.equal(formatTradeVixRatio(value), expected);
  for (const value of [null, undefined, '', '1', 0, -1, NaN, Infinity]) {
    assert.equal(formatTradeVixRatio(value), '--');
  }
});

for (const [name, render] of Object.entries(renderers)) {
  test(`${name} market reference shows the ratio, its date and a compact buy signal`, () => {
    const html = render(marketReference);
    assert.match(html, /title="VIX \/ VIX3M">VIX 比率/);
    assert.match(html, />1\.025<span[^>]*data-vix-ratio-buy-signal="true">开始买入<\/span>/);
    assert.match(html, /数据 2026-11-05/);
    assert.doesNotMatch(html, />VIX<|恐慌区|加倍买入/);
    assert.match(html, /10\.0%/);
  });

  test(`${name} uses the unrounded ratio and upstream signal for the strict greater-than-one boundary`, () => {
    for (const [value, signal, expected, display] of [
      [0.9999, true, false, '0.9999'],
      [1, true, false, '1.000'],
      [1.0001, true, true, '1.0001'],
      [1 - Number.EPSILON, true, false, '&lt;1.000000'],
      [1 + Number.EPSILON, true, true, '&gt;1.000000'],
      [1.025, false, false, '1.025'],
      [1.025, undefined, false, '1.025'],
    ]) {
      const html = render({ ...marketReference, vixRatioValue: value, vixRatioBuySignal: signal });
      assert.equal(html.includes('开始买入'), expected, `ratio ${value} with signal ${signal}`);
      assert.equal(html.includes('未触发'), !expected);
      assert.match(html, new RegExp(`data-vix-ratio-buy-signal="${expected}"`));
      assert.ok(html.includes(`>${display}<span`), `ratio ${value} should display ${display}`);
    }
  });

  test(`${name} fails closed for missing, invalid, unready and legacy VIX data`, () => {
    const invalid = [null, undefined, '', '1.025', false, true, 0, -1, NaN, Infinity];
    const references = [
      undefined,
      { vixReady: true, vixValue: 50, vixDataDate: '2026-11-05', vixSignal: 'extreme' },
      { ...marketReference, vixRatioReady: false },
      ...invalid.map(value => ({ ...marketReference, vixRatioValue: value })),
    ];
    for (const reference of references) {
      const html = render(reference);
      assert.match(html, />--<\/div>/);
      assert.match(html, /数据暂不可用/);
      assert.doesNotMatch(html, /开始买入|未触发|data-vix-ratio-buy-signal=|>0\.000|>50/);
    }
  });
}

test('neither sell panel renders the market ratio or a buy prompt', () => {
  const generic = GenericPanel({ draft: { symbol: 'NVDA', side: 'sell' }, marketReference, tt, onDraftChange() {} });
  for (const panel of [generic, tqqqPanel('sell', marketReference)]) {
    const html = renderToStaticMarkup(panel);
    assert.doesNotMatch(html, /data-vix-ratio-buy-signal=|开始买入|1\.025/);
  }
});
