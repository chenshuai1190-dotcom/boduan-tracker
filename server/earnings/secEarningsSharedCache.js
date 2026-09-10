const DAY_MS = 86_400_000;
const SECTION_KEYS = ['reportSegments', 'revenueBreakdown', 'geographies'];
const FILING_FORMS = new Set(['10-Q', '10-K', '8-K', '6-K', '20-F']);

function symbolKey(value) {
  if (typeof value !== 'string') return null;
  const symbol = value.trim().toUpperCase().replace(/\.US$/, '');
  return /^[A-Z0-9.-]{1,15}$/.test(symbol) ? symbol : null;
}

function dateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const milliseconds = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === value
    ? value : null;
}

function timestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !dateKey(value.slice(0, 10))) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function newYorkDate(milliseconds) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(milliseconds));
  const fields = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function daysBetween(start, end) {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS;
}

function cikKey(value) {
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  if (!/^\d{1,10}$/.test(raw) || Number(raw) === 0) return null;
  return raw.padStart(10, '0');
}

function verifiedArchiveUrl(value, cik, accession) {
  if (typeof value !== 'string') return false;
  let url;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'https:' || !['www.sec.gov', 'sec.gov'].includes(url.hostname)
    || url.username || url.password || url.port || url.search || url.hash) return false;
  const prefix = `/Archives/edgar/data/${Number(cik)}/${accession.replaceAll('-', '')}/`;
  return url.pathname.startsWith(prefix)
    && /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:html?|xml|txt)$/i.test(url.pathname.slice(prefix.length));
}

function normalizeRequest(request, today) {
  const symbol = symbolKey(request?.symbol);
  const fiscalDate = dateKey(request?.fiscalDate);
  const providerFiscalDate = request?.providerFiscalDate
    ? dateKey(request.providerFiscalDate) : fiscalDate;
  const explicitOfficial = request?.officialFiscalDate
    || (request?.providerFiscalDate && fiscalDate !== providerFiscalDate ? fiscalDate : null);
  const officialFiscalDate = explicitOfficial ? dateKey(explicitOfficial) : null;
  const reportDate = dateKey(request?.reportDate);
  if (!symbol || !fiscalDate || !providerFiscalDate || !reportDate || reportDate > today
    || (explicitOfficial && !officialFiscalDate)
    || daysBetween(providerFiscalDate, reportDate) < -31
    || daysBetween(providerFiscalDate, reportDate) > 180
    || (officialFiscalDate && (officialFiscalDate > reportDate
      || daysBetween(officialFiscalDate, reportDate) > 180))) return null;
  return { symbol, providerFiscalDate, officialFiscalDate, reportDate };
}

function inspectRow(row, request, nowMs, today, parserVersion) {
  const payload = row?.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || row.parser_version !== parserVersion || payload.parserVersion !== parserVersion
    || symbolKey(payload.symbol) !== request.symbol
    || (row.symbol !== undefined && symbolKey(row.symbol) !== request.symbol)) return null;
  const checkedMs = timestamp(row.checked_at);
  const expiresMs = timestamp(row.expires_at);
  if (checkedMs === null || expiresMs === null || checkedMs > nowMs || expiresMs <= checkedMs) return null;
  const source = payload.source;
  const cik = cikKey(source?.cik);
  const accession = source?.accession;
  const form = typeof source?.form === 'string' ? source.form.replace(/\/A$/, '') : '';
  if (source?.provider !== 'SEC' || !cik || !/^\d{10}-\d{2}-\d{6}$/.test(accession || '')
    || !FILING_FORMS.has(form)
    || !verifiedArchiveUrl(source.primaryDocumentUrl, cik, accession)
    || (source.filingUrl && !verifiedArchiveUrl(source.filingUrl, cik, accession))
    || (row.cik !== undefined && cikKey(row.cik) !== cik)
    || (row.sec_cik !== undefined && cikKey(row.sec_cik) !== cik)
    || (row.accession !== undefined && row.accession !== accession)) return null;
  const filedMs = timestamp(source.filedAt);
  const filedDay = dateKey(source.filedAt) || (filedMs !== null ? newYorkDate(filedMs) : null);
  if (!filedDay || filedDay > today || filedDay > newYorkDate(checkedMs)
    || (filedMs !== null && (filedMs > nowMs || filedMs > checkedMs))) return null;
  const period = payload.period;
  const verifiedReportDate = dateKey(period?.reportDate);
  const officialFiscalDate = dateKey(period?.officialFiscalDate || period?.end);
  if (!officialFiscalDate || !verifiedReportDate || verifiedReportDate > today
    || verifiedReportDate > newYorkDate(checkedMs) || officialFiscalDate > verifiedReportDate
    || dateKey(period?.end) !== officialFiscalDate
    || (period.fiscalDate && dateKey(period.fiscalDate) !== officialFiscalDate)
    || officialFiscalDate > request.reportDate || officialFiscalDate > filedDay
    || (row.official_fiscal_date !== undefined && row.official_fiscal_date !== officialFiscalDate)) return null;
  if (request.officialFiscalDate) {
    if (request.officialFiscalDate !== officialFiscalDate) return null;
  } else if (Math.abs(daysBetween(request.providerFiscalDate, officialFiscalDate)) > 31
    || daysBetween(request.reportDate, filedDay) < -2
    || daysBetween(request.reportDate, filedDay) > 14) return null;
  const start = dateKey(period.start);
  const fiscalPeriod = period.fiscalPeriod || source.fiscalPeriod || null;
  const quarter = start && daysBetween(start, officialFiscalDate) >= 70
    && daysBetween(start, officialFiscalDate) <= 105
    && (!fiscalPeriod || /^Q[1-4]$/.test(fiscalPeriod))
    && (!source.fiscalPeriod || !period.fiscalPeriod || source.fiscalPeriod === period.fiscalPeriod)
    && (!['10-K', '20-F'].includes(form) || fiscalPeriod === 'Q4');
  const available = Boolean(quarter && ['complete', 'partial'].includes(payload.status)
    && SECTION_KEYS.some((key) => ['complete', 'partial'].includes(payload.sections?.[key]?.status)
      && Array.isArray(payload.sections[key].items)
      && payload.sections[key].items.some((item) => typeof item?.revenue === 'number' && Number.isFinite(item.revenue))));
  return { payload, cik, accession, filedDay, filedMs, checkedMs, expiresMs, officialFiscalDate, available };
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

// The repository supplies service-verified public rows. This function performs
// no I/O and never merges sections across filings or aliases share classes.
export function selectSharedEarningsDetail({
  request, rows, now = new Date(), parserVersion, allowStale = false,
} = {}) {
  const nowMs = timestamp(now);
  if (nowMs === null || !Array.isArray(rows) || typeof parserVersion !== 'string' || !parserVersion) return null;
  const today = newYorkDate(nowMs);
  const normalizedRequest = normalizeRequest(request, today);
  if (!normalizedRequest) return null;
  const candidates = rows.map((row) => inspectRow(row, normalizedRequest, nowMs, today, parserVersion)).filter(Boolean);
  if (!candidates.length || new Set(candidates.map((row) => row.cik)).size !== 1
    || new Set(candidates.map((row) => row.officialFiscalDate)).size !== 1) return null;

  const latestDay = candidates.map((row) => row.filedDay).sort().at(-1);
  let latest = candidates.filter((row) => row.filedDay === latestDay);
  if (new Set(latest.map((row) => row.accession)).size > 1) {
    // A day-only filing date cannot order two same-day public filings safely.
    if (latest.some((row) => row.filedMs === null)) return null;
    const latestTime = Math.max(...latest.map((row) => row.filedMs));
    latest = latest.filter((row) => row.filedMs === latestTime);
    if (new Set(latest.map((row) => row.accession)).size !== 1) return null;
  }
  const latestCheck = Math.max(...latest.map((row) => row.checkedMs));
  const checked = latest.filter((row) => row.checkedMs === latestCheck);
  if (new Set(checked.map((row) => stableJson(row.payload))).size !== 1) return null;
  const selected = checked.reduce((left, right) => left.expiresMs <= right.expiresMs ? left : right);
  const stale = selected.expiresMs <= nowMs;
  // A newer filing with no verified quarter blocks an older result; allowing
  // stale data only relaxes expiry, never accession or identity requirements.
  if (!selected.available || (stale && !allowStale)) return null;
  let cloned;
  try { cloned = structuredClone(selected.payload); } catch { return null; }
  const checkedAt = new Date(selected.checkedMs).toISOString();
  const expiresAt = new Date(selected.expiresMs).toISOString();
  return {
    ...cloned,
    symbol: normalizedRequest.symbol,
    period: {
      ...cloned.period,
      fiscalDate: selected.officialFiscalDate,
      officialFiscalDate: selected.officialFiscalDate,
      providerFiscalDate: normalizedRequest.providerFiscalDate,
      reportDate: normalizedRequest.reportDate,
    },
    checkedAt,
    fetchedAt: checkedAt,
    stale,
    cache: {
      source: 'shared-sec', status: stale ? 'stale' : 'fresh', checkedAt, expiresAt, parserVersion,
      verifiedReportDate: dateKey(selected.payload.period.reportDate),
      verifiedProviderFiscalDate: dateKey(selected.payload.period.providerFiscalDate),
    },
  };
}
