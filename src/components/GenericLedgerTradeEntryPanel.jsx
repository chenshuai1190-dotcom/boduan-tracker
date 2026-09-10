import React from 'react';
import { CalendarDays, ChevronRight, X } from 'lucide-react';
import StockLogo, { stockLogoCandidates } from './StockLogo.jsx';
import './GenericLedgerTradeEntryPanel.css';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const INPUT_SHELL_CLASS = 'ledger-entry-field';
const NUMBER_INPUT_CLASS = 'ledger-entry-input';
const LABEL_CLASS = 'ledger-entry-label';

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
    <div data-generic-ledger-symbol-header="true" className="ledger-entry-identity">
      <StockLogo
        symbol={symbol}
        urls={logoUrls}
        onLogoLoad={cacheStockLogo}
        className="ledger-entry-logo"
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
            className="ledger-entry-symbol"
          />
        </div>
        <div className="ledger-entry-meta">
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
    <div data-generic-ledger-trade-entry="true" className="ledger-entry-form">
      <div className="ledger-entry-group">
        <label htmlFor="generic-ledger-trade-price" className={LABEL_CLASS}>
          {tt('trades.executionPrice', '成交价格')} <span>USD</span>
        </label>
        <div className={`${INPUT_SHELL_CLASS} ledger-entry-price-field`}>
          <span className="ledger-entry-currency" aria-hidden="true">$</span>
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
            className={`ledger-entry-clear ${draft?.price ? '' : 'invisible pointer-events-none'}`}
            aria-label={tt('trades.clearPrice', '清除价格')}
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.7} />
          </button>
        </div>
      </div>

      <div className="ledger-entry-group">
        <label htmlFor="generic-ledger-trade-shares" className={LABEL_CLASS}>{tt('trades.tradeShares', '交易股数')}</label>
        <div className={`${INPUT_SHELL_CLASS} ledger-entry-shares-field`}>
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
          <span className="ledger-entry-unit">{tt('trades.shares', '股')}</span>
        </div>
      </div>

      <div className="ledger-entry-group">
        <label htmlFor="generic-ledger-trade-date" className={LABEL_CLASS}>{tt('trades.tradeDate', '交易日期')}</label>
        <div className={`${INPUT_SHELL_CLASS} ledger-entry-date-field`}>
          <CalendarDays className="pointer-events-none h-4 w-4" strokeWidth={1.7} />
          <input
            id="generic-ledger-trade-date"
            type="date"
            value={draft?.date || ''}
            onChange={(event) => onDraftChange({ ...draft, date: event.target.value })}
            className={`${NUMBER_INPUT_CLASS} ledger-entry-date`}
            style={{ colorScheme: 'dark', WebkitAppearance: 'none', fontFamily: NUMBER_FONT }}
          />
          <ChevronRight className="pointer-events-none h-4 w-4" strokeWidth={1.7} />
        </div>
      </div>

      <div className="ledger-entry-estimate" aria-label={tt('trades.estimatedTradeAmount', '预计成交额')}>
        <div className="ledger-entry-estimate-label">
          <span>
            {tt('trades.estimatedTradeAmount', '预计成交额')}
          </span>
          <small>USD</small>
        </div>
        <strong
          className="ledger-entry-estimate-value"
          style={{ fontFamily: NUMBER_FONT }}
        >
          {estimatedAmountText}
        </strong>
      </div>
    </div>
  );
}
