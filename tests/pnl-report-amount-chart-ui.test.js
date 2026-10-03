import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const componentUrl = new URL('../src/components/PnlReportTrendChart.jsx', import.meta.url);
const source = readFileSync(componentUrl, 'utf8').replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
let { code } = await transformWithOxc(source, componentUrl.pathname, { jsx: { runtime: 'classic' } });
for (const match of [...code.matchAll(/(from\s+)(['"])([^'"]+)\2/g)].reverse()) {
  const target = match[3].startsWith('.') ? new URL(match[3], componentUrl).href : import.meta.resolve(match[3]);
  code = code.slice(0, match.index) + match[1] + JSON.stringify(target) + code.slice(match.index + match[0].length);
}
const { default: PnlReportTrendChart } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}

function amountPaths(tree) {
  return nodes(tree, node => node.type === 'path' && Object.hasOwn(node.props, 'data-pnl-amount-sign')
    && node.props['data-pnl-amount-sign'] != null);
}

function assetReadoutValue(readout, label) {
  const cells = React.Children.toArray(readout.props.children);
  const labelIndex = cells.findIndex(cell => React.Children.toArray(cell.props.children).includes(label));
  assert.ok(labelIndex >= 0, `asset readout must include ${label}`);
  assert.equal(cells[labelIndex + 1]?.type, 'span');
  return cells[labelIndex + 1].props.children;
}

function periodHighValue(tree) {
  const rows = nodes(tree, node => node.props.className === 'pnl-trend-high-amount');
  assert.equal(rows.length, 1);
  const row = rows[0];
  const value = nodes(row, node => node.type === 'span').at(-1);
  const caption = nodes(tree, node => node.props.className === 'pnl-trend-high-caption')[0];
  const marker = nodes(tree, node => Object.hasOwn(node.props, 'data-pnl-report-record-high'))[0];
  assert.equal(marker.props['data-record-high-date'], '2026-09-22');
  assert.match(renderToStaticMarkup(caption), / · 2026\/09\/22/);
  const dot = nodes(row, node => node.type === 'i')[0];
  const captionDot = nodes(caption, node => node.type === 'i')[0];
  const halo = nodes(marker, node => node.props.className?.includes?.('quote-pulse-halo'))[0];
  assert.equal(dot.props.style.background, captionDot.props.style.background);
  assert.equal(dot.props.style.background, halo.props.stroke);
  return { row, value, markup: renderToStaticMarkup(row) };
}

function render(data, { currency = 'CNY', rate = 7.2, marketColorMode = 'redUpGreenDown', combined = false, mode = 'amount', language = 'zh' } = {}) {
  let tree;
  function Capture() {
    tree = PnlReportTrendChart({
      data, mode, color: '#ff4b1f', language, marketColorMode,
      displayCurrency: currency, displayRate: rate, showCombinedPersonalReadout: combined,
    });
    return tree;
  }
  const html = renderToStaticMarkup(React.createElement(Capture));
  return { tree, html };
}

const trend = [
  { date: '2026-09-20', label: '2026/09', pnlUsd: -10000, dailyPnlUsd: -10000, benchmarkPct: 0.1 },
  { date: '2026-09-21', label: '2026/09', pnlUsd: -5000, dailyPnlUsd: 5000, benchmarkPct: 0.2 },
  { date: '2026-09-22', label: '2026/09', pnlUsd: 2000, dailyPnlUsd: 7000, benchmarkPct: 0.3 },
  { date: '2026-09-23', label: '2026/09', pnlUsd: 1000, dailyPnlUsd: -1000, benchmarkPct: 0.4 },
];

test('amount trend renders a zero line, only my P&L line, and currency-aware daily and period readings', () => {
  const { tree, html } = render(trend);
  assert.match(html, /data-pnl-report-amount-tooltip="true"/);
  assert.match(html, /当日盈亏/);
  assert.match(html, /区间累计/);
  assert.match(html, /-¥7,200\.00/);
  assert.match(html, /\+¥7,200\.00/);
  assert.match(html, /\d\.\d万/, 'large Chinese axis amounts use 万');
  assert.equal(nodes(tree, node => node.props.className === 'pnl-trend-zero-line').length, 1);
  assert.equal(nodes(tree, node => node.props.className === 'pnl-trend-zero-label').length, 1);
  assert.equal(nodes(tree, node => node.type === 'path' && node.props.stroke === '#789ac0').length, 0, 'amounts have no benchmark');
  assert.deepEqual(amountPaths(tree).map(node => node.props.stroke), ['#34d399', '#ff4b1f']);
  const readout = nodes(tree, node => node.props['data-pnl-report-amount-tooltip'])[0];
  const readingClasses = React.Children.toArray(readout.props.children).map(child => child.props.className).filter(Boolean);
  assert.ok(readingClasses[0].includes('text-[#34d399]'), 'negative daily P&L follows the market color preference');
  assert.ok(readingClasses[1].includes('text-[#ff4b1f]'), 'positive cumulative P&L follows the market color preference');

  const usd = render(trend, { currency: 'USD', rate: 1 });
  assert.match(usd.html, /-\$1,000\.00/);
  assert.match(usd.html, /\+\$1,000\.00/);
  const greenUp = render(trend, { marketColorMode: 'greenUpRedDown' }).tree;
  const greenUpReadout = nodes(greenUp, node => node.props['data-pnl-report-amount-tooltip'])[0];
  const greenUpClasses = React.Children.toArray(greenUpReadout.props.children).map(child => child.props.className).filter(Boolean);
  assert.ok(greenUpClasses[0].includes('text-[#ff4b1f]'));
  assert.ok(greenUpClasses[1].includes('text-[#34d399]'));
});

test('positive amount period high shows its cumulative amount with the shared pulse marker', () => {
  const positive = render(trend).tree;
  const [marker] = nodes(positive, node => Object.hasOwn(node.props, 'data-pnl-report-record-high'));
  assert.equal(marker.props['data-pnl-report-record-high'], 'pnlUsd');
  assert.equal(marker.props['data-record-high-date'], '2026-09-22');
  assert.equal(nodes(marker, node => node.props.className?.includes?.('quote-pulse-halo')).length, 1);
  const amountMarkup = tree => {
    const amounts = nodes(tree, node => node.props.className === 'pnl-trend-high-amount');
    assert.equal(amounts.length, 1);
    return renderToStaticMarkup(amounts[0]);
  };
  const cny = amountMarkup(positive);
  assert.match(cny, /盈亏新高当日金额 · /);
  assert.match(cny, /\+¥14,400\.00/);
  assert.doesNotMatch(cny, /¥7,200\.00|¥50,400\.00/,
    'the high uses cumulative P&L of 2,000 USD, not the final 1,000 USD or high-day daily P&L of 7,000 USD');
  assert.match(cny, /text-\[#ff4b1f\]|color:#ff4b1f/);
  const usd = render(trend, { currency: 'USD', rate: 1, language: 'en', marketColorMode: 'greenUpRedDown' });
  const usdAmount = amountMarkup(usd.tree);
  assert.match(usd.html, /P&amp;L at period high/);
  assert.match(usdAmount, /\+\$2,000\.00/);
  assert.doesNotMatch(usdAmount, /\$1,000\.00|\$7,000\.00/);
  assert.match(usdAmount, /text-\[#34d399\]|color:#34d399/);
  const missingRate = amountMarkup(render(trend, { rate: null }).tree);
  assert.match(missingRate, />--</);
  assert.doesNotMatch(missingRate, /[¥$]|0\.00|NaN|Infinity/,
    'a known USD high without the display exchange rate remains unavailable');
  const lossesOnly = render(trend.slice(0, 2)).tree;
  assert.equal(nodes(lossesOnly, node => Object.hasOwn(node.props, 'data-pnl-report-record-high')).length, 0,
    'a smaller loss is not celebrated as a high');
  assert.equal(nodes(lossesOnly, node => node.props.className === 'pnl-trend-high-amount').length, 0);
});

test('return high shows the peak cumulative rate with compact unsigned percentages and market colors', () => {
  for (const [peak, expected, marketColorMode, expectedClass] of [
    [0.38, '38%', 'redUpGreenDown', 'text-[#ff4b1f]'],
    [0.3825, '38.25%', 'greenUpRedDown', 'text-[#34d399]'],
    [0.38256, '38.26%', 'redUpGreenDown', 'text-[#ff4b1f]'],
    [-0.1, '-10%', 'redUpGreenDown', 'text-[#34d399]'],
    [0, '0%', 'redUpGreenDown', 'text-[#ff4b1f]'],
  ]) {
    const data = trend.map((point, index) => ({
      ...point, pnlPct: [peak - 0.2, peak - 0.1, peak, peak - 0.05][index],
      dailyPnlPct: 0.07, benchmarkPct: [0.5, 0.6, 0.7, 0.8][index],
    }));
    const { tree } = render(data, { mode: 'pnl', marketColorMode, rate: null });
    const { value, markup } = periodHighValue(tree);
    assert.match(markup, /收益率区间新高 · /);
    assert.equal(value.props.children, expected,
      'use the cumulative return peak, not the final return, daily return, or benchmark');
    assert.equal(value.props.className, expectedClass);
    assert.doesNotMatch(markup, /[+¥$]|NaN|Infinity/);
  }
});

test('asset high shows the net asset peak in the display currency with fixed net asset color', () => {
  for (const { peak = 130.25, currency, rate, marketColorMode = 'redUpGreenDown', expected } of [
    { currency: 'CNY', rate: 7.2, expected: '¥937.80' },
    { currency: 'USD', rate: 1, marketColorMode: 'greenUpRedDown', expected: '$130.25' },
    { peak: -10.25, currency: 'USD', rate: 1, expected: '-$10.25' },
    { currency: 'CNY', rate: null, expected: '--' },
  ]) {
    const data = trend.map((point, index) => ({
      ...point, netAssetUsd: [peak - 30, peak - 20, peak, peak - 10][index],
      totalAssetUsd: [200, 500, 230, 900][index],
    }));
    const { tree } = render(data, { mode: 'assets', currency, rate, marketColorMode });
    const { value, markup } = periodHighValue(tree);
    assert.match(markup, /净资产区间新高 · /);
    assert.equal(value.props.children, expected,
      'use the net asset peak, not the final net asset, total asset high, or P&L');
    assert.doesNotMatch(markup, /\+|NaN|Infinity/);
    if (rate == null) {
      assert.equal(value.props.className, 'pnl-trend-missing');
      assert.doesNotMatch(markup, /[¥$]|0\.00/, 'missing FX must not produce a zero-valued asset high');
    } else {
      const netAssetLine = nodes(tree, node => node.type === 'path' && node.props.stroke === '#ff5038')[0];
      assert.ok(netAssetLine);
      assert.equal(value.props.style.color, netAssetLine.props.stroke);
    }
  }
});

test('asset readout displays unrecorded cash as currency zero without changing the asset values', () => {
  for (const [currency, rate, expected] of [['CNY', 7.2, '¥0.00'], ['USD', 1, '$0.00'], ['CNY', null, '¥0.00']]) {
    const point = Object.freeze({ date: '2026-09-22', totalAssetUsd: 230, netAssetUsd: null, cashKnown: false, cashUsd: 999 });
    const { tree, html } = render([point], { mode: 'assets', currency, rate });
    const [readout] = nodes(tree, node => node.props.className === 'pnl-trend-asset-readout');
    assert.equal(assetReadoutValue(readout, '可用现金'), expected, 'unrecorded historical cash displays zero even without an FX rate');
    assert.equal(assetReadoutValue(readout, '净资产'), '--', 'cash display must not manufacture net assets');
    assert.equal(assetReadoutValue(readout, '总资产'), rate == null ? '--' : currency === 'USD' ? '$230.00' : '¥1,656.00');
    assert.doesNotMatch(html, /该日快照未包含可用现金|Cash was not included/);
    assert.doesNotMatch(html, /该日没有融资负债快照|No margin-debt snapshot/);
    assert.equal(point.cashKnown, false);
    assert.equal(point.cashUsd, 999, 'the display fallback does not rewrite the historical snapshot');
  }
  assert.equal(nodes(render([], { mode: 'assets' }).tree, node => node.props.className === 'pnl-trend-asset-readout').length, 0);
});

test('known asset cash retains its value and reports invalid amounts or unavailable FX separately', () => {
  for (const [cashUsd, rate, expected] of [[125, 7.2, '¥900.00'], [0, 7.2, '¥0.00'], [125, null, '--'], [null, 7.2, '--']]) {
    const { tree } = render([{ date: '2026-09-22', totalAssetUsd: 230, netAssetUsd: 130, cashKnown: true, cashUsd }], { mode: 'assets', rate });
    const [readout] = nodes(tree, node => node.props.className === 'pnl-trend-asset-readout');
    assert.equal(assetReadoutValue(readout, '可用现金'), expected);
  }
});

test('stock personal view pairs daily and cumulative amounts with their return rates without changing the amount line', () => {
  const data = trend.map((point, index) => ({
    ...point, dailyPnlPct: [-0.01, 0.02, 0.03, null][index], pnlPct: [0.04, 0.05, 0.06, 0.07][index],
  }));
  const { tree, html } = render(data, { combined: true });
  assert.match(html, /data-stock-pnl-combined-readout="true"/);
  assert.doesNotMatch(html, /data-pnl-report-amount-tooltip="true"/);
  assert.doesNotMatch(html, /盈亏额走势/, 'the stock chart relies on the existing currency control and amount column');
  assert.match(html, /盈亏金额/);
  assert.match(html, /收益率/);
  assert.match(html, /当日/);
  assert.match(html, /累计/);
  assert.match(html, /-¥7,200\.00/);
  assert.match(html, /\+¥7,200\.00/);
  assert.match(html, /\+7\.00%/);
  assert.match(html, /pnl-trend-missing">--<\/span>/, 'missing daily return stays unknown');
  assert.equal(nodes(tree, node => node.props['data-pnl-report-record-high'] === 'pnlUsd').length, 1);
  assert.equal(nodes(tree, node => node.props.className === 'pnl-trend-zero-line').length, 1);
  assert.deepEqual(amountPaths(tree).map(node => node.props.stroke), ['#34d399', '#ff4b1f']);
});

test('missing amount observations are not plotted as zero or selectable readings', () => {
  const data = [trend[0], { date: '2026-09-21', label: '2026/09', pnlUsd: null, dailyPnlUsd: null }, trend[2]];
  const { tree, html } = render(data);
  const paths = amountPaths(tree);
  assert.equal(paths.length, 2, 'the observed line is split only where its sign changes');
  const endOfLoss = paths[0].props.d.split(' L').at(-1);
  const startOfGain = paths[1].props.d.split(' L')[0].slice(1);
  assert.equal(endOfLoss, startOfGain, 'the two colors meet at one drawing-only zero crossing');
  assert.ok(paths.every(path => !path.props.d.includes('155.00 ')), 'the missing date adds no fabricated chart point');
  assert.match(html, /\+¥50,400\.00/);
  const empty = render([{ date: '2026-09-21', label: '2026/09', pnlUsd: null, dailyPnlUsd: null }]);
  assert.equal(nodes(empty.tree, node => node.props.className === 'pnl-trend-zero-line').length, 0);
  assert.doesNotMatch(empty.html, /data-pnl-report-amount-tooltip/);
  assert.doesNotMatch(empty.html, /¥0\.00/);
  const missingDaily = render([{ date: '2026-09-22', label: '2026/09', pnlUsd: 100, dailyPnlUsd: null }]);
  assert.match(missingDaily.html, /当日盈亏<\/span><span class="pnl-trend-missing">--<\/span>/);
  assert.match(missingDaily.html, /\+¥720\.00/);
});


test('amount strokes use stable solid market colors for every sign and both color preferences', () => {
  for (const marketColorMode of ['redUpGreenDown', 'greenUpRedDown']) {
    const positiveColor = marketColorMode === 'redUpGreenDown' ? '#ff4b1f' : '#34d399';
    const negativeColor = marketColorMode === 'redUpGreenDown' ? '#34d399' : '#ff4b1f';
    for (const values of [[100, 300, 200], [-100, -300, -200], [0, 0, 0], [-100, 200, -50]]) {
      const data = values.map((pnlUsd, index) => ({ date: `2026-09-${20 + index}`, pnlUsd, dailyPnlUsd: null }));
      const { tree } = render(data, { marketColorMode });
      const paths = amountPaths(tree);
      assert.ok(paths.length > 0);
      assert.ok(paths.every(path => path.props.stroke === (path.props['data-pnl-amount-sign'] === -1 ? negativeColor : positiveColor)));
      assert.equal(nodes(tree, node => node.type === 'path' && node.props.stroke?.startsWith?.('url(')).length, 0,
        'amount line coloring must not depend on a gradient paint server during iOS scrolling');
      assert.equal(nodes(tree, node => node.type === 'path' && node.props.fill !== 'none').length, 0);
    }
    for (const pnlUsd of [100, -100, 0]) {
      const { tree } = render([{ date: '2026-09-20', pnlUsd }], { marketColorMode });
      assert.equal(amountPaths(tree).length, 0);
      const [dot] = nodes(tree, node => node.type === 'circle' && node.props.r === '2.4');
      assert.equal(dot.props.fill, pnlUsd < 0 ? negativeColor : positiveColor);
    }
  }
});
