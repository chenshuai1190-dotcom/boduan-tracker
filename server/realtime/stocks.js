const MAX_STOCK_REALTIME_SYMBOLS = 50;
const STOCK_REALTIME_SYMBOL_RE = /^[A-Z0-9._-]{1,15}$/;

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseTimestampMs(value, fallback = Date.now()) {
  const n = asNumber(value);
  if (!n || n <= 0) return fallback;
  return n < 1_000_000_000_000 ? Math.round(n * 1000) : Math.round(n);
}

function normalizeStockRealtimeSymbol(value) {
  const upper = String(value || '').trim().toUpperCase();
  const withoutUsSuffix = upper.endsWith('.US') ? upper.slice(0, -3) : upper;
  return STOCK_REALTIME_SYMBOL_RE.test(withoutUsSuffix) ? withoutUsSuffix : '';
}

export function parseStockRealtimeSymbolsParam(rawSymbols, { limit = MAX_STOCK_REALTIME_SYMBOLS } = {}) {
  const tokens = String(rawSymbols || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return { error: '需要传 symbols 参数,例如 ?symbols=NVDA,MSFT,TQQQ' };
  }

  const symbols = [];
  const seen = new Set();
  for (const token of tokens) {
    const symbol = normalizeStockRealtimeSymbol(token);
    if (!symbol) return { error: `股票代码不合法: ${token}` };
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    symbols.push(symbol);
    if (symbols.length > limit) {
      return { error: `实时股票数量不能超过 ${limit} 个` };
    }
  }

  return { symbols };
}

export function normalizeStockTick(rawTick, {
  symbols = null,
  receivedAt = Date.now(),
  source = 'EODHD_WS',
  defaultMarketStatus = null,
  priceType = '',
} = {}) {
  const raw = typeof rawTick === 'string' ? safeParseJson(rawTick) : rawTick;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const symbol = normalizeStockRealtimeSymbol(raw.s || raw.symbol || raw.code);
  if (!symbol) return null;
  if (symbols && !symbols.has(symbol)) return null;

  const bid = asNumber(raw.bp ?? raw.bid);
  const ask = asNumber(raw.ap ?? raw.ask);
  const midpoint = bid && ask ? (bid + ask) / 2 : null;
  const tradePrice = asNumber(raw.p ?? raw.price ?? raw.close ?? raw.last ?? raw.lastTradePrice);
  const price = tradePrice ?? midpoint;
  if (!price || price <= 0) return null;

  const changePercent = asNumber(raw.dc ?? raw.changePercent ?? raw.change_p);
  const change = asNumber(raw.dd ?? raw.change);
  const previousClose = asNumber(raw.previousClose ?? raw.previousClosePrice ?? raw.pc);
  const timestamp = parseTimestampMs(raw.t ?? raw.timestamp, receivedAt);

  return {
    type: 'stock_tick',
    symbol,
    price,
    change: change ?? null,
    changePercent: changePercent ?? null,
    previousClose: previousClose && previousClose > 0 ? previousClose : null,
    bid: bid ?? null,
    ask: ask ?? null,
    priceType: priceType || (tradePrice ? 'trade' : 'quote-midpoint'),
    marketStatus: raw.ms || raw.marketStatus || defaultMarketStatus,
    timestamp,
    receivedAt,
    source,
  };
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
