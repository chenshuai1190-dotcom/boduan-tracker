import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockDecisionModel } from '../server/quote/stockDecisionModel.js';
import { normalizeStockDecisionData } from '../src/lib/stockDecision.js';
import { stockDecisionPresentation } from '../src/lib/stockDecisionPresentation.js';
import { isRegularNyseHoliday } from '../src/lib/quoteRefreshPolicy.js';

const now = Date.parse('2026-09-12T05:00:00Z');
const expectedDate = '2026-09-11';
const wave = [100, 102, 105, 108, 110, 108, 105, 102];
const base = Array.from({ length: 144 }, (_, index) => wave[index % wave.length]);

function history(closes, volumes = [], asOf = expectedDate) {
  const dates = [];
  const day = new Date(`${asOf}T00:00:00Z`);
  while (dates.length < closes.length) {
    const date = day.toISOString().slice(0, 10);
    if (![0, 6].includes(day.getUTCDay()) && !isRegularNyseHoliday(date)) dates.unshift(date);
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return closes.map((close, index) => ({ date: dates[index], open: close, high: close + 1, low: close - 1, close, volume: volumes[index] ?? 100 }));
}

function breakoutHistory(after = [115], afterVolumes = [], asOf = expectedDate) {
  const closes = [...base, 114, ...after];
  const volumes = closes.map(() => 100);
  volumes[base.length] = 800;
  afterVolumes.forEach((volume, index) => { volumes[base.length + 1 + index] = volume; });
  return history(closes, volumes, asOf);
}

function reportData(rows) {
  const asOf = rows.at(-1).date;
  const data = {
    schemaVersion: 1, source: 'EODHD', symbol: 'MSFT', name: 'Example company', currency: 'USD',
    priceBasis: 'adjusted_ohlc', asOf, expectedAsOfDate: expectedDate,
    fetchedAt: new Date(now).toISOString(), stale: asOf < expectedDate,
    model: buildStockDecisionModel({ rows, asOf }),
  };
  const normalized = normalizeStockDecisionData(data, { symbol: 'MSFT', now });
  assert.ok(normalized, 'real model output must pass the client contract before presentation');
  return normalized;
}

const check = (report, id) => report.checks.find(item => item.id === id);

test('complete market data produces a four-check decision without event fields or copy', () => {
  const data = reportData(breakoutHistory());
  assert.equal(data.model.verdict, 'observe');
  assert.equal(Object.hasOwn(data.model, 'events'), false);
  assert.doesNotMatch(JSON.stringify(data.model), /earnings|"events?"/i);
  for (const english of [false, true]) {
    const report = stockDecisionPresentation(data, english);
    assert.equal(report.verdict, 'observe');
    assert.deepEqual(report.checks.map(item => item.id), ['trend', 'position', 'volume', 'momentum']);
    assert.ok(report.checks.every(item => item.status !== 'missing' && item.reading && item.metric && item.detail));
    assert.equal(Object.hasOwn(report, 'events'), false);
    assert.doesNotMatch(JSON.stringify(report), /财报|事件|earnings|"events?"/i);
  }
});

test('a previous volume-backed breakout remains visible when continuation volume falls below the mean', () => {
  const rows = breakoutHistory();
  const data = reportData(rows);
  assert.equal(data.model.volume.state, 'continuation');
  assert.ok(data.model.volume.ratio < 0.8);
  assert.equal(data.model.volume.breakout.active, true);
  assert.equal(data.model.volume.breakout.ratio, 8);
  const original = JSON.stringify(data);
  for (const english of [false, true]) {
    const report = stockDecisionPresentation(data, english);
    const volume = check(report, 'volume');
    assert.equal(volume.status, 'neutral');
    assert.match(volume.reading, english ? /Breakout holding/ : /突破后延续/);
    assert.ok(volume.metric.includes(rows.at(-2).date.slice(5)));
    assert.ok(volume.metric.includes('0.74×'));
    assert.ok(volume.detail.includes(rows.at(-2).date));
    assert.ok(volume.detail.includes('8.00×'));
    assert.match(volume.detail, english ? /still active/ : /尚未失效/);
    assert.match(report.nextSteps[0], english ? /hold the breakout zone/ : /守住突破区/);
    assert.doesNotMatch(volume.reading, /Low-volume rebound|反弹量能偏弱|资料不足/);
  }
  assert.equal(JSON.stringify(data), original, 'formatting must not alter the model or its event anchor');
});

test('a lower-volume pullback stays a confirmation condition despite its still-active breakout', () => {
  const data = reportData(breakoutHistory([113]));
  assert.equal(data.model.volume.state, 'pullback');
  assert.equal(data.model.volume.breakout.active, true);
  for (const english of [false, true]) {
    const report = stockDecisionPresentation(data, english);
    assert.notEqual(report.verdict, 'observe');
    assert.equal(check(report, 'volume').status, 'caution');
    assert.match(check(report, 'volume').reading, english ? /Lower-volume pullback/ : /缩量回踩/);
    assert.match(report.summary, english ? /support confirmation/ : /支撑确认/);
  }
});

test('stale reports retain the historical close date in the assessment and chart data', () => {
  const data = reportData(breakoutHistory([115], [], '2026-09-10'));
  assert.equal(data.stale, true);
  assert.equal(data.expectedAsOfDate, '2026-09-11');
  for (const english of [false, true]) {
    const report = stockDecisionPresentation(data, english);
    assert.equal(report.asOf, '2026-09-10');
    assert.equal(report.dates.at(-1), '2026-09-10');
    assert.equal(report.history.at(-1), data.model.price);
    assert.equal(report.verdict, 'wait');
    assert.match(report.verdictLabel, english ? /Awaiting fresh data/ : /等待更新/);
    assert.ok(report.summary.includes('2026-09-10'));
    assert.doesNotMatch(report.summary, /2026-09-11/);
    assert.doesNotMatch(check(report, 'volume').metric, /今日|今天|\bToday\b/);
  }
});

test('confirmed severe price and momentum risks stay primary in the four-check decision', () => {
  const scenarios = [
    { rows: breakoutHistory([120, 130, 140, 150, 160, 170, 180]), reason: 'rsi_extreme', checkId: 'momentum', zh: /严重超买/, en: /extremely overbought/i },
    { rows: breakoutHistory([115, 108], [100, 400]), reason: 'support_broken', checkId: 'position', zh: /失守原支撑/, en: /lost the former support/i },
  ];
  for (const scenario of scenarios) {
    const data = reportData(scenario.rows);
    assert.equal(data.model.verdict, 'pause');
    assert.equal(data.model.reasons[0], scenario.reason);
    for (const english of [false, true]) {
      const report = stockDecisionPresentation(data, english);
      assert.equal(report.verdict, 'pause');
      assert.match(report.verdictLabel, english ? /Pause conditions triggered/ : /触发暂缓条件/);
      assert.match(report.summary, english ? scenario.en : scenario.zh);
      assert.equal(check(report, scenario.checkId).status, 'caution');
      assert.deepEqual(report.checks.map(item => item.id), ['trend', 'position', 'volume', 'momentum']);
      assert.doesNotMatch(JSON.stringify(report), /财报|事件|earnings|"events?"/i);
    }
  }
});

test('missing momentum, volume and change remain missing rather than showing zero readings', () => {
  const data = reportData(history([100]));
  assert.equal(data.model.momentum.value, null);
  assert.equal(data.model.volume.ratio, null);
  for (const english of [false, true]) {
    const report = stockDecisionPresentation(data, english);
    assert.equal(report.changePct, null);
    assert.equal(report.verdict, 'insufficient');
    assert.equal(check(report, 'momentum').metric, '—');
    assert.equal(check(report, 'momentum').status, 'missing');
    assert.equal(check(report, 'volume').status, 'missing');
    assert.ok(check(report, 'volume').metric.includes('—'));
    assert.doesNotMatch(check(report, 'volume').metric, /0\.00/);
    assert.equal(report.support, null);
    assert.equal(report.resistance, null);
  }
});

test('being inside a support zone cannot invent a low-volume pullback when volume is ordinary', () => {
  const knownSupport = reportData(history(base)).model.position.support;
  assert.ok(knownSupport);
  const insidePrice = (knownSupport.lower + knownSupport.upper) / 2;
  const data = reportData(history([...base, insidePrice]));
  assert.equal(data.model.position.state, 'inside_zone');
  assert.equal(data.model.volume.state, 'neutral');
  assert.equal(data.model.volume.ratio, 1);
  assert.ok(data.model.reasons.includes('price_zone_unconfirmed'));
  assert.equal(data.model.reasons.includes('pullback_unconfirmed'), false);
  for (const english of [false, true]) {
    const report = stockDecisionPresentation(data, english);
    assert.equal(check(report, 'volume').status, 'neutral');
    assert.doesNotMatch(report.summary, english ? /lower-volume pullback/i : /缩量回踩/);
  }
});

test('inside a resistance zone displays the containing resistance rather than distant support', () => {
  const knownResistance = reportData(history(base)).model.position.resistance;
  assert.ok(knownResistance);
  const insidePrice = (knownResistance.lower + knownResistance.upper) / 2;
  const data = reportData(history([...base, insidePrice]));
  assert.equal(data.model.position.state, 'inside_zone');
  const { support, resistance } = data.model.position;
  assert.ok(support.upper < data.model.price);
  assert.ok(resistance.lower <= data.model.price && data.model.price <= resistance.upper);
  const money = value => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  for (const english of [false, true]) {
    const position = check(stockDecisionPresentation(data, english), 'position');
    assert.equal(position.metric, `${money(resistance.lower)} – ${money(resistance.upper)}`);
    assert.notEqual(position.metric, `${money(support.lower)} – ${money(support.upper)}`);
  }
});
