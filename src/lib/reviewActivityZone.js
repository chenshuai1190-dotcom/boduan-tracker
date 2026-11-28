const validatedZones = new Set();
const namedZone = /^(?:UTC|GMT|(?:Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc|US|Canada|Brazil|Chile|Mexico)\/[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)?)$/;

export function normalizeReviewActivityTimeZone(value) {
  const zone = typeof value === 'string' ? value.trim() : '';
  if (!zone || zone.length > 100 || !namedZone.test(zone)) return undefined;
  if (validatedZones.has(zone)) return zone;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    if (validatedZones.size >= 128) validatedZones.delete(validatedZones.values().next().value);
    validatedZones.add(zone);
    return zone;
  } catch {
    return undefined;
  }
}

export function deviceReviewActivityTimeZone() {
  try {
    return normalizeReviewActivityTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return undefined;
  }
}
