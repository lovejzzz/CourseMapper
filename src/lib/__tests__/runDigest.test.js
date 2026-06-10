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

  it('renders a digest with no model calls without throwing', () => {
    const digest = buildRunDigest({ budget: createApiCallBudget({ runId: 'empty' }) });
    expect(digest.cost.accuracy).toBe('no model calls');
    expect(formatRunDigest(digest)).toContain('RUN DIGEST');
  });
});
