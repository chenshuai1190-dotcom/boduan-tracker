import { STOCK_RSI_RULES, STOCK_TREND_RSI_RULES } from './stockRsiConfig.js';
import { validStockRsiDate } from './stockRsiSignal.js';
import { stockTrendRsiPresentation } from './stockTrendRsiPresentation.js';

/** Explain the validated completed-day trend signal without changing its state. */
export function buildStockTrendRsiExplanation({ language = 'zh', currentData = {} } = {}) {
  const english = language === 'en';
  const text = (zh, en) => english ? en : zh;
  const decimal = (value, digits = 1) => new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  const price = value => typeof currentData.currency === 'string' && /^[A-Z]{3}$/.test(currentData.currency)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: currentData.currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
    : decimal(value, 2);
  const signed = (value, digits) => `${value > 0 ? '+' : ''}${decimal(value, digits)}`;
  const asOfDate = validStockRsiDate(currentData.asOfDate) ? currentData.asOfDate : '';
  const result = {
    title: text('RSI(6) · 动量', 'RSI(6) · Momentum'), status: '—', asOfDate,
    summary: '', rows: [], why: [], plain: [], currentView: [], doesNotMean: [],
    ruleDetails: null, eventDetails: null, incomplete: true,
  };
  const signal = currentData.rsiSignal;
  if (!asOfDate || signal?.asOf !== asOfDate) return result;
  const presentation = stockTrendRsiPresentation(signal, english);
  if (!presentation.available) return result;

  result.status = `${presentation.zoneLabel} · ${presentation.momentumLabel}`;
  result.rows.push(
    { label: 'RSI(6)', value: decimal(signal.value) },
    { label: text('当前区间', 'Current zone'), value: presentation.zoneLabel },
    { label: text('背离状态', 'Divergence state'), value: presentation.momentumLabel },
  );
  result.ruleDetails = { rows: [], lines: [
    text(`RSI(6)只使用完整交易日数据：低于${STOCK_TREND_RSI_RULES.RSI_OVERBOUGHT}为正常，达到${STOCK_TREND_RSI_RULES.RSI_OVERBOUGHT}且低于${STOCK_TREND_RSI_RULES.RSI_STRONGLY_OVERBOUGHT}为超买，达到${STOCK_TREND_RSI_RULES.RSI_STRONGLY_OVERBOUGHT}为强超买。`, `RSI(6) uses completed trading days only: below ${STOCK_TREND_RSI_RULES.RSI_OVERBOUGHT} is normal; at least ${STOCK_TREND_RSI_RULES.RSI_OVERBOUGHT} but below ${STOCK_TREND_RSI_RULES.RSI_STRONGLY_OVERBOUGHT} is overbought; at least ${STOCK_TREND_RSI_RULES.RSI_STRONGLY_OVERBOUGHT} is strongly overbought.`),
    text(`参考峰是左右各${STOCK_TREND_RSI_RULES.REFERENCE_PIVOT_WINDOW}个完整交易日确认的收盘峰值，且同日RSI为局部峰值、不低于${STOCK_TREND_RSI_RULES.MIN_REFERENCE_RSI}；比较间隔为${STOCK_RSI_RULES.MIN_PIVOT_DISTANCE}至${STOCK_RSI_RULES.MAX_PIVOT_DISTANCE}个交易日。`, `The reference peak is a closing-price peak confirmed by ${STOCK_TREND_RSI_RULES.REFERENCE_PIVOT_WINDOW} completed trading days on each side, with a same-day local RSI peak of at least ${STOCK_TREND_RSI_RULES.MIN_REFERENCE_RSI}; comparison points are ${STOCK_RSI_RULES.MIN_PIVOT_DISTANCE} to ${STOCK_RSI_RULES.MAX_PIVOT_DISTANCE} trading days apart.`),
    text(`价格高于参考峰而RSI更低，先进入背离观察；价格突破至少${decimal(STOCK_TREND_RSI_RULES.MIN_PRICE_BREAKOUT_PCT)}%、RSI下降至少${STOCK_TREND_RSI_RULES.MIN_RSI_DIVERGENCE_DELTA}点，才进入潜在顶背离。任一幅度未达阈值，都仍只是观察。`, `Price above the reference peak with a lower RSI first enters divergence watch. Potential bearish divergence requires both a price breakout of at least ${decimal(STOCK_TREND_RSI_RULES.MIN_PRICE_BREAKOUT_PCT)}% and an RSI decline of at least ${STOCK_TREND_RSI_RULES.MIN_RSI_DIVERGENCE_DELTA} points; missing either threshold leaves it at watch.`),
    text(`第二高点在右侧${STOCK_RSI_RULES.PIVOT_WINDOW}个完整交易日后确认为有效价格峰，再以该日复权收盘价及RSI与当时的参考峰比较；价格更高且RSI更低，即确认顶背离。峰值确认提供独立证据，不要求先经过潜在顶背离；确认记录最多保留${STOCK_RSI_RULES.CONFIRMED_MAX_AGE}个交易日。`, `After ${STOCK_RSI_RULES.PIVOT_WINDOW} completed trading days to the right confirm the second price peak, its adjusted close and RSI are compared with the reference peak available at that time. A higher price and lower RSI confirm bearish divergence. Peak confirmation provides independent evidence and need not pass through potential bearish divergence first. A confirmation is retained for at most ${STOCK_RSI_RULES.CONFIRMED_MAX_AGE} trading days.`),
    text(`确认后，价格与RSI同时创新高会结束该确认；收盘价较第二峰回撤达到${decimal(STOCK_RSI_RULES.REALIZED_DRAWDOWN * 100, 0)}%、RSI降至${STOCK_RSI_RULES.REALIZED_RSI_THRESHOLD}及以下或超过保留期，也不再保留这次确认。结束后重新按当日比较显示状态。`, `After confirmation, new highs in both price and RSI end that confirmation. It also ends after a closing drawdown of ${decimal(STOCK_RSI_RULES.REALIZED_DRAWDOWN * 100, 0)}% from the second peak, RSI at or below ${STOCK_RSI_RULES.REALIZED_RSI_THRESHOLD}, or expiry of the retention window. The display then reflects the current-day comparison.`),
    text('只有强超买与潜在顶背离或顶背离确认同时出现，才禁止追买；背离观察不触发禁止追买。', 'Chase buying is blocked only when strongly overbought coincides with potential or confirmed bearish divergence. Divergence watch does not block chase buying.'),
  ] };
  result.doesNotMean.push(text('该提示不是卖出信号，不改变均线结构或趋势状态。未禁止追买也不等于买入许可。', 'This is not a sell signal and does not change the moving-average structure or trend state. Absence of a chase-buy block is not permission to buy.'));
  if (!presentation.momentumAvailable) {
    result.summary = text('RSI区间可用，背离状态暂时未知。', 'The RSI zone is available; the divergence state is currently unknown.');
    return result;
  }

  result.incomplete = false;
  const momentum = signal.trendMomentum;
  const state = momentum.divergenceState;
  const eventRows = [];
  const row = (zh, en, value) => eventRows.push({ label: text(zh, en), value });
  const peakValue = peak => `${peak.date} · ${price(peak.price)} · RSI ${decimal(peak.rsi6, 2)}`;
  row('当日完整收盘价（复权）', 'Current completed close (adjusted)', `${asOfDate} · ${price(momentum.currentPrice)}`);
  row('当日RSI(6)', 'Current RSI(6)', decimal(momentum.currentRSI6, 2));
  if (momentum.previousPeak) {
    row('当前参考收盘峰值', 'Current reference closing peak', peakValue(momentum.previousPeak));
    row('参考峰确认日期', 'Reference peak confirmation date', momentum.previousPeak.confirmedAt);
    row('价格突破幅度', 'Price breakout', `${signed(momentum.priceBreakoutPct, 2)}%`);
    row('RSI差（参考峰−当日）', 'RSI difference (reference minus current)', text(`${signed(momentum.rsiDivergenceDelta, 2)}点`, `${signed(momentum.rsiDivergenceDelta, 2)} points`));
  }
  if (momentum.confirmation) {
    row('确认事件的前峰收盘', 'Earlier confirmed-event peak close', peakValue(momentum.confirmation.previousPeak));
    row('前峰确认日期', 'Earlier peak confirmation date', momentum.confirmation.previousPeak.confirmedAt);
    row('确认事件的后峰收盘', 'Later confirmed-event peak close', peakValue(momentum.confirmation.peak));
    row('顶背离确认日期', 'Bearish divergence confirmation date', momentum.confirmation.peak.confirmedAt);
  }
  result.eventDetails = { rows: eventRows, lines: [] };

  if (state === 'NONE') {
    result.summary = text('当前没有检测到顶背离。', 'No bearish divergence is currently identified.');
    result.why.push(momentum.previousPeak
      ? text('当日价格与RSI未构成价格更高、RSI更低的组合，也没有当前有效的确认事件。', 'The current price and RSI do not form a higher-price, lower-RSI pair, and no confirmation event is currently active.')
      : text('当前没有满足比较条件的已确认参考峰，也没有当前有效的确认事件。', 'There is currently no confirmed reference peak eligible for comparison and no active confirmation event.'));
    result.plain.push(text('无背离只描述这一项动量比较。超买或强超买本身不等于顶背离，也不等于马上下跌。', 'No divergence describes this momentum comparison only. Overbought or strongly overbought alone does not mean bearish divergence or an immediate decline.'));
  } else if (state === 'WATCH') {
    result.summary = text('价格走高但RSI偏弱，当前处于背离观察。', 'Price is higher while RSI is weaker; divergence remains under observation.');
    // Describe which threshold is missing using the same unrounded quantities
    // and numerical tolerance as the validated comparison, without changing it.
    const reached = (value, threshold) => value >= threshold || Math.abs(value - threshold) <= 1e-10 * Math.max(1, Math.abs(value), Math.abs(threshold));
    const priceReached = reached(momentum.currentPrice, momentum.previousPeak.price * (1 + STOCK_TREND_RSI_RULES.MIN_PRICE_BREAKOUT_PCT / 100));
    const rsiReached = reached(momentum.previousPeak.rsi6, momentum.currentRSI6 + STOCK_TREND_RSI_RULES.MIN_RSI_DIVERGENCE_DELTA);
    result.why.push(text(`相对参考峰，价格突破${decimal(momentum.priceBreakoutPct, 2)}%，RSI下降${decimal(momentum.rsiDivergenceDelta, 2)}点；${!priceReached && !rsiReached ? '两项幅度均未达阈值' : !priceReached ? '价格突破幅度未达阈值' : 'RSI下降幅度未达阈值'}。`, `Relative to the reference peak, price is ${decimal(momentum.priceBreakoutPct, 2)}% higher and RSI is ${decimal(momentum.rsiDivergenceDelta, 2)} points lower; ${!priceReached && !rsiReached ? 'neither threshold has been reached' : !priceReached ? 'the price-breakout threshold has not been reached' : 'the RSI-decline threshold has not been reached'}.`));
    result.plain.push(text('这是一条早期观察，尚未达到潜在顶背离条件。', 'This is an early observation that has not yet met the conditions for potential bearish divergence.'));
  } else if (state === 'POTENTIAL') {
    result.summary = text('价格突破与RSI回落已达阈值，出现潜在顶背离。', 'The price breakout and RSI decline meet the thresholds for potential bearish divergence.');
    result.why.push(text(`相对已确认参考峰，价格高${decimal(momentum.priceBreakoutPct, 2)}%，RSI低${decimal(momentum.rsiDivergenceDelta, 2)}点；当日高点还需后续完整交易日确认。`, `Price is ${decimal(momentum.priceBreakoutPct, 2)}% above the confirmed reference peak, while RSI is ${decimal(momentum.rsiDivergenceDelta, 2)} points lower; the current high still needs confirmation from subsequent completed trading days.`));
    result.plain.push(text('价格创新高时，动量没有同步增强；第二高点尚未确认为价格峰。', 'Momentum has not strengthened alongside the higher price; the second high has not yet been confirmed as a price peak.'));
  } else {
    result.summary = text('两个价格峰与对应RSI已确认顶背离。', 'Two confirmed price peaks and their RSI readings confirm bearish divergence.');
    const { previousPeak, peak } = momentum.confirmation;
    result.why.push(text(`两峰当日收盘价从${price(previousPeak.price)}升至${price(peak.price)}，对应RSI从${decimal(previousPeak.rsi6, 2)}降至${decimal(peak.rsi6, 2)}；第二峰在${peak.confirmedAt}完成确认。`, `The closes on the two peak dates rose from ${price(previousPeak.price)} to ${price(peak.price)}, while RSI fell from ${decimal(previousPeak.rsi6, 2)} to ${decimal(peak.rsi6, 2)}. The second peak was confirmed on ${peak.confirmedAt}.`));
    result.plain.push(text('确认指两个价格峰及其动量关系已成立，不能单独据此判断上涨趋势结束。', 'Confirmation establishes the two price peaks and their momentum relationship; it does not by itself establish the end of an uptrend.'));
  }
  result.rows.push({ label: text('追买限制', 'Chase-buy restriction'), value: presentation.chaseBuyBlocked
    ? text('禁止追买', 'Chase buying blocked') : text('未触发', 'Not triggered') });
  result.currentView.push(presentation.chaseBuyBlocked
    ? text('当前强超买与潜在顶背离或顶背离确认同时出现，触发禁止追买。', 'Strongly overbought currently coincides with potential or confirmed bearish divergence, blocking chase buying.')
    : state === 'WATCH'
      ? text('当前仅作背离观察，不触发禁止追买。', 'The current state is divergence watch only; it does not block chase buying.')
      : text('当前未同时满足强超买与潜在或确认顶背离，未触发禁止追买。', 'Strongly overbought does not currently coincide with potential or confirmed bearish divergence, so the chase-buy block is not triggered.'));
  return result;
}
