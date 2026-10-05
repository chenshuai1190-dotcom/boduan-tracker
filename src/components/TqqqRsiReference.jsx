import React from 'react';
import { normalizeRsiReferenceObservation } from '../lib/rsiReferenceObservation.js';
import { MARKET_GREEN_HEX, MARKET_RED_HEX } from '../lib/marketColorMode.js';
import './TqqqRsiReference.css';

// Values are supplied Wilder RSI(6) observations. The data adapter owns completed
// session and freshness verification; this view only validates the supplied pair.
export function getTqqqRsiReferenceState(observation) {
  const state = normalizeRsiReferenceObservation(observation);
  const { value } = state;
  return {
    ...state,
    status: value === null ? 'unavailable' : value <= 30 ? 'buy-watch' : value >= 70 ? 'sell-watch' : 'neutral',
  };
}

function formatRsi(value) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

export default function TqqqRsiReference({ observation, side = 'buy', englishMode = false, unavailableLabel, loading = false }) {
  const state = getTqqqRsiReferenceState(observation);
  const available = state.value !== null;
  const hasPrevious = state.previousValue !== null;
  const isSell = side === 'sell';
  const copy = englishMode ? {
    label: `TQQQ ${isSell ? 'sell' : 'buy'} RSI(6) reference`,
    'buy-watch': 'Buy watch zone',
    'sell-watch': 'Sell watch zone',
    neutral: 'Outside watch zones',
    unavailable: 'No data',
    'above-30': 'Back above 30',
    'below-70': 'Back below 70',
    prior: 'Prior',
    current: 'Current',
    buy: 'Buy watch ≤30',
    sell: 'Sell watch ≥70',
    close: 'Close',
  } : {
    label: `TQQQ ${isSell ? '卖出' : '买入'} RSI(6) 参考`,
    'buy-watch': '买入观察',
    'sell-watch': '卖出观察',
    neutral: '未进入参考区',
    unavailable: '暂无数据',
    'above-30': '重新站上 30',
    'below-70': '重新跌回 70 以下',
    prior: '上一日',
    current: '本次',
    buy: '买入关注 ≤30',
    sell: '卖出关注 ≥70',
    close: '收盘',
  };

  return (
    <section className="tqqq-rsi-reference" aria-label={copy.label} aria-busy={loading} data-status={state.status}
      style={{ '--tqqq-rsi-low-color': MARKET_GREEN_HEX, '--tqqq-rsi-high-color': MARKET_RED_HEX }}>
      <div className="tqqq-rsi-reference-heading">
        <span>TQQQ · RSI(6)</span>
      </div>
      <div className="tqqq-rsi-reference-main">
        <strong className="tqqq-rsi-reference-value" title={available ? String(state.value) : undefined}>
          {available ? formatRsi(state.value) : '—'}
        </strong>
        <span className="tqqq-rsi-reference-status">{available ? copy[state.status] : (unavailableLabel || copy.unavailable)}</span>
      </div>
      <div className="tqqq-rsi-reference-change">
        {hasPrevious ? (
          <span className="tqqq-rsi-reference-pair">
            {copy.prior} {formatRsi(state.previousValue)} <span aria-hidden="true">→</span> {copy.current} {formatRsi(state.value)}
          </span>
        ) : <span>{available ? `${copy.prior} —` : '—'}</span>}
        {state.crossing && <span className="tqqq-rsi-reference-crossing">{copy[state.crossing]}</span>}
      </div>
      <div className="tqqq-rsi-reference-scale" aria-hidden="true">
        <div className="tqqq-rsi-reference-track">
          <i className="tqqq-rsi-reference-boundary" style={{ left: '30%' }} />
          <i className="tqqq-rsi-reference-boundary" style={{ left: '70%' }} />
          {available && <i className="tqqq-rsi-reference-dot" style={{ left: `${state.value}%` }} />}
        </div>
        <div className="tqqq-rsi-reference-ticks">
          <span>0</span><span style={{ left: '30%' }}>30</span><span style={{ left: '70%' }}>70</span><span>100</span>
        </div>
      </div>
      <div className="tqqq-rsi-reference-thresholds">
        <span data-selected={!isSell}>{copy.buy}</span>
        <span data-selected={isSell}>{copy.sell}</span>
      </div>
      <div className="tqqq-rsi-reference-asof">
        {available ? <>{copy.close} · <time dateTime={state.asOf}>{state.asOf}</time></> : `${copy.close} · —`}
      </div>
    </section>
  );
}
