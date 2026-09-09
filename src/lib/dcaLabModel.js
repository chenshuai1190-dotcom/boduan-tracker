import { normalizeDcaHistoryData } from './dcaHistory.js';
import { normalizeInvestmentSymbol } from './investmentComparisonModel.js';
import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';

export const DCA_SYMBOLS = Object.freeze([
  { symbol: 'QQQ', name: '纳斯达克 100 ETF' },
  { symbol: 'SPY', name: '标普 500 ETF' },
  { symbol: 'TQQQ', name: '三倍纳指 ETF' },
  { symbol: 'AAPL', name: '苹果' },
  { symbol: 'MSFT', name: '微软' },
  { symbol: 'NVDA', name: '英伟达' },
  { symbol: 'AMZN', name: '亚马逊' },
  { symbol: 'GOOGL', name: '谷歌' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'TSLA', name: '特斯拉' },
  { symbol: 'AVGO', name: '博通' },
].map(item => Object.freeze(item)));

const DAY = 86400000;
const MAX_CONTRIBUTION = 100000000;
const MAX_OBSERVED_GAP_DAYS = 14;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function finite(value) {
  if (!Number.isFinite(value)) fail('NUMERIC_RANGE', '投入金额或价格超出可计算范围');
  return value;
}

function normalizedPlan(plan, history) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) fail('INVALID_INPUT', '请检查定投计划');
  const symbol = normalizeInvestmentSymbol(plan.symbol);
  if (!symbol || symbol !== history.symbol) fail('INVALID_SYMBOL', '定投标的与历史数据不一致');
  const latestYear = Number(history.expectedAsOfDate.slice(0, 4));
  for (const key of ['startYear', 'endYear']) {
    if (!Number.isInteger(plan[key]) || plan[key] < 2000 || plan[key] > latestYear) {
      fail('INVALID_YEAR', `请选择 2000—${latestYear} 年之间的年份`);
    }
  }
  if (plan.startYear > plan.endYear) fail('INVALID_YEAR', '起始年份不能晚于结束年份');
  for (const key of ['initial', 'amount']) {
    if (typeof plan[key] !== 'number' || !Number.isFinite(plan[key]) || plan[key] < 0 || plan[key] > MAX_CONTRIBUTION) {
      fail('INVALID_AMOUNT', '每项投入须为 0 至 1 亿之间的有效金额');
    }
  }
  if (plan.initial === 0 && plan.amount === 0) fail('INVALID_AMOUNT', '请设置至少一项投入金额');
  if (!['monthly', 'weekly'].includes(plan.frequency)) fail('INVALID_FREQUENCY', '请选择每月或每周定投');
  return { ...plan, symbol };
}

function timeOf(date) { return Date.parse(`${date}T00:00:00Z`); }

function periodKey(date, frequency) {
  if (frequency === 'monthly') return date.slice(0, 7);
  const time = timeOf(date);
  const weekday = new Date(time).getUTCDay();
  return new Date(time - (weekday - 1) * DAY).toISOString().slice(0, 10);
}

function monthIndex(date) { return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1; }

function validateObservedCoverage(rows, expectedStart, expectedEnd) {
  if (rows.length < 2) fail('INSUFFICIENT_HISTORY', '所选期间至少需要两个真实交易日');
  if ((timeOf(rows[0].date) - timeOf(expectedStart)) / DAY > MAX_OBSERVED_GAP_DAYS
    || (timeOf(expectedEnd) - timeOf(rows.at(-1).date)) / DAY > MAX_OBSERVED_GAP_DAYS) {
    fail('INCOMPLETE_HISTORY', '所选期间起止位置存在较长价格缺口，暂时无法可靠计算');
  }
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1].date, current = rows[index].date;
    // Never fabricate prices or continue a monthly plan across an absent month.
    // Small gaps can be legitimate non-standard exchange closures or suspensions.
    if (monthIndex(current) - monthIndex(previous) > 1 || (timeOf(current) - timeOf(previous)) / DAY > MAX_OBSERVED_GAP_DAYS) {
      fail('INCOMPLETE_HISTORY', '所选期间存在较长价格缺口，暂时无法可靠计算');
    }
  }
}

function boundarySession(year, last) {
  const direction = last ? -1 : 1;
  const date = new Date(Date.UTC(year, last ? 11 : 0, last ? 31 : 1));
  while ([0, 6].includes(date.getUTCDay()) || isRegularNyseHoliday(date.toISOString().slice(0, 10))) {
    date.setUTCDate(date.getUTCDate() + direction);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Read-only historical arithmetic. close is an already validated adjusted price.
 * Fractions and averageCost are adjusted-price simulation units, not broker fills.
 * Lump sum assumes all eventual contributed capital is available on day one;
 * it compares equal final capital, not equal cash flows or equal invested time.
 * rows/summary.profit are cumulative; years.profit is income earned in that year.
 */
export function buildDcaModel({ data, plan } = {}) {
  const history = normalizeDcaHistoryData(data);
  if (!history) fail('INVALID_DATA', '需要有效的美元复权历史数据，不能使用演示价格或缺失价格');
  const normalized = normalizedPlan(plan, history);
  const requestedStartDate = `${normalized.startYear}-01-01`;
  const requestedEndDate = `${normalized.endYear}-12-31`;
  const selected = history.rows.filter(row => row.date >= requestedStartDate && row.date <= requestedEndDate);
  if (selected.length === 0) fail('NO_DATA', '所选期间暂无历史数据');
  const requestedFirstSession = boundarySession(normalized.startYear, false);
  const requestedLastSession = boundarySession(normalized.endYear, true);
  validateObservedCoverage(selected,
    history.availableFromDate > requestedFirstSession ? history.availableFromDate : requestedFirstSession,
    history.asOfDate < requestedLastSession ? history.asOfDate : requestedLastSession);

  let previousPeriod = '';
  const schedule = selected.map((row, index) => {
    const period = periodKey(row.date, normalized.frequency);
    const contribution = finite((index === 0 ? normalized.initial : 0) + (period !== previousPeriod ? normalized.amount : 0));
    previousPeriod = period;
    return { date: row.date, price: row.close, contribution };
  });
  const totalInvested = finite(schedule.reduce((sum, row) => sum + row.contribution, 0));
  const lumpShares = finite(totalInvested / schedule[0].price);
  let invested = 0, shares = 0;
  const purchases = [];
  const rows = schedule.map(({ date, price, contribution }) => {
    if (contribution > 0) {
      const bought = finite(contribution / price);
      shares = finite(shares + bought);
      invested = finite(invested + contribution);
      purchases.push({ date, price, amount: contribution, shares: bought, totalShares: shares, invested });
    }
    const value = finite(shares * price), lumpValue = finite(lumpShares * price);
    const profit = finite(value - invested), lumpProfit = finite(lumpValue - totalInvested);
    return { date, price, contribution, invested, value, profit, returnPct: finite(profit / invested * 100), lumpValue, lumpProfit, shares };
  });

  const years = [];
  let yearOpening = 0;
  for (const row of rows) {
    const year = Number(row.date.slice(0, 4));
    if (years.at(-1)?.year !== year) {
      yearOpening = years.at(-1)?.value ?? 0;
      years.push({ year, contribution: 0, invested: 0, value: 0, profit: 0, lumpValue: 0, throughDate: row.date, partial: false });
    }
    const annual = years.at(-1);
    annual.contribution = finite(annual.contribution + row.contribution);
    annual.invested = row.invested;
    annual.value = row.value;
    annual.profit = finite(row.value - yearOpening - annual.contribution);
    annual.lumpValue = row.lumpValue;
    annual.throughDate = row.date;
  }
  for (const annual of years) {
    annual.partial = annual.throughDate < boundarySession(annual.year, true)
      || (annual === years[0] && rows[0].date > boundarySession(annual.year, false));
  }

  const last = rows.at(-1);
  return {
    rows, purchases, years,
    summary: {
      invested: last.invested, value: last.value, profit: last.profit, returnPct: last.returnPct,
      lumpValue: last.lumpValue, lumpProfit: last.lumpProfit, advantage: finite(last.value - last.lumpValue),
      purchaseCount: purchases.length, averageCost: finite(last.invested / shares), shares,
    },
    startDate: rows[0].date, endDate: last.date, source: 'EODHD_EOD',
    period: {
      requestedStartDate, requestedEndDate, actualStartDate: rows[0].date, actualEndDate: last.date,
      startAdjusted: history.availableFromDate > requestedStartDate,
      partialEnd: last.date < boundarySession(normalized.endYear, true),
    },
  };
}
