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

import { buildCourseMaterialsZip, DEFAULT_PACKAGE_QUALITY_TIMEOUT_MS } from '../packageZipExporter.js';
import { buildFinalizeSourceEvidence } from './sourceEvidence.js';

export const PACKAGE_FINALIZE_ASSEMBLY_GRACE_MS = 15000;
export const PACKAGE_FINALIZE_GRADING_TIMEOUT_MS = DEFAULT_PACKAGE_QUALITY_TIMEOUT_MS;
export const PACKAGE_FINALIZE_QUALITY_TIMEOUT_MS =
  PACKAGE_FINALIZE_GRADING_TIMEOUT_MS + PACKAGE_FINALIZE_ASSEMBLY_GRACE_MS;

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
  coursePrompt = '',
  expectedSessionMinutes = null,
  timeoutMs = PACKAGE_FINALIZE_GRADING_TIMEOUT_MS,
} = {}) {
  try {
    // The grader owns `timeoutMs`; the outer pass additionally allows bounded
    // assembly/import overhead. Equal nested deadlines made the outer timer
    // deterministically win and discard the grader's own terminal result.
    const wholePassTimeoutMs = Math.max(0, timeoutMs) + PACKAGE_FINALIZE_ASSEMBLY_GRACE_MS;
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
      quality: { budget, digest, courseId, coursePrompt, expectedSessionMinutes, timeoutMs },
    });
    const raced = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ timedOut: true }), wholePassTimeoutMs);
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
    if (raced.timedOut) {
      return { status: 'not-graded', reason: `package assembly and grading timed out after ${wholePassTimeoutMs}ms` };
    }
    if (raced.error) throw raced.error;
    const result = raced.value;
    const quality = result.quality || { status: 'not-graded', reason: 'grading did not run' };
    const findings = result.qualityResult?.findings || [];
    const sourceEvidence = buildFinalizeSourceEvidence(result.manifest, findings);
    if (quality.status !== 'graded') {
      return {
        ...quality,
        featureIds: Array.isArray(featureIds) ? [...featureIds] : null,
        sourceEvidence,
      };
    }
    return {
      ...quality,
      featureIds: Array.isArray(featureIds) ? [...featureIds] : null,
      // Structured extras for the badge modal (rendered as a summary view —
      // the chat markdown renderer lives in the ChatPanel chunk and is too
      // heavy to pull into the export panel).
      grades: result.qualityResult?.grades || {},
      findings,
      findingCount: result.qualityResult?.stats?.findingCount ?? 0,
      fileCount: result.qualityResult?.stats?.fileCount ?? null,
      sourceEvidence,
      scoreLedger: result.qualityResult?.scoreLedger || null,
      // Full texture block (sub-scores + worst-tail evidence) for the Seal and
      // report modal. The manifest carries the slim summary.
      texture: result.qualityResult?.texture || quality.texture || null,
    };
  } catch (err) {
    // buildCourseMaterialsZip fails closed (PackageZipExportError) when a
    // required file cannot be built — at finalize time that is "not graded",
    // never a new blocker (export_verify already owns file-level failures).
    return { status: 'not-graded', reason: err?.message || 'package assembly failed' };
  }
}
