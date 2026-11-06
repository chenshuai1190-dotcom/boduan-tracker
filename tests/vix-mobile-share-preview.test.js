import test from 'node:test';
import assert from 'node:assert/strict';
import { renderVixDailyMobileShare, renderVixOverviewMobileShare } from '../src/dev/vixDailyMobileShare.js';
import { marketTextHexColor, MARKET_COLOR_MODES } from '../src/lib/marketColorMode.js';
import { getVixRiskColor, VIX_TERM_CHART_COLORS } from '../src/lib/vixRiskPalette.js';

function report() {
  return {
    month: '2025-05', status: 'partial', asOfDate: '2025-05-07', cutoffDate: '2025-05-08', observedSessions: 3, expectedSessions: 6,
    summary: { SPY: { monthlyChangePct: 3.5 }, QQQ: { monthlyChangePct: null }, vixMax: { value: 35, date: '2025-05-07' } },
    rows: [
      { date: '2025-05-01', VIX: 19, VIX3M: 20, ratio: .95, currentRiskLevel: 'NORMAL',
        prices: { SPY: { dailyChangePct: 1.2 }, QQQ: { dailyChangePct: -2.5 } } },
      { date: '2025-05-02', VIX: 19.996, VIX3M: 20, ratio: .9998, currentRiskLevel: 'NORMAL',
        prices: { SPY: { dailyChangePct: 0 }, QQQ: { dailyChangePct: null } } },
      { date: '2025-05-07', VIX: 35, VIX3M: 30, ratio: 35 / 30, currentRiskLevel: 'EXTREME_STRESS',
        prices: { SPY: { dailyChangePct: -4 }, QQQ: { dailyChangePct: -5 } } },
      { date: '2025-05-09', VIX: 99, VIX3M: 30, ratio: 3.3, currentRiskLevel: 'EXTREME_STRESS' },
    ],
  };
}
function canvas(t, { encodingFailure = false } = {}) {
  const old = globalThis.document;
  const draws = []; const dimensions = []; const surfaces = []; const strokes = []; const fills = []; const rects = [];
  let path = []; let dash = [];
  const ctx = new Proxy({
    measureText: value => ({ width: String(value).length * 6 }),
    fillText: (value, x, y) => draws.push({ value, x, y, color: ctx.fillStyle }),
    beginPath: () => { path = []; },
    moveTo: (x, y) => path.push({ command: 'M', x, y }),
    lineTo: (x, y) => path.push({ command: 'L', x, y }),
    arc: (x, y, radius) => path.push({ command: 'A', x, y, radius }),
    setLineDash: values => { dash = [...values]; },
    stroke: () => strokes.push({ path: [...path], color: ctx.strokeStyle, width: ctx.lineWidth, dash: [...dash] }),
    fill: () => fills.push({ path: [...path], color: ctx.fillStyle }),
    fillRect: (x, y, width, height) => rects.push({ x, y, width, height, color: ctx.fillStyle }),
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  globalThis.document = { createElement: () => {
    const surface = { width: 0, height: 0, getContext: () => ctx,
      toBlob(callback, type) { dimensions.push({ width: this.width, height: this.height }); callback(encodingFailure ? null : new Blob(['png'], { type })); },
    };
    surfaces.push(surface); return surface;
  } };
  t.after(() => { if (old === undefined) delete globalThis.document; else globalThis.document = old; });
  return { draws, dimensions, surfaces, strokes, fills, rects };
}

test('mobile full-month PNG retains all cutoff sessions and gaps without pagination or mutated inputs', async t => {
  const { draws, dimensions, surfaces } = canvas(t);
  const value = report(); const original = structuredClone(value);
  const blob = await renderVixDailyMobileShare(value);
  assert.equal(blob.type, 'image/png');
  assert.deepEqual(dimensions, [{ width: 1170, height: 2682 }]);
  const labels = draws.map(draw => draw.value);
  for (const date of ['05/01', '05/02', '05/05', '05/06', '05/07', '05/08']) assert(labels.includes(date));
  assert(!labels.includes('05/09'));
  assert(labels.includes('—'));
  assert(labels.includes('待补齐'));
  assert(!labels.includes('VIX3M'), 'match the six-column mobile table');
  assert(!labels.includes('点行查看详情'), 'static image has no inactive controls');
  assert.deepEqual(value, original);
  assert.equal(surfaces[0].width, 0); assert.equal(surfaces[0].height, 0);
});

test('monthly summary, raw risk classification and return colors retain existing mobile semantics', async t => {
  const { draws } = canvas(t);
  const mode = MARKET_COLOR_MODES.RED_UP_GREEN_DOWN;
  await renderVixDailyMobileShare(report(), { marketColorMode: mode });
  const labels = draws.map(draw => draw.value);
  for (const label of ['市场月报', '2025 年 5 月', '每日明细', 'SPY 月内涨跌', 'VIX 最高收盘', '+3.50%', '+1.20%', '-2.50%', '0.00%', '1.000']) assert(labels.includes(label), label);
  assert.equal(draws.find(draw => draw.value === '+1.20%').color, marketTextHexColor(1.2, mode));
  assert.equal(draws.find(draw => draw.value === '-2.50%').color, marketTextHexColor(-2.5, mode));
  assert.equal(draws.find(draw => draw.value === '极端压力').color, getVixRiskColor('EXTREME_STRESS'));
  assert.equal(labels.filter(label => label === '常态波动').length, 2, 'rounding ratio to 1.000 does not reclassify supplied risk');
});

test('empty mobile months stay explicit and failed encoding releases Canvas', async t => {
  const value = { month: '2025-05', asOfDate: 'invalid', rows: [] };
  const { draws, surfaces } = canvas(t, { encodingFailure: true });
  await assert.rejects(renderVixDailyMobileShare(value), /生成失败/);
  assert(draws.some(draw => draw.value === '该月暂无可用收盘数据'));
  assert(!draws.some(draw => /NaN|undefined|Infinity/.test(draw.value)));
  assert.equal(surfaces[0].width, 0); assert.equal(surfaces[0].height, 0);
});

function overviewReport() {
  const value = report();
  value.asOfDate = value.cutoffDate;
  value.priorSession = { date: '2025-04-30', ratio: 1.05, inversionDays: 8, durationExact: { inversion: true } };
  value.summary = { SPY: { monthlyChangePct: 2, baselineDate: '2025-04-30' }, QQQ: { monthlyChangePct: -3, baselineDate: '2025-04-30' },
    vixMax: { value: 35, date: '2025-05-06' }, highStressDays: 1, inversionDays: 2 };
  value.rows = [
    { date: '2025-05-01', VIX: 21.6, VIX3M: 20, ratio: 1.08, inversionDays: 9, durationExact: { inversion: true }, currentRiskLevel: 'ELEVATED', prices: { SPY: { cumulativeChangePct: 1 }, QQQ: { cumulativeChangePct: -1 } } },
    { date: '2025-05-02', VIX: 19.6, VIX3M: 20, ratio: .98, currentRiskLevel: 'NORMAL', prices: { SPY: { cumulativeChangePct: 2 }, QQQ: { cumulativeChangePct: -2 } } },
    // Entire missing 05/05 must break all five plotted series.
    { date: '2025-05-06', VIX: 35, VIX3M: 30, ratio: 35 / 30, currentRiskLevel: 'EXTREME_STRESS', prices: { SPY: { cumulativeChangePct: -4 }, QQQ: { cumulativeChangePct: -5 } } },
    // 05/07 is missing too. 05/08 must not be called a normalization.
    { date: '2025-05-08', VIX: 19, VIX3M: 20, ratio: .95, currentRiskLevel: 'NORMAL', prices: { SPY: { cumulativeChangePct: 2 }, QQQ: { cumulativeChangePct: -3 } } },
  ];
  return value;
}

test('overview plots all three full-month series without bridging missing sessions, retaining original colors and baseline', async t => {
  const { draws, strokes, fills, dimensions, surfaces } = canvas(t);
  const value = overviewReport(); const original = structuredClone(value); const mode = MARKET_COLOR_MODES.RED_UP_GREEN_DOWN;
  const result = await renderVixOverviewMobileShare(value, { marketColorMode: mode });
  assert.equal(result.type, 'image/png');
  assert.deepEqual(dimensions, [{ width: 1170, height: 4701 }]);
  assert.deepEqual(value, original);
  const labels = draws.map(draw => draw.value);
  for (const label of ['总览', '股价累计涨跌', '波动率水平', '期限比率', '相对 2025-04-30 复权收盘', '高压及以上', '倒挂交易日', '05/01', '05/08']) assert(labels.includes(label), label);
  assert.equal(draws.find(draw => draw.value === '+2.00%').color, marketTextHexColor(2, mode));
  assert.equal(draws.find(draw => draw.value === '-3.00%').color, marketTextHexColor(-3, mode));
  const plotStrokes = strokes.filter(stroke => stroke.width === 1.8 && stroke.path[0]?.y > 480
    && stroke.path[1]?.x - stroke.path[0]?.x > 12); // Exclude the short legend keys.
  for (const expected of ['#78ace8', '#b79be5', '#dba77b', '#8fa1b6', VIX_TERM_CHART_COLORS.line]) {
    const segments = plotStrokes.filter(stroke => stroke.color === expected);
    assert.equal(segments.length, 1, `only the adjacent May 1–2 ${expected} observations should connect`);
    assert(Math.abs(segments[0].path[1].x - segments[0].path[0].x - 61.4) < .001);
  }
  assert(fills.some(fill => fill.color === getVixRiskColor('EXTREME_STRESS') && fill.path[0]?.command === 'A'), 'isolated extreme VIX observation remains visible in its own risk color');
  assert.equal(surfaces[0].width, 0); assert.equal(surfaces[0].height, 0);
});

test('adjacent VIX observations split risk-color transitions halfway instead of recoloring prior observations', async t => {
  const { strokes } = canvas(t);
  const value = overviewReport(); value.rows[1].currentRiskLevel = 'EXTREME_STRESS';
  await renderVixOverviewMobileShare(value);
  const segments = strokes.filter(stroke => stroke.width === 1.8 && stroke.path[0]?.x >= 53 && stroke.path[1]?.x <= 115
    && stroke.path[0]?.y > 700 && stroke.path[0]?.y < 950);
  const warm = segments.find(stroke => stroke.color === '#dba77b');
  const extreme = segments.find(stroke => stroke.color === getVixRiskColor('EXTREME_STRESS'));
  assert(warm && extreme);
  assert.equal(warm.path[1].x, extreme.path[0].x);
  assert.equal(warm.path[1].y, extreme.path[0].y);
  assert(Math.abs(warm.path[1].x - 83.7) < .001);
});

test('overview axis labels retain a 2.5 step rather than rounding fractional ticks to integers', async t => {
  const { draws } = canvas(t);
  const value = overviewReport();
  value.rows.forEach((row, index) => {
    row.VIX = [10, 12, 16, 18][index]; row.VIX3M = [11, 13, 17, 18][index];
    row.prices.SPY.cumulativeChangePct = [0, 2, 6, 8][index];
    row.prices.QQQ.cumulativeChangePct = [0, 2, 6, 8][index];
  });
  await renderVixOverviewMobileShare(value);
  const axes = draws.filter(draw => draw.x === 45).map(draw => draw.value);
  for (const label of ['-2.5%', '+2.5%', '+7.5%', '7.5', '12.5', '17.5', '1.00']) assert(axes.includes(label), label);
  assert(!axes.includes('+3%')); assert(!axes.includes('13'));
});

test('overview keeps carried-in inversion duration, thresholds, bands and only a verified adjacent normalization', async t => {
  const { draws, strokes, rects } = canvas(t);
  await renderVixOverviewMobileShare(overviewReport());
  const labels = draws.map(draw => draw.value);
  assert(labels.includes('连续倒挂 9 个交易日'));
  assert(labels.includes('承接上月 · 05/01—05/01'));
  assert(labels.includes('5/2 倒挂解除'));
  assert(!labels.includes('5/8 倒挂解除'), 'missing prior day is not proof of a normalization');
  assert.equal(rects.filter(rect => rect.color === VIX_TERM_CHART_COLORS.band).length, 2);
  for (const expected of [VIX_TERM_CHART_COLORS.threshold, VIX_TERM_CHART_COLORS.secondaryThreshold]) assert(strokes.some(stroke => stroke.color === expected && stroke.dash.join() === '3,4'));
  assert.equal(strokes.filter(stroke => stroke.color === VIX_TERM_CHART_COLORS.normalized && stroke.path[0]?.radius === 3.5).length, 1);
});

test('overview preserves uncertainty and interruption, never backfills a missing current reading', async t => {
  const { draws } = canvas(t);
  await renderVixOverviewMobileShare(report());
  const labels = draws.map(draw => draw.value);
  assert(labels.includes('已知倒挂至少 1 个交易日'));
  assert(labels.includes('05/07—05/07 · 连续数据中断'));
  assert(labels.includes('暂无已确认解除记录；空缺不视为解除'));
  assert.equal(draws.filter(draw => draw.value === '—' && [449, 735, 1021].includes(draw.y)).length, 5, 'all five current series readings keep the missing cutoff value');
  assert(!labels.includes('99.00'));
});

test('empty overview draws three explicit empty states and releases canvas on failed encoding', async t => {
  const { draws, surfaces } = canvas(t, { encodingFailure: true });
  await assert.rejects(renderVixOverviewMobileShare({ month: '2025-05', asOfDate: 'invalid', rows: [] }), /生成失败/);
  assert.equal(draws.filter(draw => draw.value === '这个月暂无可绘制的数据').length, 3);
  assert(!draws.some(draw => /NaN|undefined|Infinity/.test(draw.value)));
  assert.equal(surfaces[0].width, 0); assert.equal(surfaces[0].height, 0);
});

test('DEV mobile exports explicitly keep design labels while sharing the canonical production drawing', async t => {
  const { draws } = canvas(t);
  for (const render of [renderVixDailyMobileShare, renderVixOverviewMobileShare]) {
    const start = draws.length;
    await render(report(), { preview: false });
    const labels = draws.slice(start).map(draw => draw.value);
    assert(labels.includes('本地设计预览'));
    assert(labels.some(label => label.includes('已核验历史快照 · 本地设计')));
  }
});
