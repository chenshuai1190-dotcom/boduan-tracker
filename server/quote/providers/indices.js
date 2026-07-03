import { providerFetch, QUOTE_TIMEOUTS } from '../http.js';

const MARKET_CARDS = [
  { ticker: 'GSPC.INDX', displaySymbol: '.SPX', name: '标普500', cn: '标普500', chartSymbol: '^GSPC' },
  { ticker: 'NDX.INDX', displaySymbol: '.NDX', name: '纳斯达克100', cn: '纳斯达克100', chartSymbol: '^NDX' },
  { ticker: 'DJI.INDX', displaySymbol: '.DJI', name: '道琼斯', cn: '道琼斯', chartSymbol: '^DJI' },
  { ticker: 'BTC-USD.CC', displaySymbol: 'BTCUSD', name: 'BTC/美元', cn: 'BTC/美元', chartSymbol: 'BTC-USD' },
];

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

async function fetchYahooIntraday(chartSymbol) {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(chartSymbol)}?interval=5m&range=1d&includePrePost=true`;
  const yahooRes = await providerFetch(yahooUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
  }, { provider: 'yahoo:index-chart', timeoutMs: QUOTE_TIMEOUTS.yahoo }).catch(() => null);

  if (!yahooRes?.ok) return [];
  try {
    const yahooData = await yahooRes.json();
    const result = yahooData?.chart?.result?.[0];
    const closes = result?.indicators?.quote?.[0]?.close || [];
    return closes.filter(v => v !== null && v !== undefined && !isNaN(v));
  } catch (e) {
    return [];
  }
}

async function fetchMarketCard(card, eodhdKey) {
  try {
    const eodhdUrl = `https://eodhd.com/api/real-time/${card.ticker}?api_token=${eodhdKey}&fmt=json`;
    const [eodhdRes, intraday] = await Promise.all([
      providerFetch(eodhdUrl, {}, { provider: 'eodhd:market-card', timeoutMs: QUOTE_TIMEOUTS.eodhd }),
      fetchYahooIntraday(card.chartSymbol),
    ]);

    if (!eodhdRes.ok) {
      return { ticker: card.ticker, displaySymbol: card.displaySymbol, name: card.name, cn: card.cn, error: `EODHD HTTP ${eodhdRes.status}` };
    }

    const data = await eodhdRes.json();
    const quote = parseRealtimeQuote(data);
    if (quote.currentPrice <= 0) {
      return { ticker: card.ticker, displaySymbol: card.displaySymbol, name: card.name, cn: card.cn, error: 'EODHD 没返回数据' };
    }

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
