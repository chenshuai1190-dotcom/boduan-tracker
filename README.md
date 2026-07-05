# X MONEY / boduan-tracker

Personal finance PWA for wave-trade tracking, asset review, and market signals.

## Stack

- React 18 + Vite
- Tailwind CSS
- Supabase Auth + Postgres
- Vercel Serverless Functions at `api/quote.js`, `api/btc-realtime.js`, `api/indices-realtime.js`, and `api/stocks-realtime.js`
- Authenticated stock streaming covers watchlist, main ledger positions, wave records, and cost-basis tool quote rows.
- EODHD, Yahoo Finance, CNN FGI, and NASDAQ calendar data

## Local Setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with the real Supabase project values and a rotated EODHD API key.

## Development Workflow

Before making or handing off any change, read:

- `docs/handoff.md`
- `docs/development-process.md`
- `docs/development-log.md`
- `docs/architecture-security-audit.md`

Current rule: GitHub is the only code source of truth, Vercel deploys automatically from `main`, and every change must update `docs/development-log.md` in the same commit.

## Required Environment Variables

Frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Server:

- `EODHD_API_KEY`
- `QUOTE_API_AUTH_REQUIRED=true`
- `QUOTE_ALLOWED_ORIGINS=https://boduan-tracker.vercel.app`

Do not add any `VITE_` EODHD token. Browser-direct market-data streaming has been removed; real-time streaming must use authenticated server-side relays.

## Checks

```bash
npm test
npm run build
npm audit
```

The GitHub Actions workflow runs `npm ci`, `npm test`, `npm run build`, and `npm audit`.

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
