export const BTC_REALTIME_SYMBOL = 'BTC-USD';
export const BTC_REST_TICKER = 'BTC-USD.CC';
const BTC_DISPLAY_SYMBOL = 'BTCUSD';
const BTC_DISPLAY_NAME = 'BTC/美元';

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseTimestampMs(value, fallback = Date.now()) {
  const n = asNumber(value);
  if (!n || n <= 0) return fallback;
  return n < 1_000_000_000_000 ? Math.round(n * 1000) : Math.round(n);
}

export function sanitizeEodhdKey(value) {
  return String(value || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
}

export function parseEodhdProviderStatus(rawMessage) {
  const raw = typeof rawMessage === 'string' ? safeParseJson(rawMessage) : rawMessage;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const statusCode = asNumber(raw.status_code ?? raw.statusCode);
  if (statusCode === null) return null;

  return {
    statusCode,
    message: String(raw.message || raw.error || '').trim(),
    isError: statusCode >= 400,
  };
}

export function normalizeBtcTick(rawTick, { receivedAt = Date.now() } = {}) {
  const raw = typeof rawTick === 'string' ? safeParseJson(rawTick) : rawTick;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const symbol = String(raw.s || raw.symbol || '').trim().toUpperCase();
  if (symbol && symbol !== BTC_REALTIME_SYMBOL) return null;

  const price = asNumber(raw.p ?? raw.price ?? raw.close ?? raw.last);
  if (!price || price <= 0) return null;

  const changePercent = asNumber(raw.dc ?? raw.changePercent ?? raw.change_p);
  const change = asNumber(raw.dd ?? raw.change);
  const quantity = asNumber(raw.q ?? raw.quantity ?? raw.size);
  const timestamp = parseTimestampMs(raw.t ?? raw.timestamp, receivedAt);

  return {
    type: 'btc_tick',
    symbol: BTC_REALTIME_SYMBOL,
    ticker: BTC_REST_TICKER,
    displaySymbol: BTC_DISPLAY_SYMBOL,
    name: BTC_DISPLAY_NAME,
    price,
    change: change ?? null,
    changePercent: changePercent ?? null,
    quantity: quantity ?? null,
    timestamp,
    receivedAt,
    source: 'EODHD_WS',
  };
}

export function normalizeBtcRestQuote(rawQuote, { receivedAt = Date.now() } = {}) {
  const parsed = typeof rawQuote === 'string' ? safeParseJson(rawQuote) : rawQuote;
  const raw = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!raw || typeof raw !== 'object') return null;

  const ticker = String(raw.code || raw.ticker || '').trim().toUpperCase();
  if (ticker && ticker !== BTC_REST_TICKER) return null;

  const price = asNumber(raw.close ?? raw.price ?? raw.last);
  if (!price || price <= 0) return null;

  let previousClose = asNumber(raw.previousClose ?? raw.previous_close);
  let change = asNumber(raw.change ?? raw.dd);
  let changePercent = asNumber(raw.change_p ?? raw.changePercent ?? raw.dc);

  if ((!previousClose || previousClose <= 0) && change !== null) {
    const derivedPreviousClose = price - change;
    if (derivedPreviousClose > 0) previousClose = derivedPreviousClose;
  }
  if (
    (!previousClose || previousClose <= 0)
    && changePercent !== null
    && changePercent > -100
  ) {
    const derivedPreviousClose = price / (1 + changePercent / 100);
    if (derivedPreviousClose > 0) previousClose = derivedPreviousClose;
  }
  if (!previousClose || previousClose <= 0) previousClose = price;

  if (change === null) change = price - previousClose;
  if (changePercent === null) {
    changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;
  }

  const timestamp = parseTimestampMs(raw.timestamp ?? raw.t, receivedAt);

  return {
    type: 'btc_tick',
    symbol: BTC_REALTIME_SYMBOL,
    ticker: BTC_REST_TICKER,
    displaySymbol: BTC_DISPLAY_SYMBOL,
    name: BTC_DISPLAY_NAME,
    price,
    previousClose,
    change,
    changePercent,
    quantity: asNumber(raw.volume ?? raw.quantity),
    intraday: [previousClose, price],
    timestamp,
    receivedAt,
    source: 'EODHD_REST',
  };
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
