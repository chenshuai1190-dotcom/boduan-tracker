const APP_URL = 'https://boduan-tracker.vercel.app';
const USER_TABLES = [
  'trades',
  'stock_trades',
  'swing_waves',
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

async function probeAnonymousSelect({ supabaseUrl, anonKey }, table) {
  const url = `${supabaseUrl}/rest/v1/${table}?select=user_id&limit=1`;
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

const config = await loadProductionSupabaseConfig();
const results = [];
for (const table of USER_TABLES) {
  results.push(await probeAnonymousSelect(config, table));
}

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  projectRef: config.projectRef,
  appUrl: APP_URL,
  checkedTables: USER_TABLES.length,
  sourceChunks: config.chunks,
  results,
  summary: failed.length === 0
    ? 'PASS: anonymous role cannot see user-owned rows via REST probes'
    : 'FAIL: at least one user-owned table exposed rows or returned an unexpected response',
  limitation: 'REST probe verifies anonymous data exposure only; metadata-level relrowsecurity/policy definitions require Supabase SQL/admin access.',
}, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}
