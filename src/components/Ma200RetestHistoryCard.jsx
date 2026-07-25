import React from 'react';
import { Info } from 'lucide-react';
import { marketHexColor } from '../lib/marketColorMode.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const TABLE_GRID = 'grid-cols-[15px_62px_42px_minmax(76px,1fr)_47px_30px_44px]';

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function copy(language, zh, en) {
  return language === 'en' ? en : zh;
}

function formatPercent(value, digits = 1, { signed = true } = {}) {
  const number = finiteNumber(value);
  if (number === null) return '—';
  return `${signed && number > 0 ? '+' : ''}${number.toFixed(digits)}%`;
}

function formatDate(value, language) {
  const key = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)?.[0];
  if (!key) return '—';
  if (language !== 'en') return key.replaceAll('-', '/');
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${key}T00:00:00Z`));
}

function compactDate(value, language) {
  const match = String(value || '').match(/^(\d{2})(\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return '—';
  return language === 'en'
    ? `${match[2]}/${match[3]}/${match[4]}`
    : `${match[1]}${match[2]}/${match[3]}/${match[4]}`;
}

function distributionDateLabel(value) {
  const match = String(value || '').match(/^\d{2}(\d{2})-(\d{2})-\d{2}$/);
  return match ? `${match[1]}/${match[2]}` : '';
}

function normalizeSeries(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const close = finiteNumber(row?.close);
      const ma200 = finiteNumber(row?.ma200);
      if (!(close > 0) || !(ma200 > 0)) return null;
      return {
        date: String(row?.date || ''),
        close,
        distance: ((close / ma200) - 1) * 100,
      };
    })
    .filter(Boolean);
}

function valueColor(value, marketColorMode, fallback = 'rgba(255,255,255,0.48)') {
  const number = finiteNumber(value);
  if (number === null || number === 0) return fallback;
  return marketHexColor(number > 0 ? 1 : -1, marketColorMode);
}

function RetestMiniChart({
  rows,
  lowDate,
  language,
  marketColorMode,
}) {
  const points = React.useMemo(() => normalizeSeries(rows), [rows]);
  if (points.length < 2) {
    return (
      <span
        className="flex h-8 items-center justify-center text-[10px] text-white/[0.25]"
        aria-label={copy(language, '没有可用的日线MA200序列', 'No daily MA200 series available')}
      >
        —
      </span>
    );
  }

  const width = 74;
  const height = 34;
  const horizontalPadding = 2;
  const verticalPadding = 3;
  const values = points.map((point) => point.distance);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const span = Math.max(1, maximum - minimum);
  const x = (index) => horizontalPadding
    + (index / Math.max(1, points.length - 1)) * (width - horizontalPadding * 2);
  const y = (value) => verticalPadding
    + ((maximum - value) / span) * (height - verticalPadding * 2);
  const reportedLowIndex = points.findIndex((point) => point.date === lowDate);
  const calculatedLowIndex = points.reduce(
    (lowestIndex, point, index) => (
      point.distance < points[lowestIndex].distance ? index : lowestIndex
    ),
    0,
  );
  const lowIndex = reportedLowIndex >= 0 ? reportedLowIndex : calculatedLowIndex;
  const reboundIndex = points.reduce(
    (highestIndex, point, index) => (
      index >= lowIndex && point.close > points[highestIndex].close ? index : highestIndex
    ),
    lowIndex,
  );
  const linePath = (startIndex, endIndex) => points
    .slice(startIndex, endIndex + 1)
    .map((point, offset) => {
      const index = startIndex + offset;
      return `${offset === 0 ? 'M' : 'L'}${x(index).toFixed(2)},${y(point.distance).toFixed(2)}`;
    })
    .join(' ');
  const zeroY = y(0);
  const negativeColor = marketHexColor(-1, marketColorMode);
  const positiveColor = marketHexColor(1, marketColorMode);

  return (
    <svg
      className="h-[34px] w-full max-w-full"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={copy(
        language,
        '事件期间相对日线MA200的真实走势',
        'Actual performance versus daily MA200 during the event',
      )}
      preserveAspectRatio="none"
      data-ma200-event-mini-chart="actual-series"
    >
      <line
        x1={horizontalPadding}
        x2={width - horizontalPadding}
        y1={zeroY}
        y2={zeroY}
        stroke="rgba(255,255,255,0.18)"
        strokeDasharray="2.5 2.5"
        data-ma200-mini-zero-line="daily-ma200"
      />
      <path
        d={linePath(0, lowIndex)}
        fill="none"
        stroke={negativeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        data-ma200-mini-depth-segment="actual"
      />
      {lowIndex < points.length - 1 ? (
        <path
          d={linePath(lowIndex, points.length - 1)}
          fill="none"
          stroke={positiveColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          data-ma200-mini-rebound-segment="actual"
        />
      ) : null}
      <circle
        cx={x(lowIndex)}
        cy={y(points[lowIndex].distance)}
        r="2"
        fill={negativeColor}
        data-ma200-mini-low-point="actual"
      />
      <circle
        cx={x(reboundIndex)}
        cy={y(points[reboundIndex].distance)}
        r="2"
        fill={positiveColor}
        data-ma200-mini-rebound-point="actual"
      />
    </svg>
  );
}

function SummaryMetric({ label, value, detail, color }) {
  return (
    <div className="min-w-0 overflow-hidden px-0.5 py-2.5 text-center">
      <div className="truncate whitespace-nowrap text-[10px] leading-tight text-white/[0.42]">
        {label}
      </div>
      <div
        className="mt-1.5 truncate whitespace-nowrap text-[14px] font-normal leading-none tabular-nums"
        style={{ color, fontFamily: NUMBER_FONT }}
      >
        {value}
      </div>
      <div className="mt-1 truncate whitespace-nowrap text-[10px] leading-tight text-white/[0.32]">
        {detail}
      </div>
    </div>
  );
}

function EventStatus({
  status,
  language,
  recoveryDays,
  marketColorMode,
}) {
  const recovered = status === 'recovered';
  const failed = status === 'failed';
  const reclaimedWhileObserving = status === 'observing'
    && finiteNumber(recoveryDays) !== null;
  const label = recovered
    ? copy(language, '成功', 'Success')
    : failed
      ? copy(language, '失败', 'Failed')
      : reclaimedWhileObserving
        ? copy(language, '观察', 'Watch')
        : copy(language, '观察', 'Watch');
  const fullLabel = reclaimedWhileObserving
    ? copy(language, '已重返MA200，仍在观察中', 'Reclaimed MA200, still observing')
    : label;
  const color = recovered
    ? marketHexColor(1, marketColorMode)
      : failed
      ? marketHexColor(-1, marketColorMode)
      : '#f6b54b';

  return (
    <span
      className="mx-auto inline-flex max-w-[44px] items-center justify-center truncate whitespace-nowrap rounded-md border px-[1px] py-1 text-center text-[10px]"
      style={{ color, borderColor: `${color}35`, backgroundColor: `${color}12` }}
      title={fullLabel}
      data-ma200-result-badge={status || 'observing'}
    >
      {label}
    </span>
  );
}

function RetestEventRow({
  event,
  index,
  language,
  marketColorMode,
}) {
  const recoveryDays = finiteNumber(event?.recoveryTradingDays);

  return (
    <div
      className={`grid min-h-[58px] min-w-0 ${TABLE_GRID} items-center border-t border-white/[0.045]`}
      data-ma200-retest-event={event?.triggerDate || ''}
      data-ma200-retest-row="compact-table"
    >
      <span
        className="px-0.5 text-center text-[10px] tabular-nums text-white/[0.28]"
        style={{ fontFamily: NUMBER_FONT }}
      >
        {index + 1}
      </span>
      <span
        className="truncate px-0.5 text-center text-[10px] tabular-nums text-white/[0.58]"
        style={{ fontFamily: NUMBER_FONT }}
        title={formatDate(event?.triggerDate, language)}
      >
        {compactDate(event?.triggerDate, language)}
      </span>
      <span
        className="truncate px-0.5 text-center text-[10px] tabular-nums"
        style={{
          color: valueColor(event?.retestDepthPct, marketColorMode),
          fontFamily: NUMBER_FONT,
        }}
      >
        {formatPercent(event?.retestDepthPct)}
      </span>
      <div className="min-w-0 px-0.5">
        <RetestMiniChart
          rows={event?.series}
          lowDate={event?.lowDate}
          language={language}
          marketColorMode={marketColorMode}
        />
      </div>
      <span
        className="truncate px-0.5 text-center text-[10px] tabular-nums"
        style={{
          color: valueColor(event?.maxReboundPct, marketColorMode),
          fontFamily: NUMBER_FONT,
        }}
      >
        {formatPercent(event?.maxReboundPct)}
      </span>
      <span
        className="truncate px-0.5 text-center text-[10px] tabular-nums text-white/[0.52]"
        style={{ fontFamily: NUMBER_FONT }}
      >
        {recoveryDays === null
          ? event?.status === 'failed' ? '>20' : '—'
          : copy(language, `${recoveryDays}`, `${recoveryDays}`)}
      </span>
      <EventStatus
        status={event?.status}
        language={language}
        recoveryDays={recoveryDays}
        marketColorMode={marketColorMode}
      />
    </div>
  );
}

function RetestEventsTable({ events, language, marketColorMode }) {
  return (
    <div
      className="mx-3 mt-3 min-w-0 overflow-hidden border-y border-white/[0.06]"
      data-ma200-retest-table="compact-seven-column"
    >
      <div
        className={`grid min-h-[40px] min-w-0 ${TABLE_GRID} items-center text-center text-[10px] leading-[1.15] text-white/[0.34]`}
        data-ma200-retest-table-header="seven-columns"
      >
        <span className="px-0.5">#</span>
        <span className="px-0.5">{copy(language, '触发日期', 'Date')}</span>
        <span className="px-0.5" title={copy(language, '回踩幅度', 'Retest depth')}>
          {copy(language, '回踩', 'Depth')}
        </span>
        <span
          className="px-0.5"
          title={copy(language, '迷你V形日线MA200图', 'Mini daily MA200 V chart')}
          aria-label={copy(language, '走势', 'Path')}
        />
        <span className="px-0.5" title={copy(language, '反弹幅度（20日）', 'Rebound (20 sessions)')}>
          {copy(language, '20日反弹', '20d rebound')}
        </span>
        <span className="px-0.5" title={copy(language, '反弹天数', 'Rebound days')}>
          {copy(language, '天数', 'Days')}
        </span>
        <span className="px-0.5">{copy(language, '结果', 'Result')}</span>
      </div>
      <div>
        {events.map((event, index) => (
          <RetestEventRow
            key={`${event?.triggerDate || 'event'}-${event?.status || ''}`}
            event={event}
            index={index}
            language={language}
            marketColorMode={marketColorMode}
          />
        ))}
      </div>
    </div>
  );
}

function completedDistributionEvents(events) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => event?.status === 'recovered' || event?.status === 'failed')
    .map((event) => {
      const triggerDate = String(event?.triggerDate || '');
      const retestDepthPct = finiteNumber(event?.retestDepthPct);
      const maxReboundPct = finiteNumber(event?.maxReboundPct);
      if (!distributionDateLabel(triggerDate)
        || retestDepthPct === null
        || maxReboundPct === null) {
        return null;
      }
      return {
        triggerDate,
        retestDepthPct,
        maxReboundPct,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.triggerDate.localeCompare(right.triggerDate));
}

function RetestHistoryDistribution({ events, language, marketColorMode }) {
  const points = React.useMemo(() => completedDistributionEvents(events), [events]);
  if (points.length === 0) return null;

  const width = 328;
  const height = 126;
  const left = 31;
  const right = 26;
  const top = 8;
  const bottom = 25;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = points.flatMap((event) => [
    event.retestDepthPct,
    event.maxReboundPct,
  ]);
  const axisBound = Math.max(
    15,
    Math.ceil(Math.max(...values.map((value) => Math.abs(value))) / 5) * 5 + 15,
  );
  const minimum = -axisBound;
  const maximum = axisBound;
  const span = maximum - minimum;
  const x = (index) => points.length === 1
    ? left + plotWidth / 2
    : left + (index / (points.length - 1)) * plotWidth;
  const y = (value) => top + ((maximum - value) / span) * plotHeight;
  const zeroY = y(0);
  const positiveColor = marketHexColor(1, marketColorMode);
  const negativeColor = marketHexColor(-1, marketColorMode);

  return (
    <div
      className="mx-3 mt-3 min-w-0 scroll-mt-28 overflow-hidden rounded-xl border border-white/[0.065] bg-white/[0.012] px-2.5 pb-2.5 pt-2.5"
      data-ma200-retest-distribution="completed-events"
      data-watchlist-detail-section="ma200-distribution"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="truncate text-[11px] text-white/[0.50]">
          {copy(language, '近5次回踩结果', 'Latest 5 retest results')}
        </div>
        <div className="shrink-0 text-[10px] text-white/[0.30]">
          {copy(
            language,
            `已完成${points.length}次 · 观察中不计`,
            `${points.length} completed · Tracking excluded`,
          )}
        </div>
      </div>

      <svg
        className="mt-1.5 h-[126px] w-full max-w-full"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={copy(
          language,
          '已完成事件的回踩幅度与20日反弹分布',
          'Retest depth and 20-session rebound distribution for completed events',
        )}
        preserveAspectRatio="xMidYMid meet"
      >
        <line
          x1={left}
          x2={width - right}
          y1={zeroY}
          y2={zeroY}
          stroke="rgba(255,255,255,0.22)"
          strokeDasharray="4 4"
          data-ma200-distribution-zero-line="0-percent"
        />
        <text
          x={left - 5}
          y={zeroY + 3.5}
          fill="rgba(255,255,255,0.34)"
          fontSize="10"
          textAnchor="end"
          style={{ fontFamily: NUMBER_FONT }}
        >
          0%
        </text>

        {points.map((event, index) => {
          const pointX = x(index);
          const depthY = y(event.retestDepthPct);
          const reboundY = y(event.maxReboundPct);
          const depthLabelY = depthY + 17 <= height - bottom - 2
            ? depthY + 17
            : depthY - 8;
          return (
            <g key={event.triggerDate} data-ma200-distribution-event={event.triggerDate}>
              <line
                x1={pointX}
                x2={pointX}
                y1={Math.min(depthY, reboundY)}
                y2={Math.max(depthY, reboundY)}
                stroke="rgba(255,255,255,0.11)"
              />
              <circle
                cx={pointX}
                cy={depthY}
                r="3"
                fill={negativeColor}
                data-ma200-distribution-point="retest-depth"
              />
              <text
                x={pointX}
                y={depthLabelY}
                fill={negativeColor}
                fontSize="10"
                textAnchor="middle"
                style={{ fontFamily: NUMBER_FONT }}
                data-ma200-distribution-label="retest-depth"
              >
                {formatPercent(event.retestDepthPct)}
              </text>
              <circle
                cx={pointX}
                cy={reboundY}
                r="3"
                fill={positiveColor}
                data-ma200-distribution-point="max-rebound"
              />
              <text
                x={pointX}
                y={Math.max(12, reboundY - 8)}
                fill={positiveColor}
                fontSize="10"
                textAnchor="middle"
                style={{ fontFamily: NUMBER_FONT }}
                data-ma200-distribution-label="max-rebound"
              >
                {formatPercent(event.maxReboundPct)}
              </text>
              <text
                x={pointX}
                y={height - 7}
                fill="rgba(255,255,255,0.34)"
                fontSize="10"
                textAnchor="middle"
                style={{ fontFamily: NUMBER_FONT }}
              >
                {distributionDateLabel(event.triggerDate)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex items-center justify-center gap-4 text-[10px] text-white/[0.36]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: negativeColor }} />
          {copy(language, '回踩幅度', 'Retest depth')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: positiveColor }} />
          {copy(language, '20日反弹', '20d rebound')}
        </span>
      </div>
    </div>
  );
}

function EmptyState({ language, status }) {
  const message = status === 'insufficient_data'
    ? copy(
        language,
        '日线历史不足，暂时无法形成MA200回踩统计。',
        'There is not enough daily history to calculate MA200 retests.',
      )
    : status === 'no_events'
      ? copy(
          language,
          '近5年没有符合口径的日线MA200回踩。',
          'No qualifying daily MA200 retests were found in the past five years.',
        )
      : copy(
          language,
          '日线MA200回踩历史暂不可用。',
          'Daily MA200 retest history is unavailable.',
        );
  return <div className="px-5 py-9 text-center text-[12px] text-white/[0.44]">{message}</div>;
}

export default function Ma200RetestHistoryCard({
  data,
  language = 'zh',
  marketColorMode,
}) {
  const summary = data?.summary || {};
  const events = Array.isArray(data?.events) ? data.events : [];
  const visibleEvents = events.slice(0, 5);
  const ready = data?.status === 'ready' && events.length > 0;
  const resolvedSampleSize = Math.max(
    0,
    Math.trunc(finiteNumber(summary?.resolvedSampleSize) || 0),
  );
  const recoveredCount = Math.max(
    0,
    Math.trunc(finiteNumber(summary?.recoveredCount) || 0),
  );
  const positiveColor = marketHexColor(1, marketColorMode);
  const negativeColor = marketHexColor(-1, marketColorMode);

  return (
    <section
      className="mt-3 scroll-mt-20 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
      data-watchlist-detail-section="ma200-retest"
      data-watchlist-ma200-retest-history="daily"
    >
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="truncate whitespace-nowrap text-[15px] font-normal text-white/[0.82]">
            {copy(language, '回踩历史（MA200）', 'Retest history (MA200)')}
          </h2>
          <span
            className="inline-flex shrink-0 text-white/[0.30]"
            title={copy(
              language,
              '基于复权收盘价的日线MA200回踩统计',
              'Daily MA200 retests based on adjusted closes',
            )}
            aria-label={copy(
              language,
              '基于复权收盘价的日线MA200回踩统计',
              'Daily MA200 retests based on adjusted closes',
            )}
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>
        <div className="shrink-0 rounded-full border border-white/[0.075] bg-white/[0.025] px-2.5 py-1 text-[10.5px] text-white/[0.42]">
          {copy(language, '近5次回踩', 'Latest 5 retests')}
        </div>
      </div>

      {ready ? (
        <>
          <div
            className="mx-3 mt-3 grid grid-cols-4 divide-x divide-white/[0.055] overflow-hidden rounded-xl border border-white/[0.065] bg-white/[0.012]"
            data-ma200-retest-summary="compact-four-column"
            data-ma200-retest-summary-shell="rounded-inset"
          >
            <SummaryMetric
              label={copy(language, '回踩恢复率', 'Recovery rate')}
              value={formatPercent(summary?.recoveryRatePct, 0, { signed: false })}
              detail={copy(
                language,
                `${recoveredCount}/${resolvedSampleSize}次`,
                `${recoveredCount}/${resolvedSampleSize}`,
              )}
              color={positiveColor}
            />
            <SummaryMetric
              label={copy(language, '平均反弹幅度', 'Avg. rebound')}
              value={formatPercent(summary?.averageMaxReboundPct)}
              detail={copy(language, '20日内', '20 sessions')}
              color={positiveColor}
            />
            <SummaryMetric
              label={copy(language, '平均回踩幅度', 'Avg. depth')}
              value={formatPercent(summary?.averageRetestDepthPct)}
              detail={copy(language, '相对MA200', 'vs MA200')}
              color={negativeColor}
            />
            <SummaryMetric
              label={copy(language, '平均恢复天数', 'Avg. days')}
              value={finiteNumber(summary?.averageRecoveryTradingDays) === null
                ? '—'
                : copy(
                    language,
                    `${finiteNumber(summary.averageRecoveryTradingDays).toFixed(1)}日`,
                    `${finiteNumber(summary.averageRecoveryTradingDays).toFixed(1)}d`,
                  )}
              detail={copy(language, '连续2日站上', '2 closes above')}
              color="rgba(255,255,255,0.82)"
            />
          </div>

          <RetestEventsTable
            events={visibleEvents}
            language={language}
            marketColorMode={marketColorMode}
          />
          <RetestHistoryDistribution
            events={events}
            language={language}
            marketColorMode={marketColorMode}
          />
        </>
      ) : (
        <EmptyState language={language} status={data?.status} />
      )}

      <div className="mt-3 border-t border-white/[0.06] px-4 py-3 text-center text-[10.5px] leading-relaxed text-white/[0.34]">
        {copy(
          language,
          '口径：200个交易日复权收盘均线；回踩后观察20个交易日。观察中事件不计入汇总。仅为历史统计，不代表未来表现。',
          'Basis: 200-session adjusted-close average with a 20-session observation window. Observing events are excluded from summaries. Historical statistics do not predict future results.',
        )}
        {data?.asOfDate ? (
          <span className="mt-1 block tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
            {copy(
              language,
              `数据截至 ${formatDate(data.asOfDate, language)}`,
              `Data through ${formatDate(data.asOfDate, language)}`,
            )}
          </span>
        ) : null}
      </div>
    </section>
  );
}
