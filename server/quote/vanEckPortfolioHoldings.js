// The US SMH page links its complete Daily Holdings (%) table to this JSON
// endpoint. Weight is already in percent points, including its cash rows.
export const SMH_HOLDINGS_URL = 'https://www.vaneck.com/Main/HoldingsBlock/GetDataset/?blockId=144458&pageId=233107&ticker=SMH';

function invalid() {
  const error = new Error('VanEck holdings invalid');
  error.code = 'INVALID_DATA';
  throw error;
}

function holdingDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T00:00:00$/.test(value)) invalid();
  const date = value.slice(0, 10);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) invalid();
  return date;
}

function percent(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(value)) invalid();
  const result = Number(value);
  if (!Number.isFinite(result) || result > 100) invalid();
  return result;
}

function text(value) {
  if (typeof value !== 'string' || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) invalid();
  return value.trim();
}

export function parseVanEckPortfolioHoldings(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.Holdings)
    || payload.Holdings.length < 22 || payload.Holdings.length > 50) invalid();
  const asOfDate = holdingDate(payload.AsOfDate);
  const holdings = [];
  const seen = new Set();
  const orders = new Set();
  let totalWeight = 0;
  let residualCount = 0;
  let reportedHoldingCount = 0;
  for (const row of payload.Holdings) {
    // Ticker alone is insufficient: non-US SMH share classes have different
    // portfolios. This is the US page's dataset, with both fund identity fields
    // checked for every row and USD holdings from its US-listed index mandate.
    if (!row || row.Ticker !== 'SMH' || row.PortfolioTicker !== 'SMH'
      || row.LabelType !== 'Holdings' || row.LabelId !== 1
      || holdingDate(row.AsOfDate) !== asOfDate || holdingDate(row.DataDate) !== asOfDate
      || row.CurrencyCode !== 'USD' || !Number.isInteger(row.LabelOrder)
      || row.LabelOrder < 1 || row.LabelOrder > 10000 || orders.has(row.LabelOrder)) invalid();
    orders.add(row.LabelOrder);
    const weightPct = percent(row.Weight);
    totalWeight += weightPct;
    const symbol = text(row.Label);
    const name = text(row.HoldingName);
    const assetClass = text(row.AssetClass);
    if (row.LabelOrder === 10000) {
      // VanEck's final Other/Cash allocation is a residual, not another
      // security. Excluding this row matches the page's Total Holdings count.
      if (symbol !== '--' || name !== 'Other/Cash' || assetClass !== 'Cash') invalid();
      residualCount += 1;
      continue;
    }
    reportedHoldingCount += 1;
    if (row.LabelOrder === 9999) {
      if (symbol !== '-USD CASH-' || assetClass !== 'Cash Bal') invalid();
      continue;
    }
    const securityType = assetClass === 'Stock' ? 'stock' : assetClass === 'ADR' ? 'adr' : null;
    // Preserve unsupported instruments and unresolvable issuer labels in the
    // residual. Do not invent or rewrite tickers using names, FIGI or ISIN.
    if (!securityType || !/^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)?$/.test(symbol)
      || symbol.length > 15 || /\.(?:US|INDX|FOREX|CC|LSE|HK|TO)$/.test(symbol)) continue;
    if (!name || seen.has(symbol)) invalid();
    seen.add(symbol);
    if (weightPct > 0) holdings.push({ symbol, name, weightPct, exchange: 'US', securityType });
  }
  // This adapter supports the disclosed US-listed 25-security basket. Require
  // all 25 ranks: a preserved cash/footer cannot validate a truncated tail.
  // A changed fund structure needs verification before widening this contract.
  const rankedOrders = [...orders].filter(value => value < 9999).sort((a, b) => a - b);
  const equityWeight = holdings.reduce((sum, row) => sum + row.weightPct, 0);
  if (residualCount !== 1 || rankedOrders.length !== 25
    || rankedOrders.some((value, index) => value !== index + 1)
    || totalWeight < 95 || totalWeight > 100.5 || equityWeight > 100.000001) invalid();
  return { holdings, asOfDate, reportedHoldingCount, totalWeight };
}
