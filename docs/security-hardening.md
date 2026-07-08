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
   - Required for automated P&L report snapshots: `CRON_SECRET`. This protects `/api/pnl-report-daily-snapshot` and must only exist in Vercel server-side environment variables.
   - Recommended: `QUOTE_API_AUTH_REQUIRED=true`.
   - Recommended: `QUOTE_ALLOWED_ORIGINS=https://boduan-tracker.vercel.app`.
   - Do not add any frontend `VITE_` EODHD token or browser WebSocket toggle.

3. Apply Supabase RLS.
   - Run `supabase/rls.sql` in the Supabase SQL editor.
   - Confirm each user-owned table has RLS enabled and policies scoped to `auth.uid() = user_id`.
   - Run `npm run verify:rls:rest` to confirm anonymous REST clients cannot see user-owned rows.

4. Validate production behavior.
   - Login works.
   - Add/delete a trade only affects the current user.
   - `/api/quote` returns `401` without a Supabase access token.
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
- Stale duplicate quote implementations were removed; `api/quote.js` is the only quote API entry.
- GitHub Actions CI runs install, test, build, and audit checks.

## Known Follow-Up Work

- Continue validating server-side realtime relays in production after market-data changes.
- Continue splitting the large `src/App.jsx` into feature modules.
- Continue shrinking the quote provider modules and add error-path coverage for EODHD, Yahoo fallback, CNN, and NASDAQ partial failures.
- Add metadata-level Supabase RLS verification through SQL/admin access.
