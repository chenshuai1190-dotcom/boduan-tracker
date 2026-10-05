import React from 'react';
import TqqqRsiReference from '../components/TqqqRsiReference.jsx';
import './TqqqRsiDesignPreview.css';

// Deterministic design examples only. Never supplied by the production App.
export const TQQQ_RSI_DESIGN_SCENARIOS = Object.freeze({
  buy: { zh: '买入观察', en: 'Buy watch', value: 28.6, previousValue: 31.4 },
  recover: { zh: '站上 30', en: 'Cross above 30', value: 32.4, previousValue: 27.8 },
  sell: { zh: '卖出观察', en: 'Sell watch', value: 74.2, previousValue: 68.9 },
  fall: { zh: '跌回 70', en: 'Cross below 70', value: 67.8, previousValue: 73.1 },
  neutral: { zh: '区间之外', en: 'Between thresholds', value: 48.2, previousValue: 45.6 },
  unavailable: { zh: '缺少数据', en: 'Unavailable', value: null, previousValue: null },
});

export default function TqqqRsiDesignPreview({ side, tradeDate, englishMode = false }) {
  const [scenario, setScenario] = React.useState(() => {
    const requested = new URLSearchParams(window.location.search).get('rsiScenario');
    return Object.hasOwn(TQQQ_RSI_DESIGN_SCENARIOS, requested) ? requested : side === 'sell' ? 'sell' : 'buy';
  });
  const referenceRef = React.useRef(null);
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tqqqScroll') !== 'rsi') return undefined;
    let secondFrame;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => referenceRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' }));
    });
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, []);
  const example = TQQQ_RSI_DESIGN_SCENARIOS[scenario];
  // Do not present the example's later close as evidence for a backdated trade.
  const historicalUnavailable = !tradeDate || tradeDate <= '2026-10-02';
  const observation = historicalUnavailable ? null : {
    value: example.value, previousValue: example.previousValue,
    asOf: '2026-10-02', previousAsOf: '2026-10-01',
  };

  return <section className="tqqq-rsi-design-preview" ref={referenceRef} data-tqqq-rsi-preview="true">
    <div className="tqqq-rsi-design-controls">
      <span>{englishMode ? 'Local design · Example data' : '本地设计 · 示例数据'}</span>
      <label>
        <span className="sr-only">{englishMode ? 'RSI example state' : 'RSI 示例状态'}</span>
        <select value={scenario} onChange={event => setScenario(event.target.value)} aria-label={englishMode ? 'RSI example state' : 'RSI 示例状态'}>
          {Object.entries(TQQQ_RSI_DESIGN_SCENARIOS).map(([key, option]) => <option key={key} value={key}>{englishMode ? option.en : option.zh}</option>)}
        </select>
      </label>
    </div>
    <TqqqRsiReference observation={observation} side={side} englishMode={englishMode} />
    {historicalUnavailable && <p className="tqqq-rsi-design-historical">{englishMode ? 'The example has no completed close before this trade date.' : '该交易日前的历史参考未接入示例。'}</p>}
  </section>;
}
