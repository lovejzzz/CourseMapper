import crypto from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  auditScionSourceBoundPreferenceMigration,
  buildScionSourceBoundPreferenceMigration,
} from '../scripts/scionSourceBoundPreferenceMigration.mjs';

describe('Scion source-bound preference migration', () => {
  it('restores the exact judged source context without changing preference artifacts', async () => {
    const result = await buildScionSourceBoundPreferenceMigration();
    expect(result.receipt).toMatchObject({
      protocol: 'scion-source-bound-preference-migration-v1',
      status: 'source-context-restored',
      restoredRows: 46,
      missingRows: 0,
      changedPreferenceOutcomes: 0,
      changedChosenArtifacts: 0,
      changedRejectedArtifacts: 0,
      promptProtocol: 'source-bound-row-prompt-v1',
    });
    expect(result.outputRows).toHaveLength(result.inputRows.length);
    for (let index = 0; index < result.outputRows.length; index += 1) {
      const before = result.inputRows[index];
      const after = result.outputRows[index];
      expect(after).toMatchObject({
        reviewPairId: before.reviewPairId,
        prompt: before.prompt,
        chosen: before.chosen,
        rejected: before.rejected,
        sourceContext: { kernelId: expect.any(String), claims: expect.any(Array) },
      });
      expect(crypto.createHash('sha256').update(JSON.stringify(after.sourceContext)).digest('hex')).toBe(
        before.preferenceEvidence.sourceContextSha256,
      );
    }
    await expect(auditScionSourceBoundPreferenceMigration()).resolves.toEqual({
      valid: true,
      issues: [],
      rows: 46,
    });
  });
});
