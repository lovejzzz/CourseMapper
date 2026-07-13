import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildScionModelBakeoffReport,
  evaluateScionModelCandidate,
  importCrucibleFullCourseEvidence,
  validateScionModelRegistry,
  wilsonLowerBound,
} from '../scripts/scionModelBakeoff.mjs';

const registry = JSON.parse(fs.readFileSync('evaluation/scion-model-candidates.json', 'utf8'));

function factualEvidence(candidate, overrides = {}) {
  const run = (mode, ordinal, correct) => ({
    id: `${mode}-${ordinal}`,
    mode,
    durationMs: 1000 + ordinal,
    report: {
      status: correct === 25 ? 'passed' : 'failed',
      validShape: true,
      correct,
      total: 25,
    },
  });
  return {
    schemaVersion: 1,
    protocolVersion: registry.protocolVersion,
    candidateId: candidate.id,
    servingModelId: candidate.servingModelId,
    canaryPacketSha256: 'a'.repeat(64),
    observedAt: '2026-07-12T12:00:00.000Z',
    runs: [run('cold', 1, 23), run('source-grounded', 1, 25), run('cold', 2, 24), run('source-grounded', 2, 25)],
    ...overrides,
  };
}

describe('Scion model bake-off', () => {
  it('freezes unique candidates, an exact control, sources, and deployment identities', () => {
    expect(validateScionModelRegistry(registry)).toEqual([]);
    expect(registry.candidates.map((candidate) => candidate.id)).toEqual([
      'gemma-4-e2b',
      'qwen3.5-4b',
      'gemma-4-e4b',
      'qwen3.5-2b',
      'smollm3-3b',
    ]);
    expect(registry.candidates.every((candidate) => candidate.sources.length > 0)).toBe(true);
  });

  it('rejects duplicate identities and an ambiguous control instead of silently comparing them', () => {
    const malformed = structuredClone(registry);
    malformed.candidates[1].id = malformed.candidates[0].id;
    malformed.candidates[1].role = 'control';
    expect(validateScionModelRegistry(malformed)).toEqual(
      expect.arrayContaining(['duplicate-candidate:gemma-4-e2b', 'invalid-control-candidate']),
    );
  });

  it('separates factual screening from production promotion', () => {
    const candidate = registry.candidates[0];
    const evaluation = evaluateScionModelCandidate(candidate, [factualEvidence(candidate)], registry);
    expect(evaluation).toMatchObject({ screeningStatus: 'passed', promotionStatus: 'not-ready' });
    expect(evaluation.promotionIssues).toEqual(
      expect.arrayContaining([
        'insufficient-passing-full-courses',
        'missing-browser-device:integrated-8gb',
        'missing-qualifying-blind-instructor-win',
      ]),
    );
  });

  it('fails closed when the endpoint model is relabeled or a factual run misses its floor', () => {
    const candidate = registry.candidates[1];
    const evidence = factualEvidence(candidate, { servingModelId: 'some-other-model' });
    evidence.runs[0].report.correct = 22;
    const evaluation = evaluateScionModelCandidate(candidate, [evidence], registry);
    expect(evaluation.screeningStatus).toBe('failed');
    expect(evaluation.screeningIssues).toEqual(
      expect.arrayContaining(['evidence-1:serving-model-id-mismatch', 'factual-floor-not-met']),
    );
  });

  it('retains a failed attempt without letting it poison a later clean rerun', () => {
    const candidate = registry.candidates[0];
    const failedAttempt = factualEvidence(candidate, {
      runs: [
        { id: 'cold-1', mode: 'cold', error: 'fetch failed', durationMs: 10 },
        { id: 'source-grounded-1', mode: 'source-grounded', error: 'fetch failed', durationMs: 10 },
      ],
    });
    const evaluation = evaluateScionModelCandidate(candidate, [failedAttempt, factualEvidence(candidate)], registry);
    expect(evaluation).toMatchObject({
      screeningStatus: 'passed',
      factualRuns: { retainedFailedSessions: 1, coldScores: [23, 24], groundedScores: [25, 25] },
    });
  });

  it('deduplicates repeated imports of the same Crucible artifact and keeps the latest burden detail', () => {
    const candidate = registry.candidates[1];
    const course = {
      domain: 'user-experience-design',
      lessonCount: 12,
      packageGrade: 99,
      p0: 0,
      p1: 0,
      packageValid: true,
      scionPassCalls: 85,
      sourceArtifact: 'verification-output/crucible/round-one/course',
    };
    const evidence = [
      factualEvidence(candidate, { fullCourses: [course] }),
      {
        schemaVersion: 1,
        protocolVersion: registry.protocolVersion,
        candidateId: candidate.id,
        servingModelId: candidate.servingModelId,
        fullCourses: [{ ...course, compilerBurden: { scion: { byAction: { rejected: 35 } } } }],
      },
    ];
    const evaluation = evaluateScionModelCandidate(candidate, evidence, registry, {
      screeningStatus: 'passed',
      promotionEvidence: { validFullCourseDetails: [] },
    });
    expect(evaluation.promotionEvidence.validFullCourses).toBe(1);
    expect(evaluation.promotionEvidence.validFullCourseDetails[0].rejectedQualityActions).toBe(35);
  });

  it('requires a statistically defensible instructor preference, not a raw majority', () => {
    expect(wilsonLowerBound(25, 50)).toBeLessThan(0.5);
    expect(wilsonLowerBound(34, 50)).toBeGreaterThan(0.5);
  });

  it('promotes a challenger only after matched factual, course, browser, control, and instructor evidence', () => {
    const control = registry.candidates[0];
    const candidate = registry.candidates[1];
    const domains = ['computer-science', 'geology', 'music-theory', 'user-experience-design', 'world-literature'];
    const candidateEvidence = factualEvidence(candidate, {
      fullCourses: domains.map((domain) => ({
        domain,
        lessonCount: 12,
        packageGrade: 99,
        p0: 0,
        p1: 0,
        packageValid: true,
        scionPassCalls: 60,
      })),
      browserRuns: registry.promotionPolicy.requiredBrowserDeviceClasses.map((deviceClass) => ({
        deviceClass,
        completed: true,
        withinBudget: true,
      })),
      blindComparisons: [
        {
          cases: 50,
          wins: 34,
          losses: 16,
          ties: 0,
          minimumIndependentReviewsPerCase: 2,
          minimumWinnerFactualScore: 4,
          minimumWinnerTeachabilityScore: 4,
        },
      ],
    });
    const report = buildScionModelBakeoffReport(registry, {
      [control.id]: [
        factualEvidence(control, {
          fullCourses: domains.map((domain) => ({
            domain,
            lessonCount: 12,
            packageGrade: 99,
            p0: 0,
            p1: 0,
            packageValid: true,
            scionPassCalls: 50,
          })),
        }),
      ],
      [candidate.id]: [candidateEvidence],
    });
    expect(report.evaluations.find((entry) => entry.candidateId === candidate.id)).toMatchObject({
      screeningStatus: 'passed',
      promotionStatus: 'passed',
    });
    expect(report.promotedCandidateIds).toContain(candidate.id);
  });

  it('rejects a challenger that makes the compiler compensate far more than the matched control', () => {
    const control = registry.candidates[0];
    const candidate = registry.candidates[1];
    const domains = ['computer-science', 'geology', 'music-theory', 'user-experience-design', 'world-literature'];
    const course = (domain, scionPassCalls) => ({
      domain,
      lessonCount: 12,
      packageGrade: 99,
      p0: 0,
      p1: 0,
      packageValid: true,
      scionPassCalls,
    });
    const evidence = factualEvidence(candidate, {
      fullCourses: domains.map((domain) => course(domain, 85)),
      browserRuns: registry.promotionPolicy.requiredBrowserDeviceClasses.map((deviceClass) => ({
        deviceClass,
        completed: true,
        withinBudget: true,
      })),
      blindComparisons: [
        {
          cases: 50,
          wins: 34,
          losses: 16,
          ties: 0,
          minimumIndependentReviewsPerCase: 2,
          minimumWinnerFactualScore: 4,
          minimumWinnerTeachabilityScore: 4,
        },
      ],
    });
    const report = buildScionModelBakeoffReport(registry, {
      [control.id]: [factualEvidence(control, { fullCourses: domains.map((domain) => course(domain, 50)) })],
      [candidate.id]: [evidence],
    });
    const evaluation = report.evaluations.find((entry) => entry.candidateId === candidate.id);
    expect(evaluation.promotionStatus).toBe('not-ready');
    expect(evaluation.promotionIssues).toContain('compiler-call-amplification-exceeds-control');
  });

  it('imports only exact-source, passed Local-provider Crucible artifacts', async () => {
    const candidate = registry.candidates[1];
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'scion-model-course-'));
    const courseDir = path.join(root, 'ux-design-studio--quiet--local');
    const extracted = path.join(courseDir, 'extracted');
    await fsp.mkdir(extracted, { recursive: true });
    await Promise.all([
      fsp.writeFile(
        path.join(courseDir, 'course.json'),
        JSON.stringify({
          provider: 'local',
          id: 'ux-design-studio--quiet--local',
          baseId: 'ux-design-studio',
          lessonCount: 12,
          localModel: { id: 'qwen3.5-4b', sourceModelId: candidate.servingModelId },
        }),
      ),
      fsp.writeFile(
        path.join(courseDir, 'report.json'),
        JSON.stringify({
          run: { status: 'passed', durationMs: 382000 },
          normalized: { overall: 99, overallGrade: 'A', p0Count: 0, p1Count: 0 },
        }),
      ),
      fsp.writeFile(
        path.join(courseDir, 'digest.json'),
        JSON.stringify({
          cost: {
            inputTokens: 50000,
            outputTokens: 42000,
            byTask: [
              { task: 'scionPass', calls: 85 },
              { task: 'blueprintEnrichment', calls: 12 },
            ],
          },
        }),
      ),
      fsp.writeFile(
        path.join(extracted, 'PACKAGE_MANIFEST.json'),
        JSON.stringify({
          files: Array.from({ length: 99 }, (_, index) => ({ path: `file-${index}` })),
          quality: { score: 99, findingCounts: { p2: 0 } },
          readiness: { status: 'ready', blockers: 0, warnings: 0 },
        }),
      ),
      fsp.writeFile(path.join(courseDir, 'package.zip'), Buffer.alloc(10_001)),
    ]);
    try {
      const evidence = await importCrucibleFullCourseEvidence({ roundDir: root, candidate, registry });
      expect(evidence.fullCourses[0]).toMatchObject({
        domain: 'ux-design-studio',
        packageValid: true,
        packageGrade: 99,
        scionPassCalls: 85,
        extractedFiles: 101,
      });
      expect(evidence.roundDir).toBe(`verification-output/crucible/${path.basename(root)}`);
      expect(evidence.fullCourses[0].sourceArtifact).toBe(
        `verification-output/crucible/${path.basename(root)}/ux-design-studio--quiet--local`,
      );
      await fsp.writeFile(
        path.join(courseDir, 'course.json'),
        JSON.stringify({
          provider: 'local',
          lessonCount: 12,
          localModel: { id: 'renamed-model', sourceModelId: 'some-other-weights' },
        }),
      );
      await expect(importCrucibleFullCourseEvidence({ roundDir: root, candidate, registry })).rejects.toThrow(
        'source weights do not match',
      );
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });
});
