import React from 'react';
import ActionModalCard from './ActionModalCard.jsx';
import './StockReportModal.css';

// A scoped visual variant; shared dialog scrolling, keyboard and close handling stay unchanged.
export default function StockReportModal({
  title, closeLabel, onClose, children, actions = [],
  widthClassName = 'w-[calc(100vw-32px)] max-w-[398px]',
  panelClassName = '',
}) {
  return <ActionModalCard
    title={title}
    closeLabel={closeLabel}
    onClose={onClose}
    widthClassName={widthClassName}
    panelClassName={`stock-report-modal ${panelClassName}`}
    headerClassName="srm-header"
    titleClassName="srm-title"
    closeButtonClassName="srm-close"
    contentClassName="srm-content"
    actionClassName="srm-action"
    actions={actions}
  >{children}</ActionModalCard>;
}
