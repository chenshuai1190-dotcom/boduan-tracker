import { buildPortfolioOverlapModel } from './portfolioOverlapModel.js';

function portfolioOf(holdings, instruments) {
  if (!Array.isArray(holdings)) return null;
  try {
    const portfolio = buildPortfolioOverlapModel({ holdings, instruments });
    // The public overlap model can report known amounts with a missing quote.
    // A trade preview requires a fully valued denominator on each side.
    if (!portfolio.valuationComplete) return null;
    const coverageComplete = portfolio.unexpandedAmount === 0 && portfolio.leveragedAmount === 0;
    return { ...portfolio, coverageComplete, identifiedOnly: !coverageComplete };
  } catch {
    return null;
  }
}

function companyAt(portfolio, symbol) {
  if (!portfolio) return null;
  const company = portfolio.companies.find(row => row.symbol === symbol);
  if (company) return company;
  // Absence from a partial basket is not evidence of zero exposure.
  if (!portfolio.coverageComplete) return null;
  return { amount: 0, percent: portfolio.total > 0 ? 0 : null, directAmount: 0, indirectAmount: 0 };
}

const difference = (after, current) => Number.isFinite(after) && Number.isFinite(current) ? after - current : null;

/**
 * Read-only comparison of identified company exposure before/after one formal
 * trade replay. Both sides share the same metadata and current valuation basis.
 * Percentages retain the entire stock/ETF portfolio denominator, including
 * unknown instruments and leveraged ETFs. Partial weights are never normalized.
 * Amounts are USD; deltaPercent is a percentage-point change, not a return.
 */
export function deriveTradeExposurePreview({ currentHoldings, afterHoldings, instruments } = {}) {
  const current = portfolioOf(currentHoldings, instruments);
  const after = portfolioOf(afterHoldings, instruments);
  const symbols = new Set([...(current?.companies ?? []), ...(after?.companies ?? [])].map(row => row.symbol));
  const companies = [...symbols].map(symbol => {
    const before = companyAt(current, symbol);
    const next = companyAt(after, symbol);
    const currentAmount = before?.amount ?? null;
    const afterAmount = next?.amount ?? null;
    const currentPercent = before?.percent ?? null;
    const afterPercent = next?.percent ?? null;
    return {
      symbol, currentAmount, afterAmount, currentPercent, afterPercent,
      currentDirectAmount: before?.directAmount ?? null,
      currentIndirectAmount: before?.indirectAmount ?? null,
      afterDirectAmount: next?.directAmount ?? null,
      afterIndirectAmount: next?.indirectAmount ?? null,
      deltaAmount: difference(afterAmount, currentAmount),
      deltaPercent: difference(afterPercent, currentPercent),
    };
  }).sort((left, right) => (right.afterAmount ?? right.currentAmount ?? -1) - (left.afterAmount ?? left.currentAmount ?? -1)
    || left.symbol.localeCompare(right.symbol, 'en'));
  const currentTopFive = current?.topFivePercent ?? null;
  const afterTopFive = after?.topFivePercent ?? null;
  return {
    current, after, companies,
    topFive: { current: currentTopFive, after: afterTopFive, delta: difference(afterTopFive, currentTopFive) },
    partial: !current || !after || current.identifiedOnly || after.identifiedOnly,
    reason: !current || !after ? 'valuation-unavailable' : null,
  };
}
