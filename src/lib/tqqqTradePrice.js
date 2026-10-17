// Only for quote-suggested prices in a new TQQQ trade. Preserve manually entered
// execution prices and existing ledger prices at their original precision.
export function formatTqqqSuggestedPrice(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return '';
  const input = String(value).trim();
  if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(input)) return '';
  const price = Number(input);
  if (!Number.isFinite(price) || price <= 0) return '';

  // Move the decimal point in text instead of multiplying floats: 72.88 must
  // not become 72.87, and a quoted 72.8877 deliberately truncates to 72.88.
  const [mantissa, exponent = '0'] = input.replace(/^\+/, '').toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const digits = `${whole}${fraction}`;
  const centsEnd = whole.length + Number(exponent) + 2;
  if (centsEnd <= 0) return '';
  const cents = digits.slice(0, centsEnd).padEnd(centsEnd, '0').replace(/^0+/, '');
  if (!cents) return '';
  const padded = cents.padStart(3, '0');
  return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
}
