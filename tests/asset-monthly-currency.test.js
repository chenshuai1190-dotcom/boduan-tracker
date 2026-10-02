import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { buildMonthlyAssetAccountReport } from '../src/lib/monthlyAssetCategoryReport.js';

const modules = new Map();
async function compileModule(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  const pending = (async () => {
    const source = readFileSync(url, 'utf8')
      .replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '')
      .replace(/^import\s+(\w+)\s+from\s+['"]([^'"]+\.(?:png|jpg|jpeg|svg|ico))['"];?\s*$/gm, (_, name, asset) => `const ${name} = ${JSON.stringify(new URL(asset, url).href)};`);
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
const { default: Trend } = await import(await compileModule(new URL('../src/components/MonthlyAssetTrendContent.jsx', import.meta.url)));
const { default: Report } = await import(await compileModule(new URL('../src/components/MonthlyAssetCategoryReport.jsx', import.meta.url)));
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const textOf = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const accounts = [
  { id: 'cash', owner: '我', name: 'CNY savings', type: '银行', currency: 'CNY' },
  { id: 'usd', owner: '我', name: 'USD savings', type: '银行', currency: 'USD' },
  { id: 'closed', owner: '老婆', name: 'Closed account', type: '现金', currency: 'CNY' },
];
const snapshots = [
  ['cash', '2026-08', 70_000], ['cash', '2026-09', 140_000],
  ['usd', '2026-08', 10_000], ['usd', '2026-09', 10_000],
  ['closed', '2026-08', 35_000], ['closed', '2026-09', 0],
].map(([accountId, month, balance]) => ({ id: `${accountId}-${month}`, accountId, month, balance }));
const report = buildMonthlyAssetAccountReport({
  accounts, snapshots, month: '2026-09', toCNY: (amount, currency) => currency === 'USD' ? amount * 7 : amount,
});

for (const language of ['zh', 'en']) {
  test(`monthly trend displays supplied CNY/USD values once and preserves percentages (${language})`, () => {
    const common = { language, months: ['2026-08', '2026-09'], currentMonth: '2026-09',
      comparisonStartMonth: '2026-07' };
    const cny = textOf(render(Trend, { ...common, values: [700_000, 840_000], comparisonStartValue: 560_000 }));
    const usd = textOf(render(Trend, { ...common, currency: 'USD', values: [100_000, 120_000], comparisonStartValue: 80_000 }));
    assert.match(cny, language === 'zh' ? /¥84\.0/ : /¥840\.0/);
    assert.match(usd, language === 'zh' ? /\$12\.0/ : /\$120\.0/);
    assert.doesNotMatch(usd, /¥/);
    assert.match(cny, /\+20\.0%/);
    assert.match(usd, /\+20\.0%/);
    assert.match(cny, /\+50\.0%/);
    assert.match(usd, /\+50\.0%/);
    assert.match(cny, /CNY/);
    assert.match(usd, /USD/);
    assert.match(usd, language === 'zh' ? /当前汇率/ : /current exchange rates/);
  });

  test(`monthly account report converts every amount while preserving source labels and changes (${language})`, () => {
    const original = structuredClone(report);
    const cnyHtml = render(Report, { language, report });
    const usdHtml = render(Report, { language, report, currency: 'USD', usdRate: 7 });
    const cny = textOf(cnyHtml);
    const usd = textOf(usdHtml);
    assert.match(cny, language === 'zh' ? /¥21\.0万/ : /¥210\.0K/);
    assert.match(usd, language === 'zh' ? /\$3\.0万/ : /\$30\.0K/);
    assert.match(usd, language === 'zh' ? /\+\$1\.0万/ : /\+\$10\.0K/);
    assert.match(usd, language === 'zh' ? /-\$0\.5万/ : /-\$5\.0K/);
    assert.match(cny, /\+20\.0%/);
    assert.match(usd, /\+20\.0%/);
    assert.match(usd, /-100\.0%/);
    assert.match(usd, /CNY savings/);
    assert.match(usd, /USD savings/);
    assert.match(usd, /· CNY/);
    assert.match(usd, /· USD/);
    assert.doesNotMatch(usd, /¥/);
    assert.match(usd, language === 'zh' ? /当前汇率折算为美元（USD）/ : /shown in USD, converted using current exchange rates/);
    assert.deepEqual([...usdHtml.matchAll(/width:([^;"]+)%/g)].map(match => match[1]),
      [...cnyHtml.matchAll(/width:([^;"]+)%/g)].map(match => match[1]), 'contribution bar proportions remain unchanged');
    assert.deepEqual(report, original, 'rendering must preserve the raw CNY report and original account currencies');
  });
}

test('missing FX never renders unconverted CNY or zero as a USD amount in monthly account details', () => {
  for (const usdRate of [undefined, null, 0, -1, Number.NaN, Infinity]) {
    const html = render(Report, { report, currency: 'USD', usdRate });
    const text = textOf(html);
    assert.doesNotMatch(text, /[$¥]/);
    assert.doesNotMatch(text, /NaN|Infinity/);
    assert.match(text, /--/);
    assert.match(text, /\+20\.0%/);
    assert.match(text, /已归零/);
    assert.match(text, /· CNY/);
    assert.match(text, /· USD/);
  }
});

test('unavailable converted trend amounts stay unavailable instead of showing zero', () => {
  const html = render(Trend, { currency: 'USD', months: ['2026-08', '2026-09'],
    values: [null, null], currentMonth: '2026-09', comparisonStartMonth: '2026-07', comparisonStartValue: null });
  const text = textOf(html);
  assert.match(text, /--/);
  assert.match(text, /无数据/);
  assert.doesNotMatch(text, /\$0|¥|NaN|Infinity/);
});
