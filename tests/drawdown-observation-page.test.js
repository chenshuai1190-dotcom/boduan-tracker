import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { buildObservationUniverse, deriveObservation } from '../src/lib/drawdownObservationModel.js';
import * as cache from '../src/lib/drawdownObservationCache.js';
import { loadDrawdownObservation as realLoadDrawdownObservation } from '../src/lib/drawdownObservationHistory.js';
import { verifyDrawdownObservationSession } from '../src/lib/drawdownObservationSession.js';
import { getInvestmentComparisonExpectedCloseDate } from '../src/lib/investmentComparison.js';

const source = readFileSync(new URL('../src/pages/DrawdownObservationPage.jsx', import.meta.url), 'utf8');
const transformed = await transformWithOxc(source, 'DrawdownObservationPage.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code.replace(/^import\s[^\n]+;?\n/gm, '').replace('export default function ', 'function ');
const START = Date.parse('2026-09-09T02:00:00Z');

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const complete = (request, prices = {}, asOfDate = '2026-09-08') => ({ instruments: request.args.instruments.map(item => ({
  ...item, version: 1, name: item.name || item.symbol, type: ['SPY', 'QQQ'].includes(item.symbol) ? 'ETF' : 'Common Stock',
  status: 'ready', source: 'EODHD_EOD', priceBasis: 'adjusted_close', currency: 'USD',
  asOfDate, expectedAsOfDate: asOfDate, stale: false, staleReason: '', fetchedAt: '2026-09-09T01:00:00Z',
  availableFromDate: '2025-09-08',
  points: [{ date: '2025-09-08', close: 80 }, { date: '2026-09-04', close: 100 }, { date: asOfDate, close: prices[item.symbol] || 90 }],
})) });
const symbols = page => page.tree.props.observations.map(item => item.symbol);
const row = (page, symbol) => page.tree.props.observations.find(item => item.symbol === symbol);
const alice = watchlist => ({ ctx: { userId: 'alice', watchlist: watchlist || [{ symbol: 'NVDA', name: 'Nvidia' }] } });

function cacheFixture() {
  const records = new Map(), clock = { now: START }, writes = [];
  const storage = {
    getItem: key => records.get(key) ?? null,
    setItem: (key, value) => { records.set(key, value); writes.push({ key, value }); },
    removeItem: key => records.delete(key),
  };
  return { records, clock, storage, writes,
    api: {
      getDrawdownSnapshot: args => cache.getDrawdownSnapshot({ ...args, now: clock.now, storage }),
      beginDrawdownCacheRequest: cache.beginDrawdownCacheRequest,
      storeDrawdownHistory: args => cache.storeDrawdownHistory({ ...args, now: clock.now, storage }),
      recordDrawdownFailure: args => cache.recordDrawdownFailure({ ...args, now: clock.now, storage }),
      shouldRefreshDrawdown: row => cache.shouldRefreshDrawdown(row, clock.now),
      clearDrawdownObservationCache: userId => cache.clearDrawdownObservationCache(userId, { storage }),
      getDrawdownViewState: cache.getDrawdownViewState,
      setDrawdownViewState: cache.setDrawdownViewState,
    },
  };
}

// Actual controller/model/cache execute unchanged. Hook storage and async
// boundaries are injectable so identity changes can be checked before effects.
function harness(initialProps = {}, { dev = false, fixture = cacheFixture(), verify, realTransport = false } = {}) {
  let props = initialProps, cursor = 0, dirty = false, tree, unmounted = false, writesAfterUnmount = 0;
  const slots = [], requests = [], sessions = [], historyReads = [];
  let pendingEffects = [];
  const sameDependencies = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => {
        if (unmounted) writesAfterUnmount += 1;
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        dirty ||= !Object.is(next, slots[index].value);
        slots[index].value = next;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: { current: initial } };
      return slots[index].value;
    },
    useMemo(factory, dependencies) {
      const index = cursor++;
      if (!sameDependencies(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, value: factory() };
      return slots[index].value;
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!sameDependencies(previous?.dependencies, dependencies)) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          slots[index] = { dependencies, cleanup: effect() };
        });
      }
    },
  };
  function DrawdownObservation() { return null; }
  function loadDrawdownObservation(args) {
    const request = { args, ...deferred() };
    requests.push(request);
    if (!realTransport) return request.promise;
    return realLoadDrawdownObservation({ ...args, now: fixture.clock.now,
      loadHistory: async ({ symbol }) => {
        historyReads.push(symbol);
        const result = complete({ args: { instruments: [{ symbol, name: symbol }] } }).instruments[0];
        const { points: rows, ...metadata } = result;
        return { ...metadata, rows };
      },
    });
  }
  const dependencies = { React: hooks, DrawdownObservation, buildObservationUniverse, deriveObservation, loadDrawdownObservation,
    ...fixture.api,
    getInvestmentComparisonExpectedCloseDate: () => getInvestmentComparisonExpectedCloseDate(fixture.clock.now),
    verifyDrawdownObservationSession: args => { sessions.push(args); return verify ? verify(args) : Promise.resolve(); },
  };
  const factory = new Function(...Object.keys(dependencies), `${compiled.replaceAll('import.meta.env.DEV', String(dev))}\nreturn DrawdownObservationPage;`);
  const Page = factory(...Object.values(dependencies));
  const page = {
    requests, sessions, historyReads, fixture,
    get tree() { return tree; },
    get writesAfterUnmount() { return writesAfterUnmount; },
    renderOnly(nextProps = props) {
      props = nextProps;
      cursor = 0;
      dirty = false;
      pendingEffects = [];
      tree = Page(props);
      assert.equal(tree.type, DrawdownObservation);
      return tree;
    },
    commit() {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const effects = pendingEffects;
        pendingEffects = [];
        effects.forEach(effect => effect());
        if (!dirty) return tree;
        this.renderOnly();
      }
      assert.fail('controller effects did not settle');
    },
    render(nextProps = props) { this.renderOnly(nextProps); return this.commit(); },
    async flush() {
      for (let index = 0; index < 100; index += 1) await Promise.resolve();
      if (!unmounted) this.render();
    },
    unmount() {
      slots.forEach(slot => slot?.cleanup?.());
      pendingEffects = [];
      unmounted = true;
    },
  };
  page.render();
  return page;
}

test('cold entry has explicit missing states and session validation precedes every first batch', async () => {
  const auth = deferred();
  const page = harness(alice(), { verify: () => auth.promise });
  await page.flush();
  assert.equal(page.sessions.length, 1);
  assert.equal(page.requests.length, 0);
  assert.equal(page.tree.props.loading, true);
  assert.ok(page.tree.props.observations.every(item => item.price === null && item.status === 'loading'));
  auth.resolve();
  await page.flush();
  assert.equal(page.requests.length, 1);
  page.requests[0].resolve(complete(page.requests[0]));
  await page.flush();
  assert.equal(row(page, 'NVDA').price, 90);
  assert.equal(page.tree.props.loading, false);
  assert.equal(page.tree.props.refreshing, false);
  page.unmount();
});

test('actual history source reads a 42-symbol universe once and zero times on cached remount', async () => {
  const fixture = cacheFixture();
  const watchlist = Array.from({ length: 40 }, (_, index) => ({ symbol: 'Z' + String.fromCharCode(65 + Math.floor(index / 26)) + String.fromCharCode(65 + index % 26) }));
  const props = alice(watchlist);
  const first = harness(props, { fixture, realTransport: true });
  await first.flush();
  assert.equal(first.historyReads.length, 42, 'larger than the old shared loader cache of 16');
  assert.equal(first.tree.props.loading, false);
  assert.equal(first.tree.props.observations.filter(item => item.price === 90).length, 42);
  first.unmount();
  const second = harness(props, { fixture, realTransport: true });
  assert.equal(second.tree.props.loading, false, 'cached data render before async session validation');
  assert.equal(second.tree.props.refreshing, false);
  assert.equal(second.tree.props.observations.filter(item => item.price === 90).length, 42);
  await second.flush();
  assert.equal(second.sessions.length, 1, 'even all-fresh memory snapshots validate the mounted identity');
  assert.equal(second.requests.length, 0);
  assert.equal(second.historyReads.length, 0);
  second.render(alice([...watchlist, { symbol: 'AAPL' }]));
  assert.equal(row(second, 'SPY').price, 90);
  await second.flush();
  assert.deepEqual(second.historyReads, ['AAPL'], 'only added symbols touch the history transport');
  assert.equal(second.sessions.length, 1);
  second.unmount();
});

test('disk hydration after memory reset immediately renders cached rows without a history request', async () => {
  const fixture = cacheFixture(), props = alice();
  const first = harness(props, { fixture, realTransport: true });
  await first.flush();
  first.unmount();
  cache.resetDrawdownObservationMemoryCache();
  const reopened = harness(props, { fixture });
  assert.equal(row(reopened, 'NVDA').price, 90);
  assert.equal(reopened.tree.props.loading, false);
  await reopened.flush();
  assert.equal(reopened.requests.length, 0);
  assert.equal(reopened.sessions.length, 1);
  reopened.unmount();
});

test('more than 64 rows remain visible throughout the current session and warm missing-only refill', async () => {
  const fixture = cacheFixture();
  const watchlist = Array.from({ length: 70 }, (_, index) => ({ symbol: 'Z' + String.fromCharCode(65 + Math.floor(index / 26)) + String.fromCharCode(65 + index % 26) }));
  const props = alice(watchlist);
  const first = harness(props, { fixture, realTransport: true });
  await first.flush();
  assert.equal(first.historyReads.length, 72);
  assert.equal(first.tree.props.observations.length, 72);
  assert.ok(first.tree.props.observations.every(item => item.price === 90), 'persisted cache eviction must not erase loaded visible rows');
  first.unmount();
  const reopened = harness(props, { fixture, realTransport: true });
  assert.equal(reopened.tree.props.observations.filter(item => item.price === 90).length, 64);
  await reopened.flush();
  assert.equal(reopened.historyReads.length, 8, 'only the evicted rows are refetched');
  assert.ok(reopened.tree.props.observations.every(item => item.price === 90), 'initial cached rows survive subsequent fills and eviction');
  reopened.render(alice(watchlist.slice(1)));
  await reopened.flush();
  assert.equal(reopened.historyReads.length, 8, 'same-session membership edits use the full live snapshot');
  assert.equal(reopened.tree.props.observations.length, 71);
  reopened.unmount();
});

test('validated history that cannot be compacted into disk cache is still displayed for this page', async () => {
  const page = harness(alice());
  await page.flush();
  const result = complete(page.requests[0]);
  const item = result.instruments.find(item => item.symbol === 'NVDA');
  item.availableFromDate = '2001-01-02';
  item.points = [{ date: '2001-01-02', close: 30 }, { date: '2026-09-08', close: 75 }];
  page.requests[0].resolve(result);
  await page.flush();
  assert.equal(row(page, 'NVDA').price, 75, 'cache persistence is not a prerequisite for valid UI data');
  assert.equal(page.tree.props.loading, false);
  page.render(alice([{ symbol: 'NVDA' }, { symbol: 'AAPL' }]));
  await page.flush();
  assert.deepEqual(page.requests[1].args.instruments.map(item => item.symbol), ['AAPL']);
  page.unmount();
});

test('a failure cooldown on evicted live rows does not cross a new closing-date cutoff', async () => {
  const fixture = cacheFixture();
  fixture.clock.now = Date.parse('2026-09-09T19:59:40Z');
  const watchlist = Array.from({ length: 70 }, (_, index) => ({ symbol: 'Z' + String.fromCharCode(65 + Math.floor(index / 26)) + String.fromCharCode(65 + index % 26) }));
  const page = harness(alice(watchlist), { fixture });
  await page.flush();
  page.requests[0].resolve(complete(page.requests[0]));
  await page.flush();
  page.tree.props.onRefresh();
  page.render();
  await page.flush();
  const failures = complete(page.requests[1]);
  failures.instruments = failures.instruments.map(item => ({ ...item, status: 'error', points: [], error: { code: 'PROVIDER_UNAVAILABLE' } }));
  page.requests[1].resolve(failures);
  await page.flush();
  fixture.clock.now = Date.parse('2026-09-09T20:00:01Z');
  page.render(alice([...watchlist, { symbol: 'AAPL' }]));
  await page.flush();
  assert.equal(page.requests[2].args.instruments.length, 73, 'all prior-day rows refresh, including the eight retained only by the live map');
  assert.equal(page.requests[2].args.force, false);
  page.unmount();
});

test('new closing day preserves dated prior data while refreshing, failures retain stale prices and retry cooldown', async () => {
  const fixture = cacheFixture(), props = alice();
  const first = harness(props, { fixture, realTransport: true });
  await first.flush();
  first.unmount();
  fixture.clock.now += 24 * 60 * 60 * 1000;
  const reopened = harness(props, { fixture });
  assert.equal(row(reopened, 'NVDA').price, 90);
  assert.equal(row(reopened, 'NVDA').asOfDate, '2026-09-08');
  assert.equal(row(reopened, 'NVDA').stale, true);
  assert.equal(reopened.tree.props.loading, false);
  assert.equal(reopened.tree.props.refreshing, true);
  await reopened.flush();
  const failed = complete(reopened.requests[0]);
  failed.instruments = failed.instruments.map(item => ({ ...item, status: 'error', points: [], error: { code: 'PROVIDER_UNAVAILABLE' } }));
  reopened.requests[0].resolve(failed);
  await reopened.flush();
  assert.equal(row(reopened, 'NVDA').price, 90);
  assert.equal(row(reopened, 'NVDA').stale, true);
  assert.match(reopened.tree.props.error, /保留上次数据/);
  assert.equal(reopened.tree.props.refreshing, false);
  reopened.unmount();
  const cooldown = harness(props, { fixture });
  await cooldown.flush();
  assert.equal(cooldown.requests.length, 0, 'reopening a provider failure does not hammer the endpoint');
  assert.equal(row(cooldown, 'NVDA').price, 90);
  cooldown.unmount();
});

test('identity changes synchronously hide previous prices and membership before effect cleanup', async () => {
  const page = harness(alice());
  await page.flush();
  const first = page.requests[0];
  first.resolve(complete(first, { NVDA: 75 }));
  await page.flush();
  const oldKey = page.tree.key;
  page.renderOnly({ ctx: { userId: 'bob', watchlist: [{ symbol: 'AAPL' }] } });
  assert.notEqual(page.tree.key, oldKey);
  assert.deepEqual(symbols(page), ['SPY', 'QQQ', 'AAPL']);
  assert.ok(page.tree.props.observations.every(item => item.price === null));
  assert.equal(first.args.signal.aborted, false);
  page.commit();
  await page.flush();
  assert.equal(first.args.signal.aborted, true);
  assert.equal(page.requests[1].args.userId, 'bob');
  page.unmount();
});

test('membership changes preserve existing prices, remove deleted positions before effects and do not remount filters', async () => {
  const props = { ctx: { userId: 'alice', watchlist: [{ symbol: 'NVDA', name: 'Nvidia' }], positions: [{ symbol: 'MSFT', name: 'Microsoft', quantity: 5 }] } };
  const page = harness(props);
  await page.flush();
  page.requests[0].resolve(complete(page.requests[0]));
  await page.flush();
  const presentationKey = page.tree.key;
  page.tree.props.onViewStateChange({ scope: 'holdings', minDepth: 20, order: 'shallowest', scrollTop: 345 });
  page.render({ ctx: { ...props.ctx, watchlist: [{ symbol: 'NVDA', name: 'Nvidia', price: 99 }], positions: [{ symbol: 'MSFT', name: 'Microsoft', quantity: 8 }] } });
  await page.flush();
  assert.equal(page.requests.length, 1);
  page.renderOnly({ ctx: { ...props.ctx, positions: [{ symbol: 'MSFT', quantity: 0 }] } });
  assert.deepEqual(symbols(page), ['SPY', 'QQQ', 'NVDA']);
  assert.equal(row(page, 'NVDA').price, 90);
  assert.equal(page.tree.key, presentationKey);
  page.commit();
  await page.flush();
  assert.equal(page.requests.length, 1);
  page.unmount();
  const restored = harness(alice(), { fixture: page.fixture });
  assert.deepEqual(restored.tree.props.initialViewState, { scope: 'holdings', minDepth: 20, order: 'shallowest', scrollTop: 345 });
  restored.unmount();
});

test('unready or failed holdings never expose retained membership', async () => {
  const props = { ctx: { userId: 'alice', positions: [{ symbol: 'NVDA', quantity: 4 }], portfolioReady: true, portfolioError: '' } };
  const page = harness(props);
  await page.flush();
  page.renderOnly({ ctx: { ...props.ctx, portfolioReady: false } });
  assert.deepEqual(symbols(page), ['SPY', 'QQQ']);
  page.commit();
  page.render({ ctx: { ...props.ctx, portfolioError: 'holdings unavailable' } });
  assert.deepEqual(symbols(page), ['SPY', 'QQQ']);
  assert.equal(page.tree.props.portfolioError, 'holdings unavailable');
  page.unmount();
});

test('aborted older requests cannot store late progress or completion after identity change', async () => {
  const page = harness(alice());
  await page.flush();
  const old = page.requests[0];
  page.render({ ctx: { userId: 'bob', watchlist: [{ symbol: 'AAPL' }] } });
  await page.flush();
  const current = page.requests[1];
  current.resolve(complete(current, { AAPL: 88 }));
  await page.flush();
  const writes = page.fixture.writes.length;
  old.args.onProgress(complete(old, { NVDA: 50 }));
  old.resolve(complete(old, { NVDA: 60 }));
  await page.flush();
  assert.equal(page.fixture.writes.length, writes);
  assert.deepEqual(symbols(page), ['SPY', 'QQQ', 'AAPL']);
  assert.equal(row(page, 'AAPL').price, 88);
  page.unmount();
});

test('unmount aborts and suppresses subsequent state and cache writes', async () => {
  const page = harness(alice());
  await page.flush();
  const request = page.requests[0];
  page.unmount();
  const writes = page.fixture.writes.length;
  assert.equal(request.args.signal.aborted, true);
  request.args.onProgress(complete(request));
  request.reject(new Error('late abort rejection'));
  await page.flush();
  assert.equal(page.writesAfterUnmount, 0);
  assert.equal(page.fixture.writes.length, writes);
});

test('identity failure discards cached and already-persisted partial progress then invalidates old tickets', async () => {
  const page = harness(alice());
  await page.flush();
  const request = page.requests[0];
  request.args.onProgress(complete(request, { NVDA: 70 }));
  page.render();
  assert.equal(row(page, 'NVDA').price, 70);
  const ticket = cache.beginDrawdownCacheRequest('alice');
  request.reject(Object.assign(new Error('identity changed'), { code: 'AUTH_REQUIRED' }));
  await page.flush();
  assert.match(page.tree.props.error, /登录状态/);
  assert.ok(page.tree.props.observations.every(item => item.price === null && item.status === 'error'));
  assert.equal(page.fixture.records.size, 0);
  assert.equal(page.fixture.api.storeDrawdownHistory({ userId: 'alice', instrument: complete(request).instruments[0], ticket }), false);
  request.args.onProgress(complete(request, { NVDA: 95 }));
  await page.flush();
  assert.equal(row(page, 'NVDA').price, null, 'late callbacks cannot repopulate the in-page live map after identity invalidation');
  assert.match(page.tree.props.error, /登录状态/);
  page.unmount();
});

test('invalid session on an entirely cached mount clears history without starting a network batch', async () => {
  const fixture = cacheFixture();
  const first = harness(alice(), { fixture, realTransport: true });
  await first.flush();
  first.unmount();
  const reopened = harness(alice(), { fixture, verify: () => Promise.reject(Object.assign(new Error('signed out'), { code: 'AUTH_REQUIRED' })) });
  assert.equal(row(reopened, 'NVDA').price, 90);
  await reopened.flush();
  assert.equal(reopened.requests.length, 0);
  assert.equal(row(reopened, 'NVDA').price, null);
  assert.equal(fixture.records.size, 0);
  assert.match(reopened.tree.props.error, /登录状态/);
  reopened.unmount();
});

test('manual refresh retains prices, coalesces repeated clicks and processes each result once', async () => {
  const page = harness(alice());
  await page.flush();
  const first = page.requests[0];
  first.resolve(complete(first));
  await page.flush();
  page.tree.props.onRefresh();
  page.render();
  await page.flush();
  const second = page.requests[1];
  assert.equal(second.args.force, true);
  assert.equal(row(page, 'NVDA').price, 90);
  assert.equal(page.tree.props.loading, false);
  assert.equal(page.tree.props.refreshing, true);
  page.tree.props.onRefresh();
  page.render();
  await page.flush();
  assert.equal(page.requests.length, 2);
  const updated = complete(second, { NVDA: 95 });
  const writes = page.fixture.writes.length;
  second.args.onProgress(updated);
  second.args.onProgress(updated);
  second.resolve(updated);
  await page.flush();
  assert.equal(page.fixture.writes.length - writes, 3, 'one store per settled symbol per attempt');
  assert.equal(row(page, 'NVDA').price, 95);
  assert.equal(page.tree.props.refreshing, false);
  page.render(alice([{ symbol: 'NVDA' }, { symbol: 'AAPL' }]));
  await page.flush();
  assert.equal(page.requests[2].args.force, false);
  assert.deepEqual(page.requests[2].args.instruments.map(item => item.symbol), ['AAPL']);
  page.unmount();
});

test('production cannot inject preview transport or authentication; DEV may explicitly supply both', async () => {
  const previewLoad = () => Promise.resolve(), calls = [];
  const previewVerify = args => { calls.push(args); return Promise.resolve(); };
  const props = { ...alice(), previewSource: { load: previewLoad, verifySession: previewVerify, initialSymbol: 'NVDA' } };
  const production = harness(props);
  await production.flush();
  assert.equal(production.requests[0].args.loadHistory, undefined);
  assert.equal(production.sessions.length, 1);
  assert.equal(calls.length, 0);
  assert.equal(production.tree.props.initialSymbol, '');
  production.unmount();
  const preview = harness(props, { dev: true });
  await preview.flush();
  assert.equal(preview.requests[0].args.loadHistory, previewLoad);
  assert.equal(preview.sessions.length, 0);
  assert.equal(calls.length, 1);
  assert.equal(preview.tree.props.initialSymbol, 'NVDA');
  preview.unmount();
});

test('session verifier only accepts matching authenticated identities and never returns a token', async () => {
  const token = 'unit-test-token';
  const valid = { data: { session: { user: { id: 'alice' }, access_token: token } } };
  assert.equal(await verifyDrawdownObservationSession({ userId: 'alice', getSession: async () => valid }), undefined);
  for (const result of [{ data: { session: null } }, { error: new Error('expired'), ...valid },
    { data: { session: { user: { id: 'bob' }, access_token: token } } },
    { data: { session: { user: { id: 'alice' }, access_token: '' } } }]) {
    await assert.rejects(verifyDrawdownObservationSession({ userId: 'alice', getSession: async () => result }), { code: 'AUTH_REQUIRED' });
  }
  await assert.rejects(verifyDrawdownObservationSession({ userId: '', getSession: async () => valid }), { code: 'AUTH_REQUIRED' });
});
