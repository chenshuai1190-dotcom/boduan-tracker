import React from 'react';
import { Loader2 } from 'lucide-react';
import {
  buildEarningsGrowthChartGeometry,
  buildEarningsGrowthSummary,
  earningsGrowthPeriodKey,
  earningsGrowthPeriodLabel,
  loadEarningsGrowth,
  normalizeEarningsGrowthPayload,
} from '../lib/earningsGrowth.js';
import { marketHexColor } from '../lib/marketColorMode.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const REVENUE_COLOR = '#5e8ff5';
const PROFIT_COLOR = '#69c34a';
const ACCENT_COLOR = '#e7aa49';
const ANNUAL_CHART_WIDTH = 356;
const QUARTERLY_CHART_WIDTH = 520;
const CHART_HEIGHT = 185;

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function languageIsEnglish(language) {
  return String(language || '').toLowerCase().startsWith('en');
}

function formatPercent(value, language, suffix = '%') {
  const number = finiteOrNull(value);
  if (number === null) return '—';
  const formatted = Math.abs(number).toLocaleString(languageIsEnglish(language) ? 'en-US' : 'zh-CN', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${number > 0 ? '+' : number < 0 ? '-' : ''}${formatted}${suffix}`;
}

function formatRatioPercent(value, language) {
  const number = finiteOrNull(value);
  if (number === null) return '—';
  return `${number.toLocaleString(languageIsEnglish(language) ? 'en-US' : 'zh-CN', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function detailPeriodLabel(period, mode, language) {
  if (languageIsEnglish(language)) return earningsGrowthPeriodLabel(period, mode);
  const fiscalYear = Number(period?.fiscalYear);
  if (!Number.isInteger(fiscalYear)) return '—';
  return mode === 'quarterly'
    ? `${fiscalYear} 财年 Q${period.fiscalQuarter}`
    : `${fiscalYear} 财年`;
}

function dateText(value, language) {
  const raw = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '—';
  const [year, month, day] = raw.split('-');
  return languageIsEnglish(language) ? `${month}/${day}/${year}` : `${year}.${month}.${day}`;
}

function currencyName(currency, language) {
  const code = String(currency || '').trim().toUpperCase();
  const names = languageIsEnglish(language)
    ? {
        USD: 'USD',
        EUR: 'EUR',
        CNY: 'CNY',
        TWD: 'TWD',
        JPY: 'JPY',
        GBP: 'GBP',
        HKD: 'HKD',
        KRW: 'KRW',
      }
    : {
        USD: '美元',
        EUR: '欧元',
        CNY: '人民币',
        TWD: '新台币',
        JPY: '日元',
        GBP: '英镑',
        HKD: '港元',
        KRW: '韩元',
      };
  return names[code] || code || (languageIsEnglish(language) ? 'currency' : '原币');
}

function displayScale(periods, currency, language) {
  const maximum = Math.max(
    0,
    ...(Array.isArray(periods) ? periods : []).flatMap((period) => [
      Math.abs(finiteOrNull(period?.revenue) || 0),
      Math.abs(finiteOrNull(period?.netIncome) || 0),
    ]),
  );
  const name = currencyName(currency, language);
  if (languageIsEnglish(language)) {
    if (maximum >= 1_000_000_000) return { divisor: 1_000_000_000, unit: `${name} B` };
    if (maximum >= 1_000_000) return { divisor: 1_000_000, unit: `${name} M` };
    if (maximum >= 1_000) return { divisor: 1_000, unit: `${name} K` };
    return { divisor: 1, unit: name };
  }
  if (maximum >= 100_000_000) return { divisor: 100_000_000, unit: `亿${name}` };
  if (maximum >= 10_000) return { divisor: 10_000, unit: `万${name}` };
  return { divisor: 1, unit: name };
}

function formatScaledValue(value, scale, language, { chart = false } = {}) {
  const number = finiteOrNull(value);
  if (number === null) return '—';
  const scaled = number / Math.max(1, scale?.divisor || 1);
  const absolute = Math.abs(scaled);
  const digits = chart
    ? absolute >= 100 ? 0 : absolute >= 10 ? 0 : 1
    : 1;
  return scaled.toLocaleString(languageIsEnglish(language) ? 'en-US' : 'zh-CN', {
    minimumFractionDigits: chart ? 0 : digits,
    maximumFractionDigits: digits,
  });
}

function valueTone(value, marketColorMode) {
  const number = finiteOrNull(value);
  return number === null || number === 0
    ? 'rgba(255,255,255,0.55)'
    : marketHexColor(number, marketColorMode);
}

function useNearViewport(targetRef, eager, rootMargin) {
  const [nearViewport, setNearViewport] = React.useState(Boolean(eager));
  React.useEffect(() => {
    if (eager) {
      setNearViewport(true);
      return undefined;
    }
    const node = targetRef.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver !== 'function') {
      setNearViewport(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setNearViewport(true);
      observer.disconnect();
    }, { rootMargin, threshold: 0.01 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [eager, rootMargin, targetRef]);
  return nearViewport;
}

function StateCard({ state, language }) {
  const english = languageIsEnglish(language);
  const loading = state === 'deferred' || state === 'loading' || state === 'pending';
  return (
    <section
      className="mt-4 overflow-hidden rounded-[19px] border border-white/[0.075] bg-[#0b0f15]"
      data-earnings-growth-card="true"
      data-earnings-growth-state={state}
      aria-busy={loading}
      aria-live="polite"
    >
      <div className="flex items-start justify-between px-[15px] py-[15px]">
        <div>
          <h2 className="text-[16px] font-normal tracking-[0.01em] text-white/[0.88]">
            {english ? 'Performance trend' : '业绩趋势'}
          </h2>
          <p className="mt-1 text-[11px] text-white/[0.48]">
            {english ? 'Revenue and net income' : '营收与净利润'}
          </p>
        </div>
        {loading ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-[#e7aa49]/70" /> : null}
      </div>
      <div className="border-t border-white/[0.045] px-4 py-8 text-center text-[12px] text-white/[0.40]">
        {loading
          ? (english ? 'Loading reported performance…' : '正在读取已公布业绩…')
          : (english ? 'No verified historical performance is available' : '暂无可确认的历史业绩数据')}
      </div>
    </section>
  );
}

function SummaryMetric({
  label,
  value,
  period,
  language,
  marketColorMode,
}) {
  const formattedValue = formatPercent(value, language);
  const adaptiveFontSize = formattedValue.length >= 10
    ? '17px'
    : formattedValue.length >= 8
      ? '19px'
      : '22px';
  return (
    <div className="min-w-0 px-2.5 py-2.5 text-center">
      <div className="truncate whitespace-nowrap text-[11px] text-white/[0.48]">{label}</div>
      <div
        className="mt-1 whitespace-nowrap font-normal leading-none tabular-nums tracking-[-0.01em]"
        style={{
          color: valueTone(value, marketColorMode),
          fontFamily: NUMBER_FONT,
          fontSize: adaptiveFontSize,
        }}
      >
        {formattedValue}
      </div>
      <div className="mt-1 truncate whitespace-nowrap text-[10px] text-white/[0.34]">{period}</div>
    </div>
  );
}

function GrowthChart({
  periods,
  mode,
  selectedKey,
  onSelect,
  currency,
  language,
  scrollRef,
}) {
  const width = mode === 'quarterly' ? QUARTERLY_CHART_WIDTH : ANNUAL_CHART_WIDTH;
  const chart = React.useMemo(
    () => buildEarningsGrowthChartGeometry(periods, { mode, width, height: CHART_HEIGHT }),
    [mode, periods, width],
  );
  const scale = React.useMemo(
    () => displayScale(periods, currency, language),
    [currency, language, periods],
  );
  const gradientId = React.useId().replaceAll(':', '');
  if (!chart) return null;
  const labelY = (value) => Math.max(10, Math.min(CHART_HEIGHT - chart.bottom + 23, value));

  return (
    <div
      ref={scrollRef}
      className={mode === 'quarterly'
        ? 'overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        : 'overflow-visible'}
      style={{ WebkitOverflowScrolling: 'touch' }}
      data-earnings-growth-chart-scroll={mode}
    >
      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className={mode === 'quarterly'
          ? 'block h-[185px] w-[520px] max-w-none overflow-visible'
          : 'block h-auto w-full overflow-visible'}
        role="img"
        aria-label={languageIsEnglish(language)
          ? `${mode === 'annual' ? 'Annual' : 'Quarterly'} revenue and net income chart`
          : `${mode === 'annual' ? '年度' : '季度'}营收与净利润柱状图`}
      >
        <defs>
          <linearGradient id={`${gradientId}-revenue`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6d9cff" />
            <stop offset="100%" stopColor="#3f68c2" />
          </linearGradient>
          <linearGradient id={`${gradientId}-profit`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#83d85d" />
            <stop offset="100%" stopColor="#478f35" />
          </linearGradient>
        </defs>
        {chart.ticks.map((tick) => {
          const y = chart.y(tick);
          return (
            <g key={tick}>
              <line
                x1={chart.left}
                x2={chart.width - chart.right}
                y1={y}
                y2={y}
                stroke={tick === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.065)'}
                strokeDasharray={tick === 0 ? undefined : '3 5'}
                strokeWidth="1"
              />
              <text
                x={chart.left - 6}
                y={y + 3.5}
                textAnchor="end"
                fill="rgba(226,230,237,0.32)"
                fontSize="10"
                fontWeight="400"
                style={{ fontFamily: NUMBER_FONT }}
              >
                {formatScaledValue(tick, scale, language, { chart: true })}
              </text>
            </g>
          );
        })}
        {chart.groups.map((group) => {
          const key = earningsGrowthPeriodKey(group.period, mode);
          const selected = key === selectedKey;
          return (
            <g
              key={key}
              role="button"
              tabIndex="0"
              aria-label={languageIsEnglish(language)
                ? `Select ${earningsGrowthPeriodLabel(group.period, mode)}`
                : `选择 ${earningsGrowthPeriodLabel(group.period, mode)}`}
              aria-pressed={selected}
              data-earnings-growth-period={key}
              onClick={() => onSelect(key)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onSelect(key);
              }}
              className="cursor-pointer outline-none"
            >
              <rect
                x={group.hitX + 2}
                y={chart.top - 5}
                width={Math.max(1, group.hitWidth - 4)}
                height={chart.plotHeight + 14}
                rx="7"
                fill="transparent"
                stroke="transparent"
              />
              <rect
                x={group.revenue.x}
                y={group.revenue.y}
                width={group.revenue.width}
                height={group.revenue.height}
                rx="3"
                fill={`url(#${gradientId}-revenue)`}
                opacity="0.82"
              />
              <rect
                x={group.netIncome.x}
                y={group.netIncome.y}
                width={group.netIncome.width}
                height={group.netIncome.height}
                rx="3"
                fill={`url(#${gradientId}-profit)`}
                opacity="0.82"
              />
              <text
                x={group.revenue.x + group.revenue.width / 2}
                y={labelY(group.revenueLabelY)}
                textAnchor="middle"
                fill="rgba(242,244,248,0.76)"
                fontSize="10"
                fontWeight="400"
                opacity="0.78"
                style={{ fontFamily: NUMBER_FONT }}
              >
                {formatScaledValue(group.period.revenue, scale, language, { chart: true })}
              </text>
              <text
                x={group.netIncome.x + group.netIncome.width / 2}
                y={labelY(group.netIncomeLabelY)}
                textAnchor="middle"
                fill="rgba(139,208,98,0.88)"
                fontSize="10"
                fontWeight="400"
                opacity="0.78"
                style={{ fontFamily: NUMBER_FONT }}
              >
                {formatScaledValue(group.period.netIncome, scale, language, { chart: true })}
              </text>
              <text
                x={group.centerX}
                y={CHART_HEIGHT - 11}
                textAnchor="middle"
                fill={selected ? 'rgba(242,194,113,0.95)' : 'rgba(226,230,237,0.40)'}
                fontSize="10"
                fontWeight="400"
                style={{ fontFamily: NUMBER_FONT }}
              >
                {earningsGrowthPeriodLabel(group.period, mode, { compact: true })}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DetailRow({
  color,
  label,
  value,
  change,
  language,
  marketColorMode,
  changeSuffix = '%',
}) {
  return (
    <div className="grid min-h-8 grid-cols-[minmax(0,1fr)_max-content_max-content] items-center gap-x-2 border-t border-white/[0.045] px-[11px] text-[11px] text-white/[0.48]">
      <span className="flex min-w-0 items-center gap-[7px]">
        <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate">{label}</span>
      </span>
      <span
        className="whitespace-nowrap text-right tabular-nums text-white/[0.79]"
        style={{ fontFamily: NUMBER_FONT, fontSize: 'clamp(10px, 2.8vw, 11px)' }}
      >
        {value}
      </span>
      <span
        className="whitespace-nowrap text-right tabular-nums"
        style={{
          color: valueTone(change, marketColorMode),
          fontFamily: NUMBER_FONT,
          fontSize: 'clamp(10px, 2.8vw, 11px)',
        }}
      >
        {changeSuffix === 'ppt'
          ? `${formatPercent(change, language, '')} ${languageIsEnglish(language) ? 'ppt' : '个百分点'}`
          : formatPercent(change, language)}
      </span>
    </div>
  );
}

export default function EarningsGrowthCard({
  symbol,
  token,
  userId,
  language = 'zh',
  marketColorMode,
  dataOverride,
  fetchImpl = globalThis.fetch,
  loadGrowth = loadEarningsGrowth,
  initialMode = 'annual',
  rootMargin = '420px 0px',
  className = '',
}) {
  const rootRef = React.useRef(null);
  const quarterlyScrollRef = React.useRef(null);
  const normalizedOverride = React.useMemo(
    () => (dataOverride ? normalizeEarningsGrowthPayload(dataOverride, symbol) : null),
    [dataOverride, symbol],
  );
  const nearViewport = useNearViewport(rootRef, Boolean(dataOverride), rootMargin);
  const [requestState, setRequestState] = React.useState(() => (
    normalizedOverride
      ? { status: normalizedOverride.status, data: normalizedOverride }
      : { status: 'deferred', data: null }
  ));
  const [mode, setMode] = React.useState(initialMode === 'quarterly' ? 'quarterly' : 'annual');
  const [selectedByMode, setSelectedByMode] = React.useState({ annual: '', quarterly: '' });

  React.useEffect(() => {
    if (dataOverride) {
      setRequestState(normalizedOverride
        ? { status: normalizedOverride.status, data: normalizedOverride }
        : { status: 'unavailable', data: null });
      return undefined;
    }
    if (!nearViewport) {
      setRequestState({ status: 'deferred', data: null });
      return undefined;
    }
    if (!symbol || !token || !userId) {
      setRequestState({ status: 'unavailable', data: null });
      return undefined;
    }
    let active = true;
    setRequestState((current) => ({ status: 'loading', data: current.data }));
    Promise.resolve(loadGrowth({
      userId,
      symbol,
      token,
      fetchImpl,
    })).then((data) => {
      if (active) setRequestState({ status: data.status, data });
    }).catch(() => {
      if (active) setRequestState({ status: 'unavailable', data: null });
    });
    return () => { active = false; };
  }, [
    dataOverride,
    fetchImpl,
    loadGrowth,
    nearViewport,
    normalizedOverride,
    symbol,
    token,
    userId,
  ]);

  const data = requestState.data;
  const annualReady = Boolean(data?.annual?.length);
  const quarterlyReady = Boolean(data?.quarterly?.length);
  React.useEffect(() => {
    if (mode === 'annual' && !annualReady && quarterlyReady) setMode('quarterly');
    if (mode === 'quarterly' && !quarterlyReady && annualReady) setMode('annual');
  }, [annualReady, mode, quarterlyReady]);

  React.useEffect(() => {
    if (!data) return;
    setSelectedByMode((current) => {
      const next = { ...current };
      for (const candidateMode of ['annual', 'quarterly']) {
        const periods = data[candidateMode] || [];
        const validKeys = new Set(periods.map((period) => earningsGrowthPeriodKey(period, candidateMode)));
        if (!validKeys.has(next[candidateMode])) {
          next[candidateMode] = earningsGrowthPeriodKey(periods.at(-1), candidateMode);
        }
      }
      return next;
    });
  }, [data]);

  React.useEffect(() => {
    if (mode !== 'quarterly' || !quarterlyReady) return undefined;
    const frame = requestAnimationFrame(() => {
      const node = quarterlyScrollRef.current;
      if (node) node.scrollLeft = Math.max(0, node.scrollWidth - node.clientWidth - 18);
    });
    return () => cancelAnimationFrame(frame);
  }, [mode, quarterlyReady]);

  const periods = mode === 'annual' ? data?.annual || [] : data?.quarterly || [];
  const selectedKey = selectedByMode[mode];
  const selected = periods.find((period) => (
    earningsGrowthPeriodKey(period, mode) === selectedKey
  )) || periods.at(-1) || null;
  const summary = buildEarningsGrowthSummary(data, mode);
  const scale = displayScale(periods, data?.currency, language);
  const english = languageIsEnglish(language);
  const hasRenderableData = annualReady || quarterlyReady;
  const state = requestState.status;

  if (
    !data
    || !hasRenderableData
    || ['deferred', 'loading', 'pending', 'unavailable'].includes(state)
  ) {
    return (
      <div ref={rootRef} className={className}>
        <StateCard state={state} language={language} />
      </div>
    );
  }

  const intervalCount = Math.max(0, summary.intervalCount);
  const periodText = summary.periodText;
  const rangeText = mode === 'annual'
    ? (english
      ? `${periods.length} fiscal years · ${intervalCount} compounding intervals`
      : `${periods.length} 个财年 · ${intervalCount} 个复利区间`)
    : (english
      ? `${periods.length} quarters · year-over-year`
      : `${periods.length} 个季度 · 同季度同比`);
  const subtitle = mode === 'annual'
    ? (english
      ? `Revenue and net income · latest ${periods.length} complete fiscal years`
      : `营收与净利润 · 近 ${periods.length} 个完整财年`)
    : (english
      ? `Revenue and net income · latest ${periods.length} complete quarters`
      : `营收与净利润 · 近 ${periods.length} 个完整季度`);
  const selectedValue = (value) => `${formatScaledValue(value, scale, language)} ${scale.unit}`;

  return (
    <section
      ref={rootRef}
      className={`mt-4 overflow-hidden rounded-[19px] border border-white/[0.075] bg-[#0b0f15] shadow-[0_18px_45px_rgba(0,0,0,0.16)] ${className}`}
      data-earnings-growth-card="true"
      data-earnings-growth-state={state}
      data-earnings-growth-mode={mode}
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3 px-[15px] pb-3 pt-[15px]">
        <div className="min-w-0">
          <h2 className="truncate text-[16px] font-normal tracking-[0.01em] text-white/[0.88]">
            {english ? 'Performance trend' : '业绩趋势'}
          </h2>
          <p className="mt-1 truncate text-[11px] text-white/[0.48]">{subtitle}</p>
        </div>
        <div
          className="grid min-h-8 min-w-[116px] shrink-0 grid-cols-2 rounded-[11px] border border-white/[0.085] bg-white/[0.025] p-[3px]"
          role="tablist"
          aria-label={english ? 'Performance period' : '业绩周期'}
        >
          {[
            ['annual', english ? 'Annual' : '年度', annualReady],
            ['quarterly', english ? 'Quarterly' : '季度', quarterlyReady],
          ].map(([value, label, available]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              disabled={!available}
              onClick={() => setMode(value)}
              className={`min-w-0 rounded-lg px-2 text-[11px] font-normal transition active:scale-95 disabled:opacity-25 ${
                mode === value
                  ? 'text-[#f2c271]'
                  : 'text-white/[0.34]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-[15px] mb-2 grid grid-cols-2 divide-x divide-white/[0.045] rounded-[14px] bg-[#101620]">
        <SummaryMetric
          label={mode === 'annual'
            ? (english ? `Revenue ${intervalCount}Y CAGR` : `营收 ${intervalCount}年复合增速`)
            : (english ? 'Latest-quarter revenue YoY' : '最新季度营收同比')}
          value={summary.revenueValue}
          period={periodText}
          language={language}
          marketColorMode={marketColorMode}
        />
        <SummaryMetric
          label={mode === 'annual'
            ? (english ? `Net income ${intervalCount}Y CAGR` : `净利润 ${intervalCount}年复合增速`)
            : (english ? 'Latest-quarter net income YoY' : '最新季度净利润同比')}
          value={summary.netIncomeValue}
          period={periodText}
          language={language}
          marketColorMode={marketColorMode}
        />
      </div>

      <div className="flex items-center gap-[17px] px-[17px] pb-1 pt-0.5 text-[11px] text-white/[0.48]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[7px] w-[7px] rounded-full shadow-[0_0_9px_currentColor]" style={{ backgroundColor: REVENUE_COLOR, color: REVENUE_COLOR }} />
          {english ? `Revenue (${scale.unit})` : `营收（${scale.unit}）`}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[7px] w-[7px] rounded-full shadow-[0_0_9px_currentColor]" style={{ backgroundColor: PROFIT_COLOR, color: PROFIT_COLOR }} />
          {english ? `Net income (${scale.unit})` : `净利润（${scale.unit}）`}
        </span>
      </div>

      <div className="px-[2px]">
        <GrowthChart
          periods={periods}
          mode={mode}
          selectedKey={selectedKey}
          onSelect={(key) => setSelectedByMode((current) => ({ ...current, [mode]: key }))}
          currency={data.currency}
          language={language}
          scrollRef={mode === 'quarterly' ? quarterlyScrollRef : undefined}
        />
      </div>

      {selected ? (
        <div className="mx-[15px] mb-[13px] mt-0.5 overflow-hidden rounded-[14px] bg-[#101620]">
          <div className="grid min-h-[34px] grid-cols-[minmax(0,1fr)_max-content_max-content] items-center gap-x-2 px-[11px] text-[10px] text-white/[0.48]">
            <strong className="truncate whitespace-nowrap text-[11px] font-normal text-white/[0.64]">
              {detailPeriodLabel(selected, mode, language)} · {dateText(selected.endDate, language)}
            </strong>
            <span className="text-right">{english ? 'Reported' : '公布值'}</span>
            <span className="text-right">{english ? 'YoY' : mode === 'annual' ? '较上年' : '同比'}</span>
          </div>
          <DetailRow
            color={REVENUE_COLOR}
            label={english ? 'Revenue' : '营收'}
            value={selectedValue(selected.revenue)}
            change={selected.revenueYoyPct}
            language={language}
            marketColorMode={marketColorMode}
          />
          <DetailRow
            color={PROFIT_COLOR}
            label={english ? 'Net income' : '净利润'}
            value={selectedValue(selected.netIncome)}
            change={selected.netIncomeYoyPct}
            language={language}
            marketColorMode={marketColorMode}
          />
          <DetailRow
            color={ACCENT_COLOR}
            label={english ? 'Net margin' : '净利率'}
            value={formatRatioPercent(selected.netMarginPct, language)}
            change={selected.netMarginChangePpt}
            language={language}
            marketColorMode={marketColorMode}
            changeSuffix="ppt"
          />
          {mode === 'quarterly' && finiteOrNull(selected.revenueQoqPct) !== null ? (
            <div className="flex min-h-8 items-center justify-between border-t border-white/[0.045] px-[11px] text-[11px]">
              <span className="text-white/[0.48]">{english ? 'Revenue QoQ' : '营收环比'}</span>
              <span
                className="tabular-nums"
                style={{
                  color: valueTone(selected.revenueQoqPct, marketColorMode),
                  fontFamily: NUMBER_FONT,
                }}
              >
                {formatPercent(selected.revenueQoqPct, language)}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {state === 'partial' ? (
        <div className="px-[15px] pb-2 text-[10px] text-[#e7aa49]/60">
          {english
            ? 'Only complete, unambiguous periods are shown'
            : '仅展示口径完整且可确认的期间'}
        </div>
      ) : null}
      <footer className="flex min-h-[42px] items-center border-t border-white/[0.045] px-[15px] text-[10px] text-white/[0.34]">
        <span>{rangeText}</span>
      </footer>
    </section>
  );
}
