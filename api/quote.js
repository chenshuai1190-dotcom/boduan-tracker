// Vercel Serverless 函数:代理 Finnhub(股票) + FRED(VIX) API
// API Keys 存在 Vercel 环境变量里,前端看不到,安全

export default async function handler(req, res) {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

  const { symbols } = req.query;
  const finnhubKey = process.env.FINNHUB_API_KEY;
  const fredKey = process.env.FRED_API_KEY;

  if (!finnhubKey) {
    return res.status(500).json({ error: 'API key 未配置,请在 Vercel 环境变量里设置 FINNHUB_API_KEY' });
  }

  if (!symbols) {
    return res.status(400).json({ error: '需要传 symbols 参数,例如 ?symbols=TQQQ,QQQ,NVDA' });
  }

  const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());

  try {
    // 并发请求所有数据
    const results = await Promise.all(
      symbolList.map(async (symbol) => {
        // VIX 走 FRED 通道(免费、官方、稳定)
        if (symbol === 'VIX') {
          if (!fredKey) {
            return { symbol, error: 'FRED_API_KEY 未配置,VIX 无法自动获取' };
          }
          try {
            // FRED VIX 数据序列代号: VIXCLS (CBOE Volatility Index, Daily Close)
            // 用 observation_start 限制时间范围,只取最近 14 天数据,降序返回
            const today = new Date();
            const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
            const startDate = twoWeeksAgo.toISOString().split('T')[0]; // YYYY-MM-DD
            const fredUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=VIXCLS&api_key=${fredKey}&file_type=json&observation_start=${startDate}&sort_order=desc&limit=10`;
            const r = await fetch(fredUrl);
            const data = await r.json();
            
            // 如果 FRED 返回错误(比如 key 无效)
            if (data.error_code || data.error_message) {
              return { symbol, error: `FRED API 错误: ${data.error_message || data.error_code}`, debug: { url: fredUrl.replace(fredKey, 'XXX'), response: data } };
            }
            
            if (!data.observations || data.observations.length === 0) {
              return { symbol, error: 'FRED 未返回 VIX 数据', debug: { url: fredUrl.replace(fredKey, 'XXX'), response: data } };
            }

            // 找到最近一条非缺失数据(FRED 用 "." 表示无数据)
            const latest = data.observations.find(o => o.value !== '.' && o.value !== null);
            const previous = data.observations.slice(1).find(o => o.value !== '.' && o.value !== null);

            if (!latest) {
              return { symbol, error: 'FRED 返回的所有 VIX 数据均为缺失', debug: { observationsCount: data.observations.length, sample: data.observations.slice(0, 3) } };
            }

            const price = parseFloat(latest.value);
            const prevPrice = previous ? parseFloat(previous.value) : price;
            const change = price - prevPrice;
            const changePercent = prevPrice > 0 ? (change / prevPrice) * 100 : 0;

            return {
              symbol,
              price,
              change,
              changePercent,
              high: 0,
              low: 0,
              open: 0,
              previousClose: prevPrice,
              timestamp: new Date(latest.date).getTime() / 1000,
              dataDate: latest.date,        // 标注是哪天的收盘数据
              source: 'FRED',
            };
          } catch (e) {
            return { symbol, error: `FRED 请求失败: ${e.message}` };
          }
        }
        
        // 其他股票走 Finnhub
        try {
          const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${finnhubKey}`;
          const r = await fetch(url);
          const data = await r.json();
          return {
            symbol,
            price: data.c || 0,
            change: data.d || 0,
            changePercent: data.dp || 0,
            high: data.h || 0,
            low: data.l || 0,
            open: data.o || 0,
            previousClose: data.pc || 0,
            timestamp: data.t || 0,
            source: 'Finnhub',
          };
        } catch (e) {
          return { symbol, error: e.message };
        }
      })
    );

    return res.status(200).json({
      success: true,
      data: results,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
