# Public issuer holdings fixtures

These are public fund composition documents, not any user's portfolio or account data. Each capture date is listed below. Tests do not fetch the live sources.

- `vgt-official/`: Vanguard's fund identity, same-date stock count and full holdings responses captured on 2026-10-04. See [source details](vgt-official/README.md). The 2026-08-31 disclosure contains 318 recognized stocks and 99.67615 percent coverage; cash and derivatives remain unexpanded.
- `smh-official-2026-10-04.json`: Unmodified VanEck US SMH full-holdings JSON from https://www.vaneck.com/Main/HoldingsBlock/GetDataset/?blockId=144458&pageId=233107&ticker=SMH, linked by the official SMH page's “Get holdings” action. See the adjacent `.source.json` for provenance. The 2026-10-01 disclosure contains 25 stocks, one cash balance and an Other/Cash residual; stock coverage is 99.94 percent. Weights are disclosed percentage points. No reliable net-asset denominator is present, so the parser does not infer more precise weights from market values or normalize rounded weights. A recognized basket over 100 percent is rejected rather than silently rescaled.

- `qqq-official-2026-09-08.json`: Invesco's full QQQ holdings response, serialized as indented JSON without changing fields or values. Captured locally at 2026-09-08T14:18:17.385Z. Source: https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/QQQ/holdings/fund?idType=ticker&interval=monthly&productType=ETF. The URL is published in the `data-holding-api` attribute of the all-holdings table at https://www.invesco.com/qqq-etf/en/about.html. `effectiveBusinessDate` is 2026-09-04; the distinct `effectiveDate` is 2026-09-07. There are 107 source records including equities, ADRs, cash, a future and synthetic cash. The parser recognizes 102 positive-weight equity/ADR records, with 99.886855 percent coverage. It does not normalize recognized weights to 100 percent.
- `spy-official-2026-09-08.xlsx`: Original, unmodified binary download from https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx. Captured locally at 2026-09-08T14:17:39.502Z. Linked as “Download All Holdings: Daily” at https://www.ssga.com/us/en/individual/etfs/state-street-spdr-sp-500-etf-trust-spy. The `holdings` sheet identifies SPY and “As of 04-Sep-2026”. There are 505 rows, including USD cash and an unlisted contingent-value right. The parser recognizes 503 equity rows with 99.797453 percent coverage. Remaining weight is unresolved, not redistributed.

SMH's adapter validates the currently verified 25-security ranked basket. A change to that structure requires revalidation; neither a retained cash footer nor a plausible total is enough to accept a truncated tail.

SHA-256:

```text
6ae441563185ea0f230d4398e02e41c314bb35056e630b62f44ef63ffcb44e2f  qqq-official-2026-09-08.json
054e38e5ef18c423533edb4751aaf5e0bd1d81aac292f45b7fb24d856754a5fd  spy-official-2026-09-08.xlsx
```

The workbook is treated strictly as bounded data. The production parser does not evaluate formulas, open Excel, execute embedded content, write extracted entries, or follow relationships to external resources.
