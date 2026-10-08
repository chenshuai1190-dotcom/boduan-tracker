import React from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Search, X } from 'lucide-react';
import InvestmentSymbolPresets from './InvestmentSymbolPresets.jsx';
import './InvestmentComparison.css';

export default function InvestmentSymbolPicker({ selectedSymbol, comparisonSymbol = '', title, userId, englishMode = false, searchSource, onSelect, onClose }) {
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
  const pickerTitle = title || (englishMode ? 'Change investment' : '更换投资标的');

  return createPortal(<div className="investment-comparison ic-time-machine ic-sheet-overlay" style={viewport ? { top: viewport.top, height: viewport.height, bottom: 'auto' } : undefined} onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="ic-picker" role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="investment-picker-title">
      <div className="ic-picker-handle" />
      <header className="ic-picker-head"><h2 id="investment-picker-title">{pickerTitle}</h2><button type="button" className="ic-icon-button" onClick={onClose} aria-label={englishMode ? 'Close stock search' : '关闭股票搜索'}><X size={21} /></button></header>
      <div className="ic-picker-context">{englishMode ? 'Current' : '当前'} <strong>{selectedSymbol}</strong>{comparisonSymbol && <><span>·</span>{englishMode ? 'Compared with' : '对比'} <strong>{comparisonSymbol}</strong></>}</div>
      <label className="ic-search-label"><Search size={18} aria-hidden="true" /><input ref={inputRef} type="search" value={query} onChange={event => { setQuery(event.target.value); setAttempt(0); }} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder={englishMode ? 'Search symbol or company name' : '搜索股票代码 / 名称'} aria-label={englishMode ? 'Search US stocks and ETFs' : '搜索美股与 ETF'} /></label>
      <div className="ic-results-heading"><span>{normalizedQuery ? (englishMode ? 'Search results' : '搜索结果') : (englishMode ? 'Stocks & ETFs' : '股票与 ETF 快捷选择')}</span><span>US · USD</span></div>
      <div className="ic-results" aria-busy={state.loading}>
        {!normalizedQuery ? <InvestmentSymbolPresets selectedSymbol={selectedSymbol} comparisonSymbol={comparisonSymbol} englishMode={englishMode} onSelect={onSelect} />
          : !matchesCurrentQuery || state.loading ? <div className="ic-search-empty" role="status"><RefreshCw size={15} className="ic-spin" />{englishMode ? 'Searching…' : '搜索中…'}</div>
            : state.error ? <div className="ic-search-empty" role="alert"><span>{englishMode ? 'Search is temporarily unavailable.' : '搜索暂时不可用。'}</span><button type="button" onClick={() => setAttempt(value => value + 1)}>{englishMode ? 'Retry' : '重试'}</button></div>
              : results.length === 0 ? <div className="ic-search-empty">{englishMode ? 'No matching USD stock or ETF found.' : '未找到匹配的美元股票或 ETF。'}</div>
                : results.map(item => {
                  const duplicate = item.symbol === comparisonSymbol;
                  const current = item.symbol === selectedSymbol;
                  return <button key={item.symbol} type="button" className="ic-result" disabled={duplicate} onClick={() => { if (!duplicate) onSelect(item); }}>
                    <span className="ic-result-icon">{item.type === 'ETF' ? 'ETF' : englishMode ? 'US' : '股票'}</span>
                    <span className="ic-result-text"><strong>{item.symbol}</strong><span className="ic-result-market">US · USD</span><small>{item.name}</small></span>
                    <span className="ic-result-status">{duplicate ? (englishMode ? 'Other side' : '已在对比') : current ? (englishMode ? 'Selected' : '当前') : '+'}</span>
                  </button>;
                })}
      </div>
    </section>
  </div>, document.body);
}
