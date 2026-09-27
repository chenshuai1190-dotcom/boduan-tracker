import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

async function jsxModule(relativePath, rewrites = {}) {
  const path = fileURLToPath(new URL(relativePath, import.meta.url));
  let { code } = await transformWithOxc(readFileSync(path, 'utf8'), path, { jsx: { runtime: 'automatic' } });
  code = code.replace(/import\s+['"][^'"]+\.css['"];?/g, '');
  code = code.replace(/from\s+(['"])([^'"]+)\1/g, (_, quote, specifier) => {
    const target = rewrites[specifier] || (specifier.startsWith('.')
      ? pathToFileURL(resolve(dirname(path), specifier)).href : import.meta.resolve(specifier));
    return `from ${JSON.stringify(target)}`;
  });
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const viewModule = await jsxModule('../src/pages/VixMonthlyReportView.jsx');
const { default: View } = await import(viewModule);
const render = props => renderToStaticMarkup(React.createElement(View, props));
const report = {
  month: '2025-05', status: 'partial', asOfDate: '2025-05-01', cutoffDate: '2025-05-02',
  observedSessions: 1, expectedSessions: 2, summary: {},
  rows: [{ date: '2025-05-01', VIX: 31, VIX3M: 28, ratio: 31 / 28,
    inversionDays: 1, durationExact: { inversion: true }, prices: {}, ready: true,
    currentRiskLevel: 'EXTREME_STRESS', eventFlags: [] }],
};

test('production monthly view discloses incomplete coverage and retains the missing tail on its linked axis', () => {
  const html = render({ report, month: report.month, availableMonths: [{ month: report.month }], onShare() {} });
  assert.ok(html.includes('日线收盘 · 历史回放'));
  assert.equal(html.includes('本地设计预览'), false);
  assert.ok(html.includes('部分数据') && html.includes('缺失读数保留为空'));
  assert.ok(html.includes('待补齐至 2025-05-02'));
  assert.equal((html.match(/\/ 应有 2 日/g) || []).length, 2,
    'risk coverage uses the expected calendar, independently of missing benchmark observations');
  assert.ok(html.includes('05/02 收盘'), 'selected chart date must include the missing expected session');
  assert.ok(html.includes('连续数据中断'));
  assert.equal(html.includes('仍在持续'), false, 'missing month tail cannot imply an ongoing inversion');
  assert.equal(html.includes('0.00%'), false, 'missing summary values remain unavailable, never zero');
});

test('controlled month change never displays the previous month while its report is being built', () => {
  const html = render({ report, month: '2025-06', availableMonths: [{ month: '2025-05' }, { month: '2025-06' }], loading: true });
  assert.ok(html.includes('2025 年 6 月'));
  assert.ok(html.includes('正在读取月度历史数据'));
  assert.equal(html.includes('vmr-summary'), false);
  assert.equal(html.includes('31.00'), false);
});

test('DEV fixture wrapper uses the production view with an explicit preview label', async () => {
  const { default: Preview } = await import(await jsxModule('../src/dev/VixMonthlyReportPreview.jsx', {
    '../pages/VixMonthlyReportView.jsx': viewModule,
  }));
  const html = renderToStaticMarkup(React.createElement(Preview, { reports: [report], initialMonth: report.month }));
  assert.ok(html.includes('本地设计预览'));
  assert.ok(html.includes('data-vix-monthly-report-preview="true"'));
});

test('monthly container opens the latest month and reports retained-data refresh failure without making requests', async () => {
  const { default: Page } = await import(await jsxModule('../src/pages/VixMonthlyReportPage.jsx', {
    './VixMonthlyReportView.jsx': viewModule,
  }));
  const data = { expectedAsOfDate: '2025-06-02', stale: true,
    termStructure: { rows: [{ date: '2025-05-01', vix: 31, vix3m: 28, ratio: 31 / 28 }] },
    series: { SPY: { rows: [{ date: '2025-05-01', close: 500 }] }, QQQ: { rows: [{ date: '2025-05-01', close: 400 }] } } };
  const html = renderToStaticMarkup(React.createElement(Page, { data, expectedAsOfDate: data.expectedAsOfDate,
    error: new Error('refresh failed'), userId: 'test-owner' }));
  assert.ok(html.includes('2025 年 6 月'));
  assert.ok(html.includes('刷新失败，保留已读取的历史数据'));
  assert.equal(html.includes('本地设计预览'), false);
  for (const file of ['VixMonthlyReportPage.jsx', 'VixMonthlyReportView.jsx']) {
    const source = readFileSync(new URL(`../src/pages/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from ['"][^'"]*\/dev\//);
    assert.doesNotMatch(source, /\bfetch\s*\(|\bloadVixComparison\s*\(|\bdb\./);
  }
});
