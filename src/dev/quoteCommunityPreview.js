// Fixed DEV-only conversation. These are display samples, not model answers.
export function quoteCommunityPreview(ownerId) {
  const now = Date.now(), stamp = minutes => new Date(now - minutes * 60_000).toISOString();
  const date = new Date(now).toISOString().slice(0, 10);
  const id = 'local-quote-community', postId = `insight:${id}`;
  const questionId = '70000000-0000-4000-8000-000000000001';
  const answerId = '70000000-0000-4000-8000-000000000002';
  const entry = { id, type: 'insight', date, revision: 1, visibility: 'public', createdAt: stamp(12), publishedAt: stamp(12),
    text: '【本地互动样例】\n交易前先把买入理由写下来，过一段时间再回看：判断有没有变化，执行有没有偏离原来的计划。',
    stocks: [], images: [], replies: [], market: null, mood: '', level: '🟢', pinned: false };
  const comment = (commentId, minutes, authorId, author, text, replyTo = null) => ({ id: commentId, postId, authorId, author,
    text, date, createdAt: stamp(minutes), updatedAt: stamp(minutes), revision: 1, replyTo,
    score: null, tags: [], images: [], stocks: [], trades: [], market: null, account: null, mood: '' });
  return { entry, comments: [
    comment(questionId, 5, ownerId, { nickname: '波段玩家1836', avatarKey: 'gold' }, '@Quote 你觉得这条复盘还缺什么？'),
    comment(answerId, 4, 'local-quote-assistant', { nickname: 'Quote', isAssistant: true },
      '**还缺“什么情况说明判断错了”。**\n\n只记录买入理由，事后很容易重新解释它。可以补上两项：\n\n- 验证条件：出现什么证据，说明原来的理由不再成立。\n- 复盘时间：什么时候回来检查，把判断和执行分别看。\n\n这样留下的就不只是一句“看好”，而是以后能核对的判断。',
      { kind: 'community', id: questionId, authorId: ownerId, nickname: '波段玩家1836', available: true }),
  ] };
}
