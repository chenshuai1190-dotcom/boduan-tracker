import { hasQuoteMention } from './quoteAssistantModel.js';

const sourceRequestId = value => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(value || '')) ? String(value) : crypto.randomUUID();

/** AI work begins only after a confirmed save, and never changes the result of
 * the user's save. The server re-reads the exact source and enforces permission. */
export function createQuoteAssistantSaveBridge(db, { userId, request }) {
  const start = payload => { try { Promise.resolve(request(payload)).catch(() => {}); } catch { /* The original comment is already saved. */ } };
  return {
    saveReviewJournalEntry: async (entry, expectedUserId) => {
      const saved = await db.saveReviewJournalEntry(entry, expectedUserId);
      if (expectedUserId === userId && !(entry.revision > 0) && saved.visibility === 'public' && hasQuoteMention(saved.text)) {
        start({ kind: 'reply', requestId: sourceRequestId(saved.id), postId: `${saved.type}:${saved.id}`, autoPublish: true });
      }
      return saved;
    },
    appendReviewJournalReply: async (entry, reply, expectedUserId) => {
      const saved = await db.appendReviewJournalReply(entry, reply, expectedUserId);
      const confirmed = saved?.replies?.find(item => item.id === reply.id);
      if (expectedUserId === userId && saved.visibility === 'public' && confirmed && hasQuoteMention(confirmed.text)) {
        start({ kind: 'reply', requestId: confirmed.id, postId: `${saved.type}:${saved.id}`, replyTo: { kind: 'author', id: confirmed.id }, autoPublish: true });
      }
      return saved;
    },
    appendCommunityReply: async (entry, reply, expectedUserId) => {
      const submitted = entry.communityReplyTo ? { ...reply, replyTo: { kind: entry.communityReplyTo.kind, id: entry.communityReplyTo.id } } : reply;
      const saved = await db.saveReviewCommunityEvaluation(entry.communityPostId, submitted, expectedUserId);
      if (expectedUserId === userId && entry.visibility === 'public' && saved?.authorId === userId && saved.id === reply.id
        && (hasQuoteMention(saved.text) || entry.communityReplyTo?.isAssistant === true)) {
        start({ kind: 'reply', requestId: saved.id, postId: saved.postId, replyTo: { kind: 'community', id: saved.id }, autoPublish: true });
      }
      return saved;
    },
  };
}
