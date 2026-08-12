import { describe, expect, it } from 'vitest';

import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  hydrateBlueprintForCompilation,
} from '../courseBlueprintCompiler.js';
import { lintItemAdmission } from '../itemAdmissionLint.js';
import { isAppliedQuizStem } from '../quality/quizItemDepth.js';

const COURSE_MAP = {
  courseName: 'Research Methods',
  lessons: [
    {
      title: 'Lesson 1: Evidence Triangulation',
      sections: [
        {
          topicSection: 'Evidence triangulation, interview data, observation notes, and claim boundaries',
          learningObjectives: 'Explain evidence triangulation; evaluate a claim against multiple sources',
          weeklyAssessments: 'Evidence memo',
          syncActivities: 'Compare interview transcripts with field observations',
          supportingResources: 'Interview transcript packet; observation notes',
        },
      ],
    },
  ],
};

function mc(index, question) {
  return {
    index,
    type: 'multiple_choice',
    question,
    options: [
      'Compare the two records before deciding what the evidence supports.',
      'Treat the first record as sufficient proof of the general claim.',
      'Summarize both records without explaining how they affect the claim.',
      'Ignore the conflicting detail because it complicates the conclusion.',
    ],
    answerIndex: 0,
    explanation: 'Comparing independent records shows where the claim converges and where its boundary remains.',
  };
}

function authoritativePayload(payload) {
  const facts = [
    'Evidence triangulation compares independent records before a researcher extends a claim.',
    'Conflicting observations narrow the conclusion that the available records can support.',
    'A bounded research claim states which evidence would be needed for a broader inference.',
  ];
  return {
    ...payload,
    kernel: {
      ...(payload.kernel || {}),
      facts,
      provenance: {
        source: 'compiler-owned-exact-source-ledger',
        authority: 'verified-open-research',
        copiedFactsVerbatim: true,
        factCount: facts.length,
      },
    },
  };
}

describe('applied multiple-choice admission', () => {
  it('keeps one diagnostic recall item but blocks recall stems from higher-order slots', () => {
    const recallDiagnostic = 'Which statement best defines evidence triangulation in qualitative research?';
    const recallAnalysis = 'Which statement best defines a boundary on a research claim?';
    const appliedAnalysis =
      'A researcher examines two interview transcripts and one observation record that disagree. Which conclusion is most defensible before revising the claim?';
    const recallEvaluation = 'Which statement best describes strong evidence in a research report?';
    expect(isAppliedQuizStem(appliedAnalysis)).toBe(true);
    expect(isAppliedQuizStem(recallAnalysis)).toBe(false);
    expect(lintItemAdmission(mc(2, appliedAnalysis))).toEqual([]);

    const enrichment = {
      source: 'test-kernel',
      coverage: { requestedLessons: 1, admittedLessons: 1 },
      lessonContent: {
        'lesson-1': authoritativePayload({
          quizItems: [mc(0, recallDiagnostic), mc(1, recallAnalysis), mc(2, appliedAnalysis), mc(4, recallEvaluation)],
        }),
      },
    };
    const blueprint = buildCourseBlueprint(COURSE_MAP, { enrichment });
    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank'], { skipLanguageFinalizer: true });
    const questions = compiled.quizBank.quizzes[0].questions;
    const authoredQuestions = questions.filter((question) => question.enrichmentSource === 'lesson-content-enrichment');

    expect(authoredQuestions.map((question) => question.question)).toEqual([recallDiagnostic, appliedAnalysis]);
    expect(questions.some((question) => question.question === recallAnalysis)).toBe(false);
    expect(questions.some((question) => question.question === recallEvaluation)).toBe(false);
  });

  it('does not let a model-provisional answer unit become an auto-graded key', () => {
    const unsupported = 'Head movement means that every constituent is broadly rearranged anywhere in a sentence.';
    const enrichment = {
      source: 'test-model',
      coverage: { requestedLessons: 1, admittedLessons: 1 },
      lessonContent: {
        'lesson-1': {
          sourceFactAuthority: 'model-provisional',
          facts: [unsupported],
          sourceFacts: [unsupported],
          quizItems: [
            {
              ...mc(0, 'Which statement defines head movement?'),
              options: [unsupported, 'A second option', 'A third option', 'A fourth option'],
              explanation: unsupported,
            },
          ],
          kernel: {
            facts: [unsupported],
            provenance: {
              source: 'compiler-owned-exact-source-ledger',
              authority: 'model-provisional',
              copiedFactsVerbatim: true,
              factCount: 1,
            },
          },
        },
      },
    };
    const blueprint = buildCourseBlueprint(COURSE_MAP, { enrichment });
    const questions = compileBlueprintDeliverables(blueprint, ['quizBank'], {
      skipLanguageFinalizer: true,
    }).quizBank.quizzes[0].questions;

    expect(JSON.stringify(questions)).not.toContain(unsupported);
    expect(questions.every((question) => question.enrichmentSource !== 'lesson-content-enrichment')).toBe(true);
  });

  it('does not treat a legacy exact ledger with missing authority as trusted knowledge', () => {
    const unsupported = 'Head movement means that whole phrases can shift to any position.';
    const enrichment = {
      source: 'legacy-saved-model-project',
      coverage: { requestedLessons: 1, admittedLessons: 1 },
      lessonContent: {
        'lesson-1': {
          quizItems: [
            {
              ...mc(0, 'Which statement defines head movement?'),
              options: [unsupported, 'A second option', 'A third option', 'A fourth option'],
              explanation: unsupported,
            },
          ],
          kernel: {
            facts: [unsupported],
            provenance: {
              source: 'compiler-owned-exact-source-ledger',
              copiedFactsVerbatim: true,
              factCount: 1,
            },
          },
        },
      },
    };
    const blueprint = buildCourseBlueprint(COURSE_MAP, { enrichment });
    const questions = compileBlueprintDeliverables(blueprint, ['quizBank'], {
      skipLanguageFinalizer: true,
    }).quizBank.quizzes[0].questions;

    expect(JSON.stringify(questions)).not.toContain(unsupported);
    expect(questions.every((question) => question.enrichmentSource !== 'lesson-content-enrichment')).toBe(true);
  });

  it('quarantines an unverified saved semantic packet before every deliverable projection', () => {
    const unsupported = 'Head movement describes a mechanism where complete phrases move freely to any position.';
    const enrichment = {
      source: 'legacy-saved-model-project',
      coverage: { requestedLessons: 1, admittedLessons: 1 },
      lessonContent: {
        'lesson-1': {
          enrichmentSource: 'compiler-owned-exact-source-ledger',
          quizItems: [
            {
              ...mc(0, 'Which statement defines head movement?'),
              options: [unsupported, 'A second option', 'A third option', 'A fourth option'],
              explanation: unsupported,
            },
          ],
          keyTerms: [{ term: 'Head movement', definition: unsupported, example: unsupported }],
          slideContent: [{ title: 'Head movement', bullets: [unsupported], speakerNotes: unsupported }],
          discussionPrompt: { prompt: unsupported, tension: unsupported, positions: [unsupported] },
          assignmentCore: { taskDescription: unsupported, parameters: [unsupported] },
          studyGuide: { summary: unsupported, reviewStrategy: unsupported },
          workedExample: { problem: unsupported, steps: [unsupported], result: unsupported },
          reasoningScaffolds: [unsupported],
          structuralConnections: [unsupported],
          structuralBridges: [unsupported],
          kernel: {
            facts: [unsupported],
            scenario: { setup: unsupported, materials: unsupported },
            provenance: {
              source: 'compiler-owned-exact-source-ledger',
              copiedFactsVerbatim: true,
              factCount: 1,
            },
          },
        },
      },
    };
    const blueprint = buildCourseBlueprint(COURSE_MAP, { enrichment });
    const compiled = compileBlueprintDeliverables(
      blueprint,
      ['quizBank', 'slideDecks', 'lessonPlans', 'studyGuides', 'assignments', 'discussions', 'courseFaq'],
      { skipLanguageFinalizer: true },
    );

    expect(JSON.stringify(compiled)).not.toContain(unsupported);
    const hydrated = hydrateBlueprintForCompilation(blueprint);
    expect(hydrated.lessons[0].enrichment.semanticAdmissionReceipt).toMatchObject({
      authorityBoundary: 'compiler-semantic-authority-v1',
      status: 'quarantined-unverified-semantic-enrichment',
    });
    expect(hydrated.lessons[0].enrichment.kernel.facts).toEqual([]);
    expect(hydrated.lessons[0].enrichment).not.toHaveProperty('facts');
    expect(hydrated.lessons[0].enrichment).not.toHaveProperty('sourceFacts');
  });

  it('grants research authority field by field and compiles bounded ledger assessments', () => {
    const claims = [
      'Evidence triangulation is a method that compares independent records before a researcher extends a claim.',
      'Conflicting observations narrow the conclusion that the available records can support.',
      'A bounded research claim states which evidence would be needed for a broader inference.',
    ];
    const unsupported = 'The model says triangulation always proves that every source is correct.';
    const checks = claims.map((claim, index) => ({
      claimId: `source:claim-${index + 1}`,
      claim,
      quote: claim,
      quoteInSnapshot: true,
      sourceIdentityVerified: true,
      semanticAdmissionVerified: true,
      semanticSupport: true,
    }));
    const enrichment = {
      source: 'research-fixture',
      coverage: { requestedLessons: 1, admittedLessons: 1, missingLessons: [1] },
      lessonContent: {
        'lesson-1': {
          sourceFactAuthority: 'verified-open-research',
          enrichmentSource: 'algi-researched',
          keyTerms: [
            {
              term: 'Evidence triangulation',
              definition: claims[0],
              example: claims[1],
              misconception: unsupported,
              correction: unsupported,
            },
          ],
          quizItems: [mc(0, unsupported)],
          kernel: {
            facts: [claims[0], claims[1], unsupported],
            provenance: {
              source: 'compiler-owned-exact-source-ledger',
              authority: 'verified-open-research',
              copiedFactsVerbatim: true,
              factCount: 3,
            },
          },
          conceptProvenance: {
            source: 'algi-researched',
            authority: 'verified-open-research',
            fullyAnchored: true,
            citations: [
              {
                displayTitle: 'Evidence triangulation source',
                sourceUrl: 'https://example.test/triangulation',
                license: 'CC BY 4.0',
                supportReceipt: { checks },
              },
            ],
          },
        },
      },
    };

    const blueprint = buildCourseBlueprint(COURSE_MAP, { enrichment });
    const hydrated = hydrateBlueprintForCompilation(blueprint);
    expect(hydrated.lessons[0].enrichment.kernel.facts).toEqual(claims);
    expect(hydrated.lessons[0].enrichment.keyTerms[0]).toMatchObject({
      term: 'Evidence triangulation',
      definition: claims[0],
      misconception: '',
      correction: '',
    });
    expect(hydrated.lessons[0].enrichment.keyTerms[0]).not.toHaveProperty('example');
    expect(JSON.stringify(hydrated.lessons[0].enrichment)).not.toContain(unsupported);

    const questions = compileBlueprintDeliverables(blueprint, ['quizBank'], {
      skipLanguageFinalizer: true,
    }).quizBank.quizzes[0].questions;
    expect(questions.every((question) => question.enrichmentSource === 'compiler-exact-source-ledger')).toBe(true);
    expect(questions.every((question) => question.sourceReviewRequired === false)).toBe(true);
    expect(JSON.stringify(questions)).not.toContain('This recovery item assesses');
  });
});
