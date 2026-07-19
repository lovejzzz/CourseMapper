import { describe, expect, it } from 'vitest';

import { buildScionSourceLedgerV01659Audit } from '../scionSourceLedgerV01659Audit.mjs';

describe('Scion v0.16.59 source-ledger evidence', () => {
  it('binds exact facts, seven domains, current qualified preferences, and the frozen ruler', async () => {
    const report = await buildScionSourceLedgerV01659Audit();
    expect(Object.values(report.assertions).every(Boolean)).toBe(true);
    expect(report.crossDomain).toMatchObject({
      pairs: 7,
      domains: 7,
      localCurrentAdmission: { admitted: 0, rejected: 7 },
      referenceCurrentAdmission: { admitted: 2, rejected: 5 },
      pairedJudge: { referenceWins: 7, scoreQualifiedBeforeCurrentReplay: 3, reversedOrderSessions: 4 },
      trainingPreferences: { rows: 2, currentCompilerAdmitted: true },
    });
    expect(report.frozenRegression).toEqual({
      stableLossesDetected: 78,
      historicalCoreDetected: 46,
      preferredRegressions: 0,
    });
  });
});
