import { hasSecEarningsDetailAdapter, parseSecEarningsDetailPrimaryDocument } from './secEarningsDetailParsers.js';
import { hasSecUsHoldingBusinessAdapter, parseSecUsHoldingBusinessDocument } from './secUsHoldingBusinessAdapters.js';
import { hasForeignIssuerBusinessCompositionAdapter, parseForeignIssuerBusinessComposition } from './foreignIssuerBusinessComposition.js';
import { inspectGenericSecBusinessComposition } from './secGenericBusinessComposition.js';

const SECTION_KEYS = ['reportSegments', 'revenueBreakdown', 'geographies'];
const FILLABLE_REASONS = new Set([
  'missing-axis-facts',
  'official-detail-section-not-supported',
  'quarterly-product-revenue-not-disclosed',
  'quarterly-geography-not-disclosed',
]);

// Only used for two parsers of the SAME downloaded document. Do not export a
// general cross-filing merge: different releases may restate prior periods.
export function mergeVerifiedDocumentSections(dedicated, generic) {
  if (!dedicated || !generic || dedicated.currency !== generic.currency
    || dedicated.period?.start !== generic.period?.start
    || dedicated.period?.end !== generic.period?.end) return dedicated;
  const report = dedicated.sections?.reportSegments;
  if (report?.status !== 'complete' || !report.items?.length
    || report.items.some((item) => !Number.isFinite(item.revenue))) return dedicated;
  const reconciliation = report.reconciliation ? report.reconciliation.revenue : 0;
  if (!Number.isFinite(reconciliation) || !Number.isFinite(generic.totalRevenue)
    || report.items.reduce((sum, item) => sum + item.revenue, reconciliation) !== generic.totalRevenue) return dedicated;
  const sections = { ...dedicated.sections };
  let filled = false;
  for (const key of SECTION_KEYS) {
    const original = sections[key];
    const candidate = generic.sections?.[key];
    if (original?.status !== 'unavailable' || original.items?.length
      || !FILLABLE_REASONS.has(original.reason)
      || candidate?.status !== 'complete' || !candidate.items?.length) continue;
    // Dedicated adapters do not yet expose their comparative context periods.
    // Equal current totals cannot prove a shared prior-year/recast basis.
    const incomparable = { status: 'unavailable', reason: 'unverified-cross-parser-comparative-period' };
    sections[key] = {
      ...candidate,
      items: candidate.items.map((item) => ({ ...item, previousRevenue: null, previousProfit: null })),
      metricStatus: { ...candidate.metricStatus, previousRevenue: incomparable, previousProfit: incomparable },
      parser: generic.sourceMetadata?.adapterId || 'sec-generic-inline-xbrl',
    };
    filled = true;
  }
  if (!filled) return dedicated;
  return {
    ...dedicated,
    totalRevenue: generic.totalRevenue,
    sections,
    status: SECTION_KEYS.every((key) => sections[key]?.status === 'complete') ? 'complete' : 'partial',
  };
}

export function inspectSecEarningsDocument({ symbol, fiscalDate, primary }) {
  const filing = {
    cik: primary.secCik,
    accession: primary.accession,
    form: primary.form,
    documentType: primary.documentType,
  };
  const args = { symbol, fiscalDate, html: primary.html, filing };
  let result = null;
  let parser = null;
  if (hasSecEarningsDetailAdapter(symbol)) {
    result = parseSecEarningsDetailPrimaryDocument(args);
    parser = 'sec-company-primary';
  } else if (hasSecUsHoldingBusinessAdapter(symbol)) {
    result = parseSecUsHoldingBusinessDocument(args);
    parser = result?.adapterId || 'sec-us-company';
  } else if (hasForeignIssuerBusinessCompositionAdapter(symbol)) {
    result = parseForeignIssuerBusinessComposition({ ...args, sourceUrl: primary.primaryDocumentUrl });
    return { result, parser: result?.adapterId || 'official-foreign-company', reason: result ? null : 'official-primary-document-unparsed' };
  }
  const canFill = result && SECTION_KEYS.some((key) => (
    result.sections?.[key]?.status === 'unavailable' && FILLABLE_REASONS.has(result.sections[key].reason)
  ));
  if (!result || canFill) {
    const generic = inspectGenericSecBusinessComposition(args);
    if (!result) {
      result = generic.result;
      parser = result?.sourceMetadata?.adapterId || 'sec-generic-inline-xbrl';
      return { result, parser, reason: result ? null : generic.reason };
    }
    result = mergeVerifiedDocumentSections(result, generic.result);
  }
  return { result, parser, reason: null };
}
