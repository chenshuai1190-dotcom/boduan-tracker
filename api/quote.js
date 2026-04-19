// Vercel Serverless 函数:代理 Finnhub(股票) + FRED(VIX) API
// API Keys 存在 Vercel 环境变量里,前端看不到,安全

export default async function handler(req, res) {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

  const { symbols } = req.query;
  const finnhubKey = (process.env.FINNHUB_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  const fredKey = (process.env.FRED_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');

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
              return { symbol, error: `FRED API 错误: ${data.error_message || data.error_code}`, debug: { keyLength: fredKey.length, keyFirst4: fredKey.slice(0, 4), keyLast4: fredKey.slice(-4), url: fredUrl.replace(fredKey, 'XXX'), response: data } };
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

        // FGI 走 CNN 通道(免费、非官方但稳定多年)
        if (symbol === 'FGI') {
          try {
            // CNN Fear & Greed Index API(过去 5 年稳定)
            // 起始日期取 1 年前,可一并拿到历史对比数据
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
            const label = current.rating; // "extreme fear" / "fear" / "neutral" / "greed" / "extreme greed"
            const timestamp = current.timestamp;

            // 找历史对比:前一交易日/1周前/1月前/1年前
            // historical 数组按时间升序,最后一个是最新
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
              price: score,                              // 当前分数(0-100)
              label,                                     // 评级标签
              previousClose: findHistorical(1),          // 前一交易日
              weekAgo: findHistorical(7),                // 1 周前
              monthAgo: findHistorical(30),              // 1 月前
              yearAgo: findHistorical(365),              // 1 年前
              timestamp: new Date(timestamp).getTime() / 1000,
              dataDate: timestamp ? timestamp.split('T')[0] : null,
              source: 'CNN',
            };
          } catch (e) {
            return { symbol, error: `CNN 请求失败: ${e.message}` };
          }
        }

        // 三大指数当天分时图(走 Yahoo Finance,免费稳定)
        // 使用 ETF 代替指数:DIA(道指)/QQQ(纳指)/SPY(标普)
        if (symbol === 'INDICES') {
          try {
            const indices = [
              { ticker: 'DIA', name: '道琼斯', cn: '道指', mult: 100 },   // DIA × 100 ≈ 道指点位
              { ticker: 'QQQ', name: '纳斯达克', cn: '纳指', mult: 38 }, // QQQ × ~38 ≈ 纳指
              { ticker: 'SPY', name: '标普500', cn: '标普', mult: 10 },  // SPY × 10 ≈ 标普
            ];

            const results = await Promise.all(indices.map(async (idx) => {
              try {
                // Yahoo Finance: 1m 间隔,1d 范围 = 当天分时
                const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${idx.ticker}?interval=5m&range=1d`;
                const r = await fetch(yahooUrl, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                  },
                });

                if (!r.ok) {
                  return { ticker: idx.ticker, name: idx.name, error: `Yahoo HTTP ${r.status}` };
                }

                const data = await r.json();
                const result = data?.chart?.result?.[0];
                if (!result) {
                  return { ticker: idx.ticker, name: idx.name, error: 'Yahoo 返回数据为空' };
                }

                const meta = result.meta || {};
                const quote = result.indicators?.quote?.[0] || {};
                const closes = (quote.close || []).filter(v => v !== null && v !== undefined);

                const currentPrice = meta.regularMarketPrice || closes[closes.length - 1] || 0;
                const previousClose = meta.chartPreviousClose || meta.previousClose || 0;
                const change = currentPrice - previousClose;
                const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

                return {
                  ticker: idx.ticker,
                  name: idx.name,
                  cn: idx.cn,
                  price: currentPrice,
                  previousClose,
                  change,
                  changePercent,
                  // 当天分时收盘价数组(用于画走势线)
                  intraday: closes,
                  // 日内最高/最低
                  dayHigh: meta.regularMarketDayHigh || Math.max(...closes),
                  dayLow: meta.regularMarketDayLow || Math.min(...closes),
                };
              } catch (e) {
                return { ticker: idx.ticker, name: idx.name, error: `Yahoo 请求失败: ${e.message}` };
              }
            }));

            return {
              symbol: 'INDICES',
              data: results,
              source: 'Yahoo',
              fetchedAt: new Date().toISOString(),
            };
          } catch (e) {
            return { symbol, error: `Yahoo 拉取失败: ${e.message}` };
          }
        }
        
        // 其他股票走 Finnhub(报价 + 52 周高低) + Yahoo(当天分时图)
        try {
          const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${finnhubKey}`;
          const metricUrl = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${finnhubKey}`;
          const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`;

          const [quoteRes, metricRes, yahooRes] = await Promise.all([
            fetch(quoteUrl),
            fetch(metricUrl),
            fetch(yahooUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
              },
            }).catch(() => null), // Yahoo 失败不影响整体
          ]);

          const data = await quoteRes.json();
          let week52High = 0;
          let week52Low = 0;
          if (metricRes.ok) {
            try {
              const metricData = await metricRes.json();
              week52High = metricData?.metric?.['52WeekHigh'] || 0;
              week52Low = metricData?.metric?.['52WeekLow'] || 0;
            } catch (e) {
              // metric 拉取失败不影响 quote 返回
            }
          }

          // 拉 Yahoo 当天分时 + 52 周高低(已前复权,跟雪球/长桥一致)
          let intraday = [];
          let yahooWeek52High = 0;
          let yahooWeek52Low = 0;
          if (yahooRes && yahooRes.ok) {
            try {
              const yahooData = await yahooRes.json();
              const result = yahooData?.chart?.result?.[0];
              const closes = result?.indicators?.quote?.[0]?.close || [];
              intraday = closes.filter(v => v !== null && v !== undefined && !isNaN(v));
              // Yahoo meta 里的 52 周高/低(已复权)
              const meta = result?.meta || {};
              yahooWeek52High = meta.fiftyTwoWeekHigh || 0;
              yahooWeek52Low = meta.fiftyTwoWeekLow || 0;
            } catch (e) {
              // Yahoo 失败不影响整体
            }
          }

          // 52 周高优先级:Yahoo(前复权) > Finnhub > 当日高
          const finalWeek52High = yahooWeek52High || week52High || data.h || 0;
          const finalWeek52Low = yahooWeek52Low || week52Low || data.l || 0;

          return {
            symbol,
            price: data.c || 0,
            change: data.d || 0,
            changePercent: data.dp || 0,
            // 当日高低(用于日内分析)
            dayHigh: data.h || 0,
            dayLow: data.l || 0,
            // 52 周高低(已复权,优先 Yahoo)
            week52High: finalWeek52High,
            week52Low: finalWeek52Low,
            // 兼容旧字段
            high: finalWeek52High,
            low: finalWeek52Low,
            // 数据来源标记(用于调试)
            highSource: yahooWeek52High > 0 ? 'yahoo' : (week52High > 0 ? 'finnhub' : 'fallback'),
            open: data.o || 0,
            previousClose: data.pc || 0,
            timestamp: data.t || 0,
            // 当天分时数据(用于心电图)
            intraday,
            source: 'Finnhub+Yahoo',
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
