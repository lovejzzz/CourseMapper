import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CURRENT_PACKAGE_VERSION,
  DEFAULT_REVIEW_FIXTURES,
  auditExpertReviewFixture,
  buildExpertReviewQualityAudit,
  closeHybridPipelineAuditRuntime,
  loadHybridPipelineAuditRuntime,
  loadReviewFixtures,
  renderExpertReviewQualityAuditMarkdown,
  writeExpertReviewQualityAudit,
} from '../expertReviewQualityAudit.mjs';

describe('expert review quality audit', () => {
  const CORE_ARTIFACT_IDS = [
    'syllabus',
    'lessonPlans',
    'slideDecks',
    'assignments',
    'rubrics',
    'discussions',
    'quizBank',
    'studyGuides',
    'courseFaq',
  ];

  const makePassingScorecardDimensions = (score = 4.5) => [
    {
      id: 'instructional-alignment',
      label: 'Instructional alignment',
      score,
      evidenceArtifacts: ['syllabus', 'lessonPlans', 'assignments'],
      evidenceExamples: [
        'Reviewer checked syllabus outcomes, lesson practice, and assignment criteria and found shared empirical-evidence targets.',
      ],
      notes: 'Objectives, practice, and assessments align.',
    },
    {
      id: 'teachability',
      label: 'Teachability',
      score,
      evidenceArtifacts: ['lessonPlans', 'slideDecks', 'studyGuides'],
      evidenceExamples: [
        'Reviewer checked lesson timing, slide notes, and study-guide supports and found the package teachable without major rewriting.',
      ],
      notes: 'Instructor can teach the package without major rewriting.',
    },
    {
      id: 'assessment-authenticity',
      label: 'Assessment authenticity',
      score,
      evidenceArtifacts: ['assignments', 'rubrics', 'quizBank'],
      evidenceExamples: [
        'Reviewer checked assignments, rubrics, and quiz items and found students make authentic method decisions from evidence.',
      ],
      notes: 'Assessments ask students to do real disciplinary work.',
    },
    {
      id: 'feedback-and-revision',
      label: 'Feedback and revision loop',
      score,
      evidenceArtifacts: ['assignments', 'rubrics', 'lessonPlans'],
      evidenceExamples: [
        'Reviewer checked milestone feedback, rubric language, and lesson revision moves and found usable revision cues.',
      ],
      notes: 'Students receive usable feedback and revision cues.',
    },
    {
      id: 'cognitive-progression',
      label: 'Cognitive progression',
      score,
      evidenceArtifacts: ['courseMap', 'lessonPlans', 'quizBank'],
      evidenceExamples: [
        'Reviewer checked course arc, lesson sequence, and quiz bank and found progression from concept use to transfer decisions.',
      ],
      notes: 'The course builds from recall to transfer.',
    },
    {
      id: 'accessibility-and-trust',
      label: 'Accessibility and trust',
      score,
      evidenceArtifacts: ['syllabus', 'courseFaq', 'studyGuides'],
      evidenceExamples: [
        'Reviewer checked syllabus trust language, FAQ support, and study guides and found local-review limits visible.',
      ],
      notes: 'Support, review flags, and trust language are visible.',
    },
  ];

  const makePassingSourceFidelityReview = () => ({
    sourceInputReviewed: true,
    compiledPackageReviewed: true,
    lessonOrderPreserved: true,
    assessmentsPreserved: true,
    unsupportedInventionRisk: 'low',
    artifactReviews: CORE_ARTIFACT_IDS.map((featureId) => ({
      featureId,
      sourceCompared: true,
      packageCompared: true,
      sourceSignalsPreserved: true,
      compilerDecisionVisible: true,
      publishGateVisible: true,
      modelUsePolicyVisible: true,
      handoffReviewFocusVisible: true,
      localReviewActionVisible: true,
      unsupportedInventionRisk: 'low',
      notes: `Reviewer compared source course-map signals to compiled ${featureId} output and found preserved lesson and assessment evidence.`,
    })),
    notes:
      'Reviewer compared the source course map with the compiled package and found lesson order, assessments, and review flags preserved.',
  });

  const makePassingAssumptionLedgerReview = () => ({
    assumptionLedgerReviewed: true,
    categoriesReviewed: ['learner-context', 'course-modality', 'assessment-weight', 'handoff-boundary'],
    reviewRequiredRowsReviewed: true,
    reviewedRows: [
      {
        category: 'assessment-weight',
        coverage: 'all review-required rows in this category',
        decision: 'Reviewer confirmed draft assessment weights require local instructor confirmation.',
        notes:
          'Reviewer checked the generated assessment-weight rows and confirmed the package marks draft weights as local-confirmation items.',
      },
      {
        category: 'handoff-boundary',
        coverage: 'all review-required rows in this category',
        decision: 'Reviewer held publication until official local policies and dates are confirmed.',
        notes:
          'Reviewer checked the handoff-boundary row and confirmed final dates, policies, source permissions, and accommodations remain human-review items.',
      },
    ],
    unresolvedAssumptionRisk: 'low',
    notes:
      'Reviewer inspected the assumption ledger and confirmed learner context, modality, draft weights, and publication-boundary assumptions are visible for local confirmation.',
  });

  const makePassingBlueprintQualityReview = (lessonCount = 8) => ({
    blueprintReviewed: true,
    sourceInputReviewed: true,
    compactRepresentationReviewed: true,
    sourceSignalsPreserved: true,
    assessmentsPreserved: true,
    alignmentUsable: true,
    unresolvedBlueprintRisk: 'low',
    lessonReviews: Array.from({ length: lessonCount }, (_, index) => ({
      lessonNumber: index + 1,
      sourceCompared: true,
      blueprintCompared: true,
      sourceSignalsPreserved: true,
      assessmentPreserved: true,
      alignmentUsable: true,
      reviewRequiredFlagsVisible: true,
      notes: `Reviewer compared source lesson ${index + 1} to the compact blueprint row and found source topic, assessment, alignment, and review flags preserved.`,
    })),
    notes:
      'Reviewer inspected the compact blueprint against the source course map and found source compression faithful, lesson rows usable, and decode risk low.',
  });

  const makeExternalCourseMap = (lessonCount = 3) => ({
    courseName: 'External Field Methods Studio',
    semester: 'Fall 2026',
    lessons: Array.from({ length: lessonCount }, (_, index) => ({
      title: `Lesson ${index + 1}: Field Method ${index + 1}`,
      sections: [
        {
          topicSection: `Interview protocol ${index + 1}; observation memo ${index + 1}`,
          learningObjectives: `Analyze interview evidence ${index + 1}; Evaluate observation reliability ${index + 1}`,
          learningGoals: `Connect field evidence to research decisions ${index + 1}`,
          weeklyAssessments: `Field memo checkpoint ${index + 1}`,
          asyncActivities: `Read field guide ${index + 1}; annotate interview evidence`,
          syncActivities: `Practice interview protocol ${index + 1}; peer debrief`,
          supportingResources: `Field guide ${index + 1}; observation template ${index + 1}`,
          evaluateDesign: `Score field memo evidence and observation reliability ${index + 1}`,
        },
      ],
    })),
  });

  const makeExternalEditHistoryFixture = (overrides = {}) => {
    const base = {
      id: 'external-edit-history-fixture',
      label: 'External edit-history smoke test',
      sampleId: 'gold-research-methods-8',
      evidenceType: 'external',
      reviewerRole: 'external methods instructor',
      reviewEvidence: {
        reviewerType: 'external-instructor',
        reviewedAt: '2026-05-27',
        reviewedPackageVersion: CURRENT_PACKAGE_VERSION,
        reviewedArtifacts: ['rubrics', 'quizBank', 'slideDecks'],
        evidenceSource: 'instructor edit history',
      },
      editHistoryEvidenceType: 'external',
      packageMustMatch: [/empirical evidence/i, /method decision/i],
      instructorEditPatterns: [
        {
          featureId: 'rubrics',
          field: 'criteria',
          action: 'accepted',
          accessCount: 5,
          importance: 4,
          before: 'Generic feedback criteria ask students to explain whether the answer is complete.',
          after:
            'Criterion-specific feedback names the empirical evidence, method decision, and next concrete revision step.',
          notes:
            'Instructor repeatedly accepted rubric edits that made feedback criterion-specific and tied to method evidence.',
        },
        {
          featureId: 'quizBank',
          field: 'question',
          action: 'accepted',
          before: 'Questions asked students to recall a research-methods term from the lesson.',
          after: 'Questions ask students to apply a method decision to a small empirical evidence scenario.',
          notes:
            'Instructor accepted quiz edits that raised questions from recall to applied analysis with empirical evidence.',
        },
        {
          featureId: 'slideDecks',
          field: 'slides.notes',
          action: 'edited',
          before: 'Slide notes included long generic facilitation language for each lesson.',
          after: 'Slide notes became concise course-specific prompts tied to the lesson method decision.',
          notes:
            'Instructor edited slide notes toward concise course-specific notes instead of repeated facilitation boilerplate.',
        },
      ],
      preferenceExpectations: {
        syllabus: [/criterion-specific feedback/i],
        rubrics: [/criterion-specific/i],
        quizBank: [/applied analysis/i],
        slideDecks: [/concise course-specific notes/i],
      },
      sourceFidelityReview: makePassingSourceFidelityReview(),
      blueprintQualityReview: makePassingBlueprintQualityReview(),
      assumptionLedgerReview: makePassingAssumptionLedgerReview(),
    };
    return {
      ...base,
      ...overrides,
      reviewEvidence: {
        ...base.reviewEvidence,
        ...(overrides.reviewEvidence || {}),
      },
      sourceFidelityReview:
        overrides.sourceFidelityReview === null
          ? null
          : {
              ...base.sourceFidelityReview,
              ...(overrides.sourceFidelityReview || {}),
            },
      blueprintQualityReview:
        overrides.blueprintQualityReview === null
          ? null
          : {
              ...base.blueprintQualityReview,
              ...(overrides.blueprintQualityReview || {}),
            },
      assumptionLedgerReview:
        overrides.assumptionLedgerReview === null
          ? null
          : {
              ...base.assumptionLedgerReview,
              ...(overrides.assumptionLedgerReview || {}),
            },
    };
  };

  it('passes the internal provisional instructor-review fixtures', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExpertReviewQualityAudit({
        runtime,
        fixtures: DEFAULT_REVIEW_FIXTURES,
      });
      const markdown = renderExpertReviewQualityAuditMarkdown(payload);

      expect(payload.summary.status).toBe('pass');
      expect(payload.summary.reviewFixtureCount).toBe(3);
      expect(payload.summary.externalFixtureCount).toBe(0);
      expect(payload.summary.externalProofEligibleCount).toBe(0);
      expect(payload.summary.externalReviewProofCount).toBe(0);
      expect(payload.summary.reviewerScorecardFixtureCount).toBe(0);
      expect(payload.summary.externalReviewerScorecardCount).toBe(0);
      expect(payload.summary.externalEvidenceAnchoredScorecardCount).toBe(0);
      expect(payload.summary.externalFullPackageReviewCount).toBe(0);
      expect(payload.summary.externalAssumptionLedgerReviewCount).toBe(0);
      expect(payload.summary.externalAssumptionLedgerDecisionReviewCount).toBe(0);
      expect(payload.summary.externalCompleteProofSampleCount).toBe(0);
      expect(payload.summary.externalCompleteProofSampleIds).toEqual([]);
      expect(payload.summary.externalCompleteProofModalityCount).toBe(0);
      expect(payload.summary.externalCompleteProofModalities).toEqual([]);
      expect(payload.summary.externalProjectCompleteProofSampleCount).toBe(0);
      expect(payload.summary.externalProjectCompleteProofSampleIds).toEqual([]);
      expect(payload.summary.minReviewerScore).toBe(null);
      expect(payload.summary.minExternalReviewerScore).toBe(null);
      expect(payload.summary.proofStatus).toBe('internal-provisional-only');
      expect(payload.summary.blueprintFidelityFindings).toBe(0);
      expect(payload.externalProofBundles).toEqual([]);
      expect(payload.proofReadinessChecklist).toMatchObject({
        status: 'blocked',
        passCount: 1,
        itemCount: 12,
      });
      expect(payload.results.every((result) => result.summary.status === 'pass')).toBe(true);
      expect(payload.results.every((result) => result.blueprintFidelityFindingCount === 0)).toBe(true);
      expect(markdown).toContain('CourseMapper Expert Review Quality Audit');
      expect(markdown).toContain('Proof status: internal-provisional-only');
      expect(markdown).toContain('External Proof Readiness Checklist');
      expect(markdown).toContain('External Proof Bundle Matrix');
      expect(markdown).toContain('Fidelity Findings');
      expect(markdown).toContain('Review Fixture Matrix');
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  }, 30000);

  it('blocks required external proof mode when only internal provisional evidence exists', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExpertReviewQualityAudit({
        runtime,
        fixtures: DEFAULT_REVIEW_FIXTURES,
        requireExternalProof: true,
      });
      const markdown = renderExpertReviewQualityAuditMarkdown(payload);
      expect(payload.summary.status).toBe('blocked');
      expect(payload.summary.auditBlockers).toBe(7);
      expect(payload.summary.proofStatus).toBe('internal-provisional-only');
      expect(payload.proofReadinessChecklist.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'external-review-and-edit-evidence',
            status: 'blocked',
          }),
          expect.objectContaining({
            id: 'complete-proof-sample',
            status: 'blocked',
          }),
          expect.objectContaining({
            id: 'normal-expert-audit-clear',
            status: 'pass',
          }),
        ]),
      );
      expect(payload.auditFindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fixtureId: 'audit',
            featureId: 'externalProof',
            check: 'requiredExternalProof',
          }),
          expect.objectContaining({
            fixtureId: 'audit',
            featureId: 'externalProof',
            check: 'requiredExternalScorecard',
          }),
          expect.objectContaining({
            fixtureId: 'audit',
            featureId: 'externalProof',
            check: 'requiredFullPackageExternalReview',
          }),
          expect.objectContaining({
            fixtureId: 'audit',
            featureId: 'externalProof',
            check: 'requiredSourceFidelityReview',
          }),
          expect.objectContaining({
            fixtureId: 'audit',
            featureId: 'externalProof',
            check: 'requiredBlueprintQualityReview',
          }),
          expect.objectContaining({
            fixtureId: 'audit',
            featureId: 'externalProof',
            check: 'requiredAssumptionLedgerReview',
          }),
        ]),
      );
      expect(markdown).toContain('External proof required: yes');
      expect(markdown).toContain('Audit requirement blockers: 7');
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  }, 30000);

  it('blocks when a reviewer-required expectation is missing', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const fixture = {
        ...DEFAULT_REVIEW_FIXTURES[0],
        id: 'missing-reviewer-expectation',
        packageMustMatch: [/impossible expert phrase 177981/i],
      };

      const result = auditExpertReviewFixture({ fixture, runtime });

      expect(result.summary.status).toBe('blocked');
      expect(result.findings.some((finding) => finding.check === 'mustMatch')).toBe(true);
      expect(result.findings.some((finding) => finding.message.includes('impossible expert phrase'))).toBe(true);
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when expert-review output loses blueprint fidelity', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditExpertReviewFixture({
        fixture: DEFAULT_REVIEW_FIXTURES[0],
        runtime: {
          ...runtime,
          compileBlueprintDeliverables: (...args) => {
            const compiled = runtime.compileBlueprintDeliverables(...args);
            compiled.discussions.discussions[0].sourceGrounding.confidence = 'low';
            return compiled;
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintFidelityFindingCount).toBeGreaterThan(0);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'discussions',
            check: 'blueprintFidelityConfidence',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('loads external fixture files and writes latest reports', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coursemapper-expert-audit-'));
    const fixturePath = path.join(outputDir, 'fixtures.json');
    try {
      await fs.writeFile(
        fixturePath,
        JSON.stringify({
          fixtures: [
            {
              id: 'external-review-fixture',
              label: 'External fixture smoke test',
              sampleId: 'gold-research-methods-8',
              evidenceType: 'external',
              reviewerRole: 'external methods instructor',
              reviewEvidence: {
                reviewerType: 'external-expert',
                reviewedAt: '2026-05-27',
                reviewedPackageVersion: CURRENT_PACKAGE_VERSION,
                reviewedArtifacts: ['syllabus', 'lessonPlans', 'assignments'],
              },
              reviewScorecard: {
                maxScore: 5,
                dimensions: makePassingScorecardDimensions(),
              },
              packageMustMatch: ['/empirical evidence/i', '/method decision/i'],
            },
          ],
        }),
      );

      const fixtures = await loadReviewFixtures(fixturePath);
      const payload = await buildExpertReviewQualityAudit({ runtime, fixtures });
      const paths = await writeExpertReviewQualityAudit(payload, outputDir);
      const markdown = await fs.readFile(paths.markdownPath, 'utf8');

      expect(payload.summary.status).toBe('pass');
      expect(payload.summary.externalFixtureCount).toBe(1);
      expect(payload.summary.externalProofEligibleCount).toBe(1);
      expect(payload.summary.externalReviewProofCount).toBe(1);
      expect(payload.summary.reviewerScorecardFixtureCount).toBe(1);
      expect(payload.summary.externalReviewerScorecardCount).toBe(1);
      expect(payload.summary.externalEvidenceAnchoredScorecardCount).toBe(1);
      expect(payload.summary.externalFullPackageReviewCount).toBe(0);
      expect(payload.summary.externalSourceFidelityReviewCount).toBe(0);
      expect(payload.summary.externalSourceFidelityArtifactReviewCount).toBe(0);
      expect(payload.summary.externalAssumptionLedgerReviewCount).toBe(0);
      expect(payload.summary.externalAssumptionLedgerDecisionReviewCount).toBe(0);
      expect(payload.summary.minReviewerScore).toBe(9);
      expect(payload.summary.minExternalReviewerScore).toBe(9);
      expect(payload.summary.proofStatus).toBe('external-review-evidence-present');
      expect(payload.results[0].reviewerScorecard).toMatchObject({
        status: 'pass',
        dimensionCount: 6,
        minScore: 9,
        requiredCoverage: {
          required: 6,
          covered: 6,
          missing: [],
        },
      });
      expect(payload.results[0].reviewedArtifactCoverage).toMatchObject({
        coveredCount: 3,
        requiredCount: 9,
        coversFullPackage: false,
      });
      expect(markdown).toContain('External review fixtures: 1');
      expect(markdown).toContain('External full-package review scorecards: 0');
      expect(markdown).toContain('Proof Eligible');
      expect(markdown).toContain('Reviewer Scorecard Matrix');
      await expect(fs.stat(paths.jsonPath)).resolves.toMatchObject({ isFile: expect.any(Function) });
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('accepts proof-eligible external fixtures with their own course map project', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExpertReviewQualityAudit({
        runtime,
        fixtures: [
          {
            id: 'external-project-review-fixture',
            label: 'External project fixture smoke test',
            evidenceType: 'external',
            reviewerRole: 'external field-methods instructor',
            reviewEvidence: {
              reviewerType: 'external-expert',
              reviewedAt: '2026-05-27',
              reviewedPackageVersion: CURRENT_PACKAGE_VERSION,
              reviewedArtifacts: ['syllabus', 'lessonPlans', 'assignments'],
            },
            project: {
              id: 'external-field-methods-project',
              courseMap: makeExternalCourseMap(),
            },
            packageMustMatch: [/External Field Methods Studio/i, /interview evidence/i],
            featureExpectations: {
              lessonPlans: [/field guide/i],
              assignments: [/Field memo checkpoint/i],
            },
          },
        ],
      });

      expect(payload.summary.status).toBe('pass');
      expect(payload.summary.externalFixtureCount).toBe(1);
      expect(payload.summary.externalProofEligibleCount).toBe(1);
      expect(payload.summary.externalReviewProofCount).toBe(1);
      expect(payload.summary.proofStatus).toBe('external-review-evidence-present');
      expect(payload.results[0]).toMatchObject({
        sampleId: 'external-field-methods-project',
        courseName: 'External Field Methods Studio',
        projectSource: 'external-project',
        externalProofEligible: true,
      });
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks external scorecards below the reviewer quality floor', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditExpertReviewFixture({
        fixture: {
          id: 'external-low-scorecard-fixture',
          label: 'External low scorecard fixture',
          sampleId: 'gold-research-methods-8',
          evidenceType: 'external',
          reviewerRole: 'external methods instructor',
          reviewEvidence: {
            reviewerType: 'external-expert',
            reviewedAt: '2026-05-27',
            reviewedPackageVersion: CURRENT_PACKAGE_VERSION,
            reviewedArtifacts: ['syllabus', 'lessonPlans'],
          },
          reviewScorecard: {
            maxScore: 5,
            dimensions: makePassingScorecardDimensions().map((dimension) =>
              dimension.id === 'teachability'
                ? { ...dimension, score: 3, notes: 'Needs stronger classroom flow.' }
                : dimension,
            ),
          },
          packageMustMatch: [/empirical evidence/i],
        },
        runtime,
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.reviewerScorecard).toMatchObject({
        status: 'blocked',
        minScore: 6,
      });
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'reviewScorecard',
            check: 'reviewScorecardFloor',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks external scorecards that do not cover the required classroom-quality dimensions', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditExpertReviewFixture({
        fixture: {
          id: 'external-narrow-scorecard-fixture',
          label: 'External narrow scorecard fixture',
          sampleId: 'gold-research-methods-8',
          evidenceType: 'external',
          reviewerRole: 'external methods instructor',
          reviewEvidence: {
            reviewerType: 'external-expert',
            reviewedAt: '2026-05-27',
            reviewedPackageVersion: CURRENT_PACKAGE_VERSION,
            reviewedArtifacts: ['syllabus', 'lessonPlans'],
          },
          reviewScorecard: {
            maxScore: 5,
            dimensions: [
              {
                id: 'instructional-alignment',
                label: 'Instructional alignment',
                score: 5,
                notes: 'Alignment is strong.',
              },
            ],
          },
          packageMustMatch: [/empirical evidence/i],
        },
        runtime,
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.reviewerScorecard).toMatchObject({
        status: 'blocked',
        dimensionCount: 1,
        minScore: 10,
        requiredCoverage: {
          required: 6,
          covered: 1,
          missing: expect.arrayContaining(['Teachability', 'Assessment authenticity']),
        },
      });
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'reviewScorecard',
            check: 'reviewScorecardCoverage',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks external scorecards with placeholder reviewer notes', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditExpertReviewFixture({
        fixture: {
          id: 'external-placeholder-scorecard-fixture',
          label: 'External placeholder scorecard fixture',
          sampleId: 'gold-research-methods-8',
          evidenceType: 'external',
          reviewerRole: 'external methods instructor',
          reviewEvidence: {
            reviewerType: 'external-expert',
            reviewedAt: '2026-05-27',
            reviewedPackageVersion: CURRENT_PACKAGE_VERSION,
            reviewedArtifacts: ['full-package'],
          },
          reviewScorecard: {
            maxScore: 5,
            dimensions: makePassingScorecardDimensions().map((dimension) => ({
              ...dimension,
              notes: 'Replace with reviewer notes.',
            })),
          },
          packageMustMatch: [/empirical evidence/i],
        },
        runtime,
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.reviewerScorecard).toMatchObject({
        status: 'blocked',
        dimensionCount: 6,
        minScore: 9,
      });
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'reviewScorecard',
            check: 'reviewScorecardNotes',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks external scorecards without artifact evidence anchors', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditExpertReviewFixture({
        fixture: {
          id: 'external-unanchored-scorecard-fixture',
          label: 'External unanchored scorecard fixture',
          sampleId: 'gold-research-methods-8',
          evidenceType: 'external',
          reviewerRole: 'external methods instructor',
          reviewEvidence: {
            reviewerType: 'external-expert',
            reviewedAt: '2026-05-27',
            reviewedPackageVersion: CURRENT_PACKAGE_VERSION,
            reviewedArtifacts: ['full-package'],
          },
          reviewScorecard: {
            maxScore: 5,
            dimensions: makePassingScorecardDimensions().map((dimension) => {
              const copy = { ...dimension };
              delete copy.evidenceArtifacts;
              delete copy.evidenceExamples;
              return copy;
            }),
          },
          packageMustMatch: [/empirical evidence/i],
        },
        runtime,
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.reviewerScorecard).toMatchObject({
        status: 'blocked',
        dimensionCount: 6,
        evidenceAnchoredDimensionCount: 0,
      });
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'reviewScorecard',
            check: 'reviewScorecardEvidence',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks external fixtures with placeholder review metadata', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditExpertReviewFixture({
        fixture: {
          id: 'external-placeholder-metadata-fixture',
          label: 'External placeholder metadata fixture',
          sampleId: 'gold-research-methods-8',
          evidenceType: 'external',
          reviewerRole: 'external methods instructor',
          reviewEvidence: {
            reviewerType: 'external-expert',
            reviewedAt: 'YYYY-MM-DD',
            reviewedPackageVersion: 'Replace with package version',
            reviewedArtifacts: ['syllabus', 'lessonPlans'],
            evidenceSource: 'Replace with evidence source',
          },
          reviewScorecard: {
            maxScore: 5,
            dimensions: makePassingScorecardDimensions(),
          },
          packageMustMatch: [/empirical evidence/i],
        },
        runtime,
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.externalProofEligible).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'fixture',
            check: 'externalProofReviewedAtPlaceholder',
          }),
          expect.objectContaining({
            featureId: 'fixture',
            check: 'externalProofPackageVersionPlaceholder',
          }),
          expect.objectContaining({
            featureId: 'fixture',
            check: 'externalProofEvidenceSourcePlaceholder',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks external fixtures reviewed against a stale package version', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExpertReviewQualityAudit({
        runtime,
        fixtures: [
          makeExternalEditHistoryFixture({
            id: 'external-stale-package-version-fixture',
            reviewEvidence: {
              reviewedPackageVersion: '0.0.0',
              reviewedArtifacts: ['full-package'],
            },
            reviewScorecard: {
              maxScore: 5,
              dimensions: makePassingScorecardDimensions(),
            },
          }),
        ],
      });
      const result = payload.results[0];

      expect(payload.summary.status).toBe('blocked');
      expect(payload.summary.externalFixtureCount).toBe(1);
      expect(payload.summary.externalCurrentPackageVersionFixtureCount).toBe(0);
      expect(payload.summary.externalStalePackageVersionFixtureCount).toBe(1);
      expect(payload.summary.externalStalePackageVersionFixtureIds).toEqual(['external-stale-package-version-fixture']);
      expect(payload.proofReadinessChecklist.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'current-package-version-proof',
            status: 'blocked',
          }),
        ]),
      );
      expect(result).toMatchObject({
        fixtureId: 'external-stale-package-version-fixture',
        reviewedPackageVersion: '0.0.0',
        reviewedCurrentPackageVersion: false,
      });
      expect(result.externalProofEligible).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'fixture',
            check: 'externalProofPackageVersionMismatch',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('accepts external fixtures reviewed against the current package version with a v-prefix', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditExpertReviewFixture({
        fixture: makeExternalEditHistoryFixture({
          id: 'external-current-package-version-v-prefix-fixture',
          reviewEvidence: {
            reviewedPackageVersion: `v${CURRENT_PACKAGE_VERSION}`,
            reviewedArtifacts: ['full-package'],
          },
          reviewScorecard: {
            maxScore: 5,
            dimensions: makePassingScorecardDimensions(),
          },
        }),
        runtime,
      });

      expect(result.summary.status).toBe('pass');
      expect(result.externalProofEligible).toBe(true);
      expect(result.reviewedCurrentPackageVersion).toBe(true);
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks external project course maps that still contain template placeholders', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditExpertReviewFixture({
        fixture: {
          id: 'external-placeholder-project-fixture',
          label: 'External placeholder project fixture',
          evidenceType: 'external',
          reviewerRole: 'external course reviewer',
          reviewEvidence: {
            reviewerType: 'external-expert',
            reviewedAt: '2026-05-27',
            reviewedPackageVersion: CURRENT_PACKAGE_VERSION,
            reviewedArtifacts: ['full-package'],
          },
          project: {
            id: 'placeholder-reviewed-course',
            courseMap: {
              ...makeExternalCourseMap(),
              courseName: 'Replace With Real Reviewed Course Name',
            },
          },
          reviewScorecard: {
            maxScore: 5,
            dimensions: makePassingScorecardDimensions(),
          },
          packageMustMatch: [/interview evidence/i],
        },
        runtime,
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.externalProofEligible).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'fixture',
            check: 'projectCourseMapPlaceholder',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks external fixtures with placeholder positive reviewer expectations', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditExpertReviewFixture({
        fixture: {
          id: 'external-placeholder-expectation-fixture',
          label: 'External placeholder expectation fixture',
          sampleId: 'gold-research-methods-8',
          evidenceType: 'external',
          reviewerRole: 'external methods instructor',
          reviewEvidence: {
            reviewerType: 'external-expert',
            reviewedAt: '2026-05-27',
            reviewedPackageVersion: CURRENT_PACKAGE_VERSION,
            reviewedArtifacts: ['full-package'],
          },
          reviewScorecard: {
            maxScore: 5,
            dimensions: makePassingScorecardDimensions(),
          },
          packageMustMatch: [/replace with reviewer-required phrase/i],
        },
        runtime,
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.externalProofEligible).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'fixture',
            check: 'externalProofExpectationPlaceholder',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks external fixtures that lack proof metadata', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExpertReviewQualityAudit({
        runtime,
        fixtures: [
          {
            id: 'external-fixture-without-proof',
            label: 'External fixture without proof metadata',
            sampleId: 'gold-research-methods-8',
            evidenceType: 'external',
            packageMustMatch: [/empirical evidence/i],
          },
        ],
      });

      expect(payload.summary.status).toBe('blocked');
      expect(payload.summary.externalFixtureCount).toBe(1);
      expect(payload.summary.externalProofEligibleCount).toBe(0);
      expect(payload.summary.externalReviewProofCount).toBe(0);
      expect(payload.summary.proofStatus).toBe('internal-provisional-only');
      expect(payload.results[0].externalProofEligible).toBe(false);
      expect(payload.results[0].findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'fixture',
            check: 'externalProofReviewerRole',
          }),
          expect.objectContaining({
            featureId: 'fixture',
            check: 'externalProofArtifacts',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks fixtures without a sample id or external course map', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditExpertReviewFixture({
        fixture: {
          id: 'missing-sample-source',
          evidenceType: 'external',
          reviewerRole: 'external reviewer',
          reviewEvidence: {
            reviewerType: 'external-expert',
            reviewedAt: '2026-05-27',
            reviewedPackageVersion: CURRENT_PACKAGE_VERSION,
            reviewedArtifacts: ['syllabus'],
          },
          packageMustMatch: [/evidence/i],
        },
        runtime,
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.externalProofEligible).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'fixture',
            check: 'sampleSource',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks unchanged template fixtures from counting as external proof', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExpertReviewQualityAudit({
        runtime,
        fixtures: [
          {
            id: 'external-template-fixture',
            templateOnly: true,
            label: 'Template fixture',
            sampleId: 'gold-research-methods-8',
            evidenceType: 'external',
            reviewerRole: 'external methods instructor',
            reviewEvidence: {
              reviewerType: 'external-expert',
              reviewedAt: '2026-05-27',
              reviewedPackageVersion: CURRENT_PACKAGE_VERSION,
              reviewedArtifacts: ['syllabus'],
            },
            packageMustMatch: [/empirical evidence/i],
          },
        ],
      });

      expect(payload.summary.status).toBe('blocked');
      expect(payload.summary.externalProofEligibleCount).toBe(0);
      expect(payload.results[0].findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'fixture',
            check: 'templateOnly',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks template-only fixture bundles before they can count as strict proof', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coursemapper-template-bundle-'));
    const fixturePath = path.join(outputDir, 'recommended-bundle.json');
    try {
      await fs.writeFile(
        fixturePath,
        `${JSON.stringify(
          {
            templateOnly: true,
            purpose:
              'Recommended strict A-quality proof bundle. Fill reviewer evidence, then remove templateOnly before preflight.',
            fixtures: [
              makeExternalEditHistoryFixture({
                id: 'external-filled-fixture-in-template-bundle',
              }),
            ],
          },
          null,
          2,
        )}\n`,
      );

      const payload = await buildExpertReviewQualityAudit({ runtime, fixturePath });

      expect(payload.summary.status).toBe('blocked');
      expect(payload.summary.auditBlockers).toBeGreaterThanOrEqual(1);
      expect(payload.auditFindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fixtureId: 'recommended-bundle.json',
            featureId: 'fixtureBundle',
            check: 'bundleTemplateOnly',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('treats external instructor edit history as proof and verifies preference application', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExpertReviewQualityAudit({
        runtime,
        fixtures: [makeExternalEditHistoryFixture()],
      });
      const markdown = renderExpertReviewQualityAuditMarkdown(payload);

      expect(payload.summary.status).toBe('pass');
      expect(payload.summary.externalFixtureCount).toBe(1);
      expect(payload.summary.externalProofEligibleCount).toBe(1);
      expect(payload.summary.externalReviewProofCount).toBe(1);
      expect(payload.summary.editHistoryFixtureCount).toBe(1);
      expect(payload.summary.externalEditHistoryFixtureCount).toBe(1);
      expect(payload.summary.externalEditHistoryEvidencePatternCount).toBe(3);
      expect(payload.summary.externalAssumptionLedgerReviewCount).toBe(1);
      expect(payload.summary.externalAssumptionLedgerDecisionReviewCount).toBe(1);
      expect(payload.summary.proofStatus).toBe('external-review-and-edit-evidence-present');
      expect(payload.results[0].editHistoryPatternCount).toBe(3);
      expect(payload.results[0].editHistoryAppliedFeatureCount).toBe(3);
      expect(payload.results[0].editHistoryConcreteEvidencePatternCount).toBe(3);
      expect(payload.results[0].editHistoryWeakEvidencePatternCount).toBe(0);
      expect(payload.results[0].preferenceProfile).toMatchObject({
        source: 'external-instructor-edit-history',
        signalCount: 3,
        summary: expect.stringContaining('criterion-specific feedback'),
      });
      expect(markdown).toContain('Edit-history fixtures: 1');
      expect(markdown).toContain('Edit Patterns');
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks external instructor edit history without concrete edit evidence', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExpertReviewQualityAudit({
        runtime,
        fixtures: [
          makeExternalEditHistoryFixture({
            id: 'external-thin-edit-history-fixture',
            instructorEditPatterns: [
              { featureId: 'rubrics', field: 'criteria', action: 'accepted' },
              {
                featureId: 'quizBank',
                field: 'question',
                action: 'accepted',
                notes: 'Replace with a real repeated edit pattern.',
              },
            ],
          }),
        ],
      });

      expect(payload.summary.status).toBe('blocked');
      expect(payload.summary.externalEditHistoryFixtureCount).toBe(0);
      expect(payload.summary.externalEditHistoryEvidencePatternCount).toBe(0);
      expect(payload.results[0].externalEditProofEligible).toBe(false);
      expect(payload.results[0].editHistoryWeakEvidencePatternCount).toBe(2);
      expect(payload.results[0].findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'editHistory',
            check: 'externalEditPatternEvidence',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('passes required external proof mode when complete proof covers required scopes and two teaching modalities', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExpertReviewQualityAudit({
        runtime,
        requireExternalProof: true,
        fixtures: [
          makeExternalEditHistoryFixture({
            id: 'external-a-quality-proof-research-methods',
            reviewEvidence: {
              reviewedArtifacts: ['full-package'],
            },
            reviewScorecard: {
              maxScore: 5,
              dimensions: makePassingScorecardDimensions(),
            },
          }),
          makeExternalEditHistoryFixture({
            id: 'external-a-quality-proof-field-methods-project',
            sampleId: 'external-field-methods-project',
            project: {
              id: 'external-field-methods-project',
              label: 'External field methods course map',
              courseMap: makeExternalCourseMap(5),
            },
            packageMustMatch: [/field evidence/i, /interview/i],
            reviewEvidence: {
              reviewedArtifacts: ['full-package'],
              courseModality: 'field-applied',
            },
            blueprintQualityReview: makePassingBlueprintQualityReview(5),
            reviewScorecard: {
              maxScore: 5,
              dimensions: makePassingScorecardDimensions(),
            },
          }),
          makeExternalEditHistoryFixture({
            id: 'external-a-quality-proof-research-methods-semester',
            sampleId: 'gold-research-methods-semester-14',
            reviewEvidence: {
              reviewedArtifacts: ['full-package'],
            },
            blueprintQualityReview: makePassingBlueprintQualityReview(14),
            reviewScorecard: {
              maxScore: 5,
              dimensions: makePassingScorecardDimensions(),
            },
          }),
        ],
      });

      expect(payload.summary.status).toBe('pass');
      expect(payload.summary.auditBlockers).toBe(0);
      expect(payload.summary.currentPackageVersion).toBe(CURRENT_PACKAGE_VERSION);
      expect(payload.summary.externalFixtureCount).toBe(3);
      expect(payload.summary.externalCurrentPackageVersionFixtureCount).toBe(3);
      expect(payload.summary.externalStalePackageVersionFixtureCount).toBe(0);
      expect(payload.summary.externalStalePackageVersionFixtureIds).toEqual([]);
      expect(payload.summary.externalReviewerScorecardCount).toBe(3);
      expect(payload.summary.externalEvidenceAnchoredScorecardCount).toBe(3);
      expect(payload.summary.externalFullPackageReviewCount).toBe(3);
      expect(payload.summary.externalSourceFidelityReviewCount).toBe(3);
      expect(payload.summary.externalSourceFidelityArtifactReviewCount).toBe(3);
      expect(payload.summary.externalBlueprintQualityReviewCount).toBe(3);
      expect(payload.summary.externalBlueprintLessonReviewCount).toBe(3);
      expect(payload.summary.externalEditHistoryEvidencePatternCount).toBe(9);
      expect(payload.summary.externalAssumptionLedgerReviewCount).toBe(3);
      expect(payload.summary.externalAssumptionLedgerDecisionReviewCount).toBe(3);
      expect(payload.summary.externalCompleteProofSampleCount).toBe(3);
      expect(payload.summary.externalCompleteProofSampleIds).toEqual([
        'external-field-methods-project',
        'gold-research-methods-8',
        'gold-research-methods-semester-14',
      ]);
      expect(payload.summary.externalCompleteProofModalityCount).toBeGreaterThanOrEqual(2);
      expect(payload.summary.externalCompleteProofModalities).toEqual(
        expect.arrayContaining(['applied-lab', 'field-applied']),
      );
      expect(payload.summary.requiredExternalCompleteProofScopes).toEqual([5, 8, 14]);
      expect(payload.summary.externalCompleteProofScopeCount).toBe(3);
      expect(payload.summary.externalCompleteProofScopes).toEqual([5, 8, 14]);
      expect(payload.summary.missingExternalCompleteProofScopes).toEqual([]);
      expect(payload.summary.externalProjectCompleteProofSampleCount).toBe(1);
      expect(payload.summary.externalProjectCompleteProofSampleIds).toEqual(['external-field-methods-project']);
      expect(payload.summary.externalProjectCompleteProofRequiredScopeCount).toBe(1);
      expect(payload.summary.externalProjectCompleteProofRequiredScopes).toEqual([5]);
      expect(payload.summary.minReviewerScore).toBe(9);
      expect(payload.summary.minExternalReviewerScore).toBe(9);
      expect(payload.summary.proofStatus).toBe('external-review-and-edit-evidence-present');
      expect(payload.externalProofBundles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sampleId: 'gold-research-methods-8',
            complete: true,
            missingEvidence: [],
            scorecard: true,
            sourceFidelity: true,
            blueprintQuality: true,
            assumptionLedger: true,
            editHistory: true,
            proofScope: 8,
          }),
          expect.objectContaining({
            sampleId: 'external-field-methods-project',
            complete: true,
            missingEvidence: [],
            projectSource: 'external-project',
            scorecard: true,
            sourceFidelity: true,
            blueprintQuality: true,
            assumptionLedger: true,
            editHistory: true,
            proofScope: 5,
          }),
          expect.objectContaining({
            sampleId: 'gold-research-methods-semester-14',
            complete: true,
            missingEvidence: [],
            scorecard: true,
            sourceFidelity: true,
            blueprintQuality: true,
            assumptionLedger: true,
            editHistory: true,
            proofScope: 14,
          }),
        ]),
      );
      expect(payload.proofReadinessChecklist).toMatchObject({
        status: 'pass',
        passCount: 12,
        itemCount: 12,
      });
      expect(payload.proofReadinessChecklist.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'current-package-version-proof',
            status: 'pass',
          }),
        ]),
      );
      expect(payload.results[0].sourceFidelityReview).toMatchObject({
        status: 'pass',
        sourceInputReviewed: true,
        compiledPackageReviewed: true,
        artifactReviewCount: 9,
        missingArtifacts: [],
      });
      expect(payload.results[0].blueprintQualityReview).toMatchObject({
        status: 'pass',
        blueprintReviewed: true,
        sourceInputReviewed: true,
        lessonReviewCount: 8,
        missingLessonNumbers: [],
      });
      expect(payload.results[0].assumptionLedgerReview).toMatchObject({
        status: 'pass',
        assumptionLedgerReviewed: true,
        reviewRequiredRowsReviewed: true,
        reviewedRowDecisionCount: 2,
      });
      expect(payload.auditFindings).toEqual([]);
      expect(payload.results[0].reviewerScorecard).toMatchObject({
        status: 'pass',
        evidenceAnchoredDimensionCount: 6,
        requiredCoverage: {
          required: 6,
          covered: 6,
          missing: [],
        },
      });
      expect(payload.results[0].reviewedArtifactCoverage).toMatchObject({
        coveredCount: 9,
        requiredCount: 9,
        coversFullPackage: true,
      });
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  }, 15000);

  it('blocks required external proof mode when the real course-map proof is outside required course lengths', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExpertReviewQualityAudit({
        runtime,
        requireExternalProof: true,
        fixtures: [
          makeExternalEditHistoryFixture({
            id: 'external-required-scope-proof-research-methods-short',
            sampleId: 'gold-research-methods-short-5',
            blueprintQualityReview: makePassingBlueprintQualityReview(5),
            reviewEvidence: {
              reviewedArtifacts: ['full-package'],
            },
            reviewScorecard: {
              maxScore: 5,
              dimensions: makePassingScorecardDimensions(),
            },
          }),
          makeExternalEditHistoryFixture({
            id: 'external-required-scope-proof-research-methods-standard',
            reviewEvidence: {
              reviewedArtifacts: ['full-package'],
            },
            reviewScorecard: {
              maxScore: 5,
              dimensions: makePassingScorecardDimensions(),
            },
          }),
          makeExternalEditHistoryFixture({
            id: 'external-required-scope-proof-research-methods-semester',
            sampleId: 'gold-research-methods-semester-14',
            blueprintQualityReview: makePassingBlueprintQualityReview(14),
            reviewEvidence: {
              reviewedArtifacts: ['full-package'],
            },
            reviewScorecard: {
              maxScore: 5,
              dimensions: makePassingScorecardDimensions(),
            },
          }),
          makeExternalEditHistoryFixture({
            id: 'external-off-scope-field-methods-project',
            sampleId: 'external-field-methods-project',
            project: {
              id: 'external-field-methods-project',
              label: 'External field methods course map',
              courseMap: makeExternalCourseMap(3),
            },
            packageMustMatch: [/field evidence/i, /interview/i],
            reviewEvidence: {
              reviewedArtifacts: ['full-package'],
              courseModality: 'field-applied',
            },
            blueprintQualityReview: makePassingBlueprintQualityReview(3),
            reviewScorecard: {
              maxScore: 5,
              dimensions: makePassingScorecardDimensions(),
            },
          }),
        ],
      });

      expect(payload.summary.status).toBe('blocked');
      expect(payload.summary.externalCompleteProofSampleCount).toBe(4);
      expect(payload.summary.externalCompleteProofModalityCount).toBeGreaterThanOrEqual(2);
      expect(payload.summary.externalCompleteProofScopes).toEqual([3, 5, 8, 14]);
      expect(payload.summary.missingExternalCompleteProofScopes).toEqual([]);
      expect(payload.summary.externalProjectCompleteProofSampleCount).toBe(1);
      expect(payload.summary.externalProjectCompleteProofSampleIds).toEqual(['external-field-methods-project']);
      expect(payload.summary.externalProjectCompleteProofRequiredScopeCount).toBe(0);
      expect(payload.summary.externalProjectCompleteProofRequiredScopes).toEqual([]);
      expect(payload.summary.auditBlockers).toBe(1);
      expect(payload.auditFindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'externalProof',
            check: 'requiredExternalProjectProofScope',
          }),
        ]),
      );
      expect(payload.proofReadinessChecklist.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'external-project-proof-sample',
            status: 'blocked',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  }, 15000);

  it('blocks required external proof mode when complete proof misses required course lengths', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExpertReviewQualityAudit({
        runtime,
        requireExternalProof: true,
        fixtures: [
          makeExternalEditHistoryFixture({
            id: 'external-scope-proof-research-methods',
            reviewEvidence: {
              reviewedArtifacts: ['full-package'],
            },
            reviewScorecard: {
              maxScore: 5,
              dimensions: makePassingScorecardDimensions(),
            },
          }),
          makeExternalEditHistoryFixture({
            id: 'external-scope-proof-field-methods-project',
            sampleId: 'external-field-methods-project',
            project: {
              id: 'external-field-methods-project',
              label: 'External field methods course map',
              courseMap: makeExternalCourseMap(5),
            },
            packageMustMatch: [/field evidence/i, /interview/i],
            reviewEvidence: {
              reviewedArtifacts: ['full-package'],
              courseModality: 'field-applied',
            },
            reviewScorecard: {
              maxScore: 5,
              dimensions: makePassingScorecardDimensions(),
            },
          }),
        ],
      });

      expect(payload.summary.status).toBe('blocked');
      expect(payload.summary.externalCompleteProofSampleCount).toBe(2);
      expect(payload.summary.externalCompleteProofModalityCount).toBeGreaterThanOrEqual(2);
      expect(payload.summary.externalProjectCompleteProofSampleCount).toBe(1);
      expect(payload.summary.externalCompleteProofScopes).toEqual([5, 8]);
      expect(payload.summary.missingExternalCompleteProofScopes).toEqual([14]);
      expect(payload.summary.auditBlockers).toBe(1);
      expect(payload.auditFindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'externalProof',
            check: 'requiredExternalProofScopeCoverage',
          }),
        ]),
      );
      expect(payload.proofReadinessChecklist.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'external-proof-scope-coverage',
            status: 'blocked',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks required external proof mode when complete proof only covers one sample', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExpertReviewQualityAudit({
        runtime,
        requireExternalProof: true,
        fixtures: [
          makeExternalEditHistoryFixture({
            id: 'external-one-sample-proof-fixture',
            reviewEvidence: {
              reviewedArtifacts: ['full-package'],
            },
            reviewScorecard: {
              maxScore: 5,
              dimensions: makePassingScorecardDimensions(),
            },
          }),
        ],
      });

      expect(payload.summary.status).toBe('blocked');
      expect(payload.summary.externalCompleteProofSampleCount).toBe(1);
      expect(payload.summary.auditBlockers).toBe(1);
      expect(payload.auditFindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'externalProof',
            check: 'requiredDiverseExternalProofSamples',
          }),
        ]),
      );
      expect(payload.proofReadinessChecklist.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'complete-proof-sample',
            status: 'blocked',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks required external proof mode when complete proof uses only curated samples', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExpertReviewQualityAudit({
        runtime,
        requireExternalProof: true,
        fixtures: [
          makeExternalEditHistoryFixture({
            id: 'external-curated-proof-research-methods',
            reviewEvidence: {
              reviewedArtifacts: ['full-package'],
            },
            reviewScorecard: {
              maxScore: 5,
              dimensions: makePassingScorecardDimensions(),
            },
          }),
          makeExternalEditHistoryFixture({
            id: 'external-curated-proof-interaction-design',
            sampleId: 'gold-interaction-design-studio-8',
            packageMustMatch: [/prototype/i, /design/i],
            reviewEvidence: {
              reviewedArtifacts: ['full-package'],
            },
            reviewScorecard: {
              maxScore: 5,
              dimensions: makePassingScorecardDimensions(),
            },
          }),
        ],
      });
      expect(payload.summary.status).toBe('blocked');
      expect(payload.summary.externalCompleteProofSampleCount).toBe(2);
      expect(payload.summary.externalCompleteProofModalityCount).toBeGreaterThanOrEqual(2);
      expect(payload.summary.externalProjectCompleteProofSampleCount).toBe(0);
      expect(payload.summary.auditBlockers).toBe(1);
      expect(payload.auditFindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'externalProof',
            check: 'requiredExternalProjectProofSample',
          }),
        ]),
      );
      expect(payload.proofReadinessChecklist.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'external-project-proof-sample',
            status: 'blocked',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks required external proof mode when complete proof is stitched across different samples', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExpertReviewQualityAudit({
        runtime,
        requireExternalProof: true,
        fixtures: [
          makeExternalEditHistoryFixture({
            id: 'external-review-proof-only-ai-course-design',
            sampleId: 'gold-ai-course-design-8',
            editHistoryEvidenceType: undefined,
            instructorEditPatterns: [],
            preferenceExpectations: {},
            packageMustMatch: [],
            reviewEvidence: {
              reviewedArtifacts: ['full-package'],
            },
            reviewScorecard: {
              maxScore: 5,
              dimensions: makePassingScorecardDimensions(),
            },
          }),
          makeExternalEditHistoryFixture({
            id: 'external-edit-proof-only-research-methods',
            sampleId: 'gold-research-methods-8',
          }),
        ],
      });
      const markdown = renderExpertReviewQualityAuditMarkdown(payload);

      expect(payload.summary.status).toBe('blocked');
      expect(payload.summary.proofStatus).toBe('external-review-and-edit-evidence-present');
      expect(payload.summary.externalReviewerScorecardCount).toBe(1);
      expect(payload.summary.externalEvidenceAnchoredScorecardCount).toBe(1);
      expect(payload.summary.externalFullPackageReviewCount).toBe(1);
      expect(payload.summary.externalSourceFidelityArtifactReviewCount).toBe(2);
      expect(payload.summary.externalAssumptionLedgerDecisionReviewCount).toBe(2);
      expect(payload.summary.externalEditHistoryFixtureCount).toBe(1);
      expect(payload.summary.externalCompleteProofSampleCount).toBe(0);
      expect(payload.summary.auditBlockers).toBe(1);
      expect(payload.externalProofBundles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sampleId: 'gold-ai-course-design-8',
            complete: false,
            missingEvidence: ['edit-history'],
            scorecard: true,
            sourceFidelity: true,
            blueprintQuality: true,
            assumptionLedger: true,
            editHistory: false,
          }),
          expect.objectContaining({
            sampleId: 'gold-research-methods-8',
            complete: false,
            missingEvidence: ['scorecard'],
            scorecard: false,
            sourceFidelity: true,
            blueprintQuality: true,
            assumptionLedger: true,
            editHistory: true,
          }),
        ]),
      );
      expect(payload.proofReadinessChecklist.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'complete-proof-sample',
            status: 'blocked',
          }),
          expect.objectContaining({
            id: 'external-review-and-edit-evidence',
            status: 'pass',
          }),
        ]),
      );
      expect(markdown).toContain('| gold-ai-course-design-8 | no | edit-history |');
      expect(markdown).toContain('| gold-research-methods-8 | no | scorecard |');
      expect(payload.auditFindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'externalProof',
            check: 'requiredCompleteExternalProofSample',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks required external proof mode when source-fidelity evidence is missing', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExpertReviewQualityAudit({
        runtime,
        requireExternalProof: true,
        fixtures: [
          makeExternalEditHistoryFixture({
            id: 'external-missing-source-fidelity-proof-fixture',
            reviewEvidence: {
              reviewedArtifacts: ['full-package'],
            },
            reviewScorecard: {
              maxScore: 5,
              dimensions: makePassingScorecardDimensions(),
            },
            sourceFidelityReview: null,
          }),
        ],
      });

      expect(payload.summary.status).toBe('blocked');
      expect(payload.summary.externalReviewerScorecardCount).toBe(1);
      expect(payload.summary.externalEvidenceAnchoredScorecardCount).toBe(1);
      expect(payload.summary.externalFullPackageReviewCount).toBe(1);
      expect(payload.summary.externalSourceFidelityReviewCount).toBe(0);
      expect(payload.summary.externalSourceFidelityArtifactReviewCount).toBe(0);
      expect(payload.summary.externalCompleteProofSampleCount).toBe(0);
      expect(payload.summary.auditBlockers).toBe(1);
      expect(payload.auditFindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'externalProof',
            check: 'requiredSourceFidelityReview',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks malformed external source-fidelity artifact reviews', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditExpertReviewFixture({
        fixture: makeExternalEditHistoryFixture({
          id: 'external-malformed-source-fidelity-review-fixture',
          reviewEvidence: {
            reviewedArtifacts: ['full-package'],
          },
          reviewScorecard: {
            maxScore: 5,
            dimensions: makePassingScorecardDimensions(),
          },
          sourceFidelityReview: {
            sourceInputReviewed: true,
            compiledPackageReviewed: true,
            lessonOrderPreserved: true,
            assessmentsPreserved: true,
            unsupportedInventionRisk: 'low',
            artifactReviews: [
              {
                featureId: 'syllabus',
                sourceCompared: true,
                packageCompared: false,
                sourceSignalsPreserved: false,
                compilerDecisionVisible: false,
                publishGateVisible: false,
                modelUsePolicyVisible: false,
                handoffReviewFocusVisible: false,
                localReviewActionVisible: false,
                unsupportedInventionRisk: 'low',
                notes: 'Replace with reviewer notes.',
              },
            ],
            notes:
              'Reviewer compared the source course map with the package but did not finish artifact-level source checks.',
          },
        }),
        runtime,
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.sourceFidelityReview).toMatchObject({
        status: 'blocked',
        artifactReviewCount: 1,
      });
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'sourceFidelityReview',
            check: 'sourceFidelityArtifactCoverage',
          }),
          expect.objectContaining({
            featureId: 'sourceFidelityReview',
            check: 'sourceFidelityArtifactNotes',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks source-fidelity rows that do not confirm compiler trust and local-review traces', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const sourceFidelityReview = makePassingSourceFidelityReview();
      sourceFidelityReview.artifactReviews = sourceFidelityReview.artifactReviews.map((row, index) =>
        index === 0
          ? {
              ...row,
              compilerDecisionVisible: false,
              publishGateVisible: false,
              modelUsePolicyVisible: false,
              handoffReviewFocusVisible: false,
              localReviewActionVisible: false,
              notes:
                'Reviewer compared the source course map and package artifact, but the row does not confirm compiler trust traces or local-review action.',
            }
          : row,
      );

      const result = auditExpertReviewFixture({
        fixture: makeExternalEditHistoryFixture({
          id: 'external-missing-compiler-trust-traces-fixture',
          reviewEvidence: {
            reviewedArtifacts: ['full-package'],
          },
          reviewScorecard: {
            maxScore: 5,
            dimensions: makePassingScorecardDimensions(),
          },
          sourceFidelityReview,
        }),
        runtime,
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.sourceFidelityReview).toMatchObject({
        status: 'blocked',
        artifactReviewCount: CORE_ARTIFACT_IDS.length,
      });
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'sourceFidelityReview',
            check: 'sourceFidelityArtifactNotes',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks required external proof mode when blueprint-quality evidence is missing', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExpertReviewQualityAudit({
        runtime,
        requireExternalProof: true,
        fixtures: [
          makeExternalEditHistoryFixture({
            id: 'external-missing-blueprint-quality-proof-fixture',
            reviewEvidence: {
              reviewedArtifacts: ['full-package'],
            },
            reviewScorecard: {
              maxScore: 5,
              dimensions: makePassingScorecardDimensions(),
            },
            blueprintQualityReview: null,
          }),
        ],
      });

      expect(payload.summary.status).toBe('blocked');
      expect(payload.summary.externalReviewerScorecardCount).toBe(1);
      expect(payload.summary.externalEvidenceAnchoredScorecardCount).toBe(1);
      expect(payload.summary.externalFullPackageReviewCount).toBe(1);
      expect(payload.summary.externalSourceFidelityReviewCount).toBe(1);
      expect(payload.summary.externalSourceFidelityArtifactReviewCount).toBe(1);
      expect(payload.summary.externalBlueprintQualityReviewCount).toBe(0);
      expect(payload.summary.externalBlueprintLessonReviewCount).toBe(0);
      expect(payload.summary.externalCompleteProofSampleCount).toBe(0);
      expect(payload.summary.auditBlockers).toBe(1);
      expect(payload.auditFindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'externalProof',
            check: 'requiredBlueprintQualityReview',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks malformed external blueprint-quality reviews', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditExpertReviewFixture({
        fixture: makeExternalEditHistoryFixture({
          id: 'external-malformed-blueprint-quality-review-fixture',
          reviewEvidence: {
            reviewedArtifacts: ['full-package'],
          },
          reviewScorecard: {
            maxScore: 5,
            dimensions: makePassingScorecardDimensions(),
          },
          blueprintQualityReview: {
            blueprintReviewed: true,
            sourceInputReviewed: true,
            compactRepresentationReviewed: true,
            sourceSignalsPreserved: false,
            assessmentsPreserved: true,
            alignmentUsable: true,
            unresolvedBlueprintRisk: 'low',
            lessonReviews: [
              {
                lessonNumber: 1,
                sourceCompared: true,
                blueprintCompared: false,
                sourceSignalsPreserved: false,
                assessmentPreserved: true,
                alignmentUsable: true,
                reviewRequiredFlagsVisible: true,
                notes: 'Replace with reviewer notes.',
              },
            ],
            notes:
              'Reviewer compared the source course map with the compact blueprint but did not finish lesson-level source checks.',
          },
        }),
        runtime,
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintQualityReview).toMatchObject({
        status: 'blocked',
        blueprintReviewed: true,
        sourceInputReviewed: true,
        lessonReviewCount: 1,
      });
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprintQualityReview',
            check: 'blueprintLessonCoverage',
          }),
          expect.objectContaining({
            featureId: 'blueprintQualityReview',
            check: 'blueprintLessonReviewNotes',
          }),
          expect.objectContaining({
            featureId: 'blueprintQualityReview',
            check: 'sourceSignalsPreserved',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks required external proof mode when assumption-ledger evidence is missing', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExpertReviewQualityAudit({
        runtime,
        requireExternalProof: true,
        fixtures: [
          makeExternalEditHistoryFixture({
            id: 'external-missing-assumption-ledger-proof-fixture',
            reviewEvidence: {
              reviewedArtifacts: ['full-package'],
            },
            reviewScorecard: {
              maxScore: 5,
              dimensions: makePassingScorecardDimensions(),
            },
            assumptionLedgerReview: null,
          }),
        ],
      });

      expect(payload.summary.status).toBe('blocked');
      expect(payload.summary.externalReviewerScorecardCount).toBe(1);
      expect(payload.summary.externalEvidenceAnchoredScorecardCount).toBe(1);
      expect(payload.summary.externalFullPackageReviewCount).toBe(1);
      expect(payload.summary.externalSourceFidelityReviewCount).toBe(1);
      expect(payload.summary.externalSourceFidelityArtifactReviewCount).toBe(1);
      expect(payload.summary.externalAssumptionLedgerReviewCount).toBe(0);
      expect(payload.summary.externalAssumptionLedgerDecisionReviewCount).toBe(0);
      expect(payload.summary.externalCompleteProofSampleCount).toBe(0);
      expect(payload.summary.auditBlockers).toBe(1);
      expect(payload.auditFindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'externalProof',
            check: 'requiredAssumptionLedgerReview',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks malformed external assumption-ledger reviews', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditExpertReviewFixture({
        fixture: makeExternalEditHistoryFixture({
          id: 'external-malformed-assumption-ledger-review-fixture',
          reviewEvidence: {
            reviewedArtifacts: ['full-package'],
          },
          reviewScorecard: {
            maxScore: 5,
            dimensions: makePassingScorecardDimensions(),
          },
          assumptionLedgerReview: {
            assumptionLedgerReviewed: true,
            categoriesReviewed: ['learner-context'],
            reviewRequiredRowsReviewed: false,
            reviewedRows: [],
            unresolvedAssumptionRisk: 'high',
            notes: 'Replace with reviewer notes.',
          },
        }),
        runtime,
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.assumptionLedgerReview).toMatchObject({
        status: 'blocked',
        assumptionLedgerReviewed: true,
      });
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'assumptionLedgerReview',
            check: 'assumptionLedgerCategories',
          }),
          expect.objectContaining({
            featureId: 'assumptionLedgerReview',
            check: 'reviewRequiredRowsReviewed',
          }),
          expect.objectContaining({
            featureId: 'assumptionLedgerReview',
            check: 'assumptionLedgerDecisions',
          }),
          expect.objectContaining({
            featureId: 'assumptionLedgerReview',
            check: 'assumptionLedgerNotes',
          }),
          expect.objectContaining({
            featureId: 'assumptionLedgerReview',
            check: 'unresolvedAssumptionRisk',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks required external proof mode when the reviewer scorecard only covered part of the package', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExpertReviewQualityAudit({
        runtime,
        requireExternalProof: true,
        fixtures: [
          makeExternalEditHistoryFixture({
            id: 'external-partial-review-proof-fixture',
            reviewScorecard: {
              maxScore: 5,
              dimensions: makePassingScorecardDimensions(),
            },
          }),
        ],
      });

      expect(payload.summary.status).toBe('blocked');
      expect(payload.summary.externalReviewerScorecardCount).toBe(1);
      expect(payload.summary.externalEvidenceAnchoredScorecardCount).toBe(1);
      expect(payload.summary.externalFullPackageReviewCount).toBe(0);
      expect(payload.summary.externalCompleteProofSampleCount).toBe(0);
      expect(payload.summary.auditBlockers).toBe(1);
      expect(payload.auditFindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'externalProof',
            check: 'requiredFullPackageExternalReview',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });
});
