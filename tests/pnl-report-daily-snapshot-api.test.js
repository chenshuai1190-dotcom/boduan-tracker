import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import handler, {
  handlePnlReportDailySnapshot,
  handlePnlReportSelfRecalculation,
} from '../api/pnl-report-daily-snapshot.js';
import { toPortfolioSnapshotRow } from '../server/pnlReportDailySnapshot.js';

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

const DEFAULT_LEDGER_REVISIONS = [
  { user_id: 'user-a', revision: 7 },
  { user_id: 'user-b', revision: 11 },
  { user_id: 'sold-out-user', revision: 13 },
];

test('portfolio rows derive total assets at the database numeric scale', () => {
  const row = toPortfolioSnapshotRow({
    snapshotDate: '2026-07-08',
    cashUsd: 0.0000006,
    marketValueUsd: 1.2345674,
    totalAssetsUsd: 1.234568,
  }, 'user-a');

  assert.equal(row.cash_usd, 0.000001);
  assert.equal(row.market_value_usd, 1.234567);
  assert.equal(row.total_assets_usd.toFixed(6), (row.market_value_usd + row.cash_usd).toFixed(6));
});

function withSnapshotDatabase(fetchImpl, {
  cleanupResponse = { outcome: 'cleaned', deletedJobs: 0 },
  cleanupStatus = 200,
  dirtyRows = [],
  ledgerRevisions = DEFAULT_LEDGER_REVISIONS,
  availableCashRows = [],
  resolveCash = () => null,
  resolveCashRows = null,
  dailyWriteOutcome = 'written',
  onCleanup = () => {},
  onDatabaseRead = () => {},
  onDailyWrite = () => {},
} = {}) {
  return async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/rpc/cleanup_pnl_report_rebuild_jobs')) {
      onCleanup(JSON.parse(options.body || '{}'));
      return jsonResponse(cleanupResponse, cleanupStatus);
    }
    if (href.includes('/rest/v1/pnl_report_rebuild_state')) {
      onDatabaseRead('dirty_ids', href);
      return jsonResponse(typeof dirtyRows === 'function' ? dirtyRows(href) : dirtyRows);
    }
    if (href.includes('/rest/v1/stock_trade_ledger_revisions')) {
      onDatabaseRead('ledger_revisions', href);
      return jsonResponse(ledgerRevisions);
    }
    if (href.includes('/rest/v1/available_cash_status')) {
      onDatabaseRead('available_cash_status', href);
      return jsonResponse(availableCashRows);
    }
    if (href.includes('/rest/v1/stock_trades')) {
      onDatabaseRead('stock_trades', href);
    }
    if (href.includes('/rest/v1/rpc/write_pnl_report_snapshot_if_current')) {
      const payload = JSON.parse(options.body || '{}');
      onDailyWrite(payload, href, options);
      const outcome = typeof dailyWriteOutcome === 'function'
        ? dailyWriteOutcome(payload)
        : dailyWriteOutcome;
      if (outcome && typeof outcome === 'object' && 'status' in outcome) {
        return jsonResponse(outcome.body, outcome.status);
      }
      return jsonResponse(typeof outcome === 'string' ? { outcome } : outcome);
    }
    if (href.includes('/rest/v1/rpc/resolve_available_cash_snapshot_targets')) {
      const targets = JSON.parse(options.body || '{}').p_targets || [];
      if (typeof resolveCashRows === 'function') {
        return jsonResponse(resolveCashRows(targets));
      }
      return jsonResponse(targets.map((target) => {
        const resolved = resolveCash(target);
        return resolved ? {
          ...target,
          known: true,
          cash_usd: resolved.cashUsd,
          cash_event_id: resolved.cashEventId,
          cash_effective_at: resolved.cashEffectiveAt,
          cash_basis: 'event',
        } : {
          ...target,
          known: false,
          cash_usd: 0,
          cash_event_id: null,
          cash_effective_at: null,
          cash_basis: null,
        };
      }));
    }
    return fetchImpl(url, options);
  };
}

function withExactSpyClose(fetchImpl, onSpy = () => {}, databaseOptions = {}) {
  return withSnapshotDatabase(async (url, options = {}) => {
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
  }, databaseOptions);
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test('self P&L recalculation endpoint is POST-only and OPTIONS is side-effect free', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('method gate must run before authentication');
  };
  try {
    for (const method of ['GET', 'PUT']) {
      const res = createResponse();
      await handlePnlReportSelfRecalculation(createRequest({ method }), res);
      assert.equal(res.statusCode, 405);
      assert.equal(res.headers.allow, 'POST, OPTIONS');
      assert.match(res.headers['cache-control'], /private, no-store/);
    }
    const options = createResponse();
    await handlePnlReportSelfRecalculation(createRequest({ method: 'OPTIONS' }), options);
    assert.equal(options.statusCode, 204);
    assert.equal(options.ended, true);
    assert.equal(options.headers['access-control-allow-methods'], 'POST, OPTIONS');
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(fetchCalls, 0);
});

test('self P&L recalculation always authenticates even when quote auth bypass is disabled', async () => {
  const env = {
    QUOTE_API_AUTH_REQUIRED: process.env.QUOTE_API_AUTH_REQUIRED,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
  };
  const originalFetch = globalThis.fetch;
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = 'anon-secret';
  delete process.env.VITE_SUPABASE_ANON_KEY;
  let authCalls = 0;
  let recalculateCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    authCalls += 1;
    assert.match(String(url), /\/auth\/v1\/user$/);
    assert.equal(options.headers.Authorization, 'Bearer expired-token');
    return jsonResponse({ message: 'expired' }, 401);
  };
  try {
    const missing = createResponse();
    await handlePnlReportSelfRecalculation(createRequest({
      method: 'POST',
      headers: {},
    }), missing, {
      recalculate: async () => { recalculateCalls += 1; },
    });
    assert.equal(missing.statusCode, 401);

    const expired = createResponse();
    await handlePnlReportSelfRecalculation(createRequest({
      method: 'POST',
      headers: { authorization: 'Bearer expired-token' },
    }), expired, {
      recalculate: async () => { recalculateCalls += 1; },
    });
    assert.equal(expired.statusCode, 401);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
  assert.equal(authCalls, 1);
  assert.equal(recalculateCalls, 0);
});

test('self P&L recalculation uses the token user, returns sanitized waiting state, and is never cached', async () => {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
  };
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = 'anon-secret';
  delete process.env.VITE_SUPABASE_ANON_KEY;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/auth\/v1\/user$/);
    return jsonResponse({ id: 'token-user' });
  };
  let received = null;
  const res = createResponse();
  try {
    await handlePnlReportSelfRecalculation(createRequest({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { userId: 'forged-user', user_id: 'forged-user' },
    }), res, {
      now: new Date('2026-07-31T22:00:00Z'),
      recalculate: async (input) => {
        received = input;
        return {
          state: 'waiting_for_close',
          fromDate: '2026-07-31',
          throughDate: null,
          ledgerRevision: 9,
          generation: 3,
          replacedPortfolio: 0,
          replacedSymbols: 0,
          providerSecret: 'must-not-leak',
        };
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.match(res.headers['cache-control'], /private, no-store/);
  assert.equal(received.userId, 'token-user');
  assert.equal(received.now.toISOString(), '2026-07-31T22:00:00.000Z');
  assert.deepEqual(res.body, {
    success: true,
    state: 'waiting_for_close',
    fromDate: '2026-07-31',
    throughDate: null,
    ledgerRevision: 9,
    generation: 3,
    replacedPortfolio: 0,
    replacedSymbols: 0,
  });
  assert.doesNotMatch(JSON.stringify(res.body), /forged-user|must-not-leak|valid-token/);
});

test('self P&L recalculation sanitizes retryable provider failures and keeps the old snapshot', async () => {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
  };
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = 'anon-secret';
  delete process.env.VITE_SUPABASE_ANON_KEY;
  globalThis.fetch = async () => jsonResponse({ id: 'token-user' });
  const providerError = new Error('EODHD body and service-role-secret must stay private');
  providerError.status = 402;
  providerError.retryable = true;
  const res = createResponse();
  try {
    await handlePnlReportSelfRecalculation(createRequest({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
    }), res, {
      recalculate: async () => { throw providerError; },
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['retry-after'], '3600');
  assert.match(res.headers['cache-control'], /private, no-store/);
  assert.deepEqual(res.body, {
    success: false,
    state: 'recalculation_pending',
    code: 'PNL_RECALCULATION_PENDING',
    error: '交易已保存，个人收益快照将保留旧数据并稍后重算',
  });
  assert.doesNotMatch(JSON.stringify(res.body), /EODHD body|service-role-secret|valid-token/);
});

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
      return jsonResponse([]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }, () => {
    spyCalls += 1;
    requestOrder.push('SPY');
  }, {
    onDatabaseRead(kind) {
      requestOrder.push(kind);
    },
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
  assert.equal(spyCalls, 2);
  assert.deepEqual(requestOrder, [
    'SPY', 'dirty_ids', 'ledger_revisions', 'available_cash_status', 'stock_trades', 'dirty_ids',
    'SPY', 'dirty_ids', 'ledger_revisions', 'available_cash_status', 'stock_trades', 'dirty_ids',
  ]);
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
  assert.equal(spyCalls, 1);
});

test('explicit Saturday date returns retryable 503 before reading a sold-out user ledger', async () => {
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
  globalThis.fetch = withSnapshotDatabase(async (url) => {
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
  });

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

  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['retry-after'], '300');
  assert.equal(res.body.complete, false);
  assert.equal(res.body.retryable, true);
  assert.equal(res.body.writtenSnapshots, 0);
  assert.deepEqual(res.body.failedSymbols, [{
    symbol: 'SPY',
    retryable: true,
    status: null,
    reason: 'missing_target_close',
    attempts: 3,
  }]);
  assert.equal(spyAttempts, 3);
  assert.equal(supabaseCalls, 0);
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
  const atomicWrites = [];
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
    throw new Error(`unexpected fetch: ${href}`);
  }, undefined, {
    onDailyWrite(payload, href, options) {
      assert.equal(options.method, 'POST');
      assert.match(href, /rpc\/write_pnl_report_snapshot_if_current/);
      atomicWrites.push(payload);
    },
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
  assert.equal(atomicWrites.length, 2);
  const portfolioRows = atomicWrites
    .map((write) => write.p_portfolio_row)
    .sort((a, b) => a.user_id.localeCompare(b.user_id));
  assert.equal(portfolioRows[0].user_id, 'user-a');
  assert.equal(portfolioRows[0].snapshot_date, '2026-07-08');
  assert.equal(portfolioRows[0].market_value_usd, 1690);
  assert.equal(portfolioRows[0].cumulative_pnl_usd, 290);
  assert.equal(portfolioRows[0].daily_pnl_usd, 70);
  assert.equal(portfolioRows[1].user_id, 'user-b');
  assert.equal(portfolioRows[1].daily_pnl_usd, 25);
  const symbolRows = atomicWrites.flatMap((write) => write.p_symbol_rows);
  assert.ok(symbolRows.some((row) => row.user_id === 'user-a' && row.symbol === 'MSFT' && row.daily_pnl_usd === 20));
  assert.deepEqual(
    atomicWrites.map((write) => ({
      userId: write.p_user_id,
      revision: write.p_expected_ledger_revision,
      date: write.p_snapshot_date,
      operationKey: write.p_operation_key,
    })).sort((a, b) => a.userId.localeCompare(b.userId)),
    [
      {
        userId: 'user-a',
        revision: 7,
        date: '2026-07-08',
        operationKey: 'pnl-daily-snapshot:user-a:7:2026-07-08',
      },
      {
        userId: 'user-b',
        revision: 11,
        date: '2026-07-08',
        operationKey: 'pnl-daily-snapshot:user-b:11:2026-07-08',
      },
    ]
  );
  assert.doesNotMatch(JSON.stringify(res.body), /service-role-secret|eodhd-secret|cron-secret/);
  assert.ok(calls.some((call) => call.href.includes('api_token=eodhd-secret')), 'EODHD key should only be used in outbound provider request');
});

test('daily P&L snapshot includes a cash-only user without requesting stock EODHD', async () => {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  const atomicWrites = [];
  let spyCalls = 0;
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';

  globalThis.fetch = withExactSpyClose(async (url) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${href}`);
  }, () => {
    spyCalls += 1;
  }, {
    ledgerRevisions: [],
    availableCashRows: [{ user_id: 'cash-only-user' }],
    resolveCash: () => ({
      cashUsd: 2500,
      cashEventId: '91',
      cashEffectiveAt: '2026-07-07T18:00:00.000Z',
    }),
    onDailyWrite: (payload) => atomicWrites.push(payload),
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
  assert.equal(res.body.symbolsCount, 0);
  assert.equal(spyCalls, 1);
  assert.equal(atomicWrites.length, 1);
  assert.equal(atomicWrites[0].p_expected_ledger_revision, 0);
  assert.equal(atomicWrites[0].p_symbol_rows.length, 0);
  assert.deepEqual({
    cashUsd: atomicWrites[0].p_portfolio_row.cash_usd,
    totalAssetsUsd: atomicWrites[0].p_portfolio_row.total_assets_usd,
  }, {
    cashUsd: 2500,
    totalAssetsUsd: 2500,
  });
  assert.equal(Object.hasOwn(atomicWrites[0].p_portfolio_row, 'cash_event_id'), false);
  assert.equal(Object.hasOwn(atomicWrites[0].p_portfolio_row, 'cash_effective_at'), false);
  assert.equal(Object.hasOwn(atomicWrites[0].p_portfolio_row, 'cash_basis'), false);
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
    throw new Error(`unexpected fetch: ${href}`);
  }, undefined, {
    onDailyWrite() {
      portfolioWrites += 1;
    },
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
  assert.equal(aaplAttempts, 1, 'sold-out symbols should retain a real close when the provider has one');
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
    throw new Error(`unexpected fetch: ${href}`);
  }, undefined, {
    onDailyWrite(payload) {
      writtenUsers.push(payload.p_user_id);
    },
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

test('daily P&L snapshot does not retry a non-retryable provider 4xx', async () => {
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
      return jsonResponse({ error: 'not found' }, 404);
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
  assert.equal(res.body.failedSymbols[0].status, 404);
  assert.equal(res.body.failedSymbols[0].attempts, 1);
});

test('scheduled no-date P&L snapshot catches an existing user up from 7/10 through the SPY 7/13 and 7/14 closes', async () => {
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
  const databaseOrder = [];
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

  globalThis.fetch = withSnapshotDatabase(async (url, options = {}) => {
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
      if (href.includes('user_id=eq.user-a')) return jsonResponse([{ snapshot_date: '2026-07-10' }]);
      if (href.includes('user_id=eq.user-b')) return jsonResponse([]);
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
    throw new Error(`unexpected fetch: ${href}`);
  }, {
    onCleanup() {
      databaseOrder.push('cleanup');
    },
    onDatabaseRead(kind) {
      databaseOrder.push(kind);
    },
    onDailyWrite(payload) {
      mutationOrder.push('atomic-write');
      portfolioWrites.push(payload.p_portfolio_row);
    },
  });

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
  assert.deepEqual(databaseOrder.slice(0, 6), [
    'cleanup',
    'dirty_ids',
    'dirty_ids',
    'ledger_revisions',
    'available_cash_status',
    'stock_trades',
  ]);
  assert.equal(mutationOrder[0], 'margin-rpc');
  assert.equal(mutationOrder.filter((event) => event === 'margin-rpc').length, 1);
  assert.deepEqual(mutationOrder.slice(1), ['atomic-write', 'atomic-write', 'atomic-write']);
  assert.doesNotMatch(JSON.stringify(res.body), /user-a|user-b/);
});

test('scheduled cleanup failure does not block the financial snapshot calculation', async () => {
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
  let atomicWrites = 0;
  let cleanupCalls = 0;

  globalThis.fetch = withSnapshotDatabase(async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'trade-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/rest/v1/pnl_report_snapshots')) return jsonResponse([]);
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
      return jsonResponse([{ date: '2026-07-14', close: 624, adjusted_close: 624 }]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      return jsonResponse([
        { date: '2026-07-13', close: 121, adjusted_close: 121 },
        { date: '2026-07-14', close: 123, adjusted_close: 123 },
      ]);
    }
    throw new Error(`unexpected fetch: ${href}`);
  }, {
    cleanupResponse: { message: 'cleanup storage detail must stay private' },
    cleanupStatus: 503,
    onCleanup() { cleanupCalls += 1; },
    onDailyWrite() { atomicWrites += 1; },
  });

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
  assert.equal(res.body.writtenSnapshots, 1);
  assert.equal(atomicWrites, 1);
  assert.equal(cleanupCalls, 1);
  assert.deepEqual(res.body.dirtyRecalculation.cleanup, {
    success: false,
    deletedJobs: 0,
    retryable: true,
    reason: 'expired_job_cleanup_failed',
  });
  assert.doesNotMatch(JSON.stringify(res.body), /cleanup storage detail|service-role-secret/);
});

test('the final dirty-state scan turns a concurrent ledger mutation into retryable 503 without another EODHD read', async () => {
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
  let dirtyReads = 0;
  let spyReads = 0;
  let nvdaReads = 0;
  let atomicWrites = 0;
  globalThis.fetch = withExactSpyClose(async (url) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'trade-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      nvdaReads += 1;
      return jsonResponse([
        { date: '2026-07-07', close: 119, adjusted_close: 119 },
        { date: '2026-07-08', close: 120, adjusted_close: 120 },
      ]);
    }
    throw new Error(`unexpected fetch: ${href}`);
  }, () => { spyReads += 1; }, {
    dirtyRows() {
      dirtyReads += 1;
      return dirtyReads === 1 ? [] : [{ user_id: 'user-a' }];
    },
    onDailyWrite() { atomicWrites += 1; },
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
  assert.equal(res.headers['retry-after'], '300');
  assert.equal(res.body.complete, false);
  assert.equal(res.body.retryable, true);
  assert.equal(res.body.excludedDirtyUsers, 1);
  assert.equal(res.body.writtenSnapshots, 1);
  assert.equal(dirtyReads, 2);
  assert.equal(atomicWrites, 1);
  assert.equal(spyReads, 1);
  assert.equal(nvdaReads, 1);
  assert.doesNotMatch(JSON.stringify(res.body), /user-a/);
});

test('dirty-range finalize uses the dedicated 45-second timeout as a third server-only option', () => {
  const source = readFileSync(
    new URL('../server/pnlReportRecalculation.js', import.meta.url),
    'utf8'
  );
  assert.match(source, /const FINALIZE_TIMEOUT_MS = 45_000;/);
  assert.match(
    source,
    /['"]\/rest\/v1\/rpc\/replace_pnl_report_dirty_range['"][\s\S]{0,900}\{ timeoutMs: FINALIZE_TIMEOUT_MS \}\s*\)/
  );
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
      globalThis.fetch = withSnapshotDatabase(async (url, options = {}) => {
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
        throw new Error(`unexpected fetch for ${contractCase.name}: ${href}`);
      }, {
        onDailyWrite() {
          pnlMutations += 1;
          events.push('pnl-mutation');
        },
      });

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

test('available-cash snapshot RPC contract failures stop before every P&L mutation', async () => {
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

  const cases = [
    { name: 'incomplete', rows: () => [] },
    {
      name: 'unknown-with-null-amount',
      rows: ([target]) => [{
        ...target,
        known: false,
        cash_usd: null,
        cash_event_id: null,
        cash_effective_at: null,
        cash_basis: null,
      }],
    },
    {
      name: 'unknown-with-value',
      rows: ([target]) => [{
        ...target,
        known: false,
        cash_usd: 1,
        cash_event_id: null,
        cash_effective_at: null,
        cash_basis: null,
      }],
    },
    {
      name: 'known-without-provenance',
      rows: ([target]) => [{
        ...target,
        known: true,
        cash_usd: 100,
        cash_event_id: null,
        cash_effective_at: null,
        cash_basis: 'event',
      }],
    },
  ];

  try {
    for (const contractCase of cases) {
      let stockProviderCalls = 0;
      let pnlMutations = 0;
      globalThis.fetch = withSnapshotDatabase(async (url) => {
        const href = String(url);
        if (href.includes('/api/eod/SPY.US')) {
          return jsonResponse([{ date: '2026-07-08', close: 620, adjusted_close: 620 }]);
        }
        if (href.includes('/rest/v1/stock_trades')) {
          return jsonResponse([
            { id: 'trade-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
          ]);
        }
        if (href.includes('/api/eod/NVDA.US')) {
          stockProviderCalls += 1;
          return jsonResponse([{ date: '2026-07-08', close: 120, adjusted_close: 120 }]);
        }
        throw new Error(`unexpected fetch for ${contractCase.name}: ${href}`);
      }, {
        resolveCashRows: contractCase.rows,
        onDailyWrite() { pnlMutations += 1; },
      });

      const res = createResponse();
      await handler(createRequest({
        headers: { authorization: 'Bearer cron-secret' },
        query: { date: '2026-07-08' },
      }), res);

      assert.equal(res.statusCode, 503, contractCase.name);
      assert.equal(res.headers['retry-after'], '300', contractCase.name);
      assert.doesNotMatch(
        JSON.stringify(res.body),
        /可用现金快照解析结果|available_cash_snapshot_contract_invalid/,
        contractCase.name,
      );
      assert.equal(stockProviderCalls, 0, contractCase.name);
      assert.equal(pnlMutations, 0, contractCase.name);
    }
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test('scheduled catch-up reports a permanent SPY calendar 4xx as non-retryable 500', async () => {
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
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';

  globalThis.fetch = withSnapshotDatabase(async (url) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'trade-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/api/eod/SPY.US')) {
      spyAttempts += 1;
      return jsonResponse({ error: 'not found' }, 404);
    }
    throw new Error(`unexpected fetch: ${href}`);
  });

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

  assert.equal(spyAttempts, 1);
  assert.equal(res.statusCode, 500);
  assert.equal(res.headers['retry-after'], undefined);
  assert.equal(res.body.complete, false);
  assert.equal(res.body.retryable, false);
  assert.deepEqual(res.body.failedSymbols, [{
    symbol: 'SPY',
    retryable: false,
    status: 404,
    reason: 'http_404',
    attempts: 1,
  }]);
  assert.doesNotMatch(JSON.stringify(res.body), /user-a/);
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

  globalThis.fetch = withSnapshotDatabase(async (url, options = {}) => {
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
      return jsonResponse([{ snapshot_date: '2026-07-10' }]);
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
    throw new Error(`unexpected fetch: ${href}`);
  }, {
    onDailyWrite(payload) {
      portfolioWrites.push(payload.p_portfolio_row);
    },
  });

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

test('scheduled catch-up retries a stale SPY 200 payload and never falls back to an older target', async () => {
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
  let spyAttempts = 0;
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

  globalThis.fetch = withSnapshotDatabase(async (url) => {
    const href = String(url);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([
        { id: 'trade-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 2, fee: 0, currency: 'USD' },
      ]);
    }
    if (href.includes('/api/eod/SPY.US')) {
      spyAttempts += 1;
      return jsonResponse([
        { date: '2026-07-10', close: 620, adjusted_close: 620 },
        { date: '2026-07-13', close: 622, adjusted_close: 622 },
      ]);
    }
    throw new Error(`unexpected fetch: ${href}`);
  });

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

  assert.equal(spyAttempts, 3);
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['retry-after'], '300');
  assert.equal(res.body.targetDate, '2026-07-14');
  assert.equal(res.body.complete, false);
  assert.equal(res.body.retryable, true);
  assert.deepEqual(res.body.failedSymbols, [{
    symbol: 'SPY',
    retryable: true,
    status: null,
    reason: 'missing_target_close',
    attempts: 3,
  }]);
});

test('an atomic write failure preserves the last completed snapshot and the next scheduled run repairs it', async () => {
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
  const markers = new Set(['2026-07-07']);
  const events = [];
  let atomicWriteAttempts = 0;
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

  globalThis.fetch = withSnapshotDatabase(async (url, options = {}) => {
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
    if (href.includes('/rest/v1/pnl_report_snapshots')) {
      const latest = [...markers].sort().at(-1);
      return jsonResponse(latest ? [{ snapshot_date: latest }] : []);
    }
    throw new Error(`unexpected fetch: ${href}`);
  }, {
    dailyWriteOutcome(payload) {
      atomicWriteAttempts += 1;
      if (atomicWriteAttempts === 1) {
        events.push('atomic-write-fail');
        return {
          status: 503,
          body: { message: 'temporary database detail must stay private' },
        };
      }
      events.push('atomic-write');
      markers.add(payload.p_snapshot_date);
      return 'written';
    },
  });

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
    assert.equal(first.body.failedReasons.supabase_http_503, 1);
    assert.deepEqual(events, ['atomic-write-fail']);
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
  assert.deepEqual(events, ['atomic-write-fail', 'atomic-write']);
  assert.deepEqual([...markers].sort(), ['2026-07-07', '2026-07-08']);
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

    globalThis.fetch = withExactSpyClose(async (url) => {
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
      throw new Error(`unexpected fetch: ${href}`);
    }, undefined, {
      dailyWriteOutcome: {
        status: 400,
        body: { message: 'bad request must stay private' },
      },
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
    assert.equal(permanentFailure.body.failedReasons.supabase_http_400, 1);
    assert.doesNotMatch(JSON.stringify(permanentFailure.body), /bad request must stay private/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test('vercel schedules all-account P&L through the unified close scheduler', () => {
  const vercelConfig = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(vercelConfig.crons, [
    { path: '/api/close-snapshot-schedule', schedule: '0 21 * * 1-5' },
    { path: '/api/close-snapshot-schedule-retry', schedule: '0 22 * * 1-5' },
    { path: '/api/close-snapshot-schedule-late-retry', schedule: '0 23 * * 1-5' },
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
