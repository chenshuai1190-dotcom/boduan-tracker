import React from 'react';
import InvestmentSymbolPicker from './InvestmentSymbolPicker.jsx';

export default function DcaSymbolPicker({ value, userId, englishMode = false, searchSource, onChange }) {
  const [open, setOpen] = React.useState(false);
  const choose = item => {
    setOpen(false);
    if (item.symbol !== value) onChange(item.symbol);
  };
  return <div className="dl-symbol">
    <button type="button" className="dl-symbol-trigger"
      aria-label={englishMode ? `Change investment ${value}` : `更换投资标的 ${value}`}
      aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <span className="dl-symbol-caption">{englishMode ? 'Investment' : '投资标的'}</span>
      <span className="dl-symbol-value"><strong>{value}</strong></span>
    </button>
    {open && <InvestmentSymbolPicker selectedSymbol={value} userId={userId} englishMode={englishMode}
      searchSource={searchSource} onSelect={choose} onClose={() => setOpen(false)} />}
  </div>;
}
