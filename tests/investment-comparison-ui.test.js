import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';

const chartSource = readFileSync(new URL('../src/components/InvestmentComparisonChart.jsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../src/pages/InvestmentComparisonPage.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/components/InvestmentComparison.css', import.meta.url), 'utf8');
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

test('investment playback defaults to 0.2x and retains a slower 0.1x option without rounding the speed', () => {
  assert.ok(pageSource.includes('const [speed, setSpeed] = React.useState(0.2)'));
  assert.ok(pageSource.includes('[0.1, 0.2, 0.4, 0.6, 0.8, 1, 2, 4].map'));
  assert.ok(pageSource.includes('setSpeed(Number(event.target.value))'));
  assert.ok(pageSource.includes('PLAYBACK_DAYS_PER_SECOND * speed'));
  assert.ok(pageSource.includes('const wholeDays = Math.floor(accumulated)'), 'fractional speed must still advance through actual whole trading days');
});

test('year and principal controls share dimensions without changing their input semantics', () => {
  assert.match(cssSource, /\.ic-settings\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  const shared = cssSource.match(/\.ic-field input,\s*\.investment-comparison \.ic-field select\s*\{([^}]+)\}/);
  assert.ok(shared, 'year and principal must use the same sizing rule');
  for (const [property, value] of Object.entries({ height: '48px', 'min-height': '48px', 'line-height': '24px', padding: '11px 12px', margin: '0', 'flex-shrink': '0', appearance: 'none', '-webkit-appearance': 'none' })) {
    assert.match(shared[1], new RegExp(`(?:^|;)\\s*${property}:\\s*${value}\\s*(?:;|$)`));
  }
  const yearControl = pageSource.match(/<span className="ic-select-control">([\s\S]*?)<\/span>/);
  assert.ok(yearControl);
  assert.ok(yearControl[1].includes('<select value={startYear} onChange={event => setStartYear(Number(event.target.value))}'));
  assert.ok(yearControl[1].includes("aria-label={englishMode ? 'Starting year' : '起始年份'}"));
  assert.ok(yearControl[1].includes('years.map(year => <option key={year} value={year}>'));
  assert.match(yearControl[1], /<ChevronDown\b[^>]*aria-hidden="true"/);
  assert.match(cssSource, /\.ic-select-control\s*>\s*svg\s*\{[^}]*pointer-events:\s*none/);
  assert.ok(pageSource.includes('value={principalText} onChange={event => setPrincipalText(event.target.value)}'));
  assert.ok(pageSource.includes('type="number" inputMode="decimal" min="1" max="1000000000" step="any"'));
});
