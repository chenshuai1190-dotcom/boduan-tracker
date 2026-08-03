import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildQuoteBaselineRows,
  buildQuoteBaselineUniverseKey,
  getQuoteBaselineRefreshDelay,
  getQuoteBaselineRefreshInterval,
  getQuoteBaselineSession,
  getQuoteCloseSettlementKey,
  isRegularNyseHoliday,
  isQuoteBaselineUniverseExpansion,
  mergeQuoteBaselineRows,
  QUOTE_BASELINE_REFRESH_INTERVAL_MS,
  selectQuoteBaselineSymbols,
  shouldQueueQuoteBaselineExpansion,
  shouldRunQuoteBaselineRefresh,
} from '../src/lib/quoteRefreshPolicy.js';

test('full REST baseline uses 15/30/60 minute market-session intervals', () => {
  assert.equal(getQuoteBaselineRefreshInterval('regular'), 15 * 60 * 1000);
  assert.equal(getQuoteBaselineRefreshInterval('premarket'), 30 * 60 * 1000);
  assert.equal(getQuoteBaselineRefreshInterval('postmarket'), 30 * 60 * 1000);
  assert.equal(getQuoteBaselineRefreshInterval('closed'), 60 * 60 * 1000);
  assert.equal(getQuoteBaselineRefreshInterval('unknown'), QUOTE_BASELINE_REFRESH_INTERVAL_MS.closed);
});

test('regular NYSE holidays use the closed-session cadence', () => {
  const holiday = new Date('2026-07-03T14:00:00.000Z');
  assert.equal(isRegularNyseHoliday('2026-07-03'), true);
  assert.equal(getQuoteBaselineSession(holiday, 'regular'), 'closed');
  assert.equal(
    getQuoteBaselineRefreshInterval(getQuoteBaselineSession(holiday, 'regular')),
    60 * 60 * 1000,
  );
  assert.equal(getQuoteBaselineSession(new Date('2026-07-02T14:00:00.000Z'), 'regular'), 'regular');
  assert.equal(isRegularNyseHoliday('2027-12-31'), false, 'a Saturday New Year must not close the preceding Friday');
  assert.equal(isRegularNyseHoliday('2028-01-01'), true);
});

test('automatic focus-style refreshes run only when the baseline is due', () => {
  const now = Date.UTC(2026, 6, 31, 15, 0, 0);
  const interval = getQuoteBaselineRefreshInterval('regular');

  assert.equal(shouldRunQuoteBaselineRefresh({ session: 'regular', now }), true);
  assert.equal(shouldRunQuoteBaselineRefresh({
    session: 'regular',
    now,
    lastSuccessAt: now - interval + 1,
  }), false);
  assert.equal(shouldRunQuoteBaselineRefresh({
    session: 'regular',
    now,
    lastSuccessAt: now - interval,
  }), true);
  assert.equal(shouldRunQuoteBaselineRefresh({
    session: 'regular',
    now,
    lastSuccessAt: now - interval * 2,
    lastAttemptAt: now - 1000,
  }), false, 'a failed attempt also gets one interval of provider-protection cooldown');
  assert.equal(shouldRunQuoteBaselineRefresh({
    session: 'regular',
    now,
    lastSuccessAt: now - 1000,
    lastAttemptAt: now - 1000,
    force: true,
  }), true, 'manual refresh bypasses the automatic cadence gate');
  assert.equal(getQuoteBaselineRefreshDelay({
    session: 'regular',
    now,
    lastSuccessAt: now - (10 * 60 * 1000),
  }), 5 * 60 * 1000, 'rescheduling keeps the original due time instead of postponing another full interval');
});

test('a market-session transition gets one automatic baseline without opening a retry loop', () => {
  const now = Date.UTC(2026, 6, 31, 20, 0, 0);

  assert.equal(shouldRunQuoteBaselineRefresh({
    session: 'postmarket',
    now,
    lastSuccessAt: now - 60_000,
    lastAttemptAt: now - 60_000,
    lastAttemptSession: 'regular',
  }), true, 'the regular close transition must not wait up to 30 minutes for the locked close');

  assert.equal(shouldRunQuoteBaselineRefresh({
    session: 'postmarket',
    now: now + 1000,
    lastSuccessAt: now - 60_000,
    lastAttemptAt: now,
    lastAttemptSession: 'postmarket',
  }), false, 'after the transition attempt, focus/pageshow remain gated even if it failed');

  const settlementAt = now + (5 * 60 * 1000);
  const settlementKey = getQuoteCloseSettlementKey({ session: 'postmarket', now: settlementAt });
  assert.equal(settlementKey, '2026-07-31');
  assert.equal(shouldRunQuoteBaselineRefresh({
    session: 'postmarket',
    now: settlementAt,
    lastSuccessAt: now + 1000,
    lastAttemptAt: now,
    lastAttemptSession: 'postmarket',
  }), true, '16:05 ET gets one automatic close-settlement confirmation');
  assert.equal(shouldRunQuoteBaselineRefresh({
    session: 'postmarket',
    now: settlementAt,
    lastSuccessAt: now - 1000,
    lastAttemptAt: now,
    lastAttemptSession: 'postmarket',
  }), false, 'a failed transition attempt keeps its full provider-protection cooldown');
  assert.equal(shouldRunQuoteBaselineRefresh({
    session: 'postmarket',
    now: settlementAt + 1000,
    lastSuccessAt: now,
    lastAttemptAt: settlementAt,
    lastAttemptSession: 'postmarket',
    lastCloseSettlementKey: settlementKey,
  }), false, 'the close-settlement confirmation is attempted only once per market date');
});

test('baseline symbols contain only live holdings, watchlist, and active swing rows', () => {
  const symbols = selectQuoteBaselineSymbols({
    stockTrades: [
      { id: 1, symbol: 'NVDA', side: 'buy', date: '2026-01-01', price: 100, shares: 10 },
      { id: 2, symbol: 'NVDA', side: 'sell', date: '2026-01-02', price: 120, shares: 2 },
      { id: 3, symbol: 'MSFT', side: 'buy', date: '2026-01-01', price: 300, shares: 5 },
      { id: 4, symbol: 'MSFT', side: 'sell', date: '2026-01-02', price: 320, shares: 5 },
    ],
    watchlist: [{ symbol: 'AAPL', name: 'Apple' }],
    activeSwingRows: [
      { symbol: 'SOXL', status: 'active' },
      { symbol: 'NOK', status: 'completed' },
      { symbol: 'T S M' },
    ],
  });

  assert.deepEqual(symbols.sort(), ['AAPL', 'NVDA', 'SOXL', 'TSM']);
});

test('baseline rows drop closed ledgers and old tool-only symbols while preserving cached values', () => {
  const stockTrades = [
    { id: 1, symbol: 'NVDA', name: 'NVIDIA', side: 'buy', date: '2026-01-01', price: 100, shares: 10 },
    { id: 2, symbol: 'MSFT', name: 'Microsoft', side: 'buy', date: '2026-01-01', price: 300, shares: 5 },
    { id: 3, symbol: 'MSFT', name: 'Microsoft', side: 'sell', date: '2026-01-02', price: 320, shares: 5 },
  ];
  const watchlist = [{ symbol: 'AAPL', name: 'Apple', price: 190 }];
  const activeSwingRows = [{ symbol: 'SOXL', name: '3x Semiconductor', price: 45 }];
  const rows = buildQuoteBaselineRows({
    stockTrades,
    watchlist,
    activeSwingRows,
    candidateRows: [
      { symbol: 'NVDA', name: 'NVIDIA', price: 210, previousClose: 205 },
      { symbol: 'MSFT', name: 'Microsoft', price: 400 },
      { symbol: 'AAPL', name: 'Apple', price: 195, previousClose: 194 },
      { symbol: 'SOXL', name: '3x Semiconductor', price: 46 },
      { symbol: 'IBKR', name: 'old cost tool', price: 80 },
    ],
  });

  assert.deepEqual(rows.map((row) => row.symbol).sort(), ['AAPL', 'NVDA', 'SOXL']);
  assert.equal(rows.find((row) => row.symbol === 'AAPL').price, 195, 'merged quote cache wins over the raw watchlist fallback');
  assert.equal(rows.find((row) => row.symbol === 'NVDA').previousClose, 205);
});

test('a slow cloud bootstrap may expand the core baseline exactly once', () => {
  const coreKey = buildQuoteBaselineUniverseKey([], ['QQQ', 'TQQQ']);
  const cloudKey = buildQuoteBaselineUniverseKey(
    [{ symbol: 'NVDA' }, { symbol: 'MSFT' }],
    ['QQQ', 'TQQQ'],
  );

  assert.equal(coreKey, 'QQQ,TQQQ');
  assert.equal(cloudKey, 'MSFT,NVDA,QQQ,TQQQ');
  assert.equal(isQuoteBaselineUniverseExpansion(coreKey, cloudKey), true);
  assert.equal(isQuoteBaselineUniverseExpansion(cloudKey, cloudKey), false);
  assert.equal(isQuoteBaselineUniverseExpansion(cloudKey, coreKey), false);
  assert.equal(
    isQuoteBaselineUniverseExpansion('OLD,QQQ,TQQQ', 'NVDA,QQQ,TQQQ'),
    true,
    'a same-size symbol replacement still adds coverage that needs one baseline',
  );
  assert.equal(
    isQuoteBaselineUniverseExpansion('MSFT,NVDA,QQQ,TQQQ', 'NVDA,QQQ,TQQQ'),
    false,
    'pure symbol removal must not bypass the cadence',
  );
  assert.equal(
    isQuoteBaselineUniverseExpansion('QQQ,TQQQ', 'QQQ,TQQQ', {
      previousRowCount: 0,
      nextRowCount: 2,
    }),
    true,
    'a QQQ/TQQQ-only cloud ledger still needs one hydration after the core-only request',
  );
  assert.equal(
    isQuoteBaselineUniverseExpansion('QQQ,TQQQ', 'QQQ,TQQQ', {
      previousRowCount: 2,
      nextRowCount: 2,
    }),
    false,
    'an already hydrated core-only ledger must not bypass the cadence again',
  );
  assert.equal(shouldQueueQuoteBaselineExpansion({
    fetchInFlight: true,
    queueIfBusy: true,
    universeExpanded: true,
  }), true, 'a cloud universe arriving during the core request must wait for its result');
  assert.equal(shouldQueueQuoteBaselineExpansion({
    fetchInFlight: false,
    queueIfBusy: true,
    universeExpanded: true,
  }), false);
  assert.equal(shouldRunQuoteBaselineRefresh({
    session: 'regular',
    now: Date.UTC(2026, 6, 31, 15, 0, 0),
    lastSuccessAt: Date.UTC(2026, 6, 31, 15, 0, 0),
    lastAttemptAt: Date.UTC(2026, 6, 31, 14, 59, 59),
    lastAttemptSession: 'regular',
    universeExpanded: true,
  }), true);
  assert.equal(shouldRunQuoteBaselineRefresh({
    session: 'regular',
    now: Date.UTC(2026, 6, 31, 15, 0, 0),
    lastSuccessAt: Date.UTC(2026, 6, 31, 14, 59, 58),
    lastAttemptAt: Date.UTC(2026, 6, 31, 14, 59, 59),
    lastAttemptSession: 'regular',
    universeExpanded: true,
  }), false, 'a failed core bootstrap must not be followed by an immediate expanded retry');
});

test('refreshing the baseline preserves valid quotes outside the request universe', () => {
  const rows = mergeQuoteBaselineRows(
    [
      { symbol: 'NVDA', price: 200, previousClose: 195 },
      { symbol: 'CLOSED', price: 88, previousClose: 87 },
    ],
    [{ symbol: 'NVDA', price: 210, previousClose: 205 }],
  );

  assert.deepEqual(rows, [
    { symbol: 'NVDA', price: 210, previousClose: 205 },
    { symbol: 'CLOSED', price: 88, previousClose: 87 },
  ]);

  assert.deepEqual(
    mergeQuoteBaselineRows(
      [{ symbol: 'NVDA', price: 210, dailyPnlPrice: 205 }],
      [{ symbol: 'NVDA', price: 0, dailyPnlPrice: null }],
    ),
    [{ symbol: 'NVDA', price: 210, dailyPnlPrice: 205 }],
    'an unavailable baseline response must not erase the latest valid public quote fields',
  );
});

test('App wires the low-frequency gate without replacing iOS snapshot bursts or stock WebSocket ticks', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const pollingEffect = source.slice(
    source.indexOf('// 自动 REST 只做低频完整基线'),
    source.indexOf('// 当前激活的底部 tab'),
  );
  const cloudRefreshBlock = source.slice(
    source.indexOf('quoteRefreshFromCloudResultRef.current = (result) => {'),
    source.indexOf('useEffect(() => () => {', source.indexOf('quoteRefreshFromCloudResultRef.current = (result) => {')),
  );

  assert.match(source, /getQuoteBaselineRefreshDelay\(\{/);
  assert.match(source, /getQuoteBaselineSession\(baselineDate, getUsMarketSession\(baselineDate\)\)/);
  assert.match(source, /shouldRunQuoteBaselineRefresh\(\{/);
  assert.match(source, /lastAttemptSession: quoteBaselineRefreshRef\.current\.lastAttemptSession/);
  assert.match(source, /lastCloseSettlementKey: quoteBaselineRefreshRef\.current\.lastCloseSettlementKey/);
  assert.match(source, /allowBaselineExpansion: true/);
  assert.equal(
    source.match(/allowBaselineExpansion: true/g)?.length,
    1,
    'only the cloud bootstrap may bypass cadence for a strict one-time universe expansion',
  );
  assert.ok(
    source.indexOf('shouldRunQuoteBaselineRefresh({') < source.indexOf("fetchQuote(batch.join(','), { fresh: true, ma200Symbols })"),
    'the central cadence gate must run before any quote batch can reach the network',
  );
  assert.match(source, /Array\.isArray\(quoteBaselineRowsRef\.current\) \? quoteBaselineRowsRef\.current : quoteBaselineRows/);
  assert.match(source, /const coreSymbols = \['QQQ', 'TQQQ'\]/);
  assert.match(source, /iosPwaRealtimeSnapshotBurstRef\.current\(nextTrigger, \{ resetFreshness \}\)/);
  assert.match(source, /requestQuickQuoteRefresh\(quoteBaselineRowsRef\.current, \{/);
  assert.match(source, /document\.hidden && !allowBaselineExpansion/);
  assert.match(source, /requestOptions\.forceBaseline === true\s*\? 3\s*:\s*\(\(allowBaselineExpansion \|\| requestOptions\.force\) \? 2 : 1\)/);
  assert.match(cloudRefreshBlock, /const cloudBaselineRows = buildQuoteRowsFromCloudResult\(result\)/);
  assert.match(cloudRefreshBlock, /const snapshotStarted = iosPwaRealtimeSnapshotBurstRef\.current\(/);
  assert.match(cloudRefreshBlock, /requestQuickQuoteRefresh\(cloudBaselineRows, \{/);
  assert.ok(
    cloudRefreshBlock.indexOf('const snapshotStarted = iosPwaRealtimeSnapshotBurstRef.current(')
      < cloudRefreshBlock.indexOf('requestQuickQuoteRefresh(cloudBaselineRows, {'),
    'iOS PWA must start its realtime snapshot burst before the gated completed-close baseline',
  );
  assert.doesNotMatch(
    cloudRefreshBlock,
    /iosPwaRealtimeSnapshotBurstRef\.current\([^;]+\)\) return;/,
    'iOS PWA snapshot startup must not suppress the one gated cloud-universe baseline',
  );
  assert.match(source, /forceBaseline: true/);
  assert.equal(
    source.match(/forceBaseline: true/g)?.length,
    2,
    'only the two manual refresh entry points may bypass the baseline gate',
  );
  assert.doesNotMatch(source, /const getMarketRefreshInterval =/);
  assert.match(pollingEffect, /Math\.min\(remainingMs \|\| 1000, 60 \* 1000\)/);
  assert.doesNotMatch(pollingEffect, /quoteRows\.length/);
});
