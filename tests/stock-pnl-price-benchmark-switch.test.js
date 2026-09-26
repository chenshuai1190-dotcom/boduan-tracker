import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

import { buildStockPnlReportViewModel } from '../src/lib/stockPnlReportViewModel.js';

const pageUrl = new URL('../src/pages/StockPnlReportPage.jsx', import.meta.url);
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const moduleCache = new Map();

async function compileModule(url, reactOverride = null) {
  const key = `${url.href}:${reactOverride || ''}`;
  if (moduleCache.has(key)) return moduleCache.get(key);
  const loading = (async () => {
    const source = readFileSync(url, 'utf8').replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
    const transformed = await transformWithOxc(source, url.pathname, { jsx: { runtime: 'classic' } });
    let code = transformed.code;
    for (const match of [...code.matchAll(/(from\s+)(['"])([^'"]+)\2/g)].reverse()) {
      const specifier = match[3];
      const resolved = specifier.startsWith('.') ? new URL(specifier, url) : null;
      const target = specifier === 'react' && reactOverride ? reactOverride
        : resolved?.pathname.endsWith('.jsx')
          ? await compileModule(resolved)
          : resolved?.href || import.meta.resolve(specifier);
      code = code.slice(0, match.index) + match[1] + JSON.stringify(target) + code.slice(match.index + match[0].length);
    }
    return moduleUrl(code);
  })();
  moduleCache.set(key, loading);
  return loading;
}

// Drive only page-level state/effects. Child charts and the financial model
// remain real so the selected benchmark is checked through rendered output.
const hooksUrl = moduleUrl(`
import React from ${JSON.stringify(import.meta.resolve('react'))};
let slots = [], cursor = 0, effects = [];
export function reset() { for (const slot of slots) slot?.cleanup?.(); slots = []; effects = []; }
export function render(Component, props) { cursor = 0; return Component(props); }
export async function flush() {
  for (const job of effects.splice(0)) { job.slot.cleanup?.(); job.slot.cleanup = job.effect(); }
  await new Promise(resolve => setImmediate(resolve));
}
function useState(initial) {
  const slot = slots[cursor++] ||= { value: typeof initial === 'function' ? initial() : initial };
  return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
}
function useEffect(effect, deps) {
  const index = cursor++, previous = slots[index];
  if (previous && deps && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
  const slot = slots[index] = { deps, cleanup: previous?.cleanup };
  effects.push({ slot, effect });
}
function useMemo(factory) { cursor++; return factory(); }
function useRef(initial) { return slots[cursor++] ||= { current: initial }; }
export default {
  ...React, useState, useEffect, useMemo, useRef,
  useCallback: callback => { cursor++; return callback; },
};
`);
const hooks = await import(hooksUrl);
const { default: StockPnlReportPage } = await import(await compileModule(pageUrl, hooksUrl));

const stockRows = [
  { date: '2025-09-22', adjustedClose: 100 },
  { date: '2025-09-23', adjustedClose: 110 },
];
const priceRows = {
  NVDA: stockRows,
  QQQ: [{ date: '2025-09-22', adjustedClose: 500 }, { date: '2025-09-23', adjustedClose: 510 }],
  SPY: [{ date: '2025-09-22', adjustedClose: 600 }, { date: '2025-09-23', adjustedClose: 612 }],
  VGT: [{ date: '2025-09-22', adjustedClose: 700 }, { date: '2025-09-23', adjustedClose: 735 }],
};
const snapshots = [
  { snapshotDate: '2025-09-22', symbol: 'NVDA', cumulativePnlUsd: 0, marketValueUsd: 1000 },
  { snapshotDate: '2025-09-23', symbol: 'NVDA', cumulativePnlUsd: 100, marketValueUsd: 1100 },
];

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}

function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return React.isValidElement(node) ? React.Children.toArray(node.props.children).map(textOf).join('') : '';
}

function priceReadout(html) {
  return html.match(/class="stock-pnl-price-readout"[\s\S]*?class="stock-pnl-price-plot-layout"/)?.[0] || '';
}

function makeHarness(fetchRows = async ({ symbol }) => priceRows[symbol] || []) {
  hooks.reset();
  const requests = [];
  const ctx = {
    stockDetailSymbol: 'NVDA',
    stockTrades: [{ tradeDate: '2025-09-22', symbol: 'NVDA', side: 'buy', shares: 10, price: 100 }],
    db: { fetchPnlReportSymbolSnapshotHistory: async () => snapshots },
    fetchPnlBenchmarkRows: async args => { requests.push(args); return fetchRows(args); },
    user: { id: 'user-1' },
    usdRate: 7.2,
    language: 'zh',
  };
  function render() {
    let tree;
    function Capture() { tree = hooks.render(StockPnlReportPage, { ctx }); return tree; }
    const html = renderToStaticMarkup(React.createElement(Capture));
    return { tree, html };
  }
  async function settle() {
    render();
    await hooks.flush(); // symbol snapshots
    render();
    await hooks.flush(); // stock and selected benchmark EOD
    return render();
  }
  function select(tree, symbol) {
    const choice = nodes(tree, node => node.props['data-stock-pnl-benchmark-choice'] === symbol)[0];
    assert.ok(choice, `${symbol} benchmark choice should exist`);
    choice.props.onClick();
  }
  function priceMode(tree) {
    const button = nodes(tree, node => node.type?.name === 'SegmentButton' && textOf(node) === '股价对比')[0];
    assert.ok(button, 'price comparison mode should exist');
    button.props.onClick();
  }
  return { requests, render, settle, select, priceMode };
}

test('QQQ is default; SPY and VGT choices request and label their own market series', async () => {
  const harness = makeHarness();
  let { tree } = await harness.settle();
  assert.deepEqual(harness.requests.map(request => request.symbol), ['NVDA', 'QQQ']);
  harness.priceMode(tree);
  ({ tree } = harness.render());
  for (const symbol of ['QQQ', 'SPY', 'VGT']) {
    const [choice] = nodes(tree, node => node.props['data-stock-pnl-benchmark-choice'] === symbol);
    assert.ok(choice, `${symbol} is selectable`);
    assert.equal(choice.props['aria-pressed'], symbol === 'QQQ');
  }
  let html = renderToStaticMarkup(tree);
  assert.match(priceReadout(html), /QQQ/);

  for (const symbol of ['SPY', 'VGT']) {
    harness.select(tree, symbol);
    harness.render();
    await hooks.flush();
    ({ tree, html } = harness.render());
    assert.equal(harness.requests.at(-1).symbol, symbol);
    const readout = priceReadout(html);
    assert.match(readout, new RegExp(symbol), `${symbol} label must match the selected data`);
    assert.equal(nodes(tree, node => node.props['data-stock-pnl-benchmark-choice'] === symbol)[0].props['aria-pressed'], true);
  }
  hooks.reset();
});

test('a late QQQ response cannot replace newer SPY data; failed VGT never displays a fabricated zero', async () => {
  let resolveQqq;
  const qqq = new Promise(resolve => { resolveQqq = resolve; });
  const harness = makeHarness(({ symbol }) => symbol === 'QQQ' ? qqq : symbol === 'VGT' ? [] : priceRows[symbol]);
  let { tree } = await harness.settle();
  harness.priceMode(tree);
  ({ tree } = harness.render());
  harness.select(tree, 'SPY');
  harness.render();
  await hooks.flush();
  let rendered = harness.render();
  assert.match(priceReadout(rendered.html), /SPY/);
  resolveQqq(priceRows.QQQ);
  await new Promise(resolve => setImmediate(resolve));
  rendered = harness.render();
  assert.match(priceReadout(rendered.html), /SPY/);

  harness.select(rendered.tree, 'VGT');
  harness.render();
  await hooks.flush();
  rendered = harness.render();
  assert.match(rendered.html, /股价对比暂不可用/);
  assert.doesNotMatch(rendered.html, /class="stock-pnl-price-readout"/, 'failed series must not look like a flat 0% return');
  hooks.reset();
});

test('every selected benchmark uses exact common adjusted-close dates with its own baseline', () => {
  const common = {
    symbol: 'NVDA',
    stockTrades: [{ tradeDate: '2025-09-22', symbol: 'NVDA', side: 'buy', shares: 10, price: 100 }],
    symbolSnapshots: snapshots,
    stockPriceRows: stockRows,
    range: 'all',
    now: new Date('2025-09-26T22:00:00Z'),
  };
  const qqq = buildStockPnlReportViewModel({ ...common, benchmarkRows: priceRows.QQQ });
  const spy = buildStockPnlReportViewModel({
    ...common,
    benchmarkRows: [
      { date: '2025-09-22', adjustedClose: null, rawClose: 590 },
      { date: '2025-09-23', adjustedClose: 612 },
    ],
  });
  assert.equal(qqq.priceComparisonStartDate, '2025-09-22');
  assert.equal(qqq.priceTrend[0].pricePct, 0);
  assert.equal(qqq.priceTrend[0].priceBenchmarkPct, 0);
  assert.equal(qqq.priceTrend[1].priceBenchmarkPct, 510 / 500 - 1);
  assert.equal(spy.priceComparisonStartDate, '2025-09-23');
  assert.deepEqual(spy.priceTrend.map(point => point.date), ['2025-09-23']);
  assert.equal(spy.priceTrend[0].pricePct, 0);
  assert.equal(spy.priceTrend[0].priceBenchmarkPct, 0);
});
