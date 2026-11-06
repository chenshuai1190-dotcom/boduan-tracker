import {
  isCommunityAvatarOwner, normalizeCommunityAvatarPath, isCommunityAvatarSignedUrl,
} from '../src/lib/communityAvatarModel.js';

export const COMPETITION_AVATAR_URL_SECONDS = 600;

// Call only after membership/publication checks, with owners emitted by the
// existing leaderboard's public-row projection. Never enumerate Storage.
export async function attachCompetitionAvatars({ leaders = [], self = null, visibleOwners,
  readProfiles, signPaths, supabaseUrl, now = Date.now() } = {}) {
  const rows = [...leaders, ...(self ? [self] : [])];
  const ownerIds = [...new Set(rows.map(row => visibleOwners?.get(row)).filter(isCommunityAvatarOwner))];
  if (!ownerIds.length) return { leaders, self };
  try {
    const profiles = await readProfiles(ownerIds);
    const allowed = new Set(ownerIds);
    const byOwner = new Map();
    const duplicates = new Set();
    for (const profile of Array.isArray(profiles) ? profiles : []) {
      if (!allowed.has(profile?.user_id)) continue;
      if (byOwner.has(profile.user_id)) { duplicates.add(profile.user_id); continue; }
      byOwner.set(profile.user_id, normalizeCommunityAvatarPath(profile.avatar_path, profile.user_id));
    }
    for (const owner of duplicates) byOwner.delete(owner);
    const paths = [...new Set([...byOwner.values()].filter(Boolean))];
    if (!paths.length) return { leaders, self };
    const signed = await signPaths(paths, COMPETITION_AVATAR_URL_SECONDS);
    const allowedPaths = new Set(paths);
    const byPath = new Map();
    for (const entry of Array.isArray(signed) ? signed : []) {
      if (!allowedPaths.has(entry?.path) || entry.error) continue;
      const candidate = entry.signedURL || entry.signedUrl;
      if (typeof candidate !== 'string') continue;
      const url = candidate.startsWith('/object/sign/')
        ? new URL(`/storage/v1${candidate}`, supabaseUrl).href : new URL(candidate, supabaseUrl).href;
      if (isCommunityAvatarSignedUrl(url, { supabaseUrl, path: entry.path })) byPath.set(entry.path, url);
    }
    const expiresAt = new Date(Number(now) + COMPETITION_AVATAR_URL_SECONDS * 1000).toISOString();
    const attach = row => {
      if (!row) return row;
      const url = byPath.get(byOwner.get(visibleOwners.get(row)));
      return url ? { ...row, avatarUrl: url, avatarExpiresAt: expiresAt } : row;
    };
    return { leaders: leaders.map(attach), self: attach(self) };
  } catch {
    // Missing migration/bucket or a signing outage must not hide the ranking.
    return { leaders, self };
  }
}
