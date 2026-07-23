import React from 'react';
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Layers3,
  Loader2,
  MapPinned,
  PieChart,
  Share2,
} from 'lucide-react';
import StockLogo, { stockLogoCandidates } from '../components/StockLogo.jsx';
import {
  earningsDetailSourceBadgeKind,
  earningsPercentChange,
  fetchEarningsDetail,
  formatEarningsDetailMoney,
  normalizeEarningsDetailPayload,
} from '../lib/earningsDetail.js';
import { earningsResultText } from '../lib/earningsCalendarModel.js';
import { t } from '../lib/i18n.js';
import { marketHexColor } from '../lib/marketColorMode.js';
import { shareEarningsDetailImage } from '../lib/shareEarningsDetail.js';

const PAGE_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const GOLD = '#f6b54b';
const SECTION_ACCENTS = ['#60a5fa', '#a78bfa', '#34d399', '#fb7185', '#f6b54b'];

function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatSignedPercent(value, digits = 1) {
  const number = numericOrNull(value);
  if (number === null) return '—';
  return `${number > 0 ? '+' : ''}${number.toFixed(digits)}%`;
}

function valueColor(value, marketColorMode) {
  const number = numericOrNull(value);
  return number === null || number === 0 ? 'rgba(255,255,255,0.58)' : marketHexColor(number, marketColorMode);
}

function percentShare(value, total) {
  const number = numericOrNull(value);
  const totalNumber = numericOrNull(total);
  if (number === null || totalNumber === null || totalNumber <= 0) return null;
  return (number / totalNumber) * 100;
}

function displayDate(value, language) {
  const raw = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '—';
  const [year, month, day] = raw.split('-');
  return language === 'en' ? `${month}/${day}/${year}` : `${year}.${month}.${day}`;
}

function reportingPeriodText(detail, event, language) {
  const start = detail?.period?.start;
  const end = detail?.period?.end || event?.fiscalDate;
  if (start && end) {
    return language === 'en'
      ? `Reporting period ${displayDate(start, language)}—${displayDate(end, language)}`
      : `财报区间 ${displayDate(start, language)}—${displayDate(end, language)}`;
  }
  if (end) {
    return language === 'en'
      ? `Period ended ${displayDate(end, language)}`
      : `截至 ${displayDate(end, language)}`;
  }
  return language === 'en' ? 'Reporting period —' : '财报区间 —';
}

function periodLabel(event, detail, language) {
  const fiscalDate = detail?.period?.fiscalDate || event?.fiscalDate;
  if (!detail?.period?.start && fiscalDate) {
    return language === 'en'
      ? `Period ended ${displayDate(fiscalDate, language)}`
      : `截至 ${displayDate(fiscalDate, language)}`;
  }
  const match = String(fiscalDate || '').match(/^(\d{4})-(\d{2})-/);
  if (!match) return language === 'en' ? 'Quarterly earnings' : '季度财报';
  const quarter = Math.max(1, Math.min(4, Math.ceil(Number(match[2]) / 3)));
  return language === 'en' ? `FY ${match[1]} Q${quarter}` : `${match[1]} 财年 Q${quarter}`;
}

function profitQualifier(event, language) {
  const basis = String(event?.ebitActualBasis || '').toLowerCase();
  if (basis.includes('incomebeforetax')) return language === 'en' ? 'Pretax income basis' : '税前利润口径';
  return language === 'en' ? 'Operating income basis' : '经营利润口径';
}

function SummaryValue({ value, yoy, language, marketColorMode, muted = false }) {
  return (
    <div className="text-right">
      <div
        className={`text-[14.5px] tabular-nums ${muted ? 'text-white/[0.30]' : 'text-white/[0.80]'}`}
        style={{ fontFamily: NUMBER_FONT }}
      >
        {value}
      </div>
      <div
        className="mt-0.5 text-[11px] tabular-nums"
        style={{ color: yoy == null ? 'rgba(255,255,255,0.22)' : valueColor(yoy, marketColorMode), fontFamily: NUMBER_FONT }}
      >
        {yoy == null ? '—' : formatSignedPercent(yoy)}
      </div>
    </div>
  );
}

function EarningsSummary({ event, language, marketColorMode }) {
  const rows = [
    {
      key: 'revenue',
      label: t(language, 'earningsCalendar.revenueMetric', '营业收入'),
      actual: formatEarningsDetailMoney(event?.revenueActualUsd, language),
      actualYoy: event?.revenueActualYoyPercent,
      estimate: formatEarningsDetailMoney(event?.revenueEstimateUsd, language),
      estimateYoy: event?.revenueEstimateYoyPercent,
    },
    {
      key: 'profit',
      label: t(language, 'earningsCalendar.ebitMetric', '息税前利润'),
      qualifier: profitQualifier(event, language),
      actual: formatEarningsDetailMoney(event?.ebitActualUsd, language),
      actualYoy: event?.ebitActualYoyPercent,
      estimate: '—',
      estimateYoy: null,
    },
    {
      key: 'eps',
      label: t(language, 'earningsCalendar.epsMetric', '每股收益'),
      qualifier: String(event?.epsUnit || event?.epsCurrency || event?.currency || 'USD').trim().toUpperCase(),
      actual: numericOrNull(event?.epsActual) == null ? '—' : Number(event.epsActual).toFixed(2),
      actualYoy: event?.epsActualYoyPercent,
      estimate: numericOrNull(event?.epsEstimate) == null ? '—' : Number(event.epsEstimate).toFixed(2),
      estimateYoy: event?.epsEstimateYoyPercent,
    },
  ];

  return (
    <div className="mt-3">
      <div className="grid grid-cols-[minmax(0,1.12fr)_0.92fr_0.92fr] items-end border-b border-white/[0.045] py-2">
        <div className="text-[10.5px] text-white/[0.25]">{language === 'en' ? 'Metric' : '指标'}</div>
        <div className="text-right text-[10.5px] leading-[1.35] text-white/[0.28]">
          {language === 'en' ? <>Actual<br />YoY</> : <>公布值<br />同比</>}
        </div>
        <div className="text-right text-[10.5px] leading-[1.35] text-white/[0.28]">
          {language === 'en' ? <>Estimate<br />YoY</> : <>预测值<br />同比</>}
        </div>
      </div>
      <div className="divide-y divide-white/[0.045]">
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[minmax(0,1.12fr)_0.92fr_0.92fr] items-center py-2.5">
            <div className="min-w-0 pr-2">
              <div className="truncate text-[12.5px] text-white/[0.65]">{row.label}</div>
              {row.qualifier ? <div className="mt-0.5 text-[10px] text-white/[0.24]">{row.qualifier}</div> : null}
            </div>
            <SummaryValue value={row.actual} yoy={row.actualYoy} language={language} marketColorMode={marketColorMode} />
            <SummaryValue value={row.estimate} yoy={row.estimateYoy} language={language} marketColorMode={marketColorMode} muted={row.estimate === '—'} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, detail, color = 'rgba(255,255,255,0.78)', align = 'left' }) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <div className="text-[11.5px] text-white/[0.31]">{label}</div>
      <div className="mt-1 text-[15px] font-normal tabular-nums" style={{ color, fontFamily: NUMBER_FONT }}>{value}</div>
      {detail ? <div className="mt-0.5 text-[10.5px] text-white/[0.24]">{detail}</div> : null}
    </div>
  );
}

function SectionState({ status, reason, language }) {
  const unsupported = [
    'official-detail-adapter-not-supported',
    'official-detail-fiscal-period-not-supported',
  ].includes(reason);
  const text = status === 'pending'
    ? (language === 'en' ? 'Official breakdown is syncing' : '官方细分数据同步中')
    : unsupported
      ? (language === 'en' ? 'Official breakdown is not available for this company yet' : '该公司的官方细分数据暂未接入')
      : (language === 'en' ? 'No unambiguous structured disclosure' : '本期没有可确认的结构化披露');
  return <div className="rounded-[16px] border border-dashed border-white/[0.07] bg-white/[0.018] px-4 py-8 text-center text-[12px] text-white/[0.30]">{text}</div>;
}

function SegmentCard({ item, index, totalRevenue, language, marketColorMode }) {
  const revenueYoy = earningsPercentChange(item.revenue, item.previousRevenue);
  const profitYoy = earningsPercentChange(item.profit, item.previousProfit);
  const share = percentShare(item.revenue, totalRevenue);
  const profitLabel = item.profitMetric === 'grossProfit'
    ? (language === 'en' ? 'Gross profit' : '毛利')
    : (language === 'en' ? 'Operating income' : '经营利润');
  const margin = numericOrNull(item.revenue) && numericOrNull(item.profit) != null
    ? (Number(item.profit) / Number(item.revenue)) * 100
    : null;
  const accent = SECTION_ACCENTS[index % SECTION_ACCENTS.length];
  return (
    <article className="overflow-hidden rounded-[17px] border border-white/[0.075] bg-[#0d1118] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div className="px-4 pb-3 pt-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_12px_currentColor]" style={{ color: accent, backgroundColor: accent }} />
          <div className="min-w-0">
            <div className="truncate text-[15px] text-white/[0.84]">{language === 'en' ? item.label : item.labelZh || item.label}</div>
            <div className="mt-0.5 truncate text-[11.5px] text-white/[0.30]">{language === 'en' ? item.labelZh : item.label}</div>
          </div>
          <span className="ml-auto shrink-0 rounded-md border border-[#f6b54b]/15 bg-[#f6b54b]/[0.065] px-1.5 py-0.5 text-[10.5px] text-[#f6b54b]/75">
            {language === 'en' ? 'Reportable' : '会计分部'}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Metric label={language === 'en' ? 'Revenue' : '营收'} value={formatEarningsDetailMoney(item.revenue, language)} detail={`${language === 'en' ? 'YoY' : '同比'} ${formatSignedPercent(revenueYoy)}`} />
          <Metric label={profitLabel} value={formatEarningsDetailMoney(item.profit, language, { signed: true })} detail={`${language === 'en' ? 'YoY' : '同比'} ${formatSignedPercent(profitYoy)}`} color={valueColor(item.profit, marketColorMode)} />
          <Metric label={item.profitMetric === 'grossProfit' ? (language === 'en' ? 'Gross margin' : '毛利率') : (language === 'en' ? 'Op. margin' : '经营利润率')} value={formatSignedPercent(margin)} detail={`${language === 'en' ? 'Share' : '营收占比'} ${formatSignedPercent(share)}`} color={valueColor(margin, marketColorMode)} align="right" />
        </div>
      </div>
      <div className="h-[3px] bg-white/[0.035]">
        <div className="h-full rounded-r-full" style={{ width: `${Math.max(1.5, Math.min(100, share || 0))}%`, background: `linear-gradient(90deg, ${accent}55, ${accent})` }} />
      </div>
    </article>
  );
}

function RevenueRow({ item, index, totalRevenue, language, marketColorMode }) {
  const yoy = earningsPercentChange(item.revenue, item.previousRevenue);
  const share = percentShare(item.revenue, totalRevenue);
  return (
    <div className="px-4 py-3.5">
      <div className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5">
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white/[0.045] text-[10.5px] text-white/[0.28]" style={{ fontFamily: NUMBER_FONT }}>{index + 1}</span>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] text-white/[0.75]">{language === 'en' ? item.label : item.labelZh || item.label}</div>
          <div className="mt-0.5 truncate text-[10.5px] text-white/[0.25]">{language === 'en' ? item.labelZh : item.label}</div>
        </div>
        <div className="text-right">
          <div className="text-[14px] tabular-nums text-white/[0.78]" style={{ fontFamily: NUMBER_FONT }}>{formatEarningsDetailMoney(item.revenue, language)}</div>
          <div className="mt-0.5 text-[10.5px] tabular-nums" style={{ color: valueColor(yoy, marketColorMode), fontFamily: NUMBER_FONT }}>{formatSignedPercent(yoy)}</div>
        </div>
      </div>
      <div className="ml-[32px] mt-2.5 flex items-center gap-2">
        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.045]"><div className="h-full rounded-full bg-gradient-to-r from-[#f6b54b]/45 to-[#f6b54b]" style={{ width: `${Math.max(1, Math.min(100, share || 0))}%` }} /></div>
        <span className="w-[34px] text-right text-[10.5px] tabular-nums text-white/[0.26]" style={{ fontFamily: NUMBER_FONT }}>{share == null ? '—' : `${share.toFixed(1)}%`}</span>
      </div>
    </div>
  );
}

function RegionRow({ item, totalRevenue, language, marketColorMode }) {
  const yoy = earningsPercentChange(item.revenue, item.previousRevenue);
  const share = percentShare(item.revenue, totalRevenue);
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] text-white/[0.74]">{language === 'en' ? item.label : item.labelZh || item.label}</div>
          <div className="mt-0.5 truncate text-[10.5px] text-white/[0.25]">{language === 'en' ? item.labelZh : item.label}</div>
        </div>
        <div className="flex shrink-0 items-baseline gap-3">
          <span className="text-[10.5px] tabular-nums" style={{ color: valueColor(yoy, marketColorMode), fontFamily: NUMBER_FONT }}>{formatSignedPercent(yoy)}</span>
          <span className="w-[76px] text-right text-[14px] tabular-nums text-white/[0.78]" style={{ fontFamily: NUMBER_FONT }}>{formatEarningsDetailMoney(item.revenue, language)}</span>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.045]"><div className="h-full rounded-full bg-gradient-to-r from-[#60a5fa]/35 to-[#60a5fa]/90" style={{ width: `${Math.max(1, Math.min(100, share || 0))}%` }} /></div>
        <span className="w-[34px] text-right text-[10.5px] tabular-nums text-white/[0.26]" style={{ fontFamily: NUMBER_FONT }}>{share == null ? '—' : `${share.toFixed(1)}%`}</span>
      </div>
    </div>
  );
}

function DetailSections({ detail, event, language, marketColorMode }) {
  const totalRevenue = numericOrNull(event?.revenueActualUsd)
    ?? detail?.sections?.reportSegments?.items?.reduce((sum, item) => sum + (numericOrNull(item.revenue) || 0), 0)
    ?? 0;
  const report = detail?.sections?.reportSegments || { status: 'pending', items: [] };
  const breakdown = detail?.sections?.revenueBreakdown || { status: 'pending', items: [] };
  const regions = detail?.sections?.geographies || { status: 'pending', items: [] };
  return (
    <>
      <section className="mt-4 scroll-mt-24">
        <div className="mb-2.5 flex items-center justify-between px-1">
          <div className="flex items-start gap-2.5">
            <Layers3 className="mt-0.5 h-4 w-4 text-[#a78bfa]/70" />
            <div><h2 className="text-[15px] text-white/[0.80]">{language === 'en' ? 'Reportable segments' : '报告分部'}</h2><p className="mt-1 text-[11px] text-white/[0.27]">{language === 'en' ? 'Official accounting segments' : '公司正式披露的会计分部'}</p></div>
          </div>
          <span className="text-[10.5px] text-white/[0.23]">{report.items.length || '—'} {language === 'en' ? 'segments' : '个分部'}</span>
        </div>
        {report.items.length ? <div className="space-y-2.5">{report.items.map((item, index) => <SegmentCard key={item.id} item={item} index={index} totalRevenue={totalRevenue} language={language} marketColorMode={marketColorMode} />)}</div> : <SectionState status={report.status} reason={report.reason} language={language} />}
      </section>

      <section className="mt-4 overflow-hidden rounded-[18px] border border-white/[0.075] bg-[#0b0f15]">
        <div className="flex items-end justify-between border-b border-white/[0.055] px-4 py-3.5">
          <div className="flex items-start gap-2.5"><PieChart className="mt-0.5 h-4 w-4 text-[#f6b54b]/65" /><div><h2 className="text-[15px] text-white/[0.80]">{language === 'en' ? 'Revenue breakdown' : '细分结构'}</h2><p className="mt-1 text-[11px] text-white/[0.27]">{language === 'en' ? 'Products and services' : '产品与服务类别，不等同于会计分部'}</p></div></div>
          <span className="text-[10.5px] text-white/[0.23]">{language === 'en' ? 'Revenue · YoY · Share' : '营收 · 同比 · 占比'}</span>
        </div>
        {breakdown.items.length ? <div className="divide-y divide-white/[0.045]">{breakdown.items.map((item, index) => <RevenueRow key={item.id} item={item} index={index} totalRevenue={totalRevenue} language={language} marketColorMode={marketColorMode} />)}</div> : <div className="p-3"><SectionState status={breakdown.status} reason={breakdown.reason} language={language} /></div>}
      </section>

      <section className="mt-4 overflow-hidden rounded-[18px] border border-white/[0.075] bg-[#0b0f15]">
        <div className="flex items-end justify-between border-b border-white/[0.055] px-4 py-3.5">
          <div className="flex items-start gap-2.5"><MapPinned className="mt-0.5 h-4 w-4 text-[#60a5fa]/65" /><div><h2 className="text-[15px] text-white/[0.80]">{language === 'en' ? 'Geographic revenue' : '地区收入'}</h2><p className="mt-1 text-[11px] text-white/[0.27]">{language === 'en' ? 'As officially disclosed' : '按公司官方披露口径'}</p></div></div>
          <span className="text-[10.5px] text-white/[0.23]">{language === 'en' ? 'YoY · Share' : '同比 · 占比'}</span>
        </div>
        {regions.items.length ? <div className="divide-y divide-white/[0.045]">{regions.items.map((item) => <RegionRow key={item.id} item={item} totalRevenue={totalRevenue} language={language} marketColorMode={marketColorMode} />)}</div> : <div className="p-3"><SectionState status={regions.status} reason={regions.reason} language={language} /></div>}
      </section>
    </>
  );
}

export default function EarningsDetailPage({ ctx }) {
  const {
    cacheStockLogo,
    closeEarningsDetail,
    displayStockName,
    earningsDetailDataOverride,
    earningsDetailEvent: event,
    language = 'zh',
    logoCache,
    marketColorMode,
    supabase,
  } = ctx;
  const [detail, setDetail] = React.useState(() => {
    try {
      return earningsDetailDataOverride ? normalizeEarningsDetailPayload(earningsDetailDataOverride) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = React.useState(!earningsDetailDataOverride);
  const [error, setError] = React.useState('');
  const [sharing, setSharing] = React.useState(false);
  const [shareNotice, setShareNotice] = React.useState('');
  const exportRef = React.useRef(null);
  const symbol = String(event?.symbol || detail?.symbol || '').trim().toUpperCase();
  const name = typeof displayStockName === 'function' ? displayStockName(symbol, event?.name, language) : event?.name || symbol;
  const filingUrl = detail?.source?.filingUrl || detail?.source?.primaryDocumentUrl || event?.secFilingUrl || event?.secExhibitUrl;
  const cachedLogoUrl = logoCache?.[symbol]?.url;
  const sourceBadgeKind = earningsDetailSourceBadgeKind(detail, event);
  const sourceBadgeClass = sourceBadgeKind === 'official'
    ? 'border border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300/75'
    : sourceBadgeKind === 'filing'
      ? 'border border-[#f6b54b]/15 bg-[#f6b54b]/[0.065] text-[#f6b54b]/75'
      : 'border border-white/[0.08] bg-white/[0.035] text-white/[0.38]';
  const sourceDotClass = sourceBadgeKind === 'official'
    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.65)]'
    : sourceBadgeKind === 'filing'
      ? 'bg-[#f6b54b]'
      : 'bg-white/30';

  React.useEffect(() => {
    globalThis.scrollTo?.({ top: 0, behavior: 'auto' });
  }, [symbol, event?.fiscalDate, event?.reportDate]);

  React.useEffect(() => {
    let cancelled = false;
    if (earningsDetailDataOverride) {
      try {
        setDetail(normalizeEarningsDetailPayload(earningsDetailDataOverride));
        setError('');
      } catch (overrideError) {
        setDetail(null);
        setError(overrideError?.message || '财报详情数据无效');
      }
      setLoading(false);
      return () => { cancelled = true; };
    }
    if (!event) {
      setLoading(false);
      setError(language === 'en' ? 'No earnings report selected' : '未选择财报');
      return () => { cancelled = true; };
    }
    setLoading(true);
    setError('');
    fetchEarningsDetail({
      supabase,
      symbol: event.symbol,
      fiscalDate: event.fiscalDate,
      reportDate: event.reportDate,
    }).then((payload) => {
      if (!cancelled) setDetail(payload);
    }).catch((fetchError) => {
      if (!cancelled) setError(fetchError?.message || (language === 'en' ? 'Failed to load earnings detail' : '财报详情读取失败'));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [earningsDetailDataOverride, event, language, supabase]);

  const handleShare = async () => {
    if (!exportRef.current || sharing || loading || !detail) return;
    setSharing(true);
    setShareNotice(language === 'en' ? 'Creating full report image…' : '正在生成完整财报长图…');
    try {
      const result = await shareEarningsDetailImage({
        element: exportRef.current,
        symbol,
        title: `${symbol} ${language === 'en' ? 'Earnings detail' : '财报详情'}`,
      });
      setShareNotice(result.method === 'download'
        ? (language === 'en' ? 'Image downloaded' : '长图已下载')
        : '');
    } catch (shareError) {
      if (shareError?.name !== 'AbortError') {
        setShareNotice(shareError?.message || (language === 'en' ? 'Unable to create image' : '长图生成失败'));
      } else {
        setShareNotice('');
      }
    } finally {
      setSharing(false);
    }
  };

  if (!event && !detail) return null;

  return (
    <div className="min-h-[100dvh] bg-[#05070b] text-white" style={{ fontFamily: PAGE_FONT }}>
      <div ref={exportRef} data-earnings-detail-export-root="true" className="min-h-[100dvh] bg-[#05070b]">
        <div data-export-decoration="true" className="pointer-events-none absolute inset-x-0 top-0 h-[220px] bg-[radial-gradient(circle_at_22%_0%,rgba(40,93,77,0.18),transparent_58%)]" />
        <header
          data-export-sticky="true"
          className="sticky top-0 z-30 border-b border-white/[0.065] bg-[#05070b]/92 px-4 pb-3 backdrop-blur-xl"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}
        >
          <div className="mx-auto grid w-full max-w-[430px] grid-cols-[40px_1fr_40px] items-center">
            <button
              data-export-ignore="true"
              type="button"
              aria-label={t(language, 'common.back', '返回')}
              onClick={closeEarningsDetail}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.035] text-white/[0.65] active:scale-95"
            >
              <ArrowLeft className="h-[18px] w-[18px]" />
            </button>
            <div className="text-center">
              <h1 className="text-[17px] font-normal tracking-[0.02em] text-white/[0.86]">{symbol} {language === 'en' ? 'Earnings detail' : '财报详情'}</h1>
              <p className="mt-0.5 text-[10.5px] text-white/[0.25]">{periodLabel(event, detail, language)} · {earningsResultText(event?.earningsResult, language)}</p>
            </div>
            <button
              data-export-ignore="true"
              type="button"
              aria-label={language === 'en' ? 'Share full report image' : '分享完整财报长图'}
              onClick={handleShare}
              disabled={sharing || loading || !detail}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/[0.42] active:scale-95 disabled:opacity-50"
            >
              {sharing ? <Loader2 className="h-[17px] w-[17px] animate-spin" /> : <Share2 className="h-[17px] w-[17px]" />}
            </button>
          </div>
        </header>

        <main data-export-content="true" className="relative z-10 mx-auto w-[calc(100%-32px)] max-w-[430px] pb-[calc(86px+env(safe-area-inset-bottom))] pt-3.5">
          <section className="w-full overflow-hidden rounded-[20px] border border-white/[0.085] bg-[#0b0f15] shadow-[0_18px_45px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.045)]">
            <div className="px-4 pb-4 pt-4">
              <div className="flex items-center gap-3">
                <div data-export-fallback={symbol}>
                  <StockLogo symbol={symbol} urls={stockLogoCandidates(symbol, cachedLogoUrl)} onLogoLoad={cacheStockLogo} className="h-[44px] w-[44px] rounded-[12px]" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2"><span className="text-[17px] text-white/[0.87]">{symbol}</span><span className="truncate text-[13px] text-white/[0.38]">{name}</span></div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/[0.27]">
                    <span>{periodLabel(event, detail, language)}</span><span className="h-0.5 w-0.5 rounded-full bg-white/20" /><span>{detail?.source?.form || event?.secForm || '—'}</span>
                  </div>
                </div>
                <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10.5px] ${sourceBadgeClass}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${sourceDotClass}`} />
                  {sourceBadgeKind === 'official'
                    ? (language === 'en' ? 'Official' : '官方数据')
                    : sourceBadgeKind === 'filing'
                      ? (language === 'en' ? 'SEC filing' : 'SEC 文件')
                      : (language === 'en' ? 'Base data' : '基础数据')}
                </span>
              </div>
              <div className="mt-3.5 flex items-center justify-between border-t border-white/[0.055] pt-3">
                <span className="text-[11px] text-white/[0.28]">{reportingPeriodText(detail, event, language)}</span>
                <span className="text-[10.5px] text-white/[0.23]">{detail?.currency || 'USD'} · {language === 'en' ? 'B/M' : '万/亿'}</span>
              </div>
              <EarningsSummary event={event} language={language} marketColorMode={marketColorMode} />
            </div>
          </section>

          {loading ? (
            <div className="mt-4 flex h-36 items-center justify-center rounded-[18px] border border-white/[0.07] bg-[#0b0f15] text-[13px] text-white/[0.35]"><Loader2 className="mr-2 h-4 w-4 animate-spin text-[#f6b54b]" />{language === 'en' ? 'Loading official breakdown…' : '正在读取官方细分数据…'}</div>
          ) : detail ? (
            <DetailSections detail={detail} event={event} language={language} marketColorMode={marketColorMode} />
          ) : (
            <div className="mt-4 rounded-[18px] border border-white/[0.07] bg-[#0b0f15] px-4 py-8 text-center text-[13px] text-white/[0.35]">{error}</div>
          )}

          <div className="mt-3 rounded-[14px] border border-white/[0.05] bg-white/[0.018] px-3.5 py-3">
            <div className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/[0.24]" />
              <div>
                <p className="text-[11px] leading-[1.55] text-white/[0.27]">
                  {detail?.source?.provider === 'SEC'
                    ? (language === 'en'
                      ? 'Segment, product, and geographic values follow the company’s official filing. Missing or ambiguous fields remain unavailable.'
                      : '报告分部、细分结构与地区数据均按公司官方财报口径展示；缺失或口径不明确的数据统一显示为不可用。')
                    : (language === 'en'
                      ? 'Published headline metrics remain available. Deeper breakdowns appear only when they can be verified from official filings.'
                      : '已公布的核心财报指标仍可查看；报告分部、细分结构和地区收入仅在能从官方文件可靠确认时显示。')}
                </p>
                <p className="mt-1 text-[10.5px] leading-[1.5] text-white/[0.19]">
                  {language === 'en' ? 'Financial amounts stay in the report currency.' : '财务金额保持财报原币种，不跟随持仓币种换算。'}
                </p>
                {filingUrl ? <a href={filingUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-[#f6b54b]/55">{language === 'en' ? 'SEC official filing' : 'SEC 官方财报'}<ExternalLink className="h-3 w-3" /></a> : null}
              </div>
            </div>
          </div>
        </main>
      </div>
      {shareNotice ? (
        <div data-export-ignore="true" className="fixed left-1/2 z-[70] -translate-x-1/2 rounded-full border border-white/10 bg-[#111720]/95 px-3 py-1.5 text-[11.5px] text-white/70 shadow-xl backdrop-blur-md" style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
          {shareNotice}
        </div>
      ) : null}
    </div>
  );
}
