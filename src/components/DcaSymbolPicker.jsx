import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { DCA_SYMBOLS } from '../lib/dcaLabModel.js';

const GROUPS = [
  { title: '指数 ETF', symbols: DCA_SYMBOLS.slice(0, 3) },
  { title: '美股', symbols: DCA_SYMBOLS.slice(3) },
];
const ETF_NAMES = { QQQ: '纳指 100', SPY: '标普 500', TQQQ: '三倍纳指' };

export default function DcaSymbolPicker({ value, onChange }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);
  const triggerRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const id = React.useId();
  const selected = DCA_SYMBOLS.find(item => item.symbol === value);
  const dismiss = () => { setOpen(false); triggerRef.current?.focus({ preventScroll: true }); };

  React.useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
    const outside = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const choose = symbol => {
    dismiss();
    if (symbol !== value) onChange(symbol);
  };
  const onKeyDown = event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); dismiss(); return; }
    if (!open) {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); }
      return;
    }
    const options = [...(menuRef.current?.querySelectorAll('[role="option"]') || [])];
    const current = options.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (current + 1) % options.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (current - 1 + options.length) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    if (next !== undefined && options.length) { event.preventDefault(); options[next]?.focus(); }
  };

  return <div className="dl-symbol" ref={rootRef} onKeyDown={onKeyDown}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" ref={triggerRef} className="dl-symbol-trigger"
      aria-label={`投资标的：${value}，${selected?.name || ''}`}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(previous => !previous)}>
      <span className="dl-symbol-caption">投资标的</span>
      <span className="dl-symbol-value"><strong>{value}</strong><span>{selected?.name}</span><ChevronDown size={16} aria-hidden="true" /></span>
    </button>
    {open && <div className="dl-symbol-menu" id={id} ref={menuRef} role="listbox" aria-label="选择投资标的">
      {GROUPS.map(group => <div role="group" aria-label={group.title} key={group.title}>
        <div className="dl-symbol-group-title">{group.title}</div>
        <div className={group.symbols.length === 3 ? 'dl-symbol-options dl-symbol-etfs' : 'dl-symbol-options'}>
          {group.symbols.map(item => <button type="button" role="option" tabIndex={-1}
            key={item.symbol} aria-label={`${item.symbol} ${item.name}`} aria-selected={item.symbol === value}
            className="dl-symbol-option" onClick={() => choose(item.symbol)}>
            <span><strong>{item.symbol}</strong>{item.symbol === value && <Check size={13} aria-hidden="true" />}</span>
            <small>{ETF_NAMES[item.symbol] || item.name}</small>
          </button>)}
        </div>
      </div>)}
    </div>}
  </div>;
}
