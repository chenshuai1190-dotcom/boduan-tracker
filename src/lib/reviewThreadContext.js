// A merged timeline is only a presentation. Comment writes keep addressing
// the original source container, even when two containers share a reply ID.
export function reviewCommentPostsForDetail(detail, storedEntries, userId) {
  if (!detail || !userId) return [];
  const sourceIds = detail.timelineSourceEventIds || [detail.timelineEvent?.id];
  const entries = detail.timelineEvent
    ? storedEntries.filter(entry => sourceIds.includes(entry.timelineEvent?.id)) : [detail];
  return entries.filter(entry => entry.id != null && ['log', 'insight'].includes(entry.type)).map(entry => ({
    id: `${entry.type}:${entry.id}`, sourceId: entry.id, type: entry.type,
    date: entry.date, text: entry.text, stocks: entry.stocks || [], authorId: userId,
    visibility: entry.timelineEvent ? 'private' : entry.visibility || 'private', sourceEntry: entry,
  }));
}

export function reviewAuthorCommentForManagement(post, comment) {
  if ((comment?.kind || comment?.source) !== 'author') return null;
  const entry = post?.sourceEntry;
  const original = entry?.replies?.find(reply => reply.id === comment.id);
  if (!original) return null;
  return entry.timelineEvent ? { ...original, timelineReplySource: { entryId: entry.id, eventId: entry.timelineEvent.id } } : original;
}

export function reviewCommunityPostAllowed(view, userId, postId) {
  return Boolean(userId && view?.userId === userId && typeof postId === 'string' && view.postIds?.includes(postId));
}
