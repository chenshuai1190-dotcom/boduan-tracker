// Vercel Serverless 函数: 代理 EODHD(股票+指数+VIX) + CNN(FGI)
// API Keys 存在 Vercel 环境变量,前端看不到
//
// 升级历史:
//   v1: Finnhub(股票) + FRED(VIX) + Yahoo(指数 ETF 代理)
//   v2 (Day 2): EODHD 替换 Finnhub/FRED + 真指数(GSPC/NDX) + BTC + 52周高准确化

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

  const { symbols } = req.query;
  const eodhdKey = (process.env.EODHD_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');

  if (!eodhdKey) {
    return res.status(500).json({ error: 'EODHD_API_KEY 未配置,请在 Vercel 环境变量里设置' });
  }

  if (!symbols) {
    return res.status(400).json({ error: '需要传 symbols 参数,例如 ?symbols=TQQQ,QQQ,NVDA' });
  }

  const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());

  try {
    const results = await Promise.all(
      symbolList.map(async (symbol) => {

        // ============================================
        // VIX: EODHD 指数,支持 REST 拉实时值
        // ============================================
        if (symbol === 'VIX') {
          try {
            // 优先 VIX.INDX,失败回退到 GSPC 简单处理
            const url = `https://eodhd.com/api/real-time/VIX.INDX?api_token=${eodhdKey}&fmt=json`;
            const r = await fetch(url);
            const data = await r.json();

            if (data.error || !data.close) {
              return { symbol, error: `EODHD VIX 错误: ${data.error || '无数据'}`, debug: data };
            }

            const price = parseFloat(data.close) || 0;
            const prevClose = parseFloat(data.previousClose) || price;
            const change = parseFloat(data.change) || (price - prevClose);
            const changePercent = parseFloat(data.change_p) || (prevClose > 0 ? (change / prevClose) * 100 : 0);

            return {
              symbol,
              price,
              change,
              changePercent,
              high: parseFloat(data.high) || 0,
              low: parseFloat(data.low) || 0,
              open: parseFloat(data.open) || 0,
              previousClose: prevClose,
              timestamp: parseInt(data.timestamp) || Math.floor(Date.now() / 1000),
              dataDate: data.timestamp ? new Date(data.timestamp * 1000).toISOString().split('T')[0] : null,
              source: 'EODHD',
            };
          } catch (e) {
            return { symbol, error: `EODHD VIX 请求失败: ${e.message}` };
          }
        }

        // ============================================
        // FGI: CNN Fear & Greed Index (不变, CNN 免费稳定)
        // ============================================
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

            if (!r.ok) {
              return { symbol, error: `CNN 请求失败: HTTP ${r.status}` };
            }

            const data = await r.json();
            const current = data.fear_and_greed;
            const historical = data.fear_and_greed_historical?.data || [];

            if (!current) {
              return { symbol, error: 'CNN 未返回 FGI 当前数据' };
            }

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

        // ============================================
        // INDICES: 大盘指数 (真指数: GSPC.INDX / NDX.INDX + BTC)
        // 删除道琼斯,加入 BTC
        // ============================================
        if (symbol === 'INDICES') {
          try {
            const indices = [
              { ticker: 'GSPC.INDX',  name: '标普500',     cn: '标普' },
              { ticker: 'NDX.INDX',   name: '纳斯达克100', cn: '纳指' },
              { ticker: 'BTC-USD.CC', name: '比特币',      cn: 'BTC'  },
            ];

            const results = await Promise.all(indices.map(async (idx) => {
              try {
                // 并发拉 EODHD 实时 + Yahoo 当天分时(分时图用)
                const eodhdUrl = `https://eodhd.com/api/real-time/${idx.ticker}?api_token=${eodhdKey}&fmt=json`;
                // Yahoo 分时的 ticker 需要特殊处理
                let yahooTicker = idx.ticker.replace('.INDX', '');
                if (yahooTicker === 'GSPC') yahooTicker = '^GSPC';
                if (yahooTicker === 'NDX') yahooTicker = '^NDX';
                if (yahooTicker === 'BTC-USD.CC') yahooTicker = 'BTC-USD';
                const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?interval=5m&range=1d`;

                const [eodhdRes, yahooRes] = await Promise.all([
                  fetch(eodhdUrl),
                  fetch(yahooUrl, {
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                      'Accept': 'application/json',
                    },
                  }).catch(() => null),
                ]);

                const data = await eodhdRes.json();
                if (data.error || !data.close) {
                  return { ticker: idx.ticker, name: idx.name, error: `EODHD: ${data.error || '无数据'}`, debug: data };
                }

                const currentPrice = parseFloat(data.close) || 0;
                const previousClose = parseFloat(data.previousClose) || currentPrice;
                const change = parseFloat(data.change) || (currentPrice - previousClose);
                const changePercent = parseFloat(data.change_p) || (previousClose > 0 ? (change / previousClose) * 100 : 0);

                // Yahoo 分时图数据
                let intraday = [];
                let dayHigh = parseFloat(data.high) || currentPrice;
                let dayLow = parseFloat(data.low) || currentPrice;
                if (yahooRes && yahooRes.ok) {
                  try {
                    const yahooData = await yahooRes.json();
                    const result = yahooData?.chart?.result?.[0];
                    const closes = result?.indicators?.quote?.[0]?.close || [];
                    intraday = closes.filter(v => v !== null && v !== undefined && !isNaN(v));
                    const meta = result?.meta || {};
                    dayHigh = meta.regularMarketDayHigh || dayHigh;
                    dayLow = meta.regularMarketDayLow || dayLow;
                  } catch (e) {
                    // Yahoo 失败不影响
                  }
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
                  dayHigh,
                  dayLow,
                };
              } catch (e) {
                return { ticker: idx.ticker, name: idx.name, error: `请求失败: ${e.message}` };
              }
            }));

            return {
              symbol: 'INDICES',
              data: results,
              source: 'EODHD+Yahoo',
              fetchedAt: new Date().toISOString(),
            };
          } catch (e) {
            return { symbol: 'INDICES', error: `INDICES 拉取失败: ${e.message}` };
          }
        }

        // ============================================
        // 股票: EODHD 实时价 + 52周高(历史日线 max) + Yahoo 分时图
        // ============================================
        try {
          // 1) EODHD 实时价 (支持盘前盘后!)
          const realtimeUrl = `https://eodhd.com/api/real-time/${encodeURIComponent(symbol)}.US?api_token=${eodhdKey}&fmt=json`;

          // 2) EODHD 历史日线(过去 400 天) → 算准确 52 周高/低
          const today = new Date();
          const fromDate = new Date(today.getTime() - 400 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const eodUrl = `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}.US?api_token=${eodhdKey}&from=${fromDate}&fmt=json`;

          // 3) Yahoo 分时图 (保留, 用于心电图)
          const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`;

          const [realtimeRes, eodRes, yahooRes] = await Promise.all([
            fetch(realtimeUrl),
            fetch(eodUrl),
            fetch(yahooUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
              },
            }).catch(() => null),
          ]);

          const data = await realtimeRes.json();
          if (data.error || data.close === undefined || data.close === null || data.close === 'NA') {
            return { symbol, error: `EODHD 错误: ${data.error || '无数据'}`, debug: data };
          }

          // EODHD 字段映射
          const price = parseFloat(data.close) || 0;
          const open = parseFloat(data.open) || 0;
          const dayHigh = parseFloat(data.high) || 0;
          const dayLow = parseFloat(data.low) || 0;
          const previousClose = parseFloat(data.previousClose) || price;
          const change = parseFloat(data.change) || (price - previousClose);
          const changePercent = parseFloat(data.change_p) || (previousClose > 0 ? (change / previousClose) * 100 : 0);
          const timestamp = parseInt(data.timestamp) || Math.floor(Date.now() / 1000);

          // 52 周高/低 - 从历史日线精确计算
          let week52High = dayHigh;
          let week52Low = dayLow;
          let highSource = 'realtime';
          if (eodRes.ok) {
            try {
              const eodData = await eodRes.json();
              if (Array.isArray(eodData) && eodData.length > 0) {
                // 只取最近 252 个交易日(约 52 周)
                const last52Weeks = eodData.slice(-252);
                const highs = last52Weeks.map(d => parseFloat(d.high)).filter(v => !isNaN(v) && v > 0);
                const lows = last52Weeks.map(d => parseFloat(d.low)).filter(v => !isNaN(v) && v > 0);
                if (highs.length > 0) week52High = Math.max(...highs, dayHigh);
                if (lows.length > 0) week52Low = Math.min(...lows, dayLow || Infinity);
                highSource = 'eodhd-eod';
              }
            } catch (e) {
              // EOD 失败不影响
            }
          }

          // Yahoo 分时图(心电图用)
          let intraday = [];
          if (yahooRes && yahooRes.ok) {
            try {
              const yahooData = await yahooRes.json();
              const result = yahooData?.chart?.result?.[0];
              const closes = result?.indicators?.quote?.[0]?.close || [];
              intraday = closes.filter(v => v !== null && v !== undefined && !isNaN(v));
            } catch (e) {
              // Yahoo 失败不影响
            }
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
            // 兼容旧字段
            high: week52High,
            low: week52Low,
            highSource,
            open,
            previousClose,
            timestamp,
            intraday,
            source: 'EODHD+Yahoo',
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
