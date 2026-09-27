import React from 'react';
import { ChevronDown } from 'lucide-react';
import VixComparisonPage from '../pages/VixComparisonPage.jsx';
import { normalizeVixComparison } from '../lib/vixComparison.js';
import { VIX_RISK_SCENARIOS } from './vixRiskPreviewData.js';

// This wrapper is reachable only through the existing DEV visual preview.
// Production uses VixComparisonPage without injected data or scenario controls.
function scenarioData(scenario) {
  const valid = scenario.points.filter(point => Number.isFinite(point.vix));
  const termRows = scenario.points.filter(point => Number.isFinite(point.vix) && Number.isFinite(point.ratio))
    .map(point => ({ date: point.date, vix: point.vix, vix3m: point.vix / point.ratio, ratio: point.ratio }));
  return {
    version: 2, source: 'DEMO', asOfDate: valid.at(-1).date, expectedAsOfDate: scenario.asOfDate,
    availableFromDate: valid[0].date, pointCount: valid.length,
    fetchedAt: new Date().toISOString(), stale: Boolean(scenario.missing),
    staleReason: scenario.missing ? 'incomplete_close' : '',
    series: Object.fromEntries(['VIX', 'SPY', 'QQQ'].map(symbol => [symbol, {
      symbol, priceBasis: symbol === 'VIX' ? 'close' : 'adjusted_close', unit: symbol === 'VIX' ? 'points' : 'USD',
      rows: valid.map(point => ({ date: point.date, close: symbol === 'VIX' ? point.vix : point[symbol] })),
    }])),
    termStructure: { source: 'CBOE', asOfDate: termRows.at(-1)?.date || null,
      expectedAsOfDate: scenario.asOfDate, fetchedAt: new Date().toISOString(), stale: Boolean(scenario.missing),
      staleReason: scenario.missing ? 'incomplete_close' : '', rows: termRows },
  };
}

export default function VixRiskDesignPreview({ ctx = {} }) {
  const params = new URLSearchParams(window.location.search);
  const captured = params.get('vixCaptured') === '1';
  const en = Boolean(ctx.englishMode);
  const [scenarioId, setScenarioId] = React.useState(() => params.get('stage') || 'stress');
  const [live, setLive] = React.useState({ data: null, error: false });
  const scenario = VIX_RISK_SCENARIOS.find(item => item.id === scenarioId) || VIX_RISK_SCENARIOS[2];
  const demo = React.useMemo(() => scenarioData(scenario), [scenario]);
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
  }, [captured, live.data]);
  if (captured && !live.data) return <p className="py-12 text-center text-[12px] text-white/50" role="status">{live.error
    ? (en ? 'Captured official data could not be loaded.' : '官方收盘快照无法读取。')
    : (en ? 'Loading captured official closes…' : '正在读取官方收盘快照…')}</p>;
  return <>
    {!captured && <details className="mt-2 rounded-lg border border-white/10 px-3 text-[11px] text-white/50">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between"><span>{en ? 'Local design scenarios' : '本地设计场景'}</span><span className="flex items-center gap-1">{scenario.label[en ? 'en' : 'zh']}<ChevronDown size={12}/></span></summary>
      <div className="flex flex-wrap gap-2 pb-3">{VIX_RISK_SCENARIOS.map(item => <button type="button" key={item.id}
        aria-pressed={item.id === scenario.id} onClick={() => setScenarioId(item.id)}
        className={`rounded-md px-3 py-2 ${item.id === scenario.id ? 'bg-white/10 text-white' : 'bg-white/[0.03]'}`}>{item.label[en ? 'en' : 'zh']}</button>)}</div>
    </details>}
    <VixComparisonPage key={captured ? 'captured' : scenario.id} ctx={ctx} previewData={captured ? live.data : demo}/>
  </>;
}
