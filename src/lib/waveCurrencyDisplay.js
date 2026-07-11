function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeDigits(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return 2;
  return Math.min(6, Math.max(0, numeric));
}

export function convertWaveUsdAmount(value, currency = 'USD', rate = 1) {
  const amount = toFiniteNumber(value);
  if (currency !== 'CNY') return amount;
  const normalizedRate = toFiniteNumber(rate);
  return amount * (normalizedRate > 0 ? normalizedRate : 1);
}

export function formatWaveCurrencyAmount(value, {
  currency = 'USD',
  rate = 1,
  digits = 2,
  signed = false,
} = {}) {
  const normalizedCurrency = currency === 'CNY' ? 'CNY' : 'USD';
  const converted = convertWaveUsdAmount(value, normalizedCurrency, rate);
  const fractionDigits = normalizeDigits(digits);
  const absolute = Math.abs(converted).toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  const sign = signed ? (converted >= 0 ? '+' : '-') : (converted < 0 ? '-' : '');
  return `${sign}${normalizedCurrency === 'CNY' ? '¥' : '$'}${absolute}`;
}

export function formatWaveUsdPrice(value, digits = 2) {
  return formatWaveCurrencyAmount(value, {
    currency: 'USD',
    rate: 1,
    digits,
  });
}
