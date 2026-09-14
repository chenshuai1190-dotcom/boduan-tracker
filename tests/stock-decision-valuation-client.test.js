import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { clearStockDecisionValuationCache, loadStockValuation, normalizeStockValuationData } from '../src/lib/stockDecisionValuation.js';

const timestamp = Date.parse('2026-09-14T20:00:00Z');
const session = userId => async () => ({ data: { session: userId ? { user: { id: userId }, access_token: 'test-valuation-token' } : null } });
const response = data => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const options = (userId, extra = {}) => ({ userId, symbol: 'NVDA', now: () => timestamp, getSession: session(userId), ...extra });

function payload(symbol = 'NVDA', now = timestamp) {
  const urls = {
    NVDA: 'https://nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-second-quarter-fiscal-2027',
    MSFT: 'https://www.microsoft.com/en-us/Investor/earnings/FY-2026-Q4/press-release-webcast',
    META: 'https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Second-Quarter-2026-Results/default.aspx',
  };
  return {
    schemaVersion: 2, modelVersion: 'earnings-valuation-v2', symbol, currency: 'USD', status: 'available', reason: null,
    checkedAt: new Date(now).toISOString(), verifiedAt: new Date(now).toISOString().slice(0, 10),
    expiresAt: new Date(now + 600000).toISOString(), snapshotId: `${symbol.toLowerCase()}-latest-filing-v2`,
    reportedPeriod: 'FY2027 Q2', reportedAt: '2026-08-26', reportPeriodEnd: '2026-07-26',
    forecastPeriod: { zh: 'FY2027 Q3—FY2028 Q2', en: 'FY2027 Q3–FY2028 Q2', start: '2026-07-27', end: '2027-07-26' },
    sources: [{ title: 'Official quarterly results', url: urls[symbol] }],
    scenarios: ['cautious', 'base', 'optimistic'].map((id, index) => {
      const eps = 8.12345678 + index;
      return { id, eps, assumptions: [{ label: { zh: '研究假设', en: 'Research assumption' }, value: 'Revenue growth 5%' }],
        prices: [20, 25, 30].map(pe => ({ pe, price: Math.round(eps * pe * 100) / 100 })) };
    }),
    notes: { zh: '自主测算，非共识预测。', en: 'Research scenarios, not consensus forecasts.' },
  };
}

beforeEach(() => clearStockDecisionValuationCache());

test('the dynamic contract accepts issuer-specific checks and expires at their own returned deadline', () => {
  for (const symbol of ['MSFT', 'NVDA', 'META']) {
    const current = payload(symbol);
    const accepted = normalizeStockValuationData(current, { symbol, now: timestamp });
    assert.ok(accepted, symbol);
    assert.equal(accepted.status, 'available');
    assert.equal(accepted.scenarios.length, 3);
    assert.equal(accepted.snapshotId, current.snapshotId);
    const expiredTime = Date.parse(current.expiresAt);
    const expired = normalizeStockValuationData(current, { symbol, now: expiredTime });
    assert.equal(expired.status, 'pending');
    assert.equal(expired.reason, 'CHECK_EXPIRED');
    assert.deepEqual(expired.scenarios, []);
  }
});

test('available data preserves checked fiscal periods, full EPS precision and detached nested values', () => {
  const source = payload();
  const result = normalizeStockValuationData(source, { symbol: ' nvda.us ', now: timestamp });
  assert.deepEqual(result, source);
  assert.equal(result.forecastPeriod.end, '2027-07-26');
  assert.equal(result.scenarios[0].eps, 8.12345678);
  source.scenarios[0].prices[0].price = 0;
  source.scenarios[0].assumptions[0].label.zh = 'mutated';
  assert.equal(result.scenarios[0].prices[0].price, 162.47);
  assert.equal(result.scenarios[0].assumptions[0].label.zh, '研究假设');
  for (const reason of ['guidance_constrained', 'history_based', 'conditional_growth']) {
    const data = payload();
    data.reason = reason;
    data.forecastPeriod.end = null;
    const accepted = normalizeStockValuationData(data, { symbol: 'NVDA', now: timestamp });
    assert.equal(accepted.reason, reason);
    assert.equal(accepted.forecastPeriod.end, null, 'a 52/53-week fiscal calendar does not invent an end date');
  }
});

test('identity, fiscal dates, schema and missing numbers fail closed without zero substitution', () => {
  const mutations = [
    data => { data.symbol = 'META'; }, data => { data.symbol = 'NVDA.US'; },
    data => { data.currency = 'CNY'; }, data => { data.modelVersion = 'earnings-valuation-v1'; }, data => { data.schemaVersion = 1; },
    data => { data.snapshotId = null; }, data => { data.reportedPeriod = ''; },
    data => { data.reportedAt = '2026-09-15'; }, data => { data.reportedAt = '2026-02-30'; },
    data => { data.reportPeriodEnd = null; }, data => { data.reportPeriodEnd = '2026-08-27'; },
    data => { data.reportPeriodEnd = '2026-02-30'; }, data => { data.verifiedAt = null; },
    data => { data.checkedAt = '2026-09-14'; }, data => { data.checkedAt = new Date(timestamp + 300001).toISOString(); },
    data => { data.verifiedAt = '2026-08-25'; }, data => { data.reason = 'INSUFFICIENT_DATA'; },
    data => { data.verifiedAt = '2026-09-15'; }, data => { data.expiresAt = '2026-09-13T00:00:00.000Z'; },
    data => { data.expiresAt = '2026-02-30T00:00:00.000Z'; },
    data => { data.forecastPeriod.start = '2026-02-30'; }, data => { data.forecastPeriod.end = '2026-07-01'; },
    data => { data.forecastPeriod.start = data.reportPeriodEnd; },
    data => { delete data.forecastPeriod.end; }, data => { data.notes = null; },
    data => { data.scenarios[0] = null; }, data => { data.scenarios[0].assumptions = [null]; },
    data => { data.scenarios[0].prices = [null]; }, data => { data.scenarios[0].id = 'base'; },
    data => { data.scenarios[0].prices[0].pe = 25; },
    data => { data.scenarios[0].prices[0].price += 0.01; },
  ];
  for (const bad of [null, undefined, '', '8.1', 0, -1, Infinity, NaN]) {
    mutations.push(data => { data.scenarios[0].eps = bad; });
    mutations.push(data => { data.scenarios[0].prices[0].price = bad; });
  }
  for (const [index, mutate] of mutations.entries()) {
    const data = payload(); mutate(data);
    assert.equal(normalizeStockValuationData(data, { symbol: 'NVDA', now: timestamp }), null, `invalid contract ${index}`);
  }
  for (const now of [NaN, Infinity, 1e100, '2026-09-14']) {
    assert.equal(normalizeStockValuationData(payload(), { symbol: 'NVDA', now }), null);
  }
});

test('only the matching issuer official HTTPS sources and matching SEC CIK are accepted', () => {
  for (const [symbol, url] of [
    ['MSFT', 'https://www.microsoft.com/en-us/Investor/earnings/FY-2026-Q4/press-release-webcast'],
    ['NVDA', 'https://investor.nvidia.com/financial-info/financial-reports-and-sec-filings/default.aspx'],
    ['NVDA', 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000001/nvda.htm'],
    ['NVDA', 'https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json'],
    ['MSFT', 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000789019.json'],
    ['META', 'https://data.sec.gov/api/xbrl/companyfacts/CIK0001326801.json'],
    ['META', 'https://investor.atmeta.com/investor-news/default.aspx'],
  ]) {
    const data = payload(symbol); data.sources[0].url = url;
    assert.ok(normalizeStockValuationData(data, { symbol, now: timestamp }), url);
  }
  for (const url of [
    'http://nvidianews.nvidia.com/news/results', 'https://nvidianews.nvidia.com.evil.test/news/results',
    'https://nvidianews.nvidia.com@evil.test/news/results', 'https://secret@nvidianews.nvidia.com/news/results',
    'https://www.microsoft.com/en-us/Investor/earnings/', 'https://www.sec.gov/Archives/edgar/data/1326801/quarter.htm',
    'https://www.sec.gov/search', 'javascript:alert(1)', 'https://investor.nvidia.com:444/results',
    'https://data.sec.gov/api/xbrl/companyfacts/CIK0001326801.json',
    'https://data.sec.gov.evil.test/api/xbrl/companyfacts/CIK0001045810.json',
    'https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json?redirect=elsewhere',
    'https://data.sec.gov/api/xbrl/frames/us-gaap/Revenues/USD/CY2026Q2.json',
  ]) {
    const data = payload(); data.sources[0].url = url;
    assert.equal(normalizeStockValuationData(data, { symbol: 'NVDA', now: timestamp }), null, url);
  }
});

test('expired checks retain historical reporting context but expose no current scenarios', () => {
  const data = payload();
  const expires = Date.parse(data.expiresAt);
  assert.equal(normalizeStockValuationData(data, { symbol: 'NVDA', now: expires - 1 }).status, 'available');
  const expired = normalizeStockValuationData(data, { symbol: 'NVDA', now: expires });
  assert.equal(expired.status, 'pending');
  assert.deepEqual(expired.scenarios, []);
  assert.equal(expired.reportedAt, data.reportedAt);
  assert.equal(expired.checkedAt, data.checkedAt);
  assert.equal(expired.snapshotId, null);
  assert.equal(expired.forecastPeriod, null);
  assert.ok(normalizeStockValuationData(expired, { symbol: 'NVDA', now: expires }));
  expired.scenarios = data.scenarios;
  assert.equal(normalizeStockValuationData(expired, { symbol: 'NVDA', now: expires }), null);
});

test('pending is explicit missing data, accepts unknown report dates and rejects retained old estimates', () => {
  const pending = { ...payload(), status: 'pending', reason: 'LATEST_EARNINGS_PENDING', verifiedAt: null,
    snapshotId: null, reportedPeriod: null, reportedAt: null, reportPeriodEnd: null,
    forecastPeriod: null, sources: [], scenarios: [],
    notes: { zh: '财报待更新或资料不足。', en: 'Awaiting the latest report or complete inputs.' } };
  const data = normalizeStockValuationData(pending, { symbol: 'NVDA', now: timestamp });
  assert.deepEqual(data, pending);
  assert.deepEqual(data.scenarios, []);
  for (const change of [{ scenarios: payload().scenarios }, { snapshotId: 'old-snapshot' }, { reason: null },
    { forecastPeriod: payload().forecastPeriod }, { reportPeriodEnd: '2026-02-30' }]) {
    assert.equal(normalizeStockValuationData({ ...pending, ...change }, { symbol: 'NVDA', now: timestamp }), null);
  }
});

test('unknown valid symbols return unsupported without fetching; invalid symbols and missing sessions reject', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return response(payload()); };
  const data = await loadStockValuation(options('unsupported', { symbol: ' aapl.us ', fetchImpl }));
  assert.equal(data.symbol, 'AAPL');
  assert.equal(data.status, 'unsupported');
  assert.deepEqual(data.scenarios, []);
  assert.equal(data.snapshotId, null);
  assert.ok(normalizeStockValuationData(data, { symbol: 'AAPL', now: timestamp }));
  for (const symbol of ['../MSFT', 'MSFT?user=other', '9988.HK', 'BTC.CC', '']) {
    await assert.rejects(loadStockValuation(options('unsupported', { symbol, fetchImpl })), { code: 'INVALID_SYMBOL' });
  }
  await assert.rejects(loadStockValuation(options('unsupported', { symbol: 'AAPL', getSession: session(null), fetchImpl })), { code: 'AUTH_REQUIRED' });
  assert.equal(calls, 0);
});

test('requests are authenticated, no-store and use the independent valuation view; cache has a short lifetime', async () => {
  let clock = timestamp;
  let calls = 0;
  let checks = 0;
  const config = options('transport', { now: () => clock, getSession: async () => { checks += 1; return session('transport')(); },
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.equal(url, '/api/quote?view=stock-valuation&symbol=NVDA');
      assert.equal(init.headers.Authorization, 'Bearer test-valuation-token');
      assert.equal(init.cache, 'no-store');
      assert.ok(init.signal instanceof AbortSignal);
      assert.equal(init.body, undefined);
      return response(payload());
    } });
  await loadStockValuation(config);
  assert.equal(checks, 2);
  await loadStockValuation({ ...config, symbol: 'nvda.us' });
  assert.equal(checks, 3);
  assert.equal(calls, 1);
  clock += 300001;
  await loadStockValuation(config);
  assert.equal(calls, 2);
});

test('expiry fetches a new check and pending backoff never resurfaces the previous estimates', async () => {
  let clock = timestamp;
  let calls = 0;
  const config = options('dynamic-expiry', { now: () => clock, fetchImpl: async () => {
    calls += 1;
    const data = payload('NVDA', clock);
    if (calls === 2) Object.assign(data, { status: 'pending', reason: 'financial_update_pending',
      snapshotId: null, forecastPeriod: null, scenarios: [], expiresAt: new Date(clock + 60000).toISOString() });
    return response(data);
  } });
  const original = await loadStockValuation(config);
  clock = Date.parse(original.expiresAt);
  const pending = await loadStockValuation(config);
  assert.equal(pending.status, 'pending');
  assert.deepEqual(pending.scenarios, []);
  clock += 59999;
  assert.equal((await loadStockValuation(config)).status, 'pending');
  assert.equal(calls, 2);
  clock += 1;
  const fresh = await loadStockValuation(config);
  assert.equal(calls, 3);
  assert.equal(fresh.status, 'available');
  assert.equal(fresh.checkedAt, new Date(clock).toISOString());
  assert.notEqual(fresh.checkedAt, original.checkedAt);
});

test('cached reads verify session and logout discards cached data before the original account returns', async () => {
  let actual = 'logout';
  let calls = 0;
  const config = options('logout', { getSession: () => session(actual)(), fetchImpl: async () => { calls += 1; return response(payload()); } });
  await loadStockValuation(config);
  actual = null;
  await assert.rejects(loadStockValuation(config), { code: 'AUTH_REQUIRED' });
  actual = 'logout';
  await loadStockValuation(config);
  assert.equal(calls, 2);
  actual = 'different-account';
  await assert.rejects(loadStockValuation(config), { code: 'AUTH_REQUIRED' });
  await loadStockValuation({ ...config, userId: actual });
  assert.equal(calls, 3);
});

test('an old account response cannot clear, abort or populate a newly active account request', async () => {
  const firstStarted = deferred(); const firstResponse = deferred();
  const secondStarted = deferred(); const secondResponse = deferred();
  let actual = 'first-user';
  const getSession = () => session(actual)();
  const old = loadStockValuation(options('first-user', { getSession, fetchImpl: () => { firstStarted.resolve(); return firstResponse.promise; } }));
  const rejected = assert.rejects(old, { code: 'AUTH_REQUIRED' });
  await firstStarted.promise;
  actual = 'second-user';
  const next = loadStockValuation(options(actual, { getSession, fetchImpl: () => { secondStarted.resolve(); return secondResponse.promise; } }));
  await secondStarted.promise;
  firstResponse.resolve(response(payload()));
  await rejected;
  secondResponse.resolve(response(payload()));
  assert.equal((await next).symbol, 'NVDA');
  let calls = 0;
  await loadStockValuation(options(actual, { getSession, fetchImpl: async () => { calls += 1; return response(payload()); } }));
  assert.equal(calls, 0, 'the old request must not discard the new account cache');
});

test('abort during session lookup or request prevents results and cache writes even when fetch ignores abort', async () => {
  const auth = deferred(); const authController = new AbortController(); let calls = 0;
  const initial = loadStockValuation(options('abort-auth', { signal: authController.signal, getSession: () => auth.promise,
    fetchImpl: async () => { calls += 1; return response(payload()); } }));
  authController.abort();
  await assert.rejects(initial, { code: 'REQUEST_ABORTED' });
  auth.resolve(await session('abort-auth')());
  assert.equal(calls, 0);
  const started = deferred(); const waiting = deferred(); const controller = new AbortController();
  const active = loadStockValuation(options('abort-network', { signal: controller.signal,
    fetchImpl: () => { started.resolve(); return waiting.promise; } }));
  await started.promise;
  controller.abort();
  await assert.rejects(active, { code: 'REQUEST_ABORTED' });
  waiting.resolve(response(payload()));
  await loadStockValuation(options('abort-network', { fetchImpl: async () => { calls += 1; return response(payload()); } }));
  assert.equal(calls, 1);
});

test('timeouts, network failures and malformed data fail independently without leaking server text', async () => {
  await assert.rejects(loadStockValuation(options('timeout', { timeoutMs: 5, fetchImpl: () => new Promise(() => {}) })), { code: 'NETWORK_ERROR' });
  for (const [status, code] of [[401, 'AUTH_REQUIRED'], [403, 'AUTH_REQUIRED'], [429, 'RATE_LIMITED'], [500, 'NETWORK_ERROR']]) {
    await assert.rejects(loadStockValuation(options(`http-${status}`, {
      fetchImpl: async () => ({ ok: false, status, json: async () => ({ error: 'private server details' }) }),
    })), error => error.code === code && error.message === code);
  }
  await assert.rejects(loadStockValuation(options('invalid', { fetchImpl: async () => response(payload('META')) })), { code: 'INVALID_DATA' });
  await assert.rejects(loadStockValuation(options('rejected-fetch', { fetchImpl: async () => { throw new Error('private provider URL'); } })), error => error.code === 'NETWORK_ERROR' && error.message === 'NETWORK_ERROR');
});

test('explicit cache invalidation stops an in-flight result and forces fresh retrieval', async () => {
  const started = deferred(); const waiting = deferred();
  const active = loadStockValuation(options('invalidate', { fetchImpl: () => { started.resolve(); return waiting.promise; } }));
  const rejected = assert.rejects(active, { code: 'AUTH_REQUIRED' });
  await started.promise;
  clearStockDecisionValuationCache();
  await rejected;
  waiting.resolve(response(payload()));
  let calls = 0;
  await loadStockValuation(options('invalidate', { fetchImpl: async () => { calls += 1; return response(payload()); } }));
  assert.equal(calls, 1);
});
