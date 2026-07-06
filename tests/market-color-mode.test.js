import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MARKET_COLOR_MODES,
  marketHexColor,
  marketTextClass,
  normalizeMarketColorMode,
} from '../src/lib/marketColorMode.js';

test('market color mode defaults to green up and red down', () => {
  assert.equal(normalizeMarketColorMode(), MARKET_COLOR_MODES.GREEN_UP_RED_DOWN);
  assert.equal(marketTextClass(1, undefined), 'text-emerald-400');
  assert.equal(marketTextClass(-1, undefined), 'text-[#ff4b1f]');
  assert.equal(marketHexColor(1, undefined), '#22c55e');
  assert.equal(marketHexColor(-1, undefined), '#ff4b1f');
});

test('market color mode can switch to red up and green down', () => {
  const mode = MARKET_COLOR_MODES.RED_UP_GREEN_DOWN;
  assert.equal(normalizeMarketColorMode(mode), mode);
  assert.equal(marketTextClass(1, mode), 'text-[#ff4b1f]');
  assert.equal(marketTextClass(-1, mode), 'text-emerald-400');
  assert.equal(marketHexColor(1, mode), '#ff4b1f');
  assert.equal(marketHexColor(-1, mode), '#22c55e');
});
