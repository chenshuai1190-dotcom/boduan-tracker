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

        // ============ 三大指数: 用 ETF 替代真指数 (实时数据) ============
        // v10.7.9.14: 用 EODHD Live v2 (批量 /api/us-quote-delayed)
        //   一次请求拿 SPY + QQQ
        //   含 ethPrice (盘前盘后价)
        if (symbol === 'INDICES') {
          try {
            const indices = [
              { ticker: 'SPY.US', name: '标普500 ETF', cn: '标普', symbol: 'SPY' },
              { ticker: 'QQQ.US', name: '纳斯达克100 ETF', cn: '纳指', symbol: 'QQQ' },
            ];

            // 批量请求 Live v2 (一次拿 SPY + QQQ)
            const tickers = indices.map(i => i.ticker).join(',');
            const v2Url = `https://eodhd.com/api/us-quote-delayed?s=${tickers}&api_token=${eodhdKey}&fmt=json`;

            // Yahoo 分时 (每只股一个请求, 用于走势图)
            const yahooPromises = indices.map(idx =>
              fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${idx.symbol}?interval=5m&range=1d&includePrePost=true`, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'application/json',
                },
              }).catch(() => null)
            );

            const [v2Res, ...yahooResults] = await Promise.all([
              fetch(v2Url),
              ...yahooPromises,
            ]);

            // 解析 Live v2
            let v2Data = {};
            if (v2Res.ok) {
              try {
                const v2Json = await v2Res.json();
                v2Data = v2Json?.data || {};
              } catch (e) { /* ignore */ }
            }

            const idxResults = await Promise.all(indices.map(async (idx, i) => {
              try {
                // EODHD Live v2 (主力)
                const d = v2Data[idx.ticker];
                let eodhdPrice = 0, eodhdPrevClose = 0, eodhdHigh = 0, eodhdLow = 0;
                let eodhdChange, eodhdChangePercent, eodhdEthPrice;
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

                // Yahoo 分时 (用于走势图 - v10.7.9.15 带 session 标记)
                let intraday = [];
                let intradayPoints = [];
                const yahooRes = yahooResults[i];
                if (yahooRes && yahooRes.ok) {
                  try {
                    const yahooData = await yahooRes.json();
                    const result = yahooData?.chart?.result?.[0];
                    const meta = result?.meta || {};
                    const regularStart = meta.currentTradingPeriod?.regular?.start || 0;
                    const regularEnd = meta.currentTradingPeriod?.regular?.end || 0;
                    const closes = result?.indicators?.quote?.[0]?.close || [];
                    const tsArr = result?.timestamp || [];
                    for (let j = 0; j < closes.length; j++) {
                      const v = closes[j];
                      if (v === null || v === undefined || isNaN(v)) continue;
                      const t = tsArr[j] || 0;
                      let session = 'regular';
                      if (regularStart > 0 && regularEnd > 0) {
                        if (t < regularStart) session = 'pre';
                        else if (t > regularEnd) session = 'post';
                      }
                      intraday.push(v);
                      intradayPoints.push({ price: v, t, session });
                    }
                  } catch (e) { /* ignore */ }
                }

                // 决策
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
                  intradayPoints,
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

        // ============ 普通股票: 用 EODHD Live v2 (含盘前盘后 ethPrice) + EOD 历史 ============
        // v10.7.9.14: 切换到 /api/us-quote-delayed (Live v2)
        //   返回 ethPrice (extended hours price) = 盘前盘后实时价
        //   返回 changePercent (实时涨跌%)
        //   Yahoo 只用于分时图数据 (走势图)
        try {
          const quoteUrl = `https://eodhd.com/api/us-quote-delayed?s=${encodeURIComponent(symbol)}.US&api_token=${eodhdKey}&fmt=json`;
          const today = new Date();
          const oneYearAgo = new Date(today.getTime() - 380 * 24 * 60 * 60 * 1000);
          const fromDate = oneYearAgo.toISOString().split('T')[0];
          const eodUrl = `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}.US?api_token=${eodhdKey}&from=${fromDate}&fmt=json`;
          // Yahoo chart: 只用于分时数据 (走势图)
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

          // EODHD Live v2 数据 (主力, 含盘前盘后)
          let eodhdPrice = 0, eodhdPrevClose = 0, eodhdDayHigh = 0, eodhdDayLow = 0, eodhdOpen = 0, eodhdTimestamp = 0;
          let eodhdChange, eodhdChangePercent, eodhdEthPrice, eodhdEthTime;
          if (quoteRes.ok) {
            try {
              const json = await quoteRes.json();
              // Live v2 结构: { meta: {count}, data: { 'NVDA.US': {...} } }
              const data = json?.data?.[`${symbol}.US`];
              if (data) {
                // lastTradePrice = 最新成交价 (盘中)
                // ethPrice = extended hours 价 (盘前盘后)
                // 优先用 ethPrice (如果有), 否则 lastTradePrice
                eodhdEthPrice = parseFloat(data.ethPrice);
                if (isNaN(eodhdEthPrice)) eodhdEthPrice = undefined;
                eodhdEthTime = data.ethTime;
                const lastTradePrice = parseFloat(data.lastTradePrice) || 0;
                // 盘前盘后用 ethPrice, 盘中用 lastTradePrice
                eodhdPrice = (eodhdEthPrice && eodhdEthPrice > 0) ? eodhdEthPrice : lastTradePrice;
                eodhdPrevClose = parseFloat(data.previousClosePrice) || 0;
                eodhdDayHigh = parseFloat(data.high) || 0;
                eodhdDayLow = parseFloat(data.low) || 0;
                eodhdOpen = parseFloat(data.open) || 0;
                eodhdTimestamp = data.timestamp || 0;
                // changePercent 已经是百分比 (0.46 = 0.46%)
                eodhdChange = parseFloat(data.change);
                eodhdChangePercent = parseFloat(data.changePercent);
                if (isNaN(eodhdChange)) eodhdChange = undefined;
                if (isNaN(eodhdChangePercent)) eodhdChangePercent = undefined;
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

          // v10.7.9.14: 价格 + 涨跌% 优先 EODHD Live v2 (含盘前盘后 ethPrice)
          //   EODHD Live v2 本身就返回正确的 lastTradePrice / ethPrice
          //   Yahoo 只作兜底 + 提供分时图
          const price = eodhdPrice > 0 ? eodhdPrice : yahooPrice;
          const previousClose = eodhdPrevClose > 0 ? eodhdPrevClose : yahooPrevClose;
          // changePercent 优先用 EODHD 自带的 (已经是百分比)
          const changePercent = (eodhdChangePercent !== undefined) ? eodhdChangePercent
                              : (previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0);
          const change = (eodhdChange !== undefined) ? eodhdChange : (price - previousClose);
          const dayHigh = eodhdDayHigh || price;
          const dayLow = eodhdDayLow || price;
          const open = eodhdOpen || price;
          const timestamp = eodhdTimestamp || yahooTimestamp || Math.floor(Date.now() / 1000);
          const priceSource = eodhdPrice > 0 ? 'EODHD-v2' : 'Yahoo';

          if (price === 0) return { symbol, error: 'EODHD 和 Yahoo 都没返回有效价格' };

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
