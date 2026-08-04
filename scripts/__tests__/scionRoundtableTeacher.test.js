import { describe, expect, it } from 'vitest';

import {
  SCION_ROUNDTABLE_TEACHING_PROTOCOL,
  buildScionRoundtableTeacherTopic,
  buildScionRoundtableStudentQuestion,
  quarantineScionRoundtableTeaching,
  validateScionRoundtableStudentQuestion,
  validateScionRoundtableTeachingCandidate,
} from '../lib/scionRoundtableTeacher.mjs';
import { scionLessonKernelSha256 } from '../lib/scionLessonKernelCampaign.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function withoutIdentity(value) {
  const copy = structuredClone(value);
  delete copy.identity;
  return copy;
}

function exhaustedCase() {
  return {
    caseSha256: HASH_A,
    sourceContextSha256: HASH_B,
    attempts: [
      {
        artifactSha256: HASH_A,
        assessment: { needsRetry: true, issues: ['lesson-4:mc-0:explanation-key-conflict'] },
      },
      {
        artifactSha256: HASH_B,
        assessment: { needsRetry: true, issues: ['lesson-4:mc-0:multiple-source-supported-options'] },
      },
      {
        artifactSha256: HASH_C,
        assessment: { needsRetry: true, issues: ['lesson-4:mc-0:multiple-source-supported-options'] },
      },
    ],
  };
}

function buildQuestion() {
  return buildScionRoundtableStudentQuestion({
    caseRecord: exhaustedCase(),
    maxAttempts: 3,
    generatedAt: '2026-08-04T10:00:00.000Z',
  }).question;
}

function teacherCandidate(question) {
  const candidate = {
    schemaVersion: 1,
    protocol: SCION_ROUNDTABLE_TEACHING_PROTOCOL,
    status: 'candidate',
    evidenceStatus: 'diagnostic-only',
    trainingEligible: false,
    questionSha256: question.identity.sha256,
    teacherPanelRef: scionLessonKernelSha256({ type: 'roundtable-panel-receipt', session: 1 }),
    teacherAttestation: { participantCount: 3 },
    recommendedPolicy: {
      selectedActions: ['narrow-stem-to-one-claim', 'replace-overlapping-distractor'],
      selectionRule:
        'First narrow the stem to one cited claim; replace a distractor only when overlap still prevents a unique supported option.',
      stopCondition: 'Stop and drop the item when deterministic replay still finds more than one source-supported option.',
      evidenceRequired: ['issue-family delta', 'source-ledger violation delta'],
      forbiddenInferences: ['teacher agreement proves correctness', 'one course proves generality'],
    },
    attestations: { policyOnly: true, noExternalCourseFacts: true, noTrainingAuthorization: true },
  };
  candidate.identity = { algorithm: 'sha256-canonical-json', sha256: scionLessonKernelSha256(withoutIdentity(candidate)) };
  return candidate;
}

describe('Scion Roundtable teacher protocol', () => {
  it('asks only after bounded retries are exhausted', () => {
    expect(buildScionRoundtableStudentQuestion({ caseRecord: exhaustedCase(), maxAttempts: 4 })).toEqual({
      ask: false,
      reason: 'retry-budget-not-exhausted',
    });
    expect(buildScionRoundtableStudentQuestion({ caseRecord: exhaustedCase(), maxAttempts: 3 }).ask).toBe(true);
  });

  it('offers a quarantine terminal instead of an impossible empty correction', () => {
    const record = exhaustedCase();
    record.attempts = record.attempts.map((attempt) => ({
      ...attempt,
      assessment: { needsRetry: true, issues: ['key-term-0:correction-repeats-definition'] },
    }));
    const { question } = buildScionRoundtableStudentQuestion({ caseRecord: record, maxAttempts: 3 });

    expect(question.decision.alternatives).toContain('quarantine-unrepairable-key-term');
    expect(question.decision.alternatives).not.toContain('omit-redundant-correction');
  });

  it('turns compiler uncertainty into a blinded, evidence-bound decision question', () => {
    const question = buildQuestion();
    expect(validateScionRoundtableStudentQuestion(question)).toEqual({ valid: true, issues: [] });
    expect(question.evidence).toMatchObject({
      finalIssueCodes: ['multiple-source-supported-options'],
      terminalReason: 'retry-budget-exhausted',
      sourceBindingDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(question.evidence.sourceBindingDigest).not.toBe(HASH_B);
    expect(question.evidence.trajectory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ issueCode: 'explanation-key-conflict', firstAttempt: 1, lastAttempt: 1, attemptsSeen: 1 }),
        expect.objectContaining({ issueCode: 'multiple-source-supported-options', firstAttempt: 2, lastAttempt: 3, attemptsSeen: 2 }),
      ]),
    );
    expect(question).toMatchObject({ evidenceStatus: 'diagnostic-only', trainingEligible: false });
    expect(question.decision.alternatives.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(question)).not.toContain('lesson-4');
    expect(JSON.stringify(question)).not.toContain(HASH_A);
    expect(JSON.stringify(question)).not.toContain(HASH_C);
    const topic = buildScionRoundtableTeacherTopic(question);
    expect(topic).toContain('Which repair ordering should a small course-neutral authoring model use');
    expect(topic).not.toContain(HASH_A);
    expect(topic).not.toContain(HASH_B);
    expect(topic).not.toContain(HASH_C);
  });

  it('rejects hidden answers, raw course context, and actions outside the student question', () => {
    const question = buildQuestion();
    const candidate = teacherCandidate(question);
    expect(validateScionRoundtableTeachingCandidate(candidate, question).valid).toBe(true);

    const leaked = structuredClone(candidate);
    leaked.courseTitle = 'Held-out course';
    leaked.expectedAnswer = 2;
    leaked.recommendedPolicy.selectedActions.push('invent-course-facts');
    leaked.identity.sha256 = scionLessonKernelSha256(withoutIdentity(leaked));
    const validation = validateScionRoundtableTeachingCandidate(leaked, question);
    expect(validation.valid).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining(['unbounded-action', 'forbidden-key:$.courseTitle', 'forbidden-key:$.expectedAnswer']),
    );

    const valueLeak = teacherCandidate(question);
    valueLeak.recommendedPolicy.selectionRule += ' Apply this to BIO 101 lesson-4 with expected answer index 2.';
    valueLeak.identity.sha256 = scionLessonKernelSha256(withoutIdentity(valueLeak));
    expect(validateScionRoundtableTeachingCandidate(valueLeak, question).issues).toContain(
      'leakage-value:$.recommendedPolicy.selectionRule',
    );
  });

  it('never asks Roundtable to repair a resolved historical issue', () => {
    const question = buildQuestion();
    expect(question.evidence.finalIssueCodes).toEqual(['multiple-source-supported-options']);
    expect(question.uncertainty).not.toContain('explanation-key-conflict');
  });

  it('quarantines unknown terminal issue families instead of asking from incomplete evidence', () => {
    const record = exhaustedCase();
    record.attempts.at(-1).assessment.issues.push('lesson-4:mc-0:new-unknown-problem');
    expect(buildScionRoundtableStudentQuestion({ caseRecord: record, maxAttempts: 3 })).toEqual({
      ask: false,
      reason: 'unknown-terminal-issue-family',
      unknownFinalIssueCodesCount: 1,
    });
  });

  it('scans panel metadata, attestations, and claim boundaries for leakage while keeping panel identity external', () => {
    const question = buildQuestion();
    const candidate = teacherCandidate(question);
    candidate.claimBoundary = 'Escalate BIO 101 to xingpicture@gmail.com.';
    candidate.identity.sha256 = scionLessonKernelSha256(withoutIdentity(candidate));
    expect(validateScionRoundtableTeachingCandidate(candidate, question).issues).toContain(
      'leakage-value:$.claimBoundary',
    );

    const embedded = teacherCandidate(question);
    embedded.teacherPanel = { participants: ['named-person'] };
    embedded.identity.sha256 = scionLessonKernelSha256(withoutIdentity(embedded));
    expect(validateScionRoundtableTeachingCandidate(embedded, question).issues).toContain('embedded-teacher-panel');

    for (const leakedRef of ['BIO 101', 'xingpicture@gmail.com', '/Users/example/panel', 'codex-claude-panel']) {
      const invalidRef = teacherCandidate(question);
      invalidRef.teacherPanelRef = leakedRef;
      invalidRef.identity.sha256 = scionLessonKernelSha256(withoutIdentity(invalidRef));
      expect(validateScionRoundtableTeachingCandidate(invalidRef, question).issues).toContain('teacher-panel-ref');
    }
  });

  it('keeps a valid panel answer quarantined instead of treating agreement as learning proof', () => {
    const question = buildQuestion();
    const learning = quarantineScionRoundtableTeaching({ candidate: teacherCandidate(question), question });
    expect(learning.status).toBe('quarantined');
    expect(learning.admission).toMatchObject({
      holdoutStatus: 'not-run',
      productionEligible: false,
      trainingEligible: false,
    });
    expect(learning.admission.requiredProof).toContain('precommitted-cross-discipline-holdouts');
  });
});
