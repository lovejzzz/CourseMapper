import { describe, expect, it } from 'vitest';
import { extractExplicitTeachingRequirements } from '../explicitTeachingRequirements.js';

describe('v0.20.06 brief requirements', () => {
  it('reads per-lesson quiz counts in the forms teachers write', () => {
    expect(extractExplicitTeachingRequirements('Include a quiz with 4 questions per lesson.').questionsPerLesson).toBe(
      4,
    );
    expect(extractExplicitTeachingRequirements('Add 5 quiz questions per lesson.').questionsPerLesson).toBe(5);
    expect(extractExplicitTeachingRequirements('Write a four-question quiz.').questionsPerLesson).toBe(4);
    expect(
      extractExplicitTeachingRequirements('A 4-question quiz, then a quiz with 6 questions.').questionsPerLesson,
    ).toBeNull();
  });
});

import { materialsRequestedInBrief } from '../briefRequestedMaterials.js';

describe('v0.20.06 materials named in the brief', () => {
  it('pre-selects explicitly requested materials only', () => {
    expect(
      materialsRequestedInBrief(
        'Introductory chemistry: 2 lessons. Include a quiz with 4 questions per lesson and a rubric for the lab report.',
      ),
    ).toEqual(['rubrics', 'quizBank']);
    expect(materialsRequestedInBrief('Slides and a study guide for fractions.')).toEqual(['slideDecks', 'studyGuides']);
    expect(materialsRequestedInBrief('A short course on evaluating evidence.')).toEqual([]);
    expect(materialsRequestedInBrief('Statistics: hypothesis tests and confidence intervals.')).toEqual([]);
    expect(materialsRequestedInBrief('为高一化学准备教案和测验。')).toEqual(['lessonPlans', 'quizBank']);
  });
});

import { derivePromptPreviewTitle } from '../promptAwarePreview.js';

describe('v0.20.06 preview course title', () => {
  it('uses the identity before a colon-separated course shape', () => {
    expect(
      derivePromptPreviewTitle(
        'Introductory chemistry for 10th graders: 2 lessons of 50 minutes on balancing equations and limiting reagents.',
      ),
    ).toBe('Introductory chemistry');
    expect(derivePromptPreviewTitle('Descriptive Statistics: two 60-minute lessons with a quiz.')).toBe(
      'Descriptive Statistics',
    );
  });
});

import { finalizeCompiledDeliverableLanguage } from '../compiledLanguageFinalizer.js';

describe('v0.20.06 sentence seams', () => {
  it('capitalizes a lowercase sentence start after a full stop, not after abbreviations', () => {
    const data = {
      lessonPlans: [
        {
          lessonTitle: 'Lesson 1',
          overview:
            'Both factors differ. the stated confound limits attribution, e.g. light. Use 0.80 as given. B. k(k+1)/2 holds. x. y',
        },
      ],
    };
    const out = finalizeCompiledDeliverableLanguage('lessonPlans', data, {});
    expect(out.lessonPlans[0].overview).toBe(
      'Both factors differ. The stated confound limits attribution, e.g. light. Use 0.80 as given. B. k(k+1)/2 holds. x. y',
    );
  });

  it('lowercases an interpolated artifact article mid-sentence without touching names', () => {
    const data = {
      lessonPlans: [
        {
          lessonTitle: 'Lesson 1',
          overview:
            'Use the evidence to revise An individual written explanation. Strong An individual written explanation anchor. Group A receives light. Read The Great Gatsby.',
        },
      ],
    };
    const out = finalizeCompiledDeliverableLanguage('lessonPlans', data, {});
    expect(out.lessonPlans[0].overview).toBe(
      'Use the evidence to revise an individual written explanation. Strong individual written explanation anchor. Group A receives light. Read The Great Gatsby.',
    );
  });
});

import { lessonBloomsTags } from '../lessonBloomsTags.js';

describe('v0.20.06 Bloom chips', () => {
  it('shows only levels used by the lesson activities, in taxonomy order', () => {
    expect(
      lessonBloomsTags({
        bloomsLevels: ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'],
        outline: [{ bloomsLevel: 'Evaluate' }, { bloomsLevel: 'apply' }, { bloomsLevel: 'Understand' }],
      }),
    ).toEqual(['Understand', 'Apply', 'Evaluate']);
    expect(lessonBloomsTags({ bloomsLevels: ['Apply'], outline: [] })).toEqual(['Apply']);
  });
});

import {
  buildWikipediaProvider,
  buildWikisourceProvider,
  contentTokens,
  lexicalRelevance,
} from '../knowledge/algiResearch.js';
import { planAlgiCourseResearch, researchLanguageForText } from '../knowledge/algiResearchPlan.js';

describe('v0.20.06 research language and primary texts', () => {
  it('queries the course-language Wikipedia and Wikisource hosts', async () => {
    const urls = [];
    const httpJson = async (url) => {
      urls.push(url);
      return { query: { search: [{ title: '化学计量学' }] } };
    };
    await buildWikipediaProvider(httpJson, { language: 'zh' }).search('化学计量', 2);
    await buildWikisourceProvider(httpJson).search('Ozymandias Shelley', 2);
    expect(urls[0]).toMatch(/^https:\/\/zh\.wikipedia\.org\/w\/api\.php\?/);
    expect(urls[1]).toMatch(/^https:\/\/en\.wikisource\.org\/w\/api\.php\?/);
    expect(buildWikisourceProvider(httpJson).id).toBe('wikisource');
    expect(buildWikipediaProvider(httpJson).id).toBe('wikipedia');
    expect(buildWikipediaProvider(httpJson, { language: 'xx' }).host).toBe('https://en.wikipedia.org');
  });

  it('scores Chinese relevance instead of discarding Han text', () => {
    expect(contentTokens('化学计量')).toEqual(['化学', '学计', '计量']);
    expect(lexicalRelevance('化学计量', '化学计量学是研究化学反应中物质的量关系的学科')).toBe(1);
    expect(contentTokens('Limiting reagents')).toEqual(
      contentTokens('Limiting reagents').filter((t) => /^[a-z0-9-]+$/.test(t)),
    );
  });

  it('routes primary-text lessons to Wikisource first and records the course language', () => {
    expect(researchLanguageForText('高一化学：化学计量')).toBe('zh');
    expect(researchLanguageForText('Introductory chemistry')).toBe('en');
    const literature = planAlgiCourseResearch({
      courseName: 'Close Reading of Ozymandias',
      lessons: [{ title: 'The sonnet and its speaker' }],
    });
    expect(literature.providerOrder[0]).toBe('wikisource');
    expect(literature.language).toBe('en');
    const chemistry = planAlgiCourseResearch({ courseName: 'Chemistry', lessons: [{ title: 'Limiting reagents' }] });
    expect(chemistry.providerOrder).not.toContain('wikisource');
  });
});
