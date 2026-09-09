import React, { useState } from 'react';
import ReviewGoalModal from './ReviewGoalModal.jsx';
import { t } from '../lib/i18n.js';

export default function YearlyActualModal({ year, initial, language = 'zh', onCancel, onSave, currency, rate }) {
  const isCNY = currency === 'CNY';
  const symbol = isCNY ? '¥' : '$';
  const tt = (key, fallback, values) => t(language, key, fallback, values);
  // 显示时: USD存储 × rate → 展示值
  // 保存时: 展示值 / rate → 存回 USD
  const [actualGain, setActualGain] = useState(initial.actualGain !== null && initial.actualGain !== undefined ? String(Math.round(initial.actualGain * rate)) : '');
  const [endBalance, setEndBalance] = useState(initial.endBalance !== null && initial.endBalance !== undefined ? String(Math.round(initial.endBalance * rate)) : '');

  const saveYearlyActual = () => {
    const divisor = isCNY ? rate : 1;
    const ag = actualGain === '' ? null : parseFloat(actualGain) / divisor;
    const eb = endBalance === '' ? null : parseFloat(endBalance) / divisor;
    onSave(ag, eb);
  };

  const gainHintId = React.useId();
  const balanceHintId = React.useId();

  return (
    <ReviewGoalModal
      title={tt('review.actualDataTitle', '{{year}} 年实际数据', { year })}
      closeLabel={tt('review.closeActualData', '关闭年度实际编辑')}
      onClose={onCancel}
      actions={[
        { key: 'save', label: tt('review.save', '保存'), className: 'rgm-primary', onClick: saveYearlyActual },
      ]}
    >
      <div className="rgm-year-editor">
        <label className="rgm-field">
          <span>{tt('review.actualGrowth', '实际增长 ({{symbol}})', { symbol })}</span>
          <input
            type="number"
            value={actualGain}
            onChange={e => setActualGain(e.target.value)}
            aria-label={tt('review.actualGrowth', '实际增长 ({{symbol}})', { symbol })}
            aria-describedby={gainHintId}
            placeholder={isCNY ? tt('review.actualGrowthPlaceholderCny', '例: 1440000 (144万¥)') : tt('review.actualGrowthPlaceholderUsd', '例: 200000 (20万$)')}
            style={{ colorScheme: 'dark' }}
          />
          <small id={gainHintId} className="rgm-input-hint">{tt('review.actualGrowthHint', '这一年涨了多少 (留空则按年末余额倒算)')}</small>
        </label>
        <label className="rgm-field">
          <span>{tt('review.yearEndBalance', '年末余额 ({{symbol}})', { symbol })}</span>
          <input
            type="number"
            value={endBalance}
            onChange={e => setEndBalance(e.target.value)}
            aria-label={tt('review.yearEndBalance', '年末余额 ({{symbol}})', { symbol })}
            aria-describedby={balanceHintId}
            placeholder={isCNY ? tt('review.yearEndPlaceholderCny', '例: 19440000 (1944万¥)') : tt('review.yearEndPlaceholderUsd', '例: 2600000 (260万$)')}
            style={{ colorScheme: 'dark' }}
          />
          <small id={balanceHintId} className="rgm-input-hint">{tt('review.yearEndHint', '这一年结束总共多少 (留空则按上年余额+本年增长自动算)')}</small>
        </label>
        <div className="rgm-currency-note">
          <span>{tt('review.currentCurrency', '当前币种: {{currency}}', { currency })}</span>
          {isCNY && <span>{tt('review.currencySaveNote', ' · 汇率 1 USD = {{rate}} CNY · 保存时自动换算为 USD 存储', { rate })}</span>}
        </div>
      </div>
    </ReviewGoalModal>
  );
}
