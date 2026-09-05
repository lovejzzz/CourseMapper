import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/hooks/useDeliverables.js', 'utf8');
const admissionSource = readFileSync('src/lib/instructionalPlanGenerationAdmission.js', 'utf8');

describe('useDeliverables output-quality contracts', () => {
  it('fails closed when Course FAQ generation is unusable', () => {
    expect(source).not.toContain('buildFallbackCourseFaq');
    expect(source).not.toContain('completeFallbackCourseFaq');
    expect(source).not.toContain('created a course-map-based FAQ instead');
    expect(source).toContain("markFeatureError(fid, 'All chunks failed')");
    expect(source).toContain("markFeatureError(fid, 'Failed to merge chunks')");
  });

  it('retries quiz lessons against the configured question target', () => {
    expect(source).not.toContain('const minQuestions = 5');
    expect(source).toContain('resolveQuizQuestionTarget(getGenerationConfig(fid))');
    expect(source).toContain('normalizeQuizBankQuestionCounts(merged, configuredQuizTarget)');
    expect(source).toContain('quizCountCheck.mismatchedIndices');
    expect(source).toContain('validateDeliverableGeneration(featureId, initialValidationData');
    expect(source).toContain('expectedLessonNumbers,');
    expect(source).toContain('removedUnderfilledForRetry');
    expect(source).toContain('questionRetryBaseline = merged');
    expect(source).toContain('getGenerationConfig(fid).questionsPerLesson');
    expect(source).toContain('maxQuestions: getGenerationConfig(fid).questionsPerLesson');
    expect(source).toContain('questionRetryResults.set(retryChunkIndex, retryData)');
    expect(source).toContain('patchScopeNumbering(parsed, fid, retryScope, courseMap)');
    expect(source).toContain('mergeQuestionRetryResults(fid, questionRetryBaseline, questionRetryResults, {');
  });

  it('admits a plan before semantic output and releases cached kernels only after linked re-admission', () => {
    const preDraftGate = source.indexOf('const preparedInstructionalPlan = prepareInstructionalPlan({');
    const semanticDraft = source.indexOf('blueprintEnrichment = await runBlueprintEnrichment(');
    const postAdmission = source.indexOf('admitInstructionalPlanForGeneration({');
    const approvalCheck = admissionSource.indexOf("if (instructionalPlan?.admission?.status !== 'approved')");
    const cacheCommit = admissionSource.indexOf('commitKernelCache();');

    expect(preDraftGate).toBeGreaterThan(0);
    expect(semanticDraft).toBeGreaterThan(preDraftGate);
    expect(postAdmission).toBeGreaterThan(semanticDraft);
    expect(approvalCheck).toBeGreaterThan(0);
    expect(cacheCommit).toBeGreaterThan(approvalCheck);
    expect(source).toContain('providerCallsPrevented: true');
    expect(source).toContain('Saved kernels quarantined');
    expect(admissionSource).toContain('coursemapper-linked-instructional-plan-receipts-v3');
    expect(source).toContain("stage: 'evidence-grounded-planning'");
    expect(source).toContain('createScionEvidenceAuthorityContract({');
    expect(source).toContain('evidenceGroundedInstructionalPlan = prepareInstructionalPlan({');
    expect(source).toContain('governingSourceContract,');
    expect(source).toContain('const scionEvidenceSeedLessonContent = scionEvidenceHandoff?.lessonContent || {}');
    expect(source.match(/\.\.\.scionEvidenceSeedLessonContent,/g)).toHaveLength(2);
    expect(source).toContain('const applyScionEvidenceAuthorityToLessonContent = (lessonContent = {}) => {');
    expect(source).toContain('lessonContent[lessonId] = bindScionEvidenceProvenance(lessonId, payload);');
    expect(source.match(/const lessonContent = applyScionEvidenceAuthorityToLessonContent\(\{/g)).toHaveLength(2);
    expect(source).toContain('let authenticLanguageDataTransaction;');
    expect(source).toContain(
      'authenticLanguageDataTransaction = preparedInstructionalPlan.authenticLanguageDataTransaction',
    );
    expect(source.match(/\.\.\.authenticLanguageDataTransaction,/g)).toHaveLength(2);
    expect(admissionSource).toContain(
      'courseGraph.evidenceGroundedInstructionalPlan = structuredClone(evidenceGroundedInstructionalPlan)',
    );
    expect(admissionSource).toContain('courseGraph.governingSourceContract = governingSourceContract');
    expect(admissionSource).toContain(
      'courseGraph.preDraftInstructionalPlan = structuredClone(preDraftInstructionalPlan)',
    );
    expect(admissionSource).toContain('courseGraph.instructionalIntentGraph = structuredClone(instructionalPlan)');
    expect(admissionSource).toContain("onCourseGraph(courseGraph, { source: 'generation-plan-admitted' })");
  });
});
