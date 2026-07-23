# Official fund composition fixtures

These deterministic, reduced fixtures preserve only the provider fields parsed
by `server/earnings/officialFundComposition.js`.

- `qqq-holdings.json`: Invesco QQQ official holdings API, effective 2026-07-22.
- `qqq-sectors.json`: Invesco QQQ official sector allocation API, effective
  2026-06-30.
- `tqqq-page.html`: ProShares TQQQ official page's “Top 10 Index Companies” and
  “Index Sector Weightings” tables, index data as of 2026-06-30.

The TQQQ fixture intentionally represents benchmark-index exposure, not direct
fund holdings. TQQQ's actual portfolio includes derivatives, so the adapter must
not present these companies as ordinary company financial-report segments.
