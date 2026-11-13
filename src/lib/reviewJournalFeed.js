import { mapReviewJournalRow, isReviewJournalOperationId, isReviewJournalDate } from './reviewJournalModel.js';
import { normalizeReviewMarketSnapshot } from './reviewMarketSnapshot.js';
import { normalizeStrictUserStockSymbol } from './symbols.js';
import { normalizeReviewTimelineReference } from './reviewTimelineReference.js';

// Presentation only. The two existing tables remain the source of truth.
export function reviewJournalFeed(insights = [], logs = [], filter = 'all', query = '', alwaysPinnedId = null) {
  const term = String(query).trim().toLocaleLowerCase();
  const pinRank = row => String(row.id) === alwaysPinnedId ? 2 : Number(Boolean(row.pinned));
  return [...insights.map(row => ({ ...row, type: 'insight' })), ...logs.map(row => ({ ...row, type: 'log' }))]
    .filter(row => !normalizeReviewTimelineReference(row.timelineEvent))
    .filter(row => (filter === 'all' || row.type === filter) && (!term || `${row.text || ''} ${(row.stocks || []).join(' ')} ${row.date || ''} ${(row.replies || []).map(reply => reply.text).join(' ')}`.toLocaleLowerCase().includes(term)))
    .sort((a, b) => (filter === 'all' ? 0 : pinRank(b) - pinRank(a))
      || String(b.date || '').localeCompare(String(a.date || ''))
      || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      || String(b.id).localeCompare(String(a.id)));
}

export function reviewDraftKey(userId) {
  return userId ? `quote:review-journal:draft:v1:${encodeURIComponent(userId)}` : null;
}

export function localReviewDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function emptyReviewEntry(type = 'log') {
  return { operationId: globalThis.crypto.randomUUID(), type, date: localReviewDate(), visibility: 'public', text: '', mood: '', level: '🟢', pinned: false, stocks: [], market: null, images: [], replies: [], revision: 0 };
}

export function restoreReviewDraft(value, userId, fallbackType = 'log') {
  const base = emptyReviewEntry(fallbackType);
  if (!value || typeof value !== 'object' || !['insight','log'].includes(value.type)) return base;
  const date = isReviewJournalDate(value.date) ? value.date : base.date;
  const normalized = mapReviewJournalRow({ user_id:userId, text:value.text, log_date:date,
    level:value.level, pinned:value.pinned, review_data:{...value,date,replies:[]}},value.type,userId);
  // Restore a draft's own selection. In particular, legacy drafts without a
  // visibility field remain private instead of inheriting the new-post default.
  // Ordinary post drafts must not become hidden timeline evaluation containers.
  const { timelineEvent: _timelineEvent, ...post } = normalized;
  return {...post,id:undefined,date,revision:0,replies:[],market:normalizeReviewMarketSnapshot(normalized.market),
    excludedStocks: [...new Set((Array.isArray(value.excludedStocks) ? value.excludedStocks : []).filter(symbol => typeof symbol === 'string').map(normalizeStrictUserStockSymbol).filter(Boolean))].slice(0,100),
    operationId:isReviewJournalOperationId(value.operationId)?value.operationId:base.operationId};
}
