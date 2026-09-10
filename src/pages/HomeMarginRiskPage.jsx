import React from 'react';
import { ArrowLeft, Loader2, X } from 'lucide-react';
import {
  HOME_MARGIN_LEVERAGE_TIERS,
  deriveHomeMarginOverview,
  deriveHomeMarginStress,
  displayMarginDebtToUsd,
  homeMarginLeverageStatus,
  marginScenarioToTrackRatio,
  marginTrackRatioToScenario,
  normalizeMarginDebtUsd,
  normalizeMarginScenarioPct,
} from '../lib/homeMarginRisk.js';
import { t } from '../lib/i18n.js';
import { marketHexColor, marketTextClass } from '../lib/marketColorMode.js';
import AccountLeverageBadge from '../components/AccountLeverageBadge.jsx';
import './HomeMarginRiskPage.css';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const SCENARIO_PRESETS = [-40, -20, -10, 10, 20, 40];
const NEUTRAL_SCENARIO_COLOR = '#929298';
const LEVERAGE_TIER_DESCRIPTION = Object.freeze({
  none: ['home.leverageTier.noneDesc', '全部为自有权益'],
  low: ['home.leverageTier.lowDesc', '少量融资'],
  moderate: ['home.leverageTier.moderateDesc', '有明确融资敞口'],
  elevated: ['home.leverageTier.elevatedDesc', '下跌将明显放大净资产波动'],
  high: ['home.leverageTier.highDesc', '接近普通股票初始融资要求'],
  critical: ['home.leverageTier.criticalDesc', '净资产对下跌非常敏感'],
});

function displayRate(currency, usdRate) {
  const rate = Number(usdRate);
  return currency === 'CNY' && Number.isFinite(rate) && rate > 0 ? rate : 1;
}

function formatMoneyFromUsd(value, currency, usdRate) {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  const converted = numeric * displayRate(currency, usdRate);
  const sign = converted < 0 ? '-' : '';
  const symbol = currency === 'CNY' ? '¥' : '$';
  return `${sign}${symbol}${Math.abs(converted).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatWanReferenceFromUsd(value, currency, usdRate, language) {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  const converted = numeric * displayRate(currency, usdRate);
  const sign = converted < 0 ? '-' : '';
  const symbol = currency === 'CNY' ? '¥' : '$';
  const wan = (Math.abs(converted) / 10_000).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return language === 'en' ? `≈ ${sign}${symbol}${wan} × 10k` : `约 ${sign}${symbol}${wan} 万`;
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

function Metric({ label, value, reference }) {
  return (
    <div className="margin-report-metric">
      <div className="margin-report-label">{label}</div>
      <div className="margin-report-metric-value" style={{ fontFamily: NUMBER_FONT }}>{value}</div>
      {reference && <div className="margin-report-money-reference">{reference}</div>}
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
      className="margin-report-slider select-none"
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
      <div className="margin-report-slider-labels">
        <span>{t(language, 'home.marginDownsideFloor', '下跌最低 -100%')}</span>
        <button
          type="button"
          onClick={() => commitValue(0)}
          className="margin-report-reset"
        >
          {t(language, 'home.marginScenarioReset', '归零')}
        </button>
        <span className="text-right">{t(language, 'home.marginUpsideCeiling', '上涨最高 +100%')}</span>
      </div>
    </div>
  );
}

export default function HomeMarginRiskPage({ ctx = {} }) {
  const {
    closeHomeMarginRisk: onClose,
    homeMarginPreview = '',
    homeMarginScenarioPreview,
    investmentSummary = {},
    language = 'zh',
    availableCashStatusReady = false,
    marginStatus,
    marginStatusReady = true,
    marketColorMode,
    portfolioCurrencyMode = 'USD',
    saveMarginDebt: onSaveDebtUsd,
  } = ctx;
  const currencyMode = portfolioCurrencyMode === 'CNY' ? 'CNY' : 'USD';
  const usdRate = Number(investmentSummary?.usdRate) > 0 ? Number(investmentSummary.usdRate) : 1;
  const totalAssetsUsd = Number(investmentSummary?.totalAssetsUsd) || 0;
  const positionsMarketValueUsd = Number(investmentSummary?.positionsMarketValue) || 0;
  const cashUsd = Number(investmentSummary?.cashUsd) || 0;
  const marginDebtUsd = normalizeMarginDebtUsd(marginStatus?.currentMargin);
  const assetStatusReady = marginStatusReady && availableCashStatusReady;
  const initialPanel = homeMarginPreview === 'editor' ? 'editor' : 'risk';
  const initialScenarioPct = Number.isFinite(Number(homeMarginScenarioPreview))
    ? Number(homeMarginScenarioPreview)
    : 0;
  const normalizedInitialPanel = initialPanel === 'editor' ? 'editor' : 'risk';
  const [panel, setPanel] = React.useState(normalizedInitialPanel);
  const [scenarioPct, setScenarioPct] = React.useState(() => Math.round(normalizeMarginScenarioPct(initialScenarioPct)));
  const [draftDebt, setDraftDebt] = React.useState(() => {
    if (normalizedInitialPanel !== 'editor') return '';
    const displayedDebt = Number(marginDebtUsd) * displayRate(currencyMode, usdRate);
    return (Math.round(displayedDebt * 100) / 100).toFixed(2);
  });
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');
  const [showLeverageGuide, setShowLeverageGuide] = React.useState(homeMarginPreview === 'leverage');
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
  const leverageStatus = React.useMemo(() => homeMarginLeverageStatus(overview), [overview]);
  const financingShare = overview.totalAssetsUsd > 0
    ? overview.marginDebtUsd / overview.totalAssetsUsd
    : null;
  const scenarioDirection = Math.sign(stress.normalizedScenarioPct);
  const scenarioColorClass = scenarioDirection === 0
    ? 'text-white/55'
    : marketTextClass(scenarioDirection, marketColorMode);
  const scenarioColor = scenarioDirection === 0
    ? NEUTRAL_SCENARIO_COLOR
    : marketHexColor(scenarioDirection, marketColorMode);

  React.useEffect(() => {
    if (panel !== 'editor' && !showLeverageGuide) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [panel, showLeverageGuide]);

  React.useEffect(() => {
    if (panel !== 'editor' || typeof window === 'undefined' || !window.visualViewport) return undefined;
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
  }, [panel]);

  React.useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || saving) return;
      if (showLeverageGuide) setShowLeverageGuide(false);
      else if (panel === 'editor') setPanel('risk');
      else onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, panel, saving, showLeverageGuide]);

  const openEditor = () => {
    if (!assetStatusReady) return;
    const rate = displayRate(currency, usdRate);
    const displayDebt = overview.marginDebtUsd * rate;
    setDraftDebt((Math.round(displayDebt * 100) / 100).toFixed(2));
    setSaveError('');
    setPanel('editor');
  };

  const closeEditor = () => {
    if (saving) return;
    setSaveError('');
    setPanel('risk');
  };

  const saveDebt = async () => {
    if (!assetStatusReady) return;
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

  const moneyReading = (value, ready = assetStatusReady) => ({
    value: ready ? formatMoneyFromUsd(value, currency, usdRate) : '—',
    reference: ready ? formatWanReferenceFromUsd(value, currency, usdRate, language) : undefined,
  });
  const currentCards = [
    { id: 'total-assets', label: t(language, 'home.totalAssets', '总资产'), ...moneyReading(overview.totalAssetsUsd) },
    { id: 'net-assets', label: t(language, 'home.netAssets', '净资产'), ...moneyReading(overview.netAssetsUsd) },
    { id: 'margin-debt', label: t(language, 'home.marginDebt', '融资负债'), ...moneyReading(overview.marginDebtUsd) },
    { id: 'account-leverage', label: t(language, 'home.leverage', '杠杆'), value: assetStatusReady ? formatLeverage(overview.leverage) : '—' },
  ];

  return (
    <main
      className="margin-report-page mx-auto min-h-screen w-full pb-[calc(env(safe-area-inset-bottom)+28px)]"
      style={{ fontFamily: NUMBER_FONT }}
      data-home-margin-risk-page="true"
    >
      <header className="margin-report-header sticky top-0 z-20">
        <div className="margin-report-header-row">
          <button
            type="button"
            onClick={onClose}
            className="margin-report-back"
            aria-label={t(language, 'home.closeMarginRisk', '返回首页')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1>{t(language, 'home.marginRisk', '融资情景测算')}</h1>
          <button
            type="button"
            disabled={!assetStatusReady}
            onClick={openEditor}
            className="margin-report-text-action"
          >
            {t(language, 'home.setMarginBalance', '设置余额')}
          </button>
        </div>
      </header>

      <section className="margin-report-content" data-home-margin-risk-content="true">
        <p className="margin-report-subtitle">
          {t(language, 'home.marginRiskSubtitle', '假设全部股票同步涨跌，融资负债保持不变')}
        </p>

          <div className="margin-report-current" aria-label={language === 'en' ? 'Current account' : '当前账户'}>
            {currentCards.map((card) => (
              card.id === 'account-leverage' ? (
                <button
                  key={card.id}
                  type="button"
                  aria-expanded={showLeverageGuide}
                  aria-haspopup="dialog"
                  aria-label={t(language, 'home.leverageInfoOpen', '查看账户杠杆说明')}
                  disabled={!assetStatusReady}
                  className="margin-report-leverage-trigger"
                  data-home-margin-leverage-info-trigger="true"
                  onClick={() => {
                    if (assetStatusReady) setShowLeverageGuide(true);
                  }}
                >
                  <Metric label={card.label} value={card.value} />
                </button>
              ) : (
                <Metric key={card.id} label={card.label} value={card.value} reference={card.reference} />
              )
            ))}
          </div>

        <section className="margin-report-scenario" aria-labelledby="home-margin-scenario-title">
          <div className="margin-report-scenario-heading">
            <h2 id="home-margin-scenario-title">{t(language, 'home.stockPortfolioMove', '股票组合涨跌')}</h2>
            <div className={`margin-report-scenario-value ${scenarioColorClass}`} style={{ fontFamily: NUMBER_FONT }}>
              {formatScenarioPercent(stress.normalizedScenarioPct)}
            </div>
          </div>
          <div className="margin-report-presets grid grid-cols-6">
            {SCENARIO_PRESETS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setScenarioPct(value)}
                aria-pressed={scenarioPct === value}
                className="margin-report-preset"
                style={scenarioPct === value ? {
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
        </section>

        <section className="margin-report-results" aria-labelledby="home-margin-results-title" data-home-margin-scenario-results="true">
          <h2 id="home-margin-results-title">{language === 'en' ? 'Scenario results' : '情景测算结果'}</h2>
            {[
              {
                key: 'net',
                label: t(language, 'home.netAssets', '净资产'),
                before: stress.netAssetsUsd,
                after: stress.stressedNetAssetsUsd,
                percent: stress.netAssetsChangePct,
              },
              {
                key: 'total',
                label: t(language, 'home.totalAssets', '总资产'),
                before: stress.totalAssetsUsd,
                after: stress.stressedTotalAssetsUsd,
                percent: stress.totalAssetsChangePct,
              },
            ].map((item) => (
              <div key={item.key} className="margin-report-result" data-home-margin-result={item.key}>
                <div className="margin-report-result-heading">
                  <span className="margin-report-label">{item.label}</span>
                  <span className="margin-report-before">{language === 'en' ? 'Current' : '当前'} {assetStatusReady ? formatMoneyFromUsd(item.before, currency, usdRate) : '—'}</span>
                </div>
                <div className={`margin-report-result-value ${scenarioColorClass}`} style={{ fontFamily: NUMBER_FONT }}>
                  {assetStatusReady ? formatMoneyFromUsd(item.after, currency, usdRate) : '—'}
                </div>
                {assetStatusReady && (
                  <div className="margin-report-money-reference">{formatWanReferenceFromUsd(item.after, currency, usdRate, language)}</div>
                )}
                  <div className={`margin-report-result-change ${scenarioColorClass}`}>
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
                        amount: assetStatusReady
                          ? formatMoneyFromUsd(Math.abs(stress.assetChangeUsd), currency, usdRate)
                          : '—',
                        percent: assetStatusReady ? formatSignedRatioPercent(item.percent) : '—',
                      },
                    )}
                  </div>
              </div>
            ))}
        </section>

          <div className="margin-report-debt-note">
            <span>
              {t(language, 'home.marginDebtFixed', '融资负债保持 {{amount}}', {
                amount: assetStatusReady ? formatMoneyFromUsd(overview.marginDebtUsd, currency, usdRate) : '—',
              })}
            </span>
            <span className="margin-report-leverage-change">
              <span>{t(language, 'home.leverage', '杠杆')}</span>
              <span style={{ fontFamily: NUMBER_FONT }}>{assetStatusReady ? formatLeverage(overview.leverage) : '—'} → {assetStatusReady ? formatLeverage(stress.stressedLeverage) : '—'}</span>
            </span>
          </div>

          <p className="margin-report-boundary">
            {t(language, 'home.marginRiskBoundary', '仅用于个人融资情景测算，不影响比赛、收益报表和交易记录。')}
          </p>
      </section>

      {showLeverageGuide && assetStatusReady && (
        <div
          className="margin-report-overlay fixed inset-0 z-[190] flex items-end justify-center bg-black/[0.72] px-2 pb-2 pt-[calc(env(safe-area-inset-top)+18px)] backdrop-blur-[5px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="home-margin-leverage-info-title"
          style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowLeverageGuide(false);
          }}
        >
          <section
            className="margin-report-sheet max-h-[82dvh] w-full max-w-[430px] overflow-y-auto overscroll-contain"
            data-home-margin-leverage-info-sheet="true"
          >
            <div className="margin-report-sheet-header">
              <h2 id="home-margin-leverage-info-title">
                {t(language, 'home.leverageInfoTitle', '账户杠杆说明')}
              </h2>
              <button
                type="button"
                onClick={() => setShowLeverageGuide(false)}
                className="margin-report-close"
                aria-label={t(language, 'home.cancel', '关闭')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="margin-report-subtitle">
              {t(language, 'home.leverageInfoSubtitle', '杠杆越高，市场波动对净资产的放大越明显')}
            </p>

            <div className="margin-report-guide-overview">
              <div>
                <div className="margin-report-label">{t(language, 'home.currentLeverage', '当前账户杠杆')}</div>
                <div className="margin-report-guide-value">{formatLeverage(overview.leverage)}</div>
              </div>
              <div className="text-right">
                {leverageStatus && (
                  <AccountLeverageBadge className="h-6 px-2.5 text-[10px]" language={language} tierId={leverageStatus.id} />
                )}
                <div className="mt-2 text-[11px] text-white/40 tabular-nums">
                  {t(language, 'home.marginShare', '融资占总资产 {{percent}}', {
                    percent: Number.isFinite(financingShare) ? `${(financingShare * 100).toFixed(1)}%` : '—',
                  })}
                </div>
              </div>
            </div>

            <div className="margin-report-tier-heading">
              <span>{t(language, 'home.leverageRange', '账户杠杆 / 融资占比')}</span>
              <span>{t(language, 'home.leverageState', '状态')}</span>
              <span>{t(language, 'home.leverageDescription', '说明')}</span>
            </div>
            <div className="margin-report-tier-list">
              {HOME_MARGIN_LEVERAGE_TIERS.map((tier) => {
                const [descriptionKey, descriptionFallback] = LEVERAGE_TIER_DESCRIPTION[tier.id];
                const isCurrent = leverageStatus?.id === tier.id;
                return (
                  <div
                    key={tier.id}
                    className={`margin-report-tier ${isCurrent ? 'is-current' : ''}`}
                    data-home-margin-leverage-tier={tier.id}
                  >
                    <div>
                      <div className="whitespace-nowrap text-[11px] text-white/[0.74] tabular-nums">{tier.leverageRange}</div>
                      <div className="mt-1 whitespace-nowrap text-[11px] text-white/35">{tier.financingShareRange}</div>
                    </div>
                    <AccountLeverageBadge className="min-h-[22px] px-1.5 text-[10px]" language={language} tierId={tier.id} />
                    <div className="margin-report-tier-description">
                      {t(language, descriptionKey, descriptionFallback)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="margin-report-formulas">
              <div className="flex items-center justify-between gap-3">
                <span>{t(language, 'home.leverageFormula', '账户杠杆')}</span>
                <span className="text-white/50">{t(language, 'home.leverageFormulaValue', '总资产 ÷ 净资产')}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>{t(language, 'home.marginShareFormula', '融资占比')}</span>
                <span className="text-white/50">{t(language, 'home.marginShareFormulaValue', '融资负债 ÷ 总资产')}</span>
              </div>
            </div>
          </section>
        </div>
      )}

      {panel === 'editor' && assetStatusReady && (
        <div
          className="margin-report-overlay fixed left-0 right-0 top-0 z-[190] flex h-[100dvh] items-end justify-center overflow-hidden bg-black/72 px-2 pb-2 pt-[calc(env(safe-area-inset-top)+18px)] backdrop-blur-[3px]"
          style={{
            paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
            ...(visualViewportFrame ? {
              top: visualViewportFrame.top,
              height: visualViewportFrame.height,
            } : {}),
          }}
          role="dialog"
          aria-modal="true"
          aria-label={t(language, 'home.marginBalance', '设置融资余额')}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) closeEditor();
          }}
        >
          <section
            className="margin-report-sheet max-h-full w-full max-w-[430px] overflow-y-auto overscroll-contain"
            style={{ scrollPaddingBottom: '96px' }}
            data-home-margin-balance-editor="true"
          >
          <div className="margin-report-sheet-header">
            <h2>{t(language, 'home.marginBalance', '设置融资余额')}</h2>
            <button
              type="button"
              disabled={saving}
              onClick={closeEditor}
              className="margin-report-close"
              aria-label={t(language, 'home.cancel', '取消')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="margin-report-subtitle">
            {t(language, 'home.marginBalanceSubtitle', '只调整个人融资负债，总资产保持不变')}
          </p>

          <div className="margin-report-field-heading">
            <label htmlFor="home-margin-debt-input" className="margin-report-label">
              {t(language, 'home.marginBalanceLabel', '融资余额（{{currency}}）', { currency })}
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setDraftDebt('0.00');
                setSaveError('');
              }}
              className="margin-report-text-action"
            >
              {t(language, 'home.marginSetZero', '设为 0')}
            </button>
          </div>
          <div className="margin-report-debt-input">
            <span>{currencySymbol}</span>
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
              className="margin-report-debt-field"
              style={{ fontFamily: NUMBER_FONT }}
            />
          </div>
          {draftDebtUsd !== null && (
            <div className="margin-report-money-reference">{formatWanReferenceFromUsd(draftDebtUsd, currency, usdRate, language)}</div>
          )}

          <div className="margin-report-draft-metrics">
            <Metric label={t(language, 'home.totalAssets', '总资产')} {...moneyReading(draftOverview.totalAssetsUsd)} />
            <Metric label={t(language, 'home.netAssets', '净资产')} {...moneyReading(draftOverview.netAssetsUsd, draftDebtUsd !== null)} />
            <Metric label={t(language, 'home.leverage', '杠杆')} value={draftDebtUsd !== null ? formatLeverage(draftOverview.leverage) : '—'} />
          </div>
          {draftDebtUsd !== null && draftOverview.netAssetsUsd <= 0 && (
            <p className="margin-report-feedback margin-report-warning">
              {t(language, 'home.marginNetInsufficient', '融资负债已达到或超过总资产，净资产不足，账户杠杆不再显示。')}
            </p>
          )}
          {saveError && (
            <p className="margin-report-feedback margin-report-error" role="alert">{saveError}</p>
          )}

          <p className="margin-report-boundary">
            {t(language, 'home.marginBalanceBoundary', '融资余额仅当前登录用户可见，不写入股票交易、比赛或收益报表。')}
          </p>
          <div className="margin-report-actions">
            <button
              type="button"
              disabled={saving}
              onClick={closeEditor}
              className="margin-report-action"
            >
              {t(language, 'home.cancel', '取消')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={saveDebt}
              data-home-margin-save="true"
              className="margin-report-action margin-report-primary"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? t(language, 'home.marginSaving', '保存中…') : t(language, 'home.marginSave', '保存')}
            </button>
          </div>
          </section>
        </div>
      )}
    </main>
  );
}
