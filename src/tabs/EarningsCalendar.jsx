import React from 'react';
import { ArrowDown, CalendarDays, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  buildCalendarMonth,
  buildEarningsSymbols,
  classifyEarningsResult,
  dateKey,
  earningsResultText,
  earningsSessionText,
  groupEarningsByDate,
  isEarningsPublished,
  isEarningsVisible,
  monthLabel,
  normalizeEarningsEvents,
  normalizeEarningsSession,
  shouldPromoteEarningsCalendar,
  shortDateLabel,
  todayDateKey,
} from '../lib/earningsCalendarModel.js';
import {
  bindEarningsCalendarRefresh,
  fetchEarningsCalendarEvents,
  getEarningsRefreshCandidates,
  mergeEarningsRefreshEvents,
  preservePublishedEarningsEvents,
  requestDueEarningsRefresh,
} from '../lib/earningsCalendarRefresh.js';
import { resolveEarningsReactionDisplay } from '../lib/earningsReactionDisplay.js';
import { t } from '../lib/i18n.js';
import { marketTextClass } from '../lib/marketColorMode.js';

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const EARNINGS_CALENDAR_CLIENT_CACHE_TTL_MS = 15 * 60 * 1000;
const EARNINGS_CALENDAR_CLIENT_CACHE_LIMIT = 12;
const EARNINGS_LIVE_REACTION_TICK_MS = 30 * 1000;
const earningsCalendarClientCache = new Map();

function earningsCalendarClientCacheKey({ userId, symbols, from, to, includePreviousPublished }) {
  return [
    userId || 'session',
    Array.isArray(symbols) ? symbols.join(',') : '',
    from || '',
    to || '',
    includePreviousPublished ? 'previous-published' : 'current-only',
  ].join('|');
}

function readEarningsCalendarClientCache(cacheKey) {
  const entry = earningsCalendarClientCache.get(cacheKey);
  if (!entry) return null;
  if (entry.events && entry.expiresAt > Date.now()) return entry.events;
  if (!entry.promise) earningsCalendarClientCache.delete(cacheKey);
  return null;
}

function writeEarningsCalendarClientCache(cacheKey, events, { preserveExpiry = false } = {}) {
  const current = earningsCalendarClientCache.get(cacheKey);
  earningsCalendarClientCache.delete(cacheKey);
  earningsCalendarClientCache.set(cacheKey, {
    events: Array.isArray(events) ? events : [],
    expiresAt: preserveExpiry && Number.isFinite(Number(current?.expiresAt))
      ? Number(current.expiresAt)
      : Date.now() + EARNINGS_CALENDAR_CLIENT_CACHE_TTL_MS,
  });
  while (earningsCalendarClientCache.size > EARNINGS_CALENDAR_CLIENT_CACHE_LIMIT) {
    const firstKey = earningsCalendarClientCache.keys().next().value;
    earningsCalendarClientCache.delete(firstKey);
  }
}

function getOrStartEarningsCalendarRequest(cacheKey, requestFn) {
  const entry = earningsCalendarClientCache.get(cacheKey);
  if (entry?.promise) return entry.promise;
  const promise = Promise.resolve()
    .then(requestFn)
    .then((events) => {
      writeEarningsCalendarClientCache(cacheKey, events);
      return events;
    })
    .catch((error) => {
      const latest = earningsCalendarClientCache.get(cacheKey);
      if (latest?.promise === promise) earningsCalendarClientCache.delete(cacheKey);
      throw error;
    });
  earningsCalendarClientCache.set(cacheKey, { promise, expiresAt: Date.now() + EARNINGS_CALENDAR_CLIENT_CACHE_TTL_MS });
  return promise;
}

function formatRevenueUsd(value, language = 'zh', options = {}) {
  if (value === null || value === undefined || value === '') return '--';
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  const abs = Math.abs(n);
  if (language === 'en') {
    if (abs >= 1_000_000_000) return `$${trimFixed(n / 1_000_000_000)}B`;
    if (abs >= 1_000_000) return `$${trimFixed(n / 1_000_000)}M`;
    return `$${trimFixed(n)}`;
  }
  if (options.compact) {
    if (abs >= 100_000_000) return `${trimFixed(n / 100_000_000)}亿`;
    if (abs >= 10_000_000) return `${trimFixed(n / 10_000_000)}千万`;
    if (abs >= 1_000_000) return `${trimFixed(n / 1_000_000)}百万`;
    return `${trimFixed(n)}`;
  }
  if (abs >= 100_000_000) return `${trimFixed(n / 100_000_000)}亿美元`;
  if (abs >= 10_000_000) return `${trimFixed(n / 10_000_000)}千万美元`;
  if (abs >= 1_000_000) return `${trimFixed(n / 1_000_000)}百万美元`;
  return `${trimFixed(n)}美元`;
}

function trimFixed(value, digits = 1) {
  return Number(value).toFixed(digits).replace(/\.0$/, '');
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || value === '') return '--';
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return n.toFixed(digits);
}

function formatSignedPercent(value, digits = 1) {
  if (value === null || value === undefined || value === '') return '--';
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

function signedPercentClass(value, marketColorMode) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return 'text-white/55';
  return marketTextClass(n, marketColorMode);
}

function logoUrls(symbol, cachedUrl) {
  const upper = String(symbol || '').trim().toUpperCase();
  const urls = [];
  if (cachedUrl) urls.push(cachedUrl);
  if (upper) {
    urls.push(`https://eodhd.com/img/logos/US/${upper}.png`);
    urls.push(`https://financialmodelingprep.com/image-stock/${upper}.png`);
  }
  return Array.from(new Set(urls));
}

function EarningsLogo({ symbol, urls = [], onLogoLoad, className = '' }) {
  const candidates = React.useMemo(() => urls.filter(Boolean), [urls]);
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    setIndex(0);
  }, [symbol, candidates.join('|')]);

  if (!candidates.length || index >= candidates.length) {
    return (
      <span className={`flex items-center justify-center rounded-lg bg-white/[0.08] text-[10px] font-semibold text-white/50 ${className}`}>
        {String(symbol || '?').slice(0, 2)}
      </span>
    );
  }

  return (
    <img
      src={candidates[index]}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={`bg-black/30 object-contain ${className}`}
      onLoad={(event) => {
        if (typeof onLogoLoad === 'function') onLogoLoad(symbol, event.currentTarget.src);
      }}
      onError={() => setIndex((current) => current + 1)}
    />
  );
}

function addMonths(month, delta) {
  const key = `${String(month || todayDateKey()).slice(0, 7)}-01`;
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}

function eventDisplayName(event, displayStockName, language) {
  if (typeof displayStockName === 'function') return displayStockName(event.symbol, event.name || event.symbol, language);
  return event.name || event.symbol;
}

function impactText(event, language) {
  if (event.impact === 'high') return t(language, 'earningsCalendar.impact.high', '高影响');
  if (event.impact === 'medium') return t(language, 'earningsCalendar.impact.medium', '中影响');
  return t(language, 'earningsCalendar.impact.normal', '关注');
}

function impactClass(event) {
  if (event.impact === 'high') return 'text-[#ff4b1f]';
  if (event.impact === 'medium') return 'text-[#f6b54b]';
  return 'text-white/40';
}

function DayDots({ events }) {
  const visible = events.slice(0, 4);
  return (
    <div className="mt-1 flex h-2.5 items-center justify-center gap-0.5">
      {visible.map((event, index) => (
        <EarningsResultMarker key={`${event.id}-${index}`} event={event} />
      ))}
    </div>
  );
}

function earningsResultTone(result) {
  if (result === 'beat') return 'border-[#f6b54b]/30 bg-[#f6b54b]/14 text-[#ffd18a]';
  if (result === 'miss') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300';
  if (result === 'mixed') return 'border-transparent bg-[#f6b54b]/12 text-[#f6b54b] shadow-[inset_0_0_0_1px_rgba(246,181,75,0.18)]';
  return 'border-white/[0.08] bg-white/[0.06] text-white/45';
}

function EarningsResultMarker({ event, result: explicitResult }) {
  const published = event ? isEarningsPublished(event) : Boolean(explicitResult);
  const result = explicitResult || (published ? event.earningsResult || classifyEarningsResult(event) : null);
  const dimension = 'h-2.5 w-2.5';
  const iconSize = 'h-2 w-2';

  if (!published) {
    return (
      <span className={`${dimension} inline-flex shrink-0 items-center justify-center`} aria-hidden="true">
        <span className="h-2 w-2 rounded-full bg-[#5b72ff] shadow-[0_0_10px_rgba(91,114,255,0.55)]" />
      </span>
    );
  }
  if (!result) {
    return (
      <span className={`${dimension} inline-flex shrink-0 items-center justify-center`} aria-hidden="true">
        <span className="h-2 w-2 rounded-full bg-white/25" />
      </span>
    );
  }
  if (result === 'beat') {
    return (
      <span className={`${dimension} inline-flex shrink-0 items-center justify-center rounded-full bg-[#f6b54b] text-[#111315] shadow-[0_0_10px_rgba(246,181,75,0.35)]`} aria-hidden="true">
        <Check className={iconSize} strokeWidth={3} />
      </span>
    );
  }
  if (result === 'miss') {
    return (
      <span className={`${dimension} inline-flex shrink-0 items-center justify-center rounded-full bg-emerald-400 text-[#07120d] shadow-[0_0_10px_rgba(52,211,153,0.32)]`} aria-hidden="true">
        <ArrowDown className={iconSize} strokeWidth={3} />
      </span>
    );
  }
  if (result === 'mixed') {
    return <span className={`${dimension} shrink-0 rounded-full bg-[linear-gradient(90deg,#f6b54b_0_50%,rgba(246,181,75,0.22)_50%_100%)] shadow-[0_0_10px_rgba(246,181,75,0.22)]`} aria-hidden="true" />;
  }
  return (
    <span className={`${dimension} inline-flex shrink-0 items-center justify-center rounded-full bg-white/50 text-[#0b0f14] shadow-[0_0_8px_rgba(255,255,255,0.12)]`} aria-hidden="true">
      <Check className={iconSize} strokeWidth={3} />
    </span>
  );
}

function EarningsStatusLegend({ language }) {
  const items = [
    ['unpublished', t(language, 'earningsCalendar.status.unpublished', '未公布')],
    ['beat', earningsResultText('beat', language)],
    ['miss', earningsResultText('miss', language)],
    ['mixed', earningsResultText('mixed', language)],
    ['meet', earningsResultText('meet', language)],
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-white/[0.06] bg-white/[0.025] px-2.5 py-2 text-[10px] text-white/30">
      <span>{t(language, 'earningsCalendar.legend', '图例')}</span>
      {items.map(([result, label]) => (
        <span key={result} className="inline-flex items-center gap-1">
          <EarningsResultMarker result={result === 'unpublished' ? null : result} event={result === 'unpublished' ? null : undefined} />
          <span>{label}</span>
        </span>
      ))}
    </div>
  );
}

function EarningsSessionIcon({ session }) {
  if (session === 'pre') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 overflow-visible">
        <g stroke="#f6b54b" strokeLinecap="round" strokeWidth="1.25">
          <path d="M8 1.2v1.2" />
          <path d="M8 13.6v1.2" />
          <path d="M1.2 8h1.2" />
          <path d="M13.6 8h1.2" />
          <path d="M3.2 3.2l.85.85" />
          <path d="M11.95 11.95l.85.85" />
          <path d="M12.8 3.2l-.85.85" />
          <path d="M4.05 11.95l-.85.85" />
        </g>
        <circle cx="8" cy="8" r="3.1" fill="#ffc44d" />
        <circle cx="8" cy="8" r="1.6" fill="#ffda79" opacity="0.95" />
      </svg>
    );
  }
  if (session === 'post') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 overflow-visible">
        <path
          d="M12.9 10.35A5.4 5.4 0 0 1 5.65 3.1a5.7 5.7 0 1 0 7.25 7.25Z"
          fill="#6f86ff"
        />
        <path
          d="M12.9 10.35A5.4 5.4 0 0 1 5.65 3.1a5.7 5.7 0 1 0 7.25 7.25Z"
          fill="#8fa1ff"
          opacity="0.3"
        />
      </svg>
    );
  }
  return <span className="h-2 w-2 shrink-0 rounded-full bg-white/30" aria-hidden="true" />;
}

function earningsSessionTone(session) {
  if (session === 'pre') return 'text-[#f6b54b]';
  if (session === 'post') return 'text-[#6f86ff]';
  return 'text-white/40';
}

function revenueValue(event, key) {
  if (key === 'actual') return event.revenueActualUsd ?? (event.revenueActualOriginalCurrency === 'USD' ? event.revenueActual : null);
  return event.revenueEstimateUsd ?? (event.currency === 'USD' ? event.revenueEstimate : null);
}

function ebitValue(event) {
  return event.ebitActualUsd ?? (event.ebitActualOriginalCurrency === 'USD' ? event.ebitActual : null);
}

function earningsCurrencySummary(event, language) {
  const epsCurrency = String(event?.epsUnit || event?.epsCurrency || event?.currency || 'USD').trim().toUpperCase() || 'USD';
  return t(
    language,
    'earningsCalendar.metricCurrencies',
    language === 'en' ? 'EPS: {{epsCurrency}} · Revenue/EBIT: USD' : 'EPS：{{epsCurrency}} · 营收/EBIT：USD',
    { epsCurrency },
  );
}

function reactionLabel(reaction, language) {
  if (reaction?.mode === 'live-pre') return t(language, 'earningsCalendar.preLive', '盘前实时');
  return t(language, 'earningsCalendar.closeReaction', '收盘反应');
}

function reactionStatusText(reaction, language) {
  if (reaction?.mode === 'live-pre') return t(language, 'earningsCalendar.realtimeQuote', 'WebSocket 实时行情');
  if (reaction?.locked) return t(language, 'earningsCalendar.officialCloseLocked', '正式收盘锁定');
  return t(language, 'earningsCalendar.awaitingOfficialClose', '等待收盘数据');
}

function metricResultFromSurprise(value, actualValue = null, estimateValue = null) {
  const explicit = value === null || value === undefined || value === '' ? null : Number(value);
  const actual = actualValue === null || actualValue === undefined || actualValue === '' ? null : Number(actualValue);
  const estimate = estimateValue === null || estimateValue === undefined || estimateValue === '' ? null : Number(estimateValue);
  const calculated = Number.isFinite(actual) && Number.isFinite(estimate) && estimate !== 0
    ? ((actual - estimate) / Math.abs(estimate)) * 100
    : null;
  const n = Number.isFinite(explicit) ? explicit : calculated;
  if (!Number.isFinite(n)) return null;
  if (n > 1) return 'beat';
  if (n < -1) return 'miss';
  return 'meet';
}

function metricResultTone(result, marketColorMode) {
  if (result === 'beat') return marketTextClass(1, marketColorMode);
  if (result === 'miss') return marketTextClass(-1, marketColorMode);
  return 'text-white/40';
}

function buildPublishedFinancialRows(event, language) {
  const rows = [];
  const revenueActual = revenueValue(event, 'actual');
  const revenueEstimate = revenueValue(event, 'estimate');
  if (revenueActual !== null && revenueActual !== undefined && revenueEstimate !== null && revenueEstimate !== undefined) {
    rows.push({
      key: 'revenue',
      label: t(language, 'earningsCalendar.revenueMetric', '营业收入'),
      comparable: true,
      result: metricResultFromSurprise(event.revenueSurprisePercent, revenueActual, revenueEstimate),
      actual: formatRevenueUsd(revenueActual, language, { compact: true }),
      actualYoy: event.revenueActualYoyPercent,
      estimate: formatRevenueUsd(revenueEstimate, language, { compact: true }),
      estimateYoy: event.revenueEstimateYoyPercent,
    });
  }
  const ebitActual = ebitValue(event);
  if (ebitActual !== null && ebitActual !== undefined) {
    rows.push({
      key: 'ebit',
      label: t(language, 'earningsCalendar.ebitMetric', '息税前利润'),
      comparable: false,
      result: null,
      actual: formatRevenueUsd(ebitActual, language, { compact: true }),
      actualYoy: event.ebitActualYoyPercent,
      estimate: '—',
      estimateYoy: null,
      estimateUnavailable: true,
    });
  }
  if (event.epsActual !== null && event.epsActual !== undefined && event.epsEstimate !== null && event.epsEstimate !== undefined) {
    rows.push({
      key: 'eps',
      label: t(language, 'earningsCalendar.epsMetric', '每股收益'),
      comparable: true,
      result: metricResultFromSurprise(event.surprisePercent, event.epsActual, event.epsEstimate),
      actual: formatNumber(event.epsActual),
      actualYoy: event.epsActualYoyPercent,
      estimate: formatNumber(event.epsEstimate),
      estimateYoy: event.epsEstimateYoyPercent,
    });
  }
  return rows;
}

function financialOverviewText(event, name, language) {
  const rows = buildPublishedFinancialRows(event, language);
  if (!rows.length) return resultConclusion(event, language);
  const company = `${name || event.symbol} (${event.symbol})`;
  if (language === 'en') {
    const parts = rows.map((row) => `${row.label} was ${row.actual} (${formatSignedPercent(row.actualYoy)})`);
    return `Overview: ${company} ${parts.join('; ')}.`;
  }
  const parts = rows.map((row) => `${row.label}是 ${row.actual} (${formatSignedPercent(row.actualYoy)})`);
  return `概览: ${company} 的${parts.join('; ')}, ${earningsResultText(event.earningsResult || classifyEarningsResult(event), language)}。`;
}

function availableResultText(event, result, language) {
  const rows = buildPublishedFinancialRows(event, language).filter((row) => row.comparable);
  if (rows.length !== 1) return earningsResultText(result, language);
  const prefix = rows[0].key === 'eps'
    ? 'EPS'
    : t(language, 'earningsCalendar.revenue', '营收');
  return language === 'en'
    ? `${prefix} ${earningsResultText(result, language)}`
    : `${prefix}${earningsResultText(result, language)}`;
}

function resultConclusion(event, language) {
  const result = event.earningsResult || classifyEarningsResult(event);
  const rows = buildPublishedFinancialRows(event, language).filter((row) => row.comparable);
  if (!rows.length) {
    return language === 'en'
      ? 'Reported actuals are not complete enough for a full comparison yet.'
      : '真实公布值尚不完整,暂不做完整比较。';
  }
  if (!result) {
    return language === 'en'
      ? 'The available reported values are not complete enough for a reliable expectation comparison.'
      : '现有真实公布值不足以可靠判断是否达到预期。';
  }
  if (rows.length === 1) {
    const metric = rows[0].key === 'eps' ? 'EPS' : (language === 'en' ? 'Revenue' : '营收');
    if (language === 'en') {
      if (result === 'beat') return `${metric} was above expectations. The other reported metric is still unavailable.`;
      if (result === 'miss') return `${metric} was below expectations. The other reported metric is still unavailable.`;
      return `${metric} was close to expectations. The other reported metric is still unavailable.`;
    }
    if (result === 'beat') return `${metric}高于预期,另一项真实公布值尚未同步。`;
    if (result === 'miss') return `${metric}低于预期,另一项真实公布值尚未同步。`;
    return `${metric}接近预期,另一项真实公布值尚未同步。`;
  }
  if (language === 'en') {
    if (result === 'beat') return 'EPS and revenue were above expectations. Short-term sentiment improved.';
    if (result === 'miss') return 'EPS and revenue were below expectations. Market pressure may continue.';
    if (result === 'mixed') return 'EPS and revenue signals were split. Watch follow-up guidance.';
    return 'Results were close to expectations. Market reaction may depend on guidance.';
  }
  if (result === 'beat') return 'EPS 和营收均高于预期,短线情绪偏强。';
  if (result === 'miss') return 'EPS 和营收均低于预期,市场反应可能承压。';
  if (result === 'mixed') return 'EPS 和营收信号不一致,重点看后续指引。';
  return '实际结果接近预期,市场反应更多取决于公司指引。';
}

function PublishedBadge({ language }) {
  return (
    <span className="rounded-full border border-white/[0.06] bg-white/[0.08] px-2 py-0.5 text-[10px] text-[#ffd18a]">
      {t(language, 'earningsCalendar.published', '已公布')}
    </span>
  );
}

function PublishedFinancialComparison({ event, language, marketColorMode }) {
  const rows = buildPublishedFinancialRows(event, language);
  if (!rows.length) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.025]">
      <div className="grid grid-cols-[minmax(82px,1fr)_92px_92px] items-center border-b border-white/[0.06] px-3 py-2 text-[10px] leading-4 text-white/35">
        <span>{t(language, 'earningsCalendar.metric', '指标')}</span>
        <span className="text-right">{t(language, 'earningsCalendar.actualValue', '公布值')}<br />{t(language, 'earningsCalendar.yoy', '同比')}</span>
        <span className="text-right">{t(language, 'earningsCalendar.forecastValue', '预测值')}<br />{t(language, 'earningsCalendar.yoy', '同比')}</span>
      </div>
      {rows.map((row) => {
        const result = row.result;
        return (
          <div key={row.key} className="grid grid-cols-[minmax(82px,1fr)_92px_92px] items-center px-3 py-3">
            <div className="min-w-0">
              <div className="truncate text-[12px] font-normal text-white/70">{row.label}</div>
              {row.comparable && result ? <div className={`mt-1 text-[10px] ${metricResultTone(result, marketColorMode)}`}>{earningsResultText(result, language)}</div> : null}
            </div>
            <div className="min-w-0 text-right">
              <div className="truncate text-[15px] leading-none text-white/70 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{row.actual}</div>
              <div className={`mt-1.5 text-[11px] leading-none tabular-nums ${signedPercentClass(row.actualYoy, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>{formatSignedPercent(row.actualYoy)}</div>
            </div>
            <div className="min-w-0 text-right">
              <div className="truncate text-[15px] leading-none text-white/60 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{row.estimate}</div>
              <div className={`mt-1.5 text-[11px] leading-none tabular-nums ${signedPercentClass(row.estimateYoy, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>{row.estimateUnavailable ? '—' : formatSignedPercent(row.estimateYoy)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MetricStack({ label, actual, actualPercent, estimate, estimatePercent, language, marketColorMode, resultMarker = null }) {
  return (
    <div className="min-w-0 text-left">
      <div className="text-[10px] leading-none text-white/35">{label}</div>
      <div className="mt-1.5 flex min-w-0 items-center gap-1">
        <span className="truncate text-[12px] leading-none text-white/70 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{actual}</span>
        {resultMarker}
      </div>
      <div className={`mt-1 text-[10px] leading-none tabular-nums ${signedPercentClass(actualPercent, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>{formatSignedPercent(actualPercent)}</div>
      <div className="mt-1.5 truncate text-[10px] leading-none text-white/30 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{t(language, 'earningsCalendar.forecastShort', '预期')} {estimate}</div>
      <div className={`mt-1 text-[10px] leading-none tabular-nums ${signedPercentClass(estimatePercent, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>{formatSignedPercent(estimatePercent)}</div>
    </div>
  );
}

function PublishedEarningsEventRow({
  event,
  quote,
  now,
  stockFreshnessStartedAt,
  logoCache,
  cacheStockLogo,
  displayStockName,
  language,
  marketColorMode,
  onOpenDetail,
}) {
  const name = eventDisplayName(event, displayStockName, language);
  const cachedLogoUrl = logoCache?.[event.symbol]?.url;
  const result = event.earningsResult || classifyEarningsResult(event);
  const epsMetricResult = metricResultFromSurprise(event.surprisePercent, event.epsActual, event.epsEstimate);
  const reaction = resolveEarningsReactionDisplay({
    event,
    quote,
    now,
    freshnessStartedAt: stockFreshnessStartedAt,
  });
  return (
    <button
      type="button"
      onClick={() => onOpenDetail?.(event)}
      data-earnings-published-event={event.symbol}
      className="min-h-[118px] w-full rounded-xl border border-white/[0.07] bg-white/[0.035] px-3.5 py-4 text-left active:scale-[0.99]"
    >
      <div className="mb-3 flex items-center justify-between gap-2 text-[11px] text-white/50">
        <div className="flex min-w-0 items-center gap-2">
          <span>{shortDateLabel(event.reportDate)}</span>
          <span className={`inline-flex items-center gap-1 font-normal ${earningsSessionTone(event.session)}`}>
            <EarningsSessionIcon session={event.session} />
            <span>{earningsSessionText(event.session, language)}</span>
          </span>
          <PublishedBadge language={language} />
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${earningsResultTone(result)}`}>
          {availableResultText(event, result, language)}
        </span>
      </div>
      <div className="grid grid-cols-[minmax(72px,1fr)_52px_76px_48px] items-start gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <EarningsLogo symbol={event.symbol} urls={logoUrls(event.symbol, cachedLogoUrl)} onLogoLoad={cacheStockLogo} className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-normal text-white/70">{event.symbol}</div>
            <div className="truncate text-[10px] text-white/40">{name}</div>
          </div>
        </div>
        <MetricStack
          label={t(language, 'earningsCalendar.epsActual', '实际EPS')}
          actual={formatNumber(event.epsActual)}
          actualPercent={event.epsActualYoyPercent}
          estimate={formatNumber(event.epsEstimate)}
          estimatePercent={event.epsEstimateYoyPercent}
          language={language}
          marketColorMode={marketColorMode}
          resultMarker={epsMetricResult ? <EarningsResultMarker result={epsMetricResult} /> : null}
        />
        <MetricStack
          label={t(language, 'earningsCalendar.revenueActual', '实际营收')}
          actual={formatRevenueUsd(revenueValue(event, 'actual'), language, { compact: true })}
          actualPercent={event.revenueActualYoyPercent}
          estimate={formatRevenueUsd(revenueValue(event, 'estimate'), language, { compact: true })}
          estimatePercent={event.revenueEstimateYoyPercent}
          language={language}
          marketColorMode={marketColorMode}
        />
        <div className="min-w-0 text-right">
          <div className="text-[10px] leading-none text-white/35">{reactionLabel(reaction, language)}</div>
          <div className={`mt-1.5 text-[12px] leading-none tabular-nums ${signedPercentClass(reaction.percent, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>{formatSignedPercent(reaction.percent)}</div>
        </div>
      </div>
    </button>
  );
}

function UpcomingEarningsEventRow({ event, logoCache, cacheStockLogo, displayStockName, language }) {
  const name = eventDisplayName(event, displayStockName, language);
  const cachedLogoUrl = logoCache?.[event.symbol]?.url;
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] text-white/50">
        <span>{shortDateLabel(event.reportDate)}</span>
        <span className={`inline-flex items-center gap-1 font-normal ${earningsSessionTone(event.session)}`}>
          <EarningsSessionIcon session={event.session} />
          <span>{earningsSessionText(event.session, language)}</span>
        </span>
      </div>
      <div className="grid grid-cols-[minmax(64px,0.82fr)_64px_104px_40px] items-center gap-1.5">
        <div className="flex min-w-0 items-center gap-1">
          <EarningsLogo symbol={event.symbol} urls={logoUrls(event.symbol, cachedLogoUrl)} onLogoLoad={cacheStockLogo} className="h-7 w-7 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-normal text-white/70">{event.symbol}</div>
            <div className="truncate text-[9px] text-white/40">{name}</div>
          </div>
        </div>
        <div className="text-left">
          <div className="text-[11px] text-white/35">{t(language, 'earningsCalendar.epsEstimate', '预计EPS')}</div>
          <div className="mt-0.5 text-[13px] text-white/70 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{formatNumber(event.epsEstimate)}</div>
        </div>
        <div className="text-left">
          <div className="text-[11px] text-white/35">{t(language, 'earningsCalendar.revenueEstimate', '预计营收')}</div>
          <div className="mt-0.5 whitespace-nowrap text-[12px] text-white/70 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{formatRevenueUsd(revenueValue(event, 'estimate'), language, { compact: true })}</div>
        </div>
        <div className={`text-right text-[11px] font-normal ${impactClass(event)}`}>
          {impactText(event, language)}
        </div>
      </div>
    </div>
  );
}

function EarningsEventRow(props) {
  if (isEarningsPublished(props.event)) return <PublishedEarningsEventRow {...props} />;
  return <UpcomingEarningsEventRow {...props} />;
}

function PublishedEarningsDetail({
  event,
  quote,
  now,
  stockFreshnessStartedAt,
  logoCache,
  cacheStockLogo,
  displayStockName,
  language,
  marketColorMode,
  onClose,
}) {
  const name = eventDisplayName(event, displayStockName, language);
  const cachedLogoUrl = logoCache?.[event.symbol]?.url;
  const result = event.earningsResult || classifyEarningsResult(event);
  const reaction = resolveEarningsReactionDisplay({
    event,
    quote,
    now,
    freshnessStartedAt: stockFreshnessStartedAt,
  });
  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]" onClick={(clickEvent) => { if (clickEvent.target === clickEvent.currentTarget) onClose(); }}>
      <div className="w-full max-w-[382px] rounded-[18px] border border-white/10 bg-[#0c1117] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.72)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <EarningsLogo symbol={event.symbol} urls={logoUrls(event.symbol, cachedLogoUrl)} onLogoLoad={cacheStockLogo} className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="min-w-0">
              <div className="truncate text-[16px] font-normal text-white/70">{event.symbol} <span className="text-[12px] text-white/40">{name}</span></div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/40">
                <span>{event.reportDate}</span>
                <span>{earningsSessionText(event.session, language)}</span>
                <PublishedBadge language={language} />
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/40 active:scale-95">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <div className="flex items-center justify-between gap-3 text-[10px] text-white/35">
            <span>{earningsCurrencySummary(event, language)}</span>
            <span>{t(language, 'earningsCalendar.fiscalDate', '财报期')} {event.fiscalDate || event.reportDate}</span>
          </div>
          <div className="mt-2 text-[12px] leading-5 text-white/60">{financialOverviewText(event, name, language)}</div>
        </div>
        <PublishedFinancialComparison event={event} language={language} marketColorMode={marketColorMode} />
        <div className="mt-3 flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-3">
          <div>
            <div className="text-[10px] text-white/35">{reactionLabel(reaction, language)}</div>
            <div className="mt-1 text-[10px] text-white/30">{reactionStatusText(reaction, language)}</div>
          </div>
          <div className="text-right">
            <div className={`text-[15px] leading-none tabular-nums ${signedPercentClass(reaction.percent, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>{formatSignedPercent(reaction.percent)}</div>
            <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] ${earningsResultTone(result)}`}>{availableResultText(event, result, language)}</span>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-[11px] text-white/40">{t(language, 'earningsCalendar.conclusion', '结论')}</div>
          <div className="mt-1 text-[12px] leading-5 text-white/60">{resultConclusion(event, language)}</div>
        </div>
      </div>
    </div>
  );
}

function EarningsModal({
  open,
  onClose,
  events,
  quoteBySymbol,
  now,
  stockFreshnessStartedAt,
  selectedDate,
  setSelectedDate,
  view,
  setView,
  logoCache,
  cacheStockLogo,
  displayStockName,
  language,
  marketColorMode,
  loading,
}) {
  const [visibleMonth, setVisibleMonth] = React.useState(() => (selectedDate || todayDateKey()).slice(0, 7));
  const [detailEvent, setDetailEvent] = React.useState(null);
  const grouped = React.useMemo(() => groupEarningsByDate(events), [events]);
  const monthDays = React.useMemo(() => buildCalendarMonth(`${visibleMonth}-01`, events), [visibleMonth, events]);
  const selectedEvents = grouped.get(selectedDate) || [];
  const eventDates = React.useMemo(() => Array.from(grouped.keys()).sort(), [grouped]);
  const listEvents = React.useMemo(() => {
    const today = todayDateKey();
    return events.filter((event) => isEarningsVisible(event, today)).slice(0, 80);
  }, [events]);

  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  React.useEffect(() => {
    if (selectedDate) setVisibleMonth(selectedDate.slice(0, 7));
  }, [selectedDate]);

  React.useEffect(() => {
    if (!open) setDetailEvent(null);
  }, [open]);

  React.useEffect(() => {
    setDetailEvent((current) => {
      if (!current) return current;
      const updated = events.find((event) => event.id === current.id)
        || events.find((event) => event.symbol === current.symbol && event.reportDate === current.reportDate);
      return updated || current;
    });
  }, [events]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/72 px-3 py-[calc(env(safe-area-inset-top)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-[3px]" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex h-[86dvh] max-h-[760px] w-full max-w-[410px] flex-col rounded-[22px] border border-white/10 bg-[#0b0f14] p-4 shadow-[0_24px_72px_rgba(0,0,0,0.68),inset_0_1px_0_rgba(255,255,255,0.06)]" style={{ fontFamily: FONT }}>
        <div className="flex shrink-0 items-center justify-between">
          <div className="text-[14px] font-bold leading-none text-white/70">
            {t(language, 'earningsCalendar.title', '财报日历')}
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/40 active:scale-95">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid shrink-0 grid-cols-2 rounded-lg border border-white/[0.06] bg-white/[0.045] p-1">
          {[
            ['calendar', t(language, 'earningsCalendar.calendarView', '日历视图')],
            ['list', t(language, 'earningsCalendar.listView', '列表视图')],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`h-8 rounded-md text-[13px] font-normal active:scale-[0.99] ${view === key ? 'bg-[#f6b54b]/16 text-[#f6b54b]' : 'text-white/45'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'calendar' ? (
          <div className="mt-4 flex min-h-0 flex-1 flex-col" data-earnings-calendar-view="fixed-calendar">
            <div className="shrink-0">
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))} className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 active:scale-95">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="text-[15px] font-normal text-white/65">{monthLabel(`${visibleMonth}-01`, language)}</div>
                <button type="button" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))} className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 active:scale-95">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-2 grid grid-cols-7 border-b border-white/[0.06] pb-2 text-center text-[11px] text-white/40">
                {(language === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['日', '一', '二', '三', '四', '五', '六']).map((item) => <span key={item}>{item}</span>)}
              </div>
              <div className="mt-1 grid grid-cols-7 grid-rows-6 gap-y-1 text-center">
                {monthDays.map((day) => {
                  const active = selectedDate === day.key;
                  const hasEvents = day.events.length > 0;
                  return (
                    <button
                      key={day.key}
                      type="button"
                      onClick={() => {
                        setSelectedDate(day.key);
                        setVisibleMonth(day.key.slice(0, 7));
                      }}
                      className={`mx-auto flex h-11 w-11 flex-col items-center justify-center rounded-xl text-[14px] font-normal active:scale-95 ${
                        active
                          ? 'border border-[#f6b54b]/65 bg-[#f6b54b]/12 text-[#ffd18a]'
                          : day.inMonth ? 'text-white/65' : 'text-white/20'
                      }`}
                    >
                      <span>{day.day}</span>
                      {hasEvents ? <DayDots events={day.events} /> : <span className="mt-1 h-1.5" />}
                    </button>
                  );
                })}
              </div>
              <EarningsStatusLegend language={language} />
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5" data-earnings-calendar-selected-list>
              <div className="space-y-2">
                <div className="text-[12px] text-white/40">
                  {selectedDate ? `${selectedDate} · ${selectedEvents.length || 0} ${t(language, 'earningsCalendar.eventsUnit', '项')}` : t(language, 'earningsCalendar.noDateSelected', '选择日期查看财报')}
                </div>
                {selectedEvents.length === 0 ? (
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-5 text-center text-[13px] text-white/35">
                    {loading ? t(language, 'earningsCalendar.loading', '正在读取财报日历') : t(language, 'earningsCalendar.noEventsOnDate', '当天没有关注股票财报')}
                  </div>
                ) : selectedEvents.map((event) => (
                  <EarningsEventRow
                    key={event.id}
                    event={event}
                    quote={quoteBySymbol?.get(event.symbol) || null}
                    now={now}
                    stockFreshnessStartedAt={stockFreshnessStartedAt}
                    logoCache={logoCache}
                    cacheStockLogo={cacheStockLogo}
                    displayStockName={displayStockName}
                    language={language}
                    marketColorMode={marketColorMode}
                    onOpenDetail={setDetailEvent}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
            <div className="space-y-2">
              {listEvents.length === 0 ? (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-8 text-center text-[13px] text-white/35">
                  {loading ? t(language, 'earningsCalendar.loading', '正在读取财报日历') : t(language, 'earningsCalendar.noEvents', '暂无关注股票财报')}
                </div>
              ) : listEvents.map((event) => (
                <EarningsEventRow
                  key={event.id}
                  event={event}
                  quote={quoteBySymbol?.get(event.symbol) || null}
                  now={now}
                  stockFreshnessStartedAt={stockFreshnessStartedAt}
                  logoCache={logoCache}
                  cacheStockLogo={cacheStockLogo}
                  displayStockName={displayStockName}
                  language={language}
                  marketColorMode={marketColorMode}
                  onOpenDetail={setDetailEvent}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 shrink-0 text-[10px] leading-4 text-white/30">
          {t(language, 'earningsCalendar.disclaimer', '财报时间为预计时间,实际可能因公司公告调整,请以官方发布为准。')}
        </div>
      </div>
      {detailEvent ? (
        <PublishedEarningsDetail
          event={detailEvent}
          quote={quoteBySymbol?.get(detailEvent.symbol) || null}
          now={now}
          stockFreshnessStartedAt={stockFreshnessStartedAt}
          logoCache={logoCache}
          cacheStockLogo={cacheStockLogo}
          displayStockName={displayStockName}
          language={language}
          marketColorMode={marketColorMode}
          onClose={() => setDetailEvent(null)}
        />
      ) : null}
    </div>
  );
}

export default function EarningsCalendar({
  watchlist = [],
  positions = [],
  quoteRows = [],
  stockFreshnessStartedAt = 0,
  logoCache,
  cacheStockLogo,
  displayStockName,
  language = 'zh',
  marketColorMode,
  supabase,
  eventsOverride = null,
  requestEventsOverride = null,
  now = Date.now,
  onPromotionChange,
  placementClassName = '',
}) {
  const symbols = React.useMemo(() => buildEarningsSymbols({ watchlist, positions }), [watchlist, positions]);
  const quoteBySymbol = React.useMemo(() => new Map(
    (Array.isArray(quoteRows) ? quoteRows : [])
      .map((quote) => [String(quote?.symbol || '').trim().toUpperCase(), quote])
      .filter(([symbol]) => symbol),
  ), [quoteRows]);
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalView, setModalView] = React.useState('list');
  const [selectedDate, setSelectedDate] = React.useState(todayDateKey());
  const [, forceLiveReactionClockRender] = React.useState(0);
  const modalOpenRef = React.useRef(false);
  const userSelectedDateRef = React.useRef(false);
  const eventsRef = React.useRef([]);
  const activeCacheKeyRef = React.useRef('');
  const refreshReadyRef = React.useRef(false);
  const refreshBindingRef = React.useRef(null);
  const refreshEligibilityRef = React.useRef(() => false);
  const forceRefreshHandlerRef = React.useRef(null);
  const checkedCacheKeysRef = React.useRef(new Set());
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    modalOpenRef.current = modalOpen;
    if (!modalOpen) userSelectedDateRef.current = false;
  }, [modalOpen]);

  const needsLiveReactionClock = React.useMemo(() => modalOpen && events.some((event) => {
    if (!isEarningsPublished(event) || normalizeEarningsSession(event?.session) !== 'pre') return false;
    const officialReaction = event?.marketReactionPercent;
    return officialReaction === null
      || officialReaction === undefined
      || String(officialReaction).trim() === ''
      || !Number.isFinite(Number(officialReaction));
  }), [events, modalOpen]);

  React.useEffect(() => {
    if (!needsLiveReactionClock) return undefined;
    const timerId = globalThis.setInterval(() => {
      forceLiveReactionClockRender((current) => current + 1);
    }, EARNINGS_LIVE_REACTION_TICK_MS);
    return () => globalThis.clearInterval(timerId);
  }, [needsLiveReactionClock]);

  const setDefaultSelectedDate = React.useCallback((normalized) => {
    const today = todayDateKey();
    const first = normalized.find((item) => isEarningsVisible(item, today)) || normalized[0];
    if (!first) return;
    setSelectedDate((current) => {
      if (modalOpenRef.current && userSelectedDateRef.current && current) return current;
      return first.reportDate;
    });
  }, []);

  const setUserSelectedDate = React.useCallback((date) => {
    userSelectedDateRef.current = true;
    setSelectedDate(date || todayDateKey());
  }, []);

  const commitEvents = React.useCallback((incoming, { cacheKey = '', merge = false, preserveCacheExpiry = false } = {}) => {
    const next = merge
      ? mergeEarningsRefreshEvents(eventsRef.current, incoming)
      : preservePublishedEarningsEvents(eventsRef.current, incoming);
    eventsRef.current = next;
    refreshReadyRef.current = Boolean(cacheKey || activeCacheKeyRef.current);
    setEvents(next);
    if (cacheKey) writeEarningsCalendarClientCache(cacheKey, next, { preserveExpiry: preserveCacheExpiry });
    setDefaultSelectedDate(next);
    return next;
  }, [setDefaultSelectedDate]);

  React.useEffect(() => {
    let cancelled = false;
    if (Array.isArray(eventsOverride)) {
      const normalized = normalizeEarningsEvents(eventsOverride, { watchlist, positions });
      eventsRef.current = normalized;
      activeCacheKeyRef.current = '';
      refreshReadyRef.current = false;
      setEvents(normalized);
      setError('');
      setLoading(false);
      setDefaultSelectedDate(normalized);
      return () => { cancelled = true; };
    }

    if (!symbols.length || !supabase?.auth?.getSession) {
      eventsRef.current = [];
      activeCacheKeyRef.current = '';
      refreshReadyRef.current = false;
      setEvents([]);
      setError('');
      setLoading(false);
      return () => { cancelled = true; };
    }

    const from = new Date();
    from.setDate(from.getDate() - 7);
    const to = new Date();
    to.setDate(to.getDate() + 45);
    const fromKey = from.toISOString().slice(0, 10);
    const toKey = to.toISOString().slice(0, 10);
    const includePreviousPublished = true;
    activeCacheKeyRef.current = '';
    refreshReadyRef.current = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        const token = data?.session?.access_token;
        if (!token) throw new Error(t(language, 'earningsCalendar.authRequired', '请先登录后查看财报日历'));
        const cacheKey = earningsCalendarClientCacheKey({
          userId: data?.session?.user?.id,
          symbols,
          from: fromKey,
          to: toKey,
          includePreviousPublished,
        });
        activeCacheKeyRef.current = cacheKey;
        const cachedEvents = readEarningsCalendarClientCache(cacheKey);
        if (cachedEvents) {
          if (cancelled) return;
          const normalized = normalizeEarningsEvents(cachedEvents, { watchlist, positions });
          commitEvents(normalized);
          if (!checkedCacheKeysRef.current.has(cacheKey)) {
            checkedCacheKeysRef.current.add(cacheKey);
            refreshBindingRef.current?.request('cached-events');
          }
          return;
        }
        const rawEvents = await getOrStartEarningsCalendarRequest(cacheKey, async () => {
          const requestEvents = typeof requestEventsOverride === 'function'
            ? requestEventsOverride
            : fetchEarningsCalendarEvents;
          return requestEvents({
            token,
            symbols,
            from: fromKey,
            to: toKey,
            includePreviousPublished,
            forceRefresh: false,
          });
        });
        if (cancelled) return;
        const normalized = normalizeEarningsEvents(rawEvents, { watchlist, positions });
        checkedCacheKeysRef.current.add(cacheKey);
        commitEvents(normalized, { cacheKey });
      } catch (fetchError) {
        if (!cancelled) {
          eventsRef.current = [];
          refreshReadyRef.current = false;
          setEvents([]);
          setError(fetchError?.message || t(language, 'earningsCalendar.loadFailed', '财报日历读取失败'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [symbols.join(','), supabase, language, watchlist, positions, eventsOverride, requestEventsOverride, commitEvents, setDefaultSelectedDate]);

  const forceRefreshDueEarnings = React.useCallback(async () => {
    if (Array.isArray(eventsOverride) || !activeCacheKeyRef.current || !supabase?.auth?.getSession) return;
    const requestedCacheKey = activeCacheKeyRef.current;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token || activeCacheKeyRef.current !== requestedCacheKey) return;
      const requestEvents = typeof requestEventsOverride === 'function'
        ? requestEventsOverride
        : fetchEarningsCalendarEvents;
      const result = await requestDueEarningsRefresh({
        baseCacheKey: requestedCacheKey,
        events: eventsRef.current,
        token,
        now,
        requestFn: requestEvents,
      });
      if (!mountedRef.current || !result.requested || activeCacheKeyRef.current !== requestedCacheKey) return;
      const normalized = normalizeEarningsEvents(result.events, { watchlist, positions });
      commitEvents(normalized, {
        cacheKey: requestedCacheKey,
        merge: true,
        preserveCacheExpiry: true,
      });
    } catch {
      // Background refreshes keep the last real calendar instead of replacing it with an error state.
    }
  }, [commitEvents, eventsOverride, now, positions, requestEventsOverride, supabase, watchlist]);

  forceRefreshHandlerRef.current = forceRefreshDueEarnings;
  refreshEligibilityRef.current = () => !Array.isArray(eventsOverride)
    && refreshReadyRef.current
    && Boolean(activeCacheKeyRef.current)
    && getEarningsRefreshCandidates(eventsRef.current, now).length > 0;

  React.useEffect(() => {
    const binding = bindEarningsCalendarRefresh({
      shouldRefresh: () => refreshEligibilityRef.current(),
      onVisibleRefresh: (trigger) => forceRefreshHandlerRef.current?.(trigger),
      now,
    });
    refreshBindingRef.current = binding;
    if (refreshEligibilityRef.current()) binding.request('initial-due');
    return () => {
      if (refreshBindingRef.current === binding) refreshBindingRef.current = null;
      binding.cleanup();
    };
  }, [now]);

  const displayEvents = React.useMemo(() => {
    const today = todayDateKey();
    return events.filter((event) => isEarningsVisible(event, today));
  }, [events]);
  const previewEvents = displayEvents.slice(0, 5);
  const shouldPromote = React.useMemo(() => shouldPromoteEarningsCalendar({
    events,
    watchlist,
    positions,
  }), [events, watchlist, positions]);

  React.useEffect(() => {
    if (loading || typeof onPromotionChange !== 'function') return;
    onPromotionChange(shouldPromote);
  }, [loading, onPromotionChange, shouldPromote]);

  const openModal = (view = 'list', date = null) => {
    if (date) {
      userSelectedDateRef.current = true;
      setSelectedDate(date);
    } else {
      userSelectedDateRef.current = false;
      setSelectedDate(selectedDate || todayDateKey());
    }
    setModalView(view);
    setModalOpen(true);
    refreshBindingRef.current?.request('modal-open');
  };

  return (
    <section
      id="earnings-calendar"
      className={`mt-3 rounded-2xl border border-white/10 bg-[#0b0f14] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${placementClassName}`}
      data-home-earnings-placement={shouldPromote ? 'promoted' : 'default'}
      style={{ fontFamily: FONT }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[14px] font-bold leading-none text-white/70">
          {t(language, 'earningsCalendar.title', '财报日历')}
        </div>
        <button
          type="button"
          onClick={() => openModal('list')}
          className="flex items-center gap-1 text-[13px] font-normal text-[#f6b54b] active:scale-95"
        >
          {t(language, 'earningsCalendar.all', '全部')}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div
        className="grid min-h-[88px] items-stretch overflow-hidden"
        style={{ gridTemplateColumns: previewEvents.length > 0 ? `repeat(${previewEvents.length}, minmax(0, 1fr)) 42px` : '1fr' }}
      >
        {previewEvents.length === 0 ? (
          <div className="flex min-h-[88px] flex-1 items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-white/[0.025] px-4 text-center text-[12px] text-white/35">
            {loading ? t(language, 'earningsCalendar.loading', '正在读取财报日历') : error || t(language, 'earningsCalendar.noEvents', '暂无关注股票财报')}
          </div>
        ) : (
          previewEvents.map((event, index) => {
            const cachedLogoUrl = logoCache?.[event.symbol]?.url;
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => openModal('list', event.reportDate)}
                className={`flex min-w-0 flex-col items-center justify-center rounded-xl px-1 py-1.5 active:scale-[0.98] ${
                  index < previewEvents.length - 1 ? 'border-r border-white/[0.08]' : ''
                }`}
              >
                <div className="text-[12px] leading-none tabular-nums text-white/35">{shortDateLabel(event.reportDate)}</div>
                <EarningsLogo symbol={event.symbol} urls={logoUrls(event.symbol, cachedLogoUrl)} onLogoLoad={cacheStockLogo} className="mt-2 h-7 w-7 rounded-md" />
                <div className="mt-1.5 max-w-full truncate text-[11px] leading-none font-normal text-white/70">{event.symbol}</div>
                <span className="mt-1.5 inline-flex h-3.5 items-center justify-center">
                  <EarningsResultMarker event={event} />
                </span>
              </button>
            );
          })
        )}
        {previewEvents.length > 0 && (
          <button
            type="button"
            onClick={() => openModal('calendar')}
            className="ml-2 flex min-w-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-white/40 active:scale-[0.98]"
            aria-label={t(language, 'earningsCalendar.calendarView', '日历视图')}
          >
            <CalendarDays className="h-5 w-5" />
          </button>
        )}
      </div>

      <EarningsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        events={events}
        quoteBySymbol={quoteBySymbol}
        now={now}
        stockFreshnessStartedAt={stockFreshnessStartedAt}
        selectedDate={selectedDate}
        setSelectedDate={setUserSelectedDate}
        view={modalView}
        setView={setModalView}
        logoCache={logoCache}
        cacheStockLogo={cacheStockLogo}
        displayStockName={displayStockName}
        language={language}
        marketColorMode={marketColorMode}
        loading={loading}
      />
    </section>
  );
}
