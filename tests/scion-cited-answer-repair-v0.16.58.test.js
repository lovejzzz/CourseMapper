import { describe, expect, it } from 'vitest';

import { buildScionCitedAnswerRepairV01658Audit } from '../scripts/scionCitedAnswerRepairV01658Audit.mjs';

describe('Scion v0.16.58 source-lineage cited-answer repair replay', () => {
  it('repairs only the four frozen source-bound conflicts and preserves every reference artifact', async () => {
    const report = await buildScionCitedAnswerRepairV01658Audit();

    expect(report).toMatchObject({
      status: 'four-source-bound-answer-conflicts-safely-repaired',
      local: {
        summary: {
          cases: 14,
          admittedBefore: 1,
          admittedAfter: 1,
          issueInstancesHistoricalBefore: 70,
          issueInstancesBefore: 76,
          issueInstancesAfter: 72,
          answerFeedbackConflictsBefore: 8,
          answerFeedbackConflictsAfter: 4,
          answerIndexesRepaired: 4,
          introducedIssues: 0,
          newlyDetectedBaselineIssues: 8,
          nonAnswerMutations: 0,
          trainingRowsCreated: 0,
        },
      },
      reference: {
        summary: {
          cases: 14,
          admittedBefore: 8,
          admittedAfter: 8,
          issueInstancesHistoricalBefore: 0,
          issueInstancesBefore: 6,
          issueInstancesAfter: 6,
          answerIndexesRepaired: 0,
          introducedIssues: 0,
          newlyDetectedBaselineIssues: 6,
          nonAnswerMutations: 0,
        },
      },
      burden: { additionalModelCalls: 0, additionalDownloads: 0, changedFields: 4 },
    });
    expect(Object.values(report.assertions).every(Boolean)).toBe(true);
  });
});
