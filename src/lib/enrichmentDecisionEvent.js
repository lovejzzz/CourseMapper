import { formatEnrichmentOutcomeLabel } from './apiCallBudget';

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
