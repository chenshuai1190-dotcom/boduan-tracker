const MAX_EXPORT_DIMENSION = 8192;
const MAX_EXPORT_PIXELS = 14_000_000;

function prepareExportClone(clonedDocument) {
  const root = clonedDocument.querySelector('[data-earnings-detail-export-root="true"]');
  if (!root) return;
  root.querySelectorAll('[data-export-ignore="true"]').forEach((element) => {
    element.style.visibility = 'hidden';
    element.style.pointerEvents = 'none';
  });
  root.querySelectorAll('[data-export-sticky="true"]').forEach((element) => {
    element.style.position = 'relative';
    element.style.top = 'auto';
  });
  root.querySelectorAll('*').forEach((element) => {
    element.style.animation = 'none';
    element.style.transition = 'none';
    element.style.caretColor = 'transparent';
  });
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
    fallback.style.font = '400 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    image.replaceWith(fallback);
  });
}

export async function renderEarningsDetailPng(element) {
  if (!(element instanceof HTMLElement)) throw new Error('没有可分享的财报页面');
  const width = Math.ceil(element.getBoundingClientRect().width || element.scrollWidth);
  const height = Math.ceil(element.scrollHeight);
  if (!width || !height) throw new Error('财报页面尚未完成渲染');

  const pixelRatio = Math.max(1, Math.min(2, globalThis.devicePixelRatio || 1));
  const scale = Math.min(
    pixelRatio,
    MAX_EXPORT_DIMENSION / width,
    MAX_EXPORT_DIMENSION / height,
    Math.sqrt(MAX_EXPORT_PIXELS / (width * height)),
  );
  await document.fonts?.ready;
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(element, {
    backgroundColor: '#05070b',
    scale,
    width,
    height,
    windowWidth: Math.max(width, document.documentElement.clientWidth),
    windowHeight: Math.max(height, document.documentElement.clientHeight),
    scrollX: 0,
    scrollY: -globalThis.scrollY,
    useCORS: false,
    allowTaint: false,
    logging: false,
    imageTimeout: 0,
    onclone: prepareExportClone,
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('生成分享图片失败'))), 'image/png', 0.96);
  });
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
