import { renderVixMonthlyShare } from '../lib/vixMonthlyShare.js';

export { VIX_MOBILE_SHARE_WIDTH } from '../lib/vixMonthlyShare.js';

// The isolated design route uses the production renderer with explicit preview
// labeling; there is no second drawing implementation to drift out of sync.
export const renderVixDailyMobileShare = (report, options = {}) =>
  renderVixMonthlyShare(report, 'daily', { ...options, preview: true });

export const renderVixOverviewMobileShare = (report, options = {}) =>
  renderVixMonthlyShare(report, 'overview', { ...options, preview: true });
