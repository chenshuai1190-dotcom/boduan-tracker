const EARNINGS_SYMBOL_RE = /^[A-Z0-9.-]{1,15}$/;
export const EARNINGS_PUBLISHED_RETENTION_DAYS = 2;
const EARNINGS_RESULT_THRESHOLD_PERCENT = 1;

export function normalizeEarningsSymbol(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  const withoutExchange = raw.endsWith('.US') ? raw.slice(0, -3) : raw;
  return EARNINGS_SYMBOL_RE.test(withoutExchange) ? withoutExchange : '';
}

export function toEodhdUsSymbol(value) {
  const symbol = normalizeEarningsSymbol(value);
  return symbol ? `${symbol}.US` : '';
}

export function dateKey(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

export function todayDateKey(now = new Date()) {
  return dateKey(now.toISOString());
}

function addDays(date, days) {
  const base = new Date(`${dateKey(date)}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}

function monthKey(value) {
  const key = dateKey(value);
  return key ? key.slice(0, 7) : '';
}

export function monthLabel(value, language = 'zh') {
  const key = monthKey(value);
  if (!key) return '--';
  const [year, month] = key.split('-');
  return language === 'en' ? `${year}/${month}` : `${year}年${Number(month)}月`;
}

export function shortDateLabel(value) {
  const key = dateKey(value);
  if (!key) return '--';
  return key.slice(5).replace('-', '/');
}

export function normalizeEarningsSession(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'unknown';
  if (raw.includes('before') || raw.includes('pre') || raw.includes('bmo')) return 'pre';
  if (raw.includes('after') || raw.includes('post') || raw.includes('amc')) return 'post';
  return 'unknown';
}

export function earningsSessionText(session, language = 'zh') {
  if (session === 'pre') return language === 'en' ? 'Pre' : '盘前';
  if (session === 'post') return language === 'en' ? 'After' : '盘后';
  return language === 'en' ? 'TBD' : '待定';
}

function earningsSessionDotClass(session) {
  if (session === 'post') return 'bg-[#5b72ff] shadow-[0_0_10px_rgba(91,114,255,0.65)]';
  if (session === 'pre') return 'bg-[#f6b54b] shadow-[0_0_10px_rgba(246,181,75,0.6)]';
  return 'bg-white/35';
}

function normalizeEarningsResult(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['beat', 'surprise', 'outperform', 'above', '超预期'].includes(raw)) return 'beat';
  if (['miss', 'below', 'underperform', '不及预期'].includes(raw)) return 'miss';
  if (['mixed', 'split', '分化'].includes(raw)) return 'mixed';
  if (['meet', 'inline', 'match', '符合预期'].includes(raw)) return 'meet';
  return '';
}

export function isEarningsPublished(event) {
  if (!event) return false;
  if (event.earningsPublished === true) return true;
  return numericOrNull(event.epsActual) !== null || numericOrNull(event.revenueActualUsd ?? event.revenueActual) !== null;
}

function earningsPublishedUntil(event) {
  const reportDate = dateKey(event?.reportDate || event?.report_date);
  return reportDate ? addDays(reportDate, EARNINGS_PUBLISHED_RETENTION_DAYS) : '';
}

export function isEarningsVisible(event, today = todayDateKey()) {
  const reportDate = dateKey(event?.reportDate || event?.report_date);
  if (!reportDate) return false;
  const todayKey = dateKey(today) || todayDateKey();
  if (isEarningsPublished(event)) return todayKey <= addDays(reportDate, EARNINGS_PUBLISHED_RETENTION_DAYS);
  return reportDate >= todayKey;
}

export function classifyEarningsResult(event) {
  const explicit = normalizeEarningsResult(event?.earningsResult || event?.resultStatus);
  if (explicit) return explicit;

  const epsSurprise = numericOrNull(event?.surprisePercent ?? event?.epsSurprisePercent ?? event?.percent)
    ?? calculateSurprisePercent(event?.epsActual ?? event?.actual, event?.epsEstimate ?? event?.estimate);
  const revenueSurprise = numericOrNull(event?.revenueSurprisePercent)
    ?? calculateSurprisePercent(event?.revenueActualUsd, event?.revenueEstimateUsd);
  const signals = [epsSurprise, revenueSurprise]
    .filter((value) => value !== null)
    .map((value) => {
      if (value > EARNINGS_RESULT_THRESHOLD_PERCENT) return 'positive';
      if (value < -EARNINGS_RESULT_THRESHOLD_PERCENT) return 'negative';
      return 'neutral';
    });

  if (!signals.length) return null;
  const hasPositive = signals.includes('positive');
  const hasNegative = signals.includes('negative');
  const hasNeutral = signals.includes('neutral');
  if (hasPositive && !hasNegative && !hasNeutral) return 'beat';
  if (hasNegative && !hasPositive && !hasNeutral) return 'miss';
  if (hasPositive && hasNegative) return 'mixed';
  if ((hasPositive || hasNegative) && hasNeutral) return 'mixed';
  return 'meet';
}

export function earningsResultText(result, language = 'zh') {
  const normalized = normalizeEarningsResult(result);
  if (!normalized) return language === 'en' ? 'Insufficient data' : '数据不足';
  if (language === 'en') {
    if (normalized === 'beat') return 'Beat';
    if (normalized === 'miss') return 'Miss';
    if (normalized === 'mixed') return 'Mixed';
    return 'In line';
  }
  if (normalized === 'beat') return '超预期';
  if (normalized === 'miss') return '不及预期';
  if (normalized === 'mixed') return '分化';
  return '符合预期';
}

function normalizeEarningsImpact(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['high', 'important', '高影响'].includes(raw)) return 'high';
  if (['medium', 'mid', '中影响'].includes(raw)) return 'medium';
  if (['normal', 'watch', '关注'].includes(raw)) return 'normal';
  return '';
}

export function buildEarningsSymbols({ watchlist = [], positions = [], max = 24 } = {}) {
  const symbols = [];
  const seen = new Set();
  const add = (value) => {
    const symbol = normalizeEarningsSymbol(value);
    if (!symbol || seen.has(symbol)) return;
    seen.add(symbol);
    symbols.push(symbol);
  };

  positions.forEach((item) => add(item?.symbol));
  watchlist.forEach((item) => add(item?.symbol));

  return symbols.slice(0, max);
}

export function shouldPromoteEarningsCalendar({
  events = [],
  watchlist = [],
  positions = [],
  today = todayDateKey(),
  windowDays = 15,
  minimumCompanies = 5,
} = {}) {
  const todayKey = dateKey(today) || todayDateKey();
  const endKey = addDays(todayKey, Math.max(0, Number(windowDays) || 0));
  const threshold = Math.max(1, Math.trunc(Number(minimumCompanies) || 0));
  const positionSymbols = new Set(
    (Array.isArray(positions) ? positions : []).map((item) => normalizeEarningsSymbol(item?.symbol)).filter(Boolean),
  );
  const followedSymbols = new Set([
    ...positionSymbols,
    ...(Array.isArray(watchlist) ? watchlist : []).map((item) => normalizeEarningsSymbol(item?.symbol)).filter(Boolean),
  ]);
  if (positionSymbols.size === 0 || followedSymbols.size < threshold) return false;

  const upcomingSymbols = new Set();
  let hasPositionEarnings = false;
  for (const event of Array.isArray(events) ? events : []) {
    const symbol = normalizeEarningsSymbol(event?.symbol || event?.code || event?.ticker);
    const reportDate = dateKey(event?.reportDate || event?.report_date || event?.date);
    if (!symbol || !followedSymbols.has(symbol) || !reportDate) continue;
    if (reportDate < todayKey || reportDate > endKey || isEarningsPublished(event)) continue;
    upcomingSymbols.add(symbol);
    if (positionSymbols.has(symbol)) hasPositionEarnings = true;
  }

  return upcomingSymbols.size >= threshold && hasPositionEarnings;
}

function normalizeEarningsEvent(raw, context = {}) {
  const code = String(raw?.code || raw?.symbol || raw?.ticker || '').trim().toUpperCase();
  const symbol = normalizeEarningsSymbol(code);
  const reportDate = dateKey(raw?.report_date || raw?.reportDate || raw?.date);
  if (!symbol || !reportDate) return null;

  const positions = context.positionsBySymbol || new Set();
  const watchlist = context.watchlistBySymbol || new Set();
  const inPosition = positions.has(symbol);
  const inWatchlist = watchlist.has(symbol);
  const impact = normalizeEarningsImpact(raw?.impact ?? raw?.importance ?? raw?.impactLevel)
    || (inPosition ? 'high' : inWatchlist ? 'medium' : 'normal');
  const session = normalizeEarningsSession(raw?.before_after_market || raw?.beforeAfterMarket || raw?.time || raw?.session);

  const normalized = {
    id: `${symbol}:${reportDate}:${session}`,
    symbol,
    code: code || `${symbol}.US`,
    name: raw?.name || raw?.company || raw?.companyName || '',
    reportDate,
    fiscalDate: dateKey(raw?.date || raw?.fiscalDate || raw?.periodDate) || reportDate,
    session,
    currency: raw?.currency || raw?.Currency || 'USD',
    epsEstimate: numericOrNull(raw?.estimate ?? raw?.epsEstimate ?? raw?.earningsEstimateAvg),
    epsActual: numericOrNull(raw?.actual ?? raw?.epsActual),
    epsDifference: numericOrNull(raw?.difference ?? raw?.epsDifference),
    surprisePercent: numericOrNull(raw?.percent ?? raw?.surprisePercent),
    epsPreviousYear: numericOrNull(raw?.epsPreviousYear ?? raw?.earningsEstimateYearAgoEps),
    epsActualYoyPercent: numericOrNull(raw?.epsActualYoyPercent),
    epsEstimateYoyPercent: numericOrNull(raw?.epsEstimateYoyPercent),
    revenueEstimate: numericOrNull(raw?.revenueEstimate ?? raw?.revenueEstimateAvg),
    revenueEstimateUsd: numericOrNull(raw?.revenueEstimateUsd),
    revenueEstimateCurrency: raw?.revenueEstimateCurrency || null,
    revenueOriginalCurrency: raw?.revenueOriginalCurrency || raw?.currency || raw?.Currency || null,
    revenueFxRate: numericOrNull(raw?.revenueFxRate),
    revenueFxSource: raw?.revenueFxSource || null,
    revenueEstimateYoyPercent: numericOrNull(raw?.revenueEstimateYoyPercent),
    revenueActual: numericOrNull(raw?.revenueActual ?? raw?.actualRevenue),
    revenueActualUsd: numericOrNull(raw?.revenueActualUsd),
    revenueActualCurrency: raw?.revenueActualCurrency || null,
    revenueActualOriginalCurrency: raw?.revenueActualOriginalCurrency || null,
    revenueActualFxRate: numericOrNull(raw?.revenueActualFxRate),
    revenueSurprisePercent: numericOrNull(raw?.revenueSurprisePercent),
    revenuePreviousYear: numericOrNull(raw?.revenuePreviousYear),
    revenuePreviousYearUsd: numericOrNull(raw?.revenuePreviousYearUsd),
    revenuePreviousYearCurrency: raw?.revenuePreviousYearCurrency || null,
    revenuePreviousYearOriginalCurrency: raw?.revenuePreviousYearOriginalCurrency || null,
    revenueActualYoyPercent: numericOrNull(raw?.revenueActualYoyPercent),
    ebitActual: numericOrNull(raw?.ebitActual),
    ebitActualUsd: numericOrNull(raw?.ebitActualUsd),
    ebitActualCurrency: raw?.ebitActualCurrency || null,
    ebitActualOriginalCurrency: raw?.ebitActualOriginalCurrency || null,
    ebitActualFxRate: numericOrNull(raw?.ebitActualFxRate),
    ebitActualFxSource: raw?.ebitActualFxSource || null,
    ebitActualSource: raw?.ebitActualSource || null,
    ebitActualBasis: raw?.ebitActualBasis || null,
    ebitPreviousYear: numericOrNull(raw?.ebitPreviousYear),
    ebitPreviousYearUsd: numericOrNull(raw?.ebitPreviousYearUsd),
    ebitPreviousYearCurrency: raw?.ebitPreviousYearCurrency || null,
    ebitPreviousYearOriginalCurrency: raw?.ebitPreviousYearOriginalCurrency || null,
    ebitPreviousYearFxRate: numericOrNull(raw?.ebitPreviousYearFxRate),
    ebitPreviousYearSource: raw?.ebitPreviousYearSource || null,
    ebitPreviousYearBasis: raw?.ebitPreviousYearBasis || null,
    ebitActualYoyPercent: numericOrNull(raw?.ebitActualYoyPercent),
    marketReactionPercent: numericOrNull(raw?.marketReactionPercent),
    marketReactionBaseDate: dateKey(raw?.marketReactionBaseDate),
    marketReactionTargetDate: dateKey(raw?.marketReactionTargetDate),
    marketReactionSession: raw?.marketReactionSession || null,
    analystCount: numericOrNull(raw?.analystCount ?? raw?.epsAnalystCount),
    impact,
    inPosition,
    inWatchlist,
  };

  const earningsPublished = raw?.earningsPublished === true || isEarningsPublished(normalized);
  return {
    ...normalized,
    earningsPublished,
    publishedUntil: raw?.publishedUntil || (earningsPublished ? earningsPublishedUntil(normalized) : null),
    earningsResult: earningsPublished ? classifyEarningsResult({ ...normalized, earningsPublished }) : null,
  };
}

export function normalizeEarningsEvents(events = [], context = {}) {
  const positionsBySymbol = new Set((context.positions || []).map((item) => normalizeEarningsSymbol(item?.symbol)).filter(Boolean));
  const watchlistBySymbol = new Set((context.watchlist || []).map((item) => normalizeEarningsSymbol(item?.symbol)).filter(Boolean));

  return (Array.isArray(events) ? events : [])
    .map((item) => normalizeEarningsEvent(item, { positionsBySymbol, watchlistBySymbol }))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.reportDate !== b.reportDate) return a.reportDate.localeCompare(b.reportDate);
      const impactOrder = { high: 0, medium: 1, normal: 2 };
      return (impactOrder[a.impact] ?? 2) - (impactOrder[b.impact] ?? 2) || a.symbol.localeCompare(b.symbol);
    });
}

export function groupEarningsByDate(events = []) {
  const groups = new Map();
  events.forEach((event) => {
    const key = event.reportDate;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  });
  return groups;
}

export function buildCalendarMonth(month, events = []) {
  const monthStart = `${monthKey(month || todayDateKey()) || todayDateKey().slice(0, 7)}-01`;
  const start = new Date(`${monthStart}T00:00:00Z`);
  const startDay = start.getUTCDay();
  const gridStart = new Date(start);
  gridStart.setUTCDate(start.getUTCDate() - startDay);
  const eventGroups = groupEarningsByDate(events);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setUTCDate(gridStart.getUTCDate() + index);
    const key = day.toISOString().slice(0, 10);
    return {
      key,
      day: day.getUTCDate(),
      inMonth: key.slice(0, 7) === monthStart.slice(0, 7),
      events: eventGroups.get(key) || [],
    };
  });
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[$,%\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateSurprisePercent(actualValue, estimateValue) {
  const actual = numericOrNull(actualValue);
  const estimate = numericOrNull(estimateValue);
  if (actual === null || estimate === null || estimate === 0) return null;
  return ((actual - estimate) / Math.abs(estimate)) * 100;
}
