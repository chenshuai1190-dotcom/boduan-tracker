import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';
import { normalizeReviewAccountSnapshot } from './reviewEvaluationModel.js';

const SOURCE_VERSION = 'pnl_snapshot_v2';
const SNAPSHOT_FIELDS = 'id,user_id,snapshot_date,currency,cumulative_pnl_pct,daily_pnl_pct,market_value_usd,total_assets_usd,net_assets_usd,cash_usd,cash_event_id,cash_effective_at,cash_basis,margin_debt_usd,margin_debt_event_id,margin_debt_effective_at,margin_debt_basis,source_version,locked_at,updated_at';
const STATE_FIELDS = 'user_id,dirty_from_date,ledger_revision,generation,updated_at';
const KEYS = ['cumulativeReturnPct', 'dailyReturnPct', 'leverage'];
const fail = (code, message) => Object.assign(new Error(message), { code });
const empty = (status, reason = status) => ({ status, reason, snapshot: null });
const dateKey = value => {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};
const number = value => {
  if (typeof value !== 'number' && (typeof value !== 'string'
    || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
const timestamp = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
  && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const eventId = value => /^[1-9]\d*$/.test(String(value ?? ''));
const nyFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
function nyTime(time) {
  const parts = Object.fromEntries(nyFormatter.formatToParts(new Date(time)).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`,
    seconds: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second) + ((time % 1000 + 1000) % 1000) / 1000 };
}
function afterCutoff(time, date) {
  const local = nyTime(time);
  return local.date > date || (local.date === date && local.seconds >= 17 * 3600);
}
function eventAtCutoff(value, date) {
  const time = timestamp(value);
  if (time === null) return false;
  const local = nyTime(time);
  return local.date < date || (local.date === date && local.seconds <= 17 * 3600);
}
const closeEnough = (a, b) => Math.abs(a - b) <= Math.max(0.000002, Math.max(Math.abs(a), Math.abs(b)) * 1e-10);

function historicalLeverage(row, date) {
  const total = number(row.total_assets_usd), net = number(row.net_assets_usd);
  const market = number(row.market_value_usd), cash = number(row.cash_usd), debt = number(row.margin_debt_usd);
  if (total === null || total <= 0 || net === null || net <= 0 || market === null || market < 0
    || cash === null || cash < 0 || debt === null || debt < 0
    || row.cash_basis !== 'event' || !eventId(row.cash_event_id) || !eventAtCutoff(row.cash_effective_at, date)) return null;
  const knownDebt = row.margin_debt_basis === 'event'
    ? eventId(row.margin_debt_event_id) && eventAtCutoff(row.margin_debt_effective_at, date)
    : row.margin_debt_basis === 'default_zero' && debt === 0 && row.margin_debt_event_id == null && row.margin_debt_effective_at == null;
  if (!knownDebt || !closeEnough(total, market + cash) || !closeEnough(net, total - debt)) return null;
  const leverage = total / net;
  return Number.isFinite(leverage) ? leverage : null;
}

function stateFingerprint(row, expectedUserId) {
  if (row == null) return 'clean';
  if (row.user_id !== expectedUserId) throw fail('REVIEW_ACCOUNT_CHANGED', '账户已切换，请重新打开评价。');
  if ((row.dirty_from_date !== null && !dateKey(row.dirty_from_date))
    || !Number.isSafeInteger(row.ledger_revision) || row.ledger_revision < 0
    || !Number.isSafeInteger(row.generation) || row.generation < 1 || timestamp(row.updated_at) === null) return null;
  return JSON.stringify([row.dirty_from_date, row.ledger_revision, row.generation, row.updated_at]);
}

/** Exact, account-scoped closing values only. Never rebuild or consult live assets. */
export function createReviewAccountSnapshotLoader(client, { now = () => Date.now() } = {}) {
  async function authenticate(expectedUserId) {
    if (typeof expectedUserId !== 'string' || !expectedUserId.trim() || !client?.auth?.getUser) {
      throw fail('REVIEW_AUTH_REQUIRED', '请先登录后读取历史账户数据。');
    }
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user?.id) throw fail('REVIEW_AUTH_REQUIRED', '登录状态已失效，请重新登录。');
    if (data.user.id !== expectedUserId) throw fail('REVIEW_ACCOUNT_CHANGED', '账户已切换，请重新打开评价。');
  }
  return async (date, expectedUserId) => {
    if (!dateKey(date)) return empty('invalid_date');
    const current = Number(now());
    if (!Number.isFinite(current) || !Number.isFinite(new Date(current).getTime())) throw fail('REVIEW_CLOCK_INVALID', '无法确认当前日期。');
    if ([0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) || isRegularNyseHoliday(date)) return empty('not_session');
    if (!afterCutoff(current, date)) return empty('pending', 'incomplete_close');
    await authenticate(expectedUserId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    timer.unref?.();
    const read = async (table, fields, snapshotDate) => {
      let query = client.from(table).select(fields).eq('user_id', expectedUserId);
      if (snapshotDate) query = query.eq('snapshot_date', snapshotDate);
      if (typeof query.abortSignal === 'function') query = query.abortSignal(controller.signal);
      const result = await query.maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    };
    try {
      const before = await read('pnl_report_rebuild_state', STATE_FIELDS);
      const beforeKey = stateFingerprint(before, expectedUserId);
      let result;
      if (beforeKey === null) result = empty('unavailable', 'invalid_rebuild_state');
      else if (before?.dirty_from_date && before.dirty_from_date <= date) result = empty('pending', 'rebuilding');
      else {
        const row = await read('pnl_report_snapshots', SNAPSHOT_FIELDS, date);
        const after = await read('pnl_report_rebuild_state', STATE_FIELDS);
        const afterKey = stateFingerprint(after, expectedUserId);
        if (afterKey === null) result = empty('unavailable', 'invalid_rebuild_state');
        else if (beforeKey !== afterKey || (after?.dirty_from_date && after.dirty_from_date <= date)) result = empty('pending', 'rebuilding');
        else if (!row) result = empty('missing');
        else {
          if (row.user_id !== expectedUserId) throw fail('REVIEW_ACCOUNT_CHANGED', '账户数据不匹配，请重新打开评价。');
          const lockedAt = timestamp(row.locked_at), updatedAt = timestamp(row.updated_at);
          if (row.snapshot_date !== date || row.currency !== 'USD' || row.source_version !== SOURCE_VERSION
            || typeof row.id !== 'string' || !row.id.trim() || lockedAt === null || lockedAt > current
            || !afterCutoff(lockedAt, date) || updatedAt === null || updatedAt > current) result = empty('unavailable', 'invalid_snapshot');
          else {
            const values = [number(row.cumulative_pnl_pct), number(row.daily_pnl_pct), historicalLeverage(row, date)];
            const items = values.flatMap((value, index) => value === null || !Number.isFinite(index < 2 ? value * 100 : value)
              ? [] : [{ key: KEYS[index], value: index < 2 ? value * 100 : value, asOfDate: date, basis: 'close', source: 'pnl_report' }]);
            const snapshot = items.length ? normalizeReviewAccountSnapshot({ version: 1, kind: 'account_snapshot', asOfDate: date,
              recordDate: date, basis: 'close', source: 'pnl_report', items, sourceSnapshotId: row.id,
              sourceVersion: row.source_version, sourceUpdatedAt: row.updated_at, lockedAt: row.locked_at,
              capturedAt: new Date(current).toISOString() }, { strict: true }) : null;
            result = snapshot ? { status: 'ready', snapshot, missingKeys: KEYS.filter(key => !items.some(item => item.key === key)) }
              : empty('missing', 'missing_metrics');
          }
        }
      }
      await authenticate(expectedUserId);
      return result;
    } finally { clearTimeout(timer); }
  };
}
