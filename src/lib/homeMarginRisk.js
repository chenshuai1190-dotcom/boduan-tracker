function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegativeNumber(value, fallback = 0) {
  return Math.max(0, finiteNumber(value, fallback));
}

export function normalizeMarginDebtUsd(value) {
  return nonNegativeNumber(value);
}

export function normalizeMarginScenarioPct(value) {
  const normalized = Math.max(-100, finiteNumber(value));
  return Object.is(normalized, -0) ? 0 : normalized;
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
