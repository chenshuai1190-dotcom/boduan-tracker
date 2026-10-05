import React from 'react';
import { CalendarDays, ChevronRight, X } from 'lucide-react';
import StockLogo, { stockLogoCandidates } from './StockLogo.jsx';
import { splitCurrencyAmount } from '../lib/amountDisplay.js';
import { MARKET_RED_HEX } from '../lib/marketColorMode.js';
import './GenericLedgerTradeEntryPanel.css';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const INPUT_SHELL_CLASS = 'ledger-entry-field';
const NUMBER_INPUT_CLASS = 'ledger-entry-input';
const LABEL_CLASS = 'ledger-entry-label';

function normalizedSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function finiteValue(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function GenericLedgerTradeHeader({ draft, logoCache, cacheStockLogo, onDraftChange, tt }) {
  const symbol = normalizedSymbol(draft?.symbol);
  const logoUrls = stockLogoCandidates(symbol, logoCache?.[symbol]?.url);

  return (
    <div data-generic-ledger-symbol-header="true" className="ledger-entry-identity">
      {symbol && (
        <StockLogo
          symbol={symbol}
          urls={logoUrls}
          onLogoLoad={cacheStockLogo}
          className="ledger-entry-logo"
        />
      )}
      <div className="min-w-0 flex-1">
        {onDraftChange ? (
          <>
            <label htmlFor="generic-ledger-trade-symbol" className="sr-only">{tt('trades.stockTicker', '股票代码')}</label>
            <div className={`${INPUT_SHELL_CLASS} ledger-entry-symbol-field`} data-has-symbol={Boolean(symbol)}>
              <input
                id="generic-ledger-trade-symbol"
                type="text"
                value={draft?.symbol || ''}
                placeholder={tt('trades.enterStockTicker', '输入股票代码')}
                aria-label={tt('trades.stockTicker', '股票代码')}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck="false"
                enterKeyHint="next"
                onChange={(event) => onDraftChange({
                  ...draft,
                  symbol: event.target.value.toUpperCase(),
                  name: '',
                  price: '',
                })}
                className={`${NUMBER_INPUT_CLASS} ledger-entry-ticker-input`}
              />
            </div>
          </>
        ) : (
          <div className={`ledger-entry-symbol ${symbol ? '' : 'ledger-entry-symbol-empty'}`}>
            {symbol || tt('trades.addTrade', '新增交易')}
          </div>
        )}
        <div className="ledger-entry-name">{draft?.name || tt('trades.usStocks', '美股')}</div>
      </div>
    </div>
  );
}

export function GenericLedgerTradeMarketReference({ symbol, marketReference, tt }) {
  const vixValue = marketReference?.vixReady ? finiteValue(marketReference.vixValue) : null;
  const stockDistance = marketReference?.stockReady ? finiteValue(marketReference.stockDistanceFromHigh) : null;
  const unavailable = tt('trades.tqqq.dataUnavailable', '数据暂不可用');

  return (
    <section className="ledger-entry-market" data-generic-ledger-market-reference="true" aria-labelledby="generic-ledger-market-title">
      <h3 id="generic-ledger-market-title" className="ledger-entry-section-title">{tt('trades.tqqq.marketReference', '市场参考')}</h3>
      <div className="ledger-entry-market-grid">
        <div className="ledger-entry-market-metric">
          <div className="ledger-entry-metric-label">VIX</div>
          <div className="ledger-entry-market-value" style={{ fontFamily: NUMBER_FONT }}>
            {vixValue === null ? '--' : vixValue.toFixed(2)}
          </div>
          <div className="ledger-entry-note">
            {vixValue !== null && marketReference?.vixDataDate
              ? tt('trades.tqqq.dataAsOf', '数据 {{date}}', { date: marketReference.vixDataDate })
              : unavailable}
          </div>
        </div>
        <div className="ledger-entry-market-metric">
          <div className="ledger-entry-metric-label">{normalizedSymbol(symbol) || tt('trades.stock', '股票')}</div>
          <div className="ledger-entry-market-value" style={{ fontFamily: NUMBER_FONT }}>
            {stockDistance === null ? '--' : `${(stockDistance * 100).toFixed(1)}%`}
          </div>
          <div className="ledger-entry-note">
            {tt('trades.distanceFrom52WeekHigh', '距52周高点')}{stockDistance === null ? ` · ${unavailable}` : ''}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function GenericLedgerTradeEntryPanel({
  draft,
  onDraftChange,
  tt,
  referenceContent = null,
  marketReference,
  showMarketReference = true,
  logoCache,
  cacheStockLogo,
}) {
  const side = draft?.side === 'sell' ? 'sell' : 'buy';

  return (
    <div data-generic-ledger-trade-entry="true" className="ledger-entry-form">
      <div className="ledger-entry-top">
        <GenericLedgerTradeHeader draft={draft} logoCache={logoCache} cacheStockLogo={cacheStockLogo} onDraftChange={onDraftChange} tt={tt} />
        <div className="ledger-entry-side" role="group" aria-label={tt('trades.tradeSide', '交易方向')}>
          {['buy', 'sell'].map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={side === option}
              onClick={() => onDraftChange({ ...draft, side: option })}
              className={side === option ? 'ledger-entry-side-selected' : ''}
            >
              {option === 'buy' ? tt('trades.buy', '买入') : tt('trades.sell', '卖出')}
            </button>
          ))}
        </div>
      </div>

      <div className="ledger-entry-fields">
        <div className="ledger-entry-group">
          <label htmlFor="generic-ledger-trade-price" className={LABEL_CLASS}>{tt('trades.priceUsd', '价格 ($)')}</label>
          <div className={`${INPUT_SHELL_CLASS} ledger-entry-price-field`}>
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
          <label htmlFor="generic-ledger-trade-shares" className={LABEL_CLASS}>{tt('trades.quantity', '股数')}</label>
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
          </div>
        </div>
      </div>

      <div className="ledger-entry-group ledger-entry-date-group">
        <label htmlFor="generic-ledger-trade-date" className={LABEL_CLASS}>{tt('trades.date', '日期')}</label>
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

      {referenceContent}
      {side === 'buy' && showMarketReference && <GenericLedgerTradeMarketReference symbol={draft?.symbol} marketReference={marketReference} tt={tt} />}
    </div>
  );
}

export function GenericLedgerTradeAmount({ draft, tt }) {
  const price = finiteValue(draft?.price);
  const shares = finiteValue(draft?.shares);
  const rawAmount = price !== null && price > 0 && shares !== null && shares > 0 ? price * shares : null;
  const amount = Number.isFinite(rawAmount) ? rawAmount : null;
  const amountParts = amount === null ? null : splitCurrencyAmount(amount, 'USD', 2);
  const selling = draft?.side === 'sell';

  return (
    <div className="ledger-entry-amount" data-generic-ledger-trade-amount="true">
      <span className="ledger-entry-metric-label">
        {selling ? tt('trades.estimatedSellAmount', '预计卖出金额') : tt('trades.estimatedTradeAmount', '预计成交额')}
      </span>
      <div className="ledger-entry-amount-value" style={{ fontFamily: NUMBER_FONT, '--ledger-entry-amount-color': amount !== null && !selling ? MARKET_RED_HEX : undefined }}>
        {amountParts ? <>{amountParts.main}<span className="ledger-entry-amount-decimal">{amountParts.decimal}</span></> : '—'}
      </div>
    </div>
  );
}
