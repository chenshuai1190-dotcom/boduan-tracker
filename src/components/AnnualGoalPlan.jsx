import React from 'react';
import { ChevronDown, ChevronRight, ChevronUp, TrendingUp } from 'lucide-react';
import { t } from '../lib/i18n.js';
import { resolveAnnualGoalStatus } from '../lib/annualGoalStatus.js';
import { marketHexColor } from '../lib/marketColorMode.js';
import './AnnualGoalPlan.css';

export default function AnnualGoalPlan({
  language = 'zh', visibleYears = [], thisYear, showAllYears = false,
  totalYearCount = 0, hiddenYearCount = 0, onToggleYears, onOpenYear,
  money, signedMoney, marketColorMode = 'redUpGreenDown',
}) {
  const headingId = React.useId();
  const tt = (key, fallback, values) => t(language, key, fallback, values);
  const currentYear = visibleYears.find(item => item.year === thisYear);
  const otherYears = visibleYears.filter(item => item.year !== thisYear);
  const hasActual = item => item.year <= thisYear && !item.isProjected && Number.isFinite(item.actualGain);
  const statusFor = item => {
    if (!hasActual(item)) return item.year > thisYear ? 'notStarted' : 'pending';
    const status = resolveAnnualGoalStatus(item.actualGain, item.planTarget);
    return item.year === thisYear && status === 'behind' ? 'inProgress' : status;
  };
  const statusLabel = status => ({
    exceeded: tt('review.exceeded', '超额'),
    reached: tt('review.reached', '达标'),
    inProgress: tt('review.compoundInProgress', '进行中'),
    behind: tt('review.behind', '未达'),
    notStarted: tt('review.notStarted', '未开始'),
    pending: tt('review.pending', '待填写'),
  })[status] || tt('review.pending', '待填写');
  const renderStatus = status => <span className="ag-status" data-annual-goal-status={status || 'pending'}>
    {status === 'exceeded' && <TrendingUp size={13} strokeWidth={1.7} aria-hidden="true" />}
    {statusLabel(status)}
  </span>;
  const currentHasActual = currentYear && hasActual(currentYear);
  const currentStatus = currentYear ? statusFor(currentYear) : null;
  const rawActualGrowth = currentHasActual && Number.isFinite(currentYear.startBalance) && currentYear.startBalance > 0
    ? currentYear.actualGain / currentYear.startBalance * 100 : null;
  const actualGrowth = Number.isFinite(rawActualGrowth) ? rawActualGrowth : null;
  const rawProgress = currentHasActual && Number.isFinite(currentYear.planTarget) && currentYear.planTarget > 0
    ? currentYear.actualGain / currentYear.planTarget * 100 : null;
  const progress = Number.isFinite(rawProgress) ? rawProgress : null;
  const boundedProgress = progress === null ? null : Math.max(0, Math.min(100, progress));
  const currentGap = currentHasActual && Number.isFinite(currentYear.planTarget)
    ? currentYear.planTarget - currentYear.actualGain : null;
  const gapLabel = currentGap === null ? tt('review.pending', '待填写')
    : currentStatus === 'exceeded'
      ? tt('review.exceededAmount', '超额 {{amount}}', { amount: money(Math.abs(currentGap)) })
      : currentStatus === 'reached'
        ? tt('review.annualTargetReached', '已达标')
        : tt('review.annualGapRemaining', '距离目标还差 {{amount}}', { amount: money(Math.abs(currentGap)) });

  return <section className="annual-goal-plan" aria-labelledby={headingId}>
    <div className="ag-section-header">
      <h2 id={headingId}>{tt('review.annualPlan', '年度计划')}</h2>
      {totalYearCount > 3 && <button type="button" className="ag-toggle" aria-expanded={showAllYears} onClick={onToggleYears}>
        <span>{showAllYears ? tt('review.collapse', '收起') : tt('review.expandMoreYears', '展开剩余 {{count}} 年', { count: hiddenYearCount })}</span>
        {showAllYears ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>}
    </div>

    {currentYear && <button type="button" className="ag-current-card" onClick={() => onOpenYear(currentYear)}
      aria-label={tt('review.openAnnualPlan', '查看 {{year}} 年计划', { year: currentYear.year })}>
      <span className="ag-current-header">
        <span className="ag-year-heading"><strong>{currentYear.year}</strong><span>{tt('review.thisYear', '本年')}</span></span>
        <span className="ag-current-status">{renderStatus(currentStatus)}<ChevronRight size={16} strokeWidth={1.6} aria-hidden="true" /></span>
      </span>
      <span className="ag-current-result">
        <span className="ag-label">{tt('review.annualRealizedGain', '本年已实现')}</span>
        <span className="ag-current-gain-row">
          <strong className={currentHasActual ? 'ag-gain' : 'ag-gain ag-unrecorded'}
            style={currentHasActual ? { color: currentYear.actualGain === 0 ? '#f1f1f2' : marketHexColor(currentYear.actualGain, marketColorMode) } : undefined}>
            {currentHasActual ? signedMoney(currentYear.actualGain) : tt('review.pending', '待填写')}
          </strong>
          <span className="ag-actual-growth">
            <strong style={actualGrowth === null ? undefined : { color: actualGrowth === 0 ? '#f1f1f2' : marketHexColor(actualGrowth, marketColorMode) }}>
              {actualGrowth === null ? '—' : `${actualGrowth > 0 ? '+' : ''}${actualGrowth.toFixed(1)}%`}
            </strong>
          </span>
        </span>
      </span>
      <span className="ag-current-target"><span className="ag-label">{tt('review.annualProfitTarget', '年度收益目标')}</span>
        <strong>{Number.isFinite(currentYear.planTarget) ? money(currentYear.planTarget) : '—'}</strong>
      </span>
      <span className="ag-gap" data-gap-status={currentStatus || 'pending'}>{gapLabel}</span>
      <span className="ag-progress-summary"><span>{tt('review.yearProgress', '本年完成')}</span><strong>{progress === null ? '—' : `${progress.toFixed(1)}%`}</strong></span>
      <span className="ag-progress-track" role="progressbar" aria-label={tt('review.yearProgress', '本年完成')}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={boundedProgress === null ? undefined : boundedProgress}
        aria-valuetext={progress === null ? tt('review.pending', '待填写') : `${progress.toFixed(1)}%`}>
        <span className="ag-progress-fill" style={{ width: `${boundedProgress ?? 0}%` }} />
      </span>
    </button>}

    {otherYears.length > 0 && <div className="ag-timeline">
      {otherYears.map(item => {
        const actual = hasActual(item);
        const targetAssets = Number.isFinite(item.startBalance) && Number.isFinite(item.planTarget)
          ? item.startBalance + item.planTarget : null;
        return <button key={item.year} type="button" className="ag-year-row" onClick={() => onOpenYear(item)}
          aria-label={tt('review.openAnnualPlan', '查看 {{year}} 年计划', { year: item.year })}>
          <span className="ag-timeline-dot" aria-hidden="true" />
          <span className="ag-row-head"><span className="ag-row-year">{item.year}</span>{renderStatus(statusFor(item))}<ChevronRight size={14} aria-hidden="true" /></span>
          <span className="ag-row-assets"><span className="ag-label">{tt('review.annualTargetAssets', '期末目标资产')}</span><strong>{targetAssets === null ? '—' : money(targetAssets)}</strong></span>
          <span className="ag-row-gain"><span>{actual ? tt('review.annualRecordedGain', '已实现收益') : tt('review.annualPlannedGain', '计划收益')}</span>
            <strong style={actual && item.actualGain !== 0 ? { color: marketHexColor(item.actualGain, marketColorMode) } : undefined}>
              {actual ? signedMoney(item.actualGain) : Number.isFinite(item.planTarget) ? signedMoney(item.planTarget) : '—'}
            </strong>
          </span>
        </button>;
      })}
    </div>}
  </section>;
}
