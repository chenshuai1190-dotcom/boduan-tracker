import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveHoldingStockYtdPercent } from '../src/lib/holdingStockYtd.js';
import { resolveHomeMarketDisplayMetrics } from '../src/lib/homeMarketDisplay.js';
import { deriveInvestmentSummary } from '../src/lib/investmentSummary.js';
import { marketTextHexColor } from '../src/lib/marketColorMode.js';

const NOW = Date.parse('2026-10-12T14:00:00Z');
const BASELINE = { year: 2026, date: '2025-12-31', close: 100, source: 'eodhd-adjusted-close' };
const homeSource = readFileSync(new URL('../src/tabs/HomeTab.jsx', import.meta.url), 'utf8');

function sourceBetween(startText, endText) {
  const start = homeSource.indexOf(startText);
  const end = homeSource.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, `Home projection boundary must exist: ${startText}`);
  return homeSource.slice(start, end);
}

// Execute Home's actual projection and sorting code. A helper-only test would
// miss the position map overwriting raw quote metadata for a held watchlist item.
const projectHomeRows = new Function('React', 'rows', 'tableTab', 'displayWatchlist', 'positions', 'quoteRows',
  'positionsBySymbol', 'resolveHomeMarketDisplayMetrics', 'deriveHoldingStockYtdPercent', 'marketColor',
  `const displayRate = 1;
   const marketColorMode = 'red-up';
   const language = 'zh';
   const logoCache = {};
   const stockLogoCandidates = () => [];
   const stockDisplayName = (symbol, name) => name || symbol;
   ${sourceBetween('const stockYtdQuoteBySymbol = React.useMemo(', 'const watchlistSymbols = React.useMemo(')}
   ${sourceBetween('const quoteBySymbol = React.useMemo(', 'const popularQuoteBySymbol = React.useMemo(')}
   ${sourceBetween('const rawTableRows = React.useMemo(', 'const tableRows = React.useMemo(')}
   return rawTableRows;`);

const sortHomeRows = new Function('React', 'rawTableRows', 'activeTableSort',
  `${sourceBetween('function num(value)', 'function fmtMoney(')}
   ${sourceBetween('function sortMetricValue(', 'function LogoPlaceholder(')}
   ${sourceBetween('const tableRows = React.useMemo(', 'const editSearchKey = ')}
   return tableRows;`);

const React = { useMemo: factory => factory() };

function quote(symbol, price, extra = {}) {
  return { symbol, price, changePercent: 0, high: 200, stockYtdBaseline: BASELINE, ...extra };
}

function project({ watchlist = [], positions = [], quoteRows = watchlist, tableTab = 'watchlist' } = {}) {
  return projectHomeRows(React, tableTab === 'positions' ? positions : watchlist,
    tableTab, watchlist, positions, quoteRows,
    new Map(positions.map(row => [row.symbol, row])), resolveHomeMarketDisplayMetrics,
    (row, price) => deriveHoldingStockYtdPercent(row, price, NOW), marketTextHexColor);
}

test('Home watchlist YTD uses the verified baseline and preserves positive, negative, zero and unknown values', () => {
  const watchlist = [
    quote('GAIN', 125, { ytdChangePercent: -999 }),
    quote('LOSS', 75, { ytdChangePercent: 999 }),
    quote('FLAT', 100, { ytdChangePercent: 99 }),
    quote('MISSING', 125, { stockYtdBaseline: null, ytdChangePercent: 0 }),
    quote('OLD', 125, { stockYtdBaseline: { ...BASELINE, year: 2025, date: '2024-12-31' } }),
  ];
  const before = structuredClone(watchlist);
  const rows = project({ watchlist });
  assert.deepEqual(rows.map(row => row.ytdChangePercent), [25, -25, 0, null, null]);
  assert.equal(rows[3].ytdColor, '#ffffff40');
  assert.deepEqual(watchlist, before, 'projection must not write calculated performance into source quotes');
});

test('held watchlist symbols retain raw YTD metadata even when the general quote map resolves to a position', () => {
  const watchlist = [quote('NVDA', 125)];
  const positions = deriveInvestmentSummary({
    stockTrades: [{ id: 1, symbol: 'NVDA', side: 'buy', date: '2026-08-03', shares: 10, price: 150 }],
    watchlist,
  }).activePositions;
  assert.equal(positions[0].stockYtdBaseline, undefined);
  const [row] = project({ watchlist, positions });
  assert.equal(row.quote, positions[0], 'exercise the real Home quote-map collision');
  assert.equal(row.ytdChangePercent, 25);
  assert.equal(row.pnlValue, -250, 'stock performance must remain independent of personal purchase cost');
});

test('Home positions obtain YTD from raw quoteRows, including a holding absent from the watchlist', () => {
  const quoteRows = [quote('NVDA', 125)];
  const positions = deriveInvestmentSummary({
    stockTrades: [{ id: 1, symbol: 'NVDA', side: 'buy', date: '2026-08-03', shares: 10, price: 150 }],
    watchlist: quoteRows,
  }).activePositions;
  assert.equal(project({ positions, quoteRows, tableTab: 'positions' })[0].ytdChangePercent, 25);
  assert.equal(project({ positions, quoteRows: [], tableTab: 'positions' })[0].ytdChangePercent, null);
});

test('Home YTD uses the same locked close as its visible price and never falls back to a live price when the close is absent', () => {
  const watchlist = [
    quote('LOCKED', 160, { dailyPnlLocked: true, dailyPnlPrice: 125 }),
    ...[null, undefined, 0, ''].map((dailyPnlPrice, index) => quote(`MISSING${index}`, 160, {
      dailyPnlLocked: true, dailyPnlPrice, ytdChangePercent: 60,
    })),
  ];
  const rows = project({ watchlist });
  assert.equal(rows[0].price, 125);
  assert.equal(rows[0].ytdChangePercent, 25);
  for (const row of rows.slice(1)) {
    assert.equal(row.price, null);
    assert.equal(row.ytdChangePercent, null);
  }
});

test('a cleared watchlist baseline cannot be resurrected by another projection or the legacy percent', () => {
  const cleared = quote('NVDA', 125, { stockYtdBaseline: null, ytdChangePercent: 25 });
  const conflictingPosition = { ...quote('NVDA', 125), currentPrice: 125, holdingPnl: 0 };
  const [row] = project({ watchlist: [cleared], positions: [conflictingPosition], quoteRows: [quote('NVDA', 125)] });
  assert.equal(row.quote.stockYtdBaseline, BASELINE, 'the competing projection has an older valid baseline');
  assert.equal(row.ytdChangePercent, null, 'watchlist YTD must honor its current quote metadata');
});

test('YTD sorting orders both directions by raw values, keeps unknowns last and leaves source order unchanged', () => {
  const rawRows = project({ watchlist: [
    quote('UNKNOWN_Z', 150, { stockYtdBaseline: null }),
    quote('NEGATIVE', 75),
    quote('ZERO', 100),
    quote('POSITIVE_Z', 125),
    quote('UNKNOWN_A', 120, { stockYtdBaseline: null }),
    quote('POSITIVE_A', 125),
  ] });
  const before = structuredClone(rawRows);
  const desc = sortHomeRows(React, rawRows, { key: 'ytd', direction: 'desc' });
  const asc = sortHomeRows(React, rawRows, { key: 'ytd', direction: 'asc' });
  assert.deepEqual(desc.map(row => row.symbol), ['POSITIVE_A', 'POSITIVE_Z', 'ZERO', 'NEGATIVE', 'UNKNOWN_A', 'UNKNOWN_Z']);
  assert.deepEqual(asc.map(row => row.symbol), ['NEGATIVE', 'ZERO', 'POSITIVE_A', 'POSITIVE_Z', 'UNKNOWN_A', 'UNKNOWN_Z']);
  assert.deepEqual(rawRows, before);
  assert.equal(sortHomeRows(React, rawRows, null), rawRows, 'clearing sorting restores the original manual order');
});
