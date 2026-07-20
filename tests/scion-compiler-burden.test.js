import { describe, expect, it } from 'vitest';

import {
  compareScionCompilerBurden,
  parseScionConsoleEvents,
  summarizeScionCompilerBurden,
} from '../scripts/lib/scionCompilerBurden.mjs';
import { compilerBurdenFromEvidence } from '../scripts/scionCompilerBurdenAudit.mjs';

function line(event) {
  return `2026-07-12T00:00:00.000Z [info] [CM][API] ${JSON.stringify(event)}`;
}

describe('Scion compiler burden audit', () => {
  it('attributes provider calls and quality outcomes from retained browser logs', () => {
    const events = parseScionConsoleEvents(
      [
        'browser preamble',
        line({ type: 'providerRequestStart', task: 'scionPass', attempt: 1 }),
        line({ type: 'providerResponseDone', task: 'scionPass' }),
        line({ type: 'pipelineDecision', label: 'Scion pass call', detail: 'applied_mc_batch' }),
        line({
          type: 'pipelineDecision',
          label: 'Scion quality passes',
          detail: 'appliedDepth:lesson-1 rejected [not-applied] · polish:lesson-1 done',
        }),
      ].join('\n'),
    );
    expect(summarizeScionCompilerBurden(events, { lessonCount: 1 })).toMatchObject({
      provider: { requests: 1, responses: 1, errors: 0, retries: 0, taskCalls: { scionPass: 1 } },
      scion: {
        calls: 1,
        callsPerLesson: 1,
        attributedCalls: 1,
        unattributedCalls: 0,
        byCallType: { applied_mc_batch: 1 },
        byPass: { appliedDepth: 1, polish: 1 },
        byAction: { rejected: 1, done: 1 },
        rejectionReasons: { 'not-applied': 1 },
        mcRepairEfficiency: {
          calls: 0,
          individualCalls: 0,
          batchCalls: 0,
          verifiedRepairs: 0,
          yield: null,
          callsWithoutVerifiedRepair: 0,
        },
      },
    });
  });

  it('reports low-yield serial MC repair as compiler debt on either arm', () => {
    const events = parseScionConsoleEvents(
      [
        ...Array.from({ length: 8 }, () => line({ type: 'providerRequestStart', task: 'scionPass', attempt: 1 })),
        ...Array.from({ length: 8 }, () =>
          line({ type: 'pipelineDecision', label: 'Scion pass call', detail: 'mc_item' }),
        ),
        line({
          type: 'pipelineDecision',
          label: 'Scion quality passes',
          detail: 'mcVerify:lesson-3 regenerated',
        }),
      ].join('\n'),
    );
    const candidate = summarizeScionCompilerBurden(events, { lessonCount: 14 });
    expect(candidate.scion.mcRepairEfficiency).toEqual({
      calls: 8,
      individualCalls: 8,
      batchCalls: 0,
      verifiedRepairs: 1,
      yield: 0.125,
      callsWithoutVerifiedRepair: 7,
    });
    const comparison = compareScionCompilerBurden(candidate, {
      lessonCount: 14,
      scion: {
        calls: 8,
        unattributedCalls: 0,
        byAction: {},
        rejectionReasons: {},
        mcRepairEfficiency: { calls: 0, verifiedRepairs: 0, yield: null },
      },
    });
    expect(comparison.findings).toContainEqual(
      expect.objectContaining({ severity: 'P1', code: 'candidate-low-yield-mc-repair' }),
    );
  });

  it('credits one batched generation call for multiple verified key repairs', () => {
    const events = parseScionConsoleEvents(
      [
        line({ type: 'pipelineDecision', label: 'Scion pass call', detail: 'mc_verify_repair_batch' }),
        line({
          type: 'pipelineDecision',
          label: 'Scion quality passes',
          detail: 'mcVerify:lesson-3 regenerated · mcVerify:lesson-3 regenerated',
        }),
      ].join('\n'),
    );
    const burden = summarizeScionCompilerBurden(events, { lessonCount: 1 });
    expect(burden.scion.mcRepairEfficiency).toEqual({
      calls: 1,
      individualCalls: 0,
      batchCalls: 1,
      verifiedRepairs: 2,
      yield: 2,
      callsWithoutVerifiedRepair: 0,
    });
  });

  it('counts real native inference attempts from route receipts', () => {
    const candidate = summarizeScionCompilerBurden(
      [
        { type: 'scionAdapterRoute', taskFamily: 'lesson-kernel-synthesis', routeMode: 'adapter', routeModelCalls: 3 },
        { type: 'scionAdapterRoute', taskFamily: 'compiler-repair', routeMode: 'base-only', routeModelCalls: 1 },
      ],
      { lessonCount: 1 },
    );
    const control = summarizeScionCompilerBurden(
      [
        {
          type: 'scionAdapterRoute',
          taskFamily: 'lesson-kernel-synthesis',
          routeMode: 'base-only',
          routeModelCalls: 2,
        },
        { type: 'scionAdapterRoute', taskFamily: 'compiler-repair', routeMode: 'base-only', routeModelCalls: 1 },
      ],
      { lessonCount: 1 },
    );
    expect(candidate.nativeInference).toMatchObject({
      attempts: 4,
      attemptsPerLesson: 4,
      byTaskFamily: { 'lesson-kernel-synthesis': 3, 'compiler-repair': 1 },
      byRouteMode: { adapter: 3, 'base-only': 1 },
    });
    expect(compareScionCompilerBurden(candidate, control)).toMatchObject({
      inferenceAmplification: 1.333,
      candidateInferenceAttemptDelta: 1,
      findings: expect.arrayContaining([expect.objectContaining({ code: 'candidate-native-inference-amplification' })]),
    });
  });

  it('treats excess compensation and shared rejected depth drafts as compiler findings', () => {
    const candidate = {
      lessonCount: 12,
      scion: { calls: 85, unattributedCalls: 85, byAction: { rejected: 35 }, rejectionReasons: { 'not-applied': 27 } },
    };
    const control = {
      lessonCount: 12,
      scion: { calls: 50, unattributedCalls: 50, byAction: { rejected: 21 }, rejectionReasons: { 'not-applied': 18 } },
    };
    const comparison = compareScionCompilerBurden(candidate, control);
    expect(comparison).toMatchObject({ callAmplification: 1.7, candidateCallDelta: 35, rejectedActionDelta: 14 });
    expect(comparison.findings.map((finding) => finding.code)).toEqual([
      'candidate-call-amplification',
      'shared-applied-depth-waste',
      'unattributed-scion-calls',
    ]);
  });

  it('loads a domain-matched burden from committed exact-provenance evidence', () => {
    const burden = { schemaVersion: 1, lessonCount: 12, scion: { calls: 52, callsPerLesson: 4.33 } };
    expect(
      compilerBurdenFromEvidence(
        {
          candidateId: 'gemma-4-e2b',
          servingModelId: 'google/gemma-4-e2b-it',
          fullCourses: [
            { domain: 'music-theory', compilerBurden: { scion: { calls: 20 } } },
            { domain: 'ux-design-studio', sourceArtifact: 'ignored/local/run', compilerBurden: burden },
          ],
        },
        { domain: 'ux-design-studio' },
      ),
    ).toMatchObject({
      courseDir: 'ignored/local/run',
      modelId: 'gemma-4-e2b',
      sourceModelId: 'google/gemma-4-e2b-it',
      lessonCount: 12,
      scion: { calls: 52, callsPerLesson: 4.33 },
    });
  });
});
