import assert from 'node:assert/strict';
import test from 'node:test';

import { resetEodhdRestCaches } from '../server/quote/eodhdCache.js';
import {
  resetEodhdQuotaGuardForTests,
  setEodhdQuotaGuardNowForTests,
} from '../server/quote/eodhdQuotaGuard.js';
import { fetchWithTimeout } from '../server/quote/http.js';
import { fetchStockQuote } from '../server/quote/providers/eodhd.js';

const CLOSED_NOW = Date.parse('2026-08-01T02:30:00.000Z');

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test.afterEach(() => {
  resetEodhdRestCaches();
  resetEodhdQuotaGuardForTests();
});

test('closed session returns cached 7/31 EOD lock while the EODHD breaker is active', async () => {
  const originalFetch = globalThis.fetch;
  let eodCalls = 0;
  let delayedCalls = 0;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.includes('/api/eod/')) {
      eodCalls += 1;
      return jsonResponse([
        { date: '2026-07-30', open: 99, high: 102, low: 98, close: 100, adjusted_close: 100 },
        { date: '2026-07-31', open: 102, high: 106, low: 101, close: 105, adjusted_close: 105 },
      ]);
    }
    if (parsed.pathname.includes('/api/us-quote-delayed')) {
      delayedCalls += 1;
      throw new Error('closed session must not request delayed quote');
    }
    if (parsed.hostname === 'query1.finance.yahoo.com') {
      return jsonResponse({ chart: { result: [] } });
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  try {
    setEodhdQuotaGuardNowForTests(CLOSED_NOW);
    const first = await fetchStockQuote('NVDA', { eodhdKey: 'server-only', now: CLOSED_NOW });
    assert.equal(first.error, undefined);
    assert.equal(first.price, 105);
    assert.equal(first.previousClose, 100);
    assert.equal(first.dailyPnlPrice, 105);
    assert.equal(first.dailyPnlPriceDate, '2026-07-31');
    assert.equal(first.dailyPnlBaselineClose, 100);
    assert.equal(first.dailyPnlLocked, true);
    assert.equal(first.dailyPnlSource, 'locked-latest-eod-close');

    await fetchWithTimeout('https://eodhd.com/api/real-time/TRIP.US', {}, {
      fetchImpl: async () => ({ ok: false, status: 402 }),
      timeoutMs: 50,
    });

    const cached = await fetchStockQuote('NVDA', { eodhdKey: 'server-only', now: CLOSED_NOW });
    assert.equal(cached.error, undefined);
    assert.equal(cached.price, 105);
    assert.equal(cached.dailyPnlPriceDate, '2026-07-31');
    assert.equal(cached.dailyPnlLocked, true);
    assert.equal(eodCalls, 1);
    assert.equal(delayedCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('closed session with missing completed EOD history fails closed without Yahoo price', async () => {
  const originalFetch = globalThis.fetch;
  let delayedCalls = 0;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.includes('/api/eod/')) return jsonResponse([]);
    if (parsed.pathname.includes('/api/us-quote-delayed')) {
      delayedCalls += 1;
      return jsonResponse({ data: { 'NVDA.US': { lastTradePrice: '777' } } });
    }
    if (parsed.hostname === 'query1.finance.yahoo.com') {
      return jsonResponse({
        chart: {
          result: [{
            meta: { regularMarketPrice: 999, previousClose: 998 },
            indicators: { quote: [{ close: [999] }] },
          }],
        },
      });
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  try {
    const quote = await fetchStockQuote('NVDA', { eodhdKey: 'server-only', now: CLOSED_NOW });
    assert.equal(quote.error, 'EODHD 已完成收盘历史不完整');
    assert.equal(quote.price, undefined);
    assert.equal(quote.source, undefined);
    assert.equal(delayedCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
