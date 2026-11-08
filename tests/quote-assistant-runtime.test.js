import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAssistantResponse, extractAssistantMemories } from '../server/assistant/provider.js';
import { buildAssistantContext, createAssistantTools, runAssistantJob } from '../server/assistant/runtime.js';
import { projectAssistantMarketClose, nextAssistantDailyRun } from '../server/assistant/market.js';
import { AssistantError } from '../server/assistant/errors.js';

const env = { OPENAI_API_KEY: 'model-secret-for-test', QUOTE_ASSISTANT_MODEL: 'gpt-6.1-sol' };
const response = (output, extra = {}) => ({ ok: true, status: 200, text: async () => JSON.stringify({ status: 'completed', output, ...extra }) });
const message = text => ({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] });

test('Responses loop preserves complete tool output order and never enables server storage', async () => {
  const requests = [];
  const reasoning = { type: 'reasoning', id: 'r1', encrypted_content: 'encrypted' };
  const call = { type: 'function_call', name: 'read', call_id: 'call1', arguments: '{"id":"a"}' };
  const tool = { definition: { type: 'function', name: 'read', parameters: {} }, execute: async () => ({ number: 9, sources: [{ id: 'source-a' }] }) };
  const generated = await generateAssistantResponse({ env, context: { question: 'test' }, tools: [tool], fetchImpl: async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return requests.length === 1 ? response([reasoning, call]) : response([message('核对完成')]);
  } });
  assert.equal(generated.text, '核对完成'); assert.equal(generated.sources[0].id, 'source-a');
  assert.ok(requests.every(item => item.url === 'https://api.openai.com/v1/responses' && item.body.store === false));
  assert.ok(requests.every(item => item.body.include.includes('reasoning.encrypted_content')));
  assert.ok(requests.every(item => item.body.reasoning.effort === 'low'));
  assert.deepEqual(requests[1].body.input.slice(1, 3), [reasoning, call]);
  assert.equal(requests[1].body.input[3].call_id, 'call1');
  assert.ok(requests.every(item => !item.options.body.includes(env.OPENAI_API_KEY)));
});

test('model cannot execute undeclared tool, malformed arguments or publish', async () => {
  for (const call of [
    { name: 'publish', arguments: '{}' },
    { name: 'read', arguments: 'not json' },
  ]) {
    let executed = false;
    await assert.rejects(generateAssistantResponse({ env, context: {}, tools: [{ definition: { name: 'read' }, execute: async () => { executed = true; } }],
      fetchImpl: async () => response([{ type: 'function_call', call_id: 'c1', ...call }]) }), error => error.code === 'ASSISTANT_INVALID_TOOL');
    assert.equal(executed, false);
  }
});

test('missing key, provider rejection and incomplete output never produce a fake answer', async () => {
  await assert.rejects(generateAssistantResponse({ env: {}, context: {}, fetchImpl: async () => { throw new Error('network must not run'); } }), error => error.code === 'ASSISTANT_NOT_CONFIGURED');
  await assert.rejects(generateAssistantResponse({ env, context: {}, fetchImpl: async () => ({ ok: false, status: 429, text: async () => 'private error secret' }) }), error => error.code === 'ASSISTANT_RATE_LIMITED' && !error.message.includes('secret'));
  await assert.rejects(generateAssistantResponse({ env, context: {}, fetchImpl: async () => response([message('partial')], { status: 'incomplete' }) }), error => error.code === 'ASSISTANT_INCOMPLETE');
});

test('provider quota exhaustion is distinct from busy rate limits without relaying provider messages', async () => {
  for (const [code, expected, status] of [
    ['insufficient_quota', 'ASSISTANT_QUOTA_EXHAUSTED', 503],
    ['rate_limit_exceeded', 'ASSISTANT_RATE_LIMITED', 429],
    ['unrecognized_private_error', 'ASSISTANT_RATE_LIMITED', 429],
  ]) {
    await assert.rejects(generateAssistantResponse({ env, context: {}, fetchImpl: async () => new Response(
      JSON.stringify({ error: { code, message: 'private upstream secret' } }), { status: 429 }),
    }), error => error.code === expected && error.status === status && !error.message.includes('secret') && !error.message.includes('upstream'));
  }
});

test('oversized upstream errors are bounded and never used for quota classification', async () => {
  let cancelled = false;
  const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(8193)); }, cancel() { cancelled = true; } });
  await assert.rejects(generateAssistantResponse({ env, context: {}, fetchImpl: async () => new Response(body, { status: 429 }) }), error => error.code === 'ASSISTANT_RATE_LIMITED');
  assert.equal(cancelled, true);
});

test('model tool loop has four rounds and fails when provider ignores tool_choice none', async () => {
  let count = 0;
  await assert.rejects(generateAssistantResponse({ env, context: {}, tools: [{ definition: { name: 'read' }, execute: async () => ({}) }],
    fetchImpl: async () => response([{ type: 'function_call', call_id: `c${count++}`, name: 'read', arguments: '{}' }]) }), error => error.code === 'ASSISTANT_TOOL_LIMIT');
  assert.equal(count, 5);
});

test('request cancellation stops waiting for an existing shared market read', async () => {
  const controller = new AbortController();
  const tool = { definition: { name: 'read' }, execute: async () => {
    controller.abort(new DOMException('cancelled', 'AbortError'));
    return new Promise(() => {});
  } };
  await assert.rejects(generateAssistantResponse({ env, context: {}, signal: controller.signal, tools: [tool],
    fetchImpl: async () => response([{ type: 'function_call', call_id: 'c1', name: 'read', arguments: '{}' }]) }), error => error.name === 'AbortError');
});

test('public generation strips private memories even if a malformed context supplies them', () => {
  const supplied = { job: { kind: 'reply', prompt: '问题' }, memories: [{ text: 'private-secret' }], history: [] };
  assert.deepEqual(buildAssistantContext(supplied).memories, []);
  assert.deepEqual(buildAssistantContext({ ...supplied, job: { ...supplied.job, kind: 'chat' } }).memories, ['private-secret']);
});

test('read tools only access provided public IDs and reject extra query fields', async () => {
  const tools = createAssistantTools({ context: { post: { id: 'log:a', text: '观点', date: '2026-11-06' }, publicPosts: [] } });
  const reader = tools.find(tool => tool.definition.name === 'read_public_post');
  assert.equal((await reader.execute({ postId: 'log:private' })).available, false);
  assert.equal((await reader.execute({ postId: 'log:a' })).post.text, '观点');
  await assert.rejects(reader.execute({ postId: 'log:a', sql: 'select' }), error => error.code === 'ASSISTANT_INVALID_TOOL');
});

function marketFixture() {
  return { series: {
    SPY: { rows: [{ date: '2026-11-05', close: 100 }, { date: '2026-11-06', close: 102 }] },
    QQQ: { rows: [{ date: '2026-11-05', close: 200 }, { date: '2026-11-06', close: 198 }] },
  }, termStructure: { rows: [{ date: '2026-11-06', vix: 20, vix3m: 25, ratio: 0.8 }] } };
}

test('market projection uses exact completed same-day closes and rejects gaps, future and missing values', () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  const value = projectAssistantMarketClose(marketFixture(), '2026-11-06', now);
  assert.ok(Math.abs(value.prices.SPY.dailyReturnPct - 2) < 1e-10);
  assert.ok(Math.abs(value.prices.QQQ.dailyReturnPct + 1) < 1e-10);
  assert.equal(value.vixRatio, 0.8);
  assert.throws(() => projectAssistantMarketClose(marketFixture(), '2026-11-09', now));
  const missing = marketFixture(); missing.series.SPY.rows[0].date = '2026-11-04';
  assert.throws(() => projectAssistantMarketClose(missing, '2026-11-06', now));
  const absent = marketFixture(); absent.termStructure.rows = [];
  assert.throws(() => projectAssistantMarketClose(absent, '2026-11-06', now));
});

test('daily recurrence follows the trading calendar and New York daylight saving time', () => {
  assert.equal(nextAssistantDailyRun('2026-11-06'), '2026-11-09T22:15:00.000Z');
  assert.equal(nextAssistantDailyRun('2026-07-02'), '2026-07-06T21:15:00.000Z');
  assert.equal(nextAssistantDailyRun('2026-03-06'), '2026-03-09T21:15:00.000Z');
});

function runtimeFixture(kind = 'reply', autoPublish = false) {
  const calls = [];
  const job = { id: 'job', ownerId: 'owner', kind, prompt: '问题', autoPublish, status: 'running' };
  const repository = { admin: async (action, payload) => {
    calls.push({ action, payload });
    if (action === 'claim') return { job, leaseToken: 'lease' };
    if (action === 'context') return { job, post: { id: 'log:a', text: '原帖' }, publicPosts: [] };
    if (action === 'complete') return { ...job, status: 'draft', revision: 3 };
    if (action === 'publish') return { ...job, status: 'published', revision: 4 };
    return job;
  } };
  return { calls, repository };
}

test('draft flow completes under lease and does not publish', async () => {
  const { calls, repository } = runtimeFixture();
  const job = await runAssistantJob({ id: 'job', repository, generate: async () => ({ text: '真实模型回答' }) });
  assert.equal(job.status, 'draft'); assert.equal(calls.some(call => call.action === 'publish'), false);
  assert.deepEqual(calls.find(call => call.action === 'complete').payload, { id: 'job', leaseToken: 'lease', text: '真实模型回答' });
});

test('auto reply uses server-owned owner and completed revision for publication', async () => {
  const { calls, repository } = runtimeFixture('reply', true);
  const job = await runAssistantJob({ id: 'job', repository, generate: async () => ({ text: '回答' }) });
  assert.equal(job.status, 'published');
  assert.deepEqual(calls.find(call => call.action === 'publish').payload, { id: 'job', ownerId: 'owner', revision: 3 });
});

test('failed market or model produces failed job, not a draft or publication', async () => {
  const { calls, repository } = runtimeFixture('daily-review');
  await assert.rejects(runAssistantJob({ id: 'job', repository,
    marketClose: async () => { throw new AssistantError('ASSISTANT_MARKET_INCOMPLETE', '缺数', 503); },
    generate: async () => { throw new Error('must not generate'); } }), error => error.code === 'ASSISTANT_MARKET_INCOMPLETE');
  assert.equal(calls.some(call => call.action === 'complete' || call.action === 'publish'), false);
  assert.equal(calls.find(call => call.action === 'fail').payload.errorCode, 'ASSISTANT_MARKET_INCOMPLETE');
});

test('source revoked while generating cannot be published and output never returned as success', async () => {
  const { repository, calls } = runtimeFixture('reply', true); const original = repository.admin;
  repository.admin = async (action, payload) => {
    if (action === 'complete') throw new AssistantError('ASSISTANT_FORBIDDEN', '已撤回', 403);
    return original(action, payload);
  };
  await assert.rejects(runAssistantJob({ id: 'job', repository, generate: async () => ({ text: '旧上下文' }) }), error => error.status === 403);
  assert.equal(calls.some(call => call.action === 'publish'), false);
});

test('a valid active lease prevents duplicate generation', async () => {
  let generated = false;
  const repository = { admin: async () => ({ job: { id: 'job', status: 'running' }, leaseToken: null }) };
  const job = await runAssistantJob({ id: 'job', repository, generate: async () => { generated = true; } });
  assert.equal(job.status, 'running'); assert.equal(generated, false);
});

test('an automatic draft recovers interrupted publication without running the model again', async () => {
  const calls = [];
  const job = { id: 'job', ownerId: 'owner', status: 'draft', autoPublish: true, revision: 3 };
  const repository = { admin: async (action, payload) => {
    calls.push({ action, payload });
    return action === 'claim' ? { job, leaseToken: null } : { ...job, status: 'published' };
  } };
  const result = await runAssistantJob({ id: 'job', repository, generate: async () => { throw new Error('must not generate twice'); } });
  assert.equal(result.status, 'published');
  assert.deepEqual(calls.map(call => call.action), ['claim', 'publish']);
  assert.deepEqual(calls[1].payload, { id: 'job', ownerId: 'owner', revision: 3 });
});

test('an automatic cancelled job is never revived by a cron or request retry', async () => {
  const calls = [];
  const repository = { admin: async action => { calls.push(action); return { job: { id: 'job', status: 'cancelled', autoPublish: true }, leaseToken: null }; } };
  assert.equal((await runAssistantJob({ id: 'job', repository })).status, 'cancelled');
  assert.deepEqual(calls, ['claim']);
});

test('memory extraction only sees this new message and active memories, with a single bounded request', async () => {
  let body; let calls = 0;
  const changes = await extractAssistantMemories({ env, prompt: '以后回答简短一点', memories: [{ id: 'm1', text: '关注QQQ', revision: 1 }],
    history: [{ prompt: 'deleted-private-preference' }], fetchImpl: async (url, options) => {
      calls += 1; body = JSON.parse(options.body);
      return response([message(JSON.stringify({ upserts: [{ id: null, text: '偏好简短回答', revision: 0 }], deletes: [] }))]);
    } });
  assert.equal(calls, 1); assert.equal(body.store, false);
  assert.equal(body.text.format.strict, true); assert.equal(body.tools, undefined);
  assert.ok(!JSON.stringify(body).includes('deleted-private-preference'));
  assert.equal(changes.upserts[0].revision, 0); assert.match(changes.upserts[0].id, /^[a-f\d-]{36}$/);
});

test('memory model cannot write unknown IDs or use outdated revisions', async () => {
  for (const item of [{ id: 'someone-else', text: 'x', revision: 1 }, { id: 'm1', text: 'x', revision: 2 }]) {
    await assert.rejects(extractAssistantMemories({ env, prompt: 'test', memories: [{ id: 'm1', text: 'old', revision: 1 }],
      fetchImpl: async () => response([message(JSON.stringify({ upserts: [item], deletes: [] }))]) }), error => error.code === 'ASSISTANT_MEMORY_INVALID');
  }
});

test('paused memory is absent from model context even if supplied by an older backend', () => {
  const context = buildAssistantContext({ job: { kind: 'chat' }, memoryEnabled: false, memories: [{ text: 'private preference' }] });
  assert.deepEqual(context.memories, []);
});

test('deleted or paused memory epoch cannot be reported as successfully learned', async () => {
  const { repository } = runtimeFixture('chat'); const original = repository.admin;
  repository.admin = async (action, payload) => {
    if (action === 'context') return { job: { kind: 'chat', prompt: '新偏好' }, memoryEnabled: true, memoryEpoch: 2, memories: [] };
    if (action === 'apply-memories') return { applied: false, reason: 'MEMORY_CHANGED' };
    return original(action, payload);
  };
  const result = await runAssistantJob({ id: 'job', repository, generate: async () => ({ text: '已回答问题' }),
    extractMemories: async () => ({ upserts: [{ id: 'm', text: '偏好', revision: 0 }], deletes: [] }) });
  assert.equal(result.status, 'draft'); assert.equal(result.memoryUpdate.status, 'unchanged');
  assert.ok(!result.memoryUpdate.summary.includes('已记住'));
});

test('memory extraction failure preserves the completed real answer', async () => {
  const { repository } = runtimeFixture('chat'); const original = repository.admin;
  repository.admin = async (action, payload) => action === 'context'
    ? { job: { kind: 'chat', prompt: '问题' }, memoryEnabled: true, memoryEpoch: 1, memories: [] }
    : original(action, payload);
  const result = await runAssistantJob({ id: 'job', repository, generate: async () => ({ text: '真实回答' }),
    extractMemories: async () => { throw new Error('timeout'); } });
  assert.equal(result.status, 'draft'); assert.equal(result.memoryUpdate.status, 'unavailable');
});

test('public jobs never execute the personal memory extraction pass', async () => {
  const { repository } = runtimeFixture('reply'); let extracted = false;
  await runAssistantJob({ id: 'job', repository, generate: async () => ({ text: '公开回复' }),
    extractMemories: async () => { extracted = true; return { upserts: [], deletes: [] }; } });
  assert.equal(extracted, false);
});

test('SQL-cancelled source is not returned as successful draft', async () => {
  const { repository } = runtimeFixture('reply'); const original = repository.admin;
  repository.admin = async (action, payload) => action === 'complete' ? { id: 'job', status: 'cancelled', text: '' } : original(action, payload);
  await assert.rejects(runAssistantJob({ id: 'job', repository, generate: async () => ({ text: '已失效回答' }) }), error => error.code === 'ASSISTANT_SOURCE_CHANGED');
});
