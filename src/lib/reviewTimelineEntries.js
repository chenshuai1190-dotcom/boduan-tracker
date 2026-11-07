// Grouping is a display projection. Every write still addresses one original
// timeline event container, including when two containers share a reply UUID.
export function reviewTimelineSourceIds(event) {
  return [...new Set([event?.id, ...(event?.sourceEventIds || []),
    ...(event?.sourceEvents || []).map(source => source.id)].filter(Boolean))];
}

export function resolveReviewTimelineEvent(events, eventId) {
  return events.find(event => reviewTimelineSourceIds(event).includes(eventId)) || null;
}

export function reviewTimelineAnchorEntry(event, storedEntries = []) {
  const anchor = event.anchorEvent || event;
  const stored = storedEntries.find(entry => entry.timelineEvent?.id === anchor.id);
  if (stored) return stored;
  return { type: 'log', date: anchor.startDate || anchor.date, text: anchor.title,
    mood: '', level: '🟢', pinned: false, stocks: [], market: null, images: [], replies: [], revision: 0,
    timelineEvent: { version: 1, id: anchor.id, kind: anchor.kind, metric: anchor.metric,
      date: anchor.startDate || anchor.date, title: anchor.title } };
}

export function reviewTimelineReplyKey(reply) {
  const source = reply?.timelineReplySource;
  return source ? JSON.stringify([source.entryId, source.eventId, reply.id]) : reply.id;
}

export function projectReviewTimelineEntry(event, storedEntries = []) {
  const sourceIds = reviewTimelineSourceIds(event);
  const replies = storedEntries.filter(entry => sourceIds.includes(entry.timelineEvent?.id))
    .flatMap(entry => (entry.replies || []).map(reply => ({ ...reply,
      timelineReplySource: { entryId: entry.id, eventId: entry.timelineEvent.id } })))
    .sort((left, right) => String(left.date || '').localeCompare(String(right.date || ''))
      || String(left.createdAt || '').localeCompare(String(right.createdAt || ''))
      || reviewTimelineReplyKey(left).localeCompare(reviewTimelineReplyKey(right)));
  return { ...reviewTimelineAnchorEntry(event, storedEntries), text: event.title,
    timelineSourceEventIds: sourceIds, replies };
}

export function findReviewEntryByKey(entries, key) {
  if (typeof key !== 'string') return null;
  if (key.startsWith('timeline:')) {
    const id = key.slice(9);
    return entries.find(entry => entry.timelineEvent && (entry.timelineEvent.id === id
      || entry.timelineSourceEventIds?.includes(id))) || null;
  }
  return entries.find(entry => !entry.timelineEvent && `${entry.type}:${entry.id}` === key) || null;
}

// Never fall back to another grouped member: a missing or changed source must
// fail closed rather than editing a same-ID reply in a different container.
export function resolveReviewReplySource(displayEntry, displayReply, storedEntries = []) {
  if (!displayEntry || !displayReply) return null;
  if (!displayEntry.timelineEvent) {
    const reply = displayEntry.replies?.find(item => item.id === displayReply.id);
    return reply ? { entry: displayEntry, reply: displayReply } : null;
  }
  const source = displayReply.timelineReplySource;
  if (!source || !displayEntry.timelineSourceEventIds?.includes(source.eventId)) return null;
  const entry = storedEntries.find(item => item.id === source.entryId && item.timelineEvent?.id === source.eventId);
  const reply = entry?.replies?.find(item => item.id === displayReply.id);
  if (!reply) return null;
  // Keep the version the user saw when opening the menu/editor. The repository
  // compares this original payload with the server before editing or deleting.
  const originalReply = { ...displayReply };
  delete originalReply.timelineReplySource;
  return { entry, reply: originalReply };
}
