import React, { useEffect, useState } from 'react';
import { Pencil, User } from 'lucide-react';
import { getCommunityAvatarOption } from '../lib/communityProfile.js';
import { normalizeCommunityAvatarPath } from '../lib/communityAvatarModel.js';
import { isReviewAvatarDataUrl } from '../lib/reviewIdentityStorage.js';
import { t } from '../lib/i18n.js';

function cachedIdentity(db, userId) {
  return userId ? db?.readCachedReviewIdentity?.(userId) || null : null;
}

// This snapshot is for display only. SettingsTab still reads a fresh profile
// and avatar path before editing or using either value as a save/CAS base.
export default function SettingsCommunityIdentity({ db, userId, language }) {
  const [snapshot, setSnapshot] = useState(() => ({ db, userId, identity: cachedIdentity(db, userId) }));
  const [failedImage, setFailedImage] = useState(null);
  // A new account or repository cannot render the previous scope even before
  // the effect cleanup runs. The identity cache also checks its auth owner.
  const identity = snapshot.db === db && snapshot.userId === userId
    ? snapshot.identity : cachedIdentity(db, userId);

  useEffect(() => {
    let active = true;
    let request = 0;
    const refresh = () => {
      const currentRequest = ++request;
      setSnapshot({ db, userId, identity: cachedIdentity(db, userId) });
      if (!userId || !db?.fetchReviewIdentity) return;
      Promise.resolve().then(() => db.fetchReviewIdentity(userId)).then(value => {
        if (active && currentRequest === request) setSnapshot({ db, userId, identity: value || null });
      }).catch(() => {
        // A transient read failure keeps the last confirmed display. Auth
        // owner changes notify the subscription and clear it synchronously.
      });
    };
    const unsubscribe = userId ? db?.subscribeReviewIdentity?.(userId, refresh) : undefined;
    refresh();
    return () => { active = false; request += 1; unsubscribe?.(); };
  }, [db, userId]);

  const path = userId && normalizeCommunityAvatarPath(identity?.avatarPath, userId);
  const customSource = path && isReviewAvatarDataUrl(identity?.avatarDataUrl) ? identity.avatarDataUrl : '';
  // Missing/unknown/invalid custom paths must never flash the old preset.
  const presetSource = identity?.avatarPath === null && identity?.avatarKey
    ? getCommunityAvatarOption(identity.avatarKey).src : '';
  const source = customSource || presetSource;
  const imageFailed = failedImage?.db === db && failedImage?.userId === userId && failedImage?.source === source;

  return <>
    <span className="settings-report-avatar">
      <span className="settings-report-avatar-image">
        {source && !imageFailed
          ? <img key={source} src={source} alt="" draggable={false} className="h-full w-full object-cover" data-custom-avatar={Boolean(customSource)} onError={() => setFailedImage({ db, userId, source })} />
          : <User className="h-7 w-7 text-white/22" aria-hidden="true" />}
      </span>
      <span className="settings-report-avatar-edit"><Pencil className="h-2.5 w-2.5" strokeWidth={1.8} /></span>
    </span>
    <span className="settings-report-identity-text">
      <span className="settings-report-name">{identity?.nickname || t(language, 'settings.communityProfile', '社区资料')}</span>
      <span className="settings-report-profile-label">{t(language, 'settings.communityProfile', '社区资料')}</span>
    </span>
  </>;
}
