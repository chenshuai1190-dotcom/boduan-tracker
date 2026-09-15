import { buildStockRsi } from './stockRsi.js';
import { STOCK_RSI_RULES } from '../../src/lib/stockRsiConfig.js';

// These are explicit v1 strategy parameters, not empirically optimal thresholds.
export const STOCK_DECISION_RULES = Object.freeze({
  lookbackBars: 120,
  minimumHistoryBars: 132,
  pivotSideBars: 3,
  independentTouchBars: 5,
  atrPeriod: 14,
  zoneAtrTolerance: 0.5,
  volumePeriod: 20,
  lowVolumeRatio: 0.8,
  highVolumeRatio: 1.2,
  breakoutActiveBars: 10,
  reboundComparisonBars: 3,
  closingLowBars: 20,
  rsiOversold: STOCK_RSI_RULES.RSI_OVERSOLD,
  rsiOverbought: STOCK_RSI_RULES.RSI_OVERBOUGHT,
  rsiExtreme: 90,
});

const R = STOCK_DECISION_RULES;

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeRows(input, asOf) {
  if (!Array.isArray(input) || !validDate(asOf)) return null;
  const rows = [];
  for (const row of input) {
    if (!validDate(row?.date)) return null;
    // Ignore unfinished/future bars before reading their OHLCV values.
    if (row.date > asOf) continue;
    if (rows.length && row.date <= rows.at(-1).date) return null;
    if (['open', 'high', 'low', 'close'].some(key => !Number.isFinite(row[key]) || row[key] <= 0)
      || !Number.isFinite(row.volume) || row.volume < 0
      || row.high < Math.max(row.open, row.close, row.low)
      || row.low > Math.min(row.open, row.close, row.high)) return null;
    rows.push({ date: row.date, open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume });
  }
  return rows;
}

function atrSeries(rows) {
  let value = 0;
  return rows.map((row, index) => {
    const previous = rows[index - 1]?.close;
    const range = previous === undefined ? row.high - row.low
      : Math.max(row.high - row.low, Math.abs(row.high - previous), Math.abs(row.low - previous));
    if (index < R.atrPeriod) value += range / R.atrPeriod;
    else value = ((R.atrPeriod - 1) * value + range) / R.atrPeriod;
    return index >= R.atrPeriod - 1 ? value : null;
  });
}

function volumeRatios(rows, index) {
  if (index < R.volumePeriod) return { ratio: null, medianRatio: null };
  const previous = rows.slice(index - R.volumePeriod, index).map(row => row.volume);
  const mean = previous.reduce((sum, value) => sum + value, 0) / previous.length;
  const ordered = [...previous].sort((a, b) => a - b);
  const middle = ordered.length / 2;
  const median = (ordered[middle - 1] + ordered[middle]) / 2;
  return {
    ratio: mean > 0 ? rows[index].volume / mean : null,
    medianRatio: median > 0 ? rows[index].volume / median : null,
  };
}

function isPivot(rows, index, field, sign) {
  if (index < R.pivotSideBars) return false;
  for (let offset = 1; offset <= R.pivotSideBars; offset += 1) {
    if (sign * rows[index][field] <= sign * rows[index - offset][field]
      || sign * rows[index][field] <= sign * rows[index + offset][field]) return false;
  }
  return true;
}

function publicZone(zone) {
  if (!zone) return null;
  return {
    lower: zone.lower,
    upper: zone.upper,
    touches: zone.pivots.length,
    pivots: zone.pivots.map(({ date, price, confirmedAt }) => ({ date, price, confirmedAt })),
  };
}

function addPivot(zones, pivot, role, tolerance) {
  // Membership uses the original anchor and tolerance. Later ATR values cannot
  // retroactively widen a zone or manufacture a historical breakout.
  const matches = zones.filter(zone => zone.role === role && Math.abs(zone.anchor - pivot.price) <= zone.tolerance)
    .sort((a, b) => Math.abs(a.anchor - pivot.price) - Math.abs(b.anchor - pivot.price));
  const zone = matches[0];
  if (zone) {
    if (pivot.index - zone.pivots.at(-1).index < R.independentTouchBars) return;
    zone.pivots.push(pivot);
    zone.lower = Math.max(Number.MIN_VALUE, Math.min(...zone.pivots.map(point => point.price)) - zone.tolerance / 2);
    zone.upper = Math.max(...zone.pivots.map(point => point.price)) + zone.tolerance / 2;
    return;
  }
  if (!(tolerance > 0)) return;
  zones.push({
    anchor: pivot.price,
    tolerance,
    role,
    lower: Math.max(Number.MIN_VALUE, pivot.price - tolerance / 2),
    upper: pivot.price + tolerance / 2,
    pivots: [pivot],
  });
}

function scanStructure(rows, atr) {
  let zones = [];
  let broken = null;
  let breakout = null;
  const lows = [];
  const highs = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const earliest = index - R.lookbackBars + 1;
    zones = zones.filter(zone => zone.pivots.at(-1).index >= earliest);
    for (const zone of zones) {
      // Expire historical touch evidence without changing the zone's frozen
      // anchor/tolerance. Event snapshots below never borrow future touches.
      zone.pivots = zone.pivots.filter(point => point.index >= earliest);
      zone.lower = Math.max(Number.MIN_VALUE, Math.min(...zone.pivots.map(point => point.price)) - zone.tolerance / 2);
      zone.upper = Math.max(...zone.pivots.map(point => point.price)) + zone.tolerance / 2;
    }
    if (broken && (row.close > broken.zone.upper || index - broken.index >= R.lookbackBars)) broken = null;
    if (breakout && (index - breakout.index > R.breakoutActiveBars || row.close < breakout.lower)) breakout.active = false;
    if (breakout && index - breakout.index >= R.lookbackBars) breakout = null;
    const previous = rows[index - 1];
    if (previous) {
      const ratios = volumeRatios(rows, index);
      // These zones were known before today's bar. Confirmation happens only
      // after this step, so a same-day newly confirmed pivot is not tradable.
      const brokenToday = zones.filter(zone => zone.role === 'support'
        && previous.close >= zone.lower && row.close < zone.lower)
        .sort((a, b) => b.lower - a.lower);
      if (brokenToday.length) {
        // Preserve the first failed area until reclaimed. A lower newly found
        // support must never make the earlier breakdown disappear.
        if (!broken) broken = { index, zone: publicZone(brokenToday[0]) };
        for (const zone of brokenToday) zone.role = 'resistance';
      }
      const crossed = zones.filter(zone => zone.role === 'resistance'
        && previous.close <= zone.upper && row.close > zone.upper)
        .sort((a, b) => b.upper - a.upper);
      if (crossed.length && ratios.ratio !== null && ratios.ratio >= R.highVolumeRatio) {
        const zone = crossed[0];
        breakout = {
          index, date: row.date, lower: zone.lower, upper: zone.upper,
          ratio: ratios.ratio, active: true,
        };
        for (const crossedZone of crossed) crossedZone.role = 'support';
      }
    }
    const candidate = index - R.pivotSideBars;
    if (candidate < R.pivotSideBars || !(atr[index] > 0)) continue;
    for (const [field, sign, role, destination] of [['low', -1, 'support', lows], ['high', 1, 'resistance', highs]]) {
      if (!isPivot(rows, candidate, field, sign)) continue;
      const pivot = { index: candidate, date: rows[candidate].date, price: rows[candidate][field], confirmedAt: row.date };
      if (!destination.length || candidate - destination.at(-1).index >= R.independentTouchBars) destination.push(pivot);
      addPivot(zones, pivot, role, atr[index] * R.zoneAtrTolerance);
    }
  }
  const earliest = rows.length - R.lookbackBars;
  return {
    zones,
    brokenSupport: broken?.zone ?? null,
    breakout: breakout ? {
      date: breakout.date, ageBars: rows.length - 1 - breakout.index,
      lower: breakout.lower, upper: breakout.upper, ratio: breakout.ratio, active: breakout.active,
    } : null,
    lows: lows.filter(point => point.index >= earliest),
    highs: highs.filter(point => point.index >= earliest),
  };
}

function trendResult(rows, structure) {
  const low = structure.lows.at(-1)?.price ?? null;
  const high = structure.highs.at(-1)?.price ?? null;
  const result = { state: 'insufficient', lastHigh: high, lastLow: low };
  if (rows.length < R.lookbackBars || structure.lows.length < 2 || structure.highs.length < 2) return result;
  const previousLow = structure.lows.at(-2).price;
  const previousHigh = structure.highs.at(-2).price;
  const price = rows.at(-1).close;
  const rising = price > rows.at(-1 - R.reboundComparisonBars).close;
  if (high > previousHigh && low > previousLow) result.state = 'uptrend';
  else if (price > high) result.state = 'recovery';
  else if (high < previousHigh && low < previousLow) result.state = rising && price > low ? 'rebound' : 'downtrend';
  else result.state = 'mixed';
  return result;
}

function positionResult(price, atr, structure) {
  const support = structure.zones.filter(zone => zone.role === 'support' && zone.lower <= price)
    .sort((a, b) => b.upper - a.upper)[0] ?? null;
  const resistance = structure.zones.filter(zone => zone.role === 'resistance' && zone.upper >= price)
    .sort((a, b) => a.lower - b.lower)[0] ?? null;
  let state = 'unavailable';
  if (structure.brokenSupport) state = 'support_broken';
  else if ((support && price <= support.upper) || (resistance && price >= resistance.lower)) state = 'inside_zone';
  else if (resistance && atr !== null && resistance.lower - price <= atr * R.zoneAtrTolerance) state = 'near_resistance';
  else if (support) state = 'above_support';
  return { support: publicZone(support), resistance: publicZone(resistance), brokenSupport: structure.brokenSupport, atr, state };
}

function volumeResult(rows, trend, position, breakout) {
  const ratios = volumeRatios(rows, rows.length - 1);
  let state = 'insufficient';
  if (ratios.ratio !== null) {
    const falling = rows.at(-1).close < rows.at(-2).close;
    const rising = rows.at(-1).close > rows.at(-2).close;
    if (breakout?.active && breakout.ageBars === 0) state = 'breakout';
    else if (falling && ratios.ratio >= R.highVolumeRatio) state = 'weakness';
    else if (breakout?.active) state = falling && ratios.ratio < R.lowVolumeRatio ? 'pullback' : 'continuation';
    else if (rising && ratios.ratio < R.lowVolumeRatio && ['rebound', 'recovery'].includes(trend.state)) state = 'low_rebound';
    else if (falling && ratios.ratio < R.lowVolumeRatio && position.support && rows.at(-1).close >= position.support.lower) state = 'pullback';
    else state = 'neutral';
  }
  return { state, ...ratios, breakout };
}

/** Read-only v1 assessment. Input OHLCV must share the adjusted close basis. */
export function buildStockDecisionModel({ rows: input, asOf } = {}) {
  const rows = normalizeRows(input, asOf);
  const momentum = buildStockRsi((rows ?? []).map(row => ({ date: row.date, close: row.close, high: row.high, adjusted_close: row.close })), { completedCutoffDate: asOf });
  const result = {
    version: 'stock-decision-v1', asOf: rows?.at(-1)?.date ?? null,
    price: rows?.at(-1)?.close ?? null,
    changePct: rows?.length > 1 ? (rows.at(-1).close / rows.at(-2).close - 1) * 100 : null,
    history: (rows ?? []).slice(-R.lookbackBars).map(({ date, close }) => ({ date, close })),
    trend: { state: 'insufficient', lastHigh: null, lastLow: null },
    position: { support: null, resistance: null, brokenSupport: null, atr: null, state: 'unavailable' },
    volume: { state: 'insufficient', ratio: null, medianRatio: null, breakout: null },
    momentum, verdict: 'insufficient', reasons: [],
  };
  if (!rows?.length) {
    result.reasons = ['insufficient_history'];
    return result;
  }
  const atr = atrSeries(rows);
  const structure = scanStructure(rows, atr);
  result.trend = trendResult(rows, structure);
  result.position = positionResult(result.price, atr.at(-1), structure);
  result.volume = volumeResult(rows, result.trend, result.position, structure.breakout);

  const missing = [];
  const pause = [];
  const wait = [];
  if (rows.length < R.minimumHistoryBars) missing.push('insufficient_history');
  if (result.asOf !== asOf) missing.push('stale_history');
  if (result.trend.state === 'insufficient' || result.position.state === 'unavailable') missing.push('insufficient_structure');
  if (momentum.value === null || momentum.divergenceState === null) missing.push('insufficient_momentum');
  if (result.volume.ratio === null || result.volume.medianRatio === null) missing.push('insufficient_volume');
  if (result.position.brokenSupport) pause.push('support_broken');
  if (rows.length > R.closingLowBars && result.price < Math.min(...rows.slice(-R.closingLowBars - 1, -1).map(row => row.close))) pause.push('recent_closing_low');
  if (momentum.value !== null && momentum.value >= R.rsiExtreme) pause.push('rsi_extreme');
  if (momentum.divergenceState === 'CONFIRMED') pause.push('bearish_divergence_confirmed');
  else if (momentum.value !== null && momentum.value >= R.rsiOverbought && momentum.divergenceState === 'FORMING') pause.push('overbought_divergence');
  else {
    if (momentum.value !== null && momentum.value >= R.rsiOverbought) wait.push('rsi_overbought');
    if (momentum.divergenceState === 'FORMING') wait.push('bearish_divergence_forming');
  }
  if (momentum.value !== null && momentum.value <= R.rsiOversold) wait.push('rsi_oversold');
  if (result.position.state === 'near_resistance' || (result.position.state === 'inside_zone' && result.position.resistance && result.price >= result.position.resistance.lower)) wait.push('near_resistance');
  if (result.volume.state === 'low_rebound') wait.push('low_volume_rebound');
  if (result.volume.state === 'weakness') wait.push('volume_weakness');
  if (['downtrend', 'rebound'].includes(result.trend.state)) wait.push('downtrend');
  if (result.trend.state === 'mixed') wait.push('mixed_structure');
  if (result.volume.state === 'pullback') wait.push('pullback_unconfirmed');
  else if (result.position.state === 'inside_zone') wait.push('price_zone_unconfirmed');

  // Missing coverage blocks an observation verdict, but must not conceal a
  // concrete risk already established by the completed price/momentum data.
  result.verdict = pause.length ? 'pause' : missing.length ? 'insufficient' : wait.length ? 'wait'
    : ['uptrend', 'recovery'].includes(result.trend.state) ? 'observe' : 'wait';
  result.reasons = [...new Set([...pause, ...missing, ...wait])];
  if (!result.reasons.length) result.reasons = [result.volume.breakout?.active ? 'breakout_holding' : 'structure_improving'];
  return result;
}
