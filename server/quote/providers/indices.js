import { providerFetch, QUOTE_TIMEOUTS } from '../http.js';

export async function fetchIndicesQuote(symbol, { eodhdKey }) {
  try {
    const indices = [
      { ticker: 'SPY.US', name: '标普500 ETF', cn: '标普', symbol: 'SPY' },
      { ticker: 'QQQ.US', name: '纳斯达克100 ETF', cn: '纳指', symbol: 'QQQ' },
    ];

    const tickers = indices.map(i => i.ticker).join(',');
    const v2Url = `https://eodhd.com/api/us-quote-delayed?s=${tickers}&api_token=${eodhdKey}&fmt=json`;

    const yahooPromises = indices.map(idx =>
      providerFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${idx.symbol}?interval=5m&range=1d&includePrePost=true`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      }, { provider: 'yahoo:index-chart', timeoutMs: QUOTE_TIMEOUTS.yahoo }).catch(() => null)
    );

    const [v2Res, ...yahooResults] = await Promise.all([
      providerFetch(v2Url, {}, { provider: 'eodhd:indices', timeoutMs: QUOTE_TIMEOUTS.eodhd }),
      ...yahooPromises,
    ]);

    let v2Data = {};
    if (v2Res.ok) {
      try {
        const v2Json = await v2Res.json();
        v2Data = v2Json?.data || {};
      } catch (e) {
        /* ignore */
      }
    }

    const idxResults = await Promise.all(indices.map(async (idx, i) => {
      try {
        const d = v2Data[idx.ticker];
        let eodhdPrice = 0;
        let eodhdPrevClose = 0;
        let eodhdHigh = 0;
        let eodhdLow = 0;
        let eodhdChange;
        let eodhdChangePercent;
        let eodhdEthPrice;
        if (d) {
          eodhdEthPrice = parseFloat(d.ethPrice);
          if (isNaN(eodhdEthPrice)) eodhdEthPrice = undefined;
          const lastTradePrice = parseFloat(d.lastTradePrice) || 0;
          eodhdPrice = (eodhdEthPrice && eodhdEthPrice > 0) ? eodhdEthPrice : lastTradePrice;
          eodhdPrevClose = parseFloat(d.previousClosePrice) || 0;
          eodhdHigh = parseFloat(d.high) || 0;
          eodhdLow = parseFloat(d.low) || 0;
          eodhdChange = parseFloat(d.change);
          eodhdChangePercent = parseFloat(d.changePercent);
          if (isNaN(eodhdChange)) eodhdChange = undefined;
          if (isNaN(eodhdChangePercent)) eodhdChangePercent = undefined;
        }

        let intraday = [];
        const yahooRes = yahooResults[i];
        if (yahooRes && yahooRes.ok) {
          try {
            const yahooData = await yahooRes.json();
            const result = yahooData?.chart?.result?.[0];
            const closes = result?.indicators?.quote?.[0]?.close || [];
            intraday = closes.filter(v => v !== null && v !== undefined && !isNaN(v));
          } catch (e) {
            /* ignore */
          }
        }

        const currentPrice = eodhdPrice > 0 ? eodhdPrice : 0;
        const previousClose = eodhdPrevClose;
        const change = (eodhdChange !== undefined) ? eodhdChange : (currentPrice - previousClose);
        const changePercent = (eodhdChangePercent !== undefined) ? eodhdChangePercent
          : (previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0);

        if (currentPrice === 0) {
          return { ticker: idx.ticker, name: idx.name, error: 'EODHD 没返回数据' };
        }

        return {
          ticker: idx.ticker,
          name: idx.name,
          cn: idx.cn,
          price: currentPrice,
          previousClose,
          change,
          changePercent,
          intraday,
          dayHigh: eodhdHigh || currentPrice,
          dayLow: eodhdLow || currentPrice,
          source: 'EODHD-v2',
        };
      } catch (e) {
        return { ticker: idx.ticker, name: idx.name, error: `请求失败: ${e.message}` };
      }
    }));

    return { symbol: 'INDICES', data: idxResults, source: 'EODHD-v2', fetchedAt: new Date().toISOString() };
  } catch (e) {
    return { symbol: 'INDICES', error: `指数请求失败: ${e.message}` };
  }
}
