import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { t } from '../src/lib/i18n.js';

const sourceUrl = new URL('../src/components/TradeCostPreview.jsx', import.meta.url);
const source = readFileSync(sourceUrl, 'utf8');
const css = readFileSync(new URL('../src/components/TradeCostPreview.css', import.meta.url), 'utf8');
const transformed = await transformWithOxc(source, 'TradeCostPreview.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code
  .replace(/import\s*(['"])\.\/TradeCostPreview\.css\1;?/g, '')
  .replace(/(from\s+)(['"])([^'"]+)\2/g, (_match, prefix, _quote, specifier) =>
    `${prefix}${JSON.stringify(specifier.startsWith('.') ? new URL(specifier, sourceUrl).href : import.meta.resolve(specifier))}`);
const { default: TradeCostPreview } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const tt = (key, fallback, values) => t('zh', key, fallback, values);

function render({ current, after, ...rest } = {}, language = 'zh') {
  const preview = Object.freeze({ applies: true, symbol: 'NVDA', current, after, ...rest });
  return renderToStaticMarkup(React.createElement(TradeCostPreview, {
    preview,
    tt: (key, fallback, values) => t(language, key, fallback, values),
  }));
}

function displayedValues(html) {
  return [...html.matchAll(/class="trade-cost-preview-value">([^<]*)<\/div>/g)].map(match => match[1]);
}

test('unknown costs remain unknown for both columns and do not become a zero or closed position', () => {
  for (const position of [undefined, { status: 'unavailable' }, { status: 'holding', cost: null },
    { status: 'holding', cost: '' }, { status: 'holding', cost: NaN }, { status: 'holding', cost: Infinity }]) {
    const html = render({ current: position, after: position });
    assert.deepEqual(displayedValues(html), ['—', '—', '—']);
    assert.match(html, /当前摊薄成本/);
    assert.match(html, /交易后成本/);
    assert.doesNotMatch(html, /\$0|已清仓|暂无持仓/);
  }
  assert.deepEqual(displayedValues(render({
    current: { status: 'holding', cost: 100 }, after: { status: 'unavailable' }, reason: 'invalid-input',
  })), ['$100.000', '—', '—'], 'invalid drafts must not hide a known current holding cost');
});

test('current and expected costs preserve zero and negative values, in complete three-decimal USD per-share amounts', () => {
  const current = Object.freeze({ status: 'holding', cost: 0, shares: 2000 });
  const after = Object.freeze({ status: 'holding', cost: -12.34567, shares: 1000 });
  assert.deepEqual(displayedValues(render({ current, after })), ['$0.000', '-$12.346', '—']);
  assert.deepEqual(displayedValues(render({
    current: { status: 'holding', cost: 1234567.8914, shares: 1 },
    after: { status: 'holding', cost: 98.12349, shares: 2 },
  })), ['$1,234,567.891', '$98.123', '—']);
  assert.equal(current.cost, 0);
  assert.equal(after.cost, -12.34567, 'formatting must not round the underlying ledger value');
});

test('fully sold and never-held positions have distinct states instead of a fabricated zero cost', () => {
  const html = render({ current: { status: 'empty', cost: 0, shares: 0 }, after: { status: 'closed', cost: 0, shares: 0 } });
  assert.deepEqual(displayedValues(html), ['暂无持仓', '已清仓', '—']);
  assert.doesNotMatch(html, /\$0/);
  assert.deepEqual(displayedValues(render({
    current: { status: 'holding', cost: 149.5, shares: 6000 }, after: { status: 'closed', shares: 0 },
  })), ['$149.500', '已清仓', '—']);
});

test('English uses the actual application translations for labels and position states', () => {
  const html = render({ current: { status: 'empty' }, after: { status: 'closed' } }, 'en');
  assert.match(html, /Current diluted cost/);
  assert.match(html, /Cost after trade/);
  assert.match(html, /Weight after trade/);
  assert.match(html, /Current —/);
  assert.deepEqual(displayedValues(html), ['No position', 'Position closed', '—']);
  assert.doesNotMatch(html, /当前|交易后|已清仓|暂无持仓/);
});

test('the third column shows after-trade stock weight with current weight below and preserves unknown versus zero', () => {
  const allocation = Object.freeze({ current: .168, after: .14244 });
  const html = render({ current: { status: 'holding', cost: 375.171 }, after: { status: 'holding', cost: 358.251 }, allocation });
  assert.deepEqual(displayedValues(html), ['$375.171', '$358.251', '14.2%']);
  assert.match(html, /交易后仓位/);
  assert.match(html, /当前 16\.8%/);
  assert.equal(allocation.after, .14244, 'display rounding must not change the estimated weight');
  const closed = render({ after: { status: 'closed' }, allocation: { current: 1, after: 0 } });
  assert.deepEqual(displayedValues(closed), ['—', '已清仓', '0.0%']);
  assert.match(closed, /当前 100\.0%/);
  for (const value of [undefined, null, '', NaN, Infinity, -1, 1.01]) {
    const unknown = render({ allocation: { current: value, after: value } });
    assert.deepEqual(displayedValues(unknown), ['—', '—', '—']);
    assert.match(unknown, /当前 —/);
    assert.doesNotMatch(unknown, /0\.0%/);
  }
});

test('out-of-scope cost previews are absent and the component contains no trading controls or side effects', () => {
  assert.equal(renderToStaticMarkup(React.createElement(TradeCostPreview, { tt })), '');
  assert.equal(render({ applies: false, current: { status: 'holding', cost: 100 } }), '');
  const html = render({ current: { status: 'holding', cost: 100 }, after: { status: 'holding', cost: 80 } });
  assert.doesNotMatch(html, /<(?:input|button|form|select)\b|\bon(?:click|change|submit)=/i);
  assert.doesNotMatch(source, /fetch\s*\(|supabase|localStorage|confirmTradeSubmit|setNewTrade|onDraftChange|addStockTrade|updateStockTrade/);
  assert.match(css, /\.trade-cost-preview-value\s*\{[^}]*color:\s*#ededf0;/,
    'costs are neutral values, including negative diluted costs, rather than gain/loss signals');
  assert.match(css, /\.trade-cost-preview-value\s*\{[^}]*overflow-wrap:\s*anywhere;/,
    'large costs must remain complete at mobile widths');
  assert.doesNotMatch(source + css, /MARKET_(?:RED|GREEN)|text-(?:red|green|rose|emerald)|#ff4b1f|#34d399/i);
});
