function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegativeNumber(value, fallback = 0) {
  return Math.max(0, finiteNumber(value, fallback));
}

// The Home financing model first shipped in 49f1151. Rows last written by the
// retired Review financing tool are cleared once before they enter this model.
export const HOME_MARGIN_LOGIC_VERSION = 2;
export const HOME_MARGIN_LOGIC_STARTED_AT = '2026-07-21T20:35:57.000Z';

export const HOME_MARGIN_LEVERAGE_TIERS = Object.freeze([
  Object.freeze({ id: 'none', tone: 'neutral', leverageRange: '1.00×', financingShareRange: '0%' }),
  Object.freeze({ id: 'low', tone: 'low', leverageRange: '1.00–1.20×', financingShareRange: '0–16.7%' }),
  Object.freeze({ id: 'moderate', tone: 'moderate', leverageRange: '1.20–1.50×', financingShareRange: '16.7–33.3%' }),
  Object.freeze({ id: 'elevated', tone: 'elevated', leverageRange: '1.50–1.80×', financingShareRange: '33.3–44.4%' }),
  Object.freeze({ id: 'high', tone: 'high', leverageRange: '1.80–2.00×', financingShareRange: '44.4–50%' }),
  Object.freeze({ id: 'critical', tone: 'critical', leverageRange: '>2.00×', financingShareRange: '>50%' }),
]);

const HOME_MARGIN_LEVERAGE_TIER_BY_ID = new Map(HOME_MARGIN_LEVERAGE_TIERS.map((tier) => [tier.id, tier]));

export function homeMarginLogicUpdatedAt(now = Date.now()) {
  const numericNow = Number(now);
  const logicStartedAt = Date.parse(HOME_MARGIN_LOGIC_STARTED_AT);
  const safeNow = Number.isFinite(numericNow) ? numericNow : 0;
  return new Date(Math.max(safeNow, logicStartedAt + 1000)).toISOString();
}

export function isLegacyHomeMarginStatus(record) {
  if (!record || typeof record !== 'object') return false;
  const updatedAt = Date.parse(record.updated_at);
  const logicStartedAt = Date.parse(HOME_MARGIN_LOGIC_STARTED_AT);
  return !Number.isFinite(updatedAt) || updatedAt <= logicStartedAt;
}

export function normalizeMarginDebtUsd(value) {
  return nonNegativeNumber(value);
}

export function homeMarginLeverageTier(value) {
  const leverage = Number(value);
  if (!Number.isFinite(leverage) || leverage < 1) return null;
  if (leverage === 1) return HOME_MARGIN_LEVERAGE_TIER_BY_ID.get('none');
  if (leverage < 1.2) return HOME_MARGIN_LEVERAGE_TIER_BY_ID.get('low');
  if (leverage < 1.5) return HOME_MARGIN_LEVERAGE_TIER_BY_ID.get('moderate');
  if (leverage < 1.8) return HOME_MARGIN_LEVERAGE_TIER_BY_ID.get('elevated');
  if (leverage <= 2) return HOME_MARGIN_LEVERAGE_TIER_BY_ID.get('high');
  return HOME_MARGIN_LEVERAGE_TIER_BY_ID.get('critical');
}

export function homeMarginLeverageStatus(overview = {}) {
  const totalAssetsUsd = Number(overview?.totalAssetsUsd);
  const netAssetsUsd = Number(overview?.netAssetsUsd);
  const marginDebtUsd = Number(overview?.marginDebtUsd);
  if (Number.isFinite(marginDebtUsd) && marginDebtUsd > 0 && Number.isFinite(netAssetsUsd) && netAssetsUsd <= 0) {
    return Object.freeze({ id: 'insufficient', tone: 'critical' });
  }
  if (!Number.isFinite(totalAssetsUsd) || totalAssetsUsd <= 0) return null;
  return homeMarginLeverageTier(overview?.leverage);
}

export function normalizeMarginScenarioPct(value) {
  const normalized = Math.min(100, Math.max(-100, finiteNumber(value)));
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function marginScenarioToTrackRatio(value) {
  const normalized = normalizeMarginScenarioPct(value);
  return (normalized + 100) / 200;
}

export function marginTrackRatioToScenario(value) {
  const ratio = Math.min(1, Math.max(0, finiteNumber(value, 0.5)));
  return (ratio - 0.5) * 200;
}

export function displayMarginDebtToUsd({ amount, currency = 'USD', usdRate = 1 } = {}) {
  if (amount === '' || amount === null || amount === undefined) return null;
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount < 0) return null;
  if (currency !== 'CNY') return numericAmount;

  const rate = Number(usdRate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return numericAmount / rate;
}

export function deriveHomeMarginOverview({ totalAssetsUsd = 0, marginDebtUsd = 0 } = {}) {
  const normalizedTotalAssetsUsd = nonNegativeNumber(totalAssetsUsd);
  const normalizedMarginDebtUsd = normalizeMarginDebtUsd(marginDebtUsd);
  const netAssetsUsd = normalizedTotalAssetsUsd - normalizedMarginDebtUsd;

  return {
    totalAssetsUsd: normalizedTotalAssetsUsd,
    marginDebtUsd: normalizedMarginDebtUsd,
    netAssetsUsd,
    leverage: netAssetsUsd > 0 ? normalizedTotalAssetsUsd / netAssetsUsd : null,
  };
}

export function deriveHomeMarginStress({
  totalAssetsUsd = 0,
  positionsMarketValueUsd,
  cashUsd = 0,
  marginDebtUsd = 0,
  scenarioPct,
  declinePct,
} = {}) {
  const overview = deriveHomeMarginOverview({ totalAssetsUsd, marginDebtUsd });
  const normalizedCashUsd = Math.min(overview.totalAssetsUsd, nonNegativeNumber(cashUsd));
  const fallbackStockExposureUsd = Math.max(0, overview.totalAssetsUsd - normalizedCashUsd);
  const normalizedPositionsMarketValueUsd = positionsMarketValueUsd === undefined
    ? fallbackStockExposureUsd
    : Math.min(overview.totalAssetsUsd, nonNegativeNumber(positionsMarketValueUsd));
  const hasSignedScenario = scenarioPct !== undefined && scenarioPct !== null && scenarioPct !== '';
  const requestedScenarioPct = hasSignedScenario
    ? finiteNumber(scenarioPct)
    : -Math.min(100, nonNegativeNumber(declinePct));
  const normalizedScenarioPct = normalizeMarginScenarioPct(requestedScenarioPct);
  const assetChangeUsd = normalizedPositionsMarketValueUsd * (normalizedScenarioPct / 100);
  const stressedTotalAssetsUsd = overview.totalAssetsUsd + assetChangeUsd;
  const stressedNetAssetsUsd = stressedTotalAssetsUsd - overview.marginDebtUsd;
  const totalAssetsChangePct = overview.totalAssetsUsd > 0 ? assetChangeUsd / overview.totalAssetsUsd : null;
  const netAssetsChangePct = overview.netAssetsUsd > 0 ? assetChangeUsd / overview.netAssetsUsd : null;
  const normalizedDeclinePct = Math.max(0, -normalizedScenarioPct);
  const assetLossUsd = Math.max(0, -assetChangeUsd);

  return {
    ...overview,
    cashUsd: normalizedCashUsd,
    positionsMarketValueUsd: normalizedPositionsMarketValueUsd,
    normalizedScenarioPct,
    assetChangeUsd,
    totalAssetsChangePct,
    netAssetsChangePct,
    // Compatibility aliases for the original decline-only caller contract.
    normalizedDeclinePct,
    assetLossUsd,
    stressedTotalAssetsUsd,
    stressedNetAssetsUsd,
    totalAssetsLossPct: overview.totalAssetsUsd > 0 ? assetLossUsd / overview.totalAssetsUsd : null,
    netAssetsLossPct: overview.netAssetsUsd > 0 ? assetLossUsd / overview.netAssetsUsd : null,
    stressedLeverage: stressedNetAssetsUsd > 0 ? stressedTotalAssetsUsd / stressedNetAssetsUsd : null,
  };
}
