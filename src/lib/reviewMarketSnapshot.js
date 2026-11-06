import { getVixComparisonExpectedCloseDate, isVixComparisonSession } from './vixComparisonSession.js';
import { classifyCurrentRiskLevel, classifyTermStructure } from './vixRiskModel.js';
import { fearGreedDisplay } from './fearGreedDisplay.js';

export const REVIEW_MARKET_KEYS = Object.freeze(['vix', 'ratio', 'fearGreed']);
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const score = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const english = language => String(language).toLowerCase().startsWith('en');
const LEVELS = {
  LOW_VOLATILITY: ['低波动', 'Low volatility'], NORMAL: ['常态波动', 'Normal volatility'],
  ELEVATED: ['波动升高', 'Elevated volatility'], HIGH_STRESS: ['高压状态', 'High stress'],
  EXTREME_STRESS: ['极端压力', 'Extreme stress'], CLOSE: ['收盘', 'Close'],
  NORMAL_TERM_STRUCTURE: ['明显正向结构', 'Upward term structure'],
  NEAR_FLAT: ['接近平坦，尚未倒挂', 'Near flat, not inverted'],
  INVERTED: ['期限倒挂', 'Inverted'], DEEP_INVERTED: ['深度倒挂', 'Deeply inverted'],
};

export function validReviewMarketDate(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function reviewMarketDateStatus(date, recordDate, now = Date.now()) {
  if (!validReviewMarketDate(date) || !validReviewMarketDate(recordDate)) return 'invalid_date';
  if (date > recordDate) return 'after_record';
  if (date > getVixComparisonExpectedCloseDate(now)) return 'incomplete_close';
  if (!isVixComparisonSession(date)) return 'not_session';
  return 'ready';
}

export function reviewMarketItemLabel(key, language = 'zh') {
  if (key === 'vix') return 'VIX';
  if (key === 'ratio') return 'VIX / VIX3M';
  return english(language) ? 'Fear & Greed' : '恐慌与贪婪';
}

export function reviewMarketItemState(item, language = 'zh') {
  if (item.key === 'fearGreed') return fearGreedDisplay(item.value, language).label;
  return LEVELS[item.stateCode]?.[english(language) ? 1 : 0] || (english(language) ? 'Close' : '收盘');
}

export function formatReviewMarketItem(item, language = 'zh') {
  if (typeof item?.value !== 'number' || !Number.isFinite(item.value)) return '—';
  if (item.key === 'fearGreed') return String(fearGreedDisplay(item.value, language).score ?? '—');
  return item.value.toFixed(item.key === 'ratio' ? 3 : 2);
}

function exactRow(rows, date) {
  const matches = (Array.isArray(rows) ? rows : []).filter(row => row?.date === date);
  return matches.length === 1 ? matches[0] : null;
}

function fearGreedClose(data, date, now) {
  if (data?.source !== 'CNN' || !Number.isFinite(Date.parse(data.fetchedAt))) return null;
  // A cache collected before the session finished cannot become a closing
  // observation merely because the browser clock has since passed the close.
  const capturedAt = Math.min(now, Date.parse(data.fetchedAt));
  if (date > getVixComparisonExpectedCloseDate(capturedAt)) return null;
  const matches = (Array.isArray(data.history) ? data.history : []).filter(point => {
    if (!Number.isSafeInteger(point?.timestamp) || point.timestamp <= 0 || point.timestamp > capturedAt) return false;
    return new Date(point.timestamp).toISOString().slice(0, 10) === date;
  });
  if (matches.length !== 1 || !score(matches[0].value)) return null;
  const point = matches[0];
  const stamp = new Date(point.timestamp);
  // CNN's midnight UTC daily points encode source dates, not New York times.
  // A non-midnight point is an observation: require an actual post-close time.
  if (stamp.toISOString().slice(11) !== '00:00:00.000Z') {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(stamp).map(part => [part.type, part.value]));
    if (`${parts.year}-${parts.month}-${parts.day}` !== date || Number(parts.hour) * 60 + Number(parts.minute) < 960) return null;
  }
  return { value: point.value, sourceTimestamp: point.timestamp, sourceRating: point.rating ?? null };
}

/** Read exact dates only. Each indicator can be independently unavailable. */
export function readReviewMarketDate({ date, recordDate, vixComparison, fearGreed, now = Date.now() } = {}) {
  const status = reviewMarketDateStatus(date, recordDate, now);
  if (status !== 'ready') return { status, items: [] };
  const items = [];
  const vixRow = exactRow(vixComparison?.series?.VIX?.rows, date);
  const term = exactRow(vixComparison?.termStructure?.rows, date);
  const validTerm = vixComparison?.termStructure?.source === 'CBOE'
    && positive(term?.vix) && positive(term?.vix3m) && positive(term?.ratio)
    && Math.abs(term.ratio - term.vix / term.vix3m) <= 1e-8
    && (!positive(vixRow?.close) || Math.abs(vixRow.close - term.vix) <= 1e-8);
  const vix = vixComparison?.source === 'CBOE_EODHD_EOD' && positive(vixRow?.close)
    ? vixRow.close : validTerm ? term.vix : null;
  const ratio = validTerm ? term.vix / term.vix3m : null;
  const common = { asOfDate: date, basis: 'close' };
  if (vix !== null) items.push({ ...common, key: 'vix', value: vix, source: 'CBOE',
    stateCode: ratio === null ? 'CLOSE' : classifyCurrentRiskLevel({ vix, ratio }) });
  if (ratio !== null) items.push({ ...common, key: 'ratio', value: ratio, vix: term.vix,
    vix3m: term.vix3m, source: 'CBOE', stateCode: classifyTermStructure(ratio) });
  const fear = fearGreedClose(fearGreed, date, now);
  if (fear) items.push({ ...common, ...fear, key: 'fearGreed', source: 'CNN', stateCode: fearGreedDisplay(fear.value).rating });
  return { status, items };
}

/** JSON-only independent value snapshot; never retain provider references. */
export function createReviewMarketSnapshot({ date, recordDate, items, selectedKeys, example = false, now = Date.now() } = {}) {
  if (reviewMarketDateStatus(date, recordDate, now) !== 'ready') return null;
  const selected = new Set(selectedKeys || []);
  const chosen = (items || []).filter(item => selected.has(item.key));
  return normalizeReviewMarketSnapshot({ version: 1, kind: 'market_snapshot', asOfDate: date,
    recordDate, basis: 'close', example: example === true, items: chosen });
}

/** Validate persisted content without a data request or reference to latest prices. */
export function normalizeReviewMarketSnapshot(value) {
  if (!value || value.kind !== 'market_snapshot' || value.basis !== 'close'
    || !validReviewMarketDate(value.asOfDate) || !isVixComparisonSession(value.asOfDate)
    || !validReviewMarketDate(value.recordDate) || value.asOfDate > value.recordDate
    || !Array.isArray(value.items) || !value.items.length || value.items.length > 3) return null;
  const seen = new Set();
  const items = [];
  for (const item of value.items) {
    if (!REVIEW_MARKET_KEYS.includes(item?.key) || seen.has(item.key)
      || item.asOfDate !== value.asOfDate || item.basis !== 'close'
      || item.source !== (item.key === 'fearGreed' ? 'CNN' : 'CBOE')
      || !(item.key === 'fearGreed' ? score(item.value) : positive(item.value))) return null;
    seen.add(item.key);
    const clean = { key: item.key, value: item.value, asOfDate: value.asOfDate, basis: 'close', source: item.source };
    if (item.key === 'ratio') {
      if (!positive(item.vix) || !positive(item.vix3m) || Math.abs(item.value - item.vix / item.vix3m) > 1e-8) return null;
      Object.assign(clean, { vix: item.vix, vix3m: item.vix3m, stateCode: classifyTermStructure(item.value) });
    } else if (item.key === 'fearGreed') {
      clean.stateCode = fearGreedDisplay(item.value).rating;
      if (Number.isSafeInteger(item.sourceTimestamp) && item.sourceTimestamp > 0
        && new Date(item.sourceTimestamp).toISOString().slice(0, 10) === value.asOfDate) clean.sourceTimestamp = item.sourceTimestamp;
      clean.sourceRating = typeof item.sourceRating === 'string' ? item.sourceRating.slice(0, 30) : null;
    } else clean.stateCode = Object.hasOwn(LEVELS, item.stateCode) ? item.stateCode : 'CLOSE';
    items.push(clean);
  }
  items.sort((a, b) => REVIEW_MARKET_KEYS.indexOf(a.key) - REVIEW_MARKET_KEYS.indexOf(b.key));
  return { version: 1, kind: 'market_snapshot', asOfDate: value.asOfDate, recordDate: value.recordDate,
    basis: 'close', source: [...new Set(items.map(item => item.source))].join(' · '),
    example: value.example === true, items };
}
