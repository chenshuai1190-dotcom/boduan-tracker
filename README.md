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
npm run verify:local-env
npm run bootstrap:local-env
npm run dev
```

`verify:local-env` checks the stable workstation env files without printing values. `bootstrap:local-env` creates the current worktree `.env.local` from `~/.config/boduan-tracker/local.env` and `~/.config/boduan-tracker/eodhd.env`; the generated file stays ignored by Git.

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

## Security Baseline

Before treating a deployment as safe:

1. Rotate any EODHD token that was ever committed or shown in chat/docs.
2. Remove secrets from public docs and avoid committing real `.env` files.
3. Apply `supabase/rls.sql` in the Supabase SQL editor.
4. Keep `/api/quote` authenticated; do not disable `QUOTE_API_AUTH_REQUIRED` in production.
5. Keep WebSocket streaming behind authenticated server-side relays (`/api/btc-realtime`, `/api/indices-realtime`, `/api/stocks-realtime`); never expose EODHD tokens in the browser. User stock streaming includes watchlist, main ledger positions, wave records, and cost-basis tool quote rows.

More details: `docs/security-hardening.md`.
