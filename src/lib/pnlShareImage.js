export const PNL_SHARE_IMAGE_WIDTH = 1200;
export const PNL_SHARE_IMAGE_HEIGHT = 1600;
export const PNL_SHARE_IMAGE_MIME_TYPE = 'image/png';

const CANVAS_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';

function isFiniteMetric(value) {
  return value !== null
    && value !== undefined
    && value !== ''
    && Number.isFinite(Number(value));
}

function formatSignedAmount(value, currency, rate, locale) {
  const converted = Number(value) * rate;
  const rounded = Number(converted.toFixed(2));
  const displayValue = Object.is(rounded, -0) ? 0 : rounded;
  const currencyMark = currency === 'CNY' ? '¥' : '$';
  const sign = displayValue >= 0 ? '+' : '-';
  return `${sign}${currencyMark}${Math.abs(displayValue).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedPercent(value) {
  const rounded = Number((Number(value) * 100).toFixed(2));
  const displayValue = Object.is(rounded, -0) ? 0 : rounded;
  const sign = displayValue >= 0 ? '+' : '';
  return `${sign}${displayValue.toFixed(2)}%`;
}

function safeText(value, fallback = '', maxLength = 80) {
  const text = String(value ?? fallback)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (text || fallback).slice(0, maxLength);
}

function roundedRect(context, x, y, width, height, radius) {
  const resolvedRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + resolvedRadius, y);
  context.lineTo(x + width - resolvedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + resolvedRadius);
  context.lineTo(x + width, y + height - resolvedRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - resolvedRadius, y + height);
  context.lineTo(x + resolvedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - resolvedRadius);
  context.lineTo(x, y + resolvedRadius);
  context.quadraticCurveTo(x, y, x + resolvedRadius, y);
  context.closePath();
}

function drawCenteredFittedText(context, text, centerX, y, {
  color,
  fontSize,
  fontWeight = 600,
  maxWidth,
  minFontSize = 42,
}) {
  let resolvedSize = fontSize;
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.fillStyle = color;
  context.font = `${fontWeight} ${resolvedSize}px ${CANVAS_FONT}`;
  while (resolvedSize > minFontSize && context.measureText(text).width > maxWidth) {
    resolvedSize -= 2;
    context.font = `${fontWeight} ${resolvedSize}px ${CANVAS_FONT}`;
  }
  context.fillText(text, centerX, y);
}

function drawPrivacyLock(context, x, y) {
  context.save();
  context.strokeStyle = 'rgba(255,255,255,0.48)';
  context.fillStyle = 'rgba(255,255,255,0.055)';
  context.lineWidth = 3;
  context.beginPath();
  context.arc(x + 13, y + 12, 9, Math.PI, 0);
  context.stroke();
  roundedRect(context, x, y + 11, 26, 22, 7);
  context.fill();
  context.stroke();
  context.restore();
}

function drawWarmGoldMotif(context) {
  context.save();
  const glow = context.createRadialGradient(600, 1130, 10, 600, 1130, 430);
  glow.addColorStop(0, 'rgba(246,181,75,0.19)');
  glow.addColorStop(0.48, 'rgba(246,181,75,0.065)');
  glow.addColorStop(1, 'rgba(246,181,75,0)');
  context.fillStyle = glow;
  context.fillRect(160, 690, 880, 800);

  context.translate(600, 1120);
  context.rotate(-0.22);
  const lightBand = context.createLinearGradient(-390, 0, 390, 0);
  lightBand.addColorStop(0, 'rgba(246,181,75,0)');
  lightBand.addColorStop(0.38, 'rgba(246,181,75,0.12)');
  lightBand.addColorStop(0.57, 'rgba(255,221,142,0.54)');
  lightBand.addColorStop(1, 'rgba(246,181,75,0)');
  context.shadowColor = 'rgba(246,181,75,0.28)';
  context.shadowBlur = 46;
  context.fillStyle = lightBand;
  roundedRect(context, -390, -23, 780, 46, 23);
  context.fill();

  context.translate(10, 96);
  context.rotate(0.09);
  context.shadowBlur = 22;
  context.globalAlpha = 0.38;
  roundedRect(context, -310, -6, 620, 12, 6);
  context.fill();
  context.restore();
}

/**
 * Deliberately copies only presentation-safe fields. Every unknown input
 * property is ignored before anything reaches Canvas.
 */
export function createPnlShareRenderModel(input = {}) {
  return Object.freeze({
    privacyLabel: safeText(input.privacyLabel, '', 32),
    generatedText: safeText(input.generatedText, '', 72),
    marketLabel: safeText(input.marketLabel, '', 40),
    metricLabel: safeText(input.metricLabel, '', 40),
    amountText: safeText(input.amountText, '—', 48),
    percentText: safeText(input.percentText, '—', 28),
    accessibilityLabel: safeText(input.accessibilityLabel, '', 120),
  });
}

/**
 * Builds one presentation-safe metric from the formal-trading summary. Currency
 * conversion applies to the money amount only; the return rate stays unchanged.
 */
export function buildPnlShareMetricPresentation({
  summary = {},
  metricId = 'daily',
  currency = 'USD',
  rate = 1,
  locale = 'zh-CN',
  unavailableText = '暂不可用',
} = {}) {
  let amount;
  let percent;
  let available;

  if (metricId === 'holding') {
    amount = summary?.holdingPnl;
    percent = summary?.holdingPnlPct;
    available = isFiniteMetric(amount);
  } else if (metricId === 'total') {
    amount = summary?.cumulativePnl;
    percent = summary?.cumulativePnlPct;
    available = isFiniteMetric(amount);
  } else {
    amount = summary?.todayPnl;
    percent = summary?.todayPnlPct;
    available = summary?.hasTodayPnl !== false && isFiniteMetric(amount);
  }

  const normalizedCurrency = currency === 'CNY' ? 'CNY' : 'USD';
  const numericRate = Number(rate);
  const displayRate = normalizedCurrency === 'CNY' && Number.isFinite(numericRate) && numericRate > 0
    ? numericRate
    : 1;

  return Object.freeze({
    available,
    amountText: available
      ? formatSignedAmount(amount, normalizedCurrency, displayRate, locale)
      : '—',
    percentText: available && isFiniteMetric(percent)
      ? formatSignedPercent(percent)
      : safeText(unavailableText, '暂不可用', 40),
  });
}

export function renderPnlShareCanvas(canvas, input = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new TypeError('A Canvas element is required');
  }
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');

  const model = createPnlShareRenderModel(input);
  canvas.width = PNL_SHARE_IMAGE_WIDTH;
  canvas.height = PNL_SHARE_IMAGE_HEIGHT;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, PNL_SHARE_IMAGE_WIDTH, PNL_SHARE_IMAGE_HEIGHT);

  const background = context.createLinearGradient(0, 0, 1200, 1600);
  background.addColorStop(0, '#040507');
  background.addColorStop(0.58, '#090a0d');
  background.addColorStop(1, '#030405');
  context.fillStyle = background;
  context.fillRect(0, 0, PNL_SHARE_IMAGE_WIDTH, PNL_SHARE_IMAGE_HEIGHT);

  const topGlow = context.createRadialGradient(930, 20, 0, 930, 20, 480);
  topGlow.addColorStop(0, 'rgba(246,181,75,0.095)');
  topGlow.addColorStop(1, 'rgba(246,181,75,0)');
  context.fillStyle = topGlow;
  context.fillRect(450, 0, 750, 520);

  roundedRect(context, 72, 72, 1056, 1456, 58);
  context.fillStyle = 'rgba(10,11,14,0.96)';
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,0.075)';
  context.lineWidth = 2;
  context.stroke();

  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle = 'rgba(255,255,255,0.94)';
  context.font = `600 48px ${CANVAS_FONT}`;
  context.fillText('Quote', 130, 172);

  drawPrivacyLock(context, 840, 126);
  context.fillStyle = 'rgba(255,255,255,0.54)';
  context.font = `500 27px ${CANVAS_FONT}`;
  context.fillText(model.privacyLabel, 882, 159);

  context.fillStyle = 'rgba(255,255,255,0.34)';
  context.font = `400 25px ${CANVAS_FONT}`;
  context.fillText(model.generatedText, 130, 230);
  context.textAlign = 'right';
  context.fillText(model.marketLabel, 1070, 230);

  context.fillStyle = 'rgba(255,255,255,0.075)';
  context.fillRect(130, 282, 940, 2);

  drawWarmGoldMotif(context);

  context.textAlign = 'center';
  context.fillStyle = 'rgba(255,255,255,0.48)';
  context.font = `500 36px ${CANVAS_FONT}`;
  context.fillText(model.metricLabel, 600, 470);

  drawCenteredFittedText(context, model.amountText, 600, 665, {
    color: 'rgba(255,255,255,0.94)',
    fontSize: 112,
    fontWeight: 640,
    maxWidth: 880,
    minFontSize: 62,
  });
  drawCenteredFittedText(context, model.percentText, 600, 765, {
    color: '#f6b54b',
    fontSize: 48,
    fontWeight: 580,
    maxWidth: 760,
    minFontSize: 36,
  });

  context.textAlign = 'center';
  context.fillStyle = 'rgba(255,255,255,0.28)';
  context.font = `500 24px ${CANVAS_FONT}`;
  context.fillText('Quote', 600, 1442);

  return model;
}

export function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (!canvas || typeof canvas.toBlob !== 'function') {
      reject(new Error('Canvas PNG export is unavailable'));
      return;
    }
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas PNG export failed'));
    }, PNL_SHARE_IMAGE_MIME_TYPE);
  });
}

export function createPnlSharePngFile(blob, fileName) {
  if (!blob || typeof File !== 'function') return null;
  return new File([blob], safeText(fileName, 'Quote.png', 96), {
    type: PNL_SHARE_IMAGE_MIME_TYPE,
    lastModified: Date.now(),
  });
}
