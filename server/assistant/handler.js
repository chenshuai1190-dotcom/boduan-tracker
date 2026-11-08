import crypto from 'node:crypto';
import { authenticateAccessToken, configuredOrigins } from '../quote/auth.js';
import { isInviteAdmin } from '../inviteCodes.js';
import { AssistantError, assistantFailure } from './errors.js';
import { assistantProviderConfiguration, ASSISTANT_TIMEOUT_MS } from './provider.js';
import { createAssistantRepository } from './repository.js';
import { runAssistantJob } from './runtime.js';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const KINDS = new Set(['reply', 'daily-review', 'followup', 'weekly-digest', 'milestone', 'chat']);
const MAX_BODY_BYTES = 24_000;
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const normalId = value => typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
const first = value => Array.isArray(value) ? value[0] : value;

function originAllowed(req) {
  const origin = req.headers?.origin;
  if (typeof origin !== 'string') return false;
  if (configuredOrigins(req).has(origin)) return true;
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    try { const url = new URL(origin); return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname); } catch { return false; }
  }
  return false;
}

function headers(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (originAllowed(req)) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
}

async function readBody(req) {
  if (Number(req.headers?.['content-length']) > MAX_BODY_BYTES) throw new AssistantError('ASSISTANT_REQUEST_TOO_LARGE', '输入内容过长，请缩短后重试。', 413);
  let value = req.body;
  if (value === undefined) {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk); size += buffer.length;
      if (size > MAX_BODY_BYTES) throw new AssistantError('ASSISTANT_REQUEST_TOO_LARGE', '输入内容过长，请缩短后重试。', 413);
      chunks.push(buffer);
    }
    value = Buffer.concat(chunks).toString('utf8');
  }
  try {
    if (Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8') > MAX_BODY_BYTES) throw new Error();
    value = typeof value === 'string' ? JSON.parse(value) : value;
  } catch { throw new AssistantError('ASSISTANT_INVALID_REQUEST', '请求格式无效。', 400); }
  if (!isObject(value)) throw new AssistantError('ASSISTANT_INVALID_REQUEST', '请求格式无效。', 400);
  return value;
}

function requireId(value) {
  const id = normalId(value);
  if (!id) throw new AssistantError('ASSISTANT_INVALID_ID', '任务标识无效，请重新操作。', 422);
  return id;
}

function requireRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483646) throw new AssistantError('ASSISTANT_INVALID_REVISION', '任务已变化，请刷新后重试。', 422);
  return value;
}

export function buildAssistantJobInput(body, scheduled = false) {
  const kind = body.kind === 'daily' ? 'daily-review' : body.kind === 'weekly' ? 'weekly-digest' : body.kind;
  if (!KINDS.has(kind)) throw new AssistantError('ASSISTANT_INVALID_KIND', '请选择有效的小助手功能。', 422);
  const prompt = body.prompt == null && !['chat', 'followup'].includes(kind) ? '' : body.prompt;
  if (typeof prompt !== 'string' || prompt.length > 4000 || ['chat', 'followup'].includes(kind) && !prompt.trim()) throw new AssistantError('ASSISTANT_INVALID_PROMPT', '请填写问题，并控制在 4000 字以内。', 422);
  const id = requireId(body.requestId || body.id);
  const payload = { id, kind, prompt: prompt.trim(), sessionId: normalId(body.sessionId) || id };
  for (const key of ['postId', 'date', 'rangeStart', 'rangeEnd', 'dueAt']) {
    if (body[key] != null && body[key] !== '') {
      if (typeof body[key] !== 'string' || body[key].length > 150) throw new AssistantError('ASSISTANT_INVALID_INPUT', '所选来源或时间无效。', 422);
      payload[key] = body[key];
    }
  }
  if (body.replyTo != null) {
    if (!isObject(body.replyTo) || !['author', 'community'].includes(body.replyTo.kind)
      || typeof body.replyTo.id !== 'string' || !body.replyTo.id || body.replyTo.id.length > 100) throw new AssistantError('ASSISTANT_INVALID_REPLY', '回复目标无效，请重新打开评论。', 422);
    payload.replyTo = { kind: body.replyTo.kind, id: body.replyTo.id };
  } else if (body.commentId != null) payload.replyTo = { kind: 'community', id: requireId(body.commentId) };
  payload.autoPublish = kind === 'reply' && body.autoPublish === true || kind === 'followup' && scheduled;
  payload.shareConfirmed = kind === 'milestone' && body.shareConfirmed === true;
  if (body.recurrence != null && body.recurrence !== '') {
    if (!scheduled || !['daily', 'weekly'].includes(body.recurrence)
      || body.recurrence === 'daily' && kind !== 'daily-review'
      || body.recurrence === 'weekly' && kind !== 'weekly-digest') throw new AssistantError('ASSISTANT_INVALID_SCHEDULE', '预约类型无效。', 422);
    payload.recurrence = body.recurrence;
  }
  if (scheduled && (!payload.dueAt || !['followup', 'daily-review', 'weekly-digest'].includes(kind))) throw new AssistantError('ASSISTANT_INVALID_SCHEDULE', '请选择有效的预约时间。', 422);
  if (!scheduled && payload.dueAt) throw new AssistantError('ASSISTANT_INVALID_SCHEDULE', '预约任务请使用预约入口。', 422);
  return payload;
}

function cronAuthorized(req, env) {
  const secret = String(env.CRON_SECRET || '');
  const actual = String(req.headers?.authorization || '');
  const expected = `Bearer ${secret}`;
  return Boolean(secret) && actual.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function createAssistantHandler({ env = process.env, authenticate = authenticateAccessToken,
  repositoryFactory = createAssistantRepository, runJob = runAssistantJob, timeoutMs = ASSISTANT_TIMEOUT_MS } = {}) {
  return async function handleAssistant(req, res) {
    headers(req, res);
    const deadlineAt = Date.now() + Math.min(timeoutMs, ASSISTANT_TIMEOUT_MS);
    const signal = AbortSignal.timeout(Math.min(timeoutMs, ASSISTANT_TIMEOUT_MS));
    const configuration = assistantProviderConfiguration(env);
    const enabled = env.QUOTE_ASSISTANT_ENABLED !== 'false';
    const isCron = first(req.query?.operation) === 'assistant-cron';
    try {
      if (isCron) {
        if (req.method !== 'GET') throw new AssistantError('METHOD_NOT_ALLOWED', 'Method Not Allowed', 405);
        if (!cronAuthorized(req, env)) throw new AssistantError('ASSISTANT_UNAUTHORIZED', '未授权。', 401);
        // Missing configuration is a deferred queue, never a failed job or a
        // request to fabricate text. Repeated cron invocations are harmless.
        if (!enabled || !configuration.configured) return res.status(200).json({ success: true, data: { deferred: true, reason: 'not_configured', processed: 0 } });
        const repository = repositoryFactory({ env, signal });
        const due = await repository.admin('due', { limit: 1 });
        const job = due?.jobs?.[0];
        if (!job) return res.status(200).json({ success: true, data: { processed: 0 } });
        const result = await runJob({ id: job.id, repository, signal, env, deadlineAt });
        return res.status(200).json({ success: true, data: { processed: 1, status: result?.status, id: result?.id } });
      }
      if (req.method === 'OPTIONS') {
        if (!originAllowed(req)) throw new AssistantError('ASSISTANT_ORIGIN_FORBIDDEN', '请求来源不可用。', 403);
        return res.status(204).end();
      }
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); throw new AssistantError('METHOD_NOT_ALLOWED', 'Method Not Allowed', 405); }
      if (!originAllowed(req)) throw new AssistantError('ASSISTANT_ORIGIN_FORBIDDEN', '请求来源不可用。', 403);
      if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) throw new AssistantError('ASSISTANT_INVALID_REQUEST', '请求格式无效。', 415);
      const token = String(req.headers?.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
      if (!token) throw new AssistantError('ASSISTANT_UNAUTHORIZED', '请先登录后使用 Quote。', 401);
      const auth = await authenticate(token);
      if (!auth?.ok || !auth?.user?.id) throw new AssistantError('ASSISTANT_UNAUTHORIZED', '登录已过期，请重新登录。', auth?.status || 401);
      const body = await readBody(req);
      if (normalId(body.expectedUserId) !== auth.user.id.toLowerCase()) throw new AssistantError('ASSISTANT_ACCOUNT_CHANGED', '账号已切换，请重新打开小助手。', 403);
      const repository = repositoryFactory({ env, token, userId: auth.user.id, signal });
      const canConfigure = isInviteAdmin(auth.user);
      const action = body.action;
      let data;
      if (action === 'state') {
        data = await repository.user('state');
        data = { ...data, enabled, configured: configuration.configured && Boolean(data?.assistant?.authorId),
          providerConfigured: configuration.configured, provider: 'OpenAI', model: configuration.model, canConfigure,
          capabilities: Object.fromEntries([...KINDS].map(kind => [kind, true])) };
      } else if (action === 'configure') {
        if (!canConfigure) throw new AssistantError('ASSISTANT_FORBIDDEN', '只有管理员可以初始化 Quote 身份。', 403);
        data = await repository.initialize();
      } else if (action === 'run' || action === 'schedule') {
        if (!enabled || !configuration.configured) throw new AssistantError('ASSISTANT_NOT_CONFIGURED', 'Quote 的 AI 服务尚未配置完成。', 503);
        const input = buildAssistantJobInput(body, action === 'schedule');
        const job = await repository.user('create', input);
        data = action === 'schedule' ? job : await runJob({ id: job.id, repository, signal, env, deadlineAt });
      } else if (action === 'retry') {
        if (!enabled || !configuration.configured) throw new AssistantError('ASSISTANT_NOT_CONFIGURED', 'Quote 的 AI 服务尚未配置完成。', 503);
        const job = await repository.user('retry', { id: requireId(body.id || body.jobId), revision: requireRevision(body.revision) });
        data = await runJob({ id: job.id, repository, signal, env, deadlineAt });
      } else if (action === 'publish') {
        data = await repository.admin('publish', { id: requireId(body.id || body.jobId), ownerId: auth.user.id, revision: requireRevision(body.revision) });
        if (data?.status !== 'published') throw new AssistantError('ASSISTANT_SOURCE_CHANGED', '来源已改变，本次草稿未发布，请刷新。', 409);
      } else if (action === 'cancel' || action === 'cancel-subscription') {
        data = await repository.user(action, { id: requireId(body.id || body.jobId), revision: requireRevision(body.revision) });
      } else if (action === 'memory-save') {
        if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 1000) throw new AssistantError('ASSISTANT_INVALID_MEMORY', '记忆需为 1 至 1000 字。', 422);
        data = await repository.user('save-memory', { id: requireId(body.id), text: body.text.trim(), revision: body.revision === 0 ? 0 : requireRevision(body.revision) });
      } else if (action === 'memory-delete') {
        data = await repository.user('delete-memory', { id: requireId(body.id), revision: requireRevision(body.revision) });
      } else if (action === 'memory-preferences') {
        if (typeof body.enabled !== 'boolean') throw new AssistantError('ASSISTANT_INVALID_MEMORY', '记忆设置无效。', 422);
        data = await repository.user('memory-preferences', { enabled: body.enabled });
      } else throw new AssistantError('ASSISTANT_INVALID_ACTION', '不支持此操作。', 400);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      const failure = assistantFailure(error);
      return res.status(failure.status).json({ success: false, error: failure.message, code: failure.code });
    }
  };
}

export default createAssistantHandler();
