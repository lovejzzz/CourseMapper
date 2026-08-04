#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  assessScionClassroomPromotion,
  buildScionClassroomAttempt,
  buildScionClassroomExam,
  buildScionClassroomPolicyCard,
  buildScionClassroomPreregistration,
  buildScionClassroomReviewReceipt,
  scoreScionClassroomAttempt,
  scoreScionClassroomQuestion,
} from './lib/scionClassroom.mjs';
import { runScionRoundtableTeacherAudit } from './scionRoundtableTeacherAudit.mjs';
import { scionLessonKernelSha256 } from './lib/scionLessonKernelCampaign.mjs';

const DEFAULT_OUTPUT = 'verification-output/scion-classroom-pilot';

function classroomCases(policyCard) {
  const [firstAction, secondAction] = policyCard.policy.selectedActions;
  const correctionPolicy = policyCard.issueFamilies.includes('correction-repeats-definition');
  return Array.from({ length: 6 }, (_, domainIndex) => {
    const domainGroupSha256 = scionLessonKernelSha256({ type: 'opaque-classroom-domain', domainIndex });
    const split = domainIndex < 2 ? 'practice' : 'sealed-transfer';
    return Array.from({ length: 12 }, (_, caseIndex) => {
      const negative = caseIndex >= 8;
      const caseId = `${split === 'practice' ? 'practice' : 'sealed'}-d${domainIndex + 1}-c${caseIndex + 1}`;
      const sourceGroupSha256 = scionLessonKernelSha256({ type: 'opaque-source-group', caseId });
      if (negative) {
        return {
          caseId,
          domainGroupSha256,
          sourceGroupSha256,
          split,
          signalOrigin: 'fixture-assigned',
          variant: 'negative',
          issueCodes: policyCard.issueFamilies,
          allowedActions: [firstAction, secondAction],
          signals: {
            ...(correctionPolicy
              ? { correctionHasSupportedContrast: false, counterexampleIsSourceSupported: false }
              : {
                  supportedOptionCount: 0,
                  existingOptionMatchesCitedFact: false,
                  oneFactSupportsCompleteOptionSet: false,
                }),
            introducesSourceViolation: true,
          },
          expectedDecision: 'quarantine',
          requiredEvidence: correctionPolicy
            ? ['correctionHasSupportedContrast', 'counterexampleIsSourceSupported', 'introducesSourceViolation']
            : ['supportedOptionCount', 'introducesSourceViolation'],
        };
      }
      const chooseFirst = caseIndex % 2 === 0;
      return {
        caseId,
        domainGroupSha256,
        sourceGroupSha256,
        split,
        signalOrigin: 'fixture-assigned',
        variant: caseIndex % 4 === 3 ? 'boundary' : 'transfer',
        issueCodes: policyCard.issueFamilies,
        allowedActions: [firstAction, secondAction],
        signals: {
          ...(correctionPolicy
            ? {
                correctionHasSupportedContrast: chooseFirst,
                counterexampleIsSourceSupported: !chooseFirst,
              }
            : {
                supportedOptionCount: chooseFirst ? 1 : 2,
                existingOptionMatchesCitedFact: chooseFirst,
                oneFactSupportsCompleteOptionSet: !chooseFirst,
                stemKeyExplanationConsistent: chooseFirst,
              }),
        },
        expectedDecision: chooseFirst ? firstAction : secondAction,
        requiredEvidence: correctionPolicy
          ? [chooseFirst ? 'correctionHasSupportedContrast' : 'counterexampleIsSourceSupported']
          : chooseFirst
            ? ['supportedOptionCount', 'existingOptionMatchesCitedFact', 'stemKeyExplanationConsistent']
            : ['supportedOptionCount', 'oneFactSupportsCompleteOptionSet'],
      };
    });
  }).flat();
}

function answersFor(packet, answerKey, { correct = true } = {}) {
  const keys = new Map(answerKey.cases.map((entry) => [entry.caseId, entry]));
  return packet.cases.map((examCase, index) => ({
    caseId: examCase.caseId,
    decision: correct || index % 3 !== 0 ? keys.get(examCase.caseId).expectedDecision : examCase.allowedActions.at(-1),
    evidenceUsed: keys.get(examCase.caseId).requiredEvidence,
  }));
}

export async function runScionClassroomAudit({ output = DEFAULT_OUTPUT, write = false } = {}) {
  const teacher = await runScionRoundtableTeacherAudit();
  const questionAssessment = scoreScionClassroomQuestion(teacher.question);
  const policyCard = buildScionClassroomPolicyCard({
    learning: teacher.learning,
    question: teacher.question,
    teacherCandidate: teacher.candidate,
    generatedAt: '2026-08-04T14:30:00.000Z',
  });
  const cases = classroomCases(policyCard);
  const { manifest: preregistration, privateRegistry } = buildScionClassroomPreregistration({
    policyCard,
    cases,
    frozenAt: '2026-08-04T14:30:30.000Z',
    commitmentNonces: Object.fromEntries(
      cases.map((entry) => [entry.caseId, scionLessonKernelSha256({ type: 'fixture-case-nonce', caseId: entry.caseId })]),
    ),
  });
  const practiceCases = cases.filter((entry) => entry.split === 'practice');
  const { packet: baselinePacket, answerKey: baselineAnswerKey } = buildScionClassroomExam({
    policyCard,
    preregistration,
    privateRegistry,
    phase: 'baseline',
    cases: practiceCases,
    frozenAt: '2026-08-04T14:31:00.000Z',
  });
  const { packet: practicePacket, answerKey: practiceAnswerKey } = buildScionClassroomExam({
    policyCard,
    preregistration,
    privateRegistry,
    phase: 'advised',
    cases: practiceCases,
    frozenAt: '2026-08-04T14:31:15.000Z',
  });
  const { packet: sealedPacket, answerKey: sealedAnswerKey } = buildScionClassroomExam({
    policyCard,
    preregistration,
    privateRegistry,
    phase: 'delayed',
    cases: cases.filter((entry) => entry.split === 'sealed-transfer'),
    frozenAt: '2026-08-04T14:31:30.000Z',
  });
  const baselineAttempt = buildScionClassroomAttempt({
    packet: baselinePacket,
    actor: 'contract-fixture',
    policyAccess: 'none',
    answers: answersFor(baselinePacket, baselineAnswerKey, { correct: false }),
    generatedAt: '2026-08-04T14:32:00.000Z',
  });
  const classroomAttempt = buildScionClassroomAttempt({
    packet: practicePacket,
    actor: 'contract-fixture',
    policyAccess: 'diagnostic-card',
    answers: answersFor(practicePacket, practiceAnswerKey),
    generatedAt: '2026-08-04T14:33:00.000Z',
  });
  const delayedAttempt = buildScionClassroomAttempt({
    packet: sealedPacket,
    actor: 'contract-fixture',
    policyAccess: 'diagnostic-card',
    answers: answersFor(sealedPacket, sealedAnswerKey),
    generatedAt: '2026-08-04T14:34:00.000Z',
  });
  const baseline = scoreScionClassroomAttempt({ packet: baselinePacket, answerKey: baselineAnswerKey, attempt: baselineAttempt });
  const immediate = scoreScionClassroomAttempt({ packet: practicePacket, answerKey: practiceAnswerKey, attempt: classroomAttempt });
  const delayed = scoreScionClassroomAttempt({ packet: sealedPacket, answerKey: sealedAnswerKey, attempt: delayedAttempt });
  const reviewReceipts = ['fixture-a', 'fixture-b'].map((verifier) =>
    buildScionClassroomReviewReceipt({
      verifierRef: scionLessonKernelSha256({ type: 'classroom-reviewer', verifier }),
      baseline,
      immediate,
      delayed,
      blinded: true,
      pairedOrder: true,
    }),
  );
  const promotion = assessScionClassroomPromotion({
    preregistration,
    baseline,
    immediate,
    delayed,
    artifacts: {
      baseline: { packet: baselinePacket, answerKey: baselineAnswerKey, attempt: baselineAttempt },
      immediate: { packet: practicePacket, answerKey: practiceAnswerKey, attempt: classroomAttempt },
      delayed: { packet: sealedPacket, answerKey: sealedAnswerKey, attempt: delayedAttempt },
    },
    reviewReceipts,
    regression: { critical: 0, source: 0, export: 0, leakage: 0 },
  });
  const summary = {
    questionScore: questionAssessment.score,
    questionReady: questionAssessment.valid,
    preregisteredCases: preregistration.design.totalCases,
    practiceDomains: preregistration.design.practiceDomains,
    sealedTransferDomains: preregistration.design.sealedTransferDomains,
    privateKeySeparated:
      !JSON.stringify(practicePacket).includes('expectedDecision') && !JSON.stringify(sealedPacket).includes('expectedDecision'),
    baselineFixtureScore: baseline.score,
    classroomFixtureScore: immediate.score,
    measuredModelGain: false,
    promotionBlocked: promotion.policyEligible === false,
    promotionBlockers: promotion.issues,
  };
  if (write) {
    await fs.mkdir(output, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(output, 'question-score.json'), `${JSON.stringify(questionAssessment, null, 2)}\n`),
      fs.writeFile(path.join(output, 'policy-card.json'), `${JSON.stringify(policyCard, null, 2)}\n`),
      fs.writeFile(path.join(output, 'preregistration.json'), `${JSON.stringify(preregistration, null, 2)}\n`),
      fs.writeFile(path.join(output, 'private-registry.fixture.json'), `${JSON.stringify(privateRegistry, null, 2)}\n`),
      fs.writeFile(path.join(output, 'blind-practice-packet.json'), `${JSON.stringify(practicePacket, null, 2)}\n`),
      fs.writeFile(path.join(output, 'blind-baseline-packet.json'), `${JSON.stringify(baselinePacket, null, 2)}\n`),
      fs.writeFile(path.join(output, 'blind-sealed-transfer-packet.json'), `${JSON.stringify(sealedPacket, null, 2)}\n`),
      fs.writeFile(path.join(output, 'private-practice-answer-key.fixture.json'), `${JSON.stringify(practiceAnswerKey, null, 2)}\n`),
      fs.writeFile(path.join(output, 'private-sealed-answer-key.fixture.json'), `${JSON.stringify(sealedAnswerKey, null, 2)}\n`),
      fs.writeFile(path.join(output, 'promotion-audit.fixture.json'), `${JSON.stringify(promotion, null, 2)}\n`),
      fs.writeFile(path.join(output, 'review-receipts.fixture.json'), `${JSON.stringify(reviewReceipts, null, 2)}\n`),
    ]);
  }
  return {
    questionAssessment,
    policyCard,
    preregistration,
    privateRegistry,
    packet: practicePacket,
    answerKey: practiceAnswerKey,
    baselinePacket,
    baselineAnswerKey,
    sealedPacket,
    sealedAnswerKey,
    baseline,
    immediate,
    delayed,
    promotion,
    summary,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== '--write')) throw new Error('Usage: node scripts/scionClassroomAudit.mjs [--write]');
  const result = await runScionClassroomAudit({ write: args.has('--write') });
  console.log(JSON.stringify(result.summary, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
