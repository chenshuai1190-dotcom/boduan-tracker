import React from 'react';
import { CalendarDays, ChevronRight, X } from 'lucide-react';
import StockLogo, { stockLogoCandidates } from './StockLogo.jsx';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const INPUT_SHELL_CLASS = 'flex min-h-[68px] min-w-0 items-center rounded-[16px] border border-white/[0.11] bg-white/[0.055] px-[18px] transition focus-within:border-[#f6b54b]/45 focus-within:bg-white/[0.075]';
const NUMBER_INPUT_CLASS = 'min-w-0 flex-1 border-0 bg-transparent p-0 text-[30px] font-normal tracking-[-0.025em] text-white/[0.94] outline-none placeholder:text-white/[0.24]';
const LABEL_CLASS = 'text-[13px] font-normal text-white/[0.66]';

function normalizedSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

export function GenericLedgerTradeHeader({
  draft,
  onDraftChange,
  logoCache,
  cacheStockLogo,
  editing = false,
  tt,
}) {
  const symbol = normalizedSymbol(draft?.symbol);
  const rawName = String(draft?.name || '').trim();
  const displayName = rawName && rawName.toUpperCase() !== symbol ? rawName : '';
  const logoUrls = stockLogoCandidates(symbol, logoCache?.[symbol]?.url);

  return (
    <div data-generic-ledger-symbol-header="true" className="flex min-w-0 items-center gap-3">
      <StockLogo
        symbol={symbol}
        urls={logoUrls}
        onLogoLoad={cacheStockLogo}
        className="h-11 w-11 shrink-0 rounded-full"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <input
            type="text"
            value={draft?.symbol || ''}
            placeholder={tt('trades.stockTicker', '股票代码')}
            aria-label={tt('trades.stockTicker', '股票代码')}
            autoCapitalize="characters"
            spellCheck="false"
            onChange={(event) => onDraftChange({
              ...draft,
              symbol: event.target.value.toUpperCase(),
              name: '',
              price: '',
            })}
            className="w-[98px] max-w-[42%] min-w-[70px] rounded-md border-0 bg-transparent px-0 py-0.5 text-[17px] font-medium uppercase leading-tight text-white/[0.94] outline-none placeholder:text-white/[0.34] focus:bg-white/[0.045]"
          />
          {displayName ? (
            <span className="min-w-0 truncate text-[15px] font-normal text-white/[0.79]">{displayName}</span>
          ) : null}
        </div>
        <div className="mt-1 truncate text-[11px] font-normal text-white/[0.38]">
          {editing
            ? tt('trades.formalTradeEditMeta', '修改正式交易 · 美股')
            : tt('trades.formalTradeNewMeta', '新增正式交易 · 美股')}
        </div>
      </div>
    </div>
  );
}

export default function GenericLedgerTradeEntryPanel({ draft, onDraftChange, tt }) {
  const price = Number(draft?.price);
  const shares = Number(draft?.shares);
  const estimatedAmount = Number.isFinite(price) && price > 0 && Number.isFinite(shares) && shares > 0
    ? price * shares
    : null;
  const estimatedAmountText = estimatedAmount === null
    ? '—'
    : `$${estimatedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div data-generic-ledger-trade-entry="true" className="min-w-0 space-y-[18px]">
      <label className="block min-w-0">
        <span className={LABEL_CLASS}>
          {tt('trades.executionPrice', '成交价格')} <span className="text-white/[0.48]">USD</span>
        </span>
        <span className={`${INPUT_SHELL_CLASS} mt-2.5 min-h-[74px] bg-white/[0.075]`}>
          <span className="mr-2.5 shrink-0 text-[23px] font-normal text-[#e8ad4c]" aria-hidden="true">$</span>
          <input
            type="number"
            placeholder={tt('trades.inputPrice', '输入价格')}
            step="0.01"
            inputMode="decimal"
            value={draft?.price || ''}
            onChange={(event) => onDraftChange({ ...draft, price: event.target.value })}
            className={NUMBER_INPUT_CLASS}
            style={{ colorScheme: 'dark', fontFamily: NUMBER_FONT }}
          />
          {draft?.price ? (
            <button
              type="button"
              onClick={() => onDraftChange({ ...draft, price: '' })}
              className="ml-2 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-white/[0.36] active:scale-90"
              aria-label={tt('trades.clearPrice', '清除价格')}
            >
              <X className="h-4 w-4" strokeWidth={1.7} />
            </button>
          ) : null}
        </span>
      </label>

      <label className="block min-w-0">
        <span className={LABEL_CLASS}>{tt('trades.tradeShares', '交易股数')}</span>
        <span className={`${INPUT_SHELL_CLASS} mt-2.5`}>
          <input
            type="number"
            placeholder={tt('trades.inputShares', '输入股数')}
            inputMode="numeric"
            value={draft?.shares || ''}
            onChange={(event) => onDraftChange({ ...draft, shares: event.target.value })}
            className={NUMBER_INPUT_CLASS}
            style={{ colorScheme: 'dark', fontFamily: NUMBER_FONT }}
          />
          <span className="ml-2 shrink-0 text-[15px] font-normal text-white/[0.56]">{tt('trades.shares', '股')}</span>
        </span>
      </label>

      <label className="block min-w-0">
        <span className={LABEL_CLASS}>{tt('trades.tradeDate', '交易日期')}</span>
        <span className={`${INPUT_SHELL_CLASS} relative mt-2.5`}>
          <CalendarDays className="pointer-events-none h-[17px] w-[17px] shrink-0 text-white/[0.43]" strokeWidth={1.7} />
          <input
            type="date"
            value={draft?.date || ''}
            onChange={(event) => onDraftChange({ ...draft, date: event.target.value })}
            className="min-w-0 flex-1 appearance-none border-0 bg-transparent px-3 text-center text-[17px] font-normal tabular-nums text-white/[0.88] outline-none"
            style={{ colorScheme: 'dark', WebkitAppearance: 'none', fontFamily: NUMBER_FONT }}
          />
          <ChevronRight className="pointer-events-none h-4 w-4 shrink-0 text-white/[0.32]" strokeWidth={1.7} />
        </span>
      </label>

      <div className="flex min-w-0 items-end justify-between gap-3 border-t border-white/[0.065] pt-[18px]" aria-label={tt('trades.estimatedTradeAmount', '预计成交额')}>
        <span className="shrink-0 text-[13px] font-normal text-white/[0.38]">
          {tt('trades.estimatedTradeAmount', '预计成交额')}
        </span>
        <strong className="min-w-0 truncate text-right text-[21px] font-normal tracking-[-0.015em] text-white/[0.87] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
          {estimatedAmountText}
          {estimatedAmount !== null ? <small className="ml-1 text-[11px] font-normal text-white/[0.36]">USD</small> : null}
        </strong>
      </div>
    </div>
  );
}
