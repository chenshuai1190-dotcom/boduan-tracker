import { buildReviewTimeline } from './reviewTimelineModel.js';

const SNAPSHOT_FIELDS = 'id,user_id,snapshot_date,currency,cumulative_pnl_pct,daily_pnl_pct,cumulative_pnl_usd,daily_pnl_usd,market_value_usd,total_assets_usd,net_assets_usd,cash_usd,cash_event_id,cash_effective_at,cash_basis,margin_debt_usd,margin_debt_event_id,margin_debt_effective_at,margin_debt_basis,source_version,locked_at,updated_at';
const MOVEMENT_FIELDS = 'id,user_id,kind,delta_usd,cash_event_id,occurred_at';
const STATE_FIELDS = 'user_id,dirty_from_date,ledger_revision,generation,updated_at';
const PAGE_SIZE = 500;
const MAX_PAGES = 40;
const fail = (code, message) => Object.assign(new Error(message), { code });
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
function stateKey(row, owner) {
  if (row == null) return 'clean';
  if (row.user_id !== owner) throw fail('REVIEW_ACCOUNT_CHANGED', '账户已切换，请重新打开时间线。');
  if ((row.dirty_from_date !== null && !validDate(row.dirty_from_date))
    || !Number.isSafeInteger(row.ledger_revision) || row.ledger_revision < 0
    || !Number.isSafeInteger(row.generation) || row.generation < 1
    || typeof row.updated_at !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(row.updated_at)
    || !Number.isFinite(Date.parse(row.updated_at))) return null;
  return JSON.stringify([row.dirty_from_date, row.ledger_revision, row.generation, row.updated_at]);
}
const pending = reason => ({ status: 'pending', reason, events: [], years: [],
  coverage: { startDate: null, endDate: null, snapshotCount: 0, netAssetCount: 0, fullHistory: false },
  warnings: ['收益报表正在更新，完成后再生成时间线。'] });

/** Reads complete bounded history only, with owner checks and a before/after report revision fence. */
export function createReviewTimelineLoader(client, { now = () => Date.now() } = {}) {
  const authenticate = async owner => {
    if (typeof owner !== 'string' || !owner.trim() || !client?.auth?.getUser) {
      throw fail('REVIEW_AUTH_REQUIRED', '请先登录后读取时间线。');
    }
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user?.id) throw fail('REVIEW_AUTH_REQUIRED', '登录状态已失效，请重新登录。');
    if (data.user.id !== owner) throw fail('REVIEW_ACCOUNT_CHANGED', '账户已切换，请重新打开时间线。');
  };
  return async expectedUserId => {
    await authenticate(expectedUserId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    timer.unref?.();
    const withAbort = query => typeof query.abortSignal === 'function' ? query.abortSignal(controller.signal) : query;
    const readState = async () => {
      const result = await withAbort(client.from('pnl_report_rebuild_state').select(STATE_FIELDS).eq('user_id', expectedUserId)).maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    };
    const readAll = async (table, fields, order) => {
      const rows = [], ids = new Set();
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const query = client.from(table).select(fields).eq('user_id', expectedUserId)
          .order(order, { ascending: true }).order('id', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        const result = await withAbort(query);
        if (result.error) throw result.error;
        if (!Array.isArray(result.data) || result.data.length > PAGE_SIZE) throw fail('REVIEW_HISTORY_INVALID', '时间线历史数据格式不正确。');
        for (const row of result.data) {
          if (row?.user_id !== expectedUserId) throw fail('REVIEW_ACCOUNT_CHANGED', '账户数据不匹配，请重新打开时间线。');
          if (typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw fail('REVIEW_HISTORY_CHANGED', '历史数据读取过程中发生变化，请稍后重试。');
          ids.add(row.id); rows.push(row);
        }
        if (result.data.length < PAGE_SIZE) return rows;
      }
      throw fail('REVIEW_HISTORY_LIMIT', '历史记录超过本次安全读取上限，未生成不完整时间线。');
    };
    try {
      const before = await readState();
      const beforeKey = stateKey(before, expectedUserId);
      if (beforeKey === null || before?.dirty_from_date) {
        await authenticate(expectedUserId);
        return pending(beforeKey === null ? 'invalid_rebuild_state' : 'rebuilding');
      }
      const [snapshots, movements] = await Promise.all([
        readAll('pnl_report_snapshots', SNAPSHOT_FIELDS, 'snapshot_date'),
        readAll('available_cash_movements', MOVEMENT_FIELDS, 'occurred_at'),
      ]);
      const after = await readState();
      const afterKey = stateKey(after, expectedUserId);
      await authenticate(expectedUserId);
      if (afterKey === null || after?.dirty_from_date || beforeKey !== afterKey) return pending('rebuilding');
      const result = buildReviewTimeline({ snapshots, movements, now: now(), expectedUserId });
      return { status: result.coverage.snapshotCount ? 'ready' : 'empty', ...result };
    } finally { clearTimeout(timer); }
  };
}
