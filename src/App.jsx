import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TrendingDown, TrendingUp, Target, AlertCircle, CheckCircle2, Clock, Trash2, Plus, Save, RotateCcw, RefreshCw, Wifi, WifiOff, Home, ListChecks, BarChart3, Settings, LogOut, Loader2 } from 'lucide-react';
import Login from './Login';
import { supabase, getCurrentUser, signOut, onAuthChange } from './lib/supabase';
import * as db from './lib/db';

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

// ============ 股票配色 ============
// 主流热门股配品牌色,非主流的根据代码 hash 自动分配
const STOCK_COLORS = {
  // 七姐妹 - 用品牌色
  AAPL: { from: '#1f2937', to: '#374151' },      // 苹果灰黑
  MSFT: { from: '#0078d4', to: '#005a9e' },      // 微软蓝
  GOOGL: { from: '#4285f4', to: '#1a73e8' },     // 谷歌蓝
  GOOG: { from: '#4285f4', to: '#1a73e8' },
  AMZN: { from: '#ff9900', to: '#e88c00' },      // 亚马逊橙
  META: { from: '#0866ff', to: '#0052cc' },      // Meta 蓝
  NVDA: { from: '#76b900', to: '#5a8f00' },      // 英伟达绿
  TSLA: { from: '#cc0000', to: '#990000' },      // 特斯拉红
  // 杠杆 ETF - 用紫色系强调"高风险"
  TQQQ: { from: '#7c3aed', to: '#5b21b6' },      // 紫
  SQQQ: { from: '#6b21a8', to: '#4c1d95' },
  SOXL: { from: '#a855f7', to: '#7e22ce' },
  TNA: { from: '#9333ea', to: '#6b21a8' },
  // 半导体
  TSM: { from: '#dc2626', to: '#991b1b' },       // 台积电红
  AMD: { from: '#000000', to: '#1f2937' },
  AVGO: { from: '#cc0000', to: '#7f1d1d' },
  // 中概
  BABA: { from: '#ff6a00', to: '#e55a00' },      // 阿里橙
  PDD: { from: '#e02e24', to: '#b91c1c' },
  JD: { from: '#e1251b', to: '#a8181a' },
  BIDU: { from: '#2932e1', to: '#1d4ed8' },
  NIO: { from: '#00a99d', to: '#047857' },
  XPEV: { from: '#0066ff', to: '#0047b3' },
  LI: { from: '#1e88e5', to: '#1565c0' },
  // 主流 ETF
  SPY: { from: '#1e40af', to: '#1e3a8a' },       // 标普蓝
  QQQ: { from: '#0ea5e9', to: '#0369a1' },       // 纳指浅蓝
  DIA: { from: '#475569', to: '#334155' },       // 道指灰
  VTI: { from: '#16a34a', to: '#15803d' },
  // 加密相关
  COIN: { from: '#0052ff', to: '#0040cc' },
  MSTR: { from: '#f7931a', to: '#cc7400' },
  // 流媒体/消费
  NFLX: { from: '#e50914', to: '#b20710' },
  DIS: { from: '#113ccf', to: '#0a2796' },
  SBUX: { from: '#00704a', to: '#00543a' },
  KO: { from: '#f40009', to: '#c30007' },
  PEP: { from: '#004b93', to: '#003a72' },
  MCD: { from: '#ffc72c', to: '#da9c00' },
  NKE: { from: '#111111', to: '#000000' },
  // 金融
  JPM: { from: '#0066b3', to: '#004d8a' },
  V: { from: '#1a1f71', to: '#101545' },
  MA: { from: '#eb001b', to: '#b30015' },
  // 软件 / SaaS
  CRM: { from: '#00a1e0', to: '#0079a8' },
  ORCL: { from: '#c74634', to: '#9a3527' },
  ADBE: { from: '#fa0f00', to: '#c00c00' },
  SHOP: { from: '#95bf47', to: '#7ba238' },
  PLTR: { from: '#101216', to: '#000000' },
  // 加密 ETF
  IBIT: { from: '#000000', to: '#1f1f1f' },
  GBTC: { from: '#f7931a', to: '#cc7400' },
};

// 根据股票代码返回颜色(没有预设的用 hash 自动分配)
const getStockColor = (symbol) => {
  if (STOCK_COLORS[symbol]) return STOCK_COLORS[symbol];
  // 自动分配:从一个备选色板里 hash 选一个
  const fallbackPalette = [
    { from: '#0891b2', to: '#0e7490' }, // 青
    { from: '#059669', to: '#047857' }, // 翠绿
    { from: '#d97706', to: '#b45309' }, // 琥珀
    { from: '#db2777', to: '#be185d' }, // 玫红
    { from: '#7c3aed', to: '#6d28d9' }, // 紫
    { from: '#0d9488', to: '#0f766e' }, // 蓝绿
    { from: '#ea580c', to: '#c2410c' }, // 橙
    { from: '#4f46e5', to: '#4338ca' }, // 靛
    { from: '#65a30d', to: '#4d7c0f' }, // 草绿
  ];
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = ((hash << 5) - hash) + symbol.charCodeAt(i);
    hash |= 0;
  }
  return fallbackPalette[Math.abs(hash) % fallbackPalette.length];
};

// ============ 内部主 App 组件(要求已登录) ============
function MainApp({ user, onLogout }) {
  // ============ 核心状态 ============
  const [qqqHigh, setQqqHigh] = useState(640.47);
  const [qqqCurrent, setQqqCurrent] = useState(640.47);
  const [tqqqCurrent, setTqqqCurrent] = useState(58.55);
  const [totalCapital, setTotalCapital] = useState(500000);

  // 关注股票列表(可编辑价格)
  // high = 6个月滚动最高价,用于计算回撤预警
  const [watchlist, setWatchlist] = useState([
    { symbol: 'TQQQ',  name: '3倍纳指',  price: 58.55,  high: 90.00,  cost: 11.23,  shares: 600 },
    { symbol: 'NVDA',  name: '英伟达',    price: 200.96, high: 210.00, cost: 83.68,  shares: 500 },
    { symbol: 'TSM',   name: '台积电',    price: 369.30, high: 380.00, cost: 137.04, shares: 250 },
    { symbol: 'META',  name: 'Meta',     price: 686.80, high: 720.00, cost: 613.50, shares: 400 },
    { symbol: 'MSFT',  name: '微软',      price: 422.36, high: 470.00, cost: 388.15, shares: 330 },
    { symbol: 'GOOGL', name: '谷歌',      price: 340.55, high: 355.00, cost: 149.05, shares: 800 },
    { symbol: 'QQQ',   name: '纳指ETF',   price: 640.47, high: 642.18, cost: 0,      shares: 0   },
  ]);
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

  // 顶部市场状态卡的基准股票(默认 QQQ,可切换关注列表里其他 1x 标的)
  const [benchmarkSymbol, setBenchmarkSymbol] = useState('QQQ');
  const [benchmarkMenuOpen, setBenchmarkMenuOpen] = useState(false);

  // 杠杆 ETF 黑名单(不允许作为基准,因为回撤不该 ×3 来判断)
  const LEVERAGED_ETFS = ['TQQQ', 'SQQQ', 'QLD', 'PSQ', 'SOXL', 'SOXS', 'UPRO', 'SPXU', 'UDOW', 'SDOW', 'TNA', 'TZA', 'FAS', 'FAZ', 'TMF', 'TMV', 'LABU', 'LABD'];
  
  // 预警通知开关(本地静默时间)
  const [alertsMuted, setAlertsMuted] = useState(false);

  // 三档配置(可调)
  const [batches, setBatches] = useState([
    { id: 1, name: '第1批', drawdown: -0.10, allocation: 0.25 },
    { id: 2, name: '第2批', drawdown: -0.15, allocation: 0.35 },
    { id: 3, name: '第3批', drawdown: -0.20, allocation: 0.40 },
  ]);

  // 实际成交记录
  // 新数据结构:{ id, symbol, name, side: 'buy'|'sell', shares, price, date, batch?(兼容老数据) }
  const [trades, setTrades] = useState([]);
  const [showAddTrade, setShowAddTrade] = useState(false);
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

  // 波段展开状态(点击波段可展开看明细) { 'wave-id': true }
  const [expandedWaves, setExpandedWaves] = useState({});

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

  // 持久化
  const [saved, setSaved] = useState(false);
  
  // 拉取实时行情状态
  const [fetching, setFetching] = useState(false);
  const [lastFetched, setLastFetched] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  // 云端数据加载状态
  const [cloudLoading, setCloudLoading] = useState(true);
  const [cloudError, setCloudError] = useState(null);

  // 启动时从 Supabase 拉取所有数据
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setCloudLoading(true);
        const { trades: cloudTrades, watchlist: cloudWatchlist, waveNotes: cloudNotes, settings } = await db.fetchAllUserData();
        if (!mounted) return;
        setTrades(cloudTrades || []);
        if (cloudWatchlist && cloudWatchlist.length > 0) {
          setWatchlist(cloudWatchlist);
        }
        // 如果云端没数据,保留 useState 里的默认 watchlist(首次使用)
        setWaveNotes(cloudNotes || {});
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
        }
      } catch (e) {
        console.error('云端数据加载失败:', e);
        setCloudError(e.message);
      } finally {
        if (mounted) setCloudLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // 保存设置到云端(防抖,500ms 内多次改只保存最后一次)
  const settingsSaveTimerRef = useRef(null);
  useEffect(() => {
    if (cloudLoading) return; // 加载期间不保存
    clearTimeout(settingsSaveTimerRef.current);
    settingsSaveTimerRef.current = setTimeout(() => {
      db.upsertSettings({
        benchmarkSymbol,
        fgi, fgiLabel, fgiPrev, fgiWeek, fgiMonth, fgiYear, fgiDataDate,
        vix, vixDataDate,
      }).catch(e => console.error('设置保存失败:', e));
    }, 500);
    return () => clearTimeout(settingsSaveTimerRef.current);
  }, [benchmarkSymbol, fgi, fgiLabel, fgiPrev, fgiWeek, fgiMonth, fgiYear, fgiDataDate, vix, vixDataDate, cloudLoading]);

  // 保存关注列表到云端(防抖)
  const watchlistSaveTimerRef = useRef(null);
  useEffect(() => {
    if (cloudLoading) return;
    clearTimeout(watchlistSaveTimerRef.current);
    watchlistSaveTimerRef.current = setTimeout(() => {
      db.replaceWatchlist(watchlist).catch(e => console.error('关注列表保存失败:', e));
    }, 1000);
    return () => clearTimeout(watchlistSaveTimerRef.current);
  }, [watchlist, cloudLoading]);

  // saveState: 现在是手动触发的"保存反馈",数据其实自动同步
  const saveState = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const resetAll = () => {
    if (window.confirm('确认清空所有数据?这会删除所有交易记录。')) {
      setTrades([]);
      setQqqHigh(640.47);
      setQqqCurrent(640.47);
      setTqqqCurrent(58.55);
      setTotalCapital(500000);
      localStorage.removeItem('tqqq_state');
    }
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
    return watchlist.find(s => s.symbol === benchmarkSymbol);
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
    ...watchlist.filter(s => !LEVERAGED_ETFS.includes(s.symbol) && s.symbol !== 'QQQ').map(s => ({ symbol: s.symbol, name: s.name })),
  ];

  // ============ 预警等级系统 ============
  // 9 档回撤阈值,跌得越狠等级越高
  const ALERT_LEVELS = [
    { dd: -0.10, level: 1, label: '关注',     color: 'bg-yellow-100 text-yellow-800 border-yellow-300', icon: '🟡', action: '小批试探(5-10%仓位)' },
    { dd: -0.12, level: 2, label: '准备',     color: 'bg-amber-100 text-amber-800 border-amber-300',  icon: '🟠', action: '准备第1批建仓资金' },
    { dd: -0.15, level: 3, label: '建仓',     color: 'bg-orange-100 text-orange-900 border-orange-400', icon: '🟠', action: '执行第1批 25% 仓位' },
    { dd: -0.18, level: 4, label: '加码',     color: 'bg-orange-200 text-orange-900 border-orange-500', icon: '🔶', action: '加仓至 40-50%' },
    { dd: -0.20, level: 5, label: '重仓',     color: 'bg-red-100 text-red-800 border-red-400',         icon: '🔴', action: '执行第2批,累计 60%' },
    { dd: -0.25, level: 6, label: '深度',     color: 'bg-red-200 text-red-900 border-red-500',         icon: '🔴', action: '执行第3批,满仓 100%' },
    { dd: -0.30, level: 7, label: '恐慌',     color: 'bg-red-500 text-white border-red-700',           icon: '⛔', action: '满仓持有,如有现金继续加' },
    { dd: -0.40, level: 8, label: '极度恐慌', color: 'bg-red-700 text-white border-red-900',           icon: '🚨', action: '历史级机会,所有现金加杠杆' },
    { dd: -0.50, level: 9, label: '世纪机会', color: 'bg-black text-yellow-300 border-yellow-500',     icon: '💎', action: '类似 2008/2020 级别底部' },
  ];

  // 计算每只股票的预警等级
  const watchlistAlerts = watchlist.map(s => {
    const dd = s.high > 0 ? (s.price - s.high) / s.high : 0;
    let alert = null;
    for (let i = ALERT_LEVELS.length - 1; i >= 0; i--) {
      if (dd <= ALERT_LEVELS[i].dd) {
        alert = ALERT_LEVELS[i];
        break;
      }
    }
    return { ...s, drawdown: dd, alert };
  });

  // 触发预警的股票(按等级降序)
  const triggeredAlerts = watchlistAlerts
    .filter(s => s.alert)
    .sort((a, b) => b.alert.level - a.alert.level);

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

  // 各批次触发价和投入计算
  const computedBatches = batches.map(b => {
    const triggerPrice = qqqHigh * (1 + b.drawdown);
    const tqqqEstimate = tqqqCurrent * (1 + b.drawdown * 3 * 0.85);
    const investAmount = totalCapital * b.allocation;
    const estShares = Math.floor(investAmount / tqqqEstimate);
    const triggered = qqqCurrent <= triggerPrice;
    const tradeForBatch = trades.find(t => t.batch === b.name);
    return { ...b, triggerPrice, tqqqEstimate, investAmount, estShares, triggered, executed: !!tradeForBatch };
  });

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

  // === 新逻辑:按股票分组的"交易日记" ===
  // 把 trades 按 symbol 分组,每组算 持仓/均价/浮盈/已实现盈亏
  const tradesByStock = (() => {
    const groups = {};
    trades.forEach(t => {
      const sym = t.symbol || 'TQQQ';  // 老数据没 symbol 字段,默认 TQQQ
      if (!groups[sym]) {
        groups[sym] = {
          symbol: sym,
          name: t.name || (sym === 'TQQQ' ? '3倍纳指' : sym),
          trades: [],
        };
      }
      groups[sym].trades.push(t);
    });

    // 给每组算汇总
    return Object.values(groups).map(g => {
      // 按日期降序排(最新的在上)
      const sorted = [...g.trades].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id - a.id));
      const buys = g.trades.filter(t => !t.side || t.side === 'buy');
      const sells = g.trades.filter(t => t.side === 'sell');
      const buyShares = buys.reduce((sum, t) => sum + Number(t.shares), 0);
      const sellShares = sells.reduce((sum, t) => sum + Number(t.shares), 0);
      const heldShares = Math.max(0, buyShares - sellShares);
      const totalBuyCost = buys.reduce((sum, t) => sum + Number(t.shares) * Number(t.price), 0);
      const avgBuyPrice = buyShares > 0 ? totalBuyCost / buyShares : 0;
      const totalSellRevenue = sells.reduce((sum, t) => sum + Number(t.shares) * Number(t.price), 0);
      // 已实现盈亏 = 卖出收入 - 卖出股数 × 平均买入价
      const realizedPnl = totalSellRevenue - sellShares * avgBuyPrice;
      // 当前价(从关注列表查)
      const stockInfo = watchlist.find(s => s.symbol === g.symbol);
      const currentPrice = stockInfo?.price || 0;
      // 浮动盈亏 = (当前价 - 平均买入价) × 持仓股数
      const unrealizedPnl = heldShares > 0 && avgBuyPrice > 0 ? (currentPrice - avgBuyPrice) * heldShares : 0;
      const unrealizedPct = avgBuyPrice > 0 ? (currentPrice - avgBuyPrice) / avgBuyPrice : 0;
      return {
        ...g,
        sortedTrades: sorted,
        heldShares,
        avgBuyPrice,
        currentPrice,
        unrealizedPnl,
        unrealizedPct,
        realizedPnl,
        totalPnl: realizedPnl + unrealizedPnl,
      };
    }).sort((a, b) => b.totalPnl - a.totalPnl);  // 按总盈亏排序,赚钱多的在上
  })();

  // 全部交易统计(顶部小汇总)
  const allTradesGrandTotal = tradesByStock.reduce((sum, g) => sum + g.totalPnl, 0);
  const allTradesCount = trades.length;
  const allTradesStocks = tradesByStock.length;

  // === 持仓冷静室:把每只股票的交易切成"波段" ===
  // 规则:全部卖完算一个波段结束,下次买入开启新波段
  const wavesByStock = (() => {
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
            id: `wave-${g.symbol}-${t.id}`,
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
  })();

  // 顶部"持仓冷静室"总览
  const calmRoomActiveCount = wavesByStock.filter(g => g.activeWave).length;
  const calmRoomCompletedCount = wavesByStock.reduce((s, g) => s + g.completedCount, 0);
  const calmRoomActiveDays = wavesByStock
    .filter(g => g.activeWave)
    .reduce((s, g) => s + g.activeWave.heldDays, 0);
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
  const updateBatch = (id, field, value) => {
    setBatches(batches.map(b => b.id === id ? { ...b, [field]: parseFloat(value) || 0 } : b));
  };

  const addTrade = async () => {
    if (!newTrade.symbol || !newTrade.price || !newTrade.shares) {
      alert('请填写股票代码、价格和股数');
      return;
    }
    const symbol = newTrade.symbol.trim().toUpperCase();
    const sharesNum = parseInt(newTrade.shares);
    const priceNum = parseFloat(newTrade.price);
    if (sharesNum <= 0 || priceNum <= 0) {
      alert('股数和价格必须大于 0');
      return;
    }
    // 名字优先级:用户填的 > 中英对照表 > 代码本身
    const stockName = newTrade.name || STOCK_NAME_CN[symbol] || symbol;

    // 添加交易记录(走云端,等返回真正的 id)
    try {
      const tradeRecord = await db.insertTrade({
        symbol,
        name: stockName,
        side: newTrade.side || 'buy',
        date: newTrade.date,
        price: priceNum,
        shares: sharesNum,
      });
      setTrades([...trades, tradeRecord]);
    } catch (e) {
      alert('添加交易失败:' + e.message);
      return;
    }

    // 如果这只股票不在关注列表里,自动加进去
    if (!watchlist.find(s => s.symbol === symbol)) {
      setWatchlist([...watchlist, {
        symbol,
        name: stockName,
        price: priceNum,
        high: priceNum,
        cost: 0,
        shares: 0,
      }]);
    }

    // 重置表单
    setNewTrade({
      symbol: 'TQQQ',
      name: '3倍纳指',
      side: 'buy',
      date: new Date().toISOString().split('T')[0],
      price: '',
      shares: '',
      batch: '第1批',
    });
    setLookupStatus(null);
    setShowAddTrade(false);
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
    setWatchlist(watchlist.map(s => s.symbol === symbol ? { ...s, [field]: parseFloat(value) || 0 } : s));
    if (symbol === 'TQQQ' && field === 'price') setTqqqCurrent(parseFloat(value) || 0);
    if (symbol === 'QQQ' && field === 'price') setQqqCurrent(parseFloat(value) || 0);
  };

  const addStock = () => {
    if (!newStock.symbol || !newStock.price) {
      alert('请至少填写股票代码和当前价');
      return;
    }
    const symbol = newStock.symbol.toUpperCase().trim();
    if (watchlist.find(s => s.symbol === symbol)) {
      alert('该股票已存在');
      return;
    }
    const price = parseFloat(newStock.price) || 0;
    const high = parseFloat(newStock.high) || price;
    setWatchlist([...watchlist, {
      symbol,
      name: newStock.name || symbol,
      price,
      high,
      cost: parseFloat(newStock.cost) || 0,
      shares: parseInt(newStock.shares) || 0,
    }]);
    setNewStock({ symbol: '', name: '', price: '', high: '', cost: '0', shares: '0' });
    setShowAddStock(false);
  };

  const removeStock = (symbol) => {
    if (window.confirm(`确认删除 ${symbol}?`)) {
      setWatchlist(watchlist.filter(s => s.symbol !== symbol));
      if (editingStock === symbol) setEditingStock(null);
    }
  };

  // 一键拉取实时行情(从 Vercel API)
  const fetchRealtimePrices = async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const symbols = [...watchlist.map(s => s.symbol), 'VIX', 'FGI', 'INDICES'].join(',');
      const r = await fetch(`/api/quote?symbols=${symbols}`);
      const result = await r.json();
      
      if (!result.success) {
        throw new Error(result.error || '拉取失败');
      }

      // 更新股票价格
      const updated = watchlist.map(s => {
        const fresh = result.data.find(d => d.symbol === s.symbol);
        if (fresh && fresh.price > 0) {
          // 52 周高的优先级:
          // - Yahoo(已前复权,跟主流软件一致) → 直接覆盖本地(解决拆股问题)
          // - Finnhub(可能未复权) → 跟本地取 max
          // - 都没有 → 保留本地 high
          let newHigh;
          if (fresh.highSource === 'yahoo' && fresh.week52High > 0) {
            // Yahoo 数据权威,直接用,不跟本地比 max(避免拆股前的旧高价残留)
            newHigh = Math.max(fresh.week52High, fresh.price);
          } else {
            // Finnhub 或 fallback,保守起见跟本地取 max
            newHigh = Math.max(s.high || 0, fresh.week52High || 0, fresh.price);
          }
          return {
            ...s,
            price: fresh.price,
            high: newHigh,
            // 保存当天分时(用于心电图)
            intraday: fresh.intraday || s.intraday || [],
            // 保存昨收(用于当日涨跌色)
            previousClose: fresh.previousClose || s.previousClose || 0,
            // 保存当日涨跌
            changePercent: fresh.changePercent || 0,
          };
        }
        return s;
      });
      setWatchlist(updated);

      // 同步 TQQQ 和 QQQ 到核心参数
      const tqqqData = result.data.find(d => d.symbol === 'TQQQ');
      const qqqData = result.data.find(d => d.symbol === 'QQQ');
      if (tqqqData?.price > 0) setTqqqCurrent(tqqqData.price);
      if (qqqData?.price > 0) {
        setQqqCurrent(qqqData.price);
        setQqqHigh(prev => Math.max(prev, qqqData.price));
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
        setIndices(indicesData.data);
      }

      setLastFetched(new Date());
    } catch (e) {
      setFetchError(e.message);
    } finally {
      setFetching(false);
    }
  };

  // 自动拉取:打开 App 立即拉一次,之后每 5 分钟拉一次
  useEffect(() => {
    fetchRealtimePrices();
    const timer = setInterval(() => {
      fetchRealtimePrices();
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // 1) 先从关注列表里看,有的话立刻填(不用网络)
    const fromWatchlist = watchlist.find(s => s.symbol === sym);
    if (fromWatchlist) {
      setLookupStatus('found');
      setNewTrade(t => ({
        ...t,
        name: t.name || fromWatchlist.name || STOCK_NAME_CN[sym] || sym,
        price: t.price || (fromWatchlist.price ? fromWatchlist.price.toFixed(2) : ''),
      }));
      return;
    }

    // 2) 不在关注列表 → 500ms 防抖,从 API 拉
    setLookupStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/quote?symbols=${sym}`);
        const result = await r.json();
        const stockData = result?.data?.find(d => d.symbol === sym);
        if (stockData && stockData.price > 0) {
          setLookupStatus('found');
          setNewTrade(t => ({
            ...t,
            // 优先级:已有名 > 中英对照表 > 代码本身
            name: t.name || STOCK_NAME_CN[sym] || sym,
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

  // 云端加载时显示 loading
  if (cloudLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center px-5">
        <div className="text-center">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 items-center justify-center text-2xl font-black text-white shadow-xl mb-4">B</div>
          <Loader2 className="w-6 h-6 text-indigo-600 animate-spin mx-auto mb-2" />
          <div className="text-sm text-slate-700 font-bold">正在加载云端数据...</div>
          <div className="text-xs text-slate-400 mt-1">{user?.email}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 pb-24" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
      <div className="max-w-5xl mx-auto">
        {/* 顶部标题 - 专业深色风 */}
        <div className="rounded-2xl p-4 mb-4 shadow-lg flex items-center justify-between gap-3" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
          <div className="flex items-center gap-3 min-w-0">
            {/* Logo */}
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-slate-900 text-lg shadow-md shrink-0" style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' }}>
              B
            </div>
            <div className="min-w-0">
              <h1 className="text-white font-black text-xl tracking-tight leading-none">Bottomline</h1>
              <div className="text-slate-400 text-[10px] mt-1 tracking-widest uppercase font-medium truncate">Buy the Dip · Stay Disciplined</div>
            </div>
          </div>
          {/* 右侧:持仓 + 收益 + LIVE */}
          {(() => {
            const totalMV = watchlist.reduce((sum, s) => sum + s.shares * s.price, 0);
            const totalCost = watchlist.reduce((sum, s) => sum + s.shares * s.cost, 0);
            const totalGainPct = totalCost > 0 ? (totalMV - totalCost) / totalCost : 0;
            const isProfit = totalGainPct >= 0;
            return (
              <div className="flex flex-col items-end shrink-0">
                <button
                  onClick={fetchRealtimePrices}
                  disabled={fetching}
                  className="flex items-center gap-1 mb-0.5 px-1.5 py-0.5 -mx-1.5 -my-0.5 rounded-md hover:bg-white/10 active:bg-white/20 active:scale-95 transition disabled:opacity-50"
                  title="点击刷新"
                >
                  <span className={`w-1 h-1 rounded-full bg-emerald-400 ${fetching ? '' : 'animate-pulse'}`}></span>
                  <span className="text-emerald-400 text-[9px] font-bold tracking-wider">LIVE</span>
                  <RefreshCw className={`w-2.5 h-2.5 text-emerald-400 ml-0.5 ${fetching ? 'animate-spin' : ''}`} />
                </button>
                <div className="text-white font-black text-base tabular-nums leading-none" style={{ fontFamily: 'ui-monospace, monospace' }}>
                  ${fmt(totalMV / 1000, 1)}K
                </div>
                {totalCost > 0 && (
                  <div className={`text-xs font-bold tabular-nums mt-0.5 ${isProfit ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {isProfit ? '+' : ''}{(totalGainPct * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* ====== 首页 tab ====== */}
        {activeTab === 'home' && (<>

        {/* 三大指数(DIA/QQQ/SPY 当天分时,迷你卡片) */}
        {indices.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {indices.map((idx) => {
              if (idx.error) {
                return (
                  <div key={idx.ticker} className="bg-white rounded-xl p-3 shadow text-center">
                    <div className="text-xs text-slate-500 font-bold">{idx.name}</div>
                    <div className="text-[10px] text-red-500 mt-2">拉取失败</div>
                  </div>
                );
              }
              const isUp = idx.changePercent >= 0;
              const accentColor = isUp ? '#dc2626' : '#16a34a';        // 红涨绿跌
              const bgColor = isUp ? 'rgba(220, 38, 38, 0.08)' : 'rgba(22, 163, 74, 0.08)';
              const series = (idx.intraday || []).filter(v => v != null && !isNaN(v));

              // 走势图绘制(纯 SVG)
              let pathD = '';
              let fillD = '';
              if (series.length > 1) {
                const min = Math.min(...series, idx.previousClose);
                const max = Math.max(...series, idx.previousClose);
                const range = max - min || 1;
                const W = 100, H = 32;
                const points = series.map((v, i) => {
                  const x = (i / (series.length - 1)) * W;
                  const y = H - ((v - min) / range) * H;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                });
                pathD = `M ${points.join(' L ')}`;
                fillD = `${pathD} L ${W},${H} L 0,${H} Z`;
              }

              return (
                <div key={idx.ticker} className="bg-white rounded-xl p-3 shadow overflow-hidden relative">
                  {/* 名字 + 代码 */}
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-xs font-bold text-slate-700">{idx.name}</span>
                    <span className="text-[9px] text-slate-400 font-mono">{idx.ticker}</span>
                  </div>
                  {/* 当前价 */}
                  <div className={`text-base font-black tabular-nums leading-tight`} style={{ color: accentColor, fontFamily: 'ui-monospace, monospace' }}>
                    ${(idx.price || 0).toFixed(2)}
                  </div>
                  {/* 涨跌幅 */}
                  <div className={`text-[11px] font-bold tabular-nums leading-tight`} style={{ color: accentColor }}>
                    {isUp ? '+' : ''}{(idx.changePercent || 0).toFixed(2)}%
                  </div>
                  {/* 走势线 */}
                  {series.length > 1 ? (
                    <svg viewBox="0 0 100 32" className="w-full h-8 mt-1.5" preserveAspectRatio="none">
                      <path d={fillD} fill={bgColor} />
                      <path d={pathD} fill="none" stroke={accentColor} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    </svg>
                  ) : (
                    <div className="h-8 mt-1.5 flex items-center justify-center text-[10px] text-slate-300">无数据</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 合并卡:市场状态 + 触发预警 */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow">
          {/* === 第 1 排:市场状态(可切换基准) === */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">当前市场状态</div>
              <div className="text-2xl font-black mt-1 text-slate-900 leading-tight">{benchmarkStatus.text}</div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">{benchmarkStatus.desc}</div>
            </div>
            <div className="text-right relative shrink-0">
              {/* 下拉触发按钮(显示当前基准代码) */}
              <button
                onClick={() => setBenchmarkMenuOpen(!benchmarkMenuOpen)}
                className="text-xs text-slate-500 uppercase tracking-wider font-bold hover:text-slate-700 active:scale-95 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-slate-100"
              >
                <span>{benchmarkStock?.symbol || 'QQQ'} 回撤</span>
                <svg className={`w-3 h-3 transition-transform ${benchmarkMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
              </button>
              <div className={`text-3xl font-black tabular-nums mt-1 ${benchmarkDrawdown <= -0.10 ? 'text-red-600' : benchmarkDrawdown <= -0.05 ? 'text-amber-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                {fmtPct(benchmarkDrawdown)}
              </div>
              {/* 当前价 / 52周高(小字补充) */}
              {benchmarkStock && (
                <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                  ${(benchmarkStock.price || 0).toFixed(2)} / 52周高 ${(benchmarkStock.high || 0).toFixed(2)}
                </div>
              )}

              {/* 下拉菜单 */}
              {benchmarkMenuOpen && (
                <>
                  {/* 遮罩点击外关闭 */}
                  <div className="fixed inset-0 z-40" onClick={() => setBenchmarkMenuOpen(false)}></div>
                  <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                    <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-slate-400 border-b border-slate-100">
                      切换基准
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {benchmarkOptions.map(opt => {
                        const isActive = opt.symbol === benchmarkSymbol;
                        return (
                          <button
                            key={opt.symbol}
                            onClick={() => { setBenchmarkSymbol(opt.symbol); setBenchmarkMenuOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-slate-50 active:bg-slate-100 transition ${isActive ? 'bg-blue-50' : ''}`}
                          >
                            <div className="min-w-0">
                              <div className={`font-bold ${isActive ? 'text-blue-700' : 'text-slate-900'}`}>{opt.symbol}</div>
                              <div className="text-[10px] text-slate-500 truncate">{opt.name}</div>
                            </div>
                            {isActive && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 ml-1" />}
                          </button>
                        );
                      })}
                    </div>
                    {benchmarkOptions.length === 1 && (
                      <div className="px-3 py-2 text-[10px] text-slate-400 italic border-t border-slate-100">
                        添加更多关注股票后可切换
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* === 第 2 排:触发预警 === */}
          {triggeredAlerts.length > 0 && (
            <>
              <div className="border-t border-slate-200 my-4"></div>

              {!alertsMuted ? (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        触发预警 · {triggeredAlerts.length}
                      </span>
                    </div>
                    <button
                      onClick={() => setAlertsMuted(true)}
                      className="text-xs text-slate-500 font-medium hover:text-slate-700 active:scale-95 px-2 py-0.5 rounded"
                    >
                      收起 ▲
                    </button>
                  </div>

                  <div className="space-y-3">
                    {triggeredAlerts.map(s => {
                      const isExtreme = s.alert.level >= 7;
                      const levelColor = s.alert.level >= 7 ? 'text-red-600 bg-red-50 border-red-200' 
                                       : s.alert.level >= 5 ? 'text-orange-600 bg-orange-50 border-orange-200'
                                       : s.alert.level >= 3 ? 'text-amber-600 bg-amber-50 border-amber-200'
                                       : 'text-yellow-700 bg-yellow-50 border-yellow-200';
                      // 回撤% 的渐进背景色(警示强度递增)
                      const ddBadge = s.alert.level >= 7 ? 'text-red-100 bg-gradient-to-r from-red-700 to-black border-red-900 shadow-md'
                                    : s.alert.level >= 5 ? 'text-white bg-red-600 border-red-700 shadow-sm'
                                    : s.alert.level >= 3 ? 'text-white bg-orange-500 border-orange-600'
                                    : 'text-amber-900 bg-amber-200 border-amber-400';
                      return (
                        <button
                          key={s.symbol}
                          onClick={() => setEditingStock(s.symbol)}
                          className="w-full text-left active:scale-[0.99] transition"
                        >
                          {/* 第 1 行:股票信息 + 价格 */}
                          <div className="flex items-start justify-between mb-1 gap-2">
                            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                              <span className={`font-black text-base text-slate-900 hover:text-blue-600 transition ${isExtreme ? 'animate-pulse' : ''}`}>
                                {s.symbol}
                              </span>
                              <span className="text-xs text-slate-500">{s.name}</span>
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${levelColor}`}>
                                L{s.alert.level} · {s.alert.label}
                              </span>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-[10px] text-slate-400 tabular-nums leading-tight" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                从 ${fmt(s.high)}
                              </div>
                              <div className="flex items-baseline gap-1.5 leading-tight justify-end">
                                <span className="text-base font-black tabular-nums text-slate-900" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  ${fmt(s.price)}
                                </span>
                                <span className={`text-sm font-black tabular-nums px-1.5 py-0.5 rounded border ${ddBadge} ${isExtreme ? 'animate-pulse' : ''}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  {(s.drawdown * 100).toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          </div>
                          {/* 第 2 行:操作建议 */}
                          <div className="text-xs text-slate-500 pl-0">
                            ➡️ {s.alert.action}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <button
                  onClick={() => setAlertsMuted(false)}
                  className="w-full py-2.5 bg-orange-50 text-orange-700 rounded-lg text-sm font-bold border border-orange-200 active:scale-95"
                >
                  🔔 有 {triggeredAlerts.length} 个预警被收起,点击展开
                </button>
              )}
            </>
          )}
        </div>

        {/* VIX 恐慌指数 */}
        <div className={`rounded-2xl p-5 mb-4 shadow border-2 ${vixSignal.color}`}>
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
                <span className="text-4xl font-black">{vix.toFixed(1)}</span>
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
              className="absolute inset-y-0 left-0 bg-white/60 rounded-full transition-all"
              style={{ width: `${Math.min((vix / 50) * 100, 100)}%` }}
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

          {/* VIX 输入(手动覆盖,适合盘中查实时值) */}
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

        {/* CNN 恐慌贪婪指数 (FGI) */}
        {(() => {
          // 5 档分级
          const getFgiLevel = (v) => {
            if (v < 25) return { label: 'Extreme Fear', cn: '极度恐慌', color: 'bg-rose-100 text-rose-800 border-rose-300', barColor: 'bg-rose-500', accent: 'text-rose-600', action: '🎯 抄底重点机会,梭哈买入', desc: '市场极度恐慌,反向操作时机' };
            if (v < 45) return { label: 'Fear', cn: '恐慌', color: 'bg-orange-100 text-orange-800 border-orange-300', barColor: 'bg-orange-500', accent: 'text-orange-600', action: '✅ 重点买入区,可分批建仓', desc: '市场偏恐慌,逢低布局' };
            if (v < 55) return { label: 'Neutral', cn: '中立', color: 'bg-slate-100 text-slate-700 border-slate-300', barColor: 'bg-slate-400', accent: 'text-slate-600', action: '⏸ 观望,不动作', desc: '市场情绪平衡' };
            if (v < 75) return { label: 'Greed', cn: '贪婪', color: 'bg-emerald-100 text-emerald-800 border-emerald-300', barColor: 'bg-emerald-500', accent: 'text-emerald-600', action: '⚠️ 减仓区,获利了结部分仓位', desc: '市场偏贪婪,谨慎追高' };
            return { label: 'Extreme Greed', cn: '极度贪婪', color: 'bg-red-100 text-red-800 border-red-400', barColor: 'bg-red-600', accent: 'text-red-700', action: '🚨 清仓离场,等待回调', desc: '市场极度贪婪,泡沫风险' };
          };
          const cur = getFgiLevel(fgi);

          // === 半圆仪表盘 (用 circle + stroke-dasharray 实现完美弧线) ===
          // viewBox: 0 0 280 180. 圆心 (140, 150),半径 110
          const cx = 140, cy = 150, R = 110;
          // 一个半圆的周长 = π × R
          const halfCircumference = Math.PI * R;
          // 5 段定义
          const segments = [
            { from: 0,  to: 25,  color: '#fb7185', label: 'EXTREME FEAR' },
            { from: 25, to: 45,  color: '#fb923c', label: 'FEAR' },
            { from: 45, to: 55,  color: '#94a3b8', label: 'NEUTRAL' },
            { from: 55, to: 75,  color: '#4ade80', label: 'GREED' },
            { from: 75, to: 100, color: '#16a34a', label: 'EXTREME GREED' },
          ];
          // 找当前段(用动画值,这样动画过程中段会一路切换)
          const animFgi = displayFgi;
          const activeIdx = segments.findIndex(s => animFgi >= s.from && animFgi < s.to);
          const safeActiveIdx = activeIdx === -1 ? (animFgi >= 100 ? 4 : 0) : activeIdx;

          // 0-100 → 角度(180° = 左, 0° = 右)
          const valueToAngle = (v) => 180 - (v / 100) * 180;
          const polar = (angleDeg, radius) => {
            const rad = angleDeg * Math.PI / 180;
            return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
          };
          // 指针位置(用动画值)
          const needleAngle = valueToAngle(animFgi);
          const needleTip = polar(needleAngle, R - 5);

          // 用 dasharray 在半圆上画一段
          // 所有段保持相同粗细,通过透明度区分激活/非激活
          const renderSegment = (seg, isActive) => {
            const segLen = ((seg.to - seg.from) / 100) * halfCircumference;
            const offsetLen = (seg.from / 100) * halfCircumference;
            return (
              <path
                key={`${seg.from}-${seg.to}`}
                d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
                fill="none"
                stroke={seg.color}
                strokeWidth={22}
                strokeDasharray={`${segLen} ${halfCircumference}`}
                strokeDashoffset={-offsetLen}
                opacity={isActive ? 1 : 0.45}
              />
            );
          };

          const renderHistorical = (val, labelText) => {
            if (val === null) return null;
            const lev = getFgiLevel(val);
            return (
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-slate-500">{labelText}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${lev.accent}`}>{lev.cn}</span>
                  <span className={`w-7 h-7 rounded-full text-xs font-black flex items-center justify-center ${lev.color}`}>
                    {val}
                  </span>
                </div>
              </div>
            );
          };

          return (
            <div className={`rounded-2xl p-5 mb-4 shadow border-2 ${cur.color}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs opacity-80 font-medium">CNN 恐慌贪婪指数</span>
                    {fgiDataDate && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/50 font-bold">
                        实时 · {(() => {
                          const d = new Date(fgiDataDate);
                          return `${d.getMonth() + 1}/${d.getDate()}`;
                        })()}
                      </span>
                    )}
                  </div>
                  <div className="text-xs opacity-70 mt-0.5">{cur.desc}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs opacity-80">操作信号</div>
                  <div className="text-lg font-black mt-0.5">{cur.cn}</div>
                </div>
              </div>

              {/* 半圆仪表盘 (CNN 官方风) */}
              <div className="flex justify-center my-2">
                <svg viewBox="0 0 280 200" className="w-full max-w-[320px]">
                  {/* 隐藏的文字路径(供沿弧弯曲的标签用) */}
                  <defs>
                    {segments.map((seg, i) => {
                      const a1 = valueToAngle(seg.from);
                      const a2 = valueToAngle(seg.to);
                      const p1 = polar(a1, R);
                      const p2 = polar(a2, R);
                      return (
                        <path
                          key={`labelpath-${i}`}
                          id={`fgi-label-path-${i}`}
                          d={`M ${p1.x} ${p1.y} A ${R} ${R} 0 0 1 ${p2.x} ${p2.y}`}
                          fill="none"
                        />
                      );
                    })}
                  </defs>

                  {/* 5 段半圆弧 */}
                  {segments.map((seg, i) => renderSegment(seg, i === safeActiveIdx))}

                  {/* 5 段标签:EXTREME 两行直排往内挪,其他沿弧弯曲 */}
                  {segments.map((seg, i) => {
                    const isActive = i === safeActiveIdx;
                    const isExtreme = seg.label.includes('EXTREME');

                    if (isExtreme) {
                      // EXTREME FEAR / EXTREME GREED:两行直排,往内挪 12px
                      const midAngle = valueToAngle((seg.from + seg.to) / 2);
                      const labelPos = polar(midAngle, R - 12);
                      const lines = seg.label.split(' ');
                      return (
                        <g key={`label-${i}`}>
                          {lines.map((line, lineIdx) => (
                            <text
                              key={lineIdx}
                              x={labelPos.x}
                              y={labelPos.y - 1 + lineIdx * 9}
                              fontSize={8}
                              fill="#fff"
                              textAnchor="middle"
                              fontWeight={isActive ? 900 : 700}
                              letterSpacing={0.3}
                              opacity={isActive ? 1 : 0.85}
                              style={{ paintOrder: 'stroke', stroke: seg.color, strokeWidth: 2.5 }}
                            >
                              {line}
                            </text>
                          ))}
                        </g>
                      );
                    }

                    // FEAR / NEUTRAL / GREED:沿弧弯曲
                    const isNeutral = seg.label === 'NEUTRAL';
                    return (
                      <text
                        key={`label-${i}`}
                        fontSize={isNeutral ? 7 : 9}
                        fill="#fff"
                        fontWeight={isActive ? 900 : 700}
                        letterSpacing={isNeutral ? 0 : 0.3}
                        opacity={isActive ? 1 : 0.85}
                        style={{ paintOrder: 'stroke', stroke: seg.color, strokeWidth: 2.5 }}
                      >
                        <textPath href={`#fgi-label-path-${i}`} startOffset="50%" textAnchor="middle">
                          {seg.label}
                        </textPath>
                      </text>
                    );
                  })}

                  {/* 刻度数字(放在弧的外侧) */}
                  {[0, 25, 50, 75, 100].map(v => {
                    const a = valueToAngle(v);
                    const pos = polar(a, R + 22);
                    return (
                      <text key={v} x={pos.x} y={pos.y + 4} fontSize={11} fill="#475569" textAnchor="middle" fontWeight="bold">
                        {v}
                      </text>
                    );
                  })}
                  {/* 指针 */}
                  <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y} stroke="#0f172a" strokeWidth={3} strokeLinecap="round" />
                  <circle cx={cx} cy={cy} r={9} fill="#0f172a" />
                  {/* 中心数字 */}
                  <text x={cx} y={cy + 38} fontSize={32} fill="#0f172a" textAnchor="middle" fontWeight="900">{Math.round(displayFgi)}</text>
                </svg>
              </div>

              {/* 操作建议 */}
              <div className="bg-white/40 rounded-lg px-3 py-2 text-sm font-bold mb-3">
                {cur.action}
              </div>

              {/* 历史对比 */}
              {(fgiPrev !== null || fgiWeek !== null || fgiMonth !== null || fgiYear !== null) && (
                <div className="bg-white/40 rounded-lg px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider font-bold opacity-60 mb-1">历史对比</div>
                  <div className="divide-y divide-slate-200/40">
                    {renderHistorical(fgiPrev, '前一交易日')}
                    {renderHistorical(fgiWeek, '1 周前')}
                    {renderHistorical(fgiMonth, '1 月前')}
                    {renderHistorical(fgiYear, '1 年前')}
                  </div>
                </div>
              )}

              <div className="text-[10px] opacity-60 mt-2 text-center">
                数据来源:CNN Business · <a href="https://www.cnn.com/markets/fear-and-greed" target="_blank" rel="noopener noreferrer" className="underline">查官方↗</a>
              </div>
            </div>
          );
        })()}

        {/* 关注股票 - 1 列大卡片 */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow">
          <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            我的关注
            <span className="text-xs text-slate-500 font-normal ml-auto">{watchlist.length} 只</span>
          </h2>

          {/* 添加股票表单(只在打开时显示) */}
          {showAddStock && (
            <div className="mb-3 p-4 bg-blue-50 border-2 border-blue-300 rounded-xl">
              <div className="font-bold text-sm mb-2 text-blue-900">+ 添加新股票</div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="text-[10px] text-slate-600 block mb-0.5">代码 *</label>
                  <input
                    type="text"
                    placeholder="如 AAPL"
                    value={newStock.symbol}
                    onChange={(e) => setNewStock({ ...newStock, symbol: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-bold uppercase"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-600 block mb-0.5">中文名</label>
                  <input
                    type="text"
                    placeholder="如 苹果"
                    value={newStock.name}
                    onChange={(e) => setNewStock({ ...newStock, name: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="text-[10px] text-slate-600 block mb-0.5">现价 *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newStock.price}
                    onChange={(e) => setNewStock({ ...newStock, price: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-bold text-blue-700"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-600 block mb-0.5">最高价</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="留空=用现价"
                    value={newStock.high}
                    onChange={(e) => setNewStock({ ...newStock, high: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-bold text-orange-700"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="text-[10px] text-slate-600 block mb-0.5">成本(可选)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newStock.cost}
                    onChange={(e) => setNewStock({ ...newStock, cost: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-600 block mb-0.5">股数(可选)</label>
                  <input
                    type="number"
                    value={newStock.shares}
                    onChange={(e) => setNewStock({ ...newStock, shares: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={addStock} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold active:scale-95">
                  确认添加
                </button>
                <button onClick={() => { setShowAddStock(false); setNewStock({ symbol: '', name: '', price: '', high: '', cost: '0', shares: '0' }); }} className="flex-1 py-2 bg-slate-300 text-slate-700 rounded-lg text-sm font-bold active:scale-95">
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 心电图行(单列,紧凑专业) */}
          <div className="space-y-1.5">
            {watchlistAlerts.map(s => {
              const pnl = s.cost > 0 ? (s.price - s.cost) / s.cost : 0;
              const marketValue = s.shares * s.price;
              const isEditing = editingStock === s.symbol;
              const hasAlert = !!s.alert;
              const isExtreme = hasAlert && s.alert.level >= 7;

              // 当日涨跌色(红涨绿跌)
              const dayChange = s.changePercent || 0;
              const isUp = dayChange >= 0;
              const dayColor = isUp ? '#dc2626' : '#16a34a';
              const dayBg = isUp ? 'rgba(220, 38, 38, 0.06)' : 'rgba(22, 163, 74, 0.06)';

              // 走势线
              const series = (s.intraday || []).filter(v => v != null && !isNaN(v));
              let pathD = '';
              let fillD = '';
              if (series.length > 1) {
                const min = Math.min(...series, s.previousClose || series[0]);
                const max = Math.max(...series, s.previousClose || series[0]);
                const range = max - min || 1;
                const W = 100, H = 28;
                const points = series.map((v, i) => {
                  const x = (i / (series.length - 1)) * W;
                  const y = H - ((v - min) / range) * H;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                });
                pathD = `M ${points.join(' L ')}`;
                fillD = `${pathD} L ${W},${H} L 0,${H} Z`;
              }

              if (isEditing) {
                // 编辑模式 - 展开成大卡
                return (
                  <div key={s.symbol} className="rounded-xl border-2 border-blue-500 bg-blue-50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">{s.symbol} <span className="text-xs text-slate-500 font-normal">{s.name}</span></span>
                      <button
                        onClick={() => setEditingStock(null)}
                        className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-bold active:scale-95"
                      >
                        完成
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">现价</label>
                        <input type="number" step="0.01" value={s.price} onChange={(e) => updateStockPrice(s.symbol, 'price', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-bold text-blue-700" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">52周高</label>
                        <input type="number" step="0.01" value={s.high} onChange={(e) => updateStockPrice(s.symbol, 'high', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-bold text-orange-700" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">成本</label>
                        <input type="number" step="0.01" value={s.cost} onChange={(e) => updateStockPrice(s.symbol, 'cost', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">股数</label>
                        <input type="number" value={s.shares} onChange={(e) => updateStockPrice(s.symbol, 'shares', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm" />
                      </div>
                    </div>
                    <button
                      onClick={() => removeStock(s.symbol)}
                      className="w-full py-2 rounded-lg bg-red-50 text-red-600 text-xs font-bold border border-red-200 active:scale-95"
                    >
                      🗑 删除该股票
                    </button>
                  </div>
                );
              }

              // 心电图行 - 紧凑专业
              return (
                <div
                  key={s.symbol}
                  className={`rounded-xl border transition relative overflow-hidden ${
                    hasAlert
                      ? `${s.alert.color} ${isExtreme ? 'animate-pulse' : ''} border-2`
                      : 'border-slate-200 bg-white active:bg-slate-50'
                  }`}
                >
                  {/* 删除按钮(右上角小×,触发弹窗确认) */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setStockDeleteConfirmId(s.symbol); }}
                    className="absolute top-1 right-1 w-4 h-4 rounded-full bg-slate-200/60 hover:bg-red-500 hover:text-white text-slate-500 flex items-center justify-center text-[8px] font-bold transition active:scale-90 z-10"
                    title="删除"
                  >
                    ✕
                  </button>

                  <button
                    onClick={() => setEditingStock(s.symbol)}
                    className="w-full text-left px-3 py-2 pr-6 flex items-center gap-2"
                  >
                    {/* 左:代码 + 中文名 */}
                    <div className="min-w-0 flex-shrink-0" style={{ width: '64px' }}>
                      <div className={`font-black text-sm leading-tight ${hasAlert ? '' : 'text-slate-900'}`}>{s.symbol}</div>
                      <div className={`text-[9px] truncate leading-tight ${hasAlert ? 'opacity-70' : 'text-slate-500'}`}>{s.name}</div>
                    </div>

                    {/* 中-左:价格 + 当日% */}
                    <div className="flex-shrink-0" style={{ width: '74px' }}>
                      <div className={`text-sm font-bold tabular-nums leading-tight ${hasAlert ? '' : 'text-slate-900'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                        ${fmt(s.price)}
                      </div>
                      <div
                        className="text-[10px] font-bold tabular-nums leading-tight"
                        style={{ fontFamily: 'ui-monospace, monospace', color: hasAlert ? undefined : dayColor }}
                      >
                        {isUp ? '+' : ''}{dayChange.toFixed(2)}%
                      </div>
                    </div>

                    {/* 中:走势线(撑满剩余空间) */}
                    <div className="flex-1 min-w-0 h-7">
                      {series.length > 1 ? (
                        <svg viewBox="0 0 100 28" className="w-full h-full" preserveAspectRatio="none">
                          <path d={fillD} fill={dayBg} />
                          <path d={pathD} fill="none" stroke={dayColor} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                        </svg>
                      ) : (
                        <div className="h-full flex items-center justify-center text-[9px] text-slate-300">--</div>
                      )}
                    </div>

                    {/* 右:回撤% + 高点价格 + L 等级 */}
                    <div className="flex-shrink-0 text-right" style={{ width: '70px' }}>
                      {s.high > 0 && (
                        <>
                          <div className={`text-xs font-bold tabular-nums leading-tight ${hasAlert ? '' : 'text-slate-700'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                            {(s.drawdown * 100).toFixed(1)}%
                          </div>
                          <div className={`text-[9px] tabular-nums leading-tight mt-0.5 ${hasAlert ? 'opacity-75' : 'text-slate-400'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                            高 ${s.high >= 1000 ? s.high.toFixed(0) : s.high.toFixed(2)}
                          </div>
                        </>
                      )}
                      {hasAlert && (
                        <div className="text-[9px] font-black mt-0.5">
                          {s.alert.icon} L{s.alert.level}
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}

            {/* 添加股票按钮(整行) */}
            {!showAddStock && (
              <button
                onClick={() => setShowAddStock(true)}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition active:scale-98 font-bold text-sm flex items-center justify-center gap-1"
              >
                <Plus className="w-4 h-4" /> 添加股票
              </button>
            )}
          </div>

          {/* 持仓汇总 */}
          {(() => {
            const totalMV = watchlist.reduce((sum, s) => sum + s.shares * s.price, 0);
            const totalCost = watchlist.reduce((sum, s) => sum + s.shares * s.cost, 0);
            const totalGain = totalMV - totalCost;
            const totalGainPct = totalCost > 0 ? totalGain / totalCost : 0;
            if (totalMV === 0) return null;
            return (
              <div className="mt-3 p-3 bg-gradient-to-br from-slate-100 to-blue-50 rounded-xl">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[10px] text-slate-600">总市值</div>
                    <div className="font-bold text-sm">${fmt(totalMV, 0)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-600">总成本</div>
                    <div className="font-bold text-sm">${fmt(totalCost, 0)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-600">总盈亏</div>
                    <div className={`font-bold text-sm ${totalGain >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {totalGain >= 0 ? '+' : ''}{(totalGainPct * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* 预警等级速查表 */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow">
          <h2 className="font-bold text-lg mb-3">🚨 预警等级速查</h2>
          <div className="space-y-1.5">
            {ALERT_LEVELS.map(a => (
              <div key={a.level} className={`rounded-lg p-2.5 border ${a.color} flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <span className="text-base">{a.icon}</span>
                  <span className="font-black text-xs">L{a.level}</span>
                  <span className="font-bold text-xs">{Math.abs(a.dd * 100).toFixed(0)}%</span>
                  <span className="text-xs font-bold">{a.label}</span>
                </div>
                <span className="text-[11px] font-medium opacity-90 text-right max-w-[55%]">{a.action}</span>
              </div>
            ))}
          </div>
          
          <h3 className="font-bold text-sm mt-4 mb-2">VIX 恐慌指数信号</h3>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between p-2 rounded-lg bg-green-50 border border-green-200">
              <span><span className="font-bold">VIX &lt; 20</span> 🟢 平静</span>
              <span className="text-slate-600">空仓等待</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-yellow-50 border border-yellow-300">
              <span><span className="font-bold">VIX 20-25</span> 🟡 警惕</span>
              <span className="text-slate-600">现金待命</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-orange-100 border border-orange-300">
              <span><span className="font-bold">VIX 25-30</span> ⚠️ 恐慌</span>
              <span className="text-slate-600">开始建仓</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-red-100 border border-red-300">
              <span><span className="font-bold">VIX 30-35</span> 🚨 极度恐慌</span>
              <span className="text-slate-600">重点买入</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-gradient-to-r from-red-700 to-black text-yellow-300 border border-yellow-500">
              <span><span className="font-bold">VIX ≥ 35</span> 💎 历史机会</span>
              <span>梭哈买入</span>
            </div>
          </div>
          
          <div className="mt-3 p-2 bg-blue-50 rounded text-[11px] text-slate-700">
            💡 <span className="font-bold">联合判断更准:</span>当股票回撤 ≥L5 + VIX ≥30,通常是真正底部信号(如 2020 年 3 月、2022 年 10 月、2025 年 4 月)。
          </div>
        </div>

        {/* 历史参考 */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow">
          <h2 className="font-bold text-lg mb-3">📊 历史回撤参考</h2>
          <div className="space-y-2 text-sm">
            {[
              { event: '2018 Q4 加息恐慌', dd: '-23%', tqqq: '-55%', batches: '满3档' },
              { event: '2020 新冠崩盘', dd: '-28%', tqqq: '-70%', batches: '满3档' },
              { event: '2022 加息熊市', dd: '-35%', tqqq: '-82%', batches: '满3档(持续14个月)' },
              { event: '2023 银行业危机', dd: '-9%', tqqq: '-23%', batches: '0档(未触发)' },
              { event: '2024 日元套利', dd: '-13%', tqqq: '-35%', batches: '1档' },
              { event: '2025 关税恐慌', dd: '-26%', tqqq: '-65%', batches: '满3档(你抓住了)' },
            ].map((h, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <div>
                  <div className="font-medium text-sm">{h.event}</div>
                  <div className="text-xs text-slate-500">{h.batches}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">QQQ {h.dd}</div>
                  <div className="text-xs text-purple-600">TQQQ {h.tqqq}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 p-3 bg-blue-50 rounded-lg text-xs text-slate-700">
            <strong>关键观察:</strong>过去 8 年满 3 档机会约 4 次,平均 2 年一次。耐心等待是这个策略的核心。
          </div>
        </div>

        </>)}
        {/* ====== 首页 tab 结束 ====== */}

        {/* ====== 交易 tab ====== */}
        {activeTab === 'trades' && (<>

        {/* 波段记录(取代原来的"冷静室"+"日记本") */}
        {wavesByStock.length > 0 && (
          <>
            {/* 顶部总览 */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-4 mb-3 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📓</span>
                  <h2 className="font-black text-base text-slate-900">波段记录</h2>
                </div>
                <div className="text-[10px] text-slate-500 italic">点波段看明细</div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white/70 rounded-xl py-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">进行中</div>
                  <div className="text-xl font-black text-indigo-700 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>{calmRoomActiveCount}</div>
                </div>
                <div className="bg-white/70 rounded-xl py-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">已完成</div>
                  <div className="text-xl font-black text-emerald-700 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>{calmRoomCompletedCount}</div>
                </div>
                <div className="bg-white/70 rounded-xl py-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">均持有</div>
                  <div className="text-xl font-black text-purple-700 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>{calmRoomAvgActiveDays}<span className="text-xs font-bold ml-0.5">天</span></div>
                </div>
              </div>
            </div>

            {/* 按股票分组的复盘卡 */}
            {wavesByStock.map(group => {
              const stockColor = getStockColor(group.symbol);
              return (
              <div key={group.symbol} className="bg-white rounded-2xl mb-3 shadow overflow-hidden">
                {/* 头部(股票专属配色) */}
                <div
                  className="px-4 py-3 flex items-center justify-between"
                  style={{ background: `linear-gradient(135deg, ${stockColor.from} 0%, ${stockColor.to} 100%)` }}
                >
                  <div>
                    <div className="font-black text-lg text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>{group.symbol}</div>
                    <div className="text-xs text-white/80">{group.name}</div>
                  </div>
                  {group.activeWave && (
                    <div className="px-2 py-1 rounded-full bg-white/25 backdrop-blur flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                      <span className="text-[10px] font-black text-white">进行中</span>
                    </div>
                  )}
                </div>

                {/* 历史规律(只在有完成波段时显示) */}
                {group.completedCount > 0 && (
                  <div
                    className="px-4 py-3 border-b border-slate-100"
                    style={{ background: `linear-gradient(135deg, ${stockColor.from}0d 0%, ${stockColor.to}0a 100%)` }}
                  >
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1.5">📊 你的历史规律</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">平均持有 </span>
                        <span className="font-black text-slate-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>{group.avgHeldDays}</span>
                        <span className="text-slate-500"> 天</span>
                      </div>
                      <div>
                        <span className="text-slate-500">平均收益 </span>
                        <span className={`font-black tabular-nums ${group.avgGainPct >= 0 ? 'text-red-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                          {group.avgGainPct >= 0 ? '+' : ''}{(group.avgGainPct * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    {/* 进度对比(只在进行中时显示) */}
                    {group.activeWave && group.avgHeldDays > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-200">
                        <div className="text-[10px] text-slate-500 mb-1">本次进度对比历史</div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="text-slate-700">
                            天数: <span className="font-bold tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>{group.activeWave.heldDays}/{group.avgHeldDays}</span>
                            <span className="text-slate-500 ml-1">({Math.round(group.activeWave.heldDays / group.avgHeldDays * 100)}%)</span>
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-700">
                            收益: <span className={`font-bold tabular-nums ${group.activeWave.gainPct >= 0 ? 'text-red-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                              {group.activeWave.gainPct >= 0 ? '+' : ''}{(group.activeWave.gainPct * 100).toFixed(0)}%
                            </span>
                            <span className="text-slate-500 ml-1">/{(group.avgGainPct * 100).toFixed(0)}%</span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 波段列表 */}
                <div className="divide-y divide-slate-100">
                  {group.waves.map(w => {
                    const isActive = w.isActive;
                    const noteValue = waveNotes[w.id] || '';
                    const isEditingNote = editingNoteId === w.id;
                    const isExpanded = expandedWaves[w.id] || false;
                    const startD = (w.startDate || '').slice(5);
                    const endD = isActive ? '今天' : (w.endDate || '').slice(5);
                    // 这个波段的所有交易(按日期升序)
                    const waveTrades = [...(w.buys || []), ...(w.sells || [])]
                      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id - b.id));
                    return (
                      <div key={w.id} className={`${isActive ? 'bg-orange-50/30' : ''}`}>
                        {/* 波段主行(整个可点击展开) */}
                        <button
                          onClick={() => setExpandedWaves({ ...expandedWaves, [w.id]: !isExpanded })}
                          className="w-full px-4 py-3 text-left active:bg-slate-50 transition"
                        >
                          {/* 第 1 行:波段编号 + 时间 + 收益 + 展开箭头 */}
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-black text-white shrink-0 ${isActive ? 'bg-orange-500' : 'bg-slate-500'}`}>
                                #{w.index}
                              </span>
                              <span className="text-xs text-slate-700 tabular-nums shrink-0" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                {startD} → {endD}
                              </span>
                              <span className="text-[10px] text-slate-500 shrink-0">{w.heldDays}天</span>
                              <span className="text-[10px] text-slate-400 shrink-0">{waveTrades.length}笔</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`font-black text-sm tabular-nums ${w.gainPct >= 0 ? 'text-red-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                                {w.gainPct >= 0 ? '+' : ''}{(w.gainPct * 100).toFixed(1)}%
                              </span>
                              <span className={`text-slate-400 text-xs transition ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                            </div>
                          </div>
                          {/* 第 2 行:买卖详情 */}
                          <div className="text-[11px] text-slate-500 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                            买入均$<span className="font-bold text-slate-700">{w.avgBuyPrice.toFixed(2)}</span>
                            {!isActive && <> → 卖出均$<span className="font-bold text-slate-700">{w.avgSellPrice.toFixed(2)}</span></>}
                            {isActive && w.totalSellShares > 0 && <> · 已减仓$<span className="font-bold text-slate-700">{w.avgSellPrice.toFixed(2)}</span></>}
                            {isActive && w.heldShares > 0 && (
                              <> · 持<span className="font-bold text-slate-700">{w.heldShares}</span>股</>
                            )}
                            <span className="ml-1 text-slate-400">· {w.gainAmount >= 0 ? '+' : ''}${fmt(Math.abs(w.gainAmount), 0)}</span>
                          </div>
                        </button>

                        {/* 备注行 */}
                        <div className="px-4 pb-2">
                          {isEditingNote ? (
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                autoFocus
                                defaultValue={noteValue}
                                placeholder="如:关税恐慌、新冠崩盘、AI 浪潮…"
                                className="flex-1 px-2 py-1 border border-blue-400 rounded text-[11px]"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const newVal = e.target.value;
                                    setWaveNotes({ ...waveNotes, [w.id]: newVal });
                                    db.upsertWaveNote(w.id, newVal).catch(err => console.error('备注保存失败:', err));
                                    setEditingNoteId(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingNoteId(null);
                                  }
                                }}
                                onBlur={(e) => {
                                  const newVal = e.target.value;
                                  setWaveNotes({ ...waveNotes, [w.id]: newVal });
                                  db.upsertWaveNote(w.id, newVal).catch(err => console.error('备注保存失败:', err));
                                  setEditingNoteId(null);
                                }}
                              />
                            </div>
                          ) : noteValue ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                              className="text-[11px] text-slate-600 italic px-2 py-1 -mx-1 -my-1 rounded hover:bg-slate-100 active:scale-98 transition w-fit max-w-full text-left"
                            >
                              💬 {noteValue}
                            </button>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                              className="text-[10px] text-slate-400 hover:text-blue-600 active:scale-95 transition"
                            >
                              + 加备注
                            </button>
                          )}
                        </div>

                        {/* 展开:交易明细 */}
                        {isExpanded && (
                          <div className="px-4 pb-3 pt-1 bg-slate-50/50 border-t border-slate-100">
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-2 mt-2">📋 交易明细</div>
                            <div className="space-y-1.5">
                              {waveTrades.map(t => {
                                const isBuy = !t.side || t.side === 'buy';
                                const amount = t.shares * t.price;
                                return (
                                  <div key={t.id} className="flex items-center justify-between py-1 px-2 bg-white rounded-lg border border-slate-100">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <span className={`px-1 py-0.5 rounded text-[9px] font-black text-white shrink-0 ${isBuy ? 'bg-red-600' : 'bg-emerald-600'}`}>
                                        {isBuy ? '买' : '卖'}
                                      </span>
                                      <span className="text-[11px] text-slate-500 tabular-nums shrink-0" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                        {(t.date || '').slice(5)}
                                      </span>
                                      <span className="text-[11px] text-slate-700 tabular-nums truncate" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                        {t.shares}股 @${fmt(t.price)}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className={`text-[11px] font-bold tabular-nums ${isBuy ? 'text-slate-900' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                                        {isBuy ? '-' : '+'}${fmt(amount, 0)}
                                      </span>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setTradeDeleteConfirmId(t.id); }}
                                        className="w-4 h-4 rounded-full bg-slate-100 hover:bg-red-500 hover:text-white text-slate-400 flex items-center justify-center text-[9px] font-bold transition active:scale-90"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </>
        )}

        {/* 交易日记本 - 顶部总收益 */}
        {trades.length > 0 && (
          <div className="rounded-2xl p-4 mb-3 shadow text-white" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400">总盈亏(已实现+浮动)</div>
                <div className={`text-3xl font-black tabular-nums mt-1 ${allTradesGrandTotal >= 0 ? 'text-red-400' : 'text-emerald-400'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                  {allTradesGrandTotal >= 0 ? '+' : ''}${fmt(allTradesGrandTotal, 0)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400">活跃</div>
                <div className="text-base font-bold text-white mt-1">{allTradesStocks} 只 · {allTradesCount} 笔</div>
              </div>
            </div>
          </div>
        )}

        {/* 添加成交按钮 */}
        <button
          onClick={() => setShowAddTrade(!showAddTrade)}
          className="w-full mb-3 py-3 rounded-2xl bg-blue-600 text-white font-bold flex items-center justify-center gap-2 active:scale-95 transition shadow"
        >
          <Plus className="w-5 h-5" /> 添加交易
        </button>

        {/* 添加成交表单 */}
        {showAddTrade && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 mb-3">
            {/* 买/卖切换 */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setNewTrade({ ...newTrade, side: 'buy' })}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition active:scale-95 ${newTrade.side === 'buy' ? 'bg-red-600 text-white shadow' : 'bg-white text-slate-500 border border-slate-200'}`}
              >
                买入
              </button>
              <button
                onClick={() => setNewTrade({ ...newTrade, side: 'sell' })}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition active:scale-95 ${newTrade.side === 'sell' ? 'bg-emerald-600 text-white shadow' : 'bg-white text-slate-500 border border-slate-200'}`}
              >
                卖出
              </button>
            </div>

            {/* 股票代码 + 名称 */}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1 flex items-center gap-1.5">
                  <span>股票代码</span>
                  {lookupStatus === 'loading' && (
                    <span className="text-blue-600 inline-flex items-center gap-0.5">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      <span>查询中</span>
                    </span>
                  )}
                  {lookupStatus === 'found' && (
                    <span className="text-emerald-600 inline-flex items-center gap-0.5">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      <span>已找到</span>
                    </span>
                  )}
                  {lookupStatus === 'notfound' && (
                    <span className="text-amber-600 inline-flex items-center gap-0.5">
                      <AlertCircle className="w-2.5 h-2.5" />
                      <span>未找到,可手动填</span>
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  placeholder="如 NVDA"
                  value={newTrade.symbol}
                  onChange={(e) => {
                    const sym = e.target.value.toUpperCase();
                    // 改代码时清掉之前自动填的名字和价格(让查询重新生效)
                    setNewTrade({
                      ...newTrade,
                      symbol: sym,
                      name: '',
                      price: '',
                    });
                  }}
                  className={`w-full px-2 py-2 border rounded-lg text-sm font-bold uppercase ${
                    lookupStatus === 'found' ? 'border-emerald-400' :
                    lookupStatus === 'notfound' ? 'border-amber-400' :
                    'border-slate-300'
                  }`}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">中文名(自动)</label>
                <input
                  type="text"
                  placeholder="自动填充"
                  value={newTrade.name}
                  onChange={(e) => setNewTrade({ ...newTrade, name: e.target.value })}
                  className="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50"
                />
              </div>
            </div>

            {/* 日期(独占一行) */}
            <div className="mb-2">
              <label className="text-[10px] text-slate-500 block mb-1">日期</label>
              <input
                type="date"
                value={newTrade.date}
                onChange={(e) => setNewTrade({ ...newTrade, date: e.target.value })}
                className="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            {/* 价格 + 股数(共一行) */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">价格 ($, 自动)</label>
                <input
                  type="number"
                  placeholder="自动填充"
                  step="0.01"
                  inputMode="decimal"
                  value={newTrade.price}
                  onChange={(e) => setNewTrade({ ...newTrade, price: e.target.value })}
                  className="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm tabular-nums bg-slate-50"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">股数</label>
                <input
                  type="number"
                  placeholder="0"
                  inputMode="numeric"
                  value={newTrade.shares}
                  onChange={(e) => setNewTrade({ ...newTrade, shares: e.target.value })}
                  className="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={addTrade} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold active:scale-95">确认添加</button>
              <button onClick={() => setShowAddTrade(false)} className="flex-1 py-2.5 bg-slate-300 text-slate-700 rounded-lg text-sm font-bold active:scale-95">取消</button>
            </div>
          </div>
        )}

        {/* 空状态(没有任何交易) */}
        {trades.length === 0 && !showAddTrade && (
          <div className="bg-white rounded-2xl p-8 mb-4 shadow text-center">
            <div className="text-5xl mb-3">📔</div>
            <h3 className="font-bold text-lg text-slate-700 mb-1">还没有交易记录</h3>
            <p className="text-sm text-slate-500">点上面「添加交易」开始记录你的高抛低吸</p>
          </div>
        )}

        </>)}
        {/* ====== 交易 tab 结束 ====== */}

        {/* ====== 分析 tab(预留位,即将上线) ====== */}
        {activeTab === 'analysis' && (<>

        <div className="bg-white rounded-2xl p-8 mb-4 shadow text-center">
          <div className="text-5xl mb-3">📊</div>
          <h2 className="font-bold text-lg mb-2 text-slate-700">分析功能开发中</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            未来这里会有:
          </p>
          <div className="mt-3 space-y-1.5 text-sm text-slate-600">
            <div>📈 收益曲线</div>
            <div>🎯 胜率统计</div>
            <div>🤖 AI 每日盘评</div>
            <div>📅 操作日历</div>
          </div>
        </div>

        </>)}
        {/* ====== 分析 tab 结束 ====== */}

        {/* ====== 设置 tab ====== */}
        {activeTab === 'settings' && (
          <div className="space-y-4">
            {/* 账户信息 */}
            <div className="rounded-2xl p-5 shadow text-white" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-black text-lg flex items-center gap-2">
                  ☁️ 云端账户
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-black">已登录</span>
              </div>
              <div className="text-xs text-white/80 mb-1">登录邮箱</div>
              <div className="text-sm font-bold mb-3 break-all">{user?.email || '--'}</div>
              <div className="text-[10px] text-white/70 mb-3 leading-relaxed">
                💾 数据已云端备份(Supabase Singapore)<br />
                🔒 行级安全 · 任何人都无法访问你的数据<br />
                📱 任意设备登录此账号都能看到你的数据
              </div>
              <button
                onClick={async () => {
                  if (!window.confirm('确认退出登录?\n下次进入需要重新登录。')) return;
                  await onLogout();
                }}
                className="w-full py-2 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 transition flex items-center justify-center gap-1.5 text-sm font-bold border border-white/20"
              >
                <LogOut className="w-4 h-4" /> 退出登录
              </button>
            </div>

            {/* 数据状态 */}
            <div className="bg-white rounded-2xl p-5 shadow">
              <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
                <Wifi className="w-5 h-5 text-green-600" />
                数据状态
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">最近拉取</span>
                  <span className="font-mono text-slate-900">{lastFetched ? lastFetched.toLocaleTimeString('zh-CN', { hour12: false }) : '--'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">自动刷新</span>
                  <span className="text-emerald-600 font-bold">每 5 分钟</span>
                </div>
                {fetchError && (
                  <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-1">
                    <WifiOff className="w-3 h-3" /> {fetchError}
                  </div>
                )}
              </div>
              <button
                onClick={fetchRealtimePrices}
                disabled={fetching}
                className={`mt-3 w-full py-2.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition ${fetching ? 'bg-slate-400' : 'bg-blue-600'}`}
              >
                <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
                {fetching ? '拉取中…' : '立即手动拉取'}
              </button>
            </div>

            {/* 数据持久化 */}
            <div className="bg-white rounded-2xl p-5 shadow">
              <h2 className="font-bold text-lg mb-3">💾 数据管理</h2>
              <div className="text-xs text-slate-500 mb-3">
                所有数据(关注列表 / 持仓 / 计划 / VIX / FGI)都自动保存在你浏览器本地。
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveState}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-white flex items-center justify-center gap-1 active:scale-95 transition ${saved ? 'bg-green-600' : 'bg-slate-700'}`}
                >
                  <Save className="w-4 h-4" />
                  {saved ? '✓ 已保存' : '手动保存'}
                </button>
                <button
                  onClick={resetAll}
                  className="px-4 py-2.5 rounded-xl font-bold text-slate-700 bg-slate-200 flex items-center justify-center gap-1 active:scale-95"
                >
                  <RotateCcw className="w-4 h-4" /> 重置
                </button>
              </div>
            </div>

            {/* 关于 */}
            <div className="bg-white rounded-2xl p-5 shadow">
              <h2 className="font-bold text-lg mb-3">关于 Bottomline</h2>
              <div className="text-sm text-slate-600 space-y-1.5">
                <div>📊 版本:v2.0 PWA</div>
                <div>📡 数据源:Finnhub / FRED / CNN / Yahoo</div>
                <div>💡 提示:把这个页面"添加到主屏幕"获得 App 体验</div>
              </div>
            </div>
          </div>
        )}
        {/* ====== 设置 tab 结束 ====== */}

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
          const relatedTrades = trades.filter(t => (t.symbol || 'TQQQ') === s.symbol).length;
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

        {/* 底部 4 tab 导航栏 */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-2xl z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-4">
              {[
                { id: 'home',     label: '首页', icon: Home },
                { id: 'trades',   label: '交易', icon: ListChecks },
                { id: 'analysis', label: '分析', icon: BarChart3 },
                { id: 'settings', label: '设置', icon: Settings },
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex flex-col items-center justify-center py-2 active:scale-95 transition ${isActive ? 'text-blue-600' : 'text-slate-400'}`}
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


// ============ 外层包装: 处理登录状态 ============
export default function TQQQTracker() {
  const [authState, setAuthState] = useState({ loading: true, user: null });

  useEffect(() => {
    // 启动时检查是否已登录
    getCurrentUser().then(user => {
      setAuthState({ loading: false, user });
    });
    // 监听登录/登出事件
    const { data: { subscription } } = onAuthChange(user => {
      setAuthState(s => ({ ...s, user }));
    });
    return () => subscription?.unsubscribe();
  }, []);

  // 加载中
  if (authState.loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  // 未登录 → 登录页
  if (!authState.user) {
    return <Login onSuccess={(user) => setAuthState({ loading: false, user })} />;
  }

  // 已登录 → 主 App
  return (
    <MainApp
      user={authState.user}
      onLogout={async () => {
        await signOut();
        setAuthState({ loading: false, user: null });
      }}
    />
  );
}

