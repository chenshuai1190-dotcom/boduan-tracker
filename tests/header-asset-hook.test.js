import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as snapshotModel from '../src/lib/headerAssetSnapshot.js';
import { deriveInvestmentSummary } from '../src/lib/investmentSummary.js';

const source = readFileSync(new URL('../src/lib/useHeaderAssetSnapshot.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const hookBody = source.replace(/import[\s\S]*?from\s+['"][^'"]+['"];\s*/g, '')
  .replace('export function useHeaderAssetSnapshot', 'function useHeaderAssetSnapshot');

function localDate(now) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function eventTarget(extra = {}) {
  const listeners = new Map();
  return {
    ...extra, listeners,
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
    dispatch(name) { for (const callback of listeners.get(name) || []) callback(); },
  };
}

// Execute the unmodified hook body with persistent hook slots and real model
// functions. Effects run after each render and clean up when dependencies change.
function createHost(t, initialNow) {
  let now = initialNow;
  t.mock.method(Date, 'now', () => now);
  const slots = [];
  let cursor = 0;
  let effects = [];
  const timers = new Map();
  const stored = new Map();
  const storage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  const window = eventTarget({
    setInterval(callback, delay) { const id = timers.size + 1; timers.set(id, { callback, delay }); return id; },
    clearInterval(id) { timers.delete(id); },
  });
  const document = eventTarget({ hidden: false });
  const sameDeps = (left, right) => Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const useMemo = (factory, deps) => {
    const index = cursor++;
    if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { value: factory(), deps };
    return slots[index].value;
  };
  const dependencies = {
    ...snapshotModel, window, document,
    fetch: () => assert.fail('the header presentation hook must not fetch'),
    readHeaderAssetSnapshot: args => snapshotModel.readHeaderAssetSnapshot({ ...args, storage }),
    writeHeaderAssetSnapshot: args => snapshotModel.writeHeaderAssetSnapshot({ ...args, storage }),
    useMemo,
    useCallback: (callback, deps) => useMemo(() => callback, deps),
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      const slot = slots[index];
      return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (slots[index] && sameDeps(slots[index].deps, deps)) return;
      effects.push(() => {
        slots[index]?.cleanup?.();
        slots[index] = { deps, cleanup: callback() };
      });
    },
  };
  const hook = new Function('dependencies', `const { ${Object.keys(dependencies).join(', ')} } = dependencies; ${hookBody}; return useHeaderAssetSnapshot;`)(dependencies);
  const host = {
    window, document, timers, stored,
    now: () => now,
    setNow(value) { now = value; },
    render(props) {
      cursor = 0;
      effects = [];
      const result = hook(props);
      for (const effect of effects) effect();
      return result;
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
  t.after(() => host.unmount());
  return host;
}

const CLOSED = Date.parse('2026-09-12T05:00:00Z');
const PRE = Date.parse('2026-09-11T12:00:00Z');
const stockTrades = Object.freeze([
  Object.freeze({ id: 1, symbol: 'NVDA', side: 'buy', shares: 10, price: 100, date: '2026-09-01' }),
]);

function props(now, overrides = {}) {
  return { userId: 'header-hook-user', stockTrades, cashUsd: 500, marginDebtUsd: 200,
    usdRate: 7.2, ready: true, currency: 'CNY', fxDateKey: localDate(now),
    quoteRows: [], ...overrides };
}

function officialQuote(now) {
  const context = snapshotModel.headerAssetSessionContext(now);
  return Object.freeze({
    symbol: 'NVDA', source: 'EODHD', price: 120, timestamp: (now - 1000) / 1000,
    dailyPnlPrice: 120, dailyPnlPriceDate: context.live ? '' : context.closeDate,
    dailyPnlBaselineClose: 110, dailyPnlBaselineDate: context.baselineDate,
    dailyPnlBaselineSource: 'eodhd-adjusted-close',
    dailyPnlSource: context.live ? `realtime-${context.session}` : 'eodhd-adjusted-close',
    dailyPnlSession: context.session, dailyPnlLocked: !context.live,
  });
}

function loadOfficial(host, input) {
  const initial = host.render(input);
  initial.acceptBaselineQuotes([officialQuote(host.now())], host.now());
  return host.render(input);
}

test('CNY default rate without successful FX metadata cannot reveal a header', t => {
  const host = createHost(t, CLOSED);
  const input = props(CLOSED, { fxDateKey: '' });
  assert.equal(loadOfficial(host, input).snapshot, null);
  assert.equal(host.stored.size, 0);
  assert.equal(host.render({ ...input, fxDateKey: '2099-01-01' }).snapshot, null);
  const loaded = host.render({ ...input, fxDateKey: localDate(CLOSED) }).snapshot;
  assert.equal(loaded.summary.totalAssetsCny, 12_240);
  assert.equal(host.render({ ...input, currency: 'USD' }).snapshot.summary.totalAssetsUsd, 1700,
    'USD assets do not depend on an FX response');
});

test('a successfully loaded earlier FX rate remains usable across local midnight', t => {
  const beforeMidnight = new Date(2026, 8, 12, 23, 59, 0).getTime();
  const host = createHost(t, beforeMidnight);
  const input = props(beforeMidnight, { fxDateKey: localDate(beforeMidnight - 86400_000) });
  const before = loadOfficial(host, input).snapshot;
  assert.ok(before);
  host.setNow(beforeMidnight + 120_000);
  assert.notEqual(localDate(host.now()), localDate(beforeMidnight));
  host.window.dispatch('focus');
  const after = host.render(input).snapshot;
  assert.ok(after, 'midnight does not discard an already known exchange rate');
  assert.equal(after.summary.totalAssetsCny, before.summary.totalAssetsCny);
  assert.equal(after.basisKey, before.basisKey);
});

test('changing FX immediately recomputes a complete same-source valuation with a new basis', t => {
  const host = createHost(t, CLOSED);
  const input = props(CLOSED);
  const previous = loadOfficial(host, input).snapshot;
  const changed = host.render({ ...input, usdRate: 7.3 }).snapshot;
  assert.notEqual(changed.basisKey, previous.basisKey);
  assert.equal(changed.summary.usdRate, 7.3);
  assert.equal(changed.summary.totalAssetsUsd, previous.summary.totalAssetsUsd);
  assert.equal(changed.summary.totalAssetsCny, 12_410);
  assert.equal(previous.summary.totalAssetsCny, 12_240, 'the previous complete snapshot is not mutated');
});

test('a changed FX basis cannot reuse a retained live snapshot after its quotes age out', t => {
  const host = createHost(t, PRE);
  const input = props(PRE);
  const previous = loadOfficial(host, input).snapshot;
  assert.ok(previous);
  host.setNow(PRE + 31 * 60_000);
  host.window.dispatch('focus');
  assert.equal(host.render(input).snapshot, previous, 'partial refresh retains the last complete same-basis display');
  const changed = { ...input, usdRate: 7.3 };
  assert.equal(host.render(changed).snapshot, null, 'a new FX basis must not display a stale converted amount');
  const refreshed = loadOfficial(host, changed).snapshot;
  assert.equal(refreshed.summary.totalAssetsCny, 12_410);
  assert.notEqual(refreshed.basisKey, previous.basisKey);
});

test('the hook never replaces the shared summary, ledger or quote inputs', t => {
  const host = createHost(t, CLOSED);
  const sharedRows = Object.freeze([Object.freeze({ symbol: 'NVDA', price: 99 })]);
  const sharedSummary = Object.freeze(deriveInvestmentSummary({ stockTrades, watchlist: sharedRows, cashUsd: 500, usdRate: 7.2 }));
  const input = Object.freeze(props(CLOSED, { quoteRows: sharedRows, investmentSummary: sharedSummary }));
  const original = JSON.stringify(input);
  const result = loadOfficial(host, input);
  assert.equal(JSON.stringify(input), original);
  assert.equal(input.investmentSummary, sharedSummary);
  assert.notEqual(result.snapshot.summary.totalAssetsUsd, sharedSummary.totalAssetsUsd);
  assert.deepEqual(Object.keys(result).sort(), ['acceptBaselineQuotes', 'snapshot']);
  assert.equal(Object.hasOwn(result.snapshot.summary, 'positions'), false);
  assert.equal(Object.hasOwn(result.snapshot.summary, 'trades'), false);
});

test('presentation timers and resume events recheck eligibility without starting requests', t => {
  const host = createHost(t, CLOSED);
  const input = props(CLOSED);
  loadOfficial(host, input);
  assert.deepEqual([...host.timers.values()].map(timer => timer.delay), [15_000]);
  for (const event of ['pageshow', 'focus']) {
    host.window.dispatch(event);
    assert.ok(host.render(input).snapshot);
  }
  host.document.dispatch('visibilitychange');
  for (const timer of host.timers.values()) timer.callback();
  assert.ok(host.render(input).snapshot);
  host.unmount();
  assert.equal(host.timers.size, 0);
  assert.ok([...host.window.listeners.values(), ...host.document.listeners.values()].every(listeners => listeners.size === 0));
  assert.doesNotMatch(source, /\bfetch\s*\(|supabase|setQuoteCache|setStockTrades|setInvestmentSummary/);
});

test('App initializes portfolio currency before invoking the header hook', () => {
  const currency = appSource.indexOf('const [portfolioCurrencyMode, setPortfolioCurrencyModeState]');
  const header = appSource.indexOf('= useHeaderAssetSnapshot({');
  assert.ok(currency >= 0 && header > currency, 'currency has no temporal-dead-zone access on the real App path');
  const hookCall = appSource.slice(header, appSource.indexOf('\n  });', header));
  assert.match(hookCall, /currency: portfolioCurrencyMode/);
  assert.match(hookCall, /fxDateKey: headerFxDateKey/);
  assert.match(hookCall, /quoteRows: quoteCache/);
  assert.doesNotMatch(hookCall, /investmentSummary|setQuoteCache|setStockTrades/);
});
