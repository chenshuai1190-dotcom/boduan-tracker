const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value ? value : '';

export function reviewTimelineCategory(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.kind === 'high') return ({ net_assets: 'net_assets_high', cumulative_return: 'return_high', cumulative_pnl: 'pnl_high' })[event.metric] || null;
  if (event.kind === 'drawdown' && event.metric === 'net_assets') return 'drawdown';
  if (event.kind === 'record' && event.metric === 'daily_return') return 'daily_record';
  if (event.kind === 'period' && event.metric === 'period_return') {
    const period = event.periodType || /^period:(month|quarter|year):/.exec(event.id || '')?.[1];
    return ['month', 'quarter', 'year'].includes(period) ? period : null;
  }
  return null;
}

// A daily refresh may change event.date but must not continually bump an old
// post. A drawdown starts when the 10% threshold was crossed, not at the peak.
export function reviewTimelineFeedDate(event) {
  if (event?.kind === 'drawdown') return date(event.trigger?.date)
    || date(event.nodes?.find(node => node.key === 'trigger')?.point?.date)
    || date(event.date);
  if (event?.kind === 'high') return date(event.startDate) || date(event.date);
  return date(event?.date);
}

const stateWords = event => ({ active: '持续跟踪 恢复中 recovering', recovered: '已恢复 回到前高 recovered',
  interrupted: '数据待核对 比较中断 interrupted', archived: '保留的评价 archived' })[event.status] || '';
const text = entry => `${entry.text || ''} ${(entry.stocks || []).join(' ')} ${entry.date || ''} ${(entry.replies || []).map(reply => reply.text || '').join(' ')}`;

// The system entry is a projection only. It carries the original event object
// and never creates a second log, changes the event, or splits its evaluations.
export function mergeReviewTimelineFeed(journalEntries = [], timelineEvents = [], preferences, { query = '' } = {}) {
  const term = String(query || '').trim().toLocaleLowerCase();
  const posts = journalEntries.filter(entry => !entry.timelineEvent && entry.type !== 'timeline'
    && (!term || text(entry).toLocaleLowerCase().includes(term)));
  const enabled = new Set(Array.isArray(preferences?.eventTypes) ? preferences.eventTypes : []);
  const latest = new Map();
  if (preferences?.showTimeline === true) {
    for (const event of timelineEvents) {
      if (!event?.id) continue;
      const previous = latest.get(event.id);
      const live = event.status !== 'archived', previousLive = previous?.status !== 'archived';
      if (!previous || (live && !previousLive)
        || (live === previousLive && String(event.date).localeCompare(String(previous.date)) > 0)) latest.set(event.id, event);
    }
  }
  const projected = [...latest.values()].flatMap(event => {
    if (!enabled.has(reviewTimelineCategory(event))) return [];
    const feedDate = reviewTimelineFeedDate(event);
    if (!feedDate) return [];
    const search = `${event.title || ''} ${feedDate} ${event.date || ''} ${stateWords(event)} ${event.description || ''} ${event.comparisonScope || ''}`;
    if (term && !search.toLocaleLowerCase().includes(term)) return [];
    return [{ type: 'timeline', id: event.id, event, date: feedDate }];
  });
  return [...posts, ...projected].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))
    || Number(a.type === 'timeline') - Number(b.type === 'timeline')
    || `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
}
