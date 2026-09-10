#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COVERAGE_LIMITS, runEarningsDetailCoverage } from '../server/earnings/earningsDetailCoverage.js';

export const COVERAGE_HELP = `Usage: node scripts/earnings-detail-coverage.mjs <events.json> [--live]

Stage 1 SEC parser coverage diagnostic. Default: validate an explicit JSON event
array and print a plan; make no network requests. Input: 1-20 unique events with
symbol, fiscalDate and reportDate. Optional: providerFiscalDate, officialFiscalDate.

--live   Read public SEC documents sequentially; requires SEC_USER_AGENT in the
         current process environment. No .env loading, database reads, EODHD,
         retries, scheduling or production writes. Limits: 100 HTTP requests in
         total, 6 per event, 12 seconds per event; no redirect following.
--help   Print this help without reading an input file or environment values.

Output: JSON containing statuses, source form/documentType/parser when supplied,
three section counts and diagnostic reason codes. No financial amounts or tokens.
Exit: 0 = valid plan or all events have SEC structure; 2 = invalid input/setup;
      3 = live run has one or more events without SEC structure.
`;

export function parseCoverageArgs(argv) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) return { help: true };
  const paths = argv.filter((value) => !value.startsWith('-'));
  if (paths.length !== 1 || argv.some((value) => value.startsWith('-') && value !== '--live')
    || argv.filter((value) => value === '--live').length > 1) {
    throw new Error('expected-events-json-path-and-optional-live');
  }
  return { help: false, filePath: paths[0], live: argv.includes('--live') };
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseCoverageArgs(argv);
    if (options.help) {
      console.log(COVERAGE_HELP);
      return 0;
    }
    const stat = await fs.stat(options.filePath).catch(() => null);
    if (!stat?.isFile() || stat.size > COVERAGE_LIMITS.inputBytes) {
      throw new Error('input-must-be-json-file-under-256-KiB');
    }
    let events;
    try { events = JSON.parse(await fs.readFile(options.filePath, 'utf8')); }
    catch { throw new Error('input-file-is-not-valid-JSON'); }
    const report = await runEarningsDetailCoverage({
      events,
      live: options.live,
      userAgent: options.live ? process.env.SEC_USER_AGENT : '',
    });
    console.log(JSON.stringify(report, null, 2));
    return report.coverage && report.coverage.coveredEvents !== report.eventCount ? 3 : 0;
  } catch (error) {
    const reason = /^[a-zA-Z0-9_-]+$/.test(error?.message || '') ? error.message : 'coverage-input-or-setup-failed';
    console.error(JSON.stringify({ status: 'error', reason }));
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
