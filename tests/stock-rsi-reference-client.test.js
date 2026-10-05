import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { loadStockRsiReference, normalizeStockRsiQuote, stockRsiLocalDateKey } from '../src/lib/stockRsiReference.js';
import { deriveStockTradeMarketReference } from '../src/lib/stockTradeMarketReference.js';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const TODAY = stockRsiLocalDateKey(NOW);
const stockQuote = (symbol = 'META', patch = {}) => ({ symbol, price: 700, ...patch,
  stockRsi: { period: 6, priceBasis: 'adjusted_close', value: 83.6, asOf: '2026-10-02',
    previousValue: 78.1, previousAsOf: '2026-10-01', ...patch.stockRsi } });
// App's watchlist projection retains a display high but omits week52High.
// That high is deliberately different from the API's rolling 52-week high.
const appCachedQuote = (patch = {}) => stockQuote('META', { high: 999, price: 730,
  dailyPnlPrice: 720, dailyPnlLocked: true, dailyPnlSession: 'post', ...patch });
const completeQuote = (patch = {}) => appCachedQuote({ week52High: 800, ...patch });
const marketReference = quote => deriveStockTradeMarketReference({ symbol: 'META', quote });
const session = (id = 'user-a', token = 'token-a') => ({ data: { session: { user: { id }, access_token: token } } });
const response = rows => ({ ok: true, status: 200, json: async () => ({ success: true, data: rows }) });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const args = patch => ({ symbol: 'META', userId: 'user-a', getSession: async () => session(), tradeDate: TODAY,
  now: () => NOW, fetchImpl: async () => response([stockQuote()]), ...patch });

test('ordinary stock adapter normalizes the requested ticker and rejects another ticker or wrong RSI basis', async () => {
  for (const symbol of ['META', ' meta ', 'META.US', 'BRK-B']) {
    const normalized = symbol.includes('BRK') ? 'BRK-B' : 'META';
    let calls = 0;
    const result = await loadStockRsiReference(args({ symbol, fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, `/api/quote?symbols=${normalized}`);
      assert.equal(options.headers.Authorization, 'Bearer token-a');
      return response([stockQuote('AAPL'), stockQuote(normalized)]);
    } }));
    assert.equal(result.status, 'ready');
    assert.equal(result.quote.symbol, normalized);
    assert.equal(calls, 1);
  }
  const options = { symbol: 'META', tradeDate: TODAY, now: NOW };
  for (const quote of [stockQuote('AAPL'), stockQuote('META.US'), stockQuote('META', { error: 'bad' }),
    stockQuote('META', { stockRsi: { priceBasis: 'close' } })]) {
    assert.equal(normalizeStockRsiQuote(quote, options).reason, 'data-unavailable');
  }
  for (const symbol of ['', null, 'META,AAPL', 'META&view=stock-detail']) {
    assert.equal((await loadStockRsiReference(args({ symbol,
      getSession: async () => assert.fail('invalid symbol must not authenticate'),
      fetchImpl: async () => assert.fail('invalid symbol must not request') }))).status, 'unavailable');
  }
});

test('RSI missing, stale and historical references stay unknown while the same response can carry market data', async () => {
  const incomplete = stockQuote('META', { stockRsi: { value: null, previousValue: null } });
  const result = await loadStockRsiReference(args({ fetchImpl: async () => response([incomplete]) }));
  assert.equal(result.status, 'unavailable');
  assert.equal(result.observation, null);
  assert.equal(result.quote, incomplete);
  assert.equal(normalizeStockRsiQuote(stockQuote('META', { stockRsi: { asOf: '2026-10-01' } }),
    { symbol: 'META', tradeDate: TODAY, now: NOW }).reason, 'stale-data');
  assert.equal((await loadStockRsiReference(args({ tradeDate: '2026-10-02',
    getSession: async () => assert.fail('historical date must not authenticate') }))).reason, 'historical-unavailable');
});

test('a required market reference supplements App-shaped RSI caches unless their full market contract is ready', async () => {
  for (const [label, quote, requireMarketReference, expectedFetches] of [
    ['watchlist cache without rolling high', appCachedQuote(), true, 1],
    ['locked cache without completed-close price', completeQuote({ dailyPnlPrice: undefined }), true, 1],
    ['complete market and RSI cache', completeQuote(), true, 0],
    ['RSI-only consumer keeps its existing cache path', appCachedQuote(), false, 0],
  ]) {
    let calls = 0, authentications = 0;
    const result = await loadStockRsiReference(args({ quote, requireMarketReference,
      getSession: async () => { authentications += 1; return session(); },
      fetchImpl: async (url, options) => {
        calls += 1;
        assert.equal(url, '/api/quote?symbols=META');
        assert.equal(options.headers.Authorization, 'Bearer token-a');
        return response([completeQuote()]);
      },
    }));
    assert.equal(calls, expectedFetches, label);
    assert.equal(authentications, expectedFetches ? 2 : 1, `${label} must preserve authentication before reuse and after fetch`);
    assert.equal(result.observation.value, 83.6, label);
    if (requireMarketReference) {
      assert.equal(marketReference(result.quote).stockReady, true, label);
      assert.ok(Math.abs(marketReference(result.quote).stockDistanceFromHigh + 0.1) < 1e-12, label);
    }
  }
});

// Run the real hook and authenticated loader through controlled asynchronous
// responses. Only React's state/effect scheduler is replaced for Node tests.
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
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
export function useRef(initial) { return slots[cursor++] ||= { current: initial }; }
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
const hooks = await import(hooksUrl);
const hookSourceUrl = new URL('../src/lib/useStockRsiReference.js', import.meta.url);
const hookSource = readFileSync(hookSourceUrl, 'utf8').replace(/(from\s+)(['"])([^'"]+)\2/g,
  (_, prefix, _quote, path) => `${prefix}${JSON.stringify(path === 'react' ? hooksUrl : new URL(path, hookSourceUrl).href)}`);
const { useStockRsiReference } = await import(dataUrl(hookSource));
const settle = () => new Promise(resolve => setImmediate(resolve));

test('the real ordinary-stock reference requires market data only for buy entries', async () => {
  const probeUrl = dataUrl(`
    let call;
    export function useStockRsiReference(props) {
      call = props;
      return { observation: null, quote: null, status: 'unavailable', reason: '' };
    }
    export function lastCall() { return call; }
  `);
  const componentUrl = new URL('../src/components/StockLiveRsiReference.jsx', import.meta.url);
  const componentSource = readFileSync(componentUrl, 'utf8')
    .replace(/import StockRsiReference from ['"]\.\/StockRsiReference\.jsx['"];?/, "const StockRsiReference = 'stock-rsi-reference';")
    .replace(/(from\s+)(['"])([^'"]+)\2/g, (_, prefix, _quote, path) =>
      `${prefix}${JSON.stringify(path === 'react' ? import.meta.resolve('react') : probeUrl)}`);
  const compiled = await transformWithOxc(componentSource, 'StockLiveRsiReference.jsx', { jsx: { runtime: 'classic' } });
  const { default: StockLiveRsiReference } = await import(dataUrl(compiled.code));
  const { lastCall } = await import(probeUrl);
  const quote = appCachedQuote();
  const authClient = { getSession: async () => session() };
  for (const side of ['buy', 'sell']) {
    StockLiveRsiReference({ symbol: 'META', userId: 'user-a', authClient, tradeDate: TODAY, quote, side,
      renderMarketReference: () => null });
    const received = lastCall();
    assert.equal(received.requireMarketReference, side === 'buy');
    assert.equal(received.requestDelayMs, 500);
    assert.equal(received.symbol, 'META');
    assert.equal(received.userId, 'user-a');
    assert.equal(received.authClient, authClient);
    assert.equal(received.tradeDate, TODAY);
    assert.equal(received.quote, quote);
  }
  StockLiveRsiReference({ symbol: 'META', userId: 'user-a', authClient, tradeDate: TODAY, quote, side: 'buy' });
  assert.equal(lastCall().requireMarketReference, false, 'an RSI-only renderer must not request unused market fields');
});

function controlledTimeouts(t) {
  let clock = 0, nextId = 0;
  const timers = new Map();
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    const id = ++nextId;
    timers.set(id, { callback, due: clock + delay });
    return id;
  });
  t.mock.method(globalThis, 'clearTimeout', id => timers.delete(id));
  return milliseconds => {
    clock += milliseconds;
    for (const [id, timer] of [...timers]) if (timer.due <= clock) {
      timers.delete(id);
      timer.callback();
    }
  };
}

function harness(t, initial = {}) {
  hooks.reset();
  t.after(() => hooks.reset());
  t.mock.method(Date, 'now', () => NOW);
  const calls = [], listeners = new Set();
  let currentSession = session();
  const authClient = {
    getSession: async () => currentSession,
    onAuthStateChange: callback => {
      listeners.add(callback);
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    },
  };
  t.mock.method(globalThis, 'fetch', (url, options) => {
    const pending = deferred();
    calls.push({ url, options, resolve: rows => pending.resolve(response(rows)), reject: pending.reject });
    return pending.promise; // Deliberately ignore abort; production must discard late replies.
  });
  let props = { symbol: 'META', userId: 'user-a', authClient, tradeDate: TODAY, ...initial };
  return {
    calls,
    render(patch = {}) { props = { ...props, ...patch }; const value = hooks.render(useStockRsiReference, props); hooks.flush(); return value; },
    auth(next, event = 'SIGNED_IN') { currentSession = next; for (const callback of [...listeners]) callback(event, next?.data?.session); },
  };
}

test('switching the stock isolates pending replies and never exposes the previous stock for the new heading', async t => {
  const run = harness(t);
  assert.equal(run.render().quote, null);
  await settle();
  assert.equal(run.calls[0].url, '/api/quote?symbols=META');
  const switched = run.render({ symbol: 'NVDA' });
  assert.equal(switched.observation, null);
  assert.equal(switched.quote, null);
  assert.equal(run.calls[0].options.signal.aborted, true);
  await settle();
  assert.equal(run.calls[1].url, '/api/quote?symbols=NVDA');
  run.calls[1].resolve([stockQuote('NVDA', { stockRsi: { value: 29 } })]);
  await settle();
  assert.equal(run.render().observation.value, 29);
  run.calls[0].resolve([stockQuote('META')]);
  await settle();
  assert.equal(run.render().quote.symbol, 'NVDA');
  assert.equal(run.render().observation.value, 29);
});

test('identity changes revoke both references and prevent a late previous-account response from returning', async t => {
  const run = harness(t);
  run.render(); await settle();
  run.auth(session('user-b', 'token-b'));
  assert.equal(run.render().reason, 'auth-required');
  assert.equal(run.render().quote, null);
  run.render({ userId: 'user-b' }); await settle();
  assert.equal(run.calls[1].options.headers.Authorization, 'Bearer token-b');
  run.calls[0].resolve([stockQuote()]); await settle();
  assert.equal(run.render().observation, null);
  assert.equal(run.render().quote, null);
  run.calls[1].resolve([stockQuote('META', { price: 705, stockRsi: { value: 71 } })]); await settle();
  assert.equal(run.render().quote.price, 705);
  assert.equal(run.render().observation.value, 71);
  run.auth({ data: { session: null } }, 'SIGNED_OUT');
  assert.equal(run.render().observation, null);
  assert.equal(run.render().quote, null);
});

test('token refresh starts one credential scope and discards the response issued with the old token', async t => {
  const run = harness(t);
  run.render(); await settle();
  run.auth(session('user-a', 'token-new'), 'TOKEN_REFRESHED');
  assert.equal(run.render().quote, null);
  await settle();
  assert.equal(run.calls.length, 2);
  assert.equal(run.calls[1].options.headers.Authorization, 'Bearer token-new');
  run.calls[0].resolve([stockQuote()]); await settle();
  assert.equal(run.render().observation, null);
  run.calls[1].resolve([stockQuote('META', { stockRsi: { value: 30 } })]); await settle();
  assert.equal(run.render().observation.value, 30);
});

test('editing a historical date suppresses an in-flight current reference and reopening today can reuse it', async t => {
  const run = harness(t);
  run.render(); await settle();
  assert.equal(run.render({ tradeDate: '2026-10-02' }).reason, 'historical-unavailable');
  run.calls[0].resolve([stockQuote()]); await settle();
  assert.equal(run.render().quote, null);
  assert.equal(run.render().observation, null);
  assert.equal(run.render({ tradeDate: TODAY }).observation.value, 83.6);
  assert.equal(run.calls.length, 1);
});

test('missing RSI does not hide a valid market reference, but malformed, stale and different-symbol quotes cannot fill it', async t => {
  const run = harness(t, { requireMarketReference: true });
  run.render(); await settle();
  run.calls[0].resolve([completeQuote({ stockRsi: { value: null } })]); await settle();
  assert.equal(run.render().status, 'unavailable');
  assert.equal(run.render().observation, null);
  assert.equal(marketReference(run.render().quote).stockReady, true);
  assert.ok(Math.abs(marketReference(run.render().quote).stockDistanceFromHigh + 0.1) < 1e-12);
  for (const [symbol, patch] of [['NVDA', { stale: true }], ['AAPL', { error: 'provider unavailable' }]]) {
    run.render({ symbol }); await settle();
    run.calls.at(-1).resolve([stockQuote(symbol, patch)]); await settle();
    assert.equal(run.render().quote, null);
    assert.equal(run.render().observation, null);
  }
  run.render({ symbol: 'TSLA' }); await settle();
  run.calls.at(-1).resolve([stockQuote('META')]); await settle();
  assert.equal(run.render().quote, null);
});

test('the real hook supplements the sparse App cache once and keeps the fetched high through later cache renders', async t => {
  const cached = appCachedQuote();
  assert.equal(Object.hasOwn(cached, 'week52High'), false);
  assert.equal(normalizeStockRsiQuote(cached, { symbol: 'META', tradeDate: TODAY, now: NOW }).status, 'ready');
  assert.equal(marketReference(cached).stockReady, false, 'a display high alone cannot satisfy the market reference');
  const run = harness(t, { quote: cached, requireMarketReference: true, requestDelayMs: 500 });
  const advance = controlledTimeouts(t);
  assert.equal(run.render().quote, null, 'cached RSI must not bypass the authenticated scope');
  advance(500); await settle();
  assert.equal(run.calls.length, 1);
  assert.equal(run.calls[0].url, '/api/quote?symbols=META');
  assert.equal(run.calls[0].options.headers.Authorization, 'Bearer token-a');
  run.calls[0].resolve([completeQuote({ stockRsi: { value: null } })]); await settle();
  const result = run.render();
  assert.equal(result.status, 'ready', 'valid cached RSI survives a market-only supplementation');
  assert.equal(result.observation.value, 83.6);
  assert.ok(Math.abs(marketReference(result.quote).stockDistanceFromHigh + 0.1) < 1e-12);
  for (const patch of [{}, { quote: appCachedQuote() }, { quote: appCachedQuote({ price: 735 }) }]) {
    const rerendered = run.render(patch);
    assert.equal(rerendered.observation.value, 83.6);
    assert.ok(Math.abs(marketReference(rerendered.quote).stockDistanceFromHigh + 0.1) < 1e-12,
      'the sparse parent quote must not replace the fetched rolling high');
    advance(1000); await settle();
    assert.equal(run.calls.length, 1, 'input or cache rerenders must not poll the quote endpoint');
  }
});

test('the real hook reuses a complete authenticated cache without a supplementation request', async t => {
  const run = harness(t, { quote: completeQuote(), requireMarketReference: true, requestDelayMs: 500 });
  const advance = controlledTimeouts(t);
  assert.equal(run.render().quote, null);
  await settle();
  assert.equal(run.render().observation.value, 83.6);
  assert.ok(Math.abs(marketReference(run.render().quote).stockDistanceFromHigh + 0.1) < 1e-12);
  advance(1000); await settle();
  run.render({ quote: completeQuote({ dailyPnlPrice: 760 }) }); await settle();
  assert.ok(Math.abs(marketReference(run.render().quote).stockDistanceFromHigh + 0.05) < 1e-12);
  assert.equal(run.calls.length, 0);
});

test('a complete market cache with stale RSI cannot overwrite the newer fetched quote', async t => {
  const oldCache = completeQuote({ dailyPnlPrice: 760, stockRsi: { value: 60, asOf: '2026-10-01' } });
  assert.equal(marketReference(oldCache).stockReady, true);
  assert.equal(normalizeStockRsiQuote(oldCache, { symbol: 'META', tradeDate: TODAY, now: NOW }).reason, 'stale-data');
  const run = harness(t, { quote: oldCache, requireMarketReference: true });
  run.render(); await settle();
  assert.equal(run.calls.length, 1);
  run.calls[0].resolve([completeQuote()]); await settle();
  for (const patch of [{}, { quote: { ...oldCache } }]) {
    const result = run.render(patch);
    assert.equal(result.observation.value, 83.6);
    assert.equal(result.observation.asOf, '2026-10-02');
    assert.ok(Math.abs(marketReference(result.quote).stockDistanceFromHigh + 0.1) < 1e-12,
      'market-ready shape alone must not make an older parent cache override the refreshed response');
    await settle();
    assert.equal(run.calls.length, 1);
  }
});

test('supplementation cannot manufacture a high after missing data or network failure, and preserves valid RSI', async t => {
  for (const outcome of ['missing-high', 'network-failure']) {
    await t.test(outcome, async t => {
      const run = harness(t, { quote: appCachedQuote(), requireMarketReference: true });
      run.render(); await settle();
      assert.equal(run.calls.length, 1);
      if (outcome === 'network-failure') run.calls[0].reject(new Error('provider unavailable'));
      else run.calls[0].resolve([appCachedQuote({ high: 1200 })]);
      await settle();
      const result = run.render();
      assert.equal(result.status, 'ready');
      assert.equal(result.observation.value, 83.6);
      assert.equal(marketReference(result.quote).stockReady, false);
      assert.equal(marketReference(result.quote).stockDistanceFromHigh, null);
      run.render({ quote: appCachedQuote({ high: 1500 }) }); await settle();
      assert.equal(marketReference(run.render().quote).stockDistanceFromHigh, null);
      assert.equal(run.calls.length, 1, 'a missing market field must not create an automatic retry loop');
    });
  }
});

test('switching from RSI-only sell to market-required buy starts a new scope and ignores a late abandoned buy reply', async t => {
  const run = harness(t, { quote: appCachedQuote(), requireMarketReference: false });
  run.render(); await settle();
  assert.equal(run.render().observation.value, 83.6);
  assert.equal(run.calls.length, 0, 'sell and default TQQQ consumers do not fetch just for a missing high');
  const buy = run.render({ requireMarketReference: true });
  assert.equal(buy.quote, null, 'changing the market requirement must start a separate authenticated scope');
  await settle();
  assert.equal(run.calls.length, 1);
  run.render({ requireMarketReference: false }); await settle();
  assert.equal(run.calls[0].options.signal.aborted, true);
  run.calls[0].resolve([completeQuote()]); await settle();
  assert.equal(run.render().observation.value, 83.6);
  assert.equal(run.render().quote.week52High, undefined, 'an abandoned buy response must not cross into the sell scope');
  assert.equal(run.calls.length, 1);
});

test('qualified cached data still waits for authentication, never refetches on input edits, and clears on close', async t => {
  const run = harness(t, { quote: stockQuote(), requestDelayMs: 500 });
  controlledTimeouts(t);
  assert.equal(run.render().quote, null);
  await settle();
  assert.equal(run.render().observation.value, 83.6);
  assert.equal(run.calls.length, 0);
  assert.equal(run.render({ quote: stockQuote('META', { price: 701 }) }).quote.price, 701);
  assert.equal(run.calls.length, 0);
  assert.equal(run.render({ active: false }).quote, null);
  assert.equal(run.render().observation, null);
});

test('rapid quote updates do not postpone the single market supplementation beyond the ticker delay', async t => {
  const run = harness(t, { quote: appCachedQuote(), requireMarketReference: true, requestDelayMs: 500 });
  const advance = controlledTimeouts(t);
  run.render();
  for (let update = 1; update <= 4; update += 1) {
    advance(100);
    run.render({ quote: appCachedQuote({ price: 730 + update }) });
    await settle();
    assert.equal(run.calls.length, 0, 'the initial ticker delay still applies');
  }
  advance(99); await settle();
  assert.equal(run.calls.length, 0);
  advance(1); await settle();
  assert.equal(run.calls.length, 1, 'cache updates must not restart the original 500ms request deadline');
  assert.equal(run.calls[0].url, '/api/quote?symbols=META');
  run.render({ quote: appCachedQuote({ price: 735 }) });
  run.calls[0].resolve([completeQuote()]); await settle();
  assert.ok(Math.abs(marketReference(run.render().quote).stockDistanceFromHigh + 0.1) < 1e-12);
  advance(1000); await settle();
  assert.equal(run.calls.length, 1, 'further quote updates must not introduce polling');
});

test('typed symbol edits cancel the pending delay and issue one request only after the final symbol settles', async t => {
  const run = harness(t, { symbol: 'M', requestDelayMs: 500 });
  const advance = controlledTimeouts(t);
  run.render(); advance(250); await settle();
  assert.equal(run.calls.length, 0);
  run.render({ symbol: 'ME' }); advance(499); await settle();
  assert.equal(run.calls.length, 0);
  run.render({ symbol: 'META' }); advance(499); await settle();
  assert.equal(run.calls.length, 0);
  advance(1); await settle();
  assert.equal(run.calls.length, 1);
  assert.equal(run.calls[0].url, '/api/quote?symbols=META');
  run.calls[0].resolve([stockQuote()]); await settle();
  assert.equal(run.render().observation.value, 83.6);
  run.render({ symbol: 'NVDA' }); advance(200);
  run.render({ active: false }); advance(500); await settle();
  assert.equal(run.calls.length, 1, 'closing cancels a pending ticker request');
  assert.equal(run.render().quote, null);
});
