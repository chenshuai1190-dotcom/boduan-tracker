const APP_URL = 'https://boduan-tracker.vercel.app';
const USER_TABLES = [
  'trades',
  'stock_trades',
  'stock_trade_ledger_revisions',
  'swing_waves',
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
  'disciplines',
  'review_logs',
  'yearly_actuals',
  'cost_basis_trades',
].map(table => ({ table, select: 'user_id' }));
const SERVICE_ONLY_TABLES = [
  { table: 'snapshot_publication_markers', select: 'channel' },
  { table: 'margin_debt_events', select: 'user_id' },
  { table: 'margin_debt_history_meta', select: 'version' },
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
for (const rpc of SERVICE_ONLY_RPCS) {
  rpcResults.push(await probeAnonymousRpc(config, rpc));
}

const failed = [...results, ...rpcResults].filter(result => !result.ok);
console.log(JSON.stringify({
  projectRef: config.projectRef,
  appUrl: APP_URL,
  checkedTables: USER_TABLES.length + SERVICE_ONLY_TABLES.length,
  sourceChunks: config.chunks,
  results,
  checkedRpcs: SERVICE_ONLY_RPCS.length,
  rpcResults,
  summary: failed.length === 0
    ? 'PASS: anonymous role cannot see user-owned rows via REST probes'
    : 'FAIL: at least one user-owned table exposed rows or returned an unexpected response',
  limitation: 'REST probe verifies anonymous data exposure only; metadata-level relrowsecurity/policy definitions require Supabase SQL/admin access.',
}, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}
