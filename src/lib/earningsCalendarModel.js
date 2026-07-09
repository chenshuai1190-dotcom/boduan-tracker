export const EARNINGS_SYMBOL_RE = /^[A-Z0-9.-]{1,15}$/;

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

export function addDays(date, days) {
  const base = new Date(`${dateKey(date)}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}

export function monthKey(value) {
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

export function earningsSessionDotClass(session) {
  if (session === 'post') return 'bg-[#5b72ff] shadow-[0_0_10px_rgba(91,114,255,0.65)]';
  if (session === 'pre') return 'bg-[#f6b54b] shadow-[0_0_10px_rgba(246,181,75,0.6)]';
  return 'bg-white/35';
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

export function normalizeEarningsEvent(raw, context = {}) {
  const code = String(raw?.code || raw?.symbol || raw?.ticker || '').trim().toUpperCase();
  const symbol = normalizeEarningsSymbol(code);
  const reportDate = dateKey(raw?.report_date || raw?.reportDate || raw?.date);
  if (!symbol || !reportDate) return null;

  const positions = context.positionsBySymbol || new Set();
  const watchlist = context.watchlistBySymbol || new Set();
  const inPosition = positions.has(symbol);
  const inWatchlist = watchlist.has(symbol);
  const impact = inPosition ? 'high' : inWatchlist ? 'medium' : 'normal';
  const session = normalizeEarningsSession(raw?.before_after_market || raw?.beforeAfterMarket || raw?.time || raw?.session);

  return {
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
    revenueEstimate: numericOrNull(raw?.revenueEstimate ?? raw?.revenueEstimateAvg),
    analystCount: numericOrNull(raw?.analystCount ?? raw?.epsAnalystCount),
    impact,
    inPosition,
    inWatchlist,
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
