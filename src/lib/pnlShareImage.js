import { sanitizePnlShareNickname } from './pnlShareIdentity.js';
import { drawPnlShareBackground, normalizePnlShareTheme } from './pnlShareThemes.js';

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

function formatSignedAmount(value, rate, locale) {
  const converted = Number(value) * rate;
  const rounded = Number(converted.toFixed(2));
  const displayValue = Object.is(rounded, -0) ? 0 : rounded;
  const sign = displayValue >= 0 ? '+' : '-';
  return `${sign}${Math.abs(displayValue).toLocaleString(locale, {
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

function normalizeMetricTone(value) {
  return value === 'gain' || value === 'loss' ? value : 'neutral';
}

function normalizeCurrencyUnit(value) {
  const unit = String(value || '').trim().toUpperCase();
  return unit === 'USD' || unit === 'CNY' ? unit : '';
}

function metricTone(value, multiplier) {
  const rounded = Number((Number(value) * multiplier).toFixed(2));
  if (!Number.isFinite(rounded) || rounded === 0) return 'neutral';
  return rounded > 0 ? 'gain' : 'loss';
}

export function pnlShareToneColor(tone) {
  const normalizedTone = normalizeMetricTone(tone);
  if (normalizedTone === 'neutral') return '#e1e1e6';
  return normalizedTone === 'gain' ? '#ff4b1f' : '#36c49a';
}

function drawLeftFittedText(context, text, x, y, {
  color,
  fontSize,
  fontWeight = 400,
  maxWidth,
  minFontSize = 36,
  lastLineAtY = false,
}) {
  let resolvedSize = fontSize;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle = color;
  context.font = `${fontWeight} ${resolvedSize}px ${CANVAS_FONT}`;
  while (resolvedSize > minFontSize && context.measureText(text).width > maxWidth) {
    resolvedSize = Math.max(minFontSize, resolvedSize - 2);
    context.font = `${fontWeight} ${resolvedSize}px ${CANVAS_FONT}`;
  }
  // Wrap at the minimum size rather than asking Canvas to compress glyphs.
  const lines = [];
  let line = '';
  for (const character of text) {
    if (line && context.measureText(line + character).width > maxWidth) {
      lines.push(line);
      line = character;
    } else {
      line += character;
    }
  }
  lines.push(line);
  const lineHeight = Math.ceil(resolvedSize * 1.3);
  const firstY = lastLineAtY ? y - (lines.length - 1) * lineHeight : y;
  lines.forEach((value, index) => context.fillText(value, x, firstY + index * lineHeight));
  return firstY + (lines.length - 1) * lineHeight;
}

function drawPnlShareIdentity(context, nickname, avatarImage) {
  const avatarX = 96;
  const avatarY = 112;
  const avatarSize = 96;
  const sourceWidth = Number(avatarImage?.naturalWidth || avatarImage?.width || avatarSize);
  const sourceHeight = Number(avatarImage?.naturalHeight || avatarImage?.height || avatarSize);
  const sourceSize = Math.max(1, Math.min(sourceWidth, sourceHeight));
  const cropSize = sourceSize / 1.15;
  const sourceX = Math.max(0, (sourceWidth - cropSize) / 2);
  const sourceY = Math.max(0, (sourceHeight - cropSize) / 2);

  context.save();
  context.beginPath();
  context.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  context.clip();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    avatarImage,
    sourceX,
    sourceY,
    cropSize,
    cropSize,
    avatarX,
    avatarY,
    avatarSize,
    avatarSize,
  );
  context.restore();

  drawLeftFittedText(context, nickname, 224, 174, {
    color: '#c3c3ca',
    fontSize: 40,
    maxWidth: 880,
    minFontSize: 36,
  });
}

/**
 * Deliberately copies only presentation-safe fields. Every unknown input
 * property is ignored before anything reaches Canvas.
 */
export function createPnlShareRenderModel(input = {}) {
  const showAmount = input.showAmount !== false;
  return Object.freeze({
    nickname: sanitizePnlShareNickname(input.nickname),
    generatedText: safeText(input.generatedText, '', 72),
    marketLabel: safeText(input.marketLabel, '', 40),
    metricLabel: safeText(input.metricLabel, '', 40),
    themeId: normalizePnlShareTheme(input.themeId),
    showAmount,
    amountText: showAmount ? safeText(input.amountText, '—', 48) : '',
    currencyUnit: showAmount ? normalizeCurrencyUnit(input.currencyUnit) : '',
    percentText: safeText(input.percentText, '—', 28),
    amountTone: normalizeMetricTone(input.amountTone),
    percentTone: normalizeMetricTone(input.percentTone),
    accessibilityLabel: showAmount ? safeText(input.accessibilityLabel, '', 120) : '',
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
      ? formatSignedAmount(amount, displayRate, locale)
      : '—',
    currencyUnit: available ? normalizedCurrency : '',
    percentText: available && isFiniteMetric(percent)
      ? formatSignedPercent(percent)
      : safeText(unavailableText, '暂不可用', 40),
    amountTone: available ? metricTone(amount, displayRate) : 'neutral',
    percentTone: available && isFiniteMetric(percent) ? metricTone(percent, 100) : 'neutral',
  });
}

export function renderPnlShareCanvas(canvas, input = {}, avatarImage = null) {
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
  if ('letterSpacing' in context) context.letterSpacing = '0px';

  drawPnlShareBackground(context, model.themeId);

  const hasIdentity = Boolean(model.nickname && avatarImage);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  if (hasIdentity) {
    drawPnlShareIdentity(context, model.nickname, avatarImage);
  } else {
    drawLeftFittedText(context, model.nickname || 'Quote', 96, 174, {
      color: '#c3c3ca',
      fontSize: 40,
      maxWidth: 1008,
      minFontSize: 36,
    });
  }

  drawLeftFittedText(context, model.marketLabel, 96, 280, {
    color: '#8b8b94',
    fontSize: 36,
    maxWidth: 1008,
    minFontSize: 36,
  });

  drawLeftFittedText(context, model.metricLabel, 96, 470, {
    color: '#a2a2ab',
    fontSize: 36,
    maxWidth: 1008,
    minFontSize: 36,
  });

  if (model.showAmount) {
    const amountBottom = drawLeftFittedText(context, model.amountText, 96, 668, {
      color: pnlShareToneColor(model.amountTone),
      fontSize: 120,
      maxWidth: 1008,
      minFontSize: 48,
    });
    if (model.currencyUnit) {
      drawLeftFittedText(context, model.currencyUnit, 96, amountBottom + 62, {
        color: '#909099',
        fontSize: 36,
        maxWidth: 1008,
        minFontSize: 36,
      });
    }
    drawLeftFittedText(context, model.percentText, 96, Math.max(876, amountBottom + 188), {
      color: pnlShareToneColor(model.percentTone),
      fontSize: 72,
      maxWidth: 1008,
      minFontSize: 48,
    });
  } else {
    drawLeftFittedText(context, model.percentText, 96, 668, {
      color: pnlShareToneColor(model.percentTone),
      fontSize: 160,
      maxWidth: 1008,
      minFontSize: 48,
    });
  }

  drawLeftFittedText(context, model.generatedText, 96, 1428, {
    color: '#b9bbc4',
    fontSize: 36,
    maxWidth: 1008,
    minFontSize: 36,
    lastLineAtY: true,
  });
  drawLeftFittedText(context, 'Quote', 96, 1510, {
    color: '#b9bbc4',
    fontSize: 36,
    maxWidth: 1008,
    minFontSize: 36,
  });

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
