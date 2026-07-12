# Quote / boduan-tracker

Personal finance PWA for wave-trade tracking, asset review, and market signals.

## Stack

- React 18 + Vite
- Tailwind CSS
- Supabase Auth + Postgres
- Vercel Serverless Functions at `api/quote.js`, `api/btc-realtime.js`, `api/indices-realtime.js`, `api/stocks-realtime.js`, `api/earnings-calendar.js`, `api/pnl-report-daily-snapshot.js`, and `api/community-competition.js`. The separate public Cron path `/api/community-competition-daily-snapshot` rewrites into the community function's cron-only branch so the Hobby deployment stays within its 12-function limit.
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

## Development Workflow

Before making or handing off any change, read:

- `docs/handoff.md`
- `docs/development-process.md`
- `docs/development-log.md`
- `docs/architecture-security-audit.md`

Current rule: GitHub is the only code source of truth, Vercel deploys automatically from `main`, and every change must update `docs/development-log.md` in the same commit.

UI or feature changes that touch system copy must keep Simplified Chinese and English in sync through the i18n layer. Translate system copy only; user-authored notes, reviews, mottos, logs, remarks, and account names stay in their original language.

Use the risk-tiered workflow in `docs/development-process.md`:

- `runtime`: run `npm run verify:toolchain`, `npm test`, `npm run build`, `npm audit --audit-level=moderate`, and `git diff --check`.
- `docs-only`: run `npm run verify:docs-consistency`, `git diff --check`, and `git diff --stat`.
- `sensitive`: run the runtime checks plus affected auth/RLS/API smoke tests.
- After pushing a deployable commit, use `npm run verify:deploy-status -- <commit>` for the standard GitHub/Vercel/production-entry/auth summary.

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

The real competition is an isolated opt-in feature. A completed community profile created during registration is identity setup only and never creates membership automatically. `community_competition_members` stores participation, the join-time eligible-ledger hash, and the fixed ranking start; `community_competition_snapshots` stores only server-generated daily/cumulative return ratios, close date, lock time, source version, and a one-way `ledger_hash` integrity value. It never stores email, assets, positions, symbols, trades, or P&L amounts. Authenticated clients can read only their own membership and cannot read or write competition snapshots. Snapshot rows are immutable to `service_role` after insert.

`/api/community-competition` always verifies the Supabase bearer token, requires an explicitly saved community profile, freezes the eligible ledger hash at voluntary join, and returns only active-member leaderboard fields. For the internal-test leaderboard, it may additionally expose the sorted ticker codes held at the leaderboard close date, but only after the server re-derives that user's official USD ledger hash and matches it to the same-date locked competition snapshot. A mismatch returns an unavailable state instead of holdings. The response never exposes shares, cost, amounts, allocation, trade rows, user IDs, or email. `/api/community-competition-daily-snapshot` is protected by `CRON_SECRET`, reads USD `stock_trades` without mutating it, uses adjusted EODHD closes with raw daily high/low validation, and writes only the competition tables. Its independent cash-flow return model neutralizes daily buys/sells, compounds consecutive locked daily returns, carries an already-ranked empty portfolio at zero daily return, and rejects join-baseline changes, locked-history changes, date gaps, late records, or out-of-range prices. A failed symbol is isolated to affected participants instead of blocking all snapshots. Missing authoritative data produces a waiting state; the UI has no mock, realtime-price, or estimate fallback. The benchmark is QQQ ETF close-to-close data, not the NDX index itself.

Production database status (2026-07-12): `supabase/community_competition.sql` has been applied and the anonymous REST gate passes 20/20. The SQL/admin metadata result still needs to be read after the Supabase Dashboard translation-plugin crash is cleared. For future changes, apply the SQL, audit its RLS/grants, and rerun `npm run verify:rls:rest`; committing the SQL file alone does not update production Supabase.

## Security Baseline

Before treating a deployment as safe:

1. Rotate any EODHD token that was ever committed or shown in chat/docs.
2. Remove secrets from public docs and avoid committing real `.env` files.
3. Apply `supabase/rls.sql` in the Supabase SQL editor.
4. Keep `/api/quote` authenticated; do not disable `QUOTE_API_AUTH_REQUIRED` in production.
5. Keep WebSocket streaming behind authenticated server-side relays (`/api/btc-realtime`, `/api/indices-realtime`, `/api/stocks-realtime`); never expose EODHD tokens in the browser. User stock streaming includes watchlist, main ledger positions, wave records, and cost-basis tool quote rows.

More details: `docs/security-hardening.md`.
