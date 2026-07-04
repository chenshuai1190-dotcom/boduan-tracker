import React, { lazy, Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { TrendingDown, TrendingUp, Target, AlertCircle, CheckCircle2, Clock, Trash2, Plus, RotateCcw, RefreshCw, Wifi, WifiOff, Home, ListChecks, BarChart3, Settings, LogOut, Loader2, Wallet, Calendar, X, Edit2, ChevronRight, AlertTriangle, Pin, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { supabase } from './lib/supabase';
import * as db from './lib/db';
import { deriveInvestmentSummary } from './lib/investmentSummary.js';
import { MARKET_COLOR_MODE_STORAGE_KEY, normalizeMarketColorMode } from './lib/marketColorMode.js';
import { buildLedgerQuoteUniverse } from './lib/stockUniverse.js';
import { applyBtcTickToMarketCards } from './lib/btcRealtime.js';
const HomeTab = lazy(() => import('./tabs/HomeTab.jsx'));
const TradesTab = lazy(() => import('./tabs/TradesTab.jsx'));
const AnalysisTab = lazy(() => import('./tabs/AnalysisTab.jsx'));
const ReviewTab = lazy(() => import('./tabs/ReviewTab.jsx'));
const SettingsTab = lazy(() => import('./tabs/SettingsTab.jsx'));
const FX_RATES_STORAGE_KEY = 'xmoney_fx_rates_v1';
const STOCK_LOGO_CACHE_STORAGE_KEY = 'xmoney_stock_logo_cache_v1';
const DEFAULT_USD_CNY_RATE = 7.20;
const DEFAULT_HKD_CNY_RATE = 0.87;
const BTC_REALTIME_PROTOCOL = 'xmoney-btc';
const BTC_REALTIME_TOKEN_PROTOCOL_PREFIX = 'supabase.';
const BTC_REALTIME_STALE_MS = 15_000;
const BTC_REALTIME_RECONNECT_MAX_MS = 30_000;
const PULL_REFRESH_THRESHOLD = 72;
const PULL_REFRESH_MAX_DISTANCE = 96;

const TAB_COMPONENTS = {
  home: HomeTab,
  trades: TradesTab,
  analysis: AnalysisTab,
  review: ReviewTab,
  settings: SettingsTab,
};

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function validRate(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function readCachedFxRates() {
  try {
    const raw = localStorage.getItem(FX_RATES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const usdCny = validRate(parsed?.rates?.CNY);
    const hkdCny = validRate(parsed?.rates?.HKD);
    if (!usdCny && !hkdCny) return null;
    return {
      dateKey: parsed.dateKey || '',
      fetchedAt: parsed.fetchedAt || '',
      source: parsed.source || 'cache',
      rates: {
        CNY: usdCny,
        HKD: hkdCny,
      },
    };
  } catch {
    return null;
  }
}

function normalizeSymbolKey(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function normalizeExternalLogoUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.startsWith('/')) return `https://eodhd.com${raw}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return null;
}

function normalizeWatchlistOrder(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.flatMap((item) => {
    const symbol = normalizeSymbolKey(item);
    if (!symbol || seen.has(symbol)) return [];
    seen.add(symbol);
    return [symbol];
  });
}

function orderWatchlistRows(list, order) {
  const rows = Array.isArray(list) ? list : [];
  const normalizedOrder = normalizeWatchlistOrder(order);
  if (normalizedOrder.length === 0) return rows;
  const bySymbol = new Map(rows.map((item) => [normalizeSymbolKey(item?.symbol), item]));
  const ordered = normalizedOrder.map((symbol) => bySymbol.get(symbol)).filter(Boolean);
  const orderedSymbols = new Set(ordered.map((item) => normalizeSymbolKey(item?.symbol)));
  const rest = rows.filter((item) => !orderedSymbols.has(normalizeSymbolKey(item?.symbol)));
  return [...ordered, ...rest];
}

function readCachedStockLogos() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STOCK_LOGO_CACHE_STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([key, value]) => {
      const symbol = normalizeSymbolKey(key);
      const url = normalizeExternalLogoUrl(value?.url || value);
      return symbol && url ? [[symbol, { url, updatedAt: value?.updatedAt || '' }]] : [];
    }));
  } catch {
    return {};
  }
}

function TabFallback() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b0f14] p-5 mb-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] text-sm text-white/50">
      <div className="flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-[#f6b54b]" />
        加载中...
      </div>
    </div>
  );
}


// ============ 滚动触发数字动画 Hook ============
// 当元素进入视口时触发,数字从 0 动画到 target
// 离开视口再回来时,会重新动画一次
function useCountUpOnScroll(target, duration = 800) {
  const [value, setValue] = useState(0);
  const ref = useRef(null);
  const animationRef = useRef(null);
  const wasInView = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          if (!wasInView.current) {
            wasInView.current = true;
            // 取消之前的动画
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            // 启动动画: 0 → target
            const startTime = performance.now();
            const animate = (now) => {
              const elapsed = now - startTime;
              const progress = Math.min(elapsed / duration, 1);
              // easeOutCubic 缓动函数,有"哒哒哒到位"的感觉
              const eased = 1 - Math.pow(1 - progress, 3);
              setValue(target * eased);
              if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
              } else {
                setValue(target); // 确保终点精确
              }
            };
            animationRef.current = requestAnimationFrame(animate);
          }
        } else {
          // 离开视口,重置标志(下次进入会再次触发动画)
          wasInView.current = false;
        }
      },
      { threshold: 0.4 } // 40% 的元素可见才触发,避免轻微滑动也重播
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [target, duration]);

  return [value, ref];
}

// ============ 复盘 tab 专用 Modal 组件 ============

// 添加/编辑戒律 Modal
function DisciplineModal({ initial, onCancel, onSave, onDelete }) {
  const [level, setLevel] = useState(initial.level || '🟢');
  const [text, setText] = useState(initial.text || '');
  const [pinned, setPinned] = useState(initial.pinned || false);
  const isEdit = !!onDelete;

  const LEVELS = [
    { level: '🟢', label: '一般' },
    { level: '🔺', label: '重要' },
    { level: '📣', label: '强调' },
    { level: '❗', label: '警告' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl p-4 max-w-sm w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-base">{isEdit ? '编辑戒律' : '添加戒律'}</h3>
          <button onClick={onCancel} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
            <X className="w-4 h-4"/>
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">等级</label>
            <div className="grid grid-cols-4 gap-1.5">
              {LEVELS.map(l => (
                <button
                  key={l.level}
                  onClick={() => setLevel(l.level)}
                  className={`py-2 rounded-lg text-xs font-bold flex flex-col items-center gap-0.5 ${level === l.level ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  <span className="text-base">{l.level}</span>
                  <span>{l.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">内容</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="写下你的投资戒律..."
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <div className="text-[10px] text-slate-400 mt-0.5">超过 60 字会折叠, 点"展开"查看全文</div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={pinned}
              onChange={e => setPinned(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm text-slate-700">置顶 📌 (重要戒律永远显示在最上)</span>
          </label>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold">取消</button>
          {isEdit && (
            <button onClick={onDelete} className="px-4 py-2.5 rounded-lg bg-red-50 text-red-600 text-sm font-bold">
              <Trash2 className="w-4 h-4 inline"/>
            </button>
          )}
          <button
            onClick={() => {
              if (!text.trim()) { alert('请输入内容'); return; }
              onSave({ level, text: text.trim(), pinned });
            }}
            className="flex-1 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-bold"
          >保存</button>
        </div>
      </div>
    </div>
  );
}

// 添加/编辑日志 Modal
function LogModal({ initial, onCancel, onSave, onDelete }) {
  const [date, setDate] = useState(initial.date || new Date().toISOString().slice(0, 10));
  const [mood, setMood] = useState(initial.mood || '');
  const [text, setText] = useState(initial.text || '');
  const isEdit = !!onDelete;

  const MOODS = ['谨慎乐观', '满意', '焦虑', '贪婪', '恐惧', '冷静'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl p-4 max-w-sm w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-base">{isEdit ? '编辑复盘' : '写复盘'}</h3>
          <button onClick={onCancel} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
            <X className="w-4 h-4"/>
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">日期</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">当时心情 (可选)</label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {MOODS.map(m => (
                <button
                  key={m}
                  onClick={() => setMood(m === mood ? '' : m)}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold ${mood === m ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                >{m}</button>
              ))}
            </div>
            <input
              type="text"
              value={mood}
              onChange={e => setMood(e.target.value)}
              placeholder="或自己写"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">复盘内容</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="今天做了什么操作? 对错? 下周计划? 市场感受?"
              rows={6}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold">取消</button>
          {isEdit && (
            <button onClick={onDelete} className="px-4 py-2.5 rounded-lg bg-red-50 text-red-600 text-sm font-bold">
              <Trash2 className="w-4 h-4 inline"/>
            </button>
          )}
          <button
            onClick={() => {
              if (!text.trim()) { alert('请输入内容'); return; }
              onSave({ date, mood: mood.trim(), text: text.trim() });
            }}
            className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold"
          >保存</button>
        </div>
      </div>
    </div>
  );
}

// 编辑年度实际数据 Modal
function YearlyActualModal({ year, initial, onCancel, onSave, currency, rate }) {
  const isCNY = currency === 'CNY';
  const symbol = isCNY ? '¥' : '$';
  // 显示时: USD存储 × rate → 展示值
  // 保存时: 展示值 / rate → 存回 USD
  const [actualGain, setActualGain] = useState(initial.actualGain !== null && initial.actualGain !== undefined ? String(Math.round(initial.actualGain * rate)) : '');
  const [endBalance, setEndBalance] = useState(initial.endBalance !== null && initial.endBalance !== undefined ? String(Math.round(initial.endBalance * rate)) : '');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl p-4 max-w-sm w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-base">{year} 年 实际数据</h3>
          <button onClick={onCancel} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
            <X className="w-4 h-4"/>
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">实际增长 ({symbol})</label>
            <input
              type="number"
              value={actualGain}
              onChange={e => setActualGain(e.target.value)}
              placeholder={isCNY ? '例: 1440000 (144万¥)' : '例: 200000 (20万$)'}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
            />
            <div className="text-[10px] text-slate-400 mt-0.5">这一年涨了多少 (留空则按年末余额倒算)</div>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">年末余额 ({symbol})</label>
            <input
              type="number"
              value={endBalance}
              onChange={e => setEndBalance(e.target.value)}
              placeholder={isCNY ? '例: 19440000 (1944万¥)' : '例: 2600000 (260万$)'}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
            />
            <div className="text-[10px] text-slate-400 mt-0.5">这一年结束总共多少 (留空则按上年余额+本年增长自动算)</div>
          </div>
          <div className="text-[11px] text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
            💡 当前币种: <span className="font-bold">{currency}</span> (汇率 1 USD = {rate} CNY){isCNY ? ' · 保存时自动换算为 USD 存储' : ''}
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold">取消</button>
          <button
            onClick={() => {
              // 输入的是当前显示币种的数字
              // 存储时: 如果是 CNY, 除以 rate 换算成 USD
              const divisor = isCNY ? rate : 1;
              const ag = actualGain === '' ? null : parseFloat(actualGain) / divisor;
              const eb = endBalance === '' ? null : parseFloat(endBalance) / divisor;
              onSave(ag, eb);
            }}
            className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold"
          >保存</button>
        </div>
      </div>
    </div>
  );
}



// ============ 美股中英对照表 ============
// 主流热门股票 + 美股 ETF + 中概股(共 220+)
const STOCK_NAME_CN = {
  // 科技七姐妹
  AAPL: '苹果', MSFT: '微软', GOOGL: '谷歌A', GOOG: '谷歌C', AMZN: '亚马逊',
  META: 'Meta', NVDA: '英伟达', TSLA: '特斯拉',
  // 半导体
  TSM: '台积电', AMD: '超威半导体', AVGO: '博通', QCOM: '高通', INTC: '英特尔',
  ARM: 'Arm', MU: '美光', AMAT: '应用材料', LRCX: '泛林半导体', KLAC: '科磊',
  ASML: '阿斯麦', TXN: '德州仪器', MRVL: '迈威尔', ADI: '亚德诺', NXPI: '恩智浦',
  ON: '安森美', MPWR: '芯源系统', SMCI: '超微电脑',
  // 软件 / 云 / SaaS
  ORCL: '甲骨文', CRM: 'Salesforce', ADBE: 'Adobe', NOW: 'ServiceNow', INTU: 'Intuit',
  WDAY: 'Workday', SNOW: 'Snowflake', PLTR: 'Palantir', NET: 'Cloudflare',
  CRWD: 'CrowdStrike', PANW: 'Palo Alto Networks', FTNT: 'Fortinet', ZS: 'Zscaler',
  DDOG: 'Datadog', MDB: 'MongoDB', TEAM: 'Atlassian', DBX: 'Dropbox',
  SHOP: 'Shopify', SQ: 'Block', PYPL: 'PayPal',
  // 中概股
  BABA: '阿里巴巴', JD: '京东', PDD: '拼多多', BIDU: '百度', NTES: '网易',
  TCOM: '携程', BILI: '哔哩哔哩', NIO: '蔚来', XPEV: '小鹏汽车', LI: '理想汽车',
  TME: '腾讯音乐', DIDI: '滴滴', BEKE: '贝壳', YMM: '满帮', FUTU: '富途',
  TIGR: '老虎证券', IQ: '爱奇艺', VIPS: '唯品会', WB: '微博', LU: '陆金所',
  ZH: '知乎', DUOL: '多邻国', RLX: '雾芯科技', EDU: '新东方', TAL: '好未来',
  // 互联网 / 传媒
  NFLX: '奈飞', DIS: '迪士尼', SPOT: 'Spotify', RBLX: 'Roblox', U: 'Unity',
  TTWO: 'Take-Two', EA: '艺电', SNAP: 'Snap', PINS: 'Pinterest',
  MTCH: 'Match', ABNB: '爱彼迎', UBER: '优步', LYFT: 'Lyft', DASH: 'DoorDash',
  // 金融
  JPM: '摩根大通', BAC: '美国银行', WFC: '富国银行', C: '花旗', GS: '高盛',
  MS: '摩根士丹利', SCHW: '嘉信理财', BLK: '贝莱德', BX: '黑石', KKR: 'KKR',
  V: 'Visa', MA: '万事达', AXP: '美国运通', COF: '第一资本',
  BRK_B: '伯克希尔B',
  // 保险
  BRK: '伯克希尔A', AIG: '美国国际', MET: '大都会', PRU: '保德信', PGR: '前进保险',
  CB: '安达保险', TRV: '旅行者', ALL: '好事达',
  // 消费品
  KO: '可口可乐', PEP: '百事', MCD: '麦当劳', SBUX: '星巴克', NKE: '耐克',
  LULU: '露露柠檬', WMT: '沃尔玛', COST: '好市多', TGT: '塔吉特', HD: '家得宝',
  LOW: '劳氏', PG: '宝洁', UL: '联合利华', CL: '高露洁', KMB: '金佰利',
  PM: '菲利普莫里斯', MO: '奥驰亚', BUD: '百威英博', DEO: '帝亚吉欧',
  EL: '雅诗兰黛', CHWY: 'Chewy', ETSY: 'Etsy', EBAY: 'eBay',
  // 医药 / 生物
  LLY: '礼来', JNJ: '强生', UNH: '联合健康', PFE: '辉瑞', MRK: '默沙东',
  ABBV: '艾伯维', BMY: '百时美施贵宝', AZN: '阿斯利康', NVS: '诺华', GSK: '葛兰素史克',
  AMGN: '安进', GILD: '吉利德', BIIB: '渤健', REGN: '再生元', VRTX: '福泰制药',
  MRNA: 'Moderna', BNTX: 'BioNTech', NVAX: 'Novavax',
  ISRG: '直觉外科', DXCM: 'Dexcom', ZBH: '捷迈邦美',
  CVS: 'CVS健康', WBA: '沃博联',
  // 工业 / 材料
  GE: '通用电气', BA: '波音', LMT: '洛克希德马丁', RTX: '雷神技术', NOC: '诺斯罗普',
  CAT: '卡特彼勒', DE: '迪尔', HON: '霍尼韦尔', MMM: '3M',
  UPS: '联合包裹', FDX: '联邦快递', LIN: '林德', SHW: '宣伟',
  // 能源
  XOM: '埃克森美孚', CVX: '雪佛龙', COP: '康菲', EOG: 'EOG能源', SLB: '斯伦贝谢',
  OXY: '西方石油', PSX: '菲利普斯66', MPC: '马拉松石油', VLO: '瓦莱罗',
  // 汽车
  F: '福特', GM: '通用汽车', TM: '丰田', RIVN: 'Rivian', LCID: 'Lucid',
  // 通信 / 电信
  T: 'AT&T', VZ: '威瑞森', TMUS: 'T-Mobile', CMCSA: '康卡斯特',
  // 房地产
  PLD: '安博', AMT: '美国电塔', CCI: '冠城国际', EQIX: 'Equinix', SPG: '西蒙地产',
  // ETF - 大盘指数
  SPY: '标普500', QQQ: '纳斯达克100', DIA: '道琼斯', IWM: '罗素2000',
  VTI: '全市场', VOO: '标普500(先锋)', VEA: '发达市场', VWO: '新兴市场',
  IVV: '标普500(贝莱德)', VUG: '成长股', VTV: '价值股',
  // ETF - 行业
  XLK: '科技', XLF: '金融', XLV: '医疗', XLE: '能源', XLI: '工业',
  XLY: '可选消费', XLP: '日用消费', XLU: '公用事业', XLRE: '房地产', XLB: '材料',
  SMH: '半导体', SOXX: '半导体', IBB: '生物科技', ARKK: 'ARK创新', ARKG: 'ARK基因',
  KWEB: '中概互联', FXI: '中国大盘', MCHI: '中国MSCI', YINN: '中国3X多',
  EWJ: '日本', EWZ: '巴西', INDA: '印度',
  // ETF - 杠杆
  TQQQ: '3倍纳指', SQQQ: '3倍做空纳指', QLD: '2倍纳指', PSQ: '反向纳指',
  SOXL: '3倍半导体', SOXS: '3倍做空半导体',
  UPRO: '3倍标普', SPXU: '3倍做空标普', SDS: '2倍做空标普',
  UDOW: '3倍道指', SDOW: '3倍做空道指',
  TNA: '3倍小盘股', TZA: '3倍做空小盘',
  FAS: '3倍金融', FAZ: '3倍做空金融',
  TMF: '3倍长债', TMV: '3倍做空长债',
  LABU: '3倍生物科技', LABD: '3倍做空生物',
  NVDL: '2倍英伟达', TSLL: '2倍特斯拉', AAPU: '2倍苹果',
  // ETF - 债券 / 现金
  TLT: '20年长债', IEF: '7-10年债', SHY: '1-3年短债', SGOV: '0-3月国债',
  AGG: '综合债', BND: '综合债(先锋)', LQD: '投资级公司债', HYG: '高收益债',
  // ETF - 商品 / 黄金
  GLD: '黄金', SLV: '白银', USO: '原油', UNG: '天然气', DBC: '商品综合',
  GDX: '金矿股', GDXJ: '小金矿股',
  // ETF - VIX
  VIXY: 'VIX短期', UVXY: '1.5倍VIX', VXX: 'VIX期货',
  // ETF - 波动率 / 加密
  BITO: '比特币期货', GBTC: '灰度比特币', IBIT: '贝莱德比特币', FBTC: '富达比特币',
  ETHE: '灰度以太坊',
  // 加密相关股
  COIN: 'Coinbase', MSTR: 'MicroStrategy', MARA: '马拉松数字', RIOT: 'Riot平台',
  // 航空 / 旅游
  AAL: '美国航空', DAL: '达美航空', UAL: '联合航空', LUV: '西南航空',
  CCL: '嘉年华邮轮', RCL: '皇家加勒比', NCLH: '挪威邮轮',
  MAR: '万豪', HLT: '希尔顿', BKNG: 'Booking', EXPE: 'Expedia',
};

function normalizeStockSymbolForName(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function isPlaceholderStockName(symbol, name) {
  const normalizedSymbol = normalizeStockSymbolForName(symbol);
  const raw = String(name || '').trim();
  if (!raw) return true;
  const upper = raw.toUpperCase();
  return upper === normalizedSymbol || upper === `${normalizedSymbol}.US`;
}

function displayStockName(symbol, name) {
  const normalizedSymbol = normalizeStockSymbolForName(symbol);
  if (!normalizedSymbol) return String(name || '').trim();
  const mapped = STOCK_NAME_CN[normalizedSymbol];
  const raw = String(name || '').trim();
  if (mapped && (isPlaceholderStockName(normalizedSymbol, raw) || /^[A-Za-z0-9 .,&'()/-]+$/.test(raw))) return mapped;
  return raw || mapped || normalizedSymbol;
}

function localizeStockNameRow(row) {
  if (!row?.symbol) return row;
  return {
    ...row,
    symbol: normalizeStockSymbolForName(row.symbol),
    name: displayStockName(row.symbol, row.name),
  };
}

// ============ 股票配色 ============
// 主流热门股配品牌色,非主流的根据代码 hash 自动分配
// ============ 股票卡片颜色:统一翠绿色 ============
// 所有股票卡片头部用同一种翠绿,简洁统一
const UNIFIED_GREEN = { from: '#10b981', to: '#047857' };  // emerald 500→700

const getStockColor = (symbol) => UNIFIED_GREEN;



// ============ 内部主 App 组件(要求已登录) ============
// ============ VIX 恐慌指数卡片(独立组件,支持滚动入场动画) ============
function VixCard({ vix, setVix, vixDataDate, setVixDataDate, vixSignal }) {
  const [animatedVix, vixCardRef] = useCountUpOnScroll(vix, 900);
  return (
    <div ref={vixCardRef} className={`rounded-2xl p-5 mb-4 shadow border-2 ${vixSignal.color}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs opacity-80 font-medium">VIX 恐慌指数</span>
            {vixDataDate && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/30 font-bold">
                📅 {(() => {
                  const d = new Date(vixDataDate);
                  return `${d.getMonth() + 1}/${d.getDate()} 收盘`;
                })()}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-4xl font-black tabular-nums">{animatedVix.toFixed(1)}</span>
            <span className="text-2xl">{vixSignal.icon}</span>
          </div>
          <div className="text-sm opacity-90 mt-0.5">{vixSignal.desc}</div>
        </div>
        <div className="text-right">
          <div className="text-xs opacity-80">操作信号</div>
          <div className="text-xl font-black mt-1">{vixSignal.label}</div>
        </div>
      </div>

      {/* VIX 进度条 */}
      <div className="relative h-3 bg-white/30 rounded-full overflow-hidden mb-2">
        <div
          className="absolute inset-y-0 left-0 bg-white/60 rounded-full"
          style={{ width: `${Math.min((animatedVix / 50) * 100, 100)}%` }}
        />
        {/* 阈值刻度 */}
        {[20, 25, 30, 35].map(v => (
          <div
            key={v}
            className="absolute inset-y-0 w-0.5 bg-white/80"
            style={{ left: `${(v / 50) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] opacity-80 font-bold mb-3">
        <span>0</span>
        <span>20 准备</span>
        <span>25 买入</span>
        <span>30 重点</span>
        <span>35 梭哈</span>
        <span>50</span>
      </div>

      <div className="bg-white/20 rounded-lg px-3 py-2 text-sm font-bold">
        💡 {vixSignal.action}
      </div>

      {/* VIX 输入(手动覆盖) */}
      <div className="mt-3">
        <div className="flex items-center gap-2">
          <label className="text-xs opacity-80 font-bold">手动覆盖 VIX:</label>
          <input
            type="number"
            step="0.1"
            value={vix}
            onChange={(e) => { setVix(parseFloat(e.target.value) || 0); setVixDataDate(null); }}
            className="flex-1 px-3 py-1.5 rounded-lg text-sm font-bold text-slate-900 bg-white/90 border border-white/50"
          />
          <a
            href="https://finance.yahoo.com/quote/%5EVIX/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1.5 rounded-lg text-xs font-bold bg-white/30 hover:bg-white/50 transition active:scale-95"
            title="在 Yahoo 查询实时 VIX"
          >
            查实时↗
          </a>
        </div>
        <div className="text-[10px] opacity-70 mt-1">
          💡 自动拉取 FRED 收盘价;盘中实时点「查实时」手动填
        </div>
      </div>
    </div>
  );
}

function MainApp({ user, onLogout }) {
  // Real-time quotes must go through a server-side relay. Never expose EODHD tokens in browser code.
  const browserWsAllowed = false;

  // ============ 核心状态 ============
  const [marketColorMode, setMarketColorMode] = useState(() => {
    try {
      return normalizeMarketColorMode(localStorage.getItem(MARKET_COLOR_MODE_STORAGE_KEY));
    } catch {
      return normalizeMarketColorMode();
    }
  });
  const [qqqHigh, setQqqHigh] = useState(640.47);
  const [qqqCurrent, setQqqCurrent] = useState(640.47);
  const [tqqqCurrent, setTqqqCurrent] = useState(58.55);
  const [totalCapital, setTotalCapital] = useState(500000);

  // 关注股票列表(可编辑价格)
  // high = 6个月滚动最高价,用于计算回撤预警
  // 默认为空,新用户登录后看到引导界面 → 点"添加你的第一只股票"
  const [watchlist, setWatchlist] = useState([]);
  const [watchlistOrder, setWatchlistOrder] = useState([]);
  const [quoteCache, setQuoteCache] = useState([]);
  const [logoCache, setLogoCache] = useState(() => readCachedStockLogos());
  const [editingStock, setEditingStock] = useState(null);
  const [showAddStock, setShowAddStock] = useState(false);
  const [newStock, setNewStock] = useState({ symbol: '', name: '', price: '', high: '', cost: '0', shares: '0' });

  // VIX 恐慌指数
  const [vix, setVix] = useState(16.5);
  const [vixDataDate, setVixDataDate] = useState(null); // FRED 返回的数据日期

  // CNN 恐慌贪婪指数(0-100)
  const [fgi, setFgi] = useState(50);
  const [fgiLabel, setFgiLabel] = useState('neutral');
  const [fgiPrev, setFgiPrev] = useState(null);
  const [fgiWeek, setFgiWeek] = useState(null);
  const [fgiMonth, setFgiMonth] = useState(null);
  const [fgiYear, setFgiYear] = useState(null);
  const [fgiDataDate, setFgiDataDate] = useState(null);

  // 三大指数(DIA/QQQ/SPY 当天分时)
  const [indices, setIndices] = useState([]);

  // 📅 v10.7.9.41: 重要日历 (财报 + FOMC)
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);  // 点击展开的事件
  // 📊 v10.7.9.41: 分析师 + 公司基本面 (EODHD Fundamentals, 按需拉)
  const [analystTargets, setAnalystTargets] = useState(null);
  const [analystHighlights, setAnalystHighlights] = useState(null);
  const [analystGeneral, setAnalystGeneral] = useState(null);
  const [analystEarnings, setAnalystEarnings] = useState(null);  // v41: EPS + 营收 对比
  const [analystAnnual, setAnalystAnnual] = useState(null);      // v40 fix21: 10 年年度业绩
  const [analystPriceHistory, setAnalystPriceHistory] = useState(null);  // v40 fix23: 1 年历史日线
  const [analystInsider, setAnalystInsider] = useState(null);    // v40 fix37: 内部人交易
  const [analystNews, setAnalystNews] = useState(null);          // v40 fix37: 新闻 (取消显示, 但保留)
  const [analystNewsSentiment, setAnalystNewsSentiment] = useState(null);  // v40 fix42: 综合情绪 (保留)
  const [analystStructure, setAnalystStructure] = useState(null); // v40 fix42: 季度财务结构
  const [chartMetric, setChartMetric] = useState('revenue');     // 'revenue' | 'netIncome' | 'epsActual'
  const [chartSelectedYear, setChartSelectedYear] = useState(null);
  const [analystLoading, setAnalystLoading] = useState(false);

  // 顶部市场状态卡的基准股票(默认 QQQ,可切换关注列表里其他 1x 标的)
  const [benchmarkSymbol, setBenchmarkSymbol] = useState('QQQ');
  const [benchmarkMenuOpen, setBenchmarkMenuOpen] = useState(false);

  // 杠杆 ETF 黑名单(不允许作为基准,因为回撤不该 ×3 来判断)
  const LEVERAGED_ETFS = ['TQQQ', 'SQQQ', 'QLD', 'PSQ', 'SOXL', 'SOXS', 'UPRO', 'SPXU', 'UDOW', 'SDOW', 'TNA', 'TZA', 'FAS', 'FAZ', 'TMF', 'TMV', 'LABU', 'LABD'];
  
  // 预警通知开关 (持久化 localStorage)
  // v10.7.9.41: 用户折叠后记住, 下次打开还是折叠
  const [alertsMuted, setAlertsMuted] = useState(() => {
    try { return localStorage.getItem('bottomline_alerts_muted') === 'true'; } catch { return false; }
  });
  // 上次看到的预警股票 + 等级 (用于检测"新预警")
  // 格式: { TQQQ: 3, SOXL: 7 }
  const [lastSeenAlerts, setLastSeenAlerts] = useState(() => {
    try {
      const raw = localStorage.getItem('bottomline_last_seen_alerts');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  // 三档配置(可调)
  const [batches, setBatches] = useState([
    { id: 1, name: '第1批', drawdown: -0.10, allocation: 0.25 },
    { id: 2, name: '第2批', drawdown: -0.15, allocation: 0.35 },
    { id: 3, name: '第3批', drawdown: -0.20, allocation: 0.40 },
  ]);

  // 波段记录旧账本:只给波段工具兼容使用,不再作为首页/交易主持仓来源。
  const [trades, setTrades] = useState([]);
  // 主交易账本:独立记录真实股票买入/卖出流水,由 stock_trades 表持久化。
  const [stockTrades, setStockTrades] = useState([]);
  const [showAddTrade, setShowAddTrade] = useState(false);
  const [tradeEntryScope, setTradeEntryScope] = useState('ledger'); // ledger = 主交易账本, wave = 波段记录旧账本
  const [tradeSubmitting, setTradeSubmitting] = useState(false);
  const tradeSubmittingRef = useRef(false);
  const [newTrade, setNewTrade] = useState({
    symbol: 'TQQQ',
    name: '3倍纳指',
    side: 'buy',
    date: new Date().toISOString().split('T')[0],
    price: '',
    shares: '',
    batch: '第1批',  // 兼容老结构
  });
  // 添加交易时的"查询股票"状态
  const [lookupStatus, setLookupStatus] = useState(null);  // null | 'loading' | 'found' | 'notfound'

  // 待确认删除的交易 id(弹出确认弹窗)
  const [tradeDeleteConfirmId, setTradeDeleteConfirmId] = useState(null);

  // 待确认删除的股票 symbol(弹出确认弹窗)
  const [stockDeleteConfirmId, setStockDeleteConfirmId] = useState(null);

  // 波段备注 { 'wave-id': '关税恐慌' }
  const [waveNotes, setWaveNotes] = useState({});
  const [editingNoteId, setEditingNoteId] = useState(null);  // 正在编辑哪个波段的备注

  // ===== 家庭资产 =====
  const [accounts, setAccounts] = useState([]);          // [{id, owner, type, name, currency, icon}]
  const [snapshots, setSnapshots] = useState([]);        // [{id, accountId, month, balance}]
  const [usdRate, setUsdRate] = useState(DEFAULT_USD_CNY_RATE); // 美元换人民币汇率
  const [hkdRate, setHkdRate] = useState(DEFAULT_HKD_CNY_RATE); // 港币换人民币汇率
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showFillSnapshot, setShowFillSnapshot] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [accountDeleteConfirmId, setAccountDeleteConfirmId] = useState(null);
  const [newAccount, setNewAccount] = useState({
    owner: '我',
    type: '银行',
    name: '',
    currency: 'CNY',
    icon: '🏦',
    balance: '',
  });
  const [snapshotDraft, setSnapshotDraft] = useState({}); // { account_id: '12345' } 填快照时的暂存值
  const [snapshotTab, setSnapshotTab] = useState('我');    // 录入界面当前 Tab: '我' or '老婆'

  // 🔑 修改密码 (设置页)
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPwd, setNewPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState(null);  // { type: 'error'|'success', text: '...' }
  const [pwdLoading, setPwdLoading] = useState(false);
  const [fillMonth, setFillMonth] = useState(() => new Date().toISOString().slice(0, 7)); // 填快照 Modal 里当前选择的月份
  const [showMonthsDetail, setShowMonthsDetail] = useState(false); // 12 个月资产走势 Modal
  const [chartSelectedMonthIdx, setChartSelectedMonthIdx] = useState(null); // v40 fix46: 12月走势点圆点

  // ===== 复盘 tab =====
  const [investmentPlan, setInvestmentPlan] = useState({
    startCapital: 0,
    targetAnnualRate: 0.20,
    startYear: new Date().getFullYear(),
    totalYears: 10,
    ageGoalAge: 0,
    motto: '',
    displayCurrency: 'USD',  // USD | CNY
  });
  const [marginStatus, setMarginStatus] = useState({ currentMargin: 0, marginLimit: 0 });
  const [disciplines, setDisciplines] = useState([]);
  const [reviewLogs, setReviewLogs] = useState([]);
  const [yearlyActuals, setYearlyActuals] = useState([]); // [{year, actualGain, endBalance}]

  const [showPlanSettings, setShowPlanSettings] = useState(false);
  const [showEditMargin, setShowEditMargin] = useState(false);
  const [showAddDiscipline, setShowAddDiscipline] = useState(false);
  const [editingDisciplineId, setEditingDisciplineId] = useState(null);
  const [showAddLog, setShowAddLog] = useState(false);
  const [editingLogId, setEditingLogId] = useState(null);
  const [filterLevel, setFilterLevel] = useState('all'); // all / 🟢 / 🔺 / 📣 / ❗
  const [showAllDisciplines, setShowAllDisciplines] = useState(false);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [expandedDisciplines, setExpandedDisciplines] = useState({}); // { id: bool } 长戒律展开
  const [editYearlyActualId, setEditYearlyActualId] = useState(null); // 编辑哪个年份的实际数据
  const [showAllYears, setShowAllYears] = useState(false); // 年度表默认显示 3 个, 点击展开全部
  // 防重复提交: 记录最近一次提交的内容 + 时间戳 (10 秒内相同内容拒绝)
  const lastSubmitRef = useRef({}); // { [key]: { text: '', at: timestamp } }

  // 波段展开状态(点击波段可展开看明细) { 'wave-id': true }
  const [expandedWaves, setExpandedWaves] = useState({});

  // 📋 所有交易记录弹窗 (按股票代码查看/删除完整历史)
  const [allTradesModal, setAllTradesModal] = useState(null); // null 或 { symbol, name }

  // === FGI 仪表盘动画:从 0 缓动到目标值 ===
  const [displayFgi, setDisplayFgi] = useState(0);
  const fgiAnimRef = useRef({ from: 0, hasInit: false });
  useEffect(() => {
    const targetFgi = fgi;
    // 起点:首次永远从 0 开始;后续从当前显示值出发
    const startFgi = fgiAnimRef.current.hasInit ? displayFgi : 0;
    fgiAnimRef.current.hasInit = true;

    const duration = 1200;
    const startTime = performance.now();
    let rafId;
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const current = startFgi + (targetFgi - startFgi) * eased;
      setDisplayFgi(current);
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setDisplayFgi(targetFgi);
      }
    };

    // 立即把 displayFgi 设回起点(避免第一帧闪现到旧值)
    setDisplayFgi(startFgi);
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fgi]);

  // 止盈配置
  const [exitTargets, setExitTargets] = useState([
    { id: 1, name: '止盈点1', gain: 0.50, sellRatio: 0.50 },
    { id: 2, name: '止盈点2', gain: 0.70, sellRatio: 0.30 },
  ]);

  // 拉取实时行情状态
  const [fetching, setFetching] = useState(false);

  // 🧪 实时模式预留:浏览器直连 EODHD 已移除,等待服务端 relay。
  const [wsEnabled, setWsEnabled] = useState(false);
  const [wsStatus] = useState('disabled');
  const [wsLastTick] = useState(null); // 服务端 relay 接入后再更新最后 tick 时间
  // 价格变化闪烁: { symbol: 'up' | 'down' }, 300ms 后清空
  const [priceFlash] = useState({});

  const fetchQuote = useCallback(async (symbols) => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    const params = new URLSearchParams({ symbols });
    return fetch(`/api/quote?${params.toString()}`, { headers });
  }, []);

  const applyBtcRealtimeTick = useCallback((tick, realtimeStatus = 'live') => {
    const price = Number(tick?.price);
    if (!Number.isFinite(price) || price <= 0) return;
    const tickAt = Number(tick?.timestamp || tick?.receivedAt || Date.now());
    btcRealtimeRef.current.lastTick = tick;
    btcRealtimeRef.current.lastTickAt = Date.now();
    setBtcRealtimeStatus(realtimeStatus);
    setBtcRealtimeLastTick(new Date(tickAt).toISOString());
    setBtcRealtimeError(null);
    setIndices((current) => applyBtcTickToMarketCards(current, tick, realtimeStatus));
  }, []);

  const mergeFreshBtcTickIntoCards = useCallback((cards) => {
    const ref = btcRealtimeRef.current;
    if (!ref.lastTick || Date.now() - ref.lastTickAt > BTC_REALTIME_STALE_MS) return cards;
    return applyBtcTickToMarketCards(cards, ref.lastTick, 'live');
  }, []);

  const cacheStockLogo = useCallback((symbol, url) => {
    const key = normalizeSymbolKey(symbol);
    const normalizedUrl = normalizeExternalLogoUrl(url);
    if (!key || !normalizedUrl) return;
    setLogoCache((current) => {
      if (current[key]?.url === normalizedUrl) return current;
      const next = {
        ...current,
        [key]: {
          url: normalizedUrl,
          updatedAt: new Date().toISOString(),
        },
      };
      try {
        localStorage.setItem(STOCK_LOGO_CACHE_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const applyFxRates = useCallback((rates) => {
    const usdCny = validRate(rates?.CNY);
    const hkdCny = validRate(rates?.HKD);
    if (usdCny) setUsdRate(usdCny);
    if (hkdCny) setHkdRate(hkdCny);
  }, []);

  const fetchDailyFxRates = useCallback(async ({ force = false } = {}) => {
    const todayKey = localDateKey();
    const cached = readCachedFxRates();

    if (cached?.rates) {
      applyFxRates(cached.rates);
      if (!force && cached.dateKey === todayKey) return cached;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return cached;

      const response = await fetch('/api/fx', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || '汇率拉取失败');
      }

      const nextRates = {
        CNY: validRate(result?.rates?.CNY),
        HKD: validRate(result?.rates?.HKD),
      };
      if (!nextRates.CNY && !nextRates.HKD) {
        throw new Error('汇率接口没有返回有效数据');
      }

      const next = {
        dateKey: todayKey,
        fetchedAt: result.fetchedAt || new Date().toISOString(),
        source: result.source || 'EODHD',
        rates: nextRates,
      };
      try {
        localStorage.setItem(FX_RATES_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      applyFxRates(nextRates);
      return next;
    } catch (e) {
      console.warn('[FX] 每日汇率拉取失败,保留缓存/默认值:', e.message);
      return cached;
    }
  }, [applyFxRates]);

  // 🗑 v10.7.9.41: 通用删除确认 Modal (替换 window.confirm)
  // 用法: showConfirm({ title, desc, info, confirmText, onConfirm })
  const [confirmModal, setConfirmModal] = useState(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const confirmSubmittingRef = useRef(false);
  const showConfirm = useCallback((opts) => {
    confirmSubmittingRef.current = false;
    setConfirmSubmitting(false);
    setConfirmModal({
      title: opts.title || '确认操作?',
      desc: opts.desc || '此操作不可撤销',
      info: opts.info || null,
      confirmText: opts.confirmText || '删除',
      cancelText: opts.cancelText || '取消',
      confirmStyle: opts.confirmStyle || 'danger', // 'danger' | 'primary'
      icon: opts.icon || '🗑',
      onConfirm: opts.onConfirm,
    });
  }, []);

  useEffect(() => {
    try { localStorage.setItem('bottomline_ws', 'false'); } catch {}
  }, []);

  // 💼 v10.7.9.41: 摊薄成本计算器 (独立模块, localStorage 存)
  // 数据结构: { [symbol]: [{id, date, type:'buy'|'sell', price, shares}, ...] }
  const [costBasisData, setCostBasisData] = useState(() => {
    try {
      const raw = localStorage.getItem('bottomline_cost_basis');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const [costBasisActiveSymbol, setCostBasisActiveSymbol] = useState(() => {
    try { return localStorage.getItem('bottomline_cost_basis_active') || ''; } catch { return ''; }
  });
  const [showCostBasisAdd, setShowCostBasisAdd] = useState(false);  // 添加新股票 modal
  const [showCostBasisTrade, setShowCostBasisTrade] = useState(false);  // 添加交易 modal
  const [costBasisNewSymbol, setCostBasisNewSymbol] = useState('');
  const [costBasisNewTrade, setCostBasisNewTrade] = useState({
    type: 'buy',
    price: '',
    shares: '',
    date: new Date().toISOString().slice(0, 10),
  });
  const [costBasisSubmitting, setCostBasisSubmitting] = useState(false);
  const costBasisSubmittingRef = useRef(false);
  // 卖出交易展开/收起 state (id → bool)
  const [expandedTrades, setExpandedTrades] = useState({});

  // 持久化到 localStorage
  useEffect(() => {
    try { localStorage.setItem('bottomline_cost_basis', JSON.stringify(costBasisData)); } catch {}
  }, [costBasisData]);
  useEffect(() => {
    try { localStorage.setItem('bottomline_cost_basis_active', costBasisActiveSymbol); } catch {}
  }, [costBasisActiveSymbol]);

  // 核心算法: 移动加权平均 + 扣除已实现盈亏的"实际成本"
  const calcCostBasis = (trades) => {
    if (!trades || trades.length === 0) return { shares: 0, totalCost: 0, avgCost: 0, effectiveCost: 0, realizedPnl: 0 };
    const sorted = [...trades].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let shares = 0;
    let totalCost = 0;
    let realizedPnl = 0;
    for (const t of sorted) {
      const p = parseFloat(t.price) || 0;
      const s = parseFloat(t.shares) || 0;
      if (t.type === 'buy') {
        shares += s;
        totalCost += s * p;
      } else {
        if (shares <= 0) continue;  // 没持仓不能卖
        const avg = totalCost / shares;
        realizedPnl += s * (p - avg);
        totalCost -= s * avg;
        shares -= s;
        if (shares <= 0) {
          shares = 0;
          totalCost = 0;  // 清仓重置
        }
      }
    }
    const avgCost = shares > 0 ? totalCost / shares : 0;
    // 实际成本 = 摊薄成本 - 已实现盈亏均摊到剩余持仓
    // 比如赚了 $70,220, 剩 6000 股 → 每股降 $11.70
    const effectiveCost = shares > 0 ? avgCost - realizedPnl / shares : 0;
    return {
      shares,
      totalCost,
      avgCost,
      effectiveCost,
      realizedPnl,
    };
  };

  // 📜 更新日志展开状态 (默认折叠, 只显示最新 5 条)
  const [changelogExpanded, setChangelogExpanded] = useState(false);
  const [lastFetched, setLastFetched] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [btcRealtimeStatus, setBtcRealtimeStatus] = useState('idle');
  const [btcRealtimeLastTick, setBtcRealtimeLastTick] = useState(null);
  const [btcRealtimeError, setBtcRealtimeError] = useState(null);
  const btcRealtimeRef = useRef({
    socket: null,
    reconnectTimer: null,
    staleTimer: null,
    retryDelayMs: 1000,
    lastTick: null,
    lastTickAt: 0,
    liveAt: 0,
    intentionalCloseSocket: null,
  });
  // 云端数据加载状态
  const [cloudLoading, setCloudLoading] = useState(true);
  const [cloudError, setCloudError] = useState(null);
  const [pullRefreshDistance, setPullRefreshDistance] = useState(0);
  const [pullRefreshStatus, setPullRefreshStatus] = useState('idle'); // idle | pulling | ready | refreshing | done
  const pullRefreshDistanceRef = useRef(0);
  const pullRefreshResetTimerRef = useRef(null);
  const globalRefreshingRef = useRef(false);
  const runGlobalPullRefreshRef = useRef(null);
  const localizedStockTrades = useMemo(() => stockTrades.map(localizeStockNameRow), [stockTrades]);
  const localizedWatchlist = useMemo(() => watchlist.map(localizeStockNameRow), [watchlist]);
  const localizedQuoteCache = useMemo(() => quoteCache.map(localizeStockNameRow), [quoteCache]);
  const quoteUniverse = useMemo(
    () => buildLedgerQuoteUniverse(localizedStockTrades, localizedWatchlist, localizedQuoteCache),
    [localizedStockTrades, localizedWatchlist, localizedQuoteCache],
  );
  const quoteRows = quoteUniverse.allRows;
  const homeWatchlist = quoteUniverse.watchlistRows;
  const buildSettingsPayload = useCallback((overrides = {}) => ({
    benchmarkSymbol,
    marketColorMode,
    fgi,
    fgiLabel,
    fgiPrev,
    fgiWeek,
    fgiMonth,
    fgiYear,
    fgiDataDate,
    vix,
    vixDataDate,
    batches,
    exitTargets,
    watchlistOrder: normalizeWatchlistOrder(watchlistOrder),
    ...overrides,
  }), [
    benchmarkSymbol,
    marketColorMode,
    fgi,
    fgiLabel,
    fgiPrev,
    fgiWeek,
    fgiMonth,
    fgiYear,
    fgiDataDate,
    vix,
    vixDataDate,
    batches,
    exitTargets,
    watchlistOrder,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(MARKET_COLOR_MODE_STORAGE_KEY, marketColorMode);
    } catch {}
  }, [marketColorMode]);

  const applyCloudUserData = useCallback((result, logLabel = '[云端加载]') => {
    const {
      trades: cloudTrades,
      stockTrades: cloudStockTrades,
      watchlist: cloudWatchlist,
      waveNotes: cloudNotes,
      settings,
      accounts: cloudAccounts,
      snapshots: cloudSnapshots,
      investmentPlan: cloudPlan,
      marginStatus: cloudMargin,
      disciplines: cloudDisciplines,
      reviewLogs: cloudLogs,
      yearlyActuals: cloudActuals,
      _failedTables,
    } = result || {};

    console.log(`${logLabel} cloudWatchlist:`, cloudWatchlist, '长度:', cloudWatchlist?.length);
    console.log(`${logLabel} accounts:`, cloudAccounts?.length, 'snapshots:', cloudSnapshots?.length);
    console.log(`${logLabel} 复盘 tab: plan`, cloudPlan, 'margin', cloudMargin, 'disciplines', cloudDisciplines?.length, 'logs', cloudLogs?.length);

    if (_failedTables && _failedTables.length > 0) {
      console.error(`${logLabel} ⚠️ 以下表拉取失败, 保留本地数据:`, _failedTables);
      setCloudError(`⚠️ ${_failedTables.length} 项数据未能加载: ${_failedTables.join(', ')}`);
    } else {
      setCloudError(null);
    }

    // 防护原则: null = 拉取失败 → 不动本地; []/{} = 真的空 → 可以覆盖。
    if (cloudTrades !== null && cloudTrades !== undefined) setTrades(cloudTrades);
    else console.warn(`${logLabel} ⚠️ trades 拉取失败, 保留本地 state`);

    if (cloudStockTrades !== null && cloudStockTrades !== undefined) setStockTrades(cloudStockTrades);
    else console.warn(`${logLabel} ⚠️ stockTrades 拉取失败, 保留本地主交易账本`);

    if (Array.isArray(cloudWatchlist)) {
      const cloudWatchlistOrder = normalizeWatchlistOrder(settings?.watchlistOrder);
      const orderedWatchlist = orderWatchlistRows(cloudWatchlist, cloudWatchlistOrder);
      console.log(`${logLabel} ✓ 设置 watchlist:`, orderedWatchlist.length, '只');
      setWatchlist(orderedWatchlist);
      setWatchlistOrder(normalizeWatchlistOrder(orderedWatchlist.map((item) => item?.symbol)));
    } else {
      console.warn(`${logLabel} ⚠️ watchlist 拉取失败, 保留本地默认`);
    }

    if (cloudNotes !== null && cloudNotes !== undefined) setWaveNotes(cloudNotes);
    else console.warn(`${logLabel} ⚠️ waveNotes 拉取失败, 保留本地`);

    if (cloudAccounts !== null && cloudAccounts !== undefined) setAccounts(cloudAccounts);
    else console.warn(`${logLabel} ⚠️ accounts 拉取失败, 保留本地`);

    if (cloudSnapshots !== null && cloudSnapshots !== undefined) setSnapshots(cloudSnapshots);
    else console.warn(`${logLabel} ⚠️ snapshots 拉取失败, 保留本地`);

    if (cloudPlan) setInvestmentPlan(cloudPlan);
    if (cloudMargin) setMarginStatus(cloudMargin);

    if (cloudDisciplines !== null && cloudDisciplines !== undefined) setDisciplines(cloudDisciplines);
    else console.warn(`${logLabel} ⚠️ disciplines 拉取失败, 保留本地`);

    if (cloudLogs !== null && cloudLogs !== undefined) setReviewLogs(cloudLogs);
    else console.warn(`${logLabel} ⚠️ reviewLogs 拉取失败, 保留本地`);

    if (cloudActuals !== null && cloudActuals !== undefined) setYearlyActuals(cloudActuals);
    else console.warn(`${logLabel} ⚠️ yearlyActuals 拉取失败, 保留本地`);

    if (settings) {
      if (settings.benchmarkSymbol) setBenchmarkSymbol(settings.benchmarkSymbol);
      if (typeof settings.fgi === 'number') setFgi(settings.fgi);
      if (settings.fgiLabel) setFgiLabel(settings.fgiLabel);
      if (typeof settings.fgiPrev === 'number') setFgiPrev(settings.fgiPrev);
      if (typeof settings.fgiWeek === 'number') setFgiWeek(settings.fgiWeek);
      if (typeof settings.fgiMonth === 'number') setFgiMonth(settings.fgiMonth);
      if (typeof settings.fgiYear === 'number') setFgiYear(settings.fgiYear);
      if (settings.fgiDataDate) setFgiDataDate(settings.fgiDataDate);
      if (settings.vix) setVix(settings.vix);
      if (settings.vixDataDate) setVixDataDate(settings.vixDataDate);
      if (Array.isArray(settings.batches) && settings.batches.length > 0) setBatches(settings.batches);
      if (Array.isArray(settings.exitTargets) && settings.exitTargets.length > 0) setExitTargets(settings.exitTargets);
      if (settings.marketColorMode) setMarketColorMode(normalizeMarketColorMode(settings.marketColorMode));
    }
  }, []);

  // 启动时从 Supabase 拉取所有数据
  useEffect(() => {
    let mounted = true;
    const MAX_CLOUD_SYNC_GUARD_MS = 2600;  // 最多阻止自动保存 2.6s, 主界面不再被开屏阻塞

    // 强制解除保存保护, 避免云端长时间无响应时无法继续使用
    const timeoutId = setTimeout(() => {
      if (mounted) {
        console.warn('[云端加载] 超过 2.6s 仍未完成, 解除启动保护');
        setCloudLoading(false);
      }
    }, MAX_CLOUD_SYNC_GUARD_MS);

    const finishLoading = () => {
      if (!mounted) return;
      clearTimeout(timeoutId);
      setCloudLoading(false);
    };

    (async () => {
      try {
        setCloudLoading(true);
        console.log('[云端加载] 开始拉取...');
        const result = await db.fetchAllUserData();
        console.log('[云端加载] 原始返回:', result);
        if (!mounted) return;
        applyCloudUserData(result, '[云端加载]');
      } catch (e) {
        console.error('[云端加载] 失败:', e);
        setCloudError(e.message);
      } finally {
        finishLoading();  // 0.8s 下限保护
      }
    })();
    return () => { mounted = false; clearTimeout(timeoutId); };
  }, [applyCloudUserData]);

  useEffect(() => {
    fetchDailyFxRates();
  }, [fetchDailyFxRates]);

  // 保存设置到云端(防抖,500ms 内多次改只保存最后一次)
  const settingsSaveTimerRef = useRef(null);
  useEffect(() => {
    if (cloudLoading) return; // 加载期间不保存
    clearTimeout(settingsSaveTimerRef.current);
    settingsSaveTimerRef.current = setTimeout(() => {
      db.upsertSettings(buildSettingsPayload()).catch(e => console.error('设置保存失败:', e));
    }, 500);
    return () => clearTimeout(settingsSaveTimerRef.current);
  }, [buildSettingsPayload, cloudLoading]);

  // 🚨 Watchlist 保存策略: 改为精确单条操作 (addStock/removeStock/updateStockPrice 里直接写)
  //     不再用"删光重插"的 replaceWatchlist, 避免竞态和重复问题
  //     所以这个防抖 useEffect 只用于"更新价格/成本/股数"时保存
  const watchlistSaveTimerRef = useRef(null);
  const watchlistStructureSig = useMemo(
    () => watchlist.map(s => `${s.symbol}|${s.name}|${s.high}|${s.cost}|${s.shares}`).join(';'),
    [watchlist]
  );
  useEffect(() => {
    if (cloudLoading) return;
    if (watchlist.length === 0) return; // 空列表不触发
    clearTimeout(watchlistSaveTimerRef.current);
    watchlistSaveTimerRef.current = setTimeout(async () => {
      // 对每只股票单独 upsert, 不走"删光重插"
      for (const item of watchlist) {
        try {
          await db.upsertWatchlistItem(item);
        } catch (e) {
          console.error(`[保存 ${item.symbol}] 失败:`, e);
        }
      }
    }, 500);
    return () => clearTimeout(watchlistSaveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlistStructureSig, cloudLoading]);

  // ☁️ v10.7.9.41: 摊薄成本云端同步 (Supabase cost_basis_trades 表)
  // 严格放在 cloudLoading 之后, 避免 React state hoisting 错乱
  // 启动时拉云端覆盖本地; 本地有数据但云端为空 → 自动迁移上云
  useEffect(() => {
    if (cloudLoading) return; // 等主云端加载完成后再跑
    let cancelled = false;
    (async () => {
      try {
        const cloudData = await db.fetchCostBasisTrades();
        if (cancelled) return;
        const cloudHasData = cloudData && Object.keys(cloudData).length > 0;
        // 用函数式 setState 拿当前 state, 避免依赖 costBasisData 引发无限循环
        setCostBasisData(currentLocal => {
          const localHasData = currentLocal && Object.keys(currentLocal).length > 0;

          if (cloudHasData) {
            // 云端有数据 → 用云端覆盖本地 (云端是真相)
            console.log('[CostBasis] ☁️ 从云端加载', Object.keys(cloudData).length, '只股票');
            return cloudData;
          } else if (localHasData) {
            // 云端空, 本地有 → 自动上传迁移 (异步, 不等)
            console.log('[CostBasis] 📤 本地数据自动迁移到云端...');
            (async () => {
              for (const [sym, trades] of Object.entries(currentLocal)) {
                for (const trade of trades) {
                  try {
                    await db.insertCostBasisTrade(sym, trade);
                  } catch (e) {
                    console.error('[CostBasis] 迁移失败', sym, trade.id, e.message);
                  }
                }
              }
              console.log('[CostBasis] ✓ 迁移完成');
            })();
            return currentLocal; // 不变
          }
          return currentLocal; // 都空, 不变
        });
      } catch (e) {
        console.error('[CostBasis] 云端加载失败:', e.message, '保留本地数据');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudLoading]);

  // 📅 v10.7.9.41: 重要日历 (每天拉 1 次, 缓存 24h)
  useEffect(() => {
    if (cloudLoading) return;
    if (quoteRows.length === 0) return;

    // v10.7.9.41: 取消缓存, 每次进 App 都拉新数据
    // (NASDAQ 接口免费 + 财报状态会变 (EPS 实际值刷新))
    (async () => {
      try {
        const symbols = quoteRows.map(s => s.symbol).join('|');
        const r = await fetchQuote(`CALENDAR:${symbols}`);
        const result = await r.json();
        if (result.success && result.data) {
          const cal = result.data.find(d => d.symbol && d.symbol.startsWith('CALENDAR'));
          if (cal && cal.events) {            setCalendarEvents(cal.events);
          }
        }
      } catch (e) {
        console.warn('[Calendar] 拉取失败:', e.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudLoading, quoteRows.length]);

  // 📊 v10.7.9.41: Modal 打开时按需拉 EODHD Fundamentals (分析师 + 业绩)
  useEffect(() => {
    // 关闭 Modal → 清掉旧数据
    if (!selectedEvent) {
      setAnalystTargets(null);
      setAnalystHighlights(null);
      setAnalystGeneral(null);
      setAnalystEarnings(null);
      setAnalystAnnual(null);
      setAnalystPriceHistory(null);
      setAnalystInsider(null);
      setAnalystNews(null);
      setAnalystNewsSentiment(null);
      setAnalystStructure(null);
      setChartSelectedYear(null);
      setChartMetric('revenue');
      setAnalystLoading(false);
      return;
    }
    // 只对财报事件拉 (FOMC 不需要)
    if ((selectedEvent.type !== 'earnings' && selectedEvent.type !== 'stock') || !selectedEvent.symbol) {
      setAnalystTargets(null);
      setAnalystHighlights(null);
      setAnalystGeneral(null);
      setAnalystEarnings(null);
      setAnalystAnnual(null);
      setAnalystPriceHistory(null);
      setAnalystInsider(null);
      setAnalystNews(null);
      setAnalystNewsSentiment(null);
      setAnalystStructure(null);
      return;
    }

    let cancelled = false;
    setAnalystLoading(true);
    setAnalystTargets(null);
    setAnalystHighlights(null);
    setAnalystGeneral(null);
    setAnalystEarnings(null);
    setAnalystAnnual(null);
    setAnalystPriceHistory(null);
    setAnalystInsider(null);
    setAnalystNews(null);
    setAnalystNewsSentiment(null);
    setAnalystStructure(null);
    setChartSelectedYear(null);

    (async () => {
      try {
        const r = await fetchQuote(`ANALYST:${selectedEvent.symbol}`);
        const result = await r.json();
        if (cancelled) return;
        if (result.success && result.data) {
          const a = result.data.find(d => d.symbol && d.symbol.startsWith('ANALYST:'));
          if (a) {
            if (a.targets) setAnalystTargets(a.targets);
            if (a.highlights) setAnalystHighlights(a.highlights);
            if (a.general) setAnalystGeneral(a.general);
            if (a.annualSeries && a.annualSeries.length > 0) {
              setAnalystAnnual(a.annualSeries);
              // 默认选最新有完整数据的一年 (从最新往前找, 跳过空数据)
              // a.annualSeries 是正序 [最早 ... 最新], 倒着找
              let defaultYear = null;
              for (let i = a.annualSeries.length - 1; i >= 0; i--) {
                const d = a.annualSeries[i];
                if (d.revenue != null && d.netIncome != null) {
                  defaultYear = d.year;
                  break;
                }
              }
              // 如果都没有完整, 用最新一年
              setChartSelectedYear(defaultYear || a.annualSeries[a.annualSeries.length - 1].year);
            }
            // v40 fix23: 历史价格 (1 年走势图)
            if (a.priceHistory && a.priceHistory.length > 0) {
              setAnalystPriceHistory(a.priceHistory);
            }
            // v40 fix37: 内部人 + 新闻
            if (a.insiderTransactions) setAnalystInsider(a.insiderTransactions);
            if (a.newsList) setAnalystNews(a.newsList);
            if (a.newsSentiment) setAnalystNewsSentiment(a.newsSentiment);
            if (a.quarterlyStructure) setAnalystStructure(a.quarterlyStructure);
            const evDate = selectedEvent.date || '';
            const todayStr = new Date().toISOString().slice(0, 10);
            const evIsFuture = evDate > todayStr;
            // v10.7.9.40 fix28: stock 入口 (关注列表点代码) 智能判断
            //   - 有 upcomingEarnings 优先 (即将发布的, 最贴合"展望")
            //   - 没有就用 earnings (最近已发布)
            // earnings 入口 (财报日历):
            //   - 按 selectedEvent.date 是否未来判断
            const isStockEntry = selectedEvent.type === 'stock';
            let earnings;
            if (isStockEntry) {
              // 关注列表: 优先未来财报
              earnings = a.upcomingEarnings || a.earnings;
            } else {
              // 财报日历: 按事件日期判断
              earnings = evIsFuture && a.upcomingEarnings ? a.upcomingEarnings : a.earnings;
            }
            if (earnings) setAnalystEarnings({ ...earnings, isFuture: isStockEntry ? !!a.upcomingEarnings : evIsFuture });
            console.log('[Fundamentals]', { earnings: a.earnings, upcoming: a.upcomingEarnings, annual: a.annualSeries?.length, version: a._apiVersion });
          } else {
            console.warn('[Fundamentals] 没拿到数据:', a);
          }
        }
      } catch (e) {
        console.warn('[Fundamentals] 拉取失败:', e.message);
      } finally {
        if (!cancelled) setAnalystLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedEvent]);

  const resetAll = () => {
    // 第一次确认: 警告严重性
    if (!window.confirm(
      '⚠️ 危险操作!\n\n' +
      '此操作会清空本地所有交易记录。\n' +
      '但云端数据不会被删除, 刷新后会重新加载。\n\n' +
      '如果你真的想删除所有云端数据:\n' +
      '请前往 Supabase Dashboard 手动删除\n\n' +
      '确定要继续清空本地?'
    )) return;

    // 第二次确认: 输入关键词
    const confirm2 = window.prompt('请输入 "确认清空" 来继续:');
    if (confirm2 !== '确认清空') {
      alert('操作已取消');
      return;
    }

    setTrades([]);
    setStockTrades([]);
    setQqqHigh(640.47);
    setQqqCurrent(640.47);
    setTqqqCurrent(58.55);
    setTotalCapital(500000);
    try { localStorage.removeItem('tqqq_state'); } catch {}  // 兼容隐私模式
    alert('本地数据已清空 (云端数据保留)');
  };

  // ============ 计算逻辑 ============
  const drawdown = (qqqCurrent - qqqHigh) / qqqHigh;
  
  const getStatus = () => {
    if (drawdown >= -0.05) return { text: '🟢 等待中', color: 'bg-green-100 text-green-800', desc: '回撤<5%,空仓等待' };
    if (drawdown >= -0.10) return { text: '🟡 接近第1批', color: 'bg-yellow-100 text-yellow-800', desc: '回撤 5-10%,准备第1批' };
    if (drawdown >= -0.15) return { text: '🟠 第1批已触发', color: 'bg-orange-100 text-orange-800', desc: '可执行第1批建仓' };
    if (drawdown >= -0.20) return { text: '🔴 第2批已触发', color: 'bg-red-100 text-red-800', desc: '可执行第2批建仓' };
    return { text: '⚫ 第3批已触发', color: 'bg-gray-800 text-white', desc: '深度回撤,全仓抄底' };
  };
  const status = getStatus();

  // === 顶部市场状态卡用的"基准"计算(可切换关注列表中其他股票) ===
  // 在 watchlist 里找当前选中的基准股票
  const benchmarkStock = (() => {
    if (benchmarkSymbol === 'QQQ') {
      // QQQ 用全局的 qqqCurrent / qqqHigh(数据来自核心参数)
      return { symbol: 'QQQ', name: '纳斯达克100', price: qqqCurrent, high: qqqHigh };
    }
    return quoteRows.find(s => s.symbol === benchmarkSymbol);
  })();
  const benchmarkDrawdown = benchmarkStock && benchmarkStock.high > 0
    ? (benchmarkStock.price - benchmarkStock.high) / benchmarkStock.high
    : 0;
  const getBenchmarkStatus = (dd) => {
    if (dd >= -0.05) return { text: '🟢 等待中', desc: '回撤<5%,空仓等待' };
    if (dd >= -0.10) return { text: '🟡 接近建仓', desc: '回撤 5-10%,准备出手' };
    if (dd >= -0.15) return { text: '🟠 第1档触发', desc: '回撤 10-15%' };
    if (dd >= -0.20) return { text: '🔴 第2档触发', desc: '回撤 15-20%' };
    return { text: '⚫ 第3档触发', desc: '深度回撤 ≥20%' };
  };
  const benchmarkStatus = getBenchmarkStatus(benchmarkDrawdown);

  // 可选作为基准的股票列表(关注列表 + QQQ,排除杠杆 ETF)
  const benchmarkOptions = [
    { symbol: 'QQQ', name: '纳斯达克100' },
    ...quoteRows.filter(s => !LEVERAGED_ETFS.includes(s.symbol) && s.symbol !== 'QQQ').map(s => ({ symbol: s.symbol, name: s.name })),
  ];

  // ============ 预警等级系统 ============
  // 9 档回撤阈值,跌得越狠等级越高
  const ALERT_LEVELS = [
    { dd: -0.10, level: 1, label: '关注',     color: 'bg-yellow-100 text-yellow-800 border-yellow-300', icon: '🟡', action: '进入观察区, 可小批试探 (5-10%)' },
    { dd: -0.12, level: 2, label: '准备',     color: 'bg-amber-100 text-amber-800 border-amber-300',  icon: '🟠', action: '核对第1批资金是否就位' },
    { dd: -0.15, level: 3, label: '第1批',    color: 'bg-orange-100 text-orange-900 border-orange-400', icon: '🟠', action: '按计划执行第1批 (25%)' },
    { dd: -0.18, level: 4, label: '推进',     color: 'bg-orange-200 text-orange-900 border-orange-500', icon: '🔶', action: '按计划推进至 40-50%' },
    { dd: -0.20, level: 5, label: '第2批',    color: 'bg-red-100 text-red-800 border-red-400',         icon: '🔴', action: '按计划执行第2批 (累计 60%)' },
    { dd: -0.25, level: 6, label: '第3批',    color: 'bg-red-200 text-red-900 border-red-500',         icon: '🔴', action: '可执行第3批, 留 10-20% 应急弹药' },
    { dd: -0.30, level: 7, label: '深跌',     color: 'bg-red-500 text-white border-red-700',           icon: '⛔', action: '历史性区间, 维持率安全则可继续进攻' },
    { dd: -0.40, level: 8, label: '极端区',   color: 'bg-red-700 text-white border-red-900',           icon: '🚨', action: '大级别机会, 先核维持率, 弹药分 2-3 次打' },
    { dd: -0.50, level: 9, label: '历史极值', color: 'bg-black text-yellow-300 border-yellow-500',     icon: '💎', action: '2008/2020 级深跌, 敢买但分批, 底部无法预知' },
  ];

  // 计算每只股票的预警等级
  // 🚀 useMemo: watchlist 变化才重算 (WebSocket 时, 价格变化频繁会触发)
  const watchlistAlerts = useMemo(() => quoteRows.map(s => {
    const dd = s.high > 0 ? (s.price - s.high) / s.high : 0;
    let alert = null;
    for (let i = ALERT_LEVELS.length - 1; i >= 0; i--) {
      if (dd <= ALERT_LEVELS[i].dd) {
        alert = ALERT_LEVELS[i];
        break;
      }
    }
    return { ...s, drawdown: dd, alert };
  }), [quoteRows]);

  // 触发预警的股票(按等级降序)
  const triggeredAlerts = useMemo(() => watchlistAlerts
    .filter(s => s.alert)
    .sort((a, b) => b.alert.level - a.alert.level), [watchlistAlerts]);

  // 🔔 自动检测新预警 (v10.7.9.41): 新股票 / 等级升级 → 自动展开
  useEffect(() => {
    if (triggeredAlerts.length === 0) return;
    // 检查当前每只预警股票 vs lastSeenAlerts
    let hasNewOrUpgraded = false;
    for (const s of triggeredAlerts) {
      const prevLevel = lastSeenAlerts[s.symbol] || 0;
      if (s.alert.level > prevLevel) {
        // 新股票 (prevLevel=0) 或 等级升级 (例如 L3 → L5)
        hasNewOrUpgraded = true;
        break;
      }
    }
    if (hasNewOrUpgraded && alertsMuted) {
      // 自动展开 (用户之前折叠过, 但有新情况)
      setAlertsMuted(false);
      try { localStorage.setItem('bottomline_alerts_muted', 'false'); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggeredAlerts]);

  // ============ VIX 恐慌指数等级 ============
  const getVixSignal = () => {
    if (vix >= 35) return { 
      level: 'extreme', label: '梭哈买入', 
      color: 'bg-gradient-to-r from-red-700 to-black text-yellow-300 border-yellow-500',
      icon: '💎', desc: '历史级恐慌,反向重仓机会',
      action: '所有现金满仓,可考虑融资'
    };
    if (vix >= 30) return { 
      level: 'panic', label: '重点买入', 
      color: 'bg-red-600 text-white border-red-800',
      icon: '🚨', desc: '市场极度恐慌',
      action: '主力建仓,不要犹豫'
    };
    if (vix >= 25) return { 
      level: 'fear', label: '开始买入', 
      color: 'bg-orange-500 text-white border-orange-700',
      icon: '⚠️', desc: '恐慌区,可分批进场',
      action: '执行第1批建仓'
    };
    if (vix >= 20) return { 
      level: 'caution', label: '准备弹药', 
      color: 'bg-yellow-400 text-yellow-900 border-yellow-600',
      icon: '🟡', desc: '波动上升,可能有机会',
      action: '现金待命,准备建仓'
    };
    return { 
      level: 'calm', label: '空仓等待', 
      color: 'bg-green-100 text-green-800 border-green-300',
      icon: '🟢', desc: '市场平静,无操作',
      action: '现金放 SGOV 拿利息'
    };
  };
  const vixSignal = getVixSignal();

  // (computedBatches 已废弃 - v1 时代死代码, 新逻辑用 wavesByStock)

  // 持仓汇总(老逻辑:仅 TQQQ 全合,假设都是买入,用于止盈触发线兼容)
  const tqqqTrades = trades.filter(t => !t.symbol || t.symbol === 'TQQQ');
  const tqqqBuys = tqqqTrades.filter(t => !t.side || t.side === 'buy');
  const tqqqSells = tqqqTrades.filter(t => t.side === 'sell');
  const tqqqBuyShares = tqqqBuys.reduce((sum, t) => sum + Number(t.shares), 0);
  const tqqqSellShares = tqqqSells.reduce((sum, t) => sum + Number(t.shares), 0);
  const totalShares = Math.max(0, tqqqBuyShares - tqqqSellShares);
  const totalInvested = tqqqBuys.reduce((sum, t) => sum + Number(t.shares) * Number(t.price), 0);
  const avgCost = tqqqBuyShares > 0 ? totalInvested / tqqqBuyShares : 0;
  const currentValue = totalShares * tqqqCurrent;
  const totalPnl = currentValue - totalInvested;
  const totalPnlPct = totalInvested > 0 ? totalPnl / totalInvested : 0;

  const investmentSummary = useMemo(() => deriveInvestmentSummary({
    stockTrades,
    watchlist: quoteRows,
    cashUsd: 0,
    usdRate,
  }), [stockTrades, quoteRows, usdRate]);

  // === 持仓冷静室:把每只股票的交易切成"波段" ===
  // 规则:全部卖完算一个波段结束,下次买入开启新波段
  // 🚀 useMemo: 只依赖 trades + watchlist (价格), 其他 state 变化不重算
  const wavesByStock = useMemo(() => {
    const groups = {};
    trades.forEach(t => {
      const sym = t.symbol || 'TQQQ';
      if (!groups[sym]) groups[sym] = { symbol: sym, name: t.name || sym, trades: [] };
      groups[sym].trades.push(t);
    });

    return Object.values(groups).map(g => {
      // 按时间升序(最早的先来)
      const sorted = [...g.trades].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id - b.id));

      // 切波段:累计买入 == 累计卖出 时,该波段结束
      const waves = [];
      let currentWave = null;
      let cumBuyShares = 0;
      let cumSellShares = 0;

      for (const t of sorted) {
        const isBuy = !t.side || t.side === 'buy';
        // 没在波段中?这笔买入开启新波段
        if (!currentWave) {
          if (!isBuy) continue; // 没仓位时的卖出忽略(数据异常)
          currentWave = {
            // 🔑 波段 id 基于"开始日期+股票代码", 稳定
            // 删除非首笔交易后, 波段 id 不变 → 展开状态/备注都保留
            id: `wave-${g.symbol}-${t.date || t.id}`,
            startDate: t.date,
            endDate: null,
            buys: [],
            sells: [],
            note: '',
          };
        }

        if (isBuy) {
          currentWave.buys.push(t);
          cumBuyShares += Number(t.shares);
        } else {
          currentWave.sells.push(t);
          cumSellShares += Number(t.shares);
          // 卖完了 → 波段结束
          if (cumSellShares >= cumBuyShares && cumBuyShares > 0) {
            currentWave.endDate = t.date;
            waves.push(currentWave);
            currentWave = null;
            cumBuyShares = 0;
            cumSellShares = 0;
          }
        }
      }

      // 还在持仓的当作"进行中"波段
      if (currentWave) {
        waves.push({ ...currentWave, isActive: true });
      }

      // 给每个波段算指标
      const stockInfo = watchlist.find(s => s.symbol === g.symbol);
      const currentPrice = stockInfo?.price || 0;
      const computed = waves.map((w, idx) => {
        const totalBuyShares = w.buys.reduce((s, t) => s + Number(t.shares), 0);
        const totalBuyCost = w.buys.reduce((s, t) => s + Number(t.shares) * Number(t.price), 0);
        const avgBuyPrice = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0;
        const totalSellShares = w.sells.reduce((s, t) => s + Number(t.shares), 0);
        const totalSellRevenue = w.sells.reduce((s, t) => s + Number(t.shares) * Number(t.price), 0);
        const avgSellPrice = totalSellShares > 0 ? totalSellRevenue / totalSellShares : 0;
        const heldShares = totalBuyShares - totalSellShares;

        // 持有天数
        const startDate = new Date(w.startDate);
        const endDate = w.isActive ? new Date() : new Date(w.endDate);
        const heldDays = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));

        // 盈亏
        let gainPct, gainAmount;
        if (w.isActive) {
          // 进行中:已实现 + 浮动
          const realized = totalSellRevenue - totalSellShares * avgBuyPrice;
          const unrealized = heldShares > 0 && currentPrice > 0 ? (currentPrice - avgBuyPrice) * heldShares : 0;
          gainAmount = realized + unrealized;
          gainPct = avgBuyPrice > 0 ? gainAmount / totalBuyCost : 0;
        } else {
          // 已结束:卖出收入 - 总成本
          gainAmount = totalSellRevenue - totalBuyCost;
          gainPct = totalBuyCost > 0 ? gainAmount / totalBuyCost : 0;
        }

        return {
          ...w,
          index: idx + 1,
          totalBuyShares,
          totalBuyCost,
          avgBuyPrice,
          totalSellShares,
          totalSellRevenue,
          avgSellPrice,
          heldShares,
          heldDays,
          gainAmount,
          gainPct,
          currentPrice: w.isActive ? currentPrice : 0,
        };
      });

      // 历史规律(只算已结束的)
      const completed = computed.filter(w => !w.isActive);
      const avgHeldDays = completed.length > 0
        ? Math.round(completed.reduce((s, w) => s + w.heldDays, 0) / completed.length)
        : 0;
      const avgGainPct = completed.length > 0
        ? completed.reduce((s, w) => s + w.gainPct, 0) / completed.length
        : 0;
      const activeWave = computed.find(w => w.isActive);

      return {
        symbol: g.symbol,
        name: g.name,
        waves: computed.reverse(), // 倒序,最新的在上
        completedCount: completed.length,
        avgHeldDays,
        avgGainPct,
        activeWave,
      };
    }).filter(g => g.waves.length > 0);
  }, [trades, watchlist]);  // 🚀 只依赖 trades 和 watchlist

  // 顶部"持仓冷静室"总览 (基于 wavesByStock, 自动 memo)
  const calmRoomActiveCount = useMemo(() => wavesByStock.filter(g => g.activeWave).length, [wavesByStock]);
  const calmRoomCompletedCount = useMemo(() => wavesByStock.reduce((s, g) => s + g.completedCount, 0), [wavesByStock]);
  const calmRoomActiveDays = useMemo(() => wavesByStock
    .filter(g => g.activeWave)
    .reduce((s, g) => s + g.activeWave.heldDays, 0), [wavesByStock]);
  const calmRoomAvgActiveDays = calmRoomActiveCount > 0 ? Math.round(calmRoomActiveDays / calmRoomActiveCount) : 0;

  // 止盈线
  const computedExits = exitTargets.map(e => {
    const targetPrice = avgCost * (1 + e.gain);
    const sellShares = Math.round(totalShares * e.sellRatio);
    const cashOut = sellShares * targetPrice;
    const triggered = avgCost > 0 && tqqqCurrent >= targetPrice;
    return { ...e, targetPrice, sellShares, cashOut, triggered };
  });

  // ============ 操作函数 ============
  const updateBatch = async (id, field, value) => {
    const newBatches = batches.map(b => b.id === id ? { ...b, [field]: parseFloat(value) || 0 } : b);
    setBatches(newBatches);
    // 保存到云端 settings.batches
    try {
      await db.upsertSettings(buildSettingsPayload({
        batches: newBatches,
      }));
    } catch (e) { console.error('batch 保存失败:', e); }
  };

  const addTrade = async () => {
    if (tradeSubmittingRef.current) return;
    if (!newTrade.symbol || !newTrade.price || !newTrade.shares) {
      alert('请填写股票代码、价格和股数');
      return;
    }
    const symbol = newTrade.symbol.trim().toUpperCase();
    const sharesNum = parseInt(newTrade.shares);
    const priceNum = parseFloat(newTrade.price);
    const editingId = newTrade.id || newTrade.editingId;
    if (sharesNum <= 0 || priceNum <= 0) {
      alert('股数和价格必须大于 0');
      return;
    }
    // 名字优先级:用户填的 > 中英对照表 > 代码本身
    const stockName = displayStockName(symbol, newTrade.name);
    tradeSubmittingRef.current = true;
    setTradeSubmitting(true);

    // 波段记录入口必须写 legacy trades,不能污染主交易账本 stock_trades。
    if (tradeEntryScope === 'wave') {
      try {
        const waveTradeRecord = await db.insertTrade({
          symbol,
          name: stockName,
          side: newTrade.side || 'buy',
          date: newTrade.date,
          price: priceNum,
          shares: sharesNum,
        });
        setTrades(current => [...current, waveTradeRecord]);
      } catch (e) {
        alert('添加波段记录失败:' + e.message);
        return;
      } finally {
        tradeSubmittingRef.current = false;
        setTradeSubmitting(false);
      }

      setNewTrade({
        symbol: newTrade.symbol,
        name: newTrade.name,
        side: 'buy',
        date: new Date().toISOString().split('T')[0],
        price: '',
        shares: '',
        batch: '第1批',
      });
      setLookupStatus(newTrade.symbol === 'TQQQ' ? null : 'found');
      setShowAddTrade(false);
      return;
    }

    // 添加/更新主交易账本记录(走 stock_trades,等返回真正的 id)
    try {
      const tradePayload = {
        symbol,
        name: stockName,
        side: newTrade.side || 'buy',
        date: newTrade.date,
        price: priceNum,
        shares: sharesNum,
        fee: newTrade.fee || 0,
        currency: newTrade.currency || 'USD',
        note: newTrade.note || '',
      };
      const tradeRecord = editingId
        ? await db.updateStockTrade(editingId, tradePayload)
        : await db.insertStockTrade(tradePayload);
      setStockTrades(current => editingId
        ? current.map(t => String(t.id) === String(editingId) ? tradeRecord : t)
        : [...current, tradeRecord]);
    } catch (e) {
      alert(`${editingId ? '更新' : '添加'}交易失败:` + e.message);
      return;
    } finally {
      tradeSubmittingRef.current = false;
      setTradeSubmitting(false);
    }

    // 重置表单(保留 symbol/name,新增下一笔默认回到买入)
    setNewTrade({
      symbol: newTrade.symbol,           // 保留刚用的代码
      name: newTrade.name,                // 保留中文名
      side: 'buy',
      date: new Date().toISOString().split('T')[0],
      price: '',                          // 价格清空,等待重新输入
      shares: '',                         // 股数清空
      batch: '第1批',
    });
    setLookupStatus(newTrade.symbol === 'TQQQ' ? null : 'found'); // 已知代码默认显示已找到
    setShowAddTrade(false);
  };

  const confirmCostBasisTradeSubmit = () => {
    if (costBasisSubmittingRef.current) return;
    const symbol = String(costBasisActiveSymbol || '').trim().toUpperCase();
    const priceNum = parseFloat(costBasisNewTrade.price);
    const sharesNum = parseFloat(costBasisNewTrade.shares);
    if (!symbol) {
      alert('请先选择股票');
      return;
    }
    if (!priceNum || !sharesNum || priceNum <= 0 || sharesNum <= 0) {
      alert('请填写正确的价格和股数');
      return;
    }
    const type = costBasisNewTrade.type === 'sell' ? 'sell' : 'buy';
    const typeLabel = type === 'sell' ? '卖出' : '买入';
    showConfirm({
      title: '确认保存摊薄成本记录?',
      desc: '这笔记录只会进入摊薄成本独立小工具,不会进入正式持仓、当日订单或波段记录。',
      info: `${symbol} · ${typeLabel} ${sharesNum.toLocaleString('en-US', { maximumFractionDigits: 4 })} 股 @ ${priceNum.toFixed(2)} · ${costBasisNewTrade.date || '--'}`,
      confirmText: '确认保存',
      confirmStyle: 'primary',
      icon: '✅',
      onConfirm: async () => {
        if (costBasisSubmittingRef.current) return;
        const tradeRecord = {
          id: 'cb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          date: costBasisNewTrade.date,
          type,
          price: priceNum,
          shares: sharesNum,
        };
        costBasisSubmittingRef.current = true;
        setCostBasisSubmitting(true);
        setCostBasisData(prev => ({
          ...prev,
          [symbol]: [...(prev[symbol] || []), tradeRecord],
        }));
        try {
          await db.insertCostBasisTrade(symbol, tradeRecord);
          setCostBasisNewTrade({ type: 'buy', price: '', shares: '', date: localDateKey() });
          setShowCostBasisTrade(false);
        } catch (e) {
          setCostBasisData(prev => ({
            ...prev,
            [symbol]: (prev[symbol] || []).filter(item => item.id !== tradeRecord.id),
          }));
          alert('保存摊薄成本交易失败:' + (e.message || e));
        } finally {
          costBasisSubmittingRef.current = false;
          setCostBasisSubmitting(false);
        }
      },
    });
  };

  const deleteStockTradeRecord = async (id) => {
    try {
      await db.deleteStockTrade(id);
      setStockTrades(current => current.filter(t => String(t.id) !== String(id)));
    } catch (e) {
      alert('删除订单失败:' + e.message);
      throw e;
    }
  };

  const deleteTrade = async (id) => {
    try {
      await db.deleteTrade(id);
      setTrades(trades.filter(t => t.id !== id));
    } catch (e) {
      alert('删除失败:' + e.message);
    }
  };

  const updateStockPrice = (symbol, field, value) => {
    const newList = watchlist.map(s => s.symbol === symbol ? { ...s, [field]: parseFloat(value) || 0 } : s);
    setWatchlist(newList);
    if (symbol === 'TQQQ' && field === 'price') setTqqqCurrent(parseFloat(value) || 0);
    if (symbol === 'QQQ' && field === 'price') setQqqCurrent(parseFloat(value) || 0);
    // 防抖 useEffect 会自动保存到云端,不需要手动调 db
  };

  const reorderWatchlist = async (nextList) => {
    const normalizedList = Array.isArray(nextList)
      ? nextList.filter((item) => normalizeSymbolKey(item?.symbol))
      : [];
    const nextOrder = normalizeWatchlistOrder(normalizedList.map((item) => item?.symbol));
    const previousList = watchlist;
    const previousOrder = watchlistOrder;
    setWatchlist(normalizedList);
    setWatchlistOrder(nextOrder);
    try {
      await db.upsertSettings(buildSettingsPayload({ watchlistOrder: nextOrder }));
      return { success: true };
    } catch (e) {
      console.error('[自选排序] 云端失败:', e);
      setWatchlist(previousList);
      setWatchlistOrder(previousOrder);
      return { success: false, error: e.message || '自选排序保存失败' };
    }
  };

  const deleteWatchlistItem = async (symbolInput) => {
    const symbol = normalizeSymbolKey(symbolInput);
    if (!symbol) return { success: false, error: '股票代码无效' };
    const previousList = watchlist;
    const previousOrder = watchlistOrder;
    const previousQuoteCache = quoteCache;
    const nextList = watchlist.filter((item) => normalizeSymbolKey(item?.symbol) !== symbol);
    const nextOrder = normalizeWatchlistOrder(nextList.map((item) => item?.symbol));
    setWatchlist(nextList);
    setWatchlistOrder(nextOrder);
    const stillHeld = stockTrades.some((trade) => normalizeSymbolKey(trade?.symbol) === symbol);
    if (!stillHeld) {
      setQuoteCache((current) => current.filter((item) => normalizeSymbolKey(item?.symbol) !== symbol));
    }
    if (editingStock === symbol) setEditingStock(null);
    try {
      await db.removeWatchlistItem(symbol);
      await db.upsertSettings(buildSettingsPayload({ watchlistOrder: nextOrder }));
      return { success: true };
    } catch (e) {
      console.error('[删除股票] 云端失败:', e);
      setWatchlist(previousList);
      setWatchlistOrder(previousOrder);
      setQuoteCache(previousQuoteCache);
      return { success: false, error: e.message || `删除 ${symbol} 失败` };
    }
  };

  const addStock = async (stockDraft = null) => {
    const draft = stockDraft && typeof stockDraft === 'object'
      ? { ...newStock, ...stockDraft }
      : newStock;
    if (!draft.symbol) {
      return { success: false, error: '请填写股票代码' };
    }
    const symbol = draft.symbol.toUpperCase().trim();
    if (!symbol) {
      return { success: false, error: '请填写股票代码' };
    }
    if (watchlist.find(s => s.symbol === symbol)) {
      return { success: false, error: `${symbol} 已在自选中` };
    }
    let fresh = null;
    try {
      const r = await fetchQuote(symbol);
      const result = await r.json();
      fresh = result?.data?.find(d => d.symbol === symbol) || null;
    } catch (e) {
      console.warn(`[添加自选 ${symbol}] 行情预拉取失败:`, e.message);
    }
    const price = parseFloat(draft.price) || fresh?.price || 0;
    const high = parseFloat(draft.high) || fresh?.week52High || fresh?.high || price;
    const logoURL = normalizeExternalLogoUrl(draft.logoURL || draft.logoUrl || fresh?.logoURL || fresh?.logoUrl);
    const newItem = {
      symbol,
      name: displayStockName(symbol, draft.name || fresh?.name),
      price,
      high,
      cost: parseFloat(draft.cost) || 0,
      shares: parseInt(draft.shares) || 0,
      previousClose: fresh?.previousClose || 0,
      changePercent: fresh?.changePercent || 0,
      ytdChangePercent: fresh?.ytdChangePercent || 0,
      intraday: fresh?.intraday || [],
      ...(logoURL ? { logoURL } : {}),
    };
    // 🚨 立刻同步到云端 (不等防抖,精确单条写入)
    try {
      await db.upsertWatchlistItem(newItem);
    } catch (e) {
      console.error('[添加股票] 云端失败:', e);
      return { success: false, error: `添加 ${symbol} 失败: ${e.message}` };
    }
    const nextOrder = normalizeWatchlistOrder([
      ...watchlistOrder,
      ...watchlist.map((item) => item?.symbol),
      symbol,
    ]);
    setWatchlist(current => (
      current.some(item => String(item?.symbol || '').toUpperCase() === symbol)
        ? current
        : [...current, newItem]
    ));
    setWatchlistOrder(nextOrder);
    setQuoteCache(current => {
      const next = current.filter(item => item.symbol !== symbol);
      return [...next, newItem];
    });
    db.upsertSettings(buildSettingsPayload({ watchlistOrder: nextOrder }))
      .catch((e) => console.error('[添加股票] 自选排序保存失败:', e));
    if (logoURL) cacheStockLogo(symbol, logoURL);
    setNewStock({ symbol: '', name: '', price: '', high: '', cost: '0', shares: '0' });
    setShowAddStock(false);
    return { success: true, item: newItem };
  };

  const removeStock = (symbol) => {
    showConfirm({
      title: `删除 ${symbol}?`,
      desc: '此操作不可撤销, 该股票的关注信息将从列表中移除',
      info: symbol,
      confirmText: '删除',
      onConfirm: async () => {
        const result = await deleteWatchlistItem(symbol);
        if (!result?.success) alert(result?.error || `删除 ${symbol} 失败`);
      },
    });
  };

  const buildQuoteRowsFromCloudResult = useCallback((result) => {
    const cloudStockRows = Array.isArray(result?.stockTrades)
      ? result.stockTrades.map(localizeStockNameRow)
      : localizedStockTrades;
    const cloudWatchlistRows = Array.isArray(result?.watchlist)
      ? orderWatchlistRows(result.watchlist, normalizeWatchlistOrder(result?.settings?.watchlistOrder)).map(localizeStockNameRow)
      : localizedWatchlist;
    return buildLedgerQuoteUniverse(cloudStockRows, cloudWatchlistRows, localizedQuoteCache).allRows;
  }, [localizedQuoteCache, localizedStockTrades, localizedWatchlist]);

  // 一键拉取实时行情(从 Vercel API)
  const fetchRealtimePrices = async (rowsOverride = null) => {
    const rowsForQuote = Array.isArray(rowsOverride) ? rowsOverride : quoteRows;
    setFetching(true);
    setFetchError(null);
    try {
      // v10.7.9.41: 显式把 QQQ/TQQQ 加进请求 (走完整 stock 接口, 有真实 week52High)
      // 之前只请求 watchlist+VIX+FGI+INDICES, QQQ 数据藏在 INDICES 里但只有 dayHigh 没有 52周高
      // 导致 qqqHigh 永远停在写死的初始值 640.47, 猎手状态回撤算不准
      // Set 去重: 交易主账本、旧 watchlist、核心标的若重复不会重复请求
      const coreSymbols = ['QQQ', 'TQQQ'];
      const symbolSet = new Set([...rowsForQuote.map(s => s.symbol), ...coreSymbols]);
      const symbols = [...symbolSet, 'VIX', 'FGI', 'INDICES'].join(',');
      const r = await fetchQuote(symbols);
      const result = await r.json();
      
      if (!result.success) {
        throw new Error(result.error || '拉取失败');
      }

      // 更新股票价格
      // 行情全集写入独立 quoteCache;watchlist 只保存用户主动自选,不能被持仓股票污染。
      if (rowsForQuote.length === 0) {
        // 只更新指数/VIX/FGI, 不动股票列表
      } else {
        const updatedQuotes = rowsForQuote.map(s => {
          const fresh = result.data.find(d => d.symbol === s.symbol);
          if (fresh && fresh.price > 0) {
            // 52 周高的优先级:
            // - Yahoo (前复权) 或 EODHD-adjusted (我们自己算的复权) → 直接覆盖本地
            //   (跟主流软件一致, 解决拆股问题)
            // - Finnhub 或 fallback → 跟本地取 max
            let newHigh;
            if ((fresh.highSource === 'yahoo' || fresh.highSource === 'eodhd-adjusted') && fresh.week52High > 0) {
              // 权威数据,直接用,不跟本地比 max(避免拆股前的旧高价残留)
              newHigh = Math.max(fresh.week52High, fresh.price);
            } else {
              // Finnhub 或 fallback,保守起见跟本地取 max
              newHigh = Math.max(s.high || 0, fresh.week52High || 0, fresh.price);
            }
            return {
              ...s,
              price: fresh.price,
              high: newHigh,
              logoURL: normalizeExternalLogoUrl(fresh.logoURL || fresh.logoUrl) || s.logoURL,
              // 保存当天分时(用于心电图)
              intraday: fresh.intraday || s.intraday || [],
              // 保存昨收(用于当日涨跌色)
              previousClose: fresh.previousClose || s.previousClose || 0,
              // 保存当日涨跌
              changePercent: fresh.changePercent || 0,
              // 保存年初至今涨跌
              ytdChangePercent: fresh.ytdChangePercent || 0,
            };
          }
          return s;
        });
        setQuoteCache(updatedQuotes);
      }

      // 同步 TQQQ 和 QQQ 到核心参数
      const tqqqData = result.data.find(d => d.symbol === 'TQQQ');
      const qqqData = result.data.find(d => d.symbol === 'QQQ');
      if (tqqqData?.price > 0) setTqqqCurrent(tqqqData.price);
      if (qqqData?.price > 0) {
        setQqqCurrent(qqqData.price);
        // v10.7.9.41: QQQ 52周高直接信任 API 的 week52High (本身就是滚动52周最高)
        // 之前 Math.max(prev, 当前价) 不读 API, 导致 high 被锁死在初始值 640.47, 回撤算不准
        // 不用 Math.max(prev) 粘滞: 避免某次脏数据把 high 永久顶死降不下来
        const qqqApiHigh = qqqData.week52High || qqqData.high || 0;
        if (qqqApiHigh > 0) {
          setQqqHigh(Math.max(qqqApiHigh, qqqData.price));
        } else {
          // API 没给 high 时才退回老逻辑 (至少不低于当前价)
          setQqqHigh(prev => Math.max(prev, qqqData.price));
        }
      }

      // 更新 VIX
      const vixData = result.data.find(d => d.symbol === 'VIX');
      if (vixData?.price > 0) {
        setVix(vixData.price);
        if (vixData.dataDate) setVixDataDate(vixData.dataDate);
      }

      // 更新 FGI
      const fgiData = result.data.find(d => d.symbol === 'FGI');
      if (fgiData && typeof fgiData.price === 'number' && !fgiData.error) {
        setFgi(fgiData.price);
        if (fgiData.label) setFgiLabel(fgiData.label);
        if (fgiData.previousClose !== null) setFgiPrev(fgiData.previousClose);
        if (fgiData.weekAgo !== null) setFgiWeek(fgiData.weekAgo);
        if (fgiData.monthAgo !== null) setFgiMonth(fgiData.monthAgo);
        if (fgiData.yearAgo !== null) setFgiYear(fgiData.yearAgo);
        if (fgiData.dataDate) setFgiDataDate(fgiData.dataDate);
      }

      // 更新三大指数
      const indicesData = result.data.find(d => d.symbol === 'INDICES');
      if (indicesData?.data && Array.isArray(indicesData.data)) {
        setIndices(mergeFreshBtcTickIntoCards(indicesData.data));
      }

      setLastFetched(new Date());
    } catch (e) {
      setFetchError(e.message);
    } finally {
      setFetching(false);
    }
  };

  const runGlobalPullRefresh = async () => {
    if (globalRefreshingRef.current) return;
    globalRefreshingRef.current = true;
    if (pullRefreshResetTimerRef.current) {
      clearTimeout(pullRefreshResetTimerRef.current);
      pullRefreshResetTimerRef.current = null;
    }
    pullRefreshDistanceRef.current = PULL_REFRESH_THRESHOLD;
    setPullRefreshDistance(PULL_REFRESH_THRESHOLD);
    setPullRefreshStatus('refreshing');
    setFetchError(null);

    try {
      const cloudResult = await db.fetchAllUserData();
      applyCloudUserData(cloudResult, '[全局刷新]');
      await fetchDailyFxRates({ force: true });
      await fetchRealtimePrices(buildQuoteRowsFromCloudResult(cloudResult));
      setPullRefreshStatus('done');
    } catch (e) {
      console.error('[全局刷新] 失败:', e);
      const message = e.message || '刷新失败';
      setCloudError(message);
      setFetchError(message);
      setPullRefreshStatus('idle');
    } finally {
      globalRefreshingRef.current = false;
      pullRefreshResetTimerRef.current = setTimeout(() => {
        pullRefreshDistanceRef.current = 0;
        setPullRefreshDistance(0);
        setPullRefreshStatus('idle');
      }, 520);
    }
  };

  runGlobalPullRefreshRef.current = runGlobalPullRefresh;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let startY = 0;
    let startX = 0;
    let startTarget = null;
    let tracking = false;

    const updateDistance = (distance) => {
      pullRefreshDistanceRef.current = distance;
      setPullRefreshDistance(distance);
      setPullRefreshStatus(distance >= PULL_REFRESH_THRESHOLD ? 'ready' : 'pulling');
    };

    const resetPull = () => {
      pullRefreshDistanceRef.current = 0;
      setPullRefreshDistance(0);
      setPullRefreshStatus('idle');
    };

    const getScrollTop = () => (
      window.scrollY
      || document.documentElement?.scrollTop
      || document.body?.scrollTop
      || 0
    );

    const canStartPull = () => {
      if (globalRefreshingRef.current) return false;
      if (getScrollTop() > 0) return false;
      if (document.body.style.position === 'fixed') return false;
      const target = startTarget;
      const interactive = target?.closest?.('input, textarea, select, [contenteditable="true"]');
      return !interactive;
    };

    const handleTouchStart = (event) => {
      if (!event.touches?.length) return;
      const touch = event.touches[0];
      startY = touch.clientY;
      startX = touch.clientX;
      startTarget = event.target;
      tracking = false;
    };

    const handleTouchMove = (event) => {
      if (!event.touches?.length) return;
      const touch = event.touches[0];
      const deltaY = touch.clientY - startY;
      const deltaX = Math.abs(touch.clientX - startX);

      if (!tracking) {
        if (deltaY <= 8 || deltaY < deltaX || !canStartPull()) return;
        tracking = true;
      }

      if (deltaY <= 0) {
        resetPull();
        return;
      }

      event.preventDefault();
      updateDistance(Math.min(PULL_REFRESH_MAX_DISTANCE, deltaY * 0.48));
    };

    const handleTouchEnd = () => {
      if (!tracking) return;
      const shouldRefresh = pullRefreshDistanceRef.current >= PULL_REFRESH_THRESHOLD;
      tracking = false;
      if (shouldRefresh) {
        runGlobalPullRefreshRef.current?.();
      } else {
        resetPull();
      }
    };

    const handleTouchCancel = () => {
      tracking = false;
      if (!globalRefreshingRef.current) resetPull();
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchCancel);
      if (pullRefreshResetTimerRef.current) clearTimeout(pullRefreshResetTimerRef.current);
    };
  }, []);

  // 智能刷新: 根据市场状态动态调整刷新频率
  // - 开盘 (9:30-16:00 ET)  : 10 秒
  // - 盘前 (4:00-9:30 ET)   : 30 秒
  // - 盘后 (16:00-20:00 ET) : 30 秒
  // - 休市                  : 5 分钟
  // - 页面隐藏              : 暂停 (省电 + 省 API)
  // - 页面回来              : 立刻拉一次
  const getMarketRefreshInterval = () => {
    // 获取美东时间
    const now = new Date();
    const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etStr);
    const day = et.getDay();          // 0=周日, 6=周六
    const hour = et.getHours();
    const minute = et.getMinutes();
    const time = hour + minute / 60;  // 小数小时, 如 9.5 = 9:30

    // 周末: 休市
    if (day === 0 || day === 6) {
      return 5 * 60 * 1000; // 5 分钟
    }
    // 开盘 9:30 - 16:00
    if (time >= 9.5 && time < 16) {
      return 10 * 1000; // 10 秒
    }
    // 盘前 4:00 - 9:30
    if (time >= 4 && time < 9.5) {
      return 30 * 1000; // 30 秒
    }
    // 盘后 16:00 - 20:00
    if (time >= 16 && time < 20) {
      return 30 * 1000; // 30 秒
    }
    // 深夜/凌晨: 休市
    return 5 * 60 * 1000; // 5 分钟
  };

  const fetchBtcRestFallback = useCallback(async () => {
    const ref = btcRealtimeRef.current;
    if (ref.lastTickAt && Date.now() - ref.lastTickAt < BTC_REALTIME_STALE_MS) return;
    try {
      const r = await fetchQuote('INDICES');
      const result = await r.json();
      if (!result.success) throw new Error(result.error || 'BTC REST 兜底失败');
      const indicesData = result.data.find(d => d.symbol === 'INDICES');
      const btc = indicesData?.data?.find((item) => String(item?.ticker || '').toUpperCase() === 'BTC-USD.CC');
      if (!btc?.price) return;
      const tick = {
        type: 'btc_tick',
        symbol: 'BTC-USD',
        ticker: 'BTC-USD.CC',
        displaySymbol: 'BTCUSD',
        name: 'BTC/美元',
        price: btc.price,
        change: btc.change,
        changePercent: btc.changePercent,
        timestamp: Date.now(),
        receivedAt: Date.now(),
        source: 'EODHD',
      };
      setIndices((current) => applyBtcTickToMarketCards(current, tick, 'fallback'));
      setBtcRealtimeStatus((status) => (status === 'live' ? status : 'fallback'));
      setBtcRealtimeError(null);
    } catch (e) {
      setBtcRealtimeError(e.message || 'BTC REST 兜底失败');
    }
  }, [fetchQuote]);

  useEffect(() => {
    if (cloudLoading || typeof window === 'undefined') return;

    let stopped = false;
    const ref = btcRealtimeRef.current;

    const clearReconnectTimer = () => {
      if (ref.reconnectTimer) {
        clearTimeout(ref.reconnectTimer);
        ref.reconnectTimer = null;
      }
    };

    const closeSocket = () => {
      if (ref.socket) {
        const closingSocket = ref.socket;
        ref.intentionalCloseSocket = closingSocket;
        try {
          closingSocket.close(1000, 'client reconnect');
        } catch {}
        ref.socket = null;
      }
    };

    const scheduleReconnect = (connect) => {
      if (stopped || document.hidden) return;
      clearReconnectTimer();
      const delay = ref.retryDelayMs;
      ref.retryDelayMs = Math.min(ref.retryDelayMs * 2, BTC_REALTIME_RECONNECT_MAX_MS);
      ref.reconnectTimer = setTimeout(connect, delay);
    };

    const connect = async () => {
      if (stopped || document.hidden) return;
      clearReconnectTimer();
      closeSocket();
      setBtcRealtimeStatus((status) => (status === 'live' ? status : 'connecting'));

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setBtcRealtimeStatus('disabled');
          setBtcRealtimeError('未登录或登录已过期');
          return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(
          `${protocol}//${window.location.host}/api/btc-realtime`,
          [BTC_REALTIME_PROTOCOL, `${BTC_REALTIME_TOKEN_PROTOCOL_PREFIX}${session.access_token}`],
        );
        ref.socket = socket;

        socket.addEventListener('open', () => {
          ref.retryDelayMs = 1000;
          setBtcRealtimeStatus('connecting');
          setBtcRealtimeError(null);
        });

        socket.addEventListener('message', (event) => {
          let payload = null;
          try {
            payload = JSON.parse(event.data);
          } catch {
            return;
          }
          if (payload?.type === 'btc_tick') {
            applyBtcRealtimeTick(payload, 'live');
            return;
          }
          if (payload?.type === 'btc_status' && payload.status) {
            if (payload.status === 'live') ref.liveAt = Date.now();
            setBtcRealtimeStatus(payload.status);
            if (payload.error) setBtcRealtimeError(payload.error);
          }
        });

        socket.addEventListener('close', () => {
          if (ref.socket === socket) ref.socket = null;
          if (ref.intentionalCloseSocket === socket) {
            ref.intentionalCloseSocket = null;
            return;
          }
          if (stopped || document.hidden) return;
          setBtcRealtimeStatus((status) => (status === 'live' ? 'stale' : 'reconnecting'));
          scheduleReconnect(connect);
        });

        socket.addEventListener('error', () => {
          setBtcRealtimeError('BTC 实时连接中断,正在重连');
        });
      } catch (e) {
        setBtcRealtimeStatus('error');
        setBtcRealtimeError(e.message || 'BTC 实时连接失败');
        scheduleReconnect(connect);
      }
    };

    ref.staleTimer = setInterval(() => {
      const lastActivityAt = ref.lastTickAt || ref.liveAt;
      if (!lastActivityAt) return;
      if (Date.now() - lastActivityAt > BTC_REALTIME_STALE_MS) {
        setBtcRealtimeStatus((status) => (status === 'live' ? 'stale' : status));
      }
    }, 5000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearReconnectTimer();
        closeSocket();
        setBtcRealtimeStatus('paused');
      } else {
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    connect();

    return () => {
      stopped = true;
      clearReconnectTimer();
      if (ref.staleTimer) {
        clearInterval(ref.staleTimer);
        ref.staleTimer = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      closeSocket();
    };
  }, [cloudLoading, applyBtcRealtimeTick]);

  useEffect(() => {
    if (cloudLoading) return;
    const needsFallback = ['idle', 'disabled', 'error', 'fallback', 'paused', 'reconnecting', 'stale'].includes(btcRealtimeStatus);
    if (!needsFallback) return;

    if (!document.hidden) fetchBtcRestFallback();
    const timerId = setInterval(() => {
      if (!document.hidden) fetchBtcRestFallback();
    }, BTC_REALTIME_STALE_MS);

    return () => clearInterval(timerId);
  }, [cloudLoading, btcRealtimeStatus, fetchBtcRestFallback]);

  // 自动拉取 (智能刷新)
  // 🚨 关键: 不能在 cloudLoading=true 时拉, 否则 watchlist=[] 闭包会清空云端数据!
  // 浏览器直连 EODHD WebSocket 已移除;BTC 实时行情只连接已登录服务端 relay。
  useEffect(() => {
    if (cloudLoading) return;

    // 启动时立即拉 1 次 (拿初始数据 + 指数 + VIX/FGI)
    fetchRealtimePrices();

    console.log('[REST] 启用已登录行情接口轮询');
    let timerId = null;
    let isActive = true;

    const runFetchAndReschedule = () => {
      if (!isActive) return;
      fetchRealtimePrices();
      const interval = getMarketRefreshInterval();
      timerId = setTimeout(runFetchAndReschedule, interval);
    };

    const firstInterval = getMarketRefreshInterval();
    timerId = setTimeout(runFetchAndReschedule, firstInterval);

    // 页面可见性: 隐藏时暂停, 可见时立即拉 + 重启
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (timerId) {
          clearTimeout(timerId);
          timerId = null;
        }
      } else {
        if (isActive && !timerId) {
          fetchRealtimePrices();
          const interval = getMarketRefreshInterval();
          timerId = setTimeout(runFetchAndReschedule, interval);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isActive = false;
      if (timerId) clearTimeout(timerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudLoading, quoteRows.length]);

  // 当前激活的底部 tab
  const [activeTab, setActiveTab] = useState('home');

  // 切换 tab 时自动滚到页面顶部(像原生 App 一样)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

  // 添加交易表单:输入股票代码后 500ms 自动查询(填充中文名+当前价)
  useEffect(() => {
    if (!showAddTrade) return;
    const sym = (newTrade.symbol || '').trim().toUpperCase();
    if (sym.length < 1) {
      setLookupStatus(null);
      return;
    }

    // 1) 先从合并后的 quote cache 里看,有的话立刻填(不用网络)
    const fromWatchlist = quoteRows.find(s => s.symbol === sym);
    if (fromWatchlist) {
      setLookupStatus('found');
      setNewTrade(t => ({
        ...t,
        name: displayStockName(sym, t.name || fromWatchlist.name),
        price: t.price || (fromWatchlist.price ? fromWatchlist.price.toFixed(2) : ''),
      }));
      return;
    }

    // 2) 不在关注列表 → 500ms 防抖,从 API 拉
    setLookupStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const r = await fetchQuote(sym);
        const result = await r.json();
        const stockData = result?.data?.find(d => d.symbol === sym);
        if (stockData && stockData.price > 0) {
          setLookupStatus('found');
          setNewTrade(t => ({
            ...t,
            // 优先级:已有名 > 中英对照表 > 代码本身
            name: displayStockName(sym, t.name),
            price: t.price || stockData.price.toFixed(2),
          }));
        } else {
          setLookupStatus('notfound');
        }
      } catch (e) {
        setLookupStatus('notfound');
      }
    }, 500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newTrade.symbol, showAddTrade]);

  const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtPct = (n) => `${(n * 100).toFixed(1)}%`;


  const ActiveTab = TAB_COMPONENTS[activeTab] || HomeTab;
  const tabCtx = {
    accountDeleteConfirmId,
    accounts,
    addStock,
    addTrade,
    ALERT_LEVELS,
    AlertCircle,
    AlertTriangle,
    alertsMuted,
    batches,
    benchmarkDrawdown,
    benchmarkMenuOpen,
    benchmarkOptions,
    benchmarkStatus,
    benchmarkStock,
    benchmarkSymbol,
    BookOpen,
    browserWsAllowed,
    btcRealtimeError,
    btcRealtimeLastTick,
    btcRealtimeStatus,
    calcCostBasis,
    Calendar,
    calendarEvents,
    cacheStockLogo,
    calmRoomActiveCount,
    calmRoomAvgActiveDays,
    calmRoomCompletedCount,
    changelogExpanded,
    chartSelectedMonthIdx,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    costBasisActiveSymbol,
    costBasisData,
    db,
    deleteWatchlistItem,
    deleteStockTradeRecord,
    DisciplineModal,
    disciplines,
    displayFgi,
    Edit2,
    editingDisciplineId,
    editingLogId,
    editingNoteId,
    editingStock,
    editYearlyActualId,
    exitTargets,
    expandedDisciplines,
    expandedTrades,
    expandedWaves,
    fetchError,
    fetching,
    fetchRealtimePrices,
    fgi,
    fgiDataDate,
    fgiLabel,
    fgiMonth,
    fgiPrev,
    fgiWeek,
    fgiYear,
    fillMonth,
    filterLevel,
    fmt,
    fmtPct,
    hkdRate,
    homeWatchlist,
    indices,
    investmentSummary,
    investmentPlan,
    lastFetched,
    lastSeenAlerts,
    lastSubmitRef,
    Loader2,
    logoCache,
    LogModal,
    LogOut,
    lookupStatus,
    marginStatus,
    marketColorMode,
    newAccount,
    newPwd,
    newStock,
    newTrade,
    onLogout,
    Pin,
    Plus,
    priceFlash,
    pwdLoading,
    pwdMsg,
    RefreshCw,
    removeStock,
    reorderWatchlist,
    resetAll,
    reviewLogs,
    RotateCcw,
    setAccountDeleteConfirmId,
    setAccounts,
    setAlertsMuted,
    setAllTradesModal,
    setBenchmarkMenuOpen,
    setBenchmarkSymbol,
    setChangelogExpanded,
    setChartSelectedMonthIdx,
    setCostBasisActiveSymbol,
    setCostBasisData,
    setCostBasisNewSymbol,
    setCostBasisNewTrade,
    setDisciplines,
    setEditingDisciplineId,
    setEditingLogId,
    setEditingNoteId,
    setEditingStock,
    setEditYearlyActualId,
    setExpandedDisciplines,
    setExpandedTrades,
    setExpandedWaves,
    setFillMonth,
    setFilterLevel,
    setHkdRate,
    setInvestmentPlan,
    setLastSeenAlerts,
    setLookupStatus,
    setMarginStatus,
    setMarketColorMode,
    setNewAccount,
    setNewPwd,
    setNewStock,
    setNewTrade,
    setPwdLoading,
    setPwdMsg,
    setReviewLogs,
    setSelectedEvent,
    setShowAddAccount,
    setShowAddDiscipline,
    setShowAddLog,
    setShowAddStock,
    setShowAddTrade,
    setShowAllDisciplines,
    setShowAllLogs,
    setShowAllYears,
    setShowChangePassword,
    setShowCostBasisAdd,
    setShowCostBasisTrade,
    setTradeEntryScope,
    setShowEditMargin,
    setShowFillSnapshot,
    setShowMonthsDetail,
    setShowPlanSettings,
    setSnapshotDraft,
    setSnapshots,
    setSnapshotTab,
    setTradeDeleteConfirmId,
    setUsdRate,
    setVix,
    setVixDataDate,
    setWaveNotes,
    setWsEnabled,
    setYearlyActuals,
    showAddAccount,
    showAddDiscipline,
    showAddLog,
    showAddStock,
    showAddTrade,
    showAllDisciplines,
    showAllLogs,
    showAllYears,
    showChangePassword,
    showConfirm,
    showEditMargin,
    showFillSnapshot,
    showMonthsDetail,
    showPlanSettings,
    snapshotDraft,
    snapshots,
    snapshotTab,
    stockTrades,
    supabase,
    tradeEntryScope,
    tradeSubmitting,
    trades,
    Trash2,
    TrendingDown,
    TrendingUp,
    triggeredAlerts,
    updateStockPrice,
    usdRate,
    user,
    vix,
    VixCard,
    vixDataDate,
    vixSignal,
    watchlist,
    watchlistAlerts,
    waveNotes,
    wavesByStock,
    WifiOff,
    wsEnabled,
    wsLastTick,
    wsStatus,
    X,
    YearlyActualModal,
    yearlyActuals,
  };
  const darkShell = activeTab === 'home' || activeTab === 'trades' || activeTab === 'settings';
  const pullRefreshLabel = pullRefreshStatus === 'refreshing'
    ? '刷新中'
    : pullRefreshStatus === 'done'
      ? '已刷新'
      : pullRefreshStatus === 'ready'
        ? '松开刷新'
        : '下拉刷新';

  return (
    <div className={`min-h-screen px-4 pb-24 ${darkShell ? 'bg-[#05070b]' : 'bg-slate-50'}`} style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
      {pullRefreshStatus !== 'idle' && (
        <div
          className="pointer-events-none fixed left-1/2 z-[140] flex items-center gap-1.5 rounded-full border border-white/10 bg-[#10151d]/95 px-3 py-1.5 text-[11px] font-normal text-white/80 shadow-[0_10px_28px_rgba(0,0,0,0.35)] backdrop-blur-md transition-opacity duration-150"
          style={{
            top: 'calc(env(safe-area-inset-top) + 8px)',
            opacity: Math.min(1, 0.45 + pullRefreshDistance / PULL_REFRESH_MAX_DISTANCE),
            transform: `translate(-50%, ${Math.max(0, pullRefreshDistance - 44)}px)`,
          }}
        >
          <RefreshCw className={`h-3.5 w-3.5 text-[#f6b54b] ${pullRefreshStatus === 'refreshing' ? 'animate-spin' : ''}`} />
          <span>{pullRefreshLabel}</span>
        </div>
      )}
      {/* 🚀 火箭进度条动画 CSS */}
      <style>{`
        @keyframes rocketLaunch {
          0% { width: 0%; }
          100% { width: var(--target-width); }
        }
        .rocket-bar {
          width: var(--target-width);
          animation: rocketLaunch 1.2s cubic-bezier(0.25, 0.85, 0.25, 1) forwards;
        }
        .rocket-particle {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #fbbf24;
          box-shadow: 0 0 6px #fbbf24, 0 0 10px rgba(251, 191, 36, 0.5);
          opacity: 0;
          right: 0;
        }
        @keyframes rocketP1 {
          0% { right: 0; opacity: 1; }
          100% { right: 60px; opacity: 0; }
        }
        @keyframes rocketP2 {
          0% { right: 0; opacity: 1; }
          100% { right: 90px; opacity: 0; }
        }
        @keyframes rocketP3 {
          0% { right: 0; opacity: 1; }
          100% { right: 40px; opacity: 0; }
        }
        .rocket-particle-1 { animation: rocketP1 0.9s ease-out 0.3s forwards; }
        .rocket-particle-2 { animation: rocketP2 0.9s ease-out 0.5s forwards; }
        .rocket-particle-3 { animation: rocketP3 0.9s ease-out 0.7s forwards; }

        /* ✨ 年度进度条微光扫过效果 (PE) */
        @keyframes progressShine {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        .progress-shine { overflow: hidden; }
        .progress-shine::after {
          content: '';
          position: absolute;
          top: 0; left: 0;
          width: 20px; height: 100%;
          background: linear-gradient(90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.5) 50%,
            transparent 100%);
          animation: progressShine 2s linear infinite;
        }
      `}</style>
      <div className="max-w-5xl mx-auto">
        {/* ⚠️ 云端加载失败警告横幅 */}
        {cloudError && (
          <div className="mb-3 px-3 py-2.5 rounded-xl flex items-center gap-2"
            style={{
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              border: '1px solid #f59e0b',
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.15)',
            }}
          >
            <span className="text-lg">⚠️</span>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-black text-amber-900">
                数据未完全同步
              </div>
              <div className="text-[11px] text-amber-800 leading-tight mt-0.5">
                {cloudError}<br/>
                本地数据已保留, 可点击重试
              </div>
            </div>
            <button
              onClick={async () => {
                setCloudError(null);
                try {
                  const result = await db.fetchAllUserData();
                  applyCloudUserData(result, '[云端重试]');
                } catch (e) {
                  setCloudError(e.message || '重试失败');
                }
              }}
              className="px-3 py-1.5 rounded-lg text-[11px] font-black text-white active:scale-95 transition flex-shrink-0"
              style={{ background: '#f59e0b' }}
            >
              🔄 重试
            </button>
          </div>
        )}

        {/* ====== 首页 tab ====== */}
        <Suspense fallback={<TabFallback />}>
          <ActiveTab ctx={tabCtx} />
        </Suspense>


        {/* ====== 交易 tab ====== */}


        {/* ====== 资产 tab ====== */}


        {/* ====== 复盘 tab ====== */}


        {/* ====== 设置 tab ====== */}


        {/* === 🗑 通用删除确认 Modal (v10.7.9.41) === */}
        {confirmModal && (
          <div
            className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget && !confirmSubmitting) setConfirmModal(null); }}
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <div
              className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-md"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mt-3 mb-2 sm:hidden"></div>
              <div className="p-6">
                {/* 图标 */}
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-[24px] mx-auto mb-3"
                  style={{
                    background: confirmModal.confirmStyle === 'danger' ? '#fef2f2' : '#eff6ff',
                    color: confirmModal.confirmStyle === 'danger' ? '#dc2626' : '#2563eb',
                  }}
                >
                  {confirmModal.icon}
                </div>
                {/* 标题 */}
                <div className="text-center font-black text-[17px] text-slate-900 mb-1.5">
                  {confirmModal.title}
                </div>
                {/* 描述 */}
                <div className="text-center text-[13px] text-slate-500 mb-4 leading-relaxed">
                  {confirmModal.desc}
                </div>
                {/* 信息框 (可选) */}
                {confirmModal.info && (
                  <div
                    className="rounded-lg px-3 py-2.5 mb-4 text-[12px] text-center"
                    style={{
                      background: '#f8fafc',
                      color: '#475569',
                      fontFamily: 'ui-monospace, monospace',
                    }}
                  >
                    {confirmModal.info}
                  </div>
                )}
                {/* 按钮 */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { if (!confirmSubmitting) setConfirmModal(null); }}
                    disabled={confirmSubmitting}
                    className="py-3 rounded-xl font-bold text-[14px] active:scale-95 disabled:opacity-55 disabled:active:scale-100"
                    style={{ background: '#f1f5f9', color: '#64748b' }}
                  >
                    {confirmModal.cancelText}
                  </button>
                  <button
                    onClick={async () => {
                      if (confirmSubmittingRef.current) return;
                      const cb = confirmModal.onConfirm;
                      if (!cb) {
                        setConfirmModal(null);
                        return;
                      }
                      confirmSubmittingRef.current = true;
                      setConfirmSubmitting(true);
                      try {
                        await cb();
                        setConfirmModal(null);
                      } finally {
                        confirmSubmittingRef.current = false;
                        setConfirmSubmitting(false);
                      }
                    }}
                    disabled={confirmSubmitting}
                    className="py-3 rounded-xl font-black text-[14px] text-white active:scale-95 disabled:opacity-60 disabled:active:scale-100"
                    style={{
                      background: confirmModal.confirmStyle === 'danger' ? '#dc2626' : '#2563eb',
                    }}
                  >
                    {confirmSubmitting ? '处理中...' : confirmModal.confirmText}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === 📅 v10.7.9.41: 事件详情 Modal === */}
        {selectedEvent && (
          <div
            className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedEvent(null); }}
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <div
              className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-xl flex flex-col relative"
              style={{
                paddingBottom: 'env(safe-area-inset-bottom)',
                maxHeight: '90vh',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mt-3 mb-2 sm:hidden flex-shrink-0"></div>
              {/* v10.7.9.40 fix37: 右上角 X 关闭按钮 */}
              <button
                onClick={() => setSelectedEvent(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition z-10"
                style={{ background: '#f1f5f9', color: '#64748b' }}
                aria-label="关闭"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18"/>
                  <line x1="6" y1="18" x2="18" y2="6"/>
                </svg>
              </button>
              <div className="p-6 overflow-y-auto" style={{ flex: '1 1 auto', minHeight: 0 }}>
                {/* 图标 + 类型 (v10.7.9.41: 公司 Logo 优先, fallback 圆形渐变 $/%) */}
                <div className="text-center mb-3">
                  {/* Logo: 直接拼 EODHD CDN URL (不等 API), 加载失败 fallback 圆形 */}
                  {/* v40 fix43: 加 retry 机制 (网络抖动时不立即 fallback) */}
                  {selectedEvent.symbol && (selectedEvent.type === 'earnings' || selectedEvent.type === 'stock') ? (
                    <img
                      key={`logo-${selectedEvent.symbol}-${selectedEvent.date || ''}`}
                      data-retry="0"
                      src={analystGeneral?.logoURL || `https://eodhd.com/img/logos/US/${selectedEvent.symbol.toLowerCase()}.png`}
                      alt={selectedEvent.symbol}
                      className="mx-auto mb-3"
                      style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '16px',
                        objectFit: 'contain',
                        background: 'white',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      }}
                      onError={(e) => {
                        const retry = parseInt(e.target.dataset.retry || '0');
                        const sym = selectedEvent.symbol.toLowerCase();
                        if (retry < 2) {
                          // 重试 2 次 (不加 timestamp, EODHD CDN 不接受 query)
                          const delay = (retry + 1) * 1000;  // 1s / 2s
                          e.target.dataset.retry = String(retry + 1);
                          setTimeout(() => {
                            // 重置 src (强制浏览器重新加载)
                            const url = `https://eodhd.com/img/logos/US/${sym}.png`;
                            e.target.src = '';  // 清空
                            setTimeout(() => { e.target.src = url; }, 50);
                          }, delay);
                          return;
                        }
                        // 2 次都失败, fallback
                        e.target.style.display = 'none';
                        const fallback = e.target.nextElementSibling;
                        if (fallback) fallback.style.display = 'inline-flex';
                      }}
                    />
                  ) : null}
                  {/* Fallback 圆形 (Logo 加载失败 / FOMC / CPI / 非农) */}
                  <div className="mx-auto mb-3" style={{
                    display: ((selectedEvent.type === 'earnings' || selectedEvent.type === 'stock') && selectedEvent.symbol) ? 'none' : 'inline-flex',
                    alignItems: 'center', justifyContent: 'center',
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    fontSize: '28px',
                    fontWeight: 900,
                    background: (selectedEvent.type === 'earnings' || selectedEvent.type === 'stock') ? 'linear-gradient(135deg, #fef3c7, #fde68a)'
                      : selectedEvent.type === 'fomc' ? 'linear-gradient(135deg, #dbeafe, #bfdbfe)'
                      : selectedEvent.type === 'cpi' ? 'linear-gradient(135deg, #f3e8ff, #e9d5ff)'
                      : selectedEvent.type === 'nonfarm' ? 'linear-gradient(135deg, #cffafe, #a5f3fc)'
                      : 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
                    color: selectedEvent.type === 'earnings' ? '#d97706'
                      : selectedEvent.type === 'fomc' ? '#1e40af'
                      : selectedEvent.type === 'cpi' ? '#7c3aed'
                      : selectedEvent.type === 'nonfarm' ? '#0891b2'
                      : '#475569',
                    border: '2px solid ' + ((selectedEvent.type === 'earnings' || selectedEvent.type === 'stock') ? '#fbbf24'
                      : selectedEvent.type === 'fomc' ? '#60a5fa'
                      : selectedEvent.type === 'cpi' ? '#a78bfa'
                      : selectedEvent.type === 'nonfarm' ? '#22d3ee'
                      : '#cbd5e1'),
                  }}>
                    {(selectedEvent.type === 'earnings' || selectedEvent.type === 'stock') ? '$'
                      : selectedEvent.type === 'fomc' ? '%'
                      : selectedEvent.type === 'cpi' ? 'C'
                      : selectedEvent.type === 'nonfarm' ? 'J'
                      : '!'}
                  </div>
                  <div className="text-[14px] uppercase tracking-widest font-bold" style={{
                    color: selectedEvent.type === 'earnings' ? '#d97706'
                      : selectedEvent.type === 'fomc' ? '#1e40af'
                      : selectedEvent.type === 'cpi' ? '#7c3aed'
                      : selectedEvent.type === 'nonfarm' ? '#0891b2'
                      : '#475569',
                  }}>
                    {selectedEvent.type === 'earnings' ? '财报日'
                      : selectedEvent.type === 'stock' ? '股票详情'
                      : selectedEvent.type === 'fomc' ? '美联储议息'
                      : selectedEvent.type === 'cpi' ? '通胀数据 CPI'
                      : selectedEvent.type === 'nonfarm' ? '就业数据'
                      : '事件'}
                  </div>
                </div>
                {/* 标题 (CPI/非农 用原始 title, earnings 用 symbol) */}
                <div className="text-center font-black text-[22px] text-slate-900 mb-1">
                  {selectedEvent.type === 'cpi' ? 'CPI'
                    : selectedEvent.type === 'nonfarm' ? '非农就业'
                    : (selectedEvent.symbol || selectedEvent.title || '')}
                </div>
                {/* 日期 + 时间 + 状态 (v10.7.9.40 fix36) */}
                <div className="text-center mb-4">
                  {(() => {
                    // === 数据源 ===
                    // 关注列表入口 (stock): 优先 ANALYST.upcomingEarnings 或 latestEarnings
                    // 财报日历入口 (earnings): 用 selectedEvent 字段
                    const isStock = selectedEvent.type === 'stock';
                    const todayStr = new Date().toISOString().slice(0, 10);
                    
                    // 选择展示日期
                    let displayDate, isReleasedFlag, isUpcomingFlag;
                    if (isStock) {
                      // stock 类型: 看 analystEarnings 的 isFuture
                      if (analystEarnings?.isFuture && analystEarnings.reportDate) {
                        displayDate = analystEarnings.reportDate;
                        isUpcomingFlag = true;
                      } else if (analystEarnings?.reportDate) {
                        // 已发布最近一次
                        displayDate = analystEarnings.reportDate;
                        isReleasedFlag = true;
                      } else {
                        displayDate = null;  // 暂无近期财报
                      }
                    } else {
                      // earnings 类型: selectedEvent 已经有完整数据
                      displayDate = selectedEvent.date;
                      // 判断是否已公布: 日期 <= 今天 && epsActual 有值
                      const dateReached = selectedEvent.date && selectedEvent.date <= todayStr;
                      const hasActual = selectedEvent.epsActual != null && selectedEvent.epsActual !== 0
                                        && String(selectedEvent.epsActual).replace(/[$,\s]/g, '') !== '0';
                      isReleasedFlag = dateReached && hasActual;
                      isUpcomingFlag = !isReleasedFlag;
                    }
                    
                    if (selectedEvent.type === 'fomc') {
                      // FOMC 单独处理
                      return (
                        <div className="text-[14px] font-bold text-slate-700 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                          {selectedEvent.date} · {selectedEvent.time || '14:00 ET'}
                        </div>
                      );
                    }
                    
                    if (selectedEvent.type === 'cpi' || selectedEvent.type === 'nonfarm') {
                      return (
                        <div className="text-[14px] font-bold text-slate-700 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                          {selectedEvent.date} {selectedEvent.time ? `· ${selectedEvent.time}` : ''}
                        </div>
                      );
                    }
                    
                    // 时段中文
                    const t = (selectedEvent.time || analystEarnings?.time || '').toLowerCase();
                    let sessionText = '';
                    if (t.includes('pre') || t.includes('before')) sessionText = '盘前';
                    else if (t.includes('after') || t.includes('post')) sessionText = '盘后';
                    
                    if (!displayDate) {
                      // 无近期财报
                      return (
                        <div className="text-[13px] text-slate-400 italic">暂无近期财报</div>
                      );
                    }
                    
                    if (isReleasedFlag) {
                      // 已公布
                      return (
                        <>
                          <div className="text-[14px] font-bold text-slate-700 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                            {displayDate}{sessionText ? ` · ${sessionText}` : ''}
                          </div>
                          <div className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ background: '#ecfdf5', border: '1px solid #bbf7d0' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }}></span>
                            <span className="text-[11px] font-bold" style={{ color: '#15803d' }}>已公布</span>
                          </div>
                        </>
                      );
                    }
                    
                    if (isUpcomingFlag) {
                      // 待发布
                      const prefix = isStock ? '下次财报' : (displayDate <= todayStr ? '今日财报' : '即将公布');
                      return (
                        <>
                          <div className="text-[14px] font-bold text-slate-700 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                            {prefix}: {displayDate}{sessionText ? ` · ${sessionText}` : ''}
                          </div>
                          <div className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ background: '#fef3c7', border: '1px solid #fbbf24' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706' }}></span>
                            <span className="text-[11px] font-bold" style={{ color: '#92400e' }}>待发布</span>
                          </div>
                        </>
                      );
                    }
                    
                    return null;
                  })()}
                </div>

                {/* 详情内容 (v10.7.9.41: 完整业绩版) */}
                {(selectedEvent.type === 'earnings' || selectedEvent.type === 'stock') && (() => {
                  const stockInfo = watchlist.find(s => s.symbol === selectedEvent.symbol);
                  const isHolding = stockInfo && stockInfo.shares > 0;

                  // 工具: 清理 $/逗号 等
                  const cleanNum = (v) => {
                    if (v == null || v === '' || v === 'N/A' || v === '$N/A') return null;
                    const s = String(v).replace(/[$,()%\s]/g, '');
                    const n = parseFloat(s);
                    return isNaN(n) ? null : (String(v).includes('(') ? -n : n);  // 括号 = 负数
                  };
                  // 格式化市值
                  const fmtMarketCap = (mc) => {
                    if (!mc) return null;
                    const n = typeof mc === 'string' ? parseFloat(mc.replace(/[$,]/g, '')) : mc;
                    if (isNaN(n)) return null;
                    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
                    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
                    if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
                    return `$${n.toLocaleString()}`;
                  };
                  // 时段中文
                  const sessionCN = (() => {
                    const t = (selectedEvent.time || '').toLowerCase();
                    if (t.includes('pre') || t.includes('before')) return '盘前';
                    if (t.includes('after') || t.includes('post')) return '盘后';
                    if (t.includes('not-supplied') || t.includes('not supplied') || t === '') return '未公布';
                    return '盘中';
                  })();

                  const epsEst = cleanNum(selectedEvent.epsEstimate);
                  const epsAct = cleanNum(selectedEvent.epsActual);
                  const lastEPS = cleanNum(selectedEvent.lastYearEPS);
                  const surprise = cleanNum(selectedEvent.surprise);
                  // v10.7.9.41 修: 判断财报"已发布"必须满足:
                  //   1. 财报日 <= 今天 (日期已过或当天)
                  //   2. epsAct 不为 null 且不为 0 (EODHD 未发布时返回 0)
                  //   3. surprise 字段也不为 0
                  const todayStr = new Date().toISOString().slice(0, 10);
                  const earningsDateReached = selectedEvent.date && selectedEvent.date <= todayStr;
                  const isReleased = earningsDateReached && epsAct !== null && epsAct !== 0;
                  const beat = isReleased && epsEst !== null && epsAct > epsEst;
                  const miss = isReleased && epsEst !== null && epsAct < epsEst;
                  // 计算同比增长 (只在已发布时算)
                  const yoyEst = (epsEst !== null && lastEPS !== null && lastEPS > 0) ? ((epsEst - lastEPS) / lastEPS * 100) : null;
                  const yoyAct = (isReleased && epsAct !== null && lastEPS !== null && lastEPS > 0) ? ((epsAct - lastEPS) / lastEPS * 100) : null;
                  // 超预期 % (只在真实发布时算)
                  const surprisePct = (isReleased && surprise !== null && surprise !== 0) ? surprise
                    : (isReleased && epsEst !== null && epsAct !== null && Math.abs(epsEst) > 0) ? ((epsAct - epsEst) / Math.abs(epsEst) * 100)
                    : null;

                  return (
                    <>
                      {/* v10.7.9.41: 顶部 V4 - EPS + 营收 两行 (用 EODHD earnings) */}
                      {analystEarnings && !analystEarnings.isFuture && (() => {
                        const epsActE = analystEarnings.epsActual;
                        const epsEstE = analystEarnings.epsEstimate;
                        const revActE = analystEarnings.revenueActual;
                        const revEstE = analystEarnings.revenueEstimate;
                        const epsSurp = (epsActE != null && epsEstE != null && Math.abs(epsEstE) > 0)
                          ? ((epsActE - epsEstE) / Math.abs(epsEstE) * 100) : null;
                        const revSurp = (revActE != null && revEstE != null && revEstE > 0)
                          ? ((revActE - revEstE) / revEstE * 100) : null;
                        // 至少要有一个 surprise
                        if (epsSurp === null && revSurp === null) return null;
                        const epsBeat = epsSurp != null && epsSurp > 0;
                        const epsMiss = epsSurp != null && epsSurp < 0;
                        const revBeat = revSurp != null && revSurp > 0;
                        const revMiss = revSurp != null && revSurp < 0;
                        // 整体颜色: 看 EPS 为主
                        const overallBeat = epsBeat || revBeat;
                        const overallMiss = epsMiss || revMiss;
                        return (
                          <div
                            className="rounded-xl p-3.5 mb-3"
                            style={{
                              background: overallBeat && !overallMiss ? 'linear-gradient(135deg, #fef2f2, #fee2e2)'
                                : overallMiss && !overallBeat ? 'linear-gradient(135deg, #ecfdf5, #dcfce7)'
                                : 'linear-gradient(135deg, #fef9c3, #fef3c7)',
                              border: overallBeat && !overallMiss ? '1px solid #fecaca'
                                : overallMiss && !overallBeat ? '1px solid #bbf7d0'
                                : '1px solid #fde68a',
                            }}
                          >
                            {epsSurp !== null && (
                              <div className="flex justify-between items-center py-1">
                                <span className="text-[15px] font-bold" style={{ color: '#94a3b8' }}>
                                  EPS {epsBeat ? '超预期' : epsMiss ? '不及预期' : '持平'}
                                </span>
                                <span className="font-black tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '18px', color: epsBeat ? '#dc2626' : epsMiss ? '#16a34a' : '#475569' }}>
                                  {epsBeat ? '+' : ''}{epsSurp.toFixed(2)}%
                                </span>
                              </div>
                            )}
                            {epsSurp !== null && revSurp !== null && (
                              <div style={{ borderTop: '1px solid', borderColor: overallBeat ? '#fecaca' : overallMiss ? '#bbf7d0' : '#fde68a', margin: '4px 0' }}></div>
                            )}
                            {revSurp !== null && (
                              <div className="flex justify-between items-center py-1">
                                <span className="text-[15px] font-bold" style={{ color: '#94a3b8' }}>
                                  营收 {revBeat ? '超预期' : revMiss ? '不及预期' : '持平'}
                                </span>
                                <span className="font-black tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '18px', color: revBeat ? '#dc2626' : revMiss ? '#16a34a' : '#475569' }}>
                                  {revBeat ? '+' : ''}{revSurp.toFixed(2)}%
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* 老 EPS surprise (备用 - 用 selectedEvent 字段) */}
                      {!analystEarnings && isReleased && surprisePct !== null && (
                        <div
                          className="rounded-xl p-3 mb-3 text-center"
                          style={{
                            background: beat ? 'linear-gradient(135deg, #fef2f2, #fee2e2)' : miss ? 'linear-gradient(135deg, #ecfdf5, #dcfce7)' : '#f8fafc',
                            border: beat ? '1px solid #fecaca' : miss ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                          }}
                        >
                          <div
                            className="font-black tabular-nums"
                            style={{
                              fontFamily: 'ui-monospace, monospace',
                              fontSize: '24px',
                              color: beat ? '#dc2626' : miss ? '#16a34a' : '#475569',
                            }}
                          >
                            {beat ? '+' : ''}{surprisePct.toFixed(2)}%
                          </div>
                          <div className="text-[14px] font-bold mt-0.5" style={{ color: beat ? '#dc2626' : miss ? '#16a34a' : '#64748b' }}>
                            EPS {beat ? '超预期' : miss ? '不及预期' : '持平'}
                          </div>
                        </div>
                      )}

                      {/* 2. 业绩详情 (v10.7.9.41: V2 双卡片 - EPS + 营收 实际/预期) */}
                      {(analystEarnings || epsEst !== null || epsAct !== null) && (() => {
                        // 优先用 EODHD analystEarnings, 次选 selectedEvent
                        const e = analystEarnings;
                        const isFut = e?.isFuture;
                        const epsActE = e ? e.epsActual : (isReleased ? epsAct : null);
                        const epsEstE = e ? e.epsEstimate : epsEst;
                        const revActE = e ? e.revenueActual : null;
                        const revEstE = e ? e.revenueEstimate : null;
                        const epsSurp = (epsActE != null && epsEstE != null && Math.abs(epsEstE) > 0)
                          ? ((epsActE - epsEstE) / Math.abs(epsEstE) * 100) : null;
                        const revSurp = (revActE != null && revEstE != null && revEstE > 0)
                          ? ((revActE - revEstE) / revEstE * 100) : null;
                        const epsBeat = epsSurp != null && epsSurp > 0;
                        const epsMiss = epsSurp != null && epsSurp < 0;
                        const revBeat = revSurp != null && revSurp > 0;
                        const revMiss = revSurp != null && revSurp < 0;
                        // 格式化金额 (支持币种, 非美元加 USD 估算)
                        // v10.7.9.40 fix35: ADR 真实国家判断
                        // 优先级: HomeCategory='ADR' → addressCountry → countryName
                        const COUNTRY_TO_CURRENCY = {
                          'Taiwan': { code: 'TWD', symbol: 'NT$', rate: 0.031 },
                          'Hong Kong': { code: 'HKD', symbol: 'HK$', rate: 0.128 },
                          'China': { code: 'CNY', symbol: '¥', rate: 0.14 },
                          'Japan': { code: 'JPY', symbol: '¥', rate: 0.0066 },
                          'South Korea': { code: 'KRW', symbol: '₩', rate: 0.00075 },
                          'United Kingdom': { code: 'GBP', symbol: '£', rate: 1.27 },
                          'Germany': { code: 'EUR', symbol: '€', rate: 1.08 },
                          'France': { code: 'EUR', symbol: '€', rate: 1.08 },
                          'Italy': { code: 'EUR', symbol: '€', rate: 1.08 },
                          'Spain': { code: 'EUR', symbol: '€', rate: 1.08 },
                          'Netherlands': { code: 'EUR', symbol: '€', rate: 1.08 },
                        };
                        // ADR 真实国家映射 (硬编码 + EODHD 字段)
                        const ADR_REAL_COUNTRY = {
                          'TSM': 'Taiwan',
                          'BABA': 'China',
                          'JD': 'China',
                          'NIO': 'China',
                          'XPEV': 'China',
                          'LI': 'China',
                          'PDD': 'China',
                          'BIDU': 'China',
                          'TCEHY': 'China',
                          'TM': 'Japan',     // Toyota
                          'SONY': 'Japan',
                          'HMC': 'Japan',    // Honda
                          'TME': 'China',
                          'BILI': 'China',
                        };
                        // 优先级判断真实国家
                        const homeCategory = analystGeneral?.homeCategory;
                        const isADR = homeCategory && homeCategory.includes('ADR');
                        let realCountry = null;
                        if (isADR) {
                          // ADR: 优先硬编码 → addressCountry → countryName (但 ADR 的 countryName 是 USA, 不准)
                          realCountry = ADR_REAL_COUNTRY[selectedEvent.symbol]
                            || analystGeneral?.addressCountry
                            || analystGeneral?.countryName;
                        } else {
                          realCountry = analystGeneral?.countryName;
                        }
                        const countryFx = realCountry && COUNTRY_TO_CURRENCY[realCountry];
                        const FX_TO_USD = {
                          'USD': 1, 'TWD': 0.031, 'HKD': 0.128, 'JPY': 0.0066,
                          'EUR': 1.08, 'GBP': 1.27, 'CNY': 0.14, 'KRW': 0.00075,
                        };
                        const currencyCode = countryFx ? countryFx.code : (analystGeneral?.currencyCode || 'USD');
                        const currencySymbol = countryFx ? countryFx.symbol : (analystGeneral?.currencySymbol || '$');
                        const fxRate = countryFx ? countryFx.rate : (FX_TO_USD[currencyCode] || 1);
                        const isForeignCurrency = currencyCode !== 'USD';
                        // 单币种格式化 (不带 USD 估算)
                        const fmtCurrency = (n, sym) => {
                          if (n == null) return null;
                          const yi = n / 1e8;
                          if (Math.abs(yi) >= 10000) return `${sym}${(yi / 10000).toFixed(2)} 万亿`;
                          if (Math.abs(yi) >= 100) return `${sym}${yi.toFixed(0)} 亿`;
                          if (Math.abs(yi) >= 1) return `${sym}${yi.toFixed(1)} 亿`;
                          return `${sym}${(n / 1e6).toFixed(0)}M`;
                        };
                        // 主格式化: 返回 JSX (主大字 + USD 小字灰色)
                        // 删调试 (确认 fix35 后)
                        const fmtBig = (n) => {
                          if (n == null) return null;
                          const main = fmtCurrency(n, currencySymbol);
                          if (isForeignCurrency && fxRate) {
                            const usdVal = n * fxRate;
                            const usdStr = fmtCurrency(usdVal, '$');
                            return (
                              <>
                                {main}
                                <div className="text-[11px] text-slate-400 font-normal mt-0.5">≈ {usdStr}</div>
                              </>
                            );
                          }
                          return main;
                        };
                        const released = !isFut && (epsActE != null && epsActE !== 0);
                        return (
                          <div className="mb-3">
                            <div className="text-[14px] uppercase tracking-wider text-slate-400 font-bold mb-1.5 px-1 flex items-center justify-between">
                              <span>{released ? '📊 业绩详情' : '📊 业绩预期'}</span>
                              <span style={{ color: '#cbd5e1', fontSize: '9px', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>数据源 EODHD</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {/* EPS 卡 (v10.7.9.40 fix9: 未发布时加同比预期 %) */}
                              <div className="rounded-xl p-3 text-center" style={{
                                background: epsBeat ? 'linear-gradient(135deg, #fef2f2, #fee2e2)' : epsMiss ? 'linear-gradient(135deg, #ecfdf5, #dcfce7)' : '#f8fafc',
                                border: epsBeat ? '1px solid #fecaca' : epsMiss ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                              }}>
                                <div className="text-[14px] uppercase font-bold mb-1" style={{ color: '#94a3b8' }}>
                                  {released ? '本季 EPS' : 'EPS 预期'}
                                </div>
                                <div className="font-black tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '18px', color: epsBeat ? '#dc2626' : epsMiss ? '#16a34a' : '#0f172a' }}>
                                  {released && epsActE != null ? `$${epsActE.toFixed(2)}` : epsEstE != null ? `$${epsEstE.toFixed(2)}` : '—'}
                                </div>
                                {/* 已发布: 显示预期 */}
                                {released && epsEstE != null && (
                                  <div className="text-[14px] mt-1" style={{ color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
                                    预期 ${epsEstE.toFixed(2)}
                                  </div>
                                )}
                                {released && epsSurp != null && (
                                  <div className="text-[14px] font-bold mt-0.5" style={{ color: epsBeat ? '#dc2626' : epsMiss ? '#16a34a' : '#475569' }}>
                                    {epsBeat ? '超预期 +' : epsMiss ? '不及 ' : '持平 '}{epsSurp.toFixed(2)}%
                                  </div>
                                )}
                                {/* 未发布: 同比预期 % (vs 去年同期 EPS) */}
                                {!released && epsEstE != null && lastEPS != null && lastEPS !== 0 && (() => {
                                  const epsYoyEst = ((epsEstE - lastEPS) / Math.abs(lastEPS)) * 100;
                                  return (
                                    <div className="text-[14px] font-bold mt-1" style={{ color: epsYoyEst >= 0 ? '#dc2626' : '#16a34a', fontFamily: 'ui-monospace, monospace' }}>
                                      同比预期 {epsYoyEst >= 0 ? '+' : ''}{epsYoyEst.toFixed(2)}%
                                    </div>
                                  );
                                })()}
                                {!released && lastEPS != null && (
                                  <div className="text-[12px] mt-0.5" style={{ color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
                                    去年同期 ${lastEPS.toFixed(2)}
                                  </div>
                                )}
                              </div>
                              {/* 营收卡 (v10.7.9.40 fix9: 加高/低区间 + 同比 %) */}
                              <div className="rounded-xl p-3 text-center" style={{
                                background: revBeat ? 'linear-gradient(135deg, #fef2f2, #fee2e2)' : revMiss ? 'linear-gradient(135deg, #ecfdf5, #dcfce7)' : '#f8fafc',
                                border: revBeat ? '1px solid #fecaca' : revMiss ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                              }}>
                                <div className="text-[14px] uppercase font-bold mb-1" style={{ color: '#94a3b8' }}>
                                  {released ? '本季 营收' : '营收 预期'}
                                </div>
                                <div className="font-black tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '18px', color: revBeat ? '#dc2626' : revMiss ? '#16a34a' : '#0f172a' }}>
                                  {released && revActE ? fmtBig(revActE) : revEstE ? fmtBig(revEstE) : '—'}
                                </div>
                                {/* 已发布: 显示预期值 + 超预期% */}
                                {released && revEstE && (
                                  <div className="text-[14px] mt-1" style={{ color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
                                    预期 {fmtBig(revEstE)}
                                  </div>
                                )}
                                {released && revSurp != null && (
                                  <div className="text-[14px] font-bold mt-0.5" style={{ color: revBeat ? '#dc2626' : revMiss ? '#16a34a' : '#475569' }}>
                                    {revBeat ? '超预期 +' : revMiss ? '不及 ' : '持平 '}{revSurp.toFixed(2)}%
                                  </div>
                                )}
                                {/* 未发布: 显示同比预期 % + 高/低区间 */}
                                {!released && e?.revenueEstimateGrowth != null && (
                                  <div className="text-[14px] font-bold mt-1" style={{ color: e.revenueEstimateGrowth >= 0 ? '#dc2626' : '#16a34a', fontFamily: 'ui-monospace, monospace' }}>
                                    同比预期 {e.revenueEstimateGrowth >= 0 ? '+' : ''}{(e.revenueEstimateGrowth * 100).toFixed(2)}%
                                  </div>
                                )}
                                {!released && e?.revenueEstimateLow && e?.revenueEstimateHigh && (
                                  <div className="text-[12px] mt-0.5" style={{ color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
                                    {fmtBig(e.revenueEstimateLow)} ~ {fmtBig(e.revenueEstimateHigh)}
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* 同比对比 (已发布且有去年数据) */}
                            {released && (e?.lastYearEPS != null || e?.lastYearRevenue != null || lastEPS !== null) && (
                              <div className="bg-slate-50 rounded-xl p-3 mt-2 space-y-1.5 text-[14px]">
                                {(e?.lastYearEPS != null || lastEPS !== null) && epsActE != null && (
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">本季 EPS 同比</span>
                                    <span className={`font-bold tabular-nums ${(() => {
                                      const ly = e?.lastYearEPS ?? lastEPS;
                                      const yoy = ly && Math.abs(ly) > 0 ? ((epsActE - ly) / Math.abs(ly)) * 100 : 0;
                                      return yoy >= 0 ? 'text-rose-600' : 'text-emerald-600';
                                    })()}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                                      {(() => {
                                        const ly = e?.lastYearEPS ?? lastEPS;
                                        if (!ly || Math.abs(ly) === 0) return '—';
                                        const yoy = ((epsActE - ly) / Math.abs(ly)) * 100;
                                        return `${yoy >= 0 ? '+' : ''}${yoy.toFixed(2)}%`;
                                      })()}
                                    </span>
                                  </div>
                                )}
                                {e?.lastYearRevenue != null && revActE != null && e.lastYearRevenue > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">本季营收同比</span>
                                    <span className={`font-bold tabular-nums ${revActE > e.lastYearRevenue ? 'text-rose-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                                      {revActE > e.lastYearRevenue ? '+' : ''}{(((revActE - e.lastYearRevenue) / e.lastYearRevenue) * 100).toFixed(2)}%
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* 2.5 财务结构图 (v10.7.9.40 fix42, V4 三卡 + 漏斗) */}
                      {analystStructure && (() => {
                        const s = analystStructure;
                        if (!s.totalRevenue) return null;
                        // 季度标识
                        const dateStr = s.date || '';
                        const year = dateStr.slice(0, 4);
                        const month = parseInt(dateStr.slice(5, 7));
                        const quarter = month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : month <= 9 ? 'Q3' : 'Q4';
                        const quarterLabel = `${quarter} ${year}`;
                        // 判断是否本季已公布 (财报日期 7 天内 = 本季新出)
                        const todayMs = new Date().getTime();
                        const reportMs = new Date(dateStr).getTime();
                        const daysSince = (todayMs - reportMs) / (24 * 60 * 60 * 1000);
                        const isFresh = daysSince <= 90;  // 90 天内算"本季"
                        // 币种 (用 analystGeneral 一样逻辑)
                        const COUNTRY_FX2 = {
                          'Taiwan': { symbol: 'NT$', rate: 0.031 },
                          'Hong Kong': { symbol: 'HK$', rate: 0.128 },
                          'China': { symbol: '¥', rate: 0.14 },
                          'Japan': { symbol: '¥', rate: 0.0066 },
                        };
                        const ADR_MAP2 = { 'TSM': 'Taiwan', 'BABA': 'China', 'JD': 'China', 'NIO': 'China', 'XPEV': 'China', 'LI': 'China', 'PDD': 'China', 'BIDU': 'China', 'TCEHY': 'China', 'TM': 'Japan', 'SONY': 'Japan', 'HMC': 'Japan', 'TME': 'China', 'BILI': 'China' };
                        const isADR2 = analystGeneral?.homeCategory?.includes('ADR');
                        const realCountry2 = isADR2 ? (ADR_MAP2[selectedEvent.symbol] || analystGeneral?.addressCountry) : analystGeneral?.countryName;
                        const cf2 = realCountry2 && COUNTRY_FX2[realCountry2];
                        const sym2 = cf2 ? cf2.symbol : '$';
                        const rate2 = cf2 ? cf2.rate : 1;
                        const isForeign2 = !!cf2;
                        const fmtMoney2 = (n) => {
                          if (n == null) return '—';
                          const yi = n / 1e8;
                          let str;
                          if (Math.abs(yi) >= 10000) str = `${sym2}${(yi / 10000).toFixed(2)} 万亿`;
                          else if (Math.abs(yi) >= 1) str = `${sym2}${yi.toFixed(yi >= 100 ? 0 : 1)} 亿`;
                          else str = `${sym2}${(n / 1e6).toFixed(0)}M`;
                          return str;
                        };
                        // 计算各项占比
                        const pct = (n) => s.totalRevenue && n != null ? (n / s.totalRevenue * 100) : null;
                        const grossMargin = pct(s.grossProfit);
                        const opMargin = pct(s.operatingIncome);
                        const netMargin = pct(s.netIncome);
                        const costPct = pct(s.costOfRevenue);
                        const rdPct = pct(s.researchDevelopment);
                        const sgaPct = pct(s.sellingGeneralAdministrative);
                        return (
                          <div className="mb-3">
                            <div className="text-[14px] uppercase tracking-wider text-slate-400 font-bold mb-1.5 px-1 flex items-center justify-between">
                              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>📊 财务结构</span>
                                <span className="px-2 py-0.5 rounded-full" style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  textTransform: 'none',
                                  letterSpacing: 0,
                                  background: isFresh ? '#ecfdf5' : '#f1f5f9',
                                  color: isFresh ? '#16a34a' : '#475569',
                                  border: isFresh ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                                }}>
                                  {quarterLabel} · {isFresh ? '本季已公布' : '最新已公布'}
                                </span>
                              </span>
                              <span style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>EODHD</span>
                            </div>
                            
                            {/* 三利润率卡 */}
                            {(grossMargin !== null || opMargin !== null || netMargin !== null) && (
                              <div className="grid grid-cols-3 gap-2 mb-2">
                                {grossMargin !== null && (
                                  <div className="rounded-lg p-2.5 text-center" style={{ background: 'linear-gradient(135deg, #fef3c7, #fde68a)', border: '1px solid #fbbf24' }}>
                                    <div className="font-bold uppercase mb-1" style={{ fontSize: '9px', color: '#92400e' }}>毛利率</div>
                                    <div className="font-black tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '17px', color: '#d97706' }}>
                                      {grossMargin.toFixed(1)}%
                                    </div>
                                    <div className="mt-0.5" style={{ fontSize: '9px', color: '#475569' }}>
                                      {fmtMoney2(s.grossProfit)}
                                    </div>
                                  </div>
                                )}
                                {opMargin !== null && (
                                  <div className="rounded-lg p-2.5 text-center" style={{ background: 'linear-gradient(135deg, #fef9c3, #fde047)', border: '1px solid #facc15' }}>
                                    <div className="font-bold uppercase mb-1" style={{ fontSize: '9px', color: '#854d0e' }}>营业利润率</div>
                                    <div className="font-black tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '17px', color: '#ca8a04' }}>
                                      {opMargin.toFixed(1)}%
                                    </div>
                                    <div className="mt-0.5" style={{ fontSize: '9px', color: '#475569' }}>
                                      {fmtMoney2(s.operatingIncome)}
                                    </div>
                                  </div>
                                )}
                                {netMargin !== null && (
                                  <div className="rounded-lg p-2.5 text-center" style={{ background: 'linear-gradient(135deg, #fef2f2, #fee2e2)', border: '1px solid #fecaca' }}>
                                    <div className="font-bold uppercase mb-1" style={{ fontSize: '9px', color: '#991b1b' }}>净利率</div>
                                    <div className="font-black tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '17px', color: '#dc2626' }}>
                                      {netMargin.toFixed(1)}%
                                    </div>
                                    <div className="mt-0.5" style={{ fontSize: '9px', color: '#475569' }}>
                                      {fmtMoney2(s.netIncome)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* 漏斗 */}
                            <div className="bg-slate-50 rounded-xl p-3">
                              <div className="grid items-center mb-1.5" style={{ gridTemplateColumns: '70px 1fr auto', gap: '8px', fontSize: '12px' }}>
                                <div>
                                  <div className="font-bold text-slate-900">营收</div>
                                </div>
                                <div className="rounded overflow-hidden" style={{ height: '22px', background: '#f1f5f9' }}>
                                  <div style={{ height: '100%', width: '100%', background: 'linear-gradient(90deg, #1e40af, #2563eb)', display: 'flex', alignItems: 'center', padding: '0 8px', color: 'white', fontWeight: 900, fontSize: '11px', fontFamily: 'ui-monospace, monospace' }}>
                                    {fmtMoney2(s.totalRevenue)}
                                  </div>
                                </div>
                                <span className="font-bold tabular-nums text-slate-500" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px' }}>100%</span>
                              </div>
                              {costPct !== null && (
                                <div className="grid items-center mb-1.5" style={{ gridTemplateColumns: '70px 1fr auto', gap: '8px', fontSize: '12px' }}>
                                  <div>
                                    <div className="font-bold text-slate-900">- 营业成本</div>
                                    <div className="text-[10px] text-slate-400">{fmtMoney2(s.costOfRevenue)}</div>
                                  </div>
                                  <div className="rounded overflow-hidden" style={{ height: '22px', background: '#f1f5f9' }}>
                                    <div style={{ height: '100%', width: `${Math.min(costPct, 100)}%`, background: '#94a3b8', display: 'flex', alignItems: 'center', padding: '0 8px', color: 'white', fontWeight: 900, fontSize: '11px', fontFamily: 'ui-monospace, monospace' }}>
                                      {costPct.toFixed(1)}%
                                    </div>
                                  </div>
                                  <span className="font-bold tabular-nums text-slate-500" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px' }}>{costPct.toFixed(1)}%</span>
                                </div>
                              )}
                              {rdPct !== null && (
                                <div className="grid items-center mb-1.5" style={{ gridTemplateColumns: '70px 1fr auto', gap: '8px', fontSize: '12px' }}>
                                  <div>
                                    <div className="font-bold text-slate-900">- 研发</div>
                                    <div className="text-[10px] text-slate-400">{fmtMoney2(s.researchDevelopment)}</div>
                                  </div>
                                  <div className="rounded overflow-hidden" style={{ height: '22px', background: '#f1f5f9' }}>
                                    <div style={{ height: '100%', width: `${Math.min(rdPct, 100)}%`, background: '#f59e0b', display: 'flex', alignItems: 'center', padding: '0 8px', color: 'white', fontWeight: 900, fontSize: '11px', fontFamily: 'ui-monospace, monospace' }}>
                                      {rdPct.toFixed(1)}%
                                    </div>
                                  </div>
                                  <span className="font-bold tabular-nums text-slate-500" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px' }}>{rdPct.toFixed(1)}%</span>
                                </div>
                              )}
                              {sgaPct !== null && (
                                <div className="grid items-center mb-1.5" style={{ gridTemplateColumns: '70px 1fr auto', gap: '8px', fontSize: '12px' }}>
                                  <div>
                                    <div className="font-bold text-slate-900">- 销管费</div>
                                    <div className="text-[10px] text-slate-400">{fmtMoney2(s.sellingGeneralAdministrative)}</div>
                                  </div>
                                  <div className="rounded overflow-hidden" style={{ height: '22px', background: '#f1f5f9' }}>
                                    <div style={{ height: '100%', width: `${Math.min(sgaPct, 100)}%`, background: '#facc15', display: 'flex', alignItems: 'center', padding: '0 8px', color: 'white', fontWeight: 900, fontSize: '11px', fontFamily: 'ui-monospace, monospace' }}>
                                      {sgaPct.toFixed(1)}%
                                    </div>
                                  </div>
                                  <span className="font-bold tabular-nums text-slate-500" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px' }}>{sgaPct.toFixed(1)}%</span>
                                </div>
                              )}
                              {netMargin !== null && (
                                <>
                                  <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '4px', paddingTop: '6px' }}></div>
                                  <div className="grid items-center" style={{ gridTemplateColumns: '70px 1fr auto', gap: '8px', fontSize: '12px' }}>
                                    <div>
                                      <div className="font-bold" style={{ color: '#dc2626' }}>= 净利润</div>
                                      <div className="text-[10px]" style={{ color: '#dc2626' }}>{fmtMoney2(s.netIncome)}</div>
                                    </div>
                                    <div className="rounded overflow-hidden" style={{ height: '22px', background: '#f1f5f9' }}>
                                      <div style={{ height: '100%', width: `${Math.min(netMargin, 100)}%`, background: 'linear-gradient(90deg, #dc2626, #ef4444)', display: 'flex', alignItems: 'center', padding: '0 8px', color: 'white', fontWeight: 900, fontSize: '11px', fontFamily: 'ui-monospace, monospace' }}>
                                        {netMargin.toFixed(1)}%
                                      </div>
                                    </div>
                                    <span className="font-black tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px', color: '#dc2626' }}>{netMargin.toFixed(1)}%</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* 3. 持仓 */}
                      {isHolding && (
                        <div className="mb-3">
                          <div className="text-[14px] uppercase tracking-wider text-slate-400 font-bold mb-1.5 px-1">💼 你的持仓</div>
                          <div className="bg-slate-50 rounded-xl p-3 text-[14px]">
                            <div className="flex justify-between">
                              <span className="text-slate-500">持仓股数</span>
                              <span className="font-bold text-rose-600 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                {stockInfo.shares} 股
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 4. 分析师评级 (v10.7.9.40 fix23, V1 完整版: 走势图 + 喇叭口) */}
                      {(() => {
                        if (analystLoading) {
                          return (
                            <div className="mb-3">
                              <div className="text-[14px] uppercase tracking-wider text-slate-400 font-bold mb-1.5 px-1">📊 分析师评级</div>
                              <div className="bg-slate-50 rounded-xl p-4 text-center text-[14px] text-slate-400">
                                加载中…
                              </div>
                            </div>
                          );
                        }
                        if (!analystTargets) return null;
                        const cleanNum = (v) => {
                          if (v == null || v === '' || v === 'N/A') return null;
                          const s = String(v).replace(/[$,\s]/g, '');
                          const n = parseFloat(s);
                          return isNaN(n) ? null : n;
                        };
                        const high = cleanNum(analystTargets.high);
                        const low = cleanNum(analystTargets.low);
                        const avg = cleanNum(analystTargets.average);
                        const watchStock = watchlist.find(w => w.symbol === selectedEvent.symbol);
                        const last = watchStock?.price || cleanNum(analystTargets.lastTrade);
                        if (avg === null) return null;
                        const upPct = (last !== null && avg > 0) ? ((avg - last) / last) * 100 : null;
                        // 评级中文化
                        const ratingMap = {
                          'STRONG BUY': { cn: '强烈买入', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
                          'BUY': { cn: '买入', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
                          'HOLD': { cn: '持有', bg: '#f8fafc', color: '#475569', border: '#cbd5e1' },
                          'SELL': { cn: '卖出', bg: '#ecfdf5', color: '#16a34a', border: '#bbf7d0' },
                          'STRONG SELL': { cn: '强烈卖出', bg: '#ecfdf5', color: '#16a34a', border: '#bbf7d0' },
                        };
                        const rating = ratingMap[String(analystTargets.rating || '').toUpperCase()] || null;
                        // 历史价格走势图数据
                        const history = analystPriceHistory || [];
                        const hasChart = history.length > 5 && last && high && low;
                        // SVG 走势图
                        const W = 360, H = 200;
                        const cx = W / 2;  // 现价 X 位置 (中点)
                        let pathPoints = [];
                        if (hasChart) {
                          const closes = history.map(d => d.close);
                          const allPrices = [...closes, last, high, low];
                          const minP = Math.min(...allPrices) * 0.95;
                          const maxP = Math.max(...allPrices) * 1.05;
                          const yRange = maxP - minP;
                          const yScale = (p) => 170 - ((p - minP) / yRange) * 150;
                          // 历史折线 (左半边: x=10 → cx)
                          const xStep = (cx - 10) / (history.length - 1);
                          pathPoints = history.map((d, i) => ({ x: 10 + i * xStep, y: yScale(d.close) }));
                          var currentY = yScale(last);
                          var highY = yScale(high);
                          var lowY = yScale(low);
                          var avgY = yScale(avg);
                        }

                        return (
                          <div className="mb-3">
                            {/* 顶部: 标题 + 评级胶囊 */}
                            <div className="flex items-center justify-between mb-3 px-1">
                              <div>
                                <div className="font-black text-[18px] text-slate-900">分析师评级</div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  {analystTargets.numAnalysts ? `${analystTargets.numAnalysts} 位分析师综合` : '综合评级'}
                                </div>
                              </div>
                              {rating && (
                                <span className="px-3 py-1.5 rounded-full text-[12px] font-black uppercase" style={{
                                  background: rating.bg, color: rating.color, border: `1px solid ${rating.border}`,
                                  letterSpacing: '0.5px',
                                }}>
                                  {rating.cn}
                                </span>
                              )}
                            </div>

                            {/* 走势图 + 喇叭口预测 */}
                            {hasChart && (
                              <div className="bg-slate-50 rounded-xl p-3 mb-2">
                                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 200 }}>
                                  <defs>
                                    <linearGradient id={`flare-${selectedEvent.symbol}`} x1="0%" y1="0%" x2="100%" y2="0%">
                                      <stop offset="0%" stopColor="rgba(252,165,165,0.4)"/>
                                      <stop offset="100%" stopColor="rgba(254,202,202,0.6)"/>
                                    </linearGradient>
                                  </defs>
                                  {/* 中线 */}
                                  <line x1={cx} y1="20" x2={cx} y2="170" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3,3"/>
                                  {/* 喇叭口 */}
                                  <path d={`M ${cx} ${currentY} L 350 ${highY} L 350 ${lowY} Z`} fill={`url(#flare-${selectedEvent.symbol})`}/>
                                  {/* 历史折线 */}
                                  <polyline
                                    points={pathPoints.map(p => `${p.x},${p.y}`).join(' ')}
                                    fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                  />
                                  {/* 平均预测虚线 */}
                                  <line x1={cx} y1={currentY} x2={350} y2={avgY} stroke="#94a3b8" strokeWidth="2" strokeDasharray="6,3"/>
                                  {/* 现价点 */}
                                  <circle cx={cx} cy={currentY} r="6" fill="#3b82f6" stroke="white" strokeWidth="2.5"/>
                                  {/* 现价标签 */}
                                  <rect x={cx - 32} y={currentY - 28} width="64" height="22" rx="6" fill="white" stroke="#3b82f6" strokeWidth="1.5"/>
                                  <text x={cx} y={currentY - 13} textAnchor="middle" fontSize="12" fontWeight="900" fill="#0f172a" fontFamily="ui-monospace, monospace">${last.toFixed(2)}</text>
                                  {/* 高/平均/低 标签 */}
                                  <text x="332.5" y={highY - 8} textAnchor="middle" fontSize="9" fill="#94a3b8" fontWeight="600">最高</text>
                                  <rect x="305" y={highY - 4} width="55" height="22" rx="6" fill="#dc2626"/>
                                  <text x="332.5" y={highY + 11} textAnchor="middle" fontSize="11" fontWeight="900" fill="white" fontFamily="ui-monospace, monospace">${Math.round(high)}</text>
                                  <text x="332.5" y={avgY - 8} textAnchor="middle" fontSize="9" fill="#d97706" fontWeight="700">平均 ⭐</text>
                                  <rect x="305" y={avgY - 4} width="55" height="22" rx="6" fill="#0f172a"/>
                                  <text x="332.5" y={avgY + 11} textAnchor="middle" fontSize="11" fontWeight="900" fill="white" fontFamily="ui-monospace, monospace">${Math.round(avg)}</text>
                                  <rect x="305" y={lowY - 4} width="55" height="22" rx="6" fill="#dc2626"/>
                                  <text x="332.5" y={lowY + 11} textAnchor="middle" fontSize="11" fontWeight="900" fill="white" fontFamily="ui-monospace, monospace">${Math.round(low)}</text>
                                  <text x="332.5" y={lowY + 30} textAnchor="middle" fontSize="9" fill="#94a3b8" fontWeight="600">最低</text>
                                  {/* 时间轴 */}
                                  <text x="10" y="195" fontSize="9" fill="#94a3b8" fontFamily="ui-monospace, monospace">过去 1 年</text>
                                  <text x={cx} y="195" textAnchor="middle" fontSize="9" fill="#0f172a" fontWeight="900" fontFamily="ui-monospace, monospace">今天</text>
                                  <text x="350" y="195" textAnchor="end" fontSize="9" fill="#dc2626" fontWeight="900" fontFamily="ui-monospace, monospace">未来 1 年预测</text>
                                </svg>
                              </div>
                            )}

                            {/* 关键数字双卡 */}
                            <div className="grid grid-cols-2 gap-2 mb-2">
                              <div className="rounded-xl p-3 text-center" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                <div className="text-[11px] text-slate-400 uppercase font-bold">现价</div>
                                {last && (
                                  <div className="font-black tabular-nums mt-1" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '18px', color: '#0f172a' }}>
                                    ${last.toFixed(2)}
                                  </div>
                                )}
                              </div>
                              <div className="rounded-xl p-3 text-center" style={{ background: 'linear-gradient(135deg, #fef3c7, #fde68a)', border: '1px solid #fbbf24' }}>
                                <div className="text-[11px] uppercase font-bold" style={{ color: '#92400e' }}>平均目标价</div>
                                <div className="font-black tabular-nums mt-1" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '18px', color: '#d97706' }}>
                                  ${avg.toFixed(2)}
                                </div>
                                {upPct !== null && (
                                  <div className="font-bold tabular-nums mt-0.5" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px', color: upPct >= 0 ? '#dc2626' : '#16a34a' }}>
                                    {upPct >= 0 ? '↑ +' : '↓ '}{upPct.toFixed(2)}%
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* 评级分布柱状图 */}
                            {analystTargets.numAnalysts > 0 && (() => {
                              const total = analystTargets.numAnalysts;
                              const items = [
                                { label: '强烈买入', count: analystTargets.strongBuy, color: '#dc2626', bg: 'linear-gradient(90deg, #dc2626, #b91c1c)' },
                                { label: '买入', count: analystTargets.buy, color: '#f87171', bg: 'linear-gradient(90deg, #f87171, #ef4444)' },
                                { label: '持有', count: analystTargets.hold, color: '#475569', bg: '#94a3b8' },
                                { label: '卖出', count: analystTargets.sell, color: '#86efac', bg: 'linear-gradient(90deg, #86efac, #4ade80)' },
                                { label: '强烈卖出', count: analystTargets.strongSell, color: '#16a34a', bg: 'linear-gradient(90deg, #4ade80, #16a34a)' },
                              ];
                              return (
                                <div className="rounded-xl p-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                  <div className="text-[11px] text-slate-400 uppercase font-bold mb-2 flex justify-between">
                                    <span>📊 评级分布</span>
                                    <span style={{ color: '#cbd5e1', textTransform: 'none', letterSpacing: 0 }}>数据源 EODHD</span>
                                  </div>
                                  {items.map((it, idx) => {
                                    const pct = total > 0 ? (it.count / total) * 100 : 0;
                                    const isZero = it.count === 0;
                                    return (
                                      <div key={idx} className="grid items-center mb-1.5" style={{ gridTemplateColumns: '60px 1fr 30px', gap: '10px' }}>
                                        <span className="text-[12px] font-bold" style={{ color: isZero ? '#cbd5e1' : it.color }}>{it.label}</span>
                                        <div className="rounded-full overflow-hidden" style={{ height: '14px', background: '#f1f5f9' }}>
                                          {!isZero && (
                                            <div style={{ height: '100%', width: `${pct}%`, background: it.bg, borderRadius: '7px' }}></div>
                                          )}
                                        </div>
                                        <span className="text-[12px] font-black tabular-nums text-right" style={{ fontFamily: 'ui-monospace, monospace', color: isZero ? '#cbd5e1' : it.color }}>{it.count}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()}

                      {/* 5. 10 年年度业绩柱状图 (v10.7.9.40 fix21, 替代公司基本面) */}
                      {analystAnnual && analystAnnual.length > 0 && (() => {
                        const series = analystAnnual;
                        const values = series.map(d => d[chartMetric]).filter(v => v != null);
                        if (values.length === 0) return null;
                        const maxV = Math.max(...values);
                        const minV = Math.min(...values, 0);
                        const range = maxV - minV;
                        const W = 320, H = 130;
                        const barW = (W - 20) / series.length - 4;
                        const selected = series.find(s => s.year === chartSelectedYear) || series[series.length - 1];
                        const selectedIdx = series.indexOf(selected);
                        const prevSelected = selectedIdx > 0 ? series[selectedIdx - 1] : null;
                        const yoy = (cur, prev) => (cur != null && prev != null && prev !== 0) ? ((cur - prev) / Math.abs(prev) * 100) : null;
                        const fmtMoney = (n) => {
                          if (n == null) return "—";
                          // v10.7.9.40 fix35: ADR 真实国家
                          const COUNTRY_FX = {
                            'Taiwan': { symbol: 'NT$', rate: 0.031 },
                            'Hong Kong': { symbol: 'HK$', rate: 0.128 },
                            'China': { symbol: '¥', rate: 0.14 },
                            'Japan': { symbol: '¥', rate: 0.0066 },
                            'South Korea': { symbol: '₩', rate: 0.00075 },
                            'United Kingdom': { symbol: '£', rate: 1.27 },
                            'Germany': { symbol: '€', rate: 1.08 },
                            'France': { symbol: '€', rate: 1.08 },
                          };
                          const ADR_MAP = {
                            'TSM': 'Taiwan', 'BABA': 'China', 'JD': 'China', 'NIO': 'China',
                            'XPEV': 'China', 'LI': 'China', 'PDD': 'China', 'BIDU': 'China',
                            'TCEHY': 'China', 'TM': 'Japan', 'SONY': 'Japan', 'HMC': 'Japan',
                            'TME': 'China', 'BILI': 'China',
                          };
                          const sym = selectedEvent.symbol;
                          const isADR = analystGeneral?.homeCategory?.includes('ADR');
                          const realCountry = isADR ? (ADR_MAP[sym] || analystGeneral?.addressCountry || analystGeneral?.countryName) : analystGeneral?.countryName;
                          const cf = realCountry && COUNTRY_FX[realCountry];
                          const cs = cf ? cf.symbol : (analystGeneral?.currencySymbol || '$');
                          const rate = cf ? cf.rate : 1;
                          const isForeign = !!cf;
                          const fmt = (val, s) => {
                            const yi = val / 1e8;
                            if (Math.abs(yi) >= 10000) return `${s}${(yi / 10000).toFixed(2)} 万亿`;
                            if (Math.abs(yi) >= 1) return `${s}${yi.toFixed(yi >= 100 ? 0 : 1)} 亿`;
                            return `${s}${(val / 1e6).toFixed(0)}M`;
                          };
                          const main = fmt(n, cs);
                          if (isForeign) {
                            const usdStr = fmt(n * rate, '$');
                            return `${main}\n(≈ ${usdStr})`;
                          }
                          return main;
                        };
                        return (
                          <div className="mb-3">
                            <div className="text-[14px] uppercase tracking-wider text-slate-400 font-bold mb-1.5 px-1 flex items-center justify-between">
                              <span>📈 {series.length} 年业绩</span>
                              <span style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
                                点柱看详情 · 数据源 EODHD
                              </span>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-3">
                              <div className="flex gap-2 justify-center mb-3">
                                {[
                                  { k: 'revenue', label: '营收' },
                                  { k: 'netIncome', label: '净利润' },
                                  { k: 'epsActual', label: 'EPS' },
                                ].map(t => (
                                  <button
                                    key={t.k}
                                    onClick={() => setChartMetric(t.k)}
                                    className="px-3 py-1 rounded-full text-[12px] font-bold active:scale-95"
                                    style={{
                                      background: chartMetric === t.k ? '#0f172a' : 'white',
                                      color: chartMetric === t.k ? 'white' : '#64748b',
                                      border: '1px solid #e2e8f0',
                                    }}
                                  >
                                    {t.label}
                                  </button>
                                ))}
                              </div>
                              <svg viewBox={`0 0 ${W} ${H + 18}`} preserveAspectRatio="none" style={{ width: '100%', height: 150 }}>
                                {series.map((d, i) => {
                                  const v = d[chartMetric];
                                  if (v == null) return null;
                                  const x = 10 + i * (barW + 4);
                                  const h = range > 0 ? ((v - minV) / range) * (H - 20) : 0;
                                  const y = H - 10 - h;
                                  const isSelected = d.year === chartSelectedYear;
                                  return (
                                    <g key={d.year} onClick={() => setChartSelectedYear(d.year)} style={{ cursor: 'pointer' }}>
                                      <rect
                                        x={x} y={y} width={barW} height={Math.max(h, 1)}
                                        rx={2}
                                        fill={isSelected ? '#d97706' : (v >= 0 ? '#fbbf24' : '#94a3b8')}
                                        opacity={isSelected ? 1 : 0.85}
                                      />
                                      <text x={x + barW / 2} y={H + 8}
                                        textAnchor="middle"
                                        fontSize="9"
                                        fontFamily="ui-monospace, monospace"
                                        fontWeight={isSelected ? 900 : 500}
                                        fill={isSelected ? '#d97706' : '#94a3b8'}
                                      >
                                        {d.year.slice(-2)}
                                      </text>
                                    </g>
                                  );
                                })}
                              </svg>
                              {selected && (
                                <div className="rounded-lg p-3 mt-2" style={{ background: 'linear-gradient(135deg, #fef3c7, #fde68a)', border: '1px solid #fbbf24' }}>
                                  <div className="text-center font-bold mb-2" style={{ color: '#92400e', fontSize: '13px' }}>
                                    {selected.year} 财年
                                  </div>
                                  <div className="grid grid-cols-3 gap-2 text-center">
                                    <div>
                                      <div className="text-[11px] text-amber-700 font-semibold">营收</div>
                                      <div className="font-black tabular-nums text-slate-900" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '14px' }}>
                                        {fmtMoney(selected.revenue)}
                                      </div>
                                      {prevSelected && yoy(selected.revenue, prevSelected.revenue) != null && (
                                        <div className={`text-[10px] font-bold ${yoy(selected.revenue, prevSelected.revenue) >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                          {yoy(selected.revenue, prevSelected.revenue) >= 0 ? '+' : ''}{yoy(selected.revenue, prevSelected.revenue).toFixed(1)}%
                                        </div>
                                      )}
                                    </div>
                                    <div>
                                      <div className="text-[11px] text-amber-700 font-semibold">净利润</div>
                                      <div className="font-black tabular-nums text-slate-900" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '14px' }}>
                                        {fmtMoney(selected.netIncome)}
                                      </div>
                                      {prevSelected && yoy(selected.netIncome, prevSelected.netIncome) != null && (
                                        <div className={`text-[10px] font-bold ${yoy(selected.netIncome, prevSelected.netIncome) >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                          {yoy(selected.netIncome, prevSelected.netIncome) >= 0 ? '+' : ''}{yoy(selected.netIncome, prevSelected.netIncome).toFixed(1)}%
                                        </div>
                                      )}
                                    </div>
                                    <div>
                                      <div className="text-[11px] text-amber-700 font-semibold">EPS</div>
                                      <div className="font-black tabular-nums text-slate-900" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '14px' }}>
                                        {selected.epsActual != null ? `$${selected.epsActual.toFixed(2)}` : '—'}
                                      </div>
                                      {prevSelected && yoy(selected.epsActual, prevSelected.epsActual) != null && (
                                        <div className={`text-[10px] font-bold ${yoy(selected.epsActual, prevSelected.epsActual) >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                          {yoy(selected.epsActual, prevSelected.epsActual) >= 0 ? '+' : ''}{yoy(selected.epsActual, prevSelected.epsActual).toFixed(1)}%
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* 6. 内部人交易 (A3 时间线) v10.7.9.40 fix37 */}
                      {analystInsider && analystInsider.length > 0 && (() => {
                        const items = analystInsider.slice(0, 8);  // 最多 8 笔
                        const fmtDollar = (n) => {
                          if (Math.abs(n) >= 1e6) return `${n >= 0 ? '+' : ''}$${(n / 1e6).toFixed(1)}M`;
                          if (Math.abs(n) >= 1e3) return `${n >= 0 ? '+' : ''}$${(n / 1e3).toFixed(0)}K`;
                          return `${n >= 0 ? '+' : ''}$${n.toFixed(0)}`;
                        };
                        // 90 天汇总
                        const buyTotal = items.filter(t => t.type === 'buy').reduce((s, t) => s + t.amount, 0);
                        const sellTotal = items.filter(t => t.type === 'sell').reduce((s, t) => s + t.amount, 0);
                        const buyCount = items.filter(t => t.type === 'buy').length;
                        const sellCount = items.filter(t => t.type === 'sell').length;
                        const netFlow = buyTotal - sellTotal;
                        return (
                          <div className="mb-3">
                            <div className="text-[14px] uppercase tracking-wider text-slate-400 font-bold mb-1.5 px-1 flex items-center justify-between">
                              <span>🔥 内部人 · 90 天</span>
                              <span style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
                                数据源 EODHD
                              </span>
                            </div>
                            {/* 汇总 */}
                            {(buyTotal > 0 || sellTotal > 0) && (
                              <div className="grid grid-cols-2 gap-2 mb-2">
                                <div className="rounded-xl p-2.5 text-center" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                                  <div className="text-[11px] font-bold uppercase" style={{ color: '#dc2626' }}>买入</div>
                                  <div className="font-black tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '15px', color: '#dc2626' }}>
                                    {fmtDollar(buyTotal)}
                                  </div>
                                  <div className="text-[10px] text-slate-500 mt-0.5">{buyCount} 笔</div>
                                </div>
                                <div className="rounded-xl p-2.5 text-center" style={{ background: '#ecfdf5', border: '1px solid #bbf7d0' }}>
                                  <div className="text-[11px] font-bold uppercase" style={{ color: '#16a34a' }}>卖出</div>
                                  <div className="font-black tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '15px', color: '#16a34a' }}>
                                    -{fmtDollar(sellTotal).replace('+', '').replace('-', '')}
                                  </div>
                                  <div className="text-[10px] text-slate-500 mt-0.5">{sellCount} 笔</div>
                                </div>
                              </div>
                            )}
                            {/* 时间线 */}
                            <div className="rounded-xl p-3 relative" style={{ background: '#f8fafc' }}>
                              <div style={{ position: 'absolute', left: '28px', top: '12px', bottom: '12px', width: '2px', background: '#e2e8f0' }}></div>
                              {items.map((t, idx) => (
                                <div key={idx} className="grid items-center py-1.5 relative" style={{ gridTemplateColumns: '32px 1fr auto', gap: '12px' }}>
                                  <div style={{
                                    width: '12px', height: '12px',
                                    borderRadius: '50%',
                                    marginLeft: '10px',
                                    border: '2px solid white',
                                    boxShadow: t.type === 'buy' ? '0 0 0 2px #dc2626' : '0 0 0 2px #16a34a',
                                    background: t.type === 'buy' ? '#dc2626' : '#16a34a',
                                    zIndex: 1,
                                  }}></div>
                                  <div className="text-[12px] overflow-hidden">
                                    <div className="font-bold text-slate-900 truncate">{t.ownerName} · {t.position}</div>
                                    <div className="text-[10px] text-slate-500 mt-0.5">{t.type === 'buy' ? '买入' : '卖出'} · {t.date}</div>
                                  </div>
                                  <div className="text-right font-black tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px', color: t.type === 'buy' ? '#dc2626' : '#16a34a' }}>
                                    {t.type === 'buy' ? '+' : '-'}{fmtDollar(t.amount).replace('+', '').replace('-', '')}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* 7. AI 情绪综合 (v10.7.9.40 fix42, 删新闻列表 只保留情绪) */}
                      {analystNewsSentiment && (() => {
                        const sent = analystNewsSentiment;
                        return (
                          <div className="mb-3">
                            <div className="text-[14px] uppercase tracking-wider text-slate-400 font-bold mb-1.5 px-1 flex items-center justify-between">
                              <span>📰 AI 综合情绪 · 30 天</span>
                              <span style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
                                EODHD
                              </span>
                            </div>
                            <div className="rounded-xl p-3 text-center" style={{
                              background: sent.avgPolarity > 0.1 ? 'linear-gradient(135deg, #fef2f2, #fee2e2)' :
                                sent.avgPolarity < -0.1 ? 'linear-gradient(135deg, #ecfdf5, #dcfce7)' :
                                'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
                              border: sent.avgPolarity > 0.1 ? '1px solid #fecaca' :
                                sent.avgPolarity < -0.1 ? '1px solid #bbf7d0' :
                                '1px solid #cbd5e1',
                            }}>
                              <div className="font-black tabular-nums" style={{
                                fontFamily: 'ui-monospace, monospace',
                                fontSize: '24px',
                                color: sent.avgPolarity > 0.1 ? '#dc2626' : sent.avgPolarity < -0.1 ? '#16a34a' : '#475569',
                              }}>
                                {sent.avgPolarity > 0 ? '+' : ''}{sent.avgPolarity.toFixed(2)}
                              </div>
                              <div className="text-[11px] font-bold mt-0.5" style={{
                                color: sent.avgPolarity > 0.1 ? '#dc2626' : sent.avgPolarity < -0.1 ? '#16a34a' : '#475569',
                              }}>
                                {sent.avgPolarity > 0.3 ? '强烈看多' : sent.avgPolarity > 0.1 ? '偏多' : sent.avgPolarity < -0.3 ? '强烈看空' : sent.avgPolarity < -0.1 ? '偏空' : '中性'}
                              </div>
                              <div className="text-[10px] mt-1" style={{ color: '#94a3b8' }}>
                                共 {sent.total} 条新闻 · 看多 {sent.posCount} · 中性 {sent.neuCount} · 看空 {sent.negCount}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}

                {/* 经济事件详情 (FOMC / CPI / 非农 - v10.7.9.40 EODHD Economic Events) */}
                {(selectedEvent.type === 'fomc' || selectedEvent.type === 'cpi' || selectedEvent.type === 'nonfarm') && (() => {
                  const e = selectedEvent;
                  const hasData = e.actual != null || e.estimate != null || e.previous != null;
                  const fmtVal = (v) => {
                    if (v == null) return '—';
                    const n = parseFloat(v);
                    if (isNaN(n)) return v;
                    return n.toFixed(2) + (e.type === 'fomc' ? '%' : '');
                  };
                  const isReleased = e.actual != null;
                  const beat = isReleased && e.estimate != null && parseFloat(e.actual) > parseFloat(e.estimate);
                  const miss = isReleased && e.estimate != null && parseFloat(e.actual) < parseFloat(e.estimate);
                  return (
                    <div className="space-y-3">
                      {/* 事件英文原名 */}
                      {e.title && (
                        <div className="bg-slate-50 rounded-xl p-3 text-[14px] text-slate-700 leading-relaxed">
                          {e.title}
                        </div>
                      )}
                      {/* 数据对比 */}
                      {hasData && (
                        <div>
                          <div className="text-[12px] uppercase tracking-wider text-slate-400 font-bold mb-1.5 px-1 flex justify-between">
                            <span>📊 数据对比</span>
                            <span style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
                              数据源 EODHD
                            </span>
                          </div>
                          <div className="bg-slate-50 rounded-xl p-3 space-y-2 text-[14px]">
                            {e.actual != null && (
                              <div className="flex justify-between">
                                <span className="text-slate-500">实际值</span>
                                <span className={`font-black tabular-nums ${beat ? 'text-rose-600' : miss ? 'text-emerald-600' : 'text-slate-900'}`} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '16px' }}>
                                  {fmtVal(e.actual)}
                                </span>
                              </div>
                            )}
                            {e.estimate != null && (
                              <div className="flex justify-between">
                                <span className="text-slate-500">市场预期</span>
                                <span className="font-bold text-slate-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  {fmtVal(e.estimate)}
                                </span>
                              </div>
                            )}
                            {e.previous != null && (
                              <div className="flex justify-between">
                                <span className="text-slate-500">上次值</span>
                                <span className="font-bold text-slate-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  {fmtVal(e.previous)}
                                </span>
                              </div>
                            )}
                            {/* 解读 */}
                            {isReleased && e.estimate != null && (
                              <div className="pt-2 border-t border-slate-200 text-[13px] text-center" style={{ color: beat ? '#dc2626' : miss ? '#16a34a' : '#475569' }}>
                                {beat ? '📈 高于预期' : miss ? '📉 低于预期' : '— 持平'}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {/* 未发布 */}
                      {!hasData && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[13px] text-amber-700 text-center">
                          数据尚未发布, 关注届时市场反应
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 关闭按钮 */}
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="w-full py-3 rounded-xl bg-slate-900 text-white font-black text-[14px] active:scale-95"
                >
                  知道了
                </button>
              </div>
            </div>
          </div>
        )}

        {/* === 💼 摊薄成本 - 新增股票弹窗 === */}
        {showCostBasisAdd && (
          <div
            className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setShowCostBasisAdd(false); }}
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <div
              className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* 顶部把手 */}
              <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mt-3 mb-2 sm:hidden"></div>
              <div className="p-5">
                <div className="font-black text-lg text-slate-900 mb-3">+ 新增股票</div>
                <input
                  type="text"
                  value={costBasisNewSymbol}
                  onChange={e => setCostBasisNewSymbol(e.target.value.toUpperCase())}
                  placeholder="股票代码 (如 NVDA)"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg text-base font-bold uppercase mb-3 tabular-nums"
                  style={{ fontFamily: 'ui-monospace, monospace' }}
                  autoFocus
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowCostBasisAdd(false)}
                    className="py-2.5 rounded-lg bg-slate-100 text-slate-700 font-bold active:scale-95"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      const sym = costBasisNewSymbol.trim();
                      if (!sym) return;
                      if (costBasisData[sym]) {
                        alert(`${sym} 已存在`);
                        return;
                      }
                      setCostBasisData(prev => ({ ...prev, [sym]: [] }));
                      setCostBasisActiveSymbol(sym);
                      setShowCostBasisAdd(false);
                    }}
                    className="py-2.5 rounded-lg bg-slate-900 text-white font-black active:scale-95"
                  >
                    确定
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === 💼 摊薄成本 - 添加交易弹窗 === */}
        {showCostBasisTrade && (
          <div
            className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setShowCostBasisTrade(false); }}
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <div
              className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* 顶部把手 */}
              <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mt-3 mb-2 sm:hidden"></div>
              <div className="p-5">
                <div className="font-black text-lg text-slate-900 mb-3">+ 添加交易 ({costBasisActiveSymbol})</div>
              {/* 类型切换 */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setCostBasisNewTrade(prev => ({ ...prev, type: 'buy' }))}
                  className="flex-1 py-2.5 rounded-lg font-black active:scale-95"
                  style={{
                    background: costBasisNewTrade.type === 'buy' ? '#dc2626' : '#f1f5f9',
                    color: costBasisNewTrade.type === 'buy' ? 'white' : '#94a3b8',
                  }}
                >
                  买入
                </button>
                <button
                  onClick={() => setCostBasisNewTrade(prev => ({ ...prev, type: 'sell' }))}
                  className="flex-1 py-2.5 rounded-lg font-black active:scale-95"
                  style={{
                    background: costBasisNewTrade.type === 'sell' ? '#16a34a' : '#f1f5f9',
                    color: costBasisNewTrade.type === 'sell' ? 'white' : '#94a3b8',
                  }}
                >
                  卖出
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">价格 ($/股)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={costBasisNewTrade.price}
                    onChange={e => setCostBasisNewTrade(prev => ({ ...prev, price: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                    style={{ fontFamily: 'ui-monospace, monospace' }}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">股数</label>
                  <input
                    type="number"
                    value={costBasisNewTrade.shares}
                    onChange={e => setCostBasisNewTrade(prev => ({ ...prev, shares: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                    style={{ fontFamily: 'ui-monospace, monospace' }}
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="text-[11px] text-slate-500 block mb-1">日期</label>
                <input
                  type="date"
                  value={costBasisNewTrade.date}
                  onChange={e => setCostBasisNewTrade(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              {/* 实时预览金额 */}
              {costBasisNewTrade.price && costBasisNewTrade.shares && (
                <div className="text-[12px] text-slate-500 mb-3 p-2 bg-slate-50 rounded text-center">
                  {costBasisNewTrade.type === 'buy' ? '将投入' : '将收回'}{' '}
                  <span className="font-black text-slate-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                    ${(parseFloat(costBasisNewTrade.price) * parseFloat(costBasisNewTrade.shares)).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowCostBasisTrade(false)}
                  className="py-2.5 rounded-lg bg-slate-100 text-slate-700 font-bold active:scale-95"
                >
                  取消
                </button>
                <button
                  onClick={confirmCostBasisTradeSubmit}
                  disabled={costBasisSubmitting}
                  className="py-2.5 rounded-lg bg-slate-900 text-white font-black active:scale-95 disabled:opacity-55 disabled:active:scale-100"
                >
                  {costBasisSubmitting ? '保存中...' : '确定'}
                </button>
              </div>
              </div>
            </div>
          </div>
        )}

        {/* === 📋 全部交易记录弹窗 === */}
        {allTradesModal !== null && (() => {
          const sym = allTradesModal.symbol;
          const name = allTradesModal.name;
          const allTrades = trades
            .filter(t => (t.symbol || 'TQQQ') === sym)
            .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id - a.id));

          return (
            <div
              className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
              onClick={() => setAllTradesModal(null)}
            >
              <div
                className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* 头部 */}
                <div
                  className="px-5 py-4 relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #0a0a0a 0%, #171717 100%)',
                    borderBottom: '1px solid rgba(251, 191, 36, 0.2)',
                  }}
                >
                  <div className="flex items-center justify-between relative z-10">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📋</span>
                        <h3
                          className="font-black text-lg"
                          style={{
                            background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                          }}
                        >
                          全部交易
                        </h3>
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: '#a3a3a3' }}>
                        <span className="font-bold" style={{ color: '#fbbf24' }}>{sym}</span>
                        <span className="mx-1.5" style={{ color: '#525252' }}>·</span>
                        <span>{name}</span>
                        <span className="mx-1.5" style={{ color: '#525252' }}>·</span>
                        <span>{allTrades.length} 条记录</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setAllTradesModal(null)}
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(255,255,255,0.1)', color: '#fbbf24' }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 列表 */}
                <div className="flex-1 overflow-y-auto p-4">
                  {allTrades.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-sm">
                      暂无交易记录
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {allTrades.map((t, i) => {
                        const isBuy = !t.side || t.side === 'buy';
                        const amount = Number(t.shares) * Number(t.price);
                        return (
                          <div
                            key={t.id}
                            className={`p-3 rounded-xl border ${
                              isBuy ? 'border-rose-100 bg-rose-50/30' : 'border-emerald-100 bg-emerald-50/30'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black text-white ${isBuy ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                                {isBuy ? '买入' : '卖出'}
                              </span>
                              <span className="text-[11px] text-slate-500 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                {t.date || '—'}
                              </span>
                              <span className="text-[10px] text-slate-400">#{allTrades.length - i}</span>
                              <button
                                onClick={() => setTradeDeleteConfirmId(t.id)}
                                className="ml-auto w-7 h-7 rounded-full bg-white border border-slate-200 hover:bg-red-500 hover:border-red-500 hover:text-white text-slate-400 flex items-center justify-center text-xs font-bold transition active:scale-90"
                                title="删除这条"
                              >
                                ✕
                              </button>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[12px]">
                              <div>
                                <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">股数</div>
                                <div className="font-bold text-slate-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  {t.shares}
                                </div>
                              </div>
                              <div>
                                <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">单价</div>
                                <div className="font-bold text-slate-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  ${fmt(t.price)}
                                </div>
                              </div>
                              <div>
                                <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">金额</div>
                                <div className={`font-bold tabular-nums ${isBuy ? 'text-rose-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  {isBuy ? '-' : '+'}${fmt(amount, 0)}
                                </div>
                              </div>
                            </div>
                            {t.batch && (
                              <div className="text-[10px] text-slate-400 mt-1.5">
                                批次: {t.batch}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 底部说明 */}
                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
                  <p className="text-[10px] text-slate-500 text-center leading-relaxed">
                    💡 删除单笔交易不影响其他波段 · 按日期倒序排列
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* === 删除确认弹窗 (交易记录) === */}
        {tradeDeleteConfirmId !== null && (() => {
          const t = trades.find(tr => tr.id === tradeDeleteConfirmId);
          if (!t) {
            // 数据丢失则自动关闭
            setTradeDeleteConfirmId(null);
            return null;
          }
          const isBuy = !t.side || t.side === 'buy';
          const amount = t.shares * t.price;
          return (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center px-6"
              style={{ background: 'rgba(15, 23, 42, 0.55)' }}
              onClick={() => setTradeDeleteConfirmId(null)}
            >
              <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-[fadeInUp_0.2s_ease-out]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* 头部 */}
                <div className="px-5 pt-5 pb-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                    <Trash2 className="w-6 h-6 text-red-600" />
                  </div>
                  <h3 className="font-black text-lg text-slate-900">确定删除这笔交易?</h3>
                  <p className="text-xs text-slate-500 mt-1">删除后无法恢复</p>
                </div>
                {/* 交易详情 */}
                <div className="mx-5 mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-black text-white ${isBuy ? 'bg-red-600' : 'bg-emerald-600'}`}>
                      {isBuy ? '买' : '卖'}
                    </span>
                    <span className="font-bold text-sm text-slate-900">{t.symbol}</span>
                    <span className="text-xs text-slate-500">{t.name}</span>
                  </div>
                  <div className="text-xs text-slate-700 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                    {t.date} · {t.shares}股 @${fmt(t.price)} · {isBuy ? '-' : '+'}${fmt(amount, 0)}
                  </div>
                </div>
                {/* 按钮 */}
                <div className="grid grid-cols-2 border-t border-slate-200">
                  <button
                    onClick={() => setTradeDeleteConfirmId(null)}
                    className="py-3.5 text-slate-700 font-bold text-sm border-r border-slate-200 active:bg-slate-100 transition"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      deleteTrade(tradeDeleteConfirmId);
                      setTradeDeleteConfirmId(null);
                    }}
                    className="py-3.5 text-red-600 font-black text-sm active:bg-red-50 transition"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* === 删除确认弹窗 (关注股票) === */}
        {stockDeleteConfirmId !== null && (() => {
          const s = watchlist.find(st => st.symbol === stockDeleteConfirmId);
          if (!s) {
            setStockDeleteConfirmId(null);
            return null;
          }
          // 这只股票相关的交易笔数
          const relatedTrades = [
            ...trades,
            ...stockTrades,
          ].filter(t => (t.symbol || 'TQQQ') === s.symbol).length;
          return (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center px-6"
              style={{ background: 'rgba(15, 23, 42, 0.55)' }}
              onClick={() => setStockDeleteConfirmId(null)}
            >
              <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-[fadeInUp_0.2s_ease-out]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-5 pt-5 pb-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                    <Trash2 className="w-6 h-6 text-red-600" />
                  </div>
                  <h3 className="font-black text-lg text-slate-900">从关注列表删除?</h3>
                  <p className="text-xs text-slate-500 mt-1">{s.symbol} {s.name && `· ${s.name}`}</p>
                </div>
                {relatedTrades > 0 && (
                  <div className="mx-5 mb-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
                    <div className="text-xs text-amber-800 leading-relaxed">
                      ⚠️ 这只股票有 <span className="font-black">{relatedTrades}</span> 笔交易记录,删除关注不会删交易记录,但会失去实时报价。
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 border-t border-slate-200">
                  <button
                    onClick={() => setStockDeleteConfirmId(null)}
                    className="py-3.5 text-slate-700 font-bold text-sm border-r border-slate-200 active:bg-slate-100 transition"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      removeStock(stockDeleteConfirmId);
                      setStockDeleteConfirmId(null);
                    }}
                    className="py-3.5 text-red-600 font-black text-sm active:bg-red-50 transition"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 底部 5 tab 导航栏 */}
        <div
          className={`fixed bottom-0 left-0 right-0 shadow-2xl z-50 ${darkShell ? 'bg-[#070a0f] border-t border-white/10' : 'bg-white border-t border-slate-200'}`}
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-5">
              {[
                { id: 'home',     label: '首页', icon: Home },
                { id: 'trades',   label: '交易', icon: ListChecks },
                { id: 'analysis', label: '资产', icon: Wallet },
                { id: 'review',   label: '目标', icon: Target },
                { id: 'settings', label: '设置', icon: Settings },
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex flex-col items-center justify-center py-2 active:scale-95 transition ${
                      darkShell
                        ? (isActive ? 'text-[#f6a524]' : 'text-white/40')
                        : (isActive ? 'text-blue-600' : 'text-slate-400')
                    }`}
                  >
                    <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'stroke-[2.5]' : ''}`} />
                    <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
                  </button>
                );
              })}
            </div>
            {/* 拉取错误提示(浮在导航栏上方) */}
            {fetchError && (
              <div className="absolute -top-10 left-2 right-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-1 shadow">
                <WifiOff className="w-3 h-3" /> 拉取失败:{fetchError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


export default MainApp;

// ============================================
// 📅 最后修改时间: 2026-06-10 (美东) / 06-11 (北京)
// 📝 本次更新: v10.7.9.46 - 首页"当前猎手状态" → "当前信号" 🏷
//
// 📝 v10.7.9.45 - 改名 X MONEY + 开屏调速 🎨
//
//   Bottomline → X MONEY 全套改名:
//   - 开屏动画: 金色 X 两笔画描出 + X MONEY (去掉 BOTTOMLINE)
//   - 头部 logo: B 方块 → X 方块, 文字 → X MONEY
//   - 关于卡 / index.html title / manifest PWA 名
//   - favicon.svg 重画: 黑底金色经典 X + 圆角方块
//   ⚠️ localStorage key (bottomline_*) 保持不变, 不动用户数据
//
// 📝 v10.7.9.43 - 预警文案理性化 (保留进攻性) 🧠
//
//   ALERT_LEVELS 9 档 + FGI 5 档全部重写:
//   - 原则: 指令式→提示式, 风控前置 (维持率检查), 分批钉进句子
//   - L6: "满仓100%" → "留 10-20% 应急弹药" (满仓后 L7-L9 没子弹, 原方案自相矛盾)
//   - L7: "满仓持有,继续加" → "维持率安全则可继续进攻"
//   - L8: "所有现金加杠杆" → "先核维持率, 弹药分 2-3 次打" (账户本身已 1.25-1.3x 杠杆)
//   - L9: "世纪机会" → "敢买但分批, 底部无法预知" (2008 从 -40% 又跌到 -55%)
//   - FGI: "梭哈买入" → "分批进攻" / "清仓离场" → "减仓为主, 留核心仓" (符合核心+卫星体系)
//   - 速查表自动同步 (直接 map ALERT_LEVELS, 一处改全生效)
//
// 📝 v10.7.9.42 - 资产走势 Modal 黑金化 + 环比金额 💰
//
//   1) Modal 改黑金质感 (白底 → #0f0f0f, 跟家庭总资产卡同调)
//   2) 每月新增环比金额: 之前只有 ↑8.1%, 现在 +233.2万 · ↑8.1%
//   3) 起始月 (最早月无对比) 显示"起始月", 持平显示"±0"
//
// 📝 v10.7.9.41 - 修复猎手状态 QQQ 回撤拉取不到 🎯
//
//   核心 bug: 首页"当前猎手状态"的 QQQ 回撤一直拉不到真实数据
//
//   根因 (两个叠加):
//   1) QQQ 没进 API 请求列表 (只请求 watchlist+VIX+FGI+INDICES)
//      → result.data 里找不到 d.symbol==='QQQ' → qqqCurrent/High 不更新
//      → 数据藏在 INDICES 子数组里, 但那个只有当日高没有 52周高
//   2) qqqHigh 用 Math.max(prev, 当前价), 从不读 API 的 week52High
//      → 永远停在写死的初始值 640.47
//
//   修复:
//   - 把 QQQ/TQQQ 显式加进主请求 (Set 去重), 走完整 stock 接口
//   - QQQ 52周高直接信任 API week52High, 跟 watchlist 同源
//   - 不用 Math.max(prev) 粘滞, 避免脏数据顶死
//
// ── 历史 ──
// 📝 v10.7.9.3 - 关注列表再扩宽 📐
//
//   3 项优化:
//
//   1) 删除右上角 ✕ 删除按钮
//      原因: 点卡片就能进编辑模式删除, 重复
//      节省: 16px 按钮 + 28px 右 padding = 44px 内容空间
//
//   2) 卡之间分割线: 双线 → 单线
//      之前: border-y (上+下) → 相邻卡 2 条
//      现在: border-b (只下) → 相邻卡 1 条
//      视觉更清爽
//
//   3) 删除股票统一入口
//      点卡片 → 编辑模式 → 底部"🗑 删除该股票"
//      window.confirm 二次确认 (防误删)
//      跟其他模块的"二次确认"体验一致
//
//   总计: 内容宽度 ~315px → ~329px (+14px)
//
// 📦 v10.7.9.1: 入侵式占满全屏
// 📦 v10.7.9.0: 关注列表对称两块
// ============================================
