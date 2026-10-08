import React from 'react';
import './CurrencyToggle.css';

export default function CurrencyToggle({ value, onChange, label = '显示币种', className = '', disabledCurrencies = [] }) {
  return <div className={`currency-toggle ${className}`.trim()} role="group" aria-label={label}>
    {['USD', 'CNY'].map(currency => <button
      key={currency}
      type="button"
      className="currency-toggle-option"
      aria-pressed={value === currency}
      disabled={disabledCurrencies.includes(currency)}
      onClick={() => onChange(currency)}
    >{currency}</button>)}
  </div>;
}
