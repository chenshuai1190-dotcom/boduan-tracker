import {
  REVIEW_JOURNAL_IMAGE_BUCKET,
  buildReviewJournalWrite,
  isReviewJournalOperationId,
  mapReviewJournalRow,
  reviewJournalError,
  reviewJournalImagePathBelongsToUser,
  reviewJournalTable,
  validateReviewJournalImageFile,
} from './reviewJournalModel.js';
import { normalizeReviewTimelineReference, sameReviewTimelineReference, reviewTimelineOperationId } from './reviewTimelineReference.js';

const conflict = () => reviewJournalError('REVIEW_REVISION_CONFLICT', '这条复盘已被更新或删除，请刷新后重试。');
function dbError(error) {
  const detail = `${error?.message || ''} ${error?.details || ''}`;
  if (['42703', '42P01', 'PGRST204'].includes(error?.code)
      || /(?:review_data|review_revision).*(?:column|schema)|(?:column|schema).*(?:review_data|review_revision)/i.test(detail)) {
    return reviewJournalError('REVIEW_SCHEMA_NOT_CONFIGURED', '复盘存储尚未配置，请完成数据库迁移后再保存。');
  }
  return error;
}
function storageError(error) {
  if (/bucket.*(?:not found|does not exist)|not found.*bucket/i.test(error?.message || '')) {
    return reviewJournalError('REVIEW_STORAGE_NOT_CONFIGURED', '复盘图片存储尚未配置，请稍后重试。');
  }
  return error;
}
const validId = id => (typeof id === 'string' && id.trim() !== '') || (Number.isSafeInteger(id) && id >= 0);
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value !== null && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const samePayload = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const replyConflict = () => reviewJournalError('REVIEW_REPLY_CONFLICT', '这条评论已被修改或删除，请刷新确认后再操作。');
function revision(entry) {
  if (!Number.isSafeInteger(entry?.revision) || entry.revision < 0 || entry.revision >= 2147483647) {
    throw reviewJournalError('REVIEW_REVISION_REQUIRED', '记录版本无效，请刷新后重试。');
  }
  return entry.revision;
}

export function createReviewJournalRepository(client, { now = () => new Date().toISOString(), randomUUID = () => globalThis.crypto.randomUUID(), timelineDigest } = {}) {
  async function authenticate(expectedUserId) {
    if (!client?.auth?.getUser || typeof expectedUserId !== 'string' || !expectedUserId.trim()) {
      throw reviewJournalError('REVIEW_AUTH_REQUIRED', '请先登录后再操作复盘。');
    }
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user?.id) throw reviewJournalError('REVIEW_AUTH_REQUIRED', '登录状态已失效，请重新登录。');
    if (data.user.id !== expectedUserId) throw reviewJournalError('REVIEW_ACCOUNT_CHANGED', '账户已切换，请重新打开复盘后操作。');
    return data.user;
  }
  async function assertPath(path, expectedUserId) {
    const user = await authenticate(expectedUserId);
    if (!reviewJournalImagePathBelongsToUser(path, user.id)) {
      throw reviewJournalError('REVIEW_INVALID_IMAGE', '图片引用无效或不属于当前账户。');
    }
    return user;
  }
  async function saveEntry(entry, expectedUserId, replyChange = null) {
    const user = await authenticate(expectedUserId);
    const table = reviewJournalTable(entry?.type);
    let payload = buildReviewJournalWrite(entry, user.id);
    if (replyChange) {
      // Only change replies on the authoritative row read in this operation. Preserve all
      // existing metadata, including fields this client version does not render.
      const metadata = { ...replyChange.source.review_data, replies: replyChange.replies };
      if (new TextEncoder().encode(JSON.stringify(metadata)).length >= 2 * 1024 * 1024) {
        throw reviewJournalError('REVIEW_METADATA_LIMIT', '记录附件信息过多，请拆分后保存。');
      }
      payload = { review_data: metadata };
    }
    const editing = entry.id !== undefined && entry.id !== null && entry.id !== '';
    const savedRow = row => {
      if (row.user_id !== user.id) throw reviewJournalError('REVIEW_ACCOUNT_CHANGED', '账户数据不匹配，请刷新后重试。');
      if (replyChange && String(row.id) !== String(entry.id)) throw conflict();
      if (!Number.isSafeInteger(row.review_revision) || row.review_revision < 0 || !row.review_data) {
        throw reviewJournalError('REVIEW_SCHEMA_NOT_CONFIGURED', '复盘存储尚未配置，请完成数据库迁移后再保存。');
      }
      return mapReviewJournalRow(row, entry.type, user.id);
    };
    const readExistingOperation = async () => {
      const { data, error } = await client.from(table).select('*')
        .eq('user_id', user.id).eq('review_data->>operationId', entry.operationId).maybeSingle();
      if (error) throw dbError(error);
      await authenticate(expectedUserId);
      if (!data) return null;
      const saved = savedRow(data);
      const actual = buildReviewJournalWrite(saved, user.id);
      if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(payload))) {
        throw reviewJournalError('REVIEW_OPERATION_CONFLICT', '这份草稿已保存且内容有变化，请刷新确认后再编辑。');
      }
      return saved;
    };
    let result;
    if (editing) {
      if (!validId(entry.id)) throw reviewJournalError('REVIEW_INVALID_ID', '记录标识无效，请刷新后重试。');
      const expectedRevision = revision(entry);
      result = await client.from(table).update({ ...payload, updated_at: now(), review_revision: expectedRevision + 1 })
        .eq('id', entry.id).eq('user_id', user.id).eq('review_revision', expectedRevision).select('*').maybeSingle();
    } else {
      if (!isReviewJournalOperationId(entry.operationId)) {
        throw reviewJournalError('REVIEW_OPERATION_REQUIRED', '草稿标识无效，请重新打开录入页面。');
      }
      const existing = await readExistingOperation();
      if (existing) return existing;
      result = await client.from(table).insert({ ...payload, review_revision: 0 }).select('*').single();
      if (result.error?.code === '23505') {
        const existingAfterConflict = await readExistingOperation();
        if (existingAfterConflict) return existingAfterConflict;
      }
    }
    if (result.error) throw dbError(result.error);
    await authenticate(expectedUserId);
    if (!result.data) throw conflict();
    return savedRow(result.data);
  }
  async function save(entry, expectedUserId) {
    return saveEntry(entry, expectedUserId);
  }
  async function changeReplies(entry, expectedUserId, transform) {
    const table = reviewJournalTable(entry?.type);
    if (!validId(entry?.id)) throw reviewJournalError('REVIEW_INVALID_ID', '记录标识无效，请刷新后重试。');
    revision(entry);
    // Initial attempt plus at most two retries for a competing revision write.
    for (let attempt = 0; attempt <= 2; attempt++) {
      const user = await authenticate(expectedUserId);
      const { data: row, error } = await client.from(table).select('*')
        .eq('user_id', user.id).eq('id', entry.id).maybeSingle();
      if (error) throw dbError(error);
      await authenticate(expectedUserId);
      if (!row || String(row.id) !== String(entry.id)) throw conflict();
      if (row.user_id !== user.id) throw reviewJournalError('REVIEW_ACCOUNT_CHANGED', '账户数据不匹配，请刷新后重试。');
      if (!Number.isSafeInteger(row.review_revision) || row.review_revision < 0
          || !row.review_data || typeof row.review_data !== 'object' || Array.isArray(row.review_data)) {
        throw reviewJournalError('REVIEW_SCHEMA_NOT_CONFIGURED', '复盘存储尚未配置，请完成数据库迁移后再保存。');
      }
      const latest = mapReviewJournalRow(row, entry.type, user.id);
      revision(latest);
      if (row.review_data.timelineEvent != null && row.review_data.version !== 1) {
        throw reviewJournalError('REVIEW_SCHEMA_NOT_CONFIGURED', '时间线评价格式尚不受支持，请刷新后重试。');
      }
      if (entry.timelineEvent && !sameReviewTimelineReference(entry.timelineEvent, row.review_data.timelineEvent)) {
        throw reviewJournalError('REVIEW_TIMELINE_CONFLICT', '时间线事件引用已变化，请重新打开记录。');
      }
      // Mapping is tolerant for display; validate raw stored attachments before
      // preserving them so a malformed or foreign private image is never copied.
      const validated = buildReviewJournalWrite({ ...latest,
        images: row.review_data.images, stocks: row.review_data.stocks,
        market: row.review_data.market, replies: row.review_data.replies,
        ...(row.review_data.timelineEvent != null ? { timelineEvent: row.review_data.timelineEvent } : {}) }, user.id);
      const nextReplies = transform({
        rawReplies: row.review_data.replies || [], replies: validated.review_data.replies,
        normalize: reply => buildReviewJournalWrite({ ...latest, replies: [reply] }, user.id).review_data.replies[0],
      });
      if (nextReplies === null) return latest;
      try {
        return await saveEntry({ ...latest, replies: nextReplies }, expectedUserId, { source: row, replies: nextReplies });
      } catch (failure) {
        if (failure?.code !== 'REVIEW_REVISION_CONFLICT' || attempt === 2) throw failure;
      }
    }
  }
  async function appendReply(entry, reply, expectedUserId) {
    return changeReplies(entry, expectedUserId, ({ rawReplies, replies, normalize }) => {
      const normalized = normalize(reply);
      const existing = replies.find(item => item.id === normalized.id);
      if (existing) {
        if (!samePayload(existing, normalized)) throw replyConflict();
        return null;
      }
      return [...rawReplies, normalized];
    });
  }
  async function appendTimelineReply(entry, reply, expectedUserId) {
    const user = await authenticate(expectedUserId);
    const reference = normalizeReviewTimelineReference(entry?.timelineEvent, { strict: true });
    if (entry?.type !== 'log' || !reference) {
      throw reviewJournalError('REVIEW_INVALID_TIMELINE', '请选择有效的时间线事件后再评价。');
    }
    const operationId = await reviewTimelineOperationId(user.id, reference.id, { digest: timelineDigest });
    const draft = { type: 'log', date: reference.date, text: reference.title,
      timelineEvent: reference, operationId, mood: '', level: '🟢', pinned: false,
      stocks: [], market: null, images: [], replies: [reply], revision: 0 };
    const payload = buildReviewJournalWrite(draft, user.id);
    const normalizedReply = payload.review_data.replies[0];
    const mapTimelineRow = row => {
      if (row?.user_id !== user.id) throw reviewJournalError('REVIEW_ACCOUNT_CHANGED', '账户数据不匹配，请重新打开记录。');
      if (!validId(row.id) || !Number.isSafeInteger(row.review_revision) || row.review_revision < 0
        || !row.review_data || typeof row.review_data !== 'object' || Array.isArray(row.review_data)
        || row.review_data.version !== 1) {
        throw reviewJournalError('REVIEW_SCHEMA_NOT_CONFIGURED', '复盘存储尚未配置，请完成数据库迁移后再保存。');
      }
      const storedReference = normalizeReviewTimelineReference(row.review_data.timelineEvent, { strict: true });
      if (row.review_data.operationId !== operationId || row.log_date !== reference.date || row.review_data.date !== reference.date
          || !sameReviewTimelineReference(storedReference, reference)) {
        throw reviewJournalError('REVIEW_TIMELINE_CONFLICT', '时间线事件引用不匹配，请重新打开记录。');
      }
      const mapped = mapReviewJournalRow(row, 'log', user.id);
      revision(mapped);
      buildReviewJournalWrite({ ...mapped, images: row.review_data.images, stocks: row.review_data.stocks,
        market: row.review_data.market, replies: row.review_data.replies, timelineEvent: row.review_data.timelineEvent }, user.id);
      return mapped;
    };
    const readExisting = async () => {
      await authenticate(expectedUserId);
      const { data, error } = await client.from('review_logs').select('*')
        .eq('user_id', user.id).eq('review_data->>operationId', operationId).maybeSingle();
      if (error) throw dbError(error);
      await authenticate(expectedUserId);
      return data ? mapTimelineRow(data) : null;
    };
    const existing = await readExisting();
    if (existing) return appendReply(existing, normalizedReply, expectedUserId);
    await authenticate(expectedUserId);
    let result;
    try {
      // The container and its first evaluation are created in one atomic row.
      result = await client.from('review_logs').insert({ ...payload, review_revision: 0 }).select('*').single();
    } catch (failure) {
      const recovered = await readExisting();
      if (recovered) return appendReply(recovered, normalizedReply, expectedUserId);
      throw dbError(failure);
    }
    if (result.error || !result.data) {
      // A competing insert or lost response can refer to a successfully saved
      // container. Rebase the reply instead of replacing another evaluation.
      const recovered = await readExisting();
      if (recovered) return appendReply(recovered, normalizedReply, expectedUserId);
      if (result.error) throw dbError(result.error);
      throw conflict();
    }
    await authenticate(expectedUserId);
    const saved = mapTimelineRow(result.data);
    const storedReply = saved.replies.find(item => item.id === normalizedReply.id);
    if (!storedReply || !samePayload(storedReply, normalizedReply)) throw replyConflict();
    return saved;
  }
  async function updateReply(entry, originalReply, replacement, expectedUserId) {
    return changeReplies(entry, expectedUserId, ({ rawReplies, replies, normalize }) => {
      const original = normalize(originalReply);
      const index = replies.findIndex(item => item.id === original.id);
      if (index < 0) throw replyConflict();
      const current = replies[index];
      const next = normalize({ ...replacement, id: original.id, date: original.date, createdAt: original.createdAt });
      // A lost response may be retried with the old original. Recover success
      // before comparing it, but never overwrite a different concurrent edit.
      if (samePayload(current, next)) return null;
      if (!samePayload(current, original)) throw replyConflict();
      const updated = { ...rawReplies[index] };
      for (const [key, value] of Object.entries(next)) {
        // Preserve unknown nested snapshot fields when the visible field did
        // not change; only intentional edits replace their normalized value.
        if (!samePayload(current[key], value)) updated[key] = value;
      }
      return rawReplies.map((item, replyIndex) => replyIndex === index ? updated : item);
    });
  }
  async function removeReply(entry, originalReply, expectedUserId) {
    return changeReplies(entry, expectedUserId, ({ rawReplies, replies, normalize }) => {
      const original = normalize(originalReply);
      const index = replies.findIndex(item => item.id === original.id);
      if (index < 0) return null;
      if (!samePayload(replies[index], original)) throw replyConflict();
      // Only unlink this reply. Private images may still be referenced by
      // other records, so reply edits/deletions never delete storage objects.
      return rawReplies.filter((_, replyIndex) => replyIndex !== index);
    });
  }
  async function remove(entry, expectedUserId) {
    const user = await authenticate(expectedUserId);
    const table = reviewJournalTable(entry?.type);
    if (!validId(entry?.id)) throw reviewJournalError('REVIEW_INVALID_ID', '记录标识无效，请刷新后重试。');
    const expectedRevision = revision(entry);
    const { data, error } = await client.from(table).delete()
      .eq('id', entry.id).eq('user_id', user.id).eq('review_revision', expectedRevision).select('id').maybeSingle();
    if (error) throw dbError(error);
    await authenticate(expectedUserId);
    if (!data) throw conflict();
  }
  async function uploadImage(file, expectedUserId) {
    const user = await authenticate(expectedUserId);
    const metadata = validateReviewJournalImageFile(file);
    const path = `${user.id}/${randomUUID()}.${metadata.extension}`;
    if (!reviewJournalImagePathBelongsToUser(path, user.id)) throw reviewJournalError('REVIEW_IMAGE_ID', '无法创建图片标识，请重试。');
    if (!client.storage?.from) throw reviewJournalError('REVIEW_STORAGE_NOT_CONFIGURED', '复盘图片存储尚未配置，请稍后重试。');
    const { error } = await client.storage.from(REVIEW_JOURNAL_IMAGE_BUCKET).upload(path, file, {
      contentType: metadata.mimeType, cacheControl: '3600', upsert: false,
    });
    if (error) throw storageError(error);
    await authenticate(expectedUserId);
    return { path, name: metadata.name, mimeType: metadata.mimeType, size: metadata.size };
  }
  async function resolveImage(path, expectedUserId) {
    await assertPath(path, expectedUserId);
    if (!client.storage?.from) throw reviewJournalError('REVIEW_STORAGE_NOT_CONFIGURED', '复盘图片存储尚未配置，请稍后重试。');
    const { data, error } = await client.storage.from(REVIEW_JOURNAL_IMAGE_BUCKET).createSignedUrl(path, 600);
    if (error) throw storageError(error);
    await authenticate(expectedUserId);
    if (!data?.signedUrl) throw reviewJournalError('REVIEW_IMAGE_UNAVAILABLE', '暂时无法读取图片，请重试。');
    return data.signedUrl;
  }
  async function removeImage(path, expectedUserId) {
    await assertPath(path, expectedUserId);
    if (!client.storage?.from) throw reviewJournalError('REVIEW_STORAGE_NOT_CONFIGURED', '复盘图片存储尚未配置，请稍后重试。');
    const { error } = await client.storage.from(REVIEW_JOURNAL_IMAGE_BUCKET).remove([path]);
    if (error) throw storageError(error);
    await authenticate(expectedUserId);
  }
  return { save, appendReply, appendTimelineReply, updateReply, removeReply, remove, uploadImage, resolveImage, removeImage };
}
