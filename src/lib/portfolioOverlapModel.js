const WEIGHT_NOISE_PCT = 1e-6;
const INSTRUMENT_KINDS = new Set(['stock', 'plain_etf', 'leveraged_etf', 'unknown']);
const HOLDINGS_STATUSES = new Set(['available', 'partial', 'unavailable', 'not_applicable']);

function symbolOf(value) {
  const symbol = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z0-9][A-Z0-9.-]{0,31}$/.test(symbol)) throw new TypeError('A valid instrument symbol is required');
  return symbol;
}

function nameOf(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : fallback;
}

function finiteNonnegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function add(left, right) {
  const value = left + right;
  if (!Number.isFinite(value)) throw new RangeError('Portfolio amount exceeds the supported numeric range');
  return value;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function validTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && validDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

function sourceOf(value, kind, holdingsStatus) {
  const bases = kind === 'stock' ? ['instrument_identity']
    : kind === 'leveraged_etf' ? ['instrument_identity', 'daily_leverage_target']
      : kind === 'unknown' ? ['instrument_identity', 'daily_leverage_target', 'fund_holdings']
        : holdingsStatus === 'unavailable' ? ['instrument_identity', 'fund_holdings'] : ['fund_holdings'];
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.provider !== 'string' || !value.provider.trim()
    || !bases.includes(value.basis) || typeof value.url !== 'string') return null;
  try {
    const url = new URL(value.url);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return { provider: value.provider.trim().slice(0, 100), url: url.href, basis: value.basis };
  } catch { return null; }
}

function unavailableMetadata(symbol, name = symbol, reason = 'metadata_missing') {
  return {
    symbol, name, kind: 'unknown', holdingsStatus: 'unavailable', source: null,
    asOfDate: null, fetchedAt: null, stale: true, reason, coveragePct: null, holdings: [],
  };
}

// Metadata is supplied by the server's verified instrument/official-fund
// adapters. This pure client model checks its contract, never guesses a type
// from ticker/name, and never embeds fund weights or fetches disclosure data.
function metadataOf(raw, symbol) {
  const invalid = () => unavailableMetadata(symbol, nameOf(raw?.name, symbol), 'invalid_metadata');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || raw.symbol !== symbol || !INSTRUMENT_KINDS.has(raw.kind)
    || !HOLDINGS_STATUSES.has(raw.holdingsStatus)
    || typeof raw.name !== 'string' || !raw.name.trim()
    || !validTimestamp(raw.fetchedAt) || typeof raw.stale !== 'boolean'
    || (raw.reason !== null && typeof raw.reason !== 'string') || !Array.isArray(raw.holdings)
    || (raw.asOfDate !== null && !validDate(raw.asOfDate))) return invalid();
  if (raw.asOfDate !== null && raw.asOfDate > new Date(raw.fetchedAt).toISOString().slice(0, 10)) return invalid();
  const source = sourceOf(raw.source, raw.kind, raw.holdingsStatus);
  if (raw.kind !== 'unknown' && !source) return invalid();
  if (raw.coveragePct !== null && (!finiteNonnegative(raw.coveragePct) || raw.coveragePct > 100 + WEIGHT_NOISE_PCT)) return invalid();
  const metadata = {
    symbol, name: nameOf(raw.name, symbol), kind: raw.kind, holdingsStatus: raw.holdingsStatus,
    source, asOfDate: raw.asOfDate, fetchedAt: raw.fetchedAt,
    stale: raw.stale, reason: (raw.reason || '').slice(0, 300), coveragePct: raw.coveragePct, holdings: [],
  };
  if (raw.kind === 'unknown') {
    if (raw.holdingsStatus !== 'unavailable' || raw.holdings.length) return invalid();
    return metadata;
  }
  if (raw.kind === 'stock' || raw.kind === 'leveraged_etf') {
    // Classification must be verified even though these never use a fund basket.
    if (raw.holdingsStatus !== 'not_applicable' || raw.holdings.length) return invalid();
    return metadata;
  }
  if (raw.holdingsStatus === 'unavailable') {
    if (raw.holdings.length) return invalid();
    return metadata;
  }
  if (!['available', 'partial'].includes(raw.holdingsStatus) || !validDate(raw.asOfDate)
    || raw.holdings.length === 0 || !finiteNonnegative(raw.coveragePct)) return invalid();

  const bySymbol = new Map();
  let sumWeight = 0;
  for (const row of raw.holdings) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || typeof row.name !== 'string' || !row.name.trim()
      || row.exchange !== 'US' || !['stock', 'adr'].includes(row.securityType)
      || !finiteNonnegative(row.weightPct) || row.weightPct > 100) return invalid();
    let underlying;
    try { underlying = symbolOf(row.symbol); } catch { return invalid(); }
    if (underlying !== row.symbol || underlying === symbol) return invalid();
    sumWeight += row.weightPct;
    if (!Number.isFinite(sumWeight) || sumWeight > 100 + WEIGHT_NOISE_PCT) return invalid();
    if (bySymbol.has(underlying)) {
      const existing = bySymbol.get(underlying);
      if (existing.securityType !== row.securityType) return invalid();
      existing.weightPct += row.weightPct;
    } else {
      bySymbol.set(underlying, { symbol: underlying, name: nameOf(row.name, underlying), exchange: 'US', weightPct: row.weightPct, securityType: row.securityType });
    }
  }
  if (Math.abs(sumWeight - raw.coveragePct) > WEIGHT_NOISE_PCT) return invalid();
  return { ...metadata, holdings: [...bySymbol.values()] };
}

function metadataMap(instruments) {
  const rows = Array.isArray(instruments) ? instruments
    : instruments?.version === 1 && Array.isArray(instruments.instruments) ? instruments.instruments : [];
  const result = new Map();
  for (const raw of rows) {
    let symbol;
    try { symbol = symbolOf(raw?.symbol); } catch { continue; }
    result.set(symbol, result.has(symbol)
      ? unavailableMetadata(symbol, symbol, 'ambiguous_metadata')
      : metadataOf(raw, symbol));
  }
  return result;
}

/** Only current long positions; a missing quote is null, never cost or zero. */
export function holdingsFromPositions(positions) {
  if (!Array.isArray(positions)) throw new TypeError('positions must be an array');
  const holdings = [];
  for (const position of positions) {
    if (!position || typeof position !== 'object' || Array.isArray(position)
      || typeof position.heldShares !== 'number' || !Number.isFinite(position.heldShares)) {
      throw new TypeError('Each position must contain finite heldShares');
    }
    if (position.heldShares <= 0) continue;
    const symbol = symbolOf(position.symbol);
    const priced = typeof position.valuationPrice === 'number' && Number.isFinite(position.valuationPrice)
      && position.valuationPrice > 0 && finiteNonnegative(position.marketValue);
    holdings.push({ symbol, name: nameOf(position.name, symbol), amount: priced ? position.marketValue || 0 : null });
  }
  return holdings;
}

function descending(a, b) {
  return b.amount - a.amount || a.symbol.localeCompare(b.symbol, 'en');
}

/**
 * All percent fields use the total portfolio market value, including unknown
 * instruments and leveraged ETFs. If any valuation is missing, total and every
 * percentage are null; amount aggregates cover only fully valued positions.
 * Partial baskets remain partial. Leveraged ETFs are not look-through or 3x
 * positions. Companies are keyed by verified ticker, not inferred issuer name.
 */
export function buildPortfolioOverlapModel({ holdings, instruments } = {}) {
  if (!Array.isArray(holdings)) throw new TypeError('holdings must be an array');
  const metadata = metadataMap(instruments);
  const byPosition = new Map();
  for (const holding of holdings) {
    if (!holding || typeof holding !== 'object' || Array.isArray(holding)) throw new TypeError('Each holding must be a record');
    const symbol = symbolOf(holding.symbol);
    if (holding.amount !== null && !finiteNonnegative(holding.amount)) throw new TypeError('Holding amount must be finite non-negative or null');
    const previous = byPosition.get(symbol);
    const amount = holding.amount === null || previous?.amount === null ? null : add(previous?.amount ?? 0, holding.amount);
    byPosition.set(symbol, { symbol, name: previous?.name ?? nameOf(holding.name, symbol), amount });
  }
  const missingValuationSymbols = [...byPosition.values()].filter(position => position.amount === null).map(position => position.symbol);
  const valuationComplete = missingValuationSymbols.length === 0;
  const knownTotal = [...byPosition.values()].reduce((sum, position) => add(sum, position.amount ?? 0), 0);
  const total = valuationComplete ? knownTotal : null;
  const percent = amount => total === null || total === 0 ? null : Math.min(100, Math.max(0, amount / total * 100));
  const positions = [...byPosition.values()].map(position => {
    const item = metadata.get(position.symbol) ?? unavailableMetadata(position.symbol, position.name);
    return { ...position, name: item.kind === 'unknown' ? position.name : item.name, kind: item.kind, percent: position.amount === null ? null : percent(position.amount), metadata: item };
  });
  const byCompany = new Map();
  let unexpandedAmount = 0;
  let leveragedAmount = 0;
  const exposure = (symbol, name, amount, position, kind, weightPct) => {
    if (amount <= 0) return;
    const company = byCompany.get(symbol) ?? { symbol, name, amount: 0, percent: null, directAmount: 0, indirectAmount: 0, sources: [] };
    if (kind === 'direct') company.name = name;
    company.amount = add(company.amount, amount);
    const field = kind === 'direct' ? 'directAmount' : 'indirectAmount';
    company[field] = add(company[field], amount);
    company.sources.push({
      symbol: position.symbol, amount, percent: percent(amount), kind, weightPct,
      asOfDate: position.metadata.asOfDate, source: position.metadata.source ? { ...position.metadata.source } : null,
    });
    byCompany.set(symbol, company);
  };
  for (const position of positions) {
    if (position.amount === null) continue;
    if (position.kind === 'leveraged_etf') leveragedAmount = add(leveragedAmount, position.amount);
    else if (position.kind === 'stock') exposure(position.symbol, position.name, position.amount, position, 'direct', 100);
    else if (position.kind === 'plain_etf' && ['available', 'partial'].includes(position.metadata.holdingsStatus)) {
      let expanded = 0;
      for (const row of position.metadata.holdings) {
        const amount = position.amount * (row.weightPct / 100);
        expanded = add(expanded, amount);
        exposure(row.symbol, row.name, amount, position, 'etf', row.weightPct);
      }
      // Clamp only round-off residue; never renormalize disclosed weights.
      unexpandedAmount = add(unexpandedAmount, Math.max(0, position.amount - expanded));
    } else unexpandedAmount = add(unexpandedAmount, position.amount);
  }
  const companies = [...byCompany.values()].sort(descending).map(company => ({ ...company, percent: percent(company.amount), sources: company.sources.sort(descending) }));
  const identifiedAmount = companies.reduce((sum, company) => add(sum, company.amount), 0);
  const topFiveAmount = companies.slice(0, 5).reduce((sum, company) => add(sum, company.amount), 0);
  return {
    total, companies, identifiedAmount, identifiedPercent: percent(identifiedAmount),
    unexpandedAmount, unexpandedPercent: percent(unexpandedAmount),
    leveragedAmount, leveragedPercent: percent(leveragedAmount),
    topFivePercent: percent(topFiveAmount),
    overlappingCompaniesCount: companies.filter(company => company.sources.length > 1).length,
    positions, missingValuationSymbols, valuationComplete,
  };
}
