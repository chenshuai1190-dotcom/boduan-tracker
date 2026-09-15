import { stockRsiPresentation } from './stockRsiPresentation.js';
import { validStockRsiDate } from './stockRsiSignal.js';
import { STOCK_RSI_RULES } from './stockRsiConfig.js';
import { STOCK_RSI_RISK_RULES, STOCK_RSI_RISK_VERSION } from './stockRsiRiskConfig.js';
import { t } from './i18n.js';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const contributionKeys = ['stateBase', 'divergenceStrength', 'ma30Adjustment', 'trendAdjustment', 'recoveryAdjustment', 'timeDecay'];
const structureStates = ['bullish', 'bearish', 'long_term_up', 'long_term_down', 'at_ma200'];
const trendStates = ['bullish_strengthening', 'bullish_weakening', 'bearish_strengthening', 'bearish_weakening', 'improving', 'structural_weakening', 'strengthening', 'weakening', 'stable'];

function stateLabel(state, kind, asOfDate, language) {
  const allowed = kind === 'maStructure' ? structureStates : trendStates;
  return state?.asOfDate === asOfDate && allowed.includes(state.status)
    ? t(language, `watchlistDetail.${kind}.${state.status}`) : null;
}

function currentRisk(signal, asOfDate, technicalState) {
  const debug = signal.divergenceDebug;
  const event = signal.divergenceEvent;
  const score = signal.divergenceRiskScore;
  const level = signal.divergenceRiskLevel;
  if (!['FORMING', 'CONFIRMED'].includes(signal.divergenceState)
    || debug?.version !== STOCK_RSI_RISK_VERSION || debug.status !== 'ready'
    || debug.asOf !== asOfDate || debug.state !== signal.divergenceState
    || !finite(score) || score < STOCK_RSI_RISK_RULES.RISK_LOW_MIN || score > STOCK_RSI_RISK_RULES.RISK_MAX
    || debug.riskScore !== score || debug.riskLevel !== level
    || debug.currentRsi !== signal.value || !positive(debug.currentPrice)
    || !contributionKeys.every(key => finite(debug.riskContributions?.[key]))) return null;
  const expectedLevel = score >= STOCK_RSI_RISK_RULES.RISK_HIGH_MIN ? 'HIGH'
    : score >= STOCK_RSI_RISK_RULES.RISK_MEDIUM_MIN ? 'MEDIUM' : 'LOW';
  if (level !== expectedLevel) return null;
  for (const [name, high] of [['high1', event.high1], ['high2', event.high2]]) {
    if (debug[`${name}Price`] !== high.price || debug[`${name}Rsi`] !== high.rsi || debug[`${name}Date`] !== high.date) return null;
  }
  for (const [name, values, key] of [['maStructure', structureStates, 'trendStructure'], ['maTrend', trendStates, 'trendChange']]) {
    if (!values.includes(debug[key])) return null;
    const supplied = technicalState?.[name];
    if (supplied && (supplied.asOfDate !== asOfDate || supplied.status !== debug[key])) return null;
  }
  if (signal.divergenceState === 'CONFIRMED' && (!Number.isSafeInteger(debug.confirmedAge) || debug.confirmedAge < 0)) return null;
  return debug;
}

// Keep the full professional evidence templates separate from the concise view.
// Both layers read the same validated outputs; neither recalculates a signal.
function buildRsiExplanationEvidence({ language = 'zh', currentData = {}, technicalState = {} } = {}) {
  const english = language === 'en';
  const languageKey = english ? 'en' : 'zh';
  const text = (zh, en) => english ? en : zh;
  const number = (value, digits = 1) => new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  const price = value => {
    const currency = typeof currentData.currency === 'string' && /^[A-Z]{3}$/.test(currentData.currency) ? currentData.currency : null;
    return currency ? new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) : number(value, 2);
  };
  const asOfDate = validStockRsiDate(currentData.asOfDate) ? currentData.asOfDate : '';
  const result = {
    title: text('RSI(6) · 动量', 'RSI(6) · Momentum'), status: '—', asOfDate,
    rows: [], why: [], plain: [], doesNotMean: [], incomplete: false,
    zone: null, state: null, risk: null,
  };
  const markIncomplete = () => { result.incomplete = true; };
  const addRow = (zh, en, value) => { if (value !== null && value !== undefined && value !== '') result.rows.push({ label: text(zh, en), value: String(value) }); };
  const signal = currentData.rsiSignal;
  if (!asOfDate || signal?.asOf !== asOfDate) { markIncomplete(); return result; }
  const presentation = stockRsiPresentation(signal, english);
  if (!presentation.available) { markIncomplete(); return result; }

  result.status = `${presentation.zoneLabel} · ${presentation.momentumLabel}`;
  result.zone = presentation.zone;
  addRow('RSI(6)', 'RSI(6)', `${number(signal.value)} · ${presentation.zoneLabel}`);
  const latest = currentData.latestRow;
  if (latest?.date === asOfDate && positive(latest.close)) addRow('最新完整日收盘价', 'Latest completed close', price(latest.close));
  if (presentation.zone === 'overbought') {
    result.why.push(text(`RSI(6)为${number(signal.value)}，达到${STOCK_RSI_RULES.RSI_OVERBOUGHT}的超买区间。`, `RSI(6) is ${number(signal.value)}, at or above the overbought threshold of ${STOCK_RSI_RULES.RSI_OVERBOUGHT}.`));
    result.plain.push(text('短期上涨动量较强，价格可能偏热；超买不等于马上下跌。', 'Short-term upward momentum is strong and price may be stretched; overbought does not mean an immediate decline.'));
  } else if (presentation.zone === 'oversold') {
    result.why.push(text(`RSI(6)为${number(signal.value)}，位于${STOCK_RSI_RULES.RSI_OVERSOLD}及以下的超卖区间。`, `RSI(6) is ${number(signal.value)}, at or below the oversold threshold of ${STOCK_RSI_RULES.RSI_OVERSOLD}.`));
    result.plain.push(text('短期下跌动量较强，卖压已经明显体现；超卖不等于马上反弹。', 'Short-term downward momentum and selling pressure are strong; oversold does not mean an immediate rebound.'));
  } else {
    result.why.push(text(`RSI(6)为${number(signal.value)}，高于${STOCK_RSI_RULES.RSI_OVERSOLD}且低于${STOCK_RSI_RULES.RSI_OVERBOUGHT}，属于中性区间。`, `RSI(6) is ${number(signal.value)}, above ${STOCK_RSI_RULES.RSI_OVERSOLD} and below ${STOCK_RSI_RULES.RSI_OVERBOUGHT}, within the neutral range.`));
    result.plain.push(text('当前RSI尚未达到超买或超卖阈值；中性不等于价格没有趋势。', 'RSI has reached neither the overbought nor oversold threshold; neutral does not mean price has no trend.'));
  }
  if (!presentation.momentumAvailable) { markIncomplete(); return result; }

  const state = signal.divergenceState;
  result.state = state;
  const event = signal.divergenceEvent;
  if (event) {
    addRow('前一波段高点（复权）', 'Earlier swing high (adjusted)', `${event.high1.date} · ${price(event.high1.price)} · RSI ${number(event.high1.rsi)}`);
    addRow('后一波段高点（复权）', 'Later swing high (adjusted)', `${event.high2.date} · ${price(event.high2.price)} · RSI ${number(event.high2.rsi)}`);
    addRow('两次高点的RSI差', 'RSI decline between highs', text(`下降${number(event.high1.rsi - event.high2.rsi)}点`, `${number(event.high1.rsi - event.high2.rsi)} points lower`));
    addRow('形成日期', 'Formation date', event.formedAt);
    if (event.confirmedAt) addRow('历史确认日期', 'Historical confirmation date', event.confirmedAt);
    addRow('事件记录最大收盘回撤', 'Event-recorded maximum closing drawdown', `${number(event.maxDrawdownPct, 2)}%`);
  }
  const structureLabel = stateLabel(technicalState.maStructure, 'maStructure', asOfDate, languageKey);
  const trendLabel = stateLabel(technicalState.maTrend, 'maTrend', asOfDate, languageKey);
  addRow('均线结构', 'Moving-average structure', structureLabel);
  addRow('趋势变化', 'Trend change', trendLabel);

  if (state === 'NONE') {
    result.why.push(text('当前没有仍处于形成或确认阶段的有效顶背离事件。', 'There is currently no active bearish-divergence event in the forming or confirmed stage.'));
    result.plain.push(text('动量正常：当前没有有效顶背离风险。RSI区间描述当前动量，背离状态描述近期事件，两者分别判断。', 'Normal momentum: no currently active bearish-divergence risk has been identified. The RSI zone describes current momentum; divergence describes a recent event.'));
    result.doesNotMean.push(text('动量正常不等于没有其他风险，也不直接构成买入依据。', 'Normal momentum does not mean there are no other risks or establish a reason to buy.'));
  } else if (state === 'FORMING') {
    result.why.push(text(`后一个波段价格高点更高，但该日RSI更低；此事件尚未进入价格回撤确认阶段，确认需要完整日收盘价较第二高点回撤至少${number(STOCK_RSI_RULES.CONFIRMATION_DRAWDOWN * 100, 0)}%。`, `The later price swing high is higher, but its RSI is lower. This event has not yet reached confirmation, which requires a completed closing drawdown of at least ${number(STOCK_RSI_RULES.CONFIRMATION_DRAWDOWN * 100, 0)}% from the later high.`));
    result.plain.push(text('上涨动量弱于前一高点，当前处于预警阶段。', 'Momentum is weaker than at the earlier high; the event remains an early warning.'));
    result.doesNotMean.push(text('顶背离形成不等于上涨趋势结束，也不直接代表卖出。', 'Divergence forming does not mean the uptrend has ended or directly signal a sale.'));
  } else if (state === 'CONFIRMED') {
    result.why.push(text(`确认规则为收盘价较第二高点回撤至少${number(STOCK_RSI_RULES.CONFIRMATION_DRAWDOWN * 100, 0)}%；此前回撤已满足条件，事件在${event.confirmedAt}进入确认阶段。这不表示今天仍处于同样的回撤程度。`, `Confirmation requires a closing drawdown of at least ${number(STOCK_RSI_RULES.CONFIRMATION_DRAWDOWN * 100, 0)}% from the later high. An earlier drawdown met this condition on ${event.confirmedAt}; the same drawdown need not persist today.`));
    result.plain.push(text('历史顶背离已被价格回撤确认；当前威胁还需结合价格恢复、均线和风险评分分别观察。', 'A price pullback confirmed the historical divergence. Its current threat is assessed separately through recovery, moving averages and the risk score.'));
    result.doesNotMean.push(text('顶背离确认不是永久标签，也不代表必须卖出；风险降低本身不会使事件失效。', 'Confirmation is not permanent and does not require selling. A lower risk score alone does not invalidate the event.'));
  } else if (state === 'REALIZED') {
    addRow('兑现日期', 'Realization date', event.realizedAt);
    result.why.push(text(`兑现规则为第二高点后最大收盘回撤达到${number(STOCK_RSI_RULES.REALIZED_DRAWDOWN * 100, 0)}%，或RSI(6)降至${STOCK_RSI_RULES.REALIZED_RSI_THRESHOLD}及以下。该事件在${event.realizedAt}已兑现，当前显示的是历史结果。`, `Realization requires a maximum closing drawdown of ${number(STOCK_RSI_RULES.REALIZED_DRAWDOWN * 100, 0)}% after the later high, or RSI(6) at or below ${STOCK_RSI_RULES.REALIZED_RSI_THRESHOLD}. The event was realized on ${event.realizedAt}; the displayed outcome is historical.`));
    result.plain.push(text('此前顶背离风险已经得到释放，不能继续把这一事件当作新的顶部风险；短暂保留后将恢复动量正常。', 'The earlier divergence risk has played out. This event should not be treated as a new topping warning; its brief historical display later returns to normal momentum.'));
    result.doesNotMean.push(text('顶背离已兑现不等于股价见底，也不直接代表可以买入。', 'Realized divergence does not mean the price has bottomed or establish a buy signal.'));
  } else if (state === 'INVALIDATED') {
    addRow('失效日期', 'Invalidation date', event.invalidatedAt);
    result.why.push(event.confirmedAt
      ? text(`确认后失效需要价格重新超过第二高点至少${number(STOCK_RSI_RULES.INVALIDATION_PRICE_THRESHOLD * 100)}%，同时RSI恢复至前高RSI的${STOCK_RSI_RULES.RSI_RECOVERY_TOLERANCE}点以内。事件在${event.invalidatedAt}失效，历史确认记录仍然保留。`, `Invalidation after confirmation requires price to exceed the later high by at least ${number(STOCK_RSI_RULES.INVALIDATION_PRICE_THRESHOLD * 100)}%, while RSI recovers to within ${STOCK_RSI_RULES.RSI_RECOVERY_TOLERANCE} points of the earlier peak RSI. The event was invalidated on ${event.invalidatedAt}; its historical confirmation remains recorded.`)
      : text(`形成阶段的失效要求价格超过第二高点，同时RSI恢复至前高RSI水平或更高。该事件在${event.invalidatedAt}满足双重恢复条件而失效。`, `Invalidation during formation requires price above the later high and RSI at or above the earlier peak RSI. Both recovery conditions invalidated this event on ${event.invalidatedAt}.`));
    result.plain.push(text('这一背离事件已结束，当前不再作为有效背离风险；短暂保留后将恢复动量正常。', 'This divergence event has ended and no longer contributes active divergence risk. Its brief historical display later returns to normal momentum.'));
    result.doesNotMean.push(text('顶背离失效不等于以后不会调整，也不直接代表可以买入。', 'Invalidation does not rule out future pullbacks or establish a buy signal.'));
  }

  if (state === 'FORMING' || state === 'CONFIRMED') {
    result.why.splice(1, 0, text(`两次价格高点从${price(event.high1.price)}升至${price(event.high2.price)}，涨幅${number((event.high2.price / event.high1.price - 1) * 100, 2)}%；对应RSI从${number(event.high1.rsi)}降至${number(event.high2.rsi)}，下降${number(event.high1.rsi - event.high2.rsi)}点。识别规则要求价格至少创新高${number(STOCK_RSI_RULES.PRICE_HIGHER_HIGH_THRESHOLD * 100)}%、RSI至少下降${STOCK_RSI_RULES.MIN_RSI_DIFFERENCE}点，且前高RSI不低于${STOCK_RSI_RULES.DIVERGENCE_MIN_RSI}。`, `The price highs rose from ${price(event.high1.price)} to ${price(event.high2.price)}, a ${number((event.high2.price / event.high1.price - 1) * 100, 2)}% increase; their RSI readings fell from ${number(event.high1.rsi)} to ${number(event.high2.rsi)}, down ${number(event.high1.rsi - event.high2.rsi)} points. Detection requires a price higher high of at least ${number(STOCK_RSI_RULES.PRICE_HIGHER_HIGH_THRESHOLD * 100)}%, an RSI decline of at least ${STOCK_RSI_RULES.MIN_RSI_DIFFERENCE} points, and earlier peak RSI of at least ${STOCK_RSI_RULES.DIVERGENCE_MIN_RSI}.`));
    const debug = currentRisk(signal, asOfDate, technicalState);
    if (!debug) { markIncomplete(); return result; }
    result.risk = debug;
    const levels = english ? { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' } : { LOW: '低', MEDIUM: '中', HIGH: '高' };
    addRow('当前背离风险', 'Current divergence risk', levels[debug.riskLevel]);
    addRow('风险评分', 'Risk score', `${number(debug.riskScore, 0)} / ${STOCK_RSI_RISK_RULES.RISK_MAX}`);
    if (Number.isSafeInteger(debug.confirmedAge) && debug.confirmedAge >= 0) addRow('确认后经过', 'Elapsed since confirmation', text(`${debug.confirmedAge}个完整交易日`, `${debug.confirmedAge} completed trading days`));
    if (finite(debug.drawdownFromHigh2)) addRow('当前距第二高点', 'Current distance from later high', `${number(debug.drawdownFromHigh2 * 100, 2)}%`);
    if (finite(debug.priceRecoveryRatio) && debug.priceRecoveryRatio >= 0 && debug.priceRecoveryRatio <= 1) addRow('已收复此前跌幅', 'Prior pullback recovered', `${number(debug.priceRecoveryRatio * 100)}%`);
    const contributions = debug.riskContributions;
    if (contributions.divergenceStrength > 0) result.why.push(text(`两次高点的价格与RSI差异为当前背离强度增加${number(contributions.divergenceStrength, 0)}分。`, `The price and RSI differences between the highs add ${number(contributions.divergenceStrength, 0)} points for divergence strength.`));
    if (contributions.ma30Adjustment > 0 && finite(debug.priceVsMA30) && debug.priceVsMA30 < 0) result.why.push(text(`当前价格位于MA30下方，为风险增加${number(contributions.ma30Adjustment, 0)}分。`, `Price is below MA30, adding ${number(contributions.ma30Adjustment, 0)} risk points.`));
    const riskTrendLabel = t(languageKey, `watchlistDetail.maTrend.${debug.trendChange}`);
    if (contributions.trendAdjustment !== 0) result.why.push(contributions.trendAdjustment < 0
      ? text(`趋势变化为${riskTrendLabel}，降低当前风险评分${number(-contributions.trendAdjustment, 0)}分。`, `${riskTrendLabel} reduces the current risk score by ${number(-contributions.trendAdjustment, 0)} points.`)
      : text(`趋势变化为${riskTrendLabel}，增加当前风险评分${number(contributions.trendAdjustment, 0)}分。`, `${riskTrendLabel} adds ${number(contributions.trendAdjustment, 0)} points to the current risk score.`));
    if (contributions.recoveryAdjustment < 0) {
      const evidence = [];
      if (debug.priceRecoveryAdjustment < 0 && finite(debug.priceRecoveryRatio)) evidence.push(text(`价格已收复此前跌幅的${number(debug.priceRecoveryRatio * 100)}%`, `price has recovered ${number(debug.priceRecoveryRatio * 100)}% of the earlier pullback`));
      if (debug.rsiRecoveryAdjustment < 0 && finite(debug.rsiRecoveryGap)) evidence.push(text(`RSI与前高点相差${number(Math.abs(debug.rsiRecoveryGap))}点`, `RSI is ${number(Math.abs(debug.rsiRecoveryGap))} points from the earlier peak`));
      if (evidence.length) result.why.push(text(`${evidence.join('，')}，恢复因素合计降低${number(-contributions.recoveryAdjustment, 0)}分。`, `${evidence.join('; ')}; recovery reduces the score by ${number(-contributions.recoveryAdjustment, 0)} points in total.`));
      else markIncomplete();
    }
    if (contributions.timeDecay < 0) result.why.push(text(`确认后的近期观察未触发恶化条件，时间衰减降低${number(-contributions.timeDecay, 0)}分。`, `Recent observations after confirmation did not trigger deterioration conditions; time decay reduces the score by ${number(-contributions.timeDecay, 0)} points.`));
    if (state === 'CONFIRMED' && debug.riskLevel === 'LOW') result.plain.push(text('确认记录仍然有效；当前评分为低风险，说明这个历史事件对当前走势的威胁较低，并不等于事件已经失效。', 'Confirmation remains valid. The low current risk score describes a smaller threat from this historical event, not its invalidation.'));
    if (state === 'CONFIRMED' && debug.riskLevel === 'MEDIUM') result.plain.push(text('当前仍有中等程度的背离风险，需要结合价格、动量与趋势证据继续观察。', 'Current divergence risk is medium; continue assessing the price, momentum and trend evidence together.'));
    if (state === 'CONFIRMED' && debug.riskLevel === 'HIGH') result.plain.push(text('当前背离风险较高，说明现有价格和动量证据仍需重点观察。', 'Current divergence risk is high, so the existing price and momentum evidence merits attention.'));
    result.doesNotMean.push(text('风险分数不是下跌概率，也不能单独决定买卖。', 'The risk score is not a probability of a price decline and cannot decide a trade on its own.'));
  }
  return result;
}

/** Deterministic concise view plus optional rule and historical-event details. */
export function buildRsiTechnicalExplanation(input = {}) {
  const { language = 'zh', currentData = {}, technicalState = {} } = input;
  const english = language === 'en';
  const languageKey = english ? 'en' : 'zh';
  const text = (zh, en) => english ? en : zh;
  const evidence = buildRsiExplanationEvidence(input);
  const decimal = (value, digits = 1) => new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  const displayPrice = value => typeof currentData.currency === 'string' && /^[A-Z]{3}$/.test(currentData.currency)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: currentData.currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
    : decimal(value, 2);
  const result = {
    title: evidence.title, status: evidence.status, asOfDate: evidence.asOfDate,
    summary: '', rows: [], why: [], plain: [], currentView: [], doesNotMean: [],
    ruleDetails: null, eventDetails: null, incomplete: evidence.incomplete,
  };
  if (!evidence.zone) return result;
  const signal = currentData.rsiSignal;
  const presentation = stockRsiPresentation(signal, english);
  result.rows.push(
    { label: 'RSI(6)', value: signal.value.toFixed(1) },
    { label: text('当前区间', 'Current zone'), value: presentation.zoneLabel },
    { label: text('动量状态', 'Momentum state'), value: presentation.momentumLabel },
  );

  // Rule details contain only general criteria, never this stock's observations
  // or applied point adjustments. Historical facts belong to event details.
  result.ruleDetails = {
    rows: [],
    lines: [
      text(`RSI(6)只使用完整交易日数据：达到${STOCK_RSI_RULES.RSI_OVERBOUGHT}为超买，${STOCK_RSI_RULES.RSI_OVERSOLD}及以下为超卖，其他为中性。`, `RSI(6) uses completed trading days only: ${STOCK_RSI_RULES.RSI_OVERBOUGHT} or above is overbought, ${STOCK_RSI_RULES.RSI_OVERSOLD} or below is oversold, otherwise neutral.`),
      text(`顶背离比较两个有效波段高点：价格至少创新高${decimal(STOCK_RSI_RULES.PRICE_HIGHER_HIGH_THRESHOLD * 100)}%，RSI至少下降${STOCK_RSI_RULES.MIN_RSI_DIFFERENCE}点，且前高RSI不低于${STOCK_RSI_RULES.DIVERGENCE_MIN_RSI}。`, `Bearish divergence compares two valid swing highs: price must rise by at least ${decimal(STOCK_RSI_RULES.PRICE_HIGHER_HIGH_THRESHOLD * 100)}%, RSI must fall by at least ${STOCK_RSI_RULES.MIN_RSI_DIFFERENCE} points, and the earlier peak RSI must be at least ${STOCK_RSI_RULES.DIVERGENCE_MIN_RSI}.`),
      text(`确认要求完整日收盘价较第二高点回撤至少${decimal(STOCK_RSI_RULES.CONFIRMATION_DRAWDOWN * 100, 0)}%；最大收盘回撤达到${decimal(STOCK_RSI_RULES.REALIZED_DRAWDOWN * 100, 0)}%，或RSI(6)降至${STOCK_RSI_RULES.REALIZED_RSI_THRESHOLD}及以下，进入已兑现。`, `Confirmation requires a completed closing drawdown of at least ${decimal(STOCK_RSI_RULES.CONFIRMATION_DRAWDOWN * 100, 0)}% from the later high. A maximum closing drawdown of ${decimal(STOCK_RSI_RULES.REALIZED_DRAWDOWN * 100, 0)}%, or RSI(6) at or below ${STOCK_RSI_RULES.REALIZED_RSI_THRESHOLD}, realizes the event.`),
    ],
  };

  const state = evidence.state;
  const event = state ? signal.divergenceEvent : null;
  const debug = evidence.risk;
  result.ruleDetails.lines.push(state === 'INVALIDATED' && event?.confirmedAt === null || state === 'FORMING'
    ? text('形成阶段的失效要求价格超过第二高点，同时RSI恢复至前高RSI水平或更高。', 'Invalidation during formation requires price above the later high and RSI at or above the earlier peak RSI.')
    : text(`确认后失效要求价格超过第二高点至少${decimal(STOCK_RSI_RULES.INVALIDATION_PRICE_THRESHOLD * 100)}%，且RSI恢复至前高RSI的${STOCK_RSI_RULES.RSI_RECOVERY_TOLERANCE}点以内。`, `Invalidation after confirmation requires price to exceed the later high by at least ${decimal(STOCK_RSI_RULES.INVALIDATION_PRICE_THRESHOLD * 100)}%, with RSI recovering to within ${STOCK_RSI_RULES.RSI_RECOVERY_TOLERANCE} points of the earlier peak RSI.`));
  result.ruleDetails.lines.push(text(`已兑现保留${STOCK_RSI_RULES.REALIZED_DISPLAY_WINDOW}个交易日，已失效保留${STOCK_RSI_RULES.INVALIDATED_DISPLAY_WINDOW}个交易日；确认后最长${STOCK_RSI_RULES.CONFIRMED_MAX_AGE}个交易日。风险评分不改变事件状态，也不是未来下跌概率。`, `Realized events remain visible for ${STOCK_RSI_RULES.REALIZED_DISPLAY_WINDOW} trading days and invalidated events for ${STOCK_RSI_RULES.INVALIDATED_DISPLAY_WINDOW}; confirmation lasts at most ${STOCK_RSI_RULES.CONFIRMED_MAX_AGE} trading days. The risk score neither changes the event state nor predicts a probability of decline.`));
  if (event) {
    const excluded = new Set(['RSI(6)', '当前背离风险', 'Current divergence risk', '风险评分', 'Risk score', '最新完整日收盘价', 'Latest completed close', '均线结构', 'Moving-average structure', '趋势变化', 'Trend change']);
    const shortLabels = english ? {
      'Earlier swing high (adjusted)': 'Earlier high', 'Later swing high (adjusted)': 'Later high',
      'RSI decline between highs': 'RSI decline', 'Historical confirmation date': 'Confirmation date',
      'Event-recorded maximum closing drawdown': 'Maximum closing drawdown',
    } : {
      '前一波段高点（复权）': '前一高点', '后一波段高点（复权）': '后一高点',
      '两次高点的RSI差': 'RSI下降', '历史确认日期': '确认日期', '事件记录最大收盘回撤': '最大收盘回撤',
    };
    result.eventDetails = {
      rows: evidence.rows.filter(row => !excluded.has(row.label)).map(row => ({
        label: shortLabels[row.label] || row.label,
        value: row.label === '两次高点的RSI差' ? row.value.replace(/^下降/, '')
          : row.label === 'RSI decline between highs' ? row.value.replace(/ lower$/, '')
            : row.value.replace('个完整交易日', '个交易日').replace('completed trading days', 'trading days'),
      })),
      lines: [],
    };
  }
  if (!state) {
    result.summary = text('RSI区间可用，动量事件资料尚不完整。', 'The RSI zone is available; momentum-event data remains incomplete.');
    return result;
  }

  if (state === 'NONE') {
    result.summary = evidence.zone === 'overbought'
      ? text('短期动量偏热，但目前没有检测到有效顶背离。', 'Short-term momentum is stretched, but no active bearish divergence is currently identified.')
      : text('当前没有检测到有效顶背离。', 'No active bearish divergence is currently identified.');
    result.why.push(text('根据当前RSI和近期价格高点，系统没有检测到仍处于形成或确认阶段的有效顶背离。', 'Based on current RSI and recent price highs, no active divergence still forming or confirmed has been detected.'));
    const structureLabel = stateLabel(technicalState.maStructure, 'maStructure', evidence.asOfDate, languageKey);
    const trendLabel = stateLabel(technicalState.maTrend, 'maTrend', evidence.asOfDate, languageKey);
    const noneMeaning = evidence.zone === 'overbought'
      ? text('RSI(6)已经进入超买区域，说明最近几个交易日上涨力量较强。但：超买 ≠ 顶背离；超买 ≠ 马上下跌。当前没有检测到有效顶背离，所以动量状态仍为正常。', 'RSI(6) is overbought, showing stronger upward momentum over recent trading days. However, overbought ≠ bearish divergence, and overbought ≠ an immediate decline. No active bearish divergence is detected, so the momentum state remains normal.')
      : text('『动量正常』只表示当前没有有效顶背离，不代表股票整体趋势健康。', '“Normal momentum” only means there is no currently active bearish divergence; it does not mean the stock’s overall trend is healthy.');
    const weakContext = structureLabel && trendLabel && technicalState.maStructure.status === 'bearish' && technicalState.maTrend.status === 'bearish_strengthening'
      ? text('当前均线结构仍为『空头排列』，趋势变化为『空头强化』，需要与动量状态分开理解。', ' The moving-average structure remains “Bearish alignment” and its trend change is “Bearish strengthening”; these must be interpreted separately from momentum.') : '';
    result.plain.push(`${noneMeaning}${weakContext}`);
    result.doesNotMean.push(evidence.zone === 'overbought'
      ? text('『动量正常』只表示没有当前有效顶背离，不代表不存在其他风险。', '“Normal momentum” only means there is no active bearish divergence, not that other risks are absent.')
      : text('不能单独根据『动量正常』决定买卖。', 'Do not decide a trade solely from “Normal momentum”.'));
  } else if (state === 'FORMING') {
    result.summary = text('此前价格形成更高高点，但上涨动量没有同步增强。', 'Price previously formed a higher high, but upward momentum did not strengthen alongside it.');
    result.why.push(text(`价格高点${displayPrice(event.high1.price)} → ${displayPrice(event.high2.price)}，对应RSI ${decimal(event.high1.rsi)} → ${decimal(event.high2.rsi)}：价格更高，动量更弱。`, `Price highs ${displayPrice(event.high1.price)} → ${displayPrice(event.high2.price)}, with RSI ${decimal(event.high1.rsi)} → ${decimal(event.high2.rsi)}: higher price, weaker momentum.`));
    result.plain.push(text('形成背离时，价格仍在上涨，但推动上涨的力量已经弱于前一个高点，因此出现动量衰减预警。', 'When this divergence formed, price was still rising, but its upward momentum was weaker than at the earlier high, creating a warning of fading momentum.'));
    result.doesNotMean.push(text('顶背离形成只是风险预警，不代表趋势已经结束，也不是卖出信号。', 'Divergence formation is a risk warning, not proof that the trend has ended or a sell signal.'));
  } else if (state === 'CONFIRMED') {
    result.summary = debug?.riskLevel === 'LOW'
      ? text('此前的顶背离已经得到价格确认，但当前风险较低。', 'The earlier bearish divergence has been confirmed by price, but its current risk is low.')
      : text('此前的顶背离已经得到价格确认。', 'The earlier bearish divergence has been confirmed by price.');
    result.why.push(text('价格形成更高高点，但对应RSI没有同步创新高。随后价格出现达到确认标准的回撤，因此此前的动量背离得到价格行为确认。', 'Price formed a higher high without RSI making a corresponding high. A subsequent pullback met the confirmation condition, confirming the earlier momentum divergence through price action.'));
    result.plain.push(debug?.riskLevel === 'LOW'
      ? debug.riskContributions.trendAdjustment < 0 || debug.riskContributions.recoveryAdjustment < 0
        ? text('历史背离仍然有效，但当前走势已经明显削弱它的威胁。', 'The historical divergence remains valid, but current market action has substantially reduced its threat.')
        : text('历史背离仍有效，当前评估的威胁较低。', 'The historical divergence remains valid, with a lower currently assessed threat.')
      : text('确认描述已经发生的价格反应，风险等级描述当前威胁。', 'Confirmation describes the price response that already occurred; the risk level describes its current threat.'));
    result.doesNotMean.push(text('顶背离确认不是卖出信号。风险降低也不代表事件已经失效；只有满足失效条件后，才会进入『顶背离失效』。风险评分表示当前这次背离的风险强弱，不是未来下跌概率。', 'Divergence confirmation is not a sell signal. Lower risk does not mean the event is invalidated; it enters “Divergence invalidated” only when its invalidation conditions are met. The score describes the current strength of this divergence risk, not a future probability of decline.'));
  } else if (state === 'REALIZED') {
    const realizedByPrice = event.maxDrawdownPct >= STOCK_RSI_RULES.REALIZED_DRAWDOWN * 100;
    result.summary = realizedByPrice
      ? text('此前的顶背离已经通过价格调整得到释放。', 'The earlier bearish-divergence risk has been released through a price adjustment.')
      : text('此前顶背离已兑现，当前保留的是历史提示。', 'The earlier divergence has been realized; the display is a historical reminder.');
    result.why.push(realizedByPrice
      ? text('此前价格创新高而RSI未同步走高，随后价格调整达到兑现标准。', 'Price previously made a higher high without a corresponding RSI high; the subsequent price adjustment met the realization condition.')
      : text('事件已进入兑现阶段，现有记录未单独标记当时的触发原因。', 'The event reached realization, but the available record does not separately identify its trigger.'));
    result.plain.push(realizedByPrice
      ? text('这次顶背离曾经提示上涨动量衰减，随后价格确实发生明显调整。因此这个历史背离不再被当作当前新的顶部风险。', 'This divergence warned of weakening upward momentum, and a substantial price adjustment followed. The historical event is therefore no longer treated as a new current topping risk.')
      : text('这次顶背离已经进入兑现阶段，因此不再被当作当前新的顶部风险；现有记录不能单独说明当时由价格还是RSI触发。', 'This divergence has reached realization and is no longer treated as a new current topping risk; the available record does not separately establish whether price or RSI triggered it.'));
    result.doesNotMean.push(text('『已兑现』只表示这一次背离风险已经释放。不代表股价已经见底，也不是买入信号。', '“Realized” only means the risk from this divergence has been released. It does not mean the stock has bottomed or provide a buy signal.'));
  } else if (state === 'INVALIDATED') {
    result.summary = text('新的价格和动量表现已经否定此前的顶背离。', 'New price and momentum behavior has invalidated the earlier bearish divergence.');
    result.why.push(text('价格和RSI共同恢复，满足了该事件的失效条件。', 'Price and RSI recovery jointly met this event’s invalidation conditions.'));
    result.plain.push(text('此前曾出现背离，之后价格重新突破关键高点、RSI也恢复到足够强的水平。新的动量表现使此前这一笔背离失去当前参考意义。', 'A divergence occurred earlier, but price later broke above the key high and RSI recovered sufficiently. That renewed momentum ended the current relevance of this divergence event.'));
    result.doesNotMean.push(text('顶背离失效不代表以后不会调整。它只表示此前这一笔背离事件已经结束。', 'Invalidated divergence does not rule out future pullbacks. It only means this earlier divergence event has ended.'));
  }

  if (debug) {
    result.rows.push(...evidence.rows.filter(row => ['当前背离风险', 'Current divergence risk', '风险评分', 'Risk score'].includes(row.label)));
    const contributions = debug.riskContributions;
    const contributionLabels = english
      ? ['Event stage', 'Divergence strength', 'MA30 position', 'Trend change', 'Price and RSI recovery', 'Time decay']
      : ['基础状态', '背离强度', 'MA30位置', '趋势变化', '价格与RSI恢复', '时间衰减'];
    const levelLabel = english ? { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' }[debug.riskLevel]
      : { LOW: '低', MEDIUM: '中', HIGH: '高' }[debug.riskLevel];
    result.eventDetails.scoreBreakdown = {
      title: text('风险评分构成', 'Risk score breakdown'),
      rows: [
        ...contributionKeys.map((key, index) => ({ label: contributionLabels[index], value: `${contributions[key] > 0 ? '+' : ''}${decimal(contributions[key], 0)}` })),
        { label: text('最终评分', 'Final score'), value: `${decimal(debug.riskScore, 0)} / ${STOCK_RSI_RISK_RULES.RISK_MAX} · ${levelLabel}` },
      ],
    };
    result.ruleDetails.lines.push(text(`风险评分合并事件阶段、背离强度、MA30位置、趋势变化、价格与RSI恢复、时间衰减；活动事件最低保留${STOCK_RSI_RISK_RULES.RISK_LOW_MIN}分，最高${STOCK_RSI_RISK_RULES.RISK_MAX}分。`, `Risk scoring combines event stage, divergence strength, MA30 position, trend change, combined price and RSI recovery, and time decay. An active event retains at least ${STOCK_RSI_RISK_RULES.RISK_LOW_MIN} points, capped at ${STOCK_RSI_RISK_RULES.RISK_MAX}.`));
    const structureLabel = t(languageKey, `watchlistDetail.maStructure.${debug.trendStructure}`);
    const trendLabel = t(languageKey, `watchlistDetail.maTrend.${debug.trendChange}`);
    result.currentView.push(debug.trendStructure === 'bullish' && debug.trendChange === 'bullish_strengthening'
      ? text('当前仍为多头排列，并处于多头强化状态。', 'The current structure remains bullishly aligned and is strengthening.')
      : text(`当前均线结构为${structureLabel}，趋势变化为${trendLabel}。`, `The current moving-average structure is ${structureLabel}, with ${trendLabel}.`));
    if (contributions.ma30Adjustment > 0 && finite(debug.priceVsMA30) && debug.priceVsMA30 < 0) {
      result.currentView.push(text('当前价格仍在MA30下方，短期价格结构承压。', 'Price remains below MA30, leaving the short-term price structure under pressure.'));
    }
    const priceRecovery = finite(debug.priceRecoveryRatio) && debug.priceRecoveryRatio > 0 && debug.priceRecoveryRatio <= 1
      ? text(`价格已经收复此前约${decimal(debug.priceRecoveryRatio * 100)}%的跌幅。`, `Price has recovered approximately ${decimal(debug.priceRecoveryRatio * 100)}% of its earlier pullback. `) : '';
    result.currentView.push(text(`${priceRecovery}综合现有价格、趋势与动量证据，这次背离目前的风险评分为：${decimal(debug.riskScore, 0)} / ${STOCK_RSI_RISK_RULES.RISK_MAX} · ${levelLabel}。`, `${priceRecovery}Combining the current price, trend and momentum evidence, this divergence has a risk score of ${decimal(debug.riskScore, 0)} / ${STOCK_RSI_RISK_RULES.RISK_MAX} · ${levelLabel}.`));
  }
  if (evidence.zone === 'overbought' && state !== 'NONE') result.doesNotMean.push(text('超买不等于马上下跌。', 'Overbought does not mean an immediate decline.'));
  if (evidence.zone === 'oversold') result.doesNotMean.push(text('超卖不等于马上反弹。', 'Oversold does not mean an immediate rebound.'));
  return result;
}
