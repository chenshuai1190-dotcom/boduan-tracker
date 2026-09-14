import { createHash } from 'node:crypto';
import { fetchStockDecisionValuationSource } from './stockDecisionValuationSource.js';
import { buildStockDecisionValuation } from './stockDecisionValuationModel.js';

export const STOCK_DECISION_VALUATION_TTL_MS = 10 * 60 * 1000;
export const STOCK_DECISION_VALUATION_FAILURE_MS = 60 * 1000;
export const STOCK_DECISION_VALUATION_RATE_LIMIT_MS = 5 * 60 * 1000;
const MODEL_VERSION = 'earnings-valuation-v2';
const SYMBOLS = new Set(['MSFT', 'NVDA', 'META']);
const CIKS = { MSFT: '789019', NVDA: '1045810', META: '1326801' };
const normalizeSymbol = value => typeof value === 'string' && /^[A-Z][A-Z0-9.-]{0,14}$/.test(value.trim().toUpperCase().replace(/\.US$/, ''))
  ? value.trim().toUpperCase().replace(/\.US$/, '') : '';
const clone = value => structuredClone(value);

function releaseMarker(report, symbol, timestamp) {
  if (!report || !/^\d{10}-\d{2}-\d{6}$/.test(report.accession || '')) return null;
  const publishedAt = Date.parse(report.publishedAt);
  if (!Number.isFinite(publishedAt) || publishedAt > timestamp) return null;
  try {
    const url = new URL(report.sourceUrl);
    if (url.origin !== 'https://www.sec.gov' || !url.pathname.startsWith(`/Archives/edgar/data/${CIKS[symbol]}/${report.accession.replaceAll('-', '')}/`)) return null;
  } catch { return null; }
  return { publishedAt };
}

function reportMarker(report, symbol, timestamp) {
  const release = releaseMarker(report, symbol, timestamp);
  if (!release || !/^\d{4}-\d{2}-\d{2}$/.test(report.periodEnd || '')) return null;
  const end = Date.parse(`${report.periodEnd}T00:00:00Z`);
  if (!Number.isFinite(end) || new Date(end).toISOString().slice(0, 10) !== report.periodEnd || release.publishedAt < end) return null;
  return { periodEnd: report.periodEnd, publishedAt: release.publishedAt };
}

function empty(symbol, status, reason, timestamp) {
  return {
    schemaVersion: 2, modelVersion: MODEL_VERSION, symbol, currency: 'USD', status, reason,
    checkedAt: new Date(timestamp).toISOString(), verifiedAt: new Date(timestamp).toISOString().slice(0, 10),
    expiresAt: new Date(timestamp + STOCK_DECISION_VALUATION_FAILURE_MS).toISOString(),
    snapshotId: null, reportedPeriod: null, reportedAt: null, reportPeriodEnd: null,
    forecastPeriod: null, sources: [], scenarios: [],
    notes: status === 'unsupported'
      ? { zh: '此股票暂未支持自动财报估值。', en: 'Automatic earnings valuation is not supported for this stock yet.' }
      : { zh: '财报数据尚未通过更新校验，暂不提供估值情景。', en: 'The financial update has not passed validation. Valuation scenarios are unavailable.' },
  };
}

/** Cache only a validated current generation. Never serve expired forecasts. */
export function createStockDecisionValuationService({
  loadSource = fetchStockDecisionValuationSource,
  buildModel = buildStockDecisionValuation,
  now = Date.now,
  timeoutMs = 22_000,
} = {}) {
  const cache = new Map();
  const pending = new Map();
  const newestReports = new Map();
  const newestReleases = new Map();
  return async function valuation({ symbol } = {}) {
    const selected = normalizeSymbol(symbol);
    const timestamp = now();
    if (typeof timestamp !== 'number' || !Number.isFinite(new Date(timestamp).getTime())) throw new TypeError('Invalid valuation clock');
    if (!SYMBOLS.has(selected)) return empty(selected, 'unsupported', 'unsupported_symbol', timestamp);
    const cached = cache.get(selected);
    if (cached && cached.until > timestamp && cached.checkedAt <= timestamp) return clone(cached.data);
    if (pending.has(selected)) return clone(await pending.get(selected));
    const controller = new AbortController();
    let timer;
    const operation = (async () => {
      let output;
      let ttl = STOCK_DECISION_VALUATION_FAILURE_MS;
      try {
        const source = await Promise.race([
          Promise.resolve().then(() => loadSource({ symbol: selected, now: new Date(timestamp), signal: controller.signal })),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(Object.assign(new Error('Valuation source timed out'), { code: 'SOURCE_TIMEOUT' }));
            }, timeoutMs);
          }),
        ]);
        if (source?.symbol !== selected) throw new Error('Valuation identity mismatch');
        const marker = reportMarker(source.report, selected, timestamp);
        const release = releaseMarker(source.latestRelease, selected, timestamp) || marker;
        const previousRelease = newestReleases.get(selected);
        if (release && previousRelease && release.publishedAt < previousRelease.publishedAt) throw new Error('Older earnings release');
        if (release) newestReleases.set(selected, release);
        if (marker && marker.publishedAt < (newestReleases.get(selected)?.publishedAt ?? 0)) throw new Error('Latest earnings release not parsed');
        const previous = newestReports.get(selected);
        if (marker && previous && (marker.periodEnd < previous.periodEnd || marker.publishedAt < previous.publishedAt)) {
          throw new Error('Older financial report');
        }
        // Discovering a verified newer filing advances the watermark even if
        // its guidance/facts/model are still pending. Never revive the old one.
        if (marker) newestReports.set(selected, marker);
        if (source.status !== 'ready') {
          const reason = typeof source.reason === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(source.reason) ? source.reason : 'financial_update_pending';
          output = empty(selected, 'pending', reason, timestamp);
          if (/rate.?limit|429/i.test(reason)) ttl = STOCK_DECISION_VALUATION_RATE_LIMIT_MS;
        } else {
          if (!marker) throw new Error('Unverified financial report');
          const model = buildModel(source, { now: timestamp });
          if (model?.symbol !== selected || model?.schemaVersion !== 2 || model?.modelVersion !== MODEL_VERSION
            || model?.currency !== 'USD' || !['available', 'pending'].includes(model.status)) throw new Error('Invalid valuation model');
          if (model.status === 'available') {
            ttl = STOCK_DECISION_VALUATION_TTL_MS;
            const digest = createHash('sha256').update(JSON.stringify({ report: source.report, quarters: source.quarters, guidance: source.guidance, latestDilutedShares: source.latestDilutedShares })).digest('hex').slice(0, 16);
            output = {
              ...model, snapshotId: `${selected}:${source.report.accession}:${digest}:${MODEL_VERSION}`,
              checkedAt: new Date(timestamp).toISOString(), verifiedAt: new Date(timestamp).toISOString().slice(0, 10),
            };
          } else output = { ...empty(selected, 'pending', model.reason || 'model_inputs_pending', timestamp), notes: model.notes || empty(selected, 'pending', '', timestamp).notes };
        }
      } catch (error) {
        const limited = error?.status === 429 || error?.code === 'RATE_LIMITED';
        ttl = limited ? STOCK_DECISION_VALUATION_RATE_LIMIT_MS : STOCK_DECISION_VALUATION_FAILURE_MS;
        output = empty(selected, 'pending', limited ? 'rate_limited' : 'financial_update_pending', timestamp);
      } finally { clearTimeout(timer); }
      output.expiresAt = new Date(timestamp + ttl).toISOString();
      cache.set(selected, { data: clone(output), until: timestamp + ttl, checkedAt: timestamp });
      return output;
    })();
    pending.set(selected, operation);
    try { return clone(await operation); }
    finally { if (pending.get(selected) === operation) pending.delete(selected); }
  };
}

export const getStockValuation = createStockDecisionValuationService();
