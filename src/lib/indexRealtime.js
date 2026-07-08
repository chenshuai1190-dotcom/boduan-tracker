const INDEX_CARD_MATCHERS = [
  { symbol: 'GSPC.INDX', ticker: 'GSPC.INDX', displaySymbol: '.SPX', name: '标普500' },
  { symbol: 'NDX.INDX', ticker: 'NDX.INDX', displaySymbol: '.NDX', name: '纳斯达克100' },
  { symbol: 'DJI.INDX', ticker: 'DJI.INDX', displaySymbol: '.DJI', name: '道琼斯' },
];
const MAX_INDEX_INTRADAY_POINTS = 80;
const STATIC_INDEX_INTRADAY_POINTS = 14;

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
      intraday: normalizeIntraday(current.intraday),
    };
  });
}

export function applyIndexTickToMarketCards(cards = [], tick, realtimeStatus = 'live', options = {}) {
  const price = asNumber(tick?.price);
  if (!price || price <= 0) return cards;

  const sourceCards = Array.isArray(cards) ? cards : [];
  const nonIndexCards = sourceCards.filter((card) => !isIndexMarketCard(card));
  let found = false;
  const nextCards = mergeIndexCardsWithPlaceholders(sourceCards, realtimeStatus).map((card) => {
    if (!matchesTick(card, tick)) return card;
    found = true;
    return createIndexMarketCard(card, tick, realtimeStatus, options);
  });

  if (found) return [...nextCards, ...nonIndexCards];
  return cards;
}

export function mergeIndexRestCardsIntoMarketCards(currentCards = [], restCards = [], realtimeStatus = 'fallback', options = {}) {
  const baseCards = mergeIndexCardsWithPlaceholders(currentCards, realtimeStatus);
  const incomingCards = Array.isArray(restCards) ? restCards : [];

  return baseCards.map((card) => {
    const incoming = incomingCards.find((item) => matchesTick(card, item));
    if (!incoming) return card;
    const price = asNumber(incoming.price);
    if (!price || price <= 0) return card;
    const matcher = matcherFor(incoming.symbol) || matcherFor(incoming.ticker) || matcherFor(incoming.displaySymbol) || matcherFor(card.symbol);
    const intraday = createRestSampledIntraday(card, incoming, price, options);
    const currentRealtimeStatus = card.realtimeStatus === 'live' ? 'live' : realtimeStatus;
    const incomingIntraday = normalizeIntraday(incoming?.intraday);
    const previousIntraday = normalizeIntraday(card?.intraday);
    const appendIntraday = options?.appendIntraday !== false;
    const preservesLockedHistory = !appendIntraday
      && incomingIntraday.length < 2
      && previousIntraday.length >= 2
      && (card?.intradayMode === 'static-locked' || card?.intradayMode === 'session-history');
    const chartMode = preservesLockedHistory
      ? card.intradayMode
      : (incomingIntraday.length >= 2 ? 'session-history' : (appendIntraday ? 'live-sampled' : 'static-locked'));
    return {
      ...card,
      ...incoming,
      symbol: matcher?.symbol || incoming.symbol || card.symbol,
      ticker: matcher?.ticker || incoming.ticker || card.ticker,
      displaySymbol: matcher?.displaySymbol || incoming.displaySymbol || card.displaySymbol,
      name: matcher?.name || incoming.name || card.name,
      cn: matcher?.name || incoming.cn || card.cn,
      price,
      change: incoming.change ?? card.change ?? null,
      changePercent: incoming.changePercent ?? card.changePercent ?? null,
      previousClose: incoming.previousClose ?? card.previousClose ?? null,
      dayHigh: incoming.dayHigh ?? card.dayHigh ?? null,
      dayLow: incoming.dayLow ?? card.dayLow ?? null,
      intraday,
      intradayMode: chartMode,
      source: incoming.source || 'EODHD',
      realtime: card.realtime === true,
      realtimeStatus: currentRealtimeStatus,
      realtimeAt: card.realtimeAt || null,
    };
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

function createRestSampledIntraday(card, incoming, price, options = {}) {
  const incomingIntraday = normalizeIntraday(incoming?.intraday);
  if (incomingIntraday.length >= 2) return incomingIntraday;
  const previousIntraday = normalizeIntraday(card?.intraday);
  const appendIntraday = options?.appendIntraday !== false;
  if (!appendIntraday) {
    if (previousIntraday.length >= 2 && (card?.intradayMode === 'static-locked' || card?.intradayMode === 'session-history')) return previousIntraday;
    return createStaticIndexIntraday(card, incoming, price);
  }
  if (previousIntraday.length === 0) {
    const previousClose = asNumber(incoming?.previousClose ?? incoming?.prevClose ?? incoming?.close ?? card?.previousClose);
    const seed = previousClose && previousClose > 0 ? [previousClose, price] : [price, price];
    return seed.slice(-MAX_INDEX_INTRADAY_POINTS);
  }
  return [...previousIntraday, price].slice(-MAX_INDEX_INTRADAY_POINTS);
}

function createStaticIndexIntraday(card, incoming, price) {
  const previousClose = asNumber(incoming?.previousClose ?? incoming?.prevClose ?? incoming?.close ?? card?.previousClose);
  const dayHigh = asNumber(incoming?.dayHigh ?? incoming?.high ?? card?.dayHigh);
  const dayLow = asNumber(incoming?.dayLow ?? incoming?.low ?? card?.dayLow);
  const start = previousClose && previousClose > 0 ? previousClose : price;
  const end = price;
  const high = dayHigh && dayHigh > 0 ? Math.max(dayHigh, start, end) : Math.max(start, end);
  const low = dayLow && dayLow > 0 ? Math.min(dayLow, start, end) : Math.min(start, end);
  const range = Math.max(high - low, Math.abs(end - start), start * 0.001, 1);
  const points = [];

  for (let index = 0; index < STATIC_INDEX_INTRADAY_POINTS; index += 1) {
    const progress = index / (STATIC_INDEX_INTRADAY_POINTS - 1);
    const baseline = start + (end - start) * progress;
    const wave = Math.sin(progress * Math.PI * 3) * range * 0.14;
    const softPull = Math.sin(progress * Math.PI) * (end >= start ? -1 : 1) * range * 0.05;
    const value = Math.min(high, Math.max(low, baseline + wave + softPull));
    points.push(Number(value.toFixed(4)));
  }
  points[0] = Number(start.toFixed(4));
  points[points.length - 1] = Number(end.toFixed(4));
  return points;
}

function createIndexMarketCard(card, tick, realtimeStatus, options = {}) {
  const price = asNumber(tick?.price);
  const previousIntraday = normalizeIntraday(card?.intraday);
  const appendIntraday = options?.appendIntraday !== false;
  const intraday = appendIntraday
    ? [...previousIntraday, price].slice(-MAX_INDEX_INTRADAY_POINTS)
    : previousIntraday;
  const matcher = matcherFor(tick?.symbol) || matcherFor(tick?.ticker) || matcherFor(tick?.displaySymbol);
  return {
    ...card,
    symbol: matcher?.symbol || tick?.symbol || card?.symbol,
    ticker: matcher?.ticker || tick?.ticker || card?.ticker,
    displaySymbol: matcher?.displaySymbol || tick?.displaySymbol || card?.displaySymbol,
    name: matcher?.name || tick?.name || card?.name,
    cn: matcher?.name || tick?.cn || card?.cn,
    price,
    change: tick?.change ?? card?.change ?? 0,
    changePercent: tick?.changePercent ?? card?.changePercent ?? 0,
    intraday,
    intradayMode: appendIntraday ? 'live-sampled' : (card?.intradayMode || 'static-locked'),
    source: tick?.source || 'EODHD_WS',
    realtime: tick?.source === 'EODHD_WS' || realtimeStatus === 'live',
    realtimeStatus,
    realtimeAt: tick?.timestamp || tick?.receivedAt || Date.now(),
  };
}
