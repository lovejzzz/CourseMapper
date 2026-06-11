/**
 * courseGraph/index.js — the v0.13 Course Graph IR public surface.
 * See docs/V0.13_COURSE_GRAPH_IR_ROADMAP.md.
 */
export {
  COURSE_GRAPH_VERSION,
  createEmptyCourseGraph,
  createIdFactory,
  validateCourseGraph,
  courseGraphStats,
} from './schema.js';
export { classifyAssessmentKind, deriveCourseGraphFromCourseMap } from './deriveFromCourseMap.js';
export { renderCourseMapFromGraph } from './renderCourseMap.js';
export { attachEnrichmentToGraph, buildBlueprintFromGraph, enrichmentFromGraph } from './blueprintFromGraph.js';
export { lintCourseGraphAlignment } from './alignmentLint.js';
