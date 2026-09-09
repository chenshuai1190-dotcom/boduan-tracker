import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  beginDrawdownCacheRequest, clearDrawdownObservationCache, DRAWDOWN_CACHE_MAX_AGE_MS,
  DRAWDOWN_CACHE_MAX_BYTES, DRAWDOWN_CACHE_MAX_SYMBOLS, DRAWDOWN_CACHE_PREFIX,
  getDrawdownSnapshot, getDrawdownViewState, recordDrawdownFailure,
  resetDrawdownObservationMemoryCache, setDrawdownViewState, shouldRefreshDrawdown, storeDrawdownHistory,
} from '../src/lib/drawdownObservationCache.js';
import { deriveObservation, getSamePeriodReturn } from '../src/lib/drawdownObservationModel.js';
import { isRegularNyseHoliday } from '../src/lib/quoteRefreshPolicy.js';

const NOW = Date.parse('2026-09-09T12:00:00Z');
const NEXT_DAY = Date.parse('2026-09-10T12:00:00Z');
const key = (userId = 'user-a') => `${DRAWDOWN_CACHE_PREFIX}${encodeURIComponent(userId)}`;
const descriptor = (symbol = 'SPY', overrides = {}) => ({ symbol, name: symbol, inWatchlist: true, inHoldings: false, ...overrides });
function memoryStorage() {
  const values = new Map();
  return { values, reads: 0, getItem(name) { this.reads += 1; return values.get(name) ?? null; },
    setItem(name, value) { values.set(name, value); }, removeItem(name) { values.delete(name); } };
}
function instrument(symbol = 'SPY', overrides = {}) {
  const points = [];
  for (let cursor = Date.parse('2025-01-02T00:00:00Z'); cursor <= Date.parse('2026-09-08T00:00:00Z'); cursor += 86400000) {
    const date = new Date(cursor).toISOString().slice(0, 10);
    if (![0, 6].includes(new Date(cursor).getUTCDay()) && !isRegularNyseHoliday(date)) points.push({ date, close: 100 + points.length % 80 });
  }
  return { ...descriptor(symbol), version: 1, source: 'EODHD_EOD', type: 'ETF', currency: 'USD', priceBasis: 'adjusted_close',
    availableFromDate: points[0].date, asOfDate: '2026-09-08', expectedAsOfDate: '2026-09-08',
    fetchedAt: new Date(NOW).toISOString(), stale: false, staleReason: '', points, status: 'ready', error: null, ...overrides };
}
function save(storage, value = instrument(), overrides = {}) {
  return storeDrawdownHistory({ userId: 'user-a', instrument: value, storage, now: NOW, ...overrides });
}
function snapshot(storage, instruments = [descriptor()], overrides = {}) {
  return getDrawdownSnapshot({ userId: 'user-a', instruments, storage, now: NOW, ...overrides });
}
beforeEach(() => resetDrawdownObservationMemoryCache());

test('validated history reopens instantly and survives process reset without persisting personal inputs', () => {
  const storage = memoryStorage();
  const original = instrument('SPY', { quantity: 88, accountBalance: 123456, access_token: 'never-store-me', inHoldings: true });
  assert.equal(save(storage, original), true);
  const serialized = storage.getItem(key());
  for (const forbidden of ['quantity', 'accountBalance', 'access_token', 'never-store-me', 'inHoldings', 'inWatchlist']) assert.ok(!serialized.includes(forbidden));
  const first = snapshot(storage).instruments[0];
  assert.equal(first.status, 'ready');
  assert.equal(first.inHoldings, false);
  assert.equal(first.name, 'SPY');
  assert.equal(shouldRefreshDrawdown(first, NOW), false);
  resetDrawdownObservationMemoryCache();
  const cold = snapshot(storage, [descriptor('SPY', { inWatchlist: false, inHoldings: true })]);
  assert.equal(cold.completed, 1);
  assert.equal(cold.instruments[0].inWatchlist, false);
  assert.equal(cold.instruments[0].inHoldings, true);
  assert.deepEqual(cold.instruments[0].points, first.points);
  const readCount = storage.reads;
  snapshot(storage); snapshot(storage);
  assert.equal(storage.reads, readCount, 'warm snapshot does not re-read local storage');
});

test('cache lookup uses exactly the current identity and symbol universe, never another account membership', () => {
  const storage = memoryStorage(); save(storage);
  assert.equal(snapshot(storage, [descriptor()], { userId: 'user-b' }).instruments[0].status, 'loading');
  assert.equal(snapshot(storage, [descriptor('QQQ')]).instruments[0].status, 'loading');
  assert.equal(snapshot(storage, [], { userId: 'user-a' }).total, 0);
  assert.equal(snapshot(storage, [descriptor()], { userId: '' }).instruments[0].status, 'loading');
  assert.equal(save(storage, instrument(), { userId: '' }), false);
  const stored = JSON.parse(storage.getItem(key()));
  storage.setItem(key('user-b'), JSON.stringify(stored));
  resetDrawdownObservationMemoryCache();
  assert.equal(snapshot(storage, [descriptor()], { userId: 'user-b' }).instruments[0].status, 'loading');
});

test('compact histories retain a 52-week reference window with a preceding anchor and unchanged drawdown', () => {
  const storage = memoryStorage(), original = instrument(); save(storage, original);
  const row = snapshot(storage).instruments[0];
  assert.ok(row.points.length <= 320);
  assert.ok(row.points.length < original.points.length);
  assert.ok(row.points[0].date <= '2025-09-09');
  assert.equal(row.availableFromDate, row.points[0].date);
  for (const field of ['price', 'high', 'highDate', 'drawdownPct', 'historySufficient']) {
    assert.equal(deriveObservation(row)[field], deriveObservation(original)[field], field);
  }
  row.points[0].close = 99999;
  assert.notEqual(snapshot(storage).instruments[0].points[0].close, 99999, 'consumer mutation cannot corrupt cached history');
});

test('compaction preserves the exact 364-day high boundary and benchmark-relative return endpoints', () => {
  const storage = memoryStorage(), stock = instrument('NVDA'), benchmark = instrument('SPY');
  stock.points.find(point => point.date === '2025-09-08').close = 999;
  stock.points.find(point => point.date === '2025-09-09').close = 300;
  assert.equal(save(storage, stock), true);
  assert.equal(save(storage, benchmark), true);
  const [cachedStock, cachedBenchmark] = snapshot(storage, [descriptor('NVDA'), descriptor('SPY')]).instruments;
  const originalModel = deriveObservation(stock), compactModel = deriveObservation(cachedStock);
  assert.equal(originalModel.highDate, '2025-09-09');
  assert.equal(originalModel.high, 300);
  for (const field of ['high', 'highDate', 'drawdownPct', 'recoveryPct', 'reboundPct', 'historySufficient']) {
    assert.equal(compactModel[field], originalModel[field], field);
  }
  const originalRelative = getSamePeriodReturn(stock, originalModel.highDate, stock.asOfDate)
    - getSamePeriodReturn(benchmark, originalModel.highDate, stock.asOfDate);
  const cachedRelative = getSamePeriodReturn(cachedStock, compactModel.highDate, cachedStock.asOfDate)
    - getSamePeriodReturn(cachedBenchmark, compactModel.highDate, cachedStock.asOfDate);
  assert.equal(cachedRelative, originalRelative);
});

test('short histories retain their insufficient-history flag; unpersistable sparse history is never fabricated', () => {
  const storage = memoryStorage();
  const short = instrument(); short.points = short.points.filter(point => point.date >= '2026-05-01');
  short.availableFromDate = short.points[0].date;
  assert.equal(save(storage, short), true);
  assert.equal(deriveObservation(snapshot(storage).instruments[0]).historySufficient, false);
  const sparse = instrument('QQQ'); sparse.points = [sparse.points[0], sparse.points.at(-1)];
  assert.equal(save(storage, sparse), false, 'two valid full-history points need not yield two recent persistable observations');
  assert.deepEqual(snapshot(storage, [descriptor('QQQ')]).instruments[0].points, []);
  assert.equal(deriveObservation(sparse).price, sparse.points.at(-1).close, 'valid live history remains usable independently of persistence');
});

test('new market close marks cached history stale immediately and clears the previous-day retry cooldown', () => {
  const storage = memoryStorage(); save(storage);
  const old = snapshot(storage, [descriptor()], { now: NEXT_DAY }).instruments[0];
  assert.equal(old.asOfDate, '2026-09-08');
  assert.equal(old.expectedAsOfDate, '2026-09-09');
  assert.equal(old.stale, true);
  assert.equal(old.staleReason, 'incomplete_close');
  assert.equal(shouldRefreshDrawdown(old, NEXT_DAY), true);
  // A cooldown crossing publication cutoff must not suppress the new close.
  const nearCutoff = Date.parse('2026-09-09T19:59:59Z');
  recordDrawdownFailure({ userId: 'user-a', symbol: 'SPY', error: { code: 'NETWORK_ERROR' }, storage, now: nearCutoff });
  const afterCutoff = Date.parse('2026-09-09T20:00:01Z');
  const next = snapshot(storage, [descriptor()], { now: afterCutoff }).instruments[0];
  assert.equal(next.expectedAsOfDate, '2026-09-09');
  assert.equal(next.retryAt, 0);
  assert.equal(shouldRefreshDrawdown(next, afterCutoff), true);
});

test('provider stale flag survives fresh-looking dates and reload; stale retry is bounded to five minutes', () => {
  const storage = memoryStorage(); save(storage, instrument('SPY', { stale: true, staleReason: 'provider_unavailable' }));
  const row = snapshot(storage).instruments[0];
  assert.equal(row.stale, true);
  assert.equal(shouldRefreshDrawdown(row, NOW), false);
  assert.equal(shouldRefreshDrawdown(row, NOW + 300001), true);
  resetDrawdownObservationMemoryCache();
  const cold = snapshot(storage).instruments[0];
  assert.equal(cold.staleReason, 'provider_unavailable');
  assert.equal(shouldRefreshDrawdown(cold, NOW), false);
});

test('failed refresh retains useful values and explicit stale state; missing failures never turn into zero', () => {
  const storage = memoryStorage(); save(storage);
  assert.equal(recordDrawdownFailure({ userId: 'user-a', symbol: 'SPY', error: { code: 'NETWORK_ERROR', message: 'secret' }, storage, now: NOW }), true);
  const row = snapshot(storage).instruments[0];
  assert.equal(row.status, 'ready');
  assert.equal(row.stale, true);
  assert.equal(row.staleReason, 'provider_unavailable');
  assert.deepEqual(row.error, { code: 'NETWORK_ERROR' });
  assert.equal(shouldRefreshDrawdown(row, NOW + 59999), false);
  assert.equal(shouldRefreshDrawdown(row, NOW + 60000), true);
  assert.ok(!storage.getItem(key()).includes('secret'));
  recordDrawdownFailure({ userId: 'user-a', symbol: 'QQQ', error: { code: 'INVALID_DATA' }, storage, now: NOW });
  const missing = snapshot(storage, [descriptor('QQQ')]).instruments[0];
  assert.equal(missing.status, 'error');
  assert.deepEqual(missing.points, []);
  assert.equal(missing.asOfDate, null);
  assert.equal(shouldRefreshDrawdown(missing, NOW), false);
  assert.equal(shouldRefreshDrawdown(missing, NOW + 60000), true);
});

test('cache holds more than sixteen symbols and evicts only the least recently used at its bound', () => {
  const storage = memoryStorage();
  const symbols = Array.from({ length: DRAWDOWN_CACHE_MAX_SYMBOLS + 1 }, (_, index) => `SYM${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + index % 26)}`);
  for (const symbol of symbols.slice(0, -1)) assert.equal(save(storage, instrument(symbol)), true);
  assert.equal(snapshot(storage, symbols.slice(0, -1).map(symbol => descriptor(symbol))).completed, DRAWDOWN_CACHE_MAX_SYMBOLS);
  snapshot(storage, [descriptor(symbols[0])]);
  save(storage, instrument(symbols.at(-1)));
  assert.equal(snapshot(storage, [descriptor(symbols[0])]).instruments[0].status, 'ready');
  assert.equal(snapshot(storage, [descriptor(symbols[1])]).instruments[0].status, 'loading');
  assert.ok(storage.getItem(key()).length * 2 <= DRAWDOWN_CACHE_MAX_BYTES);
  resetDrawdownObservationMemoryCache();
  assert.equal(snapshot(storage, symbols.map(symbol => descriptor(symbol))).completed, DRAWDOWN_CACHE_MAX_SYMBOLS);
});

test('older responses cannot regress a newer close or a corrected snapshot', () => {
  const storage = memoryStorage(); save(storage);
  const later = instrument('SPY', { fetchedAt: new Date(NOW + 1000).toISOString() });
  later.points.at(-1).close = 222;
  assert.equal(save(storage, later, { now: NOW + 1000 }), true);
  assert.equal(save(storage, instrument(), { now: NOW + 2000 }), false);
  assert.equal(snapshot(storage, [descriptor()], { now: NOW + 2000 }).instruments[0].points.at(-1).close, 222);
  const older = instrument(); older.points.pop(); older.asOfDate = '2026-09-04'; older.stale = true; older.staleReason = 'incomplete_close';
  assert.equal(save(storage, older, { now: NOW + 2000 }), false);
});

test('malformed, future, raw-price, synthetic and expired entries fail closed without damaging valid data', () => {
  const storage = memoryStorage();
  for (const corrupt of [
    { source: 'SYNTHETIC' }, { priceBasis: 'close' }, { status: 'error' },
    { fetchedAt: new Date(NOW + 300001).toISOString() }, { currency: 'CNY' },
    { points: [{ date: '2026-09-04', close: null }, { date: '2026-09-08', close: 100 }] },
  ]) assert.equal(save(storage, instrument('SPY', corrupt)), false);
  save(storage);
  for (const raw of ['bad json', JSON.stringify({ version: 9 }), 'x'.repeat(DRAWDOWN_CACHE_MAX_BYTES / 2 + 1)]) {
    storage.setItem(key(), raw); resetDrawdownObservationMemoryCache();
    assert.equal(snapshot(storage).instruments[0].status, 'loading');
  }
  save(storage);
  const envelope = JSON.parse(storage.getItem(key())); envelope.entries[0].history.rows.at(-1).close = 0;
  storage.setItem(key(), JSON.stringify(envelope)); resetDrawdownObservationMemoryCache();
  assert.equal(snapshot(storage).instruments[0].status, 'loading');
  save(storage); resetDrawdownObservationMemoryCache();
  assert.equal(snapshot(storage, [descriptor()], { now: NOW + DRAWDOWN_CACHE_MAX_AGE_MS + 1 }).instruments[0].status, 'loading');
});

test('clear and memory reset invalidate late asynchronous tickets without affecting a different user', () => {
  const storage = memoryStorage(); save(storage); save(storage, instrument('QQQ'), { userId: 'user-b' });
  const ticket = beginDrawdownCacheRequest('user-a');
  clearDrawdownObservationCache('user-a', { storage });
  assert.equal(save(storage, instrument(), { ticket }), false);
  assert.equal(recordDrawdownFailure({ userId: 'user-a', symbol: 'SPY', ticket, now: NOW, storage }), false);
  assert.equal(snapshot(storage).instruments[0].status, 'loading');
  assert.equal(snapshot(storage, [descriptor('QQQ')], { userId: 'user-b' }).instruments[0].status, 'ready');
  assert.equal(storage.getItem(key()), null);
  assert.equal(save(storage, instrument(), { ticket: beginDrawdownCacheRequest('user-a') }), true);
  // Successful reauthentication/replacement releases the hydration tombstone.
  for (let index = 0; index < 5; index += 1) snapshot(storage, [], { userId: `other-${index}` });
  assert.equal(snapshot(storage).instruments[0].status, 'ready');
  const resetTicket = beginDrawdownCacheRequest('user-a'); resetDrawdownObservationMemoryCache();
  assert.equal(save(storage, instrument(), { ticket: resetTicket }), false);
});

test('unavailable storage, quota failures and failed deletion preserve safe memory behavior', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(save(storage), true);
  assert.equal(snapshot(storage).instruments[0].status, 'ready');
  clearDrawdownObservationCache('user-a', { storage });
  assert.equal(snapshot(storage).instruments[0].status, 'loading');
  const real = memoryStorage(); save(real);
  real.removeItem = () => { throw new Error('blocked'); };
  clearDrawdownObservationCache('user-a', { storage: real });
  assert.equal(snapshot(real).instruments[0].status, 'loading', 'failed disk removal cannot rehydrate within the invalidated process');
  const property = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked getter'); } });
    assert.doesNotThrow(() => getDrawdownSnapshot({ userId: 'new-user', instruments: [descriptor()], now: NOW }));
  } finally {
    if (property) Object.defineProperty(globalThis, 'localStorage', property); else delete globalThis.localStorage;
  }
});

test('view preferences are user-isolated, sanitized, mergeable and memory-only', () => {
  setDrawdownViewState('user-a', { scope: 'holdings', minDepth: 20, order: 'shallowest', scrollTop: 760, selectedSymbol: 'SECRET' });
  assert.deepEqual(getDrawdownViewState('user-a'), { scope: 'holdings', minDepth: 20, order: 'shallowest', scrollTop: 760 });
  assert.equal(getDrawdownViewState('user-b').scope, 'watchlist');
  setDrawdownViewState('user-a', { minDepth: 10, scrollTop: -1, order: 'invalid' });
  assert.deepEqual(getDrawdownViewState('user-a'), { scope: 'holdings', minDepth: 10, order: 'shallowest', scrollTop: 760 });
  const copy = getDrawdownViewState('user-a'); copy.scope = 'watchlist';
  assert.equal(getDrawdownViewState('user-a').scope, 'holdings');
  setDrawdownViewState('user-a', null);
  assert.equal(getDrawdownViewState('user-a').scope, 'watchlist');
});
