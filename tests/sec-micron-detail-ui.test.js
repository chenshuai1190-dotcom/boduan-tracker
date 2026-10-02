import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { normalizeEarningsDetailPayload } from '../src/lib/earningsDetail.js';

const pageUrl = new URL('../src/pages/EarningsDetailPage.jsx', import.meta.url);
const modules = new Map();
async function compileModule(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  const pending = (async () => {
    let source = readFileSync(url, 'utf8').replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
    if (url.href === pageUrl.href) source += '\nexport { DetailSections, reportingPeriodText, periodLabel };';
    let { code } = await transformWithOxc(source, url.pathname, { jsx: { runtime: 'classic' } });
    for (const match of [...code.matchAll(/(from\s+)(['"])([^'"]+)\2/g)].reverse()) {
      const resolved = match[3].startsWith('.') ? new URL(match[3], url) : null;
      const target = resolved?.pathname.endsWith('.jsx') ? await compileModule(resolved)
        : resolved?.href || import.meta.resolve(match[3]);
      code = code.slice(0, match.index) + match[1] + JSON.stringify(target) + code.slice(match.index + match[0].length);
    }
    return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  })();
  modules.set(url.href, pending);
  return pending;
}
const { DetailSections, reportingPeriodText, periodLabel } = await import(await compileModule(pageUrl));

// Deliberately synthetic amounts exercise the contract without encoding an
// expected answer for a particular historical release.
function payload({ difference = 10_000_000, previousDifference = 2_000_000, comparable = true } = {}) {
  const items = [4_000_000_000, 3_000_000_000, 2_000_000_000, 1_000_000_000].map((revenue, index) => ({
    id: `segment-${index}`, label: `Segment ${index + 1}`, labelZh: `分部${index + 1}`,
    revenue, previousRevenue: comparable ? [3_000_000_000, 2_000_000_000, 1_000_000_000, 500_000_000][index] : null,
    profit: revenue / 5, previousProfit: null, profitMetric: 'operatingIncome',
  }));
  const reportedRevenueTotal = items.reduce((sum, item) => sum + item.revenue, 0);
  const previousReportedRevenueTotal = comparable ? items.reduce((sum, item) => sum + item.previousRevenue, 0) : null;
  const totalRevenue = reportedRevenueTotal + difference;
  const status = difference === 0 && (!comparable || previousDifference === 0) ? 'matched' : 'mismatch';
  return {
    success: true, symbol: 'MU', currency: 'USD', status: 'partial', totalRevenue,
    period: { start: '2026-05-29', end: '2026-09-03', fiscalDate: '2026-09-03', officialFiscalDate: '2026-09-03',
      providerFiscalDate: '2026-08-31', fiscalYear: '2026', fiscalPeriod: 'Q4', reportDate: '2026-09-23' },
    sections: { reportSegments: {
      status: status === 'mismatch' ? 'partial' : 'complete',
      reason: status === 'mismatch' ? 'reported-segment-total-mismatch' : null,
      items,
      revenueReconciliation: { status, totalRevenue, reportedRevenueTotal, difference,
        previousTotalRevenue: comparable ? previousReportedRevenueTotal + previousDifference : null,
        previousReportedRevenueTotal, previousDifference: comparable ? previousDifference : null, currency: 'USD' },
    } },
  };
}
const report = (detail) => detail.sections.reportSegments;
const reconciliation = (detail) => report(detail).revenueReconciliation;
const normalized = (value) => normalizeEarningsDetailPayload(value);
const render = (value, language = 'zh') => renderToStaticMarkup(React.createElement(DetailSections, {
  detail: normalized(value), event: { revenueActualUsd: 99_000_000_000 }, language, marketColorMode: 'redUpGreenDown',
}));

test('MU detail preserves verified reconciliation fields and the original four segment amounts', () => {
  const input = payload();
  const original = structuredClone(input);
  report(input).revenueReconciliation.unexpected = 'discard';
  const result = normalized(input);
  assert.deepEqual(reconciliation(result), reconciliation(original));
  assert.deepEqual(report(result).items.map(({ revenue, previousRevenue }) => ({ revenue, previousRevenue })),
    report(original).items.map(({ revenue, previousRevenue }) => ({ revenue, previousRevenue })));
  assert.equal(report(result).items.length, 4);
  assert.equal(report(result).status, 'partial');
  assert.equal(report(result).reason, 'reported-segment-total-mismatch');
  assert.deepEqual(normalized(result), result, 'cached normalization preserves the same evidence');
  assert.deepEqual(report(input).items, report(original).items, 'normalization does not repair the source amounts');
});

test('reconciliation rejects missing, nonnumeric or inconsistent evidence instead of treating it as zero', () => {
  const currentFields = ['totalRevenue', 'reportedRevenueTotal', 'difference'];
  for (const field of currentFields) {
    for (const invalid of [null, undefined, '', '0', 0 / 0, Infinity, false, true]) {
      const input = payload();
      reconciliation(input)[field] = invalid;
      assert.equal(reconciliation(normalized(input)), undefined, `${field}: ${String(invalid)}`);
    }
  }
  for (const mutate of [
    (input) => { reconciliation(input).difference *= -1; },
    (input) => { reconciliation(input).reportedRevenueTotal += 1; },
    (input) => { reconciliation(input).status = 'matched'; },
    (input) => { reconciliation(input).currency = 'CNY'; },
    (input) => { input.currency = 'CNY'; },
    (input) => { input.totalRevenue += 1; },
    (input) => { report(input).items[0].revenue = String(report(input).items[0].revenue); },
    (input) => { report(input).items[0].revenue = null; },
    (input) => { report(input).items[0].label = ''; report(input).items[0].labelZh = ''; },
  ]) {
    const input = payload(); mutate(input);
    assert.equal(reconciliation(normalized(input)), undefined);
  }
});

test('prior-year comparison is either complete and internally consistent or explicitly unavailable', () => {
  const unavailable = normalized(payload({ comparable: false }));
  assert.deepEqual([reconciliation(unavailable).previousTotalRevenue, reconciliation(unavailable).previousReportedRevenueTotal,
    reconciliation(unavailable).previousDifference], [null, null, null]);
  assert.ok(report(unavailable).items.every((item) => item.previousRevenue === null));
  for (const field of ['previousTotalRevenue', 'previousReportedRevenueTotal', 'previousDifference']) {
    for (const invalid of [null, undefined, '', '0', false, Infinity, NaN]) {
      const input = payload(); reconciliation(input)[field] = invalid;
      assert.equal(reconciliation(normalized(input)), undefined, field);
    }
  }
  const wrongDifference = payload(); reconciliation(wrongDifference).previousDifference *= -1;
  assert.equal(reconciliation(normalized(wrongDifference)), undefined);
  const wrongItem = payload(); report(wrongItem).items[0].previousRevenue += 1;
  assert.equal(reconciliation(normalized(wrongItem)), undefined);
  const falseUnavailable = payload({ comparable: false }); report(falseUnavailable).items[0].previousRevenue = 0;
  assert.equal(reconciliation(normalized(falseUnavailable)), undefined);
});

test('the report displays the exact direction of current and prior differences without inventing balancing rows', () => {
  const html = render(payload());
  assert.match(html, /本期分部收入合计与总营收相差1000万美元（分部合计较低），按官方披露保留原值。/);
  assert.match(html, /上年同期分部收入合计与总营收相差200万美元（分部合计较低），按官方披露保留原值。/);
  assert.equal((html.match(/<article\b/g) || []).length, 4);
  assert.doesNotMatch(html, /舍入|其他收入|rounding|Other revenue/);
  const negative = render(payload({ difference: -10_000_000, previousDifference: -2_000_000 }));
  assert.match(negative, /相差1000万美元（分部合计较高）/);
  assert.match(negative, /上年同期分部收入合计与总营收相差200万美元（分部合计较高）/);
  const english = render(payload({ difference: -10_000_000, previousDifference: 2_000_000 }), 'en');
  assert.match(english, /Current quarter: segment revenue is \$10\.0M above total revenue; official values are preserved\./);
  assert.match(english, /Prior-year quarter: segment revenue is \$2\.0M below total revenue; official values are preserved\./);
});

test('matched disclosures add no warning and unavailable comparatives do not become a zero difference', () => {
  const matched = payload({ difference: 0, previousDifference: 0 });
  assert.equal(reconciliation(normalized(matched)).status, 'matched');
  assert.doesNotMatch(render(matched), /data-earnings-revenue-reconciliation|按官方披露保留原值/);
  assert.doesNotMatch(render(payload({ comparable: false })), /上年同期分部收入合计|相差0/);
  const priorOnly = render(payload({ difference: 0 }));
  assert.match(priorOnly, /本期分部收入合计与总营收一致。/);
  assert.match(priorOnly, /上年同期分部收入合计与总营收相差200万美元/);
});

test('official period metadata replaces the provider month end in the existing title and period row', () => {
  const detail = normalized(payload());
  const event = { fiscalDate: '2026-08-31', providerFiscalDate: '2026-08-31' };
  assert.equal(periodLabel(event, detail, 'zh'), '2026 财年 Q4');
  assert.equal(reportingPeriodText(detail, event, 'zh'), '财报区间 2026.05.29—2026.09.03');
  const withoutFocus = { ...detail, period: { ...detail.period, start: '', fiscalYear: '', fiscalPeriod: '' } };
  assert.equal(periodLabel(event, withoutFocus, 'zh'), '截至 2026.09.03');
});
