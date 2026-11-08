import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { normalizeQuoteAccessState, quoteAccessGrantInput, quoteAccessRequestsForView } from '../src/lib/quoteAssistantAccess.js';
import { createQuoteAssistantRepository } from '../src/lib/quoteAssistantRepository.js';

const request = extra => ({ id: 'request-one', ownerId: 'owner', jobId: 'job-one', postId: 'log:one', status: 'pending',
  scopes: ['report', 'trades', 'holdings'], rangeStart: '2026-10-01', rangeEnd: '2026-10-31',
  reason: '需要核对这段时间的交易和仓位，才能进一步分析回撤原因。', outputVisibility: 'public', expiresAt: '2099-01-01T00:00:00Z', ...extra });
const source = readFileSync(new URL('../src/components/QuoteAssistantAccessCard.jsx', import.meta.url), 'utf8');
const walk = value => !React.isValidElement(value) ? Array.isArray(value) ? value.flatMap(walk) : [] : [value, ...walk(value.props.children)];
const words = value => typeof value === 'boolean' ? '' : !React.isValidElement(value) ? Array.isArray(value) ? value.map(words).join('') : String(value ?? '') : words(value.props.children);
const button = (tree, text) => walk(tree).find(node => node.type === 'button' && words(node) === text);
const flush = () => new Promise(resolve => setImmediate(resolve));
let nextFixture = 0;
async function harness(kind, initialProps) {
  let cursor = 0, effects = []; const slots = [];
  const fixture = {
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useEffect(effect, deps) { const index = cursor++, previous = slots[index]; if (previous && deps.every((value, n) => Object.is(value, previous.deps[n]))) return; previous?.cleanup?.(); const slot = { deps }; slots[index] = slot; effects.push(() => { slot.cleanup = effect(); }); },
  };
  const id = `__quoteAccessUI${++nextFixture}`; globalThis[id] = fixture;
  let module;
  try {
    const compiled = await transformWithOxc(`import React from ${JSON.stringify(import.meta.resolve('react'))};
      import {Check,ChevronDown,Loader2,LockKeyhole,ShieldCheck} from ${JSON.stringify(import.meta.resolve('lucide-react'))};
      import {QUOTE_ACCESS_SCOPES,normalizeQuoteAccessState,quoteAccessGrantInput,quoteAccessRequestsForView} from ${JSON.stringify(new URL('../src/lib/quoteAssistantAccess.js', import.meta.url).href)};
      const {useEffect,useRef,useState}=globalThis[${JSON.stringify(id)}];
      ${source.slice(source.indexOf('export function QuoteAssistantAccessCard'))}`, 'QuoteAccessUITest.jsx', { jsx: { runtime: 'classic' } });
    module = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
  } finally { delete globalThis[id]; }
  const props = { ...initialProps }, Component = kind === 'card' ? module.QuoteAssistantAccessCard : module.default;
  return { props, Card: module.QuoteAssistantAccessCard, render() { cursor = 0; effects = []; const tree = Component(props); effects.forEach(effect => effect()); return tree; }, async load() { this.render(); await flush(); return this.render(); }, unmount() { slots.forEach(slot => slot?.cleanup?.()); } };
}

test('access presentation filters other users and keeps public thread separate from private chat', () => {
  const publicRequest = request(), other = request({ id: 'other', ownerId: 'someone-else' }), privateRequest = request({ id: 'private', postId: null, jobId: 'chat-one', outputVisibility: 'private' });
  const state = normalizeQuoteAccessState({ requests: [publicRequest, other, privateRequest] }, 'owner');
  assert.deepEqual(state.requests.map(row => row.id), ['request-one', 'private']);
  assert.deepEqual(quoteAccessRequestsForView(state, { userId: 'owner', postId: 'log:one' }).map(row => row.id), ['request-one']);
  assert.deepEqual(quoteAccessRequestsForView(state, { userId: 'owner', jobIds: ['chat-one'] }).map(row => row.id), ['private']);
  assert.deepEqual(quoteAccessRequestsForView(state, { userId: 'owner', jobIds: ['another-session'] }), []);
});

test('one-time grant restricts scope and dates and carries deliberate public permission', () => {
  const selection = { scopes: ['report'], rangeStart: '2026-10-15', rangeEnd: '2026-10-31' };
  assert.deepEqual(quoteAccessGrantInput(request(), selection), { id: 'request-one', ...selection, publicAnalysisConfirmed: true });
  assert.equal(quoteAccessGrantInput(request({ outputVisibility: 'private' }), selection).publicAnalysisConfirmed, false);
  for (const value of [{ ...selection, scopes: [] }, { ...selection, scopes: ['secret'] }, { ...selection, rangeStart: '2026-09-30' }, { ...selection, rangeEnd: '2026-11-01' }, { ...selection, rangeStart: '2026-02-30' }]) assert.throws(() => quoteAccessGrantInput(request(), value));
  assert.throws(() => quoteAccessGrantInput(request({ status: 'revoked' }), selection));
  assert.throws(() => quoteAccessGrantInput(request({ expiresAt: '2020-01-01T00:00:00Z' }), selection));
});

test('authorization card is explicit, adjustable and cannot grant just by rendering', async () => {
  const calls = []; const h = await harness('card', { request: request(), onGrant: value => calls.push(value), onRevoke() {} });
  let tree = h.render(); assert.equal(calls.length, 0);
  assert.match(words(tree), /本帖公开分析/); assert.match(words(tree), /只读本人数据/); assert.match(words(tree), /24 小时/);
  button(tree, '调整数据与日期').props.onClick(); tree = h.render();
  const checks = walk(tree).filter(node => node.type === 'input' && node.props.type === 'checkbox');
  checks[1].props.onChange({ target: { checked: false } }); checks[2].props.onChange({ target: { checked: false } }); tree = h.render();
  button(tree, '授权并公开分析').props.onClick(); assert.deepEqual(calls[0].scopes, ['report']);
  h.unmount();
  const privateCard = await harness('card', { request: request({ outputVisibility: 'private' }) });
  assert.match(words(privateCard.render()), /仅自己可见/); assert.ok(button(privateCard.render(), '授权本次分析')); privateCard.unmount();
});

test('panel loads private requests without granting, reloads after completed reply and filters late account reads', async () => {
  let resolve; const calls = [];
  const api = { accessState: async (...args) => { calls.push(args); return { requests: [request()] }; } };
  const h = await harness('panel', { api, userId: 'owner', postId: 'log:one', refreshToken: 0 });
  let tree = await h.load(); assert.equal(calls.length, 1); assert.ok(walk(tree).find(node => node.type === h.Card));
  h.props.refreshToken = 1; h.render(); await flush(); h.render(); assert.equal(calls.length, 2);
  h.props.api = { accessState: () => new Promise(done => { resolve = done; }) }; h.props.refreshToken = 2; h.render(); await flush();
  h.props.userId = 'other'; assert.equal(h.render(), null); resolve({ requests: [request()] }); await flush();
  assert.equal(h.render(), null); h.unmount();
});

test('revocation is available during analysis and late analysis cannot update the conversation', async () => {
  let resolveGrant; let state = request(); const events = [], completions = [];
  const api = { accessState: async () => ({ requests: [state] }), grantAccess: payload => { events.push(['grant', payload]); return new Promise(resolve => { resolveGrant = resolve; }); }, revokeAccess: async payload => { events.push(['revoke', payload]); state = { ...state, status: 'revoked' }; return { id: state.id, status: 'revoked' }; } };
  const h = await harness('panel', { api, userId: 'owner', postId: 'log:one', onCompleted: value => completions.push(value) });
  let tree = await h.load(); let card = walk(tree).find(node => node.type === h.Card);
  void card.props.onGrant({ scopes: ['report'], rangeStart: state.rangeStart, rangeEnd: state.rangeEnd });
  tree = h.render(); card = walk(tree).find(node => node.type === h.Card); assert.equal(card.props.busy, 'grant');
  await card.props.onRevoke(); h.render(); await flush(); assert.equal(h.render(), null);
  resolveGrant({ status: 'published', text: 'late data analysis' }); await flush();
  assert.deepEqual(events.map(value => value[0]), ['grant', 'revoke']); assert.equal(completions.length, 1); assert.equal(completions[0].status, 'revoked'); h.unmount();
});

test('grant failure stays visible and never masquerades as completed analysis', async () => {
  const h = await harness('panel', { api: { accessState: async () => ({ requests: [request()] }), grantAccess: async () => ({ id: 'analysis', status: 'failed', errorMessage: '模型暂时不可用' }) }, userId: 'owner', postId: 'log:one' });
  let tree = await h.load(); await walk(tree).find(node => node.type === h.Card).props.onGrant({ scopes: ['report'], rangeStart: '2026-10-01', rangeEnd: '2026-10-31' });
  tree = h.render(); assert.equal(walk(tree).find(node => node.type === h.Card).props.error, '模型暂时不可用'); h.unmount();
});

test('access client uses authenticated no-store actions and cannot replace expected owner', async () => {
  const calls = []; const client = { auth: { onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; }, async getSession() { return { data: { session: { user: { id: 'owner' }, access_token: 'test-only' } } }; } } };
  const api = createQuoteAssistantRepository(client, { fetchImpl: async (_, options) => { calls.push(options); return { ok: true, json: async () => ({ success: true, data: { requests: [request()] } }) }; } });
  await api.accessState({ postId: 'log:one' }, 'owner');
  await api.grantAccess({ id: 'request-one', action: 'configure', expectedUserId: 'other' }, 'owner');
  await api.revokeAccess({ id: 'request-one' }, 'owner');
  assert.deepEqual(calls.map(call => JSON.parse(call.body).action), ['access-state', 'access-grant', 'access-revoke']);
  assert.ok(calls.every(call => call.cache === 'no-store' && JSON.parse(call.body).expectedUserId === 'owner'));
});
