import React from 'react';
import PortfolioOverlapPage from '../pages/PortfolioOverlapPage.jsx';
import fixture from './data/portfolioOverlapMetadata.json';

// DEV only: the ETF disclosures and stock identities are real public data;
// these allocation amounts are explicitly fictional, never personal holdings.
const amounts = { QQQ: 350000, SPY: 250000, NVDA: 150000, AAPL: 100000, MSFT: 50000, TQQQ: 100000 };
const investmentSummary = {
  activePositions: Object.entries(amounts).map(([symbol, marketValue]) => ({
    symbol, name: fixture.instruments.find(row => row.symbol === symbol)?.name || symbol,
    heldShares: 1, valuationPrice: marketValue, marketValue,
  })),
};
const previewSource = {
  load: async ({ symbols }) => ({
    version: 1, fetchedAt: fixture.fetchedAt,
    instruments: symbols.map(symbol => fixture.instruments.find(row => row.symbol === symbol) || {
      symbol, name: symbol, kind: 'unknown', holdingsStatus: 'unavailable', reason: 'outside_preview_capture',
      source: null, asOfDate: null, fetchedAt: fixture.fetchedAt, stale: true, coveragePct: null, holdings: [],
    }),
  }),
};

export default function PortfolioOverlapPreview({ ctx }) {
  if (!import.meta.env.DEV) return null;
  return <>
    <div className="mx-auto max-w-[760px] rounded-xl border border-[#eebc65]/20 bg-[#eebc65]/5 px-3 py-2 text-[11px] text-[#eebc65]" role="note">{ctx.language === 'en' ? 'Local preview · fictional allocation amounts · real public ETF disclosures and security identities' : '本地预览 · 持仓金额为示例 · ETF 成分与证券资料来自真实公开数据'}</div>
    <PortfolioOverlapPage ctx={{ ...ctx, userId: 'dev-overlap-public-data', portfolioReady: true, portfolioError: null, investmentSummary }} previewSource={previewSource} />
  </>;
}
