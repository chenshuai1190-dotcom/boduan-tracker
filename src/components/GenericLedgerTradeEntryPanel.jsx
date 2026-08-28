import React from 'react';
import { CalendarDays, ChevronRight, X } from 'lucide-react';
import StockLogo, { stockLogoCandidates } from './StockLogo.jsx';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const INPUT_SHELL_CLASS = 'grid min-h-[56px] min-w-0 items-center rounded-[14px] border border-white/[0.11] bg-white/[0.055] px-[14px] transition focus-within:border-[#f6b54b]/45 focus-within:bg-white/[0.075] focus-within:shadow-[inset_0_0_0_1px_rgba(246,181,75,0.06)]';
const NUMBER_INPUT_CLASS = 'h-8 w-full min-w-0 appearance-none border-0 bg-transparent p-0 text-[25px] font-normal leading-8 tracking-[-0.02em] text-white/[0.94] outline-none placeholder:text-white/[0.24] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
const LABEL_CLASS = 'text-[12px] font-normal text-white/[0.61]';

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
    <div data-generic-ledger-trade-entry="true" className="min-w-0 space-y-[13px]">
      <div className="grid min-w-0 gap-[7px]">
        <label htmlFor="generic-ledger-trade-price" className={LABEL_CLASS}>
          {tt('trades.executionPrice', '成交价格')} <span className="text-white/[0.48]">USD</span>
        </label>
        <div className={`${INPUT_SHELL_CLASS} grid-cols-[22px_minmax(0,1fr)_30px] gap-2 bg-white/[0.065]`}>
          <span className="text-center text-[20px] font-normal text-[#e8ad4c]" aria-hidden="true">$</span>
          <input
            id="generic-ledger-trade-price"
            type="number"
            placeholder={tt('trades.inputPrice', '输入价格')}
            step="0.01"
            inputMode="decimal"
            value={draft?.price || ''}
            onChange={(event) => onDraftChange({ ...draft, price: event.target.value })}
            className={NUMBER_INPUT_CLASS}
            style={{ colorScheme: 'dark', fontFamily: NUMBER_FONT }}
          />
          <button
            type="button"
            disabled={!draft?.price}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onDraftChange({ ...draft, price: '' })}
            className={`flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/[0.045] text-white/[0.34] active:scale-90 ${draft?.price ? '' : 'invisible pointer-events-none'}`}
            aria-label={tt('trades.clearPrice', '清除价格')}
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.7} />
          </button>
        </div>
      </div>

      <div className="grid min-w-0 gap-[7px]">
        <label htmlFor="generic-ledger-trade-shares" className={LABEL_CLASS}>{tt('trades.tradeShares', '交易股数')}</label>
        <div className={`${INPUT_SHELL_CLASS} grid-cols-[minmax(0,1fr)_26px] gap-2`}>
          <input
            id="generic-ledger-trade-shares"
            type="number"
            placeholder={tt('trades.inputShares', '输入股数')}
            inputMode="numeric"
            value={draft?.shares || ''}
            onChange={(event) => onDraftChange({ ...draft, shares: event.target.value })}
            className={NUMBER_INPUT_CLASS}
            style={{ colorScheme: 'dark', fontFamily: NUMBER_FONT }}
          />
          <span className="text-right text-[14px] font-normal text-white/[0.48]">{tt('trades.shares', '股')}</span>
        </div>
      </div>

      <div className="grid min-w-0 gap-[7px]">
        <label htmlFor="generic-ledger-trade-date" className={LABEL_CLASS}>{tt('trades.tradeDate', '交易日期')}</label>
        <div className={`${INPUT_SHELL_CLASS} grid-cols-[18px_minmax(0,1fr)_16px] gap-2`}>
          <CalendarDays className="pointer-events-none h-4 w-4 text-white/[0.4]" strokeWidth={1.7} />
          <input
            id="generic-ledger-trade-date"
            type="date"
            value={draft?.date || ''}
            onChange={(event) => onDraftChange({ ...draft, date: event.target.value })}
            className="h-8 min-w-0 appearance-none border-0 bg-transparent px-0 text-center text-[16px] font-normal leading-8 tabular-nums text-white/[0.86] outline-none"
            style={{ colorScheme: 'dark', WebkitAppearance: 'none', fontFamily: NUMBER_FONT }}
          />
          <ChevronRight className="pointer-events-none h-4 w-4 text-white/[0.28]" strokeWidth={1.7} />
        </div>
      </div>

      <div className="flex min-h-[34px] min-w-0 items-baseline justify-between gap-3 border-t border-white/[0.06] pt-3" aria-label={tt('trades.estimatedTradeAmount', '预计成交额')}>
        <span className="shrink-0 text-[12px] font-normal text-white/[0.36]">
          {tt('trades.estimatedTradeAmount', '预计成交额')}
        </span>
        <strong className="min-w-0 truncate text-right text-[17px] font-normal tracking-[-0.01em] text-white/[0.82] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
          {estimatedAmountText}
          {estimatedAmount !== null ? <small className="ml-1 text-[11px] font-normal text-white/[0.36]">USD</small> : null}
        </strong>
      </div>
    </div>
  );
}
