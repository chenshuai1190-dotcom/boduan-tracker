import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isRegularNyseHoliday,
  recalculateDirtyPnlReportUsers,
  recalculatePnlReportUser,
  resetPnlReportRecalculationStateForTests,
} from '../server/pnlReportRecalculation.js';
import { PNL_REPORT_MUTATION_QUIET_MS } from '../src/lib/pnlReportRebuildPolicy.js';
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

function cashRowsFromRequest(options, resolveCash = () => null) {
  const targets = JSON.parse(options.body || '{}').p_targets || [];
  return targets.map((target) => {
    const resolved = resolveCash(target);
    return resolved ? {
      ...target,
      known: true,
      cash_usd: resolved.cashUsd,
      cash_event_id: resolved.cashEventId,
      cash_effective_at: resolved.cashEffectiveAt,
      cash_basis: 'event',
    } : {
      ...target,
      known: false,
      cash_usd: 0,
      cash_event_id: null,
      cash_effective_at: null,
      cash_basis: null,
    };
  });
}

function createRecalculationFetch({
  dirtyRows = [{
    user_id: USER_ID,
    dirty_from_date: '2026-07-06',
    ledger_revision: 4,
    generation: 2,
    reason: 'stock_trade_inserted',
  }],
  revisionRows = [{ user_id: USER_ID, revision: 4, last_mutated_at: '2026-07-01T14:00:00Z' }],
  tradeRows = [validTrade()],
  availableCashRows = [],
  resolveCash = () => null,
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
    if (href.includes('/rest/v1/available_cash_status')) {
      return jsonResponse(availableCashRows);
    }
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse(typeof tradeRows === 'function' ? tradeRows() : tradeRows);
    }
    if (href.includes('/rest/v1/rpc/resolve_margin_debt_snapshot_targets')) {
      return jsonResponse(marginRowsFromRequest(options));
    }
    if (href.includes('/rest/v1/rpc/resolve_available_cash_snapshot_targets')) {
      return jsonResponse(cashRowsFromRequest(options, resolveCash));
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

test('successive after-close trade edits debounce across independent requests before any ledger or history scans', async () => {
  const calls = [];
  const dirty = {
    user_id: USER_ID, dirty_from_date: '2026-07-06',
    ledger_revision: 4, generation: 1, reason: 'stock_trade_inserted',
  };
  let lastMutation = '2026-07-08T21:00:00Z';
  const fetchImpl = createRecalculationFetch({
    dirtyRows: () => [dirty],
    revisionRows: () => [{ revision: dirty.ledger_revision, last_mutated_at: lastMutation }],
    // The simulated trade was deleted, so the final settled ledger is empty.
    tradeRows: [],
    onCall: (url) => calls.push(new URL(url).pathname),
  });
  const run = (time) => recalculatePnlReportUser({ userId: USER_ID, now: new Date(time) });
  await withRecalculationRuntime(fetchImpl, async () => {
    const first = await run('2026-07-08T21:09:00Z');
    assert.equal(first.state, 'waiting_for_edits');
    assert.equal(first.retryAfterMs, PNL_REPORT_MUTATION_QUIET_MS - 9 * 60_000);
    dirty.ledger_revision += 1;
    dirty.generation += 1;
    dirty.reason = 'stock_trade_deleted';
    lastMutation = '2026-07-08T21:09:30Z';
    const second = await run('2026-07-08T21:10:00Z');
    assert.equal(second.state, 'waiting_for_edits');
    assert.equal(second.retryAfterMs, PNL_REPORT_MUTATION_QUIET_MS - 30_000);
    const beforeDeadline = await run('2026-07-08T21:29:29.999Z');
    assert.equal(beforeDeadline.state, 'waiting_for_edits');
    assert.equal(beforeDeadline.retryAfterMs, 1);
    assert.deepEqual([...new Set(calls)], [
      '/rest/v1/pnl_report_rebuild_state', '/rest/v1/stock_trade_ledger_revisions',
    ]);
    assert.equal((await run('2026-07-08T21:29:30Z')).state, 'cleared');
    assert.equal(calls.filter((path) => path.endsWith('/replace_pnl_report_dirty_range')).length, 1);
  });
});

test('an open-session edit or deleted final trade cannot clear a mixed historical generation before 17:00 New York', async () => {
  for (const [date, cutoff] of [['2026-07-08', 21], ['2026-11-25', 22]]) {
    const paths = [];
    const start = Date.parse(`${date}T${cutoff}:00:00Z`);
    const fetchImpl = createRecalculationFetch({
      dirtyRows: [{
        user_id: USER_ID, dirty_from_date: '2026-07-06', ledger_revision: 8, generation: 3,
        reason: 'available_cash_changed', // Settlement overwrote a trade reason.
      }],
      revisionRows: [{ revision: 8, last_mutated_at: new Date(start - 3600_000).toISOString() }],
      tradeRows: [],
      onCall: (url) => paths.push(new URL(url).pathname),
    });
    await withRecalculationRuntime(fetchImpl, async () => {
      const waiting = await recalculatePnlReportUser({ userId: USER_ID, now: new Date(start - 1) });
      assert.equal(waiting.state, 'waiting_for_close');
      assert.equal(paths.length, 2);
      assert.equal((await recalculatePnlReportUser({ userId: USER_ID, now: new Date(start) })).state, 'cleared');
    });
  }
});

test('pre-entered and weekend trades retain their dirty generation until an eligible close', async () => {
  for (const { dirtyFromDate, trades, now, expectedTradeReads } of [
    // A deleted last trade dated Monday cannot clear the old report on Saturday.
    { dirtyFromDate: '2026-07-13', trades: [], now: '2026-07-11T21:30:00Z', expectedTradeReads: 0 },
    // A weekend trade is picked up at the next trading close.
    { dirtyFromDate: '2026-07-11', trades: [], now: '2026-07-11T21:30:00Z', expectedTradeReads: 0 },
    // Last mutation yesterday, historical dirty prefix plus a future suffix.
    { dirtyFromDate: '2026-07-06', trades: [validTrade({ trade_date: '2026-07-09' })],
      now: '2026-07-08T21:30:00Z', expectedTradeReads: 1 },
  ]) {
    const paths = [];
    const fetchImpl = createRecalculationFetch({
      dirtyRows: [{
        user_id: USER_ID, dirty_from_date: dirtyFromDate, ledger_revision: 4,
        generation: 1, reason: 'stock_trade_updated',
      }],
      revisionRows: [{ revision: 4, last_mutated_at: '2026-07-07T14:00:00Z' }],
      tradeRows: trades,
      onCall: (url) => paths.push(new URL(url).pathname),
    });
    const result = await withRecalculationRuntime(fetchImpl, () => (
      recalculatePnlReportUser({ userId: USER_ID, now: new Date(now) })
    ));
    assert.equal(result.state, 'waiting_for_close');
    assert.equal(paths.filter((path) => path.endsWith('/stock_trades')).length, expectedTradeReads);
    assert.equal(paths.some((path) => path.startsWith('/api/eod/') || path.startsWith('/rest/v1/rpc/')), false);
  }
});

test('a fresh cash-only generation keeps its existing policy even with an earlier trading session', async () => {
  const fetchImpl = createRecalculationFetch({
    dirtyRows: [{
      user_id: USER_ID, dirty_from_date: '2026-07-06', ledger_revision: 4,
      generation: 1, reason: 'available_cash_changed',
    }],
    revisionRows: [{ revision: 4, last_mutated_at: '2026-07-08T18:00:00Z' }],
    tradeRows: [],
    availableCashRows: [{ user_id: USER_ID }],
  });
  const result = await withRecalculationRuntime(fetchImpl, () => (
    recalculatePnlReportUser({ userId: USER_ID, now: new Date('2026-07-08T18:05:00Z') })
  ));
  assert.equal(result.state, 'recalculated');
  assert.equal(result.throughDate, '2026-07-07');
});

test('a trade concurrent with staging is caught by CAS and the retry observes the new quiet window', async () => {
  let edited = false;
  const calls = [];
  const fetchImpl = createRecalculationFetch({
    dirtyRows: () => [{
      user_id: USER_ID, dirty_from_date: '2026-07-06', ledger_revision: edited ? 5 : 4,
      generation: edited ? 2 : 1, reason: 'stock_trade_updated',
    }],
    revisionRows: () => [{
      revision: edited ? 5 : 4,
      last_mutated_at: edited ? '2026-07-08T22:00:01Z' : '2026-07-06T12:00:00Z',
    }],
    beginOutcomes: ['stale'],
    onCall: (url) => {
      const path = new URL(url).pathname;
      calls.push(path);
      if (path.endsWith('/begin_pnl_report_dirty_range')) edited = true;
    },
  });
  const result = await withRecalculationRuntime(fetchImpl, () => (
    recalculatePnlReportUser({ userId: USER_ID, now: new Date('2026-07-08T22:00:00Z') })
  ));
  assert.equal(result.state, 'waiting_for_edits');
  assert.equal(result.ledgerRevision, 5);
  assert.equal(result.retryAfterMs, PNL_REPORT_MUTATION_QUIET_MS);
  assert.equal(calls.filter((path) => path.endsWith('/stock_trades')).length, 1);
  assert.equal(calls.some((path) => path.endsWith('/replace_pnl_report_dirty_range')), false);
});

test('scheduled maintenance counts a quiet ledger as deferred without rotating it', async () => {
  const paths = [];
  const fetchImpl = createRecalculationFetch({
    revisionRows: [{ revision: 4, last_mutated_at: '2026-07-08T21:59:59Z' }],
  });
  await withRecalculationRuntime(async (url, options) => {
    const path = new URL(url).pathname;
    paths.push(path);
    if (path.endsWith('/cleanup_pnl_report_rebuild_jobs')) return jsonResponse({ outcome: 'cleaned' });
    return fetchImpl(url, options);
  }, async () => {
    const result = await recalculateDirtyPnlReportUsers({ now: new Date('2026-07-08T22:00:00Z') });
    assert.equal(result.waitingForEdits, 1);
    assert.equal(result.waitingForClose, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.complete, false);
    assert.equal(result.retryable, true);
    assert.equal(paths.some((path) => path.endsWith('/rotate_pnl_report_rebuild_attempt')), false);
  });
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

test('cash-only dirty rebuild publishes portfolio rows without requesting stock symbols', async () => {
  const calls = [];
  const fetchImpl = createRecalculationFetch({
    tradeRows: [],
    availableCashRows: [{ user_id: USER_ID }],
    resolveCash: () => ({
      cashUsd: 1250,
      cashEventId: '77',
      cashEffectiveAt: '2026-07-05T18:00:00.000Z',
    }),
    onCall: (href, options, body) => calls.push({ href, options, body }),
  });
  const result = await withRecalculationRuntime(fetchImpl, () => (
    recalculatePnlReportUser({ userId: USER_ID, now: new Date('2026-07-08T22:00:00Z') })
  ));

  assert.equal(result.state, 'recalculated');
  const providerCalls = calls.filter(({ href }) => href.includes('eodhd.com/api/eod/'));
  assert.deepEqual(providerCalls.map(({ href }) => new URL(href).pathname), ['/api/eod/SPY.US']);
  const stage = calls.find(({ href }) => href.includes('/stage_pnl_report_dirty_range')).body;
  assert.equal(stage.p_portfolio_rows.length, 3);
  assert.equal(stage.p_symbol_rows.length, 0);
  assert.deepEqual(stage.p_portfolio_rows.map((row) => ({
    cash: row.cash_usd,
    sourceVersion: row.source_version,
  })), Array.from({ length: 3 }, () => ({
    cash: 1250,
    sourceVersion: 'pnl_snapshot_v2',
  })));
  stage.p_portfolio_rows.forEach((row) => {
    assert.equal(Object.hasOwn(row, 'cash_event_id'), false);
    assert.equal(Object.hasOwn(row, 'cash_effective_at'), false);
    assert.equal(Object.hasOwn(row, 'cash_basis'), false);
  });
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
