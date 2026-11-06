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
function revision(entry) {
  if (!Number.isSafeInteger(entry?.revision) || entry.revision < 0 || entry.revision >= 2147483647) {
    throw reviewJournalError('REVIEW_REVISION_REQUIRED', '记录版本无效，请刷新后重试。');
  }
  return entry.revision;
}

export function createReviewJournalRepository(client, { now = () => new Date().toISOString(), randomUUID = () => globalThis.crypto.randomUUID() } = {}) {
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
  async function save(entry, expectedUserId) {
    const user = await authenticate(expectedUserId);
    const table = reviewJournalTable(entry?.type);
    const payload = buildReviewJournalWrite(entry, user.id);
    const editing = entry.id !== undefined && entry.id !== null && entry.id !== '';
    const savedRow = row => {
      if (row.user_id !== user.id) throw reviewJournalError('REVIEW_ACCOUNT_CHANGED', '账户数据不匹配，请刷新后重试。');
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
  return { save, remove, uploadImage, resolveImage, removeImage };
}
