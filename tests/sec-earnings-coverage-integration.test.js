import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import handler, { handleEarningsDetailRequest } from '../api/earnings-calendar.js';
import { registerCalendarCoverage, readSharedEarningsDetail } from '../server/earnings/secEarningsCoverageIntegration.js';
import { createSecEarningsCoverageRepository } from '../server/earnings/secEarningsCoverageRepository.js';
import { normalizeEarningsDetailPayload, fetchEarningsDetail } from '../src/lib/earningsDetail.js';
import { EARNINGS_DETAIL_PARSER_VERSION } from '../src/lib/earningsDetailPolicy.js';

const enabled = { SEC_EARNINGS_AUTO_COVERAGE_ENABLED: 'true' };
const userId = '11111111-1111-1111-1111-111111111111';
const event = { symbol: 'AAPL', fiscalDate: '2026-06-30', reportDate: '2026-07-30', earningsPublished: true };
const now = new Date('2026-09-09T10:00:00Z');
const config = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-key' };
const response = () => ({ statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, end() {} });

test('auto-registration is opt-in, verified-user only and does not load a store when disabled', async () => {
  const createRepository = () => { throw new Error('must not create'); };
  assert.deepEqual(await registerCalendarCoverage({ env: {}, userId, events: [event], createRepository }), { status: 'disabled' });
  assert.deepEqual(await registerCalendarCoverage({ env: enabled, events: [event], createRepository }), { status: 'disabled' });
  assert.equal(await readSharedEarningsDetail(event, { env: {}, createRepository }), null);
});

test('calendar registration sends only past published normalized public event keys', async () => {
  let captured;
  const result = await registerCalendarCoverage({ env: enabled, userId, now,
    events: [event, { ...event, reportDate: '2026-10-01' }, { ...event, earningsPublished: false }, { ...event, fiscalDate: 'bad' }],
    createRepository: () => ({ register: async (...args) => { captured = args; return { registered: 1 }; } }),
  });
  assert.equal(result.status, 'queued');
  assert.equal(captured[0], userId);
  assert.equal(captured[1].length, 1);
  assert.equal(captured[1][0].symbol, 'AAPL');
  assert.equal(captured[1][0].earningsPublished, undefined);
});

test('missing foundation or store failures never break calendar or on-demand detail', async () => {
  const createRepository = () => { throw new Error('private backend message'); };
  assert.deepEqual(await registerCalendarCoverage({ env: enabled, userId, now, events: [event], createRepository }), { status: 'unavailable' });
  assert.equal(await readSharedEarningsDetail(event, { env: enabled, createRepository }), null);
  let fetched = 0;
  const res = response();
  await handleEarningsDetailRequest({ query: event }, res, {
    readShared: async () => null, fetchDetail: async () => { fetched++; return { symbol: 'AAPL', status: 'pending' }; },
  });
  assert.equal(fetched, 1);
  assert.equal(res.statusCode, 200);
});

test('API shared hit skips SEC fetch and preserves verification time and remaining freshness', async () => {
  const res = response();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  await handleEarningsDetailRequest({ query: event }, res, {
    readShared: async () => ({ symbol: 'AAPL', status: 'complete', source: { form: '10-Q' }, fetchedAt: '2026-07-30T20:00:00Z', cache: { source: 'shared-sec', expiresAt } }),
    fetchDetail: async () => assert.fail('shared hit must not request SEC'),
  });
  assert.equal(res.body.fetchedAt, '2026-07-30T20:00:00Z');
  const seconds = Number(res.headers['Cache-Control'].split('=')[1]);
  assert.ok(seconds > 0 && seconds <= 60);
});

test('client shared expiry cannot be renewed for another full six hours', async () => {
  const oldStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const payload = { success: true, status: 'complete', symbol: 'AAPL', parserVersion: EARNINGS_DETAIL_PARSER_VERSION, period: { ...event, end: event.fiscalDate, providerFiscalDate: event.fiscalDate }, source: { provider: 'SEC', form: '10-Q' }, sections: {}, cache: { expiresAt: new Date(Date.now() - 1).toISOString() } };
  assert.ok(normalizeEarningsDetailPayload(payload).cacheExpiresAt);
  let reads = 0;
  const args = { ...event, supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-token', user: { id: userId } } } }) } },
    fetchImpl: async () => { reads++; return { ok: true, json: async () => payload }; } };
  try {
    await fetchEarningsDetail(args); await fetchEarningsDetail(args);
    assert.equal(reads, 2);
  } finally { globalThis.localStorage = oldStorage; }
});

test('repository sends service credentials only to its configured REST host and bounds contracts', async () => {
  const calls = [];
  const repository = createSecEarningsCoverageRepository({ env: config, fetchFn: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, text: async () => url.pathname.endsWith('claim_sec_earnings_watch_jobs') ? '[]' : '{"registered":1}' };
  } });
  await repository.register(userId, [event]);
  assert.equal(calls[0].url.origin, 'https://example.supabase.co');
  assert.equal(calls[0].options.redirect, 'error');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.p_parser_version, EARNINGS_DETAIL_PARSER_VERSION);
  assert.deepEqual(Object.keys(body.p_events[0]).sort(), ['official_fiscal_date', 'provider_fiscal_date', 'report_date', 'symbol']);
  await repository.claim(99);
  assert.equal(JSON.parse(calls[1].options.body).p_limit, 12);
  await assert.rejects(() => repository.claim(NaN), { code: 'sec-coverage-invalid-limit' });
  assert.throws(() => createSecEarningsCoverageRepository({ env: { ...config, SUPABASE_URL: 'http://example.supabase.co' } }));
});

test('repository malformed and failed responses use sanitized errors and bounded SELECT columns', async () => {
  let mode = 'results';
  const repository = createSecEarningsCoverageRepository({ env: config, fetchFn: async (url) => {
    if (mode === 'failure') throw new Error('test-only-service-key raw body');
    assert.equal(url.searchParams.get('limit'), '8');
    assert.equal(url.searchParams.get('symbol'), 'eq.AAPL');
    assert.ok(url.searchParams.get('select').split(',').includes('cik'));
    return { ok: true, text: async () => '{}' };
  } });
  await assert.rejects(() => repository.results('AAPL'), { message: 'sec-coverage-store-invalid-response' });
  mode = 'failure';
  await assert.rejects(() => repository.results('AAPL'), { message: 'sec-coverage-store-unavailable' });
});

test('scheduler route cannot inherit disabled quote auth; normal detail still requires a user token', async () => {
  const original = { flag: process.env.QUOTE_API_AUTH_REQUIRED, secret: process.env.CRON_SECRET };
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.CRON_SECRET = 'test-cron-secret';
  try {
    const res = response();
    await handler({ method: 'GET', headers: {}, query: { operation: 'sec-coverage-schedule' } }, res);
    assert.equal(res.statusCode, 401);
    process.env.QUOTE_API_AUTH_REQUIRED = 'true';
    const normal = response();
    await handler({ method: 'GET', headers: {}, query: { ...event, operation: 'detail' } }, normal);
    assert.equal(normal.statusCode, 401);
  } finally {
    for (const [key, value] of [['QUOTE_API_AUTH_REQUIRED', original.flag], ['CRON_SECRET', original.secret]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('daily SEC cron reuses existing function and leaves existing financial schedules intact', () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
  assert.deepEqual(vercel.crons.filter(({ path }) => path === '/api/earnings-coverage-schedule'), [{ path: '/api/earnings-coverage-schedule', schedule: '0 1 * * *' }]);
  assert.ok(vercel.rewrites.some(({ source, destination }) => source === '/api/earnings-coverage-schedule' && destination === '/api/earnings-calendar?operation=sec-coverage-schedule'));
  assert.equal(vercel.functions['api/earnings-calendar.js'].maxDuration, 60);
  assert.equal(vercel.crons.filter(({ path }) => path.startsWith('/api/close-snapshot-schedule')).length, 3);
});
