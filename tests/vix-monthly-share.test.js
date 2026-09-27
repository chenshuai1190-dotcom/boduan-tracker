import assert from 'node:assert/strict';
import test from 'node:test';
import { renderVixMonthlyShare, renderVixMonthlySharePreview } from '../src/lib/vixMonthlyShare.js';

function canvasEnvironment(t, options = {}) {
  const prior = globalThis.document;
  const labels = [];
  const frames = [];
  const context = new Proxy({
    measureText: value => ({ width: String(value).length * 15 }),
    fillText: value => labels.push(String(value)),
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
  return { labels, frames };
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
