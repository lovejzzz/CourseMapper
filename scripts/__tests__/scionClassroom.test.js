import { describe, expect, it } from 'vitest';

import {
  assessScionClassroomPromotion,
  buildScionClassroomAttempt,
  buildScionClassroomExam,
  buildScionClassroomPolicyCard,
  buildScionClassroomPreregistration,
  buildScionClassroomReviewReceipt,
  scoreScionClassroomAttempt,
  scoreScionClassroomQuestion,
} from '../lib/scionClassroom.mjs';
import { scionLessonKernelSha256 } from '../lib/scionLessonKernelCampaign.mjs';
import { runScionClassroomAudit } from '../scionClassroomAudit.mjs';
import { runScionRoundtableTeacherAudit } from '../scionRoundtableTeacherAudit.mjs';

describe('Scion classroom', () => {
  it('scores every question dimension with specific reasons', async () => {
    const teacher = await runScionRoundtableTeacherAudit();
    const assessment = scoreScionClassroomQuestion(teacher.question);
    expect(assessment).toMatchObject({ score: 100, grade: 'ready-to-ask', valid: true });
    expect(assessment.dimensions).toHaveLength(5);
    expect(assessment.dimensions.every((entry) => entry.reasons.length > 0)).toBe(true);
  });

  it('keeps a teacher lesson diagnostic when it becomes a policy card', async () => {
    const teacher = await runScionRoundtableTeacherAudit();
    const card = buildScionClassroomPolicyCard({
      learning: teacher.learning,
      question: teacher.question,
      teacherCandidate: teacher.candidate,
    });
    expect(card.status).toBe('diagnostic');
    expect(card.classroomState).toMatchObject({
      policyEligible: false,
      productionEligible: false,
      trainingEligible: false,
    });
  });

  it('rejects fabricated or provenance-mismatched learning before creating a policy card', async () => {
    const teacher = await runScionRoundtableTeacherAudit();
    const fabricated = structuredClone(teacher.learning);
    fabricated.recommendedPolicy.selectionRule = 'Use an arbitrary replacement policy without its bound teacher candidate.';
    const copy = structuredClone(fabricated);
    delete copy.identity;
    fabricated.identity.sha256 = scionLessonKernelSha256(copy);
    expect(() =>
      buildScionClassroomPolicyCard({
        learning: fabricated,
        question: teacher.question,
        teacherCandidate: teacher.candidate,
      }),
    ).toThrow(/provenance does not match/i);
  });

  it('separates the blind packet from its private decision key', async () => {
    const result = await runScionClassroomAudit();
    expect(result.packet.cases).toHaveLength(24);
    expect(result.sealedPacket.cases).toHaveLength(48);
    expect(JSON.stringify(result.packet)).not.toContain('expectedDecision');
    expect(result.answerKey.cases.every((entry) => entry.expectedDecision)).toBe(true);
  });

  it('rejects any answer-key or case mutation after preregistration', async () => {
    const result = await runScionClassroomAudit();
    const cases = result.packet.cases.map((entry, index) => ({
      ...entry,
      expectedDecision: index === 0 ? 'invent-course-facts' : result.answerKey.cases[index].expectedDecision,
      requiredEvidence: result.answerKey.cases[index].requiredEvidence,
    }));
    expect(() =>
      buildScionClassroomExam({
        policyCard: result.policyCard,
        preregistration: result.preregistration,
        privateRegistry: result.privateRegistry,
        phase: 'advised',
        cases,
      }),
    ).toThrow(/does not match preregistration/i);
  });

  it('never promotes a perfect contract fixture as measured Scion learning', async () => {
    const result = await runScionClassroomAudit();
    expect(result.immediate.score).toBe(100);
    expect(result.promotion).toMatchObject({ status: 'blocked', policyEligible: false });
    expect(result.promotion.issues).toContain('non-model-fixture-or-actor');
  });

  it('requires delayed, disjoint, independently reviewed model evidence', async () => {
    const result = await runScionClassroomAudit();
    const answers = result.answerKey.cases.map((entry) => ({
      caseId: entry.caseId,
      decision: entry.expectedDecision,
      evidenceUsed: entry.requiredEvidence,
    }));
    const attempt = buildScionClassroomAttempt({
      packet: result.packet,
      actor: 'scion-model',
      policyAccess: 'diagnostic-card',
      modelRef: scionLessonKernelSha256({ model: 'fixture-scion' }),
      sessionRef: scionLessonKernelSha256({ session: 'policy-mismatch' }),
      providerCalls: 24,
      answers,
    });
    const scored = scoreScionClassroomAttempt({ packet: result.packet, answerKey: result.answerKey, attempt });
    const promotion = assessScionClassroomPromotion({
      preregistration: result.preregistration,
      baseline: { ...scored, actor: 'scion-model', policyAccess: 'none' },
      immediate: scored,
      delayed: scored,
      reviewReceipts: [],
    });
    expect(promotion.policyEligible).toBe(false);
    expect(promotion.issues).toEqual(
      expect.arrayContaining([
        'delayed-holdout-overlap',
        'immediate-gain-below-preregistered-threshold',
        'paired-confidence-bound-not-positive',
        'sessions-not-independently-attested',
        'missing-independent-review',
      ]),
    );
  });

  it('rejects source overlap between practice and sealed-transfer splits', async () => {
    const result = await runScionClassroomAudit();
    const keyByCase = new Map([...result.answerKey.cases, ...result.sealedAnswerKey.cases].map((entry) => [entry.caseId, entry]));
    const cases = [...result.packet.cases, ...result.sealedPacket.cases].map((entry) => ({
      ...entry,
      expectedDecision: keyByCase.get(entry.caseId).expectedDecision,
      requiredEvidence: keyByCase.get(entry.caseId).requiredEvidence,
    }));
    const practiceSource = cases.find((entry) => entry.split === 'practice').sourceGroupSha256;
    cases.find((entry) => entry.split === 'sealed-transfer').sourceGroupSha256 = practiceSource;
    expect(() => buildScionClassroomPreregistration({ policyCard: result.policyCard, cases })).toThrow(
      /source group crosses classroom splits/i,
    );
  });

  it('invalidates an attempt whose claimed policy card does not match the frozen packet', async () => {
    const result = await runScionClassroomAudit();
    const answers = result.answerKey.cases.map((entry) => ({
      caseId: entry.caseId,
      decision: entry.expectedDecision,
      evidenceUsed: entry.requiredEvidence,
    }));
    const attempt = buildScionClassroomAttempt({
      packet: result.packet,
      actor: 'scion-model',
      policyAccess: 'diagnostic-card',
      modelRef: scionLessonKernelSha256({ model: 'fixture-scion' }),
      sessionRef: scionLessonKernelSha256({ session: 'sealed-negative' }),
      providerCalls: 48,
      answers,
    });
    attempt.policyCardSha256 = '0'.repeat(64);
    const copy = structuredClone(attempt);
    delete copy.identity;
    attempt.identity.sha256 = scionLessonKernelSha256(copy);
    expect(scoreScionClassroomAttempt({ packet: result.packet, answerKey: result.answerKey, attempt }).issues).toContain(
      'attempt-policy-card-mismatch',
    );
  });

  it('fails the sealed safety gate when Scion acts instead of abstaining on one negative case', async () => {
    const result = await runScionClassroomAudit();
    const answers = result.sealedAnswerKey.cases.map((entry) => ({
      caseId: entry.caseId,
      decision: entry.expectedDecision,
      evidenceUsed: entry.requiredEvidence,
    }));
    const negative = result.sealedPacket.cases.find((entry) => entry.variant === 'negative');
    answers.find((entry) => entry.caseId === negative.caseId).decision = negative.allowedActions[0];
    const attempt = buildScionClassroomAttempt({
      packet: result.sealedPacket,
      actor: 'scion-model',
      policyAccess: 'diagnostic-card',
      modelRef: scionLessonKernelSha256({ model: 'fixture-scion' }),
      sessionRef: scionLessonKernelSha256({ session: 'sealed-negative' }),
      providerCalls: 48,
      answers,
    });
    const delayed = scoreScionClassroomAttempt({
      packet: result.sealedPacket,
      answerKey: result.sealedAnswerKey,
      attempt,
    });
    const promotion = assessScionClassroomPromotion({
      preregistration: result.preregistration,
      baseline: { ...result.baseline, actor: 'scion-model' },
      immediate: { ...result.immediate, actor: 'scion-model' },
      delayed,
      reviewReceipts: ['reviewer-a', 'reviewer-b'].map((verifier) =>
        buildScionClassroomReviewReceipt({
          verifierRef: scionLessonKernelSha256({ type: 'reviewer', verifier }),
          baseline: { ...result.baseline, actor: 'scion-model' },
          immediate: { ...result.immediate, actor: 'scion-model' },
          delayed,
          blinded: true,
          pairedOrder: true,
        }),
      ),
      regression: { critical: 0, source: 0, export: 0, leakage: 0 },
    });
    expect(promotion.issues).toContain('unsafe-sealed-negative-quarantine');
  });
});
