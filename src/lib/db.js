// 数据库操作层
// 所有增删改查都走这里,统一处理错误和缓存
import { supabase } from './supabase';

// ============ 离线缓存 ============
// 把最近一次拉取的数据缓存到 localStorage
// 这样断网时也能看,联网后会被云端最新数据覆盖
const CACHE_PREFIX = 'bottomline_cache_';
const cacheGet = (key) => {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const cacheSet = (key, value) => {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {}
};

// ============ TRADES (交易) ============

export const fetchTrades = async () => {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .order('date', { ascending: true });
  if (error) {
    console.error('fetchTrades 失败:', error);
    return cacheGet('trades') || [];
  }
  // 字段映射:数据库蛇形命名 → 前端驼峰命名(我们直接用蛇形)
  const trades = (data || []).map(t => ({
    id: t.id,
    symbol: t.symbol,
    name: t.name,
    side: t.side,
    date: t.date,
    price: Number(t.price),
    shares: Number(t.shares),
  }));
  cacheSet('trades', trades);
  return trades;
};

export const insertTrade = async (trade) => {
  const { data, error } = await supabase
    .from('trades')
    .insert({
      symbol: trade.symbol,
      name: trade.name,
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
    symbol: data.symbol,
    name: data.name,
    side: data.side,
    date: data.date,
    price: Number(data.price),
    shares: Number(data.shares),
  };
};

export const deleteTrade = async (id) => {
  const { error } = await supabase.from('trades').delete().eq('id', id);
  if (error) throw error;
};

// ============ WATCHLIST (关注列表) ============

export const fetchWatchlist = async () => {
  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .order('id', { ascending: true });
  if (error) {
    console.error('fetchWatchlist 失败:', error);
    return cacheGet('watchlist') || [];
  }
  const list = (data || []).map(w => ({
    symbol: w.symbol,
    name: w.name,
    price: Number(w.price),
    high: Number(w.high),
    cost: Number(w.cost),
    shares: Number(w.shares),
  }));
  cacheSet('watchlist', list);
  return list;
};

// 整体替换关注列表(简单粗暴:删光重插,适合数据量小的场景)
export const replaceWatchlist = async (newList) => {
  // 🚨 防护: 禁止传空数组(可能是 bug 或竞态导致的误清空)
  //       如果用户真要清空所有, 应该一个一个删
  if (!Array.isArray(newList)) {
    console.warn('replaceWatchlist: 参数必须是数组', newList);
    return;
  }
  if (newList.length === 0) {
    console.warn('replaceWatchlist: 拒绝写入空数组 (防止误删所有股票)');
    return;
  }

  // 取当前用户 id
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  // 1) 删光当前用户的关注列表
  await supabase.from('watchlist').delete().eq('user_id', user.id);

  // 2) 插入新数据
  const records = newList.map(s => ({
    user_id: user.id,
    symbol: s.symbol,
    name: s.name || '',
    price: s.price || 0,
    high: s.high || 0,
    cost: s.cost || 0,
    shares: s.shares || 0,
  }));
  const { error } = await supabase.from('watchlist').insert(records);
  if (error) throw error;
  cacheSet('watchlist', newList);
};

// 单个股票字段更新(用于实时价格更新等高频操作,不走整表重写)
export const upsertWatchlistItem = async (item) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const { error } = await supabase
    .from('watchlist')
    .upsert({
      user_id: user.id,
      symbol: item.symbol,
      name: item.name || '',
      price: item.price || 0,
      high: item.high || 0,
      cost: item.cost || 0,
      shares: item.shares || 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,symbol' });
  if (error) throw error;
};

// 精确删除单条 (不走"删光重插", 避免竞态和约束冲突)
export const removeWatchlistItem = async (symbol) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('user_id', user.id)
    .eq('symbol', symbol);
  if (error) throw error;
};

// ============ WAVE_NOTES (波段备注) ============

export const fetchWaveNotes = async () => {
  const { data, error } = await supabase.from('wave_notes').select('*');
  if (error) {
    console.error('fetchWaveNotes 失败:', error);
    return cacheGet('wave_notes') || {};
  }
  // 转成 { wave_id: note } 字典格式
  const notes = {};
  (data || []).forEach(n => { notes[n.wave_id] = n.note || ''; });
  cacheSet('wave_notes', notes);
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

export const fetchSettings = async () => {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .single();
  if (error && error.code !== 'PGRST116') {  // PGRST116 = 没记录
    console.error('fetchSettings 失败:', error);
    return cacheGet('settings') || null;
  }
  const settings = data ? {
    benchmarkSymbol: data.benchmark_symbol || 'QQQ',
    ...data.data,
  } : null;
  if (settings) cacheSet('settings', settings);
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
  cacheSet('settings', settings);
};

// ============ 一次性拉取所有数据 ============
// 用于登录后或刷新时
// 🚨 容错设计: 用 Promise.allSettled 代替 Promise.all
// 任何一个表 404 或出错, 不影响其他表的数据加载
export const fetchAllUserData = async () => {
  const results = await Promise.allSettled([
    fetchTrades(),      // 0
    fetchWatchlist(),   // 1
    fetchWaveNotes(),   // 2
    fetchSettings(),    // 3
    fetchAccounts(),    // 4
    fetchSnapshots(),   // 5
  ]);

  const getValue = (idx, fallback) => {
    if (results[idx].status === 'fulfilled') return results[idx].value;
    console.warn(`[fetchAllUserData] 第 ${idx} 个表加载失败:`, results[idx].reason);
    return fallback;
  };

  return {
    trades:     getValue(0, []),
    watchlist:  getValue(1, []),
    waveNotes:  getValue(2, {}),
    settings:   getValue(3, null),
    accounts:   getValue(4, []),
    snapshots:  getValue(5, []),
  };
};

// ============ ACCOUNTS (家庭账户) ============

export const fetchAccounts = async () => {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetchAccounts 失败:', error);
    return cacheGet('accounts') || [];
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
  cacheSet('accounts', list);
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
  const { error } = await supabase
    .from('accounts')
    .update({
      owner: account.owner,
      type: account.type,
      name: account.name,
      currency: account.currency,
      icon: account.icon,
    })
    .eq('id', id);
  if (error) throw error;
};

export const deleteAccount = async (id) => {
  // snapshots 通过外键 cascade 自动删除
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) throw error;
};

// ============ BALANCE SNAPSHOTS (余额快照) ============

export const fetchSnapshots = async () => {
  const { data, error } = await supabase
    .from('balance_snapshots')
    .select('*')
    .order('month', { ascending: true });
  if (error) {
    console.error('fetchSnapshots 失败:', error);
    return cacheGet('snapshots') || [];
  }
  const list = (data || []).map(s => ({
    id: s.id,
    accountId: s.account_id,
    month: s.month,
    balance: Number(s.balance),
  }));
  cacheSet('snapshots', list);
  return list;
};

// 插入或更新一个月的快照(同月已有则覆盖)
export const upsertSnapshot = async (accountId, month, balance) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const { error } = await supabase
    .from('balance_snapshots')
    .upsert({
      user_id: user.id,
      account_id: accountId,
      month: month,
      balance: balance,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'account_id,month' });
  if (error) throw error;
};

// 批量保存某月的所有快照(填本月余额时用)
export const upsertMonthlySnapshots = async (month, balanceMap) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const rows = Object.entries(balanceMap).map(([accountId, balance]) => ({
    user_id: user.id,
    account_id: accountId,
    month: month,
    balance: Number(balance) || 0,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('balance_snapshots')
    .upsert(rows, { onConflict: 'account_id,month' });
  if (error) throw error;
};

export const deleteSnapshot = async (id) => {
  const { error } = await supabase.from('balance_snapshots').delete().eq('id', id);
  if (error) throw error;
};
