import { describe, expect, it } from 'vitest';

import { buildLessonKernelPrompt } from '../blueprintEnrichmentPass.js';
import { buildNativeSkeletonUserPrompt, NATIVE_SKELETON_SYSTEM_PROMPT } from '../nativeSkeletonPrompts.js';

describe('generation boundary prompts', () => {
  it('keeps named assessments out of filler session titles', () => {
    const userPrompt = buildNativeSkeletonUserPrompt(
      'A 15-lesson genetics course with problem sets, two midterms, a final, and a model-organism lab.',
      { expectedLessons: 15, confidence: 'high' },
    );

    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/ASSESSMENTS ARE NOT FILLER SESSIONS/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/Never place a final exam before later instruction/);
    expect(userPrompt).toMatch(/assessment-registry entries, not automatic session titles/);
  });

  it('turns compact coverage lists into an explicit distinct-session planning constraint', () => {
    const userPrompt = buildNativeSkeletonUserPrompt(
      'Introduction to Genetics, a 15-lesson course. Covers Mendelian inheritance, meiosis, linkage and mapping, DNA structure, gene expression, mutation, population genetics, epigenetics, and modern genetic technologies.',
      { expectedLessons: 15, confidence: 'high' },
    );

    expect(userPrompt).toContain('SOURCE COVERAGE TOPICS (9)');
    expect(userPrompt).toContain('For the remaining 6 sessions');
    expect(userPrompt).toContain('Do not use the words synthesis, comprehensive, review, midterm, exam, final');
  });

  it('requires a conceptual spine instead of empty topic labels', () => {
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/CONCEPTUAL SPINE/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/BAN EMPTY TOPIC LABELS/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toContain('Themes in X');
  });

  it('forbids cross-lesson facts in a lesson kernel', () => {
    const prompt = buildLessonKernelPrompt(
      {
        courseName: 'Introduction to Genetics',
        lessons: [
          {
            title: 'Lesson 14: Model-organism lab',
            sections: [{ topicSection: 'Lab procedures' }, { topicSection: 'Data collection' }],
          },
        ],
      },
      [0],
    );

    expect(prompt.systemPrompt).toMatch(/Every fact must explain this requested lesson's own title/);
    expect(prompt.systemPrompt).toMatch(/true fact about the course is still invalid/);
  });

  it('makes a named primary text the hard lesson-local evidence boundary', () => {
    const sourceBrief =
      'World Literature, a 14-lesson seminar. Lessons cover: oral epic; Homeric epic; classical drama. Required readings: Week 3 reads The Odyssey; Week 4 reads Antigone.';
    const prompt = buildLessonKernelPrompt(
      {
        courseName: 'World Literature',
        lessons: [
          {
            title: 'Lesson 3: Homeric Epic',
            sections: [
              {
                topicSection: 'Homeric Epic',
                learningObjectives: 'Analyze homecoming and identity in epic narrative.',
                readings: ['The Odyssey'],
                supportingResources: 'Close-reading guide for the assigned epic.',
              },
            ],
          },
        ],
      },
      [0],
      { sourceBrief },
    );

    expect(prompt.lessons[0].requiredReadings).toEqual(['The Odyssey']);
    expect(prompt.lessons[0].readings).toContain('Required reading: The Odyssey');
    expect(prompt.lessons[0].courseContext).toBe('World Literature, a 14-lesson seminar.');
    expect(prompt.userPrompt).not.toContain('Week 4 reads Antigone');
    expect(prompt.systemPrompt).toMatch(/NAMED-READING CONTRACT/);
    expect(prompt.systemPrompt).toMatch(/never substitute a different titled work/);
    expect(prompt.systemPrompt).toMatch(/INTERPRETIVE-LITERATURE CONTRACT/);
    expect(prompt.systemPrompt).toMatch(/formal device or structural feature/);
  });

  it('does not apply the interpretive-literature contract to unrelated courses', () => {
    const prompt = buildLessonKernelPrompt(
      {
        courseName: 'Physical Geology',
        lessons: [{ title: 'Lesson 1: Minerals', sections: [{ topicSection: 'Crystal structure' }] }],
      },
      [0],
    );

    expect(prompt.systemPrompt).not.toMatch(/INTERPRETIVE-LITERATURE CONTRACT/);
  });
});
