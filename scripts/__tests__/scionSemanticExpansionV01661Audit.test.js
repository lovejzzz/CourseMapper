import { describe, expect, it } from 'vitest';

import { buildScionSemanticExpansionV01661Audit } from '../scionSemanticExpansionV01661Audit.mjs';

describe('Scion v0.16.61 semantic expansion evidence', () => {
  it('binds a diverse 28-case wave to 27 qualified rows and a 47-row ruler', async () => {
    const report = await buildScionSemanticExpansionV01661Audit();
    expect(Object.values(report.assertions).every(Boolean)).toBe(true);
    expect(report.capture).toMatchObject({
      local: { calls: 28, admittedByCurrentCompiler: 0, adapterActive: false },
      reference: { calls: 28, admittedByCurrentCompiler: 21, concurrency: 4 },
    });
    expect(report.evaluation).toMatchObject({
      directPairs: 28,
      directReferenceWins: 28,
      directQualified: 19,
      firstRepairQualified: 7,
      finalRepairQualified: 1,
      expansionQualified: 27,
      quarantinedGeologyCases: 1,
      judgeOrderSessions: 16,
      winnerCriticalDefects: 0,
    });
    expect(report.trainingPreferences).toMatchObject({
      priorQualifiedRows: 20,
      expansionQualifiedRows: 27,
      cumulativeQualifiedRows: 47,
      targetRows: 100,
      progressPercent: 47,
      exactSourceLedgerPreserved: true,
    });
  });
});
