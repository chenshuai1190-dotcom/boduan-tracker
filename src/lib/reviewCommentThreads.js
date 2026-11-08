// Presentation keys keep legacy author evaluations separate from community UUIDs.
export function reviewCommentKey(comment) {
  return `${comment?.kind || comment?.source || 'community'}:${comment?.id || ''}`;
}

export function compareReviewCommentTime(left, right) {
  const a = left.sortCreatedAt || left.createdAt || `${left.date || '0001-01-01'}T00:00:00Z`;
  const b = right.sortCreatedAt || right.createdAt || `${right.date || '0001-01-01'}T00:00:00Z`;
  const seconds = Math.floor(Date.parse(a) / 1000) - Math.floor(Date.parse(b) / 1000);
  if (Number.isFinite(seconds) && seconds) return seconds;
  const af = a.match(/\.(\d+)/)?.[1] || '', bf = b.match(/\.(\d+)/)?.[1] || '';
  const precision = Math.max(af.length, bf.length), fraction = af.padEnd(precision, '0').localeCompare(bf.padEnd(precision, '0'));
  return fraction || reviewCommentKey(left).localeCompare(reviewCommentKey(right));
}

export function mergeReviewCommentReplies(current = [], incoming = []) {
  return [...new Map([...current, ...incoming].map(reply => [reviewCommentKey(reply), reply])).values()].sort(compareReviewCommentTime);
}

export function mergeReviewCommentThreads(current = [], incoming = []) {
  return [...new Map([...current, ...incoming].map(thread => [reviewCommentKey(thread.root), thread])).values()]
    .sort((left, right) => compareReviewCommentTime(right.root, left.root));
}

export function reviewCommentTarget(reply) {
  return { kind: reply.kind || reply.source || 'community', id: reply.id };
}

export function reviewCommentAccessRevoked(error) {
  return ['REVIEW_PUBLIC_NOT_FOUND', 'REVIEW_PUBLIC_FORBIDDEN', 'REVIEW_AUTH_REQUIRED', 'REVIEW_ACCOUNT_CHANGED',
    'REVIEW_NOTIFICATION_NOT_FOUND', 'REVIEW_NOTIFICATION_FORBIDDEN', 'REVIEW_INTERACTION_NOT_FOUND', 'REVIEW_INTERACTION_FORBIDDEN'].includes(error?.code);
}
