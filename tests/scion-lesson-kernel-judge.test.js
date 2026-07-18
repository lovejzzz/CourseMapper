import { describe, expect, it } from 'vitest';

import {
  SCION_LESSON_KERNEL_JUDGE_DIMENSIONS,
  SCION_LESSON_KERNEL_JUDGE_REVIEW_PROTOCOL,
  aggregateScionLessonKernelPairedOrders,
  buildScionLessonKernelBlindPacket,
  buildScionLessonKernelBlindWorkbook,
  buildScionLessonKernelTrainingPreferences,
  validateScionLessonKernelBlindPacket,
  validateScionLessonKernelBlindWorkbook,
  validateScionLessonKernelJudgeReview,
} from '../scripts/lib/scionLessonKernelJudge.mjs';
import { scionLessonKernelSha256 } from '../scripts/lib/scionLessonKernelCampaign.mjs';

function fixture() {
  const localArtifact = {
    lessonId: 'lesson-1',
    facts: ['A local artifact fact that is long enough for comparison.'],
    keyTerms: [],
    scenario: {},
    mc: [],
  };
  const referenceArtifact = {
    lessonId: 'lesson-1',
    facts: ['A reference artifact fact that is long enough for comparison.'],
    keyTerms: [],
    scenario: {},
    mc: [
      {
        q: 'Which boundary description is supported by the supplied plate-motion claim?',
        op: ['A distractor shown first', 'The supported answer', 'A second distractor', 'A third distractor'],
        ai: 1,
        fi: [0],
        ex: 'The supported answer follows directly from the supplied plate-motion claim.',
      },
    ],
  };
  const campaign = {
    identity: { algorithm: 'sha256-canonical-json', sha256: 'a'.repeat(64) },
    cases: [
      {
        caseId: 'scion-kernel-test',
        domain: 'geology',
        failureFamilies: ['source-fidelity'],
        lessonInput: { lessonId: 'lesson-1', title: 'Plate motion' },
        sourceContext: {
          claims: ['Plate motion distinguishes divergent, convergent, and transform boundaries.'],
          license: 'CC-BY-4.0',
        },
      },
    ],
  };
  const makeReport = (artifact, compilerRepairs = []) => ({
    campaignIdentity: campaign.identity,
    calls: [
      {
        caseId: 'scion-kernel-test',
        artifact,
        artifactSha256: scionLessonKernelSha256(artifact),
        compilerRepairs,
      },
    ],
  });
  return {
    campaign,
    localArtifact,
    referenceArtifact,
    localReport: makeReport(localArtifact),
    referenceReport: makeReport(referenceArtifact, [
      {
        pass: 'deterministicOptionShuffle',
        item: 0,
        permutation: [1, 0, 2, 3],
        answerIndexBefore: 0,
        answerIndexAfter: 1,
      },
    ]),
  };
}

function buildPackets(inputs) {
  const common = {
    ...inputs,
    promptPath: 'evaluation/judge.md',
    promptSha256: 'b'.repeat(64),
    generatedAt: '2026-07-18T16:30:00.000Z',
  };
  return {
    ab: buildScionLessonKernelBlindPacket({ ...common, order: 'A/B' }),
    ba: buildScionLessonKernelBlindPacket({ ...common, order: 'B/A' }),
  };
}

function completeReview(packet, sessionId, decision) {
  return {
    schemaVersion: 1,
    protocol: SCION_LESSON_KERNEL_JUDGE_REVIEW_PROTOCOL,
    order: packet.order,
    packetSha256: packet.identity.sha256,
    sessionId,
    judge: { model: 'codex', revision: 'test', runtime: 'isolated-test' },
    completedAt: '2026-07-18T17:00:00.000Z',
    attestations: {
      anonymousArtifactsOnly: true,
      otherOrderUnavailable: true,
      organizerMappingUnavailable: true,
    },
    decisions: packet.cases.map((entry) => ({
      ...entry.decisionSkeleton,
      scores: Object.fromEntries(
        ['A', 'B'].map((label) => [
          label,
          Object.fromEntries(
            SCION_LESSON_KERNEL_JUDGE_DIMENSIONS.map((dimension) => [
              dimension,
              { score: label === decision ? 4 : 2, evidence: `${label} has concrete evidence for ${dimension}.` },
            ]),
          ),
        ]),
      ),
      criticalDefects: { A: [], B: ['One bounded comparison defect.'] },
      decision,
      rationale: 'The selected artifact is more accurate, coherent, and instructionally complete.',
    })),
  };
}

describe('Scion lesson-kernel paired-order judge', () => {
  it('splits a large campaign into hash-bound exact-reversal workbooks', () => {
    const inputs = fixture();
    const secondCase = {
      ...structuredClone(inputs.campaign.cases[0]),
      caseId: 'scion-kernel-test-2',
      lessonInput: { lessonId: 'lesson-2', title: 'Rock cycles' },
    };
    inputs.campaign.cases.push(secondCase);
    for (const report of [inputs.localReport, inputs.referenceReport]) {
      const artifact = { ...structuredClone(report.calls[0].artifact), lessonId: 'lesson-2' };
      report.calls.push({
        ...structuredClone(report.calls[0]),
        caseId: secondCase.caseId,
        artifact,
        artifactSha256: scionLessonKernelSha256(artifact),
      });
    }
    const workbook = buildScionLessonKernelBlindWorkbook({
      ...inputs,
      promptPath: 'evaluation/judge.md',
      promptSha256: 'b'.repeat(64),
      generatedAt: '2026-07-18T16:30:00.000Z',
      chunkSize: 1,
    });

    expect(validateScionLessonKernelBlindWorkbook(workbook)).toEqual({ valid: true, issues: [] });
    expect(workbook.manifest).toMatchObject({
      chunkSize: 1,
      campaignCaseCount: 2,
      caseCount: 2,
      captureComplete: true,
    });
    expect(workbook.batches).toHaveLength(2);
    expect(workbook.batches.every((batch) => batch.caseIds.length === 1)).toBe(true);

    inputs.campaign.cases.push({
      ...structuredClone(secondCase),
      caseId: 'scion-kernel-test-3-not-captured',
      lessonInput: { lessonId: 'lesson-3', title: 'Relative dating' },
    });
    const progressive = buildScionLessonKernelBlindWorkbook({
      ...inputs,
      promptPath: 'evaluation/judge.md',
      promptSha256: 'b'.repeat(64),
      generatedAt: '2026-07-18T16:30:00.000Z',
      chunkSize: 6,
    });
    expect(validateScionLessonKernelBlindWorkbook(progressive)).toEqual({ valid: true, issues: [] });
    expect(progressive.manifest).toMatchObject({ campaignCaseCount: 3, caseCount: 2, captureComplete: false });
    expect(progressive.batches[0].sealed).toBe(false);

    const tampered = structuredClone(workbook);
    tampered.batches[0].packets['B/A'].cases[0].artifacts.A = tampered.batches[0].packets['A/B'].cases[0].artifacts.A;
    expect(validateScionLessonKernelBlindWorkbook(tampered).issues).toEqual(
      expect.arrayContaining([expect.stringContaining('identity'), expect.stringContaining('reverse-order')]),
    );
  });

  it('builds anonymous exact-reversal packets without outcome or route leakage', () => {
    const inputs = fixture();
    const { ab, ba } = buildPackets(inputs);

    expect(validateScionLessonKernelBlindPacket(ab)).toEqual({ valid: true, issues: [] });
    expect(validateScionLessonKernelBlindPacket(ba)).toEqual({ valid: true, issues: [] });
    expect(ab.cases[0].artifacts.A.artifactSha256).toBe(inputs.localReport.calls[0].artifactSha256);
    expect(ab.cases[0].artifacts.B.artifactSha256).toBe(inputs.referenceReport.calls[0].artifactSha256);
    expect(ba.cases[0].artifacts.A.artifactSha256).toBe(inputs.referenceReport.calls[0].artifactSha256);
    expect(ba.cases[0].artifacts.B.artifactSha256).toBe(inputs.localReport.calls[0].artifactSha256);
    expect(JSON.stringify(ab)).not.toMatch(/"(?:provider|admission|compilerRepairs|attempts)"\s*:/);
  });

  it('accepts two isolated orders and maps a stable anonymous winner back by artifact hash', () => {
    const inputs = fixture();
    const { ab, ba } = buildPackets(inputs);
    const abReview = completeReview(ab, 'fresh-a-b-session', 'B');
    const baReview = completeReview(ba, 'fresh-b-a-session', 'A');

    expect(validateScionLessonKernelJudgeReview(abReview, ab)).toEqual({ valid: true, issues: [] });
    expect(validateScionLessonKernelJudgeReview(baReview, ba)).toEqual({ valid: true, issues: [] });
    const result = aggregateScionLessonKernelPairedOrders({
      abPacket: ab,
      baPacket: ba,
      abReview,
      baReview,
      localReport: inputs.localReport,
      referenceReport: inputs.referenceReport,
      generatedAt: '2026-07-18T18:00:00.000Z',
    });

    expect(result.status).toBe('paired-orders-complete');
    expect(result.summary).toMatchObject({ pairs: 1, stablePreferences: 1, localWins: 0, referenceWins: 1 });
    expect(result.results[0]).toMatchObject({ stable: true, stableWinner: 'reference', trainingEligible: true });
    const preferences = buildScionLessonKernelTrainingPreferences({
      aggregate: result,
      campaign: inputs.campaign,
      localReport: inputs.localReport,
      referenceReport: inputs.referenceReport,
    });
    expect(preferences).toHaveLength(1);
    expect(preferences[0]).toMatchObject({ kind: 'lesson-kernel', winnerRole: 'reference', trainingEligible: true });
    const chosen = JSON.parse(preferences[0].chosen).lessons[0].mc[0];
    expect(chosen.op[0]).toBe('The supported answer');
    expect(chosen.ai).toBe(0);
  });

  it('rejects route leakage, changed identity, and reuse of one judge session across orders', () => {
    const inputs = fixture();
    const { ab, ba } = buildPackets(inputs);
    const contaminated = structuredClone(ab);
    contaminated.cases[0].artifacts.A.provider = 'local';
    expect(validateScionLessonKernelBlindPacket(contaminated).issues).toEqual(
      expect.arrayContaining(['forbidden-key:$.cases[0].artifacts.A.provider', 'identity']),
    );

    const abReview = completeReview(ab, 'reused-session', 'B');
    const baReview = completeReview(ba, 'reused-session', 'A');
    const result = aggregateScionLessonKernelPairedOrders({
      abPacket: ab,
      baPacket: ba,
      abReview,
      baReview,
      localReport: inputs.localReport,
      referenceReport: inputs.referenceReport,
      generatedAt: '2026-07-18T18:00:00.000Z',
    });
    expect(result.status).toBe('invalid');
    expect(result.issues).toContain('judge-session-reused');
  });
});
