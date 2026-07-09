function toFiniteAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function currencyPrefix(currency = 'USD') {
  if (currency === 'CNY') return '¥';
  if (currency === 'HKD') return 'HK$';
  return '$';
}

function formatAmount(value, digits = 2) {
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
