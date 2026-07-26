import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveMa200RetestDetail } from '../src/lib/ma200RetestDetail.js';

test('MA200 retest detail keeps lowest close separate from deepest distance to MA200', () => {
  const event = {
    detailSeries: [
      { date: '2022-03-31', close: 105, ma200: 100, relativeTradingDay: -5 },
      { date: '2022-04-07', close: 95, ma200: 100, relativeTradingDay: 0 },
      { date: '2022-04-08', close: 50, ma200: 100, relativeTradingDay: 1 },
      { date: '2022-04-11', close: 60, ma200: 90, relativeTradingDay: 2 },
      { date: '2022-07-06', close: 45, ma200: 80, relativeTradingDay: 60 },
    ],
  };

  const detail = deriveMa200RetestDetail(event, 60);

  assert.equal(detail.trigger.date, '2022-04-07');
  assert.equal(detail.lowestClose.date, '2022-07-06');
  assert.equal(detail.lowestClose.close, 45);
  assert.equal(detail.lowestClose.relativeTradingDay, 60);
  assert.ok(Math.abs(detail.lowestClose.fromTriggerPct - (-52.63157894736842)) < 1e-12);
  assert.equal(detail.deepestMa.date, '2022-04-08');
  assert.equal(detail.deepestMa.close, 50);
  assert.equal(detail.deepestMa.distancePct, -50);
  assert.equal(detail.endpoint.date, '2022-07-06');
  assert.ok(Math.abs(detail.endpoint.returnPct - (-52.63157894736842)) < 1e-12);
  assert.equal(detail.complete, true);
});

test('MA200 retest detail fails closed for a missing trigger and never invents session 60', () => {
  assert.equal(deriveMa200RetestDetail({
    detailSeries: [
      { date: '2022-04-08', close: 50, ma200: 100, relativeTradingDay: 1 },
    ],
  }, 60), null);

  const detail = deriveMa200RetestDetail({
    detailSeries: [
      { date: '2022-04-07', close: 95, ma200: 100, relativeTradingDay: 0 },
      { date: '2022-04-08', close: 92, ma200: 99, relativeTradingDay: 1 },
      { date: '2022-04-11', close: 90, ma200: 98, relativeTradingDay: 2 },
    ],
  }, 60);

  assert.equal(detail.complete, false);
  assert.equal(detail.endpoint, null);
  assert.equal(detail.asOfDate, '2022-04-11');
});
