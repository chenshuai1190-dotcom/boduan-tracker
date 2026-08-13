import React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  HOME_MA200_DEFAULT_ROWS,
  buildHomeMa200BreakdownModel,
} from '../lib/homeMa200Breakdown.js';
import { isEnglishLanguage, t } from '../lib/i18n.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const GRID_TEMPLATE = '68fr 64fr 64fr 69fr 70fr';

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '--';
}

function formatDistance(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function SignalRow({ row, language, onOpenStock }) {
  const confirmed = row.status === 'confirmed';
  return (
    <button
      type="button"
      className="grid min-h-[64px] w-full items-center border-t border-white/[0.06] text-left transition-colors first:border-t-0 active:bg-white/[0.025]"
      style={{ gridTemplateColumns: GRID_TEMPLATE }}
      onClick={() => onOpenStock?.(row.symbol)}
      aria-label={t(language, 'watchlistDetail.openAria', '打开 {{symbol}} 股票详情', { symbol: row.symbol })}
      data-home-ma200-row={row.symbol}
    >
      <div className="min-w-0">
        <span className="block truncate text-[13px] font-normal leading-[14px] text-white/70" style={{ fontFamily: NUMBER_FONT }}>{row.symbol}</span>
        <span className="mt-[3px] block truncate text-[11px] leading-[13px] text-white/35">{row.company}</span>
      </div>
      <div className="min-w-0">
        <div className="truncate text-[11px] font-normal leading-[13px] text-white/40">
          {confirmed
            ? t(language, 'home.ma200Monitor.close', '收盘')
            : t(language, 'home.ma200Monitor.currentPrice', '现价')}
        </div>
        <div className="mt-[3px] overflow-hidden whitespace-nowrap text-[13px] font-normal leading-[15px] tabular-nums text-white/80" style={{ fontFamily: NUMBER_FONT }}>
          {formatNumber(row.price)}
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-[11px] font-normal leading-[13px] text-white/40">MA200</div>
        <div className="mt-[3px] overflow-hidden whitespace-nowrap text-[13px] font-normal leading-[15px] tabular-nums text-white/80" style={{ fontFamily: NUMBER_FONT }}>
          {formatNumber(row.ma200)}
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-[11px] font-normal leading-[13px] text-white/40">
          {t(language, 'home.ma200Monitor.distance', '距 MA200')}
        </div>
        <div className="mt-[3px] overflow-hidden whitespace-nowrap text-[13px] font-medium leading-[15px] tabular-nums text-[#ff4b5c]" style={{ fontFamily: NUMBER_FONT }}>
          {formatDistance(row.distancePct)}
        </div>
      </div>
      <div className="flex min-w-0 flex-col items-end">
        <span className={`inline-flex min-h-[22px] items-center justify-center whitespace-nowrap rounded-md border px-1.5 text-[10px] font-normal leading-none ${confirmed ? 'border-[#ff4b5c]/[0.17] bg-[#9d192c]/[0.34] text-[#ff5b69]' : 'border-[#f0a12c]/[0.16] bg-[#965905]/[0.36] text-[#f5ae3f]'}`}>
          {confirmed
            ? t(language, 'home.ma200Monitor.confirmed', '确认跌破')
            : t(language, 'home.ma200Monitor.intraday', '盘中观察')}
        </span>
        <span className="mt-[5px] whitespace-nowrap text-[10px] leading-none text-white/40">
          {confirmed
            ? t(language, 'home.ma200Monitor.consecutiveDays', '连续 {{count}} 日', { count: row.belowCompletedDays })
            : t(language, 'home.ma200Monitor.waitingClose', '等待收盘')}
        </span>
      </div>
    </button>
  );
}

export default function HomeMa200BreakdownMonitor({
  watchlist = [],
  quoteRows = [],
  language = 'zh',
  onOpenStock,
  placementClassName = '',
}) {
  const model = React.useMemo(
    () => buildHomeMa200BreakdownModel({ watchlist, quoteRows }),
    [quoteRows, watchlist],
  );
  const [expanded, setExpanded] = React.useState(false);
  const canExpand = model.rows.length > HOME_MA200_DEFAULT_ROWS;
  const visibleRows = expanded && canExpand
    ? model.rows
    : model.rows.slice(0, HOME_MA200_DEFAULT_ROWS);
  const englishMode = isEnglishLanguage(language);
  const emptyText = model.watchlistCount === 0
    ? t(language, 'home.noWatchlist', '暂无自选股票。')
    : model.hasIncompleteData
      ? t(language, 'home.ma200Monitor.emptyPartial', '暂无已确认跌破 · 部分数据待补齐')
      : model.hasOutsideWindowBreakdown
        ? t(language, 'home.ma200Monitor.emptyOutsideWindow', '暂无 20 个交易日内的新跌破')
        : t(language, 'home.ma200Monitor.emptyClear', '当前自选均在 MA200 上方');

  return (
    <div className={placementClassName} data-home-ma200-monitor="true">
      <section className="mt-3 overflow-hidden rounded-[19px] border border-transparent bg-[#0b0c0e] shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_18px_44px_rgba(0,0,0,0.14)]" aria-label={t(language, 'home.ma200Monitor.title', 'MA200 跌破监控')}>
        <header className="flex min-h-[58px] items-center justify-between gap-2 border-b border-white/[0.06] px-3 pb-2 pt-[9px]">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center text-[#ff4b5c]" aria-hidden="true">
                <svg viewBox="0 0 32 32" className="h-5 w-5 drop-shadow-[0_0_7px_rgba(255,75,92,0.14)]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 22.5 11.2 14l5.3 4.7L27 6.5" />
                  <path d="M21.5 6.5H27V12" />
                  <path d="M4 27h24" />
                </svg>
              </span>
              <h2 className="truncate text-[15px] font-normal leading-[1.1] tracking-[0.01em] text-white/70">
                {t(language, 'home.ma200Monitor.title', 'MA200 跌破监控')}
              </h2>
            </div>
            <p className="mb-0 ml-7 mt-1 truncate text-[11px] leading-[1.2] text-white/40">
              {t(language, 'home.ma200Monitor.subtitle', '仅监控自选股票 · 完成收盘确认')}
            </p>
          </div>
          <div
            className={`flex shrink-0 items-center gap-[3px] text-right tabular-nums ${englishMode ? 'text-[10px]' : 'text-[12px]'}`}
            style={{ fontFamily: NUMBER_FONT }}
            aria-label={t(language, 'home.ma200Monitor.countAria', '{{confirmed}} 只确认，{{intraday}} 只盘中', {
              confirmed: model.confirmedCount,
              intraday: model.intradayCount,
            })}
          >
            <span className="whitespace-nowrap font-normal leading-none text-[#ff4b5c]">
              {t(language, 'home.ma200Monitor.confirmedCount', '{{count}} 只确认', { count: model.confirmedCount })}
            </span>
            <span className="whitespace-nowrap font-normal leading-none text-[#f0a12c]/80 before:mr-[3px] before:text-white/30 before:content-['·']">
              {t(language, 'home.ma200Monitor.intradayCount', '{{count}} 只盘中', { count: model.intradayCount })}
            </span>
          </div>
        </header>

        {model.rows.length > 0 ? (
          <div className="px-3">
            {visibleRows.map((row) => (
              <SignalRow
                key={row.symbol}
                row={row}
                language={language}
                onOpenStock={onOpenStock}
              />
            ))}
            {canExpand ? (
              <button
                type="button"
                className="flex min-h-[44px] w-full items-center justify-center gap-1 border-t border-white/[0.06] text-[12px] font-normal leading-none text-white/45 transition-colors hover:text-white/65 active:text-white/70"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                data-home-ma200-expand="true"
              >
                <span>
                  {expanded
                    ? t(language, 'home.ma200Monitor.collapse', '收起')
                    : t(language, 'home.ma200Monitor.expandMore', '展开更多（共 {{count}} 只）', { count: model.rows.length })}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-[52px] items-center justify-center px-4 text-center text-[12px] leading-5 text-white/40" data-home-ma200-empty="true">
            {emptyText}
          </div>
        )}
      </section>

    </div>
  );
}
