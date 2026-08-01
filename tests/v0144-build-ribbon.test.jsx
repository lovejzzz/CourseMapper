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
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import BuildRibbon, { TabReadyTick } from '../src/components/BuildRibbon.jsx';
import {
  buildBuildRibbonModel,
  buildLivingCompilerArtifacts,
  deriveRibbonProgress,
  formatLessonRange,
  latestKnowledgeActivity,
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

const REAL_RECOVERY_EVENT = {
  type: 'repairRetryCall',
  label: 'Author lesson batch (native recovery 1/2)',
  detail: 'Lessons 1 — 1620 input tokens estimated',
  featureId: 'blueprintEnrichment',
  task: 'blueprintEnrichment',
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
    receipt: { exportWarningCount: 0 },
    quality: {
      status: 'graded',
      score: 100,
      grade: 'A',
      readiness: { score: 66, maxScore: 100 },
      findingCounts: { p0: 0, p1: 0, p2: 0 },
    },
    ...overrides,
  };
}

// ── B1: selector ─────────────────────────────────────────────────────────────

describe('B1 — buildRibbonModel selector', () => {
  it('renders Algi research as observable Enrich work instead of an opaque wait', () => {
    const event = {
      type: 'algiResearchProgress',
      label: 'Checking claims against source passages',
      detail: '12 admitted knowledge kernels',
      progress: 0.74,
    };
    const budget = applyApiCallBudgetEvent(createApiCallBudget(), event);
    expect(budget.recentEvents[0]).toMatchObject({
      type: 'algiResearchProgress',
      progress: 0.74,
    });
    expect(latestKnowledgeActivity([event])).toBe(
      'Checking claims against source passages · 12 admitted knowledge kernels',
    );
    expect(
      deriveRibbonProgress({
        pipeline: { state: 'enriching', activity: event },
        budget,
      }),
    ).toBe(44);
  });

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
      generation: {
        progressStep: 'generating',
        isStreaming: true,
        streamDetail: 'Streaming lesson 4 of 13',
        streamProgress: 50,
      },
      deliverables: NO_DELIVERABLES,
      packageQualityPass: { status: 'idle' },
    });
    expect(model.stage).toBe('map');
    expect(model.running).toBe(true);
    expect(model.stageLabel).toBe('Streaming lesson 4 of 13');
    expect(model.steps.map((step) => step.status)).toEqual(['active', 'pending', 'pending', 'pending', 'pending']);
    expect(model.spendDisplay).toBe('$0.13');
    expect(model.pipelineChips).toEqual([]);
    expect(model.progressPct).toBe(23);
  });

  it('continues one observable progress scale from model setup through ready', () => {
    const preparing = buildBuildRibbonModel({
      budget: applyEvents(createApiCallBudget(), [{ type: 'reset', runId: 'run-scion-model' }, ...MAP_EVENTS]),
      generation: {
        progressStep: 'generating',
        isStreaming: true,
        isScion: true,
        scionRuntimeStatus: {
          phase: 'loading-model',
          progress: 0.5,
          message: 'Downloading the public Gemma 4 base (50%)…',
        },
      },
      deliverables: NO_DELIVERABLES,
      packageQualityPass: { status: 'idle' },
    });
    expect(preparing.stage).toBe('model');
    expect(preparing.stageLabel).toBe('Downloading the public Gemma 4 base (50%)…');
    expect(preparing.progressPct).toBe(8);
    expect(preparing.compilerArtifacts.find((artifact) => artifact.id === 'map')).toEqual({
      id: 'map',
      label: 'Course map',
      value: 'Waiting for Scion',
      status: 'pending',
    });
    expect(preparing.steps.map((step) => [step.id, step.status])).toEqual([
      ['model', 'active'],
      ['map', 'pending'],
      ['enrich', 'pending'],
      ['compile', 'pending'],
      ['verify', 'pending'],
      ['grade', 'pending'],
    ]);

    const mapping = buildBuildRibbonModel({
      budget: applyEvents(createApiCallBudget(), [{ type: 'reset', runId: 'run-scion-map' }, ...MAP_EVENTS]),
      generation: {
        progressStep: 'generating',
        isStreaming: true,
        streamProgress: 50,
        isScion: true,
        scionRuntimeStatus: { phase: 'ready', progress: 1, message: 'Scion is ready.' },
      },
      deliverables: NO_DELIVERABLES,
      packageQualityPass: { status: 'idle' },
    });
    expect(mapping.stage).toBe('map');
    expect(mapping.progressPct).toBe(23);
    expect(mapping.steps.slice(0, 2).map((step) => [step.id, step.status])).toEqual([
      ['model', 'done'],
      ['map', 'active'],
    ]);
    expect(mapping.compilerArtifacts.find((artifact) => artifact.id === 'map')?.value).toBe('Mapping in progress');

    const planning = buildBuildRibbonModel({
      budget: applyEvents(createApiCallBudget(), [{ type: 'reset', runId: 'run-scion-plan' }, ...MAP_EVENTS]),
      generation: {
        progressStep: 'generating',
        isStreaming: true,
        streamDetail: 'Scion is reading your brief and planning 3 lessons on this device…',
        streamProgress: 0,
        lessonCount: 0,
        mappedLessonCount: 0,
        isScion: true,
        scionRuntimeStatus: { phase: 'ready', progress: 1, message: 'Scion is ready.' },
      },
      deliverables: NO_DELIVERABLES,
      packageQualityPass: { status: 'idle' },
    });
    expect(planning.stageLabel).toBe('Scion is reading your brief and planning 3 lessons on this device…');
    expect(planning.compilerArtifacts.find((artifact) => artifact.id === 'map')?.value).toBe(
      'Scion is reading your brief and planning 3 lessons on this device…',
    );

    const streamingLesson = buildBuildRibbonModel({
      budget: applyEvents(createApiCallBudget(), [{ type: 'reset', runId: 'run-scion-stream-map' }, ...MAP_EVENTS]),
      generation: {
        progressStep: 'generating',
        isStreaming: true,
        streamDetail: 'Mapping Lesson 1: Learning Goals...',
        streamProgress: 12,
        lessonCount: 1,
        mappedLessonCount: 1,
        isScion: true,
        scionRuntimeStatus: { phase: 'ready', progress: 1, message: 'Scion is ready.' },
      },
      deliverables: NO_DELIVERABLES,
      packageQualityPass: { status: 'idle' },
    });
    expect(streamingLesson.compilerArtifacts.find((artifact) => artifact.id === 'map')?.value).toBe(
      'Mapping lesson 1 · 1 mapped so far',
    );

    expect(
      deriveRibbonProgress({
        pipeline: { state: 'enriching', activity: { detail: 'Lessons 9, 10, 11, 12 — source-bound kernel' } },
        generation: { lessonCount: 13 },
      }),
    ).toBe(43);
    expect(
      deriveRibbonProgress({
        pipeline: { state: 'enriching', activity: { detail: 'Lessons 1 — source-bound kernel' } },
        budget: {
          blueprintEnrichmentCalls: 1,
          recentEvents: [
            { type: 'courseMapCall', detail: 'Mapped 4 lessons with 2190 input tokens' },
            { type: 'blueprintEnrichmentCall', detail: 'Lessons 1 — 1120 input tokens estimated' },
          ],
        },
        generation: { lessonCount: 4 },
      }),
    ).toBe(31);
    expect(
      deriveRibbonProgress({
        pipeline: {
          state: 'enriching',
          activity: {
            type: 'blueprintEnrichmentCall',
            label: 'Author lesson batch (native Pass B)',
            detail: 'Lessons 1 — 1159 input tokens estimated',
          },
        },
        generation: { lessonCount: 1 },
      }),
    ).toBe(34);
    expect(
      [1, 2, 3, 4].map((attempt) =>
        deriveRibbonProgress({
          pipeline: {
            state: 'enriching',
            activity: {
              type: 'repairRetryCall',
              label: `Author lesson batch (native recovery ${attempt}/4)`,
              detail: 'Lessons 1 — 1159 input tokens estimated',
            },
          },
          generation: { lessonCount: 1 },
        }),
      ),
    ).toEqual([45, 46, 48, 49]);
    const oneLessonRetryFrame = (recentEvents) =>
      deriveRibbonProgress({
        pipeline: {
          state: 'enriching',
          activity: recentEvents.find((event) => event.type === 'repairRetryCall') || {
            type: 'blueprintEnrichmentCall',
            detail: 'Lessons 1 — 1159 input tokens estimated',
          },
        },
        budget: {
          costPlan: { blueprintEnrichmentRecoveryReserve: 1 },
          recentEvents,
        },
        generation: { lessonCount: 1 },
      });
    const initialRetryOne = {
      type: 'streamRetryCall',
      featureId: 'blueprintEnrichment',
      task: 'blueprintEnrichment',
      attempt: 1,
      maxRetries: 2,
      at: 10,
    };
    const initialRetryTwo = { ...initialRetryOne, attempt: 2, at: 20 };
    const outerRecovery = {
      type: 'repairRetryCall',
      featureId: 'blueprintEnrichment',
      task: 'blueprintEnrichment',
      label: 'Enrich lesson kernels (recovery)',
      detail: 'Recovery 1/1 for dropped lesson 1 — 1159 input tokens estimated',
      at: 30,
    };
    const recoveryRetryOne = { ...initialRetryOne, attempt: 1, at: 40 };
    const recoveryRetryTwo = { ...initialRetryOne, attempt: 2, at: 50 };
    expect([
      oneLessonRetryFrame([initialRetryOne]),
      oneLessonRetryFrame([initialRetryTwo, initialRetryOne]),
      oneLessonRetryFrame([outerRecovery, initialRetryTwo, initialRetryOne]),
      oneLessonRetryFrame([recoveryRetryOne, outerRecovery, initialRetryTwo]),
      oneLessonRetryFrame([recoveryRetryTwo, recoveryRetryOne, outerRecovery]),
    ]).toEqual([34, 34, 45, 47, 48]);
    expect(
      deriveRibbonProgress({
        pipeline: { state: 'enriching', activity: REAL_RECOVERY_EVENT },
        budget: { blueprintEnrichmentCalls: 15, recentEvents: [REAL_RECOVERY_EVENT] },
        generation: { lessonCount: 15 },
      }),
    ).toBe(45);
    expect(
      deriveRibbonProgress({
        pipeline: {
          state: 'enriching',
          activity: {
            type: 'pipelineDecision',
            label: 'Scion pass call',
            detail: 'prose_polish',
            chunkLabel: 'lesson-14',
          },
        },
        generation: { lessonCount: 14 },
      }),
    ).toBe(44);
    expect(
      deriveRibbonProgress({
        pipeline: {
          state: 'enriching',
          activity: {
            type: 'pipelineDecision',
            label: 'Scion pass call',
            detail: 'key_term_admission_batch',
            chunkLabel: 'lesson-2',
            at: 40,
          },
        },
        budget: {
          recentEvents: [
            {
              type: 'pipelineDecision',
              label: 'Scion pass call',
              detail: 'key_term_admission_batch',
              chunkLabel: 'lesson-2',
              at: 40,
            },
            {
              type: 'repairRetryCall',
              label: 'Author lesson batch (native recovery 2/2)',
              detail: 'Lessons 2 — source-bound kernel',
              at: 30,
            },
          ],
        },
        generation: { lessonCount: 15 },
      }),
    ).toBe(48);
    const lessonFourQueuedProgress = deriveRibbonProgress({
      pipeline: {
        state: 'enriching',
        activity: {
          type: 'blueprintEnrichmentCall',
          detail: 'Lessons 4 — source-bound kernel',
          at: 30,
        },
      },
      budget: {
        recentEvents: [
          {
            type: 'blueprintEnrichmentCall',
            detail: 'Lessons 4 — source-bound kernel',
            at: 30,
          },
        ],
      },
      generation: { lessonCount: 15 },
    });
    expect(lessonFourQueuedProgress).toBe(33);
    expect(
      deriveRibbonProgress({
        pipeline: {
          state: 'enriching',
          activity: {
            type: 'pipelineDecision',
            label: 'Scion pass call',
            detail: 'blind_solve',
            chunkLabel: 'lesson-2',
            at: 40,
          },
        },
        budget: {
          recentEvents: [
            {
              type: 'pipelineDecision',
              label: 'Scion pass call',
              detail: 'blind_solve',
              chunkLabel: 'lesson-2',
              at: 40,
            },
            {
              type: 'blueprintEnrichmentCall',
              detail: 'Lessons 4 — source-bound kernel',
              at: 30,
            },
          ],
        },
        generation: { lessonCount: 15 },
      }),
    ).toBeGreaterThanOrEqual(lessonFourQueuedProgress);
    const longCourseLastPass = {
      type: 'pipelineDecision',
      label: 'Scion quality passes',
      detail: 'polish:lesson-15 done',
      chunkLabel: 'lesson-15',
      at: 100,
    };
    const longCourseRecovery = {
      type: 'repairRetryCall',
      label: 'Author lesson batch (native recovery 1/2)',
      detail: 'Lessons 1 — 1699 input tokens estimated',
      at: 110,
    };
    const lastPassProgress = deriveRibbonProgress({
      pipeline: { state: 'enriching', activity: longCourseLastPass },
      budget: {
        // Match the real reducer's bounded event window: the recovery frame
        // cannot depend on the initial course events still being retained.
        recentEvents: Array.from({ length: 24 }, (_, index) =>
          index === 0
            ? longCourseLastPass
            : {
                type: 'pipelineDecision',
                label: 'Scion pass call',
                detail: 'blind_solve',
                chunkLabel: `lesson-${Math.max(1, 15 - index)}`,
                at: 99 - index,
              },
        ),
      },
      generation: { lessonCount: 15 },
    });
    const recoveryProgress = deriveRibbonProgress({
      pipeline: { state: 'enriching', activity: longCourseRecovery },
      budget: {
        recentEvents: [
          longCourseRecovery,
          ...Array.from({ length: 23 }, (_, index) => ({
            type: 'pipelineDecision',
            label: 'Scion pass call',
            detail: 'blind_solve',
            chunkLabel: `lesson-${Math.max(1, 14 - index)}`,
            at: 99 - index,
          })),
        ],
      },
      generation: { lessonCount: 15 },
    });
    expect(lastPassProgress).toBe(45);
    expect(recoveryProgress).toBeGreaterThanOrEqual(lastPassProgress);
    expect(
      deriveRibbonProgress({
        pipeline: {
          state: 'enriching',
          activity: {
            type: 'pipelineDecision',
            label: 'Scion quality passes',
            detail: 'polish:lesson-14 applied',
            chunkLabel: 'lesson-14',
          },
        },
        generation: { lessonCount: 14 },
      }),
    ).toBe(45);
    expect(
      deriveRibbonProgress({
        pipeline: { state: 'compiling' },
        deliverables: { doneCount: 3, totalCount: 9 },
      }),
    ).toBe(58);
    expect(deriveRibbonProgress({ pipeline: { state: 'verifying' } })).toBe(85);
    expect(deriveRibbonProgress({ pipeline: { state: 'grading' } })).toBe(95);
    expect(deriveRibbonProgress({ pipeline: { state: 'blocked' } })).toBe(99);
    expect(deriveRibbonProgress({ pipeline: { state: 'ready' } })).toBe(100);
  });

  it('keeps every observable frame target monotonic across the full Scion journey', () => {
    const modelFrame = (progress) =>
      deriveRibbonProgress({
        pipeline: { state: 'mapping' },
        generation: {
          isScion: true,
          scionRuntimeStatus: { phase: 'loading-model', progress },
        },
      });
    const mapFrame = (streamProgress) =>
      deriveRibbonProgress({ pipeline: { state: 'mapping' }, generation: { streamProgress } });
    const recoveryFrame = (attempt) =>
      deriveRibbonProgress({
        pipeline: {
          state: 'enriching',
          activity: {
            type: 'repairRetryCall',
            label: `Author lesson batch (native recovery ${attempt}/4)`,
            detail: 'Lessons 1 — source-bound kernel',
          },
        },
        generation: { lessonCount: 1 },
      });
    const compileFrame = (doneCount) =>
      deriveRibbonProgress({
        pipeline: { state: 'compiling' },
        deliverables: { doneCount, totalCount: 9 },
      });

    const frames = [
      modelFrame(0),
      modelFrame(0.5),
      modelFrame(1),
      mapFrame(0),
      mapFrame(50),
      mapFrame(100),
      deriveRibbonProgress({
        pipeline: {
          state: 'enriching',
          activity: {
            type: 'blueprintEnrichmentCall',
            label: 'Author lesson batch (native Pass B)',
            detail: 'Lessons 1 — source-bound kernel',
          },
        },
        generation: { lessonCount: 1 },
      }),
      ...[1, 2, 3, 4].map(recoveryFrame),
      compileFrame(0),
      compileFrame(1),
      compileFrame(3),
      compileFrame(9),
      deriveRibbonProgress({ pipeline: { state: 'verifying' } }),
      deriveRibbonProgress({ pipeline: { state: 'grading' } }),
      deriveRibbonProgress({ pipeline: { state: 'ready' } }),
    ];

    expect(frames).toEqual([0, 8, 15, 16, 23, 30, 34, 45, 46, 48, 49, 50, 53, 58, 75, 85, 95, 100]);
    expect(frames.every((value, index) => index === 0 || value >= frames[index - 1])).toBe(true);
  });

  it('builds a truthful live artifact ledger from observed pipeline state', () => {
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-living-compiler' },
      ...MAP_EVENTS,
      ...GENOME_EVENTS,
      ENRICH_CHUNK_EVENT,
      ...COMPILE_EVENTS,
    ]);
    const pipeline = {
      state: 'compiling',
      done: { map: true, enrich: true, compile: false, verify: false, grade: false },
    };

    expect(
      buildLivingCompilerArtifacts({
        pipeline,
        budget,
        generation: { lessonCount: 13 },
        deliverables: { doneCount: 3, totalCount: 9 },
        packageQualityPass: { status: 'idle' },
      }),
    ).toEqual([
      { id: 'map', label: 'Course map', value: '13 lessons mapped', status: 'settled' },
      {
        id: 'knowledge',
        label: 'Knowledge',
        value: '13/13 lesson kernels · 6/13 source-linked',
        status: 'settled',
      },
      { id: 'materials', label: 'Materials', value: '3/9 ready', status: 'active' },
      { id: 'checks', label: 'Checks', value: 'Waiting', status: 'pending' },
    ]);
  });

  it('shows honest readiness, repairs, and blockers without presenting conformance as quality', () => {
    const base = {
      pipeline: { state: 'ready', done: { map: true, enrich: true, compile: true, verify: true, grade: true } },
      generation: { lessonCount: 15 },
      deliverables: { doneCount: 10, totalCount: 10 },
    };
    const ready = buildLivingCompilerArtifacts({
      ...base,
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        quality: { grade: 'A', readiness: { score: 66, maxScore: 100 } },
      },
    });
    expect(ready.find((artifact) => artifact.id === 'checks')).toEqual({
      id: 'checks',
      label: 'Checks',
      value: 'Readiness 66/100',
      status: 'done',
    });

    const blocked = buildLivingCompilerArtifacts({
      ...base,
      pipeline: { ...base.pipeline, state: 'blocked' },
      packageQualityPass: { status: 'blocked', blockers: 2 },
    });
    expect(blocked.find((artifact) => artifact.id === 'checks')).toEqual({
      id: 'checks',
      label: 'Checks',
      value: '2 items to refine',
      status: 'warn',
    });
  });

  it('translates real semantic-pass events into calm live language', () => {
    expect(
      latestKnowledgeActivity([
        {
          type: 'scionCompilerRepair',
          label: 'Scion varied answer positions',
          detail: 'lesson-7 · item 2',
          stage: 'local-compiler',
        },
        ENRICH_CHUNK_EVENT,
      ]),
    ).toBe('Scion varied answer positions · lesson-7 · item 2');
    expect(
      latestKnowledgeActivity([
        {
          type: 'pipelineDecision',
          label: 'Scion pass call',
          detail: 'blind_solve',
          chunkLabel: 'lesson-7',
        },
        ENRICH_CHUNK_EVENT,
      ]),
    ).toBe('Checking answer keys · lesson 7');
    expect(
      latestKnowledgeActivity([
        {
          type: 'pipelineDecision',
          label: 'Scion pass call',
          detail: 'key_term_admission_batch',
          chunkLabel: 'lesson-2',
          at: 40,
        },
        {
          type: 'repairRetryCall',
          label: 'Author lesson batch (native recovery 2/2)',
          detail: 'Lessons 2 — source-bound kernel',
          at: 30,
        },
      ]),
    ).toBe('Recovery 2/2 · Checking key terms · lesson 2');
    expect(
      latestKnowledgeActivity([
        {
          type: 'pipelineDecision',
          label: 'Scion quality passes',
          detail: 'passBudget:lesson-2 bounded [5/5-calls-used-before-keyTermAdmission]',
        },
      ]),
    ).toBe('Lesson checks complete · compiling');
    expect(
      latestKnowledgeActivity([
        { type: 'pipelineDecision', label: 'Scion pass call', detail: 'key_term_admission_batch' },
      ]),
    ).toBe('Checking key terms');
    expect(
      latestKnowledgeActivity([
        {
          type: 'pipelineDecision',
          label: 'Scion quality passes',
          detail: 'identityRepair:lesson-7 inferred [single-lesson-call]',
        },
        { type: 'pipelineDecision', label: 'Scion pass call', detail: 'blind_solve' },
      ]),
    ).toBe('Linking lesson to course map');
    expect(
      latestKnowledgeActivity([
        {
          type: 'pipelineDecision',
          label: 'Scion quality passes',
          detail: 'keyTermAdmission:lesson-7 regenerated',
        },
      ]),
    ).toBe('Key terms checked');
    expect(
      latestKnowledgeActivity([
        ENRICH_CHUNK_EVENT,
        { type: 'pipelineDecision', label: 'Scion quality passes', detail: 'keyTermAdmission:lesson-8 regenerated' },
      ]),
    ).toBe('Enriching lessons 9–12');
    expect(
      latestKnowledgeActivity([
        {
          type: 'streamRetryCall',
          featureId: 'blueprintEnrichment',
          task: 'blueprintEnrichment',
          attempt: 1,
          maxRetries: 2,
        },
        ENRICH_CHUNK_EVENT,
      ]),
    ).toBe('Retrying local lesson kernel · lessons 9–12 · attempt 2/3');
    expect(
      latestKnowledgeActivity([
        {
          type: 'streamRetryCall',
          featureId: 'blueprintEnrichment',
          task: 'blueprintEnrichment',
          attempt: 1,
          maxRetries: 2,
          at: 200,
        },
        {
          type: 'repairRetryCall',
          label: 'Enrich lesson kernels (recovery)',
          detail: 'Recovery 1/1 for dropped lesson 1 — 1159 input tokens estimated',
          at: 100,
        },
      ]),
    ).toBe('Recovery 1/1 · retrying local lesson kernel · lesson 1 · attempt 2/3');
    expect(latestKnowledgeActivity([ENRICH_CHUNK_EVENT])).toBe('Enriching lessons 9–12');
    expect(latestKnowledgeActivity([])).toBe('Building lesson knowledge');
  });

  it('narrates a language-identity rejection as a calm safety decision', () => {
    expect(
      latestKnowledgeActivity([
        {
          type: 'pipelineDecision',
          label: 'Language identity firewall',
          detail: 'Lessons 2, 4 — rejected korean teaching content that conflicts with Elementary Mandarin Chinese I',
        },
      ]),
    ).toBe('Protecting course identity · lessons 2, 4');
  });

  it('makes the final grading stage visible before the meter reaches ready', () => {
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-scion-grade' },
      ...MAP_EVENTS,
      ...GENOME_EVENTS,
      ENRICH_CHUNK_EVENT,
      ...COMPILE_EVENTS,
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: DONE_GENERATION,
      deliverables: { isGenerating: false, doneCount: 9, totalCount: 9 },
      packageQualityPass: { status: 'running', phase: 'grade', message: 'Grading package quality...' },
    });

    expect(model.stage).toBe('grade');
    expect(model.stageLabel).toBe('Grading package quality...');
    expect(model.progressPct).toBe(95);
    expect(model.steps.map((step) => [step.id, step.status])).toEqual([
      ['map', 'settled'],
      ['enrich', 'settled'],
      ['compile', 'settled'],
      ['verify', 'settled'],
      ['grade', 'active'],
    ]);
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
    expect(model.steps.map((step) => step.status)).toEqual(['settled', 'settled', 'active', 'pending', 'pending']);
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
    expect(model.compilerArtifacts.find((artifact) => artifact.id === 'knowledge')).toEqual({
      id: 'knowledge',
      label: 'Knowledge',
      value: 'Enriching lessons 9–12 · 6/13 source-linked',
      status: 'active',
    });
    expect(model.steps.map((step) => step.status)).toEqual(['settled', 'active', 'pending', 'pending', 'pending']);
  });

  it('names bounded public-source lookup instead of leaving a long quiet compiler plateau', () => {
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-reading-lookup' },
      ...MAP_EVENTS,
      {
        type: 'knowledgeBackboneLookup',
        stage: 'knowledge-backbone',
        label: 'Finding open readings',
        detail: 'Checking public sources for up to 4 lessons',
      },
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: { ...DONE_GENERATION, lessonCount: 4, mappedLessonCount: 4 },
      deliverables: { isGenerating: true, doneCount: 0, totalCount: 2 },
      packageQualityPass: { status: 'idle' },
    });

    expect(model.stage).toBe('enrich');
    expect(model.stageLabel).toBe('Finding open readings · up to 4 lessons');
    expect(model.progressPct).toBe(48);
    expect(model.compilerArtifacts.find((artifact) => artifact.id === 'knowledge')).toMatchObject({
      status: 'active',
      value: 'Finding open readings · up to 4 lessons',
    });
  });

  it('shows observed source-retrieval counts without an amber warning while retrieval is active', () => {
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-reading-progress' },
      ...MAP_EVENTS,
      {
        type: 'blueprintEnrichmentCall',
        label: 'Author lesson batch (native Pass B)',
        detail: 'Lessons 1',
        outcome: { enrichedLessons: 0, requestedLessons: 4, missingLessons: [1, 2, 3, 4] },
      },
      {
        type: 'knowledgeBackboneProgress',
        stage: 'knowledge-backbone',
        label: 'Checking open readings',
        detail: '2/4 lessons checked · using fallback source',
      },
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: { ...DONE_GENERATION, lessonCount: 4, mappedLessonCount: 4 },
      deliverables: { isGenerating: true, doneCount: 0, totalCount: 2 },
      packageQualityPass: { status: 'idle' },
    });

    expect(model.stage).toBe('enrich');
    expect(model.stageLabel).toBe('Checking open readings · 2/4 lessons checked · using fallback source');
    expect(model.compilerArtifacts.find((artifact) => artifact.id === 'knowledge')).toMatchObject({
      status: 'active',
      value: expect.stringContaining('2/4 lessons checked'),
    });
    expect(model.pipelineChips).toEqual([]);
  });

  it('distinguishes complementary source-finder progress from the first open-reading pass', () => {
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-complementary-progress' },
      ...MAP_EVENTS,
      {
        type: 'knowledgeBackboneProgress',
        stage: 'knowledge-backbone',
        label: 'Checking complementary sources',
        detail: '3/4 lessons checked',
      },
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: { ...DONE_GENERATION, lessonCount: 4, mappedLessonCount: 4 },
      deliverables: { isGenerating: true, doneCount: 0, totalCount: 2 },
      packageQualityPass: { status: 'idle' },
    });

    expect(model.stage).toBe('enrich');
    expect(model.stageLabel).toBe('Checking complementary sources · 3/4 lessons checked');
  });

  it('never moves Overall backward when source lookup overlaps observed compiler work', () => {
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-overlap' },
      ...MAP_EVENTS,
      {
        type: 'deliverableChunkCall',
        featureId: 'lessonPlans',
        label: 'Generate Lesson Plans [1-4]',
      },
      {
        type: 'knowledgeBackboneLookup',
        stage: 'knowledge-backbone',
        label: 'Finding open readings',
        detail: 'Checking public sources for up to 4 lessons',
      },
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: { ...DONE_GENERATION, lessonCount: 4, mappedLessonCount: 4 },
      deliverables: { isGenerating: true, doneCount: 0, totalCount: 2 },
      packageQualityPass: { status: 'idle' },
    });

    expect(model.stage).toBe('enrich');
    expect(model.progressPct).toBe(50);
  });

  it('treats partial knowledge as active work, not a warning, until Enrich settles', () => {
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-active-partial' },
      ...MAP_EVENTS,
      {
        type: 'blueprintEnrichmentCall',
        label: 'Author lesson batch (native Pass B)',
        detail: 'Lessons 1',
        outcome: { enrichedLessons: 0, requestedLessons: 4, missingLessons: [1, 2, 3, 4] },
      },
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: { ...DONE_GENERATION, lessonCount: 4, mappedLessonCount: 4 },
      deliverables: { isGenerating: true, doneCount: 0, totalCount: 2 },
      packageQualityPass: { status: 'idle' },
    });

    expect(model.compilerArtifacts.find((artifact) => artifact.id === 'knowledge')).toMatchObject({ status: 'active' });
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

  it('narrates the real repairRetryCall recovery event as Enrich work', () => {
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-ribbon-real-recovery' },
      ...MAP_EVENTS,
      ENRICH_CHUNK_EVENT,
      REAL_RECOVERY_EVENT,
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: DONE_GENERATION,
      deliverables: { isGenerating: true, doneCount: 0, totalCount: 9 },
      packageQualityPass: { status: 'idle' },
    });
    expect(model.stage).toBe('enrich');
    expect(model.stageLabel).toBe('Recovery 1/2 — lesson 1');
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
    expect(model.steps.map((step) => step.status)).toEqual(['settled', 'settled', 'active', 'pending', 'pending']);
  });

  it('names the material and lesson range while a model chunk or repair is active', () => {
    const generationBudget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-material-label' },
      ...MAP_EVENTS,
      { type: 'deliverableChunkCall', label: 'Generate Course FAQ [1-4]', featureId: 'courseFaq' },
    ]);
    const generating = buildBuildRibbonModel({
      budget: generationBudget,
      generation: DONE_GENERATION,
      deliverables: { isGenerating: true, doneCount: 1, totalCount: 2 },
      packageQualityPass: { status: 'idle' },
    });
    expect(generating.stageLabel).toBe('Generating Course FAQ · lessons 1–4');

    const repairBudget = applyEvents(generationBudget, [
      { type: 'repairRetryCall', label: 'Course FAQ retry [1-2]', featureId: 'courseFaq' },
    ]);
    const repairing = buildBuildRibbonModel({
      budget: repairBudget,
      generation: DONE_GENERATION,
      deliverables: { isGenerating: true, doneCount: 1, totalCount: 2 },
      packageQualityPass: { status: 'idle' },
    });
    expect(repairing.stageLabel).toBe('Repairing Course FAQ · lessons 1–2');
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
      label: 'Knowledge 9/12 · review needed',
      warn: true,
    });
  });

  it('failed course-map generation renders blocked instead of a stale Building state', () => {
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-ribbon-credit-fail' },
      { type: 'providerRequestFailed', label: 'Provider API error', detail: 'quota exceeded' },
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: { progressStep: 'error', isStreaming: false, streamDetail: '' },
      deliverables: NO_DELIVERABLES,
      packageQualityPass: {
        status: 'blocked',
        message: 'Model credits unavailable.',
        blockers: 1,
      },
    });

    expect(model.stage).toBe('ready');
    expect(model.running).toBe(false);
    expect(model.stageLabel).toBe('Refining package — 1 item');
    expect(model.steps.map((step) => step.status)).not.toContain('active');
  });

  it('renders an incomplete map as a nonterminal error with honest progress and counts', () => {
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-ribbon-incomplete-map' },
      { type: 'courseMapCall', label: 'Course-map generation' },
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: {
        progressStep: 'error',
        isStreaming: false,
        mappedLessonCount: 9,
        expectedLessonCount: 10,
        error: 'AI generation failed: Course map generation stopped at 9 of 10 lessons.',
      },
      deliverables: NO_DELIVERABLES,
      packageQualityPass: { status: 'blocked', blockers: 1 },
    });

    expect(model.compilerState).toBe('error');
    expect(model.progressPct).toBeLessThan(100);
    expect(model.stageLabel).toBe('Course map generation stopped at 9 of 10 lessons.');
    expect(model.steps.find((step) => step.id === 'map')?.status).toBe('error');
    expect(model.compilerArtifacts.find((artifact) => artifact.id === 'map')).toMatchObject({
      value: '9/10 lessons mapped',
      status: 'error',
    });
    expect(model.compilerArtifacts.find((artifact) => artifact.id === 'checks')?.value).toBe(
      'Not run · map incomplete',
    );
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
    expect(model.steps.map((step) => step.status)).toEqual(['settled', 'settled', 'settled', 'active', 'pending']);
  });

  it('narrates the bounded compile-to-verify handoff instead of leaving the 75% frame blank', () => {
    const budget = applyEvents(createApiCallBudget(), [
      { type: 'reset', runId: 'run-ribbon-handoff' },
      ...MAP_EVENTS,
      ...COMPILE_EVENTS,
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: DONE_GENERATION,
      deliverables: { isGenerating: false, doneCount: 9, totalCount: 9 },
      packageQualityPass: { status: 'running', phase: 'generation' },
    });

    expect(model.stage).toBe('verify');
    expect(model.running).toBe(false);
    // The UI's monotonic high-water mark preserves the prior 75% compiler
    // frame; the selector itself truthfully reports the three settled stages.
    expect(model.progressPct).toBe(66);
    expect(model.stageLabel).toBe('Preparing package checks');
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
      { id: 'judgment', label: 'Sequence check passed' },
      { id: 'coverage', label: 'Knowledge 13/13' },
    ]);
    expect(model.spendDisplay).toBe('$0.13');
    const elapsed = Number((model.elapsedDisplay.match(/^Ready in (\d+)s$/) || [])[1]);
    expect(elapsed).toBeGreaterThanOrEqual(180);
    expect(elapsed).toBeLessThanOrEqual(190);
  });

  it('keeps the completed build duration frozen while the user chats with Agent', () => {
    const now = Date.now();
    const buildFinishedAt = now - 100_000;
    const packageFinishedAt = now - 80_000;
    const quality = {
      ...readyPass().quality,
      gradedAt: new Date(packageFinishedAt).toISOString(),
    };
    const budget = createApiCallBudget({
      startedAt: now - 200_000,
      updatedAt: buildFinishedAt,
      buildUpdatedAt: buildFinishedAt,
      courseMapCalls: 1,
    });
    const modelBeforeAgent = buildBuildRibbonModel({
      budget,
      generation: DONE_GENERATION,
      deliverables: { isGenerating: false, doneCount: 5, totalCount: 5 },
      packageQualityPass: readyPass({ quality }),
    });
    const afterAgent = applyApiCallBudgetEvent(budget, {
      type: 'agentLoopCall',
      task: 'agent',
      label: 'Agent loop provider call',
    });
    const modelAfterAgent = buildBuildRibbonModel({
      budget: afterAgent,
      generation: DONE_GENERATION,
      deliverables: { isGenerating: false, doneCount: 5, totalCount: 5 },
      packageQualityPass: readyPass({ quality }),
    });

    expect(afterAgent.updatedAt).toBeGreaterThan(afterAgent.buildUpdatedAt);
    expect(modelBeforeAgent.elapsedDisplay).toBe('Ready in 120s');
    expect(modelAfterAgent.elapsedDisplay).toBe(modelBeforeAgent.elapsedDisplay);
  });

  it('measures readiness through export verification and grading, not only generation', () => {
    const budget = createApiCallBudget({
      startedAt: 1_000,
      updatedAt: 11_000,
      buildUpdatedAt: 11_000,
      courseMapCalls: 1,
    });
    const model = buildBuildRibbonModel({
      budget,
      generation: DONE_GENERATION,
      deliverables: { isGenerating: false, doneCount: 9, totalCount: 9 },
      packageQualityPass: readyPass({
        quality: {
          ...readyPass().quality,
          gradedAt: new Date(21_000).toISOString(),
        },
      }),
    });

    expect(model.elapsedDisplay).toBe('Ready in 20s');
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
    expect(model.stageLabel).toBe('Refining package — 2 items');
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
    expect(parseJudgmentDetail('no gaps across 22 linked concepts')).toBe('Sequence check passed');
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

  it('keeps the rendered Overall meter monotonic within one run and resets for the next run', () => {
    const base = {
      activeStartedAt: 100,
      compilerArtifacts: [],
      compilerState: 'live',
      pipelineChips: [],
      progressPct: 50,
      stageLabel: 'Compiling deliverables',
      steps: [],
    };
    const container = document.createElement('div');
    const root = createRoot(container);
    const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const progress = () =>
      container.querySelector('[data-testid="build-progress-track"]')?.getAttribute('aria-valuenow');
    act(() => root.render(<BuildRibbon model={base} />));
    expect(progress()).toBe('50');

    act(() => root.render(<BuildRibbon model={{ ...base, progressPct: 48, stageLabel: 'Finding open readings' }} />));
    expect(progress()).toBe('50');

    act(() => root.render(<BuildRibbon model={{ ...base, activeStartedAt: 200, progressPct: 16 }} />));
    expect(progress()).toBe('16');
    act(() => root.unmount());
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  it('generating state: pulsing active step, aria-live sub-label, cost ticker', () => {
    const budget = applyEvents(createApiCallBudget({ startedAt: Date.now() - 5_000 }), [
      ...MAP_EVENTS,
      ENRICH_CHUNK_EVENT,
    ]);
    const html = renderRibbon(
      buildBuildRibbonModel({
        budget,
        generation: DONE_GENERATION,
        deliverables: { isGenerating: true, doneCount: 0, totalCount: 9 },
        packageQualityPass: { status: 'idle' },
      }),
    );
    expect(html).toContain('data-testid="build-ribbon"');
    expect(html).toContain('Living Course Compiler');
    expect(html).toContain('data-testid="living-compiler-signal"');
    expect(html).toContain('data-state="live"');
    expect(html).toContain('data-testid="living-compiler-artifacts"');
    expect(html).toContain('data-testid="living-artifact-knowledge"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Enriching lessons 9–12');
    expect(html).toContain('animate-pulse');
    expect(html).toContain('$0.13');
    expect(html).not.toContain('ribbon-chip');
    expect(html).toContain('data-status="settled"');
    expect(html).toContain('data-testid="build-progress-track"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('data-testid="ribbon-progress-label"');
    expect(html).toContain('data-testid="ribbon-active-elapsed"');
    expect(html).toContain('ease-out');
    expect(html).toContain('motion-reduce:transition-none');
    expect(html).toContain('motion-reduce:animate-none');
    expect(html).not.toContain('M5 13l4 4L19 7');
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
    expect(html).toContain('data-state="complete"');
    expect(html).toContain('Ready to export');
    expect(html).toContain('Readiness 66/100');
    expect(html).toContain('Sequence check passed');
    expect(html).toContain('Knowledge 13/13');
    expect(html).toMatch(/Ready in \d+s/);
    expect(html).not.toContain('animate-pulse');
    // Five stage checks plus four confirmed artifact checks.
    expect(html.match(/M5 13l4 4L19 7/g)?.length).toBe(9);
    expect(html).toContain('data-testid="ribbon-chip-genome"');
    expect(html.split('data-testid="ribbon-chip-genome"')[1].split('>')[0]).toContain('ribbon-chip-emphasis');
  });

  it('ready state names missing knowledge as review work instead of a successful material count', () => {
    const failedKnowledgeEvent = {
      ...COMPILE_EVENTS[0],
      detail: 'failed: no usable kernels parsed (0/2)',
      outcome: {
        modelStage: 'failed: no usable kernels parsed',
        enrichedLessons: 0,
        requestedLessons: 2,
        missingLessons: [1, 2],
      },
    };
    const budget = applyEvents(createApiCallBudget(), [
      ...MAP_EVENTS,
      ENRICH_CHUNK_EVENT,
      failedKnowledgeEvent,
      COMPILE_EVENTS[1],
    ]);
    const model = buildBuildRibbonModel({
      budget,
      generation: { ...DONE_GENERATION, lessonCount: 2, mappedLessonCount: 2 },
      deliverables: { isGenerating: false, doneCount: 9, totalCount: 9 },
      packageQualityPass: readyPass({ grade: 'B' }),
    });
    const html = renderRibbon(model);

    expect(model.stageLabel).toBe('Exportable with review notes');
    expect(model.compilerArtifacts.find((artifact) => artifact.id === 'knowledge')).toMatchObject({
      label: 'Knowledge',
      value: '0/2 lesson kernels',
      status: 'warn',
    });
    expect(model.steps.find((step) => step.id === 'enrich')).toMatchObject({ status: 'warn' });
    expect(html).toContain('Knowledge 0/2 · review needed');
    expect(html).not.toContain('Materials 0/2');
  });

  it('blocked state uses the amber review signal even after grading completed', () => {
    const html = renderRibbon(
      buildBuildRibbonModel({
        budget: applyEvents(createApiCallBudget(), [...MAP_EVENTS, ENRICH_CHUNK_EVENT, ...COMPILE_EVENTS]),
        generation: DONE_GENERATION,
        deliverables: { isGenerating: false, doneCount: 9, totalCount: 9 },
        packageQualityPass: readyPass({ status: 'blocked', blockers: 1 }),
      }),
    );
    expect(html).toContain('Refining package — 1 item');
    expect(html).toContain('Review required');
    expect(html).not.toContain('Build complete');
    expect(html).toContain('data-state="review"');
    expect(html).not.toContain('data-state="complete"');
  });

  it('gives live narration a full second row on phone-sized layouts', () => {
    const source = readSource('src/components/BuildRibbon.jsx');
    expect(source).toContain('flex-wrap items-center');
    expect(source).toContain('sm:flex-nowrap');
    expect(source).toContain('order-3 w-full');
    expect(source).toContain('sm:order-none sm:w-auto sm:flex-1 sm:truncate');
    expect(source).toContain('auto-cols-fr grid-flow-col');
    expect(source).toContain('className="hidden sm:block"');
    expect(source).toContain('text-[12px]');
    expect(source).not.toContain('text-[10px]');
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

    expect(html).toContain('Knowledge 9/12 · review needed');
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
