import { STOCK_MA_TREND_CONFIG as rules } from './stockMaTrendConfig.js';

const structureLabels = {
  bullish: ['多头排列', 'Bullish alignment'], bearish: ['空头排列', 'Bearish alignment'],
  long_term_up: ['长期趋势向上', 'Long-term uptrend'], long_term_down: ['长期趋势向下', 'Long-term downtrend'],
  at_ma200: ['位于MA200', 'At MA200'], unavailable: ['—', '—'],
};
const trendLabels = {
  bullish_strengthening: ['多头强化', 'Bullish strengthening'], bullish_weakening: ['多头减弱', 'Bullish weakening'],
  bearish_strengthening: ['空头强化', 'Bearish strengthening'], bearish_weakening: ['空头减弱', 'Bearish weakening'],
  improving: ['结构改善', 'Structure improving'], structural_weakening: ['结构转弱', 'Structure weakening'],
  strengthening: ['短中期转强', 'Short/medium-term strengthening'], weakening: ['短中期转弱', 'Short/medium-term weakening'],
  stable: ['趋势稳定', 'Stable trend'], unavailable: ['—', '—'],
};
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const count = value => Number.isSafeInteger(value) && value >= 0;
// Matching the existing threshold's rounding tolerance selects explanatory text;
// the supplied status is always authoritative and is never recalculated here.
const compare = (value, threshold) => Math.abs(value - threshold) <= Math.min(Number.EPSILON * 8, Math.abs(threshold) * 1e-8)
  ? 0 : value > threshold ? 1 : -1;

/** Display-only evidence for an existing completed-day MA judgment. */
function buildDetailedMaExplanation({ ticker, indicatorType, language = 'zh', currentData = {}, technicalState = {} } = {}) {
  currentData = currentData && typeof currentData === 'object' ? currentData : {};
  technicalState = technicalState && typeof technicalState === 'object' ? technicalState : {};
  const en = language === 'en';
  const text = (zh, english) => en ? english : zh;
  const fmt = value => new Intl.NumberFormat(en ? 'en-US' : 'zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const pct = (value, digits = 4) => `${value > 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;
  const pp = value => `${value > 0 ? '+' : ''}${(value * 100).toFixed(4)}${text('个百分点', ' percentage points')}`;
  const price = value => {
    const currency = typeof currentData.currency === 'string' ? currentData.currency.toUpperCase() : '';
    return `${({ USD: '$', CNY: '¥', HKD: 'HK$', EUR: '€', GBP: '£' })[currency] || (currency ? currency + ' ' : '')}${fmt(value)}`;
  };
  const isStructure = indicatorType === 'maStructure';
  const validType = isStructure || indicatorType === 'trendChange';
  const state = (isStructure ? technicalState.maStructure : technicalState.maTrend) || {};
  const labels = isStructure ? structureLabels : trendLabels;
  const asOfDate = validDate(currentData.asOfDate) ? currentData.asOfDate : '';
  const heading = isStructure ? text('均线结构', 'Moving-average structure') : text('趋势变化', 'Trend change');
  const statusLabel = validType ? labels[state.status]?.[en ? 1 : 0] || '—' : '—';
  const result = {
    title: statusLabel === '—' ? heading : statusLabel,
    status: statusLabel,
    asOfDate, rows: [], why: [], plain: [], doesNotMean: [], incomplete: false,
  };
  const row = (label, value) => result.rows.push({ label, value });
  const history = Array.isArray(currentData.history) ? currentData.history : [];
  const latest = Object.hasOwn(currentData, 'latestRow') ? currentData.latestRow : history.at(-1);
  const latestMatches = latest && validDate(latest.date) && latest.date === asOfDate;
  if (latestMatches) {
    for (const [field, label] of [['close', text('完整日收盘价', 'Completed daily close')], ['ma30', 'MA30'], ['ma60', 'MA60'], ['ma200', 'MA200']]) {
      if (positive(latest[field])) row(label, price(latest[field]));
      else result.incomplete = true;
    }
  } else result.incomplete = true;
  if (!validType || !asOfDate || state.asOfDate !== asOfDate || !labels[state.status] || state.status === 'unavailable') {
    result.incomplete = true;
    result.why.push(text('缺少同一完整交易日的有效判断，暂时无法解释该指标。', 'A valid judgment for the same completed trading day is unavailable.'));
    result.plain.push(text('已有数值仅作已知数据展示，缺失部分不代表零或正常。', 'Available values are shown as evidence; missing values do not mean zero or normal.'));
    result.doesNotMean.push(text('数据不足不代表没有风险。', 'Insufficient data does not mean there is no risk.'));
    return result;
  }

  if (isStructure) {
    const why = {
      bullish: ['完整日收盘价高于MA30，MA30高于MA60，MA60高于MA200。', 'The completed close is above MA30, MA30 is above MA60, and MA60 is above MA200.'],
      bearish: ['完整日收盘价低于MA30，MA30低于MA60，MA60低于MA200。', 'The completed close is below MA30, MA30 is below MA60, and MA60 is below MA200.'],
      long_term_up: ['完整日收盘价高于MA200，但没有形成完整多头排列。', 'The completed close is above MA200, without a complete bullish alignment.'],
      long_term_down: ['完整日收盘价低于MA200，但没有形成完整空头排列。', 'The completed close is below MA200, without a complete bearish alignment.'],
      at_ma200: ['完整日收盘价与MA200相等。', 'The completed close equals MA200.'],
    };
    if (!result.incomplete) result.why.push(why[state.status][en ? 1 : 0]);
    const plain = {
      bullish: ['价格站在三条均线上方，短期均线高于中长期均线，当前具备完整的多头结构。', 'Price is above all three moving averages, with the shorter averages above the longer ones: a complete bullish structure.'],
      bearish: ['价格在三条均线下方，短期均线也低于中长期均线，当前具备完整的空头结构。', 'Price is below all three moving averages, with the shorter averages below the longer ones: a complete bearish structure.'],
      long_term_up: ['价格仍位于长期均线上方，但股价和短中期均线的位置还没有同时满足完整多头排列。长期位置与短中期结构可以有所不同。', 'Price is above the long-term average, but price and the shorter averages have not formed a complete bullish alignment. Long-term positioning and shorter-term structure can differ.'],
      long_term_down: ['价格处于长期均线之下，长期位置偏弱；短中期位置尚未同时满足完整空头排列。', 'Price is below the long-term average, a weaker long-term position, while the shorter-term positions do not form a complete bearish alignment.'],
      at_ma200: ['价格正好落在长期均线上，目前不能归入高于或低于MA200的状态，变化方向需要单独观察。', 'Price sits exactly on the long-term average, so it is neither above nor below MA200. Direction must be assessed separately.'],
    };
    result.plain.push(plain[state.status][en ? 1 : 0]);
    result.doesNotMean.push(text('单日排列不能证明趋势正在改善或转弱；变化方向由“趋势变化”单独判断。', 'One day’s alignment cannot prove improvement or weakening; Trend change evaluates direction separately.'));
    const limit = {
      bullish: ['多头排列不保证不会回撤，也不等于当前价格适合买入。', 'A bullish alignment does not prevent pullbacks or mean the current price is suitable for buying.'],
      bearish: ['空头排列不排除短期反弹，也不能据此认定价格会一直下跌。', 'A bearish alignment does not rule out a rebound or guarantee continued declines.'],
      long_term_up: ['站在MA200上方不代表短中期已经转强，也不保证价格不会再次跌破它。', 'Being above MA200 does not prove shorter-term strength or guarantee price will remain above it.'],
      long_term_down: ['处于MA200下方不排除反弹或修复，也不代表此刻一定要卖出。', 'Being below MA200 does not rule out a rebound or recovery, or mean an immediate sale is required.'],
      at_ma200: ['与MA200相等不是已经突破或跌破，更不表示没有风险。', 'Equality with MA200 is neither a confirmed breakout nor a breakdown, and does not mean there is no risk.'],
    };
    result.doesNotMean.push(limit[state.status][en ? 1 : 0]);
  } else {
    const t = state;
    const structure = technicalState.maStructure || {};
    const slopeLimit = `${(rules.slopeThreshold * 100).toFixed(2)}%`;
    const gapLimit = `${(rules.gapChangeThreshold * 100).toFixed(2)}${text('个百分点', ' percentage points')}`;
    const dailyLimit = `${(rules.dailyGapChangeMin * 100).toFixed(2)}${text('个百分点', ' percentage points')}`;
    const metricsComplete = ['ma30Slope', 'ma60Slope', 'gapToday', 'gapAtComparison', 'gapChange'].every(key => finite(t[key]));
    const up = metricsComplete && compare(t.ma30Slope, rules.slopeThreshold) > 0;
    const down = metricsComplete && compare(t.ma30Slope, -rules.slopeThreshold) < 0;
    const gapUp = metricsComplete && compare(t.gapChange, rules.gapChangeThreshold) > 0;
    const gapDown = metricsComplete && compare(t.gapChange, -rules.gapChangeThreshold) < 0;
    const notFalling60 = metricsComplete && compare(t.ma60Slope, -rules.slopeThreshold) >= 0;
    const notRising60 = metricsComplete && compare(t.ma60Slope, rules.slopeThreshold) <= 0;
    if (validDate(t.comparisonDate) && t.comparisonDate < asOfDate) {
      row(text('比较区间', 'Comparison window'), `${t.comparisonDate} → ${asOfDate}`);
    } else result.incomplete = true;
    for (const [key, label, formatter] of [
      ['ma30Slope', text(`${rules.lookback}交易日MA30变化`, `MA30 change over ${rules.lookback} trading days`), pct],
      ['ma60Slope', text(`${rules.lookback}交易日MA60变化`, `MA60 change over ${rules.lookback} trading days`), pct],
      ['gapAtComparison', text(t.gapAtComparison >= 0 ? '期初MA30相对MA60领先幅度' : '期初MA30相对MA60位置', 'Initial MA30 position relative to MA60'), pct],
      ['gapToday', text(t.gapToday >= 0 ? '当前MA30相对MA60领先幅度' : '当前MA30相对MA60位置', 'Current MA30 position relative to MA60'), pct],
      ['gapChange', text('MA30相对MA60位置变化', 'Change in MA30 position relative to MA60'), pp],
    ]) {
      if (finite(t[key])) row(label, formatter(t[key]));
    }
    if (!metricsComplete || structure.asOfDate !== asOfDate || !structureLabels[structure.status] || structure.status === 'unavailable') result.incomplete = true;
    const evidenceComplete = count(t.contractingDays) && t.contractingDays <= rules.contractionLookback - 1
      && typeof t.contractionPersistent === 'boolean';
    const needsContractionEvidence = gapDown && (t.status === 'bullish_weakening' && (!down || t.contractionPersistent)
      || t.status === 'stable' && structure.status === 'bullish');
    if (needsContractionEvidence) {
      if (evidenceComplete) row(text(`最近${rules.contractionLookback}条日线有效收窄`, `Meaningful contractions in the last ${rules.contractionLookback} daily records`),
        text(`${t.contractingDays} / ${rules.contractionLookback - 1}次比较`, `${t.contractingDays} / ${rules.contractionLookback - 1} comparisons`));
      else result.incomplete = true;
    }
    if (t.status === 'bullish_strengthening') {
      const observed = history.slice(-rules.contractionLookback);
      const available = observed.length === rules.contractionLookback && observed.at(-1)?.date === asOfDate
        && observed.every((item, index) => validDate(item?.date) && item.date <= asOfDate
          && (!index || item.date > observed[index - 1].date) && positive(item.ma30) && positive(item.ma60));
      if (available) {
        const gap = item => (item.ma30 - item.ma60) / item.ma60;
        const expanding = observed.slice(1).filter((item, index) => compare(gap(item) - gap(observed[index]), rules.dailyGapChangeMin) >= 0).length;
        row(text(`最近${rules.contractionLookback}条日线有效扩大（仅观察）`, `Meaningful expansions in ${rules.contractionLookback} records (observation only)`),
          text(`${expanding} / ${rules.contractionLookback - 1}次比较`, `${expanding} / ${rules.contractionLookback - 1} comparisons`));
      }
    }

    const crossState = t.status === 'strengthening' || t.status === 'weakening';
    if (crossState && validDate(t.crossDate) && count(t.crossAge)) {
      row(text('交叉确认日', 'Cross confirmation date'), t.crossDate);
      row(text('确认后交易日', 'Trading days since confirmation'), text(`${t.crossAge}日（当日计0）`, `${t.crossAge} (confirmation day is 0)`));
    } else if (crossState) result.incomplete = true;

    const push = (zh, english) => result.why.push(text(zh, english));
    if (metricsComplete && latestMatches && structure.asOfDate === asOfDate) {
      switch (t.status) {
        case 'bullish_strengthening':
          push(`仍为多头排列；MA30上涨超过${slopeLimit}，MA60未下跌超过${slopeLimit}，相对均线间距扩大超过${gapLimit}。`,
            `The bullish alignment remains; MA30 rose by more than ${slopeLimit}, MA60 did not fall by more than ${slopeLimit}, and the relative gap widened by more than ${gapLimit}.`);
          break;
        case 'bullish_weakening':
          if (down) push(`MA30在比较区间下跌超过${slopeLimit}，直接触发多头减弱；这条路径不要求持续收窄。`,
            `MA30 fell by more than ${slopeLimit} over the comparison window. This directly triggers bullish weakening without requiring persistent contraction.`);
          if (gapDown && evidenceComplete && t.contractionPersistent) push(`相对均线间距收窄超过${gapLimit}；最近${rules.contractionLookback}条日线的${rules.contractionLookback - 1}次相邻比较中，${t.contractingDays}次收窄达到${dailyLimit}，满足至少${rules.contractionMinDays}次的要求。`,
            `The relative gap narrowed by more than ${gapLimit}; ${t.contractingDays} of ${rules.contractionLookback - 1} adjacent comparisons in the last ${rules.contractionLookback} daily records narrowed by at least ${dailyLimit}, meeting the minimum of ${rules.contractionMinDays}.`);
          if (!result.why.length) result.incomplete = true;
          break;
        case 'bearish_strengthening':
          push(`仍为空头排列；MA30下跌超过${slopeLimit}，MA60未上涨超过${slopeLimit}，相对均线位置向负方向变化超过${gapLimit}。`,
            `The bearish alignment remains; MA30 fell by more than ${slopeLimit}, MA60 did not rise by more than ${slopeLimit}, and the relative gap moved further negative by more than ${gapLimit}.`);
          break;
        case 'bearish_weakening':
          if (up) push(`MA30上涨超过${slopeLimit}，空头结构中的短期均线开始回升。`, `MA30 rose by more than ${slopeLimit}, showing a short-term recovery within the bearish alignment.`);
          if (gapUp) push(`相对均线间距改善超过${gapLimit}；这一条件可单独触发空头减弱。`, `The relative MA gap improved by more than ${gapLimit}; this condition can independently trigger bearish weakening.`);
          if (!result.why.length) result.incomplete = true;
          break;
        case 'improving':
          push(`尚非完整多头或空头排列；MA30上涨超过${slopeLimit}，且相对均线间距改善超过${gapLimit}。`,
            `There is no complete bullish or bearish alignment; MA30 rose by more than ${slopeLimit} and the relative gap improved by more than ${gapLimit}.`);
          break;
        case 'structural_weakening':
          if (structure.status === 'long_term_up') {
            if (down) push(`MA30下跌超过${slopeLimit}；长期趋势向上时，这一条件可单独触发结构转弱。`, `MA30 fell by more than ${slopeLimit}; within a long-term uptrend, this alone can trigger structural weakening.`);
            if (gapDown) push(`相对均线间距向弱方向变化超过${gapLimit}；长期趋势向上时，这一条件也可单独触发。`, `The relative gap weakened by more than ${gapLimit}; within a long-term uptrend, this can also trigger independently.`);
          } else push(`MA30下跌超过${slopeLimit}，且相对均线间距向弱方向变化超过${gapLimit}，两个条件同时满足。`,
            `MA30 fell by more than ${slopeLimit} and the relative gap weakened by more than ${gapLimit}; both conditions are required and met.`);
          break;
        case 'strengthening':
        case 'weakening': {
          const upward = t.status === 'strengthening';
          if (validDate(t.crossDate) && count(t.crossAge)) push(
            `MA30已${upward ? '上穿' : '下穿'}MA60，相对间距达到${upward ? '+' : '−'}${(rules.crossThreshold * 100).toFixed(2)}%确认线；当前仍保持该方向，且确认后尚未经过${rules.crossLookback}个交易日，因此优先显示${upward ? '短中期转强' : '短中期转弱'}。`,
            `MA30 crossed ${upward ? 'above' : 'below'} MA60 and reached the ${upward ? '+' : '−'}${(rules.crossThreshold * 100).toFixed(2)}% relative-gap confirmation threshold. The direction remains confirmed within ${rules.crossLookback} trading days, so the crossover takes priority.`);
          break;
        }
        case 'stable': {
          push('当前没有仍满足确认阈值的近期交叉信号优先显示。', 'There is no recent crossover that still meets its confirmation threshold and takes priority.');
          const noUp = `MA30涨幅未超过${slopeLimit}`;
          const noUpEn = `MA30 did not rise by more than ${slopeLimit}`;
          const noGapUp = `相对间距扩大未超过${gapLimit}`;
          const noGapUpEn = `the relative gap did not widen by more than ${gapLimit}`;
          const noDown = `MA30跌幅未超过${slopeLimit}`;
          const noDownEn = `MA30 did not fall by more than ${slopeLimit}`;
          const noGapDown = `相对间距收窄未超过${gapLimit}`;
          const noGapDownEn = `the relative gap did not narrow by more than ${gapLimit}`;
          if (structure.status === 'bullish') {
            const unmet = [!up && [noUp, noUpEn], !notFalling60 && [`MA60下跌超过${slopeLimit}`, `MA60 fell by more than ${slopeLimit}`], !gapUp && [noGapUp, noGapUpEn]].filter(Boolean);
            if (unmet.length) push(`未满足多头强化：${unmet.map(x => x[0]).join('；')}。`, `Bullish strengthening is not met: ${unmet.map(x => x[1]).join('; ')}.`);
            if (!down) push(`${noDown}，没有触发直接减弱路径。`, `${noDownEn}, so the direct weakening condition is not triggered.`);
            if (gapDown && evidenceComplete && !t.contractionPersistent) push(`间距虽然收窄，但仅${t.contractingDays}次达到每日${dailyLimit}，未满足至少${rules.contractionMinDays}次的持续性要求。`,
              `The gap narrowed, but only ${t.contractingDays} changes reached ${dailyLimit} per day, below the persistence minimum of ${rules.contractionMinDays}.`);
            else if (!gapDown) push(`${noGapDown}，没有触发间距减弱路径。`, `${noGapDownEn}, so the gap-based weakening condition is not triggered.`);
          } else if (structure.status === 'bearish') {
            const unmet = [!down && [noDown, noDownEn], !notRising60 && [`MA60上涨超过${slopeLimit}`, `MA60 rose by more than ${slopeLimit}`], !gapDown && [noGapDown, noGapDownEn]].filter(Boolean);
            if (unmet.length) push(`未满足空头强化：${unmet.map(x => x[0]).join('；')}。`, `Bearish strengthening is not met: ${unmet.map(x => x[1]).join('; ')}.`);
            if (!up && !gapUp) push(`${noUp}，且${noGapUp}，未触发空头减弱。`, `${noUpEn} and ${noGapUpEn}; bearish weakening is not triggered.`);
          } else {
            const unmetImprovement = [!up && [noUp, noUpEn], !gapUp && [noGapUp, noGapUpEn]].filter(Boolean);
            if (unmetImprovement.length) push(`结构改善条件未齐：${unmetImprovement.map(x => x[0]).join('；')}。`, `Improvement conditions are incomplete: ${unmetImprovement.map(x => x[1]).join('; ')}.`);
            if (structure.status === 'long_term_up') push(`${noDown}，且${noGapDown}，两条独立转弱路径均未触发。`, `${noDownEn} and ${noGapDownEn}; neither independent weakening condition is triggered.`);
            else {
              const unmetWeakening = [!down && [noDown, noDownEn], !gapDown && [noGapDown, noGapDownEn]].filter(Boolean);
              push(`结构转弱需要两个条件同时满足；当前${unmetWeakening.map(x => x[0]).join('；')}。`, `Structural weakening requires both conditions; currently ${unmetWeakening.map(x => x[1]).join('; ')}.`);
            }
          }
          break;
        }
      }
    }
    const plain = {
      bullish_strengthening: ['多头排列仍在，MA30走高且相对MA60的领先优势扩大，当前多头结构正在增强。', 'The bullish alignment remains, with MA30 rising and extending its relative lead over MA60. The bullish structure is strengthening.'],
      bearish_strengthening: ['空头排列仍在，MA30继续走低且相对MA60更加落后，当前下行结构正在增强。', 'The bearish alignment remains, with MA30 falling and moving further below MA60 in relative terms. The downward structure is strengthening.'],
      bearish_weakening: ['仍处于空头排列，但MA30回升或相对MA60的位置改善，原有下行结构正在减弱。', 'The bearish alignment remains, but MA30 is recovering or improving its position relative to MA60. The downward structure is weakening.'],
      improving: ['目前还不是完整多头排列，但短期均线回升、相对中期均线的位置改善，短中期结构正在好转。', 'A complete bullish alignment is not yet present, but the shorter average is rising and improving relative to the medium-term average. The shorter-term structure is improving.'],
      structural_weakening: ['当前还不是完整空头排列，但最近的均线变化已达到转弱条件，短中期结构出现走弱迹象。', 'There is no complete bearish alignment, but recent moving-average changes meet the weakening criteria. The shorter-term structure is deteriorating.'],
      strengthening: ['MA30近期已有效上穿MA60，出现短中期转强事件；它优先于一般的强化或减弱判断。', 'MA30 recently confirmed a cross above MA60, a short/medium-term strengthening event that takes priority over ordinary strengthening or weakening.'],
      weakening: ['MA30近期已有效下穿MA60，出现短中期转弱事件；长期位置仍需结合MA200单独看。', 'MA30 recently confirmed a cross below MA60, a short/medium-term weakening event. Long-term positioning still needs a separate comparison with MA200.'],
      stable: ['当前没有达到相应变化门槛，所以保留趋势稳定。它不保证均线横盘或变化很小；有时只是持续性或另一项条件尚未满足。', 'The relevant change conditions were not met, so the status remains stable. This does not guarantee flat averages or small changes; persistence or another condition may simply be missing.'],
    };
    if (t.status === 'bullish_weakening') {
      if (down) result.plain.push(text('多头排列仍在，但短期均线MA30已在比较区间回落，当前多头结构出现减弱。', 'The bullish alignment remains, but MA30 has declined over the comparison window, weakening the bullish structure.'));
      else if (metricsComplete && t.ma30Slope > 0 && t.ma60Slope > t.ma30Slope) result.plain.push(text('两条均线都在上涨，但MA60涨幅更快，按比例正在追赶MA30；MA30的相对领先优势持续收窄。多头排列仍然存在。', 'Both averages are rising, but MA60 is rising faster proportionally and catching up with MA30. MA30’s relative lead has narrowed persistently, while the bullish alignment remains.'));
      else result.plain.push(text('MA30相对MA60的领先优势缩小，近期有效收窄的次数也达到要求。多头排列仍在，但其相对优势减弱。', 'MA30’s relative lead over MA60 narrowed often enough to meet the persistence requirement. The bullish alignment remains, with a weaker relative advantage.'));
    } else result.plain.push(plain[t.status][en ? 1 : 0]);
    result.plain.push(text('领先幅度以MA60为基准：比较的是两条均线相差多少比例，不是美元价差本身的增减百分比。', 'The lead uses MA60 as its base. It measures proportional separation, not the percentage change in the dollar gap itself.'));
    const limit = {
      bullish_strengthening: ['多头强化不保证不会回撤，也不表示任何价格都适合买入。', 'Bullish strengthening does not prevent pullbacks or make every price suitable for buying.'],
      bullish_weakening: ['多头减弱不等于已经形成空头排列，也不是立即卖出的指令。', 'Bullish weakening does not mean a bearish alignment has formed and is not an instruction to sell immediately.'],
      bearish_strengthening: ['空头强化不排除反弹，也不保证价格会一直下跌。', 'Bearish strengthening does not rule out a rebound or guarantee continued declines.'],
      bearish_weakening: ['空头减弱不代表已经转为多头，也不能确认底部成立。', 'Bearish weakening does not mean a bullish reversal or confirm a bottom.'],
      improving: ['结构改善不代表已经形成多头排列，也不是自动买入信号。', 'Structural improvement does not mean a bullish alignment has formed and is not an automatic buy signal.'],
      structural_weakening: ['结构转弱不等于已经形成完整空头排列，也不能替代收盘价与MA200的位置判断。', 'Structural weakening does not mean a complete bearish alignment has formed and does not replace the close-versus-MA200 assessment.'],
      strengthening: ['短中期转强不保证长期趋势已反转，也不保证交叉之后不会回落。', 'A short/medium-term strengthening crossover does not guarantee a long-term reversal or prevent a subsequent pullback.'],
      weakening: ['短中期转弱不等于长期趋势已经向下，也不代表必须立即卖出。', 'A short/medium-term weakening crossover does not necessarily mean a long-term downtrend or require an immediate sale.'],
      stable: ['趋势稳定不等于没有风险，也不表示股价接下来不会大幅波动。', 'A stable trend does not mean there is no risk or rule out large price swings.'],
    };
    result.doesNotMean.push(limit[t.status][en ? 1 : 0]);
  }
  if (result.incomplete) result.why.push(text('部分同日数据或判断依据缺失，已隐藏对应数值，解释尚不完整。', 'Some same-day data or supporting evidence is missing. Corresponding values are hidden and the explanation is incomplete.'));
  return result;
}

/** Keep the default reading short while preserving full evidence on demand. */
export function buildMaTechnicalExplanation(options = {}) {
  options = options && typeof options === 'object' ? options : {};
  const detailed = buildDetailedMaExplanation(options);
  const en = options.language === 'en';
  const text = (zh, english) => en ? english : zh;
  const isStructure = options.indicatorType === 'maStructure';
  const technical = options.technicalState || {};
  const state = (isStructure ? technical.maStructure : technical.maTrend) || {};
  const t = technical.maTrend || {};
  const structure = technical.maStructure || {};
  const down = finite(t.ma30Slope) && compare(t.ma30Slope, -rules.slopeThreshold) < 0;
  const up = finite(t.ma30Slope) && compare(t.ma30Slope, rules.slopeThreshold) > 0;
  const gapDown = finite(t.gapChange) && compare(t.gapChange, -rules.gapChangeThreshold) < 0;
  const gapUp = finite(t.gapChange) && compare(t.gapChange, rules.gapChangeThreshold) > 0;
  const positionKnown = finite(t.gapAtComparison) && finite(t.gapToday);
  const aboveToBelow = positionKnown && t.gapAtComparison > 0 && t.gapToday < 0;
  const belowToAbove = positionKnown && t.gapAtComparison < 0 && t.gapToday > 0;
  let positionChange = '';
  if (aboveToBelow) positionChange = text('MA30从高于MA60转为低于MA60。', 'MA30 moved from above MA60 to below it.');
  else if (belowToAbove) positionChange = text('MA30从低于MA60转为高于MA60。', 'MA30 moved from below MA60 to above it.');
  else if (positionKnown && t.gapToday < t.gapAtComparison) positionChange = t.gapToday < 0
    ? text('MA30相对MA60的落后幅度扩大。', 'MA30 moved further below MA60 in relative terms.')
    : text('MA30相对MA60的领先幅度缩小。', 'MA30’s relative lead over MA60 narrowed.');
  else if (positionKnown && t.gapToday > t.gapAtComparison) positionChange = t.gapToday > 0
    ? text('MA30相对MA60的领先幅度扩大。', 'MA30’s relative lead over MA60 widened.')
    : text('MA30相对MA60的落后幅度缩小。', 'MA30’s relative shortfall to MA60 narrowed.');
  else if (positionKnown) positionChange = text('MA30相对MA60的位置基本未变。', 'MA30’s relative position against MA60 is unchanged.');

  const defaultLabels = label => /交易日MA(?:30|60)变化|^(?:MA30|MA60) change over|^(?:期初|当前)MA30|^(?:Initial|Current) MA30|有效收窄|^Meaningful contractions|^交叉确认日$|^Cross confirmation date$|^确认后交易日$|^Trading days since confirmation$/.test(label);
  const relativePosition = structure.status === 'bearish' || finite(t.gapAtComparison) && t.gapAtComparison < 0
    || finite(t.gapToday) && t.gapToday < 0;
  const displayLabel = label => {
    if (/^完整日收盘价$|^Completed daily close$/.test(label)) return text('最新收盘价', 'Latest completed close');
    if (/交易日MA30变化|^MA30 change over/.test(label)) return text(`MA30最近${rules.lookback}日`, `MA30 over the last ${rules.lookback} days`);
    if (/交易日MA60变化|^MA60 change over/.test(label)) return text(`MA60最近${rules.lookback}日`, `MA60 over the last ${rules.lookback} days`);
    if (/^期初MA30|^Initial MA30/.test(label)) return relativePosition
      ? text(`${rules.lookback}日前相对位置`, `Relative position ${rules.lookback} days ago`)
      : text(`${rules.lookback}日前领先幅度`, `Relative lead ${rules.lookback} days ago`);
    if (/^当前MA30|^Current MA30/.test(label)) return relativePosition
      ? text('当前相对位置', 'Current relative position') : text('当前领先幅度', 'Current relative lead');
    if (/^MA30相对MA60位置变化$|^Change in MA30 position/.test(label)) return relativePosition
      ? text(`${rules.lookback}日相对位置变化`, `${rules.lookback}-day relative-position change`)
      : text(`${rules.lookback}日领先幅度变化`, `${rules.lookback}-day relative-lead change`);
    if (/有效收窄|^Meaningful contractions/.test(label)) return text('近期有效收窄', 'Recent meaningful contractions');
    if (/有效扩大|^Meaningful expansions/.test(label)) return text('近期有效扩大（仅观察）', 'Recent meaningful expansions (observation only)');
    return label;
  };
  const displayRow = row => ({ label: displayLabel(row.label), value: row.value.replace('次比较', '次') });
  const compactValue = value => value.replace(/([+−-]?\d+(?:\.\d+)?)%/g, (_, number) => {
    const parsed = Number(number.replace('−', '-'));
    return `${number.startsWith('+') ? '+' : ''}${parsed.toFixed(2)}%`;
  });
  const result = {
    title: detailed.title, status: detailed.status, asOfDate: detailed.asOfDate,
    rows: isStructure ? detailed.rows.map(displayRow) : detailed.rows.filter(row => defaultLabels(row.label))
      .map(displayRow).map(row => ({ ...row, value: compactValue(row.value) })),
    why: [], plain: [], doesNotMean: [], incomplete: detailed.incomplete,
    summary: '', currentView: [], ruleDetails: null, eventDetails: null,
  };
  if (!isStructure) {
    const detailRows = [];
    const add = (group, label, value) => detailRows.push({ label: `${group} · ${label}`, value });
    const observation = text('系统观察', 'System observation');
    const dataGroup = text('当前数据', 'Current data');
    const ruleGroup = text('系统规则', 'System rule');
    const observationText = {
      bullish_strengthening: text('多头排列中的MA30是否继续走高并扩大相对领先优势。', 'Whether MA30 keeps rising and extends its relative lead within a bullish alignment.'),
      bullish_weakening: down
        ? text('多头排列中的MA30是否明显回落。', 'Whether MA30 falls materially within a bullish alignment.')
        : text('多头排列中的相对领先幅度是否持续收窄。', 'Whether the relative lead narrows persistently within a bullish alignment.'),
      bearish_strengthening: text('空头排列中的MA30是否进一步走弱。', 'Whether MA30 weakens further within a bearish alignment.'),
      bearish_weakening: text('空头排列中的MA30是否回升，或相对位置改善。', 'Whether MA30 recovers or improves its relative position within a bearish alignment.'),
      improving: text('MA30是否回升，并改善相对MA60的位置。', 'Whether MA30 rises and improves its position relative to MA60.'),
      structural_weakening: text('MA30及其相对MA60的位置是否转弱。', 'Whether MA30 and its position relative to MA60 weaken.'),
      strengthening: text('近期上穿是否有效确认并仍在显示窗口内。', 'Whether a recent upward crossover is confirmed and remains within its display window.'),
      weakening: text('近期下穿是否有效确认并仍在显示窗口内。', 'Whether a recent downward crossover is confirmed and remains within its display window.'),
      stable: text('当前结构的强化、减弱或近期交叉条件是否齐备。', 'Whether strengthening, weakening, or recent crossover criteria are met for the current structure.'),
    };
    if (!detailed.incomplete && observationText[state.status]) {
      detailRows.push({ label: observation, value: observationText[state.status] });
    }
    // Absolute prices belong to the structure explanation, not these directional rules.
    for (const row of detailed.rows.filter(row => !['完整日收盘价', 'Completed daily close', 'MA30', 'MA60', 'MA200'].includes(row.label))) {
      const shown = displayRow(row);
      add(dataGroup, shown.label, shown.value);
    }
    const slope = (rules.slopeThreshold * 100).toFixed(4) + '%';
    const gap = (rules.gapChangeThreshold * 100).toFixed(4) + text('个百分点', ' percentage points');
    const daily = (rules.dailyGapChangeMin * 100).toFixed(4) + text('个百分点', ' percentage points');
    const ma30UpRule = text(`MA30最近${rules.lookback}日 > +${slope}`, `MA30 over ${rules.lookback} days > +${slope}`);
    const ma30DownRule = text(`MA30最近${rules.lookback}日 < −${slope}`, `MA30 over ${rules.lookback} days < −${slope}`);
    const gapUpRule = text(`相对位置变化 > +${gap}`, `Relative-position change > +${gap}`);
    const gapDownRule = text(`相对位置变化 < −${gap}`, `Relative-position change < −${gap}`);
    const addRule = (zhLabel, enLabel, value) => add(ruleGroup, text(zhLabel, enLabel), value);
    const contractionRules = () => {
      addRule(`${rules.lookback}日领先幅度收窄`, `${rules.lookback}-day relative-lead contraction`, `> ${gap}`);
      addRule('有效收窄次数', 'Meaningful contraction count', text(`≥ ${rules.contractionMinDays} / ${rules.contractionLookback - 1}次`, `≥ ${rules.contractionMinDays} / ${rules.contractionLookback - 1} comparisons`));
      addRule('单次有效收窄', 'Meaningful daily contraction', `≥ ${daily}`);
    };
    if (!detailed.incomplete) {
      switch (state.status) {
        case 'bullish_strengthening':
          addRule('MA30变化', 'MA30 change', `> +${slope}`);
          addRule('MA60变化', 'MA60 change', `≥ −${slope}`);
          addRule(`${rules.lookback}日领先幅度变化`, `${rules.lookback}-day relative-lead change`, `> +${gap}`);
          addRule('条件关系', 'Conditions', text('三项同时满足；扩大次数仅作观察。', 'All three are required; expansion counts are observations only.'));
          break;
        case 'bullish_weakening':
          if (down) {
            addRule('直接减弱路径', 'Direct weakening path', ma30DownRule);
            addRule('持续性要求', 'Persistence requirement', text('此路径不要求持续收窄。', 'This path does not require persistent contraction.'));
          } else {
            contractionRules();
            addRule('条件关系', 'Conditions', text('三项同时满足。', 'All three are required.'));
          }
          break;
        case 'bearish_strengthening':
          addRule('MA30变化', 'MA30 change', `< −${slope}`);
          addRule('MA60变化', 'MA60 change', `≤ +${slope}`);
          addRule(`${rules.lookback}日相对位置变化`, `${rules.lookback}-day relative-position change`, `< −${gap}`);
          addRule('条件关系', 'Conditions', text('三项同时满足。', 'All three are required.'));
          break;
        case 'bearish_weakening':
          addRule('MA30回升路径', 'MA30 recovery path', ma30UpRule);
          addRule('相对位置改善路径', 'Relative-position improvement path', gapUpRule);
          addRule('条件关系', 'Conditions', text('任一满足即可，不要求持续收窄。', 'Either is sufficient; persistent contraction is not required.'));
          break;
        case 'improving':
          addRule('MA30回升', 'MA30 recovery', ma30UpRule);
          addRule('相对位置改善', 'Relative-position improvement', gapUpRule);
          addRule('条件关系', 'Conditions', text('两项同时满足。', 'Both are required.'));
          break;
        case 'structural_weakening':
          addRule('MA30回落路径', 'MA30 decline path', ma30DownRule);
          addRule('相对位置转弱路径', 'Relative-position weakening path', gapDownRule);
          addRule('条件关系', 'Conditions', structure.status === 'long_term_up'
            ? text('长期趋势向上时，任一满足即可。', 'In a long-term uptrend, either is sufficient.')
            : text('两项同时满足。', 'Both are required.'));
          break;
        case 'strengthening':
        case 'weakening': {
          const upward = state.status === 'strengthening';
          addRule('交叉确认幅度', 'Crossover confirmation gap', `${upward ? '≥ +' : '≤ −'}${(rules.crossThreshold * 100).toFixed(4)}%`);
          addRule('有效期限', 'Event window', text(`确认后不足${rules.crossLookback}个完整交易日，且当前仍满足确认幅度。`, `Fewer than ${rules.crossLookback} completed trading days since confirmation, with the confirmation gap still met.`));
          addRule('判断优先级', 'Priority', text('近期有效交叉优先于普通强化或减弱。', 'A recent confirmed crossover takes priority over ordinary strengthening or weakening.'));
          break;
        }
        case 'stable': {
          addRule('近期交叉', 'Recent crossover', text('当前没有仍满足确认条件的近期交叉优先显示。', 'No recent crossover currently meets confirmation criteria and takes priority.'));
          if (structure.status === 'bullish') {
            const strengtheningMissing = [!up && ma30UpRule,
              compare(t.ma60Slope, -rules.slopeThreshold) < 0 && `MA60 ≥ −${slope}`, !gapUp && gapUpRule].filter(Boolean);
            addRule('未满足多头强化', 'Unmet bullish strengthening criteria', strengtheningMissing.join('；'));
            addRule('未触发直接减弱', 'Unmet direct weakening criterion', ma30DownRule);
            if (gapDown && !t.contractionPersistent) {
              contractionRules();
              addRule('持续性结果', 'Persistence result', text(`仅${t.contractingDays} / ${rules.contractionLookback - 1}次，未达到至少${rules.contractionMinDays}次。`, `Only ${t.contractingDays} / ${rules.contractionLookback - 1} comparisons, below the minimum of ${rules.contractionMinDays}.`));
            } else addRule('未触发间距减弱', 'Unmet gap weakening criterion', gapDownRule);
          } else if (structure.status === 'bearish') {
            const strengtheningMissing = [!down && ma30DownRule,
              compare(t.ma60Slope, rules.slopeThreshold) > 0 && `MA60 ≤ +${slope}`, !gapDown && gapDownRule].filter(Boolean);
            addRule('未满足空头强化', 'Unmet bearish strengthening criteria', strengtheningMissing.join('；'));
            addRule('未触发空头减弱', 'Unmet bearish weakening criteria', [ma30UpRule, gapUpRule].join(text('；任一满足即可：', '; either is sufficient: ')));
          } else {
            addRule('未满足结构改善', 'Unmet improvement criteria', [!up && ma30UpRule, !gapUp && gapUpRule].filter(Boolean).join('；'));
            addRule('未满足结构转弱', 'Unmet weakening criteria', [!down && ma30DownRule, !gapDown && gapDownRule].filter(Boolean).join('；'));
            addRule('转弱条件关系', 'Weakening conditions', structure.status === 'long_term_up'
              ? text('任一满足即可，当前均未触发。', 'Either is sufficient; neither is triggered.')
              : text('两项必须同时满足，当前条件未齐。', 'Both are required; the criteria are incomplete.'));
          }
          break;
        }
      }
      if (state.status && state.status !== 'stable') add(dataGroup, text('判断结果', 'Result'), text(`当前满足上述条件，因此判断为${detailed.status}。`, `The current data meet the conditions above, giving a judgment of ${detailed.status}.`));
    }
    result.ruleDetails = { rows: detailRows, lines: [
      ...(detailed.incomplete ? detailed.why : []),
      text('相对位置＝（MA30−MA60）÷MA60；起终点差按百分点计算。', 'Relative position = (MA30 − MA60) ÷ MA60; the change between endpoints is measured in percentage points.'),
    ] };
  }
  if (detailed.incomplete) {
    result.summary = text('部分完整交易日数据不足，当前解释尚不完整。', 'Some completed-day evidence is missing, so the explanation is incomplete.');
    result.why = [text('完整交易日的部分判断依据暂时缺失。', 'Some supporting evidence from completed trading days is currently missing.')];
    result.plain = [text('部分数据暂缺，暂时无法完整解释这一状态。', 'Some data are missing, so this state cannot yet be fully explained.')];
    result.doesNotMean = [text('数据不足不代表零、正常或没有风险。', 'Missing data does not mean zero, normal conditions, or no risk.')];
    return result;
  }

  if (isStructure) {
    const content = {
      bullish: {
        summary: ['短、中、长期趋势方向一致向上。', 'The short-, medium-, and long-term structure is aligned upward.'],
        why: ['股价 > MA30 > MA60 > MA200', 'Close > MA30 > MA60 > MA200'],
        plain: ['股价位于三条主要均线上方，同时MA30高于MA60，MA60高于MA200。说明当前短、中、长期趋势方向一致，属于完整的多头结构。', 'Price is above all three main averages, MA30 is above MA60, and MA60 is above MA200. These positions form a complete bullish structure across the three periods.'],
        limit: ['多头排列只描述当前趋势结构，不代表股价一定继续上涨。趋势正在增强还是减弱，需要结合“趋势变化”判断。', 'Bullish alignment describes the current structure, not guaranteed further gains. Trend change assesses whether that structure is strengthening or weakening.'],
      },
      bearish: {
        summary: ['短、中、长期趋势方向一致向下。', 'The short-, medium-, and long-term structure is aligned downward.'],
        why: ['股价 < MA30 < MA60 < MA200', 'Close < MA30 < MA60 < MA200'],
        plain: ['股价位于三条主要均线下方，同时MA30低于MA60，MA60低于MA200。说明当前短、中、长期趋势方向一致，属于完整的空头结构。', 'Price is below all three main averages, MA30 is below MA60, and MA60 is below MA200. These positions form a complete bearish structure across the three periods.'],
        limit: ['空头排列不代表价格会持续直线下跌。趋势正在增强还是减弱，需要结合“趋势变化”判断。', 'Bearish alignment does not imply an uninterrupted decline. Trend change assesses whether that structure is strengthening or weakening.'],
      },
      long_term_up: {
        summary: ['长期趋势仍然向上，但短中期尚未形成完整多头排列。', 'The long-term trend remains upward, without a complete shorter-term bullish alignment.'],
        why: ['股价 > MA200；未同时满足股价 > MA30 > MA60 > MA200。', 'Close > MA200; Close > MA30 > MA60 > MA200 is not fully satisfied.'],
        plain: ['股价仍在MA200上方，长期位置尚未破坏；短中期完整多头排列还没有形成，需要继续观察。', 'Price remains above MA200, preserving its long-term position; a complete shorter-term bullish alignment has not yet formed.'],
        limit: ['长期趋势向上，不等于短期一定强势。', 'A long-term uptrend does not guarantee short-term strength.'],
      },
      long_term_down: {
        summary: ['长期趋势仍然偏弱，但短中期不一定同步走弱。', 'The long-term trend remains weak, while shorter-term changes may differ.'],
        why: ['股价 < MA200；未同时满足股价 < MA30 < MA60 < MA200。', 'Close < MA200; Close < MA30 < MA60 < MA200 is not fully satisfied.'],
        plain: ['股价处于MA200下方，长期位置偏弱；MA30和MA60可能正在变化，具体方向需要看“趋势变化”。', 'Price is below MA200, a weaker long-term position. MA30 and MA60 may be changing; Trend change explains their direction.'],
        limit: ['长期趋势偏弱，不代表短期不会出现明显反弹或结构改善。', 'A weak long-term trend does not rule out a strong short-term rebound or structural improvement.'],
      },
      at_ma200: {
        summary: ['价格正好位于MA200，暂不属于其上方或下方。', 'Price equals MA200 and is neither above nor below it.'],
        why: ['股价 = MA200', 'Close = MA200'],
        plain: ['当前处在长期均线的位置，方向需另看趋势变化。', 'Price is on the long-term average; Trend change assesses direction separately.'],
        limit: ['等于MA200，不代表已确认突破或跌破。', 'Equality with MA200 is neither a confirmed breakout nor a breakdown.'],
      },
    }[state.status];
    if (content) {
      result.summary = content.summary[en ? 1 : 0];
      result.why = [content.why[en ? 1 : 0]];
      result.plain = [content.plain[en ? 1 : 0]];
      result.doesNotMean = [content.limit[en ? 1 : 0]];
    }
    return result;
  }

  const meaning = {
    bullish_strengthening: ['多头结构仍在，而且MA30相对MA60的领先优势正在扩大。', 'The bullish structure remains, and MA30 is extending its relative lead over MA60.'],
    bullish_weakening: down
      ? ['多头结构仍在，但MA30近期已明显回落。', 'The bullish structure remains, but MA30 has recently declined materially.']
      : ['多头结构仍在，但MA30相对MA60的领先优势正在收窄。', 'The bullish structure remains, but MA30’s relative lead over MA60 is narrowing.'],
    bearish_strengthening: ['空头结构仍在，而且MA30相对MA60正在进一步走弱。', 'The bearish structure remains, and MA30 is weakening further relative to MA60.'],
    bearish_weakening: ['空头结构仍在，但短期弱势正在缓和。', 'The bearish structure remains, but short-term weakness is easing.'],
    improving: ['当前还没有形成完整强势排列，但短中期结构正在改善。', 'A complete bullish alignment has not formed, but the shorter-term structure is improving.'],
    structural_weakening: ['当前还没有形成完整空头排列，但短中期结构正在走弱。', 'A complete bearish alignment has not formed, but the shorter-term structure is weakening.'],
    strengthening: ['MA30近期有效上穿MA60，短中期趋势出现明确转强。', 'MA30 recently confirmed a cross above MA60, marking a clear short/medium-term strengthening event.'],
    weakening: ['MA30近期有效下穿MA60，短中期趋势出现明确转弱。', 'MA30 recently confirmed a cross below MA60, marking a clear short/medium-term weakening event.'],
    stable: ['近期均线关系没有发生足以改变趋势判断的明显变化。', 'Recent moving-average relationships have not met the conditions for a different trend judgment.'],
  };
  result.summary = meaning[state.status]?.[en ? 1 : 0] || '';
  switch (state.status) {
    case 'bullish_strengthening':
      result.why = [text('MA30继续走高，相对MA60的领先幅度扩大。', 'MA30 continued rising and extended its relative lead over MA60.')];
      result.plain = [text('当前保持多头排列，短期均线相对中期进一步走强，趋势正在增强。', 'The bullish alignment remains, while the short-term average strengthens relative to the medium-term average.')];
      break;
    case 'bullish_weakening':
      if (down) {
        result.why = [text(`MA30最近${rules.lookback}个交易日明显回落，短期平均价格开始下降。`, `MA30 fell materially over the last ${rules.lookback} trading days, with the short-term average price declining.`)];
        result.plain = [text('多头排列还在，短期平均价格已开始走弱。', 'The bullish alignment remains, while the short-term average price has weakened.')];
      } else {
        result.why = [finite(t.ma30Slope) && finite(t.ma60Slope) && t.ma30Slope > 0 && t.ma60Slope > t.ma30Slope
          ? text('MA30和MA60仍在上涨，但MA60近期上涨更快，MA30的相对领先幅度持续收窄。', 'Both MA30 and MA60 rose, but MA60 rose faster proportionally, persistently narrowing MA30’s relative lead.')
          : text('MA30相对MA60的领先幅度在近期多次收窄。', 'MA30’s relative lead over MA60 narrowed repeatedly in recent trading days.')];
        result.plain = [text('上涨趋势还没有被破坏，只是短期上涨动能相对前一阶段有所减弱。', 'The upward structure remains intact, but short-term upward momentum has weakened relative to the prior period.')];
      }
      break;
    case 'bearish_strengthening':
      result.why = [aboveToBelow
        ? t.ma30Slope < 0 && t.ma60Slope < 0 && t.ma30Slope < t.ma60Slope
          ? text(`MA30近${rules.lookback}日跌得更快，并从MA60上方转到下方。`, `MA30 fell faster over ${rules.lookback} trading days and moved from above MA60 to below it.`)
          : text('MA30回落，并从MA60上方转到下方。', 'MA30 fell and moved from above MA60 to below it.')
        : text('MA30走低、相对落后幅度扩大，MA60没有明显回升。', 'MA30 fell, its relative shortfall widened, and MA60 did not rise materially.')];
      result.plain = [text('短期均线相对中期进一步走弱，当前空头结构正在增强。', 'The short-term average is weakening further relative to the medium-term average, strengthening the bearish structure.')];
      break;
    case 'bearish_weakening':
      result.why = [gapUp
        ? text('MA30仍低于MA60，但两者的相对差距正在缩小。', 'MA30 remains below MA60, but their relative separation is narrowing.')
        : text('MA30近期明显回升，短期平均价格开始缓和。', 'MA30 recovered materially, easing weakness in the short-term average price.')];
      result.plain = [gapUp
        ? text('当前仍是空头排列，但MA30正在追近MA60，原有下跌动能有所减弱。', 'The bearish alignment remains, but MA30 is moving closer to MA60 and the prior downward momentum has eased.')
        : text('当前仍是空头排列，MA30回升使短期弱势有所缓和，但相对MA60的位置改善还不够明显。', 'The bearish alignment remains. MA30’s rise eases short-term weakness, while its position relative to MA60 has not improved materially.')];
      break;
    case 'improving':
      result.why = [text('MA30回升，同时相对MA60的位置改善。', 'MA30 rose and improved its position relative to MA60.')];
      result.plain = [text(`${positionChange}两条均线的关系向更强的方向发展，短期结构正在修复。`, `${positionChange} The relationship between the averages is strengthening as the shorter-term structure recovers.`).trim()];
      break;
    case 'structural_weakening':
      result.why = [text([down && 'MA30明显回落', gapDown && '相对MA60的位置走弱'].filter(Boolean).join('，') + '。',
        [down && 'MA30 fell materially', gapDown && 'its position relative to MA60 weakened'].filter(Boolean).join('; ') + '.')];
      result.plain = [gapDown
        ? text(`${positionChange}两条均线的关系向更弱的方向发展，短期风险增加。`, `${positionChange} The relationship between the averages is weakening, increasing short-term risk.`).trim()
        : text('MA30近期回落，短期平均价格走弱，短期风险增加。', 'MA30 has declined, weakening the short-term average price and increasing short-term risk.')];
      break;
    case 'strengthening':
    case 'weakening':
      result.why = [text(`最近的${state.status === 'strengthening' ? '上穿' : '下穿'}已达到确认要求，当前仍处于事件有效期。`,
        `The recent ${state.status === 'strengthening' ? 'upward' : 'downward'} crossover met confirmation criteria and remains within its event window.`)];
      result.plain = [state.status === 'strengthening'
        ? text('短期平均价格已经超过中期平均价格，近期结构出现明确改善。', 'The short-term average price has moved above the medium-term average, marking a clear improvement in the recent structure.')
        : text('短期平均价格已经跌到中期平均价格下方，近期结构出现明确转弱。', 'The short-term average price has moved below the medium-term average, marking clear weakening in the recent structure.')];
      break;
    case 'stable':
      if (structure.status === 'bullish' && gapDown && !t.contractionPersistent) result.why = [text('领先幅度虽然减小，但近期收窄还不够持续。', 'The relative lead narrowed, but recent contraction has not been persistent enough.')];
      else result.why = [text('近期没有有效交叉，其他均线变化也还不足以确认新的趋势变化。', 'There is no recent confirmed crossover, and the other moving-average changes are not sufficient to confirm a new trend change.')];
      result.plain = [text('均线仍可能上涨或下跌，“稳定”只表示目前还不足以确认新的强化或减弱。', 'The averages may still rise or fall; stable only means there is not yet enough evidence to confirm new strengthening or weakening.')];
      break;
  }
  const limit = {
    bullish_strengthening: ['趋势强度增加，不代表短期不会回撤。', 'Increasing trend strength does not rule out a short-term pullback.'],
    bullish_weakening: ['多头减弱 ≠ 转为空头。它表示多头结构仍然存在，但当前强度有所下降。', 'Bullish weakening does not mean a bearish reversal. The bullish structure remains, with lower current strength.'],
    bearish_strengthening: ['空头强化不代表价格会直线下跌，仍可能出现反弹。', 'Bearish strengthening does not imply an uninterrupted decline; rebounds remain possible.'],
    bearish_weakening: ['空头减弱 ≠ 转为多头。它只代表当前空头结构的强度有所下降。', 'Bearish weakening does not mean a bullish reversal. It only describes reduced strength in the bearish structure.'],
    improving: ['结构改善不等于已经形成完整多头排列。', 'Structural improvement does not mean a complete bullish alignment has formed.'],
    structural_weakening: ['结构转弱不等于已经形成完整空头排列。', 'Structural weakening does not mean a complete bearish alignment has formed.'],
    strengthening: ['短中期转强不代表长期趋势已经同步转强。', 'Short/medium-term strengthening does not establish simultaneous long-term strength.'],
    weakening: ['短中期转弱不代表长期趋势已经同步转为空头。', 'Short/medium-term weakening does not establish a simultaneous long-term bearish reversal.'],
    stable: ['趋势稳定不等于没有风险。', 'A stable trend does not mean there is no risk.'],
  };
  result.doesNotMean = limit[state.status] ? [limit[state.status][en ? 1 : 0]] : [];
  return result;
}
