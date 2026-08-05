# SEC earnings fixtures

These fixtures are deliberately small, auditable slices of SEC responses as observed on 2026-07-23. They are not complete filing pages.

Official Q2 2026 sources:

- TSLA: `https://www.sec.gov/Archives/edgar/data/1318605/000162828026049213/exhibit991.htm`
- TSM: `https://www.sec.gov/Archives/edgar/data/1046179/000104617926000451/a2q26e_withguidancexfinal.htm`
- TSM 2Q26 USD translation: `https://investor.tsmc.com/english/encrypt/files/encrypt_file/reports/2026-07/114aaca0fea2050e96b91fffbab9ed04ba09cd92/FS.pdf`
- TSM 2Q25 USD translation: `https://investor.tsmc.com/english/encrypt/files/encrypt_file/qr/phase4_reports/2025-07/98cc58082f7dbc20c9898e6ab77e1bf4c3693298/FS.pdf`
- GOOGL: `https://www.sec.gov/Archives/edgar/data/1652044/000165204426000066/googexhibit991q22026.htm`
- IBKR: `https://www.sec.gov/Archives/edgar/data/1381197/000138119726000118/ibkr-ex99_1.htm`
- AMD 2Q26 release: `https://www.sec.gov/Archives/edgar/data/2488/000000248826000121/q22026991.htm`
- AMD 2Q26 10-Q / XBRL: `https://www.sec.gov/Archives/edgar/data/2488/000000248826000123/amd-20260627.htm`

`*-submissions.json` and `*-filing-index.{html,json}` preserve only the records needed to discover the matching Item 2.02 8-K or TSM fiscal-quarter 6-K and its EX-99.1 document.

`*-exhibit-99.1.html` preserves:

- the fiscal-quarter headings and units;
- the current quarter and prior-year quarter;
- the GAAP revenue, profit and diluted EPS rows;
- deliberate distractors needed to prevent selecting pre-tax income, year-to-date totals, or adjusted/non-GAAP values.

`*-companyfacts.json` reflects the latest structured 10-Q facts available at fixture capture time. The AMD fixture includes its Q2 2026 10-Q facts; the earlier fixtures intentionally stop at Q1 2026 and exercise the fallback from Company Facts to the current 8-K exhibit. Each prior-year comparator uses the current filing's accession so a restated or split-adjusted comparator wins over an older filing.

`expected.json` is the canonical official result set. In particular:

- TSLA uses operating income of $398 million, not pre-tax income of $1.329 billion, and GAAP EPS of $0.32, not non-GAAP EPS of $0.33.
- TSM uses the TIFRS net revenue and operating income rows translated at the official quarter-weighted USD/NTD rates, plus diluted ADR EPS.
- GOOGL uses operating income of $40.770 billion, not pre-tax income of $138.753 billion.
- IBKR uses GAAP net revenues of $1.896 billion and GAAP pre-tax income of $1.456 billion, not adjusted values of $1.883 billion and $1.443 billion.
