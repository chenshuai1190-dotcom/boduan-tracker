import {
  investmentPrincipalInput,
  investmentPrincipalUsd,
  resolveInvestmentDisplayRate,
} from './investmentComparisonCurrency.js';

// Only plan entry crosses into USD. Display switches never rewrite this result.
export function normalizeDcaPlanUsd(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null;
  const currency = plan.inputCurrency ?? 'USD';
  const rate = resolveInvestmentDisplayRate(currency, plan.inputRate);
  if (rate === null) return null;
  if (![plan.initial, plan.amount].every(value => Number.isFinite(value) && value >= 0)) return null;
  const initial = investmentPrincipalUsd(dcaAmountDraft(plan.initial, currency, rate));
  const amount = investmentPrincipalUsd(dcaAmountDraft(plan.amount, currency, rate));
  if (![initial, amount].every(Number.isFinite)) return null;
  return { ...plan, initial, amount, inputCurrency: 'USD', inputRate: 1 };
}

export function dcaAmountDraft(value, currency = 'USD', rate = 1) {
  return { text: String(value), currency, rate };
}

export function dcaAmountInput(draft, displayCurrency, usdRate) {
  if (!draft || typeof draft.text !== 'string') return '';
  const rate = resolveInvestmentDisplayRate(displayCurrency, usdRate);
  const inputRate = resolveInvestmentDisplayRate(draft.currency, draft.rate);
  // An unfinished same-currency edit can remain visible while its rate loads.
  if (draft.currency === displayCurrency && (rate === null || inputRate === null)) return draft.text;
  if (rate === null) return '';
  if (!Number.isFinite(investmentPrincipalUsd(draft))) {
    return draft.currency === displayCurrency ? draft.text : '';
  }
  return investmentPrincipalInput(draft, displayCurrency, usdRate);
}

export function createDcaMoneyFormatter(currency = 'USD', usdRate) {
  const displayCurrency = currency;
  const displayRate = resolveInvestmentDisplayRate(displayCurrency, usdRate);
  const symbol = displayCurrency === 'CNY' ? '¥' : '$';
  const convert = value => {
    if (!Number.isFinite(value) || displayRate === null) return null;
    const converted = value * displayRate;
    return Number.isFinite(converted) ? converted : null;
  };
  const decimal = (value, digits) => value.toLocaleString('en-US', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
  const money = value => {
    const converted = convert(value);
    return converted === null ? '—' : `${symbol}${decimal(converted, 0)}`;
  };
  const assetMoney = value => {
    const converted = convert(value);
    return converted === null ? '—' : `${symbol}${decimal(converted, 2)}`;
  };
  const headlineMoney = value => {
    const converted = convert(value);
    if (converted === null) return '—';
    if (Math.abs(converted) >= 100000000) return `${symbol}${(converted / 100000000).toFixed(2)}亿`;
    if (Math.abs(converted) >= 10000000) return `${symbol}${(converted / 10000).toFixed(2)}万`;
    return assetMoney(value);
  };
  const signed = value => {
    if (convert(value) === null) return '—';
    return `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}`;
  };
  const short = value => {
    const converted = convert(value);
    if (converted === null) return '—';
    if (Math.abs(converted) >= 100000000) return `${(converted / 100000000).toFixed(2)}亿`;
    if (Math.abs(converted) >= 10000) return `${(converted / 10000).toFixed(1)}万`;
    return Math.round(converted).toLocaleString('en-US');
  };
  return { displayCurrency, displayRate, money, assetMoney, headlineMoney, signed, short };
}
