import { providerFetch, QUOTE_TIMEOUTS } from '../http.js';
import { buildEodhdStockDetail } from '../stockDetail.js';

const US_EQUITY_REGULAR_START_MINUTES = 9 * 60 + 30;
const US_EQUITY_REGULAR_END_MINUTES = 16 * 60;
const US_EQUITY_PREMARKET_START_MINUTES = 4 * 60;
const US_EQUITY_POSTMARKET_END_MINUTES = 20 * 60;
const DEFAULT_STOCK_HISTORY_DAYS = 380;
const STOCK_DETAIL_HISTORY_YEARS = 10;

function parseQuoteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function getUsEquityTimeParts(now = Date.now()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(now));
    const getPart = (type) => parts.find((part) => part.type === type)?.value || '';
    const weekday = getPart('weekday');
    const hour = Number(getPart('hour'));
    const minute = Number(getPart('minute'));
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return {
      weekday,
      minutes: hour * 60 + minute,
    };
  } catch {
    return null;
  }
}

function getUsEquityMarketDate(now = Date.now()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(now));
    const getPart = (type) => parts.find((part) => part.type === type)?.value || '';
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    return year && month && day ? `${year}-${month}-${day}` : '';
  } catch {
    return '';
  }
}

function getUsEquityQuoteSession(now = Date.now()) {
  const parts = getUsEquityTimeParts(now);
  if (!parts || parts.weekday === 'Sat' || parts.weekday === 'Sun') return 'closed';
  const { minutes } = parts;
  if (minutes >= US_EQUITY_PREMARKET_START_MINUTES && minutes < US_EQUITY_REGULAR_START_MINUTES) {
    return 'pre';
  }
  if (minutes >= US_EQUITY_REGULAR_START_MINUTES && minutes < US_EQUITY_REGULAR_END_MINUTES) return 'regular';
  if (minutes >= US_EQUITY_REGULAR_END_MINUTES && minutes < US_EQUITY_POSTMARKET_END_MINUTES) {
    return 'post';
  }
  return 'closed';
}

function isUsEquitySameDayAfterPostClose(now = Date.now()) {
  const parts = getUsEquityTimeParts(now);
  if (!parts || parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
  return parts.minutes >= US_EQUITY_POSTMARKET_END_MINUTES;
}

export function getLatestCompletedEodCutoffDate(now = Date.now()) {
  const marketDate = getUsEquityMarketDate(now);
  if (!marketDate) return '';
  const quoteSession = getUsEquityQuoteSession(now);
  if (quoteSession === 'post' || isUsEquitySameDayAfterPostClose(now)) return marketDate;
  const previousDate = new Date(`${marketDate}T00:00:00Z`);
  if (Number.isNaN(previousDate.getTime())) return '';
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  return previousDate.toISOString().slice(0, 10);
}

export function findDailyBaselineCloseFromEodRows(rows = [], marketDate = '') {
  if (!marketDate || !Array.isArray(rows)) return null;
  const candidates = rows
    .filter((day) => day && day.date && String(day.date) < marketDate)
    .map((day) => {
      const adjustedClose = parseQuoteNumber(day.adjusted_close);
      const rawClose = parseQuoteNumber(day.close);
      const close = isPositiveNumber(adjustedClose) ? adjustedClose : rawClose;
      return isPositiveNumber(close)
        ? { date: String(day.date), close, source: isPositiveNumber(adjustedClose) ? 'eodhd-adjusted-close' : 'eodhd-close' }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
  return candidates[candidates.length - 1] || null;
}

function findCloseForMarketDateFromEodRows(rows = [], marketDate = '') {
  if (!marketDate || !Array.isArray(rows)) return null;
  const match = rows.find((day) => day && String(day.date || '') === marketDate);
  if (!match) return null;
  const adjustedClose = parseQuoteNumber(match.adjusted_close);
  const rawClose = parseQuoteNumber(match.close);
  const close = isPositiveNumber(adjustedClose) ? adjustedClose : rawClose;
  return isPositiveNumber(close)
    ? { date: String(match.date), close, source: isPositiveNumber(adjustedClose) ? 'eodhd-adjusted-close' : 'eodhd-close' }
    : null;
}

export function normalizeEodhdStockQuoteFields(data, {
  now = Date.now(),
  dailyBaselineClose = null,
  dailyBaselineDate = '',
  dailyBaselineSource = '',
  regularClosePrice = null,
  regularCloseDate = '',
  regularCloseSource = '',
  closedDailyPnlPrice = null,
  closedDailyPnlDate = '',
  closedDailyPnlSource = '',
  closedDailyPnlBaselineClose = null,
  closedDailyPnlBaselineDate = '',
  closedDailyPnlBaselineSource = '',
} = {}) {
  const lastTradePrice = parseQuoteNumber(data?.lastTradePrice);
  const ethPrice = parseQuoteNumber(data?.ethPrice);
  const providerPreviousClose = parseQuoteNumber(data?.previousClosePrice) || 0;
  const rawChange = parseQuoteNumber(data?.change);
  const rawChangePercent = parseQuoteNumber(data?.changePercent);
  const quoteSession = getUsEquityQuoteSession(now);
  const historicalDailyBaselineClose = parseQuoteNumber(dailyBaselineClose);
  const hasHistoricalDailyBaseline = isPositiveNumber(historicalDailyBaselineClose);
  const previousClose = hasHistoricalDailyBaseline
    ? historicalDailyBaselineClose
    : providerPreviousClose;
  const hasLastTradePrice = isPositiveNumber(lastTradePrice);
  const hasEthPrice = isPositiveNumber(ethPrice);
  const useExtendedPrice = (quoteSession === 'pre' || quoteSession === 'post') && hasEthPrice;
  const price = useExtendedPrice
    ? ethPrice
    : (hasLastTradePrice ? lastTradePrice : (hasEthPrice ? ethPrice : 0));
  const priceMode = useExtendedPrice
    ? quoteSession
    : (hasLastTradePrice ? 'regular' : (hasEthPrice ? 'extended-fallback' : 'unavailable'));
  const regularClose = parseQuoteNumber(regularClosePrice);
  const closedLockedPrice = parseQuoteNumber(closedDailyPnlPrice);
  const closedLockedBaseline = parseQuoteNumber(closedDailyPnlBaselineClose);

  let dailyPnlBaselineClose = previousClose;
  let dailyPnlBaselineDate = hasHistoricalDailyBaseline ? dailyBaselineDate : '';
  let dailyPnlBaselineSource = hasHistoricalDailyBaseline ? dailyBaselineSource : 'eodhd-quote-previous-close';
  let dailyPnlPrice = 0;
  let dailyPnlPriceDate = '';
  let dailyPnlLocked = false;
  let dailyPnlSource = 'unavailable';

  if (quoteSession === 'pre' || quoteSession === 'regular') {
    dailyPnlPrice = price;
    dailyPnlSource = quoteSession === 'pre' ? 'realtime-pre' : 'realtime-regular';
  } else if (quoteSession === 'post') {
    dailyPnlPrice = providerPreviousClose || regularClose || 0;
    dailyPnlPriceDate = providerPreviousClose ? getUsEquityMarketDate(now) : regularCloseDate;
    dailyPnlLocked = Boolean(dailyPnlPrice);
    dailyPnlSource = providerPreviousClose
      ? 'locked-provider-regular-close'
      : (regularClose ? regularCloseSource || 'locked-eod-regular-close' : 'unavailable');
  } else if (isUsEquitySameDayAfterPostClose(now)) {
    dailyPnlPrice = providerPreviousClose || regularClose || 0;
    dailyPnlPriceDate = providerPreviousClose ? getUsEquityMarketDate(now) : regularCloseDate;
    dailyPnlLocked = Boolean(dailyPnlPrice);
    dailyPnlSource = providerPreviousClose
      ? 'locked-provider-regular-close'
      : (regularClose ? regularCloseSource || 'locked-eod-regular-close' : 'unavailable');
  } else {
    dailyPnlPrice = closedLockedPrice || providerPreviousClose || 0;
    dailyPnlPriceDate = closedLockedPrice ? closedDailyPnlDate : '';
    dailyPnlLocked = Boolean(dailyPnlPrice);
    dailyPnlSource = closedLockedPrice
      ? closedDailyPnlSource || 'locked-latest-eod-close'
      : (providerPreviousClose ? 'locked-provider-regular-close' : 'unavailable');
    if (isPositiveNumber(closedLockedBaseline)) {
      dailyPnlBaselineClose = closedLockedBaseline;
      dailyPnlBaselineDate = closedDailyPnlBaselineDate;
      dailyPnlBaselineSource = closedDailyPnlBaselineSource || 'eodhd-adjusted-close';
    }
  }

  const canComputeDailyPnl = isPositiveNumber(dailyPnlPrice) && isPositiveNumber(dailyPnlBaselineClose);
  const dailyPnlChange = canComputeDailyPnl ? dailyPnlPrice - dailyPnlBaselineClose : null;
  const dailyPnlChangePercent = canComputeDailyPnl ? (dailyPnlChange / dailyPnlBaselineClose) * 100 : null;

  const canComputeFromSelectedPrice = isPositiveNumber(price) && isPositiveNumber(previousClose);
  const computedChange = canComputeFromSelectedPrice ? price - previousClose : 0;
  const computedChangePercent = canComputeFromSelectedPrice ? (computedChange / previousClose) * 100 : 0;

  let change = 0;
  let changePercent = 0;
  let changeSource = 'unavailable';

  if (canComputeFromSelectedPrice) {
    change = computedChange;
    changePercent = computedChangePercent;
    changeSource = (priceMode === 'pre' || priceMode === 'post' || priceMode === 'extended-fallback')
      ? 'computed-extended'
      : 'computed-regular';
  } else if (priceMode === 'regular') {
    change = rawChange ?? 0;
    changePercent = rawChangePercent ?? 0;
    changeSource = rawChange !== null || rawChangePercent !== null ? 'eodhd-regular' : 'unavailable';
  }

  return {
    price,
    previousClose,
    change,
    changePercent,
    dailyBaselineClose: previousClose,
    dailyBaselineDate: hasHistoricalDailyBaseline ? dailyBaselineDate : '',
    dailyBaselineSource: hasHistoricalDailyBaseline ? dailyBaselineSource : 'eodhd-quote-previous-close',
    dailyPnlPrice,
    dailyPnlPriceDate,
    dailyPnlBaselineClose,
    dailyPnlBaselineDate,
    dailyPnlBaselineSource,
    dailyPnlChange,
    dailyPnlChangePercent,
    dailyPnlLocked,
    dailyPnlSession: quoteSession,
    dailyPnlSource,
    sessionPreviousClose: providerPreviousClose,
    providerPreviousClose,
    dayHigh: parseQuoteNumber(data?.high) || 0,
    dayLow: parseQuoteNumber(data?.low) || 0,
    open: parseQuoteNumber(data?.open) || 0,
    timestamp: parseQuoteNumber(data?.timestamp) || 0,
    priceMode,
    quoteSession,
    changeSource,
  };
}

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

export async function fetchStockQuote(symbol, {
  eodhdKey,
  includeStockDetail = false,
}) {
  try {
    const now = Date.now();
    const marketDate = getUsEquityMarketDate(now);
    const completedEodCutoffDate = getLatestCompletedEodCutoffDate(now);
    const quoteUrl = `https://eodhd.com/api/us-quote-delayed?s=${encodeURIComponent(symbol)}.US&api_token=${eodhdKey}&fmt=json`;
    const today = new Date(now);
    const historyStart = new Date(now);
    const quoteHistoryStart = new Date(now);
    quoteHistoryStart.setUTCDate(quoteHistoryStart.getUTCDate() - DEFAULT_STOCK_HISTORY_DAYS);
    const quoteHistoryFromDate = quoteHistoryStart.toISOString().slice(0, 10);
    if (includeStockDetail) {
      historyStart.setUTCFullYear(historyStart.getUTCFullYear() - STOCK_DETAIL_HISTORY_YEARS);
    } else {
      historyStart.setTime(quoteHistoryStart.getTime());
    }
    const fromDate = historyStart.toISOString().slice(0, 10);
    const eodUrl = `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}.US?api_token=${eodhdKey}&from=${fromDate}&fmt=json`;
    const splitsUrl = includeStockDetail
      ? `https://eodhd.com/api/splits/${encodeURIComponent(symbol)}.US?api_token=${eodhdKey}&from=${fromDate}&to=${completedEodCutoffDate}&fmt=json`
      : '';
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d&includePrePost=true`;

    const [quoteRes, eodRes, yahooRes, splitsRes] = await Promise.all([
      providerFetch(quoteUrl, {}, { provider: 'eodhd:stock-quote', timeoutMs: QUOTE_TIMEOUTS.eodhd }),
      providerFetch(eodUrl, {}, { provider: 'eodhd:stock-history', timeoutMs: QUOTE_TIMEOUTS.eodhd }),
      providerFetch(yahooUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      }, { provider: 'yahoo:stock-chart', timeoutMs: QUOTE_TIMEOUTS.yahoo }).catch(() => null),
      includeStockDetail
        ? providerFetch(
            splitsUrl,
            {},
            { provider: 'eodhd:stock-splits', timeoutMs: QUOTE_TIMEOUTS.eodhd },
          ).catch(() => null)
        : Promise.resolve(null),
    ]);

    let rawEodhdQuoteData = null;
    let eodhdQuote = null;
    if (quoteRes.ok) {
      try {
        const json = await quoteRes.json();
        const data = json?.data?.[`${symbol}.US`];
        if (data) {
          rawEodhdQuoteData = data;
          eodhdQuote = normalizeEodhdStockQuoteFields(data, { now });
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

    const price = eodhdQuote?.price || 0;
    if (price === 0) {
      return {
        symbol,
        error: quoteRes?.ok
          ? 'EODHD 没返回有效股票价格'
          : `EODHD 股票行情请求失败: HTTP ${quoteRes?.status || '--'}`,
      };
    }

    const priceSource = 'EODHD-v2';

    let week52High = 0;
    let week52Low = Infinity;
    let highSource = 'fallback';
    let yearStartPrice = 0;
    let yearStartDate = '';
    let ytdChangePercent = 0;
    let dailyBaseline = null;
    let marketDateClose = null;
    let latestCompletedClose = null;
    let latestCompletedBaseline = null;
    let stockDetail = null;
    let stockDetailSplitActions = null;
    if (includeStockDetail) {
      const unavailableDetail = buildEodhdStockDetail([], { asOfDate: completedEodCutoffDate });
      stockDetail = {
        ...unavailableDetail,
        indicators: {
          ...unavailableDetail.indicators,
          ma50WeeklyStatus: 'unavailable',
          ma200WeeklyStatus: 'unavailable',
        },
      };
      if (splitsRes?.ok) {
        try {
          const payload = await splitsRes.json();
          if (Array.isArray(payload)) stockDetailSplitActions = payload;
        } catch {
          stockDetailSplitActions = null;
        }
      }
    }
    if (eodRes.ok) {
      try {
        const eodData = await eodRes.json();
        if (Array.isArray(eodData) && eodData.length > 0) {
          if (includeStockDetail) {
            const nextStockDetail = buildEodhdStockDetail(eodData, {
              asOfDate: completedEodCutoffDate,
              splitActions: stockDetailSplitActions,
            });
            if (nextStockDetail.history.length > 0) stockDetail = nextStockDetail;
          }
          const quoteEodData = includeStockDetail
            ? eodData.filter((day) => String(day?.date || '') >= quoteHistoryFromDate)
            : eodData;
          dailyBaseline = findDailyBaselineCloseFromEodRows(quoteEodData, marketDate);
          marketDateClose = findCloseForMarketDateFromEodRows(quoteEodData, marketDate);
          latestCompletedClose = marketDateClose || dailyBaseline;
          if (latestCompletedClose?.date) {
            latestCompletedBaseline = findDailyBaselineCloseFromEodRows(quoteEodData, latestCompletedClose.date);
          }
          const currentYearStart = `${today.getFullYear()}-01-01`;
          const historyRows = quoteEodData
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

    if (rawEodhdQuoteData && dailyBaseline?.close) {
      eodhdQuote = normalizeEodhdStockQuoteFields(rawEodhdQuoteData, {
        now,
        dailyBaselineClose: dailyBaseline.close,
        dailyBaselineDate: dailyBaseline.date,
        dailyBaselineSource: dailyBaseline.source,
        regularClosePrice: marketDateClose?.close,
        regularCloseDate: marketDateClose?.date || '',
        regularCloseSource: marketDateClose?.source || '',
        closedDailyPnlPrice: latestCompletedClose?.close,
        closedDailyPnlDate: latestCompletedClose?.date || '',
        closedDailyPnlSource: latestCompletedClose?.source || '',
        closedDailyPnlBaselineClose: latestCompletedBaseline?.close,
        closedDailyPnlBaselineDate: latestCompletedBaseline?.date || '',
        closedDailyPnlBaselineSource: latestCompletedBaseline?.source || '',
      });
    }

    const previousClose = eodhdQuote.previousClose;
    const changePercent = eodhdQuote.changePercent;
    const change = eodhdQuote.change;
    const dayHigh = eodhdQuote.dayHigh || price;
    const dayLow = eodhdQuote.dayLow || price;
    const open = eodhdQuote.open || price;
    const timestamp = eodhdQuote.timestamp || Math.floor(Date.now() / 1000);

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
      dailyBaselineClose: eodhdQuote.dailyBaselineClose,
      dailyBaselineDate: eodhdQuote.dailyBaselineDate,
      dailyBaselineSource: eodhdQuote.dailyBaselineSource,
      dailyPnlPrice: eodhdQuote.dailyPnlPrice,
      dailyPnlPriceDate: eodhdQuote.dailyPnlPriceDate,
      dailyPnlBaselineClose: eodhdQuote.dailyPnlBaselineClose,
      dailyPnlBaselineDate: eodhdQuote.dailyPnlBaselineDate,
      dailyPnlBaselineSource: eodhdQuote.dailyPnlBaselineSource,
      dailyPnlChange: eodhdQuote.dailyPnlChange,
      dailyPnlChangePercent: eodhdQuote.dailyPnlChangePercent,
      dailyPnlLocked: eodhdQuote.dailyPnlLocked,
      dailyPnlSession: eodhdQuote.dailyPnlSession,
      dailyPnlSource: eodhdQuote.dailyPnlSource,
      sessionPreviousClose: eodhdQuote.sessionPreviousClose,
      providerPreviousClose: eodhdQuote.providerPreviousClose,
      timestamp,
      intraday,
      intradayPoints,
      regularMarketTime,
      marketState: '',
      priceSource,
      priceMode: eodhdQuote.priceMode,
      quoteSession: eodhdQuote.quoteSession,
      changeSource: eodhdQuote.changeSource,
      source: 'EODHD',
      ...(includeStockDetail ? { stockDetail } : {}),
    };
  } catch (e) {
    return { symbol, error: e.message };
  }
}
