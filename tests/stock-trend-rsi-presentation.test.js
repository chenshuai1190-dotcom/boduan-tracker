import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { STOCK_TREND_RSI_VERSION } from '../src/lib/stockRsiConfig.js';
import { hasStockTrendRsiSignal, stockTrendRsiState } from '../src/lib/stockTrendRsiSignal.js';
import { stockTrendRsiPresentation } from '../src/lib/stockTrendRsiPresentation.js';
import { buildStockTrendRsiExplanation } from '../src/lib/stockTrendRsiExplanation.js';
import { buildTechnicalExplanation } from '../src/lib/technicalExplanation.js';

const page = readFileSync(new URL('../src/pages/WatchlistStockDetailPage.jsx', import.meta.url), 'utf8');
const start = page.indexOf('<div className="stock-report-rsi-metric"');
const end = page.indexOf('\n        </div>\n\n        <div className="stock-report-ma-assessment"', start);
assert.ok(start >= 0 && end > start);
const transformed = await transformWithOxc(`import React from ${JSON.stringify(import.meta.resolve('react'))};
export default function Metric({ rsiSignal, rsiDisplay, language }) { const NUMBER_FONT = 'system-ui'; const explanationTrigger = () => ({}); return (${page.slice(start, end).trim()}); }`, 'Metric.jsx', { jsx: { runtime: 'classic' } });
const { default: Metric } = await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`);
const render = (signal, language = 'zh') => renderToStaticMarkup(React.createElement(Metric, {
  rsiSignal: signal, rsiDisplay: stockTrendRsiPresentation(signal, language === 'en'), language,
}));
const plain = html => html.replace(/<[^>]+>/g, '');
const joined = result => JSON.stringify(result);

function signalFixture({ state = 'NONE', value = 82, currentPrice = 101, peakPrice = 100, peakRsi = 90, withPeak = state !== 'NONE', confirmedPrice = 101, confirmedRsi = 85 } = {}) {
  const asOf = '2026-09-17';
  const previousPeak = withPeak ? { date: '2026-09-01', price: peakPrice, rsi6: peakRsi, confirmedAt: '2026-09-03' } : null;
  const signal = {
    period: 6, value, asOf, priceBasis: 'adjusted_close',
    // Conflicting legacy metadata must have no influence on the trend page.
    divergenceVersion: 'rsi6-lifecycle-v3', divergenceState: 'CONFIRMED', divergenceDate: '2026-09-16',
    divergenceRiskScore: 99, divergenceRiskLevel: 'HIGH', divergenceDebug: { riskScore: 99 },
    trendMomentum: {
      version: STOCK_TREND_RSI_VERSION, asOf, rsiState: stockTrendRsiState(value), divergenceState: state,
      currentPrice, currentRSI6: value, previousPeak,
      priceBreakoutPct: previousPeak ? (currentPrice / peakPrice - 1) * 100 : null,
      rsiDivergenceDelta: previousPeak ? peakRsi - value : null,
      priceHigherHigh: previousPeak ? currentPrice > peakPrice : null,
      rsiLowerHigh: previousPeak ? value < peakRsi : null,
      divergenceDate: state === 'CONFIRMED' ? '2026-09-14' : ['WATCH', 'POTENTIAL'].includes(state) ? asOf : null,
      confirmation: state === 'CONFIRMED' ? {
        previousPeak: { ...previousPeak },
        peak: { date: '2026-09-09', price: confirmedPrice, rsi6: confirmedRsi, confirmedAt: '2026-09-14' },
      } : null,
      chaseBuyBlocked: state === null ? null : value >= 80 && ['POTENTIAL', 'CONFIRMED'].includes(state),
    },
  };
  assert.equal(hasStockTrendRsiSignal(signal), true, `fixture ${state} must satisfy the trend contract`);
  return signal;
}

function explanation(signal, language = 'zh') {
  return buildStockTrendRsiExplanation({ language, currentData: { asOfDate: signal.asOf, rsiSignal: signal, currency: 'USD' } });
}

test('trend RSI zones use exact 70/80 thresholds without changing the displayed RSI calculation', () => {
  for (const [value, label] of [[0, '正常'], [20, '正常'], [69.999, '正常'], [70, '超买'], [79.999, '超买'], [80, '强超买'], [100, '强超买']]) {
    const signal = signalFixture({ value });
    assert.equal(stockTrendRsiPresentation(signal).zoneLabel, label);
    assert.equal(plain(render(signal)), `RSI(6)›${value.toFixed(1)}${label}·无背离`);
  }
  assert.match(page, /const rsiDisplay = stockTrendRsiPresentation\(rsiSignal,/);
  assert.doesNotMatch(page, /import \{ stockRsiPresentation \}/);
});

test('actual trend markup renders all four new states and uses only the new event date', () => {
  for (const [state, value, label] of [['NONE', 52, '正常·无背离'], ['WATCH', 89, '强超买·背离观察'], ['POTENTIAL', 82, '强超买·潜在顶背离'], ['CONFIRMED', 82, '强超买·顶背离确认']]) {
    const signal = signalFixture({ state, value });
    const before = structuredClone(signal);
    const html = render(signal);
    assert.equal(plain(html), `RSI(6)›${value.toFixed(1)}${label}`);
    assert.match(html, new RegExp(`data-watchlist-rsi-divergence="${state.toLowerCase()}"`));
    assert.doesNotMatch(html, /2026-09-16|顶背离形成|已兑现|失效/);
    if (state === 'CONFIRMED') assert.match(html, /顶背离确认 · 2026-09-14/);
    assert.deepEqual(signal, before);
  }
});

test('old, stale, malformed, or unknown metadata never becomes no divergence or confirmation', () => {
  const variants = [
    signal => { delete signal.trendMomentum; },
    signal => { signal.trendMomentum.version = 'old'; },
    signal => { signal.trendMomentum.asOf = '2026-09-16'; },
    signal => { signal.trendMomentum.currentRSI6 = 0; },
    signal => { signal.trendMomentum.currentPrice = null; },
    signal => { signal.trendMomentum.chaseBuyBlocked = false; },
  ];
  for (const change of variants) {
    const signal = signalFixture({ state: 'POTENTIAL' });
    change(signal);
    const display = stockTrendRsiPresentation(signal);
    assert.equal(display.available, true);
    assert.equal(display.momentumAvailable, false);
    assert.equal(display.momentumLabel, '背离未知');
    assert.equal(display.chaseBuyBlocked, null);
    assert.equal(plain(render(signal)), 'RSI(6)›82.0强超买·背离未知');
    const result = explanation(signal);
    assert.equal(result.incomplete, true);
    assert.equal(result.eventDetails, null);
    assert.deepEqual(result.currentView, []);
  }
  assert.equal(stockTrendRsiPresentation(signalFixture({ state: null, withPeak: false })).momentumLabel, '背离未知');
  assert.equal(plain(render(null)), 'RSI(6)›——·—');
});

test('WATCH retains actual fine RSI differences and never blocks chase buying', () => {
  const signal = signalFixture({ state: 'WATCH', value: 87.7718, currentPrice: 682.31, peakPrice: 653.69, peakRsi: 87.837 });
  const result = explanation(signal);
  assert.equal(result.status, '强超买 · 背离观察');
  assert.equal(result.incomplete, false);
  assert.equal(stockTrendRsiPresentation(signal).chaseBuyBlocked, false);
  assert.ok(result.eventDetails.rows.some(row => row.value.includes('$653.69') && row.value.includes('RSI 87.84')));
  assert.ok(result.eventDetails.rows.some(row => row.value === '2026-09-17 · $682.31'));
  assert.ok(result.eventDetails.rows.some(row => row.value === '+0.07点'));
  assert.ok(result.why.some(line => line.includes('RSI下降幅度未达阈值')));
  assert.ok(result.currentView.some(line => line.includes('不触发禁止追买')));
});

test('an RSI decline of at least three points with less than 0.5% price breakout stays WATCH', () => {
  const result = explanation(signalFixture({ state: 'WATCH', value: 85, currentPrice: 100.2 }));
  assert.equal(result.status, '强超买 · 背离观察');
  assert.ok(result.why.some(line => line.includes('价格突破幅度未达阈值')));
  assert.ok(result.eventDetails.rows.some(row => row.label === '价格突破幅度' && row.value === '+0.20%'));
  assert.ok(result.rows.some(row => row.label === '追买限制' && row.value === '未触发'));
  const exactPriceThreshold = explanation(signalFixture({ state: 'WATCH', value: 89, currentPrice: 100.5 }));
  assert.ok(exactPriceThreshold.why.some(line => line.includes('RSI下降幅度未达阈值')));
  assert.equal(exactPriceThreshold.why.some(line => line.includes('两项幅度均未达阈值')), false, 'binary rounding at exactly 0.5% must not create a false missing condition');
});

test('POTENTIAL and CONFIRMED block chase buying only with current strongly overbought RSI', () => {
  for (const state of ['POTENTIAL', 'CONFIRMED']) {
    for (const value of [79.999, 80]) {
      const signal = signalFixture({ state, value });
      const result = explanation(signal);
      assert.equal(stockTrendRsiPresentation(signal).chaseBuyBlocked, value >= 80);
      assert.ok(result.rows.some(row => row.label === '追买限制' && row.value === (value >= 80 ? '禁止追买' : '未触发')));
      assert.ok(result.doesNotMean.some(line => line.includes('不是卖出信号') && line.includes('不改变均线结构或趋势状态')));
      assert.doesNotMatch(joined(result), /风险评分|99|divergenceRisk|riskScore/);
    }
  }
});

test('confirmation evidence displays actual peak and confirmation dates independently from potential thresholds', () => {
  const signal = signalFixture({ state: 'CONFIRMED', value: 82, confirmedPrice: 100.2, confirmedRsi: 89.9 });
  const result = explanation(signal);
  assert.equal(result.status, '强超买 · 顶背离确认');
  assert.ok(result.eventDetails.rows.some(row => row.label === '确认事件的后峰收盘' && row.value === '2026-09-09 · $100.20 · RSI 89.90'));
  assert.ok(result.eventDetails.rows.some(row => row.label === '顶背离确认日期' && row.value === '2026-09-14'));
  assert.ok(result.ruleDetails.lines.some(line => line.includes('右侧3个') && line.includes('不要求先经过潜在顶背离')));
  assert.ok(result.ruleDetails.lines.some(line => line.includes('左右各2个') && line.includes('不低于70')));
  assert.ok(result.ruleDetails.lines.some(line => line.includes('8%') && line.includes('40')));
  assert.doesNotMatch(joined(result), /回撤至少3%|风险评分|风险较低/);
});

test('unavailable or stale RSI cannot generate zero-filled evidence or an invented restriction', () => {
  const signal = signalFixture();
  const stale = buildStockTrendRsiExplanation({ currentData: { asOfDate: '2026-09-18', rsiSignal: signal } });
  assert.equal(stale.status, '—');
  assert.equal(stale.incomplete, true);
  assert.deepEqual(stale.rows, []);
  assert.equal(stale.ruleDetails, null);
  const noPeak = explanation(signal);
  assert.equal(noPeak.eventDetails.rows.length, 2);
  assert.equal(noPeak.eventDetails.rows.some(row => /参考峰|价格突破|RSI差/.test(row.label)), false);
  const noneWithPeak = explanation(signalFixture({ state: 'NONE', value: 90, withPeak: true }));
  assert.ok(noneWithPeak.eventDetails.rows.some(row => row.label === 'RSI差（参考峰−当日）' && row.value === '0.00点'));
});

test('English labels and explanations are complete and do not inherit legacy scores or signals', () => {
  const labels = { NONE: 'No divergence', WATCH: 'Divergence watch', POTENTIAL: 'Potential bearish divergence', CONFIRMED: 'Bearish divergence confirmed' };
  for (const state of Object.keys(labels)) {
    const signal = signalFixture({ state, value: state === 'WATCH' ? 89 : 82 });
    const result = explanation(signal, 'en');
    assert.equal(stockTrendRsiPresentation(signal, true).momentumLabel, labels[state]);
    assert.doesNotMatch(joined(result), /[\u3400-\u9fff]|riskScore|Risk score|realized|invalidated/);
    assert.ok(result.doesNotMean.some(line => line.includes('not a sell signal') && line.includes('does not change')));
    assert.doesNotMatch(plain(render(signal, 'en')), /[\u3400-\u9fff]/);
  }
});

test('the shared explanation dispatcher routes RSI to the new trend explanation', () => {
  const signal = signalFixture({ state: 'WATCH', value: 89 });
  const input = { indicatorType: 'rsi', currentData: { asOfDate: signal.asOf, rsiSignal: signal } };
  assert.deepEqual(buildTechnicalExplanation(input), buildStockTrendRsiExplanation(input));
  assert.equal(buildTechnicalExplanation({ indicatorType: 'unknown' }), null);
});
