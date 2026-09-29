import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pageSource = readFileSync(new URL('../src/pages/VixComparisonPage.jsx', import.meta.url), 'utf8');
const chartSource = readFileSync(new URL('../src/components/VixRiskChart.jsx', import.meta.url), 'utf8');

test('VIX comparison omits the removed top labels and idle chart hints in both languages', () => {
  for (const text of ['左轴 · 点', '右轴 · 复权美元', 'Left · points', 'Right · Adj. USD']) {
    assert.equal(pageSource.includes(text), false, `removed top label must stay absent: ${text}`);
  }
  for (const text of ['滑动查看历史日涨跌', '左右轴独立刻度', 'Touch to see daily changes', 'Independent axes']) {
    assert.equal(chartSource.includes(text), false, `removed idle hint must stay absent: ${text}`);
  }
});

test('compact VIX comparison retains accessible date selection, price units and daily changes', () => {
  assert.ok(chartSource.includes('role="slider"'));
  assert.ok(chartSource.includes('aria-valuetext=') && chartSource.includes('selected.date'));
  assert.ok(chartSource.includes('VIX points on the left axis') && chartSource.includes('adjusted USD price on the right axis'));
  assert.ok(chartSource.includes('左轴 VIX 点位') && chartSource.includes('美元复权价'));
  assert.ok(chartSource.includes('priceDayChangePct'), 'selected chart quote must retain the ETF daily-change value');
  assert.ok(chartSource.includes('vixDayChangePct'), 'selected chart quote must retain the VIX daily-change value');
  assert.ok(chartSource.includes('formatVixComparisonChangePercent('));
  assert.ok(pageSource.includes('formatVixComparisonChangePercent('), 'period summary must retain shared signed-percent formatting');
});

test('VIX risk interpretation is independent of chart selection and rejects retained failed-refresh data', () => {
  const assessment = pageSource.match(/buildVixRiskModel\(\{([\s\S]*?)\}\)/)?.[1];
  assert.ok(assessment, 'page must call the production interpretation model');
  assert.ok(assessment.includes('termStructure: data?.termStructure'));
  assert.ok(assessment.includes('benchmarks: { SPY: data?.series?.SPY?.rows, QQQ: data?.series?.QQQ?.rows }'));
  assert.ok(assessment.includes('stale: riskStale || state.error'));
  assert.ok(assessment.includes('benchmarkStale: Boolean(data?.stale || state.error)'));
  assert.equal(/\b(range|selectedDate|symbol)\b/.test(assessment), false);
  assert.ok(pageSource.includes('import.meta.env.DEV ? previewData : null'));
  assert.equal(pageSource.includes('VIX_RISK_SCENARIOS'), false, 'production page must not import simulated histories');
  assert.ok(pageSource.includes('VIX_COMPARISON_RANGES.map'));
});

test('rendered dimensions preserve partial availability and reject same-date stale fallback prices', async () => {
  // Transform only the two presentational JSX modules. No listening server,
  // browser, authentication client, or request is needed for these SSR checks.
  const [{ default: React }, { renderToStaticMarkup }, { transformWithOxc }, { VIX_RISK_SCENARIOS }] = await Promise.all([
    import('react'), import('react-dom/server'), import('vite'), import('../src/dev/vixRiskPreviewData.js'),
  ]);
  async function jsxModule(relativePath, rewrites = {}) {
    const path = fileURLToPath(new URL(relativePath, import.meta.url));
    let { code } = await transformWithOxc(readFileSync(path, 'utf8'), path, { jsx: { runtime: 'automatic' } });
    code = code.replace(/import\s+['"][^'"]+\.css['"];?/g, '').replaceAll('import.meta.env.DEV', 'true');
    code = code.replace(/from\s+(['"])([^'"]+)\1/g, (_, quote, specifier) => {
      const target = rewrites[specifier] || (specifier.startsWith('.')
        ? pathToFileURL(resolve(dirname(path), specifier)).href : import.meta.resolve(specifier));
      return `from ${JSON.stringify(target)}`;
    });
    return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  }
  const chart = await jsxModule('../src/components/VixRiskChart.jsx');
  const { default: Page } = await import(await jsxModule('../src/pages/VixComparisonPage.jsx', { '../components/VixRiskChart.jsx': chart }));
  function fixture(id) {
    const { points, asOfDate } = VIX_RISK_SCENARIOS.find(item => item.id === id);
    return {
      source: 'DEMO', expectedAsOfDate: asOfDate, asOfDate, availableFromDate: points[0].date, stale: false,
      series: Object.fromEntries(['VIX', 'SPY', 'QQQ'].map(symbol => [symbol, {
        rows: points.map(point => ({ date: point.date, close: symbol === 'VIX' ? point.vix : point[symbol] })),
      }])),
      termStructure: { source: 'CBOE', asOfDate, expectedAsOfDate: asOfDate, stale: false,
        rows: points.map(point => ({ date: point.date, vix: point.vix, vix3m: point.vix / point.ratio, ratio: point.ratio })) },
    };
  }
  const render = previewData => renderToStaticMarkup(React.createElement(Page, { ctx: {}, previewData }));
  const fallback = fixture('price_divergence');
  fallback.stale = true;
  const staleHtml = render(fallback);
  assert.equal((staleHtml.match(/data-vix-price-status="UNKNOWN"/g) || []).length, 2,
    'same-date stale fallback must not show either retained price observation as current');

  const termStale = fixture('price_divergence');
  termStale.termStructure.stale = true;
  const termHtml = render(termStale);
  assert.ok(termHtml.includes('data-vix-risk-level="UNKNOWN"'));
  assert.ok(termHtml.includes('data-vix-price-status="NEW_LOW"'));
  assert.ok(termHtml.includes('data-vix-price-status="RECOVERY"'), 'volatility staleness alone must not erase fresh prices');

  const short = fixture('extreme');
  short.termStructure.rows = short.termStructure.rows.slice(-4);
  const shortHtml = render(short);
  assert.ok(shortHtml.includes('data-vix-risk-level="EXTREME_STRESS"'));
  assert.ok(shortHtml.includes('data-vix-risk-direction="UNKNOWN"'));
  assert.ok(shortHtml.includes('34.20') && shortHtml.includes('data-vix-partial-history="true"'));
  const extremeMetrics = shortHtml.match(/<div class="vcr-metrics">([\s\S]*?)<div class="vcr-environment">/)?.[1];
  assert.ok(extremeMetrics?.includes('<span>VIX</span><strong style="color:#ff4d4f">34.20</strong>'));
  assert.ok(extremeMetrics?.includes('<span>VIX3M</span><strong>'), 'VIX3M keeps its original color');
  assert.match(shortHtml, /<strong style="color:#ff4d4f">深度倒挂<\/strong><small style="color:#ff4d4f">连续倒挂：/);
  assert.ok(!termHtml.match(/<div class="vcr-metrics">([\s\S]*?)<div class="vcr-environment">/)?.[1]?.includes('#ff4d4f'), 'stale current metrics do not retain a red current judgment');


  const missingSpy = fixture('price_divergence');
  missingSpy.series.SPY.rows.pop();
  const separateHtml = render(missingSpy);
  assert.ok(separateHtml.includes('data-vix-risk-level="NORMAL"'));
  assert.ok(separateHtml.includes('data-vix-price-status="UNKNOWN"'));
  assert.ok(separateHtml.includes('data-vix-price-status="RECOVERY"'), 'a SPY gap must not suppress QQQ');
});

test('linked charts break paths at missing values and support touch-scroll and keyboard selection', () => {
  assert.ok(chartSource.includes('isVixComparisonSession(date)'), 'chart uses the shared VIX calendar, including official exceptional closures');
  assert.ok(chartSource.includes("if (!Number.isFinite(row[field])) { penDown = false; return ''; }"), 'missing readings must break the path');
  assert.ok(chartSource.includes("path('ratio', ry)"));
  assert.ok(chartSource.includes("gesture.intent === 'vertical'"));
  assert.ok(chartSource.includes("event.key === 'Escape'"));
  assert.ok(chartSource.includes("['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ']"));
});

test('VIX comparison removes static footer explanations while retaining data-status feedback', () => {
  for (const text of [
    'it is an ETF, not the index itself.', '的 ETF，并非指数点位。',
    'Daily changes compare with the previous trading close;', '当日涨跌相对前一交易日收盘计算，',
    'Daily closing data, not live quotes.', '日线收盘数据，非实时行情。',
    ' EODHD.',
  ]) assert.equal(pageSource.includes(text), false, `removed footer explanation must stay absent: ${text}`);
  assert.equal(/\bInfo\b/.test(pageSource), false, 'the removed information icon must not remain');
  assert.ok(pageSource.includes('chartStale && data?.expectedAsOfDate'));
  assert.ok(pageSource.includes('Latest expected trading date:') && pageSource.includes('最近应有交易日：'));
  assert.ok(pageSource.includes('partialHistory &&') && pageSource.includes('Available history starts') && pageSource.includes('可用历史始于'));
  assert.ok(pageSource.includes('state.error &&') && pageSource.includes('role="alert"'));
  assert.ok(pageSource.includes('Daily data could not be loaded.') && pageSource.includes('日线数据暂时无法读取。'));
});

test('six-dimensional view keeps current readings independent of history readiness and separates both price observations', () => {
  assert.equal(pageSource.includes('risk.phase'), false);
  assert.equal(pageSource.includes('priceConfirmation'), false);
  assert.equal(pageSource.includes('vcr-stage-track'), false);
  assert.ok(pageSource.includes('data-vix-risk-level={currentRiskLevel}'));
  assert.ok(pageSource.includes('data-vix-term-structure={term}'));
  assert.ok(pageSource.includes('data-vix-risk-direction={direction}'));
  const latest = pageSource.match(/const latest = ([^;]+);/)?.[1];
  assert.ok(latest && !latest.includes('risk.ready'), 'valid current values must not be erased by insufficient longer history');
  assert.ok(pageSource.includes("['SPY', 'QQQ'].map(item => <PriceObservation"));
  for (const label of ['高压状态', '高位维持', '基本稳定', '反弹延续', '尚未止跌', '波动显著升高']) assert.ok(pageSource.includes(label));
  assert.ok(pageSource.includes('仅表示近期未创新低且价格出现回升，不代表市场底部已经形成。'));
  assert.ok(pageSource.includes('尚未证明具有投资预测能力'));
});
