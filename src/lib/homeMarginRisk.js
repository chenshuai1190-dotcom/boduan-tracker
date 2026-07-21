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
