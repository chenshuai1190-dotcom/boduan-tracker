import React from 'react';
import { MARKET_GREEN_HEX, MARKET_RED_HEX } from '../lib/marketColorMode.js';
import { normalizeRsiReferenceObservation } from '../lib/rsiReferenceObservation.js';
import { stockTrendRsiState } from '../lib/stockTrendRsiSignal.js';
import './TqqqRsiReference.css';
import './StockRsiReference.css';

export function getStockRsiReferenceState(observation) {
  const state = normalizeRsiReferenceObservation(observation);
  const trendState = stockTrendRsiState(state.value);
  return {
    ...state,
    status: trendState === null ? 'unavailable' : state.value <= 30 ? 'oversold'
      : trendState === 'STRONGLY_OVERBOUGHT' ? 'strongly-overbought'
        : trendState === 'OVERBOUGHT' ? 'overbought' : 'normal',
  };
}

const formatRsi = value => value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

export default function StockRsiReference({ symbol, observation, side = 'buy', englishMode = false, unavailableLabel, loading = false }) {
  const state = getStockRsiReferenceState(observation);
  const available = state.value !== null;
  const hasPrevious = state.previousValue !== null;
  const copy = englishMode ? {
    label: `${symbol || 'Stock'} ${side === 'sell' ? 'sell' : 'buy'} RSI(6) reference`,
    oversold: 'Oversold', normal: 'Normal', overbought: 'Overbought', 'strongly-overbought': 'Strongly overbought',
    unavailable: 'No data', 'above-30': 'Back above 30', 'below-70': 'Back below 70',
    prior: 'Prior', current: 'Current', close: 'Close',
    low: 'Oversold ≤30', high: 'Overbought ≥70 · Strong ≥80',
  } : {
    label: `${symbol || '股票'} ${side === 'sell' ? '卖出' : '买入'} RSI(6) 参考`,
    oversold: '超卖', normal: '正常', overbought: '超买', 'strongly-overbought': '强超买',
    unavailable: '暂无数据', 'above-30': '重新站上 30', 'below-70': '重新跌回 70 以下',
    prior: '上一日', current: '本次', close: '收盘',
    low: '超卖 ≤30', high: '超买 ≥70 · 强超买 ≥80',
  };

  return (
    <section className="tqqq-rsi-reference stock-rsi-reference" aria-label={copy.label} aria-busy={loading} data-status={state.status}
      style={{ '--tqqq-rsi-low-color': MARKET_GREEN_HEX, '--tqqq-rsi-high-color': MARKET_RED_HEX }}>
      <div className="tqqq-rsi-reference-heading"><span>{symbol || '—'} · RSI(6)</span></div>
      <div className="tqqq-rsi-reference-main">
        <strong className="tqqq-rsi-reference-value" title={available ? String(state.value) : undefined}>
          {available ? formatRsi(state.value) : '—'}
        </strong>
        <span className="tqqq-rsi-reference-status">{available ? copy[state.status] : (unavailableLabel || copy.unavailable)}</span>
      </div>
      <div className="tqqq-rsi-reference-change">
        {hasPrevious ? <span className="tqqq-rsi-reference-pair">
          {copy.prior} {formatRsi(state.previousValue)} <span aria-hidden="true">→</span> {copy.current} {formatRsi(state.value)}
        </span> : <span>{available ? `${copy.prior} —` : '—'}</span>}
        {state.crossing && <span className="tqqq-rsi-reference-crossing">{copy[state.crossing]}</span>}
      </div>
      <div className="tqqq-rsi-reference-scale" aria-hidden="true">
        <div className="tqqq-rsi-reference-track">
          {[30, 70, 80].map(value => <i key={value} className="tqqq-rsi-reference-boundary" style={{ left: `${value}%` }} />)}
          {available && <i className="tqqq-rsi-reference-dot" style={{ left: `${state.value}%` }} />}
        </div>
        <div className="tqqq-rsi-reference-ticks">
          <span>0</span>{[30, 70, 80].map(value => <span key={value} style={{ left: `${value}%` }}>{value}</span>)}<span>100</span>
        </div>
      </div>
      <div className="tqqq-rsi-reference-thresholds"><span>{copy.low}</span><span>{copy.high}</span></div>
      <div className="tqqq-rsi-reference-asof">
        {available ? <>{copy.close} · <time dateTime={state.asOf}>{state.asOf}</time></> : `${copy.close} · —`}
      </div>
    </section>
  );
}
