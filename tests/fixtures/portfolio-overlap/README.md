# Public issuer holdings fixtures

Collected on 2026-09-08. These are public fund composition documents, not any user's portfolio or account data. Tests do not fetch the live sources.

- `qqq-official-2026-09-08.json`: Invesco's full QQQ holdings response, serialized as indented JSON without changing fields or values. Captured locally at 2026-09-08T14:18:17.385Z. Source: https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/QQQ/holdings/fund?idType=ticker&interval=monthly&productType=ETF. The URL is published in the `data-holding-api` attribute of the all-holdings table at https://www.invesco.com/qqq-etf/en/about.html. `effectiveBusinessDate` is 2026-09-04; the distinct `effectiveDate` is 2026-09-07. There are 107 source records including equities, ADRs, cash, a future and synthetic cash. The parser recognizes 102 positive-weight equity/ADR records, with 99.886855 percent coverage. It does not normalize recognized weights to 100 percent.
- `spy-official-2026-09-08.xlsx`: Original, unmodified binary download from https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx. Captured locally at 2026-09-08T14:17:39.502Z. Linked as “Download All Holdings: Daily” at https://www.ssga.com/us/en/individual/etfs/state-street-spdr-sp-500-etf-trust-spy. The `holdings` sheet identifies SPY and “As of 04-Sep-2026”. There are 505 rows, including USD cash and an unlisted contingent-value right. The parser recognizes 503 equity rows with 99.797453 percent coverage. Remaining weight is unresolved, not redistributed.

SHA-256:

```text
6ae441563185ea0f230d4398e02e41c314bb35056e630b62f44ef63ffcb44e2f  qqq-official-2026-09-08.json
054e38e5ef18c423533edb4751aaf5e0bd1d81aac292f45b7fb24d856754a5fd  spy-official-2026-09-08.xlsx
```

The workbook is treated strictly as bounded data. The production parser does not evaluate formulas, open Excel, execute embedded content, write extracted entries, or follow relationships to external resources.
