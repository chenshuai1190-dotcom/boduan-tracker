import { fetchSecWatchlistSubmissionsSource } from './secOfficialActuals.js';

export const SEC_WATCHLIST_DISCOVERY_MAX_EVENTS = 2;
const RELEASE_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const PERIODIC_FORMS = new Set(['10-Q', '10-K', '20-F']);

// SEC filing dates are internal document-selection anchors, NOT calendar
// earnings-release dates. Never merge them into the provider's calendar dates.
export async function discoverSecWatchlistEvents(options = {}) {
  const now = options.now instanceof Date ? new Date(options.now) : new Date(options.now ?? Date.now());
  const source = await fetchSecWatchlistSubmissionsSource({ ...options, now });
  const base = {
    status: source.status,
    reason: source.reason,
    symbol: source.symbol,
    events: [],
    hasUnresolvedRelease: false,
    unresolvedReleaseReason: null,
    unresolvedRelease: null,
  };
  if (source.status !== 'ready') return base;
  const nowMs = now.getTime();
  const today = newYorkDateKey(now);
  const identities = new Map();
  const conflictingAccessions = new Set();
  for (const filing of source.filings) {
    const identity = JSON.stringify([filing.form, filing.filingDate, filing.reportDate, filing.acceptedAt]);
    if (identities.has(filing.accession) && identities.get(filing.accession) !== identity) {
      conflictingAccessions.add(filing.accession);
    }
    identities.set(filing.accession, identity);
  }
  const available = source.filings.filter((filing) => !conflictingAccessions.has(filing.accession)
    && isAvailableFiling(filing, { nowMs, today }));
  const periodic = available
    .filter((filing) => PERIODIC_FORMS.has(filing.form)
      && validDateKey(filing.reportDate) && filing.reportDate <= filing.filingDate)
    .sort((left, right) => right.reportDate.localeCompare(left.reportDate)
      || filingTime(right) - filingTime(left));

  const periods = new Map();
  for (const filing of periodic) {
    const group = periods.get(filing.reportDate) || [];
    group.push(filing);
    periods.set(filing.reportDate, group);
  }
  const events = [];
  let hasAmbiguousPeriod = false;
  // Select the newest two financial periods before resolving documents, so a
  // conflicting latest period is not silently replaced by an older quarter.
  for (const group of [...periods.values()].slice(0, SEC_WATCHLIST_DISCOVERY_MAX_EVENTS)) {
    const filing = latestUnambiguousPeriodicFiling(group);
    if (!filing) { hasAmbiguousPeriod = true; continue; }
    events.push({
      symbol: source.symbol,
      providerFiscalDate: filing.reportDate,
      fiscalDate: filing.reportDate,
      officialFiscalDate: filing.reportDate,
      reportDate: filing.filingDate,
      reportDateSource: 'sec-filing-date',
      filedDate: filing.filingDate,
      filedAt: filing.acceptedAt || filing.filingDate,
      accession: filing.accession,
      form: filing.form,
      secCik: source.secCik,
    });
  }
  const latestPeriodicTime = periodic.reduce((latest, filing) => Math.max(latest, filingTime(filing)), 0);
  const latestRelease = available.filter((filing) => {
    if (filing.form !== '6-K' && !(filing.form === '8-K' && hasEarningsItem(filing.items))) return false;
    const time = filingTime(filing);
    return time >= nowMs - RELEASE_LOOKBACK_MS && time > latestPeriodicTime;
  }).sort((left, right) => filingTime(right) - filingTime(left)
    || right.accession.localeCompare(left.accession))[0];
  const unresolvedRelease = latestRelease ? {
    accession: latestRelease.accession,
    form: latestRelease.form,
    filedAt: latestRelease.acceptedAt || latestRelease.filingDate,
    filedDate: latestRelease.filingDate,
  } : null;
  const hasUnresolvedRelease = unresolvedRelease !== null;
  return {
    ...base,
    status: !hasAmbiguousPeriod && events.length > 0 ? 'ready' : 'pending',
    reason: hasAmbiguousPeriod ? 'official-periodic-filing-ambiguous' : events.length > 0 ? null : hasUnresolvedRelease
      ? 'needs-calendar-period' : 'official-periodic-filing-not-found',
    events,
    hasUnresolvedRelease,
    unresolvedReleaseReason: hasUnresolvedRelease ? 'needs-calendar-period' : null,
    unresolvedRelease,
  };
}

function latestUnambiguousPeriodicFiling(group) {
  const day = (filing) => filing.acceptedAt
    ? newYorkDateKey(new Date(filing.acceptedAt)) : filing.filingDate;
  const latestDay = group.map(day).sort().at(-1);
  const sameDay = group.filter((filing) => day(filing) === latestDay);
  if (new Set(sameDay.map((filing) => filing.accession)).size > 1
    && sameDay.some((filing) => !filing.acceptedAt)) return null;
  const latestTime = Math.max(...sameDay.map(filingTime));
  const latest = sameDay.filter((filing) => filingTime(filing) === latestTime);
  if (new Set(latest.map((filing) => filing.accession)).size !== 1) return null;
  return latest[0];
}

function isAvailableFiling(filing, { nowMs, today }) {
  if (!/^\d{10}-\d{2}-\d{6}$/.test(filing.accession) || !validDateKey(filing.filingDate)) return false;
  if (filing.filingDate > today) return false;
  if (filing.acceptedAt) {
    // A supplied but invalid/future acceptance time must not become a date-only
    // fallback. SEC submissions provides ISO UTC acceptance timestamps.
    if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(filing.acceptedAt)
      || !validDateKey(filing.acceptedAt.slice(0, 10))) return false;
    const acceptedMs = Date.parse(filing.acceptedAt);
    if (!Number.isFinite(acceptedMs) || acceptedMs > nowMs) return false;
  }
  return true;
}

function hasEarningsItem(value) {
  return String(value || '').split(/[,;\s]+/).includes('2.02');
}

function filingTime(filing) {
  return Date.parse(filing.acceptedAt || `${filing.filingDate}T00:00:00.000Z`);
}

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function newYorkDateKey(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}
