import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SELF_IMPROVEMENT_FIXTURES,
  attachRunTrend,
  auditSelfImprovementFixture,
  buildAutonomousQualityDecision,
  buildInternalSelfImprovementAudit,
  buildRunTrend,
  generateSelfImprovementFixtures,
  renderInternalSelfImprovementMarkdown,
} from '../internalSelfImprovementAudit.mjs';

function richQualityText(compiledText) {
  return [
    compiledText,
    'Students use concrete evidence, worked examples, peer feedback, formative checks, and revision notes.',
    'The instructor can see objectives, timing, materials, assessment criteria, feedback routines, and support moves.',
    'The lesson names the artifact students produce, the source they use, the decision they make, and the next step.',
    'Strong work is described with specific evidence, clear reasoning, domain vocabulary, and usable feedback.',
    'The package includes assignment expectations, rubric criteria, discussion prompts, quiz scoring, study guidance, and FAQ support.',
    'Quality Matters alignment is visible: learning objectives, assessment, instructional materials, learning activities, course technology, learner support, accessibility, and usability work together.',
    'OSCQR-style course overview, clear instructions, interaction, instructor presence, grading policy, formative assessment, and feedback are inspectable.',
    'UDL learner agency is visible through engagement choice, authentic relevance, representation with multiple media and examples, and action expression through artifact performance practice.',
    'Matrix vector basis eigen proof calculation worked example problem set solution.',
    'Mandarin pinyin tone pronunciation dialogue hanzi speaking listening oral conversation practice.',
    'Dataset notebook model validation Python feature metric bias limitation train test reproducible provenance.',
    'Thesis argument textual evidence close reading passage draft revision peer review audience style.',
    'Asynchronous synchronous hybrid live handoff feedback checkpoint debrief review.',
  ].join(' ');
}

function makeLessonRows(courseMap, mapper) {
  const lessons = Array.isArray(courseMap?.lessons) && courseMap.lessons.length > 0 ? courseMap.lessons : [{}];
  return lessons.map((lesson, index) => mapper(lesson, index));
}

function buildFakeCompiledFeature(featureId, courseMap, compiledText) {
  const text = richQualityText(compiledText);
  const textFor = (index) =>
    richQualityText(
      index === 0
        ? compiledText
        : 'Students use concrete domain evidence, worked examples, peer feedback, formative checks, and revision notes.',
    );
  const lessonRows = (mapper) => makeLessonRows(courseMap, mapper);
  if (featureId === 'syllabus') {
    return {
      syllabus: {
        courseTitle: courseMap?.courseName || 'Course',
        courseDescription: text,
        assessmentPlan: 'Assessment, grading, and feedback are visible before publication.',
        officeHours: 'Instructor support and contact details are visible.',
      },
    };
  }
  if (featureId === 'lessonPlans') {
    return {
      lessonPlans: lessonRows((lesson, index) => ({
        lessonTitle: lesson.title || `Lesson ${index + 1}`,
        objectives: textFor(index),
        activities: 'Practice activity, feedback checkpoint, and assessment evidence review.',
        assessment: 'Assessment check with feedback.',
      })),
    };
  }
  if (featureId === 'slideDecks') {
    return {
      decks: lessonRows((lesson, index) => ({
        lessonTitle: lesson.title || `Lesson ${index + 1}`,
        slides: Array.from({ length: 6 }, (_, slideIndex) => ({
          title: `Slide ${slideIndex + 1}`,
          bullets: [`Objective ${slideIndex + 1}`, textFor(index)],
          notes: 'Speaker notes include practice, debrief, exit check, and feedback.',
        })),
      })),
    };
  }
  if (featureId === 'assignments') {
    return {
      assignments: lessonRows((lesson, index) => ({
        title: `${lesson.title || `Lesson ${index + 1}`} assignment`,
        deliverable: textFor(index),
        criteria: 'Evidence, reasoning, revision, and feedback use.',
        submission: 'Specific artifact submission.',
      })),
    };
  }
  if (featureId === 'rubrics') {
    return {
      rubrics: lessonRows((lesson, index) => ({
        title: `${lesson.title || `Lesson ${index + 1}`} rubric`,
        criteria: [
          { name: 'Evidence', performance: textFor(index), points: 30 },
          { name: 'Reasoning', performance: 'Clear performance level with feedback and revision.', points: 30 },
        ],
      })),
    };
  }
  if (featureId === 'discussions') {
    return {
      discussions: lessonRows((lesson, index) => ({
        lessonTitle: lesson.title || `Lesson ${index + 1}`,
        prompt: textFor(index),
        peerResponse: 'Students respond to peers using source evidence and examples.',
      })),
    };
  }
  if (featureId === 'quizBank') {
    return {
      quizzes: lessonRows((lesson, index) => ({
        lessonTitle: lesson.title || `Lesson ${index + 1}`,
        questions: [
          {
            type: 'multiple_choice',
            question: textFor(index),
            answer: 'A',
            rationale: 'Scoring rationale and feedback.',
          },
          { type: 'short_answer', question: 'Explain the evidence move.', scoring: 'Scoring guide.' },
        ],
      })),
    };
  }
  if (featureId === 'studyGuides') {
    return {
      studyGuides: lessonRows((lesson, index) => ({
        lessonTitle: lesson.title || `Lesson ${index + 1}`,
        summary: textFor(index),
        practice: 'Practice questions, strong work examples, and review checks.',
      })),
    };
  }
  if (featureId === 'courseFaq') {
    return {
      faqs: lessonRows((lesson, index) => ({
        lt: lesson.title || `Lesson ${index + 1}`,
        qs: [{ question: 'What should I review?', answer: `${textFor(index)} Assignment and assessment support.` }],
      })),
    };
  }
  return { text };
}

function fakeRuntime({ compiledText, blueprint = null }) {
  return {
    buildCourseBlueprint: (courseMap) => blueprint || { courseMap },
    getBlueprintCompiledFeatures: (features) => features,
    compileBlueprintDeliverables: (blueprintInput, features) =>
      Object.fromEntries(
        features.map((featureId) => [
          featureId,
          buildFakeCompiledFeature(featureId, blueprintInput?.courseMap, compiledText),
        ]),
      ),
    validateDeliverableGeneration: () => ({ valid: true, blockers: [] }),
    findPublishabilityPlaceholders: () => [],
  };
}

describe('internal self-improvement audit', () => {
  const allReviewSignalsText = [
    'Before publication, confirm official dates with the local calendar and confirm assessment weights.',
    'Source conflict, duplicate schedule labels, clinical safety, scope of practice, and local review are visible.',
    'Matrix vector basis dimension eigenvalue problem set worked example proof calculation solution.',
    'Mandarin pinyin tone pronunciation dialogue hanzi speaking listening oral conversation practice.',
    'Dataset notebook model validation Python feature metric bias limitation train test evidence.',
    'Thesis argument textual evidence close reading passage draft revision peer review audience style.',
    'Learning objectives align with assessment criteria, scoring, feedback, source materials, activities, and practice.',
    'Instructor support, peer discussion, accessible technology, usability, engagement choice, representation examples, and action expression artifacts are visible.',
  ].join(' ');

  it('blocks when an adversarial fixture loses required review-boundary signals', () => {
    const fixture = DEFAULT_SELF_IMPROVEMENT_FIXTURES[0];
    const result = auditSelfImprovementFixture({
      fixture,
      runtime: fakeRuntime({ compiledText: 'Students complete polished activities with no local review boundary.' }),
      features: ['lessonPlans'],
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers).toBeGreaterThan(0);
    expect(result.findings.some((finding) => finding.check === 'review-boundary')).toBe(true);
    expect(result.qualityScore).toBeLessThan(90);
    expect(result.criticReview.verdict).toBe('actionable-repair-candidates');
  });

  it('passes when compiled output keeps required review actions visible', async () => {
    const fixture = DEFAULT_SELF_IMPROVEMENT_FIXTURES[0];
    const payload = await buildInternalSelfImprovementAudit({
      fixtures: [fixture],
      runtime: fakeRuntime({
        compiledText:
          'Before publication, confirm official dates with the local calendar and confirm assessment weights with the instructor grading decision.',
      }),
      features: ['lessonPlans'],
    });

    expect(payload.summary.status).toBe('pass');
    expect(payload.summary.blockers).toBe(0);
    expect(payload.summary.warnings).toBe(0);
    expect(payload.summary.receiptCount).toBe(1);
    expect(payload.summary.averageQualityScore).toBeGreaterThan(80);
    expect(payload.autonomousDecision.requiresHumanInterpretation).toBe(false);
    expect(payload.roundLedger).toHaveLength(1);
    expect(payload.results[0].inputRiskCount).toBeGreaterThan(0);
    expect(payload.results[0].compactReceipt.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'compiled', label: 'Compiled' }),
        expect.objectContaining({ id: 'live-calls', value: '0' }),
      ]),
    );
  });

  it('surfaces generic student-facing wording as repair candidates', () => {
    const fixture = DEFAULT_SELF_IMPROVEMENT_FIXTURES[0];
    const result = auditSelfImprovementFixture({
      fixture,
      runtime: fakeRuntime({
        compiledText: [
          'Before publication, confirm official dates with the local calendar and confirm assessment weights.',
          'Class notes and assigned materials for this lesson should be cited before submission.',
          'For this lesson, I would use community intake to choose evidence from the source packet.',
          'A student is preparing an intake memo. Which action best applies community intake from this lesson?',
        ].join(' '),
      }),
      features: ['lessonPlans'],
    });

    expect(result.status).toBe('pass');
    expect(result.improvements).toBe(3);
    expect(result.criticReview.realFindingCount).toBe(3);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'student-facing-specificity',
          severity: 'improvement',
          reviewerRole: 'synthetic faculty editor',
          repairPath: expect.stringContaining('lesson'),
        }),
      ]),
    );
  });

  it('catches shallow generic output that old structural checks would miss', () => {
    const fixture = DEFAULT_SELF_IMPROVEMENT_FIXTURES[2];
    const result = auditSelfImprovementFixture({
      fixture,
      runtime: fakeRuntime({
        compiledText: [
          'Matrix vector basis dimension eigenvalue problem set worked example proof calculation solution.',
          Array.from({ length: 24 }, (_, index) => `course evidence ${index}`).join(' '),
          Array.from({ length: 10 }, (_, index) => `instructional or professional decision ${index}`).join(' '),
          'Class notes and assigned materials for this course.',
          'Course-appropriate length with enough evidence.',
          'Document, presentation, or course-site submission as assigned.',
        ].join(' '),
      }),
      features: ['lessonPlans'],
    });

    expect(result.status).toBe('pass');
    expect(result.criticReview.verdict).toBe('actionable-repair-candidates');
    expect(result.expertQualityReview.verdict).toBe('needs-repair');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'expert-quality-rubric',
          severity: 'improvement',
          ruleId: 'generic-course-evidence',
        }),
        expect.objectContaining({
          check: 'domain-specific-quality',
          severity: 'improvement',
          domainId: 'math',
        }),
      ]),
    );
  });

  it('accepts structured syllabus description evidence without requiring the key name in rendered text', () => {
    const fixture = DEFAULT_SELF_IMPROVEMENT_FIXTURES[0];
    const result = auditSelfImprovementFixture({
      fixture,
      runtime: fakeRuntime({
        compiledText:
          'Students investigate official dates, source boundaries, objectives, grading, feedback, support, accessibility, and usable course navigation.',
      }),
      features: ['syllabus'],
    });

    expect(result.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'real-deliverable-quality',
          ruleId: 'course-overview-description',
        }),
      ]),
    );
  });

  it('flags output that misses standards-backed course design alignment', () => {
    const fixture = DEFAULT_SELF_IMPROVEMENT_FIXTURES[0];
    const result = auditSelfImprovementFixture({
      fixture,
      runtime: {
        buildCourseBlueprint: (courseMap) => ({ courseMap }),
        getBlueprintCompiledFeatures: (features) => features,
        compileBlueprintDeliverables: () => ({
          lessonPlans: {
            lessonPlans: [{ lessonTitle: 'Lesson 1', notes: 'Students read notes and answer questions.' }],
          },
        }),
        validateDeliverableGeneration: () => ({ valid: true, blockers: [] }),
        findPublishabilityPlaceholders: () => [],
      },
      features: ['lessonPlans'],
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'educational-standards-alignment',
          ruleId: 'qm-critical-alignment',
          standardIds: expect.arrayContaining(['quality-matters-higher-ed']),
        }),
        expect.objectContaining({
          check: 'educational-standards-alignment',
          ruleId: 'udl-multiple-means',
          standardIds: expect.arrayContaining(['cast-udl-3']),
        }),
      ]),
    );
    expect(result.expertQualityReview.dimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'learnerAgencyAccessibility',
          verdict: expect.stringMatching(/weak|watch/),
        }),
      ]),
    );
  });

  it('treats explicit non-empty assessment fields as assessment evidence', () => {
    const fixture = DEFAULT_SELF_IMPROVEMENT_FIXTURES[1];
    const result = auditSelfImprovementFixture({
      fixture,
      runtime: fakeRuntime({
        compiledText:
          'Clinical safety, scope of practice, duplicate source conflict, and local review confirmations are visible before publication.',
      }),
      features: ['lessonPlans'],
    });

    expect(
      result.findings.some(
        (finding) => finding.check === 'input-risk' && /lack visible assessment evidence/i.test(finding.message),
      ),
    ).toBe(false);
    expect(result.findings.some((finding) => /Duplicate schedule labels/i.test(finding.message))).toBe(true);
  });

  it('blocks impossible timing with lesson artifact and repair path context', () => {
    const fixture = DEFAULT_SELF_IMPROVEMENT_FIXTURES[0];
    const result = auditSelfImprovementFixture({
      fixture,
      runtime: fakeRuntime({
        compiledText:
          'Confirm official dates with the registrar and confirm assessment weights before students receive the package.',
        blueprint: {
          lessons: [
            {
              lessonNumber: 1,
              title: 'Lesson 1: Overloaded simulation',
              studentArtifact: 'simulation readiness packet',
              workloadEstimate: { totalStudentMinutes: 900, inClassMinutes: 300 },
              classSessionPlan: { plannedMinutes: 300, feasibilityStatus: 'impossible' },
            },
          ],
          compilerPath: { adaptiveSafety: { locallyRepairedLessonCount: 0 } },
          qualitySignals: { sourceGroundedLessonCount: 1 },
        },
      }),
      features: ['lessonPlans'],
    });

    expect(result.status).toBe('blocked');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'timing-workload',
          severity: 'blocker',
          lessonTitle: 'Lesson 1: Overloaded simulation',
          artifact: 'simulation readiness packet',
          repairPath: expect.stringContaining('Adjust the lesson workload'),
        }),
      ]),
    );
  });

  it('renders a concise report with fixture matrix and findings', async () => {
    const payload = await buildInternalSelfImprovementAudit({
      fixtures: [DEFAULT_SELF_IMPROVEMENT_FIXTURES[0]],
      runtime: fakeRuntime({
        compiledText:
          'Confirm official dates with the registrar and confirm assessment weights before students receive the package.',
      }),
      features: ['lessonPlans'],
    });

    const markdown = renderInternalSelfImprovementMarkdown(payload);

    expect(markdown).toContain('# CourseMapper Internal Self-Improvement Audit');
    expect(markdown).toContain('Rounds completed: 1');
    expect(markdown).toContain('## Autonomous Decision');
    expect(markdown).toContain('## Run Trend');
    expect(markdown).toContain('## Stopping Rule');
    expect(markdown).toContain('## Quality Summary');
    expect(markdown).toContain('## Expert Quality Summary');
    expect(markdown).toContain('## Harder Judge Evidence');
    expect(markdown).toContain('## Educational Standards Used');
    expect(markdown).toContain('quality-matters-higher-ed');
    expect(markdown).toContain('suny-oscqr');
    expect(markdown).toContain('cast-udl-3');
    expect(markdown).toContain('## Critic-of-Critic Summary');
    expect(markdown).toContain('## Fixture Matrix');
    expect(markdown).toContain('## Compact Receipt Matrix');
    expect(markdown).toContain('## Repair Candidates');
    expect(markdown).toContain('## Round Ledger');
    expect(markdown).toContain('## Accepted Risks');
    expect(markdown).toContain('sparse-official-dates-and-assessments');
  });

  it('keeps enough default fixtures for broad self-improvement rounds', () => {
    expect(DEFAULT_SELF_IMPROVEMENT_FIXTURES).toHaveLength(6);
    expect(DEFAULT_SELF_IMPROVEMENT_FIXTURES.map((fixture) => fixture.id)).toEqual(
      expect.arrayContaining(['writing-humanities-revision-seminar']),
    );
  });

  it('generates deterministic adversarial fixtures for 100-round loops', () => {
    const fixtures = generateSelfImprovementFixtures({ rounds: 100 });
    const ids = new Set(fixtures.map((fixture) => fixture.id));

    expect(fixtures).toHaveLength(100);
    expect(ids.size).toBe(100);
    expect(fixtures.slice(0, 6).every((fixture) => fixture.generated === false)).toBe(true);
    expect(fixtures.slice(6).every((fixture) => fixture.generated === true)).toBe(true);
    expect(new Set(fixtures.map((fixture) => fixture.mutation.id)).size).toBeGreaterThan(4);
  });

  it('covers the expanded adversarial mutation families', () => {
    const fixtures = generateSelfImprovementFixtures({ rounds: 120 });
    const mutationIds = new Set(fixtures.map((fixture) => fixture.mutation.id));

    expect([...mutationIds]).toEqual(
      expect.arrayContaining([
        'large-course-map',
        'malformed-import-fragments',
        'contradictory-rubrics',
        'missing-objectives',
        'overloaded-lessons',
        'multilingual-mixed-course',
        'bad-date-structures',
        'copied-placeholder-language',
        'export-package-integrity',
        'deliverable-specific-weak-spots',
      ]),
    );
    expect(mutationIds.size).toBeGreaterThanOrEqual(17);
  });

  it('surfaces expanded mutation families as accepted input risks', () => {
    const fixtures = generateSelfImprovementFixtures({ rounds: 120 });
    const riskyMutationIds = new Set([
      'malformed-import-fragments',
      'contradictory-rubrics',
      'missing-objectives',
      'overloaded-lessons',
      'multilingual-mixed-course',
      'bad-date-structures',
      'copied-placeholder-language',
      'export-package-integrity',
      'deliverable-specific-weak-spots',
    ]);

    const results = fixtures
      .filter((fixture) => riskyMutationIds.has(fixture.mutation.id))
      .map((fixture) =>
        auditSelfImprovementFixture({
          fixture,
          runtime: fakeRuntime({ compiledText: allReviewSignalsText }),
          features: ['lessonPlans'],
        }),
      );

    expect(results).not.toHaveLength(0);
    expect(results.every((result) => result.inputRiskCount > 0)).toBe(true);
    expect(results.every((result) => result.criticReview.verdict !== 'actionable-repair-candidates')).toBe(true);
  });

  it('builds a 100-round payload with quality scores, ledger entries, and critic verdicts', async () => {
    const fixtures = generateSelfImprovementFixtures({ rounds: 100 });
    const payload = await buildInternalSelfImprovementAudit({
      fixtures,
      runtime: fakeRuntime({ compiledText: allReviewSignalsText }),
      features: ['lessonPlans'],
      roundsRequested: 100,
    });

    expect(payload.summary.roundCount).toBe(100);
    expect(payload.summary.generatedRoundCount).toBe(94);
    expect(payload.summary.averageQualityScore).toBeGreaterThan(80);
    expect(payload.summary.averageExpertQualityScore).toBeGreaterThan(8);
    expect(payload.summary.expertDimensionAverages).toEqual(
      expect.objectContaining({
        domainFit: expect.any(Number),
        classroomUsefulness: expect.any(Number),
        learnerAgencyAccessibility: expect.any(Number),
        packageIntegrity: expect.any(Number),
      }),
    );
    expect(payload.summary.categoryAverages).toEqual(
      expect.objectContaining({
        specificity: expect.any(Number),
        assessmentFit: expect.any(Number),
        instructorTrust: expect.any(Number),
      }),
    );
    expect(payload.summary.criticVerdicts).toEqual(
      expect.objectContaining({ 'clean-output-with-input-risks': expect.any(Number) }),
    );
    expect(payload.autonomousDecision).toEqual(
      expect.objectContaining({
        status: 'coverage-expansion-required',
        nextAction: 'keep-running',
        requiresHumanInterpretation: false,
      }),
    );
    expect(payload.autonomousDecision.actions.required).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'run-larger-loop-to-500-rounds',
          type: 'expand-run',
        }),
      ]),
    );
    expect(payload.autonomousDecision.stoppingRule.stopRecommended).toBe(false);
    expect(payload.roundLedger).toHaveLength(100);
    expect(payload.roundLedger[99]).toEqual(
      expect.objectContaining({
        round: 100,
        mutationId: expect.any(String),
        qualityScore: expect.any(Number),
        expertQualityScore: expect.any(Number),
        baselineQualityScore: expect.any(Number),
        qualityDeltaFromSource: expect.any(Number),
        criticVerdict: expect.any(String),
        patchArea: expect.any(String),
      }),
    );
  });

  it('turns bad-output findings into autonomous repair actions', async () => {
    const fixture = DEFAULT_SELF_IMPROVEMENT_FIXTURES[0];
    const payload = await buildInternalSelfImprovementAudit({
      fixtures: [fixture],
      runtime: fakeRuntime({
        compiledText: [
          'Students complete polished activities with no local review boundary.',
          'Class notes and assigned materials for this lesson should be cited.',
          'For this lesson, I would use the idea to choose evidence.',
          'Which action best applies the concept from this lesson?',
        ].join(' '),
      }),
      features: ['lessonPlans'],
    });

    expect(payload.autonomousDecision.status).toBe('repair-required');
    expect(payload.autonomousDecision.nextAction).toBe('repair-code');
    expect(payload.autonomousDecision.requiresHumanInterpretation).toBe(false);
    expect(payload.autonomousDecision.actions.required).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'repair-code',
          status: 'required',
          priority: 'P0',
          targetFiles: expect.arrayContaining(['src/lib/courseBlueprintCompiler.js']),
        }),
      ]),
    );
  });

  it('can build an autonomous coverage action without reading the ledger manually', () => {
    const decision = buildAutonomousQualityDecision({
      summary: {
        roundCount: 5,
        blockers: 0,
        warnings: 0,
        repairCandidateCount: 0,
        minQualityScore: 99,
        averageQualityScore: 99,
      },
      results: [],
      roundLedger: [
        { round: 1, mutationId: 'base-repeat', qualityScore: 99, repairCandidateCount: 0 },
        { round: 2, mutationId: 'assessment-gap', qualityScore: 97, repairCandidateCount: 0 },
      ],
    });

    expect(decision.status).toBe('coverage-expansion-required');
    expect(decision.nextAction).toBe('keep-running');
    expect(decision.requiresHumanInterpretation).toBe(false);
    expect(decision.actions.required).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'expand-run-to-100-rounds',
          type: 'expand-run',
        }),
      ]),
    );
  });

  it('compares run trends without requiring ledger interpretation', async () => {
    const previousPayload = await buildInternalSelfImprovementAudit({
      fixtures: generateSelfImprovementFixtures({ rounds: 100 }),
      runtime: fakeRuntime({ compiledText: allReviewSignalsText }),
      features: ['lessonPlans'],
      roundsRequested: 100,
    });
    const currentPayload = await buildInternalSelfImprovementAudit({
      fixtures: generateSelfImprovementFixtures({ rounds: 500 }),
      runtime: fakeRuntime({ compiledText: allReviewSignalsText }),
      features: ['lessonPlans'],
      roundsRequested: 500,
    });

    const trend = buildRunTrend({ previousPayload, currentPayload });

    expect(trend.hasPrevious).toBe(true);
    expect(trend.deltas.roundCountDelta).toBe(400);
    expect(trend.actions.resolvedRequiredActionIds).toEqual(expect.arrayContaining(['run-larger-loop-to-500-rounds']));
    expect(trend.mutationCoverage.currentCount).toBeGreaterThanOrEqual(17);
    expect(trend.recommendation.nextAction).toBe('stop');
  });

  it('stops only after a stable larger run with trend evidence', async () => {
    const previousPayload = await buildInternalSelfImprovementAudit({
      fixtures: generateSelfImprovementFixtures({ rounds: 100 }),
      runtime: fakeRuntime({ compiledText: allReviewSignalsText }),
      features: ['lessonPlans'],
      roundsRequested: 100,
    });
    const rawCurrentPayload = await buildInternalSelfImprovementAudit({
      fixtures: generateSelfImprovementFixtures({ rounds: 500 }),
      runtime: fakeRuntime({ compiledText: allReviewSignalsText }),
      features: ['lessonPlans'],
      roundsRequested: 500,
    });

    const currentPayload = attachRunTrend(rawCurrentPayload, previousPayload);

    expect(currentPayload.autonomousDecision).toEqual(
      expect.objectContaining({
        status: 'quality-green',
        nextAction: 'stop',
        requiresHumanInterpretation: false,
      }),
    );
    expect(currentPayload.autonomousDecision.actions.required).toEqual([]);
    expect(currentPayload.autonomousDecision.stoppingRule.stopRecommended).toBe(true);
    expect(currentPayload.autonomousDecision.gate.passed).toBe(true);
    expect(currentPayload.trend.actions.resolvedRequiredActionIds).toEqual(
      expect.arrayContaining(['run-larger-loop-to-500-rounds']),
    );
  });
});
