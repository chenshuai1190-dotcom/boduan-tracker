#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  fetchEodhdEarningsCalendar,
  fetchEodhdEarningsTrends,
  mergeEarningsTrendData,
} from '../api/earnings-calendar.js';
import { toEodhdUsSymbol } from '../src/lib/earningsCalendarModel.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

loadLocalEnv(path.join(rootDir, '.env.local'));

const eodhdKey = cleanEnv(process.env.EODHD_API_KEY);
if (!eodhdKey) {
  console.error('EODHD_API_KEY missing. Set it in process env or local .env.local before running this smoke test.');
  process.exit(2);
}

const symbols = readArg('symbols', 'NVDA,MSFT,GOOGL,META,TSM')
  .split(',')
  .map((symbol) => symbol.trim().toUpperCase())
  .filter(Boolean);
const from = readArg('from', addUtcDays(new Date().toISOString().slice(0, 10), -14));
const to = readArg('to', addUtcDays(new Date().toISOString().slice(0, 10), 90));
const eodhdSymbols = symbols.map(toEodhdUsSymbol).filter(Boolean);

try {
  const [rawEarnings, rawTrends, events, trends] = await Promise.all([
    fetchEodhdJson('/api/calendar/earnings', { symbols: eodhdSymbols.join(','), from, to }),
    fetchEodhdJson('/api/calendar/trends', { symbols: eodhdSymbols.join(',') }),
    fetchEodhdEarningsCalendar({ symbols, from, to, eodhdKey }),
    fetchEodhdEarningsTrends({ symbols, eodhdKey }),
  ]);
  const merged = mergeEarningsTrendData(events, trends);
  const revenueRows = merged.filter((event) => event.revenueEstimate !== null && event.revenueEstimate !== undefined);
  const rawTrendRows = flattenRows(Array.isArray(rawTrends?.trends) ? rawTrends.trends : rawTrends);
  const rawEarningsRows = Array.isArray(rawEarnings?.earnings) ? rawEarnings.earnings : Array.isArray(rawEarnings) ? rawEarnings : [];

  const summary = {
    ok: revenueRows.length > 0,
    symbols,
    from,
    to,
    raw: {
      earningsRows: rawEarningsRows.length,
      earningsSampleKeys: Object.keys(rawEarningsRows[0] || {}),
      trendsNested: Array.isArray(rawTrends?.trends?.[0]),
      trendRows: rawTrendRows.length,
      trendSampleKeys: Object.keys(rawTrendRows[0] || {}),
      trendRowsWithRevenueEstimateAvg: rawTrendRows.filter((row) => row?.revenueEstimateAvg !== null && row?.revenueEstimateAvg !== undefined && row?.revenueEstimateAvg !== '').length,
    },
    projectMerge: {
      events: events.length,
      trends: trends.length,
      merged: merged.length,
      revenueMerged: revenueRows.length,
      rows: merged.map((event) => ({
        symbol: event.symbol,
        reportDate: event.reportDate,
        fiscalDate: event.fiscalDate,
        revenueEstimate: event.revenueEstimate,
        epsEstimate: event.epsEstimate,
        analystCount: event.analystCount,
        currency: event.currency,
      })),
    },
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exit(3);
} catch (error) {
  console.error(sanitizeError(error));
  process.exit(1);
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
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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

async function fetchEodhdJson(apiPath, params) {
  const url = new URL(apiPath, 'https://eodhd.com');
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  url.searchParams.set('api_token', eodhdKey);
  url.searchParams.set('fmt', 'json');

  const response = await fetch(url.toString(), { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`EODHD ${apiPath} HTTP ${response.status}`);
  return response.json();
}

function flattenRows(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (Array.isArray(item) ? flattenRows(item) : item && typeof item === 'object' ? [item] : []));
}

function addUtcDays(date, days) {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}

function sanitizeError(error) {
  return String(error?.stack || error?.message || error || 'unknown error').replace(/api_token=[^&\s]+/g, 'api_token=***');
}
