import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, History } from 'lucide-react';
import ActionModalCard from './ActionModalCard.jsx';
import { MARKET_GREEN_HEX, MARKET_RED_HEX } from '../lib/marketColorMode.js';
import { formatTradeVixRatio } from '../lib/tradeVixRatioDisplay.js';
import './StockReportModal.css';
import './BuyTradeDisciplineModal.css';

const ZONES = {
  'panic-oversold': ['恐慌超卖', 'Panic oversold'],
  'extremely-oversold': ['极端超卖', 'Extremely oversold'],
  oversold: ['超卖', 'Oversold'],
  neutral: ['正常', 'Normal'],
  normal: ['正常', 'Normal'],
  overbought: ['超买', 'Overbought'],
  'strongly-overbought': ['强超买', 'Strongly overbought'],
};

function formatNumber(value, digits = 6) {
  return Number.isFinite(Number(value)) && value !== null && value !== ''
    ? Number(value).toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
}

function formatRsi(value) {
  if (!Number.isFinite(value)) return '—';
  // Avoid displaying an unmet value just above the boundary as exactly 20.
  if (value !== 20 && Number(value.toFixed(4)) === 20) return value > 20 ? '>20.0000' : '<20.0000';
  return value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 4 });
}

function DisciplineMetric({ label, metric, value, description, requirement, tone, englishMode }) {
  const ready = metric?.ready === true && Number.isFinite(metric?.value);
  const t = (zh, en) => englishMode ? en : zh;
  return <section className="buy-discipline-metric" aria-label={label}>
    <div className="buy-discipline-metric-heading">
      <span>{label}</span>
      <span className="buy-discipline-result" data-met={ready && metric.met}>
        <i aria-hidden="true" />
        {ready ? (metric.met ? t('已满足', 'Met') : t('未满足', 'Not met')) : t('待确认', 'Unavailable')}
      </span>
    </div>
    <div className="buy-discipline-metric-main">
      <strong title={ready ? String(metric.value) : undefined}>{ready ? value : '—'}</strong>
      <span className="buy-discipline-metric-state" data-tone={ready ? tone : undefined}>
        {ready ? description : t('暂无有效数据', 'No valid data')}
      </span>
    </div>
    <div className="buy-discipline-metric-foot">
      <span>{requirement}</span>
      <span>{ready && metric.asOf ? <>{t('收盘', 'Close')} · <time dateTime={metric.asOf}>{metric.asOf}</time></> : t('等待有效收盘数据', 'Awaiting valid closing data')}</span>
    </div>
  </section>;
}

export default function BuyTradeDisciplineModal({
  discipline, trade = {}, allocationWarning = null,
  submitting = false, onClose, onConfirm, englishMode = false,
}) {
  const t = (zh, en) => englishMode ? en : zh;
  const status = discipline?.status || 'unknown';
  const historical = status === 'historical' || status === 'not-applicable';
  const met = status === 'met';
  const rsi = discipline?.rsi;
  const vix = discipline?.vix;
  const Icon = historical ? History : met ? CheckCircle2 : status === 'unmet' ? AlertTriangle : AlertCircle;
  const title = historical ? t('确认记录这笔买入', 'Confirm this buy record')
    : met ? t('本次买入符合纪律', 'Buy conditions are met')
      : status === 'unmet' ? t('本次买入未满足纪律', 'Buy conditions are not met')
        : t('暂时无法判断买入条件', 'Buy conditions cannot be verified');
  const description = historical
    ? t('补录或修改交易不套用当前指标，保留原有交易校验。', 'Current indicators are not applied to historical or edited records. Existing trade validation still applies.')
    : met ? t('已满足其中一项买入条件。', 'At least one of your buy conditions is met.')
      : status === 'unmet' ? t('两项条件均未达到，建议重新考虑。', 'Neither condition is met. Consider reviewing this buy.')
        : t('部分指标缺少有效收盘数据，暂不能确认是否满足纪律。', 'Valid closing data is incomplete, so the conditions cannot be confirmed.');
  const confirmLabel = met || historical
    ? t('确认记录买入', 'Confirm buy record') : t('仍然记录买入', 'Record buy anyway');
  const rsiTone = rsi?.value <= 30 ? 'low' : rsi?.value >= 70 ? 'high' : 'neutral';
  const rsiDescription = ZONES[rsi?.zone]?.[englishMode ? 1 : 0] || t('正常', 'Normal');
  const close = () => { if (!submitting) onClose?.(); };

  return <ActionModalCard
    title={t('买入纪律确认', 'Buy discipline check')}
    closeLabel={t('返回买入窗口', 'Return to buy form')}
    onClose={close}
    widthClassName="w-[calc(100vw-32px)] max-w-[440px]"
    panelClassName="stock-report-modal buy-discipline-modal"
    overlayClassName="buy-discipline-overlay"
    panelStyle={{ '--buy-discipline-green': MARKET_GREEN_HEX, '--buy-discipline-red': MARKET_RED_HEX }}
    headerClassName="srm-header"
    titleClassName="srm-title"
    closeButtonClassName="srm-close"
    contentClassName="srm-content buy-discipline-content"
    actionClassName="srm-action buy-discipline-action"
    compactKeyboardSpacing
    footerContent={<p className="buy-discipline-save-note">{t('确认后保存到交易账本，更新持仓与盈亏。', 'Confirmation saves to your trade ledger and updates holdings and P&L.')}</p>}
    actions={[
      { key: 'cancel', label: t('返回调整', 'Review buy'), onClick: close, disabled: submitting, className: met || historical ? '' : 'srm-primary' },
      { key: 'confirm', label: submitting ? t('保存中…', 'Saving…') : confirmLabel, onClick: onConfirm, disabled: submitting, className: met || historical ? 'srm-primary' : '' },
    ]}
  >
    <div className="buy-discipline-status" data-state={historical ? 'historical' : status}>
      <span className="buy-discipline-icon"><Icon size={20} strokeWidth={1.7} aria-hidden="true" /></span>
      <div><h3>{title}</h3><p>{description}</p></div>
    </div>

    {!historical && <div className="buy-discipline-rule">
      <div>{t('根据你的交易纪律，满足以下任意一项：', 'Your discipline requires either condition:')}</div>
      <strong>RSI(6) ≤20 <span>{t('或', 'or')}</span> VIX / VIX3M &gt;1</strong>
    </div>}

    <div className="buy-discipline-trade">
      <span className="buy-discipline-symbol-mark" aria-hidden="true">{String(trade.symbol || '').slice(0, 2)}</span>
      <div className="buy-discipline-trade-info">
        <strong>{trade.symbol || '—'}</strong>
        <span>{trade.name ? `${trade.name} · ` : ''}{formatNumber(trade.shares)} {t('股', 'shares')} @ ${formatNumber(trade.price)}</span>
        {trade.date && <time dateTime={trade.date}>{trade.date}</time>}
      </div>
      <span className="buy-discipline-side">{t('买入', 'Buy')}</span>
    </div>

    {!historical && <div className="buy-discipline-metrics">
      <DisciplineMetric label={t('个股 RSI(6)', 'Stock RSI(6)')} metric={rsi} value={formatRsi(rsi?.value)}
        description={rsiDescription} requirement={t('买入条件 · 极端超卖 ≤20', 'Buy condition · RSI ≤20')}
        tone={rsiTone} englishMode={englishMode} />
      <DisciplineMetric label="VIX / VIX3M" metric={vix} value={formatTradeVixRatio(vix?.value)}
        description={vix?.value > 1 ? t('倒挂', 'Inverted') : vix?.value === 1 ? t('等于 1，未触发', 'At 1, not triggered') : t('尚未倒挂', 'Not inverted')}
        requirement={t('买入条件 · 比率 >1', 'Buy condition · Ratio >1')}
        tone={vix?.value > 1 ? 'high' : 'neutral'} englishMode={englishMode} />
    </div>}

    {allocationWarning && <div className="buy-discipline-allocation" role="note">
      <AlertTriangle size={17} strokeWidth={1.7} aria-hidden="true" />
      <div><strong>{t('仓位提醒', 'Allocation reminder')}</strong><p>{allocationWarning}</p></div>
    </div>}
  </ActionModalCard>;
}
