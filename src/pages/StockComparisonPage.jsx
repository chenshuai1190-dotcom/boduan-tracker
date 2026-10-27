import React from 'react';
import { ArrowLeft, ArrowUpRight, ChevronDown, Plus, RefreshCw, X } from 'lucide-react';
import InvestmentSymbolPicker from '../components/InvestmentSymbolPicker.jsx';
import StockComparisonChart from '../components/StockComparisonChart.jsx';
import { INVESTMENT_SYMBOL_PRESETS } from '../lib/investmentSymbolPresets.js';
import { marketHexColor } from '../lib/marketColorMode.js';
import { buildStockComparison, comparisonRangeStart } from '../lib/stockComparisonModel.js';
import { loadStockComparison } from '../lib/stockComparison.js';
import { getInvestmentComparisonExpectedCloseDate, searchInvestmentSymbols } from '../lib/investmentComparison.js';
import '../components/InvestmentComparison.css';
import './StockComparisonPage.css';

const PALETTE = ['#60a5fa', '#a78bfa', '#34d399', '#f5b75b'];
const RANGES = [['1m', '1月', '1M'], ['3m', '3月', '3M'], ['6m', '6月', '6M'], ['ytd', '今年', 'YTD'], ['1y', '1年', '1Y'], ['custom', '自定义', 'Custom']];
const remembered = new Map();
const price = value => Number.isFinite(value) ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const percent = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '—';
function initialSettings(identity, latestDate, preview) {
  const query = new URLSearchParams(window.location.search);
  const requested = preview ? [...new Set((query.get('compareSymbols') || '').toUpperCase().split(',').filter(symbol => INVESTMENT_SYMBOL_PRESETS.some(item => item.symbol === symbol)))].slice(0, 4) : [];
  const saved = remembered.get(identity);
  if (saved && requested.length < 2) return saved.range === 'custom' ? saved : { ...saved, start: comparisonRangeStart(saved.range, latestDate), end: latestDate };
  const symbols = requested.length >= 2 ? requested : ['QQQ', 'TQQQ'];
  return { symbols, colors: Object.fromEntries(symbols.map((symbol, index) => [symbol, PALETTE[index]])), range: '1y', start: comparisonRangeStart('1y', latestDate), end: latestDate, mode: 'return', activeSymbol: symbols[0], identities: {} };
}

function validRange(start, end, latestDate) {
  const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  return date(start) && date(end) && start >= '2000-01-01' && start <= end && end <= latestDate;
}

function loadErrorText(code, english) {
  if (code === 'AUTH_REQUIRED') return english ? 'Please sign in again to load historical prices.' : '请重新登录后读取历史行情。';
  if (code === 'UNSUPPORTED_INSTRUMENT') return english ? 'Choose a USD US stock or ETF.' : '请选择美元计价的美股或 ETF。';
  if (code === 'NO_DATA' || code === 'INSUFFICIENT_HISTORY') return english ? 'No historical prices for this period. Adjust the dates or investments.' : '这个时间段暂无行情，请调整日期或标的。';
  return english ? 'Historical prices are temporarily unavailable. Please retry.' : '历史行情暂时不可用，请重试。';
}

export default function StockComparisonPage({ ctx = {}, previewSource }) {
  const preview = import.meta.env.DEV ? previewSource : null;
  const userId = ctx.userId || '';
  const identity = preview ? 'stock-comparison-preview' : userId;
  const latestDate = preview?.asOfDate || getInvestmentComparisonExpectedCloseDate();
  const loadSource = preview?.load || loadStockComparison;
  const searchSource = preview?.search || searchInvestmentSymbols;
  const english = ctx.language === 'en';
  const tr = (zh, en) => english ? en : zh;
  const [settings, setSettings] = React.useState(() => initialSettings(identity, latestDate, !!preview));
  const { symbols, colors, start, end, range, mode, activeSymbol, identities = {} } = settings;
  const [picker, setPicker] = React.useState(null);
  const [selectedDate, setSelectedDate] = React.useState(null);
  const [attempt, setAttempt] = React.useState(0);
  const [loadState, setLoadState] = React.useState({ key: '', loading: true, data: null, error: '' });
  const requestRef = React.useRef(0);
  const startRef = React.useRef(null);
  const patch = values => setSettings(previous => ({ ...previous, ...values }));
  const requestKey = JSON.stringify([identity, symbols, start, end, latestDate, attempt]);
  const valid = validRange(start, end, latestDate);
  React.useEffect(() => {
    remembered.delete(identity);
    remembered.set(identity, settings);
    while (remembered.size > 8) remembered.delete(remembered.keys().next().value);
  }, [identity, settings]);
  React.useEffect(() => {
    const request = ++requestRef.current;
    const controller = new AbortController();
    if (!valid) return () => controller.abort();
    setLoadState({ key: requestKey, loading: true, data: null, error: '' });
    const timer = window.setTimeout(() => {
      loadSource({ userId, symbols, startDate: start, endDate: end, force: attempt > 0, signal: controller.signal })
        .then(data => {
          if (!controller.signal.aborted && request === requestRef.current) setLoadState({ key: requestKey, loading: false, data, error: '' });
        })
        .catch(error => {
          if (!controller.signal.aborted && request === requestRef.current) setLoadState({ key: requestKey, loading: false, data: null, error: error?.code || 'NETWORK_ERROR' });
        });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [requestKey, valid, loadSource]);
  const currentLoad = loadState.key === requestKey;
  const loading = valid && (!currentLoad || loadState.loading);
  const data = currentLoad ? loadState.data : null;
  const error = currentLoad ? loadState.error : '';
  const model = React.useMemo(() => buildStockComparison({ series: data?.series || {}, symbols, startDate: start, endDate: end }), [data, symbols, start, end]);
  const selected = model.rows.find(row => row.date === selectedDate) || model.rows.at(-1);
  const tone = value => Number.isFinite(value) && value !== 0 ? marketHexColor(value, ctx.marketColorMode) : 'var(--ic-text)';

  const chooseSymbol = item => {
    if (symbols.includes(item.symbol) && item.symbol !== picker) return;
    const next = picker === 'add' ? [...symbols, item.symbol] : symbols.map(symbol => symbol === picker ? item.symbol : symbol);
    if (next.length > 4) return;
    const nextColors = { ...colors };
    const used = next.filter(symbol => symbol !== item.symbol).map(symbol => colors[symbol]);
    nextColors[item.symbol] = colors[picker] || PALETTE.find(color => !used.includes(color));
    patch({ symbols: next, colors: nextColors, identities: { ...identities, [item.symbol]: item }, activeSymbol: picker === activeSymbol ? item.symbol : activeSymbol });
    setPicker(null);
    setSelectedDate(null);
  };
  const removeSymbol = symbol => {
    if (symbols.length <= 2) return;
    const next = symbols.filter(item => item !== symbol);
    patch({ symbols: next, activeSymbol: activeSymbol === symbol ? next[0] : activeSymbol });
  };
  const chooseRange = value => {
    if (value === 'custom') {
      patch({ range: value });
      startRef.current?.focus();
      try { startRef.current?.showPicker?.(); } catch { /* Native date input remains focusable. */ }
      return;
    }
    patch({ range: value, start: comparisonRangeStart(value, latestDate), end: latestDate });
    setSelectedDate(null);
  };
  const ranking = symbols.map(symbol => ({ symbol, ...model.stats[symbol] })).filter(item => Number.isFinite(item.returnPct)).sort((a, b) => b.returnPct - a.returnPct);

  return <main className="investment-comparison sc-page">
    <header className="sc-header">
      <button type="button" className="ic-icon-button" onClick={ctx.onBack} aria-label={tr('返回全部功能', 'Back to tools')}><ArrowLeft size={22} /></button>
      <div><h1>{tr('走势对比', 'Price comparison')}</h1><p>{tr('同一段时间，看清走势差异', 'Different stocks. One shared timeline.')}</p></div>
      <span className="sc-demo-badge">{preview?.synthetic ? tr('本地演示', 'Demo') : 'USD'}</span>
    </header>

    <section aria-label={tr('选择对比标的', 'Choose investments')}>
      <div className="sc-section-label"><span>{tr('对比标的', 'Investments')} <small>{symbols.length} / 4</small></span><button type="button" disabled={symbols.length >= 4} onClick={() => setPicker('add')}><Plus size={15} />{tr('添加', 'Add')}</button></div>
      <div className="sc-symbol-grid">
        {symbols.map(symbol => {
          const item = INVESTMENT_SYMBOL_PRESETS.find(candidate => candidate.symbol === symbol) || identities[symbol] || data?.series[symbol] || { name: symbol };
          return <div key={symbol} className="sc-symbol-card">
            <button type="button" className="sc-symbol-pick" onClick={() => setPicker(symbol)} aria-label={`${tr('更换', 'Change')} ${symbol}`}><i style={{ background: colors[symbol] }} /><span><strong>{symbol}</strong><small>{english ? item.name : (item.nameZh || item.name)}</small></span><ChevronDown size={15} /></button>
            {symbols.length > 2 && <button type="button" className="sc-remove" onClick={() => removeSymbol(symbol)} aria-label={`${tr('移除', 'Remove')} ${symbol}`}><X size={14} /></button>}
          </div>;
        })}
        {symbols.length === 3 && <button type="button" className="sc-add-card" onClick={() => setPicker('add')}><Plus size={18} />{tr('添加第 4 只', 'Add a fourth')}</button>}
      </div>
    </section>

    <div className="sc-dates">
      <label className="ic-field"><span>{tr('起始日期', 'Start date')}</span><input ref={startRef} type="date" aria-label={tr('起始日期', 'Start date')} min="2000-01-01" max={end} value={start} onChange={event => { patch({ start: event.target.value, range: 'custom' }); setSelectedDate(null); }} /></label>
      <label className="ic-field"><span>{tr('截止日期', 'End date')}</span><input type="date" aria-label={tr('截止日期', 'End date')} min={start} max={latestDate} value={end} onChange={event => { patch({ end: event.target.value, range: 'custom' }); setSelectedDate(null); }} /></label>
    </div>
    <div className="sc-ranges" aria-label={tr('时间范围', 'Date range')}>{RANGES.map(([value, zh, en]) => <button key={value} type="button" aria-pressed={range === value} onClick={() => chooseRange(value)}>{tr(zh, en)}</button>)}</div>
    <div className="ic-analysis-tabs sc-tabs" role="tablist" aria-label={tr('图表模式', 'Chart mode')}><button type="button" role="tab" aria-selected={mode === 'return'} onClick={() => patch({ mode: 'return' })}>{tr('涨跌对比', 'Performance')}</button><button type="button" role="tab" aria-selected={mode === 'price'} onClick={() => patch({ mode: 'price' })}>{tr('股价走势', 'Price')}</button></div>

    {!valid ? <div className="sc-empty" role="status">{tr('请选择有效的起止日期，截止日期不能晚于最近收盘日。', 'Choose a valid date range ending no later than the latest completed session.')}</div> : loading ? <div className="sc-empty sc-loading" role="status"><RefreshCw size={16} className="ic-spin" />{tr('正在读取历史行情…', 'Loading historical prices…')}</div> : error ? <div className="sc-empty sc-load-error" role="alert"><span>{loadErrorText(error, english)}</span><button type="button" onClick={() => setAttempt(value => value + 1)}>{tr('重试', 'Retry')}</button></div> : model.error ? <div className="sc-empty" role="status">{tr('这个时间段没有足够的共同数据，请调整日期。', 'No shared history for this period. Choose another range.')}</div> : <>
      <div className="sc-overview-label"><span>{tr('区间表现', 'Period performance')}</span><span>{model.startDate} — {model.endDate}</span></div>
      {model.rangeAdjusted && <p className="sc-range-note">{tr('已对齐到所选股票共同有数据的交易日', 'Aligned to shared available trading dates')}</p>}
      <div className="sc-summary-grid">
        {symbols.map(symbol => <button type="button" key={symbol} className={`sc-summary ${mode === 'price' && activeSymbol === symbol ? 'sc-summary-active' : ''}`} style={{ '--sc-series': colors[symbol] }} onClick={() => patch({ activeSymbol: symbol })} aria-pressed={mode === 'price' ? activeSymbol === symbol : undefined} aria-label={`${symbol} ${tr('区间表现', 'period performance')}`}>
          <span className="sc-summary-symbol"><i />{symbol}{mode === 'price' && activeSymbol === symbol && <small>{tr('查看中', 'Viewing')}</small>}</span>
          <strong style={{ color: tone(model.stats[symbol]?.returnPct) }}>{percent(model.stats[symbol]?.returnPct)}</strong>
          <span className="sc-price-pair">{price(model.stats[symbol]?.startPrice)} <span>→</span> {price(model.stats[symbol]?.endPrice)}</span>
        </button>)}
      </div>
      {ranking.length >= 2 && <div className="sc-lead"><ArrowUpRight size={15} /><span>{ranking[0].symbol} {tr('领先', 'leads')} {ranking[1].symbol}</span><strong>{percent(ranking[0].returnPct - ranking[1].returnPct)}</strong>{symbols.length > 2 && <small>{tr('前两名', 'Top two')}</small>}</div>}

      <StockComparisonChart rows={model.rows} symbols={symbols} colors={colors} mode={mode} activeSymbol={activeSymbol} selectedDate={selected?.date} onSelectDate={setSelectedDate} englishMode={english} />

      <section className="sc-readout" aria-label={tr('选中日期详情', 'Selected date details')}>
        <div className="sc-readout-heading"><span>{selected?.date}</span><button type="button" onClick={() => setSelectedDate(null)} disabled={!selectedDate || selectedDate === model.endDate}>{tr('回到期末', 'Period end')}</button></div>
        <div className="sc-readout-grid">{symbols.map(symbol => <div className="sc-readout-card" key={symbol}><span><i style={{ background: colors[symbol] }} />{symbol}</span><strong>{price(selected?.prices[symbol])}</strong><div><small>{tr('自起始日', 'Since start')}</small><b style={{ color: tone(selected?.returns[symbol]) }}>{percent(selected?.returns[symbol])}</b></div></div>)}</div>
      </section>

      <details className="sc-details"><summary>{tr('区间详细数据', 'Period details')}<Plus size={17} /></summary><div className="sc-detail-list">{symbols.map(symbol => <div key={symbol} className="sc-detail-row"><h3><i style={{ background: colors[symbol] }} />{symbol}</h3><dl><div><dt>{tr('区间最高', 'High')}</dt><dd>{price(model.stats[symbol]?.high?.price)}<small>{model.stats[symbol]?.high?.date}</small></dd></div><div><dt>{tr('区间最低', 'Low')}</dt><dd>{price(model.stats[symbol]?.low?.price)}<small>{model.stats[symbol]?.low?.date}</small></dd></div><div><dt>{tr('最大回撤', 'Max drawdown')}</dt><dd style={{ color: tone(model.stats[symbol]?.maxDrawdownPct) }}>{percent(model.stats[symbol]?.maxDrawdownPct)}</dd></div></dl></div>)}</div></details>
    </>}
    <footer className="sc-footnote">{preview?.synthetic ? tr('模拟数据 · 仅用于本地设计预览，非真实行情', 'Simulated data · Local design preview, not real market prices') : tr('EODHD · 拆股复权收盘价 · 不含分红再投资', 'EODHD · Split-adjusted close · Excludes reinvested dividends')}</footer>
    {picker !== null && <InvestmentSymbolPicker selectedSymbol={picker === 'add' ? '—' : picker} excludedSymbols={symbols.filter(symbol => symbol !== picker)} title={picker === 'add' ? tr('添加对比标的', 'Add investment') : tr('更换对比标的', 'Change investment')} englishMode={english} userId={userId} searchSource={searchSource} onSelect={chooseSymbol} onClose={() => setPicker(null)} />}
  </main>;
}
