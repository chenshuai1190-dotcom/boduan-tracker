import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { TrendingDown, TrendingUp, Target, AlertCircle, CheckCircle2, Clock, Trash2, Plus, RotateCcw, RefreshCw, Wifi, WifiOff, Home, ListChecks, BarChart3, Settings, LogOut, Loader2, Wallet, Calendar, X, Edit2, ChevronRight, AlertTriangle, Pin, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import Login from './Login';
import { supabase, getCurrentUser, signOut, onAuthChange } from './lib/supabase';
import * as db from './lib/db';

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
  // ============ 核心状态 ============
  const [qqqHigh, setQqqHigh] = useState(640.47);
  const [qqqCurrent, setQqqCurrent] = useState(640.47);
  const [tqqqCurrent, setTqqqCurrent] = useState(58.55);
  const [totalCapital, setTotalCapital] = useState(500000);

  // 关注股票列表(可编辑价格)
  // high = 6个月滚动最高价,用于计算回撤预警
  // 默认为空,新用户登录后看到引导界面 → 点"添加你的第一只股票"
  const [watchlist, setWatchlist] = useState([]);
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
  
  // 预警通知开关 (持久化 localStorage)
  // v10.7.9.15: 用户折叠后记住, 下次打开还是折叠
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

  // ===== 家庭资产 =====
  const [accounts, setAccounts] = useState([]);          // [{id, owner, type, name, currency, icon}]
  const [snapshots, setSnapshots] = useState([]);        // [{id, accountId, month, balance}]
  const [usdRate, setUsdRate] = useState(7.20);          // 美元换人民币汇率
  const [hkdRate, setHkdRate] = useState(0.87);           // 港币换人民币汇率
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

  // 🧪 WebSocket 实时模式 (EODHD All World Extended 套餐)
  // localStorage 存, 默认关闭 (实验功能)
  const [wsEnabled, setWsEnabled] = useState(() => {
    try { return localStorage.getItem('bottomline_ws') === 'true'; } catch { return false; }
  });
  const [wsStatus, setWsStatus] = useState('disconnected'); // 'disconnected' | 'connecting' | 'connected' | 'error'
  const [wsLastTick, setWsLastTick] = useState(null); // 最后收到 tick 的时间
  // 价格变化闪烁: { symbol: 'up' | 'down' }, 300ms 后清空
  const [priceFlash, setPriceFlash] = useState({});

  // 📜 更新日志展开状态 (默认折叠, 只显示最新 5 条)
  const [changelogExpanded, setChangelogExpanded] = useState(false);
  const [lastFetched, setLastFetched] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  // 云端数据加载状态
  const [cloudLoading, setCloudLoading] = useState(true);
  const [cloudError, setCloudError] = useState(null);

  // 启动时从 Supabase 拉取所有数据
  useEffect(() => {
    let mounted = true;
    const startTime = Date.now();
    const MIN_SPLASH_MS = 800;   // 最少显示 0.8s (保证用户看到设计)
    const MAX_SPLASH_MS = 2000;  // 最多 2s (即使云端连不上, 也跳)

    // 强制超时跳出
    const timeoutId = setTimeout(() => {
      if (mounted) {
        console.warn('[云端加载] 超过 2s 仍未完成, 强制进入主界面');
        setCloudLoading(false);
      }
    }, MAX_SPLASH_MS);

    // 完成后, 保证至少显示 0.8s
    const finishLoading = () => {
      if (!mounted) return;
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);
      setTimeout(() => {
        if (mounted) {
          clearTimeout(timeoutId);
          setCloudLoading(false);
        }
      }, remaining);
    };

    (async () => {
      try {
        setCloudLoading(true);
        console.log('[云端加载] 开始拉取...');
        const result = await db.fetchAllUserData();
        console.log('[云端加载] 原始返回:', result);
        const {
          trades: cloudTrades,
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
        } = result;
        console.log('[云端加载] cloudWatchlist:', cloudWatchlist, '长度:', cloudWatchlist?.length);
        console.log('[云端加载] accounts:', cloudAccounts?.length, 'snapshots:', cloudSnapshots?.length);
        console.log('[云端加载] 复盘 tab: plan', cloudPlan, 'margin', cloudMargin, 'disciplines', cloudDisciplines?.length, 'logs', cloudLogs?.length);

        // 🔑 如果有表拉取失败, 记录到 state 让用户知道
        if (_failedTables && _failedTables.length > 0) {
          console.error('[云端加载] ⚠️ 以下表拉取失败, 保留本地数据:', _failedTables);
          setCloudError(`⚠️ ${_failedTables.length} 项数据未能加载: ${_failedTables.join(', ')}`);
        }

        if (!mounted) return;

        // 🔑 防护原则: 只有云端返回"有效数据"时才覆盖本地
        // null = 拉取失败 → 不动本地 (最重要)
        // []/{} = 真的空 (新用户/刚重置) → 可以覆盖
        // 有数据 → 直接覆盖

        if (cloudTrades !== null) setTrades(cloudTrades);
        else console.warn('[云端加载] ⚠️ trades 拉取失败, 保留本地 state');

        if (cloudWatchlist && cloudWatchlist.length > 0) {
          console.log('[云端加载] ✓ 设置 watchlist:', cloudWatchlist.length, '只');
          setWatchlist(cloudWatchlist);
        } else if (cloudWatchlist === null) {
          console.warn('[云端加载] ⚠️ watchlist 拉取失败, 保留本地默认');
        } else {
          console.warn('[云端加载] ⚠️ cloudWatchlist 为空, 保留本地默认 (新用户)');
        }

        if (cloudNotes !== null) setWaveNotes(cloudNotes);
        else console.warn('[云端加载] ⚠️ waveNotes 拉取失败, 保留本地');

        if (cloudAccounts !== null) setAccounts(cloudAccounts);
        else console.warn('[云端加载] ⚠️ accounts 拉取失败, 保留本地');

        if (cloudSnapshots !== null) setSnapshots(cloudSnapshots);
        else console.warn('[云端加载] ⚠️ snapshots 拉取失败, 保留本地');

        if (cloudPlan) setInvestmentPlan(cloudPlan);
        if (cloudMargin) setMarginStatus(cloudMargin);

        if (cloudDisciplines !== null) setDisciplines(cloudDisciplines);
        else console.warn('[云端加载] ⚠️ disciplines 拉取失败, 保留本地');

        if (cloudLogs !== null) setReviewLogs(cloudLogs);
        else console.warn('[云端加载] ⚠️ reviewLogs 拉取失败, 保留本地');

        if (cloudActuals !== null) setYearlyActuals(cloudActuals);
        else console.warn('[云端加载] ⚠️ yearlyActuals 拉取失败, 保留本地');

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
        }
      } catch (e) {
        console.error('[云端加载] 失败:', e);
        setCloudError(e.message);
      } finally {
        finishLoading();  // 0.8s 下限保护
      }
    })();
    return () => { mounted = false; clearTimeout(timeoutId); };
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
  // 🚀 useMemo: watchlist 变化才重算 (WebSocket 时, 价格变化频繁会触发)
  const watchlistAlerts = useMemo(() => watchlist.map(s => {
    const dd = s.high > 0 ? (s.price - s.high) / s.high : 0;
    let alert = null;
    for (let i = ALERT_LEVELS.length - 1; i >= 0; i--) {
      if (dd <= ALERT_LEVELS[i].dd) {
        alert = ALERT_LEVELS[i];
        break;
      }
    }
    return { ...s, drawdown: dd, alert };
  }), [watchlist]);

  // 触发预警的股票(按等级降序)
  const triggeredAlerts = useMemo(() => watchlistAlerts
    .filter(s => s.alert)
    .sort((a, b) => b.alert.level - a.alert.level), [watchlistAlerts]);

  // 🔔 自动检测新预警 (v10.7.9.15): 新股票 / 等级升级 → 自动展开
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
      await db.upsertSettings({
        benchmarkSymbol, fgi, fgiLabel, fgiPrev, fgiWeek, fgiMonth, fgiYear, fgiDataDate,
        vix, vixDataDate,
        batches: newBatches,
        exitTargets,
      });
    } catch (e) { console.error('batch 保存失败:', e); }
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

    // 重置表单(保留 symbol/name/side/date,方便下一笔同一股票)
    setNewTrade({
      symbol: newTrade.symbol,           // 保留刚用的代码
      name: newTrade.name,                // 保留中文名
      side: newTrade.side,                // 保留买/卖方向
      date: new Date().toISOString().split('T')[0],
      price: '',                          // 价格清空,等待重新输入
      shares: '',                         // 股数清空
      batch: '第1批',
    });
    setLookupStatus(newTrade.symbol === 'TQQQ' ? null : 'found'); // 已知代码默认显示已找到
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
    const newList = watchlist.map(s => s.symbol === symbol ? { ...s, [field]: parseFloat(value) || 0 } : s);
    setWatchlist(newList);
    if (symbol === 'TQQQ' && field === 'price') setTqqqCurrent(parseFloat(value) || 0);
    if (symbol === 'QQQ' && field === 'price') setQqqCurrent(parseFloat(value) || 0);
    // 防抖 useEffect 会自动保存到云端,不需要手动调 db
  };

  const addStock = async () => {
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
    const newItem = {
      symbol,
      name: newStock.name || symbol,
      price,
      high,
      cost: parseFloat(newStock.cost) || 0,
      shares: parseInt(newStock.shares) || 0,
    };
    setWatchlist([...watchlist, newItem]);
    setNewStock({ symbol: '', name: '', price: '', high: '', cost: '0', shares: '0' });
    setShowAddStock(false);
    // 🚨 立刻同步到云端 (不等防抖,精确单条写入)
    try {
      await db.upsertWatchlistItem(newItem);
    } catch (e) {
      console.error('[添加股票] 云端失败:', e);
      alert(`添加 ${symbol} 失败: ${e.message}`);
    }
  };

  const removeStock = async (symbol) => {
    if (window.confirm(`确认删除 ${symbol}?`)) {
      const newList = watchlist.filter(s => s.symbol !== symbol);
      setWatchlist(newList);
      if (editingStock === symbol) setEditingStock(null);
      // 🚨 立刻同步到云端 (不等防抖,不走"删光重插",精确单条删除)
      try {
        await db.removeWatchlistItem(symbol);
      } catch (e) {
        console.error('[删除股票] 云端失败:', e);
        alert(`删除 ${symbol} 失败: ${e.message}`);
      }
    }
  };

  // 一键拉取实时行情(从 Vercel API)
  const fetchRealtimePrices = async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const symbols = [...watchlist.map(s => s.symbol), 'VIX', 'FGI', 'INDICES'].join(',');
      console.log('[FETCH] 🌐 开始拉取:', symbols.slice(0, 80));
      const r = await fetch(`/api/quote?symbols=${symbols}`);
      const result = await r.json();
      console.log('[FETCH] ✓ 返回:', result.success ? `成功 ${result.data?.length} 条` : `失败 ${result.error}`);
      
      if (!result.success) {
        throw new Error(result.error || '拉取失败');
      }

      // DEBUG: 打印 NVDA 的返回数据
      const nvdaData = result.data?.find(d => d.symbol === 'NVDA');
      if (nvdaData) {
        console.log('[FETCH NVDA]', {
          price: nvdaData.price,
          previousClose: nvdaData.previousClose,
          changePercent: nvdaData.changePercent,
          source: nvdaData.priceSource || nvdaData.source,
          error: nvdaData.error,
        });
      }

      // 更新股票价格
      // 🚨 防护: 如果 watchlist 当前是空(可能云端还没加载完), 直接跳过更新, 不能 setWatchlist([])
      if (watchlist.length === 0) {
        // 只更新指数/VIX/FGI, 不动 watchlist
      } else {
        const updated = watchlist.map(s => {
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
        // 🚀 性能: 只在真有变化时才 setState (避免无意义重渲)
        const hasChanges = updated.some((s, i) => {
          const old = watchlist[i];
          return !old || s.price !== old.price || s.high !== old.high || s.changePercent !== old.changePercent;
        });
        if (hasChanges) setWatchlist(updated);
      }

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

  // 自动拉取 (智能刷新)
  // 🚨 关键: 不能在 cloudLoading=true 时拉, 否则 watchlist=[] 闭包会清空云端数据!
  useEffect(() => {
    if (cloudLoading) return;
    // 等 watchlist 也真正有数据, 再拉 (防止首次 watchlist=[] 的 bug)
    if (watchlist.length === 0) return;

    let timerId = null;
    let isActive = true;

    const runFetchAndReschedule = () => {
      if (!isActive) return;
      fetchRealtimePrices();
      // 每次都动态计算间隔 (盘中/盘前盘后/休市 可能跨越时段)
      const interval = getMarketRefreshInterval();
      timerId = setTimeout(runFetchAndReschedule, interval);
    };

    // 启动: 立即拉一次
    fetchRealtimePrices();
    // 第一次调度
    const firstInterval = getMarketRefreshInterval();
    timerId = setTimeout(runFetchAndReschedule, firstInterval);

    // 页面可见性: 隐藏时暂停, 可见时立即拉 + 重启
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 页面隐藏: 清除定时器
        if (timerId) {
          clearTimeout(timerId);
          timerId = null;
        }
      } else {
        // 页面回来: 立即拉 + 重启
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
  }, [cloudLoading, watchlist.length]);

  // 🧪 WebSocket 实时推送 (EODHD All World Extended)
  // 启用后, 股价实时推送, 替代 REST 轮询
  useEffect(() => {
    if (!wsEnabled || cloudLoading || watchlist.length === 0) {
      setWsStatus('disconnected');
      return;
    }

    // EODHD token - 从 Vite 环境变量读取 (VITE_ 前缀才能到前端)
    const token = import.meta.env.VITE_EODHD_TOKEN || '';
    if (!token) {
      console.error('[WebSocket] VITE_EODHD_TOKEN 未配置');
      setWsStatus('error');
      return;
    }

    // 订阅: watchlist 股票 + SPY + QQQ (用于顶部指数实时更新)
    // 自动去重 (用户 watchlist 可能已含 QQQ)
    const subscribeSet = new Set([...watchlist.map(s => s.symbol), 'SPY', 'QQQ']);
    const symbols = Array.from(subscribeSet).join(',');
    const wsUrl = `wss://ws.eodhistoricaldata.com/ws/us?api_token=${token}`;

    console.log('[WebSocket] 连接中...', symbols);
    setWsStatus('connecting');

    let ws = null;
    let reconnectTimer = null;
    let isUnmounting = false;

    const connect = () => {
      if (isUnmounting) return;
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('[WebSocket] ✓ 已连接, 订阅:', symbols);
          setWsStatus('connected');
          ws.send(JSON.stringify({ action: 'subscribe', symbols }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            // EODHD 消息格式: { s: 'AAPL', p: 150.25, t: 1234567890, v: 100 }
            if (data.s && typeof data.p === 'number') {
              const sym = data.s.toUpperCase();
              const newPrice = data.p;
              const tickTime = data.t || Math.floor(Date.now() / 1000);

              setWsLastTick(new Date());

              // 🔑 更新顶部指数 (SPY / QQQ)
              if (sym === 'SPY' || sym === 'QQQ') {
                setIndices(prev => prev.map(idx => {
                  // EODHD 返回的 ticker 是 'SPY.US' 或 'QQQ.US'
                  if (!idx.ticker || !idx.ticker.startsWith(sym + '.')) return idx;
                  const oldPrice = idx.price || 0;
                  if (oldPrice === newPrice) return idx;
                  // 重算当日涨跌
                  const pc = idx.previousClose || oldPrice;
                  const newChangePct = pc > 0 ? ((newPrice - pc) / pc) * 100 : 0;
                  const newChange = newPrice - pc;
                  return {
                    ...idx,
                    price: newPrice,
                    change: newChange,
                    changePercent: newChangePct,
                  };
                }));
              }

              // 更新 watchlist 中对应股票的价格
              setWatchlist(prev => prev.map(s => {
                if (s.symbol !== sym) return s;
                const oldPrice = s.price || 0;
                if (oldPrice === newPrice) return s; // 价格没变, 不触发闪烁

                // 触发闪烁效果
                const flashDir = newPrice > oldPrice ? 'up' : 'down';
                setPriceFlash(prev => ({ ...prev, [sym]: flashDir }));
                setTimeout(() => {
                  setPriceFlash(prev => {
                    const next = { ...prev };
                    delete next[sym];
                    return next;
                  });
                }, 500);

                // 当日涨跌重算
                const pc = s.previousClose || oldPrice;
                const newChangePct = pc > 0 ? ((newPrice - pc) / pc) * 100 : 0;

                // 🔑 同步更新走势图数据 (intraday + intradayPoints)
                // 策略: 每分钟合并一个点 (避免数组爆炸)
                // - 1 分钟内的 tick 覆盖最后一个点
                // - 1 分钟以上的 tick 新增一个点
                const BUCKET_MS = 60 * 1000; // 1 分钟桶
                const nowMs = Date.now();
                const prevIntraday = Array.isArray(s.intraday) ? s.intraday : [];
                const prevPoints = Array.isArray(s.intradayPoints) ? s.intradayPoints : [];

                let newIntraday, newPoints;
                const lastPoint = prevPoints[prevPoints.length - 1];
                const lastPointMs = lastPoint?.t ? lastPoint.t * 1000 : 0;

                if (lastPoint && (nowMs - lastPointMs) < BUCKET_MS) {
                  // 同一分钟内: 覆盖最后一个点
                  newIntraday = [...prevIntraday.slice(0, -1), newPrice];
                  newPoints = [...prevPoints.slice(0, -1), { ...lastPoint, price: newPrice }];
                } else {
                  // 新的一分钟: 追加新点
                  // 推断 session (根据美东时间)
                  const etHour = new Date(nowMs).toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false });
                  const h = parseInt(etHour);
                  let session = 'regular';
                  if (h >= 4 && h < 9) session = 'pre';
                  else if (h >= 16 && h < 20) session = 'post';
                  newIntraday = [...prevIntraday, newPrice];
                  newPoints = [...prevPoints, { price: newPrice, t: tickTime, session }];
                }

                return {
                  ...s,
                  price: newPrice,
                  changePercent: newChangePct,
                  intraday: newIntraday,
                  intradayPoints: newPoints,
                };
              }));
            }
          } catch (e) { /* 忽略非 JSON 消息 (心跳) */ }
        };

        ws.onerror = (e) => {
          console.error('[WebSocket] 错误:', e);
          setWsStatus('error');
        };

        ws.onclose = (e) => {
          console.warn('[WebSocket] 已关闭:', e.code, e.reason);
          setWsStatus('disconnected');
          // 3 秒后自动重连 (除非是主动关闭)
          if (!isUnmounting && wsEnabled) {
            reconnectTimer = setTimeout(() => {
              console.log('[WebSocket] 尝试重连...');
              connect();
            }, 3000);
          }
        };
      } catch (e) {
        console.error('[WebSocket] 连接失败:', e);
        setWsStatus('error');
      }
    };

    connect();

    return () => {
      isUnmounting = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'unsubscribe', symbols }));
        ws.close();
      }
      setWsStatus('disconnected');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsEnabled, cloudLoading, watchlist.length]);

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

  // ⚪ 开屏 (V4-B 全黑流动金线 + 同步徽章 + 邮箱)
  if (cloudLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-5 relative overflow-hidden"
        style={{ background: '#000' }}
      >
        <style>{`
          @keyframes v4FillSimple {
            0% { width: 0%; }
            50% { width: 100%; }
            100% { width: 0%; }
          }
          @keyframes splashFadeIn {
            0% { opacity: 0; transform: translateY(10px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes splashPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          .v4-fill {
            height: 100%;
            background: linear-gradient(90deg, transparent 0%, #fbbf24 50%, transparent 100%);
            animation: v4FillSimple 1.8s ease-in-out infinite;
          }
          .splash-fade-in {
            animation: splashFadeIn 1s ease-out 0.2s both;
          }
          .splash-fade-in-late {
            animation: splashFadeIn 1s ease-out 0.4s both;
          }
          .splash-sync-dot {
            width: 5px; height: 5px; border-radius: 50%;
            background: #4ade80;
            animation: splashPulse 1.5s ease-in-out infinite;
          }
        `}</style>

        {/* 中央: BOTTOMLINE 文字 + 流动金线 */}
        <div className="text-center relative z-10">
          <div
            className="text-[13px] mb-6 splash-fade-in"
            style={{
              letterSpacing: '4px',
              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontWeight: 700,
            }}
          >
            BOTTOMLINE
          </div>
          <div
            className="splash-fade-in"
            style={{
              width: '240px',
              height: '2px',
              background: 'rgba(251, 191, 36, 0.15)',
              borderRadius: '2px',
              overflow: 'hidden',
              margin: '0 auto',
            }}
          >
            <div className="v4-fill"></div>
          </div>
        </div>

        {/* 底部: SUPABASE LIVE 徽章 + 邮箱 */}
        <div className="absolute bottom-9 left-0 right-0 text-center splash-fade-in-late z-10">
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl mb-3"
            style={{
              background: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.15)',
            }}
          >
            <span className="splash-sync-dot"></span>
            <span className="text-[9px] font-bold" style={{ color: '#4ade80', letterSpacing: '2px' }}>
              SUPABASE LIVE
            </span>
          </div>
          {user?.email && (
            <div className="text-[12px]" style={{ color: '#a3a3a3', fontFamily: 'ui-monospace, monospace' }}>
              {user.email}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 pb-24" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
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
        {/* 顶部总览卡片 - 资产/复盘 tab 专注显示自己的主卡,不展示这个 */}
        {activeTab !== 'analysis' && activeTab !== 'review' && activeTab !== 'settings' && (
        <div
          className="rounded-2xl p-4 mb-4 text-white relative overflow-hidden"
          style={{
            background: `
              radial-gradient(circle at 0% 0%, rgba(251, 191, 36, 0.15) 0%, transparent 50%),
              radial-gradient(circle at 100% 100%, rgba(245, 158, 11, 0.1) 0%, transparent 50%),
              linear-gradient(135deg, #0a0a0a 0%, #171717 50%, #0a0a0a 100%)
            `,
            border: '1px solid rgba(251, 191, 36, 0.2)',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(251, 191, 36, 0.1)',
          }}
        >
          {/* 金色光晕装饰 (右上) */}
          <div className="absolute top-0 right-0 w-44 h-44 pointer-events-none" style={{
            background: 'radial-gradient(circle, rgba(251, 191, 36, 0.18) 0%, transparent 70%)',
            transform: 'translate(40%, -40%)',
          }}></div>

          {/* 顶行: 标题 + LIVE 刷新 */}
          <div className="flex items-center justify-between mb-3 relative z-10">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-slate-900 text-sm shadow-md shrink-0" style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' }}>
                B
              </div>
              <span className="text-white font-black text-sm tracking-tight">Bottomline</span>
            </div>
            <button
              onClick={fetchRealtimePrices}
              disabled={fetching}
              className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/10 active:bg-white/20 active:scale-95 transition disabled:opacity-50"
              title="点击刷新"
            >
              <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${fetching ? '' : 'animate-pulse'}`}></span>
              <span className="text-emerald-400 text-[10px] font-bold tracking-wider">LIVE</span>
              <RefreshCw className={`w-3 h-3 text-emerald-400 ml-0.5 ${fetching ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* 主数字: 持仓总市值 */}
          {(() => {
            const totalMV = watchlist.reduce((sum, s) => sum + s.shares * s.price, 0);
            const totalCost = watchlist.reduce((sum, s) => sum + s.shares * s.cost, 0);
            const totalGainPct = totalCost > 0 ? (totalMV - totalCost) / totalCost : 0;
            const realizedOnly = tradesByStock.reduce((sum, g) => sum + g.realizedPnl, 0);
            const isRealizedProfit = realizedOnly >= 0;

            // 📈 v10.7.9.15: 当日盈亏 (按持仓数量 × (当前价 - 昨收) 计算)
            const todayPnl = watchlist.reduce((sum, s) => {
              if (!s.shares || !s.previousClose || !s.price) return sum;
              return sum + s.shares * (s.price - s.previousClose);
            }, 0);
            // 昨日总市值, 用于算 %
            const yesterdayMV = watchlist.reduce((sum, s) => {
              if (!s.shares || !s.previousClose) return sum;
              return sum + s.shares * s.previousClose;
            }, 0);
            const todayPnlPct = yesterdayMV > 0 ? todayPnl / yesterdayMV : 0;
            const isTodayProfit = todayPnl >= 0;

            return (
              <div className="relative z-10">
                <div className="flex items-baseline gap-2">
                  <div
                    className="text-[10px] uppercase font-bold"
                    style={{
                      letterSpacing: '3px',
                      background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    持仓总市值
                  </div>
                  <div className="text-[10px]" style={{ color: '#737373' }}>当前</div>
                </div>
                <div
                  className="text-3xl font-black tabular-nums mt-1"
                  style={{
                    fontFamily: 'ui-monospace, monospace',
                    background: 'linear-gradient(135deg, #fef3c7 0%, #fbbf24 50%, #f59e0b 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    letterSpacing: '-0.5px',
                  }}
                >
                  ${fmt(totalMV, 0)}
                </div>
                {/* 💱 CNY 副显示 */}
                <div className="text-[11px] tabular-nums mt-0.5" style={{ color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
                  ≈ ¥{(totalMV * usdRate / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}万 <span style={{ opacity: 0.6 }}>· 汇率 {usdRate.toFixed(2)}</span>
                </div>
                {/* 当日盈亏 (替换原"浮动%", v10.7.9.15) */}
                {yesterdayMV > 0 && (
                  <div className={`text-[12px] font-black tabular-nums mt-1 ${isTodayProfit ? 'text-rose-400' : 'text-emerald-400'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                    今日 {isTodayProfit ? '+' : ''}${fmt(Math.abs(todayPnl), 0)}
                    <span className="text-[11px] font-bold ml-1.5">
                      ({isTodayProfit ? '+' : ''}{(todayPnlPct * 100).toFixed(2)}%)
                    </span>
                  </div>
                )}

                {/* 底行: 波段总盈亏 / 活跃 */}
                <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid rgba(251, 191, 36, 0.15)' }}>
                  <div>
                    <div className="text-[9px] uppercase tracking-widest font-bold" style={{ color: '#737373' }}>波段总盈亏</div>
                    <div className="flex items-baseline gap-1.5 mt-0.5 flex-wrap">
                      <span className={`font-black text-base tabular-nums ${isRealizedProfit ? 'text-rose-400' : 'text-emerald-400'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                        {isRealizedProfit ? '+' : ''}${fmt(realizedOnly, 0)}
                      </span>
                      {/* 💱 CNY 副显示 (小字) */}
                      <span className="text-[10px] tabular-nums" style={{ color: '#737373', fontFamily: 'ui-monospace, monospace' }}>
                        ≈ {isRealizedProfit ? '+' : '-'}¥{(Math.abs(realizedOnly) * usdRate / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}万
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] uppercase tracking-widest font-bold" style={{ color: '#737373' }}>活跃</div>
                    <div className="text-white font-bold text-sm mt-0.5">
                      {allTradesStocks} 只 · {allTradesCount} 笔
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
        )}
        {/* 顶部总览卡结束 */}

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
                  const { _failedTables } = result;
                  if (!_failedTables || _failedTables.length === 0) {
                    // 重试成功, 重新设置所有 state
                    if (result.trades !== null) setTrades(result.trades);
                    if (result.watchlist && result.watchlist.length > 0) setWatchlist(result.watchlist);
                    if (result.waveNotes !== null) setWaveNotes(result.waveNotes);
                    if (result.accounts !== null) setAccounts(result.accounts);
                    if (result.snapshots !== null) setSnapshots(result.snapshots);
                    if (result.disciplines !== null) setDisciplines(result.disciplines);
                    if (result.reviewLogs !== null) setReviewLogs(result.reviewLogs);
                    if (result.yearlyActuals !== null) setYearlyActuals(result.yearlyActuals);
                    if (result.investmentPlan) setInvestmentPlan(result.investmentPlan);
                    if (result.marginStatus) setMarginStatus(result.marginStatus);
                  } else {
                    setCloudError(`⚠️ ${_failedTables.length} 项数据未能加载: ${_failedTables.join(', ')}`);
                  }
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
        {activeTab === 'home' && (<>

        {/* 两大指数(标普/纳指 当天分时,迷你卡片) */}
        {indices.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {indices.map((idx) => {
              if (idx.error) {
                return (
                  <div key={idx.ticker} className="bg-white rounded-xl p-3 shadow text-center">
                    <div className="text-xs text-slate-500 font-bold">{idx.name}</div>
                    <div className="text-[10px] text-red-500 mt-2">拉取失败</div>
                  </div>
                );
              }
              // 🐛 v10.7.9.15: 实时算涨跌, 支持盘前/盘后
              const realChangePct = (idx.previousClose > 0 && idx.price > 0)
                ? ((idx.price - idx.previousClose) / idx.previousClose) * 100
                : (idx.changePercent || 0);
              const isUp = realChangePct >= 0;
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
                  {/* 名字(英文代码已删除,只保留中文名) */}
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-xs font-bold text-slate-700">{idx.name}</span>
                  </div>
                  {/* 当前价 - BTC 加美元符,指数纯点位 */}
                  <div className={`text-base font-black tabular-nums leading-tight`} style={{ color: accentColor, fontFamily: 'ui-monospace, monospace' }}>
                    {idx.ticker === 'BTC-USD.CC' ? '$' : ''}{(idx.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  {/* 涨跌幅 (v10.7.9.15: 实时算, 支持盘前/盘后) */}
                  <div className={`text-[11px] font-bold tabular-nums leading-tight`} style={{ color: accentColor }}>
                    {isUp ? '+' : ''}{realChangePct.toFixed(2)}%
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
              <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">当前猎手状态</div>
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
                      onClick={() => {
                        setAlertsMuted(true);
                        // 持久化: 记住"已折叠" + 存当前看到的股票等级
                        try {
                          localStorage.setItem('bottomline_alerts_muted', 'true');
                          const snap = {};
                          triggeredAlerts.forEach(s => { snap[s.symbol] = s.alert.level; });
                          localStorage.setItem('bottomline_last_seen_alerts', JSON.stringify(snap));
                          setLastSeenAlerts(snap);
                        } catch {}
                      }}
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
                              {/* "新" 徽章: 新股票或等级升级 */}
                              {(() => {
                                const prevLevel = lastSeenAlerts[s.symbol] || 0;
                                if (s.alert.level > prevLevel) {
                                  return (
                                    <span
                                      className="text-[9px] font-black px-1.5 py-0.5 rounded text-white"
                                      style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', letterSpacing: '0.5px' }}
                                    >
                                      {prevLevel === 0 ? '新' : '升级'}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
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
                  onClick={() => {
                    setAlertsMuted(false);
                    try { localStorage.setItem('bottomline_alerts_muted', 'false'); } catch {}
                  }}
                  className="w-full py-2.5 bg-orange-50 text-orange-700 rounded-lg text-sm font-bold border border-orange-200 active:scale-95"
                >
                  🔔 有 {triggeredAlerts.length} 个预警被收起,点击展开
                </button>
              )}
            </>
          )}
        </div>

        {/* VIX 恐慌指数 */}
        <VixCard
          vix={vix}
          setVix={setVix}
          vixDataDate={vixDataDate}
          setVixDataDate={setVixDataDate}
          vixSignal={vixSignal}
        />

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
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
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

          {/* 空状态引导 - 新用户友好 */}
          {watchlist.length === 0 && !showAddStock && (
            <div className="text-center py-12 px-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border-2 border-dashed border-blue-200">
              <div className="text-5xl mb-3">📊</div>
              <div className="text-slate-700 font-bold mb-1.5">还没有关注的股票</div>
              <div className="text-xs text-slate-500 mb-4 leading-relaxed">
                添加你关注的美股,实时跟踪价格、回撤<br/>
                所有数据自动云同步,多设备共享
              </div>
              <button
                onClick={() => setShowAddStock(true)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" strokeWidth={3}/>
                添加你的第一只股票
              </button>
            </div>
          )}

          {/* 心电图行(单列, 入侵式占满全屏 v10.7.9.1) */}
          <div className="space-y-1.5 -mx-4">
            {watchlistAlerts.map(s => {
              const pnl = s.cost > 0 ? (s.price - s.cost) / s.cost : 0;
              const marketValue = s.shares * s.price;
              const isEditing = editingStock === s.symbol;
              const hasAlert = !!s.alert;
              const isExtreme = hasAlert && s.alert.level >= 7;

              // 当日涨跌色(红涨绿跌)
              // 🐛 v10.7.9.15: 实时算 = (现价 - 昨收) / 昨收, 支持盘前/盘后
              //   之前 bug: s.changePercent 是 EODHD 给的"昨日 vs 前日", 盘前不更新
              const dayChange = (s.previousClose > 0 && s.price > 0)
                ? ((s.price - s.previousClose) / s.previousClose) * 100
                : (s.changePercent || 0);
              // 🐛 DEBUG (v10.7.9.15): 把 5 个关键字段输出到 Console
              if (typeof window !== 'undefined' && !window['__loggedDayChange_' + s.symbol]) {
                window['__loggedDayChange_' + s.symbol] = true;
                setTimeout(() => { delete window['__loggedDayChange_' + s.symbol]; }, 5000);
                console.log(`[DEBUG ${s.symbol}]`,
                  '现价:', s.price,
                  '昨收:', s.previousClose,
                  'EODHD%:', s.changePercent,
                  '我们算的%:', dayChange.toFixed(4),
                  '差值:', s.price - s.previousClose
                );
              }
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
                // 编辑模式 - 展开成大卡 (有 mx-4 抵消列表 -mx-4)
                return (
                  <div key={s.symbol} className="rounded-xl border-2 border-blue-500 bg-blue-50 p-3 space-y-2 mx-4">
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

              // 心电图行 - 入侵式占满全屏 (v10.7.9.3: 删 X, 单线分隔)
              return (
                <div
                  key={s.symbol}
                  className="border-b border-slate-200 bg-white active:bg-slate-50 transition relative overflow-hidden"
                >
                  <button
                    onClick={() => setEditingStock(s.symbol)}
                    className="w-full text-left p-4 block transition-colors duration-300"
                    style={{
                      background: priceFlash[s.symbol] === 'up' ? 'rgba(225, 29, 72, 0.08)' :
                                  priceFlash[s.symbol] === 'down' ? 'rgba(16, 185, 129, 0.08)' :
                                  'transparent',
                    }}
                  >
                    {/* 上:代码/名称 ← → 价格/涨跌 */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="font-black text-[18px] leading-tight tabular-nums text-slate-900" style={{ fontFamily: 'ui-monospace, monospace' }}>{s.symbol}</div>
                        <div className="text-[12px] truncate leading-tight mt-0.5 text-slate-500">{s.name}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[20px] font-bold tabular-nums leading-tight text-slate-900" style={{ fontFamily: 'ui-monospace, monospace' }}>
                          ${fmt(s.price)}
                        </div>
                        <div
                          className="text-[13px] font-bold tabular-nums leading-tight mt-0.5"
                          style={{ fontFamily: 'ui-monospace, monospace', color: dayColor }}
                        >
                          {isUp ? '+' : ''}{dayChange.toFixed(2)}%
                        </div>
                      </div>
                    </div>

                    {/* 中:大走势图 56px + 渐变填充 */}
                    <div className="w-full h-14 my-2">
                      {series.length > 1 ? (
                        <svg viewBox="0 0 100 56" className="w-full h-full" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id={`grad-${s.symbol}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={dayColor} stopOpacity="0.25"/>
                              <stop offset="100%" stopColor={dayColor} stopOpacity="0"/>
                            </linearGradient>
                          </defs>
                          {(() => {
                            // 重建 path 使 H=56
                            const H56 = 56;
                            if (series.length <= 1) return null;
                            const min = Math.min(...series, s.previousClose || series[0]);
                            const max = Math.max(...series, s.previousClose || series[0]);
                            const range = max - min || 1;
                            const W = 100;
                            const pts = series.map((v, i) => {
                              const x = (i / (series.length - 1)) * W;
                              const y = H56 - ((v - min) / range) * H56;
                              return `${x.toFixed(1)},${y.toFixed(1)}`;
                            });
                            const p = `M ${pts.join(' L ')}`;
                            const f = `${p} L ${W},${H56} L 0,${H56} Z`;
                            return (
                              <>
                                <path d={f} fill={`url(#grad-${s.symbol})`} />
                                <path d={p} fill="none" stroke={dayColor} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                              </>
                            );
                          })()}
                        </svg>
                      ) : (
                        <div className="h-full flex items-center justify-center text-[11px] text-slate-300">-- 无走势数据 --</div>
                      )}
                    </div>

                    {/* 下: 2 块对称 - 持仓块 / 52周高块 */}
                    <div className="grid grid-cols-2 gap-2 pt-2.5">
                      {/* 左: 持仓块 (灰底) */}
                      <div className="rounded-lg p-2.5" style={{ background: '#f8fafc' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">持仓</span>
                          {s.cost > 0 && (
                            <span className={`text-[10px] font-black tabular-nums ${pnl >= 0 ? 'text-rose-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                              {pnl >= 0 ? '+' : ''}{(pnl * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div className="text-[13px] font-bold text-slate-700 tabular-nums leading-tight" style={{ fontFamily: 'ui-monospace, monospace' }}>
                          {s.shares > 0 ? `${s.shares} 股` : '—'}
                        </div>
                        <div className="text-[10px] text-slate-500 tabular-nums mt-0.5" style={{ fontFamily: 'ui-monospace, monospace' }}>
                          成本 {s.cost > 0 ? `$${s.cost.toFixed(2)}` : '—'}
                        </div>
                      </div>

                      {/* 右: 52周高块 (有预警时浅红, 无时灰底) */}
                      <div
                        className="rounded-lg p-2.5"
                        style={{
                          background: hasAlert ? '#fef2f2' : '#f8fafc',
                          border: hasAlert ? '1px solid #fecaca' : 'none',
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">52周高</span>
                          {hasAlert && (
                            <span
                              className="text-[10px] font-black px-1.5 py-0.5 rounded"
                              style={{
                                background: s.alert.level >= 7 ? '#7f1d1d' : s.alert.level >= 5 ? '#dc2626' : s.alert.level >= 3 ? '#f97316' : '#fbbf24',
                                color: '#fff',
                              }}
                            >
                              L{s.alert.level}
                            </span>
                          )}
                        </div>
                        <div className="text-[13px] font-bold text-slate-700 tabular-nums leading-tight" style={{ fontFamily: 'ui-monospace, monospace' }}>
                          {s.high > 0 ? `$${s.high >= 1000 ? s.high.toFixed(0) : s.high.toFixed(2)}` : '—'}
                        </div>
                        <div
                          className="text-[10px] tabular-nums mt-0.5 font-bold"
                          style={{
                            fontFamily: 'ui-monospace, monospace',
                            color: s.high > 0 && s.drawdown < 0 ? '#dc2626' : '#94a3b8',
                          }}
                        >
                          {s.high > 0 ? (s.drawdown < 0 ? `▾ ${(s.drawdown * 100).toFixed(1)}%` : '─ 0.0%') : '—'}
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}

            {/* 添加股票按钮(整行, 给左右补 padding) */}
            {!showAddStock && (
              <button
                onClick={() => setShowAddStock(true)}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition active:scale-98 font-bold text-sm flex items-center justify-center gap-1"
                style={{ marginLeft: '1rem', marginRight: '1rem', width: 'calc(100% - 2rem)', marginTop: '8px' }}
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
            {/* 顶部总览 - 白卡极简 (v10.7.9.15) */}
            <div
              className="rounded-2xl p-4 mb-3 relative overflow-hidden bg-white shadow-sm"
              style={{
                border: '1px solid #e2e8f0',
              }}
            >
              <div className="flex items-center justify-between mb-3 relative z-10">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📓</span>
                  <h2
                    className="font-black text-sm"
                    style={{
                      letterSpacing: '1px',
                      color: '#0f172a',
                    }}
                  >
                    波段记录
                  </h2>
                </div>
                <div className="text-[10px] italic" style={{ color: '#94a3b8' }}>点波段看明细</div>
              </div>

              <div className="grid grid-cols-3 gap-2 relative z-10">
                <div
                  className="rounded-xl py-2.5 text-center"
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #f1f5f9',
                  }}
                >
                  <div className="text-xl font-black tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', color: '#dc2626' }}>{calmRoomActiveCount}</div>
                  <div className="text-[9px] uppercase tracking-wider font-bold mt-0.5" style={{ color: '#94a3b8' }}>进行中</div>
                </div>
                <div
                  className="rounded-xl py-2.5 text-center"
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #f1f5f9',
                  }}
                >
                  <div className="text-xl font-black tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', color: '#0f172a' }}>{calmRoomCompletedCount}</div>
                  <div className="text-[9px] uppercase tracking-wider font-bold mt-0.5" style={{ color: '#94a3b8' }}>已完成</div>
                </div>
                <div
                  className="rounded-xl py-2.5 text-center"
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #f1f5f9',
                  }}
                >
                  <div className="text-xl font-black tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', color: '#0f172a' }}>{calmRoomAvgActiveDays}<span className="text-xs font-bold ml-0.5" style={{ color: '#94a3b8' }}>天</span></div>
                  <div className="text-[9px] uppercase tracking-wider font-bold mt-0.5" style={{ color: '#94a3b8' }}>均持有</div>
                </div>
              </div>
            </div>

            {/* 按股票分组的复盘卡 */}
            {wavesByStock.map(group => {
              const completedWaves = group.waves.filter(w => !w.isActive);
              const activeWave = group.waves.find(w => w.isActive);
              return (
              <div key={group.symbol} className="bg-white rounded-2xl mb-3 shadow overflow-hidden">
                {/* ============ 头部: 灰白 + 3 列统计 ============ */}
                <div className="p-4 border-b border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <button
                      type="button"
                      onClick={() => {
                        setNewTrade({
                          ...newTrade,
                          symbol: group.symbol,
                          name: group.name,
                          side: 'buy',
                          date: new Date().toISOString().split('T')[0],
                          price: '',
                          shares: '',
                        });
                        setLookupStatus('found');
                        setShowAddTrade(true);
                      }}
                      className="flex items-center gap-2 text-left active:opacity-70 transition"
                      title={`点击快速添加 ${group.symbol} 交易`}
                    >
                      <div>
                        <div className="font-black text-[18px] text-slate-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>{group.symbol}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[200px]">{group.name}</div>
                      </div>
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <Plus className="w-4 h-4" strokeWidth={2.5} />
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAllTradesModal({ symbol: group.symbol, name: group.name });
                        }}
                        className="text-[11px] text-rose-600 font-bold flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 active:scale-95 transition"
                        title="查看所有交易记录"
                      >
                        📋 全部
                      </button>
                      <div className="text-[11px] text-slate-400">
                        {group.waves.length} 个波段
                      </div>
                    </div>
                  </div>
                  {/* 3 列统计 */}
                  {(() => {
                    const totalGain = group.waves.reduce((sum, w) => sum + (w.gainAmount || 0), 0);
                    const completedCount = completedWaves.length;
                    const winCount = completedWaves.filter(w => w.gainPct > 0).length;
                    const winRate = completedCount > 0 ? Math.round(winCount / completedCount * 100) : 0;
                    const avgHeld = group.avgHeldDays || 0;
                    return (
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-slate-50 rounded-lg p-2 text-center">
                          <div className={`font-black text-[15px] tabular-nums ${totalGain >= 0 ? 'text-rose-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                            {totalGain >= 0 ? '+' : ''}${fmt(Math.abs(totalGain), 0)}
                          </div>
                          <div className="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">总盈亏</div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2 text-center">
                          <div className="font-black text-[15px] text-slate-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                            {completedCount > 0 ? `${winRate}%` : '—'}
                          </div>
                          <div className="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">胜率 {completedCount > 0 ? `${winCount}/${completedCount}` : ''}</div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2 text-center">
                          <div className="font-black text-[15px] text-slate-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                            {avgHeld > 0 ? `${avgHeld}天` : '—'}
                          </div>
                          <div className="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">均持有</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* ============ 进行中独立大卡 (如果有) ============ */}
                {activeWave && (() => {
                  const w = activeWave;
                  const noteValue = waveNotes[w.id] || '';
                  const isEditingNote = editingNoteId === w.id;
                  const isExpanded = expandedWaves[w.id] || false;
                  const startD = (w.startDate || '').slice(5);
                  const waveTrades = [...(w.buys || []), ...(w.sells || [])]
                    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id - b.id));
                  return (
                    <div
                      className="m-3 rounded-xl relative"
                      style={{
                        background: 'linear-gradient(135deg, #fef2f2 0%, #fff 100%)',
                        border: '2px solid #fecaca',
                      }}
                    >
                      {/* 悬挂角标 "进行中 #N" */}
                      <div
                        className="absolute -top-2.5 left-4 px-2.5 py-0.5 rounded text-[10px] font-black tracking-wider text-white flex items-center gap-1.5"
                        style={{ background: '#e11d48' }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                        进行中 · #{w.index}
                      </div>

                      {/* 主行 */}
                      <button
                        onClick={() => setExpandedWaves({ ...expandedWaves, [w.id]: !isExpanded })}
                        className="w-full p-4 pt-5 text-left"
                      >
                        <div className="flex items-baseline justify-between mb-3">
                          <div className="text-[12px] text-slate-500 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                            {startD} 开始 · 第 {w.heldDays} 天
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className={`font-black text-[24px] tabular-nums ${w.gainPct >= 0 ? 'text-rose-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                              {w.gainPct >= 0 ? '+' : ''}{(w.gainPct * 100).toFixed(1)}%
                            </span>
                            <span className={`text-slate-400 text-xs transition ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                          </div>
                        </div>

                        {/* 4 列详情: 买入均 / 现价 / 持有 / 浮盈 (v10.7.9.15) */}
                        <div className="flex gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.7)' }}>
                          <div className="flex-1">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">买入均</div>
                            <div className="font-black text-slate-900 tabular-nums text-[13px]" style={{ fontFamily: 'ui-monospace, monospace' }}>${w.avgBuyPrice.toFixed(2)}</div>
                          </div>
                          <div className="flex-1">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">现价</div>
                            <div
                              className={`font-black tabular-nums text-[13px] ${w.currentPrice > w.avgBuyPrice ? 'text-rose-600' : w.currentPrice < w.avgBuyPrice ? 'text-emerald-600' : 'text-slate-900'}`}
                              style={{ fontFamily: 'ui-monospace, monospace' }}
                            >
                              {w.currentPrice > 0 ? `$${w.currentPrice.toFixed(2)}` : '—'}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">持有</div>
                            <div className="font-black text-slate-900 tabular-nums text-[13px]" style={{ fontFamily: 'ui-monospace, monospace' }}>{w.heldShares} 股</div>
                          </div>
                          <div className="flex-1">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">浮盈</div>
                            <div className={`font-black tabular-nums text-[13px] ${w.gainAmount >= 0 ? 'text-rose-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                              {w.gainAmount >= 0 ? '+' : ''}${fmt(Math.abs(w.gainAmount), 0)}
                            </div>
                          </div>
                        </div>
                      </button>

                      {/* 备注 */}
                      <div className="px-4 pb-2">
                        {isEditingNote ? (
                          <input
                            type="text"
                            autoFocus
                            defaultValue={noteValue}
                            placeholder="如:关税恐慌、新冠崩盘、AI 浪潮…"
                            className="w-full px-2 py-1 border border-rose-300 rounded text-[12px]"
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
                        ) : noteValue ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                            className="text-[12px] text-slate-600 italic px-1 py-0.5 rounded hover:bg-rose-50 active:scale-98 transition w-fit max-w-full text-left"
                          >
                            💬 {noteValue}
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                            className="text-[11px] text-rose-500 hover:text-rose-700 active:scale-95 transition"
                          >
                            + 加备注
                          </button>
                        )}
                      </div>

                      {/* 展开:交易明细 */}
                      {isExpanded && (
                        <div className="px-4 pb-3 pt-1 border-t border-rose-100">
                          <div className="text-[11px] text-slate-500 uppercase tracking-wider font-bold mb-2 mt-2">📋 交易明细</div>
                          <div className="space-y-2">
                            {waveTrades.map(t => {
                              const isBuy = !t.side || t.side === 'buy';
                              const amount = t.shares * t.price;
                              return (
                                <div key={t.id} className="flex items-center justify-between py-2 px-2.5 bg-white rounded-lg border border-slate-100">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`px-1.5 py-0.5 rounded text-[11px] font-black text-white shrink-0 ${isBuy ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                                      {isBuy ? '买' : '卖'}
                                    </span>
                                    <span className="text-[13px] text-slate-500 tabular-nums shrink-0" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                      {(t.date || '').slice(5)}
                                    </span>
                                    <span className="text-[13px] text-slate-700 tabular-nums truncate" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                      {t.shares}股 @${fmt(t.price)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-[13px] font-bold tabular-nums ${isBuy ? 'text-slate-900' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                                      {isBuy ? '-' : '+'}${fmt(amount, 0)}
                                    </span>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setTradeDeleteConfirmId(t.id); }}
                                      className="w-5 h-5 rounded-full bg-slate-100 hover:bg-red-500 hover:text-white text-slate-400 flex items-center justify-center text-[10px] font-bold transition active:scale-90"
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
                })()}

                {/* ============ 已完成列表 (紧凑) ============ */}
                {completedWaves.length > 0 && (
                  <>
                    <div className="px-4 pt-2 pb-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      已完成 ({completedWaves.length})
                    </div>
                    <div className="divide-y divide-slate-50">
                      {completedWaves.map(w => {
                        const noteValue = waveNotes[w.id] || '';
                        const isEditingNote = editingNoteId === w.id;
                        const isExpanded = expandedWaves[w.id] || false;
                        const startD = (w.startDate || '').slice(5);
                        const endD = (w.endDate || '').slice(5);
                        const waveTrades = [...(w.buys || []), ...(w.sells || [])]
                          .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id - b.id));
                        return (
                          <div key={w.id}>
                            <button
                              onClick={() => setExpandedWaves({ ...expandedWaves, [w.id]: !isExpanded })}
                              className="w-full px-4 py-2.5 text-left active:bg-slate-50 transition grid grid-cols-[28px_1fr_auto] items-center gap-2.5"
                            >
                              {/* 编号 */}
                              <span className="text-slate-300 font-bold text-[14px] tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                #{w.index}
                              </span>
                              {/* 信息 */}
                              <div>
                                <div className="text-[13px] text-slate-900 font-bold tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  {startD} → {endD}
                                  <span className="text-[11px] text-slate-400 font-normal ml-1.5">· {w.heldDays}天</span>
                                </div>
                                <div className="text-[11px] text-slate-500 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  ${w.avgBuyPrice.toFixed(2)} → ${w.avgSellPrice.toFixed(2)}
                                </div>
                              </div>
                              {/* 收益 */}
                              <div className="text-right">
                                <div className={`font-black text-[15px] tabular-nums ${w.gainPct >= 0 ? 'text-rose-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  {w.gainPct >= 0 ? '+' : ''}{(w.gainPct * 100).toFixed(1)}%
                                </div>
                                <div className={`text-[11px] tabular-nums ${w.gainAmount >= 0 ? 'text-slate-500' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  {w.gainAmount >= 0 ? '+' : ''}${fmt(Math.abs(w.gainAmount), 0)}
                                </div>
                              </div>
                            </button>

                            {/* 备注 */}
                            {(noteValue || isEditingNote) && (
                              <div className="px-4 pb-2 -mt-1">
                                {isEditingNote ? (
                                  <input
                                    type="text"
                                    autoFocus
                                    defaultValue={noteValue}
                                    placeholder="如:关税恐慌、新冠崩盘、AI 浪潮…"
                                    className="w-full px-2 py-1 border border-blue-300 rounded text-[11px]"
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const newVal = e.target.value;
                                        setWaveNotes({ ...waveNotes, [w.id]: newVal });
                                        db.upsertWaveNote(w.id, newVal).catch(err => console.error('备注保存失败:', err));
                                        setEditingNoteId(null);
                                      } else if (e.key === 'Escape') setEditingNoteId(null);
                                    }}
                                    onBlur={(e) => {
                                      const newVal = e.target.value;
                                      setWaveNotes({ ...waveNotes, [w.id]: newVal });
                                      db.upsertWaveNote(w.id, newVal).catch(err => console.error('备注保存失败:', err));
                                      setEditingNoteId(null);
                                    }}
                                  />
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                                    className="text-[11px] text-slate-500 italic px-1 py-0.5 rounded hover:bg-slate-100 active:scale-98 transition w-fit max-w-full text-left"
                                  >
                                    💬 {noteValue}
                                  </button>
                                )}
                              </div>
                            )}
                            {!noteValue && !isEditingNote && (
                              <div className="px-4 pb-2 -mt-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                                  className="text-[10px] text-slate-300 hover:text-blue-500 active:scale-95 transition"
                                >
                                  + 加备注
                                </button>
                              </div>
                            )}

                            {/* 展开明细 */}
                            {isExpanded && (
                              <div className="px-4 pb-3 pt-1 bg-slate-50/50 border-t border-slate-100">
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider font-bold mb-2 mt-2">📋 交易明细</div>
                                <div className="space-y-2">
                                  {waveTrades.map(t => {
                                    const isBuy = !t.side || t.side === 'buy';
                                    const amount = t.shares * t.price;
                                    return (
                                      <div key={t.id} className="flex items-center justify-between py-2 px-2.5 bg-white rounded-lg border border-slate-100">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-black text-white shrink-0 ${isBuy ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                                            {isBuy ? '买' : '卖'}
                                          </span>
                                          <span className="text-[13px] text-slate-500 tabular-nums shrink-0" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                            {(t.date || '').slice(5)}
                                          </span>
                                          <span className="text-[13px] text-slate-700 tabular-nums truncate" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                            {t.shares}股 @${fmt(t.price)}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <span className={`text-[13px] font-bold tabular-nums ${isBuy ? 'text-slate-900' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                                            {isBuy ? '-' : '+'}${fmt(amount, 0)}
                                          </span>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setTradeDeleteConfirmId(t.id); }}
                                            className="w-5 h-5 rounded-full bg-slate-100 hover:bg-red-500 hover:text-white text-slate-400 flex items-center justify-center text-[10px] font-bold transition active:scale-90"
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
                  </>
                )}
              </div>
              );
            })}

          </>
        )}

        {/* 添加成交按钮 */}
        <button
          onClick={() => setShowAddTrade(!showAddTrade)}
          className="w-full mb-3 py-3 rounded-2xl font-black flex items-center justify-center gap-2 active:scale-95 transition"
          style={{
            background: '#fff',
            color: '#d97706',
            border: '2px solid #fbbf24',
          }}
        >
          <Plus className="w-5 h-5" strokeWidth={3} /> 添加交易
        </button>

        {/* 添加成交表单 - Modal 弹窗 */}
        {showAddTrade && (
          <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in"
            onClick={(e) => { if (e.target === e.currentTarget) setShowAddTrade(false); }}
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <div
              className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              {/* 顶部把手 + 标题 */}
              <div className="sticky top-0 bg-white pt-3 pb-2 px-4 border-b border-slate-100 z-10">
                <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-2 sm:hidden" />
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-black text-slate-900">添加交易</h2>
                  <button
                    onClick={() => setShowAddTrade(false)}
                    className="text-slate-400 hover:text-slate-600 active:scale-90 transition w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="p-4">
                {/* 买/卖切换 */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setNewTrade({ ...newTrade, side: 'buy' })}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition active:scale-95 ${newTrade.side === 'buy' ? 'bg-red-600 text-white shadow' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}
                  >
                    买入
                  </button>
                  <button
                    onClick={() => setNewTrade({ ...newTrade, side: 'sell' })}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition active:scale-95 ${newTrade.side === 'sell' ? 'bg-emerald-600 text-white shadow' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}
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
                <div className="grid grid-cols-2 gap-2 mb-4">
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
                  <button onClick={addTrade} className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-black active:scale-95 shadow">确认添加</button>
                  <button onClick={() => setShowAddTrade(false)} className="flex-1 py-3 bg-slate-200 text-slate-700 rounded-xl text-sm font-bold active:scale-95">取消</button>
                </div>
              </div>
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

        {/* ====== 资产 tab ====== */}
        {activeTab === 'analysis' && (<>
          {(() => {
            // ============ 工具函数 ============
            const currentMonth = new Date().toISOString().slice(0, 7); // '2026-04'
            const lastMonthDate = new Date();
            lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
            const lastMonth = lastMonthDate.toISOString().slice(0, 7);

            // 本年初 (2026-01)
            const yearStart = currentMonth.slice(0, 4) + '-01';

            // 12 个月前
            const yearAgoDate = new Date();
            yearAgoDate.setMonth(yearAgoDate.getMonth() - 12);
            const yearAgo = yearAgoDate.toISOString().slice(0, 7);

            // 最近 12 个月的月份列表 (从 12 月前到当月)
            const last12Months = [];
            for (let i = 11; i >= 0; i--) {
              const d = new Date();
              d.setMonth(d.getMonth() - i);
              last12Months.push(d.toISOString().slice(0, 7));
            }

            // ============ 数据函数 ============
            const getBalance = (accId, month) => {
              const snap = snapshots.find(s => s.accountId === accId && s.month === month);
              return snap ? snap.balance : 0;
            };
            const toCNY = (balance, currency) => {
              if (currency === 'USD') return balance * usdRate;
              if (currency === 'HKD') return balance * hkdRate;
              return balance;  // CNY 直接返回
            };
            const balanceAtMonthCNY = (accId, month) => {
              const acc = accounts.find(a => a.id === accId);
              if (!acc) return 0;
              return toCNY(getBalance(accId, month), acc.currency);
            };
            const totalAtMonth = (month) =>
              accounts.reduce((sum, acc) => sum + balanceAtMonthCNY(acc.id, month), 0);

            // 万单位格式化 (保留 1 位小数)
            const fmtWan = (n) => {
              const v = Math.abs(n) / 10000;
              return v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
            };

            // ============ 核心数据 ============
            const totalNow = totalAtMonth(currentMonth);
            const totalLast = totalAtMonth(lastMonth);
            const totalYearStart = totalAtMonth(yearStart);
            const totalYearAgo = totalAtMonth(yearAgo);

            const monthChange = totalNow - totalLast;
            const monthChangePct = totalLast > 0 ? (monthChange / totalLast) * 100 : 0;
            const ytdChange = totalNow - totalYearStart;
            const ytdChangePct = totalYearStart > 0 ? (ytdChange / totalYearStart) * 100 : 0;
            const yearChange = totalNow - totalYearAgo;
            const yearChangePct = totalYearAgo > 0 ? (yearChange / totalYearAgo) * 100 : 0;

            // 12 个月走势数据
            const chartData = last12Months.map(m => totalAtMonth(m));
            const nonZero = chartData.filter(v => v > 0);
            const chartMin = nonZero.length > 0 ? Math.min(...nonZero) : 0;
            const chartMax = nonZero.length > 0 ? Math.max(...nonZero) : 0;
            const chartRange = chartMax - chartMin || 1;

            // 按持有人分组
            const myAccounts = accounts.filter(a => a.owner === '我');
            const wifeAccounts = accounts.filter(a => a.owner === '老婆');
            const myTotal = myAccounts.reduce((s, a) => s + balanceAtMonthCNY(a.id, currentMonth), 0);
            const wifeTotal = wifeAccounts.reduce((s, a) => s + balanceAtMonthCNY(a.id, currentMonth), 0);
            const myPct = totalNow > 0 ? (myTotal / totalNow) * 100 : 0;
            const wifePct = totalNow > 0 ? (wifeTotal / totalNow) * 100 : 0;

            return (
              <>
                {/* ============ 顶部:总资产卡 (奢华黑金) ============ */}
                <div
                  className="rounded-2xl p-5 mb-4 text-white relative overflow-hidden"
                  style={{
                    background: `
                      radial-gradient(circle at 0% 0%, rgba(251, 191, 36, 0.15) 0%, transparent 50%),
                      radial-gradient(circle at 100% 100%, rgba(245, 158, 11, 0.1) 0%, transparent 50%),
                      linear-gradient(135deg, #0a0a0a 0%, #171717 50%, #0a0a0a 100%)
                    `,
                    border: '1px solid rgba(251, 191, 36, 0.2)',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(251, 191, 36, 0.1)',
                  }}
                >
                  {/* 金色光晕装饰 */}
                  <div className="absolute top-0 right-0 w-44 h-44 pointer-events-none" style={{
                    background: 'radial-gradient(circle, rgba(251, 191, 36, 0.18) 0%, transparent 70%)',
                    transform: 'translate(40%, -40%)',
                  }}></div>

                  <div className="flex items-center justify-between mb-3 relative z-10">
                    {/* 金色渐变标题 */}
                    <div
                      className="text-[10px] uppercase font-bold"
                      style={{
                        letterSpacing: '3px',
                        background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      家庭总资产
                    </div>
                    {/* 金色边框按钮 */}
                    <button
                      onClick={() => setShowMonthsDetail(true)}
                      className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-md active:scale-95 transition"
                      style={{
                        color: '#fbbf24',
                        background: 'rgba(251, 191, 36, 0.1)',
                        border: '1px solid rgba(251, 191, 36, 0.3)',
                      }}
                      title="查看 12 个月走势"
                    >
                      <Calendar className="w-3 h-3" />
                      {currentMonth}
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>

                  {/* 主数字 - 金色渐变 */}
                  <div
                    className="text-4xl font-black tabular-nums relative z-10"
                    style={{
                      fontFamily: 'ui-monospace, "SF Mono", monospace',
                      background: 'linear-gradient(135deg, #fef3c7 0%, #fbbf24 50%, #f59e0b 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      letterSpacing: '-1px',
                    }}
                  >
                    ¥{fmtWan(totalNow)}<span className="text-lg ml-1 font-bold">万</span>
                  </div>

                  {/* 金色分隔线 */}
                  <div
                    className="h-px my-4"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, rgba(251, 191, 36, 0.3) 50%, transparent 100%)',
                    }}
                  ></div>

                  {/* 3 个指标 */}
                  <div className="grid grid-cols-3 gap-3 relative z-10">
                    <div>
                      <div
                        className="text-[9px] uppercase font-bold mb-1"
                        style={{
                          color: '#a3a3a3',
                          letterSpacing: '1.5px',
                        }}
                      >
                        较上月
                      </div>
                      {totalLast > 0 ? (
                        <>
                          <div className={`text-xs font-bold tabular-nums flex items-center gap-0.5`} style={{ color: monthChange >= 0 ? '#fda4af' : '#6ee7b7' }}>
                            {monthChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {monthChange >= 0 ? '+' : '-'}¥{fmtWan(monthChange)}万
                          </div>
                          <div className="text-[11px] font-bold" style={{ color: monthChange >= 0 ? '#fda4af' : '#6ee7b7' }}>
                            {monthChangePct >= 0 ? '+' : ''}{monthChangePct.toFixed(1)}%
                          </div>
                        </>
                      ) : (
                        <div className="text-[11px] text-slate-500">无数据</div>
                      )}
                    </div>
                    <div style={{ borderLeft: '1px solid rgba(251, 191, 36, 0.15)', paddingLeft: '12px' }}>
                      <div
                        className="text-[9px] uppercase font-bold mb-1"
                        style={{ color: '#a3a3a3', letterSpacing: '1.5px' }}
                      >
                        年初至今
                      </div>
                      {totalYearStart > 0 ? (
                        <>
                          <div className="text-xs font-bold tabular-nums flex items-center gap-0.5" style={{ color: ytdChange >= 0 ? '#fda4af' : '#6ee7b7' }}>
                            {ytdChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {ytdChange >= 0 ? '+' : '-'}¥{fmtWan(ytdChange)}万
                          </div>
                          <div className="text-[11px] font-bold" style={{ color: ytdChange >= 0 ? '#fda4af' : '#6ee7b7' }}>
                            {ytdChangePct >= 0 ? '+' : ''}{ytdChangePct.toFixed(1)}%
                          </div>
                        </>
                      ) : (
                        <div className="text-[11px] text-slate-500">无数据</div>
                      )}
                    </div>
                    <div style={{ borderLeft: '1px solid rgba(251, 191, 36, 0.15)', paddingLeft: '12px' }}>
                      <div
                        className="text-[9px] uppercase font-bold mb-1"
                        style={{ color: '#a3a3a3', letterSpacing: '1.5px' }}
                      >
                        近一年
                      </div>
                      {totalYearAgo > 0 ? (
                        <>
                          <div className="text-xs font-bold tabular-nums flex items-center gap-0.5" style={{ color: yearChange >= 0 ? '#fda4af' : '#6ee7b7' }}>
                            {yearChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {yearChange >= 0 ? '+' : '-'}¥{fmtWan(yearChange)}万
                          </div>
                          <div className="text-[11px] font-bold" style={{ color: yearChange >= 0 ? '#fda4af' : '#6ee7b7' }}>
                            {yearChangePct >= 0 ? '+' : ''}{yearChangePct.toFixed(1)}%
                          </div>
                        </>
                      ) : (
                        <div className="text-[11px] text-slate-500">无数据</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ============ 12 个月走势图 (有数据时才显示) ============ */}
                {nonZero.length >= 2 && (
                  <div className="rounded-2xl bg-white p-4 shadow mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                        <span>📈</span>
                        <span>12 个月走势</span>
                      </div>
                      <div className="text-[10px] text-slate-500">月度</div>
                    </div>

                    <svg viewBox="0 0 320 120" className="w-full h-32">
                      <defs>
                        <linearGradient id="assetGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25"/>
                          <stop offset="100%" stopColor="#f43f5e" stopOpacity="0"/>
                        </linearGradient>
                      </defs>
                      {/* 网格线 */}
                      {[0, 0.25, 0.5, 0.75, 1].map(t => (
                        <line key={t} x1="0" x2="320" y1={20 + t * 80} y2={20 + t * 80} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="2 2"/>
                      ))}
                      {(() => {
                        // 只画有数据的月份 (v > 0), 空月份断线不画
                        const validPoints = chartData
                          .map((v, i) => ({
                            x: (i / (chartData.length - 1)) * 320,
                            y: 20 + (1 - (v - chartMin) / chartRange) * 80,
                            v,
                            i,
                            isLast: i === chartData.length - 1,
                          }))
                          .filter(p => p.v > 0);

                        if (validPoints.length === 0) return null;

                        // 构造 path (只连有效月份)
                        const pathD = validPoints.length > 1
                          ? `M ${validPoints[0].x} ${validPoints[0].y} ${validPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')}`
                          : '';
                        // 面积 (底部闭合)
                        const areaD = validPoints.length > 1
                          ? `${pathD} L ${validPoints[validPoints.length - 1].x} 120 L ${validPoints[0].x} 120 Z`
                          : '';

                        // 估算 path 总长度 (用于 stroke-dasharray 动画)
                        let pathLength = 0;
                        for (let i = 1; i < validPoints.length; i++) {
                          const dx = validPoints[i].x - validPoints[i - 1].x;
                          const dy = validPoints[i].y - validPoints[i - 1].y;
                          pathLength += Math.sqrt(dx * dx + dy * dy);
                        }

                        // V2 动画参数
                        // - 点: 逐个弹出 (overshoot), 间隔 0.2s
                        // - 线: 0.2s 后开始画, 1.5s 画完
                        // - 面积: 0.8s 后淡入
                        const totalPointDuration = validPoints.length * 0.2;

                        return (
                          <>
                            <style>{`
                              @keyframes assetPop {
                                0%   { opacity: 0; transform: scale(0) translateY(10px); }
                                60%  { opacity: 1; transform: scale(1.4) translateY(0); }
                                100% { opacity: 1; transform: scale(1); }
                              }
                              @keyframes assetDrawLine {
                                from { stroke-dashoffset: ${pathLength}; }
                                to   { stroke-dashoffset: 0; }
                              }
                              @keyframes assetFadeIn {
                                from { opacity: 0; }
                                to   { opacity: 1; }
                              }
                              .asset-chart-dot {
                                opacity: 0;
                                transform-box: fill-box;
                                transform-origin: center;
                                animation: assetPop 0.4s ease-out forwards;
                              }
                              .asset-chart-line {
                                stroke-dasharray: ${pathLength};
                                stroke-dashoffset: ${pathLength};
                                animation: assetDrawLine 1.5s ease-out 0.2s forwards;
                              }
                              .asset-chart-area {
                                opacity: 0;
                                animation: assetFadeIn 1s ease-out 0.8s forwards;
                              }
                              .asset-chart-empty-dot {
                                opacity: 0;
                                animation: assetFadeIn 0.5s ease-out 1.8s forwards;
                              }
                            `}</style>
                            {/* 面积 (延迟淡入) */}
                            {areaD && <path d={areaD} fill="url(#assetGrad)" className="asset-chart-area" />}
                            {/* 折线 (从左画到右) */}
                            {pathD && <path d={pathD} fill="none" stroke="#f43f5e" strokeWidth="2" className="asset-chart-line" />}
                            {/* 数据点 (依次弹出) */}
                            {validPoints.map((p, idx) => (
                              <circle
                                key={p.i}
                                cx={p.x}
                                cy={p.y}
                                r={p.isLast ? 4 : 2}
                                fill={p.isLast ? '#f43f5e' : 'white'}
                                stroke="#f43f5e"
                                strokeWidth="1.5"
                                className="asset-chart-dot"
                                style={{ animationDelay: `${idx * 0.2}s` }}
                              />
                            ))}
                            {/* 空月份提示 (最后淡入) */}
                            {chartData.map((v, i) => {
                              if (v > 0) return null;
                              const x = (i / (chartData.length - 1)) * 320;
                              return (
                                <circle
                                  key={`empty-${i}`}
                                  cx={x}
                                  cy={100}
                                  r={1.5}
                                  fill="#cbd5e1"
                                  opacity="0.6"
                                  className="asset-chart-empty-dot"
                                />
                              );
                            })}
                          </>
                        );
                      })()}
                    </svg>

                    <div className="flex justify-between text-[9px] text-slate-400 font-medium mt-1 px-1">
                      <span>{last12Months[0].slice(5)}月</span>
                      <span>{last12Months[5].slice(5)}月</span>
                      <span>{last12Months[11].slice(5)}月</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100 text-center">
                      <div>
                        <div className="text-[9px] text-slate-500">最低</div>
                        <div className="text-xs font-bold text-slate-700 tabular-nums">¥{fmtWan(chartMin)}万</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-500">最高</div>
                        <div className="text-xs font-bold text-slate-700 tabular-nums">¥{fmtWan(chartMax)}万</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-500">区间</div>
                        <div className="text-xs font-bold text-slate-700 tabular-nums">¥{fmtWan(chartRange)}万</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ============ 操作按钮 ============ */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button
                    onClick={() => { setFillMonth(currentMonth); setShowFillSnapshot(true); }}
                    disabled={accounts.length === 0}
                    className="py-3 rounded-xl font-black text-sm flex items-center justify-center gap-1.5 active:scale-95 transition"
                    style={{
                      background: accounts.length === 0 ? '#e2e8f0' : '#fff',
                      color: accounts.length === 0 ? '#94a3b8' : '#d97706',
                      border: accounts.length === 0 ? '2px solid #cbd5e1' : '2px solid #fbbf24',
                    }}
                  >
                    <Calendar className="w-4 h-4"/> 填月度余额
                  </button>
                  <button
                    onClick={() => setShowAddAccount(true)}
                    className="py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 transition"
                  >
                    <Plus className="w-4 h-4"/> 新增账户
                  </button>
                </div>

                {/* ============ 空状态 ============ */}
                {accounts.length === 0 && (
                  <div className="text-center py-12 px-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border-2 border-dashed border-blue-200 mb-4">
                    <div className="text-5xl mb-3">💰</div>
                    <div className="text-slate-700 font-bold mb-1.5">还没有账户</div>
                    <div className="text-xs text-slate-500 mb-3">添加你和家人的账户,记录每月余额</div>
                    <button
                      onClick={() => setShowAddAccount(true)}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-95 transition text-sm font-bold text-white"
                    >
                      添加第一个账户
                    </button>
                  </div>
                )}

                {/* ============ 持有人分组卡 ============ */}
                {[
                  { owner: '我', icon: '👤', gradient: 'from-blue-50 to-cyan-50 border-blue-100', barColor: '#3b82f6', accounts: myAccounts, total: myTotal, pct: myPct },
                  { owner: '老婆', icon: '👩', gradient: 'from-pink-50 to-rose-50 border-pink-100', barColor: '#ec4899', accounts: wifeAccounts, total: wifeTotal, pct: wifePct },
                ].map(({ owner, icon, gradient, barColor, accounts: ownerAccs, total, pct }) => {
                  if (ownerAccs.length === 0) return null;
                  return (
                    <div key={owner} className={`rounded-2xl bg-gradient-to-br ${gradient} border p-4 shadow-sm mb-4`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{icon}</span>
                          <div>
                            <div className="font-black text-slate-800 text-base">{owner}</div>
                            <div className="text-[10px] text-slate-500 font-medium">{ownerAccs.length} 个账户 · 占总资产 {pct.toFixed(0)}%</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-black text-slate-800 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>¥{fmtWan(total)}万</div>
                        </div>
                      </div>

                      {/* 占比进度条 */}
                      <div className="h-1.5 bg-white/60 rounded-full overflow-hidden mb-3">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }}></div>
                      </div>

                      {/* 账户列表 */}
                      <div className="space-y-2">
                        {ownerAccs.map(acc => {
                          const bal = getBalance(acc.id, currentMonth);
                          const balCNY = toCNY(bal, acc.currency);
                          return (
                            <div key={acc.id} className="bg-white/80 backdrop-blur rounded-xl p-3 flex items-center justify-between transition">
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-lg shrink-0">
                                  {acc.icon || '💰'}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold text-slate-800 text-sm truncate">{acc.name}</div>
                                  <div className="text-[10px] text-slate-500">{acc.type}{acc.currency !== 'CNY' ? ` · ${acc.currency}` : ''}</div>
                                </div>
                              </div>
                              <div className="text-right shrink-0 mr-2">
                                {acc.currency !== 'CNY' ? (
                                  <>
                                    <div className="font-bold text-slate-800 text-sm tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                      {acc.currency === 'USD' ? '$' : 'HK$'}{fmt(bal, 0)}
                                    </div>
                                    <div className="text-[10px] text-slate-500 tabular-nums">≈¥{fmtWan(balCNY)}万</div>
                                  </>
                                ) : (
                                  <div className="font-bold text-slate-800 text-sm tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>¥{fmtWan(bal)}万</div>
                                )}
                              </div>
                              <button
                                onClick={() => setAccountDeleteConfirmId(acc.id)}
                                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-red-500 hover:text-white text-slate-400 flex items-center justify-center text-xs transition active:scale-90"
                                title="删除"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* ============ 美元汇率设置 (有 USD 账户时才显示) ============ */}
                {accounts.some(a => a.currency === 'USD') && (
                  <div className="bg-white rounded-xl p-3 mb-3 shadow flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">💱</span>
                      <div>
                        <div className="text-xs font-bold text-slate-800">美元汇率</div>
                        <div className="text-[10px] text-slate-500">USD → CNY 换算</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">1 USD =</span>
                      <input
                        type="number"
                        step="0.01"
                        value={usdRate}
                        onChange={(e) => setUsdRate(parseFloat(e.target.value) || 7.20)}
                        className="w-16 px-2 py-1 border border-slate-300 rounded text-sm text-center font-bold tabular-nums"
                      />
                      <span className="text-xs text-slate-500">CNY</span>
                    </div>
                  </div>
                )}

                {/* ============ 港币汇率设置 (有 HKD 账户时才显示) ============ */}
                {accounts.some(a => a.currency === 'HKD') && (
                  <div className="bg-white rounded-xl p-3 mb-4 shadow flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">💱</span>
                      <div>
                        <div className="text-xs font-bold text-slate-800">港币汇率</div>
                        <div className="text-[10px] text-slate-500">HKD → CNY 换算</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">1 HKD =</span>
                      <input
                        type="number"
                        step="0.01"
                        value={hkdRate}
                        onChange={(e) => setHkdRate(parseFloat(e.target.value) || 0.87)}
                        className="w-16 px-2 py-1 border border-slate-300 rounded text-sm text-center font-bold tabular-nums"
                      />
                      <span className="text-xs text-slate-500">CNY</span>
                    </div>
                  </div>
                )}

                {/* ====== 添加账户 Modal ====== */}
                {showAddAccount && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddAccount(false)}>
                    <div className="bg-white rounded-2xl p-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-base">添加账户</h3>
                        <button onClick={() => setShowAddAccount(false)} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">拥有人</label>
                          <div className="grid grid-cols-2 gap-2">
                            {['我', '老婆'].map(o => (
                              <button
                                key={o}
                                onClick={() => setNewAccount({...newAccount, owner: o})}
                                className={`py-2 rounded-lg text-sm font-bold transition ${newAccount.owner === o ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                              >{o}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">类型</label>
                          <div className="grid grid-cols-4 gap-1">
                            {[
                              { t: '银行', i: '🏦' },
                              { t: '证券', i: '📈' },
                              { t: '支付宝', i: '💚' },
                              { t: '微信', i: '💬' },
                              { t: '定期', i: '🔒' },
                              { t: '现金', i: '💵' },
                              { t: '公积金', i: '🏛️' },
                              { t: '其他', i: '💰' },
                            ].map(({ t, i }) => (
                              <button
                                key={t}
                                onClick={() => setNewAccount({...newAccount, type: t, icon: i})}
                                className={`py-2 rounded-lg text-xs font-bold transition flex flex-col items-center gap-0.5 ${newAccount.type === t ? 'bg-blue-100 text-blue-700 border-2 border-blue-500' : 'bg-slate-50 text-slate-600 border-2 border-transparent'}`}
                              >
                                <span className="text-base">{i}</span>
                                <span>{t}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">账户名</label>
                          {/* 快捷预设 (按类型动态显示) */}
                          {(() => {
                            const presets = {
                              '银行':   ['招商银行', '招商永隆', '工商银行', '建设银行', '中国银行'],
                              '证券':   ['长桥证券', 'IBKR', '富途', '老虎', '华泰证券', '东方财富'],
                              '支付宝': ['支付宝现金', '支付宝理财'],
                              '微信':   ['微信钱包', '微信零钱通'],
                              '定期':   ['银行定期', '大额存单', '货币基金'],
                              '现金':   ['现金'],
                              '公积金': ['住房公积金', '企业年金'],
                              '其他':   ['房产', '车', '黄金', '保险'],
                            };
                            const list = presets[newAccount.type] || [];
                            if (list.length === 0) return null;
                            return (
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {list.map(p => (
                                  <button
                                    key={p}
                                    onClick={() => setNewAccount({...newAccount, name: p})}
                                    className={`px-2 py-1 rounded-md text-xs font-bold transition ${
                                      newAccount.name === p
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700'
                                    }`}
                                  >
                                    {p}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                          <input
                            type="text"
                            value={newAccount.name}
                            onChange={(e) => setNewAccount({...newAccount, name: e.target.value})}
                            placeholder="点上面快捷选或自己输入"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">币种</label>
                          <div className="grid grid-cols-3 gap-2">
                            {['CNY', 'USD', 'HKD'].map(c => (
                              <button
                                key={c}
                                onClick={() => setNewAccount({...newAccount, currency: c})}
                                className={`py-2 rounded-lg text-sm font-bold transition ${newAccount.currency === c ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                              >{c}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">当前余额 (可稍后填)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={newAccount.balance}
                            onChange={(e) => setNewAccount({...newAccount, balance: e.target.value})}
                            placeholder="0"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => setShowAddAccount(false)}
                          className="flex-1 py-2.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold"
                        >取消</button>
                        <button
                          onClick={async () => {
                            if (!newAccount.name.trim()) { alert('请填写账户名'); return; }
                            // 检查同人同名 (本地预检查, 云端还有 UNIQUE 约束兜底)
                            if (accounts.find(a => a.owner === newAccount.owner && a.name === newAccount.name.trim())) {
                              alert('该账户已存在');
                              return;
                            }
                            try {
                              // 1. 先写云端
                              const saved = await db.insertAccount({
                                owner: newAccount.owner,
                                type: newAccount.type,
                                name: newAccount.name.trim(),
                                currency: newAccount.currency,
                                icon: newAccount.icon,
                                sortOrder: accounts.length,
                              });
                              // 2. 用云端返回的真实 id 更新本地 state
                              setAccounts([...accounts, saved]);
                              // 3. 如果填了余额, 云端插一条快照
                              if (newAccount.balance && parseFloat(newAccount.balance) > 0) {
                                const val = parseFloat(newAccount.balance);
                                await db.upsertSnapshot(saved.id, currentMonth, val);
                                setSnapshots([...snapshots, {
                                  id: 'new_' + Date.now(),
                                  accountId: saved.id,
                                  month: currentMonth,
                                  balance: val,
                                }]);
                              }
                              setNewAccount({ owner: '我', type: '银行', name: '', currency: 'CNY', icon: '🏦', balance: '' });
                              setShowAddAccount(false);
                            } catch (e) {
                              console.error('[添加账户] 失败:', e);
                              alert('添加失败: ' + (e.message || '未知错误'));
                            }
                          }}
                          className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold"
                        >添加</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ====== 删除账户确认 Modal ====== */}
                {accountDeleteConfirmId && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setAccountDeleteConfirmId(null)}>
                    <div className="bg-white rounded-2xl p-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                      <h3 className="font-bold text-base mb-2">删除账户</h3>
                      <p className="text-sm text-slate-600 mb-4">
                        删除 <span className="font-bold">{accounts.find(a => a.id === accountDeleteConfirmId)?.name}</span> ?
                        <br/><span className="text-xs text-slate-400">该账户所有月度快照也会一起删除</span>
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setAccountDeleteConfirmId(null)}
                          className="flex-1 py-2.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold"
                        >取消</button>
                        <button
                          onClick={async () => {
                            const accId = accountDeleteConfirmId;
                            try {
                              // 云端删除 (snapshots 通过外键 cascade 自动删)
                              await db.deleteAccount(accId);
                              setAccounts(accounts.filter(a => a.id !== accId));
                              setSnapshots(snapshots.filter(s => s.accountId !== accId));
                              setAccountDeleteConfirmId(null);
                            } catch (e) {
                              console.error('[删除账户] 失败:', e);
                              alert('删除失败: ' + (e.message || '未知错误'));
                            }
                          }}
                          className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold"
                        >删除</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ====== 12 个月资产走势 Modal ====== */}
                {showMonthsDetail && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowMonthsDetail(false)}>
                    <div className="bg-white rounded-2xl p-4 max-w-sm w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-base flex items-center gap-1.5">
                          <span>📅</span>
                          <span>12 个月资产走势</span>
                        </h3>
                        <button onClick={() => setShowMonthsDetail(false)} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* 列表: 最新在顶部 */}
                      <div className="space-y-1">
                        {[...last12Months].reverse().map((m, idx) => {
                          const reversedIdx = last12Months.length - 1 - idx; // 原始索引
                          const total = chartData[reversedIdx];
                          const prevTotal = reversedIdx > 0 ? chartData[reversedIdx - 1] : 0;
                          const change = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
                          const isCurrent = m === currentMonth;
                          const isYearStart = m.endsWith('-01');
                          const hasData = total > 0;

                          return (
                            <div
                              key={m}
                              className={`flex items-center justify-between py-2.5 px-3 rounded-lg transition ${
                                isCurrent
                                  ? 'bg-blue-50 border-2 border-blue-200'
                                  : hasData
                                    ? 'bg-slate-50 hover:bg-slate-100'
                                    : 'bg-slate-50/50 opacity-50'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className={`text-sm font-black tabular-nums ${isCurrent ? 'text-blue-700' : 'text-slate-800'}`}>
                                  {m}
                                </div>
                                {isYearStart && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-bold">年初</span>
                                )}
                                {isCurrent && (
                                  <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[9px] font-bold">本月</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`text-sm font-bold tabular-nums ${isCurrent ? 'text-blue-700' : hasData ? 'text-slate-900' : 'text-slate-400'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  {hasData ? `¥${fmtWan(total)}万` : '无数据'}
                                </div>
                                {hasData && change !== null ? (
                                  <div className={`text-[11px] font-bold tabular-nums min-w-[45px] text-right ${change >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {change >= 0 ? '↑' : '↓'}{Math.abs(change).toFixed(1)}%
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-slate-300 min-w-[45px] text-right">—</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* 底部: 快捷操作 */}
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <button
                          onClick={() => {
                            setShowMonthsDetail(false);
                            setFillMonth(currentMonth);
                            setShowFillSnapshot(true);
                          }}
                          className="w-full py-2.5 rounded-lg text-sm font-black active:scale-95 transition flex items-center justify-center gap-1.5"
                          style={{
                            background: '#fff',
                            color: '#d97706',
                            border: '2px solid #fbbf24',
                          }}
                        >
                          <Plus className="w-4 h-4"/> 补录/修改月度余额
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ====== 填快照 Modal ====== */}
                {showFillSnapshot && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setShowFillSnapshot(false); setSnapshotDraft({}); }}>
                    <div className="bg-white rounded-2xl p-4 max-w-sm w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-base">填月度余额</h3>
                        <button onClick={() => { setShowFillSnapshot(false); setSnapshotDraft({}); }} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* 月份选择器 */}
                      <div className="bg-slate-50 rounded-lg p-3 mb-3">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">选择月份</div>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            onClick={() => {
                              const d = new Date(fillMonth + '-15');
                              d.setMonth(d.getMonth() - 1);
                              setFillMonth(d.toISOString().slice(0, 7));
                              setSnapshotDraft({}); // 切月清空草稿
                            }}
                            className="w-9 h-9 rounded-lg bg-white border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95 transition font-bold"
                          >
                            ‹
                          </button>
                          <div className="flex-1 text-center">
                            <div className="text-lg font-black text-slate-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>{fillMonth}</div>
                            {fillMonth === currentMonth && (
                              <div className="text-[10px] text-blue-600 font-bold">本月</div>
                            )}
                            {fillMonth > currentMonth && (
                              <div className="text-[10px] text-amber-600 font-bold">未来月</div>
                            )}
                            {fillMonth < currentMonth && (
                              <div className="text-[10px] text-slate-500 font-bold">历史月</div>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              const d = new Date(fillMonth + '-15');
                              d.setMonth(d.getMonth() + 1);
                              setFillMonth(d.toISOString().slice(0, 7));
                              setSnapshotDraft({});
                            }}
                            className="w-9 h-9 rounded-lg bg-white border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95 transition font-bold"
                          >
                            ›
                          </button>
                        </div>
                        {/* 快捷跳转 */}
                        {fillMonth !== currentMonth && (
                          <button
                            onClick={() => { setFillMonth(currentMonth); setSnapshotDraft({}); }}
                            className="w-full mt-2 py-1.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold active:scale-95 transition"
                          >
                            回到本月 ({currentMonth})
                          </button>
                        )}
                      </div>

                      {/* Tab 切换: 我 / 老婆 */}
                      {(() => {
                        const myAccs = accounts.filter(a => a.owner === '我');
                        const wifeAccs = accounts.filter(a => a.owner === '老婆');
                        const hasMulti = myAccs.length > 0 && wifeAccs.length > 0;

                        // 当前 Tab 过滤 (单人时不显示 Tab, 直接全部)
                        const currentAccs = hasMulti
                          ? (snapshotTab === '我' ? myAccs : wifeAccs)
                          : accounts;

                        // 小计 (CNY)
                        const curSum = currentAccs.reduce((sum, acc) => {
                          const v = parseFloat(snapshotDraft[acc.id] ?? getBalance(acc.id, fillMonth) ?? 0) || 0;
                          return sum + toCNY(v, acc.currency);
                        }, 0);

                        return (
                          <>
                            {hasMulti && (
                              <div className="flex gap-0 bg-slate-100 p-1 rounded-lg mb-3">
                                {[
                                  { owner: '我', icon: '👤', accs: myAccs, color: '#3b82f6' },
                                  { owner: '老婆', icon: '👩', accs: wifeAccs, color: '#ec4899' },
                                ].map(({ owner, icon, accs }) => {
                                  const active = snapshotTab === owner;
                                  return (
                                    <button
                                      key={owner}
                                      onClick={() => setSnapshotTab(owner)}
                                      className={`flex-1 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-1.5 active:scale-95 transition ${
                                        active ? 'bg-white text-slate-900 shadow' : 'text-slate-500'
                                      }`}
                                    >
                                      <span>{icon}</span>
                                      <span>{owner}</span>
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                        active ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-500'
                                      }`}>{accs.length}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* 小计 */}
                            {hasMulti && (
                              <div className="text-[11px] text-slate-500 mb-2 flex items-center justify-between">
                                <span>{snapshotTab} · {currentAccs.length} 个账户</span>
                                <span className="font-bold text-slate-700 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  ≈ ¥{fmt(curSum, 0)}
                                </span>
                              </div>
                            )}

                            <div className="space-y-2">
                              {currentAccs.map(acc => {
                                const currentBal = getBalance(acc.id, fillMonth);
                                const draftVal = snapshotDraft[acc.id] ?? (currentBal || '');
                                return (
                                  <div key={acc.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50">
                                    <span className="text-lg">{acc.icon || '💰'}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-bold truncate">{acc.name}</div>
                                      <div className="text-[10px] text-slate-500">{acc.currency}</div>
                                    </div>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={draftVal}
                                      onChange={(e) => setSnapshotDraft({...snapshotDraft, [acc.id]: e.target.value})}
                                      placeholder="0"
                                      className="w-24 px-2 py-1.5 border border-slate-300 rounded text-sm tabular-nums text-right"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => { setShowFillSnapshot(false); setSnapshotDraft({}); }}
                          className="flex-1 py-2.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold"
                        >取消</button>
                        <button
                          onClick={async () => {
                            // 收集有效数据
                            const validEntries = Object.entries(snapshotDraft)
                              .map(([accId, valStr]) => ({ accId, val: parseFloat(valStr) }))
                              .filter(({ val }) => !isNaN(val) && val >= 0);

                            if (validEntries.length === 0) {
                              setShowFillSnapshot(false);
                              setSnapshotDraft({});
                              return;
                            }

                            try {
                              // 并发写云端 (每个账户独立 upsert)
                              await Promise.all(
                                validEntries.map(({ accId, val }) =>
                                  db.upsertSnapshot(accId, fillMonth, val)
                                )
                              );

                              // 本地 state 同步更新
                              const newSnapshots = [...snapshots];
                              validEntries.forEach(({ accId, val }) => {
                                const idx = newSnapshots.findIndex(s => s.accountId === accId && s.month === fillMonth);
                                if (idx >= 0) {
                                  newSnapshots[idx] = { ...newSnapshots[idx], balance: val };
                                } else {
                                  newSnapshots.push({
                                    id: 'new_' + Date.now() + '_' + accId,
                                    accountId: accId,
                                    month: fillMonth,
                                    balance: val,
                                  });
                                }
                              });
                              setSnapshots(newSnapshots);
                              setSnapshotDraft({});
                              setShowFillSnapshot(false);
                            } catch (e) {
                              console.error('[保存快照] 失败:', e);
                              alert('保存失败: ' + (e.message || '未知错误'));
                            }
                          }}
                          className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold"
                        >保存 {fillMonth}</button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </>)}
        {/* ====== 分析 tab 结束 ====== */}

        {/* ====== 复盘 tab ====== */}
        {activeTab === 'review' && (<>
          {(() => {
            // === 工具函数 ===
            const fmtWan = (n, d = 0) => {
              const v = Math.abs(n) / 10000;
              return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
            };
            // 📌 核心: 统一金额显示函数 (根据 displayCurrency 切换)
            // 数据库永远存 USD, CNY 模式时显示 × usdRate
            const displayCurrency = investmentPlan.displayCurrency || 'USD';
            const isCNY = displayCurrency === 'CNY';
            const symbol = isCNY ? '¥' : '$';
            const rate = isCNY ? (usdRate || 7.2) : 1;
            // 金额带"万"单位显示 (USD: $240 万, CNY: ¥1728 万)
            const fmtMoney = (usdValue, d = 1) => `${symbol}${fmtWan(usdValue * rate, d)} 万`;
            const fmtWanUSD = fmtMoney;  // 兼容旧调用, 自动切

            // ============================================
            // 🧠 复利计划核心计算 (柔性目标 + 宽松推演)
            // ============================================
            const PLAN = investmentPlan;
            // 规则:
            //   1. 每年起点 = 上年终点 (实际或推演)
            //   2. 计划增长 = 起点 × 年化率 (柔性, 联动上年实际)
            //   3. 实际增长 = 用户填的 (可空)
            //   4. 终点 = 起点 + 实际增长
            //   5. 未填年: 假设达标 20%, 标记为 isProjected
            //   6. 智能补全: 填一个自动算另一个
            // ============================================

            // 第 1 步: 合并用户填的原始数据
            const yearlyRaw = [];
            for (let i = 0; i < PLAN.totalYears; i++) {
              const year = PLAN.startYear + i;
              const actual = yearlyActuals.find(a => a.year === year);
              yearlyRaw.push({
                year,
                actualGain: actual?.actualGain ?? null,
                endBalance: actual?.endBalance ?? null,
              });
            }

            // 第 2 步: 按年顺序计算 (起点 / 计划 / 实际 / 终点 / 是否推演)
            const yearlyFinal = [];
            let prevEnd = PLAN.startCapital;  // 第 1 年起点 = 起始本金

            for (let i = 0; i < yearlyRaw.length; i++) {
              const r = yearlyRaw[i];
              const startBalance = prevEnd;  // 本年起点 = 上年终点
              const planTarget = Math.round(startBalance * PLAN.targetAnnualRate);  // 柔性: 基于动态起点

              let actualGain, endBalance, isProjected;

              if (r.actualGain !== null && r.endBalance !== null) {
                // 都填了: 用 endBalance, actualGain 显示用户填的
                actualGain = r.actualGain;
                endBalance = r.endBalance;
                isProjected = false;
              } else if (r.endBalance !== null) {
                // 只填了余额: 倒算增长
                actualGain = r.endBalance - startBalance;
                endBalance = r.endBalance;
                isProjected = false;
              } else if (r.actualGain !== null) {
                // 只填了增长: 算余额
                actualGain = r.actualGain;
                endBalance = startBalance + r.actualGain;
                isProjected = false;
              } else {
                // 都没填: 推演 = 起点 × 1.20 (假设达标)
                actualGain = null;  // 实际显示 TBD
                endBalance = Math.round(startBalance * (1 + PLAN.targetAnnualRate));
                isProjected = true;
              }

              yearlyFinal.push({
                year: r.year,
                startBalance: Math.round(startBalance),
                planTarget,
                actualGain,  // null = TBD
                endBalance: Math.round(endBalance),
                isProjected,
                planEndBalance: Math.round(PLAN.startCapital * Math.pow(1 + PLAN.targetAnnualRate, i + 1)),  // 原计划余额 (北极星硬目标)
              });
              prevEnd = endBalance;  // 下年起点
            }

            // 北极星目标 (永远固定)
            const ageGoalAmount = Math.round(PLAN.startCapital * Math.pow(1 + PLAN.targetAnnualRate, PLAN.totalYears));
            // 现实推演终点 (根据柔性 + 宽松推演)
            const projectedFinal = yearlyFinal[yearlyFinal.length - 1]?.endBalance || 0;
            const shortfall = ageGoalAmount - projectedFinal;

            // === 当前进度 ===
            // 用复盘 tab 自己的数据: 取最近一个已填实际数据的年份 endBalance
            // 如果一个都没填, 用起始本金
            const currentMonth = new Date().toISOString().slice(0, 7);
            // 旧逻辑: 读资产 tab 家庭总资产 (不合适, 因为复盘追踪的是投资账户)
            // 新逻辑: 基于复盘 tab 填入的数据
            let currentBalance = PLAN.startCapital;
            // 找最近一个"实际"填写的年份 (不是推演)
            const thisYear = new Date().getFullYear();
            for (let i = yearlyFinal.length - 1; i >= 0; i--) {
              if (!yearlyFinal[i].isProjected) {
                currentBalance = yearlyFinal[i].endBalance;
                break;
              }
            }

            const progressPct = ageGoalAmount > 0 ? (currentBalance / ageGoalAmount) * 100 : 0;
            const yearsLeft = (PLAN.startYear + PLAN.totalYears - 1) - thisYear;

            // === 融资杠杆状态 (基于总仓位倍率) ===
            // 总仓位倍率 = (账户净值 + 融资金额) / 账户净值
            // 1.0 = 无融资, 1.5 = 杠杆到 1.5 倍
            // 账户净值 = currentBalance (来自复盘数据)
            // 融资 marginStatus.currentMargin 是人民币, 但复盘是 USD, 需要统一
            // 约定: currentMargin 也是 USD (和 startCapital 一致)
            const marginRatio = currentBalance > 0
              ? 1 + (marginStatus.currentMargin / currentBalance)
              : 1;
            const marginState = marginRatio >= 1.5 ? 'red'
              : marginRatio >= 1.3 ? 'orange'
              : 'green';
            // 进度条位置: 1.0 → 0%, 2.0 → 100% (以 2x 为刻度上限)
            const marginPct = Math.max(0, Math.min(100, (marginRatio - 1.0) / 1.0 * 100));

            // === 戒律筛选 ===
            const LEVELS = [
              { level: '🟢', label: '一般', colorClass: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
              { level: '🔺', label: '重要', colorClass: 'bg-amber-50 border-amber-200 text-amber-800' },
              { level: '📣', label: '强调', colorClass: 'bg-violet-50 border-violet-200 text-violet-800' },
              { level: '❗', label: '警告', colorClass: 'bg-rose-50 border-rose-200 text-rose-800' },
            ];
            const LEVEL_COLORS = Object.fromEntries(LEVELS.map(l => [l.level, l.colorClass]));
            // 🐛 修复 (v10.7.9.3): 按 pinned 优先排序
            //   之前: 直接用 disciplines, 置顶按钮无效
            //   现在: pinned=true 的永远在前
            const sortedDisciplines = [...disciplines].sort((a, b) => {
              if (a.pinned && !b.pinned) return -1;
              if (!a.pinned && b.pinned) return 1;
              return 0;  // 都置顶 / 都不置顶 → 保持原顺序
            });
            const filteredDisciplines = filterLevel === 'all' ? sortedDisciplines : sortedDisciplines.filter(d => d.level === filterLevel);

            return (
              <>
                {/* ============ 货币切换按钮 (USD/CNY) ============ */}
                {(() => {
                  const isCNY = investmentPlan.displayCurrency === 'CNY';
                  const switchCurrency = async (newCurrency) => {
                    if (newCurrency === investmentPlan.displayCurrency) return;
                    const next = { ...investmentPlan, displayCurrency: newCurrency };
                    setInvestmentPlan(next);
                    try {
                      await db.upsertInvestmentPlan(next);
                    } catch (e) {
                      console.error('[切换币种] 云端保存失败:', e);
                    }
                  };
                  return (
                    <div className="flex justify-end mb-3">
                      <div className="inline-flex rounded-lg p-0.5 bg-slate-200">
                        <button
                          onClick={() => switchCurrency('USD')}
                          className={`px-3 py-1 rounded-md text-[11px] font-bold transition ${!isCNY ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}
                        >$ USD</button>
                        <button
                          onClick={() => switchCurrency('CNY')}
                          className={`px-3 py-1 rounded-md text-[11px] font-bold transition ${isCNY ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}
                        >¥ CNY</button>
                      </div>
                    </div>
                  );
                })()}

                {/* ============ 模块 1: 复利计划卡 (烈焰红金 + 北极星宇宙动效) ============ */}
                <div
                  className="rounded-2xl p-5 mb-4 text-white relative overflow-hidden"
                  style={{
                    background: `
                      radial-gradient(circle at 0% 100%, rgba(220, 38, 38, 0.25) 0%, transparent 50%),
                      radial-gradient(circle at 100% 0%, rgba(251, 191, 36, 0.18) 0%, transparent 50%),
                      linear-gradient(135deg, #0a0a0a 0%, #1a0a0a 50%, #0a0505 100%)
                    `,
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    boxShadow: '0 10px 40px rgba(127, 29, 29, 0.4)',
                  }}
                >
                  {/* 🌌 宇宙动效层 (纯 CSS 动画, 不阻塞 React 渲染) */}
                  <style>{`
                    @keyframes polar-twinkle {
                      0%, 100% { opacity: 0.3; transform: scale(1); }
                      50% { opacity: 1; transform: scale(1.5); }
                    }
                    @keyframes polar-star-pulse {
                      0%, 100% { box-shadow: 0 0 15px #fbbf24, 0 0 30px rgba(251, 191, 36, 0.6), 0 0 50px rgba(251, 191, 36, 0.3); }
                      50% { box-shadow: 0 0 20px #fbbf24, 0 0 40px rgba(251, 191, 36, 0.8), 0 0 70px rgba(251, 191, 36, 0.5); }
                    }
                    @keyframes polar-meteor {
                      0% { transform: translate(-50px, -20px) rotate(25deg); opacity: 0; }
                      5% { opacity: 1; }
                      20% { opacity: 1; }
                      25% { transform: translate(400px, 150px) rotate(25deg); opacity: 0; }
                      100% { transform: translate(400px, 150px) rotate(25deg); opacity: 0; }
                    }
                    .polar-bg-star {
                      position: absolute;
                      background: white;
                      border-radius: 50%;
                      animation: polar-twinkle infinite;
                      pointer-events: none;
                      z-index: 1;
                    }
                    .polar-main-star {
                      position: absolute;
                      bottom: 24px;
                      right: 24px;
                      width: 6px;
                      height: 6px;
                      background: #fbbf24;
                      border-radius: 50%;
                      animation: polar-star-pulse 2s ease-in-out infinite;
                      pointer-events: none;
                      z-index: 2;
                    }
                    .polar-meteor {
                      position: absolute;
                      width: 60px;
                      height: 1px;
                      background: linear-gradient(90deg, transparent, #fbbf24, white);
                      animation: polar-meteor linear infinite;
                      opacity: 0;
                      pointer-events: none;
                      z-index: 1;
                    }
                  `}</style>
                  {/* ⭐ 北极星 (右上角主星, 脉动发光) */}
                  <div className="polar-main-star"></div>
                  {/* 闪烁背景星星 */}
                  <div className="polar-bg-star" style={{ top: '20%', left: '15%', width: '2px', height: '2px', animationDuration: '2s' }}></div>
                  <div className="polar-bg-star" style={{ top: '45%', left: '40%', width: '1.5px', height: '1.5px', animationDuration: '3s', animationDelay: '0.5s' }}></div>
                  <div className="polar-bg-star" style={{ top: '65%', left: '20%', width: '2px', height: '2px', animationDuration: '2.5s', animationDelay: '1s' }}></div>
                  <div className="polar-bg-star" style={{ top: '75%', left: '60%', width: '1.5px', height: '1.5px', animationDuration: '3.5s', animationDelay: '1.5s' }}></div>
                  <div className="polar-bg-star" style={{ top: '30%', left: '70%', width: '1px', height: '1px', animationDuration: '4s' }}></div>
                  <div className="polar-bg-star" style={{ top: '55%', left: '80%', width: '1.5px', height: '1.5px', animationDuration: '2s', animationDelay: '0.8s' }}></div>
                  <div className="polar-bg-star" style={{ top: '85%', left: '40%', width: '1px', height: '1px', animationDuration: '3s' }}></div>
                  <div className="polar-bg-star" style={{ top: '15%', left: '50%', width: '1px', height: '1px', animationDuration: '3.5s', animationDelay: '0.3s' }}></div>
                  {/* 流星 (偶尔划过) */}
                  <div className="polar-meteor" style={{ top: '40%', left: '30%', animationDuration: '10s', animationDelay: '2s' }}></div>
                  <div className="polar-meteor" style={{ top: '70%', left: '50%', animationDuration: '12s', animationDelay: '7s' }}></div>

                  <div className="flex items-center justify-between mb-3 relative z-10">
                    {/* 金红渐变标题 */}
                    <div
                      className="text-[10px] uppercase font-bold"
                      style={{
                        letterSpacing: '3px',
                        background: 'linear-gradient(135deg, #fbbf24 0%, #dc2626 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      ★ 北极星目标
                    </div>
                    {/* 红色边框按钮 */}
                    <button
                      onClick={() => setShowPlanSettings(true)}
                      className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-md active:scale-95 transition"
                      style={{
                        color: '#fca5a5',
                        background: 'rgba(220, 38, 38, 0.15)',
                        border: '1px solid rgba(220, 38, 38, 0.3)',
                      }}
                    >
                      <Edit2 className="w-3 h-3" /> 设置
                    </button>
                  </div>

                  {/* 主数字 - 金色渐变 */}
                  <div
                    className="text-3xl font-black tabular-nums mb-1 relative z-10"
                    style={{
                      fontFamily: 'ui-monospace, "SF Mono", monospace',
                      background: 'linear-gradient(135deg, #fef3c7 0%, #fbbf24 40%, #f59e0b 80%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      letterSpacing: '-0.5px',
                    }}
                  >
                    {fmtWanUSD(ageGoalAmount, 0)}
                  </div>
                  <div className="text-xs relative z-10" style={{ color: '#fca5a5' }}>
                    {PLAN.totalYears} 年目标 · {PLAN.ageGoalAge} 岁实现
                  </div>

                  {/* 进度条 (🚀 粒子尾气动画) */}
                  <div className="mt-4 relative z-10">
                    <div className="flex justify-between text-[10px] font-bold mb-1" style={{ color: '#fbbf24' }}>
                      <span>当前 {fmtWanUSD(currentBalance, 0)}</span>
                      <span>{progressPct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-full relative" style={{ background: 'rgba(220, 38, 38, 0.15)', overflow: 'visible' }}>
                      {/* 主进度条 */}
                      <div
                        className="h-full rounded-full rocket-bar"
                        style={{
                          '--target-width': `${Math.min(progressPct, 100)}%`,
                          background: 'linear-gradient(90deg, #dc2626 0%, #fbbf24 100%)',
                          boxShadow: '0 0 10px rgba(251, 191, 36, 0.4)',
                          position: 'relative',
                        }}
                      >
                        {/* 3 个粒子 (尾气) */}
                        <div className="rocket-particle rocket-particle-1"></div>
                        <div className="rocket-particle rocket-particle-2"></div>
                        <div className="rocket-particle rocket-particle-3"></div>
                      </div>
                    </div>
                    <div className="text-[10px] mt-1.5" style={{ color: '#737373' }}>
                      还剩 {yearsLeft} 年 · 本金 {fmtWanUSD(PLAN.startCapital, 0)} · 年化 {(PLAN.targetAnnualRate * 100).toFixed(0)}%
                    </div>
                  </div>

                  {/* 个人箴言 (红色分隔线 + 金色字) */}
                  {PLAN.motto && (
                    <div
                      className="mt-4 pt-3 text-[11px] italic relative z-10"
                      style={{
                        borderTop: '1px solid rgba(220, 38, 38, 0.3)',
                        color: '#fbbf24',
                      }}
                    >
                      "{PLAN.motto}"
                    </div>
                  )}
                </div>

                {/* ============ 模块 2: 融资杠杆监控 (基于总仓位倍率) ============ */}
                <div className={`rounded-2xl p-4 shadow border-2 mb-4 ${marginState === 'red' ? 'bg-rose-50 border-rose-300' : marginState === 'orange' ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className={`w-4 h-4 ${marginState === 'red' ? 'text-rose-600' : marginState === 'orange' ? 'text-amber-600' : 'text-emerald-600'}`}/>
                      <div className="text-sm font-black text-slate-800">融资杠杆监控</div>
                    </div>
                    <button onClick={() => setShowEditMargin(true)} className="text-[11px] text-blue-600 font-bold flex items-center gap-1">
                      <Edit2 className="w-3 h-3"/> 修改
                    </button>
                  </div>

                  {/* 主数字: 总仓位倍率 + 状态 */}
                  <div className="flex items-baseline justify-between mb-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-0.5">总仓位倍率</div>
                      <div className={`text-2xl font-black tabular-nums ${marginState === 'red' ? 'text-rose-700' : marginState === 'orange' ? 'text-amber-700' : 'text-emerald-700'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                        {marginRatio.toFixed(2)}x
                      </div>
                    </div>
                    <div className={`text-xs font-bold ${marginState === 'red' ? 'text-rose-700' : marginState === 'orange' ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {marginState === 'red' ? '🚨 危险' : marginState === 'orange' ? '⚠️ 中等' : '✅ 安全'}
                    </div>
                  </div>

                  {/* 金额明细 */}
                  <div className="grid grid-cols-3 gap-2 mb-3 text-[11px]">
                    <div className="bg-white/60 rounded-md p-2">
                      <div className="text-[9px] text-slate-500 font-bold uppercase mb-0.5">账户净值</div>
                      <div className="font-bold text-slate-800 tabular-nums">{fmtWanUSD(currentBalance, 1)}</div>
                    </div>
                    <div className="bg-white/60 rounded-md p-2">
                      <div className="text-[9px] text-slate-500 font-bold uppercase mb-0.5">融资金额</div>
                      <div className="font-bold text-slate-800 tabular-nums">{fmtWanUSD(marginStatus.currentMargin, 1)}</div>
                    </div>
                    <div className="bg-white/60 rounded-md p-2">
                      <div className="text-[9px] text-slate-500 font-bold uppercase mb-0.5">总仓位</div>
                      <div className="font-bold text-slate-800 tabular-nums">{fmtWanUSD(currentBalance + marginStatus.currentMargin, 1)}</div>
                    </div>
                  </div>

                  {/* 倍率进度条 (1.0 → 2.0) */}
                  <div className="relative h-3 bg-white rounded-full overflow-hidden border border-slate-200">
                    {/* 3 档背景色 */}
                    <div className="absolute inset-0 flex">
                      <div style={{ width: '30%' }} className="bg-emerald-100"></div>
                      <div style={{ width: '20%' }} className="bg-amber-100"></div>
                      <div style={{ width: '50%' }} className="bg-rose-100"></div>
                    </div>
                    {/* 当前进度 */}
                    <div className={`absolute top-0 left-0 h-full rounded-full ${marginState === 'red' ? 'bg-rose-500' : marginState === 'orange' ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${marginPct}%` }}></div>
                  </div>
                  <div className="flex justify-between mt-1 text-[9px] text-slate-500 font-medium">
                    <span>1.0x</span>
                    <span className="text-emerald-600 font-bold" style={{ marginLeft: '6%' }}>安全</span>
                    <span className="text-amber-600 font-bold">1.3x</span>
                    <span className="text-rose-600 font-bold">1.5x</span>
                    <span>2.0x</span>
                  </div>

                  {/* 提示 */}
                  <div className={`mt-3 text-[11px] font-medium ${marginState === 'red' ? 'text-rose-700' : marginState === 'orange' ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {marginState === 'red'
                      ? '🚨 融资过度, 强烈建议降杠杆'
                      : marginState === 'orange'
                      ? '⚠️ 杠杆偏高, 注意风险控制'
                      : '✅ 杠杆安全, 风险可控'}
                  </div>
                </div>

                {/* ============ 模块 3: 年度目标进度表 ============ */}
                <div className="rounded-2xl bg-white p-2.5 shadow mb-4">
                  <div className="flex items-center justify-between mb-3 px-1.5">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-blue-600"/>
                      <div className="text-[15px] font-black text-slate-800">年度目标进度</div>
                    </div>
                  </div>

                  {/* 年度列表 (V5B 布局: 本年夕阳粉金 + 微光扫过 + 起点→终点 胶囊) */}
                  <div className="space-y-1.5">
                    {(() => {
                      const thisYear = new Date().getFullYear();
                      // 默认显示: 本年 + 本年之后的 2 个 = 3 个
                      // 展开后: 全部
                      const visibleYears = showAllYears
                        ? yearlyFinal
                        : yearlyFinal.filter((y, i) => {
                            // 只显示本年及其后 2 年, 如果本年不在列表 (过去了) 就显示前 3 个
                            const currentIdx = yearlyFinal.findIndex(yy => yy.year === thisYear);
                            if (currentIdx === -1) return i < 3;
                            return i >= currentIdx && i < currentIdx + 3;
                          });
                      const hiddenCount = yearlyFinal.length - visibleYears.length;

                      return (
                        <>
                          {visibleYears.map(y => {
                            const isCurrent = y.year === thisYear;
                            const hasActual = y.actualGain !== null;
                            const diff = hasActual ? y.actualGain - y.planTarget : null;
                            const isOverTarget = diff !== null && diff >= 0;

                            // 当年进度: 基于实际收益完成度 (而非时间)
                            // 例如: 目标 +20%, 实际已经 +12% → 完成度 = 60%
                            const currentMonth = new Date().getMonth() + 1;
                            const yearProgressPct = isCurrent && hasActual && y.planTarget > 0
                              ? Math.max(0, Math.min(150, (y.actualGain / y.planTarget) * 100))  // 上限 150% (超额完成)
                              : 0;

                            if (isCurrent) {
                              // ============ 本年大卡: 夕阳粉金 ============
                              return (
                                <div
                                  key={y.year}
                                  className="rounded-xl p-3.5 relative"
                                  style={{
                                    background: `
                                      radial-gradient(circle at 100% 0%, rgba(251, 191, 36, 0.15) 0%, transparent 50%),
                                      radial-gradient(circle at 0% 100%, rgba(236, 72, 153, 0.12) 0%, transparent 50%),
                                      linear-gradient(135deg, #fdf2f8 0%, #fff 100%)
                                    `,
                                    border: '1px solid #fbcfe8',
                                  }}
                                >
                                  {/* 第 1 行: 年份 + 标签 + 编辑 */}
                                  <div className="flex items-center justify-between mb-2.5">
                                    <div className="flex items-center gap-2">
                                      <div className="text-[20px] font-black tabular-nums" style={{ color: '#db2777', fontFamily: 'ui-monospace, monospace' }}>
                                        {y.year}
                                      </div>
                                      <span className="px-2 py-0.5 rounded text-[11px] font-bold text-white" style={{ background: '#db2777' }}>本年</span>
                                      {hasActual && (
                                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold text-white ${isOverTarget ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                                          {isOverTarget ? '↑达标' : '↓未达'}
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => setEditYearlyActualId(y.year)}
                                      className="w-8 h-8 rounded-md hover:bg-pink-200 flex items-center justify-center active:scale-95 transition"
                                      style={{ background: 'rgba(219, 39, 119, 0.1)', color: '#db2777' }}
                                    >
                                      <Edit2 className="w-[15px] h-[15px]"/>
                                    </button>
                                  </div>

                                  {/* 第 2 行: 计划 → 实际 + 差额 */}
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-baseline gap-2" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                      <span className="text-slate-500 text-[14px]">计划 +{symbol}{fmtWan(y.planTarget * rate, 1)}</span>
                                      <span className="text-[14px]" style={{ color: '#f9a8d4' }}>→</span>
                                      <span className={`font-black text-[18px] ${!hasActual ? 'text-slate-400 italic font-normal' : y.actualGain >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {hasActual ? `${y.actualGain >= 0 ? '+' : ''}${symbol}${fmtWan(y.actualGain * rate, 1)}万` : 'TBD'}
                                      </span>
                                    </div>
                                    {hasActual ? (
                                      <span className={`text-[13px] font-black tabular-nums px-2.5 py-1 rounded-md ${isOverTarget ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                        {diff >= 0 ? '+' : ''}{symbol}{fmtWan(diff * rate, 1)}万
                                      </span>
                                    ) : (
                                      <span className="text-[13px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md">TBD</span>
                                    )}
                                  </div>

                                  {/* 第 3 行: 起点 → 终点 胶囊 */}
                                  <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg text-[13px] mb-3" style={{ background: 'rgba(219, 39, 119, 0.08)' }}>
                                    <span>
                                      <span className="text-slate-500 text-[12px]">起点</span>{' '}
                                      <span className="font-black tabular-nums text-[14px]" style={{ color: '#be185d', fontFamily: 'ui-monospace, monospace' }}>{symbol}{fmtWan(y.startBalance * rate, 1)}万</span>
                                    </span>
                                    <span style={{ color: '#f9a8d4', fontSize: '15px' }}>→</span>
                                    <span>
                                      <span className="text-slate-500 text-[12px]">终点</span>{' '}
                                      <span className="font-black tabular-nums text-[14px]" style={{ color: '#be185d', fontFamily: 'ui-monospace, monospace' }}>{symbol}{fmtWan(y.endBalance * rate, 1)}万</span>
                                    </span>
                                  </div>

                                  {/* 第 4 行: 年度收益完成度进度条 (PE 微光扫过) */}
                                  <div className="flex items-center gap-2 mb-2 text-[13px] font-bold" style={{ color: '#db2777' }}>
                                    <span className="whitespace-nowrap">{hasActual ? '本年完成' : '尚未填收益'}</span>
                                    <div className="flex-1 h-[9px] rounded-full overflow-hidden relative" style={{ background: 'rgba(219, 39, 119, 0.12)' }}>
                                      <div
                                        className="h-full rounded-full relative progress-shine"
                                        style={{
                                          width: `${Math.min(100, yearProgressPct)}%`,
                                          background: yearProgressPct >= 100
                                            ? 'linear-gradient(90deg, #f43f5e 0%, #fb923c 50%, #fbbf24 100%)'  // 达标: 红橙金
                                            : 'linear-gradient(90deg, #10b981 0%, #fbbf24 50%, #e11d48 100%)',  // 未达: 绿黄红
                                          boxShadow: '0 0 6px rgba(251, 191, 36, 0.4)',
                                        }}
                                      ></div>
                                    </div>
                                    <span className="tabular-nums">{yearProgressPct.toFixed(0)}%</span>
                                  </div>

                                  {/* 北极星对比 */}
                                  <div className="text-[12px] text-slate-400">
                                    北极星 <span className="tabular-nums">{symbol}{fmtWan(y.planEndBalance * rate, 1)}万</span>
                                    {' · '}
                                    {y.endBalance >= y.planEndBalance ? (
                                      <span className="text-rose-500 font-bold">领先 {symbol}{fmtWan((y.endBalance - y.planEndBalance) * rate, 1)}万</span>
                                    ) : (
                                      <span className="text-emerald-500 font-bold">落后 {symbol}{fmtWan((y.planEndBalance - y.endBalance) * rate, 1)}万</span>
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            // ============ 其他年份紧凑行 ============
                            return (
                              <div key={y.year} className="rounded-lg px-3 py-2.5 bg-slate-50/60">
                                <div className="flex items-center gap-2.5">
                                  <div className="text-[17px] font-black tabular-nums text-slate-500 w-14 flex-shrink-0" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                    {y.year}
                                  </div>
                                  <div className="flex-1 flex items-center justify-between text-[14px]" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                    <div className="flex items-baseline gap-1.5">
                                      <span className="text-slate-500 text-[13px]">+{symbol}{fmtWan(y.planTarget * rate, 1)}</span>
                                      <span className="text-slate-300">→</span>
                                      <span className={`font-black ${!hasActual ? 'text-slate-400 italic font-normal' : y.actualGain >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {hasActual ? `${y.actualGain >= 0 ? '+' : ''}${symbol}${fmtWan(y.actualGain * rate, 1)}万` : 'TBD'}
                                      </span>
                                    </div>
                                    {hasActual ? (
                                      <span className={`text-[12px] font-bold px-2 py-0.5 rounded tabular-nums ${isOverTarget ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                        {diff >= 0 ? '+' : ''}{symbol}{fmtWan(diff * rate, 1)}万
                                      </span>
                                    ) : (
                                      <span className="text-[12px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-bold">TBD</span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => setEditYearlyActualId(y.year)}
                                    className="w-7 h-7 rounded bg-slate-200 hover:bg-blue-500 hover:text-white flex items-center justify-center active:scale-95 transition text-slate-500 flex-shrink-0"
                                  >
                                    <Edit2 className="w-3 h-3"/>
                                  </button>
                                </div>

                                {/* 起点 → 终点 小胶囊 */}
                                <div className="flex items-center justify-between mt-1.5 ml-14 mr-9 px-2.5 py-1 rounded text-[12px] bg-white">
                                  <span>
                                    <span className="text-slate-400 text-[11px]">起点</span>{' '}
                                    <span className="font-bold text-slate-600 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>{symbol}{fmtWan(y.startBalance * rate, 1)}万</span>
                                  </span>
                                  <span className="text-slate-300">→</span>
                                  <span>
                                    <span className="text-slate-400 text-[11px]">终点</span>{' '}
                                    <span className={`font-bold tabular-nums italic ${y.isProjected ? 'text-slate-400' : 'text-slate-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>{symbol}{fmtWan(y.endBalance * rate, 1)}万</span>
                                  </span>
                                </div>

                                {/* 北极星对比 */}
                                <div className="text-[12px] text-slate-400 mt-1.5 ml-14">
                                  北极星 <span className="tabular-nums">{symbol}{fmtWan(y.planEndBalance * rate, 1)}万</span>
                                  {' · '}
                                  {y.endBalance >= y.planEndBalance ? (
                                    <span className="text-rose-500 font-bold">领先 {symbol}{fmtWan((y.endBalance - y.planEndBalance) * rate, 1)}万</span>
                                  ) : (
                                    <span className="text-emerald-500 font-bold">落后 {symbol}{fmtWan((y.planEndBalance - y.endBalance) * rate, 1)}万</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* 展开/收起按钮 */}
                          {yearlyFinal.length > 3 && (
                            <button
                              onClick={() => setShowAllYears(!showAllYears)}
                              className="w-full py-3 mt-2 rounded-lg active:scale-95 transition flex items-center justify-center gap-1.5 text-[13px] font-bold"
                              style={{
                                background: '#fff8f5',
                                border: '1px dashed #fbcfe8',
                                color: '#db2777',
                              }}
                            >
                              {showAllYears ? (
                                <>
                                  <ChevronUp className="w-4 h-4"/>
                                  收起 · 只看前 3 年
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-4 h-4"/>
                                  展开剩余 {hiddenCount} 年
                                </>
                              )}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* ============ 模块 4: 投资戒律 ============ */}
                <div className="rounded-2xl bg-white p-4 shadow mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-violet-600"/>
                      <div className="text-sm font-black text-slate-800">投资戒律</div>
                      <span className="text-[10px] text-slate-400">({disciplines.length})</span>
                    </div>
                    <button
                      onClick={() => setShowAddDiscipline(true)}
                      className="px-2 py-1 rounded-md bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold flex items-center gap-1 active:scale-95 transition"
                    >
                      <Plus className="w-3 h-3"/> 添加
                    </button>
                  </div>

                  {/* 等级筛选 */}
                  <div className="flex gap-1 mb-3 overflow-x-auto">
                    <button
                      onClick={() => setFilterLevel('all')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap ${filterLevel === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}
                    >全部 ({disciplines.length})</button>
                    {LEVELS.map(l => {
                      const count = disciplines.filter(d => d.level === l.level).length;
                      return (
                        <button
                          key={l.level}
                          onClick={() => setFilterLevel(l.level)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap flex items-center gap-1 ${filterLevel === l.level ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}
                        >
                          <span>{l.level}</span><span>{count}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 戒律列表 */}
                  {disciplines.length === 0 ? (
                    <div className="text-center py-8 px-3 bg-slate-50 rounded-xl text-slate-500 text-sm">
                      <div className="text-3xl mb-2">📖</div>
                      <div className="mb-2 font-bold">还没有戒律</div>
                      <div className="text-xs">记录你的投资经验教训, 防止重复犯错</div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {(showAllDisciplines ? filteredDisciplines : filteredDisciplines.slice(0, 10)).map(d => {
                          const isLong = d.text.length > 60;
                          const isExpanded = expandedDisciplines[d.id];
                          const displayText = (isLong && !isExpanded) ? d.text.slice(0, 60) + '...' : d.text;
                          return (
                            <div key={d.id} className={`relative rounded-xl border p-3 ${LEVEL_COLORS[d.level] || ''}`}>
                              {d.pinned && (
                                <div className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shadow">
                                  <Pin className="w-2.5 h-2.5 text-white" fill="white"/>
                                </div>
                              )}
                              <div className="flex items-start gap-2">
                                <div className="text-base shrink-0">{d.level}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm leading-relaxed font-medium whitespace-pre-wrap break-words">{displayText}</div>
                                  {isLong && (
                                    <button
                                      onClick={() => setExpandedDisciplines(prev => ({ ...prev, [d.id]: !prev[d.id] }))}
                                      className="text-[11px] mt-1 font-bold underline opacity-70"
                                    >
                                      {isExpanded ? '收起' : '展开全文'}
                                    </button>
                                  )}
                                  <div className="text-[10px] mt-1 opacity-60">{d.date}</div>
                                </div>
                                <div className="flex flex-col gap-1 shrink-0">
                                  <button
                                    onClick={async () => {
                                      try {
                                        await db.updateDiscipline(d.id, { ...d, pinned: !d.pinned });
                                        setDisciplines(disciplines.map(x => x.id === d.id ? { ...x, pinned: !x.pinned } : x));
                                      } catch (e) { alert('Pin 失败: ' + e.message); }
                                    }}
                                    className={`p-1 rounded ${d.pinned ? 'bg-amber-200' : 'hover:bg-white/50'}`}
                                  >
                                    <Pin className="w-3 h-3 opacity-70"/>
                                  </button>
                                  <button onClick={() => setEditingDisciplineId(d.id)} className="p-1 rounded hover:bg-white/50">
                                    <Edit2 className="w-3 h-3 opacity-70"/>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {filteredDisciplines.length > 10 && (
                        <button
                          onClick={() => setShowAllDisciplines(!showAllDisciplines)}
                          className="w-full mt-3 py-2 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition border border-violet-200"
                        >
                          {showAllDisciplines ? (<><ChevronUp className="w-3.5 h-3.5"/>收起, 只看前 10 条</>) : (<><ChevronDown className="w-3.5 h-3.5"/>展开剩余 {filteredDisciplines.length - 10} 条</>)}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* ============ 模块 5: 月度复盘日志 ============ */}
                <div className="rounded-2xl bg-white p-4 shadow mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <Edit2 className="w-4 h-4 text-blue-600"/>
                      <div className="text-sm font-black text-slate-800">复盘日志</div>
                      <span className="text-[10px] text-slate-400">({reviewLogs.length})</span>
                    </div>
                    <button
                      onClick={() => setShowAddLog(true)}
                      className="px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1 active:scale-95 transition"
                    >
                      <Plus className="w-3 h-3"/> 写复盘
                    </button>
                  </div>

                  {reviewLogs.length === 0 ? (
                    <div className="text-center py-8 px-3 bg-slate-50 rounded-xl text-slate-500 text-sm">
                      <div className="text-3xl mb-2">📝</div>
                      <div className="mb-2 font-bold">还没有复盘</div>
                      <div className="text-xs">每周/每月记录一下操作和思考</div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {(showAllLogs ? reviewLogs : reviewLogs.slice(0, 10)).map(l => (
                          <div key={l.id} className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                            <div className="flex items-center justify-between mb-1">
                              <div className="text-xs font-black text-slate-700 tabular-nums">{l.date}</div>
                              <div className="flex items-center gap-1.5">
                                {l.mood && <span className="text-[10px] text-blue-600 font-bold bg-blue-100 px-1.5 py-0.5 rounded">{l.mood}</span>}
                                <button onClick={() => setEditingLogId(l.id)} className="p-1 rounded hover:bg-white">
                                  <Edit2 className="w-3 h-3 text-slate-400"/>
                                </button>
                              </div>
                            </div>
                            <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap break-words">{l.text}</div>
                          </div>
                        ))}
                      </div>
                      {/* 展开/收起按钮 (跟戒律一致样式) */}
                      {reviewLogs.length > 10 && (
                        <button
                          onClick={() => setShowAllLogs(!showAllLogs)}
                          className="w-full mt-2 py-2.5 rounded-xl text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 active:scale-95 transition flex items-center justify-center gap-1.5"
                        >
                          {showAllLogs ? (
                            <><ChevronUp className="w-3.5 h-3.5"/>收起, 只看前 10 条</>
                          ) : (
                            <><ChevronDown className="w-3.5 h-3.5"/>展开剩余 {reviewLogs.length - 10} 条</>
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* ====== 复利计划设置 Modal ====== */}
                {showPlanSettings && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowPlanSettings(false)}>
                    <div className="bg-white rounded-2xl p-4 max-w-sm w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-base">复利计划设置</h3>
                        <button onClick={() => setShowPlanSettings(false)} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                          <X className="w-4 h-4"/>
                        </button>
                      </div>
                      {(() => {
                        const [draft, setDraft] = [investmentPlan, setInvestmentPlan];
                        const settingCurrency = draft.displayCurrency || 'USD';
                        const isCNYSetting = settingCurrency === 'CNY';
                        const settingSymbol = isCNYSetting ? '¥' : '$';
                        const settingRate = isCNYSetting ? (usdRate || 7.2) : 1;
                        // 输入框显示值 (当前币种)
                        const displayStartCapital = draft.startCapital * settingRate;
                        return (
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs text-slate-500 block mb-1">基础本金 ({settingSymbol})</label>
                              <input
                                type="number"
                                value={Math.round(displayStartCapital)}
                                onChange={e => {
                                  const inputVal = parseFloat(e.target.value) || 0;
                                  // 存回 USD
                                  setDraft({ ...draft, startCapital: inputVal / settingRate });
                                }}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                              />
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                当前: {fmtWanUSD(draft.startCapital, 0)}
                                {isCNYSetting && <span> (输入 ¥ 自动换算为 USD 存储, 汇率 1 USD = {settingRate} CNY)</span>}
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 block mb-1">年化目标 (%)</label>
                              <input
                                type="number"
                                step="1"
                                value={(draft.targetAnnualRate * 100).toFixed(0)}
                                onChange={e => setDraft({ ...draft, targetAnnualRate: (parseFloat(e.target.value) || 0) / 100 })}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs text-slate-500 block mb-1">起始年</label>
                                <input
                                  type="number"
                                  value={draft.startYear === '' ? '' : draft.startYear}
                                  onChange={e => {
                                    const v = e.target.value;
                                    setDraft({ ...draft, startYear: v === '' ? '' : (parseInt(v) || 0) });
                                  }}
                                  onBlur={e => {
                                    const v = parseInt(e.target.value);
                                    if (!v || v < 2000) setDraft({ ...draft, startYear: 2026 });
                                  }}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-slate-500 block mb-1">总年数</label>
                                <input
                                  type="number"
                                  value={draft.totalYears === '' ? '' : draft.totalYears}
                                  onChange={e => {
                                    const v = e.target.value;
                                    // 空 → 保持空 (允许删除); 否则解析为数字
                                    setDraft({ ...draft, totalYears: v === '' ? '' : (parseInt(v) || 0) });
                                  }}
                                  onBlur={e => {
                                    // 失焦时: 如果是空 / 0, fallback 到 10
                                    const v = parseInt(e.target.value);
                                    if (!v || v < 1) setDraft({ ...draft, totalYears: 10 });
                                  }}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 block mb-1">目标年龄</label>
                              <input
                                type="number"
                                value={draft.ageGoalAge === '' ? '' : (draft.ageGoalAge || '')}
                                onChange={e => {
                                  const v = e.target.value;
                                  setDraft({ ...draft, ageGoalAge: v === '' ? '' : (parseInt(v) || 0) });
                                }}
                                onBlur={e => {
                                  const v = parseInt(e.target.value);
                                  if (!v || v < 1) setDraft({ ...draft, ageGoalAge: 40 });
                                }}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 block mb-1">个人箴言 (可选)</label>
                              <textarea
                                value={draft.motto || ''}
                                onChange={e => setDraft({ ...draft, motto: e.target.value })}
                                placeholder="例: 40 岁主账户 $500 万"
                                rows={2}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                              />
                            </div>
                            <div className="text-[10px] text-slate-500 bg-slate-50 rounded p-2">
                              按此计划 {draft.totalYears} 年后将达 <span className="font-bold text-amber-700">{fmtWanUSD(draft.startCapital * Math.pow(1 + draft.targetAnnualRate, draft.totalYears), 0)}</span>
                            </div>
                          </div>
                        );
                      })()}
                      <div className="flex gap-2 mt-4">
                        <button onClick={() => setShowPlanSettings(false)} className="flex-1 py-2.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold">取消</button>
                        <button
                          onClick={async () => {
                            try {
                              await db.upsertInvestmentPlan(investmentPlan);
                              setShowPlanSettings(false);
                            } catch (e) { alert('保存失败: ' + e.message); }
                          }}
                          className="flex-1 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-bold"
                        >保存</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ====== 融资修改 Modal ====== */}
                {showEditMargin && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowEditMargin(false)}>
                    <div className="bg-white rounded-2xl p-4 max-w-sm w-full" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-base">融资杠杆</h3>
                        <button onClick={() => setShowEditMargin(false)} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                          <X className="w-4 h-4"/>
                        </button>
                      </div>
                      <div className="space-y-3">
                        {/* 账户净值显示 (自动, 不可改) */}
                        <div className="bg-slate-50 rounded-lg p-3">
                          <div className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">账户净值 (自动)</div>
                          <div className="font-bold text-slate-800 tabular-nums text-sm">{fmtWanUSD(currentBalance, 1)}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">来自目标 tab 最近填写的余额</div>
                        </div>

                        <div>
                          <label className="text-xs text-slate-500 block mb-1">当前融资额 ({investmentPlan.displayCurrency === 'CNY' ? '¥' : '$'})</label>
                          {(() => {
                            const isCNYMargin = investmentPlan.displayCurrency === 'CNY';
                            const rateMargin = isCNYMargin ? (usdRate || 7.2) : 1;
                            const displayMargin = marginStatus.currentMargin * rateMargin;
                            return (
                              <>
                                <input
                                  type="number"
                                  value={Math.round(displayMargin)}
                                  onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setMarginStatus({ ...marginStatus, currentMargin: val / rateMargin });
                                  }}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                                  placeholder={isCNYMargin ? '例: 3600000 (360 万¥)' : '例: 500000 (50 万$)'}
                                />
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  当前: {fmtWanUSD(marginStatus.currentMargin, 1)}
                                </div>
                              </>
                            );
                          })()}
                        </div>

                        {/* 实时计算预览 */}
                        {currentBalance > 0 && (
                          <div className={`rounded-lg p-3 border ${marginRatio >= 1.5 ? 'bg-rose-50 border-rose-200' : marginRatio >= 1.3 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                            <div className="text-[10px] font-bold uppercase mb-1 tracking-widest">
                              {marginRatio >= 1.5 ? '🚨 危险区' : marginRatio >= 1.3 ? '⚠️ 中等区' : '✅ 安全区'}
                            </div>
                            <div className="flex items-baseline justify-between">
                              <span className="text-xs text-slate-600">总仓位倍率:</span>
                              <span className={`text-lg font-black tabular-nums ${marginRatio >= 1.5 ? 'text-rose-700' : marginRatio >= 1.3 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                {marginRatio.toFixed(2)}x
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-1">
                              1.0-1.3x 安全 · 1.3-1.5x 中等 · 1.5x+ 危险
                            </div>
                          </div>
                        )}
                        {currentBalance === 0 && (
                          <div className="text-[11px] text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                            💡 先在目标 tab 填年度数据, 才能自动算杠杆倍率
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 mt-4">
                        <button onClick={() => setShowEditMargin(false)} className="flex-1 py-2.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold">取消</button>
                        <button
                          onClick={async () => {
                            try {
                              await db.upsertMarginStatus(marginStatus);
                              setShowEditMargin(false);
                            } catch (e) { alert('保存失败: ' + e.message); }
                          }}
                          className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold"
                        >保存</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ====== 添加/编辑 戒律 Modal ====== */}
                {(showAddDiscipline || editingDisciplineId) && (() => {
                  const isEdit = !!editingDisciplineId;
                  const current = isEdit ? disciplines.find(d => d.id === editingDisciplineId) : null;
                  return (
                    <DisciplineModal
                      initial={current || { level: '🟢', text: '', pinned: false }}
                      onCancel={() => { setShowAddDiscipline(false); setEditingDisciplineId(null); }}
                      onDelete={isEdit ? async () => {
                        if (!window.confirm('确认删除这条戒律?')) return;
                        try {
                          await db.deleteDiscipline(editingDisciplineId);
                          setDisciplines(disciplines.filter(d => d.id !== editingDisciplineId));
                          setEditingDisciplineId(null);
                        } catch (e) { alert('删除失败: ' + e.message); }
                      } : null}
                      onSave={async (data) => {
                        try {
                          if (isEdit) {
                            await db.updateDiscipline(editingDisciplineId, data);
                            setDisciplines(disciplines.map(d => d.id === editingDisciplineId ? { ...d, ...data } : d));
                            setEditingDisciplineId(null);
                          } else {
                            // 防重复: 10 秒内相同内容拒绝
                            const text = (data.text || '').trim();
                            const last = lastSubmitRef.current['discipline'];
                            const now = Date.now();
                            if (last && last.text === text && (now - last.at) < 10000) {
                              alert('⚠️ 10 秒内已提交过相同内容, 请勿重复');
                              return;
                            }
                            const saved = await db.insertDiscipline(data);
                            lastSubmitRef.current['discipline'] = { text, at: now };
                            setDisciplines([saved, ...disciplines]);
                            setShowAddDiscipline(false);
                          }
                        } catch (e) { alert('保存失败: ' + e.message); }
                      }}
                    />
                  );
                })()}

                {/* ====== 添加/编辑 日志 Modal ====== */}
                {(showAddLog || editingLogId) && (() => {
                  const isEdit = !!editingLogId;
                  const current = isEdit ? reviewLogs.find(l => l.id === editingLogId) : null;
                  return (
                    <LogModal
                      initial={current || { date: new Date().toISOString().slice(0, 10), mood: '', text: '' }}
                      onCancel={() => { setShowAddLog(false); setEditingLogId(null); }}
                      onDelete={isEdit ? async () => {
                        if (!window.confirm('确认删除这条复盘?')) return;
                        try {
                          await db.deleteReviewLog(editingLogId);
                          setReviewLogs(reviewLogs.filter(l => l.id !== editingLogId));
                          setEditingLogId(null);
                        } catch (e) { alert('删除失败: ' + e.message); }
                      } : null}
                      onSave={async (data) => {
                        try {
                          if (isEdit) {
                            await db.updateReviewLog(editingLogId, data);
                            setReviewLogs(reviewLogs.map(l => l.id === editingLogId ? { ...l, ...data } : l));
                            setEditingLogId(null);
                          } else {
                            // 防重复: 10 秒内相同内容拒绝
                            const text = (data.text || '').trim();
                            const last = lastSubmitRef.current['log'];
                            const now = Date.now();
                            if (last && last.text === text && (now - last.at) < 10000) {
                              alert('⚠️ 10 秒内已提交过相同内容, 请勿重复');
                              return;
                            }
                            const saved = await db.insertReviewLog(data);
                            lastSubmitRef.current['log'] = { text, at: now };
                            setReviewLogs([saved, ...reviewLogs]);
                            setShowAddLog(false);
                          }
                        } catch (e) { alert('保存失败: ' + e.message); }
                      }}
                    />
                  );
                })()}

                {/* ====== 编辑年度实际数据 Modal ====== */}
                {editYearlyActualId && (() => {
                  const year = editYearlyActualId;
                  const existing = yearlyActuals.find(a => a.year === year);
                  return (
                    <YearlyActualModal
                      year={year}
                      initial={existing || { actualGain: null, endBalance: null }}
                      currency={investmentPlan.displayCurrency || 'USD'}
                      rate={(investmentPlan.displayCurrency === 'CNY') ? (usdRate || 7.2) : 1}
                      onCancel={() => setEditYearlyActualId(null)}
                      onSave={async (actualGain, endBalance) => {
                        try {
                          await db.upsertYearlyActual(year, actualGain, endBalance);
                          const idx = yearlyActuals.findIndex(a => a.year === year);
                          if (idx >= 0) {
                            const next = [...yearlyActuals];
                            next[idx] = { ...next[idx], actualGain, endBalance };
                            setYearlyActuals(next);
                          } else {
                            setYearlyActuals([...yearlyActuals, { year, actualGain, endBalance }]);
                          }
                          setEditYearlyActualId(null);
                        } catch (e) { alert('保存失败: ' + e.message); }
                      }}
                    />
                  );
                })()}
              </>
            );
          })()}
        </>)}
        {/* ====== 复盘 tab 结束 ====== */}

        {/* ====== 设置 tab ====== */}
        {activeTab === 'settings' && (
          <div className="space-y-4">
            {/* 🧪 实验: WebSocket 实时模式 */}
            <div
              className="rounded-2xl p-5 relative overflow-hidden"
              style={{
                background: `
                  radial-gradient(circle at 100% 0%, rgba(34, 197, 94, 0.12) 0%, transparent 50%),
                  linear-gradient(135deg, #0a0a0a 0%, #171717 100%)
                `,
                border: '1px solid rgba(34, 197, 94, 0.2)',
              }}
            >
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-black text-base flex items-center gap-2" style={{ color: '#4ade80' }}>
                    🧪 实时推送 <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>BETA</span>
                  </h2>
                  {wsEnabled && (
                    <span className="flex items-center gap-1.5 text-[10px] font-black">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'connected' ? 'animate-pulse' : ''}`}
                        style={{
                          background: wsStatus === 'connected' ? '#4ade80' :
                                      wsStatus === 'connecting' ? '#fbbf24' :
                                      wsStatus === 'error' ? '#ef4444' : '#64748b',
                        }}
                      />
                      <span style={{ color: '#a3a3a3' }}>
                        {wsStatus === 'connected' ? 'LIVE' :
                         wsStatus === 'connecting' ? '连接中' :
                         wsStatus === 'error' ? '错误' : '未连接'}
                      </span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] leading-relaxed mb-3" style={{ color: '#a3a3a3' }}>
                  使用 EODHD WebSocket 接收股票实时 tick (延迟 &lt; 50ms)
                  <br/>
                  开启后 REST 轮询停止, 数字会实时跳动
                  <br/>
                  <span style={{ color: '#fbbf24' }}>⚠️ Token 会暴露在浏览器, 仅个人使用</span>
                </p>

                <button
                  onClick={() => {
                    const next = !wsEnabled;
                    setWsEnabled(next);
                    try { localStorage.setItem('bottomline_ws', String(next)); } catch {}
                  }}
                  className="w-full py-2.5 rounded-xl font-black text-sm active:scale-95 transition flex items-center justify-center gap-2"
                  style={{
                    background: wsEnabled
                      ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                      : 'rgba(255,255,255,0.08)',
                    color: wsEnabled ? '#fff' : '#a3a3a3',
                    border: wsEnabled ? '1px solid #16a34a' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  {wsEnabled ? '✓ 实时模式已开启' : '开启实时模式'}
                </button>

                {wsEnabled && wsLastTick && (
                  <div className="text-[10px] mt-2 text-center tabular-nums" style={{ color: '#64748b', fontFamily: 'ui-monospace, monospace' }}>
                    最后 tick: {wsLastTick.toLocaleTimeString('zh-CN', { hour12: false })}
                  </div>
                )}
              </div>
            </div>

            {/* 数据状态 */}
            <div className="bg-white rounded-2xl p-5 shadow">
              <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
                📡 数据状态
              </h2>
              {(() => {
                // 计算当前刷新状态
                const now = new Date();
                const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
                const et = new Date(etStr);
                const day = et.getDay();
                const hour = et.getHours();
                const minute = et.getMinutes();
                const time = hour + minute / 60;

                let marketStatus, freq, freqColor;
                if (day === 0 || day === 6) {
                  marketStatus = '🔴 休市 (周末)';
                  freq = '5 分钟';
                  freqColor = 'text-slate-500';
                } else if (time >= 9.5 && time < 16) {
                  marketStatus = '🟢 盘中';
                  freq = '10 秒';
                  freqColor = 'text-emerald-600';
                } else if (time >= 4 && time < 9.5) {
                  marketStatus = '🟡 盘前';
                  freq = '30 秒';
                  freqColor = 'text-amber-600';
                } else if (time >= 16 && time < 20) {
                  marketStatus = '🟡 盘后';
                  freq = '30 秒';
                  freqColor = 'text-amber-600';
                } else {
                  marketStatus = '🔴 休市 (深夜)';
                  freq = '5 分钟';
                  freqColor = 'text-slate-500';
                }

                return (
                  <>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-600 text-sm">连接状态</span>
                      <span className={`text-sm font-bold tabular-nums ${fetchError ? 'text-red-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                        {fetchError ? '● 异常' : '● 已连接'}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <div className="text-slate-600 text-sm">
                        当前刷新频率
                        <div className="text-[10px] text-slate-400 mt-0.5">智能切换</div>
                      </div>
                      <span className={`text-sm font-bold tabular-nums ${freqColor}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                        {freq}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-600 text-sm">市场状态</span>
                      <span className="text-sm font-bold text-slate-900 tabular-nums">
                        {marketStatus}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-600 text-sm">最近更新</span>
                      <span className="text-sm font-bold text-slate-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                        {lastFetched ? lastFetched.toLocaleTimeString('zh-CN', { hour12: false }) : '--'}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-slate-600 text-sm">数据源</span>
                      <span className="text-[11px] text-slate-500">EODHD + Yahoo</span>
                    </div>
                    <div className="text-[10px] text-slate-400 pt-2 leading-relaxed border-t border-slate-100 mt-1">
                      智能刷新策略:<br/>
                      开盘 10s · 盘前盘后 30s · 休市 5 分钟<br/>
                      页面隐藏时自动暂停
                    </div>

                    {fetchError && (
                      <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-1">
                        <WifiOff className="w-3 h-3" /> {fetchError}
                      </div>
                    )}
                  </>
                );
              })()}
              <button
                onClick={fetchRealtimePrices}
                disabled={fetching}
                className="mt-3 w-full py-2.5 rounded-xl font-black flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50"
                style={{
                  background: fetching ? '#f1f5f9' : '#fff',
                  color: fetching ? '#94a3b8' : '#d97706',
                  border: fetching ? '2px solid #cbd5e1' : '2px solid #fbbf24',
                }}
              >
                <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
                {fetching ? '拉取中…' : '立即手动拉取'}
              </button>
            </div>

            {/* 📜 更新日志 */}
            <div className="bg-white rounded-2xl p-5 shadow">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-lg flex items-center gap-2">
                  📜 更新日志
                </h2>
                <span className="text-[11px] font-bold tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', color: '#94a3b8' }}>
                  v10.7.9.15
                </span>
              </div>

              {(() => {
                const changelog = [
                  {
                    ver: 'v10.7.9.15', date: '2026-04-23', latest: true,
                    items: ['🔍 加 debug log (用于排查涨跌% 仍不实时的问题)', '关注列表股票卡: F12 Console 看每只股票的 现价/昨收/差值'],
                  },
                  {
                    ver: 'v10.7.9.14', date: '2026-04-23',
                    items: ['🐛 修复涨跌% 盘前/盘后不更新 bug', '原: 用 EODHD changePercent (盘前不更新)', '现: 实时算 (现价 - 昨收) / 昨收 · 影响关注列表 + 顶部指数 + 持仓总盈亏'],
                  },
                  {
                    ver: 'v10.7.9.13', date: '2026-04-23',
                    items: ['📈 首页持仓卡: 浮动% → 当日盈亏', '显示: 今日 +$X,XXX (+X.XX%)', '红涨绿跌, 跟着 WebSocket 实时跳'],
                  },
                  {
                    ver: 'v10.7.9.12', date: '2026-04-23',
                    items: ['🎨 波段记录卡换白卡极简 (替换黑金)', '跟关注列表/戒律/复盘 视觉统一', '白底 + 灰块 + 进行中红色数字'],
                  },
                  {
                    ver: 'v10.7.9.11', date: '2026-04-23',
                    items: ['📊 交易波段卡加"现价"列 (3 列 → 4 列)', '现价颜色: 高于买入均=红(浮盈) · 低于=绿(浮亏)', '一眼看出当前价格 + 盈亏方向'],
                  },
                  {
                    ver: 'v10.7.9.10', date: '2026-04-23',
                    items: ['🔔 预警折叠状态持久化 (localStorage)', '用户点"收起"后, 下次打开保持折叠', '有新预警或等级升级 → 自动展开 + 显示"新/升级"徽章', '不会漏掉重要信号'],
                  },
                  {
                    ver: 'v10.7.9.9', date: '2026-04-23',
                    items: ['💱 首页总览卡加人民币副显示 (≈ ¥X.X万)', '总市值 + 波段总盈亏 都显示', '主 USD 大字 · 小字 CNY 辅助 · 汇率明示', '🧹 代码清理 -105 行 (10 处死代码)'],
                  },
                  {
                    ver: 'v10.7.9.8', date: '2026-04-23',
                    items: ['✨ 北极星计划卡 宇宙动效 (保留烈焰红金)', '北极星移到右下角, 不挡设置按钮', '8 颗闪烁星 + 偶尔流星'],
                  },
                  {
                    ver: 'v10.7.9.7', date: '2026-04-23',
                    items: ['🔧 修复顶部指数(标普/纳指 ETF)WebSocket 不更新', '现在 SPY/QQQ 也实时推送'],
                  },
                  {
                    ver: 'v10.7.9.6', date: '2026-04-23',
                    items: ['📋 设置页卡片重排序 (符合使用频率)', '新顺序: 实时推送 → 数据状态 → 更新日志 → 云端 → 数据 → 关于', '高频功能优先 (实时推送在最上)'],
                  },
                  {
                    ver: 'v10.7.9.5', date: '2026-04-23',
                    items: ['🐛 修复复利计划输入 bug (起始年/总年数/目标年龄)', '之前: 删空数字会自动跳回默认值, 不让删', '现在: 输入时可以完全清空, 失焦时才 fallback 默认'],
                  },
                  {
                    ver: 'v10.7.9.4', date: '2026-04-23',
                    items: ['📜 复盘日志默认显示 10 条 (跟戒律一致)', '超过 10 条 → "展开剩余 X 条" 按钮', '收起后回归 10 条简洁视图'],
                  },
                  {
                    ver: 'v10.7.9.3', date: '2026-04-23',
                    items: ['🐛 修复戒律置顶 bug (pinned 排序失效)', '现在置顶的戒律永远显示在最上面'],
                  },
                  {
                    ver: 'v10.7.9.2', date: '2026-04-23',
                    items: ['📐 关注列表再扩宽 (删 ✕ + 单线分隔)', '右侧 padding 28px → 14px (内容多 14px 空间)', '卡间双线 → 单线 (视觉更轻)', '删除股票: 点卡片进编辑 → 底部"删除"按钮'],
                  },
                  {
                    ver: 'v10.7.9.1', date: '2026-04-23',
                    items: ['📱 关注列表入侵式占满全屏 (手机视觉 +宽 32px)', '卡片左右贴边, 走势图更长', '编辑卡和添加按钮保持原宽度'],
                  },
                  {
                    ver: 'v10.7.9.0', date: '2026-04-23',
                    items: ['🎨 关注列表卡片重设计 (B 对称两块)', '左块: 持仓信息 / 右块: 52周高 + L级', '移除整张卡红色背景 (跟"触发预警"统一)', '52周跌幅红色 + 等级渐深 (L1黄→L7暗红)'],
                  },
                  {
                    ver: 'v10.7.8.9', date: '2026-04-22',
                    items: ['🎉 大合并版: 含所有功能 + 修复', '🎯 当前猎手状态 / settings 补全 / try/catch 兼容'],
                  },
                  {
                    ver: 'v10.7.8.8', date: '2026-04-22',
                    items: ['🚨 修复 5 张表加载失败 (Supabase auth lock 抢锁 bug)', '⚡ 性能优化: 7 处 useMemo (波段/警报/统计缓存)', 'WebSocket 模式 CPU 占用降低 ~40%'],
                  },
                  {
                    ver: 'v10.7.8.7', date: '2026-04-22',
                    items: ['💾 新增"导出 JSON 备份"按钮 (设置页 → 数据卡)', '建议每月 1 次导出, 对抗数据意外丢失'],
                  },
                  {
                    ver: 'v10.7.8.6', date: '2026-04-22',
                    items: ['底部 tab "复盘" 改名 "目标" (更贴合实际功能)', '更新日志支持折叠/展开 (默认显示最新 5 条)'],
                  },
                  {
                    ver: 'v10.7.8.5', date: '2026-04-22',
                    items: ['首页指数改用 SPY/QQQ ETF (实时数据 替代 15min 延迟)', '删除"手动保存"假按钮'],
                  },
                  {
                    ver: 'v10.7.8.3', date: '2026-04-22',
                    items: ['年度目标进度条改成"实际收益完成度" (不再是时间)', '4 个主按钮统一金色描边'],
                  },
                  {
                    ver: 'v10.7.8.1', date: '2026-04-22',
                    items: ['WebSocket 走势图实时同步 (1 分钟合并桶)'],
                  },
                  {
                    ver: 'v10.7.8', date: '2026-04-22',
                    items: ['🧪 WebSocket 实时推送 BETA (< 50ms 延迟)', '设置页 → 🧪 实时推送 手动开启', '价格变化时卡片闪烁动画'],
                  },
                  {
                    ver: 'v10.7.7.4', date: '2026-04-22',
                    items: ['🛡️ 数据安全加固: 云端失败时不覆盖本地', '顶部警告横幅 (含重试按钮)', '"重置"加二次确认 (防误操作)'],
                  },
                  {
                    ver: 'v10.7.7.3', date: '2026-04-22',
                    items: ['修复波段"消失"bug (id 改基于日期)', '新增"📋 全部交易"弹窗 (完整历史可查可删)'],
                  },
                  {
                    ver: 'v10.7.7.2', date: '2026-04-22',
                    items: ['资产走势图入场动画 (V2 点依次弹出)', '空月断线 不画"假数据"'],
                  },
                  {
                    ver: 'v10.7.7.1', date: '2026-04-22',
                    items: ['资产走势图空月断线修复'],
                  },
                  {
                    ver: 'v10.7.7', date: '2026-04-22',
                    items: ['设置页全部黑金统一', '云端账户 + 手动拉取按钮改黑金'],
                  },
                  {
                    ver: 'v10.7.6', date: '2026-04-22',
                    items: ['设置页删除持仓头卡', '数据状态升级为智能刷新实时指标', '新增更新日志卡片'],
                  },
                  {
                    ver: 'v10.7.5', date: '2026-04-22',
                    items: ['修复密码重置直接登录 bug', '设置页加"修改密码"入口'],
                  },
                  {
                    ver: 'v10.7.4', date: '2026-04-22',
                    items: ['新增忘记密码功能', '登录页升级黑金主题'],
                  },
                  {
                    ver: 'v10.7.3', date: '2026-04-22',
                    items: ['品牌图标: 金色 K 线柱', 'App 名改为 Bottomline'],
                  },
                  {
                    ver: 'v10.7.2', date: '2026-04-22',
                    items: ['资产录入按人 Tab 切换 (我/老婆)'],
                  },
                  {
                    ver: 'v10.7.1', date: '2026-04-22',
                    items: ['智能刷新 (盘中 10s/盘外 30s/休市 5min)', '修复首次进入没走势图'],
                  },
                  {
                    ver: 'v10.7.0', date: '2026-04-22',
                    items: ['我的关注 Robinhood 风改造', '走势图 56px + 渐变填充'],
                  },
                  {
                    ver: 'v10.6.9', date: '2026-04-21',
                    items: ['修复 HKD 汇率 bug (港币换算正确)'],
                  },
                  {
                    ver: 'v10.6.8', date: '2026-04-21',
                    items: ['全黑流动金线开屏 (V4-B)', 'SUPABASE LIVE 状态徽章'],
                  },
                  {
                    ver: 'v10.6.7', date: '2026-04-21',
                    items: ['大 B 开屏字母品牌强化'],
                  },
                  {
                    ver: 'v10.6.6', date: '2026-04-21',
                    items: ['3 tab 头部统一奢华黑金'],
                  },
                  {
                    ver: 'v10.6.5', date: '2026-04-21',
                    items: ['修复 52 周高拆股 bug (TQQQ)', '盘前数据自动显示'],
                  },
                  {
                    ver: 'v10.6.4', date: '2026-04-21',
                    items: ['交易 tab V3.2 重做: 进行中独立大卡 + 历史紧凑'],
                  },
                  {
                    ver: 'v10.6.0-3', date: '2026-04-20',
                    items: ['年度表视觉升级', '字号+折叠优化', '防重复提交'],
                  },
                  {
                    ver: 'v10.5.x', date: '2026-04-19',
                    items: ['复利计划', '融资杠杆监控', '投资戒律'],
                  },
                  {
                    ver: 'v10.x', date: '2026-04 之前',
                    items: ['Supabase 云端同步', '账户/快照独立表', '波段切分'],
                  },
                  {
                    ver: 'v1.0', date: '诞生',
                    items: ['第一版 TQQQ 波段追踪器 🎂'],
                  },
                ];
                return (
                  <div>
                    {(changelogExpanded ? changelog : changelog.slice(0, 5)).map((log, idx, arr) => (
                      <div
                        key={log.ver}
                        className={`py-3 ${idx !== arr.length - 1 ? 'border-b border-slate-100' : ''} ${idx === 0 ? 'pt-0' : ''}`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className="px-2 py-0.5 rounded text-[11px] font-black tabular-nums"
                            style={{
                              fontFamily: 'ui-monospace, monospace',
                              background: log.latest
                                ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                                : 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                              color: log.latest ? '#fff' : '#0a0a0a',
                            }}
                          >
                            {log.ver}
                          </span>
                          <span className="text-[10px] text-slate-400 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                            {log.date}
                          </span>
                          {log.latest && (
                            <span className="ml-auto px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-black tracking-wider">
                              最新
                            </span>
                          )}
                        </div>
                        <ul className="pl-1 space-y-0.5">
                          {log.items.map((item, i) => (
                            <li key={i} className="text-[12px] text-slate-600 pl-3.5 relative">
                              <span className="absolute left-1 text-amber-500 font-bold">·</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}

                    {/* 折叠/展开按钮 */}
                    {changelog.length > 5 && (
                      <button
                        onClick={() => setChangelogExpanded(!changelogExpanded)}
                        className="w-full mt-2 py-2.5 rounded-xl text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 active:scale-95 transition flex items-center justify-center gap-1.5"
                      >
                        {changelogExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            收起 (隐藏 {changelog.length - 5} 条历史)
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            查看完整历史 (还有 {changelog.length - 5} 条 · 共 {changelog.length} 个版本)
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* 账户信息 - 奢华黑金 */}
            <div
              className="rounded-2xl p-5 text-white relative overflow-hidden"
              style={{
                background: `
                  radial-gradient(circle at 0% 0%, rgba(251, 191, 36, 0.15) 0%, transparent 50%),
                  radial-gradient(circle at 100% 100%, rgba(245, 158, 11, 0.1) 0%, transparent 50%),
                  linear-gradient(135deg, #0a0a0a 0%, #171717 50%, #0a0a0a 100%)
                `,
                border: '1px solid rgba(251, 191, 36, 0.2)',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(251, 191, 36, 0.1)',
              }}
            >
              {/* 金色光晕装饰 (右上) */}
              <div className="absolute top-0 right-0 w-44 h-44 pointer-events-none" style={{
                background: 'radial-gradient(circle, rgba(251, 191, 36, 0.18) 0%, transparent 70%)',
                transform: 'translate(40%, -40%)',
              }}></div>

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <h2
                    className="font-black text-lg flex items-center gap-2"
                    style={{
                      background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      letterSpacing: '1px',
                    }}
                  >
                    ☁️ 云端账户
                  </h2>
                  <span
                    className="px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1.5"
                    style={{
                      background: 'rgba(34, 197, 94, 0.12)',
                      border: '1px solid rgba(34, 197, 94, 0.2)',
                      color: '#4ade80',
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#4ade80' }}></span>
                    已登录
                  </span>
                </div>
                <div
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: '#737373', letterSpacing: '2px' }}
                >
                  SIGNED IN
                </div>
                <div
                  className="text-sm font-bold mb-3 break-all mt-1"
                  style={{ color: '#d4d4d4', fontFamily: 'ui-monospace, monospace' }}
                >
                  {user?.email || '--'}
                </div>
                <div
                  className="text-[10px] mb-3 leading-relaxed p-2.5 rounded-lg"
                  style={{
                    color: '#a3a3a3',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(251, 191, 36, 0.08)',
                  }}
                >
                  💾 数据已云端备份 (Supabase Singapore)<br />
                  🔒 行级安全 · 任何人都无法访问你的数据<br />
                  📱 任意设备登录此账号都能看到你的数据
                </div>
                <button
                  onClick={() => setShowChangePassword(true)}
                  className="w-full py-2.5 rounded-xl active:scale-95 transition flex items-center justify-center gap-1.5 text-sm font-bold mb-2"
                  style={{
                    background: 'rgba(251, 191, 36, 0.1)',
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    color: '#fbbf24',
                  }}
                >
                  🔑 修改密码
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm('确认退出登录?\n下次进入需要重新登录。')) return;
                    await onLogout();
                  }}
                  className="w-full py-2.5 rounded-xl active:scale-95 transition flex items-center justify-center gap-1.5 text-sm font-bold"
                  style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    color: '#f87171',
                  }}
                >
                  <LogOut className="w-4 h-4" /> 退出登录
                </button>
              </div>
            </div>

            {/* 修改密码 Modal */}
            {showChangePassword && (
              <div
                className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
                onClick={(e) => { if (e.target === e.currentTarget) { setShowChangePassword(false); setNewPwd(''); setPwdMsg(null); } }}
              >
                <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-black text-base flex items-center gap-2">
                      🔑 修改密码
                    </h3>
                    <button
                      onClick={() => { setShowChangePassword(false); setNewPwd(''); setPwdMsg(null); }}
                      className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <label className="block text-xs text-slate-500 font-bold mb-1">新密码 (至少 6 位)</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPwd}
                    onChange={e => setNewPwd(e.target.value)}
                    placeholder="至少 6 位"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:border-amber-500 focus:outline-none mb-3"
                  />

                  {pwdMsg && (
                    <div className={`mb-3 px-3 py-2 rounded-lg text-xs ${
                      pwdMsg.type === 'error'
                        ? 'bg-red-50 border border-red-200 text-red-700'
                        : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                    }`}>
                      {pwdMsg.text}
                    </div>
                  )}

                  <button
                    onClick={async () => {
                      if (!newPwd || newPwd.length < 6) {
                        setPwdMsg({ type: 'error', text: '密码至少 6 位' });
                        return;
                      }
                      setPwdLoading(true);
                      setPwdMsg(null);
                      try {
                        const { error } = await supabase.auth.updateUser({ password: newPwd });
                        if (error) {
                          setPwdMsg({ type: 'error', text: error.message });
                        } else {
                          setPwdMsg({ type: 'success', text: '✓ 密码已更新, 下次登录用新密码' });
                          setNewPwd('');
                          setTimeout(() => {
                            setShowChangePassword(false);
                            setPwdMsg(null);
                          }, 2000);
                        }
                      } catch (e) {
                        setPwdMsg({ type: 'error', text: e.message || '更新失败' });
                      } finally {
                        setPwdLoading(false);
                      }
                    }}
                    disabled={pwdLoading}
                    className="w-full py-3 font-black rounded-xl active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                      color: '#0a0a0a',
                    }}
                  >
                    {pwdLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />保存中...</>
                    ) : '保存新密码'}
                  </button>

                  <p className="text-[10px] text-slate-400 text-center mt-3">
                    保存后下次登录请使用新密码
                  </p>
                </div>
              </div>
            )}

            {/* 数据持久化 */}
            <div className="bg-white rounded-2xl p-5 shadow">
              <h2 className="font-bold text-lg mb-3">💾 数据</h2>
              <div className="text-xs text-slate-500 mb-3 leading-relaxed">
                所有数据自动云端同步, 无需手动保存。
                <br/>
                建议: 每月导出一次 JSON 备份到本地。
              </div>
              <div className="space-y-2">
                {/* 导出 JSON 备份 */}
                <button
                  onClick={() => {
                    const backup = {
                      exportedAt: new Date().toISOString(),
                      version: 'v10.7.8.6',
                      trades,
                      watchlist,
                      waveNotes,
                      accounts,
                      snapshots,
                      investmentPlan,
                      marginStatus,
                      disciplines,
                      reviewLogs,
                      yearlyActuals,
                      settings: {
                        benchmarkSymbol, fgi, fgiLabel, fgiPrev, fgiWeek, fgiMonth, fgiYear, fgiDataDate,
                        vix, vixDataDate, batches, exitTargets, usdRate, hkdRate,
                      },
                    };
                    const json = JSON.stringify(backup, null, 2);
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const date = new Date().toISOString().slice(0, 10);
                    a.download = `bottomline-backup-${date}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="w-full py-2.5 rounded-xl font-black text-sm active:scale-95 transition flex items-center justify-center gap-1.5"
                  style={{
                    background: '#fff',
                    color: '#d97706',
                    border: '2px solid #fbbf24',
                  }}
                >
                  ⬇️ 导出 JSON 备份
                </button>
                {/* 重置本地数据 */}
                <button
                  onClick={resetAll}
                  className="w-full py-2.5 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 flex items-center justify-center gap-1.5 active:scale-95 transition"
                >
                  <RotateCcw className="w-4 h-4" /> 重置本地数据
                </button>
              </div>
            </div>

            {/* 关于 */}
            <div className="bg-white rounded-2xl p-5 shadow">
              <h2 className="font-bold text-lg mb-3">关于 Bottomline</h2>
              <div className="text-sm text-slate-600 space-y-1.5">
                <div>📊 版本:v10.7.9.15</div>
                <div>📡 数据源:EODHD + Yahoo Finance</div>
                <div>💡 提示:把这个页面"添加到主屏幕"获得 App 体验</div>
              </div>
            </div>
          </div>
        )}
        {/* ====== 设置 tab 结束 ====== */}

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

        {/* 底部 5 tab 导航栏 */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-2xl z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
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
  // 🔑 检测是否是从"重置密码"邮件链接点进来的
  // 必须在外层就挂住 (不让 auth session 自动进主界面)
  const [isRecovery, setIsRecovery] = useState(() => {
    const hash = window.location.hash || '';
    return hash.includes('type=recovery');
  });
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

  // 🔑 重置密码流程: 即使已登录, 也强制进 Login 组件 (让用户设新密码)
  // 新密码设完之后 (Login 调 onSuccess), 才清除 recovery 状态
  if (isRecovery) {
    return <Login onSuccess={(user) => {
      setIsRecovery(false);
      setAuthState({ loading: false, user });
    }} />;
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

// ============================================
// 📅 最后修改时间: 2026-04-23 10:00:00 (UTC+8)
// 📝 本次更新: v10.7.9.3 - 关注列表再扩宽 📐
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
