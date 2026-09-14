import React from 'react';
import { ArrowLeft, ArrowUpRight, ChevronDown, Search } from 'lucide-react';
import { marketHexColor } from '../lib/marketColorMode.js';
import { loadStockDecision, normalizeStockDecisionSymbol } from '../lib/stockDecision.js';
import { stockDecisionPresentation } from '../lib/stockDecisionPresentation.js';
import { loadStockValuation } from '../lib/stockDecisionValuation.js';
import { StockDecisionValuation } from '../components/StockDecisionValuation.jsx';
import '../components/StockDecisionReport.css';

const COPY = {
  zh: {
    title: '股票决策', back: '返回交易', search: '股票代码',
    placeholder: '输入股票代码', submit: '查看', samples: '快捷选择',
    invalid: '请输入有效的股票代码',
    daily: '日线', basis: '判断依据', pricePosition: '价格位置',
    recent: '近期收盘走势', support: '参考支撑', resistance: '参考压力',
    latest: '最新', earlier: '较早', next: '接下来观察',
    chart: '完成收盘走势及支撑、压力区域', noSupport: '未识别有效支撑', noResistance: '未识别上方压力', noHistory: '完整走势数据不足', insideZone: '区间内',
    loading: '正在读取完成日线…', retry: '重新读取', emptyTitle: '观察一只股票', emptySubtitle: '趋势 · 位置 · 量能 · 动量', local: '真实数据',
    status: { caution: '需关注', clear: '已满足', neutral: '中性', missing: '资料不足' },
  },
  en: {
    title: 'Stock decision', back: 'Back to trades', search: 'Stock symbol',
    placeholder: 'Enter a stock symbol', submit: 'View', samples: 'Quick picks',
    invalid: 'Enter a valid stock symbol',
    daily: 'Daily', basis: 'Decision checks', pricePosition: 'Price position',
    recent: 'Recent closing prices', support: 'Support reference', resistance: 'Resistance reference',
    latest: 'Latest', earlier: 'Earlier', next: 'What to watch next',
    chart: 'Completed closing prices with support and resistance zones', noSupport: 'No active support', noResistance: 'No resistance identified', noHistory: 'Insufficient history', insideZone: 'Inside zone',
    loading: 'Loading completed daily prices…', retry: 'Retry', emptyTitle: 'Review a stock', emptySubtitle: 'Trend · Position · Volume · Momentum', local: 'Real data',
    status: { caution: 'Caution', clear: 'Met', neutral: 'Neutral', missing: 'Unavailable' },
  },
};

const money = value => typeof value === 'number' && Number.isFinite(value) ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

function PositionChart({ decision, copy, marketColorMode }) {
  const { history, support, resistance, price, supportZone, resistanceZone } = decision;
  const width = 400, right = 398, top = 14, bottom = 166;
  const bounds = [...history, ...[supportZone?.lower, supportZone?.upper, resistanceZone?.lower, resistanceZone?.upper].filter(Number.isFinite)];
  const low = Math.min(...bounds), high = Math.max(...bounds), span = high - low || 1;
  const y = value => bottom - ((value - low + span * .12) / (span * 1.24)) * (bottom - top);
  const path = history.map((value, index) => `${index ? 'L' : 'M'}${(2 + index / Math.max(1, history.length - 1) * (right - 2)).toFixed(2)},${y(value).toFixed(2)}`).join(' ');
  const gradientId = React.useId().replace(/:/g, '');
  const color = marketHexColor(price - history[0], marketColorMode);
  const gap = level => Number.isFinite(level) && Number.isFinite(price) && price > 0 ? `${(Math.abs(level - price) / price * 100).toFixed(1)}%` : '—';
  return <section className="sd-position" aria-labelledby="sd-position-heading">
    <div className="sd-section-heading"><h2 id="sd-position-heading">{copy.pricePosition}</h2><span>{copy.recent}</span></div>
    <div className="sd-levels">
      <div><span><i className="sd-support-key" />{copy.support}</span><strong>{supportZone ? `${money(supportZone.lower)} – ${money(supportZone.upper)}` : '—'}</strong><small>{supportZone && price >= supportZone.lower && price <= supportZone.upper ? copy.insideZone : support !== null ? `↓ ${gap(support)}` : copy.noSupport}</small></div>
      <div><span><i className="sd-resistance-key" />{copy.resistance}</span><strong>{resistanceZone ? `${money(resistanceZone.lower)} – ${money(resistanceZone.upper)}` : '—'}</strong><small>{resistanceZone && price >= resistanceZone.lower && price <= resistanceZone.upper ? copy.insideZone : resistance !== null ? `↑ ${gap(resistance)}` : copy.noResistance}</small></div>
    </div>
    {history.length >= 2 ? <svg viewBox={`0 0 ${width} 192`} role="img" aria-label={copy.chart} className="sd-chart">
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".13" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${path} L${right},${bottom} L2,${bottom} Z`} fill={`url(#${gradientId})`} />
      {[supportZone, resistanceZone].map((zone, index) => zone ? <g key={index}>
        <rect x="0" y={y(zone.upper)} width={width} height={Math.max(1, y(zone.lower) - y(zone.upper))} fill={index ? '#bfa67b' : '#7f8f99'} opacity=".1" />
        <line x1="0" y1={y(index ? zone.lower : zone.upper)} x2={width} y2={y(index ? zone.lower : zone.upper)} className={index ? 'sd-resistance-line' : 'sd-support-line'} />
      </g> : null)}
      <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={right} cy={y(price)} r="3.5" fill="#ececee" stroke="#08090b" strokeWidth="1.5" />
      <text x="0" y="189">{decision.dates?.[0] || copy.earlier}</text><text x={width} y="189" textAnchor="end">{decision.asOf}</text>
    </svg> : <p className="sd-no-history">{copy.noHistory}</p>}
  </section>;
}

export function StockDecisionReport({ decision, copy, marketColorMode, valuation = null }) {
  const [expanded, setExpanded] = React.useState(null);

  return (
    <article className="sd-report" data-symbol={decision.symbol}>
      <div className="sd-stock">
        <div className="sd-stock-identity"><strong>{decision.symbol}</strong><span>{decision.name}</span></div>
        <div className="sd-quote"><strong>{money(decision.price)}</strong><span style={{ color: marketHexColor(decision.changePct, marketColorMode) }}>{typeof decision.changePct === 'number' ? `${decision.changePct > 0 ? '+' : ''}${decision.changePct.toFixed(2)}%` : '—'}</span></div>
      </div>
      <div className="sd-result" data-verdict={decision.verdict}>
        <div className="sd-result-meta"><span>{decision.trendLabel}</span><span>{copy.daily} · {decision.asOf}</span></div>
        <h2><i aria-hidden="true" />{decision.verdictLabel}</h2>
        <p>{decision.summary}</p>
      </div>
      {valuation}
      <section className="sd-checks" aria-labelledby="sd-checks-heading">
        <div className="sd-section-heading"><h2 id="sd-checks-heading">{copy.basis}</h2><span>01 — {String(decision.checks.length).padStart(2, '0')}</span></div>
        {decision.checks.map((check, index) => (
          <div className="sd-check" key={check.id} data-status={check.status}>
            <button
              className="sd-check-toggle"
              type="button"
              onClick={() => setExpanded(expanded === check.id ? null : check.id)}
              aria-expanded={expanded === check.id}
              aria-controls={`sd-detail-${check.id}`}
            >
              <span className="sd-check-label"><small>{String(index + 1).padStart(2, '0')}</small>{check.label}</span>
              <span className="sd-check-reading"><strong>{check.reading}</strong><span>{check.metric}</span></span>
              <ChevronDown size={15} strokeWidth={1.5} aria-hidden="true" />
            </button>
            {expanded === check.id && (
              <div className="sd-check-detail" id={`sd-detail-${check.id}`}>
                <span className="sd-check-status"><i />{copy.status[check.status]}</span>
                <p>{check.detail}</p>
              </div>
            )}
          </div>
        ))}
      </section>
      <PositionChart decision={decision} copy={copy} marketColorMode={marketColorMode} />
      <section className="sd-next" aria-labelledby="sd-next-heading">
        <h2 id="sd-next-heading">{copy.next}</h2>
        {decision.nextSteps.map(step => <p key={step}><ArrowUpRight size={16} strokeWidth={1.4} aria-hidden="true" /><span>{step}</span></p>)}
      </section>
    </article>
  );
}

export default function StockDecisionPage({ ctx = {}, previewSource = null }) {
  const { userId = '', language = 'zh', marketColorMode = 'redUpGreenDown', closeStockDecision } = ctx;
  const english = language === 'en';
  const copy = COPY[english ? 'en' : 'zh'];
  const local = import.meta.env.DEV && Boolean(previewSource?.load);
  const source = local ? previewSource.load : loadStockDecision;
  const valuationSource = local ? previewSource.loadValuation : loadStockValuation;
  const initial = local ? normalizeStockDecisionSymbol(previewSource.initialSymbol || '') : '';
  const [query, setQuery] = React.useState(initial);
  const [request, setRequest] = React.useState({ symbol: initial, force: false, sequence: 0 });
  const [state, setState] = React.useState({ key: '', data: null, loading: false, error: '' });
  const [valuationState, setValuationState] = React.useState({ key: '', data: null, loading: false, error: '' });
  const [valuationRetry, setValuationRetry] = React.useState(0);
  const [inputError, setInputError] = React.useState('');
  const sequence = React.useRef(0);
  const key = `${userId}:${request.symbol}`;
  React.useEffect(() => {
    if (!request.symbol) return undefined;
    const current = ++sequence.current;
    const controller = new AbortController();
    setState({ key, data: null, loading: true, error: '' });
    Promise.resolve().then(() => source({ userId, symbol: request.symbol, force: request.force, signal: controller.signal }))
      .then(data => { if (current === sequence.current && !controller.signal.aborted) setState({ key, data, loading: false, error: '' }); })
      .catch(error => { if (current === sequence.current && !controller.signal.aborted) setState({ key, data: null, loading: false, error: error.code || 'NETWORK_ERROR' }); });
    return () => { sequence.current += 1; controller.abort(); };
  }, [userId, key, request, source]);
  React.useEffect(() => {
    if (!request.symbol) return undefined;
    const controller = new AbortController();
    setValuationState({ key, data: null, loading: true, error: '' });
    Promise.resolve().then(() => valuationSource({ userId, symbol: request.symbol, signal: controller.signal }))
      .then(data => { if (!controller.signal.aborted) setValuationState({ key, data, loading: false, error: '' }); })
      .catch(error => { if (!controller.signal.aborted) setValuationState({ key, data: null, loading: false, error: error.code || 'NETWORK_ERROR' }); });
    return () => controller.abort();
  }, [userId, key, request, valuationSource, valuationRetry]);
  const data = state.key === key ? state.data : null;
  const decision = React.useMemo(() => data ? stockDecisionPresentation(data, english) : null, [data, english]);
  const loading = request.symbol && (state.key !== key || state.loading);
  const errorCopy = {
    AUTH_REQUIRED: english ? 'Please sign in again to view this stock.' : '请重新登录后查看。',
    INVALID_SYMBOL: english ? 'Enter a valid US stock symbol.' : '请输入有效的美股代码。',
    INVALID_PARAMETERS: english ? 'Enter a valid US stock symbol.' : '请输入有效的美股代码。',
    UNSUPPORTED_INSTRUMENT: english ? 'Only verified USD US stocks and ETFs are supported.' : '仅支持已验证的美元美股和 ETF。',
    INSUFFICIENT_DATA: english ? 'There is not enough completed price history for this assessment.' : '完成日线历史不足，暂时无法形成判断。',
    RATE_LIMITED: english ? 'Requests are limited. Please try again shortly.' : '请求较多，请稍后再试。',
    QUOTA_EXHAUSTED: english ? 'The data provider is temporarily limiting requests.' : '行情服务暂时限流，请稍后再试。',
    INVALID_DATA: english ? 'The data could not be verified. Please try again later.' : '数据暂未通过校验，请稍后再试。',
  };
  const select = (raw, force = false) => {
    const symbol = normalizeStockDecisionSymbol(raw);
    if (!symbol) { setInputError(copy.invalid); return; }
    setInputError(''); setQuery(symbol);
    if (loading && symbol === request.symbol) return;
    setRequest(previous => ({ symbol, force, sequence: previous.sequence + 1 }));
  };
  return <main className="stock-decision-preview" lang={english ? 'en' : 'zh-CN'}>
    <header className="sd-header"><button type="button" onClick={closeStockDecision} aria-label={copy.back}><ArrowLeft size={21} strokeWidth={1.7} /></button><h1>{copy.title}</h1><span>{local ? copy.local : 'USD'}</span></header>
    <form className="sd-search" onSubmit={event => { event.preventDefault(); select(query); if (normalizeStockDecisionSymbol(query)) event.currentTarget.querySelector('input')?.blur(); }}>
      <label className="sd-search-field"><Search size={18} strokeWidth={1.6} aria-hidden="true" /><input value={query} onChange={event => { setQuery(event.target.value); setInputError(''); }} aria-label={copy.search} aria-invalid={Boolean(inputError)} aria-describedby={inputError ? 'sd-search-error' : undefined} placeholder={copy.placeholder} autoComplete="off" autoCapitalize="characters" spellCheck={false} enterKeyHint="search" maxLength={18} /></label>
      <button type="submit" disabled={loading && normalizeStockDecisionSymbol(query) === request.symbol}>{copy.submit}<ArrowUpRight size={16} strokeWidth={1.6} aria-hidden="true" /></button>
    </form>
    {inputError && <p id="sd-search-error" className="sd-input-error" role="alert">{inputError}</p>}
    <div className="sd-samples" aria-label={copy.samples}><span>{copy.samples}</span>{['NVDA', 'META', 'MSFT'].map(symbol => <button key={symbol} type="button" aria-pressed={request.symbol === symbol} onClick={() => select(symbol)}>{symbol}</button>)}</div>
    <div className="sd-sr-status" role="status">{loading ? copy.loading : decision ? `${decision.symbol} · ${decision.verdictLabel}` : ''}</div>
    {loading ? <div className="sd-empty" aria-busy="true"><span>{request.symbol}</span><p>{copy.loading}</p></div>
      : state.key === key && state.error ? <div className="sd-empty" role="alert"><span>{request.symbol}</span><p>{errorCopy[state.error] || (english ? 'Unable to read this stock right now.' : '暂时无法读取这只股票的数据。')}</p><button className="sd-retry" type="button" onClick={() => select(request.symbol, true)}>{copy.retry}</button></div>
        : decision ? <><StockDecisionReport key={`${key}:${data.fetchedAt}:${language}`} decision={decision} copy={copy} marketColorMode={marketColorMode}
          valuation={<StockDecisionValuation key={key} data={valuationState.key === key ? valuationState.data : null}
            loading={valuationState.key !== key || valuationState.loading} error={valuationState.key === key ? valuationState.error : ''}
            onRetry={() => setValuationRetry(value => value + 1)} price={data.valuationClose?.price} priceDate={data.valuationClose?.date} english={english} />} />{data.stale && <button className="sd-retry" type="button" onClick={() => select(request.symbol, true)}>{copy.retry}</button>}</>
          : <div className="sd-empty"><h2>{copy.emptyTitle}</h2><p>{copy.emptySubtitle}</p></div>}
  </main>;
}
