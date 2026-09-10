# Official SEC ordinary-HTML release fixtures

Retrieved 2026-09-10 through six bounded public SEC requests (ticker map, ARM submissions/index/EX-99.1 announcement/EX-99.2 letter, and the previously identified AVGO EX-99.1). No EODHD, credentials, account data or production writes.

The two reduced fixture files retain the selected financial tables with all their original rows/cells, including `colspan` and `rowspan`, plus factual issuer/period captions needed for identity verification. Unrelated narrative, guidance, later reconciliation tables, and decorative markup are omitted; caption wrappers are normalized. No retained financial facts, dates or unit labels were changed. The original full-response SHA-256 is recorded below and in each fixture. Mutated fixtures inside tests are explicitly synthetic negative/dynamic-contract tests, not additional live-company regressions.

## AVGO — Broadcom FY2026 Q3

- CIK `0001730168`; 8-K accession `0001730168-26-000076`; filed 2026-09-02; EX-99.1.
- [Official source](https://www.sec.gov/Archives/edgar/data/1730168/000173016826000076/avgo-08022026x8kxex99.htm).
- Original SHA-256: `cce08d125724af16210eb7480ea5486a145ffc44ba66f5e25b8311158fa3b07b`.
- Official quarter ended 2026-08-02. The same statement's prior-quarter end is 2026-05-03, so the current period starts 2026-05-04, not a calendar-month approximation.
- Report segments: Semiconductor solutions 20,839 / 9,166 and Infrastructure software 8,752 / 6,786; current/prior totals 29,591 / 15,952, all millions of USD. Both totals must independently agree with the GAAP highlights and single-quarter statement-of-operations columns. Cumulative three-quarter figures are not used.

## ARM — Arm Holdings plc FY2027 Q1

- CIK `0001973239`; 6-K accession `0001973239-26-000113`; filed 2026-07-29, accepted 16:02:28 US Eastern / 20:02:28 UTC; EX-99.2.
- [Official source](https://www.sec.gov/Archives/edgar/data/1973239/000197323926000113/exhibit992fye27q130-junx26.htm).
- [Official filing index](https://www.sec.gov/Archives/edgar/data/1973239/000197323926000113/0001973239-26-000113-index.html). EX-99.1 is only the short publication announcement, with no financial table; it must not be mistaken for the EX-99.2 shareholder letter.
- Original SHA-256: `a044670c281d4ba38ae9c714fe769885e65d2ab509302d92d0eda9813dd2a4da`.
- Explicit three months ended 2026-06-30 means 2026-04-01–2026-06-30, FY2027 Q1. Revenue streams: royalty 715 / 585, license and other 574 / 468; current/prior totals 1,289 / 1,053, millions of USD. The overview's GAAP quarter columns must agree with the separate quarterly consolidated income statement.
- This issuer-specific USD profile recognizes the verified ARM financial statement convention `in millions` plus `$`; the letter does not literally spell out `USD`. This is NOT a generic `$ → USD` conversion. CIK, issuer name, official SEC accession/path, EX-99.2, exact table labels, GAAP headings, same-quarter dates and both totals remain mandatory. Explicit GBP/EUR/CNY/HKD/CAD/AUD/NZD/SGD/TWD/JPY or foreign-currency-symbol conflicts are rejected.

Current revenue must independently reconcile and match the same-document GAAP statement. Prior revenue is independently optional: a missing/mismatched prior header, missing value, conflicting total or failed prior reconciliation clears every comparative in that section and `previousTotalRevenue` to `null`, without hiding a verified current quarter. Metric availability uses `{status, reason}` objects and is tested through the client normalizer.

Neither adapter fabricates segment profit, undisclosed geographical breakdown, or EPS summary overrides. GAAP and non-GAAP EPS cannot replace a provider's expectation-comparable EPS without a separately verified basis contract.
