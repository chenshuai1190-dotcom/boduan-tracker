import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const componentUrl = new URL('../src/components/PnlReportTrendChart.jsx', import.meta.url);
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const hookUrl = dataUrl(`
import React from ${JSON.stringify(import.meta.resolve('react'))};
let slots = [], cursor = 0;
export function reset() { slots = []; cursor = 0; }
export function render(Component, props) { cursor = 0; return Component(props); }
function useState(initial) {
  const index = cursor++;
  const slot = slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
  return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
}
function useRef(initial) { return slots[cursor++] ||= { current: initial }; }
export default { ...React, useState, useRef, useId: () => 'financing-interaction',
  useMemo: factory => factory(), useCallback: callback => callback, useEffect() {} };
`);
const hooks = await import(hookUrl);
const source = readFileSync(componentUrl, 'utf8').replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
const transformed = await transformWithOxc(source, componentUrl.pathname, { jsx: { runtime: 'classic' } });
async function loadComponent(controlHooks = false) {
  let code = transformed.code;
  for (const match of [...code.matchAll(/(from\s+)(['"])([^'"]+)\2/g)].reverse()) {
    const target = match[3] === 'react' && controlHooks ? hookUrl
      : match[3].startsWith('.') ? new URL(match[3], componentUrl).href : import.meta.resolve(match[3]);
    code = code.slice(0, match.index) + match[1] + JSON.stringify(target) + code.slice(match.index + match[0].length);
  }
  return (await import(dataUrl(code))).default;
}
const PnlReportTrendChart = await loadComponent();
const InteractiveChart = await loadComponent(true);

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(text).join('');
}
const tagged = (tree, name) => nodes(tree, node => Boolean(node.props[`data-pnl-report-${name}`]));
function marginValue(tree) {
  const values = tagged(tree, 'margin-value');
  assert.equal(values.length, 1);
  return values[0];
}
function leverageValue(tree) {
  const values = tagged(tree, 'leverage-value');
  assert.equal(values.length, 1);
  return text(values[0]);
}
const defaultProps = {
  mode: 'assets', color: '#ff4b1f', language: 'zh', marketColorMode: 'redUpGreenDown',
  displayCurrency: 'USD', displayRate: 1,
};
function render(data, overrides = {}) {
  let tree;
  function Capture() {
    tree = PnlReportTrendChart({ ...defaultProps, data, ...overrides });
    return tree;
  }
  const html = renderToStaticMarkup(React.createElement(Capture));
  return { tree, html };
}
const assets = Object.freeze([
  Object.freeze({ date: '2026-09-28', label: '2026/09', totalAssetUsd: 1000, netAssetUsd: 900, marginDebtUsd: 100, cashKnown: true, cashUsd: 200, pnlUsd: 10, pnlPct: 0.01 }),
  Object.freeze({ date: '2026-09-29', label: '2026/09', totalAssetUsd: 1200, netAssetUsd: null, marginDebtUsd: null, cashKnown: true, cashUsd: 250, pnlUsd: 20, pnlPct: 0.02 }),
  Object.freeze({ date: '2026-09-30', label: '2026/09', totalAssetUsd: 1300, netAssetUsd: 1300, marginDebtUsd: 0, cashKnown: true, cashUsd: 300, pnlUsd: 30, pnlPct: 0.03 }),
  Object.freeze({ date: '2026-10-01', label: '2026/10', totalAssetUsd: 1600, netAssetUsd: 1225.75, marginDebtUsd: 374.25, cashKnown: true, cashUsd: 350, pnlUsd: 40, pnlPct: 0.04 }),
]);

test('asset readout places financing and leverage above cash and follows USD/CNY', () => {
  for (const [displayCurrency, displayRate, expected] of [['USD', 1, '$374.25'], ['CNY', 7.2, '¥2,694.60']]) {
    const { tree, html } = render(assets, { displayCurrency, displayRate });
    const readout = nodes(tree, node => node.props.className === 'pnl-trend-asset-readout')[0];
    const cells = React.Children.toArray(readout.props.children);
    assert.deepEqual(cells.filter((_, index) => index % 2 === 0).map(text), ['净资产', '总资产', '融资额', '杠杆率', '可用现金']);
    assert.equal(leverageValue(tree), '1.31×');
    assert.equal(cells[5].props['data-pnl-report-margin-value'], 'true');
    assert.equal(text(marginValue(tree)), expected);
    assert.equal(marginValue(tree).props.style?.color, '#789ac0');
    const dot = nodes(cells[4], node => node.type === 'i')[0];
    assert.equal(dot.props.style?.background, '#789ac0');
    assert.match(html, /data-pnl-report-margin-value="true"/);
  }
});

test('historical leverage uses the existing total-assets to equity formula and is independent of FX', () => {
  for (const [totalAssetUsd, marginDebtUsd, expected] of [[1000, 200, '1.25×'], [1000, 0, '1.00×'], [100, 99, '100.00×'], [1234.5678, 345.6789, '1.39×']]) {
    const point = Object.freeze({ ...assets[0], totalAssetUsd, marginDebtUsd, netAssetUsd: totalAssetUsd - marginDebtUsd });
    for (const [displayCurrency, displayRate] of [['USD', 1], ['CNY', 7.2], ['CNY', null]]) {
      const { tree } = render([point], { displayCurrency, displayRate });
      assert.equal(leverageValue(tree), expected);
      assert.equal(tagged(tree, 'leverage-line').length, 0);
    }
  }
  const { tree, html } = render(assets, { language: 'en' });
  assert.match(html, /Leverage/);
  assert.equal(leverageValue(tree), '1.31×');
  assert.equal(leverageValue(render([{ ...assets[0], totalAssetUsd: 1000, marginDebtUsd: 300, netAssetUsd: 800 }]).tree), '1.25×',
    'legacy snapshot equity stays consistent with the displayed historical net asset, without rewriting it');
});

test('missing or invalid historical balances never become unleveraged or infinite leverage', () => {
  for (const key of ['totalAssetUsd', 'marginDebtUsd', 'netAssetUsd']) {
    for (const invalid of [null, undefined, '', false, NaN, Infinity, -1]) {
      const { tree, html } = render([{ ...assets[0], [key]: invalid }]);
      const values = tagged(tree, 'leverage-value');
      if (key === 'totalAssetUsd' && invalid !== -1) assert.equal(values.length, 0);
      else assert.equal(leverageValue(tree), '--');
      assert.doesNotMatch(html, /该日没有融资负债快照|No margin-debt snapshot/);
    }
  }
  for (const [totalAssetUsd, marginDebtUsd] of [[0, 0], [1000, 1000], [1000, 1100]]) {
    assert.equal(leverageValue(render([{ ...assets[0], totalAssetUsd, marginDebtUsd, netAssetUsd: totalAssetUsd - marginDebtUsd }]).tree), '--');
  }
});

test('financing preserves unknown values and known zero while refusing unavailable currency conversion', () => {
  for (const missing of [null, undefined, '', false, NaN]) {
    const { tree } = render([{ ...assets[0], marginDebtUsd: missing }]);
    assert.equal(text(marginValue(tree)), '--');
    assert.equal(tagged(tree, 'margin-line').length, 0);
    assert.equal(tagged(tree, 'margin-point').length, 0);
  }
  const absent = { ...assets[0] };
  delete absent.marginDebtUsd;
  assert.equal(text(marginValue(render([absent]).tree)), '--');
  for (const [displayCurrency, displayRate, expected] of [['USD', 1, '$0.00'], ['CNY', 7.2, '¥0.00']]) {
    const { tree } = render([{ ...assets[0], marginDebtUsd: 0 }], { displayCurrency, displayRate });
    assert.equal(text(marginValue(tree)), expected);
    assert.equal(tagged(tree, 'margin-point').length, 1, 'recorded zero remains a real observation');
  }
  const missingRate = render(assets, { displayCurrency: 'CNY', displayRate: null });
  assert.equal(text(marginValue(missingRate.tree)), '--');
});

test('financing uses a solid blue line and splits unknown dates into separate paths or isolated dots', () => {
  const data = [10, 20, null, 0, undefined, 40, 50].map((marginDebtUsd, index) => ({
    ...assets[0], date: `2026-09-${21 + index}`, marginDebtUsd,
  }));
  const { tree } = render(data);
  const paths = tagged(tree, 'margin-line');
  const isolated = tagged(tree, 'margin-point');
  assert.equal(paths.length, 2);
  assert.equal(isolated.length, 1);
  assert.ok(paths[0].props.d.startsWith('M8.00 '));
  assert.ok(paths[0].props.d.includes(' L57.00 '));
  assert.ok(paths[1].props.d.startsWith('M253.00 '));
  assert.ok(paths[1].props.d.includes(' L302.00 '));
  assert.equal(isolated[0].props.cx, 155);
  for (const path of paths) {
    assert.equal(path.type, 'path');
    assert.equal(path.props.stroke, '#789ac0');
    assert.equal(path.props.fill, 'none');
    assert.doesNotMatch(path.props.d, /[HVCQSA]/, 'no step geometry, smoothing, or joining across gaps');
  }
  assert.equal(isolated[0].props.fill, '#789ac0');
});

test('production financing lines preserve observed coordinates, gaps, zero and readouts without mutating data', () => {
  const data = Object.freeze([10, 20, null, 0, undefined, 40, 50].map((marginDebtUsd, index) => Object.freeze({
    ...assets[0], date: `2026-09-${21 + index}`, marginDebtUsd,
  })));
  const before = JSON.stringify(data);
  const linear = render(data).tree;
  const linearPaths = tagged(linear, 'margin-line');
  assert.equal(linearPaths.length, 2, 'unknown dates still split the line into separate paths');
  assert.deepEqual(linearPaths.map(path => path.props.d), [
    'M8.00 184.22 L57.00 182.60',
    'M253.00 179.37 L302.00 177.75',
  ], 'production lines join only the observed coordinates in the shared asset domain');
  for (const path of linearPaths) {
    assert.match(path.props.d, /^M[\d.]+ [\d.-]+ L[\d.]+ [\d.-]+$/);
    assert.doesNotMatch(path.props.d, /[HVQC]/);
    assert.equal(path.props.stroke, '#789ac0');
  }
  const linearDots = tagged(linear, 'margin-point');
  assert.equal(linearDots.length, 1, 'known zero surrounded by gaps remains an isolated observation');
  assert.equal(linearDots[0].props.cx, 155);
  assert.equal(linearDots[0].props.cy.toFixed(2), '185.83');
  assert.equal(linearDots[0].props.fill, '#789ac0');
  for (const [end, expected] of [[3, '--'], [4, '$0.00'], [5, '--'], [7, '$50.00']]) {
    const sliced = data.slice(0, end);
    const defaultValue = text(marginValue(render(sliced).tree));
    assert.equal(defaultValue, expected);
  }
  assert.equal(JSON.stringify(data), before, 'drawing must not mutate original financing observations');
});

test('financing participates in the shared assets domain even when debt exceeds total assets', () => {
  const { tree } = render([
    { ...assets[0], totalAssetUsd: 100, netAssetUsd: -50, marginDebtUsd: 150 },
    { ...assets[1], totalAssetUsd: 100, netAssetUsd: 50, marginDebtUsd: 50 },
  ]);
  const [path] = tagged(tree, 'margin-line');
  assert.ok(path);
  const y = Number(/^M[\d.]+ ([\d.-]+)/.exec(path.props.d)?.[1]);
  assert.ok(y >= 8 && y <= 202, 'financing must not be clipped outside the asset plot');
  const netAsset = nodes(tree, node => node.type === 'path' && node.props.stroke === '#ff5038')[0];
  const marginEndY = path.props.d.match(/ ([\d.-]+)$/)?.[1];
  const netEndY = netAsset.props.d.match(/ ([\d.-]+)$/)?.[1];
  assert.equal(marginEndY, netEndY, 'equal net-asset and financing amounts share the same coordinate');
});

test('actual pointer handlers select historical financing values and markers, including unknown and zero', () => {
  hooks.reset();
  const before = JSON.stringify(assets);
  const props = { ...defaultProps, data: assets };
  const view = () => hooks.render(InteractiveChart, props);
  const hitArea = tree => tagged(tree, 'chart-hit-area')[0];
  const captured = new Set();
  const target = {
    getBoundingClientRect: () => ({ left: 0, width: 310 }),
    setPointerCapture: id => captured.add(id),
    hasPointerCapture: id => captured.has(id),
    releasePointerCapture: id => captured.delete(id),
  };
  const pointer = x => ({ pointerId: 1, isPrimary: true, clientX: x, currentTarget: target });
  let tree = view();
  assert.equal(text(marginValue(tree)), '$374.25', 'initial readout uses the latest snapshot');
  assert.equal(leverageValue(tree), '1.31×');
  hitArea(tree).props.onPointerDown(pointer(8));
  tree = view();
  assert.equal(text(marginValue(tree)), '$100.00');
  assert.equal(leverageValue(tree), '1.11×', 'selected history must not use the latest leverage');
  assert.match(text(nodes(tree, node => node.props.className === 'pnl-trend-readout-heading')[0]), /2026\/9\/28/);
  let selected = tagged(tree, 'selected-margin');
  assert.equal(selected.length, 1);
  assert.equal(selected[0].props.cx, 8);
  assert.equal(selected[0].props.fill, '#789ac0');

  hitArea(tree).props.onPointerMove(pointer(106));
  tree = view();
  assert.equal(text(marginValue(tree)), '--');
  assert.equal(leverageValue(tree), '--');
  assert.equal(tagged(tree, 'selected-margin').length, 0, 'unknown debt has no fabricated selected point');

  hitArea(tree).props.onPointerMove(pointer(204));
  tree = view();
  assert.equal(text(marginValue(tree)), '$0.00');
  assert.equal(leverageValue(tree), '1.00×');
  assert.equal(tagged(tree, 'selected-margin').length, 1);
  assert.equal(tagged(tree, 'selected-margin')[0].props.cx, 204);

  hitArea(tree).props.onPointerMove(pointer(302));
  hitArea(view()).props.onPointerUp(pointer(302));
  assert.equal(captured.size, 0);
  props.displayCurrency = 'CNY';
  props.displayRate = 7.2;
  tree = view();
  assert.equal(text(marginValue(tree)), '¥2,694.60', 'selected financing follows a currency switch');
  assert.equal(leverageValue(tree), '1.31×', 'leverage is currency independent');
  assert.equal(tagged(tree, 'selected-margin')[0].props.cx, 302);
  assert.equal(JSON.stringify(assets), before, 'selection and currency conversion must never rewrite historical debt');
});

test('financing additions remain exclusive to total-asset mode', () => {
  for (const mode of ['amount', 'pnl']) {
    const { tree, html } = render(assets, { mode });
    for (const tag of ['margin-value', 'margin-line', 'margin-point', 'selected-margin', 'leverage-value']) {
      assert.equal(tagged(tree, tag).length, 0);
    }
    assert.doesNotMatch(html, /融资额|杠杆率|data-pnl-report-margin/);
  }
});
