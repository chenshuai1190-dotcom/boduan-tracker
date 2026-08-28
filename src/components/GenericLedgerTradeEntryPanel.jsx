import React from 'react';
import { CalendarDays, ChevronRight, X } from 'lucide-react';
import StockLogo, { stockLogoCandidates } from './StockLogo.jsx';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const INPUT_SHELL_CLASS = 'grid min-h-[45px] min-w-0 items-center rounded-[13px] border border-white/10 bg-white/[0.045] px-[11px] transition focus-within:border-[#f6b54b]/55 focus-within:bg-white/[0.07]';
const NUMBER_INPUT_CLASS = 'h-[25px] w-full min-w-0 appearance-none border-0 bg-transparent p-0 text-[18px] font-normal leading-[25px] tracking-[-0.015em] text-white outline-none placeholder:text-white/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
const LABEL_CLASS = 'text-[12px] font-normal text-white/48';

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
        <div className="min-w-0">
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
            className="w-[98px] max-w-[42%] min-w-[70px] rounded-md border-0 bg-transparent px-0 py-0.5 text-[17px] font-medium uppercase leading-tight text-white outline-none placeholder:text-white/20 focus:bg-white/[0.045]"
          />
        </div>
        <div className="mt-1 truncate text-[11px] font-normal text-white/42">
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
          {tt('trades.executionPrice', '成交价格')} <span className="text-white/42">USD</span>
        </label>
        <div className={`${INPUT_SHELL_CLASS} grid-cols-[17px_minmax(0,1fr)_25px] gap-[7px]`}>
          <span className="text-center text-[15px] font-normal text-[#f6b54b]" aria-hidden="true">$</span>
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
            className={`flex h-[25px] w-[25px] items-center justify-center rounded-full bg-white/[0.06] text-[15px] text-white/35 active:scale-90 ${draft?.price ? '' : 'invisible pointer-events-none'}`}
            aria-label={tt('trades.clearPrice', '清除价格')}
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.7} />
          </button>
        </div>
      </div>

      <div className="grid min-w-0 gap-[7px]">
        <label htmlFor="generic-ledger-trade-shares" className={LABEL_CLASS}>{tt('trades.tradeShares', '交易股数')}</label>
        <div className={`${INPUT_SHELL_CLASS} grid-cols-[minmax(0,1fr)_22px] gap-[7px]`}>
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
          <span className="text-right text-[14px] font-normal text-white/48">{tt('trades.shares', '股')}</span>
        </div>
      </div>

      <div className="grid min-w-0 gap-[7px]">
        <label htmlFor="generic-ledger-trade-date" className={LABEL_CLASS}>{tt('trades.tradeDate', '交易日期')}</label>
        <div className={`${INPUT_SHELL_CLASS} grid-cols-[18px_minmax(0,1fr)_16px] gap-2`}>
          <CalendarDays className="pointer-events-none h-4 w-4 text-white/42" strokeWidth={1.7} />
          <input
            id="generic-ledger-trade-date"
            type="date"
            value={draft?.date || ''}
            onChange={(event) => onDraftChange({ ...draft, date: event.target.value })}
            className="h-[25px] min-w-0 appearance-none border-0 bg-transparent px-0 text-center text-[14px] font-normal leading-[25px] tabular-nums text-white outline-none"
            style={{ colorScheme: 'dark', WebkitAppearance: 'none', fontFamily: NUMBER_FONT }}
          />
          <ChevronRight className="pointer-events-none h-4 w-4 text-white/35" strokeWidth={1.7} />
        </div>
      </div>

      <div className="grid min-h-[49px] min-w-0 gap-[5px] border-t border-white/[0.06] px-0.5 pb-px pt-[11px]" aria-label={tt('trades.estimatedTradeAmount', '预计成交额')}>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="text-[11px] font-normal text-white/42">
            {tt('trades.estimatedTradeAmount', '预计成交额')}
          </span>
          <small className="text-[10px] font-normal text-white/35">USD</small>
        </div>
        <strong
          className="w-full min-w-0 justify-self-end whitespace-nowrap text-right text-[16px] font-normal leading-[21px] tracking-[-0.01em] text-white tabular-nums"
          style={{ fontFamily: NUMBER_FONT, fontSize: 'clamp(14px, 4vw, 16px)' }}
        >
          {estimatedAmountText}
        </strong>
      </div>
    </div>
  );
}
