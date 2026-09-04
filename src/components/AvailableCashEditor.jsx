import React from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  Loader2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { t } from '../lib/i18n.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const RECENT_MOVEMENT_LIMIT = 3;
const ALL_MOVEMENT_LIMIT = 100;

function displayRate(currency, usdRate) {
  if (currency !== 'CNY') return 1;
  const rate = Number(usdRate);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function roundedInputAmount(value) {
  return String(Math.round(Number(value) * 100) / 100);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cashRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
  }
  return null;
}

function movementKind(movement) {
  const rawKind = String(
    movement?.kind
    || movement?.movement_kind
    || movement?.movementKind
    || movement?.type
    || '',
  ).toLowerCase();
  if (['transfer_in', 'deposit', 'in'].includes(rawKind)) return 'transfer_in';
  if (['transfer_out', 'withdrawal', 'withdraw', 'out'].includes(rawKind)) return 'transfer_out';
  return 'balance_adjustment';
}

function movementAmountUsd(movement) {
  return finiteNumber(
    movement?.amountUsd
    ?? movement?.amount_usd
    ?? movement?.deltaUsd
    ?? movement?.delta_usd,
  );
}

function movementBalanceUsd(movement) {
  return finiteNumber(
    movement?.balanceAfterUsd
    ?? movement?.balance_after_usd
    ?? movement?.cashUsd
    ?? movement?.cash_usd,
  );
}

function movementTimestamp(movement) {
  return movement?.occurredAt
    || movement?.occurred_at
    || movement?.createdAt
    || movement?.created_at
    || movement?.effectiveAt
    || movement?.effective_at
    || null;
}

function movementNote(movement) {
  const note = movement?.note ?? movement?.memo;
  return typeof note === 'string' ? note.trim() : '';
}

function movementResult(result, limit) {
  const payload = result?.data ?? result;
  const movements = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.movements)
      ? payload.movements
      : Array.isArray(payload?.items)
        ? payload.items
        : [];
  const explicitHasMore = payload && !Array.isArray(payload)
    ? payload.hasMore ?? payload.has_more
    : undefined;
  return {
    movements,
    hasMore: explicitHasMore === undefined ? movements.length >= limit : Boolean(explicitHasMore),
  };
}

function formatCash(valueUsd, rate, currency, language) {
  const numericValue = finiteNumber(valueUsd);
  if (numericValue === null || !rate) return '--';
  const symbol = currency === 'CNY' ? '¥' : '$';
  const locale = language === 'en' ? 'en-US' : 'zh-CN';
  return `${symbol}${(numericValue * rate).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatMovementTime(value, language) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function mutationFailed(result) {
  const status = String(result?.status ?? result?.data?.status ?? '').toLowerCase();
  return ['error', 'failed', 'rejected', 'conflict'].includes(status);
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
  onLoadCashMovements,
  onMutateCash,
  usdRate = 1,
}) {
  const [actionKind, setActionKind] = React.useState('overview');
  const [confirming, setConfirming] = React.useState(false);
  const [draftCash, setDraftCash] = React.useState('');
  const [note, setNote] = React.useState('');
  const [allOut, setAllOut] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');
  const [movements, setMovements] = React.useState([]);
  const [movementsLoading, setMovementsLoading] = React.useState(false);
  const [movementsError, setMovementsError] = React.useState('');
  const [movementsHaveMore, setMovementsHaveMore] = React.useState(false);
  const [showAllMovements, setShowAllMovements] = React.useState(false);
  const [visualViewportFrame, setVisualViewportFrame] = React.useState(null);
  const loadRequestRef = React.useRef(0);
  const loadCashMovementsRef = React.useRef(onLoadCashMovements);
  const mutationRequestIdRef = React.useRef('');
  const normalizedCurrency = currency === 'CNY' ? 'CNY' : 'USD';
  const currencySymbol = normalizedCurrency === 'CNY' ? '¥' : '$';
  const rate = displayRate(normalizedCurrency, usdRate);
  const currentCashUsd = Math.max(0, finiteNumber(availableCashUsd) ?? 0);
  const currentDisplayCash = rate ? currentCashUsd * rate : null;

  React.useEffect(() => {
    loadCashMovementsRef.current = onLoadCashMovements;
  }, [onLoadCashMovements]);

  const loadMovements = React.useCallback(async (limit) => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    const loadCashMovementRows = loadCashMovementsRef.current;
    if (typeof loadCashMovementRows !== 'function') {
      setMovements([]);
      setMovementsHaveMore(false);
      setMovementsError('');
      return;
    }

    setMovementsLoading(true);
    setMovementsError('');
    try {
      const result = movementResult(await loadCashMovementRows({ limit }), limit);
      if (loadRequestRef.current !== requestId) return;
      setMovements(result.movements);
      setMovementsHaveMore(result.hasMore);
    } catch {
      if (loadRequestRef.current !== requestId) return;
      setMovementsError(t(language, 'home.cashMovementsLoadFailed', '现金流水读取失败，请稍后重试'));
    } finally {
      if (loadRequestRef.current === requestId) setMovementsLoading(false);
    }
  }, [language]);

  React.useEffect(() => {
    if (!isOpen) {
      loadRequestRef.current += 1;
      return;
    }
    setActionKind('overview');
    setConfirming(false);
    setDraftCash('');
    setNote('');
    setAllOut(false);
    setSaveError('');
    setShowAllMovements(false);
    mutationRequestIdRef.current = '';
    void loadMovements(RECENT_MOVEMENT_LIMIT);
  }, [isOpen, loadMovements]);

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
      if (event.key === 'Escape' && !saving) {
        if (confirming) setConfirming(false);
        else if (actionKind !== 'overview') setActionKind('overview');
        else onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actionKind, confirming, isOpen, onClose, saving]);

  if (!isOpen) return null;

  const openAction = (kind) => {
    setActionKind(kind);
    setConfirming(false);
    setNote('');
    setAllOut(false);
    setSaveError('');
    mutationRequestIdRef.current = '';
    if (kind === 'balance_adjustment' && currentDisplayCash !== null) {
      setDraftCash(roundedInputAmount(currentDisplayCash));
    } else {
      setDraftCash('');
    }
  };

  const amountUsd = allOut && actionKind === 'transfer_out'
    ? currentCashUsd
    : availableCashDisplayToUsd({
      amount: draftCash,
      currency: normalizedCurrency,
      usdRate,
    });
  const afterCashUsd = amountUsd === null
    ? currentCashUsd
    : actionKind === 'transfer_in'
      ? currentCashUsd + amountUsd
      : actionKind === 'transfer_out'
        ? Math.max(0, currentCashUsd - amountUsd)
        : amountUsd;

  const actionTitle = actionKind === 'transfer_in'
    ? t(language, 'home.cashTransferIn', '资金转入')
    : actionKind === 'transfer_out'
      ? t(language, 'home.cashTransferOut', '资金转出')
      : t(language, 'home.cashBalanceAdjustment', '余额调整');
  const actionAmountLabel = actionKind === 'balance_adjustment'
    ? t(language, 'home.cashAdjustedBalance', '调整后余额')
    : t(language, 'home.cashMovementAmount', '变动金额');
  const afterBalanceLabel = actionKind === 'transfer_in'
    ? t(language, 'home.cashBalanceAfterTransferIn', '转入后余额')
    : actionKind === 'transfer_out'
      ? t(language, 'home.cashBalanceAfterTransferOut', '转出后余额')
      : t(language, 'home.cashAdjustedBalance', '调整后余额');

  const validationError = () => {
    if (amountUsd === null || (actionKind !== 'balance_adjustment' && amountUsd <= 0)) {
      return t(language, 'home.cashMovementInvalid', '请输入有效金额');
    }
    if (actionKind === 'transfer_out' && amountUsd > currentCashUsd + 0.000001) {
      return t(language, 'home.cashTransferOutInsufficient', '转出金额不能超过当前余额');
    }
    if (isSet && actionKind === 'balance_adjustment' && Math.abs(amountUsd - currentCashUsd) < 0.000001) {
      return t(language, 'home.cashBalanceUnchanged', '余额没有变化');
    }
    return '';
  };

  const reviewCashChange = () => {
    const nextError = validationError();
    if (nextError) {
      setSaveError(nextError);
      return;
    }
    if (typeof onMutateCash !== 'function') {
      setSaveError(t(language, 'home.cashMutationUnavailable', '现金记录暂不可用，请稍后重试'));
      return;
    }
    setSaveError('');
    if (!mutationRequestIdRef.current) mutationRequestIdRef.current = cashRequestId();
    if (!mutationRequestIdRef.current) {
      setSaveError(t(language, 'home.cashMutationUnavailable', '现金记录暂不可用，请稍后重试'));
      return;
    }
    if (
      typeof document !== 'undefined'
      && typeof HTMLElement !== 'undefined'
      && document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur();
    }
    setConfirming(true);
  };

  const saveCashChange = async () => {
    const nextError = validationError();
    if (nextError) {
      setSaveError(nextError);
      setConfirming(false);
      return;
    }
    if (typeof onMutateCash !== 'function') {
      setSaveError(t(language, 'home.cashMutationUnavailable', '现金记录暂不可用，请稍后重试'));
      setConfirming(false);
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      const requestId = mutationRequestIdRef.current || cashRequestId();
      if (!requestId) throw new Error('cash_request_id_unavailable');
      mutationRequestIdRef.current = requestId;
      const result = await onMutateCash({
        kind: actionKind,
        amountUsd,
        inputCurrency: normalizedCurrency,
        inputAmount: allOut && rate ? amountUsd * rate : Number(draftCash),
        usdRate: rate,
        note: note.trim(),
        ...(actionKind === 'transfer_out'
          ? { destinationLabel: 'bank_card' }
          : { destinationLabel: '' }),
        requestId,
      });
      if (mutationFailed(result)) throw new Error('cash_mutation_failed');
      onClose?.();
    } catch {
      setSaveError(t(language, 'home.cashMutationFailed', '保存现金记录失败，请稍后重试'));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  const closeOrBack = () => {
    if (saving) return;
    if (confirming) {
      setConfirming(false);
      return;
    }
    if (actionKind !== 'overview') {
      setActionKind('overview');
      setDraftCash('');
      setNote('');
      setAllOut(false);
      setSaveError('');
      mutationRequestIdRef.current = '';
      return;
    }
    onClose?.();
  };

  const visibleMovements = showAllMovements
    ? movements
    : movements.slice(0, RECENT_MOVEMENT_LIMIT);

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[190] flex h-[100dvh] items-end justify-center overflow-hidden bg-black/75 px-2 pb-2 pt-[calc(env(safe-area-inset-top)+18px)] backdrop-blur-[3px]"
      style={{
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        ...(visualViewportFrame ? {
          top: visualViewportFrame.top,
          height: visualViewportFrame.height,
        } : {}),
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t(language, 'home.cashManagement', '现金管理')}
      data-home-available-cash-editor="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose?.();
      }}
    >
      <section
        className="max-h-full w-full max-w-[430px] overflow-y-auto overscroll-contain rounded-[28px] bg-[#090a0c] px-5 pb-5 pt-3 shadow-[0_-30px_90px_rgba(0,0,0,0.76),inset_0_1px_0_rgba(255,255,255,0.055)]"
        style={{ scrollPaddingBottom: '112px', fontFamily: NUMBER_FONT }}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-white/25" />
        <div className="relative mt-3 flex min-h-11 items-center justify-center">
          {(actionKind !== 'overview' || confirming) && (
            <button
              type="button"
              disabled={saving}
              onClick={closeOrBack}
              className="absolute left-0 flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.06] text-white/55 active:scale-95 disabled:opacity-35"
              aria-label={t(language, 'home.cashBack', '返回')}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h2 className="text-[17px] font-medium text-white/90">
            {confirming
              ? t(language, 'home.cashConfirmChange', '确认现金变动')
              : actionKind === 'overview'
                ? t(language, 'home.cashManagement', '现金管理')
                : actionTitle}
          </h2>
          <button
            type="button"
            disabled={saving}
            onClick={() => onClose?.()}
            className="absolute right-0 flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.06] text-white/55 active:scale-95 disabled:opacity-35"
            aria-label={t(language, 'home.closeAvailableCash', '关闭现金管理')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {actionKind === 'overview' && !confirming && (
          <>
            <div className="mt-5 rounded-[22px] bg-white/[0.035] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
              <p className="text-[11px] text-white/42">
                {t(language, 'home.cashCurrentBalance', '当前余额')}
              </p>
              <div className="mt-1 flex items-end gap-2">
                <span className="text-[30px] font-medium tracking-[-0.025em] text-white/90 tabular-nums">
                  {formatCash(currentCashUsd, rate, normalizedCurrency, language)}
                </span>
                <span className="pb-1 text-[11px] text-white/35">{normalizedCurrency}</span>
              </div>
              {!isSet && (
                <p className="mt-1.5 text-[10px] text-white/35">
                  {t(language, 'home.cashNotSet', '尚未设置现金余额')}
                </p>
              )}
            </div>

            <p className="mt-4 text-[11px] leading-4 text-white/40">
              {t(language, 'home.cashManagementSubtitle', '记录现金进出与余额调整，不触碰交易账本。')}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                data-cash-mode="transfer_in"
                disabled={typeof onMutateCash !== 'function' || !rate}
                onClick={() => openAction('transfer_in')}
                className="flex min-h-[74px] flex-col items-center justify-center gap-2 rounded-2xl bg-white/[0.045] text-[11px] text-white/68 active:scale-[0.98] disabled:opacity-30"
              >
                <ArrowDownToLine className="h-[18px] w-[18px]" strokeWidth={1.7} />
                {t(language, 'home.cashTransferIn', '资金转入')}
              </button>
              <button
                type="button"
                data-cash-mode="transfer_out"
                disabled={typeof onMutateCash !== 'function' || currentCashUsd <= 0 || !rate}
                onClick={() => openAction('transfer_out')}
                className="flex min-h-[74px] flex-col items-center justify-center gap-2 rounded-2xl bg-white/[0.045] text-[11px] text-white/68 active:scale-[0.98] disabled:opacity-30"
              >
                <ArrowUpFromLine className="h-[18px] w-[18px]" strokeWidth={1.7} />
                {t(language, 'home.cashTransferOut', '资金转出')}
              </button>
              <button
                type="button"
                data-cash-mode="balance_adjustment"
                disabled={typeof onMutateCash !== 'function' || !rate}
                onClick={() => openAction('balance_adjustment')}
                className="flex min-h-[74px] flex-col items-center justify-center gap-2 rounded-2xl bg-white/[0.045] text-[11px] text-white/68 active:scale-[0.98] disabled:opacity-30"
              >
                <SlidersHorizontal className="h-[18px] w-[18px]" strokeWidth={1.7} />
                {t(language, 'home.cashBalanceAdjustment', '余额调整')}
              </button>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <h3 className="text-[13px] font-medium text-white/72">
                {showAllMovements
                  ? t(language, 'home.cashAllMovements', '全部流水')
                  : t(language, 'home.cashRecentMovements', '最近流水')}
              </h3>
              {(showAllMovements || movementsHaveMore) && (
                <button
                  type="button"
                  disabled={movementsLoading}
                  onClick={() => {
                    if (showAllMovements) {
                      setShowAllMovements(false);
                      return;
                    }
                    setShowAllMovements(true);
                    void loadMovements(ALL_MOVEMENT_LIMIT);
                  }}
                  className="flex min-h-11 items-center text-[11px] text-[#f6bd63]/80 active:opacity-60 disabled:opacity-35"
                >
                  {showAllMovements
                    ? t(language, 'home.cashCollapseMovements', '收起')
                    : t(language, 'home.cashViewAllMovements', '查看全部')}
                </button>
              )}
            </div>

            <div className="mt-2 rounded-[20px] bg-white/[0.026] px-4">
              {movementsLoading && visibleMovements.length === 0 && (
                <div className="flex min-h-20 items-center justify-center gap-2 text-[11px] text-white/36">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t(language, 'home.cashMovementsLoading', '读取流水中…')}
                </div>
              )}
              {!movementsLoading && !movementsError && visibleMovements.length === 0 && (
                <div className="flex min-h-20 items-center justify-center text-[11px] text-white/32">
                  {t(language, 'home.cashMovementsEmpty', '暂无现金流水')}
                </div>
              )}
              {movementsError && (
                <div className="flex min-h-20 items-center justify-between gap-3 py-3">
                  <span className="text-[11px] leading-4 text-white/38">{movementsError}</span>
                  <button
                    type="button"
                    onClick={() => void loadMovements(showAllMovements ? ALL_MOVEMENT_LIMIT : RECENT_MOVEMENT_LIMIT)}
                    className="shrink-0 rounded-full bg-white/[0.055] px-3 py-1.5 text-[10px] text-white/60 active:scale-95"
                  >
                    {t(language, 'home.cashMovementsRetry', '重试')}
                  </button>
                </div>
              )}
              {!movementsError && visibleMovements.map((movement, index) => {
                const kind = movementKind(movement);
                const amount = movementAmountUsd(movement);
                const balance = movementBalanceUsd(movement);
                const signedAmount = kind === 'transfer_out' ? -(Math.abs(amount ?? 0)) : Math.abs(amount ?? 0);
                const rowTitle = kind === 'transfer_in'
                  ? t(language, 'home.cashTransferIn', '资金转入')
                  : kind === 'transfer_out'
                    ? t(language, 'home.cashTransferOut', '资金转出')
                    : t(language, 'home.cashBalanceAdjustment', '余额调整');
                const noteText = movementNote(movement);
                const bankCardText = kind === 'balance_adjustment'
                  ? ''
                  : t(language, 'home.cashBankCard', '银行卡');
                return (
                  <div
                    key={movement?.id ?? movement?.requestId ?? movement?.request_id ?? `${movementTimestamp(movement) || 'cash'}-${index}`}
                    className="flex min-h-[66px] items-center justify-between gap-3 border-b border-white/[0.055] py-3 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="text-[12px] text-white/68">{rowTitle}</p>
                      <p className="mt-0.5 truncate text-[10px] text-white/32">
                        {[formatMovementTime(movementTimestamp(movement), language), bankCardText, noteText].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[12px] text-white/72 tabular-nums">
                        {kind === 'balance_adjustment' || amount === null
                          ? formatCash(balance ?? amount, rate, normalizedCurrency, language)
                          : `${signedAmount >= 0 ? '+' : '-'}${formatCash(Math.abs(signedAmount), rate, normalizedCurrency, language)}`}
                      </p>
                      {balance !== null && kind !== 'balance_adjustment' && (
                        <p className="mt-0.5 text-[10px] text-white/30 tabular-nums">
                          {t(language, 'home.cashMovementBalance', '余额 {{amount}}', {
                            amount: formatCash(balance, rate, normalizedCurrency, language),
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {actionKind !== 'overview' && !confirming && (
          <>
            <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3">
              <span className="text-[11px] text-white/38">
                {t(language, 'home.cashCurrentBalance', '当前余额')}
              </span>
              <span className="text-[14px] text-white/76 tabular-nums">
                {formatCash(currentCashUsd, rate, normalizedCurrency, language)} {normalizedCurrency}
              </span>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <label htmlFor="home-available-cash-input" className="text-[12px] text-white/48">
                {t(language, 'home.cashAmountWithCurrency', '{{label}}（{{currency}}）', {
                  label: actionAmountLabel,
                  currency: normalizedCurrency,
                })}
              </label>
              {actionKind === 'transfer_out' && (
                <button
                  type="button"
                  disabled={saving || currentCashUsd <= 0 || !rate}
                  onClick={() => {
                    setAllOut(true);
                    setDraftCash(currentDisplayCash === null ? '' : roundedInputAmount(currentDisplayCash));
                    setSaveError('');
                    mutationRequestIdRef.current = '';
                  }}
                  className="min-h-11 rounded-full bg-white/[0.055] px-3 text-[10px] text-white/55 active:scale-95 disabled:opacity-30"
                >
                  {t(language, 'home.cashTransferAll', '全部转出')}
                </button>
              )}
            </div>
            <div className="mt-2 flex h-14 items-center rounded-2xl bg-white/[0.055] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] focus-within:bg-white/[0.075]">
              <span className="mr-2 text-[20px] text-white/48">{currencySymbol}</span>
              <input
                id="home-available-cash-input"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                value={draftCash}
                disabled={saving}
                onChange={(event) => {
                  const nextValue = event.target.value.trim().replace(/,/g, '');
                  setAllOut(false);
                  mutationRequestIdRef.current = '';
                  if (nextValue === '' || /^\d*(?:\.\d*)?$/.test(nextValue)) {
                    setDraftCash(nextValue);
                    setSaveError('');
                  } else {
                    setSaveError(t(language, 'home.cashMovementInvalid', '请输入有效金额'));
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

            <div className="mt-3 flex items-center justify-between px-1">
              <span className="text-[11px] text-white/34">
                {afterBalanceLabel}
              </span>
              <span className="text-[14px] text-white/68 tabular-nums">
                {formatCash(afterCashUsd, rate, normalizedCurrency, language)} {normalizedCurrency}
              </span>
            </div>

            <div className="mt-5">
              <label htmlFor="home-available-cash-note" className="text-[11px] text-white/42">
                {t(language, 'home.cashNote', '备注（可选）')}
              </label>
              <input
                id="home-available-cash-note"
                type="text"
                autoComplete="off"
                enterKeyHint="done"
                maxLength={80}
                value={note}
                disabled={saving}
                onChange={(event) => {
                  setNote(event.target.value);
                  mutationRequestIdRef.current = '';
                }}
                onFocus={(event) => {
                  const input = event.currentTarget;
                  window.setTimeout(() => input.scrollIntoView({ block: 'center', behavior: 'smooth' }), 180);
                }}
                placeholder={actionKind === 'balance_adjustment'
                  ? t(language, 'home.cashAdjustmentNotePlaceholder', '请说明调整原因')
                  : t(language, 'home.cashTransferNotePlaceholder', '例如：生活备用金')}
                className="mt-2 h-11 w-full rounded-xl bg-white/[0.045] px-3 text-[16px] text-white/70 outline-none placeholder:text-white/24 focus:bg-white/[0.065] disabled:opacity-45"
              />
            </div>

            {saveError && (
              <p className="mt-3 rounded-xl bg-rose-300/[0.07] px-3 py-2 text-[11px] leading-4 text-rose-200/80" role="alert">
                {saveError}
              </p>
            )}
            <p className="mt-4 text-center text-[10px] leading-4 text-white/32">
              {actionKind === 'balance_adjustment'
                ? t(language, 'home.cashAdjustmentHint', '余额调整用于校准当前现金，不计作资金转入或转出。')
                : t(language, 'home.cashTransferHint', '这里只记录现金变动，不会发起真实银行转账，也不会计入股票盈亏。')}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={closeOrBack}
                className="h-11 rounded-xl bg-white/[0.045] text-[13px] text-white/52 active:scale-[0.99] disabled:opacity-35"
              >
                {t(language, 'home.cancel', '取消')}
              </button>
              <button
                type="button"
                disabled={saving || typeof onMutateCash !== 'function'}
                onClick={reviewCashChange}
                className="h-11 rounded-xl bg-[#f6b54b] text-[13px] font-medium text-[#101318] active:scale-[0.99] disabled:opacity-35"
              >
                {t(language, 'home.cashContinue', '继续')}
              </button>
            </div>
          </>
        )}

        {actionKind !== 'overview' && confirming && (
          <>
            <p className="mt-2 text-center text-[11px] text-white/38">
              {actionKind === 'balance_adjustment'
                ? t(language, 'home.cashAdjustmentOnly', '仅用于修正')
                : `${actionTitle} · ${t(language, 'home.cashBankCard', '银行卡')}`}
            </p>
            <div className="mt-5 rounded-[22px] bg-white/[0.035] px-4">
              <div className="flex min-h-[52px] items-center justify-between border-b border-white/[0.055]">
                <span className="text-[11px] text-white/38">
                  {t(language, 'home.cashCurrentBalance', '当前余额')}
                </span>
                <span className="text-[13px] text-white/70 tabular-nums">
                  {formatCash(currentCashUsd, rate, normalizedCurrency, language)}
                </span>
              </div>
              <div className="flex min-h-[52px] items-center justify-between border-b border-white/[0.055]">
                <span className="text-[11px] text-white/38">{actionAmountLabel}</span>
                <span className="text-[13px] text-white/78 tabular-nums">
                  {actionKind === 'transfer_in' ? '+' : actionKind === 'transfer_out' ? '-' : ''}
                  {formatCash(amountUsd, rate, normalizedCurrency, language)}
                </span>
              </div>
              <div className="flex min-h-[58px] items-center justify-between">
                <span className="text-[11px] text-white/42">
                  {afterBalanceLabel}
                </span>
                <span className="text-[17px] font-medium text-white/88 tabular-nums">
                  {formatCash(afterCashUsd, rate, normalizedCurrency, language)} {normalizedCurrency}
                </span>
              </div>
            </div>
            {note.trim() && (
              <p className="mt-3 break-words px-1 text-[10px] leading-4 text-white/34">
                {t(language, 'home.cashNoteSummary', '备注：{{note}}', { note: note.trim() })}
              </p>
            )}
            {saveError && (
              <p className="mt-3 rounded-xl bg-rose-300/[0.07] px-3 py-2 text-[11px] leading-4 text-rose-200/80" role="alert">
                {saveError}
              </p>
            )}
            <p className="mt-4 text-center text-[10px] leading-4 text-white/32">
              {t(language, 'home.cashConfirmHint', '确认后将写入现金流水，并同步更新资产口径。')}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirming(false)}
                className="h-11 rounded-xl bg-white/[0.045] text-[13px] text-white/52 active:scale-[0.99] disabled:opacity-35"
              >
                {t(language, 'home.cashBackToEdit', '返回修改')}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={saveCashChange}
                data-available-cash-mutate="true"
                data-home-available-cash-save="true"
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#f6b54b] text-[13px] font-medium text-[#101318] active:scale-[0.99] disabled:opacity-55"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {saving
                  ? t(language, 'home.availableCashSaving', '保存中…')
                  : t(language, 'home.cashConfirm', '确认')}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
