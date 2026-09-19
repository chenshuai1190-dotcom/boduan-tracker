import { MACRO_GROUPS, MACRO_METRICS } from './macroCatalog.js';
import { formatMacroChange } from './macroFormat.js';

const DAY = 86400000;
const finite = value => typeof value === 'number' && Number.isFinite(value);
export const MACRO_FRESHNESS_DAYS = Object.freeze({ daily: 5, weekly: 14 });
export function isMacroDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function normalizeMacroHistory(rows, { from = '1900-01-01', to = new Date().toISOString().slice(0, 10) } = {}) {
  const byDate = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isMacroDate(row?.date) || row.date < from || row.date > to || !finite(row.value)) continue;
    if (byDate.has(row.date) && byDate.get(row.date) !== row.value) byDate.set(row.date, null);
    else if (!byDate.has(row.date)) byDate.set(row.date, row.value);
  }
  return [...byDate].filter(([, value]) => finite(value)).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}
function change(value, prior, meta) {
  if (!finite(value) || !finite(prior)) return null;
  if (meta.changeUnit === 'percent') return prior === 0 ? null : (value / prior - 1) * 100;
  return (value - prior) * (meta.unit === 'percent' && meta.changeUnit === 'bp' ? 100 : 1);
}
export function normalizeMacroMetric(id, input = {}, { from, now = new Date().toISOString() } = {}) {
  const meta = MACRO_METRICS[id];
  if (input.simulated === true || /模拟|演示/.test(input.source || '')) input = { error: '尚未取得真实数据' };
  const history = normalizeMacroHistory(input.history, { from, to: now.slice(0, 10) });
  const last = history.at(-1);
  const value = last?.value ?? null;
  const frequency = input.frequency || meta.frequency;
  const weekly = frequency.includes('周');
  const age = last ? (Date.parse(now.slice(0, 10)) - Date.parse(last.date)) / DAY : Infinity;
  const freshness = !last ? 'unavailable' : age > (weekly ? MACRO_FRESHNESS_DAYS.weekly : MACRO_FRESHNESS_DAYS.daily) ? 'stale' : 'fresh';
  const changes = Object.fromEntries([[1, 'change1d'], [5, 'change5d'], [20, 'change20d']].map(([offset, key]) => [key, change(value, history.at(-offset - 1)?.value, meta)]));
  const recent = history.slice(-20);
  const percentile20d = recent.length < 20 ? null : recent.filter(point => point.value <= value).length / recent.length * 100;
  return {
    ...meta, ...changes, frequency, observationUnit: weekly ? '周' : '日',
    value, history, percentile20d, asOf: last?.date || null, observationAsOf: last?.date || null,
    source: input.source || '未接通', sourceUrl: input.sourceUrl || null, basis: input.basis || null, historyNote: input.historyNote || null,
    fetchedAt: input.fetchedAt || now, simulated: false, freshness,
    status: !last ? '数据缺失' : freshness === 'stale' ? '数据待更新' : !finite(changes.change1d) ? '变化未知' : changes.change1d > 0 ? '上行' : changes.change1d < 0 ? '下行' : '持平',
    error: input.error || (!last ? '尚未取得有效数据' : null),
    explanation: !last ? '数据不可用，不据此判断环境。' : `${meta.name}较前次观测${formatMacroChange(changes.change1d, meta.changeUnit)}；近5个观测期${formatMacroChange(changes.change5d, meta.changeUnit)}，近20个观测期${formatMacroChange(changes.change20d, meta.changeUnit)}。${input.basis || ''}`,
    derived: id === 'netLiquidity' || id === 'spread10y2y',
  };
}

// Join exact observation dates. Never subtract asynchronous latest values or
// forward-fill missing releases. These are observed histories, not PIT backtests.
export function deriveMacroSeries(series, ids, calculate) {
  const maps = ids.map(id => new Map((series[id]?.history || []).map(point => [point.date, point.value])));
  if (maps.some(map => !map.size)) return [];
  return [...maps[0].keys()].filter(date => maps.every(map => finite(map.get(date))))
    .sort().map(date => ({ date, value: calculate(...maps.map(map => map.get(date))) }));
}
export function createMacroSnapshot({ series = {}, events = [], calendarStatus = 'unavailable', calendarError = '经济日历尚未接通', now = new Date().toISOString(), from } = {}) {
  const metrics = Object.fromEntries(Object.keys(MACRO_METRICS).map(id => [id, normalizeMacroMetric(id, series[id], { from, now })]));
  metrics.spread10y2y = normalizeMacroMetric('spread10y2y', {
    history: deriveMacroSeries(metrics, ['us10y', 'us2y'], (long, short) => (long - short) * 100),
    source: '派生 · 美国国债收益率', basis: '按同一观测日的10年期减2年期收益率。',
  }, { now, from });
  metrics.netLiquidity = normalizeMacroMetric('netLiquidity', {
    history: deriveMacroSeries(metrics, ['fedBalance', 'tga', 'rrp'], (fed, tga, rrp) => fed - tga - rrp),
    source: '派生 · FRED', frequency: '周度',
    basis: '仅使用三个分项均存在的同日观测，单位统一为十亿美元；并非官方指标。',
  }, { now, from });
  const available = Object.values(metrics).filter(metric => finite(metric.value));
  const missing = Object.values(metrics).filter(metric => !finite(metric.value)).map(metric => metric.id);
  const stale = Object.values(metrics).filter(metric => metric.freshness === 'stale').map(metric => metric.id);
  const summary = ids => ids.map(id => metrics[id]).filter(metric => finite(metric.value)).map(metric => metric.explanation).join(' ') || '暂无可用数据，暂不判断环境。';
  return {
    schemaVersion: 1, simulated: false, source: 'MacroDataService', fetchedAt: now, now,
    asOf: available.map(metric => metric.asOf).sort().at(-1) || null,
    metrics, groups: MACRO_GROUPS, events, calendarStatus, calendarError,
    availability: { available: available.length, total: Object.keys(MACRO_METRICS).length, missing, stale },
    regime: { label: '待评估', summary: '真实指标已接入，综合环境模型尚未启用。' },
    growth: { score: null, previous: null, label: '待评估', factors: [] },
    sections: {
      rates: { label: metrics.us10y.status, summary: summary(['us10y', 'real10y']) },
      inflation: { label: metrics.wti.status, summary: summary(['wti', 'be10y']) },
      stress: { label: metrics.vix.status, summary: summary(['vix', 'hyOas']) },
      liquidity: { label: metrics.netLiquidity.status, summary: summary(['netLiquidity', 'sofr']) },
    },
    interpretation: summary(['us10y', 'wti']),
    notes: ['显示供应商最近公布的真实观测，不是逐笔实时行情。', '综合环境和压力评分尚未启用；数据接入不代表模型已回测。', '历史数据可能包含修订，不可直接用作无未来信息的历史回测。'],
  };
}
