import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isRegularNyseHoliday,
  recalculateDirtyPnlReportUsers,
  recalculatePnlReportUser,
  resetPnlReportRecalculationStateForTests,
} from '../server/pnlReportRecalculation.js';
import { resetCommunityCompetitionEodhdStateForTests } from '../server/communityCompetitionEodhd.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body == null ? '' : JSON.stringify(body)),
    json: async () => body,
  };
}

function restoreEnv(snapshot) {
  Object.entries(snapshot).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
}

function validTrade(overrides = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: USER_ID,
    symbol: 'NVDA',
    name: 'NVIDIA',
    side: 'buy',
    trade_date: '2026-07-06',
    price: 150,
    shares: 2,
    fee: 1,
    currency: 'USD',
    note: '',
    created_at: '2026-07-06T14:00:00.000Z',
    updated_at: '2026-07-06T14:00:00.000Z',
    ...overrides,
  };
}

function marginRowsFromRequest(options) {
  const targets = JSON.parse(options.body || '{}').p_targets || [];
  return targets.map((target) => ({
    ...target,
    known: false,
    margin_debt_usd: null,
    margin_debt_event_id: null,
    margin_debt_effective_at: null,
    margin_debt_basis: null,
  }));
}

function createRecalculationFetch({
  dirtyRows = [{
    user_id: USER_ID,
    dirty_from_date: '2026-07-06',
    ledger_revision: 4,
    generation: 2,
  }],
  revisionRows = [{ user_id: USER_ID, revision: 4 }],
  tradeRows = [validTrade()],
  spyRows = [
    { date: '2026-07-06', close: 620, adjusted_close: 620 },
    { date: '2026-07-07', close: 622, adjusted_close: 622 },
    { date: '2026-07-08', close: 624, adjusted_close: 624 },
  ],
  symbolRows = [
    { date: '2026-07-02', close: 155, adjusted_close: 155 },
    { date: '2026-07-06', close: 160, adjusted_close: 160 },
    { date: '2026-07-07', close: 164, adjusted_close: 164 },
    { date: '2026-07-08', close: 168, adjusted_close: 168 },
  ],
  beginOutcomes = ['ready'],
  onCall = () => {},
} = {}) {
  let beginIndex = 0;
  return async (url, options = {}) => {
    const href = String(url);
    const body = options.body ? JSON.parse(options.body) : null;
    onCall(href, options, body);
    if (href.includes('/rest/v1/pnl_report_rebuild_state')) {
      return jsonResponse(typeof dirtyRows === 'function' ? dirtyRows() : dirtyRows);
    }
    if (href.includes('/rest/v1/stock_trade_ledger_revisions')) {
      return jsonResponse(typeof revisionRows === 'function' ? revisionRows() : revisionRows);
    }
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse(typeof tradeRows === 'function' ? tradeRows() : tradeRows);
    }
    if (href.includes('/rest/v1/rpc/resolve_margin_debt_snapshot_targets')) {
      return jsonResponse(marginRowsFromRequest(options));
    }
    if (href.includes('/rest/v1/rpc/begin_pnl_report_dirty_range')) {
      const outcome = beginOutcomes[Math.min(beginIndex, beginOutcomes.length - 1)];
      beginIndex += 1;
      return jsonResponse({ outcome });
    }
    if (href.includes('/rest/v1/rpc/stage_pnl_report_dirty_range')) {
      return jsonResponse({ outcome: 'staged' });
    }
    if (href.includes('/rest/v1/rpc/replace_pnl_report_dirty_range')) {
      return jsonResponse({
        outcome: body.p_clear_all ? 'cleared' : 'recalculated',
        fromDate: body.p_expected_dirty_from_date,
        throughDate: body.p_through_date,
        ledgerRevision: body.p_expected_ledger_revision,
        generation: body.p_expected_generation,
      });
    }
    if (href.includes('/api/eod/SPY.US')) return jsonResponse(spyRows);
    if (href.includes('/api/eod/NVDA.US')) return jsonResponse(symbolRows);
    throw new Error(`unexpected fetch: ${href}`);
  };
}

async function withRecalculationRuntime(fetchImpl, callback) {
  const originalFetch = globalThis.fetch;
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    EODHD_API_KEY: process.env.EODHD_API_KEY,
  };
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';
  globalThis.fetch = fetchImpl;
  resetPnlReportRecalculationStateForTests();
  resetCommunityCompetitionEodhdStateForTests();
  try {
    return await callback();
  } finally {
    resetPnlReportRecalculationStateForTests();
    resetCommunityCompetitionEodhdStateForTests();
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
}

test('immediate P&L rebuild stages a payload-bound EODHD close sequence and finalizes atomically', async () => {
  const calls = [];
  const fetchImpl = createRecalculationFetch({
    onCall: (href, options, body) => calls.push({ href, options, body }),
  });
  const result = await withRecalculationRuntime(fetchImpl, () => (
    recalculatePnlReportUser({ userId: USER_ID, now: new Date('2026-07-08T22:00:00Z') })
  ));

  assert.equal(result.state, 'recalculated');
  assert.equal(result.fromDate, '2026-07-06');
  assert.equal(result.throughDate, '2026-07-08');
  const providerCalls = calls.filter(({ href }) => href.includes('eodhd.com/api/eod/'));
  assert.deepEqual(providerCalls.map(({ href }) => new URL(href).pathname).sort(), [
    '/api/eod/NVDA.US',
    '/api/eod/SPY.US',
  ]);
  const begin = calls.find(({ href }) => href.includes('/begin_pnl_report_dirty_range')).body;
  const stage = calls.find(({ href }) => href.includes('/stage_pnl_report_dirty_range')).body;
  const finalize = calls.find(({ href }) => href.includes('/replace_pnl_report_dirty_range')).body;
  assert.match(begin.p_payload_hash, /^[0-9a-f]{64}$/);
  assert.equal(stage.p_payload_hash, begin.p_payload_hash);
  assert.equal(finalize.p_payload_hash, begin.p_payload_hash);
  assert.equal(begin.p_operation_key.endsWith(`:${begin.p_payload_hash}`), true);
  assert.equal(begin.p_expected_portfolio_count, 3);
  assert.equal(begin.p_expected_symbol_count, 3);
  assert.equal(stage.p_portfolio_rows.length, 3);
  assert.equal(stage.p_symbol_rows.length, 3);
  assert.deepEqual(finalize.p_portfolio_rows, []);
  assert.deepEqual(finalize.p_symbol_rows, []);
});

test('empty formal ledger clears all personal P&L snapshots without any provider request', async () => {
  const calls = [];
  const fetchImpl = createRecalculationFetch({
    tradeRows: [],
    onCall: (href, options, body) => calls.push({ href, options, body }),
  });
  const result = await withRecalculationRuntime(fetchImpl, () => (
    recalculatePnlReportUser({ userId: USER_ID, now: new Date('2026-07-08T22:00:00Z') })
  ));

  assert.equal(result.state, 'cleared');
  assert.equal(calls.some(({ href }) => href.includes('eodhd.com')), false);
  assert.equal(calls.some(({ href }) => href.includes('/stage_pnl_report_dirty_range')), false);
  const begin = calls.find(({ href }) => href.includes('/begin_pnl_report_dirty_range')).body;
  const finalize = calls.find(({ href }) => href.includes('/replace_pnl_report_dirty_range')).body;
  assert.equal(begin.p_clear_all, true);
  assert.equal(begin.p_expected_portfolio_count, 0);
  assert.equal(finalize.p_clear_all, true);
  assert.equal(finalize.p_through_date, null);
});

test('non-USD or non-canonical formal trades fail closed before provider or staging access', async () => {
  for (const invalidTrade of [
    validTrade({ currency: 'CNY' }),
    validTrade({ symbol: 'nvda' }),
    validTrade({ symbol: 'NVDA/US' }),
  ]) {
    const calls = [];
    const fetchImpl = createRecalculationFetch({
      tradeRows: [invalidTrade],
      onCall: (href, options, body) => calls.push({ href, options, body }),
    });
    await assert.rejects(
      withRecalculationRuntime(fetchImpl, () => (
        recalculatePnlReportUser({ userId: USER_ID, now: new Date('2026-07-08T22:00:00Z') })
      )),
      (error) => error?.code === 'PNL_LEDGER_INVALID' && error?.retryable === false
    );
    assert.equal(calls.some(({ href }) => href.includes('eodhd.com')), false);
    assert.equal(calls.some(({ href }) => href.includes('/begin_pnl_report_dirty_range')), false);
  }
});

test('a normal weekday missing its exact EODHD close stays dirty and never starts staging', async () => {
  const calls = [];
  const fetchImpl = createRecalculationFetch({
    spyRows: [{ date: '2026-07-07', close: 622, adjusted_close: 622 }],
    onCall: (href, options, body) => calls.push({ href, options, body }),
  });
  const result = await withRecalculationRuntime(fetchImpl, () => (
    recalculatePnlReportUser({ userId: USER_ID, now: new Date('2026-07-08T22:00:00Z') })
  ));

  assert.equal(result.state, 'waiting_for_close');
  assert.equal(result.throughDate, null);
  assert.equal(calls.filter(({ href }) => href.includes('/api/eod/SPY.US')).length, 3);
  assert.equal(calls.some(({ href }) => href.includes('/begin_pnl_report_dirty_range')), false);
  assert.equal(calls.some(({ href }) => href.includes('/stage_pnl_report_dirty_range')), false);
  assert.equal(calls.some(({ href }) => href.includes('/replace_pnl_report_dirty_range')), false);
});

test('a regular NYSE holiday reuses the latest real SPY close without retrying a fictional session', async () => {
  assert.equal(isRegularNyseHoliday('2026-07-03'), true);
  const calls = [];
  const fetchImpl = createRecalculationFetch({
    dirtyRows: [{
      user_id: USER_ID,
      dirty_from_date: '2026-07-01',
      ledger_revision: 4,
      generation: 2,
    }],
    tradeRows: [validTrade({ trade_date: '2026-07-01' })],
    spyRows: [
      { date: '2026-07-01', close: 618, adjusted_close: 618 },
      { date: '2026-07-02', close: 620, adjusted_close: 620 },
    ],
    symbolRows: [
      { date: '2026-06-30', close: 150, adjusted_close: 150 },
      { date: '2026-07-01', close: 154, adjusted_close: 154 },
      { date: '2026-07-02', close: 156, adjusted_close: 156 },
    ],
    onCall: (href, options, body) => calls.push({ href, options, body }),
  });
  const result = await withRecalculationRuntime(fetchImpl, () => (
    recalculatePnlReportUser({ userId: USER_ID, now: new Date('2026-07-03T22:00:00Z') })
  ));

  assert.equal(result.state, 'recalculated');
  assert.equal(result.throughDate, '2026-07-02');
  assert.equal(calls.filter(({ href }) => href.includes('/api/eod/SPY.US')).length, 1);
});

test('a regular NYSE holiday still requires the exact preceding regular SPY close', async () => {
  const calls = [];
  const fetchImpl = createRecalculationFetch({
    dirtyRows: [{
      user_id: USER_ID,
      dirty_from_date: '2026-07-01',
      ledger_revision: 4,
      generation: 2,
    }],
    tradeRows: [validTrade({ trade_date: '2026-07-01' })],
    spyRows: [{ date: '2026-07-01', close: 618, adjusted_close: 618 }],
    onCall: (href, options, body) => calls.push({ href, options, body }),
  });
  const result = await withRecalculationRuntime(fetchImpl, () => (
    recalculatePnlReportUser({ userId: USER_ID, now: new Date('2026-07-03T22:00:00Z') })
  ));

  assert.equal(result.state, 'waiting_for_close');
  assert.equal(calls.filter(({ href }) => href.includes('/api/eod/SPY.US')).length, 3);
  assert.equal(calls.some(({ href }) => href.includes('/begin_pnl_report_dirty_range')), false);
});

test('bounded dirty batches rotate unfinished users so later offline accounts are eventually attempted', async () => {
  const users = Array.from({ length: 11 }, (_, index) => (
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
  ));
  const queue = users.map((userId) => ({
    user_id: userId,
    dirty_from_date: '2026-07-06',
    ledger_revision: 1,
    generation: 1,
  }));
  const attempted = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const href = parsed.href;
    const body = options.body ? JSON.parse(options.body) : null;
    if (href.includes('/rest/v1/rpc/cleanup_pnl_report_rebuild_jobs')) {
      return jsonResponse({ outcome: 'cleaned', deletedJobs: 0 });
    }
    if (href.includes('/rest/v1/rpc/rotate_pnl_report_rebuild_attempt')) {
      const index = queue.findIndex((row) => row.user_id === body.p_user_id);
      if (index < 0) return jsonResponse({ outcome: 'already_current' });
      const current = queue[index];
      if (
        current.ledger_revision !== body.p_expected_ledger_revision
        || current.generation !== body.p_expected_generation
        || current.dirty_from_date !== body.p_expected_dirty_from_date
      ) return jsonResponse({ outcome: 'stale' });
      queue.splice(index, 1);
      queue.push(current);
      return jsonResponse({ outcome: 'rotated' });
    }
    if (href.includes('/rest/v1/pnl_report_rebuild_state')) {
      const filter = parsed.searchParams.get('user_id');
      if (!filter) return jsonResponse(queue.slice(0, 11));
      const userId = filter.replace(/^eq\./, '');
      return jsonResponse(queue.filter((row) => row.user_id === userId));
    }
    if (href.includes('/rest/v1/stock_trade_ledger_revisions')) {
      const userId = String(parsed.searchParams.get('user_id') || '').replace(/^eq\./, '');
      return jsonResponse([{ user_id: userId, revision: 1 }]);
    }
    if (href.includes('/rest/v1/stock_trades')) {
      const userId = String(parsed.searchParams.get('user_id') || '').replace(/^eq\./, '');
      attempted.push(userId);
      return jsonResponse([validTrade({
        id: `10000000-0000-4000-8000-${userId.slice(-12)}`,
        user_id: userId,
        currency: 'CNY',
      })]);
    }
    throw new Error(`unexpected fetch: ${href}`);
  };

  await withRecalculationRuntime(fetchImpl, async () => {
    const first = await recalculateDirtyPnlReportUsers({
      now: new Date('2026-07-08T22:00:00Z'),
      limit: 10,
      concurrency: 2,
    });
    assert.equal(first.attempted, 10);
    assert.equal(first.permanentFailures, 10);
    assert.equal(first.rotationFailures, 0);
    assert.equal(first.batchLimited, true);
    assert.equal(attempted.includes(users[10]), false);

    const second = await recalculateDirtyPnlReportUsers({
      now: new Date('2026-07-08T22:00:00Z'),
      limit: 10,
      concurrency: 2,
    });
    assert.equal(second.attempted, 10);
    assert.equal(second.rotationFailures, 0);
    assert.equal(attempted.includes(users[10]), true);
  });
});

test('a stale begin CAS retries the whole plan once and then commits', async () => {
  const calls = [];
  const fetchImpl = createRecalculationFetch({
    beginOutcomes: ['stale', 'ready'],
    onCall: (href, options, body) => calls.push({ href, options, body }),
  });
  const result = await withRecalculationRuntime(fetchImpl, () => (
    recalculatePnlReportUser({ userId: USER_ID, now: new Date('2026-07-08T22:00:00Z') })
  ));

  assert.equal(result.state, 'recalculated');
  assert.equal(calls.filter(({ href }) => href.includes('/begin_pnl_report_dirty_range')).length, 2);
  assert.equal(calls.filter(({ href }) => href.includes('/stage_pnl_report_dirty_range')).length, 1);
  assert.equal(calls.filter(({ href }) => href.includes('/replace_pnl_report_dirty_range')).length, 1);
});

test('same-user concurrent requests share one complete server recalculation flight', async () => {
  const calls = [];
  const fetchImpl = createRecalculationFetch({
    onCall: (href, options, body) => calls.push({ href, options, body }),
  });
  const results = await withRecalculationRuntime(fetchImpl, () => Promise.all([
    recalculatePnlReportUser({ userId: USER_ID, now: new Date('2026-07-08T22:00:00Z') }),
    recalculatePnlReportUser({ userId: USER_ID, now: new Date('2026-07-08T22:00:00Z') }),
  ]));

  assert.equal(results[0], results[1]);
  assert.equal(calls.filter(({ href }) => href.includes('/rest/v1/pnl_report_rebuild_state')).length, 1);
  assert.equal(calls.filter(({ href }) => href.includes('/begin_pnl_report_dirty_range')).length, 1);
  assert.equal(calls.filter(({ href }) => href.includes('/replace_pnl_report_dirty_range')).length, 1);
});
