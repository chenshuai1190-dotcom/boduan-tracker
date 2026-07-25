import { supabase } from './supabase';
import { scopedDeleteByField } from './dbGuards';

const normalizeReportSnapshotDate = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

export const earliestReportDate = (...values) => values
  .map(normalizeReportSnapshotDate)
  .filter(Boolean)
  .sort()[0] || null;

export const markPnlReportDirtyFromDate = async (dirtyFromDate, reason = 'stock_trade_changed', sourceTradeId = null) => {
  const normalizedDate = normalizeReportSnapshotDate(dirtyFromDate);
  if (!normalizedDate) return { skipped: true, reason: 'missing_dirty_from_date' };

  const { error } = await supabase.rpc('mark_pnl_report_dirty', {
    p_dirty_from_date: normalizedDate,
    p_reason: reason,
    p_source_trade_id: sourceTradeId || null,
  });

  if (error) {
    console.warn('markPnlReportDirtyFromDate skipped:', error.message || error);
    return { skipped: true, error };
  }

  return { skipped: false, dirtyFromDate: normalizedDate };
};

export const markPnlReportDirtySafely = async (dirtyFromDate, reason, sourceTradeId = null) => {
  try {
    return await markPnlReportDirtyFromDate(dirtyFromDate, reason, sourceTradeId);
  } catch (error) {
    console.warn('markPnlReportDirtyFromDate failed:', error?.message || error);
    return { skipped: true, error };
  }
};

const mapPnlReportSnapshot = (snapshot) => ({
  id: snapshot.id,
  snapshotDate: snapshot.snapshot_date,
  currency: snapshot.currency || 'USD',
  cashUsd: Number(snapshot.cash_usd || 0),
  marketValueUsd: Number(snapshot.market_value_usd || 0),
  totalAssetsUsd: Number(snapshot.total_assets_usd || 0),
  marginDebtUsd: snapshot.margin_debt_usd == null ? null : Number(snapshot.margin_debt_usd),
  marginDebtEventId: snapshot.margin_debt_event_id == null ? null : String(snapshot.margin_debt_event_id),
  marginDebtEffectiveAt: snapshot.margin_debt_effective_at || null,
  marginDebtBasis: snapshot.margin_debt_basis || null,
  netAssetsUsd: snapshot.net_assets_usd == null ? null : Number(snapshot.net_assets_usd),
  realizedPnlUsd: Number(snapshot.realized_pnl_usd || 0),
  unrealizedPnlUsd: Number(snapshot.unrealized_pnl_usd || 0),
  cumulativePnlUsd: Number(snapshot.cumulative_pnl_usd || 0),
  cumulativePnlPct: Number(snapshot.cumulative_pnl_pct || 0),
  dailyPnlUsd: snapshot.daily_pnl_usd == null ? null : Number(snapshot.daily_pnl_usd),
  dailyPnlPct: snapshot.daily_pnl_pct == null ? null : Number(snapshot.daily_pnl_pct),
  totalBuyCostUsd: Number(snapshot.total_buy_cost_usd || 0),
  sellProceedsUsd: Number(snapshot.sell_proceeds_usd || 0),
  tradeCount: Number(snapshot.trade_count || 0),
  holdingCount: Number(snapshot.holding_count || 0),
  sourceVersion: snapshot.source_version || '',
  lockedAt: snapshot.locked_at || null,
  createdAt: snapshot.created_at || null,
  updatedAt: snapshot.updated_at || null,
});

const mapPnlReportSymbolSnapshot = (snapshot) => ({
  id: snapshot.id,
  snapshotDate: snapshot.snapshot_date,
  symbol: String(snapshot.symbol || '').trim().toUpperCase(),
  name: snapshot.name || '',
  currency: snapshot.currency || 'USD',
  heldShares: Number(snapshot.held_shares || 0),
  avgCostUsd: Number(snapshot.avg_cost_usd || 0),
  remainingCostUsd: Number(snapshot.remaining_cost_usd || 0),
  currentPriceUsd: Number(snapshot.current_price_usd || 0),
  previousCloseUsd: Number(snapshot.previous_close_usd || 0),
  marketValueUsd: Number(snapshot.market_value_usd || 0),
  realizedPnlUsd: Number(snapshot.realized_pnl_usd || 0),
  unrealizedPnlUsd: Number(snapshot.unrealized_pnl_usd || 0),
  cumulativePnlUsd: Number(snapshot.cumulative_pnl_usd || 0),
  dailyPnlUsd: snapshot.daily_pnl_usd == null ? null : Number(snapshot.daily_pnl_usd),
  dailyPnlPct: snapshot.daily_pnl_pct == null ? null : Number(snapshot.daily_pnl_pct),
  totalBuyCostUsd: Number(snapshot.total_buy_cost_usd || 0),
  sellProceedsUsd: Number(snapshot.sell_proceeds_usd || 0),
  soldCostUsd: Number(snapshot.sold_cost_usd || 0),
  totalBuyShares: Number(snapshot.total_buy_shares || 0),
  totalSellShares: Number(snapshot.total_sell_shares || 0),
  isOpen: Boolean(snapshot.is_open),
  sourceVersion: snapshot.source_version || '',
  createdAt: snapshot.created_at || null,
  updatedAt: snapshot.updated_at || null,
});

const PNL_REPORT_SYMBOL_HISTORY_PAGE_SIZE = 500;

export const mapPnlReportRebuildState = (state) => state ? ({
  userId: state.user_id,
  dirtyFromDate: state.dirty_from_date || null,
  reason: state.reason || '',
  sourceTradeId: state.source_trade_id || null,
  updatedAt: state.updated_at || null,
}) : null;

const toPnlReportSnapshotRow = (snapshot, userId) => ({
  user_id: userId,
  snapshot_date: normalizeReportSnapshotDate(snapshot.snapshotDate),
  currency: snapshot.currency || 'USD',
  cash_usd: snapshot.cashUsd || 0,
  market_value_usd: snapshot.marketValueUsd || 0,
  total_assets_usd: snapshot.totalAssetsUsd || 0,
  ...(snapshot.marginDebtUsd == null && !snapshot.marginDebtBasis
    ? {}
    : {
        margin_debt_usd: snapshot.marginDebtUsd,
        margin_debt_event_id: snapshot.marginDebtEventId == null ? null : snapshot.marginDebtEventId,
        margin_debt_effective_at: snapshot.marginDebtEffectiveAt || null,
        margin_debt_basis: snapshot.marginDebtBasis || null,
      }),
  realized_pnl_usd: snapshot.realizedPnlUsd || 0,
  unrealized_pnl_usd: snapshot.unrealizedPnlUsd || 0,
  cumulative_pnl_usd: snapshot.cumulativePnlUsd || 0,
  cumulative_pnl_pct: snapshot.cumulativePnlPct || 0,
  daily_pnl_usd: snapshot.dailyPnlUsd == null ? null : snapshot.dailyPnlUsd,
  daily_pnl_pct: snapshot.dailyPnlPct == null ? null : snapshot.dailyPnlPct,
  total_buy_cost_usd: snapshot.totalBuyCostUsd || 0,
  sell_proceeds_usd: snapshot.sellProceedsUsd || 0,
  trade_count: snapshot.tradeCount || 0,
  holding_count: snapshot.holdingCount || 0,
  source_version: snapshot.sourceVersion || 'pnl_snapshot_v2',
  locked_at: snapshot.lockedAt || null,
  updated_at: new Date().toISOString(),
});

const toPnlReportSymbolSnapshotRow = (snapshot, userId, fallbackDate) => ({
  user_id: userId,
  snapshot_date: normalizeReportSnapshotDate(snapshot.snapshotDate || fallbackDate),
  symbol: String(snapshot.symbol || '').trim().toUpperCase(),
  name: snapshot.name || snapshot.symbol || '',
  currency: snapshot.currency || 'USD',
  held_shares: snapshot.heldShares || 0,
  avg_cost_usd: snapshot.avgCostUsd || 0,
  remaining_cost_usd: snapshot.remainingCostUsd || 0,
  current_price_usd: snapshot.currentPriceUsd || 0,
  previous_close_usd: snapshot.previousCloseUsd || 0,
  market_value_usd: snapshot.marketValueUsd || 0,
  realized_pnl_usd: snapshot.realizedPnlUsd || 0,
  unrealized_pnl_usd: snapshot.unrealizedPnlUsd || 0,
  cumulative_pnl_usd: snapshot.cumulativePnlUsd || 0,
  daily_pnl_usd: snapshot.dailyPnlUsd == null ? null : snapshot.dailyPnlUsd,
  daily_pnl_pct: snapshot.dailyPnlPct == null ? null : snapshot.dailyPnlPct,
  total_buy_cost_usd: snapshot.totalBuyCostUsd || 0,
  sell_proceeds_usd: snapshot.sellProceedsUsd || 0,
  sold_cost_usd: snapshot.soldCostUsd || 0,
  total_buy_shares: snapshot.totalBuyShares || 0,
  total_sell_shares: snapshot.totalSellShares || 0,
  is_open: Boolean(snapshot.isOpen),
  source_version: snapshot.sourceVersion || 'pnl_snapshot_v2',
  updated_at: new Date().toISOString(),
});

export const fetchPnlReportSnapshots = async (preUser = null, limit = 370) => {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('pnl_report_snapshots')
    .select('*')
    .eq('user_id', user.id)
    .order('snapshot_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapPnlReportSnapshot);
};

export const fetchPnlReportSymbolSnapshots = async (snapshotDate, preUser = null) => {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return [];

  const date = normalizeReportSnapshotDate(snapshotDate);
  if (!date) return [];

  const { data, error } = await supabase
    .from('pnl_report_symbol_snapshots')
    .select('*')
    .eq('user_id', user.id)
    .eq('snapshot_date', date)
    .order('is_open', { ascending: false })
    .order('market_value_usd', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapPnlReportSymbolSnapshot);
};

export const fetchPnlReportSymbolSnapshotHistory = async (symbol, limit = 370, preUser = null, client = supabase) => {
  const user = preUser || (await client.auth.getUser()).data.user;
  if (!user) return [];

  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (!normalizedSymbol) return [];

  const buildQuery = () => client
    .from('pnl_report_symbol_snapshots')
    .select('*')
    .eq('user_id', user.id)
    .eq('symbol', normalizedSymbol)
    .order('snapshot_date', { ascending: false });

  const fetchAll = limit == null || (typeof limit === 'string' && limit.trim().toLowerCase() === 'all');
  if (!fetchAll) {
    const numericLimit = Number(limit);
    const resolvedLimit = Number.isFinite(numericLimit) && numericLimit > 0
      ? Math.floor(numericLimit)
      : 370;
    const { data, error } = await buildQuery().limit(resolvedLimit);
    if (error) throw error;
    return (data || []).map(mapPnlReportSymbolSnapshot);
  }

  const snapshots = [];
  for (let offset = 0; ; offset += PNL_REPORT_SYMBOL_HISTORY_PAGE_SIZE) {
    const { data, error } = await buildQuery().range(
      offset,
      offset + PNL_REPORT_SYMBOL_HISTORY_PAGE_SIZE - 1,
    );
    if (error) throw error;

    const page = Array.isArray(data) ? data : [];
    snapshots.push(...page);
    if (page.length < PNL_REPORT_SYMBOL_HISTORY_PAGE_SIZE) break;
  }
  return snapshots.map(mapPnlReportSymbolSnapshot);
};

export const fetchPnlReportRebuildState = async (preUser = null) => {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from('pnl_report_rebuild_state')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return mapPnlReportRebuildState(data);
};

export const clearPnlReportRebuildState = async (preUser = null) => {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return { skipped: true, reason: 'missing_user' };

  const { error } = await supabase
    .from('pnl_report_rebuild_state')
    .delete()
    .eq('user_id', user.id);
  if (error) throw error;
  return { skipped: false };
};

export const upsertPnlReportSnapshots = async ({ portfolioSnapshot, symbolSnapshots = [] }) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  if (!portfolioSnapshot) throw new Error('缺少收益报表组合快照');

  const snapshotDate = normalizeReportSnapshotDate(portfolioSnapshot.snapshotDate);
  if (!snapshotDate) throw new Error('缺少收益报表日期');

  const portfolioRow = toPnlReportSnapshotRow({ ...portfolioSnapshot, snapshotDate }, user.id);
  const { data: portfolioData, error: portfolioError } = await supabase
    .from('pnl_report_snapshots')
    .upsert(portfolioRow, { onConflict: 'user_id,snapshot_date' })
    .select()
    .single();
  if (portfolioError) throw portfolioError;

  const deleteResult = await scopedDeleteByField(supabase.from('pnl_report_symbol_snapshots'), 'snapshot_date', snapshotDate, user.id);
  if (deleteResult.error) throw deleteResult.error;

  const symbolRows = (Array.isArray(symbolSnapshots) ? symbolSnapshots : [])
    .map((snapshot) => toPnlReportSymbolSnapshotRow(snapshot, user.id, snapshotDate))
    .filter((row) => row.symbol && row.snapshot_date);
  if (symbolRows.length > 0) {
    const { error: symbolsError } = await supabase
      .from('pnl_report_symbol_snapshots')
      .upsert(symbolRows, { onConflict: 'user_id,snapshot_date,symbol' });
    if (symbolsError) throw symbolsError;
  }

  return mapPnlReportSnapshot(portfolioData);
};
