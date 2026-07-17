/**
 * v0.14.7 WS-A — parallel prose enrichment.
 *
 * The enrichment chunk loop in useDeliverables.js runs concurrently (groups
 * of 4) instead of serially — on a 15-lesson course the serial waits were
 * most of the 152s-vs-65s gap against the native path. Two properties pin
 * the change:
 *
 * (1) Budget integrity under interleave: blueprintEnrichmentCall/apiUsage
 *     events arriving in ANY completion order produce identical budget
 *     totals (the reducer is order-independent for these event types).
 * (2) The loop's contract survives the rewrite: per-chunk budget check at
 *     launch, course-level block rides only the FIRST chunk, AbortError
 *     still aborts the stage, recovery pass stays serial.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyApiCallBudgetEvent, createApiCallBudget, getApiCallBudgetTotal } from '../src/lib/apiCallBudget.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hookSource = fs.readFileSync(path.join(repoRoot, 'src/hooks/useDeliverables.js'), 'utf8');

const applyEvents = (events) =>
  events.reduce((budget, event) => applyApiCallBudgetEvent(budget, event), createApiCallBudget());

function chunkCallEvent(lessons) {
  return {
    type: 'blueprintEnrichmentCall',
    label: 'Enrich lesson kernels',
    detail: `Lessons ${lessons.join(', ')} — 1400 input tokens estimated`,
    featureId: 'blueprintEnrichment',
  };
}

function chunkUsageEvent(costUsd) {
  return {
    type: 'apiUsage',
    label: 'API usage',
    task: 'blueprintEnrichment',
    featureId: 'blueprintEnrichment',
    provider: 'openai',
    modelId: 'gpt-5.4-mini',
    usage: { inputTokens: 1_200, outputTokens: 4_000, costUsd },
    costUsd,
  };
}

describe('WS-A (1) — budget reducer is order-independent for concurrent enrichment events', () => {
  const reset = { type: 'reset', runId: 'run-parallel-1' };
  const chunks = [
    [chunkCallEvent([1, 2, 3, 4]), chunkUsageEvent(0.019)],
    [chunkCallEvent([5, 6, 7, 8]), chunkUsageEvent(0.02)],
    [chunkCallEvent([9, 10, 11, 12]), chunkUsageEvent(0.018)],
    [chunkCallEvent([13, 14, 15]), chunkUsageEvent(0.016)],
  ];

  it('serial order and two interleaved completion orders yield identical totals', () => {
    const serial = applyEvents([reset, ...chunks.flat()]);
    // Launch-all-then-complete-out-of-order: calls first (launch), usage in
    // reverse completion order — the realistic parallel trace.
    const interleavedA = applyEvents([
      reset,
      chunks[0][0],
      chunks[1][0],
      chunks[2][0],
      chunks[3][0],
      chunks[3][1],
      chunks[1][1],
      chunks[0][1],
      chunks[2][1],
    ]);
    const interleavedB = applyEvents([
      reset,
      chunks[2][0],
      chunks[0][0],
      chunks[2][1],
      chunks[3][0],
      chunks[1][0],
      chunks[0][1],
      chunks[1][1],
      chunks[3][1],
    ]);

    for (const budget of [interleavedA, interleavedB]) {
      expect(getApiCallBudgetTotal(budget)).toBe(getApiCallBudgetTotal(serial));
      expect(budget.tokenUsage?.costUsd).toBeCloseTo(serial.tokenUsage?.costUsd, 10);
      expect(budget.tokenUsage?.outputTokens).toBe(serial.tokenUsage?.outputTokens);
    }
    expect(serial.tokenUsage?.costUsd).toBeCloseTo(0.073, 10);
  });
});

describe('WS-A (2) — the rewritten loop keeps its contract (source pins)', () => {
  it('enrichment chunks run warm-first then through a rolling limiter with a concurrency cap', () => {
    expect(hookSource).toContain('const runEnrichmentChunk = async ({ chunk, isFirstChunk })');
    expect(hookSource).toContain('provider === PUBLIC_SCION_PROVIDER_ID ? PUBLIC_SCION_KERNEL_CONCURRENCY : 4');
    // v0.15.186: chunk #1 completes alone (provider prompt-cache warm-up),
    // then the rest fan out under a rolling pLimit instead of barrier waves.
    expect(hookSource).toContain('await runEnrichmentChunk(enrichmentChunks[0]);');
    expect(hookSource).toContain('pLimit(enrichmentConcurrency)');
    expect(hookSource).toMatch(/enrichmentChunks\.slice\(1\)\.map\(\(chunk\) => enrichmentLimit/);
    expect(hookSource).toMatch(/enrichmentChunks\.map\(\(chunk\) => enrichmentLimit/);
    expect(hookSource).not.toContain('Promise.all(enrichmentChunks.map(runEnrichmentChunk))');
  });

  it('per-chunk budget check happens at launch, inside the chunk runner', () => {
    const runner = hookSource.split('const runEnrichmentChunk')[1].split('const enrichmentConcurrency')[0];
    expect(runner).toContain('if (!hasProviderCallBudget())');
    expect(runner).toContain('Content enrichment stopped early: call cap');
  });

  it('course-level block rides only the first chunk and AbortError still propagates', () => {
    const runner = hookSource.split('const runEnrichmentChunk')[1].split('const enrichmentConcurrency')[0];
    expect(runner).toContain('includeCourseLevel: isFirstChunk');
    expect(runner).toContain('if (isFirstChunk && parsedKernels.courseLevel)');
    expect(runner).toContain("if (chunkErr?.name === 'AbortError') throw chunkErr;");
  });

  it('the recovery pass stays serial (small, sequential by design)', () => {
    const afterLoop = hookSource.split('const enrichmentConcurrency')[1] || '';
    expect(afterLoop).toContain('enrichmentRecoveryCalls < enrichmentRecoveryCallLimit');
    // The recovery while-loop awaits inside the loop body (serial), not via Promise.all.
    const recoveryBlock = afterLoop.split('enrichmentRecoveryCalls < enrichmentRecoveryCallLimit')[1].slice(0, 4000);
    expect(recoveryBlock).not.toContain('Promise.all');
  });

  it('reserves enrichment recovery calls and counts recovery as retry budget', () => {
    expect(hookSource).toContain('const plannedEnrichmentRecoveryReserve =');
    expect(hookSource).toContain('blueprintEnrichmentRecoveryReserve: plannedEnrichmentRecoveryReserve');
    expect(hookSource).toContain('enrichment repair reserve');
    expect(hookSource).toContain("type: recoveryLabel ? 'repairRetryCall' : 'blueprintEnrichmentCall'");
    const recoverySource = hookSource
      .split('let enrichmentRecoveryCalls = 0;')[1]
      .split('if (Object.keys(partialOverlays)')[0];
    expect(recoverySource).toContain("type: 'repairRetryCall'");
  });

  it('native Pass B recovery can spend the second reserved call after a no-progress retry', () => {
    const nativeRecoverySource = hookSource
      .split('let nativeRecoveryCalls = 0;')[1]
      .split('// v0.14.1 P4.5: fold genome partials back in')[0];

    expect(nativeRecoverySource).toContain('recoveryAttempt: nativeRecoveryCalls');
    expect(nativeRecoverySource).toContain('retrying with stricter instructions');
    expect(hookSource).toContain(
      'allLessonIndices.filter((lessonIdx) => !kernelIsUsable(lessonContent[lessonIdOf(lessonIdx)]))',
    );
    expect(nativeRecoverySource).toContain('selectEnrichmentRecoveryChunk(');
    expect(nativeRecoverySource).toContain('attemptedNativeRecoveryIndices');
    expect(nativeRecoverySource).not.toContain('let previousRecoverySignature');
  });

  it('defers optional voice polish when enrichment coverage is still partial', () => {
    const voiceSource = hookSource.split('const voicePassLib = await import')[1] || '';
    expect(voiceSource).toContain('enrichmentOutcome.missingLessons?.length');
    expect(voiceSource.indexOf('enrichmentOutcome.missingLessons?.length')).toBeLessThan(
      voiceSource.indexOf('voicePassLib.runVoicePass({'),
    );
  });
});
