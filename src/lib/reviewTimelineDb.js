import { buildReviewTimeline } from './reviewTimelineModel.js';
import { buildReviewStockDailyRecords, collectReviewStockDailyRecordRanges } from './reviewStockDailyRecordModel.js';
import { loadReviewStockDailyHistory } from './reviewStockDailyRecordHistory.js';
import { createReviewSessionGuard } from './reviewSessionGuard.js';

const SNAPSHOT_FIELDS = 'id,user_id,snapshot_date,currency,cumulative_pnl_pct,daily_pnl_pct,cumulative_pnl_usd,daily_pnl_usd,market_value_usd,total_assets_usd,net_assets_usd,cash_usd,cash_event_id,cash_effective_at,cash_basis,margin_debt_usd,margin_debt_event_id,margin_debt_effective_at,margin_debt_basis,source_version,locked_at,updated_at';
const MOVEMENT_FIELDS = 'id,user_id,kind,delta_usd,cash_event_id,occurred_at';
const STATE_FIELDS = 'user_id,dirty_from_date,ledger_revision,generation,updated_at';
const SYMBOL_FIELDS = 'id,user_id,snapshot_date,symbol,name,currency,held_shares,source_version,updated_at';
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
export function createReviewTimelineLoader(client, { now = () => Date.now(), loadHistory } = {}) {
  const guard = createReviewSessionGuard(client);
  return async (expectedUserId, { onProgress, signal } = {}) => {
    if (signal?.aborted) throw fail('REQUEST_ABORTED', '时间线读取已取消。');
    const ticket = await guard.begin(expectedUserId);
    let controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    let timer;
    const timeout = milliseconds => {
      clearTimeout(timer);
      timer = setTimeout(abort, milliseconds);
      timer.unref?.();
    };
    timeout(15000);
    const assertActive = () => { if (controller.signal.aborted) throw fail('REQUEST_ABORTED', '时间线读取已取消或超时，请重试。'); };
    const withAbort = query => typeof query.abortSignal === 'function' ? query.abortSignal(controller.signal) : query;
    const readState = async () => {
      const result = await withAbort(client.from('pnl_report_rebuild_state').select(STATE_FIELDS).eq('user_id', expectedUserId)).maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    };
    const readFirstTradeDate = async () => {
      const result = await withAbort(client.from('stock_trades').select('id,user_id,trade_date').eq('user_id', expectedUserId)
        .order('trade_date', { ascending: true }).order('id', { ascending: true }).range(0, 0));
      if (result.error) throw result.error;
      if (!Array.isArray(result.data) || result.data.length > 1) throw fail('REVIEW_HISTORY_INVALID', '首笔交易日期无法核验。');
      const first = result.data[0];
      if (!first) return '';
      if (first.user_id !== expectedUserId) throw fail('REVIEW_ACCOUNT_CHANGED', '账户数据不匹配，请重新打开时间线。');
      if (!first.id || !validDate(first.trade_date)) throw fail('REVIEW_HISTORY_INVALID', '首笔交易日期无法核验。');
      return first.trade_date;
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
        await guard.verify(ticket);
        return pending(beforeKey === null ? 'invalid_rebuild_state' : 'rebuilding');
      }
      const [snapshots, movements, firstTradeDate] = await Promise.all([
        readAll('pnl_report_snapshots', SNAPSHOT_FIELDS, 'snapshot_date'),
        readAll('available_cash_movements', MOVEMENT_FIELDS, 'occurred_at'),
        readFirstTradeDate(),
      ]);
      const after = await readState();
      const afterKey = stateKey(after, expectedUserId);
      await guard.verify(ticket);
      assertActive();
      if (afterKey === null || after?.dirty_from_date || beforeKey !== afterKey) return pending('rebuilding');
      const result = buildReviewTimeline({ snapshots, movements, firstTradeDate, now: now(), expectedUserId });
      const accountResult = { status: result.coverage.snapshotCount ? 'ready' : 'empty', ...result };
      if (!result.coverage.snapshotCount) return { ...accountResult, stockRecordStatus: 'empty' };
      // Existing account events render immediately. A cold historical-price
      // request must not block posts or the rest of the timeline.
      onProgress?.({ ...accountResult, stockRecordStatus: 'loading' });
      let stocks = { events: [], warnings: [] }, stockFailure = false;
      try {
        timeout(15000);
        const symbolSnapshots = await readAll('pnl_report_symbol_snapshots', SYMBOL_FIELDS, 'snapshot_date');
        assertActive();
        const input = { snapshots, symbolSnapshots, expectedUserId, now: now() };
        const { ranges } = collectReviewStockDailyRecordRanges(input);
        timeout(120000);
        const { histories, failures } = await loadReviewStockDailyHistory({ ranges, userId: expectedUserId,
          signal: controller.signal, now, loadHistory,
          getSession: () => client.auth.getSession() });
        assertActive();
        stocks = buildReviewStockDailyRecords({ ...input, histories, now: now() });
        stockFailure = failures > 0;
      } catch (error) {
        if (signal?.aborted || ['REVIEW_ACCOUNT_CHANGED', 'REVIEW_AUTH_REQUIRED', 'AUTH_REQUIRED', 'REQUEST_SUPERSEDED'].includes(error?.code)) throw error;
        // An internal stock timeout should not hide verified account events.
        // Renew only the database cancellation scope for the final revision check.
        if (controller.signal.aborted) controller = new AbortController();
        stockFailure = true;
      }
      // Market history can take longer than database reads. Fence the full
      // derivation again so a concurrent trade edit/rebuild cannot publish it.
      timeout(15000);
      const finalState = await readState(), finalKey = stateKey(finalState, expectedUserId);
      await guard.verify(ticket);
      assertActive();
      if (finalKey === null || finalState?.dirty_from_date || beforeKey !== finalKey) return pending('rebuilding');
      const events = [...accountResult.events, ...stocks.events].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
      const incomplete = stockFailure || stocks.warnings.length > 0;
      const stockRecordStatus = incomplete ? stocks.events.length ? 'incomplete' : 'error' : stocks.events.length ? 'ready' : 'empty';
      return { ...accountResult, events,
        years: [...new Set(events.map(event => Number(event.date.slice(0, 4))))].sort((a, b) => b - a),
        stockRecordStatus,
        stockRecordWarning: incomplete ? '部分个股的年内行情或收盘持仓尚未核对完整，请稍后重试。' : '',
        warnings: [...new Set([...accountResult.warnings, ...stocks.warnings,
          ...(stockFailure ? ['个股纪录未能完整读取，已保留账户时间线。'] : [])])] };
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  };
}
