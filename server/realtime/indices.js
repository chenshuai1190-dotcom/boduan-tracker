export const INDEX_REALTIME_CARDS = [
  { wsSymbol: 'GSPC.INDX', aliases: ['GSPC.INDX', 'GSPC', '^GSPC', '.SPX'], ticker: 'GSPC.INDX', displaySymbol: '.SPX', name: '标普500', cn: '标普500' },
  { wsSymbol: 'NDX.INDX', aliases: ['NDX.INDX', 'NDX', '^NDX', '.NDX'], ticker: 'NDX.INDX', displaySymbol: '.NDX', name: '纳斯达克100', cn: '纳斯达克100' },
  { wsSymbol: 'DJI.INDX', aliases: ['DJI.INDX', 'DJI', '^DJI', '.DJI'], ticker: 'DJI.INDX', displaySymbol: '.DJI', name: '道琼斯', cn: '道琼斯' },
];

export const INDEX_REALTIME_SYMBOLS = INDEX_REALTIME_CARDS.map((card) => card.wsSymbol).join(',');

const INDEX_ALIAS_MAP = new Map(
  INDEX_REALTIME_CARDS.flatMap((card) => (
    card.aliases.map((alias) => [alias.toUpperCase(), card])
  )),
);

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseTimestampMs(value, fallback = Date.now()) {
  const n = asNumber(value);
  if (!n || n <= 0) return fallback;
  return n < 1_000_000_000_000 ? Math.round(n * 1000) : Math.round(n);
}

export function normalizeIndexTick(rawTick, { receivedAt = Date.now() } = {}) {
  const raw = typeof rawTick === 'string' ? safeParseJson(rawTick) : rawTick;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const symbol = String(raw.s || raw.symbol || raw.code || '').trim().toUpperCase();
  if (!symbol) return null;
  const card = INDEX_ALIAS_MAP.get(symbol);
  if (!card) return null;

  const bid = asNumber(raw.bp ?? raw.bid);
  const ask = asNumber(raw.ap ?? raw.ask);
  const midpoint = bid && ask ? (bid + ask) / 2 : null;
  const price = asNumber(raw.p ?? raw.price ?? raw.close ?? raw.last ?? raw.lastTradePrice) ?? midpoint;
  if (!price || price <= 0) return null;

  const changePercent = asNumber(raw.dc ?? raw.changePercent ?? raw.change_p);
  const change = asNumber(raw.dd ?? raw.change);
  const timestamp = parseTimestampMs(raw.t ?? raw.timestamp, receivedAt);

  return {
    type: 'index_tick',
    symbol: card.wsSymbol,
    ticker: card.ticker,
    displaySymbol: card.displaySymbol,
    name: card.name,
    cn: card.cn,
    price,
    change: change ?? null,
    changePercent: changePercent ?? null,
    bid: bid ?? null,
    ask: ask ?? null,
    marketStatus: raw.ms || raw.marketStatus || null,
    timestamp,
    receivedAt,
    source: 'EODHD_WS',
  };
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
