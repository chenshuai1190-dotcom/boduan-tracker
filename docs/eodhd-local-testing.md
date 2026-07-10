# EODHD Local Testing

This project keeps EODHD credentials server-only. Never commit `.env`, `.env.local`, API keys, screenshots of keys, or copied key values.

## Local Key Setup

The current workstation keeps the reusable local EODHD key outside per-session worktrees at:

```text
~/.config/boduan-tracker/eodhd.env
```

That file is local-only, `chmod 600`, and must never be committed, copied into docs, pasted into chat, or printed to terminal output. New Codex sessions should report only whether the key is present or missing.

The smoke script reads `EODHD_API_KEY` in this order:

1. `process.env.EODHD_API_KEY`
2. current worktree `.env.local`
3. `~/.config/boduan-tracker/eodhd.env`

If the stable local file is missing, create it from the authorized EODHD control panel value:

```bash
mkdir -p ~/.config/boduan-tracker
chmod 700 ~/.config/boduan-tracker
printf 'EODHD_API_KEY=...\n' > ~/.config/boduan-tracker/eodhd.env
chmod 600 ~/.config/boduan-tracker/eodhd.env
```

For a fresh checkout that needs all app env vars, `.env.local` is still supported and remains ignored by Git:

```bash
npm run verify:local-env
npm run bootstrap:local-env
```

If the stable workstation files do not exist yet, fall back to a manual `.env.local` and add only server-side secrets locally:

```bash
cp .env.example .env.local
chmod 600 .env.local
EODHD_API_KEY=...
```

Do not add `VITE_EODHD_TOKEN` and do not expose this key in browser code.

## Earnings Calendar Smoke

Run the real upstream smoke from the repo root:

```bash
npm run smoke:eodhd-calendar -- --symbols=NVDA,MSFT,GOOGL,META,TSM --from=2026-07-01 --to=2026-09-30
```

For the previous-quarter published-report review path used by the earnings-calendar modal:

```bash
npm run smoke:eodhd-calendar -- --symbols=NVDA,MSFT,GOOGL,META,TSM --from=2026-04-01 --to=2026-06-30
```

Expected behavior with the current EODHD account:

- `/api/calendar/earnings` returns report rows, dates, EPS fields, and currency, but does not include revenue estimate fields.
- For historical published reports, `/api/calendar/earnings` can include `actual`, `estimate`, `difference`, and `percent`. Symbol-filtered calendar calls may prefer upcoming rows, so the app uses date-window calendar reads and filters to the requested user symbols.
- `/api/calendar/trends` returns `trends` as nested arrays, one inner array per requested symbol.
- Trend rows include `revenueEstimateAvg` and `revenueEstimateNumberOfAnalysts`.
- The same fiscal `date` can include both `+1q` and `0q` trend rows. For the report being displayed, prefer `period: "0q"`; otherwise the app may accidentally use the next-quarter estimate.
- Published actual revenue is read from EODHD Fundamentals v1.1 with `filter=Financials::Income_Statement::quarterly`, matched only by the same fiscal `date`; do not substitute another quarter if the exact row is missing.
- Published comparison uses a broker-style basis when data is available: reported value plus year-over-year change next to estimate value plus estimate year-over-year change. Revenue YoY comes from the exact same-quarter prior-year income-statement row; EPS estimate YoY comes from EODHD trends, and EPS actual YoY uses `earningsEstimateYearAgoEps` as the prior-year basis.
- Published market reaction is derived from EODHD daily EOD closes: pre-market reports use previous trading close to report-date close; after-market reports use report-date close to next trading close.
- The project merge step should report `revenueMerged` greater than `0`; on 2026-07-09, NVDA/MSFT/GOOGL/META/TSM returned 5 earnings events, 472 trend rows, and 5 merged revenue estimates.
- For published historical windows such as `--from=2026-04-01 --to=2026-06-30`, the project merge should also show non-zero `publishedMerged`, `actualRevenueMerged`, and `marketReactionMerged` when the requested symbols have already reported. On 2026-07-09, the previous-quarter smoke above returned 5 merged published events for NVDA/MSFT/GOOGL/META/TSM.
- The app's authenticated `/api/earnings-calendar` request can pass `includePreviousPublished=1`; the handler keeps the normal current/future window and adds the previous completed calendar quarter as a separate server-side published-report window, then filters back to the requested user symbols.

The smoke output intentionally prints only status, counts, field names, and merged numeric estimates. It does not print the API key.

## Debug Notes

If the app shows empty "预计营收" while this smoke passes locally:

- Confirm production `EODHD_API_KEY` is the same account tier or has Calendar Trends permission.
- Confirm `/api/earnings-calendar` is deployed with the `flattenTrendRows` normalization fix.
- Confirm the requested symbol has a matching trends row near the earnings `report_date` or fiscal `date`.
- For empty "实际营收", confirm Fundamentals contains an exact quarterly income-statement row matching the earnings fiscal `date`.
- For empty "盘前/盘后反应", confirm EODHD EOD has both required close rows around the report date; very recent after-market reports may not have the next trading close yet.
- Keep `/api/earnings-calendar` separate from `/api/quote`; do not move calendar reads back into the quote provider.
