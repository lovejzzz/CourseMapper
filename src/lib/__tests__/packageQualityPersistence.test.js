import { describe, expect, it } from 'vitest';

import { restorePersistedPackageEvidence, selectPersistablePackageEvidence } from '../packageQualityPersistence.js';

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
