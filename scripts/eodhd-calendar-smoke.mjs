#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  fetchEodhdEarningsCalendar,
  fetchEodhdEarningsTrends,
  fetchEodhdUsdForexRates,
  enrichPublishedEarningsData,
  mergeEarningsTrendData,
  mergeEarningsRevenueUsd,
} from '../api/earnings-calendar.js';
import { toEodhdUsSymbol } from '../src/lib/earningsCalendarModel.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stableLocalEnvPath = process.env.HOME
  ? path.join(process.env.HOME, '.config', 'boduan-tracker', 'eodhd.env')
  : null;

loadLocalEnv(path.join(rootDir, '.env.local'));
if (stableLocalEnvPath) loadLocalEnv(stableLocalEnvPath);

const eodhdKey = cleanEnv(process.env.EODHD_API_KEY);
if (!eodhdKey) {
  console.error('EODHD_API_KEY missing. Set it in process env, local .env.local, or ~/.config/boduan-tracker/eodhd.env before running this smoke test.');
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
    fetchEodhdJson('/api/calendar/earnings', { from, to }),
    fetchEodhdJson('/api/calendar/trends', { symbols: eodhdSymbols.join(',') }),
    fetchEodhdEarningsCalendar({ symbols, from, to, eodhdKey }),
    fetchEodhdEarningsTrends({ symbols, eodhdKey }),
  ]);
  const merged = mergeEarningsTrendData(events, trends);
  const enriched = await enrichPublishedEarningsData({ events: merged, eodhdKey });
  const fxRates = await fetchEodhdUsdForexRates({
    currencies: enriched.flatMap((event) => [
      event.currency,
      event.revenueOriginalCurrency,
      event.revenueActualOriginalCurrency,
      event.revenuePreviousYearOriginalCurrency,
      event.ebitActualOriginalCurrency,
      event.ebitPreviousYearOriginalCurrency,
    ]),
    eodhdKey,
  });
  const normalized = mergeEarningsRevenueUsd(enriched, fxRates);
  const revenueRows = merged.filter((event) => event.revenueEstimate !== null && event.revenueEstimate !== undefined);
  const usdRevenueRows = normalized.filter((event) => event.revenueEstimateUsd !== null && event.revenueEstimateUsd !== undefined);
  const publishedRows = normalized.filter((event) => event.earningsPublished);
  const actualRevenueRows = normalized.filter((event) => event.revenueActualUsd !== null && event.revenueActualUsd !== undefined);
  const actualEbitRows = normalized.filter((event) => event.ebitActualUsd !== null && event.ebitActualUsd !== undefined);
  const marketReactionRows = normalized.filter((event) => event.marketReactionPercent !== null && event.marketReactionPercent !== undefined);
  const rawTrendRows = flattenRows(Array.isArray(rawTrends?.trends) ? rawTrends.trends : rawTrends);
  const rawEarningsRows = Array.isArray(rawEarnings?.earnings) ? rawEarnings.earnings : Array.isArray(rawEarnings) ? rawEarnings : [];

  const summary = {
    ok: revenueRows.length > 0 && usdRevenueRows.length > 0,
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
      merged: normalized.length,
      revenueMerged: revenueRows.length,
      usdRevenueMerged: usdRevenueRows.length,
      publishedMerged: publishedRows.length,
      actualRevenueMerged: actualRevenueRows.length,
      actualEbitMerged: actualEbitRows.length,
      marketReactionMerged: marketReactionRows.length,
      rows: normalized.map((event) => ({
        symbol: event.symbol,
        reportDate: event.reportDate,
        fiscalDate: event.fiscalDate,
        earningsPublished: event.earningsPublished,
        earningsResult: event.earningsResult,
        revenueEstimate: event.revenueEstimate,
        revenueEstimateUsd: event.revenueEstimateUsd,
        revenueEstimateYoyPercent: event.revenueEstimateYoyPercent,
        revenueActualUsd: event.revenueActualUsd,
        revenueActualYoyPercent: event.revenueActualYoyPercent,
        revenueSurprisePercent: event.revenueSurprisePercent,
        ebitActualUsd: event.ebitActualUsd,
        ebitPreviousYearUsd: event.ebitPreviousYearUsd,
        ebitActualYoyPercent: event.ebitActualYoyPercent,
        ebitActualBasis: event.ebitActualBasis,
        marketReactionPercent: event.marketReactionPercent,
        revenueFxRate: event.revenueFxRate,
        revenueFxSource: event.revenueFxSource,
        epsEstimate: event.epsEstimate,
        epsActual: event.epsActual,
        epsActualYoyPercent: event.epsActualYoyPercent,
        epsEstimateYoyPercent: event.epsEstimateYoyPercent,
        surprisePercent: event.surprisePercent,
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
