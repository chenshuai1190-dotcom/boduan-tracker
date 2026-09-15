import { getInvestmentComparisonExpectedCloseDate } from './investmentComparison.js';
import { isStockRsiLifecycleSignal } from './stockRsiSignal.js';
import { STOCK_RSI_DIVERGENCE_VERSION, STOCK_RSI_RULES } from './stockRsiConfig.js';

const snapshots = new Map();
const pending = new Map();
const failures = new Map();
const MAX_ENTRIES = 32;
const CACHE_MS = 6 * 60 * 60 * 1000;
const fail = code => Object.assign(new Error(code), { code });
const finite = value => typeof value === 'number' && Number.isFinite(value);
const nullableNumber = value => value === null || finite(value);
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function normalizeStockDecisionSymbol(value) {
  if (typeof value !== 'string') return '';
  const symbol = value.trim().toUpperCase().replace(/\.US$/, '');
  return /^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)?$/.test(symbol) && symbol.length <= 15
    && !/\.(?:INDX|FOREX|CC|HK|LSE|TO)$/.test(symbol) ? symbol : '';
}

function validZone(zone, asOf) {
  return zone === null || (zone && finite(zone.lower) && zone.lower > 0 && finite(zone.upper)
    && zone.upper >= zone.lower && Number.isInteger(zone.touches) && zone.touches > 0
    && Array.isArray(zone.pivots) && zone.pivots.length > 0 && zone.pivots.every(pivot =>
      pivot && date(pivot.date) && date(pivot.confirmedAt) && pivot.date < pivot.confirmedAt
      && pivot.confirmedAt <= asOf && finite(pivot.price) && pivot.price > 0));
}

function normalizeValuationClose(value, asOf) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && finite(value.price) && value.price > 0 && value.date === asOf && value.basis === 'unadjusted_close'
    ? { price: value.price, date: value.date, basis: value.basis } : null;
}

export function normalizeStockDecisionData(value, { symbol, now = Date.now() } = {}) {
  const expected = getInvestmentComparisonExpectedCloseDate(now);
  if (!value || value.schemaVersion !== 1 || value.source !== 'EODHD'
    || value.symbol !== normalizeStockDecisionSymbol(symbol) || value.currency !== 'USD'
    || value.priceBasis !== 'adjusted_ohlc' || typeof value.name !== 'string' || !value.name.trim()
    || value.name.length > 300 || !date(value.asOf) || !date(value.expectedAsOfDate)
    || value.asOf > value.expectedAsOfDate || value.expectedAsOfDate > expected
    || typeof value.stale !== 'boolean' || (!value.stale && value.asOf !== value.expectedAsOfDate)
    || typeof value.fetchedAt !== 'string' || !Number.isFinite(Date.parse(value.fetchedAt))
    || Date.parse(value.fetchedAt) > now + 300000) return null;
  const model = value.model;
  if (!model || model.version !== 'stock-decision-v1' || model.asOf !== value.asOf
    || !nullableNumber(model.price) || (model.price !== null && model.price <= 0)
    || !nullableNumber(model.changePct) || !Array.isArray(model.history) || model.history.length > 500
    || !['pause', 'wait', 'observe', 'insufficient'].includes(model.verdict)
    || !Array.isArray(model.reasons) || !model.reasons.every(reason => typeof reason === 'string')) return null;
  let previous = '';
  for (const row of model.history) {
    if (!row || !date(row.date) || row.date <= previous || row.date > value.asOf || !finite(row.close) || row.close <= 0) return null;
    previous = row.date;
  }
  if (model.history.length && (model.history.at(-1).date !== value.asOf || model.history.at(-1).close !== model.price)) return null;
  if (!model.history.length && (model.price !== null || model.verdict !== 'insufficient')) return null;
  if (!model.trend || !['uptrend', 'downtrend', 'recovery', 'rebound', 'mixed', 'insufficient'].includes(model.trend.state)
    || !nullableNumber(model.trend.lastHigh) || !nullableNumber(model.trend.lastLow)) return null;
  const position = model.position;
  if (!position || !['above_support', 'near_resistance', 'support_broken', 'inside_zone', 'unavailable'].includes(position.state)
    || !nullableNumber(position.atr) || !['support', 'resistance', 'brokenSupport'].every(key => validZone(position[key], value.asOf))) return null;
  const volume = model.volume;
  if (!volume || !['breakout', 'continuation', 'pullback', 'weakness', 'low_rebound', 'neutral', 'insufficient'].includes(volume.state)
    || !nullableNumber(volume.ratio) || !nullableNumber(volume.medianRatio)
    || (volume.ratio !== null && volume.ratio < 0) || (volume.medianRatio !== null && volume.medianRatio < 0)) return null;
  if (volume.breakout !== null) {
    const event = volume.breakout;
    if (!event || !date(event.date) || event.date > value.asOf || !Number.isInteger(event.ageBars) || event.ageBars < 0
      || !finite(event.lower) || event.lower <= 0 || !finite(event.upper) || event.upper < event.lower
      || !finite(event.ratio) || event.ratio < 1.2 || typeof event.active !== 'boolean') return null;
  }
  const momentum = model.momentum;
  if (!isStockRsiLifecycleSignal(momentum, { asOf: value.asOf })
    || (momentum.value !== null && momentum.asOf !== value.asOf)) return null;
  const lifecycleRequiresPause = momentum.divergenceState === 'CONFIRMED'
    || momentum.divergenceState === 'FORMING' && momentum.value !== null && momentum.value >= STOCK_RSI_RULES.RSI_OVERBOUGHT;
  if (lifecycleRequiresPause && model.verdict !== 'pause') return null;
  if (model.verdict === 'observe' && (model.price === null || model.trend.state === 'insufficient'
    || momentum.value === null || momentum.divergenceState === null || momentum.divergenceState === 'FORMING'
    || volume.state === 'insufficient' || volume.ratio === null || volume.medianRatio === null
    || position.state === 'unavailable' || position.atr === null || position.atr <= 0)) return null;
  return { ...value, valuationClose: normalizeValuationClose(value.valuationClose, value.asOf), expectedAsOfDate: expected, stale: value.stale || value.asOf < expected };
}

function put(map, key, value) {
  map.delete(key); map.set(key, value);
  while (map.size > MAX_ENTRIES) map.delete(map.keys().next().value);
}

async function defaultSession() {
  const { supabase } = await import('./supabase.js');
  return supabase?.auth.getSession();
}

async function request({ symbol, token, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(`/api/quote?view=stock-decision&symbol=${encodeURIComponent(symbol)}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
        });
        if ([401, 403].includes(response.status)) throw fail('AUTH_REQUIRED');
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const codes = ['INVALID_SYMBOL', 'INVALID_PARAMETERS', 'UNSUPPORTED_INSTRUMENT', 'INSUFFICIENT_DATA', 'INVALID_DATA', 'QUOTA_EXHAUSTED', 'RATE_LIMITED'];
          throw fail(codes.includes(body?.details?.code) ? body.details.code : response.status === 429 ? 'RATE_LIMITED' : 'NETWORK_ERROR');
        }
        if (body?.success !== true) throw fail('INVALID_DATA');
        return body.data;
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(fail('NETWORK_ERROR')); }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function loadStockDecision({ userId, symbol, force = false, signal, getSession = defaultSession,
  fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 24000 } = {}) {
  if (typeof userId !== 'string' || !userId.trim()) throw fail('AUTH_REQUIRED');
  const selected = normalizeStockDecisionSymbol(symbol);
  if (!selected) throw fail('INVALID_SYMBOL');
  const assertSession = async () => {
    const result = await getSession().catch(() => null);
    const session = result?.data?.session;
    if (result?.error || !session?.access_token || session.user?.id !== userId) throw fail('AUTH_REQUIRED');
    if (signal?.aborted) throw fail('REQUEST_ABORTED');
    return session;
  };
  const session = await assertSession();
  const timestamp = now();
  const key = `${STOCK_RSI_DIVERGENCE_VERSION}:${userId}:${selected}:${getInvestmentComparisonExpectedCloseDate(timestamp)}`;
  const cached = snapshots.get(key);
  if (failures.get(key)?.until > timestamp) {
    if (cached) return { ...cached.data, stale: true };
    throw fail(failures.get(key).code);
  }
  if (!force && cached?.expiresAt > timestamp) return cached.data;
  if (!pending.has(key)) {
    if (pending.size >= MAX_ENTRIES) throw fail('RATE_LIMITED');
    const promise = request({ symbol: selected, token: session.access_token, fetchImpl, timeoutMs })
      .then(raw => {
        const data = normalizeStockDecisionData(raw, { symbol: selected, now: now() });
        if (!data) throw fail('INVALID_DATA');
        return data;
      });
    pending.set(key, promise);
    promise.finally(() => { if (pending.get(key) === promise) pending.delete(key); }).catch(() => {});
  }
  let abortListener;
  try {
    const promise = pending.get(key);
    const data = signal ? await Promise.race([promise, new Promise((_, reject) => {
      abortListener = () => reject(fail('REQUEST_ABORTED'));
      signal.addEventListener('abort', abortListener, { once: true });
      if (signal.aborted) abortListener();
    })]) : await promise;
    await assertSession();
    const latest = snapshots.get(key)?.data;
    const retained = latest && (latest.asOf > data.asOf || (latest.asOf === data.asOf && latest.fetchedAt > data.fetchedAt));
    const result = retained ? { ...latest, stale: true } : data;
    put(snapshots, key, { data: result, expiresAt: now() + (result.stale ? 60000 : CACHE_MS) });
    failures.delete(key);
    return result;
  } catch (error) {
    if (['AUTH_REQUIRED', 'REQUEST_ABORTED'].includes(error.code)) { if (error.code === 'AUTH_REQUIRED') snapshots.delete(key); throw error; }
    await assertSession();
    const code = error.code || 'NETWORK_ERROR';
    put(failures, key, { code, until: now() + (['RATE_LIMITED', 'QUOTA_EXHAUSTED'].includes(code) ? 300000 : 60000) });
    if (cached && ['NETWORK_ERROR', 'RATE_LIMITED', 'QUOTA_EXHAUSTED'].includes(code)) {
      const stale = { ...cached.data, stale: true };
      put(snapshots, key, { data: stale, expiresAt: 0 });
      return stale;
    }
    throw fail(code);
  } finally { if (abortListener) signal?.removeEventListener('abort', abortListener); }
}
