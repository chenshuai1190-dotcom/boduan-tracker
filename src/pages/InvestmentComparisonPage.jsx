import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronDown, Pause, Play, RefreshCw, Search, X } from 'lucide-react';
import InvestmentComparisonChart, { formatInvestmentAmount, formatInvestmentPercent, investmentChangeColor, investmentRank, investmentRankColor } from '../components/InvestmentComparisonChart.jsx';
import InvestmentSymbolPresets from '../components/InvestmentSymbolPresets.jsx';
import { loadInvestmentComparison, searchInvestmentSymbols } from '../lib/investmentComparison.js';
import { buildInvestmentComparisonModel, getInvestmentComparisonSnapshot } from '../lib/investmentComparisonModel.js';
import '../components/InvestmentComparison.css';

const DEFAULT_INSTRUMENTS = [{ symbol: 'QQQ', name: 'Invesco QQQ Trust', type: 'ETF' }, { symbol: 'TQQQ', name: 'ProShares UltraPro QQQ', type: 'ETF' }];
const PLAYBACK_DAYS_PER_SECOND = 125;

function instrumentName(item, englishMode) {
  if (item.symbol === 'QQQ') return englishMode ? 'Nasdaq-100 ETF' : '纳斯达克 100 ETF';
  if (item.symbol === 'TQQQ') return englishMode ? '3× Nasdaq-100 ETF' : '三倍纳指 ETF';
  if (!englishMode && item.nameZh) return item.nameZh;
  return item.name || item.symbol;
}

function InvestmentSymbolPicker({ side, instruments, userId, englishMode, searchSource, onSelect, onClose }) {
  const [query, setQuery] = React.useState('');
  const [attempt, setAttempt] = React.useState(0);
  const [state, setState] = React.useState({ query: '', userId, results: [], loading: false, error: false });
  const [viewport, setViewport] = React.useState(null);
  const inputRef = React.useRef(null);
  const dialogRef = React.useRef(null);
  const closeRef = React.useRef(onClose);
  const requestRef = React.useRef(0);
  closeRef.current = onClose;
  const normalizedQuery = query.trim();

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const trigger = document.activeElement;
    document.body.style.overflow = 'hidden';
    const focusId = window.requestAnimationFrame(() => dialogRef.current?.focus());
    const updateViewport = () => {
      if (window.visualViewport) setViewport({ top: window.visualViewport.offsetTop, height: window.visualViewport.height });
    };
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current?.(); return; }
      if (event.key !== 'Tab') return;
      const targets = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), input, [tabindex="0"]') || [])];
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first?.focus(); }
    };
    updateViewport();
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    document.addEventListener('keydown', keydown);
    return () => {
      window.cancelAnimationFrame(focusId);
      document.body.style.overflow = previousOverflow;
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
      document.removeEventListener('keydown', keydown);
      trigger?.focus?.();
    };
  }, []);

  React.useEffect(() => {
    const requestId = ++requestRef.current;
    const controller = new AbortController();
    if (!normalizedQuery) {
      setState({ query: '', userId, results: [], loading: false, error: false });
      return () => { requestRef.current += 1; controller.abort(); };
    }
    setState({ query: normalizedQuery, userId, results: [], loading: true, error: false });
    const timer = window.setTimeout(() => {
      searchSource({ userId, query: normalizedQuery, force: attempt > 0, signal: controller.signal })
        .then(result => {
          if (requestRef.current !== requestId || controller.signal.aborted) return;
          setState({ query: normalizedQuery, userId, results: result.results || [], loading: false, error: false });
        })
        .catch(() => {
          if (requestRef.current !== requestId || controller.signal.aborted) return;
          setState({ query: normalizedQuery, userId, results: [], loading: false, error: true });
        });
    }, 300);
    return () => { window.clearTimeout(timer); requestRef.current += 1; controller.abort(); };
  }, [attempt, normalizedQuery, searchSource, userId]);

  const matchesCurrentQuery = state.userId === userId && state.query === normalizedQuery;
  const results = matchesCurrentQuery ? state.results : [];
  const title = englishMode ? `Change ${side === 0 ? 'left' : 'right'} investment` : `更换${side === 0 ? '左' : '右'}侧标的`;

  return createPortal(<div className="investment-comparison ic-sheet-overlay" style={viewport ? { top: viewport.top, height: viewport.height, bottom: 'auto' } : undefined} onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="ic-picker" role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="investment-picker-title">
      <div className="ic-picker-handle" />
      <header className="ic-picker-head"><h2 id="investment-picker-title">{title}</h2><button type="button" className="ic-icon-button" onClick={onClose} aria-label={englishMode ? 'Close stock search' : '关闭股票搜索'}><X size={21} /></button></header>
      <div className="ic-picker-context">{englishMode ? 'Current' : '当前'} <strong>{instruments[side].symbol}</strong><span>·</span>{englishMode ? 'Compared with' : '对比'} <strong>{instruments[1 - side].symbol}</strong></div>
      <label className="ic-search-label"><Search size={18} aria-hidden="true" /><input ref={inputRef} type="search" value={query} onChange={event => { setQuery(event.target.value); setAttempt(0); }} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder={englishMode ? 'Search symbol or company name' : '搜索股票代码 / 名称'} aria-label={englishMode ? 'Search US stocks and ETFs' : '搜索美股与 ETF'} /></label>
      <div className="ic-results-heading"><span>{normalizedQuery ? (englishMode ? 'Search results' : '搜索结果') : (englishMode ? 'Magnificent Seven + AVGO' : '美股七姐妹 + AVGO')}</span><span>{englishMode ? 'US stocks · USD' : '美股 · USD'}</span></div>
      <div className="ic-results" aria-busy={state.loading}>
        {!normalizedQuery ? <InvestmentSymbolPresets side={side} instruments={instruments} englishMode={englishMode} onSelect={onSelect} />
          : !matchesCurrentQuery || state.loading ? <div className="ic-search-empty" role="status"><RefreshCw size={15} className="ic-spin" />{englishMode ? 'Searching…' : '搜索中…'}</div>
            : state.error ? <div className="ic-search-empty" role="alert"><span>{englishMode ? 'Search is temporarily unavailable.' : '搜索暂时不可用。'}</span><button type="button" onClick={() => setAttempt(value => value + 1)}>{englishMode ? 'Retry' : '重试'}</button></div>
              : results.length === 0 ? <div className="ic-search-empty">{englishMode ? 'No matching USD stock or ETF found.' : '未找到匹配的美元股票或 ETF。'}</div>
                : results.map(item => {
                  const duplicate = item.symbol === instruments[1 - side].symbol;
                  const current = item.symbol === instruments[side].symbol;
                  return <button key={item.symbol} type="button" className="ic-result" disabled={duplicate} onClick={() => onSelect(item)}>
                    <span className="ic-result-icon">{item.type === 'ETF' ? 'ETF' : englishMode ? 'US' : '股票'}</span>
                    <span className="ic-result-text"><strong>{item.symbol}</strong><span className="ic-result-market">US · USD</span><small>{item.name}</small></span>
                    <span className="ic-result-status">{duplicate ? (englishMode ? 'Other side' : '已在对比') : current ? (englishMode ? 'Selected' : '当前') : '+'}</span>
                  </button>;
                })}
      </div>
    </section>
  </div>, document.body);
}

export default function InvestmentComparisonPage({ ctx = {}, previewSource }) {
  const { userId = '', closeInvestmentComparison } = ctx;
  const englishMode = ctx.englishMode ?? (ctx.language === 'en');
  const loadSource = import.meta.env.DEV && previewSource?.load ? previewSource.load : loadInvestmentComparison;
  const searchSource = import.meta.env.DEV && previewSource?.search ? previewSource.search : searchInvestmentSymbols;
  const [instruments, setInstruments] = React.useState(DEFAULT_INSTRUMENTS);
  const [startYear, setStartYear] = React.useState(2011);
  const [principalText, setPrincipalText] = React.useState('1000000');
  const [scale, setScale] = React.useState('linear');
  const [pickerSide, setPickerSide] = React.useState(null);
  const [hiddenSymbols, setHiddenSymbols] = React.useState([]);
  const [allYears, setAllYears] = React.useState(false);
  const [annualOpen, setAnnualOpen] = React.useState(true);
  const [speed, setSpeed] = React.useState(0.2);
  const [playing, setPlaying] = React.useState(false);
  const [cursorState, setCursorState] = React.useState({ key: '', index: 0 });
  const [refreshVersion, setRefreshVersion] = React.useState(0);
  const [loadState, setLoadState] = React.useState({ key: '', data: null, loading: true, error: false });
  const requestRef = React.useRef(0);
  const manualRefreshKeyRef = React.useRef(null);
  const cursorRef = React.useRef(0);
  const symbols = React.useMemo(() => instruments.map(item => item.symbol), [instruments]);
  const requestKey = `${userId}:${symbols.join(':')}`;
  const principal = principalText.trim() ? Number(principalText) : NaN;
  const principalValid = Number.isFinite(principal) && principal >= 1 && principal <= 1000000000;
  const data = loadState.key === requestKey ? loadState.data : null;
  const cursorKey = `${requestKey}:${startYear}:${principal}`;
  const refreshHistory = () => {
    manualRefreshKeyRef.current = requestKey;
    setRefreshVersion(value => value + 1);
  };

  React.useEffect(() => {
    const requestId = ++requestRef.current;
    const controller = new AbortController();
    const force = manualRefreshKeyRef.current === requestKey;
    manualRefreshKeyRef.current = null;
    setPlaying(false);
    setPickerSide(null);
    setHiddenSymbols([]);
    setLoadState(current => ({ key: requestKey, data: current.key === requestKey ? current.data : null, loading: true, error: false }));
    loadSource({ userId, symbols, force, signal: controller.signal })
      .then(result => {
        if (requestRef.current === requestId && !controller.signal.aborted) setLoadState({ key: requestKey, data: result, loading: false, error: false });
      })
      .catch(() => {
        if (requestRef.current !== requestId || controller.signal.aborted) return;
        setLoadState({ key: requestKey, data: null, loading: false, error: true });
      });
    return () => { requestRef.current += 1; controller.abort(); };
  }, [loadSource, refreshVersion, requestKey, symbols, userId]);

  const modelResult = React.useMemo(() => {
    if (!data || !principalValid) return { model: null, error: false };
    try { return { model: buildInvestmentComparisonModel({ data, symbols, startYear, principal }), error: false }; }
    catch { return { model: null, error: true }; }
  }, [data, principal, principalValid, startYear, symbols]);
  const model = modelResult.model;
  const lastIndex = Math.max(0, (model?.points.length || 1) - 1);
  const cursor = cursorState.key === cursorKey ? Math.min(cursorState.index, lastIndex) : lastIndex;
  const snapshot = React.useMemo(() => model ? getInvestmentComparisonSnapshot(model, cursor) : null, [cursor, model]);
  cursorRef.current = cursor;

  React.useEffect(() => {
    setPlaying(false);
    setCursorState({ key: cursorKey, index: lastIndex });
  }, [cursorKey, lastIndex, model]);

  React.useEffect(() => {
    if (!playing || !model) return undefined;
    let animationId = null, previousTime = null, accumulated = 0;
    const step = time => {
      if (previousTime !== null) accumulated += Math.min(150, time - previousTime) / 1000 * PLAYBACK_DAYS_PER_SECOND * speed;
      previousTime = time;
      const wholeDays = Math.floor(accumulated);
      if (wholeDays > 0) {
        accumulated -= wholeDays;
        const index = Math.min(lastIndex, cursorRef.current + wholeDays);
        cursorRef.current = index;
        setCursorState({ key: cursorKey, index });
        if (index === lastIndex) { setPlaying(false); return; }
      }
      animationId = window.requestAnimationFrame(step);
    };
    const pauseWhenHidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    animationId = window.requestAnimationFrame(step);
    return () => { window.cancelAnimationFrame(animationId); document.removeEventListener('visibilitychange', pauseWhenHidden); };
  }, [cursorKey, lastIndex, model, playing, speed]);

  const yearNow = Number((data?.asOfDate || new Date().toISOString()).slice(0, 4));
  const years = Array.from({ length: Math.max(1, yearNow - 2000 + 1) }, (_, index) => yearNow - index);
  const annualRows = snapshot ? [...snapshot.annualRows].reverse() : [];
  const visibleAnnualRows = allYears ? annualRows : annualRows.slice(0, 3);
  const playLabel = playing ? (englishMode ? 'Pause' : '暂停回放') : cursor >= lastIndex ? (englishMode ? 'Replay history' : '播放回顾') : cursor === 0 ? (englishMode ? 'Start playback' : '开始回放') : (englishMode ? 'Continue' : '继续回放');
  const togglePlayback = () => {
    if (playing) { setPlaying(false); return; }
    if (!model || !lastIndex) return;
    if (cursor >= lastIndex) { cursorRef.current = 0; setCursorState({ key: cursorKey, index: 0 }); }
    setPlaying(true);
  };
  const seekPlayback = event => {
    const index = Number(event.target.value);
    cursorRef.current = index;
    setCursorState({ key: cursorKey, index });
  };

  return <div className="investment-comparison ic-page" data-investment-comparison-page="true">
    <header className="ic-header"><button type="button" className="ic-icon-button ic-back" onClick={closeInvestmentComparison} aria-label={englishMode ? 'Back to Trades' : '返回交易'}><ArrowLeft size={21} /></button><div><h1>{englishMode ? 'Investment Time Machine' : '投资时光机'}</h1><p>{englishMode ? 'One starting amount. Two investment journeys.' : '同一笔本金，不同的投资旅程'}</p></div><button type="button" className="ic-icon-button ic-refresh" disabled={loadState.loading} onClick={refreshHistory} aria-label={englishMode ? 'Refresh historical data' : '刷新历史数据'}><RefreshCw size={16} className={loadState.loading ? 'ic-spin' : ''} /></button></header>

    <div className="ic-settings" role="group" aria-label={englishMode ? 'Comparison settings' : '比较设置'}>
      <div className="ic-versus">{instruments.map((item, index) => <React.Fragment key={index}>{index === 1 && <span className="ic-vs">VS</span>}<button type="button" className="ic-pick-button" onClick={() => setPickerSide(index)} aria-haspopup="dialog" aria-label={englishMode ? `Change ${index === 0 ? 'left' : 'right'} investment ${item.symbol}` : `更换${index === 0 ? '左' : '右'}侧标的 ${item.symbol}`} style={{ '--ic-series': investmentRankColor(investmentRank(item.symbol, symbols, snapshot?.point)) }}><span className="ic-pick-dot" /><span className="ic-pick-identity"><strong>{item.symbol}</strong><small>{instrumentName(item, englishMode)}</small></span><ChevronDown size={17} className="ic-pick-chevron" /></button></React.Fragment>)}</div>
      <label className="ic-field">{englishMode ? 'Starting year' : '起始年份'}<select value={startYear} onChange={event => setStartYear(Number(event.target.value))}>{years.map(year => <option key={year} value={year}>{year}{englishMode ? '' : ' 年'}</option>)}</select></label>
      <label className="ic-field">{englishMode ? 'Principal per investment · USD' : '每个标的本金 · USD'}<input type="number" inputMode="decimal" min="1" max="1000000000" step="any" value={principalText} onChange={event => setPrincipalText(event.target.value)} aria-invalid={!principalValid} aria-label={englishMode ? 'Principal per investment in US dollars' : '每个标的本金，美元'} /></label>
    </div>

    {!principalValid && <p className="ic-feedback ic-invalid" role="alert">{englishMode ? 'Enter a principal from $1 to $1,000,000,000.' : '请输入 1 至 1,000,000,000 美元的有效本金。'}</p>}
    {loadState.key === requestKey && loadState.error && <div className="ic-feedback ic-error" role="alert"><span>{data ? (englishMode ? 'Refresh failed. Previous data is still shown.' : '刷新失败，暂时保留上次数据。') : (englishMode ? 'Historical data could not be loaded.' : '历史数据暂时无法读取。')}</span><button type="button" onClick={refreshHistory}>{englishMode ? 'Retry' : '重试'}</button></div>}
    {modelResult.error && <p className="ic-feedback" role="status">{englishMode ? 'The selected investments have insufficient shared history for this starting year.' : '所选标的在该起始年份后暂无足够的共同历史数据。'}</p>}
    {model?.startAdjustmentReason === 'available_history' && <p className="ic-feedback" role="status">{englishMode ? `Shared history starts on ${model.actualStartDate}; both investments begin on that date.` : `共同历史始于 ${model.actualStartDate}，两个标的均从该日开始投入。`}</p>}

    {snapshot ? <>
      <div className="ic-date-row"><div><span className="ic-date">{snapshot.point.date.replaceAll('-', '.')}</span><span className="ic-year-count">{englishMode ? `Year ${snapshot.point.year - model.actualStartYear + 1}` : `第 ${snapshot.point.year - model.actualStartYear + 1} 年`}</span></div><select className="ic-scale" value={scale} onChange={event => setScale(event.target.value)} aria-label={englishMode ? 'Asset axis scale' : '资产坐标刻度'}><option value="linear">{englishMode ? 'Amount scale' : '金额刻度'}</option><option value="log">{englishMode ? 'Log scale' : '对数刻度'}</option></select></div>
      <div className="ic-metrics">{symbols.map(symbol => {
        const rank = investmentRank(symbol, symbols, snapshot.point);
        const visible = !hiddenSymbols.includes(symbol);
        return <section key={symbol} className="ic-metric" data-investment-metric={symbol} data-rank={rank} style={{ '--ic-series': investmentRankColor(rank) }} aria-label={englishMode ? `${symbol} investment result` : `${symbol} 投资结果`}>
          <button type="button" className="ic-series-toggle" aria-pressed={visible} aria-label={englishMode ? `${visible ? 'Hide' : 'Show'} ${symbol} line` : `${visible ? '隐藏' : '显示'} ${symbol} 曲线`} onClick={() => setHiddenSymbols(current => current.includes(symbol) ? current.filter(item => item !== symbol) : current.length === 0 ? [symbol] : current)}><span />{symbol}</button><span className="ic-rank">{rank === 'leading' ? (englishMode ? 'Leading' : '领先') : rank === 'trailing' ? (englishMode ? 'Trailing' : '落后') : (englishMode ? 'Tied' : '持平')}</span>
          <div className="ic-amount" aria-label={englishMode ? 'Total assets including principal' : '包含本金的总资产'}>{formatInvestmentAmount(snapshot.point.values[symbol], englishMode)}</div>
          <div className="ic-return"><strong style={{ color: investmentChangeColor(snapshot.point.returns[symbol]) }}>{formatInvestmentPercent(snapshot.point.returns[symbol])}</strong><small>{englishMode ? 'Cumulative return' : '累计收益率'}</small></div>
        </section>;
      })}</div>

      <InvestmentComparisonChart model={model} snapshot={snapshot} hiddenSymbols={hiddenSymbols} scale={scale} englishMode={englishMode} />
      <div className="ic-playback"><label className="ic-range-head" htmlFor="investment-comparison-timeline"><span>{model.actualStartDate}</span><span>{englishMode ? 'Playback timeline' : '回放时间轴'}</span><span>{model.asOfDate}</span></label><input id="investment-comparison-timeline" className="ic-timeline" type="range" min="0" max={lastIndex} step="1" value={snapshot.index} aria-label={englishMode ? 'Daily playback timeline' : '按交易日回放时间轴'} aria-valuetext={`${snapshot.point.date}, ${symbols.map(symbol => `${symbol} ${formatInvestmentAmount(snapshot.point.values[symbol], englishMode)}`).join(', ')}`} onChange={seekPlayback} /><div className="ic-player"><button type="button" className="ic-play-button" onClick={togglePlayback} disabled={!lastIndex}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}<span>{playLabel}</span></button><select className="ic-speed" value={speed} onChange={event => setSpeed(Number(event.target.value))} aria-label={englishMode ? 'Playback speed' : '回放速度'}>{[0.1, 0.2, 0.4, 0.6, 0.8, 1, 2, 4].map(value => <option value={value} key={value}>{value}× {englishMode ? 'speed' : '速度'}</option>)}</select></div></div>

      <details className="ic-annual" open={annualOpen} onToggle={event => setAnnualOpen(event.currentTarget.open)}><summary>{englishMode ? 'Year-by-year returns' : '逐年收益'}</summary><table className="ic-table" aria-label={englishMode ? 'Yearly total assets, profit and return' : '逐年资产总额与当年收益'}><thead><tr><th scope="col">{englishMode ? 'Year' : '年份'}</th>{symbols.map(symbol => <th key={symbol} scope="col">{symbol}<br />{englishMode ? 'Assets / Year profit' : '总资产 / 当年收益'}</th>)}</tr></thead><tbody>{visibleAnnualRows.map(row => <tr key={row.year}><td>{row.year}{row.firstYearPartial && <small>{englishMode ? `From ${row.periodStartDate.slice(5)}` : `${row.periodStartDate.slice(5)} 起`}</small>}{!row.complete && <small>{englishMode ? `To ${row.throughDate.slice(5)}` : `截至 ${row.throughDate.slice(5)}`}</small>}</td>{symbols.map(symbol => {
        const item = row.bySymbol[symbol];
        return <td key={symbol}><strong>{formatInvestmentAmount(item.end, englishMode)}</strong><small style={{ color: investmentChangeColor(item.profit) }}>{formatInvestmentAmount(item.profit, englishMode, { signed: true })}</small><small style={{ color: investmentChangeColor(item.returnPct) }}>{formatInvestmentPercent(item.returnPct)}</small></td>;
      })}</tr>)}</tbody></table>{annualRows.length > 3 && <button type="button" className="ic-more" onClick={() => setAllYears(value => !value)}>{allYears ? (englishMode ? 'Show fewer years' : '收起年份') : englishMode ? `Show all ${annualRows.length} years` : `展开全部 ${annualRows.length} 年`}</button>}</details>
      <div className="ic-source"><span>{model.asOfDate}{model.stale ? (englishMode ? ' · Update pending' : ' · 待更新') : ''}</span><span>{englishMode ? 'EODHD · Adjusted daily closes' : 'EODHD · 复权日线'}</span></div>
      {model.stale && model.expectedAsOfDate && <p className="ic-feedback">{englishMode ? `Latest expected close: ${model.expectedAsOfDate}.` : `最近应有收盘日：${model.expectedAsOfDate}。`}</p>}
      <details className="ic-methodology"><summary>{englishMode ? 'Calculation method' : '计算口径'}</summary><p>{englishMode ? `Each investment starts with the same $${principal.toLocaleString('en-US')} on ${model.actualStartDate}, the first available joint session on or after the requested start, and is held through the playback date.` : `每个标的分别投入相同的 ${principal.toLocaleString('en-US')} 美元，于所选起点后首个可用共同交易日 ${model.actualStartDate} 一次性买入，并持有至回放日期。`}</p><p>{englishMode ? 'Total assets include principal; cumulative profit and return exclude it. Adjusted prices account for dividends and splits. Fractional shares are allowed; taxes, trading fees and currency changes are excluded.' : '总资产包含本金，累计盈亏与收益率不包含本金。复权价已调整分红与拆股；允许碎股，不计税费、交易费和汇率变化。'}</p><p>{englishMode ? 'Playback uses actual daily closes only. This historical comparison does not place trades or change your account records.' : '回放仅使用真实日线收盘数据。本工具用于历史对比，不会下单或改变账户记录。'}</p></details>
    </> : <div className="ic-loading" role="status">{loadState.loading || loadState.key !== requestKey ? <><RefreshCw size={18} className="ic-spin" /><span>{englishMode ? 'Loading shared historical data…' : '正在读取共同历史数据…'}</span></> : <span>{englishMode ? 'Adjust the comparison settings or retry loading.' : '请调整比较设置或重试读取数据。'}</span>}</div>}

    {pickerSide !== null && <InvestmentSymbolPicker side={pickerSide} instruments={instruments} userId={userId} englishMode={englishMode} searchSource={searchSource} onClose={() => setPickerSide(null)} onSelect={item => { setInstruments(current => current.map((existing, index) => index === pickerSide ? item : existing)); setPickerSide(null); }} />}
  </div>;
}
