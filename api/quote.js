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

        // ============ 📊 v10.7.9.39: 分析师目标价 (NASDAQ 免费) ============
        // 用法: ?symbols=ANALYST:NVDA
        // ============ 📊 v10.7.9.40: 公司基本面 + 分析师目标价 (EODHD Fundamentals) ============
        // 用法: ?symbols=ANALYST:NVDA
        // 返回: targets (分析师) + highlights (业绩) + general (公司信息)
        if (symbol.startsWith('ANALYST:')) {
          try {
            const stockSym = symbol.split(':')[1];
            if (!stockSym) {
              return { symbol, error: '缺少股票代码' };
            }
            // 特殊股票: 财报数据归属其他 ticker
            //   GOOGL (Class A) → GOOG (Class C, EODHD 财报归这里)
            //   未来可能加更多
            const SYMBOL_ALIAS = {
              'GOOGL': 'GOOG',
            };
            const fundamentalsSym = SYMBOL_ALIAS[stockSym] || stockSym;
            // 用 filter 拉需要的 sections (省 API 配额)
            const url = `https://eodhd.com/api/fundamentals/${fundamentalsSym}.US?api_token=${eodhdKey}&filter=General,Highlights,AnalystRatings,Earnings,Financials,SharesStats&fmt=json`;
            const r = await fetch(url);
            if (!r.ok) {
              return { symbol, error: `EODHD Fundamentals 返回 ${r.status}` };
            }
            const data = await r.json();
            const highlights = data.Highlights || {};
            const ratings = data.AnalystRatings || {};
            const general = data.General || {};
            const sharesStats = data.SharesStats || {};
            // 解析最近一次财报 (EPS + 营收 实际/预期)
            const earningsHistoryObj = data.Earnings?.History || {};
            const earningsTrendObj = data.Earnings?.Trend || {};
            const incomeStmtObj = data.Financials?.Income_Statement?.quarterly || {};

            // 找最新已发布财报 (按 reportDate 倒序, 取 epsActual !== null 的第一个)
            const earningsHistoryArr = (Array.isArray(earningsHistoryObj) ? earningsHistoryObj : Object.values(earningsHistoryObj))
              .filter(e => e && e.reportDate)
              .sort((a, b) => (b.reportDate || '').localeCompare(a.reportDate || ''));
            const latestEarnings = earningsHistoryArr.find(e => e.epsActual != null) || null;
            const upcomingEarnings = earningsHistoryArr.find(e => e.epsActual == null) || null;
            // 上一季 (用于同比)
            const lastYearEarnings = (() => {
              if (!latestEarnings) return null;
              const targetDate = new Date(latestEarnings.date || latestEarnings.reportDate);
              targetDate.setFullYear(targetDate.getFullYear() - 1);
              const targetStr = targetDate.toISOString().slice(0, 10);
              return earningsHistoryArr.find(e => {
                const d = e.date || e.reportDate;
                return d && Math.abs(new Date(d) - targetDate) < 90 * 24 * 60 * 60 * 1000;
              }) || null;
            })();

            // Income Statement: 找匹配最新季度的营收
            const incomeArr = Object.values(incomeStmtObj)
              .filter(i => i && i.date)
              .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            const latestIncome = incomeArr[0] || null;
            const lastYearIncome = (() => {
              if (!latestIncome) return null;
              const targetDate = new Date(latestIncome.date);
              targetDate.setFullYear(targetDate.getFullYear() - 1);
              return incomeArr.find(i => {
                return i.date && Math.abs(new Date(i.date) - targetDate) < 90 * 24 * 60 * 60 * 1000;
              }) || null;
            })();

            // Earnings::Trend: 找营收预期
            // ⚠️ EODHD 返回多条 0q (历史每次预期), 取 date 最新的
            const trendArr = (Array.isArray(earningsTrendObj) ? earningsTrendObj : Object.values(earningsTrendObj))
              .filter(t => t)
              .sort((a, b) => (b.date || '').localeCompare(a.date || ''));  // 按 date 倒序
            // -1q: 上次已公布的季度 (latestEarnings 对应的预期, 取最新一条)
            const lastTrend = trendArr.find(t => t.period === '-1q') || null;
            // 0q: 当前 (即将公布) (upcomingEarnings 对应的预期, 取最新一条)
            const currentTrend = trendArr.find(t => t.period === '0q') || null;
            // +1q: 下个季度 (取最新一条)
            const nextTrend = trendArr.find(t => t.period === '+1q') || null;

            // EODHD Rating 是 1-5 (1 = Strong Sell, 5 = Strong Buy)
            const ratingNum = parseFloat(ratings.Rating) || null;
            // 转换成评级文字
            const ratingText = ratingNum >= 4.5 ? 'STRONG BUY'
              : ratingNum >= 3.5 ? 'BUY'
              : ratingNum >= 2.5 ? 'HOLD'
              : ratingNum >= 1.5 ? 'SELL'
              : ratingNum > 0 ? 'STRONG SELL' : null;
            const totalAnalysts = (ratings.StrongBuy || 0) + (ratings.Buy || 0) + (ratings.Hold || 0) + (ratings.Sell || 0) + (ratings.StrongSell || 0);

            return {
              symbol,
              // 分析师目标价
              targets: {
                lastTrade: null,  // 由前端 watchlist 填
                average: ratings.TargetPrice || highlights.WallStreetTargetPrice || null,
                high: null,  // EODHD 未提供
                low: null,
                rating: ratingText,
                ratingNum,  // 1-5
                numAnalysts: totalAnalysts || null,
                strongBuy: ratings.StrongBuy || 0,
                buy: ratings.Buy || 0,
                hold: ratings.Hold || 0,
                sell: ratings.Sell || 0,
                strongSell: ratings.StrongSell || 0,
              },
              // 公司基本面
              highlights: {
                marketCap: highlights.MarketCapitalization || null,
                marketCapMln: highlights.MarketCapitalizationMln || null,
                ebitda: highlights.EBITDA || null,
                peRatio: highlights.PERatio || null,
                pegRatio: highlights.PEGRatio || null,
                bookValue: highlights.BookValue || null,
                dividendYield: highlights.DividendYield || null,
                eps: highlights.EarningsShare || null,
                epsEstimateCurrentYear: highlights.EPSEstimateCurrentYear || null,
                epsEstimateNextYear: highlights.EPSEstimateNextYear || null,
                epsEstimateNextQuarter: highlights.EPSEstimateNextQuarter || null,
                epsEstimateCurrentQuarter: highlights.EPSEstimateCurrentQuarter || null,
                profitMargin: highlights.ProfitMargin || null,
                operatingMargin: highlights.OperatingMarginTTM || null,
                roe: highlights.ReturnOnEquityTTM || null,
                roa: highlights.ReturnOnAssetsTTM || null,
                revenueTTM: highlights.RevenueTTM || null,
                revenuePerShareTTM: highlights.RevenuePerShareTTM || null,
                quarterlyRevenueGrowthYOY: highlights.QuarterlyRevenueGrowthYOY || null,
                quarterlyEarningsGrowthYOY: highlights.QuarterlyEarningsGrowthYOY || null,
                grossProfitTTM: highlights.GrossProfitTTM || null,
                mostRecentQuarter: highlights.MostRecentQuarter || null,
              },
              // 公司信息
              general: {
                name: general.Name || null,
                sector: general.Sector || null,
                industry: general.Industry || null,
                description: general.Description || null,
                logoURL: general.LogoURL ? `https://eodhd.com${general.LogoURL}` : null,
                employees: general.FullTimeEmployees || null,
              },
              // 股权结构
              shares: {
                percentInsiders: sharesStats.PercentInsiders || null,
                percentInstitutions: sharesStats.PercentInstitutions || null,
              },
              // v10.7.9.41: 最近一次财报 (EPS + 营收 实际/预期/同比)
              earnings: latestEarnings ? {
                reportDate: latestEarnings.reportDate,
                fiscalDate: latestEarnings.date,
                // EPS
                epsActual: latestEarnings.epsActual,
                epsEstimate: latestEarnings.epsEstimate,
                epsDiff: latestEarnings.epsDifference,
                epsSurprisePct: latestEarnings.surprisePercent,
                // 营收 (Income Statement 实际值)
                revenueActual: latestIncome?.totalRevenue || null,
                // 营收预期 (Earnings::Trend -1q = 上次已公布的季度)
                revenueEstimate: lastTrend?.revenueEstimateAvg || null,
                revenueEstimateLow: lastTrend?.revenueEstimateLow || null,
                revenueEstimateHigh: lastTrend?.revenueEstimateHigh || null,
                revenueEstimateGrowth: lastTrend?.revenueEstimateGrowth || null,
                // 同比
                lastYearEPS: lastYearEarnings?.epsActual || null,
                lastYearRevenue: lastYearIncome?.totalRevenue || null,
              } : null,
              // 下一次未发布财报 (从 history 拿)
              // 关键: 营收预期用 currentTrend (0q = 即将公布的当前季度)
              upcomingEarnings: upcomingEarnings ? {
                reportDate: upcomingEarnings.reportDate,
                fiscalDate: upcomingEarnings.date,
                epsEstimate: upcomingEarnings.epsEstimate,
                revenueEstimate: currentTrend?.revenueEstimateAvg || null,
                revenueEstimateLow: currentTrend?.revenueEstimateLow || null,
                revenueEstimateHigh: currentTrend?.revenueEstimateHigh || null,
                revenueEstimateGrowth: currentTrend?.revenueEstimateGrowth || null,
                revenueNumberOfAnalysts: currentTrend?.revenueEstimateNumberOfAnalysts || null,
              } : null,
              fetchedAt: new Date().toISOString(),
              source: 'EODHD-Fundamentals',
              _apiVersion: 'fix17',
              // 调试信息: 看 EODHD 是否有 Earnings::Trend (0q 的营收预期)
              _debug: {
                queriedSym: fundamentalsSym,           // 实际查询的 ticker
                originalSym: stockSym,
                hasEarnings: !!data.Earnings,
                hasTrend: !!data.Earnings?.Trend,
                trendCount: trendArr.length,
                trendPeriods: trendArr.slice(0, 10).map(t => ({ p: t.period, d: t.date, revEst: t.revenueEstimateAvg })),
                latestTrend0q: currentTrend ? { date: currentTrend.date, revEst: currentTrend.revenueEstimateAvg } : null,
                upcomingExists: !!upcomingEarnings,
                upcomingDate: upcomingEarnings?.reportDate,
              },
            };
          } catch (e) {
            return { symbol, error: `Fundamentals 请求失败: ${e.message}` };
          }
        }

        // ============ 📅 v10.7.9.33: 重要日历 (财报 + FOMC) ============
        // 用法: ?symbols=CALENDAR:NVDA,META,TSM,...
        // 返回: { events: [{type:'earnings'|'fomc', date, time, symbol?, ...}], cachedUntil }
        if (symbol.startsWith('CALENDAR')) {
          try {
            // 解析参数: CALENDAR:NVDA,META,TSM 或 CALENDAR (无 watchlist)
            const watchSymbols = symbol.includes(':') ? symbol.split(':')[1].split('|') : [];

            // 时间范围: 今天 → 14 天后
            const today = new Date();
            const fromDate = today.toISOString().slice(0, 10);
            const to = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
            const toDate = to.toISOString().slice(0, 10);

            // 1. 财报日历 (v10.7.9.40: EODHD 官方 Calendar - 升级 All-In-One 后)
            const events = [];
            if (watchSymbols.length > 0) {
              try {
                // 特殊股票别名: GOOGL → GOOG (财报归 Class C)
                // 反向映射: response 里 GOOG 转回 GOOGL 用户看
                const SYMBOL_ALIAS_REV = { 'GOOG': 'GOOGL' };
                // 把 watchlist 转换成 EODHD 用的代码
                const symbolsForApi = watchSymbols.map(s => {
                  if (s === 'GOOGL') return 'GOOG';
                  return s;
                });
                // 一次请求拿全部 watchlist 财报 (省时)
                const symbolsParam = symbolsForApi.map(s => `${s}.US`).join(',');
                const url = `https://eodhd.com/api/calendar/earnings?api_token=${eodhdKey}&symbols=${symbolsParam}&from=${fromDate}&to=${toDate}&fmt=json`;
                const r = await fetch(url);
                if (r.ok) {
                  const json = await r.json();
                  const earnings = json?.earnings || [];
                  for (const e of earnings) {
                    let sym = (e.code || '').replace('.US', '');
                    // 反向映射: EODHD 返回 GOOG → 转回 GOOGL (跟用户 watchlist 一致)
                    if (SYMBOL_ALIAS_REV[sym] && watchSymbols.includes(SYMBOL_ALIAS_REV[sym])) {
                      sym = SYMBOL_ALIAS_REV[sym];
                    }
                    // 日期: EODHD report_date 已经是美东日期, 直接用
                    events.push({
                      type: 'earnings',
                      date: e.report_date,
                      time: e.before_after_market || 'time-not-supplied',
                      symbol: sym,
                      epsEstimate: e.estimate,
                      epsActual: e.actual,
                      epsDiff: e.difference,
                      surprise: e.percent ? (e.percent + '') : null,
                    });
                  }
                }
              } catch (e) {
                console.warn('[Calendar] EODHD 拉取失败:', e.message);
              }
            }

            // 2. 经济日历 (v10.7.9.40: EODHD Economic Events 替换硬编码 FOMC)
            //    只取 3 大核心: FOMC 利率决议 + CPI + 非农就业
            try {
              const econUrl = `https://eodhd.com/api/economic-events?api_token=${eodhdKey}&country=US&from=${fromDate}&to=${toDate}&fmt=json`;
              const r = await fetch(econUrl);
              if (r.ok) {
                const econData = await r.json();
                if (Array.isArray(econData)) {
                  // 关键词匹配: 只要 3 类
                  const fomcKeywords = ['fed interest rate', 'fomc', 'federal funds', 'fomc statement'];
                  const cpiKeywords = ['cpi', 'consumer price index', 'core cpi', 'inflation rate'];
                  const nonfarmKeywords = ['nonfarm', 'non-farm', 'non farm payroll', 'unemployment rate', 'employment rate'];

                  for (const e of econData) {
                    const eventName = (e.event || '').toLowerCase();
                    let econType = null;
                    if (fomcKeywords.some(k => eventName.includes(k))) econType = 'fomc';
                    else if (cpiKeywords.some(k => eventName.includes(k))) econType = 'cpi';
                    else if (nonfarmKeywords.some(k => eventName.includes(k))) econType = 'nonfarm';
                    if (!econType) continue;

                    events.push({
                      type: econType,                          // fomc / cpi / nonfarm
                      date: e.date ? e.date.slice(0, 10) : '',
                      time: e.date ? e.date.slice(11, 16) + ' UTC' : '',
                      title: e.event,                          // 原始英文
                      country: e.country || 'US',
                      // 数据
                      actual: e.actual,
                      estimate: e.estimate,
                      previous: e.previous,
                      change: e.change,
                      changePercentage: e.change_percentage,
                    });
                  }
                }
              }
            } catch (e) {
              console.warn('[Calendar] EODHD Economic Events 失败:', e.message);
            }

            // 按日期排序
            events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

            return {
              symbol,
              events,
              fetchedAt: new Date().toISOString(),
              source: 'NASDAQ + FOMC',
              _apiVersion: 'fix16',
            };
          } catch (e) {
            return { symbol, error: `日历请求失败: ${e.message}` };
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

                // Yahoo 分时 (只用于走势图)
                let intraday = [];
                const yahooRes = yahooResults[i];
                if (yahooRes && yahooRes.ok) {
                  try {
                    const yahooData = await yahooRes.json();
                    const result = yahooData?.chart?.result?.[0];
                    const closes = result?.indicators?.quote?.[0]?.close || [];
                    intraday = closes.filter(v => v !== null && v !== undefined && !isNaN(v));
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
