import { formatEnrichmentOutcomeLabel } from './apiCallBudget';

const EVIDENCE_REPLAY_COVERAGE_PROTOCOL = 'coursemapper-evidence-authority-coverage-recovery-v1';

/**
 * Evidence replay runs while the canonical CourseGraph is compiled, after the
 * initial model-stage telemetry is recorded. Reconcile only from the explicit
 * hash/authority-backed replay receipt; ordinary payload counts can never turn
 * a genuinely missing lesson green.
 */
export function reconcileEnrichmentOutcomeWithEvidenceReplay(outcome = null, coverage = null) {
  if (!outcome || !coverage || typeof coverage !== 'object') return outcome;
  const replay = coverage.evidenceReplayRecovery;
  if (replay?.protocol !== EVIDENCE_REPLAY_COVERAGE_PROTOCOL) return outcome;
  const requestedLessons = Math.max(0, Number(coverage.requestedLessons) || 0);
  const missingLessons = Array.isArray(coverage.missingLessons)
    ? [
        ...new Set(coverage.missingLessons.map(Number).filter((lesson) => Number.isSafeInteger(lesson) && lesson > 0)),
      ].sort((left, right) => left - right)
    : null;
  if (requestedLessons === 0 || missingLessons === null) return outcome;
  const recoveredLessonNumbers = Array.isArray(replay.recoveredLessonNumbers)
    ? [
        ...new Set(
          replay.recoveredLessonNumbers.map(Number).filter((lesson) => Number.isSafeInteger(lesson) && lesson > 0),
        ),
      ]
    : [];
  if (Number(replay.recoveredLessonCount) !== recoveredLessonNumbers.length) return outcome;
  const expectedStatus = missingLessons.length === 0 ? 'complete' : 'partial';
  if (replay.status !== expectedStatus) return outcome;
  return {
    ...outcome,
    requestedLessons,
    enrichedLessons: Math.max(0, requestedLessons - missingLessons.length),
    missingLessons,
    evidenceReplayRecovery: structuredClone(replay),
  };
}

export function buildEnrichmentDecisionEvent({ blueprintEnrichment = null, compilerRoute = null } = {}) {
  const compilerOwned = compilerRoute?.exactLessonSequence === true;
  const enrichmentOutcome = {
    modelStage: compilerOwned
      ? 'skipped: compiler-owned exact source projection'
      : blueprintEnrichment?.stageDecisions?.modelStage || 'none',
    required: false,
    route: compilerOwned ? 'evidence-compiler' : 'model-enrichment',
    enrichedLessons:
      blueprintEnrichment?.coverage?.enrichedLessons ??
      (blueprintEnrichment?.lessonContent ? Object.keys(blueprintEnrichment.lessonContent).length : 0),
    ...(blueprintEnrichment?.coverage
      ? {
          requestedLessons: blueprintEnrichment.coverage.requestedLessons,
          missingLessons: blueprintEnrichment.coverage.missingLessons,
        }
      : {}),
  };
  const linker = blueprintEnrichment?.stageDecisions?.genomeLinker;
  const detail = compilerOwned
    ? `compiled ${enrichmentOutcome.enrichedLessons} lesson${enrichmentOutcome.enrichedLessons === 1 ? '' : 's'} from exact source ledgers · zero model inference${linker ? ` (linker: ${linker})` : ''}`
    : blueprintEnrichment?.stageDecisions
      ? `${formatEnrichmentOutcomeLabel(enrichmentOutcome)} (linker: ${linker})`
      : 'deterministic compile only (no enrichment object)';
  return {
    outcome: enrichmentOutcome,
    event: {
      type: 'pipelineDecision',
      stage: 'enrichmentModelStage',
      label: compilerOwned ? 'Compiler knowledge composition' : 'Enrichment decision',
      detail,
      outcome: enrichmentOutcome,
    },
  };
}
