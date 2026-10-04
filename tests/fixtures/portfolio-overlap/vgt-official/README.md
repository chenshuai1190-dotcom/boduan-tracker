# Vanguard VGT official fixtures

Captured from public Vanguard endpoints on 2026-10-04. These files retain the
response bytes; no portfolio weights or security identifiers were modified.

- `fund-2026-10-04.json`: fund identity from
  <https://advisors.vanguard.com/investments/products/api/funds/0958>.
- `statistics-2026-08-31.json`: dated stock count from
  <https://advisors.vanguard.com/investments/products/api/funds/0958/analytics/portfolio-statistics>.
- `holdings-2026-08-31.json`: complete disclosed basket from
  <https://advisors.vanguard.com/investments/products/api/funds/0958/holdings/latest>.

The endpoints are used by the official product page:
<https://advisors.vanguard.com/investments/products/vgt/vanguard-information-technology-etf>.
Its fund store requests `/funds/{portId}`, its portfolio analytics store requests
`/funds/{portId}/analytics/portfolio-statistics`, and its holdings store requests
`/funds/{portId}/holdings/latest`, under `/investments/products/api`.

The identity response identifies `portId: "0958"`, ticker `VGT`, and the Vanguard
Information Technology ETF. Statistics and holdings both report 2026-08-31;
`CSTOCK` and the equity array both contain 318 securities.

`percentOfFunds` is expressed in percentage points, with up to five decimal
places. Recognized equity weights total 99.67615%; short-term reserves total
0.24390% (including a -0.00938% US-dollar balance), and derivatives total 0.08002%.
The raw total is 100.00007% from source rounding. No weights are normalized.
Cash, reserves and derivatives are not assigned to companies. The duplicate
`allocationToUnderlyingFunds` and `shortTermReservesMoneyMarket` display views
are not counted again.

This is the latest disclosure returned when captured, not a claim that the
portfolio is current to October. Production retains the August disclosure date
and applies its existing stale-data label.
