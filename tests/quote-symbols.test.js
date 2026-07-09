import test from 'node:test';
import assert from 'node:assert/strict';

import { providerForSymbol, QUOTE_PROVIDER } from '../server/quote/providers.js';
import { parseSymbolsParam } from '../server/quote/symbols.js';

test('parseSymbolsParam normalizes known quote symbols', () => {
  const parsed = parseSymbolsParam('tqqq, qqq, ANALYST:nvda, VIX, FGI, INDICES');

  assert.deepEqual(parsed, {
    symbolList: [
      'TQQQ',
      'QQQ',
      'ANALYST:NVDA',
      'VIX',
      'FGI',
      'INDICES',
    ],
  });
});

test('parseSymbolsParam rejects invalid symbols before provider calls', () => {
  const parsed = parseSymbolsParam('QQQ, DROP TABLE');

  assert.match(parsed.error, /股票代码不合法/);
});

test('parseSymbolsParam rejects legacy calendar virtual symbols', () => {
  const parsed = parseSymbolsParam('CALENDAR:NVDA');

  assert.match(parsed.error, /股票代码不合法/);
});

test('parseSymbolsParam caps request fanout', () => {
  const symbols = Array.from({ length: 31 }, (_, idx) => `A${idx}`).join(',');
  const parsed = parseSymbolsParam(symbols);

  assert.match(parsed.error, /单次最多请求 30 个 symbols/);
});

test('providerForSymbol routes special providers explicitly', () => {
  assert.equal(providerForSymbol('VIX'), QUOTE_PROVIDER.VIX);
  assert.equal(providerForSymbol('FGI'), QUOTE_PROVIDER.FGI);
  assert.equal(providerForSymbol('INDICES'), QUOTE_PROVIDER.INDICES);
  assert.equal(providerForSymbol('TRANSLATE:SGVsbG8='), QUOTE_PROVIDER.TRANSLATE);
  assert.equal(providerForSymbol('ANALYST:NVDA'), QUOTE_PROVIDER.ANALYST);
  assert.equal(providerForSymbol('QQQ'), QUOTE_PROVIDER.STOCK);
});
