import React from 'react';
import { ChevronDown } from 'lucide-react';
import VixComparisonPage from '../pages/VixComparisonPage.jsx';
import { normalizeVixComparison } from '../lib/vixComparison.js';
import { VIX_RISK_SCENARIOS } from './vixRiskPreviewData.js';

// DEV-only: all scenarios and historical cutoffs enter the production model.
// No interpretation result is injected into VixComparisonPage.
export function buildVixRiskScenarioData(scenario) {
  const valid = scenario.points.filter(point => Number.isFinite(point.vix));
  let termRows = scenario.points.filter((point, index) => Number.isFinite(point.vix) && Number.isFinite(point.ratio)
    && !scenario.missingTermIndexes?.includes(index))
    .map(point => ({ date: point.date, vix: point.vix, vix3m: point.vix / point.ratio, ratio: point.ratio }));
  if (scenario.termHistoryLimit) termRows = termRows.slice(-scenario.termHistoryLimit);
  return {
    version: 2, source: 'DEMO', asOfDate: valid.at(-1).date, expectedAsOfDate: scenario.asOfDate,
    availableFromDate: valid[0].date, pointCount: valid.length,
    fetchedAt: new Date().toISOString(), stale: Boolean(scenario.missing),
    staleReason: scenario.missing ? 'incomplete_close' : '',
    series: Object.fromEntries(['VIX', 'SPY', 'QQQ'].map(symbol => [symbol, {
      symbol, priceBasis: symbol === 'VIX' ? 'close' : 'adjusted_close', unit: symbol === 'VIX' ? 'points' : 'USD',
      rows: valid.filter((_, index) => symbol !== scenario.missingBenchmark || index !== valid.length - 1)
        .map(point => ({ date: point.date, close: symbol === 'VIX' ? point.vix : point[symbol] })),
    }])),
    termStructure: { source: 'CBOE', asOfDate: termRows.at(-1)?.date || null,
      expectedAsOfDate: scenario.asOfDate, fetchedAt: new Date().toISOString(), stale: Boolean(scenario.missing),
      staleReason: scenario.missing ? 'incomplete_close' : '', rows: termRows },
  };
}

export function cutoffVixCapturedData(data, cutoff) {
  if (!cutoff) return data;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) return null;
  const availableDates = [...(data.termStructure?.rows || []), ...Object.values(data.series || {}).flatMap(item => item.rows || [])]
    .map(row => row.date).filter(date => date <= cutoff).sort();
  const effectiveCutoff = availableDates.at(-1);
  if (!effectiveCutoff) return null;
  const series = Object.fromEntries(Object.entries(data.series).map(([symbol, item]) => [symbol, {
    ...item, rows: item.rows.filter(row => row.date <= effectiveCutoff),
  }]));
  const rows = (data.termStructure?.rows || []).filter(row => row.date <= effectiveCutoff);
  const marketStale = Object.values(series).some(item => item.rows.at(-1)?.date !== effectiveCutoff);
  const termStale = rows.at(-1)?.date !== effectiveCutoff;
  return {
    ...data, series, expectedAsOfDate: effectiveCutoff, asOfDate: series.VIX.rows.at(-1)?.date || null,
    availableFromDate: series.VIX.rows[0]?.date || null, pointCount: series.VIX.rows.length,
    stale: marketStale, staleReason: marketStale ? 'incomplete_close' : '', previewCutoff: effectiveCutoff,
    termStructure: { ...data.termStructure, rows, expectedAsOfDate: effectiveCutoff,
      asOfDate: rows.at(-1)?.date || null, stale: termStale, staleReason: termStale ? 'incomplete_close' : '' },
  };
}

export default function VixRiskDesignPreview({ ctx = {} }) {
  const params = new URLSearchParams(window.location.search);
  const captured = params.get('vixCaptured') === '1';
  const en = Boolean(ctx.englishMode);
  const [scenarioId, setScenarioId] = React.useState(() => {
    const requested = params.get('stage') || 'stress';
    return requested === 'normal' ? 'caution' : requested;
  });
  const [cutoff, setCutoff] = React.useState(() => params.get('cutoff') || '');
  const [live, setLive] = React.useState({ data: null, error: false });
  const scenario = VIX_RISK_SCENARIOS.find(item => item.id === scenarioId) || VIX_RISK_SCENARIOS.find(item => item.id === 'stress');
  const demo = React.useMemo(() => buildVixRiskScenarioData(scenario), [scenario]);
  const replay = React.useMemo(() => live.data ? cutoffVixCapturedData(live.data, cutoff) : null, [live.data, cutoff]);
  React.useEffect(() => {
    if (!captured) return undefined;
    const controller = new AbortController();
    fetch('/__vix-comparison-preview.json', { cache: 'no-store', signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('unavailable'); return response.json(); })
      .then(value => {
        const data = normalizeVixComparison(value);
        if (!data) throw new Error('invalid capture');
        if (!controller.signal.aborted) setLive({ data, error: false });
      })
      .catch(() => { if (!controller.signal.aborted) setLive({ data: null, error: true }); });
    return () => controller.abort();
  }, [captured]);
  React.useEffect(() => {
    if (params.get('section') !== 'chart') return;
    const frame = requestAnimationFrame(() => document.querySelector('[data-vix-risk-history]')?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [captured, replay, scenarioId]);
  if (captured && !live.data) return <p className="py-12 text-center text-[12px] text-white/50" role="status">{live.error
    ? (en ? 'Captured official data could not be loaded.' : '官方收盘快照无法读取。')
    : (en ? 'Loading captured official closes…' : '正在读取官方收盘快照…')}</p>;
  return <>
    {!captured ? <details className="mt-2 rounded-lg border border-white/10 px-3 text-[11px] text-white/50">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between"><span>{en ? 'Local scenarios · simulated data' : '本地组合场景 · 模拟数据'}</span><span className="flex items-center gap-1">{scenario.label[en ? 'en' : 'zh']}<ChevronDown size={12}/></span></summary>
      <div className="flex flex-wrap gap-2 pb-3">{VIX_RISK_SCENARIOS.map(item => <button type="button" key={item.id}
        aria-pressed={item.id === scenario.id} onClick={() => setScenarioId(item.id)}
        className={`rounded-md px-3 py-2 ${item.id === scenario.id ? 'bg-white/10 text-white' : 'bg-white/[0.03]'}`}>{item.label[en ? 'en' : 'zh']}</button>)}</div>
    </details> : <details className="mt-2 rounded-lg border border-white/10 px-3 text-[11px] text-white/50">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between"><span>{en ? 'Captured data · historical replay' : '官方快照 · 历史回放'}</span><span className="flex items-center gap-1">{replay?.expectedAsOfDate || '—'}<ChevronDown size={12}/></span></summary>
      <div className="flex flex-wrap items-center gap-2 pb-3"><input type="date" aria-label={en ? 'Replay cutoff date' : '历史截断日期'} value={cutoff} max={live.data.asOfDate} min={live.data.availableFromDate} onChange={event => setCutoff(event.target.value)} className="rounded-md border border-white/10 bg-transparent px-2 py-2 text-white/70" />{['2025-04-08', '2026-03-30'].map(date => <button key={date} type="button" onClick={() => setCutoff(date)} className="rounded-md bg-white/[0.04] px-2 py-2">{date}</button>)}<button type="button" onClick={() => setCutoff('')} className="rounded-md bg-white/[0.04] px-2 py-2">{en ? 'Latest' : '最新'}</button></div>
    </details>}
    {captured && !replay ? <p role="status" className="py-12 text-center text-[12px] text-white/50">{en ? 'No captured data at or before this cutoff.' : '该截断日期之前暂无已捕获的数据。'}</p>
      : <VixComparisonPage key={captured ? `captured-${replay.expectedAsOfDate}` : scenario.id} ctx={ctx} previewData={captured ? replay : demo}/>}
  </>;
}
