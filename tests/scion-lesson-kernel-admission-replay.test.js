import { describe, expect, it } from 'vitest';

import {
  replayScionLessonKernelAdmissionReport,
  validateScionLessonKernelAdmissionReplay,
} from '../scripts/lib/scionLessonKernelAdmissionReplay.mjs';
import { scionLessonKernelSha256 } from '../scripts/lib/scionLessonKernelCampaign.mjs';
import {
  SCION_LESSON_KERNEL_PILOT_PROMPT,
  SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE,
} from './fixtures/scionLessonKernelAdmissionV01654.js';

describe('Scion lesson-kernel compiler admission replay', () => {
  it('replays a frozen artifact through V6 without changing artifact identity', () => {
    const artifact = structuredClone(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE.lessons[0]);
    const campaign = {
      identity: { algorithm: 'sha256-canonical-json', sha256: 'a'.repeat(64) },
      cases: [
        {
          caseId: 'scion-kernel-replay-test',
          caseSha256: 'b'.repeat(64),
          userPrompt: SCION_LESSON_KERNEL_PILOT_PROMPT,
        },
      ],
    };
    const capture = {
      schemaVersion: 1,
      protocol: 'scion-lesson-kernel-capture-v1',
      campaignIdentity: campaign.identity,
      identitySha256: 'c'.repeat(64),
      compiler: { identitySha256: 'd'.repeat(64) },
      arm: 'reference',
      model: { provider: 'test', id: 'reference-test' },
      calls: [
        {
          caseId: 'scion-kernel-replay-test',
          caseSha256: 'b'.repeat(64),
          messagesSha256: 'e'.repeat(64),
          sourceContextSha256: 'f'.repeat(64),
          arm: 'reference',
          model: { provider: 'test', id: 'reference-test' },
          artifact,
          artifactSha256: scionLessonKernelSha256(artifact),
          admission: { needsRetry: true, issues: ['lesson-3:key-term-0:term-is-lesson-title'] },
          compilerRepairs: [],
        },
      ],
    };
    const compiler = {
      protocol: 'scion-lesson-kernel-compiler-replay-v1',
      policy: { keyTermSemanticProfile: 'source-strict-v6' },
      identitySha256: '1'.repeat(64),
    };
    const report = replayScionLessonKernelAdmissionReport({
      campaign,
      capture,
      compiler,
      generatedAt: '2026-07-18T21:00:00.000Z',
    });

    expect(validateScionLessonKernelAdmissionReplay(report)).toEqual({ valid: true, issues: [] });
    expect(report.summary).toMatchObject({ cases: 1, replayAdmitted: 1, addedIssueCases: 0 });
    expect(report.calls[0]).toMatchObject({
      artifactSha256: capture.calls[0].artifactSha256,
      admission: { needsRetry: false, issues: [] },
    });
  });
});
