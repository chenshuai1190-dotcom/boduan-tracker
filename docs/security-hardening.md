# Security Hardening Runbook

This project started as a personal hand-built app, so the first priority is to make the current baseline safe to maintain.

## Immediate Manual Actions

1. Rotate the EODHD API token.
   - The old token appeared in repository documentation.
   - Update `EODHD_API_KEY` in Vercel after rotation.
   - Do not add the replacement token to `CONTEXT.md`, screenshots, chat logs, or frontend `VITE_` variables.

2. Verify Vercel environment variables.
   - Required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `EODHD_API_KEY`.
   - Required for server-side admin flows: `SUPABASE_SERVICE_ROLE_KEY`. Keep it server-only; never create a `VITE_` variant.
   - Required for automated close snapshots: `CRON_SECRET`. This protects `/api/pnl-report-daily-snapshot` and `/api/community-competition-daily-snapshot` and must only exist in Vercel server-side environment variables.
   - Recommended: `QUOTE_API_AUTH_REQUIRED=true`.
   - Recommended: `QUOTE_ALLOWED_ORIGINS=https://boduan-tracker.vercel.app`.
   - Do not add any frontend `VITE_` EODHD token or browser WebSocket toggle.

3. Apply Supabase RLS.
   - Run `supabase/rls.sql` in the Supabase SQL editor.
   - Confirm each user-owned table has RLS enabled and policies scoped to `auth.uid() = user_id`.
   - Run `npm run verify:rls:rest` to confirm anonymous REST clients cannot see user-owned rows.
   - Production `swing_waves` status (2026-07-11): preflight confirmed the table was absent, `supabase/swing_waves.sql` was applied to project `ykgotnmtqcqdzqtrlayq`, and the schema/grant/RLS metadata audit passed 13/13 checks. Keep this preflight/apply/audit sequence for future schema changes.
   - `swing_waves` must remain independent from `trades`, `stock_trades`, `cost_basis_trades`, and P&L snapshots. Do not include legacy-wave deletion in the table/RLS migration.
   - `community_profiles` status (2026-07-12): `supabase/community_profiles.sql` has been applied to production. It stores only nickname/avatar metadata; authenticated clients may read/insert/update only their own row, and active-member public identity is mediated by the competition API. No delete grant is given, and it remains outside trades, assets, returns, quote relay, and Storage uploads.
   - `community_competition_members` and `community_competition_snapshots` are a separate competition boundary. Their production SQL was applied on 2026-07-12 and the anonymous REST gate passes 20/20; metadata readback remains pending after the Supabase Dashboard translation-plugin crash. Authenticated clients may only read their own membership; they cannot write membership or read/write competition snapshots. Snapshot `service_role` privileges are limited to select/insert so a locked row cannot be overwritten or deleted.

4. Validate production behavior.
   - Login works.
   - Add/delete a trade only affects the current user.
   - `/api/quote` returns `401` without a Supabase access token.
   - `/api/community-competition` returns `401` without a Supabase access token, and `/api/community-competition-daily-snapshot` returns `401` without `CRON_SECRET`.
   - `/api/btc-realtime`, `/api/indices-realtime`, and `/api/stocks-realtime` reject unauthenticated WebSocket upgrades.
   - `/api/quote` returns data when called from the logged-in app.

5. Keep invite-only registration enforced.
   - Run `supabase/invite_codes.sql` or the full `supabase/rls.sql` in the Supabase SQL editor before using invite registration.
   - Set `SUPABASE_SERVICE_ROLE_KEY` only in Vercel server-side environment variables; never expose it as a `VITE_` variable or commit it.
   - Keep the frontend registration path on `/api/register`, and disable direct public signups in Supabase Auth if hard invite-only enforcement is required.
   - Only `chenshuai1190@gmail.com` should see the invite-code management panel in Settings.

6. Keep automated P&L report snapshots server-only.
   - Vercel Cron calls `GET /api/pnl-report-daily-snapshot` after the US regular-session close.
   - The endpoint must require `Authorization: Bearer <CRON_SECRET>` and must not accept normal frontend Supabase user tokens as a substitute.
   - The endpoint uses `SUPABASE_SERVICE_ROLE_KEY` only on the server to read all users' `stock_trades` and write `pnl_report_snapshots` / `pnl_report_symbol_snapshots`.
   - The route response must stay sanitized: never return `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `EODHD_API_KEY`, or raw per-user auth material.

7. Keep community competition snapshots independent and server-only.
   - `/api/community-competition` must always validate a Supabase bearer token and must not inherit the optional quote-auth bypass.
   - `/api/community-competition-daily-snapshot` rewrites into the cron-only branch of `api/community-competition.js` to stay within the Hobby 12-function limit. That branch checks `CRON_SECRET` before any work and never falls through to the user Bearer route. It reads the formal USD ledger without modifying it and writes only percentage-only competition snapshots/membership start metadata. Joining must freeze the eligible-date ledger hash; the first snapshot verifies that hash instead of trusting client-writable timestamps. The competition-only cash-flow model must include same-day buy/sell flows, adjusted-close valuation, consecutive trading-date snapshots, empty-portfolio carry, immutable ledger hashes, and per-symbol provider-failure isolation.
   - Never return user IDs, email, amounts, holdings, symbols, or trades in leaderboard responses. Missing locked snapshots or QQQ EOD closes must remain null/`--`, never mock or realtime substitutes. QQQ must be labeled as the ETF benchmark, not as the NDX index.

## Code-Level Changes In This Baseline

- `/api/quote` now requires a Supabase access token by default.
- `/api/quote` validates and caps the `symbols` parameter.
- `/api/quote` no longer sends wildcard CORS headers.
- Frontend quote calls attach the current Supabase access token.
- Browser-direct EODHD WebSocket mode has been removed from the frontend.
- BTC, three-index, and user stock streaming use authenticated server-side WebSocket relays (`/api/btc-realtime`, `/api/indices-realtime`, `/api/stocks-realtime`) and keep `EODHD_API_KEY` server-side. User stock streaming covers watchlist, main ledger positions, wave-record quote rows, and cost-basis tool quote rows.
- Registration uses `/api/register` with server-side invite-code validation; invite-code administration uses `/api/invite-codes` and requires the logged-in admin account.
- Automated P&L report snapshots use `/api/pnl-report-daily-snapshot`, protected by `CRON_SECRET`, and write only the independent P&L report snapshot tables.
- Quote provider requests now go through timeout-aware provider fetch helpers.
- First automated test baseline covers quote auth, symbol validation, provider routing, timeout behavior, and delete scoping.
- `deleteTrade` now scopes deletion by both `id` and `user_id`.
- The V2 wave feature uses a dedicated `swing_waves` row per full buy/full sell, explicit authenticated-only grants, `auth.uid() = user_id` RLS, lifecycle checks, and optimistic concurrency on edits. The production table and RLS are applied and metadata-audited. A two-real-Auth-user SQL/JWT-claim CRUD/RLS smoke passed 14/14 checks and cleanup confirmed no smoke rows; no service-role key was exported. The real standalone page and page-scoped CRUD are deployed as `v10.7.9.297`, runtime commit `b56b7127ab69bd40bee1932c12eab722ebb4064d`.
- The local V2 page must keep wave rows outside the global startup data load. Only unique active symbols may enter the existing authenticated quote universe, together with the minimal REST quote/baseline fields required for safe relay ticks; completed history must not consume relay slots, and formal ledger/watchlist rows stay ahead of tool rows at the 50-symbol cap. It must not weaken `/api/quote`, create a browser-direct EODHD path, or write `trades`, `stock_trades`, `cost_basis_trades`, or P&L snapshot tables.
- The community profile foundation is implemented for `v10.7.9.301` with production SQL applied and anonymous REST exposure blocked. It uses a dedicated `community_profiles` table for public nickname and default-avatar key only; it must not introduce avatar uploads, Supabase Storage, private profile fields, or leaderboard calculations in this rollout.
- The real community competition uses its own authenticated API, opt-in membership table, immutable percentage-only close snapshots, and independent Cron. It does not change `/api/quote`, `/api/earnings-calendar`, realtime relays, the personal P&L snapshot tables, or any trading-ledger write path.
- Stale duplicate quote implementations were removed; `api/quote.js` is the only quote API entry.
- GitHub Actions CI runs install, test, build, and audit checks.

## Known Follow-Up Work

- Continue validating server-side realtime relays in production after market-data changes.
- Continue splitting the large `src/App.jsx` into feature modules.
- Continue shrinking the quote provider modules and add error-path coverage for EODHD, Yahoo fallback, CNN, and the dedicated EODHD earnings-calendar endpoint.
- Complete metadata-level RLS verification for the remaining user-owned tables; `swing_waves` passed its 13/13 metadata checks.
- Complete a full two-real-user `community_profiles` owner/cross-user isolation smoke when a non-empty service-role or DB admin channel is available; the SQL is applied and anonymous REST boundary is already passing.
- The authenticated two-real-user CRUD/RLS isolation gate for `v10.7.9.297` is complete. The production SQL-editor smoke used two existing `auth.users`, authenticated role/JWT subject claims, and verified 14/14 owner/cross-user/lifecycle/fractional-share checks plus zero residual rows. Repeat this gate after future `swing_waves` policy or schema changes; it did not replace a password-login REST end-to-end test.
