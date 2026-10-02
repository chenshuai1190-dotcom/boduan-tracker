import React from 'react';
import { marketHexColor, marketTextClass } from '../lib/marketColorMode.js';
import { isEnglishLanguage, t } from '../lib/i18n.js';
import {
  buildAreaPathFromPoints, buildLinePathFromPoints, buildChartDomain, buildLinePoints, buildChartRecordHighs, chartX,
  isExplicitUnknownNetAssetPoint, isRenderableChartValue, splitChartPointSegments, splitChartLineBySign,
} from '../lib/pnlReportChart.js';
import './PnlReportTrendChart.css';
import './PulseDot.css';

const PNL_CHART_WIDTH = 310;
const PNL_CHART_HEIGHT = 210;
const PNL_CHART_PAD = 8;
const NET_ASSET_COLOR = '#ff5038';
const TOTAL_ASSET_COLOR = '#f6b54b';
const MARGIN_DEBT_COLOR = '#789ac0';
const BENCHMARK_COLOR = '#789ac0';

function nullableSignedPct(value, digits = 2) {
  if (!isRenderableChartValue(value)) return '--';
  const percent = Number(value) * 100;
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(digits)}%`;
}

function convertUsd(value, displayRate) {
  return isRenderableChartValue(value) && isRenderableChartValue(displayRate) && Number(displayRate) > 0
    ? Number(value) * Number(displayRate) : null;
}

function historicalLeverage(point) {
  // Match Home's total-assets / net-assets definition using the selected
  // snapshot's equity. Missing historical financing must not become zero.
  if (!['totalAssetUsd', 'marginDebtUsd', 'netAssetUsd'].every(key => isRenderableChartValue(point?.[key]))
    || Number(point.totalAssetUsd) <= 0 || Number(point.marginDebtUsd) < 0 || Number(point.netAssetUsd) <= 0) return null;
  const leverage = Number(point.totalAssetUsd) / Number(point.netAssetUsd);
  return Number.isFinite(leverage) ? leverage : null;
}

function currencyAmount(value, currency = 'USD', digits = 2) {
  if (!isRenderableChartValue(value)) return '--';
  const amount = Number(value);
  const symbol = currency === 'CNY' ? '¥' : '$';
  return `${amount < 0 ? '-' : ''}${symbol}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function signedCurrencyAmount(value, currency = 'USD') {
  if (!isRenderableChartValue(value)) return '--';
  return `${Number(value) >= 0 ? '+' : ''}${currencyAmount(value, currency, 2)}`;
}

function buildAmountDomain(data) {
  const values = data.filter(point => isRenderableChartValue(point?.pnlUsd)).map(point => Number(point.pnlUsd));
  if (!values.length) return null;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const padding = Math.max((max - min) * 0.08, Math.max(Math.abs(min), Math.abs(max)) * 0.01, 0.01);
  return { min: min - padding, max: max + padding };
}

function compactAssetAxisValue(value, englishMode) {
  if (!isRenderableChartValue(value)) return '--';
  const n = Number(value);
  const abs = Math.abs(n);
  if (!englishMode && abs >= 10000) return `${(n / 10000).toFixed(abs >= 1000000 ? 0 : 1)}万`;
  if (abs >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(0);
}

function compactAmountAxisValue(value, englishMode) {
  if (!isRenderableChartValue(value)) return '--';
  const n = Number(value);
  const abs = Math.abs(n);
  if (!englishMode && abs >= 10000) return `${(n / 10000).toFixed(abs >= 1000000 ? 0 : 1)}万`;
  if (englishMode && abs >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (englishMode && abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(abs < 10 ? 2 : abs < 100 ? 1 : 0);
}

function displayTooltipDate(dateKey, englishMode) {
  const [year, month, day] = String(dateKey || '').split('-');
  if (!year || !month || !day) return '--';
  const date = new Date(`${dateKey}T00:00:00Z`);
  const weekday = Number.isNaN(date.getTime()) ? null : date.getUTCDay();
  if (englishMode) return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday] || ''} ${Number(month)}/${Number(day)}/${year}`.trim();
  return `${year}/${Number(month)}/${Number(day)} ${['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][weekday] || ''}`.trim();
}

export default function PnlReportTrendChart({
  data = [], mode, color, language, marketColorMode, displayCurrency, displayRate, initialSelectedDate = '', showCombinedPersonalReadout = false,
}) {
  const englishMode = isEnglishLanguage(language);
  const [selectedIndex, setSelectedIndex] = React.useState(null);
  const chartRootRef = React.useRef(null);
  const activePointerRef = React.useRef(null);
  const gradientId = `pnl-report-area-${React.useId().replace(/:/g, '')}`;
  const primaryKey = mode === 'assets' ? 'netAssetUsd' : mode === 'amount' ? 'pnlUsd' : 'pnlPct';
  const hasBenchmark = data.some(point => isRenderableChartValue(point?.benchmarkPct));
  const showBenchmark = mode === 'pnl' && hasBenchmark;
  const primaryDomain = React.useMemo(() => {
    if (mode === 'assets') return buildChartDomain(data, ['netAssetUsd', 'totalAssetUsd', 'marginDebtUsd'], 'assets');
    if (mode === 'amount') return buildAmountDomain(data);
    return buildChartDomain(data, ['pnlPct', 'benchmarkPct'], 'percentage');
  }, [data, mode]);
  const primaryPoints = React.useMemo(() => buildLinePoints(data, primaryKey, primaryDomain), [data, primaryKey, primaryDomain]);
  const recordHighPoints = React.useMemo(() => buildChartRecordHighs(primaryPoints), [primaryPoints]);
  const latestRecordHigh = (mode === 'amount'
    ? recordHighPoints.filter(point => point.value > 0).at(-1)
    : recordHighPoints.at(-1)) || null;
  // Keep the value tied to the period high when the selected chart date changes.
  const recordHighValue = mode === 'pnl' ? latestRecordHigh?.value : convertUsd(latestRecordHigh?.value, displayRate);
  const recordHighValueText = mode === 'pnl'
    ? (isRenderableChartValue(recordHighValue)
      ? `${(Number(recordHighValue) * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%` : '--')
    : mode === 'assets' ? currencyAmount(recordHighValue, displayCurrency) : signedCurrencyAmount(recordHighValue, displayCurrency);
  const primaryColor = mode === 'assets' ? NET_ASSET_COLOR
    : mode === 'amount' ? marketHexColor(latestRecordHigh?.value, marketColorMode) : color;
  const recordHighLabel = mode === 'assets'
    ? t(language, 'pnlReport.netAssetPeriodHigh', '净资产区间新高')
    : mode === 'amount'
      ? t(language, 'pnlReport.amountPeriodHigh', '盈亏金额区间新高')
      : t(language, 'pnlReport.returnPeriodHigh', '收益率区间新高');
  const totalAssetPoints = React.useMemo(() => mode === 'assets' ? buildLinePoints(data, 'totalAssetUsd', primaryDomain) : [], [data, mode, primaryDomain]);
  const marginDebtPoints = React.useMemo(() => mode === 'assets' ? buildLinePoints(data, 'marginDebtUsd', primaryDomain) : [], [data, mode, primaryDomain]);
  const marginDebtSegments = React.useMemo(() => splitChartPointSegments(data, marginDebtPoints,
    point => !isRenderableChartValue(point?.marginDebtUsd)), [data, marginDebtPoints]);
  const benchmarkPoints = React.useMemo(() => showBenchmark ? buildLinePoints(data, 'benchmarkPct', primaryDomain) : [], [data, showBenchmark, primaryDomain]);
  const primarySegments = React.useMemo(() => mode === 'assets'
    ? splitChartPointSegments(data, primaryPoints, isExplicitUnknownNetAssetPoint)
    : (primaryPoints.length ? [primaryPoints] : []), [data, mode, primaryPoints]);
  // Solid-color segments avoid scroll-dependent SVG gradient strokes on iOS.
  const primaryPaths = primarySegments.flatMap(points => mode === 'amount'
    ? splitChartLineBySign(points) : [{ points, sign: null }])
    .map(({ points, sign }) => ({ d: buildLinePathFromPoints(points), sign })).filter(({ d }) => d);
  const totalAssetPath = mode === 'assets' ? buildLinePathFromPoints(totalAssetPoints) : '';
  const marginDebtPaths = marginDebtSegments.filter(segment => segment.length > 1).map(buildLinePathFromPoints);
  const benchmarkPath = showBenchmark ? buildLinePathFromPoints(benchmarkPoints) : '';
  const areaPaths = mode === 'amount' ? [] : primarySegments.map(segment => buildAreaPathFromPoints(segment, PNL_CHART_HEIGHT, PNL_CHART_PAD)).filter(Boolean);
  const pointSlots = React.useMemo(() => data.map((point, index) => ({ point, index, x: chartX(index, data.length) })), [data]);
  const selectableSlots = mode === 'assets' ? totalAssetPoints : mode === 'amount' ? primaryPoints : pointSlots;
  const primaryByIndex = React.useMemo(() => new Map(primaryPoints.map(point => [point.index, point])), [primaryPoints]);
  const totalAssetByIndex = React.useMemo(() => new Map(totalAssetPoints.map(point => [point.index, point])), [totalAssetPoints]);
  const marginDebtByIndex = React.useMemo(() => new Map(marginDebtPoints.map(point => [point.index, point])), [marginDebtPoints]);
  const benchmarkByIndex = React.useMemo(() => new Map(benchmarkPoints.map(point => [point.index, point])), [benchmarkPoints]);
  const selectedSlot = selectedIndex == null ? null : pointSlots[selectedIndex] || null;
  const selectedPrimary = selectedSlot ? primaryByIndex.get(selectedSlot.index) || null : null;
  const selectedTotalAsset = selectedSlot ? totalAssetByIndex.get(selectedSlot.index) || null : null;
  const selectedMarginDebt = selectedSlot ? marginDebtByIndex.get(selectedSlot.index) || null : null;
  const selectedBenchmark = selectedSlot ? benchmarkByIndex.get(selectedSlot.index) || null : null;
  const latestReadoutSlot = React.useMemo(() => [...selectableSlots].reverse().find(slot => (
    primaryByIndex.has(slot.index) || totalAssetByIndex.has(slot.index) || benchmarkByIndex.has(slot.index)
  )) || null, [selectableSlots, primaryByIndex, totalAssetByIndex, benchmarkByIndex]);
  const readoutSlot = selectedSlot || latestReadoutSlot;
  const readoutPrimary = readoutSlot ? primaryByIndex.get(readoutSlot.index) || null : null;
  const readoutTotalAsset = readoutSlot ? totalAssetByIndex.get(readoutSlot.index) || null : null;
  const readoutMarginDebt = readoutSlot ? marginDebtByIndex.get(readoutSlot.index) || null : null;
  const readoutLeverage = mode === 'assets' ? historicalLeverage(readoutSlot?.point) : null;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(ratio => PNL_CHART_PAD + ratio * (PNL_CHART_HEIGHT - PNL_CHART_PAD * 2));
  const axisValues = primaryDomain ? gridLines.map(y => {
    const ratio = (y - PNL_CHART_PAD) / (PNL_CHART_HEIGHT - PNL_CHART_PAD * 2);
    return primaryDomain.max - ratio * (primaryDomain.max - primaryDomain.min);
  }) : gridLines.map(() => null);
  const assetAxisLabels = axisValues.map(value => compactAssetAxisValue(convertUsd(value, displayRate), englishMode));
  const zeroY = mode === 'amount' && primaryDomain
    ? PNL_CHART_PAD + (primaryDomain.max / (primaryDomain.max - primaryDomain.min)) * (PNL_CHART_HEIGHT - PNL_CHART_PAD * 2)
    : null;
  const axisLabels = mode === 'assets' ? assetAxisLabels : mode === 'amount'
    ? axisValues.map((value, index) => Math.abs(gridLines[index] - zeroY) < 10
      ? '' : compactAmountAxisValue(convertUsd(value, displayRate), englishMode))
    : axisValues.map(value => isRenderableChartValue(value)
      ? `${(value * 100).toFixed(primaryDomain.max - primaryDomain.min < 0.04 ? 2 : 1)}%` : '--');

  React.useEffect(() => { activePointerRef.current = null; setSelectedIndex(null); }, [data, mode]);
  React.useEffect(() => {
    if (!initialSelectedDate) return;
    const selected = selectableSlots.find(slot => slot?.point?.date === initialSelectedDate);
    if (selected) setSelectedIndex(selected.index);
  }, [initialSelectedDate, selectableSlots]);
  React.useEffect(() => {
    if (selectedIndex == null) return undefined;
    const closeOnOutsidePointer = event => {
      if (!chartRootRef.current?.contains(event.target)) setSelectedIndex(null);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
  }, [selectedIndex]);
  const updateSelection = React.useCallback(event => {
    if (!selectableSlots.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const x = ((event.clientX - rect.left) / rect.width) * PNL_CHART_WIDTH;
    let nearest = selectableSlots[0];
    selectableSlots.forEach(slot => { if (Math.abs(slot.x - x) < Math.abs(nearest.x - x)) nearest = slot; });
    setSelectedIndex(nearest.index);
  }, [selectableSlots]);
  const handlePointerDown = React.useCallback(event => {
    if (event.isPrimary === false) return;
    activePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateSelection(event);
  }, [updateSelection]);
  const handlePointerMove = React.useCallback(event => {
    if (activePointerRef.current === event.pointerId) updateSelection(event);
  }, [updateSelection]);
  const finishPointer = React.useCallback(event => {
    if (activePointerRef.current !== event.pointerId) return;
    activePointerRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  return <div ref={chartRootRef} className="pnl-trend-chart">
    <div className="pnl-trend-readout" data-mode={mode} data-combined-personal={mode === 'amount' && showCombinedPersonalReadout ? 'true' : undefined}>
      <div className="pnl-trend-readout-heading">
        <span>{displayTooltipDate(readoutSlot?.point?.date, englishMode)}</span>
        {(mode === 'assets' || (mode === 'amount' && !showCombinedPersonalReadout)) && <span>{displayCurrency}</span>}
      </div>
      {readoutSlot && mode === 'pnl' && <div className="pnl-trend-compare" data-pnl-report-compare-tooltip="true">
        <span />
        <span className="pnl-trend-column-label">{t(language, 'pnlReport.tooltip.daily', '当日')}</span>
        <span className="pnl-trend-column-label">{t(language, 'pnlReport.tooltip.cumulative', '累计')}</span>
        <span className="pnl-trend-series-label"><i style={{ background: color }} />{t(language, 'pnlReport.mine', '我的')}</span>
        <span className={isRenderableChartValue(readoutSlot.point?.dailyPnlPct) ? marketTextClass(readoutSlot.point?.dailyPnlPct, marketColorMode) : 'pnl-trend-missing'}>{nullableSignedPct(readoutSlot.point?.dailyPnlPct, 2)}</span>
        <span className={isRenderableChartValue(readoutSlot.point?.pnlPct) ? marketTextClass(readoutSlot.point?.pnlPct, marketColorMode) : 'pnl-trend-missing'}>{nullableSignedPct(readoutSlot.point?.pnlPct, 2)}</span>
        {showBenchmark && <>
          <span className="pnl-trend-series-label"><i style={{ background: BENCHMARK_COLOR }} />{t(language, 'pnlReport.nasdaq', '纳斯达克')}</span>
          <span className={isRenderableChartValue(readoutSlot.point?.benchmarkDailyPct) ? marketTextClass(readoutSlot.point?.benchmarkDailyPct, marketColorMode) : 'pnl-trend-missing'}>{nullableSignedPct(readoutSlot.point?.benchmarkDailyPct, 2)}</span>
          <span className={isRenderableChartValue(readoutSlot.point?.benchmarkPct) ? marketTextClass(readoutSlot.point?.benchmarkPct, marketColorMode) : 'pnl-trend-missing'}>{nullableSignedPct(readoutSlot.point?.benchmarkPct, 2)}</span>
        </>}
      </div>}
      {readoutSlot && mode === 'amount' && showCombinedPersonalReadout && <div className="pnl-trend-personal-readout" data-stock-pnl-combined-readout="true">
        <span />
        <span className="pnl-trend-column-label">{englishMode ? 'P&L amount' : '盈亏金额'}</span>
        <span className="pnl-trend-column-label">{englishMode ? 'Return' : '收益率'}</span>
        <span className="pnl-trend-personal-period">{t(language, 'pnlReport.tooltip.daily', '当日')}</span>
        <span className={isRenderableChartValue(readoutSlot.point?.dailyPnlUsd) ? marketTextClass(readoutSlot.point.dailyPnlUsd, marketColorMode) : 'pnl-trend-missing'}>{signedCurrencyAmount(convertUsd(readoutSlot.point?.dailyPnlUsd, displayRate), displayCurrency)}</span>
        <span className={isRenderableChartValue(readoutSlot.point?.dailyPnlPct) ? marketTextClass(readoutSlot.point.dailyPnlPct, marketColorMode) : 'pnl-trend-missing'}>{nullableSignedPct(readoutSlot.point?.dailyPnlPct, 2)}</span>
        <span className="pnl-trend-personal-period">{t(language, 'pnlReport.tooltip.cumulative', '累计')}</span>
        <span className={isRenderableChartValue(readoutSlot.point?.pnlUsd) ? marketTextClass(readoutSlot.point.pnlUsd, marketColorMode) : 'pnl-trend-missing'}>{signedCurrencyAmount(convertUsd(readoutSlot.point?.pnlUsd, displayRate), displayCurrency)}</span>
        <span className={isRenderableChartValue(readoutSlot.point?.pnlPct) ? marketTextClass(readoutSlot.point.pnlPct, marketColorMode) : 'pnl-trend-missing'}>{nullableSignedPct(readoutSlot.point?.pnlPct, 2)}</span>
      </div>}
      {readoutSlot && mode === 'amount' && !showCombinedPersonalReadout && <div className="pnl-trend-amount-readout" data-pnl-report-amount-tooltip="true">
        <span>{t(language, 'pnlReport.tooltip.dailyAmount', '当日盈亏')}</span>
        <span className={isRenderableChartValue(readoutSlot.point?.dailyPnlUsd) ? marketTextClass(readoutSlot.point.dailyPnlUsd, marketColorMode) : 'pnl-trend-missing'}>
          {signedCurrencyAmount(convertUsd(readoutSlot.point?.dailyPnlUsd, displayRate), displayCurrency)}
        </span>
        <span>{t(language, 'pnlReport.tooltip.periodAmount', '区间累计')}</span>
        <span className={isRenderableChartValue(readoutSlot.point?.pnlUsd) ? marketTextClass(readoutSlot.point.pnlUsd, marketColorMode) : 'pnl-trend-missing'}>
          {signedCurrencyAmount(convertUsd(readoutSlot.point?.pnlUsd, displayRate), displayCurrency)}
        </span>
      </div>}
      {readoutSlot && readoutTotalAsset && mode === 'assets' && <div data-pnl-report-asset-tooltip="true">
        <div className="pnl-trend-asset-readout">
          <span className="pnl-trend-series-label"><i style={{ background: NET_ASSET_COLOR }} />{t(language, 'pnlReport.tooltip.netAssets', '净资产')}</span>
          <span style={{ color: readoutPrimary ? NET_ASSET_COLOR : undefined }}>{readoutPrimary ? currencyAmount(convertUsd(readoutSlot.point?.netAssetUsd, displayRate), displayCurrency, 2) : '--'}</span>
          <span className="pnl-trend-series-label"><i style={{ background: TOTAL_ASSET_COLOR }} />{t(language, 'pnlReport.tooltip.totalAssets', '总资产')}</span>
          <span style={{ color: TOTAL_ASSET_COLOR }}>{currencyAmount(convertUsd(readoutSlot.point?.totalAssetUsd, displayRate), displayCurrency, 2)}</span>
          <span className="pnl-trend-series-label"><i style={{ background: MARGIN_DEBT_COLOR }} />{t(language, 'pnlReport.tooltip.marginDebt', '融资额')}</span>
          <span data-pnl-report-margin-value="true" className={readoutMarginDebt ? undefined : 'pnl-trend-missing'} style={{ color: readoutMarginDebt ? MARGIN_DEBT_COLOR : undefined }}>{currencyAmount(convertUsd(readoutSlot.point?.marginDebtUsd, displayRate), displayCurrency, 2)}</span>
          <span className="pnl-trend-series-label"><i style={{ background: '#82828c' }} />{t(language, 'pnlReport.tooltip.leverage', '杠杆率')}</span>
          <span data-pnl-report-leverage-value="true" className={readoutLeverage == null ? 'pnl-trend-missing' : undefined}>{readoutLeverage == null ? '--' : `${readoutLeverage.toFixed(2)}×`}</span>
          <span className="pnl-trend-series-label"><i className="pnl-trend-cash-dot" />{t(language, 'pnlReport.tooltip.availableCash', '可用现金')}</span>
          <span>{currencyAmount(readoutSlot.point?.cashKnown ? convertUsd(readoutSlot.point?.cashUsd, displayRate) : 0, displayCurrency, 2)}</span>
        </div>
      </div>}
    </div>
    <div className="pnl-trend-plot-layout">
      <div className="pnl-trend-plot" data-pnl-report-chart-hit-area="true" onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove} onPointerUp={finishPointer} onPointerCancel={finishPointer}
        onLostPointerCapture={finishPointer} style={{ touchAction: 'pan-y' }}>
        <svg viewBox={`0 0 ${PNL_CHART_WIDTH} ${PNL_CHART_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={mode === 'assets' ? NET_ASSET_COLOR : color} stopOpacity="0.13" />
            <stop offset="100%" stopColor={mode === 'assets' ? NET_ASSET_COLOR : color} stopOpacity="0" />
          </linearGradient></defs>
          {gridLines.map(y => <line key={y} x1={PNL_CHART_PAD} y1={y} x2={PNL_CHART_WIDTH - PNL_CHART_PAD} y2={y} stroke="rgba(255,255,255,0.07)" vectorEffect="non-scaling-stroke" />)}
          {zeroY != null && <line className="pnl-trend-zero-line" x1={PNL_CHART_PAD} y1={zeroY} x2={PNL_CHART_WIDTH - PNL_CHART_PAD} y2={zeroY} stroke="rgba(255,255,255,0.38)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
          {areaPaths.map((path, index) => <path key={`area-${index}`} d={path} fill={`url(#${gradientId})`} />)}
          {totalAssetPath && <path d={totalAssetPath} fill="none" stroke={TOTAL_ASSET_COLOR} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          {primaryPaths.map(({ d, sign }, index) => <path key={`line-${index}`} d={d} data-pnl-amount-sign={sign ?? undefined} fill="none" stroke={mode === 'assets' ? NET_ASSET_COLOR : mode === 'amount' ? marketHexColor(sign, marketColorMode) : color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
          {primarySegments.filter(segment => segment.length === 1).map(segment => <circle key={`single-${segment[0].index}`} cx={segment[0].x} cy={segment[0].y} r="2.4" fill={mode === 'assets' ? NET_ASSET_COLOR : mode === 'amount' ? marketHexColor(segment[0].value, marketColorMode) : color} />)}
          {marginDebtPaths.map((d, index) => <path key={`margin-${index}`} data-pnl-report-margin-line="true" d={d} fill="none" stroke={MARGIN_DEBT_COLOR} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
          {marginDebtSegments.filter(segment => segment.length === 1).map(([point]) => <circle key={`margin-single-${point.index}`} data-pnl-report-margin-point="true" cx={point.x} cy={point.y} r="2.4" fill={MARGIN_DEBT_COLOR} />)}
          {benchmarkPath && <path d={benchmarkPath} fill="none" stroke={BENCHMARK_COLOR} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          {latestRecordHigh && <g data-pnl-report-record-high={primaryKey} data-record-high-date={latestRecordHigh.point.date} pointerEvents="none">
            <circle className="pnl-trend-high-halo quote-pulse-halo" cx={latestRecordHigh.x} cy={latestRecordHigh.y} r="7" fill="none" stroke={primaryColor} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            <circle className="pnl-trend-high-core" cx={latestRecordHigh.x} cy={latestRecordHigh.y} r="3.3" fill={primaryColor} stroke="#08090b" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
          </g>}
          {selectedSlot && (selectedPrimary || selectedTotalAsset || (mode === 'pnl' && selectedBenchmark)) && <>
            <line x1={selectedSlot.x} y1={PNL_CHART_PAD} x2={selectedSlot.x} y2={PNL_CHART_HEIGHT - PNL_CHART_PAD} stroke="#62626b" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
            {[selectedPrimary && { point: selectedPrimary, color: mode === 'assets' ? NET_ASSET_COLOR : mode === 'amount' ? marketHexColor(selectedPrimary.value, marketColorMode) : color },
              mode === 'assets' && selectedTotalAsset && { point: selectedTotalAsset, color: TOTAL_ASSET_COLOR },
              mode === 'assets' && selectedMarginDebt && { point: selectedMarginDebt, color: MARGIN_DEBT_COLOR, margin: true },
              mode === 'pnl' && selectedBenchmark && { point: selectedBenchmark, color: BENCHMARK_COLOR }].filter(Boolean).map((item, index) => <circle key={index} data-pnl-report-selected-margin={item.margin ? 'true' : undefined} cx={item.point.x} cy={item.point.y} r="3.2" fill={item.color} stroke="#08090b" strokeWidth="1.2" />)}
          </>}
        </svg>
      </div>
      <div className="pnl-trend-axis" style={{ width: `${Math.max(5, ...axisLabels.map(label => label.length))}ch` }} aria-hidden="true">{axisLabels.map((label, index) => <span key={index} style={{ top: `${gridLines[index] / PNL_CHART_HEIGHT * 100}%` }}>{label}</span>)}
        {zeroY != null && <span className="pnl-trend-zero-label" style={{ top: `${zeroY / PNL_CHART_HEIGHT * 100}%` }}>0</span>}
      </div>
      <div className="pnl-trend-dates"><span>{data[0]?.label || '--'}</span><span>{data[Math.floor(data.length / 2)]?.label || '--'}</span><span>{data.at(-1)?.label || '--'}</span></div>
    </div>
    {latestRecordHigh && <button type="button" className="pnl-trend-high-caption"
      onClick={() => setSelectedIndex(latestRecordHigh.index)}
      title={t(language, 'pnlReport.periodHighExplanation', '所选区间内，最近一次严格高于此前有效记录的数值；点击查看当日读数。')}>
      <i style={{ background: primaryColor }} aria-hidden="true" />
      <span>{recordHighLabel} · {String(latestRecordHigh.point.date).replaceAll('-', '/')}</span>
    </button>}
    {latestRecordHigh && <div className="pnl-trend-high-amount">
      <i style={{ background: primaryColor }} aria-hidden="true" />
      <span>{mode === 'amount' ? t(language, 'pnlReport.amountAtPeriodHigh', '盈亏新高当日金额') : recordHighLabel} · </span>
      <span
        className={isRenderableChartValue(recordHighValue) ? (mode === 'assets' ? undefined : marketTextClass(recordHighValue, marketColorMode)) : 'pnl-trend-missing'}
        style={mode === 'assets' && isRenderableChartValue(recordHighValue) ? { color: primaryColor } : undefined}
      >{recordHighValueText}</span>
    </div>}
  </div>;
}
