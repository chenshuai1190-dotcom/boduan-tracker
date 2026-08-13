import React from 'react';
import { BookOpen, Calculator, CalendarDays, ChevronRight, Database, Edit3, Grid2X2, ListChecks, Search, Settings2, Trash2, TrendingDown, TrendingUp, Trophy, X } from 'lucide-react';
import {
  MARKET_COLOR_MODES,
  marketStrongTextClass,
  marketTextClass,
} from '../lib/marketColorMode.js';
import { splitCurrencyAmount } from '../lib/amountDisplay.js';
import { deriveHomeMarginOverview, homeMarginLeverageStatus, normalizeMarginDebtUsd } from '../lib/homeMarginRisk.js';
import { resolveHoldingDisplayPrice } from '../lib/homeMarketDisplay.js';
import { isEnglishLanguage, t } from '../lib/i18n.js';
import { derivePositionAllocation } from '../lib/investmentSummary.js';
import { normalizeStrictUserStockSymbol } from '../lib/symbols.js';
import {
  deriveTqqqMarketReference,
  deriveTqqqTradePreview,
  isTqqqFormalTradeEntry,
} from '../lib/tqqqTradeDiscipline.js';
import { formatWaveCurrencyAmount, formatWaveUsdPrice } from '../lib/waveCurrencyDisplay.js';
import ActionModalCard from '../components/ActionModalCard.jsx';
import AccountLeverageBadge from '../components/AccountLeverageBadge.jsx';
import AvailableCashEditor from '../components/AvailableCashEditor.jsx';
import StockLogo, { stockLogoCandidates } from '../components/StockLogo.jsx';
import TqqqTradeEntryPanel, { TQQQ_ACTION_TONE_CLASSES } from '../components/TqqqTradeEntryPanel.jsx';

const PORTFOLIO_CURRENCY_STORAGE_KEY = 'xmoney_portfolio_currency';
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

function splitSignedCurrencyAmount(value, currency = 'USD', digits = 2) {
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  const parts = splitCurrencyAmount(Math.abs(safeValue), currency, digits);
  return safeValue < 0 ? { ...parts, main: `-${parts.main}` } : parts;
}

function formatLeverage(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}×` : '—';
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

function formatScenarioInput(value) {
  const price = toNumber(value);
  return price > 0 ? price.toFixed(3) : '';
}

function sameScenarioPrice(left, right) {
  const a = toNumber(left);
  const b = toNumber(right);
  return a > 0 && b > 0 && Math.abs(a - b) < 0.0005;
}

function isFlatScenarioValue(value, epsilon = 0.005) {
  return Math.abs(toNumber(value)) < epsilon;
}

function isIOSLikeBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const touchPoints = Number(navigator.maxTouchPoints) || 0;
  return /iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
}

function PositionProfitScenarioSheet({
  position,
  onClose,
  tt,
  displayCurrency,
  displayRate,
  marketColorMode,
  stockNameParts,
  logoCache,
  cacheStockLogo,
}) {
  const inputRef = React.useRef(null);
  const [visualViewportFrame, setVisualViewportFrame] = React.useState(null);
  const symbol = String(position?.symbol || '').trim().toUpperCase();
  const nameParts = stockNameParts(symbol, position?.name);
  const quantity = toNumber(position?.heldShares);
  const costPrice = toNumber(position?.effectiveCost || position?.avgCost);
  const currentPrice = toNumber(position?.scenarioCurrentPrice || position?.currentPrice);
  const highPrice = toNumber(position?.high || position?.week52High);
  const [priceInput, setPriceInput] = React.useState(() => formatScenarioInput(currentPrice));

  React.useEffect(() => {
    setPriceInput(formatScenarioInput(currentPrice));
    if (isIOSLikeBrowser()) return undefined;
    const timer = window.setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [symbol, currentPrice]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !isIOSLikeBrowser() || !window.visualViewport) return undefined;
    const viewport = window.visualViewport;
    let rafId = 0;
    const updateFrame = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        setVisualViewportFrame({
          top: `${Math.max(0, viewport.offsetTop || 0)}px`,
          height: `${Math.max(320, viewport.height || window.innerHeight || 0)}px`,
        });
      });
    };
    updateFrame();
    viewport.addEventListener('resize', updateFrame);
    viewport.addEventListener('scroll', updateFrame);
    window.addEventListener('orientationchange', updateFrame);
    return () => {
      window.cancelAnimationFrame(rafId);
      viewport.removeEventListener('resize', updateFrame);
      viewport.removeEventListener('scroll', updateFrame);
      window.removeEventListener('orientationchange', updateFrame);
    };
  }, []);

  const inputPrice = Number.parseFloat(String(priceInput).replace(/,/g, ''));
  const validPrice = Number.isFinite(inputPrice) && inputPrice > 0;
  const canCalculate = validPrice && quantity > 0 && costPrice > 0 && currentPrice > 0;
  const marketValue = canCalculate ? inputPrice * quantity * displayRate : 0;
  const profit = canCalculate ? (inputPrice - costPrice) * quantity * displayRate : 0;
  const profitRate = canCalculate ? (inputPrice - costPrice) / costPrice : 0;
  const deltaFromCurrent = canCalculate ? (inputPrice - currentPrice) * quantity * displayRate : 0;
  const deltaRateFromCurrent = canCalculate ? (inputPrice - currentPrice) / currentPrice : 0;
  const profitPerDollar = quantity * displayRate;
  const resultTone = profit > 0 ? 'profit' : profit < 0 ? 'loss' : 'flat';
  const resultClass = resultTone === 'flat' ? 'text-[#f6b54b]' : strongPnlClass(profit, marketColorMode);
  const deltaClass = deltaFromCurrent === 0 ? 'text-white/50' : pnlClass(deltaFromCurrent, marketColorMode);
  const scenarioSignedCurrency = (value) => (
    isFlatScenarioValue(value) ? currencyAmount(0, displayCurrency, 2) : signedCurrency(value, displayCurrency, 2)
  );
  const scenarioSignedPct = (value) => (
    Math.abs(toNumber(value)) < 0.000001 ? '0.00%' : signedPct(value, 2)
  );
  const markerGlowRgb = '246 181 75';
  const shortcutTargets = [
    { id: 'current', label: tt('trades.scenarioCurrent', '当前价'), value: currentPrice, disabled: currentPrice <= 0 },
    { id: 'cost', label: tt('trades.scenarioCost', '成本价'), value: costPrice, disabled: costPrice <= 0 },
    { id: 'high', label: tt('trades.scenarioWeek52High', '52周高'), value: highPrice, disabled: highPrice <= 0 },
    { id: 'plus5', label: '+5%', value: currentPrice > 0 ? currentPrice * 1.05 : 0, disabled: currentPrice <= 0 },
    { id: 'minus5', label: '-5%', value: currentPrice > 0 ? currentPrice * 0.95 : 0, disabled: currentPrice <= 0 },
  ];
  const pricePoints = [costPrice, currentPrice, validPrice ? inputPrice : currentPrice].filter((value) => value > 0);
  const minPoint = pricePoints.length ? Math.min(...pricePoints) : 0;
  const maxPoint = pricePoints.length ? Math.max(...pricePoints) : 1;
  const span = Math.max(maxPoint - minPoint, maxPoint * 0.02, 1);
  const low = minPoint - span * 0.08;
  const high = maxPoint + span * 0.08;
  const range = Math.max(high - low, 1);
  const pointLeftPct = (value) => Math.min(100, Math.max(0, ((value - low) / range) * 100));
  const pointLeft = (value) => `${pointLeftPct(value)}%`;
  const pricePositionLaneGapPct = 24;
  const simulatedMatchesCurrent = validPrice && currentPrice > 0 && sameScenarioPrice(inputPrice, currentPrice);
  const pricePositionItems = [
    { id: 'cost', label: tt('trades.scenarioCost', '成本价'), value: costPrice, tone: 'static', order: 0 },
    { id: 'current', label: tt('trades.scenarioCurrent', '当前价'), value: currentPrice, tone: 'current', order: 1 },
    simulatedMatchesCurrent ? null : { id: 'simulated', label: tt('trades.scenarioSimulated', '模拟价'), value: validPrice ? inputPrice : currentPrice, tone: 'static', order: 2 },
  ]
    .filter(Boolean)
    .filter((item) => item.value > 0)
    .map((item) => ({ ...item, leftPct: pointLeftPct(item.value), left: pointLeft(item.value) }));
  const pricePositionLabels = (() => {
    const laneLastPct = [];
    return [...pricePositionItems]
      .sort((a, b) => (a.leftPct - b.leftPct) || (a.order - b.order))
      .map((item) => {
        let lane = laneLastPct.findIndex((lastPct) => item.leftPct - lastPct >= pricePositionLaneGapPct);
        if (lane < 0) lane = laneLastPct.length;
        laneLastPct[lane] = item.leftPct;
        const edge = item.leftPct <= 12 ? 'left' : item.leftPct >= 88 ? 'right' : 'center';
        return { ...item, lane, edge };
      });
  })();
  const pricePositionLabelHeight = Math.max(24, 24 + Math.max(0, ...pricePositionLabels.map((item) => item.lane)) * 22);
  const currentPositionItem = pricePositionItems.find((item) => item.id === 'current');
  const cachedLogoUrl = logoCache?.[symbol]?.url;
  const logoUrls = stockLogoCandidates(symbol, cachedLogoUrl);
  const dialogStyle = visualViewportFrame
    ? {
        top: visualViewportFrame.top,
        height: visualViewportFrame.height,
      }
    : undefined;
  const panelStyle = visualViewportFrame
    ? { maxHeight: 'min(72dvh, calc(100% - env(safe-area-inset-top) - 0.75rem))' }
    : undefined;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[170] flex h-[100dvh] items-end justify-center bg-black/60 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-md"
      style={dialogStyle}
      role="dialog"
      aria-modal="true"
      aria-label={tt('trades.scenarioTitle', '持仓收益试算')}
    >
      <style>{`
        @keyframes scenario-marker-breathe {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgb(var(--scenario-marker-glow) / 0.2), 0 0 8px rgb(var(--scenario-marker-glow) / 0.28);
          }
          50% {
            transform: scale(1.34);
            box-shadow: 0 0 0 6px rgb(var(--scenario-marker-glow) / 0.12), 0 0 16px rgb(var(--scenario-marker-glow) / 0.42);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .scenario-marker-breathe {
            animation: none !important;
          }
        }
        .scenario-marker-breathe {
          animation: scenario-marker-breathe 3.2s ease-in-out infinite;
        }
      `}</style>
      <div className="flex max-h-[72dvh] w-full max-w-[410px] flex-col rounded-[24px] border border-white/10 bg-[#0b0f14] p-5 text-white shadow-[0_-24px_70px_rgba(0,0,0,0.5)]" style={panelStyle}>
        <div className="flex items-start gap-3">
          <StockLogo symbol={symbol} urls={logoUrls} onLogoLoad={cacheStockLogo} className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[14px] font-normal leading-none text-white">{symbol || '--'}</span>
              <span className="truncate text-[13px] leading-none text-white/62">{nameParts.title !== symbol ? nameParts.title : nameParts.subtitle}</span>
            </div>
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] leading-none text-white/42">
              <span className="tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{fmtAmount(quantity, 0)}{tt('trades.shares', '股')}</span>
              <span>{tt('trades.scenarioCostPrice', '成本价')} ${fmtAmount(costPrice, 3)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/58 active:scale-95" aria-label={tt('trades.closeScenario', '关闭持仓收益试算')}>
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
          <label className="text-[11px] font-normal uppercase tracking-normal text-white/48" htmlFor={`scenario-price-${symbol}`}>
            {tt('trades.scenarioInputTitle', '模拟股价 USD')}
          </label>
          <div className="mt-2 flex h-14 items-center rounded-xl border border-white/10 bg-white/[0.045] px-3.5 focus-within:border-[#f6b54b]/55 focus-within:bg-white/[0.07]">
            <span className="mr-2 text-[18px] font-normal text-[#f6b54b]">$</span>
            <input
              ref={inputRef}
              id={`scenario-price-${symbol}`}
              value={priceInput}
              onChange={(event) => setPriceInput(event.target.value)}
              inputMode="decimal"
              enterKeyHint="done"
              className="block h-full min-w-0 flex-1 bg-transparent text-[24px] font-normal leading-none text-white outline-none placeholder:text-white/20 tabular-nums"
              style={{ fontFamily: TRADE_NUMBER_FONT }}
              placeholder="0.000"
              aria-label={tt('trades.scenarioInputTitle', '模拟股价 USD')}
            />
            {priceInput ? (
              <button type="button" onClick={() => setPriceInput('')} className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.06] text-white/35 active:scale-95" aria-label={tt('trades.clear', '清除')}>
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-5 gap-2">
            {shortcutTargets.map((item) => {
              const active = sameScenarioPrice(priceInput, item.value);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => setPriceInput(formatScenarioInput(item.value))}
                  className={`h-[34px] rounded-lg border px-1 text-[11px] font-normal active:scale-95 disabled:opacity-35 ${
                    active
                      ? 'border-[#f6b54b]/55 bg-[#f6b54b]/16 text-[#ffd18a]'
                      : 'border-white/10 bg-white/[0.035] text-white/58'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {!canCalculate ? (
            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-5 text-center text-[13px] font-normal text-white/55">
              {tt('trades.scenarioInvalidPrice', '请输入有效价格')}
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="border-b border-white/[0.07] pb-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] text-white/42">{tt('trades.scenarioProjectedPnl', '预计持仓盈亏')}</div>
                    <div className={`mt-1 text-[25px] font-normal leading-none tabular-nums ${resultClass}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                      {scenarioSignedCurrency(profit)}
                    </div>
                  </div>
                  <div className={`pb-0.5 text-[14px] font-normal tabular-nums ${resultClass}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                    {scenarioSignedPct(profitRate)}
                  </div>
                </div>
              </div>

              <div className="border-b border-white/[0.07] pb-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] text-white/42">{tt('trades.scenarioDeltaCurrent', '较当前价变化')}</div>
                    <div className={`mt-1 text-[20px] font-normal leading-none tabular-nums ${deltaClass}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                      {scenarioSignedCurrency(deltaFromCurrent)}
                    </div>
                  </div>
                  <div className={`pb-0.5 text-[14px] font-normal tabular-nums ${deltaClass}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                    {scenarioSignedPct(deltaRateFromCurrent)}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-white/42">{tt('trades.scenarioPricePosition', '价格位置')}</div>
                <div className="relative mt-2" style={{ height: `${pricePositionLabelHeight}px` }}>
                  {pricePositionLabels.map((item) => {
                    const edgeClass = item.edge === 'left'
                      ? 'translate-x-0 text-left'
                      : item.edge === 'right'
                        ? '-translate-x-full text-right'
                        : '-translate-x-1/2 text-center';
                    const left = item.edge === 'left' ? '0%' : item.edge === 'right' ? '100%' : item.left;
                    return (
                      <div
                        key={`${item.id}-label`}
                        data-price-position-label={item.id}
                        className={`absolute w-[76px] text-[10px] leading-tight text-white/45 ${edgeClass}`}
                        style={{ left, top: `${item.lane * 22}px` }}
                      >
                        <div>{item.label}</div>
                        <div className="tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>${fmtAmount(item.value, 3)}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="relative mt-2 h-4">
                  <div className="absolute left-1 right-1 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-emerald-400 via-[#f6b54b] to-[#ff4b1f]" />
                  {pricePositionItems.filter((item) => item.id !== 'current').map((item) => (
                    <span key={`${item.id}-marker`} data-price-position-marker={item.id} className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/65 bg-[#0b0f14]" style={{ left: item.left }} />
                  ))}
                  {currentPositionItem ? (
                    <span data-price-position-marker="current" className="scenario-marker-anchor pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: currentPositionItem.left, '--scenario-marker-glow': markerGlowRgb }} aria-hidden="true">
                      <span className="scenario-marker-breathe block h-[9px] w-[9px] rounded-full border border-[#ffd166]/95 bg-[#f6b54b]" />
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                  <div className="text-[11px] text-white/42">{tt('trades.scenarioMarketValue', '持仓市值')}</div>
                  <div className="mt-1 text-[15px] font-normal text-white/86 tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{currencyAmount(marketValue, displayCurrency, 2)}</div>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                  <div className="text-[11px] text-white/42">{tt('trades.scenarioPerDollar', '每涨跌 $1')}</div>
                  <div className="mt-1 text-[15px] font-normal text-white/86 tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{currencyAmount(profitPerDollar, displayCurrency, 2)}</div>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default function TradesTab({ ctx, initialToolPanel = '' }) {
  const {
    availableCashStatus,
    availableCashStatusReady = false,
    addTrade,
    AlertCircle,
    calcCostBasis,
    cacheStockLogo,
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
    logoCache,
    lookupStatus,
    marginStatus,
    marginStatusReady = true,
    marketColorMode,
    newTrade,
    openStockDetail,
    openPnlReport,
    openHomeMarginRisk,
    openWaveTracker,
    openCommunityCompetition,
    portfolioCurrencyMode,
    Plus,
    qqqSignalQuote,
    quoteRows,
    RefreshCw,
    requestDeleteLegacyTrade,
    saveAvailableCash,
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
    setPortfolioCurrencyMode,
    setShowAddTrade,
    setShowCostBasisAdd,
    setShowCostBasisTrade,
    setTradeEntryScope,
    setWaveNotes,
    showAddTrade,
    showConfirm,
    stockTrades,
    displayStockName,
    tradeEntryScope,
    tradeSubmitting,
    trades,
    usdRate,
    vix,
    vixDataDate,
    watchlist,
    waveNotes,
    wavesByStock,
  } = ctx;

  const [fallbackCurrencyMode, setFallbackCurrencyMode] = React.useState(() => {
    try {
      const shared = localStorage.getItem(PORTFOLIO_CURRENCY_STORAGE_KEY);
      if (shared === 'USD' || shared === 'CNY') return shared;
      return localStorage.getItem(TRADE_CURRENCY_STORAGE_KEY) === 'USD' ? 'USD' : 'CNY';
    } catch {
      return 'CNY';
    }
  });
  const currencyMode = portfolioCurrencyMode === 'USD' || portfolioCurrencyMode === 'CNY' ? portfolioCurrencyMode : fallbackCurrencyMode;
  const setCurrencyMode = React.useCallback((nextMode) => {
    const normalized = nextMode === 'USD' ? 'USD' : 'CNY';
    setFallbackCurrencyMode(normalized);
    if (typeof setPortfolioCurrencyMode === 'function') setPortfolioCurrencyMode(normalized);
  }, [setPortfolioCurrencyMode]);
  const [mainView, setMainView] = React.useState('positions');
  const [toolPanel, setToolPanel] = React.useState(initialToolPanel);
  const [allTradesModal, setAllTradesModal] = React.useState(null);
  const [showAllToolsModal, setShowAllToolsModal] = React.useState(false);
  const [colorMenuOpen, setColorMenuOpen] = React.useState(false);
  const [orderActionTrade, setOrderActionTrade] = React.useState(null);
  const [scenarioPosition, setScenarioPosition] = React.useState(null);
  const [showAvailableCashEditor, setShowAvailableCashEditor] = React.useState(false);
  const [waveView, setWaveView] = React.useState('active');
  const orderActionOpen = !!orderActionTrade;
  const scenarioOpen = !!scenarioPosition;

  React.useEffect(() => {
    try {
      localStorage.setItem(PORTFOLIO_CURRENCY_STORAGE_KEY, currencyMode);
      localStorage.setItem(TRADE_CURRENCY_STORAGE_KEY, currencyMode);
    } catch {}
  }, [currencyMode]);

  React.useEffect(() => {
    if ((!showAddTrade && !orderActionOpen && !scenarioOpen) || typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    const scrollY = window.scrollY || window.pageYOffset || 0;
    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    const previous = {
      bodyOverflow: bodyStyle.overflow,
      bodyPosition: bodyStyle.position,
      bodyTop: bodyStyle.top,
      bodyLeft: bodyStyle.left,
      bodyRight: bodyStyle.right,
      bodyWidth: bodyStyle.width,
      htmlOverflow: htmlStyle.overflow,
      htmlOverscrollBehavior: htmlStyle.overscrollBehavior,
    };

    bodyStyle.overflow = 'hidden';
    bodyStyle.position = 'fixed';
    bodyStyle.top = `-${scrollY}px`;
    bodyStyle.left = '0';
    bodyStyle.right = '0';
    bodyStyle.width = '100%';
    htmlStyle.overflow = 'hidden';
    htmlStyle.overscrollBehavior = 'none';

    return () => {
      bodyStyle.overflow = previous.bodyOverflow;
      bodyStyle.position = previous.bodyPosition;
      bodyStyle.top = previous.bodyTop;
      bodyStyle.left = previous.bodyLeft;
      bodyStyle.right = previous.bodyRight;
      bodyStyle.width = previous.bodyWidth;
      htmlStyle.overflow = previous.htmlOverflow;
      htmlStyle.overscrollBehavior = previous.htmlOverscrollBehavior;
      window.scrollTo(0, scrollY);
    };
  }, [showAddTrade, orderActionOpen, scenarioOpen]);

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
  const displayCurrencyLabel = currencyMode === 'CNY' ? 'CNY' : 'USD';
  const displayRate = currencyMode === 'CNY' ? rate : 1;
  const signedWaveCurrencyAmount = (value, digits = 2) => formatWaveCurrencyAmount(value, {
    currency: displayCurrency,
    rate: displayRate,
    digits,
    signed: true,
  });
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
  const tradeModalBaseInput = 'block w-full max-w-full min-w-0 box-border rounded-xl border border-transparent bg-white/[0.06] px-3.5 py-2.5 text-[14px] text-white outline-none transition placeholder:text-white/[0.28] focus:border-[#f6b54b]/45 focus:bg-white/[0.085]';
  const tradeModalLabelClass = 'mb-1.5 block text-[12px] font-normal text-white/[0.62]';
  const availableCashIsSet = Boolean(availableCashStatus?.isSet);
  const availableCashUsd = availableCashStatusReady && Number.isFinite(Number(availableCashStatus?.availableCashUsd))
    ? Math.max(0, Number(availableCashStatus.availableCashUsd))
    : 0;
  const displayAvailableCash = availableCashUsd * displayRate;
  const availableCashWriteReady = availableCashStatusReady && availableCashStatus?.writeReady === true;
  const marginDebtUsd = normalizeMarginDebtUsd(marginStatus?.currentMargin);
  const assetStatusReady = marginStatusReady && availableCashStatusReady;
  const marginOverview = React.useMemo(() => deriveHomeMarginOverview({
    totalAssetsUsd: summary.totalAssetsUsd,
    marginDebtUsd,
  }), [marginDebtUsd, summary.totalAssetsUsd]);
  const marginLeverageStatus = React.useMemo(() => homeMarginLeverageStatus(marginOverview), [marginOverview]);
  const displayAssets = toNumber(summary.totalAssetsUsd) * displayRate;
  const displayNetAssets = marginOverview.netAssetsUsd * displayRate;
  const displayMarginDebt = marginOverview.marginDebtUsd * displayRate;
  const displayAssetMoney = splitSignedCurrencyAmount(displayNetAssets, displayCurrency, 2);
  const hasTodayPnl = summary.hasTodayPnl !== false;
  const displayTodayPnl = hasTodayPnl ? toNumber(summary.todayPnl) * displayRate : null;
  const displayCumulativePnl = toNumber(summary.cumulativePnl) * displayRate;
  const displayHoldingPnl = toNumber(summary.holdingPnl ?? summary.unrealizedPnl) * displayRate;
  const todayKey = localDateKey();
  const todayTradeSummary = React.useMemo(() => {
    const rows = [];
    let buys = 0;
    let sells = 0;
    (stockTrades || []).forEach((trade) => {
      if (trade.date !== todayKey) return;
      rows.push(trade);
      if (trade.side === 'sell') sells += 1;
      else buys += 1;
    });
    return { rows, buys, sells };
  }, [stockTrades, todayKey]);
  const todayTrades = todayTradeSummary.rows;
  const todayBuys = todayTradeSummary.buys;
  const todaySells = todayTradeSummary.sells;
  const ledgerTradeRecords = React.useMemo(() => [...(stockTrades || [])].sort((a, b) => (
    (b.date || '').localeCompare(a.date || '') || String(b.id || '').localeCompare(String(a.id || ''))
  )), [stockTrades]);
  const showWaveTool = toolPanel === 'waves';
  const showCostTool = toolPanel === 'cost';
  const showTradeRecordsTool = toolPanel === 'records';
  const showMainLedger = !showWaveTool && !showCostTool;
  const isTqqqTradeEntry = isTqqqFormalTradeEntry({
    symbol: newTrade?.symbol,
    scope: tradeEntryScope,
  });
  const tqqqTradePreview = React.useMemo(() => deriveTqqqTradePreview({
    stockTrades,
    quoteRows,
    cashUsd: summary.cashUsd,
    usdRate: summary.usdRate || usdRate,
    currentSummary: summary,
    draft: newTrade,
    scope: tradeEntryScope,
  }), [newTrade, quoteRows, stockTrades, summary, tradeEntryScope, usdRate]);
  const tqqqMarketReference = React.useMemo(() => deriveTqqqMarketReference({
    vix,
    vixDataDate,
    qqqQuote: qqqSignalQuote || quoteBySymbol.get('QQQ') || null,
  }), [qqqSignalQuote, quoteBySymbol, vix, vixDataDate]);
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
  const waveGroups = React.useMemo(() => (Array.isArray(wavesByStock) ? wavesByStock : []), [wavesByStock]);
  const activeWaveGroups = React.useMemo(() => waveGroups.filter(group => group.activeWave), [waveGroups]);
  const completedWaveGroups = React.useMemo(() => waveGroups
    .map(group => ({ ...group, completedWaves: (group.waves || []).filter(w => !w.isActive) }))
    .filter(group => group.completedWaves.length > 0), [waveGroups]);
  const colorModeOptions = [
    { id: MARKET_COLOR_MODES.GREEN_UP_RED_DOWN, label: tt('trades.greenUpRedDown', '绿涨红跌'), upClass: 'bg-emerald-400', downClass: 'bg-[#ff4b1f]' },
    { id: MARKET_COLOR_MODES.RED_UP_GREEN_DOWN, label: tt('trades.redUpGreenDown', '绿跌红涨'), upClass: 'bg-[#ff4b1f]', downClass: 'bg-emerald-400' },
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

  const openPositionScenario = React.useCallback((position, displayCurrentPrice = null) => {
    if (!position) return;
    const currentPrice = toNumber(displayCurrentPrice) || toNumber(position.currentPrice);
    setScenarioPosition({
      ...position,
      scenarioCurrentPrice: currentPrice,
    });
  }, []);

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

  const confirmTradeSubmit = (sideOverride = newTrade.side || 'buy') => {
    if (tradeSubmitting) return;
    const tradeDraft = { ...newTrade, side: sideOverride };
    const isWaveEntry = tradeEntryScope === 'wave';
    const noticePrice = Number(tradeDraft.price) > 0 && isWaveEntry
      ? formatWaveUsdPrice(tradeDraft.price)
      : (tradeDraft.price || '--');
    if (!tradeDraft.symbol || !tradeDraft.price || !tradeDraft.shares) {
      showTradeFormNotice(
        tt('trades.requiredTitle', '请填写完整信息'),
        tt('trades.requiredDesc', '股票代码、价格和股数都是必填项。'),
        `${tradeDraft.symbol || '--'} · ${noticePrice} · ${tradeDraft.shares || '--'}`
      );
      return;
    }
    const symbol = normalizeStrictUserStockSymbol(tradeDraft.symbol);
    if (!symbol) {
      showTradeFormNotice(
        tt('trades.invalidSymbolTitle', '股票代码格式不正确'),
        tt('trades.invalidSymbolDesc', '请输入正确的股票代码,不要包含空格或特殊字符。'),
        tradeDraft.symbol || '--'
      );
      return;
    }
    const shares = Number(tradeDraft.shares) || 0;
    const price = Number(tradeDraft.price) || 0;
    const confirmationPrice = price > 0
      ? (isWaveEntry ? formatWaveUsdPrice(price) : price.toFixed(2))
      : '--';
    if (shares <= 0 || price <= 0) {
      showTradeFormNotice(
        tt('trades.positiveTitle', '价格和股数需要大于 0'),
        tt('trades.positiveDesc', '请检查输入后再提交。'),
        `${symbol || '--'} · ${sharesText(shares, 0)} @ ${confirmationPrice}`
      );
      return;
    }
    const tqqqValidation = deriveTqqqTradePreview({
      stockTrades,
      quoteRows,
      cashUsd: summary.cashUsd,
      usdRate: summary.usdRate || usdRate,
      currentSummary: summary,
      draft: { ...tradeDraft, symbol },
      scope: tradeEntryScope,
    });
    if (tqqqValidation.applies && tqqqValidation.hardBlocked) {
      if (tqqqValidation.blockReason === 'whole-shares-required') {
        showTradeFormNotice(
          tt('trades.tqqq.wholeSharesTitle', 'TQQQ股数需要填写整数'),
          tt('trades.tqqq.wholeSharesDesc', '正式交易当前按整数股保存,请删除小数后再提交。')
        );
      } else if (tqqqValidation.blockReason === 'oversell') {
        showTradeFormNotice(
          tt('trades.tqqq.oversellTitle', '卖出股数超过可卖数量'),
          tt('trades.tqqq.oversellDesc', 'TQQQ卖出会按正式交易账本完整预演,不能超过该交易日期可安全卖出的股数。'),
          tt('trades.tqqq.availableShares', '可卖 {{shares}} 股', { shares: fmtAmount(tqqqValidation.availableShares, 0) })
        );
      } else if (tqqqValidation.blockReason === 'ledger-oversell') {
        showTradeFormNotice(
          tt('trades.tqqq.ledgerConflictTitle', '本次修改会造成TQQQ账本超卖'),
          tt('trades.tqqq.ledgerConflictDesc', '修改这笔买入后,后续正式卖出将超过当时可卖股数。请保留足够股数或调整交易日期。')
        );
      }
      return;
    }
    const tqqqOverLimitWarning = tqqqValidation.applies
      && tradeDraft.side === 'buy'
      && tqqqValidation.overLimit;
    const tqqqAllocationUnavailableWarning = tqqqValidation.applies
      && tradeDraft.side === 'buy'
      && tqqqValidation.allocationUnavailable;
    const currentSideLabel = sideLabel(tradeDraft.side);
    let confirmTitle = tradeDraft.id || tradeDraft.editingId
      ? tt('trades.confirmLedgerEditTitle', '确认修改正式交易?')
      : tt('trades.confirmLedgerSaveTitle', '确认保存正式交易?');
    let confirmDesc = tt('trades.confirmLedgerSaveDesc', '这笔记录会同步正式主交易账本,并影响持仓、当日订单和盈亏。');
    let confirmText = tt('trades.confirmSave', '确认保存');
    if (isWaveEntry) {
      confirmTitle = tt('trades.confirmWaveSaveTitle', '确认保存到波段记录?');
      confirmDesc = tt('trades.confirmWaveSaveDesc', '这笔记录只会进入波段记录独立账本,不会进入正式持仓、当日订单或总资产计算。');
    } else if (tqqqOverLimitWarning) {
      confirmTitle = tt('trades.tqqq.confirmOverLimitTitle', '买入后超过10%提醒线,仍要继续?');
      confirmDesc = tt('trades.tqqq.confirmOverLimitDesc', '10%仅作为仓位纪律提醒,不会强制限制你的买入。确认后仍会写入正式交易账本。');
      confirmText = tt('trades.tqqq.confirmAnyway', '仍然买入');
    } else if (tqqqAllocationUnavailableWarning) {
      confirmTitle = tt('trades.tqqq.confirmUnavailableTitle', '当前无法计算10%提醒,仍要继续?');
      confirmDesc = tt('trades.tqqq.confirmUnavailableDesc', '当前估值未就绪,暂时不能显示10%提醒结果。这不会限制你的自主买入,确认后仍会写入正式交易账本。');
      confirmText = tt('trades.tqqq.confirmAnyway', '仍然买入');
    }
    setNewTrade(current => ({ ...current, side: tradeDraft.side }));
    showConfirm({
      title: confirmTitle,
      desc: confirmDesc,
      info: `${symbol || '--'} · ${currentSideLabel} ${sharesText(shares, 0)} @ ${confirmationPrice}`,
      confirmText,
      confirmStyle: 'primary',
      icon: 'check',
      onConfirm: async () => {
        await addTrade(tradeDraft.side);
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
        <section className="overflow-hidden rounded-2xl border border-transparent bg-[#0b0c0e] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06),inset_1px_0_0_rgba(255,255,255,0.03),inset_-1px_0_0_rgba(255,255,255,0.03),inset_0_-1px_0_rgba(255,255,255,0.01)]" data-trades-net-assets-card="true">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-[14px] font-normal text-white/70">{tt('home.netAssets', '净资产')} ({displayCurrencyLabel}) <span className="ml-1 text-white/50">◎</span></div>
            <div className="ml-auto flex justify-end">
              <div className="flex rounded-full border border-white/10 bg-black/20 p-0.5">
                {['USD', 'CNY'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setCurrencyMode(mode)}
                    className={`h-7 rounded-full px-2.5 text-[11px] font-normal active:scale-95 ${currencyMode === mode ? 'bg-[#f6b54b] text-[#101318]' : 'text-white/45'}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={fetchRealtimePrices}
                disabled={fetching}
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${fetching ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="mt-3 overflow-hidden text-ellipsis whitespace-nowrap font-normal leading-none tracking-normal text-white/[0.95] tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT, fontSize: 'clamp(28px, 8.7vw, 34px)' }}>
            {assetStatusReady ? (
              <>
                <span>{displayAssetMoney.main}</span>
                <span className="ml-0.5 align-baseline text-[20px] font-normal leading-none text-white/[0.95]">{displayAssetMoney.decimal}</span>
              </>
            ) : (
              <span className="text-white/30">--</span>
            )}
          </div>
          <div className="mt-3 grid min-w-0 grid-cols-[1fr_1.12fr_0.96fr] items-center text-white/[0.42]" data-trades-total-assets="true">
            <div className="col-span-2 flex min-w-0 items-center gap-1 pr-3">
              <span className="text-[13px]">{tt('trades.totalAssets', '总资产')}</span>
              <span className="truncate text-[12px] text-white/[0.72] tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                {assetStatusReady ? `${displayCurrency === 'CNY' ? '¥' : '$'}${fmtAmount(displayAssets, 2)}` : '--'}
              </span>
            </div>
            <div className="col-start-3 flex min-w-0 justify-end">
              <button
                type="button"
                disabled={!availableCashWriteReady}
                onClick={() => setShowAvailableCashEditor(true)}
                className="flex w-max min-w-full max-w-none shrink-0 items-center gap-1 overflow-visible pl-3 text-left transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-45"
                aria-label={tt('home.availableCashBalance', '设置可用现金')}
                data-trades-available-cash-trigger="true"
              >
                <span className="shrink-0 whitespace-nowrap text-[13px]">{tt('home.cash', '现金')}</span>
                <span className="shrink-0 whitespace-nowrap text-[12px] text-white/[0.72] tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                  {availableCashStatusReady
                    ? currencyAmount(displayAvailableCash, displayCurrency, availableCashIsSet ? 2 : 0)
                    : '--'}
                </span>
              </button>
            </div>
          </div>

          <div
            className="mt-4 grid grid-cols-[1fr_1.12fr_0.96fr] border-t border-white/[0.07] pt-4"
          >
            <div className="min-w-0 pr-3">
              <div className="text-[13px] text-white/50">{tt('trades.todayPnl', '今日盈亏')}</div>
              <div className={`mt-2 whitespace-nowrap ${pnlAmountClass} font-normal leading-tight tabular-nums ${pnlClass(hasTodayPnl ? displayTodayPnl : 0, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                {hasTodayPnl ? signedCurrency(displayTodayPnl, displayCurrency, 2) : '--'}
              </div>
              <div className={`mt-1 flex min-w-0 flex-wrap items-center gap-x-1 text-[12px] font-normal tabular-nums ${pnlClass(hasTodayPnl ? displayTodayPnl : 0, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                <span>{hasTodayPnl ? signedPct(summary.todayPnlPct, 2) : '--'}</span>
                {hasTodayPnl && summary.todayPnlLocked && (
                  <span className="text-[11px] text-[#6f7785]">{tt('trades.pnlLocked', '收盘锁定')}</span>
                )}
              </div>
            </div>
            <button type="button" onClick={openPnlReport} className="block min-w-0 px-3 text-left transition active:scale-[0.99]">
              <div className="flex items-center gap-0.5 text-[13px] text-white/50">
                <span>{tt('trades.totalPnl', '累计盈亏')}</span>
                <ChevronRight className="h-3 w-3 text-white/[0.28]" />
              </div>
              <div className={`mt-2 whitespace-nowrap ${pnlAmountClass} font-normal leading-tight tabular-nums ${pnlClass(displayCumulativePnl, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                {signedCurrency(displayCumulativePnl, displayCurrency, 2)}
              </div>
              <div className={`mt-1 text-[12px] font-normal tabular-nums ${pnlClass(displayCumulativePnl, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                {signedPct(summary.cumulativePnlPct, 2)}
              </div>
            </button>
            <button
              type="button"
              disabled={!assetStatusReady}
              onClick={openHomeMarginRisk}
              className="block min-w-0 pl-3 text-left transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-45"
              data-trades-margin-trigger="true"
            >
              <div className="flex items-center gap-0.5 text-[13px] text-white/50">
                <span>{tt('home.marginDebt', '融资负债')}</span>
                <ChevronRight className="h-3 w-3 text-white/[0.28]" />
              </div>
              <div className={`mt-2 truncate ${englishMode ? 'text-[11px]' : 'text-[12px]'} font-normal leading-tight text-white/90 tabular-nums`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                {marginStatusReady ? `${displayCurrency === 'CNY' ? '¥' : '$'}${fmtAmount(displayMarginDebt, 2)}` : '--'}
              </div>
              <div className={`mt-1 min-w-0 ${englishMode ? 'flex flex-col items-start gap-1' : 'flex items-center gap-[3px]'}`}>
                <span className="shrink-0 whitespace-nowrap text-[12px] text-white/[0.42] tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                  {tt('home.leverage', '杠杆')} {assetStatusReady ? formatLeverage(marginOverview.leverage) : '—'}
                </span>
                {assetStatusReady && marginLeverageStatus && (
                  <AccountLeverageBadge className="h-[17px] px-1 text-[10px]" language={language} tierId={marginLeverageStatus.id} />
                )}
              </div>
            </button>
          </div>
        </section>

        <section className="mt-3 grid grid-cols-4 overflow-hidden rounded-2xl border border-transparent bg-[#0b0c0e] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          {[
            { id: 'waves', label: tt('trades.swingLog', '波段记录'), icon: BookOpen },
            { id: 'competition', label: tt('competition.toolEntry', '社区比赛'), icon: Trophy },
            { id: 'records', label: tt('trades.tradeLog', '交易记录'), icon: ListChecks },
            { id: 'all', label: tt('trades.allTools', '全部功能'), icon: Grid2X2 },
          ].map((item) => {
            const Icon = item.icon;
            const active = item.id !== 'waves' && item.id !== 'competition' && item.id !== 'all' && toolPanel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'waves') {
                    setColorMenuOpen(false);
                    setToolPanel('');
                    openWaveTracker?.();
                    return;
                  }
                  if (item.id === 'competition') {
                    setColorMenuOpen(false);
                    setToolPanel('');
                    openCommunityCompetition?.();
                    return;
                  }
                  if (item.id === 'all') {
                    setColorMenuOpen(false);
                    setShowAllToolsModal(true);
                    return;
                  }
                  toggleToolPanel(item.id);
                }}
                className="flex min-h-[86px] flex-col items-center justify-center gap-2 active:bg-white/[0.04]"
              >
                <Icon className={`h-6 w-6 ${active ? 'text-[#f6b54b]' : 'text-white/70'}`} strokeWidth={1.8} />
                <span className={`text-[12px] font-normal ${active ? 'text-[#f6b54b]' : 'text-white/70'}`}>{item.label}</span>
              </button>
            );
          })}
        </section>

        {showAllToolsModal && (
          <ActionModalCard
            title={tt('trades.allTools', '全部功能')}
            closeLabel={tt('trades.closeAllTools', '关闭全部功能')}
            onClose={() => setShowAllToolsModal(false)}
            actionGridClassName="grid-cols-2"
            actions={[
              {
                key: 'cost',
                label: tt('trades.averagingTool', '摊薄工具'),
                onClick: () => {
                  setShowAllToolsModal(false);
                  setToolPanel('cost');
                },
              },
              {
                key: 'records',
                label: tt('trades.tradeLog', '交易记录'),
                onClick: () => {
                  setShowAllToolsModal(false);
                  setToolPanel('records');
                },
              },
              {
                key: 'waves',
                label: tt('trades.swingLog', '波段记录'),
                onClick: () => {
                  setShowAllToolsModal(false);
                  setToolPanel('');
                  openWaveTracker?.();
                },
              },
              {
                key: 'competition',
                label: tt('competition.toolEntry', '社区比赛'),
                onClick: () => {
                  setShowAllToolsModal(false);
                  setToolPanel('');
                  openCommunityCompetition?.();
                },
              },
            ]}
          >
            <div className="space-y-2 text-[12px] leading-5 text-white/[0.58]">
              <div className="text-[14px] text-white/[0.86]">{tt('trades.allToolsTitle', '交易辅助工具')}</div>
              <div>{tt('trades.allToolsDesc', '摊薄工具已收录到全部功能里;社区比赛为独立功能,不影响正式交易账本。')}</div>
            </div>
          </ActionModalCard>
        )}

        {showTradeRecordsTool && (
          <section className="mt-3 rounded-2xl border border-transparent bg-[#0b0c0e] p-4">
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
                        <div className={`text-[13px] font-normal ${isSell ? 'text-emerald-400' : 'text-[#ff4b1f]'}`}>{sideLabel(trade.side)} {sharesText(trade.shares, 0)}</div>
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
        <section className="mt-3 overflow-hidden rounded-2xl border border-transparent bg-[#0b0c0e] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_1px_0_0_rgba(255,255,255,0.03),inset_-1px_0_0_rgba(255,255,255,0.03),inset_0_-1px_0_rgba(255,255,255,0.01)]">
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
                  <div className={`mt-1 text-[13px] font-normal tabular-nums ${pnlClass(hasTodayPnl ? displayTodayPnl : 0, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>{hasTodayPnl ? signedCurrency(displayTodayPnl, displayCurrency, 2) : '--'}</div>
                </div>
              </div>

              {positions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
                  <div className="text-[13px] font-normal text-white/60">{tt('trades.noPositions', '还没有持仓')}</div>
                  <button type="button" onClick={() => openTradeModal(null, 'buy')} className="mt-3 rounded-full border border-[#f6b54b]/45 px-4 py-2 text-[12px] font-normal text-[#f6b54b] active:scale-95">{tt('trades.recordFirstBuy', '记录第一笔买入')}</button>
                </div>
              ) : (
                <div className="overflow-x-auto border-t border-white/[0.06] [scrollbar-width:none]" data-trade-positions-table="v230-single-grid">
                  <div className="min-w-[604px]">
                    <div className="grid grid-cols-[92px_88px_76px_118px_144px_66px] gap-1 px-0 pb-2 pt-3 text-[11px] font-medium leading-none text-white/36">
                      <span className="sticky left-0 z-20 bg-[#0b0c0e] pr-1.5 text-left">{tt('trades.nameTicker', '名称/代码')}</span>
                      <span className="text-left">{tt('trades.valueQty', '市值/数量')}</span>
                      <span className="text-right">{tt('trades.priceCost', '现价/成本')}</span>
                      <span className="text-right">{tt('trades.dailyPnl', '当日盈亏')}</span>
                      <span className="text-right">{tt('trades.positionPnl', '持仓盈亏')}</span>
                      <span className="text-right">{tt('trades.allocation', '占比')}</span>
                    </div>
                    <div className="divide-y divide-white/[0.06]">
                      {positions.map((position) => {
                        const nameParts = stockNameParts(position.symbol, position.name);
                        const cost = toNumber(position.effectiveCost || position.avgCost);
                        const marketValue = toNumber(position.marketValue) * displayRate;
                        const hasPositionTodayPnl = position.hasTodayPnl !== false;
                        const todayPnl = hasPositionTodayPnl ? toNumber(position.todayPnl) * displayRate : null;
                        const holdingPnl = toNumber(position.holdingPnl ?? position.unrealizedPnl) * displayRate;
                        const holdingPnlPct = position.holdingPnlPct ?? position.unrealizedPct;
                        const allocation = derivePositionAllocation(summary, position.symbol) ?? 0;
                        const displayCurrentPrice = resolveHoldingDisplayPrice(position) || 0;
                        const openScenarioFromCell = (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openPositionScenario(position);
                        };
                        return (
                          <div
                            key={position.symbol}
                            className="grid min-h-[60px] w-full grid-cols-[92px_88px_76px_118px_144px_66px] items-center gap-1 py-3 text-left"
                          >
                            <button
                              type="button"
                              onClick={() => (typeof openStockDetail === 'function' ? openStockDetail(position.symbol) : openTradeModal(position, 'buy'))}
                              className="sticky left-0 z-10 flex min-h-[36px] min-w-0 flex-col justify-center bg-[#0b0c0e] pr-1.5 text-left active:bg-white/[0.03]"
                              aria-label={tt('stockDetail.openAria', '打开个股收益详情')}
                            >
                              <span className="block truncate text-[13px] font-normal leading-[15px] text-white">{nameParts.title}</span>
                              <span className="mt-1 block truncate text-[11px] leading-[13px] text-white/40">{nameParts.subtitle}</span>
                            </button>
                            <button type="button" onClick={() => openTradeModal(position, 'buy')} className="block min-w-0 text-left active:bg-white/[0.03]">
                              <span className="block max-w-full truncate text-[12px] font-normal leading-[15px] text-white/86 tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{fmtAmount(marketValue, 2)}</span>
                              <span className="mt-1 block text-[11px] leading-[13px] text-white/45 tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{fmtAmount(position.heldShares, 0)}</span>
                            </button>
                            <button
                              type="button"
                              onClick={openScenarioFromCell}
                              className="-mr-1 block rounded-lg px-1 py-1 text-right active:bg-white/[0.03] focus:outline-none"
                              aria-label={tt('trades.openScenarioAria', '打开持仓收益试算')}
                            >
                              <span className="block text-[13px] font-normal leading-[15px] text-white/86 tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{displayCurrentPrice > 0 ? fmtAmount(displayCurrentPrice, 3) : '--'}</span>
                              <span className="mt-1 block text-[11px] leading-[13px] text-white/45 tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{fmtAmount(cost, 3)}</span>
                            </button>
                            <button type="button" onClick={() => openTradeModal(position, 'buy')} className="text-right active:bg-white/[0.03]">
                              <span className={`block whitespace-nowrap text-[13px] font-normal leading-[15px] tabular-nums ${pnlClass(hasPositionTodayPnl ? todayPnl : 0, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>{hasPositionTodayPnl ? signedCurrency(todayPnl, displayCurrency, 2) : '--'}</span>
                              <span className={`mt-1 block whitespace-nowrap text-[11px] font-normal leading-[13px] tabular-nums ${pnlClass(hasPositionTodayPnl ? toNumber(position.todayPnlPct) : 0, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>{hasPositionTodayPnl ? signedPct(position.todayPnlPct, 2) : '--'}</span>
                            </button>
                            <button type="button" onClick={() => openTradeModal(position, 'buy')} className="overflow-hidden text-right active:bg-white/[0.03]">
                              <span className={`block overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-normal leading-[15px] tabular-nums ${pnlClass(holdingPnl, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>{signedCurrency(holdingPnl, displayCurrency, 2)}</span>
                              <span className={`mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-normal leading-[13px] tabular-nums ${pnlClass(holdingPnlPct, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>{signedPct(holdingPnlPct, 2)}</span>
                            </button>
                            <button type="button" onClick={() => openTradeModal(position, 'buy')} className="text-right active:bg-white/[0.03]">
                              <span className="block text-[13px] font-normal leading-[15px] text-white/80 tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{(allocation * 100).toFixed(1)}%</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 flex justify-center">
                <button type="button" onClick={() => openTradeModal(null, 'buy')} className="flex items-center gap-2 rounded-full border border-[#f6b54b]/80 bg-[#0b0c0e] px-8 py-2.5 text-[13px] font-normal text-[#f6b54b] shadow-[0_0_20px_rgba(246,181,75,0.08)] active:scale-95">
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
                          <div className={`text-[13px] font-normal ${isSell ? 'text-emerald-400' : 'text-[#ff4b1f]'}`}>{sideLabel(trade.side)} {sharesText(trade.shares, 0)}</div>
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
          const amount = toNumber(orderActionTrade.price) * toNumber(orderActionTrade.shares) * displayRate;
          const displayName = stockDisplayName(orderActionTrade.symbol, orderActionTrade.name);
          const orderSymbol = String(orderActionTrade.symbol || '').trim().toUpperCase();
          const orderLogoUrls = stockLogoCandidates(orderSymbol, logoCache?.[orderSymbol]?.url);
          return (
            <ActionModalCard
              title={tt('trades.orderActions', '订单操作')}
              closeLabel={tt('trades.closeOrderActions', '关闭订单操作')}
              onClose={() => setOrderActionTrade(null)}
              actions={[
                {
                  key: 'edit',
                  label: tt('trades.modify', '修改'),
                  onClick: editOrderFromAction,
                },
                {
                  key: 'delete',
                  label: tt('trades.delete', '删除'),
                  onClick: deleteOrderFromAction,
                },
              ]}
            >
              <div className="grid min-h-[58px] grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2.5">
                <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.13] bg-black/[0.38] shadow-[0_7px_18px_rgba(0,0,0,0.27)]">
                  <StockLogo
                    symbol={orderSymbol}
                    urls={orderLogoUrls}
                    onLogoLoad={cacheStockLogo}
                    className="h-6 w-6 rounded-[4px]"
                  />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-normal leading-5 text-white/[0.82]">{orderSymbol || '--'}</div>
                  <div className="mt-[3px] truncate text-[11.5px] font-normal leading-4 text-white/[0.42]">{displayName || orderSymbol || '--'}</div>
                </div>
                <div className="min-w-[116px] shrink-0 text-right">
                  <div className="whitespace-nowrap text-[13.5px] font-normal leading-[18px] text-white/[0.48]">{sideLabel(orderActionTrade.side)} {sharesText(orderActionTrade.shares, 0)}</div>
                  <div className="mt-0.5 whitespace-nowrap text-[11.5px] font-normal leading-[15px] text-white/[0.37] tabular-nums" style={{ fontFamily: TRADE_NUMBER_FONT }}>{currencyAmount(amount, displayCurrency, 2)} @ {fmtAmount(orderActionTrade.price, 2)}</div>
                </div>
              </div>
            </ActionModalCard>
          );
        })()}


        {/* 波段记录(取代原来的"冷静室"+"日记本") */}
        {showWaveTool && (
          <div className="mx-auto mt-3 max-w-[430px] space-y-3 text-white">
            <section className="rounded-2xl border border-white/10 bg-[#0b0c0e] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.28)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[14px] font-normal leading-tight tracking-normal text-white">
                    {tt('trades.swingLog', '波段记录')}
                  </h2>
                  <div className="mt-1 text-[11px] font-normal text-white/45">
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
                  className={`rounded-xl border px-2 py-2.5 text-center active:scale-[0.99] ${waveView === 'active' ? 'border-[#ff4b1f]/35 bg-[#ff4b1f]/[0.08]' : 'border-white/10 bg-white/[0.035]'}`}
                  title={tt('trades.active', '进行中')}
                >
                  <div className="text-[16px] font-normal tabular-nums text-[#ff4b1f]" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                    {calmRoomActiveCount}
                  </div>
                  <div className="mt-1 text-[11px] font-normal text-white/45">{tt('trades.active', '进行中')}</div>
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
                  <div className="mt-1 text-[11px] font-normal text-white/45">{tt('trades.completed', '已完成')}</div>
                </button>
                <div className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-2.5 text-center">
                  <div className="text-[16px] font-normal tabular-nums text-white/80" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                    {calmRoomAvgActiveDays}
                    <span className="ml-0.5 text-[10px] font-normal text-white/45">{tt('trades.day', '天')}</span>
                  </div>
                  <div className="mt-1 text-[11px] font-normal text-white/45">{tt('trades.avgHolding', '均持有')}</div>
                </div>
              </div>
            </section>

            {waveGroups.length === 0 ? (
              <section className="rounded-2xl border border-white/10 bg-[#0b0c0e] p-4 text-center shadow-[0_16px_40px_rgba(0,0,0,0.24)]">
                <div className="text-[13px] font-normal text-white/75">{tt('trades.noWaveRecords', '暂无波段记录')}</div>
                <div className="mt-1 text-[12px] font-normal text-white/50">{tt('trades.noWaveRecordsDesc', '添加波段买入或卖出后,这里会自动显示。')}</div>
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
                <section className="rounded-2xl border border-white/10 bg-[#0b0c0e] p-4 text-center shadow-[0_16px_40px_rgba(0,0,0,0.24)]">
                  <div className="text-[13px] font-normal text-white/75">{tt('trades.noCompletedWaves', '暂无已完成波段')}</div>
                  <div className="mt-1 text-[12px] font-normal text-white/50">{tt('trades.noCompletedWavesDesc', '卖出至清仓后,完成的波段会归类到这里。')}</div>
                </section>
              ) : completedWaveGroups.map(group => (
                <section key={`completed-${group.symbol}`} className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0c0e] shadow-[0_16px_40px_rgba(0,0,0,0.26)]">
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
                                <span className="ml-1 text-[11px] font-normal text-white/40">· {daysText(w.heldDays)}</span>
                              </span>
                              <span className="mt-1 block text-[10px] font-normal tabular-nums text-white/45" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {formatWaveUsdPrice(w.avgBuyPrice)} → {formatWaveUsdPrice(w.avgSellPrice)}
                              </span>
                            </span>
                            <span className="text-right">
                              <span className={`block text-[15px] font-normal tabular-nums ${pnlClass(w.gainPct, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {signedPct(w.gainPct, 1)}
                              </span>
                              <span className={`block text-[10px] font-normal tabular-nums ${pnlClass(w.gainAmount, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {signedWaveCurrencyAmount(w.gainAmount, 0)}
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
                                  className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left text-[11px] font-normal text-white/40 active:scale-95"
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
                                className="text-[11px] font-normal text-white/40 active:scale-95"
                              >
                                {tt('trades.addNote', '+ 加备注')}
                              </button>
                            )}
                          </div>

                          {isExpanded && (
                            <div className="border-t border-white/10 px-3 pb-3 pt-2.5">
                              <div className="mb-2 text-[11px] font-normal text-white/40">{tt('trades.tradeDetails', '交易明细')}</div>
                              <div className="space-y-1.5">
                                {waveTrades.map(t => {
                                  const isBuy = !t.side || t.side === 'buy';
                                  const amount = toNumber(t.shares) * toNumber(t.price);

                                  return (
                                    <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/15 px-2.5 py-1.5">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-normal text-white ${isBuy ? 'bg-[#ff4b1f]/90' : 'bg-emerald-500/80'}`}>
                                          {sideLabel(t.side, true)}
                                        </span>
                                        <span className="shrink-0 text-[11px] font-normal tabular-nums text-white/45" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                          {(t.date || '').slice(5)}
                                        </span>
                                        <span className="truncate text-[11px] font-normal tabular-nums text-white/70" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                          {sharesText(t.shares, 0)} @{formatWaveUsdPrice(t.price)}
                                        </span>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-2">
                                        <span className={`text-[11px] font-normal tabular-nums ${isBuy ? 'text-white/70' : 'text-emerald-400'}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                          {signedWaveCurrencyAmount(isBuy ? -amount : amount, 0)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); requestDeleteLegacyTrade(t.id); }}
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
              <section className="rounded-2xl border border-white/10 bg-[#0b0c0e] p-4 text-center shadow-[0_16px_40px_rgba(0,0,0,0.24)]">
                <div className="text-[13px] font-normal text-white/75">{tt('trades.noActiveWaves', '暂无进行中的波段')}</div>
                <div className="mt-1 text-[12px] font-normal text-white/50">{tt('trades.noActiveWavesDesc', '已清仓的记录请点上方“已完成”查看。')}</div>
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
                <section key={group.symbol} className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0c0e] shadow-[0_16px_40px_rgba(0,0,0,0.26)]">
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
                          {signedWaveCurrencyAmount(totalGain, 0)}
                        </div>
                        <div className="mt-1 text-[11px] font-normal text-white/40">{tt('trades.totalPnlMetric', '总盈亏')}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-2.5 text-center">
                        <div className="text-[13px] font-normal tabular-nums text-white/80" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                          {completedCount > 0 ? `${winRate}%` : '—'}
                        </div>
                        <div className="mt-1 text-[11px] font-normal text-white/40">
                          {tt('trades.winRate', '胜率')}{completedCount > 0 ? ` ${winCount}/${completedCount}` : ''}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-2.5 text-center">
                        <div className="text-[13px] font-normal tabular-nums text-white/80" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                          {avgHeld > 0 ? daysText(avgHeld) : '—'}
                        </div>
                        <div className="mt-1 text-[11px] font-normal text-white/40">{tt('trades.avgHolding', '均持有')}</div>
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
                                <div className="mt-1 text-[11px] font-normal tabular-nums text-white/40" style={{ fontFamily: TRADE_NUMBER_FONT }}>
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
                              <div className="text-[11px] font-normal text-white/40">{tt('trades.avgBuy', '买入均')}</div>
                              <div className="mt-1 text-[12px] font-normal tabular-nums text-white/90" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {formatWaveUsdPrice(w.avgBuyPrice)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[11px] font-normal text-white/40">{tt('trades.currentPrice', '现价')}</div>
                              <div className={`mt-1 text-[12px] font-normal tabular-nums ${w.currentPrice === w.avgBuyPrice ? 'text-white/90' : pnlClass(w.currentPrice - w.avgBuyPrice, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {w.currentPrice > 0 ? formatWaveUsdPrice(w.currentPrice) : '—'}
                              </div>
                            </div>
                            <div>
                              <div className="text-[11px] font-normal text-white/40">{tt('trades.held', '持有')}</div>
                              <div className="mt-1 text-[12px] font-normal tabular-nums text-white/90" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {sharesText(w.heldShares, 0)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[11px] font-normal text-white/40">{tt('trades.floatingProfit', '浮盈')}</div>
                              <div className={`mt-1 text-[12px] font-normal tabular-nums ${pnlClass(w.gainAmount, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {signedWaveCurrencyAmount(w.gainAmount, 0)}
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
                                className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left text-[11px] font-normal text-white/40 active:scale-95"
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
                              className="text-[11px] font-normal text-[#f6b54b] active:scale-95"
                            >
                              {tt('trades.addNote', '+ 加备注')}
                            </button>
                          )}
                        </div>

                        {isExpanded && (
                          <div className="border-t border-white/10 px-3 pb-3 pt-2.5">
                            <div className="mb-2 text-[11px] font-normal text-white/40">{tt('trades.tradeDetails', '交易明细')}</div>
                            <div className="space-y-1.5">
                              {waveTrades.map(t => {
                                const isBuy = !t.side || t.side === 'buy';
                                const amount = toNumber(t.shares) * toNumber(t.price);

                                return (
                                  <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/15 px-2.5 py-1.5">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-normal text-white ${isBuy ? 'bg-[#ff4b1f]/90' : 'bg-emerald-500/80'}`}>
                                        {sideLabel(t.side, true)}
                                      </span>
                                      <span className="shrink-0 text-[11px] font-normal tabular-nums text-white/45" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                        {(t.date || '').slice(5)}
                                      </span>
                                      <span className="truncate text-[11px] font-normal tabular-nums text-white/70" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                        {sharesText(t.shares, 0)} @{formatWaveUsdPrice(t.price)}
                                      </span>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <span className={`text-[11px] font-normal tabular-nums ${isBuy ? 'text-white/70' : 'text-emerald-400'}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                        {signedWaveCurrencyAmount(isBuy ? -amount : amount, 0)}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); requestDeleteLegacyTrade(t.id); }}
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
                    <div className="mx-4 mb-4 rounded-2xl border border-white/10 bg-white/[0.025] px-3 py-3 text-[12px] font-normal text-white/50">
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
                        <span className="text-[11px] font-normal text-white/75">{tt('trades.completed', '已完成')}</span>
                        <span className="flex items-center gap-2 text-[10px] font-normal text-white/40">
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
                                    <span className="block text-[11px] font-normal tabular-nums text-white/40" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                      {startD} → {endD}
                                      <span className="ml-1 text-[11px] font-normal text-white/40">· {daysText(w.heldDays)}</span>
                                    </span>
                                    <span className="mt-0.5 block text-[10px] font-normal tabular-nums text-white/40" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                      {formatWaveUsdPrice(w.avgBuyPrice)} → {formatWaveUsdPrice(w.avgSellPrice)}
                                    </span>
                                  </span>
                                  <span className="text-right">
                                    <span className={`block text-[12px] font-normal tabular-nums ${pnlClass(w.gainPct, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                      {signedPct(w.gainPct, 1)}
                                    </span>
                                    <span className={`block text-[10px] font-normal tabular-nums ${pnlClass(w.gainAmount, marketColorMode)}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                      {signedWaveCurrencyAmount(w.gainAmount, 0)}
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
                                    ) : (
                                      <div className="flex items-start gap-2">
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                                          className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left text-[11px] font-normal text-white/40 active:scale-95"
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
                                    )}
                                  </div>
                                )}

                                {!noteValue && !isEditingNote && (
                                  <div className="px-2.5 pb-2.5">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                                      className="text-[11px] font-normal text-white/40 active:scale-95"
                                    >
                                      {tt('trades.addNote', '+ 加备注')}
                                    </button>
                                  </div>
                                )}

                                {isExpanded && (
                                  <div className="border-t border-white/10 px-2.5 pb-2.5 pt-2.5">
                                    <div className="mb-2 text-[11px] font-normal text-white/40">{tt('trades.tradeDetails', '交易明细')}</div>
                                    <div className="space-y-1.5">
                                      {waveTrades.map(t => {
                                        const isBuy = !t.side || t.side === 'buy';
                                        const amount = toNumber(t.shares) * toNumber(t.price);

                                        return (
                                          <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-2.5 py-1.5">
                                            <div className="flex min-w-0 items-center gap-2">
                                              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-normal text-white ${isBuy ? 'bg-[#ff4b1f]/90' : 'bg-emerald-500/80'}`}>
                                                {sideLabel(t.side, true)}
                                              </span>
                                              <span className="shrink-0 text-[11px] font-normal tabular-nums text-white/40" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                                {(t.date || '').slice(5)}
                                              </span>
                                              <span className="truncate text-[10px] font-normal tabular-nums text-white/70" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                                {sharesText(t.shares, 0)} @{formatWaveUsdPrice(t.price)}
                                              </span>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                              <span className={`text-[10px] font-normal tabular-nums ${isBuy ? 'text-white/70' : 'text-emerald-400'}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                                {signedWaveCurrencyAmount(isBuy ? -amount : amount, 0)}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); requestDeleteLegacyTrade(t.id); }}
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

        {/* 旧波段兼容账本的完整交易历史:保留宽版结构,统一深色视觉。 */}
        {allTradesModal !== null && (() => {
          const sym = allTradesModal.symbol;
          const name = stockDisplayName(sym, allTradesModal.name);
          const symbolTrades = trades
            .filter((trade) => (trade.symbol || 'TQQQ') === sym)
            .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id - a.id));

          return (
            <div
              className="fixed inset-0 z-[90] flex items-end justify-center bg-black/[0.68] backdrop-blur-[10px] sm:items-center sm:px-4"
              onClick={() => setAllTradesModal(null)}
            >
              <div
                className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-[radial-gradient(circle_at_50%_0,rgba(47,52,65,0.16),transparent_28%),linear-gradient(158deg,rgba(17,20,27,0.99),rgba(8,10,15,0.995))] shadow-[0_30px_80px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.045)] sm:rounded-[28px]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="relative overflow-hidden border-b border-white/[0.08] px-5 py-4">
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-[17px] w-[17px] text-white/[0.54]" strokeWidth={1.7} />
                        <h3 className="text-[18px] font-medium tracking-normal text-white/[0.92]">
                          {tt('trades.allTrades', '全部交易')}
                        </h3>
                      </div>
                      <div className="mt-1 truncate text-[11px] font-normal text-white/[0.42]">
                        <span className="text-white/[0.72]">{sym}</span>
                        <span className="mx-1.5 text-white/[0.18]">·</span>
                        <span>{name}</span>
                        <span className="mx-1.5 text-white/[0.18]">·</span>
                        <span>{symbolTrades.length} {tt('trades.entries', '条记录')}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAllTradesModal(null)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.035] text-white/[0.48] active:scale-95"
                      aria-label={tt('trades.close', '关闭')}
                    >
                      <X className="h-4 w-4" strokeWidth={1.8} />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {symbolTrades.length === 0 ? (
                    <div className="py-12 text-center text-[12px] text-white/50">
                      {tt('trades.noTrades', '暂无交易记录')}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {symbolTrades.map((trade, index) => {
                        const isBuy = !trade.side || trade.side === 'buy';
                        const amount = toNumber(trade.shares) * toNumber(trade.price);
                        return (
                          <div
                            key={trade.id}
                            className="rounded-[16px] border border-white/[0.08] bg-white/[0.028] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]"
                          >
                            <div className="mb-2 flex items-center gap-2">
                              <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium text-white/[0.92] ${isBuy ? 'bg-[#ff4b1f]/85' : 'bg-emerald-500/75'}`}>
                                {isBuy ? tt('trades.buy', '买入') : tt('trades.sell', '卖出')}
                              </span>
                              <span className="text-[11px] font-normal tabular-nums text-white/[0.46]" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                {trade.date || '—'}
                              </span>
                              <span className="text-[10px] font-normal text-white/[0.26]">#{symbolTrades.length - index}</span>
                              <button
                                type="button"
                                onClick={() => requestDeleteLegacyTrade(trade.id)}
                                className="ml-auto flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.025] text-white/[0.35] active:scale-90"
                                title={tt('trades.deleteThis', '删除这条')}
                              >
                                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                              </button>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[12px]">
                              <div>
                                <div className="text-[11px] font-normal uppercase tracking-wider text-white/40">{tt('trades.quantity', '股数')}</div>
                                <div className="mt-0.5 font-normal tabular-nums text-white/[0.74]" style={{ fontFamily: TRADE_NUMBER_FONT }}>{trade.shares}</div>
                              </div>
                              <div>
                                <div className="text-[11px] font-normal uppercase tracking-wider text-white/40">{tt('trades.unitPrice', '单价')}</div>
                                <div className="mt-0.5 font-normal tabular-nums text-white/[0.74]" style={{ fontFamily: TRADE_NUMBER_FONT }}>{formatWaveUsdPrice(trade.price)}</div>
                              </div>
                              <div>
                                <div className="text-[11px] font-normal uppercase tracking-wider text-white/40">{tt('trades.amount', '金额')}</div>
                                <div className={`mt-0.5 font-normal tabular-nums ${isBuy ? 'text-[#ff6048]' : 'text-emerald-400'}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
                                  {signedWaveCurrencyAmount(isBuy ? -amount : amount, 0)}
                                </div>
                              </div>
                            </div>
                            {trade.batch && (
                              <div className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] font-normal text-white/40">
                                {tt('trades.batch', '批次')}: {trade.batch}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="border-t border-white/[0.07] bg-black/[0.12] px-5 py-3">
                  <p className="text-center text-[11px] font-normal leading-relaxed text-white/40">
                    {tt('trades.allTradesHint', '删除单笔交易不影响其他波段 · 按日期倒序排列')}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 添加成交表单 - Modal 弹窗 */}
        {showAddTrade && (
          <ActionModalCard
            title={tradeEntryScope === 'wave' ? tt('trades.addWaveRecord', '添加波段记录') : (newTrade.id || newTrade.editingId ? tt('trades.editTrade', '修改交易') : tt('trades.addTrade', '添加交易'))}
            closeLabel={tt('trades.closeTradeForm', '关闭交易表单')}
            onClose={() => !tradeSubmitting && setShowAddTrade(false)}
            widthClassName={isTqqqTradeEntry ? 'w-[calc(100vw-24px)] max-w-[720px]' : 'w-[calc(100vw-24px)] max-w-md'}
            panelClassName="min-h-0"
            contentClassName={isTqqqTradeEntry ? '!border-0 !bg-transparent !p-0 !shadow-none' : ''}
            actions={isTqqqTradeEntry ? [{
              key: 'tqqq-confirm',
              label: tradeSubmitting
                ? tt('trades.saving', '保存中...')
                : (newTrade.side === 'sell' ? tt('trades.tqqq.confirmSell', '确认卖出') : tt('trades.tqqq.confirmBuy', '确认买入')),
              disabled: tradeSubmitting || (tqqqTradePreview.inputReady && tqqqTradePreview.hardBlocked),
              onClick: () => confirmTradeSubmit(newTrade.side === 'sell' ? 'sell' : 'buy'),
              className: `!h-[46px] !rounded-[13px] !border-transparent !text-[14px] !text-white ${TQQQ_ACTION_TONE_CLASSES[newTrade.side === 'sell' ? 'sell' : 'buy'].confirm} disabled:!opacity-40`,
            }] : [
              { key: 'buy', label: tradeSubmitting ? tt('trades.saving', '保存中...') : tt('trades.buy', '买入'), disabled: tradeSubmitting, onClick: () => confirmTradeSubmit('buy') },
              { key: 'sell', label: tradeSubmitting ? tt('trades.saving', '保存中...') : tt('trades.sell', '卖出'), disabled: tradeSubmitting, onClick: () => confirmTradeSubmit('sell') },
            ]}
          >
            {isTqqqTradeEntry ? (
              <TqqqTradeEntryPanel
                draft={newTrade}
                onDraftChange={setNewTrade}
                preview={tqqqTradePreview}
                marketReference={tqqqMarketReference}
                lookupStatus={lookupStatus}
                logoCache={logoCache}
                cacheStockLogo={cacheStockLogo}
                tt={tt}
              />
            ) : (
              <div className="min-w-0">
                {/* 股票代码 */}
                <div className="mb-3 min-w-0 border-b border-white/10 pb-3">
                  <div className="min-w-0">
                    <label className={tradeModalLabelClass}>
                      {tt('trades.stockTicker', '股票代码')}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={tt('trades.tickerPlaceholder', '输入股票代码,如 NVDA')}
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
                        className={`${tradeModalBaseInput} pr-9 font-normal uppercase`}
                        style={tradeModalInputStyle}
                      />
                      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/[0.42]" strokeWidth={1.8} />
                    </div>
                    <div className="mt-2 flex min-h-9 items-center justify-between gap-2 rounded-xl bg-white/[0.045] px-3 text-[11px] text-white/60">
                      <span className="min-w-0 truncate">{tt('trades.systemManagedName', '名称和现价由系统自动识别')}</span>
                      {lookupStatus === 'loading' && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-sky-300">
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          <span>{tt('trades.lookupLoading', '查询中')}</span>
                        </span>
                      )}
                      {lookupStatus === 'found' && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>{tt('trades.lookupFound', '已找到')}</span>
                        </span>
                      )}
                      {lookupStatus === 'notfound' && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-amber-300">
                          <AlertCircle className="h-3 w-3" />
                          <span>{tt('trades.lookupNotFound', '未找到,可手动填')}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 价格 + 股数 */}
                <div className="mb-3 min-w-0 border-b border-white/10 pb-3">
                  <label className={tradeModalLabelClass}>
                    {tt('trades.priceShares', '价格与股数')}
                  </label>
                  <div className="grid min-w-0 grid-cols-2 gap-2">
                    <div className="min-w-0">
                      <label className={tradeModalLabelClass}>{tt('trades.priceUsd', '价格 ($)')}</label>
                      <input
                        type="number"
                        placeholder={tt('trades.inputPrice', '输入价格')}
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
                        placeholder={tt('trades.inputShares', '输入股数')}
                        inputMode="numeric"
                        value={newTrade.shares}
                        onChange={(e) => setNewTrade({ ...newTrade, shares: e.target.value })}
                        className={`${tradeModalBaseInput} tabular-nums`}
                        style={tradeModalInputStyle}
                      />
                    </div>
                  </div>
                </div>

                {/* 日期 */}
                <div className="mb-3 min-w-0 border-b border-white/10 pb-3">
                  <label className={tradeModalLabelClass}>
                    {tt('trades.date', '日期')}
                  </label>
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/[0.48]" strokeWidth={1.8} />
                    <input
                      type="date"
                      value={newTrade.date}
                      onChange={(e) => setNewTrade({ ...newTrade, date: e.target.value })}
                      className={`${tradeModalBaseInput} appearance-none pl-9 pr-8 text-left font-normal tabular-nums`}
                      style={{ ...tradeModalInputStyle, WebkitAppearance: 'none' }}
                    />
                    <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/[0.38]" strokeWidth={1.8} />
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

              </div>
            )}
          </ActionModalCard>
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
              <section className="rounded-2xl border border-transparent bg-[#0b0c0e] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.28)]">
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
                <section className="rounded-2xl border border-transparent bg-[#0b0c0e] p-6 text-center shadow-[0_16px_40px_rgba(0,0,0,0.24)]">
                  <div className="text-[13px] font-normal text-white/75">{tt('trades.noStocks', '还没有股票')}</div>
                  <div className="mt-1 text-[12px] font-normal text-white/50">{tt('trades.noStocksDesc', '点上方新增添加第一只股票。')}</div>
                </section>
              ) : (
                <>
                  <section className="rounded-2xl border border-transparent bg-[#0b0c0e] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.24)]">
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
                    <section className="rounded-2xl border border-transparent bg-[#101114] p-4 shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
                      <Database className="mb-3 h-6 w-6 text-white/60" strokeWidth={1.7} />
                      <div className="text-[11px] font-normal text-white/50">{tt('trades.totalInvested', '累计投入')}</div>
                      <div className="mt-2 text-[20px] font-normal tabular-nums text-white/90" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                        ${stats.totalCost.toFixed(0)}
                      </div>
                      <div className="mt-1 text-[11px] font-normal tabular-nums text-white/40" style={{ fontFamily: TRADE_NUMBER_FONT }}>
                        {cnyEquivalentText(stats.totalCost)}
                      </div>
                    </section>
                    <section className="rounded-2xl border border-transparent bg-[#101114] p-4 shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
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

                  <section className="rounded-2xl border border-transparent bg-[#0b0c0e] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.24)]">
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
                                    className={`flex h-8 w-8 items-center justify-center rounded-full border text-[13px] font-normal ${isSell ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-[#ff4b1f]/30 bg-[#ff4b1f]/10 text-[#ff4b1f]'}`}
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
                                  <div className={`text-right text-[13px] font-normal tabular-nums ${isSell ? 'text-emerald-400' : 'text-[#ff4b1f]'}`} style={{ fontFamily: TRADE_NUMBER_FONT }}>
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

        <AvailableCashEditor
          availableCashUsd={availableCashUsd}
          currency={displayCurrency}
          isOpen={showAvailableCashEditor}
          isSet={availableCashIsSet}
          language={language}
          onClose={() => setShowAvailableCashEditor(false)}
          onSave={saveAvailableCash}
          usdRate={rate}
        />

        {scenarioPosition && (
          <PositionProfitScenarioSheet
            position={scenarioPosition}
            onClose={() => setScenarioPosition(null)}
            tt={tt}
            displayCurrency={displayCurrency}
            displayRate={displayRate}
            marketColorMode={marketColorMode}
            stockNameParts={stockNameParts}
            logoCache={logoCache}
            cacheStockLogo={cacheStockLogo}
          />
        )}

    </>
  );
}
