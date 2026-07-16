function exactSnapshot(snapshots, accountId, month) {
  return (Array.isArray(snapshots) ? snapshots : []).find((snapshot) => (
    snapshot?.accountId === accountId && snapshot?.month === month
  )) || null;
}

function normalizedDraftEntries(draft) {
  return draft && typeof draft === 'object' && !Array.isArray(draft)
    ? Object.entries(draft)
    : [];
}

/**
 * Turns touched balance inputs into explicit ledger mutations.
 *
 * A blank or numeric zero means that the user removed the monthly record. It
 * is therefore deleted when one exists and never persisted as a zero snapshot.
 */
export function buildAccountSnapshotMutations({ draft = {}, snapshots = [], month } = {}) {
  const upserts = [];
  const deletions = [];
  const invalid = [];
  const entries = normalizedDraftEntries(draft);

  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    entries.forEach(([accountId, rawValue]) => {
      invalid.push({ accountId, month, value: rawValue });
    });
    return { upserts, deletions, invalid };
  }

  for (const [accountId, rawValue] of entries) {
    if (!accountId) continue;
    const existing = exactSnapshot(snapshots, accountId, month);
    const text = String(rawValue ?? '').trim();

    if (text === '') {
      deletions.push({ accountId, month });
      continue;
    }

    const balance = Number(text);
    if (!Number.isFinite(balance) || balance < 0) {
      invalid.push({ accountId, month, value: rawValue });
      continue;
    }

    if (balance === 0) {
      deletions.push({ accountId, month });
      continue;
    }

    if (Number(existing?.balance) === balance) continue;
    upserts.push({ accountId, month, balance });
  }

  return { upserts, deletions, invalid };
}

export function applyAccountSnapshotMutations(snapshots = [], { upserts = [], deletions = [] } = {}) {
  const source = Array.isArray(snapshots) ? snapshots : [];
  const deletionKeys = new Set(deletions.map(({ accountId, month }) => `${accountId}::${month}`));
  const upsertKeys = new Set(upserts.map(({ accountId, month }) => `${accountId}::${month}`));
  const existingByKey = new Map();
  source.forEach((snapshot) => {
    const key = `${snapshot?.accountId}::${snapshot?.month}`;
    if (!existingByKey.has(key)) existingByKey.set(key, snapshot);
  });

  const next = source.filter((snapshot) => {
    const key = `${snapshot?.accountId}::${snapshot?.month}`;
    return !deletionKeys.has(key) && !upsertKeys.has(key);
  });
  upserts.forEach(({ accountId, month, balance }) => {
    const key = `${accountId}::${month}`;
    const existing = existingByKey.get(key);
    next.push({
      ...(existing || {}),
      id: existing?.id || `snapshot_${accountId}_${month}`,
      accountId,
      month,
      balance,
    });
  });
  return next;
}
