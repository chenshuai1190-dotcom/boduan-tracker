# X MONEY / boduan-tracker

Personal finance PWA for wave-trade tracking, asset review, and market signals.

## Stack

- React 18 + Vite
- Tailwind CSS
- Supabase Auth + Postgres
- Vercel Serverless Function at `api/quote.js`
- EODHD, Yahoo Finance, CNN FGI, and NASDAQ calendar data

## Local Setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with the real Supabase project values and a rotated EODHD API key.

## Required Environment Variables

Frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Server:

- `EODHD_API_KEY`
- `QUOTE_API_AUTH_REQUIRED=true`
- `QUOTE_ALLOWED_ORIGINS=https://boduan-tracker.vercel.app`

Do not set `VITE_EODHD_TOKEN` in production. Browser WebSocket direct mode exposes the paid EODHD token and is disabled by default.

## Checks

```bash
npm run build
npm audit
```

The GitHub Actions workflow runs `npm ci`, `npm run build`, and `npm audit`.

## Security Baseline

Before treating a deployment as safe:

1. Rotate any EODHD token that was ever committed or shown in chat/docs.
2. Remove secrets from public docs and avoid committing real `.env` files.
3. Apply `supabase/rls.sql` in the Supabase SQL editor.
4. Keep `/api/quote` authenticated; do not disable `QUOTE_API_AUTH_REQUIRED` in production.
5. Use a server-side WebSocket relay before re-enabling real-time streaming.

More details: `docs/security-hardening.md`.
