import React from 'react';
import StockDecisionPage from '../pages/StockDecisionPage.jsx';
import { normalizeStockDecisionData } from '../lib/stockDecision.js';
import { normalizeStockValuationData } from '../lib/stockDecisionValuation.js';

// The optional local server uses public market data only. Production never loads
// this adapter and always goes through the authenticated quote endpoint.
const previewSource = {
  initialSymbol: 'NVDA',
  async loadValuation({ symbol, signal }) {
    const response = await fetch(`/__stock-valuation-preview?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store', signal });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success !== true) throw Object.assign(new Error('Local valuation unavailable'), { code: 'NETWORK_ERROR' });
    const data = normalizeStockValuationData(body.data, { symbol });
    if (!data) throw Object.assign(new Error('Invalid local valuation'), { code: 'INVALID_DATA' });
    return data;
  },
  async load({ symbol, signal }) {
    const response = await fetch(`/__stock-decision-preview?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store', signal });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success !== true) throw Object.assign(new Error('Local data unavailable'), { code: body?.code || 'NETWORK_ERROR' });
    const data = normalizeStockDecisionData(body.data, { symbol });
    if (!data) throw Object.assign(new Error('Invalid local data'), { code: 'INVALID_DATA' });
    return data;
  },
};

export default function StockDecisionPreview({ language, marketColorMode, onBack }) {
  if (!import.meta.env.DEV) return null;
  return <StockDecisionPage ctx={{ userId: 'dev-stock-decision', language, marketColorMode, closeStockDecision: onBack }} previewSource={previewSource} />;
}
