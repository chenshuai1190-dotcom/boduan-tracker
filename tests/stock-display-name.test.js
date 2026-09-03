import assert from 'node:assert/strict';
import { test } from 'node:test';

import { POPULAR_US_STOCKS } from '../src/lib/popularStocks.js';
import { resolveStockDisplayName } from '../src/lib/stockDisplayName.js';

const STOCK_NAMES_CN = {
  KKR: 'KKR',
  NVDA: '英伟达',
  QQQ: 'QQQ',
  TQQQ: 'TQQQ',
};

const STOCK_NAMES_EN = {
  QQQ: 'Invesco QQQ',
  TQQQ: 'ProShares UltraPro QQQ',
};

function displayName(symbol, name, language = 'zh') {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase().replace(/\.US$/, '');
  return resolveStockDisplayName({
    symbol,
    name,
    english: language === 'en',
    chineseName: STOCK_NAMES_CN[normalizedSymbol],
    englishName: STOCK_NAMES_EN[normalizedSymbol],
  });
}

test('QQQ and TQQQ Chinese aliases resolve to their canonical ticker labels', () => {
  assert.equal(displayName('QQQ', '纳斯达克100 ETF'), 'QQQ');
  assert.equal(displayName('QQQ', '纳斯达克100'), 'QQQ');
  assert.equal(displayName('qqq.us', 'Invesco QQQ'), 'QQQ');
  assert.equal(displayName('TQQQ', '三倍做多纳指'), 'TQQQ');
  assert.equal(displayName('TQQQ', '3倍纳指'), 'TQQQ');
  assert.equal(displayName('tqqq.us', 'ProShares UltraPro QQQ'), 'TQQQ');
});

test('popular QQQ and TQQQ discovery labels cannot leak into holdings metadata', () => {
  const qqq = POPULAR_US_STOCKS.find((item) => item.symbol === 'QQQ');
  const tqqq = POPULAR_US_STOCKS.find((item) => item.symbol === 'TQQQ');
  assert.equal(displayName(qqq.symbol, qqq.name), 'QQQ');
  assert.equal(displayName(tqqq.symbol, tqqq.name), 'TQQQ');
});

test('the code-only rule does not override other Chinese names or English fund names', () => {
  assert.equal(displayName('NVDA', '英伟达'), '英伟达');
  assert.equal(displayName('KKR', '科尔伯格'), '科尔伯格');
  assert.equal(displayName('QQQ', '纳斯达克100 ETF', 'en'), 'Invesco QQQ');
  assert.equal(displayName('TQQQ', '三倍做多纳指', 'en'), 'ProShares UltraPro QQQ');
});
