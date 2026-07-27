import { userScopedStorageKey } from './userScopedStorage.js';
import { normalizeUserStockSymbol } from './symbols.js';

export const STOCK_QUOTE_BOOTSTRAP_CACHE_TTL_MS = 15 * 60 * 1000;
export const STOCK_QUOTE_BOOTSTRAP_CACHE_MAX_ROWS = 50;
export const STOCK_QUOTE_BOOTSTRAP_CACHE_SCHEMA_VERSION = 1;
export const STOCK_QUOTE_BOOTSTRAP_CACHE_BASE_KEY = 'boduan.stock-quote-bootstrap.v1';

const CACHE_SCHEMA = 'boduan.stock-quote-bootstrap';
const ALLOWED_ROW_KEYS = new Set([
  'symbol',
  'name',
  'price',
  'change',
  'changePercent',
  'previousClose',
  'high',
  'week52High',
  'currency',
  'marketStatus',
  'source',
  'priceSource',
  'timestamp',
  'receivedAt',
  'clientReceivedAt',
  'realtimeAt',
]);

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function normalizeUserId(value) {
  const userId = String(value || '').trim();
  return userId && userId.length <= 256 ? userId : '';
}

function normalizeSymbol(value) {
  return normalizeUserStockSymbol(value);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function normalizeText(value, maxLength) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) return '';
  return text;
}

function normalizeCurrency(value) {
  const currency = normalizeText(value, 8).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : '';
}

function normalizeTimestamp(value) {
  const number = finiteNumber(value);
  if (number === null || number <= 0) return null;
  const milliseconds = number < 1_000_000_000_000 ? number * 1000 : number;
  return Number.isSafeInteger(milliseconds) && milliseconds > 0 ? milliseconds : null;
}

function nowValue(now) {
  const value = typeof now === 'function' ? now() : now;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : Date.now();
}

function cacheKey(userId) {
  return userScopedStorageKey(STOCK_QUOTE_BOOTSTRAP_CACHE_BASE_KEY, userId);
}

function removeStored(storage, key) {
  try {
    storage?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function assignOptionalNumber(target, key, value, { positive = false } = {}) {
  const normalized = positive ? positiveNumber(value) : finiteNumber(value);
  if (normalized !== null) target[key] = normalized;
}

function assignOptionalText(target, key, value, maxLength) {
  const normalized = normalizeText(value, maxLength);
  if (normalized) target[key] = normalized;
}

function assignOptionalTimestamp(target, key, value) {
  const normalized = normalizeTimestamp(value);
  if (normalized !== null) target[key] = normalized;
}

function normalizeQuoteRow(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const symbol = normalizeSymbol(value.symbol);
  const price = positiveNumber(value.price);
  const previousClose = positiveNumber(value.previousClose)
    || positiveNumber(value.dailyBaselineClose)
    || positiveNumber(value.dailyPnlBaselineClose);
  if (!symbol || price === null || previousClose === null) return null;

  const row = { symbol, price, previousClose };
  assignOptionalText(row, 'name', value.name, 120);
  assignOptionalNumber(row, 'change', value.change);
  assignOptionalNumber(row, 'changePercent', value.changePercent);
  assignOptionalNumber(row, 'high', value.high, { positive: true });
  assignOptionalNumber(row, 'week52High', value.week52High, { positive: true });

  const currency = normalizeCurrency(value.currency);
  if (currency) row.currency = currency;
  assignOptionalText(row, 'marketStatus', value.marketStatus, 40);
  assignOptionalText(row, 'source', value.source, 80);
  assignOptionalText(row, 'priceSource', value.priceSource, 80);
  assignOptionalTimestamp(row, 'timestamp', value.timestamp);
  assignOptionalTimestamp(row, 'receivedAt', value.receivedAt);
  assignOptionalTimestamp(row, 'clientReceivedAt', value.clientReceivedAt);
  assignOptionalTimestamp(row, 'realtimeAt', value.realtimeAt);
  return row;
}

function isStrictStoredRow(value, normalized) {
  if (!normalized) return false;
  const keys = Object.keys(value);
  const normalizedKeys = Object.keys(normalized);
  if (keys.length !== normalizedKeys.length) return false;
  if (keys.some((key) => !ALLOWED_ROW_KEYS.has(key))) return false;
  return normalizedKeys.every((key) => Object.hasOwn(value, key) && Object.is(value[key], normalized[key]));
}

function normalizeRowsForWrite(rows) {
  if (!Array.isArray(rows)) return [];
  const bySymbol = new Map();
  rows.forEach((value) => {
    const row = normalizeQuoteRow(value);
    if (!row) return;
    bySymbol.set(row.symbol, row);
  });
  return Array.from(bySymbol.values()).slice(0, STOCK_QUOTE_BOOTSTRAP_CACHE_MAX_ROWS);
}

export function readStockQuoteBootstrapCache({
  userId,
  storage = defaultStorage(),
  now = Date.now,
} = {}) {
  const normalizedUserId = normalizeUserId(userId);
  const key = cacheKey(normalizedUserId);
  if (!key || !storage) return [];

  let payload;
  try {
    payload = JSON.parse(storage.getItem(key) || 'null');
  } catch {
    removeStored(storage, key);
    return [];
  }

  const currentTime = nowValue(now);
  const savedAt = finiteNumber(payload?.savedAt);
  const expiresAt = finiteNumber(payload?.expiresAt);
  const rows = payload?.rows;
  const envelopeIsValid = (
    payload
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && payload.schema === CACHE_SCHEMA
    && payload.version === STOCK_QUOTE_BOOTSTRAP_CACHE_SCHEMA_VERSION
    && payload.userId === normalizedUserId
    && Number.isSafeInteger(savedAt)
    && savedAt > 0
    && savedAt <= currentTime
    && Number.isSafeInteger(expiresAt)
    && expiresAt - savedAt === STOCK_QUOTE_BOOTSTRAP_CACHE_TTL_MS
    && expiresAt > currentTime
    && Array.isArray(rows)
    && rows.length > 0
    && rows.length <= STOCK_QUOTE_BOOTSTRAP_CACHE_MAX_ROWS
  );
  if (!envelopeIsValid) {
    removeStored(storage, key);
    return [];
  }

  const normalizedRows = [];
  for (const value of rows) {
    const normalized = normalizeQuoteRow(value);
    if (!isStrictStoredRow(value, normalized)) {
      removeStored(storage, key);
      return [];
    }
    normalizedRows.push(normalized);
  }
  if (new Set(normalizedRows.map((row) => row.symbol)).size !== normalizedRows.length) {
    removeStored(storage, key);
    return [];
  }
  return normalizedRows;
}

export function writeStockQuoteBootstrapCache({
  userId,
  rows,
  storage = defaultStorage(),
  now = Date.now,
} = {}) {
  const normalizedUserId = normalizeUserId(userId);
  const key = cacheKey(normalizedUserId);
  if (!key || !storage) return false;

  const normalizedRows = normalizeRowsForWrite(rows);
  if (normalizedRows.length === 0) return false;
  const savedAt = nowValue(now);
  const payload = {
    schema: CACHE_SCHEMA,
    version: STOCK_QUOTE_BOOTSTRAP_CACHE_SCHEMA_VERSION,
    userId: normalizedUserId,
    savedAt,
    expiresAt: savedAt + STOCK_QUOTE_BOOTSTRAP_CACHE_TTL_MS,
    rows: normalizedRows,
  };
  try {
    storage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearStockQuoteBootstrapCache({
  userId,
  storage = defaultStorage(),
} = {}) {
  const normalizedUserId = normalizeUserId(userId);
  const key = cacheKey(normalizedUserId);
  if (!key || !storage) return false;
  return removeStored(storage, key);
}
