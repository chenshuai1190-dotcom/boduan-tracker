import React, { useState } from 'react';
import { t } from '../lib/i18n.js';
import ReviewGoalModal from './ReviewGoalModal.jsx';
import './ReviewEntryEditors.css';

export function DisciplineModal({ initial, language = 'zh', onCancel, onSave, onDelete }) {
  const [level, setLevel] = useState(initial.level || '🟢');
  const [text, setText] = useState(initial.text || '');
  const [pinned, setPinned] = useState(initial.pinned || false);
  const [error, setError] = useState('');
  const isEdit = Boolean(initial?.isEdit || onDelete);
  const tt = (key, fallback, values) => t(language, key, fallback, values);
  const LEVELS = [
    { level: '🟢', label: tt('review.levelNormal', '一般') },
    { level: '🔺', label: tt('review.levelImportant', '重要') },
    { level: '📣', label: tt('review.levelEmphasis', '强调') },
    { level: '❗', label: tt('review.levelWarning', '警告') },
  ];

  const saveDiscipline = () => {
    if (!text.trim()) { setError(tt('review.contentRequired', '请输入内容')); return; }
    onSave({ level, text: text.trim(), pinned });
  };

  return <ReviewGoalModal
    title={isEdit ? tt('review.editDiscipline', '编辑心得') : tt('review.addDiscipline', '添加心得')}
    closeLabel={tt('review.closeDisciplineEditor', '关闭心得编辑')}
    onClose={onCancel}
    actions={[
      ...(onDelete ? [{ key: 'delete', label: tt('review.delete', '删除'), onClick: onDelete, className: 'rgm-danger' }] : []),
      { key: 'save', label: tt('review.save', '保存'), onClick: saveDiscipline, className: 'rgm-primary' },
    ]}
  >
    <div className="rgm-entry-form">
      <fieldset className="rgm-entry-choices">
        <legend>{tt('review.level', '等级')}</legend>
        <div className="rgm-entry-levels">
          {LEVELS.map(l => <button type="button" key={l.level} aria-pressed={level === l.level} onClick={() => setLevel(l.level)}>{l.label}</button>)}
        </div>
      </fieldset>
      <label className="rgm-field">
        <span>{tt('review.content', '内容')}</span>
        <textarea
          aria-label={tt('review.content', '内容')}
          aria-invalid={Boolean(error)}
          value={text}
          onChange={e => { setText(e.target.value); if (error) setError(''); }}
          placeholder={tt('review.disciplinePlaceholder', '写下你的投资心得...')}
          rows={6}
          className="rgm-entry-text"
          style={{ colorScheme: 'dark' }}
        />
      </label>
      {error && <div className="rgm-entry-error" role="alert">{error}</div>}
      <label className="rgm-entry-pin">
        <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
        <span>{tt('review.pinImportant', '置顶 (重要心得永远显示在最上)')}</span>
      </label>
    </div>
  </ReviewGoalModal>;
}

export function LogModal({ initial, language = 'zh', onCancel, onSave, onDelete }) {
  const [date, setDate] = useState(initial.date || new Date().toISOString().slice(0, 10));
  const [mood, setMood] = useState(initial.mood || '');
  const [text, setText] = useState(initial.text || '');
  const [error, setError] = useState('');
  const isEdit = !!onDelete;
  const tt = (key, fallback, values) => t(language, key, fallback, values);
  const MOODS = [
    tt('review.moodCautiousOptimism', '谨慎乐观'),
    tt('review.moodSatisfied', '满意'),
    tt('review.moodAnxious', '焦虑'),
    tt('review.moodGreedy', '贪婪'),
    tt('review.moodFearful', '恐惧'),
    tt('review.moodCalm', '冷静'),
  ];

  const saveLog = () => {
    if (!text.trim()) { setError(tt('review.contentRequired', '请输入内容')); return; }
    onSave({ date, mood: mood.trim(), text: text.trim() });
  };

  return <ReviewGoalModal
    title={isEdit ? tt('review.editReview', '编辑复盘') : tt('review.addReview', '写复盘')}
    closeLabel={tt('review.closeReviewEditor', '关闭复盘编辑')}
    onClose={onCancel}
    actions={[
      ...(isEdit ? [{ key: 'delete', label: tt('review.delete', '删除'), onClick: onDelete, className: 'rgm-danger' }] : []),
      { key: 'save', label: tt('review.save', '保存'), onClick: saveLog, className: 'rgm-primary' },
    ]}
  >
    <div className="rgm-entry-form">
      <label className="rgm-field">
        <span>{tt('review.date', '日期')}</span>
        <input type="date" aria-label={tt('review.date', '日期')} value={date} onChange={e => setDate(e.target.value)} style={{ colorScheme: 'dark', WebkitAppearance: 'none' }} />
      </label>
      <fieldset className="rgm-entry-choices">
        <legend>{tt('review.moodOptional', '当时心情 (可选)')}</legend>
        <div className="rgm-entry-moods">
          {MOODS.map(m => <button type="button" key={m} aria-pressed={mood === m} onClick={() => setMood(m === mood ? '' : m)}>{m}</button>)}
        </div>
        <label className="rgm-field rgm-entry-custom-mood">
          <input type="text" aria-label={tt('review.customMoodPlaceholder', '或自己写')} value={mood} onChange={e => setMood(e.target.value)} placeholder={tt('review.customMoodPlaceholder', '或自己写')} />
        </label>
      </fieldset>
      <label className="rgm-field">
        <span>{tt('review.reviewContent', '复盘内容')}</span>
        <textarea
          aria-label={tt('review.reviewContent', '复盘内容')}
          aria-invalid={Boolean(error)}
          value={text}
          onChange={e => { setText(e.target.value); if (error) setError(''); }}
          placeholder={tt('review.reviewPlaceholder', '今天做了什么操作? 对错? 下周计划? 市场感受?')}
          rows={6}
          className="rgm-entry-text"
          style={{ colorScheme: 'dark' }}
        />
      </label>
      {error && <div className="rgm-entry-error" role="alert">{error}</div>}
    </div>
  </ReviewGoalModal>;
}
