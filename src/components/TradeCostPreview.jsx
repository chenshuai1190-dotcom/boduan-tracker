import React from 'react';
import './TradeCostPreview.css';

function costText(position, tt) {
  if (position?.status === 'closed') return tt('trades.costPreview.closed', '已清仓');
  if (position?.status === 'empty') return tt('trades.costPreview.empty', '暂无持仓');
  if (position?.status !== 'holding' || !Number.isFinite(position.cost)) return '—';
  return position.cost.toLocaleString('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 3, maximumFractionDigits: 3,
  });
}

function allocationText(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1) return '—';
  return `${(value * 100).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export default function TradeCostPreview({ preview, tt }) {
  if (!preview?.applies) return null;
  return (
    <div className="trade-cost-preview" data-trade-cost-preview="true">
      <div className="trade-cost-preview-column">
        <div className="trade-cost-preview-label">{tt('trades.costPreview.current', '当前摊薄成本')}</div>
        <div className="trade-cost-preview-value">{costText(preview.current, tt)}</div>
      </div>
      <div className="trade-cost-preview-column">
        <div className="trade-cost-preview-label">{tt('trades.costPreview.after', '交易后成本')}</div>
        <div className="trade-cost-preview-value">{costText(preview.after, tt)}</div>
      </div>
      <div className="trade-cost-preview-column">
        <div className="trade-cost-preview-label">{tt('trades.costPreview.allocationAfter', '交易后仓位')}</div>
        <div className="trade-cost-preview-value">{allocationText(preview.allocation?.after)}</div>
        <div className="trade-cost-preview-note">{tt('trades.costPreview.allocationCurrent', '当前 {{value}}', { value: allocationText(preview.allocation?.current) })}</div>
      </div>
    </div>
  );
}
