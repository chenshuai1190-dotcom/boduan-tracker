import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';

const chartSource = readFileSync(new URL('../src/components/InvestmentComparisonChart.jsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../src/pages/InvestmentComparisonPage.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/components/InvestmentComparison.css', import.meta.url), 'utf8');
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
// Layout measurement runs only in a browser; SSR checks the rendered labels.
const ssrReactUrl = dataUrl(`import React from ${JSON.stringify(import.meta.resolve('react'))}; export default { ...React, useLayoutEffect: React.useEffect };`);
const transformed = await transformWithOxc(chartSource, 'InvestmentComparisonChart.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code.replace(/from (["'])react\1/g, `from ${JSON.stringify(ssrReactUrl)}`)
  .replace(/from (["'])\.\.\/lib\/marketColorMode\.js\1/g, `from ${JSON.stringify(new URL('../src/lib/marketColorMode.js', import.meta.url).href)}`);
const { default: InvestmentComparisonChart, investmentRank, investmentRankColor, investmentChangeColor, formatInvestmentAmount, formatInvestmentPercent } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('investment rank colors track current leadership independently of profit signs', () => {
  const symbols = ['QQQ', 'TQQQ'];
  const point = { values: { QQQ: 80, TQQQ: 60 } };
  assert.equal(investmentRank('QQQ', symbols, point), 'leading');
  assert.equal(investmentRank('TQQQ', symbols, point), 'trailing');
  assert.equal(investmentRankColor('leading'), '#ff4b1f');
  assert.equal(investmentRankColor('trailing'), '#34d399');
  assert.equal(investmentChangeColor(-20), '#34d399', 'a leading investment can still have a green negative profit');
  assert.equal(investmentChangeColor(20), '#ff4b1f');
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

test('investment amount conversion preserves signs, unit precision and optional currency symbols', () => {
  const cny = { displayCurrency: 'CNY', displayRate: 7.2 };
  assert.equal(formatInvestmentAmount(1000000, false, cny), '¥720.0万');
  assert.equal(formatInvestmentAmount(1000000, true, cny), '¥7.2M');
  assert.equal(formatInvestmentAmount(1000000, true, { ...cny, digits: 2 }), '¥7.20M');
  assert.equal(formatInvestmentAmount(250000, false, { ...cny, signed: true }), '+¥180.0万');
  assert.equal(formatInvestmentAmount(-250000, true, { ...cny, signed: true }), '−¥1.8M');
  assert.equal(formatInvestmentAmount(1000000, false, { ...cny, currency: false }), '720.0万');
  assert.equal(formatInvestmentAmount(1.25, true, cny), '¥9.00');
  assert.equal(formatInvestmentAmount(0, true, { ...cny, signed: true }), '¥0');
  assert.equal(formatInvestmentAmount(-0.0001, true, { ...cny, signed: true }), '¥0.00');
  assert.equal(formatInvestmentAmount(1000000, true, { displayCurrency: 'USD', displayRate: 1 }), '$1.0M');
});

test('investment amount conversion fails closed on missing amounts or invalid currency rates', () => {
  for (const value of [null, undefined, NaN, Infinity, '100']) {
    assert.equal(formatInvestmentAmount(value, true, { displayCurrency: 'CNY', displayRate: 7.2 }), '—');
  }
  for (const displayRate of [null, 0, -1, NaN, Infinity, '7.2']) {
    assert.equal(formatInvestmentAmount(100, true, { displayCurrency: 'CNY', displayRate }), '—');
    assert.equal(formatInvestmentAmount(0, true, { displayCurrency: 'CNY', displayRate, currency: false }), '—');
  }
  for (const displayCurrency of [null, '', 'EUR', 'cny']) {
    assert.equal(formatInvestmentAmount(100, true, { displayCurrency, displayRate: 7.2 }), '—');
  }
  assert.equal(formatInvestmentAmount(Number.MAX_VALUE, true, { displayCurrency: 'CNY', displayRate: 7.2 }), '—');
});

function currencyChartProps() {
  const points = ['2019-01-02', '2019-01-03', '2019-01-04'].map((date, index) => ({
    date, time: Date.parse(`${date}T00:00:00Z`), year: 2019,
    values: { QQQ: 10000 + index * 2500, TQQQ: 10000 - index * 1000 },
    profits: { QQQ: index * 2500, TQQQ: -index * 1000 },
    returns: { QQQ: index * 25, TQQQ: -index * 10 },
  }));
  return {
    model: { symbols: ['QQQ', 'TQQQ'], principal: 10000, points, actualStartDate: points[0].date },
    snapshot: { index: 2, point: points[2] },
    englishMode: true,
  };
}

test('chart currency changes labels and accessibility values while preserving raw geometry and returns', () => {
  const props = currencyChartProps();
  const before = structuredClone(props);
  for (const scale of ['linear', 'log']) {
    const usd = renderToStaticMarkup(React.createElement(InvestmentComparisonChart, { ...props, scale }));
    const cny = renderToStaticMarkup(React.createElement(InvestmentComparisonChart, { ...props, scale, displayCurrency: 'CNY', displayRate: 7.2 }));
    assert.doesNotMatch(usd, /Assets · USD/);
    assert.doesNotMatch(cny, /Assets · CNY/);
    assert.match(usd, /aria-label="QQQ cumulative profit \+\$5\.0K"/);
    assert.match(cny, /aria-label="QQQ cumulative profit \+¥36\.0K"/);
    assert.match(cny, /aria-label="TQQQ cumulative profit −¥14\.4K"/);
    assert.match(cny, /aria-valuetext="2019-01-04, QQQ ¥108\.0K CNY, TQQQ ¥57\.6K CNY"/);
    assert.doesNotMatch(cny, /USD|\$/);
    const paths = html => Array.from(html.matchAll(/<path d="([^"]+)"/g), match => match[1]);
    assert.equal(paths(usd).length, 4);
    assert.deepEqual(paths(cny), paths(usd));
    if (scale === 'linear') assert.match(cny, /class="ic-axis-label">36\.0K<\/text>/);
  }
  assert.deepEqual(props, before);
  assert.equal(formatInvestmentPercent(props.snapshot.point.returns.QQQ), '+50.0%');
  assert.equal(formatInvestmentPercent(props.snapshot.point.returns.TQQQ), '-20.0%');
});

test('chart displays unavailable amounts for an invalid conversion without erasing its raw series', () => {
  const props = currencyChartProps();
  for (const conversion of [{ displayCurrency: 'CNY', displayRate: null }, { displayCurrency: 'EUR', displayRate: 7.2 }]) {
    const html = renderToStaticMarkup(React.createElement(InvestmentComparisonChart, { ...props, ...conversion }));
    assert.match(html, /aria-label="QQQ cumulative profit —"/);
    assert.match(html, /aria-label="TQQQ cumulative profit —"/);
    assert.match(html, /class="ic-axis-label">—<\/text>/);
    assert.match(html, /data-investment-series="QQQ"/);
    assert.match(html, /data-investment-series="TQQQ"/);
    assert.doesNotMatch(html, /NaN|Infinity|¥0|\$0/);
  }
});

test('historical chart tooltip follows the display currency while retaining the selected daily point', async () => {
  const hookUrl = dataUrl(`
    import React from ${JSON.stringify(import.meta.resolve('react'))};
    let slots = [], cursor = 0;
    export function render(Component, props) { cursor = 0; return Component(props); }
    function useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      const slot = slots[index];
      return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }];
    }
    function useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    }
    export default { ...React, useState, useRef, useMemo: callback => callback(),
      useId: () => 'currency-test', useEffect() {}, useLayoutEffect() {} };
  `);
  const hooks = await import(hookUrl);
  const hookCompiled = compiled.replace(`from ${JSON.stringify(ssrReactUrl)}`, `from ${JSON.stringify(hookUrl)}`);
  const { default: Chart } = await import(dataUrl(hookCompiled));
  const props = currencyChartProps();
  let tree = hooks.render(Chart, props);
  const slider = React.Children.toArray(tree.props.children).find(child => child.props?.role === 'slider');
  slider.props.onKeyDown({ key: 'Home', preventDefault() {} });
  tree = hooks.render(Chart, { ...props, displayCurrency: 'CNY', displayRate: 7.2 });
  let tooltip = React.Children.toArray(tree.props.children).find(child => child.props?.role === 'tooltip');
  const cnyTooltip = renderToStaticMarkup(tooltip);
  assert.match(cnyTooltip, /class="ic-tooltip-date">2019-01-02<\/div>/);
  assert.match(cnyTooltip, /<span>QQQ<\/span><span>¥72\.0K<\/span>/);
  assert.match(cnyTooltip, /<span>TQQQ<\/span><span>¥72\.0K<\/span>/);
  const selected = React.Children.toArray(tree.props.children).find(child => child.props?.role === 'slider');
  assert.equal(selected.props['aria-valuenow'], 0);
  assert.equal(selected.props['aria-valuetext'], '2019-01-02, QQQ ¥72.0K CNY, TQQQ ¥72.0K CNY');
  tree = hooks.render(Chart, props);
  tooltip = React.Children.toArray(tree.props.children).find(child => child.props?.role === 'tooltip');
  assert.match(renderToStaticMarkup(tooltip), /<span>\$10\.0K<\/span>/);
  assert.doesNotMatch(renderToStaticMarkup(tooltip), /¥/);
});

test('profit direction follows market color preference while leadership remains independent', () => {
  for (const [mode, gain, loss] of [['redUpGreenDown', '#ff4b1f', '#34d399'], ['greenUpRedDown', '#34d399', '#ff4b1f']]) {
    assert.equal(investmentChangeColor(20, mode), gain);
    assert.equal(investmentChangeColor(-20, mode), loss);
    assert.equal(investmentChangeColor(0, mode), '#969faf');
    assert.equal(investmentChangeColor(null, mode), '#969faf');
    assert.equal(investmentRankColor('leading'), '#ff4b1f');
    assert.equal(investmentRankColor('trailing'), '#34d399');
  }
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
  assert.doesNotMatch(pageSource, /ic-source|ic-currency-note|EODHD ·|金额按系统当前汇率|Amounts use the current system rate/);
  assert.doesNotMatch(pageSource, /ic-methodology|计算口径|Calculation method/);
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
  assert.ok(pageSource.includes('type="number" inputMode="decimal"'));
  assert.ok(pageSource.includes('min={displayRate ?? undefined}'));
  assert.ok(pageSource.includes('max={displayRate === null ? undefined : 1000000000 * displayRate}'));
  assert.ok(pageSource.includes('disabled={displayRate === null} step="any"'));
  assert.ok(pageSource.includes('Principal per investment · ${displayCurrency}'));
  assert.ok(pageSource.includes('每个标的本金 · ${displayCurrency}'));
});
