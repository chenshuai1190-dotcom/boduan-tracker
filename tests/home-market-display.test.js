import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveHoldingDisplayPrice, resolveHomeMarketDisplayMetrics } from '../src/lib/homeMarketDisplay.js';

test('home watchlist and holdings use the official close after regular trading', () => {
  const metrics = resolveHomeMarketDisplayMetrics({
    price: 201.25,
    changePercent: 4.2,
    dailyPnlPrice: 195.55,
    dailyPnlChangePercent: 1.35,
    dailyPnlLocked: true,
    week52High: 210,
  });

  assert.equal(metrics.price, 195.55);
  assert.equal(metrics.changePercent, 1.35);
  assert.ok(Math.abs(metrics.highDrawdown - ((195.55 - 210) / 210)) < 1e-12);
  assert.equal(metrics.locked, true);
});

test('a locked row never falls back to an after-hours price when the close is unavailable', () => {
  const metrics = resolveHomeMarketDisplayMetrics({
    price: 201.25,
    changePercent: 4.2,
    dailyPnlLocked: true,
    week52High: 210,
  });

  assert.equal(metrics.price, null);
  assert.equal(metrics.changePercent, null);
  assert.equal(metrics.highDrawdown, null);
});

test('locked change falls back to the official close and daily baseline', () => {
  const metrics = resolveHomeMarketDisplayMetrics({
    price: 106,
    dailyPnlPrice: 105,
    dailyPnlBaselineClose: 100,
    dailyPnlLocked: true,
    week52High: 110,
  });

  assert.equal(metrics.changePercent, 5);
});

test('regular-session rows keep the live price and change', () => {
  const metrics = resolveHomeMarketDisplayMetrics({
    price: 201.25,
    changePercent: 4.2,
    dailyPnlPrice: 201.25,
    dailyPnlChangePercent: 4.2,
    dailyPnlLocked: false,
    week52High: 210,
  });

  assert.equal(metrics.price, 201.25);
  assert.equal(metrics.changePercent, 4.2);
  assert.equal(metrics.locked, false);
});

test('an unlocked row preserves the last valid price while a fresh tick is pending', () => {
  const metrics = resolveHomeMarketDisplayMetrics({
    price: 201.25,
    changePercent: 4.2,
    dailyPnlLocked: false,
    week52High: 210,
  });

  assert.equal(metrics.price, 201.25);
  assert.equal(metrics.changePercent, 4.2);
  assert.ok(Math.abs(metrics.highDrawdown - ((201.25 - 210) / 210)) < 1e-12);
});

test('an unlocked row without any valid price remains unavailable', () => {
  const metrics = resolveHomeMarketDisplayMetrics({
    price: 0,
    changePercent: 4.2,
    dailyPnlLocked: false,
    week52High: 210,
  });

  assert.equal(metrics.price, null);
  assert.equal(metrics.highDrawdown, null);
});

test('trade holding display uses the same official close as home after lock', () => {
  assert.equal(resolveHoldingDisplayPrice({
    currentPrice: 201.25,
    dailyPnlPrice: 198.5,
    dailyPnlLocked: true,
  }), 198.5);
  assert.equal(resolveHoldingDisplayPrice({
    currentPrice: 201.25,
    dailyPnlPrice: 198.5,
    dailyPnlLocked: false,
  }), 201.25);
});

test('trade holding display never exposes a delayed price while a locked close is unavailable', () => {
  assert.equal(resolveHoldingDisplayPrice({
    currentPrice: 201.25,
    dailyPnlPrice: 0,
    dailyPnlLocked: true,
  }), null);
});
