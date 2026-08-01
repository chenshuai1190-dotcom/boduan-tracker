import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCachedStockValuation,
  loadStockValuation,
  normalizeStockValuation,
  resetStockValuationMemoryCache,
  STOCK_VALUATION_CACHE_TTL_MS,
} from '../src/lib/stockValuation.js';

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

function valuationPayload(overrides = {}) {
  return {
    symbol: 'NVDA',
    currency: 'USD',
    source: 'EODHD_VALUATION',
    asOfDate: '2026-07-23',
    windowStartDate: '2021-07-24',
    fetchedAt: '2026-07-24T00:00:00.000Z',
    seriesFrequency: 'monthly-last-trading-day',
    statisticsFrequency: 'daily',
    current: {
      peTtm: 31.9549,
      peForward: 24.1546,
    },
    percentile5y: 2.15,
    summary: {
      min: 29.47,
      p25: 46.31,
      median: 62.83,
      average: 75.01,
      p75: 81.19,
      max: 244.97,
      observationCount: 1254,
    },
    series: [
      { date: '2026-07-23', peTtm: 31.9549 },
      { date: '2021-07-26', peTtm: 188.41 },
    ],
    ...overrides,
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test('valuation normalization keeps only the approved shape and sorts valid history', () => {
  const normalized = normalizeStockValuation(valuationPayload({
    extra: 'must not leak into the client model',
    current: {
      peTtm: '31.9549',
      peForward: '24.1546',
      extra: 123,
    },
    summary: {
      min: '29.47',
      p25: 46.31,
      median: 62.83,
      average: 75.01,
      p75: 81.19,
      max: 244.97,
      observationCount: '1254',
      extra: 999,
    },
    series: [
      { date: '2026-07-23', peTtm: 31.9549, extra: true },
      { date: '2021-07-26', peTtm: '188.41' },
      { date: '2026-02-30', peTtm: 50 },
      { date: '2025-01-02', peTtm: 0 },
      { date: '2024-03-01', peTtm: 'not available' },
      null,
    ],
  }), 'nvda');

  assert.deepEqual(normalized, {
    symbol: 'NVDA',
    currency: 'USD',
    source: 'EODHD_VALUATION',
    asOfDate: '2026-07-23',
    windowStartDate: '2021-07-24',
    fetchedAt: '2026-07-24T00:00:00.000Z',
    seriesFrequency: 'monthly-last-trading-day',
    statisticsFrequency: 'daily',
    current: {
      peTtm: 31.9549,
      peForward: 24.1546,
    },
    percentile5y: 2.15,
    summary: {
      min: 29.47,
      p25: 46.31,
      median: 62.83,
      average: 75.01,
      p75: 81.19,
      max: 244.97,
      observationCount: 1254,
    },
    series: [
      { date: '2021-07-26', peTtm: 188.41 },
      { date: '2026-07-23', peTtm: 31.9549 },
    ],
  });
});

test('invalid optional valuation values fail closed to null or an empty series', () => {
  const normalized = normalizeStockValuation({
    symbol: 'NVDA',
    asOfDate: '07/23/2026',
    windowStartDate: 'not-a-date',
    fetchedAt: 'not-a-timestamp',
    seriesFrequency: 'daily',
    statisticsFrequency: 'monthly',
    current: {
      peTtm: -12,
      peForward: true,
    },
    percentile5y: 100.01,
    summary: {
      min: 0,
      p25: null,
      median: Number.NaN,
      average: Number.POSITIVE_INFINITY,
      p75: -1,
      max: 'not available',
      observationCount: [1254],
    },
    series: 'not-an-array',
  }, 'NVDA');

  assert.deepEqual(normalized, {
    symbol: 'NVDA',
    currency: 'USD',
    source: '',
    asOfDate: '',
    windowStartDate: '',
    fetchedAt: '',
    seriesFrequency: '',
    statisticsFrequency: '',
    current: {
      peTtm: null,
      peForward: null,
    },
    percentile5y: null,
    summary: {
      min: null,
      p25: null,
      median: null,
      average: null,
      p75: null,
      max: null,
      observationCount: null,
    },
    series: [],
  });
  assert.equal(normalizeStockValuation({ symbol: 'MSFT' }, 'NVDA'), null);
  assert.equal(normalizeStockValuation([], 'NVDA'), null);
});

test('six-hour cache survives memory reset, expires on time, and stays user scoped', async () => {
  resetStockValuationMemoryCache();
  const storage = new FakeStorage();
  let currentTime = Date.parse('2026-07-24T00:00:00Z');
  let fetchCount = 0;
  const requests = [];
  const fetchImpl = async (...args) => {
    fetchCount += 1;
    requests.push(args);
    return jsonResponse({ success: true, data: valuationPayload() });
  };
  const args = {
    userId: 'user-a',
    symbol: 'nvda',
    token: 'token-a',
    fetchImpl,
    storage,
    now: () => currentTime,
  };

  const first = await loadStockValuation(args);
  assert.equal(first.current.peTtm, 31.9549);
  assert.equal(fetchCount, 1);
  assert.deepEqual(requests[0], [
    '/api/quote?symbols=NVDA&view=valuation',
    {
      headers: { Authorization: 'Bearer token-a' },
      cache: 'no-store',
    },
  ]);

  assert.strictEqual(getCachedStockValuation({
    userId: 'user-a',
    symbol: 'NVDA',
    storage,
    now: () => currentTime,
  }), first);
  await loadStockValuation(args);
  assert.equal(fetchCount, 1);

  resetStockValuationMemoryCache();
  await loadStockValuation(args);
  assert.equal(fetchCount, 1, 'versioned local storage should survive an iOS PWA process restart');

  currentTime += STOCK_VALUATION_CACHE_TTL_MS + 1;
  await loadStockValuation(args);
  assert.equal(fetchCount, 2, 'expired data must be fetched again');

  await loadStockValuation({ ...args, userId: 'user-b', token: 'token-b' });
  assert.equal(fetchCount, 3, 'another authenticated user must never reuse the first user cache key');
});

test('concurrent reads share one pending valuation request', async () => {
  resetStockValuationMemoryCache();
  const storage = new FakeStorage();
  let resolveFetch;
  let fetchCount = 0;
  const fetchImpl = () => {
    fetchCount += 1;
    return new Promise((resolve) => { resolveFetch = resolve; });
  };
  const args = {
    userId: 'user-a',
    symbol: 'NVDA',
    token: 'token-a',
    fetchImpl,
    storage,
  };

  const first = loadStockValuation(args);
  const second = loadStockValuation(args);
  assert.strictEqual(first, second);
  assert.equal(fetchCount, 1);
  resolveFetch(jsonResponse({ success: true, data: valuationPayload() }));
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(firstResult, secondResult);
});

test('failed or invalid valuation responses are released immediately and never cached', async () => {
  resetStockValuationMemoryCache();
  const storage = new FakeStorage();
  let fetchCount = 0;
  const fetchImpl = async () => {
    fetchCount += 1;
    if (fetchCount === 1) return jsonResponse({ success: false, error: 'temporary' }, 502);
    if (fetchCount === 2) return jsonResponse({ success: true, data: { symbol: 'MSFT' } });
    return jsonResponse({ success: true, data: valuationPayload() });
  };
  const args = {
    userId: 'user-a',
    symbol: 'NVDA',
    token: 'token-a',
    fetchImpl,
    storage,
  };

  await assert.rejects(loadStockValuation(args), /temporary/);
  await assert.rejects(loadStockValuation(args), /valuation response invalid/);
  assert.equal(storage.values.size, 0);
  const recovered = await loadStockValuation(args);
  assert.equal(fetchCount, 3);
  assert.equal(recovered.percentile5y, 2.15);
});

test('valuation reads require a user, symbol, token, and fetch implementation', async () => {
  resetStockValuationMemoryCache();
  await assert.rejects(loadStockValuation({
    symbol: 'NVDA',
    token: 'token-a',
    fetchImpl: async () => jsonResponse({}),
    storage: null,
  }), /missing authenticated user or symbol/);
  await assert.rejects(loadStockValuation({
    userId: 'user-a',
    symbol: 'NVDA',
    storage: null,
  }), /missing session token/);
  await assert.rejects(loadStockValuation({
    userId: 'user-a',
    symbol: 'NVDA',
    token: 'token-a',
    fetchImpl: null,
    storage: null,
  }), /fetch unavailable/);
});
