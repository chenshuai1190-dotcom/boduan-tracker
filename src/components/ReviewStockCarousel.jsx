import React from 'react';
import ReviewStockReplay from './ReviewStockReplay.jsx';
import './ReviewStockCarousel.css';

function StockCarousel({ symbols, recordDate, stockTrades, userId, language, previewHistory }) {
  const track = React.useRef(null);
  const navigation = React.useRef(null);
  const gesture = React.useRef(null);
  const selected = React.useRef(0);
  const [active, setActive] = React.useState(0);
  const english = language?.startsWith('en');
  const multiple = symbols.length > 1;
  const update = index => {
    selected.current = index;
    setActive(index);
  };
  const moveTo = (index, behavior = 'smooth') => {
    const next = Math.max(0, Math.min(symbols.length - 1, index));
    const node = track.current;
    const slide = node?.children[next];
    if (!slide) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    node.scrollTo({ left: slide.offsetLeft, behavior: reduceMotion ? 'auto' : behavior });
    update(next);
  };
  React.useEffect(() => {
    if (!multiple || !window.ResizeObserver || !track.current) return undefined;
    const observer = new window.ResizeObserver(() => moveTo(selected.current, 'auto'));
    observer.observe(track.current);
    return () => observer.disconnect();
  }, [multiple, symbols.length]);
  const replay = symbol => <ReviewStockReplay symbol={symbol} recordDate={recordDate} stockTrades={stockTrades} userId={userId} language={language} previewHistory={previewHistory} />;
  if (!multiple) return <div data-rj-interactive onClick={event => event.stopPropagation()}>{replay(symbols[0])}</div>;
  return <section className="rsc-carousel" data-rj-interactive aria-label={english ? 'Stock charts' : '股票走势'} onClick={event => event.stopPropagation()} onKeyDown={event => {
    // Replay dialogs use portals; their chart keys must not page this carousel.
    if (!event.currentTarget.contains(event.target)) return;
    gesture.current = null;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault(); event.stopPropagation();
    const next = Math.max(0, Math.min(symbols.length - 1, selected.current + (event.key === 'ArrowRight' ? 1 : -1)));
    moveTo(next);
    navigation.current?.children[next]?.focus({ preventScroll: true });
  }}>
    <div ref={track} className="rsc-track" onScroll={event => {
      const node = event.currentTarget;
      if (gesture.current && Math.abs(node.scrollLeft - gesture.current.scrollLeft) > 4) gesture.current.moved = true;
      let nearest = 0;
      [...node.children].forEach((slide, index) => {
        if (Math.abs(slide.offsetLeft - node.scrollLeft) < Math.abs(node.children[nearest].offsetLeft - node.scrollLeft)) nearest = index;
      });
      update(nearest);
    }} onPointerDown={event => {
      if (!event.currentTarget.contains(event.target)) return;
      gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, scrollLeft: event.currentTarget.scrollLeft, moved: false };
    }} onPointerMove={event => {
      if (!event.currentTarget.contains(event.target) || !gesture.current || gesture.current.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y) > 10) gesture.current.moved = true;
    }} onPointerCancel={() => {
      // Native touch scrolling cancels pointer events before a possible synthetic click.
      // Keep the suppression until that click or the next genuine pointerdown.
      if (gesture.current) gesture.current.moved = true;
    }} onClickCapture={event => {
      if (!event.currentTarget.contains(event.target)) return;
      if (gesture.current?.moved) { event.preventDefault(); event.stopPropagation(); }
      gesture.current = null;
    }}>
      {symbols.map((symbol, index) => <div className="rsc-slide" key={symbol} role="group" aria-roledescription={english ? 'slide' : '分页'} aria-label={`${symbol} · ${index + 1} / ${symbols.length}`}>{replay(symbol)}</div>)}
    </div>
    <nav ref={navigation} className="rsc-navigation" aria-label={english ? 'Choose stock chart' : '切换股票走势'}>
      {symbols.map((symbol, index) => <button type="button" key={symbol} aria-pressed={active === index} onClick={() => moveTo(index)}>{symbol}</button>)}
    </nav>
  </section>;
}

/** Presentation only: all cards retain their original history/ledger contracts. */
export default function ReviewStockCarousel(props) {
  const symbols = Array.isArray(props.symbols) ? props.symbols.filter(symbol => typeof symbol === 'string' && symbol) : [];
  if (!symbols.length) return null;
  return <StockCarousel key={JSON.stringify([props.userId, symbols])} {...props} symbols={symbols} />;
}
