import React from 'react';
import { useTqqqRsiReference } from '../lib/useTqqqRsiReference.js';
import TqqqRsiReference from './TqqqRsiReference.jsx';

// Mounted only inside the formal TQQQ entry dialog. Design fixtures never
// mount this component or enter the authenticated data path.
export default function TqqqLiveRsiReference({ userId, authClient, tradeDate, quote, side, englishMode }) {
  const { observation, status, reason } = useTqqqRsiReference({ userId, authClient, tradeDate, quote });
  const unavailableLabel = status === 'loading'
    ? (englishMode ? 'Loading close data' : '正在读取收盘数据')
    : reason === 'historical-unavailable'
      ? (englishMode ? 'Historical reference unavailable' : '历史参考暂不可用')
      : reason === 'stale-data'
        ? (englishMode ? 'Awaiting latest close' : '等待最新收盘数据')
        : reason === 'invalid-date'
          ? (englishMode ? 'Select today’s date' : '请选择当天日期')
          : undefined;
  return (
    <TqqqRsiReference
      observation={observation}
      side={side}
      englishMode={englishMode}
      unavailableLabel={unavailableLabel}
      loading={status === 'loading'}
    />
  );
}
