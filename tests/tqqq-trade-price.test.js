import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTqqqSuggestedPrice } from '../src/lib/tqqqTradePrice.js';

test('TQQQ quote suggestions truncate excess decimals and always show cents', () => {
  for (const [input, expected] of [
    [72.8877, '72.88'], ['72.8877', '72.88'],
    [72.88, '72.88'], [19.9, '19.90'], [1.13, '1.13'],
    [72, '72.00'], ['72.', '72.00'], ['00072.8800', '72.88'],
    [' +72.8877 ', '72.88'], ['.8899', '0.88'],
    [0.01, '0.01'], [0.019999, '0.01'],
  ]) {
    assert.equal(formatTqqqSuggestedPrice(input), expected, String(input));
  }
});

test('decimal string suggestions are truncated before binary number rounding', () => {
  assert.equal(formatTqqqSuggestedPrice('72.889999999999999999999'), '72.88');
  assert.equal(formatTqqqSuggestedPrice('0.099999999999999999999'), '0.09');
  assert.equal(formatTqqqSuggestedPrice('0.009999999999999999999'), '');
});

test('legal scientific notation uses the same decimal truncation', () => {
  for (const [input, expected] of [
    ['7.28877e1', '72.88'], ['728877E-4', '72.88'],
    ['+7.288e+1', '72.88'], ['1e2', '100.00'], ['1e-2', '0.01'],
    ['.1e1', '1.00'], ['000.728877e2', '72.88'],
    [1e21, `1${'0'.repeat(21)}.00`],
  ]) {
    assert.equal(formatTqqqSuggestedPrice(input), expected, String(input));
  }
});

test('unusable prices and positive prices below one cent stay empty', () => {
  for (const input of [
    undefined, null, true, false, [], [72.8877], {},
    '', ' ', 'NaN', NaN, 'Infinity', Infinity, -Infinity,
    0, -0, -1, '-72.88', '-0', '0.00',
    0.009, '0.0001', '1e-3', Number.MIN_VALUE, '1e-9999', '1e9999',
    '0x49', '0b100', '72,8877', '72.88USD', '72.88.77', '7e', '+', '.',
  ]) {
    assert.equal(formatTqqqSuggestedPrice(input), '', String(input));
  }
});
