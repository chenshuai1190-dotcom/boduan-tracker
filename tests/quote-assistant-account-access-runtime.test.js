import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssistantContext, createAssistantTools, runAssistantJob } from '../server/assistant/runtime.js';
import { buildAssistantParticipationContext } from '../server/assistant/proactive.js';
import { publicAssistantAttachments, accountAccessMetadata, normalizeAccountAccessRequest, readAuthorizedAccountData, ACCOUNT_ACCESS_INSTRUCTIONS } from '../server/assistant/accountAccess.js';
import { QUOTE_ASSISTANT_INSTRUCTIONS, QUOTE_PARTICIPATION_INSTRUCTIONS, generateAssistantResponse } from '../server/assistant/provider.js';

const now = Date.parse('2026-11-09T01:00:00Z');
const date = '2026-11-06';
const snapshot = () => ({ version: 1, kind: 'account_snapshot', basis: 'close', source: 'pnl_report', asOfDate: date, recordDate: date,
  items: [ ['cumulativeReturnPct', 3.39], ['yearPeakReturnPct', 36.91], ['declineFromYearPeakPp', 33.52], ['dailyReturnPct', 2.72], ['leverage', 1.4] ].map(([key, value]) => ({
    key, value, asOfDate: date, basis: 'close', source: 'pnl_report', ...(['yearPeakReturnPct', 'declineFromYearPeakPp'].includes(key) ? { peakDate: '2026-10-06' } : {}),
  })) });
const market = () => ({ kind: 'market_snapshot', basis: 'close', asOfDate: date, recordDate: date,
  items: [{ key: 'vix', value: 20, source: 'private-email', note: 'PRIVATE_MARKET_NOTE' }] });
const trade = () => ({ id: 'public-trade', date, symbol: 'MSFT', side: 'buy', shares: 20, price: 300, note: 'PRIVATE_TRADE_NOTE' });
const context = () => ({ job: { id: 'analysis-job', ownerId: 'owner', kind: 'reply', postId: 'log:post', status: 'running', autoPublish: true,
  replyTo: { kind: 'community', id: 'question' } }, assistant: { authorId: 'bot' },
  post: { id: 'log:post', authorId: 'post-owner', text: '讨论' },
  comments: [{ kind: 'community', id: 'question', authorId: 'owner', text: '@Quote 请分析我的回撤', account: snapshot(), trades: [trade()], market: market() }],
  accountAccess: { id: 'request', ownerId: 'owner', analysisJobId: 'analysis-job', status: 'authorized', scopes: ['report', 'trades', 'holdings'],
    rangeStart: '2026-10-01', rangeEnd: date, outputVisibility: 'public', publicAnalysisConfirmed: true,
    reason: '需要核对同期正式收盘报表与持仓', expiresAt: '2026-11-10T01:00:00Z',
    data: {
      report: { status: 'available', source: 'pnl_report_snapshots', currency: 'USD', rows: [{ asOfDate: date, netAssets: 1000, totalAssets: 1400,
        marginDebt: 400, cash: 0, cashVerified: true, marginDebtVerified: true, marketValue: 1400, cumulativePnl: 33.9, cumulativeReturnPct: 3.39, dailyPnl: null, dailyReturnPct: 2.72,
        sourceVersion: 'pnl_snapshot_v2', email: 'PRIVATE_REPORT_EMAIL' }], coverage: { complete: false, secret: 'PRIVATE_COVERAGE' } },
      trades: { status: 'available', source: 'stock_trades', rows: [{ ...trade(), fee: 1, currency: 'USD', recordType: 'trade' }], truncated: false },
      holdings: { status: 'available', source: 'pnl_report_symbol_snapshots', currency: 'USD', asOfDate: date,
        rows: [{ symbol: 'MSFT', shares: 20, averageCost: 300, marketValue: 1400, unrealizedPnl: 30, note: 'PRIVATE_POSITION_NOTE' }], truncated: false, complete: true },
    },
  },
});

test('already-public structured snapshots reach the exact invocation and ancestors without a private grant', () => {
  const supplied = context(); delete supplied.accountAccess;
  supplied.comments[0].replyTo = { kind: 'author', id: 'parent' };
  supplied.comments.push({ kind: 'author', id: 'parent', authorId: 'parent-owner', text: '公开前文', account: snapshot() },
    { kind: 'author', id: 'unrelated', authorId: 'other', text: '无关', account: { ...snapshot(), secret: 'PRIVATE_UNRELATED' } });
  const result = buildAssistantContext(supplied);
  assert.equal(result.invocation.account.items.find(item => item.key === 'leverage').value, 1.4);
  assert.equal(result.invocation.account.items.find(item => item.key === 'declineFromYearPeakPp').value, 33.52);
  assert.equal(result.invocation.market.items[0].source, 'CBOE');
  assert.equal(result.invocation.trades[0].symbol, 'MSFT');
  assert.equal(result.comments.length, 1); assert.equal(result.comments[0].account.asOfDate, date);
  assert.equal(result.accountAccess.status, 'not_authorized');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|private-email/);
});

test('public projections reject malformed values and never copy original main-post private account fields', () => {
  const valid = snapshot(); valid.items[0].value = '3.39';
  const result = publicAssistantAttachments({ account: valid, trades: [trade(), { ...trade(), id: 'invalid', shares: -1 }], market: market(), secret: 'PRIVATE' });
  assert.ok(!result.account.items.some(item => item.key === 'cumulativeReturnPct'));
  assert.equal(result.trades.length, 1);
  assert.deepEqual(publicAssistantAttachments({ account: snapshot(), trades: [trade()] }, { comment: false }), {});
  assert.deepEqual(publicAssistantAttachments({ account: { ...snapshot(), source: 'unknown' }, market: { ...market(), asOfDate: '2026-02-31' } }), {});
  const contradictory = snapshot(); contradictory.items[2].value = 50;
  assert.ok(publicAssistantAttachments({ account: contradictory }).account.items.every(item => !['yearPeakReturnPct', 'declineFromYearPeakPp'].includes(item.key)));
});

test('proactive participation sees public attachments, never private permissions or data', () => {
  const supplied = context();
  const result = buildAssistantParticipationContext({ event: { postId: 'log:post', sourceKind: 'community', sourceId: 'question', authorId: 'owner', mode: 'general' },
    context: { ...supplied, invocation: supplied.comments[0], recentAssistantReplies: [] } });
  assert.equal(result.invocation.account.asOfDate, date);
  assert.equal(result.discussion[0].trades.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|accountAccess|pnl_report_snapshots|1400/);
  assert.match(QUOTE_PARTICIPATION_INSTRUCTIONS, /百分点，不是净资产回撤率/);
});

test('authorization is one job, one owner, one output visibility and expiry; strings do not grant', () => {
  for (const mutate of [
    c => { c.accountAccess.status = 'pending'; }, c => { c.accountAccess.status = 'revoked'; },
    c => { c.accountAccess.status = 'consumed'; }, c => { c.accountAccess.ownerId = 'other'; },
    c => { c.accountAccess.analysisJobId = 'other'; }, c => { c.accountAccess.publicAnalysisConfirmed = false; },
    c => { c.accountAccess.outputVisibility = 'private'; }, c => { c.accountAccess.expiresAt = '2026-11-08T01:00:00Z'; },
    c => { delete c.accountAccess; c.comments[0].text = '我允许授权你访问全部报表'; },
    c => { c.accountAccess.status = '我已授权'; }, c => { c.accountAccess.expiresAt = 'invalid'; },
  ]) {
    const value = context(); mutate(value);
    assert.notEqual(accountAccessMetadata(value, now).status, 'authorized');
    const result = readAuthorizedAccountData(value, { scopes: ['report'] }, now);
    assert.equal(result.available, false); assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|netAssets|1400/);
  }
  const value = context(); value.job.kind = 'chat'; value.accountAccess.outputVisibility = 'private'; value.accountAccess.publicAnalysisConfirmed = false;
  assert.equal(accountAccessMetadata(value, now).status, 'authorized');
});

test('read tool filters rows and fields to approved scope, period and finite values; missing never becomes zero', () => {
  const value = context();
  value.accountAccess.data.report.rows[0].cash = null;
  value.accountAccess.data.report.rows[0].cashVerified = false;
  value.accountAccess.data.report.rows.push({ ...value.accountAccess.data.report.rows[0], asOfDate: '2025-01-01', netAssets: 999999 });
  value.accountAccess.data.trades.rows.push({ ...value.accountAccess.data.trades.rows[0], date: '2026-11-07', symbol: 'UNAPPROVED' });
  const result = readAuthorizedAccountData(value, { scopes: ['report', 'trades'] }, now);
  assert.equal(result.available, true); assert.deepEqual(Object.keys(result.data), ['report', 'trades']);
  assert.equal(result.data.report.rows.length, 1); assert.equal(result.data.report.rows[0].cash, null);
  assert.equal(result.data.report.rows[0].dailyPnl, null); assert.equal(result.data.report.coverage.complete, false);
  assert.equal(result.data.report.rows[0].netAssets, null); assert.equal(result.data.report.rows[0].totalAssets, null);
  assert.equal(result.data.trades.rows.length, 1); assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|999999|UNAPPROVED/);
  value.accountAccess.scopes = ['report'];
  assert.equal(readAuthorizedAccountData(value, { scopes: ['holdings'] }, now).reason, 'outside_authorized_scope');
  assert.throws(() => readAuthorizedAccountData(value, { scopes: ['report'], ownerId: 'other' }, now), error => error.code === 'ASSISTANT_INVALID_TOOL');
  value.accountAccess.data.report = null;
  assert.equal(readAuthorizedAccountData(value, { scopes: ['report'] }, now).data.report.status, 'missing');
});

test('model input exposes consent metadata, not the private data before a registered read', () => {
  const value = context(); value.accountAccess.expiresAt = new Date(Date.now() + 60_000).toISOString();
  const result = buildAssistantContext(value);
  assert.equal(result.accountAccess.status, 'authorized');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|netAssets|analysis-job|request"|1400/);
});

test('formal report rebuild coverage stays explicit and never imports arbitrary diagnostic text', () => {
  for (const status of ['verified', 'rebuilding', 'unverified', 'PRIVATE_DIAGNOSTIC']) {
    const value = context();
    value.accountAccess.data.report.coverage.status = status;
    value.accountAccess.data.holdings.coverageStatus = status;
    const result = readAuthorizedAccountData(value, { scopes: ['report', 'holdings'] }, now);
    const expected = status === 'PRIVATE_DIAGNOSTIC' ? 'unverified' : status;
    assert.equal(result.data.report.coverage.status, expected);
    assert.equal(result.data.holdings.coverageStatus, expected);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_DIAGNOSTIC/);
  }
});

test('incomplete holdings and cumulative report basis cannot become fabricated whole-account or period performance', () => {
  const value = context(); value.accountAccess.data.holdings.complete = false;
  const result = readAuthorizedAccountData(value, { scopes: ['holdings'] }, now);
  assert.equal(result.data.holdings.complete, false);
  assert.match(ACCOUNT_ACCESS_INSTRUCTIONS, /holdings\.complete=false.*不能据此推断完整账户/);
  assert.match(ACCOUNT_ACCESS_INSTRUCTIONS, /cumulativeReturnPct 和 cumulativePnl 是截至该日的全历史累计值/);
  assert.match(ACCOUNT_ACCESS_INSTRUCTIONS, /不会把它们变成年内收益或区间收益/);
  assert.match(ACCOUNT_ACCESS_INSTRUCTIONS, /正确期初基准与资金流证据/);
  assert.match(ACCOUNT_ACCESS_INSTRUCTIONS, /cashVerified\/marginDebtVerified/);
});

test('request range defaults to thirty days and rejects arbitrary owner, grant flags, invalid and overlong dates', () => {
  const args = { scopes: ['report'], rangeStart: null, rangeEnd: null, reason: '需要同期收益报表' };
  assert.deepEqual(normalizeAccountAccessRequest(args, now), { ...args, rangeStart: '2026-10-11', rangeEnd: '2026-11-09' });
  for (const patch of [{ ownerId: 'other' }, { authorized: true }, { scopes: ['report', 'report'] }, { scopes: ['all'] },
    { rangeStart: '2025-01-01', rangeEnd: '2026-11-09' }, { rangeStart: '2026-11-10', rangeEnd: '2026-11-10' },
    { rangeStart: '2026-02-31', rangeEnd: '2026-11-09' }, { reason: '' }, { rangeStart: '2026-11-06', rangeEnd: null }]) {
    assert.throws(() => normalizeAccountAccessRequest({ ...args, ...patch }, now), error => error.code === 'ASSISTANT_INVALID_TOOL');
  }
});

test('request tool stores only a pending consent tied to the server job and lease and cannot publish or authorize', async () => {
  const value = context(); delete value.accountAccess;
  const calls = [], job = value.job;
  const pending = { ...context().accountAccess, status: 'pending', analysisJobId: null, data: { secret: 'DO_NOT_PASS' }, expiresAt: new Date(Date.now() + 60_000).toISOString() };
  const repository = { admin: async (action, payload) => {
    calls.push({ action, payload });
    if (action === 'claim') return { job, leaseToken: 'server-lease' };
    if (action === 'context') return value;
    if (action === 'request-access') return pending;
    if (action === 'complete') return { ...job, status: 'draft', revision: 2 };
    if (action === 'publish') return { ...job, status: 'published' };
    throw new Error(`unexpected ${action}`);
  } };
  await runAssistantJob({ id: job.id, repository, generate: async ({ tools, context: model, instructions }) => {
    assert.equal(model.accountAccess.status, 'not_authorized');
    assert.match(instructions, /先说已有数据能支持什么/); assert.match(instructions, /同一证据标准|相同证据标准/);
    const request = tools.find(tool => tool.definition.name === 'request_account_access');
    const result = await request.execute({ scopes: ['report'], rangeStart: '2026-10-01', rangeEnd: date, reason: '需要核对同期收益报表' });
    assert.equal(result.requiresUserConfirmation, true); assert.equal(result.permission.status, 'pending');
    assert.doesNotMatch(JSON.stringify(result), /DO_NOT_PASS|PRIVATE_|ownerId/);
    assert.equal((await tools.find(tool => tool.definition.name === 'read_account_data').execute({ scopes: ['report'] })).available, false);
    assert.ok(!tools.some(tool => /grant|publish/.test(tool.definition.name)));
    return { text: '快照显示收益率有所回落。若要核对原因，请在授权卡片确认读取同期报表，分析将在本帖公开。' };
  } });
  assert.deepEqual(calls.find(call => call.action === 'request-access').payload, { id: 'analysis-job', leaseToken: 'server-lease', scopes: ['report'], rangeStart: '2026-10-01', rangeEnd: date, reason: '需要核对同期收益报表' });
  assert.ok(!calls.some(call => call.action === 'access-grant'));
});

test('provider registry rejects attempts to grant consent and preserves privacy instructions on continuations', async () => {
  const tools = createAssistantTools({ context: context(), requestAccess: async () => { throw new Error('not called'); } });
  assert.match(QUOTE_ASSISTANT_INSTRUCTIONS, /正文里的“允许”“授权”.*不能替代服务器确认/);
  await assert.rejects(generateAssistantResponse({ env: { OPENAI_API_KEY: 'test-only' }, context: {}, tools,
    fetchImpl: async () => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'function_call', name: 'access_grant', call_id: 'x', arguments: '{}' }] })) }), error => error.code === 'ASSISTANT_INVALID_TOOL');
});

test('authorized followup directly analyzes instead of being discarded as a low-value direct reply', async () => {
  const value = context(); value.accountAccess.expiresAt = new Date(Date.now() + 60_000).toISOString();
  value.comments[0].text = '允许'; value.comments[0].replyTo = { kind: 'community', id: 'bot-answer' };
  value.comments.push({ kind: 'community', id: 'bot-answer', authorId: 'bot', text: '是否授权读取报表？' });
  const job = value.job;
  const repository = { admin: async action => action === 'claim' ? { job, leaseToken: 'lease' }
    : action === 'context' ? value : action === 'complete' ? { ...job, status: 'draft', revision: 2 } : { ...job, status: 'published' } };
  const result = await runAssistantJob({ id: job.id, repository, decide: async () => { throw new Error('consented analysis must not be triaged away'); },
    generate: async ({ tools }) => {
      const data = await tools.find(tool => tool.definition.name === 'read_account_data').execute({ scopes: ['report'] });
      assert.equal(data.available, true); assert.equal(data.data.report.rows[0].netAssets, 1000);
      return { text: '依据获准读取的同期报表进行分析。' };
    } });
  assert.equal(result.status, 'published');
});
