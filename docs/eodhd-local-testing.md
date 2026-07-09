# EODHD Local Testing

This project keeps EODHD credentials server-only. Never commit `.env`, `.env.local`, API keys, screenshots of keys, or copied key values.

## Local Key Setup

The current workstation has a local `.env.local` created from the EODHD control panel on 2026-07-09 after user authorization. The file is `chmod 600` and ignored by Git through `.gitignore`.

For a fresh checkout:

```bash
cp .env.example .env.local
chmod 600 .env.local
```

Then add the real server-only key:

```bash
EODHD_API_KEY=...
```

Do not add `VITE_EODHD_TOKEN` and do not expose this key in browser code.

## Earnings Calendar Smoke

Run the real upstream smoke from the repo root:

```bash
npm run smoke:eodhd-calendar -- --symbols=NVDA,MSFT,GOOGL,META,TSM --from=2026-07-01 --to=2026-09-30
```

Expected behavior with the current EODHD account:

- `/api/calendar/earnings` returns report rows, dates, EPS fields, and currency, but does not include revenue estimate fields.
- `/api/calendar/trends` returns `trends` as nested arrays, one inner array per requested symbol.
- Trend rows include `revenueEstimateAvg` and `revenueEstimateNumberOfAnalysts`.
- The project merge step should report `revenueMerged` greater than `0`; on 2026-07-09, NVDA/MSFT/GOOGL/META/TSM returned 5 earnings events, 472 trend rows, and 5 merged revenue estimates.

The smoke output intentionally prints only status, counts, field names, and merged numeric estimates. It does not print the API key.

## Debug Notes

If the app shows empty "预计营收" while this smoke passes locally:

- Confirm production `EODHD_API_KEY` is the same account tier or has Calendar Trends permission.
- Confirm `/api/earnings-calendar` is deployed with the `flattenTrendRows` normalization fix.
- Confirm the requested symbol has a matching trends row near the earnings `report_date` or fiscal `date`.
- Keep `/api/earnings-calendar` separate from `/api/quote`; do not move calendar reads back into the quote provider.
