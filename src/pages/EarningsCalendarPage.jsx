import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { t } from '../lib/i18n.js';
import EarningsCalendar from '../tabs/EarningsCalendar.jsx';

const PAGE_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI", sans-serif';

export default function EarningsCalendarPage({ ctx }) {
  const {
    cacheStockLogo,
    displayStockName,
    earningsCalendarEvents,
    earningsCalendarNow,
    earningsCalendarPageState,
    earningsCalendarRequest,
    investmentSummary,
    language = 'zh',
    logoCache,
    marketColorMode,
    onEarningsCalendarStateChange,
    openEarningsDetail,
    closeEarningsCalendar,
    quoteRows,
    stockFreshnessStartedAt = 0,
    supabase,
    watchlist,
  } = ctx;

  return (
    <div className="min-h-[100dvh] bg-[#05070b] text-white" style={{ fontFamily: PAGE_FONT }}>
      <header
        className="sticky top-0 z-30 border-b border-white/[0.065] bg-[#05070b]/92 px-4 pb-3 backdrop-blur-xl"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}
      >
        <div className="mx-auto grid w-full max-w-[430px] grid-cols-[40px_1fr_40px] items-center">
          <button
            type="button"
            aria-label={t(language, 'common.back', '返回')}
            onClick={closeEarningsCalendar}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.035] text-white/[0.65] active:scale-95"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <h1 className="text-center text-[16px] font-normal tracking-[0.02em] text-white/[0.86]">
            {t(language, 'earningsCalendar.title', '财报日历')}
          </h1>
          <span />
        </div>
      </header>

      <main className="mx-auto w-[calc(100%-32px)] max-w-[430px] pb-[calc(78px+env(safe-area-inset-bottom))] pt-3">
        <EarningsCalendar
          variant="standalone"
          watchlist={watchlist}
          positions={investmentSummary?.activePositions || []}
          quoteRows={quoteRows}
          stockFreshnessStartedAt={stockFreshnessStartedAt}
          logoCache={logoCache}
          cacheStockLogo={cacheStockLogo}
          displayStockName={displayStockName}
          language={language}
          marketColorMode={marketColorMode}
          supabase={supabase}
          eventsOverride={earningsCalendarEvents}
          requestEventsOverride={earningsCalendarRequest}
          now={earningsCalendarNow || Date.now}
          initialView={earningsCalendarPageState?.view}
          initialSelectedDate={earningsCalendarPageState?.selectedDate}
          onCalendarStateChange={onEarningsCalendarStateChange}
          onOpenDetail={openEarningsDetail}
        />
      </main>
    </div>
  );
}
