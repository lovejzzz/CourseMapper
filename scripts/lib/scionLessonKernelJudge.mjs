import { scionLessonKernelSha256, stableScionLessonKernelJson } from './scionLessonKernelCampaign.mjs';

export const SCION_LESSON_KERNEL_JUDGE_PACKET_PROTOCOL = 'scion-lesson-kernel-blind-packet-v1';
export const SCION_LESSON_KERNEL_JUDGE_REVIEW_PROTOCOL = 'scion-lesson-kernel-blind-review-v1';
export const SCION_LESSON_KERNEL_JUDGE_AGGREGATE_PROTOCOL = 'scion-lesson-kernel-paired-order-result-v1';
export const SCION_LESSON_KERNEL_JUDGE_DIMENSIONS = Object.freeze([
  'sourceFidelity',
  'knowledgePrecision',
  'scenarioReadiness',
  'assessmentCorrectness',
  'choiceDiscriminability',
  'feedbackInstructionality',
  'internalCoherence',
]);

const FORBIDDEN_PACKET_KEYS = new Set([
  'arm',
  'model',
  'provider',
  'route',
  'admission',
  'attempts',
  'repairs',
  'compilerRepairs',
]);

function withoutIdentity(value = {}) {
  const next = structuredClone(value);
  delete next.identity;
  return next;
}

function collectForbiddenKeys(value, location = '$', issues = []) {
  if (!value || typeof value !== 'object') return issues;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectForbiddenKeys(entry, `${location}[${index}]`, issues));
    return issues;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_PACKET_KEYS.has(key)) issues.push(`forbidden-key:${location}.${key}`);
    collectForbiddenKeys(entry, `${location}.${key}`, issues);
  }
  return issues;
}

function reportCalls(report = {}) {
  return new Map((Array.isArray(report?.calls) ? report.calls : []).map((call) => [call.caseId, call]));
}

function packetCase({ entry, localCall, referenceCall, order }) {
  const firstIsLocal = order === 'A/B';
  const labeled = firstIsLocal ? { A: localCall, B: referenceCall } : { A: referenceCall, B: localCall };
  const pairId = `scion-kernel-pair-${scionLessonKernelSha256([
    entry.caseId,
    localCall.artifactSha256,
    referenceCall.artifactSha256,
  ]).slice(0, 24)}`;
  return {
    caseId: entry.caseId,
    pairId,
    domain: entry.domain,
    failureFamilies: entry.failureFamilies,
    lessonInput: entry.lessonInput,
    sourceContext: entry.sourceContext,
    artifacts: Object.fromEntries(
      Object.entries(labeled).map(([label, call]) => [
        label,
        { artifactSha256: call.artifactSha256, lessonKernel: call.artifact },
      ]),
    ),
    decisionSkeleton: {
      caseId: entry.caseId,
      pairId,
      artifactSha256: {
        A: labeled.A.artifactSha256,
        B: labeled.B.artifactSha256,
      },
      scores: Object.fromEntries(
        ['A', 'B'].map((label) => [
          label,
          Object.fromEntries(
            SCION_LESSON_KERNEL_JUDGE_DIMENSIONS.map((dimension) => [dimension, { score: null, evidence: '' }]),
          ),
        ]),
      ),
      criticalDefects: { A: [], B: [] },
      decision: null,
      rationale: '',
    },
  };
}

export function buildScionLessonKernelBlindPacket({
  campaign,
  localReport,
  referenceReport,
  order,
  promptPath,
  promptSha256,
  generatedAt,
} = {}) {
  if (!['A/B', 'B/A'].includes(order)) throw new Error('Lesson-kernel judge order must be A/B or B/A');
  const local = reportCalls(localReport);
  const reference = reportCalls(referenceReport);
  const cases = (campaign?.cases || [])
    .filter((entry) => local.get(entry.caseId)?.artifact && reference.get(entry.caseId)?.artifact)
    .map((entry) =>
      packetCase({
        entry,
        localCall: local.get(entry.caseId),
        referenceCall: reference.get(entry.caseId),
        order,
      }),
    );
  const packet = {
    schemaVersion: 1,
    protocol: SCION_LESSON_KERNEL_JUDGE_PACKET_PROTOCOL,
    order,
    generatedAt,
    campaignIdentity: campaign.identity,
    prompt: { path: promptPath, sha256: promptSha256 },
    dimensions: [...SCION_LESSON_KERNEL_JUDGE_DIMENSIONS],
    cases,
    claimBoundary:
      'This packet contains anonymous source-bound artifacts only. It contains no provider identity, model identity, route, admission outcome, retry history, compiler receipt, preference, or training authorization.',
  };
  packet.identity = {
    algorithm: 'sha256-canonical-json',
    sha256: scionLessonKernelSha256(withoutIdentity(packet)),
  };
  return packet;
}

export function validateScionLessonKernelBlindPacket(packet = {}) {
  const issues = collectForbiddenKeys(packet);
  if (packet.protocol !== SCION_LESSON_KERNEL_JUDGE_PACKET_PROTOCOL) issues.push('protocol');
  if (!['A/B', 'B/A'].includes(packet.order)) issues.push('order');
  if (
    stableScionLessonKernelJson(packet.dimensions) !== stableScionLessonKernelJson(SCION_LESSON_KERNEL_JUDGE_DIMENSIONS)
  ) {
    issues.push('dimensions');
  }
  if (!Array.isArray(packet.cases) || packet.cases.length === 0) issues.push('cases');
  const caseIds = new Set();
  for (const entry of packet.cases || []) {
    if (!entry.caseId || caseIds.has(entry.caseId)) issues.push(`case-id:${entry.caseId || 'missing'}`);
    caseIds.add(entry.caseId);
    for (const label of ['A', 'B']) {
      const artifact = entry.artifacts?.[label];
      if (!artifact?.lessonKernel || artifact.artifactSha256 !== scionLessonKernelSha256(artifact.lessonKernel)) {
        issues.push(`artifact:${entry.caseId}:${label}`);
      }
      if (entry.decisionSkeleton?.artifactSha256?.[label] !== artifact?.artifactSha256) {
        issues.push(`skeleton-artifact:${entry.caseId}:${label}`);
      }
    }
  }
  if (packet.identity?.sha256 !== scionLessonKernelSha256(withoutIdentity(packet))) issues.push('identity');
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

function validateReviewDecision(decision, packetCaseEntry, issues) {
  if (decision?.caseId !== packetCaseEntry.caseId || decision?.pairId !== packetCaseEntry.pairId) {
    issues.push(`decision-case:${packetCaseEntry.caseId}`);
  }
  for (const label of ['A', 'B']) {
    if (decision?.artifactSha256?.[label] !== packetCaseEntry.artifacts[label].artifactSha256) {
      issues.push(`decision-artifact:${packetCaseEntry.caseId}:${label}`);
    }
    for (const dimension of SCION_LESSON_KERNEL_JUDGE_DIMENSIONS) {
      const rating = decision?.scores?.[label]?.[dimension];
      if (!Number.isInteger(rating?.score) || rating.score < 0 || rating.score > 4) {
        issues.push(`score:${packetCaseEntry.caseId}:${label}:${dimension}`);
      }
      if (String(rating?.evidence || '').trim().length < 12) {
        issues.push(`evidence:${packetCaseEntry.caseId}:${label}:${dimension}`);
      }
    }
    if (!Array.isArray(decision?.criticalDefects?.[label])) {
      issues.push(`critical-defects:${packetCaseEntry.caseId}:${label}`);
    }
  }
  if (!['A', 'B', 'tie', 'insufficient-evidence'].includes(decision?.decision)) {
    issues.push(`decision:${packetCaseEntry.caseId}`);
  }
  if (String(decision?.rationale || '').trim().length < 20) issues.push(`rationale:${packetCaseEntry.caseId}`);
}

export function validateScionLessonKernelJudgeReview(review = {}, packet = {}) {
  const issues = [];
  if (review.protocol !== SCION_LESSON_KERNEL_JUDGE_REVIEW_PROTOCOL) issues.push('protocol');
  if (review.order !== packet.order) issues.push('order');
  if (review.packetSha256 !== packet.identity?.sha256) issues.push('packet-sha256');
  if (!String(review.sessionId || '').trim()) issues.push('session-id');
  if (review.attestations?.anonymousArtifactsOnly !== true) issues.push('attestation-anonymous');
  if (review.attestations?.otherOrderUnavailable !== true) issues.push('attestation-other-order');
  if (review.attestations?.organizerMappingUnavailable !== true) issues.push('attestation-mapping');
  const decisions = new Map((review.decisions || []).map((decision) => [decision.caseId, decision]));
  if (decisions.size !== packet.cases?.length) issues.push('decision-count');
  for (const entry of packet.cases || []) {
    const decision = decisions.get(entry.caseId);
    if (!decision) issues.push(`missing-decision:${entry.caseId}`);
    else validateReviewDecision(decision, entry, issues);
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

function chosenArtifact(decision, packetCaseEntry) {
  return ['A', 'B'].includes(decision?.decision)
    ? packetCaseEntry.artifacts[decision.decision].artifactSha256
    : decision?.decision;
}

export function aggregateScionLessonKernelPairedOrders({
  abPacket,
  baPacket,
  abReview,
  baReview,
  localReport,
  referenceReport,
  generatedAt,
} = {}) {
  const abValidation = validateScionLessonKernelJudgeReview(abReview, abPacket);
  const baValidation = validateScionLessonKernelJudgeReview(baReview, baPacket);
  const issues = [
    ...abValidation.issues.map((issue) => `A/B:${issue}`),
    ...baValidation.issues.map((issue) => `B/A:${issue}`),
  ];
  if (abReview?.sessionId && abReview.sessionId === baReview?.sessionId) issues.push('judge-session-reused');
  const judgeIdentity = (review) => ({
    model: review?.judge?.model,
    revision: review?.judge?.revision,
    runtime: review?.judge?.runtime,
  });
  if (stableScionLessonKernelJson(judgeIdentity(abReview)) !== stableScionLessonKernelJson(judgeIdentity(baReview))) {
    issues.push('judge-identity-mismatch');
  }
  const local = reportCalls(localReport);
  const reference = reportCalls(referenceReport);
  const abDecisions = new Map((abReview?.decisions || []).map((decision) => [decision.caseId, decision]));
  const baDecisions = new Map((baReview?.decisions || []).map((decision) => [decision.caseId, decision]));
  const baCases = new Map((baPacket?.cases || []).map((entry) => [entry.caseId, entry]));
  const results = [];
  for (const abCase of abPacket?.cases || []) {
    const baCase = baCases.get(abCase.caseId);
    const abDecision = abDecisions.get(abCase.caseId);
    const baDecision = baDecisions.get(abCase.caseId);
    const abWinner = chosenArtifact(abDecision, abCase);
    const baWinner = chosenArtifact(baDecision, baCase);
    const stable = /^[a-f0-9]{64}$/.test(String(abWinner)) && abWinner === baWinner;
    const localSha = local.get(abCase.caseId)?.artifactSha256;
    const referenceSha = reference.get(abCase.caseId)?.artifactSha256;
    results.push({
      caseId: abCase.caseId,
      pairId: abCase.pairId,
      winners: { 'A/B': abWinner, 'B/A': baWinner },
      stable,
      stableWinner: stable
        ? abWinner === localSha
          ? 'local'
          : abWinner === referenceSha
            ? 'reference'
            : 'unknown'
        : null,
      trainingEligible: stable && [localSha, referenceSha].includes(abWinner),
    });
  }
  const aggregate = {
    schemaVersion: 1,
    protocol: SCION_LESSON_KERNEL_JUDGE_AGGREGATE_PROTOCOL,
    generatedAt,
    status: issues.length > 0 ? 'invalid' : 'paired-orders-complete',
    requiredOrders: ['A/B', 'B/A'],
    sessions: { 'A/B': abReview?.sessionId, 'B/A': baReview?.sessionId },
    judge: judgeIdentity(abReview),
    evidence: {
      packets: { 'A/B': abPacket?.identity?.sha256, 'B/A': baPacket?.identity?.sha256 },
      reviews: {
        'A/B': scionLessonKernelSha256(abReview),
        'B/A': scionLessonKernelSha256(baReview),
      },
    },
    issues,
    results,
    summary: {
      pairs: results.length,
      stablePreferences: results.filter((result) => result.trainingEligible).length,
      localWins: results.filter((result) => result.stableWinner === 'local').length,
      referenceWins: results.filter((result) => result.stableWinner === 'reference').length,
      unstable: results.filter((result) => !result.stable).length,
    },
    claimBoundary:
      'These are same-identity model-judge preferences from isolated A/B and B/A orders. They are not human, instructor, independent, classroom, heldout-adapter, or production-win evidence.',
  };
  aggregate.identity = {
    algorithm: 'sha256-canonical-json',
    sha256: scionLessonKernelSha256(withoutIdentity(aggregate)),
  };
  return aggregate;
}

function unshuffleLessonKernel(call = {}) {
  const artifact = structuredClone(call.artifact);
  for (const repair of call.compilerRepairs || []) {
    if (repair?.pass !== 'deterministicOptionShuffle') continue;
    const item = artifact?.mc?.[repair.item];
    const optionsKey = Array.isArray(item?.op) ? 'op' : Array.isArray(item?.options) ? 'options' : null;
    const answerKey = Number.isInteger(item?.ai) ? 'ai' : Number.isInteger(item?.answerIndex) ? 'answerIndex' : null;
    if (!optionsKey || !answerKey || !Array.isArray(repair.permutation) || repair.permutation.length !== 4) {
      continue;
    }
    const displayed = [...item[optionsKey]];
    const authored = Array(4);
    repair.permutation.forEach((authoredIndex, displayedIndex) => {
      authored[authoredIndex] = displayed[displayedIndex];
    });
    if (authored.some((option) => option === undefined)) continue;
    item[optionsKey] = authored;
    item[answerKey] = repair.answerIndexBefore;
  }
  return artifact;
}

export function buildScionLessonKernelTrainingPreferences({ aggregate, campaign, localReport, referenceReport } = {}) {
  if (aggregate?.status !== 'paired-orders-complete') return [];
  const campaignCases = new Map((campaign?.cases || []).map((entry) => [entry.caseId, entry]));
  const local = reportCalls(localReport);
  const reference = reportCalls(referenceReport);
  return (aggregate.results || [])
    .filter((result) => result.trainingEligible && ['local', 'reference'].includes(result.stableWinner))
    .map((result) => {
      const entry = campaignCases.get(result.caseId);
      const winner = result.stableWinner === 'local' ? local.get(result.caseId) : reference.get(result.caseId);
      const loser = result.stableWinner === 'local' ? reference.get(result.caseId) : local.get(result.caseId);
      if (!entry || !winner?.artifact || !loser?.artifact) return null;
      const chosenArtifact = unshuffleLessonKernel(winner);
      const rejectedArtifact = unshuffleLessonKernel(loser);
      return {
        schemaVersion: 1,
        kind: 'lesson-kernel',
        caseId: entry.caseId,
        pairId: result.pairId,
        prompt: entry.messages?.at(-1)?.content || entry.userPrompt || '',
        systemPrompt: entry.messages?.[0]?.content || '',
        chosen: JSON.stringify({ lessons: [chosenArtifact] }),
        rejected: JSON.stringify({ lessons: [rejectedArtifact] }),
        chosenSha256: scionLessonKernelSha256(chosenArtifact),
        rejectedSha256: scionLessonKernelSha256(rejectedArtifact),
        winnerRole: result.stableWinner,
        domain: entry.domain,
        courseId: entry.courseGroupId,
        courseGroupId: entry.courseGroupId,
        courseGroupSha256: entry.courseGroupSha256,
        lessonId: entry.lessonInput.lessonId,
        sourceContext: entry.sourceContext,
        failureFamilies: entry.failureFamilies,
        trainingEligible: true,
        preferenceEvidence: {
          protocol: SCION_LESSON_KERNEL_JUDGE_AGGREGATE_PROTOCOL,
          aggregateSha256: aggregate.identity.sha256,
          judge: aggregate.judge,
          requiredOrders: ['A/B', 'B/A'],
          sessions: aggregate.sessions,
          packetSha256: aggregate.evidence.packets,
          reviewSha256: aggregate.evidence.reviews,
          winners: result.winners,
          stable: true,
          humanEvidence: false,
          independentEvidence: false,
        },
      };
    })
    .filter(Boolean);
}
