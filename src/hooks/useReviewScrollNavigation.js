import { useEffect, useState } from 'react';

function scrollPosition(value, maximum = Infinity) {
  const max = Number.isFinite(maximum) ? Math.max(0, maximum) : Infinity;
  return Math.min(max, Math.max(0, Number.isFinite(value) ? value : 0));
}

// Accumulate movement in one direction so small finger movements do not flicker the bar.
export function createReviewScrollTracker(initialY = 0, maximum = Infinity) {
  let previous = scrollPosition(initialY, maximum);
  let direction = 0;
  let distance = 0;
  let hidden = false;
  return {
    reset(y = previous, max = Infinity) {
      previous = scrollPosition(y, max);
      direction = 0;
      distance = 0;
      hidden = false;
      return hidden;
    },
    update(y, max = Infinity) {
      const next = scrollPosition(y, max);
      const delta = next - scrollPosition(previous, max);
      previous = next;
      if (next <= 80) {
        direction = 0;
        distance = 0;
        hidden = false;
      } else if (delta) {
        const nextDirection = Math.sign(delta);
        distance = nextDirection === direction ? distance + Math.abs(delta) : Math.abs(delta);
        direction = nextDirection;
        if ((direction > 0 && distance >= 24) || (direction < 0 && distance >= 12)) {
          hidden = direction > 0;
        }
      }
      return hidden;
    },
  };
}

export default function useReviewScrollNavigation(enabled) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(false);
    if (!enabled || typeof window === 'undefined') return undefined;
    const maximum = () => Math.max(0, Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0) - window.innerHeight);
    const tracker = createReviewScrollTracker(window.scrollY, maximum());
    let frame = null;
    const update = () => {
      frame = null;
      setHidden(tracker.update(window.scrollY, maximum()));
    };
    const onScroll = event => {
      // A carousel or dialog scroll must never hide the main navigation.
      if (event.target !== document && event.target !== window) return;
      if (frame === null) frame = window.requestAnimationFrame(update);
    };
    const onKeyDown = event => {
      if (event.key !== 'Tab') return;
      setHidden(tracker.reset(window.scrollY, maximum()));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('keydown', onKeyDown);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [enabled]);
  return Boolean(enabled && hidden);
}
