import React, { useState, useEffect, useMemo } from 'react';
import { TrendingDown, TrendingUp, DollarSign, Target, AlertCircle, CheckCircle2, Clock, Trash2, Plus, Save, RotateCcw, BarChart3, RefreshCw, Wifi, WifiOff } from 'lucide-react';

// ============ K线走势图组件 ============
function PriceChart({ watchlist }) {
  const [period, setPeriod] = useState('day'); // day / week / month
  const [symbol, setSymbol] = useState('TQQQ');
  const [loading, setLoading] = useState(false);

  // 当前选中股票的价格
  const currentStock = watchlist.find(s => s.symbol === symbol) || watchlist[0];
  const basePrice = currentStock?.price || 100;

  // 生成模拟历史数据(实际项目替换为 API 调用)
  const data = useMemo(() => {
    const periods = period === 'day' ? 30 : period === 'week' ? 12 : 12;
    // 不同股票不同波动率
    const volMap = { TQQQ: 0.04, NVDA: 0.025, TSM: 0.018, META: 0.018, MSFT: 0.012, GOOGL: 0.018, QQQ: 0.012 };
    const volatility = volMap[symbol] || 0.02;

    const seed = symbol.charCodeAt(0) + symbol.charCodeAt(1) + period.charCodeAt(0);
    const rand = (i) => {
      const x = Math.sin(seed + i * 7.13) * 10000;
      return x - Math.floor(x);
    };

    const result = [];
    let price = basePrice * 0.75;
    
    for (let i = 0; i < periods; i++) {
      const open = price;
      const trend = (i / periods) * 0.4;
      const noise = (rand(i) - 0.5) * 2 * volatility;
      const change = trend * volatility + noise;
      const close = open * (1 + change);
      const high = Math.max(open, close) * (1 + Math.abs(rand(i + 100)) * volatility * 0.5);
      const low = Math.min(open, close) * (1 - Math.abs(rand(i + 200)) * volatility * 0.5);
      const volume = Math.floor(50 + rand(i + 300) * 100);

      let label;
      if (period === 'day') {
        const d = new Date();
        d.setDate(d.getDate() - (periods - 1 - i));
        label = `${d.getMonth() + 1}/${d.getDate()}`;
      } else if (period === 'week') {
        label = `W${periods - i}`;
      } else {
        const d = new Date();
        d.setMonth(d.getMonth() - (periods - 1 - i));
        label = `${d.getMonth() + 1}月`;
      }

      result.push({
        label,
        open: +open.toFixed(2),
        close: +close.toFixed(2),
        high: +high.toFixed(2),
        low: +low.toFixed(2),
        volume,
        rising: close >= open,
        bodyLow: Math.min(open, close),
        bodyHigh: Math.max(open, close),
        wickRange: [low, high],
      });
      price = close;
    }

    if (result.length > 0) {
      result[result.length - 1].close = +basePrice.toFixed(2);
      result[result.length - 1].high = Math.max(result[result.length - 1].high, basePrice);
      result[result.length - 1].bodyHigh = Math.max(result[result.length - 1].open, basePrice);
      result[result.length - 1].bodyLow = Math.min(result[result.length - 1].open, basePrice);
      result[result.length - 1].rising = basePrice >= result[result.length - 1].open;
    }

    return result;
  }, [symbol, period, basePrice]);

  const prices = data.flatMap(d => [d.high, d.low]);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = (maxPrice - minPrice) * 0.1;

  const firstPrice = data[0]?.open || 0;
  const lastPrice = data[data.length - 1]?.close || 0;
  const totalChange = ((lastPrice - firstPrice) / firstPrice) * 100;

  const refresh = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 500);
  };

  return (
    <div className="bg-white rounded-2xl p-5 mb-4 shadow">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          走势图
        </h2>
      </div>

      {/* 股票选择(横向滚动) */}
      <div className="flex gap-1 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
        {watchlist.map(s => (
          <button
            key={s.symbol}
            onClick={() => setSymbol(s.symbol)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              symbol === s.symbol
                ? 'bg-slate-900 text-white shadow'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {s.symbol}
          </button>
        ))}
      </div>

      {/* 价格信息 */}
      <div className="mb-3 flex items-end justify-between">
        <div>
          <div className="text-xs text-slate-500 mb-1">{currentStock?.name} · {symbol}</div>
          <div className="text-3xl font-bold text-slate-800">
            ${lastPrice.toFixed(2)}
          </div>
          <div className={`text-sm font-bold mt-1 ${totalChange >= 0 ? 'text-red-600' : 'text-green-600'}`}>
            {totalChange >= 0 ? '+' : ''}{(lastPrice - firstPrice).toFixed(2)} ({totalChange >= 0 ? '+' : ''}{totalChange.toFixed(2)}%)
          </div>
        </div>
        <div className="text-right text-xs text-slate-500 space-y-0.5">
          <div>区间最高 <span className="font-bold text-slate-700">${maxPrice.toFixed(2)}</span></div>
          <div>区间最低 <span className="font-bold text-slate-700">${minPrice.toFixed(2)}</span></div>
        </div>
      </div>

      {/* 周期切换 */}
      <div className="flex gap-1 mb-3 bg-slate-100 rounded-lg p-1">
        {[
          { key: 'day', label: '日 K (30天)' },
          { key: 'week', label: '周 K (12周)' },
          { key: 'month', label: '月 K (12月)' },
        ].map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`flex-1 py-1.5 rounded-md text-xs font-bold transition ${period === p.key ? 'bg-slate-900 text-white shadow' : 'text-slate-600'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* K 线图(纯 SVG 绘制,稳定可控) */}
      <CandleChart data={data} minPrice={minPrice} maxPrice={maxPrice} padding={padding} />

      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-red-500 rounded-sm"></span>涨
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-green-500 rounded-sm"></span>跌
          </span>
        </div>
        <button onClick={refresh} className="text-blue-600 font-medium active:scale-95">
          {loading ? '加载中…' : '🔄 刷新'}
        </button>
      </div>
      <div className="mt-2 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
        💡 当前为模拟走势数据用于演示。接入实时行情需对接券商或行情 API。
      </div>
    </div>
  );
}

// 纯 SVG K 线图(支持 hover 显示数据)
function CandleChart({ data, minPrice, maxPrice, padding }) {
  const [hover, setHover] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      setContainerWidth(containerRef.current?.offsetWidth || 0);
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const chartHeight = 220;
  const volumeHeight = 50;
  const totalHeight = chartHeight + volumeHeight + 30;
  const padLeft = 40;
  const padRight = 10;
  const padTop = 10;

  const yMin = minPrice - padding;
  const yMax = maxPrice + padding;
  const yRange = yMax - yMin;

  const chartWidth = Math.max(containerWidth - padLeft - padRight, 100);
  const candleSpacing = chartWidth / data.length;
  const candleWidth = Math.max(candleSpacing * 0.65, 2);

  const priceToY = (p) => padTop + ((yMax - p) / yRange) * chartHeight;
  
  const maxVolume = Math.max(...data.map(d => d.volume));
  const volumeBaseY = padTop + chartHeight + 25;

  // Y 轴刻度
  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = yMin + (yRange * i) / yTicks;
    return { y: priceToY(v), label: `$${v.toFixed(0)}` };
  });

  // X 轴刻度(显示首尾和中间)
  const xTickIndices = [0, Math.floor(data.length / 2), data.length - 1];

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: totalHeight }}>
      {containerWidth > 0 && (
        <svg width="100%" height={totalHeight}>
          {/* Y 轴网格线和标签 */}
          {yLabels.map((t, i) => (
            <g key={i}>
              <line
                x1={padLeft}
                y1={t.y}
                x2={padLeft + chartWidth}
                y2={t.y}
                stroke="#f1f5f9"
                strokeWidth={1}
              />
              <text
                x={padLeft - 4}
                y={t.y + 3}
                fontSize={10}
                fill="#64748b"
                textAnchor="end"
              >
                {t.label}
              </text>
            </g>
          ))}

          {/* K 线 */}
          {data.map((d, i) => {
            const cx = padLeft + i * candleSpacing + candleSpacing / 2;
            const yHigh = priceToY(d.high);
            const yLow = priceToY(d.low);
            const yOpen = priceToY(d.open);
            const yClose = priceToY(d.close);
            const color = d.rising ? '#ef4444' : '#10b981';
            const bodyTop = Math.min(yOpen, yClose);
            const bodyHeight = Math.max(Math.abs(yClose - yOpen), 1);

            // 成交量柱
            const volH = (d.volume / maxVolume) * volumeHeight;

            return (
              <g
                key={i}
                onMouseEnter={() => setHover({ ...d, x: cx })}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* 透明触发区 */}
                <rect
                  x={cx - candleSpacing / 2}
                  y={padTop}
                  width={candleSpacing}
                  height={chartHeight + volumeHeight + 10}
                  fill="transparent"
                />
                {/* 影线 */}
                <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke={color} strokeWidth={1} />
                {/* 实体 */}
                <rect
                  x={cx - candleWidth / 2}
                  y={bodyTop}
                  width={candleWidth}
                  height={bodyHeight}
                  fill={color}
                />
                {/* 成交量 */}
                <rect
                  x={cx - candleWidth / 2}
                  y={volumeBaseY + (volumeHeight - volH)}
                  width={candleWidth}
                  height={volH}
                  fill={color}
                  opacity={0.6}
                />
              </g>
            );
          })}

          {/* X 轴标签 */}
          {xTickIndices.map((idx) => {
            const cx = padLeft + idx * candleSpacing + candleSpacing / 2;
            return (
              <text
                key={idx}
                x={cx}
                y={padTop + chartHeight + 14}
                fontSize={10}
                fill="#64748b"
                textAnchor="middle"
              >
                {data[idx].label}
              </text>
            );
          })}

          {/* hover 竖线 */}
          {hover && (
            <line
              x1={hover.x}
              y1={padTop}
              x2={hover.x}
              y2={padTop + chartHeight + volumeHeight + 10}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="2,2"
            />
          )}

          {/* 成交量标签 */}
          <text x={padLeft - 4} y={volumeBaseY + 8} fontSize={9} fill="#94a3b8" textAnchor="end">
            量
          </text>
        </svg>
      )}

      {/* hover 提示框 */}
      {hover && (
        <div className="absolute top-1 right-1 bg-slate-900/95 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none">
          <div className="font-bold mb-1 text-slate-300">{hover.label}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <span className="text-slate-400">开</span>
            <span className="font-semibold">${hover.open.toFixed(2)}</span>
            <span className="text-slate-400">收</span>
            <span className={`font-semibold ${hover.rising ? 'text-red-400' : 'text-green-400'}`}>
              ${hover.close.toFixed(2)}
            </span>
            <span className="text-slate-400">高</span>
            <span className="font-semibold">${hover.high.toFixed(2)}</span>
            <span className="text-slate-400">低</span>
            <span className="font-semibold">${hover.low.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TQQQTracker() {
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

  // VIX 恐慌指数
  const [vix, setVix] = useState(16.5);
  
  // 预警通知开关(本地静默时间)
  const [alertsMuted, setAlertsMuted] = useState(false);

  // 三档配置(可调)
  const [batches, setBatches] = useState([
    { id: 1, name: '第1批', drawdown: -0.10, allocation: 0.25 },
    { id: 2, name: '第2批', drawdown: -0.15, allocation: 0.35 },
    { id: 3, name: '第3批', drawdown: -0.20, allocation: 0.40 },
  ]);

  // 实际成交记录
  const [trades, setTrades] = useState([]);
  const [showAddTrade, setShowAddTrade] = useState(false);
  const [newTrade, setNewTrade] = useState({
    batch: '第1批',
    date: new Date().toISOString().split('T')[0],
    price: '',
    shares: '',
  });

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
  
  useEffect(() => {
    try {
      const raw = localStorage.getItem('tqqq_state');
      if (raw) {
        const s = JSON.parse(raw);
        if (s.qqqHigh) setQqqHigh(s.qqqHigh);
        if (s.qqqCurrent) setQqqCurrent(s.qqqCurrent);
        if (s.tqqqCurrent) setTqqqCurrent(s.tqqqCurrent);
        if (s.totalCapital) setTotalCapital(s.totalCapital);
        if (s.batches) setBatches(s.batches);
        if (s.trades) setTrades(s.trades);
        if (s.exitTargets) setExitTargets(s.exitTargets);
        if (s.watchlist) setWatchlist(s.watchlist);
        if (s.vix) setVix(s.vix);
      }
    } catch (e) { /* 首次使用无数据 */ }
  }, []);

  const saveState = () => {
    try {
      const state = { qqqHigh, qqqCurrent, tqqqCurrent, totalCapital, batches, trades, exitTargets, watchlist, vix };
      localStorage.setItem('tqqq_state', JSON.stringify(state));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert('保存失败:' + e.message);
    }
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

  // 持仓汇总
  const totalShares = trades.reduce((sum, t) => sum + Number(t.shares), 0);
  const totalInvested = trades.reduce((sum, t) => sum + Number(t.shares) * Number(t.price), 0);
  const avgCost = totalShares > 0 ? totalInvested / totalShares : 0;
  const currentValue = totalShares * tqqqCurrent;
  const totalPnl = currentValue - totalInvested;
  const totalPnlPct = totalInvested > 0 ? totalPnl / totalInvested : 0;

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

  const addTrade = () => {
    if (!newTrade.price || !newTrade.shares) {
      alert('请填写成交价和股数');
      return;
    }
    setTrades([...trades, { ...newTrade, id: Date.now(), price: parseFloat(newTrade.price), shares: parseInt(newTrade.shares) }]);
    setNewTrade({ batch: '第1批', date: new Date().toISOString().split('T')[0], price: '', shares: '' });
    setShowAddTrade(false);
  };

  const deleteTrade = (id) => {
    setTrades(trades.filter(t => t.id !== id));
  };

  const updateStockPrice = (symbol, field, value) => {
    setWatchlist(watchlist.map(s => s.symbol === symbol ? { ...s, [field]: parseFloat(value) || 0 } : s));
    if (symbol === 'TQQQ' && field === 'price') setTqqqCurrent(parseFloat(value) || 0);
    if (symbol === 'QQQ' && field === 'price') setQqqCurrent(parseFloat(value) || 0);
  };

  // 一键拉取实时行情(从 Vercel API)
  const fetchRealtimePrices = async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const symbols = [...watchlist.map(s => s.symbol), 'VIX'].join(',');
      const r = await fetch(`/api/quote?symbols=${symbols}`);
      const result = await r.json();
      
      if (!result.success) {
        throw new Error(result.error || '拉取失败');
      }

      // 更新股票价格
      const updated = watchlist.map(s => {
        const fresh = result.data.find(d => d.symbol === s.symbol);
        if (fresh && fresh.price > 0) {
          // 如果当前价突破历史最高,自动更新最高价
          const newHigh = Math.max(s.high || 0, fresh.price);
          return { ...s, price: fresh.price, high: newHigh };
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
      if (vixData?.price > 0) setVix(vixData.price);

      setLastFetched(new Date());
    } catch (e) {
      setFetchError(e.message);
    } finally {
      setFetching(false);
    }
  };

  const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtPct = (n) => `${(n * 100).toFixed(1)}%`;

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24">
      <div className="max-w-5xl mx-auto">
        {/* 顶部标题 */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white rounded-2xl p-5 mb-4 shadow-lg">
          <h1 className="text-2xl font-bold">波段跟踪计划 2.0</h1>
          <p className="text-blue-100 text-sm mt-1">分批建仓 · 目标 50-100% · 一年一次</p>
        </div>

        {/* 状态卡片 */}
        <div className={`rounded-2xl p-5 mb-4 shadow ${status.color}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm opacity-80">当前市场状态</div>
              <div className="text-2xl font-bold mt-1">{status.text}</div>
              <div className="text-sm mt-1 opacity-90">{status.desc}</div>
            </div>
            <div className="text-right">
              <div className="text-sm opacity-80">QQQ 回撤</div>
              <div className="text-3xl font-bold">{fmtPct(drawdown)}</div>
            </div>
          </div>
        </div>

        {/* 🚨 预警横幅(有触发时才显示) */}
        {triggeredAlerts.length > 0 && !alertsMuted && (
          <div className="space-y-2 mb-4">
            {triggeredAlerts.slice(0, 3).map(s => {
              const isExtreme = s.alert.level >= 7;
              const isHigh = s.alert.level >= 5;
              return (
                <div
                  key={s.symbol}
                  className={`rounded-2xl border-2 p-4 shadow-lg ${s.alert.color} ${isExtreme ? 'animate-pulse' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={isExtreme ? 'text-2xl' : isHigh ? 'text-xl' : 'text-base'}>
                          {s.alert.icon}
                        </span>
                        <span className={`font-black ${isExtreme ? 'text-xl' : 'text-base'}`}>
                          {s.symbol} · {s.alert.label}
                        </span>
                        <span className="text-xs opacity-80 px-1.5 py-0.5 rounded bg-white/30">
                          L{s.alert.level}
                        </span>
                      </div>
                      <div className={`font-bold mb-1 ${isExtreme ? 'text-2xl' : 'text-lg'}`}>
                        {s.name} 已下跌 {(Math.abs(s.drawdown) * 100).toFixed(1)}%
                      </div>
                      <div className={`${isExtreme ? 'text-base font-bold' : 'text-sm'} opacity-95`}>
                        ➡️ {s.alert.action}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs opacity-70">从 ${fmt(s.high)}</div>
                      <div className={`font-black ${isExtreme ? 'text-2xl' : 'text-lg'}`}>${fmt(s.price)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            {triggeredAlerts.length > 3 && (
              <div className="text-center text-xs text-slate-500 py-1">
                还有 {triggeredAlerts.length - 3} 只股票触发预警,见下方列表
              </div>
            )}
            <button
              onClick={() => setAlertsMuted(true)}
              className="w-full py-2 bg-slate-200 text-slate-600 rounded-lg text-xs font-medium active:scale-95"
            >
              暂时收起预警
            </button>
          </div>
        )}

        {alertsMuted && triggeredAlerts.length > 0 && (
          <button
            onClick={() => setAlertsMuted(false)}
            className="w-full mb-4 py-2 bg-orange-100 text-orange-800 rounded-lg text-sm font-bold border border-orange-300 active:scale-95"
          >
            🔔 有 {triggeredAlerts.length} 个预警被收起,点击展开
          </button>
        )}

        {/* VIX 恐慌指数 */}
        <div className={`rounded-2xl p-5 mb-4 shadow border-2 ${vixSignal.color}`}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-xs opacity-80 font-medium">VIX 恐慌指数</div>
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

          {/* VIX 输入 */}
          <div className="mt-3 flex items-center gap-2">
            <label className="text-xs opacity-80 font-bold">更新 VIX:</label>
            <input
              type="number"
              step="0.1"
              value={vix}
              onChange={(e) => setVix(parseFloat(e.target.value) || 0)}
              className="flex-1 px-3 py-1.5 rounded-lg text-sm font-bold text-slate-900 bg-white/90 border border-white/50"
            />
          </div>
        </div>

        {/* 关注股票 */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow">
          <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            我的关注
            <span className="text-xs text-slate-500 font-normal ml-auto">点击卡片编辑价格/持仓</span>
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {watchlistAlerts.map(s => {
              const pnl = s.cost > 0 ? (s.price - s.cost) / s.cost : 0;
              const marketValue = s.shares * s.price;
              const isEditing = editingStock === s.symbol;
              const hasAlert = !!s.alert;
              const isExtreme = hasAlert && s.alert.level >= 7;
              return (
                <div
                  key={s.symbol}
                  className={`rounded-xl border-2 transition ${
                    isEditing
                      ? 'border-blue-500 bg-blue-50'
                      : hasAlert
                        ? `${s.alert.color} ${isExtreme ? 'animate-pulse' : ''}`
                        : 'border-slate-200 bg-slate-50 active:bg-slate-100'
                  }`}
                >
                  {!isEditing ? (
                    <button
                      onClick={() => setEditingStock(s.symbol)}
                      className="w-full text-left p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1">
                          <span className={`font-bold text-sm ${hasAlert ? '' : 'text-slate-800'}`}>{s.symbol}</span>
                          {hasAlert && (
                            <span className="text-[9px] px-1 py-0.5 rounded font-black bg-white/40">
                              {s.alert.icon} L{s.alert.level}
                            </span>
                          )}
                        </div>
                        <span className={`text-xs ${hasAlert ? 'opacity-80' : 'text-slate-500'}`}>{s.name}</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className={`text-lg font-bold ${hasAlert ? '' : 'text-slate-900'}`}>${fmt(s.price)}</span>
                        {s.cost > 0 && (
                          <span className={`text-xs font-bold ${hasAlert ? 'opacity-90' : pnl >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {pnl >= 0 ? '+' : ''}{(pnl * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                      {/* 回撤显示 */}
                      {s.high > 0 && (
                        <div className={`text-[11px] mt-1 font-bold ${hasAlert ? 'opacity-90' : 'text-slate-500'}`}>
                          {s.drawdown < 0 ? '⬇' : '⬆'} 距高 {(s.drawdown * 100).toFixed(1)}%
                          {hasAlert && <span className="ml-1">· {s.alert.label}</span>}
                        </div>
                      )}
                      {s.shares > 0 && (
                        <div className={`text-[10px] mt-0.5 ${hasAlert ? 'opacity-80' : 'text-slate-500'}`}>
                          {s.shares}股 · ${fmt(marketValue, 0)}
                        </div>
                      )}
                    </button>
                  ) : (
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm">{s.symbol} <span className="text-xs text-slate-500 font-normal">{s.name}</span></span>
                        <button
                          onClick={() => setEditingStock(null)}
                          className="text-xs text-blue-600 font-bold active:scale-95"
                        >
                          完成
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        <div>
                          <label className="text-[10px] text-slate-500">现价</label>
                          <input
                            type="number"
                            step="0.01"
                            value={s.price}
                            onChange={(e) => updateStockPrice(s.symbol, 'price', e.target.value)}
                            className="w-full px-1.5 py-1 border border-slate-300 rounded text-xs font-bold text-blue-700"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500">最高价</label>
                          <input
                            type="number"
                            step="0.01"
                            value={s.high}
                            onChange={(e) => updateStockPrice(s.symbol, 'high', e.target.value)}
                            className="w-full px-1.5 py-1 border border-slate-300 rounded text-xs font-bold text-orange-700"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        <div>
                          <label className="text-[10px] text-slate-500">成本</label>
                          <input
                            type="number"
                            step="0.01"
                            value={s.cost}
                            onChange={(e) => updateStockPrice(s.symbol, 'cost', e.target.value)}
                            className="w-full px-1.5 py-1 border border-slate-300 rounded text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500">股数</label>
                          <input
                            type="number"
                            value={s.shares}
                            onChange={(e) => updateStockPrice(s.symbol, 'shares', e.target.value)}
                            className="w-full px-1.5 py-1 border border-slate-300 rounded text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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

        {/* 核心输入 */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow">
          <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-blue-600" />
            核心参数(每日更新)
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-600 font-medium">QQQ 6个月最高价</label>
              <input
                type="number"
                step="0.01"
                value={qqqHigh}
                onChange={(e) => setQqqHigh(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-3 py-2 border-2 border-yellow-300 bg-yellow-50 rounded-lg text-lg font-bold text-blue-700 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">QQQ 当前价</label>
              <input
                type="number"
                step="0.01"
                value={qqqCurrent}
                onChange={(e) => setQqqCurrent(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-3 py-2 border-2 border-yellow-300 bg-yellow-50 rounded-lg text-lg font-bold text-blue-700 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">TQQQ 当前价</label>
              <input
                type="number"
                step="0.01"
                value={tqqqCurrent}
                onChange={(e) => setTqqqCurrent(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-3 py-2 border-2 border-yellow-300 bg-yellow-50 rounded-lg text-lg font-bold text-blue-700 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">可用资金 ($)</label>
              <input
                type="number"
                step="1000"
                value={totalCapital}
                onChange={(e) => setTotalCapital(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-3 py-2 border-2 border-yellow-300 bg-yellow-50 rounded-lg text-lg font-bold text-blue-700 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* 走势图 */}
        <PriceChart watchlist={watchlist} />

        {/* 建仓计划 */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow">
          <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-600" />
            建仓计划(可编辑回撤档位与仓位)
          </h2>
          <div className="space-y-3">
            {computedBatches.map(b => (
              <div key={b.id} className={`rounded-xl p-4 border-2 ${b.executed ? 'border-green-400 bg-green-50' : b.triggered ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg">{b.name}</span>
                    {b.executed ? (
                      <span className="px-2 py-0.5 bg-green-600 text-white text-xs rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> 已成交
                      </span>
                    ) : b.triggered ? (
                      <span className="px-2 py-0.5 bg-orange-600 text-white text-xs rounded-full flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> 可买入
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-slate-400 text-white text-xs rounded-full flex items-center gap-1">
                        <Clock className="w-3 h-3" /> 等待
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-slate-600">回撤档位 (%)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={(b.drawdown * 100).toFixed(1)}
                      onChange={(e) => updateBatch(b.id, 'drawdown', (parseFloat(e.target.value) || 0) / 100)}
                      className="w-full mt-1 px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">仓位比例 (%)</label>
                    <input
                      type="number"
                      step="5"
                      value={(b.allocation * 100).toFixed(0)}
                      onChange={(e) => updateBatch(b.id, 'allocation', (parseFloat(e.target.value) || 0) / 100)}
                      className="w-full mt-1 px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-white rounded-lg p-2">
                    <div className="text-xs text-slate-500">QQQ 触发价</div>
                    <div className="font-bold text-blue-700">${fmt(b.triggerPrice)}</div>
                  </div>
                  <div className="bg-white rounded-lg p-2">
                    <div className="text-xs text-slate-500">TQQQ 估算价</div>
                    <div className="font-bold text-purple-700">${fmt(b.tqqqEstimate)}</div>
                  </div>
                  <div className="bg-white rounded-lg p-2">
                    <div className="text-xs text-slate-500">应投金额</div>
                    <div className="font-bold text-slate-800">${fmt(b.investAmount, 0)}</div>
                  </div>
                  <div className="bg-white rounded-lg p-2">
                    <div className="text-xs text-slate-500">预估股数</div>
                    <div className="font-bold text-slate-800">{fmt(b.estShares, 0)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 p-2 bg-blue-50 rounded-lg text-xs text-slate-700">
            合计仓位:{fmtPct(batches.reduce((s, b) => s + b.allocation, 0))}
            {batches.reduce((s, b) => s + b.allocation, 0) !== 1 && (
              <span className="text-red-600 font-bold ml-2">⚠ 不等于 100%</span>
            )}
          </div>
        </div>

        {/* 实际持仓 */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              实际持仓
            </h2>
            <button
              onClick={() => setShowAddTrade(!showAddTrade)}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-1 active:scale-95 transition"
            >
              <Plus className="w-4 h-4" /> 添加成交
            </button>
          </div>

          {showAddTrade && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-3 mb-3">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <select
                  value={newTrade.batch}
                  onChange={(e) => setNewTrade({ ...newTrade, batch: e.target.value })}
                  className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm"
                >
                  {batches.map(b => <option key={b.id}>{b.name}</option>)}
                </select>
                <input
                  type="date"
                  value={newTrade.date}
                  onChange={(e) => setNewTrade({ ...newTrade, date: e.target.value })}
                  className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm"
                />
                <input
                  type="number"
                  placeholder="成交价 ($)"
                  step="0.01"
                  value={newTrade.price}
                  onChange={(e) => setNewTrade({ ...newTrade, price: e.target.value })}
                  className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm"
                />
                <input
                  type="number"
                  placeholder="股数"
                  value={newTrade.shares}
                  onChange={(e) => setNewTrade({ ...newTrade, shares: e.target.value })}
                  className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={addTrade} className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium active:scale-95">确认添加</button>
                <button onClick={() => setShowAddTrade(false)} className="flex-1 py-2 bg-slate-300 text-slate-700 rounded-lg text-sm font-medium active:scale-95">取消</button>
              </div>
            </div>
          )}

          {trades.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              还没有成交记录。等触发后,在此添加。
            </div>
          ) : (
            <div className="space-y-2">
              {trades.map(t => (
                <div key={t.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{t.batch} <span className="text-xs text-slate-500 ml-2">{t.date}</span></div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {t.shares} 股 @ ${fmt(t.price)} = ${fmt(t.shares * t.price, 0)}
                    </div>
                  </div>
                  <button onClick={() => deleteTrade(t.id)} className="p-2 text-red-500 active:scale-95">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {trades.length > 0 && (
            <div className="mt-4 p-4 bg-gradient-to-br from-slate-100 to-blue-50 rounded-xl">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-600">总持仓</div>
                  <div className="font-bold text-lg">{fmt(totalShares, 0)} 股</div>
                </div>
                <div>
                  <div className="text-xs text-slate-600">平均成本</div>
                  <div className="font-bold text-lg">${fmt(avgCost)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-600">已投入</div>
                  <div className="font-bold text-lg">${fmt(totalInvested, 0)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-600">当前市值</div>
                  <div className="font-bold text-lg">${fmt(currentValue, 0)}</div>
                </div>
              </div>
              <div className={`mt-3 p-3 rounded-lg ${totalPnl >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">浮动盈亏</span>
                  <div className="text-right">
                    <div className={`font-bold text-xl ${totalPnl >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {totalPnl >= 0 ? '+' : ''}${fmt(totalPnl, 0)}
                    </div>
                    <div className={`text-sm font-semibold ${totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {totalPnl >= 0 ? '+' : ''}{fmtPct(totalPnlPct)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 止盈触发 */}
        {totalShares > 0 && (
          <div className="bg-white rounded-2xl p-5 mb-4 shadow">
            <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-blue-600" />
              止盈触发线
            </h2>
            <div className="space-y-3">
              {computedExits.map(e => (
                <div key={e.id} className={`rounded-xl p-4 border-2 ${e.triggered ? 'border-green-500 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold">{e.name}</span>
                    {e.triggered ? (
                      <span className="px-2 py-0.5 bg-green-600 text-white text-xs rounded-full font-bold">
                        ✅ 可以止盈
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-slate-400 text-white text-xs rounded-full">
                        ⏳ 等待
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <div>
                      <label className="text-xs text-slate-600">触发收益 (%)</label>
                      <input
                        type="number"
                        step="5"
                        value={(e.gain * 100).toFixed(0)}
                        onChange={(ev) => setExitTargets(exitTargets.map(x => x.id === e.id ? { ...x, gain: (parseFloat(ev.target.value) || 0) / 100 } : x))}
                        className="w-full mt-1 px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-600">减仓比例 (%)</label>
                      <input
                        type="number"
                        step="5"
                        value={(e.sellRatio * 100).toFixed(0)}
                        onChange={(ev) => setExitTargets(exitTargets.map(x => x.id === e.id ? { ...x, sellRatio: (parseFloat(ev.target.value) || 0) / 100 } : x))}
                        className="w-full mt-1 px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="bg-white rounded-lg p-2">
                      <div className="text-xs text-slate-500">TQQQ 目标</div>
                      <div className="font-bold text-purple-700">${fmt(e.targetPrice)}</div>
                    </div>
                    <div className="bg-white rounded-lg p-2">
                      <div className="text-xs text-slate-500">减仓股数</div>
                      <div className="font-bold">{fmt(e.sellShares, 0)}</div>
                    </div>
                    <div className="bg-white rounded-lg p-2">
                      <div className="text-xs text-slate-500">套现金额</div>
                      <div className="font-bold text-green-700">${fmt(e.cashOut, 0)}</div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                <div className="font-bold mb-1">💡 剩余 20% 仓位:移动止盈</div>
                <div>不设固定目标价,从持仓最高点回撤 25% 时清仓,博更大涨幅。</div>
              </div>
            </div>
          </div>
        )}

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

        {/* 底部操作栏 */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3 shadow-lg" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          <div className="max-w-5xl mx-auto">
            {/* 拉取状态/错误提示 */}
            {fetchError && (
              <div className="mb-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-1">
                <WifiOff className="w-3 h-3" /> 拉取失败:{fetchError}
              </div>
            )}
            {lastFetched && !fetchError && (
              <div className="mb-2 px-3 py-1 text-xs text-slate-500 flex items-center gap-1">
                <Wifi className="w-3 h-3 text-green-600" /> 最近更新:{lastFetched.toLocaleTimeString('zh-CN', { hour12: false })}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={fetchRealtimePrices}
                disabled={fetching}
                className={`flex-[2] py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition ${fetching ? 'bg-slate-400' : 'bg-gradient-to-r from-blue-600 to-indigo-600'}`}
              >
                <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
                {fetching ? '拉取中…' : '拉取实时行情'}
              </button>
              <button
                onClick={saveState}
                className={`flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-1 active:scale-95 transition ${saved ? 'bg-green-600' : 'bg-slate-700'}`}
              >
                <Save className="w-4 h-4" />
                {saved ? '✓' : '保存'}
              </button>
              <button
                onClick={resetAll}
                className="px-3 py-3 rounded-xl font-bold text-slate-700 bg-slate-200 flex items-center justify-center active:scale-95"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
