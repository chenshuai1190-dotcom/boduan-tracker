import React from 'react';
import { ArrowDown, ArrowDownUp, ArrowUp, Pencil, Plus } from 'lucide-react';
import './HomeWatchlistReport.css';

const AUXILIARY_METRICS = {
  watchlist: ['drawdown', 'ytd'],
  positions: ['pnl', 'drawdown', 'ytd'],
};

function SortControl({ label, sortKey, sortState, onSort, language, className = '' }) {
  const active = sortState?.key === sortKey;
  const ascending = active && sortState.direction === 'asc';
  const Icon = active ? (ascending ? ArrowUp : ArrowDown) : ArrowDownUp;
  const description = language === 'en'
    ? `${label}, ${active ? (ascending ? 'ascending' : 'descending') : 'not sorted'}. Sort ${active && !ascending ? 'ascending' : 'descending'}`
    : `${label}，${active ? (ascending ? '当前升序' : '当前降序') : '未排序'}，点击${active && !ascending ? '升序' : '降序'}排列`;

  return (
    <button
      type="button"
      className={`hwr-sort ${active ? 'is-active' : ''} ${className}`}
      onClick={() => onSort?.(sortKey)}
      aria-label={description}
    >
      <span>{label}</span>
      <Icon size={11} strokeWidth={1.6} aria-hidden="true" />
    </button>
  );
}

/** Presentation only: rows and all financial formatting come from HomeTab. */
export default function HomeWatchlistReport({
  language = 'zh',
  tableTab = 'watchlist',
  onTabChange,
  rows = [],
  sortState,
  onSort,
  onAdd,
  onEdit,
  onOpenStock,
  renderLogo,
  formatPrice,
  formatChange,
  formatDrawdown,
  formatPnl,
  formatPnlPct,
  marketColor,
}) {
  const english = language === 'en';
  const isWatchlist = tableTab === 'watchlist';
  const [metricByTab, setMetricByTab] = React.useState({ watchlist: 'drawdown', positions: 'pnl' });
  const auxiliaryMetric = metricByTab[tableTab] || (isWatchlist ? 'drawdown' : 'pnl');
  const labels = english
    ? { watchlist: 'Watchlist', positions: 'Holdings', price: 'Price', change: 'Today', drawdown: 'From 52W high', ytd: 'Year to date', pnl: 'Holding P&L' }
    : { watchlist: '自选', positions: '持仓', price: '价格', change: '今日涨跌', drawdown: '距 52 周高点', ytd: '年内涨幅', pnl: '持仓盈亏' };
  const availableMetrics = AUXILIARY_METRICS[tableTab] || AUXILIARY_METRICS.watchlist;
  const missing = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value));
  const colorFor = (value) => missing(value) ? '#85858d' : marketColor?.(value);
  const formatted = (formatter, value) => missing(value) ? '—' : (formatter?.(value) ?? '—');

  return (
    <section className="home-watchlist-report" data-home-watchlist-report="true" aria-label={english ? 'Watchlist and holdings' : '自选与持仓'}>
      <div className="hwr-heading">
        <div className="hwr-tabs" role="tablist" aria-label={english ? 'Stock lists' : '股票列表'}>
          {['watchlist', 'positions'].map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={tableTab === tab}
              className={`hwr-tab ${tableTab === tab ? 'is-active' : ''}`}
              onClick={() => onTabChange?.(tab)}
            >
              {labels[tab]}
            </button>
          ))}
        </div>
        {isWatchlist && (
          <div className="hwr-actions">
            <button type="button" className="hwr-icon-button" onClick={onAdd} aria-label={english ? 'Add a stock to watchlist' : '添加自选股票'}>
              <Plus size={17} strokeWidth={1.6} aria-hidden="true" />
            </button>
            <button type="button" className="hwr-icon-button" onClick={onEdit} aria-label={english ? 'Edit watchlist' : '编辑自选股票'}>
              <Pencil size={14} strokeWidth={1.6} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div className="hwr-metric-controls" role="group" aria-label={english ? 'Additional metric' : '辅助指标'}>
        {availableMetrics.map((metric) => (
          <button
            key={metric}
            type="button"
            aria-pressed={auxiliaryMetric === metric}
            className={`hwr-metric-chip ${auxiliaryMetric === metric ? 'is-active' : ''}`}
            onClick={() => setMetricByTab((current) => ({ ...current, [tableTab]: metric }))}
          >
            {labels[metric]}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="hwr-empty">
          {isWatchlist
            ? (english ? 'Your watchlist is empty.' : '暂无自选股票。')
            : (english ? 'No holdings yet. Add a buy in Trades to get started.' : '暂无持仓记录，先在交易页添加买入记录。')}
        </div>
      ) : (
        <>
          <div className="hwr-column-headings">
            <SortControl label={labels[auxiliaryMetric]} sortKey={auxiliaryMetric} sortState={sortState} onSort={onSort} language={language} className="hwr-aux-sort" />
            <SortControl label={labels.price} sortKey="price" sortState={sortState} onSort={onSort} language={language} />
            <SortControl label={labels.change} sortKey="change" sortState={sortState} onSort={onSort} language={language} />
          </div>
          <div className="hwr-list">
            {rows.map((item) => {
              const Identity = isWatchlist ? 'button' : 'div';
              const identityProps = isWatchlist ? {
                type: 'button',
                onClick: () => onOpenStock?.(item.symbol),
                'aria-label': english ? `Open ${item.symbol} stock details` : `打开 ${item.symbol} 股票详情`,
              } : {};
              const auxiliaryValue = auxiliaryMetric === 'pnl'
                ? item.pnlValue
                : auxiliaryMetric === 'drawdown' ? item.highDrawdown : item.ytdChangePercent;

              return (
                <div key={item.symbol} className="hwr-row">
                  <div className="hwr-row-main">
                    <Identity className="hwr-identity" {...identityProps}>
                      <span className="hwr-logo" aria-hidden="true">{renderLogo?.(item) || item.symbol?.slice(0, 2)}</span>
                      <span className="hwr-stock-name">
                        <span className="hwr-symbol">{item.symbol}</span>
                        <span className="hwr-company">{item.displayName}</span>
                      </span>
                    </Identity>
                    <span className="hwr-price">{missing(item.price) || Number(item.price) <= 0 ? '—' : formatted(formatPrice, item.price)}</span>
                    <span className="hwr-change" style={{ color: item.color || colorFor(item.changePct) }}>{formatted(formatChange, item.changePct)}</span>
                  </div>
                  <div className="hwr-row-secondary">
                    <span className="hwr-aux-label">{labels[auxiliaryMetric]}</span>
                    <span className="hwr-aux-value" style={{ color: colorFor(auxiliaryValue) }}>
                      {auxiliaryMetric === 'pnl' ? (
                        missing(item.pnlValue) ? '—' : (
                          <>
                            <span>{formatted(formatPnl, item.pnlDisplayValue)}</span>
                            <span className="hwr-aux-percent" style={{ color: colorFor(item.pnlPct) }}>{formatted(formatPnlPct, item.pnlPct)}</span>
                          </>
                        )
                      ) : auxiliaryMetric === 'drawdown'
                        ? formatted(formatDrawdown, item.highDrawdown)
                        : formatted(formatChange, item.ytdChangePercent)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
