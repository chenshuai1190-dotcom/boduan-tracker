// Presentation uses the actual latest record directions, never infers a
// percentage record from a money record (or the reverse).
export const isReviewEarningsEvent = event => Array.isArray(event?.recordMetrics);

export function reviewEarningsScope(event, en = false) {
  if (event.scopeKeys?.length > 1) return en ? 'Annual · cumulative' : '年内 · 累计';
  return event.metric === 'annual_pnl' ? en ? 'Annual' : '年内' : en ? 'Cumulative' : '累计';
}

export function reviewEarningsRecordLabel(event, en = false) {
  if (!isReviewEarningsEvent(event)) return '';
  const amount = event.recordMetrics.includes('amount'), rate = event.recordMetrics.includes('return');
  if (!amount && !rate) return '';
  const metric = amount && rate ? en ? 'P&L and return' : '金额与收益率' : amount ? en ? 'P&L' : '金额' : en ? 'Return' : '收益率';
  return en ? `${metric} at a new ${event.kind === 'low' ? 'low' : 'high'}`
    : `${metric}${amount && rate ? '同时' : ''}创新${event.kind === 'low' ? '低' : '高'}`;
}
