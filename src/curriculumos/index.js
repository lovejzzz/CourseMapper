/**
 * CurriculumOS — the brain's ONE public facade (v0.15 S1).
 *
 * "The website was never the product — it's the first client of the
 * product." This module is the wall that makes that true in code: the
 * compiler, CourseIR, the genome, the on-miss extraction, and the quality grader are
 * reachable through FOUR verbs, with all IO injected. Nothing in this
 * dependency graph may import React, a hook, a component, or browser-only
 * state — `npm run curriculumos:proof` compiles and grades a full course
 * under plain vite-node as the standing proof, and the eslint wall
 * (no-restricted-imports on src/curriculumos/**) keeps the boundary from
 * regressing silently.
 *
 * The four verbs:
 *   compileCourse({ courseMap | courseIR, featureIds, configMap, enrichmentOverlay })
 *     → { blueprint, deliverables, ...proof }       (pure, deterministic)
 *   linkGenome({ courseMap, library, lessonIndices })
 *     → runGenomeLinker result                      (pure over the library)
 *   extractOnMiss({ ... })                          (flag-gated; model +
 *     → runOnMissGenomeExtraction result             providers injected)
 *   gradePackage({ courseMap, deliverables, ... })
 *     → { quality, qualityResult, files }           (assemble + deep grade)
 *
 * App code may keep importing the underlying modules directly for now (the
 * v0.15.1 S2 diet migrates consumers to this facade); NEW external
 * consumers — scripts, the future API, the CurriculumOS repo — use ONLY
 * this surface.
 */

import {
  buildCourseBlueprint,
  compactBlueprintForStorage,
  compileBlueprintDeliverables,
  getBlueprintCompiledFeatures,
} from '../lib/courseBlueprintCompiler';
import { attachEnrichmentToGraph, buildBlueprintFromGraph, deriveCourseGraphFromCourseMap } from '../lib/courseGraph';
import { createKernelLibrary } from '../lib/genome/kernelLibrary';
import { runGenomeLinker } from '../lib/genome/runGenomeLinker';
import { inferCourseDisciplines } from '../lib/genome/libraryShardLoader';
import { runOnMissGenomeExtraction } from '../lib/knowledge/genomeExtraction';
import { attachGenomeResources } from '../lib/knowledge/readingListEngine';
import { buildCourseMaterialsZip } from '../lib/packageZipExporter';
import {
  buildCourseIRFromCourseMap,
  buildCourseIRPromptPayload,
  compileCourseIR,
  planCourseIRGeneration,
  validateCourseIR,
} from '../lib/courseIR';

export {
  buildCourseIRFromCourseMap,
  buildCourseIRPromptPayload,
  createKernelLibrary,
  inferCourseDisciplines,
  getBlueprintCompiledFeatures,
  planCourseIRGeneration,
  validateCourseIR,
};

/**
 * Compile a course map (optionally enriched) into the full deliverable set.
 * Pure and deterministic — the same inputs always produce the same package.
 */
export function compileCourse({
  courseMap,
  courseIR = null,
  featureIds,
  configMap = {},
  enrichmentOverlay = null,
} = {}) {
  if (courseIR && typeof courseIR === 'object') {
    return compileCourseIR(courseIR, { featureIds, configMap });
  }

  const compiledFeatureIds = getBlueprintCompiledFeatures(
    Array.isArray(featureIds) && featureIds.length > 0
      ? featureIds
      : [
          'syllabus',
          'lessonPlans',
          'slideDecks',
          'assignments',
          'rubrics',
          'discussions',
          'quizBank',
          'studyGuides',
          'courseFaq',
        ],
  );
  let blueprint;
  let courseGraph = null;
  if (enrichmentOverlay && typeof enrichmentOverlay === 'object') {
    courseGraph = deriveCourseGraphFromCourseMap(courseMap);
    attachEnrichmentToGraph(courseGraph, enrichmentOverlay);
    // Provenance is part of the compiled course, not browser-only decoration.
    // Promote the same verified genome citations the app attaches into graph
    // Resource entities so headless clients can export SOURCE_REPORT.md and a
    // trustworthy source ledger instead of losing evidence at the facade.
    attachGenomeResources(courseGraph);
    blueprint = compactBlueprintForStorage(buildBlueprintFromGraph(courseGraph));
  } else {
    blueprint = compactBlueprintForStorage(buildCourseBlueprint(courseMap));
  }
  const deliverables = compileBlueprintDeliverables(blueprint, compiledFeatureIds, { configMap });
  return { blueprint, deliverables, compiledFeatureIds, courseGraph };
}

/** Resolve a course's lessons against an in-memory kernel library. */
export function linkGenome({
  courseMap,
  library,
  lessonIndices = null,
  itemPlan = undefined,
  sourceReferences = {},
} = {}) {
  const indices = Array.isArray(lessonIndices) ? lessonIndices : (courseMap?.lessons || []).map((_, index) => index);
  return runGenomeLinker({ courseMap, lessonIndices: indices, library, itemPlan, sourceReferences });
}

/** The flywheel verb — flag-gated, model + providers injected, never trusts citations. */
export const extractOnMiss = runOnMissGenomeExtraction;

/**
 * Assemble the package's real export files in memory and run the deep
 * quality grader over them — the same honest pass the app's finalize gate
 * and ZIP download use. Headless-safe: nothing here touches the DOM.
 */
export async function gradePackage({
  courseMap,
  deliverables,
  featureIds = null,
  columns = [],
  courseName = '',
  budget = null,
  digest = null,
  pipelineState = null,
  courseGraph = null,
  quality = undefined,
  timeoutMs = 30000,
} = {}) {
  const result = await buildCourseMaterialsZip({
    courseMap,
    deliverables,
    featureIds,
    columns,
    courseName: courseName || courseMap?.courseName,
    pipelineState,
    courseGraph,
    assembleOnly: true,
    quality: quality === undefined ? { budget, digest, timeoutMs } : quality,
  });
  return { quality: result.quality || null, qualityResult: result.qualityResult || null, files: result.files || [] };
}
