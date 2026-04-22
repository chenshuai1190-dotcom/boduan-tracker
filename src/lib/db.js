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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const { data, error } = await supabase
    .from('trades')
    .insert({
      user_id: user.id,
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

export const fetchWaveNotes = async (preUser = null) => {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return {};

  const { data, error } = await supabase
    .from('wave_notes')
    .select('*')
    .eq('user_id', user.id);
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
      trades: null, watchlist: null, waveNotes: null, settings: null,
      accounts: null, snapshots: null, investmentPlan: null,
      marginStatus: null, disciplines: null, reviewLogs: null,
      yearlyActuals: null, _failedTables: [],
    };
  }

  const results = await Promise.allSettled([
    fetchTrades(user),            // 0
    fetchWatchlist(user),         // 1
    fetchWaveNotes(user),         // 2
    fetchSettings(user),          // 3
    fetchAccounts(user),          // 4
    fetchSnapshots(user),         // 5
    fetchInvestmentPlan(user),    // 6
    fetchMarginStatus(user),      // 7
    fetchDisciplines(user),       // 8
    fetchReviewLogs(user),        // 9
    fetchYearlyActuals(user),     // 10
  ]);

  // 🔑 关键: 失败时返回 null (非 []/{}) 这样 App 层能区分
  // "真的没数据" vs "拉取失败"
  // 防止用 || 时把 [] 当成 falsy 意外覆盖本地数据
  const tableNames = [
    'trades', 'watchlist', 'waveNotes', 'settings',
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
    watchlist:      getValue(1),
    waveNotes:      getValue(2),
    settings:       getValue(3),
    accounts:       getValue(4),
    snapshots:      getValue(5),
    investmentPlan: getValue(6),
    marginStatus:   getValue(7),
    disciplines:    getValue(8),
    reviewLogs:     getValue(9),
    yearlyActuals:  getValue(10),
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const { error } = await supabase
    .from('accounts')
    .update({
      owner: account.owner,
      type: account.type,
      name: account.name,
      currency: account.currency,
      icon: account.icon,
    })
    .eq('id', id)
    .eq('user_id', user.id);  // 宪法原则 2/3: 必须过滤 user_id
  if (error) throw error;
};

export const deleteAccount = async (id) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  // snapshots 通过外键 cascade 自动删除
  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);  // 宪法原则 2: 只能删自己的
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const { error } = await supabase
    .from('balance_snapshots')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw error;
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
    return cacheGet('investment_plan') || null;
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
  if (plan) cacheSet('investment_plan', plan);
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
    return cacheGet('margin_status') || null;
  }
  const status = data ? {
    currentMargin: Number(data.current_margin),
    marginLimit: Number(data.margin_limit),
  } : null;
  if (status) cacheSet('margin_status', status);
  return status;
};

export const upsertMarginStatus = async (status) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const { error } = await supabase
    .from('margin_status')
    .upsert({
      user_id: user.id,
      current_margin: status.currentMargin,
      margin_limit: status.marginLimit,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  if (error) throw error;
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
    return cacheGet('disciplines') || [];
  }
  const list = (data || []).map(d => ({
    id: d.id,
    level: d.level,
    text: d.text,
    pinned: d.pinned,
    sortOrder: d.sort_order || 0,
    date: d.created_at ? d.created_at.slice(0, 10) : '',
  }));
  cacheSet('disciplines', list);
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
  const { error } = await supabase
    .from('disciplines')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
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
    return cacheGet('review_logs') || [];
  }
  const list = (data || []).map(l => ({
    id: l.id,
    date: l.log_date,
    mood: l.mood || '',
    text: l.text,
  }));
  cacheSet('review_logs', list);
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
  const { error } = await supabase
    .from('review_logs')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
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
    return cacheGet('yearly_actuals') || [];
  }
  const list = (data || []).map(y => ({
    id: y.id,
    year: y.year,
    actualGain: y.actual_gain != null ? Number(y.actual_gain) : null,
    endBalance: y.end_balance != null ? Number(y.end_balance) : null,
  }));
  cacheSet('yearly_actuals', list);
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
