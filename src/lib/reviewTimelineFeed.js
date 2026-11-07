import { dedupeReviewTimelineScopes, groupReviewTimelineEvents, reviewTimelineDisplayCategory, reviewTimelineRawCategory } from './reviewTimelineGroups.js';

const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value ? value : '';

export function reviewTimelineCategory(event) {
  return event?.displayCategory || reviewTimelineRawCategory(event);
}

function eventOriginDate(event) {
  if (event?.kind === 'drawdown') return date(event.trigger?.date)
    || date(event.nodes?.find(node => node.key === 'trigger')?.point?.date)
    || date(event.date);
  if (['high', 'low'].includes(event?.kind)) return date(event.startDate) || date(event.date);
  return date(event?.date);
}

// Condensed activity follows the latest recorded data, while the original
// event identity and cycle milestones remain unchanged.
export function reviewTimelineFeedDate(event) {
  return date(event?.date) || date(event?.endDate) || eventOriginDate(event);
}

const stateWords = event => event.kind === 'drawdown' && event.metric === 'cumulative_return' && event.interruptionReason === 'year_boundary'
  ? '年度结束 year ended' : ({ active: '持续跟踪 恢复中 recovering', recovered: '已恢复 回到前高 recovered',
  interrupted: '数据待核对 比较中断 interrupted', archived: '保留的评价 archived' })[event.status] || '';
const text = entry => `${entry.text || ''} ${(entry.stocks || []).join(' ')} ${entry.date || ''} ${(entry.replies || []).map(reply => reply.text || '').join(' ')}`;
const compareEvents = (left, right) => Number(left.status !== 'archived') - Number(right.status !== 'archived')
  || reviewTimelineFeedDate(left).localeCompare(reviewTimelineFeedDate(right))
  || eventOriginDate(left).localeCompare(eventOriginDate(right))
  || String(left.id).localeCompare(String(right.id));

function feedBranch(event, category) {
  if (category === 'drawdown') return `${category}:${event.metric}`;
  if (category !== 'daily_record') return category;
  // Archived evaluation references retain the original ID, but not recordDirection.
  const direction = ['best', 'worst'].includes(event.recordDirection) ? event.recordDirection
    : /:(best|worst)$/.exec(event.id)?.[1]
      || (typeof event.value === 'number' && event.value > 0 ? 'best'
        : typeof event.value === 'number' && event.value < 0 ? 'worst' : 'unknown');
  return `${category}:${direction}`;
}

// The system entry is a projection only. It carries the original event object
// and never creates a second log, changes the event, or splits its evaluations.
export function mergeReviewTimelineFeed(journalEntries = [], timelineEvents = [], preferences, { query = '' } = {}) {
  const term = String(query || '').trim().toLocaleLowerCase();
  const posts = journalEntries.filter(entry => !entry.timelineEvent && entry.type !== 'timeline'
    && (!term || text(entry).toLocaleLowerCase().includes(term)));
  const eventTypes = Array.isArray(preferences?.eventTypes) ? preferences.eventTypes : [];
  const grouped = preferences?.showTimeline === true
    ? groupReviewTimelineEvents(timelineEvents, { eventTypes, dedupeScopes: false }) : [];
  // Only All is condensed. Keep original events and IDs for the full timeline
  // and its evaluations, and choose the latest before applying text search.
  const branches = new Map();
  for (const event of grouped) {
    const category = reviewTimelineDisplayCategory(event);
    if (!category || !reviewTimelineFeedDate(event)) continue;
    const branch = feedBranch(event, category), previous = branches.get(branch);
    if (!previous || compareEvents(event, previous) > 0) branches.set(branch, event);
  }
  const projected = dedupeReviewTimelineScopes([...branches.values()]).flatMap(event => {
    const feedDate = reviewTimelineFeedDate(event);
    const search = `${event.title || ''} ${feedDate} ${event.date || ''} ${stateWords(event)} ${event.description || ''} ${event.comparisonScope || ''}`;
    if (term && !search.toLocaleLowerCase().includes(term)) return [];
    return [{ type: 'timeline', id: event.id, event, date: feedDate }];
  });
  return [...posts, ...projected].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))
    || Number(a.type === 'timeline') - Number(b.type === 'timeline')
    || `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
}
