import { describe, expect, it } from 'vitest';

import { buildCourseMapContinuationPrompt, displayGenerationModelName } from '../src/hooks/useGeneration.js';
import { findDuplicateLessonTitleGroups, normalizeLessonTitleIdentity } from '../src/lib/lessonTitleIdentity.js';

describe('course-map continuation quality', () => {
  it('normalizes numbered titles and common acronym expansions before comparing topics', () => {
    expect(normalizeLessonTitleIdentity('Lesson 3: Inflation and CPI')).toBe(
      normalizeLessonTitleIdentity('Week 4 — Inflation & Consumer Price Index'),
    );
    expect(
      findDuplicateLessonTitleGroups([
        { title: 'Lesson 6: Fiscal Policy and Money and Banking' },
        { title: 'Lesson 8: Fiscal Policy & Money and Banking' },
      ]),
    ).toHaveLength(1);
  });

  it('tells continuation models to produce distinct progression, not renamed duplicates', () => {
    const prompt = buildCourseMapContinuationPrompt(
      {
        lessons: [{ title: 'Lesson 1: Economic Foundations' }, { title: 'Lesson 2: Inflation and CPI' }],
      },
      4,
      'Later weeks cover policy and growth.',
      ['topicSection', 'learningObjectives'],
    );

    expect(prompt).toContain('2. Lesson 2: Inflation and CPI');
    expect(prompt).toContain('renamed duplicates are forbidden');
    expect(prompt).toContain('measurement, causes, policy application, or synthesis');
    expect(prompt).toContain('New topics must differ from every existing and new topic');
  });

  it('never exposes the internal public model identifier in progress copy', () => {
    expect(displayGenerationModelName('public', 'scion-public')).toBe('Scion');
    expect(displayGenerationModelName('openai', 'GPT-5 mini')).toBe('GPT-5 mini');
  });
});
