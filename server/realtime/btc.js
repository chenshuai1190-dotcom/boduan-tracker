export const BTC_REALTIME_SYMBOL = 'BTC-USD';
const BTC_REST_TICKER = 'BTC-USD.CC';
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

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
