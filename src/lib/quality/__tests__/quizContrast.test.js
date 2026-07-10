import { describe, expect, it } from 'vitest';

import {
  aggregateOrderReversedJudgments,
  analyzeQuizProject,
  compareQuizProjects,
  isDecisionReadyScenario,
} from '../quizContrast.js';

function savedProject(lessonContent) {
  return {
    courseGraphJson: JSON.stringify({ enrichmentOverlay: { lessonContent } }),
  };
}

const weak = savedProject({
  'lesson-1': {
    kernel: {
      scenario: {
        setup: 'A team conducts interviews with several users about a new app.',
        materials: 'the scenario evidence',
      },
    },
    quizItems: [
      {
        type: 'multiple_choice',
        question: 'Which statement defines contextual inquiry?',
        options: ['A', 'B', 'C', 'D'],
        explanation: 'A is correct.',
      },
      {
        type: 'short_answer',
        question: 'Using Contextual Inquiry, analyze what this evidence shows and justify your conclusion.',
        answer: 'This is a case of Contextual Inquiry.',
      },
    ],
  },
});

const strong = savedProject({
  'lesson-1': {
    kernel: {
      scenario: {
        setup:
          'A clinic calls check-in simple, but timed notes show three long pauses and two requests for staff help. The team must decide what evidence to collect next.',
        materials: 'timed field notes, participant quotes, and the check-in screen recording',
      },
    },
    quizItems: [
      {
        type: 'multiple_choice',
        question:
          'A clinic calls check-in simple, but timed notes show three long pauses and two requests for help. Which next action best tests the discrepancy?',
        options: ['Probe the recorded pauses', 'Assume the users forgot', 'Redesign immediately', 'Ignore the notes'],
        answerIndex: 0,
        explanation:
          'The probe tests the observed discrepancy, while the other options assume a cause or skip validation.',
      },
      {
        type: 'short_answer',
        question:
          'Without assuming a hidden cause, identify the most relevant course method, state the best-supported conclusion, cite two case details, and name one limitation or next piece of evidence.',
        answer:
          'The pauses and help requests support a bounded concern, but they cannot establish a cause without additional evidence.',
      },
    ],
  },
});

describe('quiz model contrast', () => {
  it('recognizes a concrete, decision-ready evidence packet', () => {
    expect(
      isDecisionReadyScenario({
        setup:
          'A clinic calls check-in simple, but timed notes show three long pauses and two requests for staff help. The team must decide what evidence to collect next.',
        materials: 'timed field notes, participant quotes, and the check-in screen recording',
      }),
    ).toBe(true);
    expect(isDecisionReadyScenario({ setup: 'A team conducts interviews.', materials: 'scenario evidence' })).toBe(
      false,
    );
  });

  it('profiles the authoring behaviors rather than trusting the model label', () => {
    const profile = analyzeQuizProject(strong, { label: 'reference' });
    expect(profile.metrics.appliedMultipleChoice.percent).toBe(100);
    expect(profile.metrics.decisionReadyScenarios.percent).toBe(100);
    expect(profile.metrics.claimEvidenceBoundaryShortAnswers.percent).toBe(100);
  });

  it('turns only observed reference advantages into learning recommendations', () => {
    const comparison = compareQuizProjects(weak, strong, {
      candidateLabel: 'Scion',
      referenceLabel: 'Luna',
    });
    expect(comparison.learning.learn.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        'appliedMultipleChoice',
        'decisionReadyScenarios',
        'cueFreeShortAnswers',
        'claimEvidenceBoundaryShortAnswers',
      ]),
    );
    expect(comparison.claimBoundary).toContain('directional evidence');
  });

  it('invalidates an order-reversed judge result that follows the B position', () => {
    const aggregate = aggregateOrderReversedJudgments([
      {
        order: { A: 'Luna', B: 'Scion' },
        result: { aScore: 2, bScore: 6, preferred: 'B' },
      },
      {
        order: { A: 'Scion', B: 'Luna' },
        result: { aScore: 3, bScore: 8, preferred: 'B' },
      },
    ]);
    expect(aggregate).toMatchObject({
      status: 'inconclusive',
      preferred: 'inconclusive',
      positionBias: true,
      normalizedPreferences: ['Scion', 'Luna'],
      maxScoreSwing: 6,
    });
    expect(aggregate.scoresByLabel.Scion.mean).toBe(4.5);
    expect(aggregate.scoresByLabel.Luna.mean).toBe(5);
  });
});
