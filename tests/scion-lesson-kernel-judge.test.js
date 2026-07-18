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
import { toScionOrpoTrainingRow } from '../scripts/scionAdapterDataset.mjs';
import { assessCorpusRow } from '../scripts/scionPreferenceCorpusAudit.mjs';
import { validateScionTrainingPreferenceEvidence } from '../src/lib/scionCodexTrainingEvidence.js';
import { SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE } from './fixtures/scionLessonKernelAdmissionV01654.js';

function fixture() {
  const localArtifact = {
    lessonId: 'lesson-1',
    facts: ['A local artifact fact that is long enough for comparison.'],
    keyTerms: [],
    scenario: {},
    mc: [],
  };
  const referenceArtifact = structuredClone(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE.lessons[0]);
  referenceArtifact.mc[0].op = [
    referenceArtifact.mc[0].op[1],
    referenceArtifact.mc[0].op[0],
    ...referenceArtifact.mc[0].op.slice(2),
  ];
  referenceArtifact.mc[0].ai = 1;
  const secondSupported = referenceArtifact.mc[1].op.splice(referenceArtifact.mc[1].ai, 1)[0];
  referenceArtifact.mc[1].op.unshift(secondSupported);
  referenceArtifact.mc[1].ai = 0;
  const campaign = {
    identity: { algorithm: 'sha256-canonical-json', sha256: 'a'.repeat(64) },
    cases: [
      {
        caseId: 'scion-kernel-test',
        caseSha256: 'c'.repeat(64),
        domain: 'geology',
        courseGroupId: 'geology-course',
        courseGroupSha256: 'd'.repeat(64),
        failureFamilies: ['source-fidelity'],
        lessonInput: { lessonId: 'lesson-3', title: 'Plate-boundary processes' },
        sourceContext: {
          kernelId: 'geology/plate-motion',
          term: 'Plate-boundary processes',
          claims: [
            'Plate boundaries are classified as divergent, convergent, or transform according to whether plates separate, approach, or slide alongside one another.',
            'Divergent boundaries move apart and form new crust, whereas convergent boundaries move together and can subduct crust.',
            'Transform boundaries accommodate plates moving side by side rather than creating or subducting crust.',
          ],
          attribution: ['Physical Geology 2e'],
          license: 'CC-BY-4.0',
        },
        messages: [
          { role: 'system', content: 'Return one source-grounded lesson kernel.' },
          {
            role: 'user',
            content: [
              'Write the Plate motion lesson kernel as JSON.',
              'Plate boundaries are classified as divergent, convergent, or transform according to whether plates separate, approach, or slide alongside one another.',
              'Divergent boundaries move apart and form new crust, whereas convergent boundaries move together and can subduct crust.',
              'Transform boundaries accommodate plates moving side by side rather than creating or subducting crust.',
            ].join('\n'),
          },
        ],
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
        admission: { needsRetry: false, issues: [] },
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
    promptPath: 'evaluation/scion-adapters/lesson-kernel-judge-prompt-v0.16.54.md',
    promptSha256: '37844b86736335db54b561d8c031660ef71679c55ae1108e2e999e746f2a1c96',
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
    judge: { model: 'gpt-5.6-sol', revision: 'test-revision', runtime: 'isolated-test' },
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
      criticalDefects: Object.fromEntries(
        ['A', 'B'].map((label) => [label, label === decision ? [] : ['One bounded comparison defect.']]),
      ),
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
    expect(preferences[0]).toMatchObject({
      kind: 'lesson-kernel',
      taskFamily: 'lesson-kernel',
      winnerRole: 'reference',
      trainingEligible: true,
    });
    expect(validateScionTrainingPreferenceEvidence(preferences[0].preferenceEvidence)).toEqual({
      valid: true,
      issues: [],
    });
    const chosen = JSON.parse(preferences[0].chosen).lessons[0].mc[0];
    expect(chosen.op[0]).toBe('Divergent, convergent, transform');
    expect(chosen.ai).toBe(0);
    expect(assessCorpusRow(preferences[0], 'lesson-kernel-fixture')).toMatchObject({ eligible: true, issues: [] });
    const trainingRow = toScionOrpoTrainingRow(preferences[0]);
    expect(trainingRow.chosen[0].content).toBe(
      `${preferences[0].systemPrompt}\n\n${preferences[0].prompt}`,
    );
    expect(trainingRow.rejected[0].content).toBe(trainingRow.chosen[0].content);
    expect(trainingRow.provenance).toMatchObject({
      pairKind: 'lesson-kernel',
      taskFamily: 'lesson-kernel',
      promptProtocol: 'production-lesson-kernel-prompt-v1',
      sourceContextSha256: preferences[0].preferenceEvidence.sourceContextSha256,
    });

    const promptTamper = structuredClone(preferences[0]);
    promptTamper.systemPrompt += ' Changed after judgment.';
    expect(assessCorpusRow(promptTamper, 'lesson-kernel-fixture').issues).toEqual(
      expect.arrayContaining([
        'model-judge-training-pair-binding',
        'lesson-kernel-system-prompt-binding',
        'lesson-kernel-serving-prompt-binding',
      ]),
    );
  });

  it('binds a teacher-revised winner to its source-only revision and compiler lineage', () => {
    const inputs = fixture();
    const teacherCall = inputs.referenceReport.calls[0];
    teacherCall.arm = 'teacher-revision';
    teacherCall.originalArtifactSha256 = 'e'.repeat(64);
    teacherCall.revisionEvidence = {
      packetSha256: '1'.repeat(64),
      sessionId: 'teacher-revision-session',
    };
    inputs.referenceReport.workbookSha256 = '2'.repeat(64);
    inputs.referenceReport.identity = { algorithm: 'sha256-canonical-json', sha256: '3'.repeat(64) };
    inputs.referenceReport.batchReports = [
      {
        packetSha256: '1'.repeat(64),
        resultSha256: '4'.repeat(64),
        reportSha256: '5'.repeat(64),
      },
    ];
    const { ab, ba } = buildPackets(inputs);
    const aggregate = aggregateScionLessonKernelPairedOrders({
      abPacket: ab,
      baPacket: ba,
      abReview: completeReview(ab, 'teacher-a-b-session', 'B'),
      baReview: completeReview(ba, 'teacher-b-a-session', 'A'),
      localReport: inputs.localReport,
      referenceReport: inputs.referenceReport,
      generatedAt: '2026-07-18T18:00:00.000Z',
    });
    const [preference] = buildScionLessonKernelTrainingPreferences({
      aggregate,
      campaign: inputs.campaign,
      localReport: inputs.localReport,
      referenceReport: inputs.referenceReport,
    });

    expect(preference).toMatchObject({
      winnerRole: 'teacher-revision',
      rejectedRole: 'local',
      preferenceEvidence: {
        winnerRole: 'teacher-revision',
        rejectedRole: 'local',
        teacherRevisionLineage: {
          packetSha256: '1'.repeat(64),
          sessionId: 'teacher-revision-session',
          workbookSha256: '2'.repeat(64),
          teacherReportSha256: '3'.repeat(64),
          revisionResultSha256: '4'.repeat(64),
          compiledReportSha256: '5'.repeat(64),
          originalArtifactSha256: 'e'.repeat(64),
          authoredArtifactSha256: scionLessonKernelSha256(
            JSON.stringify(JSON.parse(preference.chosen).lessons[0]),
          ),
          lineageSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      },
    });
    expect(validateScionTrainingPreferenceEvidence(preference.preferenceEvidence)).toEqual({
      valid: true,
      issues: [],
    });
    expect(assessCorpusRow(preference, 'teacher-lineage-fixture')).toMatchObject({ eligible: true, issues: [] });
    expect(toScionOrpoTrainingRow(preference).provenance).toMatchObject({
      winnerRole: 'teacher-revision',
      rejectedRole: 'local',
      teacherRevisionLineageSha256:
        preference.preferenceEvidence.teacherRevisionLineage.lineageSha256,
    });

    const tampered = structuredClone(preference);
    tampered.preferenceEvidence.teacherRevisionLineage.revisionResultSha256 = 'f'.repeat(64);
    expect(assessCorpusRow(tampered, 'teacher-lineage-fixture').issues).toContain(
      'lesson-kernel-teacher-lineage-binding',
    );
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

  it('does not train on an order-stable preference without a positive score margin', () => {
    const inputs = fixture();
    const { ab, ba } = buildPackets(inputs);
    const abReview = completeReview(ab, 'score-a-b-session', 'B');
    const baReview = completeReview(ba, 'score-b-a-session', 'A');
    for (const review of [abReview, baReview]) {
      for (const decision of review.decisions) {
        for (const label of ['A', 'B']) {
          for (const dimension of SCION_LESSON_KERNEL_JUDGE_DIMENSIONS) {
            decision.scores[label][dimension].score = 3;
          }
        }
      }
    }
    const result = aggregateScionLessonKernelPairedOrders({
      abPacket: ab,
      baPacket: ba,
      abReview,
      baReview,
      localReport: inputs.localReport,
      referenceReport: inputs.referenceReport,
      generatedAt: '2026-07-18T18:00:00.000Z',
    });
    expect(result.summary).toMatchObject({ stablePreferences: 0, scoreRejected: 1 });
    expect(result.results[0]).toMatchObject({ stable: true, trainingEligible: false });
  });
});
