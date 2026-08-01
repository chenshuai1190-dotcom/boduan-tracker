import { supabase } from './supabase';

const normalizeReportSnapshotDate = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
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
  ledgerRevision: Number(state.ledger_revision || 0),
  generation: Number(state.generation || 0),
  reason: state.reason || '',
  sourceTradeId: state.source_trade_id || null,
  updatedAt: state.updated_at || null,
}) : null;

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
