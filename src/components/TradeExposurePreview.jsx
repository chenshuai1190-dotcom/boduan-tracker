import React from 'react';
import { ChevronDown } from 'lucide-react';
import { loadPortfolioOverlap } from '../lib/portfolioOverlap.js';
import { deriveTradeExposurePreview } from '../lib/tradeExposurePreview.js';
import './TradeExposurePreview.css';

const percent = value => Number.isFinite(value) ? `${value.toFixed(1)}%` : '—';

/** Public metadata is fetched only after expansion; draft amounts stay on device. */
export default function TradeExposurePreview({ preview, userId, englishMode = false, previewLoader, initiallyExpanded = false }) {
  const [open, setOpen] = React.useState(initiallyExpanded);
  const [showAll, setShowAll] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  const [state, setState] = React.useState({ key: '', status: 'idle', data: null });
  const refreshTargetRef = React.useRef('');
  const currentHoldings = preview?.portfolio?.current;
  const afterHoldings = preview?.portfolio?.after;
  const symbols = [...new Set([...(currentHoldings || []), ...(afterHoldings || [])].map(row => row.symbol))].sort().join(',');
  const baseKey = `${userId || ''}:${symbols}`;
  const key = `${baseKey}:${retry}`;
  const loader = import.meta.env.DEV && previewLoader ? previewLoader : loadPortfolioOverlap;
  React.useEffect(() => {
    if (!open || !userId || !symbols) return undefined;
    const controller = new AbortController();
    const force = refreshTargetRef.current === key;
    if (force) refreshTargetRef.current = '';
    setState({ key, status: 'loading', data: null });
    Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      return loader({ userId, symbols: symbols.split(','), signal: controller.signal, force });
    })
      .then(data => {
        if (controller.signal.aborted) return;
        if (data?.version !== 1 || !Array.isArray(data.instruments)) throw new Error('Invalid metadata');
        setState({ key, status: 'ready', data });
      }).catch(() => {
        if (!controller.signal.aborted) setState({ key, status: 'error', data: null });
      });
    return () => controller.abort();
  }, [open, key, loader, retry, symbols, userId]);
  const scoped = state.key === key ? state : { status: 'loading', data: null };
  const model = React.useMemo(() => scoped.status === 'ready'
    ? deriveTradeExposurePreview({ currentHoldings, afterHoldings, instruments: scoped.data.instruments })
    : null, [currentHoldings, afterHoldings, scoped.status, scoped.data]);
  if (!preview?.applies) return null;
  const sourceDates = [...new Set([...(model?.current?.positions || []), ...(model?.after?.positions || [])]
    .filter(row => row.kind === 'plain_etf' || row.kind === 'unknown').map(row => row.metadata?.asOfDate ? `${row.symbol} ${row.metadata.asOfDate}` : `${row.symbol} ${englishMode ? 'unavailable' : '不可用'}`))];
  const retryMetadata = () => {
    refreshTargetRef.current = `${baseKey}:${retry + 1}`;
    setRetry(value => value + 1);
  };
  return <section className="trade-exposure-preview" data-trade-exposure-preview="true">
    <button type="button" className="trade-exposure-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span>{englishMode ? 'Exposure after this trade' : '交易后穿透仓位'}</span>
      <ChevronDown size={15} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
    </button>
    {open && <div className="trade-exposure-body">
      {(!currentHoldings && !afterHoldings) || !userId ? <p className="trade-exposure-note">{englishMode ? 'Holdings or valuation unavailable' : '持仓或估值暂不可用'}</p>
        : scoped.status === 'error' ? <p className="trade-exposure-note">{englishMode ? 'Metadata unavailable' : '成分数据暂不可用'} <button type="button" onClick={retryMetadata}>{englishMode ? 'Retry' : '重试'}</button></p>
          : symbols && scoped.status !== 'ready' ? <p className="trade-exposure-note" role="status">{englishMode ? 'Loading underlying holdings…' : '正在读取成分…'}</p>
            : model ? <>
              <div className="trade-exposure-concentration"><span>{model.partial ? (englishMode ? 'Top 5 · identified holdings' : '前五标的集中度 · 已识别') : (englishMode ? 'Top 5 concentration' : '前五标的集中度')}</span><strong>{percent(model.topFive.current)} <span>→</span> {percent(model.topFive.after)}</strong></div>
              <div className="trade-exposure-columns"><span>{englishMode ? 'Direct + via ETFs' : '直接＋ETF 间接持仓'}</span><span>{englishMode ? 'Current → After' : '当前 → 交易后'}</span></div>
              {model.companies.slice(0, showAll ? undefined : 5).map(row => <div className="trade-exposure-row" key={row.symbol}>
                <strong>{row.symbol}</strong><span>{percent(row.currentPercent)} <i>→</i> {percent(row.afterPercent)}</span>
              </div>)}
              {model.companies.length > 5 && <button type="button" className="trade-exposure-more" onClick={() => setShowAll(value => !value)}>{showAll ? (englishMode ? 'Show less' : '收起') : (englishMode ? `All ${model.companies.length} securities` : `全部 ${model.companies.length} 个标的`)}</button>}
              {(model.current?.unexpandedAmount > 0 || model.after?.unexpandedAmount > 0) && <div className="trade-exposure-row"><strong>{englishMode ? 'Unidentified' : '未穿透部分'}</strong><span>{percent(model.current?.unexpandedPercent)} <i>→</i> {percent(model.after?.unexpandedPercent)}</span></div>}
              {(model.current?.leveragedAmount > 0 || model.after?.leveragedAmount > 0) && <div className="trade-exposure-row"><strong>{englishMode ? 'Leveraged ETFs' : '杠杆 ETF'}</strong><span>{percent(model.current?.leveragedPercent)} <i>→</i> {percent(model.after?.leveragedPercent)}</span></div>}
              {!currentHoldings && <p className="trade-exposure-note">{englishMode ? 'Current portfolio valuation unavailable' : '当前持仓估值暂不可用'}</p>}
              {!afterHoldings && <p className="trade-exposure-note">{preview.reason
                ? (englishMode ? 'Enter a valid trade to see the result.' : '填写有效交易后显示预计结果。')
                : (englishMode ? 'After-trade valuation unavailable' : '交易后估值暂不可用')}</p>}
              {model.partial && <p className="trade-exposure-note">{englishMode ? 'Identified holdings only' : '仅已识别部分'} · {englishMode ? 'Coverage' : '覆盖率'} {percent(model.current?.identifiedPercent)} → {percent(model.after?.identifiedPercent)}</p>}
              <p className="trade-exposure-note">{englishMode ? 'At current valuation · % of stock / ETF value · leveraged ETFs listed separately' : '按当前估值 · 占股票／ETF 市值 · 杠杆 ETF 单列'}</p>
              {sourceDates.length > 0 && <p className="trade-exposure-sources">{sourceDates.join(' · ')}</p>}
            </> : <p className="trade-exposure-note">{englishMode ? 'No holdings to compare' : '暂无可对比持仓'}</p>}
    </div>}
  </section>;
}
