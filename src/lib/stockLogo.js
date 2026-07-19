export function normalizeStockLogoUrl(value) {
  const rawValue = value && typeof value === 'object' ? value.url : value;
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/')) return `https://eodhd.com${raw}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return '';
}

export function stockLogoCandidates(symbol, ...explicitUrls) {
  const urls = explicitUrls.map(normalizeStockLogoUrl).filter(Boolean);
  const raw = String(symbol || '').trim();
  if (/^[A-Za-z0-9.-]+$/.test(raw)) {
    const upper = raw.toUpperCase();
    urls.push(`https://eodhd.com/img/logos/US/${upper}.png`);
    urls.push(`https://eodhd.com/img/logos/US/${raw.toLowerCase()}.png`);
    urls.push(`https://financialmodelingprep.com/image-stock/${upper}.png`);
    urls.push(`https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/${upper}.png`);
  }
  return [...new Set(urls)];
}
