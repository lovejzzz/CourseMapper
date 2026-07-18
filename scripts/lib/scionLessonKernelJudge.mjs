import { scionLessonKernelSha256, stableScionLessonKernelJson } from './scionLessonKernelCampaign.mjs';

export const SCION_LESSON_KERNEL_JUDGE_PACKET_PROTOCOL = 'scion-lesson-kernel-blind-packet-v1';
export const SCION_LESSON_KERNEL_JUDGE_WORKBOOK_PROTOCOL = 'scion-lesson-kernel-blind-workbook-v1';
export const SCION_LESSON_KERNEL_JUDGE_REVIEW_PROTOCOL = 'scion-lesson-kernel-blind-review-v1';
export const SCION_LESSON_KERNEL_JUDGE_AGGREGATE_PROTOCOL = 'scion-lesson-kernel-paired-order-result-v1';
export const SCION_LESSON_KERNEL_TRAINING_EVIDENCE_PROTOCOL = 'scion-lesson-kernel-training-preference-v1';
export const SCION_LESSON_KERNEL_TEACHER_LINEAGE_PROTOCOL =
  'scion-lesson-kernel-teacher-revision-lineage-v1';
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
  caseIds = null,
} = {}) {
  if (!['A/B', 'B/A'].includes(order)) throw new Error('Lesson-kernel judge order must be A/B or B/A');
  const local = reportCalls(localReport);
  const reference = reportCalls(referenceReport);
  const selectedCaseIds = Array.isArray(caseIds) ? new Set(caseIds) : null;
  const cases = (campaign?.cases || [])
    .filter((entry) => !selectedCaseIds || selectedCaseIds.has(entry.caseId))
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

export function buildScionLessonKernelBlindWorkbook({
  campaign,
  localReport,
  referenceReport,
  promptPath,
  promptSha256,
  generatedAt,
  chunkSize = 6,
  sparseComplete = false,
} = {}) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 12) {
    throw new Error('Lesson-kernel judge chunkSize must be an integer from 1 through 12');
  }
  const local = reportCalls(localReport);
  const reference = reportCalls(referenceReport);
  const campaignCaseCount = (campaign?.cases || []).length;
  const caseIds = (campaign?.cases || [])
    .filter((entry) => local.get(entry.caseId)?.artifact && reference.get(entry.caseId)?.artifact)
    .map((entry) => entry.caseId);
  const batches = [];
  for (let offset = 0; offset < caseIds.length; offset += chunkSize) {
    const batchCaseIds = caseIds.slice(offset, offset + chunkSize);
    const index = batches.length + 1;
    const batchId = `batch-${String(index).padStart(3, '0')}-${scionLessonKernelSha256(batchCaseIds).slice(0, 10)}`;
    const common = {
      campaign,
      localReport,
      referenceReport,
      promptPath,
      promptSha256,
      generatedAt,
      caseIds: batchCaseIds,
    };
    const packets = {
      'A/B': buildScionLessonKernelBlindPacket({ ...common, order: 'A/B' }),
      'B/A': buildScionLessonKernelBlindPacket({ ...common, order: 'B/A' }),
    };
    batches.push({
      batchId,
      index,
      caseIds: batchCaseIds,
      sealed: batchCaseIds.length === chunkSize || caseIds.length === campaignCaseCount || sparseComplete,
      packets,
    });
  }
  const manifest = {
    schemaVersion: 1,
    protocol: SCION_LESSON_KERNEL_JUDGE_WORKBOOK_PROTOCOL,
    generatedAt,
    campaignIdentity: campaign?.identity,
    prompt: { path: promptPath, sha256: promptSha256 },
    chunkSize,
    campaignCaseCount,
    caseCount: caseIds.length,
    captureComplete: caseIds.length === campaignCaseCount,
    ...(sparseComplete ? { sparseComplete: true } : {}),
    batches: batches.map((batch) => ({
      batchId: batch.batchId,
      index: batch.index,
      caseIds: batch.caseIds,
      sealed: batch.sealed,
      packetSha256: {
        'A/B': batch.packets['A/B'].identity.sha256,
        'B/A': batch.packets['B/A'].identity.sha256,
      },
    })),
    claimBoundary:
      'Each batch is judged in two isolated sessions with exact reversed artifact order. The workbook contains no organizer mapping, provider identity, model route, preference, or training authorization.',
  };
  manifest.identity = {
    algorithm: 'sha256-canonical-json',
    sha256: scionLessonKernelSha256(withoutIdentity(manifest)),
  };
  return { manifest, batches };
}

export function validateScionLessonKernelBlindWorkbook(workbook = {}) {
  const manifest = workbook?.manifest || {};
  const batches = Array.isArray(workbook?.batches) ? workbook.batches : [];
  const issues = [];
  if (manifest.protocol !== SCION_LESSON_KERNEL_JUDGE_WORKBOOK_PROTOCOL) issues.push('protocol');
  if (!Number.isInteger(manifest.chunkSize) || manifest.chunkSize < 1 || manifest.chunkSize > 12) {
    issues.push('chunk-size');
  }
  if (!Array.isArray(manifest.batches) || manifest.batches.length !== batches.length || batches.length === 0) {
    issues.push('batches');
  }
  const manifestById = new Map((manifest.batches || []).map((entry) => [entry.batchId, entry]));
  const seenCases = new Set();
  for (const batch of batches) {
    const declared = manifestById.get(batch.batchId);
    if (!declared || declared.index !== batch.index) issues.push(`batch:${batch.batchId || 'missing'}`);
    if (declared?.sealed !== batch.sealed) issues.push(`batch-seal:${batch.batchId || 'missing'}`);
    if (!Array.isArray(batch.caseIds) || batch.caseIds.length < 1 || batch.caseIds.length > manifest.chunkSize) {
      issues.push(`batch-size:${batch.batchId || 'missing'}`);
    }
    for (const caseId of batch.caseIds || []) {
      if (seenCases.has(caseId)) issues.push(`duplicate-case:${caseId}`);
      seenCases.add(caseId);
    }
    for (const order of ['A/B', 'B/A']) {
      const packet = batch.packets?.[order];
      const validation = validateScionLessonKernelBlindPacket(packet);
      issues.push(...validation.issues.map((issue) => `${batch.batchId}:${order}:${issue}`));
      if (declared?.packetSha256?.[order] !== packet?.identity?.sha256) {
        issues.push(`packet-sha256:${batch.batchId}:${order}`);
      }
      if (
        stableScionLessonKernelJson(packet?.cases?.map((entry) => entry.caseId)) !==
        stableScionLessonKernelJson(batch.caseIds)
      ) {
        issues.push(`packet-cases:${batch.batchId}:${order}`);
      }
    }
    const abCases = new Map((batch.packets?.['A/B']?.cases || []).map((entry) => [entry.caseId, entry]));
    for (const entry of batch.packets?.['B/A']?.cases || []) {
      const reversed = abCases.get(entry.caseId);
      if (
        !reversed ||
        reversed.artifacts?.A?.artifactSha256 !== entry.artifacts?.B?.artifactSha256 ||
        reversed.artifacts?.B?.artifactSha256 !== entry.artifacts?.A?.artifactSha256
      ) {
        issues.push(`reverse-order:${batch.batchId}:${entry.caseId}`);
      }
    }
  }
  if (manifest.caseCount !== seenCases.size) issues.push('case-count');
  if (!Number.isInteger(manifest.campaignCaseCount) || manifest.campaignCaseCount < manifest.caseCount) {
    issues.push('campaign-case-count');
  }
  if (manifest.captureComplete !== (manifest.caseCount === manifest.campaignCaseCount)) issues.push('capture-complete');
  if (manifest.sparseComplete != null && manifest.sparseComplete !== true) issues.push('sparse-complete');
  for (const batch of batches) {
    const shouldBeSealed =
      batch.caseIds.length === manifest.chunkSize || manifest.captureComplete || manifest.sparseComplete === true;
    if (batch.sealed !== shouldBeSealed) issues.push(`seal-policy:${batch.batchId}`);
  }
  if (manifest.identity?.sha256 !== scionLessonKernelSha256(withoutIdentity(manifest))) issues.push('identity');
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
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

function scoreQualificationForOrder(decision, packetCaseEntry, winnerSha256) {
  const winnerLabel = ['A', 'B'].find((label) => packetCaseEntry?.artifacts?.[label]?.artifactSha256 === winnerSha256);
  if (!winnerLabel) return null;
  const loserLabel = winnerLabel === 'A' ? 'B' : 'A';
  const winnerScores = Object.fromEntries(
    SCION_LESSON_KERNEL_JUDGE_DIMENSIONS.map((dimension) => [
      dimension,
      Number(decision?.scores?.[winnerLabel]?.[dimension]?.score),
    ]),
  );
  const loserScores = Object.fromEntries(
    SCION_LESSON_KERNEL_JUDGE_DIMENSIONS.map((dimension) => [
      dimension,
      Number(decision?.scores?.[loserLabel]?.[dimension]?.score),
    ]),
  );
  const winnerValues = Object.values(winnerScores);
  const loserValues = Object.values(loserScores);
  return {
    winnerLabel,
    winnerScores,
    loserScores,
    winnerMinimumScore: Math.min(...winnerValues),
    totalScoreMargin:
      winnerValues.reduce((sum, score) => sum + score, 0) - loserValues.reduce((sum, score) => sum + score, 0),
    winnerCriticalDefects: Array.isArray(decision?.criticalDefects?.[winnerLabel])
      ? decision.criticalDefects[winnerLabel]
      : [],
    loserCriticalDefects: Array.isArray(decision?.criticalDefects?.[loserLabel])
      ? decision.criticalDefects[loserLabel]
      : [],
    rationale: String(decision?.rationale || ''),
    decisionSha256: scionLessonKernelSha256(decision),
  };
}

function scoreQualification(orders = []) {
  const requiredScores = ['sourceFidelity', 'assessmentCorrectness', 'internalCoherence'];
  const qualified =
    orders.length === 2 &&
    orders.every(
      (order) =>
        order &&
        order.winnerMinimumScore >= 3 &&
        order.totalScoreMargin >= 2 &&
        order.winnerCriticalDefects.length === 0 &&
        requiredScores.every((dimension) => order.winnerScores[dimension] >= 3),
    );
  return {
    qualified,
    winnerMinimumScore: orders.length > 0 ? Math.min(...orders.map((order) => order?.winnerMinimumScore ?? -1)) : -1,
    minimumTotalScoreMargin:
      orders.length > 0
        ? Math.min(...orders.map((order) => order?.totalScoreMargin ?? Number.NEGATIVE_INFINITY))
        : null,
    winnerCriticalDefects: orders.flatMap((order) => order?.winnerCriticalDefects || []),
    orders,
  };
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
    const stableScoreQualification = stable
      ? scoreQualification([
          scoreQualificationForOrder(abDecision, abCase, abWinner),
          scoreQualificationForOrder(baDecision, baCase, baWinner),
        ])
      : scoreQualification([]);
    const stableWinnerRole = stable
      ? abWinner === localSha
        ? 'local'
        : abWinner === referenceSha
          ? 'reference'
          : 'unknown'
      : null;
    const winnerCall = stableWinnerRole === 'local' ? local.get(abCase.caseId) : reference.get(abCase.caseId);
    const compilerAdmitted = Boolean(winnerCall?.artifact && winnerCall?.admission?.needsRetry === false);
    results.push({
      caseId: abCase.caseId,
      pairId: abCase.pairId,
      winners: { 'A/B': abWinner, 'B/A': baWinner },
      stable,
      stableWinner: stableWinnerRole,
      compilerAdmitted,
      scoreQualification: stableScoreQualification,
      trainingEligible:
        stable && [localSha, referenceSha].includes(abWinner) && stableScoreQualification.qualified && compilerAdmitted,
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
      prompt: abPacket?.prompt,
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
      scoreRejected: results.filter((result) => result.stable && !result.scoreQualification.qualified).length,
      compilerRejected: results.filter(
        (result) => result.stable && result.scoreQualification.qualified && !result.compilerAdmitted,
      ).length,
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

function buildTeacherRevisionLineage({ report, call, authoredArtifact } = {}) {
  if (call?.arm !== 'teacher-revision') return null;
  const batch = (report?.batchReports || []).find(
    (entry) => entry.packetSha256 === call?.revisionEvidence?.packetSha256,
  );
  const sourceTeacherReportSha256 = batch?.sourceReportSha256 || report?.identity?.sha256;
  const sourceWorkbookSha256 = batch?.sourceWorkbookSha256 || report?.workbookSha256;
  const mergeReportSha256 =
    batch?.sourceReportSha256 && report?.identity?.sha256 !== batch.sourceReportSha256
      ? report.identity.sha256
      : null;
  const lineage = {
    protocol: SCION_LESSON_KERNEL_TEACHER_LINEAGE_PROTOCOL,
    packetSha256: call?.revisionEvidence?.packetSha256,
    sessionId: call?.revisionEvidence?.sessionId,
    workbookSha256: sourceWorkbookSha256,
    teacherReportSha256: sourceTeacherReportSha256,
    ...(mergeReportSha256 ? { teacherMergeReportSha256: mergeReportSha256 } : {}),
    revisionResultSha256: batch?.resultSha256,
    compiledReportSha256: batch?.reportSha256,
    originalArtifactSha256: call?.originalArtifactSha256,
    authoredArtifactSha256: scionLessonKernelSha256(JSON.stringify(authoredArtifact)),
  };
  return {
    ...lineage,
    lineageSha256: scionLessonKernelSha256(JSON.stringify(lineage)),
  };
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
      const winnerRole = winner.arm || result.stableWinner;
      const rejectedRole = loser.arm || (result.stableWinner === 'local' ? 'reference' : 'local');
      const teacherRevisionLineage = buildTeacherRevisionLineage({
        report: result.stableWinner === 'local' ? localReport : referenceReport,
        call: winner,
        authoredArtifact: chosenArtifact,
      });
      const chosen = JSON.stringify({ lessons: [chosenArtifact] });
      const rejected = JSON.stringify({ lessons: [rejectedArtifact] });
      const row = {
        schemaVersion: 1,
        kind: 'lesson-kernel',
        taskFamily: 'lesson-kernel',
        caseId: entry.caseId,
        pairId: result.pairId,
        prompt: entry.messages?.at(-1)?.content || entry.userPrompt || '',
        admissionPrompt: entry.userPrompt || '',
        systemPrompt: entry.messages?.[0]?.content || '',
        chosen,
        rejected,
        chosenSha256: scionLessonKernelSha256(chosenArtifact),
        rejectedSha256: scionLessonKernelSha256(rejectedArtifact),
        winnerRole,
        rejectedRole,
        domain: entry.domain,
        courseId: entry.courseGroupId,
        courseGroupId: entry.courseGroupId,
        courseGroupSha256: entry.courseGroupSha256,
        lessonId: entry.lessonInput.lessonId,
        sourceContext: entry.sourceContext,
        failureFamilies: entry.failureFamilies,
        trainingEligible: true,
      };
      const servingPrompt = [row.systemPrompt, row.prompt].map((value) => String(value || '').trim()).join('\n\n');
      const trainingPairSha256 = scionLessonKernelSha256(
        JSON.stringify({
          kind: row.kind,
          systemPrompt: row.systemPrompt,
          prompt: row.prompt,
          admissionPrompt: row.admissionPrompt,
          chosen: row.chosen,
          rejected: row.rejected,
          domain: row.domain,
          courseGroupSha256: row.courseGroupSha256,
        }),
      );
      row.preferenceEvidence = {
        kind: 'single-model-judge-preference',
        protocol: SCION_LESSON_KERNEL_TRAINING_EVIDENCE_PROTOCOL,
        benchmarkProtocol: SCION_LESSON_KERNEL_JUDGE_PACKET_PROTOCOL,
        policyId: 'scion-lesson-kernel-judge-policy-v1',
        verified: true,
        preferred: 'chosen',
        primaryPreferenceEvidence: 'single-model-judge',
        scoredBeforePreference: true,
        aggregateSha256: aggregate.identity.sha256,
        judge: {
          ...aggregate.judge,
          sessionIds: Object.values(aggregate.sessions),
          promptPath: aggregate.evidence.prompt?.path,
          promptSha256: aggregate.evidence.prompt?.sha256,
        },
        orders: ['A/B', 'B/A'],
        packetSha256: Object.values(aggregate.evidence.packets),
        reviewSha256: Object.values(aggregate.evidence.reviews),
        winners: result.winners,
        winnerRole,
        rejectedRole,
        ...(teacherRevisionLineage ? { teacherRevisionLineage } : {}),
        stable: true,
        scoreQualification: result.scoreQualification,
        caseDigest: entry.caseSha256,
        courseGroupSha256: entry.courseGroupSha256,
        reviewPacketDigest: scionLessonKernelSha256(aggregate.evidence.packets),
        sourceRowSha256: entry.caseSha256,
        sourceContextSha256: scionLessonKernelSha256(JSON.stringify(entry.sourceContext)),
        systemPromptSha256: scionLessonKernelSha256(row.systemPrompt),
        servingPromptSha256: scionLessonKernelSha256(servingPrompt),
        trainingPairSha256,
        chosenArtifactSha256: scionLessonKernelSha256(chosen),
        rejectedArtifactSha256: scionLessonKernelSha256(rejected),
        humanEvidence: false,
        independentEvidence: false,
        claimBoundary:
          'This is a stable score-qualified single-model judgment across isolated A/B and B/A orders; it is not human, instructor, independent, classroom, heldout-adapter, or production-win evidence.',
      };
      return row;
    })
    .filter(Boolean);
}
