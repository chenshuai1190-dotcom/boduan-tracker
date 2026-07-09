import { providerFetch, QUOTE_TIMEOUTS } from '../http.js';

export async function fetchVixQuote(symbol, { eodhdKey }) {
  try {
    const url = `https://eodhd.com/api/real-time/VIX.INDX?api_token=${eodhdKey}&fmt=json`;
    const r = await providerFetch(url, {}, { provider: 'eodhd:vix', timeoutMs: QUOTE_TIMEOUTS.eodhd });
    if (!r.ok) return await fetchVixFallback();
    const data = await r.json();
    if (!data || data.code === 'NA' || data.close === undefined || data.close === null) {
      return await fetchVixFallback();
    }
    const price = parseFloat(data.close) || 0;
    const prevPrice = parseFloat(data.previousClose) || price;
    const change = parseFloat(data.change) || (price - prevPrice);
    const changePercent = parseFloat(data.change_p) || (prevPrice > 0 ? (change / prevPrice) * 100 : 0);

    return {
      symbol,
      price,
      change,
      changePercent,
      high: parseFloat(data.high) || 0,
      low: parseFloat(data.low) || 0,
      open: parseFloat(data.open) || 0,
      previousClose: prevPrice,
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
      dataDate: new Date((data.timestamp || Date.now() / 1000) * 1000).toISOString().split('T')[0],
      source: 'EODHD',
    };
  } catch (e) {
    return await fetchVixFallback().catch(() => ({ symbol, error: `VIX 请求失败: ${e.message}` }));
  }
}

async function fetchVixFallback() {
  try {
    const yahooUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d';
    const r = await providerFetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    }, { provider: 'yahoo:vix-fallback', timeoutMs: QUOTE_TIMEOUTS.yahoo });
    if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
    const data = await r.json();
    const meta = data?.chart?.result?.[0]?.meta || {};
    const price = meta.regularMarketPrice || 0;
    const prevPrice = meta.chartPreviousClose || meta.previousClose || price;
    const change = price - prevPrice;
    const changePercent = prevPrice > 0 ? (change / prevPrice) * 100 : 0;
    return {
      symbol: 'VIX',
      price,
      change,
      changePercent,
      high: 0,
      low: 0,
      open: 0,
      previousClose: prevPrice,
      timestamp: meta.regularMarketTime || Math.floor(Date.now() / 1000),
      dataDate: new Date().toISOString().split('T')[0],
      source: 'Yahoo-fallback',
    };
  } catch (e) {
    return { symbol: 'VIX', error: `VIX 所有数据源失败: ${e.message}` };
  }
}
