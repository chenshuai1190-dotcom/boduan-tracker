import React from 'react';
import Ma200RetestDetailModal from './Ma200RetestDetailModal.jsx';
import { marketHexColor } from '../lib/marketColorMode.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const TABLE_GRID = 'grid-cols-[15px_62px_42px_minmax(76px,1fr)_47px_30px_44px]';
const DEFAULT_RECENT_REBOUND_DAYS = 20;
const DEFAULT_QUALIFICATION_VALID_TRADING_DAYS = 60;
const DEFAULT_OBSERVATION_TRADING_DAYS = 60;

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
  const match = String(value || '').match(/^(\d{4})-(\d{2})-\d{2}$/);
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
      <div className="truncate whitespace-nowrap text-[11px] leading-tight text-white/[0.50]">
        {label}
      </div>
      <div
        className="mt-1.5 truncate whitespace-nowrap text-[14px] font-normal leading-none tabular-nums"
        style={{ color, fontFamily: NUMBER_FONT }}
      >
        {value}
      </div>
      <div className="mt-1 truncate whitespace-nowrap text-[11px] leading-tight text-white/[0.40]">
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
      className="mx-auto inline-flex max-w-[44px] items-center justify-center truncate whitespace-nowrap rounded-md px-1.5 py-1 text-center text-[10px]"
      style={{ color, backgroundColor: `${color}12` }}
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
  onOpenDetail,
  recentReboundTradingDays,
}) {
  const recoveryDays = finiteNumber(event?.recentRecoveryTradingDays);
  const status = ['recovered', 'failed', 'observing'].includes(event?.recentReboundStatus)
    ? event.recentReboundStatus
    : 'observing';
  const detailAvailable = Array.isArray(event?.detailSeries) && event.detailSeries.length >= 2;

  return (
    <button
      type="button"
      onClick={() => onOpenDetail?.(event)}
      disabled={!detailAvailable}
      className={`grid min-h-[58px] w-full min-w-0 ${TABLE_GRID} items-center border-t border-white/[0.045] text-left transition-colors enabled:active:bg-white/[0.035] disabled:cursor-default`}
      aria-label={copy(
        language,
        `查看 ${formatDate(event?.triggerDate, language)} 重测详情`,
        `View retest details for ${formatDate(event?.triggerDate, language)}`,
      )}
      data-ma200-retest-event={event?.triggerDate || ''}
      data-ma200-retest-row="compact-table"
      data-ma200-retest-detail-available={detailAvailable ? 'true' : 'false'}
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
          color: valueColor(event?.recentRetestDepthPct, marketColorMode),
          fontFamily: NUMBER_FONT,
        }}
      >
        {formatPercent(event?.recentRetestDepthPct)}
      </span>
      <div className="min-w-0 px-0.5">
        <RetestMiniChart
          rows={event?.series}
          lowDate={event?.recentLowDate}
          language={language}
          marketColorMode={marketColorMode}
        />
      </div>
      <span
        className="truncate px-0.5 text-center text-[10px] tabular-nums"
        style={{
          color: valueColor(event?.recentMaxReboundPct, marketColorMode),
          fontFamily: NUMBER_FONT,
        }}
      >
        {formatPercent(event?.recentMaxReboundPct)}
      </span>
      <span
        className="truncate px-0.5 text-center text-[10px] tabular-nums text-white/[0.52]"
        style={{ fontFamily: NUMBER_FONT }}
      >
        {recoveryDays === null
          ? status === 'failed' ? `>${recentReboundTradingDays}` : '—'
          : copy(language, `${recoveryDays}`, `${recoveryDays}`)}
      </span>
      <EventStatus
        status={status}
        language={language}
        recoveryDays={recoveryDays}
        marketColorMode={marketColorMode}
      />
    </button>
  );
}

function RetestEventsTable({
  events,
  language,
  marketColorMode,
  onOpenDetail,
  recentReboundTradingDays,
}) {
  return (
    <div
      className="mx-3 mt-2 min-w-0 overflow-hidden"
      data-ma200-retest-table="compact-seven-column"
    >
      <div
        className={`grid min-h-[40px] min-w-0 ${TABLE_GRID} items-center text-center text-[10px] leading-[1.15] text-white/[0.34]`}
        data-ma200-retest-table-header="seven-columns"
      >
        <span className="px-0.5">#</span>
        <span className="px-0.5">{copy(language, '触发日期', 'Date')}</span>
        <span className="px-0.5" title={copy(language, '下探幅度', 'Retest depth')}>
          {copy(language, '下探', 'Depth')}
        </span>
        <span
          className="px-0.5"
          title={copy(language, '迷你V形日线MA200图', 'Mini daily MA200 V chart')}
          aria-label={copy(language, '走势', 'Path')}
        />
        <span
          className="px-0.5"
          title={copy(
            language,
            `${recentReboundTradingDays}日内最深下探后的最大反弹`,
            `Maximum rebound after the deepest retest within ${recentReboundTradingDays} sessions`,
          )}
        >
          {copy(
            language,
            `${recentReboundTradingDays}日反弹`,
            `${recentReboundTradingDays}d rebound`,
          )}
        </span>
        <span className="px-0.5" title={copy(language, '反弹天数', 'Rebound days')}>
          {copy(language, '天数', 'Days')}
        </span>
        <span
          className="px-0.5"
          title={copy(
            language,
            `${recentReboundTradingDays}日观察结果`,
            `${recentReboundTradingDays}-session result`,
          )}
        >
          {copy(language, '结果', 'Result')}
        </span>
      </div>
      <div>
        {events.map((event, index) => (
          <RetestEventRow
            key={`${event?.triggerDate || 'event'}-${event?.status || ''}`}
            event={event}
            index={index}
            language={language}
            marketColorMode={marketColorMode}
            onOpenDetail={onOpenDetail}
            recentReboundTradingDays={recentReboundTradingDays}
          />
        ))}
      </div>
    </div>
  );
}

function completedForwardReturnEvents(events, observationTradingDays) {
  return (Array.isArray(events) ? events : [])
    .map((event) => {
      const triggerDate = String(event?.triggerDate || '');
      const forwardReturnEndDate = String(event?.forwardReturnEndDate || '');
      const observedTradingDays = finiteNumber(event?.observedTradingDays);
      const forwardReturnPct = finiteNumber(event?.forwardReturnPct);
      const resolved = event?.status === 'recovered' || event?.status === 'failed';
      if (!distributionDateLabel(triggerDate)
        || !formatDate(forwardReturnEndDate, 'zh').match(/^\d{4}\/\d{2}\/\d{2}$/)
        || !resolved
        || observedTradingDays === null
        || observedTradingDays < observationTradingDays
        || forwardReturnPct === null) {
        return null;
      }
      return {
        triggerDate,
        forwardReturnEndDate,
        forwardReturnPct,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.triggerDate.localeCompare(right.triggerDate));
}

function RetestHistoryDistribution({
  events,
  language,
  marketColorMode,
  observationTradingDays,
}) {
  const points = React.useMemo(
    () => completedForwardReturnEvents(events, observationTradingDays),
    [events, observationTradingDays],
  );
  if (points.length === 0) return null;

  const width = 328;
  const height = 126;
  const left = 31;
  const right = 26;
  const top = 20;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = points.map((event) => event.forwardReturnPct);
  const axisBound = Math.max(
    10,
    Math.ceil(Math.max(...values.map((value) => Math.abs(value))) / 5) * 5 + 10,
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
      className="mx-3 mt-3 min-w-0 scroll-mt-28 overflow-hidden rounded-xl bg-white/[0.018] px-2.5 pb-2.5 pt-2.5"
      data-ma200-retest-distribution="forward-return"
      data-watchlist-detail-section="ma200-distribution"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="truncate text-[11px] text-white/[0.50]">
          {copy(
            language,
            `触发后${observationTradingDays}日涨跌幅`,
            `${observationTradingDays}-session return after trigger`,
          )}
        </div>
        <div className="shrink-0 text-[11px] text-white/[0.40]">
          {copy(
            language,
            `${observationTradingDays}日样本 ${points.length} 次 · 未满${observationTradingDays}日不计`,
            `${points.length} ${observationTradingDays}-session samples · Under ${observationTradingDays} excluded`,
          )}
        </div>
      </div>

      <svg
        className="mt-1.5 h-[126px] w-full max-w-full"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={copy(
          language,
          `已完成事件从触发日收盘至第${observationTradingDays}个交易日收盘的涨跌幅`,
          `Return from the trigger close to the close of session ${observationTradingDays}`,
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
          const returnY = y(event.forwardReturnPct);
          const pointColor = event.forwardReturnPct > 0
            ? positiveColor
            : event.forwardReturnPct < 0
              ? negativeColor
              : 'rgba(255,255,255,0.52)';
          const stemEndY = event.forwardReturnPct > 0
            ? Math.min(zeroY, returnY + 4.5)
            : event.forwardReturnPct < 0
              ? Math.max(zeroY, returnY - 4.5)
              : zeroY;
          const returnLabelY = event.forwardReturnPct >= 0
            ? Math.max(12, returnY - 9)
            : Math.min(height - 20, returnY + 16);
          const returnLabelAnchor = index === 0
            ? 'start'
            : index === points.length - 1
              ? 'end'
              : 'middle';
          return (
            <g
              key={event.triggerDate}
              data-ma200-distribution-event={event.triggerDate}
              data-ma200-forward-return-end-date={event.forwardReturnEndDate}
            >
              <title>
                {copy(
                  language,
                  `${formatDate(event.triggerDate, language)} 至 ${formatDate(event.forwardReturnEndDate, language)}：${formatPercent(event.forwardReturnPct)}`,
                  `${formatDate(event.triggerDate, language)} to ${formatDate(event.forwardReturnEndDate, language)}: ${formatPercent(event.forwardReturnPct)}`,
                )}
              </title>
              <line
                x1={pointX}
                x2={pointX}
                y1={zeroY}
                y2={stemEndY}
                stroke={pointColor}
                strokeOpacity="0.32"
                strokeWidth="1.25"
                data-ma200-distribution-stem="stops-before-point"
              />
              <circle
                cx={pointX}
                cy={returnY}
                r="3.5"
                fill={pointColor}
                data-ma200-distribution-point="forward-return"
              />
              <text
                x={pointX}
                y={returnLabelY}
                fill={pointColor}
                fontSize="10"
                textAnchor={returnLabelAnchor}
                stroke="#0b0f14"
                strokeWidth="2.5"
                strokeLinejoin="round"
                style={{ fontFamily: NUMBER_FONT, paintOrder: 'stroke' }}
                data-ma200-distribution-label="forward-return"
              >
                {formatPercent(event.forwardReturnPct)}
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
    </div>
  );
}

function CurrentCycleStatus({
  cycle,
  language,
  marketColorMode,
}) {
  const state = ['unarmed', 'armed', 'waiting_reset'].includes(cycle?.state)
    ? cycle.state
    : '';
  if (!state) return null;

  const status = String(cycle?.status || '');
  const requiredPreparedTradingDays = Math.max(
    1,
    Math.trunc(finiteNumber(cycle?.requiredPreparedTradingDays) || 5),
  );
  const preparedTradingDays = Math.max(
    0,
    Math.min(
      requiredPreparedTradingDays,
      Math.trunc(finiteNumber(cycle?.preparedTradingDays) || 0),
    ),
  );
  const currentDistancePct = finiteNumber(cycle?.currentDistancePct);
  const cycleLabel = state === 'armed'
    ? copy(language, '重测资格已激活', 'Retest qualification active')
    : state === 'waiting_reset'
      ? copy(language, '等待趋势重置', 'Waiting for trend reset')
      : copy(language, '未激活', 'Not active');
  const statusLabel = status === 'long_breakdown'
    ? copy(language, '长期破位', 'Long breakdown')
    : status === 'retest_observing'
      ? copy(language, '重测观察中', 'Retest observation')
    : status === 'repairing'
      ? copy(language, '修复中', 'Repairing')
      : status === 'reset_confirming'
        ? copy(language, '趋势重置确认中', 'Reset confirmation')
        : status === 'waiting_retest'
          ? copy(language, '等待下一次重测', 'Waiting for retest')
          : status === 'qualifying'
            ? copy(language, '激活确认中', 'Qualification in progress')
            : copy(language, '等待激活', 'Waiting to activate');
  const guidance = state === 'armed'
    ? copy(
        language,
        '资格有效期内首次收盘≤MA200，才生成下一次重测事件',
        'The first close at or below MA200 while qualified creates the next retest event',
      )
    : state === 'waiting_reset'
      ? copy(
          language,
          '需重新连续5日收盘高出MA200至少3%',
          'Needs 5 consecutive closes at least 3% above MA200',
        )
      : copy(
          language,
          '等待连续5日收盘高出MA200至少3%',
          'Waiting for 5 consecutive closes at least 3% above MA200',
        );
  const statusColor = status === 'long_breakdown'
    ? valueColor(-1, marketColorMode)
    : status === 'waiting_retest'
      ? valueColor(1, marketColorMode)
      : 'rgba(255,255,255,0.72)';

  return (
    <div
      className="mx-3 mt-3 rounded-xl bg-white/[0.018] px-3 py-2.5"
      data-ma200-current-cycle={state}
      data-ma200-current-cycle-status={status}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0 truncate text-[11px] text-white/[0.40]">
          {copy(language, '当前周期', 'Current cycle')}
          {cycle?.latestTriggerDate ? ` · ${formatDate(cycle.latestTriggerDate, language)}` : ''}
        </div>
        <div className="shrink-0 text-[12px] text-[#e4aa4f]">{cycleLabel}</div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <div className="text-[11px] text-white/[0.40]">
            {copy(language, '当前状态', 'Current status')}
          </div>
          <div
            className="mt-1 truncate text-[12px] font-normal"
            style={{ color: statusColor }}
          >
            {statusLabel}
          </div>
        </div>
        <div className="min-w-0 text-center">
          <div className="text-[11px] text-white/[0.40]">
            {copy(language, '距MA200', 'vs MA200')}
          </div>
          <div
            className="mt-1 text-[12px] tabular-nums"
            style={{
              color: valueColor(currentDistancePct, marketColorMode),
              fontFamily: NUMBER_FONT,
            }}
          >
            {formatPercent(currentDistancePct)}
          </div>
        </div>
        <div className="min-w-0 text-right">
          <div className="text-[11px] text-white/[0.40]">
            {copy(language, '重置进度', 'Reset progress')}
          </div>
          <div
            className="mt-1 text-[12px] tabular-nums text-white/[0.72]"
            style={{ fontFamily: NUMBER_FONT }}
          >
            {preparedTradingDays}/{requiredPreparedTradingDays}
            {copy(language, '日', 'd')}
          </div>
        </div>
      </div>

      <div className="mt-2 text-[11px] leading-4 text-white/[0.40]">
        {guidance}
      </div>
    </div>
  );
}

function EmptyState({ language, status }) {
  const message = status === 'insufficient_data'
    ? copy(
        language,
        '日线历史不足，暂时无法形成MA200趋势重测统计。',
        'There is not enough daily history to calculate MA200 retests.',
      )
    : status === 'no_events'
      ? copy(
          language,
          '近5年没有符合口径的日线MA200趋势重测事件。',
          'No qualifying daily MA200 retests were found in the past five years.',
        )
      : copy(
          language,
          '日线MA200趋势重测历史暂不可用。',
          'Daily MA200 retest history is unavailable.',
        );
  return <div className="px-5 py-9 text-center text-[12px] text-white/[0.44]">{message}</div>;
}

export default function Ma200RetestHistoryCard({
  currency = 'USD',
  data,
  initialDetailDate = '',
  language = 'zh',
  marketColorMode,
  symbol = '',
}) {
  const summary = data?.summary || {};
  const events = Array.isArray(data?.events) ? data.events : [];
  const visibleEvents = events.slice(0, 5);
  const [selectedTriggerDate, setSelectedTriggerDate] = React.useState(initialDetailDate);
  const selectedEvent = visibleEvents.find(
    (event) => event?.triggerDate === selectedTriggerDate,
  ) || null;
  const ready = data?.status === 'ready' && events.length > 0;
  const recentReboundTradingDays = Math.max(
    1,
    Math.trunc(
      finiteNumber(data?.recentReboundTradingDays) || DEFAULT_RECENT_REBOUND_DAYS,
    ),
  );
  const qualificationValidTradingDays = Math.max(
    1,
    Math.trunc(
      finiteNumber(data?.qualificationValidTradingDays)
        || DEFAULT_QUALIFICATION_VALID_TRADING_DAYS,
    ),
  );
  const observationTradingDays = Math.max(
    1,
    Math.trunc(
      finiteNumber(data?.observationTradingDays) || DEFAULT_OBSERVATION_TRADING_DAYS,
    ),
  );
  const resolvedSampleSize = Math.max(
    0,
    Math.trunc(finiteNumber(summary?.resolvedSampleSize) || 0),
  );
  const recoveredCount = Math.max(
    0,
    Math.trunc(finiteNumber(summary?.recoveredCount) || 0),
  );
  const maxReboundSampleSize = Math.max(
    0,
    Math.trunc(finiteNumber(summary?.maxReboundSampleSize) || 0),
  );
  const positiveColor = marketHexColor(1, marketColorMode);
  const negativeColor = marketHexColor(-1, marketColorMode);

  React.useEffect(() => {
    setSelectedTriggerDate(initialDetailDate);
  }, [initialDetailDate, symbol]);

  React.useEffect(() => {
    if (
      !selectedTriggerDate
      || selectedEvent
      || selectedTriggerDate === initialDetailDate
    ) return;
    setSelectedTriggerDate('');
  }, [initialDetailDate, selectedEvent, selectedTriggerDate]);

  return (
    <>
      <section
        className="mt-3 scroll-mt-20 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0c0e] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
        data-watchlist-detail-section="ma200-retest"
        data-watchlist-ma200-retest-history="daily"
      >
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3.5">
        <div className="min-w-0">
          <h2
            className="truncate whitespace-nowrap text-[15px] font-normal text-white/[0.82]"
            title={copy(
              language,
              `基于拆股复权收盘价（不含现金分红）的日线MA200；连续5日高出均线至少3%后，资格在未来${qualificationValidTradingDays}个交易日内有效，首次触及才触发；逐次路径固定${recentReboundTradingDays}日，平均反弹为${observationTradingDays}日内最大反弹，底图为触发日至第${observationTradingDays}日终点收益`,
              `Split-adjusted daily MA200 without dividends; after 5 consecutive closes at least 3% above MA200, qualification remains valid for the next ${qualificationValidTradingDays} sessions and the first touch triggers the event. Event paths are fixed at ${recentReboundTradingDays} sessions; average rebound is the ${observationTradingDays}-session maximum and the chart shows the endpoint return on session ${observationTradingDays}`,
            )}
          >
            {copy(language, 'MA200 趋势重测', 'MA200 trend retests')}
          </h2>
        </div>
        <div className="shrink-0 rounded-full bg-white/[0.045] px-2.5 py-1 text-[10.5px] text-white/[0.42]">
          {copy(language, '近5次重测', 'Latest 5 retests')}
        </div>
      </div>

      <CurrentCycleStatus
        cycle={data?.currentCycle}
        language={language}
        marketColorMode={marketColorMode}
      />

      {ready ? (
        <>
          <div
            className="mx-3 mt-3 grid grid-cols-4 gap-1 overflow-hidden rounded-xl bg-white/[0.018] px-1"
            data-ma200-retest-summary="compact-four-column"
            data-ma200-retest-summary-shell="borderless-inset"
          >
            <SummaryMetric
              label={copy(
                language,
                `${recentReboundTradingDays}日恢复率`,
                `${recentReboundTradingDays}d recovery`,
              )}
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
              detail={copy(
                language,
                `60日 · ${maxReboundSampleSize}次`,
                `60d · ${maxReboundSampleSize}`,
              )}
              color={positiveColor}
            />
            <SummaryMetric
              label={copy(language, '平均下探幅度', 'Avg. depth')}
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
            onOpenDetail={(event) => setSelectedTriggerDate(event?.triggerDate || '')}
            recentReboundTradingDays={recentReboundTradingDays}
          />
          <RetestHistoryDistribution
            events={visibleEvents}
            language={language}
            marketColorMode={marketColorMode}
            observationTradingDays={observationTradingDays}
          />
        </>
      ) : (
        <EmptyState language={language} status={data?.status} />
      )}

      {data?.asOfDate ? (
        <div
          className="px-4 pb-4 pt-3 text-center text-[11px] tabular-nums text-white/[0.40]"
          style={{ fontFamily: NUMBER_FONT }}
          data-ma200-retest-as-of-date={data.asOfDate}
        >
          {copy(
            language,
            `数据截至 ${formatDate(data.asOfDate, language)}`,
            `Data through ${formatDate(data.asOfDate, language)}`,
          )}
        </div>
      ) : null}
      </section>

      {selectedEvent ? (
        <Ma200RetestDetailModal
          currency={currency}
          event={selectedEvent}
          language={language}
          marketColorMode={marketColorMode}
          observationTradingDays={observationTradingDays}
          recentReboundTradingDays={recentReboundTradingDays}
          symbol={symbol}
          onClose={() => setSelectedTriggerDate('')}
        />
      ) : null}
    </>
  );
}
