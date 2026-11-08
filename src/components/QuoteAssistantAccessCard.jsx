import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { QUOTE_ACCESS_SCOPES, normalizeQuoteAccessState, quoteAccessGrantInput, quoteAccessRequestsForView } from '../lib/quoteAssistantAccess.js';
import './QuoteAssistantAccessCard.css';

export function QuoteAssistantAccessCard({ request, language = 'zh', busy = '', error = '', onGrant, onRevoke }) {
  const english = language.startsWith('en');
  const [expanded, setExpanded] = useState(false);
  const [scopes, setScopes] = useState(request.scopes);
  const [rangeStart, setRangeStart] = useState(request.rangeStart), [rangeEnd, setRangeEnd] = useState(request.rangeEnd);
  const publicAnalysis = request.outputVisibility === 'public';
  const consumed = request.status === 'consumed';
  const granted = request.status === 'granted' || busy === 'grant';
  const expired = Date.parse(request.expiresAt) <= Date.now();
  const invalid = !scopes.length || !rangeStart || !rangeEnd || rangeStart > rangeEnd || rangeStart < request.rangeStart || rangeEnd > request.rangeEnd;
  const scopeLabels = QUOTE_ACCESS_SCOPES.filter(scope => scopes.includes(scope.id)).map(scope => english ? scope.english : scope.label).join(english ? ', ' : '、');
  return <section className={`qa-access-card${consumed ? ' qa-access-finished' : ''}`} aria-label={english ? 'Account access permission' : '账户数据授权'}>
    <div className="qa-access-heading">{consumed ? <Check size={18}/> : <ShieldCheck size={19}/>}<h3>{consumed ? english ? 'This analysis is complete' : '本次分析已完成' : english ? 'Allow this analysis' : '授权本次分析'}</h3><span>{english ? 'One time' : '仅本次'}</span></div>
    {!consumed && <>
      <p className="qa-access-reason">{request.reason}</p>
      <div className="qa-access-summary"><span>{scopeLabels || (english ? 'Select data' : '请选择数据')}</span><span>{rangeStart} — {rangeEnd}</span></div>
      <p className="qa-access-visibility">{publicAnalysis
        ? english ? 'Quote will read the selected data and publicly analyze it in this thread. Relevant figures may appear in the reply.' : 'Quote 将读取所选数据，在本帖公开分析；回复可能包含相关账户数字。'
        : english ? 'Quote will read the selected data. The analysis is visible only to you.' : 'Quote 将读取所选数据，分析结果仅自己可见。'}</p>
      {!granted && <button type="button" className="qa-access-disclosure" aria-expanded={expanded} disabled={Boolean(busy) || expired} onClick={() => setExpanded(value => !value)}>{english ? 'Adjust data and dates' : '调整数据与日期'}<ChevronDown size={15}/></button>}
      {expanded && !granted && <div className="qa-access-options">
        <fieldset disabled={Boolean(busy) || expired}><legend>{english ? 'Data to read' : '读取范围'}</legend><div className="qa-access-scopes">{QUOTE_ACCESS_SCOPES.filter(scope => request.scopes.includes(scope.id)).map(scope => <label key={scope.id}><input type="checkbox" checked={scopes.includes(scope.id)} onChange={event => setScopes(old => event.target.checked ? [...old, scope.id] : old.filter(value => value !== scope.id))}/>{english ? scope.english : scope.label}</label>)}</div></fieldset>
        <div className="qa-access-dates"><label>{english ? 'Start date' : '开始日期'}<input type="date" value={rangeStart} min={request.rangeStart} max={rangeEnd || request.rangeEnd} disabled={Boolean(busy) || expired} onChange={event => setRangeStart(event.target.value)}/></label><label>{english ? 'End date' : '结束日期'}<input type="date" value={rangeEnd} min={rangeStart || request.rangeStart} max={request.rangeEnd} disabled={Boolean(busy) || expired} onChange={event => setRangeEnd(event.target.value)}/></label></div>
      </div>}
      <p className="qa-access-note"><LockKeyhole size={13}/>{english ? 'Read only · Your account · Expires within 24 hours' : '只读本人数据 · 24 小时内有效 · 可撤销'}</p>
    </>}
    {error && <p className="qa-access-error" role="alert">{error}</p>}
    {expired && !consumed ? <p className="qa-access-error" role="status">{english ? 'This request has expired. Ask Quote again to request access.' : '这次请求已过期，可重新向 Quote 提问。'}</p> : <div className="qa-access-actions">
      {!consumed && <button type="button" className="qa-access-confirm" disabled={Boolean(busy) || invalid} onClick={() => onGrant({ scopes, rangeStart, rangeEnd })}>{busy === 'grant' ? <><Loader2 size={16} className="rj-spin"/>{english ? 'Analyzing…' : '正在分析…'}</> : granted ? english ? 'Continue this analysis' : '继续本次分析' : publicAnalysis ? english ? 'Allow public analysis' : '授权并公开分析' : english ? 'Allow this analysis' : '授权本次分析'}</button>}
      <button type="button" className="qa-access-revoke" disabled={busy === 'revoke'} onClick={onRevoke}>{busy === 'revoke' ? english ? 'Revoking…' : '正在撤销…' : consumed || granted ? english ? 'Revoke access' : '撤销授权' : english ? 'Not now' : '暂不授权'}</button>
    </div>}
  </section>;
}

/** No localStorage or cross-account cache. Requests are loaded only for the
 * authenticated viewer; late reads/actions cannot land in a different thread. */
export default function QuoteAssistantAccessPanel({ api, userId, postId = null, jobIds = null, refreshToken = '', language = 'zh', onCompleted }) {
  const jobKey = jobIds ? [...jobIds].sort().join('|') : '';
  const key = JSON.stringify([userId, postId, jobKey]);
  const owner = useRef(null), serial = useRef(0), operations = useRef(null);
  if (!owner.current || owner.current.key !== key || owner.current.api !== api) owner.current = { key, api };
  const [state, setState] = useState({ key: '', requests: [], error: '' });
  const [busy, setBusy] = useState(null), [failure, setFailure] = useState(null), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const scope = owner.current, ticket = ++serial.current;
    if (!userId || typeof api?.accessState !== 'function' || !postId && !jobIds?.length) return undefined;
    let active = true;
    Promise.resolve().then(() => api.accessState(postId ? { postId } : {}, userId)).then(value => {
      if (!active || owner.current !== scope || ticket !== serial.current) return;
      const result = normalizeQuoteAccessState(value, userId);
      setState({ key, ...result, error: '' });
    }).catch(error => {
      if (active && owner.current === scope && ticket === serial.current) setState({ key, requests: [], error: error?.message || '授权状态暂未读取，请重试。' });
    });
    return () => { active = false; };
  }, [api, userId, key, refreshToken, attempt]);
  useEffect(() => { const scope = owner.current; return () => { if (owner.current === scope) owner.current = null; }; }, [key, api]);
  const perform = async (request, action, selection) => {
    const scope = owner.current;
    if (!scope || scope.key !== key || request.ownerId !== userId || operations.current?.scope === scope && action !== 'revoke') return;
    const operation = { scope, id: request.id, action }; operations.current = operation;
    setBusy({ key, id: request.id, action }); setFailure(null);
    const current = () => owner.current === scope && operations.current === operation;
    try {
      const result = action === 'grant' ? await api.grantAccess(quoteAccessGrantInput(request, selection), userId) : await api.revokeAccess({ id: request.id }, userId);
      if (!current()) return;
      const job = result?.job || result;
      if (action === 'grant' && job?.status === 'failed') setFailure({ key, id: request.id, text: job.errorMessage || '本次分析未完成，可重试或撤销授权。' });
      setAttempt(value => value + 1);
      onCompleted?.(result);
    } catch (error) {
      if (current()) { setFailure({ key, id: request.id, text: error?.message || '操作未完成，请重试。' }); setAttempt(value => value + 1); }
    } finally {
      if (current()) { operations.current = null; setBusy(null); }
    }
  };
  if (state.key !== key) return null;
  const requests = quoteAccessRequestsForView(state, { userId, postId, jobIds });
  if (!state.error && !requests.length) return null;
  return <div className="qa-access-panel">{state.error && <div className="qa-access-load-error" role="alert"><span>{state.error}</span><button type="button" onClick={() => setAttempt(value => value + 1)}>{language.startsWith('en') ? 'Retry' : '重试'}</button></div>}{requests.map(request => <QuoteAssistantAccessCard key={`${userId}:${request.id}:${request.status}`} request={request} language={language}
    busy={busy?.key === key && busy.id === request.id ? busy.action : ''} error={failure?.key === key && failure.id === request.id ? failure.text : ''}
    onGrant={selection => perform(request, 'grant', selection)} onRevoke={() => perform(request, 'revoke')}/>)}</div>;
}
