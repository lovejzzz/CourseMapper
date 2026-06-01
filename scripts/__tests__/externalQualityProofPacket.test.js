import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_GOLD_SAMPLES } from '../goldSampleQualityAudit.mjs';
import {
  buildExternalQualityProofPacket,
  closeHybridPipelineAuditRuntime,
  loadHybridPipelineAuditRuntime,
  renderExternalQualityProofPacketMarkdown,
  writeExternalQualityProofPacket,
} from '../externalQualityProofPacket.mjs';

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

const REQUIRED_SCORECARD_DIMENSION_IDS = [
  'instructional-alignment',
  'teachability',
  'assessment-authenticity',
  'feedback-and-revision',
  'cognitive-progression',
  'accessibility-and-trust',
];

const REQUIRED_ASSUMPTION_CATEGORIES = ['learner-context', 'course-modality', 'assessment-weight', 'handoff-boundary'];

describe('external quality proof packet', () => {
  const makeExternalProjectFixture = () => ({
    id: 'external-field-methods-proof',
    sampleId: 'external-field-methods-project',
    evidenceType: 'external',
    reviewerRole: 'external field-methods instructor',
    reviewEvidence: {
      reviewerType: 'external-expert',
      reviewedAt: '2026-05-29',
      reviewedPackageVersion: '0.8.0-test',
      reviewedArtifacts: ['full-package'],
      evidenceSource: 'external project review',
      courseModality: 'field-applied',
      proofScopeTags: ['external-project', 'modality:field-applied'],
    },
    project: {
      id: 'external-field-methods-project',
      label: 'External Field Methods Studio',
      courseMap: {
        courseName: 'External Field Methods Studio',
        semester: 'Fall 2026',
        lessons: Array.from({ length: 3 }, (_, index) => ({
          title: `Lesson ${index + 1}: Field Method ${index + 1}`,
          sections: [
            {
              topicSection: `Interview protocol ${index + 1}; observation memo ${index + 1}`,
              learningObjectives: `Analyze interview evidence ${index + 1}; evaluate observation reliability ${index + 1}`,
              learningGoals: `Connect field evidence to research decisions ${index + 1}`,
              weeklyAssessments: `Field memo checkpoint ${index + 1}`,
              asyncActivities: `Read field guide ${index + 1}; annotate interview evidence`,
              syncActivities: `Practice interview protocol ${index + 1}; peer debrief`,
              supportingResources: `Field guide ${index + 1}; observation template ${index + 1}`,
              evaluateDesign: `Score field memo evidence and observation reliability ${index + 1}`,
            },
          ],
        })),
      },
    },
  });

  it('builds a full-package external reviewer packet from gold samples', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const payload = await buildExternalQualityProofPacket({
        runtime,
        samples: DEFAULT_GOLD_SAMPLES,
        packageVersion: '0.8.0-test',
      });
      const markdown = renderExternalQualityProofPacketMarkdown(payload);

      expect(payload.summary.sampleCount).toBe(40);
      expect(payload.summary.reviewedArtifactCount).toBe(9);
      expect(payload.summary.scorecardDimensionCount).toBe(6);
      expect(payload.proofCollectionPlan).toMatchObject({
        requiredCompleteProofSamples: 2,
        requiredDistinctModalities: 2,
        requiredExternalProjectSamples: 1,
        requiredCompleteProofScopes: [5, 8, 14],
        recommendedScopeCoverage: [5, 8, 14],
        availableSamples: 40,
        availableScopes: [5, 8, 14],
        availableScopeCounts: {
          5: 3,
          8: 34,
          14: 3,
        },
        missingRecommendedScopes: [],
        availableExternalProjectSamples: 0,
        recommendedBundleCoverage: {
          status: 'needs-more-samples',
          sampleCount: 3,
          modalityCount: 3,
          externalProjectSampleCount: 0,
          scopeCount: 3,
          scopes: [5, 8, 14],
          missingScopes: [],
          missingCoverage: [
            'complete proof from at least one real external project.courseMap at a 5, 8, or 14 lesson proof scope',
          ],
        },
        readyForStrictExternalCollection: false,
      });
      expect(payload.proofCollectionPlan.availableModalities.length).toBeGreaterThanOrEqual(2);
      expect(payload.proofCollectionPlan.missingRequirements).toEqual(
        expect.arrayContaining([expect.stringContaining('project.courseMap')]),
      );
      expect(payload.proofCollectionPlan.recommendedSamples).toHaveLength(3);
      expect(payload.proofCollectionPlan.recommendedSamples.map((sample) => sample.sampleId)).toEqual([
        'gold-research-methods-short-5',
        'gold-ai-course-design-8',
        'gold-community-health-semester-14',
      ]);
      expect(
        new Set(payload.proofCollectionPlan.recommendedSamples.map((sample) => sample.proofModality)).size,
      ).toBeGreaterThanOrEqual(3);
      expect(payload.proofCollectionPlan.scopeCoverageSamples.map((sample) => sample.sampleId)).toEqual([
        'gold-research-methods-short-5',
        'gold-ai-course-design-8',
        'gold-community-health-semester-14',
      ]);
      expect(payload.proofCollectionPlan.preflightCommand).toContain('audit:expert:preflight');
      expect(payload.proofCollectionPlan.externalGateCommand).toContain('audit:expert:external');
      expect(payload.proofCollectionPlan.recommendedBundleTemplatePath).toBe(
        'fixtures/recommended-strict-proof-bundle.template.json',
      );
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-spanish-healthcare-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-clinical-judgment-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-clinical-placement-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-information-literacy-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-teacher-preparation-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-counseling-practice-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-beginning-spanish-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-field-placement-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-online-writing-workshop-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-quantitative-problem-set-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-statistics-inference-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-accounting-finance-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-policy-analysis-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-economics-analysis-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-ethics-argument-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-proof-seminar-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-lecture-exam-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-capstone-project-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-competency-assessment-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-performing-arts-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-programming-lab-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-data-science-lab-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-engineering-design-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-creative-writing-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-business-strategy-case-8');
      expect(payload.samples.map((sample) => sample.sampleId)).toContain('gold-constitutional-law-8');
      expect(payload.samples.every((sample) => sample.fullPackageArtifactCount === 9)).toBe(true);
      expect(payload.samples.every((sample) => sample.sourceInput?.lessonCount === sample.scope)).toBe(true);
      expect(payload.samples.every((sample) => sample.sourceInput?.reviewText?.length > 100)).toBe(true);
      expect(payload.samples.every((sample) => sample.featureSummaries.length === 9)).toBe(true);
      expect(payload.samples.every((sample) => sample.fullPackageArtifacts.length === 9)).toBe(true);
      expect(payload.samples.every((sample) => sample.courseWorkload?.timingStatus === 'fits-session')).toBe(true);
      expect(
        payload.samples.every((sample) =>
          sample.fullPackageArtifacts.every((artifact) => artifact.reviewData && artifact.reviewText.length > 100),
        ),
      ).toBe(true);
      expect(
        payload.samples.every((sample) =>
          sample.fullPackageArtifacts.every(
            (artifact) =>
              artifact.reviewText.length <= 30000 &&
              artifact.reviewTextFullLength >= artifact.reviewText.length &&
              typeof artifact.reviewTextTruncated === 'boolean',
          ),
        ),
      ).toBe(true);
      expect(payload.samples.every((sample) => sample.learnerContextProfile?.learnerRole)).toBe(true);
      expect(payload.samples.every((sample) => sample.sourceConflictReport?.status)).toBe(true);
      expect(payload.samples.every((sample) => sample.sourceConflictReport?.lessonRows?.length === sample.scope)).toBe(
        true,
      );
      expect(payload.samples.every((sample) => sample.sourceRiskRegister?.status)).toBe(true);
      expect(payload.samples.every((sample) => sample.sourceRiskRegister?.lessonRows?.length === sample.scope)).toBe(
        true,
      );
      expect(payload.samples.every((sample) => sample.blueprintAssumptionLedger?.status)).toBe(true);
      expect(
        payload.samples.every((sample) =>
          sample.blueprintAssumptionLedger?.rows?.some((row) => row.category === 'handoff-boundary'),
        ),
      ).toBe(true);
      expect(payload.samples.every((sample) => sample.blueprintReviewSurface?.status)).toBe(true);
      expect(
        payload.samples.every(
          (sample) => sample.blueprintReviewSurface?.instructionalMoveDecode?.status === 'reviewable',
        ),
      ).toBe(true);
      expect(
        payload.samples.every((sample) => sample.blueprintReviewSurface?.lessonRows?.length === sample.scope),
      ).toBe(true);
      expect(
        payload.samples.every(
          (sample) => sample.blueprintReviewSurface?.machineDecodeCompleteness?.checkedArtifacts === 9,
        ),
      ).toBe(true);
      expect(
        payload.samples.every((sample) => sample.blueprintReviewSurface?.traceabilitySummary?.status === 'traceable'),
      ).toBe(true);
      expect(
        payload.samples.every((sample) => sample.blueprintReviewSurface?.traceabilitySummary?.untraceableRows === 0),
      ).toBe(true);
      expect(
        payload.samples.every(
          (sample) => sample.blueprintReviewSurface?.traceabilitySummary?.instructionalMoveRows === sample.scope,
        ),
      ).toBe(true);
      expect(payload.samples.every((sample) => sample.compilerDecisionMatrix?.deterministicCompiler === true)).toBe(
        true,
      );
      expect(
        payload.samples.every((sample) => sample.compilerDecisionMatrix?.lessonRows?.length === sample.scope),
      ).toBe(true);
      expect(payload.samples.every((sample) => sample.assessmentArchitecture?.status === 'balanced')).toBe(true);
      expect(payload.samples.every((sample) => sample.assessmentArchitecture?.totalWeightPercent === 100)).toBe(true);
      expect(payload.samples.every((sample) => sample.conceptDependencyGraph?.status === 'sequenced')).toBe(true);
      expect(payload.samples.every((sample) => sample.conceptDependencyGraph?.nodes?.length === sample.scope)).toBe(
        true,
      );
      expect(
        payload.samples.every((sample) => sample.conceptDependencyGraph?.practiceRows?.length === sample.scope),
      ).toBe(true);
      expect(
        payload.samples.every((sample) =>
          sample.lessons.every(
            (lesson) =>
              lesson.conceptDependencyPlan?.node?.concept &&
              lesson.practiceProgressionPlan?.practiceFocus &&
              lesson.practiceProgressionPlan?.transferTask,
          ),
        ),
      ).toBe(true);
      expect(payload.samples.every((sample) => sample.masteryEvidenceMap?.status === 'complete')).toBe(true);
      expect(payload.samples.every((sample) => sample.masteryEvidenceMap?.lessonRows?.length === sample.scope)).toBe(
        true,
      );
      expect(
        payload.samples.every((sample) =>
          sample.lessons.every(
            (lesson) =>
              lesson.masteryEvidencePlan?.diagnosticEvidence &&
              lesson.masteryEvidencePlan?.independentPerformanceEvidence &&
              lesson.masteryEvidencePlan?.feedbackRevisionEvidence &&
              lesson.masteryEvidencePlan?.transferEvidence &&
              lesson.masteryEvidencePlan?.masteryThreshold,
          ),
        ),
      ).toBe(true);
      expect(payload.samples.every((sample) => sample.evidenceResponseMap?.status === 'complete')).toBe(true);
      expect(payload.samples.every((sample) => sample.evidenceResponseMap?.lessonRows?.length === sample.scope)).toBe(
        true,
      );
      expect(
        payload.samples.every((sample) =>
          sample.lessons.every(
            (lesson) =>
              lesson.evidenceResponsePlan?.readyMove &&
              lesson.evidenceResponsePlan?.partialMove &&
              lesson.evidenceResponsePlan?.supportMove &&
              lesson.evidenceResponsePlan?.recheckCue,
          ),
        ),
      ).toBe(true);
      expect(payload.samples.every((sample) => sample.quizProgression?.length === sample.scope)).toBe(true);
      expect(
        payload.samples.every((sample) =>
          sample.quizProgression.every(
            (row) =>
              row.hasRetrievalToSynthesis &&
              row.bloomCoverage.includes('Remember') &&
              row.bloomCoverage.includes('Apply') &&
              row.bloomCoverage.includes('Analyze') &&
              row.bloomCoverage.includes('Evaluate') &&
              row.bloomCoverage.includes('Create') &&
              row.roleSequence.some((role) => /transfer-synthesis -> Create/i.test(role)) &&
              row.transferSynthesisRole === 'transfer-synthesis -> Create' &&
              row.transferSynthesisBloom === 'Create',
          ),
        ),
      ).toBe(true);
      expect(payload.samples.every((sample) => sample.classroomHandoffPlan?.publishBoundary)).toBe(true);
      expect(payload.samples.every((sample) => sample.packageCoherenceMatrix?.status === 'coherent')).toBe(true);
      expect(
        payload.samples.every((sample) => sample.packageCoherenceMatrix?.lessonRows?.length === sample.scope),
      ).toBe(true);
      expect(payload.samples.every((sample) => sample.courseModalityProfile?.primaryMode)).toBe(true);
      expect(
        payload.samples.every((sample) =>
          sample.lessons.every(
            (lesson) => lesson.modalityCue && lesson.modalityCue.includes(sample.courseModalityProfile.primaryMode),
          ),
        ),
      ).toBe(true);
      expect(
        payload.samples.every((sample) =>
          sample.lessons.every(
            (lesson) =>
              lesson.modalityDecode?.mode === sample.courseModalityProfile.primaryMode &&
              lesson.modalityDecode?.signaturePractice,
          ),
        ),
      ).toBe(true);
      expect(
        payload.samples.every((sample) =>
          sample.lessons.every(
            (lesson) =>
              lesson.artifactGenre?.genre && lesson.artifactGenre?.outputFormat && lesson.artifactGenre?.reviewProtocol,
          ),
        ),
      ).toBe(true);
      expect(payload.scorecardDimensions.every((dimension) => dimension.reviewPrompt)).toBe(true);
      expect(
        payload.samples.every((sample) =>
          sample.lessons.every(
            (lesson) =>
              lesson.feedbackCycle?.studentRevisionAction &&
              lesson.learningTransferPlan?.transferTask &&
              lesson.prerequisitePlan?.diagnosticCheck &&
              lesson.classSessionPlan?.feasibilityStatus === 'fits-session' &&
              lesson.sourceEvidenceTrace?.sourceFields?.length >= 6 &&
              lesson.sourceRisk?.riskLevel &&
              lesson.compilerDecision?.generationPath &&
              lesson.compilerDecision?.publishGate &&
              lesson.teachingIntent?.teachingGoal &&
              lesson.modalityCue &&
              lesson.artifactGenre?.evidenceRequirement &&
              lesson.learnerContextCue &&
              lesson.sourceUsePlan?.noInventedSources &&
              lesson.accessibilityPlan?.participationProtocol &&
              lesson.assessmentValidity?.targetConstruct &&
              lesson.gradingCalibrationPlan?.biasCheck &&
              lesson.criterionEvidenceCue &&
              lesson.criterionWeightPlan?.length >= 4 &&
              lesson.criterionWeightPlan.reduce((sum, entry) => sum + Number(entry.weight || 0), 0) === 100 &&
              lesson.anchorExampleSet?.strongSample &&
              lesson.anchorExampleSet?.partialSample,
          ),
        ),
      ).toBe(true);
      expect(
        payload.samples.every((sample) => sample.fixtureTemplate.reviewEvidence.reviewedArtifacts.length === 9),
      ).toBe(true);
      expect(
        payload.samples.every((sample) => sample.fixtureTemplate.reviewEvidence.courseModality !== 'unknown'),
      ).toBe(true);
      expect(
        payload.samples.every((sample) =>
          sample.fixtureTemplate.reviewEvidence.proofScopeTags.some((tag) => tag.startsWith('modality:')),
        ),
      ).toBe(true);
      expect(
        payload.samples.every((sample) =>
          sample.fixtureTemplate.reviewEvidence.proofScopeTags.includes(`scope:${sample.scope}`),
        ),
      ).toBe(true);
      expect(payload.samples.every((sample) => sample.fixtureTemplate.templateOnly)).toBe(true);
      expect(
        payload.samples.every((sample) => sample.fixtureTemplate.sourceFidelityReview?.sourceInputReviewed === false),
      ).toBe(true);
      expect(
        payload.samples.every(
          (sample) =>
            sample.fixtureTemplate.blueprintQualityReview?.blueprintReviewed === false &&
            sample.fixtureTemplate.blueprintQualityReview?.lessonReviews?.length === sample.scope,
        ),
      ).toBe(true);
      expect(payload.samples.every((sample) => sample.fixtureTemplate.reviewScorecard.dimensions[0].reviewPrompt)).toBe(
        true,
      );
      expect(payload.samples.every((sample) => sample.editHistoryTemplate.editHistoryEvidenceType === 'external')).toBe(
        true,
      );
      expect(
        payload.samples.every(
          (sample) =>
            sample.editHistoryTemplate.reviewEvidence.courseModality ===
            sample.fixtureTemplate.reviewEvidence.courseModality,
        ),
      ).toBe(true);
      expect(markdown).toContain('CourseMapper External Quality Proof Packet');
      expect(markdown).toContain('Compare the source course map to the compact blueprint');
      expect(markdown).toContain('Review every core artifact');
      expect(markdown).toContain('enough course samples to cover distinct teaching modalities');
      expect(markdown).toContain('short-module, standard, and full-semester course lengths: 5, 8, and 14 lessons');
      expect(markdown.length).toBeLessThan(1200000);
      expect(markdown).toContain('Proof Collection Plan');
      expect(markdown).toContain('Ready for strict external collection: no');
      expect(markdown).toContain('Available course scopes: 5, 8, 14');
      expect(markdown).toContain('Recommended scope coverage: 5, 8, 14');
      expect(markdown).toContain('Recommended bundle coverage: needs-more-samples');
      expect(markdown).toContain('Missing Before Strict Proof');
      expect(markdown).toContain('Recommended Strict Proof Bundle Samples');
      expect(markdown).toContain('Recommended Bundle Coverage');
      expect(markdown).toContain('| Real external course map at required scope | missing | 0/1 |');
      expect(markdown).toContain('Recommended Scope Coverage');
      expect(markdown).toContain('gold-research-methods-short-5');
      expect(markdown).toContain('gold-ai-course-design-8');
      expect(markdown).toContain('gold-community-health-semester-14');
      expect(markdown).toContain('audit:expert:preflight');
      expect(markdown).toContain('audit:expert:external');
      expect(markdown).toContain('gold-spanish-healthcare-8');
      expect(markdown).toContain('gold-clinical-judgment-8');
      expect(markdown).toContain('gold-clinical-placement-8');
      expect(markdown).toContain('Scorecard Dimensions');
      expect(markdown).toContain('Available Sample File Index');
      expect(markdown).toContain(
        'Detailed evidence sections below are limited to 3 recommended strict-proof bundle sample(s)',
      );
      expect(markdown).toContain('| gold-spanish-healthcare-8 | Spanish for Healthcare Professionals | 8 |');
      expect(markdown).toContain('Calibration Evidence');
      expect(markdown).toContain('Criterion Evidence');
      expect(markdown).toContain('Criterion Weighting');
      expect(markdown).toContain('Strong Anchor');
      expect(markdown).toContain('Partial Anchor');
      expect(markdown).toContain('Bias Check');
      expect(markdown).toContain('Classroom Evidence');
      expect(markdown).toContain('Concept Dependency Graph');
      expect(markdown).toContain('Practice Focus');
      expect(markdown).toContain('Session Feasibility');
      expect(markdown).toContain('Timing status');
      expect(markdown).toContain('Assessment Architecture');
      expect(markdown).toContain('Assessment architecture');
      expect(markdown).toContain('Weight Source');
      expect(markdown).toContain('Quiz Progression Evidence');
      expect(markdown).toContain('Transfer Synthesis Bloom');
      expect(markdown).toContain('Retrieval-To-Synthesis');
      expect(markdown).toContain('transfer-synthesis -> Create');
      expect(markdown).toContain('Source Provenance');
      expect(markdown).toContain('Raw Source Text');
      expect(markdown).toContain('blueprint-quality reviews');
      expect(markdown).toContain('Source Risk Register');
      expect(markdown).toContain('Source Conflict Report');
      expect(markdown).toContain('Blueprint Assumption Ledger');
      expect(markdown).toContain('Human-Readable Blueprint Review Surface');
      expect(markdown).toContain('Traceability');
      expect(markdown).toContain('Answerability');
      expect(markdown).toContain('Instructional moves');
      expect(markdown).toContain('handoff-boundary');
      expect(markdown).toContain('Review Required');
      expect(markdown).toContain('Compiler Decisions');
      expect(markdown).toContain('Publish Gate');
      expect(markdown).toContain('Teaching Intent');
      expect(markdown).toContain('Modality Fit');
      expect(markdown).toContain('Artifact Genre');
      expect(markdown).toContain('Prerequisite Check');
      expect(markdown).toContain('Course modality');
      expect(markdown).toContain('Learner context');
      expect(markdown).toContain('Learner Context');
      expect(markdown).toContain('Handoff status');
      expect(markdown).toContain('Package coherence');
      expect(markdown).toContain('Package Coherence Matrix');
      expect(markdown).toContain('Source input review files');
      expect(markdown).toContain('source-inputs/gold-spanish-healthcare-8.md');
      expect(markdown).toContain('Compact blueprint review files');
      expect(markdown).toContain('compact-blueprints/gold-spanish-healthcare-8.md');
      expect(markdown).toContain('Full-package review files');
      expect(markdown).toContain('Reviewer intake form');
      expect(markdown).toContain('Fixture templates');
      expect(markdown).toContain('Full Artifact Inventory');
      expect(markdown).toContain('Evidence Requirement');
      expect(markdown).toContain('Source Rule');
      expect(markdown).toContain('Class Timing');
      expect(markdown).toContain('Publish boundary');
      expect(markdown).toContain('Source Integrity');
      expect(markdown).toContain('npm run audit:expert:preflight');
      expect(markdown).toContain('npm run audit:expert:external');
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  }, 15000);

  it('filters samples and writes latest packet artifacts', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coursemapper-external-proof-packet-'));
    try {
      const payload = await buildExternalQualityProofPacket({
        runtime,
        samples: DEFAULT_GOLD_SAMPLES,
        sampleIds: ['gold-spanish-healthcare-8'],
        packageVersion: '0.8.0-test',
      });
      const paths = await writeExternalQualityProofPacket(payload, outputDir);
      const markdown = await fs.readFile(paths.markdownPath, 'utf8');
      const json = JSON.parse(await fs.readFile(paths.jsonPath, 'utf8'));
      const jsonRaw = await fs.readFile(paths.jsonPath, 'utf8');
      const sourceMarkdown = await fs.readFile(paths.sourceInputPaths[0].markdownPath, 'utf8');
      const sourceJson = JSON.parse(await fs.readFile(paths.sourceInputPaths[0].jsonPath, 'utf8'));
      const blueprintMarkdown = await fs.readFile(paths.blueprintPaths[0].markdownPath, 'utf8');
      const blueprintJson = JSON.parse(await fs.readFile(paths.blueprintPaths[0].jsonPath, 'utf8'));
      const fullMarkdown = await fs.readFile(paths.fullPackagePaths[0].markdownPath, 'utf8');
      const fullJson = JSON.parse(await fs.readFile(paths.fullPackagePaths[0].jsonPath, 'utf8'));
      const reviewIntakeMarkdown = await fs.readFile(paths.reviewIntakePaths[0].markdownPath, 'utf8');
      const reviewerCompletionChecklistMarkdown = await fs.readFile(paths.reviewerCompletionChecklistPath, 'utf8');
      const reviewerCompletionChecklist = JSON.parse(
        await fs.readFile(paths.reviewerCompletionChecklistJsonPath, 'utf8'),
      );
      const combinedFixture = JSON.parse(await fs.readFile(paths.fixtureTemplatePaths[0].combinedFixturePath, 'utf8'));
      const reviewFixture = JSON.parse(await fs.readFile(paths.fixtureTemplatePaths[0].reviewFixturePath, 'utf8'));
      const editHistoryFixture = JSON.parse(
        await fs.readFile(paths.fixtureTemplatePaths[0].editHistoryFixturePath, 'utf8'),
      );
      const externalProjectCombinedFixture = JSON.parse(
        await fs.readFile(paths.externalProjectTemplatePaths.combinedFixturePath, 'utf8'),
      );
      const recommendedStrictBundle = JSON.parse(
        await fs.readFile(paths.externalProjectTemplatePaths.recommendedBundleTemplatePath, 'utf8'),
      );
      const externalProjectIntakeMarkdown = await fs.readFile(paths.externalProjectTemplatePaths.intakePath, 'utf8');

      expect(payload.summary.sampleCount).toBe(1);
      expect(json.proofCollectionPlan).toMatchObject({
        availableSamples: 1,
        requiredCompleteProofScopes: [5, 8, 14],
        recommendedScopeCoverage: [5, 8, 14],
        availableScopes: [8],
        availableScopeCounts: {
          8: 1,
        },
        missingRecommendedScopes: [5, 14],
        recommendedBundleCoverage: {
          status: 'needs-more-samples',
          sampleCount: 1,
          modalityCount: 1,
          externalProjectSampleCount: 0,
          scopeCount: 1,
          scopes: [8],
          missingScopes: [5, 14],
        },
        readyForStrictExternalCollection: false,
      });
      expect(json.proofCollectionPlan.scopeCoverageSamples.map((sample) => sample.sampleId)).toEqual([
        'gold-spanish-healthcare-8',
      ]);
      expect(paths.sourceInputPaths).toHaveLength(1);
      expect(paths.blueprintPaths).toHaveLength(1);
      expect(paths.fullPackagePaths).toHaveLength(1);
      expect(paths.reviewIntakePaths).toHaveLength(1);
      expect(paths.fixtureTemplatePaths).toHaveLength(1);
      expect(paths.reviewerCompletionChecklistPath).toContain('reviewer-completion-checklist.md');
      expect(paths.reviewerCompletionChecklistJsonPath).toContain('reviewer-completion-checklist.json');
      expect(paths.externalProjectTemplatePaths.combinedFixturePath).toContain(
        'external-project.combined-fixtures.template.json',
      );
      expect(paths.externalProjectTemplatePaths.recommendedBundleTemplatePath).toContain(
        'recommended-strict-proof-bundle.template.json',
      );
      expect(payload.samples[0].sampleId).toBe('gold-spanish-healthcare-8');
      expect(payload.samples[0].lessons[0].gradingCalibrationPlan.biasCheck).toContain('rubric evidence');
      expect(payload.samples[0].lessons[0].criterionEvidenceCue).toContain('inspectable');
      expect(payload.samples[0].lessons[0].criterionWeightPlan.map((entry) => entry.weight)).toEqual([30, 30, 20, 20]);
      expect(payload.samples[0].lessons[0].criterionWeightPlan[0].priority).toBe('source-grounded concept evidence');
      expect(payload.samples[0].lessons[0].anchorExampleSet.strongSample).toContain(
        'Strong Opening-encounter role-play',
      );
      expect(payload.samples[0].lessons[0].teachingIntent.teachingGoal).toContain('evidence-backed');
      expect(payload.samples[0].courseModalityProfile.primaryMode).toBe('clinical-simulation');
      expect(payload.samples[0].lessons[0].modalityCue).toContain('clinical-simulation');
      expect(payload.samples[0].lessons[0].modalityDecode.signaturePractice).toContain('patient-simulation');
      expect(payload.samples[0].lessons[0].artifactGenre.genre).toBe('performance-simulation');
      expect(payload.samples[0].lessons[0].artifactGenre.outputFormat).toContain('Opening-encounter role-play');
      expect(payload.samples[0].lessons[0].prerequisitePlan.diagnosticCheck).toContain('Clinical Greetings');
      expect(payload.samples[0].lessons[0].classSessionPlan).toMatchObject({
        feasibilityStatus: 'fits-session',
        plannedClassMinutes: 110,
      });
      expect(payload.samples[0].lessons[0].sourceUsePlan.noInventedSources).toContain('Do not invent');
      expect(payload.samples[0].lessons[0].sourceEvidenceTrace.sourceFields[0]).toMatchObject({
        field: 'lesson identity',
        source: 'course-map',
      });
      expect(payload.samples[0].sourceRiskRegister).toMatchObject({
        status: expect.any(String),
        lessonRows: expect.arrayContaining([
          expect.objectContaining({
            lessonNumber: 1,
            riskLevel: expect.any(String),
          }),
        ]),
      });
      expect(payload.samples[0].blueprintAssumptionLedger).toMatchObject({
        status: expect.any(String),
        rows: expect.arrayContaining([
          expect.objectContaining({
            category: 'handoff-boundary',
            reviewRequired: true,
          }),
        ]),
      });
      expect(payload.samples[0].sourceConflictReport).toMatchObject({
        status: expect.any(String),
        lessonRows: expect.arrayContaining([
          expect.objectContaining({
            lessonNumber: 1,
            conflictStatus: expect.any(String),
          }),
        ]),
      });
      expect(payload.samples[0].compilerDecisionMatrix).toMatchObject({
        deterministicCompiler: true,
        lessonRows: expect.arrayContaining([
          expect.objectContaining({
            lessonNumber: 1,
            generationPath: expect.any(String),
            publishGate: expect.any(String),
          }),
        ]),
      });
      expect(payload.samples[0].assessmentArchitecture).toMatchObject({
        status: 'balanced',
        totalWeightPercent: 100,
        lessonRows: expect.arrayContaining([
          expect.objectContaining({
            lessonNumber: 1,
            role: 'diagnostic-checkpoint',
            feedbackWindow: expect.stringContaining('next class session'),
          }),
        ]),
      });
      expect(payload.samples[0].quizProgression[0]).toMatchObject({
        lessonNumber: 1,
        totalQuestions: 6,
        transferSynthesisRole: 'transfer-synthesis -> Create',
        transferSynthesisBloom: 'Create',
        hasRetrievalToSynthesis: true,
      });
      expect(payload.samples[0].quizProgression[0].bloomCoverage).toEqual(
        expect.arrayContaining(['Remember', 'Apply', 'Analyze', 'Evaluate', 'Create']),
      );
      expect(payload.samples[0].quizProgression[0].roleSequence).toEqual(
        expect.arrayContaining(['transfer-synthesis -> Create']),
      );
      expect(payload.samples[0].lessons[0].sourceRisk.riskLevel).toBeTruthy();
      expect(payload.samples[0].lessons[0].compilerDecision.generationPath).toBeTruthy();
      expect(payload.samples[0].learnerContextProfile.coursePerformanceRole).toContain('Students work as');
      expect(payload.samples[0].classroomHandoffPlan.reviewOrder[0]).toContain('Confirm official course facts');
      expect(payload.samples[0].conceptDependencyGraph.status).toBe('sequenced');
      expect(payload.samples[0].lessons[0].conceptDependencyPlan.node.concept).toContain('Clinical Greetings');
      expect(payload.samples[0].lessons[0].practiceProgressionPlan.practiceFocus).toContain('patient-simulation');
      expect(payload.samples[0].masteryEvidenceMap.status).toBe('complete');
      expect(payload.samples[0].lessons[0].masteryEvidencePlan.masteryThreshold).toContain('Strong evidence');
      expect(payload.samples[0].evidenceResponseMap.status).toBe('complete');
      expect(payload.samples[0].lessons[0].evidenceResponsePlan.supportMove).toBeTruthy();
      expect(payload.samples[0].packageCoherenceMatrix.checkedArtifacts).toContain('courseFaq');
      expect(payload.samples[0].learnerContextProfile).toMatchObject({
        learnerRole: 'healthcare communicator',
        evidenceNoun: 'role-play evidence',
        decisionNoun: 'clinical communication decision',
      });
      expect(payload.samples[0].packageCoherenceMatrix.lessonRows[0].learnerContextCue).toContain(
        'healthcare communicators',
      );
      expect(payload.samples[0].packageCoherenceMatrix.lessonRows[0].learnerContextCue).toContain('role-play evidence');
      expect(payload.samples[0].packageCoherenceMatrix.lessonRows[0].learnerContextCue).toContain(
        'clinical communication decision',
      );
      expect(payload.samples[0].packageCoherenceMatrix.lessonRows[0].learnerContextCue).toContain(
        'Opening-encounter role-play',
      );
      expect(payload.samples[0].packageCoherenceMatrix.lessonRows[0].teachingIntentCue).toContain('evidence-backed');
      expect(payload.samples[0].packageCoherenceMatrix.lessonRows[0].modalityCue).toContain('clinical-simulation');
      expect(payload.samples[0].packageCoherenceMatrix.lessonRows[0].artifactGenreCue).toBe('performance-simulation');
      expect(payload.samples[0].packageCoherenceMatrix.lessonRows[0].prerequisiteCue).toContain('Clinical Greetings');
      expect(payload.samples[0].packageCoherenceMatrix.lessonRows[0].classSessionCue).toContain('110/110 minutes');
      expect(payload.samples[0].packageCoherenceMatrix.lessonRows[0].assessmentRole).toBe('Diagnostic checkpoint');
      expect(markdown).toContain('Spanish for Healthcare Professionals');
      expect(markdown).toContain('clinical-simulation');
      expect(markdown).toContain('performance-simulation');
      expect(markdown).toContain('Opening-encounter role-play');
      expect(markdown).toContain('Final Patient Interview Simulation');
      expect(markdown).toContain('Feedback / Revision');
      expect(markdown).toContain('Source Provenance');
      expect(markdown).toContain('Planned / Session Minutes');
      expect(markdown).toContain('Source Risk Register');
      expect(markdown).toContain('Source Conflict Report');
      expect(markdown).toContain('Blueprint Assumption Ledger');
      expect(markdown).toContain('Local Review Actions');
      expect(markdown).toContain('Spot-check official dates');
      expect(markdown).toContain('Teaching Intent');
      expect(markdown).toContain('Modality Fit');
      expect(markdown).toContain('Concept Dependency Graph');
      expect(markdown).toContain('Quiz Progression Evidence');
      expect(markdown).toContain('transfer-synthesis -> Create');
      expect(markdown).toContain('source-inputs/gold-spanish-healthcare-8.md');
      expect(markdown).toContain('compact-blueprints/gold-spanish-healthcare-8.md');
      expect(markdown).toContain('full-package/gold-spanish-healthcare-8.md');
      expect(markdown).toContain('review-intake/gold-spanish-healthcare-8.md');
      expect(markdown).toContain('fixtures/gold-spanish-healthcare-8.combined-fixtures.template.json');
      expect(markdown).toContain('fixtures/gold-spanish-healthcare-8.review-fixture.template.json');
      expect(markdown).toContain('fixtures/recommended-strict-proof-bundle.template.json');
      expect(markdown).toContain('fixtures/external-project.combined-fixtures.template.json');
      expect(markdown).toContain('Reviewer completion checklist');
      expect(markdown).toContain('reviewEvidence.reviewedPackageVersion');
      expect(markdown).toContain('reviewScorecard.dimensions[].score');
      expect(sourceMarkdown).toContain('CourseMapper Source Course Map Review');
      expect(sourceMarkdown).toContain('Source Lesson Map');
      expect(sourceMarkdown).toContain('Clinical Greetings, Roles, and Consent Language');
      expect(sourceMarkdown).toContain('Opening-encounter role-play');
      expect(sourceJson.sourceInput.reviewData.courseName).toBe('Spanish for Healthcare Professionals');
      expect(sourceJson.sourceInput.lessonCount).toBe(8);
      expect(blueprintMarkdown).toContain('CourseMapper Compact Blueprint Review');
      expect(blueprintMarkdown).toContain('Lesson Compression Matrix');
      expect(blueprintMarkdown).toContain('Blueprint-Quality Fixture Rows');
      expect(blueprintMarkdown).toContain('Clinical Greetings, Roles, and Consent Language');
      expect(blueprintMarkdown).toContain('Opening-encounter role-play');
      expect(blueprintJson.courseName).toBe('Spanish for Healthcare Professionals');
      expect(blueprintJson.lessons).toHaveLength(8);
      expect(blueprintJson.blueprintQualityTemplate.lessonReviews).toHaveLength(8);
      expect(blueprintJson.fullPackageArtifacts).toBeUndefined();
      expect(fullMarkdown).toContain('CourseMapper Full Compiled Package Review');
      expect(fullMarkdown).toContain('Long artifact sections are bounded for readable Markdown');
      expect(fullMarkdown).toContain('### Syllabus');
      expect(fullMarkdown).toContain('### Lesson 1: Clinical Greetings, Roles, and Consent Language');
      expect(fullMarkdown).toContain('Opening-encounter role-play');
      expect(fullMarkdown).toContain('Final Patient Interview Simulation');
      expect(fullMarkdown).toContain('## Course FAQ');
      expect(fullMarkdown).toContain('## Local Review Actions');
      expect(fullMarkdown).toContain('sourceFidelityReview.artifactReviews[].localReviewActionVisible');
      expect(fullMarkdown).toContain('Spot-check official dates');
      expect(fullMarkdown).toContain('**Category:**');
      expect(fullMarkdown).toContain('**Related Concepts:**');
      expect(fullMarkdown).not.toContain('**Ca:**');
      expect(fullMarkdown.length).toBeLessThan(400000);
      expect(fullJson.fullPackageArtifacts).toHaveLength(9);
      expect(fullJson.fullPackageArtifacts.every((artifact) => artifact.reviewText.length <= 30000)).toBe(true);
      expect(fullJson.fullPackageArtifacts.some((artifact) => artifact.reviewTextTruncated)).toBe(true);
      expect(fullJson.sourceInput.reviewData.courseName).toBe('Spanish for Healthcare Professionals');
      expect(fullJson.courseWorkload.timingStatus).toBe('fits-session');
      expect(fullJson.assessmentArchitecture.status).toBe('balanced');
      expect(fullJson.conceptDependencyGraph.status).toBe('sequenced');
      expect(fullJson.masteryEvidenceMap.status).toBe('complete');
      expect(fullJson.evidenceResponseMap.status).toBe('complete');
      expect(fullJson.quizProgression[0].transferSynthesisRole).toBe('transfer-synthesis -> Create');
      expect(fullJson.quizProgression[0].transferSynthesisBloom).toBe('Create');
      expect(fullJson.sourceRiskRegister.lessonRows[0].riskLevel).toBeTruthy();
      expect(fullJson.blueprintAssumptionLedger.rows[0].reviewerAction).toBeTruthy();
      expect(fullJson.fullPackageArtifacts[0].reviewData.syllabus.courseTitle).toBe(
        'Spanish for Healthcare Professionals',
      );
      expect(fullJson.lessons[0].localReviewAction).toContain('Spot-check official dates');
      expect(fullJson.lessons[0].publishGate).toBe('instructor-spot-check-before-publish');
      expect(fullJson.fullPackageArtifacts[0].reviewText).toContain('Spanish for Healthcare Professionals');
      expect(reviewIntakeMarkdown).toContain('CourseMapper External Review Intake Form');
      expect(reviewIntakeMarkdown).toContain('Source course-map Markdown');
      expect(reviewIntakeMarkdown).toContain('Compact blueprint Markdown');
      expect(reviewIntakeMarkdown).toContain('First compare the source course-map files');
      expect(reviewIntakeMarkdown).toContain('Full compiled package Markdown');
      expect(reviewIntakeMarkdown).toContain('Combined external proof fixture template');
      expect(reviewIntakeMarkdown).toContain('combined-fixtures.json');
      expect(reviewIntakeMarkdown).toContain('Source-Fidelity Review');
      expect(reviewIntakeMarkdown).toContain('Unsupported invention risk');
      expect(reviewIntakeMarkdown).toContain('Source Compared?');
      expect(reviewIntakeMarkdown).toContain('Source Signals Preserved?');
      expect(reviewIntakeMarkdown).toContain('Local Review Action Visible?');
      expect(reviewIntakeMarkdown).toContain('Blueprint-Quality Review');
      expect(reviewIntakeMarkdown).toContain('Compact blueprint reviewed');
      expect(reviewIntakeMarkdown).toContain('Review Flags Visible?');
      expect(reviewIntakeMarkdown).toContain('Assumption-Ledger Review');
      expect(reviewIntakeMarkdown).toContain('Review-required rows inspected');
      expect(reviewIntakeMarkdown).toContain('Reviewer decisions recorded');
      expect(reviewIntakeMarkdown).toContain('Reviewer Decision');
      expect(reviewIntakeMarkdown).toContain('Before / original wording');
      expect(reviewIntakeMarkdown).toContain('After / accepted wording');
      expect(reviewIntakeMarkdown).toContain('proof preflight');
      expect(reviewIntakeMarkdown).toContain('npm run audit:expert:preflight');
      expect(reviewIntakeMarkdown).toContain('Score /5');
      expect(reviewIntakeMarkdown).toContain('Reviewed Artifact(s)');
      expect(reviewIntakeMarkdown).toContain('Concrete Evidence Example');
      expect(reviewIntakeMarkdown).toContain('4.5/5');
      expect(reviewIntakeMarkdown).toContain('Instructional alignment');
      expect(reviewerCompletionChecklistMarkdown).toContain('CourseMapper Reviewer Completion Checklist');
      expect(reviewerCompletionChecklistMarkdown).toContain('Global Completion Items');
      expect(reviewerCompletionChecklistMarkdown).toContain('Required Review Fixture Fields');
      expect(reviewerCompletionChecklistMarkdown).toContain('reviewScorecard.dimensions[].score');
      expect(reviewerCompletionChecklistMarkdown).toContain('sourceFidelityReview.artifactReviews[].notes');
      expect(reviewerCompletionChecklistMarkdown).toContain('instructorEditPatterns[].after');
      expect(reviewerCompletionChecklist).toMatchObject({
        status: 'missing-required-samples',
        packageVersion: '0.8.0-test',
      });
      expect(reviewerCompletionChecklist.globalItems.map((item) => item.id)).toEqual(
        expect.arrayContaining(['review-current-version', 'remove-template-markers', 'real-external-project']),
      );
      expect(reviewerCompletionChecklist.perSample[0]).toMatchObject({
        sampleId: 'gold-spanish-healthcare-8',
        scope: 8,
        modality: 'clinical-simulation',
      });
      expect(reviewerCompletionChecklist.perSample[0].requiredReviewFixtureFields).toContain(
        'blueprintQualityReview.lessonReviews[].notes',
      );
      expect(reviewerCompletionChecklist.perSample[0].requiredEditHistoryFixtureFields).toContain(
        'instructorEditPatterns[].after',
      );
      expect(externalProjectIntakeMarkdown).toContain('External Project Course-Map Proof Template');
      expect(externalProjectIntakeMarkdown).toContain('Replace `project.courseMap`');
      expect(externalProjectCombinedFixture.fixtures).toHaveLength(2);
      expect(externalProjectCombinedFixture.fixtures[0].project.courseMap.courseName).toContain('Replace with real');
      expect(externalProjectCombinedFixture.fixtures[0].reviewEvidence.proofScopeTags).toContain(
        'scope:replace-with-reviewed-lesson-count',
      );
      expect(externalProjectCombinedFixture.fixtures[0].sourceFidelityReview.artifactReviews).toHaveLength(9);
      expect(externalProjectCombinedFixture.fixtures[0].blueprintQualityReview.lessonReviews).toHaveLength(2);
      expect(externalProjectCombinedFixture.fixtures[0].assumptionLedgerReview.reviewedRows[0]).toMatchObject({
        decision: null,
      });
      expect(externalProjectCombinedFixture.fixtures[1].editHistoryEvidenceType).toBe('external');
      expect(recommendedStrictBundle).toMatchObject({
        templateOnly: true,
        requiredCompleteProofScopes: [5, 8, 14],
        requiredDistinctModalities: 2,
        requiredExternalProjectSamples: 1,
      });
      expect(recommendedStrictBundle.fixtures).toHaveLength(4);
      expect(recommendedStrictBundle.fixtures.map((fixture) => fixture.sampleId)).toEqual([
        'gold-spanish-healthcare-8',
        'gold-spanish-healthcare-8',
        'external-reviewed-course-project',
        'external-reviewed-course-project',
      ]);
      expect(json.externalProjectTemplateFiles.combinedFixturePath).toBe(
        paths.externalProjectTemplatePaths.combinedFixturePath,
      );
      expect(json.externalProjectTemplateFiles.recommendedBundleTemplatePath).toBe(
        paths.externalProjectTemplatePaths.recommendedBundleTemplatePath,
      );
      expect(json.reviewerCompletionChecklist.perSample[0].files.combinedFixture).toBe(
        'fixtures/gold-spanish-healthcare-8.combined-fixtures.template.json',
      );
      expect(combinedFixture.fixtures).toHaveLength(2);
      expect(combinedFixture.fixtures.map((fixture) => fixture.sampleId)).toEqual([
        'gold-spanish-healthcare-8',
        'gold-spanish-healthcare-8',
      ]);
      expect(reviewFixture.fixtures[0].sampleId).toBe('gold-spanish-healthcare-8');
      expect(reviewFixture.fixtures[0].reviewScorecard.dimensions).toHaveLength(6);
      expect(reviewFixture.fixtures[0].reviewScorecard.dimensions[0].evidenceArtifacts).toEqual([
        'Replace with reviewed artifact featureId, e.g. lessonPlans',
      ]);
      expect(reviewFixture.fixtures[0].reviewScorecard.dimensions[0].evidenceExamples).toEqual([
        'Replace with one concrete package detail that supports this score.',
      ]);
      expect(reviewFixture.fixtures[0].sourceFidelityReview.notes).toContain('Replace with reviewer notes');
      expect(reviewFixture.fixtures[0].sourceFidelityReview.artifactReviews).toHaveLength(9);
      expect(reviewFixture.fixtures[0].sourceFidelityReview.artifactReviews[0]).toMatchObject({
        sourceCompared: false,
        packageCompared: false,
        sourceSignalsPreserved: null,
        compilerDecisionVisible: null,
        publishGateVisible: null,
        modelUsePolicyVisible: null,
        handoffReviewFocusVisible: null,
        localReviewActionVisible: null,
      });
      expect(reviewFixture.fixtures[0].blueprintQualityReview).toMatchObject({
        blueprintReviewed: false,
        sourceInputReviewed: false,
        compactRepresentationReviewed: false,
      });
      expect(reviewFixture.fixtures[0].blueprintQualityReview.lessonReviews).toHaveLength(8);
      expect(reviewFixture.fixtures[0].blueprintQualityReview.lessonReviews[0]).toMatchObject({
        sourceCompared: false,
        blueprintCompared: false,
        sourceSignalsPreserved: null,
        assessmentPreserved: null,
      });
      expect(reviewFixture.fixtures[0].assumptionLedgerReview.categoriesReviewed).toEqual(
        expect.arrayContaining(['learner-context', 'course-modality', 'assessment-weight', 'handoff-boundary']),
      );
      expect(reviewFixture.fixtures[0].assumptionLedgerReview.reviewedRows.length).toBeGreaterThan(0);
      expect(reviewFixture.fixtures[0].assumptionLedgerReview.reviewedRows[0]).toMatchObject({
        decision: null,
      });
      expect(reviewFixture.fixtures[0].assumptionLedgerReview.notes).toContain('Replace with reviewer notes');
      expect(editHistoryFixture.fixtures[0].editHistoryEvidenceType).toBe('external');
      expect(editHistoryFixture.fixtures[0].instructorEditPatterns[0]).toMatchObject({
        before: 'Replace with original or pre-edit wording.',
        after: 'Replace with accepted instructor-edited wording.',
      });
      expect(json.samples[0].fullPackageArtifacts).toBeUndefined();
      expect(json.samples[0].classroomHandoffPlan).toBeUndefined();
      expect(json.samples[0].assessmentArchitecture).toBeUndefined();
      expect(json.samples[0].fixtureTemplate).toBeUndefined();
      expect(json.samples[0].fullPackageFiles.markdownPath).toBe(paths.fullPackagePaths[0].markdownPath);
      expect(json.samples[0].blueprintFiles.markdownPath).toBe(paths.blueprintPaths[0].markdownPath);
      expect(json.samples[0].sourceInput.reviewData).toBeUndefined();
      expect(json.samples[0].sourceInput.markdownPath).toBe(paths.sourceInputPaths[0].markdownPath);
      expect(json.samples[0].qualitySummary).toMatchObject({
        compilerPath: 'deterministic-blueprint',
        timingStatus: 'fits-session',
        modality: 'clinical-simulation',
        assessmentArchitectureStatus: 'balanced',
        blueprintReviewSurfaceStatus: 'review-ready-with-local-confirmations',
        blueprintReviewTraceabilityStatus: 'traceable',
        blueprintReviewUntraceableRows: 0,
        blueprintReviewInstructionalMoveStatus: 'reviewable',
        blueprintReviewInstructionalMoveRows: 8,
      });
      expect(json.samples[0].templateSummary.reviewedArtifacts).toEqual([
        'syllabus',
        'lessonPlans',
        'slideDecks',
        'assignments',
        'rubrics',
        'discussions',
        'quizBank',
        'studyGuides',
        'courseFaq',
      ]);
      expect(json.samples[0].templateSummary).toMatchObject({
        reviewTemplateOnly: true,
        editHistoryTemplateOnly: true,
        scorecardDimensionCount: 6,
        sourceFidelityArtifactCount: 9,
        blueprintLessonReviewCount: 8,
      });
      expect(Buffer.byteLength(jsonRaw)).toBeLessThan(250000);
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('builds packet artifacts from an external project fixture file', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coursemapper-external-project-packet-'));
    const fixturePath = path.join(outputDir, 'external-project-fixtures.json');
    try {
      await fs.writeFile(fixturePath, `${JSON.stringify({ fixtures: [makeExternalProjectFixture()] }, null, 2)}\n`);
      const payload = await buildExternalQualityProofPacket({
        runtime,
        fixturePath,
        includeDefaultSamples: false,
        packageVersion: '0.8.0-test',
      });
      const paths = await writeExternalQualityProofPacket(payload, outputDir);
      const manifest = JSON.parse(await fs.readFile(paths.jsonPath, 'utf8'));
      const reviewerCompletionChecklist = JSON.parse(
        await fs.readFile(paths.reviewerCompletionChecklistJsonPath, 'utf8'),
      );
      const sourceMarkdown = await fs.readFile(paths.sourceInputPaths[0].markdownPath, 'utf8');
      const blueprintMarkdown = await fs.readFile(paths.blueprintPaths[0].markdownPath, 'utf8');
      const fullMarkdown = await fs.readFile(paths.fullPackagePaths[0].markdownPath, 'utf8');
      const combinedFixture = JSON.parse(await fs.readFile(paths.fixtureTemplatePaths[0].combinedFixturePath, 'utf8'));
      const recommendedStrictBundle = JSON.parse(
        await fs.readFile(paths.externalProjectTemplatePaths.recommendedBundleTemplatePath, 'utf8'),
      );

      expect(payload.summary.sampleCount).toBe(1);
      expect(payload.summary.externalProjectSampleCount).toBe(1);
      expect(payload.summary.curatedSampleCount).toBe(0);
      expect(payload.proofCollectionPlan).toMatchObject({
        availableSamples: 1,
        requiredCompleteProofScopes: [5, 8, 14],
        recommendedScopeCoverage: [5, 8, 14],
        availableScopes: [3],
        availableScopeCounts: {
          3: 1,
        },
        missingRecommendedScopes: [5, 8, 14],
        recommendedBundleCoverage: {
          status: 'needs-more-samples',
          sampleCount: 1,
          modalityCount: 1,
          externalProjectSampleCount: 1,
          externalProjectRequiredScopeSampleCount: 0,
          scopeCount: 1,
          scopes: [3],
          missingScopes: [5, 8, 14],
        },
        availableExternalProjectSamples: 1,
        readyForStrictExternalCollection: false,
      });
      expect(payload.proofCollectionPlan.scopeCoverageSamples).toEqual([]);
      expect(payload.proofCollectionPlan.missingRequirements).toEqual(
        expect.arrayContaining([
          expect.stringContaining('two reviewed course samples'),
          expect.stringContaining('two distinct teaching modalities'),
          expect.stringContaining('required 5-, 8-, or 14-lesson proof scope'),
        ]),
      );
      expect(payload.proofCollectionPlan.recommendedSamples[0]).toMatchObject({
        sampleId: 'external-field-methods-project',
        projectSource: 'external-project',
        role: 'required real-course proof sample',
      });
      expect(payload.samples[0]).toMatchObject({
        sampleId: 'external-field-methods-project',
        projectSource: 'external-project',
        courseName: 'External Field Methods Studio',
      });
      expect(payload.samples[0].sourceInput.lessonCount).toBe(3);
      expect(payload.samples[0].courseModalityProfile.primaryMode).toBeTruthy();
      expect(paths.sourceInputPaths[0].markdownPath).toContain('external-field-methods-project.md');
      expect(paths.blueprintPaths[0].markdownPath).toContain('external-field-methods-project.md');
      expect(sourceMarkdown).toContain('External Field Methods Studio');
      expect(sourceMarkdown).toContain('Interview protocol 1');
      expect(blueprintMarkdown).toContain('CourseMapper Compact Blueprint Review');
      expect(blueprintMarkdown).toContain('External Field Methods Studio');
      expect(blueprintMarkdown).toContain('Field memo checkpoint 1');
      expect(fullMarkdown).toContain('CourseMapper Full Compiled Package Review');
      expect(fullMarkdown).toContain('External Field Methods Studio');
      expect(combinedFixture.fixtures).toHaveLength(2);
      expect(combinedFixture.fixtures[0].project.courseMap.courseName).toBe('External Field Methods Studio');
      expect(combinedFixture.fixtures[0].blueprintQualityReview.lessonReviews).toHaveLength(3);
      expect(combinedFixture.fixtures[1].project.courseMap.lessons).toHaveLength(3);
      expect(recommendedStrictBundle.fixtures).toHaveLength(2);
      expect(recommendedStrictBundle.fixtures[0].project.courseMap.courseName).toBe('External Field Methods Studio');
      expect(manifest.summary.externalProjectSampleCount).toBe(1);
      expect(manifest.proofCollectionPlan.availableExternalProjectSamples).toBe(1);
      expect(manifest.reviewerCompletionChecklist.globalItems).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'real-external-project', status: 'missing' })]),
      );
      expect(reviewerCompletionChecklist.perSample[0]).toMatchObject({
        sampleId: 'external-field-methods-project',
        projectSource: 'external-project',
      });
      expect(manifest.samples[0].projectSource).toBe('external-project');
      expect(manifest.samples[0].sourceInput.markdownPath).toBe(paths.sourceInputPaths[0].markdownPath);
      expect(manifest.samples[0].blueprintFiles.markdownPath).toBe(paths.blueprintPaths[0].markdownPath);
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('rejects placeholder external project course maps before generating reviewer packets', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coursemapper-placeholder-project-packet-'));
    const fixturePath = path.join(outputDir, 'external-project-fixtures.json');
    const placeholderFixture = makeExternalProjectFixture();
    placeholderFixture.project.courseMap.courseName = 'Replace with real reviewed course name';

    await fs.writeFile(fixturePath, `${JSON.stringify({ fixtures: [placeholderFixture] }, null, 2)}\n`);

    await expect(
      buildExternalQualityProofPacket({
        runtime: {},
        fixturePath,
        includeDefaultSamples: false,
        packageVersion: '0.8.0-test',
      }),
    ).rejects.toThrow(/placeholder course-map text.*project\.courseMap\.courseName/i);
  });

  it('rejects external-only packet generation when no real project course map is supplied', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coursemapper-missing-project-packet-'));
    const fixturePath = path.join(outputDir, 'curated-only-fixtures.json');

    await fs.writeFile(
      fixturePath,
      `${JSON.stringify({ fixtures: [{ id: 'curated-review-only', sampleId: 'gold-research-methods-8' }] }, null, 2)}\n`,
    );

    await expect(
      buildExternalQualityProofPacket({
        runtime: {},
        fixturePath,
        includeDefaultSamples: false,
        packageVersion: '0.8.0-test',
      }),
    ).rejects.toThrow(/No external project\.courseMap fixtures were found/i);
  });

  it('keeps the static expert-review fixture template aligned with the strict proof contract', async () => {
    const templatePath = path.join(process.cwd(), 'docs', 'expert-review-fixture.template.json');
    const template = JSON.parse(await fs.readFile(templatePath, 'utf8'));
    const fixtures = template.fixtures || [];

    expect(fixtures.length).toBeGreaterThanOrEqual(4);
    expect(fixtures.every((fixture) => fixture.templateOnly === true)).toBe(true);
    expect(fixtures.every((fixture) => fixture.evidenceType === 'external')).toBe(true);
    expect(fixtures.every((fixture) => fixture.reviewEvidence?.courseModality)).toBe(true);
    expect(fixtures.every((fixture) => fixture.reviewEvidence?.proofScopeTags?.length > 0)).toBe(true);

    const reviewFixtures = fixtures.filter((fixture) => fixture.reviewScorecard);
    expect(reviewFixtures.length).toBeGreaterThan(0);

    for (const fixture of reviewFixtures) {
      expect(fixture.reviewScorecard.dimensions.map((dimension) => dimension.id)).toEqual(
        REQUIRED_SCORECARD_DIMENSION_IDS,
      );
      expect(
        fixture.reviewScorecard.dimensions.every(
          (dimension) =>
            dimension.reviewPrompt?.length > 40 &&
            dimension.evidenceArtifacts?.length > 0 &&
            dimension.evidenceExamples?.length > 0 &&
            dimension.notes?.length > 0,
        ),
      ).toBe(true);
      expect(fixture.sourceFidelityReview.artifactReviews.map((row) => row.featureId)).toEqual(CORE_ARTIFACT_IDS);
      expect(
        fixture.sourceFidelityReview.artifactReviews.every(
          (row) =>
            row.sourceCompared === false &&
            row.packageCompared === false &&
            row.sourceSignalsPreserved === null &&
            row.compilerDecisionVisible === null &&
            row.publishGateVisible === null &&
            row.modelUsePolicyVisible === null &&
            row.handoffReviewFocusVisible === null &&
            row.localReviewActionVisible === null &&
            row.unsupportedInventionRisk === null &&
            row.notes?.includes('source course map') &&
            row.notes?.includes('compiler decision') &&
            row.notes?.includes('publish-before-use action'),
        ),
      ).toBe(true);
      expect(fixture.blueprintQualityReview).toMatchObject({
        blueprintReviewed: false,
        sourceInputReviewed: false,
        compactRepresentationReviewed: false,
      });
      expect(fixture.blueprintQualityReview.lessonReviews.length).toBeGreaterThan(0);
      expect(
        fixture.blueprintQualityReview.lessonReviews.every(
          (row) =>
            row.sourceCompared === false &&
            row.blueprintCompared === false &&
            row.sourceSignalsPreserved === null &&
            row.assessmentPreserved === null &&
            row.alignmentUsable === null &&
            row.notes?.includes('compact blueprint'),
        ),
      ).toBe(true);
      expect(fixture.assumptionLedgerReview.reviewedRows.length).toBeGreaterThan(0);
      expect(fixture.assumptionLedgerReview.reviewedRows.every((row) => row.decision === null && row.notes)).toBe(true);
      expect(fixture.assumptionLedgerReview.notes).toContain('blueprint assumptions');
    }

    const editFixtures = fixtures.filter((fixture) => fixture.editHistoryEvidenceType === 'external');
    expect(editFixtures.length).toBeGreaterThan(0);
    expect(
      editFixtures.every(
        (fixture) =>
          fixture.instructorEditPatterns?.length > 0 &&
          fixture.instructorEditPatterns.every(
            (pattern) =>
              pattern.featureId && pattern.field && pattern.action && pattern.before && pattern.after && pattern.notes,
          ),
      ),
    ).toBe(true);

    const realProjectFixtures = fixtures.filter((fixture) => fixture.project?.courseMap);
    expect(realProjectFixtures.length).toBeGreaterThanOrEqual(2);
    expect(realProjectFixtures.some((fixture) => fixture.reviewScorecard)).toBe(true);
    expect(realProjectFixtures.some((fixture) => fixture.editHistoryEvidenceType === 'external')).toBe(true);
  });

  it('keeps the external proof docs scorecard example evidence-anchored', async () => {
    const docsPath = path.join(process.cwd(), 'docs', 'EXTERNAL_QUALITY_PROOF.md');
    const docs = await fs.readFile(docsPath, 'utf8');
    const exampleMatch = docs.match(/Example:\n\n```json\n([\s\S]*?)\n```/);

    expect(exampleMatch).toBeTruthy();
    const example = JSON.parse(exampleMatch[1]);
    const dimensions = example.reviewScorecard?.dimensions || [];

    expect(dimensions.map((dimension) => dimension.id)).toEqual(REQUIRED_SCORECARD_DIMENSION_IDS);
    expect(
      dimensions.every(
        (dimension) =>
          Number(dimension.score) >= 4.5 &&
          dimension.evidenceArtifacts?.length > 0 &&
          dimension.evidenceExamples?.length > 0 &&
          dimension.evidenceExamples.every((evidence) => evidence.length > 40) &&
          dimension.notes?.length > 0,
      ),
    ).toBe(true);
  });

  it('keeps the external proof docs fidelity and assumption examples complete', async () => {
    const docsPath = path.join(process.cwd(), 'docs', 'EXTERNAL_QUALITY_PROOF.md');
    const docs = await fs.readFile(docsPath, 'utf8');
    const sourceFidelityMatch = docs.match(/Source-fidelity example:\n\n```json\n([\s\S]*?)\n```/);
    const blueprintQualityMatch = docs.match(/Blueprint-quality example:\n\n```json\n([\s\S]*?)\n```/);
    const assumptionLedgerMatch = docs.match(/Assumption-ledger example:\n\n```json\n([\s\S]*?)\n```/);

    expect(sourceFidelityMatch).toBeTruthy();
    expect(blueprintQualityMatch).toBeTruthy();
    expect(assumptionLedgerMatch).toBeTruthy();

    const sourceFidelity = JSON.parse(sourceFidelityMatch[1]).sourceFidelityReview;
    expect(sourceFidelity).toMatchObject({
      sourceInputReviewed: true,
      compiledPackageReviewed: true,
      lessonOrderPreserved: true,
      assessmentsPreserved: true,
      unsupportedInventionRisk: 'low',
    });
    expect(sourceFidelity.artifactReviews.map((row) => row.featureId)).toEqual(CORE_ARTIFACT_IDS);
    expect(
      sourceFidelity.artifactReviews.every(
        (row) =>
          row.sourceCompared === true &&
          row.packageCompared === true &&
          row.sourceSignalsPreserved === true &&
          row.compilerDecisionVisible === true &&
          row.publishGateVisible === true &&
          row.modelUsePolicyVisible === true &&
          row.handoffReviewFocusVisible === true &&
          row.localReviewActionVisible === true &&
          row.unsupportedInventionRisk === 'low' &&
          row.notes?.length > 40,
      ),
    ).toBe(true);
    expect(sourceFidelity.notes.length).toBeGreaterThan(80);

    const blueprintQuality = JSON.parse(blueprintQualityMatch[1]).blueprintQualityReview;
    expect(blueprintQuality).toMatchObject({
      blueprintReviewed: true,
      sourceInputReviewed: true,
      compactRepresentationReviewed: true,
      sourceSignalsPreserved: true,
      assessmentsPreserved: true,
      alignmentUsable: true,
      unresolvedBlueprintRisk: 'low',
    });
    expect(blueprintQuality.lessonReviews.length).toBeGreaterThanOrEqual(2);
    expect(
      blueprintQuality.lessonReviews.every(
        (row) =>
          Number.isFinite(row.lessonNumber) &&
          row.sourceCompared === true &&
          row.blueprintCompared === true &&
          row.sourceSignalsPreserved === true &&
          row.assessmentPreserved === true &&
          row.alignmentUsable === true &&
          row.reviewRequiredFlagsVisible === true &&
          row.notes?.length > 80,
      ),
    ).toBe(true);
    expect(blueprintQuality.notes.length).toBeGreaterThan(100);

    const assumptionLedger = JSON.parse(assumptionLedgerMatch[1]).assumptionLedgerReview;
    expect(assumptionLedger).toMatchObject({
      assumptionLedgerReviewed: true,
      reviewRequiredRowsReviewed: true,
      unresolvedAssumptionRisk: 'low',
    });
    expect(assumptionLedger.categoriesReviewed).toEqual(REQUIRED_ASSUMPTION_CATEGORIES);
    expect(assumptionLedger.reviewedRows.map((row) => row.category)).toEqual(REQUIRED_ASSUMPTION_CATEGORIES);
    expect(
      assumptionLedger.reviewedRows.every((row) => row.coverage && row.decision?.length > 12 && row.notes?.length > 40),
    ).toBe(true);
    expect(assumptionLedger.notes.length).toBeGreaterThan(80);
  });
});
