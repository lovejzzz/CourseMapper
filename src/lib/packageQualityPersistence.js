import { admitPackageReceipt } from './packageTrustStatus';

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

  const receiptSource = packageQualityPass?.receipt;
  const receiptAdmission = admitPackageReceipt(receiptSource);
  if (receiptSource !== null && receiptSource !== undefined && !receiptAdmission.valid) return {};

  let persistablePackageQualityPass;
  let persistableLastRunDigest;
  try {
    persistablePackageQualityPass = structuredClone(packageQualityPass);
    if (receiptAdmission.receipt) persistablePackageQualityPass.receipt = receiptAdmission.receipt;
    persistableLastRunDigest =
      lastRunDigest && typeof lastRunDigest === 'object' ? structuredClone(lastRunDigest) : null;
  } catch {
    return {};
  }

  return {
    packageQualityPass: persistablePackageQualityPass,
    ...(persistableLastRunDigest ? { lastRunDigest: persistableLastRunDigest } : {}),
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
