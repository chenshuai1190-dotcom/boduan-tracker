import { providerFetch, QUOTE_TIMEOUTS } from '../quote/http.js';

const FOREX_SYMBOLS = Object.freeze({
  usdCny: 'USDCNY.FOREX',
  usdHkd: 'USDHKD.FOREX',
});

function asPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function roundRate(value) {
  return Math.round(value * 10000) / 10000;
}

export function parseForexRate(data) {
  return asPositiveNumber(
    data?.close
    || data?.price
    || data?.last
    || data?.lastTradePrice
    || data?.previousClose
  );
}

export async function fetchEodhdForexRate(symbol, { eodhdKey, fetchImpl } = {}) {
  const url = `https://eodhd.com/api/real-time/${symbol}?api_token=${encodeURIComponent(eodhdKey)}&fmt=json`;
  const response = await providerFetch(url, {}, {
    provider: `eodhd:fx:${symbol}`,
    timeoutMs: QUOTE_TIMEOUTS.eodhd,
    fetchImpl,
  });

  if (!response.ok) {
    throw new Error(`${symbol} HTTP ${response.status}`);
  }

  const data = await response.json();
  const rate = parseForexRate(data);
  if (!rate) {
    throw new Error(`${symbol} 没有返回有效汇率`);
  }

  return {
    symbol,
    rate,
    rawDate: data?.date || null,
    rawTimestamp: data?.timestamp || null,
  };
}

export async function fetchDailyFxRates({ eodhdKey, fetchImpl, now = new Date() } = {}) {
  if (!eodhdKey) throw new Error('缺少 EODHD_API_KEY');

  const [usdCny, usdHkd] = await Promise.all([
    fetchEodhdForexRate(FOREX_SYMBOLS.usdCny, { eodhdKey, fetchImpl }),
    fetchEodhdForexRate(FOREX_SYMBOLS.usdHkd, { eodhdKey, fetchImpl }),
  ]);

  const hkdCny = usdCny.rate / usdHkd.rate;
  return {
    source: 'EODHD',
    base: 'USD',
    quote: 'CNY',
    rates: {
      CNY: roundRate(usdCny.rate),
      HKD: roundRate(hkdCny),
    },
    pairs: {
      USDCNY: usdCny,
      USDHKD: usdHkd,
    },
    fetchedAt: now.toISOString(),
  };
}
