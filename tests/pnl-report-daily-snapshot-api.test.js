import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import handler, { handlePnlReportDailySnapshot } from '../api/pnl-report-daily-snapshot.js';
import { resetEodhdQuotaGuardForTests } from '../server/quote/eodhdQuotaGuard.js';

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    ended: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function createRequest(overrides = {}) {
  return {
    method: 'GET',
    headers: {},
    query: { date: '2026-07-08' },
    ...overrides,
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (body == null ? '' : JSON.stringify(body)),
  };
}

function withExactSpyClose(fetchImpl, onSpy = () => {}) {
  return async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/rpc/resolve_margin_debt_snapshot_targets')) {
      const targets = JSON.parse(options.body || '{}').p_targets || [];
      return jsonResponse(targets.map((target) => ({
        ...target,
        known: false,
        margin_debt_usd: null,
        margin_debt_event_id: null,
        margin_debt_effective_at: null,
        margin_debt_basis: null,
      })));
    }
    if (href.includes('/api/eod/SPY.US')) {
      onSpy(href);
      const targetDate = new URL(href).searchParams.get('to');
      return jsonResponse([{ date: targetDate, close: 600, adjusted_close: 600 }]);
    }
    return fetchImpl(url, options);
  };
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test('daily P&L snapshot cron endpoint requires CRON_SECRET', async () => {
  const env = { CRON_SECRET: process.env.CRON_SECRET };
  delete process.env.CRON_SECRET;
  const res = createResponse();
  try {
    await handler(createRequest(), res);
  } finally {
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /CRON_SECRET/);
});

test('daily P&L snapshot cron endpoint rejects invalid bearer secret', async () => {
  const env = { CRON_SECRET: process.env.CRON_SECRET };
  process.env.CRON_SECRET = 'expected-secret';
  const res = createResponse();
  try {
    await handler(createRequest({
      headers: { authorization: 'Bearer wrong-secret' },
    }), res);
  } finally {
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /未授权/);
});

test('scheduled P&L snapshot defers before 17:00 New York without provider or database access', async () => {
  const env = { CRON_SECRET: process.env.CRON_SECRET };
  process.env.CRON_SECRET = 'cron-secret';
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('fetch must not be called before the snapshot window');
  };
  const res = createResponse();
  try {
    await handlePnlReportDailySnapshot(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: {},
    }), res, { now: new Date('2026-07-08T20:30:00Z') });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.deferred, true);
  assert.equal(res.body.reason, 'before_new_york_snapshot_window');
  assert.equal(res.body.notBefore, '17:00');
  assert.equal(fetchCalls, 0);
});

test('present but empty, blank, or invalid explicit P&L dates fail closed without provider access', async () => {
  const env = { CRON_SECRET: process.env.CRON_SECRET };
  process.env.CRON_SECRET = 'cron-secret';
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('fetch must not be called for an invalid date');
  };

  try {
    for (const date of ['', '   ', undefined, 'not-a-date', '2026-02-31']) {
      const res = createResponse();
      await handlePnlReportDailySnapshot(createRequest({
        headers: { authorization: 'Bearer cron-secret' },
        query: { date },
      }), res, { now: new Date('2026-07-08T22:30:00Z') });
      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, /目标日期不合法/);
    }
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(fetchCalls, 0);
});

test('explicit same-day P&L date cannot bypass 17:00 New York across DST', async () => {
  const env = { CRON_SECRET: process.env.CRON_SECRET };
  process.env.CRON_SECRET = 'cron-secret';
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('fetch must not be called before the same-day snapshot window');
  };

  try {
    for (const { date, now } of [
      { date: '2026-07-08', now: new Date('2026-07-08T20:30:00Z') },
      { date: '2026-01-14', now: new Date('2026-01-14T21:30:00Z') },
    ]) {
      const res = createResponse();
      await handlePnlReportDailySnapshot(createRequest({
        headers: { authorization: 'Bearer cron-secret' },
        query: { date },
      }), res, { now });
      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, /目标日期不合法/);
    }
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(fetchCalls, 0);
});

test('explicit same-day P&L date opens at 17:00 New York across DST', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  let spyCalls = 0;
  const requestOrder = [];
  globalThis.fetch = withExactSpyClose(async (url) => {
    fetchCalls += 1;
    if (String(url).includes('/rest/v1/stock_trades')) {
      requestOrder.push('stock_trades');
      return jsonResponse([]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }, () => {
    spyCalls += 1;
    requestOrder.push('SPY');
  });

  try {
    for (const { date, now } of [
      { date: '2026-07-08', now: new Date('2026-07-08T21:00:00Z') },
      { date: '2026-01-14', now: new Date('2026-01-14T22:00:00Z') },
    ]) {
      const res = createResponse();
      await handlePnlReportDailySnapshot(createRequest({
        headers: { authorization: 'Bearer cron-secret' },
        query: { date },
      }), res, { now });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.targetDate, date);
    }
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(fetchCalls, 2);
  assert.equal(spyCalls, 0, 'valid explicit dates must be checked by the local NYSE calendar');
  assert.deepEqual(requestOrder, ['stock_trades', 'stock_trades']);
});

test('explicit future P&L date fails closed without provider access', async () => {
  const env = { CRON_SECRET: process.env.CRON_SECRET };
  process.env.CRON_SECRET = 'cron-secret';
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('fetch must not be called for a future snapshot date');
  };
  const res = createResponse();

  try {
    await handlePnlReportDailySnapshot(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-09' },
    }), res, { now: new Date('2026-07-08T22:30:00Z') });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /目标日期不合法/);
  assert.equal(fetchCalls, 0);
});

test('valid historical explicit P&L date bypasses the 17:00 gate for CRON_SECRET repair', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  let spyCalls = 0;
  globalThis.fetch = withExactSpyClose(async (url) => {
    fetchCalls += 1;
    if (String(url).includes('/rest/v1/stock_trades')) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${url}`);
  }, () => { spyCalls += 1; });

  const res = createResponse();
  try {
    await handlePnlReportDailySnapshot(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-07' },
    }), res, { now: new Date('2026-07-08T20:30:00Z') });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.targetDate, '2026-07-07');
  assert.equal(res.body.deferred, undefined);
  assert.equal(fetchCalls, 1);
  assert.equal(spyCalls, 0, 'historical repair must not spend an EODHD call on SPY calendar discovery');
});

test('explicit Saturday date returns deterministic 400 before provider or ledger access', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  let spyAttempts = 0;
  let supabaseCalls = 0;
  const soldOutTrades = [
    { id: 'buy', user_id: 'sold-out-user', symbol: 'NVDA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, currency: 'USD' },
    { id: 'sell', user_id: 'sold-out-user', symbol: 'NVDA', side: 'sell', trade_date: '2026-07-10', price: 120, shares: 2, currency: 'USD' },
  ];
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/api/eod/SPY.US')) {
      spyAttempts += 1;
      return jsonResponse([{ date: '2026-07-10', close: 600, adjusted_close: 600 }]);
    }
    if (href.includes('supabase.test')) {
      supabaseCalls += 1;
      if (href.includes('/rest/v1/stock_trades')) return jsonResponse(soldOutTrades);
      return jsonResponse(null);
    }
    throw new Error(`unexpected fetch: ${href}`);
  };

  const res = createResponse();
  try {
    await handlePnlReportDailySnapshot(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-11' },
    }), res, { now: new Date('2026-07-11T21:30:00Z') });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 400);
  assert.equal(res.headers['retry-after'], undefined);
  assert.match(res.body.error, /目标日期不合法/);
  assert.equal(spyAttempts, 0);
  assert.equal(supabaseCalls, 0);
});

test('explicit recurring and extraordinary NYSE closures are rejected locally without provider access', async () => {
  const env = { CRON_SECRET: process.env.CRON_SECRET };
  process.env.CRON_SECRET = 'cron-secret';
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('holiday validation must stay local');
  };

  const observedHolidayRes = createResponse();
  const extraordinaryClosureRes = createResponse();
  try {
    await handlePnlReportDailySnapshot(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      // Independence Day 2026 falls on Saturday and is observed on Friday.
      query: { date: '2026-07-03' },
    }), observedHolidayRes, { now: new Date('2026-07-04T18:00:00Z') });
    await handlePnlReportDailySnapshot(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      // NYSE closed for the Carter National Day of Mourning.
      query: { date: '2025-01-09' },
    }), extraordinaryClosureRes, { now: new Date('2026-07-04T18:00:00Z') });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(observedHolidayRes.statusCode, 400);
  assert.equal(extraordinaryClosureRes.statusCode, 400);
  assert.equal(fetchCalls, 0);
});

test('daily P&L snapshot cron builds all-user close snapshots from stock_trades and EODHD', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  const calls = [];
  const writes = {
    portfolios: [],
    markerDeletes: [],
    symbols: [],
    deletes: [],
  };
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';

  globalThis.fetch = withExactSpyClose(async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, options });
    if (href.includes('/rest/v1/stock_trades')) {
      assert.equal(options.headers.Authorization, 'Bearer service-role-secret');
      assert.equal(options.headers.apikey, 'service-role-secret');
      return jsonResponse([
        {
          id: 'trade-1',
          user_id: 'user-a',
          symbol: 'NVDA',
          name: '英伟达',
          side: 'buy',
          trade_date: '2026-07-01',
          price: 100,
          shares: 10,
          fee: 0,
          currency: 'USD',
          created_at: '2026-07-01T10:00:00Z',
        },
        {
          id: 'trade-2',
          user_id: 'user-a',
          symbol: 'MSFT',
          name: '微软',
          side: 'buy',
          trade_date: '2026-07-01',
          price: 200,
          shares: 2,
          fee: 0,
          currency: 'USD',
          created_at: '2026-07-01T10:01:00Z',
        },
        {
          id: 'trade-3',
          user_id: 'user-b',
          symbol: 'NVDA',
          name: '英伟达',
          side: 'buy',
          trade_date: '2026-07-01',
          price: 110,
          shares: 5,
          fee: 0,
          currency: 'USD',
          created_at: '2026-07-01T10:02:00Z',
        },
      ]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      return jsonResponse([
        { date: '2026-07-07', close: 120, adjusted_close: 120 },
        { date: '2026-07-08', close: 125, adjusted_close: 125 },
      ]);
    }
    if (href.includes('/api/eod/MSFT.US')) {
      return jsonResponse([
        { date: '2026-07-07', close: 210, adjusted_close: 210 },
        { date: '2026-07-08', close: 220, adjusted_close: 220 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && options.method === 'DELETE') {
      writes.markerDeletes.push(href);
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots')) {
      writes.portfolios.push(JSON.parse(options.body));
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots') && options.method === 'DELETE') {
      writes.deletes.push(href);
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots')) {
      writes.symbols.push(JSON.parse(options.body));
      return jsonResponse(null);
    }
    throw new Error(`unexpected fetch: ${href}`);
  });

  const res = createResponse();
  try {
    await handler(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-08' },
    }), res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.complete, true);
  assert.equal(res.body.retryable, false);
  assert.equal(res.body.failedSymbolsCount, 0);
  assert.equal(res.body.targetDate, '2026-07-08');
  assert.equal(res.body.attemptedUsers, 2);
  assert.equal(res.body.writtenUsers, 2);
  assert.equal(res.body.symbolsCount, 2);
  assert.equal(writes.portfolios.length, 2);
  assert.equal(writes.markerDeletes.length, 2);
  assert.equal(writes.symbols.length, 2);
  assert.equal(writes.deletes.length, 2);
  const portfolioRows = writes.portfolios.flat().sort((a, b) => a.user_id.localeCompare(b.user_id));
  assert.equal(portfolioRows[0].user_id, 'user-a');
  assert.equal(portfolioRows[0].snapshot_date, '2026-07-08');
  assert.equal(portfolioRows[0].market_value_usd, 1690);
  assert.equal(portfolioRows[0].cumulative_pnl_usd, 290);
  assert.equal(portfolioRows[0].daily_pnl_usd, 70);
  assert.equal(portfolioRows[1].user_id, 'user-b');
  assert.equal(portfolioRows[1].daily_pnl_usd, 25);
  const symbolRows = writes.symbols.flat();
  assert.ok(symbolRows.some((row) => row.user_id === 'user-a' && row.symbol === 'MSFT' && row.daily_pnl_usd === 20));
  assert.doesNotMatch(JSON.stringify(res.body), /service-role-secret|eodhd-secret|cron-secret/);
  assert.ok(calls.some((call) => call.href.includes('api_token=eodhd-secret')), 'EODHD key should only be used in outbound provider request');
});

test('daily P&L snapshot retries a transient symbol failure and keeps sold-out symbol closes optional', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  let nvdaAttempts = 0;
  let aaplAttempts = 0;
  let tslaAttempts = 0;
  let portfolioWrites = 0;
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';

  globalThis.fetch = withExactSpyClose(async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'open-1', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
        { id: 'closed-1', user_id: 'user-a', symbol: 'AAPL', name: 'Apple', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 1, fee: 0, currency: 'USD' },
        { id: 'closed-2', user_id: 'user-a', symbol: 'AAPL', name: 'Apple', side: 'sell', trade_date: '2026-07-02', price: 110, shares: 1, fee: 0, currency: 'USD' },
        { id: 'ordered-1', user_id: 'user-a', symbol: 'TSLA', name: 'Tesla', side: 'sell', trade_date: '2026-07-03', price: 200, shares: 2, fee: 0, currency: 'USD', created_at: '2026-07-03T09:00:00Z' },
        { id: 'ordered-2', user_id: 'user-a', symbol: 'TSLA', name: 'Tesla', side: 'buy', trade_date: '2026-07-03', price: 190, shares: 1, fee: 0, currency: 'USD', created_at: '2026-07-03T10:00:00Z' },
      ]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      nvdaAttempts += 1;
      if (nvdaAttempts === 1) return jsonResponse({ error: 'temporary' }, 503);
      return jsonResponse([
        { date: '2026-07-07', close: 119, adjusted_close: 119 },
        { date: '2026-07-08', close: 120, adjusted_close: 120 },
      ]);
    }
    if (href.includes('/api/eod/AAPL.US')) {
      aaplAttempts += 1;
      return jsonResponse([
        { date: '2026-07-07', close: 111, adjusted_close: 111 },
        { date: '2026-07-08', close: 112, adjusted_close: 112 },
      ]);
    }
    if (href.includes('/api/eod/TSLA.US')) {
      tslaAttempts += 1;
      return jsonResponse([
        { date: '2026-07-07', close: 198, adjusted_close: 198 },
        { date: '2026-07-08', close: 201, adjusted_close: 201 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && options.method === 'POST') {
      portfolioWrites += 1;
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots')) return jsonResponse(null);
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots')) return jsonResponse(null);
    throw new Error(`unexpected fetch: ${href}`);
  });

  const res = createResponse();
  try {
    await handler(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-08' },
    }), res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(nvdaAttempts, 2);
  assert.equal(aaplAttempts, 0, 'sold-out symbols must not consume an unnecessary EODHD request');
  assert.equal(tslaAttempts, 1, 'the close requirement must follow the snapshot model trade ordering and oversell clamp');
  assert.equal(portfolioWrites, 1);
  assert.equal(res.body.success, true);
  assert.equal(res.body.complete, true);
  assert.equal(res.body.retryable, false);
  assert.equal(res.body.symbolsCount, 3);
  assert.equal(res.body.failedSymbolsCount, 0);
});

test('daily P&L snapshot retries a stale 200 payload until the target close appears', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  let eodAttempts = 0;
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';

  globalThis.fetch = withExactSpyClose(async (url) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'trade-1', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      eodAttempts += 1;
      if (eodAttempts === 1) {
        return jsonResponse([{ date: '2026-07-07', close: 119, adjusted_close: 119 }]);
      }
      return jsonResponse([
        { date: '2026-07-07', close: 119, adjusted_close: 119 },
        { date: '2026-07-08', close: 120, adjusted_close: 120 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots')) return jsonResponse(null);
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots')) return jsonResponse(null);
    throw new Error(`unexpected fetch: ${href}`);
  });

  const res = createResponse();
  try {
    await handler(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-08' },
    }), res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(eodAttempts, 2);
  assert.equal(res.body.success, true);
  assert.equal(res.body.complete, true);
  assert.equal(res.body.retryable, false);
  assert.equal(res.body.failedSymbolsCount, 0);
});

test('daily P&L snapshot isolates symbols and reports exhausted target-close gaps as retryable incomplete work', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  const eodAttempts = { NVDA: 0, MSFT: 0 };
  const writtenUsers = [];
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';

  globalThis.fetch = withExactSpyClose(async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'trade-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
        { id: 'trade-b', user_id: 'user-b', symbol: 'MSFT', name: 'Microsoft', side: 'buy', trade_date: '2026-07-01', price: 200, shares: 1, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      eodAttempts.NVDA += 1;
      return jsonResponse([{ date: '2026-07-07', close: 119, adjusted_close: 119 }]);
    }
    if (href.includes('/api/eod/MSFT.US')) {
      eodAttempts.MSFT += 1;
      return jsonResponse([
        { date: '2026-07-07', close: 219, adjusted_close: 219 },
        { date: '2026-07-08', close: 220, adjusted_close: 220 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && options.method === 'POST') {
      writtenUsers.push(JSON.parse(options.body)[0].user_id);
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots')) return jsonResponse(null);
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots')) return jsonResponse(null);
    throw new Error(`unexpected fetch: ${href}`);
  });

  const res = createResponse();
  try {
    await handler(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-08' },
    }), res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.deepEqual(eodAttempts, { NVDA: 3, MSFT: 1 });
  assert.deepEqual(writtenUsers, ['user-b']);
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['retry-after'], '300');
  assert.equal(res.body.success, false);
  assert.equal(res.body.complete, false);
  assert.equal(res.body.retryable, true);
  assert.equal(res.body.failedSymbolsCount, 1);
  assert.deepEqual(res.body.failedSymbols, [{
    symbol: 'NVDA',
    retryable: true,
    status: null,
    reason: 'missing_target_close',
    attempts: 3,
  }]);
  assert.equal(res.body.writtenUsers, 1);
  assert.equal(res.body.skippedUsers, 1);
  assert.equal(res.body.skippedReasons.missing_close, 1);
});

test('EODHD HTTP 401 is a permanent explicit failure and is never retried', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  let eodAttempts = 0;
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';

  globalThis.fetch = withExactSpyClose(async (url) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'trade-1', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      eodAttempts += 1;
      return jsonResponse({ error: 'unauthorized range' }, 401);
    }
    throw new Error(`unexpected fetch: ${href}`);
  });

  const res = createResponse();
  try {
    await handler(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-08' },
    }), res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(eodAttempts, 1);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.complete, false);
  assert.equal(res.body.retryable, false);
  assert.equal(res.body.failedSymbolsCount, 1);
  assert.equal(res.body.failedSymbols[0].status, 401);
  assert.equal(res.body.failedSymbols[0].reason, 'http_401');
  assert.equal(res.body.failedSymbols[0].attempts, 1);
});

test('EODHD HTTP 402 is retryable after the next UTC reset and never writes a completion marker', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  let nvdaNetworkCalls = 0;
  let completionWrites = 0;
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';
  resetEodhdQuotaGuardForTests();

  globalThis.fetch = withExactSpyClose(async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'trade-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      nvdaNetworkCalls += 1;
      return jsonResponse({ error: 'daily quota exhausted' }, 402);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && options.method === 'POST') {
      completionWrites += 1;
      return jsonResponse(null);
    }
    throw new Error(`unexpected fetch: ${href}`);
  });

  const res = createResponse();
  try {
    await handler(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-08' },
    }), res);
  } finally {
    resetEodhdQuotaGuardForTests();
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(nvdaNetworkCalls, 1, 'the in-instance quota guard must suppress repeated network calls');
  assert.equal(completionWrites, 0);
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['retry-after'], '300');
  assert.equal(res.body.complete, false);
  assert.equal(res.body.retryable, true);
  assert.deepEqual(res.body.failedSymbols, [{
    symbol: 'NVDA',
    retryable: true,
    status: 402,
    reason: 'http_402',
    attempts: 3,
  }]);
});

test('open-position completion marker requires positive current and previous closes plus daily P&L', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  const mutations = [];
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';

  globalThis.fetch = withExactSpyClose(async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'trade-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      // The target close exists, but there is no previous completed close.
      // The historical builder can construct a row, while the completion
      // contract must reject it as retryable incomplete work.
      return jsonResponse([
        { date: '2026-07-08', close: 120, adjusted_close: 120 },
      ]);
    }
    if (
      (href.includes('/rest/v1/pnl_report_snapshots') || href.includes('/rest/v1/pnl_report_symbol_snapshots'))
      && (options.method === 'DELETE' || options.method === 'POST')
    ) {
      mutations.push(`${options.method}:${href}`);
      return jsonResponse(null);
    }
    throw new Error(`unexpected fetch: ${href}`);
  });

  const res = createResponse();
  try {
    await handler(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-08' },
    }), res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.complete, false);
  assert.equal(res.body.retryable, true);
  assert.equal(res.body.failedSnapshots, 1);
  assert.equal(res.body.failedReasons.snapshot_write_transient_error, 1);
  assert.deepEqual(mutations, [], 'an incomplete build must not touch symbols or the completion marker');
});

test('scheduled no-date P&L snapshot catches an existing user up through local 7/13 and 7/14 trading dates', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const OriginalDate = globalThis.Date;
  const originalFetch = globalThis.fetch;
  const fixedNow = '2026-07-15T00:30:00.000Z';
  const portfolioWrites = [];
  const marginTargets = [];
  const mutationOrder = [];
  let latestSnapshotReads = 0;
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';
  globalThis.Date = class FixedDate extends OriginalDate {
    constructor(...args) {
      super(...(args.length > 0 ? args : [fixedNow]));
    }

    static now() {
      return OriginalDate.parse(fixedNow);
    }
  };

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/rpc/resolve_margin_debt_snapshot_targets')) {
      const targets = JSON.parse(options.body || '{}').p_targets || [];
      marginTargets.push(...targets);
      mutationOrder.push('margin-rpc');
      return jsonResponse(targets.map((target) => {
        const key = `${target.user_id}:${target.snapshot_date}`;
        if (key === 'user-a:2026-07-13') {
          return {
            ...target,
            known: false,
            margin_debt_usd: null,
            margin_debt_event_id: null,
            margin_debt_effective_at: null,
            margin_debt_basis: null,
          };
        }
        if (key === 'user-a:2026-07-14') {
          return {
            ...target,
            known: true,
            margin_debt_usd: 1500,
            margin_debt_event_id: 41,
            margin_debt_effective_at: '2026-07-14T20:55:00.000Z',
            margin_debt_basis: 'event',
          };
        }
        if (key === 'user-b:2026-07-14') {
          return {
            ...target,
            known: true,
            margin_debt_usd: 0,
            margin_debt_event_id: null,
            margin_debt_effective_at: null,
            margin_debt_basis: 'default_zero',
          };
        }
        throw new Error(`unexpected margin target: ${key}`);
      }));
    }
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'trade-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
        { id: 'trade-b', user_id: 'user-b', symbol: 'MSFT', name: 'Microsoft', side: 'buy', trade_date: '2026-07-01', price: 200, shares: 1, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && !options.method) {
      latestSnapshotReads += 1;
      if (href.includes('user_id=eq.user-a')) {
        return jsonResponse([{
          snapshot_date: '2026-07-10',
          daily_pnl_usd: 4,
          daily_pnl_pct: 0.02,
          holding_count: 1,
        }]);
      }
      if (href.includes('user_id=eq.user-b')) return jsonResponse([]);
    }
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots') && !options.method) {
      return jsonResponse([{
        snapshot_date: '2026-07-10',
        symbol: 'NVDA',
        is_open: true,
        current_price_usd: 120,
        previous_close_usd: 119,
        daily_pnl_usd: 2,
      }]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && options.method === 'DELETE') {
      mutationOrder.push('marker-delete');
      return jsonResponse(null);
    }
    if (href.includes('/api/eod/SPY.US')) {
      return jsonResponse([
        { date: '2026-07-10', close: 620, adjusted_close: 620 },
        { date: '2026-07-13', close: 622, adjusted_close: 622 },
        { date: '2026-07-14', close: 624, adjusted_close: 624 },
      ]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      return jsonResponse([
        { date: '2026-07-10', close: 120, adjusted_close: 120 },
        { date: '2026-07-13', close: 121, adjusted_close: 121 },
        { date: '2026-07-14', close: 123, adjusted_close: 123 },
      ]);
    }
    if (href.includes('/api/eod/MSFT.US')) {
      return jsonResponse([
        { date: '2026-07-10', close: 220, adjusted_close: 220 },
        { date: '2026-07-13', close: 221, adjusted_close: 221 },
        { date: '2026-07-14', close: 223, adjusted_close: 223 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && options.method === 'POST') {
      mutationOrder.push('marker-write');
      portfolioWrites.push(JSON.parse(options.body)[0]);
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots')) {
      mutationOrder.push(options.method === 'DELETE' ? 'symbol-delete' : 'symbol-write');
      return jsonResponse(null);
    }
    throw new Error(`unexpected fetch: ${href}`);
  };

  const res = createResponse();
  try {
    await handlePnlReportDailySnapshot(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: {},
    }), res, { now: new Date('2026-07-14T22:00:00Z') });
  } finally {
    globalThis.Date = OriginalDate;
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.catchUp, true);
  assert.equal(res.body.targetDate, '2026-07-14');
  assert.equal(res.body.plannedSnapshots, 3);
  assert.equal(res.body.writtenSnapshots, 3);
  assert.equal(res.body.writtenUsers, 2);
  assert.equal(latestSnapshotReads, 2);
  assert.deepEqual(
    marginTargets.map((target) => `${target.user_id}:${target.snapshot_date}`),
    ['user-a:2026-07-13', 'user-a:2026-07-14', 'user-b:2026-07-14']
  );
  assert.deepEqual(
    portfolioWrites.map((row) => `${row.user_id}:${row.snapshot_date}`),
    ['user-a:2026-07-13', 'user-a:2026-07-14', 'user-b:2026-07-14']
  );
  const portfolioByTarget = new Map(
    portfolioWrites.map((row) => [`${row.user_id}:${row.snapshot_date}`, row])
  );
  assert.deepEqual(
    {
      margin_debt_usd: portfolioByTarget.get('user-a:2026-07-13').margin_debt_usd,
      margin_debt_event_id: portfolioByTarget.get('user-a:2026-07-13').margin_debt_event_id,
      margin_debt_effective_at: portfolioByTarget.get('user-a:2026-07-13').margin_debt_effective_at,
      margin_debt_basis: portfolioByTarget.get('user-a:2026-07-13').margin_debt_basis,
    },
    {
      margin_debt_usd: null,
      margin_debt_event_id: null,
      margin_debt_effective_at: null,
      margin_debt_basis: null,
    }
  );
  assert.deepEqual(
    {
      margin_debt_usd: portfolioByTarget.get('user-a:2026-07-14').margin_debt_usd,
      margin_debt_event_id: portfolioByTarget.get('user-a:2026-07-14').margin_debt_event_id,
      margin_debt_effective_at: portfolioByTarget.get('user-a:2026-07-14').margin_debt_effective_at,
      margin_debt_basis: portfolioByTarget.get('user-a:2026-07-14').margin_debt_basis,
    },
    {
      margin_debt_usd: 1500,
      margin_debt_event_id: '41',
      margin_debt_effective_at: '2026-07-14T20:55:00.000Z',
      margin_debt_basis: 'event',
    }
  );
  assert.deepEqual(
    {
      margin_debt_usd: portfolioByTarget.get('user-b:2026-07-14').margin_debt_usd,
      margin_debt_event_id: portfolioByTarget.get('user-b:2026-07-14').margin_debt_event_id,
      margin_debt_effective_at: portfolioByTarget.get('user-b:2026-07-14').margin_debt_effective_at,
      margin_debt_basis: portfolioByTarget.get('user-b:2026-07-14').margin_debt_basis,
    },
    {
      margin_debt_usd: 0,
      margin_debt_event_id: null,
      margin_debt_effective_at: null,
      margin_debt_basis: 'default_zero',
    }
  );
  assert.ok(portfolioWrites.every((row) => row.source_version === 'pnl_snapshot_v2'));
  assert.equal(mutationOrder[0], 'margin-rpc');
  assert.equal(mutationOrder.filter((event) => event === 'margin-rpc').length, 1);
  assert.ok(mutationOrder.slice(1).every((event) => (
    ['marker-delete', 'symbol-delete', 'symbol-write', 'marker-write'].includes(event)
  )));
  assert.doesNotMatch(JSON.stringify(res.body), /user-a|user-b/);
});

test('margin snapshot RPC contract failures stop before every P&L mutation', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';

  const unknownRow = (target) => ({
    ...target,
    known: false,
    margin_debt_usd: null,
    margin_debt_event_id: null,
    margin_debt_effective_at: null,
    margin_debt_basis: null,
  });
  const cases = [
    {
      name: 'incomplete',
      rows: () => [],
    },
    {
      name: 'duplicate',
      rows: (target) => [unknownRow(target), unknownRow(target)],
    },
    {
      name: 'malformed-known-event',
      rows: (target) => [{
        ...target,
        known: true,
        margin_debt_usd: 250,
        margin_debt_event_id: null,
        margin_debt_effective_at: null,
        margin_debt_basis: 'event',
      }],
    },
  ];

  try {
    for (const contractCase of cases) {
      let rpcCalls = 0;
      let stockProviderCalls = 0;
      let pnlMutations = 0;
      const events = [];
      globalThis.fetch = async (url, options = {}) => {
        const href = String(url);
        if (href.includes('/api/eod/SPY.US')) {
          return jsonResponse([
            { date: '2026-07-08', close: 620, adjusted_close: 620 },
          ]);
        }
        if (href.includes('/rest/v1/stock_trades')) {
          return jsonResponse([
            { id: 'trade-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
          ]);
        }
        if (href.includes('/rest/v1/rpc/resolve_margin_debt_snapshot_targets')) {
          rpcCalls += 1;
          events.push('margin-rpc');
          const targets = JSON.parse(options.body || '{}').p_targets || [];
          assert.deepEqual(
            targets.map((target) => `${target.user_id}:${target.snapshot_date}`),
            ['user-a:2026-07-08'],
            contractCase.name
          );
          return jsonResponse(contractCase.rows(targets[0]));
        }
        if (href.includes('/api/eod/NVDA.US')) {
          stockProviderCalls += 1;
          return jsonResponse([
            { date: '2026-07-08', close: 120, adjusted_close: 120 },
          ]);
        }
        if (
          (
            href.includes('/rest/v1/pnl_report_snapshots')
            || href.includes('/rest/v1/pnl_report_symbol_snapshots')
          )
          && (options.method === 'DELETE' || options.method === 'POST')
        ) {
          pnlMutations += 1;
          events.push('pnl-mutation');
          return jsonResponse(null);
        }
        throw new Error(`unexpected fetch for ${contractCase.name}: ${href}`);
      };

      const res = createResponse();
      await handler(createRequest({
        headers: { authorization: 'Bearer cron-secret' },
        query: { date: '2026-07-08' },
      }), res);

      assert.equal(res.statusCode, 503, contractCase.name);
      assert.equal(res.headers['retry-after'], '300', contractCase.name);
      assert.match(res.body.error, /暂时失败/, contractCase.name);
      assert.doesNotMatch(
        JSON.stringify(res.body),
        /融资快照解析结果|margin_snapshot_contract_invalid/,
        contractCase.name
      );
      assert.equal(rpcCalls, 1, contractCase.name);
      assert.equal(stockProviderCalls, 0, contractCase.name);
      assert.equal(pnlMutations, 0, contractCase.name);
      assert.deepEqual(events, ['margin-rpc'], contractCase.name);
    }
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test('scheduled catch-up scans the local 31-day NYSE calendar and uses a 7/31 short EOD window', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  let spyAttempts = 0;
  let snapshotReadHref = '';
  let nvdaEodHref = '';
  const portfolioWrites = [];
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'trade-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/api/eod/SPY.US')) {
      spyAttempts += 1;
      throw new Error('SPY calendar discovery must not be called');
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && !options.method) {
      snapshotReadHref = href;
      return jsonResponse([]);
    }
    if (href.includes('/rest/v1/rpc/resolve_margin_debt_snapshot_targets')) {
      const targets = JSON.parse(options.body || '{}').p_targets || [];
      return jsonResponse(targets.map((target) => ({ ...target, known: false })));
    }
    if (href.includes('/api/eod/NVDA.US')) {
      nvdaEodHref = href;
      return jsonResponse([
        { date: '2026-07-30', close: 191, adjusted_close: 191 },
        { date: '2026-07-31', close: 194, adjusted_close: 194 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && options.method === 'POST') {
      portfolioWrites.push(JSON.parse(options.body)[0]);
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots')) return jsonResponse(null);
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots')) return jsonResponse(null);
    throw new Error(`unexpected fetch: ${href}`);
  };

  const res = createResponse();
  try {
    await handlePnlReportDailySnapshot(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: {},
    }), res, { now: new Date('2026-07-31T22:00:00Z') });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['retry-after'], undefined);
  assert.equal(res.body.complete, true);
  assert.equal(res.body.retryable, false);
  assert.equal(res.body.tradingDatesCount, 23, 'the observed 7/3 holiday must be absent from the local calendar');
  assert.equal(spyAttempts, 0);
  assert.match(snapshotReadHref, /snapshot_date=gte\.2026-06-30/);
  assert.match(snapshotReadHref, /snapshot_date=lte\.2026-07-31/);
  const eodUrl = new URL(nvdaEodHref);
  assert.equal(eodUrl.searchParams.get('from'), '2026-07-27');
  assert.equal(eodUrl.searchParams.get('to'), '2026-07-31');
  assert.deepEqual(portfolioWrites.map((row) => [row.user_id, row.snapshot_date]), [
    ['user-a', '2026-07-31'],
  ]);
});

test('scheduled catch-up blocks a failed user from later dates while other users continue', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const OriginalDate = globalThis.Date;
  const originalFetch = globalThis.fetch;
  const fixedNow = '2026-07-15T00:30:00.000Z';
  const portfolioWrites = [];
  let nvdaAttempts = 0;
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';
  globalThis.Date = class FixedDate extends OriginalDate {
    constructor(...args) {
      super(...(args.length > 0 ? args : [fixedNow]));
    }

    static now() {
      return OriginalDate.parse(fixedNow);
    }
  };

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/rpc/resolve_margin_debt_snapshot_targets')) {
      const targets = JSON.parse(options.body || '{}').p_targets || [];
      return jsonResponse(targets.map((target) => ({ ...target, known: false })));
    }
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'trade-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
        { id: 'trade-b', user_id: 'user-b', symbol: 'MSFT', name: 'Microsoft', side: 'buy', trade_date: '2026-07-01', price: 200, shares: 1, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && !options.method) {
      return jsonResponse([{
        snapshot_date: '2026-07-10',
        daily_pnl_usd: 2,
        daily_pnl_pct: 0.01,
        holding_count: 1,
      }]);
    }
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots') && !options.method) {
      const symbol = href.includes('user_id=eq.user-a') ? 'NVDA' : 'MSFT';
      return jsonResponse([{
        snapshot_date: '2026-07-10',
        symbol,
        is_open: true,
        current_price_usd: symbol === 'NVDA' ? 120 : 220,
        previous_close_usd: symbol === 'NVDA' ? 119 : 219,
        daily_pnl_usd: symbol === 'NVDA' ? 2 : 1,
      }]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && options.method === 'DELETE') {
      return jsonResponse(null);
    }
    if (href.includes('/api/eod/SPY.US')) {
      return jsonResponse([
        { date: '2026-07-10', close: 620, adjusted_close: 620 },
        { date: '2026-07-13', close: 622, adjusted_close: 622 },
        { date: '2026-07-14', close: 624, adjusted_close: 624 },
      ]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      nvdaAttempts += 1;
      return jsonResponse([
        { date: '2026-07-10', close: 120, adjusted_close: 120 },
        { date: '2026-07-14', close: 123, adjusted_close: 123 },
      ]);
    }
    if (href.includes('/api/eod/MSFT.US')) {
      return jsonResponse([
        { date: '2026-07-10', close: 220, adjusted_close: 220 },
        { date: '2026-07-13', close: 221, adjusted_close: 221 },
        { date: '2026-07-14', close: 223, adjusted_close: 223 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && options.method === 'POST') {
      portfolioWrites.push(JSON.parse(options.body)[0]);
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots')) return jsonResponse(null);
    throw new Error(`unexpected fetch: ${href}`);
  };

  const res = createResponse();
  try {
    await handler(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: {},
    }), res);
  } finally {
    globalThis.Date = OriginalDate;
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.complete, false);
  assert.equal(res.body.retryable, true);
  assert.equal(nvdaAttempts, 3);
  assert.equal(res.body.plannedSnapshots, 4);
  assert.equal(res.body.attemptedSnapshots, 3);
  assert.equal(res.body.writtenSnapshots, 2);
  assert.equal(res.body.skippedSnapshots, 1);
  assert.equal(res.body.deferredSnapshots, 1);
  assert.deepEqual(
    portfolioWrites.map((row) => `${row.user_id}:${row.snapshot_date}`),
    ['user-b:2026-07-13', 'user-b:2026-07-14']
  );
  assert.doesNotMatch(JSON.stringify(res.body), /user-a|user-b/);
});

test('scheduled catch-up merges adjacent missing dates into one short EOD request per symbol', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  const eodHrefs = [];
  const portfolioWrites = [];
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'trade-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && !options.method) {
      return jsonResponse([
        { snapshot_date: '2026-07-28', daily_pnl_usd: 2, daily_pnl_pct: 0.01, holding_count: 1 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots') && !options.method) {
      return jsonResponse([{
        snapshot_date: '2026-07-28',
        symbol: 'NVDA',
        is_open: true,
        current_price_usd: 188,
        previous_close_usd: 186,
        daily_pnl_usd: 4,
      }]);
    }
    if (href.includes('/rest/v1/rpc/resolve_margin_debt_snapshot_targets')) {
      const targets = JSON.parse(options.body || '{}').p_targets || [];
      return jsonResponse(targets.map((target) => ({ ...target, known: false })));
    }
    if (href.includes('/api/eod/SPY.US')) throw new Error('SPY must not be requested');
    if (href.includes('/api/eod/NVDA.US')) {
      eodHrefs.push(href);
      return jsonResponse([
        { date: '2026-07-28', close: 188, adjusted_close: 188 },
        { date: '2026-07-29', close: 189, adjusted_close: 189 },
        { date: '2026-07-30', close: 191, adjusted_close: 191 },
        { date: '2026-07-31', close: 194, adjusted_close: 194 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && options.method === 'POST') {
      portfolioWrites.push(JSON.parse(options.body)[0]);
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots')) return jsonResponse(null);
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots')) return jsonResponse(null);
    throw new Error(`unexpected fetch: ${href}`);
  };

  const res = createResponse();
  try {
    await handlePnlReportDailySnapshot(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: {},
    }), res, { now: new Date('2026-07-31T22:00:00Z') });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.complete, true);
  assert.equal(res.body.plannedSnapshots, 3);
  assert.equal(eodHrefs.length, 1, 'three adjacent gaps must not become three requests for one symbol');
  const eodUrl = new URL(eodHrefs[0]);
  assert.equal(eodUrl.searchParams.get('from'), '2026-07-25');
  assert.equal(eodUrl.searchParams.get('to'), '2026-07-31');
  assert.deepEqual(portfolioWrites.map((row) => row.snapshot_date), [
    '2026-07-29',
    '2026-07-30',
    '2026-07-31',
  ]);
});

test('a transient symbol write removes an existing completion marker and the next scheduled run repairs it', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const OriginalDate = globalThis.Date;
  const originalFetch = globalThis.fetch;
  const fixedNow = '2026-07-09T00:30:00.000Z';
  const markers = new Set(['2026-07-07', '2026-07-08']);
  const events = [];
  let failNextSymbolInsert = true;
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';
  globalThis.Date = class FixedDate extends OriginalDate {
    constructor(...args) {
      super(...(args.length > 0 ? args : [fixedNow]));
    }

    static now() {
      return OriginalDate.parse(fixedNow);
    }
  };

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/rpc/resolve_margin_debt_snapshot_targets')) {
      const targets = JSON.parse(options.body || '{}').p_targets || [];
      return jsonResponse(targets.map((target) => ({ ...target, known: false })));
    }
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'trade-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/api/eod/SPY.US')) {
      return jsonResponse([
        { date: '2026-07-07', close: 618, adjusted_close: 618 },
        { date: '2026-07-08', close: 620, adjusted_close: 620 },
      ]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      return jsonResponse([
        { date: '2026-07-07', close: 119, adjusted_close: 119 },
        { date: '2026-07-08', close: 120, adjusted_close: 120 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && options.method === 'DELETE') {
      events.push('marker-delete');
      markers.delete('2026-07-08');
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && options.method === 'POST') {
      events.push('marker-write');
      const row = JSON.parse(options.body)[0];
      markers.add(row.snapshot_date);
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots')) {
      const latest = [...markers].sort().at(-1);
      return jsonResponse(latest ? [{
        snapshot_date: latest,
        daily_pnl_usd: 2,
        daily_pnl_pct: 0.01,
        holding_count: 1,
      }] : []);
    }
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots') && options.method === 'DELETE') {
      events.push('symbol-delete');
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots') && !options.method) {
      const latest = [...markers].sort().at(-1);
      return jsonResponse(latest ? [{
        snapshot_date: latest,
        symbol: 'NVDA',
        is_open: true,
        current_price_usd: latest === '2026-07-08' ? 120 : 119,
        previous_close_usd: latest === '2026-07-08' ? 119 : 118,
        daily_pnl_usd: 2,
      }] : []);
    }
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots')) {
      if (failNextSymbolInsert) {
        failNextSymbolInsert = false;
        events.push('symbol-write-fail');
        return jsonResponse({ message: 'temporary database detail must stay private' }, 503);
      }
      events.push('symbol-write');
      return jsonResponse(null);
    }
    throw new Error(`unexpected fetch: ${href}`);
  };

  const first = createResponse();
  const second = createResponse();
  try {
    await handler(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-08' },
    }), first);
    assert.equal(first.statusCode, 503);
    assert.equal(first.headers['retry-after'], '300');
    assert.equal(first.body.retryable, true);
    assert.equal(first.body.failedReasons.snapshot_write_http_503, 1);
    assert.deepEqual(events, ['marker-delete', 'symbol-delete', 'symbol-write-fail']);
    assert.deepEqual([...markers].sort(), ['2026-07-07']);
    assert.doesNotMatch(JSON.stringify(first.body), /temporary database detail/);

    await handler(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: {},
    }), second);
  } finally {
    globalThis.Date = OriginalDate;
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(second.statusCode, 200);
  assert.equal(second.body.complete, true);
  assert.equal(second.body.plannedSnapshots, 1);
  assert.equal(second.body.writtenSnapshots, 1);
  assert.deepEqual(events.slice(3), ['marker-delete', 'symbol-delete', 'symbol-write', 'marker-write']);
  assert.deepEqual([...markers].sort(), ['2026-07-07', '2026-07-08']);
});

test('scheduled catch-up rebuilds a missing trading date inside the bounded window', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  const marginTargets = [];
  const portfolioWrites = [];
  let snapshotReadHref = '';
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'trade-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/api/eod/SPY.US')) {
      return jsonResponse([
        { date: '2026-07-10', close: 620, adjusted_close: 620 },
        { date: '2026-07-13', close: 622, adjusted_close: 622 },
        { date: '2026-07-14', close: 624, adjusted_close: 624 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && !options.method) {
      snapshotReadHref = href;
      return jsonResponse([
        { snapshot_date: '2026-07-10', daily_pnl_usd: 2, daily_pnl_pct: 0.01, holding_count: 1 },
        { snapshot_date: '2026-07-14', daily_pnl_usd: 4, daily_pnl_pct: 0.02, holding_count: 1 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots') && !options.method) {
      return jsonResponse([
        { snapshot_date: '2026-07-10', symbol: 'NVDA', is_open: true, current_price_usd: 120, previous_close_usd: 118, daily_pnl_usd: 4 },
        { snapshot_date: '2026-07-14', symbol: 'NVDA', is_open: true, current_price_usd: 123, previous_close_usd: 121, daily_pnl_usd: 4 },
      ]);
    }
    if (href.includes('/rest/v1/rpc/resolve_margin_debt_snapshot_targets')) {
      const targets = JSON.parse(options.body || '{}').p_targets || [];
      marginTargets.push(...targets);
      return jsonResponse(targets.map((target) => ({ ...target, known: false })));
    }
    if (href.includes('/api/eod/NVDA.US')) {
      return jsonResponse([
        { date: '2026-07-10', close: 120, adjusted_close: 120 },
        { date: '2026-07-13', close: 121, adjusted_close: 121 },
        { date: '2026-07-14', close: 123, adjusted_close: 123 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && options.method === 'POST') {
      portfolioWrites.push(JSON.parse(options.body)[0]);
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots')) return jsonResponse(null);
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots')) return jsonResponse(null);
    throw new Error(`unexpected fetch: ${href}`);
  };

  const res = createResponse();
  try {
    await handlePnlReportDailySnapshot(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: {},
    }), res, { now: new Date('2026-07-14T22:00:00Z') });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.match(snapshotReadHref, /snapshot_date=gte\.2026-06-15/);
  assert.match(snapshotReadHref, /snapshot_date=lte\.2026-07-14/);
  assert.equal(res.body.complete, true);
  assert.equal(res.body.plannedSnapshots, 1);
  assert.deepEqual(marginTargets, [{ user_id: 'user-a', snapshot_date: '2026-07-13' }]);
  assert.deepEqual(portfolioWrites.map((row) => row.snapshot_date), ['2026-07-13']);
});

test('scheduled catch-up rebuilds an open-position marker whose daily P&L is null', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  const events = [];
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'trade-a', user_id: 'user-a', symbol: 'MSFT', name: 'Microsoft', side: 'buy', trade_date: '2026-07-01', price: 200, shares: 1, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/api/eod/SPY.US')) {
      return jsonResponse([
        { date: '2026-07-13', close: 622, adjusted_close: 622 },
        { date: '2026-07-14', close: 624, adjusted_close: 624 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && !options.method) {
      return jsonResponse([
        { snapshot_date: '2026-07-13', daily_pnl_usd: 1, daily_pnl_pct: 0.005, holding_count: 1 },
        { snapshot_date: '2026-07-14', daily_pnl_usd: null, daily_pnl_pct: null, holding_count: 1 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots') && !options.method) {
      return jsonResponse([
        { snapshot_date: '2026-07-13', symbol: 'MSFT', is_open: true, current_price_usd: 220, previous_close_usd: 218, daily_pnl_usd: 2 },
        { snapshot_date: '2026-07-14', symbol: 'MSFT', is_open: true, current_price_usd: 223, previous_close_usd: 220, daily_pnl_usd: 3 },
      ]);
    }
    if (href.includes('/rest/v1/rpc/resolve_margin_debt_snapshot_targets')) {
      const targets = JSON.parse(options.body || '{}').p_targets || [];
      return jsonResponse(targets.map((target) => ({ ...target, known: false })));
    }
    if (href.includes('/api/eod/MSFT.US')) {
      return jsonResponse([
        { date: '2026-07-13', close: 220, adjusted_close: 220 },
        { date: '2026-07-14', close: 223, adjusted_close: 223 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && options.method === 'DELETE') {
      events.push('marker-delete');
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots') && options.method === 'DELETE') {
      events.push('symbol-delete');
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots') && options.method === 'POST') {
      events.push('symbol-write');
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && options.method === 'POST') {
      const row = JSON.parse(options.body)[0];
      assert.notEqual(row.daily_pnl_usd, null);
      assert.notEqual(row.daily_pnl_pct, null);
      events.push('marker-write');
      return jsonResponse(null);
    }
    throw new Error(`unexpected fetch: ${href}`);
  };

  const res = createResponse();
  try {
    await handlePnlReportDailySnapshot(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: {},
    }), res, { now: new Date('2026-07-14T22:00:00Z') });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.plannedSnapshots, 1);
  assert.deepEqual(events, ['marker-delete', 'symbol-delete', 'symbol-write', 'marker-write']);
});

test('scheduled catch-up rebuilds a marker whose open-symbol proof is incomplete', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  const portfolioWrites = [];
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'trade-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
        { id: 'trade-b', user_id: 'user-a', symbol: 'MSFT', name: 'Microsoft', side: 'buy', trade_date: '2026-07-01', price: 200, shares: 1, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/api/eod/SPY.US')) {
      return jsonResponse([
        { date: '2026-07-13', close: 622, adjusted_close: 622 },
        { date: '2026-07-14', close: 624, adjusted_close: 624 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && !options.method) {
      return jsonResponse([
        { snapshot_date: '2026-07-13', daily_pnl_usd: 3, daily_pnl_pct: 0.005, holding_count: 2 },
        { snapshot_date: '2026-07-14', daily_pnl_usd: 7, daily_pnl_pct: 0.01, holding_count: 2 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots') && !options.method) {
      return jsonResponse([
        { snapshot_date: '2026-07-13', symbol: 'NVDA', is_open: true, current_price_usd: 120, previous_close_usd: 119, daily_pnl_usd: 2 },
        { snapshot_date: '2026-07-13', symbol: 'MSFT', is_open: true, current_price_usd: 220, previous_close_usd: 219, daily_pnl_usd: 1 },
        { snapshot_date: '2026-07-14', symbol: 'NVDA', is_open: true, current_price_usd: 123, previous_close_usd: 120, daily_pnl_usd: 6 },
        // MSFT is absent on 7/14 even though the authoritative ledger and
        // portfolio marker both say two positions are open.
      ]);
    }
    if (href.includes('/rest/v1/rpc/resolve_margin_debt_snapshot_targets')) {
      const targets = JSON.parse(options.body || '{}').p_targets || [];
      return jsonResponse(targets.map((target) => ({ ...target, known: false })));
    }
    if (href.includes('/api/eod/NVDA.US')) {
      return jsonResponse([
        { date: '2026-07-13', close: 120, adjusted_close: 120 },
        { date: '2026-07-14', close: 123, adjusted_close: 123 },
      ]);
    }
    if (href.includes('/api/eod/MSFT.US')) {
      return jsonResponse([
        { date: '2026-07-13', close: 220, adjusted_close: 220 },
        { date: '2026-07-14', close: 223, adjusted_close: 223 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && options.method === 'POST') {
      portfolioWrites.push(JSON.parse(options.body)[0]);
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots')) return jsonResponse(null);
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots')) return jsonResponse(null);
    throw new Error(`unexpected fetch: ${href}`);
  };

  const res = createResponse();
  try {
    await handlePnlReportDailySnapshot(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: {},
    }), res, { now: new Date('2026-07-14T22:00:00Z') });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.complete, true);
  assert.equal(res.body.plannedSnapshots, 1);
  assert.deepEqual(portfolioWrites.map((row) => [row.snapshot_date, row.holding_count]), [
    ['2026-07-14', 2],
  ]);
});

test('scheduled catch-up repairs oversized counts, extra open symbols, and stale open rows after sell-out', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  const portfolioWrites = [];
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';

  const markerByUser = {
    'user-count': { snapshot_date: '2026-07-14', daily_pnl_usd: 4, daily_pnl_pct: 0.02, holding_count: 2 },
    'user-extra': { snapshot_date: '2026-07-14', daily_pnl_usd: 4, daily_pnl_pct: 0.02, holding_count: 1 },
    'user-empty': { snapshot_date: '2026-07-14', daily_pnl_usd: null, daily_pnl_pct: null, holding_count: 1 },
  };
  const openRowsByUser = {
    'user-count': [
      { snapshot_date: '2026-07-14', symbol: 'NVDA', is_open: true, current_price_usd: 123, previous_close_usd: 120, daily_pnl_usd: 3 },
    ],
    'user-extra': [
      { snapshot_date: '2026-07-14', symbol: 'NVDA', is_open: true, current_price_usd: 123, previous_close_usd: 120, daily_pnl_usd: 3 },
      { snapshot_date: '2026-07-14', symbol: 'MSFT', is_open: true, current_price_usd: 223, previous_close_usd: 220, daily_pnl_usd: 3 },
    ],
    'user-empty': [
      { snapshot_date: '2026-07-14', symbol: 'AAPL', is_open: true, current_price_usd: 213, previous_close_usd: 210, daily_pnl_usd: 3 },
    ],
  };
  const requestedUser = (href) => Object.keys(markerByUser)
    .find((userId) => href.includes(`user_id=eq.${userId}`));

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'count-buy', user_id: 'user-count', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 1, fee: 0, currency: 'USD' },
        { id: 'extra-buy', user_id: 'user-extra', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 1, fee: 0, currency: 'USD' },
        { id: 'empty-buy', user_id: 'user-empty', symbol: 'AAPL', name: 'Apple', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 1, fee: 0, currency: 'USD' },
        { id: 'empty-sell', user_id: 'user-empty', symbol: 'AAPL', name: 'Apple', side: 'sell', trade_date: '2026-07-10', price: 110, shares: 1, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/api/eod/SPY.US')) {
      return jsonResponse([{ date: '2026-07-14', close: 624, adjusted_close: 624 }]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && !options.method) {
      const userId = requestedUser(href);
      return jsonResponse(userId ? [markerByUser[userId]] : []);
    }
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots') && !options.method) {
      const userId = requestedUser(href);
      return jsonResponse(userId ? openRowsByUser[userId] : []);
    }
    if (href.includes('/rest/v1/rpc/resolve_margin_debt_snapshot_targets')) {
      const targets = JSON.parse(options.body || '{}').p_targets || [];
      return jsonResponse(targets.map((target) => ({ ...target, known: false })));
    }
    if (href.includes('/api/eod/NVDA.US')) {
      return jsonResponse([
        { date: '2026-07-13', close: 120, adjusted_close: 120 },
        { date: '2026-07-14', close: 123, adjusted_close: 123 },
      ]);
    }
    if (href.includes('/api/eod/AAPL.US')) {
      return jsonResponse([
        { date: '2026-07-13', close: 210, adjusted_close: 210 },
        { date: '2026-07-14', close: 213, adjusted_close: 213 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && options.method === 'POST') {
      portfolioWrites.push(JSON.parse(options.body)[0]);
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots')) return jsonResponse(null);
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots')) return jsonResponse(null);
    throw new Error(`unexpected fetch: ${href}`);
  };

  const res = createResponse();
  try {
    await handlePnlReportDailySnapshot(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: {},
    }), res, { now: new Date('2026-07-14T22:00:00Z') });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.complete, true);
  assert.equal(res.body.plannedSnapshots, 3);
  assert.equal(res.body.writtenSnapshots, 3);
  assert.deepEqual(
    portfolioWrites
      .map((row) => [row.user_id, row.snapshot_date, row.holding_count])
      .sort((a, b) => a[0].localeCompare(b[0])),
    [
      ['user-count', '2026-07-14', 1],
      ['user-empty', '2026-07-14', 0],
      ['user-extra', '2026-07-14', 1],
    ]
  );
});

test('scheduled catch-up accepts null daily P&L for a legitimately empty portfolio', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  let stockCloseCalls = 0;
  let mutations = 0;
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'buy-a', user_id: 'user-a', symbol: 'AAPL', name: 'Apple', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 1, fee: 0, currency: 'USD' },
        { id: 'sell-a', user_id: 'user-a', symbol: 'AAPL', name: 'Apple', side: 'sell', trade_date: '2026-07-10', price: 110, shares: 1, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/api/eod/SPY.US')) {
      return jsonResponse([
        { date: '2026-07-13', close: 622, adjusted_close: 622 },
        { date: '2026-07-14', close: 624, adjusted_close: 624 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots') && !options.method) {
      return jsonResponse([
        { snapshot_date: '2026-07-13', daily_pnl_usd: null, daily_pnl_pct: null, holding_count: 0 },
        { snapshot_date: '2026-07-14', daily_pnl_usd: null, daily_pnl_pct: null, holding_count: 0 },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_symbol_snapshots') && !options.method) {
      return jsonResponse([]);
    }
    if (href.includes('/api/eod/AAPL.US')) {
      stockCloseCalls += 1;
      return jsonResponse([]);
    }
    if (
      (href.includes('/rest/v1/pnl_report_snapshots') || href.includes('/rest/v1/pnl_report_symbol_snapshots'))
      && (options.method === 'DELETE' || options.method === 'POST')
    ) {
      mutations += 1;
      return jsonResponse(null);
    }
    throw new Error(`unexpected fetch: ${href}`);
  };

  const res = createResponse();
  try {
    await handlePnlReportDailySnapshot(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: {},
    }), res, { now: new Date('2026-07-14T22:00:00Z') });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.complete, true);
  assert.equal(res.body.plannedSnapshots, 0);
  assert.equal(stockCloseCalls, 0);
  assert.equal(mutations, 0);
});

test('a transient Supabase read returns a sanitized 503 while a permanent write 4xx remains 500', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';

  const readFailure = createResponse();
  globalThis.fetch = withExactSpyClose(async (url) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse({ message: 'private database topology' }, 503);
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
  try {
    await handler(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-08' },
    }), readFailure);

    assert.equal(readFailure.statusCode, 503);
    assert.equal(readFailure.headers['retry-after'], '300');
    assert.match(readFailure.body.error, /暂时失败/);
    assert.doesNotMatch(JSON.stringify(readFailure.body), /private database topology/);

    globalThis.fetch = withExactSpyClose(async (url, options = {}) => {
      const href = String(url);
      if (href.includes('/rest/v1/stock_trades')) {
        return jsonResponse([
          { id: 'trade-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
        ]);
      }
      if (href.includes('/api/eod/NVDA.US')) {
        return jsonResponse([
          { date: '2026-07-07', close: 119, adjusted_close: 119 },
          { date: '2026-07-08', close: 120, adjusted_close: 120 },
        ]);
      }
      if (href.includes('/rest/v1/pnl_report_snapshots')) return jsonResponse(null);
      if (href.includes('/rest/v1/pnl_report_symbol_snapshots') && options.method === 'DELETE') {
        return jsonResponse({ message: 'bad request' }, 400);
      }
      throw new Error(`unexpected fetch: ${href}`);
    });
    const permanentFailure = createResponse();
    await handler(createRequest({
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-08' },
    }), permanentFailure);
    assert.equal(permanentFailure.statusCode, 500);
    assert.equal(permanentFailure.headers['retry-after'], undefined);
    assert.equal(permanentFailure.body.complete, false);
    assert.equal(permanentFailure.body.retryable, false);
    assert.equal(permanentFailure.body.failedReasons.snapshot_write_http_400, 1);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test('vercel schedules the final recovery after the UTC quota reset', () => {
  const vercelConfig = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(vercelConfig.crons, [
    { path: '/api/close-snapshot-schedule', schedule: '0 21 * * 1-5' },
    { path: '/api/close-snapshot-schedule-retry', schedule: '0 22 * * 1-5' },
    { path: '/api/close-snapshot-schedule-late-retry', schedule: '10 0 * * 2-6' },
  ]);
  assert.ok(vercelConfig.rewrites.some((rewrite) => (
    rewrite.source === '/api/close-snapshot-schedule'
    && rewrite.destination === '/api/pnl-report-daily-snapshot?operation=close-snapshot-schedule'
  )));
  assert.ok(vercelConfig.rewrites.some((rewrite) => (
    rewrite.source === '/api/close-snapshot-schedule-late-retry'
    && rewrite.destination === '/api/pnl-report-daily-snapshot?operation=close-snapshot-schedule&recoverLatestCompleted=1'
  )));
  assert.ok(vercelConfig.rewrites.some((rewrite) => (
    rewrite.source === '/api/pnl-report-daily-snapshot-retry'
    && rewrite.destination === '/api/pnl-report-daily-snapshot'
  )));
  assert.ok(vercelConfig.rewrites.some((rewrite) => (
    rewrite.source === '/api/pnl-report-daily-snapshot-late-retry'
    && rewrite.destination === '/api/pnl-report-daily-snapshot'
  )));
});
