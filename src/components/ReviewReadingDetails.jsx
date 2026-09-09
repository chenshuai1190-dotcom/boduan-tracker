import React from 'react';
import { t } from '../lib/i18n.js';
import ReviewGoalModal from './ReviewGoalModal.jsx';
import './ReviewReadingDetails.css';

const DISCIPLINE_LEVELS = ['🟢', '🔺', '📣', '❗'];
const DISCIPLINE_LEVEL_LABELS = ['一般', '重要', '强调', '警告'];

export function DisciplineDetailModal({ discipline, language = 'zh', onClose, onEdit, onTogglePin, onDelete }) {
  const item = discipline ?? {};
  const tt = (key, fallback) => t(language, key, fallback);
  const levelIndex = DISCIPLINE_LEVELS.indexOf(item.level);
  const levelLabel = levelIndex >= 0
    ? tt(`review.disciplineLevel${levelIndex}`, DISCIPLINE_LEVEL_LABELS[levelIndex])
    : '';

  return <ReviewGoalModal
    title={tt('review.disciplineDetails', '心得详情')}
    closeLabel={tt('review.closeRecordDetails', '关闭记录详情')}
    onClose={onClose}
    actions={[
      { key: 'delete', label: tt('review.delete', '删除'), onClick: onDelete, className: 'rgm-danger' },
      { key: 'pin', label: item.pinned ? tt('review.unpin', '取消置顶') : tt('review.pin', '置顶'), onClick: onTogglePin },
      { key: 'edit', label: tt('review.edit', '修改'), onClick: onEdit, className: 'rgm-primary' },
    ]}
  >
    <div className="rgm-reading-detail">
      {(item.date || levelLabel || item.pinned) && <div className="rgm-reading-meta">
        {item.date && <span>{item.date}</span>}
        {levelLabel && <span>{levelLabel}</span>}
        {item.pinned && <span>{tt('review.pinned', '置顶')}</span>}
      </div>}
      <div className="rgm-reading-text">{String(item.text ?? '')}</div>
    </div>
  </ReviewGoalModal>;
}

export function ReviewLogDetailModal({ log, language = 'zh', onClose, onEdit, onDelete }) {
  const item = log ?? {};
  const tt = (key, fallback) => t(language, key, fallback);

  return <ReviewGoalModal
    title={tt('review.reviewDetails', '复盘详情')}
    closeLabel={tt('review.closeReviewDetails', '关闭复盘详情')}
    onClose={onClose}
    actions={[
      { key: 'delete', label: tt('review.delete', '删除'), onClick: onDelete, className: 'rgm-danger' },
      { key: 'edit', label: tt('review.edit', '修改'), onClick: onEdit, className: 'rgm-primary' },
    ]}
  >
    <div className="rgm-reading-detail">
      {(item.date || item.mood) && <div className="rgm-reading-meta">
        {item.date && <span>{item.date}</span>}
        {item.mood && <span>{item.mood}</span>}
      </div>}
      <div className="rgm-reading-text">{String(item.text ?? '')}</div>
    </div>
  </ReviewGoalModal>;
}
