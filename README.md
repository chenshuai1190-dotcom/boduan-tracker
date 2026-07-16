# Quote / boduan-tracker

Personal finance PWA for wave-trade tracking, asset review, and market signals.

## Stack

- React 18 + Vite
- Tailwind CSS
- Supabase Auth + Postgres
- Vercel Serverless Functions include `api/quote.js`, `api/btc-realtime.js`, `api/indices-realtime.js`, `api/stocks-realtime.js`, `api/earnings-calendar.js`, `api/pnl-benchmark.js`, `api/pnl-report-daily-snapshot.js`, and `api/community-competition.js`. The three public `/api/close-snapshot-schedule*` Cron paths rewrite into the existing P&L function's cron-only scheduler, while the protected competition repair path still rewrites into the community function, so the Hobby deployment stays within its 12-function limit.
- Authenticated stock streaming covers watchlist, main ledger positions, wave records, and cost-basis tool quote rows.
- EODHD, Yahoo Finance, CNN FGI, and EODHD earnings calendar data

## Local Setup

```bash
export PATH="$HOME/.local/bin:$HOME/.local/opt/node-v22.23.1-darwin-arm64/bin:$PATH"
npm run verify:toolchain
npm ci
npm run verify:workspace-state
npm run verify:local-env
npm run bootstrap:local-env
npm run dev
```

`verify:workspace-state` summarizes the current worktree-only state such as `.env.local`, `.vercel/`, `node_modules`, `dist`, and local Vite ports. `verify:local-env` checks the stable workstation env files without printing values. `bootstrap:local-env` creates the current worktree `.env.local` from `~/.config/boduan-tracker/local.env` and `~/.config/boduan-tracker/eodhd.env`; the generated file stays ignored by Git. If a task needs Vercel env pull/link in a fresh worktree, run `npm run bootstrap:vercel-link`.

For EODHD earnings-calendar revenue validation, use the server-only local smoke:

```bash
npm run smoke:eodhd-calendar -- --symbols=NVDA,MSFT,GOOGL,META,TSM --from=2026-07-01 --to=2026-09-30
```

Details: `docs/eodhd-local-testing.md`.

### Authenticated U.S. close movers

`GET /api/quote?view=market-movers` reuses the normal Supabase bearer-token boundary and the server-only `EODHD_API_KEY`. It returns the latest authoritative close date plus 30 gainers and 30 losers from a strict NASDAQ / NYSE / NYSE American common-stock universe. The universe intersects EODHD `Type=Common Stock` classification with the current official Nasdaq Trader `nasdaqlisted.txt` / `otherlisted.txt` directories; class symbols are canonicalized before matching. ETFs, funds, preferred shares, warrants, rights, units, OTC/ARCA/BATS rows, stale-date rows, and non-stock suffixes are excluded. A cold request verifies at most 80 EODHD HomeCategory candidates per side, keeps the existing 25-second deadline, and applies a two-minute in-instance failure backoff. A directory/provider failure fails closed with a sanitized unavailable response; production has no EODHD-only, demo-ranking, or mock-data fallback.

### Authenticated stock return comparison

The stock detail page compares the current position cycle with QQQ by reading the user's formal `stock_trades`, completed-close `pnl_report_symbol_snapshots`, and ordinary closes for both the selected stock and QQQ through authenticated `GET /api/pnl-benchmark` calls. Personal snapshots contribute dates and held-share integrity only; daily mark-to-market valuations use provider `rawClose` on both sides, while formal stock trade prices remain the actual cash-flow source. The baseline is the first date on or after the later of the current cycle's first buy and the selected range start that has a personal stock snapshot plus ordinary closes for both symbols, with both sides reset to zero from the same starting capital. Later buys add the same executed dollar value to QQQ; sells trim QQQ by the same pre-sale holding ratio. Both ledgers use moving-average cost and realized-P&L dilution. Missing closes or trade/snapshot mismatches fail unavailable, and production has no synthetic return or mock fallback. The card keeps amounts primary and rates secondary. Because partial trims can leave the two diluted rate bases different, excess dollars and the return-rate gap are labeled separately; the compact UI displays the gap with a signed percent symbol and defines it explicitly as the user's return rate minus the QQQ return rate. The owner-scoped personal P&L snapshots remain user-writable under the existing product model, so this view is personal-ledger analysis rather than immutable competition or audit evidence.

## Development Workflow

Before making or handing off any change, read:

- `docs/handoff.md`
- `docs/development-process.md`
- `docs/development-log.md`
- `docs/architecture-security-audit.md`

Current rule: GitHub is the only code source of truth, Vercel deploys automatically from `main`, and every change must update `docs/development-log.md` in the same commit.

UI or feature changes that touch system copy must keep Simplified Chinese and English in sync through the i18n layer. Translate system copy only; user-authored notes, reviews, mottos, logs, remarks, and account names stay in their original language.

Use the risk-tiered workflow in `docs/development-process.md`:

- `ui-fast`: covers visual changes and local presentation-only interactions such as expand/collapse, tabs, modal open/close, focus, scrolling, keyboard visibility, and display states when they do not change business callbacks, persistence, calculations, data sources, or cross-module state. Run the directly related targeted test, `npm run build`, and `git diff --check`; do not add the full suite by default.
- `runtime`: covers business logic/calculations, persistence/database work, save/delete/submit/sync behavior, global or cross-module state, APIs/providers, auth/RLS/security, ledgers/returns/snapshots/currency conversion, routing/PWA lifecycle, dependencies, build, CI, and environment configuration. Run `npm run verify:toolchain`, `npm test`, `npm run build`, `npm audit --audit-level=moderate`, and `git diff --check`.
- `docs-only`: run `npm run verify:docs-consistency`, `git diff --check`, and `git diff --stat`.
- `sensitive`: run the runtime checks plus affected auth/RLS/API smoke tests.
- After pushing a deployable commit, use `npm run verify:deploy-status -- <commit>` for the standard GitHub/Vercel/production-entry/auth summary.

### Local iOS acceptance

All frontend visual, interaction, keyboard, scrolling, safe-area, and PWA acceptance must run in the local Xcode iOS Simulator. Desktop Chrome, Codex's in-app browser, browser viewport emulation, and `npm run verify:frontend-smoke` are not accepted as visual evidence. Automated targeted tests, `npm test`, build, docs checks, and security probes remain code gates only.

Use an available iPhone simulator, start Vite on localhost, then open the task URL inside Simulator Safari. Install it to the simulated Home Screen when standalone PWA behavior matters.

```bash
npm run dev -- --host 127.0.0.1
xcrun simctl list devices available
xcrun simctl boot <DEVICE_UDID>
open -a Simulator
xcrun simctl openurl <DEVICE_UDID> 'http://127.0.0.1:5173/?devPreview=1&tab=trades'
```

Use the iOS software keyboard for input checks (`Cmd-K` in Simulator), save Simulator screenshots under `~/Desktop/boduan-previews/`, and record the exact runtime/device plus tested path in `docs/development-log.md`.

## Required Environment Variables

Frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Server:

- `EODHD_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `QUOTE_API_AUTH_REQUIRED=true`
- `QUOTE_ALLOWED_ORIGINS=https://boduan-tracker.vercel.app`

Do not add any `VITE_` EODHD token, service-role key, or cron secret. Browser-direct market-data streaming has been removed; real-time streaming must use authenticated server-side relays.

## Checks

```bash
npm run verify:toolchain
npm test
npm run build
npm audit --audit-level=moderate
git diff --check
```

The GitHub Actions workflow runs `npm ci`, `npm test`, `npm run build`, and `npm audit`.

Docs/process consistency:

```bash
npm run verify:docs-consistency
```

Deployment status summary:

```bash
npm run verify:deploy-status -- <commit>
```

RLS exposure probe:

```bash
npm run verify:rls:rest
```

## Swing Wave V2

The V2 wave ledger is intentionally independent from the main `stock_trades` ledger, legacy `trades`, cost-basis trades, and P&L snapshots. One `swing_waves` row represents one full buy and, when completed, one full sell. Unit prices are stored in canonical USD; current prices and display-currency conversion stay outside the table.

Production database status (2026-07-11): `supabase/swing_waves.sql` has been applied to production project `ykgotnmtqcqdzqtrlayq`. The preflight confirmed that the table did not already exist, and the post-apply schema, constraints, indexes, trigger, grants, function privileges, and RLS metadata audit passed 13/13 checks. `npm run verify:rls:rest` then passed across 17 user-owned tables; `swing_waves` rejects anonymous reads with `401`. A two-real-Auth-user SQL/JWT-claim CRUD/RLS isolation smoke also passed 14/14 checks: each user saw only its own row, cross-user reads/updates/deletes affected zero rows, owner lifecycle operations and fractional shares passed, and a final cleanup query confirmed zero smoke rows. This used two existing `auth.users` with the authenticated role and per-user JWT subject claims in the production SQL editor; it did not export a service-role key or exercise password-login REST sessions. Legacy `trades` were not cleared.

Frontend status (2026-07-11): the standalone `WaveTrackerPage` and real page-scoped `swing_waves` CRUD are deployed in production as `v10.7.9.297`, runtime commit `b56b7127ab69bd40bee1932c12eab722ebb4064d`. The Trades tool tile opens this lazy page; it does not add wave rows to the global startup data load. Buy, sell, and current unit prices remain USD, while P/L amounts use the shared USD/CNY display mode. Only active wave symbols join the authenticated quote/stock-relay universe; fresh REST rows seed the quote baseline before realtime ticks, completed history consumes no relay slots, and formal ledger/watchlist symbols remain ahead of tool rows at the realtime cap. The browser does not connect to EODHD directly.

For a new environment or future rebuild, keep the same sequence:

1. Confirm that `public.swing_waves` does not already exist unexpectedly with `select to_regclass('public.swing_waves');`.
2. Apply `supabase/swing_waves.sql` in the production Supabase SQL editor. `supabase/rls.sql` contains the same schema and policy for full-baseline setup.
3. Verify `pg_class.relrowsecurity = true` and inspect `pg_policies` for the authenticated `auth.uid() = user_id` policy.
4. Run `npm run verify:rls:rest`; anonymous REST must return no user rows.

Committing a SQL file does not apply future schema changes to Supabase. The authenticated two-real-user CRUD/RLS release gate for this rollout is complete and `v10.7.9.297` is deployed. Repeat both the REST boundary probe and cross-user isolation smoke for future RLS/schema changes. Do not clear legacy `trades` in this migration; any cleanup must be a separate, explicitly audited operation.

## Community Profile Foundation

The community profile layer is intentionally separate from financial data. `community_profiles` stores only `user_id`, public `nickname`, public `avatar_key`, `profile_completed_at`, and timestamps. Existing users may still have an incomplete auto-created default until they explicitly save it. Starting with `v10.7.9.315`, new invite registrations must provide a valid 2-16 character nickname and explicitly choose one of the 18 preset avatars; the server creates the completed profile before consuming the invite and rolls back the new Auth user if profile creation or invite consumption fails. It must not store email, assets, returns, trades, P&L snapshots, or upload metadata, and it does not enable Supabase Storage uploads.

Production database status (2026-07-12): `supabase/community_profiles.sql`, the profile completion change in `supabase/community_competition.sql`, and `supabase/registration_community_profile_v315.sql` have been applied through the production Supabase SQL editor. The v315 metadata readback confirms `service_role` SELECT/INSERT, no anonymous INSERT, authenticated INSERT retained, RLS enabled, and the three owner-only authenticated policies unchanged. `npm run verify:rls:rest` passes across all 20 checked user-owned tables, and anonymous REST receives `401` for `community_profiles`, `community_competition_members`, and `community_competition_snapshots`.

For rollout:

1. Apply `supabase/community_profiles.sql` in the production Supabase SQL editor.
2. Verify schema constraints, trigger, grants, and RLS policies: authenticated users may read/insert/update only their own profile; leaderboard identity is exposed only by the authenticated competition API for active members. No delete grant is given.
3. Run `npm run verify:rls:rest`; anonymous REST must not expose user-owned rows.
4. When a non-empty service-role or DB admin channel is available, run a two-real-Auth-user isolation smoke: each user can read only their own profile row, cross-user select/update affects zero rows, owner update succeeds, and no smoke rows remain. Public leaderboard identity must remain mediated by the authenticated competition API.
5. Before deploying `v10.7.9.315`, apply `supabase/registration_community_profile_v315.sql`. It adds only server-side registration INSERT capability for `service_role`; authenticated owner policies remain unchanged and public/anonymous INSERT stays revoked. This production prerequisite was completed and read back on 2026-07-12.

## Community Return Competition

The real competition is an isolated opt-in feature. A completed community profile created during registration is identity setup only and never creates membership automatically. `community_competition_members` stores participation, the join-time eligible-ledger hash/revision, and the fixed ranking start; `community_competition_snapshots` stores only server-generated daily/cumulative return ratios, close date, lock time, source version, a one-way `ledger_hash`, and the database ledger revision used for that calculation. It never stores email, assets, positions, symbols, trades, or P&L amounts. Authenticated clients can read only their own membership and cannot read or write competition snapshots. Snapshot rows are immutable to `service_role` after insert.

`/api/community-competition` always verifies the Supabase bearer token, requires an explicitly saved community profile, freezes the eligible ledger hash at voluntary join, and returns only active-member leaderboard fields. For the internal-test leaderboard, it may additionally expose the sorted ticker codes held at the leaderboard close date, but only after the server re-derives that user's official USD ledger hash and matches it to the same-date locked competition snapshot. A mismatch returns an unavailable state instead of holdings. The response never exposes shares, cost, amounts, allocation, trade rows, user IDs, or email. `/api/community-competition-daily-snapshot` is protected by `CRON_SECRET`, reads USD `stock_trades` without mutating it, requires exact positive target-date EODHD closes, and writes only the competition tables. Its independent cash-flow return model neutralizes daily buys/sells, compounds consecutive locked daily returns, carries an already-ranked empty portfolio at zero daily return, and rejects join-baseline changes, locked-history changes, date gaps, or late records. Because this is an internal competition, a positive execution price already present in the formal ledger is accepted without checking provider raw high/low; currency, field, ordering, oversell, database-time, revision, hash, CAS, and exact-close safeguards remain enforced. A failed symbol is isolated to affected participants instead of blocking all snapshots. Missing authoritative data produces a waiting state; the UI has no mock, realtime-price, or estimate fallback. The benchmark is QQQ ETF close-to-close data, not the NDX index itself.

Daily ranking uses the current real locked close. For week, month, and year rankings, each member keeps a personal effective start: the later of that calendar period boundary and the member's fixed `ranking_start_snapshot_date`. QQQ is calculated from the same personal start, and the board sorts by `member return - same-period QQQ return`. A new member therefore enters every leaderboard after the first valid close without changing any existing member's start date or accumulated return. The participant count remains the number of active completed-profile members, while rate and average statistics use members whose real return and same-period QQQ data are complete.

Automated close jobs retry each EODHD symbol up to three times for network/timeouts, 408/429/5xx, or a successful response whose target close is not ready. Recoverable provider/data gaps return `503` rather than a false `200`; a clean competition batch that only reaches its processing budget returns `200` with `batchLimited` metadata and resumes on a later run. A no-date scheduled request resolves its trading date in `America/New_York` and does not start a weekday snapshot before 17:00 ET, one hour after the regular close. Before that gate it returns a sanitized deferred result without provider or database work. One protected scheduler now uses the UTC `21/22/23` Hobby windows, resolves one target date, and starts the independent P&L and competition runners in the same invocation; the early winter-time call safely defers and the later calls provide bounded redundancy across daylight-saving changes. The schedule paths are rewrites to the existing `CRON_SECRET`-protected P&L function, not additional public functions. Existing P&L and competition endpoints remain separate protected manual-repair boundaries. A valid explicit `date=YYYY-MM-DD` may bypass the time gate only through those independent repair paths, and an explicit competition date never performs eligibility rebaseline. Empty, impossible, future, or same-day-before-17:00 explicit dates return `400`; otherwise both jobs must confirm an exact SPY close before any business-database access. A weekend, holiday, stale provider payload, or missing SPY target therefore cannot create an empty zero-return snapshot and remains retryable `503`; permanent provider 4xx remains non-retryable. The jobs never silently fall back to an older close.

`v10.7.9.346` adds `snapshot_publication_markers`, a service-only durable completion boundary containing only `channel`, `snapshot_date`, an opaque `version`, and `completed_at`. It contains no identity, holdings, trades, or return data, uses FORCE RLS, and grants no direct table access to PUBLIC, anonymous, or authenticated roles. Database source commit `0bc0ef2cf423e9f4ac91daafc9cf8c68ba3c7d16`, its exact production migration, metadata/grant readback, and the anonymous 22-table + 2-RPC REST gate are complete; the runtime is deployed in `v10.7.9.347`. A marker is written only after the whole competition batch is complete; a partial member row never publishes a new leaderboard. Signed-in clients can read only the sanitized marker status through `/api/community-competition?operation=snapshot-status`. A visible stale PWA checks that lightweight status at most once per minute, shares the observed publication across day/week/month/year, and fetches a full period only when the durable date/version advances. Full-cache commits and identity invalidation use a cross-tab Web Lock plus monotonic publication checks; older ready/waiting responses cannot roll a newer publication back, while a strictly newer authoritative waiting state may replace an obsolete rank. Incomplete QQQ data or a transient full-read failure keeps the last complete cache and enters a bounded retry cooldown. This is a durable marker, not a Supabase Realtime publication.

`v10.7.9.348` fixes the one-time upgrade gap: production inspection found 23 existing locked competition snapshots (`8 / 7 / 8` for 2026-07-13 through 2026-07-15) but zero publication-marker rows, so the API returned waiting even though historical data remained intact. Source commit `3c85f64c0dcb26afd4b6b776f1a4039a7b0fb961` added `supabase/snapshot_publication_marker_bootstrap_20260716.sql`; the exact committed SQL (`SHA-256 b53314d864dd568d5525814de681be9e3d758edf2dc1da8654f85ed5080de806`) was applied to production. It runs only while the competition marker is empty, considers dates before 2026-07-16, locks the relevant profile/member/snapshot/marker boundary, and selects the newest exact complete locked batch. Every expected member must have a completed profile, valid eligibility and ranking baseline, a strict 64-hex ledger hash, and a non-negative revision; any missing or unexpected row rejects that date, and no complete candidate raises an exception and rolls back. Production postflight confirmed one marker at `2026-07-13` with version `verified_bootstrap_20260716`; the snapshot count stayed 23, the `8 / 7 / 8` distribution and digest `4e144e79415dd4f423bcfd76b8fe500b` were unchanged, and completeness was 8 expected / 8 locked / 0 missing with one later-start member. The migration inserted only the service-only marker and did not create, update, delete, or backfill snapshots, returns, rankings, trades, or holdings. Incomplete 2026-07-14/15 batches remain for the normal post-17:00 ET scheduler.

`v10.7.9.349` fixes a separate client-side PWA wake-up gap. Production snapshot, marker, and authenticated leaderboard API checks were complete, while the affected Home Screen PWA continued making its other normal requests but made zero `community-competition` requests. The waiting cache had already consumed its two bounded full-read attempts before the marker was backfilled, had no initialized `snapshot-status` metadata, and therefore remained behind `attempt_limit` until the next New York close window. Cache v5 invalidates those v4 entries. Only an eligible `waiting_snapshot` entry for the current target that has exhausted the full reads and has no current-target status check starts the lightweight authenticated `snapshot-status` poll; a full leaderboard read still occurs only after the marker date/version advances. This changes no snapshot, return, ranking, trade, participation eligibility, marker, or database row.

`v10.7.9.350` closes the remaining partial-batch gap. The scheduled competition catch-up repairs every missing real trading day in order from the member's last immutable snapshot; the production-shaped regression covers the former July 14 raw-low rejection and confirms July 14 then July 15 are written once and only once. Before publishing a marker, the server now rereads the active, completed-profile ranked cohort and requires one valid exact-date locked snapshot per expected member. A 7/8 or 8/9 batch returns a sanitized retryable `503` and is retried; only 8/8 or 9/9 may advance the board. The daily card labels the real `asOfDate` and no longer presents the later marker completion time as the return date. No mock, estimate, realtime price, or client-side return is introduced.

Scheduled personal P&L runs validate the computed target against SPY and use SPY's real sessions within the latest 31-calendar-day window to fill each existing user's missing dates in order. A user with no portfolio marker is intentionally scheduled only for the current target date, not for an invented history. Before rewriting a user/date, the portfolio completion marker is removed; symbol rows are then replaced and the marker is written last, so a partial database failure remains visible to the next run and self-heals.

Competition catch-up reads the complete SPY session sequence from the earliest active anchor through the target and advances at most 5 trading dates or 250 member-days per invocation, resuming the remainder on later scheduled runs. A joined member with no trades writes no empty snapshot and does not block other members. Before a first snapshot, only database-verifiable current-target-day pure inserts may start normally; older post-eligibility activity or an unprovable mutation moves the eligibility baseline forward at the current real close instead of reconstructing untrusted historical returns. Ranking metadata recovery verifies both the earliest and latest locked ledger hashes before restoring the earliest locked start date.

A forward-only recovery is available only to an active member who has zero official competition snapshots across the table and whose two ranking fields are both null. It covers an eligible-hash mismatch, migration-era untrusted state, older post-eligibility activity, delete/update traces, and any revision delta that cannot be proven to consist exclusively of current-target-day inserts created after the frozen baseline and before 16:00 ET. The D1 scheduled run validates every formal ledger row, including symbol/date/side, non-empty USD currency, positive price and shares, ordering, and oversell rules. It must fetch the exact positive D1 EOD row for SPY and every relevant stock; a missing D1 stock row, provider failure, or an older close blocks the RPC. A D1 trade must use database-authored timestamps proving the same New York date and creation no later than 16:00 ET; its positive formal-ledger execution price is accepted without a raw high/low range gate. Only then may the service-only compare-and-set RPC move the eligible date/hash/revision forward. D1 writes no snapshot, initializes no ranking, and reports no return. The first snapshot may be written only on the next real U.S. close, D2, if the ledger remains unchanged and the normal exact-EOD checks pass. Another intervening change moves the baseline forward again. Any existing snapshot or ranking permanently disables rebaseline, and an explicit-date request never invokes it.

`stock_trade_ledger_revisions` is a private, force-RLS table. Database triggers authoritatively set trade timestamps and atomically increment a user's opaque revision on every formal-ledger insert, update, or delete. Join, rebaseline, and snapshot guard all lock the revision row before the membership row and compare the expected revision; the insert guard also rejects a snapshot not strictly after eligibility. The migration holds a writer lock while seeding legacy revisions and installing triggers, so no mutation can fall between those steps. PUBLIC, anonymous, and authenticated clients cannot read the revision table or execute the service-only RPCs. Malformed formal rows are never filtered or silently normalized before hashing; they reject the member instead. Neither job fabricates returns nor modifies `stock_trades`; locked competition rows are never overwritten, and production has no mock, realtime-price, estimated-return, or old-close fallback.

Historical production recovery verification for the previous runtime (2026-07-14): commit `9e1c840e0b336a0352b79f691b7ce3a3b252ff98` passed GitHub Actions run `29313005445` and Vercel deployment `DSGn5mQnzs2o1x6ohQWD6DGrMy2Y`. The `2026-07-13` personal repair produced 12 portfolio rows for 12 users plus 54 symbol rows across 18 symbols. The competition repair produced 8 locked rows for 8 users; aggregate membership state was 9 active, 9 eligible, 8 initialized, with 0 invalid snapshot rows. One not-yet-ranked member remained rejected as `eligible_ledger_hash_mismatch`. This is historical baseline evidence only, not proof that the newly deployed ET gate has completed a real-close D1/D2 cycle.

Production status for this release (2026-07-14): database source commit `0f52700761beab0d4488e067ca9e968aea9a9bc1` passed GitHub Actions run `29320513471`, and the exact committed `supabase/community_competition_rebaseline_20260714.sql` was applied to production project `ykgotnmtqcqdzqtrlayq`. Metadata readback passed for the private force-RLS revision table, required columns, database-authoritative timestamp/revision triggers, membership/snapshot guards, postgres function owners, SECURITY DEFINER/invoker flags, fixed search paths, service-only join/rebaseline grants, and removal of the old five-argument overload. `npm run verify:rls:rest` passed 21 table probes plus 2 anonymous RPC-denial probes. A two-session read-only concurrency smoke locked revision then membership in both sessions; the waiter completed after the holder rolled back, and neither session returned an identity or wrote business data. Runtime `8f23a471be3cd63b657bf1f7a807c438881a23ea` then passed GitHub Actions run `29321470173` and Vercel target `CkNECvKe9N3WGSLokcaWFdYkUxvg`; production entry remains `/assets/index-DrckgGpM.js`. Unauthenticated quote, market-movers, earnings, P&L benchmark, competition and both GET-only snapshot routes reject with `401`. Real-close D1/D2 observation remains pending and must never be prefilled.

## Security Baseline

Before treating a deployment as safe:

1. Rotate any EODHD token that was ever committed or shown in chat/docs.
2. Remove secrets from public docs and avoid committing real `.env` files.
3. Apply `supabase/rls.sql` in the Supabase SQL editor.
4. Keep `/api/quote` authenticated; do not disable `QUOTE_API_AUTH_REQUIRED` in production.
5. Keep WebSocket streaming behind authenticated server-side relays (`/api/btc-realtime`, `/api/indices-realtime`, `/api/stocks-realtime`); never expose EODHD tokens in the browser. User stock streaming includes watchlist, main ledger positions, wave records, and cost-basis tool quote rows.

More details: `docs/security-hardening.md`.
