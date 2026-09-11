import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { dateKey } from '../src/lib/earningsCalendarModel.js';
import { t } from '../src/lib/i18n.js';
import { marketHexColor } from '../src/lib/marketColorMode.js';
import {
  findStockDetailWeeklyMaOnOrBefore, fullStockDetailChartWindow,
  normalizeStockDetailChartWindow, sliceStockDetailChartWindow,
  stockDetailChartDragIntent, transformStockDetailChartWindow,
} from '../src/lib/watchlistStockDetail.js';

const source = readFileSync(new URL('../src/pages/WatchlistStockDetailPage.jsx', import.meta.url), 'utf8');
// Keep production geometry, selection, formatting and SVG together; omit the
// page's network effects and unrelated report sections from this small SSR test.
const chartSource = source.slice(source.indexOf('const NUMBER_FONT ='), source.indexOf('const QQQ_BENCHMARK_CACHE_TTL_MS'))
  + source.slice(source.indexOf('function finiteNumber('), source.indexOf('\nfunction MetricCell('));
const { code } = await transformWithOxc(chartSource, 'WatchlistStockMaCurves.jsx', { jsx: { runtime: 'classic' } });
const dependencies = {
  React, dateKey, t, marketHexColor, findStockDetailWeeklyMaOnOrBefore,
  fullStockDetailChartWindow, normalizeStockDetailChartWindow, sliceStockDetailChartWindow,
  stockDetailChartDragIntent, transformStockDetailChartWindow,
};
const PriceChart = new Function('dependencies', `const { ${Object.keys(dependencies).join(', ')} } = dependencies; ${code}; return PriceChart;`)(dependencies);

const dailyRows = [
  { date: '2026-08-28', close: 200, ma200: 101 },
  { date: '2026-09-01', close: 205, ma200: 102 },
  { date: '2026-09-04', close: 210, ma200: 103 },
  { date: '2026-09-08', close: 215, ma200: 104 },
  { date: '2026-09-11', close: 220, ma200: 105 },
];
const weeklyRows = [dailyRows[0], dailyRows[2], dailyRows[4]].map((row, index) => ({
  date: row.date, close: row.close, ma200: 81 + index, ma50: 777 + index, completed: true,
}));
const weeklyPrices = weeklyRows.map(({ date, close }) => ({ date, close }));

function render(range = '5y', overrides = {}) {
  return renderToStaticMarkup(React.createElement(PriceChart, {
    rows: range === '5y' ? weeklyPrices : dailyRows,
    dailyRows, weeklyRows, weeklyLookupRows: weeklyRows,
    range, currency: 'USD', language: 'zh', marketColorMode: 'redUpGreenDown',
    symbol: 'NVDA', priceColor: '#ff4b1f', initialTooltipOpen: true,
    ...overrides,
  }));
}

function lines(html, cadence) {
  return [...html.matchAll(new RegExp(`<path\\b[^>]*data-watchlist-${cadence}-ma-line="true"[^>]*>`, 'g'))].map(match => match[0]);
}

function tooltipRows(html) {
  return [...html.matchAll(/<div class="stock-report-tooltip-row">([\s\S]*?)<\/div>/g)]
    .map(match => match[1].replace(/<[^>]*>/g, ''));
}

test('five-year chart renders distinct daily and weekly MA200 curves and selected daily values', () => {
  const html = render();
  const daily = lines(html, 'daily');
  const weekly = lines(html, 'weekly');
  assert.equal(daily.length, 1);
  assert.equal(weekly.length, 1);
  assert.match(daily[0], /stroke="#60a5fa"/);
  assert.match(weekly[0], /stroke="#f6b54b"/);
  assert.equal((daily[0].match(/\bL /g) || []).length, 4, 'daily history retains its five separate dates');
  assert.equal((weekly[0].match(/\bL /g) || []).length, 2, 'the existing completed weekly curve retains its three dates');
  assert.deepEqual(tooltipRows(html).slice(1), [
    'MA200（周）$82.00 · +156.10%',
    'MA200（日）$103.00 · +103.88%',
  ]);
  assert.doesNotMatch(html, /weekly-ma50-line|MA50|#a78bfa|\$778\.00/);
});

test('one-year chart keeps only its existing daily MA200 curve and tooltip row', () => {
  const html = render('1y');
  assert.equal(lines(html, 'daily').length, 1);
  assert.equal(lines(html, 'weekly').length, 0);
  assert.match(lines(html, 'daily')[0], /stroke="#60a5fa"/);
  assert.deepEqual(tooltipRows(html).slice(1), ['MA200（日）$104.00 · +106.73%']);
  assert.doesNotMatch(html, /MA200（周）|MA50|weekly-ma50-line/);
});

test('missing daily MA200 history remains absent rather than borrowing a weekly value', () => {
  const html = render('5y', { dailyRows: dailyRows.map(row => ({ ...row, ma200: null })) });
  assert.equal(lines(html, 'daily').length, 0);
  assert.equal(lines(html, 'weekly').length, 1);
  assert.deepEqual(tooltipRows(html).slice(1), ['MA200（周）$82.00 · +156.10%', 'MA200（日）--']);
  assert.doesNotMatch(html, /weekly-ma50-line|MA50|NaN/);
});

test('a missing daily value on the selected weekly date does not reuse an adjacent date', () => {
  const html = render('5y', { dailyRows: dailyRows.filter(row => row.date !== '2026-09-04') });
  assert.equal(lines(html, 'daily').length, 1, 'other valid daily points remain visible');
  assert.equal(lines(html, 'weekly').length, 1);
  assert.deepEqual(tooltipRows(html).slice(1), ['MA200（周）$82.00 · +156.10%', 'MA200（日）--']);
});
