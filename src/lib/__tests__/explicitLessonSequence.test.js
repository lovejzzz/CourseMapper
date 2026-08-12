import { describe, expect, it } from 'vitest';
import { extractExplicitLessonSequence, extractOrderedLessonContract } from '../explicitLessonSequence.js';

describe('extractExplicitLessonSequence', () => {
  it('recognizes an exact counted in-order lesson contract with semicolon boundaries', () => {
    const sequence = extractExplicitLessonSequence(
      'Use exactly these six lessons in order: 1) Framing a data question and stakeholder stakes; ' +
        '2) Data provenance, consent, and missing voices; ' +
        '3) Cleaning a public-transit reliability dataset; ' +
        '4) Choosing honest visual encodings and scales; ' +
        '5) Building a narrative sequence that communicates uncertainty; ' +
        '6) Public critique, revision, and publication.',
    );

    expect(sequence).toEqual([
      'Framing a data question and stakeholder stakes',
      'Data provenance, consent, and missing voices',
      'Cleaning a public-transit reliability dataset',
      'Choosing honest visual encodings and scales',
      'Building a narrative sequence that communicates uncertainty',
      'Public critique, revision, and publication',
    ]);
  });

  it('does not turn an ordinary unordered topic list into a lesson sequence', () => {
    expect(extractExplicitLessonSequence('Cover sources, cleaning, charts, uncertainty, and revision.')).toEqual([]);
    expect(extractOrderedLessonContract('Cover sources, cleaning, charts, uncertainty, and revision.')).toBeNull();
  });

  it('admits an exact count-matched compact brief as an auditable ordered contract', () => {
    expect(
      extractOrderedLessonContract(
        'Create a five-lesson undergraduate course. Students learn composition, visual hierarchy, color and contrast, perspective and framing, and ethical contextual interpretation.',
        { expectedCount: 5 },
      ),
    ).toEqual({
      mode: 'count-matched-coverage-list',
      declaredCount: 5,
      topics: [
        'composition',
        'visual hierarchy',
        'color and contrast',
        'perspective and framing',
        'ethical contextual interpretation',
      ],
    });
  });

  it('admits an explicitly ordered, count-matched natural-language lesson list', () => {
    expect(
      extractOrderedLessonContract(
        'Create exactly five lessons for Visual Evidence and Image Analysis. In order, the lessons teach composition, visual hierarchy, color and contrast, perspective and framing, and ethical contextual interpretation.',
        { expectedCount: 5 },
      ),
    ).toEqual({
      mode: 'count-matched-coverage-list',
      declaredCount: 5,
      topics: [
        'composition',
        'visual hierarchy',
        'color and contrast',
        'perspective and framing',
        'ethical contextual interpretation',
      ],
    });
  });

  it('does not promote a count-mismatched coverage list into a schedule', () => {
    expect(
      extractOrderedLessonContract(
        'Create a six-lesson course. Students learn composition, hierarchy, contrast, framing, and interpretation.',
        { expectedCount: 6 },
      ),
    ).toBeNull();
  });

  it('recognizes an exact hyphenated counted sequence from the production audit brief', () => {
    expect(
      extractExplicitLessonSequence(
        'Beginner undergraduate course: Python for Public Policy. Use this exact five-lesson sequence: ' +
          '1) Python and pandas for public datasets; ' +
          '2) Data cleaning, missing values, and reproducible notebooks; ' +
          '3) Data visualization with matplotlib for policy audiences; ' +
          '4) Correlation versus causation in policy analysis; ' +
          '5) Evidence-based policy memo with limitations and recommendations.',
        { expectedCount: 5 },
      ),
    ).toEqual([
      'Python and pandas for public datasets',
      'Data cleaning, missing values, and reproducible notebooks',
      'Data visualization with matplotlib for policy audiences',
      'Correlation versus causation in policy analysis',
      'Evidence-based policy memo with limitations and recommendations',
    ]);
  });
});
