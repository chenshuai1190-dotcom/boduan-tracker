import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearStockQuoteBootstrapCache,
  mergeStockQuoteBootstrapLockedFields,
  readStockQuoteBootstrapCache,
  STOCK_QUOTE_BOOTSTRAP_CACHE_BASE_KEY,
  STOCK_QUOTE_BOOTSTRAP_CACHE_MAX_ROWS,
  STOCK_QUOTE_BOOTSTRAP_CACHE_SCHEMA_VERSION,
  STOCK_QUOTE_BOOTSTRAP_CACHE_TTL_MS,
  writeStockQuoteBootstrapCache,
} from '../src/lib/stockQuoteBootstrapCache.js';
import { resolveEarningsReactionDisplay } from '../src/lib/earningsReactionDisplay.js';
import { buildLedgerQuoteUniverse } from '../src/lib/stockUniverse.js';
import { applyStockTickToQuoteRows, canStartStockRealtime } from '../src/lib/stockRealtime.js';
import { userScopedStorageKey } from '../src/lib/userScopedStorage.js';

class FakeStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function quoteRow(overrides = {}) {
  return {
    symbol: 'NVDA',
    name: 'NVIDIA',
    price: 206.84,
    change: -1.92,
    changePercent: -0.92,
    previousClose: 208.76,
    high: 236.26,
    week52High: 236.26,
    currency: 'USD',
    marketStatus: 'regular',
    source: 'EODHD_WS',
    priceSource: 'us-quote',
    timestamp: 1_785_200_000,
    receivedAt: 1_785_200_000_123,
    clientReceivedAt: 1_785_200_000_456,
    realtimeAt: 1_785_200_000,
    shares: 7000,
    cost: 179.78,
    marketValue: 1_447_880,
    holdingPnl: 189_420,
    dailyPnlPrice: 206.84,
    dailyPnlChangePercent: -0.92,
    targetPriceUsd: 300,
    realizedPnl: 100,
    unrealizedPnl: 200,
    todayPnl: -50,
    trades: [{ id: 'private-ledger-row' }],
    accountId: 'private-account',
    realtime: true,
    ...overrides,
  };
}

function lockedDailyPnlFields(overrides = {}) {
  return {
    dailyPnlPrice: 206.84,
    dailyPnlPriceDate: '2026-07-31',
    dailyPnlBaselineClose: 208.76,
    dailyPnlBaselineDate: '2026-07-30',
    dailyPnlBaselineSource: 'eodhd-adjusted-close',
    dailyPnlSource: 'locked-latest-eod-close',
    dailyPnlSession: 'closed',
    dailyPnlLocked: true,
    ...overrides,
  };
}

function lockedQuoteRow(overrides = {}) {
  return quoteRow({
    ...lockedDailyPnlFields(),
    ...overrides,
  });
}

function lockedOnlyRow(overrides = {}) {
  return {
    symbol: 'NVDA',
    ...lockedDailyPnlFields(),
    ...overrides,
  };
}

test('writes only public quote fields, normalizes values, deduplicates symbols, and caps at 50 rows', () => {
  const storage = new FakeStorage();
  const currentTime = Date.parse('2026-07-28T00:00:00.000Z');
  const rows = Array.from({ length: 56 }, (_, index) => quoteRow({
    symbol: `S${String(index).padStart(2, '0')}`,
    name: `Stock ${index}`,
    price: 100 + index,
  }));
  rows.splice(2, 0, quoteRow({
    symbol: 's00',
    name: 'Stock zero updated',
    price: '999.5',
    currency: 'usd',
  }));

  assert.equal(writeStockQuoteBootstrapCache({
    userId: 'user-a',
    rows,
    storage,
    now: () => currentTime,
  }), true);

  const cached = readStockQuoteBootstrapCache({
    userId: 'user-a',
    storage,
    now: () => currentTime,
  });
  assert.equal(cached.length, STOCK_QUOTE_BOOTSTRAP_CACHE_MAX_ROWS);
  assert.equal(cached[0].symbol, 'S00');
  assert.equal(cached[0].price, 999.5);
  assert.equal(cached[0].currency, 'USD');
  assert.equal(cached[0].timestamp, 1_785_200_000_000);
  assert.equal(Object.hasOwn(cached[0], 'shares'), false);
  assert.equal(Object.hasOwn(cached[0], 'cost'), false);
  assert.equal(Object.hasOwn(cached[0], 'marketValue'), false);
  assert.equal(Object.hasOwn(cached[0], 'holdingPnl'), false);
  assert.equal(Object.hasOwn(cached[0], 'dailyPnlPrice'), false);
  assert.equal(Object.hasOwn(cached[0], 'dailyPnlPriceDate'), false);
  assert.equal(Object.hasOwn(cached[0], 'dailyPnlBaselineClose'), false);
  assert.equal(Object.hasOwn(cached[0], 'dailyPnlBaselineDate'), false);
  assert.equal(Object.hasOwn(cached[0], 'dailyPnlBaselineSource'), false);
  assert.equal(Object.hasOwn(cached[0], 'dailyPnlSource'), false);
  assert.equal(Object.hasOwn(cached[0], 'dailyPnlSession'), false);
  assert.equal(Object.hasOwn(cached[0], 'dailyPnlLocked'), false);
  assert.equal(Object.hasOwn(cached[0], 'dailyPnlChangePercent'), false);
  assert.equal(Object.hasOwn(cached[0], 'targetPriceUsd'), false);
  assert.equal(Object.hasOwn(cached[0], 'realizedPnl'), false);
  assert.equal(Object.hasOwn(cached[0], 'unrealizedPnl'), false);
  assert.equal(Object.hasOwn(cached[0], 'todayPnl'), false);
  assert.equal(Object.hasOwn(cached[0], 'trades'), false);
  assert.equal(Object.hasOwn(cached[0], 'accountId'), false);
  assert.equal(Object.hasOwn(cached[0], 'realtime'), false);
});

test('cache requires a daily baseline and uses the shared canonical stock symbol rules', () => {
  const storage = new FakeStorage();
  const now = Date.parse('2026-07-28T00:00:00.000Z');

  assert.equal(writeStockQuoteBootstrapCache({
    userId: 'user-a',
    rows: [
      quoteRow({ symbol: 'nvda.us', price: 205 }),
      quoteRow({ symbol: 'NVDA', price: 206 }),
      quoteRow({ symbol: 'ABCDEFGHIJKLMNOP', price: 100 }),
      quoteRow({
        symbol: 'MSFT',
        price: 400,
        previousClose: undefined,
        dailyBaselineClose: undefined,
        dailyPnlBaselineClose: undefined,
      }),
    ],
    storage,
    now,
  }), true);

  const cached = readStockQuoteBootstrapCache({
    userId: 'user-a',
    storage,
    now,
  });
  assert.deepEqual(cached.map((row) => row.symbol), ['NVDA']);
  assert.equal(cached[0].price, 206);
});

test('cache keys and payload identity are user scoped, including copied cross-user payloads', () => {
  const storage = new FakeStorage();
  const now = Date.parse('2026-07-28T00:00:00.000Z');
  const userAKey = userScopedStorageKey(STOCK_QUOTE_BOOTSTRAP_CACHE_BASE_KEY, 'user-a');
  const userBKey = userScopedStorageKey(STOCK_QUOTE_BOOTSTRAP_CACHE_BASE_KEY, 'user-b');

  assert.equal(writeStockQuoteBootstrapCache({
    userId: 'user-a',
    rows: [quoteRow()],
    storage,
    now,
  }), true);
  assert.notEqual(userAKey, userBKey);
  assert.equal(readStockQuoteBootstrapCache({ userId: 'user-b', storage, now }).length, 0);

  storage.setItem(userBKey, storage.getItem(userAKey));
  assert.deepEqual(readStockQuoteBootstrapCache({ userId: 'user-b', storage, now }), []);
  assert.equal(storage.getItem(userBKey), null, 'a copied payload with another user id should be removed');
  assert.equal(readStockQuoteBootstrapCache({ userId: 'user-a', storage, now }).length, 1);
});

test('15-minute TTL accepts fresh rows and rejects the exact expiry boundary', () => {
  const storage = new FakeStorage();
  const savedAt = Date.parse('2026-07-28T00:00:00.000Z');
  const key = userScopedStorageKey(STOCK_QUOTE_BOOTSTRAP_CACHE_BASE_KEY, 'user-a');
  writeStockQuoteBootstrapCache({ userId: 'user-a', rows: [quoteRow()], storage, now: savedAt });

  assert.equal(readStockQuoteBootstrapCache({
    userId: 'user-a',
    storage,
    now: savedAt + STOCK_QUOTE_BOOTSTRAP_CACHE_TTL_MS - 1,
  }).length, 1);
  assert.deepEqual(readStockQuoteBootstrapCache({
    userId: 'user-a',
    storage,
    now: savedAt + STOCK_QUOTE_BOOTSTRAP_CACHE_TTL_MS,
  }), []);
  assert.equal(storage.getItem(key), null, 'expired entries should be removed');
});

test('validated completed-close fields survive the volatile TTL across a closed weekend', () => {
  const storage = new FakeStorage();
  const savedAt = Date.parse('2026-07-31T21:00:00.000Z');
  const sunday = Date.parse('2026-08-02T12:00:00.000Z');
  const row = lockedQuoteRow();

  assert.equal(writeStockQuoteBootstrapCache({
    userId: 'user-a',
    rows: [row],
    storage,
    now: savedAt,
  }), true);

  const fresh = readStockQuoteBootstrapCache({
    userId: 'user-a',
    storage,
    now: savedAt + 1000,
  });
  assert.equal(fresh[0].price, 206.84);
  assert.deepEqual(
    Object.fromEntries(Object.entries(fresh[0]).filter(([key]) => key.startsWith('dailyPnl'))),
    lockedDailyPnlFields(),
  );

  const closedWeekend = readStockQuoteBootstrapCache({
    userId: 'user-a',
    storage,
    now: sunday,
  });
  assert.deepEqual(closedWeekend, [{ symbol: 'NVDA', ...lockedDailyPnlFields() }]);
  assert.equal(Object.hasOwn(closedWeekend[0], 'price'), false);
  assert.equal(Object.hasOwn(closedWeekend[0], 'previousClose'), false);
  assert.equal(Object.hasOwn(closedWeekend[0], 'timestamp'), false);
  assert.equal(Object.hasOwn(closedWeekend[0], 'accountId'), false);
  assert.equal(Object.hasOwn(closedWeekend[0], 'trades'), false);
});

test('a completed-close lock expires when the next NYSE close completes', () => {
  const storage = new FakeStorage();
  const savedAt = Date.parse('2026-07-31T21:00:00.000Z');
  const nextClose = Date.parse('2026-08-03T21:00:00.000Z');
  const key = userScopedStorageKey(STOCK_QUOTE_BOOTSTRAP_CACHE_BASE_KEY, 'user-a');
  writeStockQuoteBootstrapCache({
    userId: 'user-a',
    rows: [lockedQuoteRow()],
    storage,
    now: savedAt,
  });

  assert.deepEqual(readStockQuoteBootstrapCache({
    userId: 'user-a',
    storage,
    now: nextClose,
  }), []);
  assert.equal(storage.getItem(key), null);
});

test('future, holiday, same-date, and non-positive locked baselines fail closed', () => {
  const cases = [
    {
      now: Date.parse('2026-07-31T21:00:00.000Z'),
      row: lockedOnlyRow({
        dailyPnlPriceDate: '2026-08-03',
        dailyPnlBaselineDate: '2026-07-31',
      }),
    },
    {
      now: Date.parse('2026-07-06T21:00:00.000Z'),
      row: lockedOnlyRow({
        dailyPnlPriceDate: '2026-07-06',
        dailyPnlBaselineDate: '2026-07-03',
      }),
    },
    {
      now: Date.parse('2026-07-31T21:00:00.000Z'),
      row: lockedOnlyRow({ dailyPnlBaselineDate: '2026-07-31' }),
    },
    {
      now: Date.parse('2026-07-31T21:00:00.000Z'),
      row: lockedOnlyRow({ dailyPnlBaselineDate: '2026-07-29' }),
    },
    {
      now: Date.parse('2026-07-31T21:00:00.000Z'),
      row: lockedOnlyRow({ dailyPnlBaselineClose: 0 }),
    },
  ];

  cases.forEach(({ now, row }, index) => {
    const storage = new FakeStorage();
    assert.equal(writeStockQuoteBootstrapCache({
      userId: `user-${index}`,
      rows: [row],
      storage,
      now,
    }), false);
  });
});

test('the locked baseline is the exact prior NYSE session across weekends and holidays', () => {
  const cases = [
    {
      now: Date.parse('2026-08-03T21:00:00.000Z'),
      row: lockedOnlyRow({
        dailyPnlPriceDate: '2026-08-03',
        dailyPnlBaselineDate: '2026-07-31',
      }),
    },
    {
      now: Date.parse('2026-07-06T21:00:00.000Z'),
      row: lockedOnlyRow({
        dailyPnlPriceDate: '2026-07-06',
        dailyPnlBaselineDate: '2026-07-02',
      }),
    },
  ];

  cases.forEach(({ now, row }, index) => {
    const storage = new FakeStorage();
    assert.equal(writeStockQuoteBootstrapCache({
      userId: `valid-user-${index}`,
      rows: [row],
      storage,
      now,
    }), true);
    assert.deepEqual(readStockQuoteBootstrapCache({
      userId: `valid-user-${index}`,
      storage,
      now,
    }), [row]);
  });
});

test('locked close merges only into cloud-backed rows without replacing a newer live tick', () => {
  const now = Date.parse('2026-08-02T12:00:00.000Z');
  const cachedRows = [
    lockedOnlyRow(),
    lockedOnlyRow({ symbol: 'MSFT', dailyPnlPrice: 430, dailyPnlBaselineClose: 425 }),
  ];
  const nvda = {
    symbol: 'NVDA',
    name: 'NVIDIA',
    price: 212.4,
    previousClose: 208.76,
    realtime: true,
    realtimeAt: now - 1000,
  };
  const aapl = { symbol: 'AAPL', price: 220, previousClose: 218 };

  const merged = mergeStockQuoteBootstrapLockedFields({
    quoteRows: [nvda, aapl],
    cachedRows,
    now,
  });
  assert.equal(merged.length, 2, 'a cache-only symbol must not create a cloud position');
  assert.equal(merged[0].price, 212.4, 'the cached close must not replace a newer tick price');
  assert.equal(merged[0].realtimeAt, now - 1000);
  assert.deepEqual(
    Object.fromEntries(Object.entries(merged[0]).filter(([key]) => key.startsWith('dailyPnl'))),
    lockedDailyPnlFields(),
  );
  assert.equal(merged[1], aapl);

  const activeTick = {
    ...nvda,
    dailyPnlPrice: 212.4,
    dailyPnlSession: 'regular',
    dailyPnlLocked: false,
  };
  const activeRows = [activeTick];
  const protectedRows = mergeStockQuoteBootstrapLockedFields({
    quoteRows: activeRows,
    cachedRows,
    now,
  });
  assert.equal(protectedRows, activeRows);
  assert.equal(protectedRows[0], activeTick);
  assert.equal(protectedRows[0].dailyPnlLocked, false);
  assert.equal(protectedRows[0].dailyPnlPrice, 212.4);
});

test('corrupt JSON, schema drift, invalid rows, duplicate rows, and future timestamps fail closed', () => {
  const now = Date.parse('2026-07-28T00:00:00.000Z');
  const cases = [
    '{broken-json',
    {
      schema: 'wrong-schema',
      version: STOCK_QUOTE_BOOTSTRAP_CACHE_SCHEMA_VERSION,
      userId: 'user-a',
      savedAt: now,
      expiresAt: now + STOCK_QUOTE_BOOTSTRAP_CACHE_TTL_MS,
      rows: [quoteRow()],
    },
    {
      schema: 'boduan.stock-quote-bootstrap',
      version: STOCK_QUOTE_BOOTSTRAP_CACHE_SCHEMA_VERSION + 1,
      userId: 'user-a',
      savedAt: now,
      expiresAt: now + STOCK_QUOTE_BOOTSTRAP_CACHE_TTL_MS,
      rows: [quoteRow()],
    },
    {
      schema: 'boduan.stock-quote-bootstrap',
      version: STOCK_QUOTE_BOOTSTRAP_CACHE_SCHEMA_VERSION,
      userId: 'user-a',
      savedAt: now,
      expiresAt: now + STOCK_QUOTE_BOOTSTRAP_CACHE_TTL_MS,
      rows: [{ symbol: 'NVDA', price: 206.84, previousClose: 208.76, shares: 7000 }],
    },
    {
      schema: 'boduan.stock-quote-bootstrap',
      version: STOCK_QUOTE_BOOTSTRAP_CACHE_SCHEMA_VERSION,
      userId: 'user-a',
      savedAt: now,
      expiresAt: now + STOCK_QUOTE_BOOTSTRAP_CACHE_TTL_MS,
      rows: [
        { symbol: 'NVDA', price: 206.84, previousClose: 208.76 },
        { symbol: 'NVDA', price: 207.1, previousClose: 208.76 },
      ],
    },
    {
      schema: 'boduan.stock-quote-bootstrap',
      version: STOCK_QUOTE_BOOTSTRAP_CACHE_SCHEMA_VERSION,
      userId: 'user-a',
      savedAt: now + 1,
      expiresAt: now + 1 + STOCK_QUOTE_BOOTSTRAP_CACHE_TTL_MS,
      rows: [{ symbol: 'NVDA', price: 206.84, previousClose: 208.76 }],
    },
  ];

  cases.forEach((payload) => {
    const storage = new FakeStorage();
    const key = userScopedStorageKey(STOCK_QUOTE_BOOTSTRAP_CACHE_BASE_KEY, 'user-a');
    storage.setItem(key, typeof payload === 'string' ? payload : JSON.stringify(payload));
    assert.deepEqual(readStockQuoteBootstrapCache({ userId: 'user-a', storage, now }), []);
    assert.equal(storage.getItem(key), null);
  });
});

test('empty or invalid writes preserve an existing valid cache', () => {
  const storage = new FakeStorage();
  const now = Date.parse('2026-07-28T00:00:00.000Z');
  writeStockQuoteBootstrapCache({ userId: 'user-a', rows: [quoteRow()], storage, now });
  const key = userScopedStorageKey(STOCK_QUOTE_BOOTSTRAP_CACHE_BASE_KEY, 'user-a');
  const before = storage.getItem(key);

  assert.equal(writeStockQuoteBootstrapCache({ userId: 'user-a', rows: [], storage, now }), false);
  assert.equal(writeStockQuoteBootstrapCache({
    userId: 'user-a',
    rows: [{ symbol: 'NVDA', price: 0 }],
    storage,
    now,
  }), false);
  assert.equal(storage.getItem(key), before);
});

test('clear removes only the requested user cache and storage failures remain non-fatal', () => {
  const storage = new FakeStorage();
  const now = Date.parse('2026-07-28T00:00:00.000Z');
  writeStockQuoteBootstrapCache({ userId: 'user-a', rows: [quoteRow()], storage, now });
  writeStockQuoteBootstrapCache({ userId: 'user-b', rows: [quoteRow({ symbol: 'MSFT' })], storage, now });

  assert.equal(clearStockQuoteBootstrapCache({ userId: 'user-a', storage }), true);
  assert.deepEqual(readStockQuoteBootstrapCache({ userId: 'user-a', storage, now }), []);
  assert.equal(readStockQuoteBootstrapCache({ userId: 'user-b', storage, now }).length, 1);

  const throwingStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  assert.deepEqual(readStockQuoteBootstrapCache({ userId: 'user-a', storage: throwingStorage, now }), []);
  assert.equal(writeStockQuoteBootstrapCache({
    userId: 'user-a',
    rows: [quoteRow()],
    storage: throwingStorage,
    now,
  }), false);
  assert.equal(clearStockQuoteBootstrapCache({ userId: 'user-a', storage: throwingStorage }), false);
});

test('cached quote metadata cannot impersonate a live earnings-reaction WebSocket tick', () => {
  const storage = new FakeStorage();
  const now = Date.parse('2026-07-15T05:14:00.000Z');
  writeStockQuoteBootstrapCache({
    userId: 'user-a',
    rows: [quoteRow({
      symbol: 'ASML',
      price: 1825.9492,
      previousClose: 1775.64,
      source: 'EODHD_WS',
      clientReceivedAt: Date.parse('2026-07-15T05:13:30.000Z'),
      realtime: true,
    })],
    storage,
    now,
  });
  const [cachedQuote] = readStockQuoteBootstrapCache({
    userId: 'user-a',
    storage,
    now,
  });

  assert.equal(cachedQuote.realtime, undefined);
  assert.deepEqual(resolveEarningsReactionDisplay({
    event: {
      symbol: 'ASML',
      reportDate: '2026-07-15',
      session: 'pre',
      marketReactionPercent: null,
    },
    quote: cachedQuote,
    now,
  }), {
    mode: 'official-close',
    percent: null,
    locked: false,
  });
});

test('bootstrap rows accelerate only the stock channel and join the portfolio after a real tick plus cloud ledger', () => {
  const storage = new FakeStorage();
  const now = Date.parse('2026-07-28T00:00:00.000Z');
  writeStockQuoteBootstrapCache({
    userId: 'user-a',
    rows: [quoteRow()],
    storage,
    now,
  });
  const bootstrapRows = readStockQuoteBootstrapCache({
    userId: 'user-a',
    storage,
    now,
  });

  assert.equal(canStartStockRealtime({
    cloudLoading: true,
    symbols: bootstrapRows.map((row) => row.symbol),
  }), true);
  assert.deepEqual(
    buildLedgerQuoteUniverse([], [], bootstrapRows).allRows,
    [],
    'market-only bootstrap rows must not create positions before the cloud ledger resolves',
  );

  const liveQuoteRows = applyStockTickToQuoteRows([], {
    symbol: 'NVDA',
    price: 207.5,
    timestamp: now,
    source: 'EODHD_WS',
  }, 'live', bootstrapRows);
  assert.equal(liveQuoteRows.length, 1);
  assert.equal(liveQuoteRows[0].price, 207.5);
  assert.equal(liveQuoteRows[0].previousClose, 208.76);
  assert.equal(liveQuoteRows[0].realtime, true);

  const cloudUniverse = buildLedgerQuoteUniverse(
    [{ symbol: 'NVDA', name: 'NVIDIA', price: 179.78 }],
    [],
    liveQuoteRows,
  );
  assert.equal(cloudUniverse.ledgerRows.length, 1);
  assert.equal(cloudUniverse.ledgerRows[0].price, 207.5);
  assert.equal(Object.hasOwn(cloudUniverse.ledgerRows[0], 'shares'), true);
  assert.equal(cloudUniverse.ledgerRows[0].shares, 0);
});
