import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stockRsiLocalDateKey } from '../src/lib/stockRsiReference.js';
import { getVixComparisonExpectedCloseDate } from '../src/lib/vixComparisonSession.js';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const UNAVAILABLE = Object.freeze({ vixRatioReady: false, vixRatioValue: null,
  vixRatioDataDate: '', vixRatioBuySignal: false });
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const settle = () => new Promise(resolve => setImmediate(resolve));
const session = (id = 'user-a', token = 'token-a') => ({
  data: { session: { user: { id }, access_token: token } },
});
const comparison = (ratio = 1.1, now = NOW) => {
  const date = getVixComparisonExpectedCloseDate(now);
  return { termStructure: { source: 'CBOE', stale: false,
    asOfDate: date, expectedAsOfDate: date,
    rows: [{ date, vix: ratio * 20, vix3m: 20, ratio }] } };
};

// Execute the production hook and pure date/ratio contracts. Only React's
// scheduler and the already-tested authenticated comparison loader are replaced.
const hooksUrl = dataUrl(`
let slots = [], cursor = 0, effects = [];
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
export function reset() { for (const slot of slots) slot?.cleanup?.(); slots = []; effects = []; }
export function render(Component, props) { cursor = 0; return Component(props); }
export function flush() { const pending = effects; effects = []; pending.forEach(effect => effect()); }
export function useState(initial) {
  const slot = slots[cursor++] ||= { value: typeof initial === 'function' ? initial() : initial };
  return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
}
export function useMemo(factory, deps) {
  const index = cursor++; if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: factory(), deps };
  return slots[index].value;
}
export function useEffect(create, deps) {
  const index = cursor++, previous = slots[index];
  if (previous && same(previous.deps, deps)) return;
  const slot = slots[index] = { deps };
  effects.push(() => { previous?.cleanup?.(); slot.cleanup = create(); });
}
`);
const loaderUrl = dataUrl(`
export { getVixComparisonExpectedCloseDate } from ${JSON.stringify(new URL('../src/lib/vixComparisonSession.js', import.meta.url).href)};
let loader;
export function setLoader(value) { loader = value; }
export function loadVixComparison(options) { return loader(options); }
`);
const hooks = await import(hooksUrl);
const loader = await import(loaderUrl);
const hookSourceUrl = new URL('../src/lib/useTradeVixRatioReference.js', import.meta.url);
const hookSource = readFileSync(hookSourceUrl, 'utf8').replace(/(from\s+)(['"])([^'"]+)\2/g,
  (_, prefix, _quote, path) => `${prefix}${JSON.stringify(path === 'react' ? hooksUrl
    : path === './vixComparison.js' ? loaderUrl : new URL(path, hookSourceUrl).href)}`);
const { useTradeVixRatioReference } = await import(dataUrl(hookSource));

function harness(t, initial = {}, initialNow = NOW) {
  hooks.reset();
  t.after(() => hooks.reset());
  let now = initialNow;
  t.mock.method(Date, 'now', () => now);
  let currentSession = session();
  const calls = [], listeners = new Set();
  let authReads = 0;
  const authClient = {
    getSession: async () => { authReads += 1; return currentSession; },
    onAuthStateChange: callback => {
      listeners.add(callback);
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    },
  };
  loader.setLoader(options => {
    const pending = deferred();
    const call = { options, resolve: pending.resolve, reject: pending.reject, session: null };
    calls.push(call);
    // Exercise the hook's supplied auth callback, while deliberately allowing
    // late responses so the hook itself must enforce its lifecycle boundaries.
    return Promise.resolve(options.getSession()).then(value => {
      call.session = value;
      return pending.promise;
    });
  });
  let props = { active: true, userId: 'user-a', authClient,
    tradeDate: stockRsiLocalDateKey(now), ...initial };
  return {
    calls,
    get authReads() { return authReads; },
    get listenerCount() { return listeners.size; },
    render(patch = {}) {
      props = { ...props, ...patch };
      const value = hooks.render(useTradeVixRatioReference, props);
      hooks.flush();
      return value;
    },
    auth(next, event = 'SIGNED_IN') {
      currentSession = next;
      for (const callback of [...listeners]) callback(event, next?.data?.session);
    },
    setNow(value) { now = value; },
  };
}

test('inactive, unauthenticated and historical entry scopes never load or subscribe', async t => {
  const run = harness(t, { active: false });
  for (const patch of [{}, { active: true, userId: '' },
    { userId: 'user-a', authClient: null }, { authClient: {} }]) {
    assert.deepEqual(run.render(patch), UNAVAILABLE);
  }
  assert.equal(run.calls.length, 0);
  assert.equal(run.authReads, 0);
  assert.equal(run.listenerCount, 0);
});

test('historical, future and invalid dates do not request the latest ratio', async t => {
  const run = harness(t, { tradeDate: '2026-10-02' });
  for (const tradeDate of ['2026-10-02', '2999-01-01', '', '2026-02-30']) {
    assert.deepEqual(run.render({ tradeDate }), UNAVAILABLE);
  }
  assert.equal(run.calls.length, 0);
  assert.equal(run.authReads, 0);
  assert.equal(run.listenerCount, 0);
});

test('one active scope loads once and ordinary renders or ticker and amount edits never refetch', async t => {
  const run = harness(t);
  assert.deepEqual(run.render(), UNAVAILABLE);
  await settle();
  assert.equal(run.calls.length, 1);
  assert.equal(run.authReads, 1);
  assert.equal(run.calls[0].options.userId, 'user-a');
  assert.equal(run.calls[0].options.force, undefined, 'daily cache reads must not force a refresh');
  for (const patch of [{}, { symbol: 'NVDA' }, { symbol: 'TQQQ', price: '60', shares: '10' }]) {
    assert.deepEqual(run.render(patch), UNAVAILABLE);
  }
  assert.equal(run.calls.length, 1);
  run.calls[0].resolve(comparison());
  await settle();
  for (const patch of [{}, { price: '65' }, { shares: '11' }]) {
    const value = run.render(patch);
    assert.equal(value.vixRatioReady, true);
    assert.equal(value.vixRatioValue, 1.1);
    assert.equal(value.vixRatioBuySignal, true);
  }
  assert.equal(run.calls.length, 1);
  assert.equal(run.listenerCount, 1);
});

test('closing or changing to sell deactivates the scope and ignores its late response', async t => {
  const run = harness(t);
  run.render();
  await settle();
  assert.deepEqual(run.render({ active: false }), UNAVAILABLE);
  assert.equal(run.listenerCount, 0);
  run.calls[0].resolve(comparison(1.2));
  await settle();
  assert.deepEqual(run.render(), UNAVAILABLE);
  assert.equal(run.calls.length, 1);
  assert.deepEqual(run.render({ active: true }), UNAVAILABLE, 'reopening cannot reveal the abandoned scope');
  await settle();
  assert.equal(run.calls.length, 2);
  run.calls[1].resolve(comparison(0.9));
  await settle();
  assert.equal(run.render().vixRatioValue, 0.9);
  assert.equal(run.render().vixRatioBuySignal, false);
  assert.deepEqual(run.render({ active: false }), UNAVAILABLE, 'deactivation also hides an already loaded ratio');
});

test('changing to a historical date cancels display of both pending and loaded current observations', async t => {
  const run = harness(t);
  run.render();
  await settle();
  assert.deepEqual(run.render({ tradeDate: '2026-10-02' }), UNAVAILABLE);
  run.calls[0].resolve(comparison());
  await settle();
  assert.deepEqual(run.render(), UNAVAILABLE);
  assert.equal(run.calls.length, 1);
  run.render({ tradeDate: stockRsiLocalDateKey(NOW) });
  await settle();
  run.calls[1].resolve(comparison());
  await settle();
  assert.equal(run.render().vixRatioReady, true);
  assert.deepEqual(run.render({ tradeDate: '2026-10-01' }), UNAVAILABLE);
  assert.equal(run.calls.length, 2);
});

test('an account switch cannot reveal or overwrite the new account with a late old response', async t => {
  const run = harness(t);
  run.render();
  await settle();
  run.auth(session('user-b', 'token-b'));
  assert.deepEqual(run.render(), UNAVAILABLE);
  assert.deepEqual(run.render({ userId: 'user-b' }), UNAVAILABLE);
  await settle();
  assert.equal(run.calls.length, 2);
  assert.equal(run.calls[1].options.userId, 'user-b');
  assert.equal(run.calls[1].session.data.session.access_token, 'token-b');
  run.calls[1].resolve(comparison(0.9));
  await settle();
  assert.equal(run.render().vixRatioValue, 0.9);
  run.calls[0].resolve(comparison(1.2));
  await settle();
  assert.equal(run.render().vixRatioValue, 0.9);
  assert.equal(run.render().vixRatioBuySignal, false);
  assert.equal(run.listenerCount, 1);
});

test('sign-out revokes a pending response even before the parent updates its user prop', async t => {
  const run = harness(t);
  run.render();
  await settle();
  run.auth({ data: { session: null } }, 'SIGNED_OUT');
  assert.deepEqual(run.render(), UNAVAILABLE);
  run.calls[0].resolve(comparison());
  await settle();
  assert.deepEqual(run.render(), UNAVAILABLE);
  assert.equal(run.calls.length, 1, 'sign-out must not start another authenticated load');
  assert.deepEqual(run.render({ userId: '' }), UNAVAILABLE);
  assert.equal(run.listenerCount, 0);
});

test('token refresh authenticates one new scope and discards the old token response', async t => {
  const run = harness(t);
  run.render();
  await settle();
  run.auth(session('user-a', 'token-refreshed'), 'TOKEN_REFRESHED');
  assert.deepEqual(run.render(), UNAVAILABLE);
  await settle();
  assert.equal(run.calls.length, 2);
  assert.equal(run.authReads, 2);
  assert.equal(run.calls[1].session.data.session.access_token, 'token-refreshed');
  run.calls[0].resolve(comparison(1.2));
  await settle();
  assert.deepEqual(run.render(), UNAVAILABLE);
  run.calls[1].resolve(comparison(0.9));
  await settle();
  assert.equal(run.render().vixRatioValue, 0.9);
  assert.equal(run.calls.length, 2);
  assert.equal(run.listenerCount, 1);
});

test('the completed-session boundary starts a fresh scope without reusing the earlier close', async t => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'Asia/Shanghai';
  t.after(() => {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  });
  const before = Date.parse('2026-10-05T20:29:00Z');
  const after = Date.parse('2026-10-05T20:30:00Z');
  assert.equal(stockRsiLocalDateKey(before), stockRsiLocalDateKey(after), 'the entered date remains unchanged');
  assert.notEqual(getVixComparisonExpectedCloseDate(before), getVixComparisonExpectedCloseDate(after));
  const run = harness(t, {}, before);
  run.render();
  await settle();
  run.calls[0].resolve(comparison(1.1, before));
  await settle();
  assert.equal(run.render().vixRatioReady, true);
  run.setNow(after);
  assert.deepEqual(run.render(), UNAVAILABLE, 'the prior completed close disappears on the first new-session render');
  await settle();
  assert.equal(run.calls.length, 2, 'a new completed date must invalidate the load scope without a polling loop');
  run.calls[1].resolve(comparison(1.1, before));
  await settle();
  assert.deepEqual(run.render(), UNAVAILABLE, 'a lagging response cannot restore the older ratio');
});

test('a rejected load stays unavailable without an automatic retry loop', async t => {
  const run = harness(t);
  run.render();
  await settle();
  run.calls[0].reject(Object.assign(new Error('unavailable'), { code: 'NETWORK_ERROR' }));
  await settle();
  for (let index = 0; index < 3; index += 1) assert.deepEqual(run.render(), UNAVAILABLE);
  assert.equal(run.calls.length, 1);
});
