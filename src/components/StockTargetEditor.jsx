import React from 'react';
import { Minus, Plus, ShieldCheck } from 'lucide-react';
import ActionModalCard from './ActionModalCard.jsx';
import StockLogo from './StockLogo.jsx';
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
    <ActionModalCard
      title={t(language, 'watchlistDetail.editTarget', '编辑目标价')}
      closeLabel={t(language, 'watchlistDetail.closeTargetEditor', '关闭目标价编辑')}
      onClose={() => !saving && onCancel()}
      showGrabber
      widthClassName="w-[calc(100vw-38px)] max-w-[372px]"
      actions={[
        { key: 'cancel', label: t(language, 'watchlistDetail.cancel', '取消'), disabled: saving, onClick: onCancel },
        { key: 'save', label: saving ? t(language, 'watchlistDetail.saving', '保存中') : t(language, 'watchlistDetail.saveTarget', '保存目标价'), disabled: value === null || saving, onClick: () => onSave(targetUsd) },
      ]}
    >
      <div className="flex items-center gap-3 border-b border-white/[0.06] pb-3">
        <StockLogo symbol={symbol} urls={logoUrls} onLogoLoad={onLogoLoad} className="h-10 w-10 rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] text-white/[0.78]">{symbol} <span className="ml-1 text-[12px] text-white/[0.50]">{name}</span></div>
          <div className="mt-1 text-[12px] text-white/[0.50]">{t(language, 'watchlistDetail.currentClosePrice', '当前收盘价 {{price}}', { price: formatCurrency(currentCloseUsd, currency) })}</div>
        </div>
      </div>

      <label className="mt-4 block text-[12px] text-white/[0.50]" htmlFor="stock-target-price">
        {t(language, 'watchlistDetail.singleTargetPrice', '单一目标价（{{currency}}）', { currency })}
      </label>
      <div className="mt-2 grid h-[50px] grid-cols-[46px_minmax(0,1fr)_46px] overflow-hidden rounded-xl border border-white/[0.09] bg-black/[0.28]">
        <button type="button" onClick={() => adjust(-1)} className="flex items-center justify-center border-r border-white/[0.07] text-white/[0.48] active:bg-white/[0.05]" aria-label={t(language, 'watchlistDetail.decreaseTarget', '目标价减少一个单位')}><Minus className="h-4 w-4" /></button>
        <div className="flex min-w-0 items-center px-3">
          <span className="mr-1.5 text-[14px] text-white/[0.28]">{currency === 'CNY' ? '¥' : '$'}</span>
          <input
            id="stock-target-price"
            inputMode="decimal"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="0.00"
            className="min-w-0 flex-1 bg-transparent text-center text-[19px] font-normal text-white/[0.86] outline-none tabular-nums"
            style={{ fontFamily: NUMBER_FONT, WebkitMinLogicalWidth: '0px' }}
          />
        </div>
        <button type="button" onClick={() => adjust(1)} className="flex items-center justify-center border-l border-white/[0.07] text-white/[0.48] active:bg-white/[0.05]" aria-label={t(language, 'watchlistDetail.increaseTarget', '目标价增加一个单位')}><Plus className="h-4 w-4" /></button>
      </div>

      <div className="mt-4 grid grid-cols-2 divide-x divide-white/[0.07] rounded-xl border border-white/[0.06] bg-white/[0.025] py-3">
        <div className="px-3 text-center">
          <div className="text-[12px] text-white/[0.50]">{t(language, 'watchlistDetail.targetSpace', '距目标空间')}</div>
          <div className="mt-1.5 text-[15px] tabular-nums" style={{ color: marketHexColor(space || 0, marketColorMode), fontFamily: NUMBER_FONT }}>{formatSignedPercent(space)}</div>
        </div>
        <div className="px-3 text-center">
          <div className="text-[12px] text-white/[0.50]">{t(language, 'watchlistDetail.costToTargetProgress', '成本至目标已完成')}</div>
          <div className="mt-1.5 text-[15px] text-[#f6b54b] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{progress === null ? '--' : `${progress.toFixed(1)}%`}</div>
        </div>
      </div>

      {error ? <div className="mt-3 text-center text-[11px] text-[#ff4b1f]">{t(language, 'watchlistDetail.targetSaveFailed', '目标价保存失败')}</div> : null}
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#f6b54b]/10 bg-[#f6b54b]/[0.035] px-3 py-2.5 text-[12px] leading-4 text-white/[0.50]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f6b54b]/65" />
        {t(language, 'watchlistDetail.targetBoundary', '目标价只保存个人计划，不修改持仓、正式交易记录或比赛账本。')}
      </div>
    </ActionModalCard>
  );
}
