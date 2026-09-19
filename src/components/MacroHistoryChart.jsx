import React from 'react';
import { PriceChart } from '../pages/WatchlistStockDetailPage.jsx';
import { formatMacroChange, formatMacroValue, sliceMacroHistory } from '../macro/macroFormat.js';
import { formatMacroDate, macroChangeColor, macroMetricLabel } from '../macro/macroPresentation.js';

const EMPTY_ROWS = Object.freeze([]);
const NEUTRAL_LINE = '#b2b2bb';

function observationChange(point, previousPoint, metric) {
  if (!previousPoint || !Number.isFinite(point?.close) || !Number.isFinite(previousPoint.close)) return null;
  const difference = point.close - previousPoint.close;
  if (metric.changeUnit === 'bp') return metric.unit === 'percent' ? difference * 100 : difference;
  if (metric.changeUnit === 'percent') {
    return previousPoint.close === 0 ? null : (difference / Math.abs(previousPoint.close)) * 100;
  }
  return difference;
}

function axisDate(date, { range, spanDays }) {
  if (range === '5y' && spanDays > 370) {
    return formatMacroDate(date).replace(spanDays > 1_100 ? /\d+月\d+日$/ : /\d+日$/, '');
  }
  return formatMacroDate(date, { includeYear: false });
}

export default function MacroHistoryChart({ metric, range, language = 'zh' }) {
  const history = metric?.history;
  const rows = React.useMemo(() => (
    sliceMacroHistory(history || EMPTY_ROWS, range)
      .map(({ date, value }) => ({ date, close: value }))
  ), [history, range]);
  const english = language === 'en';
  const name = macroMetricLabel(metric);
  const presentation = {
    allowNegative: true,
    plain: true,
    ariaLabel: english ? `${name || 'Macro'} history` : `${name || '宏观指标'}历史走势`,
    tooltipLabel: name,
    dateFormatter: formatMacroDate,
    axisDateFormatter: axisDate,
    valueFormatter: value => formatMacroValue(value, metric?.unit),
    renderTooltip: (point, previousPoint) => {
      const change = observationChange(point, previousPoint, metric);
      return <>
        <div className="mt-1 text-[20px] font-normal text-white/[0.88] tabular-nums">
          {formatMacroValue(point.close, metric.unit)}
        </div>
        <div className="stock-report-tooltip-row">
          <span className="text-white/[0.40]">{english ? 'Since previous observation' : '较上次观测'}</span>
          <span className="whitespace-nowrap tabular-nums" style={{ color: macroChangeColor(change) }}>
            {formatMacroChange(change, metric.changeUnit)}
          </span>
        </div>
      </>;
    },
  };

  return (
    <div className="macro-history-chart stock-report-page" data-macro-history-chart={metric?.id}>
      {rows.length < 2 ? (
        <div className="stock-report-chart-empty flex items-center justify-center text-[12px] text-white/[0.50]" role="status">
          {english ? 'Not enough historical observations' : '暂无足够的历史观测'}
        </div>
      ) : (
        <PriceChart
          rows={rows}
          dailyRows={EMPTY_ROWS}
          weeklyRows={EMPTY_ROWS}
          weeklyLookupRows={EMPTY_ROWS}
          range={range}
          language={language}
          symbol={metric.id}
          priceColor={NEUTRAL_LINE}
          presentation={presentation}
        />
      )}
    </div>
  );
}
