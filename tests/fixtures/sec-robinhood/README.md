# Robinhood SEC revenue-source fixture

The checked-in `hood-20260630-excerpt.htm` contains verbatim Inline XBRL
contexts, units, selected DEI identity facts, and monetary facts extracted from
the official Robinhood Markets, Inc. primary 10-Q. Only surrounding layout and
unrelated facts are omitted. The document opening namespaces are preserved.
This is an offline parser fixture, not a replacement filing or a provider feed.

- Issuer: Robinhood Markets, Inc. / HOOD / CIK `0001783879`.
- Filing: `10-Q`, accession `0001783879-26-000114`, filed `2026-07-30`.
- Official fiscal period: `2026-04-01` through `2026-06-30`, FY 2026 Q2.
- Primary: [SEC primary 10-Q](https://www.sec.gov/Archives/edgar/data/1783879/000178387926000114/hood-20260630.htm).
- Index: [SEC filing index](https://www.sec.gov/Archives/edgar/data/1783879/000178387926000114/0001783879-26-000114-index.htm).
- Read directly from SEC on `2026-09-10`; no EODHD, keys, account data, or
  third-party figures were used.
- Original downloaded bytes: `2,968,425`.
- Original SHA-256: `454b499aaf20768afba029cc336539b37c3aa3b79aef20ab5cbced68769616fc`.
- Fixture SHA-256: `3ece6bd957ad8794822059a1d91626b62f7aeb10e0861c82e9cbb9eb8c6b3b72`.

The fixture retains same-quarter prior-year and year-to-date facts, repeated
identical official facts, transaction children, and gross/net securities-lending
interest. These deliberately expose the distinctions the parser must preserve.

| Top-level source | 2026 Q2 USD millions | 2025 Q2 USD millions |
| --- | ---: | ---: |
| Transaction-based revenues | 776 | 539 |
| Net interest revenues | 389 | 357 |
| Other revenues | 143 | 93 |
| Total net revenues | 1,308 | 989 |

The three sources are mutually exclusive revenue categories, not reportable
operating segments. The parser does not add transaction children to their parent
or add gross interest to net interest. For example, the retained securities-
lending detail reports gross interest 112, interest expense 102, and net 10;
none is an additional fourth source alongside consolidated net interest 389.
Segment operating income and geographic revenue are not fabricated.

Tests modify copies in memory to exercise identity, context, currency, period,
hierarchy, conflicts and reconciliation boundaries. Those mutations (including
the shifted-year example) are synthetic negative/robustness tests, not alternate
actual SEC filings. Test execution is fully offline.
