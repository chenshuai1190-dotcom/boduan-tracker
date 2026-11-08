import { AssistantError, assistantFailure, withinAssistantDeadline } from './errors.js';
import { generateAssistantResponse, extractAssistantMemories } from './provider.js';
import { getAssistantMarketClose, nextAssistantDailyRun } from './market.js';

const KIND_INSTRUCTIONS = {
  reply: '场景：在社区原帖下回应 invocation 中召唤你的用户，question 是其已保存的真实问题；post 是背景，comments 仅为从旧到新的直接祖先回复链。先直接回答问题，再补必要依据或不同意见，不复述整篇博文。普通问题尽量用 150 至 300 个汉字，复杂问题可适当展开。不要强制追问、固定开头结尾或套模板。默认只结合原帖与这条回复链；仅在用户需要社区讨论背景、相关公开观点时使用公开帖子搜索工具，不主动串入其他帖。你没有收到图片像素，也没有全网实时搜索或个股新闻工具，不得声称看过图片、查过实时全网或核实了个股新闻；缺少这些信息时直接说明具体缺口。身份以 author.isAssistant 为准，不能凭昵称判断 Quote。',
  chat: '场景：用户本人的私密工作台对话。可以参考提供的本人授权记忆，理解连续追问；此回答不能直接公开发布。',
  'daily-review': '场景：盘后复盘草稿。先写明确交易日期，概括工具提供的 SPY/QQQ 和 VIX 同日实际变化，再给一个开放的复盘问题。无需罗列所有数字，不把市场变化当成买卖指令。',
  'weekly-digest': '场景：社区公开讨论回顾草稿。只概括所给时间范围内实际读取到的公开帖子，署名并保留原帖引用，分清分歧、验证和待回答问题。若有限额，明确是选取的讨论。没有帖子则不能编造回顾。',
  followup: '场景：作者主动预约的观点回访。引用原帖的日期与观察条件，帮助作者核验；若没有实际后续证据，提出待核实问题，不擅自宣布预测成功或失败。',
  milestone: '场景：作者明确选择分享的时间线里程碑草稿。只描述给出的事件类型、标题和实际日期。若资料只含事件引用，不包含金额或收益率，就不要输出任何假定的账户数字。',
};

const text = (value, max = 2000) => typeof value === 'string' ? value.slice(0, max) : '';
function postContext(post) {
  if (!post) return null;
  return { id: post.id, text: text(post.text, 5000), date: post.date,
    author: text(post.author?.nickname, 80), stocks: Array.isArray(post.stocks) ? post.stocks.slice(0, 20) : [],
    market: post.market || null };
}

function replyNode(source, kind, assistantId) {
  const authorId = typeof source.authorId === 'string' ? source.authorId : null;
  return { id: source.id, kind, text: text(source.text, kind === 'post' ? 12000 : 4000),
    author: { id: authorId, nickname: text(source.author?.nickname || source.nickname, 80),
      isAssistant: Boolean(assistantId && authorId === assistantId) },
    replyTo: source.replyTo || null };
}

function replyContext(context) {
  const { job, post } = context;
  const unavailable = () => new AssistantError('ASSISTANT_SOURCE_CHANGED', '召唤内容已不可用，请重新打开原帖。', 409);
  if (!post?.id || post.id !== job.postId) throw unavailable();
  const assistantId = context.assistant?.authorId;
  if (!job.replyTo) {
    const invocation = replyNode(post, 'post', assistantId);
    if (!invocation.text.trim()) throw unavailable();
    return { invocation, comments: [] };
  }
  const key = reference => reference && ['author', 'community'].includes(reference.kind)
    && typeof reference.id === 'string' && reference.id ? `${reference.kind}:${reference.id}` : null;
  const nodes = new Map();
  for (const comment of Array.isArray(context.comments) ? context.comments : []) {
    const id = key(comment);
    if (id && !nodes.has(id) && comment.deleted !== true && !comment.deletedAt
      && (!comment.postId || comment.postId === post.id)) nodes.set(id, comment);
  }
  const targetKey = key(job.replyTo), target = nodes.get(targetKey);
  if (!target || !text(target.text, 4000).trim()) throw unavailable();
  const invocation = replyNode(target, target.kind, assistantId);
  const ancestors = [], visited = new Set([targetKey]);
  let parentKey = key(target.replyTo);
  // SQL supplies the invocation plus at most seven ancestors. Follow exact
  // edges only; unrelated recent comments never replace a missing parent.
  while (parentKey && !visited.has(parentKey) && ancestors.length < 7) {
    const parent = nodes.get(parentKey);
    if (!parent) break;
    visited.add(parentKey);
    ancestors.push(replyNode(parent, parent.kind, assistantId));
    parentKey = key(parent.replyTo);
  }
  return { invocation, comments: ancestors.reverse() };
}

export function buildAssistantContext(context) {
  const job = context.job;
  if (!KIND_INSTRUCTIONS[job?.kind]) throw new AssistantError('ASSISTANT_INVALID_KIND', '请选择有效的小助手功能。', 422);
  const reply = job.kind === 'reply' ? replyContext(context) : null;
  return { kind: job.kind, question: reply ? reply.invocation.text : text(job.prompt, 4000), date: job.date || null,
    ...(reply ? { invocation: reply.invocation } : {}),
    replyTo: job.replyTo || null,
    range: { from: job.rangeStart || null, to: job.rangeEnd || null },
    post: postContext(context.post),
    comments: reply ? reply.comments : (Array.isArray(context.comments) ? context.comments : []).slice(0, 50).reverse().map(comment => ({
      id: comment.id, kind: comment.kind, authorId: comment.authorId, author: text(comment.author?.nickname || comment.nickname, 80),
      text: text(comment.text, 1500), createdAt: comment.createdAt, replyTo: comment.replyTo || null,
    })),
    history: reply ? [] : (Array.isArray(context.history) ? context.history : []).slice(-10).map(item => ({ question: text(item.prompt, 1500), answer: text(item.text, 3000) })),
    memories: job.kind === 'chat' && context.memoryEnabled !== false ? (Array.isArray(context.memories) ? context.memories : []).slice(0, 50).map(item => text(item.text, 1000)) : [],
    milestone: job.kind === 'milestone' ? context.milestone : null,
    publicPosts: reply ? [] : (Array.isArray(context.publicPosts) ? context.publicPosts : []).slice(0, 50).map(post => ({ ...postContext(post), text: text(post.text, 1000) })),
  };
}

const functionTool = (name, description, properties, required, execute) => ({
  definition: { type: 'function', name, description, strict: true,
    parameters: { type: 'object', properties, required, additionalProperties: false } }, execute,
});
const sourceFor = post => ({ id: post.id, postId: post.id, title: text(post.text, 80), date: post.date, scope: 'public' });

export function createAssistantTools({ context, marketClose = getAssistantMarketClose, signal } = {}) {
  const posts = new Map([context.post, ...(context.publicPosts || [])].filter(Boolean).map(post => [post.id, post]));
  return [
    functionTool('search_public_posts', '在本次已核验的公开讨论范围内检索原帖；不会读取私密日志。',
      { query: { type: 'string', maxLength: 200 } }, ['query'], async args => {
        if (!args || Object.keys(args).some(key => key !== 'query') || typeof args.query !== 'string' || args.query.length > 200) throw new AssistantError('ASSISTANT_INVALID_TOOL', '公开检索条件无效。', 422);
        const query = args.query.trim().toLowerCase();
        const found = [...posts.values()].filter(post => !query || `${post.text} ${(post.stocks || []).join(' ')}`.toLowerCase().includes(query)).slice(0, 10);
        return { scope: 'provided_public_posts', posts: found.map(postContext), sources: found.map(sourceFor) };
      }),
    functionTool('read_public_post', '读取本次已核验的公开原帖，必须使用上下文提供的帖子 ID。',
      { postId: { type: 'string', maxLength: 110 } }, ['postId'], async args => {
        if (!args || Object.keys(args).some(key => key !== 'postId') || typeof args.postId !== 'string') throw new AssistantError('ASSISTANT_INVALID_TOOL', '公开原帖查询条件无效。', 422);
        const post = posts.get(args.postId);
        if (!post) return { available: false, reason: 'not_in_authorized_sources', sources: [] };
        return { post: postContext(post), sources: [sourceFor(post)] };
      }),
    functionTool('read_market_close', '读取一个已经完成的美股交易日 SPY、QQQ、VIX/VIX3M 正式同日收盘数据。',
      { date: { type: ['string', 'null'], description: 'YYYY-MM-DD；null表示最近应完成交易日' } }, ['date'], async args => {
        if (!args || Object.keys(args).some(key => key !== 'date') || args.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new AssistantError('ASSISTANT_INVALID_TOOL', '市场日期无效。', 422);
        signal?.throwIfAborted();
        return marketClose({ date: args.date || null });
      }),
  ];
}

export async function runAssistantJob({ id, repository, signal, generate = generateAssistantResponse,
  marketClose = getAssistantMarketClose, extractMemories = extractAssistantMemories, env = process.env,
  deadlineAt = Date.now() + 80_000 } = {}) {
  const claimed = await repository.admin('claim', { id });
  if (!claimed?.leaseToken) {
    // A previous request may have saved a complete automatic reply and lost the
    // publication response. Resume publication only; never regenerate or revive
    // cancelled/failed work. The RPC revalidates ownership and all sources.
    if (claimed?.job?.status === 'draft' && claimed.job.autoPublish === true) {
      const published = await repository.admin('publish', { id, ownerId: claimed.job.ownerId, revision: claimed.job.revision });
      if (published?.status !== 'published') throw new AssistantError('ASSISTANT_SOURCE_CHANGED', '来源已改变，本次回答未发布。', 409);
      return published;
    }
    return claimed?.job;
  }
  const leaseToken = claimed.leaseToken;
  try {
    const context = await repository.admin('context', { id, leaseToken });
    const modelContext = buildAssistantContext(context);
    if (context.job.kind === 'daily-review') {
      modelContext.marketClose = await withinAssistantDeadline(() => marketClose({ date: context.job.recurrence === 'daily' ? null : context.job.date || null }), signal);
      modelContext.date = modelContext.marketClose.asOfDate;
    }
    if (context.job.kind === 'weekly-digest' && !modelContext.publicPosts.length) {
      throw new AssistantError('ASSISTANT_NO_PUBLIC_POSTS', '所选时间范围内没有可用的公开帖子。', 422);
    }
    const generationBudget = deadlineAt - Date.now() - 6000;
    if (generationBudget <= 0) throw new AssistantError('ASSISTANT_TIMEOUT', '这次查询超时，请重试。', 504);
    const generated = await generate({ context: modelContext,
      instructions: KIND_INSTRUCTIONS[context.job.kind],
      tools: createAssistantTools({ context, marketClose, signal }), signal, env, timeoutMs: generationBudget });
    signal?.throwIfAborted();
    let memoryUpdate;
    if (context.job.kind === 'chat') {
      memoryUpdate = { status: context.memoryEnabled === false ? 'paused' : 'unchanged', summary: context.memoryEnabled === false ? '自动记忆已暂停' : '本次没有新增记忆' };
      if (context.memoryEnabled === true) {
        try {
          const memoryBudget = deadlineAt - Date.now() - 5000;
          if (memoryBudget < 1000) throw new Error('memory budget exhausted');
          const changes = await extractMemories({ prompt: context.job.prompt, memories: context.memories || [], signal, env, timeoutMs: memoryBudget });
          if (changes.upserts.length || changes.deletes.length) {
            const result = await repository.admin('apply-memories', { id, leaseToken, memoryEpoch: context.memoryEpoch, ...changes });
            memoryUpdate = result?.applied === true ? { status: 'updated', summary: [
              changes.upserts.length ? `已记住：${changes.upserts.map(item => item.text).join('；')}` : '',
              changes.deletes.length ? `已删除 ${changes.deletes.length} 条记忆` : '',
            ].filter(Boolean).join('。') } : { status: 'unchanged', summary: '记忆已被修改，本次保留你的最新设置' };
          }
        } catch {
          memoryUpdate = { status: 'unavailable', summary: '回答已生成，本次记忆暂未更新' };
        }
      }
    }
    const marketDate = modelContext.marketClose?.asOfDate;
    const marketSourceDates = [...new Set([marketDate, ...(generated.sources || []).filter(source => source.kind === 'market').map(source => source.date)].filter(Boolean))];
    const marketFooter = marketSourceDates.length ? `\n\n市场数据：${marketSourceDates.join('、')} 完成收盘；Cboe VIX / VIX3M、EODHD SPY / QQQ（复权收盘）。` : '';
    if (generated.text.length + marketFooter.length > 12000) throw new AssistantError('ASSISTANT_INCOMPLETE', '这次回答过长，请缩小问题范围后重试。', 502);
    const completed = await repository.admin('complete', { id, leaseToken, text: `${generated.text}${marketFooter}`,
      ...(marketDate ? { marketDate } : {}),
      ...(context.job.recurrence === 'daily' && marketDate ? { nextDueAt: nextAssistantDailyRun(marketDate) } : {}),
    });
    if (completed?.status !== 'draft') throw new AssistantError('ASSISTANT_SOURCE_CHANGED', '来源已改变，本次回答未保存，请重新读取。', 409);
    if (completed?.autoPublish && completed.status === 'draft') {
      const published = await repository.admin('publish', { id, ownerId: context.job.ownerId || claimed.job.ownerId, revision: completed.revision });
      if (published?.status !== 'published') throw new AssistantError('ASSISTANT_SOURCE_CHANGED', '来源已改变，本次回答未发布。', 409);
      return published;
    }
    return memoryUpdate ? { ...completed, memoryUpdate } : completed;
  } catch (error) {
    const failure = assistantFailure(error);
    try { await repository.admin('fail', { id, leaseToken, errorCode: failure.code }, { signal: AbortSignal.timeout(5000) }); } catch { /* Lease may have been cancelled or superseded. */ }
    throw failure;
  }
}
