import React from 'react';
import avatar from '../assets/quote-system-fox.jpg';
import './ReviewSystemIdentity.css';

export function ReviewSystemAvatar() {
  return <span className="rj-avatar rj-system-avatar" aria-hidden="true"><img src={avatar} alt="" draggable={false} /></span>;
}

export function ReviewSystemName({ language = 'zh' }) {
  const en = String(language).toLowerCase().startsWith('en');
  return <><strong>Quote</strong><span className="rj-system-badge">{en ? 'System' : '系统'}</span></>;
}
