import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../src/tabs/HomeTab.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/tabs/HomeTab.css', import.meta.url), 'utf8');

test('Home report has one stable asset, market, watchlist and earnings hierarchy', () => {
  const markers = ['data-home-net-assets-card="true"', 'data-home-market-overview="true"', '<HomeWatchlistReport', '<EarningsCalendar'];
  const positions = markers.map(marker => home.indexOf(marker));
  assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])));
  assert.ok(home.includes('visualVariant="report"'));
  assert.doesNotMatch(home, /promoteEarningsCalendar|radarSpin|RadarVisual|FgiGauge/);
  assert.doesNotMatch(css, /(?:^|[}\n])\s*(?:html|body|#root|nav)\s*\{/);
  assert.doesNotMatch(css, /100vh|100dvh|position:\s*fixed|z-index/);
});

test('Home reuses financial readiness and existing cash, P&L and margin actions', () => {
  for (const invariant of [
    'assetStatusReady ?', 'displayAssetMoney.main', 'displayAssetMoney.decimal',
    'hasTodayPnl ?', 'summary.todayPnlLocked', 'onClick={openPnlShare}',
    'onClick={openPnlReport}', 'onClick={openHomeMarginRisk}',
    'disabled={!availableCashWriteReady}', 'availableCashStatusReady ?',
    'availableCashIsSet ? 2 : 0', 'onLoadCashMovements={loadAvailableCashMovements}',
    'onClick={() => setShowAvailableCashEditor(true)}',
    'formatPnl={(value) => fmtSignedCurrency(value, displayCurrency, 2)}',
  ]) assert.ok(home.includes(invariant), `Home must retain ${invariant}`);
});

test('Market visuals preserve unknown values, directional colors and neutral sentiment scales', () => {
  assert.ok(home.includes('fmtOptionalMoney(vix, 1)'));
  assert.ok(home.includes('hasFiniteMarketValue(fgi) ? Math.round(Number(fgi))'));
  assert.ok(home.includes('hasFiniteMarketValue(benchmarkDrawdown) ?'));
  assert.ok(home.includes('marketColor={(value) => marketColor(value, marketColorMode)}'));
  assert.ok(home.includes('data-home-signal-trigger'));
  assert.ok(home.includes('data-home-drawdown-trigger'));
  assert.ok(home.includes('openVixComparison?.()'));
  assert.ok(css.includes('.home-report-sentiment-reading'));
  assert.ok(css.includes('grid-template-columns: repeat(4, minmax(0, 1fr))'));
  assert.doesNotMatch(css, /radial-gradient|conic-gradient|box-shadow/);
});

test('BTC has a live-only status dot without replacing readable connection labels', () => {
  const marketCard = home.slice(home.indexOf('function MiniMarketCard('), home.indexOf('function fgiLevel('));
  assert.ok(marketCard.includes('{isBtc && realtimeLabel && ('), 'connection status remains exclusive to BTC');
  assert.match(marketCard, /className="home-report-realtime-status" data-state=\{realtimeStatus\}/);
  assert.match(marketCard, /realtimeStatus === 'live' && <i className="home-report-live-dot" aria-hidden="true" \/>/, 'only live displays the decorative green dot; other statuses keep their label');
  assert.match(marketCard, /home-report-live-dot[^\n]*\n\s*\{realtimeLabel\}/, 'LIVE and non-live status labels remain readable without color or motion');
  assert.match(css, /\.home-report-live-dot\s*\{[^}]*flex:\s*0 0 4px;[^}]*width:\s*4px;[^}]*height:\s*4px;[^}]*border-radius:\s*50%;[^}]*background:\s*#50c8a0;/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.home-report-live-dot\s*\{\s*animation:\s*none;/);
  assert.ok(home.includes('BTC_STATUS_DISPLAY_GRACE_MS = 60_000'), 'presentation preserves the existing freshness grace');
  assert.ok(home.includes('resolveBtcDisplayRealtimeStatus(resolvedBtcCard, btcRealtimeStatus)'), 'presentation reuses the existing display status');
});
