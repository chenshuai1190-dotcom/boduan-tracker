import React from 'react';
import ActionModalCard from './ActionModalCard.jsx';
import { t } from '../lib/i18n.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const UP_COLOR = '#ff4b1f';
const DOWN_COLOR = '#50d0a2';

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
  const sign = signed ? (value >= 0 ? '+' : '-') : '';
  return `${sign}${currencyPrefix(currency)}${formatNumber(Math.abs(value))}`;
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

function pointColor(value) {
  return Number(value) >= 0 ? UP_COLOR : DOWN_COLOR;
}

export default function AccountAssetTrendModal({
  account,
  accountName,
  accountType,
  language = 'zh',
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
    <ActionModalCard
      title={title}
      closeLabel={t(language, 'analysis.closeAccountTrend', '关闭账户资产走势')}
      onClose={onClose}
      widthClassName="w-full max-w-[430px]"
      overlayClassName="!items-end !px-[14px] !bg-black/[0.67] !backdrop-blur-[5px]"
      overlayStyle={{
        paddingTop: 'calc(env(safe-area-inset-top) + 10px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 74px)',
      }}
      panelClassName="!min-h-0 !rounded-[27px] !border-white/[0.13] !bg-[#0c1117] !px-4 !pb-3 !pt-2 !shadow-[0_-25px_70px_rgba(0,0,0,0.60),inset_0_1px_0_rgba(255,255,255,0.055)]"
      panelStyle={{
        height: 'min(520px, calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 108px))',
      }}
      contentClassName="!min-h-0 !overflow-hidden !rounded-none !border-0 !bg-transparent !p-0 !shadow-none"
      titleClassName="!text-[19px] !font-medium !tracking-[-0.2px]"
      showGrabber
    >
      <div className="min-h-0 min-w-0" data-account-asset-trend={account?.id || ''}>
        <div className="flex items-center justify-between gap-3">
          <div className="truncate text-[12px] text-white/[0.42]">
            {accountType || account?.type || '--'} · {currency}
          </div>
          <div className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-1.5 text-[11px] text-white/[0.56]">
            {t(language, 'analysis.last12Months', '近 12 个月')}
          </div>
        </div>

        <div className="mt-[9px]">
          <div
            className="whitespace-nowrap text-[29px] font-normal leading-none tracking-[0.2px] tabular-nums"
            style={{ color: trend?.endSnapshot ? UP_COLOR : 'rgba(255,255,255,0.28)', fontFamily: NUMBER_FONT }}
          >
            {formatAmount(trend?.endSnapshot?.balance, currency)}
          </div>
          <div className="mt-[7px] text-[11.5px] text-white/[0.40]">
            {growthLabel}
            <span
              className="ml-[7px] text-[12px] font-medium tabular-nums"
              style={{
                color: Number.isFinite(trend?.cumulativeGrowthPct)
                  ? pointColor(trend.cumulativeGrowthPct)
                  : 'rgba(255,255,255,0.28)',
                fontFamily: NUMBER_FONT,
              }}
            >
              {cumulativeGrowthText}
            </span>
          </div>
        </div>

        <div ref={chartRootRef} className="mt-5 border-0 bg-transparent p-0">
          <div className="relative h-[76px]">
            <div className="absolute left-[39px] top-[7px] text-[10px] text-white/[0.30]">
              {t(language, 'analysis.accountTrendUnit', '单位：{{currency}}', { currency })}
            </div>
            {selectedSlot && (
              <div className="pointer-events-none absolute right-0 top-0 z-[5] w-[169px] rounded-[11px] border border-white/[0.12] bg-[#151b23] px-2.5 py-[9px] shadow-[0_12px_26px_rgba(0,0,0,0.50)]">
                <div className="text-[10px] font-normal text-white/[0.48]">{formatMonth(selectedSlot.month, language)}</div>
                <div className="mt-[5px] whitespace-nowrap text-[14px] font-medium leading-none text-white/[0.90] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
                  {formatAmount(selectedSlot.balance, currency)}
                </div>
                <div
                  className="mt-1.5 whitespace-nowrap text-[10px] font-normal leading-[1.25] tabular-nums"
                  style={{
                    color: Number.isFinite(selectedSlot.changeAmount)
                      ? pointColor(selectedSlot.changeAmount)
                      : 'rgba(255,255,255,0.38)',
                    fontFamily: NUMBER_FONT,
                  }}
                >
                  {selectedChangeText}
                </div>
              </div>
            )}
          </div>

          {dataSlots.length > 0 ? (
            <div className="grid h-[128px] grid-cols-[38px_minmax(0,1fr)]">
              <div className="flex flex-col justify-between whitespace-nowrap py-0.5 pb-[23px] pr-[7px] text-right text-[10px] text-white/[0.30] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
                {axisTicks.map((tick, index) => <span key={`${tick}-${index}`}>{formatAxisValue(tick, language)}</span>)}
              </div>
              <div
                className="relative grid h-[128px] select-none grid-cols-12 items-end gap-[3px] border-b border-l border-white/[0.19] px-0.5 pb-[22px] pt-1.5"
                data-account-asset-trend-chart="true"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishPointerTracking}
                onPointerCancel={finishPointerTracking}
                onLostPointerCapture={finishPointerTracking}
                style={{
                  touchAction: 'pan-y',
                  background: 'repeating-linear-gradient(to bottom, transparent 0, transparent 24px, rgba(255,255,255,0.09) 25px, transparent 26px)',
                }}
              >
                {(trend?.slots || []).map((slot) => {
                  const selected = selectedSlot?.month === slot.month;
                  const height = slot.hasData
                    ? `${Math.max(slot.balance === 0 ? 3 : 5, (slot.balance / axisMax) * 100)}%`
                    : '0%';
                  return (
                    <div key={slot.month} className="relative flex h-full items-end justify-center">
                      {slot.hasData && (
                        <div
                          className="w-[11px] rounded-t-[4px] rounded-b-[1px] bg-[linear-gradient(180deg,#ff735f_0%,#ff4f39_100%)] transition-[opacity,transform,filter] duration-150"
                          style={{
                            height,
                            minHeight: '3px',
                            opacity: selected ? 1 : 0.76,
                            transform: selected ? 'scaleX(1.16)' : 'none',
                            filter: selected ? 'drop-shadow(0 0 5px rgba(255,95,74,0.35))' : 'none',
                          }}
                          aria-hidden="true"
                        />
                      )}
                      <span className="absolute -bottom-[19px] left-1/2 -translate-x-1/2 text-[10px] leading-none text-white/[0.38] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
                        {slot.month.slice(-2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex h-[128px] items-center justify-center border-y border-white/[0.06] text-[12px] text-white/[0.32]">
              {t(language, 'analysis.accountTrendNoData', '暂无该账户的月度快照')}
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 rounded-[14px] border border-white/[0.075] bg-white/[0.025] py-[9px]">
          {[
            [t(language, 'analysis.lowestAssets', '最低资产'), trend?.minPoint],
            [t(language, 'analysis.highestAssets', '最高资产'), trend?.maxPoint],
          ].map(([label, point], index) => (
            <div key={label} className={`px-2.5 text-center ${index > 0 ? 'border-l border-white/[0.09]' : ''}`}>
              <div className="text-[10px] text-white/[0.36]">{label}</div>
              <div className="mt-[5px] whitespace-nowrap text-[15px] font-normal leading-none text-white/[0.76] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
                {formatAmount(point?.balance, currency)}
              </div>
              <div className="mt-1 text-[10px] text-white/[0.30]">{formatMonth(point?.month, language, true)}</div>
            </div>
          ))}
        </div>

        <div className="mt-2 text-center text-[10px] text-white/[0.24]">
          {t(language, 'analysis.accountTrendSource', '数据来自该账户每月余额快照')}
        </div>
      </div>
    </ActionModalCard>
  );
}
