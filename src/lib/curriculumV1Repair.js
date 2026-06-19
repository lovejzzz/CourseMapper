import { buildCourseIRFromCourseMap, courseIRToCourseGraph, validateCourseIR } from './courseIR.js';
import { repairCourseMapReadiness } from './deliverableReadiness.js';
import { attachEnrichmentToGraph } from './courseGraph/blueprintFromGraph.js';
import { validateCourseGraph } from './courseGraph/schema.js';

const BLOCKING_SEVERITY = 'blocker';

function formatIssueSummary(issues = []) {
  return issues
    .filter((issue) => issue?.severity === BLOCKING_SEVERITY || !issue?.severity)
    .slice(0, 3)
    .map((issue) => `${issue.path || issue.code || 'graph'}: ${issue.message || issue.code}`)
    .join('; ');
}

function missingFallbackResult() {
  return {
    ok: false,
    code: 'missing-fallback-map',
    reason: 'CurriculumV1 repair needs an assembled fallback course map.',
  };
}

function asObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function mergeEnrichment(courseIREnrichment, runtimeEnrichment) {
  const base = asObject(courseIREnrichment);
  const runtime = asObject(runtimeEnrichment);
  return {
    ...base,
    ...runtime,
    lessonContent: {
      ...(base.lessonContent || {}),
      ...(runtime.lessonContent || {}),
    },
  };
}

export function repairNativeFallbackWithCurriculumV1({
  fallbackMap,
  columns = [],
  lessonFilter = null,
  enrichment = null,
} = {}) {
  if (!fallbackMap || !Array.isArray(fallbackMap.lessons) || fallbackMap.lessons.length === 0) {
    return missingFallbackResult();
  }

  const readinessRepair = repairCourseMapReadiness({
    courseMap: fallbackMap,
    columns,
    lessonFilter,
  });
  const repairedMap = readinessRepair.courseMap || fallbackMap;
  const courseIR = buildCourseIRFromCourseMap(repairedMap);
  const validation = validateCourseIR(courseIR);
  if (!validation.valid) {
    return {
      ok: false,
      code: 'curriculumv1-invalid',
      reason: `CurriculumV1 validation failed: ${formatIssueSummary(validation.issues)}`,
      validation,
      courseIR: validation.ir,
      courseMap: repairedMap,
      readinessRepair,
    };
  }

  const projection = courseIRToCourseGraph(validation.ir);
  const graphValidation = validateCourseGraph(projection.graph);
  if (!graphValidation.valid) {
    return {
      ok: false,
      code: 'curriculumv1-graph-invalid',
      reason: `CurriculumV1 graph validation failed: ${formatIssueSummary(graphValidation.issues)}`,
      validation,
      graphValidation,
      courseIR: validation.ir,
      courseMap: projection.courseMap,
      graph: projection.graph,
      readinessRepair,
    };
  }

  const graph = attachEnrichmentToGraph(projection.graph, mergeEnrichment(projection.enrichmentOverlay, enrichment));
  graph.nativeRepair = {
    code: 'degenerate-skeleton-repaired',
    source: 'curriculumv1',
    courseIRVersion: validation.ir.version,
    stats: validation.stats,
    readinessRepairedFieldCount: readinessRepair.repairedFields.length,
  };

  return {
    ok: true,
    code: 'curriculumv1-repaired',
    graph,
    courseMap: projection.courseMap,
    courseIR: validation.ir,
    validation,
    graphValidation,
    readinessRepair,
    enrichmentOverlay: projection.enrichmentOverlay,
    summary: `${validation.stats.lessons} lessons, ${validation.stats.assessments} assessments`,
    detail: `${validation.stats.lessons} lessons · ${validation.stats.concepts} concepts · ${validation.stats.assessments} assessments · ${validation.stats.sourceLedgerRows} source rows`,
  };
}
