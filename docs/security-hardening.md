# Security Hardening Runbook

This project started as a personal hand-built app, so the first priority is to make the current baseline safe to maintain.

## Immediate Manual Actions

1. Rotate the EODHD API token.
   - The old token appeared in repository documentation.
   - Update `EODHD_API_KEY` in Vercel after rotation.
   - Do not add the replacement token to `CONTEXT.md`, screenshots, chat logs, or frontend `VITE_` variables.

2. Verify Vercel environment variables.
   - Required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `EODHD_API_KEY`.
   - Recommended: `QUOTE_API_AUTH_REQUIRED=true`.
   - Recommended: `QUOTE_ALLOWED_ORIGINS=https://boduan-tracker.vercel.app`.
   - Do not add any frontend `VITE_` EODHD token or browser WebSocket toggle.

3. Apply Supabase RLS.
   - Run `supabase/rls.sql` in the Supabase SQL editor.
   - Confirm each user-owned table has RLS enabled and policies scoped to `auth.uid() = user_id`.

4. Validate production behavior.
   - Login works.
   - Add/delete a trade only affects the current user.
   - `/api/quote` returns `401` without a Supabase access token.
   - `/api/quote` returns data when called from the logged-in app.

## Code-Level Changes In This Baseline

- `/api/quote` now requires a Supabase access token by default.
- `/api/quote` validates and caps the `symbols` parameter.
- `/api/quote` no longer sends wildcard CORS headers.
- Frontend quote calls attach the current Supabase access token.
- Browser-direct EODHD WebSocket mode has been removed from the frontend.
- `deleteTrade` now scopes deletion by both `id` and `user_id`.
- Stale duplicate quote implementations were removed; `api/quote.js` is the only quote API entry.
- GitHub Actions CI runs install, build, and audit checks.

## Known Follow-Up Work

- Add a server-side relay before enabling real-time streaming.
- Continue splitting the large `src/App.jsx` into feature modules.
- Add focused tests around database writes and quote API auth.
