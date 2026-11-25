import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createPnlReportMutationScheduler,
  requestPnlReportRecalculation,
} from '../src/lib/pnlReportRecalculation.js';

import { PNL_REPORT_MUTATION_QUIET_MS as quiet } from '../src/lib/pnlReportRebuildPolicy.js';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../src/pages/PnlReportPage.jsx', import.meta.url), 'utf8');
const dbSource = readFileSync(new URL('../src/lib/pnlReportDb.js', import.meta.url), 'utf8');

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function sessionClient(tokens = ['token-1'], userId = 'user-1') {
  let index = 0;
  return {
    auth: {
      getSession: async () => {
        const token = tokens[Math.min(index, tokens.length - 1)];
        index += 1;
        return {
          data: { session: { access_token: token, user: { id: userId } } },
          error: null,
        };
      },
    },
  };
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('personal P&L recalculation sends only an authenticated empty POST', async () => {
  const fetchImpl = async (url, options) => {
    const parsed = new URL(String(url), 'https://bottomline.test');
    assert.equal(parsed.pathname, '/api/pnl-report-daily-snapshot');
    assert.equal(parsed.searchParams.get('operation'), 'recalculate-self');
    assert.equal(options.method, 'POST');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Authorization, 'Bearer token-1');
    assert.equal(options.body, '{}');
    return response({
      success: true,
      state: 'recalculated',
      fromDate: '2026-07-01',
      throughDate: '2026-07-31',
      ledgerRevision: 9,
      generation: 4,
      replacedPortfolio: 22,
      replacedSymbols: 88,
    });
  };

  const result = await requestPnlReportRecalculation({
    supabase: sessionClient(),
    fetchImpl,
    timeoutMs: 1000,
  });
  assert.deepEqual(result, {
    success: true,
    state: 'recalculated',
    fromDate: '2026-07-01',
    throughDate: '2026-07-31',
    ledgerRevision: 9,
    generation: 4,
    replacedPortfolio: 22,
    replacedSymbols: 88,
  });
});

test('a buy followed by a delete starts one rebuild twenty minutes after the delete', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [], results = [];
  const scheduler = createPnlReportMutationScheduler({
    userId: 'user-1', supabase: sessionClient(),
    request: async (options) => { calls.push(options.expectedUserId); return { state: 'recalculated' }; },
    onSettled: (result) => results.push(result.state),
  });
  assert.equal(quiet, 20 * 60_000);
  assert.equal(scheduler.schedule(), true);
  t.mock.timers.tick(180_000);
  assert.equal(scheduler.schedule(), false);
  // Explicit cash confirmation during this window cannot bring it forward.
  assert.equal(scheduler.schedule({ cashSettlement: true }), false);
  t.mock.timers.tick(quiet - 1);
  await nextTurn();
  assert.deepEqual(calls, []);
  t.mock.timers.tick(1);
  await nextTurn();
  assert.deepEqual(calls, ['user-1']);
  assert.deepEqual(results, ['recalculated']);
  scheduler.dispose();
});

test('a newer edit on another device delays the next POST and reads a fresh session', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const authHeaders = [], results = [];
  const supabase = sessionClient(['token-1', 'token-2']);
  const scheduler = createPnlReportMutationScheduler({
    userId: 'user-1', supabase,
    request: options => requestPnlReportRecalculation({ ...options, timeoutMs: 0,
      fetchImpl: async (_url, options) => {
        authHeaders.push(options.headers.Authorization);
        assert.equal(options.body, '{}');
        return response(authHeaders.length === 1
          ? { success: true, state: 'waiting_for_close', waitReason: 'recent_edits', retryAfterMs: 90_000 }
          : { success: true, state: 'already_current' });
      },
    }),
    onSettled: result => results.push(result.state),
  });
  scheduler.schedule();
  t.mock.timers.tick(quiet);
  await nextTurn();
  t.mock.timers.tick(89_999);
  assert.deepEqual(authHeaders, ['Bearer token-1']);
  assert.deepEqual(results, []);
  t.mock.timers.tick(1);
  await nextTurn();
  assert.deepEqual(authHeaders, ['Bearer token-1', 'Bearer token-2']);
  assert.deepEqual(results, ['already_current']);
  scheduler.dispose();
});

test('new generation and account disposal discard late replies and cancel local timers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = [], results = [];
  const scheduler = createPnlReportMutationScheduler({
    userId: 'user-1', request: () => new Promise(resolve => pending.push(resolve)),
    onSettled: result => results.push(result),
  });
  scheduler.schedule({ cashSettlement: true });
  t.mock.timers.tick(0);
  assert.equal(pending.length, 1);
  scheduler.schedule();
  pending[0]({ state: 'recalculated' });
  await nextTurn();
  assert.deepEqual(results, []);
  t.mock.timers.tick(quiet);
  assert.equal(pending.length, 2);
  scheduler.schedule();
  scheduler.dispose();
  pending[1]({ state: 'waiting_for_edits', retryAfterMs: 5_000 });
  await nextTurn();
  t.mock.timers.tick(quiet * 2);
  assert.equal(pending.length, 2);
  assert.deepEqual(results, []);
  assert.equal(scheduler.schedule(), false);
});

test('a timer can never request a rebuild for a different signed-in account', async () => {
  let posts = 0;
  await assert.rejects(requestPnlReportRecalculation({
    expectedUserId: 'user-1', supabase: sessionClient(['new-token'], 'user-2'),
    fetchImpl: () => { posts += 1; },
  }), { code: 'AUTH_USER_CHANGED' });
  assert.equal(posts, 0);
});

test('parallel requests for one account share one POST', async () => {
  let send, count = 0;
  const options = { supabase: sessionClient(), timeoutMs: 0, fetchImpl: async () => {
    count += 1;
    return new Promise(resolve => { send = resolve; });
  } };
  const first = requestPnlReportRecalculation(options);
  const second = requestPnlReportRecalculation(options);
  await nextTurn();
  assert.equal(count, 1);
  send(response({ success: true, state: 'recalculated' }));
  assert.deepEqual(await first, await second);
});

test('waiting_for_close is a successful retryable state, not a client-side dirty clear', async () => {
  const result = await requestPnlReportRecalculation({
    supabase: sessionClient(),
    fetchImpl: async () => response({
      success: true,
      state: 'waiting_for_close',
      fromDate: '2026-08-01',
      throughDate: '2026-07-31',
    }),
    timeoutMs: 1000,
  });
  assert.equal(result.state, 'waiting_for_close');
});

test('formal ledger client integration is isolated, non-blocking, and server-owned', () => {
  const wiring = appSource.slice(appSource.indexOf('const pnlRebuildScheduler = useRef'), appSource.indexOf('const reconcileStockTradeCashAfterFailure'));
  assert.ok(wiring.includes('scheduler.dispose()'));
  assert.ok(wiring.includes('userId: user?.id, supabase'));
  assert.ok(wiring.includes('if (pnlRebuildScheduler.current?.schedule(options))'));
  assert.ok(wiring.includes("['recalculated', 'cleared', 'already_current']"));
  const stockHandlers = appSource.slice(appSource.indexOf('const addTrade = async'), appSource.indexOf('const cashTradeSettlementApi = useMemo'));
  assert.equal(stockHandlers.split('recalculatePnlReportAfterLedgerMutation();').length - 1, 2);
  assert.ok(appSource.includes('recalculatePnlReportAfterLedgerMutation({ cashSettlement: true });'));
  assert.ok(appSource.includes('pnlReportRefreshVersion,'));
  assert.equal(pageSource.includes('buildPnlReportHistoricalSnapshots'), false);
  assert.equal(pageSource.includes('upsertPnlReportSnapshots'), false);
  assert.equal(pageSource.includes('clearPnlReportRebuildState'), false);
});

test('report page stays read-only on mount and foreground resume while mutations and Cron own recalculation', () => {
  assert.equal(pageSource.includes("from '../lib/pnlReportRecalculation.js'"), false);
  assert.equal(pageSource.includes('requestPnlReportRecalculation'), false);
  assert.equal(pageSource.includes('fetchPnlReportRebuildState'), false);
  assert.equal(pageSource.includes('rebuildAttemptKey'), false);
  assert.equal(pageSource.includes("result?.state === 'waiting_for_close'"), false);
  assert.equal(pageSource.includes('PNL_REPORT_FOREGROUND_RETRY_MIN_INTERVAL_MS'), false);
  assert.equal(pageSource.includes('onClick={() => retryPnlReportRecalculation()}'), false);
  assert.ok(pageSource.includes('PNL_REPORT_FOREGROUND_READ_MIN_INTERVAL_MS = 60_000'));
  assert.ok(pageSource.includes('const [reportLoading, setReportLoading] = React.useState(true)'));
  assert.equal(pageSource.includes('pnlReport.loadingSnapshots'), false);
  assert.ok(pageSource.includes("window.addEventListener('focus', refreshOnForeground)"));
  assert.ok(pageSource.includes("window.addEventListener('pageshow', refreshOnForeground)"));
  assert.ok(pageSource.includes('void loadReportSnapshots()'));
  assert.ok(pageSource.includes('db.fetchPnlReportSnapshots(null, 370)'));
  assert.ok(pageSource.includes('setPortfolioSnapshots(snapshots)'));
  assert.equal(pageSource.includes('setPortfolioSnapshots([])'), false);
  assert.ok(dbSource.includes('ledgerRevision: Number(state.ledger_revision || 0)'));
  assert.ok(dbSource.includes('generation: Number(state.generation || 0)'));
});

test('cash-only reports skip QQQ benchmark loading and cannot retain a stale comparison', () => {
  assert.ok(pageSource.includes('const hasFormalStockLedger = Array.isArray(stockTrades) && stockTrades.length > 0'));
  assert.ok(pageSource.includes('benchmarkRows: hasFormalStockLedger ? benchmarkRows : []'));

  const effectStart = pageSource.indexOf('async function loadBenchmarkRows()');
  const effectEnd = pageSource.indexOf('const openDateFilter', effectStart);
  const effectBlock = pageSource.slice(effectStart, effectEnd);
  assert.ok(effectStart >= 0 && effectEnd > effectStart);
  assert.ok(effectBlock.includes('if (!hasFormalStockLedger || !reportData.hasData'));
  assert.ok(effectBlock.includes('setBenchmarkRows([])'));
  assert.ok(effectBlock.includes('setBenchmarkError(\'\')'));
  assert.ok(effectBlock.includes('setBenchmarkLoading(false)'));
  assert.ok(effectBlock.includes('hasFormalStockLedger, language'));
});
