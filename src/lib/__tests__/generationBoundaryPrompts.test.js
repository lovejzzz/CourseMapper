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
});
