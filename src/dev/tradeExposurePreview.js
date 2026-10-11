import metadata from './data/portfolioOverlapMetadata.json';
import { deriveInvestmentSummary } from '../lib/investmentSummary.js';

// Local visual examples only. No personal positions or transactions are read.
export const exposurePreviewTrades = [
  { id: 'exposure-nvda', symbol: 'NVDA', side: 'buy', date: '2025-01-02', price: 138, shares: 6000 },
  { id: 'exposure-msft', symbol: 'MSFT', side: 'buy', date: '2025-01-02', price: 420, shares: 1000 },
  { id: 'exposure-qqq', symbol: 'QQQ', side: 'buy', date: '2025-01-02', price: 510, shares: 2000 },
  { id: 'exposure-spy', symbol: 'SPY', side: 'buy', date: '2025-01-02', price: 580, shares: 1000 },
  { id: 'outcome-nvda', symbol: 'NVDA', side: 'sell', date: '2026-07-02', price: 205, shares: 500, note: '示例：减仓后观察集中度与后续走势。' },
];
export const exposurePreviewQuotes = Object.entries({ NVDA: 234, MSFT: 517, QQQ: 750, SPY: 650 }).map(([symbol, price]) => ({
  symbol, price, priceSource: 'EODHD-v2', dailyPnlPrice: price, dailyPnlSource: 'realtime-regular',
}));
export const exposurePreviewSummary = deriveInvestmentSummary({ stockTrades: exposurePreviewTrades, watchlist: exposurePreviewQuotes });
export async function loadExposurePreviewMetadata({ symbols }) {
  return { version: 1, fetchedAt: metadata.fetchedAt, instruments: symbols.map(symbol => metadata.instruments.find(row => row.symbol === symbol) || {
    symbol, name: symbol, kind: 'unknown', holdingsStatus: 'unavailable', holdings: [],
    source: null, asOfDate: null, fetchedAt: metadata.fetchedAt, coveragePct: null, stale: true,
  }) };
}
