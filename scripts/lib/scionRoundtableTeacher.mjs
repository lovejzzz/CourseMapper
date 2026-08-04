import {
  scionLessonKernelSha256,
  stableScionLessonKernelJson,
} from './scionLessonKernelCampaign.mjs';

export const SCION_ROUNDTABLE_QUESTION_PROTOCOL = 'scion-roundtable-student-question-v2';
export const SCION_ROUNDTABLE_TEACHING_PROTOCOL = 'scion-roundtable-teaching-candidate-v1';
export const SCION_ROUNDTABLE_LEARNING_PROTOCOL = 'scion-roundtable-quarantined-learning-v1';

const SHA256_RE = /^[a-f0-9]{64}$/;
const ISSUE_CATALOG = Object.freeze({
  'multiple-source-supported-options': {
    priority: 100,
    alternatives: ['narrow-stem-to-one-claim', 'replace-overlapping-distractor', 'drop-ambiguous-item'],
  },
  'source-answer-conflict': {
    priority: 95,
    alternatives: ['realign-key-to-source', 'rewrite-stem-around-cited-claim', 'drop-unsupported-item'],
  },
  'source-fact-key-mismatch': {
    priority: 90,
    alternatives: ['bind-key-to-cited-fact', 'rewrite-options-from-one-fact', 'drop-unsupported-item'],
  },
  'explanation-key-conflict': {
    priority: 85,
    alternatives: ['rewrite-explanation-for-key', 'realign-key-to-explanation', 'drop-conflicted-item'],
  },
  'invalid-source-fact-index': {
    priority: 80,
    alternatives: ['repair-source-index', 'regenerate-from-valid-claims', 'drop-unbound-item'],
  },
  'correction-repeats-definition': {
    priority: 60,
    alternatives: [
      'contrast-misconception-mechanism',
      'add-observable-counterexample',
      'quarantine-unrepairable-key-term',
    ],
  },
  'missing-seat': {
    priority: 55,
    alternatives: ['author-from-unused-source-claim', 'reuse-admitted-structure', 'leave-seat-empty-and-report'],
  },
});

const FORBIDDEN_KEYS = new Set([
  'answer',
  'answerindex',
  'artifact',
  'benchmark',
  'course',
  'coursename',
  'coursetitle',
  'expectedanswer',
  'hiddenanswer',
  'hiddenlabel',
  'lessoncontent',
  'localartifact',
  'prompt',
  'score',
  'sourceclaims',
]);
const LEAKAGE_VALUE_RES = [
  /\b[A-Z]{2,5}\s?\d{3,4}\b/,
  /\blesson-\d+\b/i,
  /\bcase-[a-f0-9]{8,}\b/i,
  /\b(?:answer\s*(?:index|key)|expected\s+answer|benchmark\s+(?:id|identity)|provider\s+(?:route|id))\b/i,
  /\b[A-Fa-f0-9]{64}\b/,
  /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/,
  /(?:^|\s)\/Users\//,
];

function withoutIdentity(value = {}) {
  const copy = structuredClone(value);
  delete copy.identity;
  return copy;
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function issueFamily(value) {
  const normalized = clean(value).toLowerCase();
  return Object.keys(ISSUE_CATALOG).find((family) => normalized === family || normalized.endsWith(`:${family}`)) || '';
}

function forbiddenKeys(value, path = '$', issues = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => forbiddenKeys(entry, `${path}[${index}]`, issues));
    return issues;
  }
  if (!value || typeof value !== 'object') return issues;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) issues.push(`${path}.${key}`);
    forbiddenKeys(child, `${path}.${key}`, issues);
  }
  return issues;
}

function leakedValues(value, path = '$', issues = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => leakedValues(entry, `${path}[${index}]`, issues));
    return issues;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => leakedValues(child, `${path}.${key}`, issues));
    return issues;
  }
  if (typeof value === 'string' && LEAKAGE_VALUE_RES.some((pattern) => pattern.test(value))) issues.push(path);
  return issues;
}

function terminalIssueState(attempts = []) {
  const trajectory = new Map();
  attempts.forEach((attempt, attemptIndex) => {
    const attemptNumber = attemptIndex + 1;
    const seen = new Set();
    for (const rawIssue of attempt?.assessment?.issues || []) {
      const family = issueFamily(rawIssue);
      if (!family || seen.has(family)) continue;
      seen.add(family);
      const prior = trajectory.get(family);
      trajectory.set(family, {
        issueCode: family,
        firstAttempt: prior?.firstAttempt ?? attemptNumber,
        lastAttempt: attemptNumber,
        attemptsSeen: (prior?.attemptsSeen || 0) + 1,
      });
    }
  });
  const finalIssues = attempts.at(-1)?.assessment?.issues || [];
  const finalIssueCodes = unique(finalIssues.map(issueFamily)).sort(
    (a, b) => ISSUE_CATALOG[b].priority - ISSUE_CATALOG[a].priority || a.localeCompare(b),
  );
  return {
    finalIssueCodes,
    trajectory: [...trajectory.values()].sort((a, b) => a.firstAttempt - b.firstAttempt || a.issueCode.localeCompare(b.issueCode)),
    unknownFinalIssueCodesCount: finalIssues.filter((rawIssue) => !issueFamily(rawIssue)).length,
  };
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

export function buildScionRoundtableStudentQuestion({
  caseRecord,
  maxAttempts,
  generatedAt = new Date().toISOString(),
} = {}) {
  const attempts = Array.isArray(caseRecord?.attempts) ? caseRecord.attempts : [];
  const finalAttempt = attempts.at(-1);
  const issueState = terminalIssueState(attempts);
  const exhausted =
    Number.isInteger(maxAttempts) &&
    maxAttempts > 0 &&
    attempts.length >= maxAttempts &&
    finalAttempt?.assessment?.needsRetry === true;
  if (!exhausted) return { ask: false, reason: 'retry-budget-not-exhausted' };
  if (issueState.unknownFinalIssueCodesCount > 0) {
    return {
      ask: false,
      reason: 'unknown-terminal-issue-family',
      unknownFinalIssueCodesCount: issueState.unknownFinalIssueCodesCount,
    };
  }
  if (issueState.finalIssueCodes.length === 0) return { ask: false, reason: 'no-teachable-issue-family' };

  const issueFamilies = issueState.finalIssueCodes;
  const alternatives = unique(issueFamilies.flatMap((family) => ISSUE_CATALOG[family].alternatives)).slice(0, 8);
  if (alternatives.length < 2) return { ask: false, reason: 'fewer-than-two-bounded-alternatives' };

  // Strict allowlist projection. Even hashes of case ids or generated
  // artifacts can become evaluation-identity side channels, so the teacher
  // stored question contains only the task family, issue classes, terminal
  // reason, and a digest binding it to an unseen source context. The teacher
  // topic projection below deliberately omits even that digest.
  const evidence = {
    finalIssueCodes: issueFamilies,
    trajectory: issueState.trajectory,
    unknownFinalIssueCodesCount: 0,
    terminalReason: 'retry-budget-exhausted',
    // Make the local binding unlinkable across questions. This receipt never
    // enters the teacher-visible topic, and it is not the raw source digest.
    sourceBindingDigest: scionLessonKernelSha256({
      protocol: SCION_ROUNDTABLE_QUESTION_PROTOCOL,
      generatedAt,
      sourceContextSha256: clean(caseRecord?.sourceContextSha256),
    }),
  };
  const question = {
    schemaVersion: 1,
    protocol: SCION_ROUNDTABLE_QUESTION_PROTOCOL,
    generatedAt,
    status: 'diagnostic-only',
    evidenceStatus: 'diagnostic-only',
    trainingEligible: false,
    taskFamily: 'source-grounded-lesson-kernel-repair',
    trigger: 'deterministic-retry-exhaustion',
    evidence,
    uncertainty: `The compiler still reports ${issueFamilies.join(', ')} after its bounded repair ladder was exhausted.`,
    decision: {
      alternatives,
      request:
        'Which repair ordering should a small course-neutral authoring model use, and what observable evidence should choose or stop each repair?',
    },
    successCriteria: [
      'Reduce the named issue families on precommitted cross-discipline holdouts.',
      'Do not increase factual or source-ledger violations.',
      'Do not change export verification or leak evaluation identity.',
      'Stay within the precommitted retry and consultation cost ceiling.',
    ],
    forbiddenContext: [
      'course identity or title',
      'raw source claims or learner content',
      'expected answers, hidden labels, or benchmark scores',
      'provider routing and local artifacts',
    ],
    requestedAnswerShape: {
      policyOnly: true,
      required: ['selectedActions', 'selectionRule', 'stopCondition', 'evidenceRequired', 'forbiddenInferences'],
    },
    claimBoundary:
      'This is a blinded diagnostic question. A teacher answer is advice, not course content, training authorization, or production policy.',
  };
  question.identity = {
    algorithm: 'sha256-canonical-json',
    sha256: scionLessonKernelSha256(withoutIdentity(question)),
  };
  return { ask: true, question };
}

export function validateScionRoundtableStudentQuestion(question = {}) {
  const issues = [];
  if (question.protocol !== SCION_ROUNDTABLE_QUESTION_PROTOCOL) issues.push('protocol');
  if (question.status !== 'diagnostic-only') issues.push('status');
  if (question.evidenceStatus !== 'diagnostic-only') issues.push('evidence-status');
  if (question.trainingEligible !== false) issues.push('training-eligible');
  if (question.trigger !== 'deterministic-retry-exhaustion') issues.push('trigger');
  if (question.evidence?.terminalReason !== 'retry-budget-exhausted') issues.push('terminal-reason');
  if (!SHA256_RE.test(question.evidence?.sourceBindingDigest || '')) issues.push('source-binding-digest');
  const families = question.evidence?.finalIssueCodes || [];
  if (!families.length || families.some((family) => !ISSUE_CATALOG[family])) {
    issues.push('issue-families');
  }
  if (
    Object.keys(question.evidence || {}).sort().join(',') !==
    'finalIssueCodes,sourceBindingDigest,terminalReason,trajectory,unknownFinalIssueCodesCount'
  ) {
    issues.push('non-allowlisted-evidence');
  }
  if (question.evidence?.unknownFinalIssueCodesCount !== 0) issues.push('unknown-terminal-issue-family');
  const trajectory = question.evidence?.trajectory;
  if (
    !Array.isArray(trajectory) ||
    trajectory.some(
      (entry) =>
        !ISSUE_CATALOG[entry?.issueCode] ||
        !Number.isInteger(entry?.firstAttempt) ||
        !Number.isInteger(entry?.lastAttempt) ||
        !Number.isInteger(entry?.attemptsSeen) ||
        entry.firstAttempt < 1 ||
        entry.lastAttempt < entry.firstAttempt ||
        entry.attemptsSeen < 1,
    )
  ) {
    issues.push('issue-trajectory');
  }
  const alternatives = question.decision?.alternatives || [];
  if (unique(alternatives).length < 2) issues.push('bounded-alternatives');
  if (!clean(question.decision?.request).endsWith('?')) issues.push('explicit-question');
  if (!Array.isArray(question.successCriteria) || question.successCriteria.length < 4) issues.push('success-criteria');
  if (!Array.isArray(question.forbiddenContext) || question.forbiddenContext.length < 4) issues.push('forbidden-context');
  for (const path of forbiddenKeys(question)) issues.push(`forbidden-key:${path}`);
  if (question.identity?.sha256 !== scionLessonKernelSha256(withoutIdentity(question))) issues.push('identity');
  return { valid: issues.length === 0, issues: unique(issues) };
}

export function buildScionRoundtableTeacherTopic(question = {}) {
  const validation = validateScionRoundtableStudentQuestion(question);
  if (!validation.valid) throw new Error(`Invalid Scion student question: ${validation.issues.join(', ')}`);
  return [
    'SCION STUDENT QUESTION (diagnostic-only)',
    `Task family: ${question.taskFamily}`,
    `Terminal issue codes: ${question.evidence.finalIssueCodes.join(', ')}`,
    `Terminal reason: ${question.evidence.terminalReason}`,
    `Allowed actions: ${question.decision.alternatives.join(', ')}`,
    question.decision.request,
    `Success criteria: ${question.successCriteria.join(' | ')}`,
    `Forbidden context: ${question.forbiddenContext.join(' | ')}`,
    'Return policy only: selectedActions, selectionRule, stopCondition, evidenceRequired, forbiddenInferences.',
    'Every answer remains diagnostic-only and training-ineligible until independent replay and promotion proof pass.',
  ].join('\n');
}

export function validateScionRoundtableTeachingCandidate(candidate = {}, question = {}) {
  const issues = [];
  const questionValidation = validateScionRoundtableStudentQuestion(question);
  if (!questionValidation.valid) issues.push('invalid-question');
  if (candidate.protocol !== SCION_ROUNDTABLE_TEACHING_PROTOCOL) issues.push('protocol');
  if (candidate.status !== 'candidate') issues.push('status');
  if (candidate.evidenceStatus !== 'diagnostic-only') issues.push('evidence-status');
  if (candidate.trainingEligible !== false) issues.push('training-eligible');
  if (candidate.questionSha256 !== question.identity?.sha256) issues.push('question-sha256');
  if (!SHA256_RE.test(clean(candidate.teacherPanelRef))) issues.push('teacher-panel-ref');
  if (!Number.isInteger(candidate.teacherAttestation?.participantCount) || candidate.teacherAttestation.participantCount < 2) {
    issues.push('teacher-participants');
  }
  if (candidate.teacherPanel !== undefined) issues.push('embedded-teacher-panel');
  const policy = candidate.recommendedPolicy || {};
  const allowedActions = new Set(question.decision?.alternatives || []);
  if (!Array.isArray(policy.selectedActions) || policy.selectedActions.length === 0) issues.push('selected-actions');
  if ((policy.selectedActions || []).some((action) => !allowedActions.has(action))) issues.push('unbounded-action');
  if (clean(policy.selectionRule).length < 40) issues.push('selection-rule');
  if (clean(policy.stopCondition).length < 30) issues.push('stop-condition');
  if (!Array.isArray(policy.evidenceRequired) || policy.evidenceRequired.length < 2) issues.push('evidence-required');
  if (!Array.isArray(policy.forbiddenInferences) || policy.forbiddenInferences.length < 2) {
    issues.push('forbidden-inferences');
  }
  if (candidate.attestations?.policyOnly !== true) issues.push('attestation:policy-only');
  if (candidate.attestations?.noExternalCourseFacts !== true) issues.push('attestation:no-external-course-facts');
  if (candidate.attestations?.noTrainingAuthorization !== true) issues.push('attestation:no-training-authorization');
  for (const path of forbiddenKeys(candidate)) issues.push(`forbidden-key:${path}`);
  const candidateForLeakageScan = structuredClone(candidate);
  delete candidateForLeakageScan.identity;
  delete candidateForLeakageScan.questionSha256;
  delete candidateForLeakageScan.teacherPanelRef;
  for (const path of leakedValues(candidateForLeakageScan)) issues.push(`leakage-value:${path}`);
  if (candidate.identity?.sha256 !== scionLessonKernelSha256(withoutIdentity(candidate))) issues.push('identity');
  return { valid: issues.length === 0, issues: unique(issues) };
}

export function quarantineScionRoundtableTeaching({ candidate, question } = {}) {
  const validation = validateScionRoundtableTeachingCandidate(candidate, question);
  if (!validation.valid) throw new Error(`Invalid Roundtable teaching candidate: ${validation.issues.join(', ')}`);
  const artifact = {
    schemaVersion: 1,
    protocol: SCION_ROUNDTABLE_LEARNING_PROTOCOL,
    status: 'quarantined',
    taskFamily: question.taskFamily,
    triggeringIssues: question.evidence.finalIssueCodes,
    questionSha256: question.identity.sha256,
    teacherCandidateSha256: candidate.identity.sha256,
    recommendedPolicy: candidate.recommendedPolicy,
    admission: {
      holdoutStatus: 'not-run',
      productionEligible: false,
      trainingEligible: false,
      requiredProof: [
        'precommitted-cross-discipline-holdouts',
        'anonymous-paired-order-preference',
        'non-worsening-source-ledger-violations',
        'zero-export-regressions',
        'zero-evaluation-identity-leakage',
      ],
    },
    claimBoundary:
      'This policy remains quarantined until independent replay and promotion evidence pass. Roundtable agreement alone cannot admit it.',
  };
  artifact.identity = {
    algorithm: 'sha256-canonical-json',
    sha256: scionLessonKernelSha256(withoutIdentity(artifact)),
  };
  return artifact;
}

export function scionRoundtableQuestionFingerprint(question = {}) {
  return scionLessonKernelSha256(stableScionLessonKernelJson(question));
}
