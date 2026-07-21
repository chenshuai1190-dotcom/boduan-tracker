import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveHomeMarginOverview,
  deriveHomeMarginStress,
  displayMarginDebtToUsd,
  normalizeMarginDebtUsd,
} from '../src/lib/homeMarginRisk.js';

function assertClose(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

test('normalizes the persisted margin debt as a finite non-negative USD amount', () => {
  assert.equal(normalizeMarginDebtUsd(3_000_000), 3_000_000);
  assert.equal(normalizeMarginDebtUsd('416666.6666666667'), 416_666.6666666667);

  for (const invalid of [undefined, null, '', 'not-a-number', -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(normalizeMarginDebtUsd(invalid), 0);
  }
});

test('derives net assets and leverage without adding margin debt to total assets', () => {
  const overview = deriveHomeMarginOverview({
    totalAssetsUsd: 23_000_000,
    marginDebtUsd: 3_000_000,
  });

  assert.equal(overview.totalAssetsUsd, 23_000_000);
  assert.equal(overview.marginDebtUsd, 3_000_000);
  assert.equal(overview.netAssetsUsd, 20_000_000);
  assert.equal(overview.leverage, 1.15);
});

test('keeps an unlevered account at 1.00x and never emits invalid leverage', () => {
  const unlevered = deriveHomeMarginOverview({
    totalAssetsUsd: 23_000_000,
    marginDebtUsd: 0,
  });
  assert.equal(unlevered.netAssetsUsd, 23_000_000);
  assert.equal(unlevered.leverage, 1);

  const zeroEquity = deriveHomeMarginOverview({
    totalAssetsUsd: 3_000_000,
    marginDebtUsd: 3_000_000,
  });
  assert.equal(zeroEquity.netAssetsUsd, 0);
  assert.equal(zeroEquity.leverage, null);

  const negativeEquity = deriveHomeMarginOverview({
    totalAssetsUsd: 2_000_000,
    marginDebtUsd: 3_000_000,
  });
  assert.equal(negativeEquity.netAssetsUsd, -1_000_000);
  assert.equal(negativeEquity.leverage, null);
});

test('converts only the editable margin balance from display currency to canonical USD', () => {
  assert.equal(displayMarginDebtToUsd({ amount: 300_000, currency: 'USD', usdRate: 7.2 }), 300_000);
  assertClose(
    displayMarginDebtToUsd({ amount: 3_000_000, currency: 'CNY', usdRate: 7.2 }),
    416_666.6666666667,
  );
  assert.equal(displayMarginDebtToUsd({ amount: -1, currency: 'CNY', usdRate: 7.2 }), null);
  assert.equal(displayMarginDebtToUsd({ amount: 'bad', currency: 'USD', usdRate: 7.2 }), null);
});

test('supports a signed 10 percent decline and keeps the legacy declinePct input compatible', () => {
  const stress = deriveHomeMarginStress({
    totalAssetsUsd: 23_000_000,
    positionsMarketValueUsd: 23_000_000,
    cashUsd: 0,
    marginDebtUsd: 3_000_000,
    scenarioPct: -10,
  });

  assert.equal(stress.totalAssetsUsd, 23_000_000);
  assert.equal(stress.marginDebtUsd, 3_000_000);
  assert.equal(stress.netAssetsUsd, 20_000_000);
  assert.equal(stress.leverage, 1.15);
  assert.equal(stress.normalizedScenarioPct, -10);
  assert.equal(stress.stressedTotalAssetsUsd, 20_700_000);
  assert.equal(stress.stressedNetAssetsUsd, 17_700_000);
  assert.equal(stress.assetChangeUsd, -2_300_000);
  assert.equal(stress.totalAssetsChangePct, -0.1);
  assert.equal(stress.netAssetsChangePct, -0.115);
  assertClose(stress.stressedLeverage, 20_700_000 / 17_700_000);

  const legacyStress = deriveHomeMarginStress({
    totalAssetsUsd: 23_000_000,
    positionsMarketValueUsd: 23_000_000,
    cashUsd: 0,
    marginDebtUsd: 3_000_000,
    declinePct: 10,
  });

  assert.equal(legacyStress.normalizedScenarioPct, -10);
  assert.equal(legacyStress.assetChangeUsd, -2_300_000);
  assert.equal(legacyStress.stressedTotalAssetsUsd, stress.stressedTotalAssetsUsd);
  assert.equal(legacyStress.stressedNetAssetsUsd, stress.stressedNetAssetsUsd);
  assert.equal(legacyStress.normalizedDeclinePct, 10);
  assert.equal(legacyStress.assetLossUsd, 2_300_000);
  assert.equal(legacyStress.totalAssetsLossPct, 0.1);
  assert.equal(legacyStress.netAssetsLossPct, 0.115);
});

test('a positive stock scenario increases assets without changing cash', () => {
  const stress = deriveHomeMarginStress({
    totalAssetsUsd: 23_000_000,
    positionsMarketValueUsd: 20_000_000,
    cashUsd: 3_000_000,
    marginDebtUsd: 3_000_000,
    scenarioPct: 10,
  });

  assert.equal(stress.cashUsd, 3_000_000);
  assert.equal(stress.positionsMarketValueUsd, 20_000_000);
  assert.equal(stress.normalizedScenarioPct, 10);
  assert.equal(stress.assetChangeUsd, 2_000_000);
  assert.equal(stress.stressedTotalAssetsUsd, 25_000_000);
  assert.equal(stress.stressedNetAssetsUsd, 22_000_000);
  assertClose(stress.totalAssetsChangePct, 2_000_000 / 23_000_000);
  assert.equal(stress.netAssetsChangePct, 0.1);
  assertClose(stress.stressedLeverage, 25_000_000 / 22_000_000);
});

test('does not cap a positive stock scenario at 100 percent', () => {
  const stress = deriveHomeMarginStress({
    totalAssetsUsd: 23_000_000,
    positionsMarketValueUsd: 20_000_000,
    cashUsd: 3_000_000,
    marginDebtUsd: 3_000_000,
    scenarioPct: 250,
  });

  assert.equal(stress.normalizedScenarioPct, 250);
  assert.equal(stress.assetChangeUsd, 50_000_000);
  assert.equal(stress.stressedTotalAssetsUsd, 73_000_000);
  assert.equal(stress.stressedNetAssetsUsd, 70_000_000);
  assertClose(stress.totalAssetsChangePct, 50_000_000 / 23_000_000);
  assert.equal(stress.netAssetsChangePct, 2.5);
  assertClose(stress.stressedLeverage, 73_000_000 / 70_000_000);
});

test('floors stock scenarios at minus 100 percent and returns null leverage when net assets are non-positive', () => {
  const inputs = {
    totalAssetsUsd: 23_000_000,
    positionsMarketValueUsd: 20_000_000,
    cashUsd: 3_000_000,
    marginDebtUsd: 4_000_000,
  };
  const stress = deriveHomeMarginStress({ ...inputs, scenarioPct: -100 });
  const belowFloor = deriveHomeMarginStress({ ...inputs, scenarioPct: -250 });

  for (const result of [stress, belowFloor]) {
    assert.equal(result.normalizedScenarioPct, -100);
    assert.equal(result.assetChangeUsd, -20_000_000);
    assert.equal(result.stressedTotalAssetsUsd, 3_000_000);
    assert.equal(result.stressedNetAssetsUsd, -1_000_000);
    assertClose(result.totalAssetsChangePct, -20_000_000 / 23_000_000);
    assertClose(result.netAssetsChangePct, -20_000_000 / 19_000_000);
    assert.equal(result.stressedLeverage, null);
  }
});

test('normalizes invalid signed scenarios to zero without emitting non-finite results', () => {
  for (const invalid of [null, 'not-a-number', Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const stress = deriveHomeMarginStress({
      totalAssetsUsd: 23_000_000,
      positionsMarketValueUsd: 20_000_000,
      cashUsd: 3_000_000,
      marginDebtUsd: 3_000_000,
      scenarioPct: invalid,
    });

    assert.equal(stress.normalizedScenarioPct, 0);
    assert.equal(stress.assetChangeUsd, 0);
    assert.equal(stress.stressedTotalAssetsUsd, 23_000_000);
    assert.equal(stress.stressedNetAssetsUsd, 20_000_000);
    assert.equal(stress.totalAssetsChangePct, 0);
    assert.equal(stress.netAssetsChangePct, 0);
    assert.equal(stress.stressedLeverage, 1.15);
  }
});
