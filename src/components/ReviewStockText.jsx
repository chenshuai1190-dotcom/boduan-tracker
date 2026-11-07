import React from 'react';
import { reviewStockTextParts } from '../lib/reviewStockMentions.js';
import './ReviewStockText.css';

/** Display-only cashtags: preserve the author's saved text and editing cursor. */
export default function ReviewStockText({ text, candidates = [], onSelectSymbol, language = 'zh' }) {
  const parts = React.useMemo(() => reviewStockTextParts(text, candidates), [text, candidates]);
  const english = language.startsWith('en');
  return <>{parts.map((part, index) => part.symbol
    ? <button key={index} type="button" className="rj-stock-tag" data-rj-interactive
      aria-label={english ? `All posts about ${part.symbol}` : `查看 ${part.symbol} 的所有博文`}
      onClick={event => { event.stopPropagation(); onSelectSymbol?.(part.symbol, event); }}>{part.text}</button>
    : <React.Fragment key={index}>{part.text}</React.Fragment>)}</>;
}
