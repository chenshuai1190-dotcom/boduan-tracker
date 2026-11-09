import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';
import { isReviewAccountCloseDate } from './reviewAccountSnapshot.js';
import { normalizeInvestmentSymbol } from './investmentComparisonModel.js';
import { getInvestmentComparisonExpectedCloseDate } from './investmentComparison.js';

const DAY = 86400000;
const failure = (code, message) => Object.assign(new Error(message), { code });
const validDate = value => typeof value === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const timestamp = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
  && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const number = value => {
  if (typeof value !== 'number' && (typeof value !== 'string'
    || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
const shift = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const isSession = date => validDate(date)
  && ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) && !isRegularNyseHoliday(date);
function adjacentSession(date, direction = 1) {
  let next = shift(date, direction);
  while (!isSession(next)) next = shift(next, direction);
  return next;
}
const rangeKey = (symbol, year) => `${symbol}:${year}`;
const recordImproved = (value, previous) => previous === null
  || value < previous - Math.max(1e-8, Math.abs(previous) * 1e-10);

function ownedRows(rows, owner) {
  if (!Array.isArray(rows)) throw failure('REVIEW_HISTORY_INVALID', '个股跌幅记录的数据格式不正确。');
  for (const row of rows) if (!row || row.user_id !== owner) {
    throw failure('REVIEW_ACCOUNT_CHANGED', '账户数据不匹配，请重新打开时间线。');
  }
}

function verifiedHoldings({ snapshots = [], symbolSnapshots = [], expectedUserId, now = Date.now() } = {}) {
  const currentTime = Number(now);
  if (!Number.isFinite(currentTime) || !Number.isFinite(new Date(currentTime).getTime())) {
    throw failure('REVIEW_CLOCK_INVALID', '无法确认当前日期。');
  }
  if (typeof expectedUserId !== 'string' || !expectedUserId.trim()) {
    throw failure('REVIEW_AUTH_REQUIRED', '请先登录后读取时间线。');
  }
  ownedRows(snapshots, expectedUserId);
  ownedRows(symbolSnapshots, expectedUserId);
  const warnings = new Set(), closes = new Map(), seenDates = new Set(), seenIds = new Set();
  for (const row of snapshots) {
    if (seenDates.has(row.snapshot_date) || seenIds.has(row.id)) {
      throw failure('REVIEW_HISTORY_DUPLICATE', '同一交易日存在重复快照，暂不计算个股跌幅记录。');
    }
    seenDates.add(row.snapshot_date); seenIds.add(row.id);
    const locked = timestamp(row.locked_at), updated = timestamp(row.updated_at);
    if (typeof row.id !== 'string' || !row.id.trim() || row.source_version !== 'pnl_snapshot_v2'
      || row.currency !== 'USD' || locked === null || updated === null || locked > currentTime || updated > currentTime
      || !isReviewAccountCloseDate(row.snapshot_date, locked) || !isReviewAccountCloseDate(row.snapshot_date, currentTime)) continue;
    closes.set(row.snapshot_date, row);
  }
  const groups = new Map(), seenSymbols = new Set();
  seenIds.clear();
  for (const row of symbolSnapshots) {
    const symbol = normalizeInvestmentSymbol(row.symbol), date = row.snapshot_date;
    const key = `${symbol}:${date}`;
    if (seenSymbols.has(key) || seenIds.has(row.id)) {
      throw failure('REVIEW_HISTORY_DUPLICATE', '个股收盘持仓存在重复记录，暂不计算个股跌幅记录。');
    }
    seenSymbols.add(key); seenIds.add(row.id);
    const shares = number(row.held_shares), updated = timestamp(row.updated_at);
    // Only an actual, completed symbol close proves a holding on that date.
    // A trade/holding entry date, average cost or today's position is never
    // extended backwards to invent historical ownership.
    if (shares === null || shares <= 0 || row.is_open === false || !isReviewAccountCloseDate(date, currentTime)) continue;
    if (!symbol || typeof row.id !== 'string' || !row.id.trim()
      || row.source_version !== 'pnl_snapshot_v2' || row.currency !== 'USD'
      || updated === null || updated > currentTime || !closes.has(date)) {
      warnings.add('部分正持仓缺少已核验的收盘依据，未生成对应日期的个股跌幅纪录。');
      continue;
    }
    const year = Number(date.slice(0, 4));
    if (year <= 2000) {
      warnings.add('部分个股缺少年初前一交易日的行情，未生成对应年度跌幅纪录。');
      continue;
    }
    const groupKey = rangeKey(symbol, year);
    let group = groups.get(groupKey);
    if (!group) {
      group = { symbol, year, startDate: adjacentSession(`${year}-01-01`, -1), endDate: date, holdings: new Map() };
      groups.set(groupKey, group);
    }
    group.endDate = group.endDate > date ? group.endDate : date;
    group.holdings.set(date, { name: typeof row.name === 'string' ? row.name.trim().slice(0, 300) : '',
      sourceSnapshotId: row.id, accountSnapshotId: closes.get(date).id });
  }
  return { groups: [...groups.values()].sort((a, b) => a.year - b.year || a.symbol.localeCompare(b.symbol)),
    warnings, currentTime };
}

/** One bounded annual request per symbol; the year starts before January's
 * first close so that even its first trading-day return has a real baseline. */
export function collectReviewStockDailyRecordRanges(options = {}) {
  const { groups, warnings } = verifiedHoldings(options);
  return { ranges: groups.map(({ symbol, year, startDate, endDate }) => ({ symbol, year, startDate, endDate })),
    warnings: [...warnings] };
}

function validatedSeries(history, range, currentTime, latestClose) {
  if (!history || history.version !== 1 || history.source !== 'EODHD_EOD_SPLITS' || history.synthetic === true
    || history.priceBasis !== 'split_adjusted_close' || history.currency !== 'USD'
    || !validDate(history.requestedStartDate) || history.requestedStartDate > range.startDate
    || !validDate(history.requestedEndDate) || history.requestedEndDate < range.endDate || history.requestedEndDate > latestClose
    || history.expectedAsOfDate !== latestClose
    || history.splitBasisDate !== history.expectedAsOfDate || history.expectedAsOfDate < history.requestedEndDate
    || !isSession(history.asOfDate) || history.asOfDate > history.requestedEndDate
    || timestamp(history.fetchedAt) === null || timestamp(history.fetchedAt) > currentTime + 300000
    || !Array.isArray(history.symbols) || !history.symbols.includes(range.symbol)) return null;
  const input = history.series?.[range.symbol];
  if (!input || input.symbol !== range.symbol || !['ETF', 'Common Stock'].includes(input.type)
    || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 300
    || input.priceBasis != null && input.priceBasis !== 'split_adjusted_close'
    || input.currency != null && input.currency !== 'USD'
    || !Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > 25000) return null;
  const rows = new Map();
  let prior = '';
  for (const row of input.rows) {
    if (!isSession(row?.date) || row.date <= prior || row.date < history.requestedStartDate || row.date > history.requestedEndDate
      || typeof row.close !== 'number' || !Number.isFinite(row.close) || row.close <= 0) return null;
    rows.set(row.date, row.close); prior = row.date;
  }
  return { rows, name: input.name.trim(), splitBasisDate: history.splitBasisDate };
}

/** Pure read-only stock event derivation. Prices describe the stock, never the
 * account's return or the user's execution price. The loader supplies a clean
 * before/after report revision fence covering all private snapshot reads. */
export function buildReviewStockDailyRecords({ histories = [], ...options } = {}) {
  if (!Array.isArray(histories)) throw failure('REVIEW_HISTORY_INVALID', '个股行情格式不正确。');
  const { groups, warnings, currentTime } = verifiedHoldings(options);
  const latestClose = getInvestmentComparisonExpectedCloseDate(currentTime), events = [];
  for (const group of groups) {
    const candidates = histories.map(history => validatedSeries(history, group, currentTime, latestClose)).filter(Boolean);
    if (!candidates.length) {
      warnings.add(`${group.symbol} ${group.year} 年行情暂不可核验，未生成对应的个股跌幅纪录。`);
      continue;
    }
    const source = candidates[0];
    // Never splice prices from different split adjustment bases or silently
    // resolve conflicting overlapping responses by arrival order.
    if (candidates.some(item => item.splitBasisDate !== source.splitBasisDate
      || [...item.rows].some(([date, close]) => date >= group.startDate && date <= group.endDate
        && source.rows.has(date) && source.rows.get(date) !== close))) {
      warnings.add(`${group.symbol} ${group.year} 年行情版本不一致，未生成对应的个股跌幅纪录。`);
      continue;
    }
    let previousClose = source.rows.get(group.startDate), previousRecord = null, event = null;
    if (previousClose === undefined) {
      warnings.add(`${group.symbol} ${group.year} 年缺少年初行情，未生成对应的个股跌幅纪录。`);
      continue;
    }
    for (let date = adjacentSession(group.startDate); date <= group.endDate; date = adjacentSession(date)) {
      const close = source.rows.get(date);
      if (close === undefined) {
        warnings.add(`${group.symbol} ${group.year} 年行情存在缺口，缺口之后不判定年内跌幅纪录。`);
        break;
      }
      const value = (close / previousClose - 1) * 100;
      if (Number.isFinite(value) && value < -1e-8 && recordImproved(value, previousRecord?.value ?? null)) {
        const holding = group.holdings.get(date);
        if (holding) {
          const point = { date, stockCloseUsd: close, previousCloseUsd: previousClose, stockDailyReturnPct: value,
            previousRecordPct: previousRecord?.value ?? null, previousRecordDate: previousRecord?.date ?? null,
            sourceSnapshotId: holding.sourceSnapshotId, accountSnapshotId: holding.accountSnapshotId };
          if (!event) {
            event = { id: `record:stock_daily_return:${group.symbol}:${group.year}`, kind: 'record', metric: 'stock_daily_return',
              symbol: group.symbol, year: group.year, title: `${group.symbol} · 年内最大单日跌幅`, valueType: 'percent',
              recordDirection: 'worst', startDate: date, points: [], nodes: [],
              basis: 'stock_split_adjusted_close', priceBasis: 'split_adjusted_close',
              comparisonScope: `${group.year} 年股票收盘行情`, holdingBasis: 'verified_closing_position' };
            events.push(event);
          }
          Object.assign(event, { date, endDate: date, name: holding.name || source.name, value, current: point,
            previousRecordPct: point.previousRecordPct, previousRecordDate: point.previousRecordDate });
          event.points.push(point); event.nodes.push({ key: date, label: date, point });
        }
        // An unheld record still sets the hurdle for a later held date.
        previousRecord = { date, value };
      }
      previousClose = close;
    }
  }
  return { events: events.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)), warnings: [...warnings] };
}
