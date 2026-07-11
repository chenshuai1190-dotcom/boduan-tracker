import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import handler from '../api/pnl-report-daily-snapshot.js';

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
    symbols: [],
    deletes: [],
  };
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';

  globalThis.fetch = async (url, options = {}) => {
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
  };

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
  assert.equal(res.body.targetDate, '2026-07-08');
  assert.equal(res.body.attemptedUsers, 2);
  assert.equal(res.body.writtenUsers, 2);
  assert.equal(res.body.symbolsCount, 2);
  assert.equal(writes.portfolios.length, 2);
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

test('vercel keeps the all-account daily P&L snapshot cron unchanged', () => {
  const vercelConfig = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(
    vercelConfig.crons.find((cron) => cron.path === '/api/pnl-report-daily-snapshot'),
    { path: '/api/pnl-report-daily-snapshot', schedule: '30 22 * * 1-5' }
  );
});
