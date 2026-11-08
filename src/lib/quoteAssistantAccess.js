import { quoteAssistantError } from './quoteAssistantModel.js';

export const QUOTE_ACCESS_SCOPES = [
  { id: 'report', label: '收益报表', english: 'Return reports' },
  { id: 'trades', label: '交易记录', english: 'Trade records' },
  { id: 'holdings', label: '持仓记录', english: 'Holdings' },
];
const scopeNames = new Set(QUOTE_ACCESS_SCOPES.map(scope => scope.id));
const statuses = new Set(['pending', 'granted', 'consumed', 'revoked', 'expired']);
const dateValue = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** This is a presentation boundary. The authenticated service still enforces
 * ownership, source visibility, requested scope, expiry and one-job use. */
export function normalizeQuoteAccessState(value, userId) {
  if (!value || !Array.isArray(value.requests)) throw quoteAssistantError('授权状态暂未读取，请重试。', 'ASSISTANT_ACCESS_UNAVAILABLE');
  return { requests: value.requests.filter(request => request && request.ownerId === userId && typeof request.id === 'string'
    && typeof request.jobId === 'string' && statuses.has(request.status) && ['public', 'private'].includes(request.outputVisibility)
    && Array.isArray(request.scopes) && request.scopes.length > 0 && request.scopes.every(scope => scopeNames.has(scope))
    && dateValue(request.rangeStart) && dateValue(request.rangeEnd) && request.rangeStart <= request.rangeEnd)
    .map(request => ({ ...request, scopes: [...new Set(request.scopes)] })) };
}

export function quoteAccessGrantInput(request, selection, now = Date.now()) {
  if (!request || !['pending', 'granted'].includes(request.status)
    || !Number.isFinite(Date.parse(request.expiresAt)) || Date.parse(request.expiresAt) <= now) {
    throw quoteAssistantError('这次授权请求已失效，请重新向 Quote 提问。', 'ASSISTANT_ACCESS_EXPIRED');
  }
  const scopes = [...new Set(selection.scopes || [])];
  if (!scopes.length || scopes.some(scope => !scopeNames.has(scope) || !request.scopes.includes(scope))) {
    throw quoteAssistantError('请至少选择一项需要分析的数据。', 'ASSISTANT_ACCESS_SCOPE');
  }
  const { rangeStart, rangeEnd } = selection;
  if (!dateValue(rangeStart) || !dateValue(rangeEnd) || rangeStart > rangeEnd
    || rangeStart < request.rangeStart || rangeEnd > request.rangeEnd
    || (Date.parse(rangeEnd) - Date.parse(rangeStart)) / 86400000 > 365) {
    throw quoteAssistantError('请选择请求范围内的有效日期，最多 366 天。', 'ASSISTANT_ACCESS_RANGE');
  }
  return { id: request.id, scopes, rangeStart, rangeEnd, publicAnalysisConfirmed: request.outputVisibility === 'public' };
}

export function quoteAccessRequestsForView(state, { userId, postId, jobIds }) {
  const allowedJobs = jobIds ? new Set(jobIds) : null;
  return state.requests.filter(request => request.ownerId === userId && !['revoked', 'expired'].includes(request.status)
    && (postId ? request.postId === postId && request.outputVisibility === 'public'
      : request.outputVisibility === 'private' && allowedJobs?.has(request.jobId)));
}
