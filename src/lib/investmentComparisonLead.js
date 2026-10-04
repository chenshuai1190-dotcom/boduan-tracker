// Compare canonical USD assets at the selected replay point before display rounding.
export function getInvestmentComparisonLead(symbols, point) {
  if (!Array.isArray(symbols) || symbols.length !== 2
    || !symbols.every(symbol => typeof symbol === 'string' && symbol.trim())
    || symbols[0] === symbols[1]) return null;

  const values = symbols.map(symbol => point?.values?.[symbol]);
  if (!values.every(Number.isFinite)) return null;

  const difference = values[0] - values[1];
  if (!Number.isFinite(difference)) return null;
  // Keep the same tie tolerance as the chart's investmentRank.
  const tolerance = Number.EPSILON * Math.max(1, ...values.map(Math.abs)) * 8;
  const returns = symbols.map(symbol => point?.returns?.[symbol]);
  const validReturns = returns.every(Number.isFinite);
  const returnTolerance = validReturns ? Number.EPSILON * Math.max(1, ...returns.map(Math.abs)) * 8 : null;
  if (Math.abs(difference) <= tolerance) {
    const returnDifference = validReturns ? returns[0] - returns[1] : null;
    return {
      leader: null, trailing: null, amountUsd: 0, tied: true,
      returnGapPoints: Number.isFinite(returnDifference) && Math.abs(returnDifference) <= returnTolerance ? 0 : null,
    };
  }

  const leaderIndex = difference > 0 ? 0 : 1;
  // Returns already use percent units (30 means 30%), so subtraction gives
  // percentage points. A conflicting return direction cannot be shown as a lead.
  const returnDifference = validReturns ? returns[leaderIndex] - returns[1 - leaderIndex] : null;
  return {
    leader: symbols[leaderIndex],
    trailing: symbols[1 - leaderIndex],
    amountUsd: Math.abs(difference),
    tied: false,
    returnGapPoints: Number.isFinite(returnDifference) && returnDifference >= -returnTolerance ? Math.max(0, returnDifference) : null,
  };
}
