import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMaTechnicalExplanation } from '../src/lib/maTechnicalExplanation.js';
import { deriveStockMaStructure, deriveStockMaTrend } from '../src/lib/stockMaStructure.js';

const asOfDate = '2026-09-14';
const dates = ['2026-09-04', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', asOfDate];
function linear(first, last) {
  return dates.map((_, index) => first.map((value, field) => value + (last[field] - value) * index / 5));
}
function gapPairs(gaps) {
  return gaps.map((gap, index) => [(100 + index) * (1 + gap), 100 + index]);
}
function input(pairs, { close = 130, ma200 = 90 } = {}) {
  const history = pairs.map(([ma30, ma60], index) => ({ date: dates[index], close, ma30, ma60, ma200 }));
  const latestRow = history.at(-1);
  return { ticker: 'MSFT', indicatorType: 'trendChange',
    currentData: { asOfDate, currency: 'USD', history, latestRow },
    technicalState: {
      maStructure: deriveStockMaStructure(latestRow, { asOfDate }),
      maTrend: deriveStockMaTrend(history, { asOfDate }),
    } };
}
function allText(result) {
  return [result.title, result.status, result.summary, ...result.rows.flatMap(row => [row.label, row.value]), ...result.why,
    ...result.plain, ...result.doesNotMean, ...(result.ruleDetails?.lines || []),
    ...(result.ruleDetails?.rows || []).flatMap(row => [row.label, row.value])].join('\n');
}
const ruleText = result => [...(result.ruleDetails?.rows || []).flatMap(row => [row.label, row.value]), ...(result.ruleDetails?.lines || [])].join(' ');
const ruleRow = (result, suffix) => result.ruleDetails?.rows.find(row => row.label === suffix || row.label.endsWith(' · ' + suffix));
const examples = [
  ['bullish_strengthening', '多头强化', linear([105, 100], [115, 102]), {}],
  ['bullish_weakening', '多头减弱', linear([125, 110], [115, 105]), {}],
  ['bearish_strengthening', '空头强化', linear([110, 125], [100, 120]), { close: 80, ma200: 130 }],
  ['bearish_weakening', '空头减弱', linear([90, 115], [100, 120]), { close: 80, ma200: 130 }],
  ['improving', '结构改善', linear([100, 120], [110, 122]), { close: 150, ma200: 130 }],
  ['structural_weakening', '结构转弱', linear([110, 122], [100, 120]), { close: 150, ma200: 130 }],
  ['strengthening', '短中期转强', [[998, 1000], [998, 1000], [998, 1000], [998, 1000], [998, 1000], [1001, 1000]], { close: 1200, ma200: 900 }],
  ['weakening', '短中期转弱', [[1002, 1000], [1002, 1000], [1002, 1000], [1002, 1000], [1002, 1000], [999, 1000]], { close: 1200, ma200: 900 }],
  ['stable', '趋势稳定', gapPairs([0.1, 0.1, 0.1, 0.1, 0.0994, 0.0988]), {}],
];

test('four alignment types and exact MA200 equality retain their supplied state and explain positions', () => {
  const cases = [
    ['bullish', '多头排列', { close: 120, ma30: 110, ma60: 100, ma200: 90 }],
    ['bearish', '空头排列', { close: 80, ma30: 90, ma60: 100, ma200: 110 }],
    ['long_term_up', '长期趋势向上', { close: 120, ma30: 100, ma60: 110, ma200: 90 }],
    ['long_term_down', '长期趋势向下', { close: 80, ma30: 110, ma60: 100, ma200: 90 }],
    ['at_ma200', '位于MA200', { close: 90, ma30: 110, ma60: 100, ma200: 90 }],
  ];
  for (const [status, label, values] of cases) {
    const latestRow = { date: asOfDate, ...values };
    const state = deriveStockMaStructure(latestRow, { asOfDate });
    assert.equal(state.status, status);
    const result = buildMaTechnicalExplanation({ ticker: 'META', indicatorType: 'maStructure',
      currentData: { asOfDate, currency: 'USD', latestRow }, technicalState: { maStructure: state } });
    assert.equal(result.status, label);
    assert.equal(result.title, label, 'the sheet already displays the ticker separately');
    assert.equal(result.incomplete, false);
    assert.equal(result.asOfDate, asOfDate);
    assert.equal(result.rows.length, 4);
    assert.ok(result.why.length > 0 && result.plain.length > 0 && result.doesNotMean.length > 0);
    assert.equal(result.rows[0].label, '最新收盘价');
    assert.match(result.rows[0].value, /^\$\d+\.\d{2}$/);
    assert.equal(result.doesNotMean.length, 1);
    assert.ok(result.summary.length > 0);
    assert.deepEqual(result.currentView, []);
    assert.equal(result.eventDetails, null);
  }
});

test('all nine trend outcomes explain existing decisions in Chinese and English without exposing field names', () => {
  for (const [status, label, pairs, overrides] of examples) {
    const data = input(pairs, overrides);
    assert.equal(data.technicalState.maTrend.status, status);
    const before = structuredClone(data);
    for (const language of ['zh', 'en']) {
      const result = buildMaTechnicalExplanation({ ...data, language });
      assert.equal(result.incomplete, false, status + ' ' + language);
      assert.equal(result.asOfDate, asOfDate);
      assert.ok(result.why.length > 0 && result.plain.length > 0 && result.doesNotMean.length > 0);
      assert.deepEqual(Object.keys(result), ['title', 'status', 'asOfDate', 'rows', 'why', 'plain', 'doesNotMean', 'incomplete',
        'summary', 'currentView', 'ruleDetails', 'eventDetails']);
      assert.ok(result.summary.length > 0);
      assert.deepEqual(result.currentView, []);
      assert.equal(result.eventDetails, null);
      assert.equal(result.doesNotMean.length, 1);
      assert.ok(result.why.length <= 2 && result.plain.length <= 2, 'default explanation remains concise');
      if (language === 'zh') assert.equal(result.status, label);
      else assert.doesNotMatch(allText(result), /[\u4e00-\u9fff]/);
      assert.equal(result.title, result.status);
      assert.doesNotMatch(result.title, /MSFT/);
      assert.doesNotMatch(allText(result), /ma30Slope|gapChange|gapAtComparison|contractionPersistent|bullish_weakening|technicalState/);
    }
    assert.deepEqual(data, before, status + ': explanations must be read-only');
  }
});

test('MA30-down weakening is explained independently of persistence', () => {
  const data = input(linear([120, 110], [115, 100]));
  assert.equal(data.technicalState.maTrend.contractingDays, 0);
  const result = buildMaTechnicalExplanation(data);
  assert.equal(result.status, '多头减弱');
  assert.equal(result.why[0], 'MA30最近5个交易日明显回落，短期平均价格开始下降。');
  assert.doesNotMatch([...result.why, ...result.plain].join(' '), /触发|达标/);
  assert.equal(ruleRow(result, '直接减弱路径').value, 'MA30最近5日 < −0.1000%');
  assert.match(ruleRow(result, '持续性要求').value, /不要求持续收窄/);
  assert.match(result.summary, /MA30近期已明显回落/);
  assert.doesNotMatch(ruleText(result), /满足至少3次/);
});

test('rising averages can weaken through the persistent normalized-gap path', () => {
  const data = input(gapPairs([0.1, 0.1, 0.0996, 0.0992, 0.0988, 0.0988]));
  assert.ok(data.technicalState.maTrend.ma30Slope > 0);
  const result = buildMaTechnicalExplanation(data);
  assert.equal(result.status, '多头减弱');
  assert.equal(result.summary, '多头结构仍在，但MA30相对MA60的领先优势正在收窄。');
  assert.equal(ruleRow(result, '有效收窄次数').value, '≥ 3 / 4次');
  assert.equal(ruleRow(result, '单次有效收窄').value, '≥ 0.0200个百分点');
  assert.doesNotMatch(result.why.join(' '), /MA30.*下跌/);
  assert.match(result.why.join(' '), /MA30和MA60仍在上涨.*MA60近期上涨更快/);
  assert.equal(result.rows.some(row => row.label === '当前领先幅度'), true);
});

test('every structure and trend has a distinct plain-language meaning and state-specific limit', () => {
  const descriptions = new Set();
  const limits = new Set();
  for (const [, , pairs, overrides] of examples) {
    const result = buildMaTechnicalExplanation(input(pairs, overrides));
    descriptions.add(result.plain[0]);
    limits.add(result.doesNotMean[0]);
  }
  assert.equal(descriptions.size, 9);
  assert.equal(limits.size, 9);
  const structureMeanings = new Set();
  for (const values of [
    { close: 120, ma30: 110, ma60: 100, ma200: 90 },
    { close: 80, ma30: 90, ma60: 100, ma200: 110 },
    { close: 120, ma30: 100, ma60: 110, ma200: 90 },
    { close: 80, ma30: 110, ma60: 100, ma200: 90 },
    { close: 90, ma30: 110, ma60: 100, ma200: 90 },
  ]) {
    const latestRow = { date: asOfDate, ...values };
    const result = buildMaTechnicalExplanation({ indicatorType: 'maStructure', currentData: { asOfDate, latestRow },
      technicalState: { maStructure: deriveStockMaStructure(latestRow, { asOfDate }) } });
    structureMeanings.add(result.plain[0]);
    assert.equal(result.doesNotMean.length, 1);
    assert.doesNotMatch(result.plain[0], /均线正在抬升|均线正在下降/);
  }
  assert.equal(structureMeanings.size, 5);
});

test('expansion counts are observations and are never imposed as a strengthening condition', () => {
  const data = input(gapPairs([0.1, 0.1, 0.1, 0.1, 0.1, 0.102]));
  assert.equal(data.technicalState.maTrend.status, 'bullish_strengthening');
  const result = buildMaTechnicalExplanation(data);
  assert.equal(result.summary, '多头结构仍在，短期领先优势扩大。');
  assert.equal(result.ruleDetails.rows.find(row => row.label === '系统观察').layout, 'narrative');
  assert.equal(ruleRow(result, '条件关系').layout, 'narrative');
  assert.equal(ruleRow(result, '判断结果').layout, 'narrative');
  assert.equal(ruleRow(result, 'MA30变化').layout, undefined, 'numeric comparisons retain their two-column layout');
  const observation = result.ruleDetails.rows.find(row => row.label.includes('有效扩大'));
  assert.match(observation.label, /仅观察/);
  assert.equal(observation.value, '1 / 4次');
  assert.doesNotMatch(result.why.join(' '), /至少3次|需要3次|满足3次/);
  assert.equal(result.rows.some(row => row.label.includes('有效收窄')), false);
  assert.equal(result.rows.some(row => row.label.includes('有效扩大')), false, 'observation-only counts stay in the rule layer');
});

test('bullish strengthening permits a small MA60 decline and does not claim both averages rose', () => {
  const data = input(linear([105, 100], [110, 99.95]));
  assert.equal(data.technicalState.maTrend.status, 'bullish_strengthening');
  assert.ok(data.technicalState.maTrend.ma60Slope < 0);
  const result = buildMaTechnicalExplanation(data);
  assert.equal(ruleRow(result, 'MA60变化').value, '≥ −0.1000%');
  assert.doesNotMatch(result.why.join(' '), /双双上涨|两条均线.*上涨|MA60上涨/);
});

test('stable gives unmet gates instead of claiming the averages barely moved', () => {
  const data = input(gapPairs([0.1, 0.1, 0.1, 0.1, 0.0994, 0.0988]));
  assert.ok(data.technicalState.maTrend.ma30Slope > 0.01);
  const result = buildMaTechnicalExplanation(data);
  assert.equal(result.status, '趋势稳定');
  assert.equal(ruleRow(result, '持续性结果').value, '仅2 / 4次，未达到至少3次。');
  assert.match(result.why.join(' '), /近期收窄还不够持续/);
  assert.match(result.plain.join(' '), /均线仍可能上涨或下跌/);
  assert.doesNotMatch(result.plain.join(' '), /均线没有明显变化|均线变化很小|均线横盘/);
  const blockedStrengthening = buildMaTechnicalExplanation(input(linear([110, 100], [112, 99])));
  assert.equal(blockedStrengthening.status, '趋势稳定');
  assert.match(ruleRow(blockedStrengthening, '未满足多头强化').value, /MA60 ≥ −0.1000%/);
});

test('structural weakening distinguishes the long-term-up OR path from the other AND path', () => {
  const up = input(linear([110, 100], [112, 104]), { close: 150, ma200: 130 });
  assert.equal(up.technicalState.maStructure.status, 'long_term_up');
  assert.ok(up.technicalState.maTrend.ma30Slope > 0);
  const upExplanation = buildMaTechnicalExplanation(up);
  assert.equal(upExplanation.status, '结构转弱');
  assert.equal(ruleRow(upExplanation, '条件关系').value, '长期趋势向上时，任一满足即可。');
  assert.doesNotMatch(upExplanation.why.join(' '), /MA30下跌/);
  const down = input(linear([120, 100], [110, 105]), { close: 80, ma200: 130 });
  assert.equal(down.technicalState.maStructure.status, 'long_term_down');
  const downExplanation = buildMaTechnicalExplanation(down);
  assert.equal(downExplanation.status, '结构转弱');
  assert.equal(ruleRow(downExplanation, '条件关系').value, '两项同时满足。');
});

test('cross explanations include dates, record ages, confirmation thresholds, and priority', () => {
  for (const [, , pairs, overrides] of examples.filter(([status]) => ['strengthening', 'weakening'].includes(status))) {
    const data = input(pairs, overrides);
    const result = buildMaTechnicalExplanation(data);
    assert.equal(result.rows.find(row => row.label === '交叉确认日').value, asOfDate);
    assert.equal(result.rows.find(row => row.label === '确认后交易日').value, '0日（当日计0）');
    assert.match(ruleRow(result, '交叉确认幅度').value, /^[≥≤] [＋+−]0.1000%$/);
    assert.match(ruleRow(result, '有效期限').value, /不足5个完整交易日.*当前仍满足确认幅度/);
    assert.match(ruleRow(result, '判断优先级').value, /近期有效交叉优先/);
    assert.doesNotMatch(result.why.join(' '), /至少3次/);
    assert.equal(result.rows.some(row => row.label.includes('收窄') || row.label.includes('扩大（仅观察）')), false);
  }
});

test('unavailable states hide missing values and never turn absence into zero or safety', () => {
  for (const indicatorType of ['maStructure', 'trendChange']) {
    const result = buildMaTechnicalExplanation({ indicatorType, currentData: null, technicalState: null });
    assert.equal(result.status, '—');
    assert.equal(result.title, indicatorType === 'maStructure' ? '均线结构' : '趋势变化');
    assert.equal(result.incomplete, true);
    assert.deepEqual(result.rows, []);
    assert.match(result.doesNotMean.join(' '), /不足不代表零、正常或没有风险/);
    assert.doesNotMatch(allText(result), /0\.00|无风险|趋势稳定/);
  }
  const data = input(linear([105, 100], [115, 102]));
  data.currentData.latestRow = { ...data.currentData.latestRow, ma30: null };
  data.technicalState.maTrend = { ...data.technicalState.maTrend, gapChange: null, contractingDays: null, contractionPersistent: null };
  const partial = buildMaTechnicalExplanation(data);
  assert.equal(partial.incomplete, true);
  assert.equal(partial.rows.some(row => row.label === 'MA30'), false);
  assert.equal(partial.rows.some(row => row.label === 'MA30相对MA60位置变化'), false);
  assert.equal(partial.rows.some(row => row.label.includes('有效收窄')), false);
  assert.match(partial.summary, /解释尚不完整/);
});

test('different-day judgments or prices are not passed off as current completed-day evidence', () => {
  const data = input(linear([105, 100], [115, 102]));
  const stale = structuredClone(data);
  stale.technicalState.maTrend.asOfDate = '2026-09-11';
  const result = buildMaTechnicalExplanation(stale);
  assert.equal(result.incomplete, true);
  assert.match(ruleText(result), /缺少同一完整交易日/);
  assert.equal(result.rows.some(row => row.label === 'MA30最近5日'), false);
  const futurePrice = structuredClone(data);
  futurePrice.currentData.latestRow.date = '2026-09-15';
  const missing = buildMaTechnicalExplanation(futurePrice);
  assert.equal(missing.incomplete, true);
  assert.equal(missing.rows.some(row => row.label === '最新收盘价'), false);
});

test('RSI and risk metadata do not change a moving-average explanation', () => {
  const data = input(linear([105, 100], [115, 102]));
  const expected = buildMaTechnicalExplanation(data);
  data.currentData.rsiSignal = { value: 1, divergenceState: 'CONFIRMED', divergenceRiskLevel: 'HIGH' };
  assert.deepEqual(buildMaTechnicalExplanation(data), expected);
});

test('default percentages use two decimals while rule evidence retains four decimals and actual thresholds', () => {
  const data = input(gapPairs([0.1, 0.1, 0.0996, 0.0992, 0.0988, 0.0988]));
  const result = buildMaTechnicalExplanation(data);
  const defaults = result.rows.filter(row => row.value.endsWith('%'));
  assert.equal(defaults.length, 4, 'MA30/MA60 changes and initial/current relative positions');
  for (const row of defaults) assert.match(row.value, /^[+-]?\d+\.\d{2}%$/);
  const detailedPositions = result.ruleDetails.rows.filter(row => /当前数据 · (5日前|当前)领先幅度/.test(row.label));
  assert.equal(detailedPositions.length, 2);
  for (const row of detailedPositions) assert.match(row.value, /^[+-]?\d+\.\d{4}%$/);
  assert.equal(ruleRow(result, '单次有效收窄').value, '≥ 0.0200个百分点');
  assert.equal(ruleRow(result, '5日领先幅度收窄').value, '> 0.1000个百分点');
  assert.equal(result.rows.some(row => row.label === 'MA30' || row.label === 'MA60' || row.label === 'MA200'), false);
  assert.equal(result.ruleDetails.rows.some(row => /MA200|收盘价/.test(row.label)), false);
  assert.match(result.ruleDetails.lines.at(-1), /（MA30−MA60）÷MA60/);
  assert.equal(result.rows.find(row => row.label === '近期有效收窄').value, '3 / 4次');
});

test('a COST-style positive-to-negative relative position is described without claiming a confirmed down-cross', () => {
  const ma60Old = 1000;
  const ma60Now = ma60Old * (1 - 0.006175);
  const pairs = linear([ma60Old * (1 + 0.002352), ma60Old], [ma60Now * (1 - 0.000606), ma60Now]);
  const data = input(pairs, { close: 1100, ma200: 900 });
  data.ticker = 'COST';
  assert.equal(data.technicalState.maTrend.status, 'structural_weakening');
  assert.equal(data.technicalState.maTrend.crossDirection, null);
  assert.ok(data.technicalState.maTrend.gapAtComparison > 0 && data.technicalState.maTrend.gapToday < 0);
  const result = buildMaTechnicalExplanation(data);
  assert.match(result.plain.join(' '), /从高于MA60转为低于MA60/);
  assert.doesNotMatch(allText(result), /有效下穿|确认下穿|始终.*下方|落后幅度扩大/);
  assert.equal(result.rows.find(row => row.label === '5日前相对位置').value, '+0.24%');
  assert.equal(result.rows.find(row => row.label === '当前相对位置').value, '-0.06%');
  assert.equal(result.rows.some(row => row.label.includes('领先')), false);
  const bearishData = input(pairs, { close: 980, ma200: 1100 });
  bearishData.ticker = 'COST';
  assert.equal(bearishData.technicalState.maTrend.status, 'bearish_strengthening');
  const bearish = buildMaTechnicalExplanation(bearishData);
  assert.equal(bearish.summary, '空头结构仍在，而且MA30相对MA60正在进一步走弱。');
  assert.match(bearish.why[0], /MA30近5日跌得更快，并从MA60上方转到下方/);
  assert.doesNotMatch(allText(bearish), /有效下穿|确认下穿|始终.*下方|相对落后幅度扩大/);
  assert.equal(bearish.rows.some(row => row.label.includes('领先')), false);
});

test('only observed rising averages with faster MA60 growth use the catching-up interpretation', () => {
  const rising = input(gapPairs([0.1, 0.1, 0.0996, 0.0992, 0.0988, 0.0988]));
  const result = buildMaTechnicalExplanation(rising);
  assert.match(result.why[0], /MA30和MA60仍在上涨.*MA60近期上涨更快/);
  const falling = buildMaTechnicalExplanation(input(linear([125, 110], [115, 105])));
  assert.doesNotMatch([...falling.why, ...falling.plain].join(' '), /两条均线都在涨|MA30和MA60仍在上涨|MA60涨幅更快|MA60近期上涨更快/);
});

test('bearish weakening from MA30 alone does not invent relative convergence', () => {
  const data = input(linear([90, 110], [92, 115]), { close: 80, ma200: 130 });
  assert.equal(data.technicalState.maTrend.status, 'bearish_weakening');
  assert.ok(data.technicalState.maTrend.ma30Slope > 0);
  assert.ok(data.technicalState.maTrend.gapChange < 0);
  const result = buildMaTechnicalExplanation(data);
  assert.match(result.why[0], /MA30近期明显回升/);
  assert.doesNotMatch([...result.why, ...result.plain].join(' '), /正在追近|差距正在缩小|持续收窄/);
  assert.equal(ruleRow(result, '条件关系').value, '任一满足即可，不要求持续收窄。');
  assert.deepEqual(result.rows.map(row => row.label), ['MA30最近5日', 'MA60最近5日', '5日前相对位置', '当前相对位置']);
});
