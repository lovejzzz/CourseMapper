import { describe, expect, it } from 'vitest';

import { summarizeDirectPackageFinish } from '../ChatPanel';

describe('ChatPanel package trust summaries', () => {
  it('preserves canonical blocker domains in the synthetic direct-finish path', () => {
    expect(
      summarizeDirectPackageFinish({
        status: 'blocked',
        blockers: 1,
        warnings: 0,
        blockerDomains: {
          schemaVersion: 1,
          readiness: 0,
          quality: 0,
          export: 1,
          total: 1,
        },
        warningDomains: {
          schemaVersion: 1,
          readiness: 0,
          retry: 0,
          export: 0,
          quality: 0,
          source: 0,
          total: 0,
        },
        receipt: { exportFailed: 1, exportWarningCount: 0 },
        quality: { status: 'not-graded', reason: 'export verification failed' },
      }),
    ).toBe('Decision needed: 1 blocker. Check the receipt before downloading.');
  });
});
