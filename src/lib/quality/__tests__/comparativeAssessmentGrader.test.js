import { describe, expect, it } from 'vitest';

import { grade } from '../deepQualityGrader.js';
import { createMemoryFileProvider } from '../fileProviders.js';

const readings = [
  { id: 'R2.1', title: 'The Odyssey', dueSession: 2 },
  { id: 'R5.1', title: 'The Thousand and One Nights', dueSession: 5 },
];

async function gradeComparativeBrief(text) {
  const path = 'Assignment Briefs/Lesson 02 - The Odyssey - Assignment Briefs.txt';
  return grade({
    fileProvider: createMemoryFileProvider({
      'PACKAGE_MANIFEST.json': JSON.stringify({
        lessonScope: [2],
        readiness: { status: 'ready', blockers: 0 },
        readings,
        assessments: [
          {
            id: 'A2.1',
            title: 'Comparative Reading Responses',
            kind: 'graded-artifact',
            lesson: 2,
            artifact: path,
            weightPct: 100,
          },
        ],
        files: [{ path, featureId: 'assignments' }],
      }),
      [path]: text,
    }),
    course: { title: 'World Literature Survey', featureIds: ['assignments'] },
    honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
  });
}

describe('comparative assessment quality contract', () => {
  it('rejects a single-text response hiding behind a comparative title', async () => {
    const result = await gradeComparativeBrief(
      [
        'Comparative Reading Responses',
        'Course Map L2',
        'Write one focused response about The Odyssey.',
        'Choose one passage, state an interpretation, and revise the paragraph after feedback.',
        'Use accurate textual evidence and clear prose. Include enough detail for the instructor to follow your reasoning.',
        'Submit the response through the course site at the end of the week.',
      ].join('\n'),
    );

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'substance',
          detail: expect.stringContaining('two explicit text pairings'),
        }),
      ]),
    );
    expect(result.overall.score).toBeLessThanOrEqual(89);
  });

  it('accepts a complete two-response comparison contract', async () => {
    const result = await gradeComparativeBrief(
      [
        'Comparative Reading Responses',
        'Course Map L2',
        'Complete two comparative reading responses.',
        'Response 1 compares The Odyssey and The Thousand and One Nights. Response 2 compares another assigned pair.',
        'For each response, cite one locatable passage or formal feature from each paired work and explain how both pieces of evidence change the comparison.',
        'Advance a focused comparative claim, test a credible counter-reading against the same evidence, and end with an explicit claim limit that states what the passages cannot establish.',
        'Revise the weakest inference before submission.',
      ].join('\n'),
    );

    expect(result.findings.some((finding) => /two explicit text pairings/i.test(finding.detail))).toBe(false);
  });
});
