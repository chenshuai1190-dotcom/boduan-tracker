import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const componentUrl = new URL('../src/components/PnlReportTrendChart.jsx', import.meta.url);
const source = readFileSync(componentUrl, 'utf8').replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
let { code } = await transformWithOxc(source, componentUrl.pathname, { jsx: { runtime: 'classic' } });
// Render the actual component, helpers and translations; omit only the CSS import.
for (const match of [...code.matchAll(/(from\s+)(['"])([^'"]+)\2/g)].reverse()) {
  const target = match[3].startsWith('.') ? new URL(match[3], componentUrl).href : import.meta.resolve(match[3]);
  code = code.slice(0, match.index) + match[1] + JSON.stringify(target) + code.slice(match.index + match[0].length);
}
const { default: PnlReportTrendChart } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
const byClass = (tree, name) => nodes(tree, node => node.props.className?.split(/\s+/).includes(name));
const markers = tree => nodes(tree, node => Object.hasOwn(node.props, 'data-pnl-report-record-high'));
const readings = (values, key = 'pnlPct', other = {}) => values.map((value, index) => ({
  date: `2026-09-${String(14 + index).padStart(2, '0')}`, label: '2026/09',
  dailyPnlPct: 0.01, benchmarkPct: index, totalAssetUsd: 1000 + index * 100,
  ...other, [key]: value,
}));
function render(data, mode = 'pnl', language = 'zh') {
  let tree;
  function Capture() {
    tree = PnlReportTrendChart({ data, mode, language, color: '#4ade80', displayCurrency: 'USD', displayRate: 1 });
    return tree;
  }
  const html = renderToStaticMarkup(React.createElement(Capture));
  return { tree, html };
}

function assertMarkerAt(tree, key, date, index, expectedX) {
  const allMarkers = markers(tree);
  assert.equal(allMarkers.length, 1, 'only the latest strict record gets a marker');
  assert.equal(allMarkers[0].props['data-pnl-report-record-high'], key);
  assert.equal(allMarkers[0].props['data-record-high-date'], date);
  assert.equal(allMarkers[0].props.pointerEvents, 'none', 'the marker must not intercept chart selection');
  const core = byClass(allMarkers[0], 'pnl-trend-high-core')[0];
  const halo = byClass(allMarkers[0], 'pnl-trend-high-halo')[0];
  assert.ok(core && halo);
  assert.ok(halo.props.className.split(/\s+/).includes('quote-pulse-halo'));
  assert.equal(halo.props.r, '7');
  assert.equal(halo.props.fill, 'none');
  assert.equal(halo.props.stroke, core.props.fill);
  assert.equal(halo.props.strokeWidth, '1.2');
  assert.equal(halo.props.vectorEffect, 'non-scaling-stroke');
  assert.ok(Math.abs(core.props.cx - expectedX) < 1e-9);
  assert.equal(halo.props.cx, core.props.cx);
  assert.equal(halo.props.cy, core.props.cy);
  const path = nodes(tree, node => node.type === 'path' && node.props.strokeWidth === '2.2')[0];
  const vertices = [...path.props.d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)];
  assert.ok(Math.abs(Number(vertices[index][1]) - core.props.cx) < 0.01);
  assert.ok(Math.abs(Number(vertices[index][2]) - core.props.cy) < 0.01, 'the marker must lie on the rendered primary line');
  return core;
}

test('return records follow my return line, never the rising QQQ comparison', () => {
  const { tree } = render(readings([0.10, 0.20, 0.15]));
  const core = assertMarkerAt(tree, 'pnlPct', '2026-09-15', 1, 155);
  assert.equal(core.props.fill, '#4ade80');
  assert.ok(nodes(tree, node => node.type === 'path' && node.props.stroke === '#789ac0').length);
  assert.equal(markers(render(readings([0.10, 0.10, 0.09])).tree).length, 0);
});

test('asset records follow net assets, never the independently rising total-assets line', () => {
  const { tree } = render(readings([100, 110, 105], 'netAssetUsd'), 'assets');
  const core = assertMarkerAt(tree, 'netAssetUsd', '2026-09-15', 1, 155);
  assert.equal(core.props.fill, '#ff5038');
  assert.ok(nodes(tree, node => node.type === 'path' && node.props.stroke === '#f6b54b').length);
  assert.equal(markers(render(readings([100, 90, 80], 'netAssetUsd'), 'assets').tree).length, 0);
});

test('empty, missing, first, declining and equal observations never manufacture a record', () => {
  const cases = [[], [1], [null], [null, undefined, '', NaN, Infinity], [null, 1], [3, 2, 1], [2, 2, 2], [null, 2, null, 2, 1]];
  for (const mode of ['pnl', 'assets']) {
    const key = mode === 'assets' ? 'netAssetUsd' : 'pnlPct';
    for (const values of cases) {
      const { tree, html } = render(readings(values, key), mode);
      assert.equal(markers(tree).length, 0, `${mode}: ${JSON.stringify(values)}`);
      assert.equal(byClass(tree, 'pnl-trend-high-caption').length, 0);
      assert.doesNotMatch(html, /pnl-trend-high-(?:halo|core)/);
    }
  }
});

test('a retreat or later tie preserves the original breakthrough date and coordinates', () => {
  for (const mode of ['pnl', 'assets']) {
    const key = mode === 'assets' ? 'netAssetUsd' : 'pnlPct';
    const { tree } = render(readings([1, 2, 1.8, 2.5, 2.5, 2.1], key), mode);
    assertMarkerAt(tree, key, '2026-09-17', 3, 184.4);
  }
});

test('a missing interval does not reset the prior peak, and negative net assets remain valid', () => {
  for (const mode of ['pnl', 'assets']) {
    const key = mode === 'assets' ? 'netAssetUsd' : 'pnlPct';
    const { tree } = render(readings([1, 2, null, 1.5, 2], key), mode);
    const [marker] = markers(tree);
    assert.equal(marker.props['data-record-high-date'], '2026-09-15');
    assert.equal(byClass(marker, 'pnl-trend-high-core')[0].props.cx, 81.5);
  }
  const { tree } = render(readings([-100, -80, -90], 'netAssetUsd'), 'assets');
  assertMarkerAt(tree, 'netAssetUsd', '2026-09-15', 1, 155);
});

test('Chinese and English captions describe the selected period and the breakthrough date', () => {
  for (const [language, mode, expected] of [
    ['zh', 'pnl', '收益率区间新高'], ['zh', 'assets', '净资产区间新高'],
    ['en', 'pnl', 'Return period high'], ['en', 'assets', 'Net assets period high'],
  ]) {
    const key = mode === 'assets' ? 'netAssetUsd' : 'pnlPct';
    const { tree } = render(readings([1, 2, 1], key), mode, language);
    const [caption] = byClass(tree, 'pnl-trend-high-caption');
    assert.equal(caption.type, 'button');
    assert.equal(caption.props.type, 'button');
    assert.equal(typeof caption.props.onClick, 'function');
    assert.equal(renderToStaticMarkup(caption).includes(`${expected} · 2026/09/15`), true);
    assert.match(caption.props.title, language === 'en' ? /strictly.*selected period.*Tap/ : /所选区间.*严格高于.*点击/);
    assert.doesNotMatch(renderToStaticMarkup(caption), /历史新高|all.time|record high/i);
  }
});

test('the record marker uses the shared CSS halo while keeping the static core visible', () => {
  const { tree, html } = render(readings([1, 2, 1]));
  assert.equal(byClass(tree, 'pnl-trend-high-core').length, 1);
  assert.equal(byClass(tree, 'pnl-trend-high-halo').length, 1);
  assert.equal(byClass(tree, 'quote-pulse-halo').length, 1);
  assert.equal(byClass(tree, 'pnl-trend-high-core')[0].props.className, 'pnl-trend-high-core');
  assert.doesNotMatch(html, /<animate(?:Transform)?\b/, 'SVG animation must not bypass the CSS preference');
  assert.match(readFileSync(componentUrl, 'utf8'), /import ['"]\.\/PulseDot\.css['"]/);
  const css = readFileSync(new URL('../src/components/PnlReportTrendChart.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /pnl-trend-record-high|\.pnl-trend-high-halo\s*\{/,
    'record markers must use the shared motion and reduced-motion contract without a local override');
});
