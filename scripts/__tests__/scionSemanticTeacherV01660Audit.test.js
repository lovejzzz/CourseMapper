import { describe, expect, it } from 'vitest';

import { buildScionSemanticTeacherV01660Audit } from '../scionSemanticTeacherV01660Audit.mjs';

describe('Scion v0.16.60 semantic-teacher evidence', () => {
  it('binds five new qualified rows and a seven-domain cumulative ruler', async () => {
    const report = await buildScionSemanticTeacherV01660Audit();
    expect(Object.values(report.assertions).every(Boolean)).toBe(true);
    expect(report.revisionLane).toMatchObject({
      isolatedSessions: 6,
      authoredCandidates: 6,
      compilerAdmitted: 6,
      firstPassQualified: 4,
      targetedSecondPassQualified: 1,
    });
    expect(report.pairedJudge).toMatchObject({
      isolatedOrderSessions: 6,
      stableReferenceWins: 6,
      scoreQualifiedRows: 5,
      minimumWinnerScore: 3,
      minimumTotalScoreMargin: 15,
      winnerCriticalDefects: 0,
    });
    expect(report.trainingPreferences).toMatchObject({
      priorQualifiedRows: 2,
      newQualifiedRows: 5,
      cumulativeQualifiedRows: 7,
      exactSourceLedgerPreserved: true,
    });
    expect(report.trainingPreferences.cumulativeDomains).toHaveLength(7);
  });
});
