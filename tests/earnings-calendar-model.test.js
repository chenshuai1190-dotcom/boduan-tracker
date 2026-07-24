import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeEarningsEvents } from '../src/lib/earningsCalendarModel.js';

test('earnings model retains NOK SEC primary provenance and EUR actual metadata', () => {
  const [event] = normalizeEarningsEvents([{
    symbol: 'NOK',
    reportDate: '2026-07-23',
    fiscalDate: '2026-06-30',
    session: 'pre',
    currency: 'USD',
    officialActualSchemaVersion: 3,
    officialActualStatus: 'complete',
    officialActualSource: 'sec-primary',
    epsActual: 0,
    epsPreviousYear: 0.02,
    epsActualSource: 'sec-primary',
    epsActualBasis: 'reportedDilutedEPS',
    epsCurrency: 'EUR',
    epsUnit: 'EUR/share',
    revenueActual: 4_815_000_000,
    revenueActualUsd: 5_598_837_209,
    revenueActualCurrency: 'USD',
    revenueActualOriginalCurrency: 'EUR',
    revenueActualSource: 'sec-primary',
    revenueActualBasis: 'reportedNetSales',
    revenuePreviousYear: 4_443_000_000,
    revenuePreviousYearUsd: 5_166_279_070,
    revenuePreviousYearCurrency: 'USD',
    revenuePreviousYearOriginalCurrency: 'EUR',
    ebitActual: 434_000_000,
    ebitActualUsd: 504_651_163,
    ebitActualCurrency: 'USD',
    ebitActualOriginalCurrency: 'EUR',
    ebitActualSource: 'sec-primary',
    ebitActualBasis: 'comparableOperatingIncome',
    ebitPreviousYear: 367_000_000,
    ebitPreviousYearUsd: 426_744_186,
    ebitPreviousYearCurrency: 'USD',
    ebitPreviousYearOriginalCurrency: 'EUR',
    secCik: '0000924613',
    secFilingUrl: 'https://www.sec.gov/Archives/example/nokia-index.html',
    secPrimaryDocumentUrl: 'https://www.sec.gov/Archives/example/nokia-6k.htm',
  }]);

  assert.equal(event.officialActualSchemaVersion, 3);
  assert.equal(event.officialActualSource, 'sec-primary');
  assert.equal(event.secPrimaryDocumentUrl, 'https://www.sec.gov/Archives/example/nokia-6k.htm');
  assert.equal(event.epsCurrency, 'EUR');
  assert.equal(event.revenueActualOriginalCurrency, 'EUR');
  assert.equal(event.revenuePreviousYearOriginalCurrency, 'EUR');
  assert.equal(event.ebitActualOriginalCurrency, 'EUR');
  assert.equal(event.ebitPreviousYearOriginalCurrency, 'EUR');
  assert.equal(event.revenueActualBasis, 'reportedNetSales');
  assert.equal(event.ebitActualBasis, 'comparableOperatingIncome');
});
