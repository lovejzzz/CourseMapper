import { describe, expect, it } from 'vitest';

import { buildScionSemanticExpansionV01662Audit } from '../scionSemanticExpansionV01662Audit.mjs';

describe('Scion v0.16.62 semantic expansion evidence', () => {
  it('binds 56 cases to 55 qualified rows and a 102-row source-grounded ruler', async () => {
    const report = await buildScionSemanticExpansionV01662Audit();
    expect(Object.values(report.assertions).every(Boolean)).toBe(true);
    expect(report.capture).toMatchObject({
      local: { calls: 56, admittedByCurrentCompiler: 5, adapterActive: false },
      reference: { calls: 56, admittedByCurrentCompiler: 52, concurrency: 4 },
    });
    expect(report.evaluation).toMatchObject({
      directPairs: 56,
      directReferenceWins: 56,
      directQualified: 46,
      firstRepairQualified: 7,
      secondRepairQualified: 2,
      expansionQualified: 55,
      quarantinedCases: 1,
      judgeOrderSessions: 26,
      teacherRevisionSessions: 17,
      winnerCriticalDefects: 0,
    });
    expect(report.trainingPreferences).toMatchObject({
      priorQualifiedRows: 47,
      expansionQualifiedRows: 55,
      cumulativeQualifiedRows: 102,
      targetRows: 100,
      progressPercent: 102,
      exactSourceLedgerPreserved: true,
    });
  });
});
