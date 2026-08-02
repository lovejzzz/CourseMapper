import { describe, expect, it } from 'vitest';

import {
  buildCompilerSourceBoundaryCorrection,
  collectCompilerSourceBoundaryCorrections,
  compactLegacyCompilerSourceBoundaryCorrection,
} from '../compilerSourceBoundaryCorrection.js';

describe('compilerSourceBoundaryCorrection', () => {
  it('preserves punctuation-bearing terms and deterministically varies compiler copy', () => {
    const term = 'U.S. policy (EBP)';
    const corrections = Array.from({ length: 18 }, (_, index) =>
      buildCompilerSourceBoundaryCorrection(term, `lesson-${index + 1}`),
    );

    expect(corrections.every((correction) => correction.startsWith(`${term}:`))).toBe(true);
    expect(new Set(corrections).size).toBeGreaterThanOrEqual(4);
    expect(buildCompilerSourceBoundaryCorrection(term, 'lesson-3')).toBe(corrections[2]);
  });

  it('authorizes only exact corrections from explicitly research-backed CourseGraph payloads', () => {
    const trusted =
      'Cite the specific definition or fact that supports the U.S. policy (EBP) claim, then state what that evidence does not establish.';
    const untrusted =
      'Cite the specific definition or fact that supports the Instructor framework claim, then state what that evidence does not establish.';
    const corrections = collectCompilerSourceBoundaryCorrections({
      enrichmentOverlay: {
        lessonContent: {
          'lesson-1': {
            enrichmentSource: 'scion-source-researched',
            conceptProvenance: { source: 'algi-researched' },
            keyTerms: [{ term: 'U.S. policy (EBP)', correction: trusted }],
          },
          'lesson-2': {
            enrichmentSource: 'instructor-authored',
            keyTerms: [{ term: 'Instructor framework', correction: untrusted }],
          },
        },
      },
    });

    expect([...corrections.entries()]).toEqual([[trusted, 'U.S. policy (EBP)']]);
    expect(
      compactLegacyCompilerSourceBoundaryCorrection(`Correction: ${trusted}`, {
        authorizedCorrections: corrections,
        variantSeed: 'slideDecks:lesson-1',
      }),
    ).toMatch(/^Correction: U\.S\. policy \(EBP\):/);
    expect(
      compactLegacyCompilerSourceBoundaryCorrection(untrusted, {
        authorizedCorrections: corrections,
        variantSeed: 'lessonPlans:lesson-2',
      }),
    ).toBe(untrusted);
  });
});
