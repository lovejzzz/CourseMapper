/**
 * v0.14.1 Phase 2 — Honesty: coverage, judgment, and gates that measure
 * meaning. The v0.14 audit shipped Physical Geology with lessons 13/14 on
 * template content ("ran (12 lessons enriched)" looked green) and a judgment
 * layer that never spoke. These tests pin the fixes:
 *
 *  2.1 parseLessonKernelResponse records an issue row per DROPPED LESSON
 *      (no-lesson-id, all-atoms-linted-out) and rejects out-of-chunk
 *      lessonIds instead of overwriting another chunk's lesson.
 *  2.2 Coverage reaches every surface: the shared label formatter renders
 *      "ran (12/14 — lessons 13, 14 fell back to template)", the extended
 *      enrichmentOutcome SURVIVES trailing budget events (the v0.13.2
 *      whitelist trap), and the run digest flags partial enrichment.
 *  2.4 The judgment stage event is emitted in all three states with the
 *      exact detail strings, and lands in budget.pipeline.judgment.
 */
import { describe, expect, it } from 'vitest';

import { buildLessonKernelPrompt, parseLessonKernelResponse } from '../src/lib/blueprintEnrichmentPass.js';
import {
  applyApiCallBudgetEvent,
  buildJudgmentStageEvent,
  buildSourceBackedJudgmentStageEvent,
  createApiCallBudget,
  formatEnrichmentOutcomeLabel,
  normalizeEnrichmentOutcome,
} from '../src/lib/apiCallBudget.js';
import { buildRunDigest, formatRunDigest } from '../src/lib/runDigest.js';
import { buildEnrichmentCoverageIssues } from '../src/lib/packageFinalizer.js';

// ── Fixtures (kernel content mirrors src/lib/__tests__/kernelProjection) ──

const COURSE_MAP = {
  courseName: 'Climate Justice and Community Resilience',
  lessons: [1, 2, 3, 4].map((n) => ({
    title: `Lesson ${n}: Climate Topic ${n}`,
    sections: [
      {
        topicSection: `${n}.1: Climate System Basics`,
        learningObjectives: 'Explain key climate science concepts, including greenhouse effects.',
        weeklyAssessments: `Week ${n} concepts check.`,
        supportingResources: 'Course climate science primer; IPCC summary materials (open access).',
      },
    ],
  })),
};

const GOOD_KERNEL_ENTRY = {
  facts: [
    'CO2 absorbs outgoing longwave radiation and re-emits part of it toward the surface',
    'Atmospheric CO2 has risen from 280 ppm before industrialization to over 420 ppm today',
    'The greenhouse effect keeps Earth roughly 33C warmer than an airless baseline would be',
    'Ocean heat uptake delays surface warming for decades after emissions occur',
    'Urban heat islands amplify local warming independently of the global greenhouse signal',
  ],
  keyTerms: [
    {
      term: 'Greenhouse effect',
      definition:
        'The warming that results when atmospheric gases absorb outgoing longwave radiation and re-emit part of it back toward the surface.',
      example: 'CO2 and methane absorb infrared radiation that would otherwise escape to space.',
      misconception: 'Students often believe the greenhouse effect is caused by the ozone layer hole.',
      correction: 'Greenhouse warming comes from infrared absorption and re-emission, not ozone depletion.',
    },
    {
      term: 'Albedo',
      definition: 'The fraction of incoming sunlight a surface reflects back to space rather than absorbing.',
      example: 'Fresh snow reflects most incoming sunlight while dark ocean water absorbs it.',
      misconception: 'Students confuse albedo-driven reflection of incoming sunlight with greenhouse trapping.',
      correction: 'Albedo concerns reflected incoming sunlight, while greenhouse gases affect outgoing radiation.',
    },
    {
      term: 'Radiative forcing',
      definition: 'The change in the energy balance of the climate system caused by a factor such as added CO2.',
      example: 'Doubling CO2 adds roughly 3.7 watts per square meter of forcing.',
      misconception: 'Many assume CO2 produces direct heating of air through chemical reactions instead of radiation.',
      correction: 'CO2 changes radiative energy flow; it does not warm air through an exothermic chemical reaction.',
    },
  ],
  mc: [
    {
      question: 'Which process explains why increasing atmospheric CO2 raises global mean surface temperature?',
      options: [
        'Absorption and re-emission of outgoing longwave radiation by greenhouse gases',
        'Increased reflection of incoming sunlight by a thicker atmosphere',
        'Direct heating of the air by CO2 chemical reactions',
        'Reduction of the ozone layer allowing more ultraviolet light through',
      ],
      answerIndex: 0,
      explanation:
        'Greenhouse gases absorb outgoing longwave radiation and re-emit part of it back toward the surface.',
    },
  ],
};

const ALL_BAD_ATOMS_ENTRY = {
  lessonId: 'lesson-3',
  facts: ['too short'],
  keyTerms: [{ term: 'A', definition: 'too short' }],
  mc: [{ question: 'short?', options: ['a'], answerIndex: 0 }],
};

// ── 2.1 Per-lesson drop tracking ──

describe('parseLessonKernelResponse per-lesson drop tracking (P2.1)', () => {
  const prompt = buildLessonKernelPrompt(COURSE_MAP, [0, 1, 2, 3]);

  it('names every dropped lesson in issues and excludes them from parsed lessons', () => {
    const response = JSON.stringify({
      lessons: [
        { lessonId: 'lesson-1', ...GOOD_KERNEL_ENTRY },
        { ...GOOD_KERNEL_ENTRY }, // no lessonId — previously a silent skip
        ALL_BAD_ATOMS_ENTRY, // every atom fails lint — previously only per-atom rows
        { lessonId: 'lesson-9', ...GOOD_KERNEL_ENTRY }, // outside the 4-lesson chunk
      ],
    });
    const parsed = parseLessonKernelResponse(response, { prompt });

    expect(Object.keys(parsed.lessons)).toEqual(['lesson-1']);

    const noId = parsed.issues.find((issue) => issue.reason === 'no-lesson-id');
    expect(noId).toBeTruthy();
    expect(noId.lessonId).toBe('unknown-entry');
    expect(noId.surface).toBe('lesson');

    const lintedOut = parsed.issues.find((issue) => issue.reason === 'all-atoms-linted-out');
    expect(lintedOut).toBeTruthy();
    expect(lintedOut.lessonId).toBe('lesson-3');
    // The per-atom rows are counted, not lost: 1 fact + 1 keyTerm + 1 mc.
    expect(lintedOut.atomIssueCount).toBe(3);

    const outOfChunk = parsed.issues.find((issue) => issue.reason === 'out-of-chunk-lesson-id');
    expect(outOfChunk).toBeTruthy();
    expect(outOfChunk.lessonId).toBe('lesson-9');
    expect(parsed.lessons['lesson-9']).toBeUndefined();
  });

  it('honors an explicit expectedLessonIds list over the prompt lesson list', () => {
    const response = JSON.stringify({ lessons: [{ lessonId: 'lesson-1', ...GOOD_KERNEL_ENTRY }] });
    const parsed = parseLessonKernelResponse(response, {
      prompt,
      expectedLessonIds: ['lesson-2'],
    });
    // lesson-1 is outside the declared chunk → rejected, nothing parsed.
    expect(parsed).toBeNull();
  });

  it('keeps in-chunk lessons intact when other entries are dropped', () => {
    const response = JSON.stringify({
      lessons: [{ lessonId: 'lesson-2', ...GOOD_KERNEL_ENTRY }, ALL_BAD_ATOMS_ENTRY],
    });
    const parsed = parseLessonKernelResponse(response, {
      prompt,
      expectedLessonIds: ['lesson-2', 'lesson-3'],
    });
    expect(Object.keys(parsed.lessons)).toEqual(['lesson-2']);
    expect(parsed.lessons['lesson-2'].keyTerms.length).toBeGreaterThanOrEqual(3);
    expect(parsed.issues.some((issue) => issue.reason === 'all-atoms-linted-out')).toBe(true);
  });
});

// ── 2.2 Coverage string ──

describe('enrichment coverage label (P2.2)', () => {
  it('renders the partial form with the missing lesson numbers', () => {
    expect(
      formatEnrichmentOutcomeLabel({
        modelStage: 'ran',
        enrichedLessons: 12,
        requestedLessons: 14,
        missingLessons: [13, 14],
      }),
    ).toBe('ran (12/14 — lessons 13, 14 fell back to template)');
  });

  it('keeps the simple form at full coverage', () => {
    expect(
      formatEnrichmentOutcomeLabel({
        modelStage: 'ran',
        enrichedLessons: 14,
        requestedLessons: 14,
        missingLessons: [],
      }),
    ).toBe('ran (14 lessons enriched)');
  });

  it('uses singular grammar for one missing lesson', () => {
    expect(
      formatEnrichmentOutcomeLabel({
        modelStage: 'ran',
        enrichedLessons: 13,
        requestedLessons: 14,
        missingLessons: [8],
      }),
    ).toBe('ran (13/14 — lesson 8 fell back to template)');
  });

  it('uses the missing-lesson ledger when payload objects overstate admitted coverage', () => {
    const inconsistent = {
      modelStage: 'ran',
      enrichedLessons: 9,
      requestedLessons: 15,
      missingLessons: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    };
    expect(normalizeEnrichmentOutcome(inconsistent)).toMatchObject({
      enrichedLessons: 1,
      requestedLessons: 15,
      missingLessons: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    });
    expect(formatEnrichmentOutcomeLabel(inconsistent)).toBe(
      'ran (1/15 — lessons 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 fell back to template)',
    );

    let budget = createApiCallBudget({ runId: 'run-inconsistent-coverage' });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'pipelineDecision',
      stage: 'enrichmentModelStage',
      outcome: inconsistent,
    });
    expect(budget.enrichmentOutcome.enrichedLessons).toBe(1);
    expect(buildRunDigest({ budget }).gates.enrichmentCoverage).toBeCloseTo(1 / 15, 5);
  });

  it('keeps the legacy genome-only and skipped forms', () => {
    expect(formatEnrichmentOutcomeLabel({ modelStage: 'skipped: enrichment flag off', enrichedLessons: 13 })).toBe(
      'genome-only (13 lessons); model stage skipped: enrichment flag off',
    );
    expect(formatEnrichmentOutcomeLabel({ modelStage: 'skipped: no model configured', enrichedLessons: 0 })).toBe(
      'skipped: no model configured',
    );
    expect(formatEnrichmentOutcomeLabel(null)).toBe('unknown');
  });
});

// ── 2.2 The whitelist trap: trailing-event survival ──

describe('extended enrichmentOutcome survives trailing budget events (P2.2)', () => {
  it('carries requestedLessons + missingLessons through later, unrelated events', () => {
    let budget = createApiCallBudget({ runId: 'run-coverage' });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'pipelineDecision',
      stage: 'enrichmentModelStage',
      detail: 'ran (12/14 — lessons 13, 14 fell back to template) (linker: ran)',
      outcome: { modelStage: 'ran', enrichedLessons: 12, requestedLessons: 14, missingLessons: [13, 14] },
    });

    // v0.13.2 lesson: every event rebuilds the budget through
    // createApiCallBudget's field whitelist — the extended field must
    // survive TRAILING events, not just the event that set it.
    budget = applyApiCallBudgetEvent(budget, {
      type: 'compiledDeliverable',
      compiledFeatureIds: ['quizBank', 'studyGuides'],
      savedProviderCalls: 8,
    });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'apiUsage',
      provider: 'openai',
      modelId: 'gpt-5.4-mini',
      task: 'blueprintEnrichment',
      usage: { inputTokens: 900, outputTokens: 2800 },
      costUsd: 0.012,
    });

    expect(budget.enrichmentOutcome).toEqual({
      modelStage: 'ran',
      enrichedLessons: 12,
      requestedLessons: 14,
      missingLessons: [13, 14],
    });
    expect(formatEnrichmentOutcomeLabel(budget.enrichmentOutcome)).toBe(
      'ran (12/14 — lessons 13, 14 fell back to template)',
    );
  });
});

// ── 2.4 Judgment always speaks ──

describe('judgment stage event in all three states (P2.4)', () => {
  it('reports gaps with the existing detail format when gaps exist', () => {
    const event = buildJudgmentStageEvent({
      judgment: { missing: 2, outOfOrder: 1, bridgeable: 1, assumedBackground: 1, primersBuilt: 1 },
      linkedConceptCount: 9,
      genomeLinkedLessons: 6,
    });
    expect(event.type).toBe('pipelineDecision');
    expect(event.stage).toBe('judgment');
    expect(event.detail).toBe(
      '2 prerequisite gaps (1 bridgeable with cited primers, 1 assumed background) · 1 out-of-order · 1 primer built',
    );
  });

  it('reports a clean run over linked concepts', () => {
    const event = buildJudgmentStageEvent({
      judgment: { missing: 0, outOfOrder: 0, bridgeable: 0, assumedBackground: 0, primersBuilt: 0 },
      linkedConceptCount: 9,
      genomeLinkedLessons: 6,
    });
    expect(event.detail).toBe('no gaps across 9 linked concepts');
  });

  it('does not call a one-concept knowledge check clean', () => {
    const event = buildJudgmentStageEvent({
      judgment: { missing: 0, outOfOrder: 0, bridgeable: 0, assumedBackground: 0, primersBuilt: 0 },
      linkedConceptCount: 1,
      genomeLinkedLessons: 1,
    });
    expect(event.detail).toBe(
      'limited knowledge check (1 linked concept across 1 genome-linked lesson; too little coverage for a clean judgment)',
    );
  });

  it('reports not-evaluated when the linker found nothing', () => {
    const event = buildJudgmentStageEvent({ judgment: null, linkedConceptCount: 0, genomeLinkedLessons: 0 });
    expect(event.detail).toBe('not evaluated (0 genome-linked lessons)');
  });

  it('replaces the stale zero-genome judgment with complete source-backed coverage proof', () => {
    const initial = buildJudgmentStageEvent({ judgment: null, linkedConceptCount: 0, genomeLinkedLessons: 0 });
    const sourceBacked = buildSourceBackedJudgmentStageEvent({
      sourceRefCoverage: {
        totals: { total: 255, withRefs: 255, missing: 0, danglingRefs: 0 },
      },
      citedResourceCount: 11,
      lessonsWithResources: 15,
      totalLessons: 15,
      genomeLinkedLessons: 0,
    });
    expect(sourceBacked.detail).toBe(
      'source-backed coverage check (255/255 sourceRef atoms covered; 15/15 lessons with cited resources; genome prerequisite judgment unavailable)',
    );

    let budget = applyApiCallBudgetEvent(createApiCallBudget({ runId: 'run-source-j' }), initial);
    budget = applyApiCallBudgetEvent(budget, sourceBacked);
    const digest = buildRunDigest({ budget });
    expect(digest.pipeline.judgment).toBe(sourceBacked.detail);
    expect(formatRunDigest(digest)).toContain(`course judgment: ${sourceBacked.detail}`);
  });

  it('does not render impossible source-backed lesson counts', () => {
    const sourceBacked = buildSourceBackedJudgmentStageEvent({
      sourceRefCoverage: {
        totals: { total: 182, withRefs: 182, missing: 0, danglingRefs: 0 },
      },
      citedResourceCount: 4,
      lessonsWithResources: 19,
      totalLessons: 12,
      genomeLinkedLessons: 0,
    });
    expect(sourceBacked.detail).toBe(
      'source-backed coverage check (182/182 sourceRef atoms covered; 12/12 lessons with cited resources; genome prerequisite judgment unavailable)',
    );
  });

  it('does not claim source-backed judgment when source proof is incomplete', () => {
    expect(
      buildSourceBackedJudgmentStageEvent({
        sourceRefCoverage: {
          totals: { total: 8, withRefs: 7, missing: 1, danglingRefs: 0 },
        },
        citedResourceCount: 2,
        lessonsWithResources: 3,
        totalLessons: 4,
        genomeLinkedLessons: 0,
      }),
    ).toBeNull();
  });

  it('lands in budget.pipeline.judgment so digest and manifest always carry the line', () => {
    for (const args of [
      { judgment: { missing: 1, outOfOrder: 0, bridgeable: 1, assumedBackground: 0, primersBuilt: 1 } },
      { judgment: { missing: 0, outOfOrder: 0 }, linkedConceptCount: 4, genomeLinkedLessons: 3 },
      {},
    ]) {
      const event = buildJudgmentStageEvent(args);
      const budget = applyApiCallBudgetEvent(createApiCallBudget({ runId: 'run-j' }), event);
      expect(budget.pipeline.judgment).toBe(event.detail);
      const digest = buildRunDigest({ budget });
      expect(digest.pipeline.judgment).toBe(event.detail);
      expect(formatRunDigest(digest)).toContain(`course judgment: ${event.detail}`);
    }
  });
});

// ── 2.2 Digest gates flag partial enrichment ──

describe('run digest partial-enrichment gate (P2.2)', () => {
  function budgetWithOutcome(outcome) {
    let budget = createApiCallBudget({ runId: 'run-gate' });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'pipelineDecision',
      stage: 'enrichmentModelStage',
      detail: `${formatEnrichmentOutcomeLabel(outcome)} (linker: ran)`,
      outcome,
    });
    // Trailing event — coverage must survive into the digest.
    budget = applyApiCallBudgetEvent(budget, {
      type: 'compiledDeliverable',
      compiledFeatureIds: ['quizBank'],
      savedProviderCalls: 4,
    });
    return budget;
  }

  it('fails partial coverage with the lesson numbers and exposes the fraction', () => {
    const digest = buildRunDigest({
      budget: budgetWithOutcome({
        modelStage: 'ran',
        enrichedLessons: 12,
        requestedLessons: 14,
        missingLessons: [13, 14],
      }),
    });
    expect(digest.gates.enrichmentCoverage).toBeCloseTo(12 / 14, 5);
    const partial = digest.gates.flaggedChecks.find((check) => check.message.includes('partial enrichment'));
    expect(partial).toBeTruthy();
    expect(partial.status).toBe('failed');
    expect(partial.message).toBe('partial enrichment (12/14) — lessons 13, 14 fell back to template');
    expect(formatRunDigest(digest)).toContain('partial enrichment (12/14)');
    // The pipeline line carries the same coverage string.
    expect(digest.pipeline.enrichmentModelStage).toContain('ran (12/14 — lessons 13, 14 fell back to template)');
  });

  it('keeps partial coverage failed even if the caller passes a ready finish state', () => {
    const digest = buildRunDigest({
      budget: budgetWithOutcome({
        modelStage: 'ran',
        enrichedLessons: 4,
        requestedLessons: 7,
        missingLessons: [5, 6, 7],
      }),
      finish: { finalStatus: 'ready' },
    });
    const partial = digest.gates.flaggedChecks.find((check) => check.message.includes('partial enrichment'));
    expect(partial).toMatchObject({
      featureId: 'content',
      status: 'failed',
      message: 'partial enrichment (4/7) — lessons 5, 6, 7 fell back to template',
    });
  });

  it('stays quiet at full coverage', () => {
    const digest = buildRunDigest({
      budget: budgetWithOutcome({
        modelStage: 'ran',
        enrichedLessons: 14,
        requestedLessons: 14,
        missingLessons: [],
      }),
    });
    expect(digest.gates.enrichmentCoverage).toBe(1);
    expect(digest.gates.compiledWithoutEnrichment).toBe(false);
    expect(digest.gates.flaggedChecks.some((check) => check.message.includes('partial enrichment'))).toBe(false);
  });

  it('keeps the v0.12.1 compiled-without-enrichment warning intact', () => {
    const digest = buildRunDigest({
      budget: budgetWithOutcome({ modelStage: 'none', enrichedLessons: 0 }),
    });
    expect(digest.gates.compiledWithoutEnrichment).toBe(true);
    expect(digest.gates.flaggedChecks[0].message).toContain('mail-merge risk');
    expect(digest.gates.flaggedChecks.some((check) => check.message.includes('partial enrichment'))).toBe(false);
  });
});

// ── 2.2 Finalizer warning surface ──

describe('finalizer enrichment-coverage issues (P2.2)', () => {
  it('turns partial coverage into a package blocker with missing lesson numbers', () => {
    const issues = buildEnrichmentCoverageIssues({
      modelStage: 'ran',
      enrichedLessons: 12,
      requestedLessons: 14,
      missingLessons: [13, 14],
    });
    expect(issues).toEqual([
      expect.objectContaining({
        severity: 'blocker',
        featureId: 'courseMap',
        label: 'Enrichment coverage',
        source: 'enrichmentCoverage',
        retryable: false,
        autoFixable: false,
        requiresInstructorDecision: false,
        message:
          'Enrichment covered 12/14 lessons; lessons 13, 14 fell back to template. Retry or repair enrichment before exporting a clean package.',
      }),
    ]);
  });

  it('blocks all remaining post-recovery partial coverage, including the 9/12 live-audit shape', () => {
    expect(
      buildEnrichmentCoverageIssues({
        modelStage: 'ran',
        enrichedLessons: 9,
        requestedLessons: 12,
        missingLessons: [6, 7, 8],
      })[0],
    ).toEqual(
      expect.objectContaining({
        severity: 'blocker',
        message:
          'Enrichment covered 9/12 lessons; lessons 6, 7, 8 fell back to template. Retry or repair enrichment before exporting a clean package.',
      }),
    );
    expect(
      buildEnrichmentCoverageIssues({
        modelStage: 'ran',
        enrichedLessons: 4,
        requestedLessons: 7,
        missingLessons: [5, 6, 7],
      })[0],
    ).toEqual(expect.objectContaining({ severity: 'blocker' }));
  });

  it('emits nothing at full coverage or when the model stage did not run', () => {
    expect(buildEnrichmentCoverageIssues({ modelStage: 'ran', enrichedLessons: 14, requestedLessons: 14 })).toEqual([]);
    expect(buildEnrichmentCoverageIssues({ modelStage: 'skipped: enrichment flag off', enrichedLessons: 3 })).toEqual(
      [],
    );
    expect(buildEnrichmentCoverageIssues(null)).toEqual([]);
  });
});

describe('finalizer download status with partial coverage', () => {
  it('blocks export readiness for the live 4/7 coverage shape', () => {
    const issues = buildEnrichmentCoverageIssues({
      modelStage: 'ran',
      enrichedLessons: 4,
      requestedLessons: 7,
      missingLessons: [5, 6, 7],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual(expect.objectContaining({ severity: 'blocker', source: 'enrichmentCoverage' }));
  });
});
