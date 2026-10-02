/**
 * Converts a canonical CNY asset amount for display only.
 * usdRate is the current number of CNY per USD; no rounding is applied here.
 */
export function convertAssetDisplayAmount(value, { currency = 'CNY', usdRate } = {}) {
  if (!Number.isFinite(value)) return null;
  if (currency === 'CNY') return value;
  if (currency !== 'USD' || !Number.isFinite(usdRate) || usdRate <= 0) return null;

  const converted = value / usdRate;
  return Number.isFinite(converted) ? converted : null;
}

export function assetCurrencyPrefix(currency = 'CNY') {
  if (currency === 'USD') return '$';
  if (currency === 'CNY') return '¥';
  return null;
}
