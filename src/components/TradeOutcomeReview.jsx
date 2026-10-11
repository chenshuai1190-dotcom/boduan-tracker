import React from 'react';
import { loadDcaHistory } from '../lib/dcaHistory.js';
import { buildTradeOutcomeReview } from '../lib/tradeOutcomeReview.js';
import { normalizeInvestmentSymbol } from '../lib/investmentComparisonModel.js';
import { marketHexColor } from '../lib/marketColorMode.js';
import './TradeOutcomeReview.css';

function percent(value) {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.abs(value) < 0.005 ? 0 : value;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}%`;
}

function unavailableText(reason, english) {
  if (reason === 'awaiting_trade_close') return english ? 'Waiting for the trade date’s completed close.' : '等待成交日完成收盘。';
  if (reason === 'missing_trade_close') return english ? 'The trade date has no verified close; a different date will not be substituted.' : '成交日缺少有效收盘，不使用其他日期替代。';
  return english ? 'Historical prices are unavailable.' : '历史行情暂不可用。';
}

export function TradeOutcomeReviewContent({ model, note, language = 'zh', marketColorMode }) {
  const english = language.startsWith('en');
  const signedStyle = value => Number.isFinite(value) && Math.abs(value) >= 0.005
    ? { color: marketHexColor(value, marketColorMode) } : undefined;
  return <div className="trade-outcome-content">
    {model?.status === 'ready' ? <>
      <div className="trade-outcome-basis">{english ? `From ${model.tradeDate} close` : `以 ${model.tradeDate} 收盘为基准`}</div>
      <table className="trade-outcome-table">
        <thead><tr>
          <th scope="col">{english ? 'Sessions' : '交易日'}</th>
          <th scope="col">{english ? 'Change' : '涨跌幅'}</th>
          <th scope="col">{english ? 'Max rise' : '最大上涨'}</th>
          <th scope="col">{english ? 'Max fall' : '最大下跌'}</th>
        </tr></thead>
        <tbody>{model.windows.map(window => <tr key={window.days}>
          <th scope="row">{window.days} {english ? 'days' : '日'}</th>
          {window.status === 'available' ? <>
            <td style={signedStyle(window.returnPct)}>{percent(window.returnPct)}</td>
            <td style={signedStyle(window.maxRisePct)}>{percent(window.maxRisePct)}</td>
            <td style={signedStyle(window.maxFallPct)}>{percent(window.maxFallPct)}</td>
          </> : <td colSpan="3" className="trade-outcome-pending">{window.status === 'pending'
            ? english ? `${window.observedDays}/${window.days} sessions observed` : `已观察 ${window.observedDays} / ${window.days} 日`
            : english ? 'Missing closing prices' : '收盘数据不完整'}</td>}
        </tr>)}</tbody>
      </table>
      <p className="trade-outcome-footnote">{english ? 'Adjusted close-to-close moves after the trade date, not execution P&L. Extremes use daily closes.' : '成交日收盘后的复权表现，非成交盈亏。最高、最低按每日收盘计算。'}</p>
      <p className="trade-outcome-asof">{english ? 'Data through ' : '数据截至 '}{model.asOfDate}{model.stale ? english ? ' · Awaiting update' : ' · 待更新' : ''}</p>
    </> : <p className="trade-outcome-feedback" role="status">{unavailableText(model?.reason, english)}</p>}
    {typeof note === 'string' && note.trim() && <div className="trade-outcome-note"><span>{english ? 'Trade note' : '交易备注'}</span><p>{note}</p></div>}
  </div>;
}

/** Render inside trade details. History is requested only after expansion. */
export default function TradeOutcomeReview({ trade, userId, language = 'zh', marketColorMode,
  historyLoader = loadDcaHistory, initiallyExpanded = false }) {
  const english = language.startsWith('en');
  const [expanded, setExpanded] = React.useState(initiallyExpanded);
  const [refresh, setRefresh] = React.useState(0);
  const refreshTargetRef = React.useRef('');
  const [state, setState] = React.useState({ key: '', loading: false, history: null, error: false });
  const contentId = React.useId();
  const symbol = normalizeInvestmentSymbol(trade?.symbol);
  const baseKey = `${userId || ''}:${symbol || ''}:${trade?.date || ''}`;
  const key = `${baseKey}:${refresh}`;
  React.useEffect(() => {
    if (!expanded || !symbol) return undefined;
    const controller = new AbortController();
    setState({ key, loading: true, history: null, error: false });
    Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      const force = refreshTargetRef.current === key;
      if (force) refreshTargetRef.current = '';
      return historyLoader({ userId, symbol, force, signal: controller.signal });
    })
      .then(history => { if (!controller.signal.aborted) setState({ key, loading: false, history, error: false }); })
      .catch(() => { if (!controller.signal.aborted) setState({ key, loading: false, history: null, error: true }); });
    return () => controller.abort();
  }, [expanded, key, userId, symbol, refresh, historyLoader]);
  const current = state.key === key ? state : null;
  const model = React.useMemo(() => current?.history ? buildTradeOutcomeReview({ trade, history: current.history }) : null,
    [trade, current?.history]);
  const retryHistory = () => {
    refreshTargetRef.current = `${baseKey}:${refresh + 1}`;
    setRefresh(value => value + 1);
  };
  return <section className="trade-outcome-review" data-trade-outcome-review="true">
    <button type="button" className="trade-outcome-toggle" aria-expanded={expanded} aria-controls={contentId}
      onClick={() => setExpanded(value => !value)}>
      <span>{english ? 'Post-trade review' : '操作复盘'}</span><span className="trade-outcome-toggle-detail">5 / 20 / 60 {english ? 'sessions' : '交易日'} <span aria-hidden="true">{expanded ? '−' : '+'}</span></span>
    </button>
    {expanded && <div id={contentId}>
      {!symbol ? <TradeOutcomeReviewContent model={null} note={trade?.note} language={language} marketColorMode={marketColorMode} />
        : !current || current.loading ? <p className="trade-outcome-feedback" role="status">{english ? 'Loading historical prices…' : '正在读取历史行情…'}</p>
        : current.error ? <div className="trade-outcome-feedback" role="status"><span>{english ? 'Historical prices are unavailable.' : '历史行情暂不可用。'}</span><button type="button" onClick={retryHistory}>{english ? 'Retry' : '重试'}</button></div>
          : <TradeOutcomeReviewContent model={model} note={trade?.note} language={language} marketColorMode={marketColorMode} />}
    </div>}
  </section>;
}
