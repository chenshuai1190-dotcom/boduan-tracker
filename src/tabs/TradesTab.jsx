import React from 'react';
import { BookOpen, Calculator, Database, Edit3, Grid2X2, ListChecks, Settings2, Trash2, TrendingUp } from 'lucide-react';
import {
  MARKET_COLOR_MODES,
  marketStrongTextClass,
  marketTextClass,
} from '../lib/marketColorMode.js';
import { splitCurrencyAmount } from '../lib/amountDisplay.js';
import { isEnglishLanguage, t } from '../lib/i18n.js';

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

function normalizeCostBasisSymbol(symbol) {
  const value = String(symbol || '').trim().toUpperCase();
  return /^[A-Z0-9.^-]{1,16}$/.test(value) ? value : '';
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
    language = 'zh',
    lookupStatus,
    marketColorMode,
    newTrade,
    Plus,
    quoteRows,
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
    displayStockName,
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
  const [waveView, setWaveView] = React.useState('active');
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
  const quoteBySymbol = React.useMemo(() => {
    const map = new Map();
    (quoteRows || []).forEach((row) => {
      const symbol = String(row?.symbol || '').trim().toUpperCase();
      if (symbol) map.set(symbol, row);
    });
    return map;
  }, [quoteRows]);
  const rate = toNumber(summary.usdRate || usdRate) || 7.2;
  const displayCurrency = currencyMode === 'CNY' ? 'CNY' : 'USD';
  const displayCurrencyLabel = currencyMode === 'CNY' ? 'RMB' : 'USD';
  const displayRate = currencyMode === 'CNY' ? rate : 1;
  const englishMode = isEnglishLanguage(language);
  const tt = React.useCallback((key, fallback, values) => t(language, key, fallback, values), [language]);
  const sideLabel = React.useCallback((side, short = false) => (
    side === 'sell'
      ? tt(short ? 'trades.sellShort' : 'trades.sell', short ? '卖' : '卖出')
      : tt(short ? 'trades.buyShort' : 'trades.buy', short ? '买' : '买入')
  ), [tt]);
  const sharesText = React.useCallback((value, digits = 0) => `${fmtAmount(value, digits)} ${tt('trades.shares', '股')}`, [tt]);
  const daysText = React.useCallback((value) => `${value}${tt('trades.day', '天')}`, [tt]);
  const cnyEquivalentText = React.useCallback((usdValue, signed = false) => {
    const cnyValue = toNumber(usdValue) * rate;
    const sign = signed && cnyValue > 0 ? '+' : (signed && cnyValue < 0 ? '-' : '');
    const absValue = Math.abs(cnyValue);
    if (englishMode) return `≈ ${sign}¥${fmtAmount(absValue, 0)}`;
    return `≈ ${sign}¥${(absValue / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}万`;
  }, [englishMode, rate]);
  const pnlAmountClass = 'text-[13px]';
  const tradeModalInputStyle = { colorScheme: 'dark' };
  const tradeModalBaseInput = 'block w-full max-w-full min-w-0 box-border rounded-lg border border-transparent bg-white/[0.06] px-3 py-2 text-[12px] text-white outline-none transition placeholder:text-white/25 focus:bg-white/[0.085]';
  const tradeModalLabelClass = 'mb-1 block text-[9px] font-normal text-white/45';
  const displayAssets = toNumber(summary.totalAssetsUsd) * displayRate;
  const displayAssetMoney = splitCurrencyAmount(displayAssets, displayCurrency, 2);
  const displayTodayPnl = toNumber(summary.todayPnl) * displayRate;
  const displayCumulativePnl = toNumber(summary.cumulativePnl) * displayRate;
  const displayHoldingPnl = toNumber(summary.unrealizedPnl) * displayRate;
  const todayKey = localDateKey();
  const todayTrades = (stockTrades || []).filter((trade) => trade.date === todayKey);
  const todayBuys = todayTrades.filter((trade) => trade.side !== 'sell').length;
  const todaySells = todayTrades.filter((trade) => trade.side === 'sell').length;
  const ledgerTradeRecords = [...(stockTrades || [])].sort((a, b) => (
    (b.date || '').localeCompare(a.date || '') || String(b.id || '').localeCompare(String(a.id || ''))
  ));
  const showWaveTool = toolPanel === 'waves';
  const showCostTool = toolPanel === 'cost';
  const showTradeRecordsTool = toolPanel === 'records';
  const showMainLedger = !showWaveTool && !showCostTool;
  const positionsMarketValue = toNumber(summary.positionsMarketValue);
  const stockDisplayName = typeof displayStockName === 'function'
    ? ((symbol, name) => displayStockName(symbol, name, language))
    : ((symbol, name) => String(name || symbol || '').trim());
  const stockNameParts = React.useCallback((symbol, name) => {
    const normalizedSymbol = String(symbol || '').trim().toUpperCase();
    const displayName = stockDisplayName(normalizedSymbol, name);
    if (englishMode) {
      return {
        title: normalizedSymbol || displayName || '--',
        subtitle: displayName && displayName !== normalizedSymbol ? displayName : normalizedSymbol,
      };
    }
    return {
      title: displayName || normalizedSymbol || '--',
      subtitle: normalizedSymbol || displayName || '--',
    };
  }, [englishMode, stockDisplayName]);
  const waveGroups = Array.isArray(wavesByStock) ? wavesByStock : [];
  const activeWaveGroups = waveGroups.filter(group => group.activeWave);
  const completedWaveGroups = waveGroups
    .map(group => ({ ...group, completedWaves: (group.waves || []).filter(w => !w.isActive) }))
    .filter(group => group.completedWaves.length > 0);
  const colorModeOptions = [
    { id: MARKET_COLOR_MODES.GREEN_UP_RED_DOWN, label: tt('trades.greenUpRedDown', '绿涨红跌'), upClass: 'bg-emerald-400', downClass: 'bg-rose-400' },
    { id: MARKET_COLOR_MODES.RED_UP_GREEN_DOWN, label: tt('trades.redUpGreenDown', '绿跌红涨'), upClass: 'bg-rose-400', downClass: 'bg-emerald-400' },
  ];

  const openTradeModal = (position = null, side = 'buy') => {
    const symbol = position?.symbol || '';
    setTradeEntryScope('ledger');
    setNewTrade({
      symbol,
      name: stockDisplayName(symbol, position?.name),
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
    const symbol = trade?.symbol || '';
    setTradeEntryScope('ledger');
    setNewTrade({
      id: trade.id,
      symbol,
      name: stockDisplayName(symbol, trade.name),
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
    const normalizedSymbol = String(symbol || '').trim().toUpperCase();
    const activeWave = normalizedSymbol
      ? wavesByStock.find(group => group.symbol === normalizedSymbol)?.activeWave
      : null;
    setTradeEntryScope('wave');
    setNewTrade({
      symbol: normalizedSymbol,
      name,
      side: 'buy',
      date: localDateKey(),
      price: '',
      shares: '',
      note: activeWave ? (waveNotes[activeWave.id] || '') : '',
      batch: '第1批',
    });
    setLookupStatus(normalizedSymbol ? 'found' : null);
    setShowAddTrade(true);
  };

  const openCompletedWaves = () => {
    if (calmRoomCompletedCount <= 0) return;
    setWaveView('completed');
  };

  const saveWaveNote = (waveId, value) => {
    const nextNote = String(value || '').trim();
    setWaveNotes(current => ({ ...current, [waveId]: nextNote }));
    db.upsertWaveNote(waveId, nextNote).catch(err => console.error('备注保存失败:', err));
    setEditingNoteId(null);
  };

  const confirmDeleteTodayTrade = (trade) => {
    showConfirm({
      title: tt('trades.deleteTradeTitle', '删除这笔交易记录?'),
      desc: tt('trades.deleteTradeDesc', '删除后会同步云端主交易账本,持仓和盈亏会重新计算。'),
      info: `${trade.symbol || '--'} · ${sideLabel(trade.side)} ${sharesText(trade.shares, 0)}`,
      confirmText: tt('trades.delete', '删除'),
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
      confirmText: tt('trades.close', '关闭'),
      confirmStyle: 'primary',
      icon: '!',
      showCancel: false,
    });
  };

  const confirmTradeSubmit = () => {
    if (tradeSubmitting) return;
    if (!newTrade.symbol || !newTrade.price || !newTrade.shares) {
      showTradeFormNotice(
        tt('trades.requiredTitle', '请填写完整信息'),
        tt('trades.requiredDesc', '股票代码、价格和股数都是必填项。'),
        `${newTrade.symbol || '--'} · ${newTrade.price || '--'} · ${newTrade.shares || '--'}`
      );
      return;
    }
    const symbol = String(newTrade.symbol || '').trim().toUpperCase();
    const shares = Number(newTrade.shares) || 0;
    const price = Number(newTrade.price) || 0;
    if (shares <= 0 || price <= 0) {
      showTradeFormNotice(
        tt('trades.positiveTitle', '价格和股数需要大于 0'),
        tt('trades.positiveDesc', '请检查输入后再提交。'),
        `${symbol || '--'} · ${sharesText(shares, 0)} @ ${price > 0 ? price.toFixed(2) : '--'}`
      );
      return;
    }
    const isWaveEntry = tradeEntryScope === 'wave';
    const currentSideLabel = sideLabel(newTrade.side);
    showConfirm({
      title: isWaveEntry
        ? tt('trades.confirmWaveSaveTitle', '确认保存到波段记录?')
        : (newTrade.id || newTrade.editingId ? tt('trades.confirmLedgerEditTitle', '确认修改正式交易?') : tt('trades.confirmLedgerSaveTitle', '确认保存正式交易?')),
      desc: isWaveEntry
        ? tt('trades.confirmWaveSaveDesc', '这笔记录只会进入波段记录独立账本,不会进入正式持仓、当日订单或总资产计算。')
        : tt('trades.confirmLedgerSaveDesc', '这笔记录会同步正式主交易账本,并影响持仓、当日订单和盈亏。'),
      info: `${symbol || '--'} · ${currentSideLabel} ${sharesText(shares, 0)} @ ${price > 0 ? price.toFixed(2) : '--'} · ${newTrade.date || '--'}`,
      confirmText: tt('trades.confirmSave', '确认保存'),
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
            <div className="text-[13px] font-normal text-white/70">{tt('trades.totalAssets', '总资产')} ({displayCurrencyLabel}) <span className="ml-1 text-white/50">◎</span></div>
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

          <div className="mt-3 whitespace-nowrap text-[34px] font-normal leading-none tracking-normal text-[#ffd18a] tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>
            <span>{displayAssetMoney.main}</span>
            <span className="ml-0.5 align-baseline text-[20px] font-normal leading-none text-[#ffd18a]/90">{displayAssetMoney.decimal}</span>
          </div>

          <div
            className="mt-6 grid grid-cols-[1fr_1.12fr_0.96fr] divide-x divide-white/10"
            style={englishMode ? { gridTemplateColumns: '0.95fr 1fr 1.3fr' } : undefined}
          >
            <div className="min-w-0 pr-3">
              <div className="text-[12px] text-white/50">{tt('trades.todayPnl', '今日盈亏')}</div>
              <div className={`mt-2 whitespace-nowrap ${pnlAmountClass} font-normal leading-tight tabular-nums ${pnlClass(displayTodayPnl, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                {signedCurrency(displayTodayPnl, displayCurrency, 2)}
              </div>
              <div className={`mt-1 text-[12px] font-normal tabular-nums ${pnlClass(displayTodayPnl, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                {signedPct(summary.todayPnlPct, 2)}
              </div>
            </div>
            <div className="min-w-0 px-3">
              <div className="text-[12px] text-white/50">{tt('trades.totalPnl', '累计盈亏')}</div>
              <div className={`mt-2 whitespace-nowrap ${pnlAmountClass} font-normal leading-tight tabular-nums ${pnlClass(displayCumulativePnl, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                {signedCurrency(displayCumulativePnl, displayCurrency, 2)}
              </div>
              <div className={`mt-1 text-[12px] font-normal tabular-nums ${pnlClass(displayCumulativePnl, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                {signedPct(summary.cumulativePnlPct, 2)}
              </div>
            </div>
            <div className="min-w-0 pl-3">
              <div className="text-[12px] text-white/50">{tt('trades.positions', '持仓数量')}</div>
              <div className={`mt-3 whitespace-nowrap ${englishMode ? 'text-[14px]' : 'text-[15px]'} font-normal leading-tight text-white/90`}>
                {tt('trades.holdingsTrades', '{{holdings}}只 · {{trades}}笔', { holdings: summary.holdingStockCount || 0, trades: summary.sellTradeCount || 0 })}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-3 grid grid-cols-4 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          {[
            { id: 'waves', label: tt('trades.swingLog', '波段记录'), icon: BookOpen },
            { id: 'cost', label: tt('trades.averagingTool', '摊薄工具'), icon: Calculator },
            { id: 'records', label: tt('trades.tradeLog', '交易记录'), icon: ListChecks },
            { id: 'all', label: tt('trades.allTools', '全部功能'), icon: Grid2X2, disabled: true },
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

        {showTradeRecordsTool && (
          <section className="mt-3 rounded-2xl border border-white/10 bg-[#0b0f14] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[14px] font-normal text-white">{tt('trades.tradeLog', '交易记录')}</div>
                <div className="mt-1 text-[11px] text-white/40">{tt('trades.tradeRecordsSubtitle', '全部主交易账本 · 点击记录修改或删除')}</div>
              </div>
              <button
                type="button"
                onClick={() => openTradeModal(null, 'buy')}
                className="rounded-full border border-[#f6b54b]/40 px-3 py-1.5 text-[12px] font-normal text-[#f6b54b] active:scale-95"
              >
                {tt('trades.addTrade', '新增交易')}
              </button>
            </div>
            {ledgerTradeRecords.length === 0 ? (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-5 text-center text-[12px] text-white/40">{tt('trades.noTradeRecords', '还没有交易记录,先新增一笔买入。')}</div>
            ) : (
              <div className="max-h-[360px] divide-y divide-white/[0.06] overflow-y-auto [scrollbar-width:none]" data-pull-refresh-block="true">
                {ledgerTradeRecords.map((trade) => {
                  const isSell = trade.side === 'sell';
                  const amount = toNumber(trade.price) * toNumber(trade.shares) * displayRate;
                  const displayName = stockDisplayName(trade.symbol, trade.name);
                  return (
                    <button
                      key={trade.id}
                      type="button"
                      onClick={() => setOrderActionTrade(trade)}
                      className="grid w-full grid-cols-[54px_minmax(0,1fr)_auto_16px] items-center gap-3 py-3 text-left active:bg-white/[0.03]"
                    >
                      <div className="whitespace-nowrap text-[11px] font-normal tabular-nums text-white/45" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                        {(trade.date || '--').slice(5) || '--'}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-normal text-white">{trade.symbol}</div>
                        <div className="mt-1 truncate text-[11px] font-normal text-white/50">{displayName}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`text-[13px] font-normal ${isSell ? 'text-emerald-400' : 'text-rose-400'}`}>{sideLabel(trade.side)} {sharesText(trade.shares, 0)}</div>
                        <div className="mt-1 text-[11px] font-normal text-white/40 tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{currencyAmount(amount, displayCurrency, 2)} @ {fmtAmount(trade.price, 2)}</div>
                      </div>
                      <span className="text-right text-[22px] leading-none text-white/26">›</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {showMainLedger && (
        <section className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-5">
              <button type="button" onClick={() => setMainView('positions')} className={`text-[14px] font-normal leading-none ${mainView === 'positions' ? 'text-[#ffd18a]' : 'text-white/40'}`}>{tt('trades.positionsTab', '持仓分布')}</button>
              <button type="button" onClick={() => setMainView('orders')} className={`text-[14px] font-normal leading-none ${mainView === 'orders' ? 'text-[#ffd18a]' : 'text-white/40'}`}>{tt('trades.todayOrdersTab', '当日订单 ({{buys}}/{{sells}})', { buys: todayBuys, sells: todaySells })}</button>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setColorMenuOpen((value) => !value)}
                className="text-white/55 active:scale-95"
                aria-label={tt('trades.colorSettings', '股票涨跌颜色设置')}
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
                    <span>{tt('trades.usStocks', '美股')}</span>
                    <span className="text-white/76 tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{currencyAmount(toNumber(summary.positionsMarketValue) * displayRate, displayCurrency, 2)}</span>
                  </div>
                </div>
                <button type="button" onClick={() => setToolPanel(toolPanel ? '' : 'records')} className="text-white/45 active:scale-95">⌃</button>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[11px] text-white/40">{tt('trades.marketValue', '持仓市值')}</div>
                  <div className="mt-1 text-[13px] font-normal text-white tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{currencyAmount(toNumber(summary.positionsMarketValue) * displayRate, displayCurrency, 2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-[11px] text-white/40">{tt('trades.positionPnl', '持仓盈亏')}</div>
                  <div className={`mt-1 text-[13px] font-normal tabular-nums ${pnlClass(displayHoldingPnl, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>{signedCurrency(displayHoldingPnl, displayCurrency, 2)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-white/40">{tt('trades.dailyPnl', '当日盈亏')}</div>
                  <div className={`mt-1 text-[13px] font-normal tabular-nums ${pnlClass(displayTodayPnl, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>{signedCurrency(displayTodayPnl, displayCurrency, 2)}</div>
                </div>
              </div>

              {positions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
                  <div className="text-[13px] font-normal text-white/60">{tt('trades.noPositions', '还没有持仓')}</div>
                  <button type="button" onClick={() => openTradeModal(null, 'buy')} className="mt-3 rounded-full border border-[#f6b54b]/45 px-4 py-2 text-[12px] font-normal text-[#f6b54b] active:scale-95">{tt('trades.recordFirstBuy', '记录第一笔买入')}</button>
                </div>
              ) : (
                <div className="grid grid-cols-[minmax(100px,0.72fr)_minmax(0,3.35fr)] border-t border-white/[0.06]">
                  <div>
                    <div className="px-0 pb-2 pt-3 text-[11px] font-medium leading-none text-white/36">{tt('trades.nameTicker', '名称/代码')}</div>
                    <div className="divide-y divide-white/[0.06]">
                      {positions.map((position) => {
                        const nameParts = stockNameParts(position.symbol, position.name);
                        return (
                          <button
                            key={position.symbol}
                            type="button"
                            onClick={() => openTradeModal(position, 'buy')}
                            className="flex min-h-[60px] w-full min-w-0 flex-col justify-center py-3 pr-1.5 text-left active:bg-white/[0.03]"
                          >
                            <span className="block truncate text-[13px] font-normal leading-[15px] text-white">{nameParts.title}</span>
                            <span className="mt-1 block truncate text-[11px] leading-[13px] text-white/40">{nameParts.subtitle}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="overflow-x-auto [scrollbar-width:none]">
                    <div className="min-w-[500px]">
                      <div className="grid grid-cols-[80px_76px_118px_144px_66px] gap-1 px-0 pb-2 pt-3 text-[11px] font-medium leading-none text-white/36">
                        <span className="text-left">{tt('trades.valueQty', '市值/数量')}</span>
                        <span className="text-right">{tt('trades.priceCost', '现价/成本')}</span>
                        <span className="text-right">{tt('trades.dailyPnl', '当日盈亏')}</span>
                        <span className="text-right">{tt('trades.positionPnl', '持仓盈亏')}</span>
                        <span className="text-right">{tt('trades.allocation', '占比')}</span>
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
                              onClick={() => openTradeModal(position, 'buy')}
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
                  {tt('trades.edit', '编辑')}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4">
              {todayTrades.length === 0 ? (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-8 text-center">
                  <div className="text-[13px] font-normal text-white/55">{tt('trades.noOrdersToday', '今日暂无订单')}</div>
                  <button type="button" onClick={() => openTradeModal(null, 'buy')} className="mt-3 rounded-full border border-[#f6b54b]/45 px-4 py-2 text-[12px] font-normal text-[#f6b54b] active:scale-95">{tt('trades.recordOrder', '记录订单')}</button>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {todayTrades.map((trade) => {
                    const isSell = trade.side === 'sell';
                    const amount = toNumber(trade.price) * toNumber(trade.shares) * displayRate;
                    const displayName = stockDisplayName(trade.symbol, trade.name);
                    return (
                      <button
                        key={trade.id}
                        type="button"
                        onClick={() => setOrderActionTrade(trade)}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-3 py-3 text-left active:bg-white/[0.03]"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-normal text-white">{trade.symbol}</div>
                          <div className="mt-1 text-[11px] text-white/60">{displayName}</div>
                        </div>
                        <div className="text-right">
                          <div className={`text-[13px] font-normal ${isSell ? 'text-emerald-400' : 'text-rose-400'}`}>{sideLabel(trade.side)} {sharesText(trade.shares, 0)}</div>
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
          const displayName = stockDisplayName(orderActionTrade.symbol, orderActionTrade.name);
          return (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 px-0 py-6 backdrop-blur-md"
              onClick={(e) => { if (e.target === e.currentTarget) setOrderActionTrade(null); }}
              style={{
                paddingTop: 'calc(env(safe-area-inset-top) + 24px)',
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)',
              }}
            >
              <div className="w-[calc(100vw-72px)] max-w-[360px] overflow-hidden rounded-[22px] border border-white/10 bg-[#0b0f16] shadow-[0_24px_80px_rgba(0,0,0,0.68)]">
                <div className="border-b border-white/10 px-4 pb-3 pt-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold text-white">{tt('trades.orderActions', '订单操作')}</h2>
                    <button
                      type="button"
                      onClick={() => setOrderActionTrade(null)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-[17px] text-white/45 transition hover:bg-white/[0.08] hover:text-white/70 active:scale-90"
                      aria-label={tt('trades.closeOrderActions', '关闭订单操作')}
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-normal text-white">{orderActionTrade.symbol || '--'}</div>
                        <div className="mt-1 truncate text-[11px] text-white/60">{displayName || orderActionTrade.symbol || '--'}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`text-[13px] font-normal ${isSell ? 'text-emerald-400' : 'text-rose-400'}`}>{sideLabel(orderActionTrade.side)} {sharesText(orderActionTrade.shares, 0)}</div>
                        <div className="mt-1 text-[11px] font-normal text-white/40 tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{currencyAmount(amount, displayCurrency, 2)} @ {fmtAmount(orderActionTrade.price, 2)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-4 pb-4 pt-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={editOrderFromAction}
                      className="flex h-9 items-center justify-center gap-1.5 rounded-full border border-[#f6b54b]/30 bg-[#f6b54b]/[0.045] px-2 text-[12px] font-normal text-[#f6b54b] active:scale-95"
                    >
                      <Edit3 className="h-3.5 w-3.5" strokeWidth={1.8} />
                      {tt('trades.modify', '修改')}
                    </button>
                    <button
                      type="button"
                      onClick={deleteOrderFromAction}
                      className="flex h-9 items-center justify-center gap-1.5 rounded-full border border-rose-300/20 bg-rose-400/[0.045] px-2 text-[12px] font-normal text-rose-300/85 active:scale-95"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                      {tt('trades.delete', '删除')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}


        {/* 波段记录(取代原来的"冷静室"+"日记本") */}
        {showWaveTool && (
          <div className="mx-auto mt-3 max-w-[430px] space-y-3 text-white">
            <section className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.28)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[14px] font-normal leading-tight tracking-normal text-white">
                    {tt('trades.swingLog', '波段记录')}
                  </h2>
                  <div className="mt-1 text-[10px] font-normal text-white/45">
                    {waveView === 'completed' ? tt('trades.waveCompletedSubtitle', '已完成波段归类') : tt('trades.waveActiveSubtitle', '点击波段查看明细')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openWaveTradeModal()}
                  className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-[#f6b54b]/30 bg-[#f6b54b]/10 px-3 text-[11px] font-normal text-[#f6b54b] active:scale-95"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  {tt('trades.addWaveStock', '新增波段股票')}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setWaveView('active')}
                  className={`rounded-xl border px-2 py-2.5 text-center active:scale-[0.99] ${waveView === 'active' ? 'border-rose-400/35 bg-rose-400/[0.08]' : 'border-white/10 bg-white/[0.035]'}`}
                  title={tt('trades.active', '进行中')}
                >
                  <div className="text-[16px] font-normal tabular-nums text-rose-400" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                    {calmRoomActiveCount}
                  </div>
                  <div className="mt-1 text-[10px] font-normal text-white/45">{tt('trades.active', '进行中')}</div>
                </button>
                <button
                  type="button"
                  disabled={calmRoomCompletedCount === 0}
                  onClick={openCompletedWaves}
                  className={`rounded-xl border px-2 py-2.5 text-center active:scale-[0.99] disabled:opacity-45 disabled:active:scale-100 ${waveView === 'completed' ? 'border-[#f6b54b]/40 bg-[#f6b54b]/10' : 'border-white/10 bg-white/[0.035]'}`}
                  title={tt('trades.waveCompletedSubtitle', '已完成波段归类')}
                >
                  <div className="text-[16px] font-normal tabular-nums text-white/80" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                    {calmRoomCompletedCount}
                  </div>
                  <div className="mt-1 text-[10px] font-normal text-white/45">{tt('trades.completed', '已完成')}</div>
                </button>
                <div className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-2.5 text-center">
                  <div className="text-[16px] font-normal tabular-nums text-white/80" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                    {calmRoomAvgActiveDays}
                    <span className="ml-0.5 text-[10px] font-normal text-white/45">{tt('trades.day', '天')}</span>
                  </div>
                  <div className="mt-1 text-[10px] font-normal text-white/45">{tt('trades.avgHolding', '均持有')}</div>
                </div>
              </div>
            </section>

            {waveGroups.length === 0 ? (
              <section className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4 text-center shadow-[0_16px_40px_rgba(0,0,0,0.24)]">
                <div className="text-[13px] font-normal text-white/75">{tt('trades.noWaveRecords', '暂无波段记录')}</div>
                <div className="mt-1 text-[10px] font-normal text-white/40">{tt('trades.noWaveRecordsDesc', '添加波段买入或卖出后,这里会自动显示。')}</div>
                <button
                  type="button"
                  onClick={() => openWaveTradeModal()}
                  className="mt-3 inline-flex h-8 items-center gap-1 rounded-full border border-[#f6b54b]/30 bg-[#f6b54b]/10 px-3 text-[11px] font-normal text-[#f6b54b] active:scale-95"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  {tt('trades.addWaveStock', '新增波段股票')}
                </button>
              </section>
            ) : waveView === 'completed' ? (
              completedWaveGroups.length === 0 ? (
                <section className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4 text-center shadow-[0_16px_40px_rgba(0,0,0,0.24)]">
                  <div className="text-[13px] font-normal text-white/75">{tt('trades.noCompletedWaves', '暂无已完成波段')}</div>
                  <div className="mt-1 text-[10px] font-normal text-white/40">{tt('trades.noCompletedWavesDesc', '卖出至清仓后,完成的波段会归类到这里。')}</div>
                </section>
              ) : completedWaveGroups.map(group => (
                <section key={`completed-${group.symbol}`} className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14] shadow-[0_16px_40px_rgba(0,0,0,0.26)]">
                  <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
                    <button
                      type="button"
                      onClick={() => openWaveTradeModal(group.symbol, group.name)}
                      className="min-w-0 text-left active:opacity-75"
                      title={tt('trades.addSymbolWaveTrade', '添加 {{symbol}} 波段交易', { symbol: group.symbol })}
                    >
                      <div className="text-[16px] font-normal leading-tight tabular-nums text-white" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                        {group.symbol}
                      </div>
                      <div className="mt-1 max-w-[190px] truncate text-[11px] font-normal text-white/45">
                        {group.name || group.symbol}
                      </div>
                    </button>
                    <div className="shrink-0 rounded-full border border-[#f6b54b]/25 bg-[#f6b54b]/10 px-2.5 py-1 text-[11px] font-normal text-[#f6b54b]">
                      {tt('trades.completedCount', '已完成 {{count}}', { count: group.completedWaves.length })}
                    </div>
                  </div>

                  <div className="space-y-2 p-3">
                    {group.completedWaves.map(w => {
                      const noteValue = waveNotes[w.id] || '';
                      const isEditingNote = editingNoteId === w.id;
                      const isExpanded = expandedWaves[w.id] || false;
                      const startD = (w.startDate || '').slice(5);
                      const endD = (w.endDate || '').slice(5);
                      const waveTrades = [...(w.buys || []), ...(w.sells || [])]
                        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id - b.id));

                      return (
                        <div key={w.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.025]">
                          <button
                            type="button"
                            onClick={() => setExpandedWaves({ ...expandedWaves, [w.id]: !isExpanded })}
                            className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left active:bg-white/[0.04]"
                            title={tt('trades.expandCompletedWave', '展开已完成波段明细')}
                          >
                            <span className="min-w-0">
                              <span className="block text-[12px] font-normal tabular-nums text-white/80" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {startD} → {endD}
                                <span className="ml-1 text-[10px] font-normal text-white/45">· {daysText(w.heldDays)}</span>
                              </span>
                              <span className="mt-1 block text-[10px] font-normal tabular-nums text-white/45" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                ${fmt(w.avgBuyPrice)} → ${fmt(w.avgSellPrice)}
                              </span>
                            </span>
                            <span className="text-right">
                              <span className={`block text-[15px] font-normal tabular-nums ${pnlClass(w.gainPct, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {signedPct(w.gainPct, 1)}
                              </span>
                              <span className={`block text-[10px] font-normal tabular-nums ${pnlClass(w.gainAmount, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {signedCurrency(w.gainAmount, 'USD', 0)}
                              </span>
                            </span>
                          </button>

                          <div className="px-3 pb-2.5">
                            {isEditingNote ? (
                              <input
                                type="text"
                                autoFocus
                                defaultValue={noteValue}
                                placeholder={englishMode ? 'e.g. scale out around 250' : '如:250开始陆续卖出'}
                                className="block w-full rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-normal text-white outline-none placeholder:text-white/25"
                                style={{ colorScheme: 'dark' }}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    saveWaveNote(w.id, e.target.value);
                                  } else if (e.key === 'Escape') {
                                    setEditingNoteId(null);
                                  }
                                }}
                                onBlur={(e) => {
                                  saveWaveNote(w.id, e.target.value);
                                }}
                              />
                            ) : noteValue ? (
                              <div className="flex items-start gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                                  className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left text-[11px] font-normal text-white/55 active:scale-95"
                                >
                                  {noteValue}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); saveWaveNote(w.id, ''); }}
                                  className="shrink-0 rounded-lg border border-white/10 px-2 py-0.5 text-[10px] font-normal text-white/35 active:scale-95"
                                >
                                  {tt('trades.clear', '清除')}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                                className="text-[10px] font-normal text-white/35 active:scale-95"
                              >
                                {tt('trades.addNote', '+ 加备注')}
                              </button>
                            )}
                          </div>

                          {isExpanded && (
                            <div className="border-t border-white/10 px-3 pb-3 pt-2.5">
                              <div className="mb-2 text-[10px] font-normal text-white/45">{tt('trades.tradeDetails', '交易明细')}</div>
                              <div className="space-y-1.5">
                                {waveTrades.map(t => {
                                  const isBuy = !t.side || t.side === 'buy';
                                  const amount = toNumber(t.shares) * toNumber(t.price);

                                  return (
                                    <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/15 px-2.5 py-1.5">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-normal text-white ${isBuy ? 'bg-rose-500/80' : 'bg-emerald-500/80'}`}>
                                          {sideLabel(t.side, true)}
                                        </span>
                                        <span className="shrink-0 text-[11px] font-normal tabular-nums text-white/45" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                          {(t.date || '').slice(5)}
                                        </span>
                                        <span className="truncate text-[11px] font-normal tabular-nums text-white/70" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                          {sharesText(t.shares, 0)} @${fmt(t.price)}
                                        </span>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-2">
                                        <span className={`text-[11px] font-normal tabular-nums ${isBuy ? 'text-white/70' : 'text-emerald-400'}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                          {isBuy ? '-' : '+'}${fmt(amount, 0)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); setTradeDeleteConfirmId(t.id); }}
                                          className="flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-[10px] font-normal text-white/45 active:scale-90"
                                          aria-label={tt('trades.delete', '删除')}
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
                </section>
              ))
            ) : activeWaveGroups.length === 0 ? (
              <section className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4 text-center shadow-[0_16px_40px_rgba(0,0,0,0.24)]">
                <div className="text-[13px] font-normal text-white/75">{tt('trades.noActiveWaves', '暂无进行中的波段')}</div>
                <div className="mt-1 text-[10px] font-normal text-white/40">{tt('trades.noActiveWavesDesc', '已清仓的记录请点上方“已完成”查看。')}</div>
                {calmRoomCompletedCount > 0 && (
                  <button
                    type="button"
                    onClick={openCompletedWaves}
                    className="mt-3 inline-flex h-8 items-center rounded-full border border-[#f6b54b]/30 bg-[#f6b54b]/10 px-3 text-[11px] font-normal text-[#f6b54b] active:scale-95"
                  >
                    {tt('trades.viewCompleted', '查看已完成')}
                  </button>
                )}
              </section>
            ) : activeWaveGroups.map(group => {
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
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => openWaveTradeModal(group.symbol, group.name)}
                        className="min-w-0 text-left active:opacity-75"
                        title={tt('trades.addSymbolWaveTrade', '添加 {{symbol}} 波段交易', { symbol: group.symbol })}
                      >
                        <div className="text-[16px] font-normal leading-tight tabular-nums text-white" style={{ fontFamily: TRADE_NUMBER_FONT }}>
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
                          title={tt('trades.viewAllTrades', '查看所有交易记录')}
                        >
                          {tt('trades.all', '全部')}
                        </button>
                        <button
                          type="button"
                          onClick={() => openWaveTradeModal(group.symbol, group.name)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white/65 active:scale-95"
                          title={tt('trades.addSymbolWaveTrade', '添加 {{symbol}} 波段交易', { symbol: group.symbol })}
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-2.5 text-center">
                        <div className={`text-[13px] font-normal tabular-nums ${pnlClass(totalGain, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                          {signedCurrency(totalGain, 'USD', 0)}
                        </div>
                        <div className="mt-1 text-[10px] font-normal text-white/40">{tt('trades.totalPnlMetric', '总盈亏')}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-2.5 text-center">
                        <div className="text-[13px] font-normal tabular-nums text-white/80" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                          {completedCount > 0 ? `${winRate}%` : '—'}
                        </div>
                        <div className="mt-1 text-[10px] font-normal text-white/40">
                          {tt('trades.winRate', '胜率')}{completedCount > 0 ? ` ${winCount}/${completedCount}` : ''}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-2.5 text-center">
                        <div className="text-[13px] font-normal tabular-nums text-white/80" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                          {avgHeld > 0 ? daysText(avgHeld) : '—'}
                        </div>
                        <div className="mt-1 text-[10px] font-normal text-white/40">{tt('trades.avgHolding', '均持有')}</div>
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
                      <div className="mx-4 mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.035]">
                        <button
                          type="button"
                          onClick={() => setExpandedWaves({ ...expandedWaves, [w.id]: !isExpanded })}
                          className="w-full p-3 text-left active:bg-white/[0.03]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300 animate-pulse" />
                              <div className="min-w-0">
                                <div className="text-[12px] font-normal text-white/90">{tt('trades.active', '进行中')}</div>
                                <div className="mt-1 text-[10px] font-normal tabular-nums text-white/40" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                  {tt('trades.startedDay', '{{date}} 开始 · 第 {{day}} 天', { date: startD, day: w.heldDays })}
                                </div>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-baseline gap-2">
                              <span className={`text-[19px] font-normal tabular-nums ${pnlClass(w.gainPct, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {signedPct(w.gainPct, 1)}
                              </span>
                              <span className={`text-[10px] text-white/35 transition ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-4 gap-1.5 rounded-xl border border-white/10 bg-black/15 p-2.5">
                            <div>
                              <div className="text-[10px] font-normal text-white/40">{tt('trades.avgBuy', '买入均')}</div>
                              <div className="mt-1 text-[12px] font-normal tabular-nums text-white/90" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                ${fmt(w.avgBuyPrice)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-normal text-white/40">{tt('trades.currentPrice', '现价')}</div>
                              <div className={`mt-1 text-[12px] font-normal tabular-nums ${w.currentPrice === w.avgBuyPrice ? 'text-white/90' : pnlClass(w.currentPrice - w.avgBuyPrice, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {w.currentPrice > 0 ? `$${fmt(w.currentPrice)}` : '—'}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-normal text-white/40">{tt('trades.held', '持有')}</div>
                              <div className="mt-1 text-[12px] font-normal tabular-nums text-white/90" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {sharesText(w.heldShares, 0)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-normal text-white/40">{tt('trades.floatingProfit', '浮盈')}</div>
                              <div className={`mt-1 text-[12px] font-normal tabular-nums ${pnlClass(w.gainAmount, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {signedCurrency(w.gainAmount, 'USD', 0)}
                              </div>
                            </div>
                          </div>
                        </button>

                        <div className="px-3 pb-2.5">
                          {isEditingNote ? (
                            <input
                              type="text"
                              autoFocus
                              defaultValue={noteValue}
                              placeholder={englishMode ? 'e.g. tariff panic, AI wave...' : '如:关税恐慌、新冠崩盘、AI 浪潮…'}
                              className="block w-full rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-normal text-white outline-none placeholder:text-white/25"
                              style={{ colorScheme: 'dark' }}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  saveWaveNote(w.id, e.target.value);
                                } else if (e.key === 'Escape') {
                                  setEditingNoteId(null);
                                }
                              }}
                              onBlur={(e) => {
                                saveWaveNote(w.id, e.target.value);
                              }}
                            />
                          ) : noteValue ? (
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                                className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left text-[11px] font-normal text-white/55 active:scale-95"
                              >
                                {noteValue}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); saveWaveNote(w.id, ''); }}
                                className="shrink-0 rounded-lg border border-white/10 px-2 py-0.5 text-[10px] font-normal text-white/35 active:scale-95"
                              >
                                {tt('trades.clear', '清除')}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                              className="text-[10px] font-normal text-[#f6b54b] active:scale-95"
                            >
                              {tt('trades.addNote', '+ 加备注')}
                            </button>
                          )}
                        </div>

                        {isExpanded && (
                          <div className="border-t border-white/10 px-3 pb-3 pt-2.5">
                            <div className="mb-2 text-[10px] font-normal text-white/45">{tt('trades.tradeDetails', '交易明细')}</div>
                            <div className="space-y-1.5">
                              {waveTrades.map(t => {
                                const isBuy = !t.side || t.side === 'buy';
                                const amount = toNumber(t.shares) * toNumber(t.price);

                                return (
                                  <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/15 px-2.5 py-1.5">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-normal text-white ${isBuy ? 'bg-rose-500/80' : 'bg-emerald-500/80'}`}>
                                        {sideLabel(t.side, true)}
                                      </span>
                                      <span className="shrink-0 text-[11px] font-normal tabular-nums text-white/45" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                        {(t.date || '').slice(5)}
                                      </span>
                                      <span className="truncate text-[11px] font-normal tabular-nums text-white/70" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                        {sharesText(t.shares, 0)} @${fmt(t.price)}
                                      </span>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <span className={`text-[11px] font-normal tabular-nums ${isBuy ? 'text-white/70' : 'text-emerald-400'}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                        {isBuy ? '-' : '+'}${fmt(amount, 0)}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setTradeDeleteConfirmId(t.id); }}
                                        className="flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-[10px] font-normal text-white/45 active:scale-90"
                                        aria-label={tt('trades.delete', '删除')}
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
                    <div className="mx-4 mb-4 rounded-2xl border border-white/10 bg-white/[0.025] px-3 py-3 text-[11px] font-normal text-white/40">
                      {tt('trades.noActiveWaves', '暂无进行中的波段')}
                    </div>
                  )}

                  {waveView === 'completed' && completedWaves.length > 0 && (
                    <div className="border-t border-white/10 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setExpandedWaves({ ...expandedWaves, [completedKey]: !completedOpen })}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-2.5 py-2 text-left active:bg-white/[0.045]"
                        title={tt('trades.viewCompleted', '查看已完成波段')}
                      >
                        <span className="text-[10px] font-normal text-white/75">{tt('trades.completed', '已完成')}</span>
                        <span className="flex items-center gap-2 text-[9px] font-normal text-white/40">
                          {completedWaves.length}
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
                                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2 text-left active:bg-white/[0.03]"
                                  title={tt('trades.expandCompletedWave', '展开已完成波段明细')}
                                >
                                  <span className="min-w-0">
                                    <span className="block text-[10px] font-normal tabular-nums text-white/75" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                      {startD} → {endD}
                                      <span className="ml-1 text-[9px] font-normal text-white/40">· {daysText(w.heldDays)}</span>
                                    </span>
                                    <span className="mt-0.5 block text-[9px] font-normal tabular-nums text-white/40" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                      ${fmt(w.avgBuyPrice)} → ${fmt(w.avgSellPrice)}
                                    </span>
                                  </span>
                                  <span className="text-right">
                                    <span className={`block text-[12px] font-normal tabular-nums ${pnlClass(w.gainPct, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                      {signedPct(w.gainPct, 1)}
                                    </span>
                                    <span className={`block text-[9px] font-normal tabular-nums ${pnlClass(w.gainAmount, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                      {signedCurrency(w.gainAmount, 'USD', 0)}
                                    </span>
                                  </span>
                                </button>

                                {(noteValue || isEditingNote) && (
                                  <div className="px-2.5 pb-2.5">
                                    {isEditingNote ? (
                                      <input
                                        type="text"
                                        autoFocus
                                        defaultValue={noteValue}
                                        placeholder={englishMode ? 'e.g. tariff panic, AI wave...' : '如:关税恐慌、新冠崩盘、AI 浪潮…'}
                                        className="block w-full rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[10px] font-normal text-white outline-none placeholder:text-white/25"
                                        style={{ colorScheme: 'dark' }}
                                        onClick={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            saveWaveNote(w.id, e.target.value);
                                          } else if (e.key === 'Escape') {
                                            setEditingNoteId(null);
                                          }
                                        }}
                                        onBlur={(e) => {
                                          saveWaveNote(w.id, e.target.value);
                                        }}
                                      />
                                    ) : (
                                      <div className="flex items-start gap-2">
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                                          className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left text-[10px] font-normal text-white/48 active:scale-95"
                                        >
                                          {noteValue}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); saveWaveNote(w.id, ''); }}
                                          className="shrink-0 rounded-lg border border-white/10 px-2 py-0.5 text-[9px] font-normal text-white/35 active:scale-95"
                                        >
                                          {tt('trades.clear', '清除')}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {!noteValue && !isEditingNote && (
                                  <div className="px-2.5 pb-2.5">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                                      className="text-[9px] font-normal text-white/30 active:scale-95"
                                    >
                                      {tt('trades.addNote', '+ 加备注')}
                                    </button>
                                  </div>
                                )}

                                {isExpanded && (
                                  <div className="border-t border-white/10 px-2.5 pb-2.5 pt-2.5">
                                    <div className="mb-2 text-[9px] font-normal text-white/45">{tt('trades.tradeDetails', '交易明细')}</div>
                                    <div className="space-y-1.5">
                                      {waveTrades.map(t => {
                                        const isBuy = !t.side || t.side === 'buy';
                                        const amount = toNumber(t.shares) * toNumber(t.price);

                                        return (
                                          <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-2.5 py-1.5">
                                            <div className="flex min-w-0 items-center gap-2">
                                              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-normal text-white ${isBuy ? 'bg-rose-500/80' : 'bg-emerald-500/80'}`}>
                                                {sideLabel(t.side, true)}
                                              </span>
                                              <span className="shrink-0 text-[10px] font-normal tabular-nums text-white/45" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                                {(t.date || '').slice(5)}
                                              </span>
                                              <span className="truncate text-[10px] font-normal tabular-nums text-white/70" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                                {sharesText(t.shares, 0)} @${fmt(t.price)}
                                              </span>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                              <span className={`text-[10px] font-normal tabular-nums ${isBuy ? 'text-white/70' : 'text-emerald-400'}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                                {isBuy ? '-' : '+'}${fmt(amount, 0)}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setTradeDeleteConfirmId(t.id); }}
                                                className="flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-[10px] font-normal text-white/45 active:scale-90"
                                                aria-label={tt('trades.delete', '删除')}
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
                  <h2 className={`text-[14px] text-white ${tradeEntryScope === 'wave' ? 'font-normal' : 'font-black'}`}>
                    {tradeEntryScope === 'wave' ? tt('trades.addWaveRecord', '添加波段记录') : (newTrade.id || newTrade.editingId ? tt('trades.editTrade', '修改交易') : tt('trades.addTrade', '添加交易'))}
                  </h2>
                  <button
                    onClick={() => setShowAddTrade(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/45 transition hover:bg-white/[0.08] hover:text-white/70 active:scale-90"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="min-w-0 p-3.5">
                {/* 买/卖切换 */}
                <div className="mb-3 flex min-w-0 gap-2">
                  <button
                    onClick={() => setNewTrade({ ...newTrade, side: 'buy' })}
                    className={`flex-1 rounded-xl border py-2.5 text-[12px] font-normal transition active:scale-95 ${
                      newTrade.side === 'buy'
                        ? 'border-rose-500/20 bg-rose-600 text-white shadow-[0_12px_28px_rgba(225,29,72,0.28)]'
                        : 'border-transparent bg-white/[0.055] text-white/55'
                    }`}
                  >
                    {tt('trades.buy', '买入')}
                  </button>
                  <button
                    onClick={() => setNewTrade({ ...newTrade, side: 'sell' })}
                    className={`flex-1 rounded-xl border py-2.5 text-[12px] font-normal transition active:scale-95 ${
                      newTrade.side === 'sell'
                        ? 'border-emerald-500/20 bg-emerald-600 text-white shadow-[0_12px_28px_rgba(5,150,105,0.28)]'
                        : 'border-transparent bg-white/[0.055] text-white/55'
                    }`}
                  >
                    {tt('trades.sell', '卖出')}
                  </button>
                </div>

                {/* 股票代码 + 名称 */}
                <div className="grid min-w-0 grid-cols-2 gap-2 mb-2">
                  <div className="min-w-0">
                    <label className={`${tradeModalLabelClass} flex items-center gap-1.5`}>
                      <span>{tt('trades.stockTicker', '股票代码')}</span>
                      {lookupStatus === 'loading' && (
                        <span className="inline-flex items-center gap-0.5 text-sky-300">
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                          <span>{tt('trades.lookupLoading', '查询中')}</span>
                        </span>
                      )}
                      {lookupStatus === 'found' && (
                        <span className="inline-flex items-center gap-0.5 text-emerald-300">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>{tt('trades.lookupFound', '已找到')}</span>
                        </span>
                      )}
                      {lookupStatus === 'notfound' && (
                        <span className="inline-flex items-center gap-0.5 text-amber-300">
                          <AlertCircle className="w-2.5 h-2.5" />
                          <span>{tt('trades.lookupNotFound', '未找到,可手动填')}</span>
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      placeholder={englishMode ? 'e.g. NVDA' : '如 NVDA'}
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
                    <label className={tradeModalLabelClass}>{tt('trades.nameAuto', '中文名(自动)')}</label>
                    <input
                      type="text"
                      placeholder={tt('trades.autoFill', '自动填充')}
                      value={newTrade.name}
                      onChange={(e) => setNewTrade({ ...newTrade, name: e.target.value })}
                      className={tradeModalBaseInput}
                      style={tradeModalInputStyle}
                    />
                  </div>
                </div>

                {/* 日期(独占一行) */}
                <div className="mb-2 min-w-0">
                  <label className={tradeModalLabelClass}>{tt('trades.date', '日期')}</label>
                  <input
                    type="date"
                    value={newTrade.date}
                    onChange={(e) => setNewTrade({ ...newTrade, date: e.target.value })}
                    className={`${tradeModalBaseInput} appearance-none text-center text-[12px] font-normal tabular-nums`}
                    style={{ ...tradeModalInputStyle, WebkitAppearance: 'none' }}
                  />
                </div>

                {/* 价格 + 股数(共一行) */}
                <div className="grid min-w-0 grid-cols-2 gap-2 mb-3">
                  <div className="min-w-0">
                    <label className={tradeModalLabelClass}>{tt('trades.priceAuto', '价格 ($, 自动)')}</label>
                    <input
                      type="number"
                      placeholder={tt('trades.autoFill', '自动填充')}
                      step="0.01"
                      inputMode="decimal"
                      value={newTrade.price}
                      onChange={(e) => setNewTrade({ ...newTrade, price: e.target.value })}
                      className={`${tradeModalBaseInput} tabular-nums`}
                      style={tradeModalInputStyle}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className={tradeModalLabelClass}>{tt('trades.quantity', '股数')}</label>
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

                {tradeEntryScope === 'wave' && (
                  <div className="mb-3 min-w-0">
                    <label className={tradeModalLabelClass}>{tt('trades.waveNotePlan', '波段备注/计划')}</label>
                    <textarea
                      rows={2}
                      placeholder={englishMode ? 'e.g. scale out around 250' : '如: 250开始陆续卖出'}
                      value={newTrade.note || ''}
                      onChange={(e) => setNewTrade({ ...newTrade, note: e.target.value })}
                      className={`${tradeModalBaseInput} min-h-[58px] resize-none leading-relaxed`}
                      style={tradeModalInputStyle}
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={confirmTradeSubmit}
                    disabled={tradeSubmitting}
                    className="flex-1 rounded-xl border border-emerald-300/30 bg-emerald-500/85 py-2.5 text-[12px] font-normal text-white shadow-[0_12px_32px_rgba(16,185,129,0.22)] transition active:scale-95 disabled:opacity-55 disabled:active:scale-100"
                  >
                    {tradeSubmitting ? tt('trades.saving', '保存中...') : (newTrade.id || newTrade.editingId ? tt('trades.confirmEdit', '确认修改') : tt('trades.confirmAdd', '确认添加'))}
                  </button>
                  <button onClick={() => setShowAddTrade(false)} className="flex-1 rounded-xl border border-transparent bg-white/[0.055] py-2.5 text-[12px] font-normal text-white/75 transition active:scale-95">{tt('trades.cancel', '取消')}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============ 摊薄成本计算器 ============ */}
        {showCostTool && (() => {
          const allSymbols = [...new Set(Object.keys(costBasisData).map(sym => normalizeCostBasisSymbol(sym)).filter(Boolean))];
          const normalizedActiveSymbol = normalizeCostBasisSymbol(costBasisActiveSymbol);
          const activeSymbol = normalizedActiveSymbol && allSymbols.includes(normalizedActiveSymbol)
            ? normalizedActiveSymbol
            : (allSymbols[0] || '');
          const trades = activeSymbol ? (costBasisData[activeSymbol] || []) : [];
          const stats = calcCostBasis(trades);
          const quoteStock = activeSymbol ? quoteBySymbol.get(activeSymbol) : null;
          const watchStock = activeSymbol ? watchlist.find(w => w.symbol === activeSymbol) : null;
          const currentPrice = toNumber(quoteStock?.price || watchStock?.price);
          const hasPrice = currentPrice > 0 && stats.effectiveCost > 0;
          const gainPct = hasPrice ? ((currentPrice - stats.effectiveCost) / stats.effectiveCost) * 100 : 0;
          const isUp = gainPct >= 0;
          const sortedCostTrades = [...trades].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

          return (
            <div className="mx-auto mt-3 mb-4 max-w-[430px] space-y-3 text-white" style={{ fontFamily: TRADE_FONT }}>
              <section className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.28)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[16px] font-normal leading-tight text-white">{tt('trades.averagingCost', '摊薄成本')}</h2>
                    <div className="mt-1 text-[11px] font-normal text-white/50">
                      {allSymbols.length > 0 ? tt('trades.cloudStocksCount', '{{count}} 只股 · 云端存储', { count: allSymbols.length }) : tt('trades.cloudToolNoImpact', '云端小工具 · 不影响其他模块')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setCostBasisNewSymbol(''); setShowCostBasisAdd(true); }}
                    className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-[#f6b54b]/35 bg-[#f6b54b]/10 px-3 text-[11px] font-normal text-[#f6b54b] active:scale-95"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                    {tt('trades.add', '新增')}
                  </button>
                </div>

                <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none]" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {allSymbols.map(sym => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => setCostBasisActiveSymbol(sym)}
                      className={`h-9 shrink-0 rounded-xl border px-4 text-[13px] font-normal tabular-nums transition active:scale-95 ${
                        activeSymbol === sym
                          ? 'border-[#f6b54b]/60 bg-[#f6b54b]/10 text-[#ffd18a] shadow-[0_10px_28px_rgba(246,181,75,0.12)]'
                          : 'border-white/10 bg-white/[0.055] text-white/60'
                      }`}
                      style={{ fontFamily: TRADE_NUMBER_FONT }}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </section>

              {!activeSymbol ? (
                <section className="rounded-2xl border border-white/10 bg-[#0b0f14] p-6 text-center shadow-[0_16px_40px_rgba(0,0,0,0.24)]">
                  <div className="text-[13px] font-normal text-white/75">{tt('trades.noStocks', '还没有股票')}</div>
                  <div className="mt-1 text-[10px] font-normal text-white/40">{tt('trades.noStocksDesc', '点上方新增添加第一只股票。')}</div>
                </section>
              ) : (
                <>
                  <section className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.24)]">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <div className="text-[13px] font-normal text-white/70">{tt('trades.holding', '持仓')}</div>
                      <div className="text-[15px] font-normal tabular-nums text-emerald-400" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                        {sharesText(stats.shares, 0)}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 divide-x divide-white/10">
                      <div className="min-w-0 pr-4">
                        <div className="text-[11px] font-normal text-white/50">{tt('trades.accountingAverage', '会计摊薄')}</div>
                        <div className="mt-2 text-[24px] font-normal leading-none tabular-nums text-white/90" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                          ${stats.avgCost.toFixed(2)}
                        </div>
                        <div className="mt-2 text-[11px] font-normal text-white/40">{tt('trades.movingWeightedAverage', '移动加权平均')}</div>
                      </div>
                      <div className="min-w-0 pl-4">
                        <div className="text-[11px] font-normal text-[#f6b54b]">{tt('trades.effectiveCost', '实际成本')}</div>
                        <div className="mt-2 text-[24px] font-normal leading-none tabular-nums text-[#ffd18a]" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                          ${stats.effectiveCost.toFixed(2)}
                        </div>
                        {hasPrice ? (
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-normal tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                            <span className={pnlClass(gainPct, marketColorMode)}>
                              {isUp ? '↑ +' : '↓ '}{gainPct.toFixed(2)}%
                            </span>
                            <span className="text-white/50">{tt('trades.currentPriceLabel', '现价 ${{price}}', { price: currentPrice.toFixed(2) })}</span>
                          </div>
                        ) : (
                          <div className="mt-2 text-[11px] font-normal text-white/40">{tt('trades.afterRealizedPnl', '扣除已实现盈亏')}</div>
                        )}
                      </div>
                    </div>
                  </section>

                  <div className="grid grid-cols-2 gap-2">
                    <section className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
                      <Database className="mb-3 h-6 w-6 text-white/60" strokeWidth={1.7} />
                      <div className="text-[11px] font-normal text-white/50">{tt('trades.totalInvested', '累计投入')}</div>
                      <div className="mt-2 text-[20px] font-normal tabular-nums text-white/90" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                        ${stats.totalCost.toFixed(0)}
                      </div>
                      <div className="mt-1 text-[11px] font-normal tabular-nums text-white/40" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                        {cnyEquivalentText(stats.totalCost)}
                      </div>
                    </section>
                    <section className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
                      <TrendingUp className={`mb-3 h-6 w-6 ${pnlClass(stats.realizedPnl, marketColorMode)}`} strokeWidth={1.7} />
                      <div className="text-[11px] font-normal text-white/50">{tt('trades.realizedPnl', '已实现盈亏')}</div>
                      <div className={`mt-2 text-[20px] font-normal tabular-nums ${pnlClass(stats.realizedPnl, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                        {stats.realizedPnl >= 0 ? '+' : ''}${stats.realizedPnl.toFixed(0)}
                      </div>
                      <div className="mt-1 text-[11px] font-normal tabular-nums text-white/40" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                        {cnyEquivalentText(stats.realizedPnl, true)}
                      </div>
                    </section>
                  </div>

                  <section className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.24)]">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-[13px] font-normal text-white/75">{tt('trades.tradeCountTitle', '交易记录 ({{count}})', { count: trades.length })}</div>
                      <button
                        type="button"
                        onClick={() => {
                          setCostBasisNewTrade({ type: 'buy', price: '', shares: '', date: localDateKey() });
                          setShowCostBasisTrade(true);
                        }}
                        className="flex items-center gap-1 text-[11px] font-normal text-[#f6b54b] active:scale-95"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                        {tt('trades.add', '添加')}
                      </button>
                    </div>
                    {trades.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/10 py-6 text-center text-[12px] font-normal text-white/40">{tt('trades.noCostTrades', '还没有交易, 点添加')}</div>
                    ) : (
                      (() => {
                        const sortedAsc = [...trades].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                        const tradeAvgAtSell = {};
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

                        return (
                          <div className="divide-y divide-white/[0.07]">
                            {sortedCostTrades.map(t => {
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
                              <div key={t.id}>
                                <div className="grid items-center py-2.5" style={{ gridTemplateColumns: '36px minmax(0,1fr) auto auto auto', gap: '10px' }}>
                                  <div
                                    className={`flex h-8 w-8 items-center justify-center rounded-full border text-[13px] font-normal ${isSell ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-rose-400/30 bg-rose-400/10 text-rose-300'}`}
                                  >
                                    {sideLabel(t.type, true)}
                                  </div>
                                  <div
                                    className={`min-w-0 text-[13px] ${isSell ? 'cursor-pointer' : ''}`}
                                    onClick={() => isSell && setExpandedTrades(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                                  >
                                    <div className="truncate font-normal text-white/90">{t.date} {sideLabel(t.type)} {sharesText(shares, 0)}</div>
                                    <div className="mt-0.5 text-[11px] font-normal tabular-nums text-white/50" style={{ fontFamily: TRADE_NUMBER_FONT }}>${price.toFixed(2)}/{tt('trades.shares', '股')}</div>
                                  </div>
                                  <div className={`text-right text-[13px] font-normal tabular-nums ${isSell ? 'text-emerald-400' : 'text-rose-400'}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                    {isSell ? '+' : '-'}${amount.toFixed(0)}
                                  </div>
                                  {isSell ? (
                                    <button
                                      type="button"
                                      onClick={() => setExpandedTrades(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                                      className="px-1 text-[12px] text-white/50 active:scale-95"
                                    >
                                      {isExpanded ? '▲' : '▼'}
                                    </button>
                                  ) : (
                                    <span></span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      showConfirm({
                                        title: tt('trades.deleteOneCostTradeTitle', '删除这笔交易?'),
                                        desc: tt('trades.deleteIrreversible', '此操作不可撤销'),
                                        info: `${t.date} · ${sideLabel(t.type)} ${sharesText(shares, 0)} @ $${price}`,
                                        confirmText: tt('trades.delete', '删除'),
                                        icon: '!',
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
                                    className="px-1 text-[14px] text-white/35 hover:text-rose-300 active:scale-95"
                                    title={tt('trades.delete', '删除')}
                                  >
                                    ✕
                                  </button>
                                </div>

                                {isSell && isExpanded && (
                                  <div
                                    className="mb-2 ml-11 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.045] px-3 py-3"
                                  >
                                    <div className="space-y-1 text-[11px] font-normal leading-relaxed text-emerald-100/70" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                      <div>{tt('trades.sellIncome', '卖出收入')} = {price.toFixed(2)} × {fmtAmount(shares, 0)} = <span className="text-emerald-100">${amount.toFixed(2)}</span></div>
                                      <div>{tt('trades.sellCost', '卖出成本')} = {sellAvg.toFixed(2)} × {fmtAmount(shares, 0)} = <span className="text-emerald-100">${sellCost.toFixed(2)}</span></div>
                                      <div>{tt('trades.thisProfit', '本次利润')} = {amount.toFixed(0)} - {sellCost.toFixed(0)}</div>
                                    </div>
                                    <div className={`mt-2 border-t border-emerald-400/20 pt-2 text-[15px] font-normal tabular-nums ${pnlClass(profit, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                      = {profit >= 0 ? '+' : ''}${profit.toFixed(2)} ({profit >= 0 ? '+' : ''}{profitPct.toFixed(2)}%)
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                            })}
                          </div>
                        );
                      })()
                    )}
                  </section>

                  <button
                    type="button"
                    onClick={() => {
                      const symToDelete = activeSymbol;
                      const count = trades.length;
                      showConfirm({
                        title: tt('trades.deleteSymbolTitle', '删除 {{symbol}}?', { symbol: symToDelete }),
                        desc: tt('trades.deleteSymbolDesc', '此操作不可撤销, 该股票的全部交易记录将从云端删除'),
                        info: `${symToDelete} · ${tt('trades.tradeCount', '{{count}} 笔交易', { count })}`,
                        confirmText: tt('trades.deleteAll', '全部删除'),
                        icon: '!',
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
                    className="flex w-full items-center justify-center gap-2 py-2 text-[12px] font-normal text-rose-400 active:scale-95"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                    {tt('trades.deleteWholeSymbol', '删除 {{symbol}} 整只股票', { symbol: activeSymbol })}
                  </button>
                </>
              )}
            </div>
          );
        })()}


    </>
  );
}
