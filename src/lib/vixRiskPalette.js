// Presentation only: shared by the VIX homepage, monthly report and PNG export.
export const VIX_RISK_COLORS = Object.freeze({
  LOW_VOLATILITY: '#9ab5aa',
  NORMAL: '#c8bfb2',
  ELEVATED: '#d1b889',
  HIGH_STRESS: '#dba77b',
  EXTREME_STRESS: '#ff4d4f',
  UNKNOWN: '#969ba5',
});

export const VIX_DIRECTION_COLORS = Object.freeze({
  RISING: VIX_RISK_COLORS.HIGH_STRESS,
  HIGH_HOLD: VIX_RISK_COLORS.ELEVATED,
  EASING: '#a8b7d2',
  STABLE: VIX_RISK_COLORS.NORMAL,
  UNKNOWN: VIX_RISK_COLORS.UNKNOWN,
});

export const getVixRiskColor = level => VIX_RISK_COLORS[level] || VIX_RISK_COLORS.UNKNOWN;
export const getVixRiskDirectionColor = direction => VIX_DIRECTION_COLORS[direction] || VIX_DIRECTION_COLORS.UNKNOWN;

export function getVixRiskAccentStyle(level) {
  const color = getVixRiskColor(level);
  return {
    '--vcr-accent': color,
    '--vcr-accent-rgb': color.slice(1).match(/../g).map(pair => parseInt(pair, 16)).join(','),
  };
}
