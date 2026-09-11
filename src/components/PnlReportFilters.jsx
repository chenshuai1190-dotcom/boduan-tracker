import React from 'react';
import StockReportModal from './StockReportModal.jsx';
import { t } from '../lib/i18n.js';
import './PnlReportFilters.css';

export function PnlReportCalendarPicker({
  language,
  calendarPickerOpen,
  setCalendarPickerOpen,
  availableCalendarYears,
  availableCalendarMonthSet,
  draftCalendarYear,
  draftCalendarMonth,
  setDraftCalendarYear,
  setDraftCalendarMonth,
  firstAvailableMonthForYear,
  confirmCalendarPicker,
}) {
  if (!calendarPickerOpen) return null;
  return <StockReportModal
    title={t(language, 'pnlReport.calendarPickerTitle', '选择月份')}
    closeLabel={t(language, 'pnlReport.closeFilter', '关闭筛选')}
    onClose={() => setCalendarPickerOpen(false)}
    panelClassName="pnl-report-filter"
    actions={[{
      key: 'confirm',
      label: t(language, 'pnlReport.confirmFilter', '确定'),
      onClick: confirmCalendarPicker,
      disabled: availableCalendarYears.length === 0,
      className: 'pnl-report-filter-primary',
    }]}
  >
    {availableCalendarYears.length === 0 ? (
      <div className="pnl-report-filter-empty">{t(language, 'pnlReport.noCalendarYears', '暂无可选择的快照年份')}</div>
    ) : (
      <div className="pnl-report-filter-calendar">
        <div className="pnl-report-filter-calendar-column">
          <div className="pnl-report-filter-label">{t(language, 'pnlReport.selectYear', '年份')}</div>
          <div className="pnl-report-filter-years">
            {availableCalendarYears.map((year) => <button
              key={year}
              type="button"
              aria-pressed={draftCalendarYear === year}
              onClick={() => {
                setDraftCalendarYear(year);
                setDraftCalendarMonth(firstAvailableMonthForYear(year));
              }}
            >{year}</button>)}
          </div>
        </div>
        <div className="pnl-report-filter-calendar-column">
          <div className="pnl-report-filter-label">{t(language, 'pnlReport.selectMonth', '月份')}</div>
          <div className="pnl-report-filter-months">
            {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((month) => {
              const monthKey = `${draftCalendarYear}-${month}`;
              const enabled = availableCalendarMonthSet.has(monthKey);
              return <button
                key={month}
                type="button"
                disabled={!enabled}
                aria-pressed={draftCalendarMonth === month && enabled}
                onClick={() => setDraftCalendarMonth(month)}
              >{month}</button>;
            })}
          </div>
        </div>
      </div>
    )}
  </StockReportModal>;
}

export function PnlReportDateFilter({
  language,
  dateFilterOpen,
  setDateFilterOpen,
  dateFilterMode,
  setDateFilterMode,
  draftDate,
  setDraftDate,
  draftStartDate,
  setDraftStartDate,
  draftEndDate,
  setDraftEndDate,
  confirmDateFilter,
}) {
  const inputId = React.useId();
  if (!dateFilterOpen) return null;
  return <StockReportModal
    title={t(language, 'pnlReport.dateFilterTitle', '时间筛选')}
    closeLabel={t(language, 'pnlReport.closeFilter', '关闭筛选')}
    onClose={() => setDateFilterOpen(false)}
    panelClassName="pnl-report-filter"
    actions={[{
      key: 'confirm',
      label: t(language, 'pnlReport.confirmFilter', '确定'),
      onClick: confirmDateFilter,
      className: 'pnl-report-filter-primary',
    }]}
  >
    <div className="pnl-report-filter-segments">
      <button type="button" aria-pressed={dateFilterMode === 'single'} onClick={() => setDateFilterMode('single')}>{t(language, 'pnlReport.singleDay', '单日')}</button>
      <button type="button" aria-pressed={dateFilterMode === 'range'} onClick={() => setDateFilterMode('range')}>{t(language, 'pnlReport.dateRange', '区间')}</button>
    </div>
    {dateFilterMode === 'single' ? (
      <div className="pnl-report-filter-dates">
        <label className="pnl-report-filter-label" htmlFor={`${inputId}-single`}>{t(language, 'pnlReport.reportDate', '报表日期')}</label>
        <input id={`${inputId}-single`} type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} className="pnl-report-filter-input" />
      </div>
    ) : (
      <div className="pnl-report-filter-dates pnl-report-filter-date-range">
        <div>
          <label className="pnl-report-filter-label" htmlFor={`${inputId}-start`}>{t(language, 'pnlReport.startDate', '开始日期')}</label>
          <input id={`${inputId}-start`} type="date" value={draftStartDate} onChange={(event) => setDraftStartDate(event.target.value)} className="pnl-report-filter-input" />
        </div>
        <div>
          <label className="pnl-report-filter-label" htmlFor={`${inputId}-end`}>{t(language, 'pnlReport.endDate', '结束日期')}</label>
          <input id={`${inputId}-end`} type="date" value={draftEndDate} onChange={(event) => setDraftEndDate(event.target.value)} className="pnl-report-filter-input" />
        </div>
      </div>
    )}
    <div className="pnl-report-filter-hint">{t(language, 'pnlReport.dateFilterHint', '只读取已有数据，没有快照的日期不会使用其他日期替代。')}</div>
  </StockReportModal>;
}
