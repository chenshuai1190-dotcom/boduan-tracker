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

export function applyIndexTickToMarketCards(cards = [], tick, realtimeStatus = 'live') {
  const price = asNumber(tick?.price);
  if (!price || price <= 0) return cards;

  let found = false;
  const nextCards = (cards || []).map((card) => {
    if (!matchesTick(card, tick)) return card;
    found = true;
    return createIndexMarketCard(card, tick, realtimeStatus);
  });

  if (found) return nextCards;
  return cards;
}

function matchesTick(card, tick) {
  const cardMatcher = matcherFor(card?.ticker) || matcherFor(card?.symbol) || matcherFor(card?.displaySymbol);
  const tickMatcher = matcherFor(tick?.ticker) || matcherFor(tick?.symbol) || matcherFor(tick?.displaySymbol);
  return Boolean(cardMatcher && tickMatcher && cardMatcher.symbol === tickMatcher.symbol);
}

function createIndexMarketCard(card, tick, realtimeStatus) {
  const price = asNumber(tick?.price);
  const previousIntraday = Array.isArray(card?.intraday) ? card.intraday : [];
  const intraday = [...previousIntraday, price].slice(-80);
  const matcher = matcherFor(tick?.symbol) || matcherFor(tick?.ticker) || matcherFor(tick?.displaySymbol);
  return {
    ...card,
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
