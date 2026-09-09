import React from 'react';
import ActionModalCard from './ActionModalCard.jsx';
import './ReviewGoalModal.css';

export default function ReviewGoalModal({ title, closeLabel, onClose, children, actions = [] }) {
  return <ActionModalCard
    title={title}
    closeLabel={closeLabel}
    onClose={onClose}
    widthClassName="w-[calc(100vw-32px)] max-w-[398px]"
    panelClassName="review-goal-modal"
    headerClassName="rgm-header"
    titleClassName="rgm-title"
    closeButtonClassName="rgm-close"
    contentClassName="rgm-content"
    actionClassName="rgm-action"
    actionGridClassName={actions.length === 3 ? 'grid-cols-3' : actions.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}
    actions={actions}
  >{children}</ActionModalCard>;
}
