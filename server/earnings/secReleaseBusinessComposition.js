import { htmlToText } from './secOfficialParsers.js';

const DAY = 86_400_000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DATE_PATTERN = `(${MONTHS.join('|')})\\s+(\\d{1,2}),?\\s+(20\\d{2})`;
const PROFILES = {
  AVGO: { cik: '0001730168', form: '8-K', documentType: 'EX-99.1', identity: /\bBroadcom Inc\./i },
  ARM: { cik: '0001973239', form: '6-K', documentType: 'EX-99.2', identity: /\bArm Holdings plc\b/i },
};
const clean = (value) => htmlToText(String(value || '')).replace(/\s+/g, ' ').trim();
const fail = (reason) => { throw Object.assign(new Error(reason), { code: reason }); };
const requireValue = (condition, reason) => { if (!condition) fail(reason); };
const label = (value) => clean(value).replace(/\s*\(\d+\)$/, '').toLowerCase();
const unavailable = (reason) => ({ status: 'unavailable', reason, items: [] });

// Company-specific official release tables, NOT a general HTML-number reader.
// The validated issuer profiles report financial statements in USD. Their '$'
// plus 'in millions' notation is accepted only inside the recognized tables;
// an unrelated issuer or an explicit conflicting currency never inherits USD.
export function inspectReleaseBusinessComposition({ symbol, fiscalDate, html, filing = {}, sourceUrl } = {}) {
  try {
    const normalized = String(symbol || '').trim().toUpperCase().replace(/\.US$/, '');
    const profile = PROFILES[normalized];
    requireValue(profile, 'unsupported-release-symbol');
    requireValue(filing.form === profile.form, 'unsupported-filing-form');
    requireValue(filing.documentType === profile.documentType, 'unsupported-document-type');
    requireValue(String(filing.cik || '').padStart(10, '0') === profile.cik
      && /^\d{10}-\d{2}-\d{6}$/.test(filing.accession || ''), 'release-identity-mismatch');
    const expectedPath = `/Archives/edgar/data/${Number(profile.cik)}/${filing.accession.replaceAll('-', '')}/`;
    let source;
    try { source = new URL(sourceUrl); } catch { fail('release-source-mismatch'); }
    requireValue(source.origin === 'https://www.sec.gov' && !source.username && !source.password
      && !source.search && !source.hash && source.pathname.startsWith(expectedPath)
      && /^[A-Za-z0-9._-]+\.html?$/.test(source.pathname.slice(expectedPath.length)), 'release-source-mismatch');
    requireValue(typeof html === 'string' && html.length > 100 && html.length <= 3_000_000, 'release-document-invalid');
    const safeHtml = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
    const text = clean(safeHtml);
    requireValue(profile.identity.test(text), 'release-identity-mismatch');
    const tables = readTables(safeHtml);
    const parsed = normalized === 'AVGO' ? parseBroadcom(tables, text) : parseArm(tables);
    const requested = dateKey(fiscalDate);
    requireValue(requested && Math.abs(Date.parse(requested) - Date.parse(parsed.period.end)) <= 31 * DAY,
      'release-period-mismatch');
    return {
      result: {
        ...parsed, currency: 'USD', status: 'partial',
        sourceMetadata: {
          provider: 'SEC', adapterId: `sec-release-${normalized.toLowerCase()}-v1`,
          evidence: 'official-release-quarter-tables-reconciled',
          cik: profile.cik, accession: filing.accession, form: profile.form,
          documentType: profile.documentType, officialFiscalDate: parsed.period.end,
          reportingCurrencyBasis: 'verified-issuer-usd-profile',
        },
      },
      reason: null,
    };
  } catch (error) {
    return { result: null, reason: /^[a-z][a-z0-9-]{0,119}$/.test(error?.code || '') ? error.code : 'release-table-invalid' };
  }
}

function parseBroadcom(tables, text) {
  const title = [...text.matchAll(/Broadcom Inc\. Announces (First|Second|Third|Fourth) Quarter Fiscal Year (20\d{2}) Financial Results/gi)];
  const announced = [...text.matchAll(new RegExp(`reported financial results for its (first|second|third|fourth) quarter of fiscal year (20\\d{2}), ended ${DATE_PATTERN}`, 'gi'))];
  requireValue(title.length === 1 && announced.length === 1, 'release-quarter-identity-missing');
  const ordinal = ['first', 'second', 'third', 'fourth'];
  const quarter = ordinal.indexOf(title[0][1].toLowerCase()) + 1;
  const year = Number(title[0][2]);
  const end = englishDate(announced[0].slice(3, 6));
  requireValue(title[0][1].toLowerCase() === announced[0][1].toLowerCase()
    && year === Number(announced[0][2]) && end, 'release-period-mismatch');
  const endDate = new Date(end);
  requireValue(endDate.getUTCFullYear() === year
    && [[1, 2], [4, 5], [7, 8], [10, 11]][quarter - 1].includes(endDate.getUTCMonth() + 1), 'release-period-mismatch');
  const segment = uniqueTable(tables, (table) => hasRow(table, 'Net revenue by segment')
    && hasRow(table, 'Semiconductor solutions') && hasRow(table, 'Infrastructure software'));
  const summary = uniqueTable(tables, (table) => hasRow(table, 'Net revenue')
    && hasRow(table, 'Earnings per common share - diluted'));
  const operations = uniqueTable(tables, (table) => /CONDENSED CONSOLIDATED STATEMENTS OF OPERATIONS/i.test(table.before)
    && hasRow(table, 'Net revenue'));
  for (const table of [segment, summary, operations]) verifyUnits(table);
  const pair = quarterPair(segment, quarter, year);
  const summaryPair = quarterPair(summary, quarter, year, gaapHeader(summary));
  const dateGroup = uniqueCell(operations, (cell) => cell.text === 'Fiscal Quarter Ended');
  const dates = operations.rows.flat().filter((cell) => cell.row > dateGroup.row
    && cell.start >= dateGroup.start && cell.end <= dateGroup.end && parseEnglishDate(cell.text));
  requireValue(dates.length >= 2 && dates.length <= 3 && dates[0].row === dates[1].row
    && (!dates[2] || dates[1].row === dates[2].row),
    'release-quarter-columns-invalid');
  const [currentDate, previousQuarterDate, previousYearDate] = dates.map((cell) => parseEnglishDate(cell.text));
  const distance = (left, right) => (Date.parse(left) - Date.parse(right)) / DAY;
  requireValue(currentDate === end && dates.slice(0, 2).every((cell) => new Date(parseEnglishDate(cell.text)).getUTCDay() === 0)
    && [84, 91, 98].includes(distance(end, previousQuarterDate)), 'release-quarter-duration-invalid');
  const priorYearColumn = dates[2] && new Date(previousYearDate).getUTCDay() === 0
    && [364, 371].includes(distance(end, previousYearDate)) ? dates[2] : null;
  const totals = pairValues(segment, 'Total net revenue', pair, { shares: true });
  const statement = [moneyInColumn(row(operations, 'Net revenue'), dates[0]), priorMoney(row(operations, 'Net revenue'), priorYearColumn)];
  const highlights = pairValues(summary, 'Net revenue', summaryPair);
  requireValue(totals[0] === highlights[0] && totals[0] === statement[0],
    'release-current-total-mismatch');
  const items = [
    item('semiconductor-solutions', 'Semiconductor solutions', '半导体解决方案', pairValues(segment, 'Semiconductor solutions', pair, { shares: true })),
    item('infrastructure-software', 'Infrastructure software', '基础设施软件', pairValues(segment, 'Infrastructure software', pair, { shares: true })),
  ];
  reconcile(items, totals, [highlights, statement]);
  return {
    totalRevenue: totals[0], previousTotalRevenue: totals[1],
    period: { start: new Date(Date.parse(previousQuarterDate) + DAY).toISOString().slice(0, 10), end, fiscalYear: String(year), fiscalPeriod: `Q${quarter}` },
    sections: {
      reportSegments: complete(items),
      revenueBreakdown: unavailable('quarterly-revenue-breakdown-not-disclosed'),
      geographies: unavailable('quarterly-geographies-not-disclosed'),
    },
  };
}

function parseArm(tables) {
  const summary = uniqueTable(tables, (table) => hasRow(table, 'License and other revenue')
    && hasRow(table, 'Royalty revenue') && hasRow(table, 'Total revenue'));
  const operations = uniqueTable(tables, (table) => /Arm Holdings plc Condensed Consolidated Income Statements/i.test(table.before)
    && hasRow(table, 'Revenue from external customers') && hasRow(table, 'Total revenue'));
  for (const table of [summary, operations]) verifyUnits(table);
  const dates = [...summary.before.matchAll(new RegExp(`(?:for the )three months ended ${DATE_PATTERN}`, 'gi'))];
  requireValue(dates.length === 1 && !/(?:six|nine|twelve) months ended/i.test(summary.before), 'release-quarter-identity-missing');
  const end = englishDate(dates[0].slice(1, 4));
  requireValue(end, 'release-period-mismatch');
  const date = new Date(end);
  const month = date.getUTCMonth() + 1;
  const calendarYear = date.getUTCFullYear();
  requireValue([3, 6, 9, 12].includes(month)
    && new Date(Date.UTC(calendarYear, month, 0)).toISOString().slice(0, 10) === end, 'release-quarter-duration-invalid');
  const quarter = month === 3 ? 4 : month / 3 - 1;
  const fiscalYear = calendarYear + (month === 3 ? 0 : 1);
  const pair = quarterPair(summary, quarter, fiscalYear, gaapHeader(summary));
  const dateHeader = uniqueCell(operations, (cell) => /^Three Months Ended /i.test(cell.text));
  requireValue(dateHeader.text.toLowerCase() === `three months ended ${MONTHS[month - 1]} ${date.getUTCDate()},`.toLowerCase(),
    'release-period-mismatch');
  const years = operations.rows.flat().filter((cell) => cell.row > dateHeader.row
    && cell.start >= dateHeader.start && cell.end <= dateHeader.end && /^20\d{2}$/.test(cell.text));
  requireValue(years.length >= 1 && years[0].text === String(calendarYear)
    && years.filter((cell) => cell.text === String(calendarYear)).length === 1, 'release-quarter-columns-invalid');
  const priorYearColumn = years.length === 2 && years[1].text === String(calendarYear - 1)
    && years[0].row === years[1].row ? years[1] : null;
  const totals = pairValues(summary, 'Total revenue', pair);
  const statementTotals = [moneyInColumn(row(operations, 'Total revenue'), years[0]), priorMoney(row(operations, 'Total revenue'), priorYearColumn)];
  requireValue(totals[0] === statementTotals[0], 'release-current-total-mismatch');
  const items = [
    item('royalty', 'Royalty revenue', '版税收入', pairValues(summary, 'Royalty revenue', pair)),
    item('license-and-other', 'License and other revenue', '授权及其他收入', pairValues(summary, 'License and other revenue', pair)),
  ];
  reconcile(items, totals, [statementTotals]);
  return {
    totalRevenue: totals[0], previousTotalRevenue: totals[1],
    period: { start: new Date(Date.UTC(calendarYear, month - 3, 1)).toISOString().slice(0, 10), end, fiscalYear: String(fiscalYear), fiscalPeriod: `Q${quarter}` },
    sections: {
      reportSegments: unavailable('quarterly-report-segments-not-disclosed'),
      revenueBreakdown: complete(items),
      geographies: unavailable('quarterly-geographies-not-disclosed'),
    },
  };
}

function complete(items) {
  return { status: 'complete', reason: null, items, metricStatus: {
    revenue: { status: 'complete', reason: null },
    previousRevenue: items.every((item) => Number.isFinite(item.previousRevenue))
      ? { status: 'complete', reason: null }
      : { status: 'unavailable', reason: 'quarterly-comparable-revenue-unavailable' },
    profit: { status: 'unavailable', reason: 'quarterly-segment-profit-not-disclosed' },
    previousProfit: { status: 'unavailable', reason: 'quarterly-segment-profit-not-disclosed' },
  } };
}
function item(id, name, nameZh, values) {
  return { id, label: name, labelZh: nameZh, revenue: values[0], previousRevenue: values[1], profit: null, previousProfit: null, currency: 'USD' };
}
function reconcile(items, totals, corroborating) {
  requireValue(totals[0] > 0
    && items.reduce((sum, value) => sum + value.revenue, 0) === totals[0], 'release-revenue-reconciliation-failed');
  const comparable = Number.isFinite(totals[1]) && totals[1] > 0
    && items.every((value) => Number.isFinite(value.previousRevenue))
    && items.reduce((sum, value) => sum + value.previousRevenue, 0) === totals[1]
    && corroborating.every((pair) => pair[1] === totals[1]);
  if (!comparable) {
    totals[1] = null;
    for (const value of items) value.previousRevenue = null;
  }
}
function row(table, name) {
  const rows = table.rows.filter((cells) => label(cells.find((cell) => cell.text)?.text) === name.toLowerCase());
  requireValue(rows.length === 1, 'release-row-missing-or-ambiguous');
  return rows[0];
}
function hasRow(table, name) { return table.rows.some((cells) => label(cells.find((cell) => cell.text)?.text) === name.toLowerCase()); }
function uniqueTable(tables, predicate) {
  const matches = tables.filter(predicate);
  requireValue(matches.length === 1, matches.length ? 'release-table-ambiguous' : 'release-table-not-found');
  return matches[0];
}
function uniqueCell(table, predicate) {
  const matches = table.rows.flat().filter(predicate);
  requireValue(matches.length === 1, 'release-quarter-columns-invalid');
  return matches[0];
}
function gaapHeader(table) { return uniqueCell(table, (cell) => cell.text === 'GAAP'); }
function quarterPair(table, quarter, year, group) {
  const candidates = table.rows.flat().filter((cell) => /^Q[1-4]\s+(?:FYE)?(?:\d{2}|20\d{2})$/.test(cell.text)
    && (!group || (cell.row > group.row && cell.start >= group.start && cell.end <= group.end)));
  // The ARM overview repeats quarter headings below its financial rows for
  // operational metrics. Only the first financial header row is in scope.
  const firstRow = Math.min(...candidates.map((cell) => cell.row));
  const pair = candidates.filter((cell) => cell.row === firstRow);
  requireValue(pair.length >= 1, 'release-quarter-columns-invalid');
  const identity = (cell) => { const match = cell.text.match(/^Q([1-4])\s+(?:FYE)?(\d{2}|20\d{2})$/); return [Number(match[1]), match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2])]; };
  requireValue(identity(pair[0])[0] === quarter && identity(pair[0])[1] === year
    && pair.filter((cell) => identity(cell)[0] === quarter && identity(cell)[1] === year).length === 1, 'release-quarter-columns-invalid');
  requireValue(!/(?:annual|year.to.date|six months|nine months|twelve months)/i.test(table.rows[firstRow].map((cell) => cell.text).join(' ')), 'release-quarter-columns-invalid');
  const previous = pair.length === 2 && identity(pair[1])[0] === quarter && identity(pair[1])[1] === year - 1 ? pair[1] : null;
  return [pair[0], previous];
}
function pairValues(table, name, pair, options) {
  const cells = row(table, name);
  return [moneyInColumn(cells, pair[0], options), priorMoney(cells, pair[1], options)];
}
function priorMoney(cells, column, options) {
  if (!column) return null;
  try { return moneyInColumn(cells, column, options); } catch { return null; }
}
function moneyInColumn(cells, column, { shares = false } = {}) {
  const selected = cells.filter((cell) => cell.text && cell.start >= column.start && cell.end <= column.end);
  const tokens = selected.map((cell) => cell.text);
  if (tokens[0] === '$') tokens.shift();
  requireValue(tokens.length > 0, 'release-value-missing');
  const raw = tokens.shift().replace(/^\$\s*/, '');
  requireValue(/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,6})?$/.test(raw), 'release-value-invalid');
  if (tokens.length) {
    const rest = tokens.join('').replace(/\s/g, '');
    requireValue(shares && /^\d{1,3}(?:\.\d+)?%?$/.test(rest)
      && Number(rest.replace('%', '')) <= 100, 'release-column-conflict');
  }
  const [whole, fraction = ''] = raw.replaceAll(',', '').split('.');
  const dollars = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  requireValue(dollars <= BigInt(Number.MAX_SAFE_INTEGER), 'release-value-invalid');
  return Number(dollars);
}
function verifyUnits(table) {
  const context = `${table.before} ${table.text}`;
  requireValue(/\bin millions\b/i.test(context) && /\$/.test(table.text)
    && !/\b(?:thousands|billions|GBP|EUR|CNY|RMB|HKD|CAD|AUD|NZD|SGD|TWD|JPY|CHF|INR|KRW|SEK|NOK|DKK|BRL|MXN|ZAR|ILS|RUB|SAR|AED|THB|VND|pounds|euros|yuan|yen|sterling)\b|[£€¥]|(?:HK|C|A|NZ|S)\$/i.test(context), 'release-unit-mismatch');
}
function dateKey(value) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}
function englishDate([month, day, year]) {
  const monthIndex = MONTHS.findIndex((name) => name.toLowerCase() === String(month).toLowerCase());
  return dateKey(`${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}
function parseEnglishDate(value) {
  const match = value.match(new RegExp(`^${DATE_PATTERN}$`, 'i'));
  return match ? englishDate(match.slice(1, 4)) : null;
}

function readTables(html) {
  const tables = [];
  let previousEnd = 0;
  for (const match of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi)) {
    requireValue(tables.length < 100 && !/<table\b/i.test(match[0].slice(6)), 'release-table-invalid');
    const grid = [];
    const rows = [];
    for (const rowMatch of match[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
      const rowIndex = rows.length;
      requireValue(rowIndex < 500, 'release-table-invalid');
      grid[rowIndex] ||= [];
      const cells = [];
      let column = 0;
      for (const cellMatch of rowMatch[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]\s*>/gi)) {
        while (grid[rowIndex][column]) column += 1;
        const span = (name) => {
          const value = cellMatch[1].match(new RegExp(`\\b${name}\\s*=\\s*["']?(\\d+)["']?`, 'i'));
          const count = value ? Number(value[1]) : 1;
          requireValue(count >= 1 && count <= 120, 'release-table-invalid');
          return count;
        };
        const width = span('colspan');
        const height = span('rowspan');
        requireValue(column + width <= 256 && rowIndex + height <= 500, 'release-table-invalid');
        const cell = { text: clean(cellMatch[2]), start: column, end: column + width, row: rowIndex };
        for (let r = rowIndex; r < rowIndex + height; r += 1) {
          grid[r] ||= [];
          for (let c = column; c < column + width; c += 1) {
            requireValue(!grid[r][c], 'release-table-invalid');
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
