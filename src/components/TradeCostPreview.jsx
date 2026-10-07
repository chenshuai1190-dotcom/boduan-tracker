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

export default function TradeCostPreview({ preview, tt }) {
  if (!preview?.applies) return null;
  return (
    <div className="trade-cost-preview" data-trade-cost-preview="true">
      <div className="trade-cost-preview-column">
        <div className="trade-cost-preview-label">{tt('trades.costPreview.current', '当前摊薄成本')}</div>
        <div className="trade-cost-preview-value">{costText(preview.current, tt)}</div>
      </div>
      <div className="trade-cost-preview-column">
        <div className="trade-cost-preview-label">{tt('trades.costPreview.after', '交易后预计')}</div>
        <div className="trade-cost-preview-value">{costText(preview.after, tt)}</div>
      </div>
    </div>
  );
}
