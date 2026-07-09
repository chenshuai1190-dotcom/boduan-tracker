import { configuredOrigins } from '../quote/auth.js';

export const BTC_REALTIME_PROTOCOL = 'xmoney-btc';
export const INDICES_REALTIME_PROTOCOL = 'xmoney-indices';
export const STOCKS_REALTIME_PROTOCOL = 'xmoney-stocks';
const SUPABASE_PROTOCOL_PREFIX = 'supabase.';

export function parseWebSocketProtocols(value) {
  return String(value || '')
    .split(',')
    .map((protocol) => protocol.trim())
    .filter(Boolean);
}

export function selectRealtimeProtocol(protocols) {
  const offered = protocols instanceof Set ? protocols : new Set(protocols || []);
  if (offered.has(BTC_REALTIME_PROTOCOL)) return BTC_REALTIME_PROTOCOL;
  if (offered.has(INDICES_REALTIME_PROTOCOL)) return INDICES_REALTIME_PROTOCOL;
  if (offered.has(STOCKS_REALTIME_PROTOCOL)) return STOCKS_REALTIME_PROTOCOL;
  return false;
}

export function extractRealtimeAccessToken(req) {
  const authHeader = req?.headers?.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  const protocols = parseWebSocketProtocols(req?.headers?.['sec-websocket-protocol']);
  const tokenProtocol = protocols.find((protocol) => protocol.startsWith(SUPABASE_PROTOCOL_PREFIX));
  return tokenProtocol ? tokenProtocol.slice(SUPABASE_PROTOCOL_PREFIX.length).trim() : '';
}

export function isAllowedRealtimeOrigin(req) {
  const origin = req?.headers?.origin;
  if (!origin) return true;

  const allowed = configuredOrigins(req);
  if (allowed.has(origin)) return true;

  const host = req?.headers?.host || '';
  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) {
    return origin === `http://${host}` || origin === `https://${host}`;
  }

  return false;
}
