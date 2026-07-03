# Handoff for Next Developer

Date: 2026-07-03 Asia/Shanghai

This document is the first page to read when taking over `boduan-tracker`.

## Current State

- Repository: `chenshuai1190-dotcom/boduan-tracker`
- Production: `https://boduan-tracker.vercel.app`
- Runtime code verified on production: `eb47a1defc56ef44300a25af8930bb4984d28732`
- Latest verified docs/deployment record before this handoff: this handoff/docs-only commit, recording runtime `eb47a1defc56ef44300a25af8930bb4984d28732`.
- App changelog version shown in Settings: `v10.7.9.54`
- Current development branch used by Codex: `main`

The product is usable and deployed, but it is still a hand-built MVP that needs more architecture hardening before large professional finance features are added.

## Read These First

Read in this order before changing code:

1. `docs/handoff.md`
2. `README.md`
3. `docs/development-process.md`
4. `docs/development-log.md`
5. `docs/security-hardening.md`
6. `docs/architecture-security-audit.md`

The most important rule: GitHub `main` is the code source of truth. Do not edit application code directly in Vercel, Tencent Cloud, browser consoles, or temporary server files.

Default delivery rule: unless the user explicitly says "only implement locally" or "do not deploy", every completed, verified change must be pushed to GitHub `main`, allowed to trigger Vercel production deployment, and followed by production verification.

## Product Summary

`boduan-tracker` is a personal finance PWA for:

- wave-trade tracking
- watchlist and market signals
- asset and account review
- investment goals
- monthly review logs
- cost-basis calculations

The app uses Supabase Auth and Postgres for user data, Vercel for hosting and serverless API, and `/api/quote` for market data proxying.

## Tech Stack

- React 18 + Vite
- Tailwind CSS
- Supabase Auth + Postgres
- Vercel Serverless Function: `api/quote.js`
- Market data: EODHD, Yahoo Finance, CNN Fear & Greed, NASDAQ calendar
- Tests: Node built-in test runner via `node --test`

Node requirement from `package.json`: `^20.19.0 || >=22.12.0`.

On the current Mac workspace, Node 22 is available at:

```bash
PATH="$HOME/.local/opt/node-v22.23.1-darwin-arm64/bin:$PATH"
```

## Required Environment

Frontend public env:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Server/private env:

- `EODHD_API_KEY`
- `QUOTE_API_AUTH_REQUIRED=true`
- `QUOTE_ALLOWED_ORIGINS=https://boduan-tracker.vercel.app`

Do not add any `VITE_` EODHD token. Browser-direct EODHD WebSocket access has been removed. Future real-time market data must use a server-side relay.

## First Commands

Start from a clean clone or clean checkout of GitHub `main`:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git status --short --branch
npm ci
npm test
npm run build
npm audit
npm run verify:rls:rest
```

For every change, create a narrow branch:

```bash
git checkout -b codex/<short-task-name>
```

## Validation Baseline

Before pushing deployable changes, run:

```bash
npm test
npm run build
npm audit
git diff --check
```

For production-sensitive changes, also verify:

```bash
curl -i 'https://boduan-tracker.vercel.app/api/quote?symbols=VIX'
npm run verify:rls:rest
```

Expected `/api/quote` unauthenticated result: `401`.

`npm run verify:rls:rest` currently checks anonymous REST exposure for 12 user-owned Supabase tables. It does not prove metadata-level RLS settings such as `pg_class.relrowsecurity`; that still needs Supabase SQL/admin access.

## Current Verified Production Evidence

Last runtime verification recorded:

- Runtime commit: `eb47a1defc56ef44300a25af8930bb4984d28732`
- GitHub Actions `CI`: success, run `28668049380`
- Vercel deployment: success, target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/9UPP3BLCdE2FhyWNybx6XRoHPMd3`
- Production chunks: `index-Dv996v4w.js`, `App-BqYxDnF0.js`, `HomeTab-BQFTB0wJ.js`, `SettingsTab-Tord0uk8.js`
- `HomeTab-BQFTB0wJ.js` contains `查看全部`, `min-h-[43px]`, `text-[13px]`, `text-[10px]`, and the tightened table grid class.
- `SettingsTab-Tord0uk8.js` contains `v10.7.9.54`, "首页自选/持仓列表按效果图重排", "列表改为 3 行预览", and "行尾箭头、行高和分隔线按效果图调整".
- `/api/quote?symbols=VIX` without auth returns `401`
- Local Chrome DevTools Protocol mobile preview before deploy showed no horizontal overflow offenders; default preview shows 3 stock rows, `查看全部` is visible, `添加` / `记一笔` are absent, row height is 43px, symbol font is 13px, company-name font is 10px, and price font is 13px.
- RLS REST probe was not rerun for this UI-only change; the last recorded probe still showed 12 user-owned tables returned `visibleRows=0`.

Known non-blocking CI warning:

- GitHub Actions reports that `actions/checkout@v4` and `actions/setup-node@v4` target Node.js 20 and are forced onto Node.js 24. The job still passes, but the workflow should be upgraded later.

## Code Map

Core app:

- `src/AuthGate.jsx`: Supabase session gate.
- `src/Login.jsx`: login screen.
- `src/App.jsx`: main authenticated app shell. Still large, about 4300 lines.
- `src/tabs/HomeTab.jsx`: home/dashboard tab.
- `src/tabs/TradesTab.jsx`: trades tab.
- `src/tabs/AnalysisTab.jsx`: assets/analysis tab.
- `src/tabs/ReviewTab.jsx`: goals/review tab.
- `src/tabs/SettingsTab.jsx`: settings, backup, changelog.

Data and API:

- `src/lib/supabase.js`: Supabase client.
- `src/lib/db.js`: Supabase CRUD layer. Still too broad, about 730 lines.
- `src/lib/dbGuards.js`: tested delete scoping helpers.
- `api/quote.js`: Vercel serverless market-data endpoint wrapper for auth, validation, dispatch, and response.
- `server/quote/auth.js`: quote API auth and CORS.
- `server/quote/errors.js`: quote API error bodies.
- `server/quote/http.js`: timeout-aware provider fetch.
- `server/quote/providerHandlers.js`: provider dispatch from normalized symbol to implementation.
- `server/quote/providers.js`: symbol-to-provider routing.
- `server/quote/providers/*`: VIX, CNN FGI, EODHD stock/fundamentals, Google Translate, indices, and NASDAQ calendar providers.
- `server/quote/response.js`: quote API response envelope.
- `server/quote/symbols.js`: symbol validation and normalization.

Security and database:

- `supabase/rls.sql`: RLS enablement and user-scoped policies.
- `scripts/verify-rls-rest.mjs`: production anonymous REST exposure probe.
- `docs/security-hardening.md`: security runbook.

Tests:

- `tests/quote-handler.test.js`
- `tests/quote-http.test.js`
- `tests/quote-response-shape.test.js`
- `tests/quote-symbols.test.js`
- `tests/db-guards.test.js`

CI:

- `.github/workflows/ci.yml`: runs `npm ci`, `npm test`, `npm run build`, `npm audit`.

## What Was Recently Done

Recent important commits:

- `eb47a1d`: matched home watchlist/positions table typography and row density to the provided screenshot.
- `21242f0`: refined home asset-card density, shrank current signal, and changed the fourth market card to BTC/USD.
- `81e202c`: recorded deployment trigger for the home typography update.
- `ba94dfa`: tightened home typography hierarchy and removed the duplicate exchange-rate text.
- `5b40b9d`: refined home currency toggle and dark home bottom navigation styling.
- `3ca274c`: rebuilt the home investment-account dashboard.
- `af69dc9`: recorded quote boundary deployment verification.
- `7be8caf`: split quote API boundaries and added safety tests.
- `c6be61f`: deleted old `部署指南.md`.
- `3d50aad`: recorded architecture security deployment.
- `2bb9772`: removed browser-direct EODHD WebSocket token path and added architecture audit.
- `b13efcf`: split authenticated tabs into lazy chunks.
- `d249b58`: split login/auth and app bundles.

Recent security baseline now in place:

- `/api/quote` requires Supabase access token by default.
- Frontend no longer reads `VITE_EODHD_TOKEN`.
- Browser-direct EODHD WebSocket path removed.
- EODHD key should exist only as server env `EODHD_API_KEY`.
- `symbols` query is validated and capped before provider calls.
- Provider requests use timeout-aware helpers.
- Delete operations are guarded with `user_id` scoping.
- First test suite exists and runs in CI.

## Current Architecture Risk

Do not start large professional-feature work yet. Finish the safety and structure cleanup first.

Main risks:

- `src/App.jsx` is still too large and owns too much state.
- Tab files are lazy chunks but not true feature modules yet.
- Quote provider business logic is now out of `api/quote.js`, but `server/quote/providers/eodhd.js` is still large and should be split further before major market-data features.
- `src/lib/db.js` lacks schema validation and migration checks.
- Financial calculations need pure functions and tests.
- RLS metadata has not been verified through Supabase SQL/admin access.

## Recommended Next Work

Priority 1: finish quote API modularization hardening.

- Continue splitting `server/quote/providers/eodhd.js` into smaller stock, fundamentals, and shared parsing helpers.
- Keep response-shape tests current for:
  - `VIX`
  - `FGI`
  - `INDICES`
  - `CALENDAR`
  - `ANALYST:<symbol>`
  - normal stock symbols
- Add provider error-path tests for EODHD failures, Yahoo fallback, and partial calendar failures.

Priority 2: add a pure finance calculation layer.

- Extract cost basis, P/L, drawdown, allocation, and risk calculations.
- Add tests for empty data, partial sells, multi-account snapshots, splits, stale quotes, and invalid rows.

Priority 3: verify Supabase RLS at metadata level.

- Use Supabase SQL editor or admin connection.
- Confirm `relrowsecurity = true` for every user-owned table.
- Confirm policies are scoped to `auth.uid() = user_id`.
- Keep `npm run verify:rls:rest` as the external exposure probe.

Priority 4: continue feature boundary split.

- Create feature folders under `src/features/*`.
- Move tab-specific state and calculations into hooks.
- Shrink `src/App.jsx` into shell/orchestration only.

Priority 5: dependency modernization.

- Upgrade `lucide-react` first.
- Defer React 19 and Tailwind 4 until tests and visual smoke checks exist.

## Rules That Must Not Be Broken

- Do not commit real `.env` files, API keys, screenshots with secrets, Supabase service role keys, or EODHD tokens.
- Do not add `VITE_EODHD_TOKEN`.
- Do not disable quote auth in production.
- Do not bypass Supabase session verification for startup speed.
- Do not deploy a change if `/api/quote` unauthenticated no longer returns `401`.
- Do not treat build success as enough for security-sensitive changes.
- Every code/config/security/docs change must update `docs/development-log.md` in the same commit.
- Every user-visible product change must also update the Settings page changelog.

## Deployment Flow

Normal flow:

1. Branch from latest GitHub `main`.
2. Implement narrowly.
3. Run local validation.
4. Update `docs/development-log.md`.
5. Commit and push.
6. Open PR when possible, or fast-forward `main` only with explicit user authorization.
7. Let Vercel deploy from `main`.
8. Verify production URL, GitHub Actions, Vercel status, and task-specific smoke checks.
9. Record production verification in `docs/development-log.md`.

## Rollback Guidance

Prefer reverting the specific bad commit instead of broad reset commands.

For the latest runtime safety baseline:

- Reverting `7be8caf` would remove the quote API boundary split, first tests, RLS REST probe, and delete guard tests. Do this only if a production blocker is directly caused by that commit.
- Reverting `2bb9772` would restore the browser-direct EODHD WebSocket token path. Avoid this unless a secure server-side relay is ready.

## Open Questions for the Next Developer

- Can you access Supabase SQL/admin to verify RLS metadata directly?
- Should old `CONTEXT.md` be refreshed or deleted after the architecture split?
- Which professional feature is first after Phase 0: broker integration, risk engine, alerts, or portfolio attribution?
- Should CI add linting now, or wait until module boundaries are cleaner?
