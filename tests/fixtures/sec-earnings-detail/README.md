# SEC earnings detail fixtures

These fixtures are compact, deterministic representations of the relevant
tables in official GOOGL, TSLA, and NVDA Form 10-Q primary documents. They preserve:

- the visible SEC table headings and row labels;
- inline-XBRL facts on representative rows;
- the original USD values, expressed in millions in the document and expected
  as raw USD in the API;
- exact reported-quarter period metadata; and
- a six-month distractor table that must never be selected as the quarter.

The fixtures intentionally cover only the first-release contracts:

- GOOGL: three reportable segments with operating income, six revenue
  categories, four geographies, and the revenue hedging reconciliation;
- TSLA: two reportable segments with gross profit, six revenue categories, and
  three geographies;
- NVDA: the official fiscal Q1 2027 13-week period (2026-01-26 through
  2026-04-26), two reportable segments with operating income, three disjoint
  market-platform leaves, and four geographies. Its values and dimensions come
  from SEC accession `0001045810-26-000052`; the Data Center subtotal is
  intentionally omitted so it cannot be double-counted with its two child rows.

They are parser regression fixtures, not complete copies of the SEC filings.
