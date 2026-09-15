import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRsiTechnicalExplanation } from '../src/lib/rsiTechnicalExplanation.js';
import { STOCK_RSI_DIVERGENCE_VERSION, STOCK_RSI_RULES } from '../src/lib/stockRsiConfig.js';
import { STOCK_RSI_RISK_VERSION } from '../src/lib/stockRsiRiskConfig.js';
import { stockRsiPresentation } from '../src/lib/stockRsiPresentation.js';

function fixture({ state = 'CONFIRMED', rsi = 62.99955221115958, level = 'LOW', score = 30 } = {}) {
  const asOfDate = '2026-09-14';
  const event = {
    high1: { date: '2026-08-10', price: 512.7646878690274, rsi: 88.5946307443805 },
    high2: { date: '2026-08-28', price: 517.78, rsi: 83.53484091969389 },
    formedAt: '2026-09-02', confirmedAt: state === 'FORMING' ? null : '2026-09-02',
    realizedAt: state === 'REALIZED' ? '2026-09-11' : null,
    invalidatedAt: state === 'INVALIDATED' ? '2026-09-11' : null,
    maxDrawdownPct: state === 'REALIZED' ? 9.2 : state === 'FORMING' ? 1 : 5.046544864614314,
  };
  const signal = {
    period: 6, value: rsi, asOf: asOfDate, priceBasis: 'adjusted_close', divergenceVersion: STOCK_RSI_DIVERGENCE_VERSION,
    divergenceState: state, divergenceEvent: state === 'NONE' || state === null ? null : event,
    divergenceDate: state === 'NONE' || state === null ? null : state === 'FORMING' ? event.formedAt
      : state === 'CONFIRMED' ? event.confirmedAt : state === 'REALIZED' ? event.realizedAt : event.invalidatedAt,
    divergenceConfirmationStrength: ['NONE', 'FORMING', null].includes(state) ? null : 'BASIC',
    divergenceRiskScore: score, divergenceRiskLevel: level,
    divergenceDebug: {
      version: STOCK_RSI_RISK_VERSION, status: 'ready', asOf: asOfDate, state,
      riskScore: score, riskLevel: level, currentPrice: 505.41, currentRsi: rsi,
      high1Date: event.high1.date, high1Price: event.high1.price, high1Rsi: event.high1.rsi,
      high2Date: event.high2.date, high2Price: event.high2.price, high2Rsi: event.high2.rsi,
      drawdownFromHigh2: -0.023890455405770727, maxDrawdownFromHigh2: 0.05046544864614314,
      priceRecoveryRatio: 0.5265989284347493, rsiRecoveryGap: event.high1.rsi - rsi,
      priceVsMA30: 0.02, ma30Slope: 0.013,
      trendStructure: 'bullish', trendChange: 'bullish_strengthening',
      confirmedAge: state === 'FORMING' ? null : 7,
      priceRecoveryAdjustment: -5, rsiRecoveryAdjustment: 0,
      riskContributions: { stateBase: state === 'FORMING' ? 30 : 45, divergenceStrength: 5, ma30Adjustment: 0, trendAdjustment: -15, recoveryAdjustment: -5, timeDecay: 0 },
    },
  };
  return {
    ticker: 'MSFT', language: 'zh',
    currentData: { asOfDate, currency: 'USD', latestRow: { date: asOfDate, close: 505.41 }, rsiSignal: signal },
    technicalState: {
      maStructure: { asOfDate, status: 'bullish' },
      maTrend: { asOfDate, status: 'bullish_strengthening', ma30Slope: 0.013 },
    },
  };
}
const defaultText = result => [result.summary, ...result.why, ...result.plain, ...result.currentView, ...result.doesNotMean, ...result.rows.map(row => `${row.label} ${row.value}`)].join('\n');
const joined = result => [defaultText(result), ...(result.ruleDetails?.lines || []), ...(result.eventDetails?.lines || []), ...(result.eventDetails?.rows || []).map(row => `${row.label} ${row.value}`), ...(result.eventDetails?.scoreBreakdown?.rows || []).map(row => `${row.label} ${row.value}`)].join('\n');
const eventRows = result => result.eventDetails?.rows || [];
const eventLines = result => result.eventDetails?.lines || [];
const ruleLines = result => result.ruleDetails?.lines || [];
const scoreRows = result => result.eventDetails?.scoreBreakdown?.rows || [];
const riskRow = result => result.rows.find(row => row.label === '当前背离风险' || row.label === 'Current divergence risk');

test('confirmed explanation renders real event evidence and actual risk reductions without changing inputs', () => {
  const input = fixture();
  const before = structuredClone(input);
  const result = buildRsiTechnicalExplanation(input);
  assert.equal(result.title, 'RSI(6) · 动量');
  assert.equal(result.status, '中性 · 顶背离确认');
  assert.equal(result.incomplete, false);
  assert.equal(riskRow(result).value, '低');
  assert.ok(result.rows.some(row => row.label === '风险评分' && row.value === '30 / 100'));
  assert.equal(result.rows.length, 5);
  assert.deepEqual(result.rows.slice(0, 3), [{ label: 'RSI(6)', value: '63.0' }, { label: '当前区间', value: '中性' }, { label: '动量状态', value: '顶背离确认' }]);
  assert.ok(eventRows(result).some(row => row.value === '2026-08-10 · $512.76 · RSI 88.6'));
  assert.ok(eventRows(result).some(row => row.value === '2026-08-28 · $517.78 · RSI 83.5'));
  assert.ok(eventRows(result).some(row => row.label === 'RSI下降' && row.value === '5.1点'));
  assert.ok(eventRows(result).some(row => row.label === '确认日期' && row.value === '2026-09-02'));
  assert.ok(eventRows(result).some(row => row.value === '7个交易日'));
  assert.ok(eventRows(result).some(row => row.value === '5.05%'));
  assert.ok(eventRows(result).some(row => row.value === '52.7%'));
  assert.ok(scoreRows(result).some(row => row.label === '趋势变化' && row.value === '-15'));
  assert.ok(scoreRows(result).some(row => row.label === '价格与RSI恢复' && row.value === '-5'));
  assert.ok(result.plain.some(text => text.includes('历史背离仍然有效') && text.includes('已经明显削弱它的威胁')));
  assert.ok(result.why.some(text => text.includes('价格形成更高高点') && text.includes('价格行为确认')));
  assert.ok(result.currentView.some(text => text.includes('多头排列') && text.includes('多头强化')));
  assert.ok(result.currentView.some(text => text.includes('约52.7%')));
  assert.deepEqual(input, before);
  assert.deepEqual(buildRsiTechnicalExplanation(input), result, 'fixed templates are deterministic');
});

test('risk explanation follows the supplied recovery evidence rather than a hardcoded stock case', () => {
  const input = fixture({ score: 25 });
  input.ticker = 'COST';
  const debug = input.currentData.rsiSignal.divergenceDebug;
  debug.priceRecoveryRatio = 0.82;
  debug.rsiRecoveryGap = 1.5;
  debug.priceRecoveryAdjustment = -15;
  debug.rsiRecoveryAdjustment = -10;
  debug.riskContributions.recoveryAdjustment = -20;
  const result = buildRsiTechnicalExplanation(input);
  assert.equal(riskRow(result).value, '低');
  assert.ok(result.rows.some(row => row.label === '风险评分' && row.value === '25 / 100'));
  assert.ok(scoreRows(result).some(row => row.label === '价格与RSI恢复' && row.value === '-20'));
  assert.ok(result.currentView.some(text => text.includes('82.0%')));
  assert.equal(joined(result).includes('52.7%'), false);
  assert.equal(joined(result).includes('MSFT'), false);
});

test('confirmed low, medium and high risk retain the same historical lifecycle', () => {
  for (const [level, score, word] of [['LOW', 30, '低'], ['MEDIUM', 55, '中'], ['HIGH', 75, '高']]) {
    const result = buildRsiTechnicalExplanation(fixture({ level, score }));
    assert.equal(result.status, '中性 · 顶背离确认');
    assert.equal(riskRow(result).value, word);
    assert.ok(result.rows.some(row => row.label === '风险评分' && row.value === `${score} / 100`));
    assert.equal(result.incomplete, false);
  }
});

test('RSI zone boundaries and NONE wording reuse existing presentation including real zero RSI', () => {
  for (const [rsi, zone] of [[80, '超买'], [79.9, '中性'], [20, '超卖'], [20.1, '中性'], [0, '超卖']]) {
    const input = fixture({ state: 'NONE', rsi });
    const result = buildRsiTechnicalExplanation(input);
    const presentation = stockRsiPresentation(input.currentData.rsiSignal);
    assert.equal(result.status, `${zone} · ${presentation.momentumLabel}`);
    assert.ok(result.summary.includes('没有检测到有效顶背离'));
    assert.ok(result.plain.some(text => text.includes('只表示当前没有有效顶背离') || text.includes('超买 ≠ 顶背离')));
    assert.equal(riskRow(result), undefined, 'NONE cannot display an injected stale risk score');
    assert.equal(result.incomplete, false);
    assert.equal(result.rows.some(row => row.label === '最大收盘回撤'), false);
    assert.equal(result.rows.length, 3);
    assert.equal(result.eventDetails, null);
    assert.deepEqual(result.currentView, []);
  }
  assert.ok(buildRsiTechnicalExplanation(fixture({ state: 'NONE', rsi: 84 })).plain.some(text => text.includes('超买 ≠ 马上下跌')));
  assert.ok(buildRsiTechnicalExplanation(fixture({ state: 'NONE', rsi: 18 })).doesNotMean.some(text => text.includes('超卖不等于马上反弹')));
  assert.ok(buildRsiTechnicalExplanation(fixture({ state: 'NONE', rsi: 84 })).summary.includes('短期动量偏热'));
});

test('forming remains a warning rather than an assertion that the trend ended', () => {
  const result = buildRsiTechnicalExplanation(fixture({ state: 'FORMING', rsi: 84, score: 35 }));
  assert.equal(result.status, '超买 · 顶背离形成');
  assert.ok(result.summary.includes('此前价格形成更高高点'));
  assert.ok(result.doesNotMean.some(text => text.includes('不代表趋势已经结束')));
  assert.equal(eventRows(result).some(row => row.label === '确认日期' || row.label === '确认后经过'), false);
});

test('formation and confirmation explain configured thresholds alongside the actual two highs', () => {
  for (const state of ['FORMING', 'CONFIRMED']) {
    const result = buildRsiTechnicalExplanation(fixture({ state }));
    const reasoning = ruleLines(result).join('\n');
    assert.equal(reasoning.includes('$512.76') || reasoning.includes('$517.78'), false, 'rules must not mix actual stock observations');
    assert.ok(eventRows(result).some(row => row.value.includes('$512.76') && row.value.includes('88.6')));
    assert.ok(eventRows(result).some(row => row.value.includes('$517.78') && row.value.includes('83.5')));
    assert.ok(reasoning.includes(`${STOCK_RSI_RULES.PRICE_HIGHER_HIGH_THRESHOLD * 100}%`));
    assert.ok(reasoning.includes(`RSI至少下降${STOCK_RSI_RULES.MIN_RSI_DIFFERENCE}点`));
    assert.ok(reasoning.includes(`前高RSI不低于${STOCK_RSI_RULES.DIVERGENCE_MIN_RSI}`));
    assert.ok(reasoning.includes(`${STOCK_RSI_RULES.CONFIRMATION_DRAWDOWN * 100}%`));
  }
});

test('realized and invalidated are historical terminal events and never show active risk', () => {
  for (const [state, label, dateLabel, disclaimer] of [
    ['REALIZED', '顶背离已兑现', '兑现日期', '不代表股价已经见底'],
    ['INVALIDATED', '顶背离失效', '失效日期', '不代表以后不会调整'],
  ]) {
    const result = buildRsiTechnicalExplanation(fixture({ state, level: 'HIGH', score: 99, rsi: 30.3 }));
    assert.equal(result.status, `中性 · ${label}`);
    assert.equal(riskRow(result), undefined);
    assert.equal(result.incomplete, false);
    assert.ok(eventRows(result).some(row => row.label === dateLabel && row.value === '2026-09-11'));
    assert.ok(eventRows(result).some(row => row.label === '确认日期'));
    assert.ok(result.doesNotMean.some(text => text.includes(disclaimer)));
    assert.equal(result.rows.length, 3);
    assert.deepEqual(result.currentView, []);
  }
});

test('realization explains both actual rules without inventing the RSI on its realization date', () => {
  const input = fixture({ state: 'REALIZED', rsi: 67 });
  input.currentData.rsiSignal.divergenceEvent.maxDrawdownPct = 5.5;
  const result = buildRsiTechnicalExplanation(input);
  const reasoning = ruleLines(result).join('\n');
  assert.ok(reasoning.includes(`最大收盘回撤达到${STOCK_RSI_RULES.REALIZED_DRAWDOWN * 100}%`));
  assert.ok(reasoning.includes(`或RSI(6)降至${STOCK_RSI_RULES.REALIZED_RSI_THRESHOLD}及以下`));
  assert.equal(reasoning.includes('当日RSI为'), false);
  assert.equal(reasoning.includes('因RSI降至'), false, 'the stored event does not identify which condition triggered realization');
  assert.ok(result.summary.includes('历史提示'));
  assert.ok(result.why.some(text => text.includes('未单独标记当时的触发原因')));
});

test('invalidation templates distinguish the existing forming and confirmed paths', () => {
  const afterConfirmation = buildRsiTechnicalExplanation(fixture({ state: 'INVALIDATED' }));
  assert.ok(ruleLines(afterConfirmation).some(text => text.includes(`至少${STOCK_RSI_RULES.INVALIDATION_PRICE_THRESHOLD * 100}%`)
    && text.includes(`${STOCK_RSI_RULES.RSI_RECOVERY_TOLERANCE}点以内`)));
  const forming = fixture({ state: 'INVALIDATED' });
  forming.currentData.rsiSignal.divergenceEvent.confirmedAt = null;
  forming.currentData.rsiSignal.divergenceConfirmationStrength = null;
  const beforeConfirmation = buildRsiTechnicalExplanation(forming);
  assert.equal(beforeConfirmation.incomplete, false);
  assert.ok(ruleLines(beforeConfirmation).some(text => text.includes('价格超过第二高点') && text.includes('RSI恢复至前高RSI水平或更高')));
  assert.equal(ruleLines(beforeConfirmation).some(text => text.includes('确认后失效') || text.includes('2点以内')), false);
});

test('missing risk debug preserves valid RSI and lifecycle while marking the explanation incomplete', () => {
  const input = fixture();
  delete input.currentData.rsiSignal.divergenceDebug;
  const result = buildRsiTechnicalExplanation(input);
  assert.equal(result.status, '中性 · 顶背离确认');
  assert.equal(result.incomplete, true);
  assert.equal(riskRow(result), undefined);
  assert.ok(eventRows(result).some(row => row.label === '前一高点'));
  assert.equal(result.plain.includes('当前数据不足，暂时无法生成完整技术解释。'), false, 'the shared sheet owns the incomplete message');
  assert.equal(result.rows.some(row => row.value === '0分'), false);
});

test('stale, mismatched and partial debug cannot label current risk', () => {
  for (const mutate of [
    debug => { debug.asOf = '2026-09-11'; },
    debug => { debug.version = 'obsolete'; },
    debug => { debug.state = 'FORMING'; },
    debug => { debug.high2Date = '2026-08-27'; },
    debug => { debug.high2Price += 1; },
    debug => { debug.currentRsi = 10; },
    debug => { debug.riskScore = 75; },
    debug => { debug.riskLevel = 'HIGH'; },
    debug => { debug.trendChange = 'weakening'; },
    debug => { debug.riskContributions.recoveryAdjustment = null; },
    debug => { debug.confirmedAge = null; },
  ]) {
    const input = fixture(); mutate(input.currentData.rsiSignal.divergenceDebug);
    const result = buildRsiTechnicalExplanation(input);
    assert.equal(riskRow(result), undefined);
    assert.equal(result.incomplete, true);
    assert.equal(result.status, '中性 · 顶背离确认');
    assert.equal(result.rows.length, 3);
    assert.deepEqual(result.currentView, []);
  }
});

test('a stale signal never supplies today’s explanation or zero-filled figures', () => {
  const input = fixture();
  input.currentData.asOfDate = '2026-09-15';
  const result = buildRsiTechnicalExplanation(input);
  assert.equal(result.status, '—');
  assert.deepEqual(result.rows, []);
  assert.equal(result.incomplete, true);
  assert.equal(result.asOfDate, '2026-09-15');
  assert.deepEqual(result.plain, [], 'the shared sheet owns the incomplete message');
  assert.equal(result.ruleDetails, null);
  assert.equal(result.eventDetails, null);
});

test('unknown or incomplete lifecycle is not rewritten as normal momentum', () => {
  for (const input of [fixture({ state: null }), fixture()]) {
    if (input.currentData.rsiSignal.divergenceEvent) delete input.currentData.rsiSignal.divergenceEvent.maxDrawdownPct;
    const result = buildRsiTechnicalExplanation(input);
    assert.equal(result.status, '中性 · —');
    assert.equal(result.incomplete, true);
    assert.equal(joined(result).includes('动量正常'), false);
    assert.equal(result.rows.some(row => row.label === '最大收盘回撤'), false);
  }
  assert.equal(buildRsiTechnicalExplanation().incomplete, true);
});

test('static structure is not described as a slope and current MA trend is not overwritten', () => {
  const input = fixture({ level: 'MEDIUM', score: 55 });
  input.technicalState.maTrend.status = 'bullish_weakening';
  input.technicalState.maTrend.ma30Slope = -0.01;
  input.currentData.rsiSignal.divergenceDebug.trendChange = 'bullish_weakening';
  input.currentData.rsiSignal.divergenceDebug.riskContributions.trendAdjustment = 10;
  const result = buildRsiTechnicalExplanation(input);
  assert.equal(eventRows(result).some(row => row.label === '均线结构' || row.label === '趋势变化'), false);
  assert.ok(scoreRows(result).some(row => row.label === '趋势变化' && row.value === '+10'));
  assert.ok(result.currentView.some(text => text.includes('多头排列') && text.includes('多头减弱')));
  assert.equal(joined(result).includes('MA30上升'), false);
  assert.equal(result.status, '中性 · 顶背离确认');
});

test('only actual negative contributions produce recovery or trend risk reduction explanations', () => {
  const input = fixture({ score: 35 });
  const debug = input.currentData.rsiSignal.divergenceDebug;
  debug.riskContributions.trendAdjustment = 0;
  debug.riskContributions.recoveryAdjustment = 0;
  debug.riskContributions.timeDecay = -15;
  const result = buildRsiTechnicalExplanation(input);
  assert.ok(scoreRows(result).some(row => row.label === '时间衰减' && row.value === '-15'));
  assert.ok(scoreRows(result).some(row => row.label === '价格与RSI恢复' && row.value === '0'));
  assert.ok(scoreRows(result).some(row => row.label === '趋势变化' && row.value === '0'));
  assert.deepEqual(eventLines(result), []);
});

test('valid zero age and zero historical drawdown are displayed while absent optional values are omitted', () => {
  const input = fixture();
  input.currentData.rsiSignal.divergenceDebug.confirmedAge = 0;
  input.currentData.rsiSignal.divergenceDebug.priceRecoveryRatio = null;
  input.currentData.rsiSignal.divergenceDebug.riskContributions.recoveryAdjustment = 0;
  delete input.currentData.latestRow.close;
  const result = buildRsiTechnicalExplanation(input);
  assert.ok(eventRows(result).some(row => row.value === '0个交易日'));
  assert.equal(eventRows(result).some(row => row.label === '最新完整日收盘价'), false);
  assert.equal(eventRows(result).some(row => row.label === '已收复此前跌幅'), false);
  const forming = fixture({ state: 'FORMING' });
  forming.currentData.rsiSignal.divergenceEvent.maxDrawdownPct = 0;
  assert.ok(eventRows(buildRsiTechnicalExplanation(forming)).some(row => row.label === '最大收盘回撤' && row.value === '0.00%'));
});

test('English templates are complete and never leak implementation field names', () => {
  for (const state of ['NONE', 'FORMING', 'CONFIRMED', 'REALIZED', 'INVALIDATED']) {
    const input = fixture({ state }); input.language = 'en';
    const result = buildRsiTechnicalExplanation(input);
    assert.equal(result.title, 'RSI(6) · Momentum');
    assert.equal(/[\u3400-\u9fff]/.test(JSON.stringify(result)), false);
    assert.equal(/divergenceState|divergenceRisk|riskContributions|stateBase|ma30Adjustment|trendAdjustment|recoveryAdjustment|timeDecay/.test(joined(result)), false);
  }
});

test('default explanations stay concise while professional thresholds and scoring evidence remain available on expansion', () => {
  for (const state of ['NONE', 'FORMING', 'CONFIRMED', 'REALIZED', 'INVALIDATED']) {
    const result = buildRsiTechnicalExplanation(fixture({ state }));
    assert.ok(result.summary.length > 0);
    assert.equal(result.rows.length, ['FORMING', 'CONFIRMED'].includes(state) ? 5 : 3);
    assert.ok(result.why.length <= 2);
    assert.equal(result.plain.length, 1);
    assert.equal(/0\.5%|回撤至少|RSI至少下降|前高RSI不低于|降低\d+分|增加\d+分|\d{4}-\d{2}-\d{2}/.test(defaultText(result)), false);
    assert.ok(result.ruleDetails.lines.length > 0);
    if (state !== 'NONE') assert.ok(result.eventDetails.rows.length > 0);
  }
  const confirmed = buildRsiTechnicalExplanation(fixture());
  assert.ok(ruleLines(confirmed).some(text => text.includes('0.5%') && text.includes('5点') && text.includes('70')));
  assert.ok(scoreRows(confirmed).some(row => row.label === '趋势变化' && row.value === '-15'));
  assert.ok(confirmed.doesNotMean.some(text => text.includes('不是卖出信号') && text.includes('不代表事件已经失效') && text.includes('不是未来下跌概率')));
});

test('NONE under a weakening bearish structure explains the separate module boundary rather than assigning a false cause', () => {
  const input = fixture({ state: 'NONE', rsi: 45.7 });
  input.ticker = 'COST';
  input.technicalState.maStructure.status = 'bearish';
  input.technicalState.maTrend.status = 'bearish_strengthening';
  const result = buildRsiTechnicalExplanation(input);
  assert.equal(result.status, '中性 · 动量正常');
  assert.ok(result.why.some(text => text.includes('根据当前RSI和近期价格高点') && text.includes('仍处于形成或确认阶段')));
  assert.equal(result.why.some(text => text.includes('空头')), false);
  assert.ok(result.plain.some(text => text.includes('只表示当前没有有效顶背离') && text.includes('空头排列') && text.includes('空头强化')));
  assert.equal(result.eventDetails, null);
  assert.equal(riskRow(result), undefined);
});

test('price-realized evidence uses the frozen event drawdown and does not invent a historical RSI value', () => {
  const input = fixture({ state: 'REALIZED', rsi: 52.68 });
  input.ticker = 'SNOW';
  const event = input.currentData.rsiSignal.divergenceEvent;
  event.maxDrawdownPct = 12.3206;
  event.formedAt = '2026-09-09'; event.confirmedAt = '2026-09-09'; event.realizedAt = '2026-09-09';
  input.currentData.rsiSignal.divergenceDate = '2026-09-09';
  input.currentData.rsiSignal.divergenceDebug.maxDrawdownFromHigh2 = 0.1445;
  const result = buildRsiTechnicalExplanation(input);
  assert.equal(result.summary, '此前的顶背离已经通过价格调整得到释放。');
  assert.ok(result.why.some(text => text.includes('此前价格创新高') && text.includes('随后价格调整')));
  assert.ok(eventRows(result).some(row => row.label === '最大收盘回撤' && row.value === '12.32%'));
  assert.equal(joined(result).includes('14.45%'), false);
  assert.equal(defaultText(result).includes('40'), false);
  assert.equal(joined(result).includes('当日RSI为'), false);
});

test('the finalized core conclusions are preserved verbatim for the three reviewed cases', () => {
  assert.equal(buildRsiTechnicalExplanation(fixture({ state: 'REALIZED' })).summary, '此前的顶背离已经通过价格调整得到释放。');
  assert.equal(buildRsiTechnicalExplanation(fixture()).summary, '此前的顶背离已经得到价格确认，但当前风险较低。');
  assert.equal(buildRsiTechnicalExplanation(fixture({ state: 'NONE' })).summary, '当前没有检测到有效顶背离。');
  assert.equal(buildRsiTechnicalExplanation(fixture({ state: 'CONFIRMED', score: 55, level: 'MEDIUM' })).summary, '此前的顶背离已经得到价格确认。');
});

test('event details and rule details are separate, with an independent score table preserving the six supplied contributions', () => {
  const input = fixture();
  const result = buildRsiTechnicalExplanation(input);
  assert.equal(result.eventDetails.scoreBreakdown.title, '风险评分构成');
  assert.deepEqual(scoreRows(result), [
    { label: '基础状态', value: '+45' },
    { label: '背离强度', value: '+5' },
    { label: 'MA30位置', value: '0' },
    { label: '趋势变化', value: '-15' },
    { label: '价格与RSI恢复', value: '-5' },
    { label: '时间衰减', value: '0' },
    { label: '最终评分', value: '30 / 100 · 低' },
  ]);
  assert.deepEqual(eventLines(result), []);
  assert.equal(eventRows(result).some(row => ['最新完整日收盘价', '均线结构', '趋势变化'].includes(row.label)), false);
  assert.equal(ruleLines(result).some(line => line.includes('2026-') || line.includes('$512.76') || line.includes('52.7%') || line.includes('降低15分')), false);
  assert.ok(eventRows(result).some(row => row.label === '前一高点'));
  assert.ok(eventRows(result).some(row => row.label === '后一高点'));
  assert.ok(eventRows(result).some(row => row.label === 'RSI下降' && row.value === '5.1点'));
  assert.equal(result.rows.length, 5);
  for (const state of ['NONE', 'REALIZED', 'INVALIDATED']) {
    assert.equal(buildRsiTechnicalExplanation(fixture({ state })).eventDetails?.scoreBreakdown, undefined);
  }
});

test('overbought NONE retains both its indicator boundary and an independently weak MA context', () => {
  const input = fixture({ state: 'NONE', rsi: 84 });
  input.technicalState.maStructure.status = 'bearish';
  input.technicalState.maTrend.status = 'bearish_strengthening';
  const result = buildRsiTechnicalExplanation(input);
  assert.equal(result.summary, '短期动量偏热，但目前没有检测到有效顶背离。');
  assert.ok(result.plain.some(text => text.includes('超买 ≠ 顶背离') && text.includes('超买 ≠ 马上下跌') && text.includes('空头排列')));
  assert.ok(result.doesNotMean.some(text => text.includes('不代表不存在其他风险')));
  assert.equal(riskRow(result), undefined);
});
