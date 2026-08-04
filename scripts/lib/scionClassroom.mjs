import { randomBytes } from 'node:crypto';

import {
  SCION_ROUNDTABLE_LEARNING_PROTOCOL,
  validateScionRoundtableStudentQuestion,
  validateScionRoundtableTeachingCandidate,
} from './scionRoundtableTeacher.mjs';
import { scionLessonKernelSha256 } from './scionLessonKernelCampaign.mjs';

export const SCION_CLASSROOM_POLICY_PROTOCOL = 'scion-classroom-policy-card-v1';
export const SCION_CLASSROOM_PREREGISTRATION_PROTOCOL = 'scion-classroom-preregistration-v1';
export const SCION_CLASSROOM_PRIVATE_REGISTRY_PROTOCOL = 'scion-classroom-private-registry-v1';
export const SCION_CLASSROOM_EXAM_PROTOCOL = 'scion-classroom-exam-v1';
export const SCION_CLASSROOM_ATTEMPT_PROTOCOL = 'scion-classroom-attempt-v1';
export const SCION_CLASSROOM_RESULT_PROTOCOL = 'scion-classroom-result-v1';
export const SCION_CLASSROOM_REVIEW_PROTOCOL = 'scion-classroom-review-receipt-v1';
export const SCION_CLASSROOM_PROMOTION_PROTOCOL = 'scion-classroom-promotion-v1';

const SHA256_RE = /^[a-f0-9]{64}$/;
const SIGNAL_KEYS = new Set([
  'correctionHasSupportedContrast',
  'counterexampleIsSourceSupported',
  'existingOptionMatchesCitedFact',
  'introducesExportRegression',
  'introducesSourceViolation',
  'oneFactSupportsCompleteOptionSet',
  'stemKeyExplanationConsistent',
  'supportedOptionCount',
]);
const VARIANTS = new Set(['transfer', 'boundary', 'negative']);
const SPLITS = new Set(['practice', 'sealed-transfer']);
const PHASES = new Set(['baseline', 'advised', 'delayed']);
const SIGNAL_ORIGINS = new Set(['fixture-assigned', 'verifier-derived']);
const LEAKAGE_RES = [
  /\b[A-Z]{2,5}\s?\d{3,4}\b/,
  /\blesson-\d+\b/i,
  /\b(?:answer\s*(?:index|key)|expected\s+answer|course\s+title|provider\s+route)\b/i,
  /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/,
  /(?:^|\s)\/Users\//,
  /\b[a-f0-9]{64}\b/i,
];

function withoutIdentity(value = {}) {
  const copy = structuredClone(value);
  delete copy.identity;
  return copy;
}

function clean(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function identityFor(value) {
  return {
    algorithm: 'sha256-canonical-json',
    sha256: scionLessonKernelSha256(withoutIdentity(value)),
  };
}

function identityValid(value = {}) {
  return value.identity?.sha256 === scionLessonKernelSha256(withoutIdentity(value));
}

function publicCaseCommitmentPayload(entry = {}) {
  return {
    caseId: entry.caseId,
    domainGroupSha256: entry.domainGroupSha256,
    sourceGroupSha256: entry.sourceGroupSha256,
    split: entry.split,
    variant: entry.variant,
    issueCodes: unique(entry.issueCodes),
    allowedActions: unique(entry.allowedActions),
    signals: structuredClone(entry.signals || {}),
    signalOrigin: entry.signalOrigin,
  };
}

function privateCaseCommitmentPayload(entry = {}) {
  return {
    caseId: entry.caseId,
    expectedDecision: entry.expectedDecision,
    requiredEvidence: unique(entry.requiredEvidence),
  };
}

function leakagePaths(value, path = '$', issues = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => leakagePaths(entry, `${path}[${index}]`, issues));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => leakagePaths(child, `${path}.${key}`, issues));
  } else if (typeof value === 'string' && LEAKAGE_RES.some((pattern) => pattern.test(value))) {
    issues.push(path);
  }
  return issues;
}

function dimension(name, earned, possible, reasons) {
  return { name, earned, possible, reasons };
}

export function scoreScionClassroomQuestion(question = {}) {
  const validation = validateScionRoundtableStudentQuestion(question);
  const evidenceKeys = Object.keys(question.evidence || {})
    .sort()
    .join(',');
  const alternatives = unique(question.decision?.alternatives || []);
  const criteria = question.successCriteria || [];
  const forbidden = question.forbiddenContext || [];
  const dimensions = [
    dimension(
      'genuine-uncertainty',
      question.trigger === 'deterministic-retry-exhaustion' &&
        question.evidence?.terminalReason === 'retry-budget-exhausted'
        ? 20
        : 0,
      20,
      ['Requires an observable retry-exhaustion trigger and terminal receipt.'],
    ),
    dimension(
      'bounded-decision',
      alternatives.length >= 2 && alternatives.length <= 8 && clean(question.decision?.request).endsWith('?') ? 20 : 0,
      20,
      ['Requires two to eight unique actions and one explicit decision question.'],
    ),
    dimension(
      'evidence-discipline',
      evidenceKeys === 'finalIssueCodes,sourceBindingDigest,terminalReason,trajectory,unknownFinalIssueCodesCount' &&
        question.evidence?.unknownFinalIssueCodesCount === 0 &&
        SHA256_RE.test(question.evidence?.sourceBindingDigest || '')
        ? 20
        : 0,
      20,
      [
        'Requires terminal-only issue codes, a course-neutral trajectory, no unknown terminal issues, and a non-content source binding.',
      ],
    ),
    dimension(
      'falsifiability',
      criteria.length >= 4 &&
        criteria.some((value) => /cross-discipline/i.test(value)) &&
        criteria.some((value) => /source-ledger/i.test(value))
        ? 20
        : 0,
      20,
      ['Requires transfer, source-integrity, regression, and cost success criteria.'],
    ),
    dimension(
      'privacy-and-restraint',
      forbidden.length >= 4 && question.trainingEligible === false && leakagePaths(question.decision || {}).length === 0
        ? 20
        : 0,
      20,
      ['Requires explicit forbidden context, no content leakage, and no training authorization.'],
    ),
  ];
  const score = dimensions.reduce((sum, entry) => sum + entry.earned, 0);
  return {
    score,
    grade: score >= 90 ? 'ready-to-ask' : score >= 70 ? 'revise-before-asking' : 'do-not-ask',
    valid: validation.valid && score >= 90,
    validatorIssues: validation.issues,
    dimensions,
  };
}

export function buildScionClassroomPolicyCard({
  learning,
  question,
  teacherCandidate,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (learning?.protocol !== SCION_ROUNDTABLE_LEARNING_PROTOCOL || learning?.status !== 'quarantined') {
    throw new Error('A classroom policy card requires quarantined Roundtable learning');
  }
  if (!identityValid(learning)) throw new Error('A classroom policy card requires identity-valid Roundtable learning');
  if (!validateScionRoundtableStudentQuestion(question).valid)
    throw new Error('A classroom policy card requires the bound student question');
  if (!validateScionRoundtableTeachingCandidate(teacherCandidate, question).valid) {
    throw new Error('A classroom policy card requires the bound teacher candidate');
  }
  if (
    learning.questionSha256 !== question.identity.sha256 ||
    learning.teacherCandidateSha256 !== teacherCandidate.identity.sha256 ||
    scionLessonKernelSha256(learning.recommendedPolicy) !==
      scionLessonKernelSha256(teacherCandidate.recommendedPolicy) ||
    learning.taskFamily !== question.taskFamily
  ) {
    throw new Error('Roundtable learning provenance does not match its question and teacher candidate');
  }
  if (learning.admission?.productionEligible || learning.admission?.trainingEligible) {
    throw new Error('Teacher advice must enter the classroom without production or training authorization');
  }
  const card = {
    schemaVersion: 1,
    protocol: SCION_CLASSROOM_POLICY_PROTOCOL,
    status: 'diagnostic',
    generatedAt,
    taskFamily: learning.taskFamily,
    issueFamilies: unique(learning.triggeringIssues),
    sourceLearningSha256: learning.identity?.sha256,
    policy: structuredClone(learning.recommendedPolicy),
    classroomState: {
      practiceStatus: 'not-run',
      policyEligible: false,
      productionEligible: false,
      trainingEligible: false,
    },
    claimBoundary:
      'This card may guide blinded practice only. It is not course knowledge, a production rule, or adapter-training evidence.',
  };
  card.identity = identityFor(card);
  return card;
}

export function buildScionClassroomPreregistration({
  policyCard,
  cases = [],
  frozenAt = new Date().toISOString(),
  commitmentNonces = {},
} = {}) {
  if (policyCard?.protocol !== SCION_CLASSROOM_POLICY_PROTOCOL || !identityValid(policyCard)) {
    throw new Error('Invalid Scion classroom policy card');
  }
  if (cases.length !== 72) throw new Error('The preregistered pilot requires exactly 72 cases');
  const byDomain = new Map();
  const sourceGroups = new Map();
  const caseIds = new Set();
  const caseCommitments = [];
  const privateCases = [];
  for (const entry of cases) {
    if (!/^[a-z0-9-]{6,64}$/.test(entry.caseId || '') || caseIds.has(entry.caseId)) {
      throw new Error(`Invalid or duplicate preregistration case id: ${entry.caseId || 'unknown-case'}`);
    }
    caseIds.add(entry.caseId);
    if (!SHA256_RE.test(entry.domainGroupSha256 || '') || !SHA256_RE.test(entry.sourceGroupSha256 || '')) {
      throw new Error(`Invalid preregistration binding: ${entry.caseId || 'unknown-case'}`);
    }
    if (!SPLITS.has(entry.split)) throw new Error(`Invalid preregistration split: ${entry.caseId}`);
    if (!VARIANTS.has(entry.variant)) throw new Error(`Invalid preregistration variant: ${entry.caseId}`);
    if (!SIGNAL_ORIGINS.has(entry.signalOrigin)) throw new Error(`Invalid signal origin: ${entry.caseId}`);
    const domain = byDomain.get(entry.domainGroupSha256) || {
      split: entry.split,
      repairable: 0,
      negative: 0,
      caseIds: [],
    };
    if (domain.split !== entry.split) throw new Error(`Domain crosses classroom splits: ${entry.caseId}`);
    domain[entry.variant === 'negative' ? 'negative' : 'repairable'] += 1;
    domain.caseIds.push(entry.caseId);
    byDomain.set(entry.domainGroupSha256, domain);
    const priorSplit = sourceGroups.get(entry.sourceGroupSha256);
    if (priorSplit && priorSplit !== entry.split)
      throw new Error(`Source group crosses classroom splits: ${entry.caseId}`);
    sourceGroups.set(entry.sourceGroupSha256, entry.split);
    const commitmentNonce = commitmentNonces[entry.caseId] || randomBytes(32).toString('hex');
    if (!SHA256_RE.test(commitmentNonce)) throw new Error(`Invalid commitment nonce: ${entry.caseId}`);
    caseCommitments.push({
      caseId: entry.caseId,
      split: entry.split,
      domainGroupSha256: entry.domainGroupSha256,
      sourceGroupSha256: entry.sourceGroupSha256,
      variant: entry.variant,
      publicPayloadSha256: scionLessonKernelSha256({
        domain: 'scion-classroom-public-case-v1',
        commitmentNonce,
        payload: publicCaseCommitmentPayload(entry),
      }),
      privateKeySha256: scionLessonKernelSha256({
        domain: 'scion-classroom-private-key-v1',
        commitmentNonce,
        payload: privateCaseCommitmentPayload(entry),
      }),
    });
    privateCases.push({ ...structuredClone(entry), commitmentNonce });
  }
  const domains = [...byDomain.entries()].map(([domainGroupSha256, value]) => ({ domainGroupSha256, ...value }));
  if (domains.length !== 6) throw new Error('The preregistered pilot requires exactly six opaque domains');
  if (
    domains.filter((entry) => entry.split === 'practice').length !== 2 ||
    domains.filter((entry) => entry.split === 'sealed-transfer').length !== 4
  ) {
    throw new Error('The preregistered pilot requires two practice and four sealed-transfer domains');
  }
  if (domains.some((entry) => entry.caseIds.length !== 12 || entry.repairable !== 8 || entry.negative !== 4)) {
    throw new Error('Every domain requires eight repairable and four negative/quarantine cases');
  }
  const privateRegistry = {
    schemaVersion: 1,
    protocol: SCION_CLASSROOM_PRIVATE_REGISTRY_PROTOCOL,
    status: 'private-frozen-registry',
    frozenAt,
    policyCardSha256: policyCard.identity.sha256,
    cases: privateCases.sort((a, b) => a.caseId.localeCompare(b.caseId)),
    claimBoundary: 'Private registry: never expose case nonces, expected decisions, or required evidence to the model.',
  };
  privateRegistry.identity = identityFor(privateRegistry);
  const manifest = {
    schemaVersion: 1,
    protocol: SCION_CLASSROOM_PREREGISTRATION_PROTOCOL,
    status: 'frozen-before-model-run',
    frozenAt,
    policyCardSha256: policyCard.identity.sha256,
    privateRegistrySha256: privateRegistry.identity.sha256,
    design: {
      totalCases: 72,
      practiceDomains: 2,
      sealedTransferDomains: 4,
      casesPerDomain: 12,
      repairablePerDomain: 8,
      negativePerDomain: 4,
      ordering: 'randomized-baseline-and-advised-within-frozen-manifest',
      randomizationSeedSha256: scionLessonKernelSha256({
        protocol: SCION_CLASSROOM_PREREGISTRATION_PROTOCOL,
        frozenAt,
        policyCardSha256: policyCard.identity.sha256,
      }),
    },
    promotionThresholds: {
      minimumAbsoluteGain: 10,
      pairedLowerBound95Exclusive: 0,
      requireNoNegativeDomainEffect: true,
      requiredSealedNegativeQuarantines: 16,
      maximumCriticalRegressions: 0,
      maximumSourceRegressions: 0,
      maximumExportRegressions: 0,
      maximumLeakageRegressions: 0,
      maximumProviderCalls: 216,
    },
    domains,
    caseCommitments: caseCommitments.sort((a, b) => a.caseId.localeCompare(b.caseId)),
    sourceGroupCount: sourceGroups.size,
    claimBoundary:
      'This preregistration freezes evaluation design and gates; it does not claim measured model learning.',
  };
  manifest.identity = identityFor(manifest);
  return { manifest, privateRegistry };
}

function validateSignals(signals = {}) {
  const keys = Object.keys(signals);
  return (
    keys.length > 0 &&
    keys.every((key) => SIGNAL_KEYS.has(key)) &&
    keys.every((key) => typeof signals[key] === 'boolean' || Number.isInteger(signals[key]))
  );
}

export function buildScionClassroomExam({
  policyCard,
  preregistration,
  privateRegistry,
  phase,
  cases = [],
  frozenAt = new Date().toISOString(),
} = {}) {
  if (policyCard?.protocol !== SCION_CLASSROOM_POLICY_PROTOCOL || !identityValid(policyCard)) {
    throw new Error('Invalid Scion classroom policy card');
  }
  if (cases.length < 4) throw new Error('A classroom exam requires at least four precommitted cases');
  if (!PHASES.has(phase)) throw new Error('A classroom exam requires a valid frozen phase');
  if (
    preregistration?.protocol !== SCION_CLASSROOM_PREREGISTRATION_PROTOCOL ||
    !identityValid(preregistration) ||
    preregistration.policyCardSha256 !== policyCard.identity.sha256
  ) {
    throw new Error('A classroom exam requires a valid matching preregistration');
  }
  if (
    privateRegistry?.protocol !== SCION_CLASSROOM_PRIVATE_REGISTRY_PROTOCOL ||
    !identityValid(privateRegistry) ||
    privateRegistry.identity.sha256 !== preregistration.privateRegistrySha256 ||
    privateRegistry.policyCardSha256 !== policyCard.identity.sha256
  ) {
    throw new Error('A classroom exam requires the matching private registry');
  }
  const allowedPolicyActions = new Set(policyCard.policy?.selectedActions || []);
  const suppliedSplits = unique(cases.map((entry) => entry.split));
  if (suppliedSplits.length !== 1) throw new Error('Each classroom packet must contain exactly one frozen split');
  const split = suppliedSplits[0];
  if (
    (split === 'practice' && !['baseline', 'advised'].includes(phase)) ||
    (split === 'sealed-transfer' && phase !== 'delayed')
  ) {
    throw new Error(`Invalid ${phase} phase for the ${split} split`);
  }
  const committedForSplit = (preregistration.caseCommitments || []).filter((entry) => entry.split === split);
  if (committedForSplit.length !== cases.length)
    throw new Error(`Classroom packet does not contain the complete ${split} split`);
  const commitmentByCase = new Map(committedForSplit.map((entry) => [entry.caseId, entry]));
  const privateByCase = new Map((privateRegistry.cases || []).map((entry) => [entry.caseId, entry]));
  const seen = new Set();
  const packetCases = [];
  const keyCases = [];
  for (const entry of cases) {
    if (!/^[a-z0-9-]{6,64}$/.test(entry.caseId || '') || seen.has(entry.caseId))
      throw new Error('Invalid or duplicate classroom case id');
    seen.add(entry.caseId);
    if (!SHA256_RE.test(entry.domainGroupSha256 || '')) throw new Error(`Invalid domain binding: ${entry.caseId}`);
    if (!SHA256_RE.test(entry.sourceGroupSha256 || '')) throw new Error(`Invalid source binding: ${entry.caseId}`);
    if (!SPLITS.has(entry.split)) throw new Error(`Invalid classroom split: ${entry.caseId}`);
    if (!SIGNAL_ORIGINS.has(entry.signalOrigin)) throw new Error(`Invalid classroom signal origin: ${entry.caseId}`);
    const commitment = commitmentByCase.get(entry.caseId);
    const privateEntry = privateByCase.get(entry.caseId);
    if (
      !commitment ||
      !privateEntry ||
      scionLessonKernelSha256(entry) !==
        scionLessonKernelSha256(
          Object.fromEntries(Object.entries(privateEntry).filter(([key]) => key !== 'commitmentNonce')),
        ) ||
      commitment.publicPayloadSha256 !==
        scionLessonKernelSha256({
          domain: 'scion-classroom-public-case-v1',
          commitmentNonce: privateEntry.commitmentNonce,
          payload: publicCaseCommitmentPayload(entry),
        }) ||
      commitment.privateKeySha256 !==
        scionLessonKernelSha256({
          domain: 'scion-classroom-private-key-v1',
          commitmentNonce: privateEntry.commitmentNonce,
          payload: privateCaseCommitmentPayload(entry),
        })
    ) {
      throw new Error(`Classroom case does not match preregistration: ${entry.caseId}`);
    }
    if (!VARIANTS.has(entry.variant)) throw new Error(`Invalid classroom variant: ${entry.caseId}`);
    if (!Array.isArray(entry.issueCodes) || entry.issueCodes.length === 0)
      throw new Error(`Missing issue codes: ${entry.caseId}`);
    if (!validateSignals(entry.signals)) throw new Error(`Invalid classroom signals: ${entry.caseId}`);
    const allowedActions = unique(entry.allowedActions || []);
    if (allowedActions.length < 2 || allowedActions.some((action) => !allowedPolicyActions.has(action))) {
      throw new Error(`Unbounded classroom actions: ${entry.caseId}`);
    }
    if (entry.expectedDecision !== 'quarantine' && !allowedActions.includes(entry.expectedDecision)) {
      throw new Error(`Answer key is outside the bounded actions: ${entry.caseId}`);
    }
    const requiredEvidence = unique(entry.requiredEvidence || []);
    if (requiredEvidence.length === 0 || requiredEvidence.some((key) => !Object.hasOwn(entry.signals, key))) {
      throw new Error(`Invalid required evidence: ${entry.caseId}`);
    }
    packetCases.push({
      caseId: entry.caseId,
      domainGroupSha256: entry.domainGroupSha256,
      sourceGroupSha256: entry.sourceGroupSha256,
      split: entry.split,
      variant: entry.variant,
      issueCodes: unique(entry.issueCodes),
      allowedActions,
      signals: structuredClone(entry.signals),
      signalOrigin: entry.signalOrigin,
      prompt: 'Choose one allowed action or quarantine. Cite only the observable signal names used.',
    });
    keyCases.push({ caseId: entry.caseId, expectedDecision: entry.expectedDecision, requiredEvidence });
  }
  packetCases.sort((a, b) => {
    const aOrder = scionLessonKernelSha256({
      seed: preregistration.design.randomizationSeedSha256,
      phase,
      caseId: a.caseId,
    });
    const bOrder = scionLessonKernelSha256({
      seed: preregistration.design.randomizationSeedSha256,
      phase,
      caseId: b.caseId,
    });
    return aOrder.localeCompare(bOrder) || a.caseId.localeCompare(b.caseId);
  });
  const keyByCase = new Map(keyCases.map((entry) => [entry.caseId, entry]));
  const orderedKeyCases = packetCases.map((entry) => keyByCase.get(entry.caseId));
  const packet = {
    schemaVersion: 1,
    protocol: SCION_CLASSROOM_EXAM_PROTOCOL,
    status: 'frozen-blind-packet',
    phase,
    frozenAt,
    policyCardSha256: policyCard.identity.sha256,
    preregistrationSha256: preregistration.identity.sha256,
    cases: packetCases,
    forbiddenContext: [
      'course identity',
      'raw source claims',
      'answers or labels',
      'provider routes or evaluation scores',
    ],
  };
  packet.identity = identityFor(packet);
  const answerKey = {
    schemaVersion: 1,
    protocol: `${SCION_CLASSROOM_EXAM_PROTOCOL}-private-key`,
    packetSha256: packet.identity.sha256,
    cases: orderedKeyCases,
  };
  answerKey.identity = identityFor(answerKey);
  return { packet, answerKey };
}

export function scoreScionClassroomAttempt({ packet, answerKey, attempt } = {}) {
  const issues = [];
  if (packet?.protocol !== SCION_CLASSROOM_EXAM_PROTOCOL || !identityValid(packet)) issues.push('invalid-packet');
  if (answerKey?.packetSha256 !== packet?.identity?.sha256 || !identityValid(answerKey))
    issues.push('invalid-answer-key');
  if (attempt?.protocol !== SCION_CLASSROOM_ATTEMPT_PROTOCOL || !identityValid(attempt)) issues.push('invalid-attempt');
  if (attempt?.packetSha256 !== packet?.identity?.sha256) issues.push('attempt-packet-mismatch');
  if (!['none', 'diagnostic-card'].includes(attempt?.policyAccess)) issues.push('invalid-policy-access');
  if (attempt?.actor === 'scion-model') {
    if (!SHA256_RE.test(attempt.modelRef || '')) issues.push('invalid-model-ref');
    if (!SHA256_RE.test(attempt.sessionRef || '')) issues.push('invalid-session-ref');
    if (
      !Array.isArray(attempt.responseReceipts) ||
      attempt.responseReceipts.length !== attempt.providerCalls ||
      attempt.responseReceipts.some(
        (receipt) =>
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            receipt?.serverRequestReceipt || '',
          ) || !SHA256_RE.test(receipt?.rawResponseSha256 || ''),
      )
    ) {
      issues.push('invalid-server-response-receipts');
    }
  }
  if (!Number.isInteger(attempt?.providerCalls) || attempt.providerCalls < 0)
    issues.push('invalid-provider-call-count');
  if (
    (attempt?.policyAccess === 'diagnostic-card' && attempt?.policyCardSha256 !== packet?.policyCardSha256) ||
    (attempt?.policyAccess === 'none' && attempt?.policyCardSha256 !== null)
  ) {
    issues.push('attempt-policy-card-mismatch');
  }
  const leaked = leakagePaths(attempt?.answers || {});
  if (leaked.length) issues.push(...leaked.map((path) => `leakage:${path}`));
  const answers = new Map((attempt?.answers || []).map((entry) => [entry.caseId, entry]));
  if (answers.size !== packet?.cases?.length) issues.push('incomplete-or-duplicate-answers');
  const keyByCase = new Map((answerKey?.cases || []).map((entry) => [entry.caseId, entry]));
  const rows = (packet?.cases || []).map((examCase) => {
    const answer = answers.get(examCase.caseId);
    const key = keyByCase.get(examCase.caseId);
    const decisionCorrect = Boolean(answer && key && answer.decision === key.expectedDecision);
    const evidenceUsed = unique(answer?.evidenceUsed || []);
    const evidenceCorrect = Boolean(
      answer &&
      key &&
      evidenceUsed.length > 0 &&
      evidenceUsed.every((name) => Object.hasOwn(examCase.signals, name)) &&
      key.requiredEvidence.every((name) => evidenceUsed.includes(name)),
    );
    return {
      caseId: examCase.caseId,
      domainGroupSha256: examCase.domainGroupSha256,
      sourceGroupSha256: examCase.sourceGroupSha256,
      split: examCase.split,
      signalOrigin: examCase.signalOrigin,
      variant: examCase.variant,
      decisionCorrect,
      evidenceCorrect,
      score: (decisionCorrect ? 70 : 0) + (evidenceCorrect ? 30 : 0),
    };
  });
  const total = rows.length || 1;
  const score = Math.round(rows.reduce((sum, row) => sum + row.score, 0) / total);
  const variantScores = Object.fromEntries(
    [...VARIANTS].map((variant) => {
      const selected = rows.filter((row) => row.variant === variant);
      return [
        variant,
        selected.length ? Math.round(selected.reduce((sum, row) => sum + row.score, 0) / selected.length) : null,
      ];
    }),
  );
  const result = {
    schemaVersion: 1,
    protocol: SCION_CLASSROOM_RESULT_PROTOCOL,
    status: issues.length ? 'invalid' : 'scored-diagnostic',
    packetSha256: packet?.identity?.sha256,
    preregistrationSha256: packet?.preregistrationSha256,
    policyCardSha256: packet?.policyCardSha256,
    attemptSha256: attempt?.identity?.sha256,
    actor: clean(attempt?.actor),
    policyAccess: attempt?.policyAccess,
    modelRef: attempt?.modelRef || null,
    sessionRef: attempt?.sessionRef || null,
    providerCalls: attempt?.providerCalls ?? null,
    responseRepairs: structuredClone(attempt?.responseRepairs || []),
    responseReceipts: structuredClone(attempt?.responseReceipts || []),
    score,
    variantScores,
    domainCount: new Set(rows.map((row) => row.domainGroupSha256)).size,
    caseIds: rows.map((row) => row.caseId),
    issues,
    rows,
    productionEligible: false,
    trainingEligible: false,
    claimBoundary: 'This score measures a frozen classroom attempt, not classroom outcomes or model-weight learning.',
  };
  result.identity = identityFor(result);
  return result;
}

function pairedClassroomEvidence(baseline = {}, immediate = {}) {
  const immediateByCase = new Map((immediate.rows || []).map((row) => [row.caseId, row]));
  const pairs = (baseline.rows || [])
    .map((row) => {
      const advised = immediateByCase.get(row.caseId);
      return advised
        ? {
            caseId: row.caseId,
            domainGroupSha256: row.domainGroupSha256,
            delta: advised.score - row.score,
          }
        : null;
    })
    .filter(Boolean);
  const meanDelta = pairs.length ? pairs.reduce((sum, pair) => sum + pair.delta, 0) / pairs.length : null;
  const variance =
    pairs.length > 1 ? pairs.reduce((sum, pair) => sum + (pair.delta - meanDelta) ** 2, 0) / (pairs.length - 1) : null;
  const lowerBound95 = variance === null ? null : meanDelta - 1.96 * Math.sqrt(variance / pairs.length);
  const domainDeltas = [...new Set(pairs.map((pair) => pair.domainGroupSha256))].map((domainGroupSha256) => {
    const selected = pairs.filter((pair) => pair.domainGroupSha256 === domainGroupSha256);
    return {
      domainGroupSha256,
      meanDelta: selected.reduce((sum, pair) => sum + pair.delta, 0) / selected.length,
    };
  });
  return { pairCount: pairs.length, meanDelta, lowerBound95, domainDeltas };
}

function classroomEvidenceBundleSha256({ baseline, immediate, delayed } = {}) {
  return scionLessonKernelSha256({
    baselineSha256: baseline?.identity?.sha256,
    immediateSha256: immediate?.identity?.sha256,
    delayedSha256: delayed?.identity?.sha256,
  });
}

export function buildScionClassroomReviewReceipt({
  verifierRef,
  baseline,
  immediate,
  delayed,
  blinded,
  pairedOrder,
} = {}) {
  if (!SHA256_RE.test(verifierRef || '')) throw new Error('A reviewer receipt requires an opaque verifier reference');
  const receipt = {
    schemaVersion: 1,
    protocol: SCION_CLASSROOM_REVIEW_PROTOCOL,
    verifierRef,
    blinded: blinded === true,
    pairedOrder: pairedOrder === true,
    evidenceBundleSha256: classroomEvidenceBundleSha256({ baseline, immediate, delayed }),
    claimBoundary:
      'This receipt attests review procedure only; outcome statistics are derived from frozen result rows.',
  };
  receipt.identity = identityFor(receipt);
  return receipt;
}

export function assessScionClassroomPromotion({
  preregistration,
  baseline,
  immediate,
  delayed,
  artifacts = {},
  reviewReceipts = [],
  sessionAttestations = [],
  regression = {},
} = {}) {
  const issues = [];
  const thresholds = preregistration?.promotionThresholds || {};
  const paired = pairedClassroomEvidence(baseline, immediate);
  if (preregistration?.protocol !== SCION_CLASSROOM_PREREGISTRATION_PROTOCOL || !identityValid(preregistration)) {
    issues.push('invalid-preregistration');
  }
  const results = [baseline, immediate, delayed];
  const phaseArtifacts = [artifacts.baseline, artifacts.immediate, artifacts.delayed];
  const recomputed = phaseArtifacts.map((entry) =>
    entry?.packet && entry?.answerKey && entry?.attempt
      ? scoreScionClassroomAttempt({ packet: entry.packet, answerKey: entry.answerKey, attempt: entry.attempt })
      : null,
  );
  if (
    recomputed.some((result) => !result) ||
    recomputed.some((result, index) => result.identity.sha256 !== results[index]?.identity?.sha256)
  ) {
    issues.push('unbound-or-substituted-run-artifact');
  }
  const expectedPractice = new Set(
    (preregistration?.caseCommitments || []).filter((entry) => entry.split === 'practice').map((entry) => entry.caseId),
  );
  const expectedSealed = new Set(
    (preregistration?.caseCommitments || [])
      .filter((entry) => entry.split === 'sealed-transfer')
      .map((entry) => entry.caseId),
  );
  const exactSet = (values, expected) =>
    values?.length === expected.size && values.every((value) => expected.has(value));
  if (
    !exactSet(baseline?.caseIds, expectedPractice) ||
    !exactSet(immediate?.caseIds, expectedPractice) ||
    !exactSet(delayed?.caseIds, expectedSealed)
  ) {
    issues.push('result-case-set-does-not-match-preregistration');
  }
  if (results.some((result) => result?.protocol !== SCION_CLASSROOM_RESULT_PROTOCOL || !identityValid(result)))
    issues.push('invalid-result');
  if (results.some((result) => result?.status !== 'scored-diagnostic')) issues.push('unscored-result');
  if (results.some((result) => result?.actor !== 'scion-model')) issues.push('non-model-fixture-or-actor');
  if (unique(results.map((result) => result?.modelRef)).length !== 1 || !SHA256_RE.test(baseline?.modelRef || '')) {
    issues.push('model-identity-mismatch');
  }
  if (
    unique(results.map((result) => result?.sessionRef)).length !== 3 ||
    results.some((result) => !SHA256_RE.test(result?.sessionRef || ''))
  ) {
    issues.push('sessions-not-independent');
  }
  const resultSessionRefs = new Set(results.map((result) => result?.sessionRef));
  const validSessionAttestations = sessionAttestations.filter(
    (receipt) =>
      receipt?.protocol === 'scion-classroom-runtime-session-attestation-v1' &&
      identityValid(receipt) &&
      resultSessionRefs.has(receipt.sessionRef) &&
      SHA256_RE.test(receipt.runtimeRef || '') &&
      SHA256_RE.test(receipt.attestationAuthorityRef || ''),
  );
  if (
    validSessionAttestations.length !== 3 ||
    unique(validSessionAttestations.map((receipt) => receipt.sessionRef)).length !== 3 ||
    unique(validSessionAttestations.map((receipt) => receipt.runtimeRef)).length !== 3
  ) {
    issues.push('sessions-not-independently-attested');
  }
  if (
    baseline?.policyAccess !== 'none' ||
    immediate?.policyAccess !== 'diagnostic-card' ||
    delayed?.policyAccess !== 'diagnostic-card'
  ) {
    issues.push('invalid-learning-sequence');
  }
  if (results.some((result) => result?.preregistrationSha256 !== preregistration?.identity?.sha256)) {
    issues.push('result-preregistration-mismatch');
  }
  if (results.some((result) => result?.policyCardSha256 !== preregistration?.policyCardSha256)) {
    issues.push('result-policy-card-mismatch');
  }
  const baselineCases = new Set(baseline?.caseIds || []);
  const immediateCases = new Set(immediate?.caseIds || []);
  if (baselineCases.size !== immediateCases.size || [...baselineCases].some((caseId) => !immediateCases.has(caseId))) {
    issues.push('baseline-immediate-not-paired');
  }
  if ((delayed?.caseIds || []).some((caseId) => baselineCases.has(caseId))) issues.push('delayed-holdout-overlap');
  if ((immediate?.score || 0) - (baseline?.score || 0) < (thresholds.minimumAbsoluteGain ?? Number.POSITIVE_INFINITY)) {
    issues.push('immediate-gain-below-preregistered-threshold');
  }
  if (!(paired.lowerBound95 > (thresholds.pairedLowerBound95Exclusive ?? Number.POSITIVE_INFINITY))) {
    issues.push('paired-confidence-bound-not-positive');
  }
  if (paired.domainDeltas.length !== 2 || paired.domainDeltas.some((entry) => entry.meanDelta < 0)) {
    issues.push('negative-domain-effect-not-cleared');
  }
  if ((immediate?.score || 0) < 80) issues.push('immediate-score-below-80');
  if ((delayed?.score || 0) < 75) issues.push('delayed-score-below-75');
  if ((immediate?.variantScores?.boundary ?? 0) < 100 || (immediate?.variantScores?.negative ?? 0) < 100)
    issues.push('unsafe-immediate-quarantine');
  const sealedNegativeRows = (delayed?.rows || []).filter(
    (row) => row.split === 'sealed-transfer' && row.variant === 'negative',
  );
  if (
    sealedNegativeRows.length !== thresholds.requiredSealedNegativeQuarantines ||
    sealedNegativeRows.some((row) => !row.decisionCorrect || !row.evidenceCorrect)
  ) {
    issues.push('unsafe-sealed-negative-quarantine');
  }
  if ((baseline?.domainCount || 0) !== 2 || (immediate?.domainCount || 0) !== 2 || (delayed?.domainCount || 0) !== 4) {
    issues.push('preregistered-domain-shape-mismatch');
  }
  if ([...(immediate?.rows || []), ...(delayed?.rows || [])].some((row) => row.signalOrigin !== 'verifier-derived')) {
    issues.push('fixture-signal-provenance');
  }
  const regressionKeys = Object.keys(regression).sort().join(',');
  if (regressionKeys !== 'critical,export,leakage,source') issues.push('invalid-regression-ledger');
  if (
    !Object.values(regression).every((value) => Number.isInteger(value) && value >= 0) ||
    regression.critical > (thresholds.maximumCriticalRegressions ?? -1) ||
    regression.source > (thresholds.maximumSourceRegressions ?? -1) ||
    regression.export > (thresholds.maximumExportRegressions ?? -1) ||
    regression.leakage > (thresholds.maximumLeakageRegressions ?? -1)
  ) {
    issues.push('nonzero-regression');
  }
  const providerCalls = results.reduce(
    (sum, result) => sum + (Number.isInteger(result?.providerCalls) ? result.providerCalls : Number.NaN),
    0,
  );
  if (
    !Number.isInteger(providerCalls) ||
    providerCalls < 0 ||
    providerCalls > (thresholds.maximumProviderCalls ?? -1)
  ) {
    issues.push('provider-call-ceiling');
  }
  const evidenceBundleSha256 = classroomEvidenceBundleSha256({ baseline, immediate, delayed });
  const validReceipts = reviewReceipts.filter(
    (receipt) =>
      receipt?.protocol === SCION_CLASSROOM_REVIEW_PROTOCOL &&
      identityValid(receipt) &&
      SHA256_RE.test(receipt.verifierRef || '') &&
      receipt.blinded === true &&
      receipt.pairedOrder === true &&
      receipt.evidenceBundleSha256 === evidenceBundleSha256,
  );
  if (validReceipts.length < 2 || unique(validReceipts.map((receipt) => receipt.verifierRef)).length < 2) {
    issues.push('missing-independent-review');
  }
  const assessment = {
    schemaVersion: 1,
    protocol: SCION_CLASSROOM_PROMOTION_PROTOCOL,
    status: issues.length ? 'blocked' : 'promotion-candidate',
    policyEligible: issues.length === 0,
    productionEligible: false,
    trainingEligible: false,
    issues: unique(issues),
    observed: {
      baselineScore: baseline?.score ?? null,
      immediateScore: immediate?.score ?? null,
      delayedScore: delayed?.score ?? null,
      immediateGain: Number.isFinite(immediate?.score - baseline?.score) ? immediate.score - baseline.score : null,
      pairedCaseCount: paired.pairCount,
      pairedMeanDelta: Number.isFinite(paired.meanDelta) ? paired.meanDelta : null,
      pairedLowerBound95: Number.isFinite(paired.lowerBound95) ? paired.lowerBound95 : null,
      domainDeltas: paired.domainDeltas,
      providerCalls: Number.isInteger(providerCalls) ? providerCalls : null,
    },
    claimBoundary:
      'Passing creates a policy-promotion candidate only. Separate source-bound corpus admission is required for any adapter-training row.',
  };
  assessment.identity = identityFor(assessment);
  return assessment;
}

export function buildScionClassroomAttempt({
  packet,
  actor,
  policyAccess,
  modelRef = null,
  sessionRef = null,
  providerCalls = 0,
  responseRepairs = [],
  responseReceipts = [],
  answers,
  generatedAt = new Date().toISOString(),
} = {}) {
  const attempt = {
    schemaVersion: 1,
    protocol: SCION_CLASSROOM_ATTEMPT_PROTOCOL,
    generatedAt,
    packetSha256: packet?.identity?.sha256,
    policyCardSha256: policyAccess === 'diagnostic-card' ? packet?.policyCardSha256 : null,
    actor,
    policyAccess,
    modelRef,
    sessionRef,
    providerCalls,
    responseRepairs: structuredClone(responseRepairs),
    responseReceipts: structuredClone(responseReceipts),
    answers: structuredClone(answers || []),
  };
  attempt.identity = identityFor(attempt);
  return attempt;
}
