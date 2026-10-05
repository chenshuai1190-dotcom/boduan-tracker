import React from 'react';
import StockRsiReference from '../components/StockRsiReference.jsx';
import { GenericLedgerTradeMarketReference } from '../components/GenericLedgerTradeEntryPanel.jsx';
import { deriveStockTradeMarketReference } from '../lib/stockTradeMarketReference.js';
import './TqqqRsiDesignPreview.css';

// Local design fixtures never enter the live quote or trade-save paths.
const scenarios = {
  oversold: { zh: '超卖', en: 'Oversold', value: 28.6, previousValue: 31.4 },
  normal: { zh: '正常', en: 'Normal', value: 48.2, previousValue: 45.6 },
  overbought: { zh: '超买', en: 'Overbought', value: 74.2, previousValue: 68.9 },
  strong: { zh: '强超买', en: 'Strongly overbought', value: 82.4, previousValue: 78.6 },
  unavailable: { zh: '缺少数据', en: 'Unavailable', value: null, previousValue: null },
};
const quotes = {
  NVDA: { price: 233.95, week52High: 250.2 },
  MSFT: { price: 517.53, week52High: 555.45 },
  META: { price: 682.31, week52High: 796.25 },
  GOOGL: { price: 343.24, week52High: 366.5 },
};

export default function StockTradeDesignReference({ symbol, side, tradeDate, englishMode, tt }) {
  const [scenario, setScenario] = React.useState(() => {
    const requested = new URLSearchParams(window.location.search).get('rsiScenario');
    return Object.hasOwn(scenarios, requested) ? requested : 'strong';
  });
  const referenceRef = React.useRef(null);
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get('stockScroll') !== 'rsi') return undefined;
    let secondFrame;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => referenceRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }));
    });
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, []);
  const fixture = quotes[symbol];
  const ready = fixture && tradeDate > '2026-10-02';
  const example = scenarios[scenario];
  const observation = ready ? { ...example, asOf: '2026-10-02', previousAsOf: '2026-10-01' } : null;
  const marketReference = deriveStockTradeMarketReference({ symbol,
    quote: ready && scenario !== 'unavailable' ? { ...fixture, symbol, dailyPnlPrice: fixture.price } : null,
    vix: 18.6, vixDataDate: '2026-10-02',
  });
  return <>
    <section className="tqqq-rsi-design-preview" data-stock-trade-preview="true" ref={referenceRef}>
      <div className="tqqq-rsi-design-controls">
        <span>{englishMode ? 'Local design · Example data' : '本地设计 · 示例数据'}</span>
        <select value={scenario} onChange={event => setScenario(event.target.value)} aria-label={englishMode ? 'RSI example state' : 'RSI 示例状态'}>
          {Object.entries(scenarios).map(([key, option]) => <option key={key} value={key}>{englishMode ? option.en : option.zh}</option>)}
        </select>
      </div>
      <StockRsiReference symbol={symbol} observation={observation} side={side} englishMode={englishMode} />
    </section>
    {side !== 'sell' && <GenericLedgerTradeMarketReference symbol={symbol} marketReference={marketReference} tt={tt} />}
  </>;
}
