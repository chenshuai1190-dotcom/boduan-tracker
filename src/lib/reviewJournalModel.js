import {
  normalizeReviewEvaluationScore, normalizeReviewEvaluationTags,
  normalizeReviewTradeReferences, normalizeReviewAccountSnapshot,
} from './reviewEvaluationModel.js';
import { normalizeReviewTimelineReference } from './reviewTimelineReference.js';

export const REVIEW_JOURNAL_IMAGE_BUCKET = 'review-journal-images';
export const REVIEW_JOURNAL_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const REVIEW_JOURNAL_MAX_IMAGES = 4;
export const REVIEW_JOURNAL_MAX_TEXT_LENGTH = 50000;
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const IMAGE_EXTENSIONS = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' });
const LEVELS = ['🟢', '🔺', '📣', '❗'];
const LEVEL_LABELS = ['一般', '重要', '强调', '警告'];
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

export function reviewJournalError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function reviewJournalTable(type) {
  if (type === 'insight') return 'disciplines';
  if (type === 'log') return 'review_logs';
  throw reviewJournalError('REVIEW_INVALID_TYPE', '复盘类型无效，请重新打开记录。');
}

export function isReviewJournalOperationId(value) {
  return typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
}

export function isReviewJournalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function normalizeReviewJournalLevel(value) {
  if (LEVELS.includes(value)) return value;
  const index = LEVEL_LABELS.indexOf(value);
  return index >= 0 ? LEVELS[index] : LEVELS[0];
}

export function normalizeReviewJournalVisibility(value, { strict = false } = {}) {
  if (value == null || value === 'private') return 'private';
  if (value === 'public') return 'public';
  if (strict) throw reviewJournalError('REVIEW_INVALID_VISIBILITY', '请选择公开或仅自己可见。');
  return 'private';
}

export function reviewJournalImagePathBelongsToUser(path, userId) {
  if (typeof userId !== 'string' || !userId || typeof path !== 'string') return false;
  const parts = path.split('/');
  return parts.length === 2 && parts[0] === userId
    && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}\.(?:jpg|jpeg|png|webp)$/i.test(parts[1]);
}

export function validateReviewJournalImageFile(file) {
  const mimeType = typeof file?.type === 'string' ? file.type.toLowerCase() : '';
  if (!Object.hasOwn(IMAGE_EXTENSIONS, mimeType)) {
    throw reviewJournalError('REVIEW_IMAGE_TYPE', '请选择 JPG、PNG 或 WebP 图片。');
  }
  if (!Number.isSafeInteger(file?.size) || file.size <= 0 || file.size > REVIEW_JOURNAL_MAX_IMAGE_BYTES) {
    throw reviewJournalError('REVIEW_IMAGE_SIZE', '请选择 10 MB 以内的有效图片。');
  }
  return { mimeType, extension: IMAGE_EXTENSIONS[mimeType], size: file.size,
    name: typeof file.name === 'string' ? file.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255) : '图片' };
}

function imageMetadata(value, userId) {
  if (!plainObject(value) || !reviewJournalImagePathBelongsToUser(value.path, userId)) return null;
  if (!Object.hasOwn(IMAGE_EXTENSIONS, value.mimeType)) return null;
  const extension = value.path.split('.').at(-1).toLowerCase();
  if (extension !== IMAGE_EXTENSIONS[value.mimeType] && !(extension === 'jpeg' && value.mimeType === 'image/jpeg')) return null;
  if (!Number.isSafeInteger(value.size) || value.size <= 0 || value.size > REVIEW_JOURNAL_MAX_IMAGE_BYTES) return null;
  return { path: value.path, name: typeof value.name === 'string' ? value.name.slice(0, 255) : '图片', mimeType: value.mimeType, size: value.size };
}

function images(value, userId, strict = false) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > REVIEW_JOURNAL_MAX_IMAGES) {
    if (strict) throw reviewJournalError('REVIEW_IMAGES_LIMIT', '每条记录最多添加 4 张图片。');
    return [];
  }
  const result = value.map(image => imageMetadata(image, userId));
  if (strict && result.some(image => !image)) throw reviewJournalError('REVIEW_INVALID_IMAGE', '图片引用无效或不属于当前账户，请重新添加。');
  return result.filter(Boolean);
}

function stocks(value, strict = false) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 20) {
    if (strict) throw reviewJournalError('REVIEW_STOCKS_LIMIT', '每条记录最多关联 20 个股票代码。');
    return [];
  }
  const result = value.map(symbol => typeof symbol === 'string' ? symbol.trim().toUpperCase() : '');
  if (strict && result.some(symbol => !/^[A-Z0-9^][A-Z0-9.^=-]{0,19}$/.test(symbol))) {
    throw reviewJournalError('REVIEW_INVALID_STOCK', '股票代码格式无效。');
  }
  return [...new Set(result.filter(symbol => /^[A-Z0-9^][A-Z0-9.^=-]{0,19}$/.test(symbol)))];
}

function jsonSnapshot(value, strict = false) {
  if (value == null) return null;
  try {
    if (!plainObject(value)) throw new Error('not_object');
    const seen = new Set();
    const clone = (item, depth) => {
      if (depth > 12) throw new Error('too_deep');
      if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
      if (typeof item === 'number' && Number.isFinite(item)) return item;
      if (!Array.isArray(item) && !plainObject(item)) throw new Error('not_json');
      if (seen.has(item)) throw new Error('cycle');
      seen.add(item);
      let result;
      if (Array.isArray(item)) result = item.map(child => clone(child, depth + 1));
      else {
        result = {};
        for (const [key, child] of Object.entries(item)) {
          if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('unsafe_key');
          result[key] = clone(child, depth + 1);
        }
      }
      seen.delete(item);
      return result;
    };
    const result = clone(value, 0);
    if (new TextEncoder().encode(JSON.stringify(result)).length > 100000) throw new Error('too_large');
    return result;
  } catch {
    if (strict) throw reviewJournalError('REVIEW_INVALID_MARKET', '市场快照格式无效或过大，请重新选择。');
    return null;
  }
}

function replies(value, userId, strict = false) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 500) {
    if (strict) throw reviewJournalError('REVIEW_REPLIES_LIMIT', '此记录的评论数量过多，请另建一条记录。');
    return [];
  }
  const ids = new Set();
  return value.flatMap(reply => {
    const date = isReviewJournalDate(reply?.date) ? reply.date
      : typeof reply?.createdAt === 'string' && isReviewJournalDate(reply.createdAt.slice(0, 10)) ? reply.createdAt.slice(0, 10) : '';
    const text = typeof reply?.text === 'string' ? reply.text.trim() : '';
    const id = typeof reply?.id === 'string' ? reply.id.trim() : '';
    if (!plainObject(reply) || !id || id.length > 100 || ids.has(id) || !date || text.length > REVIEW_JOURNAL_MAX_TEXT_LENGTH) {
      if (strict) throw reviewJournalError('REVIEW_INVALID_REPLY', '评论格式无效，请刷新后重试。');
      return [];
    }
    const replyImages = images(reply.images, userId, strict);
    const replyScore = normalizeReviewEvaluationScore(reply.score, { strict });
    const replyTags = normalizeReviewEvaluationTags(reply.tags, { strict });
    const replyTrades = normalizeReviewTradeReferences(reply.trades, { strict });
    const replyAccount = normalizeReviewAccountSnapshot(reply.account, { strict });
    const replyMarket = jsonSnapshot(reply.market, strict);
    const replyStocks = stocks(reply.stocks, strict);
    const replyMood = typeof reply.mood === 'string' ? reply.mood.trim().slice(0, 100) : '';
    if (!text && !replyImages.length && replyScore === null && !replyTags.length && !replyTrades.length
      && !replyAccount && !(replyMarket && Object.keys(replyMarket).length) && !replyStocks.length && !replyMood) {
      if (strict) throw reviewJournalError('REVIEW_EMPTY_REPLY', '请添加文字、评分、标签或附件。');
      return [];
    }
    ids.add(id);
    return [{ id, date, text, mood: replyMood,
      stocks: replyStocks, market: replyMarket, images: replyImages,
      score: replyScore, tags: replyTags, trades: replyTrades, account: replyAccount,
      ...(typeof reply.createdAt === 'string' ? { createdAt: reply.createdAt } : {}) }];
  });
}

export function mapReviewJournalRow(row, type, expectedUserId = row?.user_id) {
  reviewJournalTable(type);
  const data = plainObject(row?.review_data) ? row.review_data : {};
  const createdDate = typeof row?.created_at === 'string' ? row.created_at.slice(0, 10) : '';
  const timelineEvent = type === 'log' ? normalizeReviewTimelineReference(data.timelineEvent) : null;
  return {
    id: row?.id, type,
    visibility: timelineEvent ? 'private' : normalizeReviewJournalVisibility(data.visibility),
    date: type === 'log' ? row?.log_date || '' : isReviewJournalDate(data.date) ? data.date : createdDate,
    text: typeof row?.text === 'string' ? row.text : '',
    mood: type === 'log' ? row?.mood || '' : typeof data.mood === 'string' ? data.mood : '',
    level: normalizeReviewJournalLevel(type === 'insight' ? row?.level : data.level),
    pinned: type === 'insight' ? row?.pinned === true : data.pinned === true,
    sortOrder: row?.sort_order || 0,
    stocks: stocks(data.stocks), market: jsonSnapshot(data.market), images: images(data.images, expectedUserId),
    replies: replies(data.replies, expectedUserId),
    revision: Number.isSafeInteger(row?.review_revision) && row.review_revision >= 0 ? row.review_revision : 0,
    operationId: isReviewJournalOperationId(data.operationId) ? data.operationId : null,
    ...(timelineEvent ? { timelineEvent } : {}),
    createdAt: row?.created_at || null, updatedAt: row?.updated_at || null,
  };
}

export function buildReviewJournalWrite(entry, userId) {
  reviewJournalTable(entry?.type);
  if (typeof userId !== 'string' || !userId) throw reviewJournalError('REVIEW_AUTH_REQUIRED', '请先登录后再保存复盘。');
  if (!isReviewJournalDate(entry.date)) throw reviewJournalError('REVIEW_INVALID_DATE', '请选择有效的记录日期。');
  const text = typeof entry.text === 'string' ? entry.text.trim() : '';
  if (text.length > REVIEW_JOURNAL_MAX_TEXT_LENGTH) throw reviewJournalError('REVIEW_TEXT_LIMIT', '记录内容过长，请拆分后保存。');
  const entryImages = images(entry.images, userId, true);
  const entryStocks = stocks(entry.stocks, true);
  const entryMarket = jsonSnapshot(entry.market, true);
  const timelineEvent = normalizeReviewTimelineReference(entry.timelineEvent, { strict: true });
  const visibility = normalizeReviewJournalVisibility(entry.visibility, { strict: true });
  if (timelineEvent && (entry.type !== 'log' || entry.date !== timelineEvent.date)) {
    throw reviewJournalError('REVIEW_INVALID_TIMELINE', '时间线评价须保留原事件的记录日期。');
  }
  if (!text && !entryImages.length && !entryStocks.length && !(entryMarket && Object.keys(entryMarket).length)) {
    throw reviewJournalError('REVIEW_EMPTY_ENTRY', '请输入内容，或添加图片、股票、市场快照。');
  }
  if (entry.operationId != null && !isReviewJournalOperationId(entry.operationId)) {
    throw reviewJournalError('REVIEW_OPERATION_REQUIRED', '草稿标识无效，请重新打开录入页面。');
  }
  const mood = typeof entry.mood === 'string' ? entry.mood.trim().slice(0, 100) : '';
  const level = normalizeReviewJournalLevel(entry.level);
  const data = { version: 1, date: entry.date, mood, level, pinned: entry.pinned === true,
    visibility: timelineEvent ? 'private' : visibility,
    stocks: entryStocks, market: entryMarket, images: entryImages,
    replies: replies(entry.replies, userId, true) };
  if (entry.operationId) data.operationId = entry.operationId;
  if (timelineEvent) data.timelineEvent = timelineEvent;
  if (new TextEncoder().encode(JSON.stringify(data)).length >= MAX_METADATA_BYTES) {
    throw reviewJournalError('REVIEW_METADATA_LIMIT', '记录附件信息过多，请拆分后保存。');
  }
  const common = { user_id: userId, text, review_data: data };
  return entry.type === 'insight'
    ? { ...common, level, pinned: entry.pinned === true }
    : { ...common, log_date: entry.date, mood };
}
