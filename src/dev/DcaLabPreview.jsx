import React from 'react';
import DcaLabPage from '../pages/DcaLabPage.jsx';

// DEV-only captured public history; production still requires authenticated API access.
export default function DcaLabPreview({ ctx }) {
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
    return { load: async ({ symbol }) => {
      const series = allSeries[symbol];
      if (!series) throw new Error('该标的尚未准备本地真实行情样本');
      const template = fixture.comparisons[0];
      const asOfDate = series.rows.at(-1).date;
      return {
        version: 1, source: 'EODHD_EOD', symbol, name: series.name, type: series.type,
        currency: 'USD', priceBasis: 'adjusted_close', rows: series.rows,
        availableFromDate: series.rows[0].date, asOfDate, expectedAsOfDate: template.expectedAsOfDate,
        stale: asOfDate !== template.expectedAsOfDate, staleReason: asOfDate !== template.expectedAsOfDate ? 'incomplete_close' : '',
        fetchedAt: fixture.capturedAt,
      };
    }};
  }, [fixture]);
  if (!import.meta.env.DEV) return null;
  if (!previewSource) return <div className="py-16 text-center text-[13px] text-white/55">{failed ? '本地真实行情样本尚未准备。' : '正在读取已核验的真实行情样本…'}</div>;
  return <DcaLabPage ctx={{ ...ctx, userId: 'dev-public-market-preview' }} previewSource={previewSource} />;
}
