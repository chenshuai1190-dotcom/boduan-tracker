import React from 'react';
import DrawdownObservation from '../components/DrawdownObservation.jsx';
import DrawdownObservationPage from '../pages/DrawdownObservationPage.jsx';
import { DRAWDOWN_PREVIEW, deriveObservation } from './drawdownObservationData.js';
import { getInvestmentComparisonExpectedCloseDate } from '../lib/investmentComparison.js';

let fixturePromise;
function loadCapturedFixture() {
  if (!fixturePromise) fixturePromise = fetch('/__investment-preview.json', { cache: 'no-store' })
    .then(response => { if (!response.ok) throw new Error('preview unavailable'); return response.json(); })
    .then(data => { if (data.source !== 'EODHD_EOD' || !Array.isArray(data.comparisons)) throw new Error('invalid preview'); return data; })
    .catch(error => { fixturePromise = null; throw error; });
  return fixturePromise;
}

// The default acceptance path uses captured real public prices; fictional prices
// remain accessible only through an explicit DEV design fixture.
export default function DrawdownObservationPreview({ onBack, initialSymbol = '' }) {
  const synthetic = import.meta.env.DEV && new URLSearchParams(window.location.search).get('drawdownData') === 'synthetic';
  const previewSource = React.useMemo(() => {
    return { initialSymbol, verifySession: async ({ userId }) => {
      if (userId !== 'dev-public-market-preview') throw new Error('Invalid preview identity');
    }, load: async ({ symbol }) => {
      const fixture = await loadCapturedFixture();
      const series = Object.assign({}, ...fixture.comparisons.map(data => data.series));
      const row = series[symbol];
      if (!row) throw new Error('No captured history');
      const asOfDate = row.rows.at(-1).date;
      const expectedAsOfDate = getInvestmentComparisonExpectedCloseDate(Date.now());
      return { version: 1, source: 'EODHD_EOD', symbol, name: row.name, type: row.type, currency: 'USD', priceBasis: 'adjusted_close', rows: row.rows,
        availableFromDate: row.rows[0].date, asOfDate, expectedAsOfDate, fetchedAt: fixture.capturedAt,
        stale: asOfDate !== expectedAsOfDate, staleReason: asOfDate !== expectedAsOfDate ? 'incomplete_close' : '' };
    } };
  }, [initialSymbol]);
  if (!import.meta.env.DEV) return null;
  if (synthetic) return <DrawdownObservation onBack={onBack} initialSymbol={initialSymbol} observations={DRAWDOWN_PREVIEW.instruments.map(item => deriveObservation(item, DRAWDOWN_PREVIEW.asOfDate))} demo vix={DRAWDOWN_PREVIEW.vix} />;
  return <DrawdownObservationPage previewSource={previewSource} ctx={{ userId: 'dev-public-market-preview', closeDrawdownObservation: onBack,
    watchlist: ['AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'TSLA', 'AVGO'],
    positions: [{ symbol: 'NVDA', quantity: 1 }, { symbol: 'MSFT', quantity: 1 }, { symbol: 'META', quantity: 1 }, { symbol: 'AVGO', quantity: 1 }],
  }} />;
}
