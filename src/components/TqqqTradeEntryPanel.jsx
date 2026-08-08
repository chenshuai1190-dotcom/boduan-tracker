import React from 'react';
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import StockLogo, { stockLogoCandidates } from './StockLogo.jsx';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const INPUT_CLASS = 'block h-[46px] w-full min-w-0 rounded-xl border border-white/[0.08] bg-white/[0.055] px-3.5 text-[14px] font-normal tabular-nums text-white outline-none transition placeholder:text-white/[0.28] focus:border-[#7c3ff2]/70 focus:bg-white/[0.075]';
const LABEL_CLASS = 'mb-1.5 block text-[12px] font-normal text-white/[0.60]';

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatUsd(value) {
  return numberValue(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
    <div className={`min-w-0 px-1 py-1 text-center ${className}`}>
      <div className="flex min-h-[30px] items-center justify-center text-[10px] font-normal leading-[14px] text-white/[0.54]">
        {label}
      </div>
      <div className={`mt-1.5 whitespace-nowrap text-[16px] font-normal tabular-nums text-white/[0.92] ${valueClassName}`} style={{ fontFamily: NUMBER_FONT }}>
        {value}
      </div>
    </div>
  );
}

function LookupStatus({ status, tt }) {
  if (status === 'loading') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-sky-300">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        <span>{tt('trades.lookupLoading', '查询中')}</span>
      </span>
    );
  }
  if (status === 'notfound') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-amber-300">
        <AlertCircle className="h-3.5 w-3.5" />
        <span>{tt('trades.lookupNotFound', '未找到,可手动填')}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-emerald-300">
      <CheckCircle2 className="h-3.5 w-3.5" />
      <span>{tt('trades.lookupFound', '已找到')}</span>
    </span>
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
      <span className="inline-flex items-center gap-1.5 text-[#f6b54b]">
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
    <section className="space-y-2.5" aria-labelledby="tqqq-market-reference-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="tqqq-market-reference-title" className="text-[16px] font-normal text-white/[0.92]">
          {tt('trades.tqqq.marketReference', '市场参考')}
        </h3>
        <span className="text-[10px] text-white/[0.36]">{tt('trades.tqqq.objectiveOnly', '仅展示客观指标,不定义综合市场状态')}</span>
      </div>

      <div className="grid grid-cols-2 rounded-[17px] border border-white/[0.08] bg-white/[0.025] px-2.5 py-3">
        <div className="min-w-0 border-r border-white/[0.07] px-2 text-center">
          <div className="flex min-h-[30px] items-center justify-center text-[10px] leading-[14px] text-white/[0.48]">VIX</div>
          <div className="mt-1 text-[16px] font-normal tabular-nums text-white/[0.94]" style={{ fontFamily: NUMBER_FONT }}>
            {marketReference.vixReady ? marketReference.vixValue.toFixed(1) : '--'}
          </div>
          <div className="mt-1 min-h-[14px] text-[10px] leading-[14px] text-white/[0.28]">
            {marketReference.vixReady
              ? tt('trades.tqqq.dataAsOf', '数据 {{date}}', { date: marketReference.vixDataDate })
              : tt('trades.tqqq.dataUnavailable', '数据暂不可用')}
          </div>
        </div>
        <div className="min-w-0 px-2 text-center">
          <div className="flex min-h-[30px] items-center justify-center text-[10px] leading-[14px] text-white/[0.48]">{tt('trades.tqqq.qqqFromHigh', 'QQQ 距52周高点')}</div>
          <div className="mt-1 text-[16px] font-normal tabular-nums text-white/[0.94]" style={{ fontFamily: NUMBER_FONT }}>
            {formatPercent(marketReference.qqqDistanceFromHigh, 1)}
          </div>
          <div className="mt-1 min-h-[14px] text-[10px] leading-[14px] text-[#f6b54b]">
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
  lookupStatus,
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
  const resultTone = preview.hardBlocked
    ? 'border-[#ff5b68]/20 bg-[#ff5b68]/[0.045]'
    : (preview.overLimit || preview.allocationUnavailable ? 'border-[#f6b54b]/25 bg-[#f6b54b]/[0.055]' : 'border-white/[0.08] bg-white/[0.025]');

  return (
    <div className="min-w-0 space-y-4" data-tqqq-trade-panel="true">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <StockLogo
            symbol="TQQQ"
            urls={logoUrls}
            onLogoLoad={cacheStockLogo}
            className="h-[58px] w-[58px] shrink-0 rounded-[15px] border border-white/[0.08]"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[22px] font-normal tracking-[0.02em] text-white">TQQQ</span>
              <span className="rounded-lg border border-[#8c55f6]/20 bg-[#7c3ff2]/25 px-2 py-1 text-[10px] text-[#d9c9ff]">
                {tt('trades.tqqq.toolTag', '极端行情工具')}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[11px] text-white/[0.48]">ProShares UltraPro QQQ · 3x Nasdaq-100</div>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-1 rounded-[14px] border border-white/[0.08] bg-black/[0.18] p-1 sm:w-[220px]">
          {['buy', 'sell'].map((option) => {
            const selected = side === option;
            const selectedClass = option === 'buy'
              ? 'bg-emerald-500 text-white shadow-[0_6px_18px_rgba(16,185,129,0.18)]'
              : 'bg-[#eb5360] text-white shadow-[0_6px_18px_rgba(235,83,96,0.20)]';
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => onDraftChange({ ...draft, side: option })}
                className={`h-[43px] rounded-[11px] text-[13px] font-normal active:scale-[0.98] ${selected ? selectedClass : 'text-white/[0.48]'}`}
              >
                {option === 'buy' ? tt('trades.buy', '买入') : tt('trades.sell', '卖出')}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-9 items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-3 text-[10px] text-white/[0.56]">
        <span className="inline-flex min-w-0 items-center gap-2 truncate">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300"><Check className="h-3 w-3" /></span>
          {tt('trades.systemManagedName', '名称和现价由系统自动识别')}
        </span>
        <LookupStatus status={lookupStatus} tt={tt} />
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-2.5">
        <div className="min-w-0">
          <label className={LABEL_CLASS}>{tt('trades.priceUsd', '价格 ($)')}</label>
          <input
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
          <label className="mb-1.5 flex items-center justify-between gap-2 text-[12px] font-normal text-white/[0.60]">
            <span>{tt('trades.quantity', '股数')}</span>
            {side === 'sell' && (
              <span className="text-[10px] text-white/[0.34]">
                {tt('trades.tqqq.availableShares', '可卖 {{shares}} 股', { shares: formatShares(preview.availableShares) })}
              </span>
            )}
          </label>
          <input
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

      <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] pb-3 text-[11px] text-white/[0.46]">
        <span>{side === 'sell' ? tt('trades.tqqq.estimatedSellAmount', '预计卖出金额') : tt('trades.tqqq.estimatedTradeAmount', '预计交易额')}</span>
        <span className="text-[14px] font-normal tabular-nums text-white/[0.76]" style={{ fontFamily: NUMBER_FONT }}>{formatUsd(preview.amountUsd)}</span>
      </div>

      <section className="space-y-2.5" aria-labelledby="tqqq-trade-check-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="tqqq-trade-check-title" className="text-[16px] font-normal text-white/[0.92]">
            {side === 'sell' ? tt('trades.tqqq.sellCheck', '卖出前检查') : tt('trades.tqqq.tradeCheck', '交易前检查')}
          </h3>
          <span className="text-[10px] text-white/[0.42]">
            {side === 'sell' ? tt('trades.tqqq.sellNoLimit', '卖出不受10%仓位提醒影响') : tt('trades.tqqq.hardLimit', '纪律提醒:TQQQ 10%')}
          </span>
        </div>

        <div className={`rounded-[17px] border p-3.5 ${resultTone}`}>
          {side === 'buy' ? (
            <div className="grid grid-cols-4">
              <Metric className="border-r border-white/[0.07]" label={tt('trades.tqqq.currentAllocation', '当前仓位')} value={formatPercent(preview.currentAllocation)} />
              <Metric className="border-r border-white/[0.07]" label={tt('trades.tqqq.afterTrade', '交易后')} value={formatPercent(preview.afterAllocation)} />
              <Metric className="border-r border-white/[0.07]" label={tt('trades.tqqq.disciplineLimit', '提醒线')} value="10.0%" />
              <Metric label={tt('trades.tqqq.remainingCapacity', '距提醒线')} value={formatPercent(preview.remainingAllocation)} valueClassName={preview.overLimit || preview.allocationUnavailable ? 'text-[#f6b54b]' : 'text-emerald-300'} />
            </div>
          ) : (
            <div className="grid grid-cols-4">
              <Metric className="border-r border-white/[0.07]" label={tt('trades.tqqq.currentAllocation', '当前仓位')} value={formatPercent(preview.currentAllocation)} />
              <Metric className="border-r border-white/[0.07]" label={tt('trades.tqqq.thisSell', '本次卖出')} value={`${formatShares(preview.requestedShares)}${tt('trades.shares', '股')}`} />
              <Metric className="border-r border-white/[0.07]" label={tt('trades.tqqq.afterSellRemaining', '剩余股数')} value={preview.oversold ? '--' : `${formatShares(preview.remainingShares)}${tt('trades.shares', '股')}`} />
              <Metric label={tt('trades.tqqq.afterSellAllocation', '卖出后仓位')} value={preview.oversold ? '--' : formatPercent(preview.afterAllocation)} valueClassName="text-emerald-300" />
            </div>
          )}

          <div className="mt-3.5 border-t border-white/[0.07] pt-3.5">
            <div className="mb-2 flex items-center justify-between gap-2 text-[10px] text-white/[0.48]">
              <span>{tt('trades.tqqq.riskBudgetUsed', '风险预算使用')}</span>
              <span className={side === 'sell' ? 'text-emerald-300' : 'text-white/[0.54]'}>
                {side === 'sell' && Number.isFinite(currentBudgetPct) && Number.isFinite(preview.afterBudgetUsage)
                  ? `${Math.round(currentBudgetPct)}% → ${Math.round(preview.afterBudgetUsage * 100)}%`
                  : tt('trades.tqqq.budgetLimit', '提醒线 10%')}
              </span>
            </div>
            <div className="relative pt-7">
              {displayedBudgetReady && (
                <span
                  className="absolute top-0 z-[1] min-w-[38px] -translate-x-1/2 rounded-[9px] bg-white/[0.90] px-1.5 py-0.5 text-center text-[10px] font-medium leading-[16px] tabular-nums text-[#202228] shadow-[0_3px_9px_rgba(0,0,0,0.26)]"
                  style={{ left: `clamp(22px, ${displayedBudgetPct}%, calc(100% - 22px))` }}
                >
                  {displayedBudgetLabel}
                  <span className="absolute bottom-[-3px] left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-white/[0.90]" />
                </span>
              )}
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.09]">
                <div
                  className={`h-full rounded-full transition-[width] ${preview.hardBlocked ? 'bg-[#eb5360]' : (preview.overLimit ? 'bg-[#f6b54b]' : 'bg-[linear-gradient(90deg,#32d06b,#c9ce59_72%,#f6b54b)]')}`}
                  style={{ width: `${displayedBudgetPct}%` }}
                />
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-white/[0.30]">
              <span>{side === 'sell' ? tt('trades.tqqq.beforeSell', '卖出前') : '0%'}</span>
              <PreviewResult preview={preview} tt={tt} />
            </div>
          </div>
        </div>

        {side === 'sell' && (
          <div className="flex items-start gap-2.5 rounded-[14px] border border-emerald-400/15 bg-emerald-400/[0.065] px-3.5 py-3 text-[10px] leading-[16px] text-white/[0.52]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <span>
              <strong className="block font-normal text-white/[0.86]">{tt('trades.tqqq.sellRuleTitle', '卖出只校验正式持仓与可卖股数')}</strong>
              {tt('trades.tqqq.sellRuleDesc', '不显示VIX、QQQ位置或其他买入信号,避免干扰降低风险的操作。')}
            </span>
          </div>
        )}
      </section>

      {side === 'buy' && <MarketReference marketReference={marketReference} tt={tt} />}

      <div className={side === 'buy' ? 'pt-3' : 'border-t border-white/[0.08] pt-3'}>
        <label className={LABEL_CLASS}>{tt('trades.date', '日期')}</label>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/[0.48]" strokeWidth={1.8} />
          <input
            type="date"
            value={draft?.date || ''}
            onChange={(event) => onDraftChange({ ...draft, date: event.target.value })}
            className={`${INPUT_CLASS} tqqq-trade-date-input appearance-none pl-9 pr-9 text-center`}
            style={{ colorScheme: 'dark', WebkitAppearance: 'none' }}
          />
          <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/[0.38]" strokeWidth={1.8} />
        </div>
      </div>
    </div>
  );
}
