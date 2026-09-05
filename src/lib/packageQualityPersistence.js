import { admitPackageReceipt } from './packageTrustStatus';

const TERMINAL_PACKAGE_STATUSES = new Set(['ready', 'blocked']);

function isRecord(value) {
  try {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  } catch {
    return false;
  }
}

function readSnapshotEvidenceDescriptors(snapshot) {
  if (!isRecord(snapshot)) return {};
  try {
    const descriptors = Object.getOwnPropertyDescriptors(snapshot);
    const packageDescriptor = descriptors.packageQualityPass;
    const digestDescriptor = descriptors.lastRunDigest;
    if (
      (packageDescriptor && !Object.prototype.hasOwnProperty.call(packageDescriptor, 'value')) ||
      (digestDescriptor && !Object.prototype.hasOwnProperty.call(digestDescriptor, 'value'))
    ) {
      return null;
    }
    return {
      packageQualityPass: packageDescriptor?.value,
      lastRunDigest: digestDescriptor?.value,
    };
  } catch {
    return null;
  }
}

/**
 * Persist only a completed package judgment. A mid-generation or idle state
 * must never return from storage wearing stale progress or an invented grade.
 */
export function selectPersistablePackageEvidence(evidenceEnvelope = {}) {
  const envelopeAdmission = admitPackageReceipt(evidenceEnvelope);
  if (!envelopeAdmission.valid || !isRecord(envelopeAdmission.receipt)) return {};

  const packageAdmission = admitPackageReceipt(envelopeAdmission.receipt.packageQualityPass);
  if (!packageAdmission.valid || !isRecord(packageAdmission.receipt)) return {};
  const packageQualityPass = packageAdmission.receipt;
  if (!TERMINAL_PACKAGE_STATUSES.has(String(packageQualityPass.status || ''))) return {};

  const receiptSource = packageQualityPass.receipt;
  const receiptAdmission = admitPackageReceipt(receiptSource);
  if (receiptSource === null || receiptSource === undefined || !receiptAdmission.valid) return {};

  const digestSource = envelopeAdmission.receipt.lastRunDigest;
  const digestAdmission = admitPackageReceipt(digestSource);
  if (!digestAdmission.valid) return {};

  const persistablePackageQualityPass = packageQualityPass;
  persistablePackageQualityPass.receipt = receiptAdmission.receipt;
  const persistableLastRunDigest = isRecord(digestAdmission.receipt) ? digestAdmission.receipt : null;

  return {
    packageQualityPass: persistablePackageQualityPass,
    ...(persistableLastRunDigest ? { lastRunDigest: persistableLastRunDigest } : {}),
  };
}

export function restorePersistedPackageEvidence(snapshot = {}) {
  const evidenceEnvelope = readSnapshotEvidenceDescriptors(snapshot);
  const selected = evidenceEnvelope ? selectPersistablePackageEvidence(evidenceEnvelope) : {};
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
