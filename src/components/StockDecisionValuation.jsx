import React from 'react';
import { ChevronDown } from 'lucide-react';
import './StockDecisionValuation.css';

const money = value => Number.isFinite(value) ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const COPY = {
  zh: {
    title: '财报估值', reference: '情景参考', loading: '正在读取财报估值…', unavailable: '财报估值暂不可用', retry: '重试',
    unsupported: '这只股票暂未建立财报估值模型', pending: '财报待更新或资料不足', expired: '正在等待最新财报检查',
    eps: '预测 EPS', assumptions: '测算依据', caution: 'EPS 为情景测算，20／25／30 倍 PE 为假设。',
    scenarios: { cautious: '审慎', base: '基准', optimistic: '乐观' },
    close: '收盘对应 PE', checked: '上次检查', reported: '财报期间', periodEnd: '截至', published: '发布', automatic: '财报自动解析',
    boundary: '估值不改变上方技术判断，区间价格不代表已确认支撑。',
    basis: '从官方财报自动提取经营数据，后续增长、利润率等为模型假设；并非公司 EPS 指引或分析师一致预期。',
    sources: '官方来源', priceMissing: '同口径收盘数据不足', actualClose: '实际收盘',
  },
  en: {
    title: 'Earnings valuation', reference: 'Scenarios', loading: 'Loading valuation…', unavailable: 'Valuation unavailable', retry: 'Retry',
    unsupported: 'No valuation model for this stock yet', pending: 'Report update pending or insufficient data', expired: 'Awaiting a fresh financial-data check',
    eps: 'Forecast EPS', assumptions: 'Calculation basis', caution: 'EPS is modeled; 20× / 25× / 30× PE are assumptions.',
    scenarios: { cautious: 'Cautious', base: 'Base', optimistic: 'Optimistic' },
    close: 'PE at close', checked: 'Last checked', reported: 'Reported period', periodEnd: 'Ended', published: 'Published', automatic: 'Parsed filings',
    boundary: 'Valuation does not change the technical assessment. These prices are not confirmed support.',
    basis: 'Operating data is extracted from official filings. Future growth, margins and other inputs are assumptions, not company EPS guidance or analyst consensus.',
    sources: 'Official sources', priceMissing: 'No comparable closing price', actualClose: 'Unadjusted close',
  },
};

export function StockDecisionValuation({ data, loading, error, onRetry, price, priceDate, english = false }) {
  const copy = COPY[english ? 'en' : 'zh'];
  const language = english ? 'en' : 'zh';
  const [scenarioId, setScenarioId] = React.useState('base');
  const [expanded, setExpanded] = React.useState(false);
  const [clock, setClock] = React.useState(Date.now);
  const retryRef = React.useRef(onRetry);
  const detailId = React.useId();
  const expiresAt = Date.parse(data?.expiresAt);
  const isExpired = data?.status === 'available' && (!Number.isFinite(expiresAt) || expiresAt <= Math.max(clock, Date.now()));
  React.useEffect(() => { retryRef.current = onRetry; }, [onRetry]);
  React.useEffect(() => {
    setClock(Date.now());
    if (loading || error || !['available', 'pending'].includes(data?.status) || !Number.isFinite(expiresAt)) return undefined;
    let attempted = false;
    let due = false;
    // A fast device clock can expire a still-cached server check. Wait for a
    // full local minute after each expired response before trying it again.
    const delay = expiresAt <= Date.now() ? 60000 : Math.min(2147483647, expiresAt - Date.now() + 1);
    const refresh = () => {
      setClock(Date.now());
      if (!due || document.visibilityState !== 'visible' || attempted || !retryRef.current) return;
      // Only a new response re-arms this effect; visibility cannot duplicate it.
      attempted = true;
      retryRef.current();
    };
    const timer = setTimeout(() => { due = true; refresh(); }, delay);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [data, expiresAt, loading, error]);
  const status = loading ? 'loading' : error ? 'error' : isExpired ? 'pending' : data?.status || 'unavailable';
  const scenario = status === 'available' ? data.scenarios.find(item => item.id === scenarioId) : null;
  const validPriceDate = typeof priceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(priceDate)
    && Number.isFinite(Date.parse(`${priceDate}T00:00:00Z`)) && new Date(`${priceDate}T00:00:00Z`).toISOString().slice(0, 10) === priceDate;
  const comparable = scenario && Number.isFinite(price) && price > 0 && validPriceDate
    && priceDate >= data.reportedAt && priceDate <= data.checkedAt.slice(0, 10);
  const impliedPe = comparable ? price / scenario.eps : null;
  // The price marks use the same linear scale; out-of-band closes stay visible.
  const marker = impliedPe === null ? null : Math.max(2, Math.min(98, 100 / 6 + (impliedPe - 20) / 10 * 200 / 3));
  return <section className="sd-valuation" aria-label={copy.title} data-valuation-status={status}>
    <div className="sd-section-heading"><h2>{copy.title}</h2><span>{copy.automatic}</span></div>
    {data?.reportedPeriod && <p className="sd-valuation-period">{copy.reported} · {data.reportedPeriod}{data.reportPeriodEnd ? ` · ${copy.periodEnd} ${data.reportPeriodEnd}` : ''}</p>}
    {data?.checkedAt && <p className="sd-valuation-period">{copy.checked} · {data.checkedAt.slice(0, 16).replace('T', ' ')} UTC</p>}
    {!scenario ? <div className="sd-valuation-empty" role="status">
      <span>{loading ? copy.loading : error ? copy.unavailable : data?.status === 'unsupported' ? copy.unsupported : isExpired ? copy.expired : data?.status === 'pending' ? copy.pending : copy.unavailable}</span>
      {(error || status === 'pending') && onRetry && <button type="button" onClick={onRetry}>{copy.retry}</button>}
    </div> : <>
      <div className="sd-valuation-scenarios" aria-label={copy.reference}>
        {data.scenarios.map(item => <button key={item.id} type="button" aria-pressed={scenario.id === item.id} onClick={() => setScenarioId(item.id)}>{copy.scenarios[item.id]}</button>)}
      </div>
      <div className="sd-valuation-earnings"><span>{copy.eps}</span><strong>{money(scenario.eps)}</strong></div>
      <p className="sd-valuation-period">{data.forecastPeriod[language]}</p>
      <div className="sd-valuation-close"><span>{copy.close}{comparable ? ` · ${priceDate}` : ''}</span><strong>{impliedPe === null ? '—' : `${impliedPe.toFixed(2)}×`}</strong></div>
      <div className="sd-valuation-scale" aria-hidden="true">
        <div className="sd-valuation-track" />
        {[100 / 6, 50, 500 / 6].map(left => <i key={left} className="sd-valuation-tick" style={{ left: `${left}%` }} />)}
        {marker !== null && <i className="sd-valuation-marker" style={{ left: `${marker}%` }} />}
      </div>
      <div className="sd-valuation-prices">
        {scenario.prices.map(item => <div key={item.pe}><span>{item.pe}× PE</span><strong>{money(item.price)}</strong></div>)}
      </div>
      {!comparable && <p className="sd-valuation-note">{copy.priceMissing}</p>}
      <p className="sd-valuation-note">{copy.caution}</p>
      <button className="sd-valuation-details-toggle" type="button" aria-expanded={expanded} aria-controls={detailId} onClick={() => setExpanded(value => !value)}>
        <span>{copy.assumptions}</span><ChevronDown size={15} strokeWidth={1.5} aria-hidden="true" />
      </button>
      {expanded && <div className="sd-valuation-details" id={detailId}>
        <p>{copy.basis}</p>
        <dl>{scenario.assumptions.map((item, index) => <div key={index}><dt>{item.label[language]}</dt><dd>{item.value}</dd></div>)}</dl>
        <p>{data.notes[language]}</p>
        <p>{copy.boundary}</p>
        <div className="sd-valuation-provenance">
          {comparable && <span>{copy.actualClose} · {priceDate} · {money(price)}</span>}
          <span>{copy.published} · {data.reportedAt}</span>
        </div>
        <div className="sd-valuation-sources" aria-label={copy.sources}>{data.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>)}</div>
      </div>}
    </>}
  </section>;
}
