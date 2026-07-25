// 数据库操作层
// 所有增删改查都走这里,统一处理错误和缓存
import { supabase } from './supabase';
import { scopedDeleteByField, scopedDeleteById, scopedDeleteBySymbol } from './dbGuards';
import { earliestReportDate, markPnlReportDirtySafely } from './pnlReportDb';
import { applyAccountSnapshotMutations } from './accountSnapshotMutation.js';
import {
  HOME_MARGIN_LOGIC_VERSION,
  homeMarginLogicUpdatedAt,
  isLegacyHomeMarginStatus,
  normalizeMarginDebtUsd,
} from './homeMarginRisk.js';
import { normalizeStrictUserStockSymbol, normalizeUserStockSymbol } from './symbols';
import { userScopedStorageKey } from './userScopedStorage.js';

export {
  clearPnlReportRebuildState,
  fetchPnlReportRebuildState,
  fetchPnlReportSnapshots,
  fetchPnlReportSymbolSnapshotHistory,
  fetchPnlReportSymbolSnapshots,
  mapPnlReportRebuildState,
  markPnlReportDirtyFromDate,
  upsertPnlReportSnapshots,
} from './pnlReportDb';

export {
  completeSwingWave,
  createSwingWave,
  deleteSwingWave,
  listSwingWaves,
  updateSwingWave,
} from './swingWavesDb';

export {
  fetchCommunityProfile,
  upsertCommunityProfile,
} from './communityProfilesDb';

// ============ 离线缓存 ============
// 把最近一次拉取的数据缓存到 localStorage
// 这样断网时也能看,联网后会被云端最新数据覆盖
const CACHE_PREFIX = 'bottomline_cache_';
const cacheGet = (userId, key) => {
  try {
    const raw = localStorage.getItem(userScopedStorageKey(CACHE_PREFIX + key, userId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const cacheSet = (userId, key, value) => {
  try {
    localStorage.setItem(userScopedStorageKey(CACHE_PREFIX + key, userId), JSON.stringify(value));
  } catch {}
};

const normalizeCostBasisSymbol = (symbol) => {
  const value = normalizeUserStockSymbol(symbol);
  return /^[A-Z0-9.^-]{1,16}$/.test(value) ? value : '';
};

const normalizeStrictCostBasisSymbol = (symbol) => {
  const value = normalizeStrictUserStockSymbol(symbol);
  return /^[A-Z0-9.^-]{1,16}$/.test(value) ? value : '';
};

const normalizePersistedSymbol = (symbol) => normalizeUserStockSymbol(symbol);

const repairSymbolRows = async ({ userId, table, select = 'id,symbol', symbolColumn = 'symbol' }) => {
  const summary = { table, scanned: 0, repaired: 0, skipped: 0 };
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .eq('user_id', userId);
  if (error) {
    console.warn(`[symbolRepair] ${table} 读取失败:`, error.message || error);
    summary.error = error.message || String(error);
    return summary;
  }

  for (const row of (data || [])) {
    summary.scanned += 1;
    const rawSymbol = row?.[symbolColumn];
    const rawTrimmed = String(rawSymbol || '').trim();
    const normalizedSymbol = normalizePersistedSymbol(rawSymbol);
    if (!normalizedSymbol) {
      if (rawTrimmed) summary.skipped += 1;
      continue;
    }
    if (rawTrimmed === normalizedSymbol) continue;

    let query = supabase
      .from(table)
      .update({ [symbolColumn]: normalizedSymbol })
      .eq('user_id', userId);
    if (row?.id != null) query = query.eq('id', row.id);
    else query = query.eq(symbolColumn, rawSymbol);

    const { error: updateError } = await query;
    if (updateError) {
      console.warn(`[symbolRepair] ${table} ${rawTrimmed} -> ${normalizedSymbol} 失败:`, updateError.message || updateError);
      summary.skipped += 1;
      continue;
    }
    summary.repaired += 1;
  }
  return summary;
};

export const repairCurrentUserStockSymbols = async (preUser = null) => {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return { repaired: 0, tables: [] };

  const tables = await Promise.all([
    repairSymbolRows({ userId: user.id, table: 'trades' }),
    repairSymbolRows({ userId: user.id, table: 'stock_trades' }),
    repairSymbolRows({ userId: user.id, table: 'watchlist' }),
    repairSymbolRows({ userId: user.id, table: 'cost_basis_trades' }),
  ]);
  const repaired = tables.reduce((sum, item) => sum + (item.repaired || 0), 0);
  if (repaired > 0) console.info('[symbolRepair] 已修复历史股票代码:', { repaired, tables });
  return { repaired, tables };
};

// ============ TRADES (交易) ============

export const fetchTrades = async (preUser = null) => {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: true });
  if (error) {
    console.error('fetchTrades 失败:', error);
    return cacheGet(user.id, 'trades') || [];
  }
  // 字段映射:数据库蛇形命名 → 前端驼峰命名(我们直接用蛇形)
  const trades = (data || []).map(t => ({
    id: t.id,
    symbol: normalizeUserStockSymbol(t.symbol),
    name: t.name,
    side: t.side,
    date: t.date,
    price: Number(t.price),
    shares: Number(t.shares),
  })).filter((trade) => trade.symbol);
  cacheSet(user.id, 'trades', trades);
  return trades;
};

export const insertTrade = async (trade) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const symbol = normalizeStrictUserStockSymbol(trade.symbol);
  if (!symbol) throw new Error('股票代码格式不正确');

  const { data, error } = await supabase
    .from('trades')
    .insert({
      user_id: user.id,
      symbol,
      name: trade.name || symbol,
      side: trade.side,
      date: trade.date,
      price: trade.price,
      shares: trade.shares,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    symbol: normalizeUserStockSymbol(data.symbol),
    name: data.name,
    side: data.side,
    date: data.date,
    price: Number(data.price),
    shares: Number(data.shares),
  };
};

export const deleteTrade = async (id) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const { error } = await scopedDeleteById(supabase.from('trades'), id, user.id);
  if (error) throw error;
};

// ============ STOCK_TRADES (主交易账本) ============

const mapStockTrade = (trade) => ({
  id: trade.id,
  symbol: normalizeUserStockSymbol(trade.symbol),
  name: trade.name || '',
  side: trade.side === 'sell' ? 'sell' : 'buy',
  date: trade.trade_date || trade.date,
  price: Number(trade.price),
  shares: Number(trade.shares),
  fee: Number(trade.fee || 0),
  currency: trade.currency || 'USD',
  note: trade.note || '',
});

export const fetchStockTrades = async (preUser = null) => {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('stock_trades')
    .select('*')
    .eq('user_id', user.id)
    .order('trade_date', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetchStockTrades 失败:', error);
    const cached = cacheGet(user.id, 'stock_trades');
    if (cached) return cached;
    throw error;
  }
  const stockTrades = (data || []).map(mapStockTrade);
  cacheSet(user.id, 'stock_trades', stockTrades);
  return stockTrades;
};

export const insertStockTrade = async (trade) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const symbol = normalizeStrictUserStockSymbol(trade.symbol);
  if (!symbol) throw new Error('股票代码格式不正确');
  const side = trade.side === 'sell' ? 'sell' : 'buy';
  const { data, error } = await supabase
    .from('stock_trades')
    .insert({
      user_id: user.id,
      symbol,
      name: trade.name || symbol,
      side,
      trade_date: trade.date || trade.tradeDate,
      price: trade.price,
      shares: trade.shares,
      fee: trade.fee || 0,
      currency: trade.currency || 'USD',
      note: trade.note || '',
    })
    .select()
    .single();
  if (error) throw error;
  await markPnlReportDirtySafely(data.trade_date, 'stock_trade_inserted', data.id);
  return mapStockTrade(data);
};

export const updateStockTrade = async (id, trade) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  if (!id) throw new Error('缺少交易记录 id');

  const symbol = normalizeStrictUserStockSymbol(trade.symbol);
  if (!symbol) throw new Error('股票代码格式不正确');

  const { data: existingTrade, error: existingError } = await supabase
    .from('stock_trades')
    .select('trade_date')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (existingError) console.warn('读取原交易日期失败:', existingError.message || existingError);

  const side = trade.side === 'sell' ? 'sell' : 'buy';
  const { data, error } = await supabase
    .from('stock_trades')
    .update({
      symbol,
      name: trade.name || symbol,
      side,
      trade_date: trade.date || trade.tradeDate,
      price: trade.price,
      shares: trade.shares,
      fee: trade.fee || 0,
      currency: trade.currency || 'USD',
      note: trade.note || '',
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();
  if (error) throw error;
  await markPnlReportDirtySafely(earliestReportDate(existingTrade?.trade_date, data.trade_date), 'stock_trade_updated', data.id);
  return mapStockTrade(data);
};

export const deleteStockTrade = async (id) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const { data: existingTrade, error: existingError } = await supabase
    .from('stock_trades')
    .select('trade_date')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (existingError) console.warn('读取待删除交易日期失败:', existingError.message || existingError);

  const { error } = await scopedDeleteById(supabase.from('stock_trades'), id, user.id);
  if (error) throw error;
  await markPnlReportDirtySafely(existingTrade?.trade_date, 'stock_trade_deleted', id);
};

// ============ WATCHLIST (关注列表) ============

export const fetchWatchlist = async (preUser = null) => {
  // 🚨 必须过滤当前用户, 不然多账户数据会混杂
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) {
    console.warn('fetchWatchlist: 未登录');
    return [];
  }

  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .eq('user_id', user.id)  // ← 关键: 只查当前用户的
    .order('id', { ascending: true });
  if (error) {
    console.error('fetchWatchlist 失败:', error);
    return cacheGet(user.id, 'watchlist') || [];
  }
  const list = (data || []).map(w => ({
    symbol: normalizeUserStockSymbol(w.symbol),
    name: w.name,
    price: Number(w.price),
    high: Number(w.high),
    cost: Number(w.cost),
    shares: Number(w.shares),
    targetPriceUsd: w.target_price_usd == null ? null : Number(w.target_price_usd),
  })).filter((item) => item.symbol);
  cacheSet(user.id, 'watchlist', list);
  return list;
};

// 单个股票字段更新(用于实时价格更新等高频操作,不走整表重写)
export const upsertWatchlistItem = async (item) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const symbol = normalizeStrictUserStockSymbol(item.symbol);
  if (!symbol) throw new Error('股票代码格式不正确');

  const { error } = await supabase
    .from('watchlist')
    .upsert({
      user_id: user.id,
      symbol,
      name: item.name || symbol,
      price: item.price || 0,
      high: item.high || 0,
      cost: item.cost || 0,
      shares: item.shares || 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,symbol' });
  if (error) throw error;
};

// 目标价只属于当前用户的自选计划。它不写正式交易账本，也不触发收益或比赛链路。
export const updateWatchlistTargetPrice = async (symbolInput, targetPriceUsd) => {
  const symbol = normalizeStrictUserStockSymbol(symbolInput);
  if (!symbol) throw new Error('股票代码格式不正确');

  const normalizedTargetPrice = typeof targetPriceUsd === 'number'
    ? targetPriceUsd
    : (typeof targetPriceUsd === 'string' && targetPriceUsd.trim() ? Number(targetPriceUsd) : NaN);
  if (!Number.isFinite(normalizedTargetPrice) || normalizedTargetPrice <= 0) {
    throw new Error('目标价必须是大于 0 的数字');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const { data, error } = await supabase
    .from('watchlist')
    .update({
      target_price_usd: normalizedTargetPrice,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('symbol', symbol)
    .select('symbol,target_price_usd')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('自选股票不存在或已被删除');

  return {
    symbol: normalizeUserStockSymbol(data.symbol),
    targetPriceUsd: Number(data.target_price_usd),
  };
};

// 精确删除单条 (不走"删光重插", 避免竞态和约束冲突)
export const removeWatchlistItem = async (symbol) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const normalizedSymbol = normalizeUserStockSymbol(symbol);
  if (!normalizedSymbol) throw new Error('缺少股票代码');

  const { error } = await scopedDeleteBySymbol(supabase.from('watchlist'), normalizedSymbol, user.id);
  if (error) throw error;
};

// ============ WAVE_NOTES (波段备注) ============

export const fetchWaveNotes = async (preUser = null) => {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return {};

  const { data, error } = await supabase
    .from('wave_notes')
    .select('*')
    .eq('user_id', user.id);
  if (error) {
    console.error('fetchWaveNotes 失败:', error);
    return cacheGet(user.id, 'wave_notes') || {};
  }
  // 转成 { wave_id: note } 字典格式
  const notes = {};
  (data || []).forEach(n => { notes[n.wave_id] = n.note || ''; });
  cacheSet(user.id, 'wave_notes', notes);
  return notes;
};

export const upsertWaveNote = async (waveId, note) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const { error } = await supabase
    .from('wave_notes')
    .upsert({
      user_id: user.id,
      wave_id: waveId,
      note: note,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,wave_id' });
  if (error) throw error;
};

// ============ USER_SETTINGS (用户设置: 基准股票/FGI 缓存等) ============

export const fetchSettings = async (preUser = null) => {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    console.error('fetchSettings 失败:', error);
    return cacheGet(user.id, 'settings') || null;
  }
  const settings = data ? {
    benchmarkSymbol: data.benchmark_symbol || 'QQQ',
    ...data.data,
  } : null;
  if (settings) cacheSet(user.id, 'settings', settings);
  return settings;
};

export const upsertSettings = async (settings) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const { benchmarkSymbol, ...rest } = settings;
  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: user.id,
      benchmark_symbol: benchmarkSymbol || 'QQQ',
      data: rest,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  if (error) throw error;
  cacheSet(user.id, 'settings', settings);
};

// ============ 一次性拉取所有数据 ============
// 用于登录后或刷新时
// 🚨 容错设计: 用 Promise.allSettled 代替 Promise.all
// 任何一个表 404 或出错, 不影响其他表的数据加载
export const fetchAllUserData = async () => {
  // 🔧 关键修复 (v10.7.8.8):
  // 之前: 每个 fetch 函数内部都调 supabase.auth.getUser()
  //       Promise.all 11 个并发请求 → 11 个同时抢 auth lock
  //       超时报 "Lock was not released" → 5 个查询失败
  // 现在: 先 getUser 一次拿到 user, 然后所有 fetch 用同一个 user
  //       完全避开 auth lock 竞争
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.warn('[fetchAllUserData] 用户未登录');
    return {
      trades: null, stockTrades: null, watchlist: null, waveNotes: null, settings: null,
      accounts: null, snapshots: null, investmentPlan: null,
      marginStatus: null, disciplines: null, reviewLogs: null,
      yearlyActuals: null, _failedTables: [],
    };
  }

  const symbolRepair = await repairCurrentUserStockSymbols(user).catch((error) => {
    console.warn('[fetchAllUserData] 历史股票代码修复失败:', error.message || error);
    return null;
  });

  const results = await Promise.allSettled([
    fetchTrades(user),            // 0
    fetchStockTrades(user),       // 1
    fetchWatchlist(user),         // 2
    fetchWaveNotes(user),         // 3
    fetchSettings(user),          // 4
    fetchAccounts(user),          // 5
    fetchSnapshots(user),         // 6
    fetchInvestmentPlan(user),    // 7
    fetchMarginStatus(user),      // 8
    fetchDisciplines(user),       // 9
    fetchReviewLogs(user),        // 10
    fetchYearlyActuals(user),     // 11
  ]);

  // 🔑 关键: 失败时返回 null (非 []/{}) 这样 App 层能区分
  // "真的没数据" vs "拉取失败"
  // 防止用 || 时把 [] 当成 falsy 意外覆盖本地数据
  const tableNames = [
    'trades', 'stockTrades', 'watchlist', 'waveNotes', 'settings',
    'accounts', 'snapshots', 'investmentPlan', 'marginStatus',
    'disciplines', 'reviewLogs', 'yearlyActuals',
  ];
  const failedTables = [];

  const getValue = (idx) => {
    if (results[idx].status === 'fulfilled') return results[idx].value;
    console.warn(`[fetchAllUserData] 第 ${idx} 个表 (${tableNames[idx]}) 加载失败:`, results[idx].reason);
    failedTables.push(tableNames[idx]);
    return null;  // 🔑 失败标记
  };

  return {
    trades:         getValue(0),
    stockTrades:    getValue(1),
    watchlist:      getValue(2),
    waveNotes:      getValue(3),
    settings:       getValue(4),
    accounts:       getValue(5),
    snapshots:      getValue(6),
    investmentPlan: getValue(7),
    marginStatus:   getValue(8),
    disciplines:    getValue(9),
    reviewLogs:     getValue(10),
    yearlyActuals:  getValue(11),
    _symbolRepair: symbolRepair,
    // 🔑 失败表清单 (App 层决定是否显示警告)
    _failedTables: failedTables,
  };
};

// ============ ACCOUNTS (家庭账户) ============

export const fetchAccounts = async (preUser = null) => {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetchAccounts 失败:', error);
    return cacheGet(user.id, 'accounts') || [];
  }
  const list = (data || []).map(a => ({
    id: a.id,
    owner: a.owner,
    type: a.type,
    name: a.name,
    currency: a.currency || 'CNY',
    icon: a.icon || '💰',
    sortOrder: a.sort_order || 0,
  }));
  cacheSet(user.id, 'accounts', list);
  return list;
};

export const insertAccount = async (account) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const { data, error } = await supabase
    .from('accounts')
    .insert({
      user_id: user.id,
      owner: account.owner,
      type: account.type,
      name: account.name,
      currency: account.currency || 'CNY',
      icon: account.icon || '💰',
      sort_order: account.sortOrder || 0,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    owner: data.owner,
    type: data.type,
    name: data.name,
    currency: data.currency,
    icon: data.icon,
    sortOrder: data.sort_order,
  };
};

export const updateAccount = async (id, account) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const { data, error } = await supabase
    .from('accounts')
    .update({
      owner: account.owner,
      type: account.type,
      name: account.name,
      currency: account.currency || 'CNY',
      icon: account.icon || account.type || '💰',
      sort_order: account.sortOrder || 0,
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    owner: data.owner,
    type: data.type,
    name: data.name,
    currency: data.currency,
    icon: data.icon,
    sortOrder: data.sort_order,
  };
};

export const deleteAccount = async (id) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  // snapshots 通过外键 cascade 自动删除
  const { error } = await scopedDeleteById(supabase.from('accounts'), id, user.id);  // 宪法原则 2: 只能删自己的
  if (error) throw error;
};

// ============ BALANCE SNAPSHOTS (余额快照) ============

export const fetchSnapshots = async (preUser = null) => {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('balance_snapshots')
    .select('*')
    .eq('user_id', user.id)
    .order('month', { ascending: true });
  if (error) {
    console.error('fetchSnapshots 失败:', error);
    return cacheGet(user.id, 'snapshots') || [];
  }
  const list = (data || []).map(s => ({
    id: s.id,
    accountId: s.account_id,
    month: s.month,
    balance: Number(s.balance),
  }));
  cacheSet(user.id, 'snapshots', list);
  return list;
};

// 插入或更新一个月的快照(同月已有则覆盖)
export const upsertSnapshot = async (accountId, month, balance) => {
  if (!accountId || typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error('快照参数无效');
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const normalizedBalance = Number(balance);
  if (!Number.isFinite(normalizedBalance) || normalizedBalance < 0) throw new Error('余额无效');

  if (normalizedBalance === 0) {
    const { error } = await supabase
      .from('balance_snapshots')
      .delete()
      .eq('account_id', accountId)
      .eq('month', month)
      .eq('user_id', user.id);
    if (error) throw error;
    const cached = cacheGet(user.id, 'snapshots');
    if (Array.isArray(cached)) {
      cacheSet(user.id, 'snapshots', applyAccountSnapshotMutations(cached, {
        deletions: [{ accountId, month }],
      }));
    }
    return;
  }

  const { error } = await supabase
    .from('balance_snapshots')
    .upsert({
      user_id: user.id,
      account_id: accountId,
      month: month,
      balance: normalizedBalance,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'account_id,month' });
  if (error) throw error;
  const cached = cacheGet(user.id, 'snapshots');
  if (Array.isArray(cached)) {
    cacheSet(user.id, 'snapshots', applyAccountSnapshotMutations(cached, {
      upserts: [{ accountId, month, balance: normalizedBalance }],
    }));
  }
};

export const deleteSnapshot = async (accountId, month) => {
  if (!accountId || typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error('快照参数无效');
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const { error } = await supabase
    .from('balance_snapshots')
    .delete()
    .eq('account_id', accountId)
    .eq('month', month)
    .eq('user_id', user.id);
  if (error) throw error;
  const cached = cacheGet(user.id, 'snapshots');
  if (Array.isArray(cached)) {
    cacheSet(user.id, 'snapshots', applyAccountSnapshotMutations(cached, {
      deletions: [{ accountId, month }],
    }));
  }
};

// ============ INVESTMENT_PLAN (复利计划, 每人 1 条) ============

export const fetchInvestmentPlan = async (preUser = null) => {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from('investment_plan')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    console.error('fetchInvestmentPlan 失败:', error);
    return cacheGet(user.id, 'investment_plan') || null;
  }
  const plan = data ? {
    startCapital: Number(data.start_capital),
    targetAnnualRate: Number(data.target_annual_rate),
    startYear: data.start_year,
    totalYears: data.total_years,
    ageGoalAge: data.age_goal_age,
    motto: data.motto || '',
    displayCurrency: data.display_currency || 'USD',
  } : null;
  if (plan) cacheSet(user.id, 'investment_plan', plan);
  return plan;
};

export const upsertInvestmentPlan = async (plan) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const { error } = await supabase
    .from('investment_plan')
    .upsert({
      user_id: user.id,
      start_capital: plan.startCapital,
      target_annual_rate: plan.targetAnnualRate,
      start_year: plan.startYear,
      total_years: plan.totalYears,
      age_goal_age: plan.ageGoalAge,
      motto: plan.motto || '',
      display_currency: plan.displayCurrency || 'USD',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  if (error) throw error;
};

// ============ MARGIN_STATUS (融资状态, 每人 1 条) ============

const emptyHomeMarginStatus = () => ({
  currentMargin: 0,
  marginLimit: 0,
  logicVersion: HOME_MARGIN_LOGIC_VERSION,
  updatedAt: null,
});

const mapHomeMarginStatus = (row) => ({
  currentMargin: normalizeMarginDebtUsd(row?.current_margin),
  marginLimit: 0,
  logicVersion: HOME_MARGIN_LOGIC_VERSION,
  updatedAt: row?.updated_at || null,
});

const resetLegacyHomeMarginStatus = async (user, legacyRow, retryCount = 0) => {
  const resetAt = homeMarginLogicUpdatedAt(0);
  let resetQuery = supabase
    .from('margin_status')
    .update({
      current_margin: 0,
      margin_limit: 0,
      logic_version: HOME_MARGIN_LOGIC_VERSION,
      updated_at: resetAt,
    })
    .eq('user_id', user.id);

  resetQuery = legacyRow?.updated_at == null
    ? resetQuery.is('updated_at', null)
    : resetQuery.eq('updated_at', legacyRow.updated_at);

  const { data: resetRow, error: resetError } = await resetQuery
    .select('*')
    .maybeSingle();
  if (resetError) throw resetError;
  if (resetRow) return mapHomeMarginStatus(resetRow);

  // Another device may have saved a new-model value after this read. Re-read
  // before retrying so the legacy reset can never overwrite that newer value.
  const { data: latestRow, error: latestError } = await supabase
    .from('margin_status')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (latestError) throw latestError;
  if (!latestRow) return emptyHomeMarginStatus();
  if (!isLegacyHomeMarginStatus(latestRow)) return mapHomeMarginStatus(latestRow);
  if (retryCount >= 1) throw new Error('旧融资余额清零冲突，请刷新后重试');
  return resetLegacyHomeMarginStatus(user, latestRow, retryCount + 1);
};

export const fetchMarginStatus = async (preUser = null) => {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from('margin_status')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    console.error('fetchMarginStatus 失败:', error);
    const cachedStatus = cacheGet(user.id, 'margin_status');
    if (cachedStatus?.logicVersion === HOME_MARGIN_LOGIC_VERSION) return cachedStatus;
    throw error;
  }
  const status = data
    ? (isLegacyHomeMarginStatus(data)
      ? await resetLegacyHomeMarginStatus(user, data)
      : mapHomeMarginStatus(data))
    : emptyHomeMarginStatus();
  cacheSet(user.id, 'margin_status', status);
  return status;
};

export const upsertMarginStatus = async (status) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const currentMargin = Number(status?.currentMargin);
  if (!Number.isFinite(currentMargin) || currentMargin < 0) {
    throw new Error('融资余额必须是不小于 0 的有效金额');
  }
  const updatedAt = homeMarginLogicUpdatedAt();
  const normalizedStatus = {
    currentMargin,
    marginLimit: 0,
    logicVersion: HOME_MARGIN_LOGIC_VERSION,
    updatedAt,
  };

  const { error } = await supabase
    .from('margin_status')
    .upsert({
      user_id: user.id,
      current_margin: normalizedStatus.currentMargin,
      margin_limit: 0,
      logic_version: HOME_MARGIN_LOGIC_VERSION,
      updated_at: updatedAt,
    }, { onConflict: 'user_id' });
  if (error) throw error;
  cacheSet(user.id, 'margin_status', normalizedStatus);
  return normalizedStatus;
};

// ============ DISCIPLINES (投资戒律) ============

export const fetchDisciplines = async (preUser = null) => {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('disciplines')
    .select('*')
    .eq('user_id', user.id)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    console.error('fetchDisciplines 失败:', error);
    return cacheGet(user.id, 'disciplines') || [];
  }
  const list = (data || []).map(d => ({
    id: d.id,
    level: d.level,
    text: d.text,
    pinned: d.pinned,
    sortOrder: d.sort_order || 0,
    date: d.created_at ? d.created_at.slice(0, 10) : '',
  }));
  cacheSet(user.id, 'disciplines', list);
  return list;
};

export const insertDiscipline = async (discipline) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const { data, error } = await supabase
    .from('disciplines')
    .insert({
      user_id: user.id,
      level: discipline.level,
      text: discipline.text,
      pinned: discipline.pinned || false,
      sort_order: discipline.sortOrder || 0,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    level: data.level,
    text: data.text,
    pinned: data.pinned,
    sortOrder: data.sort_order,
    date: data.created_at ? data.created_at.slice(0, 10) : '',
  };
};

export const updateDiscipline = async (id, discipline) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const { error } = await supabase
    .from('disciplines')
    .update({
      level: discipline.level,
      text: discipline.text,
      pinned: discipline.pinned,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw error;
};

export const deleteDiscipline = async (id) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const { error } = await scopedDeleteById(supabase.from('disciplines'), id, user.id);
  if (error) throw error;
};

// ============ REVIEW_LOGS (月度复盘日志) ============

export const fetchReviewLogs = async (preUser = null) => {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('review_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('log_date', { ascending: false });
  if (error) {
    console.error('fetchReviewLogs 失败:', error);
    return cacheGet(user.id, 'review_logs') || [];
  }
  const list = (data || []).map(l => ({
    id: l.id,
    date: l.log_date,
    mood: l.mood || '',
    text: l.text,
  }));
  cacheSet(user.id, 'review_logs', list);
  return list;
};

export const insertReviewLog = async (log) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const { data, error } = await supabase
    .from('review_logs')
    .insert({
      user_id: user.id,
      log_date: log.date,
      mood: log.mood || '',
      text: log.text,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    date: data.log_date,
    mood: data.mood,
    text: data.text,
  };
};

export const updateReviewLog = async (id, log) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const { error } = await supabase
    .from('review_logs')
    .update({
      log_date: log.date,
      mood: log.mood,
      text: log.text,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw error;
};

export const deleteReviewLog = async (id) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const { error } = await scopedDeleteById(supabase.from('review_logs'), id, user.id);
  if (error) throw error;
};

// ============ YEARLY_ACTUALS (年度实际回报) ============

export const fetchYearlyActuals = async (preUser = null) => {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('yearly_actuals')
    .select('*')
    .eq('user_id', user.id)
    .order('year', { ascending: true });
  if (error) {
    console.error('fetchYearlyActuals 失败:', error);
    return cacheGet(user.id, 'yearly_actuals') || [];
  }
  const list = (data || []).map(y => ({
    id: y.id,
    year: y.year,
    actualGain: y.actual_gain != null ? Number(y.actual_gain) : null,
    endBalance: y.end_balance != null ? Number(y.end_balance) : null,
  }));
  cacheSet(user.id, 'yearly_actuals', list);
  return list;
};

export const upsertYearlyActual = async (year, actualGain, endBalance) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const { error } = await supabase
    .from('yearly_actuals')
    .upsert({
      user_id: user.id,
      year: year,
      actual_gain: actualGain,
      end_balance: endBalance,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,year' });
  if (error) throw error;
};

// ============ COST_BASIS_TRADES (摊薄成本计算器, v10.7.9.24 云端) ============
export const fetchCostBasisTrades = async (preUser = null) => {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('未登录');

  const { data, error } = await supabase
    .from('cost_basis_trades')
    .select('*')
    .eq('user_id', user.id)
    .order('trade_date', { ascending: true });
  if (error) throw error;
  const grouped = {};
  for (const row of (data || [])) {
    const sym = normalizeCostBasisSymbol(row.symbol);
    if (!sym) continue;
    if (!grouped[sym]) grouped[sym] = [];
    grouped[sym].push({
      id: row.id,
      type: row.trade_type,
      price: parseFloat(row.price),
      shares: parseFloat(row.shares),
      date: row.trade_date,
    });
  }
  return grouped;
};

export const insertCostBasisTrade = async (symbol, trade) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const normalizedSymbol = normalizeStrictCostBasisSymbol(symbol);
  if (!normalizedSymbol) throw new Error('缺少有效股票代码');

  const { error } = await supabase
    .from('cost_basis_trades')
    .insert({
      id: trade.id,
      user_id: user.id,
      symbol: normalizedSymbol,
      trade_type: trade.type,
      price: trade.price,
      shares: trade.shares,
      trade_date: trade.date,
    });
  if (error) throw error;
};

export const deleteCostBasisTrade = async (id) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const { error } = await scopedDeleteById(supabase.from('cost_basis_trades'), id, user.id);
  if (error) throw error;
};

export const deleteCostBasisSymbol = async (symbol) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const normalizedSymbol = normalizeCostBasisSymbol(symbol);
  if (!normalizedSymbol) throw new Error('缺少有效股票代码');

  const { error } = await scopedDeleteByField(supabase.from('cost_basis_trades'), 'symbol', normalizedSymbol, user.id);
  if (error) throw error;
};
