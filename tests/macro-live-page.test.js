import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { fetchMacroData } from '../src/macro/MacroDataService.js';
import { createMacroSnapshot } from '../src/macro/macroNormalizer.js';

const snapshot = value => createMacroSnapshot({
  now: '2026-09-19T12:00:00Z', calendarStatus: 'available',
  series: value === null ? {} : { us10y: { source: 'test', history: [{ date: '2026-09-18', value }] } },
});
const session = (id = 'user-a', token = 'test-token') => ({ data: { session: {
  access_token: token, user: { id }, expires_at: Math.floor(Date.now() / 1000) + 3600,
} } });
const response = data => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const flush = () => new Promise(resolve => setImmediate(resolve));

test('production Macro obtains the matching active session and sends only the authenticated app request', async () => {
  const data = snapshot(4.31);
  let sessions = 0;
  const calls = [];
  const result = await fetchMacroData({ userId: 'user-a', preview: true,
    getSession: async () => { sessions++; return session(); },
    fetchImpl: async (url, options) => { calls.push({ url, options }); return response(data); },
  });
  assert.equal(result, data);
  assert.equal(sessions, 2, 'session identity is checked before fetching and before exposing the result');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/quote?view=macro', 'a preview option cannot bypass auth in a production build');
  assert.deepEqual(calls[0].options.headers, { Authorization: 'Bearer test-token' });
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.signal.aborted, false);
});

test('missing, mismatched, expired or changed production sessions never release Macro data', async () => {
  for (const value of [undefined, { data: { session: null } }, session('user-b'),
    { ...session(), error: { message: 'auth failure' } },
    { data: { session: { ...session().data.session, expires_at: 1 } } }]) {
    let calls = 0;
    await assert.rejects(fetchMacroData({ userId: 'user-a', getSession: async () => value,
      fetchImpl: async () => { calls++; return response(snapshot(4.31)); },
    }), error => error.code === 'AUTH_REQUIRED');
    assert.equal(calls, 0);
  }
  let calls = 0;
  await assert.rejects(fetchMacroData({ userId: '', getSession: async () => { calls++; return session(); } }),
    error => error.code === 'AUTH_REQUIRED');
  assert.equal(calls, 0);
  let checks = 0;
  await assert.rejects(fetchMacroData({ userId: 'user-a', getSession: async () => ++checks === 1 ? session() : session('user-b'),
    fetchImpl: async () => response(snapshot(4.31)),
  }), error => error.code === 'AUTH_REQUIRED');
  assert.equal(checks, 2);
});

test('request failures remain errors and cannot become a mock or successful empty response', async () => {
  for (const [status, code] of [[401, 'AUTH_REQUIRED'], [403, 'AUTH_REQUIRED'], [429, 'NETWORK_ERROR'], [503, 'NETWORK_ERROR']]) {
    await assert.rejects(fetchMacroData({ userId: 'user-a', getSession: async () => session(),
      fetchImpl: async () => ({ ok: false, status, json: async () => ({ secret: 'must-not-escape' }) }),
    }), error => error.code === code && !error.message.includes('must-not-escape'));
  }
  await assert.rejects(fetchMacroData({ userId: 'user-a', getSession: async () => session(),
    fetchImpl: async () => { throw Error('https://provider.invalid?token=must-not-escape'); },
  }), error => error.code === 'NETWORK_ERROR' && !error.message.includes('must-not-escape'));
  await assert.rejects(fetchMacroData({ userId: 'user-a', getSession: async () => session(),
    fetchImpl: async () => response({ simulated: true }),
  }), error => error.code === 'INVALID_DATA');
});

test('abort and timeout cover session lookup and a fetch that ignores cancellation', async () => {
  const controller = new AbortController();
  const pendingSession = deferred();
  let requests = 0;
  const loading = fetchMacroData({ userId: 'user-a', signal: controller.signal,
    getSession: () => pendingSession.promise, fetchImpl: async () => { requests++; return response(snapshot(4.31)); },
  });
  controller.abort();
  await assert.rejects(loading, error => error.code === 'REQUEST_ABORTED');
  pendingSession.resolve(session());
  await flush();
  assert.equal(requests, 0, 'a late auth completion must not start a cancelled network request');

  let requestSignal;
  await assert.rejects(fetchMacroData({ userId: 'user-a', timeoutMs: 5, getSession: async () => session(),
    fetchImpl: (_url, options) => { requestSignal = options.signal; return new Promise(() => {}); },
  }), error => error.code === 'REQUEST_TIMEOUT');
  assert.equal(requestSignal.aborted, true);
  await assert.rejects(fetchMacroData({ userId: 'user-a', timeoutMs: 5, getSession: () => new Promise(() => {}) }),
    error => error.code === 'REQUEST_TIMEOUT');

  let completedSignal;
  await fetchMacroData({ userId: 'user-a', timeoutMs: 5, getSession: async () => session(),
    fetchImpl: async (_url, options) => { completedSignal = options.signal; return response(snapshot(4.31)); },
  });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(completedSignal.aborted, false, 'a completed request must clear its timeout');
});

const source = readFileSync(new URL('../src/pages/MacroLivePage.jsx', import.meta.url), 'utf8');
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const hooksUrl = dataUrl(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  let slots = [], cursor = 0, effects = [];
  export function dispose() { for (const slot of slots) slot?.cleanup?.(); }
  export function reset() { dispose(); slots = []; effects = []; }
  export function render(Component, props) {
    cursor = 0; const result = Component(props);
    const pending = effects; effects = []; pending.forEach(effect => effect());
    return result;
  }
  function useState(initial) {
    const slot = slots[cursor++] ||= { value: typeof initial === 'function' ? initial() : initial };
    return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
  }
  function useEffect(create, dependencies) {
    const index = cursor++; const previous = slots[index];
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
      effects.push(() => { previous?.cleanup?.(); slots[index] = { dependencies, cleanup: create() }; });
    }
  }
  export default { ...React, useState, useEffect };
`);
const serviceUrl = dataUrl(`
  export let calls = [];
  export function reset() { calls = []; }
  export function fetchMacroData(options) {
    let resolve, reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    calls.push({ options, resolve, reject }); return promise;
  }
`);
const pageUrl = dataUrl('export default function MacroPage() { return null; }');
const hooks = await import(hooksUrl);
const service = await import(serviceUrl);
const components = {};
for (const development of [false, true]) {
  const transformed = await transformWithOxc(source.replaceAll('import.meta.env.DEV', String(development)), 'MacroLivePage.jsx', { jsx: { runtime: 'classic' } });
  const code = transformed.code
    .replace(/from (['"])react\1/g, `from ${JSON.stringify(hooksUrl)}`)
    .replace(/from (['"])\.\/MacroPage\.jsx\1/g, `from ${JSON.stringify(pageUrl)}`)
    .replace(/from (['"])\.\.\/macro\/MacroDataService\.js\1/g, `from ${JSON.stringify(serviceUrl)}`);
  components[development] = (await import(dataUrl(code))).default;
}
function harness(t, props, development = false) {
  hooks.reset(); service.reset(); t.after(() => hooks.dispose());
  return { props, render: () => hooks.render(components[development], props), dispose: () => hooks.dispose() };
}

test('production wrapper ignores mock props, uses the user context and forwards its close action', async t => {
  let closed = 0;
  const h = harness(t, { ctx: { userId: 'user-a', closeMacro: () => { closed++; } }, mock: true, initialPage: 'rates' });
  let tree = h.render();
  assert.equal(tree.props.fetchState, 'loading');
  assert.equal(tree.props.initialPage, 'rates');
  assert.equal(service.calls.length, 1);
  assert.equal(service.calls[0].options.preview, false);
  assert.equal(service.calls[0].options.userId, 'user-a');
  tree.props.onBack(); assert.equal(closed, 1);
  service.calls[0].resolve(snapshot(4.31)); await flush();
  tree = h.render();
  assert.equal(tree.props.fetchState, 'ready');
  assert.equal(tree.props.snapshot.metrics.us10y.value, 4.31);
  tree.props.onRetry(); tree = h.render();
  assert.equal(tree.props.fetchState, 'loading');
  assert.equal(tree.props.snapshot, undefined);
  assert.equal(service.calls[0].options.signal.aborted, true);
  assert.equal(service.calls.length, 2);
  service.calls[1].reject(Error('provider failure')); await flush();
  tree = h.render();
  assert.equal(tree.props.fetchState, 'error');
  assert.equal(tree.props.snapshot, undefined);
});

test('switching user or logging out immediately hides old data and late responses cannot overwrite the active request', async t => {
  const h = harness(t, { ctx: { userId: 'user-a' } });
  h.render(); const old = service.calls[0];
  h.props.ctx = { userId: 'user-b' };
  let tree = h.render(); const current = service.calls[1];
  assert.equal(old.options.signal.aborted, true);
  assert.equal(tree.props.snapshot, undefined);
  assert.equal(tree.props.fetchState, 'loading');
  current.resolve(snapshot(5.2)); await flush();
  old.resolve(snapshot(4.31)); await flush();
  tree = h.render();
  assert.equal(tree.props.snapshot.metrics.us10y.value, 5.2);
  h.props.ctx = { userId: '' };
  tree = h.render();
  assert.equal(tree.props.snapshot, undefined);
  assert.equal(tree.props.fetchState, 'loading');
  service.calls.at(-1).reject(Object.assign(Error('login needed'), { code: 'AUTH_REQUIRED' })); await flush();
  assert.equal(h.render().props.fetchState, 'error');
});

test('unmount cancels the request, and an empty real response remains empty without mock fallback', async t => {
  const h = harness(t, { ctx: { userId: 'user-a' } });
  h.render();
  service.calls[0].resolve(snapshot(null)); await flush();
  let tree = h.render();
  assert.equal(tree.props.fetchState, 'empty');
  assert.equal(tree.props.snapshot.simulated, false);
  tree.props.onRetry(); h.render();
  const pending = service.calls[1];
  h.dispose();
  assert.equal(pending.options.signal.aborted, true);
  pending.resolve(snapshot(4.31)); await flush();
});

test('only explicit development preview can use mock or unauthenticated local data', t => {
  let h = harness(t, { mock: true, initialPage: 'inflation' }, true);
  let tree = h.render();
  assert.equal(service.calls.length, 0);
  assert.equal(tree.props.fetchState, undefined);
  assert.equal(tree.props.initialPage, 'inflation');
  h = harness(t, { mock: false }, true);
  h.render();
  assert.equal(service.calls[0].options.preview, true);
  h = harness(t, { ctx: { userId: 'user-a' }, mock: true }, true);
  tree = h.render();
  assert.equal(service.calls[0].options.preview, false, 'the real app remains authenticated even on a dev server');
  assert.equal(tree.props.fetchState, 'loading');
});
