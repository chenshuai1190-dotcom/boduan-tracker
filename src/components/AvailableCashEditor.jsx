import React from 'react';
import { Loader2, X } from 'lucide-react';
import { t } from '../lib/i18n.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';

function displayRate(currency, usdRate) {
  if (currency !== 'CNY') return 1;
  const rate = Number(usdRate);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function roundedInputAmount(value) {
  return String(Math.round(Number(value) * 100) / 100);
}

export function availableCashDisplayToUsd({ amount, currency = 'USD', usdRate = 1 } = {}) {
  if (amount === '' || amount === null || amount === undefined) return null;
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount < 0) return null;
  const rate = displayRate(currency, usdRate);
  return rate ? numericAmount / rate : null;
}

export default function AvailableCashEditor({
  availableCashUsd = 0,
  currency = 'USD',
  isOpen = false,
  isSet = false,
  language = 'zh',
  onClose,
  onSave,
  usdRate = 1,
}) {
  const [draftCash, setDraftCash] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');
  const [visualViewportFrame, setVisualViewportFrame] = React.useState(null);
  const normalizedCurrency = currency === 'CNY' ? 'CNY' : 'USD';
  const currencySymbol = normalizedCurrency === 'CNY' ? '¥' : '$';

  React.useEffect(() => {
    if (!isOpen) return;
    const rate = displayRate(normalizedCurrency, usdRate);
    setDraftCash(isSet && rate ? roundedInputAmount(Number(availableCashUsd) * rate) : '');
    setSaveError('');
  }, [availableCashUsd, isOpen, isSet, normalizedCurrency, usdRate]);

  React.useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen || typeof window === 'undefined' || !window.visualViewport) return undefined;
    const viewport = window.visualViewport;
    let rafId = 0;
    const updateFrame = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        const viewportHeight = Number(viewport.height) > 0
          ? Number(viewport.height)
          : Number(window.innerHeight) || 0;
        setVisualViewportFrame({
          top: `${Math.max(0, viewport.offsetTop || 0)}px`,
          height: viewportHeight > 0 ? `${viewportHeight}px` : '100dvh',
        });
      });
    };
    updateFrame();
    viewport.addEventListener('resize', updateFrame);
    viewport.addEventListener('scroll', updateFrame);
    window.addEventListener('orientationchange', updateFrame);
    return () => {
      window.cancelAnimationFrame(rafId);
      viewport.removeEventListener('resize', updateFrame);
      viewport.removeEventListener('scroll', updateFrame);
      window.removeEventListener('orientationchange', updateFrame);
    };
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !saving) onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, saving]);

  if (!isOpen) return null;

  const saveCash = async () => {
    const nextCashUsd = availableCashDisplayToUsd({
      amount: draftCash,
      currency: normalizedCurrency,
      usdRate,
    });
    if (nextCashUsd === null) {
      setSaveError(t(language, 'home.availableCashInvalid', '请输入不小于 0 的有效金额'));
      return;
    }
    if (typeof onSave !== 'function') {
      setSaveError(t(language, 'home.availableCashSaveFailed', '保存失败，请稍后重试'));
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      await onSave(nextCashUsd);
      onClose?.();
    } catch {
      setSaveError(t(language, 'home.availableCashSaveFailed', '保存失败，请稍后重试'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[190] flex h-[100dvh] items-end justify-center overflow-hidden bg-black/72 px-2 pb-2 pt-[calc(env(safe-area-inset-top)+18px)] backdrop-blur-[3px]"
      style={{
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        ...(visualViewportFrame ? {
          top: visualViewportFrame.top,
          height: visualViewportFrame.height,
        } : {}),
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t(language, 'home.availableCashBalance', '设置可用现金')}
      data-home-available-cash-editor="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose?.();
      }}
    >
      <section
        className="max-h-full w-full max-w-[430px] overflow-y-auto overscroll-contain rounded-[28px] border border-white/10 bg-[linear-gradient(165deg,rgba(23,27,34,0.99),rgba(11,15,20,0.995)_66%)] px-5 pb-5 pt-3 shadow-[0_-28px_80px_rgba(0,0,0,0.68),inset_0_1px_0_rgba(255,255,255,0.06)]"
        style={{ scrollPaddingBottom: '96px', fontFamily: NUMBER_FONT }}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-white/30" />
        <div className="relative mt-3 flex min-h-9 items-center justify-center">
          <h2 className="text-[17px] font-medium text-white/90">
            {t(language, 'home.availableCashBalance', '设置可用现金')}
          </h2>
          <button
            type="button"
            disabled={saving}
            onClick={() => onClose?.()}
            className="absolute right-0 flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.07] text-white/55 active:scale-95 disabled:opacity-35"
            aria-label={t(language, 'home.closeAvailableCash', '关闭可用现金设置')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-0.5 text-center text-[12px] text-white/50">
          {t(language, 'home.availableCashSubtitle', '现金计入总资产，并同步更新净资产与杠杆')}
        </p>

        <div className="mt-5 flex items-center justify-between">
          <label htmlFor="home-available-cash-input" className="text-[12px] text-white/50">
            {t(language, 'home.availableCashLabel', '可用现金（{{currency}}）', { currency: normalizedCurrency })}
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setDraftCash('0');
              setSaveError('');
            }}
            className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] text-white/48 active:scale-95 disabled:opacity-35"
          >
            {t(language, 'home.availableCashSetZero', '设为 0')}
          </button>
        </div>
        <div className="mt-2 flex h-14 items-center rounded-2xl border border-[#f6b54b]/35 bg-black/20 px-4 focus-within:border-[#f6b54b]/70">
          <span className="mr-2 text-[21px] text-[#ffd18a]">{currencySymbol}</span>
          <input
            id="home-available-cash-input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={draftCash}
            disabled={saving}
            onChange={(event) => {
              const nextValue = event.target.value.trim().replace(/,/g, '');
              if (nextValue === '' || /^\d*(?:\.\d*)?$/.test(nextValue)) {
                setDraftCash(nextValue);
                setSaveError('');
              } else {
                setSaveError(t(language, 'home.availableCashInvalid', '请输入不小于 0 的有效金额'));
              }
            }}
            onFocus={(event) => {
              const input = event.currentTarget;
              window.setTimeout(() => input.scrollIntoView({ block: 'center', behavior: 'smooth' }), 180);
            }}
            className="min-w-0 flex-1 bg-transparent text-[24px] font-medium text-white/90 outline-none tabular-nums disabled:opacity-45"
            style={{ fontFamily: NUMBER_FONT }}
          />
        </div>

        {saveError && (
          <p className="mt-3 rounded-xl border border-rose-300/15 bg-rose-300/[0.07] px-3 py-2 text-[11px] leading-4 text-rose-200/80" role="alert">
            {saveError}
          </p>
        )}
        <p className="mt-4 text-center text-[11px] leading-4 text-white/40">
          {t(language, 'home.availableCashBoundary', '可用现金只影响资产口径，不改变交易、收益计算或比赛。')}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => onClose?.()}
            className="h-11 rounded-xl border border-white/[0.09] bg-white/[0.035] text-[13px] text-white/55 active:scale-[0.99] disabled:opacity-35"
          >
            {t(language, 'home.cancel', '取消')}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={saveCash}
            data-home-available-cash-save="true"
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#f6b54b] text-[13px] font-medium text-[#101318] active:scale-[0.99] disabled:opacity-55"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving
              ? t(language, 'home.availableCashSaving', '保存中…')
              : t(language, 'home.availableCashSave', '保存')}
          </button>
        </div>
      </section>
    </div>
  );
}
