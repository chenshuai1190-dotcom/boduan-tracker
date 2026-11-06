import React from 'react';
import { getCommunityAvatarOption } from '../lib/communityProfile.js';
import { isCommunityAvatarOwner, isCommunityAvatarSignedUrl, normalizeCommunityAvatarPath } from '../lib/communityAvatarModel.js';
import { fetchCommunityAvatar, subscribeCommunityAvatar } from '../lib/communityAvatarDb.js';

/** Owner avatars are shared, short-lived signed reads; authorized leaderboard
 * responses can supply signedUrl without attempting another user's profile. */
export default function UserAvatar({ userId, avatarKey, avatarPath, signedUrl, className = '', alt = '', previewUrl }) {
  const [version, setVersion] = React.useState(0), [state, setState] = React.useState({ key: '', url: '' });
  const retry = React.useRef(false), fallback = getCommunityAvatarOption(avatarKey).src;
  const key = `${userId || ''}:${avatarPath === undefined ? 'profile' : avatarPath || ''}:${version}`;
  const authorizedUrl = isCommunityAvatarSignedUrl(signedUrl, { supabaseUrl: import.meta.env.VITE_SUPABASE_URL, path: avatarPath || undefined }) ? signedUrl : '';
  const localPreview = import.meta.env.DEV && typeof previewUrl === 'string' && /^(?:blob:|data:image\/(?:png|jpeg|webp);base64,|\/community-avatars\/)/.test(previewUrl) ? previewUrl : '';
  React.useEffect(() => { retry.current = false; return subscribeCommunityAvatar(userId, () => { retry.current = false; setVersion(value => value + 1); }); }, [userId, avatarPath, signedUrl]);
  React.useEffect(() => {
    let active = true; setState({ key, url: '' });
    if (localPreview || authorizedUrl || !isCommunityAvatarOwner(userId) || avatarPath === null) return undefined;
    if (avatarPath !== undefined && !normalizeCommunityAvatarPath(avatarPath, userId)) return undefined;
    fetchCommunityAvatar(userId, { path: avatarPath }).then(value => { if (active) setState({ key, url: value.url }); }).catch(() => {});
    return () => { active = false; };
  }, [userId, avatarPath, key, localPreview, authorizedUrl]);
  const source = localPreview || authorizedUrl || (state.key === key ? state.url : '') || fallback;
  return <img src={source} alt={alt} className={className} data-custom-avatar={source !== fallback} draggable={false} crossOrigin={source === fallback || localPreview ? undefined : 'anonymous'} onError={event => {
    if (source === fallback) return;
    event.currentTarget.src = fallback;
    if (!authorizedUrl && !localPreview && !retry.current && isCommunityAvatarOwner(userId)) {
      retry.current = true;
      fetchCommunityAvatar(userId, { force: true, path: avatarPath }).then(value => setState({ key, url: value.url })).catch(() => {});
    }
  }} />;
}
