import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';

function ConfirmIcon({ modal }) {
  if (React.isValidElement(modal.icon)) return modal.icon;
  if (modal.confirmStyle === 'danger') {
    return modal.icon === '🗑'
      ? <Trash2 className="h-[23px] w-[23px]" strokeWidth={1.65} />
      : <AlertTriangle className="h-[23px] w-[23px]" strokeWidth={1.65} />;
  }
  if (modal.icon === '!') return <AlertCircle className="h-[23px] w-[23px]" strokeWidth={1.65} />;
  return <CheckCircle2 className="h-[23px] w-[23px]" strokeWidth={1.65} />;
}

export default function ConfirmModal({
  modal,
  submitting = false,
  onCancel,
  onConfirm,
}) {
  if (!modal) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/[0.62] px-0 pb-5 pt-[34.5vh] backdrop-blur-[10px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) onCancel?.();
      }}
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={modal.title}
        className="w-[calc(100vw-76px)] max-w-[342px] rounded-[27px] border border-white/20 bg-[radial-gradient(circle_at_50%_0,rgba(43,47,59,0.20),transparent_35%),linear-gradient(158deg,rgba(22,25,33,0.98),rgba(10,12,18,0.985))] px-[18px] pb-6 pt-[13px] shadow-[0_30px_80px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.055)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-[23px] h-1 w-9 rounded-full bg-white/35 shadow-[0_0_9px_rgba(255,255,255,0.08)]" />

        <div className="mx-auto mb-6 flex h-[52px] w-[52px] items-center justify-center rounded-full border border-[#9fa9cb]/[0.14] bg-[#353b52]/[0.33] text-white/[0.66] shadow-[0_9px_20px_rgba(0,0,0,0.20),inset_0_1px_0_rgba(255,255,255,0.035)]">
          <ConfirmIcon modal={modal} />
        </div>

        <h2 className="text-center text-[20px] font-semibold leading-[27px] tracking-normal text-white/[0.92]">
          {modal.title}
        </h2>

        <div className="mx-auto mb-[22px] mt-4 max-w-[270px] text-center text-[13.5px] font-normal leading-6 text-white/[0.47]">
          {modal.desc}
        </div>

        {modal.info && (
          <div className="flex min-h-[62px] items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.025] px-3 text-center text-[14px] font-normal tracking-normal text-white/[0.55]">
            {modal.info}
          </div>
        )}

        <div className={`mt-[18px] grid gap-3 ${modal.showCancel ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {modal.showCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="h-[52px] rounded-[17px] border border-white/[0.11] bg-white/[0.045] text-[14px] font-medium tracking-normal text-white/[0.61] active:scale-95 disabled:opacity-55 disabled:active:scale-100"
            >
              {modal.cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className={`h-[52px] rounded-[17px] border text-[14px] font-medium tracking-normal active:scale-95 disabled:opacity-60 disabled:active:scale-100 ${
              modal.confirmStyle === 'danger'
                ? 'border-[#ff6a5d]/[0.64] bg-[linear-gradient(145deg,#a7232a,#8e1d24)] text-white/[0.89] shadow-[0_13px_27px_rgba(126,18,28,0.26),inset_0_1px_0_rgba(255,255,255,0.09)]'
                : 'border-[#f6b54b]/60 bg-[linear-gradient(145deg,#e3a13f,#b77220)] text-[#101318] shadow-[0_13px_27px_rgba(130,78,18,0.22),inset_0_1px_0_rgba(255,255,255,0.12)]'
            }`}
          >
            {submitting ? '处理中...' : modal.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
