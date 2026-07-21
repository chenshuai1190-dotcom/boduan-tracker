import React from 'react';
import { Loader2, X } from 'lucide-react';
import {
  deriveHomeMarginOverview,
  deriveHomeMarginStress,
  displayMarginDebtToUsd,
  marginScenarioToTrackRatio,
  marginTrackRatioToScenario,
  normalizeMarginScenarioPct,
} from '../lib/homeMarginRisk.js';
import { t } from '../lib/i18n.js';
import { marketHexColor, marketTextClass } from '../lib/marketColorMode.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const SCENARIO_PRESETS = [-40, -20, -10, 10, 20, 40];
const NEUTRAL_SCENARIO_COLOR = '#8d96a3';

function displayRate(currency, usdRate) {
  const rate = Number(usdRate);
  return currency === 'CNY' && Number.isFinite(rate) && rate > 0 ? rate : 1;
}

function formatMoneyFromUsd(value, currency, usdRate, digits = 2) {
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  const converted = safeValue * displayRate(currency, usdRate);
  const sign = converted < 0 ? '-' : '';
  const symbol = currency === 'CNY' ? '¥' : '$';
  return `${sign}${symbol}${Math.abs(converted).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function formatCompactMoneyFromUsd(value, currency, usdRate) {
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  const converted = safeValue * displayRate(currency, usdRate);
  const absoluteValue = Math.abs(converted);
  const sign = converted < 0 ? '-' : '';

  if (currency === 'CNY' && absoluteValue >= 10_000) {
    const wan = absoluteValue / 10_000;
    const digits = Math.abs(wan - Math.round(wan)) < 0.001 ? 0 : 1;
    return `${sign}¥${wan.toFixed(digits)}万`;
  }
  if (currency !== 'CNY' && absoluteValue >= 1_000_000) {
    return `${sign}$${(absoluteValue / 1_000_000).toFixed(2)}M`;
  }
  return formatMoneyFromUsd(safeValue, currency, usdRate, 0);
}

function formatSignedRatioPercent(value) {
  if (!Number.isFinite(value)) return '—';
  const percent = Number((value * 100).toFixed(2));
  const prefix = percent > 0 ? '+' : '';
  return `${prefix}${percent.toFixed(2)}%`;
}

function formatScenarioPercent(value) {
  const normalized = Math.round(normalizeMarginScenarioPct(value));
  const prefix = normalized > 0 ? '+' : '';
  return `${prefix}${normalized}%`;
}

function formatLeverage(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}×` : '—';
}

function Metric({ label, value }) {
  return (
    <div className="min-w-0 px-1 text-center">
      <div className="text-[10px] text-white/38">{label}</div>
      <div className="mt-1 truncate text-[12px] font-medium text-white/82 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{value}</div>
    </div>
  );
}

function InfiniteScenarioSlider({ language, value, color, onChange }) {
  const dragRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  const [tickOffset, setTickOffset] = React.useState(0);
  const thumbRatio = marginScenarioToTrackRatio(value);
  const thumbPercent = thumbRatio * 100;
  const fillLeft = Math.min(50, thumbPercent);
  const fillWidth = Math.abs(thumbPercent - 50);

  const commitValue = React.useCallback((nextValue) => {
    onChange?.(Math.round(normalizeMarginScenarioPct(nextValue)));
  }, [onChange]);

  const finishDrag = React.useCallback((event) => {
    const session = dragRef.current;
    if (!session || (event?.pointerId !== undefined && session.pointerId !== event.pointerId)) return;
    const element = event?.currentTarget;
    if (element?.hasPointerCapture?.(session.pointerId)) {
      element.releasePointerCapture(session.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
    setTickOffset(0);
  }, []);

  return (
    <div
      className="mt-3 w-full select-none rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3 pb-2 pt-2"
      style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      <div
        role="spinbutton"
        tabIndex={0}
        aria-label={t(language, 'home.stockPortfolioMove', '股票组合涨跌')}
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        aria-valuetext={formatScenarioPercent(value)}
        data-home-margin-scenario-slider="true"
        className={`relative h-11 w-full cursor-ew-resize overflow-visible rounded-full outline-none focus:bg-white/[0.025] ${dragging ? 'is-dragging' : ''}`}
        style={{ touchAction: 'pan-y' }}
        onPointerDown={(event) => {
          const element = event.currentTarget;
          element.setPointerCapture(event.pointerId);
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            lastX: event.clientX,
            currentValue: value,
            trackWidth: Math.max(1, element.getBoundingClientRect().width),
            intent: 'pending',
          };
        }}
        onPointerMove={(event) => {
          const session = dragRef.current;
          if (!session || session.pointerId !== event.pointerId) return;
          const intentDeltaX = event.clientX - session.startX;
          const intentDeltaY = event.clientY - session.startY;

          if (session.intent === 'pending') {
            if (Math.max(Math.abs(intentDeltaX), Math.abs(intentDeltaY)) < 8) return;
            if (Math.abs(intentDeltaY) >= Math.abs(intentDeltaX) * 0.8) {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              dragRef.current = null;
              return;
            }
            session.intent = 'horizontal';
            setDragging(true);
          }

          if (session.intent !== 'horizontal') return;
          event.preventDefault();
          const deltaX = event.clientX - session.lastX;
          const currentRatio = marginScenarioToTrackRatio(session.currentValue);
          const nextRatio = currentRatio + deltaX / session.trackWidth;
          const nextValue = Math.round(marginTrackRatioToScenario(nextRatio));
          session.lastX = event.clientX;
          session.currentValue = nextValue;
          commitValue(nextValue);
          setTickOffset((current) => (current + deltaX) % 16);
        }}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={() => {
          dragRef.current = null;
          setDragging(false);
          setTickOffset(0);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const direction = event.key === 'ArrowRight' ? 1 : -1;
          commitValue(value + direction * (event.shiftKey ? 10 : 1));
        }}
      >
        <div
          className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/[0.08]"
          style={{
            backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.13) 0 1px, transparent 1px 16px)',
            backgroundPosition: `${tickOffset}px 0`,
          }}
        />
        <div
          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
          style={{ left: `${fillLeft}%`, width: `${fillWidth}%`, backgroundColor: color }}
        />
        <div
          className="absolute bottom-2 top-2 left-1/2 z-[1] w-px -translate-x-1/2 bg-white/[0.18]"
        />
        <div
          className={`absolute top-1/2 z-[2] h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/85 ${dragging ? 'scale-110' : ''} ${dragging ? '' : 'transition-[left,background-color,box-shadow] duration-150'}`}
          style={{
            left: `${thumbPercent}%`,
            backgroundColor: color,
            boxShadow: `0 0 0 ${dragging ? 7 : 5}px ${color}20`,
          }}
        />
      </div>
      <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[9px] text-white/30">
        <span>{t(language, 'home.marginDownsideFloor', '下跌最低 -100%')}</span>
        <button
          type="button"
          onClick={() => commitValue(0)}
          className="h-[22px] min-w-10 rounded-full border border-white/[0.09] bg-white/[0.035] px-2 text-[9px] text-white/50 active:scale-95"
        >
          {t(language, 'home.marginScenarioReset', '归零')}
        </button>
        <span className="text-right">{t(language, 'home.marginUpsideCeiling', '上涨最高 +100%')}</span>
      </div>
    </div>
  );
}

export default function HomeMarginRiskSheet({
  language = 'zh',
  currencyMode = 'USD',
  usdRate = 1,
  totalAssetsUsd = 0,
  positionsMarketValueUsd,
  cashUsd = 0,
  marginDebtUsd = 0,
  marketColorMode,
  initialPanel = 'risk',
  initialScenarioPct = 0,
  onClose,
  onSaveDebtUsd,
}) {
  const normalizedInitialPanel = initialPanel === 'editor' ? 'editor' : 'risk';
  const [panel, setPanel] = React.useState(normalizedInitialPanel);
  const [scenarioPct, setScenarioPct] = React.useState(() => Math.round(normalizeMarginScenarioPct(initialScenarioPct)));
  const [draftDebt, setDraftDebt] = React.useState(() => {
    if (normalizedInitialPanel !== 'editor') return '';
    const displayedDebt = Number(marginDebtUsd) * displayRate(currencyMode, usdRate);
    return String(Math.round(displayedDebt * 100) / 100);
  });
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');
  const [visualViewportFrame, setVisualViewportFrame] = React.useState(null);
  const currency = currencyMode === 'CNY' ? 'CNY' : 'USD';
  const currencySymbol = currency === 'CNY' ? '¥' : '$';
  const overview = React.useMemo(() => deriveHomeMarginOverview({
    totalAssetsUsd,
    marginDebtUsd,
  }), [marginDebtUsd, totalAssetsUsd]);
  const stress = React.useMemo(() => deriveHomeMarginStress({
    totalAssetsUsd,
    positionsMarketValueUsd,
    cashUsd,
    marginDebtUsd,
    scenarioPct,
  }), [cashUsd, marginDebtUsd, positionsMarketValueUsd, scenarioPct, totalAssetsUsd]);
  const draftDebtUsd = displayMarginDebtToUsd({ amount: draftDebt, currency, usdRate });
  const draftOverview = deriveHomeMarginOverview({
    totalAssetsUsd,
    marginDebtUsd: draftDebtUsd ?? 0,
  });
  const scenarioDirection = Math.sign(stress.normalizedScenarioPct);
  const scenarioColorClass = scenarioDirection === 0
    ? 'text-white/55'
    : marketTextClass(scenarioDirection, marketColorMode);
  const scenarioColor = scenarioDirection === 0
    ? NEUTRAL_SCENARIO_COLOR
    : marketHexColor(scenarioDirection, marketColorMode);

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return undefined;
    const viewport = window.visualViewport;
    let rafId = 0;
    const updateFrame = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        const viewportHeight = Number(viewport.height) > 0
          ? Number(viewport.height)
          : Number(window.innerHeight) || 0;
        setVisualViewportFrame({
          top: `${Math.max(0, viewport.offsetTop || 0)}px`,
          height: viewportHeight > 0 ? `${viewportHeight}px` : '100dvh',
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

  React.useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || saving) return;
      if (panel === 'editor') setPanel('risk');
      else onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, panel, saving]);

  const openEditor = () => {
    const rate = displayRate(currency, usdRate);
    const displayDebt = overview.marginDebtUsd * rate;
    setDraftDebt(String(Math.round(displayDebt * 100) / 100));
    setSaveError('');
    setPanel('editor');
  };

  const closeEditor = () => {
    if (saving) return;
    setSaveError('');
    setPanel('risk');
  };

  const saveDebt = async () => {
    const nextDebtUsd = displayMarginDebtToUsd({ amount: draftDebt, currency, usdRate });
    if (nextDebtUsd === null) {
      setSaveError(t(language, 'home.marginBalanceInvalid', '请输入不小于 0 的有效金额'));
      return;
    }
    if (typeof onSaveDebtUsd !== 'function') {
      setSaveError(t(language, 'home.marginSaveFailed', '保存失败，请稍后重试'));
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      await onSaveDebtUsd(nextDebtUsd);
      setPanel('risk');
    } catch (error) {
      setSaveError(error?.message || t(language, 'home.marginSaveFailed', '保存失败，请稍后重试'));
    } finally {
      setSaving(false);
    }
  };

  const currentCards = [
    [t(language, 'home.totalAssets', '总资产'), formatCompactMoneyFromUsd(overview.totalAssetsUsd, currency, usdRate)],
    [t(language, 'home.netAssets', '净资产'), formatCompactMoneyFromUsd(overview.netAssetsUsd, currency, usdRate)],
    [t(language, 'home.marginDebt', '融资负债'), formatCompactMoneyFromUsd(overview.marginDebtUsd, currency, usdRate)],
    [t(language, 'home.leverage', '杠杆'), formatLeverage(overview.leverage)],
  ];

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[190] flex h-[100dvh] items-end justify-center overflow-hidden bg-black/72 px-2 pb-2 pt-[calc(env(safe-area-inset-top)+18px)] backdrop-blur-[3px]"
      style={{
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        ...(visualViewportFrame ? {
          top: visualViewportFrame.top,
          height: visualViewportFrame.height,
        } : {}),
      }}
      role="dialog"
      aria-modal="true"
      aria-label={panel === 'editor'
        ? t(language, 'home.marginBalance', '设置融资余额')
        : t(language, 'home.marginRisk', '融资情景测算')}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose?.();
      }}
    >
      {panel === 'risk' ? (
        <section
          className="max-h-[88dvh] w-full max-w-[430px] overflow-y-auto rounded-[28px] border border-white/10 bg-[linear-gradient(165deg,rgba(23,27,34,0.99),rgba(11,15,20,0.995)_66%)] px-4 pb-5 pt-3 shadow-[0_-28px_80px_rgba(0,0,0,0.68),inset_0_1px_0_rgba(255,255,255,0.06)]"
          data-home-margin-risk-sheet="true"
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-white/30" />
          <div className="relative mt-3 flex min-h-9 items-center justify-center">
            <button
              type="button"
              onClick={openEditor}
              className="absolute left-0 rounded-full px-2 py-1 text-[11px] text-[#f6b54b] active:bg-[#f6b54b]/10"
            >
              {t(language, 'home.setMarginBalance', '设置余额')}
            </button>
            <h2 className="text-[17px] font-medium text-white/90">{t(language, 'home.marginRisk', '融资情景测算')}</h2>
            <button
              type="button"
              onClick={onClose}
              className="absolute right-0 flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.07] text-white/55 active:scale-95"
              aria-label={t(language, 'home.closeMarginRisk', '关闭融资情景测算')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-0.5 text-center text-[11px] text-white/38">
            {t(language, 'home.marginRiskSubtitle', '假设全部股票同步涨跌，融资负债保持不变')}
          </p>

          <div className="mt-4 grid grid-cols-4 divide-x divide-white/[0.07] rounded-2xl border border-white/[0.07] bg-white/[0.035] py-3">
            {currentCards.map(([label, value]) => <Metric key={label} label={label} value={value} />)}
          </div>

          <div className="mt-5 flex items-end justify-between">
            <div className="text-[12px] text-white/55">{t(language, 'home.stockPortfolioMove', '股票组合涨跌')}</div>
            <div className={`text-[21px] font-medium tabular-nums ${scenarioColorClass}`} style={{ fontFamily: NUMBER_FONT }}>
              {formatScenarioPercent(stress.normalizedScenarioPct)}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-6 gap-1">
            {SCENARIO_PRESETS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setScenarioPct(value)}
                className={`h-9 rounded-xl border px-0 text-[11px] tabular-nums active:scale-95 ${scenarioPct === value ? '' : 'border-white/[0.08] bg-white/[0.035] text-white/50'}`}
                style={scenarioPct === value ? {
                  borderColor: `${scenarioColor}66`,
                  backgroundColor: `${scenarioColor}18`,
                  color: scenarioColor,
                } : undefined}
              >
                {formatScenarioPercent(value)}
              </button>
            ))}
          </div>
          <InfiniteScenarioSlider
            language={language}
            value={scenarioPct}
            color={scenarioColor}
            onChange={setScenarioPct}
          />

          <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-black/15">
            {[
              {
                key: 'total',
                label: t(language, 'home.totalAssets', '总资产'),
                before: stress.totalAssetsUsd,
                after: stress.stressedTotalAssetsUsd,
                percent: stress.totalAssetsChangePct,
              },
              {
                key: 'net',
                label: t(language, 'home.netAssets', '净资产'),
                before: stress.netAssetsUsd,
                after: stress.stressedNetAssetsUsd,
                percent: stress.netAssetsChangePct,
              },
            ].map((item, index) => (
              <div key={item.key} className={`px-4 py-3.5 ${index ? 'border-t border-white/[0.07]' : ''}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] text-white/65">{item.label}</span>
                  <span className={`text-right text-[10px] ${scenarioColorClass}`}>
                    {t(
                      language,
                      scenarioDirection > 0
                        ? 'home.marginIncrease'
                        : scenarioDirection < 0
                          ? 'home.marginDecrease'
                          : 'home.marginUnchanged',
                      scenarioDirection > 0
                        ? '增加 {{amount}}（{{percent}}）'
                        : scenarioDirection < 0
                          ? '下降 {{amount}}（{{percent}}）'
                          : '不变 {{amount}}（{{percent}}）',
                      {
                        amount: formatMoneyFromUsd(Math.abs(stress.assetChangeUsd), currency, usdRate, 2),
                        percent: formatSignedRatioPercent(item.percent),
                      },
                    )}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[14px] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
                  <span className="min-w-0 truncate text-white/48">{formatMoneyFromUsd(item.before, currency, usdRate, 0)}</span>
                  <span className="text-white/20">→</span>
                  <span className={`min-w-0 truncate text-right ${scenarioColorClass}`}>{formatMoneyFromUsd(item.after, currency, usdRate, 0)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3.5 py-3 text-[11px]">
            <span className="min-w-0 truncate text-white/45">
              {t(language, 'home.marginDebtFixed', '融资负债保持 {{amount}}', {
                amount: formatMoneyFromUsd(overview.marginDebtUsd, currency, usdRate, 2),
              })}
            </span>
            <span className="shrink-0 text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
              {formatLeverage(overview.leverage)} → {formatLeverage(stress.stressedLeverage)}
            </span>
          </div>

          <p className="mt-4 text-center text-[10px] leading-4 text-white/28">
            {t(language, 'home.marginRiskBoundary', '仅用于个人融资情景测算，不影响比赛、收益报表和交易记录。')}
          </p>
        </section>
      ) : (
        <section
          className="max-h-full w-full max-w-[430px] overflow-y-auto overscroll-contain rounded-[28px] border border-white/10 bg-[linear-gradient(165deg,rgba(23,27,34,0.99),rgba(11,15,20,0.995)_66%)] px-5 pb-5 pt-3 shadow-[0_-28px_80px_rgba(0,0,0,0.68),inset_0_1px_0_rgba(255,255,255,0.06)]"
          style={{ scrollPaddingBottom: '96px' }}
          data-home-margin-balance-editor="true"
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-white/30" />
          <div className="relative mt-3 flex min-h-9 items-center justify-center">
            <h2 className="text-[17px] font-medium text-white/90">{t(language, 'home.marginBalance', '设置融资余额')}</h2>
            <button
              type="button"
              disabled={saving}
              onClick={closeEditor}
              className="absolute right-0 flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.07] text-white/55 active:scale-95 disabled:opacity-35"
              aria-label={t(language, 'home.cancel', '取消')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-0.5 text-center text-[11px] text-white/38">
            {t(language, 'home.marginBalanceSubtitle', '只调整个人融资负债，总资产保持不变')}
          </p>

          <div className="mt-5 flex items-center justify-between">
            <label htmlFor="home-margin-debt-input" className="text-[12px] text-white/55">
              {t(language, 'home.marginBalanceLabel', '融资余额（{{currency}}）', { currency })}
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setDraftDebt('0');
                setSaveError('');
              }}
              className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] text-white/48 active:scale-95 disabled:opacity-35"
            >
              {t(language, 'home.marginSetZero', '设为 0')}
            </button>
          </div>
          <div className="mt-2 flex h-14 items-center rounded-2xl border border-[#f6b54b]/35 bg-black/20 px-4 focus-within:border-[#f6b54b]/70">
            <span className="mr-2 text-[21px] text-[#ffd18a]">{currencySymbol}</span>
            <input
              id="home-margin-debt-input"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={draftDebt}
              disabled={saving}
              onChange={(event) => {
                const nextValue = event.target.value.trim().replace(/,/g, '');
                if (nextValue === '' || /^\d*(?:\.\d*)?$/.test(nextValue)) {
                  setDraftDebt(nextValue);
                  setSaveError('');
                } else {
                  setSaveError(t(language, 'home.marginBalanceInvalid', '请输入不小于 0 的有效金额'));
                }
              }}
              onFocus={(event) => {
                const input = event.currentTarget;
                window.setTimeout(() => input.scrollIntoView({ block: 'center', behavior: 'smooth' }), 180);
              }}
              className="min-w-0 flex-1 bg-transparent text-[24px] font-medium text-white/90 outline-none tabular-nums disabled:opacity-45"
              style={{ fontFamily: NUMBER_FONT }}
            />
          </div>

          <div className="mt-4 grid grid-cols-3 divide-x divide-white/[0.07] rounded-2xl border border-white/[0.07] bg-white/[0.035] py-3.5">
            <Metric label={t(language, 'home.totalAssets', '总资产')} value={formatMoneyFromUsd(draftOverview.totalAssetsUsd, currency, usdRate, 0)} />
            <Metric label={t(language, 'home.netAssets', '净资产')} value={formatMoneyFromUsd(draftOverview.netAssetsUsd, currency, usdRate, 0)} />
            <Metric label={t(language, 'home.leverage', '杠杆')} value={formatLeverage(draftOverview.leverage)} />
          </div>
          {draftDebtUsd !== null && draftOverview.netAssetsUsd <= 0 && (
            <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.07] px-3 py-2 text-[11px] leading-4 text-amber-200/75">
              {t(language, 'home.marginNetInsufficient', '融资负债已达到或超过总资产，净资产不足，杠杆不再显示。')}
            </p>
          )}
          {saveError && (
            <p className="mt-3 rounded-xl border border-rose-300/15 bg-rose-300/[0.07] px-3 py-2 text-[11px] leading-4 text-rose-200/80" role="alert">{saveError}</p>
          )}

          <p className="mt-4 text-center text-[10px] leading-4 text-white/28">
            {t(language, 'home.marginBalanceBoundary', '融资余额仅当前登录用户可见，不写入股票交易、比赛或收益报表。')}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={closeEditor}
              className="h-11 rounded-xl border border-white/[0.09] bg-white/[0.035] text-[13px] text-white/55 active:scale-[0.99] disabled:opacity-35"
            >
              {t(language, 'home.cancel', '取消')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={saveDebt}
              data-home-margin-save="true"
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#f6b54b] text-[13px] font-medium text-[#101318] active:scale-[0.99] disabled:opacity-55"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? t(language, 'home.marginSaving', '保存中…') : t(language, 'home.marginSave', '保存')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
