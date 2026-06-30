import { buildSourceBackedJudgmentStageEvent } from './apiCallBudget';
import { isTrustedConceptLinkedSourceLedgerRow } from './knowledge/sourceLedger';

function sourceProofLessonCount({ courseGraph = null, courseMap = null, totalLessons = 0 } = {}) {
  const explicit = Number(totalLessons) || 0;
  if (explicit > 0) return explicit;
  const courseIRLessons = courseGraph?.courseIR?.lessonIds;
  if (Array.isArray(courseIRLessons) && courseIRLessons.length > 0) return courseIRLessons.length;
  const sessions = courseGraph?.sessions;
  if (Array.isArray(sessions) && sessions.length > 0) return sessions.length;
  const lessons = courseMap?.lessons;
  if (Array.isArray(lessons) && lessons.length > 0) return lessons.length;
  return 0;
}

function sourceProofResourceCount({ sourceLedgerSummary = null, sourceLedger = null, sourceRefCoverage = null } = {}) {
  const trustedConceptLinked = Number(sourceLedgerSummary?.trustedConceptLinkedCount) || 0;
  if (trustedConceptLinked > 0) return trustedConceptLinked;
  const sourceCount = Number(sourceLedgerSummary?.sourceCount) || 0;
  const trustedCount = Number(sourceLedgerSummary?.trustedCount) || 0;
  const conceptLinkedCount = Number(sourceLedgerSummary?.conceptLinkedCount) || 0;
  if (sourceCount > 0 && trustedCount > 0 && conceptLinkedCount > 0) {
    return Math.min(sourceCount, trustedCount, conceptLinkedCount);
  }
  const rows = Array.isArray(sourceLedger) ? sourceLedger : [];
  const trustedRows = rows.filter(isTrustedConceptLinkedSourceLedgerRow).length;
  if (trustedRows > 0) return trustedRows;
  const bridgeTrustedRows = Number(sourceRefCoverage?.bridge?.trustedRows) || 0;
  const bridgeConceptLinkedRows = Number(sourceRefCoverage?.bridge?.conceptLinkedRows) || 0;
  return Math.min(bridgeTrustedRows || bridgeConceptLinkedRows, bridgeConceptLinkedRows || bridgeTrustedRows);
}

function shouldReplaceJudgment(judgment = '') {
  const text = String(judgment || '').trim();
  return !text || /\bnot evaluated\b/i.test(text);
}

export function buildSourceBackedJudgmentFromProof({
  sourceRefCoverage = null,
  sourceLedgerSummary = null,
  sourceLedger = null,
  courseGraph = null,
  courseMap = null,
  totalLessons = 0,
  lessonsWithResources = 0,
  genomeLinkedLessons = 0,
} = {}) {
  const lessonCount = sourceProofLessonCount({ courseGraph, courseMap, totalLessons });
  const resourceCount = sourceProofResourceCount({ sourceLedgerSummary, sourceLedger, sourceRefCoverage });
  return buildSourceBackedJudgmentStageEvent({
    sourceRefCoverage,
    citedResourceCount: resourceCount,
    lessonsWithResources: Number(lessonsWithResources) || lessonCount,
    totalLessons: lessonCount,
    genomeLinkedLessons,
  });
}

export function normalizePipelineStateWithSourceBackedJudgment(
  pipelineState = null,
  {
    sourceRefCoverage = null,
    sourceLedgerSummary = null,
    sourceLedger = null,
    courseGraph = null,
    courseMap = null,
    totalLessons = 0,
    lessonsWithResources = 0,
    genomeLinkedLessons = 0,
  } = {},
) {
  const current = pipelineState && typeof pipelineState === 'object' ? pipelineState : {};
  if (!shouldReplaceJudgment(current.judgment)) return pipelineState;
  const sourceBacked = buildSourceBackedJudgmentFromProof({
    sourceRefCoverage,
    sourceLedgerSummary,
    sourceLedger,
    courseGraph,
    courseMap,
    totalLessons,
    lessonsWithResources,
    genomeLinkedLessons,
  });
  if (!sourceBacked) return pipelineState;
  return {
    ...current,
    judgment: sourceBacked.detail,
  };
}
