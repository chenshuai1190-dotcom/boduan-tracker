import React from 'react';

const HOME_CURRENCY_STORAGE_KEY = 'xmoney_home_currency';
const HOME_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';

const emptySummary = {
  activePositions: [],
  positions: [],
  totalAssetsUsd: 0,
  totalAssetsCny: 0,
  todayPnl: 0,
  todayPnlPct: 0,
  cumulativePnl: 0,
  cumulativePnlPct: 0,
  holdingStockCount: 0,
  sellTradeCount: 0,
  usdRate: 7.2,
};

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(value, digits = 2) {
  return num(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtCurrency(value, currency = 'USD', digits = 2) {
  return `${currency === 'CNY' ? '¥' : '$'}${fmtMoney(value, digits)}`;
}

function fmtSignedCurrency(value, currency = 'USD', digits = 2) {
  const n = num(value);
  return `${n >= 0 ? '+' : '-'}${currency === 'CNY' ? '¥' : '$'}${fmtMoney(Math.abs(n), digits)}`;
}

function fmtSignedPct(value, digits = 2) {
  const n = num(value) * 100;
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function fmtMarketPct(value) {
  const n = num(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function pnlColor(value) {
  return num(value) >= 0 ? 'text-emerald-400' : 'text-rose-400';
}

function marketColor(value) {
  return num(value) >= 0 ? '#ef4444' : '#22c55e';
}

function cleanSignalText(value) {
  return String(value || '等待中').replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+ */u, '');
}

function dataDateLabel(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function Sparkline({ values = [], color = '#22c55e', className = 'h-9' }) {
  const series = values.filter((v) => Number.isFinite(Number(v))).map(Number);
  if (series.length < 2) {
    return <div className={`${className} flex items-center justify-center text-[10px] text-white/25`}>--</div>;
  }

  const width = 100;
  const height = 34;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const points = series.map((value, index) => {
    const x = (index / (series.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M ${points.join(' L ')}`;
  const fill = `${path} L ${width},${height} L 0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={`w-full ${className}`} preserveAspectRatio="none">
      <path d={fill} fill={color} opacity="0.16" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function MiniMarketCard({ item }) {
  if (item?.error) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 min-h-[122px]">
        <div className="text-[10px] font-semibold leading-tight text-white/80">{item.name || item.ticker}</div>
        <div className="mt-3 text-[11px] text-rose-300">拉取失败</div>
      </div>
    );
  }

  const color = marketColor(item?.changePercent);
  const ticker = item?.displaySymbol || item?.symbol || item?.ticker || '--';
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.045] p-2.5 min-h-[122px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="text-[10px] font-semibold leading-tight text-white/80">{item?.name || ticker}</div>
      <div className="mt-1 text-[11px] text-white/40">{ticker}</div>
      <div className="mt-2 whitespace-nowrap text-[15px] font-black leading-none tabular-nums" style={{ color, fontFamily: NUMBER_FONT }}>
        {fmtMoney(item?.price, 2)}
      </div>
      <div className="mt-1 text-[11px] font-bold tabular-nums" style={{ color, fontFamily: NUMBER_FONT }}>
        {fmtMarketPct(item?.changePercent)}
      </div>
      <Sparkline values={item?.intraday || []} color={color} />
    </div>
  );
}

function RadarVisual({ active }) {
  return (
    <div className="relative h-[62px] w-[62px] shrink-0 rounded-full border border-emerald-400/10 bg-emerald-400/[0.03]">
      <div className="absolute inset-2 rounded-full border border-emerald-400/10" />
      <div className="absolute inset-[13px] rounded-full border border-emerald-400/10" />
      <div className="absolute inset-[19px] rounded-full border border-emerald-400/10" />
      <div className="radar-sweep absolute inset-2 rounded-full" />
      <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
      <span className={`absolute right-2.5 top-2.5 h-3 w-3 rounded-full ${active ? 'bg-emerald-400' : 'bg-amber-400'} shadow-[0_0_12px_rgba(52,211,153,0.75)]`} />
    </div>
  );
}

function fgiLevel(value) {
  const v = num(value);
  if (v < 25) return { label: '极恐', color: '#f43f5e', desc: '市场极度恐慌' };
  if (v < 45) return { label: '恐惧', color: '#fb7185', desc: '市场偏恐惧, 谨慎布局' };
  if (v < 55) return { label: '中性', color: '#94a3b8', desc: '市场情绪中性' };
  if (v < 75) return { label: '贪婪', color: '#22c55e', desc: '市场偏热, 控制追高' };
  return { label: '极贪', color: '#16a34a', desc: '高风险区, 减仓为主' };
}

function FgiGauge({ value }) {
  const v = Math.max(0, Math.min(100, num(value)));
  const angle = -90 + (v / 100) * 180;
  const level = fgiLevel(v);
  return (
    <svg viewBox="0 0 160 90" className="h-[76px] w-full">
      <path d="M 20 78 A 60 60 0 0 1 140 78" fill="none" stroke="#f97316" strokeWidth="13" strokeLinecap="round" />
      <path d="M 45 28 A 48 48 0 0 1 115 28" fill="none" stroke="#22c55e" strokeWidth="13" strokeLinecap="round" />
      <path d="M 80 78 L 80 26" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" style={{ transformOrigin: '80px 78px', transform: `rotate(${angle}deg)` }} />
      <circle cx="80" cy="78" r="5" fill="#d1d5db" />
      <text x="20" y="88" fill="#7f8794" fontSize="9">0</text>
      <text x="76" y="20" fill="#7f8794" fontSize="9">50</text>
      <text x="133" y="88" fill="#7f8794" fontSize="9">100</text>
      <text x="80" y="70" textAnchor="middle" fill={level.color} fontSize="18" fontWeight="900">{Math.round(v)}</text>
    </svg>
  );
}

export default function HomeTab({ ctx }) {
  const {
    addStock,
    benchmarkDrawdown,
    benchmarkMenuOpen,
    benchmarkOptions,
    benchmarkStatus,
    benchmarkStock,
    benchmarkSymbol,
    CheckCircle2,
    ChevronRight,
    fetchRealtimePrices,
    fetching,
    fgi,
    fgiDataDate,
    fmtPct,
    indices,
    investmentSummary,
    newStock,
    RefreshCw,
    removeStock,
    setBenchmarkMenuOpen,
    setBenchmarkSymbol,
    setEditingStock,
    setNewStock,
    setShowAddStock,
    showAddStock,
    editingStock,
    updateStockPrice,
    vix,
    vixDataDate,
    vixSignal,
    watchlist,
  } = ctx;

  const [tableTab, setTableTab] = React.useState('watchlist');
  const [showAllRows, setShowAllRows] = React.useState(false);
  const [currencyMode, setCurrencyMode] = React.useState(() => {
    try {
      return localStorage.getItem(HOME_CURRENCY_STORAGE_KEY) === 'CNY' ? 'CNY' : 'USD';
    } catch {
      return 'USD';
    }
  });
  const summary = investmentSummary || emptySummary;
  const positions = summary.activePositions || [];
  const positionsBySymbol = React.useMemo(() => new Map(positions.map((p) => [p.symbol, p])), [positions]);
  const fgiInfo = fgiLevel(fgi);
  const marketCards = (indices || []).slice(0, 4);
  const signalIsCalm = num(benchmarkDrawdown) > -0.05;
  const isCnyMode = currencyMode === 'CNY';
  const displayCurrency = isCnyMode ? 'CNY' : 'USD';
  const displayCurrencyLabel = isCnyMode ? 'RMB' : 'USD';
  const displayRate = isCnyMode ? summary.usdRate : 1;
  const displayAssets = isCnyMode ? summary.totalAssetsCny : summary.totalAssetsUsd;
  const displayTodayPnl = summary.todayPnl * displayRate;
  const displayCumulativePnl = summary.cumulativePnl * displayRate;
  const pnlAmountClass = isCnyMode ? 'text-[13px]' : 'text-[15px]';

  React.useEffect(() => {
    try {
      localStorage.setItem(HOME_CURRENCY_STORAGE_KEY, currencyMode);
    } catch {}
  }, [currencyMode]);

  React.useEffect(() => {
    setShowAllRows(false);
  }, [tableTab]);

  const resetNewStock = () => setNewStock({ symbol: '', name: '', price: '', high: '', cost: '0', shares: '0' });

  const allRows = tableTab === 'positions' ? positions : (watchlist || []);
  const rows = showAllRows ? allRows : allRows.slice(0, 3);

  return (
    <div className="mx-auto max-w-[430px] pb-2 text-white" style={{ fontFamily: HOME_FONT }}>
      <style>{`
        @keyframes radarSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .radar-sweep {
          background: conic-gradient(from 0deg, rgba(34,197,94,0.42), rgba(34,197,94,0.06) 52deg, transparent 96deg);
          animation: radarSpin 4.8s linear infinite;
          opacity: 0.9;
        }
      `}</style>

      <section className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-semibold text-white/70">总资产 ({displayCurrencyLabel}) <span className="ml-1 text-white/50">◎</span></div>
          <div className="flex items-center gap-1.5">
            <div className="flex rounded-full border border-white/10 bg-black/20 p-0.5">
              {['USD', 'CNY'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCurrencyMode(mode)}
                  className={`h-7 rounded-full px-2.5 text-[11px] font-bold active:scale-95 ${currencyMode === mode ? 'bg-[#f6b54b] text-[#101318]' : 'text-white/45'}`}
                >
                  {mode === 'CNY' ? 'RMB' : 'USD'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={fetchRealtimePrices}
              disabled={fetching}
              className="flex h-8 items-center gap-1 rounded-full border border-white/10 px-2.5 text-[11px] font-bold text-emerald-300 active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${fetching ? 'animate-spin' : ''}`} />
              LIVE
            </button>
          </div>
        </div>

        <div className="mt-3 text-[34px] font-extrabold leading-none tracking-normal text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
          {fmtCurrency(displayAssets, displayCurrency, 2)}
        </div>
        <div className="mt-6 grid grid-cols-[1fr_1.12fr_0.96fr] divide-x divide-white/10">
          <div className="min-w-0 pr-3">
            <div className="text-[12px] text-white/50">今日盈亏</div>
            <div className={`mt-2 whitespace-nowrap ${pnlAmountClass} font-extrabold leading-tight tabular-nums ${pnlColor(summary.todayPnl)}`} style={{ fontFamily: NUMBER_FONT }}>
              {fmtSignedCurrency(displayTodayPnl, displayCurrency, 2)}
            </div>
            <div className={`mt-1 text-[12px] font-bold tabular-nums ${pnlColor(summary.todayPnl)}`} style={{ fontFamily: NUMBER_FONT }}>
              {fmtSignedPct(summary.todayPnlPct, 2)}
            </div>
          </div>
          <div className="min-w-0 px-3">
            <div className="text-[12px] text-white/50">累计盈亏</div>
            <div className={`mt-2 whitespace-nowrap ${pnlAmountClass} font-extrabold leading-tight tabular-nums ${pnlColor(summary.cumulativePnl)}`} style={{ fontFamily: NUMBER_FONT }}>
              {fmtSignedCurrency(displayCumulativePnl, displayCurrency, 2)}
            </div>
            <div className={`mt-1 text-[12px] font-bold tabular-nums ${pnlColor(summary.cumulativePnl)}`} style={{ fontFamily: NUMBER_FONT }}>
              {fmtSignedPct(summary.cumulativePnlPct, 2)}
            </div>
          </div>
          <div className="min-w-0 pl-3">
            <div className="text-[12px] text-white/50">持仓数量</div>
            <div className="mt-3 whitespace-nowrap text-[15px] font-black leading-tight text-white/90">
              {summary.holdingStockCount}只 · {summary.sellTradeCount}笔
            </div>
          </div>
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-white/10 bg-[#0b0f14] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[12px] font-semibold text-white/70">当前信号</div>
          <button
            type="button"
            onClick={() => setBenchmarkMenuOpen(!benchmarkMenuOpen)}
            className="relative rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white/50 active:scale-95"
          >
            策略状态
          </button>
        </div>
        <div className="grid grid-cols-[62px_minmax(0,1fr)_70px] items-center gap-3">
          <RadarVisual active={signalIsCalm} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <div className="truncate text-base font-black text-white">{cleanSignalText(benchmarkStatus?.text)}</div>
              <span className={`h-3 w-3 shrink-0 rounded-full ${signalIsCalm ? 'bg-emerald-400' : 'bg-amber-400'} shadow-[0_0_12px_rgba(52,211,153,0.75)]`} />
            </div>
            <div className="mt-1.5 text-[11px] text-white/50">{benchmarkStatus?.desc || '回撤<5%, 空仓等待'}</div>
            <div className="mt-2.5 truncate text-[11px] text-white/40">耐心等待更高胜率机会</div>
          </div>
          <div className="relative text-right">
            <button
              type="button"
              onClick={() => setBenchmarkMenuOpen(!benchmarkMenuOpen)}
              className={`text-[19px] font-black leading-none tabular-nums ${num(benchmarkDrawdown) <= -0.1 ? 'text-rose-400' : 'text-emerald-400'}`}
              style={{ fontFamily: NUMBER_FONT }}
            >
              {fmtPct ? fmtPct(benchmarkDrawdown) : fmtSignedPct(benchmarkDrawdown, 1)}
            </button>
            <div className="mt-1.5 text-[10px] text-white/50">{benchmarkStock?.symbol || benchmarkSymbol || 'QQQ'} 回撤</div>
            {benchmarkMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setBenchmarkMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#111820] text-left shadow-2xl">
                  <div className="border-b border-white/10 px-3 py-2 text-[11px] font-bold text-white/40">切换基准</div>
                  {(benchmarkOptions || []).map((item) => {
                    const active = item.symbol === benchmarkSymbol;
                    return (
                      <button
                        key={item.symbol}
                        type="button"
                        onClick={() => {
                          setBenchmarkSymbol(item.symbol);
                          setBenchmarkMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2.5 text-sm ${active ? 'bg-emerald-400/10 text-emerald-200' : 'text-white/70'}`}
                      >
                        <span>
                          <span className="block font-black">{item.symbol}</span>
                          <span className="block truncate text-[11px] text-white/40">{item.name}</span>
                        </span>
                        {active && <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
        {benchmarkStock && (
          <div className="mt-2.5 flex justify-end whitespace-nowrap text-[10px] text-white/40 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
            ${fmtMoney(benchmarkStock.price, 2)} / 52周高 ${fmtMoney(benchmarkStock.high, 2)}
            <ChevronRight className="ml-1 inline h-3.5 w-3.5 align-[-2px] text-white/25" />
          </div>
        )}
      </section>

      {marketCards.length > 0 && (
      <section className="mt-3 grid grid-cols-4 gap-2">
        {marketCards.map((item) => <MiniMarketCard key={item?.ticker || item?.displaySymbol || item?.name} item={item} />)}
      </section>
      )}

      <section className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-300/90">
            VIX 恐慌指数
            {dataDateLabel(vixDataDate) && <span className="text-[10px] text-white/40">{dataDateLabel(vixDataDate)} 收盘</span>}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="text-2xl font-black text-emerald-400 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{fmtMoney(vix, 1)}</span>
            <span className="h-4 w-4 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.8)]" />
          </div>
          <div className="mt-3 text-[12px] text-white/50">{vixSignal?.desc || '市场平静, 无操作'}</div>
          <div className="mt-5 h-2 rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-500">
            <div className="relative h-2">
              <span
                className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-400 shadow"
                style={{ left: `${Math.max(0, Math.min(100, (num(vix) / 50) * 100))}%`, transform: 'translate(-50%, -50%)' }}
              />
            </div>
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-white/40"><span>0</span><span>20</span><span>30</span><span>50</span></div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-white/60">
            CNN 恐慌贪婪指数
            {dataDateLabel(fgiDataDate) && <span className="text-[10px] text-white/40">{dataDateLabel(fgiDataDate)}</span>}
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-black tabular-nums" style={{ color: fgiInfo.color, fontFamily: NUMBER_FONT }}>{Math.round(num(fgi))}</span>
            <span className="text-sm font-black" style={{ color: fgiInfo.color }}>{fgiInfo.label}</span>
          </div>
          <div className="mt-3 text-[12px] text-white/50">{fgiInfo.desc}</div>
          <div className="mt-1">
            <FgiGauge value={fgi} />
          </div>
        </div>
      </section>

      <section className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setTableTab('watchlist')}
              className={`text-[14px] font-bold leading-none ${tableTab === 'watchlist' ? 'text-white' : 'text-white/38'}`}
            >
              自选
            </button>
            <button
              type="button"
              onClick={() => setTableTab('positions')}
              className={`text-[14px] font-bold leading-none ${tableTab === 'positions' ? 'text-white' : 'text-white/38'}`}
            >
              持仓
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowAllRows((value) => !value)}
            disabled={allRows.length <= 3}
            className="flex items-center gap-0.5 rounded-full py-1 pl-2 text-[12px] font-semibold leading-none text-white/42 active:scale-95 disabled:opacity-70"
          >
            {showAllRows ? '收起' : '查看全部'} <ChevronRight className={`h-3.5 w-3.5 ${showAllRows ? '-rotate-90' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-[minmax(104px,1.34fr)_0.76fr_0.82fr_0.9fr_14px] items-center px-4 pb-1.5 pt-2 text-[11px] font-medium leading-none text-white/36">
          <span>名称</span>
          <span className="text-right">价格</span>
          <span className="text-right">涨跌幅</span>
          <span className="text-right">持仓盈亏</span>
          <span aria-hidden="true" />
        </div>

        <div className="divide-y divide-white/[0.06]">
          {rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-white/38">
              {tableTab === 'positions' ? '暂无持仓记录, 先在交易页添加买入记录。' : '暂无自选股票。'}
            </div>
          ) : rows.map((row) => {
            const isPosition = tableTab === 'positions';
            const symbol = row.symbol;
            const quote = isPosition ? (watchlist || []).find((item) => item.symbol === symbol) : row;
            const position = isPosition ? row : positionsBySymbol.get(symbol);
            const price = isPosition ? row.currentPrice : row.price;
            const changePct = isPosition ? row.changePercent : row.changePercent;
            const pnlValue = position ? position.totalPnl : null;
            const pnlPct = position ? position.totalPnlPct : null;
            const color = marketColor(changePct);
            const logoText = String(symbol || '?').slice(0, 1);

            return (
              <div key={symbol}>
                <button
                  type="button"
                  onClick={() => setEditingStock(editingStock === symbol ? null : symbol)}
                  className="grid min-h-[43px] w-full grid-cols-[minmax(104px,1.34fr)_0.76fr_0.82fr_0.9fr_14px] items-center px-4 py-1.5 text-left active:bg-white/[0.03]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-[12px] font-black leading-none text-slate-950">{logoText}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold leading-[14px] text-white">{symbol}</span>
                      <span className="block truncate text-[10px] leading-[12px] text-white/40">{row.name || quote?.name || symbol}</span>
                    </span>
                  </span>
                  <span className="text-right text-[13px] tabular-nums text-white/78" style={{ fontFamily: NUMBER_FONT }}>{fmtMoney(price, 2)}</span>
                  <span className="text-right text-[13px] font-medium tabular-nums" style={{ color, fontFamily: NUMBER_FONT }}>{fmtMarketPct(changePct)}</span>
                  <span className={`text-right text-[13px] font-medium tabular-nums ${pnlValue === null ? 'text-white/25' : pnlColor(pnlValue)}`} style={{ fontFamily: NUMBER_FONT }}>
                    {pnlValue === null ? '--' : fmtSignedPct(pnlPct, 2)}
                  </span>
                  <ChevronRight className="ml-auto h-3.5 w-3.5 text-white/22" />
                </button>

                {!isPosition && editingStock === symbol && (
                  <div className="border-t border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[11px] font-bold text-white/40">
                        价格
                        <input
                          type="number"
                          value={row.price || ''}
                          onChange={(event) => updateStockPrice(symbol, 'price', event.target.value)}
                          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                        />
                      </label>
                      <label className="text-[11px] font-bold text-white/40">
                        52周高
                        <input
                          type="number"
                          value={row.high || ''}
                          onChange={(event) => updateStockPrice(symbol, 'high', event.target.value)}
                          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                        />
                      </label>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => setEditingStock(null)} className="flex-1 rounded-lg bg-white/10 py-2 text-sm font-bold text-white/60 active:scale-95">完成</button>
                      <button type="button" onClick={() => removeStock(symbol)} className="flex-1 rounded-lg bg-rose-500/15 py-2 text-sm font-bold text-rose-300 active:scale-95">删除</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {showAddStock && tableTab === 'watchlist' && (
          <div className="border-t border-white/10 bg-white/[0.03] p-4">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={newStock.symbol}
                onChange={(event) => setNewStock({ ...newStock, symbol: event.target.value.toUpperCase() })}
                placeholder="代码"
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400"
              />
              <input
                value={newStock.name}
                onChange={(event) => setNewStock({ ...newStock, name: event.target.value })}
                placeholder="名称"
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400"
              />
              <input
                type="number"
                value={newStock.price}
                onChange={(event) => setNewStock({ ...newStock, price: event.target.value })}
                placeholder="当前价"
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400"
              />
              <input
                type="number"
                value={newStock.high}
                onChange={(event) => setNewStock({ ...newStock, high: event.target.value })}
                placeholder="52周高"
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400"
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddStock(false);
                  resetNewStock();
                }}
                className="flex-1 rounded-lg bg-white/10 py-2.5 text-sm font-bold text-white/60 active:scale-95"
              >
                取消
              </button>
              <button
                type="button"
                onClick={addStock}
                className="flex-1 rounded-lg bg-emerald-400 py-2.5 text-sm font-black text-slate-950 active:scale-95"
              >
                保存
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
