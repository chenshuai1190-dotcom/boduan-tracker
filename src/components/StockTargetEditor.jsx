import React from 'react';
import { Minus, Plus } from 'lucide-react';
import StockReportModal from './StockReportModal.jsx';
import StockLogo from './StockLogo.jsx';
import './StockTargetEditor.css';
import { t } from '../lib/i18n.js';
import { marketHexColor } from '../lib/marketColorMode.js';
import {
  targetProgressPercent,
  targetSpacePercent,
} from '../lib/watchlistStockDetail.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function formatNumber(value, digits = 2) {
  const number = finiteNumber(value);
  if (number === null) return '--';
  return number.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatSignedPercent(value, digits = 2) {
  const number = finiteNumber(value);
  if (number === null) return '--';
  return `${number >= 0 ? '+' : ''}${number.toFixed(digits)}%`;
}

function formatCurrency(value, currency, digits = 2) {
  const number = finiteNumber(value);
  if (number === null) return '--';
  const symbol = currency === 'CNY' ? '¥' : '$';
  const sign = number < 0 ? '-' : '';
  return `${sign}${symbol}${formatNumber(Math.abs(number), digits)}`;
}

export default function StockTargetEditor({
  language,
  symbol,
  name,
  logoUrls,
  onLogoLoad,
  currency,
  currentCloseUsd,
  averageCostUsd,
  targetPriceUsd,
  marketColorMode,
  saving,
  error,
  onCancel,
  onSave,
}) {
  const [draft, setDraft] = React.useState(() => (
    targetPriceUsd === null ? '' : String(Number(targetPriceUsd.toFixed(2)))
  ));
  const value = positiveNumber(draft);
  const targetUsd = value;
  const space = targetSpacePercent(targetUsd, currentCloseUsd);
  const progress = targetProgressPercent(targetUsd, currentCloseUsd, averageCostUsd);
  const adjust = (delta) => {
    const current = finiteNumber(draft);
    setDraft(String(Math.max(0, (current ?? currentCloseUsd ?? 0) + delta).toFixed(2)));
  };

  return (
    <StockReportModal
      title={t(language, 'watchlistDetail.editTarget', '编辑目标价')}
      closeLabel={t(language, 'watchlistDetail.closeTargetEditor', '关闭目标价编辑')}
      onClose={() => !saving && onCancel()}
      panelClassName="stock-target-editor"
      actions={[
        { key: 'save', className: 'srm-primary', label: saving ? t(language, 'watchlistDetail.saving', '保存中') : t(language, 'watchlistDetail.saveTarget', '保存目标价'), disabled: value === null || saving, onClick: () => onSave(targetUsd) },
      ]}
    >
      <div className="ste-identity">
        <StockLogo symbol={symbol} urls={logoUrls} onLogoLoad={onLogoLoad} className="ste-logo" />
        <div className="ste-identity-copy">
          <div className="ste-identity-title"><span>{symbol}</span><span className="ste-name">{name}</span></div>
          <div className="ste-current-close">{t(language, 'watchlistDetail.currentClosePrice', '当前收盘价 {{price}}', { price: formatCurrency(currentCloseUsd, currency) })}</div>
        </div>
      </div>

      <label className="ste-input-label" htmlFor="stock-target-price">
        {t(language, 'watchlistDetail.singleTargetPrice', '单一目标价（{{currency}}）', { currency })}
      </label>
      <div className="ste-input-row">
        <button type="button" onClick={() => adjust(-1)} className="ste-adjust" aria-label={t(language, 'watchlistDetail.decreaseTarget', '目标价减少一个单位')}><Minus className="h-4 w-4" /></button>
        <div className="ste-amount">
          <span className="ste-currency">{currency === 'CNY' ? '¥' : '$'}</span>
          <input
            id="stock-target-price"
            inputMode="decimal"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="0.00"
            className="ste-input"
            style={{ fontFamily: NUMBER_FONT, WebkitMinLogicalWidth: '0px' }}
          />
        </div>
        <button type="button" onClick={() => adjust(1)} className="ste-adjust" aria-label={t(language, 'watchlistDetail.increaseTarget', '目标价增加一个单位')}><Plus className="h-4 w-4" /></button>
      </div>

      <div className="ste-reference-grid">
        <div>
          <div className="ste-reference-label">{t(language, 'watchlistDetail.targetSpace', '距目标空间')}</div>
          <div className="ste-reference-value" style={{ color: marketHexColor(space || 0, marketColorMode), fontFamily: NUMBER_FONT }}>{formatSignedPercent(space)}</div>
        </div>
        <div>
          <div className="ste-reference-label">{t(language, 'watchlistDetail.costToTargetProgress', '成本至目标已完成')}</div>
          <div className="ste-reference-value" style={{ fontFamily: NUMBER_FONT }}>{progress === null ? '--' : `${progress.toFixed(1)}%`}</div>
        </div>
      </div>

      {error ? <div className="ste-error" role="alert">{t(language, 'watchlistDetail.targetSaveFailed', '目标价保存失败')}</div> : null}
      <p className="ste-boundary">
        {t(language, 'watchlistDetail.targetBoundary', '目标价只保存个人计划，不修改持仓、正式交易记录或比赛账本。')}
      </p>
    </StockReportModal>
  );
}
