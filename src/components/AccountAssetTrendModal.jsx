import React from 'react';
import StockReportModal from './StockReportModal.jsx';
import { t } from '../lib/i18n.js';
import { marketHexColor } from '../lib/marketColorMode.js';
import './AccountAssetTrendModal.css';

function currencyPrefix(currency) {
  if (currency === 'USD') return '$';
  if (currency === 'HKD') return 'HK$';
  return '¥';
}

function formatNumber(value, maximumFractionDigits = 2) {
  if (!Number.isFinite(value)) return '--';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

function formatAmount(value, currency, { signed = false } = {}) {
  if (!Number.isFinite(value)) return '--';
  const sign = value < 0 ? '-' : signed ? '+' : '';
  const amount = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${currencyPrefix(currency)}${amount}`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '--';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatAxisValue(value, language) {
  if (!Number.isFinite(value)) return '--';
  const absolute = Math.abs(value);
  if (language === 'zh') {
    if (absolute >= 10000) {
      return `${formatNumber(value / 10000, 1)}万`;
    }
    return formatNumber(value, 0);
  }
  if (absolute >= 1000000) return `${formatNumber(value / 1000000, 1)}M`;
  if (absolute >= 1000) return `${formatNumber(value / 1000, 1)}K`;
  return formatNumber(value, 0);
}

function formatMonth(month, language, long = false) {
  const [year, rawMonth] = String(month || '').split('-');
  if (!year || !rawMonth) return '--';
  if (!long) return `${year}/${rawMonth}`;
  if (language === 'zh') return `${year}年${rawMonth}月`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${year}-${rawMonth}-01T00:00:00Z`));
}

export default function AccountAssetTrendModal({
  account,
  accountName,
  accountType,
  language = 'zh',
  marketColorMode = 'redUpGreenDown',
  onClose,
  trend,
}) {
  const activePointerIdRef = React.useRef(null);
  const chartRootRef = React.useRef(null);
  const dataSlots = React.useMemo(
    () => (trend?.slots || []).filter(slot => slot.hasData),
    [trend?.slots],
  );
  const [selectedMonth, setSelectedMonth] = React.useState(null);

  React.useEffect(() => {
    activePointerIdRef.current = null;
    setSelectedMonth(null);
  }, [account?.id]);

  const selectedSlot = (trend?.slots || []).find(slot => slot.month === selectedMonth && slot.hasData)
    || null;
  const currency = account?.currency || 'CNY';
  const maxBalance = Number.isFinite(trend?.maxPoint?.balance) ? trend.maxPoint.balance : 0;
  const axisMax = maxBalance > 0 ? maxBalance : 1;
  const axisTicks = [1, 0.75, 0.5, 0.25, 0].map(ratio => axisMax * ratio);

  const selectNearestSlot = React.useCallback((event) => {
    const slots = trend?.slots || [];
    if (slots.length === 0 || dataSlots.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const cursorIndex = ((event.clientX - rect.left) / rect.width) * slots.length - 0.5;
    let nearest = dataSlots[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    dataSlots.forEach((slot) => {
      const slotIndex = slots.findIndex(item => item.month === slot.month);
      const distance = Math.abs(slotIndex - cursorIndex);
      if (distance < nearestDistance) {
        nearest = slot;
        nearestDistance = distance;
      }
    });
    setSelectedMonth(nearest.month);
  }, [dataSlots, trend?.slots]);

  const handlePointerDown = React.useCallback((event) => {
    if (event.isPrimary === false) return;
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    selectNearestSlot(event);
  }, [selectNearestSlot]);

  const handlePointerMove = React.useCallback((event) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    selectNearestSlot(event);
  }, [selectNearestSlot]);

  const finishPointerTracking = React.useCallback((event) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  }, []);

  React.useEffect(() => {
    if (!selectedMonth) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (chartRootRef.current?.contains(event.target)) return;
      setSelectedMonth(null);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
  }, [selectedMonth]);

  const selectedChangeText = React.useMemo(() => {
    if (!selectedSlot) return t(language, 'analysis.accountTrendNoData', '暂无该账户的月度快照');
    if (!selectedSlot.hasPreviousMonth) {
      return t(language, 'analysis.accountTrendNoPrevious', '上月无快照 · 暂不对比');
    }
    const amount = formatAmount(selectedSlot.changeAmount, currency, { signed: true });
    return t(language, 'analysis.accountTrendVsPrevious', '较上月 {{amount}} · {{percent}}', {
      amount,
      percent: formatPercent(selectedSlot.changePct),
    });
  }, [currency, language, selectedSlot]);

  const growthLabel = trend?.startSnapshot?.month && trend.startSnapshot.month !== trend.startMonth
    ? t(language, 'analysis.accountTrendGrowthSince', '自 {{month}} 累计增长', {
      month: formatMonth(trend.startSnapshot.month, language),
    })
    : t(language, 'analysis.twelveMonthGrowth', '12 个月累计增长');
  const cumulativeGrowthText = Number.isFinite(trend?.cumulativeGrowthPct)
    ? formatPercent(trend.cumulativeGrowthPct)
    : '--';

  const title = t(language, 'analysis.accountTrendTitle', '{{name}}资产走势', {
    name: accountName || account?.name || '--',
  });

  return (
    <StockReportModal
      title={title}
      closeLabel={t(language, 'analysis.closeAccountTrend', '关闭账户资产走势')}
      onClose={onClose}
      widthClassName="w-[calc(100vw-32px)] max-w-[430px]"
      panelClassName="account-trend-modal"
    >
      <div className="account-trend-report" data-account-asset-trend={account?.id || ''}>
        <div className="account-trend-meta">
          <span>{accountType || account?.type || '--'} · {currency}</span>
          <span>{t(language, 'analysis.last12Months', '近 12 个月')}</span>
        </div>

        <div className="account-trend-summary">
          <div className="account-trend-amount">
            {formatAmount(trend?.endSnapshot?.balance, currency)}
          </div>
          <div className="account-trend-growth">
            <span>{growthLabel}</span>
            <span
              className="account-trend-growth-value"
              style={{ color: Number.isFinite(trend?.cumulativeGrowthPct) ? marketHexColor(trend.cumulativeGrowthPct, marketColorMode) : '#777780' }}
            >
              {cumulativeGrowthText}
            </span>
          </div>
        </div>

        <div ref={chartRootRef} className="account-trend-chart">
          <div className="account-trend-selection-band">
            {selectedSlot && (
              <div className="account-trend-selection">
                <div className="account-trend-selection-month">{formatMonth(selectedSlot.month, language)}</div>
                <div className="account-trend-selection-amount">
                  {formatAmount(selectedSlot.balance, currency)}
                </div>
                <div
                  className="account-trend-selection-change"
                  style={{ color: Number.isFinite(selectedSlot.changeAmount) ? marketHexColor(selectedSlot.changeAmount, marketColorMode) : '#777780' }}
                >
                  {selectedChangeText}
                </div>
              </div>
            )}
          </div>

          {dataSlots.length > 0 ? (
            <div className="account-trend-chart-grid">
              <div className="account-trend-axis">
                {axisTicks.map((tick, index) => <span key={`${tick}-${index}`}>{formatAxisValue(tick, language)}</span>)}
              </div>
              <div
                className="account-trend-plot"
                data-account-asset-trend-chart="true"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishPointerTracking}
                onPointerCancel={finishPointerTracking}
                onLostPointerCapture={finishPointerTracking}
                style={{ touchAction: 'pan-y' }}
              >
                {(trend?.slots || []).map((slot) => {
                  const selected = selectedSlot?.month === slot.month;
                  const barColor = slot.hasPreviousMonth && Number.isFinite(slot.changeAmount) && slot.changeAmount !== 0
                    ? marketHexColor(slot.changeAmount, marketColorMode)
                    : '#777780';
                  const height = slot.hasData
                    ? `${Math.max(slot.balance === 0 ? 3 : 5, (slot.balance / axisMax) * 100)}%`
                    : '0%';
                  return (
                    <div key={slot.month} className="account-trend-slot">
                      {slot.hasData && (
                        <div
                          className={`account-trend-bar${selected ? ' is-selected' : ''}`}
                          style={{ height, backgroundColor: barColor }}
                          aria-hidden="true"
                        />
                      )}
                      <span className="account-trend-month">{slot.month.slice(-2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="account-trend-empty">
              {t(language, 'analysis.accountTrendNoData', '暂无该账户的月度快照')}
            </div>
          )}
        </div>

        <div className="account-trend-extremes">
          {[
            [t(language, 'analysis.lowestAssets', '最低资产'), trend?.minPoint],
            [t(language, 'analysis.highestAssets', '最高资产'), trend?.maxPoint],
          ].map(([label, point]) => (
            <div key={label} className="account-trend-extreme">
              <div className="account-trend-extreme-label">{label}</div>
              <div className="account-trend-extreme-amount">{formatAmount(point?.balance, currency)}</div>
              <div className="account-trend-extreme-month">{formatMonth(point?.month, language, true)}</div>
            </div>
          ))}
        </div>
      </div>
    </StockReportModal>
  );
}
