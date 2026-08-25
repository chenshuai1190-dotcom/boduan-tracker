import React from 'react';
import { ArrowLeft, Download, Loader2, Share2 } from 'lucide-react';
import { isEnglishLanguage, t } from '../lib/i18n.js';
import {
  buildPnlShareMetricPresentation,
  canvasToPngBlob,
  createPnlSharePngFile,
  PNL_SHARE_IMAGE_HEIGHT,
  PNL_SHARE_IMAGE_WIDTH,
  renderPnlShareCanvas,
} from '../lib/pnlShareImage.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';

const SHARE_METRICS = Object.freeze([
  Object.freeze({ id: 'daily', labelKey: 'pnlShare.dailyReturn', labelFallback: '当日收益' }),
  Object.freeze({ id: 'holding', labelKey: 'pnlShare.holdingReturn', labelFallback: '持仓收益' }),
  Object.freeze({ id: 'total', labelKey: 'pnlShare.totalPnl', labelFallback: '累计盈亏' }),
]);

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function safeFileName(value) {
  const sanitized = String(value || 'Quote.png')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 88);
  return sanitized.toLowerCase().endsWith('.png') ? sanitized : `${sanitized}.png`;
}

function canShareFile(file) {
  if (!file || typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export default function PnlSharePage({
  onClose,
  investmentSummary = {},
  language = 'zh',
  portfolioCurrencyMode = 'USD',
  usdRate,
}) {
  const tt = React.useCallback((key, fallback, values) => t(language, key, fallback, values), [language]);
  const englishMode = isEnglishLanguage(language);
  const locale = englishMode ? 'en-US' : 'zh-CN';
  const [shareSnapshot] = React.useState(() => {
    const summaryRate = Number(investmentSummary?.usdRate);
    const fallbackRate = Number(usdRate);
    return Object.freeze({
      capturedAt: Date.now(),
      currency: portfolioCurrencyMode === 'CNY' ? 'CNY' : 'USD',
      rate: Number.isFinite(summaryRate) && summaryRate > 0
        ? summaryRate
        : (Number.isFinite(fallbackRate) && fallbackRate > 0 ? fallbackRate : 7.2),
      summary: Object.freeze({
        todayPnl: investmentSummary?.todayPnl,
        todayPnlPct: investmentSummary?.todayPnlPct,
        hasTodayPnl: investmentSummary?.hasTodayPnl,
        holdingPnl: investmentSummary?.holdingPnl,
        holdingPnlPct: investmentSummary?.holdingPnlPct,
        cumulativePnl: investmentSummary?.cumulativePnl,
        cumulativePnlPct: investmentSummary?.cumulativePnlPct,
      }),
    });
  });
  const displayCurrency = shareSnapshot.currency;
  const displayRate = displayCurrency === 'CNY'
    ? shareSnapshot.rate
    : 1;
  const [selectedMetric, setSelectedMetric] = React.useState('daily');
  const [shareAsset, setShareAsset] = React.useState(null);
  const [statusKey, setStatusKey] = React.useState('');
  const canvasRef = React.useRef(null);
  const renderVersionRef = React.useRef(0);
  const mountedRef = React.useRef(true);
  const objectUrlsRef = React.useRef(new Set());

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, []);

  const selectedDefinition = SHARE_METRICS.find(metric => metric.id === selectedMetric) || SHARE_METRICS[0];
  const unavailableText = tt('pnlShare.unavailable', '暂无可用数据');
  const metricLabel = tt(selectedDefinition.labelKey, selectedDefinition.labelFallback);
  const selectedPresentation = buildPnlShareMetricPresentation({
    summary: shareSnapshot.summary,
    metricId: selectedMetric,
    currency: displayCurrency,
    rate: displayRate,
    locale,
    unavailableText,
  });
  const { amountText, percentText, amountTone, percentTone } = selectedPresentation;
  const marketLabel = tt('pnlShare.usMarket', '美股市场');
  const imageTitle = tt('pnlShare.title', '收益分享');
  const accessibilityLabel = `${imageTitle} · ${metricLabel} · ${amountText} · ${percentText}`;
  const generatedAt = new Date(shareSnapshot.capturedAt);
  const generatedDateTime = generatedAt.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const generatedText = tt('pnlShare.generatedAt', '生成于 {{time}}', { time: generatedDateTime });
  const rawFileName = tt('pnlShare.fileName', 'Quote-{{metric}}-{{date}}.png', {
    metric: selectedMetric,
    date: localDateKey(generatedAt),
  });
  const fileName = safeFileName(rawFileName);
  const renderKey = [
    selectedMetric,
    displayCurrency,
    generatedText,
    marketLabel,
    metricLabel,
    amountText,
    percentText,
    amountTone,
    percentTone,
    fileName,
  ].join('\u0000');

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const version = renderVersionRef.current + 1;
    renderVersionRef.current = version;
    setShareAsset(null);
    setStatusKey('');

    try {
      renderPnlShareCanvas(canvas, {
        generatedText,
        marketLabel,
        metricLabel,
        amountText,
        percentText,
        amountTone,
        percentTone,
        accessibilityLabel,
      });

      canvasToPngBlob(canvas)
        .then((blob) => {
          if (!mountedRef.current || renderVersionRef.current !== version) return;
          setShareAsset({
            blob,
            file: createPnlSharePngFile(blob, fileName),
            fileName,
            renderKey,
            version,
          });
        })
        .catch(() => {
          if (!mountedRef.current || renderVersionRef.current !== version) return;
          setStatusKey('pnlShare.saveFailed');
        });
    } catch {
      setStatusKey('pnlShare.saveFailed');
      return undefined;
    }
    return undefined;
  }, [accessibilityLabel, amountText, amountTone, fileName, generatedText, marketLabel, metricLabel, percentText, percentTone, renderKey]);

  const downloadAsset = React.useCallback((asset) => {
    if (!asset?.blob || typeof document === 'undefined' || typeof URL === 'undefined') return false;
    try {
      const url = URL.createObjectURL(asset.blob);
      objectUrlsRef.current.add(url);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = asset.fileName;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        objectUrlsRef.current.delete(url);
      }, 1000);
      return true;
    } catch {
      return false;
    }
  }, []);

  const shareOrDownload = React.useCallback((action) => {
    const asset = shareAsset;
    if (!asset || asset.renderKey !== renderKey) {
      setStatusKey(action === 'share' ? 'pnlShare.shareFailed' : 'pnlShare.saveFailed');
      return;
    }

    if (canShareFile(asset.file)) {
      setStatusKey('');
      try {
        Promise.resolve(navigator.share({
          files: [asset.file],
          title: imageTitle,
        })).catch((error) => {
          if (!mountedRef.current || error?.name === 'AbortError') return;
          setStatusKey(action === 'share' ? 'pnlShare.shareFailed' : 'pnlShare.saveFailed');
        });
      } catch (error) {
        if (error?.name !== 'AbortError') {
          setStatusKey(action === 'share' ? 'pnlShare.shareFailed' : 'pnlShare.saveFailed');
        }
      }
      return;
    }

    const downloaded = downloadAsset(asset);
    setStatusKey(downloaded
      ? (action === 'share' ? 'pnlShare.shareUnavailable' : '')
      : (action === 'share' ? 'pnlShare.shareFailed' : 'pnlShare.saveFailed'));
  }, [downloadAsset, imageTitle, renderKey, shareAsset]);

  const ready = Boolean(shareAsset && shareAsset.renderKey === renderKey);
  const statusFallbacks = {
    'pnlShare.shareUnavailable': '当前浏览器不支持系统分享，已下载图片',
    'pnlShare.shareFailed': '分享失败，请稍后重试',
    'pnlShare.saveFailed': '图片保存失败，请稍后重试',
  };

  return (
    <main
      className="mx-auto min-h-screen w-full max-w-[430px] bg-[#05070b] px-4 pb-[calc(env(safe-area-inset-bottom)+28px)] text-white/[0.86]"
      style={{ fontFamily: NUMBER_FONT }}
      data-pnl-share-page="true"
    >
      <header className="sticky top-0 z-20 -mx-4 border-b border-white/[0.07] bg-[#05070b]/92 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl">
        <div className="grid grid-cols-[52px_1fr_52px] items-center">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.055] text-white/[0.72] transition active:scale-95"
            aria-label={tt('pnlShare.back', '返回交易')}
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.8} />
          </button>
          <h1 className="text-center text-[17px] font-semibold text-white/[0.9]">
            {imageTitle}
          </h1>
          <span aria-hidden="true" />
        </div>
      </header>

      <section className="pt-5">
        <div
          className="grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.045] p-1"
          role="group"
          aria-label={tt('pnlShare.selectMetric', '选择分享内容')}
        >
          {SHARE_METRICS.map((metric) => {
            const selected = metric.id === selectedMetric;
            return (
              <button
                key={metric.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedMetric(metric.id)}
                className={`h-10 rounded-xl px-1 text-[12px] transition active:scale-[0.98] ${selected
                  ? 'bg-white/[0.10] text-white/[0.92] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                  : 'text-white/[0.42]'}`}
              >
                {tt(metric.labelKey, metric.labelFallback)}
              </button>
            );
          })}
        </div>

        <div className="mt-5 overflow-hidden rounded-[24px] bg-[#090a0d] shadow-[0_20px_60px_rgba(0,0,0,0.34)]">
          <canvas
            ref={canvasRef}
            width={PNL_SHARE_IMAGE_WIDTH}
            height={PNL_SHARE_IMAGE_HEIGHT}
            className="block h-auto w-full"
            role="img"
            aria-label={`${tt('pnlShare.previewLabel', '收益分享图片预览')} · ${accessibilityLabel}`}
            data-pnl-share-canvas="true"
          />
        </div>

        <p className="mt-3 text-center text-[10px] leading-4 text-white/[0.34]">
          <span>{tt('pnlShare.imageSpec', '高清图片 · 1200 × 1600')}</span>
          <span aria-hidden="true"> · </span>
          <span>{ready
            ? tt('pnlShare.saveHint', '高清图片将在系统分享面板中提供保存选项')
            : tt('pnlShare.generating', '正在生成高清图片…')}</span>
        </p>

        {statusKey && (
          <p className="mt-2 text-center text-[11px] leading-4 text-white/[0.5]" role="status">
            {tt(statusKey, statusFallbacks[statusKey] || statusKey)}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={!ready}
            onClick={() => shareOrDownload('save')}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white/[0.075] text-[13px] font-medium text-white/[0.82] transition active:scale-[0.99] disabled:opacity-35"
          >
            {ready ? <Download className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <Loader2 className="h-[18px] w-[18px] animate-spin" strokeWidth={1.8} />}
            {ready ? tt('pnlShare.saveImage', '保存图片') : tt('pnlShare.generating', '正在生成…')}
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => shareOrDownload('share')}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#f6b54b] text-[13px] font-semibold text-[#121317] transition active:scale-[0.99] disabled:opacity-35"
          >
            {ready ? <Share2 className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <Loader2 className="h-[18px] w-[18px] animate-spin" strokeWidth={1.8} />}
            {ready ? tt('pnlShare.share', '分享') : tt('pnlShare.generating', '正在生成…')}
          </button>
        </div>
      </section>
    </main>
  );
}
