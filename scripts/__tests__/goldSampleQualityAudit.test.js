import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it as vitestIt } from 'vitest';

import {
  DEFAULT_GOLD_SAMPLES,
  auditGoldSample,
  buildGoldSampleQualityAudit,
  closeHybridPipelineAuditRuntime,
  loadHybridPipelineAuditRuntime,
  renderGoldSampleQualityAuditMarkdown,
  writeGoldSampleQualityAudit,
} from '../goldSampleQualityAudit.mjs';

const GOLD_AUDIT_CASE_TIMEOUT_MS = 15000;
const GOLD_AUDIT_FULL_MATRIX_TIMEOUT_MS = 600000;
const it = (name, testFn, timeout = GOLD_AUDIT_CASE_TIMEOUT_MS) => vitestIt(name, testFn, timeout);

describe('gold sample quality audit', () => {
  it(
    'passes curated gold expectation fixtures across course types',
    async () => {
      const runtime = await loadHybridPipelineAuditRuntime();
      try {
        const payload = await buildGoldSampleQualityAudit({
          runtime,
          samples: DEFAULT_GOLD_SAMPLES,
        });
        const markdown = renderGoldSampleQualityAuditMarkdown(payload);

        expect(payload.summary.status).toBe('pass');
        expect(payload.summary.goldSampleCount).toBe(40);
        expect(payload.summary.scopeCoverageStatus).toBe('pass');
        expect(payload.summary.coveredScopes).toEqual(expect.arrayContaining([5, 8, 14]));
        expect(payload.summary.missingScopes).toEqual([]);
        expect(payload.summary.missingScopeModalityCoverage).toEqual([]);
        expect(payload.scopeCoverage).toMatchObject({
          status: 'pass',
          requiredScopes: [5, 8, 14],
          minModalitiesPerRequiredScope: 3,
          missingScopes: [],
          missingModalityScopes: [],
          modalityCounts: {
            5: 3,
            14: 3,
          },
        });
        expect(payload.results.map((result) => result.sampleId)).toEqual([
          'gold-research-methods-8',
          'gold-research-methods-short-5',
          'gold-research-methods-semester-14',
          'gold-ai-course-design-8',
          'gold-ai-course-design-short-5',
          'gold-ai-course-design-semester-14',
          'gold-community-health-8',
          'gold-community-health-short-5',
          'gold-community-health-semester-14',
          'gold-interaction-design-studio-8',
          'gold-spanish-healthcare-8',
          'gold-clinical-judgment-8',
          'gold-clinical-placement-8',
          'gold-beginning-spanish-8',
          'gold-field-placement-8',
          'gold-biology-lab-8',
          'gold-multi-section-seminar-8',
          'gold-online-writing-workshop-8',
          'gold-quantitative-problem-set-8',
          'gold-statistics-inference-8',
          'gold-accounting-finance-8',
          'gold-policy-analysis-8',
          'gold-economics-analysis-8',
          'gold-ethics-argument-8',
          'gold-proof-seminar-8',
          'gold-lecture-exam-8',
          'gold-capstone-project-8',
          'gold-competency-assessment-8',
          'gold-performing-arts-8',
          'gold-programming-lab-8',
          'gold-data-science-lab-8',
          'gold-engineering-design-8',
          'gold-creative-writing-8',
          'gold-business-strategy-case-8',
          'gold-constitutional-law-8',
          'gold-information-literacy-8',
          'gold-teacher-preparation-8',
          'gold-counseling-practice-8',
          'gold-sparse-assessment-resilience-8',
          'gold-messy-clinical-resilience-8',
        ]);
        expect(payload.results.every((result) => result.enrichmentSource === 'curated-gold-sample-enrichment')).toBe(
          true,
        );
        expect(
          payload.results.every(
            (result) =>
              result.blueprintMaturity.status === 'pass' && result.blueprintMaturity.confidenceLevel === 'high',
          ),
        ).toBe(true);
        expect(
          payload.results.every(
            (result) =>
              result.blueprintMaturity.compilerPath?.source === 'deterministic-blueprint' &&
              result.blueprintMaturity.compilerPath?.deterministicCompiler === true,
          ),
        ).toBe(true);
        expect(
          payload.results.every(
            (result) =>
              result.blueprintMaturity.adaptiveSafety?.modelFallback ===
                'not used for blueprint-compiled deliverables' &&
              ['ready-with-spot-check', 'review-required'].includes(result.blueprintMaturity.adaptiveSafety?.status),
          ),
        ).toBe(true);
        expect(
          payload.results.every(
            (result) =>
              result.blueprintMaturity.compilerDecisionMatrix?.deterministicCompiler === true &&
              result.blueprintMaturity.compilerDecisionMatrix?.modelFallback ===
                'not used for blueprint-compiled deliverables' &&
              result.blueprintMaturity.compilerDecisionMatrix?.lessonRows?.length === result.scope,
          ),
        ).toBe(true);
        expect(
          payload.results.every(
            (result) =>
              result.blueprintMaturity.sourceRiskRegister?.status &&
              result.blueprintMaturity.sourceRiskRegister?.lessonRows?.length === result.scope,
          ),
        ).toBe(true);
        expect(
          payload.results.every(
            (result) =>
              result.blueprintMaturity.sourceConflictReport?.status &&
              result.blueprintMaturity.sourceConflictReport?.lessonRows?.length === result.scope,
          ),
        ).toBe(true);
        expect(
          payload.results.every(
            (result) =>
              result.blueprintMaturity.blueprintAssumptionLedger?.status &&
              result.blueprintMaturity.blueprintAssumptionLedger?.rows?.some(
                (row) => row.category === 'handoff-boundary',
              ),
          ),
        ).toBe(true);
        expect(
          payload.results.every(
            (result) =>
              result.blueprintMaturity.blueprintReviewSurface?.instructionalMoveDecode?.status === 'reviewable' &&
              result.blueprintMaturity.blueprintReviewSurface?.traceabilitySummary?.instructionalMoveRows ===
                result.scope,
          ),
        ).toBe(true);
        expect(
          payload.results.every(
            (result) =>
              result.blueprintMaturity.timingStatus === 'fits-session' &&
              result.blueprintMaturity.averagePlannedClassMinutes === 110,
          ),
        ).toBe(true);
        expect(
          payload.results.every(
            (result) =>
              result.blueprintMaturity.assessmentArchitecture?.status === 'balanced' &&
              result.blueprintMaturity.assessmentArchitecture?.totalWeightPercent === 100 &&
              result.blueprintMaturity.assessmentArchitecture?.weightSourceStatus &&
              result.blueprintMaturity.assessmentArchitecture?.weightConfirmationPolicy,
          ),
        ).toBe(true);
        expect(
          payload.results.find((result) => result.sampleId === 'gold-sparse-assessment-resilience-8').blueprintMaturity
            .sourceRiskRegister.highRiskCount,
        ).toBeGreaterThan(0);
        expect(payload.results.every((result) => result.featureResults.length === 9)).toBe(true);
        expect(payload.results.every((result) => result.summary.minQuality >= 9)).toBe(true);
        expect(payload.results.every((result) => result.summary.minExcellence >= 9)).toBe(true);
        expect(payload.summary.enrichmentImpactCount).toBe(40);
        expect(payload.summary.enrichmentJustifiedCount).toBe(40);
        expect(payload.summary.minEnrichmentPhraseCoverage).toBeGreaterThanOrEqual(0.75);
        expect(payload.summary.minDeterministicBaselineQuality).toBeGreaterThanOrEqual(9);
        expect(payload.results.every((result) => result.enrichmentImpact.status === 'pass')).toBe(true);
        expect(payload.results.every((result) => result.enrichmentImpact.justifiesEnrichmentCall)).toBe(true);
        expect(payload.results.every((result) => result.enrichmentImpact.phraseLift > 0)).toBe(true);
        expect(payload.results.every((result) => result.enrichmentImpact.baselineMinQuality >= 9)).toBe(true);
        expect(
          payload.results.every((result) => result.enrichmentImpact.baselineCompilerContractStatus === 'pass'),
        ).toBe(true);
        expect(payload.results.every((result) => result.enrichmentImpact.baselineFidelityFindings === 0)).toBe(true);
        expect(payload.results.every((result) => result.classroomExcellence.dimensions.length >= 6)).toBe(true);
        expect(
          payload.results.every((result) =>
            result.classroomExcellence.dimensions.some((dimension) =>
              dimension.checks?.some(
                (check) => check.label.includes('compiler decisions and publish gates') && check.pass,
              ),
            ),
          ),
        ).toBe(true);
        expect(
          payload.results.every((result) =>
            result.classroomExcellence.dimensions.every((dimension) => dimension.score >= 9),
          ),
        ).toBe(true);
        expect(
          payload.results.find((result) => result.sampleId === 'gold-sparse-assessment-resilience-8').blueprintMaturity
            .reviewFlagCount,
        ).toBeGreaterThan(0);
        expect(
          payload.results.find((result) => result.sampleId === 'gold-messy-clinical-resilience-8').blueprintMaturity
            .sourceGroundedLessonCount,
        ).toBeLessThan(8);
        expect(payload.results.every((result) => result.alignmentSummary.blueprintRows === result.scope)).toBe(true);
        expect(payload.results.every((result) => result.alignmentSummary.blueprintAlignmentFindings === 0)).toBe(true);
        expect(payload.results.every((result) => result.alignmentSummary.compiledAlignmentFindings === 0)).toBe(true);
        expect(payload.results.every((result) => result.sourceFidelitySummary.status === 'pass')).toBe(true);
        expect(payload.results.every((result) => result.sourceFidelitySummary.sourceRows === result.scope)).toBe(true);
        expect(payload.results.every((result) => result.sourceFidelitySummary.blueprintFindings === 0)).toBe(true);
        expect(payload.results.every((result) => result.sourceFidelitySummary.compiledFindings === 0)).toBe(true);
        expect(payload.results.every((result) => result.decodeLosslessnessSummary.status === 'pass')).toBe(true);
        expect(payload.results.every((result) => result.decodeLosslessnessSummary.lessonRows === result.scope)).toBe(
          true,
        );
        expect(payload.results.every((result) => result.decodeLosslessnessSummary.checkedFeatures === 9)).toBe(true);
        expect(payload.results.every((result) => result.decodeLosslessnessSummary.minBlueprintCoverage >= 0.45)).toBe(
          true,
        );
        expect(payload.results.every((result) => result.decodeLosslessnessSummary.minCompiledCoverage >= 0.6)).toBe(
          true,
        );
        expect(payload.results.every((result) => result.decodeLosslessnessSummary.blueprintFindings === 0)).toBe(true);
        expect(payload.results.every((result) => result.decodeLosslessnessSummary.compiledFindings === 0)).toBe(true);
        expect(
          payload.results.every((result) =>
            result.decodeLosslessness.rows.every(
              (row) => row.featuresWithSourceSignal === row.checkedFeatures && row.sourceSignalCount >= 12,
            ),
          ),
        ).toBe(true);
        expect(payload.results.every((result) => result.teachingIntentSummary.status === 'pass')).toBe(true);
        expect(payload.results.every((result) => result.teachingIntentSummary.lessonRows === result.scope)).toBe(true);
        expect(payload.results.every((result) => result.teachingIntentSummary.blueprintFindings === 0)).toBe(true);
        expect(payload.results.every((result) => result.teachingIntentSummary.compiledFindings === 0)).toBe(true);
        expect(payload.results.every((result) => result.instructionalMoveSummary.status === 'pass')).toBe(true);
        expect(payload.results.every((result) => result.instructionalMoveSummary.lessonRows === result.scope)).toBe(
          true,
        );
        expect(payload.results.every((result) => result.instructionalMoveSummary.checkedFeatures === 2)).toBe(true);
        expect(payload.results.every((result) => result.instructionalMoveSummary.blueprintFindings === 0)).toBe(true);
        expect(payload.results.every((result) => result.instructionalMoveSummary.compiledFindings === 0)).toBe(true);
        expect(
          payload.results.every((result) =>
            result.instructionalMoves.rows.every(
              (row) =>
                row.checkedFeatures === 2 &&
                row.propagatedMoveCount === row.checkedFeatures * 5 &&
                row.compiledFindingCount === 0,
            ),
          ),
        ).toBe(true);
        expect(payload.results.every((result) => result.modalityFitSummary.status === 'pass')).toBe(true);
        expect(payload.results.every((result) => result.modalityFitSummary.lessonRows === result.scope)).toBe(true);
        expect(
          Object.fromEntries(payload.results.map((result) => [result.sampleId, result.modalityFitSummary.primaryMode])),
        ).toMatchObject({
          'gold-research-methods-8': 'applied-lab',
          'gold-research-methods-short-5': 'applied-lab',
          'gold-research-methods-semester-14': 'applied-lab',
          'gold-ai-course-design-8': 'studio-lab',
          'gold-ai-course-design-short-5': 'studio-lab',
          'gold-ai-course-design-semester-14': 'studio-lab',
          'gold-community-health-8': 'field-applied',
          'gold-community-health-short-5': 'field-applied',
          'gold-community-health-semester-14': 'field-applied',
          'gold-interaction-design-studio-8': 'studio-lab',
          'gold-spanish-healthcare-8': 'clinical-simulation',
          'gold-clinical-judgment-8': 'clinical-judgment-simulation',
          'gold-clinical-placement-8': 'clinical-placement-practicum',
          'gold-beginning-spanish-8': 'world-language',
          'gold-field-placement-8': 'field-applied',
          'gold-biology-lab-8': 'applied-lab',
          'gold-multi-section-seminar-8': 'interpretive-humanities',
          'gold-online-writing-workshop-8': 'online-hybrid',
          'gold-quantitative-problem-set-8': 'weekly-applied-seminar',
          'gold-statistics-inference-8': 'statistics-inference',
          'gold-accounting-finance-8': 'accounting-finance-analysis',
          'gold-policy-analysis-8': 'policy-analysis',
          'gold-economics-analysis-8': 'economics-analysis',
          'gold-ethics-argument-8': 'ethics-argumentation',
          'gold-proof-seminar-8': 'proof-seminar',
          'gold-lecture-exam-8': 'lecture-exam',
          'gold-capstone-project-8': 'capstone-project',
          'gold-competency-assessment-8': 'competency-based',
          'gold-performing-arts-8': 'performing-arts',
          'gold-programming-lab-8': 'programming-lab',
          'gold-data-science-lab-8': 'data-science-lab',
          'gold-engineering-design-8': 'engineering-design-lab',
          'gold-creative-writing-8': 'creative-studio',
          'gold-business-strategy-case-8': 'case-method',
          'gold-constitutional-law-8': 'legal-doctrinal',
          'gold-sparse-assessment-resilience-8': 'applied-lab',
          'gold-messy-clinical-resilience-8': 'clinical-simulation',
        });
        expect(
          payload.results.every((result) =>
            result.modalityFit.rows.every((row) => row.modalityDecode && row.modalityDecode.length > 20),
          ),
        ).toBe(true);
        expect(payload.results.every((result) => result.modalityFitSummary.blueprintFindings === 0)).toBe(true);
        expect(payload.results.every((result) => result.modalityFitSummary.compiledFindings === 0)).toBe(true);
        expect(payload.results.every((result) => result.artifactGenreSummary.status === 'pass')).toBe(true);
        expect(payload.results.every((result) => result.artifactGenreSummary.lessonRows === result.scope)).toBe(true);
        expect(payload.results.every((result) => result.artifactGenreSummary.expectedRows === result.scope)).toBe(true);
        expect(
          payload.results.every(
            (result) => result.artifactGenreSummary.expectedMatches === result.artifactGenreSummary.expectedRows,
          ),
        ).toBe(true);
        expect(payload.results.every((result) => result.artifactGenreSummary.blueprintFindings === 0)).toBe(true);
        expect(payload.results.every((result) => result.artifactGenreSummary.compiledFindings === 0)).toBe(true);
        expect(
          payload.results.every((result) =>
            result.artifactGenre.rows.every((row) => row.genre && row.genre !== 'missing' && row.outputFormat),
          ),
        ).toBe(true);
        expect(payload.results.every((result) => result.sessionFeasibilitySummary.status === 'pass')).toBe(true);
        expect(payload.results.every((result) => result.sessionFeasibilitySummary.lessonRows === result.scope)).toBe(
          true,
        );
        expect(payload.results.every((result) => result.sessionFeasibilitySummary.blueprintFindings === 0)).toBe(true);
        expect(payload.results.every((result) => result.sessionFeasibilitySummary.compiledFindings === 0)).toBe(true);
        expect(
          payload.results.every((result) =>
            result.sessionFeasibility.rows.every(
              (row) => row.status === 'fits-session' && row.plannedClassMinutes === row.sessionMinutes,
            ),
          ),
        ).toBe(true);
        expect(payload.results.every((result) => result.assessmentArchitectureSummary.status === 'pass')).toBe(true);
        expect(
          payload.results.every((result) => result.assessmentArchitectureSummary.lessonRows === result.scope),
        ).toBe(true);
        expect(payload.results.every((result) => result.assessmentArchitectureSummary.totalWeightPercent === 100)).toBe(
          true,
        );
        expect(payload.results.every((result) => result.assessmentArchitectureSummary.blueprintFindings === 0)).toBe(
          true,
        );
        expect(payload.results.every((result) => result.assessmentArchitectureSummary.compiledFindings === 0)).toBe(
          true,
        );
        expect(payload.results.every((result) => result.criterionWeightingSummary.status === 'pass')).toBe(true);
        expect(payload.results.every((result) => result.criterionWeightingSummary.lessonRows === result.scope)).toBe(
          true,
        );
        expect(payload.results.every((result) => result.criterionWeightingSummary.blueprintFindings === 0)).toBe(true);
        expect(payload.results.every((result) => result.criterionWeightingSummary.compiledFindings === 0)).toBe(true);
        expect(
          payload.results.every((result) =>
            result.criterionWeighting.rows.every(
              (row) => row.totalWeight === 100 && row.weightCue.includes('source-grounded concept evidence'),
            ),
          ),
        ).toBe(true);
        expect(payload.results.every((result) => result.conceptGraphSummary.status === 'pass')).toBe(true);
        expect(payload.results.every((result) => result.conceptGraphSummary.lessonRows === result.scope)).toBe(true);
        expect(payload.results.every((result) => result.conceptGraphSummary.nodeCount === result.scope)).toBe(true);
        expect(payload.results.every((result) => result.conceptGraphSummary.edgeCount >= 7)).toBe(true);
        expect(payload.results.every((result) => result.conceptGraphSummary.blueprintFindings === 0)).toBe(true);
        expect(payload.results.every((result) => result.conceptGraphSummary.compiledFindings === 0)).toBe(true);
        expect(
          payload.results.every((result) =>
            result.conceptGraph.rows.every((row) => row.concept && row.edgeCount > 0 && row.checkedFeatures === 9),
          ),
        ).toBe(true);
        expect(payload.results.every((result) => result.masteryEvidenceSummary.status === 'pass')).toBe(true);
        expect(payload.results.every((result) => result.masteryEvidenceSummary.lessonRows === result.scope)).toBe(true);
        expect(payload.results.every((result) => result.masteryEvidenceSummary.checkedStages >= 6)).toBe(true);
        expect(payload.results.every((result) => result.masteryEvidenceSummary.blueprintFindings === 0)).toBe(true);
        expect(payload.results.every((result) => result.masteryEvidenceSummary.compiledFindings === 0)).toBe(true);
        expect(
          payload.results.every((result) =>
            result.masteryEvidence.rows.every((row) => row.evidenceStages >= 6 && row.checkedFeatures === 9),
          ),
        ).toBe(true);
        expect(payload.results.every((result) => result.evidenceResponseSummary.status === 'pass')).toBe(true);
        expect(payload.results.every((result) => result.evidenceResponseSummary.lessonRows === result.scope)).toBe(
          true,
        );
        expect(payload.results.every((result) => result.evidenceResponseSummary.checkedStates >= 3)).toBe(true);
        expect(payload.results.every((result) => result.evidenceResponseSummary.blueprintFindings === 0)).toBe(true);
        expect(payload.results.every((result) => result.evidenceResponseSummary.compiledFindings === 0)).toBe(true);
        expect(
          payload.results.every((result) =>
            result.evidenceResponse.rows.every((row) => row.decisionStates >= 3 && row.checkedFeatures === 9),
          ),
        ).toBe(true);
        expect(payload.results.every((result) => result.fidelitySummary.checkedFeatures === 9)).toBe(true);
        expect(payload.results.every((result) => result.fidelitySummary.findings === 0)).toBe(true);
        expect(markdown).toContain('CourseMapper Gold-Sample Quality Audit');
        expect(markdown).toContain('gold-ai-course-design-8');
        expect(markdown).toContain('gold-ai-course-design-short-5');
        expect(markdown).toContain('gold-ai-course-design-semester-14');
        expect(markdown).toContain('gold-community-health-8');
        expect(markdown).toContain('gold-community-health-short-5');
        expect(markdown).toContain('gold-community-health-semester-14');
        expect(markdown).toContain('gold-interaction-design-studio-8');
        expect(markdown).toContain('gold-spanish-healthcare-8');
        expect(markdown).toContain('gold-clinical-judgment-8');
        expect(markdown).toContain('gold-clinical-placement-8');
        expect(markdown).toContain('gold-beginning-spanish-8');
        expect(markdown).toContain('gold-field-placement-8');
        expect(markdown).toContain('gold-biology-lab-8');
        expect(markdown).toContain('gold-multi-section-seminar-8');
        expect(markdown).toContain('gold-online-writing-workshop-8');
        expect(markdown).toContain('gold-quantitative-problem-set-8');
        expect(markdown).toContain('gold-statistics-inference-8');
        expect(markdown).toContain('gold-accounting-finance-8');
        expect(markdown).toContain('gold-policy-analysis-8');
        expect(markdown).toContain('gold-economics-analysis-8');
        expect(markdown).toContain('gold-ethics-argument-8');
        expect(markdown).toContain('gold-proof-seminar-8');
        expect(markdown).toContain('gold-lecture-exam-8');
        expect(markdown).toContain('gold-capstone-project-8');
        expect(markdown).toContain('gold-competency-assessment-8');
        expect(markdown).toContain('gold-performing-arts-8');
        expect(markdown).toContain('gold-programming-lab-8');
        expect(markdown).toContain('gold-data-science-lab-8');
        expect(markdown).toContain('gold-engineering-design-8');
        expect(markdown).toContain('gold-creative-writing-8');
        expect(markdown).toContain('gold-business-strategy-case-8');
        expect(markdown).toContain('gold-constitutional-law-8');
        expect(markdown).toContain('gold-messy-clinical-resilience-8');
        expect(markdown).toContain('Blueprint Maturity Matrix');
        expect(markdown).toContain('Source Conflicts');
        expect(markdown).toContain('Assumption Ledger');
        expect(markdown).toContain('Source-Grounded Lessons');
        expect(markdown).toContain('Source Risk');
        expect(markdown).toContain('Avg Live Minutes');
        expect(markdown).toContain('Blueprint Review Surface Matrix');
        expect(markdown).toContain('Traceability');
        expect(markdown).toContain('Instructional Moves');
        expect(markdown).toContain('Move Rows');
        expect(markdown).toContain('Source-Review Lessons');
        expect(markdown).toContain('Untraceable Rows');
        expect(markdown).toContain('Instructional Alignment Matrix');
        expect(markdown).toContain('Source Fidelity Matrix');
        expect(markdown).toContain('Blueprint Decode Losslessness Matrix');
        expect(markdown).toContain('Teaching Intent Matrix');
        expect(markdown).toContain('Instructional Move Propagation Matrix');
        expect(markdown).toContain('Modality Fit Matrix');
        expect(markdown).toContain('Artifact Genre Matrix');
        expect(markdown).toContain('Gold Matches');
        expect(markdown).toContain('Session Feasibility Matrix');
        expect(markdown).toContain('Assessment Architecture Matrix');
        expect(markdown).toContain('Criterion Weighting Matrix');
        expect(markdown).toContain('Concept Dependency Graph Matrix');
        expect(markdown).toContain('Mastery Evidence Matrix');
        expect(markdown).toContain('Evidence Response Matrix');
        expect(markdown).toContain('Blueprint Fidelity Matrix');
        expect(markdown).toContain('Enrichment Impact Matrix');
        expect(markdown).toContain('Minimum deterministic baseline quality');
        expect(markdown).toContain('Baseline Contract');
        expect(markdown).toContain('Classroom Excellence Matrix');
        expect(markdown).toContain('Feature Gold Gate Matrix');
        expect(markdown).toContain('Gold samples are curated expectation fixtures');
      } finally {
        await closeHybridPipelineAuditRuntime();
      }
    },
    GOLD_AUDIT_FULL_MATRIX_TIMEOUT_MS,
  );

  it('blocks when a gold expectation is missing', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const sample = {
        ...DEFAULT_GOLD_SAMPLES[0],
        id: 'missing-expectation-fixture',
        expectations: {
          ...DEFAULT_GOLD_SAMPLES[0].expectations,
          features: {
            ...DEFAULT_GOLD_SAMPLES[0].expectations.features,
            slideDecks: {
              ...DEFAULT_GOLD_SAMPLES[0].expectations.features.slideDecks,
              mustMatch: [/impossible gold phrase 177981/i],
            },
          },
        },
      };

      const result = auditGoldSample({ sample, runtime });

      expect(result.summary.status).toBe('blocked');
      expect(result.findings.some((finding) => finding.check === 'mustMatch')).toBe(true);
      expect(result.findings.some((finding) => finding.message.includes('impossible gold phrase'))).toBe(true);
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  }, 180000);

  it('blocks when artifact-genre classification misses the gold expectation', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const sample = {
        ...DEFAULT_GOLD_SAMPLES[0],
        id: 'wrong-artifact-genre-fixture',
        expectations: {
          ...DEFAULT_GOLD_SAMPLES[0].expectations,
          artifactGenres: ['performance-simulation', ...DEFAULT_GOLD_SAMPLES[0].expectations.artifactGenres.slice(1)],
        },
      };

      const result = auditGoldSample({ sample, runtime });

      expect(result.summary.status).toBe('blocked');
      expect(result.artifactGenreSummary.expectedMatches).toBe(7);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'artifactGenreGoldExpectation',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when modality classification misses the gold expectation', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const communityHealthSample = DEFAULT_GOLD_SAMPLES.find((sample) => sample.id === 'gold-community-health-8');
      const sample = {
        ...communityHealthSample,
        id: 'wrong-modality-fixture',
        expectations: {
          ...communityHealthSample.expectations,
          courseModality: 'clinical-simulation',
        },
      };

      const result = auditGoldSample({ sample, runtime });

      expect(result.summary.status).toBe('blocked');
      expect(result.modalityFitSummary.primaryMode).toBe('field-applied');
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'modalityGoldExpectation',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the deterministic baseline needs enrichment to meet the quality floor', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    let averageScoreCalls = 0;
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          computeAvgScore: (...args) => {
            averageScoreCalls += 1;
            return averageScoreCalls === 1 ? 2 : runtime.computeAvgScore(...args);
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.enrichmentImpact.baselineMinQuality).toBe(2);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'enrichment',
            check: 'deterministicBaselineQuality',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the compiler contract is not passing', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => ({
            ...runtime.buildCourseBlueprint(...args),
            compilerContract: {
              status: 'blocked',
              blockerCount: 1,
              warningCount: 0,
              findings: [{ severity: 'blocker', code: 'sourceAnchors' }],
            },
          }),
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.compilerContract.status).toBe('blocked');
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'compilerContract',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the blueprint review surface is missing', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => ({
            ...runtime.buildCourseBlueprint(...args),
            blueprintReviewSurface: null,
          }),
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.blueprintReviewSurface).toBeNull();
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'blueprintReviewSurface',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when blueprint review-surface rows are not traceable to source evidence', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              blueprintReviewSurface: {
                ...blueprint.blueprintReviewSurface,
                traceabilitySummary: {
                  ...blueprint.blueprintReviewSurface.traceabilitySummary,
                  status: 'needs-review',
                  traceableRows: blueprint.blueprintReviewSurface.lessonRows.length - 1,
                  untraceableRows: 1,
                },
                lessonRows: blueprint.blueprintReviewSurface.lessonRows.map((row, index) =>
                  index === 0
                    ? {
                        ...row,
                        answerabilityStatus: 'not-answerable',
                        sourceTrace: {
                          ...row.sourceTrace,
                          sourceAnchor: '',
                        },
                      }
                    : row,
                ),
              },
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'blueprintReviewSurface',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when blueprint review-surface instructional moves are not reviewable', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              blueprintReviewSurface: {
                ...blueprint.blueprintReviewSurface,
                instructionalMoveDecode: {
                  ...blueprint.blueprintReviewSurface.instructionalMoveDecode,
                  status: 'needs-review',
                  feedbackMove: '',
                },
                traceabilitySummary: {
                  ...blueprint.blueprintReviewSurface.traceabilitySummary,
                  instructionalMoveRows: blueprint.blueprintReviewSurface.lessonRows.length - 1,
                },
                lessonRows: blueprint.blueprintReviewSurface.lessonRows.map((row, index) =>
                  index === 0
                    ? {
                        ...row,
                        teachingMoveTrace: {
                          ...row.teachingMoveTrace,
                          feedbackMove: '',
                        },
                      }
                    : row,
                ),
              },
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'blueprintReviewSurface',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when compiled lesson plans or slide decks drop review-surface instructional moves', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          compileBlueprintDeliverables: (...args) => {
            const compiled = runtime.compileBlueprintDeliverables(...args);
            return {
              ...compiled,
              lessonPlans: {
                ...compiled.lessonPlans,
                lessonPlans: compiled.lessonPlans.lessonPlans.map((plan, index) =>
                  index === 0
                    ? {
                        ...plan,
                        instructionalMoveGuide: {
                          ...plan.instructionalMoveGuide,
                          feedbackMove: '',
                        },
                      }
                    : plan,
                ),
              },
              slideDecks: {
                ...compiled.slideDecks,
                decks: compiled.slideDecks.decks.map((deck, index) =>
                  index === 0
                    ? {
                        ...deck,
                        slideDeckSequenceGuide: {
                          ...deck.slideDeckSequenceGuide,
                          instructionalMoveGuide: {
                            ...deck.slideDeckSequenceGuide.instructionalMoveGuide,
                            practiceMove: '',
                          },
                        },
                      }
                    : deck,
                ),
              },
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.instructionalMoveSummary.compiledFindings).toBeGreaterThan(0);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            check: 'instructionalMoveCompiledTrace',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  }, 180000);

  it('blocks when lesson compiler decisions are missing', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              compilerDecisionMatrix: {
                ...blueprint.compilerDecisionMatrix,
                lessonRows: [],
              },
              lessons: blueprint.lessons.map((lesson, index) =>
                index === 0
                  ? {
                      ...lesson,
                      compilerDecision: null,
                    }
                  : lesson,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'compilerDecisionMatrix',
          }),
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'compilerDecision',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when compiled artifacts drop compiler decision and publish-gate traces', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          compileBlueprintDeliverables: (...args) => {
            const compiled = runtime.compileBlueprintDeliverables(...args);
            return {
              ...compiled,
              lessonPlans: {
                ...compiled.lessonPlans,
                lessonPlans: compiled.lessonPlans.lessonPlans.map((plan, index) =>
                  index === 0
                    ? {
                        ...plan,
                        blueprintGrounding: {
                          ...plan.blueprintGrounding,
                          compilerDecision: null,
                        },
                      }
                    : plan,
                ),
              },
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.fidelitySummary.findings).toBeGreaterThan(0);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'lessonPlans',
            check: 'blueprintFidelityCompilerDecision',
          }),
          expect.objectContaining({
            featureId: 'lessonPlans',
            check: 'blueprintFidelityPublishGate',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  }, 180000);

  it('blocks when cognitive demand falls back to lesson-position Bloom rotation', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              lessons: blueprint.lessons.map((lesson, index) =>
                index === 0
                  ? {
                      ...lesson,
                      bloomsLevel: 'Apply',
                      bloomInference: {
                        level: 'Apply',
                        source: 'index-rotation',
                        matchedVerb: '',
                        matchedSignal: '',
                        fallbackUsed: true,
                      },
                    }
                  : lesson,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'bloomInference',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the blueprint lacks exemplar/non-exemplar contrast', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              lessons: blueprint.lessons.map((lesson, index) =>
                index === 0 ? { ...lesson, modelContrast: null } : lesson,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'modelContrast',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the blueprint lacks readiness support planning', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              lessons: blueprint.lessons.map((lesson, index) =>
                index === 0 ? { ...lesson, readinessSupport: null } : lesson,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'readinessSupport',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the blueprint lacks prerequisite-readiness planning', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              lessons: blueprint.lessons.map((lesson, index) =>
                index === 0 ? { ...lesson, prerequisitePlan: null } : lesson,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'prerequisitePlan',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the blueprint lacks class-session feasibility planning', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              lessons: blueprint.lessons.map((lesson, index) =>
                index === 0 ? { ...lesson, classSessionPlan: null } : lesson,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'classSessionPlan',
          }),
        ]),
      );
      expect(result.sessionFeasibility.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'sessionFeasibilityBlueprint',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when assessment anchors lack validity evidence', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              assessments: blueprint.assessments.map((assessment, index) =>
                index === 0 ? { ...assessment, validityEvidence: null } : assessment,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'assessmentValidity',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when assessment anchors lack grading calibration evidence', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              assessments: blueprint.assessments.map((assessment, index) =>
                index === 0 ? { ...assessment, calibrationPlan: null } : assessment,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'assessmentValidity',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when assessment anchors lack criterion evidence guidance', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              assessments: blueprint.assessments.map((assessment, index) =>
                index === 0 ? { ...assessment, criterionEvidenceMap: null } : assessment,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'assessmentValidity',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when assessment anchors lack criterion weighting guidance', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              assessments: blueprint.assessments.map((assessment, index) =>
                index === 0 ? { ...assessment, criterionWeightPlan: null } : assessment,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'assessmentValidity',
          }),
        ]),
      );
      expect(result.criterionWeighting.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'criterionWeightPlan',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when criterion-to-objective alignment falls back to index rotation', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              assessments: blueprint.assessments.map((assessment, index) =>
                index === 0
                  ? {
                      ...assessment,
                      criterionObjectiveAlignment: assessment.criteria.map((criterion, criterionIndex) => ({
                        criterion,
                        objective: assessment.objectives[criterionIndex % assessment.objectives.length],
                        strategy: 'index-rotation',
                        rationale: 'Legacy criterion-position alignment.',
                      })),
                    }
                  : assessment,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.criterionWeighting.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'criterionObjectiveAlignment',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when compiled rubrics fall back to generic performance bands', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          compileBlueprintDeliverables: (...args) => {
            const compiled = runtime.compileBlueprintDeliverables(...args);
            compiled.rubrics.rubrics[0].criteria = compiled.rubrics.rubrics[0].criteria.map((criterion) => ({
              ...criterion,
              exemplary: `Exceeds expectations on "${criterion.criterion}" by applying evidence precisely.`,
              proficient: `Meets "${criterion.criterion}" with accurate evidence, clear organization, and a complete response.`,
              developing: `Partially meets "${criterion.criterion}" but needs stronger evidence.`,
              beginning: `Shows limited evidence for "${criterion.criterion}".`,
              performanceBandEvidence: null,
            }));
            return compiled;
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.criterionWeighting.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'rubrics',
            check: 'criterionWeightPlanRubric',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when assessment anchors lack anchor examples', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              assessments: blueprint.assessments.map((assessment, index) =>
                index === 0 ? { ...assessment, anchorExampleSet: null } : assessment,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'assessmentValidity',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the blueprint lacks source-use planning', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              lessons: blueprint.lessons.map((lesson, index) =>
                index === 0 ? { ...lesson, sourceUsePlan: null } : lesson,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.decodeLosslessnessSummary.blueprintFindings).toBeGreaterThan(0);
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'sourceUsePlan',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the blueprint lacks raw source provenance', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              lessons: blueprint.lessons.map((lesson, index) =>
                index === 0 ? { ...lesson, sourceEvidenceTrace: null } : lesson,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.decodeLosslessnessSummary.blueprintFindings).toBeGreaterThan(0);
      expect(result.decodeLosslessness.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'blueprintLosslessDecodePacket',
          }),
        ]),
      );
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'sourceEvidenceTrace',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the blueprint lacks learner-context assumptions', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => ({
            ...runtime.buildCourseBlueprint(...args),
            learnerContextProfile: null,
          }),
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'learnerContextProfile',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when learner context drops the enrichment lens', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const fieldSample = DEFAULT_GOLD_SAMPLES.find((sample) => sample.id === 'gold-field-placement-8');
      const result = auditGoldSample({
        sample: fieldSample,
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              learnerContextProfile: {
                ...blueprint.learnerContextProfile,
                learnerRole: 'evaluation practitioner',
                evidenceNoun: 'community evidence',
                decisionNoun: 'program decision',
                coursePerformanceRole:
                  'Students work as evaluation practitioners who use community evidence to make program decisions across the course.',
              },
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'learnerContextLens',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  }, 10000);

  it('blocks when learner context drops the course-modality practice lens', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const clinicalSample = DEFAULT_GOLD_SAMPLES.find((sample) => sample.id === 'gold-messy-clinical-resilience-8');
      const result = auditGoldSample({
        sample: clinicalSample,
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              learnerContextProfile: {
                ...blueprint.learnerContextProfile,
                learnerRole: 'evaluation practitioner',
                evidenceNoun: 'implementation evidence',
                decisionNoun: 'program decision',
                coursePerformanceRole:
                  'Students work as evaluation practitioners who use implementation evidence to make program decisions across the course.',
              },
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'learnerContextModalityLens',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  }, 10000);

  it('blocks when compiled lessons lose learner-context traces', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              lessons: blueprint.lessons.map((lesson, index) =>
                index === 0 ? { ...lesson, learnerContextCue: '' } : lesson,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'learnerContextCue',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the blueprint lacks a classroom handoff plan', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => ({
            ...runtime.buildCourseBlueprint(...args),
            classroomHandoffPlan: null,
          }),
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'classroomHandoffPlan',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the blueprint lacks a source-risk register', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => ({
            ...runtime.buildCourseBlueprint(...args),
            sourceRiskRegister: null,
          }),
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'sourceRiskRegister',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the blueprint lacks a package coherence matrix', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => ({
            ...runtime.buildCourseBlueprint(...args),
            packageCoherenceMatrix: null,
          }),
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'packageCoherenceMatrix',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the blueprint lacks a human-reviewable assumption ledger', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => ({
            ...runtime.buildCourseBlueprint(...args),
            blueprintAssumptionLedger: null,
          }),
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'blueprintAssumptionLedger',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the blueprint lacks assessment architecture', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => ({
            ...runtime.buildCourseBlueprint(...args),
            assessmentArchitecture: null,
          }),
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'assessmentArchitecture',
          }),
        ]),
      );
      expect(result.assessmentArchitecture.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'assessmentArchitectureBlueprint',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the blueprint lacks instructional design rationale', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              lessons: blueprint.lessons.map((lesson, index) =>
                index === 0 ? { ...lesson, instructionalRationale: null } : lesson,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'instructionalRationale',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the blueprint lacks accessibility and participation planning', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              lessons: blueprint.lessons.map((lesson, index) =>
                index === 0 ? { ...lesson, accessibilityPlan: null } : lesson,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'accessibilityPlan',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the blueprint lacks structured feedback and revision cycles', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              lessons: blueprint.lessons.map((lesson, index) =>
                index === 0 ? { ...lesson, feedbackCycle: null } : lesson,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'feedbackCycle',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the blueprint lacks retrieval and transfer planning', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              lessons: blueprint.lessons.map((lesson, index) =>
                index === 0 ? { ...lesson, learningTransferPlan: null } : lesson,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.blueprintMaturity.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'learningTransferPlan',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when the blueprint lacks a concept dependency graph', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          buildCourseBlueprint: (...args) => {
            const blueprint = runtime.buildCourseBlueprint(...args);
            return {
              ...blueprint,
              conceptDependencyGraph: null,
              lessons: blueprint.lessons.map((lesson, index) =>
                index === 0
                  ? {
                      ...lesson,
                      conceptDependencyPlan: null,
                      practiceProgressionPlan: null,
                    }
                  : lesson,
              ),
            };
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.conceptGraphSummary.status).toBe('blocked');
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'blueprint',
            check: 'conceptDependencyGraph',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when compiled output drifts from the blueprint fidelity trace', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          compileBlueprintDeliverables: (...args) => {
            const compiled = runtime.compileBlueprintDeliverables(...args);
            compiled.lessonPlans.lessonPlans[0].blueprintGrounding.evidencePlan.evidenceRequirement =
              'Use an unrelated external example instead of the lesson evidence.';
            return compiled;
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.fidelitySummary.findings).toBeGreaterThan(0);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'lessonPlans',
            check: 'blueprintFidelityEvidence',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when compiled output loses teaching-intent sequencing', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          compileBlueprintDeliverables: (...args) => {
            const compiled = runtime.compileBlueprintDeliverables(...args);
            compiled.lessonPlans.lessonPlans[0].blueprintGrounding.teachingIntent = {};
            compiled.lessonPlans.lessonPlans[0].teachingIntent = {};
            compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.teachingIntentSummary = '';
            return compiled;
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.fidelitySummary.findings).toBeGreaterThan(0);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'lessonPlans',
            check: 'blueprintFidelityTeachingIntent',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when compiled output loses modality-fit evidence', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          compileBlueprintDeliverables: (...args) => {
            const compiled = runtime.compileBlueprintDeliverables(...args);
            compiled.lessonPlans.lessonPlans[0].blueprintGrounding.courseModalityProfile = {};
            compiled.lessonPlans.lessonPlans[0].blueprintGrounding.modalityDecode = {};
            compiled.lessonPlans.lessonPlans[0].blueprintGrounding.modalityCue = '';
            compiled.lessonPlans.lessonPlans[0].courseModalityProfile = {};
            compiled.lessonPlans.lessonPlans[0].modalityCue = '';
            compiled.lessonPlans.lessonPlans[0].modalityDecode = {};
            compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityFit = null;
            compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityPractice = '';
            compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityEvidenceRoutine = '';
            compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityFeedbackRoutine = '';
            return compiled;
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.modalityFitSummary.compiledFindings).toBeGreaterThan(0);
      expect(result.fidelitySummary.findings).toBeGreaterThan(0);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'lessonPlans',
            check: 'modalityFitStructuredTrace',
          }),
          expect.objectContaining({
            featureId: 'lessonPlans',
            check: 'blueprintFidelityModalityFit',
          }),
          expect.objectContaining({
            featureId: 'lessonPlans',
            check: 'modalityDecodeStructuredTrace',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when compiled output loses artifact-genre evidence', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          compileBlueprintDeliverables: (...args) => {
            const compiled = runtime.compileBlueprintDeliverables(...args);
            compiled.lessonPlans.lessonPlans[0].blueprintGrounding.artifactGenre = {};
            compiled.lessonPlans.lessonPlans[0].artifactGenre = {};
            compiled.lessonPlans.lessonPlans[0].artifactLength = '';
            compiled.lessonPlans.lessonPlans[0].weeklySubmissionCriteria = '';
            compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.artifactGenreFit = '';
            compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.genreReviewProtocol = '';
            compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.genreCommonFailure = '';
            compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.genreRevisionMove = '';
            return compiled;
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.artifactGenreSummary.compiledFindings).toBeGreaterThan(0);
      expect(result.fidelitySummary.findings).toBeGreaterThan(0);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'lessonPlans',
            check: 'artifactGenreStructuredTrace',
          }),
          expect.objectContaining({
            featureId: 'lessonPlans',
            check: 'blueprintFidelityArtifactGenre',
          }),
          expect.objectContaining({
            featureId: 'lessonPlans',
            check: 'blueprintFidelityArtifactGenreTrace',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when assignment briefs fall back to generic type and time instead of artifact-genre submission profiles', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          compileBlueprintDeliverables: (...args) => {
            const compiled = runtime.compileBlueprintDeliverables(...args);
            compiled.assignments.assignments[0] = {
              ...compiled.assignments.assignments[0],
              assignmentType: 'Case Study',
              estimatedTime: '2-4 hours',
              expectedSubmissionFormat: 'Submit a generic case study through the course site.',
              submissionProfile: null,
              formatRequirements: {
                ...compiled.assignments.assignments[0].formatRequirements,
                format: 'Generic document',
                reviewProtocol: '',
              },
            };
            return compiled;
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.artifactGenreSummary.compiledFindings).toBeGreaterThan(0);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'assignments',
            check: 'artifactGenreSubmissionProfile',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when discussion prompts fall back to rotating formats instead of modality/artifact protocols', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          compileBlueprintDeliverables: (...args) => {
            const compiled = runtime.compileBlueprintDeliverables(...args);
            compiled.discussions.discussions[0] = {
              ...compiled.discussions.discussions[0],
              format: 'Socratic Seminar',
              estimatedDuration: '20-25 min',
              discussionProtocol: null,
              guidelines: 'Discuss the lesson with evidence and respond to peers.',
              sourceGrounding: {
                ...compiled.discussions.discussions[0].sourceGrounding,
                discussionProtocol: null,
              },
            };
            return compiled;
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'discussions',
            check: 'discussionProtocol',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when slide decks fall back to rotating visual kinds without purpose-aware visual plans', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          compileBlueprintDeliverables: (...args) => {
            const compiled = runtime.compileBlueprintDeliverables(...args);
            const rotatingKinds = ['diagram', 'table', 'chart', 'image'];
            compiled.slideDecks.decks[0].slides = compiled.slideDecks.decks[0].slides.map((slide, index) =>
              slide.visual?.kind === 'none'
                ? slide
                : {
                    ...slide,
                    visual: {
                      kind: rotatingKinds[index % rotatingKinds.length],
                      description: 'Generic visual for the slide.',
                      altText: 'Generic visual alt text.',
                    },
                  },
            );
            return compiled;
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'slideDecks',
            check: 'slideVisualPlan',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when quiz banks use fixed Bloom sequencing without source-grounded planning', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          compileBlueprintDeliverables: (...args) => {
            const compiled = runtime.compileBlueprintDeliverables(...args);
            compiled.quizBank.quizzes[0] = {
              ...compiled.quizBank.quizzes[0],
              quizBlueprint: {
                source: 'fixed-sequence',
                questionPlan: [],
              },
              questions: compiled.quizBank.quizzes[0].questions.map((question) => ({
                ...question,
                quizPlan: {
                  source: 'fixed-sequence',
                  role: '',
                  bloomSource: '',
                  sourceSignal: '',
                  objectiveAlignmentStrategy: '',
                },
              })),
            };
            return compiled;
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'quizBank',
            check: 'sourceGroundedQuizPlan',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when compiled output loses source course-map signals', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          compileBlueprintDeliverables: (...args) => {
            const compiled = runtime.compileBlueprintDeliverables(...args);
            compiled.assignments.assignments[0] = {
              title: 'Generic reflection task',
              artifact: 'Generic reflection task',
              overview: 'Complete a general reflection using outside experience.',
              evidencePlan: {},
              sourceGrounding: {},
              blueprintGrounding: {},
            };
            return compiled;
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.sourceFidelitySummary.compiledFindings).toBeGreaterThan(0);
      expect(result.decodeLosslessnessSummary.compiledFindings).toBeGreaterThan(0);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'assignments',
            check: 'sourceFidelityConceptTrace',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when compiled output loses source provenance trace', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditGoldSample({
        sample: DEFAULT_GOLD_SAMPLES[0],
        runtime: {
          ...runtime,
          compileBlueprintDeliverables: (...args) => {
            const compiled = runtime.compileBlueprintDeliverables(...args);
            compiled.lessonPlans.lessonPlans[0].blueprintGrounding.sourceEvidenceTrace = null;
            return compiled;
          },
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.fidelitySummary.findings).toBeGreaterThan(0);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'lessonPlans',
            check: 'blueprintFidelitySourceEvidence',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('blocks when curated enrichment does not create measurable compiler lift', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const sample = {
        ...DEFAULT_GOLD_SAMPLES[0],
        id: 'missing-enrichment-impact-fixture',
        expectations: {
          minQuality: 0,
          packageMustNotMatch: [],
          features: {},
        },
      };
      const result = auditGoldSample({
        sample,
        runtime: {
          ...runtime,
          buildCourseBlueprint: (courseMap) => runtime.buildCourseBlueprint(courseMap, {}),
        },
      });

      expect(result.summary.status).toBe('blocked');
      expect(result.enrichmentImpact.status).toBe('blocked');
      expect(result.enrichmentImpact.justifiesEnrichmentCall).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            featureId: 'enrichment',
            check: 'phraseCoverage',
          }),
        ]),
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it(
    'blocks required scopes that are only proven by one teaching modality',
    async () => {
      const runtime = await loadHybridPipelineAuditRuntime();
      try {
        const payload = await buildGoldSampleQualityAudit({
          runtime,
          samples: DEFAULT_GOLD_SAMPLES.filter((sample) => sample.id.startsWith('gold-research-methods')),
        });

        expect(payload.summary.status).toBe('blocked');
        expect(payload.summary.scopeCoverageStatus).toBe('blocked');
        expect(payload.summary.missingScopes).toEqual([]);
        expect(payload.summary.missingScopeModalityCoverage).toEqual([5, 8, 14]);
        expect(payload.scopeCoverage.modalityCounts).toMatchObject({
          5: 1,
          8: 1,
          14: 1,
        });
        expect(payload.auditFindings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              featureId: 'goldScopeCoverage',
              check: 'scopeModalityCoverage',
            }),
          ]),
        );
      } finally {
        await closeHybridPipelineAuditRuntime();
      }
    },
    GOLD_AUDIT_FULL_MATRIX_TIMEOUT_MS,
  );

  it('writes latest markdown and JSON reports', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coursemapper-gold-audit-'));
    try {
      const payload = await buildGoldSampleQualityAudit({
        runtime,
        samples: DEFAULT_GOLD_SAMPLES.slice(0, 1),
      });
      const paths = await writeGoldSampleQualityAudit(payload, outputDir);
      const markdown = await fs.readFile(paths.markdownPath, 'utf8');

      expect(markdown).toContain('Gold Case Matrix');
      await expect(fs.stat(paths.jsonPath)).resolves.toMatchObject({ isFile: expect.any(Function) });
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });
});
