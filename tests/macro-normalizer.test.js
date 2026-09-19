import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMacroHistory, normalizeMacroMetric, createMacroSnapshot } from '../src/macro/macroNormalizer.js';
import { validateMacroSnapshot, fetchMacroData } from '../src/macro/MacroDataService.js';

const now = '2026-09-18T13:00:00Z';
const series = (points, extra = {}) => ({ history: points.map(([date, value]) => ({ date, value })), source: 'FRED', ...extra });
test('normalizer rejects missing, conflicting, future and invalid dates without creating observations', () => {
  assert.deepEqual(normalizeMacroHistory([
    { date: '2026-09-17', value: 0 }, { date: '2026-09-19', value: 99 },
    { date: '2026-09-16', value: null }, { date: '2026-09-15', value: NaN },
    { date: '2026-02-30', value: 9 }, { date: '2026-09-14', value: 1 }, { date: '2026-09-14', value: 2 },
  ], { to: now.slice(0, 10) }), [{ date: '2026-09-17', value: 0 }]);
});
test('real values preserve bp versus percent, actual observation intervals, zero and stale dates', () => {
  const rate = normalizeMacroMetric('us10y', series([['2026-09-16', 4.9], ['2026-09-17', 5]]), { now });
  assert.ok(Math.abs(rate.change1d - 10) < 1e-10);
  assert.equal(rate.change5d, null);
  assert.equal(rate.percentile20d, null);
  assert.equal(rate.freshness, 'fresh');
  const oil = normalizeMacroMetric('wti', series([['2026-09-16', 100], ['2026-09-17', 105]]), { now });
  assert.ok(Math.abs(oil.change1d - 5) < 1e-10);
  const rrp = normalizeMacroMetric('rrp', series([['2026-09-17', 0]]), { now });
  assert.equal(rrp.value, 0);
  assert.equal(rrp.freshness, 'fresh');
  assert.equal(normalizeMacroMetric('vix', series([['2026-08-01', 15]]), { now }).freshness, 'stale');
  assert.equal(normalizeMacroMetric('tga', series([['2026-09-09', 100]], { frequency: '周度' }), { now }).freshness, 'fresh');
});
test('net liquidity uses common dates and USD billions, not independently latest releases', () => {
  const snapshot = createMacroSnapshot({ now, series: {
    fedBalance: series([['2026-09-16', 6746.548]]), tga: series([['2026-09-16', 991.708]]),
    rrp: series([['2026-09-16', 5.375], ['2026-09-17', 0.276]]),
    us10y: series([['2026-09-16', 5.01], ['2026-09-17', 4.94]]), us2y: series([['2026-09-16', 4.74]]),
  } });
  assert.equal(snapshot.metrics.netLiquidity.asOf, '2026-09-16');
  assert.ok(Math.abs(snapshot.metrics.netLiquidity.value - 5749.465) < 1e-9);
  assert.ok(Math.abs(snapshot.metrics.spread10y2y.value - 27) < 1e-9);
  assert.equal(snapshot.metrics.spread10y2y.asOf, '2026-09-16');
  assert.equal(snapshot.metrics.netLiquidity.derived, true);
  assert.equal(Object.hasOwn(snapshot.metrics, 'rbob'), false, 'unsupported RBOB is removed from the live catalog');
  assert.equal(snapshot.growth.score, null, 'real readings must not inherit mock score 62');
  assert.equal(snapshot.regime.label, '待评估');
  assert.equal(snapshot.simulated, false);
  assert.equal(validateMacroSnapshot(snapshot), true);
});
test('20-observation percentile requires 20 actual observations and no interpolation', () => {
  const history = Array.from({ length: 20 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, value: i + 1 }));
  const result = normalizeMacroMetric('vix', { history }, { now });
  assert.equal(result.percentile20d, 100);
  assert.equal(result.change20d, null);
  assert.equal(result.history.length, 20);
});
test('client fails closed on mock, malformed and unauthenticated production responses', async () => {
  assert.equal(validateMacroSnapshot({ simulated: true }), false);
  const snapshot = createMacroSnapshot({ now });
  assert.equal(validateMacroSnapshot({ ...snapshot, groups: {} }), false);
  assert.equal(validateMacroSnapshot({ ...snapshot, availability: undefined }), false);
  assert.equal(validateMacroSnapshot({ ...snapshot, now: 'bad-date' }), false);
  const contaminated = createMacroSnapshot({ now, series: { us10y: { ...series([['2026-09-17', 4.31]]), simulated: true, source: '模拟数据' } } });
  assert.equal(contaminated.metrics.us10y.value, null);
  await assert.rejects(fetchMacroData({ fetchImpl: () => { throw Error('should not fetch'); } }), /登录/);
  await assert.rejects(fetchMacroData({ accessToken: 'test', fetchImpl: async () => ({ ok: true, json: async () => ({ success: true, data: { simulated: true } }) }) }), /格式/);
});
