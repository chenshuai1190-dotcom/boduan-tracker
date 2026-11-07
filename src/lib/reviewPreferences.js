const TYPES = [
  ['net_assets_high', '净资产新高', 'Net asset highs', 'high'],
  ['return_high', '累计收益率新高', 'Return highs', 'high'],
  ['pnl_high', '累计盈利新高', 'Profit highs', 'high'],
  ['annual_return_high', '年内收益率新高', 'Annual return highs', 'high'],
  ['annual_return_low', '年内收益率新低', 'Annual return lows', 'low'],
  ['annual_pnl_high', '年内收益金额新高', 'Annual P&L highs', 'high'],
  ['annual_pnl_low', '年内收益金额新低', 'Annual P&L lows', 'low'],
  ['drawdown', '净资产回撤与恢复', 'Net asset drawdowns and recovery', 'drawdown'],
  ['return_drawdown', '收益率高点回落', 'Decline from annual return high', 'drawdown'],
  ['daily_record', '单日涨跌纪录', 'Daily return records', 'record'],
  ['month', '月度总结', 'Monthly summaries', 'period'],
  ['quarter', '季度总结', 'Quarterly summaries', 'period'],
  ['year', '年度总结', 'Yearly summaries', 'period'],
];
export const REVIEW_TIMELINE_TYPES = Object.freeze(TYPES.map(([id, label, enLabel, group]) => Object.freeze({ id, label, enLabel, group })));
const TYPE_IDS = TYPES.map(([id]) => id);
export const DEFAULT_REVIEW_PREFERENCES = Object.freeze({ showTimeline: true, currency: 'USD', eventTypes: Object.freeze([...TYPE_IDS]) });
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const failure = () => Object.assign(new Error('动态显示设置格式无效，请重新选择。'), { code: 'REVIEW_PREFERENCES_INVALID' });

export function normalizeReviewPreferences(value, { strict = false } = {}) {
  if (value == null) { if (strict) throw failure(); return { ...DEFAULT_REVIEW_PREFERENCES, eventTypes: [...TYPE_IDS] }; }
  if (!plain(value)) { if (strict) throw failure(); return normalizeReviewPreferences(null); }
  if (strict && (typeof value.showTimeline !== 'boolean' || !['USD', 'CNY'].includes(value.currency)
    || !Array.isArray(value.eventTypes) || value.eventTypes.some(type => !TYPE_IDS.includes(type)))) throw failure();
  return {
    showTimeline: typeof value.showTimeline === 'boolean' ? value.showTimeline : true,
    currency: value.currency === 'CNY' ? 'CNY' : 'USD',
    eventTypes: Array.isArray(value.eventTypes) ? TYPE_IDS.filter(type => value.eventTypes.includes(type)) : [...TYPE_IDS],
  };
}

export function patchReviewPreferences(previous, patch) {
  if (!plain(patch) || Object.keys(patch).some(key => !['showTimeline', 'currency', 'eventTypes'].includes(key))) throw failure();
  return normalizeReviewPreferences({ ...normalizeReviewPreferences(previous), ...patch }, { strict: true });
}

export function sameReviewPreferences(left, right) {
  const a = normalizeReviewPreferences(left), b = normalizeReviewPreferences(right);
  return a.showTimeline === b.showTimeline && a.currency === b.currency && a.eventTypes.join(',') === b.eventTypes.join(',');
}
