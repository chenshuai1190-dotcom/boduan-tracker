import React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { t } from '../lib/i18n.js';
import { marketTextClass } from '../lib/marketColorMode.js';
import { resolveAnnualGoalStatus } from '../lib/annualGoalStatus.js';
import { buildCompoundYearDetailRows } from '../lib/compoundYearDetails.js';
import { buildCompoundPathModel } from '../lib/compoundPathModel.js';
import './CompoundDetailPage.css';

const W = 340;
const H = 276;
const PAD = { left: 42, right: 10, top: 12, bottom: 27 };
const finite = value => typeof value === 'number' && Number.isFinite(value);

export default function CompoundDetailPage({
  currentYear, language = 'zh', marketColorMode, money, onBack, signedMoney,
  startCapital, startYear, symbol, targetAnnualRate, targetValue, totalYears, rate,
  yearRows, initialView = 'execution',
}) {
  const tt = (key, fallback, values) => t(language, key, fallback, values);
  const [view, setView] = React.useState(initialView === 'simulation' ? 'simulation' : 'execution');
  const [selectedIndex, setSelectedIndex] = React.useState(null);
  const [linkedYear, setLinkedYear] = React.useState(null);
  const gestureRef = React.useRef(null);
  const suppressClickRef = React.useRef(false);
  const ledgerRef = React.useRef(null);
  const model = React.useMemo(() => buildCompoundPathModel({
    startCapital, startYear, totalYears, targetAnnualRate, yearRows, currentYear,
  }), [startCapital, startYear, totalYears, targetAnnualRate, yearRows, currentYear]);
  const detailRows = React.useMemo(() => buildCompoundYearDetailRows(yearRows, { currentYear }).map(row => {
    // Match the chart's strict record eligibility, including genuine zero values.
    const point = model.points.find(point => point.year === row.year);
    const hasActual = finite(point?.actualValue);
    return { ...row, hasActual, actualEndBalance: hasActual ? point.actualValue : null };
  }), [yearRows, currentYear, model]);
  React.useLayoutEffect(() => {
    if (linkedYear === null) return;
    const row = ledgerRef.current?.querySelector(`[data-compound-year-row="${linkedYear}"]`);
    if (row) {
      row.open = true;
      row.querySelector('summary')?.focus({ preventScroll: true });
      row.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    }
    setLinkedYear(null);
  }, [linkedYear, view]);
  const fmt = value => finite(value) ? money(value) : '—';
  const signed = value => finite(value) ? signedMoney(value) : '—';
  const gainAmount = value => <span className={finite(value) && value !== 0 ? marketTextClass(value, marketColorMode) : ''}>{signed(value)}</span>;
  const percent = value => finite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}%` : '—';
  const latestIndex = model.latestActualIndex;
  const defaultIndex = latestIndex ?? Math.max(0, model.points.length - 1);
  const activeIndex = Math.min(selectedIndex ?? defaultIndex, Math.max(0, model.points.length - 1));
  const active = model.points[activeIndex];
  const activeYear = active?.kind === 'start' ? tt('review.start', '起点') : String(active?.year ?? '—');
  const activeActual = active?.actualValue;
  const difference = finite(activeActual) && finite(active?.plannedValue) ? activeActual - active.plannedValue : null;
  const activeKind = !active ? 'empty' : active.kind === 'start' ? 'start'
    : active.year > currentYear ? 'future' : active.year === currentYear ? 'current' : 'past';
  const activeView = activeKind === 'future' ? 'simulation' : 'execution';
  const canOpenYear = active?.kind === 'year' && (activeView === 'simulation'
    ? model.simulationRows.some(row => row.year === active.year)
    : detailRows.some(row => row.year === active.year));
  const selectedStatus = activeKind === 'future' ? tt('review.compoundForecastOnly', '未来推演')
    : activeKind === 'start' || activeKind === 'empty' ? ''
    : !finite(activeActual) ? tt('review.compoundUnrecorded', '未记录')
    : activeKind === 'current' ? tt('review.compoundCurrentRecord', '本年 · 最近记录')
    : selectedIndex === null ? tt('review.compoundLatest', '最近记录') : tt('review.compoundHistoricalRecord', '历史记录');
  const selectedAssetLabel = activeKind === 'future' ? tt('review.compoundProjectedAssets', '推演期末资产')
    : activeKind === 'start' ? tt('review.initialCapitalShort', '起始本金')
    : activeKind === 'current' ? tt('review.compoundCurrentAssets', '最新记录资产')
    : tt('review.actualEndingAssets', '实际期末资产');
  const selectedAsset = activeKind === 'future' || activeKind === 'start' ? active?.plannedValue : activeActual;
  const currentShortfall = activeKind === 'current' && finite(difference) && difference < 0;
  const differenceLabel = currentShortfall ? tt('review.compoundUntilYearEnd', '距年末原始目标还差')
    : activeKind === 'current' && finite(difference) && difference >= 0 ? tt('review.compoundAboveYearEnd', '超出年末原始目标')
    : tt('review.compoundVsOriginal', '较原始目标');
  const targetGain = finite(targetValue) && finite(startCapital) ? targetValue - startCapital : null;
  const multiple = finite(targetValue) && startCapital > 0 ? targetValue / startCapital : null;
  const targetText = fmt(targetValue);
  const decimalIndex = targetText.lastIndexOf('.');
  const targetMain = decimalIndex < 0 ? targetText : targetText.slice(0, decimalIndex);
  const targetDecimal = decimalIndex < 0 ? '' : targetText.slice(decimalIndex);

  const values = model.points.flatMap(point => [point.plannedValue, point.actualValue]).filter(finite);
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const span = Math.max(high - low, 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(span / 3)));
  const tickStep = ([1, 2, 2.5, 5, 10].find(step => step * magnitude >= span / 3) || 10) * magnitude;
  const min = Math.floor(low / tickStep) * tickStep;
  const max = Math.max(min + tickStep, Math.ceil(high / tickStep) * tickStep);
  const plotWidth = W - PAD.left - PAD.right;
  const plotHeight = H - PAD.top - PAD.bottom;
  const x = index => PAD.left + index / Math.max(1, model.points.length - 1) * plotWidth;
  const y = value => PAD.top + (max - value) / (max - min) * plotHeight;
  const planPath = model.points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point.plannedValue)}`).join(' ');
  let previousActual = false;
  const actualPath = model.points.map((point, index) => {
    if (!finite(point.actualValue)) { previousActual = false; return ''; }
    const segment = `${previousActual ? 'L' : 'M'} ${x(index)} ${y(point.actualValue)}`;
    previousActual = true;
    return segment;
  }).join(' ');
  const ticks = Array.from({ length: Math.round((max - min) / tickStep) + 1 }, (_, index) => min + tickStep * index);
  const yearTickIndexes = [...new Set([0, Math.floor((model.points.length - 1) / 2), model.points.length - 1])].filter(index => index >= 0);
  const compact = value => new Intl.NumberFormat(language === 'en' ? 'en-US' : 'zh-CN', {
    notation: 'compact', maximumFractionDigits: 1,
  }).format(value * (finite(rate) && rate > 0 ? rate : 1));

  function selectChartYear(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const localX = (event.clientX - bounds.left) / bounds.width * W;
    setSelectedIndex(Math.max(0, Math.min(model.points.length - 1, Math.round((localX - PAD.left) / plotWidth * (model.points.length - 1)))));
  }
  function handleChartClick(event) {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    selectChartYear(event);
  }
  function startChartGesture(event) {
    if (event.isPrimary === false || (event.button != null && event.button !== 0)) return;
    suppressClickRef.current = false;
    gestureRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null };
  }
  function moveChartGesture(event) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    if (!gesture.axis) {
      const dx = Math.abs(event.clientX - gesture.x);
      const dy = Math.abs(event.clientY - gesture.y);
      if (Math.max(dx, dy) < 6) return;
      gesture.axis = dx > dy ? 'horizontal' : 'vertical';
      if (gesture.axis === 'horizontal') event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    suppressClickRef.current = true;
    if (gesture.axis !== 'horizontal') return;
    if (event.cancelable) event.preventDefault();
    selectChartYear(event);
  }
  function endChartGesture(event) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    if (gesture.axis === 'horizontal') selectChartYear(event);
    suppressClickRef.current = gesture.axis !== null;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function cancelChartGesture(event) {
    if (gestureRef.current?.id !== event.pointerId) return;
    gestureRef.current = null;
    suppressClickRef.current = true;
  }
  function openSelectedYear() {
    if (!canOpenYear) return;
    setView(activeView);
    setLinkedYear(active.year);
  }
  function selectWithKeyboard(event) {
    const last = model.points.length - 1;
    let next;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, activeIndex - 1);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(last, activeIndex + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else if (event.key === 'Escape') { setSelectedIndex(null); event.preventDefault(); return; }
    else return;
    event.preventDefault();
    setSelectedIndex(next);
  }
  function resetWhenReadingElsewhere(event) {
    if (!event.target.closest('.cp-chart, .cp-selected-summary, .cp-year-row, button, summary')) setSelectedIndex(null);
  }
  function rowStatus(row) {
    if (!row.hasActual) return row.isFutureYear ? tt('review.notStarted', '未开始') : tt('review.pending', '待填写');
    const status = resolveAnnualGoalStatus(row.actualGain, row.planTarget);
    if (status === 'exceeded') return tt('review.exceeded', '超额');
    if (status === 'reached') return tt('review.reached', '达标');
    return row.isCurrentYear ? tt('review.compoundInProgress', '进行中') : tt('review.behind', '未达');
  }

  return <main className="compound-detail-page" data-compound-page="true" onClick={resetWhenReadingElsewhere}>
    <header className="cp-page-header">
      <button type="button" className="cp-back" onClick={onBack} aria-label={tt('review.backToGoals', '返回目标页')}>
        <ChevronLeft size={22} strokeWidth={1.6} aria-hidden="true" />
      </button>
      <h1>{tt('review.compoundTitle', '{{years}}年复利明细', { years: totalYears })}</h1>
      <span aria-hidden="true" />
    </header>
    <div className="compound-detail" data-compound-detail="true">
      <div className="cp-context"><span>{startYear} — {startYear + totalYears - 1}</span><span>{symbol === '¥' ? 'CNY' : 'USD'}</span></div>
      <section className="cp-hero" aria-label={tt('review.compoundGoal', '{{years}} 年目标资产', { years: totalYears })}>
        <span className="cp-label">{tt('review.compoundGoal', '{{years}} 年目标资产', { years: totalYears })}</span>
        <div className="cp-target"><span>{targetMain}</span><span className="cp-decimal">{targetDecimal}</span></div>
        <dl className="cp-facts">
          <div><dt>{tt('review.initialCapitalShort', '起始本金')}</dt><dd>{fmt(startCapital)}</dd></div>
          <div><dt>{tt('review.assumedAnnualRate', '目标年化')}</dt><dd>{finite(targetAnnualRate) ? `${Number((targetAnnualRate * 100).toFixed(2))}%` : '—'}</dd></div>
          <div><dt>{tt('review.compoundTargetGain', '目标累计收益')}</dt><dd>{gainAmount(targetGain)}</dd></div>
          <div><dt>{tt('review.compoundMultiple', '复利倍数')}</dt><dd>{multiple === null ? '—' : `${multiple.toFixed(2)}×`}</dd></div>
        </dl>
      </section>

      <section className="cp-path" aria-label={tt('review.compoundPath', '复利路径')}>
        <div className="cp-path-heading">
          <h3>{tt('review.compoundPath', '复利路径')}</h3>
          <div className="cp-legend"><span><i className="cp-plan-key" />{tt('review.compoundOriginalPlan', '原始目标')}</span><span><i className="cp-actual-key" />{tt('review.actual', '实际')}</span></div>
        </div>
        {model.points.length > 0 ? <svg
          className="cp-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          role="slider" tabIndex={0} aria-label={tt('review.compoundChartYear', '选择复利路径年份')}
          aria-valuemin={0} aria-valuemax={model.points.length - 1} aria-valuenow={activeIndex}
          aria-valuetext={activeKind === 'future' ? tt('review.compoundChartForecast', '{{year}}，未来推演资产 {{planned}}', { year: activeYear, planned: fmt(active?.plannedValue) })
            : activeKind === 'start' ? tt('review.compoundChartStart', '起始本金 {{principal}}', { principal: fmt(active?.plannedValue) })
            : tt('review.compoundChartValue', '{{year}}，原始目标 {{planned}}，已记录资产 {{actual}}', { year: activeYear, planned: fmt(active?.plannedValue), actual: fmt(activeActual) })}
          onClick={handleChartClick} onKeyDown={selectWithKeyboard}
          onPointerDown={startChartGesture} onPointerMove={moveChartGesture} onPointerUp={endChartGesture}
          onPointerCancel={cancelChartGesture} onLostPointerCapture={cancelChartGesture}
        >
          {ticks.map((value, index) => <g key={index} aria-hidden="true">
            <line x1={PAD.left} x2={W - PAD.right} y1={y(value)} y2={y(value)} className="cp-grid-line" />
            <text x={0} y={y(value) + 3} className="cp-axis-label">{compact(value)}</text>
          </g>)}
          <path d={planPath} className="cp-plan-line" aria-hidden="true" />
          <path d={actualPath} className="cp-actual-line" aria-hidden="true" />
          {model.points.filter(point => finite(point.actualValue)).map(point => <circle key={point.index} cx={x(point.index)} cy={y(point.actualValue)} r={point.index === activeIndex ? 4 : 2.5} className="cp-actual-dot" aria-hidden="true" />)}
          {active && <g aria-hidden="true">
            <line x1={x(activeIndex)} x2={x(activeIndex)} y1={PAD.top} y2={PAD.top + plotHeight} className="cp-selected-line" />
            <circle cx={x(activeIndex)} cy={y(active.plannedValue)} r={selectedIndex === null ? 3 : 5} className="cp-plan-dot" />
            {selectedIndex !== null && <text x={Math.max(PAD.left + 16, Math.min(W - PAD.right - 16, x(activeIndex)))} y={PAD.top + 10} textAnchor="middle" className="cp-selected-year">{activeYear}</text>}
          </g>}
          {yearTickIndexes.map(index => <text key={index} x={x(index)} y={H - 5} textAnchor={index === 0 ? 'start' : index === model.points.length - 1 ? 'end' : 'middle'} className="cp-axis-label" aria-hidden="true">{index === 0 ? tt('review.start', '起点') : model.points[index].year}</text>)}
        </svg> : <div className="cp-chart-empty">{tt('review.compoundChartEmpty', '暂无法绘制复利路径')}</div>}
        <div className="cp-selected-summary" data-compound-selection={activeKind} aria-live="polite">
          <div className="cp-selected-heading">
            <div className="cp-year-context"><strong>{activeYear}</strong>{selectedStatus && <span>{selectedStatus}</span>}</div>
            <button className="cp-reset" type="button" disabled={selectedIndex === null} onClick={() => setSelectedIndex(null)}>
              {latestIndex === null ? tt('review.compoundResetDefault', '回到默认') : tt('review.compoundResetLatest', '回到最新')}
            </button>
          </div>
          <dl className="cp-selected-asset"><div><dt>{selectedAssetLabel}</dt><dd>{fmt(selectedAsset)}</dd></div></dl>
          {activeKind === 'future' ? <dl className="cp-selected-facts">
            <div><dt>{tt('review.initialCapitalShort', '起始本金')}</dt><dd>{fmt(startCapital)}</dd></div>
            <div><dt>{tt('review.compoundProjectedGain', '推演累计收益')}</dt><dd>{gainAmount(finite(active?.plannedValue) && finite(startCapital) ? active.plannedValue - startCapital : null)}</dd></div>
          </dl> : activeKind !== 'start' && <dl className="cp-selected-facts">
            <div><dt>{tt('review.compoundPlanAsset', '原始目标资产')}</dt><dd>{fmt(active?.plannedValue)}</dd></div>
            <div><dt>{differenceLabel}</dt><dd className={!currentShortfall && finite(difference) ? marketTextClass(difference, marketColorMode) : ''}>{currentShortfall ? fmt(-difference) : signed(difference)}</dd></div>
          </dl>}
          {canOpenYear && <button type="button" className="cp-open-year" onClick={openSelectedYear}
            aria-controls={`cp-${activeView}-year-${active.year}`}>
            <span>{activeView === 'simulation' ? tt('review.compoundViewProjectionYear', '查看 {{year}} 年推演', { year: active.year })
              : tt('review.compoundViewYear', '查看 {{year}} 年明细', { year: active.year })}</span><ChevronRight size={15} strokeWidth={1.5} aria-hidden="true" />
          </button>}
        </div>
      </section>

      <div className="cp-tabs" data-compound-tabs="true" role="group" aria-label={tt('review.compoundDetailViews', '复利明细视图')}>
        <button type="button" aria-pressed={view === 'execution'} onClick={() => { setView('execution'); setSelectedIndex(null); }}>{tt('review.compoundAnnualExecution', '年度执行')}</button>
        <button type="button" aria-pressed={view === 'simulation'} onClick={() => { setView('simulation'); setSelectedIndex(null); }}>{tt('review.compoundProjection', '复利推演')}</button>
      </div>
      {view === 'execution' ? <section key="execution" ref={ledgerRef} className="cp-ledger" data-compound-execution="true">
        <p className="cp-basis">{tt('review.compoundAnnualRolling', '年度目标承接上年期末余额')}</p>
        {detailRows.map(row => <details className="cp-year-row" key={row.year} id={`cp-execution-year-${row.year}`}
          data-compound-year-row={row.year} data-selected={selectedIndex !== null && active?.year === row.year || undefined} data-current={row.isCurrentYear || undefined}>
          <summary>
            <span className="cp-row-year"><strong>{row.year}</strong><span>{row.isCurrentYear ? tt('review.thisYear', '本年') : rowStatus(row)}</span></span>
            <span className="cp-row-value"><strong>{fmt(row.hasActual ? row.actualEndBalance : row.targetEndBalance)}</strong><span>{row.hasActual ? row.isCurrentYear ? tt('review.currentAssets', '当前资产') : tt('review.actualEndingAssets', '实际期末资产') : tt('review.plannedEndingAssets', '计划期末资产')}</span></span>
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div className="cp-year-expanded">
            <div className="cp-year-status">{rowStatus(row)}</div>
            <dl className="cp-year-facts">
              <div><dt>{tt('review.yearStart', '年初起点')}</dt><dd>{fmt(row.startBalance)}</dd></div>
              <div><dt>{tt('review.plannedGain', '计划收益')}</dt><dd>{signed(row.planTarget)}</dd></div>
              <div><dt>{tt('review.actualGain', '实际收益')}</dt><dd className={row.hasActual ? marketTextClass(row.actualGain, marketColorMode) : ''}>{row.hasActual ? signed(row.actualGain) : '—'}</dd></div>
              <div><dt>{tt('review.actualGrowthRate', '实际增幅')}</dt><dd className={row.hasActual ? marketTextClass(row.actualGain, marketColorMode) : ''}>{row.hasActual ? percent(row.actualGrowthPct) : '—'}</dd></div>
              <div><dt>{tt('review.compoundAnnualTargetAssets', '本年度目标资产')}</dt><dd>{fmt(row.targetEndBalance)}</dd></div>
              <div><dt>{tt('review.compoundAnnualCompletion', '年度收益达成率')}</dt><dd>{row.hasActual && finite(row.completionPct) ? `${row.completionPct.toFixed(1)}%` : '—'}</dd></div>
            </dl>
          </div>
        </details>)}
      </section> : <section key="simulation" ref={ledgerRef} className="cp-ledger" data-compound-simulation="true">
        <p className="cp-basis">{tt('review.compoundSimulationBasis', '按初始本金与目标年化率推演')}</p>
        {model.simulationRows.map(row => <details className="cp-year-row" key={row.year} id={`cp-simulation-year-${row.year}`}
          data-compound-year-row={row.year} data-selected={selectedIndex !== null && active?.year === row.year || undefined}>
          <summary><span className="cp-row-year"><strong>{row.year}</strong><span>{tt('review.yearEndAssets', '期末资产')}</span></span><span className="cp-row-value"><strong>{fmt(row.endBalance)}</strong><span>{tt('review.annualGain', '年收益')} {signed(row.annualGain)}</span></span><ChevronDown size={14} aria-hidden="true" /></summary>
          <dl className="cp-year-facts cp-year-expanded">
            <div><dt>{tt('review.initialCapitalShort', '起始本金')}</dt><dd>{fmt(startCapital)}</dd></div>
            <div><dt>{tt('review.compoundTargetGain', '目标累计收益')}</dt><dd>{gainAmount(row.endBalance - startCapital)}</dd></div>
          </dl>
        </details>)}
      </section>}
    </div>
  </main>;
}
