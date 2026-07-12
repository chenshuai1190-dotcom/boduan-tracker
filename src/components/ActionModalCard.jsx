import React from 'react';
import { X } from 'lucide-react';

const ACTION_MODAL_BUTTON_CLASS = 'flex h-[46px] items-center justify-center rounded-full border border-white/[0.16] bg-black/[0.18] px-2 text-[14px] font-normal tracking-normal text-white/[0.43] shadow-[inset_0_1px_0_rgba(255,255,255,0.018)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-100 disabled:active:scale-100';

export default function ActionModalCard({
  title,
  closeLabel,
  onClose,
  children,
  actions = [],
  actionGridClassName = '',
  widthClassName = 'w-[calc(100vw-76px)] max-w-[360px]',
  panelClassName = '',
  contentClassName = '',
}) {
  const actionColumns = actionGridClassName || (actions.length === 1 ? 'grid-cols-1' : 'grid-cols-2');
  const [visualViewportFrame, setVisualViewportFrame] = React.useState(null);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return undefined;
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
  }, []);

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[100] flex h-[100dvh] items-center justify-center overflow-y-auto bg-black/[0.62] px-0 py-6 backdrop-blur-[10px]"
      onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 24px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)',
        ...(visualViewportFrame ? {
          top: visualViewportFrame.top,
          height: visualViewportFrame.height,
        } : {}),
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`min-h-[232px] ${widthClassName} rounded-[27px] flex max-h-full min-w-0 flex-col overflow-hidden border border-white/[0.17] bg-[linear-gradient(145deg,rgba(25,28,36,0.93),rgba(10,12,18,0.96)_58%,rgba(8,10,15,0.98))] px-[14px] pb-4 pt-[18px] shadow-[0_24px_66px_rgba(0,0,0,0.56),inset_0_1px_0_rgba(255,255,255,0.045)] ${panelClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-0.5 pb-4">
          <h2 className="text-[17px] font-normal leading-[30px] tracking-normal text-white/[0.87]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[31px] w-[31px] items-center justify-center rounded-full border border-white/10 bg-black/[0.28] text-white/[0.67] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] active:scale-90"
            aria-label={closeLabel}
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.7} />
          </button>
        </div>

        <div className={`min-h-[84px] min-w-0 max-w-full flex-1 overflow-y-auto overscroll-contain rounded-[13px] border border-white/[0.025] bg-[linear-gradient(112deg,rgba(20,23,31,0.78),rgba(14,16,23,0.52))] px-3 py-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.018)] ${contentClassName}`}>
          {children}
        </div>

        {actions.length > 0 && (
          <div className={`mt-4 grid shrink-0 gap-2.5 ${actionColumns}`}>
            {actions.map((action) => (
              <button
                key={action.key || action.label}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className={ACTION_MODAL_BUTTON_CLASS}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
