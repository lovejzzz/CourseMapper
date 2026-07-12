import { describe, expect, it } from 'vitest';

import { buildScionContrastMatrix } from '../scionContrastMatrix.js';

function project({ positions = 2, parameters = 2 } = {}) {
  return {
    courseGraphJson: JSON.stringify({
      sessions: [{ number: 1 }],
      enrichmentOverlay: {
        lessonContent: {
          'lesson-1': {
            keyTerms: [],
            assignmentCore: {
              taskDescription:
                'Analyze the supplied case evidence and produce a bounded recommendation for the named decision.',
              parameters: Array.from({ length: parameters }, (_, index) => `Constraint ${index + 1} for the task.`),
            },
            discussionPrompt: {
              prompt: 'Which response best balances the competing priorities in this case?',
              tension: 'The two priorities create different benefits and risks for the affected people.',
              positions: Array.from({ length: positions }, (_, index) => `Defensible position ${index + 1}.`),
            },
            studyGuide: null,
            kernel: { scenario: null },
            quizItems: [
              {
                type: 'multiple_choice',
                question: 'Which response is best supported by the supplied case evidence?',
                options: ['A', 'B', 'C', 'D'],
                answerIndex: 0,
                explanation: 'A is supported by the named evidence while the other options exceed it.',
              },
              {
                type: 'short_answer',
                question: 'What conclusion does the evidence support, and what can it not establish?',
                answer: 'It supports the case-specific conclusion but cannot establish a broader causal claim.',
              },
            ],
          },
        },
      },
    }),
  };
}

describe('Scion contrast matrix', () => {
  it('keeps public and local routes separate while aggregating repeated surface gaps', () => {
    const matrix = buildScionContrastMatrix([
      {
        id: 'public-ux',
        domain: 'design',
        candidateRoute: 'public-scion',
        candidateModel: 'Scion Public',
        referenceModel: 'Luna',
        candidateProject: project(),
        referenceProject: project({ positions: 3, parameters: 4 }),
      },
      {
        id: 'local-geology',
        domain: 'science',
        candidateRoute: 'local-scion-1.2',
        candidateModel: 'Scion 1.2',
        referenceModel: 'GPT',
        candidateProject: project(),
        referenceProject: project({ positions: 3, parameters: 4 }),
      },
    ]);

    expect(matrix).toMatchObject({ pairCount: 2, domainCount: 2 });
    expect(Object.keys(matrix.routes)).toEqual(['public-scion', 'local-scion-1.2']);
    expect(matrix.routes['public-scion'].surfaceDimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'assignmentConstraintDepth', candidateDeltaPoints: -100 }),
        expect.objectContaining({ key: 'integrativeThirdPosition', candidateDeltaPoints: -100 }),
      ]),
    );
    expect(matrix.routes['public-scion'].crossArtifactOutcomes).toMatchObject({
      learn: 0,
      preserve: 0,
      repair: 6,
      parity: 1,
      uncertain: 0,
    });
    expect(matrix.routes['public-scion'].crossArtifactDimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'objectiveQuizTrace', candidate: expect.objectContaining({ total: 1 }) }),
        expect.objectContaining({ key: 'primaryTermPropagation', candidate: expect.objectContaining({ total: 1 }) }),
      ]),
    );
    expect(matrix.claimBoundary).toContain('Report every route separately');
  });
});
