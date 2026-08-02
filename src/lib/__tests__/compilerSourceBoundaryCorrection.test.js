import { describe, expect, it } from 'vitest';

import {
  buildCompilerSourceBoundaryCorrection,
  collectCompilerSourceBoundaryCorrections,
  compactLegacyCompilerSourceBoundaryCorrection,
  isCompilerSourceBoundaryCorrection,
  isCompilerSourceBoundaryDirective,
} from '../compilerSourceBoundaryCorrection.js';

describe('compilerSourceBoundaryCorrection', () => {
  it('classifies only exact compiler correction and reference contracts', () => {
    expect(isCompilerSourceBoundaryCorrection("Python: show the source basis and mark the inference's reach.")).toBe(
      true,
    );
    expect(isCompilerSourceBoundaryDirective('Use the established Python evidence-boundary check.')).toBe(true);
    expect(isCompilerSourceBoundaryDirective('Cite supporting evidence and name its limit.')).toBe(true);
    expect(isCompilerSourceBoundaryDirective('Use Python evidence to explain the observed output.')).toBe(false);
  });

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

    expect([...corrections.get('lesson-1').entries()]).toEqual([[trusted, 'U.S. policy (EBP)']]);
    expect(corrections.has('lesson-2')).toBe(false);
    expect(
      compactLegacyCompilerSourceBoundaryCorrection(`Correction: ${trusted}`, {
        authorizedCorrections: corrections.get('lesson-1'),
        variantSeed: 'slideDecks:lesson-1',
      }),
    ).toMatch(/^Correction: U\.S\. policy \(EBP\):/);
    expect(
      compactLegacyCompilerSourceBoundaryCorrection(untrusted, {
        authorizedCorrections: corrections.get('lesson-2'),
        variantSeed: 'lessonPlans:lesson-2',
      }),
    ).toBe(untrusted);
  });

  it('does not let one researched lesson authorize identical instructor prose in another lesson', () => {
    const identical =
      'Cite the specific definition or fact that supports the Statistical Modeling claim, then state what that evidence does not establish.';
    const corrections = collectCompilerSourceBoundaryCorrections({
      enrichmentOverlay: {
        lessonContent: {
          'lesson-1': {
            conceptProvenance: { source: 'algi-researched' },
            keyTerms: [{ term: 'Statistical Modeling', correction: identical }],
          },
          'lesson-2': {
            enrichmentSource: 'instructor-authored',
            keyTerms: [{ term: 'Statistical Modeling', correction: identical }],
          },
        },
      },
    });

    expect(corrections.get('lesson-1')?.get(identical)).toBe('Statistical Modeling');
    expect(corrections.has('lesson-2')).toBe(false);
    expect(
      compactLegacyCompilerSourceBoundaryCorrection(identical, {
        authorizedCorrections: corrections.get('lesson-2'),
      }),
    ).toBe(identical);
  });
});
