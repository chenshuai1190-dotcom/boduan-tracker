import React from 'react';
import CurrencyToggle from '../components/CurrencyToggle.jsx';
import { ArrowLeft, ChevronDown, Pause, Play, RefreshCw } from 'lucide-react';
import InvestmentComparisonChart, { formatInvestmentAmount, formatInvestmentPercent, investmentChangeColor, investmentRank, investmentRankColor } from '../components/InvestmentComparisonChart.jsx';
import InvestmentSymbolPicker from '../components/InvestmentSymbolPicker.jsx';
import InvestmentAnalysisTabs from '../components/InvestmentAnalysisTabs.jsx';
import InvestmentDrawdownView from '../components/InvestmentDrawdownView.jsx';
import { getInvestmentComparisonExpectedCloseDate, loadInvestmentComparison, searchInvestmentSymbols } from '../lib/investmentComparison.js';
import { buildInvestmentComparisonModel, getInvestmentComparisonSnapshot } from '../lib/investmentComparisonModel.js';
import { getInvestmentComparisonLead } from '../lib/investmentComparisonLead.js';
import { resolveInvestmentDisplayRate, investmentPrincipalUsd, investmentPrincipalInput } from '../lib/investmentComparisonCurrency.js';
import '../components/InvestmentComparison.css';

const DEFAULT_INSTRUMENTS = [{ symbol: 'QQQ', name: 'Invesco QQQ Trust', type: 'ETF' }, { symbol: 'TQQQ', name: 'ProShares UltraPro QQQ', type: 'ETF' }];
const PLAYBACK_DAYS_PER_SECOND = 125;

function historyErrorMessage(code, englishMode) {
  if (code === 'INVALID_DATA') return englishMode ? 'The selected period has missing or conflicting historical data and cannot be compared.' : '所选区间历史数据存在缺失或冲突，暂时无法对比。';
  if (code === 'INSUFFICIENT_HISTORY') return englishMode ? 'The selected investments have insufficient shared history for this starting year.' : '所选标的在该起始年份后暂无足够的共同历史数据。';
  if (code === 'INVALID_START_YEAR') return englishMode ? 'Choose a starting year within completed market history.' : '请选择已完成收盘年份范围内的起始年份。';
  return englishMode ? 'Historical data could not be loaded.' : '历史数据暂时无法读取。';
}


export default function InvestmentComparisonPage({ ctx = {}, previewSource }) {
  const { userId = '', closeInvestmentComparison, marketColorMode = 'redUpGreenDown' } = ctx;
  const englishMode = ctx.englishMode ?? (ctx.language === 'en');
  const loadSource = import.meta.env.DEV && previewSource?.load ? previewSource.load : loadInvestmentComparison;
  const searchSource = import.meta.env.DEV && previewSource?.search ? previewSource.search : searchInvestmentSymbols;
  const [instruments, setInstruments] = React.useState(DEFAULT_INSTRUMENTS);
  const [startYear, setStartYear] = React.useState(2011);
  const [displayCurrency, setDisplayCurrency] = React.useState('CNY');
  const [principalDraft, setPrincipalDraft] = React.useState(() => ({ text: '1000000', currency: 'CNY', rate: resolveInvestmentDisplayRate('CNY', ctx.usdRate) }));
  const [scale, setScale] = React.useState('linear');
  const [analysisView, setAnalysisView] = React.useState('growth');
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
  const requestKey = `${userId}:${symbols.join(':')}:${startYear}`;
  const displayRate = resolveInvestmentDisplayRate(displayCurrency, ctx.usdRate);
  const cnyRate = resolveInvestmentDisplayRate('CNY', ctx.usdRate);
  const cnyAvailable = cnyRate !== null;
  const principalRatePending = principalDraft.currency === 'CNY' && principalDraft.rate === null;
  const principal = investmentPrincipalUsd(principalDraft);
  const principalText = principalRatePending
    ? (displayCurrency === 'CNY' ? principalDraft.text : '')
    : investmentPrincipalInput(principalDraft, displayCurrency, ctx.usdRate);
  const setPrincipalText = text => setPrincipalDraft({ text, currency: displayCurrency, rate: displayRate });
  const money = (value, options = {}) => formatInvestmentAmount(value, englishMode, { ...options, displayCurrency, displayRate });
  const exactMoney = value => Number.isFinite(value) && displayRate !== null
    ? `${displayCurrency === 'CNY' ? '¥' : '$'}${(value * displayRate).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—';
  const principalValid = Number.isFinite(principal) && principal >= 1 && principal <= 1000000000;
  const data = loadState.key === requestKey ? loadState.data : null;
  const cursorKey = `${requestKey}:${startYear}:${principal}`;
  const refreshHistory = () => {
    manualRefreshKeyRef.current = requestKey;
    setRefreshVersion(value => value + 1);
  };

  React.useEffect(() => {
    if (!principalRatePending || cnyRate === null) return;
    // Resolve the initial CNY amount once; later FX updates remain display-only.
    setPrincipalDraft(current => current.currency === 'CNY' && current.rate === null
      ? { ...current, rate: cnyRate } : current);
  }, [principalRatePending, cnyRate]);

  React.useEffect(() => {
    const requestId = ++requestRef.current;
    const controller = new AbortController();
    const force = manualRefreshKeyRef.current === requestKey;
    manualRefreshKeyRef.current = null;
    setPlaying(false);
    setPickerSide(null);
    setHiddenSymbols([]);
    setLoadState(current => ({ key: requestKey, data: current.key === requestKey ? current.data : null, loading: true, error: false }));
    loadSource({ userId, symbols, startYear, force, signal: controller.signal })
      .then(result => {
        if (requestRef.current === requestId && !controller.signal.aborted) setLoadState({ key: requestKey, data: result, loading: false, error: false });
      })
      .catch(error => {
        if (requestRef.current !== requestId || controller.signal.aborted) return;
        setLoadState({ key: requestKey, data: null, loading: false, error: error?.code || 'REQUEST_ERROR' });
      });
    return () => { requestRef.current += 1; controller.abort(); };
  }, [loadSource, refreshVersion, requestKey, startYear, symbols, userId]);

  const modelResult = React.useMemo(() => {
    if (!data || !principalValid) return { model: null, error: false };
    try { return { model: buildInvestmentComparisonModel({ data, symbols, startYear, principal }), error: false }; }
    catch (error) { return { model: null, error: error?.code || 'INVALID_DATA' }; }
  }, [data, principal, principalValid, startYear, symbols]);
  const model = modelResult.model;
  const lastIndex = Math.max(0, (model?.points.length || 1) - 1);
  const cursor = cursorState.key === cursorKey ? Math.min(cursorState.index, lastIndex) : lastIndex;
  const snapshot = React.useMemo(() => model ? getInvestmentComparisonSnapshot(model, cursor) : null, [cursor, model]);
  const lead = getInvestmentComparisonLead(symbols, snapshot?.point);
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

  const yearNow = Number(getInvestmentComparisonExpectedCloseDate().slice(0, 4));
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

  return <div className="investment-comparison ic-time-machine ic-page" data-investment-comparison-page="true">
    <header className="ic-header"><button type="button" className="ic-icon-button ic-back" onClick={closeInvestmentComparison} aria-label={englishMode ? 'Back to Trades' : '返回交易'}><ArrowLeft size={21} /></button><div><h1>{englishMode ? 'Investment Replay' : '投资回溯'}</h1><p>{englishMode ? 'One starting amount. Two investment journeys.' : '同一笔本金，不同的投资旅程'}</p></div><CurrencyToggle className="ic-currency-control" value={displayCurrency} label={englishMode ? 'Display currency' : '显示币种'} disabledCurrencies={!cnyAvailable ? ['CNY'] : []} onChange={next => { if (resolveInvestmentDisplayRate(next, ctx.usdRate) !== null) setDisplayCurrency(next); }} /></header>

    <InvestmentAnalysisTabs value={analysisView} englishMode={englishMode} onChange={view => { if (view !== analysisView) { setPlaying(false); setAnalysisView(view); } }} />

    <div className="ic-settings" role="group" aria-label={englishMode ? 'Comparison settings' : '比较设置'}>
      <div className="ic-versus">{instruments.map((item, index) => <React.Fragment key={index}>{index === 1 && <span className="ic-vs">VS</span>}<button type="button" className="ic-pick-button" onClick={() => setPickerSide(index)} aria-haspopup="dialog" aria-label={englishMode ? `Change ${index === 0 ? 'left' : 'right'} investment ${item.symbol}` : `更换${index === 0 ? '左' : '右'}侧标的 ${item.symbol}`} style={{ '--ic-series': investmentRankColor(investmentRank(item.symbol, symbols, snapshot?.point)) }}><span className="ic-pick-dot" /><span className="ic-pick-identity"><strong>{item.symbol}</strong></span><ChevronDown size={17} className="ic-pick-chevron" /></button></React.Fragment>)}</div>
      <label className="ic-field">{englishMode ? 'Starting year' : '起始年份'}<span className="ic-select-control"><select value={startYear} onChange={event => setStartYear(Number(event.target.value))} aria-label={englishMode ? 'Starting year' : '起始年份'}>{years.map(year => <option key={year} value={year}>{year}{englishMode ? '' : ' 年'}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></span></label>
      <label className="ic-field">{englishMode ? `Principal per investment · ${displayCurrency}` : `每个标的本金 · ${displayCurrency}`} <input type="number" inputMode="decimal" min={displayRate ?? undefined} max={displayRate === null ? undefined : 1000000000 * displayRate} disabled={displayRate === null} step="any" value={principalText} onChange={event => setPrincipalText(event.target.value)} aria-invalid={!principalValid && !principalRatePending} aria-label={englishMode ? `Principal per investment in ${displayCurrency === 'CNY' ? 'Chinese yuan' : 'US dollars'}` : `每个标的本金，${displayCurrency === 'CNY' ? '人民币' : '美元'}`} /></label>
    </div>

    {principalRatePending ? <p className="ic-feedback" role="status">{englishMode ? 'Waiting for an exchange rate. Your principal remains in CNY.' : '等待汇率，本金保留为人民币。'}</p> : displayRate === null && <p className="ic-feedback" role="status">{englishMode ? 'CNY conversion is unavailable. Switch to USD.' : '人民币换算暂不可用，请切换 USD。'}</p>}
    {!principalValid && !principalRatePending && <p className="ic-feedback ic-invalid" role="alert">{englishMode ? `Enter a principal from ${exactMoney(1)} to ${exactMoney(1000000000)}.` : `请输入 ${exactMoney(1)} 至 ${exactMoney(1000000000)} 的有效本金。`}</p>}
    {loadState.key === requestKey && loadState.error && <div className="ic-feedback ic-error" role="alert"><span>{historyErrorMessage(loadState.error, englishMode)}</span><button type="button" onClick={refreshHistory} disabled={loadState.loading}>{englishMode ? 'Retry' : '重试'}</button></div>}
    {modelResult.error && <div className="ic-feedback ic-error" role="status"><span>{historyErrorMessage(modelResult.error, englishMode)}</span><button type="button" onClick={refreshHistory} disabled={loadState.loading}>{englishMode ? 'Retry' : '重试'}</button></div>}
    {model?.startAdjustmentReason === 'available_history' && <p className="ic-feedback" role="status">{englishMode ? `Shared history starts on ${model.actualStartDate}; both investments begin on that date.` : `共同历史始于 ${model.actualStartDate}，两个标的均从该日开始投入。`}</p>}

    <div id="ic-analysis-panel" role="tabpanel" aria-labelledby={`ic-tab-${analysisView}`} tabIndex={0}>
    {snapshot ? analysisView === 'drawdown' ? <InvestmentDrawdownView key={cursorKey} model={model} englishMode={englishMode} marketColorMode={marketColorMode} displayCurrency={displayCurrency} displayRate={displayRate} /> : <>
      <div className="ic-date-row"><div><span className="ic-date">{snapshot.point.date.replaceAll('-', '.')}</span><span className="ic-year-count">{englishMode ? `Year ${snapshot.point.year - model.actualStartYear + 1}` : `第 ${snapshot.point.year - model.actualStartYear + 1} 年`}</span></div><select className="ic-scale" value={scale} onChange={event => setScale(event.target.value)} aria-label={englishMode ? 'Asset axis scale' : '资产坐标刻度'}><option value="linear">{englishMode ? 'Amount scale' : '金额刻度'}</option><option value="log">{englishMode ? 'Log scale' : '对数刻度'}</option></select></div>
      <div className="ic-metrics">{symbols.map(symbol => {
        const rank = investmentRank(symbol, symbols, snapshot.point);
        const visible = !hiddenSymbols.includes(symbol);
        return <section key={symbol} className="ic-metric" data-investment-metric={symbol} data-rank={rank} style={{ '--ic-series': investmentRankColor(rank) }} aria-label={englishMode ? `${symbol} investment result` : `${symbol} 投资结果`}>
          <button type="button" className="ic-series-toggle" aria-pressed={visible} aria-label={englishMode ? `${visible ? 'Hide' : 'Show'} ${symbol} line` : `${visible ? '隐藏' : '显示'} ${symbol} 曲线`} onClick={() => setHiddenSymbols(current => current.includes(symbol) ? current.filter(item => item !== symbol) : current.length === 0 ? [symbol] : current)}><span />{symbol}</button><span className="ic-rank">{rank === 'leading' ? (englishMode ? 'Leading' : '领先') : rank === 'trailing' ? (englishMode ? 'Trailing' : '落后') : (englishMode ? 'Tied' : '持平')}</span>
          <div className="ic-amount" aria-label={englishMode ? 'Total assets including principal' : '包含本金的总资产'}>{money(snapshot.point.values[symbol])}</div>
          <div className="ic-return"><strong style={{ color: investmentChangeColor(snapshot.point.returns[symbol], marketColorMode) }}>{formatInvestmentPercent(snapshot.point.returns[symbol])}</strong><small>{englishMode ? 'Cumulative return' : '累计收益率'}</small></div>
        </section>;
      })}</div>

      <div className="ic-lead-comparison" data-investment-lead-comparison="true">
        <span>{!lead ? (englishMode ? 'Lead amount' : '领先差额') : lead.tied ? (englishMode ? 'Returns tied' : '收益持平') : englishMode ? `${lead.leader} leads ${lead.trailing}` : `${lead.leader} 领先 ${lead.trailing}`}</span>
        <strong style={{ color: investmentRankColor(lead && !lead.tied && displayRate !== null ? 'leading' : 'tied') }}>{lead ? money(lead.amountUsd, { digits: 2 }) : '—'}</strong>
      </div>

      <InvestmentComparisonChart model={model} snapshot={snapshot} hiddenSymbols={hiddenSymbols} scale={scale} englishMode={englishMode} marketColorMode={marketColorMode} displayCurrency={displayCurrency} displayRate={displayRate} />
      <div className="ic-playback"><label className="ic-range-head" htmlFor="investment-comparison-timeline"><span>{model.actualStartDate}</span><span>{englishMode ? 'Playback timeline' : '回放时间轴'}</span><span>{model.asOfDate}</span></label><input id="investment-comparison-timeline" className="ic-timeline" type="range" min="0" max={lastIndex} step="1" value={snapshot.index} aria-label={englishMode ? 'Daily playback timeline' : '按交易日回放时间轴'} aria-valuetext={`${snapshot.point.date}, ${symbols.map(symbol => `${symbol} ${money(snapshot.point.values[symbol])}`).join(', ')}`} onChange={seekPlayback} /><div className="ic-player"><button type="button" className="ic-play-button" onClick={togglePlayback} disabled={!lastIndex}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}<span>{playLabel}</span></button><select className="ic-speed" value={speed} onChange={event => setSpeed(Number(event.target.value))} aria-label={englishMode ? 'Playback speed' : '回放速度'}>{[0.1, 0.2, 0.4, 0.6, 0.8, 1, 2, 4].map(value => <option value={value} key={value}>{value}× {englishMode ? 'speed' : '速度'}</option>)}</select></div></div>

      <details className="ic-annual" open={annualOpen} onToggle={event => setAnnualOpen(event.currentTarget.open)}><summary>{englishMode ? 'Year-by-year returns' : '逐年收益'}</summary><table className="ic-table" aria-label={englishMode ? 'Yearly total assets, profit and return' : '逐年资产总额与当年收益'}><thead><tr><th scope="col">{englishMode ? 'Year' : '年份'}</th>{symbols.map(symbol => <th key={symbol} scope="col">{symbol}<br />{englishMode ? 'Assets / Year profit' : '总资产 / 当年收益'}</th>)}</tr></thead><tbody>{visibleAnnualRows.map(row => <tr key={row.year}><td>{row.year}{row.firstYearPartial && <small>{englishMode ? `From ${row.periodStartDate.slice(5)}` : `${row.periodStartDate.slice(5)} 起`}</small>}{!row.complete && <small>{englishMode ? `To ${row.throughDate.slice(5)}` : `截至 ${row.throughDate.slice(5)}`}</small>}</td>{symbols.map(symbol => {
        const item = row.bySymbol[symbol];
        return <td key={symbol}><strong>{money(item.end)}</strong><small style={{ color: investmentChangeColor(item.profit, marketColorMode) }}>{money(item.profit, { signed: true })}</small><small style={{ color: investmentChangeColor(item.returnPct, marketColorMode) }}>{formatInvestmentPercent(item.returnPct)}</small></td>;
      })}</tr>)}</tbody></table>{annualRows.length > 3 && <button type="button" className="ic-more" onClick={() => setAllYears(value => !value)}>{allYears ? (englishMode ? 'Show fewer years' : '收起年份') : englishMode ? `Show all ${annualRows.length} years` : `展开全部 ${annualRows.length} 年`}</button>}</details>
    </> : <div className="ic-loading" role="status">{loadState.loading || loadState.key !== requestKey ? <><RefreshCw size={18} className="ic-spin" /><span>{englishMode ? 'Loading shared historical data…' : '正在读取共同历史数据…'}</span></> : <span>{englishMode ? 'Adjust the comparison settings or retry loading.' : '请调整比较设置或重试读取数据。'}</span>}</div>}
    </div>
    {model && model.stale && model.expectedAsOfDate && <div className="ic-feedback ic-error" role="status"><span>{englishMode ? `Latest expected close: ${model.expectedAsOfDate}.` : `最近应有收盘日：${model.expectedAsOfDate}。`}</span><button type="button" onClick={refreshHistory} disabled={loadState.loading}>{englishMode ? 'Retry' : '重试'}</button></div>}

    {pickerSide !== null && <InvestmentSymbolPicker selectedSymbol={instruments[pickerSide].symbol} comparisonSymbol={instruments[1 - pickerSide].symbol} title={englishMode ? `Change ${pickerSide === 0 ? 'left' : 'right'} investment` : `更换${pickerSide === 0 ? '左' : '右'}侧标的`} userId={userId} englishMode={englishMode} searchSource={searchSource} onClose={() => setPickerSide(null)} onSelect={item => { setInstruments(current => current.map((existing, index) => index === pickerSide ? item : existing)); setPickerSide(null); }} />}
  </div>;
}
