const finite = value => typeof value === 'number' && Number.isFinite(value);

// Display conversion only: report returns, drawdowns, stored balances, and trade
// execution prices retain their original USD basis. No default FX is invented.
export function reviewDisplayCurrency({ displayCurrency = 'USD', usdCny = null, fxDate = '' } = {}) {
  const currency = displayCurrency === 'CNY' ? 'CNY' : 'USD';
  const converted = currency === 'CNY';
  const rate = converted ? finite(usdCny) && usdCny > 0 ? usdCny : null : 1;
  const date = typeof fxDate === 'string' && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(fxDate)
    && Number.isFinite(Date.parse(fxDate)) ? fxDate.slice(0, 10) : '';
  return { currency, converted, rate, available: rate !== null, date };
}

export function convertReviewMoney(value, options = {}) {
  const { rate } = reviewDisplayCurrency(options);
  if (!finite(value) || rate === null) return null;
  const result = value * rate;
  return Number.isFinite(result) ? result : null;
}

export function formatReviewMoney(value, options = {}) {
  const converted = convertReviewMoney(value, options);
  if (converted === null) return '—';
  const { currency } = reviewDisplayCurrency(options);
  const decimals = Number.isInteger(options.decimals) && options.decimals >= 0 && options.decimals <= 4 ? options.decimals : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    ...(options.signed ? { signDisplay: 'exceptZero' } : {}),
  }).format(converted);
}

export function reviewCurrencyNotice(options = {}, language = 'zh') {
  const info = reviewDisplayCurrency(options);
  if (!info.converted) return '';
  const en = String(language).toLowerCase().startsWith('en');
  if (!info.available) return en ? 'CNY conversion is unavailable until a verified exchange rate is available.' : '人民币汇率暂不可用，金额折算待更新。';
  const date = info.date ? en ? ` · Rate updated ${info.date}` : ` · 汇率更新于 ${info.date}` : '';
  return en
    ? `1 USD = ${info.rate.toFixed(4)} CNY${date}. Display conversion; returns remain on the USD report basis.`
    : `1 USD = ${info.rate.toFixed(4)} CNY${date}。金额按同一汇率折算，收益率沿用美元报表口径。`;
}
