// Selection shortcuts only. The existing authenticated history API still verifies
// each instrument and supplies all prices after the user selects it.
export const INVESTMENT_SYMBOL_PRESETS = Object.freeze([
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', nameZh: '纳指 100', type: 'ETF' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', nameZh: '标普 500', type: 'ETF' },
  { symbol: 'TQQQ', name: 'ProShares UltraPro QQQ', nameZh: '三倍纳指', type: 'ETF' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', nameZh: '英伟达', type: 'Common Stock' },
  { symbol: 'AAPL', name: 'Apple Inc.', nameZh: '苹果', type: 'Common Stock' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', nameZh: '微软', type: 'Common Stock' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', nameZh: '谷歌', type: 'Common Stock' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', nameZh: '亚马逊', type: 'Common Stock' },
  { symbol: 'META', name: 'Meta Platforms Inc.', nameZh: 'Meta', type: 'Common Stock' },
  { symbol: 'TSLA', name: 'Tesla Inc.', nameZh: '特斯拉', type: 'Common Stock' },
  { symbol: 'AVGO', name: 'Broadcom Inc.', nameZh: '博通', type: 'Common Stock' },
  { symbol: 'VGT', name: 'Vanguard Information Technology ETF', nameZh: '科技 ETF', type: 'ETF' },
  { symbol: 'SMH', name: 'VanEck Semiconductor ETF', nameZh: 'SMH', type: 'ETF' },
].map(Object.freeze));
