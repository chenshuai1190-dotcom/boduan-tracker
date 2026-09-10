const INDEX_CARD_MATCHERS = [
  { symbol: 'GSPC.INDX', ticker: 'GSPC.INDX', displaySymbol: '.SPX', name: '标普500' },
  { symbol: 'NDX.INDX', ticker: 'NDX.INDX', displaySymbol: '.NDX', name: '纳斯达克100' },
  { symbol: 'DJI.INDX', ticker: 'DJI.INDX', displaySymbol: '.DJI', name: '道琼斯' },
];
const MAX_INDEX_INTRADAY_POINTS = 80;
const INDEX_DELAYED_MAX_AGE_MS = 30 * 60 * 1000;
const INDEX_WS_MAX_AGE_MS = 15 * 1000;
const ET_TIME_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function providerTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  const timestamp = Number.isFinite(numeric) ? numeric : Date.parse(String(value));
  return Number.isFinite(timestamp) && timestamp > 0 && Number.isFinite(new Date(timestamp).getTime())
    ? timestamp : null;
}

// Arrival, fetch and legacy realtimeAt fields are deliberately not quote times.
function quoteTimestamp(card) {
  return providerTimestamp(card?.timestamp)
    ?? providerTimestamp(card?.quoteTimestamp)
    ?? providerTimestamp(card?.quoteAt);
}

function etParts(timestamp) {
  return Object.fromEntries(ET_TIME_PARTS.formatToParts(new Date(timestamp))
    .map(({ type, value }) => [type, value]));
}

function quoteSessionKey(timestamp) {
  if (!timestamp) return '';
  const parts = etParts(timestamp);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const session = minutes >= 570 && minutes < 960 ? 'regular'
    : minutes >= 240 && minutes < 570 ? 'premarket'
      : minutes >= 960 && minutes < 1200 ? 'postmarket' : 'closed';
  return `${parts.year}-${parts.month}-${parts.day}:${session}`;
}

export function resolveIndexQuoteStatus(card, { now = Date.now() } = {}) {
  if (!(asNumber(card?.price) > 0)) return 'unavailable';
  if (card?.fetchError) return 'stale';
  const timestamp = quoteTimestamp(card);
  const age = Number(now) - timestamp;
  if (!timestamp || !Number.isFinite(age) || age < 0 || age > INDEX_DELAYED_MAX_AGE_MS) return 'stale';
  if (card?.source === 'EODHD_WS' && age <= INDEX_WS_MAX_AGE_MS) return 'live';
  return 'delayed';
}

export function formatIndexQuoteTime(card, language = 'zh') {
  const timestamp = quoteTimestamp(card);
  if (!timestamp) return '';
  const parts = etParts(timestamp);
  const date = String(language).toLowerCase().startsWith('en')
    ? `${parts.month}/${parts.day}` : `${parts.month}-${parts.day}`;
  return `${date} ${parts.hour}:${parts.minute} ET`;
}

function canAcceptQuote(card, incoming, options = {}) {
  if (incoming?.error || incoming?.success === false || !(asNumber(incoming?.price) > 0)) return false;
  const currentTimestamp = quoteTimestamp(card);
  const incomingTimestamp = quoteTimestamp(incoming);
  const now = asNumber(options.now) ?? Date.now();
  if (incomingTimestamp !== null && incomingTimestamp > now) return false;
  return !currentTimestamp || (incomingTimestamp !== null && incomingTimestamp >= currentTimestamp);
}

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function matcherFor(value) {
  const normalized = normalize(value);
  return INDEX_CARD_MATCHERS.find((item) => (
    normalized === item.symbol
    || normalized === item.ticker
    || normalized === item.displaySymbol
  ));
}

export function isIndexMarketCard(item) {
  return Boolean(
    matcherFor(item?.ticker)
    || matcherFor(item?.symbol)
    || matcherFor(item?.displaySymbol)
  );
}

export function createIndexPlaceholderMarketCards(realtimeStatus = 'connecting') {
  return INDEX_CARD_MATCHERS.map((item) => ({
    symbol: item.symbol,
    ticker: item.ticker,
    displaySymbol: item.displaySymbol,
    name: item.name,
    cn: item.name,
    price: null,
    change: null,
    changePercent: null,
    previousClose: null,
    dayHigh: null,
    dayLow: null,
    intraday: [],
    source: 'PENDING',
    realtime: false,
    realtimeStatus,
    realtimeAt: null,
    timestamp: null,
    quoteTimestamp: null,
    quoteAt: null,
    intradaySessionKey: '',
  }));
}

export function mergeIndexCardsWithPlaceholders(cards = [], realtimeStatus = 'connecting') {
  const sourceCards = Array.isArray(cards) ? cards : [];
  return createIndexPlaceholderMarketCards(realtimeStatus).map((placeholder) => {
    const current = sourceCards.find((card) => matchesTick(card, placeholder));
    if (!current) return placeholder;
    return {
      ...placeholder,
      ...current,
      intraday: current.intradayMode === 'static-locked' ? [] : normalizeIntraday(current.intraday),
    };
  });
}

export function applyIndexTickToMarketCards(cards = [], tick, realtimeStatus = 'live', options = {}) {
  const price = asNumber(tick?.price);
  if (!price || price <= 0 || tick?.error || tick?.success === false) return cards;

  const sourceCards = Array.isArray(cards) ? cards : [];
  const nonIndexCards = sourceCards.filter((card) => !isIndexMarketCard(card));
  let found = false;
  const nextCards = mergeIndexCardsWithPlaceholders(sourceCards, realtimeStatus).map((card) => {
    if (!matchesTick(card, tick)) return card;
    if (!canAcceptQuote(card, tick, options)) return card;
    found = true;
    return createIndexMarketCard(card, tick, options);
  });

  if (found) return [...nextCards, ...nonIndexCards];
  return cards;
}

export function mergeIndexRestCardsIntoMarketCards(currentCards = [], restCards = [], realtimeStatus = 'fallback', options = {}) {
  const baseCards = mergeIndexCardsWithPlaceholders(currentCards, realtimeStatus);
  const incomingCards = Array.isArray(restCards) ? restCards : [];

  return baseCards.map((card) => {
    const incoming = incomingCards.find((item) => matchesTick(card, item));
    if (!incoming || !canAcceptQuote(card, incoming, options)) {
      if (!(asNumber(card.price) > 0)) return { ...card, realtime: false, realtimeStatus: 'unavailable' };
      return { ...card, fetchError: true, realtime: false, realtimeStatus: 'stale' };
    }
    return createIndexMarketCard(card, incoming, options);
  });
}

export function shouldAppendIndexIntraday(session) {
  return String(session || '').toLowerCase() === 'regular';
}

function matchesTick(card, tick) {
  const cardMatcher = matcherFor(card?.ticker) || matcherFor(card?.symbol) || matcherFor(card?.displaySymbol);
  const tickMatcher = matcherFor(tick?.ticker) || matcherFor(tick?.symbol) || matcherFor(tick?.displaySymbol);
  return Boolean(cardMatcher && tickMatcher && cardMatcher.symbol === tickMatcher.symbol);
}

function normalizeIntraday(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map(asNumber)
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(-MAX_INDEX_INTRADAY_POINTS);
}

function etDate(timestamp) {
  const parts = etParts(timestamp);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function chartSession(data, timestamp) {
  if (timestamp === null) return null;
  const date = String(data?.intradayDate || '');
  const start = providerTimestamp(data?.sessionStart);
  const end = providerTimestamp(data?.sessionEnd);
  // Closing quotes may arrive just after 16:00. Their bars still belong to
  // today's regular session, but no bar may extend beyond its close endpoint.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !start || !end || end <= start
    || etDate(timestamp) !== date || etDate(start) !== date || etDate(end) !== date
    || timestamp < start) return null;
  return { date, start, end };
}

function normalizeChartPoints(values, session, timestamp, now) {
  if (!session || !Array.isArray(values)) return [];
  const points = new Map();
  for (const value of values) {
    const time = providerTimestamp(value?.timestamp);
    const price = asNumber(value?.price);
    if (!time || !(price > 0) || time < session.start || time > session.end
      || time > timestamp || time > now || points.has(time)) continue;
    points.set(time, { timestamp: time, price });
  }
  return [...points.values()].sort((a, b) => a.timestamp - b.timestamp);
}

function sampleChartPoints(points) {
  if (points.length <= MAX_INDEX_INTRADAY_POINTS) return points.map(({ price }) => price);
  // Keep the entire session in the tiny chart, including its open and latest
  // real point. The complete timestamped history remains on the market card.
  return Array.from({ length: MAX_INDEX_INTRADAY_POINTS }, (_, index) => (
    points[Math.round(index * (points.length - 1) / (MAX_INDEX_INTRADAY_POINTS - 1))].price
  ));
}

function yahooChartHistory(card, tick, options) {
  const timestamp = quoteTimestamp(tick);
  const now = asNumber(options.now) ?? Date.now();
  const sameQuote = timestamp !== null && timestamp === quoteTimestamp(card);
  const previousSession = card.source === 'YAHOO_CHART'
    && (!card.intradaySource || card.intradaySource === 'YAHOO_CHART')
    && card.intradayMode !== 'static-locked' ? chartSession(card, timestamp) : null;
  let incomingSession = chartSession(tick, timestamp);
  if (sameQuote && incomingSession && previousSession
    && (incomingSession.start !== previousSession.start || incomingSession.end !== previousSession.end)) {
    incomingSession = null;
  }
  const session = incomingSession || previousSession;
  const sameSession = session && previousSession
    && session.date === previousSession.date && session.start === previousSession.start
    && session.end === previousSession.end;
  const previousPoints = sameSession
    ? normalizeChartPoints(card.intradayPoints, session, quoteTimestamp(card), now) : [];
  const incomingPoints = tick.intradayMode === 'static-locked' ? []
    : normalizeChartPoints(tick.intradayPoints, incomingSession, timestamp, now);
  const points = new Map(previousPoints.map((point) => [point.timestamp, point]));
  for (const point of incomingPoints) {
    // A repeat can fill missing history, not revise already accepted values.
    // A genuinely newer snapshot may finalize its current provider bar.
    if (!sameQuote || !points.has(point.timestamp)) points.set(point.timestamp, point);
  }
  const intradayPoints = [...points.values()].sort((a, b) => a.timestamp - b.timestamp);
  return {
    intraday: sampleChartPoints(intradayPoints),
    intradayPoints,
    intradaySource: 'YAHOO_CHART',
    intradayDate: session?.date || null,
    sessionStart: session?.start || null,
    sessionEnd: session?.end || null,
    intradayMode: intradayPoints.length ? 'session-history' : 'empty',
    intradaySessionKey: session ? `${session.date}:regular` : quoteSessionKey(timestamp),
  };
}

function createIndexMarketCard(card, tick, options = {}) {
  const price = asNumber(tick?.price);
  const timestamp = quoteTimestamp(tick);
  const source = tick?.source || 'EODHD_REST';
  const sameQuote = timestamp !== null && timestamp === quoteTimestamp(card);
  if (sameQuote && source === 'YAHOO_CHART' && card.source === source
    && ['price', 'change', 'changePercent', 'previousClose', 'dayHigh', 'dayLow'].some((field) => {
      const previous = asNumber(card[field]);
      const incoming = asNumber(tick[field]);
      return previous !== null && incoming !== null && previous !== incoming;
    })) {
    // A conflicting repeat cannot supply a curve for a different financial
    // observation while retaining the previously accepted headline quote.
    return { ...card, fetchError: true, realtime: false, realtimeStatus: 'stale' };
  }
  const chartHistory = source === 'YAHOO_CHART' ? yahooChartHistory(card, tick, options) : null;
  // At an equal provider time, an approved provider migration replaces the
  // entire quote together with its history; never display a mixed-source card.
  const switchingToYahoo = source === 'YAHOO_CHART' && card.source !== source;
  if (sameQuote && !switchingToYahoo) {
    // A repeat may recover transport state or fill real history, never rewrite
    // the quote's financial fields, timestamp or original source.
    const next = { ...card, ...chartHistory, fetchError: Boolean(tick.fetchError) };
    if (tick?.fetchedAt != null) next.fetchedAt = tick.fetchedAt;
    const realtimeStatus = resolveIndexQuoteStatus(next, { now: options.now ?? Date.now() });
    return { ...next, realtimeStatus, realtime: realtimeStatus === 'live' };
  }
  const sessionKey = quoteSessionKey(timestamp);
  const previousSessionKey = card.intradaySessionKey || quoteSessionKey(quoteTimestamp(card));
  const sameSession = sessionKey === previousSessionKey;
  const previousIntraday = sameSession && (card.intradaySource || card.source) !== 'YAHOO_CHART'
    && card.intradayMode !== 'static-locked'
    ? normalizeIntraday(card.intraday) : [];
  const incomingIntraday = tick?.intradayMode === 'static-locked' ? [] : normalizeIntraday(tick?.intraday);
  const appendIntraday = options?.appendIntraday !== false && timestamp !== null;
  const intraday = incomingIntraday.length > 0
    ? incomingIntraday
    : appendIntraday ? [...previousIntraday, price].slice(-MAX_INDEX_INTRADAY_POINTS) : previousIntraday;
  const intradayMode = incomingIntraday.length > 0
    ? 'session-history'
    : intraday.length > 0 ? (appendIntraday ? 'quote-sampled' : card.intradayMode) : 'empty';
  const matcher = matcherFor(tick?.symbol) || matcherFor(tick?.ticker) || matcherFor(tick?.displaySymbol);
  const next = {
    ...card,
    ...tick,
    symbol: matcher?.symbol || tick?.symbol || card?.symbol,
    ticker: matcher?.ticker || tick?.ticker || card?.ticker,
    displaySymbol: matcher?.displaySymbol || tick?.displaySymbol || card?.displaySymbol,
    name: matcher?.name || tick?.name || card?.name,
    cn: matcher?.name || tick?.cn || card?.cn,
    price,
    change: asNumber(tick?.change),
    changePercent: asNumber(tick?.changePercent),
    previousClose: asNumber(tick?.previousClose),
    dayHigh: asNumber(tick?.dayHigh),
    dayLow: asNumber(tick?.dayLow),
    intraday,
    intradayMode,
    intradaySessionKey: sessionKey,
    intradayPoints: [],
    intradaySource: source,
    intradayDate: null,
    sessionStart: null,
    sessionEnd: null,
    ...chartHistory,
    source,
    timestamp,
    quoteTimestamp: timestamp,
    quoteAt: timestamp === null ? null : new Date(timestamp).toISOString(),
    realtimeAt: timestamp,
    fetchError: Boolean(tick.fetchError),
  };
  const realtimeStatus = resolveIndexQuoteStatus(next, { now: options.now ?? Date.now() });
  return { ...next, realtimeStatus, realtime: realtimeStatus === 'live' };
}
