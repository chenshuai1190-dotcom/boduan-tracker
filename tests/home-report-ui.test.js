import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { isBtcMarketCard } from '../src/lib/btcRealtime.js';
import { formatIndexQuoteTime, resolveIndexQuoteStatus } from '../src/lib/indexRealtime.js';
import { t } from '../src/lib/i18n.js';

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

test('index cards omit the normal status node while retaining quote time and exceptional states', async () => {
  const source = home.slice(home.indexOf('function MiniMarketCard('), home.indexOf('function fgiLevel('));
  const { code } = await transformWithOxc(source, 'MiniMarketCard.jsx', { jsx: { runtime: 'classic' } });
  const dependencies = {
    React, t, isBtcMarketCard, formatIndexQuoteTime, resolveIndexQuoteStatus,
    NUMBER_FONT: 'sans-serif', Sparkline: () => null,
    marketCardName: item => item.displaySymbol,
    hasFiniteMarketValue: value => value != null && Number.isFinite(Number(value)),
    marketColor: () => '#ffffff',
    marketRealtimeLabel: status => status === 'live' ? 'LIVE' : '',
    fmtOptionalMoney: value => value == null ? '--' : String(value),
    fmtOptionalMarketPct: value => value == null ? '--' : String(value),
  };
  const MiniMarketCard = new Function('dependencies', `const { ${Object.keys(dependencies).join(', ')} } = dependencies; ${code}; return MiniMarketCard;`)(dependencies);
  const timestamp = Date.now() - 60_000;
  const quoteAt = new Date(timestamp).toISOString();
  const item = { symbol: 'GSPC.INDX', displaySymbol: '.SPX', price: 6500, changePercent: .4, timestamp, quoteAt, source: 'EODHD_REST' };
  const render = (overrides = {}, language = 'zh') => renderToStaticMarkup(React.createElement(MiniMarketCard, { item: { ...item, ...overrides }, language }));

  for (const language of ['zh', 'en']) {
    const normal = render({}, language);
    assert.match(normal, /data-index-quote-status="delayed"><time /);
    assert.ok(normal.includes(`dateTime="${quoteAt}"`));
    assert.ok(normal.includes(formatIndexQuoteTime(item, language)));
    assert.doesNotMatch(normal, /<span\b|LIVE|延迟报价|Delayed/);
  }
  assert.match(render({ fetchError: true }), /<span>待更新<\/span>/);
  assert.match(render({ fetchError: true }, 'en'), /<span>Awaiting update<\/span>/);
  assert.match(render({ price: null, timestamp: null, quoteAt: null }), /<span>暂无报价<\/span>/);
  assert.match(render({ price: null, timestamp: null, quoteAt: null }, 'en'), /<span>Unavailable<\/span>/);
  assert.match(render({ symbol: 'BTC-USD.CC', displaySymbol: 'BTCUSD', realtimeStatus: 'live' }), /home-report-live-dot/);
});
