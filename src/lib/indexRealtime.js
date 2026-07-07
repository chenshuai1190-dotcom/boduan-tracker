const INDEX_CARD_MATCHERS = [
  { symbol: 'GSPC.INDX', ticker: 'GSPC.INDX', displaySymbol: '.SPX', name: '标普500' },
  { symbol: 'NDX.INDX', ticker: 'NDX.INDX', displaySymbol: '.NDX', name: '纳斯达克100' },
  { symbol: 'DJI.INDX', ticker: 'DJI.INDX', displaySymbol: '.DJI', name: '道琼斯' },
];

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

export function applyIndexTickToMarketCards(cards = [], tick, realtimeStatus = 'live') {
  const price = asNumber(tick?.price);
  if (!price || price <= 0) return cards;

  const sourceCards = Array.isArray(cards) ? cards : [];
  const nonIndexCards = sourceCards.filter((card) => !isIndexMarketCard(card));
  let found = false;
  const nextCards = mergeIndexCardsWithPlaceholders(sourceCards, realtimeStatus).map((card) => {
    if (!matchesTick(card, tick)) return card;
    found = true;
    return createIndexMarketCard(card, tick, realtimeStatus);
  });

  if (found) return [...nextCards, ...nonIndexCards];
  return cards;
}

export function mergeIndexRestCardsIntoMarketCards(currentCards = [], restCards = [], realtimeStatus = 'fallback') {
  const baseCards = mergeIndexCardsWithPlaceholders(currentCards, realtimeStatus);
  const incomingCards = Array.isArray(restCards) ? restCards : [];

  return baseCards.map((card) => {
    const incoming = incomingCards.find((item) => matchesTick(card, item));
    if (!incoming) return card;
    const price = asNumber(incoming.price);
    if (!price || price <= 0) return card;
    const matcher = matcherFor(incoming.symbol) || matcherFor(incoming.ticker) || matcherFor(incoming.displaySymbol) || matcherFor(card.symbol);
    const intraday = createRestSampledIntraday(card, incoming, price);
    const currentRealtimeStatus = card.realtimeStatus === 'live' ? 'live' : realtimeStatus;
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
      source: incoming.source || 'EODHD',
      realtime: card.realtime === true,
      realtimeStatus: currentRealtimeStatus,
      realtimeAt: card.realtimeAt || null,
    };
  });
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
    .slice(-80);
}

function createRestSampledIntraday(card, incoming, price) {
  const incomingIntraday = normalizeIntraday(incoming?.intraday);
  if (incomingIntraday.length >= 2) return incomingIntraday;
  const previousIntraday = normalizeIntraday(card?.intraday);
  if (previousIntraday.length === 0) {
    const previousClose = asNumber(incoming?.previousClose ?? incoming?.prevClose ?? incoming?.close ?? card?.previousClose);
    const seed = previousClose && previousClose > 0 ? [previousClose, price] : [price, price];
    return seed.slice(-80);
  }
  return [...previousIntraday, price].slice(-80);
}

function createIndexMarketCard(card, tick, realtimeStatus) {
  const price = asNumber(tick?.price);
  const previousIntraday = normalizeIntraday(card?.intraday);
  const intraday = [...previousIntraday, price].slice(-80);
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
    source: tick?.source || 'EODHD_WS',
    realtime: tick?.source === 'EODHD_WS' || realtimeStatus === 'live',
    realtimeStatus,
    realtimeAt: tick?.timestamp || tick?.receivedAt || Date.now(),
  };
}
