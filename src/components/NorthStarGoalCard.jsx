import React from 'react';
import { ArrowUpRight, SlidersHorizontal } from 'lucide-react';
import { t } from '../lib/i18n.js';
import './NorthStarGoalCard.css';

export default function NorthStarGoalCard({
  language = 'zh', goalMoney, goalSubtitle, currentMoney, progressPct,
  yearsLeft, principalMoney, annualRateText, motto, displayCurrency = 'USD',
  onCurrencyChange, onOpenDetails, onOpenSettings,
}) {
  const headingId = React.useId();
  const tt = (key, fallback, values) => t(language, key, fallback, values);
  const progress = Number.isFinite(progressPct) ? Math.min(100, Math.max(0, progressPct)) : null;
  return <section className="north-star-card" aria-labelledby={headingId}>
    <div className="ns-header">
      <h2 id={headingId}>{tt('review.polarisGoal', '北极星目标')}</h2>
      <div className="ns-controls">
        <div className="ns-currencies" role="group" aria-label={tt('review.goalCurrency', '目标显示币种')}>
          {['USD', 'CNY'].map(currency => <button key={currency} type="button" aria-pressed={displayCurrency === currency}
            onClick={() => { if (currency !== displayCurrency) onCurrencyChange(currency); }}>{currency}</button>)}
        </div>
        <button type="button" className="ns-settings" aria-label={tt('review.planSettings', '北极星设置')} onClick={onOpenSettings}>
          <SlidersHorizontal size={17} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
    </div>
    <button type="button" className="ns-overview" onClick={onOpenDetails} aria-label={tt('review.openCompoundDetails', '查看北极星复利明细')}>
      <span className="ns-goal-amount"><span>{goalMoney.main}</span><span className="ns-goal-decimal">{goalMoney.decimal}</span></span>
      <span className="ns-horizon"><span>{goalSubtitle}</span><span>{tt('review.goalYearsRemaining', '还剩 {{years}} 年', { years: yearsLeft })}</span></span>
      <span className="ns-progress-summary">
        <span className="ns-current"><span className="ns-label">{tt('review.currentAssets', '当前资产')}</span><strong>{currentMoney}</strong></span>
        <span className="ns-completion"><span className="ns-label">{tt('review.goalCompletion', '达成率')}</span><strong>{progress === null ? '—' : `${progress.toFixed(1)}%`}</strong></span>
      </span>
      <span className="ns-progress-track" role="progressbar" aria-label={tt('review.goalCompletion', '达成率')}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress === null ? undefined : progress}
        aria-valuetext={progress === null ? '—' : `${progress.toFixed(1)}%`}>
        <span className="ns-progress-fill" style={{ width: `${progress ?? 0}%` }} />
      </span>
      <span className="ns-plan-facts">
        <span><span className="ns-label">{tt('review.initialCapitalShort', '起始本金')}</span><strong>{principalMoney}</strong></span>
        <span><span className="ns-label">{tt('review.assumedAnnualRate', '目标年化')}</span><strong>{annualRateText}</strong></span>
      </span>
      <span className="ns-detail-link"><span>{tt('review.viewCompoundPath', '查看复利路径')}</span><ArrowUpRight size={15} strokeWidth={1.6} aria-hidden="true" /></span>
    </button>
    {motto && <p className="ns-motto">{motto}</p>}
  </section>;
}
