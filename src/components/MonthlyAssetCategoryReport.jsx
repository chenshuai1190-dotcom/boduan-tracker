import React from 'react';
import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Coins,
  Home,
  Info,
  Landmark,
  MessageCircle,
  Minus,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { t } from '../lib/i18n.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const UP_COLOR = '#ff4b1f';
const DOWN_COLOR = '#50d0a2';
const FLAT_COLOR = 'rgba(255,255,255,.62)';

const CATEGORY_ICONS = {
  银行: Landmark,
  证券: BarChart3,
  支付宝: WalletCards,
  微信: MessageCircle,
  定期: CalendarDays,
  现金: Coins,
  公积金: Home,
  其他: CircleDollarSign,
};

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return '--';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatWan(value, language, digits = 1) {
  if (!Number.isFinite(value)) return '--';
  if (language === 'zh') return `${formatNumber(value / 10000, digits)}万`;
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${formatNumber(value / 1_000_000, digits)}M`;
  if (absolute >= 1_000) return `${formatNumber(value / 1_000, digits)}K`;
  return formatNumber(value, digits);
}

function formatMoney(value, language) {
  return Number.isFinite(value) ? `¥${formatWan(value, language)}` : '--';
}

function formatSignedMoney(value, language) {
  if (!Number.isFinite(value)) return '--';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}¥${formatWan(Math.abs(value), language)}`;
}

function formatSignedPercent(value) {
  if (!Number.isFinite(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function changeTone(changeAmount) {
  if (changeAmount > 0) return UP_COLOR;
  if (changeAmount < 0) return DOWN_COLOR;
  return FLAT_COLOR;
}

function CategoryIcon({ category }) {
  const Icon = CATEGORY_ICONS[category] || CircleDollarSign;
  return <Icon className="h-[15px] w-[15px]" strokeWidth={1.8} />;
}

export default function MonthlyAssetCategoryReport({
  language = 'zh',
  report,
}) {
  const tt = React.useCallback((key, fallback, replacements) => (
    t(language, key, fallback, replacements)
  ), [language]);
  const categories = Array.isArray(report?.categories) ? report.categories : [];
  const hasObservedAccounts = Number(report?.accountCount) > 0;
  const summaryComplete = report?.isComplete === true;
  const summaryTone = changeTone(report?.netChange);
  const SummaryIcon = report?.netChange > 0
    ? TrendingUp
    : report?.netChange < 0
      ? TrendingDown
      : Minus;

  return (
    <div className="min-w-0" data-monthly-asset-category-report="true">
      <section
        className="overflow-hidden rounded-[20px] border border-white/[0.075] bg-[#0b0c0e]"
        aria-label={tt('analysis.assetCategorySummary', '分类资产环比摘要')}
      >
        <div className="px-[17px] pb-[15px] pt-[17px]">
          <div className="text-[11px] leading-[15px] text-white/[0.50]">
            {summaryComplete
              ? tt('analysis.assetCategoryMonthEndTotal', '本月末总资产')
              : tt('analysis.assetCategoryRecordedMonthEndTotal', '本月已记录资产')}
          </div>
          <div
            className="mt-[7px] overflow-hidden text-ellipsis whitespace-nowrap text-[30px] font-medium leading-none tracking-[-0.6px] text-white/[0.95] tabular-nums"
            style={{ fontFamily: NUMBER_FONT }}
          >
            {formatMoney(report?.currentTotal, language)}
          </div>
          {summaryComplete && Number.isFinite(report?.netChange) ? (
            <div
              className="mt-[9px] flex items-center gap-1.5 text-[13px] font-medium tabular-nums"
              style={{ color: summaryTone, fontFamily: NUMBER_FONT }}
            >
              <SummaryIcon className="h-4 w-4 shrink-0" strokeWidth={1.9} />
              <span>
                {tt(
                  report.netChange > 0
                    ? 'analysis.assetCategoryNetIncrease'
                    : report.netChange < 0
                      ? 'analysis.assetCategoryNetDecrease'
                      : 'analysis.assetCategoryNetFlat',
                  report.netChange > 0 ? '较上月增加' : report.netChange < 0 ? '较上月减少' : '较上月持平',
                )}
                {' '}{formatSignedMoney(report.netChange, language)} · {formatSignedPercent(report.netChangePct)}
              </span>
            </div>
          ) : (
            <div className="mt-[9px] flex items-center gap-1.5 text-[12px] text-[#f6c56f]">
              <Info className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
              <span>
                {hasObservedAccounts
                  ? tt('analysis.assetCategoryIncompleteSummary', '部分账户数据不可比，净变化暂不计算')
                  : tt('analysis.assetCategoryNoData', '该月份暂无可展示的分类资产数据')}
              </span>
            </div>
          )}
        </div>

        {summaryComplete ? (
          <div className="grid grid-cols-3 border-t border-white/[0.075]">
            <div className="min-w-0 px-1.5 py-3 text-center">
              <div className="text-[10px] text-white/[0.45]">{tt('analysis.assetCategoryIncreaseTotal', '增加合计')}</div>
              <div className="mt-1 truncate text-[12px] tabular-nums" style={{ color: UP_COLOR, fontFamily: NUMBER_FONT }}>
                {formatSignedMoney(report?.increaseTotal, language)}
              </div>
            </div>
            <div className="min-w-0 border-x border-white/[0.075] px-1.5 py-3 text-center">
              <div className="text-[10px] text-white/[0.45]">{tt('analysis.assetCategoryDecreaseTotal', '减少合计')}</div>
              <div className="mt-1 truncate text-[12px] tabular-nums" style={{ color: DOWN_COLOR, fontFamily: NUMBER_FONT }}>
                {formatSignedMoney(report?.decreaseTotal, language)}
              </div>
            </div>
            <div className="min-w-0 px-1.5 py-3 text-center">
              <div className="text-[10px] text-white/[0.45]">{tt('analysis.assetCategoryMaxGain', '最大增益')}</div>
              <div className="mt-1 truncate text-[12px] text-white/[0.90] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
                {report?.maxGainCategory
                  ? `${tt(`analysis.accountType.${report.maxGainCategory.category}`, report.maxGainCategory.category)} ${formatSignedMoney(report.maxGainCategory.changeAmount, language)}`
                  : '--'}
              </div>
            </div>
          </div>
        ) : hasObservedAccounts ? (
          <div className="grid grid-cols-3 border-t border-white/[0.075]">
            <div className="min-w-0 px-1.5 py-3 text-center">
              <div className="text-[10px] text-white/[0.45]">{tt('analysis.assetCategoryComparableAccounts', '可比账户')}</div>
              <div className="mt-1 text-[12px] text-white/[0.88] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
                {report?.comparableAccountCount || 0}/{report?.accountCount || 0}
              </div>
            </div>
            <div className="min-w-0 border-x border-white/[0.075] px-1.5 py-3 text-center">
              <div className="text-[10px] text-white/[0.45]">{tt('analysis.assetCategoryIncompleteAccounts', '不可比账户')}</div>
              <div className="mt-1 text-[12px] text-[#f6c56f] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
                {report?.incompleteAccountCount || 0}
              </div>
            </div>
            <div className="min-w-0 px-1.5 py-3 text-center">
              <div className="text-[10px] text-white/[0.45]">{tt('analysis.assetCategoryNetChange', '净变化')}</div>
              <div className="mt-1 text-[12px] text-white/[0.36]">--</div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-5" aria-label={tt('analysis.assetCategoryContribution', '分类变动贡献')}>
        <div className="mb-1.5 flex items-end justify-between gap-3">
          <h2 className="text-[15px] font-medium text-white/[0.92]">
            {tt('analysis.assetCategoryContribution', '分类变动贡献')}
          </h2>
          <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-white/[0.42]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: DOWN_COLOR }} />
            <span>{tt('analysis.assetCategoryDecrease', '减少')}</span>
            <span>← 0 →</span>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: UP_COLOR }} />
            <span>{tt('analysis.assetCategoryIncrease', '增加')}</span>
          </div>
        </div>

        {categories.length > 0 ? (
          <div className="border-t border-white/[0.075]" data-asset-category-report-rows="true">
            {categories.map((row) => {
              const tone = changeTone(row.changeAmount);
              const barWidth = row.isComparable && row.changeAmount !== 0 && report.maxAbsChange > 0
                ? Math.max(2.5, (Math.abs(row.changeAmount) / report.maxAbsChange) * 46)
                : 0;
              return (
                <div
                  key={row.category}
                  data-asset-category-report-row={row.category}
                  className="border-b border-white/[0.075] px-0.5 py-[13px]"
                >
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-white/[0.055] text-white/[0.70]">
                        <CategoryIcon category={row.category} />
                      </span>
                      <span className="truncate text-[13px] font-medium text-white/[0.91]">
                        {tt(`analysis.accountType.${row.category}`, row.category)}
                      </span>
                    </div>
                    {row.isComparable ? (
                      <div className="shrink-0 text-right text-[12px] font-medium tabular-nums" style={{ color: tone, fontFamily: NUMBER_FONT }}>
                        {formatSignedMoney(row.changeAmount, language)} <span className="text-[11px]">{formatSignedPercent(row.changePct)}</span>
                      </div>
                    ) : (
                      <div className="shrink-0 text-[11px] text-[#f6c56f]">
                        {tt('analysis.assetCategoryIncomplete', '不可比')}
                      </div>
                    )}
                  </div>

                  <div className="ml-[38px] mt-1.5 text-[10px] text-white/[0.43] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
                    {tt('analysis.assetCategoryPrevious', '上月')} {formatMoney(row.previousBalance, language)}
                    <span className="px-1.5">→</span>
                    <span className="text-white/[0.70]">{tt('analysis.assetCategoryCurrent', '本月')} {formatMoney(row.currentBalance, language)}</span>
                  </div>

                  <div className="relative ml-[38px] mt-2 h-[9px] overflow-hidden rounded-full bg-white/[0.055]" aria-hidden="true">
                    <span className="absolute left-1/2 top-0 h-full w-px bg-white/[0.24]" />
                    {row.isComparable && row.changeAmount > 0 && (
                      <span className="absolute left-1/2 top-px h-[7px] rounded-full" style={{ width: `${barWidth}%`, background: UP_COLOR }} />
                    )}
                    {row.isComparable && row.changeAmount < 0 && (
                      <span className="absolute right-1/2 top-px h-[7px] rounded-full" style={{ width: `${barWidth}%`, background: DOWN_COLOR }} />
                    )}
                    {row.isComparable && row.changeAmount === 0 && (
                      <span className="absolute left-1/2 top-px h-[7px] w-[7px] -translate-x-1/2 rounded-full bg-white/[0.42]" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-[180px] items-center justify-center border-y border-white/[0.075] text-[12px] text-white/[0.36]">
            {tt('analysis.assetCategoryNoData', '该月份暂无可展示的分类资产数据')}
          </div>
        )}
      </section>

      <div className="mt-3 space-y-1.5 px-0.5 text-[10px] leading-[1.4] text-white/[0.38]">
        {report?.incompleteAccountCount > 0 && (
          <div className="flex items-start gap-1.5 text-[#f6c56f]/80">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
            <span>{tt('analysis.assetCategoryIncompleteHint', '缺少任一月份记录的分类不计算涨跌，也不会按 0 处理。')}</span>
          </div>
        )}
        <div className="flex items-start gap-1.5">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
          <span>{tt('analysis.assetCategoryDataBasis', '按当前账户分类归集；外币按当前汇率折算为人民币。')}</span>
        </div>
      </div>
    </div>
  );
}
