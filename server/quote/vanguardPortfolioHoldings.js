const VGT_BASE_URL = 'https://advisors.vanguard.com/investments/products/api/funds/0958';
export const VGT_FUND_URL = VGT_BASE_URL;
export const VGT_STATISTICS_URL = `${VGT_BASE_URL}/analytics/portfolio-statistics`;
export const VGT_HOLDINGS_URL = `${VGT_BASE_URL}/holdings/latest`;

function invalid() {
  return Object.assign(new TypeError('Invalid Vanguard VGT portfolio disclosure'), { code: 'INVALID_DATA' });
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function dateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function nameOf(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 200
    && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
}

function symbolOf(value) {
  return typeof value === 'string' && /^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)?$/.test(value)
    && value.length <= 15 && !/\.(?:US|INDX|FOREX|CC|LSE|HK|TO)$/.test(value) ? value : null;
}

function percentOfFunds(row, allowNegative) {
  if (!record(row) || typeof row.percentOfFunds !== 'number' || !Number.isFinite(row.percentOfFunds)
    || row.percentOfFunds > 100 || row.percentOfFunds < (allowNegative ? -100 : 0)) throw invalid();
  return row.percentOfFunds;
}

/**
 * Parse the three fixed official 0958 responses, fetched together as an envelope.
 * The holdings response has no fund identifier of its own. Its companion fund
 * identity and same-date stock count are required; a bare basket is insufficient.
 * percentOfFunds is already a percentage, with five-decimal source precision.
 */
export function parseVanguardPortfolioHoldings(payload) {
  const { fund, statistics, holdings: disclosure } = record(payload) ? payload : {};
  if (!record(fund) || fund.portId !== '0958' || fund.fundIdentifier !== 'VGT'
    || fund.fundName !== 'Vanguard Information Technology ETF'
    || fund.isETF !== true || fund.isEquity !== true || fund.isIndex !== true
    || !record(statistics) || !record(disclosure)) throw invalid();

  const asOfDate = disclosure.latestEffectiveDate;
  if (!dateKey(asOfDate) || asOfDate < '2004-01-26' || statistics.effectiveDate !== asOfDate
    || !Number.isInteger(statistics.CSTOCK) || statistics.CSTOCK < 50 || statistics.CSTOCK > 1000
    || !Object.hasOwn(disclosure, asOfDate) || !record(disclosure[asOfDate])) throw invalid();
  const portfolio = disclosure[asOfDate];
  const groups = ['equity', 'fixedIncome', 'shortTermReserves', 'derivatives'];
  if (groups.some(group => !Array.isArray(portfolio[group]) || portfolio[group].length > 2000)
    || portfolio.equity.length !== statistics.CSTOCK) throw invalid();

  // allocationToUnderlyingFunds repeats shortTermReserves; the money-market
  // view also repeats equity rows. Count only the mutually exclusive groups.
  let totalWeight = 0;
  for (const group of groups) {
    for (const row of portfolio[group]) totalWeight += percentOfFunds(row, group !== 'equity');
  }
  if (!Number.isFinite(totalWeight) || totalWeight < 95 || totalWeight > 100.5) throw invalid();

  const parsedHoldings = [];
  const seen = new Set();
  for (const row of portfolio.equity) {
    const name = nameOf(row.holdingName);
    if (!name || typeof row.ticker !== 'string' || typeof row.country !== 'string'
      || typeof row.securityDepositoryReceiptType !== 'string') throw invalid();
    const symbol = symbolOf(row.ticker);
    const securityType = row.securityDepositoryReceiptType === '' ? 'stock'
      : row.securityDepositoryReceiptType === 'ADR' ? 'adr' : null;
    // No guessed mappings for foreign/unidentified securities, cash, futures,
    // or swaps. Their disclosed weight remains in the unexpanded remainder.
    if (!symbol || row.country !== 'US' || !securityType || symbol === 'VGT'
      || /^(?:USD|CASH)$/.test(symbol) || /^(?:US DOLLAR|CASH)\b|\b(?:FUTURE|FUTURES|SWAP|SWAPS)\b/i.test(name)) continue;
    if (seen.has(symbol)) throw invalid();
    seen.add(symbol);
    if (row.percentOfFunds > 0) parsedHoldings.push({
      symbol, name, weightPct: row.percentOfFunds, exchange: 'US', securityType,
    });
  }
  const coverage = parsedHoldings.reduce((sum, row) => sum + row.weightPct, 0);
  if (!Number.isFinite(coverage) || coverage > 100.000001) throw invalid();
  return { holdings: parsedHoldings, asOfDate, reportedHoldingCount: statistics.CSTOCK, totalWeight };
}
