import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronDown, ChevronRight, Info, Layers, Minus, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import ActionModalCard from '../components/ActionModalCard.jsx';
import { formatInvestmentAmount } from '../components/InvestmentComparisonChart.jsx';
import { loadPortfolioOverlap, normalizePortfolioOverlapSymbols } from '../lib/portfolioOverlap.js';
import { buildPortfolioOverlapModel, holdingsFromPositions } from '../lib/portfolioOverlapModel.js';
import '../components/InvestmentComparison.css';
import '../components/PortfolioOverlap.css';

const MAX_CUSTOM_HOLDINGS = 40;
const SOURCE_COLORS = { direct: '#ff655e', QQQ: '#eebc65', SPY: '#4fd0a1' };
const percentage = value => Number.isFinite(value) ? `${value.toFixed(1)}%` : '—';
const disclosedWeight = value => Number.isFinite(value) ? `${value.toLocaleString('en-US', { maximumFractionDigits: 6 })}%` : '—';
const dollars = value => Number.isFinite(value) ? `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—';
const sourceColor = source => SOURCE_COLORS[source.kind === 'direct' ? 'direct' : source.symbol] || '#95a4c0';
const totalOf = holdings => holdings.every(row => Number.isFinite(row.amount)) ? holdings.reduce((sum, row) => sum + row.amount, 0) : null;
const draftOf = holdings => holdings.map(row => ({ symbol: row.symbol, amountText: Number.isFinite(row.amount) ? String(row.amount) : '' }));
const sourcesLabel = (count, englishMode) => englishMode ? `${count} holding ${count === 1 ? 'source' : 'sources'}` : `${count} 个持仓来源`;

function PortfolioOverlapSheet({ title, englishMode, onClose, children }) {
  const rootRef = React.useRef(null);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  React.useEffect(() => {
    const root = rootRef.current;
    const dialog = root?.querySelector('[role="dialog"]');
    if (!dialog) return undefined;
    const body = document.body;
    const alreadyLocked = body.classList.contains('po-overlap-modal-open');
    const trigger = document.activeElement;
    // A dedicated class leaves other dialogs' inline overflow locks untouched.
    body.classList.add('po-overlap-modal-open');
    dialog.setAttribute('tabindex', '-1');
    const isTopDialog = () => [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].at(-1) === dialog;
    const focusable = () => [...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(node => !node.hidden && node.getClientRects().length);
    const frame = window.requestAnimationFrame(() => (focusable()[0] || dialog).focus());
    const keydown = event => {
      if (!isTopDialog()) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current?.(); return; }
      if (event.key !== 'Tab') return;
      const targets = focusable(), first = targets[0], last = targets.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement) || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement) || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', keydown, true);
      const otherDialog = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(node => node !== dialog);
      if (!alreadyLocked) body.classList.remove('po-overlap-modal-open');
      if (!otherDialog && trigger?.isConnected) trigger.focus?.();
    };
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(<div ref={rootRef} className="investment-comparison po-modal-root"><ActionModalCard title={title} closeLabel={englishMode ? 'Close dialog' : '关闭弹窗'} onClose={onClose} widthClassName="" panelClassName="po-modal-panel" overlayClassName="po-modal-overlay" titleClassName="po-modal-title" closeButtonClassName="po-modal-close" contentClassName="po-modal-content">{children}</ActionModalCard></div>, document.body);
}

function Methodology({ englishMode }) {
  return <>
    <p className="po-method-copy">{englishMode ? 'Verified stocks are counted directly. Supported unleveraged ETFs are split using their disclosed holdings weights. Identified exposure equals direct holdings plus holdings through each ETF, grouped by security ticker. Different share classes are not automatically merged into one company.' : '已核验的股票直接计入；支持穿透的普通 ETF 按披露成分权重分配。已识别持有＝直接持有＋各 ETF 间接持有，按证券代码归集，不自动合并同一公司的不同股权类别。'}</p>
    <p className="po-method-copy">{englishMode ? 'Every percentage uses the entire portfolio market value, including unexpanded holdings and separately listed leveraged ETFs. Missing quotes make the total and all percentages unavailable. The top-five total is a lower bound for the identified portion; unknown holdings may change the final concentration and ranking.' : '全部占比统一以组合总市值为分母，包含未穿透部分与单列的杠杆 ETF。存在缺失报价时，总额和全部比例暂不计算。前五合计是已识别部分的下限；未知持仓可能改变最终集中度和排序。'}</p>
    <p className="po-method-copy">{englishMode ? 'QQQ and SPY are supported for fund look-through in this release. Other funds without verified constituents remain unexpanded. Leveraged ETFs are listed by invested market value, without multiplying by three or reusing an ordinary ETF basket. Each source shows its disclosure date; stale disclosures are labelled.' : '首版支持 QQQ、SPY 成分穿透；其他未获得可靠成分的基金保持未穿透。杠杆 ETF 仅按持仓市值单列，不直接乘以三倍，也不套用普通 ETF 的成分。各来源分别显示披露日期，较旧披露会明确标记。'}</p>
    <p className="po-sheet-note">{englishMode ? 'My holdings follows the current account and its available market valuations. Custom portfolios stay in this page’s memory only. This tool never saves a trade, changes a position, or writes to an account ledger.' : '我的持仓跟随当前账户及可用市值；自定义组合只保留在本页内存中。此工具不保存交易、不修改持仓、不写入账户账本。'}</p>
  </>;
}

function InstrumentStatus({ position, englishMode }) {
  const item = position.metadata;
  if (!item) return <span>{englishMode ? 'Metadata pending' : '元数据待读取'}</span>;
  const label = position.kind === 'leveraged_etf' ? (englishMode ? 'Leveraged ETF · separate' : '杠杆 ETF · 单列')
    : position.kind === 'stock' ? (englishMode ? 'Verified stock' : '已核验股票')
      : position.kind === 'plain_etf' && ['available', 'partial'].includes(item.holdingsStatus) ? (englishMode ? `Disclosed basket ${percentage(item.coveragePct)}` : `披露成分 ${percentage(item.coveragePct)}`)
        : (englishMode ? 'Not expanded · metadata unavailable or unsupported' : '未穿透 · 元数据不可用或暂不支持');
  return <span>{label}{item.stale ? (englishMode ? ' · Stale or unavailable' : ' · 数据较旧或不可用') : ''}</span>;
}

function PositionList({ model, holdings, metadataReady, englishMode, onEdit }) {
  const positions = model?.positions || holdings;
  return <>
    {positions.length ? positions.map((position, index) => <div key={`${position.symbol}:${index}`} className="po-position-row"><div><strong>{position.symbol}</strong><small>{position.name || position.symbol}</small><small>{metadataReady ? <InstrumentStatus position={position} englishMode={englishMode} /> : (englishMode ? 'Metadata not ready' : '元数据尚未就绪')}</small></div><div><strong>{position.amount === null ? (englishMode ? 'Quote missing' : '暂无报价') : dollars(position.amount)}</strong><small>{percentage(position.percent)}</small></div></div>) : <p className="po-method-copy">{englishMode ? 'There are no active holdings to display.' : '当前没有可展示的持仓。'}</p>}
    <p className="po-sheet-note">{englishMode ? 'Amounts come from the current account’s active holdings. Missing quotes are left blank when copied, not replaced with cost or zero.' : '金额来自当前账户的有效持仓。缺失报价复制后保持空白，不使用成本或零替代。'}</p>
    <button type="button" className="po-primary" onClick={onEdit}>{englishMode ? 'Copy into a custom calculation' : '复制到自定义组合试算'}</button>
  </>;
}

function CompanyDetail({ company, model, englishMode, onEdit }) {
  return <>
    <div className="po-detail-summary"><strong>{percentage(company.percent)}</strong><span>{englishMode ? 'Of the whole portfolio · identified' : '占组合总额 · 已识别'}</span></div>
    <p className="po-detail-value">{company.name} · {dollars(company.amount)}</p>
    {company.sources.map(source => {
      const position = model.positions.find(row => row.symbol === source.symbol);
      const metadata = position?.metadata;
      return <section className="po-detail-source" key={`${source.kind}:${source.symbol}`}><div className="po-detail-source-head"><strong><i className="po-dot" style={{ '--po-source': sourceColor(source) }} />{source.kind === 'direct' ? (englishMode ? 'Direct holding' : '直接持有') : `${englishMode ? 'Via ' : '来自 '}${source.symbol}`}</strong><span>{percentage(source.percent)}</span></div>
        <p>{source.kind === 'direct' ? `${source.symbol} ${englishMode ? 'holding' : '持仓'}` : `${dollars(position?.amount)} × ${englishMode ? 'disclosed weight ' : '披露权重 '}${disclosedWeight(source.weightPct)}`} → {dollars(source.amount)}</p>
        <div className="po-stack-track" aria-hidden="true"><span className="po-stack-part" style={{ '--po-source': sourceColor(source), width: `${company.amount > 0 ? source.amount / company.amount * 100 : 0}%` }} /></div>
        <p>{source.kind === 'direct' ? (englishMode ? 'Instrument identity verified' : '证券类型已核验') : `${englishMode ? 'Disclosure date: ' : '成分披露日：'}${source.asOfDate || '—'}`}{metadata?.stale ? (englishMode ? ' · Stale source' : ' · 来源较旧') : ''}</p>
        {source.source?.url && <a className="po-source-link" href={source.source.url} target="_blank" rel="noopener noreferrer">{source.source.provider} · {englishMode ? 'View source' : '查看来源'} ↗</a>}
      </section>;
    })}
    <div className="po-detail-total"><span>{englishMode ? 'Total identified exposure' : '已识别持有合计'}</span><strong>{dollars(company.amount)}</strong></div>
    <p className="po-sheet-note">{englishMode ? 'These are not additional invested dollars. Indirect ETF holdings are attributed back to the same security ticker. This is a look-through calculation, not a trade or a forecast.' : '这不是额外投入的钱，而是把 ETF 内的间接持有归集到同一证券代码。这是持仓穿透计算，不是交易或预测。'}</p>
    <button type="button" className="po-primary" onClick={onEdit}>{englishMode ? 'Try changing the portfolio' : '调整组合，看看占比怎么变'}</button>
  </>;
}

function PortfolioEditor({ draft, setDraft, englishMode, currentHoldings, onSubmit }) {
  const [error, setError] = React.useState('');
  const numeric = draft.map(row => row.amountText.trim() === '' ? null : Number(row.amountText));
  const total = numeric.every(value => Number.isFinite(value) && value >= 0 && value <= 1e9) ? numeric.reduce((sum, value) => sum + value, 0) : null;
  const edit = (index, field, value) => { setError(''); setDraft(previous => previous.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row)); };
  const submit = event => {
    event.preventDefault();
    let symbolsValid = true;
    try { normalizePortfolioOverlapSymbols(draft.map(row => row.symbol)); } catch { symbolsValid = false; }
    const invalid = !symbolsValid || draft.length > MAX_CUSTOM_HOLDINGS || draft.some((row, index) => !Number.isFinite(numeric[index]) || numeric[index] < 0 || numeric[index] > 1e9);
    if (invalid) { setError(englishMode ? 'Enter a valid US symbol and an amount from 0 to $1 billion for every row. Missing amounts must be filled in.' : '每项请输入有效美股代码及 0 至 10 亿美元金额；缺失金额需要自行补充。'); return; }
    onSubmit(draft.map((row, index) => ({ symbol: row.symbol.trim().toUpperCase(), amount: numeric[index] })));
  };
  return <form onSubmit={submit} noValidate>
    <p className="po-edit-description">{englishMode ? 'Only this calculation changes. Nothing is saved to your actual account.' : '只修改本次试算，不保存到真实账户。'}</p>
    {draft.length === 0 && <p className="po-method-copy">{englishMode ? 'Add a stock or ETF to start your own calculation.' : '添加股票或 ETF，开始自定义试算。'}</p>}
    {draft.map((row, index) => <div className="po-edit-row" key={index}><label>{englishMode ? 'Symbol' : '标的'}<input value={row.symbol} onChange={event => edit(index, 'symbol', event.target.value.toUpperCase())} aria-label={englishMode ? `Symbol ${index + 1}` : `第 ${index + 1} 项标的`} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={15} /></label><label>{englishMode ? 'Trial value · USD' : '模拟持仓金额 · USD'}<input type="number" inputMode="decimal" min="0" max="1000000000" step="any" value={row.amountText} onChange={event => edit(index, 'amountText', event.target.value)} aria-label={englishMode ? `Amount ${index + 1}` : `第 ${index + 1} 项金额`} /></label><button type="button" className="po-icon-button" aria-label={englishMode ? `Remove holding ${index + 1}` : `删除第 ${index + 1} 项`} onClick={() => { setDraft(previous => previous.filter((_, rowIndex) => rowIndex !== index)); setError(''); }}><Minus size={16} aria-hidden="true" /></button></div>)}
    <div className="po-edit-actions"><button type="button" className="po-text-button" disabled={draft.length >= MAX_CUSTOM_HOLDINGS} onClick={() => setDraft(previous => [...previous, { symbol: '', amountText: '' }])}><Plus size={14} aria-hidden="true" /> {englishMode ? 'Add holding' : '添加标的'}</button><button type="button" className="po-text-button" onClick={() => { setDraft(draftOf(currentHoldings)); setError(''); }}>{englishMode ? 'Copy my current holdings' : '重新复制当前持仓'}</button></div>
    <div className="po-edit-total"><span>{englishMode ? 'Custom portfolio total' : '模拟组合总额'}</span><strong>{dollars(total)}</strong></div>
    {error && <p className="po-form-error" role="alert">{error}</p>}
    <button type="submit" className="po-primary">{englishMode ? 'View overlap analysis' : '查看体检结果'}</button>
  </form>;
}

function PortfolioAnalysis({ model, englishMode, expanded, setExpanded, onCompany }) {
  const top = model.companies[0];
  const ceiling = Math.max(5, Math.ceil((top?.percent || 0) / 5) * 5);
  const etfSymbols = [...new Set(model.companies.flatMap(company => company.sources.filter(source => source.kind === 'etf').map(source => source.symbol)))];
  const coverage = [
    [englishMode ? 'Identified securities' : '已识别标的', model.identifiedPercent, model.identifiedAmount, 'var(--po-green)'],
    [englishMode ? 'Unexpanded / unknown holdings' : '未穿透 / 未识别部分', model.unexpandedPercent, model.unexpandedAmount, 'var(--po-unknown)'],
    [englishMode ? 'Leveraged ETFs · separate' : '杠杆 ETF 单列', model.leveragedPercent, model.leveragedAmount, 'var(--po-gold)'],
  ];
  const incomplete = model.positions.some(position => position.metadata.stale || position.kind === 'unknown' || position.metadata.holdingsStatus === 'unavailable');
  return <>
    {!model.valuationComplete && <div className="po-state po-warning" role="status"><p>{englishMode ? 'Quotes are missing. Portfolio total, concentration and all percentages are unavailable; no missing amount is treated as zero.' : '部分持仓暂无报价，总额、集中度及全部比例暂不计算；缺失金额没有按零处理。'}</p><p>{model.missingValuationSymbols.join(' · ')}</p></div>}
    {incomplete && <p className="po-note"><Info size={14} aria-hidden="true" />{englishMode ? 'Some sources are stale or unavailable. Only identified holdings are included below.' : '部分来源较旧或不可用，以下仅展示已识别部分。'}</p>}
    {top && model.valuationComplete ? <section className="po-hero"><button type="button" className="po-hero-main" onClick={() => onCompany(top.symbol)} aria-label={englishMode ? `View largest identified security ${top.symbol}` : `查看最大已识别标的 ${top.symbol}`}><div className="po-hero-top"><span className="po-eyebrow">{englishMode ? 'Largest identified security' : '已识别标的中，占比最高'}</span><span className="po-source-tag">{sourcesLabel(top.sources.length, englishMode)}</span></div><div className="po-hero-value"><strong>{percentage(top.percent)}</strong><span>{top.symbol}</span></div><div className="po-hero-equation"><span><i className="po-dot" style={{ '--po-source': SOURCE_COLORS.direct }} />{englishMode ? 'Direct ' : '直接 '}<b>{percentage(top.directAmount / model.total * 100)}</b></span><span>＋</span><span>{englishMode ? 'Via ETFs ' : 'ETF 间接 '}<b>{percentage(top.indirectAmount / model.total * 100)}</b></span></div></button><div className="po-hero-footer"><div><small>{englishMode ? 'Top five · at least' : '前五大标的 · 至少'}</small><strong>{percentage(model.topFivePercent)}</strong></div><div><small>{englishMode ? 'Multiple-source overlap' : '多来源重叠标的'}</small><strong>{model.overlappingCompaniesCount}<em>{englishMode ? 'identified' : '个已识别'}</em></strong></div></div></section> : model.valuationComplete && <section className="po-hero po-empty"><h2>{model.total === 0 ? (englishMode ? 'No positive holding amount yet' : '暂无有效持仓金额') : (englishMode ? 'No identified securities yet' : '暂无可识别标的')}</h2><p>{model.total === 0 ? (englishMode ? 'Add a holding amount in a custom portfolio to calculate overlap.' : '可在自定义组合中添加金额后试算。') : (englishMode ? 'Unknown and leveraged holdings remain separately listed, not treated as zero.' : '未识别及杠杆持仓仍单独列示，没有按零处理。')}</p></section>}
    {model.companies.length > 0 && <><div className="po-section-head"><h2>{englishMode ? 'Where the money is invested' : '钱最终投向谁'}</h2><span>{model.valuationComplete ? (englishMode ? 'Identified weight ↓' : '已识别标的占比 ↓') : (englishMode ? 'Known amounts only' : '仅已知金额')}</span></div><div className="po-legend"><span><i className="po-dot" style={{ '--po-source': SOURCE_COLORS.direct }} />{englishMode ? 'Direct holdings' : '直接持有'}</span>{etfSymbols.map(symbol => <span key={symbol}><i className="po-dot" style={{ '--po-source': sourceColor({ kind: 'etf', symbol }) }} />{englishMode ? 'Via ' : '来自 '}{symbol}</span>)}</div>
      {model.companies.slice(0, expanded ? undefined : 6).map((company, index) => <button type="button" className="po-company-row" key={company.symbol} onClick={() => onCompany(company.symbol)} aria-label={englishMode ? `View ${company.symbol} holding sources` : `查看 ${company.symbol} 持仓来源`}><div className="po-company-line"><span className="po-rank">{String(index + 1).padStart(2, '0')}</span><div className="po-company-name"><strong>{company.symbol}</strong><small>{company.name}</small></div><div className="po-company-number"><strong>{model.valuationComplete ? percentage(company.percent) : dollars(company.amount)}</strong><small>{company.sources.length > 1 ? (englishMode ? `${company.sources.length} overlapping sources` : `${company.sources.length} 个来源重叠`) : sourcesLabel(1, englishMode)}</small></div><ChevronRight size={13} aria-hidden="true" /></div>{model.valuationComplete && <div className="po-stack-track" aria-hidden="true">{company.sources.map(source => <span key={`${source.kind}:${source.symbol}`} className="po-stack-part" style={{ '--po-source': sourceColor(source), width: `${source.percent / ceiling * 100}%` }} />)}</div>}</button>)}
      {model.companies.length > 6 && <button type="button" className="po-more-button" onClick={() => setExpanded(!expanded)}>{expanded ? (englishMode ? 'Collapse securities' : '收起标的列表') : (englishMode ? `Show all ${model.companies.length} securities` : `展开全部 ${model.companies.length} 个标的`)}</button>}
    </>}
    <details className="po-coverage"><summary>{englishMode ? 'How much does this analysis cover?' : '这份体检覆盖了多少'}<span>{englishMode ? 'Identified ' : '已识别 '}{percentage(model.identifiedPercent)}<ChevronDown size={14} aria-hidden="true" /></span></summary>
      {model.valuationComplete && model.total > 0 && <div className="po-coverage-bar" aria-hidden="true">{coverage.map(([label, value, , color]) => <span key={label} style={{ '--po-source': color, '--po-width': `${value}%` }} />)}</div>}
      {coverage.map(([label, value, amount, color]) => <div className="po-coverage-line" key={label}><span><i className="po-dot" style={{ '--po-source': color }} />{label}</span><strong>{percentage(value)} · {formatInvestmentAmount(amount, englishMode)}</strong></div>)}
      {!model.valuationComplete && <p className="po-method-copy">{englishMode ? 'The amounts above cover quoted holdings only. The unpriced portion is additional and cannot yet be measured.' : '上面的金额仅覆盖已有报价的持仓；无报价部分另缺，尚不能衡量。'}</p>}
      {model.positions.map(position => <div className="po-position-row" key={position.symbol}><div><strong>{position.symbol}</strong><small><InstrumentStatus position={position} englishMode={englishMode} /></small>{position.metadata.asOfDate && <small>{englishMode ? 'Disclosure ' : '披露 '}{position.metadata.asOfDate}</small>}{position.metadata.source?.url && <a className="po-source-link" href={position.metadata.source.url} target="_blank" rel="noopener noreferrer">{position.metadata.source.provider} ↗</a>}</div><div><strong>{dollars(position.amount)}</strong><small>{percentage(position.percent)}</small></div></div>)}
      <p className="po-method-copy">{englishMode ? 'All percentages use the whole portfolio as the denominator. Unexpanded holdings are not treated as zero. Identified security weights and the top-five total only describe the identified portion.' : '占比统一以组合总金额为分母。未穿透部分没有当作零；标的占比和前五合计仅表示已识别部分。'}</p>
    </details>
  </>;
}

function PortfolioOverlapContent({ ctx, previewSource }) {
  const userId = typeof ctx.userId === 'string' ? ctx.userId : '';
  const englishMode = ctx.language === 'en';
  const loadSource = import.meta.env.DEV && previewSource?.load ? previewSource.load : loadPortfolioOverlap;
  const [mode, setMode] = React.useState('holdings');
  const [custom, setCustom] = React.useState(null);
  const [draft, setDraft] = React.useState([]);
  const [sheet, setSheet] = React.useState(null);
  const [expanded, setExpanded] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState('');
  const [refreshVersion, setRefreshVersion] = React.useState(0);
  const [state, setState] = React.useState({ key: '', status: 'idle', response: null });
  const requestRef = React.useRef(0);
  const refreshTargetRef = React.useRef(null);
  const own = React.useMemo(() => {
    // A hydration boundary must also prevent copying a prior account's
    // temporarily retained summary into a new custom portfolio.
    if (!userId || ctx.portfolioReady !== true || ctx.portfolioError) return { holdings: [], error: false };
    try { return { holdings: holdingsFromPositions(ctx.investmentSummary?.activePositions), error: false }; }
    catch { return { holdings: [], error: true }; }
  }, [ctx.investmentSummary?.activePositions, ctx.portfolioReady, ctx.portfolioError, userId]);
  const portfolioPending = mode === 'holdings' && ctx.portfolioReady !== true;
  const portfolioFailed = mode === 'holdings' && Boolean(ctx.portfolioError || (ctx.portfolioReady === true && own.error));
  const holdings = mode === 'custom' ? (custom || []) : own.holdings;
  const symbolsKey = [...new Set(holdings.map(row => row.symbol))].sort().join(',');
  const baseKey = `${userId}:${symbolsKey}`;
  const requestKey = `${baseKey}:${refreshVersion}`;
  const canLoad = Boolean(userId && symbolsKey && !portfolioPending && !portfolioFailed);
  React.useEffect(() => {
    const requestId = ++requestRef.current;
    const controller = new AbortController();
    if (!canLoad) return () => { requestRef.current += 1; controller.abort(); };
    const force = refreshTargetRef.current === baseKey;
    if (force) refreshTargetRef.current = null;
    setState({ key: requestKey, status: 'loading', response: null });
    Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      return loadSource({ userId, symbols: symbolsKey.split(','), force, signal: controller.signal });
    }).then(response => {
      if (requestRef.current !== requestId || controller.signal.aborted) return;
      if (response?.version !== 1 || !Array.isArray(response.instruments)) throw new Error('Invalid holdings metadata');
      setState({ key: requestKey, status: 'ready', response });
    }).catch(() => {
      if (requestRef.current !== requestId || controller.signal.aborted) return;
      setState({ key: requestKey, status: 'error', response: null });
    });
    return () => { requestRef.current += 1; controller.abort(); };
  }, [baseKey, canLoad, loadSource, requestKey, symbolsKey, userId]);
  const scoped = state.key === requestKey ? state : { status: 'loading', response: null };
  const metadataReady = scoped.status === 'ready';
  const result = React.useMemo(() => {
    try { return { model: buildPortfolioOverlapModel({ holdings, instruments: metadataReady ? scoped.response.instruments : [] }), error: false }; }
    catch { return { model: null, error: true }; }
  }, [holdings, metadataReady, scoped.response]);
  const model = result.model;
  const knownTotal = totalOf(holdings);
  const selectedCompany = sheet?.kind === 'company' && model?.companies.find(company => company.symbol === sheet.symbol);
  const refresh = () => { refreshTargetRef.current = baseKey; setRefreshVersion(version => version + 1); };
  const openEditor = () => { setDraft(draftOf(mode === 'custom' && custom !== null ? custom : own.holdings)); setSheet({ kind: 'edit' }); };
  const selectMode = next => {
    setExpanded(false);
    if (next === 'custom' && custom === null) { setCustom(own.holdings.map(row => ({ ...row }))); setDraft(draftOf(own.holdings)); setSheet({ kind: 'edit' }); }
    setMode(next);
  };
  const tabKey = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'holdings' : event.key === 'End' ? 'custom' : mode === 'holdings' ? 'custom' : 'holdings';
    selectMode(next);
    event.currentTarget.parentElement.querySelector(`[data-mode="${next}"]`)?.focus();
  };
  const closeSheet = () => setSheet(null);
  const analysisAvailable = !portfolioPending && !portfolioFailed && metadataReady && !result.error && model;
  const sheetTitle = sheet?.kind === 'edit' ? (englishMode ? 'Custom portfolio' : '自定义组合') : sheet?.kind === 'method' ? (englishMode ? 'How this analysis works' : '这份体检如何计算') : sheet?.kind === 'positions' ? (englishMode ? 'My holdings' : '我的持仓') : selectedCompany ? `${selectedCompany.symbol} · ${englishMode ? 'Holding sources' : '持仓来自哪里'}` : '';
  return <div className="investment-comparison ic-page po-page">
    <header className="po-header"><button type="button" className="po-icon-button po-back" onClick={ctx.closePortfolioOverlap} aria-label={englishMode ? 'Back to Trades' : '返回交易'}><ArrowLeft size={21} aria-hidden="true" /></button><div><h1>{englishMode ? 'Portfolio overlap' : '持仓重叠体检'}</h1><p>{englishMode ? 'Look through holdings to their underlying investments' : '看穿持仓，钱最终投向了哪里'}</p></div><button type="button" className="po-icon-button po-method-button" onClick={() => setSheet({ kind: 'method' })} aria-label={englishMode ? 'View calculation methodology' : '查看计算说明'}><Info size={16} aria-hidden="true" /></button></header>
    <div className="po-tabs" role="tablist" aria-label={englishMode ? 'Portfolio source' : '组合来源'}>{[['holdings', englishMode ? 'My holdings' : '我的持仓'], ['custom', englishMode ? 'Custom portfolio' : '自定义组合']].map(([value, label]) => <button type="button" role="tab" data-mode={value} key={value} id={`po-tab-${value}`} aria-controls="po-analysis" aria-selected={mode === value} tabIndex={mode === value ? 0 : -1} onClick={() => selectMode(value)} onKeyDown={tabKey}>{label}</button>)}</div>
    {mode === 'custom' && <p className="po-note"><ShieldCheck size={14} aria-hidden="true" />{englishMode ? 'In-memory calculation · does not change your actual holdings' : '内存试算 · 不改变真实持仓'}</p>}
    <section id="po-analysis" role="tabpanel" aria-labelledby={`po-tab-${mode}`}>
      <button type="button" className="po-portfolio-button" disabled={mode === 'holdings' && (!userId || portfolioPending || portfolioFailed)} onClick={mode === 'holdings' ? () => setSheet({ kind: 'positions' }) : openEditor}><span className="po-portfolio-icon"><Layers size={20} aria-hidden="true" /></span><span className="po-portfolio-copy"><strong>{mode === 'holdings' ? (englishMode ? 'Current account holdings' : '当前账户持仓') : (englishMode ? 'My trial portfolio' : '我的试算组合')}</strong><small>{!userId ? (englishMode ? 'Sign in required' : '请先登录') : portfolioFailed ? (englishMode ? 'Holdings unavailable' : '持仓读取不可用') : portfolioPending ? (englishMode ? 'Loading holdings…' : '正在读取持仓…') : `${holdings.length} ${englishMode ? 'holdings' : '只标的'} · ${knownTotal === null ? (englishMode ? 'Valuation incomplete' : '金额不完整') : dollars(knownTotal)} / ${mode === 'holdings' ? (englishMode ? 'View holdings' : '查看组成') : (englishMode ? 'Edit trial amounts' : '调整金额')}`}</small></span><ChevronRight size={16} aria-hidden="true" /></button>
      {!userId ? <div className="po-state" role="status">{englishMode ? 'Sign in to read your holdings securely.' : '请登录后安全读取当前账户持仓。'}</div>
        : portfolioFailed ? <div className="po-state po-warning" role="alert">{englishMode ? 'Holdings could not be read. Return to the trading page and retry; no holdings have been assumed.' : '持仓暂时读取失败，请返回交易页重试；没有将持仓按空或零处理。'}</div>
          : portfolioPending ? <div className="po-state" role="status">{englishMode ? 'Loading the current account’s holdings…' : '正在读取当前账户持仓…'}</div>
            : holdings.length === 0 ? <section className="po-hero po-empty"><h2>{englishMode ? 'No holdings in this portfolio' : '当前组合没有持仓'}</h2><p>{englishMode ? 'No example investments have been added. You can create an independent custom calculation.' : '没有加入示例持仓。你可以另建自定义组合进行独立试算。'}</p><button type="button" className="po-text-button" onClick={openEditor}>{englishMode ? 'Create a custom portfolio' : '创建自定义组合'}</button></section>
              : scoped.status === 'error' ? <div className="po-state po-warning" role="alert"><p>{englishMode ? 'Holding metadata could not be loaded. No overlap percentages have been estimated.' : '持仓元数据读取失败，暂不估算重叠比例。'}</p><button type="button" className="po-text-button" onClick={refresh}>{englishMode ? 'Retry' : '重试'}</button></div>
                : !metadataReady ? <div className="po-state" role="status">{englishMode ? 'Reading verified security identities and disclosed ETF holdings…' : '正在读取已核验证券类型与 ETF 披露成分…'}</div>
                  : result.error ? <div className="po-state po-warning" role="alert">{englishMode ? 'These holdings could not be analysed safely. Check the holding amounts and retry.' : '这些持仓暂时无法安全计算，请检查金额后重试。'}</div>
                    : <PortfolioAnalysis model={model} englishMode={englishMode} expanded={expanded} setExpanded={setExpanded} onCompany={symbol => setSheet({ kind: 'company', symbol })} />}
      {canLoad && <div className="po-refresh-row"><span>{metadataReady && typeof scoped.response.fetchedAt === 'string' ? `${englishMode ? 'Metadata retrieved ' : '元数据读取于 '}${scoped.response.fetchedAt.slice(0, 10)}` : ''}</span><button type="button" onClick={refresh} disabled={scoped.status === 'loading'} aria-label={englishMode ? 'Refresh holdings metadata' : '刷新持仓元数据'}><RefreshCw size={13} aria-hidden="true" />{englishMode ? 'Refresh data' : '刷新数据'}</button></div>}
      <p className="po-footnote">{englishMode ? 'Read-only analysis · security-ticker grouping · disclosure dates vary' : '只读分析 · 按证券代码归集 · 各来源披露日期可能不同'}</p>
    </section>
    {sheet && (sheet.kind !== 'company' || (analysisAvailable && selectedCompany)) && <PortfolioOverlapSheet title={sheetTitle} englishMode={englishMode} onClose={closeSheet}>
      {sheet.kind === 'method' ? <Methodology englishMode={englishMode} /> : sheet.kind === 'positions' ? <PositionList model={model} holdings={holdings} metadataReady={metadataReady} englishMode={englishMode} onEdit={openEditor} /> : sheet.kind === 'company' ? <CompanyDetail company={selectedCompany} model={model} englishMode={englishMode} onEdit={openEditor} /> : <PortfolioEditor draft={draft} setDraft={setDraft} englishMode={englishMode} currentHoldings={own.holdings} onSubmit={next => { setCustom(next); setMode('custom'); setExpanded(false); closeSheet(); setAnnouncement(englishMode ? 'Custom calculation updated. Your actual account has not changed.' : '试算组合已更新，真实账户未改动。'); }} />}
    </PortfolioOverlapSheet>}
    <div className="po-sr-only" aria-live="polite">{announcement}</div>
  </div>;
}

export default function PortfolioOverlapPage({ ctx = {}, previewSource }) {
  // Remount all drafts, dialogs and request state before another user's render.
  return <PortfolioOverlapContent key={ctx.userId || 'no-user'} ctx={ctx} previewSource={previewSource} />;
}
