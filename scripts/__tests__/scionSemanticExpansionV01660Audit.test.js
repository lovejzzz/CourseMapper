import { describe, expect, it } from 'vitest';

import { buildScionSemanticExpansionV01660Audit } from '../scionSemanticExpansionV01660Audit.mjs';

describe('Scion v0.16.60 semantic expansion evidence', () => {
  it('binds a balanced 14-case wave to 13 qualified rows and a 20-row ruler', async () => {
    const report = await buildScionSemanticExpansionV01660Audit();
    expect(Object.values(report.assertions).every(Boolean)).toBe(true);
    expect(report.capture).toMatchObject({
      local: { calls: 14, admitted: 1, retained: 13, adapterActive: false },
      reference: { calls: 14, admitted: 8, retained: 6, concurrency: 4 },
    });
    expect(report.evaluation).toMatchObject({
      directQualified: 7,
      firstRepairQualified: 3,
      secondRepairQualified: 3,
      expansionQualified: 13,
      quarantinedOrderUnstable: 1,
      judgeOrderSessions: 12,
      winnerCriticalDefects: 0,
    });
    expect(report.trainingPreferences).toMatchObject({
      priorQualifiedRows: 7,
      expansionQualifiedRows: 13,
      cumulativeQualifiedRows: 20,
      targetRows: 100,
      progressPercent: 20,
      exactSourceLedgerPreserved: true,
    });
  });
});
