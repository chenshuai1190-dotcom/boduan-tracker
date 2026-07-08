import React from 'react';
import { ArrowLeft, Info } from 'lucide-react';
import { marketHexColor, marketTextClass } from '../lib/marketColorMode.js';
import { t } from '../lib/i18n.js';
import { buildStockDetailViewModel } from '../lib/stockDetailViewModel.js';

const PAGE_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const USD_CNY_FALLBACK = 7.2;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmt(value, digits = 2) {
  return toNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signedCurrency(value, currency = 'USD', digits = 2) {
  const n = toNumber(value);
  const symbol = currency === 'CNY' ? '¥' : '$';
  return `${n >= 0 ? '+' : '-'}${symbol}${fmt(Math.abs(n), digits)}`;
}

function currency(value, currencyMode = 'USD', digits = 2) {
  return `${currencyMode === 'CNY' ? '¥' : '$'}${fmt(value, digits)}`;
}

function signedPct(value, digits = 2) {
  if (value == null) return '--';
  const n = toNumber(value) * 100;
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function displayDate(value) {
  return String(value || '--').replaceAll('-', '/');
}

function parseDateMs(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

function formatAxisDate(value) {
  const parts = String(value || '').split('-');
  if (parts.length !== 3) return '--';
  return `${parts[1]}/${parts[2]}`;
}

function formatAxisMoney(value, currencyMode = 'USD') {
  const n = toNumber(value);
  const abs = Math.abs(n);
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  if (currencyMode === 'CNY') {
    if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(abs >= 100000 ? 0 : 1)}万`;
    if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(0)}K`;
    return `${sign}${abs.toFixed(0)}`;
  }
  if (abs >= 1000000) return `${sign}${(abs / 1000000).toFixed(abs >= 10000000 ? 0 : 1)}M`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function sideLabel(language, side) {
  return side === 'sell'
    ? t(language, 'stockDetail.sell', '卖出')
    : t(language, 'stockDetail.buy', '买入');
}

function buildLineChart(points, { startDate, endDate, width = 310, height = 150 } = {}) {
  const padLeft = 45;
  const padRight = 10;
  const padTop = 12;
  const padBottom = 24;
  const valid = (Array.isArray(points) ? points : [])
    .map((point, index) => ({ point, index, value: Number(point?.pnlUsd) }))
    .filter(({ value }) => Number.isFinite(value));
  if (valid.length === 0) return {
    path: '',
    points: [],
    ticks: [],
    yLines: [24, 56, 88, 120],
  };
  const values = valid.map(({ value }) => value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const padding = Math.max((max - min) * 0.12, 1);
  const domainMin = min - padding;
  const domainMax = max + padding;
  const span = domainMax - domainMin || 1;
  const xStart = parseDateMs(startDate);
  const xEnd = parseDateMs(endDate);
  const xSpan = xStart != null && xEnd != null && xEnd > xStart ? xEnd - xStart : null;
  const xForPoint = ({ point, index }) => {
    const pointMs = parseDateMs(point?.date);
    if (xSpan && pointMs != null) {
      const progress = Math.min(1, Math.max(0, (pointMs - xStart) / xSpan));
      return padLeft + progress * (width - padLeft - padRight);
    }
    return padLeft + (index / Math.max(points.length - 1, 1)) * (width - padLeft - padRight);
  };
  const yForValue = (value) => padTop + (1 - ((value - domainMin) / span)) * (height - padTop - padBottom);
  const plottedPoints = valid.map(({ point, index, value }) => ({
    point,
    index,
    value,
    date: point?.date,
    x: xForPoint({ point, index }),
    y: yForValue(value),
  }));
  const path = valid.length === 1
    ? `M${padLeft} ${yForValue(valid[0].value).toFixed(2)} L${width - padRight} ${yForValue(valid[0].value).toFixed(2)}`
    : plottedPoints.map(({ x, y }, pathIndex) => {
      return `${pathIndex === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ');
  const ticks = [domainMax, domainMin + span * 0.66, domainMin + span * 0.33, domainMin].map((value) => ({
    value,
    y: yForValue(value),
  }));
  return {
    path,
    points: plottedPoints,
    ticks,
    yLines: ticks.map((tick) => tick.y),
  };
}

function StatCell({ label, value, valueClass = 'text-white/72' }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] leading-4 text-white/38">{label}</div>
      <div className={`mt-1 truncate text-[14px] font-normal leading-5 tabular-nums ${valueClass}`} style={{ fontFamily: NUMBER_FONT }}>
        {value}
      </div>
    </div>
  );
}

function RangePill({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 border-b-2 px-1 pb-2 pt-1 text-[13px] font-normal transition active:scale-95 ${
        active
          ? 'border-[#f6b54b] text-[#ffd18a]'
          : 'border-transparent text-white/48'
      }`}
    >
      {children}
    </button>
  );
}

function PnlSparkline({ points, color, emptyText, startDate, endDate, currencyMode, marketColorMode }) {
  const chart = React.useMemo(() => buildLineChart(points, { startDate, endDate }), [points, startDate, endDate]);
  const [selectedIndex, setSelectedIndex] = React.useState(null);
  const startMs = parseDateMs(startDate);
  const endMs = parseDateMs(endDate);
  const middleDate = startMs != null && endMs != null
    ? new Date(startMs + ((endMs - startMs) / 2)).toISOString().slice(0, 10)
    : startDate;
  const first = formatAxisDate(startDate);
  const middle = formatAxisDate(middleDate);
  const last = formatAxisDate(endDate);
  const selectedPoint = selectedIndex == null ? null : chart.points[selectedIndex] || null;
  const selectedPointColor = selectedPoint ? marketHexColor(selectedPoint.value, marketColorMode) : color;
  const selectedPointLeft = selectedPoint ? `${(selectedPoint.x / 310) * 100}%` : '50%';
  const selectedPointTop = selectedPoint ? `${(selectedPoint.y / 150) * 100}%` : '50%';
  const selectedPointTransform = selectedPoint
    ? `${selectedPoint.x > 230 ? 'translateX(-100%)' : selectedPoint.x < 80 ? 'translateX(0)' : 'translateX(-50%)'} ${selectedPoint.y < 42 ? 'translateY(12px)' : 'translateY(calc(-100% - 12px))'}`
    : 'translate(-50%, -100%)';

  React.useEffect(() => {
    setSelectedIndex(null);
  }, [points, startDate, endDate]);

  const updateSelectedPoint = React.useCallback((event) => {
    if (!chart.points.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const x = ((event.clientX - rect.left) / rect.width) * 310;
    let nextIndex = 0;
    let nextDistance = Number.POSITIVE_INFINITY;
    chart.points.forEach((point, index) => {
      const distance = Math.abs(point.x - x);
      if (distance < nextDistance) {
        nextDistance = distance;
        nextIndex = index;
      }
    });
    setSelectedIndex(nextIndex);
  }, [chart.points]);

  const handlePointerDown = React.useCallback((event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateSelectedPoint(event);
  }, [updateSelectedPoint]);

  return (
    <div
      className="relative mt-2 h-[166px] select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={updateSelectedPoint}
      style={{ touchAction: 'pan-y' }}
    >
      {!chart.path && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/[0.02] text-[12px] text-white/32">
          {emptyText}
        </div>
      )}
      <svg viewBox="0 0 310 150" className="h-full w-full overflow-visible">
        {chart.yLines.map((y) => (
          <line key={y} x1="10" y1={y} x2="300" y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 5" />
        ))}
        {chart.ticks.map((tick) => (
          <text key={`${tick.y}-${tick.value}`} x="4" y={Math.min(132, Math.max(12, tick.y + 3))} fontSize="8.5" fill="rgba(255,255,255,0.34)">
            {formatAxisMoney(tick.value, currencyMode)}
          </text>
        ))}
        {chart.path && <path d={chart.path} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
        {selectedPoint && (
          <>
            <line
              x1={selectedPoint.x}
              y1="10"
              x2={selectedPoint.x}
              y2="126"
              stroke="rgba(255,255,255,0.18)"
              strokeDasharray="4 5"
            />
            <circle cx={selectedPoint.x} cy={selectedPoint.y} r="4.2" fill="#05070b" stroke={selectedPointColor} strokeWidth="2" />
          </>
        )}
        <text x="45" y="146" fontSize="9" fill="rgba(255,255,255,0.36)">{first}</text>
        <text x="172" y="146" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.36)">{middle}</text>
        <text x="300" y="146" textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.36)">{last}</text>
      </svg>
      {selectedPoint && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-white/10 bg-[#10151d]/95 px-2.5 py-2 text-left shadow-xl backdrop-blur"
          style={{
            left: selectedPointLeft,
            top: selectedPointTop,
            transform: selectedPointTransform,
          }}
        >
          <div className="text-[10px] leading-3 text-white/42">{displayDate(selectedPoint.date)}</div>
          <div className="mt-1 text-[12px] font-semibold leading-4 tabular-nums" style={{ color: selectedPointColor, fontFamily: NUMBER_FONT }}>
            {signedCurrency(selectedPoint.value, currencyMode, 2)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StockDetailPage({ ctx = {} }) {
  const {
    closeStockDetail,
    db,
    displayStockName,
    language = 'zh',
    marketColorMode,
    portfolioCurrencyMode,
    stockDetailSymbol,
    stockTrades,
    usdRate,
    investmentSummary,
    user,
  } = ctx;
  const [range, setRange] = React.useState('all');
  const [snapshots, setSnapshots] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const displayCurrency = portfolioCurrencyMode === 'USD' ? 'USD' : 'CNY';
  const displayRate = displayCurrency === 'CNY' ? (toNumber(usdRate) || toNumber(investmentSummary?.usdRate) || USD_CNY_FALLBACK) : 1;
  const symbol = String(stockDetailSymbol || '').trim().toUpperCase();

  React.useEffect(() => {
    let cancelled = false;
    async function loadSnapshots() {
      if (!db?.fetchPnlReportSymbolSnapshotHistory || !symbol) {
        setSnapshots([]);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const rows = await db.fetchPnlReportSymbolSnapshotHistory(symbol, 370);
        if (!cancelled) setSnapshots(rows);
      } catch (err) {
        if (!cancelled) {
          setSnapshots([]);
          setError(err?.message || String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSnapshots();
    return () => {
      cancelled = true;
    };
  }, [db, symbol, user?.id]);

  const view = React.useMemo(() => buildStockDetailViewModel({
    symbol,
    stockTrades,
    symbolSnapshots: snapshots,
    range,
  }), [range, snapshots, stockTrades, symbol]);

  const displayName = typeof displayStockName === 'function'
    ? displayStockName(view.symbol, view.name, language)
    : (view.name || view.symbol);
  const totalColor = marketHexColor(view.periodPnlUsd || 0, marketColorMode);
  const totalValue = view.periodPnlUsd == null ? null : view.periodPnlUsd * displayRate;
  const rangeItems = [
    ['ytd', t(language, 'stockDetail.range.ytd', '本年')],
    ['1m', t(language, 'stockDetail.range.1m', '近 1 月')],
    ['6m', t(language, 'stockDetail.range.6m', '近 6 月')],
    ['1y', t(language, 'stockDetail.range.1y', '近 1 年')],
    ['all', t(language, 'stockDetail.range.all', '全部')],
  ];
  const compactRangeLabel = rangeItems.find(([id]) => id === range)?.[1] || rangeItems[0][1];

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] bg-[#05070b] pb-[calc(env(safe-area-inset-bottom)+86px)] text-white" style={{ fontFamily: PAGE_FONT }}>
      <header className="sticky top-0 z-20 -mx-4 border-b border-white/10 bg-[#05070b]/90 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={closeStockDetail}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/72 transition active:scale-95"
            aria-label={t(language, 'stockDetail.back', '返回')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-[17px] font-semibold leading-tight text-white/88">
              {view.symbol || '--'} {displayName && displayName !== view.symbol ? displayName : ''}
            </h1>
            <div className="mt-0.5 text-[11px] text-white/34">
              {t(language, 'stockDetail.subtitle', '个股收益详情')}
            </div>
          </div>
          <div className="h-9 w-9 shrink-0" aria-hidden="true" />
        </div>
        <div className="mt-4 grid grid-cols-5 gap-4">
          {rangeItems.map(([id, label]) => (
            <RangePill key={id} active={range === id} onClick={() => setRange(id)}>
              {label}
            </RangePill>
          ))}
        </div>
      </header>

      <section className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="relative">
          <div className="flex items-center gap-1.5 text-[12px] text-white/42">
            <span>{t(language, 'stockDetail.totalPnl', '累计盈亏')} ({displayCurrency})</span>
            <Info className="h-3.5 w-3.5 text-white/28" />
          </div>
          <div className="mt-3 text-[30px] font-semibold leading-none tracking-normal tabular-nums" style={{ color: totalColor, fontFamily: NUMBER_FONT }}>
            {totalValue == null ? '--' : signedCurrency(totalValue, displayCurrency, 2)}
          </div>
          <div className={`mt-2 text-[14px] font-semibold tabular-nums ${view.periodPnlPct == null ? 'text-white/32' : marketTextClass(view.periodPnlUsd || 0, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
            {signedPct(view.periodPnlPct, 2)}
          </div>
          <div className="mt-1 text-[12px] text-white/34">{view.startDate} - {view.endDate}</div>

          <div className="mt-4 grid grid-cols-2 border-t border-white/[0.06] pt-3">
            <StatCell
              label={t(language, 'stockDetail.realizedPnl', '已实现盈亏')}
              value={signedCurrency(view.realizedPnlUsd * displayRate, displayCurrency, 2)}
              valueClass={marketTextClass(view.realizedPnlUsd, marketColorMode)}
            />
            <StatCell
              label={t(language, 'stockDetail.unrealizedPnl', '未实现盈亏')}
              value={signedCurrency(view.unrealizedPnlUsd * displayRate, displayCurrency, 2)}
              valueClass={marketTextClass(view.unrealizedPnlUsd, marketColorMode)}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 border-t border-white/[0.06] pt-3">
            <StatCell
              label={t(language, 'stockDetail.heldShares', '持仓数量')}
              value={`${fmt(view.heldShares, 0)} ${t(language, 'stockDetail.shares', '股')}`}
            />
            <StatCell
              label={t(language, 'stockDetail.avgCost', '当前成本')}
              value={view.avgCostUsd > 0 ? fmt(view.avgCostUsd, 3) : '--'}
            />
          </div>
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[13px] font-semibold text-white/78">{t(language, 'stockDetail.pnlTrend', '收益走势')}</h2>
          <Info className="h-3.5 w-3.5 text-white/28" />
        </div>
        <div className="mt-2 text-[12px] text-[#ffd18a]">{t(language, 'stockDetail.myPnlLine', '我的收益线')}</div>
        <PnlSparkline
          points={view.trend.map((point) => ({ ...point, pnlUsd: point.pnlUsd * displayRate }))}
          color="#f6b54b"
          emptyText={loading ? t(language, 'stockDetail.loading', '正在读取快照') : t(language, 'stockDetail.noTrend', '暂无足够快照')}
          startDate={view.axisStartDate}
          endDate={view.axisEndDate}
          currencyMode={displayCurrency}
          marketColorMode={marketColorMode}
        />
      </section>

      <section className="mt-3 rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <h2 className="text-[13px] font-semibold text-white/78">{t(language, 'stockDetail.tradeStats', '交易统计')}</h2>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
          <StatCell label={t(language, 'stockDetail.buyAmount', '买入金额')} value={currency(view.stats.buyAmountUsd * displayRate, displayCurrency, 2)} />
          <StatCell label={t(language, 'stockDetail.sellAmount', '卖出金额')} value={currency(view.stats.sellAmountUsd * displayRate, displayCurrency, 2)} />
          <StatCell label={t(language, 'stockDetail.buyCount', '买入次数')} value={`${view.stats.buyCount} ${t(language, 'stockDetail.tradesCount', '笔')}`} />
          <StatCell label={t(language, 'stockDetail.sellCount', '卖出次数')} value={`${view.stats.sellCount} ${t(language, 'stockDetail.tradesCount', '笔')}`} />
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-white/78">{t(language, 'stockDetail.tradeRecords', '交易记录')}</h2>
          <span className="text-[11px] text-white/34">{compactRangeLabel}</span>
        </div>
        <div className="mt-4 grid grid-cols-[1.2fr_1fr_0.9fr_1fr] gap-2 border-b border-white/[0.06] pb-2 text-[11px] text-white/30">
          <span>{t(language, 'stockDetail.dateAction', '日期 / 操作')}</span>
          <span className="text-right">{t(language, 'stockDetail.qtyPrice', '数量 / 价格')}</span>
          <span className="text-right">{t(language, 'stockDetail.amount', '成交额')}</span>
          <span className="text-right">{t(language, 'stockDetail.realized', '实现盈亏')}</span>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {view.tradeRecords.length === 0 && (
            <div className="py-8 text-center text-[12px] text-white/34">
              {t(language, 'stockDetail.noTrades', '当前周期暂无交易记录')}
            </div>
          )}
          {view.tradeRecords.map((record) => {
            const isSell = record.side === 'sell';
            const realizedValue = record.realizedPnlUsd == null ? null : record.realizedPnlUsd * displayRate;
            return (
              <div key={`${record.id || record.date}-${record.side}-${record.shares}`} className="grid grid-cols-[1.2fr_1fr_0.9fr_1fr] gap-2 py-3">
                <div className="min-w-0">
                  <div className="text-[12px] tabular-nums text-white/36" style={{ fontFamily: NUMBER_FONT }}>{displayDate(record.date)}</div>
                  <div className={`mt-1 text-[13px] font-normal ${isSell ? marketTextClass(-1, marketColorMode) : marketTextClass(1, marketColorMode)}`}>
                    {sideLabel(language, record.side)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] text-white/64 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{fmt(record.shares, 0)} {t(language, 'stockDetail.shares', '股')}</div>
                  <div className="mt-1 text-[11px] text-white/30 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>@ {fmt(record.price, 2)}</div>
                </div>
                <div className="text-right text-[13px] text-white/60 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
                  {currency(record.amountUsd * displayRate, displayCurrency, 2)}
                </div>
                <div className={`text-right text-[13px] tabular-nums ${realizedValue == null ? 'text-white/34' : marketTextClass(realizedValue, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
                  {realizedValue == null ? '--' : signedCurrency(realizedValue, displayCurrency, 2)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {(error || (!view.hasData && !loading)) && (
        <div className="mt-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.035] p-4 text-[12px] leading-5 text-white/38">
          {error || t(language, 'stockDetail.noSnapshotNotice', '暂无该股票收盘快照。页面只读取已有快照和交易账本,不会使用假数据替代。')}
        </div>
      )}
      <div className="h-2" />
    </main>
  );
}
