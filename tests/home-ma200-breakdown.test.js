import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  HOME_MA200_MAX_COMPLETED_DAYS,
  HOME_MA200_DEFAULT_ROWS,
  buildHomeMa200BreakdownModel,
  selectHomeMa200SymbolsForBatch,
} from '../src/lib/homeMa200Breakdown.js';
import { t } from '../src/lib/i18n.js';
import { mergeQuoteBaselineRows } from '../src/lib/quoteRefreshPolicy.js';

function monitor(overrides = {}) {
  return {
    status: 'ready',
    source: 'EODHD',
    priceBasis: 'eodhd_adjusted_close',
    asOfDate: '2026-07-31',
    completedClose: 110,
    ma200: 100,
    distancePct: 10,
    belowCompletedDays: 0,
    ...overrides,
  };
}

test('home MA200 model only uses watchlist rows and keeps every eligible signal for the expandable list', () => {
  const model = buildHomeMa200BreakdownModel({
    watchlist: [
      { symbol: 'META', name: 'Meta' },
      { symbol: 'TSM', name: '台积电' },
      { symbol: 'MSFT', name: '微软' },
      { symbol: 'AAPL', name: '苹果' },
      { symbol: 'GOOGL', name: '谷歌' },
      { symbol: 'AMZN', name: '亚马逊' },
    ],
    quoteRows: [
      { symbol: 'META', price: 620.18, ma200Monitor: monitor({ completedClose: 618.42, ma200: 633.37, belowCompletedDays: 1 }) },
      { symbol: 'TSM', price: 285.24, ma200Monitor: monitor({ completedClose: 284.10, ma200: 289.37, belowCompletedDays: 2 }) },
      { symbol: 'MSFT', price: 532.60, ma200Monitor: monitor({ completedClose: 540.12, ma200: 536.57 }) },
      { symbol: 'AAPL', price: 99.8, ma200Monitor: monitor({ completedClose: 101, ma200: 100 }) },
      { symbol: 'GOOGL', price: 88, ma200Monitor: monitor({ completedClose: 89, ma200: 100, belowCompletedDays: 3 }) },
      { symbol: 'AMZN', price: 91, ma200Monitor: monitor({ completedClose: 92, ma200: 100, belowCompletedDays: 4 }) },
      { symbol: 'NVDA', price: 88, ma200Monitor: monitor({ completedClose: 89, ma200: 100, belowCompletedDays: 3 }) },
    ],
  });

  assert.equal(model.confirmedCount, 4);
  assert.equal(model.intradayCount, 2);
  assert.equal(HOME_MA200_DEFAULT_ROWS, 5);
  assert.equal(model.rows.length, 6, 'the model must not discard rows beyond the default five');
  assert.deepEqual(model.rows.map((row) => [row.symbol, row.status]), [
    ['MSFT', 'intraday'],
    ['AAPL', 'intraday'],
    ['META', 'confirmed'],
    ['TSM', 'confirmed'],
    ['GOOGL', 'confirmed'],
    ['AMZN', 'confirmed'],
  ]);
  assert.equal(model.rows.some((row) => row.symbol === 'NVDA'), false, 'holdings outside the watchlist must never enter the card');
  assert.equal(model.rows[2].company, 'Meta');
  assert.ok(Math.abs(model.rows[2].distancePct - (((618.42 / 633.37) - 1) * 100)) < 1e-12);
  assert.ok(Math.abs(model.rows[0].distancePct - (((532.60 / 536.57) - 1) * 100)) < 1e-12, 'intraday distance must use the current quote');
});

test('home MA200 model enforces completed-close, strict-below, and 20-session boundaries', () => {
  const model = buildHomeMa200BreakdownModel({
    watchlist: [
      { symbol: 'DAY20' },
      { symbol: 'DAY21' },
      { symbol: 'EQUAL' },
      { symbol: 'OLD_BASIS' },
      { symbol: 'INSUFFICIENT' },
    ],
    quoteRows: [
      { symbol: 'DAY20', price: 94, ma200Monitor: monitor({ completedClose: 95, ma200: 100, belowCompletedDays: HOME_MA200_MAX_COMPLETED_DAYS }) },
      { symbol: 'DAY21', price: 93, ma200Monitor: monitor({ completedClose: 94, ma200: 100, belowCompletedDays: HOME_MA200_MAX_COMPLETED_DAYS + 1 }) },
      { symbol: 'EQUAL', price: 100, ma200Monitor: monitor({ completedClose: 100, ma200: 100, belowCompletedDays: 0 }) },
      { symbol: 'OLD_BASIS', price: 90, ma200Monitor: monitor({ priceBasis: 'adjusted_close', completedClose: 101, ma200: 100 }) },
      { symbol: 'INSUFFICIENT', price: 90, ma200Monitor: { status: 'insufficient_data', source: 'EODHD', priceBasis: 'eodhd_adjusted_close' } },
    ],
  });

  assert.deepEqual(model.rows.map((row) => row.symbol), ['DAY20']);
  assert.equal(model.confirmedCount, 1);
  assert.equal(model.intradayCount, 0);
  assert.equal(model.hasIncompleteData, true);
  assert.equal(model.hasOutsideWindowBreakdown, true);
  assert.equal(model.latestAsOfDate, '2026-07-31');
});

test('MA200 batch selector sends only the current batch watchlist subset', () => {
  const watchlist = [{ symbol: 'aapl' }, { symbol: 'MSFT.US' }, { symbol: 'TSM' }];
  assert.deepEqual(
    selectHomeMa200SymbolsForBatch(['QQQ', 'AAPL', 'NVDA', 'MSFT', 'VIX'], watchlist),
    ['AAPL', 'MSFT'],
  );
  assert.deepEqual(
    selectHomeMa200SymbolsForBatch(['NVDA', 'QQQ'], watchlist),
    [],
    'holdings-only and core symbols must not request MA200 monitoring',
  );
});

test('home MA200 labels remain bilingual', () => {
  assert.equal(t('zh', 'home.ma200Monitor.title'), 'MA200 跌破监控');
  assert.equal(t('en', 'home.ma200Monitor.title'), 'MA200 Breakdown');
  assert.equal(
    t('en', 'home.ma200Monitor.confirmedCount', '', { count: 2 }),
    '2 confirmed',
  );
  assert.equal(t('zh', 'home.ma200Monitor.expandMore', '', { count: 7 }), '展开更多（共 7 只）');
  assert.equal(t('en', 'home.ma200Monitor.collapse'), 'Collapse');
});

test('legacy or partial quote refreshes preserve the last valid MA200 monitor object', () => {
  const previous = monitor({ asOfDate: '2026-07-31', completedClose: 95, ma200: 100, belowCompletedDays: 2 });
  assert.deepEqual(
    mergeQuoteBaselineRows(
      [{ symbol: 'META', price: 95, ma200Monitor: previous }],
      [{ symbol: 'META', price: 96 }],
    )[0].ma200Monitor,
    previous,
  );
  const older = monitor({ asOfDate: '2026-07-30', completedClose: 96, ma200: 100, belowCompletedDays: 1 });
  assert.deepEqual(
    mergeQuoteBaselineRows(
      [{ symbol: 'META', price: 95, ma200Monitor: previous }],
      [{ symbol: 'META', price: 96, ma200Monitor: older }],
    )[0].ma200Monitor,
    previous,
    'an older completed-close response must not replace a newer monitor',
  );
  assert.deepEqual(
    mergeQuoteBaselineRows(
      [{ symbol: 'META', price: 95, ma200Monitor: previous }],
      [{ symbol: 'META', price: 96, ma200Monitor: { status: 'insufficient_data', source: 'EODHD', priceBasis: 'eodhd_adjusted_close', asOfDate: '2026-08-03' } }],
    )[0].ma200Monitor,
    previous,
    'an incomplete response must not erase the last valid completed-close monitor',
  );
  const next = monitor({ asOfDate: '2026-08-03', completedClose: 94, ma200: 101, belowCompletedDays: 3 });
  assert.deepEqual(
    mergeQuoteBaselineRows(
      [{ symbol: 'META', price: 95, ma200Monitor: previous }],
      [{ symbol: 'META', price: 96, ma200Monitor: next }],
    )[0].ma200Monitor,
    next,
  );
});

test('home component and App keep MA200 monitoring read-only, co-batched, and directly below earnings', async () => {
  const [componentSource, homeSource, appSource, previewSource] = await Promise.all([
    readFile(new URL('../src/components/HomeMa200BreakdownMonitor.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/tabs/HomeTab.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8'),
  ]);

  assert.equal(componentSource.includes('fetch('), false);
  assert.equal(componentSource.includes('stockTrades'), false);
  assert.equal(componentSource.includes('positions'), false);
  assert.ok(componentSource.includes("const GRID_TEMPLATE = '68fr 64fr 64fr 69fr 70fr'"));
  assert.ok(componentSource.includes('buildHomeMa200BreakdownModel({ watchlist, quoteRows })'));
  assert.ok(componentSource.includes('model.rows.slice(0, HOME_MA200_DEFAULT_ROWS)'));
  assert.ok(componentSource.includes('aria-expanded={expanded}'));
  assert.ok(componentSource.includes('data-home-ma200-expand="true"'));
  assert.ok(componentSource.includes('onClick={() => onOpenStock?.(row.symbol)}'));
  assert.ok(componentSource.includes("'watchlistDetail.openAria'"));

  const earningsIndex = homeSource.indexOf('<EarningsCalendar');
  const monitorIndex = homeSource.indexOf('<HomeMa200BreakdownMonitor');
  assert.ok(earningsIndex >= 0 && monitorIndex > earningsIndex);
  assert.equal(
    homeSource.slice(earningsIndex, monitorIndex).includes("placementClassName={promoteEarningsCalendar ? 'order-1' : 'order-3'}"),
    true,
  );
  assert.equal(
    homeSource.slice(monitorIndex, monitorIndex + 360).includes("placementClassName={promoteEarningsCalendar ? 'order-1' : 'order-3'}"),
    true,
  );
  assert.equal(
    homeSource.slice(monitorIndex, monitorIndex + 420).includes('onOpenStock={openWatchlistStockDetail}'),
    true,
  );

  assert.ok(appSource.includes("params.set('ma200Symbols', ma200Symbols.join(','))"));
  assert.ok(appSource.includes('selectHomeMa200SymbolsForBatch(batch, ma200Watchlist)'));
  assert.ok(appSource.includes('ma200SymbolsOverride: Array.isArray(result?.watchlist) ? result.watchlist : undefined'));
  assert.ok(appSource.includes('ma200SymbolsOverride: Array.isArray(cloudResult?.watchlist) ? cloudResult.watchlist : undefined'));
  assert.ok(appSource.includes('ma200Monitor: mergeMa200Monitor(s.ma200Monitor, fresh.ma200Monitor ?? s.ma200Monitor)'));
  assert.ok(appSource.includes('fetchQuote(symbol, { fresh: true, ma200Symbols: [symbol] })'));
  assert.ok(appSource.includes('ma200Monitor: fresh?.ma200Monitor ?? null'));

  assert.ok(previewSource.includes("preview === 'home-ma200-breakdown'"));
  assert.ok(previewSource.includes('setPreviewWatchlistDetailSymbol(normalizedSymbol)'));
  assert.ok(previewSource.includes("setActiveTab('watchlist-stock-detail')"));
  assert.equal(previewSource.match(/priceBasis: 'eodhd_adjusted_close'/g)?.length >= 6, true);
  assert.equal(previewSource.match(/belowCompletedDays: [12]/g)?.length >= 2, true);
  assert.ok(previewSource.includes('belowCompletedDays: 0'));
});
