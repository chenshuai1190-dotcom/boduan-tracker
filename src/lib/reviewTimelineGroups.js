import { isReviewTimelineGroupEnabled } from './reviewPreferences.js';

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value ? value : '';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const eventDate = event => validDate(event?.date) || validDate(event?.endDate) || validDate(event?.startDate);
const eventStart = event => validDate(event?.startDate) || eventDate(event);
const amountMetric = metric => ['annual_pnl', 'cumulative_pnl'].includes(metric);

export function reviewTimelineRawCategory(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.kind === 'high') return ({ net_assets: 'net_assets_high', cumulative_return: 'return_high', cumulative_pnl: 'pnl_high', annual_return: 'annual_return_high', annual_pnl: 'annual_pnl_high' })[event.metric] || null;
  if (event.kind === 'low') return ({ annual_return: 'annual_return_low', annual_pnl: 'annual_pnl_low' })[event.metric] || null;
  if (event.kind === 'drawdown') return ({ net_assets: 'drawdown', cumulative_return: 'return_drawdown' })[event.metric] || null;
  if (event.kind === 'record' && event.metric === 'daily_return') return 'daily_record';
  if (event.kind === 'period' && event.metric === 'period_return') {
    const period = event.periodType || /^period:(month|quarter|year):/.exec(event.id || '')?.[1];
    return ['month', 'quarter', 'year'].includes(period) ? period : null;
  }
  return null;
}

function earningsScope(event) {
  if (['high', 'low'].includes(event?.kind) && ['annual_return', 'annual_pnl'].includes(event.metric)) return 'annual';
  return event?.kind === 'high' && ['cumulative_return', 'cumulative_pnl'].includes(event.metric) ? 'cumulative' : null;
}
export function reviewTimelineDisplayCategory(event) {
  const scope = earningsScope(event);
  return event?.displayCategory || (scope ? `${scope}_${event.kind}` : reviewTimelineRawCategory(event));
}
const sourceOrder = (a, b) => eventStart(a).localeCompare(eventStart(b))
  || Number(amountMetric(b.metric)) - Number(amountMetric(a.metric)) || String(a.id).localeCompare(String(b.id));
const newestSource = (a, b) => Number(a.status !== 'archived') - Number(b.status !== 'archived')
  || eventDate(a).localeCompare(eventDate(b)) || eventStart(a).localeCompare(eventStart(b))
  || String(a.id).localeCompare(String(b.id));
const displayOrder = (a, b) => eventDate(b).localeCompare(eventDate(a)) || String(a.id).localeCompare(String(b.id));

function uniqueSources(events) {
  const byId = new Map();
  for (const event of events) {
    if (!event?.id) continue;
    const previous = byId.get(event.id);
    if (!previous || newestSource(event, previous) > 0) byId.set(event.id, event);
  }
  return [...byId.values()].sort(sourceOrder);
}

function projectEarnings(sources, scope) {
  const sourceEvents = [...sources].sort(sourceOrder), anchorEvent = sourceEvents[0];
  const latestDate = sourceEvents.map(eventDate).sort().at(-1);
  const moneyField = scope === 'annual' ? 'annualPnlUsd' : 'cumulativePnlUsd';
  const returnField = scope === 'annual' ? 'annualReturnPct' : 'cumulativeReturnPct';
  const pointsByDate = new Map();
  const mergePoint = point => {
    const date = validDate(point?.date);
    if (!date) return;
    const current = pointsByDate.get(date) || { date };
    for (const [key, value] of Object.entries(point)) {
      if (value != null && current[key] == null) current[key] = value;
      else if (!(key in current)) current[key] = value;
    }
    pointsByDate.set(date, current);
  };
  // Prefer each event's explicit current close, then nodes, then chart history.
  for (const event of sourceEvents) mergePoint(event.current);
  for (const event of sourceEvents) for (const node of event.nodes || []) mergePoint(node.point);
  for (const event of sourceEvents) for (const point of event.points || []) mergePoint(point);
  const points = [...pointsByDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map(point => ({ ...point,
    [moneyField]: finite(point[moneyField]) ? point[moneyField] : null,
    [returnField]: finite(point[returnField]) ? point[returnField] : null }));
  const current = points.find(point => point.date === latestDate) || { date: latestDate, [moneyField]: null, [returnField]: null };
  const byDate = new Map(points.map(point => [point.date, point]));
  const nodesByDate = new Map();
  for (const event of sourceEvents) for (const node of event.nodes || []) {
    const date = validDate(node?.point?.date);
    if (!date) continue;
    const matching = nodesByDate.get(date) || [];
    matching.push(node); nodesByDate.set(date, matching);
  }
  const nodes = [...nodesByDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, originals], index) => ({
    key: date === latestDate ? 'current' : index === 0 ? 'start' : `record:${date}`,
    label: [...new Set(originals.map(node => node.label).filter(Boolean))].join(' / '),
    point: byDate.get(date), sourceNodeKeys: [...new Set(originals.map(node => node.key))],
  }));
  const latestMetrics = new Set(sourceEvents.filter(event => eventDate(event) === latestDate)
    .map(event => amountMetric(event.metric) ? 'amount' : 'return'));
  const recordMetrics = ['amount', 'return'].filter(metric => latestMetrics.has(metric));
  return { ...anchorEvent, id: anchorEvent.id, metric: scope === 'annual' ? 'annual_pnl' : 'cumulative_pnl',
    title: `${scope === 'annual' ? '年内' : '累计'}收益${anchorEvent.kind === 'high' ? '新高' : '新低'}`,
    date: latestDate, startDate: eventStart(anchorEvent), endDate: latestDate,
    value: current[moneyField], valueType: 'money', moneyField, returnValue: current[returnField], returnField,
    current, points, nodes, recordMetrics, scopeKeys: [scope], scopeRecordMetrics: { [scope]: recordMetrics },
    displayCategory: `${scope}_${anchorEvent.kind}`, anchorEvent,
    sourceEvents, sourceEventIds: sourceEvents.map(event => event.id) };
}

// Equality is limited to floating-point calculation noise, never rounded display values.
const sameNumber = (a, b) => finite(a) && finite(b)
  && Math.abs(a - b) <= Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)) * 8;

function crossScopeHistory(annual, cumulative) {
  const pointsByDate = new Map();
  for (const point of [...annual.points, ...cumulative.points]) {
    const merged = pointsByDate.get(point.date) || { date: point.date };
    for (const [key, value] of Object.entries(point)) if (merged[key] == null) merged[key] = value;
    pointsByDate.set(point.date, merged);
  }
  const points = [...pointsByDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map(point => ({ ...point,
    annualPnlUsd: finite(point.annualPnlUsd) ? point.annualPnlUsd : null,
    annualReturnPct: finite(point.annualReturnPct) ? point.annualReturnPct : null }));
  const pointMap = new Map(points.map(point => [point.date, point])), nodesByDate = new Map();
  for (const [scopeKey, event] of [['annual', annual], ['cumulative', cumulative]]) for (const node of event.nodes) {
    const date = node.point?.date;
    if (!validDate(date)) continue;
    const sourceNodes = nodesByDate.get(date) || [];
    sourceNodes.push({ ...node, scopeKey }); nodesByDate.set(date, sourceNodes);
  }
  const nodes = [...nodesByDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, sourceNodes], index) => {
    const scopeKeys = [...new Set(sourceNodes.map(node => node.scopeKey))];
    const roles = new Set(sourceNodes.flatMap(node => node.sourceNodeKeys || [node.key]));
    const label = scopeKeys.length > 1
      ? roles.size === 1 && roles.has('start') ? '此前高点' : roles.size === 1 && roles.has('current') ? '新高' : '历史节点'
      : sourceNodes.map(node => `${node.scopeKey === 'annual' ? '年内' : '累计'} · ${node.label}`).join(' / ');
    return { key: date === annual.date ? 'current' : index === 0 ? 'start' : `record:${date}`,
      label, point: pointMap.get(date), scopeKeys, sourceNodes };
  });
  return { points, nodes };
}

export function dedupeReviewTimelineScopes(events = []) {
  const ordered = [...events].sort(displayOrder), consumed = new Set(), result = [];
  for (const annual of ordered) {
    if (annual.displayCategory !== 'annual_high' || annual.scopeKeys?.length !== 1) continue;
    const cumulative = ordered.find(event => !consumed.has(event) && event.displayCategory === 'cumulative_high'
      && event.scopeKeys?.length === 1 && eventDate(event) === eventDate(annual)
      && sameNumber(event.value, annual.value) && sameNumber(event.returnValue, annual.returnValue)
      && event.recordMetrics?.join(',') === annual.recordMetrics?.join(','));
    if (!cumulative) continue;
    consumed.add(annual); consumed.add(cumulative);
    const sourceEvents = uniqueSources([...annual.sourceEvents, ...cumulative.sourceEvents]);
    result.push({ ...annual, ...crossScopeHistory(annual, cumulative), title: '年内·累计收益新高', scopeKeys: ['annual', 'cumulative'],
      scopeRecordMetrics: { annual: annual.recordMetrics, cumulative: cumulative.recordMetrics },
      sourceEvents, sourceEventIds: sourceEvents.map(event => event.id) });
  }
  return [...result, ...ordered.filter(event => !consumed.has(event))].sort(displayOrder);
}

/** A read-only display projection. Original events remain the comment/reference authority. */
export function groupReviewTimelineEvents(rawEvents = [], { eventTypes, dedupeScopes = true } = {}) {
  const sources = uniqueSources(Array.isArray(rawEvents) ? rawEvents : []);
  const passthrough = [], buckets = new Map();
  for (const event of sources) {
    const scope = earningsScope(event), category = scope ? `${scope}_${event.kind}` : reviewTimelineRawCategory(event);
    if (eventTypes !== undefined && !isReviewTimelineGroupEnabled(eventTypes, category)) continue;
    const start = eventStart(event), end = eventDate(event);
    // Archived pointers have no authoritative financial readings. Keep their original containers.
    if (!scope || event.status === 'archived' || !start || !end || start > end) { passthrough.push(event); continue; }
    const key = `${category}:${end.slice(0, 4)}`;
    const bucket = buckets.get(key) || [];
    bucket.push(event); buckets.set(key, bucket);
  }
  const projected = [];
  for (const bucket of buckets.values()) {
    let component = [], end = '';
    const flush = () => { if (component.length) projected.push(projectEarnings(component, earningsScope(component[0]))); };
    for (const event of bucket.sort(sourceOrder)) {
      if (component.length && eventStart(event) > end) { flush(); component = []; end = ''; }
      component.push(event);
      if (eventDate(event) > end) end = eventDate(event);
    }
    flush();
  }
  const result = [...passthrough, ...projected].sort(displayOrder);
  return dedupeScopes ? dedupeReviewTimelineScopes(result) : result;
}
