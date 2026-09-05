import { describe, expect, it } from 'vitest';

import {
  buildDataScenarioMaterials,
  collectCompilerScenarioMaterials,
  compactCompilerScenarioMaterials,
} from '../compilerScenarioMaterials.js';

describe('compilerScenarioMaterials', () => {
  it('builds term-specific deterministic evidence packets with real lexical variation', () => {
    const packets = Array.from({ length: 18 }, (_, index) =>
      buildDataScenarioMaterials('Data cleansing', `lesson-${index + 1}`),
    );

    expect(packets.every((packet) => packet.includes('Data cleansing'))).toBe(true);
    expect(new Set(packets).size).toBeGreaterThanOrEqual(4);
    expect(buildDataScenarioMaterials('Data cleansing', 'lesson-4')).toBe(packets[3]);
  });

  it('varies only exact derived materials authorized by research-backed CourseGraph lineage', () => {
    const trusted = 'the supplied dataset record, transformation log, competing claims, and documented uncertainty';
    const untrusted = 'the instructor dataset record, transformation log, competing claims, and documented uncertainty';
    const materials = collectCompilerScenarioMaterials({
      enrichmentOverlay: {
        lessonContent: {
          'lesson-1': {
            enrichmentSource: 'scion-source-researched',
            conceptProvenance: { source: 'algi-researched' },
            keyTerms: [{ term: 'Data cleansing' }],
            kernel: { scenario: { source: 'derived-kernel-fallback', materials: trusted } },
          },
          'lesson-2': {
            enrichmentSource: 'instructor-authored',
            keyTerms: [{ term: 'Instructor data review' }],
            kernel: { scenario: { source: 'derived-kernel-fallback', materials: untrusted } },
          },
        },
      },
    });

    expect([...materials.get('lesson-1').entries()]).toEqual([[trusted, 'Data cleansing']]);
    expect(materials.has('lesson-2')).toBe(false);
    expect(
      compactCompilerScenarioMaterials(`Use ${trusted} to test the claim.`, {
        authorizedMaterials: materials.get('lesson-1'),
        variantSeed: 'studyGuides:lesson-1',
      }),
    ).toMatch(/^Use the Data cleansing /);
    expect(
      compactCompilerScenarioMaterials(untrusted, {
        authorizedMaterials: materials.get('lesson-2'),
        variantSeed: 'lessonPlans:lesson-2',
      }),
    ).toBe(untrusted);
  });

  it('does not let one researched lesson authorize identical instructor materials in another lesson', () => {
    const identical = 'the supplied dataset record, transformation log, competing claims, and documented uncertainty';
    const materials = collectCompilerScenarioMaterials({
      enrichmentOverlay: {
        lessonContent: {
          'lesson-1': {
            conceptProvenance: { source: 'algi-researched' },
            keyTerms: [{ term: 'Data cleansing' }],
            kernel: { scenario: { source: 'derived-kernel-fallback', materials: identical } },
          },
          'lesson-2': {
            enrichmentSource: 'instructor-authored',
            keyTerms: [{ term: 'Data cleansing' }],
            kernel: { scenario: { source: 'derived-kernel-fallback', materials: identical } },
          },
        },
      },
    });

    expect(materials.get('lesson-1')?.get(identical)).toBe('Data cleansing');
    expect(materials.has('lesson-2')).toBe(false);
    expect(compactCompilerScenarioMaterials(identical, { authorizedMaterials: materials.get('lesson-2') })).toBe(
      identical,
    );
  });
});
