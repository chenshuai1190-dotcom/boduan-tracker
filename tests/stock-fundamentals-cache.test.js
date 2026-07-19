import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadStockFundamentals,
  normalizeStockFundamentals,
  resetStockFundamentalsMemoryCache,
  STOCK_FUNDAMENTALS_CACHE_TTL_MS,
} from '../src/lib/stockFundamentals.js';

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

function fundamentalsPayload(overrides = {}) {
  return {
    symbol: 'NVDA',
    currency: 'USD',
    source: 'EODHD_FUNDAMENTALS',
    asOfDate: '2026-04-30',
    fetchedAt: '2026-07-20T00:00:00.000Z',
    marketCapitalization: 4_912_000_000_000,
    peTtm: 31.0582,
    peForward: 23.1481,
    revenueGrowthTtmPct: 70.683769,
    netMarginTtmPct: 62.965944,
    freeCashFlowMarginTtmPct: 46.974449,
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

test('six-hour cache survives memory reset, expires on time, and includes the authenticated user', async () => {
  resetStockFundamentalsMemoryCache();
  const storage = new FakeStorage();
  let currentTime = Date.parse('2026-07-20T00:00:00Z');
  let fetchCount = 0;
  const fetchImpl = async () => {
    fetchCount += 1;
    return jsonResponse({ success: true, data: fundamentalsPayload() });
  };
  const args = {
    userId: 'user-a',
    symbol: 'NVDA',
    token: 'token-a',
    fetchImpl,
    storage,
    now: () => currentTime,
  };

  await loadStockFundamentals(args);
  await loadStockFundamentals(args);
  assert.equal(fetchCount, 1);

  resetStockFundamentalsMemoryCache();
  await loadStockFundamentals(args);
  assert.equal(fetchCount, 1, 'versioned local storage should survive an iOS PWA process restart');

  currentTime += STOCK_FUNDAMENTALS_CACHE_TTL_MS + 1;
  await loadStockFundamentals(args);
  assert.equal(fetchCount, 2, 'expired data must be fetched again');

  await loadStockFundamentals({ ...args, userId: 'user-b', token: 'token-b' });
  assert.equal(fetchCount, 3, 'another authenticated user must never reuse the first user cache key');
});

test('concurrent reads share one pending request', async () => {
  resetStockFundamentalsMemoryCache();
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
  const first = loadStockFundamentals(args);
  const second = loadStockFundamentals(args);
  assert.strictEqual(first, second);
  assert.equal(fetchCount, 1);
  resolveFetch(jsonResponse({ success: true, data: fundamentalsPayload() }));
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(firstResult, secondResult);
});

test('a failed request is released immediately and never cached', async () => {
  resetStockFundamentalsMemoryCache();
  const storage = new FakeStorage();
  let fetchCount = 0;
  const fetchImpl = async () => {
    fetchCount += 1;
    if (fetchCount === 1) return jsonResponse({ success: false, error: 'temporary' }, 502);
    return jsonResponse({ success: true, data: fundamentalsPayload() });
  };
  const args = {
    userId: 'user-a',
    symbol: 'NVDA',
    token: 'token-a',
    fetchImpl,
    storage,
  };

  await assert.rejects(loadStockFundamentals(args), /temporary/);
  assert.equal(storage.values.size, 0);
  const recovered = await loadStockFundamentals(args);
  assert.equal(fetchCount, 2);
  assert.equal(recovered.peTtm, 31.0582);
});

test('successful partial data normalizes every missing metric to null for the em-dash UI', () => {
  const normalized = normalizeStockFundamentals({
    symbol: 'NVDA',
    marketCapitalization: 'not available',
    peTtm: null,
    peForward: undefined,
    revenueGrowthTtmPct: '',
    netMarginTtmPct: -12.5,
    freeCashFlowMarginTtmPct: 0,
  }, 'NVDA');

  assert.deepEqual({
    marketCapitalization: normalized.marketCapitalization,
    peTtm: normalized.peTtm,
    peForward: normalized.peForward,
    revenueGrowthTtmPct: normalized.revenueGrowthTtmPct,
    netMarginTtmPct: normalized.netMarginTtmPct,
    freeCashFlowMarginTtmPct: normalized.freeCashFlowMarginTtmPct,
  }, {
    marketCapitalization: null,
    peTtm: null,
    peForward: null,
    revenueGrowthTtmPct: null,
    netMarginTtmPct: -12.5,
    freeCashFlowMarginTtmPct: 0,
  });
});
