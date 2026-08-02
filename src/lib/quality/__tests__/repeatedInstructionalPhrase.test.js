import { describe, expect, it } from 'vitest';

import { findRepeatedInstructionalPhrase } from '../repeatedInstructionalPhrase.js';

describe('findRepeatedInstructionalPhrase short directives', () => {
  it('does not let 38 repeated sub-ten-word directives disappear below the long-shingle window', () => {
    const directive = 'Correction: Cite supporting evidence and name its limit.';
    const files = Array.from({ length: 12 }, (_, index) => ({
      path: `Rendered/Lesson ${index + 1}.docx`,
      kind: 'docx',
      paragraphs: Array.from({ length: index < 2 ? 4 : 3 }, () => directive),
    }));

    expect(findRepeatedInstructionalPhrase(files)).toMatchObject({
      phrase: 'correction cite supporting evidence and name its',
      count: 38,
      wordCount: 7,
      file: 'package (12 files)',
    });
  });

  it('does not promote short repeated non-directive labels into a package P1', () => {
    const files = Array.from({ length: 12 }, (_, index) => ({
      path: `Rendered/Lesson ${index + 1}.docx`,
      kind: 'docx',
      paragraphs: Array.from({ length: 3 }, () => 'Course section context and supporting background overview.'),
    }));

    expect(findRepeatedInstructionalPhrase(files)).toBeNull();
  });

  it('masks disclosed canonical learning objectives without weakening other short-directive checks', () => {
    const objective = 'Explain Data cleansing using evidence from the assigned sources.';
    const files = Array.from({ length: 12 }, (_, index) => ({
      path: `Rendered/Lesson ${index + 1}.docx`,
      kind: 'docx',
      paragraphs: [objective, objective],
    }));

    expect(findRepeatedInstructionalPhrase(files)).toMatchObject({ wordCount: 7, count: 24 });
    expect(
      findRepeatedInstructionalPhrase(files, {
        lessons: [{ lessonNumber: 1, title: 'Lesson 1: Data cleaning', objectives: [objective] }],
      }),
    ).toBeNull();
  });
});
