import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  enqueuePnlReportRecalculationAfterLedgerMutation,
  requestPnlReportRecalculation,
  resetPnlReportRecalculationRequests,
} from '../src/lib/pnlReportRecalculation.js';

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

test.afterEach(() => {
  resetPnlReportRecalculationRequests();
});

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

test('mutations during an in-flight rebuild coalesce into one queued rerun with a fresh token', async () => {
  const pending = [];
  const authHeaders = [];
  const fetchImpl = async (_url, options) => new Promise((resolve) => {
    authHeaders.push(options.headers.Authorization);
    pending.push(resolve);
  });
  const supabase = sessionClient(['token-1', 'token-2']);

  const first = enqueuePnlReportRecalculationAfterLedgerMutation({ supabase, fetchImpl, timeoutMs: 1000 });
  await nextTurn();
  const second = enqueuePnlReportRecalculationAfterLedgerMutation({ supabase, fetchImpl, timeoutMs: 1000 });
  const third = enqueuePnlReportRecalculationAfterLedgerMutation({ supabase, fetchImpl, timeoutMs: 1000 });
  await nextTurn();
  assert.equal(pending.length, 1, 'concurrent mutations must share the active request');

  pending[0](response({ success: true, state: 'already_current' }));
  await nextTurn();
  assert.equal(pending.length, 2, 'all mutations during the active request must create only one rerun');
  assert.deepEqual(authHeaders, ['Bearer token-1', 'Bearer token-2']);

  pending[1](response({ success: true, state: 'recalculated' }));
  const results = await Promise.all([first, second, third]);
  assert.deepEqual(results.map((item) => item.state), ['recalculated', 'recalculated', 'recalculated']);
  assert.equal(pending.length, 2);
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
  const helperStart = appSource.indexOf('const recalculatePnlReportAfterLedgerMutation = useCallback');
  const helperEnd = appSource.indexOf('const addTrade = async', helperStart);
  const helperBlock = appSource.slice(helperStart, helperEnd);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  assert.ok(helperBlock.includes('enqueuePnlReportRecalculationAfterLedgerMutation({ supabase })'));
  assert.ok(helperBlock.includes('} finally {'));
  assert.ok(helperBlock.includes('setPnlReportRefreshVersion'));
  assert.equal(helperBlock.includes("['recalculated', 'cleared', 'already_current']"), false, 'every mutation-triggered outcome should refresh an already-open report from authoritative snapshots');
  assert.equal(helperBlock.includes('stockTrades'), false);
  assert.equal(helperBlock.includes('quoteRows'), false);

  assert.equal((appSource.match(/void recalculatePnlReportAfterLedgerMutation\(\);/g) || []).length, 2);
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
