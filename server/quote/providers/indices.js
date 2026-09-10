import { providerFetch, QUOTE_TIMEOUTS } from '../http.js';
import { INDEX_QUOTE_CARDS, loadIndexQuotes } from '../../realtime/indexQuotes.js';

const INDEX_INTRADAY_CACHE_TTL_MS = 5 * 60 * 1000;
const INDEX_INTRADAY_LOOKBACK_DAYS = 7;
const INDEX_INTRADAY_MAX_POINTS = 80;
const indexIntradayCache = new Map();
const indexIntradayInFlight = new Map();
let indexIntradayQuotaBlockedUntil = 0;

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function intradayDateKey(row) {
  const rawDate = row?.datetime || row?.date || row?.timestamp || row?.t;
  if (typeof rawDate === 'string' && rawDate.length >= 10) return rawDate.slice(0, 10);
  const numericDate = Number(rawDate);
  if (Number.isFinite(numericDate) && numericDate > 0) {
    const ms = numericDate > 10_000_000_000 ? numericDate : numericDate * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return '';
}

function intradaySortKey(row) {
  const rawDate = row?.datetime || row?.date || row?.timestamp || row?.t;
  if (typeof rawDate === 'string') return rawDate;
  const numericDate = Number(rawDate);
  if (Number.isFinite(numericDate) && numericDate > 0) {
    const ms = numericDate > 10_000_000_000 ? numericDate : numericDate * 1000;
    return String(ms).padStart(13, '0');
  }
  return '';
}

function sampleIntraday(values, maxPoints = INDEX_INTRADAY_MAX_POINTS) {
  if (values.length <= maxPoints) return values;
  const sampled = [];
  const step = (values.length - 1) / (maxPoints - 1);
  for (let index = 0; index < maxPoints; index += 1) {
    sampled.push(values[Math.round(index * step)]);
  }
  return sampled;
}

function parseIntradaySeries(rows) {
  if (!Array.isArray(rows)) return [];
  const points = rows
    .map((row) => ({
      dateKey: intradayDateKey(row),
      sortKey: intradaySortKey(row),
      close: asNumber(row?.close || row?.price || row?.last || row?.c),
    }))
    .filter((row) => row.dateKey && row.close > 0);
  if (points.length < 2) return [];
  const latestDateKey = points.reduce((latest, row) => (row.dateKey > latest ? row.dateKey : latest), '');
  const latestSessionPoints = points
    .filter((row) => row.dateKey === latestDateKey)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map((row) => row.close);
  return sampleIntraday(latestSessionPoints);
}

async function fetchIndexIntraday(card, eodhdKey, fetchImpl) {
  const cached = indexIntradayCache.get(card.ticker);
  const now = Date.now();
  if (now < indexIntradayQuotaBlockedUntil) return cached?.values || [];
  if (cached && now - cached.cachedAt < INDEX_INTRADAY_CACHE_TTL_MS) return cached.values;
  if (indexIntradayInFlight.has(card.ticker)) return indexIntradayInFlight.get(card.ticker);

  const pending = (async () => {
    try {
      const to = Math.floor(now / 1000);
      const from = to - INDEX_INTRADAY_LOOKBACK_DAYS * 24 * 60 * 60;
      const intradayUrl = `https://eodhd.com/api/intraday/${card.ticker}?api_token=${eodhdKey}&fmt=json&interval=5m&from=${from}&to=${to}`;
      const intradayRes = await providerFetch(intradayUrl, {}, { provider: 'eodhd:index-intraday', timeoutMs: QUOTE_TIMEOUTS.eodhd, fetchImpl });
      if (!intradayRes.ok) {
        if (intradayRes.status === 402) {
          const date = new Date(now);
          indexIntradayQuotaBlockedUntil = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
        }
        const values = cached?.values || [];
        indexIntradayCache.set(card.ticker, { cachedAt: now, values });
        return values;
      }
      const rows = await intradayRes.json();
      const values = parseIntradaySeries(rows);
      indexIntradayCache.set(card.ticker, { cachedAt: now, values });
      return values;
    } catch {
      const values = cached?.values || [];
      indexIntradayCache.set(card.ticker, { cachedAt: now, values });
      return values;
    }
  })().finally(() => { indexIntradayInFlight.delete(card.ticker); });
  indexIntradayInFlight.set(card.ticker, pending);
  return pending;
}

export async function fetchIndicesQuote(symbol, { eodhdKey, fetchImpl, loadQuotes = loadIndexQuotes, includeIntraday = true } = {}) {
  const snapshot = await loadQuotes({ eodhdKey, fetchImpl });
  const ticks = new Map(snapshot.ticks.map(tick => [tick.ticker, tick]));
  const errors = new Map(snapshot.errors.map(error => [error.ticker, error]));
  const results = await Promise.all(INDEX_QUOTE_CARDS.map(async card => {
    const tick = ticks.get(card.ticker);
    if (!tick) return { ...card, error: errors.get(card.ticker)?.error || 'EODHD 指数暂无有效报价', source: 'EODHD_REST', realtime: false };
    const intraday = includeIntraday && !snapshot.quotaBlockedUntil && !tick.fetchError
      ? await fetchIndexIntraday(card, eodhdKey, fetchImpl)
      : (indexIntradayCache.get(card.ticker)?.values || []);
    return { ...tick, intraday };
  }));
  return { symbol: 'INDICES', data: results, source: 'EODHD_REST', realtime: false, fetchedAt: new Date().toISOString() };
}
