# Quote / boduan-tracker

Personal finance PWA for wave-trade tracking, asset review, and market signals.

## Stack

- React 18 + Vite
- Tailwind CSS
- Supabase Auth + Postgres
- Vercel Serverless Functions at `api/quote.js`, `api/btc-realtime.js`, `api/indices-realtime.js`, `api/stocks-realtime.js`, `api/earnings-calendar.js`, and `api/pnl-report-daily-snapshot.js`
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

Frontend status (2026-07-11): the standalone `WaveTrackerPage` and real page-scoped `swing_waves` CRUD are implemented locally as the pending `v10.7.9.297` release. The Trades tool tile opens this lazy page; it does not add wave rows to the global startup data load. Buy, sell, and current unit prices remain USD, while P/L amounts use the shared USD/CNY display mode. Only active wave symbols join the authenticated quote/stock-relay universe; fresh REST rows seed the quote baseline before realtime ticks, completed history consumes no relay slots, and formal ledger/watchlist symbols remain ahead of tool rows at the realtime cap. The browser does not connect to EODHD directly. This frontend has not been deployed: production still serves `v10.7.9.296` and its legacy wave UI.

For a new environment or future rebuild, keep the same sequence:

1. Confirm that `public.swing_waves` does not already exist unexpectedly with `select to_regclass('public.swing_waves');`.
2. Apply `supabase/swing_waves.sql` in the production Supabase SQL editor. `supabase/rls.sql` contains the same schema and policy for full-baseline setup.
3. Verify `pg_class.relrowsecurity = true` and inspect `pg_policies` for the authenticated `auth.uid() = user_id` policy.
4. Run `npm run verify:rls:rest`; anonymous REST must return no user rows.

Committing a SQL file does not apply future schema changes to Supabase. The authenticated two-real-user CRUD/RLS release gate for this rollout is complete, so the pending `v10.7.9.297` frontend may be deployed after the normal sensitive validation. Repeat both the REST boundary probe and cross-user isolation smoke for future RLS/schema changes. Do not clear legacy `trades` in this migration; any cleanup must be a separate, explicitly audited operation.

## Security Baseline

Before treating a deployment as safe:

1. Rotate any EODHD token that was ever committed or shown in chat/docs.
2. Remove secrets from public docs and avoid committing real `.env` files.
3. Apply `supabase/rls.sql` in the Supabase SQL editor.
4. Keep `/api/quote` authenticated; do not disable `QUOTE_API_AUTH_REQUIRED` in production.
5. Keep WebSocket streaming behind authenticated server-side relays (`/api/btc-realtime`, `/api/indices-realtime`, `/api/stocks-realtime`); never expose EODHD tokens in the browser. User stock streaming includes watchlist, main ledger positions, wave records, and cost-basis tool quote rows.

More details: `docs/security-hardening.md`.
