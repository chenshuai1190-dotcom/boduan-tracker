import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assetCurrencyPrefix,
  convertAssetDisplayAmount,
} from '../src/lib/assetCurrencyDisplay.js';

test('canonical CNY amounts divide by CNY per USD without rounding', () => {
  assert.equal(convertAssetDisplayAmount(720, { currency: 'USD', usdRate: 7.2 }), 100);
  assert.equal(convertAssetDisplayAmount(12345.6789, { currency: 'USD', usdRate: 7.1234 }), 12345.6789 / 7.1234);
  assert.notEqual(convertAssetDisplayAmount(31, { currency: 'USD', usdRate: 0.3 }), 103.33);
});

test('CNY display preserves canonical amounts and does not need a USD rate', () => {
  for (const value of [0, -20.25, 12345.6789, Number.MAX_VALUE]) {
    assert.equal(convertAssetDisplayAmount(value), value);
    assert.equal(convertAssetDisplayAmount(value, { currency: 'CNY', usdRate: Number.NaN }), value);
  }
});

test('zero and negative observed balances remain legitimate values', () => {
  assert.equal(convertAssetDisplayAmount(0, { currency: 'USD', usdRate: 7.2 }), 0);
  assert.equal(convertAssetDisplayAmount(-720, { currency: 'USD', usdRate: 7.2 }), -100);
});

test('missing and malformed amounts never become zero', () => {
  for (const value of [null, undefined, '', '720', false, Number.NaN, Infinity, -Infinity]) {
    assert.equal(convertAssetDisplayAmount(value), null);
    assert.equal(convertAssetDisplayAmount(value, { currency: 'USD', usdRate: 7.2 }), null);
  }
});

test('USD display fails closed for invalid rates and overflow', () => {
  for (const usdRate of [undefined, null, '', '7.2', false, 0, -7.2, Number.NaN, Infinity, -Infinity]) {
    assert.equal(convertAssetDisplayAmount(720, { currency: 'USD', usdRate }), null);
    assert.equal(convertAssetDisplayAmount(0, { currency: 'USD', usdRate }), null);
  }
  assert.equal(convertAssetDisplayAmount(Number.MAX_VALUE, { currency: 'USD', usdRate: Number.MIN_VALUE }), null);
});

test('unsupported display currencies do not silently adopt another unit', () => {
  for (const currency of ['HKD', 'EUR', '', 'usd', null, false]) {
    assert.equal(convertAssetDisplayAmount(720, { currency, usdRate: 7.2 }), null);
    assert.equal(assetCurrencyPrefix(currency), null);
  }
  assert.equal(assetCurrencyPrefix(), '¥');
  assert.equal(assetCurrencyPrefix('CNY'), '¥');
  assert.equal(assetCurrencyPrefix('USD'), '$');
});

test('display conversion preserves percentage changes and never mutates canonical history', () => {
  const history = Object.freeze([1234567.89, 2345678.91, 2109876.54]);
  const original = [...history];
  const displayed = history.map(value => convertAssetDisplayAmount(value, { currency: 'USD', usdRate: 7.1234 }));

  for (let index = 1; index < history.length; index += 1) {
    const canonicalPercent = (history[index] - history[index - 1]) / history[index - 1] * 100;
    const displayPercent = (displayed[index] - displayed[index - 1]) / displayed[index - 1] * 100;
    assert.ok(Math.abs(canonicalPercent - displayPercent) < 1e-10);
  }
  assert.deepEqual(history, original);
  assert.notDeepEqual(displayed, original);
});
