import React from 'react';
import './TradesPositionsReport.css';

/** Read-only report: all amounts, precision, missing values and colors are supplied by TradesTab. */
export default function TradesPositionsReport({
  rows = [],
  tt = (_key, fallback) => fallback,
  onOpenStock,
  onScenario,
  onTrade,
}) {
  return (
    <div className="trades-positions-report" data-trades-positions-report="true" data-trade-positions-table="horizontal" role="region" aria-label={tt('trades.positionsTab', '持仓分布')} tabIndex={0}>
      <table className="tpr-table">
        <thead>
          <tr>
            <th scope="col">{tt('trades.nameTicker', '名称/代码')}</th>
            <th scope="col">{tt('trades.valueQty', '市值/数量')}</th>
            <th scope="col">{tt('trades.priceCost', '现价/成本')}</th>
            <th scope="col">{tt('trades.dailyPnl', '当日盈亏')}</th>
            <th scope="col">{tt('trades.positionPnl', '持仓盈亏')}</th>
            <th scope="col">{tt('trades.allocation', '占比')}</th>
            <th scope="col">{tt('trades.ytdChange', '年初至今')}</th>
          </tr>
        </thead>
        <tbody>
      {rows.map((row) => (
        <tr className="tpr-position" key={row.symbol} data-trades-position-symbol={row.symbol}>
          <td>
            <button
              type="button"
              className="tpr-stock"
              onClick={() => onOpenStock?.(row)}
              aria-label={`${tt('stockDetail.openAria', '打开个股收益详情')} ${row.symbol}`}
            >
              <span className="tpr-stock-text">
                <span className="tpr-stock-title">{row.title}</span>
                <span className="tpr-stock-subtitle">{row.subtitle}</span>
              </span>
            </button>
          </td>
          <td>
            <button type="button" className="tpr-cell tpr-cell-left" onClick={() => onTrade?.(row)} aria-label={`${tt('trades.reportRecordTrade', '记交易')} ${row.symbol}`} data-position-action="trade">
              <span className="tpr-value" data-position-field="market-value">{row.marketValue}</span>
              <span className="tpr-secondary" data-position-field="quantity">{row.quantity}</span>
            </button>
          </td>
          <td>
            <button
              type="button"
              className="tpr-cell"
              onClick={() => onScenario?.(row)}
              aria-label={`${tt('trades.openScenarioAria', '打开持仓收益试算')} ${row.symbol}`}
              data-position-action="scenario"
            >
              <span className="tpr-value" data-position-field="price">{row.price}</span>
              <span className="tpr-secondary" data-position-field="cost">{row.cost}</span>
            </button>
          </td>
          <td>
            <button type="button" className="tpr-cell" onClick={() => onTrade?.(row)}>
              <span className={`tpr-value ${row.todayPnlClass || ''}`} data-position-field="today-pnl">{row.todayPnl}</span>
              <span className={`tpr-secondary ${row.todayPnlPctClass || ''}`} data-position-field="today-pnl-pct">{row.todayPnlPct}</span>
            </button>
          </td>
          <td>
            <button type="button" className="tpr-cell" onClick={() => onTrade?.(row)}>
              <span className={`tpr-value ${row.holdingPnlClass || ''}`} data-position-field="holding-pnl">{row.holdingPnl}</span>
              <span className={`tpr-secondary ${row.holdingPnlPctClass || ''}`} data-position-field="holding-pnl-pct">{row.holdingPnlPct}</span>
            </button>
          </td>
          <td>
            <button type="button" className="tpr-cell" onClick={() => onTrade?.(row)}>
              <span className="tpr-value" data-position-field="allocation">{row.allocation}</span>
            </button>
          </td>
          <td>
            <div className="tpr-cell">
              <span className={`tpr-value ${row.ytdChangePctClass || ''}`} data-position-field="ytd-change-pct">{row.ytdChangePct}</span>
            </div>
          </td>
        </tr>
      ))}
        </tbody>
      </table>
    </div>
  );
}
