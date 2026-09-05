import { describe, expect, it } from 'vitest';

import { beginBlueprintRealizationTrace, restoreBlueprintRealizationTrace } from '../courseCompilerRealization.js';
import {
  lessonPracticeMoveVariant,
  slideClosingFeedbackVariant,
  slideInspectableEvidenceVariant,
  slideObjectiveFallbackVariant,
} from '../teachingMoveVariants.js';

const SURFACES = [
  [
    'practice',
    (lesson) =>
      lessonPracticeMoveVariant({
        lesson,
        concept: 'policy evidence',
        artifact: 'policy memo',
        basePracticeMove: 'Compare evidence choices',
        basePracticeClause: 'compare evidence choices',
        defaultPracticeMove: false,
      }),
  ],
  [
    'objective',
    (lesson) => slideObjectiveFallbackVariant({ lesson, concept: 'policy evidence', artifact: 'policy memo' }),
  ],
  [
    'evidence',
    (lesson) =>
      slideInspectableEvidenceVariant({ lesson, concept: 'policy evidence', sourceCue: 'the assigned brief' }),
  ],
  ['closing', (lesson) => slideClosingFeedbackVariant({ lesson, displayTitle: 'Policy Evidence Review' })],
];

function realizeProductionPools(courseId) {
  const state = beginBlueprintRealizationTrace(false, courseId);
  try {
    return Object.fromEntries(
      SURFACES.map(([surface, render]) => [
        surface,
        Array.from({ length: 6 }, (_, index) =>
          render({
            lessonNumber: index + 1,
            title: `Lesson ${index + 1}: Policy Evidence`,
            studentArtifact: 'policy memo',
          }),
        ),
      ]),
    );
  } finally {
    restoreBlueprintRealizationTrace(state);
  }
}

describe('production teaching-move variation pools', () => {
  it('are deterministic and produce complete, presentation-ready sentences', () => {
    const first = realizeProductionPools('production-course-1');
    expect(realizeProductionPools('production-course-1')).toEqual(first);

    for (const outputs of Object.values(first)) {
      expect(outputs).toHaveLength(6);
      for (const output of outputs) {
        expect(output).toMatch(/^[A-Z]/);
        expect(output).toMatch(/[.!?]$/);
        expect(output).not.toMatch(/;|\s{2,}|\b(?:undefined|null)\b/i);
        expect(output.split(/\s+/).length).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('keeps every production surface non-universal across representative courses', () => {
    const supportBySurface = new Map(SURFACES.map(([surface]) => [surface, new Map()]));

    for (let courseIndex = 1; courseIndex <= 12; courseIndex += 1) {
      const courseId = `production-course-${courseIndex}`;
      const realized = realizeProductionPools(courseId);
      for (const [surface, outputs] of Object.entries(realized)) {
        for (const output of outputs) {
          const support = supportBySurface.get(surface);
          if (!support.has(output)) support.set(output, new Set());
          support.get(output).add(courseId);
        }
      }
    }

    for (const support of supportBySurface.values()) {
      expect(support.size).toBeGreaterThanOrEqual(60);
      expect(Math.max(...[...support.values()].map((courseIds) => courseIds.size))).toBeLessThanOrEqual(3);
    }
  });
});
