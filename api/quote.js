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
  const finnhubKey = (process.env.FINNHUB_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');

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

        // ============ 📊 ANALYST: 分析师评级动态 (Finnhub) ============
        // 输入: ANALYST:NVDA,META,TSM,GOOGL,MSFT (前缀 + 股票列表)
        // 返回: 最近的评级升级/降级/目标价调整
        if (symbol.startsWith('ANALYST')) {
          if (!finnhubKey) {
            return { symbol: 'ANALYST', error: 'FINNHUB_API_KEY 未配置' };
          }
          try {
            // 解析后面的股票列表
            const stockList = symbol.replace('ANALYST:', '').split(',').filter(Boolean);
            if (stockList.length === 0) {
              return { symbol: 'ANALYST', data: [] };
            }

            // 并发拉取每只股票的评级历史
            const allRatings = await Promise.all(stockList.map(async (sym) => {
              try {
                const url = `https://finnhub.io/api/v1/stock/upgrade-downgrade?symbol=${sym}&token=${finnhubKey}`;
                const r = await fetch(url);
                if (!r.ok) return [];
                const data = await r.json();
                if (!Array.isArray(data)) return [];
                // 每条加上股票代码 (Finnhub 返回里 symbol 字段就有, 这里保险)
                return data.map(d => ({
                  symbol: d.symbol || sym,
                  gradeTime: d.gradeTime,
                  fromGrade: d.fromGrade || '',
                  toGrade: d.toGrade || '',
                  company: d.company || '',
                  action: d.action || '',  // up / down / init / maintain
                }));
              } catch (e) {
                console.error(`fetchAnalyst ${sym} 失败:`, e.message);
                return [];
              }
            }));

            // 合并 + 按时间倒序 + 最近 30 天 + 最多 30 条
            const merged = allRatings.flat();
            const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;  // 30 天前
            const filtered = merged
              .filter(r => r.gradeTime && r.gradeTime > cutoff)
              .sort((a, b) => b.gradeTime - a.gradeTime)
              .slice(0, 30);

            return {
              symbol: 'ANALYST',
              data: filtered,
              source: 'Finnhub',
              fetchedAt: new Date().toISOString(),
            };
          } catch (e) {
            return { symbol: 'ANALYST', error: `分析师评级请求失败: ${e.message}` };
          }
        }

        // ============ 三大指数: 用 ETF 替代真指数 (实时数据) ============
        // EODHD 真指数 (GSPC.INDX/NDX.INDX) 有 15 分钟延迟
        // ETF (SPY/QQQ) 是真实时 (你的 All World Extended 套餐)
        if (symbol === 'INDICES') {
          try {
            const indices = [
              { ticker: 'SPY.US', name: '标普500 ETF', cn: '标普', symbol: 'SPY' },
              { ticker: 'QQQ.US', name: '纳斯达克100 ETF', cn: '纳指', symbol: 'QQQ' },
            ];

            const idxResults = await Promise.all(indices.map(async (idx) => {
              try {
                const eodhdUrl = `https://eodhd.com/api/real-time/${idx.ticker}?api_token=${eodhdKey}&fmt=json`;
                const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${idx.symbol}?interval=5m&range=1d`;

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
                    intraday = closes.filter(v => v !== null && v !== undefined && !isNaN(v));
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

            return { symbol: 'INDICES', data: idxResults, source: 'EODHD-ETF', fetchedAt: new Date().toISOString() };
          } catch (e) {
            return { symbol: 'INDICES', error: `指数请求失败: ${e.message}` };
          }
        }

        // ============ 普通股票: EODHD 历史(52周高) + Yahoo 实时(盘前盘后更准) ============
        // 策略: EODHD 盘前盘后 REST 延迟较大(5-10min),Yahoo chart 接口盘前/盘后几乎实时
        //      所以优先用 Yahoo 的 regularMarketPrice + pre/post 价
        try {
          const quoteUrl = `https://eodhd.com/api/real-time/${encodeURIComponent(symbol)}.US?api_token=${eodhdKey}&fmt=json`;
          const today = new Date();
          const oneYearAgo = new Date(today.getTime() - 380 * 24 * 60 * 60 * 1000);
          const fromDate = oneYearAgo.toISOString().split('T')[0];
          const eodUrl = `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}.US?api_token=${eodhdKey}&from=${fromDate}&fmt=json`;
          // Yahoo chart: includePrePost=true 获取盘前盘后数据
          const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d&includePrePost=true`;

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

          // EODHD 数据(作为备份和 52 周高数据源)
          let eodhdPrice = 0, eodhdPrevClose = 0, eodhdDayHigh = 0, eodhdDayLow = 0, eodhdOpen = 0, eodhdTimestamp = 0;
          if (quoteRes.ok) {
            try {
              const data = await quoteRes.json();
              if (data && data.code !== 'NA') {
                eodhdPrice = parseFloat(data.close) || 0;
                eodhdPrevClose = parseFloat(data.previousClose) || 0;
                eodhdDayHigh = parseFloat(data.high) || 0;
                eodhdDayLow = parseFloat(data.low) || 0;
                eodhdOpen = parseFloat(data.open) || 0;
                eodhdTimestamp = data.timestamp || 0;
              }
            } catch (e) { /* ignore */ }
          }

          // Yahoo 数据(优先,盘前盘后延迟更小)
          let yahooPrice = 0, yahooPrevClose = 0, yahooMarketState = '', yahooTimestamp = 0;
          let intraday = [];           // 纯价格数组 (兼容旧代码)
          let intradayPoints = [];      // [{price, t, session}] 含时间戳和时段
          let regularMarketTime = 0;   // 开盘时间戳 (秒, Unix)
          if (yahooRes && yahooRes.ok) {
            try {
              const yahooData = await yahooRes.json();
              const result = yahooData?.chart?.result?.[0];
              const meta = result?.meta || {};
              yahooPrevClose = meta.chartPreviousClose || meta.previousClose || 0;
              yahooMarketState = meta.marketState || ''; // REGULAR | PRE | POST | CLOSED
              yahooTimestamp = meta.regularMarketTime || 0;
              regularMarketTime = meta.currentTradingPeriod?.regular?.start || 0;
              const regularEndTime = meta.currentTradingPeriod?.regular?.end || 0;
              const preStart = meta.currentTradingPeriod?.pre?.start || 0;
              const postEnd = meta.currentTradingPeriod?.post?.end || 0;

              // 分时 closes + timestamp
              const closes = result?.indicators?.quote?.[0]?.close || [];
              const tsArr = result?.timestamp || [];

              // 构造带时间戳的分时点 + 时段标记 (pre/regular/post)
              intradayPoints = [];
              intraday = [];
              for (let i = 0; i < closes.length; i++) {
                const v = closes[i];
                if (v === null || v === undefined || isNaN(v)) continue;
                const t = tsArr[i] || 0;
                let session = 'regular';
                if (regularMarketTime > 0 && regularEndTime > 0) {
                  if (t < regularMarketTime) session = 'pre';
                  else if (t > regularEndTime) session = 'post';
                  else session = 'regular';
                }
                intraday.push(v);
                intradayPoints.push({ price: v, t, session });
              }

              // 价格决策:
              // - 盘中 REGULAR: 用 meta.regularMarketPrice (权威)
              // - 盘外 PRE/POST/CLOSED: 用 intraday 分时最后一点
              if (yahooMarketState === 'REGULAR') {
                yahooPrice = meta.regularMarketPrice || (intraday.length > 0 ? intraday[intraday.length - 1] : 0);
              } else {
                yahooPrice = intraday.length > 0 ? intraday[intraday.length - 1] : (meta.regularMarketPrice || 0);
              }
            } catch (e) { /* ignore */ }
          }

          // 价格决策: 优先 Yahoo (盘前盘后实时),降级到 EODHD
          const price = yahooPrice > 0 ? yahooPrice : eodhdPrice;
          const previousClose = yahooPrevClose > 0 ? yahooPrevClose : eodhdPrevClose;
          const change = price - previousClose;
          const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;
          const dayHigh = eodhdDayHigh || price;
          const dayLow = eodhdDayLow || price;
          const open = eodhdOpen || price;
          const timestamp = yahooTimestamp || eodhdTimestamp || Math.floor(Date.now() / 1000);
          const priceSource = yahooPrice > 0 ? 'Yahoo' : 'EODHD';

          if (price === 0) return { symbol, error: 'Yahoo 和 EODHD 都没返回有效价格' };

          // 52 周高/低: 从 EODHD 历史日线计算
          // 🔑 关键: EODHD 返回的 high/low 是 raw (未拆股调整)
          //         adjusted_close 是已复权
          //         我们用 adjusted_close/close 比例还原"复权后 high/low"
          //         这样和长桥/雪球/Yahoo 等主流软件显示一致
          let week52High = 0;
          let week52Low = Infinity;
          let highSource = 'fallback';
          if (eodRes.ok) {
            try {
              const eodData = await eodRes.json();
              if (Array.isArray(eodData) && eodData.length > 0) {
                for (const day of eodData) {
                  const rawHigh = parseFloat(day.high) || 0;
                  const rawLow = parseFloat(day.low) || 0;
                  const rawClose = parseFloat(day.close) || 0;
                  const adjClose = parseFloat(day.adjusted_close) || 0;
                  // 复权系数 = adjusted_close / close
                  // 拆股或派息后才会 ≠ 1
                  const adjFactor = (rawClose > 0 && adjClose > 0) ? (adjClose / rawClose) : 1;
                  const adjHigh = rawHigh * adjFactor;
                  const adjLow = rawLow * adjFactor;
                  if (adjHigh > week52High) week52High = adjHigh;
                  if (adjLow > 0 && adjLow < week52Low) week52Low = adjLow;
                }
                // 当前价也参与比较 (今天可能创新高)
                if (price > week52High) week52High = price;
                if (price > 0 && price < week52Low) week52Low = price;
                highSource = 'eodhd-adjusted';
              }
            } catch (e) { /* ignore */ }
          }
          if (week52Low === Infinity) week52Low = 0;

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
            intradayPoints,       // [{price, t, session}] 带时间戳+时段 (pre/regular/post)
            regularMarketTime,    // 开盘时间戳 (秒)
            marketState: yahooMarketState,
            priceSource,
            source: priceSource === 'Yahoo' ? 'Yahoo' : 'EODHD',
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
