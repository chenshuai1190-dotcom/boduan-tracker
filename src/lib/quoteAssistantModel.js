export const QUOTE_ASSISTANT_MODES = [
  { id: 'chat', label: '聊一聊', description: '连续交流，查找公开讨论与已授权的个人记忆' },
  { id: 'reply', label: '@Quote 回复', description: '围绕一篇公开博文继续讨论' },
  { id: 'daily-review', label: '盘后复盘', description: '根据已核实的收盘资料生成复盘草稿' },
  { id: 'followup', label: '观点回访', description: '到约定时间，回看自己公开写下的判断' },
  { id: 'weekly-digest', label: '社区周报', description: '整理公开讨论，保留作者和原帖出处' },
  { id: 'milestone', label: '公开里程碑', description: '选择一条自己的时间线记录，确认后公开' },
];
export const QUOTE_ASSISTANT_STATUSES = { pending: '等待执行', running: '正在思考', draft: '草稿', completed: '已完成', published: '已发布', failed: '失败', cancelled: '已取消' };
export const hasQuoteMention = text => /@quote(?![A-Za-z0-9_])/i.test(String(text || ''));
export function quoteAssistantError(message, code = 'ASSISTANT_REQUEST_FAILED') {
  const error = new Error(message); error.code = code; return error;
}
export function normalizeQuoteAssistantState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw quoteAssistantError('小助手状态暂不可用，请重试。');
  const arrays = ['memories', 'jobs', 'posts', 'milestones', 'subscriptions'];
  for (const name of arrays) if (value[name] != null && !Array.isArray(value[name])) throw quoteAssistantError('小助手状态暂不可用，请重试。');
  return { ...value, configured: value.configured === true, enabled: value.enabled !== false,
    ...Object.fromEntries(arrays.map(name => [name, value[name] || []])) };
}
export function quoteAssistantPostTitle(post) {
  return String(post?.title || post?.text || post?.date || post?.id || '').slice(0, 76);
}
export function quoteAssistantSourceHref(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
export function mergeQuoteAssistantJob(jobs, job) {
  if (!job?.id) return jobs;
  return [job, ...jobs.filter(row => row.id !== job.id)];
}
