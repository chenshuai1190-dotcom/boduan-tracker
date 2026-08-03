const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MA200_WINDOW_TRADING_DAYS = 200;
const SOURCE = 'EODHD';
const PRICE_BASIS = 'eodhd_adjusted_close';

function validDateKey(value) {
  const dateKey = String(value || '').trim();
  if (!ISO_DATE_RE.test(dateKey)) return '';
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10) === dateKey ? dateKey : '';
}

function positiveNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function insufficientData(asOfDate = '') {
  return {
    status: 'insufficient_data',
    source: SOURCE,
    priceBasis: PRICE_BASIS,
    asOfDate,
    completedClose: null,
    ma200: null,
    distancePct: null,
    belowCompletedDays: 0,
  };
}
function normalizeCompletedRows(rows, asOfDate) {
  const cutoffDate = validDateKey(asOfDate);
  if (!cutoffDate) return [];

  const byDate = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = validDateKey(row?.date);
    if (!date || date > cutoffDate) continue;
    byDate.set(date, {
      date,
      adjustedClose: positiveNumber(row?.adjusted_close),
    });
  }

  return Array.from(byDate.values())
    .sort((left, right) => left.date.localeCompare(right.date));
}

function movingAverageAt(rows, index) {
  const start = index - MA200_WINDOW_TRADING_DAYS + 1;
  if (start < 0) return null;

  let sum = 0;
  for (let cursor = start; cursor <= index; cursor += 1) {
    const close = rows[cursor]?.adjustedClose;
    if (!(close > 0)) return null;
    sum += close;
  }
  const average = sum / MA200_WINDOW_TRADING_DAYS;
  return Number.isFinite(average) && average > 0 ? average : null;
}

/**
 * Derives the compact homepage MA200 monitor payload from the EOD history that
 * the regular quote request already fetched. Rows after `asOfDate` are ignored,
 * so realtime prices and an unfinished market date cannot confirm a breakdown.
 */
export function deriveMa200Monitor(rows = [], { asOfDate = '' } = {}) {
  const completedRows = normalizeCompletedRows(rows, asOfDate);
  const latestRow = completedRows.at(-1) || null;
  if (!latestRow) return insufficientData();

  const latestIndex = completedRows.length - 1;
  const latestMa200 = movingAverageAt(completedRows, latestIndex);
  if (!(latestRow.adjustedClose > 0) || !(latestMa200 > 0)) {
    return insufficientData(latestRow.date);
  }

  let belowCompletedDays = 0;
  if (latestRow.adjustedClose < latestMa200) {
    let foundStartBoundary = false;
    for (let index = latestIndex; index >= 0; index -= 1) {
      const movingAverage = movingAverageAt(completedRows, index);
      if (!(movingAverage > 0) || !(completedRows[index].adjustedClose > 0)) break;
      if (completedRows[index].adjustedClose >= movingAverage) {
        foundStartBoundary = true;
        break;
      }
      belowCompletedDays += 1;
    }

    // Without the preceding comparable completed day, the exact streak is
    // unknown. Fail closed instead of presenting a potentially false 1-20 day
    // confirmation for a short or incomplete history.
    if (!foundStartBoundary) return insufficientData(latestRow.date);
  }

  return {
    status: 'ready',
    source: SOURCE,
    priceBasis: PRICE_BASIS,
    asOfDate: latestRow.date,
    completedClose: latestRow.adjustedClose,
    ma200: latestMa200,
    distancePct: ((latestRow.adjustedClose / latestMa200) - 1) * 100,
    belowCompletedDays,
  };
}
