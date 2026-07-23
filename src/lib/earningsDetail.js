import { dateKey, normalizeEarningsSymbol } from './earningsCalendarModel.js';

export const EARNINGS_DETAIL_CLIENT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const EARNINGS_DETAIL_PENDING_CACHE_TTL_MS = 5 * 60 * 1000;
const EARNINGS_DETAIL_CACHE_PREFIX = 'xmoney_earnings_detail_v1';
const EARNINGS_DETAIL_SECTION_KEYS = ['reportSegments', 'revenueBreakdown', 'geographies'];
const inFlightRequests = new Map();

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeText(value, maxLength = 180) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeStatus(value, fallback = 'unavailable') {
  return ['complete', 'partial', 'pending', 'unavailable'].includes(value) ? value : fallback;
}

function normalizeItem(item, sectionKey) {
  if (!item || typeof item !== 'object') return null;
  const normalized = {
    id: safeText(item.id || item.label || item.labelZh, 80),
    label: safeText(item.label, 120),
    labelZh: safeText(item.labelZh, 120),
    revenue: finiteOrNull(item.revenue),
    previousRevenue: finiteOrNull(item.previousRevenue),
  };
  if (!normalized.id || (!normalized.label && !normalized.labelZh)) return null;
  if (sectionKey === 'reportSegments') {
    normalized.profitMetric = item.profitMetric === 'grossProfit' ? 'grossProfit' : 'operatingIncome';
    normalized.profit = finiteOrNull(item.profit);
    normalized.previousProfit = finiteOrNull(item.previousProfit);
  }
  if (sectionKey === 'revenueBreakdown') normalized.parentId = safeText(item.parentId, 80) || null;
  return normalized;
}

function normalizeSection(section, sectionKey) {
  const source = section && typeof section === 'object' ? section : {};
  const items = (Array.isArray(source.items) ? source.items : [])
    .map((item) => normalizeItem(item, sectionKey))
    .filter(Boolean);
  const normalized = {
    status: normalizeStatus(source.status, items.length ? 'complete' : 'unavailable'),
    reason: safeText(source.reason, 160) || null,
    items,
  };
  if (sectionKey === 'reportSegments' && source.reconciliation) {
    normalized.reconciliation = normalizeItem(source.reconciliation, 'revenueBreakdown');
  }
  return normalized;
}

export function normalizeEarningsDetailPayload(payload) {
  if (!payload || payload.success !== true) throw new Error('财报详情数据无效');
  const symbol = normalizeEarningsSymbol(payload.symbol);
  if (!symbol) throw new Error('财报详情股票代码无效');
  const period = payload.period && typeof payload.period === 'object' ? payload.period : {};
  const source = payload.source && typeof payload.source === 'object'
    ? {
        provider: safeText(payload.source.provider, 24),
        cik: safeText(payload.source.cik, 24),
        accession: safeText(payload.source.accession, 40),
        form: safeText(payload.source.form, 20),
        filedAt: dateKey(payload.source.filedAt),
        filingUrl: /^https:\/\/www\.sec\.gov\//i.test(String(payload.source.filingUrl || ''))
          ? String(payload.source.filingUrl)
          : null,
        primaryDocumentUrl: /^https:\/\/www\.sec\.gov\//i.test(String(payload.source.primaryDocumentUrl || ''))
          ? String(payload.source.primaryDocumentUrl)
          : null,
      }
    : null;
  const sections = {};
  EARNINGS_DETAIL_SECTION_KEYS.forEach((key) => {
    sections[key] = normalizeSection(payload.sections?.[key], key);
  });
  return {
    success: true,
    schemaVersion: Number(payload.schemaVersion) || 1,
    status: normalizeStatus(payload.status, 'pending'),
    symbol,
    currency: safeText(payload.currency, 12).toUpperCase() || 'USD',
    period: {
      start: dateKey(period.start),
      end: dateKey(period.end),
      fiscalDate: dateKey(period.fiscalDate),
      reportDate: dateKey(period.reportDate),
    },
    source,
    sections,
  };
}

export function earningsDetailClientCacheKey({ userId, symbol, fiscalDate, reportDate }) {
  const normalizedSymbol = normalizeEarningsSymbol(symbol);
  const fiscal = dateKey(fiscalDate);
  const report = dateKey(reportDate);
  if (!userId || !normalizedSymbol || !fiscal || !report) return '';
  return `${EARNINGS_DETAIL_CACHE_PREFIX}:${userId}:${normalizedSymbol}:${fiscal}:${report}`;
}

function readCache(key, { allowStale = false } = {}) {
  if (!key || typeof localStorage === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    if (!parsed?.savedAt || !parsed?.payload) return null;
    const age = Date.now() - Number(parsed.savedAt);
    const normalized = normalizeEarningsDetailPayload(parsed.payload);
    const ttl = normalized.status === 'complete' || normalized.status === 'partial'
      ? EARNINGS_DETAIL_CLIENT_CACHE_TTL_MS
      : EARNINGS_DETAIL_PENDING_CACHE_TTL_MS;
    if (!allowStale && age > ttl) return null;
    return normalized;
  } catch {
    return null;
  }
}

function writeCache(key, payload) {
  if (!key || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), payload }));
  } catch {
    // The page remains usable when iOS private storage is full or unavailable.
  }
}

export async function fetchEarningsDetail({
  supabase,
  symbol,
  fiscalDate,
  reportDate,
  fetchImpl = globalThis.fetch,
}) {
  if (!supabase?.auth?.getSession) throw new Error('请先登录后查看财报详情');
  const normalizedSymbol = normalizeEarningsSymbol(symbol);
  const fiscal = dateKey(fiscalDate);
  const report = dateKey(reportDate);
  if (!normalizedSymbol || !fiscal || !report) throw new Error('财报详情参数不完整');
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const userId = data?.session?.user?.id;
  if (!token || !userId) throw new Error('请先登录后查看财报详情');
  const cacheKey = earningsDetailClientCacheKey({
    userId,
    symbol: normalizedSymbol,
    fiscalDate: fiscal,
    reportDate: report,
  });
  const cached = readCache(cacheKey);
  if (cached) return cached;
  if (inFlightRequests.has(cacheKey)) return inFlightRequests.get(cacheKey);

  const request = (async () => {
    const params = new URLSearchParams({
      symbol: normalizedSymbol,
      fiscalDate: fiscal,
      reportDate: report,
    });
    try {
      const response = await fetchImpl(`/api/earnings-detail?${params.toString()}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || `财报详情读取失败 (${response.status})`);
      }
      const normalized = normalizeEarningsDetailPayload(await response.json());
      writeCache(cacheKey, normalized);
      return normalized;
    } catch (error) {
      const stale = readCache(cacheKey, { allowStale: true });
      if (stale) return stale;
      throw error;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();
  inFlightRequests.set(cacheKey, request);
  return request;
}

export function formatEarningsDetailMoney(value, language = 'zh', { signed = false } = {}) {
  const number = finiteOrNull(value);
  if (number === null) return '—';
  const sign = number < 0 ? '-' : signed && number > 0 ? '+' : '';
  const absolute = Math.abs(number);
  if (language === 'en') {
    if (absolute >= 1_000_000_000) return `${sign}$${(absolute / 1_000_000_000).toFixed(2)}B`;
    if (absolute >= 1_000_000) return `${sign}$${(absolute / 1_000_000).toFixed(1)}M`;
    return `${sign}$${absolute.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  if (absolute >= 100_000_000) return `${sign}${(absolute / 100_000_000).toFixed(2)}亿`;
  if (absolute >= 10_000) return `${sign}${(absolute / 10_000).toFixed(0)}万`;
  return `${sign}${absolute.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
}

export function earningsPercentChange(current, previous) {
  const currentNumber = finiteOrNull(current);
  const previousNumber = finiteOrNull(previous);
  if (currentNumber === null || previousNumber === null || previousNumber === 0) return null;
  return ((currentNumber / previousNumber) - 1) * 100;
}
