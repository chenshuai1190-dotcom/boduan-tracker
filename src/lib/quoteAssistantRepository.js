import { createReviewSessionGuard } from './reviewSessionGuard.js';
import { normalizeQuoteAssistantState, quoteAssistantError } from './quoteAssistantModel.js';
import { normalizeQuoteAccessState } from './quoteAssistantAccess.js';

/** Credentials remain server-side. This client sends the current user's JWT,
 * verifies the account generation before delivery, and never persists prompts. */
export function createQuoteAssistantRepository(client, { fetchImpl = (...args) => fetch(...args), timeoutMs = 85_000 } = {}) {
  const guard = createReviewSessionGuard(client);
  async function request(action, payload, expectedUserId) {
    const ticket = await guard.begin(expectedUserId);
    const result = await client.auth.getSession();
    guard.assertCurrent(ticket);
    if (result?.error || result?.data?.session?.user?.id !== expectedUserId || !result.data.session.access_token) {
      throw quoteAssistantError('登录状态已变化，请重新打开小助手。', 'ASSISTANT_ACCOUNT_CHANGED');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl('/api/quote-assistant', { method: 'POST', cache: 'no-store', signal: controller.signal,
        headers: { Authorization: `Bearer ${result.data.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, action, expectedUserId }) });
      const body = await response.json().catch(() => null);
      await guard.verify(ticket);
      if (!response.ok || body?.success !== true) throw quoteAssistantError(
        typeof body?.error === 'string' ? body.error : '小助手暂未完成，请稍后重试。', body?.code || 'ASSISTANT_REQUEST_FAILED');
      return body.data;
    } catch (error) {
      guard.assertCurrent(ticket);
      if (error?.name === 'AbortError') throw quoteAssistantError('等待时间较长，可用同一请求重试，避免重复发布。', 'ASSISTANT_TIMEOUT');
      throw error;
    } finally { clearTimeout(timer); }
  }
  return {
    configure: (payload, userId) => request('configure', payload, userId),
    state: async userId => normalizeQuoteAssistantState(await request('state', {}, userId)),
    accessState: async (payload, userId) => normalizeQuoteAccessState(await request('access-state', payload, userId), userId),
    grantAccess: (payload, userId) => request('access-grant', payload, userId),
    revokeAccess: (payload, userId) => request('access-revoke', payload, userId),
    run: (payload, userId) => request('run', payload, userId),
    retry: (payload, userId) => request('retry', payload, userId),
    publish: (payload, userId) => request('publish', payload, userId),
    memoryPreferences: (payload, userId) => request('memory-preferences', payload, userId),
    saveMemory: (payload, userId) => request('memory-save', payload, userId),
    deleteMemory: (payload, userId) => request('memory-delete', payload, userId),
    schedule: (payload, userId) => request('schedule', payload, userId),
    cancelSubscription: (payload, userId) => request('cancel-subscription', payload, userId),
    cancel: (payload, userId) => request('cancel', payload, userId),
  };
}
