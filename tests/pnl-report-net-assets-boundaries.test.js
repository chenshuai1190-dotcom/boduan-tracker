import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const migrationSource = source('../supabase/pnl_report_net_assets_20260725.sql');
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
    assert.doesNotMatch(
      sql,
      /update\s+public\.pnl_report_snapshots\s+set\s+margin_debt/iu,
      `${name} must never project a current balance backward into old snapshots`,
    );
  }
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
