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
      },
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
