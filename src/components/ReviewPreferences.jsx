import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { REVIEW_TIMELINE_DISPLAY_GROUPS, isReviewTimelineGroupEnabled, setReviewTimelineGroupEnabled } from '../lib/reviewPreferences.js';
import './ReviewPreferences.css';

const label = (en, zh, english) => en ? english : zh;
function Switch({ checked, disabled, onChange, title, children }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={title} disabled={disabled} className="rjp-setting-row" onClick={() => onChange(!checked)}>
    <span className="rjp-setting-copy"><strong>{title}</strong>{children && <span>{children}</span>}</span>
    <span aria-hidden="true" className={`rjp-switch ${checked ? 'rjp-switch-on' : ''}`}><span /></span>
  </button>;
}

/** A normal subpage. Header/back navigation is owned by the journal route. */
export default function ReviewPreferences({ identityNode, preferences, ready, loading = false, canEdit = ready, saving = false, error = '', onChange, onRetry, language = 'zh' }) {
  const en = language.startsWith('en');
  const disabled = !ready || !canEdit || loading || saving;
  const types = preferences.eventTypes || [];
  const toggleGroup = (id, enabled) => onChange({ eventTypes: setReviewTimelineGroupEnabled(types, id, enabled) });
  return <section className="rjp-settings" aria-label={label(en, '动态设置', 'Feed settings')}>
    <div className="rjp-settings-identity">{identityNode}</div>
    {loading && <p className="rjp-save-state" role="status"><Loader2 size={14} className="rj-spin" />{label(en, '正在读取显示偏好', 'Loading display preferences')}</p>}
    {saving && <p className="rjp-save-state" role="status"><Loader2 size={14} className="rj-spin" />{label(en, '正在保存', 'Saving')}</p>}
    {error && <div className="rjp-settings-error" role="alert"><span>{error}</span><button type="button" onClick={onRetry} disabled={loading || saving}>{label(en, '重试', 'Retry')}</button></div>}
    <div className="rjp-settings-section">
      <Switch checked={preferences.showTimeline} disabled={disabled} onChange={showTimeline => onChange({ showTimeline })} title={label(en, '在“全部”中显示时间线', 'Show timeline events in All')}>
        {label(en, '将系统自动记录与博文按时间混排', 'Mix automatic records and posts chronologically')}
      </Switch>
    </div>
    <section className="rjp-settings-section" aria-label={label(en, '选择显示的事件', 'Visible event types')}>
      <h2>{label(en, '在“全部”中显示哪些记录', 'Events to show in All')}</h2>
      <p className="rjp-setting-note">{label(en, '仅影响“全部”；完整记录仍可从“时间线”查看。', 'Only changes All. The Timeline tab keeps every event.')}</p>
      {REVIEW_TIMELINE_DISPLAY_GROUPS.map(group => <Switch key={group.id} title={en ? group.enLabel : group.label} checked={isReviewTimelineGroupEnabled(types, group.id)} disabled={disabled || !preferences.showTimeline} onChange={checked => toggleGroup(group.id, checked)} />)}
      {preferences.showTimeline && types.length === 0 && <p className="rjp-setting-note">{label(en, '当前未选择任何事件，“全部”只显示你写的博文。', 'No event types selected. All shows only your posts.')}</p>}
    </section>
    <section className="rjp-settings-section rjp-currency-section" aria-label={label(en, '金额显示币种', 'Display currency')}>
      <h2>{label(en, '金额显示币种', 'Display currency')}</h2>
      <div className="rjp-currency-options" role="group" aria-label={label(en, '选择金额币种', 'Choose display currency')}>{[['USD', '美元 USD', 'US dollar USD'], ['CNY', '人民币 CNY', 'Chinese yuan CNY']].map(([value, zh, english]) => <button key={value} type="button" aria-pressed={preferences.currency === value} disabled={disabled} onClick={() => onChange({ currency: value })}>{label(en, zh, english)}{preferences.currency === value && <Check size={16} />}</button>)}</div>
      <p className="rjp-setting-note">{label(en, '账户金额按所选币种展示。收益率、回撤与杠杆沿用原口径，股票成交价保留交易原币种。', 'Account amounts use this currency. Return, drawdown and leverage calculations stay unchanged; trade prices keep their original currency.')}</p>
    </section>
    <p className="rjp-settings-footer">{label(en, '显示偏好跟随你的账号保存', 'Display preferences are saved to your account')}</p>
  </section>;
}
