import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { marketTextClass } from '../src/lib/marketColorMode.js';

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
  assert.equal(html.includes('日线收盘 · 历史回放'), false);
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

test('monthly summary and linked return readings follow both market color preferences', () => {
  const value = { ...report, status: 'complete', cutoffDate: report.asOfDate,
    summary: { SPY: { monthlyChangePct: -1.25 }, QQQ: { monthlyChangePct: 2.5 } },
    rows: [{ ...report.rows[0], prices: { SPY: { cumulativeChangePct: -1.25 }, QQQ: { cumulativeChangePct: 2.5 } } }],
  };
  for (const marketColorMode of ['greenUpRedDown', 'redUpGreenDown']) {
    const html = render({ report: value, month: value.month, marketColorMode });
    for (const [number, label] of [[-1.25, '-1.25%'], [2.5, '+2.50%']]) {
      const expected = `<strong class="${marketTextClass(number, marketColorMode)}">${label}</strong>`;
      assert.equal(html.split(expected).length - 1, 2, 'both the summary and chart readout use the preference');
    }
  }
});

test('monthly zero returns and missing returns are never given an up or down color', () => {
  const value = { ...report, status: 'complete', cutoffDate: report.asOfDate,
    summary: { SPY: { monthlyChangePct: 0 }, QQQ: { monthlyChangePct: null } },
    rows: [{ ...report.rows[0], prices: { SPY: { cumulativeChangePct: 0 }, QQQ: { cumulativeChangePct: null } } }],
  };
  const html = render({ report: value, month: value.month, marketColorMode: 'redUpGreenDown' });
  assert.equal(html.split('<strong class="vmr-change-neutral">0.00%</strong>').length - 1, 2);
  assert.equal(html.split('<strong class="vmr-missing">—</strong>').length - 1, 2);
  assert.equal(html.includes('text-[#ff4b1f]'), false);
  assert.equal(html.includes('text-[#34d399]'), false);
});

test('VIX historical extremes keep their own red segments while the latest reading follows its own level', () => {
  const value = { ...report, status: 'complete', asOfDate: '2025-05-02', cutoffDate: '2025-05-02',
    rows: [report.rows[0], { ...report.rows[0], date: '2025-05-02', VIX: 34, VIX3M: 36,
      ratio: 34 / 36, currentRiskLevel: 'ELEVATED', inversionDays: 0 }],
    summary: { vixMax: { value: 34, date: '2025-05-02' } },
  };
  for (const marketColorMode of ['redUpGreenDown', 'greenUpRedDown']) {
    const html = render({ report: value, month: value.month, marketColorMode });
    const gradient = html.match(/<linearGradient[^>]*>[\s\S]*?<\/linearGradient>/)?.[0];
    assert.ok(gradient?.includes('<stop offset="0%" stop-color="#ff4d4f"'));
    assert.ok(gradient?.includes('<stop offset="50%" stop-color="#ff4d4f"'));
    assert.ok(gradient?.includes('<stop offset="50%" stop-color="#dba77b"'));
    assert.ok(gradient?.includes('<stop offset="100%" stop-color="#dba77b"'));
    assert.ok(html.includes('style="color:#dba77b">VIX<strong>34.00</strong>'), 'high VIX without EXTREME_STRESS is not recolored by an earlier extreme');
    assert.ok(html.includes('style="color:#8fa1b6">VIX3M<strong>36.00</strong>'));
    assert.ok(html.includes('--vmr-inversion-color:#ff4d4f'));
  }
});

test('VIX extreme readout and peak value use the homepage risk red', () => {
  const value = { ...report, asOfDate: '2025-05-01', cutoffDate: '2025-05-01',
    summary: { vixMax: { value: 31, date: '2025-05-01' } },
  };
  const html = render({ report: value, month: value.month });
  assert.ok(html.includes('style="color:#ff4d4f">VIX<strong>31.00</strong>'));
  assert.ok(html.includes('<strong style="color:#ff4d4f">31.00</strong>'));
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
