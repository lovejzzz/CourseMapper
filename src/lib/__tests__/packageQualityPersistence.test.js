import { describe, expect, it } from 'vitest';

import { restorePersistedPackageEvidence, selectPersistablePackageEvidence } from '../packageQualityPersistence.js';
import { sanitizeProjectSnapshot } from '../projectSnapshotSanitizer.js';

describe('package quality persistence', () => {
  const ready = {
    status: 'ready',
    message: 'Verified.',
    quality: { status: 'graded', score: 98, grade: 'A' },
    receipt: { exportChecked: 11 },
  };
  const digest = { finishRunId: 'finish-1', gates: { flaggedChecks: [] } };

  it('round-trips terminal verification and grade evidence', () => {
    const selected = selectPersistablePackageEvidence({ packageQualityPass: ready, lastRunDigest: digest });
    expect(selected).toEqual({ packageQualityPass: ready, lastRunDigest: digest });
    expect(restorePersistedPackageEvidence(selected)).toEqual(selected);
  });

  it.each(['idle', 'running'])('does not persist a %s progress state', (status) => {
    expect(
      selectPersistablePackageEvidence({
        packageQualityPass: { status, phase: 'grade', message: 'Grading…' },
        lastRunDigest: digest,
      }),
    ).toEqual({});
  });

  it('does not persist a generation failure that has no verification evidence', () => {
    expect(
      selectPersistablePackageEvidence({
        packageQualityPass: { status: 'blocked', blockers: 1, message: 'Generation failed.' },
      }),
    ).toEqual({});
  });

  it.each(['packageQualityPass', 'lastRunDigest'])(
    'admits the selector envelope before reading a throwing %s accessor',
    (field) => {
      let reads = 0;
      const envelope = {
        packageQualityPass: ready,
        lastRunDigest: digest,
      };
      Object.defineProperty(envelope, field, {
        enumerable: true,
        get() {
          reads += 1;
          throw new Error(`${field} getter executed`);
        },
      });

      expect(selectPersistablePackageEvidence(envelope)).toEqual({});
      expect(reads).toBe(0);
    },
  );

  it.each(['status', 'quality', 'receipt'])(
    'admits the complete package judgment before reading a throwing %s accessor',
    (field) => {
      let reads = 0;
      const packageQualityPass = { ...ready };
      Object.defineProperty(packageQualityPass, field, {
        enumerable: true,
        get() {
          reads += 1;
          throw new Error(`${field} getter executed`);
        },
      });

      expect(selectPersistablePackageEvidence({ packageQualityPass, lastRunDigest: digest })).toEqual({});
      expect(restorePersistedPackageEvidence({ packageQualityPass, lastRunDigest: digest })).toMatchObject({
        packageQualityPass: { status: 'idle' },
      });
      expect(reads).toBe(0);
    },
  );

  it('fails closed without semantically reading proxy-wrapped digest or selector state', () => {
    let reads = 0;
    const countRead = {
      get(target, property, receiver) {
        reads += 1;
        return Reflect.get(target, property, receiver);
      },
    };
    const proxiedDigest = new Proxy(digest, countRead);
    const proxiedEnvelope = new Proxy({ packageQualityPass: ready, lastRunDigest: digest }, countRead);

    expect(selectPersistablePackageEvidence({ packageQualityPass: ready, lastRunDigest: proxiedDigest })).toEqual({});
    expect(selectPersistablePackageEvidence(proxiedEnvelope)).toEqual({});
    expect(reads).toBe(0);
  });

  it('restores idle from a revoked snapshot proxy', () => {
    const revoked = Proxy.revocable({ packageQualityPass: ready, lastRunDigest: digest }, {});
    revoked.revoke();

    expect(restorePersistedPackageEvidence(revoked.proxy)).toMatchObject({
      packageQualityPass: { status: 'idle' },
      lastRunDigest: null,
    });
  });

  it.each(['ready', 'blocked'])('does not let an unrelated digest authenticate a receiptless %s state', (status) => {
    const snapshot = {
      packageQualityPass: { status, message: 'Stale terminal state.' },
      lastRunDigest: { finishRunId: 'old-run' },
    };

    expect(selectPersistablePackageEvidence(snapshot)).toEqual({});
    expect(restorePersistedPackageEvidence(snapshot)).toMatchObject({
      packageQualityPass: { status: 'idle' },
      lastRunDigest: null,
    });
  });

  it.each(['packageQualityPass', 'lastRunDigest'])(
    'restores idle without reading a snapshot-root %s accessor',
    (field) => {
      let reads = 0;
      const snapshot = {};
      Object.defineProperty(snapshot, field, {
        enumerable: true,
        get() {
          reads += 1;
          throw new Error(`${field} getter executed`);
        },
      });

      expect(restorePersistedPackageEvidence(snapshot)).toMatchObject({
        packageQualityPass: { status: 'idle' },
        lastRunDigest: null,
      });
      expect(reads).toBe(0);
    },
  );

  it.each([
    'exportFailed',
    'exportStatus',
    'finalizerRevision',
    'packageReadinessReceipt',
    'exportChecked',
    'autoFixedCount',
  ])('omits invalid terminal evidence before persistence can read a throwing %s getter', (field) => {
    let reads = 0;
    const receipt = { exportChecked: 11 };
    Object.defineProperty(receipt, field, {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error(`${field} getter executed`);
      },
    });
    const selected = selectPersistablePackageEvidence({
      packageQualityPass: { ...ready, receipt },
      lastRunDigest: digest,
    });

    expect(selected).toEqual({});
    expect(() => sanitizeProjectSnapshot({ courseMap: { lessons: [] }, ...selected })).not.toThrow();
    expect(restorePersistedPackageEvidence({ packageQualityPass: { ...ready, receipt } })).toMatchObject({
      packageQualityPass: { status: 'idle' },
    });
    expect(reads).toBe(0);
  });

  it.each(['exportVerification', 'downloadSafety'])(
    'omits invalid terminal evidence before persistence can read a nested %s getter',
    (field) => {
      let reads = 0;
      const packageReadinessReceipt = {};
      Object.defineProperty(packageReadinessReceipt, field, {
        enumerable: true,
        get() {
          reads += 1;
          throw new Error(`${field} getter executed`);
        },
      });
      const receipt = { exportChecked: 11, packageReadinessReceipt };

      expect(
        selectPersistablePackageEvidence({ packageQualityPass: { ...ready, receipt }, lastRunDigest: digest }),
      ).toEqual({});
      expect(reads).toBe(0);
    },
  );

  it('restores missing or compact evidence to an honest idle state', () => {
    expect(restorePersistedPackageEvidence({})).toEqual({
      packageQualityPass: {
        status: 'idle',
        message: '',
        repairsApplied: 0,
        warnings: 0,
        blockers: 0,
      },
      lastRunDigest: null,
    });
  });
});
