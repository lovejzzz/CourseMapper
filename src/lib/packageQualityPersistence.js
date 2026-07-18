const TERMINAL_PACKAGE_STATUSES = new Set(['ready', 'blocked']);

function hasVerificationEvidence(packageQualityPass, lastRunDigest) {
  return Boolean(
    packageQualityPass?.quality ||
    packageQualityPass?.receipt ||
    (lastRunDigest && typeof lastRunDigest === 'object' && lastRunDigest.finishRunId),
  );
}

/**
 * Persist only a completed package judgment. A mid-generation or idle state
 * must never return from storage wearing stale progress or an invented grade.
 */
export function selectPersistablePackageEvidence({ packageQualityPass, lastRunDigest } = {}) {
  if (
    !TERMINAL_PACKAGE_STATUSES.has(String(packageQualityPass?.status || '')) ||
    !hasVerificationEvidence(packageQualityPass, lastRunDigest)
  ) {
    return {};
  }

  return {
    packageQualityPass,
    ...(lastRunDigest && typeof lastRunDigest === 'object' ? { lastRunDigest } : {}),
  };
}

export function restorePersistedPackageEvidence(snapshot = {}) {
  const selected = selectPersistablePackageEvidence({
    packageQualityPass: snapshot?.packageQualityPass,
    lastRunDigest: snapshot?.lastRunDigest,
  });
  return {
    packageQualityPass: selected.packageQualityPass || {
      status: 'idle',
      message: '',
      repairsApplied: 0,
      warnings: 0,
      blockers: 0,
    },
    lastRunDigest: selected.lastRunDigest || null,
  };
}
