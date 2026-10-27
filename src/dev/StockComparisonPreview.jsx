import React from 'react';
import StockComparisonPage from '../pages/StockComparisonPage.jsx';
import { STOCK_COMPARISON_DEMO } from './stockComparisonFixture.js';
import { INVESTMENT_SYMBOL_PRESETS } from '../lib/investmentSymbolPresets.js';

// This adapter is imported only by the DEV preview entry. Production always
// loads the authenticated EODHD endpoint from StockComparisonPage.
export default function StockComparisonPreview({ ctx }) {
  const realSample = new URLSearchParams(window.location.search).get('comparisonLive') === '1';
  const [captured, setCaptured] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    if (!import.meta.env.DEV || !realSample) return undefined;
    const controller = new AbortController();
    fetch('/__stock-comparison-preview.json', { cache: 'no-store', signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Missing capture'); return response.json(); })
      .then(data => {
        if (data.source !== 'EODHD_EOD_SPLITS' || data.priceBasis !== 'split_adjusted_close' || !data.series) throw new Error('Invalid capture');
        if (!controller.signal.aborted) setCaptured(data);
      }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [realSample]);
  const source = React.useMemo(() => {
    const sample = realSample ? captured : STOCK_COMPARISON_DEMO;
    if (!sample) return null;
    return {
      synthetic: !realSample,
      asOfDate: sample.expectedAsOfDate || sample.asOfDate,
      load: async ({ symbols, startDate, endDate }) => {
        if (symbols.some(symbol => !sample.series[symbol])) throw new Error('Outside captured sample');
        return { ...sample, symbols, series: Object.fromEntries(symbols.map(symbol => [symbol, { ...sample.series[symbol], rows: sample.series[symbol].rows.filter(row => row.date >= startDate && row.date <= endDate) }])) };
      },
      search: async ({ query }) => ({ results: (realSample ? Object.values(sample.series) : INVESTMENT_SYMBOL_PRESETS).filter(item => `${item.symbol} ${item.name} ${item.nameZh || ''}`.toLowerCase().includes(query.toLowerCase())) }),
    };
  }, [realSample, captured]);
  if (!import.meta.env.DEV) return null;
  if (!source) return <p className="py-16 text-center text-sm text-white/55">{failed ? '本地真实行情样本尚未准备。' : '正在读取真实行情样本…'}</p>;
  return <StockComparisonPage key={realSample ? 'captured' : 'synthetic'} ctx={{ ...ctx, userId: 'local-stock-comparison-preview' }} previewSource={source} />;
}
