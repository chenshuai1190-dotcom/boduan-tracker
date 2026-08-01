import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchWithTimeout, ProviderTimeoutError } from '../server/quote/http.js';
import {
  EodhdQuotaExhaustedError,
  getEodhdQuotaGuardStateForTests,
  resetEodhdQuotaGuardForTests,
  setEodhdQuotaGuardNowForTests,
} from '../server/quote/eodhdQuotaGuard.js';

test.afterEach(() => {
  resetEodhdQuotaGuardForTests();
});

test('fetchWithTimeout returns the provider response when it completes', async () => {
  let requestSignal;
  const response = {
    ok: true,
    status: 200,
    json: async () => {
      assert.equal(requestSignal.aborted, false);
      return { close: 123.45 };
    },
  };
  const result = await fetchWithTimeout('https://example.test/quote', {}, {
    provider: 'test-provider',
    timeoutMs: 50,
    fetchImpl: async (_url, options) => {
      requestSignal = options.signal;
      assert.equal(options.signal.aborted, false);
      return response;
    },
  });

  assert.equal(result, response);
  assert.deepEqual(await result.json(), { close: 123.45 });
});

test('fetchWithTimeout rejects slow providers with ProviderTimeoutError', async () => {
  await assert.rejects(
    fetchWithTimeout('https://example.test/slow', {}, {
      provider: 'slow-provider',
      timeoutMs: 5,
      fetchImpl: () => new Promise(() => {}),
    }),
    (error) => {
      assert.ok(error instanceof ProviderTimeoutError);
      assert.equal(error.provider, 'slow-provider');
      assert.equal(error.timeoutMs, 5);
      return true;
    }
  );
});

test('EODHD REST HTTP 402 blocks later EODHD REST calls until next UTC midnight', async () => {
  setEodhdQuotaGuardNowForTests(Date.parse('2026-07-31T23:59:30.000Z'));
  const firstResponse = { ok: false, status: 402 };
  let upstreamCalls = 0;
  const url = 'https://eodhd.com/api/eod/NVDA.US?api_token=super-secret';

  const result = await fetchWithTimeout(url, {}, {
    provider: 'eodhd:test',
    timeoutMs: 50,
    fetchImpl: async () => {
      upstreamCalls += 1;
      return firstResponse;
    },
  });

  assert.equal(result, firstResponse);
  assert.equal(upstreamCalls, 1);
  assert.deepEqual(getEodhdQuotaGuardStateForTests(), {
    blocked: true,
    blockedUntilMs: Date.parse('2026-08-01T00:00:00.000Z'),
    blockedUntil: '2026-08-01T00:00:00.000Z',
  });

  await assert.rejects(
    fetchWithTimeout(
      'https://api.eodhistoricaldata.com/api/real-time/QQQ.US?api_token=another-secret',
      {},
      {
        provider: 'eodhd:test-fast-fail',
        timeoutMs: 50,
        fetchImpl: async () => {
          upstreamCalls += 1;
          return { ok: true, status: 200 };
        },
      },
    ),
    (error) => {
      assert.ok(error instanceof EodhdQuotaExhaustedError);
      assert.equal(error.code, 'EODHD_DAILY_QUOTA_EXHAUSTED');
      assert.equal(error.status, 402);
      assert.equal(error.blockedUntil, '2026-08-01T00:00:00.000Z');
      assert.doesNotMatch(error.message, /super-secret|another-secret|api_token/i);
      return true;
    },
  );
  assert.equal(upstreamCalls, 1);
});

test('EODHD quota block expires exactly at the next UTC midnight', async () => {
  let nowMs = Date.parse('2026-07-31T12:00:00.000Z');
  setEodhdQuotaGuardNowForTests(() => nowMs);
  let upstreamCalls = 0;
  const fetchImpl = async () => {
    upstreamCalls += 1;
    return upstreamCalls === 1
      ? { ok: false, status: 402 }
      : { ok: true, status: 200 };
  };

  await fetchWithTimeout('https://eodhd.com/api/real-time/NVDA.US', {}, {
    timeoutMs: 50,
    fetchImpl,
  });
  nowMs = Date.parse('2026-08-01T00:00:00.000Z');

  const response = await fetchWithTimeout('https://eodhd.com/api/real-time/NVDA.US', {}, {
    timeoutMs: 50,
    fetchImpl,
  });
  assert.equal(response.status, 200);
  assert.equal(upstreamCalls, 2);
  assert.equal(getEodhdQuotaGuardStateForTests().blocked, false);
});

test('non-402 responses and non-EODHD HTTP 402 responses do not open the quota guard', async () => {
  setEodhdQuotaGuardNowForTests(Date.parse('2026-07-31T12:00:00.000Z'));
  let upstreamCalls = 0;
  const request = async (url, status) => fetchWithTimeout(url, {}, {
    timeoutMs: 50,
    fetchImpl: async () => {
      upstreamCalls += 1;
      return { ok: status >= 200 && status < 300, status };
    },
  });

  await request('https://eodhd.com/api/real-time/NVDA.US', 429);
  await request('https://query1.finance.yahoo.com/v8/finance/chart/NVDA', 402);
  await request('https://eodhd.com.evil.example/api/eod/NVDA.US', 402);
  await request('https://eodhd.com/api/real-time/MSFT.US', 200);

  assert.equal(upstreamCalls, 4);
  assert.equal(getEodhdQuotaGuardStateForTests().blocked, false);
});

test('EODHD WebSocket URLs and other providers remain unaffected by an active REST block', async () => {
  setEodhdQuotaGuardNowForTests(Date.parse('2026-07-31T12:00:00.000Z'));
  let upstreamCalls = 0;
  const fetchImpl = async (url) => {
    upstreamCalls += 1;
    const eodhdRest = String(url).startsWith('https://eodhd.com/');
    return { ok: !eodhdRest, status: eodhdRest ? 402 : 200 };
  };

  await fetchWithTimeout('https://eodhd.com/api/eod/NVDA.US', {}, { timeoutMs: 50, fetchImpl });
  const wsResponse = await fetchWithTimeout('wss://ws.eodhistoricaldata.com/ws/us', {}, { timeoutMs: 50, fetchImpl });
  const yahooResponse = await fetchWithTimeout('https://query1.finance.yahoo.com/v8/finance/chart/NVDA', {}, { timeoutMs: 50, fetchImpl });

  assert.equal(wsResponse.status, 200);
  assert.equal(yahooResponse.status, 200);
  assert.equal(upstreamCalls, 3);
});
