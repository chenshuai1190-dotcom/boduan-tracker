import React from 'react';
import StockReportModal from './StockReportModal.jsx';
import './Ma200RetestDetailModal.css';
import { deriveMa200RetestDetail } from '../lib/ma200RetestDetail.js';
import { marketHexColor } from '../lib/marketColorMode.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const MA_LINE_COLOR = '#60a5fa';
const ACCENT_COLOR = '#b4b4bc';

function copy(language, zh, en) {
  return language === 'en' ? en : zh;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function currencyPrefix(currency) {
  if (currency === 'CNY') return '¥';
  if (currency === 'HKD') return 'HK$';
  return '$';
}

function formatPrice(value, currency = 'USD', digits = 2) {
  const number = finiteNumber(value);
  return number === null ? '—' : `${currencyPrefix(currency)}${number.toFixed(digits)}`;
}

function formatPercent(value, digits = 1) {
  const number = finiteNumber(value);
  if (number === null) return '—';
  return `${number >= 0 ? '+' : ''}${number.toFixed(digits)}%`;
}

function valueColor(value, marketColorMode, fallback = 'rgba(255,255,255,0.88)') {
  const number = finiteNumber(value);
  if (number === null || number === 0) return fallback;
  return marketHexColor(number > 0 ? 1 : -1, marketColorMode);
}

function statusLabel({
  status,
  recoveryDays,
  observationDays,
  language,
}) {
  if (status === 'recovered') {
    return copy(language, `${observationDays}日已恢复`, `Recovered in ${observationDays}d`);
  }
  if (status === 'failed') {
    return copy(language, `${observationDays}日未恢复`, `Not recovered in ${observationDays}d`);
  }
  if (finiteNumber(recoveryDays) !== null) {
    return copy(language, '已恢复 · 观察中', 'Recovered · watching');
  }
  return copy(language, `${observationDays}日观察中`, `${observationDays}d watching`);
}

function statusColor(status, recoveryDays, marketColorMode) {
  if (status === 'recovered' || finiteNumber(recoveryDays) !== null) {
    return marketHexColor(1, marketColorMode);
  }
  if (status === 'failed') return marketHexColor(-1, marketColorMode);
  return ACCENT_COLOR;
}

function buildPath(points, xForIndex, yForValue, key) {
  return points
    .map((point, index) => {
      const value = finiteNumber(point?.[key]);
      if (value === null) return '';
      return `${index === 0 ? 'M' : 'L'} ${xForIndex(index).toFixed(2)} ${yForValue(value).toFixed(2)}`;
    })
    .filter(Boolean)
    .join(' ');
}

function Metric({ label, value, detail, color = 'rgba(255,255,255,0.88)' }) {
  return (
    <div className="stock-retest-metric">
      <div className="stock-retest-metric-label">{label}</div>
      <div
        className="stock-retest-metric-value"
        style={{ color, fontFamily: NUMBER_FONT }}
      >
        {value}
      </div>
      <div className="stock-retest-metric-note">
        {detail}
      </div>
    </div>
  );
}

function RetestChart({
  currency,
  detail,
  language,
  marketColorMode,
  symbol,
}) {
  const chartRootRef = React.useRef(null);
  const series = Array.isArray(detail?.series) ? detail.series : [];
  const lowestCloseIndex = Math.max(
    0,
    series.findIndex((point) => point.date === detail?.lowestClose?.date),
  );
  const [selectedIndex, setSelectedIndex] = React.useState(lowestCloseIndex);

  React.useEffect(() => {
    setSelectedIndex(lowestCloseIndex);
  }, [detail?.lowestClose?.date, lowestCloseIndex]);

  React.useEffect(() => {
    if (selectedIndex === null) return undefined;
    const clearOutsideChart = (event) => {
      if (chartRootRef.current?.contains(event.target)) return;
      setSelectedIndex(null);
    };
    document.addEventListener('pointerdown', clearOutsideChart, true);
    return () => document.removeEventListener('pointerdown', clearOutsideChart, true);
  }, [selectedIndex]);

  if (series.length < 2) {
    return (
      <div className="stock-retest-chart-empty">
        {copy(language, '暂无完整走势', 'Complete path unavailable')}
      </div>
    );
  }

  const width = 354;
  const height = 256;
  const padding = { left: 8, right: 8, top: 20, bottom: 30 };
  const priceColor = valueColor(series.at(-1).close - series[0].close, marketColorMode);
  const values = series.flatMap((point) => [finiteNumber(point.close), finiteNumber(point.ma200)])
    .filter((value) => value !== null);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const valuePadding = Math.max((maximum - minimum) * 0.1, 0.5);
  const domainMin = minimum - valuePadding;
  const domainMax = maximum + valuePadding;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xForIndex = (index) => padding.left + (index / (series.length - 1)) * plotWidth;
  const yForValue = (value) => (
    padding.top + ((domainMax - value) / Math.max(domainMax - domainMin, 1)) * plotHeight
  );
  const closePath = buildPath(series, xForIndex, yForValue, 'close');
  const maPath = buildPath(series, xForIndex, yForValue, 'ma200');
  const triggerIndex = series.findIndex((point) => point.relativeTradingDay === 0);
  const day20Index = series.findIndex((point) => point.relativeTradingDay === 20);
  const day60Index = series.findIndex((point) => point.relativeTradingDay === 60);
  const selectedPoint = Number.isInteger(selectedIndex) ? series[selectedIndex] : null;
  const selectedRelativePct = selectedPoint && detail?.trigger?.close > 0
    ? ((selectedPoint.close / detail.trigger.close) - 1) * 100
    : null;
  const selectedMaDistancePct = selectedPoint?.ma200 > 0
    ? ((selectedPoint.close / selectedPoint.ma200) - 1) * 100
    : null;

  const selectNearestPoint = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const relativeX = ((event.clientX - rect.left) / rect.width) * width;
    const index = Math.round(((relativeX - padding.left) / plotWidth) * (series.length - 1));
    setSelectedIndex(Math.max(0, Math.min(series.length - 1, index)));
  };

  return (
    <div
      ref={chartRootRef}
      className="stock-retest-chart"
      data-ma200-retest-detail-chart="true"
    >
      {selectedPoint && (
        <div
          className="stock-retest-tooltip"
          data-ma200-retest-detail-tooltip={selectedPoint.date}
        >
          <div className="flex items-center justify-between gap-2 text-[10.5px] text-white/[0.47]">
            <span>{formatDate(selectedPoint.date, language)}</span>
            <span className="tabular-nums">
              {selectedPoint.relativeTradingDay >= 0
                ? `T+${selectedPoint.relativeTradingDay}`
                : `T${selectedPoint.relativeTradingDay}`}
            </span>
          </div>
          <div className="mt-[7px] flex items-end justify-between gap-2">
            <span className="text-[10.5px] text-white/[0.48]">
              {copy(language, '收盘价', 'Close')}
            </span>
            <span
              className="text-[17px] font-medium leading-none text-white/[0.91] tabular-nums"
              style={{ fontFamily: NUMBER_FONT }}
            >
              {formatPrice(selectedPoint.close, currency)}
            </span>
          </div>
          <div className="mt-[7px] flex items-center justify-between gap-2 text-[10.5px] tabular-nums">
            <span className="text-white/[0.39]">{copy(language, '较触发', 'vs trigger')}</span>
            <span style={{ color: valueColor(selectedRelativePct, marketColorMode) }}>
              {formatPercent(selectedRelativePct)}
            </span>
          </div>
          <div className="mt-[5px] flex items-center justify-between gap-2 text-[10.5px] tabular-nums">
            <span className="text-white/[0.39]">MA200 {formatPrice(selectedPoint.ma200, currency)}</span>
            <span style={{ color: valueColor(selectedMaDistancePct, marketColorMode) }}>
              {formatPercent(selectedMaDistancePct)}
            </span>
          </div>
        </div>
      )}

      <svg
        className="h-full w-full touch-pan-y select-none"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={copy(
          language,
          `${symbol} 趋势重测触发后的完整日线走势`,
          `${symbol} complete daily path after the retest trigger`,
        )}
        onPointerDown={selectNearestPoint}
        onPointerMove={(event) => {
          if (event.buttons === 1 || event.pointerType === 'touch') selectNearestPoint(event);
        }}
      >
        <defs>
          <linearGradient id="ma200-retest-detail-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={priceColor} stopOpacity="0.12" />
            <stop offset="100%" stopColor={priceColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.2, 0.5, 0.8].map((ratio) => {
          const y = padding.top + ratio * plotHeight;
          return (
            <line
              key={ratio}
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.065)"
              strokeDasharray="3 6"
            />
          );
        })}

        {[triggerIndex, day20Index, day60Index].filter((index) => index >= 0).map((index) => (
          <line
            key={series[index].relativeTradingDay}
            x1={xForIndex(index)}
            x2={xForIndex(index)}
            y1={padding.top}
            y2={height - padding.bottom}
            stroke="rgba(255,255,255,0.095)"
            strokeDasharray="3 5"
          />
        ))}

        <path
          d={`${closePath} L ${xForIndex(series.length - 1)} ${height - padding.bottom} L ${xForIndex(0)} ${height - padding.bottom} Z`}
          fill="url(#ma200-retest-detail-area)"
        />
        <path d={maPath} fill="none" stroke={MA_LINE_COLOR} strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
        <path d={closePath} fill="none" stroke={priceColor} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />

        {selectedPoint && (
          <>
            <line
              x1={xForIndex(selectedIndex)}
              x2={xForIndex(selectedIndex)}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="rgba(255,255,255,0.22)"
              strokeDasharray="2 4"
            />
            <circle
              cx={xForIndex(selectedIndex)}
              cy={yForValue(selectedPoint.close)}
              r="5"
              fill="#101112"
              stroke={selectedPoint.date === detail?.lowestClose?.date ? ACCENT_COLOR : priceColor}
              strokeWidth="2"
            />
          </>
        )}

        {[
          { index: 0, label: 'T-5', anchor: 'start', xOffset: 0 },
          { index: triggerIndex, label: 'T0', anchor: 'middle', xOffset: 8 },
          { index: day20Index, label: 'T+20', anchor: 'middle', xOffset: 0 },
          { index: day60Index, label: 'T+60', anchor: 'end', xOffset: 0 },
        ].filter((item) => item.index >= 0).map((item) => (
          <text
            key={item.label}
            x={xForIndex(item.index) + item.xOffset}
            y={height - 10}
            fill="rgba(255,255,255,0.36)"
            fontSize="10"
            textAnchor={item.anchor}
          >
            {item.label}
          </text>
        ))}
      </svg>

      <div className="pointer-events-none absolute bottom-[31px] right-[13px] flex items-center gap-[11px] text-[10px] text-white/[0.42]">
        <span className="flex items-center gap-1.5">
          <i className="h-[2px] w-[13px] rounded-full" style={{ background: priceColor }} />
          {copy(language, '收盘价', 'Close')}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-[2px] w-[13px] rounded-full" style={{ background: MA_LINE_COLOR }} />
          MA200 {copy(language, '（日）', '(daily)')}
        </span>
      </div>
    </div>
  );
}

export default function Ma200RetestDetailModal({
  currency = 'USD',
  event,
  language = 'zh',
  marketColorMode,
  observationTradingDays = 60,
  recentReboundTradingDays = 20,
  symbol,
  onClose,
}) {
  const detail = React.useMemo(
    () => deriveMa200RetestDetail(event, observationTradingDays),
    [event, observationTradingDays],
  );
  const recentStatus = ['recovered', 'failed', 'observing'].includes(event?.recentReboundStatus)
    ? event.recentReboundStatus
    : 'observing';
  const fullStatus = ['recovered', 'failed', 'observing'].includes(event?.status)
    ? event.status
    : 'observing';
  const latestDate = detail?.endpoint?.date || detail?.asOfDate || '';

  return (
    <StockReportModal
      title={`${symbol} · ${copy(language, '重测详情', 'Retest details')}`}
      closeLabel={copy(language, '关闭重测详情', 'Close retest details')}
      onClose={onClose}
      panelClassName="stock-retest-modal"
    >
      <div className="min-w-0" data-ma200-retest-detail-modal={event?.triggerDate || ''}>
        <div className="stock-retest-overview">
          <div className="min-w-0">
            <div
              className="stock-retest-trigger"
              data-ma200-retest-detail-trigger={event?.triggerDate || ''}
            >
              {formatDate(event?.triggerDate, language)} {copy(language, '触发', 'trigger')}
            </div>
            <div className="mt-1 text-[10px] text-white/[0.37]">
              {copy(
                language,
                `日线 MA200 · 固定观察 ${observationTradingDays} 个交易日`,
                `Daily MA200 · Fixed ${observationTradingDays}-session window`,
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div
              className="text-[11px] font-medium"
              style={{
                color: statusColor(
                  recentStatus,
                  event?.recentRecoveryTradingDays,
                  marketColorMode,
                ),
              }}
            >
              {statusLabel({
                status: recentStatus,
                recoveryDays: event?.recentRecoveryTradingDays,
                observationDays: recentReboundTradingDays,
                language,
              })}
            </div>
            <div
              className="mt-1 text-[10px]"
              style={{
                color: statusColor(fullStatus, event?.recoveryTradingDays, marketColorMode),
                opacity: 0.66,
              }}
            >
              {statusLabel({
                status: fullStatus,
                recoveryDays: event?.recoveryTradingDays,
                observationDays: observationTradingDays,
                language,
              })}
            </div>
          </div>
        </div>

        {detail ? (
          <>
            <RetestChart
              currency={currency}
              detail={detail}
              language={language}
              marketColorMode={marketColorMode}
              symbol={symbol}
            />

            <div className="stock-retest-metrics">
              <Metric
                label={copy(language, '触发收盘', 'Trigger close')}
                value={formatPrice(detail.trigger?.close, currency)}
                detail={`${formatDate(detail.trigger?.date, language)} · MA200 ${formatPrice(detail.trigger?.ma200, currency)}`}
                color={ACCENT_COLOR}
              />
              <Metric
                label={copy(language, '最低收盘', 'Lowest close')}
                value={formatPrice(detail.lowestClose?.close, currency)}
                detail={`T+${detail.lowestClose?.relativeTradingDay} · ${formatDate(detail.lowestClose?.date, language)} · ${formatPercent(detail.lowestClose?.fromTriggerPct)}`}
                color={valueColor(detail.lowestClose?.fromTriggerPct, marketColorMode)}
              />
              <Metric
                label={copy(language, '距 MA200 最深', 'Deepest vs MA200')}
                value={formatPercent(detail.deepestMa?.distancePct)}
                detail={`${formatDate(detail.deepestMa?.date, language)} · MA200 ${formatPrice(detail.deepestMa?.ma200, currency)}`}
                color={valueColor(detail.deepestMa?.distancePct, marketColorMode)}
              />
              <Metric
                label={copy(
                  language,
                  `第 ${observationTradingDays} 日结果`,
                  `Session ${observationTradingDays} result`,
                )}
                value={detail.endpoint
                  ? formatPercent(detail.endpoint.returnPct)
                  : copy(language, '观察中', 'Watching')}
                detail={detail.endpoint
                  ? `${formatPrice(detail.endpoint.close, currency)} · ${formatDate(detail.endpoint.date, language)}`
                  : copy(
                      language,
                      `已观察 ${event?.observedTradingDays || 0}/${observationTradingDays} 日`,
                      `${event?.observedTradingDays || 0}/${observationTradingDays} sessions observed`,
                    )}
                color={detail.endpoint
                  ? valueColor(detail.endpoint.returnPct, marketColorMode)
                  : ACCENT_COLOR}
              />
            </div>
          </>
        ) : (
          <div className="stock-retest-empty">
            {copy(
              language,
              '完整重测走势暂不可用，不补造缺失数据。',
              'The complete retest path is unavailable; missing data is not estimated.',
            )}
          </div>
        )}

        {latestDate ? (
          <div className="stock-retest-asof">
            {copy(
              language,
              `数据截至 ${formatDate(latestDate, language)}`,
              `Data through ${formatDate(latestDate, language)}`,
            )}
          </div>
        ) : null}
      </div>
    </StockReportModal>
  );
}
