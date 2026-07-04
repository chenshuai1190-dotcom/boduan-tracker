# Handoff for Next Developer

Date: 2026-07-04 Asia/Shanghai

This document is the first page to read when taking over `boduan-tracker`.

## Current State

- Repository: `chenshuai1190-dotcom/boduan-tracker`
- Production: `https://boduan-tracker.vercel.app`
- Runtime code verified on production: `1c91b7123e0c93b5a4dcc1842782e12830b715cd`
- Latest verified deployment record before this handoff: `1c91b7123e0c93b5a4dcc1842782e12830b715cd`.
- App changelog version shown in Settings: `v10.7.9.65`
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
- Vercel Serverless Function: `api/fx.js`
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

`npm run verify:rls:rest` currently checks anonymous REST exposure for 13 user-owned Supabase tables, including the new `stock_trades` main ledger table. It does not prove metadata-level RLS settings such as `pg_class.relrowsecurity`; that still needs Supabase SQL/admin access.

## Current Verified Production Evidence

Last runtime verification recorded:

- Runtime commit: `1c91b7123e0c93b5a4dcc1842782e12830b715cd`
- Vercel deployment: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/BbrV57wBnXWGdmajtm99yKFYxs5W`
- Production chunks: `index-PwnYXs8I.js`, `App-D95X7hSG.js`, `SettingsTab-Wq7N0WSd.js`
- `App-D95X7hSG.js` contains `/api/fx` and `xmoney_fx_rates_v1`.
- `SettingsTab-Wq7N0WSd.js` contains `v10.7.9.65` and "汇率每日自动查询".
- `/api/quote?symbols=VIX` without auth returns `401`
- `/api/fx` without auth returns `401`
- The trade-ledger refactor introduces `stock_trades` as the main buy/sell ledger. `supabase/stock_trades.sql` has been applied in production Supabase project `ykgotnmtqcqdzqtrlayq`.
- The anonymous REST probe now covers 13 user-owned tables, including `stock_trades`; all returned `visibleRows=0`.

Home current-signal design preference:

- Keep the top-right strategy reminder/entry on the compact current-signal card.
- Do not default-open strategy details.
- Do not auto-open strategy details because of alerts or level changes.
- If strategy details are reintroduced later, open them only after the user taps the entry.

Trading module boundary:

- Main positions must be derived from `stockTrades` / the `stock_trades` table via `deriveInvestmentSummary`.
- Legacy `trades` is the wave-record compatibility table only. Do not use it for homepage total assets, trade page positions, or future realized/unrealized stock reports.
- `effectiveCost` is the displayed diluted cost for remaining shares: realized sell profit/loss is spread across remaining held shares.
- Example baseline: buy NVDA 100 shares at 100, sell 10 shares at 150, then held shares are 90 and effective cost is 94.44.
- Trading tab uses the same black shell and dark bottom navigation as the home tab.
- In the position table, keep the name/code column fixed and put metrics from `市值/数量` onward in a horizontal scroll area; include `持仓盈亏` and `占比`.
- Keep the trade top asset card visually aligned with `HomeTab` asset card typography, currency toggle sizing, LIVE button weight, numeric weight, spacing, and stat grid proportions.
- The trade toolbox order is `波段记录` / `摊薄工具` / `股票设置` / `全部功能`.
- In the position table, the `占比` column should only show the percentage, without a `市值` sublabel.
- Keep `全部功能` disabled until the user defines what it should open.
- `波段记录` and `摊薄工具` should open as top asset/toolbox header plus their original module content, not mixed into the main position ledger.
- `costBasisData` remains an independent small calculator in the toolbox. Do not wire it into total assets, positions, or main trading reports unless the user explicitly changes that product rule.
- Do not add a "strategy orders" tab in the trade module; the user explicitly said it is not needed.

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
- `tests/investment-summary.test.js`

CI:

- `.github/workflows/ci.yml`: runs `npm ci`, `npm test`, `npm run build`, `npm audit`.

## What Was Recently Done

Recent important commits:

- `6028bf7`: aligned the trade top card with the home asset card, swapped cost/tool settings order, and removed the allocation sublabel.
- `37df7e3`: refined the trade tab black shell, disabled the undefined all-function entry, and made position metrics horizontally scrollable with P/L and allocation.
- `58663cd`: rebuilt the trade tab around the main manual trade ledger, added effective diluted cost, moved wave/cost tools into the toolbox, and omitted strategy orders.
- `33dab31`: rolled back the home current-signal detail list and restored the compact previous signal card.
- `20eba4d`: briefly restored the home current-signal detail list; rolled back by `33dab31`.
- `8fe2cd2`: added EODHD logo fallback from uppercase to lowercase paths so more self-selected company icons load.
- `bc97472`: made the home watchlist tab show all rows by default and changed list icons to EODHD company logos with failed images hidden.
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
