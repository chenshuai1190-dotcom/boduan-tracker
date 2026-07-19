const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMA_30_ALPHA = 2 / 31;
const TRADING_DAYS_PER_YEAR = 252;
const FIFTY_TWO_WEEKS_IN_DAYS = 52 * 7;

function positiveNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function validDateKey(value) {
  const dateKey = String(value || '').trim();
  if (!ISO_DATE_RE.test(dateKey)) return '';
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10) === dateKey ? dateKey : '';
}

function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateEma30(closes) {
  if (closes.length < 30) return null;
  let ema = mean(closes.slice(0, 30));
  for (let index = 30; index < closes.length; index += 1) {
    ema += EMA_30_ALPHA * (closes[index] - ema);
  }
  return Number.isFinite(ema) ? ema : null;
}

function calculateAnnualizedVolatility20(closes) {
  if (closes.length < 21) return null;
  const window = closes.slice(-21);
  const logReturns = [];
  for (let index = 1; index < window.length; index += 1) {
    const dailyReturn = Math.log(window[index] / window[index - 1]);
    if (!Number.isFinite(dailyReturn)) return null;
    logReturns.push(dailyReturn);
  }
  const averageReturn = mean(logReturns);
  const sampleVariance = logReturns.reduce(
    (sum, value) => sum + ((value - averageReturn) ** 2),
    0,
  ) / (logReturns.length - 1);
  const annualizedPercent = Math.sqrt(sampleVariance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
  return Number.isFinite(annualizedPercent) ? annualizedPercent : null;
}

function normalizeRows(rows, asOfDate) {
  const byDate = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = validDateKey(row?.date);
    if (!date || date > asOfDate) continue;

    const adjustedClose = positiveNumber(row?.adjusted_close);
    if (adjustedClose === null) continue;

    const rawClose = positiveNumber(row?.close);
    const rawHigh = positiveNumber(row?.high);
    const adjustedHigh = rawClose !== null && rawHigh !== null
      ? rawHigh * (adjustedClose / rawClose)
      : null;

    // EODHD rows should be unique by date. If duplicates arrive, the last valid
    // provider row wins; an invalid duplicate never erases an earlier valid row.
    byDate.set(date, {
      date,
      close: adjustedClose,
      adjustedHigh: adjustedHigh !== null && Number.isFinite(adjustedHigh) && adjustedHigh > 0
        ? Math.max(adjustedHigh, adjustedClose)
        : adjustedClose,
    });
  }

  return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
}

export function buildEodhdStockDetail(rows = [], { asOfDate } = {}) {
  const cutoffDate = validDateKey(asOfDate);
  if (!cutoffDate) {
    return {
      source: 'EODHD_EOD',
      priceBasis: 'adjusted_close',
      currency: 'USD',
      asOfDate: '',
      history: [],
      indicators: {
        week52High: null,
        ma200: null,
        ema30: null,
        volatility20AnnualizedPct: null,
      },
    };
  }

  const normalizedRows = normalizeRows(rows, cutoffDate);
  const history = normalizedRows.map(({ date, close }) => ({ date, close }));
  const closes = history.map((row) => row.close);
  const latestDate = history.at(-1)?.date || '';
  const week52Start = latestDate
    ? shiftDateKey(latestDate, -FIFTY_TWO_WEEKS_IN_DAYS)
    : '';
  const week52Rows = week52Start
    ? normalizedRows.filter((row) => row.date >= week52Start && row.date <= latestDate)
    : [];
  const week52High = week52Rows.length > 0
    ? Math.max(...week52Rows.map((row) => row.adjustedHigh))
    : null;
  const ma200 = closes.length >= 200 ? mean(closes.slice(-200)) : null;

  return {
    source: 'EODHD_EOD',
    priceBasis: 'adjusted_close',
    currency: 'USD',
    asOfDate: latestDate,
    history,
    indicators: {
      week52High: Number.isFinite(week52High) ? week52High : null,
      ma200: Number.isFinite(ma200) ? ma200 : null,
      ema30: calculateEma30(closes),
      volatility20AnnualizedPct: calculateAnnualizedVolatility20(closes),
    },
  };
}
