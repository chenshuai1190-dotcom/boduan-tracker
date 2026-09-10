import React from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import StockLogo, { stockLogoCandidates } from './StockLogo.jsx';
import { splitCurrencyAmount } from '../lib/amountDisplay.js';
import './TqqqTradeEntryPanel.css';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const INPUT_CLASS = 'tqqq-entry-input';
const LABEL_CLASS = 'tqqq-entry-label';

const TQQQ_NEUTRAL_ACTION_TONE_CLASSES = Object.freeze({
  selected: 'tqqq-entry-side-selected',
  confirm: 'tqqq-entry-confirm',
});

export const TQQQ_ACTION_TONE_CLASSES = Object.freeze({
  buy: TQQQ_NEUTRAL_ACTION_TONE_CLASSES,
  sell: TQQQ_NEUTRAL_ACTION_TONE_CLASSES,
});

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || value === '') return '--';
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(digits)}%` : '--';
}

function formatShares(value) {
  const number = Math.max(0, numberValue(value));
  return number.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function Metric({ label, value, valueClassName = '', className = '' }) {
  return (
    <div className={`tqqq-entry-metric ${className}`}>
      <div className="tqqq-entry-metric-label">
        {label}
      </div>
      <div className={`tqqq-entry-metric-value ${valueClassName}`} style={{ fontFamily: NUMBER_FONT }}>
        {value}
      </div>
    </div>
  );
}

function PreviewResult({ preview, tt }) {
  if (!preview.inputReady) {
    return <span className="text-white/[0.38]">{tt('trades.tqqq.waitingForInput', '等待输入价格与股数')}</span>;
  }
  if (preview.blockReason === 'allocation-unavailable') {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-300">
        <AlertCircle className="h-3.5 w-3.5" />
        {tt('trades.tqqq.allocationUnavailable', '仓位数据暂不可用')}
      </span>
    );
  }
  if (preview.blockReason === 'allocation-limit') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[#ff6570]">
        <AlertCircle className="h-3.5 w-3.5" />
        {tt('trades.tqqq.exceedsLimit', '买入后将超过10%仓位提醒线')}
      </span>
    );
  }
  if (preview.blockReason === 'oversell') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[#ff6570]">
        <AlertCircle className="h-3.5 w-3.5" />
        {tt('trades.tqqq.exceedsAvailableShares', '超过当前可卖股数')}
      </span>
    );
  }
  if (preview.blockReason === 'ledger-oversell') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[#ff6570]">
        <AlertCircle className="h-3.5 w-3.5" />
        {tt('trades.tqqq.breaksLedger', '本次修改会导致后续卖出超出可卖股数')}
      </span>
    );
  }
  if (preview.blockReason === 'whole-shares-required') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[#ff6570]">
        <AlertCircle className="h-3.5 w-3.5" />
        {tt('trades.tqqq.wholeSharesRequired', 'TQQQ正式交易只支持整数股')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-emerald-300">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {preview.side === 'sell'
        ? tt('trades.tqqq.sellReducesRisk', '可卖股数充足,卖出降低仓位风险')
        : tt('trades.tqqq.withinLimit', '处于10%仓位提醒线内')}
    </span>
  );
}

function MarketReference({ marketReference, tt }) {
  return (
    <section className="tqqq-entry-section tqqq-entry-market" aria-labelledby="tqqq-market-reference-title">
      <div className="tqqq-entry-section-heading">
        <h3 id="tqqq-market-reference-title" className="tqqq-entry-section-title">
          {tt('trades.tqqq.marketReference', '市场参考')}
        </h3>
        <span className="tqqq-entry-note">{tt('trades.tqqq.objectiveOnly', '仅展示客观指标,不定义综合市场状态')}</span>
      </div>

      <div className="tqqq-entry-market-grid">
        <div className="tqqq-entry-market-metric">
          <div className="tqqq-entry-metric-label">VIX</div>
          <div className="tqqq-entry-market-value" style={{ fontFamily: NUMBER_FONT }}>
            {marketReference.vixReady ? marketReference.vixValue.toFixed(1) : '--'}
          </div>
          <div className="tqqq-entry-note">
            {marketReference.vixReady
              ? tt('trades.tqqq.dataAsOf', '数据 {{date}}', { date: marketReference.vixDataDate })
              : tt('trades.tqqq.dataUnavailable', '数据暂不可用')}
          </div>
        </div>
        <div className="tqqq-entry-market-metric">
          <div className="tqqq-entry-metric-label">{tt('trades.tqqq.qqqFromHigh', 'QQQ 距52周高点')}</div>
          <div className="tqqq-entry-market-value" style={{ fontFamily: NUMBER_FONT }}>
            {formatPercent(marketReference.qqqDistanceFromHigh, 1)}
          </div>
          <div className="tqqq-entry-note">
            {marketReference.qqqReady ? tt('trades.tqqq.objectivePosition', '客观位置参考') : tt('trades.tqqq.dataUnavailable', '数据暂不可用')}
          </div>
        </div>
      </div>

    </section>
  );
}

export default function TqqqTradeEntryPanel({
  draft,
  onDraftChange,
  preview,
  marketReference,
  logoCache,
  cacheStockLogo,
  tt,
}) {
  const side = draft?.side === 'sell' ? 'sell' : 'buy';
  const logoUrls = stockLogoCandidates('TQQQ', logoCache?.TQQQ?.url);
  const displayedBudgetUsage = Number.isFinite(preview.afterBudgetUsage)
    ? preview.afterBudgetUsage
    : preview.currentBudgetUsage;
  const displayedBudgetReady = Number.isFinite(displayedBudgetUsage);
  const displayedBudgetPct = displayedBudgetReady
    ? Math.min(100, Math.max(0, displayedBudgetUsage * 100))
    : 0;
  const displayedBudgetLabel = displayedBudgetReady
    ? `${Math.round(displayedBudgetUsage * 100)}%`
    : '--';
  const currentBudgetPct = Number.isFinite(preview.currentBudgetUsage)
    ? Math.max(0, preview.currentBudgetUsage * 100)
    : null;
  const amountParts = splitCurrencyAmount(preview.amountUsd, 'USD', 2);
  const remainingCapacityTone = preview.overLimit
    ? 'text-[#ff6570]'
    : (preview.allocationUnavailable ? 'text-[#f6b54b]' : 'text-emerald-300');
  const budgetLabelTone = side === 'sell'
    ? 'text-emerald-300'
    : (preview.overLimit ? 'text-[#ff6570]' : (preview.allocationUnavailable ? 'text-[#f6b54b]' : 'text-white/[0.54]'));

  return (
    <div className="tqqq-entry" data-tqqq-trade-panel="true">
      <div className="tqqq-entry-top">
        <div className="tqqq-entry-identity">
          <StockLogo
            symbol="TQQQ"
            urls={logoUrls}
            onLogoLoad={cacheStockLogo}
            className="tqqq-entry-logo"
          />
          <div className="min-w-0">
            <div className="tqqq-entry-symbol-row">
              <span className="tqqq-entry-symbol">TQQQ</span>
              <span className="tqqq-entry-tag">
                {tt('trades.tqqq.toolTag', '极端行情工具')}
              </span>
            </div>
            <div className="tqqq-entry-name">ProShares UltraPro QQQ · 3x Nasdaq-100</div>
          </div>
        </div>
        <div className="tqqq-entry-side">
          {['buy', 'sell'].map((option) => {
            const selected = side === option;
            const selectedClass = TQQQ_ACTION_TONE_CLASSES[option].selected;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => onDraftChange({ ...draft, side: option })}
                className={selected ? selectedClass : ''}
              >
                {option === 'buy' ? tt('trades.buy', '买入') : tt('trades.sell', '卖出')}
              </button>
            );
          })}
        </div>
      </div>

      <div className="tqqq-entry-fields">
        <div className="min-w-0">
          <label htmlFor="tqqq-entry-price" className={LABEL_CLASS}>{tt('trades.priceUsd', '价格 ($)')}</label>
          <input
            id="tqqq-entry-price"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={draft?.price || ''}
            onChange={(event) => onDraftChange({ ...draft, price: event.target.value })}
            placeholder={tt('trades.inputPrice', '输入价格')}
            className={INPUT_CLASS}
            style={{ colorScheme: 'dark' }}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor="tqqq-entry-shares" className="tqqq-entry-label tqqq-entry-shares-label">
            <span>{tt('trades.quantity', '股数')}</span>
            {side === 'sell' && (
              <span className="tqqq-entry-note">
                {tt('trades.tqqq.availableShares', '可卖 {{shares}} 股', { shares: formatShares(preview.availableShares) })}
              </span>
            )}
          </label>
          <input
            id="tqqq-entry-shares"
            type="number"
            min="0"
            step="1"
            max={side === 'sell' ? preview.availableShares : undefined}
            inputMode="numeric"
            value={draft?.shares || ''}
            onChange={(event) => onDraftChange({ ...draft, shares: event.target.value })}
            placeholder={tt('trades.inputShares', '输入股数')}
            aria-invalid={preview.blockReason === 'oversell' || preview.blockReason === 'whole-shares-required'}
            className={`${INPUT_CLASS} ${preview.blockReason === 'oversell' || preview.blockReason === 'whole-shares-required' ? '!border-[#ff5b68]/70' : ''}`}
            style={{ colorScheme: 'dark' }}
          />
        </div>
      </div>

      <div className="tqqq-entry-date">
        <label htmlFor="tqqq-entry-date" className={LABEL_CLASS}>{tt('trades.date', '日期')}</label>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/[0.48]" strokeWidth={1.8} />
          <input
            id="tqqq-entry-date"
            type="date"
            value={draft?.date || ''}
            onChange={(event) => onDraftChange({ ...draft, date: event.target.value })}
            className={`${INPUT_CLASS} tqqq-trade-date-input appearance-none pl-9 pr-9 text-center`}
            style={{ colorScheme: 'dark', WebkitAppearance: 'none' }}
          />
          <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/[0.38]" strokeWidth={1.8} />
        </div>
      </div>

      <div className="tqqq-entry-amount">
        <span className="tqqq-entry-metric-label">{side === 'sell' ? tt('trades.tqqq.estimatedSellAmount', '预计卖出金额') : tt('trades.tqqq.estimatedTradeAmount', '预计交易额')}</span>
        <div className="tqqq-entry-amount-value" style={{ fontFamily: NUMBER_FONT }}>
          {preview.inputReady ? <>{amountParts.main}<span className="tqqq-entry-amount-decimal">{amountParts.decimal}</span></> : '—'}
        </div>
      </div>

      <section className="tqqq-entry-section" aria-labelledby="tqqq-trade-check-title">
        <div className="tqqq-entry-section-heading">
          <h3 id="tqqq-trade-check-title" className="tqqq-entry-section-title">
            {side === 'sell' ? tt('trades.tqqq.sellCheck', '卖出前检查') : tt('trades.tqqq.tradeCheck', '交易前检查')}
          </h3>
          <span className={`text-[10px] ${preview.overLimit ? 'text-[#ff6570]' : 'text-white/[0.42]'}`}>
            {side === 'sell' ? tt('trades.tqqq.sellNoLimit', '卖出不受10%仓位提醒影响') : tt('trades.tqqq.hardLimit', '纪律提醒:TQQQ 10%')}
          </span>
        </div>

        <div className="tqqq-entry-check" data-over-limit={preview.overLimit || preview.hardBlocked} data-warning-pulse={preview.overLimit && !preview.hardBlocked}>
          {side === 'buy' ? (
            <div className="tqqq-entry-metrics">
              <Metric label={tt('trades.tqqq.currentAllocation', '当前仓位')} value={formatPercent(preview.currentAllocation)} />
              <Metric label={tt('trades.tqqq.afterTrade', '交易后')} value={formatPercent(preview.afterAllocation)} valueClassName={preview.overLimit ? 'text-[#ff6570]' : ''} />
              <Metric label={tt('trades.tqqq.disciplineLimit', '提醒线')} value="10.0%" />
              <Metric label={tt('trades.tqqq.remainingCapacity', '距提醒线')} value={formatPercent(preview.remainingAllocation)} valueClassName={remainingCapacityTone} />
            </div>
          ) : (
            <div className="tqqq-entry-metrics">
              <Metric label={tt('trades.tqqq.currentAllocation', '当前仓位')} value={formatPercent(preview.currentAllocation)} />
              <Metric label={tt('trades.tqqq.thisSell', '本次卖出')} value={`${formatShares(preview.requestedShares)}${tt('trades.shares', '股')}`} />
              <Metric label={tt('trades.tqqq.afterSellRemaining', '剩余股数')} value={preview.oversold ? '--' : `${formatShares(preview.remainingShares)}${tt('trades.shares', '股')}`} />
              <Metric label={tt('trades.tqqq.afterSellAllocation', '卖出后仓位')} value={preview.oversold ? '--' : formatPercent(preview.afterAllocation)} valueClassName="text-emerald-300" />
            </div>
          )}

          <div className="tqqq-entry-budget">
            <div className="tqqq-entry-budget-heading">
              <span>{tt('trades.tqqq.riskBudgetUsed', '风险预算使用')}</span>
              <span className="tqqq-entry-budget-value">{displayedBudgetLabel}</span>
            </div>
            <div className="tqqq-entry-budget-track">
              <div
                className="tqqq-entry-budget-fill"
                data-alert={preview.hardBlocked || preview.overLimit}
                style={{ width: `${displayedBudgetPct}%` }}
              />
            </div>
            <div className="tqqq-entry-budget-reference">
              <span>{side === 'sell' ? tt('trades.tqqq.beforeSell', '卖出前') : '0%'}</span>
              <span className={budgetLabelTone}>
                {side === 'sell' && Number.isFinite(currentBudgetPct) && Number.isFinite(preview.afterBudgetUsage)
                  ? `${Math.round(currentBudgetPct)}% → ${Math.round(preview.afterBudgetUsage * 100)}%`
                  : tt('trades.tqqq.budgetLimit', '提醒线 10%')}
              </span>
            </div>
            <div className="tqqq-entry-result"><PreviewResult preview={preview} tt={tt} /></div>
          </div>
        </div>

        {side === 'sell' && (
          <div className="tqqq-entry-sell-rule">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong className="tqqq-entry-rule-title">{tt('trades.tqqq.sellRuleTitle', '卖出只校验正式持仓与可卖股数')}</strong>
              {tt('trades.tqqq.sellRuleDesc', '不显示VIX、QQQ位置或其他买入信号,避免干扰降低风险的操作。')}
            </span>
          </div>
        )}
      </section>

      {side === 'buy' && <MarketReference marketReference={marketReference} tt={tt} />}
    </div>
  );
}
