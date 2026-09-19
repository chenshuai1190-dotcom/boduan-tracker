import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const pageUrl = new URL('../src/pages/WatchlistStockDetailPage.jsx', import.meta.url);
const macroUrl = new URL('../src/components/MacroHistoryChart.jsx', import.meta.url);
const pageSource = readFileSync(pageUrl, 'utf8');
const cache = new Map();

// Compile the real component graph, omitting only CSS imports for Node SSR.
async function compile(url) {
  if (cache.has(url.href)) return cache.get(url.href);
  const loading = (async () => {
    const source = readFileSync(url, 'utf8').replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
    let { code } = await transformWithOxc(source, url.pathname, { jsx: { runtime: 'classic' } });
    for (const match of [...code.matchAll(/(from\s+)(['"])([^'"]+)\2/g)].reverse()) {
      const resolved = match[3].startsWith('.') ? new URL(match[3], url) : null;
      const target = resolved?.pathname.endsWith('.jsx') ? await compile(resolved) : resolved?.href || import.meta.resolve(match[3]);
      code = code.slice(0, match.index) + match[1] + JSON.stringify(target) + code.slice(match.index + match[0].length);
    }
    return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  })();
  cache.set(url.href, loading);
  return loading;
}

const { PriceChart } = await import(await compile(pageUrl));
const { default: MacroHistoryChart } = await import(await compile(macroUrl));
const geometrySource = pageSource.match(/^function chartGeometry\([\s\S]*?^\}/m)?.[0];
assert.ok(geometrySource);
const geometry = new Function('CHART_WIDTH', 'CHART_HEIGHT', 'SHORT_DAILY_MAS', `return (${geometrySource});`)(
  352, 308, [{ key: 'ma30', period: 30 }, { key: 'ma60', period: 60 }],
);

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}

function render(Component, props) {
  let tree;
  function Capture() { tree = Component(props); return tree; }
  const html = renderToStaticMarkup(React.createElement(Capture));
  return { tree, html };
}

const history = [
  { date: '2026-09-16', value: -0.18 },
  { date: '2026-09-17', value: -0.13 },
  { date: '2026-09-18', value: -0.10 },
];
const rateMetric = { id: 'real10y', name: '实际利率', unit: 'percent', changeUnit: 'bp', history };

function macroChart(metric = rateMetric, range = '1m', language = 'zh') {
  const wrapper = render(MacroHistoryChart, { metric, range, language });
  return { ...wrapper, chart: nodes(wrapper.tree, node => node.type === PriceChart)[0] };
}

test('stock geometry keeps its default zero floor, overlays, and original scale', () => {
  const rows = [{ date: '2026-09-16', close: 0 }, { date: '2026-09-18', close: 100 }];
  const chart = geometry(rows, []);
  assert.deepEqual(chart, geometry(rows, [], [], [], false));
  assert.equal(chart.priceLines[0].value, 108);
  assert.equal(chart.priceLines.at(-1).value, 0);
  assert.equal(chart.pricePoints[0].y, 283);
  assert.equal(chart.pricePath, 'M 4.00 283.00 L 348.00 37.63');
  const overlays = geometry(rows, [{ date: '2026-09-18', ma200: 120 }], [], [{ date: '2026-09-18', ma30: 140 }]);
  assert.equal(overlays.maPoints[0].ma200, 120);
  assert.equal(overlays.shortDailyMaSeries[0].points[0].ma30, 140);
  assert.ok(overlays.priceLines[0].value > 140);
});

test('the optional negative domain fits both entirely negative and zero-crossing macro histories', () => {
  for (const values of [[-0.18, -0.13, -0.10], [-20, 0, 17]]) {
    const rows = history.map((point, index) => ({ date: point.date, close: values[index] }));
    const chart = geometry(rows, [], [], [], true);
    assert.ok(chart.priceLines.at(-1).value < Math.min(...values));
    assert.ok(chart.priceLines[0].value > Math.max(...values));
    assert.doesNotMatch(chart.pricePath, /NaN|Infinity/);
    for (const point of chart.pricePoints) assert.ok(point.y >= chart.top && point.y <= 308 - chart.bottom);
  }
});

test('the macro wrapper renders the same PriceChart component with stable empty MA inputs', () => {
  const first = macroChart();
  const second = macroChart();
  assert.ok(first.chart, 'the actual wrapper tree must contain the real exported stock chart');
  assert.deepEqual(first.chart.props.rows, history.map(({ date, value }) => ({ date, close: value })));
  assert.equal(first.chart.props.dailyRows, first.chart.props.weeklyRows);
  assert.equal(first.chart.props.weeklyLookupRows, second.chart.props.weeklyLookupRows);
  assert.deepEqual(first.chart.props.dailyRows, []);
  assert.equal(first.chart.props.priceColor, '#b2b2bb');
  assert.match(first.html, /data-watchlist-price-line="range-direction"/);
  assert.match(first.html, /美国10年期国债实际收益率历史走势/);
  assert.match(first.html, /-0\.19%/);
  assert.doesNotMatch(first.html, /linearGradient|breathe|watchlist-stock-detail-area|data-watchlist-(?:daily|weekly|short-daily)-ma-line/);
  assert.doesNotMatch(first.html, /MA200|MA30|股价|收盘|\$/);
  assert.doesNotMatch(readFileSync(macroUrl, 'utf8'), /<svg|<path|chartGeometry\(/, 'the wrapper must not fork the renderer');
});

test('the original stock presentation still renders area, endpoint animation, currency, and MA readouts', () => {
  const rows = history.map((point, index) => ({ date: point.date, close: 100 + index * 5, ma200: 90 + index }));
  const { html } = render(PriceChart, {
    rows, dailyRows: rows, weeklyRows: [], weeklyLookupRows: [], range: '1m',
    currency: 'USD', language: 'zh', symbol: 'META', priceColor: '#22c55e', initialTooltipOpen: true,
  });
  assert.match(html, /linearGradient/);
  assert.match(html, /watchlist-stock-price-breathe-ring/);
  assert.match(html, /\$105\.00/);
  assert.match(html, /收盘|MA200/);
  assert.match(html, /data-watchlist-daily-ma-line="true"/);
  assert.match(html, /2026\/09\/17 · 收盘/);
  assert.match(html, />9\/16<\/text>/);
  assert.doesNotMatch(html, /2026年|9月16日/);
});

test('macro tooltips show observed values and correct rate-bp, spread-bp, dollar, and relative-change units', () => {
  const fixtures = [
    [rateMetric, /-0\.13%/, /\+5(?:\.0)? bp/],
    [{ ...rateMetric, id: 'spread', name: '利差', unit: 'bp', history: history.map((point, index) => ({ ...point, value: [-20, -15, 17][index] })) }, /-15 bp/, /\+5 bp/],
    [{ ...rateMetric, id: 'oil', name: 'WTI', unit: 'usd', changeUnit: 'percent', history: history.map((point, index) => ({ ...point, value: [100, 110, 115][index] })) }, /\$110\.00/, /\+10\.00%/],
    [{ ...rateMetric, id: 'tga', name: 'TGA', unit: 'usdBn', changeUnit: 'usdBn', history: history.map((point, index) => ({ ...point, value: [700, 712, 720][index] })) }, /\$712\.0B/, /\+\$12\.0B/],
  ];
  for (const [metric, value, change] of fixtures) {
    const { chart } = macroChart(metric);
    const { html } = render(PriceChart, { ...chart.props, initialTooltipOpen: true });
    assert.match(html, value);
    assert.match(html, change);
    assert.match(html, /较上次观测/);
    assert.doesNotMatch(html, /MA200|MA30|当日涨跌|周涨跌|收盘|股价/);
  }
  const { chart } = macroChart(rateMetric, '1m', 'en');
  const tooltip = renderToStaticMarkup(chart.props.presentation.renderTooltip(chart.props.rows[0], null));
  assert.match(tooltip, /Since previous observation/);
  assert.match(tooltip, /—/);
  assert.doesNotMatch(tooltip, /0 bp/);
});

test('macro range slicing uses the supplied history and preserves the existing five-year zoom affordance', () => {
  const longHistory = Array.from({ length: 120 }, (_, index) => ({
    date: new Date(Date.UTC(2021, index, 18)).toISOString().slice(0, 10), value: index - 60,
  }));
  const metric = { ...rateMetric, history: longHistory };
  const month = macroChart(metric, '1m');
  assert.equal(month.chart, undefined, 'one observation uses the explicit macro empty state');
  assert.match(month.html, /暂无足够的历史观测/);
  const fiveYears = macroChart(metric, '5y');
  assert.equal(fiveYears.chart.props.range, '5y');
  assert.equal(fiveYears.chart.props.rows.length, 60);
  assert.equal(fiveYears.chart.props.rows.at(-1).close, 59);
  assert.match(fiveYears.html, /data-watchlist-stock-chart-pinch="enabled"/);
  assert.match(fiveYears.html, /data-watchlist-stock-chart-viewport="full"/);
  assert.equal(fiveYears.chart.props.weeklyRows.length, 0, 'a long macro range must not create stock weekly averages');
});

test('missing macro observations retain an explicit empty state rather than a zero-valued plot', () => {
  for (const missing of [[], [{ date: '2026-09-18', value: null }], [{ date: '2026-09-18', value: 0 }]]) {
    const { html, chart } = macroChart({ ...rateMetric, history: missing }, '1m', 'en');
    assert.equal(chart, undefined);
    assert.match(html, /Not enough historical observations/);
    assert.doesNotMatch(html, /<svg|MA200|收盘|0\.00%/);
  }
});

test('macro tooltip dates are Chinese and Treasury labels retain their complete yield names', () => {
  for (const years of [2, 5, 10, 30]) {
    const { chart } = macroChart({ ...rateMetric, id: `us${years}y`, name: `US ${years}Y` });
    const { html } = render(PriceChart, { ...chart.props, initialTooltipOpen: true });
    assert.ok(html.includes(`2026年9月17日 · 美国${years}年期国债收益率`));
    assert.ok(html.includes(`美国${years}年期国债收益率历史走势`));
    assert.doesNotMatch(html, /2026\/09\/17|>9\/16<\/text>/);
    assert.match(html, />9月16日<\/text>/);
  }
});

test('only macro tooltip changes use red-up and green-down while zero, missing, and the curve remain neutral', () => {
  const { chart } = macroChart();
  for (const [current, previous, color] of [[2, 1, '#ff4b1f'], [1, 2, '#22c55e'], [1, 1, undefined], [1, null, undefined]]) {
    const tooltip = chart.props.presentation.renderTooltip({ close: current }, previous === null ? null : { close: previous });
    const change = nodes(tooltip, node => node.type === 'span' && node.props.className === 'whitespace-nowrap tabular-nums')[0];
    assert.equal(change.props.style.color, color);
    if (previous === null) assert.equal(change.props.children, '—');
  }
  const { tree } = render(PriceChart, { ...chart.props, initialTooltipOpen: true });
  const line = nodes(tree, node => node.props['data-watchlist-price-line'] === 'range-direction')[0];
  assert.equal(line.props.stroke, '#b2b2bb');
});

function dateTicks(tree) {
  return nodes(tree, node => node.type === 'text' && node.props.y === 305).map(node => ({
    label: node.props.children, x: node.props.x, anchor: node.props.textAnchor,
  }));
}

test('macro axes adapt Chinese day, month, and year labels to the visible period', () => {
  const monthHistory = length => Array.from({ length }, (_, index) => ({
    date: new Date(Date.UTC(2021, index, 18)).toISOString().slice(0, 10), value: index,
  }));
  for (const [length, expected] of [[12, /^\d+月\d+日$/], [24, /^\d{4}年\d+月$/], [60, /^\d{4}年$/]]) {
    const { chart } = macroChart({ ...rateMetric, history: monthHistory(length) }, '5y');
    const { tree } = render(PriceChart, chart.props);
    const ticks = dateTicks(tree);
    assert.ok(ticks.length >= 2);
    for (const tick of ticks) assert.match(tick.label, expected);
  }
});

test('longer Chinese axis dates leave space between labels even around a weekend gap', () => {
  const unevenHistory = ['2026-09-11', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17']
    .map((date, index) => ({ date, value: index }));
  const { chart } = macroChart({ ...rateMetric, history: unevenHistory }, '1w');
  const { tree } = render(PriceChart, chart.props);
  const ticks = dateTicks(tree);
  assert.equal(ticks[0].label, '9月11日');
  assert.equal(ticks.at(-1).label, '9月17日');
  assert.ok(ticks.length < 5, 'crowded labels should be omitted, not squeezed together');
  let previousRight = -Infinity;
  for (const tick of ticks) {
    const width = [...tick.label].reduce((sum, character) => sum + (/\d/.test(character) ? 6 : 10), 0);
    const left = tick.anchor === 'start' ? tick.x : tick.anchor === 'end' ? tick.x - width : tick.x - width / 2;
    assert.ok(left - previousRight >= 10);
    previousRight = left + width;
  }
});
