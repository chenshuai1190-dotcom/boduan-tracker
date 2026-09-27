import { getVixSessionStatus, nextVixComparisonSession } from './vixComparisonSession.js';

const isDate = (date) => getVixSessionStatus(date).kind !== 'invalid_date';
const isSession = (date) => getVixSessionStatus(date).kind === 'session';
const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const knownDays = (row) => Number.isInteger(row?.inversionDays) && row.inversionDays > 0 ? row.inversionDays : null;
const exactDays = (row) => row?.durationExact?.inversion === true;

function ratioOf(row) {
  if (!positive(row?.ratio)) return null;
  // A missing price-action series does not invalidate the volatility series.
  if (row.dataQuality?.issues?.some((issue) => issue.dimension === 'volatility'
    && ['invalid_data', 'provider_missing', 'date_mismatch', 'duplicate_date'].includes(issue.code)
    && (!Array.isArray(issue.dates) || issue.dates.includes(row.date)))) return null;
  return row.ratio;
}

function firstMonthSession(month) {
  const first = `${month}-01`;
  if (!isDate(first)) return null;
  return isSession(first) ? first : nextVixComparisonSession(first);
}

function unavailableRow(date, code = 'provider_missing') {
  return {
    date, VIX: null, VIX3M: null, ratio: null, prices: {}, ready: false,
    currentRiskLevel: 'UNKNOWN', termStructure: 'UNKNOWN', riskDirection: 'UNKNOWN',
    currentRiskDuration: null, inversionDays: null, eventFlags: [],
    durationExact: { currentRisk: false, inversion: false, highStress: false, extremeStress: false },
    dataQuality: { status: 'unavailable', issues: [{ code, dimension: 'volatility', dates: [date] }] },
  };
}

/**
 * Give the page and exported image one identical calendar axis. cutoffDate is
 * the expected completed-session boundary; asOfDate is the last observed day.
 * Old reports without cutoffDate keep their asOfDate behavior. Missing or
 * duplicated provider dates remain explicit unavailable rows, never zeroes.
 */
export function normalizeVixMonthlyRows(report, { throughDate } = {}) {
  if (!report || typeof report.month !== 'string' || !/^(?!0000)\d{4}-\d{2}$/.test(report.month)) return [];
  const first = `${report.month}-01`;
  if (!isDate(first)) return [];
  const reportCutoff = report.cutoffDate ?? report.asOfDate;
  if (!isDate(reportCutoff) || (throughDate != null && !isDate(throughDate))) return [];
  const cutoff = throughDate != null && throughDate < reportCutoff ? throughDate : reportCutoff;
  const byDate = new Map();
  for (const row of Array.isArray(report.rows) ? report.rows : []) {
    if (!row || !isSession(row.date) || !row.date.startsWith(`${report.month}-`) || row.date > cutoff) continue;
    if (byDate.has(row.date)) byDate.set(row.date, unavailableRow(row.date, 'duplicate_date'));
    else byDate.set(row.date, row);
  }
  const cursor = new Date(`${first}T00:00:00Z`);
  const rows = [];
  while (true) {
    const date = cursor.toISOString().slice(0, 10);
    if (!date.startsWith(`${report.month}-`) || date > cutoff) break;
    if (isSession(date)) rows.push(byDate.get(date) || unavailableRow(date));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return rows;
}

/**
 * Read-only annotations over the report's observed prefix. Indices always refer
 * to the supplied report.rows, including any caller-added missing-session rows.
 * Segment dates describe the visible monthly portion; days retain the complete
 * historical streak when its provenance is available. Events are transitions,
 * never copies of the model's rolling three-session event list.
 */
export function buildInversionAnnotations(report, { throughDate } = {}) {
  const empty = { segments: [], normalizations: [], primarySegment: null, current: null };
  if (!report || !Array.isArray(report.rows)) return empty;
  const limits = [report.cutoffDate ?? report.asOfDate, throughDate].filter((date) => date !== undefined && date !== null);
  if (limits.some((date) => !isDate(date))) return empty;
  const cutoff = limits.sort()[0] ?? null;
  const entries = report.rows.map((row, index) => ({ row, index }))
    .filter(({ row }) => isSession(row?.date) && (!cutoff || row.date <= cutoff))
    .sort((a, b) => a.row.date.localeCompare(b.row.date));
  if (!entries.length) return empty;
  const occurrences = new Map();
  for (const { row } of entries) occurrences.set(row.date, (occurrences.get(row.date) ?? 0) + 1);
  const segments = [];
  const normalizations = [];
  const firstDate = entries[0].row.date;
  const monthStart = firstMonthSession(report.month);
  let gapSeen = Boolean(monthStart && firstDate > monthStart);
  const prior = report.priorSession;
  let previous = !gapSeen && isSession(prior?.date) && prior.date < firstDate
    && (!cutoff || prior.date <= cutoff) && nextVixComparisonSession(prior.date) === firstDate
    && ratioOf(prior) !== null ? { row: prior, ratio: ratioOf(prior) } : null;
  let active = null;
  let lastDate = null;

  const interrupt = () => {
    if (active) active.status = 'interrupted';
    active = null;
    previous = null;
    gapSeen = true;
  };

  for (const { row, index } of entries) {
    if (lastDate === row.date) continue; // Duplicate dates are unavailable, not extra sessions.
    if (previous && nextVixComparisonSession(previous.row.date) !== row.date) interrupt();
    const ratio = occurrences.get(row.date) === 1 ? ratioOf(row) : null;
    lastDate = row.date;
    if (ratio === null) { interrupt(); continue; }

    if (ratio >= 1) {
      if (active) {
        active.endDate = row.date;
        active.endIndex = index;
        active.days += 1;
      } else {
        const followsInversion = previous?.ratio >= 1;
        const followsNormal = previous && previous.ratio < 1;
        const historicDays = !gapSeen ? knownDays(row) : null;
        const priorDays = followsInversion ? knownDays(previous.row) : null;
        const days = followsNormal ? 1 : historicDays ?? (priorDays === null ? 1 : priorDays + 1);
        const exact = Boolean(followsNormal || (!gapSeen && (exactDays(row)
          || (followsInversion && priorDays !== null && exactDays(previous.row)))));
        active = { startDate: row.date, endDate: row.date, startIndex: index, endIndex: index,
          days, exact, carriedIn: !gapSeen && (days > 1 || Boolean(followsInversion)),
          status: 'ongoing', normalizedDate: null };
        segments.push(active);
      }
    } else {
      if (previous?.ratio >= 1) {
        const event = { date: row.date, index, previousDate: previous.row.date,
          previousRatio: previous.ratio, ratio, days: active?.days ?? knownDays(previous.row) ?? 1,
          exact: active?.exact ?? exactDays(previous.row),
          carriedIn: active?.carriedIn ?? previous.row.date.slice(0, 7) !== row.date.slice(0, 7) };
        normalizations.push(event);
        if (active) { active.status = 'normalized'; active.normalizedDate = row.date; }
      }
      active = null;
      // A known normal observation establishes an exact boundary for a new run.
      gapSeen = false;
    }
    previous = { row, ratio };
  }
  // A missing final session must not make an earlier run look current.
  if (cutoff && lastDate && nextVixComparisonSession(lastDate) <= cutoff) interrupt();
  const primarySegment = segments.reduce((best, segment) => !best || segment.days >= best.days ? segment : best, null);
  return { segments, normalizations, primarySegment, current: active };
}

export function getInversionSegmentLabel(segment, { includeStatus = true } = {}) {
  if (!segment) return '';
  const label = segment.exact ? `连续倒挂 ${segment.days} 个交易日` : `已知倒挂至少 ${segment.days} 个交易日`;
  if (!includeStatus) return label;
  return [label, segment.carriedIn ? '承接上月' : '',
    segment.status === 'ongoing' ? '仍在持续' : segment.status === 'interrupted' ? '数据中断' : ''].filter(Boolean).join(' · ');
}

export function getInversionNormalizationLabel(event) {
  if (!event || !isDate(event.date)) return '';
  return `${Number(event.date.slice(5, 7))}/${Number(event.date.slice(8, 10))} 倒挂解除`;
}
