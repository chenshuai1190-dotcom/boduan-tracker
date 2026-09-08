import React from 'react';

export default function InvestmentAnalysisTabs({ value, onChange, englishMode = false }) {
  const views = ['growth', 'drawdown'];
  const labels = englishMode ? ['Asset growth', 'Drawdown & recovery'] : ['资产增长', '回撤与修复'];
  const selectWithKeyboard = (event, index) => {
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = 1 - index;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 1;
    else return;
    event.preventDefault();
    onChange(views[next]);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[next]?.focus();
  };
  return <div className="ic-analysis-tabs" role="tablist" aria-label={englishMode ? 'Investment analysis' : '投资分析'}>
    {views.map((view, index) => <button key={view} type="button" role="tab" id={`ic-tab-${view}`} aria-selected={value === view} aria-controls="ic-analysis-panel" tabIndex={value === view ? 0 : -1} onClick={() => onChange(view)} onKeyDown={event => selectWithKeyboard(event, index)}>{labels[index]}</button>)}
  </div>;
}
