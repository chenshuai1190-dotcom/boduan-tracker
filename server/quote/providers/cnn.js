import { providerFetch, QUOTE_TIMEOUTS } from '../http.js';

export async function fetchFearGreedQuote(symbol) {
  try {
    const today = new Date();
    const yearAgo = new Date(today.getTime() - 400 * 24 * 60 * 60 * 1000);
    const startDate = yearAgo.toISOString().split('T')[0];
    const cnnUrl = `https://production.dataviz.cnn.io/index/fearandgreed/graphdata/${startDate}`;
    const r = await providerFetch(cnnUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    }, { provider: 'cnn:fgi', timeoutMs: QUOTE_TIMEOUTS.cnn });
    if (!r.ok) return { symbol, error: `CNN 请求失败: HTTP ${r.status}` };

    const data = await r.json();
    const current = data.fear_and_greed;
    const historical = data.fear_and_greed_historical?.data || [];
    if (!current) return { symbol, error: 'CNN 未返回 FGI 当前数据' };

    const score = Math.round(current.score);
    const label = current.rating;
    const timestamp = current.timestamp;

    const findHistorical = (daysAgo) => {
      const targetTime = today.getTime() - daysAgo * 24 * 60 * 60 * 1000;
      let closest = null;
      let minDiff = Infinity;
      for (const point of historical) {
        const diff = Math.abs(point.x - targetTime);
        if (diff < minDiff) {
          minDiff = diff;
          closest = point;
        }
      }
      return closest ? Math.round(closest.y) : null;
    };

    return {
      symbol,
      price: score,
      label,
      previousClose: findHistorical(1),
      weekAgo: findHistorical(7),
      monthAgo: findHistorical(30),
      yearAgo: findHistorical(365),
      timestamp: new Date(timestamp).getTime() / 1000,
      dataDate: timestamp ? timestamp.split('T')[0] : null,
      source: 'CNN',
    };
  } catch (e) {
    return { symbol, error: `CNN 请求失败: ${e.message}` };
  }
}
