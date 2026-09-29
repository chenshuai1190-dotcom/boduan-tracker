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

// Term ratios are an indicator series, independent of the user's return colors.
// Reuse the system benchmark blue and neutral chart references.
export const VIX_TERM_CHART_COLORS = Object.freeze({
  line: '#789ac0',
  threshold: '#a1a1aa',
  secondaryThreshold: '#62626b',
  inversion: VIX_RISK_COLORS.HIGH_STRESS,
  inversionLabel: VIX_RISK_COLORS.EXTREME_STRESS,
  band: 'rgba(219,167,123,0.065)',
  normalized: '#c7c8d0',
});

export function getVixObservationColor(level, normalColor = VIX_RISK_COLORS.HIGH_STRESS) {
  return level === 'EXTREME_STRESS' ? VIX_RISK_COLORS.EXTREME_STRESS : normalColor;
}
