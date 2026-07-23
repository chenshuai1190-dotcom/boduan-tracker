export const EARNINGS_DETAIL_EXPORT_WIDTH = 430;
export const EARNINGS_DETAIL_EXPORT_MAX_DIMENSION = 8192;
export const EARNINGS_DETAIL_EXPORT_MAX_PIXELS = 14_000_000;

const MIN_EXPORT_TEXT_SIZE = 11.5;
const MIN_EXPORT_TEXT_ALPHA = 0.36;
const EXPORT_FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif';

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function calculateEarningsDetailExportLayout({
  width = EARNINGS_DETAIL_EXPORT_WIDTH,
  height,
  devicePixelRatio = 1,
} = {}) {
  const safeWidth = Math.ceil(finitePositive(width, EARNINGS_DETAIL_EXPORT_WIDTH));
  const safeHeight = Math.ceil(finitePositive(height, 1));
  const preferredScale = Math.max(2, Math.min(3, finitePositive(devicePixelRatio, 1)));
  const scale = Math.min(
    preferredScale,
    EARNINGS_DETAIL_EXPORT_MAX_DIMENSION / safeWidth,
    EARNINGS_DETAIL_EXPORT_MAX_DIMENSION / safeHeight,
    Math.sqrt(EARNINGS_DETAIL_EXPORT_MAX_PIXELS / (safeWidth * safeHeight)),
  );
  return {
    width: safeWidth,
    height: safeHeight,
    scale,
    outputWidth: Math.ceil(safeWidth * scale),
    outputHeight: Math.ceil(safeHeight * scale),
  };
}

function hasOwnText(element) {
  return Array.from(element.childNodes || []).some(
    (node) => node.nodeType === 3 && String(node.textContent || '').trim(),
  );
}

function readableTextColor(color) {
  const match = String(color || '').match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d*(?:\.\d+)?))?\s*\)$/i,
  );
  if (!match) return null;
  const red = Number(match[1]);
  const green = Number(match[2]);
  const blue = Number(match[3]);
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (red < 220 || green < 220 || blue < 220 || alpha >= MIN_EXPORT_TEXT_ALPHA) return null;
  return `rgba(${red}, ${green}, ${blue}, ${MIN_EXPORT_TEXT_ALPHA})`;
}

function replaceExportImages(root, clonedDocument) {
  root.querySelectorAll('img').forEach((image) => {
    const fallback = clonedDocument.createElement('div');
    const rect = image.getBoundingClientRect();
    const label = image.dataset.exportFallback
      || image.parentElement?.dataset?.exportFallback
      || image.alt
      || '';
    fallback.textContent = label;
    fallback.style.width = `${Math.max(1, rect.width || image.width || 44)}px`;
    fallback.style.height = `${Math.max(1, rect.height || image.height || 44)}px`;
    fallback.style.display = 'flex';
    fallback.style.alignItems = 'center';
    fallback.style.justifyContent = 'center';
    fallback.style.flex = '0 0 auto';
    fallback.style.borderRadius = '12px';
    fallback.style.border = '1px solid rgba(255,255,255,0.10)';
    fallback.style.background = 'rgba(255,255,255,0.06)';
    fallback.style.color = 'rgba(255,255,255,0.55)';
    fallback.style.font = `400 12px/1.35 ${EXPORT_FONT}`;
    image.replaceWith(fallback);
  });
}

function prepareExportRoot(root, clonedDocument, { capture = false } = {}) {
  if (!root) return;
  root.dataset.earningsDetailExportMode = 'true';
  root.style.position = 'fixed';
  root.style.left = capture ? '0' : '-10000px';
  root.style.top = '0';
  root.style.width = `${EARNINGS_DETAIL_EXPORT_WIDTH}px`;
  root.style.minWidth = `${EARNINGS_DETAIL_EXPORT_WIDTH}px`;
  root.style.maxWidth = 'none';
  root.style.minHeight = '0';
  root.style.height = 'auto';
  root.style.overflow = 'visible';
  root.style.pointerEvents = 'none';
  root.style.zIndex = capture ? '0' : '-2147483648';
  root.style.backgroundColor = '#05070b';
  root.style.colorScheme = 'dark';
  root.style.fontFamily = EXPORT_FONT;
  root.style.fontSynthesis = 'none';
  root.style.textSizeAdjust = '100%';
  root.style.webkitTextSizeAdjust = '100%';
  root.style.webkitFontSmoothing = 'antialiased';
  root.style.textRendering = 'geometricPrecision';

  root.querySelectorAll('[data-export-ignore="true"], [data-export-decoration="true"]').forEach((element) => {
    element.style.visibility = 'hidden';
    element.style.pointerEvents = 'none';
  });
  root.querySelectorAll('[data-export-sticky="true"]').forEach((element) => {
    element.style.position = 'relative';
    element.style.top = 'auto';
    element.style.paddingTop = '14px';
    element.style.backgroundColor = '#05070b';
    element.style.backdropFilter = 'none';
    element.style.webkitBackdropFilter = 'none';
  });
  root.querySelectorAll('[data-export-content="true"]').forEach((element) => {
    element.style.paddingBottom = '16px';
  });
  root.querySelectorAll('.truncate').forEach((element) => {
    element.style.overflow = 'visible';
    element.style.textOverflow = 'clip';
    element.style.whiteSpace = 'normal';
    element.style.wordBreak = 'break-word';
  });

  const view = clonedDocument.defaultView;
  root.querySelectorAll('*').forEach((element) => {
    element.style.animation = 'none';
    element.style.transition = 'none';
    element.style.caretColor = 'transparent';
    element.style.fontSynthesis = 'none';
    element.style.webkitFontSmoothing = 'antialiased';
    element.style.textRendering = 'geometricPrecision';
    if (!hasOwnText(element) || !view) return;
    const computed = view.getComputedStyle(element);
    const fontSize = Number.parseFloat(computed.fontSize);
    if (Number.isFinite(fontSize) && fontSize < MIN_EXPORT_TEXT_SIZE) {
      element.style.fontSize = `${MIN_EXPORT_TEXT_SIZE}px`;
      element.style.lineHeight = `${Math.ceil(MIN_EXPORT_TEXT_SIZE * 1.45 * 10) / 10}px`;
    } else if (Number.isFinite(fontSize)) {
      const lineHeight = Number.parseFloat(computed.lineHeight);
      if (!Number.isFinite(lineHeight) || lineHeight < fontSize * 1.25) {
        element.style.lineHeight = `${Math.ceil(fontSize * 1.35 * 10) / 10}px`;
      }
    }
    const color = readableTextColor(computed.color);
    if (color) element.style.color = color;
  });

  replaceExportImages(root, clonedDocument);
}

function waitForExportLayout(view = globalThis) {
  return new Promise((resolve) => {
    const schedule = view?.requestAnimationFrame
      ? view.requestAnimationFrame.bind(view)
      : (callback) => globalThis.setTimeout(callback, 16);
    schedule(() => schedule(resolve));
  });
}

async function createPreparedExportClone(element) {
  const exportClone = element.cloneNode(true);
  exportClone.setAttribute('aria-hidden', 'true');
  document.body.appendChild(exportClone);
  prepareExportRoot(exportClone, document);
  await document.fonts?.ready;
  await waitForExportLayout();
  return exportClone;
}

export async function renderEarningsDetailPng(element) {
  if (!(element instanceof HTMLElement)) throw new Error('没有可分享的财报页面');
  let exportClone = null;
  try {
    exportClone = await createPreparedExportClone(element);
    const width = EARNINGS_DETAIL_EXPORT_WIDTH;
    const height = Math.ceil(exportClone.scrollHeight || exportClone.getBoundingClientRect().height);
    if (!height) throw new Error('财报页面尚未完成渲染');
    const layout = calculateEarningsDetailExportLayout({
      width,
      height,
      devicePixelRatio: globalThis.devicePixelRatio || 1,
    });
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(exportClone, {
      backgroundColor: '#05070b',
      scale: layout.scale,
      width: layout.width,
      height: layout.height,
      windowWidth: layout.width,
      windowHeight: layout.height,
      scrollX: 0,
      scrollY: 0,
      useCORS: false,
      allowTaint: false,
      logging: false,
      imageTimeout: 0,
      onclone: async (clonedDocument, clonedElement) => {
        prepareExportRoot(clonedElement, clonedDocument, { capture: true });
        await clonedDocument.fonts?.ready;
        await waitForExportLayout();
      },
    });
    return await new Promise((resolve, reject) => {
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('生成分享图片失败'))), 'image/png');
    });
  } finally {
    exportClone?.remove();
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  let anchor = null;
  try {
    anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor?.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

export async function shareEarningsDetailBlob({ blob, symbol, title }) {
  if (!(blob instanceof Blob)) throw new Error('分享图片尚未生成');
  const safeSymbol = String(symbol || 'earnings').replace(/[^A-Za-z0-9.-]/g, '') || 'earnings';
  const filename = `${safeSymbol}-earnings-detail.png`;
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: title || `${safeSymbol} 财报详情` });
    return { method: 'share', blob };
  }
  downloadBlob(blob, filename);
  return { method: 'download', blob };
}

export async function shareEarningsDetailImage({ element, symbol, title }) {
  const blob = await renderEarningsDetailPng(element);
  return shareEarningsDetailBlob({ blob, symbol, title });
}
