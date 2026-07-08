import { providerFetch, QUOTE_TIMEOUTS } from '../http.js';

const MARKET_CARDS = [
  { ticker: 'GSPC.INDX', displaySymbol: '.SPX', name: '标普500', cn: '标普500' },
  { ticker: 'NDX.INDX', displaySymbol: '.NDX', name: '纳斯达克100', cn: '纳斯达克100' },
  { ticker: 'DJI.INDX', displaySymbol: '.DJI', name: '道琼斯', cn: '道琼斯' },
];
const INDEX_INTRADAY_CACHE_TTL_MS = 5 * 60 * 1000;
const INDEX_INTRADAY_LOOKBACK_DAYS = 7;
const INDEX_INTRADAY_MAX_POINTS = 80;
const indexIntradayCache = new Map();

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

async function fetchIndexIntraday(card, eodhdKey) {
  const cached = indexIntradayCache.get(card.ticker);
  const now = Date.now();
  if (cached && now - cached.cachedAt < INDEX_INTRADAY_CACHE_TTL_MS) return cached.values;

  try {
    const to = Math.floor(now / 1000);
    const from = to - INDEX_INTRADAY_LOOKBACK_DAYS * 24 * 60 * 60;
    const intradayUrl = `https://eodhd.com/api/intraday/${card.ticker}?api_token=${eodhdKey}&fmt=json&interval=5m&from=${from}&to=${to}`;
    const intradayRes = await providerFetch(intradayUrl, {}, { provider: 'eodhd:index-intraday', timeoutMs: QUOTE_TIMEOUTS.eodhd });
    if (!intradayRes.ok) {
      indexIntradayCache.set(card.ticker, { cachedAt: now, values: [] });
      return [];
    }
    const rows = await intradayRes.json();
    const values = parseIntradaySeries(rows);
    indexIntradayCache.set(card.ticker, { cachedAt: now, values });
    return values;
  } catch {
    indexIntradayCache.set(card.ticker, { cachedAt: now, values: [] });
    return [];
  }
}

async function fetchMarketCard(card, eodhdKey) {
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
    const intraday = await fetchIndexIntraday(card, eodhdKey);

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

export async function fetchIndicesQuote(symbol, { eodhdKey }) {
  try {
    const results = await Promise.all(MARKET_CARDS.map(card => fetchMarketCard(card, eodhdKey)));
    return { symbol: 'INDICES', data: results, source: 'EODHD', fetchedAt: new Date().toISOString() };
  } catch (e) {
    return { symbol: 'INDICES', error: `指数请求失败: ${e.message}` };
  }
}
