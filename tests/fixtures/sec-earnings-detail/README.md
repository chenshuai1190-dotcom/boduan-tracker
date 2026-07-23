# SEC earnings detail fixtures

These fixtures are compact, deterministic representations of the relevant
tables in the GOOGL and TSLA 2026 Q2 Form 10-Q primary documents. They preserve:

- the visible SEC table headings and row labels;
- inline-XBRL facts on representative rows;
- the original USD values, expressed in millions in the document and expected
  as raw USD in the API;
- exact three-month period metadata; and
- a six-month distractor table that must never be selected as the quarter.

The fixtures intentionally cover only the first-release contracts:

- GOOGL: three reportable segments with operating income, six revenue
  categories, four geographies, and the revenue hedging reconciliation;
- TSLA: two reportable segments with gross profit, six revenue categories, and
  three geographies.

They are parser regression fixtures, not complete copies of the SEC filings.
