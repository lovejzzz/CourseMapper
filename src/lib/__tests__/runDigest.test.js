import { describe, expect, it } from 'vitest';
import { buildRunDigest, formatRunDigest } from '../runDigest.js';
import { applyApiCallBudgetEvent, createApiCallBudget } from '../apiCallBudget.js';

function budgetWithCourseMapCall(modelId, costEstimated = false) {
  let budget = createApiCallBudget({ runId: 'run-test' });
  budget = applyApiCallBudgetEvent(budget, {
    type: 'courseMapCall',
    label: 'Course-map generation',
    detail: `${modelId} · lean atoms + compiler-derived columns`,
  });
  budget = applyApiCallBudgetEvent(budget, {
    type: 'genomeLink',
    label: 'CurriculumOS linker',
    detail: '2 genome + 0 cached of 8 lessons (3 concepts, 5 citations)',
  });
  budget = applyApiCallBudgetEvent(budget, {
    type: 'pipelineDecision',
    stage: 'enrichmentModelStage',
    detail: 'skipped: enrichment flag off (linker: ran)',
  });
  budget = applyApiCallBudgetEvent(budget, {
    type: 'apiUsage',
    provider: 'openai',
    modelId,
    task: 'course-map',
    featureId: 'course-map',
    usage: { inputTokens: 1226, outputTokens: 11223, reasoningOutputTokens: 6838, estimated: costEstimated },
    costUsd: 0.0514,
    pricingSource: 'static',
  });
  return budget;
}

describe('runDigest', () => {
  it('captures the pipeline decision trail including why stages were skipped', () => {
    const budget = budgetWithCourseMapCall('gpt-5.4-mini');
    const digest = buildRunDigest({
      budget,
      exportVerification: { status: 'passed', checked: 38, failed: 0, warningCount: 0, checks: [] },
      finish: { finalStatus: 'ready', blockers: 0, warnings: 0, repairsApplied: 1, retryCallCount: 0 },
      generation: { provider: 'openai', lessonCount: 8, featureIds: ['quizBank'] },
    });
    expect(digest.pipeline.courseMap).toContain('lean atoms');
    expect(digest.pipeline.genomeLinker).toContain('2 genome');
    expect(digest.pipeline.enrichmentModelStage).toContain('skipped: enrichment flag off');
    expect(digest.cost.totalUsd).toBeCloseTo(0.0514, 3);
    expect(digest.cost.byTask[0].task).toBe('course-map');
  });

  it('reports real model attempts separately from outer pipeline call units', () => {
    let budget = budgetWithCourseMapCall('gpt-5.4-mini');
    budget = applyApiCallBudgetEvent(budget, { type: 'providerRequestStart', task: 'course-map' });
    budget = applyApiCallBudgetEvent(budget, { type: 'providerRequestStart', task: 'semantic-repair' });

    const digest = buildRunDigest({ budget });
    const text = formatRunDigest(digest);

    expect(digest.run.providerCalls).toBe(2);
    expect(digest.run.pipelineCalls).toBe(1);
    expect(text).toContain('model requests: 2');
    expect(text).toContain('pipeline calls: 1');
  });

  it('identifies Algi even though its deterministic run has no usage-ledger rows', () => {
    const digest = buildRunDigest({
      budget: createApiCallBudget({ runId: 'run-algi' }),
      generation: { provider: 'public', modelId: 'algi-v0', lessonCount: 6, featureIds: ['syllabus'] },
    });

    expect(digest.run).toMatchObject({
      provider: 'public',
      models: ['algi-v0'],
      providerCalls: 0,
      lessonCount: 6,
    });
    expect(formatRunDigest(digest)).toContain('model: public/algi-v0');
  });

  // v0.16.1 regression: a READY run with a readiness warning must report the
  // real warning count in the digest. The Linear Algebra run zeroed warnings
  // on ready (UI calm pass) so the digest claimed "0 warnings" while its own
  // flaggedChecks listed the missing-rubric warning — gates disagreed with
  // themselves. AppFlow now passes the true count into the digest.
  it('keeps the readiness warning count honest on a ready run', () => {
    const digest = buildRunDigest({
      budget: budgetWithCourseMapCall('gpt-5.4-mini'),
      exportVerification: { status: 'passed', checked: 38, failed: 0, warningCount: 0, checks: [] },
      finish: {
        finalStatus: 'ready',
        blockers: 0,
        warnings: 1,
        repairsApplied: 14,
        retryCallCount: 0,
        readinessWarnings: [{ featureId: 'rubrics', message: 'Rubrics are missing assessed lesson(s): 14.' }],
      },
      generation: { provider: 'openai', lessonCount: 14, featureIds: ['rubrics'] },
    });

    expect(digest.gates.finalStatus).toBe('ready');
    expect(digest.gates.warnings).toBe(1);
    expect(digest.gates.flaggedChecks).toContainEqual(
      expect.objectContaining({ featureId: 'rubrics', status: 'warning' }),
    );
  });

  it('preserves the trust state and warning-domain ledger alongside operational finish status', () => {
    const warningDomains = {
      version: 1,
      total: 22,
      domains: { contentQuality: 9, evidence: 5, exportReview: 8 },
    };
    const blockerDomains = { version: 1, total: 0, domains: {} };
    const digest = buildRunDigest({
      budget: budgetWithCourseMapCall('gpt-5.4-mini'),
      finish: {
        finalStatus: 'ready',
        trustState: 'review',
        blockers: 0,
        warnings: 22,
        warningDomains,
        blockerDomains,
      },
    });

    expect(digest.gates).toMatchObject({
      finalStatus: 'ready',
      trustState: 'review',
      warnings: 22,
      warningDomains,
      blockerDomains,
    });
  });

  it('labels pricing accuracy honestly', () => {
    const reported = buildRunDigest({ budget: budgetWithCourseMapCall('gpt-5.4-mini', false) });
    expect(reported.cost.accuracy).toContain('provider-reported');

    let estBudget = createApiCallBudget({ runId: 'run-est' });
    estBudget = applyApiCallBudgetEvent(estBudget, {
      type: 'apiUsage',
      provider: 'openai',
      modelId: 'gpt-7.0',
      task: 'course-map',
      usage: { inputTokens: 100, outputTokens: 100, estimated: false },
      costUsd: 0.001,
      pricingSource: 'family-estimate',
    });
    const estimate = buildRunDigest({ budget: estBudget });
    expect(estimate.cost.accuracy).toContain('approximate');
  });

  it('surfaces actual flagged export-check messages, not just counts', () => {
    const digest = buildRunDigest({
      budget: budgetWithCourseMapCall('gpt-5.4-mini'),
      exportVerification: {
        status: 'warnings',
        checked: 38,
        failed: 0,
        warningCount: 1,
        checks: [
          { featureId: 'syllabus', status: 'passed', message: 'ok' },
          { featureId: 'slideDecks', status: 'warning', message: 'Slide 7 image missing alt text' },
        ],
      },
      finish: { finalStatus: 'ready', exportStatus: 'warnings' },
    });
    expect(digest.gates.flaggedChecks).toHaveLength(1);
    expect(digest.gates.flaggedChecks[0].message).toContain('alt text');

    const text = formatRunDigest(digest);
    expect(text).toContain('RUN DIGEST');
    expect(text).toContain('alt text');
    expect(text).toMatch(/cost:/);
  });

  it('counts generation-stage repair retries in the digest gate summary', () => {
    let budget = createApiCallBudget({ runId: 'run-repair-retry' });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'repairRetryCall',
      label: 'Author lesson batch (native recovery 1/2)',
      featureId: 'blueprintEnrichment',
    });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'repairRetryCall',
      label: 'Author lesson batch (native recovery 2/2)',
      featureId: 'blueprintEnrichment',
    });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'pipelineDecision',
      stage: 'enrichmentModelStage',
      detail: 'ran (11/12 — lesson 1 fell back to template) (linker: ran)',
      outcome: {
        modelStage: 'ran',
        enrichedLessons: 11,
        requestedLessons: 12,
        missingLessons: [1],
      },
    });

    const digest = buildRunDigest({
      budget,
      exportVerification: { status: 'passed', checked: 38, failed: 0, warningCount: 0, checks: [] },
      finish: { finalStatus: 'blocked', blockers: 1, warnings: 0, repairsApplied: 6, retryCallCount: 0 },
      generation: { provider: 'openai', lessonCount: 12, featureIds: ['studyGuides'] },
    });

    expect(digest.gates.retryCallCount).toBe(2);
    expect(digest.gates.repairRetryCallCount).toBe(2);
    expect(digest.gates.finishRetryCallCount).toBe(0);
    const partial = digest.gates.flaggedChecks.find((check) => check.message.includes('partial enrichment'));
    expect(partial.message).toBe(
      'partial enrichment (11/12) — lesson 1 fell back to template after 2 repair/retry calls',
    );
    expect(formatRunDigest(digest)).toContain('6 repairs · 2 retry calls (2 repair-stage)');
  });

  it('surfaces finalize-time quality P0s in the digest gate trail', () => {
    const digest = buildRunDigest({
      budget: budgetWithCourseMapCall('gpt-5.4-mini'),
      exportVerification: { status: 'passed', checked: 38, failed: 0, warningCount: 0, checks: [] },
      finish: {
        finalStatus: 'blocked',
        blockers: 1,
        warnings: 3,
        repairsApplied: 1,
        retryCallCount: 0,
        quality: {
          status: 'graded',
          score: 74,
          grade: 'C',
          findingCounts: { p0: 1, p1: 0, p2: 3 },
          findings: [
            {
              severity: 'P0',
              file: 'Course FAQ/Lesson 01.docx',
              detail: 'prompt artifact labels used as lesson concepts',
            },
          ],
        },
      },
      generation: { provider: 'openai', lessonCount: 4, featureIds: ['courseFaq'] },
    });

    expect(digest.gates.finalStatus).toBe('blocked');
    expect(digest.gates.qualityStatus).toBe('graded');
    expect(digest.gates.qualityP0).toBe(1);
    expect(digest.gates.flaggedChecks[0]).toMatchObject({
      featureId: 'quality',
      status: 'failed',
    });
    expect(digest.gates.flaggedChecks[0].message).toContain('package conformance 74/100 (C)');
    expect(digest.gates.flaggedChecks[0].message).toContain('prompt artifact labels');
    const text = formatRunDigest(digest);
    expect(text).toContain('gates: blocked');
    expect(text).toContain('conformance 74/100 C');
    expect(text).toContain('[failed] quality');
  });

  it('surfaces readiness blockers even when quality and export verification pass', () => {
    const digest = buildRunDigest({
      budget: budgetWithCourseMapCall('gpt-5.4-mini'),
      exportVerification: { status: 'passed', checked: 38, failed: 0, warningCount: 0, checks: [] },
      finish: {
        finalStatus: 'blocked',
        blockers: 1,
        warnings: 9,
        repairsApplied: 10,
        retryCallCount: 0,
        quality: {
          status: 'graded',
          score: 100,
          grade: 'A',
          findingCounts: { p0: 0, p1: 0, p2: 0 },
          findings: [],
        },
        readinessBlockers: [
          {
            featureId: 'courseMap',
            message: 'Non-data-science package references notebook/model-card lab assets',
          },
        ],
      },
      generation: {
        provider: 'openai',
        lessonCount: 12,
        featureIds: ['courseMap', 'syllabus', 'slideDecks', 'assignments'],
      },
    });

    expect(digest.gates.finalStatus).toBe('blocked');
    expect(digest.gates.qualityScore).toBe(100);
    expect(digest.gates.exportStatus).toBe('passed');
    expect(digest.gates.flaggedChecks).toEqual([
      {
        featureId: 'courseMap',
        status: 'failed',
        message: 'Non-data-science package references notebook/model-card lab assets',
      },
      {
        featureId: 'package',
        status: 'warning',
        message: '9 readiness warnings require review',
      },
    ]);
    expect(formatRunDigest(digest)).toContain('[failed] courseMap');
  });

  it('uses a fallback readiness detail when a blocked finish omits blocker messages', () => {
    const digest = buildRunDigest({
      budget: budgetWithCourseMapCall('gpt-5.4-mini'),
      exportVerification: { status: 'passed', checked: 38, failed: 0, warningCount: 0, checks: [] },
      finish: {
        finalStatus: 'blocked',
        blockers: 1,
        warnings: 0,
        quality: { status: 'graded', score: 100, grade: 'A', findingCounts: { p0: 0, p1: 0, p2: 0 } },
      },
      generation: { provider: 'openai', lessonCount: 12, featureIds: ['courseMap'] },
    });

    expect(digest.gates.flaggedChecks[0]).toMatchObject({
      featureId: 'package',
      status: 'failed',
    });
    expect(digest.gates.flaggedChecks[0].message).toContain('no blocker detail reached the digest');
  });

  it('renders a digest with no model calls without throwing', () => {
    const digest = buildRunDigest({ budget: createApiCallBudget({ runId: 'empty' }) });
    expect(digest.cost.accuracy).toBe('no model calls');
    expect(formatRunDigest(digest)).toContain('RUN DIGEST');
  });

  // v0.12.1 content-risk gate: compiled deliverables with zero enrichment
  // contribution (no model stage, no genome lessons) must be flagged loudly.
  it('flags compiled-without-enrichment packages as a content-risk warning', () => {
    let budget = createApiCallBudget({ runId: 'run-risk' });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'compiledDeliverable',
      compiledFeatureIds: ['quizBank', 'studyGuides', 'slideDecks'],
      savedProviderCalls: 12,
    });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'pipelineDecision',
      stage: 'enrichmentModelStage',
      detail: 'deterministic compile only (no enrichment object)',
      outcome: { modelStage: 'none', enrichedLessons: 0 },
    });
    const digest = buildRunDigest({ budget });
    expect(digest.gates.compiledWithoutEnrichment).toBe(true);
    expect(digest.gates.flaggedChecks[0].featureId).toBe('content');
    expect(formatRunDigest(digest)).toContain('mail-merge risk');

    // genome-only enrichment still counts as content — no warning
    budget = applyApiCallBudgetEvent(budget, {
      type: 'pipelineDecision',
      stage: 'enrichmentModelStage',
      detail: 'skipped: enrichment flag off (linker: ran)',
      outcome: { modelStage: 'skipped: enrichment flag off', enrichedLessons: 13 },
    });
    // v0.13.1 regression: every event rebuilds the budget through
    // createApiCallBudget — the outcome must SURVIVE later events. The first
    // enriched production run printed a false mail-merge warning because it
    // did not (the original test applied the pipelineDecision last).
    budget = applyApiCallBudgetEvent(budget, {
      type: 'compiledDeliverable',
      compiledFeatureIds: ['quizBank', 'studyGuides', 'slideDecks'],
      savedProviderCalls: 12,
      compilerSource: 'enriched-blueprint',
    });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'apiUsage',
      provider: 'openai',
      modelId: 'gpt-5.4-mini',
      task: 'blueprintEnrichment',
      usage: { inputTokens: 1000, outputTokens: 3000 },
      costUsd: 0.01,
    });
    const genomeDigest = buildRunDigest({ budget });
    expect(genomeDigest.gates.compiledWithoutEnrichment).toBe(false);
    expect(genomeDigest.gates.flaggedChecks).toHaveLength(0);
  });

  it('does not let finalizer retry compiles erase the primary enriched compiler truth', () => {
    let budget = createApiCallBudget({ runId: 'run-finalizer-retry-truth' });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'pipelineDecision',
      stage: 'enrichmentModelStage',
      detail: 'ran (12 lessons enriched) (linker: ran)',
      outcome: { modelStage: 'ran', enrichedLessons: 12, requestedLessons: 12, missingLessons: [] },
    });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'compiledDeliverable',
      label: 'Enriched blueprint compiler',
      featureIds: [
        'syllabus',
        'lessonPlans',
        'slideDecks',
        'assignments',
        'rubrics',
        'discussions',
        'quizBank',
        'studyGuides',
        'courseFaq',
      ],
      savedProviderCalls: 17,
      compilerSource: 'enriched-blueprint',
    });

    // v0.15.86 live run: finish-stage retries for assignments/rubrics compiled
    // individual fallback deliverables and emitted deterministic enrichment
    // decisions. Those retry-local events must not rewrite the package-wide
    // enrichment/compiled-source summary into a false mail-merge warning.
    budget = applyApiCallBudgetEvent(budget, {
      type: 'pipelineDecision',
      stage: 'enrichmentModelStage',
      detail: 'deterministic compile only (no enrichment object)',
      outcome: { modelStage: 'none', enrichedLessons: 0 },
    });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'compiledDeliverable',
      label: 'Blueprint compiler',
      featureIds: ['assignments'],
      savedProviderCalls: 2,
      compilerSource: 'blueprint',
    });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'pipelineDecision',
      stage: 'enrichmentModelStage',
      detail: 'deterministic compile only (no enrichment object)',
      outcome: { modelStage: 'none', enrichedLessons: 0 },
    });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'compiledDeliverable',
      label: 'Blueprint compiler',
      featureIds: ['rubrics'],
      savedProviderCalls: 1,
      compilerSource: 'blueprint',
    });

    const digest = buildRunDigest({
      budget,
      finish: { finalStatus: 'ready', retryCallCount: 3 },
      exportVerification: { status: 'passed', checked: 38, failed: 0, warningCount: 0, checks: [] },
      generation: { provider: 'openai', lessonCount: 12, featureIds: ['courseFaq'] },
    });

    expect(digest.pipeline.enrichmentModelStage).toBe('ran (12 lessons enriched) (linker: ran)');
    expect(digest.compilerSavings.source).toBe('enriched-blueprint');
    expect(digest.compilerSavings.compiledFeatureCount).toBe(9);
    expect(digest.compilerSavings.savedProviderCalls).toBe(20);
    expect(digest.gates.compiledWithoutEnrichment).toBe(false);
    expect(digest.gates.enrichmentCoverage).toBe(1);
    expect(digest.gates.flaggedChecks.some((check) => /mail-merge risk/i.test(check.message))).toBe(false);
  });
});
