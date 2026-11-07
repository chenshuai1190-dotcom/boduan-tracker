import React from 'react';
import StockRsiReference from '../components/StockRsiReference.jsx';
import TqqqRsiReference from '../components/TqqqRsiReference.jsx';
import { GenericLedgerTradeMarketReference } from '../components/GenericLedgerTradeEntryPanel.jsx';
import { getInvestmentComparisonExpectedCloseDate } from '../lib/investmentComparison.js';
import { stockRsiLocalDateKey } from '../lib/stockRsiReference.js';
import { deriveTradeVixRatioReference } from '../lib/tradeVixRatioReference.js';
import { createTradeVixRatioPreview } from './tradeVixRatioPreview.js';

// Only imported by the existing DEV-only visual preview. These examples never
// enter authenticated loaders or a real ledger callback.
export function createBuyDisciplinePreview(scenario) {
  if (!['unmet', 'met', 'unknown'].includes(scenario)) return null;
  const now = Date.parse('2026-11-07T04:00:00Z');
  const vix = createTradeVixRatioPreview(scenario === 'unknown' ? 'missing' : 'below', now);
  if (vix.data) Object.assign(vix.data.termStructure.rows[0], { vix: 22.25, vix3m: 25, ratio: 0.89 });
  return { now, tradeDate: stockRsiLocalDateKey(now), vix,
    rsiReference: { status: 'ready', reason: '', observation: {
      value: scenario === 'met' ? 18.6 : 78.2, asOf: getInvestmentComparisonExpectedCloseDate(now),
    } },
  };
}

export default function BuyTradeDisciplinePreview({ fixture, symbol, side, tradeDate, englishMode, tt }) {
  const Reference = symbol === 'TQQQ' ? TqqqRsiReference : StockRsiReference;
  return <>
    <p className="tqqq-rsi-design-historical" role="note">{englishMode ? 'Local preview · Example data · No real trades saved' : '本地预览 · 示例数据 · 不保存真实交易'}</p>
    <Reference symbol={symbol} side={side} englishMode={englishMode} observation={tradeDate === fixture.tradeDate ? fixture.rsiReference.observation : null} />
    {symbol !== 'TQQQ' && side !== 'sell' && <GenericLedgerTradeMarketReference symbol={symbol} tt={tt}
      marketReference={deriveTradeVixRatioReference({ data: fixture.vix.data, tradeDate, now: fixture.now })} />}
  </>;
}
