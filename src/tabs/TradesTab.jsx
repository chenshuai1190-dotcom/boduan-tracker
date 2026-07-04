import React from 'react';
import { BookOpen, Calculator, Edit3, Grid2X2, Hexagon, Settings2, Trash2 } from 'lucide-react';
import {
  MARKET_COLOR_MODES,
  marketStrongTextClass,
  marketTextClass,
} from '../lib/marketColorMode.js';

const TRADE_CURRENCY_STORAGE_KEY = 'xmoney_trade_currency';
const TRADE_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const TRADE_NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmtAmount(value, digits = 2) {
  return toNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signedCurrency(value, currency = 'USD', digits = 2) {
  const n = toNumber(value);
  const prefix = currency === 'CNY' ? '¥' : '$';
  return `${n >= 0 ? '+' : '-'}${prefix}${fmtAmount(Math.abs(n), digits)}`;
}

function currencyAmount(value, currency = 'USD', digits = 2) {
  return `${currency === 'CNY' ? '¥' : '$'}${fmtAmount(value, digits)}`;
}

function signedPct(value, digits = 2) {
  const n = toNumber(value) * 100;
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function pnlClass(value, mode) {
  return marketTextClass(value, mode);
}

function strongPnlClass(value, mode) {
  return marketStrongTextClass(value, mode);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function TradesTab({ ctx }) {
  const {
    addTrade,
    AlertCircle,
    calcCostBasis,
    calmRoomActiveCount,
    calmRoomAvgActiveDays,
    calmRoomCompletedCount,
    CheckCircle2,
    costBasisActiveSymbol,
    costBasisData,
    db,
    deleteStockTradeRecord,
    editingNoteId,
    expandedTrades,
    expandedWaves,
    fetching,
    fetchRealtimePrices,
    fmt,
    investmentSummary,
    lookupStatus,
    marketColorMode,
    newTrade,
    Plus,
    RefreshCw,
    setAllTradesModal,
    setCostBasisActiveSymbol,
    setCostBasisData,
    setCostBasisNewSymbol,
    setCostBasisNewTrade,
    setEditingNoteId,
    setExpandedTrades,
    setExpandedWaves,
    setLookupStatus,
    setMarketColorMode,
    setNewTrade,
    setShowAddTrade,
    setShowCostBasisAdd,
    setShowCostBasisTrade,
    setTradeEntryScope,
    setTradeDeleteConfirmId,
    setWaveNotes,
    showAddTrade,
    showConfirm,
    stockTrades,
    tradeEntryScope,
    tradeSubmitting,
    trades,
    usdRate,
    watchlist,
    waveNotes,
    wavesByStock,
  } = ctx;

  const [currencyMode, setCurrencyMode] = React.useState(() => {
    try {
      return localStorage.getItem(TRADE_CURRENCY_STORAGE_KEY) === 'USD' ? 'USD' : 'CNY';
    } catch {
      return 'CNY';
    }
  });
  const [mainView, setMainView] = React.useState('positions');
  const [toolPanel, setToolPanel] = React.useState('');
  const [colorMenuOpen, setColorMenuOpen] = React.useState(false);
  const [orderActionTrade, setOrderActionTrade] = React.useState(null);
  const orderActionOpen = !!orderActionTrade;

  React.useEffect(() => {
    try {
      localStorage.setItem(TRADE_CURRENCY_STORAGE_KEY, currencyMode);
    } catch {}
  }, [currencyMode]);

  React.useEffect(() => {
    if ((!showAddTrade && !orderActionOpen) || typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    const scrollY = window.scrollY || window.pageYOffset || 0;
    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    const previous = {
      bodyOverflow: bodyStyle.overflow,
      bodyPosition: bodyStyle.position,
      bodyTop: bodyStyle.top,
      bodyWidth: bodyStyle.width,
      htmlOverscrollBehavior: htmlStyle.overscrollBehavior,
    };

    bodyStyle.overflow = 'hidden';
    bodyStyle.position = 'fixed';
    bodyStyle.top = `-${scrollY}px`;
    bodyStyle.width = '100%';
    htmlStyle.overscrollBehavior = 'none';

    return () => {
      bodyStyle.overflow = previous.bodyOverflow;
      bodyStyle.position = previous.bodyPosition;
      bodyStyle.top = previous.bodyTop;
      bodyStyle.width = previous.bodyWidth;
      htmlStyle.overscrollBehavior = previous.htmlOverscrollBehavior;
      window.scrollTo(0, scrollY);
    };
  }, [showAddTrade, orderActionOpen]);

  const summary = investmentSummary || {};
  const positions = summary.activePositions || [];
  const rate = toNumber(summary.usdRate || usdRate) || 7.2;
  const displayCurrency = currencyMode === 'CNY' ? 'CNY' : 'USD';
  const displayCurrencyLabel = currencyMode === 'CNY' ? 'RMB' : 'USD';
  const displayRate = currencyMode === 'CNY' ? rate : 1;
  const pnlAmountClass = 'text-[13px]';
  const tradeModalInputStyle = { colorScheme: 'dark' };
  const tradeModalBaseInput = 'block w-full max-w-full min-w-0 box-border rounded-lg border border-transparent bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:bg-white/[0.085]';
  const tradeModalLabelClass = 'mb-1 block text-[10px] font-normal text-white/45';
  const displayAssets = toNumber(summary.totalAssetsUsd) * displayRate;
  const displayTodayPnl = toNumber(summary.todayPnl) * displayRate;
  const displayCumulativePnl = toNumber(summary.cumulativePnl) * displayRate;
  const displayHoldingPnl = toNumber(summary.unrealizedPnl) * displayRate;
  const todayKey = localDateKey();
  const todayTrades = (stockTrades || []).filter((trade) => trade.date === todayKey);
  const todayBuys = todayTrades.filter((trade) => trade.side !== 'sell').length;
  const todaySells = todayTrades.filter((trade) => trade.side === 'sell').length;
  const showWaveTool = toolPanel === 'waves';
  const showCostTool = toolPanel === 'cost';
  const showStockTool = toolPanel === 'settings';
  const showMainLedger = !showWaveTool && !showCostTool;
  const positionsMarketValue = toNumber(summary.positionsMarketValue);
  const colorModeOptions = [
    { id: MARKET_COLOR_MODES.GREEN_UP_RED_DOWN, label: '绿涨红跌', upClass: 'bg-emerald-400', downClass: 'bg-rose-400' },
    { id: MARKET_COLOR_MODES.RED_UP_GREEN_DOWN, label: '绿跌红涨', upClass: 'bg-rose-400', downClass: 'bg-emerald-400' },
  ];

  const openTradeModal = (position = null, side = 'buy') => {
    setTradeEntryScope('ledger');
    setNewTrade({
      symbol: position?.symbol || '',
      name: position?.name || '',
      side,
      date: localDateKey(),
      price: position?.currentPrice ? String(position.currentPrice) : '',
      shares: '',
      batch: '第1批',
    });
    setLookupStatus(position?.symbol ? 'found' : null);
    setShowAddTrade(true);
  };

  const openTradeEditModal = (trade) => {
    setTradeEntryScope('ledger');
    setNewTrade({
      id: trade.id,
      symbol: trade.symbol || '',
      name: trade.name || '',
      side: trade.side === 'sell' ? 'sell' : 'buy',
      date: trade.date || localDateKey(),
      price: trade.price ? String(trade.price) : '',
      shares: trade.shares ? String(trade.shares) : '',
      fee: trade.fee || 0,
      currency: trade.currency || 'USD',
      note: trade.note || '',
      batch: '第1批',
    });
    setLookupStatus(trade.symbol ? 'found' : null);
    setShowAddTrade(true);
  };

  const openWaveTradeModal = (symbol = '', name = '') => {
    setTradeEntryScope('wave');
    setNewTrade({
      symbol,
      name,
      side: 'buy',
      date: localDateKey(),
      price: '',
      shares: '',
      batch: '第1批',
    });
    setLookupStatus(symbol ? 'found' : null);
    setShowAddTrade(true);
  };

  const confirmDeleteTodayTrade = (trade) => {
    showConfirm({
      title: '删除这笔订单?',
      desc: '删除后会同步云端账本,持仓和盈亏会重新计算。',
      info: `${trade.symbol || '--'} · ${trade.side === 'sell' ? '卖出' : '买入'} ${fmtAmount(trade.shares, 0)} 股`,
      confirmText: '删除',
      icon: '🗑',
      onConfirm: async () => {
        await deleteStockTradeRecord(trade.id);
      },
    });
  };

  const editOrderFromAction = () => {
    if (!orderActionTrade) return;
    const trade = orderActionTrade;
    setOrderActionTrade(null);
    openTradeEditModal(trade);
  };

  const deleteOrderFromAction = () => {
    if (!orderActionTrade) return;
    const trade = orderActionTrade;
    setOrderActionTrade(null);
    confirmDeleteTodayTrade(trade);
  };

  const showTradeFormNotice = (title, desc, info = null) => {
    showConfirm({
      title,
      desc,
      info,
      confirmText: '关闭',
      confirmStyle: 'primary',
      icon: '!',
      showCancel: false,
    });
  };

  const confirmTradeSubmit = () => {
    if (tradeSubmitting) return;
    if (!newTrade.symbol || !newTrade.price || !newTrade.shares) {
      showTradeFormNotice(
        '请填写完整信息',
        '股票代码、价格和股数都是必填项。',
        `${newTrade.symbol || '--'} · ${newTrade.price || '--'} · ${newTrade.shares || '--'}`
      );
      return;
    }
    const symbol = String(newTrade.symbol || '').trim().toUpperCase();
    const sideLabel = newTrade.side === 'sell' ? '卖出' : '买入';
    const shares = Number(newTrade.shares) || 0;
    const price = Number(newTrade.price) || 0;
    if (shares <= 0 || price <= 0) {
      showTradeFormNotice(
        '价格和股数需要大于 0',
        '请检查输入后再提交。',
        `${symbol || '--'} · ${fmtAmount(shares, 0)} 股 @ ${price > 0 ? price.toFixed(2) : '--'}`
      );
      return;
    }
    const isWaveEntry = tradeEntryScope === 'wave';
    showConfirm({
      title: isWaveEntry
        ? '确认保存到波段记录?'
        : (newTrade.id || newTrade.editingId ? '确认修改正式交易?' : '确认保存正式交易?'),
      desc: isWaveEntry
        ? '这笔记录只会进入波段记录独立账本,不会进入正式持仓、当日订单或总资产计算。'
        : '这笔记录会同步正式主交易账本,并影响持仓、当日订单和盈亏。',
      info: `${symbol || '--'} · ${sideLabel} ${fmtAmount(shares, 0)} 股 @ ${price > 0 ? price.toFixed(2) : '--'} · ${newTrade.date || '--'}`,
      confirmText: '确认保存',
      confirmStyle: 'primary',
      icon: '✅',
      onConfirm: async () => {
        await addTrade();
      },
    });
  };

  const toggleToolPanel = (panel) => {
    setColorMenuOpen(false);
    setToolPanel((current) => (current === panel ? '' : panel));
  };

  return (
    <>
      <div className="mx-auto max-w-[430px] pb-2 text-white" style={{ fontFamily: TRADE_FONT }}>
        <section className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-normal text-white/70">总资产 ({displayCurrencyLabel}) <span className="ml-1 text-white/50">◎</span></div>
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-full border border-white/10 bg-black/20 p-0.5">
                {['USD', 'CNY'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setCurrencyMode(mode)}
                    className={`h-7 rounded-full px-2.5 text-[11px] font-normal active:scale-95 ${currencyMode === mode ? 'bg-[#f6b54b] text-[#101318]' : 'text-white/45'}`}
                  >
                    {mode === 'CNY' ? 'RMB' : 'USD'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={fetchRealtimePrices}
                disabled={fetching}
                className="flex h-8 items-center gap-1 rounded-full border border-white/10 px-2.5 text-[11px] font-normal text-emerald-300 active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${fetching ? 'animate-spin' : ''}`} />
                LIVE
              </button>
            </div>
          </div>

          <div className="mt-3 text-[34px] font-normal leading-none tracking-normal text-[#ffd18a] tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>
            {currencyAmount(displayAssets, displayCurrency, 2)}
          </div>

          <div className="mt-6 grid grid-cols-[1fr_1.12fr_0.96fr] divide-x divide-white/10">
            <div className="min-w-0 pr-3">
              <div className="text-[12px] text-white/50">今日盈亏</div>
              <div className={`mt-2 whitespace-nowrap ${pnlAmountClass} font-normal leading-tight tabular-nums ${pnlClass(displayTodayPnl, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                {signedCurrency(displayTodayPnl, displayCurrency, 2)}
              </div>
              <div className={`mt-1 text-[12px] font-normal tabular-nums ${pnlClass(displayTodayPnl, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                {signedPct(summary.todayPnlPct, 2)}
              </div>
            </div>
            <div className="min-w-0 px-3">
              <div className="text-[12px] text-white/50">累计盈亏</div>
              <div className={`mt-2 whitespace-nowrap ${pnlAmountClass} font-normal leading-tight tabular-nums ${pnlClass(displayCumulativePnl, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                {signedCurrency(displayCumulativePnl, displayCurrency, 2)}
              </div>
              <div className={`mt-1 text-[12px] font-normal tabular-nums ${pnlClass(displayCumulativePnl, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                {signedPct(summary.cumulativePnlPct, 2)}
              </div>
            </div>
            <div className="min-w-0 pl-3">
              <div className="text-[12px] text-white/50">持仓数量</div>
              <div className="mt-3 whitespace-nowrap text-[15px] font-normal leading-tight text-white/90">
                {summary.holdingStockCount || 0}只 · {summary.sellTradeCount || 0}笔
              </div>
            </div>
          </div>
        </section>

        <section className="mt-3 grid grid-cols-4 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          {[
            { id: 'waves', label: '波段记录', icon: BookOpen },
            { id: 'cost', label: '摊薄工具', icon: Calculator },
            { id: 'settings', label: '股票设置', icon: Hexagon },
            { id: 'all', label: '全部功能', icon: Grid2X2, disabled: true },
          ].map((item, index) => {
            const Icon = item.icon;
            const active = !item.disabled && toolPanel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (!item.disabled) toggleToolPanel(item.id);
                }}
                disabled={item.disabled}
                className={`flex min-h-[86px] flex-col items-center justify-center gap-2 ${item.disabled ? 'cursor-default opacity-35' : 'active:bg-white/[0.04]'} ${index > 0 ? 'border-l border-white/10' : ''}`}
              >
                <Icon className={`h-6 w-6 ${active ? 'text-[#f6b54b]' : 'text-white/70'}`} strokeWidth={1.8} />
                <span className={`text-[12px] font-normal ${active ? 'text-[#f6b54b]' : 'text-white/70'}`}>{item.label}</span>
              </button>
            );
          })}
        </section>

        {showStockTool && (
          <section className="mt-3 rounded-2xl border border-white/10 bg-[#0b0f14] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[14px] font-black text-white">股票设置</div>
                <div className="mt-1 text-[11px] text-white/40">这里的操作写入主交易账本</div>
              </div>
              <button
                type="button"
                onClick={() => openTradeModal(null, 'buy')}
                className="rounded-full border border-[#f6b54b]/40 px-3 py-1.5 text-[12px] font-normal text-[#f6b54b] active:scale-95"
              >
                新增交易
              </button>
            </div>
            <div className="space-y-2">
              {positions.length === 0 ? (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-4 text-center text-[12px] text-white/40">还没有持仓, 先新增一笔买入。</div>
              ) : positions.map((position) => (
                <div key={position.symbol} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-normal leading-none text-white">{position.symbol}</div>
                    <div className="mt-1 truncate text-[10px] leading-none text-white/36">{position.name}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => openTradeModal(position, 'buy')} className="rounded-full bg-rose-400/12 px-3 py-1.5 text-[11px] font-normal text-rose-400 active:scale-95">买入</button>
                    <button type="button" onClick={() => openTradeModal(position, 'sell')} className="rounded-full bg-emerald-400/12 px-3 py-1.5 text-[11px] font-normal text-emerald-400 active:scale-95">卖出</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {showMainLedger && (
        <section className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-5">
              <button type="button" onClick={() => setMainView('positions')} className={`text-[14px] font-normal leading-none ${mainView === 'positions' ? 'text-[#ffd18a]' : 'text-white/40'}`}>持仓分布</button>
              <button type="button" onClick={() => setMainView('orders')} className={`text-[14px] font-normal leading-none ${mainView === 'orders' ? 'text-[#ffd18a]' : 'text-white/40'}`}>当日订单 ({todayBuys}/{todaySells})</button>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setColorMenuOpen((value) => !value)}
                className="text-white/55 active:scale-95"
                aria-label="股票涨跌颜色设置"
              >
              <Settings2 className="h-5 w-5" strokeWidth={1.8} />
              </button>
              {colorMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setColorMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-2 w-40 overflow-hidden rounded-xl border border-white/10 bg-[#111820] p-1.5 shadow-2xl">
                    {colorModeOptions.map((option) => {
                      const active = marketColorMode === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setMarketColorMode(option.id);
                            setColorMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px] font-normal ${active ? 'bg-[#f6b54b] text-[#101318]' : 'text-white/66 active:bg-white/[0.05]'}`}
                        >
                          <span>{option.label}</span>
                          <span className="flex items-center gap-1">
                            <span className={`h-2.5 w-2.5 rounded-full ${option.upClass}`} />
                            <span className={`h-2.5 w-2.5 rounded-full ${option.downClass}`} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {mainView === 'positions' ? (
            <div className="px-2 py-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[16px] font-normal text-white">
                    <span>🇺🇸</span>
                    <span>美股</span>
                    <span className="text-white/76 tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{currencyAmount(toNumber(summary.positionsMarketValue) * displayRate, displayCurrency, 2)}</span>
                  </div>
                </div>
                <button type="button" onClick={() => setToolPanel(toolPanel ? '' : 'settings')} className="text-white/45 active:scale-95">⌃</button>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[11px] text-white/40">持仓市值</div>
                  <div className="mt-1 text-[13px] font-normal text-white tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{currencyAmount(toNumber(summary.positionsMarketValue) * displayRate, displayCurrency, 2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-[11px] text-white/40">持仓盈亏</div>
                  <div className={`mt-1 text-[13px] font-normal tabular-nums ${pnlClass(displayHoldingPnl, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>{signedCurrency(displayHoldingPnl, displayCurrency, 2)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-white/40">当日盈亏</div>
                  <div className={`mt-1 text-[13px] font-normal tabular-nums ${pnlClass(displayTodayPnl, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>{signedCurrency(displayTodayPnl, displayCurrency, 2)}</div>
                </div>
              </div>

              {positions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
                  <div className="text-[13px] font-normal text-white/60">还没有持仓</div>
                  <button type="button" onClick={() => openTradeModal(null, 'buy')} className="mt-3 rounded-full border border-[#f6b54b]/45 px-4 py-2 text-[12px] font-normal text-[#f6b54b] active:scale-95">记录第一笔买入</button>
                </div>
              ) : (
                <div className="grid grid-cols-[minmax(100px,0.72fr)_minmax(0,3.35fr)] border-t border-white/[0.06]">
                  <div>
                    <div className="px-0 pb-2 pt-3 text-[11px] font-medium leading-none text-white/36">名称/代码</div>
                    <div className="divide-y divide-white/[0.06]">
                      {positions.map((position) => (
                        <button
                          key={position.symbol}
                          type="button"
                          onClick={() => openTradeModal(position, 'sell')}
                          className="flex min-h-[60px] w-full min-w-0 flex-col justify-center py-3 pr-1.5 text-left active:bg-white/[0.03]"
                        >
                          <span className="block truncate text-[13px] font-normal leading-[15px] text-white">{position.name || position.symbol}</span>
                          <span className="mt-1 block truncate text-[11px] leading-[13px] text-white/40">{position.symbol}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-x-auto [scrollbar-width:none]">
                    <div className="min-w-[500px]">
                      <div className="grid grid-cols-[80px_76px_118px_144px_66px] gap-1 px-0 pb-2 pt-3 text-[11px] font-medium leading-none text-white/36">
                        <span className="text-left">市值/数量</span>
                        <span className="text-right">现价/成本</span>
                        <span className="text-right">当日盈亏</span>
                        <span className="text-right">持仓盈亏</span>
                        <span className="text-right">占比</span>
                      </div>
                      <div className="divide-y divide-white/[0.06]">
                        {positions.map((position) => {
                          const cost = toNumber(position.effectiveCost || position.avgCost);
                          const marketValue = toNumber(position.marketValue) * displayRate;
                          const todayPnl = toNumber(position.todayPnl) * displayRate;
                          const holdingPnl = toNumber(position.unrealizedPnl) * displayRate;
                          const allocation = positionsMarketValue > 0 ? toNumber(position.marketValue) / positionsMarketValue : 0;
                          return (
                            <button
                              key={position.symbol}
                              type="button"
                              onClick={() => openTradeModal(position, 'sell')}
                              className="grid min-h-[60px] w-full grid-cols-[80px_76px_118px_144px_66px] items-center gap-1 py-3 text-left active:bg-white/[0.03]"
                            >
                              <span className="text-left">
                                <span className="block max-w-full truncate text-[12px] font-normal leading-[15px] text-white/86 tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{fmtAmount(marketValue, 0)}</span>
                                <span className="mt-1 block text-[11px] leading-[13px] text-white/45 tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{fmtAmount(position.heldShares, 0)}</span>
                              </span>
                              <span className="text-right">
                                <span className="block text-[13px] font-normal leading-[15px] text-white/86 tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{fmtAmount(position.currentPrice, 3)}</span>
                                <span className="mt-1 block text-[11px] leading-[13px] text-white/45 tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{fmtAmount(cost, 3)}</span>
                              </span>
                              <span className="text-right">
                                <span className={`block whitespace-nowrap text-[13px] font-normal leading-[15px] tabular-nums ${pnlClass(todayPnl, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>{signedCurrency(todayPnl, displayCurrency, 2)}</span>
                                <span className={`mt-1 block whitespace-nowrap text-[11px] font-normal leading-[13px] tabular-nums ${pnlClass(position.changePercent, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>{signedPct(toNumber(position.changePercent) / 100, 2)}</span>
                              </span>
                              <span className="text-right">
                                <span className={`block whitespace-nowrap text-[13px] font-normal leading-[15px] tabular-nums ${pnlClass(holdingPnl, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>{signedCurrency(holdingPnl, displayCurrency, 2)}</span>
                                <span className={`mt-1 block whitespace-nowrap text-[11px] font-normal leading-[13px] tabular-nums ${pnlClass(position.unrealizedPct, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>{signedPct(position.unrealizedPct, 2)}</span>
                              </span>
                              <span className="text-right">
                                <span className="block text-[13px] font-normal leading-[15px] text-white/80 tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{(allocation * 100).toFixed(1)}%</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 flex justify-center">
                <button type="button" onClick={() => openTradeModal(null, 'buy')} className="flex items-center gap-2 rounded-full border border-[#f6b54b]/38 px-8 py-2.5 text-[13px] font-normal text-[#f6b54b] active:scale-95">
                  <Edit3 className="h-4 w-4" strokeWidth={2} />
                  编辑
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4">
              {todayTrades.length === 0 ? (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-8 text-center">
                  <div className="text-[13px] font-normal text-white/55">今日暂无订单</div>
                  <button type="button" onClick={() => openTradeModal(null, 'buy')} className="mt-3 rounded-full border border-[#f6b54b]/45 px-4 py-2 text-[12px] font-normal text-[#f6b54b] active:scale-95">记录订单</button>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {todayTrades.map((trade) => {
                    const isSell = trade.side === 'sell';
                    const amount = toNumber(trade.price) * toNumber(trade.shares) * displayRate;
                    return (
                      <button
                        key={trade.id}
                        type="button"
                        onClick={() => setOrderActionTrade(trade)}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-3 py-3 text-left active:bg-white/[0.03]"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-normal text-white">{trade.symbol}</div>
                          <div className="mt-1 text-[11px] text-white/60">{trade.name || trade.symbol}</div>
                        </div>
                        <div className="text-right">
                          <div className={`text-[13px] font-normal ${isSell ? 'text-emerald-400' : 'text-rose-400'}`}>{isSell ? '卖出' : '买入'} {fmtAmount(trade.shares, 0)} 股</div>
                          <div className="mt-1 text-[11px] font-normal text-white/40 tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{currencyAmount(amount, displayCurrency, 2)} @ {fmtAmount(trade.price, 2)}</div>
                        </div>
                        <span className="text-right text-[22px] leading-none text-white/26">›</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
        )}
      </div>

        {orderActionTrade && (() => {
          const isSell = orderActionTrade.side === 'sell';
          const amount = toNumber(orderActionTrade.price) * toNumber(orderActionTrade.shares) * displayRate;
          return (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 px-4 py-6 backdrop-blur-md"
              onClick={(e) => { if (e.target === e.currentTarget) setOrderActionTrade(null); }}
              style={{
                paddingTop: 'calc(env(safe-area-inset-top) + 24px)',
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)',
              }}
            >
              <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-[#0b0f16] shadow-[0_24px_80px_rgba(0,0,0,0.68)]">
                <div className="border-b border-white/10 px-4 pb-3 pt-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-white">订单操作</h2>
                    <button
                      type="button"
                      onClick={() => setOrderActionTrade(null)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-[18px] text-white/45 transition hover:bg-white/[0.08] hover:text-white/70 active:scale-90"
                      aria-label="关闭订单操作"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-normal text-white">{orderActionTrade.symbol || '--'}</div>
                        <div className="mt-1 truncate text-[11px] text-white/60">{orderActionTrade.name || orderActionTrade.symbol || '--'}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`text-[13px] font-normal ${isSell ? 'text-emerald-400' : 'text-rose-400'}`}>{isSell ? '卖出' : '买入'} {fmtAmount(orderActionTrade.shares, 0)} 股</div>
                        <div className="mt-1 text-[11px] font-normal text-white/40 tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{currencyAmount(amount, displayCurrency, 2)} @ {fmtAmount(orderActionTrade.price, 2)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 p-4">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={editOrderFromAction}
                      className="flex min-h-[72px] items-center justify-center gap-2 rounded-2xl border border-[#f6b54b]/35 bg-[#f6b54b]/10 text-[14px] font-normal text-[#f6b54b] active:scale-95"
                    >
                      <Edit3 className="h-5 w-5" strokeWidth={2} />
                      修改记录
                    </button>
                    <button
                      type="button"
                      onClick={deleteOrderFromAction}
                      className="flex min-h-[72px] items-center justify-center gap-2 rounded-2xl border border-rose-400/30 bg-rose-400/10 text-[14px] font-normal text-rose-300 active:scale-95"
                    >
                      <Trash2 className="h-5 w-5" strokeWidth={2} />
                      删除记录
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOrderActionTrade(null)}
                    className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] text-[14px] font-normal text-white/80 active:scale-95"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          );
        })()}


        {/* 波段记录(取代原来的"冷静室"+"日记本") */}
        {showWaveTool && (
          <div className="mx-auto mt-3 max-w-[430px] space-y-3 text-white">
            <section className="rounded-2xl border border-white/10 bg-[#0b0f14] p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.28)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[16px] font-normal leading-tight tracking-normal text-white">
                    波段记录
                  </h2>
                  <div className="mt-1 text-[10px] font-normal text-white/45">
                    点击波段查看明细
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openWaveTradeModal()}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[#f6b54b]/30 bg-[#f6b54b]/10 px-2.5 text-[11px] font-normal text-[#f6b54b] active:scale-95"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  新增波段股票
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-2.5 text-center">
                  <div className="text-[18px] font-normal tabular-nums text-rose-400" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                    {calmRoomActiveCount}
                  </div>
                  <div className="mt-0.5 text-[9px] font-normal text-white/45">进行中</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-2.5 text-center">
                  <div className="text-[18px] font-normal tabular-nums text-white/80" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                    {calmRoomCompletedCount}
                  </div>
                  <div className="mt-0.5 text-[9px] font-normal text-white/45">已完成</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-2.5 text-center">
                  <div className="text-[18px] font-normal tabular-nums text-white/80" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                    {calmRoomAvgActiveDays}
                    <span className="ml-0.5 text-[10px] font-normal text-white/45">天</span>
                  </div>
                  <div className="mt-0.5 text-[9px] font-normal text-white/45">均持有</div>
                </div>
              </div>
            </section>

            {wavesByStock.length === 0 ? (
              <section className="rounded-2xl border border-white/10 bg-[#0b0f14] p-5 text-center shadow-[0_16px_40px_rgba(0,0,0,0.24)]">
                <div className="text-[12px] font-normal text-white/75">暂无波段记录</div>
                <div className="mt-1 text-[10px] font-normal text-white/40">添加波段买入或卖出后,这里会自动显示。</div>
                <button
                  type="button"
                  onClick={() => openWaveTradeModal()}
                  className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-[#f6b54b]/30 bg-[#f6b54b]/10 px-3.5 text-[11px] font-normal text-[#f6b54b] active:scale-95"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  新增波段股票
                </button>
              </section>
            ) : wavesByStock.map(group => {
              const completedWaves = group.waves.filter(w => !w.isActive);
              const activeWave = group.waves.find(w => w.isActive);
              const completedKey = `completed-${group.symbol}`;
              const completedOpen = !!expandedWaves[completedKey];
              const totalGain = group.waves.reduce((sum, w) => sum + toNumber(w.gainAmount), 0);
              const completedCount = completedWaves.length;
              const winCount = completedWaves.filter(w => toNumber(w.gainPct) > 0).length;
              const winRate = completedCount > 0 ? Math.round(winCount / completedCount * 100) : 0;
              const avgHeld = group.avgHeldDays || 0;

              return (
                <section key={group.symbol} className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14] shadow-[0_16px_40px_rgba(0,0,0,0.26)]">
                  <div className="p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => openWaveTradeModal(group.symbol, group.name)}
                        className="min-w-0 text-left active:opacity-75"
                        title={`添加 ${group.symbol} 波段交易`}
                      >
                        <div className="text-[18px] font-normal leading-tight tabular-nums text-white" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                          {group.symbol}
                        </div>
                        <div className="mt-1 max-w-[190px] truncate text-[11px] font-normal text-white/45">
                          {group.name || group.symbol}
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAllTradesModal({ symbol: group.symbol, name: group.name });
                          }}
                          className="h-7 rounded-full border border-white/10 bg-white/[0.035] px-2.5 text-[11px] font-normal text-white/70 active:scale-95"
                          title="查看所有交易记录"
                        >
                          全部
                        </button>
                        <button
                          type="button"
                          onClick={() => openWaveTradeModal(group.symbol, group.name)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white/65 active:scale-95"
                          title={`添加 ${group.symbol} 波段交易`}
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-2.5 text-center">
                        <div className={`text-[14px] font-normal tabular-nums ${pnlClass(totalGain, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                          {signedCurrency(totalGain, 'USD', 0)}
                        </div>
                        <div className="mt-0.5 text-[9px] font-normal text-white/40">总盈亏</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-2.5 text-center">
                        <div className="text-[14px] font-normal tabular-nums text-white/80" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                          {completedCount > 0 ? `${winRate}%` : '—'}
                        </div>
                        <div className="mt-0.5 text-[9px] font-normal text-white/40">
                          胜率{completedCount > 0 ? ` ${winCount}/${completedCount}` : ''}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-2.5 text-center">
                        <div className="text-[14px] font-normal tabular-nums text-white/80" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                          {avgHeld > 0 ? `${avgHeld}天` : '—'}
                        </div>
                        <div className="mt-0.5 text-[9px] font-normal text-white/40">均持有</div>
                      </div>
                    </div>
                  </div>

                  {activeWave ? (() => {
                    const w = activeWave;
                    const noteValue = waveNotes[w.id] || '';
                    const isEditingNote = editingNoteId === w.id;
                    const isExpanded = expandedWaves[w.id] || false;
                    const startD = (w.startDate || '').slice(5);
                    const waveTrades = [...(w.buys || []), ...(w.sells || [])]
                      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id - b.id));

                    return (
                      <div className="mx-3.5 mb-3.5 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.035]">
                        <button
                          type="button"
                          onClick={() => setExpandedWaves({ ...expandedWaves, [w.id]: !isExpanded })}
                          className="w-full p-3.5 text-left active:bg-white/[0.03]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-300 animate-pulse" />
                              <div className="min-w-0">
                                <div className="text-[12px] font-normal text-white/90">进行中</div>
                                <div className="mt-1 text-[11px] font-normal tabular-nums text-white/40" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                  {startD} 开始 · 第 {w.heldDays} 天
                                </div>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-baseline gap-2">
                              <span className={`text-[20px] font-normal tabular-nums ${pnlClass(w.gainPct, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {signedPct(w.gainPct, 1)}
                              </span>
                              <span className={`text-xs text-white/35 transition ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-4 gap-1.5 rounded-xl border border-white/10 bg-black/15 p-2.5">
                            <div>
                              <div className="text-[9px] font-normal text-white/40">买入均</div>
                              <div className="mt-1 text-[12px] font-normal tabular-nums text-white/90" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                ${fmt(w.avgBuyPrice)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] font-normal text-white/40">现价</div>
                              <div className={`mt-1 text-[12px] font-normal tabular-nums ${w.currentPrice === w.avgBuyPrice ? 'text-white/90' : pnlClass(w.currentPrice - w.avgBuyPrice, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {w.currentPrice > 0 ? `$${fmt(w.currentPrice)}` : '—'}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] font-normal text-white/40">持有</div>
                              <div className="mt-1 text-[12px] font-normal tabular-nums text-white/90" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {fmt(w.heldShares, 0)}股
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] font-normal text-white/40">浮盈</div>
                              <div className={`mt-1 text-[12px] font-normal tabular-nums ${pnlClass(w.gainAmount, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {signedCurrency(w.gainAmount, 'USD', 0)}
                              </div>
                            </div>
                          </div>
                        </button>

                        <div className="px-3.5 pb-3">
                          {isEditingNote ? (
                            <input
                              type="text"
                              autoFocus
                              defaultValue={noteValue}
                              placeholder="如:关税恐慌、新冠崩盘、AI 浪潮…"
                              className="block w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[11px] font-normal text-white outline-none placeholder:text-white/25"
                              style={{ colorScheme: 'dark' }}
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
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                              className="max-w-full rounded-lg px-1 py-0.5 text-left text-[11px] font-normal text-white/55 active:scale-95"
                            >
                              {noteValue}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                              className="text-[10px] font-normal text-[#f6b54b] active:scale-95"
                            >
                              + 加备注
                            </button>
                          )}
                        </div>

                        {isExpanded && (
                          <div className="border-t border-white/10 px-3.5 pb-3.5 pt-3">
                            <div className="mb-2 text-[10px] font-normal text-white/45">交易明细</div>
                            <div className="space-y-2">
                              {waveTrades.map(t => {
                                const isBuy = !t.side || t.side === 'buy';
                                const amount = toNumber(t.shares) * toNumber(t.price);

                                return (
                                  <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-normal text-white ${isBuy ? 'bg-rose-500/80' : 'bg-emerald-500/80'}`}>
                                        {isBuy ? '买' : '卖'}
                                      </span>
                                      <span className="shrink-0 text-[11px] font-normal tabular-nums text-white/45" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                        {(t.date || '').slice(5)}
                                      </span>
                                      <span className="truncate text-[11px] font-normal tabular-nums text-white/70" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                        {fmt(t.shares, 0)}股 @${fmt(t.price)}
                                      </span>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <span className={`text-[11px] font-normal tabular-nums ${isBuy ? 'text-white/70' : 'text-emerald-400'}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                        {isBuy ? '-' : '+'}${fmt(amount, 0)}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setTradeDeleteConfirmId(t.id); }}
                                        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-[11px] font-normal text-white/45 active:scale-90"
                                        aria-label="删除交易"
                                      >
                                        ×
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
                  })() : (
                    <div className="mx-3.5 mb-3.5 rounded-2xl border border-white/10 bg-white/[0.025] px-3.5 py-3 text-[11px] font-normal text-white/40">
                      暂无进行中的波段
                    </div>
                  )}

                  {completedWaves.length > 0 && (
                    <div className="border-t border-white/10 px-3.5 py-3">
                      <button
                        type="button"
                        onClick={() => setExpandedWaves({ ...expandedWaves, [completedKey]: !completedOpen })}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5 text-left active:bg-white/[0.045]"
                      >
                        <span className="text-[12px] font-normal text-white/75">已完成</span>
                        <span className="flex items-center gap-2 text-[11px] font-normal text-white/40">
                          {completedWaves.length} 个
                          <span className={`transition ${completedOpen ? 'rotate-180' : ''}`}>▾</span>
                        </span>
                      </button>

                      {completedOpen && (
                        <div className="mt-2 space-y-2">
                          {completedWaves.map(w => {
                            const noteValue = waveNotes[w.id] || '';
                            const isEditingNote = editingNoteId === w.id;
                            const isExpanded = expandedWaves[w.id] || false;
                            const startD = (w.startDate || '').slice(5);
                            const endD = (w.endDate || '').slice(5);
                            const waveTrades = [...(w.buys || []), ...(w.sells || [])]
                              .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id - b.id));

                            return (
                              <div key={w.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/15">
                                <button
                                  type="button"
                                  onClick={() => setExpandedWaves({ ...expandedWaves, [w.id]: !isExpanded })}
                                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 text-left active:bg-white/[0.03]"
                                >
                                  <span className="min-w-0">
                                    <span className="block text-[12px] font-normal tabular-nums text-white/75" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                      {startD} → {endD}
                                      <span className="ml-1.5 text-[10px] font-normal text-white/40">· {w.heldDays}天</span>
                                    </span>
                                    <span className="mt-0.5 block text-[10px] font-normal tabular-nums text-white/40" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                      ${fmt(w.avgBuyPrice)} → ${fmt(w.avgSellPrice)}
                                    </span>
                                  </span>
                                  <span className="text-right">
                                    <span className={`block text-[14px] font-normal tabular-nums ${pnlClass(w.gainPct, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                      {signedPct(w.gainPct, 1)}
                                    </span>
                                    <span className={`block text-[10px] font-normal tabular-nums ${pnlClass(w.gainAmount, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                      {signedCurrency(w.gainAmount, 'USD', 0)}
                                    </span>
                                  </span>
                                </button>

                                {(noteValue || isEditingNote) && (
                                  <div className="px-3 pb-3">
                                    {isEditingNote ? (
                                      <input
                                        type="text"
                                        autoFocus
                                        defaultValue={noteValue}
                                        placeholder="如:关税恐慌、新冠崩盘、AI 浪潮…"
                                        className="block w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[11px] font-normal text-white outline-none placeholder:text-white/25"
                                        style={{ colorScheme: 'dark' }}
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
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                                        className="max-w-full rounded-lg px-1 py-0.5 text-left text-[11px] font-normal text-white/48 active:scale-95"
                                      >
                                        {noteValue}
                                      </button>
                                    )}
                                  </div>
                                )}

                                {!noteValue && !isEditingNote && (
                                  <div className="px-3 pb-3">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                                      className="text-[10px] font-normal text-white/30 active:scale-95"
                                    >
                                      + 加备注
                                    </button>
                                  </div>
                                )}

                                {isExpanded && (
                                  <div className="border-t border-white/10 px-3 pb-3 pt-3">
                                    <div className="mb-2 text-[10px] font-normal text-white/45">交易明细</div>
                                    <div className="space-y-2">
                                      {waveTrades.map(t => {
                                        const isBuy = !t.side || t.side === 'buy';
                                        const amount = toNumber(t.shares) * toNumber(t.price);

                                        return (
                                          <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2">
                                            <div className="flex min-w-0 items-center gap-2">
                                              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-normal text-white ${isBuy ? 'bg-rose-500/80' : 'bg-emerald-500/80'}`}>
                                                {isBuy ? '买' : '卖'}
                                              </span>
                                              <span className="shrink-0 text-[11px] font-normal tabular-nums text-white/45" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                                {(t.date || '').slice(5)}
                                              </span>
                                              <span className="truncate text-[11px] font-normal tabular-nums text-white/70" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                                {fmt(t.shares, 0)}股 @${fmt(t.price)}
                                              </span>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                              <span className={`text-[11px] font-normal tabular-nums ${isBuy ? 'text-white/70' : 'text-emerald-400'}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                                {isBuy ? '-' : '+'}${fmt(amount, 0)}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setTradeDeleteConfirmId(t.id); }}
                                                className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-[11px] font-normal text-white/45 active:scale-90"
                                                aria-label="删除交易"
                                              >
                                                ×
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
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {/* 添加成交表单 - Modal 弹窗 */}
        {showAddTrade && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 px-3 py-4 backdrop-blur-md animate-in fade-in"
            onClick={(e) => { if (e.target === e.currentTarget) setShowAddTrade(false); }}
            style={{
              paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
            }}
          >
            <div
              className="w-full max-w-md min-w-0 overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0f16] shadow-[0_24px_80px_rgba(0,0,0,0.68)]"
              style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 32px)' }}
            >
              {/* 顶部把手 + 标题 */}
              <div className="sticky top-0 z-10 border-b border-white/10 bg-[#0b0f16]/95 px-4 pb-2 pt-3 backdrop-blur">
                <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/25 sm:hidden" />
                <div className="flex items-center justify-between">
                  <h2 className={`text-base text-white ${tradeEntryScope === 'wave' ? 'font-normal' : 'font-black'}`}>
                    {tradeEntryScope === 'wave' ? '添加波段记录' : (newTrade.id || newTrade.editingId ? '修改交易' : '添加交易')}
                  </h2>
                  <button
                    onClick={() => setShowAddTrade(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/45 transition hover:bg-white/[0.08] hover:text-white/70 active:scale-90"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="min-w-0 p-4">
                {/* 买/卖切换 */}
                <div className="mb-4 flex min-w-0 gap-2">
                  <button
                    onClick={() => setNewTrade({ ...newTrade, side: 'buy' })}
                    className={`flex-1 rounded-xl border py-3 text-sm font-normal transition active:scale-95 ${
                      newTrade.side === 'buy'
                        ? 'border-rose-500/20 bg-rose-600 text-white shadow-[0_12px_28px_rgba(225,29,72,0.28)]'
                        : 'border-transparent bg-white/[0.055] text-white/55'
                    }`}
                  >
                    买入
                  </button>
                  <button
                    onClick={() => setNewTrade({ ...newTrade, side: 'sell' })}
                    className={`flex-1 rounded-xl border py-3 text-sm font-normal transition active:scale-95 ${
                      newTrade.side === 'sell'
                        ? 'border-emerald-500/20 bg-emerald-600 text-white shadow-[0_12px_28px_rgba(5,150,105,0.28)]'
                        : 'border-transparent bg-white/[0.055] text-white/55'
                    }`}
                  >
                    卖出
                  </button>
                </div>

                {/* 股票代码 + 名称 */}
                <div className="grid min-w-0 grid-cols-2 gap-2 mb-2">
                  <div className="min-w-0">
                    <label className={`${tradeModalLabelClass} flex items-center gap-1.5`}>
                      <span>股票代码</span>
                      {lookupStatus === 'loading' && (
                        <span className="inline-flex items-center gap-0.5 text-sky-300">
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                          <span>查询中</span>
                        </span>
                      )}
                      {lookupStatus === 'found' && (
                        <span className="inline-flex items-center gap-0.5 text-emerald-300">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>已找到</span>
                        </span>
                      )}
                      {lookupStatus === 'notfound' && (
                        <span className="inline-flex items-center gap-0.5 text-amber-300">
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
                      className={`${tradeModalBaseInput} font-normal uppercase`}
                      style={tradeModalInputStyle}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className={tradeModalLabelClass}>中文名(自动)</label>
                    <input
                      type="text"
                      placeholder="自动填充"
                      value={newTrade.name}
                      onChange={(e) => setNewTrade({ ...newTrade, name: e.target.value })}
                      className={tradeModalBaseInput}
                      style={tradeModalInputStyle}
                    />
                  </div>
                </div>

                {/* 日期(独占一行) */}
                <div className="mb-2 min-w-0">
                  <label className={tradeModalLabelClass}>日期</label>
                  <input
                    type="date"
                    value={newTrade.date}
                    onChange={(e) => setNewTrade({ ...newTrade, date: e.target.value })}
                    className={`${tradeModalBaseInput} appearance-none text-center text-[15px] font-normal tabular-nums`}
                    style={{ ...tradeModalInputStyle, WebkitAppearance: 'none' }}
                  />
                </div>

                {/* 价格 + 股数(共一行) */}
                <div className="grid min-w-0 grid-cols-2 gap-2 mb-4">
                  <div className="min-w-0">
                    <label className={tradeModalLabelClass}>价格 ($, 自动)</label>
                    <input
                      type="number"
                      placeholder="自动填充"
                      step="0.01"
                      inputMode="decimal"
                      value={newTrade.price}
                      onChange={(e) => setNewTrade({ ...newTrade, price: e.target.value })}
                      className={`${tradeModalBaseInput} tabular-nums`}
                      style={tradeModalInputStyle}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className={tradeModalLabelClass}>股数</label>
                    <input
                      type="number"
                      placeholder="0"
                      inputMode="numeric"
                      value={newTrade.shares}
                      onChange={(e) => setNewTrade({ ...newTrade, shares: e.target.value })}
                      className={`${tradeModalBaseInput} tabular-nums`}
                      style={tradeModalInputStyle}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={confirmTradeSubmit}
                    disabled={tradeSubmitting}
                    className="flex-1 rounded-xl border border-emerald-300/30 bg-emerald-500/85 py-3 text-sm font-normal text-white shadow-[0_12px_32px_rgba(16,185,129,0.22)] transition active:scale-95 disabled:opacity-55 disabled:active:scale-100"
                  >
                    {tradeSubmitting ? '保存中...' : (newTrade.id || newTrade.editingId ? '确认修改' : '确认添加')}
                  </button>
                  <button onClick={() => setShowAddTrade(false)} className="flex-1 rounded-xl border border-transparent bg-white/[0.055] py-3 text-sm font-normal text-white/75 transition active:scale-95">取消</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============ 💼 摊薄成本计算器 (v10.7.9.41, iOS 风格) ============ */}
        {showCostTool && (() => {
          const allSymbols = Object.keys(costBasisData);
          const activeSymbol = costBasisActiveSymbol && costBasisData[costBasisActiveSymbol]
            ? costBasisActiveSymbol
            : (allSymbols[0] || '');
          const trades = activeSymbol ? (costBasisData[activeSymbol] || []) : [];
          const stats = calcCostBasis(trades);

          return (
            <div className="mx-auto mt-3 mb-4 max-w-[430px]">
              {/* 头部 */}
              <div className="px-1 mb-3">
                <h2 className="font-black text-[20px] text-slate-900 mb-0.5">💼 摊薄成本</h2>
                <div className="text-[11px] text-slate-400">
                  {allSymbols.length > 0 ? `${allSymbols.length} 只股 · 云端存储` : '云端小工具 · 不影响其他模块'}
                </div>
              </div>

              {/* 顶部 Tab 切换 */}
              <div className="flex gap-2 px-1 pb-3 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                {allSymbols.map(sym => (
                  <button
                    key={sym}
                    onClick={() => setCostBasisActiveSymbol(sym)}
                    className="flex-shrink-0 px-4 py-2 rounded-xl text-[13px] font-black transition active:scale-95"
                    style={{
                      background: activeSymbol === sym ? '#0f172a' : 'white',
                      color: activeSymbol === sym ? 'white' : '#475569',
                      fontFamily: 'ui-monospace, monospace',
                      boxShadow: activeSymbol === sym ? '0 4px 8px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
                    }}
                  >
                    {sym}
                  </button>
                ))}
                <button
                  onClick={() => { setCostBasisNewSymbol(''); setShowCostBasisAdd(true); }}
                  className="flex-shrink-0 px-4 py-2 rounded-xl text-[13px] font-black transition active:scale-95"
                  style={{
                    background: 'white',
                    color: '#0f172a',
                    border: '1px dashed #cbd5e1',
                    fontFamily: 'ui-monospace, monospace',
                  }}
                >
                  + 新增
                </button>
              </div>

              {/* 内容 */}
              {!activeSymbol ? (
                // 空状态
                <div className="bg-white rounded-2xl p-8 text-center" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div className="text-5xl mb-3">💼</div>
                  <div className="text-sm text-slate-700 font-bold mb-1">还没有股票</div>
                  <div className="text-xs text-slate-500">点上方"+ 新增" 添加第一只股票</div>
                </div>
              ) : (
                <>
                  {/* 大数字卡 - 摊薄成本 (会计 + 实际 两个) */}
                  <div
                    className="rounded-2xl p-5 mb-3"
                    style={{ background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                  >
                    {/* 顶部 持仓 */}
                    <div className="flex items-center justify-between mb-3 pb-3" style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <div className="text-[12px] text-slate-500 font-bold">持仓</div>
                      <div className="font-black tabular-nums text-emerald-600 text-[15px]" style={{ fontFamily: 'ui-monospace, monospace' }}>
                        {stats.shares} 股
                      </div>
                    </div>
                    {/* 两种成本对比 (v10.7.9.41: V2 替换 sub 字, 显示涨幅%) */}
                    {(() => {
                      // 从关注列表拿现价
                      const watchStock = watchlist.find(w => w.symbol === activeSymbol);
                      const currentPrice = watchStock?.price || 0;
                      const hasPrice = currentPrice > 0 && stats.effectiveCost > 0;
                      const gainPct = hasPrice ? ((currentPrice - stats.effectiveCost) / stats.effectiveCost) * 100 : 0;
                      const isUp = gainPct >= 0;

                      return (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">会计摊薄</div>
                            <div className="font-black tabular-nums leading-tight mt-1" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '22px', color: '#0f172a' }}>
                              ${stats.avgCost.toFixed(2)}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">移动加权平均</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#d97706' }}>实际成本</div>
                            <div className="font-black tabular-nums leading-tight mt-1" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '22px', color: '#d97706' }}>
                              ${stats.effectiveCost.toFixed(2)}
                            </div>
                            {/* v10.7.9.41: 涨幅% + 现价 一行紧凑 (11px 长股价也能装下) */}
                            {hasPrice ? (
                              <div className="mt-0.5" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                <span className={strongPnlClass(gainPct, marketColorMode)}>
                                  {isUp ? '↑ +' : '↓ '}{gainPct.toFixed(2)}%
                                </span>
                                <span style={{ color: '#94a3b8', fontWeight: 600, marginLeft: '4px' }}>
                                  · 现价 ${currentPrice.toFixed(2)}
                                </span>
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-400 mt-0.5">扣除已实现盈亏</div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* 2 列小卡 */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="rounded-2xl p-4" style={{ background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">累计投入</div>
                      <div className="font-black tabular-nums text-slate-900 mt-1 text-[18px]" style={{ fontFamily: 'ui-monospace, monospace' }}>
                        ${stats.totalCost.toFixed(0)}
                      </div>
                      {/* v10.7.9.41: CNY 副显示 */}
                      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>
                        ≈ ¥{(stats.totalCost * usdRate / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}万
                      </div>
                    </div>
                    <div className="rounded-2xl p-4" style={{ background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">已实现盈亏</div>
                      <div className={`font-black tabular-nums mt-1 text-[18px] ${strongPnlClass(stats.realizedPnl, marketColorMode)}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                        {stats.realizedPnl >= 0 ? '+' : ''}${stats.realizedPnl.toFixed(0)}
                      </div>
                      {/* v10.7.9.41: CNY 副显示 */}
                      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>
                        ≈ {stats.realizedPnl >= 0 ? '+' : '-'}¥{(Math.abs(stats.realizedPnl) * usdRate / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}万
                      </div>
                    </div>
                  </div>

                  {/* 交易记录列表 */}
                  <div className="rounded-2xl p-4" style={{ background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[12px] text-slate-600 font-bold">交易记录 ({trades.length})</div>
                      <button
                        onClick={() => {
                          setCostBasisNewTrade({ type: 'buy', price: '', shares: '', date: localDateKey() });
                          setShowCostBasisTrade(true);
                        }}
                        className="text-[11px] font-bold text-amber-700 active:scale-95"
                      >
                        + 添加
                      </button>
                    </div>
                    {trades.length === 0 ? (
                      <div className="text-center py-6 text-xs text-slate-400">还没有交易, 点 + 添加</div>
                    ) : (
                      (() => {
                        // 计算每笔卖出"成交时"的会计摊薄成本
                        // 算法: 按时间正序遍历, 维护 totalCost / shares
                        //       遇到卖出时, 当前 avgCost 就是"卖出成本依据"
                        const sortedAsc = [...trades].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                        const tradeAvgAtSell = {};  // {tradeId: avgCost}
                        let runShares = 0;
                        let runTotalCost = 0;
                        for (const t of sortedAsc) {
                          const p = parseFloat(t.price) || 0;
                          const s = parseFloat(t.shares) || 0;
                          if (t.type === 'buy') {
                            runShares += s;
                            runTotalCost += s * p;
                          } else {
                            if (runShares > 0) {
                              const avg = runTotalCost / runShares;
                              tradeAvgAtSell[t.id] = avg;
                              runTotalCost -= s * avg;
                              runShares -= s;
                              if (runShares <= 0) { runShares = 0; runTotalCost = 0; }
                            }
                          }
                        }

                        return [...trades]
                          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                          .map(t => {
                            const isExpanded = !!expandedTrades[t.id];
                            const isSell = t.type === 'sell';
                            const price = parseFloat(t.price);
                            const shares = parseFloat(t.shares);
                            const amount = price * shares;
                            const sellAvg = isSell ? (tradeAvgAtSell[t.id] || 0) : 0;
                            const sellCost = isSell ? sellAvg * shares : 0;
                            const profit = isSell ? (amount - sellCost) : 0;
                            const profitPct = (isSell && sellCost > 0) ? (profit / sellCost) * 100 : 0;

                            return (
                              <div key={t.id} className="border-b border-slate-100 last:border-b-0">
                                {/* 主行 */}
                                <div className="grid items-center py-2.5" style={{ gridTemplateColumns: '32px 1fr auto auto auto', gap: '10px' }}>
                                  <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black ${isSell ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}
                                  >
                                    {isSell ? '卖' : '买'}
                                  </div>
                                  <div
                                    className={`text-[13px] ${isSell ? 'cursor-pointer' : ''}`}
                                    onClick={() => isSell && setExpandedTrades(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                                  >
                                    <div className="font-bold text-slate-900">{t.date} {isSell ? '卖出' : '买入'} {shares} 股</div>
                                    <div className="text-[11px] text-slate-400 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>${price.toFixed(2)}/股</div>
                                  </div>
                                  <div className={`text-right font-black tabular-nums text-[13px] ${isSell ? 'text-emerald-600' : 'text-rose-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                                    {isSell ? '+' : '-'}${amount.toFixed(0)}
                                  </div>
                                  {isSell ? (
                                    <button
                                      onClick={() => setExpandedTrades(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                                      className="text-slate-400 text-[12px] px-1"
                                    >
                                      {isExpanded ? '▲' : '▼'}
                                    </button>
                                  ) : (
                                    <span></span>
                                  )}
                                  <button
                                    onClick={() => {
                                      showConfirm({
                                        title: '删除这笔交易?',
                                        desc: '此操作不可撤销',
                                        info: `${t.date} · ${isSell ? '卖出' : '买入'} ${shares} 股 @ $${price}`,
                                        confirmText: '删除',
                                        onConfirm: () => {
                                          setCostBasisData(prev => ({
                                            ...prev,
                                            [activeSymbol]: prev[activeSymbol].filter(x => x.id !== t.id),
                                          }));
                                          db.deleteCostBasisTrade(t.id).catch(e => {
                                            console.error('[CostBasis] 删除云端失败:', e.message);
                                          });
                                        },
                                      });
                                    }}
                                    className="text-slate-300 hover:text-rose-500 text-[14px] px-1"
                                    title="删除"
                                  >
                                    ✕
                                  </button>
                                </div>
                                {/* 卖出详情 (展开) */}
                                {isSell && isExpanded && (
                                  <div
                                    className="px-3 py-3 mb-2 mx-9 rounded-lg"
                                    style={{ background: 'linear-gradient(180deg, #ecfdf5 0%, #f0fdf4 100%)', border: '1px solid #d1fae5' }}
                                  >
                                    <div className="text-[11px] leading-relaxed" style={{ fontFamily: 'ui-monospace, monospace', color: '#15803d' }}>
                                      <div><strong style={{ color: '#14532d' }}>卖出收入</strong> = {price.toFixed(2)} × {shares} = <strong style={{ color: '#14532d' }}>${amount.toFixed(2)}</strong></div>
                                      <div><strong style={{ color: '#14532d' }}>卖出成本</strong> = {sellAvg.toFixed(2)} × {shares} = <strong style={{ color: '#14532d' }}>${sellCost.toFixed(2)}</strong></div>
                                      <div><strong style={{ color: '#14532d' }}>本次利润</strong> = {amount.toFixed(0)} − {sellCost.toFixed(0)}</div>
                                    </div>
                                    <div className={`mt-2 pt-2 font-black ${strongPnlClass(profit, marketColorMode)}`} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '15px', borderTop: '1px dashed #86efac' }}>
                                      = {profit >= 0 ? '+' : ''}${profit.toFixed(2)} ({profit >= 0 ? '+' : ''}{profitPct.toFixed(2)}%)
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          });
                      })()
                    )}
                  </div>

                  {/* 删除整只股票按钮 */}
                  <button
                    onClick={() => {
                      const symToDelete = activeSymbol;
                      const count = trades.length;
                      showConfirm({
                        title: `删除 ${symToDelete}?`,
                        desc: '此操作不可撤销, 该股票的全部交易记录将从云端删除',
                        info: `${symToDelete} · ${count} 笔交易`,
                        confirmText: '全部删除',
                        onConfirm: () => {
                          setCostBasisData(prev => {
                            const next = { ...prev };
                            delete next[symToDelete];
                            return next;
                          });
                          const remaining = Object.keys(costBasisData).filter(s => s !== symToDelete);
                          setCostBasisActiveSymbol(remaining[0] || '');
                          db.deleteCostBasisSymbol(symToDelete).catch(e => {
                            console.error('[CostBasis] 删整只云端失败:', e.message);
                          });
                        },
                      });
                    }}
                    className="w-full mt-3 py-2 text-[11px] text-rose-500 font-bold active:scale-95"
                  >
                    🗑 删除 {activeSymbol} 整只股票
                  </button>
                </>
              )}
            </div>
          );
        })()}


    </>
  );
}
