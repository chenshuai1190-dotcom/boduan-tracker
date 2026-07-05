export function toFiniteAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function currencyPrefix(currency = 'USD') {
  if (currency === 'CNY') return '¥';
  if (currency === 'HKD') return 'HK$';
  return '$';
}

export function formatAmount(value, digits = 2) {
  return toFiniteAmount(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function splitCurrencyAmount(value, currency = 'USD', digits = 2) {
  const [main, rawDecimal = ''] = formatAmount(value, digits).split('.');
  const decimal = rawDecimal.padEnd(digits, '0');
  return {
    main: `${currencyPrefix(currency)}${main}`,
    decimal: digits > 0 ? `.${decimal}` : '',
  };
}
