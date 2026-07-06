import { providerFetch, QUOTE_TIMEOUTS } from '../http.js';

export async function fetchAnalystQuote(symbol, { eodhdKey }) {
  try {
    const stockSym = symbol.split(':')[1];
    if (!stockSym) {
      return { symbol, error: '缺少股票代码' };
    }
    const SYMBOL_ALIAS = {
      GOOGL: 'GOOG',
    };
    const fundamentalsSym = SYMBOL_ALIAS[stockSym] || stockSym;
    const fundUrl = `https://eodhd.com/api/fundamentals/${fundamentalsSym}.US?api_token=${eodhdKey}&filter=General,Highlights,AnalystRatings,Earnings,Financials,SharesStats&fmt=json`;
    const insiderUrl = `https://eodhd.com/api/insider-transactions?api_token=${eodhdKey}&code=${fundamentalsSym}.US&limit=50&fmt=json`;
    const newsUrl = `https://eodhd.com/api/news?api_token=${eodhdKey}&s=${fundamentalsSym}.US&limit=10&offset=0&fmt=json`;

    const [fundResp, insiderResp, newsResp] = await Promise.allSettled([
      providerFetch(fundUrl, {}, { provider: 'eodhd:fundamentals', timeoutMs: QUOTE_TIMEOUTS.eodhd }),
      providerFetch(insiderUrl, {}, { provider: 'eodhd:insider', timeoutMs: QUOTE_TIMEOUTS.eodhd }),
      providerFetch(newsUrl, {}, { provider: 'eodhd:news', timeoutMs: QUOTE_TIMEOUTS.eodhd }),
    ]);

    if (fundResp.status !== 'fulfilled' || !fundResp.value.ok) {
      return { symbol, error: `EODHD Fundamentals 返回 ${fundResp.value?.status || 'fail'}` };
    }
    const data = await fundResp.value.json();

    let insiderTransactions = [];
    try {
      if (insiderResp.status === 'fulfilled' && insiderResp.value.ok) {
        const insArr = await insiderResp.value.json();
        if (Array.isArray(insArr)) {
          const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          insiderTransactions = insArr
            .filter(t => t.transactionDate >= ninetyDaysAgo)
            .filter(t => t.transactionAmount > 0)
            .map(t => {
              const code = (t.transactionCode || '').toUpperCase();
              const isBuy = code === 'P' || (t.transactionAcquiredDisposedCode || '').toUpperCase() === 'A' && code !== 'A';
              if (code === 'A' || code === 'G' || code === 'M') return null;
              return {
                date: t.transactionDate,
                ownerName: t.ownerName || t.fullName,
                position: t.ownerRelationship,
                type: code === 'P' ? 'buy' : (code === 'S' ? 'sell' : (isBuy ? 'buy' : 'sell')),
                shares: parseFloat(t.transactionAmount) || 0,
                price: parseFloat(t.transactionPrice) || 0,
                amount: (parseFloat(t.transactionAmount) || 0) * (parseFloat(t.transactionPrice) || 0),
              };
            })
            .filter(t => t && t.amount > 0)
            .sort((a, b) => b.date.localeCompare(a.date));
        }
      }
    } catch (e) {
      console.warn('[Insider] 解析失败:', e.message);
    }

    let newsList = [];
    let newsSentiment = null;
    try {
      if (newsResp.status === 'fulfilled' && newsResp.value.ok) {
        const newsArr = await newsResp.value.json();
        if (Array.isArray(newsArr)) {
          newsList = newsArr.slice(0, 10).map(n => ({
            date: n.date,
            title: n.title,
            link: n.link,
            source: n.symbols && n.symbols.length > 0 ? null : (n.source || ''),
            polarity: n.sentiment?.polarity || 0,
            pos: n.sentiment?.pos || 0,
            neg: n.sentiment?.neg || 0,
            neu: n.sentiment?.neu || 0,
          }));
          if (newsList.length > 0) {
            const avgPol = newsList.reduce((s, n) => s + (n.polarity || 0), 0) / newsList.length;
            const posCount = newsList.filter(n => n.polarity > 0.1).length;
            const negCount = newsList.filter(n => n.polarity < -0.1).length;
            const neuCount = newsList.length - posCount - negCount;
            newsSentiment = {
              avgPolarity: avgPol,
              posCount,
              negCount,
              neuCount,
              total: newsList.length,
            };
          }
        }
      }
    } catch (e) {
      console.warn('[News] 解析失败:', e.message);
    }

    const highlights = data.Highlights || {};
    const ratings = data.AnalystRatings || {};
    const general = data.General || {};
    const sharesStats = data.SharesStats || {};
    const earningsHistoryObj = data.Earnings?.History || {};
    const earningsTrendObj = data.Earnings?.Trend || {};
    const earningsAnnualObj = data.Earnings?.Annual || {};
    const incomeStmtObj = data.Financials?.Income_Statement?.quarterly || {};
    const incomeAnnualObj = data.Financials?.Income_Statement?.yearly || {};

    const annualEarningsArr = Object.values(earningsAnnualObj)
      .filter(e => e && e.date)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const annualIncomeArr = Object.values(incomeAnnualObj)
      .filter(i => i && i.date)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const annualBySource = new Map();
    annualEarningsArr.forEach(e => {
      const year = (e.date || '').slice(0, 4);
      if (!year) return;
      if (!annualBySource.has(year)) annualBySource.set(year, {});
      annualBySource.get(year).epsActual = parseFloat(e.epsActual) || null;
    });
    annualIncomeArr.forEach(i => {
      const year = (i.date || '').slice(0, 4);
      if (!year) return;
      if (!annualBySource.has(year)) annualBySource.set(year, {});
      annualBySource.get(year).revenue = parseFloat(i.totalRevenue) || null;
      annualBySource.get(year).netIncome = parseFloat(i.netIncome) || null;
    });
    const annualSeries = Array.from(annualBySource.entries())
      .map(([year, v]) => ({ year, ...v }))
      .sort((a, b) => b.year.localeCompare(a.year))
      .slice(0, 15)
      .reverse();

    const earningsHistoryArr = (Array.isArray(earningsHistoryObj) ? earningsHistoryObj : Object.values(earningsHistoryObj))
      .filter(e => e && e.reportDate)
      .sort((a, b) => (b.reportDate || '').localeCompare(a.reportDate || ''));
    const latestEarnings = earningsHistoryArr.find(e => e.epsActual != null) || null;
    const upcomingEarnings = earningsHistoryArr.find(e => e.epsActual == null) || null;
    const lastYearEarnings = (() => {
      if (!latestEarnings) return null;
      const targetDate = new Date(latestEarnings.date || latestEarnings.reportDate);
      targetDate.setFullYear(targetDate.getFullYear() - 1);
      return earningsHistoryArr.find(e => {
        const d = e.date || e.reportDate;
        return d && Math.abs(new Date(d) - targetDate) < 90 * 24 * 60 * 60 * 1000;
      }) || null;
    })();

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

    const trendArr = (Array.isArray(earningsTrendObj) ? earningsTrendObj : Object.values(earningsTrendObj))
      .filter(t => t)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const lastTrend = trendArr.find(t => t.period === '-1q') || null;
    const currentTrend = trendArr.find(t => t.period === '0q') || null;

    const ratingNum = parseFloat(ratings.Rating) || null;
    const ratingText = ratingNum >= 4.5 ? 'STRONG BUY'
      : ratingNum >= 3.5 ? 'BUY'
      : ratingNum >= 2.5 ? 'HOLD'
      : ratingNum >= 1.5 ? 'SELL'
      : ratingNum > 0 ? 'STRONG SELL' : null;
    const totalAnalysts = (ratings.StrongBuy || 0) + (ratings.Buy || 0) + (ratings.Hold || 0) + (ratings.Sell || 0) + (ratings.StrongSell || 0);

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const fromYearStr = oneYearAgo.toISOString().slice(0, 10);
    let priceHistory = null;
    try {
      const eodUrl = `https://eodhd.com/api/eod/${stockSym}.US?api_token=${eodhdKey}&from=${fromYearStr}&period=d&fmt=json`;
      const eodR = await providerFetch(eodUrl, {}, { provider: 'eodhd:analyst-history', timeoutMs: QUOTE_TIMEOUTS.eodhd });
      if (eodR.ok) {
        const eodData = await eodR.json();
        if (Array.isArray(eodData)) {
          priceHistory = eodData
            .filter((_, i) => i % 5 === 0)
            .map(d => ({
              date: d.date,
              close: parseFloat(d.adjusted_close || d.close) || null,
            }))
            .filter(d => d.close != null);
        }
      }
    } catch (e) {
      console.warn('[Fundamentals] 历史日线失败:', e.message);
    }

    const avgPrice = ratings.TargetPrice || highlights.WallStreetTargetPrice;
    const estimatedHigh = avgPrice ? avgPrice * 1.20 : null;
    const estimatedLow = avgPrice ? avgPrice * 0.80 : null;

    return {
      symbol,
      targets: {
        lastTrade: null,
        average: avgPrice || null,
        high: estimatedHigh,
        low: estimatedLow,
        rating: ratingText,
        ratingNum,
        numAnalysts: totalAnalysts || null,
        strongBuy: ratings.StrongBuy || 0,
        buy: ratings.Buy || 0,
        hold: ratings.Hold || 0,
        sell: ratings.Sell || 0,
        strongSell: ratings.StrongSell || 0,
      },
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
      general: {
        name: general.Name || null,
        sector: general.Sector || null,
        industry: general.Industry || null,
        description: general.Description || null,
        logoURL: general.LogoURL ? `https://eodhd.com${general.LogoURL}` : null,
        employees: general.FullTimeEmployees || null,
        currencyCode: general.CurrencyCode || 'USD',
        currencySymbol: general.CurrencySymbol || '$',
        currencyName: general.CurrencyName || 'US Dollar',
        countryName: general.CountryName || null,
        countryISO: general.CountryISO || null,
        homeCategory: general.HomeCategory || null,
        addressCountry: general.AddressData?.Country || null,
      },
      shares: {
        percentInsiders: sharesStats.PercentInsiders || null,
        percentInstitutions: sharesStats.PercentInstitutions || null,
      },
      earnings: latestEarnings ? {
        reportDate: latestEarnings.reportDate,
        fiscalDate: latestEarnings.date,
        epsActual: latestEarnings.epsActual,
        epsEstimate: latestEarnings.epsEstimate,
        epsDiff: latestEarnings.epsDifference,
        epsSurprisePct: latestEarnings.surprisePercent,
        revenueActual: latestIncome?.totalRevenue || null,
        revenueEstimate: lastTrend?.revenueEstimateAvg || null,
        revenueEstimateLow: lastTrend?.revenueEstimateLow || null,
        revenueEstimateHigh: lastTrend?.revenueEstimateHigh || null,
        revenueEstimateGrowth: lastTrend?.revenueEstimateGrowth || null,
        lastYearEPS: lastYearEarnings?.epsActual || null,
        lastYearRevenue: lastYearIncome?.totalRevenue || null,
      } : null,
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
      annualSeries,
      priceHistory,
      insiderTransactions,
      newsList,
      newsSentiment,
      quarterlyStructure: (() => {
        const arr = Object.values(incomeStmtObj)
          .filter(i => i && i.date && i.totalRevenue)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        if (arr.length === 0) return null;
        const latest = arr[0];
        const num = (v) => {
          const n = parseFloat(v);
          return isNaN(n) ? null : n;
        };
        const totalRev = num(latest.totalRevenue);
        const costRev = num(latest.costOfRevenue);
        const grossProfit = num(latest.grossProfit) || (totalRev && costRev ? totalRev - costRev : null);
        const rd = num(latest.researchDevelopment);
        const sga = num(latest.sellingGeneralAdministrative);
        const opIncome = num(latest.operatingIncome);
        const netIncome = num(latest.netIncome);
        return {
          date: latest.date,
          totalRevenue: totalRev,
          costOfRevenue: costRev,
          grossProfit,
          researchDevelopment: rd,
          sellingGeneralAdministrative: sga,
          operatingIncome: opIncome,
          netIncome,
        };
      })(),
      fetchedAt: new Date().toISOString(),
      source: 'EODHD-Fundamentals',
      _apiVersion: 'fix37',
      _debug: {
        queriedSym: fundamentalsSym,
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

export async function fetchStockQuote(symbol, { eodhdKey }) {
  try {
    const quoteUrl = `https://eodhd.com/api/us-quote-delayed?s=${encodeURIComponent(symbol)}.US&api_token=${eodhdKey}&fmt=json`;
    const today = new Date();
    const oneYearAgo = new Date(today.getTime() - 380 * 24 * 60 * 60 * 1000);
    const fromDate = oneYearAgo.toISOString().split('T')[0];
    const eodUrl = `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}.US?api_token=${eodhdKey}&from=${fromDate}&fmt=json`;
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d&includePrePost=true`;

    const [quoteRes, eodRes, yahooRes] = await Promise.all([
      providerFetch(quoteUrl, {}, { provider: 'eodhd:stock-quote', timeoutMs: QUOTE_TIMEOUTS.eodhd }),
      providerFetch(eodUrl, {}, { provider: 'eodhd:stock-history', timeoutMs: QUOTE_TIMEOUTS.eodhd }),
      providerFetch(yahooUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      }, { provider: 'yahoo:stock-chart', timeoutMs: QUOTE_TIMEOUTS.yahoo }).catch(() => null),
    ]);

    let eodhdPrice = 0;
    let eodhdPrevClose = 0;
    let eodhdDayHigh = 0;
    let eodhdDayLow = 0;
    let eodhdOpen = 0;
    let eodhdTimestamp = 0;
    let eodhdChange;
    let eodhdChangePercent;
    let eodhdEthPrice;
    if (quoteRes.ok) {
      try {
        const json = await quoteRes.json();
        const data = json?.data?.[`${symbol}.US`];
        if (data) {
          eodhdEthPrice = parseFloat(data.ethPrice);
          if (isNaN(eodhdEthPrice)) eodhdEthPrice = undefined;
          const lastTradePrice = parseFloat(data.lastTradePrice) || 0;
          eodhdPrice = (eodhdEthPrice && eodhdEthPrice > 0) ? eodhdEthPrice : lastTradePrice;
          eodhdPrevClose = parseFloat(data.previousClosePrice) || 0;
          eodhdDayHigh = parseFloat(data.high) || 0;
          eodhdDayLow = parseFloat(data.low) || 0;
          eodhdOpen = parseFloat(data.open) || 0;
          eodhdTimestamp = data.timestamp || 0;
          eodhdChange = parseFloat(data.change);
          eodhdChangePercent = parseFloat(data.changePercent);
          if (isNaN(eodhdChange)) eodhdChange = undefined;
          if (isNaN(eodhdChangePercent)) eodhdChangePercent = undefined;
        }
      } catch (e) {
        /* ignore */
      }
    }

    let intraday = [];
    let intradayPoints = [];
    let regularMarketTime = 0;
    if (yahooRes && yahooRes.ok) {
      try {
        const yahooData = await yahooRes.json();
        const result = yahooData?.chart?.result?.[0];
        const meta = result?.meta || {};
        regularMarketTime = meta.currentTradingPeriod?.regular?.start || 0;
        const regularEndTime = meta.currentTradingPeriod?.regular?.end || 0;

        const closes = result?.indicators?.quote?.[0]?.close || [];
        const tsArr = result?.timestamp || [];

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

      } catch (e) {
        /* ignore */
      }
    }

    const price = eodhdPrice;
    if (price === 0) {
      return {
        symbol,
        error: quoteRes?.ok
          ? 'EODHD 没返回有效股票价格'
          : `EODHD 股票行情请求失败: HTTP ${quoteRes?.status || '--'}`,
      };
    }

    const previousClose = eodhdPrevClose;
    const changePercent = (eodhdChangePercent !== undefined) ? eodhdChangePercent
      : (previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0);
    const change = (eodhdChange !== undefined) ? eodhdChange : (previousClose > 0 ? price - previousClose : 0);
    const dayHigh = eodhdDayHigh || price;
    const dayLow = eodhdDayLow || price;
    const open = eodhdOpen || price;
    const timestamp = eodhdTimestamp || Math.floor(Date.now() / 1000);
    const priceSource = 'EODHD-v2';

    let week52High = 0;
    let week52Low = Infinity;
    let highSource = 'fallback';
    let yearStartPrice = 0;
    let yearStartDate = '';
    let ytdChangePercent = 0;
    if (eodRes.ok) {
      try {
        const eodData = await eodRes.json();
        if (Array.isArray(eodData) && eodData.length > 0) {
          const currentYearStart = `${today.getFullYear()}-01-01`;
          const historyRows = eodData
            .filter((day) => day && day.date)
            .sort((a, b) => String(a.date).localeCompare(String(b.date)));
          for (const day of historyRows) {
            const rawHigh = parseFloat(day.high) || 0;
            const rawLow = parseFloat(day.low) || 0;
            const rawClose = parseFloat(day.close) || 0;
            const adjClose = parseFloat(day.adjusted_close) || 0;
            const adjFactor = (rawClose > 0 && adjClose > 0) ? (adjClose / rawClose) : 1;
            const adjHigh = rawHigh * adjFactor;
            const adjLow = rawLow * adjFactor;
            if (adjHigh > week52High) week52High = adjHigh;
            if (adjLow > 0 && adjLow < week52Low) week52Low = adjLow;
            if (!yearStartPrice && String(day.date || '') >= currentYearStart && adjClose > 0) {
              yearStartPrice = adjClose;
              yearStartDate = day.date || '';
            }
          }
          if (price > week52High) week52High = price;
          if (price > 0 && price < week52Low) week52Low = price;
          if (yearStartPrice > 0) {
            ytdChangePercent = ((price - yearStartPrice) / yearStartPrice) * 100;
          }
          highSource = 'eodhd-adjusted';
        }
      } catch (e) {
        /* ignore */
      }
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
      yearStartPrice,
      yearStartDate,
      ytdChangePercent,
      high: week52High,
      low: week52Low,
      highSource,
      open,
      previousClose,
      timestamp,
      intraday,
      intradayPoints,
      regularMarketTime,
      marketState: '',
      priceSource,
      source: 'EODHD',
    };
  } catch (e) {
    return { symbol, error: e.message };
  }
}
