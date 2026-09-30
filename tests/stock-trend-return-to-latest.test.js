import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { deriveStockDetailReturnToLatest } from '../src/lib/watchlistStockDetail.js';

const point = (date, close) => ({ date, close });
const start = point('2034-03-03', 80);
const end = point('2034-03-28', 100);
const near = (actual, expected, message) => assert.ok(
  Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * 1e-12,
  message || `${actual} should equal ${expected} within floating-point precision`,
);

test('return to latest uses the selected close as its denominator and retains signed amount', () => {
  assert.deepEqual(deriveStockDetailReturnToLatest(start, end), {
    fromDate: start.date, asOfDate: end.date, change: 20, changePercent: 25,
  });
  assert.deepEqual(deriveStockDetailReturnToLatest(point(start.date, 100), point(end.date, 75)), {
    fromDate: start.date, asOfDate: end.date, change: -25, changePercent: -25,
  });
});

test('raw close precision survives calculation instead of being rounded to tooltip precision', () => {
  const selected = Object.freeze(point(start.date, 1.0004));
  const latest = Object.freeze(point(end.date, 1.0008));
  const actual = deriveStockDetailReturnToLatest(selected, latest);
  assert.notEqual(actual.change, 0, 'both displayed prices round to 1.00, but the real change is not zero');
  near(actual.change, .0004);
  near(actual.changePercent, .0004 / 1.0004 * 100);
  assert.deepEqual(selected, point(start.date, 1.0004));
  assert.deepEqual(latest, point(end.date, 1.0008));
});

test('consistent price scaling changes the amount but preserves return percent', () => {
  const baseline = deriveStockDetailReturnToLatest(point(start.date, 123.4567), point(end.date, 137.6543));
  for (const scale of [.001, 2, 1000]) {
    const actual = deriveStockDetailReturnToLatest(point(start.date, 123.4567 * scale), point(end.date, 137.6543 * scale));
    near(actual.change, baseline.change * scale);
    near(actual.changePercent, baseline.changePercent);
    assert.equal(actual.fromDate, baseline.fromDate);
    assert.equal(actual.asOfDate, baseline.asOfDate);
  }
});

test('true zero is retained for the latest point and unchanged prices on later dates', () => {
  for (const latest of [point(start.date, 80), point(end.date, 80)]) {
    const actual = deriveStockDetailReturnToLatest(start, latest);
    assert.equal(actual.change, 0);
    assert.equal(actual.changePercent, 0);
    assert.equal(Object.is(actual.change, -0), false);
  }
  assert.equal(deriveStockDetailReturnToLatest(start, point(start.date, 80.0001)), null,
    'two different prices for the same date do not establish a return');
});

test('missing, nonnumeric, nonpositive and nonfinite endpoints never become zero or infinity', () => {
  const invalid = [null, undefined, {}, { date: end.date }, ...[null, undefined, '', '100', 0, -1, NaN, Infinity, -Infinity]
    .map(close => point(end.date, close))];
  for (const value of invalid) {
    assert.equal(deriveStockDetailReturnToLatest(start, value), null);
    assert.equal(deriveStockDetailReturnToLatest(value, end), null);
  }
  assert.equal(deriveStockDetailReturnToLatest(point(start.date, Number.MIN_VALUE), point(end.date, Number.MAX_VALUE)), null,
    'finite observations whose percentage overflows still remain unavailable');
});

test('invalid calendar dates, noncanonical date strings and reversed endpoints are unavailable', () => {
  for (const date of [null, undefined, '', 'not-a-date', '2034-02-30', '2034-13-01', '2034-3-03', '2034-03-03junk']) {
    assert.equal(deriveStockDetailReturnToLatest(point(date, 80), end), null, `selected date: ${date}`);
    assert.equal(deriveStockDetailReturnToLatest(start, point(date, 100)), null, `endpoint date: ${date}`);
  }
  assert.equal(deriveStockDetailReturnToLatest(end, start), null);
});

// Compile the real component graph for SSR, stripping only CSS imports. This
// exercises production tooltip branches without browser, network or account data.
const compiledModules = new Map();
async function compile(url) {
  if (compiledModules.has(url.href)) return compiledModules.get(url.href);
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
  compiledModules.set(url.href, loading);
  return loading;
}
const { PriceChart } = await import(await compile(new URL('../src/pages/WatchlistStockDetailPage.jsx', import.meta.url)));
const { default: MacroHistoryChart } = await import(await compile(new URL('../src/components/MacroHistoryChart.jsx', import.meta.url)));
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
const rows = [point('2034-03-03', 60), point('2034-03-10', 70), point('2034-03-17', 80), point('2034-03-24', 90)];
const props = {
  rows, dailyRows: [], weeklyRows: [], weeklyLookupRows: [], range: '1y',
  currency: 'USD', language: 'zh', symbol: 'TEST', marketColorMode: 'redUpGreenDown',
  priceColor: '#22c55e', initialTooltipOpen: true,
};
function returnRow(tree) {
  return nodes(tree, node => node.props['data-watchlist-return-to-latest'] === 'true')[0];
}

test('selected chart point compares to an independent daily endpoint outside its displayed rows', () => {
  const { tree, html } = render(PriceChart, { ...props, latestClose: end });
  const selected = returnRow(tree);
  assert.ok(selected);
  const markup = renderToStaticMarkup(selected);
  assert.match(html, /2034\/03\/17 · 收盘/);
  assert.match(markup, /至今涨跌/);
  assert.match(markup, /\+20\.00\s+\+25\.00%/);
  assert.doesNotMatch(markup, /截至|2034|收盘/);
  assert.doesNotMatch(markup, /\+10\.00|\+12\.50%/,
    'the visible right edge is 90, and must not replace the independent daily close of 100');
});

test('five-year weekly selection still ends at the latest daily close, not the last completed week', () => {
  const weeklyRows = rows.map(row => ({ ...row, completed: true, ma200: 50 }));
  const { tree, html } = render(PriceChart, {
    ...props, range: '5y', weeklyRows, weeklyLookupRows: weeklyRows, latestClose: end,
  });
  assert.match(html, /周涨跌/);
  const markup = renderToStaticMarkup(returnRow(tree));
  assert.match(markup, /\+20\.00\s+\+25\.00%/);
  assert.doesNotMatch(markup, /截至|2034|收盘/);
});

test('missing endpoint is explicit unavailable, while omitted opt-in leaves shared consumers unchanged', () => {
  assert.equal(returnRow(render(PriceChart, props).tree), undefined);
  for (const latestClose of [null, point(end.date, 0), point(end.date, NaN), point('2034-03-01', 100)]) {
    const markup = renderToStaticMarkup(returnRow(render(PriceChart, { ...props, latestClose }).tree));
    assert.match(markup, /至今涨跌/);
    assert.match(markup, />--</);
    assert.doesNotMatch(markup, /0\.00%|截至|NaN|Infinity/);
  }
  assert.equal(returnRow(render(PriceChart, { ...props, latestClose: end, initialTooltipOpen: false }).tree), undefined);
});

test('signed return colors honor market preference; a genuine zero stays neutral', () => {
  const positive = renderToStaticMarkup(returnRow(render(PriceChart, { ...props, latestClose: end }).tree));
  const alternative = renderToStaticMarkup(returnRow(render(PriceChart, { ...props, latestClose: end, marketColorMode: 'greenUpRedDown' }).tree));
  const negative = renderToStaticMarkup(returnRow(render(PriceChart, { ...props, latestClose: point(end.date, 60) }).tree));
  const zero = renderToStaticMarkup(returnRow(render(PriceChart, { ...props, latestClose: point(rows[2].date, 80) }).tree));
  assert.match(positive, /color:#ff4b1f/);
  assert.match(alternative, /color:#22c55e/);
  assert.match(negative, /-20\.00\s+-25\.00%/);
  assert.match(negative, /color:#22c55e/);
  assert.match(zero, /\+0\.00\s+\+0\.00%/);
  assert.match(zero, /color:#a1a1aa/);
});

test('English uses the translated latest-return label without a cutoff date', () => {
  const markup = renderToStaticMarkup(returnRow(render(PriceChart, { ...props, latestClose: end, language: 'en' }).tree));
  assert.match(markup, /Change to latest/);
  assert.doesNotMatch(markup, /2034|through|as of|close/i);
  assert.doesNotMatch(markup, /至今涨跌|截至/);
});

test('actual macro wrapper retains its custom rate tooltip even if an endpoint is accidentally supplied', () => {
  const metric = { id: 'real10y', name: '实际利率', unit: 'percent', changeUnit: 'bp',
    history: rows.map((row, index) => ({ date: row.date, value: -.2 + index * .05 })) };
  const wrapper = render(MacroHistoryChart, { metric, range: '1m', language: 'zh' });
  const chart = nodes(wrapper.tree, node => node.type === PriceChart)[0];
  assert.ok(chart);
  assert.equal(chart.props.latestClose, undefined);
  const { tree, html } = render(PriceChart, { ...chart.props, latestClose: end, initialTooltipOpen: true });
  assert.equal(returnRow(tree), undefined);
  assert.match(html, /较上次观测/);
  assert.match(html, /bp/);
  assert.doesNotMatch(html, /至今涨跌|Change to latest|当日涨跌|周涨跌/);
});
