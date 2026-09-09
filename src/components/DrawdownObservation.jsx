import React from 'react';
import { ArrowDownUp, ArrowLeft, ArrowUpRight, ChevronRight, Info, RotateCcw } from 'lucide-react';
import { getSamePeriodReturn, selectObservationRows } from '../lib/drawdownObservationModel.js';
import './DrawdownObservation.css';

const percent = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(1)}%` : '—';
const money = value => Number.isFinite(value) ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const tone = value => !Number.isFinite(value) || value === 0 ? '' : value > 0 ? 'do-up' : 'do-down';
const shortDate = value => value ? value.slice(5).replace('-', '/') : '—';
const rowStatus = row => row.status === 'loading' ? '读取中' : row.status === 'error' ? '行情暂不可用' : !Number.isFinite(row.drawdownPct) ? '暂无有效历史' : [row.stale ? `待更新 · ${row.asOfDate}` : '', !row.historySufficient ? '不足 52 周 · 按可用历史' : ''].filter(Boolean).join(' · ');
const highLabel = row => row.historySufficient ? '距 52 周收盘高点' : '距可用历史收盘高点';

function DepthBar({ value, maxDepth = 50 }) {
  return <div className="do-depth-track" aria-hidden="true"><span style={{ width: `${Number.isFinite(value) ? Math.min(100, Math.max(0, -value / maxDepth * 100)) : 0}%` }} /></div>;
}

function PreviewHeader({ title, onBack, detail = false, date = '', demo = false, onRefresh, loading = false }) {
  return <>
    <header className="do-header">
      <button type="button" className="do-icon-button" onClick={onBack} aria-label={detail ? '返回回撤观察' : '返回首页'}><ArrowLeft size={21} /></button>
      <h1>{title}</h1><span className="do-header-unit">USD</span>
    </header>
    <div className="do-preview-label"><span className="do-preview-dot" />{demo ? '演示数据 · 非真实行情' : '复权收盘 · 非实时'}<span>{date || '读取中'}</span>{onRefresh && <button className="do-refresh" type="button" onClick={onRefresh} disabled={loading} aria-label="刷新回撤行情"><RotateCcw size={14} /></button>}</div>
  </>;
}

function MarketCard({ row, onOpen, maxDepth }) {
  return <button type="button" className="do-market-card" disabled={!Number.isFinite(row.drawdownPct)} onClick={() => onOpen(row.symbol)} aria-label={`查看 ${row.symbol} 回撤详情`}>
    <div className="do-market-name"><span>{row.symbol}</span><ChevronRight size={15} aria-hidden="true" /></div>
    <span className="do-market-description">{row.symbol === 'SPY' ? '标普 500 ETF' : '纳斯达克 100 ETF'}</span>
    <strong className={`do-market-value ${tone(row.drawdownPct)}`}>{percent(row.drawdownPct)}</strong>
    <DepthBar value={row.drawdownPct} maxDepth={maxDepth} />
    <div className="do-market-day"><span>最近交易日</span><span className={tone(row.todayPct)}>{percent(row.todayPct)}</span></div>
    {rowStatus(row) && <span className="do-row-status">{rowStatus(row)}</span>}
  </button>;
}

export function DrawdownObservationChart({ row, selectedIndex, onSelect }) {
  const container = React.useRef(null);
  const gesture = React.useRef(null);
  const gradientId = `do-area-${React.useId().replace(/:/g, '')}`;
  const [width, setWidth] = React.useState(360);
  React.useEffect(() => {
    const element = container.current;
    if (!element) return undefined;
    const measure = () => setWidth(Math.max(240, element.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const points = row.pointsSinceHigh;
  if (!points?.length) return <p className="do-empty">历史数据不足，暂时无法绘制回撤过程。</p>;
  const height = 290;
  const left = 38;
  const right = width - 10;
  const top = 18;
  const bottom = height - 29;
  const startTime = Date.parse(points[0].date);
  const timeSpan = Math.max(1, Date.parse(points.at(-1).date) - startTime);
  const depth = Math.max(10, Math.ceil(Math.max(...points.map(point => -point.drawdownPct)) / 10) * 10);
  const x = point => left + (Date.parse(point.date) - startTime) / timeSpan * (right - left);
  const y = value => top + (-value / depth) * (bottom - top);
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(point).toFixed(2)},${y(point.drawdownPct).toFixed(2)}`).join(' ');
  const low = points.reduce((a, b) => a.close <= b.close ? a : b);
  const latest = points.at(-1);
  const readoutIndex = selectedIndex === null ? points.length - 1 : Math.max(0, Math.min(points.length - 1, selectedIndex));
  const selected = points[readoutIndex];
  const indexAt = clientX => {
    const bounds = container.current.getBoundingClientRect();
    const localX = Math.min(right, Math.max(left, clientX - bounds.left));
    const timestamp = startTime + (localX - left) / (right - left) * timeSpan;
    return points.reduce((best, point, index) => Math.abs(Date.parse(point.date) - timestamp) < Math.abs(Date.parse(points[best].date) - timestamp) ? index : best, 0);
  };
  const cancelGesture = event => {
    const session = gesture.current;
    gesture.current = null;
    if (session && event.currentTarget.hasPointerCapture?.(session.pointerId)) event.currentTarget.releasePointerCapture(session.pointerId);
  };
  return <div ref={container} className="do-chart" role="slider" tabIndex={0} aria-label={`${row.symbol} 回撤曲线，左右方向键选日，Escape 回到最新`} aria-valuemin={0} aria-valuemax={points.length - 1} aria-valuenow={readoutIndex} aria-valuetext={`${selected.date}，${percent(selected.drawdownPct)}`} onPointerDown={event => {
    if (event.button !== 0 || event.isPrimary === false) return;
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false };
  }} onPointerMove={event => {
    const session = gesture.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const dx = Math.abs(event.clientX - session.x);
    const dy = Math.abs(event.clientY - session.y);
    if (!session.horizontal) {
      if (Math.max(dx, dy) < 8) return;
      if (dy >= dx) { cancelGesture(event); return; }
      session.horizontal = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    onSelect(indexAt(event.clientX));
  }} onPointerUp={event => {
    const session = gesture.current;
    const verticalScroll = session && !session.horizontal && Math.abs(event.clientY - session.y) >= 8
      && Math.abs(event.clientY - session.y) >= Math.abs(event.clientX - session.x);
    if (session && session.pointerId === event.pointerId && !verticalScroll) onSelect(indexAt(event.clientX));
    cancelGesture(event);
  }} onPointerCancel={cancelGesture} onLostPointerCapture={() => { gesture.current = null; }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); onSelect(null); return; }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : readoutIndex + (event.key === 'ArrowLeft' ? -1 : 1);
    onSelect(Math.max(0, Math.min(points.length - 1, next)));
  }}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${row.symbol} 从 ${row.highDate} 高点到 ${row.asOfDate} 的回撤过程，高点为零`}>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#50c8a0" stopOpacity=".035" /><stop offset="1" stopColor="#50c8a0" stopOpacity=".16" /></linearGradient></defs>
      {[0, -depth / 2, -depth].map(value => <g key={value}><line className="do-chart-grid" x1={left} x2={right} y1={y(value)} y2={y(value)} /><text className="do-chart-axis" x={left - 7} y={y(value) + 4} textAnchor="end">{value}%</text></g>)}
      <path d={`${path} L${x(latest)},${top} L${left},${top} Z`} fill={`url(#${gradientId})`} />
      <path className="do-chart-line" d={path} />
      <circle cx={x(low)} cy={y(low.drawdownPct)} r="3.5" fill="#50c8a0" />
      {Math.abs(x(low) - x(latest)) > 52 && <text className="do-chart-low" x={x(low) + (x(low) > width * .65 ? -8 : 8)} y={y(low.drawdownPct) - 12} textAnchor={x(low) > width * .65 ? 'end' : 'start'}>低点 {percent(low.drawdownPct)}</text>}
      <circle cx={x(latest)} cy={y(latest.drawdownPct)} r="4" fill="#50c8a0" />
      {selectedIndex !== null && <g><line className="do-chart-guide" x1={x(selected)} x2={x(selected)} y1={top} y2={bottom} /><circle cx={x(selected)} cy={y(selected.drawdownPct)} r="5" fill="#dce1df" stroke="#090a0c" strokeWidth="2" /></g>}
      <text className="do-chart-axis" x={left} y={height - 5}>{shortDate(points[0].date)}</text>
      {points.length > 2 && <text className="do-chart-axis" x={x(points[Math.floor(points.length / 2)])} y={height - 5} textAnchor="middle">{shortDate(points[Math.floor(points.length / 2)].date)}</text>}
      {points.length > 1 && <text className="do-chart-axis" x={right} y={height - 5} textAnchor="end">{shortDate(latest.date)}</text>}
    </svg>
  </div>;
}

export function DrawdownObservationDetail({ row, onBack, observations = [], demo = false }) {
  const [selectedIndex, setSelectedIndex] = React.useState(null);
  const inspection = React.useRef(null);
  React.useEffect(() => {
    if (selectedIndex === null) return undefined;
    const release = event => { if (!inspection.current?.contains(event.target)) setSelectedIndex(null); };
    document.addEventListener('pointerdown', release, true);
    return () => document.removeEventListener('pointerdown', release, true);
  }, [selectedIndex]);
  const point = row.pointsSinceHigh?.[selectedIndex ?? row.pointsSinceHigh.length - 1];
  const peers = [row.symbol, 'SPY', 'QQQ'].filter((symbol, index, values) => values.indexOf(symbol) === index);
  return <div className="do-page" data-drawdown-view="detail">
    <PreviewHeader title="回撤详情" onBack={onBack} detail date={row.asOfDate} demo={demo} />
    {rowStatus(row) && <p className="do-status" role="status">{rowStatus(row)}{row.stale && row.expectedAsOfDate ? `，最新应为 ${row.expectedAsOfDate}` : ''}</p>}
    <section className="do-detail-hero">
      <div className="do-detail-symbol"><div><h2>{row.symbol}</h2><span>{row.name}</span></div><span className="do-detail-type">{row.kind === 'etf' ? 'ETF' : '美股'}</span></div>
      <div className="do-hero-values"><div><span className="do-muted-label">{highLabel(row)}</span><strong className={`do-hero-depth ${tone(row.drawdownPct)}`}>{percent(row.drawdownPct)}</strong></div><div className="do-hero-today"><span className="do-muted-label">最近交易日</span><strong className={tone(row.todayPct)}>{percent(row.todayPct)}</strong><span>{money(row.price)}</span></div></div>
      <div className="do-high-reference"><span>参考高点 {money(row.high)}</span><span>{row.highDate} · {row.elapsedDays ?? '—'} 天前</span></div>
    </section>
    <section ref={inspection} className="do-journey" aria-label="本轮回撤过程">
      <div className="do-section-title"><h2>这一轮，跌到哪里了</h2><span>高点 = 0%</span></div>
      <div className="do-readout"><div><span>{point?.date ?? '—'}<small>{selectedIndex === null ? '最新' : '查看中'}</small></span><strong className={tone(point?.drawdownPct)}>{percent(point?.drawdownPct)}<small>{money(point?.close)}</small></strong></div><button type="button" className="do-reset" onClick={() => setSelectedIndex(null)} disabled={selectedIndex === null} aria-label="回到最新数据"><RotateCcw size={14} />回到最新</button></div>
      <DrawdownObservationChart row={row} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
    </section>
    <dl className="do-repair-metrics">
      <div><dt>从期间低点已反弹</dt><dd className={tone(row.reboundPct)}>{percent(row.reboundPct)}</dd><span>{shortDate(row.troughDate)} · {money(row.trough)}</span></div>
      <div><dt>回到高点还需上涨</dt><dd className={tone(row.recoveryPct)}>{percent(row.recoveryPct)}</dd><span>以当前价格计算</span></div>
    </dl>
    <section className="do-relative-section"><div className="do-section-title"><h2>同一段时间，大盘呢</h2></div><p className="do-quiet-note">{row.highDate ?? '—'} — {row.asOfDate ?? '—'}</p>
      <div className="do-relative-grid">{peers.map(symbol => {
        const raw = observations.find(item => item.symbol === symbol);
        const value = getSamePeriodReturn(raw, row.highDate, row.asOfDate);
        return <div key={symbol}><span>{symbol}</span><strong className={tone(value)}>{percent(value)}</strong></div>;
      })}</div>
      <p className="do-quiet-note">统一起止日期的价格涨跌，不是各自距高点的差。</p>
    </section>
    <details className="do-method"><summary><Info size={14} />数据口径与边界<ChevronRight size={14} /></summary><p>{demo ? '此页面使用模拟收盘序列，不代表真实行情。' : '使用 EODHD 日线复权收盘价，包含拆股、分红调整；不是盘中价。'}参考高点为数据截止日往前 364 天内的最高复权收盘价；历史不足时按可用区间计算。曲线仅展示该高点之后的过程。反弹与回到高点所需涨幅按最新观测计算，与个人持仓成本无关。跌幅不代表估值便宜或已经见底。</p><p>最近交易日涨跌相对前一条有效收盘记录计算。同周期比较必须有完全一致的起止日期，缺少数据时显示 —。查看本页不会更改首页基准或产生交易。</p></details>
  </div>;
}

export default function DrawdownObservation({ onBack, initialSymbol = '', observations = [], demo = false, vix = null, loading = false, refreshing = false, error = '', onRefresh, portfolioReady = true, portfolioError = '', initialViewState = {}, onViewStateChange }) {
  const [selectedSymbol, setSelectedSymbol] = React.useState(() => observations.some(row => row.symbol === initialSymbol) ? initialSymbol : null);
  React.useEffect(() => {
    if (selectedSymbol && !observations.some(row => row.symbol === selectedSymbol)) setSelectedSymbol(null);
  }, [selectedSymbol, observations]);
  const [scope, setScope] = React.useState(initialViewState.scope === 'holdings' ? 'holdings' : 'watchlist');
  const [minDepth, setMinDepth] = React.useState([0, 10, 20].includes(initialViewState.minDepth) ? initialViewState.minDepth : 0);
  const [order, setOrder] = React.useState(initialViewState.order === 'shallowest' ? 'shallowest' : 'deepest');
  const scrollRef = React.useRef(Number.isFinite(initialViewState.scrollTop) ? Math.max(0, initialViewState.scrollTop) : 0);
  const restoredRef = React.useRef(false);
  const inspectingRef = React.useRef(Boolean(selectedSymbol));
  inspectingRef.current = Boolean(selectedSymbol);
  React.useLayoutEffect(() => {
    if (restoredRef.current || selectedSymbol || loading) return;
    restoredRef.current = true;
    if (scrollRef.current > 0) window.scrollTo({ top: scrollRef.current, behavior: 'instant' });
  }, [selectedSymbol, loading]);
  React.useEffect(() => {
    if (!onViewStateChange) return undefined;
    const save = () => onViewStateChange({ scope, minDepth, order, scrollTop: scrollRef.current });
    const onScroll = () => {
      if (inspectingRef.current || !restoredRef.current) return;
      scrollRef.current = Math.max(0, window.scrollY);
      save();
    };
    save();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); save(); };
  }, [scope, minDepth, order, onViewStateChange]);
  const previousSymbol = React.useRef(selectedSymbol);
  React.useLayoutEffect(() => {
    if (previousSymbol.current === selectedSymbol) return;
    window.scrollTo({ top: selectedSymbol ? 0 : scrollRef.current, behavior: 'instant' });
    previousSymbol.current = selectedSymbol;
  }, [selectedSymbol]);
  const open = symbol => { scrollRef.current = window.scrollY; setSelectedSymbol(symbol); };
  const rows = selectObservationRows(observations, { scope, minDepth, order });
  const maxDepth = Math.max(10, Math.ceil(Math.max(0, ...observations.map(row => Math.abs(row.drawdownPct ?? 0))) / 10) * 10);
  const dates = [...new Set(observations.map(row => row.asOfDate).filter(Boolean))].sort();
  const dateLabel = dates.length > 1 ? `${dates[0]} — ${dates.at(-1)}` : dates[0];
  const missingCount = observations.filter(row => (scope === 'watchlist' ? row.inWatchlist : row.inHoldings) && !Number.isFinite(row.drawdownPct)).length;
  const scopeCount = observations.filter(row => scope === 'watchlist' ? row.inWatchlist : row.inHoldings).length;
  const selected = observations.find(row => row.symbol === selectedSymbol);
  if (selected) return <DrawdownObservationDetail key={`${selected.symbol}:${selected.asOfDate}`} row={selected} observations={observations} demo={demo} onBack={() => setSelectedSymbol(null)} />;
  return <div className="do-page" data-drawdown-view="overview">
    <PreviewHeader title="回撤观察" onBack={onBack} date={dateLabel} demo={demo} onRefresh={onRefresh} loading={loading || refreshing} />
    {loading && <p className="do-status" role="status">正在读取真实历史行情…</p>}
    {!loading && refreshing && <p className="do-status" role="status">后台更新中，已有数据仍可查看。</p>}
    {error && <p className="do-status" role="alert">{error}</p>}
    <section className="do-markets"><div className="do-section-title"><h2>先看大盘</h2><span>距 52 周收盘高点</span></div><div className="do-market-grid">{observations.filter(row => ['SPY', 'QQQ'].includes(row.symbol)).map(row => <MarketCard key={row.symbol} row={row} onOpen={open} maxDepth={maxDepth} />)}</div></section>
    {Number.isFinite(vix) && <div className="do-vix"><span>VIX<span className="do-vix-name">预期波动</span></span><strong>{vix.toFixed(1)}</strong><span className="do-vix-note">波动不等于方向</span></div>}
    <section className="do-watch-section" aria-label="个股回撤观察">
      <div className="do-scope-row"><div className="do-scopes">{[['watchlist', '自选'], ['holdings', '持仓']].map(([key, label]) => <button type="button" key={key} aria-pressed={scope === key} onClick={() => setScope(key)}>{label}</button>)}</div><span>{scopeCount} 只标的</span></div>
      <div className="do-filter-row"><div className="do-depth-filters" aria-label="按回撤深度筛选">{[[0, '全部'], [10, '≥10%'], [20, '≥20%']].map(([depth, label]) => <button type="button" key={depth} aria-pressed={minDepth === depth} onClick={() => setMinDepth(depth)}>{label}</button>)}</div><button type="button" className="do-sort" onClick={() => setOrder(order === 'deepest' ? 'shallowest' : 'deepest')} aria-label={order === 'deepest' ? '回撤由深到浅，点击改为由浅到深' : '回撤由浅到深，点击改为由深到浅'}><ArrowDownUp size={14} />{order === 'deepest' ? '深 → 浅' : '浅 → 深'}</button></div>
      {scope === 'holdings' && (!portfolioReady || portfolioError) && <p className="do-status" role="status">{portfolioError ? '持仓暂时无法读取，请返回首页重试。' : '正在读取实际持仓…'}</p>}
      <div className="do-list-count" aria-live="polite">{minDepth === 0 ? `${rows.length} 只标的` : `${rows.length} 只符合条件`}{missingCount > 0 && ` · ${missingCount} 只待数据`}<span>同一刻度</span></div>
      <div className="do-depth-axis" aria-hidden="true"><span>0%</span><span>−{maxDepth / 2}%</span><span>−{maxDepth}%</span></div>
      <div className="do-stock-list">{rows.map(row => <button type="button" key={row.symbol} className="do-stock-row" disabled={!Number.isFinite(row.drawdownPct)} onClick={() => open(row.symbol)} aria-label={`查看 ${row.symbol} 回撤详情`}>
        <div className="do-stock-heading"><span className="do-stock-symbol">{row.symbol}<ChevronRight size={14} /></span><strong className={tone(row.drawdownPct)}>{percent(row.drawdownPct)}</strong></div>
        <div className="do-stock-secondary"><span>{row.name}</span><span>最近交易日 <b className={tone(row.todayPct)}>{percent(row.todayPct)}</b></span></div>
        <DepthBar value={row.drawdownPct} maxDepth={maxDepth} />
        <div className="do-stock-prices"><span>收盘 {money(row.price)}</span><span>高点 {money(row.high)}</span></div>
        {rowStatus(row) && <span className="do-row-status">{rowStatus(row)}</span>}
      </button>)}</div>
      {rows.length === 0 && !(scope === 'holdings' && (!portfolioReady || portfolioError)) && <div className="do-empty">{missingCount ? '部分行情待补齐，暂不能完整判断筛选结果。' : scopeCount ? '当前分组没有达到这个跌幅的标的。' : scope === 'holdings' ? '暂无持有数量大于零的美股持仓。' : '暂无自选，请先在首页添加关注标的。'}{minDepth > 0 && <button type="button" onClick={() => setMinDepth(0)}>查看全部</button>}</div>}
    </section>
    <div className="do-footer"><ArrowUpRight size={14} /><span>跌幅是观察起点，不是买入结论。</span></div>
  </div>;
}
