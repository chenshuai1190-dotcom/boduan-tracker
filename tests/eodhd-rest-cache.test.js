import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getLatestCompletedUsTradingDate,
  loadEodhdDailyHistory,
  loadEodhdDelayedQuote,
  loadEodhdIndexIntraday,
  resetEodhdRestCaches,
} from '../server/quote/eodhdCache.js';
import { fetchStockQuote } from '../server/quote/providers/eodhd.js';
import {
  fetchIndicesQuote,
  getIndexIntradayCachePolicy,
} from '../server/quote/providers/indices.js';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test.beforeEach(() => {
  resetEodhdRestCaches();
});

test('delayed quote cache coalesces one public symbol and session bucket without retaining private fields', async () => {
  const now = Date.parse('2026-07-31T15:00:00.000Z');
  let loadCount = 0;
  let resolveLoad;
  const args = {
    symbol: 'nvda',
    sessionKey: 'regular-123',
    now,
    load: () => {
      loadCount += 1;
      return new Promise((resolve) => { resolveLoad = resolve; });
    },
  };
  const first = loadEodhdDelayedQuote(args);
  const second = loadEodhdDelayedQuote(args);
  await Promise.resolve();
  assert.equal(loadCount, 1);
  resolveLoad({
    lastTradePrice: '105',
    previousClosePrice: '100',
    token: 'must-not-be-cached',
    userId: 'must-not-be-cached',
  });
  assert.deepEqual(await first, { lastTradePrice: '105', previousClosePrice: '100' });
  assert.deepEqual(await second, { lastTradePrice: '105', previousClosePrice: '100' });

  const cached = await loadEodhdDelayedQuote({
    ...args,
    load: async () => {
      throw new Error('cache should satisfy this request');
    },
  });
  assert.deepEqual(cached, { lastTradePrice: '105', previousClosePrice: '100' });
});

test('daily history reuses a successful symbol and completed-close version and coalesces concurrent loads', async () => {
  const now = Date.parse('2026-07-31T21:00:00.000Z');
  const rows = [
    { date: '2026-07-01', close: 100 },
    { date: '2026-07-02', close: 101 },
    { date: '2026-07-31', close: 102 },
  ];
  let loadCount = 0;
  const args = {
    symbol: 'nvda',
    completedDate: '2026-07-31',
    fromDate: '2026-07-01',
    now,
    load: async () => {
      loadCount += 1;
      return rows;
    },
  };

  const [first, second] = await Promise.all([
    loadEodhdDailyHistory(args),
    loadEodhdDailyHistory(args),
  ]);
  assert.equal(loadCount, 1);
  assert.deepEqual(first, rows);
  assert.deepEqual(second, rows);

  const narrower = await loadEodhdDailyHistory({
    ...args,
    fromDate: '2026-07-02',
    load: async () => {
      loadCount += 1;
      throw new Error('cached range should have been reused');
    },
  });
  assert.equal(loadCount, 1);
  assert.deepEqual(narrower.map((row) => row.date), ['2026-07-02', '2026-07-31']);
});

test('daily history upgrades a narrow range, rolls on completed close, and never caches a failed load', async () => {
  const now = Date.parse('2026-07-31T21:00:00.000Z');
  let loadCount = 0;
  const loadRows = (rows) => async () => {
    loadCount += 1;
    return rows;
  };

  await loadEodhdDailyHistory({
    symbol: 'NVDA',
    completedDate: '2026-07-31',
    fromDate: '2026-07-01',
    now,
    load: loadRows([{ date: '2026-07-31', close: 102 }]),
  });
  const broader = await loadEodhdDailyHistory({
    symbol: 'NVDA',
    completedDate: '2026-07-31',
    fromDate: '2025-07-01',
    now,
    load: loadRows([
      { date: '2025-07-01', close: 80 },
      { date: '2026-07-31', close: 102 },
    ]),
  });
  assert.equal(loadCount, 2);
  assert.equal(broader.length, 2);

  await loadEodhdDailyHistory({
    symbol: 'NVDA',
    completedDate: '2026-07-31',
    fromDate: '2026-01-01',
    now,
    load: async () => {
      loadCount += 1;
      throw new Error('broader cache should cover this request');
    },
  });
  assert.equal(loadCount, 2);

  await assert.rejects(
    loadEodhdDailyHistory({
      symbol: 'MSFT',
      completedDate: '2026-07-31',
      fromDate: '2026-01-01',
      now,
      load: async () => {
        loadCount += 1;
        throw new Error('temporary provider failure');
      },
    }),
    /temporary provider failure/,
  );
  const recovered = await loadEodhdDailyHistory({
    symbol: 'MSFT',
    completedDate: '2026-07-31',
    fromDate: '2026-01-01',
    now,
    load: loadRows([{ date: '2026-07-31', close: 500 }]),
  });
  assert.equal(recovered[0].close, 500);

  await loadEodhdDailyHistory({
    symbol: 'NVDA',
    completedDate: '2026-08-03',
    fromDate: '2026-01-01',
    now: Date.parse('2026-08-03T21:00:00.000Z'),
    load: loadRows([{ date: '2026-08-03', close: 104 }]),
  });
  assert.equal(loadCount, 5, 'a new completed close must create a new provider version');
});

test('daily history never freezes a previous session under a newly completed close key', async () => {
  const now = Date.parse('2026-07-31T20:05:00.000Z');
  let loadCount = 0;
  const staleRows = [{ date: '2026-07-30', close: 200 }];
  const placeholderRows = [
    ...staleRows,
    { date: '2026-07-31', close: 0 },
  ];
  const freshRows = [
    ...staleRows,
    { date: '2026-07-31', close: 202 },
  ];
  const request = (rows) => loadEodhdDailyHistory({
    symbol: 'NVDA',
    completedDate: '2026-07-31',
    fromDate: '2026-07-01',
    now,
    load: async () => {
      loadCount += 1;
      return rows;
    },
  });

  assert.deepEqual(await request(placeholderRows), placeholderRows, 'an incomplete same-date placeholder can still be ignored by consumers');
  assert.deepEqual(await request(freshRows), freshRows, 'the next request must retry until the completed bar exists');
  assert.deepEqual(await request(staleRows), freshRows, 'the completed payload is then reused');
  assert.equal(loadCount, 2);
});

test('cache identifiers reject provider tokens and user-shaped keys', () => {
  assert.throws(() => loadEodhdDailyHistory({
    symbol: 'NVDA?api_token=secret',
    completedDate: '2026-07-31',
    fromDate: '2026-01-01',
    load: async () => [],
  }), /public provider symbol/);
  assert.throws(() => loadEodhdIndexIntraday({
    ticker: 'GSPC.INDX',
    sessionKey: 'user/account-a',
    load: async () => [1, 2],
  }), /public freshness key/);
});

test('daily cache strips non-market fields before retaining a provider payload', async () => {
  const rows = await loadEodhdDailyHistory({
    symbol: 'NVDA',
    completedDate: '2026-07-31',
    fromDate: '2026-07-01',
    load: async () => [{
      date: '2026-07-31',
      open: 100,
      high: 103,
      low: 99,
      close: 102,
      adjusted_close: 102,
      volume: 1_000,
      userId: 'private-user',
      holdings: [{ shares: 7_000 }],
      api_token: 'must-not-be-retained',
    }],
  });

  assert.deepEqual(rows, [{
    date: '2026-07-31',
    open: 100,
    high: 103,
    low: 99,
    close: 102,
    adjusted_close: 102,
    volume: 1_000,
  }]);
});

test('daily cache retains a legal multi-batch quote universe without LRU thrash', async () => {
  const completedDate = '2026-07-31';
  const now = Date.parse('2026-07-31T21:00:00.000Z');
  let firstLoadCount = 0;

  for (let index = 0; index < 70; index += 1) {
    await loadEodhdDailyHistory({
      symbol: `S${index}`,
      completedDate,
      fromDate: '2026-07-01',
      now,
      load: async () => [{ date: completedDate, close: 100 + index }],
    });
  }

  const first = await loadEodhdDailyHistory({
    symbol: 'S0',
    completedDate,
    fromDate: '2026-07-01',
    now,
    load: async () => {
      firstLoadCount += 1;
      throw new Error('the first completed history should still be cached');
    },
  });
  assert.equal(firstLoadCount, 0);
  assert.equal(first[0].close, 100);
});

test('index intraday coalesces a session key and retries immediately after failure', async () => {
  const now = Date.parse('2026-07-31T21:00:00.000Z');
  let loadCount = 0;
  let resolveLoad;
  const args = {
    ticker: 'GSPC.INDX',
    sessionKey: '2026-07-31:completed',
    now,
    load: () => {
      loadCount += 1;
      return new Promise((resolve) => { resolveLoad = resolve; });
    },
  };

  const first = loadEodhdIndexIntraday(args);
  const second = loadEodhdIndexIntraday(args);
  await Promise.resolve();
  assert.equal(loadCount, 1);
  resolveLoad([100, 101, 102]);
  assert.deepEqual(await first, [100, 101, 102]);
  assert.deepEqual(await second, [100, 101, 102]);

  let failureCount = 0;
  const failedArgs = {
    ticker: 'NDX.INDX',
    sessionKey: '2026-07-31:completed',
    now,
  };
  await assert.rejects(loadEodhdIndexIntraday({
    ...failedArgs,
    load: async () => {
      failureCount += 1;
      throw new Error('temporary');
    },
  }), /temporary/);
  const recovered = await loadEodhdIndexIntraday({
    ...failedArgs,
    load: async () => {
      failureCount += 1;
      return [200, 201];
    },
  });
  assert.equal(failureCount, 2);
  assert.deepEqual(recovered, [200, 201]);
});

test('market session policy shares the last completed curve after close, over the weekend, and before Monday open', () => {
  const fridayAfterClose = Date.parse('2026-07-31T21:00:00.000Z');
  const saturday = Date.parse('2026-08-01T16:00:00.000Z');
  const mondayPremarket = Date.parse('2026-08-03T12:00:00.000Z');
  const mondayRegular = Date.parse('2026-08-03T14:35:00.000Z');

  assert.equal(getLatestCompletedUsTradingDate(fridayAfterClose), '2026-07-31');
  assert.equal(getLatestCompletedUsTradingDate(saturday), '2026-07-31');
  assert.equal(getLatestCompletedUsTradingDate(mondayPremarket), '2026-07-31');
  assert.equal(getIndexIntradayCachePolicy(fridayAfterClose).sessionKey, '2026-07-31:completed');
  assert.equal(getIndexIntradayCachePolicy(saturday).sessionKey, '2026-07-31:completed');
  assert.equal(getIndexIntradayCachePolicy(mondayPremarket).sessionKey, '2026-07-31:completed');
  assert.match(getIndexIntradayCachePolicy(mondayRegular).sessionKey, /^2026-08-03:regular:\d+$/);
});

test('index completed-session cache retries when the provider still returns the previous session', async () => {
  let loadCount = 0;
  let returnedSessionDate = '2026-07-30';
  const args = {
    ticker: 'GSPC.INDX',
    sessionKey: '2026-07-31:completed',
    now: Date.parse('2026-07-31T20:05:00.000Z'),
    shouldCache: () => returnedSessionDate === '2026-07-31',
    load: async () => {
      loadCount += 1;
      return returnedSessionDate === '2026-07-31' ? [102, 103] : [100, 101];
    },
  };

  assert.deepEqual(await loadEodhdIndexIntraday(args), [100, 101]);
  returnedSessionDate = '2026-07-31';
  assert.deepEqual(await loadEodhdIndexIntraday(args), [102, 103]);
  returnedSessionDate = '2026-07-30';
  assert.deepEqual(await loadEodhdIndexIntraday(args), [102, 103]);
  assert.equal(loadCount, 2);
});

test('US market holidays keep the prior completed close key instead of opening live refresh buckets', () => {
  const laborDayMidday = Date.parse('2026-09-07T16:00:00.000Z');
  const laborDayAfterClose = Date.parse('2026-09-07T21:00:00.000Z');
  const tuesdayPremarket = Date.parse('2026-09-08T12:00:00.000Z');
  const expectedKey = '2026-09-04:completed';

  assert.equal(getLatestCompletedUsTradingDate(laborDayMidday), '2026-09-04');
  assert.equal(getLatestCompletedUsTradingDate(laborDayAfterClose), '2026-09-04');
  assert.equal(getLatestCompletedUsTradingDate(tuesdayPremarket), '2026-09-04');
  assert.equal(getIndexIntradayCachePolicy(laborDayMidday).sessionKey, expectedKey);
  assert.equal(getIndexIntradayCachePolicy(laborDayAfterClose).sessionKey, expectedKey);
  assert.equal(getIndexIntradayCachePolicy(tuesdayPremarket).sessionKey, expectedKey);
});

test('stock provider shares EOD history across concurrent calls and the weekend but refreshes after a new close', async () => {
  const originalFetch = globalThis.fetch;
  let eodCalls = 0;
  let quoteCalls = 0;
  const eodRows = [
    { date: '2026-07-29', close: 198, adjusted_close: 198, high: 200, low: 197 },
    { date: '2026-07-30', close: 200, adjusted_close: 200, high: 201, low: 198 },
    { date: '2026-07-31', close: 202, adjusted_close: 202, high: 203, low: 199 },
    { date: '2026-08-03', close: 204, adjusted_close: 204, high: 205, low: 202 },
  ];

  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.includes('/api/us-quote-delayed')) {
      quoteCalls += 1;
      return jsonResponse({
        data: {
          'NVDA.US': {
            lastTradePrice: '204',
            previousClosePrice: '202',
            high: '205',
            low: '202',
            open: '203',
            timestamp: 1785790800,
          },
        },
      });
    }
    if (parsed.pathname.includes('/api/eod/')) {
      eodCalls += 1;
      return jsonResponse(eodRows.filter((row) => row.date >= parsed.searchParams.get('from')));
    }
    if (parsed.hostname === 'query1.finance.yahoo.com') {
      return jsonResponse({ chart: { result: [] } });
    }
    throw new Error(`Unexpected provider URL: ${url}`);
  };

  try {
    const fridayAfterClose = Date.parse('2026-07-31T21:00:00.000Z');
    const [first, second] = await Promise.all([
      fetchStockQuote('NVDA', { eodhdKey: 'private-test-key', now: fridayAfterClose }),
      fetchStockQuote('NVDA', { eodhdKey: 'private-test-key', now: fridayAfterClose }),
    ]);
    assert.equal(first.error, undefined);
    assert.equal(second.error, undefined);
    assert.equal(eodCalls, 1);
    assert.equal(quoteCalls, 1, 'concurrent delayed quotes share one public session-bucket request');

    await fetchStockQuote('NVDA', {
      eodhdKey: 'private-test-key',
      now: Date.parse('2026-08-03T14:00:00.000Z'),
    });
    assert.equal(eodCalls, 1, 'Monday before its close still uses Friday completed history');

    await fetchStockQuote('NVDA', {
      eodhdKey: 'private-test-key',
      now: Date.parse('2026-08-03T21:00:00.000Z'),
    });
    assert.equal(eodCalls, 2, 'Monday completed close creates a new history version');
    assert.equal(quoteCalls, 3, 'pre/regular/post buckets refresh independently');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('index provider keeps realtime cards live while reusing completed intraday curves', async () => {
  const originalFetch = globalThis.fetch;
  let realtimeCalls = 0;
  let intradayCalls = 0;

  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.includes('/api/real-time/')) {
      realtimeCalls += 1;
      return jsonResponse({
        close: 7500,
        previousClose: 7480,
        high: 7520,
        low: 7460,
      });
    }
    if (parsed.pathname.includes('/api/intraday/')) {
      intradayCalls += 1;
      return jsonResponse([
        { datetime: '2026-07-31 09:30:00', close: 7480 },
        { datetime: '2026-07-31 12:00:00', close: 7490 },
        { datetime: '2026-07-31 15:55:00', close: 7500 },
      ]);
    }
    throw new Error(`Unexpected provider URL: ${url}`);
  };

  try {
    const fridayAfterClose = Date.parse('2026-07-31T21:00:00.000Z');
    const [first, second] = await Promise.all([
      fetchIndicesQuote('INDICES', { eodhdKey: 'private-test-key', now: fridayAfterClose }),
      fetchIndicesQuote('INDICES', { eodhdKey: 'private-test-key', now: fridayAfterClose }),
    ]);
    assert.equal(first.data.length, 3);
    assert.equal(second.data.length, 3);
    assert.ok(first.data.every((card) => card.intraday.length === 3));
    assert.equal(realtimeCalls, 6);
    assert.equal(intradayCalls, 3, 'each public ticker should share one in-flight curve request');

    await fetchIndicesQuote('INDICES', {
      eodhdKey: 'private-test-key',
      now: Date.parse('2026-08-01T16:00:00.000Z'),
    });
    assert.equal(realtimeCalls, 9, 'realtime index cards remain uncached');
    assert.equal(intradayCalls, 3, 'the Friday curve is stable through the weekend');

    await fetchIndicesQuote('INDICES', {
      eodhdKey: 'private-test-key',
      now: Date.parse('2026-08-03T14:35:00.000Z'),
    });
    assert.equal(intradayCalls, 6, 'a live Monday bucket gets a fresh curve');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
