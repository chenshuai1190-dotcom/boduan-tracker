export const EARNINGS_GROWTH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const EARNINGS_GROWTH_TRANSIENT_CACHE_TTL_MS = 5 * 60 * 1000;
export const EARNINGS_GROWTH_ANNUAL_LIMIT = 6;
export const EARNINGS_GROWTH_QUARTERLY_LIMIT = 8;
export const EARNINGS_GROWTH_SCHEMA_VERSION = 3;
export const EARNINGS_GROWTH_STORAGE_VERSION = 2;
export const EARNINGS_GROWTH_STORAGE_PREFIX = 'xmoney_earnings_growth_v2';

const MAX_MEMORY_ENTRIES = 40;
const VALID_STATUSES = new Set(['complete', 'partial', 'unavailable']);
const memoryCache = new Map();
const inFlightRequests = new Map();

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeText(value, maxLength = 180) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizedSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase().replace(/\.US$/, '');
  return /^[A-Z0-9._-]{1,15}$/.test(symbol) ? symbol : '';
}

function normalizedCurrency(value) {
  const currency = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3,8}$/.test(currency) ? currency : '';
}

function validDateKey(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!match) return '';
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[1]
    ? match[1]
    : '';
}

function fiscalYearOrNull(value) {
  const match = String(value ?? '').trim().match(/^(?:FY)?(\d{4})$/i);
  if (!match) return null;
  const fiscalYear = Number(match[1]);
  return fiscalYear >= 1900 && fiscalYear <= 2300 ? fiscalYear : null;
}

function fiscalQuarterOrNull(value) {
  const match = String(value ?? '').trim().match(/^(?:Q)?([1-4])$/i);
  return match ? Number(match[1]) : null;
}

function normalizeSource(value) {
  if (typeof value === 'string') {
    const provider = safeText(value, 40);
    return provider ? { provider, label: '', asOfDate: '', url: '' } : null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const provider = safeText(value.provider || value.name || value.source, 40);
  const rawUrl = safeText(value.url || value.sourceUrl || value.filingUrl, 500);
  const url = /^https:\/\//i.test(rawUrl) ? rawUrl : '';
  const source = {
    provider,
    label: safeText(value.label, 80),
    asOfDate: validDateKey(value.asOfDate || value.fetchedAt?.slice?.(0, 10)),
    url,
  };
  return source.provider || source.label || source.url ? source : null;
}

function normalizePeriod(value, mode) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fiscalYear = fiscalYearOrNull(value.fiscalYear);
  const fiscalQuarter = mode === 'quarterly'
    ? fiscalQuarterOrNull(value.fiscalQuarter)
    : null;
  const startDate = validDateKey(value.startDate);
  const endDate = validDateKey(value.endDate);
  const revenue = finiteOrNull(value.revenue);
  const netIncome = finiteOrNull(value.netIncome);
  if (
    fiscalYear === null
    || (mode === 'quarterly' && fiscalQuarter === null)
    || !startDate
    || !endDate
    || startDate > endDate
    || revenue === null
    || revenue <= 0
    || netIncome === null
  ) {
    return null;
  }
  return {
    fiscalYear,
    fiscalQuarter,
    startDate,
    endDate,
    revenue,
    netIncome,
    netMarginPct: finiteOrNull(value.netMarginPct),
    revenueYoyPct: finiteOrNull(value.revenueYoyPct),
    netIncomeYoyPct: finiteOrNull(value.netIncomeYoyPct),
    netMarginChangePpt: finiteOrNull(value.netMarginChangePpt),
    revenueQoqPct: finiteOrNull(value.revenueQoqPct),
  };
}

function samePeriod(left, right) {
  return [
    'fiscalYear',
    'fiscalQuarter',
    'startDate',
    'endDate',
    'revenue',
    'netIncome',
    'netMarginPct',
    'revenueYoyPct',
    'netIncomeYoyPct',
    'netMarginChangePpt',
    'revenueQoqPct',
  ].every((key) => Object.is(left?.[key] ?? null, right?.[key] ?? null));
}

function normalizeSeries(values, mode, limit) {
  const byPeriod = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const period = normalizePeriod(value, mode);
    if (!period) continue;
    const key = mode === 'annual'
      ? String(period.fiscalYear)
      : `${period.fiscalYear}-Q${period.fiscalQuarter}`;
    const existing = byPeriod.get(key);
    if (!existing) {
      byPeriod.set(key, period);
      continue;
    }
    // A conflicting duplicate is ambiguous. Remove the whole period instead of
    // picking whichever provider row happened to arrive last.
    if (!samePeriod(existing, period)) byPeriod.set(key, null);
  }
  return Array.from(byPeriod.values())
    .filter(Boolean)
    .sort((left, right) => (
      left.endDate.localeCompare(right.endDate)
      || left.fiscalYear - right.fiscalYear
      || (left.fiscalQuarter || 0) - (right.fiscalQuarter || 0)
    ))
    .slice(-limit);
}

export function normalizeEarningsGrowthPayload(value, expectedSymbol = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.success === false) {
    return null;
  }
  const schemaVersion = Number.isInteger(value.schemaVersion)
    ? value.schemaVersion
    : null;
  const symbol = normalizedSymbol(value.symbol || expectedSymbol);
  const expected = normalizedSymbol(expectedSymbol);
  const status = VALID_STATUSES.has(value.status) ? value.status : '';
  const currency = normalizedCurrency(value.currency);
  if (
    schemaVersion !== EARNINGS_GROWTH_SCHEMA_VERSION
    || !symbol
    || (expected && symbol !== expected)
    || !status
    || (status !== 'unavailable' && !currency)
  ) {
    return null;
  }
  if (status === 'unavailable') {
    return {
      schemaVersion,
      status,
      reason: safeText(value.reason, 160),
      symbol,
      currency,
      source: normalizeSource(value.source),
      annual: [],
      quarterly: [],
    };
  }
  return {
    schemaVersion,
    status,
    reason: safeText(value.reason, 160),
    symbol,
    currency,
    source: normalizeSource(value.source),
    annual: normalizeSeries(value.annual, 'annual', EARNINGS_GROWTH_ANNUAL_LIMIT),
    quarterly: normalizeSeries(value.quarterly, 'quarterly', EARNINGS_GROWTH_QUARTERLY_LIMIT),
  };
}

export function earningsGrowthPeriodKey(period, mode = 'annual') {
  const fiscalYear = fiscalYearOrNull(period?.fiscalYear);
  if (fiscalYear === null) return '';
  if (mode === 'quarterly') {
    const fiscalQuarter = fiscalQuarterOrNull(period?.fiscalQuarter);
    return fiscalQuarter === null ? '' : `FY${fiscalYear}Q${fiscalQuarter}`;
  }
  return `FY${fiscalYear}`;
}

export function earningsGrowthPeriodLabel(period, mode = 'annual', { compact = false } = {}) {
  const fiscalYear = fiscalYearOrNull(period?.fiscalYear);
  if (fiscalYear === null) return '—';
  if (mode === 'quarterly') {
    const fiscalQuarter = fiscalQuarterOrNull(period?.fiscalQuarter);
    if (fiscalQuarter === null) return '—';
    return compact
      ? `${String(fiscalYear).slice(-2)}Q${fiscalQuarter}`
      : `FY${fiscalYear} Q${fiscalQuarter}`;
  }
  return compact ? `FY${String(fiscalYear).slice(-2)}` : `FY${fiscalYear}`;
}

export function calculateEarningsGrowthCagr(periods, field) {
  const rows = Array.isArray(periods) ? periods : [];
  if (rows.length < 2 || !['revenue', 'netIncome'].includes(field)) return null;
  const first = rows[0];
  const last = rows.at(-1);
  const firstValue = finiteOrNull(first?.[field]);
  const lastValue = finiteOrNull(last?.[field]);
  const firstYear = fiscalYearOrNull(first?.fiscalYear);
  const lastYear = fiscalYearOrNull(last?.fiscalYear);
  if (
    firstValue === null
    || lastValue === null
    || firstValue <= 0
    || lastValue <= 0
    || firstYear === null
    || lastYear === null
  ) {
    return null;
  }
  const intervals = lastYear - firstYear;
  if (intervals <= 0 || intervals !== rows.length - 1) return null;
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].fiscalYear !== rows[index - 1].fiscalYear + 1) return null;
  }
  const cagr = (Math.pow(lastValue / firstValue, 1 / intervals) - 1) * 100;
  return Number.isFinite(cagr) ? cagr : null;
}

export function buildEarningsGrowthSummary(data, mode = 'annual') {
  const normalizedMode = mode === 'quarterly' ? 'quarterly' : 'annual';
  const periods = normalizedMode === 'annual' ? data?.annual || [] : data?.quarterly || [];
  const latest = periods.at(-1) || null;
  if (normalizedMode === 'annual') {
    const first = periods[0] || null;
    const intervalCount = first && latest ? latest.fiscalYear - first.fiscalYear : 0;
    return {
      mode: normalizedMode,
      latest,
      periodText: first && latest
        ? `${earningsGrowthPeriodLabel(first)}—${earningsGrowthPeriodLabel(latest)}`
        : '—',
      intervalCount: intervalCount > 0 ? intervalCount : 0,
      revenueValue: calculateEarningsGrowthCagr(periods, 'revenue'),
      netIncomeValue: calculateEarningsGrowthCagr(periods, 'netIncome'),
    };
  }
  return {
    mode: normalizedMode,
    latest,
    periodText: latest ? earningsGrowthPeriodLabel(latest, 'quarterly') : '—',
    intervalCount: periods.length,
    revenueValue: finiteOrNull(latest?.revenueYoyPct),
    netIncomeValue: finiteOrNull(latest?.netIncomeYoyPct),
  };
}

function niceStep(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const fraction = value / power;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * power;
}

export function buildEarningsGrowthChartGeometry(periods, {
  mode = 'annual',
  width = mode === 'quarterly' ? 520 : 356,
  height = 185,
} = {}) {
  const rows = (Array.isArray(periods) ? periods : [])
    .filter((period) => (
      finiteOrNull(period?.revenue) !== null
      && finiteOrNull(period?.netIncome) !== null
    ));
  if (!rows.length) return null;
  const margin = { left: 35, right: 11, top: 15, bottom: 34 };
  const values = rows.flatMap((period) => [period.revenue, period.netIncome]);
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  const rawSpan = Math.max(rawMax - rawMin, Math.abs(rawMax), Math.abs(rawMin), 1);
  const paddedMin = rawMin < 0 ? rawMin - rawSpan * 0.14 : 0;
  const paddedMax = rawMax > 0 ? rawMax + rawSpan * 0.18 : rawSpan * 0.18;
  const step = niceStep((paddedMax - paddedMin) / 4);
  const domainMin = rawMin < 0 ? Math.floor(paddedMin / step) * step : 0;
  const domainMax = Math.max(step, Math.ceil(paddedMax / step) * step);
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const y = (value) => (
    margin.top + ((domainMax - value) / (domainMax - domainMin)) * plotHeight
  );
  const groupWidth = plotWidth / rows.length;
  const barWidth = Math.min(mode === 'quarterly' ? 12 : 16, groupWidth * 0.31);
  const barGap = Math.max(4, Math.min(6, groupWidth * 0.1));
  const zeroY = y(0);
  const groups = rows.map((period, index) => {
    const centerX = margin.left + groupWidth * (index + 0.5);
    const revenueX = centerX - barGap / 2 - barWidth;
    const netIncomeX = centerX + barGap / 2;
    const revenueY = y(period.revenue);
    const netIncomeY = y(period.netIncome);
    const bar = (value, valueY, x) => ({
      x,
      y: Math.min(zeroY, valueY),
      width: barWidth,
      height: Math.max(1, Math.abs(zeroY - valueY)),
      value,
      valueY,
    });
    const revenueLabelY = period.revenue >= 0 ? revenueY - 6 : revenueY + 12;
    const netIncomeLabelY = period.netIncome >= 0 ? netIncomeY - 6 : netIncomeY + 12;
    return {
      period,
      centerX,
      hitX: margin.left + groupWidth * index,
      hitWidth: groupWidth,
      revenue: bar(period.revenue, revenueY, revenueX),
      netIncome: bar(period.netIncome, netIncomeY, netIncomeX),
      revenueLabelY,
      netIncomeLabelY,
    };
  });
  const ticks = [];
  for (let value = domainMin; value <= domainMax + step * 0.01; value += step) {
    ticks.push(Object.is(value, -0) ? 0 : value);
  }
  return {
    width,
    height,
    ...margin,
    plotWidth,
    plotHeight,
    domainMin,
    domainMax,
    zeroY,
    y,
    groups,
    ticks,
  };
}

function nowValue(now) {
  const value = typeof now === 'function' ? now() : now;
  const number = Number(value);
  return Number.isFinite(number) ? number : Date.now();
}

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function identityKey(userId, symbol) {
  const normalizedUserId = String(userId || '').trim();
  const normalized = normalizedSymbol(symbol);
  return normalizedUserId && normalized ? `${normalizedUserId}:${normalized}` : '';
}

function storageKey(identity) {
  return `${EARNINGS_GROWTH_STORAGE_PREFIX}:${identity}`;
}

function setMemoryEntry(identity, entry) {
  if (memoryCache.has(identity)) memoryCache.delete(identity);
  memoryCache.set(identity, entry);
  while (memoryCache.size > MAX_MEMORY_ENTRIES) {
    memoryCache.delete(memoryCache.keys().next().value);
  }
}

function removeStored(storage, identity) {
  try {
    storage?.removeItem(storageKey(identity));
  } catch {
    // localStorage is an optional acceleration layer.
  }
}

function readCachedGrowth({ identity, symbol, storage, now, allowStale = false }) {
  const currentTime = nowValue(now);
  const memoryEntry = memoryCache.get(identity);
  if (memoryEntry) {
    if (allowStale || memoryEntry.expiresAt > currentTime) return memoryEntry.data;
  }
  if (!storage) return null;
  try {
    const stored = JSON.parse(storage.getItem(storageKey(identity)) || 'null');
    const data = normalizeEarningsGrowthPayload(stored?.data, symbol);
    const expiresAt = Number(stored?.expiresAt);
    if (
      stored?.version !== EARNINGS_GROWTH_STORAGE_VERSION
      || !data
      || !Number.isFinite(expiresAt)
    ) {
      removeStored(storage, identity);
      return null;
    }
    // Keep a structurally valid expired entry available for the network-error
    // fallback. It is never returned by the normal fresh-cache path.
    if (!allowStale && expiresAt <= currentTime) return null;
    setMemoryEntry(identity, { data, expiresAt });
    return data;
  } catch {
    removeStored(storage, identity);
    return null;
  }
}

function writeCachedGrowth({ identity, data, storage, expiresAt }) {
  const entry = { data, expiresAt };
  setMemoryEntry(identity, entry);
  try {
    storage?.setItem(storageKey(identity), JSON.stringify({
      version: EARNINGS_GROWTH_STORAGE_VERSION,
      expiresAt,
      data,
    }));
  } catch {
    // Memory caching remains available when persistent storage is unavailable.
  }
}

export function getCachedEarningsGrowth({
  userId,
  symbol,
  storage = defaultStorage(),
  now = Date.now,
} = {}) {
  const normalized = normalizedSymbol(symbol);
  const identity = identityKey(userId, normalized);
  if (!identity) return null;
  return readCachedGrowth({ identity, symbol: normalized, storage, now });
}

export function loadEarningsGrowth({
  userId,
  symbol,
  token,
  fetchImpl = globalThis.fetch,
  storage = defaultStorage(),
  now = Date.now,
} = {}) {
  const normalized = normalizedSymbol(symbol);
  const identity = identityKey(userId, normalized);
  if (!identity) return Promise.reject(new Error('missing authenticated user or symbol'));
  const cached = readCachedGrowth({ identity, symbol: normalized, storage, now });
  if (cached) return Promise.resolve(cached);
  if (inFlightRequests.has(identity)) return inFlightRequests.get(identity);
  if (!String(token || '').trim()) return Promise.reject(new Error('missing session token'));
  if (typeof fetchImpl !== 'function') return Promise.reject(new Error('fetch unavailable'));

  let requestPromise;
  requestPromise = (async () => {
    try {
      const response = await fetchImpl(`/api/earnings-growth?symbol=${encodeURIComponent(normalized)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${String(token).trim()}` },
        cache: 'no-store',
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.success === false) {
        throw new Error(body?.error || 'earnings growth request failed');
      }
      const data = normalizeEarningsGrowthPayload(body?.data || body, normalized);
      if (!data) throw new Error('earnings growth response invalid');
      const ttl = ['complete', 'partial'].includes(data.status)
        ? EARNINGS_GROWTH_CACHE_TTL_MS
        : EARNINGS_GROWTH_TRANSIENT_CACHE_TTL_MS;
      writeCachedGrowth({
        identity,
        data,
        storage,
        expiresAt: nowValue(now) + ttl,
      });
      return data;
    } catch (error) {
      const stale = readCachedGrowth({
        identity,
        symbol: normalized,
        storage,
        now,
        allowStale: true,
      });
      if (stale) return stale;
      throw error;
    }
  })().finally(() => {
    if (inFlightRequests.get(identity) === requestPromise) inFlightRequests.delete(identity);
  });
  inFlightRequests.set(identity, requestPromise);
  return requestPromise;
}

export function resetEarningsGrowthMemoryCache() {
  memoryCache.clear();
  inFlightRequests.clear();
}
