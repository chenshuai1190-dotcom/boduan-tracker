import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const start = source.indexOf('const runGlobalPullRefresh = async () =>');
const end = source.indexOf('runGlobalPullRefreshRef.current = runGlobalPullRefresh;', start);
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(refresh) {
  const statuses = [], failures = [], calls = [];
  const fixture = {
    globalRefreshingRef: { current: false }, pullRefreshResetTimerRef: { current: null }, pullRefreshDistanceRef: { current: 0 },
    reviewPublicRefreshRef: { current: refresh }, watchlistOrderMutationSerialRef: { current: 0 }, benchmarkMutationSerialRef: { current: 0 },
    PULL_REFRESH_THRESHOLD: 60, PULL_REFRESH_MAX_DISTANCE: 100,
    setPullRefreshDistance: () => {}, setPullRefreshStatus: value => statuses.push(value), setFetchError: value => failures.push(value), setCloudError: () => {},
    checkForAppShellUpdate: async () => false, reloadAppShellWithFreshHtml: () => {}, clearTimeout: () => {}, setTimeout: () => 1,
    db: { fetchAllUserData: async () => { calls.push('cloud'); return {}; } }, applyCloudUserData: () => {},
    fetchDailyFxRates: async () => calls.push('fx'), buildQuoteRowsFromCloudResult: () => [], fetchRealtimePrices: async () => calls.push('quotes'),
    console: { error: () => {} },
  };
  const run = new Function('fixture', `const {${Object.keys(fixture).join(',')}} = fixture; ${source.slice(start, end)} return runGlobalPullRefresh;`)(fixture);
  return { run, statuses, failures, calls };
}

test('global pull refresh awaits the public feed before reporting success', async () => {
  let finish;
  const h = harness(() => new Promise(resolve => { finish = resolve; }));
  const running = h.run(); await flush();
  assert.deepEqual(h.statuses, ['refreshing']);
  assert.equal(typeof finish, 'function');
  finish(); await running;
  assert.deepEqual(h.statuses, ['refreshing', 'done']);
  assert.deepEqual(h.calls, ['cloud', 'fx', 'quotes'], 'existing market refresh flow is unchanged');
});

test('a failed public read is a failed pull refresh, and pages without a public feed still refresh normally', async () => {
  const failed = harness(async () => { throw new Error('公开动态读取失败'); });
  await failed.run();
  assert.deepEqual(failed.statuses, ['refreshing', 'idle']);
  assert.equal(failed.failures.at(-1), '公开动态读取失败');
  const hidden = harness(null); await hidden.run();
  assert.deepEqual(hidden.statuses, ['refreshing', 'done']);
  assert.deepEqual(hidden.calls, ['cloud', 'fx', 'quotes']);
});
