# Micron official release fixtures

These are complete SEC Exhibit 99.1 HTML responses downloaded on 2026-10-02.
They retain the original table structure, including colspan/rowspan, separate
currency cells, percent rows, fiscal-quarter and year-to-date columns. They are
not vendor data or hand-authored financial samples.

| File | SEC source | SHA-256 |
| --- | --- | --- |
| mu-fy2026-q4-ex99.1.html | https://www.sec.gov/Archives/edgar/data/723125/000072312526000018/a2026q4ex991-pressrelease.htm | 5162414379226e281689e5ac83ff7cc338c971aa3ac63845c613b52867882d31 |
| mu-fy2026-q3-ex99.1.html | https://www.sec.gov/Archives/edgar/data/723125/000072312526000013/a2026q3ex991-pressrelease.htm | 1024609d9848d5ac6603449418b71378a7190f725397d108d2a67affe7c81c9b |

The Q4 announcement is dated 2026-09-30; its quarter ended 2026-09-03, after
the preceding quarter ended 2026-05-28 (14 weeks). Q3 ended 2026-05-28 after
2026-02-26 (13 weeks). Official statement dates govern the parsed periods.

The business-unit table has four named blocks with a separate Revenue row in
each. It has no repeated unit caption; the same release's Quarterly Financial
Results and Consolidated Statements of Operations both specify millions and
use dollars. The parser accepts that issuer-specific reporting convention only
after checking the SEC URL, CIK, accession, form, exhibit, issuer, quarter,
date, currency and independent consolidated revenue tables. Any explicit
conflicting unit in the business table fails closed.

Four disclosed amounts do not quite sum to consolidated revenue. In millions:

| Period | Consolidated | Four disclosed units | Difference | Prior-year consolidated | Prior-year units | Prior difference |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| FY2026 Q4 | 54229 | 54223 | 6 | 11315 | 11314 | 1 |
| FY2026 Q3 | 41456 | 41448 | 8 | 9301 | 9298 | 3 |

These are preserved differences, not invented Other revenues. Neither gross
margin nor operating margin is converted into an undisclosed profit amount.
All negative mutations in the test are synthetic and separate from these files.
