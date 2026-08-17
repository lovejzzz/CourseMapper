/**
 * v0.14.7 WS-C — the pipeline state machine.
 *
 * derivePipelineState is the ONE phase authority: every precedence rule the
 * surfaces used to re-derive from six overlapping booleans lives here, in
 * one tested place. This file is the MATRIX TEST the roadmap bar demands:
 * every machine state enumerated, with the step-render asserted for each —
 * the test that was impossible to write against scattered flags.
 */
import { describe, expect, it } from 'vitest';

import { derivePipelineState, deriveStepStatuses } from '../src/lib/pipelineMachine.js';

const GEN_IDLE = { progressStep: 'idle', isStreaming: false };
const GEN_STREAMING = { progressStep: 'generating', isStreaming: true };
const GEN_ERROR = { progressStep: 'error', isStreaming: false };
const GEN_DONE = { progressStep: 'done', isStreaming: false };
const DELIV_IDLE = { isGenerating: false, doneCount: 0, totalCount: 0 };
const DELIV_RUNNING = { isGenerating: true, doneCount: 3, totalCount: 9 };
const DELIV_DONE = { isGenerating: false, doneCount: 9, totalCount: 9 };
const ENRICH_EVENT = { type: 'blueprintEnrichmentCall', label: 'Enrich lesson kernels', detail: 'Lessons 1, 2' };
const RECOVERY_EVENT = {
  type: 'repairRetryCall',
  label: 'Author lesson batch (native recovery 1/2)',
  detail: 'Lessons 1 — 1620 input tokens estimated',
  featureId: 'blueprintEnrichment',
  task: 'blueprintEnrichment',
};
const SCION_PASS_EVENT = {
  type: 'pipelineDecision',
  label: 'Scion pass call',
  detail: 'blind_solve',
  chunkLabel: 'lesson-7',
  featureId: 'blueprintEnrichment',
  task: 'scionPass',
};
const SCION_COMPILER_REPAIR_EVENT = {
  type: 'scionCompilerRepair',
  label: 'Scion retained a complete source fact',
  detail: 'lesson-2 · facts',
  stage: 'local-compiler',
};
const COMPILE_EVENT = { type: 'compiledDeliverable', label: 'Enriched blueprint compiler' };
const ALGI_RESEARCH_EVENT = {
  type: 'algiResearchProgress',
  label: 'Researching DOAJ',
  detail: '3 lessons',
  progress: 0.42,
};

const statuses = (pipeline) => deriveStepStatuses(pipeline).map((step) => step.status);

describe('WS-C — the state matrix: every machine state and its step render', () => {
  it('idle: fresh workspace, nothing anywhere', () => {
    const p = derivePipelineState({ generation: GEN_IDLE, deliverables: DELIV_IDLE });
    expect(p.state).toBe('idle');
    expect(p.running).toBe(false);
    expect(statuses(p)).toEqual(['pending', 'pending', 'pending', 'pending', 'pending', 'pending']);
  });

  it('mapping: stream active — and the generation umbrella may NOT pre-check later steps', () => {
    const p = derivePipelineState({
      generation: GEN_STREAMING,
      deliverables: DELIV_IDLE,
      packageQualityPass: { status: 'running', phase: 'generation' },
    });
    expect(p.state).toBe('mapping');
    expect(statuses(p)).toEqual(['active', 'pending', 'pending', 'pending', 'pending', 'pending']);
  });

  it('planning: a mapped blueprint waits visibly for instructor approval without running drafting', () => {
    const p = derivePipelineState({
      generation: GEN_DONE,
      deliverables: DELIV_IDLE,
      packageQualityPass: { status: 'awaiting-approval', phase: 'plan' },
    });
    expect(p.state).toBe('planning');
    expect(p.running).toBe(false);
    expect(p.nextStep).toBe('plan');
    expect(statuses(p)).toEqual(['settled', 'active', 'pending', 'pending', 'pending', 'pending']);
  });

  it('enriching: deliverables generating with kernel activity as the latest event', () => {
    const p = derivePipelineState({
      budget: { recentEvents: [ENRICH_EVENT] },
      generation: GEN_DONE,
      deliverables: DELIV_RUNNING,
      packageQualityPass: { status: 'running', phase: 'generation' },
    });
    expect(p.state).toBe('enriching');
    expect(p.activity).toBe(ENRICH_EVENT);
    expect(statuses(p)).toEqual(['settled', 'settled', 'active', 'pending', 'pending', 'pending']);
  });

  it('keeps live Algi research in Enrich and exposes its exact evidence phase', () => {
    const p = derivePipelineState({
      budget: { recentEvents: [ALGI_RESEARCH_EVENT] },
      generation: GEN_DONE,
      deliverables: DELIV_RUNNING,
      packageQualityPass: { status: 'running', phase: 'generation' },
    });
    expect(p.state).toBe('enriching');
    expect(p.activity).toBe(ALGI_RESEARCH_EVENT);
    expect(statuses(p)).toEqual(['settled', 'settled', 'active', 'pending', 'pending', 'pending']);
  });

  it('keeps the first Scion deliverable frame in Enrich before its budget event lands', () => {
    const p = derivePipelineState({
      budget: { recentEvents: [] },
      generation: { ...GEN_DONE, isScion: true },
      deliverables: { isGenerating: true, doneCount: 0, totalCount: 9 },
      packageQualityPass: { status: 'running', phase: 'generation' },
    });
    expect(p.state).toBe('enriching');
    expect(p.activity).toBeNull();
    expect(statuses(p)).toEqual(['settled', 'settled', 'active', 'pending', 'pending', 'pending']);
  });

  it('keeps a visible Scion compiler decision in Enrich instead of flashing Compile', () => {
    const p = derivePipelineState({
      budget: { recentEvents: [SCION_COMPILER_REPAIR_EVENT, ENRICH_EVENT] },
      generation: GEN_DONE,
      deliverables: DELIV_RUNNING,
      packageQualityPass: { status: 'running', phase: 'generation' },
    });
    expect(p.state).toBe('enriching');
    expect(p.activity).toBe(SCION_COMPILER_REPAIR_EVENT);
    expect(statuses(p)).toEqual(['settled', 'settled', 'active', 'pending', 'pending', 'pending']);
  });

  it('keeps a real lesson-kernel recovery in Enrich instead of mislabeling it Compile', () => {
    const p = derivePipelineState({
      budget: { recentEvents: [RECOVERY_EVENT, ENRICH_EVENT] },
      generation: GEN_DONE,
      deliverables: DELIV_RUNNING,
      packageQualityPass: { status: 'running', phase: 'generation' },
    });
    expect(p.state).toBe('enriching');
    expect(p.activity).toBe(RECOVERY_EVENT);
    expect(statuses(p)).toEqual(['settled', 'settled', 'active', 'pending', 'pending', 'pending']);
  });

  it('keeps live Scion semantic checks in Enrich and exposes the newest check as its activity', () => {
    const p = derivePipelineState({
      budget: { recentEvents: [SCION_PASS_EVENT, ENRICH_EVENT] },
      generation: GEN_DONE,
      deliverables: DELIV_RUNNING,
    });
    expect(p.state).toBe('enriching');
    expect(p.activity).toBe(SCION_PASS_EVENT);
  });

  it('compiling: deliverables generating with compiler activity', () => {
    const p = derivePipelineState({
      budget: { recentEvents: [COMPILE_EVENT, ENRICH_EVENT], enrichmentOutcome: { enrichedLessons: 9 } },
      generation: GEN_DONE,
      deliverables: DELIV_RUNNING,
    });
    expect(p.state).toBe('compiling');
    expect(statuses(p)).toEqual(['settled', 'settled', 'settled', 'active', 'pending', 'pending']);
  });

  it('verifying: the finish pass (phase finish), map and deliverables settled', () => {
    const p = derivePipelineState({
      budget: { enrichmentOutcome: { enrichedLessons: 9 } },
      generation: GEN_DONE,
      deliverables: DELIV_DONE,
      packageQualityPass: { status: 'running', phase: 'finish' },
    });
    expect(p.state).toBe('verifying');
    expect(statuses(p)).toEqual(['settled', 'settled', 'settled', 'settled', 'active', 'pending']);
  });

  it('verifying NEVER wins while deliverables still run, even with phase finish (the belt)', () => {
    const p = derivePipelineState({
      budget: { recentEvents: [COMPILE_EVENT] },
      generation: GEN_DONE,
      deliverables: DELIV_RUNNING,
      packageQualityPass: { status: 'running', phase: 'finish' },
    });
    expect(p.state).toBe('compiling');
  });

  it('grading: verification is settled and Grade becomes the active final stage', () => {
    const p = derivePipelineState({
      budget: { enrichmentOutcome: { enrichedLessons: 9 } },
      generation: GEN_DONE,
      deliverables: DELIV_DONE,
      packageQualityPass: { status: 'running', phase: 'grade' },
    });
    expect(p.state).toBe('grading');
    expect(p.done.verify).toBe(true);
    expect(p.done.grade).toBe(false);
    expect(statuses(p)).toEqual(['settled', 'settled', 'settled', 'settled', 'settled', 'active']);
  });

  it('ready: finish complete, grade attached — all steps green', () => {
    const p = derivePipelineState({
      generation: GEN_DONE,
      deliverables: DELIV_DONE,
      packageQualityPass: { status: 'ready', quality: { score: 100, grade: 'A' } },
    });
    expect(p.state).toBe('ready');
    expect(p.running).toBe(false);
    expect(p.done.grade).toBe(true);
    expect(statuses(p)).toEqual(['done', 'done', 'done', 'done', 'done', 'done']);
  });

  it('blocked: finish complete with blockers — named reason, no clean-ready checks', () => {
    const p = derivePipelineState({
      generation: GEN_DONE,
      deliverables: DELIV_DONE,
      packageQualityPass: { status: 'blocked', blockers: 2 },
    });
    expect(p.state).toBe('blocked');
    expect(p.blockedReason).toBe('2 blockers');
    expect(statuses(p)).toEqual(['settled', 'settled', 'settled', 'settled', 'settled', 'pending']);
  });

  it('blocked generation failure: provider-credit errors do not leave Map active', () => {
    const p = derivePipelineState({
      budget: { recentEvents: [{ type: 'providerRequestFailed', label: 'Provider API error' }] },
      generation: GEN_ERROR,
      deliverables: DELIV_IDLE,
      packageQualityPass: { status: 'blocked', blockers: 1 },
    });
    expect(p.state).toBe('blocked');
    expect(p.running).toBe(false);
    expect(statuses(p)).not.toContain('active');
  });

  it('syncing: approved sync executing post-ready owns the narrative', () => {
    const p = derivePipelineState({
      generation: GEN_DONE,
      deliverables: DELIV_DONE,
      packageQualityPass: { status: 'ready', quality: { score: 100 } },
      sync: { isSyncing: true, pendingCount: 3 },
    });
    expect(p.state).toBe('syncing');
    expect(p.running).toBe(true);
    // Post-ready sync keeps earned checks; nothing regresses to pending.
    expect(statuses(p)).toEqual(['done', 'done', 'done', 'done', 'done', 'done']);
  });

  it('syncing NEVER wins while generation runs (sync refuses mid-run by design)', () => {
    const p = derivePipelineState({
      generation: GEN_STREAMING,
      deliverables: DELIV_IDLE,
      sync: { isSyncing: true },
    });
    expect(p.state).toBe('mapping');
  });

  it('lull: map done, deliverables not started — next pending step named, no pulse', () => {
    const p = derivePipelineState({
      budget: { recentEvents: [{ type: 'courseMapCall', label: 'Course map' }] },
      generation: GEN_DONE,
      deliverables: DELIV_IDLE,
      packageQualityPass: { status: 'running', phase: 'generation' },
    });
    expect(p.state).toBe('lull');
    expect(p.running).toBe(false);
    expect(p.nextStep).toBe('enrich');
    expect(statuses(p)).toEqual(['settled', 'settled', 'pending', 'pending', 'pending', 'pending']);
  });

  it('legacy finish states without a phase still mean the finish pass (back-compat)', () => {
    const p = derivePipelineState({
      generation: GEN_DONE,
      deliverables: DELIV_DONE,
      packageQualityPass: { status: 'running', message: 'Finishing package…' },
    });
    expect(p.state).toBe('verifying');
  });
});
