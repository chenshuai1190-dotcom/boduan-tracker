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
        //   v10.7.9.15: 走势图也换 EODHD Intraday (符合纪律)
        if (symbol === 'INDICES') {
          try {
            const indices = [
              { ticker: 'SPY.US', name: '标普500 ETF', cn: '标普', symbol: 'SPY' },
              { ticker: 'QQQ.US', name: '纳斯达克100 ETF', cn: '纳指', symbol: 'QQQ' },
            ];

            // 批量请求 Live v2 (一次拿 SPY + QQQ 的现价+涨跌%)
            const tickers = indices.map(i => i.ticker).join(',');
            const v2Url = `https://eodhd.com/api/us-quote-delayed?s=${tickers}&api_token=${eodhdKey}&fmt=json`;

            // EODHD Intraday: 每只股票单独请求 (5m K 线走势图)
            const nowTs = Math.floor(Date.now() / 1000);
            const oneDayAgo = nowTs - 24 * 60 * 60;
            const intradayPromises = indices.map(idx =>
              fetch(`https://eodhd.com/api/intraday/${idx.ticker}?interval=5m&from=${oneDayAgo}&to=${nowTs}&api_token=${eodhdKey}&fmt=json`).catch(() => null)
            );

            const [v2Res, ...intradayResults] = await Promise.all([
              fetch(v2Url),
              ...intradayPromises,
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

                // EODHD Intraday (走势图)
                let intraday = [];
                const intradayRes = intradayResults[i];
                if (intradayRes && intradayRes.ok) {
                  try {
                    const bars = await intradayRes.json();
                    if (Array.isArray(bars)) {
                      const nowMs = Date.now();
                      const todayEt = new Date(nowMs).toLocaleDateString('en-US', { timeZone: 'America/New_York' });
                      for (const bar of bars) {
                        const ts = bar.timestamp || (bar.datetime ? Math.floor(new Date(bar.datetime + ' UTC').getTime() / 1000) : 0);
                        const close = parseFloat(bar.close);
                        if (!ts || isNaN(close) || close <= 0) continue;
                        const barDate = new Date(ts * 1000);
                        const barEtDate = barDate.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
                        if (barEtDate !== todayEt) continue;
                        const etHour = parseInt(barDate.toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }));
                        if (etHour < 4 || etHour >= 20) continue; // 跳过非交易时间
                        intraday.push(close);
                      }
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

        // ============ 普通股票: 用 EODHD Live v2 (现价+涨跌%) + EODHD Intraday (走势图) + EOD (52周高) ============
        // v10.7.9.15: 走势图也换 EODHD Intraday (符合 EODHD 纪律)
        //   EODHD Intraday 延迟 2-3 小时
        //   前端 WebSocket tick 自动追加最新点 (填补延迟 gap)
        try {
          const quoteUrl = `https://eodhd.com/api/us-quote-delayed?s=${encodeURIComponent(symbol)}.US&api_token=${eodhdKey}&fmt=json`;
          const today = new Date();
          const oneYearAgo = new Date(today.getTime() - 380 * 24 * 60 * 60 * 1000);
          const fromDate = oneYearAgo.toISOString().split('T')[0];
          const eodUrl = `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}.US?api_token=${eodhdKey}&from=${fromDate}&fmt=json`;
          // EODHD Intraday: 今天 9:30am (美东) 起的 5 分钟 K 线
          // 美东 9:30am ≈ UTC 13:30 / 14:30 (夏令/冬令时)
          // 保险起见: 拉最近 24 小时的数据, 前端再过滤"今天"的
          const nowTs = Math.floor(Date.now() / 1000);
          const oneDayAgo = nowTs - 24 * 60 * 60;
          const intradayUrl = `https://eodhd.com/api/intraday/${encodeURIComponent(symbol)}.US?interval=5m&from=${oneDayAgo}&to=${nowTs}&api_token=${eodhdKey}&fmt=json`;

          const [quoteRes, eodRes, intradayRes] = await Promise.all([
            fetch(quoteUrl),
            fetch(eodUrl),
            fetch(intradayUrl).catch(() => null),
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

          // v10.7.9.15: EODHD Intraday 数据 (5m K 线, 替换 Yahoo chart)
          //   延迟 2-3 小时, 前端 WebSocket tick 自动补充最新点
          let intraday = [];           // 纯价格数组
          let intradayPoints = [];      // [{price, t, session}]
          if (intradayRes && intradayRes.ok) {
            try {
              const bars = await intradayRes.json();
              if (Array.isArray(bars)) {
                // EODHD 返回 UTC 时间, 需要判断美东时区的 pre/regular/post session
                const nowMs = Date.now();
                const todayEt = new Date(nowMs).toLocaleDateString('en-US', { timeZone: 'America/New_York' });

                for (const bar of bars) {
                  // EODHD bar: { datetime: "2024-04-23 13:30:00", timestamp: ..., open, high, low, close, volume }
                  const ts = bar.timestamp || (bar.datetime ? Math.floor(new Date(bar.datetime + ' UTC').getTime() / 1000) : 0);
                  const close = parseFloat(bar.close);
                  if (!ts || isNaN(close) || close <= 0) continue;

                  // 只要"今天"的数据 (美东时区)
                  const barDate = new Date(ts * 1000);
                  const barEtDate = barDate.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
                  if (barEtDate !== todayEt) continue;

                  // session 判断: 美东 4am-9:30 pre, 9:30-16:00 regular, 16:00-20:00 post
                  const etHour = parseInt(barDate.toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }));
                  let session = 'regular';
                  if (etHour >= 4 && etHour < 9) session = 'pre';
                  else if (etHour >= 16 && etHour < 20) session = 'post';
                  else if (etHour < 4 || etHour >= 20) continue; // 非交易时间跳过

                  intraday.push(close);
                  intradayPoints.push({ price: close, t: ts, session });
                }
              }
            } catch (e) { /* ignore */ }
          }

          // v10.7.9.15: 价格 + 涨跌% + 走势图 全部用 EODHD
          //   Live v2: 实时价 (ethPrice/lastTradePrice) + 涨跌%
          //   Intraday: 5m K 线走势图 (延迟 2-3h, WebSocket 补充)
          //   EOD: 52 周高
          const price = eodhdPrice;
          const previousClose = eodhdPrevClose;
          const changePercent = (eodhdChangePercent !== undefined) ? eodhdChangePercent
                              : (previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0);
          const change = (eodhdChange !== undefined) ? eodhdChange : (price - previousClose);
          const dayHigh = eodhdDayHigh || price;
          const dayLow = eodhdDayLow || price;
          const open = eodhdOpen || price;
          const timestamp = eodhdTimestamp || Math.floor(Date.now() / 1000);
          const priceSource = 'EODHD-v2';

          if (price === 0) return { symbol, error: 'EODHD 没返回有效价格' };

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
            priceSource,
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
