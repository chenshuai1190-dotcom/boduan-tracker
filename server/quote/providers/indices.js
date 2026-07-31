import { providerFetch, QUOTE_TIMEOUTS } from '../http.js';
import {
  EODHD_INDEX_COMPLETED_CACHE_TTL_MS,
  EODHD_INDEX_LIVE_CACHE_TTL_MS,
  getLatestCompletedUsTradingDate,
  getUsEasternMarketClock,
  isUsMarketTradingDate,
  loadEodhdIndexIntraday,
} from '../eodhdCache.js';

const MARKET_CARDS = [
  { ticker: 'GSPC.INDX', displaySymbol: '.SPX', name: '标普500', cn: '标普500' },
  { ticker: 'NDX.INDX', displaySymbol: '.NDX', name: '纳斯达克100', cn: '纳斯达克100' },
  { ticker: 'DJI.INDX', displaySymbol: '.DJI', name: '道琼斯', cn: '道琼斯' },
];
const INDEX_INTRADAY_LOOKBACK_DAYS = 7;
const INDEX_INTRADAY_MAX_POINTS = 80;
const INDEX_REGULAR_START_MINUTES = 9 * 60 + 30;
const INDEX_REGULAR_END_MINUTES = 16 * 60;
const INDEX_LIVE_BUCKET_MINUTES = 5;

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseRealtimeQuote(data) {
  const currentPrice = asNumber(data?.close || data?.price || data?.lastTradePrice || data?.last);
  const previousClose = asNumber(data?.previousClose || data?.previousClosePrice || data?.prev_close);
  const change = Number.isFinite(Number(data?.change))
    ? Number(data.change)
    : currentPrice - previousClose;
  const changePercent = Number.isFinite(Number(data?.change_p))
    ? Number(data.change_p)
    : (Number.isFinite(Number(data?.changePercent))
      ? Number(data.changePercent)
      : (previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0));

  return {
    currentPrice,
    previousClose,
    change,
    changePercent,
    dayHigh: asNumber(data?.high) || currentPrice,
    dayLow: asNumber(data?.low) || currentPrice,
  };
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
  if (!Array.isArray(rows)) return { sessionDate: '', values: [] };
  const points = rows
    .map((row) => ({
      dateKey: intradayDateKey(row),
      sortKey: intradaySortKey(row),
      close: asNumber(row?.close || row?.price || row?.last || row?.c),
    }))
    .filter((row) => row.dateKey && row.close > 0);
  if (points.length < 2) return { sessionDate: '', values: [] };
  const latestDateKey = points.reduce((latest, row) => (row.dateKey > latest ? row.dateKey : latest), '');
  const latestSessionPoints = points
    .filter((row) => row.dateKey === latestDateKey)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map((row) => row.close);
  return {
    sessionDate: latestDateKey,
    values: sampleIntraday(latestSessionPoints),
  };
}

export function getIndexIntradayCachePolicy(now = Date.now()) {
  const clock = getUsEasternMarketClock(now);
  const isRegular = clock
    && isUsMarketTradingDate(clock.date)
    && clock.minutes >= INDEX_REGULAR_START_MINUTES
    && clock.minutes < INDEX_REGULAR_END_MINUTES;

  if (isRegular) {
    const liveBucket = Math.floor(
      (clock.minutes - INDEX_REGULAR_START_MINUTES) / INDEX_LIVE_BUCKET_MINUTES,
    );
    return {
      sessionKey: `${clock.date}:regular:${liveBucket}`,
      expectedDate: clock.date,
      ttlMs: EODHD_INDEX_LIVE_CACHE_TTL_MS,
      session: 'regular',
    };
  }

  const completedDate = getLatestCompletedUsTradingDate(now);
  if (completedDate) {
    return {
      sessionKey: `${completedDate}:completed`,
      expectedDate: completedDate,
      ttlMs: EODHD_INDEX_COMPLETED_CACHE_TTL_MS,
      session: 'completed',
    };
  }

  return {
    sessionKey: `fallback:${Math.floor(Number(now) / EODHD_INDEX_LIVE_CACHE_TTL_MS)}`,
    ttlMs: EODHD_INDEX_LIVE_CACHE_TTL_MS,
    session: 'fallback',
  };
}

async function fetchIndexIntraday(card, eodhdKey, now) {
  const cachePolicy = getIndexIntradayCachePolicy(now);
  let loadedSessionDate = '';

  try {
    const to = Math.floor(now / 1000);
    const from = to - INDEX_INTRADAY_LOOKBACK_DAYS * 24 * 60 * 60;
    const intradayUrl = `https://eodhd.com/api/intraday/${card.ticker}?api_token=${eodhdKey}&fmt=json&interval=5m&from=${from}&to=${to}`;
    return await loadEodhdIndexIntraday({
      ticker: card.ticker,
      sessionKey: cachePolicy.sessionKey,
      ttlMs: cachePolicy.ttlMs,
      now,
      shouldCache: () => (
        !cachePolicy.expectedDate || loadedSessionDate === cachePolicy.expectedDate
      ),
      load: async () => {
        const intradayRes = await providerFetch(intradayUrl, {}, { provider: 'eodhd:index-intraday', timeoutMs: QUOTE_TIMEOUTS.eodhd });
        if (!intradayRes.ok) throw new Error(`EODHD HTTP ${intradayRes.status}`);
        const rows = await intradayRes.json();
        const parsed = parseIntradaySeries(rows);
        loadedSessionDate = parsed.sessionDate;
        return parsed.values;
      },
    });
  } catch {
    return [];
  }
}

async function fetchMarketCard(card, eodhdKey, now) {
  try {
    const eodhdUrl = `https://eodhd.com/api/real-time/${card.ticker}?api_token=${eodhdKey}&fmt=json`;
    const eodhdRes = await providerFetch(eodhdUrl, {}, { provider: 'eodhd:index-card', timeoutMs: QUOTE_TIMEOUTS.eodhd });

    if (!eodhdRes.ok) {
      return { ticker: card.ticker, displaySymbol: card.displaySymbol, name: card.name, cn: card.cn, error: `EODHD HTTP ${eodhdRes.status}` };
    }

    const data = await eodhdRes.json();
    const quote = parseRealtimeQuote(data);
    if (quote.currentPrice <= 0) {
      return { ticker: card.ticker, displaySymbol: card.displaySymbol, name: card.name, cn: card.cn, error: 'EODHD 没返回数据' };
    }
    const intraday = await fetchIndexIntraday(card, eodhdKey, now);

    return {
      ticker: card.ticker,
      displaySymbol: card.displaySymbol,
      name: card.name,
      cn: card.cn,
      price: quote.currentPrice,
      previousClose: quote.previousClose,
      change: quote.change,
      changePercent: quote.changePercent,
      intraday,
      dayHigh: quote.dayHigh,
      dayLow: quote.dayLow,
      source: 'EODHD',
    };
  } catch (e) {
    return { ticker: card.ticker, displaySymbol: card.displaySymbol, name: card.name, cn: card.cn, error: `请求失败: ${e.message}` };
  }
}

export async function fetchIndicesQuote(symbol, { eodhdKey, now = Date.now() }) {
  try {
    const results = await Promise.all(MARKET_CARDS.map(card => fetchMarketCard(card, eodhdKey, now)));
    return { symbol: 'INDICES', data: results, source: 'EODHD', fetchedAt: new Date(now).toISOString() };
  } catch (e) {
    return { symbol: 'INDICES', error: `指数请求失败: ${e.message}` };
  }
}
