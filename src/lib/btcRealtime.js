export const BTC_REALTIME_SYMBOL = 'BTC-USD';
export const BTC_REST_TICKER = 'BTC-USD.CC';
export const BTC_DISPLAY_SYMBOL = 'BTCUSD';
export const BTC_DISPLAY_NAME = 'BTC/美元';

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function isBtcMarketCard(item) {
  const ticker = String(item?.ticker || '').toUpperCase();
  const symbol = String(item?.symbol || '').toUpperCase();
  const display = String(item?.displaySymbol || '').toUpperCase();
  return ticker === BTC_REST_TICKER || symbol === BTC_REALTIME_SYMBOL || display === BTC_DISPLAY_SYMBOL;
}

export function applyBtcTickToMarketCards(cards = [], tick, realtimeStatus = 'live') {
  const price = asNumber(tick?.price);
  if (!price || price <= 0) return cards;

  let found = false;
  const nextCards = (cards || []).map((card) => {
    if (!isBtcMarketCard(card)) return card;
    found = true;
    return createBtcMarketCard(card, tick, realtimeStatus);
  });

  if (found) return nextCards;
  return cards;
}

export function applyBtcTickToMarketCard(card, tick, realtimeStatus = 'live') {
  const price = asNumber(tick?.price);
  if (!price || price <= 0) return card || null;
  return createBtcMarketCard(card || {}, tick, realtimeStatus);
}

function createBtcMarketCard(card = {}, tick, realtimeStatus) {
  const price = asNumber(tick?.price);
  const previousIntraday = Array.isArray(card?.intraday) ? card.intraday : [];
  const intraday = [...previousIntraday, price].slice(-80);
  return {
    ...card,
    ticker: BTC_REST_TICKER,
    displaySymbol: BTC_DISPLAY_SYMBOL,
    name: BTC_DISPLAY_NAME,
    cn: BTC_DISPLAY_NAME,
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
