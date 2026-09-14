import { normalizeStockDecisionSymbol } from './stockDecision.js';

const MODEL_VERSION = 'earnings-valuation-v2';
const SUPPORTED = ['MSFT', 'NVDA', 'META'];
const SCENARIOS = ['cautious', 'base', 'optimistic'];
const MULTIPLES = [20, 25, 30];
const CACHE_MS = 5 * 60 * 1000;
const snapshots = new Map();
const requests = new Set();
let activeUser = null;
let sessionRevision = 0;
let authSubscribed = false;

const fail = code => Object.assign(new Error(code), { code });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, maximum = 500) => typeof value === 'string' && !!value.trim() && value.length <= maximum;
const bilingual = value => record(value) && text(value.zh, 2000) && text(value.en, 2000);
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');

function officialSource(source, symbol) {
  if (!record(source) || !text(source.title) || !text(source.url, 2000)) return false;
  try {
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const cik = { MSFT: '789019', NVDA: '1045810', META: '1326801' }[symbol];
    if (!cik) return false;
    if (url.hostname === 'data.sec.gov') {
      return !url.search && !url.hash && url.pathname === `/api/xbrl/companyfacts/CIK${cik.padStart(10, '0')}.json`;
    }
    if (url.hostname === 'www.sec.gov') {
      return new RegExp(`^/Archives/edgar/data/0*${cik}/`, 'i').test(url.pathname);
    }
    if (symbol === 'MSFT') return url.hostname === 'www.microsoft.com' && /^\/en-us\/investor(?:\/|$)/i.test(url.pathname);
    if (symbol === 'NVDA') return url.hostname === 'investor.nvidia.com'
      || (url.hostname === 'nvidianews.nvidia.com' && /^\/news\//.test(url.pathname));
    return symbol === 'META' && url.hostname === 'investor.atmeta.com';
  } catch { return false; }
}

function unsupported(symbol, now) {
  return {
    schemaVersion: 2, modelVersion: MODEL_VERSION, symbol, currency: 'USD', status: 'unsupported', reason: 'UNSUPPORTED_SYMBOL',
    checkedAt: new Date(now).toISOString(), verifiedAt: null, expiresAt: new Date(now + CACHE_MS).toISOString(), snapshotId: null,
    reportedPeriod: null, reportedAt: null, reportPeriodEnd: null, forecastPeriod: null, sources: [], scenarios: [],
    notes: { zh: '该股票尚无已核验的财报估值情景。', en: 'No verified earnings valuation scenarios are available for this stock.' },
  };
}

function expired(envelope) {
  return { ...envelope, status: 'pending', reason: 'CHECK_EXPIRED', snapshotId: null, forecastPeriod: null, scenarios: [],
    notes: { zh: '财报检查已过期，等待重新获取并解析最新财报。', en: 'The financial-data check has expired. Fetch and parse the latest report again.' } };
}

export function normalizeStockValuationData(value, { symbol, now = Date.now() } = {}) {
  const selected = normalizeStockDecisionSymbol(symbol);
  if (!selected || !record(value) || typeof now !== 'number' || !Number.isFinite(new Date(now).getTime())
    || value.schemaVersion !== 2 || value.modelVersion !== MODEL_VERSION || value.symbol !== selected
    || value.currency !== 'USD' || !['available', 'unsupported', 'pending'].includes(value.status)
    || !timestamp(value.checkedAt) || Date.parse(value.checkedAt) > now + 300000
    || !timestamp(value.expiresAt) || Date.parse(value.expiresAt) <= Date.parse(value.checkedAt)
    || (value.reason !== null && !text(value.reason, 200))
    || (value.verifiedAt !== null && (!date(value.verifiedAt) || value.verifiedAt > value.checkedAt.slice(0, 10)))
    || (value.reportedAt !== null && (!date(value.reportedAt) || value.reportedAt > value.checkedAt.slice(0, 10)))
    || (value.reportPeriodEnd !== null && (!date(value.reportPeriodEnd) || value.reportPeriodEnd > value.checkedAt.slice(0, 10)))
    || (value.reportPeriodEnd && value.reportedAt && value.reportPeriodEnd > value.reportedAt)
    || (value.reportedAt && value.verifiedAt && value.reportedAt > value.verifiedAt)
    || (value.reportedPeriod !== null && !text(value.reportedPeriod, 100))
    || !bilingual(value.notes) || !Array.isArray(value.scenarios)
    || !Array.isArray(value.sources) || value.sources.length > 8
    || !value.sources.every(source => officialSource(source, selected))) return null;
  const envelope = {
    schemaVersion: 2, modelVersion: MODEL_VERSION, symbol: selected, currency: 'USD', status: value.status, reason: value.reason,
    checkedAt: value.checkedAt, verifiedAt: value.verifiedAt, expiresAt: value.expiresAt, snapshotId: value.snapshotId,
    reportedPeriod: value.reportedPeriod, reportedAt: value.reportedAt, reportPeriodEnd: value.reportPeriodEnd,
    forecastPeriod: null,
    sources: value.sources.map(({ title, url }) => ({ title, url })), notes: { zh: value.notes.zh, en: value.notes.en },
  };
  if (value.status === 'unsupported') {
    if (!text(value.reason, 200) || value.snapshotId !== null || value.reportedPeriod !== null || value.reportedAt !== null
      || value.reportPeriodEnd !== null || value.forecastPeriod !== null || value.sources.length || value.scenarios.length) return null;
    return { ...envelope, scenarios: [] };
  }
  if (value.status === 'pending') {
    if (!SUPPORTED.includes(selected) || !text(value.reason, 200) || value.snapshotId !== null
      || value.forecastPeriod !== null || value.scenarios.length) return null;
    return { ...envelope, scenarios: [] };
  }
  if (!SUPPORTED.includes(selected) || ![null, 'guidance_constrained', 'history_based', 'conditional_growth'].includes(value.reason) || !date(value.verifiedAt)
    || !text(value.snapshotId, 200) || !text(value.reportedPeriod, 100)
    || !date(value.reportedAt) || !date(value.reportPeriodEnd)
    || !bilingual(value.forecastPeriod) || !date(value.forecastPeriod.start)
    || value.forecastPeriod.start <= value.reportPeriodEnd
    || (value.forecastPeriod.end !== null && (!date(value.forecastPeriod.end) || value.forecastPeriod.end <= value.forecastPeriod.start))
    || !value.sources.length) return null;
  envelope.forecastPeriod = { zh: value.forecastPeriod.zh, en: value.forecastPeriod.en, start: value.forecastPeriod.start, end: value.forecastPeriod.end };
  if (value.scenarios.length !== SCENARIOS.length) return null;
  const scenarios = [];
  for (const id of SCENARIOS) {
    const matching = value.scenarios.filter(scenario => record(scenario) && scenario.id === id);
    const scenario = matching[0];
    if (matching.length !== 1 || !positive(scenario.eps) || !Array.isArray(scenario.assumptions)
      || !scenario.assumptions.length || scenario.assumptions.length > 16
      || !scenario.assumptions.every(item => record(item) && bilingual(item.label) && text(item.value, 1000))
      || !Array.isArray(scenario.prices) || scenario.prices.length !== MULTIPLES.length) return null;
    const prices = [];
    for (const pe of MULTIPLES) {
      const matchingPrices = scenario.prices.filter(item => record(item) && item.pe === pe);
      const price = matchingPrices[0]?.price;
      if (matchingPrices.length !== 1 || !positive(price)
        || Math.abs(price - Math.round(scenario.eps * pe * 100) / 100) > 0.0000001) return null;
      prices.push({ pe, price });
    }
    scenarios.push({ id, eps: scenario.eps, assumptions: scenario.assumptions.map(({ label, value: assumption }) => ({ label: { zh: label.zh, en: label.en }, value: assumption })), prices });
  }
  if (scenarios[0].eps > scenarios[1].eps || scenarios[1].eps > scenarios[2].eps) return null;
  return Date.parse(value.expiresAt) <= now ? expired(envelope) : { ...envelope, scenarios };
}

export function clearStockDecisionValuationCache() {
  snapshots.clear();
  sessionRevision += 1;
  for (const controller of requests) controller.abort(fail('AUTH_REQUIRED'));
}

function observeUser(userId) {
  if (userId !== activeUser || !userId) {
    clearStockDecisionValuationCache();
    activeUser = userId || null;
  }
}

async function defaultSession() {
  const { supabase } = await import('./supabase.js');
  if (!authSubscribed && supabase) {
    supabase.auth.onAuthStateChange((event, session) => observeUser(event === 'SIGNED_OUT' ? null : session?.user?.id || null));
    authSubscribed = true;
  }
  return supabase?.auth.getSession();
}

function abortError(signal) {
  return ['AUTH_REQUIRED', 'NETWORK_ERROR', 'REQUEST_ABORTED'].includes(signal?.reason?.code)
    ? signal.reason : fail('REQUEST_ABORTED');
}

async function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) throw abortError(signal);
  let listener;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      listener = () => reject(abortError(signal));
      signal.addEventListener('abort', listener, { once: true });
      if (signal.aborted) listener();
    })]);
  } finally { if (listener) signal.removeEventListener('abort', listener); }
}

export async function loadStockValuation({ userId, symbol, signal, getSession = defaultSession,
  fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 25000 } = {}) {
  if (typeof userId !== 'string' || !userId.trim()) { observeUser(null); throw fail('AUTH_REQUIRED'); }
  if (signal?.aborted) throw fail('REQUEST_ABORTED');
  const selected = normalizeStockDecisionSymbol(symbol);
  if (!selected) throw fail('INVALID_SYMBOL');
  const assertSession = async currentSignal => {
    const revision = sessionRevision;
    const result = await abortable(Promise.resolve().then(getSession).catch(() => null), currentSignal);
    const session = result?.data?.session;
    const actualUser = !result?.error && session?.access_token && typeof session.user?.id === 'string' ? session.user.id : null;
    if (revision !== sessionRevision && activeUser !== actualUser) throw fail('AUTH_REQUIRED');
    observeUser(actualUser);
    if (actualUser !== userId) throw fail('AUTH_REQUIRED');
    return session;
  };
  const session = await assertSession(signal);
  if (!SUPPORTED.includes(selected)) return unsupported(selected, now());
  const revision = sessionRevision;
  const key = `${userId}:${selected}`;
  const cached = snapshots.get(key);
  if (cached?.until > now()) {
    const data = normalizeStockValuationData(cached.data, { symbol: selected, now: now() });
    if (data) return data;
    snapshots.delete(key);
  }
  if (typeof fetchImpl !== 'function') throw fail('NETWORK_ERROR');
  const controller = new AbortController();
  const onAbort = () => controller.abort(fail('REQUEST_ABORTED'));
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  requests.add(controller);
  const timer = setTimeout(() => controller.abort(fail('NETWORK_ERROR')), timeoutMs);
  try {
    const data = await abortable((async () => {
      if (controller.signal.aborted) throw abortError(controller.signal);
      const response = await fetchImpl(`/api/quote?view=stock-valuation&symbol=${encodeURIComponent(selected)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store', signal: controller.signal,
      });
      if ([401, 403].includes(response.status)) throw fail('AUTH_REQUIRED');
      if (!response.ok) throw fail(response.status === 429 ? 'RATE_LIMITED' : 'NETWORK_ERROR');
      const body = await response.json().catch(() => null);
      const normalized = body?.success === true && normalizeStockValuationData(body.data, { symbol: selected, now: now() });
      if (!normalized) throw fail('INVALID_DATA');
      return normalized;
    })(), controller.signal);
    await assertSession(controller.signal);
    if (sessionRevision !== revision) throw fail('AUTH_REQUIRED');
    snapshots.set(key, { data, until: Math.min(now() + CACHE_MS, Date.parse(data.expiresAt)) });
    return data;
  } catch (error) {
    const code = ['AUTH_REQUIRED', 'REQUEST_ABORTED', 'NETWORK_ERROR', 'RATE_LIMITED', 'INVALID_DATA'].includes(error?.code) ? error.code : 'NETWORK_ERROR';
    if (code === 'AUTH_REQUIRED' && sessionRevision === revision && activeUser === userId) clearStockDecisionValuationCache();
    throw fail(code);
  } finally {
    clearTimeout(timer);
    requests.delete(controller);
    signal?.removeEventListener('abort', onAbort);
  }
}
