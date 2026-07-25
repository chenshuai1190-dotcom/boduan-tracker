import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const migrationSource = source('../supabase/pnl_report_net_assets_20260725.sql');
const verifiedBackfillMigrationSource = source('../supabase/pnl_report_net_assets_verified_backfill_20260725.sql');
const canonicalSource = source('../supabase/pnl_report_snapshots.sql');
const rlsSource = source('../supabase/rls.sql');
const snapshotModelSource = source('../src/lib/pnlReportSnapshots.js');
const snapshotDbSource = source('../src/lib/pnlReportDb.js');
const snapshotServerSource = source('../server/pnlReportDailySnapshot.js');
const marginDbSource = source('../src/lib/db.js');
const pageSource = source('../src/pages/PnlReportPage.jsx');
const chartSource = source('../src/lib/pnlReportChart.js');
const devPreviewSource = source('../src/DevVisualPreview.jsx');
const i18nSource = source('../src/lib/i18n.js');
const rlsProbeSource = source('../scripts/verify-rls-rest.mjs');

test('net-assets SQL keeps one exact service-owned history contract across migration and canonical schemas', () => {
  for (const [name, sql] of [
    ['migration', migrationSource],
    ['P&L canonical schema', canonicalSource],
    ['RLS canonical schema', rlsSource],
  ]) {
    assert.ok(sql.includes('create table if not exists public.margin_debt_history_meta'), `${name} must define the history boundary`);
    assert.ok(sql.includes('seed_completed_at'), `${name} must distinguish completed seed state`);
    assert.ok(sql.includes('margin_debt_history_meta_seed_order_check'), `${name} must repair and enforce seed ordering on existing metadata tables`);
    assert.ok(sql.includes('margin debt history metadata exists without a completed seed'), `${name} must fail closed on an incomplete one-time seed`);
    assert.ok(sql.includes('create table if not exists public.margin_debt_events'), `${name} must define append-only financing events`);
    assert.ok(sql.includes('clock_timestamp()'), `${name} must use database-authoritative event time`);
    assert.ok(sql.includes("time '17:00'") && sql.includes("'America/New_York'"), `${name} must use the fixed New York close cutoff`);
    assert.ok(sql.includes('add column if not exists margin_debt_usd'), `${name} must upgrade an existing portfolio snapshot table`);
    assert.ok(sql.includes('add column if not exists net_assets_usd'), `${name} must add generated net assets to an existing table`);
    assert.ok(sql.includes("alter column source_version set default 'pnl_snapshot_v2'"), `${name} must default new rows to schema v2`);
    assert.ok(sql.includes('create or replace function public.protect_pnl_report_margin_snapshot'), `${name} must protect authoritative financing fields from browser writes`);
    assert.ok(sql.includes("coalesce(auth.role(), '') = 'service_role'"), `${name} must allow the trusted runtime explicitly`);
    assert.ok(sql.includes('alter table public.margin_debt_events force row level security'), `${name} must force RLS on financing events`);
    assert.ok(sql.includes('alter table public.margin_debt_history_meta force row level security'), `${name} must force RLS on history metadata`);
    assert.ok(sql.includes('grant execute on function public.resolve_margin_debt_snapshot_targets(jsonb)'), `${name} must grant only the controlled resolver`);
  }
  assert.doesNotMatch(
    migrationSource,
    /update\s+public\.pnl_report_snapshots\s+set\s+margin_debt/iu,
    'the initial migration must never project a current balance backward into old snapshots',
  );
});

test('verified admin repair adds a narrow pre-boundary history anchor and stays idempotent', () => {
  for (const [name, sql] of [
    ['verified backfill migration', verifiedBackfillMigrationSource],
    ['P&L canonical schema', canonicalSource],
    ['RLS canonical schema', rlsSource],
  ]) {
    assert.ok(sql.includes("'verified_backfill_v1'"), `${name} must use explicit corrective provenance`);
    assert.ok(sql.includes('margin_debt_events_verified_backfill_unique_idx'), `${name} must deduplicate corrective events`);
    assert.ok(sql.includes("coalesce(event.source = 'verified_backfill_v1', false)"), `${name} must make only a verified pre-boundary event known`);
    assert.doesNotMatch(sql, /migration_source_anchor_v1/u, `${name} must not retain the superseded generic source`);
  }

  for (const [name, sql] of [
    ['P&L canonical schema', canonicalSource],
    ['RLS canonical schema', rlsSource],
  ]) {
    assert.equal(sql.includes('margin_debt_verified_backfills'), false, `${name} must remain replayable without production account data`);
    assert.equal(sql.includes('verified margin backfill account must resolve exactly once'), false, `${name} must not embed one-off production assertions`);
    assert.equal(sql.includes('with backfill_candidates as'), false, `${name} must not replay the one-off snapshot mutation`);
  }

  const sql = verifiedBackfillMigrationSource;
  assert.ok(sql.includes('margin_debt_verified_backfills'), 'the one-off migration must use an explicit authorization manifest');
  assert.ok(sql.includes("'chenshuai1190@gmail.com'"), 'the one-off migration must target only the confirmed admin account');
  assert.ok(sql.includes("timestamptz '2026-07-23T15:28:49.797Z'"), 'the verified persisted financing time must be exact');
  assert.ok(sql.includes("timestamptz '2026-07-25T14:04:35.791941Z'"), 'the audited history-system boundary must be exact');
  assert.ok(sql.includes('verified margin backfill account must resolve exactly once'), 'the admin account lookup must fail closed');
  assert.ok(sql.includes('verified margin backfill must match the audited history boundary'), 'the production history boundary must fail closed');
  assert.ok(sql.includes('verified margin backfill must match one positive migration seed'), 'the persisted positive seed must fail closed');
  assert.ok(sql.includes('verified margin backfill target set must match the manifest exactly'), 'the authorized target set must be materialized exactly');
  assert.ok(sql.includes('verified margin backfill must create exactly one matching event'), 'every manifest row must produce exactly one event');
  assert.ok(sql.includes('verified margin event falls outside the authorized manifest'), 'unexpected verified events must abort the repair');
  assert.ok(sql.includes('seed.effective_at = manifest.history_started_at'), 'the seed must match the audited migration instant');
  assert.ok(sql.includes("set local statement_timeout = '30s'"), 'the one-off mutation must have a bounded statement timeout');
  assert.ok(sql.includes('on conflict (user_id, source, effective_at)'), 'the one-off migration must be safe to run repeatedly');
  assert.ok(sql.includes("candidate.source = 'verified_backfill_v1'"), 'snapshot repair must use verified events only');
  assert.ok(sql.includes("snapshot.snapshot_date + time '17:00'"), 'snapshot eligibility must use the New York 17:00 cutoff');
  assert.ok(sql.includes("at time zone 'America/New_York' >= target.effective_at"), 'the verified start boundary must be inclusive');
  assert.ok(sql.includes("at time zone 'America/New_York' < target.history_started_at"), 'the repair must stop at the existing history boundary');
  assert.ok(sql.includes('snapshot.margin_debt_usd is null'), 'already-known financing rows must not be overwritten');
  assert.ok(sql.includes("margin_debt_basis = 'event'"), 'repaired snapshots must retain event provenance');
  assert.ok(sql.includes("source_version = 'pnl_snapshot_v2'"), 'repaired snapshots must use the current schema');
  assert.ok(sql.includes('snapshot.margin_debt_usd is distinct from event.margin_debt_usd'), 'postconditions must verify the exact repaired amount');
  assert.doesNotMatch(
    sql,
    /set[\s\S]{0,300}\btotal_assets_usd\s*=/iu,
    'the verified repair must never rewrite total assets',
  );

  const verifiedAt = Date.parse('2026-07-23T15:28:49.797Z');
  const historyStartedAt = Date.parse('2026-07-25T14:04:35.791941Z');
  const closeCutoffs = {
    '2026-07-22': Date.parse('2026-07-22T21:00:00.000Z'),
    '2026-07-23': Date.parse('2026-07-23T21:00:00.000Z'),
    '2026-07-24': Date.parse('2026-07-24T21:00:00.000Z'),
  };
  assert.ok(closeCutoffs['2026-07-22'] < verifiedAt, '7/22 must remain unknown before the verified financing time');
  assert.ok(closeCutoffs['2026-07-23'] >= verifiedAt && closeCutoffs['2026-07-23'] < historyStartedAt, '7/23 must be eligible for repair');
  assert.ok(closeCutoffs['2026-07-24'] >= verifiedAt && closeCutoffs['2026-07-24'] < historyStartedAt, '7/24 must be eligible for repair');
});

test('daily snapshot runtime resolves and validates every financing target before any P&L mutation', () => {
  const resolveIndex = snapshotServerSource.indexOf('const marginDebtSnapshotsByUser = await resolveMarginDebtSnapshotTargets');
  const mutationIndex = snapshotServerSource.indexOf('await upsertUserSnapshots(userId, built)');
  assert.ok(resolveIndex >= 0 && mutationIndex > resolveIndex, 'the service-only resolver must run before snapshot mutation');
  assert.ok(snapshotServerSource.includes("typeof row?.known !== 'boolean'"), 'RPC known state must be a strict boolean');
  assert.ok(snapshotServerSource.includes("row.margin_debt_basis === 'default_zero'"), 'zero financing must keep explicit provenance');
  assert.ok(snapshotServerSource.includes("row.margin_debt_basis !== 'event'"), 'event financing must keep explicit provenance');
  assert.ok(snapshotServerSource.includes('seenKeys.has(key)'), 'duplicate RPC rows must fail closed');
  assert.ok(snapshotServerSource.includes('rows.length !== targetKeys.size'), 'missing or extra RPC rows must fail closed');
  assert.ok(snapshotServerSource.includes('margin_debt_effective_at: snapshot.marginDebtEffectiveAt || null'), 'portfolio rows must persist the exact effective event time');
});

test('browser rebuilds cannot overwrite trusted financing history and current saves activate event capture', () => {
  assert.ok(snapshotDbSource.includes('snapshot.marginDebtUsd == null && !snapshot.marginDebtBasis'), 'browser rows must omit unknown financing fields');
  assert.ok(snapshotDbSource.includes('margin_debt_event_id: snapshot.marginDebtEventId == null ? null'), 'known trusted rows must preserve their event pointer');
  assert.ok(marginDbSource.includes('logic_version: HOME_MARGIN_LOGIC_VERSION'), 'Home financing writes must activate logic version 2');
  assert.equal(pageSource.includes('marginStatus'), false, 'the report page must not read mutable current financing');
  assert.equal(pageSource.includes('currentMargin'), false, 'the report page must not derive history from the current balance');
});

test('the visible segment remains Total Assets Trend while the chart shows exact net and total assets', () => {
  assert.ok(snapshotModelSource.includes("PNL_REPORT_SNAPSHOT_VERSION = 'pnl_snapshot_v2'"));
  assert.ok(snapshotDbSource.includes("snapshot.sourceVersion || 'pnl_snapshot_v2'"));
  assert.ok(snapshotServerSource.includes("snapshot.sourceVersion || 'pnl_snapshot_v2'"));
  assert.equal(snapshotDbSource.includes("snapshot.sourceVersion || 'pnl_snapshot_v1'"), false);
  assert.equal(snapshotServerSource.includes("snapshot.sourceVersion || 'pnl_snapshot_v1'"), false);
  assert.ok(pageSource.includes("pnlReport.assetTrend', '总资产走势'"), 'the requested Chinese segment name must remain unchanged');
  assert.ok(i18nSource.includes("'pnlReport.assetTrend': '总资产走势'"));
  assert.ok(i18nSource.includes("'pnlReport.assetTrend': 'Total Assets Trend'"));
  assert.ok(pageSource.includes("const NET_ASSET_COLOR = '#ff5038'"));
  assert.ok(pageSource.includes("const TOTAL_ASSET_COLOR = '#f6b54b'"));
  assert.ok(pageSource.includes("buildChartDomain(data, ['netAssetUsd', 'totalAssetUsd'], 'assets')"), 'both lines must share one amount axis');
  assert.ok(pageSource.includes('data-pnl-report-asset-tooltip="true"'));
  assert.ok(pageSource.includes("pnlReport.tooltip.netAssets"));
  assert.ok(pageSource.includes("pnlReport.tooltip.totalAssets"));
});

test('asset chart gaps and deterministic dev-preview scenarios stay wired to the UI', () => {
  assert.ok(pageSource.includes('splitChartPointSegments(data, primaryPoints, isExplicitUnknownNetAssetPoint)'));
  assert.ok(pageSource.includes('primaryPaths.map'));
  assert.ok(pageSource.includes('areaPaths.map'));
  assert.ok(chartSource.includes('isRenderableNumber(point?.totalAssetUsd)'));
  assert.ok(chartSource.includes('!isRenderableNumber(point?.netAssetUsd)'));
  assert.ok(pageSource.includes("pnlReportInitialChartMode === 'assets' ? 'assets' : 'pnl'"));
  assert.ok(pageSource.includes("selectableSlots.find((slot) => slot?.point?.date === initialSelectedDate)"));
  assert.ok(pageSource.includes("document.addEventListener('pointerdown', closeOnOutsidePointer, true)"));
  assert.ok(pageSource.includes("document.removeEventListener('pointerdown', closeOnOutsidePointer, true)"));

  assert.ok(devPreviewSource.includes("get('pnlReportChart') === 'assets'"));
  assert.ok(devPreviewSource.includes("get('pnlReportAssetScenario')"));
  assert.ok(devPreviewSource.includes("['unknown', 'mixed']"));
  assert.ok(devPreviewSource.includes("['default_zero', 'mixed']"));
  assert.ok(devPreviewSource.includes("['negative', 'mixed']"));
  assert.ok(devPreviewSource.includes("normalizedScenario === 'benchmark_only'"));
  assert.ok(devPreviewSource.includes('pnlReportInitialChartMode'));
  assert.ok(devPreviewSource.includes('pnlReportTooltipDate'));
});

test('P&L report chart text respects the 10px minimum', () => {
  assert.equal(pageSource.includes('fontSize="9"'), false);
  assert.equal(pageSource.includes('text-[8.5px]'), false);
  assert.ok(pageSource.includes('fontSize="10"'));
  assert.ok(pageSource.includes('text-[10px]'));
});

test('anonymous REST probes cover the service-only financing tables and resolver', () => {
  assert.ok(rlsProbeSource.includes("{ table: 'margin_debt_events', select: 'user_id' }"));
  assert.ok(rlsProbeSource.includes("{ table: 'margin_debt_history_meta', select: 'version' }"));
  assert.ok(rlsProbeSource.includes("name: 'resolve_margin_debt_snapshot_targets'"));
});
