# Foreign issuer business-composition fixtures

These fixtures preserve only the official rows needed to exercise the
deterministic NOK and TSM parsers. They are intentionally small rather than
copies of the full issuer reports.

Official sources:

- NOK Q2 2026 Form 6-K:
  `https://www.sec.gov/Archives/edgar/data/924613/000110465926086081/tm2621179d1_6k.htm`
- TSM 2Q26 quarterly-results page:
  `https://investor.tsmc.com/english/quarterly-results/2026/q2`
- TSM 2Q26 Management Report linked by that page:
  `https://investor.tsmc.com/english/encrypt/files/encrypt_file/reports/2026-07/6f49632674bd2d0fd48cb65aaf89ec6ab510b559/2Q26%20ManagementReport.pdf`

NOK values are disclosed in EUR millions. TSM publishes platform, geography,
and process-technology composition as rounded percentages; the adapter derives
display amounts from the same report's official current and prior-year USD
revenue totals and preserves the disclosed percentages alongside those
amounts.
