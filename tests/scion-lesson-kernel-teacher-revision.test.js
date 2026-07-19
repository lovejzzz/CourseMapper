import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCION_LESSON_KERNEL_TEACHER_RESULT_PROTOCOL,
  buildScionLessonKernelTeacherRevisionPacket,
  buildScionLessonKernelTeacherRevisionSchema,
  compileScionLessonKernelTeacherRevisionResult,
  validateScionLessonKernelTeacherRevisionPacket,
  validateScionLessonKernelTeacherRevisionResult,
} from '../scripts/lib/scionLessonKernelTeacherRevision.mjs';
import {
  chunkScionTeacherRevisionResults,
  composeScionTeacherRevisionSource,
} from '../scripts/scionLessonKernelTeacherRevisionBatches.mjs';
import { scionLessonKernelSha256 } from '../scripts/lib/scionLessonKernelCampaign.mjs';
import {
  SCION_LESSON_KERNEL_PILOT_PROMPT,
  SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE,
} from './fixtures/scionLessonKernelAdmissionV01654.js';

function fixture() {
  const artifact = structuredClone(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE.lessons[0]);
  const sourceContext = {
    kernelId: 'geology/plate-motion',
    term: 'Plate-boundary processes',
    claims: [
      'Plate boundaries are classified as divergent, convergent, or transform according to whether plates separate, approach, or slide alongside one another.',
      'Divergent boundaries move apart and form new crust, whereas convergent boundaries move together and can subduct crust.',
      'Transform boundaries accommodate plates moving side by side rather than creating or subducting crust.',
    ],
    attribution: ['Physical Geology 2e'],
    license: 'CC-BY-4.0',
  };
  const campaignCase = {
    caseId: 'scion-kernel-teacher-test',
    caseSha256: 'c'.repeat(64),
    lessonInput: { lessonId: 'lesson-3', title: 'Plate-boundary processes' },
    sourceContext,
    userPrompt: SCION_LESSON_KERNEL_PILOT_PROMPT,
  };
  const call = {
    caseId: campaignCase.caseId,
    artifact,
    artifactSha256: scionLessonKernelSha256(artifact),
    admission: { needsRetry: true, issues: ['lesson-3:key-term-0:term-is-lesson-title'] },
  };
  const aggregate = {
    identity: { sha256: 'a'.repeat(64) },
    results: [
      {
        caseId: campaignCase.caseId,
        stable: true,
        stableWinner: 'reference',
        trainingEligible: false,
        scoreQualification: {
          orders: [
            {
              winnerScores: { sourceFidelity: 2 },
              winnerCriticalDefects: ['One unsupported detail appears in the original artifact.'],
              rationale: 'The reference is stronger but still exceeds the supplied claims.',
              decisionSha256: '1'.repeat(64),
            },
            {
              winnerScores: { sourceFidelity: 2 },
              winnerCriticalDefects: ['The same unsupported detail remains after order reversal.'],
              rationale: 'The reversed comparison confirms the same source-fidelity defect.',
              decisionSha256: '2'.repeat(64),
            },
          ],
        },
      },
    ],
  };
  const campaign = { identity: { sha256: 'b'.repeat(64) }, cases: [campaignCase] };
  const packet = buildScionLessonKernelTeacherRevisionPacket({
    batchId: 'batch-001-test',
    campaign,
    aggregate,
    referenceReport: { calls: [call] },
    prompt: { path: 'teacher.md', sha256: 'd'.repeat(64) },
    generatedAt: '2026-07-18T10:00:00.000Z',
  });
  return { artifact, campaign, packet };
}

function resultFor(packet, artifact) {
  return {
    schemaVersion: 1,
    protocol: SCION_LESSON_KERNEL_TEACHER_RESULT_PROTOCOL,
    packetSha256: packet.identity.sha256,
    sessionId: 'teacher-session-test',
    reviser: { model: 'gpt-5.6-sol', revision: 'test-revision', runtime: 'isolated-test' },
    completedAt: '2026-07-18T10:01:00.000Z',
    attestations: { suppliedClaimsOnly: true, noExternalFacts: true, noTrainingAuthorization: true },
    revisions: [
      {
        caseId: packet.cases[0].caseId,
        originalArtifactSha256: packet.cases[0].originalArtifactSha256,
        lessonKernel: artifact,
        changeSummary: ['Removed unsupported elaboration and retained source-backed distinctions.'],
        addressedDiagnoses: ['Revised the source-fidelity defect reported in both judge orders.'],
      },
    ],
  };
}

describe('Scion lesson-kernel teacher revision', () => {
  it('splits large cleanroom packets without reordering or duplicating cases', () => {
    const results = Array.from({ length: 7 }, (_, index) => ({ caseId: `case-${index + 1}` }));
    expect(chunkScionTeacherRevisionResults(results, 3)).toEqual([
      results.slice(0, 3),
      results.slice(3, 6),
      results.slice(6, 7),
    ]);
    expect(chunkScionTeacherRevisionResults(results, 0)).toEqual([results]);
    expect(chunkScionTeacherRevisionResults([], 3)).toEqual([]);
  });

  it('prefers the latest revision while retaining fallback cases that never completed', () => {
    const latest = { identity: { sha256: '1'.repeat(64) }, calls: [{ caseId: 'case-a', artifact: 'latest' }] };
    const fallback = {
      identity: { sha256: '2'.repeat(64) },
      calls: [
        { caseId: 'case-a', artifact: 'original' },
        { caseId: 'case-b', artifact: 'fallback-only' },
      ],
    };
    expect(composeScionTeacherRevisionSource(latest, fallback).calls).toEqual([
      { caseId: 'case-b', artifact: 'fallback-only' },
      { caseId: 'case-a', artifact: 'latest' },
    ]);
  });

  it('pins the reviser to the production admission constraints exposed by the pilot', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const prompt = fs.readFileSync(
      path.resolve(here, '../evaluation/scion-adapters/lesson-kernel-teacher-revision-prompt-v0.16.54.md'),
      'utf8',
    );
    expect(prompt).toContain('exact 1–4-word phrase');
    expect(prompt).toContain('exactly two specific sentences');
    expect(prompt).toContain('literal label `Evidence packet:`');
    expect(prompt).toContain('20–45 words');
    expect(prompt).toContain('generic “sheet” does not count');
    expect(prompt).toContain('avoid copying three or more content words');
    expect(prompt).toContain('do not restate the definition as the example');
    expect(prompt).toContain('substantially different wording from `df`');
    const promptV2 = fs.readFileSync(
      path.resolve(here, '../evaluation/scion-adapters/lesson-kernel-teacher-revision-prompt-v2-v0.16.54.md'),
      'utf8',
    );
    expect(promptV2).toContain('Do not use absolute option language');
    expect(promptV2).toContain('Every named phrase must appear verbatim in a supplied claim');
    expect(promptV2).toContain('directly correct only the false predicate');
    const promptV3 = fs.readFileSync(
      path.resolve(here, '../evaluation/scion-adapters/lesson-kernel-teacher-revision-prompt-v3-v0.16.54.md'),
      'utf8',
    );
    expect(promptV3).toContain('must repeat its exact `tr` phrase verbatim as the subject');
    expect(promptV3).toContain('not the definition with one negation or reversed adjective');
    expect(promptV3).toContain('do not repeat the misconception and then negate it');
    expect(promptV3).toContain('do not restate the full definition');
    expect(promptV3).not.toContain('\\n-');
    const promptV4 = fs.readFileSync(
      path.resolve(here, '../evaluation/scion-adapters/lesson-kernel-teacher-revision-prompt-v4-v0.16.54.md'),
      'utf8',
    );
    expect(promptV4).toContain('latest compiler-rejected revision');
    expect(promptV4).toContain('Begin every `cx` with its exact `tr` phrase');
    expect(promptV4).toContain('Do not copy four consecutive content words from `df`');
    expect(promptV4).toContain('Delete any named phrase');
    expect(promptV4).toContain('do not place `When`, `Using`, `In`');
    expect(promptV4).toContain('do not rely on `order`, `rank`, `compare`, or `evaluate` alone');
    expect(promptV4).toContain('Do not use `always`, `never`, `only`, `all`, `none`, `must`, `cannot`');
    const promptV5 = fs.readFileSync(
      path.resolve(here, '../evaluation/scion-adapters/lesson-kernel-teacher-revision-prompt-v5-v0.16.54.md'),
      'utf8',
    );
    expect(promptV5).toContain('smallest possible repair');
    expect(promptV5).toContain('Copy every field not named by `compilerAdmission.issues` unchanged');
    expect(promptV5).toContain("change only key term N's `cx`");
    expect(promptV5).toContain('keep `q`, `op`, `ai`, and `fi` unchanged');
    expect(promptV5).toContain('recognized evidence types');
    const promptV6 = fs.readFileSync(
      path.resolve(here, '../evaluation/scion-adapters/lesson-kernel-teacher-revision-prompt-v6-v0.16.54.md'),
      'utf8',
    );
    expect(promptV6).toContain('must be visibly different from `originalArtifact`');
    expect(promptV6).toContain('Do not mention, quote, negate, or correct any distractor');
    expect(promptV6).toContain('End `q`, every option, and `ex` with terminal punctuation');
    expect(promptV6).toContain('share no three consecutive content words with `df`');
  });

  it('builds a source-only packet without exposing the local artifact or provider route', () => {
    const { packet } = fixture();
    expect(validateScionLessonKernelTeacherRevisionPacket(packet)).toEqual({ valid: true, issues: [] });
    expect(JSON.stringify(packet)).not.toMatch(/"(?:localArtifact|localReport|provider|route|trainingEligible)"\s*:/);
    const schema = buildScionLessonKernelTeacherRevisionSchema(packet);
    expect(schema.properties.revisions.minItems).toBe(1);
    expect(schema.properties.revisions.items.properties.lessonKernel.properties.lessonId).toEqual({
      type: 'string',
      minLength: 1,
    });
  });

  it('binds the revision to the packet and replays exact production compiler admission', () => {
    const { artifact, campaign, packet } = fixture();
    const result = resultFor(packet, artifact);
    expect(validateScionLessonKernelTeacherRevisionResult(result, packet)).toEqual({ valid: true, issues: [] });
    const report = compileScionLessonKernelTeacherRevisionResult({ result, packet, campaign });
    expect(report.summary).toEqual({ cases: 1, compilerAdmitted: 1, compilerRejected: 0 });
    expect(report.calls[0]).toMatchObject({
      arm: 'teacher-revision',
      artifactSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      admission: { needsRetry: false, issues: [] },
    });
    expect(report.calls[0].compilerRepairs).toEqual(
      expect.arrayContaining([expect.objectContaining({ pass: 'deterministicOptionShuffle' })]),
    );
  });

  it('fails closed when the session changes the case or original-artifact binding', () => {
    const { artifact, packet } = fixture();
    const result = resultFor(packet, artifact);
    result.revisions[0].originalArtifactSha256 = 'f'.repeat(64);
    result.revisions[0].lessonKernel.lessonId = 'lesson-other';
    expect(validateScionLessonKernelTeacherRevisionResult(result, packet).issues).toEqual(
      expect.arrayContaining(['original:scion-kernel-teacher-test', 'lesson-id:scion-kernel-teacher-test']),
    );
  });
});
