import React from 'react';
import { useStockRsiReference } from '../lib/useStockRsiReference.js';
import StockRsiReference from './StockRsiReference.jsx';

export default function StockLiveRsiReference({ symbol, userId, authClient, tradeDate, quote, side, englishMode, renderMarketReference }) {
  const { observation, status, reason, quote: referenceQuote } = useStockRsiReference({ symbol, userId, authClient, tradeDate, quote, requestDelayMs: 500 });
  const unavailableLabel = status === 'loading'
    ? (englishMode ? 'Loading close data' : '正在读取收盘数据')
    : reason === 'historical-unavailable'
      ? (englishMode ? 'Historical reference unavailable' : '历史参考暂不可用')
      : reason === 'stale-data'
        ? (englishMode ? 'Awaiting latest close' : '等待最新收盘数据')
        : reason === 'invalid-date'
          ? (englishMode ? 'Select today’s date' : '请选择当天日期')
          : undefined;
  return <>
    <StockRsiReference symbol={symbol} observation={observation} side={side} englishMode={englishMode}
      unavailableLabel={unavailableLabel} loading={status === 'loading'} />
    {typeof renderMarketReference === 'function' ? renderMarketReference(referenceQuote) : null}
  </>;
}
