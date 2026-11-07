import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';
import { isReviewAccountCloseDate, latestReviewAccountCloseDate } from './reviewAccountSnapshot.js';
import { isCompletedCloseSnapshot } from './pnlReportViewModel.js';

const DAY = 86400000;
const fail = (code, message) => Object.assign(new Error(message), { code });
const numeric = value => {
  if (typeof value !== 'number' && (typeof value !== 'string'
    || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
const pct = value => {
  const number = numeric(value);
  return number !== null && Number.isFinite(number * 100) ? number * 100 : null;
};
const validDate = value => typeof value === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const timestamp = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
  && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const eventId = value => /^[1-9]\d*$/.test(String(value ?? ''));
const closeEnough = (a, b) => Math.abs(a - b) <= Math.max(0.000002, Math.max(Math.abs(a), Math.abs(b)) * 1e-10);
const nyFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
function nyTime(time) {
  const parts = Object.fromEntries(nyFormatter.formatToParts(new Date(time)).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`,
    seconds: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)
      + ((time % 1000 + 1000) % 1000) / 1000 };
}
function atOrBeforeClose(time, date) {
  const local = nyTime(time);
  return local.date < date || (local.date === date && local.seconds <= 17 * 3600);
}
const usableTimestamp = (value, now) => value == null || (timestamp(value) !== null && timestamp(value) <= now);
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const isSession = date => ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) && !isRegularNyseHoliday(date);
function adjacentSession(date, direction = 1) {
  let day = addDays(date, direction);
  while (!isSession(day)) day = addDays(day, direction);
  return day;
}
const duration = (start, end) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY);

function verifyOwner(rows, owner) {
  for (const row of rows) {
    if (!row || typeof row.user_id !== 'string' || !row.user_id || row.user_id !== owner) {
      throw fail('REVIEW_ACCOUNT_CHANGED', '账户数据不匹配，请重新打开时间线。');
    }
  }
}

function verifiedNetAssets(row, date, now) {
  const locked = timestamp(row.locked_at), updated = timestamp(row.updated_at);
  if (row.source_version !== 'pnl_snapshot_v2' || locked === null || locked > now || updated === null || updated > now
    || !isReviewAccountCloseDate(date, locked)) return null;
  const net = numeric(row.net_assets_usd), total = numeric(row.total_assets_usd);
  const market = numeric(row.market_value_usd), cash = numeric(row.cash_usd), debt = numeric(row.margin_debt_usd);
  if ([net, total, market, cash, debt].some(value => value === null) || total < 0 || market < 0 || cash < 0 || debt < 0
    || !closeEnough(total, market + cash) || !closeEnough(net, total - debt)) return null;
  const cashTime = timestamp(row.cash_effective_at), debtTime = timestamp(row.margin_debt_effective_at);
  if (row.cash_basis !== 'event' || !eventId(row.cash_event_id) || cashTime === null || !atOrBeforeClose(cashTime, date)) return null;
  const verifiedDebt = row.margin_debt_basis === 'event'
    ? eventId(row.margin_debt_event_id) && debtTime !== null && atOrBeforeClose(debtTime, date)
    : row.margin_debt_basis === 'default_zero' && debt === 0 && row.margin_debt_event_id == null && row.margin_debt_effective_at == null;
  if (!verifiedDebt) return null;
  return net;
}

function normalizeSnapshot(row, now) {
  const date = row.snapshot_date;
  if (!validDate(date) || !isReviewAccountCloseDate(date, now) || row.currency !== 'USD'
    || typeof row.id !== 'string' || !row.id.trim()
    || !['pnl_snapshot_v1', 'pnl_snapshot_v2'].includes(row.source_version)
    || !usableTimestamp(row.locked_at, now) || !usableTimestamp(row.updated_at, now)
    || !isCompletedCloseSnapshot({ snapshotDate: date, lockedAt: row.locked_at }, new Date(now))) return null;
  const net = verifiedNetAssets(row, date, now);
  return {
    date, netAssetsUsd: net, chartValue: net,
    totalAssetsUsd: net === null ? null : numeric(row.total_assets_usd),
    cashUsd: net === null ? null : numeric(row.cash_usd),
    marginDebtUsd: net === null ? null : numeric(row.margin_debt_usd),
    cumulativeReturnPct: pct(row.cumulative_pnl_pct), dailyReturnPct: pct(row.daily_pnl_pct),
    cumulativePnlUsd: numeric(row.cumulative_pnl_usd), dailyPnlUsd: numeric(row.daily_pnl_usd),
    cashEventId: eventId(row.cash_event_id) ? String(row.cash_event_id) : null,
    cashEffectiveAt: row.cash_effective_at ?? null,
    sourceSnapshotId: row.id, sourceVersion: row.source_version,
    sourceUpdatedAt: row.updated_at ?? null, lockedAt: row.locked_at ?? null,
  };
}

function normalizeMovements(rows, now) {
  const seen = new Set();
  return rows.map(row => {
    const time = timestamp(row.occurred_at), deltaUsd = numeric(row.delta_usd);
    if (typeof row.id !== 'string' || !row.id || seen.has(row.id) || time === null || !eventId(row.cash_event_id)
      || deltaUsd === null || !['transfer_in', 'transfer_out', 'balance_adjustment', 'reversal'].includes(row.kind)
      || (row.kind === 'transfer_in' && deltaUsd <= 0) || (row.kind === 'transfer_out' && deltaUsd >= 0)) {
      throw fail('REVIEW_CASH_HISTORY_INVALID', '资金变动记录无法核验，暂不计算时间线。');
    }
    seen.add(row.id);
    return { id: row.id, time, kind: row.kind, deltaUsd, cashEventId: String(row.cash_event_id), date: nyTime(time).date };
  }).filter(row => row.time <= now).sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

function comparisonBreak(previous, current, movements) {
  if (adjacentSession(previous.date) !== current.date) return { reason: 'missing_session' };
  const between = movements.filter(row => !atOrBeforeClose(row.time, previous.date) && atOrBeforeClose(row.time, current.date));
  if (between.length) {
    const external = between.every(row => ['transfer_in', 'transfer_out'].includes(row.kind));
    return {
      reason: external ? 'external_cash_flow' : 'cash_adjustment',
      cashFlowSummary: { kind: between.length === 1 ? between[0].kind : 'multiple',
        deltaUsd: between.reduce((sum, row) => sum + row.deltaUsd, 0), date: current.date, count: between.length },
    };
  }
  if (previous.cashEventId !== current.cashEventId || previous.cashEffectiveAt !== current.cashEffectiveAt
    || (previous.cashUsd !== null && current.cashUsd !== null && !closeEnough(previous.cashUsd, current.cashUsd))) {
    return { reason: 'cash_source_changed' };
  }
  if (previous.netAssetsUsd === null || current.netAssetsUsd === null) return { reason: 'missing_net_assets' };
  return null;
}

const node = (key, label, point) => ({ key, label, point });
function drawdownNodes(event) {
  return [node('peak', '前高', event.peak), node('trigger', '首次回落 10%', event.trigger),
    node('trough', '最低点', event.trough), node(event.status === 'recovered' ? 'recovery' : 'current',
      event.status === 'recovered' ? '回到前高' : '最近收盘', event.current)];
}
function updateCycle(cycle, current, points, status = 'active') {
  const drawdownPct = (current.netAssetsUsd / cycle.peak.netAssetsUsd - 1) * 100;
  if (current.netAssetsUsd < cycle.trough.netAssetsUsd) cycle.trough = current;
  Object.assign(cycle, { current, points: [...points], date: current.date, endDate: current.date, status,
    drawdownPct: status === 'recovered' ? 0 : drawdownPct,
    maxDrawdownPct: (cycle.trough.netAssetsUsd / cycle.peak.netAssetsUsd - 1) * 100,
    value: status === 'recovered' ? 0 : drawdownPct, durationDays: duration(cycle.peak.date, current.date) });
  cycle.nodes = drawdownNodes(cycle);
}

function netAssetEvents(points, movements, warnings) {
  const events = [], interruptions = [];
  let peak = null, peakPoints = [], previous = null, cycle = null, highRun = null;
  let scope = '连续可核验区间';
  for (const current of points) {
    const stop = previous ? comparisonBreak(previous, current, movements) : null;
    if (stop) {
      interruptions.push({ date: current.date, reason: stop.reason, cashFlowSummary: stop.cashFlowSummary ?? null });
      if (cycle) {
        Object.assign(cycle, { status: 'interrupted', interruptionReason: stop.reason,
          interruptedAt: current.date, cashFlowSummary: stop.cashFlowSummary ?? null });
        cycle.nodes = drawdownNodes(cycle);
      }
      scope = ['external_cash_flow', 'cash_adjustment', 'cash_source_changed'].includes(stop.reason)
        ? '资金变化后重新计起' : '数据中断后重新计起';
      peak = null; peakPoints = []; cycle = null; highRun = null;
    }
    previous = current;
    if (current.netAssetsUsd === null) continue;
    if (!peak) { peak = current; peakPoints = [current]; continue; }
    peakPoints.push(current);
    if (cycle) {
      const recovered = current.netAssetsUsd >= peak.netAssetsUsd;
      updateCycle(cycle, current, peakPoints, recovered ? 'recovered' : 'active');
      if (!recovered) continue;
      cycle = null;
    }
    if (current.netAssetsUsd > peak.netAssetsUsd) {
      if (highRun && highRun.endDate === peak.date) {
        Object.assign(highRun, { date: current.date, endDate: current.date, value: current.netAssetsUsd,
          current, points: [...highRun.points, current], nodes: [node('start', '本轮起点', highRun.points[0]), node('current', '新高', current)] });
      } else {
        highRun = { id: `high:net_assets:${current.date}`, kind: 'high', metric: 'net_assets', date: current.date,
          title: '净资产创新高', value: current.netAssetsUsd, valueType: 'money',
          startDate: current.date, endDate: current.date, current, points: [peak, current],
          nodes: [node('start', '此前高点', peak), node('current', '新高', current)], comparisonScope: scope };
        events.push(highRun);
      }
      peak = current; peakPoints = [current];
    } else {
      highRun = null;
      // Equal closes may refresh the peak date; they are not another high record.
      if (current.netAssetsUsd === peak.netAssetsUsd) { peak = current; peakPoints = [current]; continue; }
      if (peak.netAssetsUsd > 0 && (current.netAssetsUsd / peak.netAssetsUsd - 1) * 100 <= -10 + 1e-10) {
        cycle = { id: `drawdown:net_assets:${peak.date}`, kind: 'drawdown', metric: 'net_assets',
          title: '净资产回落', valueType: 'percent', startDate: peak.date,
          peak, trigger: current, trough: current, comparisonScope: scope };
        updateCycle(cycle, current, peakPoints);
        events.push(cycle);
      }
    }
  }
  if (interruptions.some(item => ['external_cash_flow', 'cash_adjustment', 'cash_source_changed'].includes(item.reason))) {
    warnings.add('资金转入、转出或余额来源变化处已中断净资产比较，并从新的收盘重新计起；入金不算恢复，出金不算回撤。');
  }
  if (interruptions.some(item => ['missing_session', 'missing_net_assets'].includes(item.reason))) {
    warnings.add('缺少交易日或可核验净资产时已中断回撤周期，不能据此认定已经恢复前高。');
  }
  return { events, interruptions };
}

function reportRecordEvents(points) {
  const events = [];
  for (const [metric, field, title, valueType] of [
    ['cumulative_return', 'cumulativeReturnPct', '累计收益率新高', 'percent'],
    ['cumulative_pnl', 'cumulativePnlUsd', '累计盈利新高', 'money'],
  ]) {
    let peak = null, run = null;
    for (const point of points) {
      if (point[field] === null) { run = null; continue; }
      if (!peak) { peak = point; continue; }
      if (point[field] > peak[field]) {
        if (run && adjacentSession(run.endDate) === point.date) {
          Object.assign(run, { date: point.date, endDate: point.date, value: point[field], current: point,
            points: [...run.points, point], nodes: [run.nodes[0], node('current', '新高', point)] });
        } else {
          run = { id: `high:${metric}:${point.date}`, kind: 'high', metric, date: point.date, title,
            value: point[field], valueType, startDate: point.date, endDate: point.date, current: point,
            points: [peak, point], nodes: [node('start', '此前已记录高点', peak), node('current', '新高', point)],
            comparisonScope: '收益报表已记录区间', basis: 'pnl_report' };
          events.push(run);
        }
        peak = point;
      } else { run = null; }
    }
  }
  let year = null, max = null, min = null, previous = null;
  for (const point of points) {
    if (point.dailyReturnPct === null) continue;
    if (year !== point.date.slice(0, 4)) { year = point.date.slice(0, 4); max = null; min = null; previous = null; }
    const value = point.dailyReturnPct;
    const direction = previous && value > 0 && value > max ? 'best' : previous && value < 0 && value < min ? 'worst' : null;
    if (direction) events.push({ id: `record:daily_return:${point.date}:${direction}`, kind: 'record', metric: 'daily_return',
      date: point.date, title: direction === 'best' ? '年内单日最大涨幅' : '年内单日最大跌幅',
      value, valueType: 'percent', startDate: point.date, endDate: point.date, current: point, points: [point],
      nodes: [node('current', '当日收盘', point)], recordDirection: direction, comparisonScope: `${year} 年已记录交易日`, basis: 'pnl_report' });
    max = max === null ? value : Math.max(max, value);
    min = min === null ? value : Math.min(min, value);
    previous = point;
  }
  return events;
}

function periodBounds(date, type) {
  const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7));
  const startMonth = type === 'year' ? 1 : type === 'quarter' ? Math.floor((month - 1) / 3) * 3 + 1 : month;
  const months = type === 'year' ? 12 : type === 'quarter' ? 3 : 1;
  const start = `${year}-${String(startMonth).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(year, startMonth - 1 + months, 0)).toISOString().slice(0, 10);
  return { start, end, label: type === 'year' ? `${year} 年` : type === 'quarter' ? `${year} 年 Q${Math.floor((month - 1) / 3) + 1}` : `${year} 年 ${month} 月` };
}

function periodEvents(points, latestCloseDate) {
  const byDate = new Map(points.map(point => [point.date, point]));
  const events = [];
  for (const type of ['month', 'quarter', 'year']) {
    const seen = new Set();
    let maximum = null, minimum = null;
    for (const point of points) {
      const { start, end, label } = periodBounds(point.date, type);
      if (seen.has(start)) continue;
      seen.add(start);
      const sessions = [];
      for (let date = start; date <= end; date = addDays(date, 1)) if (isSession(date)) sessions.push(date);
      if (!sessions.length || sessions.at(-1) > latestCloseDate) continue;
      const baseline = byDate.get(adjacentSession(sessions[0], -1));
      const periodPoints = sessions.map(date => byDate.get(date));
      if (!baseline || baseline.cumulativeReturnPct === null || baseline.cumulativePnlUsd === null
        || periodPoints.some(item => !item || item.cumulativeReturnPct === null || item.cumulativePnlUsd === null)) continue;
      const current = periodPoints.at(-1);
      // This is the existing report's interval calculation. Do not use net-asset changes as investment returns.
      const value = current.cumulativeReturnPct - baseline.cumulativeReturnPct;
      const periodPnlUsd = current.cumulativePnlUsd - baseline.cumulativePnlUsd;
      if (!Number.isFinite(value) || !Number.isFinite(periodPnlUsd)) continue;
      const recordDirection = maximum !== null && value > maximum ? 'best' : minimum !== null && value < minimum ? 'worst' : null;
      const title = `${label}${recordDirection === 'best' ? ' · 已记录周期最佳' : recordDirection === 'worst' ? ' · 已记录周期最差' : '收官'}`;
      events.push({ id: `period:${type}:${start}`, kind: 'period', metric: 'period_return', date: current.date, title,
        value, valueType: 'percent', startDate: sessions[0], endDate: current.date, periodType: type,
        periodStartDate: start, periodEndDate: end, current, baseline, periodPnlUsd,
        points: [baseline, ...periodPoints], nodes: [node('start', '上期末', baseline), node('current', '本期末', current)],
        recordDirection, comparisonScope: '完整收益报表区间', basis: 'pnl_report_period_difference' });
      maximum = maximum === null ? value : Math.max(maximum, value);
      minimum = minimum === null ? value : Math.min(minimum, value);
    }
  }
  return events;
}

/** Pure, read-only derivation from authenticated raw report rows; never fills absent values with zero. */
export function buildReviewTimeline({ snapshots = [], movements = [], now = Date.now(), expectedUserId } = {}) {
  const currentTime = Number(now);
  if (!Array.isArray(snapshots) || !Array.isArray(movements)) throw fail('REVIEW_HISTORY_INVALID', '时间线数据格式不正确。');
  if (!Number.isFinite(currentTime) || !Number.isFinite(new Date(currentTime).getTime())) throw fail('REVIEW_CLOCK_INVALID', '无法确认当前日期。');
  const owner = expectedUserId ?? snapshots[0]?.user_id ?? movements[0]?.user_id;
  verifyOwner(snapshots, owner); verifyOwner(movements, owner);
  const warnings = new Set();
  const seenDates = new Set();
  for (const row of snapshots) {
    if (seenDates.has(row.snapshot_date)) throw fail('REVIEW_HISTORY_DUPLICATE', '同一交易日存在重复快照，暂不计算时间线。');
    seenDates.add(row.snapshot_date);
  }
  const points = snapshots.map(row => normalizeSnapshot(row, currentTime)).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  const cashMovements = normalizeMovements(movements, currentTime);
  if (points.length < snapshots.length) warnings.add('未完成收盘或无法核验的报表行未参与计算。');
  const netAssetCount = points.filter(point => point.netAssetsUsd !== null).length;
  if (netAssetCount < points.length) warnings.add('部分历史报表没有完整净资产依据；保留其已记录收益数据，不补算净资产。');
  const { events: assetEvents, interruptions } = netAssetEvents(points, cashMovements, warnings);
  const latestCloseDate = latestReviewAccountCloseDate(currentTime);
  const events = [...assetEvents, ...reportRecordEvents(points), ...periodEvents(points, latestCloseDate)]
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return {
    events,
    years: [...new Set(events.map(event => Number(event.date.slice(0, 4))))].sort((a, b) => b - a),
    coverage: { startDate: points[0]?.date ?? null, endDate: points.at(-1)?.date ?? null,
      snapshotCount: points.length, netAssetCount, excludedCount: snapshots.length - points.length,
      interruptionCount: interruptions.length, interruptions, latestCloseDate,
      scope: '已记录的正式收盘数据', fullHistory: false },
    warnings: [...warnings],
  };
}
