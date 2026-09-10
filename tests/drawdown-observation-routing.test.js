import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveNavigationScrollTarget } from '../src/lib/bottomTabNavigation.js';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../src/tabs/HomeTab.jsx', import.meta.url), 'utf8');

test('Home drawdown opens a lazy independent authenticated page backed by user watchlist and formal holdings', () => {
  assert.ok(app.includes("lazy(() => import('./pages/DrawdownObservationPage.jsx'))"));
  assert.ok(app.includes("const isDrawdownObservationPage = activePage === 'drawdown-observation';"));
  const standalone = app.match(/const isStandalonePage = ([^;]+);/)[1];
  assert.ok(standalone.includes('isDrawdownObservationPage'));
  const render = app.match(/<DrawdownObservationPage[^\n]+/)[0];
  assert.ok(render.includes("key={user?.id || ''}"), 'account changes must remount page-local state');
  assert.ok(render.includes("userId: user?.id || ''"));
  assert.ok(render.includes('watchlist: localizedWatchlist'), 'watchlist must not include the broader quote/tool universe');
  assert.ok(render.includes('positions: investmentSummary.positions.map(({ symbol, name, heldShares }) => ({ symbol, name, quantity: heldShares }))'));
  assert.ok(render.includes('portfolioReady: stockHoldingsReady'));
  assert.ok(render.includes('portfolioError: stockHoldingsError'));
  assert.ok(render.includes('marketColorMode'));
  assert.ok(render.includes('closeDrawdownObservation'));
  assert.doesNotMatch(render, /db|supabase|stockTrades:|costBasisData|swingWaves|setBenchmarkSymbol|previewSource|SYNTHETIC/);
  assert.ok(app.includes("hideBottomNavigation = isPnlReportPage || isPnlSharePage;"), 'observation preserves the normal bottom navigation');
});

test('drawdown viewing and explicit Home benchmark mutation remain separate controls', () => {
  const triggers = [...home.matchAll(/<button\b[^>]*data-home-drawdown-trigger[\s\S]*?<\/button>/g)].map(([block]) => block);
  assert.equal(triggers.length, 1, 'the report combines percentage and high-price context in one observation button');
  for (const block of triggers) {
    assert.ok(block.includes('onClick={() => openDrawdownObservation?.()}'));
    assert.ok(block.includes('aria-label='));
    assert.ok(block.includes('home-report-drawdown-value'));
    assert.ok(block.includes('hasFiniteMarketValue(benchmarkDrawdown)'));
    assert.ok(block.includes('home-report-drawdown-context'));
    assert.ok(block.includes('fmtOptionalMoney(benchmarkStock.price, 2)'), 'current price remains inside the observation trigger');
    assert.ok(block.includes('fmtOptionalMoney(benchmarkStock.high, 2)'), '52-week high remains inside the same observation trigger');
    assert.doesNotMatch(block, /setBenchmarkSymbol|setBenchmarkMenuOpen/);
  }
  const selector = home.match(/<button\b[^>]*data-home-signal-trigger[\s\S]*?<\/button>/)[0];
  assert.ok(selector.includes('onClick={() => setBenchmarkMenuOpen(true)}'));
  assert.ok(selector.includes("'home.switchBenchmark', '切换基准'"));
  assert.doesNotMatch(selector, /openDrawdownObservation|data-home-drawdown-trigger/, 'benchmark selection stays separate from read-only observation');
  const option = home.slice(home.indexOf('data-home-signal-option={row.symbol}'), home.indexOf('data-home-signal-option={row.symbol}') + 400);
  assert.ok(option.includes('setBenchmarkSymbol(row.symbol);'), 'existing benchmark changes remain possible through explicit selection');
});

test('entering and leaving observation preserves Home scroll without changing the benchmark', () => {
  const source = app.slice(app.indexOf('const openDrawdownObservation ='), app.indexOf('const openVixComparison ='));
  const calls = [];
  const homeScroll = { current: null };
  const pendingScroll = { current: 99 };
  const make = new Function(
    'useCallback', 'activeTab', 'activePage', 'homeScrollTopBeforeDrawdownRef',
    'pendingHomeScrollTopRef', 'readRootScrollTop', 'setBenchmarkMenuOpen', 'setActiveTab', 'setActivePage',
    `${source}; return { openDrawdownObservation, closeDrawdownObservation };`,
  );
  const handlers = make((callback) => callback, 'home', null, homeScroll, pendingScroll, () => 384,
    (value) => calls.push(['sheet', value]), (value) => calls.push(['tab', value]), (value) => calls.push(['page', value]));
  handlers.openDrawdownObservation();
  assert.equal(homeScroll.current, 384);
  assert.equal(pendingScroll.current, null);
  assert.deepEqual(calls, [['sheet', false], ['tab', 'home'], ['page', 'drawdown-observation']]);
  calls.length = 0;
  handlers.closeDrawdownObservation();
  assert.equal(pendingScroll.current, 384);
  assert.deepEqual(calls, [['tab', 'home'], ['page', null]]);
  assert.deepEqual(resolveNavigationScrollTarget({ activeTab: 'home', activePage: null, pendingHomeScrollTop: pendingScroll.current }), { top: 384, shouldRestoreHomeScroll: true });
  assert.doesNotMatch(source, /setBenchmarkSymbol|fetch|localStorage|db\.|supabase|quote|realtime/i);
});

test('bottom Home restores the same observation entry position while other tabs remain ordinary navigation', () => {
  const bottom = app.slice(app.indexOf('const handleBottomTabClick ='), app.indexOf('const [portfolioCurrencyMode,'));
  assert.ok(bottom.includes('const returnsFromDrawdownToHome = ('));
  assert.ok(bottom.includes("activePage === 'drawdown-observation'"));
  assert.ok(bottom.includes('? homeScrollTopBeforeDrawdownRef.current'));
  const block = bottom.slice(bottom.indexOf('const returnsFromDrawdownToHome = ('), bottom.indexOf('pendingHomeScrollTopRef.current ='));
  assert.ok(block.includes("tabId === 'home'"));
  assert.ok(block.includes("activeTab === 'home'"));
  assert.deepEqual(resolveNavigationScrollTarget({ activeTab: 'trades', activePage: null, pendingHomeScrollTop: 384 }), { top: 0, shouldRestoreHomeScroll: false });
});
