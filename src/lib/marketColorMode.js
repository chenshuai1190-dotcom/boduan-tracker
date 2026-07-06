export const MARKET_COLOR_MODE_STORAGE_KEY = 'xmoney_market_color_mode';

export const MARKET_COLOR_MODES = {
  GREEN_UP_RED_DOWN: 'greenUpRedDown',
  RED_UP_GREEN_DOWN: 'redUpGreenDown',
};

export const MARKET_RED_HEX = '#ff4b1f';
export const MARKET_RED_TEXT_CLASS = 'text-[#ff4b1f]';
export const MARKET_RED_STRONG_TEXT_CLASS = 'text-[#e63a18]';
export const MARKET_RED_BG_CLASS = 'bg-[#ff4b1f]';
export const MARKET_RED_SOFT_BG_CLASS = 'bg-[#ff4b1f]/12';

export function normalizeMarketColorMode(value) {
  return value === MARKET_COLOR_MODES.RED_UP_GREEN_DOWN
    ? MARKET_COLOR_MODES.RED_UP_GREEN_DOWN
    : MARKET_COLOR_MODES.GREEN_UP_RED_DOWN;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isPositive(value) {
  return toNumber(value) >= 0;
}

function usesGreenForPositive(mode) {
  return normalizeMarketColorMode(mode) === MARKET_COLOR_MODES.GREEN_UP_RED_DOWN;
}

export function marketTextClass(value, mode) {
  const green = isPositive(value) === usesGreenForPositive(mode);
  return green ? 'text-emerald-400' : MARKET_RED_TEXT_CLASS;
}

export function marketStrongTextClass(value, mode) {
  const green = isPositive(value) === usesGreenForPositive(mode);
  return green ? 'text-emerald-600' : MARKET_RED_STRONG_TEXT_CLASS;
}

export function marketBgClass(value, mode) {
  const green = isPositive(value) === usesGreenForPositive(mode);
  return green ? 'bg-emerald-600' : MARKET_RED_BG_CLASS;
}

export function marketSoftBgClass(value, mode) {
  const green = isPositive(value) === usesGreenForPositive(mode);
  return green ? 'bg-emerald-400/12' : MARKET_RED_SOFT_BG_CLASS;
}

export function marketHexColor(value, mode) {
  const green = isPositive(value) === usesGreenForPositive(mode);
  return green ? '#22c55e' : MARKET_RED_HEX;
}
