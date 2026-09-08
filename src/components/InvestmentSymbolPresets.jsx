import React from 'react';

// Selection shortcuts only. The existing authenticated history API still verifies
// each instrument and supplies all prices after the user selects it.
export const INVESTMENT_SYMBOL_PRESETS = Object.freeze([
  { symbol: 'NVDA', name: 'NVIDIA Corporation', nameZh: '英伟达', type: 'Common Stock' },
  { symbol: 'AAPL', name: 'Apple Inc.', nameZh: '苹果', type: 'Common Stock' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', nameZh: '微软', type: 'Common Stock' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', nameZh: '谷歌', type: 'Common Stock' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', nameZh: '亚马逊', type: 'Common Stock' },
  { symbol: 'META', name: 'Meta Platforms Inc.', nameZh: 'Meta', type: 'Common Stock' },
  { symbol: 'TSLA', name: 'Tesla Inc.', nameZh: '特斯拉', type: 'Common Stock' },
  { symbol: 'AVGO', name: 'Broadcom Inc.', nameZh: '博通', type: 'Common Stock' },
]);

export default function InvestmentSymbolPresets({ side, instruments, englishMode = false, onSelect }) {
  return <div className="ic-preset-grid" role="group" aria-label={englishMode ? 'Magnificent Seven + AVGO quick picks' : '美股七姐妹 + AVGO 快捷选择'}>
    {INVESTMENT_SYMBOL_PRESETS.map(item => {
      const duplicate = item.symbol === instruments[1 - side].symbol;
      const current = item.symbol === instruments[side].symbol;
      const name = englishMode ? item.name : item.nameZh;
      const status = duplicate ? (englishMode ? 'Other side' : '已在对比') : current ? (englishMode ? 'Current' : '当前') : '';
      return <button key={item.symbol} type="button" className="ic-preset" disabled={duplicate} aria-current={current ? 'true' : undefined} aria-label={`${item.symbol} ${name}${status ? ` · ${status}` : ''}`} onClick={() => { if (!duplicate) onSelect(item); }}>
        <span className="ic-preset-title"><strong>{item.symbol}</strong>{status && <span>{status}</span>}</span>
        <small>{name}</small>
      </button>;
    })}
  </div>;
}
