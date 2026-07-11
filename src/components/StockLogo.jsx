import React from 'react';

function normalizeLogoUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return '';
  return raw;
}

export function stockLogoCandidates(symbol, cachedUrl) {
  const upper = String(symbol || '').trim().toUpperCase();
  const urls = [];
  const cached = normalizeLogoUrl(cachedUrl);
  if (cached) urls.push(cached);
  if (upper) {
    urls.push(`https://eodhd.com/img/logos/US/${upper}.png`);
    urls.push(`https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/${upper}.png`);
  }
  return [...new Set(urls)];
}

export default function StockLogo({ symbol, urls = [], onLogoLoad, className = '' }) {
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => setIndex(0), [symbol, urls.join('|')]);
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  const currentUrl = urls[index];
  const fallback = (
    <div className={`flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-[11px] font-normal text-white/55 ${className}`}>
      {normalizedSymbol.slice(0, 2) || '--'}
    </div>
  );
  if (!currentUrl) return fallback;
  return (
    <img
      src={currentUrl}
      alt=""
      className={`bg-black/20 object-contain ${className}`}
      onLoad={(event) => onLogoLoad?.(normalizedSymbol, event.currentTarget.currentSrc || event.currentTarget.src)}
      onError={() => setIndex((current) => current + 1)}
    />
  );
}
