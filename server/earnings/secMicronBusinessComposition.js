import { htmlToText } from './secOfficialParsers.js';

const CIK = '0000723125';
const DAY = 86_400_000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DATE_PATTERN = `(${MONTHS.join('|')})\\s+(\\d{1,2}),?\\s+(20\\d{2})`;
const SEGMENTS = [
  ['cloud-memory', 'Cloud Memory Business Unit', '云内存'],
  ['core-data-center', 'Core Data Center Business Unit', '核心数据中心'],
  ['mobile-and-client', 'Mobile and Client Business Unit', '移动与客户端'],
  ['automotive-and-embedded', 'Automotive and Embedded Business Unit', '汽车与嵌入式'],
];
const clean = value => htmlToText(String(value || '')).replace(/\s+/g, ' ').trim();
const fail = reason => { throw Object.assign(new Error(reason), { code: reason }); };
const requireValue = (condition, reason) => { if (!condition) fail(reason); };
const unavailable = reason => ({ status: 'unavailable', reason, items: [] });
const metric = (available, reason) => ({ status: available ? 'complete' : 'unavailable', reason: available ? null : reason });
const firstText = cells => cells.find(cell => cell.text)?.text || '';
const distance = (left, right) => (Date.parse(left) - Date.parse(right)) / DAY;

/** Micron's official release format since its FY2025 Q4 segment reorganization.
 * The four disclosed revenues remain untouched even when their sum differs
 * from consolidated revenue. Margins are not reported profit amounts.
 */
export function inspectMicronBusinessComposition({ symbol, fiscalDate, html, filing = {}, sourceUrl } = {}) {
  try {
    requireValue(String(symbol || '').trim().toUpperCase().replace(/\.US$/, '') === 'MU', 'unsupported-micron-symbol');
    requireValue(filing.form === '8-K', 'unsupported-filing-form');
    requireValue(filing.documentType === 'EX-99.1', 'unsupported-document-type');
    requireValue(/^\d{1,10}$/.test(String(filing.cik || '')) && String(filing.cik).padStart(10, '0') === CIK
      && /^\d{10}-\d{2}-\d{6}$/.test(filing.accession || ''), 'micron-identity-mismatch');
    const path = `/Archives/edgar/data/${Number(CIK)}/${filing.accession.replaceAll('-', '')}/`;
    let source;
    try { source = new URL(sourceUrl); } catch { fail('micron-source-mismatch'); }
    requireValue(source.origin === 'https://www.sec.gov' && !source.username && !source.password
      && !source.search && !source.hash && source.pathname.startsWith(path)
      && /^[A-Za-z0-9._-]+\.html?$/.test(source.pathname.slice(path.length)), 'micron-source-mismatch');
    requireValue(typeof html === 'string' && html.length > 100 && html.length <= 3_000_000, 'micron-document-invalid');
    const safeHtml = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
    const text = clean(safeHtml);
    requireValue(/\bExhibit 99\.1\b/i.test(text)
      && /Micron Technology,? Inc\.\s*\(Nasdaq:\s*MU\)/i.test(text), 'micron-identity-mismatch');
    const announcements = [...text.matchAll(new RegExp(`Micron Technology,? Inc\\.\\s*\\(Nasdaq:\\s*MU\\) today announced results for its (first|second|third|fourth) quarter(?: and full year)? of fiscal (20\\d{2}), which ended ${DATE_PATTERN}`, 'gi'))];
    requireValue(announcements.length === 1, 'micron-quarter-identity-missing');
    const announcement = announcements[0];
    const quarter = ['first', 'second', 'third', 'fourth'].indexOf(announcement[1].toLowerCase()) + 1;
    const year = Number(announcement[2]);
    const end = englishDate(announcement.slice(3, 6));
    requireValue(validFiscalEnd(end, quarter, year), 'micron-period-mismatch');
    const requested = dateKey(fiscalDate);
    requireValue(requested && Math.abs(distance(requested, end)) <= 31, 'micron-period-mismatch');

    const tables = readTables(safeHtml);
    const business = uniqueTable(tables, table => hasRow(table, 'Quarterly Business Unit Financial Results')
      || SEGMENTS.some(([, name]) => hasRow(table, name)));
    requireValue(hasRow(business, 'Quarterly Business Unit Financial Results'), 'micron-quarter-identity-missing');
    const summary = uniqueTable(tables, table => hasRow(table, 'Quarterly Financial Results'));
    const operations = uniqueTable(tables, table => hasRow(table, 'Revenue') && hasRow(table, 'Cost of goods sold') && hasRow(table, 'Net income'));
    requireValue(/MICRON TECHNOLOGY,? INC\. CONSOLIDATED STATEMENTS OF OPERATIONS/i.test(operations.before), 'micron-quarter-identity-missing');
    verifyUnits(summary.text, true);
    verifyUnits(`${operations.before.slice(operations.before.search(/MICRON TECHNOLOGY,? INC\. CONSOLIDATED STATEMENTS OF OPERATIONS/i))} ${operations.text}`, true);
    // This issuer's business table omits a repeated unit caption. USD millions
    // are established by both recognized financial statements in this release;
    // explicit currency/scale conflicts in the business table are still fatal.
    verifyUnits(business.text, false);
    requireValue(!/\bin (?:thousands|billions)\b/i.test(business.before), 'micron-unit-mismatch');
    const businessPair = quarterColumns(business, quarter, year);
    const gaap = uniqueCell(summary, cell => /^GAAP\s*\(1\)$/.test(cell.text));
    const summaryPair = quarterColumns(summary, quarter, year, gaap);
    const statementColumns = datedQuarterColumns(operations, quarter, year, end);
    const totalRow = row(summary, 'Revenue');
    const statementRow = row(operations, 'Revenue');
    const totalRevenue = moneyInColumn(totalRow, summaryPair[0]);
    requireValue(totalRevenue > 0 && totalRevenue === moneyInColumn(statementRow, statementColumns.current), 'micron-current-total-mismatch');
    let previousTotalRevenue = priorMoney(totalRow, summaryPair[1]);
    let previousComparable = businessPair[1] && Number.isFinite(previousTotalRevenue) && previousTotalRevenue > 0
      && previousTotalRevenue === priorMoney(statementRow, statementColumns.previous);

    const items = businessItems(business, businessPair);
    previousComparable = Boolean(previousComparable && items.every(item => Number.isFinite(item.previousRevenue)));
    if (!previousComparable) {
      previousTotalRevenue = null;
      for (const item of items) item.previousRevenue = null;
    }
    const reportedRevenueTotal = sumRevenue(items, 'revenue');
    const previousReportedRevenueTotal = previousComparable ? sumRevenue(items, 'previousRevenue') : null;
    const difference = totalRevenue - reportedRevenueTotal;
    const previousDifference = previousComparable ? previousTotalRevenue - previousReportedRevenueTotal : null;
    const mismatch = difference !== 0 || (previousComparable && previousDifference !== 0);
    return { reason: null, result: {
      status: 'partial', currency: 'USD', totalRevenue, previousTotalRevenue,
      period: { start: new Date(Date.parse(statementColumns.previousQuarterEnd) + DAY).toISOString().slice(0, 10), end, fiscalYear: String(year), fiscalPeriod: `Q${quarter}` },
      sections: {
        reportSegments: {
          status: mismatch ? 'partial' : 'complete', reason: mismatch ? 'reported-segment-total-mismatch' : null, items,
          metricStatus: {
            revenue: metric(true), previousRevenue: metric(previousComparable, 'quarterly-comparable-revenue-unavailable'),
            profit: metric(false, 'quarterly-segment-profit-not-disclosed'), previousProfit: metric(false, 'quarterly-segment-profit-not-disclosed'),
          },
          revenueReconciliation: { status: mismatch ? 'mismatch' : 'matched', totalRevenue, reportedRevenueTotal, difference,
            previousTotalRevenue, previousReportedRevenueTotal, previousDifference, currency: 'USD' },
        },
        revenueBreakdown: unavailable('quarterly-revenue-breakdown-not-disclosed'),
        geographies: unavailable('quarterly-geographies-not-disclosed'),
      },
      sourceMetadata: {
        provider: 'SEC', adapterId: 'sec-release-mu-v1', evidence: 'official-release-quarter-tables',
        cik: CIK, accession: filing.accession, form: '8-K', documentType: 'EX-99.1', officialFiscalDate: end,
        reportingCurrencyBasis: 'verified-issuer-usd-profile',
      },
    } };
  } catch (error) {
    return { result: null, reason: /^[a-z][a-z0-9-]{0,119}$/.test(error?.code || '') ? error.code : 'micron-table-invalid' };
  }
}

function businessItems(table, pair) {
  requireValue(table.rows.filter(cells => firstText(cells) === 'Revenue').length === SEGMENTS.length, 'micron-segment-rows-invalid');
  const headings = table.rows.filter(cells => /Business Unit$/.test(firstText(cells)));
  requireValue(headings.length === SEGMENTS.length, 'micron-segment-rows-invalid');
  return SEGMENTS.map(([id, label, labelZh]) => {
    const heading = row(table, label);
    requireValue(heading.filter(cell => cell.text).length === 1, 'micron-segment-rows-invalid');
    const start = table.rows.indexOf(heading);
    const followingHeading = headings.map(cells => table.rows.indexOf(cells)).filter(index => index > start);
    const stop = followingHeading.length ? Math.min(...followingHeading) : table.rows.length;
    const revenues = table.rows.slice(start + 1, stop).filter(cells => firstText(cells) === 'Revenue');
    requireValue(revenues.length === 1 && start > pair[0].row, 'micron-segment-rows-invalid');
    return { id, label, labelZh, revenue: moneyInColumn(revenues[0], pair[0]), previousRevenue: priorMoney(revenues[0], pair[1]),
      profit: null, previousProfit: null, currency: 'USD' };
  });
}

function quarterColumns(table, quarter, year, group) {
  requireValue(!/\b(?:annual|full[- ]year|year[- ]to[- ]date|year ended|(?:six|nine|twelve|6|9|12)[ -]months?|FY[- ](?:20)?\d{2})\b/i.test(table.text), 'micron-quarter-columns-invalid');
  const candidates = table.rows.flat().filter(cell => /^FQ[1-4]-\d{2}$/.test(cell.text)
    && (!group || (cell.row > group.row && cell.start >= group.start && cell.end <= group.end)));
  requireValue(candidates.length === 3 && candidates.every(cell => cell.row === candidates[0].row), 'micron-quarter-columns-invalid');
  const identity = cell => cell.text.match(/^FQ([1-4])-(\d{2})$/).slice(1).map(Number);
  const matches = (cell, q, y) => identity(cell)[0] === q && identity(cell)[1] === y % 100;
  requireValue(new Set(candidates.map(cell => cell.text)).size === 3
    && matches(candidates[0], quarter, year)
    && matches(candidates[1], quarter === 1 ? 4 : quarter - 1, quarter === 1 ? year - 1 : year)
    && !/(?:annual|year ended|year.to.date|six months|nine months|twelve months)/i.test(table.rows[candidates[0].row].map(cell => cell.text).join(' ')), 'micron-quarter-columns-invalid');
  return [candidates[0], matches(candidates[2], quarter, year - 1) ? candidates[2] : null];
}

function datedQuarterColumns(table, quarter, year, end) {
  const headers = table.rows.flat().filter(cell => /^[1-4](?:st|nd|rd|th) Qtr\.$/.test(cell.text));
  requireValue(headers.length === 3 && headers.every(cell => cell.row === headers[0].row)
    && Number(headers[0].text[0]) === quarter && Number(headers[1].text[0]) === (quarter === 1 ? 4 : quarter - 1)
    && Number(headers[2].text[0]) === quarter, 'micron-quarter-columns-invalid');
  const dateColumn = header => {
    const cells = table.rows.flat().filter(cell => cell.row > header.row && cell.start === header.start && cell.end === header.end && parseEnglishDate(cell.text));
    return cells.length === 1 ? cells[0] : null;
  };
  const current = dateColumn(headers[0]);
  const priorQuarter = dateColumn(headers[1]);
  const priorYear = dateColumn(headers[2]);
  const previousQuarterEnd = parseEnglishDate(priorQuarter?.text || '');
  requireValue(current && priorQuarter && current.row === priorQuarter.row && parseEnglishDate(current.text) === end
    && validFiscalEnd(previousQuarterEnd, quarter === 1 ? 4 : quarter - 1, quarter === 1 ? year - 1 : year)
    && [91, 98].includes(distance(end, previousQuarterEnd)), 'micron-quarter-duration-invalid');
  const previous = priorYear && priorYear.row === current.row
    && validFiscalEnd(parseEnglishDate(priorYear.text), quarter, year - 1)
    && [364, 371].includes(distance(end, parseEnglishDate(priorYear.text))) ? priorYear : null;
  return { current, previous, previousQuarterEnd };
}

function moneyInColumn(cells, column) {
  requireValue(column, 'micron-value-missing');
  const selected = cells.filter(cell => cell.text && cell.start >= column.start && cell.end <= column.end).map(cell => cell.text);
  // Every official revenue cell has an explicit dollar sign. A percent or a
  // second numeric token is never silently stripped or treated as money.
  requireValue(selected.length === 2 && selected[0] === '$', 'micron-value-invalid');
  const raw = selected[1];
  requireValue(/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,6})?$/.test(raw), 'micron-value-invalid');
  const [whole, fraction = ''] = raw.replaceAll(',', '').split('.');
  const dollars = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  requireValue(dollars <= BigInt(Number.MAX_SAFE_INTEGER), 'micron-value-invalid');
  return Number(dollars);
}
function priorMoney(cells, column) {
  if (!column) return null;
  try { return moneyInColumn(cells, column); } catch { return null; }
}
function sumRevenue(items, key) {
  const result = items.reduce((sum, item) => sum + item[key], 0);
  requireValue(Number.isSafeInteger(result), 'micron-value-invalid');
  return result;
}
function verifyUnits(context, requireCaption) {
  requireValue((!requireCaption || /\bin millions\b/i.test(context)) && /\$/.test(context)
    && !/\bin (?:(?:U\.?S\.?|US)\s+)?dollars\b|\bin USD\b/i.test(context)
    && !/\b(?:Canadian|Australian|New Zealand|Singapore|Hong Kong|Taiwan|Jamaican|Bahamian|Bermudian|Fijian|Namibian) dollars\b|\b(?:francs|renminbi|rupees|won|krona|kroner|reais|pesos|rubles|riyals|dirhams|baht|dong)\b/i.test(context)
    && !/\b(?:thousands|billions|GBP|EUR|CNY|RMB|HKD|CAD|AUD|NZD|SGD|TWD|JPY|CHF|INR|KRW|SEK|NOK|DKK|BRL|MXN|ZAR|ILS|RUB|SAR|AED|THB|VND|pounds|euros|yuan|yen|sterling)\b|[£€¥]|(?:HK|C|A|NZ|S)\$/i.test(context), 'micron-unit-mismatch');
}
function hasRow(table, name) { return table.rows.some(cells => firstText(cells) === name); }
function row(table, name) {
  const rows = table.rows.filter(cells => firstText(cells) === name);
  requireValue(rows.length === 1, 'micron-row-missing-or-ambiguous');
  return rows[0];
}
function uniqueTable(tables, predicate) {
  const matches = tables.filter(predicate);
  requireValue(matches.length === 1, matches.length ? 'micron-table-ambiguous' : 'micron-table-not-found');
  return matches[0];
}
function uniqueCell(table, predicate) {
  const matches = table.rows.flat().filter(predicate);
  requireValue(matches.length === 1, 'micron-quarter-columns-invalid');
  return matches[0];
}
function dateKey(value) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}
function englishDate([month, day, year]) {
  const monthIndex = MONTHS.findIndex(name => name.toLowerCase() === String(month).toLowerCase());
  return dateKey(`${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}
function parseEnglishDate(value) {
  const match = value.match(new RegExp(`^${DATE_PATTERN}$`, 'i'));
  return match ? englishDate(match.slice(1, 4)) : null;
}
function validFiscalEnd(end, quarter, year) {
  if (!end) return false;
  const date = new Date(end);
  return date.getUTCDay() === 4 && date.getUTCFullYear() === year - (quarter === 1 ? 1 : 0)
    && [[11, 12], [2, 3], [5, 6], [8, 9]][quarter - 1].includes(date.getUTCMonth() + 1);
}

function readTables(html) {
  const tables = [];
  let previousEnd = 0;
  for (const match of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi)) {
    requireValue(tables.length < 100 && !/<table\b/i.test(match[0].slice(6)), 'micron-table-invalid');
    const grid = [];
    const rows = [];
    for (const rowMatch of match[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
      const rowIndex = rows.length;
      requireValue(rowIndex < 500, 'micron-table-invalid');
      grid[rowIndex] ||= [];
      const cells = [];
      let column = 0;
      for (const cellMatch of rowMatch[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]\s*>/gi)) {
        while (grid[rowIndex][column]) column += 1;
        const span = name => {
          const values = [...cellMatch[1].matchAll(new RegExp(`\\b${name}\\s*=\\s*["']?(\\d+)["']?`, 'gi'))];
          requireValue(values.length <= 1, 'micron-table-invalid');
          const count = values.length ? Number(values[0][1]) : 1;
          requireValue(count >= 1 && count <= 120, 'micron-table-invalid');
          return count;
        };
        const width = span('colspan');
        const height = span('rowspan');
        requireValue(column + width <= 256 && rowIndex + height <= 500, 'micron-table-invalid');
        const cell = { text: clean(cellMatch[2]), start: column, end: column + width, row: rowIndex };
        for (let r = rowIndex; r < rowIndex + height; r += 1) {
          grid[r] ||= [];
          for (let c = column; c < column + width; c += 1) {
            requireValue(!grid[r][c], 'micron-table-invalid');
            grid[r][c] = cell;
          }
        }
        cells.push(cell);
        column += width;
      }
      rows.push(cells);
    }
    tables.push({ rows, text: clean(match[0]), before: clean(html.slice(previousEnd, match.index)) });
    previousEnd = match.index + match[0].length;
  }
  return tables;
}
