import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { marketHexColor } from '../src/lib/marketColorMode.js';

const componentUrl = new URL('../src/components/StockReturnComparisonCard.jsx', import.meta.url);
const css = readFileSync(new URL('../src/components/StockReturnComparisonCard.css', import.meta.url), 'utf8');
const cache = new Map();
async function compile(url) {
  if (cache.has(url.href)) return cache.get(url.href);
  const compiling = (async () => {
    const source = readFileSync(url, 'utf8').replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
    let { code } = await transformWithOxc(source, url.pathname, { jsx: { runtime: 'classic' } });
    for (const match of [...code.matchAll(/(from\s+)(['"])([^'"]+)\2/g)].reverse()) {
      const resolved = match[3].startsWith('.') ? new URL(match[3], url) : null;
      const target = resolved?.pathname.endsWith('.jsx') ? await compile(resolved) : resolved?.href || import.meta.resolve(match[3]);
      code = code.slice(0, match.index) + match[1] + JSON.stringify(target) + code.slice(match.index + match[0].length);
    }
    return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  })();
  cache.set(url.href, compiling);
  return compiling;
}
const { default: StockReturnComparisonCard, ComparisonChart } = await import(await compile(componentUrl));

function render(Component, props) {
  let tree;
  function Capture() { tree = Component(props); return tree; }
  return { html: renderToStaticMarkup(React.createElement(Capture)), tree };
}
function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
const comparison = {
  available: true, baselineDate: '2026-09-01', snapshotDate: '2026-09-04', positionStartDate: '2026-09-01',
  stockPnlUsd: 300, benchmarkPnlUsd: 100, excessPnlUsd: 200,
  stockPnlPct: 0.3, benchmarkPnlPct: 0.1, excessPnlPct: 0.2,
  trend: [
    { date: '2026-09-01', stockPnlUsd: 0, benchmarkPnlUsd: 0, excessPnlUsd: 0, stockPnlPct: 0, benchmarkPnlPct: 0, excessPnlPct: 0 },
    { date: '2026-09-03', stockPnlUsd: 100, benchmarkPnlUsd: 50, excessPnlUsd: 50, stockPnlPct: 0.1, benchmarkPnlPct: 0.05, excessPnlPct: 0.05 },
    { date: '2026-09-04', stockPnlUsd: 300, benchmarkPnlUsd: 100, excessPnlUsd: 200, stockPnlPct: 0.3, benchmarkPnlPct: 0.1, excessPnlPct: 0.2 },
  ],
};
const props = { comparison, displayRate: 1, displayCurrency: 'USD', language: 'zh', marketColorMode: 'redUpGreenDown' };
const line = (tree, side) => nodes(tree, node => node.props[`data-stock-comparison-${side}-path`] !== undefined)[0];

test('percent geometry and readout use unchanged return rates regardless of display currency', () => {
  const usd = render(ComparisonChart, { ...props, mode: 'percent', initialTooltipOpen: true });
  const cny = render(ComparisonChart, { ...props, mode: 'percent', displayCurrency: 'CNY', displayRate: 7.1234, initialTooltipOpen: true });
  assert.equal(line(usd.tree, 'mine').props.d, line(cny.tree, 'mine').props.d);
  assert.equal(line(usd.tree, 'benchmark').props.d, line(cny.tree, 'benchmark').props.d);
  assert.match(usd.html, /\+10\.00%/);
  assert.match(cny.html, /\+10\.00%/);
  assert.match(cny.html, /\+¥356\.17/);
  assert.equal(line(usd.tree, 'benchmark').props.stroke, '#85858f');
  assert.equal(line(usd.tree, 'benchmark').props.strokeDasharray, '4 4');
});

test('default chart keeps amount mode and missing rates do not become zero lines', () => {
  const amount = render(ComparisonChart, { ...props, initialTooltipOpen: true });
  assert.match(amount.html, /data-stock-return-comparison-mode="amount"/);
  assert.match(amount.html, /\+\$100\.00/);
  const missingRates = { ...comparison, trend: comparison.trend.map(point => ({ ...point, stockPnlPct: null, benchmarkPnlPct: undefined })) };
  const percent = render(ComparisonChart, { ...props, comparison: missingRates, mode: 'percent' });
  assert.match(percent.html, /暂不绘制对比曲线/);
  assert.equal(line(percent.tree, 'mine'), undefined);
  assert.ok(line(render(ComparisonChart, { ...props, comparison: missingRates }).tree, 'mine'));
});

test('trade markers retain actual record groups and only appear on supplied curve dates', () => {
  const buy = { date: '2026-09-01', markerDate: '2026-09-01', side: 'buy', records: [{ id: 'buy-1' }] };
  const mixed = { date: '2026-09-03', markerDate: '2026-09-03', side: 'mixed', records: [{ id: 'buy-2' }, { id: 'sell-1' }] };
  const sell = { date: '2026-09-04', markerDate: '2026-09-04', side: 'sell', records: [{ id: 'sell-2' }] };
  const missingDate = { date: '2026-09-02', side: 'buy', records: [{ id: 'unmapped' }] };
  let selected;
  const { tree, html } = render(ComparisonChart, { ...props, mode: 'percent', tradeMarkers: [buy, mixed, sell, missingDate, { ...buy, records: [] }], onSelectTradeMarker: marker => { selected = marker; } });
  const markers = nodes(tree, node => node.props['data-stock-comparison-trade-marker']);
  assert.equal(markers.length, 3);
  assert.match(html, /买入及卖出 · 2 笔/);
  assert.doesNotMatch(html, /data-stock-comparison-marker-date="2026-09-02"/);
  let stopped = false;
  markers[1].props.onPointerDown({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true, 'marker presses must not activate chart pointer capture');
  const previousWindow = globalThis.window;
  globalThis.window = { clearTimeout() {} };
  try { markers[1].props.onClick({ stopPropagation() {} }); } finally { globalThis.window = previousWindow; }
  assert.equal(selected, mixed, 'the event sheet must receive the original record group without synthetic entries');
  assert.match(css, /\.stock-comparison-trade-marker\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*touch-action:\s*pan-y;/);
});

test('buy and sell marker colors follow existing market preference helpers', () => {
  for (const marketColorMode of ['redUpGreenDown', 'greenUpRedDown']) {
    const { tree } = render(ComparisonChart, { ...props, marketColorMode, tradeMarkers: [
      { date: '2026-09-01', side: 'buy', records: [{}] }, { date: '2026-09-04', side: 'sell', records: [{}] },
    ] });
    for (const [side, direction] of [['buy', -1], ['sell', 1]]) {
      const glyph = nodes(tree, node => node.props['data-stock-comparison-marker-glyph'] === side)[0];
      assert.equal(nodes(glyph, node => node.type === 'circle')[0].props.stroke, marketHexColor(direction, marketColorMode));
    }
  }
});

test('summary-only card keeps four truthful headline readings and method/share controls without another chart', () => {
  const { html } = render(StockReturnComparisonCard, { ...props, summaryOnly: true, title: '当前持仓对比', displayCurrency: 'CNY', displayRate: 7.1234 });
  assert.match(html, /当前持仓对比/);
  assert.match(html, /data-stock-comparison-summary-metric="stock-rate"/);
  assert.match(html, /data-stock-comparison-summary-metric="benchmark-rate"/);
  assert.match(html, /data-stock-comparison-summary-metric="excess-rate"/);
  assert.match(html, /data-stock-comparison-summary-metric="excess-amount"/);
  assert.match(html, /\+30\.00%/);
  assert.match(html, /\+10\.00%/);
  assert.match(html, /\+20\.00%/);
  assert.match(html, /\+¥1,424\.68/);
  assert.match(html, /查看收益对比口径/);
  assert.match(html, /打开收益对比分享预览/);
  assert.doesNotMatch(html, /data-stock-return-comparison-chart/);
});

function stockCycle(values = [0, 100, 300]) {
  return {
    available: true,
    symbol: 'NVDA',
    baselineDate: '2026-09-01',
    trend: comparison.trend.map((point, index) => ({ date: point.date, stockPnlUsd: values[index], stockPnlPct: values[index] / 1000 })),
  };
}

test('stock-only percent and amount modes need no benchmark and retain exact cycle tooltip readings', () => {
  const cycle = stockCycle();
  for (const mode of ['percent', 'amount']) {
    const options = { ...props, comparison: cycle, stockOnly: true, mode, displayCurrency: 'CNY', displayRate: 7.1234, initialTooltipOpen: true };
    const { tree, html } = render(ComparisonChart, options);
    assert.ok(line(tree, 'mine'));
    assert.equal(line(tree, 'benchmark'), undefined);
    assert.equal(line(tree, 'mine').props.stroke, marketHexColor(300, props.marketColorMode));
    assert.match(html, /本轮收益/);
    assert.match(html, /本轮建仓 09\/01/);
    assert.match(html, /\+10\.00%/);
    assert.match(html, /\+¥712\.34/);
    assert.doesNotMatch(html, /QQQ|超额|收益率差|对比起点|当前持仓收益|NaN|Infinity/);
    const irrelevantBenchmark = {
      ...cycle,
      trend: cycle.trend.map(point => ({ ...point, benchmarkPnlUsd: 1000000, benchmarkPnlPct: 1000 })),
    };
    assert.equal(line(render(ComparisonChart, { ...options, comparison: irrelevantBenchmark }).tree, 'mine').props.d, line(tree, 'mine').props.d, 'QQQ values must not stretch a stock-only axis');
  }
});

test('stock-only zero and losing series remain renderable and use truthful direction colors', () => {
  for (const values of [[0, 0, 0], [0, -100, -300]]) {
    for (const mode of ['percent', 'amount']) {
      for (const marketColorMode of ['redUpGreenDown', 'greenUpRedDown']) {
        const { tree, html } = render(ComparisonChart, { ...props, comparison: stockCycle(values), stockOnly: true, mode, marketColorMode, initialTooltipOpen: true });
        const mine = line(tree, 'mine');
        assert.ok(mine?.props.d);
        assert.equal(mine.props.stroke, values.at(-1) === 0 ? 'rgba(255,255,255,0.52)' : marketHexColor(values.at(-1), marketColorMode));
        assert.match(html, values.at(-1) === 0 ? /0\.00%/ : /-10\.00%/);
        assert.match(html, values.at(-1) === 0 ? /\+\$0\.00/ : /-\$100\.00/);
        assert.doesNotMatch(html, /NaN|Infinity|QQQ/);
      }
    }
  }
});

test('stock-only missing values are unavailable in their own mode rather than fabricated as zeros', () => {
  for (const [mode, key] of [['percent', 'stockPnlPct'], ['amount', 'stockPnlUsd']]) {
    for (const missing of [null, undefined, '', ' ', false, NaN]) {
      const cycle = stockCycle();
      cycle.trend = cycle.trend.map(point => ({ ...point, [key]: missing }));
      const { tree, html } = render(ComparisonChart, { ...props, comparison: cycle, stockOnly: true, mode });
      assert.equal(line(tree, 'mine'), undefined);
      assert.match(html, /暂无足够的本轮收盘记录/);
      assert.doesNotMatch(html, /双方|对比|QQQ|0\.00/);
    }
  }
  const amountOnly = stockCycle();
  amountOnly.trend = amountOnly.trend.map(point => ({ ...point, stockPnlPct: null }));
  const { html } = render(ComparisonChart, { ...props, comparison: amountOnly, stockOnly: true, initialTooltipOpen: true });
  assert.match(html, /\+\$100\.00/);
  assert.match(html, />--<\/small>/);
});

test('stock-only markers keep real same-day records and the existing independent click target', () => {
  const marker = { date: '2026-09-03', markerDate: '2026-09-03', side: 'mixed', records: [{ id: 'buy-cycle' }, { id: 'sell-cycle' }] };
  let selected;
  const { tree } = render(ComparisonChart, { ...props, comparison: stockCycle(), stockOnly: true, mode: 'percent', tradeMarkers: [marker], onSelectTradeMarker: value => { selected = value; } });
  const button = nodes(tree, node => node.props['data-stock-comparison-trade-marker'])[0];
  assert.ok(button);
  let stopped = false;
  button.props.onPointerDown({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  const previousWindow = globalThis.window;
  globalThis.window = { clearTimeout() {} };
  try { button.props.onClick({ stopPropagation() {} }); } finally { globalThis.window = previousWindow; }
  assert.equal(selected, marker);
  assert.equal(selected.records, marker.records);
  assert.equal(nodes(tree, node => node.props['data-stock-return-comparison-chart'])[0].props.style.touchAction, 'pan-y');
});
