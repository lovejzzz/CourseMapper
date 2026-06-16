/**
 * finalizeQualityGate.js — v0.14.3 WS-A A2: grade the finished package.
 *
 * Runs in the deterministic package-finalizer flow AFTER export_verify
 * passes: assembles the same in-memory file map the ZIP download builds
 * (packageZipExporter, assembleOnly mode — no zip compression paid), grades
 * it with the deep quality grader through createMemoryFileProvider, and
 * returns the quality block for the export-panel badge plus the structured
 * result the badge modal renders.
 *
 * Honesty source: honestyFromDigest(budget, digest) — direct object
 * assertions replace the Crucible's console-log scan (excluded checks are
 * named in IN_APP_EXCLUDED_CHECKS on the grader).
 *
 * Contract: NEVER throws. Assembly or grading failure/timeout returns
 * { status: 'not-graded', reason }; graded P0 findings are converted to
 * readiness blockers by packageFinalizer.applyQualityToFinalizerResult.
 *
 * This module is dynamically imported from AppFlow so the grader + patterns
 * stay a lazy chunk loaded only when finalize-grading runs (WS-A A4).
 */

import { buildCourseMaterialsZip } from '../packageZipExporter.js';

export async function gradePackageAtFinalize({
  courseMap,
  deliverables = {},
  featureIds = null,
  columns = [],
  lessonFilter = null,
  slideTheme = 0,
  courseGraph = null,
  pipelineState = null,
  budget = null,
  digest = null,
  courseId = '',
  timeoutMs = 10000,
} = {}) {
  try {
    // The timeout bounds the WHOLE assemble+grade pass (file building plus
    // the grader's own internal timeout) — the badge shows "not graded"
    // rather than ever delaying the finish.
    const assembleAndGrade = buildCourseMaterialsZip({
      deliverables,
      courseMap,
      columns,
      courseName: courseMap?.courseName,
      lessonFilter,
      slideTheme,
      featureIds,
      pipelineState,
      courseGraph,
      assembleOnly: true,
      quality: { budget, digest, courseId, timeoutMs },
    });
    const raced = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ timedOut: true }), Math.max(0, timeoutMs));
      assembleAndGrade.then(
        (value) => {
          clearTimeout(timer);
          resolve({ value });
        },
        (error) => {
          clearTimeout(timer);
          resolve({ error });
        },
      );
    });
    if (raced.timedOut) return { status: 'not-graded', reason: `grading timed out after ${timeoutMs}ms` };
    if (raced.error) throw raced.error;
    const result = raced.value;
    const quality = result.quality || { status: 'not-graded', reason: 'grading did not run' };
    if (quality.status !== 'graded') return quality;
    return {
      ...quality,
      featureIds: Array.isArray(featureIds) ? [...featureIds] : null,
      // Structured extras for the badge modal (rendered as a summary view —
      // the chat markdown renderer lives in the ChatPanel chunk and is too
      // heavy to pull into the export panel).
      grades: result.qualityResult?.grades || {},
      findings: result.qualityResult?.findings || [],
      findingCount: result.qualityResult?.stats?.findingCount ?? 0,
      fileCount: result.qualityResult?.stats?.fileCount ?? null,
      // v0.14.9 B2: the FULL advisory texture block (sub-scores + worst-tail
      // evidence) for the Seal and the report modal's texture row — the
      // manifest carries the slim summary, the modal shows the evidence.
      texture: result.qualityResult?.texture || quality.texture || null,
    };
  } catch (err) {
    // buildCourseMaterialsZip fails closed (PackageZipExportError) when a
    // required file cannot be built — at finalize time that is "not graded",
    // never a new blocker (export_verify already owns file-level failures).
    return { status: 'not-graded', reason: err?.message || 'package assembly failed' };
  }
}
