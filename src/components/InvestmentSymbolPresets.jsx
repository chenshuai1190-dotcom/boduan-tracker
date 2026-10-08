import React from 'react';

import { INVESTMENT_SYMBOL_PRESETS } from '../lib/investmentSymbolPresets.js';
export { INVESTMENT_SYMBOL_PRESETS } from '../lib/investmentSymbolPresets.js';

export default function InvestmentSymbolPresets({ selectedSymbol, comparisonSymbol = '', englishMode = false, onSelect }) {
  return <div className="ic-preset-grid" role="group" aria-label={englishMode ? 'Stock and ETF quick picks' : '股票与 ETF 快捷选择'}>
    {INVESTMENT_SYMBOL_PRESETS.map(item => {
      const duplicate = item.symbol === comparisonSymbol;
      const current = item.symbol === selectedSymbol;
      const name = englishMode ? item.name : item.nameZh;
      const status = duplicate ? (englishMode ? 'Other side' : '已在对比') : current ? (englishMode ? 'Current' : '当前') : '';
      return <button key={item.symbol} type="button" className="ic-preset" disabled={duplicate} aria-current={current ? 'true' : undefined} aria-label={`${item.symbol} ${name}${status ? ` · ${status}` : ''}`} onClick={() => { if (!duplicate) onSelect(item); }}>
        <span className="ic-preset-title"><strong>{item.symbol}</strong>{status && <span>{status}</span>}</span>
        <small>{name}</small>
      </button>;
    })}
  </div>;
}
