import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const homeTabSource = readFileSync(new URL('../src/tabs/HomeTab.jsx', import.meta.url), 'utf8');
const i18nSource = readFileSync(new URL('../src/lib/i18n.js', import.meta.url), 'utf8');

test('watchlist stock detail has an isolated standalone page route', () => {
  assert.ok(appSource.includes("lazy(() => import('./pages/WatchlistStockDetailPage.jsx'))"));
  assert.ok(appSource.includes("const [watchlistStockDetailSymbol, setWatchlistStockDetailSymbol] = useState('')"));
  assert.ok(appSource.includes("setActivePage('watchlist-stock-detail')"));
  assert.ok(appSource.includes("activePage === 'watchlist-stock-detail'"));
  assert.ok(appSource.includes('<WatchlistStockDetailPage ctx={tabCtx} />'));
  assert.ok(appSource.includes('isStandalonePage = isPnlReportPage || isHomeMarginRiskPage || isStockDetailPage || isWatchlistStockDetailPage'));
  assert.ok(appSource.includes('hideBottomNavigation = isPnlReportPage;'), 'only the P&L report should hide the bottom navigation');
  assert.equal(appSource.includes('hideBottomNavigation = isPnlReportPage || isHomeMarginRiskPage'), false, 'margin and watchlist detail pages must keep the bottom navigation');

  assert.ok(appSource.includes("setActivePage('stock-detail')"), 'the existing P&L stock-detail route must remain intact');
  assert.ok(appSource.includes('<StockDetailPage ctx={tabCtx} />'), 'the existing P&L stock-detail page must remain intact');
});

test('Home only opens watchlist detail from the sticky identity cell', () => {
  assert.ok(homeTabSource.includes('openWatchlistStockDetail,'));
  assert.ok(homeTabSource.includes('{isWatchlistTab ? ('), 'the new entry must be limited to the watchlist tab');
  assert.ok(homeTabSource.includes('onClick={() => openWatchlistStockDetail?.(item.symbol)}'));
  assert.ok(homeTabSource.includes("aria-label={t(language, 'watchlistDetail.openAria'"));

  const triggerIndex = homeTabSource.indexOf('onClick={() => openWatchlistStockDetail?.(item.symbol)}');
  const tableRowIndex = homeTabSource.lastIndexOf('tableRows.map((item)', triggerIndex);
  const nextPriceCellIndex = homeTabSource.indexOf('hasFiniteMarketValue(item.price)', triggerIndex);
  assert.ok(tableRowIndex >= 0 && nextPriceCellIndex > triggerIndex, 'the trigger should stay inside the sticky name/logo cell, before scrolling quote metrics');
});

test('watchlist detail return restores the prior Home scroll without replacing double-tap-to-top', () => {
  const openStart = appSource.indexOf('const openWatchlistStockDetail = useCallback');
  const openEnd = appSource.indexOf('const closeWatchlistStockDetail = useCallback', openStart);
  const openBlock = appSource.slice(openStart, openEnd);
  const bottomReturnStart = appSource.indexOf('const returnsFromWatchlistDetailToHome = (');
  const bottomReturnEnd = appSource.indexOf("if (tapAction.shouldScrollHomeToTop)", bottomReturnStart);
  const bottomReturnBlock = appSource.slice(bottomReturnStart, bottomReturnEnd);

  assert.ok(appSource.includes('const homeScrollTopBeforeWatchlistRef = useRef(null)'));
  assert.ok(appSource.includes('const pendingHomeScrollTopRef = useRef(null)'));
  assert.ok(openBlock.indexOf('if (!normalizedSymbol) return;') < openBlock.indexOf('homeScrollTopBeforeWatchlistRef.current = readRootScrollTop();'), 'an invalid symbol must not overwrite the remembered position');
  assert.ok(appSource.includes('pendingHomeScrollTopRef.current = homeScrollTopBeforeWatchlistRef.current;'), 'the page-header back action should request one restoration');
  assert.ok(bottomReturnBlock.includes("tabId === 'home'"));
  assert.ok(bottomReturnBlock.includes("activeTab === 'home'"));
  assert.ok(bottomReturnBlock.includes("activePage === 'watchlist-stock-detail'"), 'the bottom Home tab should recognize the same return path');
  assert.ok(appSource.includes('resolveNavigationScrollTarget({'), 'navigation scrolling should resolve the pending Home position centrally');
  assert.ok(appSource.includes('window.scrollTo(0, scrollTarget.top);'), 'the restored position should use the iOS-safe, non-animated numeric scroll call after the Home render');
  assert.ok(appSource.includes('homeScrollTopBeforeWatchlistRef.current = 0;'), 'double-tap-to-top should replace any older remembered position');
  assert.ok(appSource.includes("window.scrollTo({ top: 0, behavior: 'smooth' });"), 'the existing Home double-tap should remain a smooth explicit return to top');
});

test('watchlist target save only updates the matching watchlist row after DB success', () => {
  const start = appSource.indexOf('const saveWatchlistStockTarget = async');
  const end = appSource.indexOf('\n  const addStock = async', start);
  assert.ok(start >= 0 && end > start);
  const saveBlock = appSource.slice(start, end);
  assert.ok(saveBlock.includes('await db.updateWatchlistTargetPrice(symbol, targetPriceUsd)'));
  assert.ok(saveBlock.indexOf('await db.updateWatchlistTargetPrice') < saveBlock.indexOf('setWatchlist('), 'local watchlist state must update only after the DB write succeeds');
  assert.ok(saveBlock.includes('? { ...item, targetPriceUsd }'));
  assert.equal(saveBlock.includes('setStockTrades'), false);
  assert.equal(saveBlock.includes('stock_trades'), false);
  assert.ok(appSource.includes('saveWatchlistStockTarget,'), 'the page context should receive the isolated target saver');
});

test('every watchlistDetail translation key has both Chinese and English entries', () => {
  const keys = [...i18nSource.matchAll(/'watchlistDetail\.([^']+)':/g)].map((match) => match[1]);
  const counts = new Map();
  keys.forEach((key) => counts.set(key, (counts.get(key) || 0) + 1));

  assert.ok(counts.size >= 70, 'the production page should not depend on a partial translation set');
  for (const [key, count] of counts) {
    assert.equal(count, 2, `${key} should exist once in zh and once in en`);
  }

  for (const required of [
    'title',
    'regularClose',
    'technicalIndicators',
    'range.5y',
    'priceLegend',
    'ma200Daily',
    'relativeQqq3m',
    'relativeQqq3mDetail',
    'ma200Weekly',
    'weeklyCloseLocked',
    'weeklyInsufficient',
    'weeklyUnavailable',
    'myPosition',
    'targetPrice',
    'targetBoundary',
    'keyEvents',
    'recentTrades',
    'formalLedgerReadOnly',
    'loadFailed',
  ]) {
    assert.equal(counts.get(required), 2, `missing bilingual watchlistDetail.${required}`);
  }
});
