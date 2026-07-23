import { describe, expect, it } from 'vitest';

import {
  extractCheckpointProbePrompt,
  splitProductionTrainingPrompt,
  summarizeCheckpointCases,
} from '../scripts/scionAdapterCheckpointProbe.mjs';

const SYSTEM = 'Reasoning: low.\nYou are CourseMapper Scion.';
const LESSON = {
  lessonId: 'lesson-2',
  sourceFactPolicy: 'numbered-source-ledger-v1',
  title: 'Mantle convection',
  objectives: 'Use only supplied claims.',
  topics:
    'Claim 0: Mantle rock remains solid while flowing slowly. Claim 1: Upward mantle flow accompanies divergent plates. Claim 2: Subduction can occur at convergent boundaries.',
  readings: 'Open geology source',
};
const USER = `COURSE: Geology\nLESSONS TO AUTHOR:\n${JSON.stringify([LESSON])}\n\nTASK:\nReturn JSON.`;

describe('Scion adapter checkpoint semantic probe', () => {
  it('reconstructs the exact production system/user boundary used by serving', () => {
    expect(splitProductionTrainingPrompt(`${SYSTEM}\n\n${USER}`)).toEqual({ system: SYSTEM, user: USER });
    expect(splitProductionTrainingPrompt(USER)).toEqual({ system: '', user: USER });
  });

  it('extracts the frozen source ledger from a production training prompt', () => {
    const result = extractCheckpointProbePrompt(`${SYSTEM}\n\n${USER}`);
    expect(result).toMatchObject({
      valid: true,
      course: 'Geology',
      expectedLessonIds: ['lesson-2'],
      factCount: 3,
    });
    expect(result.assessmentPrompt).toContain('Lessons:\n');
    expect(result.lessons[0].topics).toContain('Claim 2:');
  });

  it('fails checkpoint preflight unless every case preserves facts, clears admission, and projects usefully', () => {
    const clean = {
      factIssues: [],
      admitted: true,
      projectedCoverage: { usable: true, complete: true },
      admissionRisk: { highRiskIssues: 0 },
      issues: [],
      durationMs: 100,
      outputCharacters: 600,
    };
    expect(summarizeCheckpointCases([clean, clean])).toMatchObject({
      exactFactLedgerRate: 1,
      admissionRate: 1,
      usableRate: 1,
      completeRate: 1,
      promotionPreflight: true,
    });
    const failed = summarizeCheckpointCases([
      clean,
      {
        ...clean,
        factIssues: ['lesson-2:fact-1:source-fact-ledger-mismatch'],
        admitted: false,
        issues: ['lesson-2:fact-1:source-fact-ledger-mismatch', 'lesson-2:duplicate-option'],
        admissionRisk: { highRiskIssues: 1 },
      },
    ]);
    expect(failed).toMatchObject({
      exactFactLedgerRate: 0.5,
      admissionRate: 0.5,
      highRiskCases: 1,
      promotionPreflight: false,
      issueFamilyCounts: { assessment: 1, 'fact-ledger': 1 },
    });
  });
});
