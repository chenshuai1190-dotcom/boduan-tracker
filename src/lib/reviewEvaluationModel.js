// Pure persisted-value contracts. These functions never read live trades or
// current account values to repair a missing historical reference.
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const accountKeys = ['cumulativeReturnPct', 'yearPeakReturnPct', 'declineFromYearPeakPp', 'dailyReturnPct', 'leverage'];
const peakKeys = ['yearPeakReturnPct', 'declineFromYearPeakPp'];
const validTimestamp = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && validDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const invalid = (strict, code, message, fallback) => {
  if (strict) throw Object.assign(new Error(message), { code });
  return fallback;
};
const validDate = value => {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};

export function normalizeReviewEvaluationScore(value, { strict = false } = {}) {
  if (value == null) return null;
  if (Number.isInteger(value) && value >= 1 && value <= 10) return value;
  return invalid(strict, 'REVIEW_INVALID_SCORE', '评分须为 1 至 10 的整数，或清除评分。', null);
}

export function normalizeReviewEvaluationTags(value, { strict = false } = {}) {
  if (value == null) return [];
  if (!Array.isArray(value)) return invalid(strict, 'REVIEW_INVALID_TAGS', '评价标签格式无效。', []);
  const result = [], seen = new Set();
  for (const item of value) {
    const tag = typeof item === 'string' ? item.normalize('NFKC').trim().replace(/\s+/gu, ' ') : '';
    if (!tag || Array.from(tag).length > 12 || /[\u0000-\u001f\u007f]/u.test(tag)) {
      invalid(strict, 'REVIEW_INVALID_TAG', '每个评价标签须为 1 至 12 个字符。', null);
      continue;
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (result.length >= 8) {
      invalid(strict, 'REVIEW_TAGS_LIMIT', '每条评价最多添加 8 个标签。', null);
      continue;
    }
    result.push(tag);
  }
  return result;
}

export function normalizeReviewTradeReferences(value, { strict = false } = {}) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 20) {
    return invalid(strict, 'REVIEW_TRADES_LIMIT', '每条评价最多关联 20 笔交易。', []);
  }
  const result = [], seen = new Set();
  for (const item of value) {
    const id = typeof item?.id === 'string' ? item.id.trim()
      : Number.isSafeInteger(item?.id) && item.id > 0 ? String(item.id) : '';
    const symbol = typeof item?.symbol === 'string' ? item.symbol.trim().toUpperCase() : '';
    if (!plainObject(item) || !id || id.length > 100 || /[\u0000-\u001f\u007f]/u.test(id)
      || seen.has(id) || !/^[A-Z0-9^][A-Z0-9.^=-]{0,19}$/.test(symbol)
      || !validDate(item.date) || !['buy', 'sell'].includes(item.side)
      || !positive(item.price) || !positive(item.shares)) {
      invalid(strict, 'REVIEW_INVALID_TRADE', '关联交易信息无效，请重新选择。', null);
      continue;
    }
    seen.add(id);
    result.push({ id, symbol, date: item.date, side: item.side, price: item.price, shares: item.shares });
  }
  return result;
}

export function normalizeReviewAccountSnapshot(value, { strict = false } = {}) {
  if (value == null) return null;
  const reject = () => invalid(strict, 'REVIEW_INVALID_ACCOUNT', '历史账户快照无效，请重新选择。', null);
  if (!plainObject(value) || value.version !== 1 || value.kind !== 'account_snapshot'
    || value.basis !== 'close' || value.source !== 'pnl_report'
    || !validDate(value.asOfDate) || !validDate(value.recordDate)
    || !Array.isArray(value.items) || !value.items.length || value.items.length > accountKeys.length) return reject();
  const items = [], seen = new Set();
  for (const item of value.items) {
    const isPeak = peakKeys.includes(item?.key);
    if (!plainObject(item) || !accountKeys.includes(item.key) || seen.has(item.key)
      || item.asOfDate !== value.asOfDate || item.basis !== 'close' || item.source !== 'pnl_report'
      || !finite(item.value) || (item.key === 'leverage' && !positive(item.value))
      || (isPeak && (!validDate(item.peakDate) || item.peakDate > value.asOfDate
        || item.peakDate.slice(0, 4) !== value.asOfDate.slice(0, 4)))
      || (item.key === 'declineFromYearPeakPp' && item.value < 0)) {
      reject();
      continue;
    }
    seen.add(item.key);
    items.push({ key: item.key, value: item.value, asOfDate: value.asOfDate, basis: 'close', source: 'pnl_report',
      ...(isPeak ? { peakDate: item.peakDate } : {}) });
  }
  const current = items.find(item => item.key === 'cumulativeReturnPct');
  const peak = items.find(item => item.key === 'yearPeakReturnPct');
  const decline = items.find(item => item.key === 'declineFromYearPeakPp');
  // Selected metrics may be saved independently. When all facts are supplied,
  // preserve their percentage-point meaning and reject contradictory references.
  const tolerance = 1e-8;
  if ((peak && decline && peak.peakDate !== decline.peakDate)
    || (current && peak && peak.value + tolerance < current.value)
    || (current && peak && decline && Math.abs(peak.value - current.value - decline.value) > tolerance)) {
    reject();
    for (let index = items.length - 1; index >= 0; index--) {
      if (peakKeys.includes(items[index].key)) items.splice(index, 1);
    }
  }
  if (!items.length) return null;
  items.sort((a, b) => accountKeys.indexOf(a.key) - accountKeys.indexOf(b.key));
  const evidence = {};
  for (const key of ['sourceSnapshotId', 'sourceVersion', 'sourceUpdatedAt', 'capturedAt', 'lockedAt']) {
    if (value[key] == null) continue;
    const valid = key === 'sourceSnapshotId' ? typeof value[key] === 'string' && value[key].trim().length > 0
      && value[key].length <= 100 && !/[\u0000-\u001f\u007f]/u.test(value[key])
      : key === 'sourceVersion' ? value[key] === 'pnl_snapshot_v2' : validTimestamp(value[key]);
    if (!valid) { reject(); continue; }
    evidence[key] = key === 'sourceSnapshotId' ? value[key].trim() : value[key];
  }
  // A hindsight snapshot can postdate the original journal entry. Keep both
  // dates: completed-close eligibility is checked when selecting its source.
  return { version: 1, kind: 'account_snapshot', asOfDate: value.asOfDate, recordDate: value.recordDate,
    basis: 'close', source: 'pnl_report', items, ...evidence };
}
