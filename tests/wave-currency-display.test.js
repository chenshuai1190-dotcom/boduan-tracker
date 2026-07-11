import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  convertWaveUsdAmount,
  formatWaveCurrencyAmount,
  formatWaveUsdPrice,
} from '../src/lib/waveCurrencyDisplay.js';

test('wave currency display converts canonical USD values with the shared rate', () => {
  assert.equal(convertWaveUsdAmount(100, 'USD', 7.2), 100);
  assert.equal(convertWaveUsdAmount(100, 'CNY', 7.2), 720);
  assert.equal(formatWaveCurrencyAmount(100, { currency: 'USD', rate: 7.2 }), '$100.00');
  assert.equal(formatWaveCurrencyAmount(100, { currency: 'CNY', rate: 7.2 }), '¥720.00');
  assert.equal(formatWaveCurrencyAmount(120, { currency: 'USD', rate: 7.2 }), '$120.00');
  assert.equal(formatWaveCurrencyAmount(120, { currency: 'CNY', rate: 7.2 }), '¥864.00');
});

test('wave trade totals and profit signs stay correct in USD and CNY', () => {
  const usd = { currency: 'USD', rate: 7.2, digits: 0, signed: true };
  const cny = { currency: 'CNY', rate: 7.2, digits: 0, signed: true };

  assert.equal(formatWaveCurrencyAmount(-1000, usd), '-$1,000');
  assert.equal(formatWaveCurrencyAmount(-1000, cny), '-¥7,200');
  assert.equal(formatWaveCurrencyAmount(1200, usd), '+$1,200');
  assert.equal(formatWaveCurrencyAmount(1200, cny), '+¥8,640');
  assert.equal(formatWaveCurrencyAmount(200, usd), '+$200');
  assert.equal(formatWaveCurrencyAmount(200, cny), '+¥1,440');
  assert.equal(formatWaveCurrencyAmount(100, cny), '+¥720');
  assert.equal(formatWaveCurrencyAmount(-100, cny), '-¥720');
});

test('wave stock unit prices always remain USD quotes', () => {
  assert.equal(formatWaveUsdPrice(100), '$100.00');
  assert.equal(formatWaveUsdPrice(110), '$110.00');
  assert.equal(formatWaveUsdPrice(120, 3), '$120.000');
});

test('wave display formatter safely normalizes invalid options', () => {
  assert.equal(formatWaveCurrencyAmount('bad', { currency: 'CNY', rate: 7.2 }), '¥0.00');
  assert.equal(formatWaveCurrencyAmount(100, { currency: 'CNY', rate: 0 }), '¥100.00');
  assert.equal(formatWaveCurrencyAmount(100, { currency: 'EUR', rate: 7.2, digits: 20 }), '$100.000000');
});
