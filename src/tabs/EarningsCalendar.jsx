import React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  buildCalendarMonth,
  buildEarningsSymbols,
  dateKey,
  earningsSessionDotClass,
  earningsSessionText,
  groupEarningsByDate,
  monthLabel,
  normalizeEarningsEvents,
  shortDateLabel,
  todayDateKey,
} from '../lib/earningsCalendarModel.js';
import { t } from '../lib/i18n.js';

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';

function formatRevenueUsd(value, language = 'zh') {
  if (value === null || value === undefined || value === '') return '--';
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  const abs = Math.abs(n);
  if (language === 'en') {
    if (abs >= 1_000_000_000) return `$${trimFixed(n / 1_000_000_000)}B`;
    if (abs >= 1_000_000) return `$${trimFixed(n / 1_000_000)}M`;
    return `$${trimFixed(n)}`;
  }
  if (abs >= 100_000_000) return `${trimFixed(n / 100_000_000)}亿美元`;
  if (abs >= 10_000_000) return `${trimFixed(n / 10_000_000)}千万美元`;
  if (abs >= 1_000_000) return `${trimFixed(n / 1_000_000)}百万美元`;
  return `${trimFixed(n)}美元`;
}

function trimFixed(value, digits = 1) {
  return Number(value).toFixed(digits).replace(/\.0$/, '');
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || value === '') return '--';
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return n.toFixed(digits);
}

function logoUrls(symbol, cachedUrl) {
  const upper = String(symbol || '').trim().toUpperCase();
  const urls = [];
  if (cachedUrl) urls.push(cachedUrl);
  if (upper) {
    urls.push(`https://eodhd.com/img/logos/US/${upper}.png`);
    urls.push(`https://financialmodelingprep.com/image-stock/${upper}.png`);
  }
  return Array.from(new Set(urls));
}

function EarningsLogo({ symbol, urls = [], onLogoLoad, className = '' }) {
  const candidates = React.useMemo(() => urls.filter(Boolean), [urls]);
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    setIndex(0);
  }, [symbol, candidates.join('|')]);

  if (!candidates.length || index >= candidates.length) {
    return (
      <span className={`flex items-center justify-center rounded-lg bg-white/[0.08] text-[10px] font-semibold text-white/50 ${className}`}>
        {String(symbol || '?').slice(0, 2)}
      </span>
    );
  }

  return (
    <img
      src={candidates[index]}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={`bg-black/30 object-contain ${className}`}
      onLoad={(event) => {
        if (typeof onLogoLoad === 'function') onLogoLoad(symbol, event.currentTarget.src);
      }}
      onError={() => setIndex((current) => current + 1)}
    />
  );
}

function addMonths(month, delta) {
  const key = `${String(month || todayDateKey()).slice(0, 7)}-01`;
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}

function eventDisplayName(event, displayStockName, language) {
  if (typeof displayStockName === 'function') return displayStockName(event.symbol, event.name || event.symbol, language);
  return event.name || event.symbol;
}

function impactText(event, language) {
  if (event.impact === 'high') return t(language, 'earningsCalendar.impact.high', '高影响');
  if (event.impact === 'medium') return t(language, 'earningsCalendar.impact.medium', '中影响');
  return t(language, 'earningsCalendar.impact.normal', '关注');
}

function impactClass(event) {
  if (event.impact === 'high') return 'text-[#ff4b1f]';
  if (event.impact === 'medium') return 'text-[#f6b54b]';
  return 'text-white/42';
}

function DayDots({ events }) {
  const sessions = events.slice(0, 3).map((event) => event.session);
  return (
    <div className="mt-1 flex h-1.5 items-center justify-center gap-1">
      {sessions.map((session, index) => (
        <span key={`${session}-${index}`} className={`h-1.5 w-1.5 rounded-full ${earningsSessionDotClass(session)}`} />
      ))}
    </div>
  );
}

function EarningsEventRow({ event, logoCache, cacheStockLogo, displayStockName, language }) {
  const name = eventDisplayName(event, displayStockName, language);
  const cachedLogoUrl = logoCache?.[event.symbol]?.url;
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] text-white/52">
        <span>{shortDateLabel(event.reportDate)}</span>
        <span>{earningsSessionText(event.session, language)}</span>
      </div>
      <div className="grid grid-cols-[minmax(78px,1fr)_52px_92px_38px] items-center gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <EarningsLogo symbol={event.symbol} urls={logoUrls(event.symbol, cachedLogoUrl)} onLogoLoad={cacheStockLogo} className="h-7 w-7 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-normal text-white/82">{event.symbol}</div>
            <div className="truncate text-[10px] text-white/42">{name}</div>
          </div>
        </div>
        <div className="text-left">
          <div className="text-[10px] text-white/36">{t(language, 'earningsCalendar.epsEstimate', '预计EPS')}</div>
          <div className="mt-0.5 text-[12px] text-white/80 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{formatNumber(event.epsEstimate)}</div>
        </div>
        <div className="text-left">
          <div className="text-[10px] text-white/36">{t(language, 'earningsCalendar.revenueEstimate', '预计营收')}</div>
          <div className="mt-0.5 whitespace-nowrap text-[11px] text-white/80 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{formatRevenueUsd(event.revenueEstimateUsd ?? (event.currency === 'USD' ? event.revenueEstimate : null), language)}</div>
        </div>
        <div className={`text-right text-[11px] font-normal ${impactClass(event)}`}>
          {impactText(event, language)}
        </div>
      </div>
    </div>
  );
}

function EarningsModal({
  open,
  onClose,
  events,
  selectedDate,
  setSelectedDate,
  view,
  setView,
  logoCache,
  cacheStockLogo,
  displayStockName,
  language,
  loading,
}) {
  const [visibleMonth, setVisibleMonth] = React.useState(() => (selectedDate || todayDateKey()).slice(0, 7));
  const grouped = React.useMemo(() => groupEarningsByDate(events), [events]);
  const monthDays = React.useMemo(() => buildCalendarMonth(`${visibleMonth}-01`, events), [visibleMonth, events]);
  const selectedEvents = grouped.get(selectedDate) || [];
  const eventDates = React.useMemo(() => Array.from(grouped.keys()).sort(), [grouped]);
  const listEvents = React.useMemo(() => events.slice(0, 80), [events]);

  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  React.useEffect(() => {
    if (selectedDate) setVisibleMonth(selectedDate.slice(0, 7));
  }, [selectedDate]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/72 px-3 py-[calc(env(safe-area-inset-top)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-[3px]" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex max-h-[86dvh] w-full max-w-[410px] flex-col rounded-[22px] border border-white/10 bg-[#0b0f14] p-4 shadow-[0_24px_72px_rgba(0,0,0,0.68),inset_0_1px_0_rgba(255,255,255,0.06)]" style={{ fontFamily: FONT }}>
        <div className="flex shrink-0 items-center justify-between">
          <div className="text-[14px] font-bold leading-none text-white">
            {t(language, 'earningsCalendar.title', '财报日历')}
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/42 active:scale-95">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid shrink-0 grid-cols-2 rounded-lg border border-white/[0.06] bg-white/[0.045] p-1">
          {[
            ['calendar', t(language, 'earningsCalendar.calendarView', '日历视图')],
            ['list', t(language, 'earningsCalendar.listView', '列表视图')],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`h-8 rounded-md text-[13px] font-normal active:scale-[0.99] ${view === key ? 'bg-[#f6b54b]/16 text-[#f6b54b]' : 'text-white/46'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'calendar' ? (
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))} className="flex h-8 w-8 items-center justify-center rounded-full text-white/54 active:scale-95">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="text-[15px] font-normal text-white/78">{monthLabel(`${visibleMonth}-01`, language)}</div>
              <button type="button" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))} className="flex h-8 w-8 items-center justify-center rounded-full text-white/54 active:scale-95">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-7 border-b border-white/[0.06] pb-2 text-center text-[11px] text-white/42">
              {(language === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['日', '一', '二', '三', '四', '五', '六']).map((item) => <span key={item}>{item}</span>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-y-1 text-center">
              {monthDays.map((day) => {
                const active = selectedDate === day.key;
                const hasEvents = day.events.length > 0;
                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => {
                      setSelectedDate(day.key);
                      setVisibleMonth(day.key.slice(0, 7));
                    }}
                    className={`mx-auto flex h-11 w-11 flex-col items-center justify-center rounded-xl text-[14px] font-normal active:scale-95 ${
                      active
                        ? 'border border-[#f6b54b]/65 bg-[#f6b54b]/12 text-[#ffd18a]'
                        : day.inMonth ? 'text-white/76' : 'text-white/20'
                    }`}
                  >
                    <span>{day.day}</span>
                    {hasEvents ? <DayDots events={day.events} /> : <span className="mt-1 h-1.5" />}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 space-y-2">
              <div className="text-[12px] text-white/42">
                {selectedDate ? `${selectedDate} · ${selectedEvents.length || 0} ${t(language, 'earningsCalendar.eventsUnit', '项')}` : t(language, 'earningsCalendar.noDateSelected', '选择日期查看财报')}
              </div>
              {selectedEvents.length === 0 ? (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-5 text-center text-[13px] text-white/36">
                  {loading ? t(language, 'earningsCalendar.loading', '正在读取财报日历') : t(language, 'earningsCalendar.noEventsOnDate', '当天没有关注股票财报')}
                </div>
              ) : selectedEvents.map((event) => (
                <EarningsEventRow key={event.id} event={event} logoCache={logoCache} cacheStockLogo={cacheStockLogo} displayStockName={displayStockName} language={language} />
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
            <div className="mb-3 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button type="button" onClick={() => setSelectedDate(eventDates[0] || todayDateKey())} className="h-8 shrink-0 rounded-full px-3 text-[12px] text-[#f6b54b]">
                {t(language, 'earningsCalendar.all', '全部')}
              </button>
              {eventDates.slice(0, 6).map((key) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => {
                    setSelectedDate(key);
                    setView('calendar');
                  }}
                  className="h-8 shrink-0 rounded-full px-3 text-[12px] text-white/48"
                >
                  {shortDateLabel(key)}
                </button>
              ))}
              <button type="button" onClick={() => setView('calendar')} className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04] text-white/48">
                <CalendarDays className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              {listEvents.length === 0 ? (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-8 text-center text-[13px] text-white/36">
                  {loading ? t(language, 'earningsCalendar.loading', '正在读取财报日历') : t(language, 'earningsCalendar.noEvents', '暂无关注股票财报')}
                </div>
              ) : listEvents.map((event) => (
                <EarningsEventRow key={event.id} event={event} logoCache={logoCache} cacheStockLogo={cacheStockLogo} displayStockName={displayStockName} language={language} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 shrink-0 text-[10px] leading-4 text-white/30">
          {t(language, 'earningsCalendar.disclaimer', '财报时间为预计时间,实际可能因公司公告调整,请以官方发布为准。')}
        </div>
      </div>
    </div>
  );
}

export default function EarningsCalendar({
  watchlist = [],
  positions = [],
  logoCache,
  cacheStockLogo,
  displayStockName,
  language = 'zh',
  supabase,
  eventsOverride = null,
}) {
  const symbols = React.useMemo(() => buildEarningsSymbols({ watchlist, positions }), [watchlist, positions]);
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalView, setModalView] = React.useState('calendar');
  const [selectedDate, setSelectedDate] = React.useState(todayDateKey());

  React.useEffect(() => {
    let cancelled = false;
    if (Array.isArray(eventsOverride)) {
      const normalized = normalizeEarningsEvents(eventsOverride, { watchlist, positions });
      setEvents(normalized);
      setError('');
      setLoading(false);
      const first = normalized.find((item) => item.reportDate >= todayDateKey()) || normalized[0];
      if (first) setSelectedDate(first.reportDate);
      return () => { cancelled = true; };
    }

    if (!symbols.length || !supabase?.auth?.getSession) {
      setEvents([]);
      setError('');
      return () => { cancelled = true; };
    }

    const from = new Date();
    from.setDate(from.getDate() - 7);
    const to = new Date();
    to.setDate(to.getDate() + 45);

    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error(t(language, 'earningsCalendar.authRequired', '请先登录后查看财报日历'));
        const params = new URLSearchParams({
          symbols: symbols.join(','),
          from: from.toISOString().slice(0, 10),
          to: to.toISOString().slice(0, 10),
        });
        const response = await fetch(`/api/earnings-calendar?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await response.json().catch(() => null);
        if (!response.ok || body?.success === false) throw new Error(body?.error || response.statusText || 'request failed');
        if (cancelled) return;
        const normalized = normalizeEarningsEvents(body?.events || [], { watchlist, positions });
        setEvents(normalized);
        const first = normalized.find((item) => item.reportDate >= todayDateKey()) || normalized[0];
        if (first) setSelectedDate(first.reportDate);
      } catch (fetchError) {
        if (!cancelled) {
          setEvents([]);
          setError(fetchError?.message || t(language, 'earningsCalendar.loadFailed', '财报日历读取失败'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [symbols.join(','), supabase, language, watchlist, positions, eventsOverride]);

  const visibleEvents = React.useMemo(() => {
    const today = todayDateKey();
    return events.filter((event) => event.reportDate >= today).slice(0, 5);
  }, [events]);
  const previewEvents = visibleEvents.length ? visibleEvents : events.slice(0, 5);

  const openModal = (view = 'calendar', date = selectedDate) => {
    setSelectedDate(date || selectedDate || todayDateKey());
    setModalView(view);
    setModalOpen(true);
  };

  return (
    <section className="mt-3 rounded-2xl border border-white/10 bg-[#0b0f14] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" style={{ fontFamily: FONT }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[14px] font-bold leading-none text-white">
          {t(language, 'earningsCalendar.title', '财报日历')}
        </div>
        <button
          type="button"
          onClick={() => openModal('list')}
          className="flex items-center gap-1 text-[13px] font-normal text-[#f6b54b] active:scale-95"
        >
          {t(language, 'earningsCalendar.all', '全部')}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div
        className="grid min-h-[88px] items-stretch overflow-hidden"
        style={{ gridTemplateColumns: previewEvents.length > 0 ? `repeat(${previewEvents.length}, minmax(0, 1fr)) 42px` : '1fr' }}
      >
        {previewEvents.length === 0 ? (
          <div className="flex min-h-[88px] flex-1 items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-white/[0.025] px-4 text-center text-[12px] text-white/36">
            {loading ? t(language, 'earningsCalendar.loading', '正在读取财报日历') : error || t(language, 'earningsCalendar.noEvents', '暂无关注股票财报')}
          </div>
        ) : (
          previewEvents.map((event, index) => {
            const cachedLogoUrl = logoCache?.[event.symbol]?.url;
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => openModal('calendar', event.reportDate)}
                className={`flex min-w-0 flex-col items-center justify-center rounded-xl px-1 py-1.5 active:scale-[0.98] ${
                  index < previewEvents.length - 1 ? 'border-r border-white/[0.08]' : ''
                }`}
              >
                <div className="text-[12px] leading-none tabular-nums text-white/35">{shortDateLabel(event.reportDate)}</div>
                <EarningsLogo symbol={event.symbol} urls={logoUrls(event.symbol, cachedLogoUrl)} onLogoLoad={cacheStockLogo} className="mt-2 h-7 w-7 rounded-md" />
                <div className="mt-1.5 max-w-full truncate text-[12px] leading-none font-normal text-white/82">{event.symbol}</div>
                <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${earningsSessionDotClass(event.session)}`} />
              </button>
            );
          })
        )}
        {previewEvents.length > 0 && (
          <button
            type="button"
            onClick={() => openModal('calendar')}
            className="ml-2 flex min-w-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-white/48 active:scale-[0.98]"
            aria-label={t(language, 'earningsCalendar.calendarView', '日历视图')}
          >
            <CalendarDays className="h-5 w-5" />
          </button>
        )}
      </div>

      <EarningsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        events={events}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        view={modalView}
        setView={setModalView}
        logoCache={logoCache}
        cacheStockLogo={cacheStockLogo}
        displayStockName={displayStockName}
        language={language}
        loading={loading}
      />
    </section>
  );
}
