// Vercel Serverless 函数:代理 EODHD(股票+指数+VIX) + CNN(FGI) API
// API Keys 存在 Vercel 环境变量里,前端看不到,安全
//
// 数据源:
//   - 股票实时价: EODHD /real-time/{SYMBOL}.US (含盘前/盘后)
//   - 52周高低: EODHD /eod/{SYMBOL}.US (历史日线,Math.max 取最高,跟雪球/长桥一致)
//   - 指数: EODHD /real-time/{SYMBOL}.INDX (GSPC=标普500, NDX=纳斯达克100)
//   - VIX: EODHD /real-time/VIX.INDX (1 分钟刷新,代替 FRED 24h 延迟)
//   - FGI: CNN Fear & Greed Index (免费,1小时刷新)
//   - 当日分时: Yahoo Finance (用于心电图)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

  const { symbols } = req.query;
  const eodhdKey = (process.env.EODHD_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');

  if (!eodhdKey) {
    return res.status(500).json({ error: 'API key 未配置,请在 Vercel 环境变量里设置 EODHD_API_KEY' });
  }

  if (!symbols) {
    return res.status(400).json({ error: '需要传 symbols 参数,例如 ?symbols=TQQQ,QQQ,NVDA' });
  }

  const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());

  try {
    const results = await Promise.all(
      symbolList.map(async (symbol) => {
        // ============ VIX: EODHD VIX.INDX(1 分钟刷新) ============
        if (symbol === 'VIX') {
          try {
            const url = `https://eodhd.com/api/real-time/VIX.INDX?api_token=${eodhdKey}&fmt=json`;
            const r = await fetch(url);
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

        // ============ FGI: CNN Fear & Greed Index ============
        if (symbol === 'FGI') {
          try {
            const today = new Date();
            const yearAgo = new Date(today.getTime() - 400 * 24 * 60 * 60 * 1000);
            const startDate = yearAgo.toISOString().split('T')[0];
            const cnnUrl = `https://production.dataviz.cnn.io/index/fearandgreed/graphdata/${startDate}`;
            const r = await fetch(cnnUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
              },
            });
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
                if (diff < minDiff) { minDiff = diff; closest = point; }
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

        // ============ 三大指数: EODHD 真指数(删道琼斯 + 真 SPX/NDX) ============
        if (symbol === 'INDICES') {
          try {
            // 已删除道琼斯 DIA (用户决策 2026-04-20)
            const indices = [
              { ticker: 'GSPC.INDX', etf: 'SPY', name: '标普500', cn: '标普' },
              { ticker: 'NDX.INDX',  etf: 'QQQ', name: '纳斯达克', cn: '纳指' },
            ];

            const idxResults = await Promise.all(indices.map(async (idx) => {
              try {
                const eodhdUrl = `https://eodhd.com/api/real-time/${idx.ticker}?api_token=${eodhdKey}&fmt=json`;
                const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${idx.etf}?interval=5m&range=1d`;

                const [eodRes, yahooRes] = await Promise.all([
                  fetch(eodhdUrl),
                  fetch(yahooUrl, {
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                      'Accept': 'application/json',
                    },
                  }).catch(() => null),
                ]);

                if (!eodRes.ok) return { ticker: idx.ticker, name: idx.name, error: `EODHD HTTP ${eodRes.status}` };
                const data = await eodRes.json();
                if (!data || data.code === 'NA' || data.close === undefined) {
                  return { ticker: idx.ticker, name: idx.name, error: 'EODHD 返回数据为空' };
                }

                const currentPrice = parseFloat(data.close) || 0;
                const previousClose = parseFloat(data.previousClose) || 0;
                const change = parseFloat(data.change) || (currentPrice - previousClose);
                const changePercent = parseFloat(data.change_p) || (previousClose > 0 ? (change / previousClose) * 100 : 0);

                let intraday = [];
                if (yahooRes && yahooRes.ok) {
                  try {
                    const yahooData = await yahooRes.json();
                    const result = yahooData?.chart?.result?.[0];
                    const closes = result?.indicators?.quote?.[0]?.close || [];
                    const etfIntraday = closes.filter(v => v !== null && v !== undefined && !isNaN(v));

                    // Yahoo 拿的是 ETF 价格(如 SPY ~580),但我们要画的是指数(GSPC ~6850)
                    // 两者量级不同,直接用会导致走势图变"直线"(所有点挤在图底)
                    // 修复: 用 ETF 的第一个价格作锚点,按比例缩放到指数级别
                    const etfPrevClose = result?.meta?.chartPreviousClose || etfIntraday[0] || 0;
                    if (etfPrevClose > 0 && previousClose > 0 && etfIntraday.length > 0) {
                      const ratio = previousClose / etfPrevClose;
                      intraday = etfIntraday.map(v => v * ratio);
                    } else {
                      intraday = etfIntraday;
                    }
                  } catch (e) { /* ignore */ }
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
                  dayHigh: parseFloat(data.high) || currentPrice,
                  dayLow: parseFloat(data.low) || currentPrice,
                };
              } catch (e) {
                return { ticker: idx.ticker, name: idx.name, error: `请求失败: ${e.message}` };
              }
            }));

            return { symbol: 'INDICES', data: idxResults, source: 'EODHD', fetchedAt: new Date().toISOString() };
          } catch (e) {
            return { symbol: 'INDICES', error: `指数请求失败: ${e.message}` };
          }
        }

        // ============ 普通股票: EODHD 实时(含盘前盘后) + 历史日线(52周高) + Yahoo 分时 ============
        try {
          const quoteUrl = `https://eodhd.com/api/real-time/${encodeURIComponent(symbol)}.US?api_token=${eodhdKey}&fmt=json`;
          const today = new Date();
          const oneYearAgo = new Date(today.getTime() - 380 * 24 * 60 * 60 * 1000);
          const fromDate = oneYearAgo.toISOString().split('T')[0];
          const eodUrl = `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}.US?api_token=${eodhdKey}&from=${fromDate}&fmt=json`;
          const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`;

          const [quoteRes, eodRes, yahooRes] = await Promise.all([
            fetch(quoteUrl),
            fetch(eodUrl),
            fetch(yahooUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
              },
            }).catch(() => null),
          ]);

          if (!quoteRes.ok) return { symbol, error: `EODHD quote HTTP ${quoteRes.status}` };
          const data = await quoteRes.json();
          if (!data || data.code === 'NA') return { symbol, error: 'EODHD 返回数据为空,可能 symbol 不存在' };

          const price = parseFloat(data.close) || 0;
          const previousClose = parseFloat(data.previousClose) || 0;
          const change = parseFloat(data.change) || (price - previousClose);
          const changePercent = parseFloat(data.change_p) || (previousClose > 0 ? (change / previousClose) * 100 : 0);
          const dayHigh = parseFloat(data.high) || 0;
          const dayLow = parseFloat(data.low) || 0;
          const open = parseFloat(data.open) || 0;
          const timestamp = data.timestamp || Math.floor(Date.now() / 1000);

          // 52 周高/低:从 EODHD 历史日线精确计算(跟雪球/长桥一致)
          let week52High = 0;
          let week52Low = Infinity;
          let highSource = 'fallback';
          if (eodRes.ok) {
            try {
              const eodData = await eodRes.json();
              if (Array.isArray(eodData) && eodData.length > 0) {
                for (const day of eodData) {
                  const h = parseFloat(day.high) || 0;
                  const l = parseFloat(day.low) || 0;
                  if (h > week52High) week52High = h;
                  if (l > 0 && l < week52Low) week52Low = l;
                }
                if (price > week52High) week52High = price;
                if (price > 0 && price < week52Low) week52Low = price;
                highSource = 'eodhd-historical';
              }
            } catch (e) { /* ignore */ }
          }
          if (week52Low === Infinity) week52Low = 0;

          let intraday = [];
          if (yahooRes && yahooRes.ok) {
            try {
              const yahooData = await yahooRes.json();
              const result = yahooData?.chart?.result?.[0];
              const closes = result?.indicators?.quote?.[0]?.close || [];
              intraday = closes.filter(v => v !== null && v !== undefined && !isNaN(v));
            } catch (e) { /* ignore */ }
          }

          return {
            symbol,
            price,
            change,
            changePercent,
            dayHigh,
            dayLow,
            week52High,
            week52Low,
            high: week52High,
            low: week52Low,
            highSource,
            open,
            previousClose,
            timestamp,
            intraday,
            source: 'EODHD',
          };
        } catch (e) {
          return { symbol, error: e.message };
        }
      })
    );

    return res.status(200).json({ success: true, data: results, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// VIX 降级方案:EODHD VIX.INDX 不可用时,用 Yahoo ^VIX
async function fetchVixFallback() {
  try {
    const yahooUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d';
    const r = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });
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
