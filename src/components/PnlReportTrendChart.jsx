import React from 'react';
import { marketTextClass } from '../lib/marketColorMode.js';
import { isEnglishLanguage, t } from '../lib/i18n.js';
import {
  buildAreaPathFromPoints, buildLinePathFromPoints, buildChartDomain, buildLinePoints, chartX,
  isExplicitUnknownNetAssetPoint, isRenderableChartValue, splitChartPointSegments,
} from '../lib/pnlReportChart.js';
import './PnlReportTrendChart.css';

const PNL_CHART_WIDTH = 310;
const PNL_CHART_HEIGHT = 210;
const PNL_CHART_PAD = 8;
const NET_ASSET_COLOR = '#ff5038';
const TOTAL_ASSET_COLOR = '#f6b54b';
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

function currencyAmount(value, currency = 'USD', digits = 2) {
  if (!isRenderableChartValue(value)) return '--';
  const amount = Number(value);
  const symbol = currency === 'CNY' ? '¥' : '$';
  return `${amount < 0 ? '-' : ''}${symbol}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
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

function displayTooltipDate(dateKey, englishMode) {
  const [year, month, day] = String(dateKey || '').split('-');
  if (!year || !month || !day) return '--';
  const date = new Date(`${dateKey}T00:00:00Z`);
  const weekday = Number.isNaN(date.getTime()) ? null : date.getUTCDay();
  if (englishMode) return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday] || ''} ${Number(month)}/${Number(day)}/${year}`.trim();
  return `${year}/${Number(month)}/${Number(day)} ${['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][weekday] || ''}`.trim();
}

export default function PnlReportTrendChart({
  data = [], mode, color, language, marketColorMode, displayCurrency, displayRate, initialSelectedDate = '',
}) {
  const englishMode = isEnglishLanguage(language);
  const [selectedIndex, setSelectedIndex] = React.useState(null);
  const chartRootRef = React.useRef(null);
  const activePointerRef = React.useRef(null);
  const gradientId = `pnl-report-area-${React.useId().replace(/:/g, '')}`;
  const primaryKey = mode === 'assets' ? 'netAssetUsd' : 'pnlPct';
  const hasBenchmark = data.some(point => isRenderableChartValue(point?.benchmarkPct));
  const showBenchmark = mode === 'pnl' && hasBenchmark;
  const primaryDomain = React.useMemo(() => (
    mode === 'assets'
      ? buildChartDomain(data, ['netAssetUsd', 'totalAssetUsd'], 'assets')
      : buildChartDomain(data, ['pnlPct', 'benchmarkPct'], 'percentage')
  ), [data, mode]);
  const primaryPoints = React.useMemo(() => buildLinePoints(data, primaryKey, primaryDomain), [data, primaryKey, primaryDomain]);
  const totalAssetPoints = React.useMemo(() => mode === 'assets' ? buildLinePoints(data, 'totalAssetUsd', primaryDomain) : [], [data, mode, primaryDomain]);
  const benchmarkPoints = React.useMemo(() => showBenchmark ? buildLinePoints(data, 'benchmarkPct', primaryDomain) : [], [data, showBenchmark, primaryDomain]);
  const primarySegments = React.useMemo(() => mode === 'assets'
    ? splitChartPointSegments(data, primaryPoints, isExplicitUnknownNetAssetPoint)
    : (primaryPoints.length ? [primaryPoints] : []), [data, mode, primaryPoints]);
  const primaryPaths = primarySegments.map(buildLinePathFromPoints).filter(Boolean);
  const totalAssetPath = mode === 'assets' ? buildLinePathFromPoints(totalAssetPoints) : '';
  const benchmarkPath = showBenchmark ? buildLinePathFromPoints(benchmarkPoints) : '';
  const areaPaths = primarySegments.map(segment => buildAreaPathFromPoints(segment, PNL_CHART_HEIGHT, PNL_CHART_PAD)).filter(Boolean);
  const pointSlots = React.useMemo(() => data.map((point, index) => ({ point, index, x: chartX(index, data.length) })), [data]);
  const selectableSlots = mode === 'assets' ? totalAssetPoints : pointSlots;
  const primaryByIndex = React.useMemo(() => new Map(primaryPoints.map(point => [point.index, point])), [primaryPoints]);
  const totalAssetByIndex = React.useMemo(() => new Map(totalAssetPoints.map(point => [point.index, point])), [totalAssetPoints]);
  const benchmarkByIndex = React.useMemo(() => new Map(benchmarkPoints.map(point => [point.index, point])), [benchmarkPoints]);
  const selectedSlot = selectedIndex == null ? null : pointSlots[selectedIndex] || null;
  const selectedPrimary = selectedSlot ? primaryByIndex.get(selectedSlot.index) || null : null;
  const selectedTotalAsset = selectedSlot ? totalAssetByIndex.get(selectedSlot.index) || null : null;
  const selectedBenchmark = selectedSlot ? benchmarkByIndex.get(selectedSlot.index) || null : null;
  const latestReadoutSlot = React.useMemo(() => [...selectableSlots].reverse().find(slot => (
    primaryByIndex.has(slot.index) || totalAssetByIndex.has(slot.index) || benchmarkByIndex.has(slot.index)
  )) || null, [selectableSlots, primaryByIndex, totalAssetByIndex, benchmarkByIndex]);
  const readoutSlot = selectedSlot || latestReadoutSlot;
  const readoutPrimary = readoutSlot ? primaryByIndex.get(readoutSlot.index) || null : null;
  const readoutTotalAsset = readoutSlot ? totalAssetByIndex.get(readoutSlot.index) || null : null;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(ratio => PNL_CHART_PAD + ratio * (PNL_CHART_HEIGHT - PNL_CHART_PAD * 2));
  const axisValues = primaryDomain ? gridLines.map(y => {
    const ratio = (y - PNL_CHART_PAD) / (PNL_CHART_HEIGHT - PNL_CHART_PAD * 2);
    return primaryDomain.max - ratio * (primaryDomain.max - primaryDomain.min);
  }) : gridLines.map(() => null);
  const assetAxisLabels = axisValues.map(value => compactAssetAxisValue(convertUsd(value, displayRate), englishMode));
  const axisLabels = mode === 'assets' ? assetAxisLabels : axisValues.map(value => isRenderableChartValue(value)
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
    <div className="pnl-trend-readout" data-mode={mode}>
      <div className="pnl-trend-readout-heading">
        <span>{displayTooltipDate(readoutSlot?.point?.date, englishMode)}</span>
        {mode === 'assets' && <span>{displayCurrency}</span>}
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
      {readoutSlot && readoutTotalAsset && mode === 'assets' && <div data-pnl-report-asset-tooltip="true">
        <div className="pnl-trend-asset-readout">
          <span className="pnl-trend-series-label"><i style={{ background: NET_ASSET_COLOR }} />{t(language, 'pnlReport.tooltip.netAssets', '净资产')}</span>
          <span style={{ color: readoutPrimary ? NET_ASSET_COLOR : undefined }}>{readoutPrimary ? currencyAmount(convertUsd(readoutSlot.point?.netAssetUsd, displayRate), displayCurrency, 2) : '--'}</span>
          <span className="pnl-trend-series-label"><i style={{ background: TOTAL_ASSET_COLOR }} />{t(language, 'pnlReport.tooltip.totalAssets', '总资产')}</span>
          <span style={{ color: TOTAL_ASSET_COLOR }}>{currencyAmount(convertUsd(readoutSlot.point?.totalAssetUsd, displayRate), displayCurrency, 2)}</span>
          <span className="pnl-trend-series-label"><i className="pnl-trend-cash-dot" />{t(language, 'pnlReport.tooltip.availableCash', '可用现金')}</span>
          <span>{readoutSlot.point?.cashKnown ? currencyAmount(convertUsd(readoutSlot.point?.cashUsd, displayRate), displayCurrency, 2) : '--'}</span>
        </div>
        {!readoutPrimary && <div className="pnl-trend-missing-note">{t(language, 'pnlReport.tooltip.marginUnavailable', '该日没有融资负债快照')}</div>}
        {!readoutSlot.point?.cashKnown && <div className="pnl-trend-missing-note">{t(language, 'pnlReport.tooltip.cashNotIncluded', '该日快照未包含可用现金')}</div>}
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
          {areaPaths.map((path, index) => <path key={`area-${index}`} d={path} fill={`url(#${gradientId})`} />)}
          {totalAssetPath && <path d={totalAssetPath} fill="none" stroke={TOTAL_ASSET_COLOR} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          {primaryPaths.map((path, index) => <path key={`line-${index}`} d={path} fill="none" stroke={mode === 'assets' ? NET_ASSET_COLOR : color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
          {primarySegments.filter(segment => segment.length === 1).map(segment => <circle key={`single-${segment[0].index}`} cx={segment[0].x} cy={segment[0].y} r="2.4" fill={mode === 'assets' ? NET_ASSET_COLOR : color} />)}
          {benchmarkPath && <path d={benchmarkPath} fill="none" stroke={BENCHMARK_COLOR} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          {selectedSlot && (selectedPrimary || selectedTotalAsset || (mode === 'pnl' && selectedBenchmark)) && <>
            <line x1={selectedSlot.x} y1={PNL_CHART_PAD} x2={selectedSlot.x} y2={PNL_CHART_HEIGHT - PNL_CHART_PAD} stroke="#62626b" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
            {[selectedPrimary && { point: selectedPrimary, color: mode === 'assets' ? NET_ASSET_COLOR : color },
              mode === 'assets' && selectedTotalAsset && { point: selectedTotalAsset, color: TOTAL_ASSET_COLOR },
              mode === 'pnl' && selectedBenchmark && { point: selectedBenchmark, color: BENCHMARK_COLOR }].filter(Boolean).map((item, index) => <circle key={index} cx={item.point.x} cy={item.point.y} r="3.2" fill={item.color} stroke="#08090b" strokeWidth="1.2" />)}
          </>}
        </svg>
      </div>
      <div className="pnl-trend-axis" style={{ width: `${Math.max(5, ...axisLabels.map(label => label.length))}ch` }} aria-hidden="true">{axisLabels.map((label, index) => <span key={index} style={{ top: `${gridLines[index] / PNL_CHART_HEIGHT * 100}%` }}>{label}</span>)}</div>
      <div className="pnl-trend-dates"><span>{data[0]?.label || '--'}</span><span>{data[Math.floor(data.length / 2)]?.label || '--'}</span><span>{data.at(-1)?.label || '--'}</span></div>
    </div>
  </div>;
}
