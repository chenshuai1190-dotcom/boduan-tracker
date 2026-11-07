import React from 'react';
import ReviewStockText from './ReviewStockText.jsx';
import './ReviewPostBody.css';

/** Measure the rendered body, so paragraph breaks and mobile font size count. */
export default function ReviewPostBody({ text, candidates, onSelectSymbol, language = 'zh', full = false, expanded = false, onToggle }) {
  const content = React.useRef(null);
  const ruler = React.useRef(null);
  const [size, setSize] = React.useState({ overflow: false, limit: 0 });
  React.useLayoutEffect(() => {
    if (full) return undefined;
    const node = content.current, budget = ruler.current;
    if (!node || !budget) return undefined;
    const measure = () => {
      const available = budget.getBoundingClientRect().height;
      const lineHeight = Number.parseFloat(window.getComputedStyle(node).lineHeight);
      if (!(available > 0)) return; // A hidden parent is measured when it becomes visible.
      const limit = lineHeight > 0 ? Math.max(lineHeight, Math.floor(available / lineHeight) * lineHeight) : available;
      const overflow = node.scrollHeight > limit + 1;
      setSize(previous => previous.overflow === overflow && previous.limit === limit ? previous : { overflow, limit });
    };
    measure();
    const observer = window.ResizeObserver ? new window.ResizeObserver(measure) : null;
    observer?.observe(node); observer?.observe(budget);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [text, full]);
  const collapsed = !full && !expanded;
  return <div className="rj-post-body">
    {!full && <span ref={ruler} className="rj-post-body-budget" aria-hidden="true" />}
    <div className={`rj-post-body-window${collapsed ? ' rj-post-body-collapsed' : ''}`} style={collapsed && size.limit ? { maxHeight: `${size.limit}px` } : undefined}>
      <div ref={content} className="rj-post-text"><ReviewStockText text={text} candidates={candidates} onSelectSymbol={onSelectSymbol} language={language} /></div>
    </div>
    {!full && size.overflow && <button type="button" className="rj-text-button rj-expand" aria-expanded={expanded} onClick={event => { event.stopPropagation(); onToggle?.(); }}>{language.startsWith('en') ? expanded ? 'Show less' : 'Read more' : expanded ? '收起' : '展开全文'}</button>}
  </div>;
}
