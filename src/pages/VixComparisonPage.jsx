import React from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import VixComparisonChart, { ETF_LINE_COLOR, VIX_LINE_COLOR } from '../components/VixComparisonChart.jsx';
import { loadVixComparison } from '../lib/vixComparison.js';
import { buildVixComparisonModel, formatVixComparisonChangePercent, VIX_COMPARISON_RANGES } from '../lib/vixComparisonChart.js';
import { marketTextClass } from '../lib/marketColorMode.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const RANGE_LABELS = { '1m': '1月', '3m': '3月', '6m': '6月', '1y': '1年', '5y': '5年' };

function number(value, digits = 2) {
  return Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
}

function DailyChange({ value, englishMode, marketColorMode }) {
  const color = Number.isFinite(value) && value !== 0 ? marketTextClass(value, marketColorMode) : 'text-white/45';
  return (
    <div className="mt-1.5 flex items-baseline gap-2 text-[12px] tabular-nums" data-vix-daily-change="true">
      <span className="text-[11px] text-white/40">{englishMode ? 'Day' : '当日涨跌'}</span>
      <span className={color} style={{ fontFamily: NUMBER_FONT }}>{formatVixComparisonChangePercent(value)}</span>
    </div>
  );
}

export default function VixComparisonPage({ ctx = {}, previewData }) {
  const { closeVixComparison, userId = '' } = ctx;
  const englishMode = ctx.englishMode ?? ctx.language === 'en';
  const demoData = import.meta.env.DEV ? previewData : null;
  const [symbol, setSymbol] = React.useState('SPY');
  const [range, setRange] = React.useState('1y');
  const [refreshVersion, setRefreshVersion] = React.useState(0);
  const [state, setState] = React.useState({ userId, data: demoData || null, loading: !demoData, error: false });
  const requestRef = React.useRef(0);

  React.useEffect(() => {
    const requestId = ++requestRef.current;
    if (demoData) {
      setState({ userId, data: demoData, loading: false, error: false });
      return () => { if (requestRef.current === requestId) requestRef.current += 1; };
    }
    setState(current => ({ userId, data: current.userId === userId ? current.data : null, loading: true, error: false }));
    loadVixComparison({ userId, force: refreshVersion > 0 })
      .then(data => {
        if (requestRef.current === requestId) setState({ userId, data, loading: false, error: false });
      })
      .catch(error => {
        if (requestRef.current !== requestId) return;
        setState(current => ({ userId, data: error?.code !== 'AUTH_REQUIRED' && current.userId === userId ? current.data : null, loading: false, error: true }));
      });
    return () => { if (requestRef.current === requestId) requestRef.current += 1; };
  }, [demoData, refreshVersion, userId]);

  const data = state.userId === userId ? state.data : null;
  const model = React.useMemo(() => buildVixComparisonModel({
    vixRows: data?.series?.VIX?.rows,
    benchmarkRows: data?.series?.[symbol]?.rows,
    range,
  }), [data, range, symbol]);
  const changeLabel = model.priceChangePct === null ? '—' : `${model.priceChangePct > 0 ? '+' : ''}${number(model.priceChangePct)}%`;
  const stale = Boolean(data?.stale || (data?.expectedAsOfDate && model.to && model.to < data.expectedAsOfDate));
  const partialHistory = model.hasComparison && data?.availableFromDate > model.requestedFrom
    && (new Date(`${data.availableFromDate}T00:00:00Z`) - new Date(`${model.requestedFrom}T00:00:00Z`)) > 7 * 86400000;

  return (
    <div className="pb-4 text-white" style={{ paddingTop: 'calc(10px + env(safe-area-inset-top))' }} data-vix-comparison-page="true">
      <header className="relative mb-6 flex min-h-12 items-center justify-center">
        <button type="button" onClick={closeVixComparison} aria-label={englishMode ? 'Back to Home' : '返回首页'} className="absolute left-0 flex h-11 w-11 items-center justify-center rounded-full text-white/65 transition active:bg-white/[0.06]">
          <ArrowLeft className="h-5 w-5" strokeWidth={1.8} />
        </button>
        <div className="px-12 text-center">
          <h1 className="text-[17px] font-medium tracking-[.01em]">{englishMode ? 'VIX & Market Trends' : 'VIX 与市场走势'}</h1>
          <div className="mt-1 text-[11px] text-white/40">{englishMode ? 'Volatility and equity markets' : '波动率与股票市场对照'}</div>
        </div>
        <button type="button" disabled={state.loading || Boolean(demoData)} onClick={() => setRefreshVersion(version => version + 1)} aria-label={englishMode ? 'Refresh daily data' : '刷新日线数据'} className="absolute right-0 flex h-11 w-11 items-center justify-center rounded-full text-white/55 transition active:bg-white/[0.06] disabled:opacity-35">
          <RefreshCw className={`h-4 w-4 ${state.loading ? 'animate-spin' : ''}`} strokeWidth={1.7} />
        </button>
      </header>

      {demoData && <div className="mb-3 rounded-lg bg-amber-400/[0.08] px-3 py-2 text-[11px] text-amber-200/80">{englishMode ? 'Local preview · simulated data' : '本地效果预览 · 模拟数据'}</div>}

      <div className="mb-5 grid grid-cols-2 gap-1 rounded-[15px] bg-white/[0.045] p-1" role="group" aria-label={englishMode ? 'Comparison ETF' : '选择对比 ETF'}>
        {['SPY', 'QQQ'].map(item => <button key={item} type="button" onClick={() => setSymbol(item)} aria-pressed={symbol === item} className={`rounded-xl px-3 py-2.5 text-center transition ${symbol === item ? 'bg-white/[0.085] text-white' : 'text-white/40'}`}>
          <span className="text-[14px] font-medium">{item}</span>
          <span className="ml-2 text-[11px]">{item === 'SPY' ? (englishMode ? 'S&P 500' : '标普 500') : (englishMode ? 'Nasdaq-100' : '纳斯达克 100')}</span>
        </button>)}
      </div>

      <div className="mb-3 flex items-center justify-between gap-2 text-[11px] text-white/40">
        <span>{model.to ? `${model.to} · ${englishMode ? 'Common close' : '同日收盘'}` : englishMode ? 'Daily close' : '日线收盘数据'}</span>
        {stale && <span className="text-amber-200/80">{englishMode ? 'Update pending' : '待更新'}</span>}
      </div>

      {state.error && <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-amber-400/[0.07] px-3 py-2.5 text-[12px] text-amber-200/85">
        <span>{data ? (englishMode ? 'Refresh failed. Showing the previous data.' : '刷新失败，暂时保留上次数据。') : (englishMode ? 'Daily data could not be loaded.' : '日线数据暂时无法读取。')}</span>
        <button type="button" className="shrink-0 px-1 py-1 underline underline-offset-4" onClick={() => setRefreshVersion(version => version + 1)}>{englishMode ? 'Retry' : '重试'}</button>
      </div>}

      <section className="overflow-hidden rounded-[20px] border border-white/[0.075] bg-[#0b0c0e] px-3.5 pb-3.5 pt-4" aria-busy={state.loading}>
        <div className="grid grid-cols-2 gap-5 px-1">
          <div>
            <div className="flex items-center gap-1.5 text-[12px] text-white/50"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: VIX_LINE_COLOR }} />VIX</div>
            <div className="mt-1.5 text-[28px] font-normal leading-tight tabular-nums" style={{ color: VIX_LINE_COLOR, fontFamily: NUMBER_FONT }}>{number(model.last?.vix)}</div>
            <DailyChange value={model.last?.vixDayChangePct} englishMode={englishMode} marketColorMode={ctx.marketColorMode} />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[12px] text-white/50"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ETF_LINE_COLOR }} />{symbol}</div>
            <div className="mt-1.5 text-[28px] font-normal leading-tight tabular-nums" style={{ color: ETF_LINE_COLOR, fontFamily: NUMBER_FONT }}>{model.last ? `$${number(model.last.price)}` : '—'}</div>
            <DailyChange value={model.last?.priceDayChangePct} englishMode={englishMode} marketColorMode={ctx.marketColorMode} />
          </div>
        </div>
        {state.loading && !data ? <div className="flex min-h-[300px] items-center justify-center gap-2 text-[12px] text-white/40" role="status"><RefreshCw className="h-3.5 w-3.5 animate-spin" />{englishMode ? 'Loading daily history…' : '正在读取历史日线…'}</div> : <VixComparisonChart model={model} symbol={symbol} englishMode={englishMode} marketColorMode={ctx.marketColorMode} />}
        <div className="mt-2 grid grid-cols-5 gap-1 border-t border-white/[0.055] pt-3" role="group" aria-label={englishMode ? 'Chart period' : '走势时间范围'}>
          {VIX_COMPARISON_RANGES.map(item => <button key={item} type="button" onClick={() => setRange(item)} aria-pressed={range === item} className={`min-h-9 rounded-lg px-1 text-[12px] transition ${range === item ? 'bg-white/[0.09] text-white/90' : 'text-white/40 active:bg-white/[0.04]'}`}>{englishMode ? item.toUpperCase() : RANGE_LABELS[item]}</button>)}
        </div>
      </section>

      <section className="mt-4 grid grid-cols-3 divide-x divide-white/[0.065] rounded-[16px] bg-white/[0.025] py-4" aria-label={englishMode ? 'Selected period summary' : '所选区间摘要'}>
        <div className="min-w-0 px-2 text-center"><div className="text-[11px] text-white/40">{symbol} {englishMode ? 'return' : '区间涨跌'}</div><div className="mt-2 text-[16px] tabular-nums text-white/90" style={{ fontFamily: NUMBER_FONT }}>{changeLabel}</div></div>
        <div className="min-w-0 px-2 text-center"><div className="text-[11px] text-white/40">VIX {englishMode ? 'low' : '区间最低'}</div><div className="mt-2 text-[16px] tabular-nums text-white/90" style={{ fontFamily: NUMBER_FONT }}>{number(model.vixLow)}</div></div>
        <div className="min-w-0 px-2 text-center"><div className="text-[11px] text-white/40">VIX {englishMode ? 'high' : '区间最高'}</div><div className="mt-2 text-[16px] tabular-nums text-white/90" style={{ fontFamily: NUMBER_FONT }}>{number(model.vixHigh)}</div></div>
      </section>
      {model.hasComparison && <div className="mt-2 px-1 text-center text-[10px] text-white/30">{model.from} — {model.to} · {model.rows.length} {englishMode ? 'matched trading days' : '个共同交易日'}</div>}
      {partialHistory && <div className="mt-2 px-1 text-center text-[11px] text-amber-200/65">{englishMode ? `Available history starts ${model.from}; the selected period is not fully covered.` : `可用历史始于 ${model.from}，未覆盖完整所选区间。`}</div>}

      {stale && data?.expectedAsOfDate && <p className="mt-3 px-1 text-[11px] text-amber-200/65">{englishMode ? `Latest expected trading date: ${data.expectedAsOfDate}.` : `最近应有交易日：${data.expectedAsOfDate}。`}</p>}
    </div>
  );
}
