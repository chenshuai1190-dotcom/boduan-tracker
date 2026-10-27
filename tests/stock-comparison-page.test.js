import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const hooksUrl = dataUrl(`
import React from ${JSON.stringify(import.meta.resolve('react'))};
let active, nextId = 0;
export function renderer() {
  const state = { slots: [], cursor: 0, pending: [] };
  return {
    render(Component, props) {
      const prior = active; active = state; state.cursor = 0;
      try { const tree = Component(props); const pending = state.pending.splice(0); pending.forEach(run => run()); return tree; }
      finally { active = prior; }
    },
    dispose() { state.slots.forEach(slot => slot?.cleanup?.()); state.slots = []; }
  };
}
function useState(initial) {
  const slot = active.slots[active.cursor++] ||= { value: typeof initial === 'function' ? initial() : initial };
  return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
}
function useRef(initial) { return active.slots[active.cursor++] ||= { current: initial }; }
function useMemo(create, dependencies) {
  const index = active.cursor++, prior = active.slots[index];
  if (prior && dependencies && dependencies.length === prior.dependencies.length && dependencies.every((v, i) => Object.is(v, prior.dependencies[i]))) return prior.value;
  const value = create(); active.slots[index] = { value, dependencies }; return value;
}
function useEffect(create, dependencies) {
  const owner = active, index = owner.cursor++, prior = owner.slots[index];
  if (!prior || !dependencies || dependencies.length !== prior.dependencies.length || dependencies.some((v, i) => !Object.is(v, prior.dependencies[i]))) {
    owner.pending.push(() => { prior?.cleanup?.(); owner.slots[index] = { dependencies, cleanup: create() }; });
  }
}
export default { ...React, useState, useRef, useMemo, useEffect, useLayoutEffect: useEffect,
  useCallback: (fn, deps) => useMemo(() => fn, deps), useId: () => useMemo(() => ':test-' + (++nextId) + ':', []) };
`);
const hooks = await import(hooksUrl);

async function compile(relative, overrides = {}, suffix = '') {
  const url = new URL(relative, import.meta.url);
  const source = readFileSync(url, 'utf8').replaceAll('import.meta.env.DEV', 'true');
  const transformed = await transformWithOxc(source, url.pathname, { jsx: { runtime: 'classic' } });
  return dataUrl(transformed.code.replace(/import\s*['"][^'"]+\.css['"];?/g, '')
    .replace(/from (['"])([^'"]+)\1/g, (_match, _quote, specifier) => `from ${JSON.stringify(overrides[specifier]
      || (specifier.startsWith('.') ? new URL(specifier, url).href : import.meta.resolve(specifier)))}`) + suffix);
}
const rsiUrl = await compile('../src/components/StockRsiReference.jsx');
const { getStockRsiReferenceState } = await import(rsiUrl);
const chartUrl = await compile('../src/components/StockComparisonChart.jsx', { react: hooksUrl });
const { default: Chart } = await import(chartUrl);
const pageUrl = await compile('../src/pages/StockComparisonPage.jsx', {
  react: hooksUrl,
  '../components/StockComparisonChart.jsx': chartUrl,
  '../components/StockRsiReference.jsx': rsiUrl,
  '../components/InvestmentSymbolPicker.jsx': dataUrl('export default function InvestmentSymbolPicker(){ return null; }'),
}, '\nexport function resetRememberedForTest() { remembered.clear(); }');
const { default: Page, resetRememberedForTest } = await import(pageUrl);
const nodes = (node, predicate) => !React.isValidElement(node) ? [] : [
  ...(predicate(node) ? [node] : []),
  ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate)),
];
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : React.isValidElement(node) ? React.Children.toArray(node.props.children).map(text).join('') : '';
const one = (tree, predicate) => { const result = nodes(tree, predicate); assert.equal(result.length, 1); return result[0]; };
const chart = tree => one(tree, node => node.type === Chart);
const rsiCards = tree => nodes(tree, node => node.type?.name === 'ComparisonRsi');
const dates = [];
for (const date = new Date('2026-01-02T00:00:00Z'); dates.length < 30; date.setUTCDate(date.getUTCDate() + 1)) {
  if (![0, 6].includes(date.getUTCDay()) && date.toISOString().slice(0, 10) !== '2026-01-19') dates.push(date.toISOString().slice(0, 10));
}
const thresholds = [0, 15, 15.00001, 20, 20.00001, 30, 30.00001, 69.99999, 70, 79.99999, 80, 100, null];
const sample = { series: Object.fromEntries(['QQQ', 'TQQQ'].map((symbol, offset) => [symbol, {
  symbol, name: symbol, rsiPeriod: 6, rsiPriceBasis: 'adjusted_close',
  rows: dates.map((date, i) => ({ date, close: 100 + i * (offset + 1), rsi6: i < thresholds.length ? thresholds[i] : offset ? 82.25 : 55.5 })),
}])) };

async function harness(t, language = 'zh') {
  resetRememberedForTest();
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  const timers = new Map(), listeners = new Set(), removed = [];
  let timerId = 0;
  globalThis.window = { location: { search: '' }, setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id) };
  globalThis.document = {
    addEventListener(type, callback, capture) { listeners.add({ type, callback, capture }); },
    removeEventListener(type, callback, capture) { for (const listener of listeners) if (listener.type === type && listener.callback === callback && listener.capture === capture) { listeners.delete(listener); removed.push(listener); } },
  };
  const pageRenderer = hooks.renderer(), chartRenderer = hooks.renderer();
  const inside = new Set(), parentNode = { contains: target => inside.has(target) };
  const requests = [];
  const props = { ctx: { userId: 'test-user', language }, previewSource: {
    asOfDate: dates.at(-1), load: async options => { requests.push(options); return sample; }, search: async () => ({ results: [] }),
  } };
  const render = () => {
    const tree = pageRenderer.render(Page, props);
    const wrapper = nodes(tree, node => node.type === 'div' && node.ref && nodes(node, child => child.type === Chart).length === 1)[0];
    if (wrapper) wrapper.ref.current = parentNode;
    return tree;
  };
  const dispose = () => { pageRenderer.dispose(); chartRenderer.dispose(); };
  t.after(() => { dispose(); globalThis.window = previousWindow; globalThis.document = previousDocument; });
  render();
  for (const [id, callback] of timers) { timers.delete(id); callback(); }
  await new Promise(resolve => setImmediate(resolve));
  return { render, requests, inside, listeners, removed, dispose,
    renderChart: () => chartRenderer.render(Chart, chart(render()).props),
    click: target => { for (const listener of [...listeners]) if (listener.type === 'click') listener.callback({ target }); },
  };
}

test('new comparison opens year-to-date and native detail toggle keeps a single plus/minus in its fixed layout', async t => {
  const h = await harness(t);
  let tree = h.render();
  assert.equal(h.requests[0].startDate, '2026-01-01');
  assert.equal(h.requests[0].endDate, dates.at(-1));
  assert.equal(one(tree, n => n.type === 'button' && text(n) === '今年').props['aria-pressed'], true);
  let details = one(tree, n => n.type === 'details');
  assert.equal(details.props.open, true);
  let markup = renderToStaticMarkup(one(details, n => n.type === 'summary'));
  assert.match(markup, /lucide-minus/);
  assert.equal((markup.match(/<svg/g) || []).length, 1);
  assert.doesNotMatch(markup, /lucide-plus|lucide-x/);
  details.props.onToggle({ currentTarget: { open: false } });
  details = one(h.render(), n => n.type === 'details');
  assert.equal(details.props.open, false);
  markup = renderToStaticMarkup(one(details, n => n.type === 'summary'));
  assert.match(markup, /lucide-plus/);
  assert.doesNotMatch(markup, /lucide-minus|lucide-x/);
  details.props.onToggle({ currentTarget: { open: true } });
  assert.equal(one(h.render(), n => n.type === 'details').props.open, true);
  const css = readFileSync(new URL('../src/pages/StockComparisonPage.css', import.meta.url), 'utf8');
  const summaryRules = [...css.matchAll(/([^{}]*\.sc-details[^{}]*summary[^{}]*)\{([^}]*)\}/g)].map(match => match[2]).join(' ');
  assert.match(summaryRules, /justify-content:\s*space-between/);
  assert.doesNotMatch(summaryRules, /rotate\(/, 'the plus must not rotate into a close icon');
  assert.match(css, /\.investment-comparison\.sc-page \.sc-details > summary::after\s*\{\s*content: none;/, 'suppress the inherited InvestmentComparison pseudo-element so only one toggle remains');
});

test('selected-date cards render the historical RSI for that exact row using all existing trade thresholds', async t => {
  const h = await harness(t);
  for (const [index, value] of thresholds.entries()) {
    chart(h.render()).props.onSelectDate(dates[index]);
    const tree = h.render();
    const cards = rsiCards(tree);
    assert.equal(cards.length, 2);
    for (const card of cards) {
      assert.equal(card.props.date, dates[index]);
      assert.equal(card.props.value, value);
      const expected = getStockRsiReferenceState({ value, asOf: dates[index] });
      const html = renderToStaticMarkup(card);
      assert.ok(html.includes(`data-status="${expected.status}"`));
      assert.ok(html.includes(expected.value === null ? '>—<' : `>${value.toFixed(2)}<`));
      assert.doesNotMatch(html, /55\.50|82\.25/, 'an old or missing RSI must not be replaced by the latest reading');
    }
  }
});

test('outside clicks restore period-end cards without remounting or resetting a zoomed chart; inside controls remain usable', async t => {
  const h = await harness(t);
  chart(h.render()).props.onSelectDate(dates[8]);
  const selectedChart = chart(h.render());
  let chartTree = h.renderChart();
  const zoom = one(chartTree, n => n.props['aria-label'] === '放大图表');
  assert.equal(zoom.props.disabled, false);
  h.inside.add(zoom);
  h.click(zoom);
  zoom.props.onClick();
  assert.equal(chart(h.render()).props.selectedDate, dates[8]);
  chartTree = h.renderChart();
  const windowLabel = text(one(chartTree, n => n.props.className === 'scc-window-label'));
  assert.notEqual(windowLabel, '双指缩放');
  assert.equal(one(chartTree, n => n.props.className === 'scc-reset').props.disabled, false);
  assert.equal(h.listeners.size, 1);
  assert.equal([...h.listeners][0].capture, true);
  h.click({ outside: true });
  const restored = chart(h.render());
  assert.equal(restored.props.selectedDate, dates.at(-1));
  assert.equal(restored.type, selectedChart.type);
  assert.equal(restored.key, selectedChart.key);
  assert.equal(restored.props.rows, selectedChart.props.rows, 'selection reset must not rebuild chart data or its return baseline');
  assert.equal(text(one(h.renderChart(), n => n.props.className === 'scc-window-label')), windowLabel);
  assert.equal(h.listeners.size, 0, 'the outside listener should be removed after returning to the end');
  assert.equal(h.removed.length, 1);
  assert.deepEqual(rsiCards(h.render()).map(card => card.props.value), [55.5, 82.25]);
  const reset = one(h.renderChart(), n => n.props.className === 'scc-reset');
  reset.props.onClick();
  assert.equal(text(one(h.renderChart(), n => n.props.className === 'scc-window-label')), '双指缩放', 'explicit reset remains the way to restore chart zoom');
  chart(h.render()).props.onSelectDate(dates[5]);
  h.render();
  assert.equal(h.listeners.size, 1);
  h.dispose();
  assert.equal(h.listeners.size, 0, 'unmount must remove the capture listener with the same callback');
});

test('English RSI cards preserve exact selected dates and localize missing historical observations', async t => {
  const h = await harness(t, 'en');
  chart(h.render()).props.onSelectDate(dates[1]);
  for (const card of rsiCards(h.render())) assert.match(renderToStaticMarkup(card), /Panic oversold/);
  chart(h.render()).props.onSelectDate(dates[12]);
  for (const card of rsiCards(h.render())) assert.match(renderToStaticMarkup(card), /No data/);
});
