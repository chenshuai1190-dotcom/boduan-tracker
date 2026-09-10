import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyWatchlistOrder,
  createWatchlistReorderCommitter,
  createWatchlistReorderSession,
  watchlistAutoScrollDelta,
  watchlistKeyboardOrder,
  watchlistOrderKey,
  watchlistTargetAtY,
} from '../lib/watchlistReorder.js';

export function useWatchlistReorder({ rows, disabled = false, onReorder }) {
  const listRef = useRef(null);
  const latestRef = useRef({ rows, disabled, onReorder });
  latestRef.current = { rows, disabled, onReorder };
  const activeRef = useRef(null);
  const committerRef = useRef(null);
  if (!committerRef.current) committerRef.current = createWatchlistReorderCommitter();
  const mountedRef = useRef(true);
  const [preview, setPreview] = useState(null);
  const [draggingSymbol, setDraggingSymbol] = useState(null);
  const [isReordering, setIsReordering] = useState(false);
  const orderKey = watchlistOrderKey(rows);

  const detach = useCallback(() => {
    const active = activeRef.current;
    activeRef.current = null;
    active?.cleanup();
    return active;
  }, []);

  const cancel = useCallback(() => {
    const active = detach();
    active?.session.cancel();
    if (mountedRef.current) {
      setDraggingSymbol(null);
      setPreview(null);
    }
  }, [detach]);

  const commit = useCallback(async (nextRows) => {
    if (!nextRows || latestRef.current.disabled || committerRef.current.busy) return;
    const sourceKey = watchlistOrderKey(latestRef.current.rows);
    setPreview({ sourceKey, symbols: nextRows.map(row => String(row.symbol)) });
    setIsReordering(true);
    try {
      await committerRef.current.commit(nextRows, latestRef.current.onReorder);
    } catch {
      // The parent owns persistence and its success/failure feedback.
    } finally {
      if (mountedRef.current) {
        setPreview(null);
        setIsReordering(false);
      }
    }
  }, []);

  const start = useCallback((event, row) => {
    if (event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
    if (latestRef.current.disabled || committerRef.current.busy || activeRef.current || !listRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const session = createWatchlistReorderSession({ rows: latestRef.current.rows, symbol: row.symbol, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY });
    if (!session.active) return;
    const captureTarget = listRef.current;
    let lastX = event.clientX;
    let lastY = event.clientY;
    let rafId = 0;
    let lastFrame = 0;
    const updatePreview = () => {
      const elements = [...captureTarget.querySelectorAll('[data-watchlist-reorder-symbol]')];
      const rects = elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { symbol: element.getAttribute('data-watchlist-reorder-symbol'), top: rect.top, bottom: rect.bottom };
      });
      const latest = latestRef.current;
      const nextRows = session.move({ rows: latest.rows, disabled: latest.disabled, pointerId: session.pointerId, clientX: lastX, clientY: lastY, targetSymbol: watchlistTargetAtY(rects, lastY) });
      if (!session.active) { cancel(); return; }
      if (nextRows) {
        setDraggingSymbol(session.symbol);
        setPreview({ sourceKey: session.originalKey, symbols: session.symbols });
      }
    };
    const frame = (time) => {
      rafId = 0;
      if (activeRef.current?.session !== session || !session.dragging) return;
      const elapsedMs = lastFrame ? time - lastFrame : 16;
      lastFrame = time;
      const rect = captureTarget.getBoundingClientRect();
      const delta = watchlistAutoScrollDelta({ pointerY: lastY, top: Math.max(0, rect.top), bottom: Math.min(window.innerHeight, rect.bottom), elapsedMs });
      const before = captureTarget.scrollTop;
      const canScroll = delta < 0 ? before > 0 : delta > 0 && before + captureTarget.clientHeight < captureTarget.scrollHeight;
      if (canScroll) {
        captureTarget.scrollTop += delta;
        if (captureTarget.scrollTop !== before) updatePreview();
      }
      if (activeRef.current?.session === session) rafId = window.requestAnimationFrame(frame);
    };
    const move = nextEvent => {
      if (nextEvent.pointerId !== session.pointerId) return;
      lastX = nextEvent.clientX;
      lastY = nextEvent.clientY;
      updatePreview();
      if (session.dragging) {
        nextEvent.preventDefault();
        if (!rafId && activeRef.current?.session === session) rafId = window.requestAnimationFrame(frame);
      }
    };
    const finish = nextEvent => {
      if (nextEvent.pointerId !== session.pointerId || activeRef.current?.session !== session) return;
      detach();
      const latest = latestRef.current;
      const nextRows = session.finish({ rows: latest.rows, disabled: latest.disabled, pointerId: nextEvent.pointerId });
      setDraggingSymbol(null);
      if (nextRows) void commit(nextRows);
      else setPreview(null);
    };
    const abort = nextEvent => {
      if (nextEvent.pointerId === session.pointerId) cancel();
    };
    const keydown = nextEvent => {
      if (nextEvent.key !== 'Escape') return;
      nextEvent.preventDefault();
      nextEvent.stopPropagation();
      cancel();
    };
    const cleanup = () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', abort);
      window.removeEventListener('keydown', keydown, true);
      captureTarget.removeEventListener('lostpointercapture', abort);
      if (captureTarget.hasPointerCapture?.(session.pointerId)) captureTarget.releasePointerCapture(session.pointerId);
    };
    activeRef.current = { session, cleanup };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', abort);
    window.addEventListener('keydown', keydown, true);
    captureTarget.addEventListener('lostpointercapture', abort);
    try { captureTarget.setPointerCapture?.(session.pointerId); } catch { /* Window listeners retain the drag if capture is unavailable. */ }
  }, [cancel, commit, detach]);

  useEffect(() => {
    const active = activeRef.current;
    if (active && (disabled || active.session.originalKey !== orderKey)) cancel();
  }, [cancel, disabled, orderKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      detach()?.session.cancel();
    };
  }, [detach]);

  const getHandleProps = useCallback(row => ({
    type: 'button',
    disabled: disabled || isReordering,
    'aria-disabled': disabled || isReordering,
    'aria-pressed': draggingSymbol === String(row.symbol),
    style: { touchAction: 'none', cursor: draggingSymbol === String(row.symbol) ? 'grabbing' : 'grab' },
    onPointerDown: event => start(event, row),
    onClick: event => { event.preventDefault(); event.stopPropagation(); },
    onKeyDown: event => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (latestRef.current.disabled || committerRef.current.busy || activeRef.current) return;
      void commit(watchlistKeyboardOrder(latestRef.current.rows, row.symbol, event.key === 'ArrowUp' ? -1 : 1));
    },
  }), [commit, disabled, draggingSymbol, isReordering, start]);

  const orderedRows = preview && preview.sourceKey === orderKey ? applyWatchlistOrder(rows, preview.symbols) || rows : rows;
  return { orderedRows, draggingSymbol, listRef, getHandleProps, isReordering };
}
