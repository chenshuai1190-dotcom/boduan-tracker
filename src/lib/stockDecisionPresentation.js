import { stockRsiPresentation } from './stockRsiPresentation.js';
import { STOCK_RSI_RULES } from './stockRsiConfig.js';

const money = value => typeof value === 'number' && Number.isFinite(value)
  ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const multiple = value => typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)}×` : '—';
const zoneText = zone => zone ? `${money(zone.lower)} – ${money(zone.upper)}` : '—';
const PAIRS = {
  uptrend: ['维持上行', 'Uptrend intact'], downtrend: ['下行结构', 'Downtrend'], recovery: ['结构修复', 'Recovering structure'],
  rebound: ['下跌后反弹', 'Rebound after decline'], mixed: ['结构未明', 'Mixed structure'], insufficient: ['资料不足', 'Insufficient data'],
  above_support: ['支撑上方', 'Above support'], near_resistance: ['靠近压力', 'Near resistance'], support_broken: ['支撑已跌破', 'Support broken'],
  inside_zone: ['位于参考区域', 'Within a reference zone'], unavailable: ['尚无有效区域', 'No active reference zone'],
  breakout: ['放量突破', 'Breakout with volume'], continuation: ['突破后延续', 'Breakout holding'], pullback: ['缩量回踩', 'Lower-volume pullback'],
  weakness: ['放量走弱', 'Weakening on volume'], low_rebound: ['反弹量能偏弱', 'Low-volume rebound'], neutral: ['常态观察', 'Volume observation'],
  pause: ['触发暂缓条件', 'Pause conditions triggered'], wait: ['等待确认', 'Await confirmation'], observe: ['可进一步观察', 'Eligible for further review'],
};
const REASONS = {
  insufficient_history: ['完成日线不足', 'Not enough completed daily prices'], stale_history: ['等待最新完成日线', 'Awaiting the latest completed session'],
  insufficient_structure: ['尚未形成足够的已确认高低点', 'Too few confirmed price pivots'], insufficient_momentum: ['动量数据不足', 'Momentum data is incomplete'],
  insufficient_volume: ['量能基准不足', 'Volume baseline is incomplete'],
  support_broken: ['收盘失守原支撑区域', 'The close lost the former support zone'], recent_closing_low: ['收盘创近期新低', 'The close made a recent low'],
  rsi_extreme: ['RSI (6) 达到90，触发极高读数条件', 'RSI (6) reaches 90, triggering the extreme-reading condition'], overbought_divergence: ['超买与潜在背离同时出现', 'Overbought RSI coincides with forming divergence'],
  rsi_overbought: ['RSI (6) 进入超买区', 'RSI (6) is overbought'], rsi_oversold: ['RSI (6) 进入超卖区，止跌仍待确认', 'RSI (6) is oversold; stabilization is unconfirmed'],
  bearish_divergence_forming: ['潜在背离仍待价格确认', 'Forming divergence awaits price confirmation'],
  bearish_divergence_confirmed: ['动量已确认转弱', 'Momentum weakness is confirmed'],
  near_resistance: ['价格接近上方压力区域', 'Price is approaching resistance'], low_volume_rebound: ['反弹成交量低于此前常态', 'Rebound volume is below its recent baseline'],
  volume_weakness: ['价格走弱伴随成交放大', 'Price weakness is accompanied by higher volume'], downtrend: ['下行结构尚未扭转', 'The declining structure has not yet reversed'],
  mixed_structure: ['价格结构尚未确认方向', 'Price structure has no confirmed direction'], breakout_holding: ['前次放量突破尚未失效', 'The previous volume-backed breakout is still holding'],
  pullback_unconfirmed: ['缩量回踩仍需支撑确认', 'A lower-volume pullback still needs support confirmation'], structure_improving: ['价格结构改善，继续观察延续性', 'Structure is improving; watch for continuation'],
  price_zone_unconfirmed: ['区域内的价格方向仍待确认', 'Price direction within the reference zone is unconfirmed'],
};

export function stockDecisionPresentation(data, english = false) {
  const text = (zh, en) => english ? en : zh;
  const label = key => PAIRS[key]?.[english ? 1 : 0] || text('资料不足', 'Insufficient data');
  const model = data.model;
  const { trend, position, volume, momentum } = model;
  const rsi = stockRsiPresentation(momentum, english);
  const price = model.price;
  const reference = position.state === 'support_broken' ? position.brokenSupport : position.support;
  const insideZone = [position.support, position.resistance].find(zone => zone && price >= zone.lower && price <= zone.upper);
  const positionMetricZone = position.state === 'near_resistance' ? position.resistance
    : position.state === 'inside_zone' ? insideZone : reference;
  const pivotDetails = zone => zone?.pivots.map(pivot => `${pivot.date} ${money(pivot.price)} → ${text('确认', 'confirmed')} ${pivot.confirmedAt}`).join('；') || '';
  const volumeEvent = volume.breakout;
  const volumeDetail = [
    text(`当日成交量 / 此前 20 日均量：${multiple(volume.ratio)}`, `Daily volume / previous 20-session mean: ${multiple(volume.ratio)}`),
    text(`相对 20 日中位数：${multiple(volume.medianRatio)}`, `Relative to the 20-session median: ${multiple(volume.medianRatio)}`),
    volumeEvent ? text(`${volumeEvent.date} 放量突破 ${money(volumeEvent.upper)}，当时 ${multiple(volumeEvent.ratio)}；距今 ${volumeEvent.ageBars} 个交易日，${volumeEvent.active ? '尚未失效' : '已失效或到期'}`, `${volumeEvent.date} breakout above ${money(volumeEvent.upper)} on ${multiple(volumeEvent.ratio)} volume; ${volumeEvent.ageBars} sessions ago, ${volumeEvent.active ? 'still active' : 'invalidated or expired'}`) : '',
    text('突破后的成交量回落不直接否定突破；后续检查价格区域，最长保留 10 个后续交易日。', 'Lower volume after a breakout does not invalidate it by itself. The price zone is checked for up to 10 subsequent sessions.'),
  ].filter(Boolean).join('。');
  const activeMomentum = ['FORMING', 'CONFIRMED'].includes(momentum.divergenceState);
  const momentumReading = rsi.available ? `RSI (6) ${rsi.zoneLabel} · ${rsi.momentumLabel}` : text('动量资料不足', 'Momentum unavailable');
  const momentumDetail = text('使用完成复权日线的 Wilder RSI(6)。20 / 80 划分超卖、中性、超买；达到90是独立的暂缓条件。', 'Wilder RSI(6) uses completed adjusted closes. The 20 / 80 boundaries define oversold, neutral and overbought; reaching 90 is a separate pause condition.')
    + (rsi.momentumAvailable ? text(` 动量状态：${rsi.momentumLabel}${momentum.divergenceDate ? `，进入日期 ${momentum.divergenceDate}` : ''}。`, ` Momentum: ${rsi.momentumLabel}${momentum.divergenceDate ? `, entered on ${momentum.divergenceDate}` : ''}.`)
      : text(' 动量状态资料不足。', ' Momentum-state data is incomplete.'));
  const summary = model.reasons.map(reason => REASONS[reason]?.[english ? 1 : 0]).filter(Boolean).slice(0, 2).join(text('；', '; '));
  const nextSteps = [];
  if (position.brokenSupport) nextSteps.push(text(`观察收盘能否收复 ${zoneText(position.brokenSupport)} 的原支撑区`, `Watch whether a close reclaims former support at ${zoneText(position.brokenSupport)}`));
  else if (volumeEvent?.active) nextSteps.push(text(`观察后续收盘能否守住突破区 ${money(volumeEvent.lower)} – ${money(volumeEvent.upper)}`, `Watch whether closes hold the breakout zone ${money(volumeEvent.lower)} – ${money(volumeEvent.upper)}`));
  else if (position.resistance) nextSteps.push(text(`观察 ${zoneText(position.resistance)} 压力附近的价格与量能配合`, `Watch price and volume around resistance at ${zoneText(position.resistance)}`));
  else if (position.support) nextSteps.push(text(`观察回踩时 ${zoneText(position.support)} 是否保持有效`, `Watch whether support at ${zoneText(position.support)} holds during pullbacks`));
  if (rsi.available && (momentum.value >= STOCK_RSI_RULES.RSI_OVERBOUGHT || activeMomentum)) nextSteps.push(text('观察超买条件及动量状态的后续变化', 'Watch subsequent changes in the overbought condition and momentum state'));
  else nextSteps.push(text('观察后续高低点及回踩量能，不要求每天重复放量', 'Watch subsequent pivots and pullback volume; daily volume spikes are not required'));
  return {
    symbol: data.symbol, name: data.name, asOf: data.asOf, price, changePct: model.changePct,
    verdict: data.stale ? 'wait' : model.verdict,
    verdictLabel: data.stale ? text('等待更新', 'Awaiting fresh data') : label(model.verdict),
    summary: data.stale ? text(`目前为 ${data.asOf} 的历史判断，等待更新后再确认。`, `This assessment uses ${data.asOf} data. Refresh before reassessing.`) : summary || text('按已完成日线继续观察。', 'Continue observing completed sessions.'),
    trendLabel: label(trend.state), history: model.history.map(row => row.close), dates: model.history.map(row => row.date),
    support: position.support?.upper ?? null, resistance: position.resistance?.lower ?? null,
    supportZone: position.support, resistanceZone: position.resistance,
    checks: [
      { id: 'trend', label: text('趋势', 'Trend'), status: trend.state === 'insufficient' ? 'missing' : ['downtrend', 'rebound', 'mixed'].includes(trend.state) ? 'caution' : 'clear', reading: label(trend.state),
        metric: text(`前高 ${money(trend.lastHigh)}`, `Prior high ${money(trend.lastHigh)}`), detail: text('比较近期已确认高低点；枢轴需等待后续 3 根日线完成后确认。', 'Compare confirmed price pivots; each pivot requires 3 subsequent completed bars.') },
      { id: 'position', label: text('位置', 'Position'), status: ['support_broken', 'near_resistance'].includes(position.state) ? 'caution' : position.state === 'unavailable' ? 'missing' : 'neutral', reading: label(position.state),
        metric: zoneText(positionMetricZone), detail: [
          reference ? text(`${position.state === 'support_broken' ? '原支撑' : '参考支撑'} ${zoneText(reference)}。${pivotDetails(reference)}`, `${position.state === 'support_broken' ? 'Former support' : 'Support'} ${zoneText(reference)}. ${pivotDetails(reference)}`) : text('尚未识别有效支撑。', 'No active support identified.'),
          position.resistance ? text(`参考压力 ${zoneText(position.resistance)}。${pivotDetails(position.resistance)}`, `Resistance ${zoneText(position.resistance)}. ${pivotDetails(position.resistance)}`) : text('上方尚无已识别压力。', 'No overhead resistance identified.'),
          text('近 120 日，左右 3 根确认，相近价位按 0.5 ATR(14) 合并。区域仅为历史参考。', '120-session lookback, 3 bars on each side; nearby pivots cluster within 0.5 ATR(14). Zones are historical references.'),
        ].join(' ') },
      { id: 'volume', label: text('量能', 'Volume'), status: volume.state === 'insufficient' ? 'missing' : ['weakness', 'low_rebound', 'pullback'].includes(volume.state) ? 'caution' : 'neutral', reading: label(volume.state),
        metric: text(`当日 ${multiple(volume.ratio)}${volumeEvent?.active ? ` · ${volumeEvent.date.slice(5)} 放量突破` : ''}`, `Session ${multiple(volume.ratio)}${volumeEvent?.active ? ` · ${volumeEvent.date.slice(5)} breakout` : ''}`), detail: volumeDetail },
      { id: 'momentum', label: text('动量', 'Momentum'), status: !rsi.available || !rsi.momentumAvailable ? 'missing' : momentum.value >= STOCK_RSI_RULES.RSI_OVERBOUGHT || activeMomentum ? 'caution' : 'neutral', reading: momentumReading,
        metric: rsi.available ? momentum.value.toFixed(1) : '—', detail: momentumDetail },
    ],
    nextSteps: nextSteps.slice(0, 2),
  };
}
