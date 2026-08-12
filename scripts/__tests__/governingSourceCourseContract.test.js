import { describe, expect, it } from 'vitest';

import { buildGoverningSourceCourseContract } from '../lib/governingSourceCourseContract.mjs';

const lessons = [
  'Picturing Distributions',
  'Describing Distributions with Numbers',
  'The Normal Distribution',
  'Scatterplots and Correlation',
  'Regression Analysis',
  'Two-Way Tables',
  'Producing Data: Sampling',
  'Inference in Practice',
].map((title, index) => ({ title: `Lesson ${index + 1}: ${title}` }));

describe('buildGoverningSourceCourseContract', () => {
  it('binds a generated course to an ordered subset of a source calendar', () => {
    const source = [
      'Ch. 1 Picturing Distributions with Graphs',
      'Ch. 2 Describing Distributions with Numbers',
      'Ch. 3 The Normal Distribution',
      'Ch. 4 Scatterplots & Correlation',
      'Ch. 5 Regression',
      'Ch. 6 Two-Way Tables',
      'Ch. 8 Producing Data: Sampling',
      'Ch. 9 Producing Data: Experiments',
      'Ch. 18 Inference in Practice',
    ].join('\n');
    const contract = buildGoverningSourceCourseContract(source, lessons);
    expect(contract).toMatchObject({
      protocol: 'coursemapper-governing-source-course-contract-v1',
      mode: 'governing-source-ordered-subset',
    });
    expect(contract.topics).toHaveLength(8);
    expect(contract.matches.every((match) => match.coverage >= 0.75)).toBe(true);
    expect(contract.continuity.status).toBe('continuous');
    expect(contract.boundaryCoverage.status).toBe('not-applicable-to-ordered-subset');
    expect(contract.coverageStatus).toBe('continuous-subset');
  });

  it('flags a late ordered match that skips an unusually large governing-source block', () => {
    const source = [
      'Picturing Distributions',
      'Describing Distributions with Numbers',
      'The Normal Distribution',
      'Scatterplots and Correlation',
      'Regression Analysis',
      'Two-Way Tables',
      'Producing Data: Sampling',
      ...Array.from({ length: 18 }, (_, index) => `Intervening topic ${index + 1} with several calendar details`),
      'Inference in Practice',
    ].join('\n');
    const contract = buildGoverningSourceCourseContract(source, lessons);
    expect(contract?.continuity).toMatchObject({
      status: 'discontinuous',
      discontinuities: [expect.objectContaining({ fromLessonNumber: 7, toLessonNumber: 8 })],
    });
  });

  it('does not mistake intentionally excluded later material for a gap inside an ordered subset', () => {
    const source = [
      ...lessons.map((lesson) => lesson.title.replace(/^Lesson \d+: /, '')),
      ...Array.from({ length: 30 }, (_, index) => `Later required topic ${index + 1} with substantive procedure`),
    ].join('\n');
    const contract = buildGoverningSourceCourseContract(source, lessons);

    expect(contract.boundaryCoverage.status).toBe('not-applicable-to-ordered-subset');
    expect(contract.coverageStatus).toBe('continuous-subset');
    expect(contract.boundaryCoverage.suffixTokenCount).toBeGreaterThan(
      contract.boundaryCoverage.maximumUnrepresentedBoundaryTokens,
    );
  });

  it('accepts a grammatical representation variant without relaxing source order', () => {
    const variantLessons = lessons.map((lesson, index) =>
      index === 1 ? { title: 'Lesson 2: Describing Distributions Numerically' } : lesson,
    );
    const source = [
      'Picturing Distributions with Graphs',
      'Describing Distributions with Numbers',
      'The Normal Distribution',
      'Scatterplots and Correlation',
      'Regression',
      'Two-Way Tables',
      'Producing Data: Sampling',
      'Inference in Practice',
    ].join('\n');

    expect(buildGoverningSourceCourseContract(source, variantLessons)?.topics).toEqual(
      variantLessons.map((lesson) => lesson.title.replace(/^Lesson \d+: /, '')),
    );
  });

  it('fails closed when a lesson is absent or the source order is reversed', () => {
    expect(buildGoverningSourceCourseContract('Normal Distribution; Regression', lessons)).toBeNull();
    expect(
      buildGoverningSourceCourseContract(
        'Picturing Distributions; Normal Distribution; Describing Distributions with Numbers',
        lessons.slice(0, 3),
      ),
    ).toBeNull();
  });
});
