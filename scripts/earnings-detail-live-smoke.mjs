#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  enrichPublishedEarningsData,
  fetchEodhdEarningsCalendar,
  fetchEodhdEarningsTrends,
  mergeEarningsTrendData,
} from '../api/earnings-calendar.js';
import { fetchSecEarningsDetail } from '../server/earnings/secEarningsDetail.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stableLocalEnvPath = process.env.HOME
  ? path.join(process.env.HOME, '.config', 'boduan-tracker', 'eodhd.env')
  : null;

loadLocalEnv(path.join(rootDir, '.env.local'));
if (stableLocalEnvPath) loadLocalEnv(stableLocalEnvPath);

const eodhdKey = cleanEnv(process.env.EODHD_API_KEY);
if (!eodhdKey) {
  console.error('EODHD_API_KEY missing. Configure it locally before running this smoke test.');
  process.exit(2);
}

const symbols = readArg('symbols', 'AMD,GOOGL,TSLA,NVDA,META,MSFT,IBKR,NOK,TSM')
  .split(',')
  .map((symbol) => symbol.trim().toUpperCase())
  .filter(Boolean);
const now = normalizeDate(readArg('now', '')) || new Date();
const today = newYorkDateKey(now);
// Mirror the application range. includePreviousPublished expands only the
// already-existing market request so older latest reports remain available.
const from = readArg('from', addUtcDays(today, -7));
const to = readArg('to', addUtcDays(today, 90));

try {
  const [calendarRows, trends] = await Promise.all([
    fetchEodhdEarningsCalendar({
      symbols,
      from,
      to,
      includePreviousPublished: true,
      eodhdKey,
      now,
    }),
    fetchEodhdEarningsTrends({ symbols, eodhdKey }),
  ]);
  const merged = mergeEarningsTrendData(calendarRows, trends);
  const enriched = await enrichPublishedEarningsData({
    events: merged,
    eodhdKey,
    now,
  });
  const latestBySymbol = selectLatestPublishedEvents(enriched, symbols, today);
  const rows = [];

  for (const symbol of symbols) {
    const event = latestBySymbol.get(symbol);
    if (!event) {
      rows.push({
        symbol,
        status: 'missing-event',
        reason: 'latest-published-event-not-found',
        sections: emptySectionCounts(),
      });
      continue;
    }

    const detail = await fetchSecEarningsDetail({
      symbol,
      fiscalDate: event.fiscalDate,
      reportDate: event.reportDate,
      now,
    });
    rows.push({
      symbol,
      providerFiscalDate: event.providerFiscalDate || null,
      fiscalDate: event.fiscalDate || null,
      reportDate: event.reportDate || null,
      status: detail.status,
      reason: detail.reason || null,
      failureReason: detail.failureReason || null,
      period: {
        start: detail.period?.start || null,
        end: detail.period?.end || null,
      },
      source: {
        provider: detail.source?.provider || null,
        form: detail.source?.form || null,
      },
      sections: sectionCounts(detail),
    });
  }

  const failures = rows.filter((row) => (
    !['complete', 'partial'].includes(row.status)
    || Object.values(row.sections).reduce((sum, count) => sum + count, 0) === 0
  ));
  console.log(JSON.stringify({
    ok: failures.length === 0,
    checkedAt: now.toISOString(),
    today,
    symbols,
    rows,
  }, null, 2));
  if (failures.length > 0) process.exit(3);
} catch (error) {
  console.error(sanitizeError(error));
  process.exit(1);
}

function selectLatestPublishedEvents(events, requestedSymbols, todayKey) {
  const requested = new Set(requestedSymbols);
  const output = new Map();
  for (const event of events || []) {
    const symbol = String(event?.symbol || '').trim().toUpperCase();
    const reportDate = dateKey(event?.reportDate);
    const fiscalDate = dateKey(event?.fiscalDate);
    const published = event?.earningsPublished === true
      || finite(event?.epsActual)
      || finite(event?.revenueActual)
      || finite(event?.revenueActualUsd);
    if (!requested.has(symbol) || !reportDate || !fiscalDate || reportDate > todayKey || !published) {
      continue;
    }
    const previous = output.get(symbol);
    if (!previous
      || reportDate > previous.reportDate
      || (reportDate === previous.reportDate && fiscalDate > previous.fiscalDate)) {
      output.set(symbol, event);
    }
  }
  return output;
}

function sectionCounts(detail) {
  return {
    reportSegments: detail?.sections?.reportSegments?.items?.length || 0,
    revenueBreakdown: detail?.sections?.revenueBreakdown?.items?.length || 0,
    geographies: detail?.sections?.geographies?.items?.length || 0,
  };
}

function emptySectionCounts() {
  return {
    reportSegments: 0,
    revenueBreakdown: 0,
    geographies: 0,
  };
}

function finite(value) {
  if (value === null || value === undefined || value === '') return false;
  return Number.isFinite(Number(value));
}

function loadLocalEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = stripQuotes(rawValue.trim());
  }
}

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function cleanEnv(value) {
  return String(value || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
}

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function normalizeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function newYorkDateKey(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addUtcDays(date, days) {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}

function dateKey(value) {
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] || '';
}

function sanitizeError(error) {
  return String(error?.stack || error?.message || error || 'unknown error')
    .replace(/api_token=[^&\s]+/g, 'api_token=***');
}
