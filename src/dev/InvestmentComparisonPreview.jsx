import React from 'react';
import InvestmentComparisonPage from '../pages/InvestmentComparisonPage.jsx';

// Development-only adapter: captured public prices, never a production auth path.
export default function InvestmentComparisonPreview({ ctx }) {
  const [fixture, setFixture] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    if (!import.meta.env.DEV) return undefined;
    fetch('/__investment-preview.json', { cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error('preview unavailable'); return response.json(); })
      .then(data => { if (data.source !== 'EODHD_EOD' || !Array.isArray(data.comparisons)) throw new Error('invalid preview'); if (active) setFixture(data); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  const previewSource = React.useMemo(() => {
    if (!fixture) return null;
    const allSeries = Object.assign({}, ...fixture.comparisons.map(data => data.series));
    return {
      load: async ({ symbols }) => {
        if (symbols.some(symbol => !allSeries[symbol])) throw new Error('outside captured preview');
        const template = fixture.comparisons[0];
        const asOfDate = symbols.map(symbol => allSeries[symbol].rows.at(-1).date).sort()[0];
        return {
          ...template, symbols, asOfDate,
          availableFromDate: symbols.map(symbol => allSeries[symbol].rows[0].date).sort().at(-1),
          stale: asOfDate !== template.expectedAsOfDate,
          staleReason: asOfDate !== template.expectedAsOfDate ? 'incomplete_close' : '',
          series: Object.fromEntries(symbols.map(symbol => [symbol, { ...allSeries[symbol], rows: allSeries[symbol].rows.filter(row => row.date <= asOfDate) }])),
        };
      },
      search: async ({ query }) => ({
        version: 1, source: 'EODHD_SEARCH', query, fetchedAt: fixture.capturedAt,
        results: Object.values(allSeries).filter(item => `${item.symbol} ${item.name}`.toLowerCase().includes(query.toLowerCase())).map(({ symbol, name, type }) => ({ symbol, name, type, currency: 'USD', exchange: 'US' })),
      }),
    };
  }, [fixture]);
  if (!import.meta.env.DEV) return null;
  if (!previewSource) return <div className="py-16 text-center text-[13px] text-white/55">{failed ? '本地真实行情验证文件未准备，请先运行 live-smoke 与 preview 脚本。' : '正在读取已核验的真实行情样本…'}</div>;
  return <InvestmentComparisonPage ctx={{ ...ctx, userId: 'dev-public-market-preview' }} previewSource={previewSource} />;
}
