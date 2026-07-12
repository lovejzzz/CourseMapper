import { describe, expect, it } from 'vitest';

import {
  aggregateOrderReversedJudgments,
  analyzeQuizProject,
  buildScionCrossArtifactDifferenceLab,
  buildScionDifferenceLab,
  buildScionSurfaceDifferenceLab,
  compareQuizProjects,
  evaluateQuizReleaseBars,
  isDecisionReadyScenario,
  parseSavedCourseGraph,
} from '../quizContrast.js';

function savedProject(lessonContent, sessionCount = 0) {
  return {
    courseGraphJson: JSON.stringify({
      sessions: Array.from({ length: sessionCount }, (_, index) => ({ number: index + 1 })),
      enrichmentOverlay: { lessonContent },
    }),
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
  it('reads the format v2 courseGraph field instead of treating the project wrapper as a graph', () => {
    const graph = JSON.parse(strong.courseGraphJson);
    expect(parseSavedCourseGraph({ formatVersion: 2, courseGraph: graph })).toEqual(graph);
  });

  it('fails closed instead of ranking an artifact whose authored overlay was lost', () => {
    expect(() =>
      compareQuizProjects(
        { formatVersion: 2, courseGraph: { sessions: [{ number: 1 }], enrichmentOverlay: null } },
        strong,
      ),
    ).toThrow(/missing authored lesson, multiple-choice, or short-answer evidence/i);
  });

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
    expect(profile.metrics.explanationAlignedMultipleChoice.percent).toBe(100);
    expect(profile.metrics.decisionReadyScenarios.percent).toBe(100);
    expect(profile.metrics.claimEvidenceBoundaryShortAnswers.percent).toBe(100);
    expect(profile.examples.weakScenarioIssues).toEqual([]);
  });

  it('recognizes plural do-not-prove boundaries in model answers', () => {
    const graph = JSON.parse(strong.courseGraphJson);
    graph.enrichmentOverlay.lessonContent['lesson-1'].quizItems[1].answer =
      'The observations support this limited recommendation; those materials do not prove that it generalizes beyond the case.';
    const profile = analyzeQuizProject({ courseGraphJson: JSON.stringify(graph) });
    expect(profile.metrics.boundedModelAnswers).toMatchObject({ count: 1, total: 1, percent: 100 });
  });

  it('recognizes case-specific action versus unrestricted conclusion boundaries', () => {
    const graph = JSON.parse(strong.courseGraphJson);
    graph.enrichmentOverlay.lessonContent['lesson-1'].quizItems[1].answer =
      'The evidence supports a case-specific action, not an unrestricted causal conclusion.';
    const profile = analyzeQuizProject({ courseGraphJson: JSON.stringify(graph) });
    expect(profile.metrics.boundedModelAnswers).toMatchObject({ count: 1, total: 1, percent: 100 });
  });

  it('counts missing lesson scenarios against coverage and readiness', () => {
    const project = savedProject({
      ...JSON.parse(strong.courseGraphJson).enrichmentOverlay.lessonContent,
      'lesson-2': { kernel: { scenario: null }, quizItems: [] },
    });
    const profile = analyzeQuizProject(project);
    expect(profile.metrics.scenarioCoverage).toMatchObject({ count: 1, total: 2, percent: 50 });
    expect(profile.metrics.decisionReadyScenarios).toMatchObject({ count: 1, total: 2, percent: 50 });
    expect(profile.examples.weakScenarioIssues).toContain('scenario-missing');
  });

  it('uses all course sessions as the scenario denominator when enrichment drops a lesson', () => {
    const project = savedProject(JSON.parse(strong.courseGraphJson).enrichmentOverlay.lessonContent, 2);
    const profile = analyzeQuizProject(project);
    expect(profile.totals.lessons).toBe(2);
    expect(profile.metrics.scenarioCoverage).toMatchObject({ count: 1, total: 2, percent: 50 });
    expect(profile.metrics.decisionReadyScenarios).toMatchObject({ count: 1, total: 2, percent: 50 });
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

  it('classifies lesson-level differences without promoting diagnostics to training data', () => {
    const lab = buildScionDifferenceLab(weak, strong);
    expect(lab.outcomes.learn).toBeGreaterThan(0);
    expect(lab.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lessonId: 'lesson-1',
          dimension: 'decisionReadyScenarios',
          outcome: 'learn',
          trainingEligible: false,
          evidenceStatus: 'diagnostic-only',
        }),
      ]),
    );
    expect(buildScionDifferenceLab(strong, weak).records).toEqual(
      expect.arrayContaining([expect.objectContaining({ dimension: 'decisionReadyScenarios', outcome: 'preserve' })]),
    );
    expect(buildScionDifferenceLab(strong, strong).records).toEqual(
      expect.arrayContaining([expect.objectContaining({ dimension: 'decisionReadyScenarios', outcome: 'parity' })]),
    );
  });

  it('finds assignment, discussion, and study-strategy gaps outside the quiz bank', () => {
    const candidateGraph = JSON.parse(strong.courseGraphJson);
    Object.assign(candidateGraph.enrichmentOverlay.lessonContent['lesson-1'], {
      keyTerms: [
        ...Array.from({ length: 3 }, (_, index) => ({
          term: `Term ${index + 1}`,
          definition: 'A grounded disciplinary definition with enough detail for students to apply it.',
          example: 'Students apply the term to one concrete case example.',
          misconception: 'Students may incorrectly treat the term as a simple label.',
          correction: 'The correction connects the term to evidence and a bounded decision.',
        })),
        { term: 'Optional glossary label', definition: 'Too short to count as substantive.' },
      ],
      assignmentCore: {
        taskDescription:
          'Analyze the clinic evidence and produce a redesign memo that recommends one bounded next action.',
        parameters: ['Use the clinic case only.', 'Submit a one-page memo.'],
      },
      discussionPrompt: {
        prompt: 'Should the clinic prioritize speed or comprehension in the next redesign?',
        tension: 'Faster completion may reduce the time available for users to verify critical information.',
        positions: ['Prioritize speed.', 'Prioritize comprehension.'],
      },
      studyGuide: null,
    });
    const referenceGraph = structuredClone(candidateGraph);
    Object.assign(referenceGraph.enrichmentOverlay.lessonContent['lesson-1'], {
      keyTerms: candidateGraph.enrichmentOverlay.lessonContent['lesson-1'].keyTerms.slice(0, 3),
      assignmentCore: {
        taskDescription:
          'Analyze the clinic evidence and produce a redesign memo that recommends one bounded next action.',
        parameters: [
          'Use the clinic case only.',
          'Submit a one-page memo.',
          'Cite two observations.',
          'Name one limit.',
        ],
      },
      discussionPrompt: {
        ...candidateGraph.enrichmentOverlay.lessonContent['lesson-1'].discussionPrompt,
        positions: ['Prioritize speed.', 'Prioritize comprehension.', 'Use a risk-based conditional priority.'],
      },
      studyGuide: {
        summary: 'This guide connects the clinic evidence to the redesign decision and its most important limitation.',
        reviewStrategies: ['Compare the observations.', 'Rehearse a bounded recommendation.'],
      },
    });

    const lab = buildScionSurfaceDifferenceLab(
      { courseGraphJson: JSON.stringify(candidateGraph) },
      { courseGraphJson: JSON.stringify(referenceGraph) },
    );
    expect(lab.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dimension: 'substantiveKeyTerms', outcome: 'parity' }),
        expect.objectContaining({ dimension: 'assignmentConstraintDepth', outcome: 'learn' }),
        expect.objectContaining({ dimension: 'integrativeThirdPosition', outcome: 'learn' }),
        expect.objectContaining({ dimension: 'authoredStudyStrategy', outcome: 'learn' }),
      ]),
    );
    expect(lab.records.every((record) => record.trainingEligible === false)).toBe(true);
  });

  it('scores cross-artifact traces with fail-closed lesson denominators', () => {
    const coherentGraph = {
      sessions: [
        {
          id: 's1',
          number: 1,
          sections: [{ objectiveRefs: ['o1'], assessmentRefs: ['a1'] }],
        },
      ],
      outcomes: [{ id: 'o1', sessionRef: 's1', text: 'Interpret clinic usability pauses during check-in.' }],
      assessments: [{ id: 'a1', dueSession: 1, title: 'Clinic check-in usability memo' }],
      enrichmentOverlay: {
        lessonContent: {
          'lesson-1': {
            keyTerms: [{ term: 'Contextual inquiry' }],
            assignmentCore: {
              taskDescription:
                'Use contextual inquiry to analyze clinic check-in pauses and write a bounded usability memo.',
              parameters: ['Cite the timed pauses.', 'Name one check-in limitation.'],
            },
            discussionPrompt: {
              prompt: 'How should contextual inquiry interpret the clinic check-in pauses?',
              tension: 'The clinic values speed while users need a clear check-in process.',
              positions: ['Prioritize speed.', 'Prioritize comprehension.'],
            },
            studyGuide: {
              summary: 'Contextual inquiry connects the clinic check-in pauses to a bounded usability conclusion.',
              reviewStrategy: 'Rehearse the check-in evidence and its limitation.',
            },
            kernel: {
              scenario: {
                setup: 'A clinic check-in study records three usability pauses during contextual inquiry.',
                materials: 'timed pause log and check-in recording',
              },
            },
            slideContent: [{ title: 'Contextual inquiry', bullets: ['Clinic check-in pauses'] }],
            quizItems: [
              {
                type: 'multiple_choice',
                question: 'Which contextual inquiry conclusion best fits the clinic check-in pauses?',
                options: ['Inspect the timed pauses', 'Ignore the recording', 'Assume a cause', 'Remove the task'],
                answerIndex: 0,
                explanation: 'The timed clinic pauses are inspectable usability evidence.',
              },
              {
                type: 'short_answer',
                question: 'What does the clinic check-in evidence support, and what remains uncertain?',
                answer: 'It supports a bounded usability concern but cannot establish the cause.',
              },
            ],
          },
        },
      },
    };
    const missingGraph = {
      sessions: [{ id: 's1', number: 1, sections: [] }],
      outcomes: [],
      assessments: [],
      enrichmentOverlay: {
        lessonContent: {
          'lesson-1': {
            quizItems: [
              {
                type: 'multiple_choice',
                question: 'Which volcanic mineral is present?',
                options: ['Quartz', 'A', 'B', 'C'],
                answerIndex: 0,
                explanation: 'Quartz is present.',
              },
              {
                type: 'short_answer',
                question: 'What does the sample show and what remains uncertain?',
                answer: 'It supports quartz but cannot establish the source.',
              },
            ],
          },
        },
      },
    };

    const lab = buildScionCrossArtifactDifferenceLab(
      { courseGraphJson: JSON.stringify(missingGraph) },
      { courseGraphJson: JSON.stringify(coherentGraph) },
    );
    expect(lab.records).toHaveLength(7);
    expect(lab.records.every((record) => record.candidate.total === 1)).toBe(true);
    expect(lab.records.every((record) => record.candidate.count === 0)).toBe(true);
    expect(lab.records.every((record) => record.reference.count === 1)).toBe(true);
    expect(lab.records.every((record) => record.outcome === 'learn')).toBe(true);
    expect(lab.denominatorPolicy).toContain('Missing required surfaces count as failures');
    expect(lab.trainingBoundary).toContain('not human preference');
  });

  it('fails explicit release bars instead of treating a relative win as readiness', () => {
    const profile = analyzeQuizProject(strong);
    const result = evaluateQuizReleaseBars(profile);
    expect(result.status).toBe('failed');
    expect(result.failures.map((check) => check.key)).toContain('minimumLessons');
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
