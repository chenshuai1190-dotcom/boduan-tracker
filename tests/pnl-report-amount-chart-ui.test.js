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

function render(data, { currency = 'CNY', rate = 7.2, marketColorMode = 'redUpGreenDown' } = {}) {
  let tree;
  function Capture() {
    tree = PnlReportTrendChart({
      data, mode: 'amount', color: '#ff4b1f', language: 'zh', marketColorMode,
      displayCurrency: currency, displayRate: rate,
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
  assert.equal(nodes(tree, node => node.type === 'path' && node.props.stroke?.startsWith?.('url(#pnl-report-amount-line-')).length, 1);
  const readout = nodes(tree, node => node.props['data-pnl-report-amount-tooltip'])[0];
  const readingClasses = React.Children.toArray(readout.props.children).map(child => child.props.className).filter(Boolean);
  assert.ok(readingClasses[0].includes('text-emerald-400'), 'negative daily P&L follows the market color preference');
  assert.ok(readingClasses[1].includes('text-[#ff4b1f]'), 'positive cumulative P&L follows the market color preference');

  const usd = render(trend, { currency: 'USD', rate: 1 });
  assert.match(usd.html, /-\$1,000\.00/);
  assert.match(usd.html, /\+\$1,000\.00/);
  const greenUp = render(trend, { marketColorMode: 'greenUpRedDown' }).tree;
  const greenUpReadout = nodes(greenUp, node => node.props['data-pnl-report-amount-tooltip'])[0];
  const greenUpClasses = React.Children.toArray(greenUpReadout.props.children).map(child => child.props.className).filter(Boolean);
  assert.ok(greenUpClasses[0].includes('text-[#ff4b1f]'));
  assert.ok(greenUpClasses[1].includes('text-emerald-400'));
});

test('only a positive amount period high receives the shared pulse marker', () => {
  const positive = render(trend).tree;
  const [marker] = nodes(positive, node => Object.hasOwn(node.props, 'data-pnl-report-record-high'));
  assert.equal(marker.props['data-pnl-report-record-high'], 'pnlUsd');
  assert.equal(marker.props['data-record-high-date'], '2026-09-22');
  assert.equal(nodes(marker, node => node.props.className?.includes?.('quote-pulse-halo')).length, 1);
  assert.equal(nodes(render(trend.slice(0, 2)).tree, node => Object.hasOwn(node.props, 'data-pnl-report-record-high')).length, 0,
    'a smaller loss is not celebrated as a high');
});

test('missing amount observations are not plotted as zero or selectable readings', () => {
  const data = [trend[0], { date: '2026-09-21', label: '2026/09', pnlUsd: null, dailyPnlUsd: null }, trend[2]];
  const { tree, html } = render(data);
  const paths = nodes(tree, node => node.type === 'path' && node.props.stroke?.startsWith?.('url(#pnl-report-amount-line-'));
  assert.equal(paths.length, 1, 'observed closes form one trend across dates without a portfolio snapshot');
  assert.equal((paths[0].props.d.match(/ L/g) || []).length, 1, 'the missing date adds no fabricated chart point');
  assert.match(html, /\+¥50,400\.00/);
  const empty = render([{ date: '2026-09-21', label: '2026/09', pnlUsd: null, dailyPnlUsd: null }]);
  assert.equal(nodes(empty.tree, node => node.props.className === 'pnl-trend-zero-line').length, 0);
  assert.doesNotMatch(empty.html, /data-pnl-report-amount-tooltip/);
  assert.doesNotMatch(empty.html, /¥0\.00/);
  const missingDaily = render([{ date: '2026-09-22', label: '2026/09', pnlUsd: 100, dailyPnlUsd: null }]);
  assert.match(missingDaily.html, /当日盈亏<\/span><span class="pnl-trend-missing">--<\/span>/);
  assert.match(missingDaily.html, /\+¥720\.00/);
});
