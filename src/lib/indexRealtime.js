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

function createIndexMarketCard(card, tick, options = {}) {
  const price = asNumber(tick?.price);
  const timestamp = quoteTimestamp(tick);
  if (timestamp !== null && timestamp === quoteTimestamp(card)) {
    // A successful repeat can recover transport state, never rewrite that quote.
    const next = { ...card, fetchError: Boolean(tick.fetchError) };
    if (tick?.fetchedAt != null) next.fetchedAt = tick.fetchedAt;
    const realtimeStatus = resolveIndexQuoteStatus(next, { now: options.now ?? Date.now() });
    return { ...next, realtimeStatus, realtime: realtimeStatus === 'live' };
  }
  const sessionKey = quoteSessionKey(timestamp);
  const previousSessionKey = card.intradaySessionKey || quoteSessionKey(quoteTimestamp(card));
  const sameSession = sessionKey === previousSessionKey;
  const previousIntraday = sameSession && card.intradayMode !== 'static-locked'
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
    source: tick?.source || 'EODHD_REST',
    timestamp,
    quoteTimestamp: timestamp,
    quoteAt: timestamp === null ? null : new Date(timestamp).toISOString(),
    realtimeAt: timestamp,
    fetchError: Boolean(tick.fetchError),
  };
  const realtimeStatus = resolveIndexQuoteStatus(next, { now: options.now ?? Date.now() });
  return { ...next, realtimeStatus, realtime: realtimeStatus === 'live' };
}
