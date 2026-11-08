import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAssistantHandler, buildAssistantJobInput } from '../server/assistant/handler.js';
import { createAssistantRepository, assistantIdentityId } from '../server/assistant/repository.js';

const USER = '10000000-0000-4000-8000-000000000001';
const OTHER = '20000000-0000-4000-8000-000000000001';
const JOB = '30000000-0000-4000-8000-000000000001';
const res = () => ({ headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
  status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; }, end() { this.ended = true; return this; } });
const req = body => ({ method: 'POST', headers: { host: 'boduan-tracker.vercel.app', origin: 'https://boduan-tracker.vercel.app',
  authorization: 'Bearer user-token', 'content-type': 'application/json' }, query: { view: 'assistant' }, body: { expectedUserId: USER, ...body } });
const env = { OPENAI_API_KEY: 'server-secret-for-test', CRON_SECRET: 'cron-secret-for-test', SUPABASE_URL: 'https://supabase.test',
  SUPABASE_ANON_KEY: 'anon-test', SUPABASE_SERVICE_ROLE_KEY: 'service-test' };
function setup({ user = { id: USER }, configuration = env, state = { assistant: { authorId: OTHER }, jobs: [] } } = {}) {
  const calls = [];
  const repository = { user: async (action, payload) => { calls.push({ scope: 'user', action, payload }); return action === 'state' ? state : { id: payload.id, status: 'pending' }; },
    admin: async (action, payload) => { calls.push({ scope: 'admin', action, payload }); return action === 'due' ? { jobs: [{ id: JOB }] } : { id: payload.id, status: 'published' }; },
    initialize: async () => { calls.push({ action: 'initialize' }); return { authorId: OTHER }; } };
  const handler = createAssistantHandler({ env: configuration, authenticate: async token => { calls.push({ action: 'authenticate', token }); return { ok: true, user }; },
    repositoryFactory: args => { calls.push({ action: 'repository', args }); return repository; },
    runJob: async args => { calls.push({ action: 'run', id: args.id }); return { id: args.id, status: 'draft' }; } });
  return { handler, calls };
}

test('assistant requires explicit bearer and origin even when quote bypass would allow requests', async () => {
  for (const altered of [{ authorization: '' }, { origin: 'https://evil.test' }, { origin: undefined }]) {
    const { handler, calls } = setup(); const request = req({ action: 'state' }); Object.assign(request.headers, altered); const response = res();
    await handler(request, response);
    assert.ok([401, 403].includes(response.statusCode));
    assert.equal(calls.length, 0);
    assert.match(response.headers['cache-control'], /private, no-store/);
  }
});

test('assistant rejects switched user before any RPC', async () => {
  const { handler, calls } = setup(); const response = res();
  await handler(req({ action: 'publish', expectedUserId: OTHER, id: JOB, revision: 1 }), response);
  assert.equal(response.statusCode, 403); assert.equal(calls.length, 1);
});

test('assistant state exposes capability and key presence only, never credentials', async () => {
  const { handler } = setup(); const response = res();
  await handler(req({ action: 'state' }), response);
  assert.equal(response.body.data.configured, true); assert.equal(response.body.data.canConfigure, false);
  assert.equal(response.body.data.capabilities.chat, true);
  assert.ok(!JSON.stringify(response.body).includes(env.OPENAI_API_KEY));
});

test('assistant missing provider fails before creating a job and never returns a canned answer', async () => {
  const { handler, calls } = setup({ configuration: { ...env, OPENAI_API_KEY: '' } }); const response = res();
  await handler(req({ action: 'run', kind: 'chat', requestId: JOB, prompt: '你好' }), response);
  assert.equal(response.statusCode, 503); assert.equal(response.body.code, 'ASSISTANT_NOT_CONFIGURED');
  assert.equal(calls.filter(call => call.scope).length, 0); assert.equal(response.body.data, undefined);
});

test('assistant create payload drops forged owner, model, account and author fields', async () => {
  const { handler, calls } = setup(); const response = res();
  await handler(req({ action: 'run', kind: 'chat', requestId: JOB, prompt: '你好', ownerId: OTHER,
    authorId: OTHER, model: 'fake', account: { balance: 123 }, autoPublish: true }), response);
  assert.equal(response.statusCode, 200);
  const create = calls.find(call => call.scope === 'user');
  assert.deepEqual(create.payload, { id: JOB, kind: 'chat', prompt: '你好', sessionId: JOB, autoPublish: false, shareConfirmed: false });
  assert.equal(calls.find(call => call.action === 'repository').args.userId, USER);
});

test('assistant publish always binds owner to validated identity', async () => {
  const { handler, calls } = setup(); const response = res();
  await handler(req({ action: 'publish', id: JOB, revision: 3, ownerId: OTHER }), response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls.find(call => call.scope === 'admin').payload, { id: JOB, ownerId: USER, revision: 3 });
});

test('saved mentions and structured draft scenes do not require duplicated prompt text', () => {
  for (const kind of ['reply', 'daily-review', 'weekly-digest', 'milestone']) {
    assert.equal(buildAssistantJobInput({ kind, requestId: JOB }).prompt, '');
  }
  for (const kind of ['chat', 'followup']) {
    assert.throws(() => buildAssistantJobInput({ kind, requestId: JOB }));
    assert.throws(() => buildAssistantJobInput({ kind, requestId: JOB, prompt: '  ' }));
  }
});

test('only established invite admin may initialize the assistant identity', async () => {
  for (const [email, allowed] of [['someone@example.test', false], ['chenshuai1190@gmail.com', true]]) {
    const { handler, calls } = setup({ user: { id: USER, email } }); const response = res();
    await handler(req({ action: 'configure' }), response);
    assert.equal(response.statusCode, allowed ? 200 : 403);
    assert.equal(calls.some(call => call.action === 'initialize'), allowed);
  }
});

test('scheduled followup creates queued work without immediate model execution', async () => {
  const { handler, calls } = setup(); const response = res();
  await handler(req({ action: 'schedule', kind: 'followup', requestId: JOB, postId: 'log:one', prompt: '回访', dueAt: '2027-01-01T01:00:00Z' }), response);
  assert.equal(response.statusCode, 200); assert.equal(calls.some(call => call.action === 'run'), false);
  assert.equal(calls.find(call => call.action === 'create').payload.autoPublish, true);
});

test('recurring daily and weekly are draft-only, invalid recurrence fails', () => {
  const input = { requestId: JOB, prompt: '复盘', dueAt: '2027-01-01T01:00:00Z', autoPublish: true };
  assert.equal(buildAssistantJobInput({ ...input, kind: 'daily-review', recurrence: 'daily' }, true).autoPublish, false);
  assert.equal(buildAssistantJobInput({ ...input, kind: 'weekly-digest', recurrence: 'weekly' }, true).recurrence, 'weekly');
  assert.throws(() => buildAssistantJobInput({ ...input, kind: 'chat', recurrence: 'daily' }, true));
});

test('cron always verifies its secret and processes no more than one due job', async () => {
  const { handler, calls } = setup(); const request = { method: 'GET', headers: { authorization: `Bearer ${env.CRON_SECRET}` }, query: { operation: 'assistant-cron' } }; const response = res();
  await handler(request, response);
  assert.equal(response.statusCode, 200); assert.equal(response.body.data.processed, 1);
  assert.deepEqual(calls.find(call => call.action === 'due').payload, { limit: 1 });
  const wrong = res(); await handler({ ...request, headers: { authorization: 'Bearer user-token' } }, wrong);
  assert.equal(wrong.statusCode, 401);
});

test('cron without provider configuration defers without claiming or failing work', async () => {
  const { handler, calls } = setup({ configuration: { ...env, OPENAI_API_KEY: '' } }); const response = res();
  await handler({ method: 'GET', headers: { authorization: `Bearer ${env.CRON_SECRET}` }, query: { operation: 'assistant-cron' } }, response);
  assert.equal(response.statusCode, 200); assert.equal(response.body.data.deferred, true); assert.equal(calls.length, 0);
});

test('assistant rejects oversized body, invalid IDs and unknown actions', async () => {
  const { handler } = setup();
  for (const body of [{ action: 'state', padding: 'x'.repeat(25000) }, { action: 'publish', id: 'other', revision: 1 }, { action: 'execute-sql' }]) {
    const response = res(); await handler(req(body), response); assert.ok(response.statusCode >= 400);
  }
});

test('service credentials are confined to backend RPCs; original token used for user RPC', async () => {
  const calls = [];
  const repository = createAssistantRepository({ env, token: 'jwt-user', userId: USER, fetchImpl: async (url, options) => {
    calls.push({ url, options }); return { ok: true, json: async () => ({}) };
  } });
  await repository.user('state'); await repository.admin('claim', { id: JOB });
  assert.equal(calls[0].options.headers.Authorization, 'Bearer jwt-user');
  assert.equal(JSON.parse(calls[0].options.body).p_expected_user_id, USER);
  assert.equal(calls[1].options.headers.Authorization, `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
});

test('bot initialization uses stable exact identity and resumes after interrupted configure without listing users', async () => {
  const id = assistantIdentityId(env.SUPABASE_URL); const calls = [];
  const account = { id, email: 'quote-assistant@system.invalid', app_metadata: { quote_assistant: true }, banned_until: '2126-01-01T00:00:00Z' };
  const repository = createAssistantRepository({ env, token: 'jwt-user', userId: USER, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/quote_assistant_user')) return { ok: true, json: async () => ({ assistant: null }) };
    if (url.endsWith(`/admin/users/${id}`)) return { ok: true, json: async () => account };
    return { ok: true, json: async () => ({ authorId: id }) };
  } });
  assert.deepEqual(await repository.initialize(), { authorId: id });
  assert.equal(calls.filter(call => call.url.includes('/admin/users')).length, 1);
  assert.equal(calls[1].options.method, 'GET');
  assert.ok(calls.every(call => !call.url.includes('?')));
});

test('assistant route and cron reuse quote function, keeping exactly twelve functions', () => {
  const files = fs.readdirSync(new URL('../api/', import.meta.url)).filter(file => file.endsWith('.js'));
  assert.equal(files.length, 12);
  const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.rewrites.find(item => item.source === '/api/quote-assistant'), { source: '/api/quote-assistant', destination: '/api/quote?view=assistant' });
  assert.equal(config.crons.find(item => item.path === '/api/quote-assistant-cron').schedule, '*/15 * * * *');
});
