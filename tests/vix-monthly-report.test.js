import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVixMonthlyReport, listVixMonthlyReports } from '../src/lib/vixMonthlyReport.js';
import { buildInversionAnnotations } from '../src/lib/vixMonthlyInversion.js';
import { isVixComparisonSession, nextVixComparisonSession } from '../src/lib/vixComparisonSession.js';
import { VIX_MONTHLY_PREVIEW_REPORTS } from '../src/dev/vixMonthlyPreviewData.js';

function sessionDates(start, end) {
  const dates = [];
  for (let date = isVixComparisonSession(start) ? start : nextVixComparisonSession(start); date <= end;
    date = nextVixComparisonSession(date)) dates.push(date);
  return dates;
}

function payload({ start = '2030-01-02', end = '2030-03-29', ratio = () => .95, vix = () => 18 } = {}) {
  const dates = sessionDates(start, end);
  const asOfDate = dates.at(-1);
  const termRows = dates.map((date, index) => ({ date, vix: vix(date, index), vix3m: vix(date, index) / ratio(date, index),
    ratio: vix(date, index) / (vix(date, index) / ratio(date, index)) }));
  return { source: 'CBOE_EODHD_EOD', asOfDate, expectedAsOfDate: asOfDate, stale: false,
    fetchedAt: `${asOfDate}T23:00:00.000Z`,
    termStructure: { source: 'CBOE', asOfDate, expectedAsOfDate: asOfDate, stale: false, rows: termRows },
    series: { VIX: { rows: termRows.map((row) => ({ date: row.date, close: row.vix })) },
      SPY: { rows: dates.map((date, index) => ({ date, close: 100 * 1.002 ** index })) },
      QQQ: { rows: dates.map((date, index) => ({ date, close: 200 * .998 ** index })) } },
  };
}

function trustedPayload() {
  const rows = VIX_MONTHLY_PREVIEW_REPORTS.filter((report) => report.month <= '2025-04').flatMap((report) => report.rows);
  const asOfDate = rows.at(-1).date;
  return { source: 'CBOE_EODHD_EOD', asOfDate, expectedAsOfDate: asOfDate, stale: false,
    termStructure: { source: 'CBOE', asOfDate, expectedAsOfDate: asOfDate, stale: false,
      rows: rows.map((row) => ({ date: row.date, vix: row.VIX, vix3m: row.VIX3M, ratio: row.ratio })) },
    series: { VIX: { rows: rows.map((row) => ({ date: row.date, close: row.VIX })) },
      ...Object.fromEntries(['SPY', 'QQQ'].map((symbol) => [symbol, {
        rows: rows.map((row) => ({ date: row.date, close: row.prices[symbol].adjustedClose })),
      }])) },
  };
}

function removeDate(data, date, symbols = ['VIX', 'SPY', 'QQQ'], term = true) {
  for (const symbol of symbols) data.series[symbol].rows = data.series[symbol].rows.filter((row) => row.date !== date);
  if (term) data.termStructure.rows = data.termStructure.rows.filter((row) => row.date !== date);
}

test('production replay matches every trusted April daily value, six dimensions and return', () => {
  const result = buildVixMonthlyReport(trustedPayload(), { month: '2025-04' });
  const trusted = VIX_MONTHLY_PREVIEW_REPORTS.find((report) => report.month === '2025-04');
  assert.deepEqual(result.summary, trusted.summary);
  assert.equal(result.status, 'complete');
  assert.equal(result.rows.length, 21);
  assert.equal(result.priorSession.date, '2025-03-31');
  for (let index = 0; index < result.rows.length; index += 1) {
    for (const key of ['date', 'VIX', 'VIX3M', 'ratio', 'currentRiskLevel', 'termStructure', 'riskDirection',
      'currentRiskDuration', 'inversionDays', 'highStressDays', 'extremeStressDays', 'durationExact',
      'durationTags', 'prices', 'eventFlags', 'ready']) {
      assert.deepEqual(result.rows[index][key], trusted.rows[index][key], `${result.rows[index].date} ${key}`);
    }
  }
});

test('month navigation is derived from payload dates and the expected completed session', () => {
  const data = payload();
  assert.deepEqual(listVixMonthlyReports(data).map((report) => report.month), ['2030-01', '2030-02', '2030-03']);
  assert.equal(listVixMonthlyReports(data, { expectedAsOfDate: '2030-04-02' }).at(-1).month, '2030-04');
  assert.equal(buildVixMonthlyReport(data, { month: '2030-04' }), null);
  assert.equal(buildVixMonthlyReport(data, { month: '2030-13' }), null);
  assert.equal(buildVixMonthlyReport(data, { month: '2029-12' }), null);
  assert.equal(buildVixMonthlyReport(data, { expectedAsOfDate: 'invalid' }), null);
  assert.deepEqual(listVixMonthlyReports({}), []);
});

test('monthly returns use exact previous-month close and equal compounded daily returns', () => {
  const data = payload();
  const result = buildVixMonthlyReport(data, { month: '2030-03' });
  assert.equal(result.summary.SPY.baselineDate, '2030-02-28');
  for (const symbol of ['SPY', 'QQQ']) {
    const compound = (result.rows.reduce((factor, row) => factor * (1 + row.prices[symbol].dailyChangePct / 100), 1) - 1) * 100;
    assert.ok(Math.abs(compound - result.summary[symbol].monthlyChangePct) < 1e-10);
    assert.equal(result.rows.at(-1).prices[symbol].cumulativeChangePct, result.summary[symbol].monthlyChangePct);
  }
  assert.ok(result.summary.SPY.monthlyChangePct > 0);
  assert.ok(result.summary.QQQ.monthlyChangePct < 0);
});

test('missing monthly baseline stays missing and cannot shift to the next available price', () => {
  const data = payload();
  removeDate(data, '2030-02-28', ['SPY'], false);
  const result = buildVixMonthlyReport(data, { month: '2030-03' });
  assert.equal(result.status, 'partial');
  assert.equal(result.summary.SPY.baselineDate, '2030-02-28');
  assert.equal(result.summary.SPY.baselineClose, null);
  assert.equal(result.summary.SPY.monthlyChangePct, null);
  assert.ok(result.rows.every((row) => row.prices.SPY.cumulativeChangePct === null));
  assert.equal(result.rows[0].prices.SPY.dailyChangePct, null);
  assert.notEqual(result.summary.QQQ.monthlyChangePct, null);
});

test('missing previous session cannot turn a multi-day move into a daily return', () => {
  const data = payload();
  removeDate(data, '2030-03-05', ['SPY'], false);
  const result = buildVixMonthlyReport(data, { month: '2030-03' });
  assert.equal(result.rows.find((row) => row.date === '2030-03-05').prices.SPY.adjustedClose, null);
  assert.equal(result.rows.find((row) => row.date === '2030-03-06').prices.SPY.dailyChangePct, null);
  assert.notEqual(result.rows.find((row) => row.date === '2030-03-07').prices.SPY.dailyChangePct, null);
  assert.equal(result.status, 'partial');
});

test('a stale provider fetch preserves a complete historical report', () => {
  const data = payload();
  data.stale = data.termStructure.stale = true;
  const stale = buildVixMonthlyReport(data, { month: '2030-02' });
  data.stale = data.termStructure.stale = false;
  assert.deepEqual(stale, buildVixMonthlyReport(data, { month: '2030-02' }));
  assert.equal(stale.status, 'complete');
});

test('missing tail remains a calendar placeholder with a separate expected cutoff', () => {
  const data = payload({ ratio: (date) => date >= '2030-03-01' ? 1.05 : .95 });
  const expected = data.expectedAsOfDate;
  removeDate(data, expected);
  const result = buildVixMonthlyReport(data, { month: '2030-03' });
  assert.equal(result.cutoffDate, expected);
  assert.equal(result.asOfDate, '2030-03-28');
  assert.equal(result.rows.at(-1).date, expected);
  assert.equal(result.rows.at(-1).VIX, null);
  assert.equal(result.rows.at(-1).currentRiskLevel, 'UNKNOWN');
  assert.equal(result.summary.SPY.monthlyChangePct, null);
  assert.equal(result.observedSessions, result.expectedSessions - 1);
  assert.equal(result.status, 'partial');
  const annotations = buildInversionAnnotations(result);
  assert.equal(annotations.current, null);
  assert.equal(annotations.primarySegment.status, 'interrupted');
  assert.equal(annotations.normalizations.length, 0);
});

test('missing historical session is distinct from an official closure and interrupts continuity', () => {
  const data = trustedPayload();
  removeDate(data, '2025-04-08');
  const result = buildVixMonthlyReport(data, { month: '2025-04' });
  assert.equal(result.rows.length, 21);
  assert.ok(!result.rows.some((row) => row.date === '2025-04-18'));
  const missing = result.rows.find((row) => row.date === '2025-04-08');
  assert.equal(missing.ratio, null);
  assert.ok(missing.dataQuality.issues.some((issue) => issue.code === 'provider_missing' && issue.dates.includes(missing.date)));
  assert.equal(result.summary.inversionDays, null);
  assert.equal(result.summary.vixMax.value, null);
  assert.equal(result.rows.find((row) => row.date === '2025-04-09').inversionDays, 1);
  assert.equal(result.rows.find((row) => row.date === '2025-04-09').durationExact.inversion, false);
});

test('limited starting history retains numeric observations and marks unavailable dimensions', () => {
  const data = payload({ start: '2030-03-01', end: '2030-03-05', ratio: () => 1.1, vix: () => 35 });
  const result = buildVixMonthlyReport(data, { month: '2030-03' });
  assert.equal(result.status, 'partial');
  assert.equal(result.rows[0].VIX, 35);
  assert.equal(result.rows[0].currentRiskLevel, 'EXTREME_STRESS');
  assert.equal(result.rows[0].riskDirection, 'UNKNOWN');
  assert.equal(result.rows[0].ready, false);
  assert.equal(result.rows[0].durationExact.inversion, false);
  assert.equal(result.summary.SPY.monthlyChangePct, null);
});

test('cross-month inversion duration survives selection of a single month', () => {
  const data = payload({ ratio: (date) => date >= '2030-02-25' ? 1.05 : .95 });
  const result = buildVixMonthlyReport(data, { month: '2030-03', expectedAsOfDate: '2030-03-05' });
  const precedingDays = sessionDates('2030-02-25', '2030-02-28').length;
  assert.equal(result.priorSession.inversionDays, precedingDays);
  assert.equal(result.rows[0].inversionDays, precedingDays + 1);
  const current = buildInversionAnnotations(result).current;
  assert.equal(current.days, precedingDays + result.rows.length);
  assert.equal(current.carriedIn, true);
  assert.equal(current.exact, true);
});

test('point-in-time report equals a physical truncation and ignores poisoned future values', () => {
  const data = trustedPayload();
  const cutoff = '2025-04-08';
  const full = buildVixMonthlyReport(data, { month: '2025-04', expectedAsOfDate: cutoff });
  const prefix = structuredClone(data);
  prefix.termStructure.rows = prefix.termStructure.rows.filter((row) => row.date <= cutoff);
  for (const series of Object.values(prefix.series)) series.rows = series.rows.filter((row) => row.date <= cutoff);
  assert.deepEqual(full, buildVixMonthlyReport(prefix, { month: '2025-04', expectedAsOfDate: cutoff }));
  for (const row of data.termStructure.rows) if (row.date > cutoff) Object.assign(row, { vix: 999, vix3m: 1, ratio: 999 });
  for (const series of Object.values(data.series)) for (const row of series.rows) if (row.date > cutoff) row.close = 1e9;
  assert.deepEqual(full, buildVixMonthlyReport(data, { month: '2025-04', expectedAsOfDate: cutoff }));
  assert.equal(full.rows.at(-1).inversionDays, 5);
  assert.ok(full.rows.flatMap((row) => row.eventFlags).every((event) => event.date <= cutoff));
});

test('an unfinished month is explicitly in progress and never includes future expected sessions', () => {
  const result = buildVixMonthlyReport(payload(), { month: '2030-03', expectedAsOfDate: '2030-03-05' });
  assert.equal(result.status, 'in_progress');
  assert.equal(result.cutoffDate, '2030-03-05');
  assert.equal(result.rows.length, 3);
  assert.ok(result.rows.every((row) => row.date <= '2030-03-05'));
});

test('duplicate or invalid price observations are unavailable without changing source data', () => {
  const data = payload();
  data.series.SPY.rows.push({ date: '2030-03-05', close: 1 });
  data.series.QQQ.rows.find((row) => row.date === '2030-03-05').close = -1;
  const before = structuredClone(data);
  const result = buildVixMonthlyReport(data, { month: '2030-03' });
  const day = result.rows.find((row) => row.date === '2030-03-05');
  assert.equal(day.prices.SPY.adjustedClose, null);
  assert.equal(day.prices.QQQ.adjustedClose, null);
  assert.equal(result.status, 'partial');
  assert.deepEqual(data, before);
});

test('missing VIX3M preserves independent VIX and ETF charts without inventing risk values', () => {
  const data = payload();
  data.termStructure = { ...data.termStructure, rows: [], asOfDate: null, stale: true };
  const result = buildVixMonthlyReport(data, { month: '2030-03' });
  assert.equal(result.status, 'partial');
  assert.equal(result.observedSessions, 0);
  assert.ok(result.rows.every((row) => row.VIX === 18 && row.VIX3M === null && row.ratio === null));
  assert.ok(result.rows.every((row) => row.currentRiskLevel === 'UNKNOWN' && row.termStructure === 'UNKNOWN'));
  assert.ok(result.rows.every((row) => row.prices.SPY.adjustedClose > 0 && row.prices.QQQ.adjustedClose > 0));
  assert.equal(result.summary.vixMax.value, 18);
  assert.notEqual(result.summary.SPY.monthlyChangePct, null);
  assert.notEqual(result.summary.QQQ.monthlyChangePct, null);
  assert.equal(result.summary.inversionDays, null);
  assert.equal(result.summary.highStressDays, null);
});
