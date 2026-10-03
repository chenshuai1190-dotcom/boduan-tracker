// Display conversion only. Historical models and playback always retain USD.
export function resolveInvestmentDisplayRate(currency, usdRate) {
  if (currency === 'USD') return 1;
  return currency === 'CNY' && Number.isFinite(usdRate) && usdRate > 0 ? usdRate : null;
}

export function investmentPrincipalUsd({ text, currency, rate } = {}) {
  if (typeof text !== 'string' || !text.trim()) return NaN;
  const value = Number(text);
  const inputRate = resolveInvestmentDisplayRate(currency, rate);
  return Number.isFinite(value) && inputRate !== null ? value / inputRate : NaN;
}

export function investmentPrincipalInput(draft, currency, usdRate) {
  const rate = resolveInvestmentDisplayRate(currency, usdRate);
  if (rate === null) return '';
  // Preserve original typed precision, including unfinished/invalid edits.
  if (draft.currency === currency && draft.rate === rate) return draft.text;
  const principal = investmentPrincipalUsd(draft);
  if (!Number.isFinite(principal)) return draft.text;
  // Rounding is confined to the input display; never feed it back into USD.
  return (principal * rate).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 2 });
}
