import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './TechnicalExplanationSheet.css';

const DISMISS_DISTANCE = 80;
const SCROLL_TOP_TOLERANCE = 1;
const FOCUSABLE = 'button:not(:disabled),summary,a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]';

export function startTechnicalSheetGesture(x, y, scrollTop = 0) {
  return { x, y, cancelled: scrollTop > SCROLL_TOP_TOLERANCE };
}

export function updateTechnicalSheetGesture(gesture, x, y, scrollTop = 0) {
  if (!gesture) return;
  if (scrollTop > SCROLL_TOP_TOLERANCE || y - gesture.y < -8 || Math.abs(x - gesture.x) > 30) {
    gesture.cancelled = true;
  }
}

export function shouldDismissTechnicalSheet(gesture, x, y, scrollTop = 0) {
  return Boolean(gesture && !gesture.cancelled && scrollTop <= SCROLL_TOP_TOLERANCE
    && y - gesture.y >= DISMISS_DISTANCE && y - gesture.y > Math.abs(x - gesture.x) * 1.5);
}

/** Local dialog access/scroll ownership, matching PortfolioOverlapSheet. */
export function attachTechnicalExplanationAccess(dialog, onClose, doc = document, win = window) {
  const trigger = doc.activeElement;
  const bodyStyle = doc.body.style;
  const htmlStyle = doc.documentElement.style;
  const ownsScrollLock = bodyStyle.position !== 'fixed';
  const scrollX = win.scrollX || win.pageXOffset || 0;
  const scrollY = win.scrollY || win.pageYOffset || 0;
  const previousBody = Object.fromEntries(['overflow', 'position', 'top', 'left', 'right', 'width'].map(key => [key, bodyStyle[key]]));
  const previousHtml = Object.fromEntries(['overflow', 'overscrollBehavior', 'scrollBehavior'].map(key => [key, htmlStyle[key]]));
  if (ownsScrollLock) {
    Object.assign(bodyStyle, { overflow: 'hidden', position: 'fixed', top: `-${scrollY}px`, left: '0', right: '0', width: '100%' });
    Object.assign(htmlStyle, { overflow: 'hidden', overscrollBehavior: 'none', scrollBehavior: 'auto' });
  }
  const allDialogs = () => [...doc.querySelectorAll('[role="dialog"][aria-modal="true"]')];
  const isTopDialog = () => allDialogs().at(-1) === dialog;
  const focusable = () => [...dialog.querySelectorAll(FOCUSABLE)].filter(node => !node.hidden && node.getClientRects().length);
  const focus = node => node?.focus({ preventScroll: true });
  const frame = win.requestAnimationFrame(() => { if (isTopDialog()) focus(focusable()[0] || dialog); });
  const keydown = event => {
    if (!isTopDialog()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const targets = focusable();
    const first = targets[0], last = targets.at(-1);
    if (!first) { event.preventDefault(); focus(dialog); return; }
    if (event.shiftKey && (doc.activeElement === first || doc.activeElement === dialog || !dialog.contains(doc.activeElement))) {
      event.preventDefault(); focus(last);
    } else if (!event.shiftKey && (doc.activeElement === last || doc.activeElement === dialog || !dialog.contains(doc.activeElement))) {
      event.preventDefault(); focus(first);
    }
  };
  doc.addEventListener('keydown', keydown, true);
  return () => {
    win.cancelAnimationFrame(frame);
    doc.removeEventListener('keydown', keydown, true);
    if (dialog.contains(doc.activeElement)) doc.activeElement.blur?.();
    if (ownsScrollLock) {
      Object.assign(bodyStyle, previousBody);
      Object.assign(htmlStyle, { ...previousHtml, scrollBehavior: 'auto' });
      win.scrollTo(scrollX, scrollY);
      htmlStyle.scrollBehavior = previousHtml.scrollBehavior;
    }
    if (!allDialogs().some(node => node !== dialog) && trigger?.isConnected) focus(trigger);
  };
}

function ExplanationSection({ title, lines }) {
  if (!lines?.length) return null;
  return <section className="tes-section"><h3>{title}</h3>{(lines || []).map((line, index) => <p key={index}>{line}</p>)}</section>;
}

function ExplanationValues({ rows }) {
  if (!rows?.length) return null;
  return <dl className="tes-values">{rows.map((row, index) => <div key={index} className={row.layout === 'narrative' ? 'tes-value-narrative' : undefined}><dt>{row.label}</dt><dd>{row.value ?? '—'}</dd></div>)}</dl>;
}

function ExplanationDetails({ title, content, type }) {
  if (!content?.rows?.length && !content?.lines?.length && !content?.scoreBreakdown?.rows?.length) return null;
  return <details className="tes-details" data-technical-details={type}>
    <summary>{title}<span aria-hidden="true">›</span></summary>
    <div className="tes-details-content">
      <ExplanationValues rows={content.rows} />
      {content.lines?.map((line, index) => <p key={index}>{line}</p>)}
      {content.scoreBreakdown?.rows?.length > 0 && <section className="tes-section">
        <h3>{content.scoreBreakdown.title}</h3>
        <ExplanationValues rows={content.scoreBreakdown.rows} />
      </section>}
    </div>
  </details>;
}

export default function TechnicalExplanationSheet({ ticker, explanation, onClose, language = 'zh' }) {
  const dialogRef = React.useRef(null);
  const gestureRef = React.useRef(null);
  const backdropPressRef = React.useRef(false);
  const closeRef = React.useRef(onClose);
  const closingRef = React.useRef(false);
  const titleId = React.useId();
  closeRef.current = onClose;
  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    closeRef.current?.();
  };
  const hasExplanation = Boolean(explanation);
  React.useEffect(() => {
    if (!hasExplanation || !dialogRef.current) return undefined;
    closingRef.current = false;
    return attachTechnicalExplanationAccess(dialogRef.current, close);
  }, [hasExplanation]);
  if (!explanation || typeof document === 'undefined') return null;

  const english = language === 'en';
  const labels = english
    ? { close: 'Close explanation', status: 'Key data', why: 'Basis', plain: 'How to read it', current: 'Current assessment', limits: 'Note', rules: 'View rule details', event: 'View event details', incomplete: 'Current data is insufficient to provide a complete technical explanation.' }
    : { close: '关闭指标说明', status: '关键数据', why: '判断依据', plain: '怎么理解', current: '当前怎么看', limits: '注意', rules: '查看规则详情', event: '查看事件详情', incomplete: '当前数据不足，暂时无法生成完整技术解释。' };
  const finishGesture = (x, y, scrollTop = 0) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (shouldDismissTechnicalSheet(gesture, x, y, scrollTop)) close();
  };

  return createPortal(
    <div className="tes-overlay"
      onPointerDown={event => { backdropPressRef.current = event.target === event.currentTarget; }}
      onClick={event => { if (event.target === event.currentTarget && backdropPressRef.current) close(); }}>
      <div className="tes-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef}>
        <div className="tes-grab-area" aria-hidden="true"
          onPointerDown={event => {
            if (event.isPrimary === false || event.button > 0) return;
            gestureRef.current = startTechnicalSheetGesture(event.clientX, event.clientY);
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onPointerMove={event => updateTechnicalSheetGesture(gestureRef.current, event.clientX, event.clientY)}
          onPointerUp={event => finishGesture(event.clientX, event.clientY)}
          onPointerCancel={() => { gestureRef.current = null; }}><span /></div>
        <header className="tes-header">
          <div><span className="tes-ticker">{ticker}</span><h2 id={titleId}>{explanation.title}</h2></div>
          <button className="tes-close" type="button" aria-label={labels.close} onClick={close}><X size={18} strokeWidth={1.6} aria-hidden="true" /></button>
        </header>
        <div className="tes-content"
          onTouchStart={event => {
            const touch = event.touches.length === 1 ? event.touches[0] : null;
            gestureRef.current = touch ? startTechnicalSheetGesture(touch.clientX, touch.clientY, event.currentTarget.scrollTop) : null;
          }}
          onTouchMove={event => {
            if (event.touches.length !== 1) { gestureRef.current = null; return; }
            const touch = event.touches[0];
            updateTechnicalSheetGesture(gestureRef.current, touch.clientX, touch.clientY, event.currentTarget.scrollTop);
          }}
          onTouchEnd={event => {
            const touch = event.changedTouches[0];
            if (touch) finishGesture(touch.clientX, touch.clientY, event.currentTarget.scrollTop);
          }}
          onTouchCancel={() => { gestureRef.current = null; }}>
          <section className="tes-current">
            {explanation.summary
              ? <p className="tes-summary">{explanation.summary}</p>
              : <div className="tes-status">{explanation.status || '—'}</div>}
            {explanation.asOfDate && <div className="tes-date">{explanation.asOfDate}</div>}
            {explanation.incomplete && <p className="tes-incomplete">{labels.incomplete}</p>}
            <div className="tes-section-label">{labels.status}</div>
            <ExplanationValues rows={explanation.rows} />
          </section>
          <ExplanationSection title={labels.why} lines={explanation.why} />
          <ExplanationSection title={labels.current} lines={explanation.currentView} />
          <ExplanationSection title={labels.plain} lines={explanation.plain} />
          <ExplanationSection title={labels.limits} lines={explanation.doesNotMean} />
          <ExplanationDetails title={labels.event} content={explanation.eventDetails} type="event" />
          <ExplanationDetails title={labels.rules} content={explanation.ruleDetails} type="rules" />
        </div>
      </div>
    </div>, document.body,
  );
}
