import assert from 'node:assert/strict';
import test from 'node:test';
import { renderVixMonthlyShare, renderVixMonthlySharePreview } from '../src/lib/vixMonthlyShare.js';
import { MARKET_COLOR_MODES, marketTextHexColor } from '../src/lib/marketColorMode.js';
import { getVixRiskColor } from '../src/lib/vixRiskPalette.js';

function canvasEnvironment(t, options = {}) {
  const prior = globalThis.document;
  const labels = [];
  const frames = [];
  const textDraws = [];
  const strokeColors = [];
  const strokes = [];
  const fills = [];
  let path = [];
  const context = new Proxy({
    beginPath: () => { path = []; },
    moveTo: (x, y) => path.push({ kind: 'move', x, y }),
    lineTo: (x, y) => path.push({ kind: 'line', x, y }),
    arc: (x, y, radius) => path.push({ kind: 'arc', x, y, radius }),
    measureText: value => ({ width: String(value).length * 15 }),
    fillText: (value, x, y) => {
      labels.push(String(value));
      textDraws.push({ text: String(value), x, y, color: context.fillStyle });
    },
    stroke: () => {
      strokeColors.push(context.strokeStyle);
      strokes.push({ color: context.strokeStyle, width: context.lineWidth, path: structuredClone(path) });
    },
    fill: () => fills.push({ color: context.fillStyle, path: structuredClone(path) }),
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  globalThis.document = { createElement: () => {
    const canvas = {
      width: 0, height: 0,
      getContext: () => options.missingContext ? null : context,
      toBlob(callback, type) {
        frames.push({ width: this.width, height: this.height, type });
        if (options.encodeThrows) throw new Error('encode failed');
        callback(options.emptyBlob ? null : new Blob(['encoded-canvas'], { type }));
      },
    };
    frames.push(canvas);
    return canvas;
  } };
  t.after(() => {
    if (prior === undefined) delete globalThis.document;
    else globalThis.document = prior;
  });
  return { labels, frames, textDraws, strokeColors, strokes, fills };
}

const report = () => ({
  month: '2025-05', monthLabel: '2025年5月', status: 'partial',
  asOfDate: '2025-05-02', cutoffDate: '2025-05-06', observedSessions: 2, expectedSessions: 4,
  summary: { SPY: { monthlyChangePct: null, baselineDate: '2025-04-30', baselineClose: 100 },
    QQQ: { monthlyChangePct: null, baselineDate: '2025-04-30', baselineClose: 200 }, inversionDays: 1 },
  rows: [
    { date: '2025-05-01', VIX: 19, VIX3M: 20, ratio: .95, inversionDays: 0, currentRiskLevel: 'NORMAL',
      prices: { SPY: { dailyChangePct: 1, cumulativeChangePct: 1 }, QQQ: { dailyChangePct: -1, cumulativeChangePct: -1 } } },
    { date: '2025-05-02', VIX: 21, VIX3M: 20, ratio: 1.05, inversionDays: 1, currentRiskLevel: 'ELEVATED',
      durationExact: { inversion: true }, prices: { SPY: { dailyChangePct: 0, cumulativeChangePct: 1 } } },
    { date: '2025-05-07', VIX: 17, VIX3M: 20, ratio: .85, inversionDays: 0 },
  ],
});

test('production share returns a PNG Blob and keeps missing calendar days in the daily export', async t => {
  const { labels, frames } = canvasEnvironment(t);
  const value = report();
  const original = structuredClone(value);
  const blob = await renderVixMonthlyShare(value, 'daily');
  assert.equal(blob.type, 'image/png');
  assert(blob.size > 0);
  assert.deepEqual(frames[1], { width: 1920, height: 2720, type: 'image/png' });
  for (const date of ['05/01', '05/02', '05/05', '05/06']) assert(labels.includes(date));
  assert(!labels.includes('05/07'));
  assert(labels.includes('—'));
  assert(labels.some(label => label.includes('数据截至 2025/05/02')));
  assert.deepEqual(value, original);
  assert.equal(frames[0].width, 0);
  assert.equal(frames[0].height, 0);
});

test('overview uses the expected cutoff to show missing-tail interruption, without a future normalization', async t => {
  const { labels } = canvasEnvironment(t);
  await renderVixMonthlyShare(report());
  assert(labels.some(label => label.includes('连续倒挂 1 个交易日') && label.includes('数据中断')));
  assert(!labels.some(label => label.includes('仍在持续') || label.includes('5/7 倒挂解除')));
});

test('empty and invalid-date reports produce explicit empty states instead of zero series', async t => {
  const { labels } = canvasEnvironment(t);
  await renderVixMonthlyShare({ month: '2025-05', asOfDate: 'invalid', rows: [], summary: {} });
  assert(labels.includes('数据不足，暂无可用曲线'));
  assert(labels.includes('—'));
  assert(!labels.some(label => /NaN|undefined|Infinity/.test(label)));
});

test('renderer rejects missing Canvas or encoding failure and releases its backing memory', async t => {
  const options = { missingContext: true };
  const environment = canvasEnvironment(t, options);
  await assert.rejects(renderVixMonthlyShare(report()), /无法生成/);
  assert.equal(environment.frames[0].width, 0);
  options.missingContext = false;
  options.emptyBlob = true;
  await assert.rejects(renderVixMonthlyShare(report()), /生成失败/);
  assert.equal(environment.frames[1].height, 0);
  options.emptyBlob = false;
  options.encodeThrows = true;
  await assert.rejects(renderVixMonthlyShare(report()), /encode failed/);
  assert.equal(environment.frames[3].width, 0);
  await assert.rejects(renderVixMonthlyShare(null), /数据不可用/);
  await assert.rejects(renderVixMonthlyShare([], 'overview'), /数据不可用/);
  await assert.rejects(renderVixMonthlyShare(report(), 'unknown'), /类型/);
});

test('DEV share exports are aliases of the production renderer', async () => {
  const compatibility = await import('../src/dev/vixMonthlySharePreview.js');
  assert.equal(renderVixMonthlySharePreview, renderVixMonthlyShare);
  assert.equal(compatibility.renderVixMonthlySharePreview, renderVixMonthlyShare);
  assert.equal(compatibility.renderVixMonthlyShare, renderVixMonthlyShare);
});

function coloredReport() {
  const value = report();
  value.status = 'complete';
  value.cutoffDate = value.asOfDate = '2025-05-02';
  value.expectedSessions = value.observedSessions = 2;
  value.summary.SPY.monthlyChangePct = 2.5;
  value.summary.QQQ.monthlyChangePct = -3.75;
  value.summary.vixMax = { value: 35, date: '2025-05-01' };
  value.rows = value.rows.slice(0, 2);
  Object.assign(value.rows[0], { VIX: 35, VIX3M: 30, ratio: 35 / 30, inversionDays: 1,
    currentRiskLevel: 'EXTREME_STRESS', durationExact: { inversion: true } });
  value.rows[1].currentRiskLevel = 'UNKNOWN';
  return value;
}

for (const mode of [MARKET_COLOR_MODES.GREEN_UP_RED_DOWN, MARKET_COLOR_MODES.RED_UP_GREEN_DOWN]) {
  const positive = marketTextHexColor(1, mode);
  const negative = marketTextHexColor(-1, mode);
  test(`overview percentage text follows ${mode} while series colors stay fixed`, async t => {
    const { textDraws, strokeColors } = canvasEnvironment(t);
    await renderVixMonthlyShare(coloredReport(), 'overview', { marketColorMode: mode });
    assert.equal(textDraws.find(draw => draw.text === '+2.50%' && draw.y === 454)?.color, positive);
    assert.equal(textDraws.find(draw => draw.text === '-3.75%' && draw.y === 454)?.color, negative);
    const ticks = textDraws.filter(draw => draw.x === 182 && draw.text.endsWith('%'));
    assert(ticks.some(draw => draw.text.startsWith('+')));
    assert(ticks.some(draw => draw.text.startsWith('-')));
    assert(ticks.some(draw => Number.parseFloat(draw.text) === 0));
    for (const tick of ticks) {
      const value = Number.parseFloat(tick.text);
      assert.equal(tick.color, value === 0 ? '#8d9bad' : value > 0 ? positive : negative);
    }
    assert(strokeColors.includes('#79b4ff'), 'SPY curve and legend retain series identity');
    assert(strokeColors.includes('#b9a0ff'), 'QQQ curve and legend retain series identity');
  });

  test(`daily export follows ${mode}, keeps zero/missing neutral and extreme risk red`, async t => {
    const { textDraws, strokeColors } = canvasEnvironment(t);
    await renderVixMonthlyShare(coloredReport(), 'daily', { marketColorMode: mode });
    for (const [label, y, color] of [
      ['+2.50%', 377, positive], ['-3.75%', 377, negative],
      ['+1.00%', 653, positive], ['-1.00%', 653, negative],
      ['0.00%', 727, '#8d9bad'],
    ]) assert.equal(textDraws.find(draw => draw.text === label && draw.y === y)?.color, color, `${label} at ${y}`);
    assert.equal(textDraws.find(draw => draw.text === '—' && draw.x === 1472 && draw.y === 727)?.color, '#8d9bad');
    assert.equal(textDraws.find(draw => draw.text === '极端压力')?.color, '#ff4d4f');
    assert.equal(textDraws.find(draw => draw.text === '—' && draw.x === 1782 && draw.y === 730)?.color,
      getVixRiskColor('UNKNOWN'));
    assert(strokeColors.includes('#ff4d4f'), 'extreme-risk row marker follows the shared risk palette');
    assert.equal(textDraws.find(draw => draw.text === 'SPY' && draw.y === 377)?.color, '#79b4ff');
    assert.equal(textDraws.find(draw => draw.text === 'QQQ' && draw.y === 377)?.color, '#b9a0ff');
  });
}

test('monthly zero, null and nonfinite returns remain neutral instead of becoming directional signals', async t => {
  const { textDraws } = canvasEnvironment(t);
  for (const type of ['overview', 'daily']) {
    for (const invalid of [null, Number.NaN, Number.POSITIVE_INFINITY]) {
      const value = coloredReport();
      value.summary.SPY.monthlyChangePct = 0;
      value.summary.QQQ.monthlyChangePct = invalid;
      const offset = textDraws.length;
      await renderVixMonthlyShare(value, type, { marketColorMode: MARKET_COLOR_MODES.RED_UP_GREEN_DOWN });
      const y = type === 'overview' ? 454 : 377;
      const summary = textDraws.slice(offset).filter(draw => draw.y === y && ['0.00%', '—'].includes(draw.text));
      assert.equal(summary.length, 2);
      assert(summary.every(draw => draw.color === '#8d9bad'));
    }
  }
});

test('render calls keep color preferences local and default mode is not inherited from a prior export', async t => {
  const { textDraws } = canvasEnvironment(t);
  await renderVixMonthlyShare(coloredReport(), 'overview', { marketColorMode: MARKET_COLOR_MODES.RED_UP_GREEN_DOWN });
  const offset = textDraws.length;
  await renderVixMonthlyShare(coloredReport(), 'overview');
  assert.equal(textDraws.slice(offset).find(draw => draw.text === '+2.50%' && draw.y === 454)?.color, marketTextHexColor(1));
  assert.equal(textDraws.slice(offset).find(draw => draw.text === '-3.75%' && draw.y === 454)?.color, marketTextHexColor(-1));
});

function mixedRiskReport() {
  const value = coloredReport();
  value.asOfDate = value.cutoffDate = '2025-05-06';
  value.expectedSessions = value.observedSessions = 4;
  value.summary.vixMax = { value: 35, date: '2025-05-02' };
  value.rows = [
    { date: '2025-05-01', VIX: 20, VIX3M: 22, ratio: 20 / 22, currentRiskLevel: 'NORMAL', inversionDays: 0 },
    { date: '2025-05-02', VIX: 35, VIX3M: 30, ratio: 35 / 30, currentRiskLevel: 'EXTREME_STRESS', inversionDays: 1 },
    { date: '2025-05-05', VIX: 34, VIX3M: 31, ratio: 34 / 31, currentRiskLevel: 'EXTREME_STRESS', inversionDays: 2 },
    { date: '2025-05-06', VIX: 24, VIX3M: 26, ratio: 24 / 26, currentRiskLevel: 'ELEVATED', inversionDays: 0 },
  ];
  return value;
}
const vixStrokes = strokes => strokes.filter(stroke => stroke.width === 5
  && ['#ffae6c', '#ff4d4f'].includes(stroke.color)
  && stroke.path.some(point => point.kind === 'line')
  && stroke.path.every(point => point.y >= 1414 && point.y <= 1772));
const vixPoints = fills => fills.filter(fill => ['#ffae6c', '#ff4d4f'].includes(fill.color)
  && fill.path.length === 1 && fill.path[0].kind === 'arc'
  && fill.path[0].y >= 1414 && fill.path[0].y <= 1772);

for (const mode of [MARKET_COLOR_MODES.GREEN_UP_RED_DOWN, MARKET_COLOR_MODES.RED_UP_GREEN_DOWN]) {
  test(`VIX points and midpoint segments follow each day's risk independently of ${mode}`, async t => {
    const { strokes, fills, textDraws } = canvasEnvironment(t);
    const value = mixedRiskReport();
    const original = structuredClone(value);
    await renderVixMonthlyShare(value, 'overview', { marketColorMode: mode });
    const paths = vixStrokes(strokes);
    const points = vixPoints(fills);
    assert.deepEqual(paths.map(path => path.color), ['#ffae6c', '#ff4d4f', '#ffae6c']);
    assert.deepEqual(points.map(point => point.color), ['#ffae6c', '#ff4d4f', '#ff4d4f', '#ffae6c']);
    for (const [startIndex, endIndex, leftPath, rightPath] of [[0, 1, 0, 1], [2, 3, 1, 2]]) {
      const start = points[startIndex].path[0];
      const end = points[endIndex].path[0];
      const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      assert.deepEqual(paths[leftPath].path.at(-1), { kind: 'line', ...midpoint });
      assert.deepEqual(paths[rightPath].path[0], { kind: 'move', ...midpoint });
    }
    assert.equal(strokes.filter(stroke => stroke.color === '#92a4bb' && stroke.width === 4).length, 1);
    assert.equal(textDraws.find(draw => draw.text === '35.00' && draw.y === 454)?.color, '#ff4d4f');
    assert.equal(textDraws.find(draw => draw.text === '05/02  35.00')?.color, '#ff4d4f');
    assert.equal(textDraws.find(draw => draw.text.includes('最长已知段'))?.color, '#ff4d4f');
    assert.equal(textDraws.find(draw => draw.text.includes('5/6 倒挂解除'))?.color, '#c7c8d0');
    assert.deepEqual(value, original, 'coloring must not change source observations');
  });
}

test('risk-colored VIX lines do not bridge missing provider sessions or invalid values', async t => {
  const { strokes, fills } = canvasEnvironment(t);
  for (const missing of ['omitted', 'nonfinite']) {
    const value = mixedRiskReport();
    if (missing === 'omitted') value.rows.splice(2, 1);
    else value.rows[2].VIX = Number.NaN;
    const strokeStart = strokes.length;
    const fillStart = fills.length;
    await renderVixMonthlyShare(value);
    const paths = vixStrokes(strokes.slice(strokeStart));
    const points = vixPoints(fills.slice(fillStart));
    assert.equal(paths.length, 2);
    assert.equal(points.length, 3);
    assert(paths.every(path => path.path.every(point => point.x <= points[1].path[0].x)),
      'the last isolated observation must not connect across the absent or invalid session');
    assert(points.at(-1).path[0].x > points[1].path[0].x);
  }
});

test('high VIX without extreme risk and future extreme observations do not turn the month red', async t => {
  const { strokes, fills, textDraws } = canvasEnvironment(t);
  const value = mixedRiskReport();
  value.asOfDate = value.cutoffDate = '2025-05-02';
  value.rows[1].currentRiskLevel = 'ELEVATED';
  value.rows[1].VIX3M = 36;
  value.rows[1].ratio = 35 / 36;
  await renderVixMonthlyShare(value);
  assert(vixStrokes(strokes).every(stroke => stroke.color === '#ffae6c'));
  assert.deepEqual(vixPoints(fills).map(point => point.color), ['#ffae6c', '#ffae6c']);
  assert.equal(textDraws.find(draw => draw.text === '35.00' && draw.y === 454)?.color, '#ffae6c');
  assert.equal(textDraws.find(draw => draw.text === '05/02  35.00')?.color, '#ffae6c');
});
