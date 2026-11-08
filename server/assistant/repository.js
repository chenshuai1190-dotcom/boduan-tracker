import crypto from 'node:crypto';
import { AssistantError } from './errors.js';

function databaseFailure(body, status) {
  const code = body?.code;
  if (['42883', '42P01', '42703', 'PGRST202', '55000'].includes(code)) return new AssistantError('ASSISTANT_DATABASE_NOT_CONFIGURED', 'Quote 小助手的数据服务尚未配置。', 503);
  if (code === '42501' || status === 401 || status === 403) return new AssistantError('ASSISTANT_FORBIDDEN', '当前账号无法执行此操作，或来源已不可见。', 403);
  if (code === '40001' || code === '23505') return new AssistantError('ASSISTANT_CONFLICT', '内容已更新，请刷新后重试。', 409);
  if (code === 'P0002' || status === 404) return new AssistantError('ASSISTANT_NOT_FOUND', '任务或来源已不可用，请刷新。', 404);
  if (code === '22023') return new AssistantError('ASSISTANT_INVALID_INPUT', '请检查输入、所选来源及预约时间。', 422);
  if (code === '54000' || code === '53300' || code === 'P0001') return new AssistantError('ASSISTANT_LIMIT', '当前操作达到限制，或任务状态已变化，请稍后重试。', 429);
  return new AssistantError('ASSISTANT_DATABASE_UNAVAILABLE', '小助手数据服务暂不可用，请稍后重试。', status >= 500 ? 503 : 502);
}

export function assistantIdentityId(base) {
  const bytes = crypto.createHash('sha256').update(`quote-assistant:v1:${base}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createAssistantRepository({ env = process.env, fetchImpl = globalThis.fetch, token, userId, signal } = {}) {
  const base = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  async function request(path, payload, admin = false, method = 'POST', requestSignal = signal) {
    if (!base || !(admin ? service : anon && token)) throw new AssistantError('ASSISTANT_DATABASE_NOT_CONFIGURED', 'Quote 小助手的数据服务尚未配置。', 503);
    const res = await fetchImpl(`${base}${path}`, { method, signal: requestSignal,
      headers: { apikey: admin ? service : anon, Authorization: `Bearer ${admin ? service : token}`, 'Content-Type': 'application/json' },
      ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(payload) }) });
    let body;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok) throw databaseFailure(body, res.status);
    return body;
  }
  const user = (action, payload = {}) => request('/rest/v1/rpc/quote_assistant_user', {
    p_action: action, p_payload: payload, p_expected_user_id: userId,
  });
  const admin = (action, payload = {}, options = {}) => request('/rest/v1/rpc/quote_assistant_service', {
    p_action: action, p_payload: payload,
  }, true, 'POST', options.signal || signal);
  async function initialize() {
    const state = await user('state');
    if (state?.assistant?.authorId) return state.assistant;
    // A dedicated, banned account has no human login and never borrows the
    // requesting administrator's identity. No credential is persisted by us.
    const authorId = assistantIdentityId(base);
    const path = `/auth/v1/admin/users/${authorId}`;
    let account;
    try { account = await request(path, null, true, 'GET'); }
    catch (error) { if (error.code !== 'ASSISTANT_NOT_FOUND') throw error; }
    if (!account) {
      try {
        account = await request('/auth/v1/admin/users', {
          id: authorId, email: 'quote-assistant@system.invalid', password: crypto.randomBytes(48).toString('base64url'),
          email_confirm: true, ban_duration: '876000h',
          app_metadata: { quote_assistant: true }, user_metadata: { nickname: 'Quote' },
        }, true);
      } catch (error) {
        // Stable project-specific ID makes a lost create response / concurrent
        // initializer recoverable without enumerating any users or emails.
        try { account = await request(path, null, true, 'GET'); } catch { throw error; }
      }
    }
    account = account?.user || account;
    if (account?.id !== authorId || account?.app_metadata?.quote_assistant !== true
      || account?.email !== 'quote-assistant@system.invalid') {
      throw new AssistantError('ASSISTANT_INITIALIZATION_FAILED', 'Quote 身份初始化失败，请联系管理员。', 503);
    }
    if (!(Date.parse(account.banned_until) > Date.now())) {
      await request(path, { ban_duration: '876000h' }, true, 'PUT');
    }
    return admin('configure', { authorId });
  }
  return { user, admin, initialize };
}
