# Lilly revenue-disclosure regression fixture

`lly-20260630.htm` is an unmodified public SEC primary HTML document downloaded
on 2026-09-10, not a generated financial-data fixture:

- Issuer: Eli Lilly and Company, LLY, CIK `0000059478`.
- Accession: `0000059478-26-000081`, Form 10-Q filed 2026-08-05.
- Official period: 2026-04-01 through 2026-06-30, FY2026 Q2.
- Source: https://www.sec.gov/Archives/edgar/data/59478/000005947826000081/lly-20260630.htm
- SHA-256: `73260e3ed862c8c129f8c075a2c083f9360dd201a143ca5797ff986d19fed221`.

The full document intentionally preserves original DEI/context/unit metadata,
the revenue text-block's nested continuation chain, the independent revenue
type/product/geography tables, six-month and MD&A distractors, explicit product
subtotals, and the single-reportable-segment disclosure. No revenue value or
table hierarchy was rewritten. Current-quarter product leaves and the five
geography rows each sum to the disclosed USD 22,974 million. Rounded prior-year
rows cannot be strictly reconciled, so the adapter does not create balancing
adjustments and leaves the comparative fields null.

The accompanying tests also generate an explicitly synthetic 2025 Q1 document
with invented product labels and amounts to prove the algorithm is not pinned
to this filing's year or numbers. Those synthetic scenarios are contract and
negative-boundary tests, not additional real-company coverage evidence. Tests
read local fixtures only and do not call SEC, EODHD or production APIs.
