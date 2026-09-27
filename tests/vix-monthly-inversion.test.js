import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInversionAnnotations, getInversionSegmentLabel, getInversionNormalizationLabel, normalizeVixMonthlyRows } from '../src/lib/vixMonthlyInversion.js';
import { VIX_MONTHLY_PREVIEW_REPORTS } from '../src/dev/vixMonthlyPreviewData.js';

const row = (date, ratio, inversionDays, exact) => ({ date, ratio, inversionDays,
  ...(exact === undefined ? {} : { durationExact: { inversion: exact } }) });
const report = (rows, options = {}) => ({ month: '2025-05', asOfDate: rows.at(-1)?.date, rows, ...options });
const april = VIX_MONTHLY_PREVIEW_REPORTS.find((item) => item.month === '2025-04');

test('April includes its full 16-session run and both real normalization events', () => {
  const result = buildInversionAnnotations(april);
  assert.deepEqual(result.segments, [{ startDate: '2025-04-02', endDate: '2025-04-24',
    startIndex: 1, endIndex: 16, days: 16, exact: true, carriedIn: false,
    status: 'normalized', normalizedDate: '2025-04-25' }]);
  assert.deepEqual(result.normalizations.map(({ date, index, days }) => ({ date, index, days })), [
    { date: '2025-04-01', index: 0, days: 1 }, { date: '2025-04-25', index: 17, days: 16 },
  ]);
  assert.equal(result.primarySegment, result.segments[0]);
  assert.equal(result.current, null);
  assert.equal(getInversionSegmentLabel(result.primarySegment), '连续倒挂 16 个交易日');
  assert.equal(getInversionNormalizationLabel(result.normalizations[1]), '4/25 倒挂解除');
});

test('monthly cumulative inversion sessions never replace each contiguous run', () => {
  const value = report([row('2025-05-01', .95), row('2025-05-02', 1.05), row('2025-05-05', 1.06),
    row('2025-05-06', .95), row('2025-05-07', 1.01), row('2025-05-08', .95)], { summary: { inversionDays: 3 } });
  const result = buildInversionAnnotations(value);
  assert.deepEqual(result.segments.map((item) => item.days), [2, 1]);
  assert.equal(result.primarySegment.days, 2);
  assert.deepEqual(result.normalizations.map((item) => item.days), [2, 1]);
});

test('a run continuing from the preceding month retains full historical duration', () => {
  const value = report([row('2025-05-01', 1.1, 5, true), row('2025-05-02', 1.05, 6, true), row('2025-05-05', .99, 0, true)],
    { priorSession: row('2025-04-30', 1.1, 4, true) });
  const result = buildInversionAnnotations(value);
  assert.equal(result.segments[0].days, 6);
  assert.equal(result.segments[0].startDate, '2025-05-01');
  assert.equal(result.segments[0].carriedIn, true);
  assert.equal(result.segments[0].exact, true);
  assert.equal(result.normalizations[0].days, 6);
  assert.equal(getInversionSegmentLabel(result.segments[0]), '连续倒挂 6 个交易日 · 承接上月');
});

test('month-first normalization uses the exact preceding session without a fake visible segment', () => {
  const result = buildInversionAnnotations(report([row('2025-05-01', .99, 0, true)],
    { priorSession: row('2025-04-30', 1.1, 4, true) }));
  assert.equal(result.segments.length, 0);
  assert.deepEqual(result.normalizations, [{ date: '2025-05-01', index: 0, previousDate: '2025-04-30',
    previousRatio: 1.1, ratio: .99, days: 4, exact: true, carriedIn: true }]);
});

test('an omitted provider session interrupts a run and cannot prove normalization', () => {
  const result = buildInversionAnnotations(report([row('2025-05-01', 1.05, 1, true), row('2025-05-05', .95)],
    { priorSession: row('2025-04-30', .95, 0, true) }));
  assert.equal(result.segments[0].status, 'interrupted');
  assert.equal(result.normalizations.length, 0);
  assert.equal(result.current, null);
});

test('placeholder gaps split shaded intervals and forbid inherited streak counts after the gap', () => {
  const result = buildInversionAnnotations(report([row('2025-05-01', 1.05, 1, true), row('2025-05-02', null),
    row('2025-05-05', 1.05, 3, true), row('2025-05-06', 1.04, 4, true)]));
  assert.deepEqual(result.segments.map(({ days, exact, status, startIndex }) => ({ days, exact, status, startIndex })), [
    { days: 1, exact: true, status: 'interrupted', startIndex: 0 },
    { days: 2, exact: false, status: 'ongoing', startIndex: 2 },
  ]);
  assert.equal(result.current, result.segments[1]);
  assert.equal(getInversionSegmentLabel(result.current), '已知倒挂至少 2 个交易日 · 仍在持续');
  assert.equal(result.normalizations.length, 0);
});

test('official special closure is skipped and original row indices are preserved', () => {
  const value = report([row('2025-01-02', .95), row('2025-01-03', .95), row('2025-01-06', 1.05),
    row('2025-01-07', 1.05), row('2025-01-08', 1.05), row('2025-01-09', null),
    row('2025-01-10', 1.05), row('2025-01-13', .95)], { month: '2025-01' });
  const result = buildInversionAnnotations(value);
  assert.equal(result.segments[0].days, 4);
  assert.equal(result.segments[0].status, 'normalized');
  assert.equal(result.segments[0].endIndex, 6);
  assert.equal(result.normalizations[0].index, 7);
});

test('insufficient history preserves lower-bound semantics and never claims an exact duration', () => {
  const result = buildInversionAnnotations(report([row('2025-05-01', 1.1, 20, false), row('2025-05-02', 1.08, 21, false)],
    { priorSession: row('2025-04-30', 1.1, 19, false) }));
  assert.equal(result.current.days, 21);
  assert.equal(result.current.exact, false);
  assert.equal(result.current.carriedIn, true);
  assert.equal(getInversionSegmentLabel(result.current, { includeStatus: false }), '已知倒挂至少 21 个交易日');
});

test('thresholds use raw ratio precision even when all three display as 1.000', () => {
  const result = buildInversionAnnotations(report([row('2025-05-01', .999999), row('2025-05-02', 1), row('2025-05-05', .999999)]));
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].days, 1);
  assert.equal(result.segments[0].startDate, '2025-05-02');
  assert.equal(result.normalizations[0].ratio, .999999);
});

test('every April prefix equals its physically truncated input and cannot see the future', () => {
  for (const today of april.rows) {
    const actual = buildInversionAnnotations(april, { throughDate: today.date });
    const prefix = { ...april, asOfDate: today.date, rows: april.rows.filter((item) => item.date <= today.date) };
    assert.deepEqual(actual, buildInversionAnnotations(prefix), today.date);
    assert.ok(actual.segments.every((item) => item.endDate <= today.date));
    assert.ok(actual.normalizations.every((item) => item.date <= today.date));
  }
  const onEighth = buildInversionAnnotations(april, { throughDate: '2025-04-08' });
  assert.equal(onEighth.current.days, 5);
  assert.equal(onEighth.current.status, 'ongoing');
  assert.equal(onEighth.current.normalizedDate, null);
});

test('asOfDate caps all future rows and invalid cutoffs fail closed', () => {
  const earlier = { ...april, asOfDate: '2025-04-08' };
  assert.deepEqual(buildInversionAnnotations(earlier, { throughDate: '2025-04-30' }),
    buildInversionAnnotations(april, { throughDate: '2025-04-08' }));
  assert.deepEqual(buildInversionAnnotations(april, { throughDate: '2025-03-30' }),
    { segments: [], normalizations: [], primarySegment: null, current: null });
  assert.equal(buildInversionAnnotations(april, { throughDate: 'invalid' }).segments.length, 0);
});

test('duplicate provider dates interrupt a run rather than count twice or emit a normalization', () => {
  const result = buildInversionAnnotations(report([row('2025-05-01', 1.05, 1, true),
    row('2025-05-02', 1.02), row('2025-05-02', .99), row('2025-05-05', .95)]));
  assert.equal(result.segments[0].days, 1);
  assert.equal(result.segments[0].status, 'interrupted');
  assert.equal(result.normalizations.length, 0);
});

test('a missing final expected session prevents a stale ongoing badge', () => {
  const result = buildInversionAnnotations(report([row('2025-05-01', .95), row('2025-05-02', 1.01)],
    { asOfDate: '2025-05-05' }));
  assert.equal(result.current, null);
  assert.equal(result.segments[0].status, 'interrupted');
  assert.match(getInversionSegmentLabel(result.segments[0]), /数据中断/);
});

test('unrelated SPY data issues do not hide valid term structure; invalid volatility does', () => {
  const base = report([row('2025-05-01', .95), row('2025-05-02', 1.01)]);
  base.rows[1].dataQuality = { issues: [{ code: 'provider_missing', dimension: 'SPY' }] };
  assert.equal(buildInversionAnnotations(base).current.days, 1);
  base.rows[1].dataQuality.issues.push({ code: 'invalid_data', dimension: 'volatility' });
  assert.equal(buildInversionAnnotations(base).segments.length, 0);
});

test('historical provider diagnostics do not erase a recovered current volatility series', () => {
  const withHistoricalIssue = structuredClone(april);
  for (const item of withHistoricalIssue.rows) item.dataQuality.issues.push({
    code: 'provider_missing', dimension: 'volatility', dates: ['2025-03-10'],
  });
  assert.deepEqual(buildInversionAnnotations(withHistoricalIssue, { throughDate: '2025-04-08' }),
    buildInversionAnnotations(april, { throughDate: '2025-04-08' }));
  const missingDay = withHistoricalIssue.rows.find((item) => item.date === '2025-04-07');
  missingDay.dataQuality.issues.push({ code: 'provider_missing', dimension: 'volatility', dates: [missingDay.date] });
  const result = buildInversionAnnotations(withHistoricalIssue, { throughDate: '2025-04-08' });
  assert.equal(result.segments[0].status, 'interrupted');
  assert.equal(result.current.days, 1);
  assert.equal(result.current.exact, false);
});

test('annotations do not mutate source rows, rolling events or summary counts', () => {
  const original = structuredClone(april);
  buildInversionAnnotations(april);
  assert.deepEqual(april, original);
  assert.equal(april.summary.inversionDays, 16);
  assert.equal(april.priorSession.date, '2025-03-31');
  assert.equal(april.rows[0].durationExact.inversion, true);
});

test('shared monthly calendar fills interior and trailing gaps up to cutoffDate, not the last observation', () => {
  const value = report([row('2025-05-01', .95), row('2025-05-05', 1.05, 3, true)],
    { asOfDate: '2025-05-05', cutoffDate: '2025-05-06', summary: { inversionDays: 1 } });
  const original = structuredClone(value);
  const rows = normalizeVixMonthlyRows(value);
  assert.deepEqual(rows.map(item => item.date), ['2025-05-01', '2025-05-02', '2025-05-05', '2025-05-06']);
  for (const index of [1, 3]) {
    assert.equal(rows[index].ratio, null);
    assert.equal(rows[index].VIX, null);
    assert.equal(rows[index].ready, false);
    assert.deepEqual(rows[index].prices, {});
  }
  const result = buildInversionAnnotations({ ...value, rows });
  assert.equal(result.current, null);
  assert.equal(result.segments[0].status, 'interrupted');
  assert.equal(result.segments[0].exact, false);
  assert.equal(result.normalizations.length, 0);
  assert.deepEqual(value, original);
});

test('calendar excludes other months, future rows and official closures while retaining valid original fields', () => {
  const eighth = { ...row('2025-01-08', 1.05, 1, true), prices: { SPY: { adjustedClose: 10 } } };
  const tenth = row('2025-01-10', 1.06, 2, true);
  const value = report([row('2024-12-31', 1.1), tenth, eighth, row('2025-01-09', 1.1), row('2025-01-13', .95)],
    { month: '2025-01', cutoffDate: '2025-01-10' });
  const rows = normalizeVixMonthlyRows(value);
  assert.deepEqual(rows.map(item => item.date), ['2025-01-02', '2025-01-03', '2025-01-06', '2025-01-07', '2025-01-08', '2025-01-10']);
  assert.equal(rows.at(-2), eighth);
  assert.equal(rows.at(-1), tenth);
  assert.equal(normalizeVixMonthlyRows(value, { throughDate: '2025-01-08' }).at(-1).date, '2025-01-08');
  assert.deepEqual(normalizeVixMonthlyRows(value, { throughDate: '2024-12-31' }), []);
});

test('calendar normalizer fails closed for invalid boundaries and duplicate provider dates', () => {
  const value = report([row('2025-05-01', 1.05), row('2025-05-02', 1.01), row('2025-05-02', .99)]);
  const rows = normalizeVixMonthlyRows(value);
  assert.equal(rows[1].ratio, null);
  assert.equal(rows[1].dataQuality.issues[0].code, 'duplicate_date');
  assert.equal(buildInversionAnnotations({ ...value, rows }).normalizations.length, 0);
  for (const invalid of [null, { ...value, month: '2025-13' }, { ...value, month: '0000-01' },
    { ...value, cutoffDate: '2025-02-30' }, { ...value, cutoffDate: undefined, asOfDate: null }]) {
    assert.deepEqual(normalizeVixMonthlyRows(invalid), []);
  }
  assert.deepEqual(normalizeVixMonthlyRows(value, { throughDate: '2025-5-2' }), []);
});

test('production cutoffDate permits only its known prefix and interrupts missing tails with or without normalization', () => {
  const value = report([row('2025-05-01', .95), row('2025-05-02', 1.05), row('2025-05-06', .95)],
    { asOfDate: '2025-05-02', cutoffDate: '2025-05-05' });
  for (const rows of [value.rows, normalizeVixMonthlyRows(value)]) {
    const result = buildInversionAnnotations({ ...value, rows });
    assert.equal(result.current, null);
    assert.equal(result.primarySegment.status, 'interrupted');
    assert.deepEqual(result.normalizations, []);
  }
  assert.equal(buildInversionAnnotations(value, { throughDate: '2025-05-02' }).current.days, 1);
  assert.deepEqual(buildInversionAnnotations({ ...value, cutoffDate: 'invalid' }).segments, []);
});

test('DEV annotations are direct aliases of the production implementation', async () => {
  const compatibility = await import('../src/dev/vixMonthlyInversion.js');
  assert.equal(compatibility.buildInversionAnnotations, buildInversionAnnotations);
  assert.equal(compatibility.normalizeVixMonthlyRows, normalizeVixMonthlyRows);
  assert.equal(compatibility.getInversionSegmentLabel, getInversionSegmentLabel);
  assert.equal(compatibility.getInversionNormalizationLabel, getInversionNormalizationLabel);
});
