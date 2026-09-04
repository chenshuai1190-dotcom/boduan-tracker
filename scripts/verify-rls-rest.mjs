const APP_URL = 'https://boduan-tracker.vercel.app';
const USER_TABLES = [
  'trades',
  'stock_trades',
  'stock_trade_ledger_revisions',
  'swing_waves',
  'swing_wave_exits',
  'community_profiles',
  'community_competition_members',
  'community_competition_snapshots',
  'pnl_report_snapshots',
  'pnl_report_symbol_snapshots',
  'pnl_report_rebuild_state',
  'watchlist',
  'wave_notes',
  'user_settings',
  'accounts',
  'balance_snapshots',
  'investment_plan',
  'margin_status',
  'available_cash_status',
  'available_cash_movements',
  'disciplines',
  'review_logs',
  'yearly_actuals',
  'cost_basis_trades',
].map(table => ({ table, select: 'user_id' }));
const SERVICE_ONLY_TABLES = [
  { table: 'snapshot_publication_markers', select: 'channel' },
  { table: 'margin_debt_events', select: 'user_id' },
  { table: 'margin_debt_history_meta', select: 'version' },
  { table: 'available_cash_events', select: 'user_id' },
  { table: 'community_competition_rebaseline_audit', select: 'operation_key' },
  { table: 'community_competition_epoch_resets', select: 'operation_key' },
  { table: 'community_competition_rebuild_state', select: 'user_id' },
  { table: 'community_competition_rebuild_audit', select: 'operation_key' },
  { table: 'pnl_report_rebuild_jobs', select: 'operation_key' },
  { table: 'pnl_report_rebuild_portfolio_stage', select: 'operation_key' },
  { table: 'pnl_report_rebuild_symbol_stage', select: 'operation_key' },
  { table: 'pnl_report_rebuild_audit', select: 'operation_key' },
];
const SERVICE_ONLY_RPCS = [
  {
    name: 'resolve_margin_debt_snapshot_targets',
    body: {
      p_targets: [{
        user_id: '00000000-0000-0000-0000-000000000000',
        snapshot_date: '2000-01-01',
      }],
    },
  },
  {
    name: 'resolve_available_cash_snapshot_targets',
    body: {
      p_targets: [{
        user_id: '00000000-0000-0000-0000-000000000000',
        snapshot_date: '2000-01-01',
      }],
    },
  },
  {
    name: 'join_community_competition_member',
    body: {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_expected_ledger_revision: 0,
      p_eligible_after_snapshot_date: '2000-01-01',
      p_eligible_ledger_hash: '0'.repeat(64),
    },
  },
  {
    name: 'rebaseline_community_competition_member',
    body: {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_expected_eligible_after_snapshot_date: '2000-01-01',
      p_expected_eligible_ledger_hash: null,
      p_expected_eligible_ledger_revision: 0,
      p_expected_current_ledger_revision: 0,
      p_new_eligible_after_snapshot_date: '2000-01-02',
      p_new_eligible_ledger_hash: '0'.repeat(64),
    },
  },
  {
    name: 'forward_rebaseline_ranked_community_competition_member',
    body: {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_expected_eligible_after_snapshot_date: '2000-01-01',
      p_expected_eligible_ledger_hash: '0'.repeat(64),
      p_expected_eligible_ledger_revision: 0,
      p_expected_ranking_start_snapshot_date: '2000-01-02',
      p_expected_ranking_baseline_return_pct: 0,
      p_expected_current_ledger_revision: 0,
      p_new_eligible_after_snapshot_date: '2026-07-30',
      p_new_eligible_ledger_hash: '0'.repeat(64),
    },
  },
  {
    name: 'rollover_community_competition_member_epoch',
    body: {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_operation_key:
        'competition-epoch-rollover:00000000-0000-0000-0000-000000000000:2000-01-03:1',
      p_expected_eligible_after_snapshot_date: '2000-01-01',
      p_expected_eligible_ledger_hash: '0'.repeat(64),
      p_expected_eligible_ledger_revision: 0,
      p_expected_ranking_start_snapshot_date: '2000-01-02',
      p_expected_ranking_baseline_return_pct: 0,
      p_expected_current_ledger_revision: 1,
      p_new_eligible_after_snapshot_date: '2000-01-03',
      p_new_eligible_ledger_hash: '1'.repeat(64),
      p_market_close_at: '2000-01-03T21:00:00.000Z',
      p_reason: 'prior_ledger_hash_mismatch',
    },
  },
  {
    name: 'replace_community_competition_member_snapshots',
    body: {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_operation_key:
        'competition-ledger-rebuild:00000000-0000-0000-0000-000000000000:1:2000-01-03',
      p_expected_ledger_revision: 1,
      p_expected_dirty_from_date: '2000-01-01',
      p_expected_eligible_after_snapshot_date: '2000-01-01',
      p_expected_eligible_ledger_hash: '0'.repeat(64),
      p_expected_eligible_ledger_revision: 0,
      p_expected_ranking_start_snapshot_date: '2000-01-02',
      p_expected_ranking_baseline_return_pct: 0,
      p_expected_marker_snapshot_date: '2000-01-03',
      p_expected_marker_version: 'competition_old_v1',
      p_new_marker_version: 'competition_new_v1',
      p_new_eligible_after_snapshot_date: '2000-01-01',
      p_new_eligible_ledger_hash: '1'.repeat(64),
      p_new_ranking_start_snapshot_date: '2000-01-02',
      p_new_ranking_baseline_return_pct: 0,
      p_snapshots: [],
    },
  },
  {
    name: 'upsert_unpublished_community_competition_member_snapshot',
    body: {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_target_snapshot_date: '2000-01-03',
      p_expected_ledger_revision: 1,
      p_expected_eligible_after_snapshot_date: '2000-01-01',
      p_expected_eligible_ledger_hash: '0'.repeat(64),
      p_expected_eligible_ledger_revision: 0,
      p_expected_ranking_start_snapshot_date: '2000-01-02',
      p_expected_ranking_baseline_return_pct: 0,
      p_initialize_ranking_baseline_return_pct: null,
      p_daily_return_pct: 0,
      p_cumulative_return_pct: 0,
      p_locked_at: '2000-01-03T21:00:00.000Z',
      p_ledger_hash: '1'.repeat(64),
      p_source_version: 'community_competition_snapshot_v1',
    },
  },
  {
    name: 'publish_community_competition_snapshot_marker',
    body: {
      p_snapshot_date: '2000-01-03',
      p_expected_version: 'competition_old_v1',
      p_new_version: 'competition_new_v1',
      p_republish: true,
    },
  },
  {
    name: 'cleanup_pnl_report_rebuild_jobs',
    body: { p_limit: 1 },
  },
  {
    name: 'rotate_pnl_report_rebuild_attempt',
    body: {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_expected_ledger_revision: 1,
      p_expected_generation: 1,
      p_expected_dirty_from_date: '2000-01-01',
    },
  },
  {
    name: 'begin_pnl_report_dirty_range',
    body: {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_operation_key:
        `pnl-ledger-rebuild:00000000-0000-0000-0000-000000000000:1:1:2000-01-03:${'0'.repeat(64)}`,
      p_payload_hash: '0'.repeat(64),
      p_expected_ledger_revision: 1,
      p_expected_generation: 1,
      p_expected_dirty_from_date: '2000-01-01',
      p_through_date: '2000-01-03',
      p_expected_portfolio_count: 1,
      p_expected_symbol_count: 0,
      p_clear_all: false,
    },
  },
  {
    name: 'stage_pnl_report_dirty_range',
    body: {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_operation_key:
        `pnl-ledger-rebuild:00000000-0000-0000-0000-000000000000:1:1:2000-01-03:${'0'.repeat(64)}`,
      p_payload_hash: '0'.repeat(64),
      p_expected_ledger_revision: 1,
      p_expected_generation: 1,
      p_portfolio_rows: [],
      p_symbol_rows: [],
    },
  },
  {
    name: 'replace_pnl_report_dirty_range',
    body: {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_operation_key:
        `pnl-ledger-rebuild:00000000-0000-0000-0000-000000000000:1:1:2000-01-03:${'0'.repeat(64)}`,
      p_payload_hash: '0'.repeat(64),
      p_expected_ledger_revision: 1,
      p_expected_generation: 1,
      p_expected_dirty_from_date: '2000-01-01',
      p_through_date: '2000-01-03',
      p_portfolio_rows: [],
      p_symbol_rows: [],
      p_clear_all: false,
    },
  },
  {
    name: 'write_pnl_report_snapshot_if_current',
    body: {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_operation_key:
        'pnl-daily-snapshot:00000000-0000-0000-0000-000000000000:1:2000-01-03',
      p_expected_ledger_revision: 1,
      p_snapshot_date: '2000-01-03',
      p_portfolio_row: {},
      p_symbol_rows: [],
    },
  },
];
const AUTHENTICATED_USER_RPCS = [
  {
    name: 'available_cash_write_contract_ready',
    body: {},
  },
  {
    name: 'mutate_available_cash',
    body: {
      p_operation_key: '00000000-0000-0000-0000-000000000000',
      p_kind: 'balance_adjustment',
      p_amount_usd: 0,
      p_expected_updated_at: null,
      p_input_currency: 'USD',
      p_input_amount: 0,
      p_usd_rate: 1,
      p_note: '',
      p_destination_label: '',
    },
  },
  {
    name: 'record_swing_wave_exit',
    body: {
      p_wave_id: '00000000-0000-0000-0000-000000000000',
      p_sell_date: '2000-01-01',
      p_sell_price_usd: 1,
      p_sell_shares: 1,
      p_expected_wave_updated_at: '2000-01-01T00:00:00.000Z',
    },
  },
  {
    name: 'update_swing_wave_exit',
    body: {
      p_wave_id: '00000000-0000-0000-0000-000000000000',
      p_exit_id: '00000000-0000-0000-0000-000000000000',
      p_sell_date: '2000-01-01',
      p_sell_price_usd: 1,
      p_sell_shares: 1,
      p_expected_wave_updated_at: '2000-01-01T00:00:00.000Z',
      p_expected_exit_updated_at: '2000-01-01T00:00:00.000Z',
    },
  },
  {
    name: 'delete_swing_wave_exit',
    body: {
      p_wave_id: '00000000-0000-0000-0000-000000000000',
      p_exit_id: '00000000-0000-0000-0000-000000000000',
      p_expected_wave_updated_at: '2000-01-01T00:00:00.000Z',
      p_expected_exit_updated_at: '2000-01-01T00:00:00.000Z',
    },
  },
];

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.text();
}

async function loadProductionSupabaseConfig() {
  const html = await fetchText(`${APP_URL}/?rls_probe=${Date.now()}`);
  const indexPaths = unique(html.match(/\/assets\/index-[^"'\s]+\.js/g) || []);
  if (indexPaths.length === 0) throw new Error('production index chunk not found');

  const indexText = await fetchText(`${APP_URL}${indexPaths[0]}`);
  const chunkPaths = unique(indexText.match(/\.\/supabase-[A-Za-z0-9_-]+\.js/g) || [])
    .map(path => `/assets/${path.replace('./', '')}`);
  if (chunkPaths.length === 0) throw new Error('production supabase chunk not found');

  const chunkText = (await Promise.all(chunkPaths.map(path => fetchText(`${APP_URL}${path}`)))).join('\n');
  const supabaseUrl = chunkText.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
  const anonKey = chunkText.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];

  if (!supabaseUrl || !anonKey) {
    throw new Error('could not extract production Supabase URL/anon key from public chunks');
  }

  return {
    supabaseUrl,
    anonKey,
    projectRef: new URL(supabaseUrl).hostname.split('.')[0],
    chunks: chunkPaths,
  };
}

async function probeAnonymousSelect({ supabaseUrl, anonKey }, { table, select }) {
  const url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  let rows = null;
  try {
    const json = JSON.parse(text);
    rows = Array.isArray(json) ? json.length : null;
  } catch {}

  return {
    table,
    status: res.status,
    visibleRows: rows,
    ok: (res.status === 200 && rows === 0) || res.status === 401 || res.status === 403,
  };
}

async function probeAnonymousRpc({ supabaseUrl, anonKey }, { name, body }) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return {
    rpc: name,
    status: res.status,
    ok: res.status === 401 || res.status === 403,
  };
}

const config = await loadProductionSupabaseConfig();
const results = [];
for (const table of [...USER_TABLES, ...SERVICE_ONLY_TABLES]) {
  results.push(await probeAnonymousSelect(config, table));
}
const rpcResults = [];
for (const rpc of [...SERVICE_ONLY_RPCS, ...AUTHENTICATED_USER_RPCS]) {
  rpcResults.push(await probeAnonymousRpc(config, rpc));
}

const failed = [...results, ...rpcResults].filter(result => !result.ok);
console.log(JSON.stringify({
  projectRef: config.projectRef,
  appUrl: APP_URL,
  checkedTables: USER_TABLES.length + SERVICE_ONLY_TABLES.length,
  sourceChunks: config.chunks,
  results,
  checkedRpcs: SERVICE_ONLY_RPCS.length + AUTHENTICATED_USER_RPCS.length,
  rpcResults,
  summary: failed.length === 0
    ? 'PASS: anonymous role cannot see user-owned rows via REST probes'
    : 'FAIL: at least one user-owned table exposed rows or returned an unexpected response',
  limitation: 'REST probe verifies anonymous data exposure only; metadata-level relrowsecurity/policy definitions require Supabase SQL/admin access.',
}, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}
