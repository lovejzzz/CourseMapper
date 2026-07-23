import { deriveCourseGraphFromCourseMap, selectCompilerRegistryBridges } from './courseGraph';

/**
 * Restore canonical Course Map registry entities that a compact native-model
 * skeleton omitted, and emit the same transparent pipeline receipts as the
 * generation hook. Kept behind a dynamic import so this rare recovery path
 * does not grow AppFlow's initial workspace chunk.
 */
export function bridgeCompilerRegistries({ courseGraph, courseMap, runId, trace, recordEvent } = {}) {
  const mapDerivedGraph = deriveCourseGraphFromCourseMap(courseMap);
  const bridges = selectCompilerRegistryBridges(courseGraph, mapDerivedGraph);
  const stats = bridges.stats;

  if (bridges.assessmentRegistry) {
    trace?.(runId, 'compiler_assessment_registry_bridge', {
      source: 'course-map-derived-registry',
      nativeAssessmentCount: stats.graphAssessmentCount,
      courseMapAssessmentCount: stats.mapAssessmentCount,
      missingAssessmentCount: stats.missingAssessmentCount,
    });
    recordEvent?.({
      type: 'pipelineDecision',
      stage: 'blueprintCompiler',
      label: 'Assessment registry bridge',
      detail: `Compiler using ${stats.mapAssessmentCount} complete Course Map assessment row(s) because ${stats.missingAssessmentCount} canonical assessment identit${stats.missingAssessmentCount === 1 ? 'y was' : 'ies were'} missing or clipped in native assembly.`,
    });
  }
  if (bridges.readingsRegistry) {
    trace?.(runId, 'compiler_readings_registry_bridge', {
      source: 'course-map-derived-registry',
      nativeReadingCount: stats.graphReadingCount,
      courseMapReadingCount: stats.mapReadingCount,
      missingReadingCount: stats.missingReadingCount,
    });
    recordEvent?.({
      type: 'pipelineDecision',
      stage: 'blueprintCompiler',
      label: 'Named reading registry bridge',
      detail: `Compiler restored ${stats.missingReadingCount} instructor-named reading${stats.missingReadingCount === 1 ? '' : 's'} omitted by native assembly so the assigned texts remain visible across instruction and assessment.`,
    });
  }
  return bridges;
}
