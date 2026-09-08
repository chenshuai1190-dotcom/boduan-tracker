import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';

const chartSource = readFileSync(new URL('../src/components/InvestmentComparisonChart.jsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../src/pages/InvestmentComparisonPage.jsx', import.meta.url), 'utf8');
const transformed = await transformWithOxc(chartSource, 'InvestmentComparisonChart.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code.replace(/from (["'])react\1/g, `from ${JSON.stringify(import.meta.resolve('react'))}`);
const { investmentRank, investmentRankColor, investmentChangeColor, formatInvestmentAmount, formatInvestmentPercent } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('investment rank colors track current leadership independently of profit signs', () => {
  const symbols = ['QQQ', 'TQQQ'];
  const point = { values: { QQQ: 80, TQQQ: 60 } };
  assert.equal(investmentRank('QQQ', symbols, point), 'leading');
  assert.equal(investmentRank('TQQQ', symbols, point), 'trailing');
  assert.equal(investmentRankColor('leading'), '#ff655e');
  assert.equal(investmentRankColor('trailing'), '#4fd0a1');
  assert.equal(investmentChangeColor(-20), '#4fd0a1', 'a leading investment can still have a green negative profit');
  assert.equal(investmentChangeColor(20), '#ff655e');
  assert.equal(investmentRank('QQQ', symbols, { values: { QQQ: 100, TQQQ: 100 } }), 'tied');
  assert.equal(investmentRank('QQQ', symbols, { values: {} }), 'tied');
});

test('investment display formats money separately from percentage return in both languages', () => {
  assert.equal(formatInvestmentAmount(1000000), '$100.0万');
  assert.equal(formatInvestmentAmount(1000000, true), '$1.0M');
  assert.equal(formatInvestmentAmount(250000, false, { signed: true }), '+$25.0万');
  assert.equal(formatInvestmentAmount(-250000, true, { signed: true }), '−$250.0K');
  assert.equal(formatInvestmentAmount(0, true, { signed: true }), '$0');
  assert.equal(formatInvestmentAmount(1.25, true), '$1.25');
  assert.equal(formatInvestmentAmount(-0.45, true, { signed: true }), '−$0.45');
  assert.equal(formatInvestmentPercent(25), '+25.0%');
  assert.equal(formatInvestmentPercent(-0.001), '0.0%');
  assert.equal(formatInvestmentAmount(null), '—');
  assert.equal(formatInvestmentPercent(null), '—');
});

test('investment presentation uses real daily snapshots and keeps totals, profit labels and yearly rows distinct', () => {
  assert.ok(pageSource.includes('getInvestmentComparisonSnapshot(model, cursor)'));
  assert.ok(pageSource.includes('snapshot.point.values[symbol]'));
  assert.ok(pageSource.includes('snapshot.point.returns[symbol]') && pageSource.includes('累计收益率'));
  assert.ok(pageSource.includes('snapshot.annualRows'));
  assert.ok(pageSource.includes('row.firstYearPartial') && pageSource.includes('row.periodStartDate'));
  assert.ok(pageSource.includes('step="1"'), 'timeline must select actual daily indices');
  assert.ok(chartSource.includes('model.points.slice(0, snapshot.index + 1)'));
  assert.ok(chartSource.includes('currentPoint.profits[symbol]') && chartSource.includes('data-investment-profit-label'));
  assert.equal(/seededRandom|annualScenarios|geometric-between|interpolated/.test(chartSource + pageSource), false);
});

test('investment search and data loading retain authentication and isolated request boundaries', () => {
  assert.ok(pageSource.includes('loadInvestmentComparison') && pageSource.includes('searchInvestmentSymbols'));
  assert.ok(pageSource.includes('searchSource({ userId, query: normalizedQuery, force: attempt > 0, signal: controller.signal })'));
  assert.ok(pageSource.includes('loadState.key === requestKey ? loadState.data : null'));
  assert.ok(pageSource.includes('requestRef.current !== requestId') && pageSource.includes('controller.abort()'));
  assert.ok(pageSource.includes('import.meta.env.DEV && previewSource?.load'));
  assert.ok(pageSource.includes('role="dialog"') && pageSource.includes('aria-modal="true"'));
  assert.equal(/stock_trades|insertTrade|upsertSettings|service_role/.test(chartSource + pageSource), false);
  assert.ok(pageSource.includes('EODHD · 复权日线') && pageSource.includes('EODHD · Adjusted daily closes'));
  assert.ok(pageSource.includes('计算口径') && pageSource.includes('Calculation method'));
});
