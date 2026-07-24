import { providerFetch, QUOTE_TIMEOUTS } from './http.js';

export const STOCK_VALUATION_HISTORY_YEARS = 5;

const FUNDAMENTALS_WARMUP_DAYS = 550;
const MAX_TTM_STALENESS_DAYS = 180;
const MIN_QUARTER_GAP_DAYS = 60;
const MAX_QUARTER_GAP_DAYS = 135;
const INCOME_QUARTERS_KEY = 'Financials::Income_Statement::quarterly';
const OUTSTANDING_SHARES_KEY = 'outstandingShares::quarterly';
const VALUATION_FUNDAMENTALS_FILTER = [
  'Valuation::ForwardPE',
  INCOME_QUARTERS_KEY,
  OUTSTANDING_SHARES_KEY,
].join(',');

function finiteNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(typeof value === 'string' ? value.trim() : value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function firstAvailableField(value, fields) {
  if (!value || typeof value !== 'object') return undefined;
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
    const candidate = value[field];
    if (candidate !== null && candidate !== undefined && candidate !== '') return candidate;
  }
  return undefined;
}

function validDateKey(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return '';
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toISOString().slice(0, 10) === match[1] ? match[1] : '';
}

function normalizedNow(now) {
  const value = typeof now === 'function' ? now() : now;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('估值计算时间不合法');
  return date;
}

function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shiftDateKeyYears(dateKey, years) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return '';
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetYear = date.getUTCFullYear() + years;
  const shifted = new Date(Date.UTC(targetYear, month, day));
  if (shifted.getUTCMonth() !== month) {
    return new Date(Date.UTC(targetYear, month + 1, 0)).toISOString().slice(0, 10);
  }
  return shifted.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return (end - start) / 86_400_000;
}

function providerField(data, path) {
  if (!data || typeof data !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(data, path)) return data[path];
  return path.split('::').reduce((value, key) => value?.[key], data);
}

function valuationDates(now) {
  const currentDate = normalizedNow(now);
  const asOfDate = currentDate.toISOString().slice(0, 10);
  const windowStartDate = shiftDateKeyYears(asOfDate, -STOCK_VALUATION_HISTORY_YEARS);
  return {
    currentDate,
    asOfDate,
    windowStartDate,
    fundamentalsFromDate: shiftDateKey(windowStartDate, -FUNDAMENTALS_WARMUP_DAYS),
  };
}

function normalizeQuarterRows(block, { fromDate, toDate }) {
  const entries = Array.isArray(block)
    ? block.map((row, index) => [String(index), row])
    : Object.entries(block && typeof block === 'object' ? block : {});
  const byFiscalDate = new Map();

  for (const [key, row] of entries) {
    if (!row || typeof row !== 'object') continue;
    const fiscalDate = validDateKey(row.date || row.fiscalDate || key);
    if (!fiscalDate || fiscalDate < fromDate || fiscalDate > toDate) continue;

    const filingDate = validDateKey(firstAvailableField(row, [
      'filing_date',
      'filingDate',
      'filedAt',
    ]));
    if (!filingDate || filingDate < fiscalDate) {
      continue;
    }
    if (filingDate > toDate) continue;

    const profit = finiteNumber(firstAvailableField(row, [
      'netIncomeApplicableToCommonShares',
      'netIncome',
    ]));
    const normalized = {
      fiscalDate,
      filingDate,
      profit,
    };
    const previous = byFiscalDate.get(fiscalDate);
    if (!previous || normalized.filingDate >= previous.filingDate) {
      // A later amendment is safer than applying amended values at the original
      // filing date when the provider returns duplicate fiscal periods.
      byFiscalDate.set(fiscalDate, normalized);
    }
  }

  return Array.from(byFiscalDate.values())
    .sort((left, right) => left.fiscalDate.localeCompare(right.fiscalDate));
}

function normalizeOutstandingShares(block, { fromDate, toDate }) {
  const entries = Array.isArray(block)
    ? block.map((row, index) => [String(index), row])
    : Object.entries(block && typeof block === 'object' ? block : {});
  const byDate = new Map();

  for (const [key, row] of entries) {
    if (!row || typeof row !== 'object') continue;
    const date = validDateKey(row.dateFormatted || row.date || key);
    const shares = positiveNumber(row.shares);
    if (!date || date < fromDate || date > toDate || shares === null) continue;
    byDate.set(date, { date, shares });
  }

  return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
}

function latestOutstandingSharesAt(rows, date) {
  let latest = null;
  for (const row of rows) {
    if (row.date > date) break;
    latest = row;
  }
  return latest?.shares ?? null;
}

function isConsecutiveQuarterWindow(rows) {
  if (rows.length !== 4) return false;
  for (let index = 1; index < rows.length; index += 1) {
    const gapDays = daysBetween(rows[index - 1].fiscalDate, rows[index].fiscalDate);
    if (
      gapDays === null
      || gapDays < MIN_QUARTER_GAP_DAYS
      || gapDays > MAX_QUARTER_GAP_DAYS
    ) {
      return false;
    }
  }
  return true;
}

function buildTtmSnapshots(quarterRows, outstandingSharesRows) {
  const byEffectiveDate = new Map();

  quarterRows.forEach((row, index) => {
    const window = quarterRows.slice(Math.max(0, index - 3), index + 1);
    const effectiveDate = window.reduce(
      (latest, item) => (item.filingDate > latest ? item.filingDate : latest),
      row.filingDate,
    );
    const validWindow = isConsecutiveQuarterWindow(window)
      && window.every((item) => Number.isFinite(item.profit));
    const shares = latestOutstandingSharesAt(outstandingSharesRows, effectiveDate);
    const ttmProfit = validWindow
      ? positiveNumber(window.reduce((sum, item) => sum + item.profit, 0))
      : null;
    const epsTtm = ttmProfit !== null && shares !== null
      ? positiveNumber(ttmProfit / shares)
      : null;
    const snapshot = {
      date: effectiveDate,
      fiscalDate: row.fiscalDate,
      epsTtm,
    };
    const previous = byEffectiveDate.get(effectiveDate);
    if (!previous || snapshot.fiscalDate >= previous.fiscalDate) {
      byEffectiveDate.set(effectiveDate, snapshot);
    }
  });

  return Array.from(byEffectiveDate.values())
    .sort((left, right) => (
      left.date.localeCompare(right.date)
      || left.fiscalDate.localeCompare(right.fiscalDate)
    ));
}

function normalizePriceRows(rows, { fromDate, toDate }) {
  const byDate = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = validDateKey(row?.date);
    if (!date || date < fromDate || date > toDate) continue;
    const adjustedClose = positiveNumber(row?.adjusted_close ?? row?.adjustedClose);
    if (adjustedClose === null) continue;
    byDate.set(date, { date, close: adjustedClose });
  }
  return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
}

function snapshotIsFresh(snapshot, date) {
  if (!(snapshot?.epsTtm > 0)) return false;
  const ageDays = daysBetween(snapshot.date, date);
  return ageDays !== null && ageDays >= 0 && ageDays <= MAX_TTM_STALENESS_DAYS;
}

function buildDailyObservations(priceRows, snapshots) {
  const observations = [];
  let snapshotIndex = 0;
  let currentSnapshot = null;

  for (const priceRow of priceRows) {
    while (
      snapshotIndex < snapshots.length
      && snapshots[snapshotIndex].date < priceRow.date
    ) {
      currentSnapshot = snapshots[snapshotIndex];
      snapshotIndex += 1;
    }
    // Strictly require the price date to follow the filing date. EOD rows do
    // not include filing timestamps, so using the same day's close could leak
    // an after-hours filing into that day's valuation.
    if (!snapshotIsFresh(currentSnapshot, priceRow.date)) continue;
    const peTtm = positiveNumber(priceRow.close / currentSnapshot.epsTtm);
    if (peTtm !== null) observations.push({ date: priceRow.date, peTtm });
  }
  return observations;
}

function quantile(sortedValues, probability) {
  if (!sortedValues.length) return null;
  const index = Math.min(
    sortedValues.length - 1,
    Math.floor(sortedValues.length * probability),
  );
  return sortedValues[index];
}

function summarizeObservations(observations) {
  const values = observations
    .map((point) => point.peTtm)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (!values.length) {
    return {
      min: null,
      p25: null,
      median: null,
      average: null,
      p75: null,
      max: null,
      observationCount: 0,
    };
  }
  return {
    min: values[0],
    p25: quantile(values, 0.25),
    median: quantile(values, 0.5),
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    p75: quantile(values, 0.75),
    max: values[values.length - 1],
    observationCount: values.length,
  };
}

function percentileRank(observations, currentPeTtm) {
  if (!(currentPeTtm > 0) || observations.length === 0) return null;
  const atOrBelow = observations.reduce(
    (count, point) => count + (point.peTtm <= currentPeTtm ? 1 : 0),
    0,
  );
  return (atOrBelow / observations.length) * 100;
}

function monthlyLastTradingDaySeries(observations) {
  const byMonth = new Map();
  observations.forEach((point) => {
    byMonth.set(point.date.slice(0, 7), point);
  });
  return Array.from(byMonth.values());
}

export function buildStockValuation(fundamentalsData, eodRows, {
  symbol = '',
  peForward = null,
  now = Date.now(),
} = {}) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  const dates = valuationDates(now);
  const quarterRows = normalizeQuarterRows(
    providerField(fundamentalsData, INCOME_QUARTERS_KEY),
    {
      fromDate: dates.fundamentalsFromDate,
      toDate: dates.asOfDate,
    },
  );
  const outstandingSharesRows = normalizeOutstandingShares(
    providerField(fundamentalsData, OUTSTANDING_SHARES_KEY),
    {
      fromDate: dates.fundamentalsFromDate,
      toDate: dates.asOfDate,
    },
  );
  const snapshots = buildTtmSnapshots(quarterRows, outstandingSharesRows);
  const priceRows = normalizePriceRows(eodRows, {
    fromDate: dates.windowStartDate,
    toDate: dates.asOfDate,
  });
  const observations = buildDailyObservations(priceRows, snapshots);
  const providerPeForward = positiveNumber(peForward)
    ?? positiveNumber(providerField(fundamentalsData, 'Valuation::ForwardPE'));
  const latestPrice = priceRows.at(-1) || null;
  const latestObservation = observations.at(-1) || null;
  const currentPeTtm = latestPrice && latestObservation?.date === latestPrice.date
    ? latestObservation.peTtm
    : null;

  return {
    symbol: normalizedSymbol,
    currency: 'USD',
    source: 'EODHD_VALUATION',
    asOfDate: latestPrice?.date || '',
    windowStartDate: dates.windowStartDate,
    fetchedAt: dates.currentDate.toISOString(),
    seriesFrequency: 'monthly-last-trading-day',
    statisticsFrequency: 'daily',
    current: {
      peTtm: currentPeTtm,
      peForward: providerPeForward,
    },
    percentile5y: percentileRank(observations, currentPeTtm),
    summary: summarizeObservations(observations),
    series: monthlyLastTradingDaySeries(observations),
  };
}

export async function fetchStockValuation(symbol, {
  eodhdKey,
  peForward = null,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
} = {}) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,15}$/.test(normalizedSymbol)) throw new Error('股票代码不合法');
  const cleanKey = String(eodhdKey || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (!cleanKey) throw new Error('EODHD API key 未配置');

  const dates = valuationDates(now);
  const fundamentalsUrl = new URL(
    `https://eodhd.com/api/v1.1/fundamentals/${encodeURIComponent(normalizedSymbol)}.US`,
  );
  fundamentalsUrl.searchParams.set('api_token', cleanKey);
  fundamentalsUrl.searchParams.set('fmt', 'json');
  fundamentalsUrl.searchParams.set('from', dates.fundamentalsFromDate);
  fundamentalsUrl.searchParams.set('filter', VALUATION_FUNDAMENTALS_FILTER);

  const eodUrl = new URL(`https://eodhd.com/api/eod/${encodeURIComponent(normalizedSymbol)}.US`);
  eodUrl.searchParams.set('api_token', cleanKey);
  eodUrl.searchParams.set('fmt', 'json');
  eodUrl.searchParams.set('period', 'd');
  eodUrl.searchParams.set('from', dates.windowStartDate);
  eodUrl.searchParams.set('to', dates.asOfDate);

  let fundamentalsResponse;
  let eodResponse;
  try {
    [fundamentalsResponse, eodResponse] = await Promise.all([
      providerFetch(fundamentalsUrl.toString(), {}, {
        provider: 'eodhd:stock-valuation-fundamentals',
        timeoutMs: QUOTE_TIMEOUTS.eodhd,
        fetchImpl,
      }),
      providerFetch(eodUrl.toString(), {}, {
        provider: 'eodhd:stock-valuation-history',
        timeoutMs: QUOTE_TIMEOUTS.eodhd,
        fetchImpl,
      }),
    ]);
  } catch {
    // Never echo a provider error because some runtimes include the full URL,
    // including api_token, in network exception messages.
    throw new Error('EODHD Valuation provider 请求失败');
  }

  if (!fundamentalsResponse.ok) {
    throw new Error(`EODHD Valuation Fundamentals 返回 ${fundamentalsResponse.status}`);
  }
  if (!eodResponse.ok) {
    throw new Error(`EODHD Valuation EOD 返回 ${eodResponse.status}`);
  }

  let fundamentalsData;
  let priceRows;
  try {
    fundamentalsData = await fundamentalsResponse.json();
    priceRows = await eodResponse.json();
  } catch {
    throw new Error('EODHD Valuation 响应解析失败');
  }
  if (!fundamentalsData || typeof fundamentalsData !== 'object' || Array.isArray(fundamentalsData)) {
    throw new Error('EODHD Valuation Fundamentals 响应无效');
  }
  if (!Array.isArray(priceRows)) throw new Error('EODHD Valuation EOD 响应无效');

  return buildStockValuation(fundamentalsData, priceRows, {
    symbol: normalizedSymbol,
    peForward,
    now: dates.currentDate,
  });
}
