import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseStockUpstreamMessage,
} from '../server/realtime/stocks.js';
import {
  buildStocksSnapshotMetadata,
  createTradeStartScheduler,
  evaluateStocksSnapshotWait,
} from '../server/realtime/stocksRelay.js';

function stockTick(symbol, receivedAt, price = 100) {
  return {
    type: 'stock_tick',
    symbol,
    price,
    receivedAt,
    timestamp: receivedAt,
    source: 'EODHD_WS',
  };
}

test('quote-first scheduler starts trade immediately on readiness and clears the stagger timer', () => {
  let scheduledCallback = null;
  let scheduledDelay = null;
  let cleared = 0;
  let starts = 0;
  const timerHandle = { id: 'trade-stagger' };
  const scheduler = createTradeStartScheduler({
    delayMs: 1_300,
    startTrade: () => {
      starts += 1;
    },
    setTimer: (callback, delay) => {
      scheduledCallback = callback;
      scheduledDelay = delay;
      return timerHandle;
    },
    clearTimer: (handle) => {
      assert.equal(handle, timerHandle);
      cleared += 1;
    },
  });

  assert.equal(scheduler.schedule(), true);
  assert.equal(scheduler.schedule(), false);
  assert.equal(scheduler.isPending(), true);
  assert.equal(scheduledDelay, 1_300);
  assert.equal(typeof scheduledCallback, 'function');

  assert.equal(scheduler.startNow(), true);
  assert.equal(starts, 1);
  assert.equal(cleared, 1);
  assert.equal(scheduler.isPending(), false);
});

test('quote-first scheduler does not start delayed trade after consumers disappear', () => {
  let active = true;
  let scheduledCallback = null;
  let starts = 0;
  const scheduler = createTradeStartScheduler({
    hasConsumers: () => active,
    startTrade: () => {
      starts += 1;
    },
    setTimer: (callback) => {
      scheduledCallback = callback;
      return 1;
    },
  });

  assert.equal(scheduler.schedule(), true);
  active = false;
  scheduledCallback();
  assert.equal(starts, 0);
  assert.equal(scheduler.isPending(), false);
  assert.equal(scheduler.startNow(), false);
});

test('stock provider status requires explicit authorization and omits provider message text', () => {
  assert.deepEqual(
    parseStockUpstreamMessage({
      status_code: 200,
      message: 'Authorized',
    }),
    {
      kind: 'status',
      status: {
        statusCode: 200,
        authorized: true,
        isError: false,
      },
    },
  );

  const rejected = parseStockUpstreamMessage({
    status_code: 422,
    message: 'token=must-not-be-forwarded',
  });
  assert.deepEqual(rejected, {
    kind: 'status',
    status: {
      statusCode: 422,
      authorized: false,
      isError: true,
    },
  });
  assert.equal(JSON.stringify(rejected).includes('must-not-be-forwarded'), false);
});

test('stock provider message accepts a usable tick when no status frame is present', () => {
  const parsed = parseStockUpstreamMessage({
    s: 'NVDA',
    p: 203.42,
    t: 1_785_000_000_000,
  }, {
    symbols: new Set(['NVDA']),
    receivedAt: 1_785_000_000_250,
  });

  assert.equal(parsed.kind, 'tick');
  assert.equal(parsed.tick.symbol, 'NVDA');
  assert.equal(parsed.tick.price, 203.42);
  assert.equal(parsed.tick.receivedAt, 1_785_000_000_250);
});

test('stock snapshot metadata reports coverage, missing symbols, and per-symbol age', () => {
  const metadata = buildStocksSnapshotMetadata({
    symbols: ['NVDA', 'MSFT', 'TSM'],
    ticks: [
      stockTick('NVDA', 1_200, 203.42),
      stockTick('TSM', 800, 190.1),
    ],
    startedAt: 1_000,
    receivedAt: 1_500,
  });

  assert.deepEqual(metadata.coverage, {
    requestedCount: 3,
    coveredCount: 2,
    missingCount: 1,
    freshSinceRequestCount: 1,
    targetCount: 3,
    ratio: 2 / 3,
    complete: false,
    missingSymbols: ['MSFT'],
  });
  assert.deepEqual(metadata.symbolMeta.NVDA, {
    covered: true,
    missing: false,
    ageMs: 300,
    receivedAt: 1_200,
    freshSinceRequest: true,
    source: 'EODHD_WS',
  });
  assert.equal(metadata.symbolMeta.MSFT.missing, true);
  assert.equal(metadata.symbolMeta.MSFT.ageMs, null);
  assert.equal(metadata.symbolMeta.TSM.freshSinceRequest, false);
  assert.equal(metadata.symbolMeta.TSM.ageMs, 700);
});

test('stock snapshot waits past the first tick, then resolves by coverage or collection window', () => {
  const symbols = ['NVDA', 'MSFT', 'META', 'TSM', 'NOK', 'IBKR'];
  const oneTick = [stockTick('NVDA', 1_050)];

  const stillCollecting = evaluateStocksSnapshotWait({
    symbols,
    ticks: oneTick,
    startedAt: 1_000,
    deadline: 2_800,
    now: 1_300,
  });
  assert.equal(stillCollecting.resolve, false);
  assert.equal(stillCollecting.reason, 'collecting');

  const collectionWindow = evaluateStocksSnapshotWait({
    symbols,
    ticks: oneTick,
    startedAt: 1_000,
    deadline: 2_800,
    now: 1_400,
  });
  assert.equal(collectionWindow.resolve, true);
  assert.equal(collectionWindow.reason, 'collection-window');

  const coverage = evaluateStocksSnapshotWait({
    symbols,
    ticks: symbols.slice(0, 5).map((symbol, index) => stockTick(symbol, 1_050 + index)),
    startedAt: 1_000,
    deadline: 2_800,
    now: 1_100,
  });
  assert.equal(coverage.coverage.targetCount, 5);
  assert.equal(coverage.coverage.freshSinceRequestCount, 5);
  assert.equal(coverage.resolve, true);
  assert.equal(coverage.reason, 'coverage');
});

test('stock snapshot hard timeout remains bounded when the provider is silent', () => {
  const beforeDeadline = evaluateStocksSnapshotWait({
    symbols: ['NVDA', 'MSFT'],
    ticks: [],
    startedAt: 1_000,
    deadline: 2_800,
    now: 2_799,
  });
  assert.equal(beforeDeadline.resolve, false);

  const atDeadline = evaluateStocksSnapshotWait({
    symbols: ['NVDA', 'MSFT'],
    ticks: [],
    startedAt: 1_000,
    deadline: 2_800,
    now: 2_800,
  });
  assert.equal(atDeadline.resolve, true);
  assert.equal(atDeadline.reason, 'hard-timeout');
});
