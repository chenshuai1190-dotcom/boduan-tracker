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
  // 取当前用户 id
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  // 1) 删光当前用户的关注列表
  await supabase.from('watchlist').delete().eq('user_id', user.id);

  // 2) 插入新数据
  if (newList.length > 0) {
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
  }
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
export const fetchAllUserData = async () => {
  const [trades, watchlist, waveNotes, settings] = await Promise.all([
    fetchTrades(),
    fetchWatchlist(),
    fetchWaveNotes(),
    fetchSettings(),
  ]);
  return { trades, watchlist, waveNotes, settings };
};
