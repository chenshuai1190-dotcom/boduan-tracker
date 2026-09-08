export const INVESTMENT_COMPARISON_DEFAULTS = Object.freeze({ symbols: Object.freeze(['QQQ', 'TQQQ']), startYear: 2011, principal: 1000000 });
export const INVESTMENT_COMPARISON_STALE_REASONS = Object.freeze(['', 'incomplete_close', 'provider_unavailable', 'quota_exhausted']);
const MAX_ROWS = 25000;

export function investmentComparisonError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function isInvestmentDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizeInvestmentSymbol(value) {
  if (typeof value !== 'string') return null;
  const symbol = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol) || /[.-]{2}|[.-]$/.test(symbol)
    || /\.(US|INDX|FOREX|CC|LSE|TO|PA|HK|SHG|SHE|F|XETRA)$/.test(symbol)
    || ['VIX', 'FGI', 'INDICES'].includes(symbol)) return null;
  return symbol;
}

export function normalizeInvestmentSymbols(symbols = INVESTMENT_COMPARISON_DEFAULTS.symbols) {
  if (!Array.isArray(symbols) || symbols.length !== 2) throw investmentComparisonError('INVALID_SYMBOLS', 'exactly two instruments required');
  const normalized = symbols.map(normalizeInvestmentSymbol);
  if (normalized.some((symbol) => !symbol) || normalized[0] === normalized[1]) {
    throw investmentComparisonError('INVALID_SYMBOLS', 'two distinct valid US symbols required');
  }
  return normalized;
}

// close is already adjusted_close on this wire contract. Raw provider closes,
// missing prices and interior gaps must never be substituted or interpolated.
export function normalizeInvestmentComparisonData(value, { symbols = value?.symbols, expectedAsOfDate, now } = {}) {
  let selected;
  try { selected = normalizeInvestmentSymbols(symbols); } catch { return null; }
  const wireSymbols = value?.symbols;
  if (!value || value.version !== 1 || value.source !== 'EODHD_EOD'
    || value.priceBasis !== 'adjusted_close' || value.currency !== 'USD'
    || !Array.isArray(wireSymbols) || wireSymbols.length !== 2
    || new Set(wireSymbols).size !== 2 || !selected.every((symbol) => wireSymbols.includes(symbol))
    || !isInvestmentDate(value.expectedAsOfDate) || !isInvestmentDate(value.asOfDate)
    || value.asOfDate > value.expectedAsOfDate || !isInvestmentDate(value.availableFromDate)
    || typeof value.stale !== 'boolean' || !INVESTMENT_COMPARISON_STALE_REASONS.includes(value.staleReason)
    || (value.stale && !value.staleReason) || (!value.stale && value.staleReason)
    || (!value.stale && value.asOfDate < value.expectedAsOfDate)
    || typeof value.fetchedAt !== 'string' || !Number.isFinite(Date.parse(value.fetchedAt))) return null;
  if (expectedAsOfDate && (!isInvestmentDate(expectedAsOfDate) || value.expectedAsOfDate > expectedAsOfDate)) return null;
  if (now !== undefined && (!Number.isFinite(now) || Date.parse(value.fetchedAt) > now + 300000)) return null;
  const series = {};
  for (const symbol of selected) {
    const input = value.series?.[symbol];
    if (!input || input.symbol !== symbol || input.currency !== 'USD' || input.priceBasis !== 'adjusted_close'
      || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 300
      || !['ETF', 'Common Stock'].includes(input.type) || !Array.isArray(input.rows)
      || input.rows.length < 2 || input.rows.length > MAX_ROWS) return null;
    let previousDate = '';
    const rows = [];
    for (const row of input.rows) {
      if (!isInvestmentDate(row?.date) || row.date <= previousDate || row.date > value.asOfDate
        || typeof row.close !== 'number' || !Number.isFinite(row.close) || row.close <= 0
        || [0, 6].includes(new Date(`${row.date}T00:00:00Z`).getUTCDay()) || isRegularNyseHoliday(row.date)) return null;
      previousDate = row.date;
      rows.push({ date: row.date, close: row.close });
    }
    if (rows.at(-1).date !== value.asOfDate) return null;
    series[symbol] = { symbol, name: input.name.trim(), currency: 'USD', type: input.type, priceBasis: 'adjusted_close', rows };
  }
  const availableFromDate = selected.map((symbol) => series[symbol].rows[0].date).sort().at(-1);
  if (availableFromDate !== value.availableFromDate) return null;
  const overlap = selected.map((symbol) => series[symbol].rows.filter((row) => row.date >= availableFromDate));
  if (overlap[0].length < 2 || overlap[0].length !== overlap[1].length
    || overlap[0].some((row, index) => row.date !== overlap[1][index].date)) return null;
  const expected = expectedAsOfDate || value.expectedAsOfDate;
  const stale = value.stale || value.asOfDate < expected;
  return {
    version: 1, source: 'EODHD_EOD', priceBasis: 'adjusted_close', currency: 'USD',
    expectedAsOfDate: expected, asOfDate: value.asOfDate, availableFromDate,
    fetchedAt: value.fetchedAt, stale, staleReason: stale ? value.staleReason || 'incomplete_close' : '',
    symbols: selected, series,
  };
}

function annualRow(year, opening, point, symbols, principal, calendarComplete, startIndex, endIndex, periodStartDate, firstYearPartial = false) {
  const bySymbol = {};
  for (const symbol of symbols) {
    const end = point.values[symbol];
    bySymbol[symbol] = {
      opening: opening[symbol], end, profit: end - opening[symbol],
      returnPct: (end / opening[symbol] - 1) * 100,
      cumulativeProfit: end - principal, cumulativeReturnPct: (end / principal - 1) * 100,
    };
  }
  const complete = calendarComplete && !firstYearPartial;
  return { year, throughDate: point.date, periodStartDate, complete, partial: !complete, calendarComplete, firstYearPartial, startIndex, endIndex, bySymbol };
}

function firstRegularSession(year) {
  const date = new Date(Date.UTC(year, 0, 1));
  while ([0, 6].includes(date.getUTCDay()) || isRegularNyseHoliday(date.toISOString().slice(0, 10))) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function buildInvestmentComparisonModel({ data, symbols = data?.symbols || INVESTMENT_COMPARISON_DEFAULTS.symbols, startYear = 2011, principal = 1000000 } = {}) {
  const selected = normalizeInvestmentSymbols(symbols);
  if (typeof principal !== 'number' || !Number.isFinite(principal) || principal < 1 || principal > 1000000000) {
    throw investmentComparisonError('INVALID_PRINCIPAL', 'principal must be between 1 and 1000000000 USD');
  }
  const valid = normalizeInvestmentComparisonData(data, { symbols: selected });
  if (!valid) throw investmentComparisonError('INVALID_DATA', 'complete aligned adjusted-close USD history required');
  const endYear = Number(valid.asOfDate.slice(0, 4));
  if (!Number.isInteger(startYear) || startYear < 1900 || startYear > endYear) {
    throw investmentComparisonError('INVALID_START_YEAR', 'start year is outside the available calendar range');
  }
  const requestedStartDate = `${startYear}-01-01`;
  const cutoff = requestedStartDate > valid.availableFromDate ? requestedStartDate : valid.availableFromDate;
  const rows = selected.map((symbol) => valid.series[symbol].rows.filter((row) => row.date >= cutoff));
  if (rows[0].length < 2) throw investmentComparisonError('INSUFFICIENT_HISTORY', 'at least two real common sessions required');
  const actualStartDate = rows[0][0].date;
  const firstYearPartial = actualStartDate > firstRegularSession(Number(actualStartDate.slice(0, 4)));
  const points = rows[0].map((row, index) => {
    const values = {}, profits = {}, returns = {};
    selected.forEach((symbol, seriesIndex) => {
      values[symbol] = index === 0 ? principal : principal * (rows[seriesIndex][index].close / rows[seriesIndex][0].close);
      profits[symbol] = values[symbol] - principal;
      returns[symbol] = (values[symbol] / principal - 1) * 100;
      if (!Number.isFinite(values[symbol]) || values[symbol] <= 0 || !Number.isFinite(returns[symbol])) {
        throw investmentComparisonError('INVALID_DATA', 'adjusted-close ratio is outside the supported numeric range');
      }
    });
    return { index, date: row.date, time: Date.parse(`${row.date}T00:00:00Z`), year: Number(row.date.slice(0, 4)), values, profits, returns };
  });
  const annual = [];
  let opening = points[0].values;
  let yearStartIndex = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (index === points.length - 1 || points[index + 1].year !== point.year) {
      const initialYear = yearStartIndex === 0;
      annual.push(annualRow(point.year, opening, point, selected, principal, point.year < endYear, yearStartIndex, index,
        initialYear ? actualStartDate : `${point.year}-01-01`, initialYear && firstYearPartial));
      opening = point.values;
      yearStartIndex = index + 1;
    }
  }
  return {
    symbols: selected, principal, startYear, actualStartYear: points[0].year, endYear,
    requestedStartDate, actualStartDate, firstYearPartial, startDateAdjusted: actualStartDate !== requestedStartDate,
    startAdjustmentReason: valid.availableFromDate > requestedStartDate ? 'available_history' : actualStartDate !== requestedStartDate ? 'first_session' : '',
    availableFromDate: valid.availableFromDate, asOfDate: valid.asOfDate, expectedAsOfDate: valid.expectedAsOfDate,
    source: valid.source, priceBasis: valid.priceBasis, currency: valid.currency,
    stale: valid.stale, staleReason: valid.staleReason, fetchedAt: valid.fetchedAt,
    points, annual,
  };
}

// A fractional animation cursor selects the preceding real session. Displayed
// dates, money, returns and yearly facts never use an invented between-day price.
export function getInvestmentComparisonSnapshot(model, progress = 0) {
  if (!model || !Array.isArray(model.points) || model.points.length < 2) throw investmentComparisonError('INVALID_DATA', 'valid comparison model required');
  if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > model.points.length - 1) {
    throw investmentComparisonError('INVALID_PROGRESS', 'replay index is outside the real daily sequence');
  }
  const index = Math.floor(progress);
  const point = model.points[index];
  const annualRows = [];
  for (const row of model.annual) {
    if (row.startIndex > index) break;
    if (row.endIndex <= index) annualRows.push(row);
    else {
      const opening = Object.fromEntries(model.symbols.map((symbol) => [symbol, row.bySymbol[symbol].opening]));
      annualRows.push(annualRow(row.year, opening, point, model.symbols, model.principal, false, row.startIndex, index, row.periodStartDate, row.firstYearPartial));
    }
  }
  return { index, point, annualRows, progress: index / (model.points.length - 1), isFinal: index === model.points.length - 1 };
}
import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';
