import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Clock3, Loader2, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import { ReviewSystemAvatar, ReviewSystemName } from './ReviewSystemIdentity.jsx';
import { QUOTE_ASSISTANT_MODES, QUOTE_ASSISTANT_STATUSES, mergeQuoteAssistantJob, quoteAssistantPostTitle, quoteAssistantSourceHref } from '../lib/quoteAssistantModel.js';
import { getVixComparisonExpectedCloseDate } from '../lib/vixComparisonSession.js';
import './QuoteAssistantWorkbench.css';

const today = () => new Date().toLocaleDateString('en-CA');
const utcToday = () => new Date().toISOString().slice(0, 10);
const dateBefore = days => { const date = new Date(); date.setUTCDate(date.getUTCDate() - days); return date.toISOString().slice(0, 10); };
const jobValue = value => value?.job || value;
const label = kind => QUOTE_ASSISTANT_MODES.find(mode => mode.id === kind)?.label || kind;
const newId = () => crypto.randomUUID();
const empty = { configured: false, memories: [], jobs: [], posts: [], milestones: [], subscriptions: [] };

function Sources({ sources, onOpenPost }) {
  if (!Array.isArray(sources) || !sources.length) return null;
  return <div className="qa-sources" aria-label="引用来源">{sources.map((source, index) => {
    const title = source.title || source.label || source.date || `来源 ${index + 1}`;
    const href = quoteAssistantSourceHref(source.url);
    return source.postId && onOpenPost ? <button type="button" key={index} onClick={() => onOpenPost(source.postId, source)}>{title}<ArrowRight size={14}/></button>
      : href ? <a key={index} href={href} target="_blank" rel="noopener noreferrer">{title}<ArrowRight size={14}/></a>
        : <span key={index}>{title}</span>;
  })}</div>;
}

/** The same interaction surface is used by production and the explicitly
 * labelled memory-only local adapter. It never substitutes a demo for an API failure. */
export default function QuoteAssistantWorkbench({ api, db, userId, language = 'zh', preview = false, onPublished, onOpenPost, Dialog }) {
  const [state, setState] = useState(empty), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [mode, setMode] = useState('chat'), [prompt, setPrompt] = useState(''), [postId, setPostId] = useState('');
  const [date, setDate] = useState(() => getVixComparisonExpectedCloseDate()), [rangeStart, setRangeStart] = useState(dateBefore(7)), [rangeEnd, setRangeEnd] = useState(utcToday);
  const [recurring, setRecurring] = useState(false);
  const [dueAt, setDueAt] = useState(''), [milestoneId, setMilestoneId] = useState(''), [milestoneConsent, setMilestoneConsent] = useState(false);
  const [sessionId, setSessionId] = useState(newId), [busy, setBusy] = useState(''), [result, setResult] = useState(null);
  const [memoryText, setMemoryText] = useState(''), [editingMemory, setEditingMemory] = useState(null), [confirmPublish, setConfirmPublish] = useState(null);
  const [notice, setNotice] = useState(''), [historyOpen, setHistoryOpen] = useState(false);
  const owner = useRef({ userId }), operation = useRef(null), retryPayload = useRef(null), memoryRequest = useRef(null), sessionChosen = useRef(false);
  if (owner.current.userId !== userId) owner.current = { userId };
  useEffect(() => { const scope = owner.current; return () => { if (owner.current === scope) owner.current = { userId: null }; }; }, [userId]);
  const current = scope => owner.current === scope;
  const load = async () => {
    const scope = owner.current; setLoading(true); setError('');
    try { const next = await api.state(userId); if (current(scope)) { setState(next); if (!sessionChosen.current) { const recent = next.jobs.find(job => job.kind === 'chat' && job.sessionId); if (recent) setSessionId(recent.sessionId); sessionChosen.current = true; } } }
    catch (failure) { if (current(scope)) setError(failure?.message || '小助手暂未读取，请重试。'); }
    finally { if (current(scope)) setLoading(false); }
  };
  useEffect(() => { void load(); }, [api, userId]);
  const act = async (key, action, success) => {
    if (operation.current) return;
    const scope = owner.current; operation.current = key; setBusy(key); setError(''); setNotice('');
    try { const value = await action(); if (current(scope)) await success?.(value); }
    catch (failure) { if (current(scope)) setError(failure?.message || '操作未完成，请重试。'); }
    finally { if (current(scope)) { operation.current = null; setBusy(''); } }
  };
  const consume = value => {
    const job = jobValue(value);
    if (job?.id) { setState(old => ({ ...old, jobs: mergeQuoteAssistantJob(old.jobs, job) })); setResult(job); }
    retryPayload.current = null;
    if (job?.memoryUpdate?.summary) setNotice(job.memoryUpdate.summary);
    if (job?.status === 'published') { setNotice('已发布，可在原帖或公开动态查看。'); onPublished?.(job); }
  };
  const chooseMode = kind => { if (busy) return; setMode(kind); setPostId(''); setRecurring(false); setResult(null); setError(''); setNotice(''); retryPayload.current = null; setConfirmPublish(null); };
  const chosenMilestone = state.milestones.find(row => row.postId === milestoneId);
  const selectedPost = state.posts.find(row => row.id === postId || row.postId === postId);
  const ownPosts = state.posts.filter(row => row.authorId === userId || row.ownerId === userId || row.isOwn === true);
  const canGenerate = !loading && state.configured && state.enabled !== false && !busy;
  const canSubmit = canGenerate && (mode === 'chat' ? Boolean(prompt.trim()) : mode === 'reply' ? Boolean(postId && prompt.trim())
    : mode === 'followup' ? Boolean(postId && prompt.trim() && dueAt) : mode === 'milestone' ? Boolean(chosenMilestone && milestoneConsent)
      : mode === 'daily-review' ? Boolean(date) : Boolean(rangeStart && rangeEnd && rangeStart <= rangeEnd));
  const submit = () => {
    if (!canSubmit) return;
    if (mode === 'followup' && (!Number.isFinite(Date.parse(dueAt)) || Date.parse(dueAt) <= Date.now())) { setError('请选择未来的回访时间。'); return; }
    if (recurring && (!Number.isFinite(Date.parse(dueAt)) || Date.parse(dueAt) <= Date.now())) { setError('请选择未来的首次生成时间。'); return; }
    const next = { kind: mode, prompt: prompt.trim(), requestId: newId(), ...(mode === 'chat' ? { sessionId } : {}),
      ...(mode === 'reply' || mode === 'followup' ? { postId } : {}),
      ...(mode === 'daily-review' ? { date } : {}), ...(mode === 'weekly-digest' ? { rangeStart, rangeEnd } : {}),
      ...(mode === 'milestone' ? { postId: milestoneId, shareConfirmed: true } : {}),
      ...(mode === 'followup' || recurring ? { dueAt: new Date(dueAt).toISOString() } : {}),
      ...(recurring ? { recurrence: mode === 'daily-review' ? 'daily' : 'weekly' } : {}) };
    if (mode === 'reply') next.commentId = newId();
    retryPayload.current = next; void execute(next);
  };
  const execute = payload => act('generate', async () => {
    // Check configuration afresh before a paid request or writing an @ comment.
    const fresh = await api.state(userId);
    if (!fresh.configured || fresh.enabled === false) throw new Error(fresh.configurationError || 'AI 服务尚未配置，配置完成后即可使用。');
    const previous = fresh.jobs.find(job => job.id === payload.requestId);
    if (previous?.status === 'failed') return api.retry({ id: previous.id, revision: previous.revision }, userId);
    if (payload.kind === 'followup' || payload.recurrence) return api.schedule(payload, userId);
    if (payload.kind === 'reply') {
      if (!payload.savedComment) {
        const saved = await db.saveReviewCommunityEvaluation(payload.postId, { id: payload.commentId, revision: 0,
          date: today(), text: `@Quote ${payload.prompt}`, score: null, tags: [], images: [], stocks: [], trades: [], market: null, account: null, replyTo: null }, userId);
        if (saved?.id !== payload.commentId || saved?.authorId !== userId) throw new Error('评论保存结果未确认，请重试。');
        payload.savedComment = true;
      }
      return api.run({ kind: 'reply', requestId: payload.requestId, postId: payload.postId,
        replyTo: { kind: 'community', id: payload.commentId }, autoPublish: true }, userId);
    }
    return api.run(payload, userId);
  }, async value => {
    consume(value);
    if (payload.recurrence) { const next = await api.state(userId); if(owner.current.userId!==userId)return; setState(next); setNotice('已设置自动生成草稿，每次发布前仍由你确认。'); }
    if (payload.kind === 'followup') setNotice('已设置回访，届时会在原公开帖下回复。');
    if (payload.kind === 'chat') { setPrompt(''); const next=await api.state(userId); if(owner.current.userId===userId)setState(next); }
  });
  const retryJob = job => act(`retry:${job.id}`, async () => { const fresh = await api.state(userId); if (!fresh.configured || fresh.enabled === false) throw new Error(fresh.configurationError || 'AI 服务尚未配置。'); const latest = fresh.jobs.find(item => item.id === job.id) || job; return latest.status === 'failed' ? api.retry({ id: latest.id, revision: latest.revision }, userId) : latest; }, consume);
  const publish = job => act(`publish:${job.id}`, () => api.publish({ id: job.id, revision: job.revision }, userId), value => { consume(value); setConfirmPublish(null); });
  const cancel = job => act(`cancel:${job.id}`, () => api.cancel({ id: job.id, revision: job.revision }, userId), value => { consume(value); setNotice('已取消这项任务。'); });
  const saveMemory = () => {
    const text = memoryText.trim();
    if (!memoryRequest.current || memoryRequest.current.text !== text || memoryRequest.current.editingId !== editingMemory?.id) memoryRequest.current = { id: editingMemory?.id || newId(), revision: editingMemory?.revision || 0, text, editingId: editingMemory?.id };
    const { editingId: _editingId, ...request } = memoryRequest.current;
    void act('memory', () => api.saveMemory(request, userId), async () => { memoryRequest.current = null; setMemoryText(''); setEditingMemory(null); const next = await api.state(userId); if(owner.current.userId!==userId)return; setState(next); setNotice('已保存到你的个人记忆。'); });
  };
  const deleteMemory = memory => act(`delete:${memory.id}`, () => api.deleteMemory({ id: memory.id, revision: memory.revision }, userId), () => { setState(old => ({ ...old, memories: old.memories.filter(row => row.id !== memory.id) })); setNotice('已删除这条记忆。'); });
  const chatJobs = state.jobs.filter(job => job.kind === 'chat' && job.sessionId === sessionId).slice().reverse();
  const sessions = [...new Map(state.jobs.filter(job => job.kind === 'chat' && job.sessionId).map(job => [job.sessionId, job])).values()];
  const tasks = state.jobs.filter(job => job.kind !== 'chat');
  const formDisabled = Boolean(busy);
  const jobCard = job => <article className="qa-job" key={job.id} data-quote-assistant-job={job.id}>
    <div className="qa-job-heading"><strong>{label(job.kind)}</strong><span>{QUOTE_ASSISTANT_STATUSES[job.status] || job.status}</span></div>
    {job.prompt && <p className="qa-job-question">{job.prompt}</p>}
    {job.dueAt && <p className="qa-meta"><Clock3 size={14}/>{new Date(job.dueAt).toLocaleString(language === 'en' ? 'en-US' : 'zh-CN')}</p>}
    {job.text && <p className="qa-answer">{job.text}</p>}
    <Sources sources={job.sources} onOpenPost={onOpenPost}/>
    {job.status === 'failed' && <p role="alert" className="qa-error">{job.errorMessage || '任务未完成，可重新生成。'}</p>}
    <div className="qa-job-actions">
      {job.status === 'failed' && <button type="button" disabled={Boolean(busy)} onClick={() => retryJob(job)}>重试任务</button>}
      {job.status === 'draft' && job.kind !== 'chat' && job.canPublish !== false && <button type="button" disabled={Boolean(busy)} onClick={() => setConfirmPublish(job)}>检查并发布</button>}
      {['pending', 'running', 'draft', 'failed'].includes(job.status) && job.kind !== 'chat' && <button type="button" disabled={Boolean(busy)} onClick={() => cancel(job)}>取消任务</button>}
      {job.postRef && onOpenPost && <button type="button" onClick={() => onOpenPost(typeof job.postRef === 'string' ? job.postRef : job.postRef.postId)}>查看发布内容</button>}
    </div>
  </article>;
  return <section className="qa-workbench" aria-label="Quote 小助手">
    <div className="qa-intro"><ReviewSystemAvatar/><div><div className="rj-post-heading"><ReviewSystemName language={language}/></div><p>一起把每一次观察，变成值得回看的记录。</p></div></div>
    {preview && <p className="qa-demo-note" role="status">本地功能演示 · 示例资料与固定样例回答 · 不调用模型，不发布真实内容</p>}
    <div className="qa-service-state"><span>{loading ? '正在连接小助手…' : state.configured && state.enabled !== false ? (preview ? '示例模式' : 'AI 服务已配置') : 'AI 服务待配置'}</span><button type="button" aria-label="重新读取小助手状态" disabled={loading || Boolean(busy)} onClick={load}><RefreshCw size={16}/></button></div>
    {!loading && state.canConfigure && !state.assistant && <button type="button" className="qa-secondary" disabled={Boolean(busy)} onClick={()=>act('configure',()=>api.configure({},userId),async()=>{const next=await api.state(userId);if(owner.current.userId===userId)setState(next);})}>初始化 Quote 身份</button>}
    {!loading && !state.configured && <p className="qa-empty">{state.configurationError || '还需要配置服务端 AI 密钥和模型。完成后，这里会提供真实回答。'}</p>}
    <nav className="qa-modes" aria-label="小助手功能">{QUOTE_ASSISTANT_MODES.map(item => <button type="button" key={item.id} aria-pressed={mode === item.id} disabled={Boolean(busy)} onClick={() => chooseMode(item.id)}>{item.label}</button>)}</nav>
    <section className="qa-compose" aria-label={label(mode)}>
      <div className="qa-section-title"><h2>{label(mode)}</h2>{mode === 'chat' && <button type="button" disabled={Boolean(busy)} onClick={() => { sessionChosen.current = true; setSessionId(newId()); setResult(null); setPrompt(''); retryPayload.current = null; }}>新对话<Plus size={15}/></button>}</div>
      <p className="qa-description">{QUOTE_ASSISTANT_MODES.find(item => item.id === mode)?.description}</p>
      {mode === 'chat' && <><p className="qa-meta">仅自己可见</p>{sessions.length > 0 && <label className="qa-field">历史对话<select value={sessionId} disabled={formDisabled} onChange={event => { sessionChosen.current = true; setSessionId(event.target.value); setResult(null); retryPayload.current = null; }}><option value={sessionId}>当前对话</option>{sessions.filter(job => job.sessionId !== sessionId).map(job => <option key={job.sessionId} value={job.sessionId}>{(job.prompt || '私密对话').slice(0, 42)}</option>)}</select></label>}</>}
      {(mode === 'reply' || mode === 'followup') && <label className="qa-field">{mode === 'followup' ? '自己的公开原帖' : '公开原帖'}<select value={postId} disabled={formDisabled} onChange={event => setPostId(event.target.value)}><option value="">选择原帖</option>{(mode === 'followup' ? ownPosts : state.posts).map(post => <option key={post.id || post.postId} value={post.id || post.postId}>{quoteAssistantPostTitle(post)}</option>)}</select></label>}
      {selectedPost && ['reply', 'followup'].includes(mode) && <blockquote className="qa-context">{selectedPost.text || selectedPost.title}</blockquote>}
      {mode === 'daily-review' && <label className="qa-field">复盘日期<input type="date" max={getVixComparisonExpectedCloseDate()} value={date} disabled={formDisabled} onChange={event => setDate(event.target.value)}/></label>}
      {mode === 'weekly-digest' && <div className="qa-date-range"><label className="qa-field">开始日期<input type="date" max={rangeEnd || utcToday()} value={rangeStart} disabled={formDisabled} onChange={event => setRangeStart(event.target.value)}/></label><label className="qa-field">结束日期<input type="date" min={rangeStart} max={utcToday()} value={rangeEnd} disabled={formDisabled} onChange={event => setRangeEnd(event.target.value)}/></label></div>}
      {['daily-review', 'weekly-digest'].includes(mode) && <><label className="qa-consent"><input type="checkbox" checked={recurring} disabled={formDisabled} onChange={event => setRecurring(event.target.checked)}/>自动生成{mode === 'daily-review' ? '每日' : '每周'}草稿</label>{recurring && <label className="qa-field">首次生成时间（你的本地时间）<input type="datetime-local" value={dueAt} disabled={formDisabled} onChange={event => setDueAt(event.target.value)}/><span className="qa-meta">任务会在到期后的定时检查中执行，生成后等待你确认公开。</span></label>}</>}
      {mode === 'followup' && <label className="qa-field">回访时间（你的本地时间）<input type="datetime-local" value={dueAt} disabled={formDisabled} onChange={event => setDueAt(event.target.value)}/></label>}
      {mode === 'milestone' && <>{!state.milestones.length ? <p className="qa-empty">目前没有已保存的时间线记录可供选择。先在时间线记录下留下评价，保存对应节点后再回来。</p> : <label className="qa-field">选择自己的时间线记录<select value={milestoneId} disabled={formDisabled} onChange={event => { setMilestoneId(event.target.value); setMilestoneConsent(false); }}><option value="">选择记录</option>{state.milestones.map(item => <option key={item.postId} value={item.postId}>{item.date} · {item.title}</option>)}</select></label>}
        {chosenMilestone && <><blockquote className="qa-context"><strong>{chosenMilestone.title}</strong><br/>{chosenMilestone.date}<p>将根据这条记录生成公开草稿，发布前可检查完整内容。</p></blockquote><label className="qa-consent"><input type="checkbox" checked={milestoneConsent} disabled={formDisabled} onChange={event => setMilestoneConsent(event.target.checked)}/>允许用这个节点生成公开里程碑草稿</label></>}
      </>}
      <label className="qa-field">{mode === 'followup' ? '到时候想验证什么' : mode === 'chat' || mode === 'reply' ? '想和 Quote 说什么' : '希望重点关注什么（选填）'}<textarea rows={3} maxLength={4000} value={prompt} disabled={formDisabled} onChange={event => { setPrompt(event.target.value); retryPayload.current = null; }} placeholder={mode === 'followup' ? '写下到期可以核对的问题或判断条件' : '写下你的问题…'}/></label>
      <button type="button" className="qa-primary" disabled={!canSubmit} onClick={submit}>{busy === 'generate' ? <><Loader2 size={17} className="rj-spin"/>正在处理…</> : <>{mode === 'followup' ? '设置回访' : recurring ? '开启自动草稿' : mode === 'reply' ? '发表评论并请 Quote 回复' : mode === 'chat' ? '发送' : '生成草稿'}<Send size={16}/></>}</button>
      {mode === 'reply' && <p className="qa-meta">问题与小助手回复会显示在所选公开帖下。</p>}
      {mode === 'followup' && <p className="qa-meta">到期后在原公开帖下回访；原帖改为私密或删除时停止公开回访。</p>}
    </section>
    {error && <div className="qa-error" role="alert"><p>{error}</p>{retryPayload.current && <button type="button" disabled={Boolean(busy)} onClick={() => execute(retryPayload.current)}>{retryPayload.current.savedComment ? '评论已保存，重试小助手回复' : '重试此请求'}</button>}</div>}
    {notice && <p className="qa-notice" role="status"><Check size={16}/>{notice}</p>}
    {mode === 'chat' && <div className="qa-chat-history">{chatJobs.map(job => <article className="qa-chat-turn" key={job.id}><p className="qa-user-question">{job.prompt}</p><div className="qa-chat-answer"><ReviewSystemAvatar/><div><p className="qa-answer">{job.text || QUOTE_ASSISTANT_STATUSES[job.status]}</p><Sources sources={job.sources} onOpenPost={onOpenPost}/>{job.status === 'failed' && <button type="button" className="qa-secondary" disabled={Boolean(busy)} onClick={() => retryJob(job)}>重试回答</button>}</div></div></article>)}</div>}
    {result && mode !== 'chat' && jobCard(result)}
    <section className="qa-history">{preview && typeof api.simulateDue==='function' && <button type="button" className="qa-secondary" disabled={Boolean(busy)} onClick={()=>act('simulate',()=>api.simulateDue(userId),async()=>{const next=await api.state(userId);if(owner.current.userId===userId)setState(next);})}>模拟定时任务到期（仅本地）</button>}{(state.subscriptions || []).filter(row => row.active !== false).map(subscription => <div className="qa-memory" key={subscription.id}><div><strong>{label(subscription.kind)} · 自动草稿</strong><p className="qa-meta">下次：{new Date(subscription.dueAt).toLocaleString()}</p></div><button type="button" disabled={Boolean(busy)} onClick={() => act(`subscription:${subscription.id}`, () => api.cancelSubscription({id:subscription.id,revision:subscription.revision},userId), async () => { const next = await api.state(userId); if(owner.current.userId!==userId)return; setState(next); setNotice('已关闭自动生成，已有草稿保留。'); })}>关闭</button></div>)}<button type="button" className="qa-section-toggle" aria-expanded={historyOpen} onClick={() => setHistoryOpen(value => !value)}>任务记录<span>{tasks.length}</span></button>{historyOpen && (tasks.length ? tasks.map(jobCard) : <p className="qa-empty">还没有任务记录。</p>)}</section>
    <section className="qa-memories"><div className="qa-section-title"><h2>我的记忆</h2><button type="button" role="switch" aria-label="自动记忆" aria-checked={state.memoryEnabled!==false} disabled={loading||Boolean(busy)} onClick={()=>act('memory-preferences',()=>api.memoryPreferences({enabled:state.memoryEnabled===false},userId),value=>{setState(old=>({...old,memoryEnabled:value.enabled}));setNotice(value.enabled?'已恢复自动记忆。':'已暂停记忆，本人的私密对话也会暂停使用已有记忆。');})}>{state.memoryEnabled===false?'已暂停':'自动记忆开启'}</button></div><p className="qa-description">Quote 会记住对你有帮助的信息，你随时可以管理。个人记忆仅用于你的私密对话。</p>{state.memories.map(memory => <div className="qa-memory" key={memory.id}><p>{memory.text}</p><div className="qa-memory-actions"><button type="button" disabled={Boolean(busy)} onClick={()=>{setEditingMemory(memory);setMemoryText(memory.text);}}>纠正</button><button type="button" aria-label={`删除记忆：${memory.text}`} disabled={Boolean(busy)} onClick={() => deleteMemory(memory)}><Trash2 size={16}/></button></div></div>)}
      <label className="qa-field">{editingMemory?'纠正这条记忆':'补充一条记忆（选填）'}<textarea rows={2} maxLength={1000} value={memoryText} disabled={Boolean(busy)} onChange={event => setMemoryText(event.target.value)} placeholder="例如：复盘时优先帮我检查是否遵守了原计划"/></label>
      <button type="button" className="qa-secondary" disabled={loading || Boolean(busy) || !memoryText.trim()} onClick={saveMemory}>{editingMemory?'保存修改':'补充记忆'}</button>{editingMemory&&<button type="button" className="qa-section-toggle" disabled={Boolean(busy)} onClick={()=>{setEditingMemory(null);setMemoryText('');}}>取消修改</button>}
    </section>
    {confirmPublish && (Dialog ? <Dialog title="确认公开这条内容？" onClose={() => { if (!busy) setConfirmPublish(null); }}><div className="rj-dialog-body qa-publish-body"><p className="qa-answer">{confirmPublish.text}</p><Sources sources={confirmPublish.sources} onOpenPost={onOpenPost}/><p className="qa-description">将以 Quote 小助手身份发布。请检查上方正文中将公开的内容。</p><div className="qa-confirm-actions"><button type="button" disabled={Boolean(busy)} onClick={() => setConfirmPublish(null)}>返回检查</button><button type="button" className="qa-primary" disabled={Boolean(busy)} onClick={() => publish(confirmPublish)}>{busy ? '正在发布…' : '确认公开发布'}</button></div></div></Dialog> : <div className="qa-confirm" role="dialog" aria-modal="true" aria-labelledby="qa-publish-title"><div><h2 id="qa-publish-title">确认公开这条内容？</h2><p className="qa-answer">{confirmPublish.text}</p><Sources sources={confirmPublish.sources} onOpenPost={onOpenPost}/><p className="qa-description">将以 Quote 小助手身份发布。请检查上方正文中将公开的内容。</p><div className="qa-confirm-actions"><button type="button" disabled={Boolean(busy)} onClick={() => setConfirmPublish(null)}>返回检查</button><button type="button" className="qa-primary" disabled={Boolean(busy)} onClick={() => publish(confirmPublish)}>{busy ? '正在发布…' : '确认公开发布'}</button></div></div></div>)}
  </section>;
}
