import React from 'react';

export { stockLogoCandidates } from '../lib/stockLogo.js';

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
      draggable={false}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={`bg-black/20 object-contain ${className}`}
      onLoad={(event) => onLogoLoad?.(normalizedSymbol, event.currentTarget.currentSrc || event.currentTarget.src)}
      onError={() => setIndex((current) => current + 1)}
    />
  );
}
