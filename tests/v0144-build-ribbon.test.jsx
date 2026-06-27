/**
 * @vitest-environment happy-dom
 *
 * v0.14.4 WS-B1/WS-B3 — one status spine.
 *
 * B1 — buildRibbonModel (pure selector) maps the api-call budget AppFlow
 *      already holds + the generation/finish lifecycle into the ribbon
 *      model: stage steps, live sub-labels parsed from the REAL event
 *      strings useDeliverables emits ("Lessons 9, 10, 11, 12 — …",
 *      "Recovery 1/2 for dropped lessons 1, 2, 3 — …"), the cost ticker,
 *      and the finished-state pipeline chips (genome / judgment / coverage)
 *      from the same budget.pipeline strings runDigest prints. No new
 *      events anywhere — the fixtures below drive the real
 *      applyApiCallBudgetEvent reducer with the event sequence from the
 *      roadmap's source console log (map call → enrichment chunks →
 *      recovery → decisions → compiler → finish).
 *
 * B3 — status dedupe: the tab bar's "Generating 0/9…" text and rainbow
 *      status dots are gone (per-tab TabReadyTick instead), the export
 *      panel's stage-narration card is gone (repairs/warnings folded into
 *      the ready card's detail line), and the chat ProgressHeader defers to
 *      the ribbon while the finish pass runs.
 */
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import BuildRibbon, { TabReadyTick } from '../src/components/BuildRibbon.jsx';
import {
  buildBuildRibbonModel,
  formatLessonRange,
  parseGenomeLinkerDetail,
  parseJudgmentDetail,
} from '../src/lib/buildRibbonModel.js';
import { applyApiCallBudgetEvent, buildJudgmentStageEvent, createApiCallBudget } from '../src/lib/apiCallBudget.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

// ── Fixture: the real reducer fed the real event sequence ────────────────────

const IDLE_GENERATION = { progressStep: 'idle', isStreaming: false, streamDetail: '' };
const DONE_GENERATION = { progressStep: 'done', isStreaming: false, streamDetail: '' };
const NO_DELIVERABLES = { isGenerating: false, doneCount: 0, totalCount: 0 };

function applyEvents(budget, events) {
  return events.reduce((current, event) => applyApiCallBudgetEvent(current, event), budget);
}

// Mirrors the run-1781228533296 console sequence the roadmap analyzed.
const MAP_EVENTS = [
  {
    type: 'costPlan',
    label: 'Generation call plan',
    costPlan: { plannedCalls: 5, softCallLimit: 8, hardCallLimit: 12 },
  },
  { type: 'courseMapCall', label: 'Course map', detail: 'single-call course map' },
  {
    type: 'apiUsage',
    label: 'Course map call',
    task: 'courseMap',
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5',
    usage: { inputTokens: 52_000, outputTokens: 9_000, costUsd: 0.13 },
    costUsd: 0.13,
  },
];

const GENOME_EVENTS = [
  {
    type: 'genomeLink',
    label: 'CurriculumOS linker',
    detail: '6 genome + 0 cached of 13 lessons (22 concepts, 18 citations, 2 bridges)',
  },
  buildJudgmentStageEvent({ judgment: null, linkedConceptCount: 22, genomeLinkedLessons: 6 }),
  {
    type: 'pipelineDecision',
    stage: 'knowledgeBackbone',
    label: 'Knowledge backbone',
    detail: '6/13 lessons genome-linked · 14 cited open resources',
  },
];

const ENRICH_CHUNK_EVENT = {
  type: 'blueprintEnrichmentCall',
  label: 'Enrich lesson kernels',
  detail: 'Lessons 9, 10, 11, 12 — 5876 input tokens estimated',
  featureId: 'blueprintEnrichment',
};

const RECOVERY_EVENT = {
  type: 'blueprintEnrichmentCall',
  label: 'Enrich lesson kernels (recovery)',
  detail: 'Recovery 1/2 for dropped lessons 1, 2, 3 — 4031 input tokens estimated',
  featureId: 'blueprintEnrichment',
};

const COMPILE_EVENTS = [
  {
    type: 'pipelineDecision',
    stage: 'enrichmentModelStage',
    label: 'Blueprint enrichment',
    detail: 'ran (13 lessons enriched)',
    outcome: { modelStage: 'ran', enrichedLessons: 13, requestedLessons: 13, missingLessons: [] },
  },
  {
    type: 'compiledDeliverable',
    label: 'Compiled deliverables from blueprint',
    featureIds: ['syllabus', 'lessonPlans', 'quizBank'],
    savedProviderCalls: 36,
    compilerSource: 'blueprint',
  },
];

function readyPass(overrides = {}) {
  return {
    status: 'ready',
    message: 'All required files passed export checks and the package is ready to download.',
    repairsApplied: 5,
    warnings: 0,
    blockers: 0,
    receipt: { exportWarningCount: 1 },
    quality: { status: 'graded', score: 100, grade: 'A', findingCounts: { p0: 0, p1: 0, p2: 0 } },
    ...overrides,
  };
}

// ── B1: selector ─────────────────────────────────────────────────────────────

describe('B1 — buildRibbonModel selector', () => {
  it('is null (ribbon hidden) on a fresh or restored workspace with no run activity', () => {
    expect(
      buildBuildRibbonModel({
        budget: createApiCallBudget(),
        generation: IDLE_GENERATION,
        deliverables: NO_DELIVERABLES,
        packageQualityPass: { status: 'idle' },
      }),
    ).toBeNull();
    // Restored project: course map exists (progressStep done) but nothing ran
    // this session — still hidden.
    expect(
      buildBuildRibbonModel({
        budget: createApiCallBudget(),
        generation: DONE_GENERATION,
        deliverables: { isGenerating: false, doneCount: 9, totalCount: 9 },
        packageQualityPass: { status: 'idle' },
      }),
    ).toBeNull();
  });

  it('map stage: active pulse on Map with the live stream detail and the cost ticker', () => {
    const budget = applyEvents(createApiCallBudget(), [{ type: 'reset', runId: 'run-ribbon-1' }, ...MAP_EVENTS]);
    const model = buildBuildRibbonModel({
      budget,
      generation: { progressStep: 'generating', isStreaming: true, streamDetail: 'Streaming lesson 4 of 13' },
      deliverables: NO_DELIVERABLES,
      packageQualityPass: { status: 'idle' },
    });
    expect(model.stage).toBe('map');
    expect(model.running).toBe(true);
    expect(model.stageLabel).toBe('Streaming lesson 4 of 13');
    expect(model.steps.map((step) => step.status)).toEqual(['active', 'pending', 'pending', 'pending', 'pending']);
    expect(model.spendDisplay).toBe('$0.13');
    expect(model.pipelineChips).toEqual([]);
  });

  it('generation umbrella (phase: generation) never marks later steps done — the 1:58 AM screenshot bug', () => {
    // Live repro: onGenerate sets packageQualityPass running as a
    // whole-pipeline umbrella BEFORE the map streams. The ribbon must not
    // read that as "finish pass running" and check Enrich/Compile early.
    const budget = applyEvents(createApiCallBudget(), [{ type: 'reset', runId: 'run-ribbon-1' }, ...MAP_EVENTS]);
    const model = buildBuildRibbonModel({
      budget,
      generation: { progressStep: 'generating', isStreaming: true, streamDetail: 'Generating the course map' },
      deliverables: NO_DELIVERABLES,
      packageQualityPass: {
        status: 'running',
        phase: 'generation',
        message: 'Generating, repairing, and verifying the package before export...',
      },
    });
    expect(model.stage).toBe('map');
    expect(model.steps.map((step) => step.status)).toEqual(['active', 'pending', 'pending', 'pending', 'pending']);
  });

  it('generation umbrella while deliverables compile: Compile is active, not pre-checked', () => {
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-ribbon-1' },
      ...MAP_EVENTS,
      ...GENOME_EVENTS,
      ENRICH_CHUNK_EVENT,
      ...COMPILE_EVENTS,
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: DONE_GENERATION,
      deliverables: { isGenerating: true, doneCount: 3, totalCount: 9 },
      packageQualityPass: { status: 'running', phase: 'generation', message: 'Generating 9 deliverables...' },
    });
    expect(model.stage).toBe('compile');
    expect(model.steps.map((step) => step.status)).toEqual(['done', 'done', 'active', 'pending', 'pending']);
    expect(model.done.compile).toBe(false);
    expect(model.done.verify).toBe(false);
  });

  it('enrich stage: the latest enrichment chunk event becomes "Enriching lessons 9–12"', () => {
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-ribbon-1' },
      ...MAP_EVENTS,
      ...GENOME_EVENTS,
      ENRICH_CHUNK_EVENT,
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: DONE_GENERATION,
      deliverables: { isGenerating: true, doneCount: 0, totalCount: 9 },
      packageQualityPass: { status: 'idle' },
    });
    expect(model.stage).toBe('enrich');
    expect(model.stageLabel).toBe('Enriching lessons 9–12');
    expect(model.steps.map((step) => step.status)).toEqual(['done', 'active', 'pending', 'pending', 'pending']);
  });

  it('recovery sub-label: "Recovery 1/2 — lessons 1–3"', () => {
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-ribbon-1' },
      ...MAP_EVENTS,
      ENRICH_CHUNK_EVENT,
      RECOVERY_EVENT,
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: DONE_GENERATION,
      deliverables: { isGenerating: true, doneCount: 0, totalCount: 9 },
      packageQualityPass: { status: 'idle' },
    });
    expect(model.stage).toBe('enrich');
    expect(model.stageLabel).toBe('Recovery 1/2 — lessons 1–3');
  });

  it('compile stage: compiler events flip the sub-label to the per-feature counter', () => {
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-ribbon-1' },
      ...MAP_EVENTS,
      ...GENOME_EVENTS,
      ENRICH_CHUNK_EVENT,
      ...COMPILE_EVENTS,
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: DONE_GENERATION,
      deliverables: { isGenerating: true, doneCount: 3, totalCount: 9 },
      packageQualityPass: { status: 'idle' },
    });
    expect(model.stage).toBe('compile');
    expect(model.stageLabel).toBe('Compiling deliverables · 3/9 ready');
    expect(model.done.enrich).toBe(true); // enrichmentOutcome landed
    expect(model.steps.map((step) => step.status)).toEqual(['done', 'done', 'active', 'pending', 'pending']);
  });

  it('compile stage: partial enrichment names the repair before finish blocks export', () => {
    const partialCompileEvents = [
      {
        ...COMPILE_EVENTS[0],
        detail: 'ran (9/12 — lessons 6, 7, 8 fell back to template)',
        outcome: { modelStage: 'ran', enrichedLessons: 9, requestedLessons: 12, missingLessons: [6, 7, 8] },
      },
      COMPILE_EVENTS[1],
    ];
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-ribbon-partial' },
      ...MAP_EVENTS,
      ENRICH_CHUNK_EVENT,
      ...partialCompileEvents,
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: DONE_GENERATION,
      deliverables: { isGenerating: true, doneCount: 3, totalCount: 9 },
      packageQualityPass: { status: 'idle' },
    });

    expect(model.stage).toBe('compile');
    expect(model.stageLabel).toBe('Compiling deliverables · 3/9 ready');
    expect(model.pipelineChips.find((chip) => chip.id === 'coverage')).toEqual({
      id: 'coverage',
      label: 'Materials 9/12 · repair needed',
      warn: true,
    });
  });

  it('verify stage while the finish pass runs — grade still pending', () => {
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-ribbon-1' },
      ...MAP_EVENTS,
      ...GENOME_EVENTS,
      ENRICH_CHUNK_EVENT,
      ...COMPILE_EVENTS,
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: DONE_GENERATION,
      deliverables: { isGenerating: false, doneCount: 9, totalCount: 9 },
      packageQualityPass: {
        status: 'running',
        message: 'Finishing package: checking, repairing, and preparing export...',
      },
    });
    expect(model.stage).toBe('verify');
    expect(model.stageLabel).toBe('Finishing package: checking, repairing, and preparing export...');
    expect(model.steps.map((step) => step.status)).toEqual(['done', 'done', 'done', 'active', 'pending']);
  });

  it('ready: all steps done, pipeline chips from the budget, quiet elapsed + spend', () => {
    const startedAt = Date.now() - 184_000;
    const budget = applyEvents(createApiCallBudget({ runId: 'run-ribbon-1', startedAt }), [
      ...MAP_EVENTS,
      ...GENOME_EVENTS,
      ENRICH_CHUNK_EVENT,
      ...COMPILE_EVENTS,
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: DONE_GENERATION,
      deliverables: { isGenerating: false, doneCount: 9, totalCount: 9 },
      packageQualityPass: readyPass(),
    });
    expect(model.stage).toBe('ready');
    expect(model.running).toBe(false);
    expect(model.steps.every((step) => step.status === 'done')).toBe(true);
    expect(model.pipelineChips).toEqual([
      { id: 'genome', label: 'Genome 6/13', emphasis: true },
      { id: 'judgment', label: 'Judgment clean' },
      { id: 'coverage', label: 'Materials 13/13' },
    ]);
    expect(model.spendDisplay).toBe('$0.13');
    const elapsed = Number((model.elapsedDisplay.match(/^Ready in (\d+)s$/) || [])[1]);
    expect(elapsed).toBeGreaterThanOrEqual(180);
    expect(elapsed).toBeLessThanOrEqual(190);
  });

  it('chips render only when their pipeline data exists', () => {
    // A finish pass on a workspace whose budget never saw linker/judgment/
    // enrichment events (e.g. deterministic-only finish) — no chips invented.
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'costPlan', label: 'Package finalizer call plan', costPlan: {} },
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: DONE_GENERATION,
      deliverables: { isGenerating: false, doneCount: 2, totalCount: 2 },
      packageQualityPass: readyPass(),
    });
    expect(model.stage).toBe('ready');
    expect(model.pipelineChips).toEqual([]);
    expect(model.elapsedDisplay).toBe(''); // zero provider calls — no honest elapsed claim
  });

  it('judgment chip speaks gaps and out-of-order counts', () => {
    const judgmentEvent = buildJudgmentStageEvent({
      judgment: { missing: 2, bridgeable: 1, assumedBackground: 1, outOfOrder: 1, primersBuilt: 1 },
    });
    const budget = applyEvents(createApiCallBudget(), [...MAP_EVENTS, GENOME_EVENTS[0], judgmentEvent]);
    const model = buildBuildRibbonModel({
      budget,
      generation: DONE_GENERATION,
      deliverables: { isGenerating: false, doneCount: 9, totalCount: 9 },
      packageQualityPass: readyPass(),
    });
    expect(model.pipelineChips.find((chip) => chip.id === 'judgment').label).toBe('Judgment 2 gaps · 1 out-of-order');
  });

  it('blocked finish: ready stage with a needs-review label and no elapsed claim', () => {
    const budget = applyEvents(createApiCallBudget(), MAP_EVENTS);
    const model = buildBuildRibbonModel({
      budget,
      generation: DONE_GENERATION,
      deliverables: { isGenerating: false, doneCount: 9, totalCount: 9 },
      packageQualityPass: { status: 'blocked', message: 'Blocked.', blockers: 2, warnings: 0, quality: null },
    });
    expect(model.stage).toBe('ready');
    expect(model.stageLabel).toBe('Needs review — 2 blockers');
    expect(model.elapsedDisplay).toBe('');
    expect(model.done.grade).toBe(false); // no quality attached
  });

  it('parser helpers stay tolerant', () => {
    expect(formatLessonRange('9, 10, 11, 12')).toBe('9–12');
    expect(formatLessonRange('1, 3, 7')).toBe('1, 3, 7');
    expect(formatLessonRange('4')).toBe('4');
    // v0.14.9 A4: the parser also reports no-shard disciplines (none here).
    expect(parseGenomeLinkerDetail('6 genome + 0 cached of 13 lessons (22 concepts)')).toEqual({
      linked: 6,
      total: 13,
      uncovered: [],
    });
    expect(parseGenomeLinkerDetail('ran')).toBeNull();
    expect(parseJudgmentDetail('no gaps across 22 linked concepts')).toBe('Judgment clean');
    expect(parseJudgmentDetail('no gaps across 1 linked concepts', { linked: 1, total: 15 })).toBe(
      'Limited knowledge check',
    );
    expect(
      parseJudgmentDetail(
        'limited knowledge check (1 linked concept across 1 genome-linked lesson; too little coverage for a clean judgment)',
      ),
    ).toBe('Limited knowledge check');
    expect(parseJudgmentDetail('not evaluated (0 genome-linked lessons)')).toBeNull();
    expect(parseJudgmentDetail('')).toBeNull();
  });
});

// ── B1: ribbon render states ─────────────────────────────────────────────────

describe('B1 — BuildRibbon render', () => {
  const renderRibbon = (model) => renderToStaticMarkup(React.createElement(BuildRibbon, { model }));

  it('renders nothing for an idle workspace (null model)', () => {
    expect(renderRibbon(null)).toBe('');
  });

  it('generating state: pulsing active step, aria-live sub-label, cost ticker', () => {
    const budget = applyEvents(createApiCallBudget(), [...MAP_EVENTS, ENRICH_CHUNK_EVENT]);
    const html = renderRibbon(
      buildBuildRibbonModel({
        budget,
        generation: DONE_GENERATION,
        deliverables: { isGenerating: true, doneCount: 0, totalCount: 9 },
        packageQualityPass: { status: 'idle' },
      }),
    );
    expect(html).toContain('data-testid="build-ribbon"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Enriching lessons 9–12');
    expect(html).toContain('animate-pulse');
    expect(html).toContain('$0.13');
    expect(html).not.toContain('ribbon-chip');
  });

  it('ready state: emerald checks on every step, chips, quiet elapsed, no pulse', () => {
    const budget = applyEvents(createApiCallBudget({ startedAt: Date.now() - 184_000 }), [
      ...MAP_EVENTS,
      ...GENOME_EVENTS,
      ENRICH_CHUNK_EVENT,
      ...COMPILE_EVENTS,
    ]);
    const html = renderRibbon(
      buildBuildRibbonModel({
        budget,
        generation: DONE_GENERATION,
        deliverables: { isGenerating: false, doneCount: 9, totalCount: 9 },
        packageQualityPass: readyPass(),
      }),
    );
    expect(html).toContain('Genome 6/13');
    expect(html).toContain('Judgment clean');
    expect(html).toContain('Materials 13/13');
    expect(html).toMatch(/Ready in \d+s/);
    expect(html).not.toContain('animate-pulse');
    // Five stage checks (one per step) — the genome chip is indigo-tinted.
    expect(html.match(/M5 13l4 4L19 7/g)?.length).toBe(5);
    expect(html).toContain('data-testid="ribbon-chip-genome"');
    expect(html.split('data-testid="ribbon-chip-genome"')[1].split('>')[0]).toContain('ribbon-chip-emphasis');
  });

  it('compile state: partial-enrichment chip renders amber before final export review', () => {
    const partialCompileEvents = [
      {
        ...COMPILE_EVENTS[0],
        detail: 'ran (9/12 — lessons 6, 7, 8 fell back to template)',
        outcome: { modelStage: 'ran', enrichedLessons: 9, requestedLessons: 12, missingLessons: [6, 7, 8] },
      },
      COMPILE_EVENTS[1],
    ];
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-ribbon-partial' },
      ...MAP_EVENTS,
      ENRICH_CHUNK_EVENT,
      ...partialCompileEvents,
    ]);
    const html = renderRibbon(
      buildBuildRibbonModel({
        budget,
        generation: DONE_GENERATION,
        deliverables: { isGenerating: true, doneCount: 3, totalCount: 9 },
        packageQualityPass: { status: 'idle' },
      }),
    );

    expect(html).toContain('Materials 9/12 · repair needed');
    expect(html.split('data-testid="ribbon-chip-coverage"')[1].split('>')[0]).toContain('ribbon-chip-warning');
  });
});

// ── B3: dedupe ───────────────────────────────────────────────────────────────

describe('B3 — per-tab ready ticks replace the rainbow dots', () => {
  const renderTick = (status) => renderToStaticMarkup(React.createElement(TabReadyTick, { status }));

  it('done renders a small emerald check, error a red cross, otherwise nothing', () => {
    const done = renderTick('done');
    expect(done).toContain('data-testid="tab-ready-tick"');
    expect(done).toContain('emerald');
    const error = renderTick('error');
    expect(error).toContain('data-testid="tab-error-tick"');
    expect(error).toContain('red');
    expect(renderTick(null)).toBe('');
    expect(renderTick('streaming')).toBe('');
  });

  it('AppFlow tab bar: dots and the "Generating 0/9…" counter are gone, ticks and ribbon are in', () => {
    const source = readSource('src/AppFlow.jsx');
    expect(source).toContain('<TabReadyTick');
    expect(source).toContain('<BuildRibbon model={buildRibbonModel}');
    expect(source).toContain("buildRibbonModel?.stage === 'ready'");
    expect(source).toContain("chip?.id === 'coverage' && chip?.warn");
    expect(source).toContain('packageReady');
    // The rainbow dot block's unique tint branch and the tab-bar counter text.
    expect(source).not.toContain("staleConf?.level === 'medium'");
    expect(source).not.toMatch(/Generating \{\w+\}\/\{\w+\}…/);
  });
});

describe('B3 — export panel and agent panel defer to the ribbon', () => {
  it('ExportSidePanel: stage-narration card removed; receipt folded into the ready card', () => {
    const source = readSource('src/components/ExportSidePanel.jsx');
    expect(source).not.toContain('function ReadinessFinalizingPanel');
    expect(source).not.toContain('Finishing package is checking materials before export.');
    expect(source).not.toContain('Checking, fixing, and verifying export.');
    expect(source).toContain('readiness-finish-summary');
    expect(source).toContain('safe repair');
    expect(source).toContain('export warning');
  });

  it('ProgressHeader: the running finish card is a one-line ribbon reference', () => {
    const source = readSource('src/components/chat/ProgressHeader.jsx');
    expect(source).toContain('Finishing — see the progress ribbon.');
    // The finished receipt message still renders once the pass completes —
    // but never the generation umbrella's own message (v0.14.6 phase split).
    expect(source).toContain('packageQualityPass.message');
    expect(source).toContain('isFinishPassRunning');
    expect(source).toContain('!isGenerationUmbrellaRunning');
  });
});
