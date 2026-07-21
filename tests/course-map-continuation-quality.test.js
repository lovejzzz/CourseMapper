import { describe, expect, it } from 'vitest';

import {
  admitCourseMapContinuationLessons,
  buildCourseMapContinuationPrompt,
  displayGenerationModelName,
} from '../src/hooks/useGeneration.js';
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

  it('rejects repeated continuation topics and rebases accepted lesson numbering', () => {
    const admission = admitCourseMapContinuationLessons(
      [
        { title: 'Lesson 1: Mendelian Inheritance' },
        { title: 'Lesson 2: DNA Structure' },
        { title: 'Lesson 3: Gene Expression' },
      ],
      [
        { title: 'Lesson 1: Mendelian Inheritance', sections: [{ topicSection: '1.1: Inheritance' }] },
        { title: 'Lesson 2: Meiosis', sections: [{ topicSection: '2.1: Chromosome Segregation' }] },
        { title: 'Lesson 3: Mutation', sections: [{ topicSection: '3.1: Mutation Types' }] },
      ],
    );

    expect(admission.rejectedTopics).toEqual(['Lesson 1: Mendelian Inheritance']);
    expect(admission.lessons.map((lesson) => lesson.title)).toEqual(['Lesson 4: Meiosis', 'Lesson 5: Mutation']);
    expect(admission.lessons[0].sections[0].topicSection).toBe('4.1: Chromosome Segregation');
  });

  it('feeds rejected deterministic repeats back into the next bounded continuation prompt', () => {
    const prompt = buildCourseMapContinuationPrompt(
      { lessons: [{ title: 'Lesson 1: DNA Structure' }] },
      4,
      'Later weeks cover mutation and population genetics.',
      ['topicSection', 'learningObjectives'],
      ['Lesson 1: DNA Structure'],
    );

    expect(prompt).toContain('previous continuation was rejected');
    expect(prompt).toContain('Lesson 1: DNA Structure');
    expect(prompt).toContain('Do not return them again');
  });
});
