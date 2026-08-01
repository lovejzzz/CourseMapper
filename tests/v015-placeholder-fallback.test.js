/**
 * v0.15 F1 — the no-readings fallback is honest copy, not a flagged
 * placeholder.
 *
 * The mandarin native arm of the v0.14.9 day-two round shipped 93 P1s, all
 * one class: the compiler's no-reading fallback emitted "Instructor-provided
 * course materials for Lesson N…", the EXACT phrase the grader's
 * unresolved-source-placeholder pattern exists to catch
 * (src/lib/quality/artifactDefectPatterns.js). Any course whose lessons
 * carry no resource-shaped readings hit it on every assignment surface.
 *
 * The fallback family now names the assigned materials for the specific
 * lesson — honest when no reading list ships, but not repeated as generic
 * template copy across unrelated courses. This file pins a full compile of a
 * readings-less course at ZERO flagged occurrences.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCourseBlueprint,
  compactBlueprintForStorage,
  compileBlueprintDeliverables,
  getBlueprintCompiledFeatures,
} from '../src/lib/courseBlueprintCompiler.js';

const FEATURES = getBlueprintCompiledFeatures([
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
]);

// A language-course shape: meaningful topics, NO supportingResources — the
// exact configuration that fired the fallback 93 times on mandarin--native.
const NO_READINGS_COURSE = {
  courseName: 'Beginning Mandarin I',
  lessons: [1, 2, 3].map((n) => ({
    title: `Lesson ${n}: ${['The pinyin system and the four tones', 'Greetings and self-introduction', 'Numbers and classifiers'][n - 1]}`,
    sections: [
      {
        topicSection: `${n}.1: ${['Pinyin initials and finals', 'Polite greetings', 'Counting with measure words'][n - 1]}`,
        learningObjectives: `Students will be able to:\n1. Apply the lesson ${n} forms in short dialogues`,
        weeklyAssessments: `Speaking check ${n}: short dialogue`,
        asyncActivities: 'Listen to the pronunciation drills.',
        syncActivities: 'Pair practice with feedback.',
        supportingResources: '',
      },
    ],
  })),
};

describe('F1 — a readings-less compile carries no flagged placeholder', () => {
  const blueprint = compactBlueprintForStorage(buildCourseBlueprint(NO_READINGS_COURSE));
  const compiled = compileBlueprintDeliverables(blueprint, FEATURES, { configMap: {} });

  it('zero occurrences of the unresolved-source-placeholder phrase across ALL features', () => {
    for (const featureId of FEATURES) {
      const text = JSON.stringify(compiled[featureId] || {});
      expect(text, featureId).not.toMatch(/Instructor-provided course materials/i);
    }
  });

  it('the honest fallback names lesson-specific assigned materials', () => {
    const everything = JSON.stringify(compiled);
    expect(everything).toMatch(/The pinyin system and the four tones lesson materials/i);
    expect(everything).toMatch(/Greetings and self-introduction lesson materials/i);
    expect(everything).not.toMatch(/Instructor notes and in-class materials/);
    expect(everything).not.toMatch(/assigned source materials/i);
  });

  it('courses WITH readings still cite them (the fallback stays a fallback)', () => {
    const withReadings = structuredClone(NO_READINGS_COURSE);
    withReadings.lessons[0].sections[0].supportingResources = 'Integrated Chinese Level 1 Part 1, Lesson 1';
    const bp = compactBlueprintForStorage(buildCourseBlueprint(withReadings));
    const out = compileBlueprintDeliverables(bp, FEATURES, { configMap: {} });
    expect(JSON.stringify(out)).toContain('Integrated Chinese Level 1 Part 1');
  });
});
