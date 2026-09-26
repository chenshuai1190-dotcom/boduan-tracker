import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { buildStockDetailViewModel } from '../src/lib/stockDetailViewModel.js';
import { buildStockReturnComparison } from '../src/lib/stockReturnComparison.js';
import { marketHexColor, marketTextClass } from '../src/lib/marketColorMode.js';

const pageUrl = new URL('../src/pages/StockDetailPage.jsx', import.meta.url);
const comparisonUrl = new URL('../src/components/StockReturnComparisonCard.jsx', import.meta.url);
const moduleCache = new Map();
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

test('stock detail matches drawdown gutters without double padding in production or preview', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const stockCss = read('src/pages/StockDetailPage.css');
  const drawdownCss = read('src/components/DrawdownObservation.css');
  const app = read('src/App.jsx');
  const preview = read('src/DevVisualPreview.jsx');
  const stockRoot = stockCss.match(/\.stock-detail-report\s*\{([^}]+)\}/)?.[1];
  const drawdownRoot = drawdownCss.match(/\.do-page\s*\{([^}]+)\}/)?.[1];
  assert.ok(stockRoot && drawdownRoot);
  assert.match(stockRoot, /padding:\s*calc\(12px \+ env\(safe-area-inset-top\)\) 0 calc\(env\(safe-area-inset-bottom\) \+ 86px\);/);
  assert.match(drawdownRoot, /padding:\s*calc\(12px \+ env\(safe-area-inset-top\)\) 0 24px;/);
  assert.equal(stockRoot.match(/max-width:\s*([^;]+);/)?.[1], drawdownRoot.match(/max-width:\s*([^;]+);/)?.[1]);

  const productionFullBleed = app.match(/const isFullBleedPage = ([^;]+);/)?.[1];
  assert.ok(productionFullBleed);
  assert.doesNotMatch(productionFullBleed, /isStockDetailPage|isDrawdownObservationPage/);
  assert.ok(app.includes("${isFullBleedPage ? 'px-0' : 'px-4'}"), 'both production pages must retain the shared 16px shell gutter');
  const previewFullBleed = preview.match(/\$\{\[([^\]]+)\]\.includes\(activeTab\) \? 'px-0' : 'px-4'\}/)?.[1];
  assert.ok(previewFullBleed);
  assert.doesNotMatch(previewFullBleed, /'stock-detail'|'drawdown-observation'/, 'preview must not hide a production gutter mismatch');

  const standalonePages = app.match(/const isStandalonePage = ([^;]+);/)?.[1];
  assert.ok(standalonePages?.includes('isStockDetailPage'));
  assert.ok(app.includes("paddingTop: isStandalonePage ? 0 :"), 'production standalone pages must own their safe-area spacing');
  const previewTopInsetOwners = preview.match(/paddingTop:\s*\[([^\]]+)\]\.includes\(activeTab\) \? 0 :/)?.[1];
  assert.ok(previewTopInsetOwners?.includes("'stock-detail'"), 'stock detail preview must not hide a missing page safe area');
  assert.ok(previewTopInsetOwners.includes("'drawdown-observation'"));
});

// Compile the real JSX graph for SSR. Only CSS loading is omitted; financial
// helpers, React state initialization and nested report components stay real.
async function compileModule(url, reactOverride = null) {
  const cacheKey = `${url.href}:${reactOverride || ''}`;
  if (moduleCache.has(cacheKey)) return moduleCache.get(cacheKey);
  const loading = (async () => {
    let source = readFileSync(url, 'utf8').replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
    if (url.href === pageUrl.href) source += '\nexport { PnlSparkline, buildLineChart };';
    if (url.href === comparisonUrl.href) source += '\nexport { SharePreview };';
    const transformed = await transformWithOxc(source, url.pathname, { jsx: { runtime: 'classic' } });
    let code = transformed.code;
    const imports = [...code.matchAll(/(from\s+)(['"])([^'"]+)\2/g)];
    for (const match of imports.reverse()) {
      const specifier = match[3];
      const resolved = specifier.startsWith('.') ? new URL(specifier, url) : null;
      const target = specifier === 'react' && reactOverride ? reactOverride
        : resolved?.pathname.endsWith('.jsx')
          ? await compileModule(resolved)
          : resolved?.href || import.meta.resolve(specifier);
      code = code.slice(0, match.index) + match[1] + JSON.stringify(target) + code.slice(match.index + match[0].length);
    }
    return moduleUrl(`${code}\n//# sourceURL=${url.href}`);
  })();
  moduleCache.set(cacheKey, loading);
  return loading;
}

const { default: StockDetailPage, PnlSparkline, buildLineChart } = await import(await compileModule(pageUrl));
const { default: StockReturnComparisonCard, ComparisonChart, SharePreview } = await import(await compileModule(comparisonUrl));

// Only the page's hooks are controlled. Its view model, fetched snapshot facts,
// child chart and event components stay real so chart/headline agreement is
// checked after the actual asynchronous snapshot-loading effect completes.
const pageHooksUrl = moduleUrl(`
import React from ${JSON.stringify(import.meta.resolve('react'))};
let slots = [], cursor = 0, effects = [];
export function reset() { for (const slot of slots) slot?.cleanup?.(); slots = []; effects = []; }
export function render(Component, props) { cursor = 0; return Component(props); }
export async function flush() { for (const job of effects.splice(0)) { job.slot.cleanup?.(); job.slot.cleanup = job.effect(); } await new Promise(resolve => setImmediate(resolve)); }
function useState(initial) { const slot = slots[cursor++] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; }
function useEffect(effect, deps) { const index = cursor++, previous = slots[index]; if (previous && deps && deps.every((value, i) => Object.is(value, previous.deps[i]))) return; const slot = slots[index] = { deps, cleanup: previous?.cleanup }; effects.push({ slot, effect }); }
function useMemo(factory) { cursor++; return factory(); }
function useRef(initial) { return slots[cursor++] ||= { current: initial }; }
export default { ...React, useState, useEffect, useMemo, useRef, useCallback: (callback) => { cursor++; return callback; } };
`);
const pageHooks = await import(pageHooksUrl);
const { default: InteractiveStockDetailPage } = await import(await compileModule(pageUrl, pageHooksUrl));

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}

function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(text).join('');
}

function render(Component, props) {
  let tree;
  function Capture() { tree = Component(props); return tree; }
  const warnings = [];
  const originalError = console.error;
  let html;
  try {
    console.error = (...args) => warnings.push(String(args[0]));
    html = renderToStaticMarkup(React.createElement(Capture));
  } finally {
    console.error = originalError;
  }
  // The shared client-only modal deliberately uses layout effects. SSR cannot
  // exercise those effects; any unrelated React warning is still a failure.
  assert.ok(warnings.every(message => message.startsWith('Warning: useLayoutEffect does nothing on the server')), warnings.join('\n'));
  return { tree, html };
}

function comparisonFixture(finalPrice = 150) {
  const view = buildStockDetailViewModel({
    symbol: 'NVDA', range: 'all', now: new Date('2026-07-01T22:00:00Z'),
    stockTrades: [{ id: 'buy', trade_date: '2026-06-01', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', shares: 10, price: 100 }],
    symbolSnapshots: [['2026-06-01', 100], ['2026-06-30', finalPrice]].map(([snapshotDate, price]) => ({
      snapshotDate, symbol: 'NVDA', name: 'NVIDIA', heldShares: 10, avgCostUsd: 100,
      currentPriceUsd: price, marketValueUsd: price * 10, totalBuyCostUsd: 1000,
      realizedPnlUsd: 0, unrealizedPnlUsd: (price - 100) * 10,
      cumulativePnlUsd: (price - 100) * 10, dailyPnlUsd: (price - 100) * 10,
    })),
  });
  const comparison = buildStockReturnComparison(view,
    [{ date: '2026-06-01', rawClose: 100 }, { date: '2026-06-30', rawClose: 110 }],
    [{ date: '2026-06-01', rawClose: 100 }, { date: '2026-06-30', rawClose: finalPrice }]);
  assert.equal(comparison.available, true, 'SSR fixtures must pass the actual comparison integrity boundary');
  return { view, comparison };
}

function comparisonProps(overrides = {}) {
  return { comparison: comparisonFixture().comparison, symbol: 'NVDA', language: 'zh', displayCurrency: 'USD', displayRate: 1, marketColorMode: 'redUpGreenDown', ...overrides };
}

test('real comparison metrics keep exact USD and fractional-rate CNY amounts without scaling percentages', () => {
  for (const [displayCurrency, displayRate, expected] of [
    ['USD', 1, ['+$500.00', '+$100.00', '+$400.00']],
    ['CNY', 7.1234, ['+¥3,561.70', '+¥712.34', '+¥2,849.36']],
  ]) {
    const { tree, html } = render(StockReturnComparisonCard, comparisonProps({ displayCurrency, displayRate }));
    for (const amount of expected) assert.ok(html.includes(amount), `${displayCurrency} must show ${amount}`);
    for (const pct of ['+50.00%', '+10.00%', '+40.00%']) assert.ok(html.includes(pct), 'display FX must never scale a rate');
    const metrics = nodes(tree, node => node.props.metric).map(node => node.props.metric);
    assert.deepEqual(metrics, ['mine', 'benchmark', 'excess']);
    assert.doesNotMatch(html, /NaN|Infinity/);
  }
});

test('comparison lines respect profit direction in both preferences while QQQ remains neutral and dashed', () => {
  for (const finalPrice of [150, 80]) {
    const { comparison } = comparisonFixture(finalPrice);
    for (const marketColorMode of ['redUpGreenDown', 'greenUpRedDown']) {
      const { tree } = render(ComparisonChart, comparisonProps({ comparison, marketColorMode }));
      const mine = nodes(tree, node => node.props['data-stock-comparison-mine-path'] !== undefined);
      const benchmark = nodes(tree, node => node.props['data-stock-comparison-benchmark-path'] !== undefined);
      assert.equal(mine.length, 1);
      assert.equal(benchmark.length, 1);
      assert.ok(mine[0].props.d && benchmark[0].props.d);
      assert.equal(mine[0].props.stroke, marketHexColor(comparison.stockPnlUsd, marketColorMode));
      assert.equal(benchmark[0].props.stroke, '#85858f');
      assert.equal(benchmark[0].props.strokeDasharray, '4 4');
      assert.equal(nodes(tree, node => node.props['data-stock-return-comparison-chart'] !== undefined)[0].props.style.touchAction, 'pan-y');
    }
  }
});

test('unavailable, loading and failed comparisons do not invent metrics or enable sharing', () => {
  for (const [overrides, message] of [
    [{ comparison: { available: false } }, '双方没有足够的同周期正式收盘数据'],
    [{ comparison: null, loading: true }, '正在读取个股与 QQQ 普通收盘价'],
    [{ comparison: null, error: 'benchmark_rows_missing' }, '收益对比暂不可用'],
  ]) {
    const { tree, html } = render(StockReturnComparisonCard, comparisonProps(overrides));
    assert.ok(html.includes(message));
    assert.equal(nodes(tree, node => node.props.metric).length, 0);
    assert.doesNotMatch(html, /data-stock-comparison-metric=|data-stock-comparison-mine-path/);
    const share = nodes(tree, node => node.type === 'button' && node.props['aria-label'] === '打开收益对比分享预览');
    assert.equal(share.length, 1);
    assert.equal(share[0].props.disabled, true);
  }
});

test('chart geometry uses one responsive coordinate system and exact full-precision report metrics', () => {
  const { view } = comparisonFixture();
  const displayRate = 7.1234;
  const points = view.trend.map(point => ({ ...point, pnlUsd: point.pnlUsd * displayRate }));
  for (const width of [320, 398, 728]) {
    const chart = buildLineChart(points, { width, startDate: view.axisStartDate, endDate: view.axisEndDate });
    assert.equal(chart.width, width);
    assert.equal(chart.height, 292);
    assert.equal(chart.points[0].x, chart.plotLeft);
    assert.equal(chart.points.at(-1).x, chart.plotRight);
    assert.ok(chart.points.every(point => point.x >= chart.plotLeft && point.x <= chart.plotRight && point.y >= chart.plotTop && point.y <= chart.plotBottom));
  }
  const { tree, html } = render(PnlSparkline, {
    points, color: marketHexColor(500, 'redUpGreenDown'), emptyText: '暂无足够快照',
    startDate: view.axisStartDate, endDate: view.axisEndDate, currencyMode: 'CNY',
    marketColorMode: 'redUpGreenDown', displayRate, language: 'zh', trendStats: view.trendStats,
  });
  const metrics = nodes(tree, node => node.props.className?.split(' ').includes('stock-detail-pnl-metric-value'));
  assert.equal(text(metrics[0]), '+¥3,561.70');
  assert.ok(metrics[0].props.className.includes(marketTextClass(500, 'redUpGreenDown')));
  assert.equal(nodes(tree, node => node.type === 'svg')[0].props.preserveAspectRatio, 'none');
  assert.ok(html.includes('height:292px'));
  assert.doesNotMatch(html, /#f6b54b|#ffd18a|NaN|Infinity/);
});

test('empty P&L chart keeps all four missing readings unavailable instead of fabricating zero returns', () => {
  const { tree, html } = render(PnlSparkline, { points: [], color: '#85858f', emptyText: '暂无足够快照', startDate: '2026-06-01', endDate: '2026-06-30', currencyMode: 'USD', marketColorMode: 'redUpGreenDown', displayRate: 1, language: 'zh', trendStats: {} });
  assert.ok(html.includes('暂无足够快照'));
  const metrics = nodes(tree, node => node.props.className?.split(' ').includes('stock-detail-pnl-metric-value'));
  assert.deepEqual(metrics.map(text), ['--', '--', '--', '--']);
  assert.equal(nodes(tree, node => node.type === 'path').length, 0);
});

test('method and share previews render the shared neutral dialog without introducing a ledger action', () => {
  const method = render(StockReturnComparisonCard, comparisonProps({ initialMethodOpen: true }));
  assert.match(method.html, /stock-report-modal/);
  assert.match(method.html, /data-stock-comparison-method-dialog/);
  const share = render(SharePreview, comparisonProps({ onClose: () => {} }));
  assert.match(share.html, /stock-report-modal/);
  assert.match(share.html, /data-stock-comparison-share-dialog/);
  assert.match(share.html, /固定起点 · 仅当前存续仓位/);
  assert.doesNotMatch(method.html + share.html, /复制对比文字|确认买入|确认卖出|删除交易/);
});

test('stock detail initial render preserves unavailable headline and the read-only formal-trade facts', () => {
  let externalCalls = 0;
  let reportOpens = 0;
  const failIfCalled = () => { externalCalls += 1; throw new Error('SSR must not fetch or save'); };
  const { tree, html } = render(StockDetailPage, { ctx: {
    stockDetailSymbol: 'NVDA', stockDetailInitialRange: 'all', language: 'zh',
    portfolioCurrencyMode: 'CNY', usdRate: 7.1234, marketColorMode: 'redUpGreenDown',
    stockTrades: [
      { id: 'buy', symbol: 'NVDA', trade_date: '2026-06-01', side: 'buy', shares: 10, price: 100 },
      { id: 'sell', symbol: 'NVDA', trade_date: '2026-06-30', side: 'sell', shares: 2, price: 130 },
    ],
    watchlist: [{ symbol: 'NVDA', targetPriceUsd: 180 }],
    db: { fetchPnlReportSymbolSnapshotHistory: failIfCalled },
    openStockPnlReport: () => { reportOpens += 1; },
    fetchPnlBenchmarkRows: failIfCalled, saveWatchlistStockTarget: failIfCalled,
  } });
  assert.match(html, /stock-detail-report/);
  assert.match(html, /data-stock-detail-summary-card="true"/);
  assert.match(html, /累积总收益/);
  assert.match(html, /暂无足够的本轮收盘记录/);
  assert.doesNotMatch(html, /QQQ|当前持仓对比|胜出.*天数/);
  const chartNode = nodes(tree, node => node.type === ComparisonChart)[0];
  assert.equal(chartNode.props.stockOnly, true);
  assert.deepEqual(chartNode.props.comparison.trend, []);
  assert.equal(chartNode.props.comparison.available, false);
  const headline = nodes(tree, node => node.props['data-stock-detail-total-pnl'] !== undefined);
  assert.equal(headline.length, 1);
  assert.equal(text(headline[0]), '--', 'missing snapshots must not become a zero headline');
  const fullReportLink = nodes(tree, node => node.props['data-stock-full-pnl-report-link'] !== undefined);
  assert.equal(fullReportLink.length, 1);
  assert.match(text(fullReportLink[0]), /完整收益报表/);
  fullReportLink[0].props.onClick();
  assert.equal(reportOpens, 1, 'the report affordance opens the independent full-history page even before a closing snapshot exists');
  for (const label of ['已实现盈亏', '未实现盈亏', '持仓数量']) {
    const readings = nodes(tree, node => node.props.label === label);
    assert.equal(readings.length, 1);
    assert.equal(readings[0].props.value, '--', `missing ${label} must stay unavailable`);
  }
  assert.ok(html.includes('¥7,123.40'), 'buy amount should retain precise fractional CNY conversion');
  assert.ok(html.includes('¥1,852.08'), 'sell amount should retain precise fractional CNY conversion');
  assert.ok(html.includes('+¥427.40'), 'formal realized sell P&L should retain precise fractional CNY conversion');
  assert.match(html, /stock-trade-events/);
  assert.equal((html.match(/class="ste-event"/g) || []).length, 2, 'both formal trades remain reachable in the new event list');
  for (const date of ['2026-06-01', '2026-06-30']) assert.ok(html.includes(date));
  assert.ok(html.includes('$130.00'), 'execution prices remain USD while trade amounts use CNY');
  const target = nodes(tree, node => node.props['data-stock-detail-target-plan'] !== undefined);
  assert.equal(target.length, 1);
  assert.equal(target[0].props.disabled, false, 'the isolated watchlist target saver remains reachable');
  assert.ok(text(target[0]).includes('$180.00'));
  assert.equal(externalCalls, 0);
});

test('loaded stock detail keeps monetary cycle totals and quality while range changes never rebase returns or depend on a benchmark', async () => {
  pageHooks.reset();
  const stockTrades = [
    { id: 'cycle-buy', trade_date: '2026-04-01', symbol: 'NVDA', side: 'buy', shares: 10, price: 100 },
    { id: 'cycle-sell', trade_date: '2026-06-30', symbol: 'NVDA', side: 'sell', shares: 2, price: 130 },
  ];
  const snapshots = [
    ['2026-04-01', 100, 10, 0], ['2026-05-15', 120, 10, 0], ['2026-06-15', 150, 10, 0], ['2026-06-30', 130, 8, 60],
  ].map(([snapshotDate, price, shares, realized]) => ({
    snapshotDate, symbol: 'NVDA', heldShares: shares, avgCostUsd: 100, currentPriceUsd: price,
    marketValueUsd: shares * price, totalBuyCostUsd: 1000, realizedPnlUsd: realized,
    unrealizedPnlUsd: (price - 100) * shares, cumulativePnlUsd: realized + (price - 100) * shares,
  }));
  const expected = buildStockDetailViewModel({ symbol: 'NVDA', stockTrades, symbolSnapshots: snapshots, range: 'all' }).cycleReview;
  assert.equal(expected.available, true, 'the fixture must pass the real completed-cycle integrity checks');
  assert.equal(expected.currentTotalPnlUsd, 300, 'the cycle includes $60 realized plus $240 unrealized, not a surviving-position comparison');
  let snapshotReads = 0, benchmarkReads = 0;
  const ctx = {
    stockDetailSymbol: 'NVDA', stockDetailInitialRange: 'all', stockTrades,
    portfolioCurrencyMode: 'USD', marketColorMode: 'redUpGreenDown', language: 'zh',
    db: { async fetchPnlReportSymbolSnapshotHistory(symbol, start) {
      snapshotReads++;
      assert.equal(symbol, 'NVDA');
      assert.equal(start, null);
      return snapshots;
    } },
  };
  for (const property of ['fetchPnlBenchmarkRows', 'supabase']) Object.defineProperty(ctx, property, {
    get() { benchmarkReads++; throw new Error('stock-only detail must not read benchmark providers or auth'); },
  });
  const renderPage = () => pageHooks.render(InteractiveStockDetailPage, { ctx });
  const chartOf = tree => nodes(tree, node => node.type === ComparisonChart)[0];
  try {
    renderPage();
    await pageHooks.flush();
    let tree = renderPage();
    let chart = chartOf(tree);
    assert.equal(snapshotReads, 1);
    assert.equal(benchmarkReads, 0);
    assert.equal(chart.props.stockOnly, true);
    assert.equal(chart.props.mode, 'amount');
    assert.equal(chart.props.comparison.available, true);
    assert.equal(chart.props.comparison.baselineDate, expected.startDate);
    assert.equal(chart.props.comparison.stockPnlUsd, expected.currentTotalPnlUsd);
    assert.equal(chart.props.comparison.stockPnlPct, expected.returnPct);
    assert.deepEqual(chart.props.comparison.trend.map(point => [point.date, point.stockPnlUsd, point.stockPnlPct]),
      expected.trend.map(point => [point.date, point.totalPnlUsd, point.returnPct]));
    assert.equal(text(nodes(tree, node => node.props['data-stock-detail-total-pnl'] !== undefined)[0]), '+$300.00');
    assert.equal(text(nodes(tree, node => node.props.className === 'sdp-pnl-label')[0]), '累积总收益');
    const quality = nodes(tree, node => node.props['data-stock-detail-trade-quality'] !== undefined)[0];
    assert.ok(quality);
    for (const label of ['最大浮盈 MFE', '最大浮亏 MAE', '最大回撤', '利润保留率', '收益最高日期', '收益最低日期', '持仓天数']) {
      assert.equal(nodes(quality, node => node.props.label === label).length, 1, `${label} must remain present`);
    }
    assert.equal(nodes(quality, node => node.type === 'details').length, 0, 'the metric definitions disclosure has been removed');
    const rangeButtons = value => {
      const section = nodes(value, node => node.props['data-stock-detail-pnl-trend-card'] !== undefined)[0];
      assert.equal(nodes(section, node => node.props['aria-label'] === '图表显示方式' || node.props.className === 'sdp-review-mode').length, 0, 'the amount chart has no mode selector');
      const ranges = nodes(section, node => node.type === 'nav')[0];
      return nodes(ranges, node => typeof node.props.onClick === 'function');
    };
    assert.deepEqual(rangeButtons(tree).map(text), ['1个月', '3个月', '6个月', '全部']);
    for (const rangeLabel of ['1个月', '3个月', '6个月', '全部']) {
      rangeButtons(tree).find(node => text(node) === rangeLabel).props.onClick();
      tree = renderPage();
      chart = chartOf(tree);
      assert.equal(chart.props.mode, 'amount');
      assert.equal(chart.props.comparison.baselineDate, '2026-04-01', 'the original cycle baseline survives every display range');
      assert.equal(chart.props.comparison.stockPnlUsd, 300);
      assert.equal(chart.props.comparison.trend.at(-1).stockPnlUsd, 300, 'changing the time range must not rebase the cycle return');
      assert.equal(text(nodes(tree, node => node.props['data-stock-detail-total-pnl'] !== undefined)[0]), '+$300.00');
      const legend = nodes(tree, node => node.props.className === 'sdp-review-legend')[0];
      assert.equal(text(legend), 'NVDA +$300.00', 'the legend always reports the same monetary return as the headline');
      if (rangeLabel === '1个月') {
        assert.deepEqual(chart.props.comparison.trend.map(point => point.date), ['2026-06-15', '2026-06-30']);
        assert.equal(chart.props.comparison.trend[0].stockPnlUsd, 500, 'a trimmed range starts at its original cycle value, not zero');
      } else assert.equal(chart.props.comparison.trend.length, 4);
    }
    const rendered = renderToStaticMarkup(tree);
    assert.match(rendered, /data-stock-comparison-mine-path/);
    assert.doesNotMatch(rendered, /QQQ|当前持仓对比|胜出.*天数|data-stock-comparison-benchmark-path|查看指标口径|图表显示方式/);
    assert.deepEqual(chart.props.tradeMarkers.flatMap(marker => marker.records.map(record => record.id)), ['cycle-buy', 'cycle-sell']);
    ctx.language = 'en';
    assert.deepEqual(rangeButtons(renderPage()).map(text), ['1 month', '3 months', '6 months', 'All']);
    assert.equal(snapshotReads, 1);
    assert.equal(benchmarkReads, 0, 'the ready chart must never wait for a benchmark success');
  } finally {
    pageHooks.reset();
  }
});
