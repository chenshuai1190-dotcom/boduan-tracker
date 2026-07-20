import { providerFetch, QUOTE_TIMEOUTS } from './http.js';

const FUNDAMENTALS_HISTORY_YEARS = 3;
const MIN_QUARTER_GAP_DAYS = 60;
const MAX_QUARTER_GAP_DAYS = 135;
const FUNDAMENTALS_FILTER = [
  'Highlights::MarketCapitalization',
  'Highlights::PERatio',
  'Valuation::TrailingPE',
  'Valuation::ForwardPE',
  'Financials::Income_Statement::quarterly',
  'Financials::Cash_Flow::quarterly',
].join(',');

const INCOME_QUARTERS_KEY = 'Financials::Income_Statement::quarterly';
const CASH_FLOW_QUARTERS_KEY = 'Financials::Cash_Flow::quarterly';

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function validDateKey(value) {
  const key = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return '';
  const date = new Date(`${key}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toISOString().slice(0, 10) === key ? key : '';
}

function providerField(data, path) {
  if (!data || typeof data !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(data, path)) return data[path];
  return path.split('::').reduce((value, key) => value?.[key], data);
}

function normalizeQuarterRows(block, fields) {
  const entries = Array.isArray(block)
    ? block.map((row, index) => [String(index), row])
    : Object.entries(block && typeof block === 'object' ? block : {});
  const byDate = new Map();
  for (const [key, row] of entries) {
    if (!row || typeof row !== 'object') continue;
    const date = validDateKey(row.date || key);
    if (!date) continue;
    byDate.set(date, {
      date,
      ...Object.fromEntries(fields.map((field) => [field, finiteNumber(row[field])])),
    });
  }
  return Array.from(byDate.values()).sort((left, right) => right.date.localeCompare(left.date));
}

function completeQuarterWindow(rows, count, fields) {
  const window = rows.slice(0, count);
  if (window.length !== count) return null;
  for (let index = 0; index < window.length; index += 1) {
    const row = window[index];
    if (fields.some((field) => row[field] === null)) return null;
    if (index === 0) continue;
    const newer = Date.parse(`${window[index - 1].date}T00:00:00Z`);
    const older = Date.parse(`${row.date}T00:00:00Z`);
    const gapDays = (newer - older) / 86_400_000;
    if (!Number.isFinite(gapDays) || gapDays < MIN_QUARTER_GAP_DAYS || gapDays > MAX_QUARTER_GAP_DAYS) {
      return null;
    }
  }
  return window;
}

function sumRows(rows, field) {
  return rows.reduce((sum, row) => sum + row[field], 0);
}

function percentRatio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  const result = (numerator / denominator) * 100;
  return Number.isFinite(result) ? result : null;
}

function historyFromDate(now) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) return '';
  date.setUTCFullYear(date.getUTCFullYear() - FUNDAMENTALS_HISTORY_YEARS);
  return date.toISOString().slice(0, 10);
}

export function buildStockFundamentals(data, { symbol = '', now = Date.now() } = {}) {
  const incomeRows = normalizeQuarterRows(providerField(data, INCOME_QUARTERS_KEY), [
    'totalRevenue',
    'netIncome',
  ]);
  const cashFlowRows = normalizeQuarterRows(providerField(data, CASH_FLOW_QUARTERS_KEY), [
    'freeCashFlow',
  ]);
  const latestEightRevenue = completeQuarterWindow(incomeRows, 8, ['totalRevenue']);
  const latestFourIncome = completeQuarterWindow(incomeRows, 4, ['totalRevenue', 'netIncome']);
  const latestFourRevenue = completeQuarterWindow(incomeRows, 4, ['totalRevenue']);

  let revenueGrowthTtmPct = null;
  if (latestEightRevenue) {
    const currentRevenue = sumRows(latestEightRevenue.slice(0, 4), 'totalRevenue');
    const previousRevenue = sumRows(latestEightRevenue.slice(4, 8), 'totalRevenue');
    const ratio = percentRatio(currentRevenue, previousRevenue);
    revenueGrowthTtmPct = ratio === null ? null : ratio - 100;
  }

  let netMarginTtmPct = null;
  if (latestFourIncome) {
    netMarginTtmPct = percentRatio(
      sumRows(latestFourIncome, 'netIncome'),
      sumRows(latestFourIncome, 'totalRevenue'),
    );
  }

  let freeCashFlowMarginTtmPct = null;
  if (latestFourRevenue) {
    const cashByDate = new Map(cashFlowRows.map((row) => [row.date, row]));
    const alignedCashRows = latestFourRevenue.map((row) => cashByDate.get(row.date));
    if (alignedCashRows.every((row) => row && row.freeCashFlow !== null)) {
      freeCashFlowMarginTtmPct = percentRatio(
        sumRows(alignedCashRows, 'freeCashFlow'),
        sumRows(latestFourRevenue, 'totalRevenue'),
      );
    }
  }

  const trailingPe = positiveNumber(providerField(data, 'Valuation::TrailingPE'))
    ?? positiveNumber(providerField(data, 'Highlights::PERatio'));

  return {
    symbol: String(symbol || '').trim().toUpperCase(),
    currency: 'USD',
    source: 'EODHD_FUNDAMENTALS',
    asOfDate: incomeRows[0]?.date || '',
    fetchedAt: new Date(now).toISOString(),
    marketCapitalization: positiveNumber(providerField(data, 'Highlights::MarketCapitalization')),
    peTtm: trailingPe,
    peForward: positiveNumber(providerField(data, 'Valuation::ForwardPE')),
    revenueGrowthTtmPct,
    netMarginTtmPct,
    freeCashFlowMarginTtmPct,
  };
}

export async function fetchStockFundamentals(symbol, {
  eodhdKey,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
} = {}) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,15}$/.test(normalizedSymbol)) throw new Error('股票代码不合法');
  if (!String(eodhdKey || '').trim()) throw new Error('EODHD API key 未配置');

  const url = new URL(`https://eodhd.com/api/v1.1/fundamentals/${encodeURIComponent(normalizedSymbol)}.US`);
  url.searchParams.set('api_token', String(eodhdKey).trim());
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('from', historyFromDate(now));
  url.searchParams.set('filter', FUNDAMENTALS_FILTER);

  const response = await providerFetch(url.toString(), {}, {
    provider: 'eodhd:stock-fundamentals',
    timeoutMs: QUOTE_TIMEOUTS.eodhd,
    fetchImpl,
  });
  if (!response.ok) throw new Error(`EODHD Fundamentals 返回 ${response.status}`);
  const data = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('EODHD Fundamentals 响应无效');
  return buildStockFundamentals(data, { symbol: normalizedSymbol, now });
}
