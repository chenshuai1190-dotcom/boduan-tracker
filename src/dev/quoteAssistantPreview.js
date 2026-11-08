// Imported only by the dev preview. Every answer here is a labelled fixed sample,
// not an AI response. No fetch, RPC, localStorage or production mutations.
export function createQuoteAssistantPreview({ userId, getEntries = () => [] } = {}) {
  const jobs = [], memories = [], subscriptions = [];
  let memoryEnabled = true;
  const now = () => new Date().toISOString();
  const copy = value => JSON.parse(JSON.stringify(value));
  const assertOwner = expected => { if (!userId || expected !== userId) throw new Error('示例账户已变化。'); };
  const ownPost = { id: 'log:local-quote-ai-source', authorId: userId, text: '示例观点：这次先把观察条件写下来，一个月后再回看判断。', date: '2026-11-08', author: { nickname: '波段玩家1836' } };
  const posts = () => [ownPost, ...getEntries().filter(row => row.visibility === 'public' && `${row.type}:${row.id}` !== ownPost.id).map(row => ({ ...row, id: `${row.type}:${row.id}`, authorId: userId }))];
  const milestone = { postId: 'log:local-quote-ai-milestone', title: '年内收益新高', date: '2026-10-06', event: { version: 1, id: 'high:annual_pnl:2026-10-06', kind: 'high', metric: 'annual_pnl', date: '2026-10-06', title: '年内收益新高' } };
  const answer = payload => ({
    chat: '【固定样例回答】我们可以先把这次想验证的问题写清楚。你更想回看当时的判断依据，还是实际执行有没有偏离计划？',
    reply: '【固定样例回答】读完这条公开记录，我想追问一个具体问题：到复盘日期时，你准备使用什么证据判断原来的观点是否成立？',
    'daily-review': '【固定样例草稿】今天的复盘从一个问题开始：哪些动作按计划完成，哪些是临时改变？\n\n此处只演示结构，没有读取真实市场数据，也不代表今日行情。',
    'weekly-digest': '【固定样例草稿】本周的示例讨论围绕“先记录判断，再验证结果”。值得保留的共识是，把观察条件和行动分开写。\n\n下方来源仅指向本地示例原帖。',
    milestone: '【固定样例草稿】记录一个新的年内收益高点。这个节点提醒我们回看此前的决策和执行。\n\n示例只提供事件名称与日期，没有编造账户金额或收益率。',
    followup: '【固定样例回答】约定的回访时间到了。回到原帖，当初列出的观察条件，现在有哪些得到验证，哪些需要更新？',
  })[payload.kind] || '【固定样例回答】';
  const find = id => jobs.find(row => row.id === id);
  const saveJob = payload => {
    const existing = find(payload.requestId); if (existing) return existing;
    const job = { id: payload.requestId || crypto.randomUUID(), kind: payload.kind, status: payload.kind === 'followup' || payload.recurrence ? 'pending' : payload.kind === 'reply' ? 'published' : 'draft',
      prompt: payload.prompt || '', sessionId: payload.sessionId || null, postId: payload.postId || null, replyTo: payload.replyTo || null,
      dueAt: payload.dueAt || null, date: payload.date || null, rangeStart: payload.rangeStart || null, rangeEnd: payload.rangeEnd || null,
      text: payload.kind === 'followup' || payload.recurrence ? '' : answer(payload), sources: payload.kind === 'chat' ? [] : [{ postId: payload.postId || ownPost.id, title: '示例原帖', date: ownPost.date }],
      revision: 1, createdAt: now(), updatedAt: now(), errorCode: null, autoPublish: payload.autoPublish === true, canPublish: payload.kind !== 'chat',
      postRef: payload.kind === 'reply' ? { postId: payload.postId, commentId: crypto.randomUUID() } : null };
    jobs.unshift(job); return job;
  };
  return {
    async state(expected) { assertOwner(expected); return copy({ configured: true, enabled: true, mode: 'example', assistant: { authorId: 'local-quote-assistant', nickname: 'Quote', isAssistant: true },
      memories, memoryEnabled, jobs, subscriptions, posts: posts(), milestones: [milestone], capabilities: { chat: true, reply: true, daily: true, followup: true, weekly: true, milestone: true } }); },
    async run(payload, expected) { assertOwner(expected); const job=saveJob(payload); if(payload.kind==='chat'&&memoryEnabled&&!memories.length)memories.push({id:crypto.randomUUID(),text:'【示例记忆】复盘时关注原计划和实际执行的差异。',revision:1,createdAt:now(),updatedAt:now()}); return copy(job); },
    async retry({ id, revision }, expected) { assertOwner(expected); const job = find(id); if (!job || job.revision !== revision || job.status !== 'failed') throw new Error('示例任务已变化。'); job.status = job.autoPublish ? 'published' : 'draft'; job.text = answer(job); job.revision++; return copy(job); },
    async publish({ id, revision }, expected) { assertOwner(expected); const job = find(id); if (!job || job.revision !== revision || job.kind === 'chat') throw new Error('示例草稿已变化。'); job.status = 'published'; job.revision++; job.postRef = { postId: job.postId || `log:${job.id}`, commentId: null }; return copy(job); },
    async cancel({ id, revision }, expected) { assertOwner(expected); const job = find(id); if (!job || job.revision !== revision) throw new Error('示例任务已变化。'); job.status = 'cancelled'; job.revision++; return copy(job); },
    async memoryPreferences({enabled},expected){assertOwner(expected);memoryEnabled=enabled===true;return{enabled:memoryEnabled};},
    async saveMemory(payload, expected) { assertOwner(expected); if (!payload.text?.trim()) throw new Error('请填写记忆。'); const existing=memories.find(row=>row.id===payload.id);if(existing&&existing.revision!==payload.revision)throw new Error('记忆已更新。');const memory = { ...payload, revision: (existing?.revision||0)+1, createdAt:existing?.createdAt||now(), updatedAt: now() };if(existing)memories.splice(memories.indexOf(existing),1);memories.unshift(memory); return copy(memory); },
    async deleteMemory({ id }, expected) { assertOwner(expected); const index = memories.findIndex(row => row.id === id); if (index >= 0) memories.splice(index, 1); return { deleted: true, id }; },
    async schedule(payload, expected) { assertOwner(expected); const job = saveJob(payload); if (payload.recurrence && !subscriptions.some(row => row.id === job.id)) subscriptions.unshift({ id: job.id, kind: job.kind, recurrence: payload.recurrence, dueAt: job.dueAt, active: true, revision: 1 }); return copy(job); },
    async cancelSubscription({ id }, expected) { assertOwner(expected); const sub = subscriptions.find(row => row.id === id); if (sub) { sub.active = false; sub.revision++; } jobs.filter(row => row.id === id && row.status === 'pending').forEach(row => { row.status = 'cancelled'; row.revision++; }); return { id, cancelled: true }; },
    async simulateDue(expected) { assertOwner(expected); jobs.filter(job => job.status === 'pending').forEach(job => { job.status = job.kind === 'followup' ? 'published' : 'draft'; job.text = answer(job); job.revision++; }); return { completed: true }; },
  };
}
