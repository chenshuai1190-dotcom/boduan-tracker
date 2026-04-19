// Vercel Serverless 函数:代理 Finnhub API
// 浏览器无法直接调用 Finnhub(会跨域),通过这个后端中转
// API Key 存在 Vercel 环境变量里,前端看不到,安全

export default async function handler(req, res) {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

  const { symbols } = req.query;
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key 未配置,请在 Vercel 环境变量里设置 FINNHUB_API_KEY' });
  }

  if (!symbols) {
    return res.status(400).json({ error: '需要传 symbols 参数,例如 ?symbols=TQQQ,QQQ,NVDA' });
  }

  const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());

  try {
    // 并发请求所有股票
    const results = await Promise.all(
      symbolList.map(async (symbol) => {
        try {
          // VIX 在 Finnhub 是 ^VIX,需要特殊处理
          const fetchSymbol = symbol === 'VIX' ? '^VIX' : symbol;
          const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(fetchSymbol)}&token=${apiKey}`;
          const r = await fetch(url);
          const data = await r.json();
          return {
            symbol,
            price: data.c || 0,        // 当前价
            change: data.d || 0,       // 涨跌额
            changePercent: data.dp || 0, // 涨跌幅
            high: data.h || 0,         // 当日高
            low: data.l || 0,          // 当日低
            open: data.o || 0,         // 开盘
            previousClose: data.pc || 0, // 昨收
            timestamp: data.t || 0,
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
