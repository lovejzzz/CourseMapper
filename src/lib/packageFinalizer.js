import {
  READINESS_FEATURE_LABELS,
  evaluateWorkspaceReadiness,
  repairCourseMapReadiness,
  repairWorkspaceReadiness,
} from './deliverableReadiness';
import { buildPackageRepairQueue, evaluateClassroomReadiness } from './classroomReadiness';
import { generateCourseHealthReport } from './pedagogicalValidator';
import { normalizeReadinessIssue, normalizeReadinessIssues } from './readinessIssueSchema';
import { auditDeliverableContentQuality } from './contentQualityChecks';
import { repairDeliverableContentQuality } from './contentQualityRepair';

function featureLabel(featureId) {
  return READINESS_FEATURE_LABELS[featureId] || (featureId?.startsWith('custom_') ? 'Custom Deliverable' : featureId);
}

function contentRepairFeatureIds(selectedFeatures, deliverables = {}) {
  if (Array.isArray(selectedFeatures) && selectedFeatures.length > 0) return [...new Set(selectedFeatures)];
  return Object.entries(deliverables)
    .filter(([, entry]) => entry?.status === 'done')
    .map(([featureId]) => featureId);
}

function dedupeIssues(issues = []) {
  const seen = new Map();
  issues.forEach((issue) => {
    if (!issue) return;
    const key = `${issue.severity}:${issue.featureId}:${issue.message}`;
    if (!seen.has(key)) seen.set(key, issue);
  });
  return [...seen.values()];
}

function scopeDeliverablesForValidation(deliverables = {}, selectedFeatures = null) {
  if (!Array.isArray(selectedFeatures) || selectedFeatures.length === 0) return deliverables || {};
  const selected = new Set(selectedFeatures);
  return Object.fromEntries(Object.entries(deliverables || {}).filter(([featureId]) => selected.has(featureId)));
}

function compactValidationIssues(healthReport, { blockOnValidationWarnings = false, selectedFeatures = null } = {}) {
  const findings = healthReport?.findings || [];
  const selectedSet = Array.isArray(selectedFeatures) && selectedFeatures.length > 0 ? new Set(selectedFeatures) : null;
  return findings
    .filter(
      (finding) =>
        (finding?.severity === 'error' || (blockOnValidationWarnings && finding?.severity === 'warning')) &&
        (!selectedSet || !finding?.featureId || selectedSet.has(finding.featureId)),
    )
    .map((finding) => {
      const semanticBlocker = finding.category === 'semanticQuality' && finding.severity === 'error';
      return normalizeReadinessIssue({
        severity: semanticBlocker ? 'blocker' : 'warning',
        featureId: finding.featureId || 'courseMap',
        label: finding.featureId || 'Course Map',
        message: finding.message,
        classroomCriterion: finding.category,
        source: semanticBlocker ? 'validation' : 'validationReview',
        lessonIndex: Number.isInteger(finding.lessonIndex) ? finding.lessonIndex : null,
        target: Number.isInteger(finding.lessonIndex)
          ? { type: 'lesson', lessonIndex: finding.lessonIndex, featureId: finding.featureId }
          : undefined,
      });
    });
}

function buildReadinessResult(workspaceReadiness, classroomReadiness, healthReport, settings) {
  const classroomIssues = settings.includeClassroomReadiness
    ? settings.blockOnClassroomWarnings
      ? classroomReadiness?.issues || []
      : (classroomReadiness?.issues || []).filter((issue) => issue.severity === 'blocker')
    : [];
  const validationIssues = settings.includePedagogicalValidation
    ? compactValidationIssues(healthReport, {
        blockOnValidationWarnings: settings.blockOnValidationWarnings,
        selectedFeatures: settings.selectedFeatures,
      })
    : [];
  const issues = normalizeReadinessIssues(
    dedupeIssues([...(workspaceReadiness?.issues || []), ...classroomIssues, ...validationIssues]),
  );
  const blockers = issues.filter((issue) => issue.severity === 'blocker');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  return {
    ...workspaceReadiness,
    status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warnings' : 'ready',
    isBlocked: blockers.length > 0,
    blockers,
    warnings,
    issues,
    workspaceReadiness,
    classroomReadiness,
    healthReport,
  };
}

export function evaluateStrictPackageReadiness(
  options = {},
  {
    includeClassroomReadiness = false,
    blockOnClassroomWarnings = false,
    includePedagogicalValidation = false,
    blockOnValidationWarnings = false,
    healthReport = null,
  } = {},
) {
  const workspaceReadiness = evaluateWorkspaceReadiness(options);
  const classroomReadiness = includeClassroomReadiness
    ? evaluateClassroomReadiness({
        courseMap: options.courseMap,
        deliverables: options.deliverables,
        selectedFeatures: options.selectedFeatures,
        lessonFilter: options.lessonFilter,
      })
    : { status: 'ready', blockers: [], warnings: [], issues: [] };
  const validationReport =
    includePedagogicalValidation && !healthReport
      ? generateCourseHealthReport(
          options.courseMap,
          scopeDeliverablesForValidation(options.deliverables, options.selectedFeatures),
        )
      : healthReport || { findings: [], errorCount: 0, warningCount: 0, infoCount: 0, summary: '' };

  return buildReadinessResult(workspaceReadiness, classroomReadiness, validationReport, {
    includeClassroomReadiness,
    blockOnClassroomWarnings,
    includePedagogicalValidation,
    blockOnValidationWarnings,
    selectedFeatures: options.selectedFeatures,
  });
}

function getRepairableFeatureIds(workspaceReadiness, classroomReadiness) {
  return new Set(
    [...(workspaceReadiness?.issues || []), ...(classroomReadiness?.issues || [])]
      .map((issue) => issue.featureId)
      .filter(Boolean),
  );
}

function selectedCourseMapLessons(courseMap, lessonFilter = null) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  if (!Array.isArray(lessonFilter)) return lessons;
  return lessonFilter
    .filter((index) => Number.isInteger(index) && index >= 0 && index < lessons.length)
    .map((index) => lessons[index]);
}

function applyDeterministicRepairs({
  courseMap,
  deliverables = {},
  selectedFeatures = null,
  columns = [],
  lessonFilter = null,
  deliverableConfig = {},
  includeClassroomReadiness = true,
} = {}) {
  let nextCourseMap = courseMap;
  let nextDeliverables = deliverables;
  const repairs = [];

  let workspaceReadiness = evaluateWorkspaceReadiness({
    courseMap: nextCourseMap,
    deliverables: nextDeliverables,
    selectedFeatures,
    columns,
    lessonFilter,
  });
  let classroomReadiness = includeClassroomReadiness
    ? evaluateClassroomReadiness({
        courseMap: nextCourseMap,
        deliverables: nextDeliverables,
        selectedFeatures,
        lessonFilter,
      })
    : { issues: [] };
  let repairableFeatureIds = getRepairableFeatureIds(workspaceReadiness, classroomReadiness);

  if (selectedCourseMapLessons(nextCourseMap, lessonFilter).length > 0) {
    const courseMapRepair = repairCourseMapReadiness({
      courseMap: nextCourseMap,
      columns,
      lessonFilter,
    });
    if (courseMapRepair.changed) {
      nextCourseMap = courseMapRepair.courseMap;
      repairs.push({
        featureId: 'courseMap',
        label: 'Course Map',
        changes: courseMapRepair.repairedFields,
        message: `Course Map repaired: ${courseMapRepair.repairedFields.join('; ')}`,
      });
      workspaceReadiness = evaluateWorkspaceReadiness({
        courseMap: nextCourseMap,
        deliverables: nextDeliverables,
        selectedFeatures,
        columns,
        lessonFilter,
      });
      classroomReadiness = includeClassroomReadiness
        ? evaluateClassroomReadiness({
            courseMap: nextCourseMap,
            deliverables: nextDeliverables,
            selectedFeatures,
            lessonFilter,
          })
        : { issues: [] };
      repairableFeatureIds = getRepairableFeatureIds(workspaceReadiness, classroomReadiness);
    }
  }

  const deliverableFeatureIds = [...repairableFeatureIds].filter((featureId) => featureId !== 'courseMap');
  if (deliverableFeatureIds.length > 0) {
    const deliverableRepair = repairWorkspaceReadiness({
      courseMap: nextCourseMap,
      deliverables,
      selectedFeatures: deliverableFeatureIds,
      deliverableConfig,
    });
    if (deliverableRepair.changed) {
      nextDeliverables = deliverableRepair.deliverables;
      repairs.push(...deliverableRepair.repairs);
    }
  }

  // v0.12.1 P2: deterministic content-quality pass. Mechanical template seams
  // (double periods, article agreement, stranded connectives, leading-colon
  // labels) are fixed here at zero provider calls — previously they were only
  // detected by the export verifier, AFTER the retry loop, so they shipped as
  // permanent warnings while retry budget sat unused.
  const contentFeatureIds = contentRepairFeatureIds(selectedFeatures, nextDeliverables).filter(
    (featureId) => featureId !== 'courseMap',
  );
  for (const featureId of contentFeatureIds) {
    const entry = nextDeliverables?.[featureId];
    if (entry?.status !== 'done' || !entry.data) continue;
    const contentRepair = repairDeliverableContentQuality(featureId, entry.data);
    if (!contentRepair.changed) continue;
    if (nextDeliverables === deliverables) nextDeliverables = { ...deliverables };
    nextDeliverables[featureId] = { ...entry, data: contentRepair.data };
    repairs.push({
      featureId,
      label: featureLabel(featureId),
      changes: [`content quality: ${contentRepair.repairedStrings} string(s) normalized`],
      message: `${featureLabel(featureId)} repaired: ${contentRepair.repairedStrings} content-quality seam(s) fixed (deterministic)`,
    });
  }

  return {
    changed: repairs.length > 0,
    applied: repairs.length,
    repairs,
    courseMap: nextCourseMap,
    deliverables: nextDeliverables,
  };
}

/**
 * Partial enrichment coverage is a diagnostic quality signal, not a
 * download safety failure. The finish pass still records it, but export-ready
 * packages should not get trapped behind a false "needs attention" blocker
 * after deterministic compilation, grade, and ZIP verification have passed.
 */
export function buildEnrichmentCoverageIssues(enrichmentOutcome) {
  if (!enrichmentOutcome || enrichmentOutcome.modelStage !== 'ran') return [];
  const requested = Number(enrichmentOutcome.requestedLessons) || 0;
  const enriched = Number(enrichmentOutcome.enrichedLessons) || 0;
  if (requested <= 0 || enriched >= requested) return [];
  return [];
}

/**
 * v0.14.3 WS-A A3: P0 findings from the finalize-time quality grade surface
 * through the same readiness/warnings channel as enrichment coverage —
 * they should be impossible (the gates run earlier), which is exactly why
 * showing them is cheap honesty. Warning severity, never a blocker, never
 * retried (the grader reads frozen compiled output; no retry pass can
 * change what it measures).
 */
export function buildQualityGateIssues(quality) {
  if (quality?.status !== 'graded') return [];
  const p0 = Number(quality?.findingCounts?.p0) || 0;
  if (p0 <= 0) return [];
  return [
    normalizeReadinessIssue({
      severity: 'warning',
      featureId: 'courseMap',
      label: 'Quality grade',
      message: `Package quality grader found ${p0} P0 finding${p0 === 1 ? '' : 's'} (score ${quality.score}/100, grade ${quality.grade}) — see QUALITY_REPORT.md in the download`,
      source: 'qualityGate',
      retryable: false,
      autoFixable: false,
    }),
  ];
}

/**
 * Merge a finalize-time quality grade into a finalizer result: attaches
 * `quality` and, when the grade carries P0 findings, appends the qualityGate
 * warning to the readiness channel (recomputing status/counts the same way
 * runDeterministicPackageFinalizer's merge point does). Grading happens
 * AFTER the finalizer returns (it needs the run digest), so this helper is
 * the integration seam AppFlow applies — mirroring how
 * buildEnrichmentCoverageIssues folds into readiness inside the finalizer.
 */
export function applyQualityToFinalizerResult(result, quality) {
  if (!result) return result;
  const issues = buildQualityGateIssues(quality);
  if (issues.length === 0) return { ...result, quality: quality || null };
  const readiness = result.readiness || {};
  const mergedIssues = normalizeReadinessIssues(dedupeIssues([...(readiness.issues || []), ...issues]));
  const blockers = mergedIssues.filter((issue) => issue.severity === 'blocker');
  const warnings = mergedIssues.filter((issue) => issue.severity === 'warning');
  return {
    ...result,
    quality,
    readiness: {
      ...readiness,
      status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warnings' : 'ready',
      isBlocked: blockers.length > 0,
      blockers,
      warnings,
      issues: mergedIssues,
    },
  };
}

// v0.14.1 P2.5: high-stakes language in a map assessment title — a phantom
// midterm/final/oral is a much worse ship than a missing in-class check.
const HIGH_STAKES_ASSESSMENT_RE = /\b(midterm|final|exam|capstone|performance|portfolio)\b/i;

const ASSESSMENT_TITLE_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'or',
  'per',
  'the',
  'to',
  'with',
]);

function normalizeAssessmentTitle(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function assessmentTitleTokens(value) {
  return normalizeAssessmentTitle(value)
    .split(' ')
    .filter((token) => token && !ASSESSMENT_TITLE_STOPWORDS.has(token));
}

function parseLessonNumberFromText(value) {
  if (Number.isInteger(value)) return value;
  const match = String(value ?? '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

/**
 * Downstream surfaces a map-promised assessment can resolve against:
 *  - blueprint.assessments (title + artifact, per lesson) when the caller
 *    still holds the blueprint (tests, future graph-first wiring);
 *  - the compiled deliverables the finalizer always receives: assignment
 *    briefs (title per dueWeek), the course assignment map, rubric titles,
 *    and the syllabus grading-table rows (course-level).
 * Lesson-plan prose is deliberately NOT scanned: at the finalizer call site
 * it derives from the same blueprint.assessments (no independent signal) and
 * can echo raw map cells, which would let a phantom midterm resolve itself.
 */
function collectDownstreamAssessmentCandidates({ blueprint, deliverables }) {
  const candidates = [];
  const push = (title, lessons) => {
    const normalized = normalizeAssessmentTitle(title);
    if (!normalized) return;
    const lessonNumbers = (Array.isArray(lessons) ? lessons : [lessons]).filter(Number.isInteger);
    candidates.push({
      normalized,
      tokens: new Set(normalized.split(' ')),
      // null = course-level surface (syllabus grading row): matches any lesson.
      lessonNumbers: lessonNumbers.length > 0 ? lessonNumbers : null,
    });
  };

  for (const assessment of blueprint?.assessments || []) {
    push(assessment?.title, assessment?.lessonNumbers);
    if (assessment?.artifact && assessment.artifact !== assessment.title) {
      push(assessment.artifact, assessment?.lessonNumbers);
    }
  }

  const doneData = (featureId) => {
    const entry = deliverables?.[featureId];
    return entry?.status === 'done' && entry.data ? entry.data : null;
  };

  const assignments = doneData('assignments');
  for (const brief of assignments?.assignments || []) push(brief?.title, parseLessonNumberFromText(brief?.dueWeek));
  for (const row of assignments?.courseAssignmentMap || []) push(row?.artifact, parseLessonNumberFromText(row?.week));

  const rubrics = doneData('rubrics');
  for (const rubric of rubrics?.rubrics || []) push(rubric?.title, parseLessonNumberFromText(rubric?.lessonTitle));

  const syllabus = doneData('syllabus');
  for (const row of syllabus?.requirements || []) push(row?.name, null);

  return candidates;
}

/**
 * Tiered match against same-lesson (or course-level) candidates:
 *  1. exact normalized title equality;
 *  2. token subset — every meaningful graph-title token appears in the
 *     candidate (map atom "Quiz: plate boundary evidence" ⊆ fused brief
 *     "Quiz: plate boundary evidence and map Activity");
 *  3. label subset — the fusion keeps only the second atom's pre-colon label,
 *     so "Map Activity: boundary identification" resolves when its label
 *     tokens {map, activity} all appear in the candidate. The label carries
 *     the genre keyword, so a midterm can only label-resolve against text
 *     that still says "midterm".
 */
function assessmentResolvesDownstream(assessment, candidates) {
  const title = String(assessment?.title ?? '').trim();
  const normalized = normalizeAssessmentTitle(title);
  if (!normalized) return true;
  const tokens = assessmentTitleTokens(title);
  const colonIndex = title.indexOf(':');
  const labelTokens = colonIndex > 0 ? assessmentTitleTokens(title.slice(0, colonIndex)) : [];
  const dueSession = Number.isInteger(assessment?.dueSession) ? assessment.dueSession : null;

  return candidates.some((candidate) => {
    if (dueSession !== null && candidate.lessonNumbers !== null && !candidate.lessonNumbers.includes(dueSession)) {
      return false;
    }
    if (candidate.normalized === normalized) return true;
    if (tokens.length > 0 && tokens.every((token) => candidate.tokens.has(token))) return true;
    return labelTokens.length > 0 && labelTokens.every((token) => candidate.tokens.has(token));
  });
}

/**
 * v0.14.1 P2.5: the map↔deliverable reconciliation gate. The v0.14 audit
 * found course maps promising assessments that exist nowhere downstream —
 * Geology's "Midterm Exam: minerals through metamorphic rocks", Mandarin's
 * oral rubrics — because the blueprint mints ONE assessment per lesson while
 * the graph carries every map atom. Until the Phase 3 assessment registry
 * makes the drift impossible by construction, this gate detects it the day
 * it regresses: every graph assessment must resolve to a downstream artifact.
 * Unresolved high-stakes titles become warnings (message names the
 * assessment and lesson); the rest fold into ONE info-level aggregate so
 * legitimately brief-less in-class checks do not drown the user. Info issues
 * are NOT merged into readiness (the schema would coerce them to warnings) —
 * they surface through the finalizer result and the run digest.
 * Graph-optional: legacy projects without a course graph return [] quietly,
 * as does a package with no assessment-bearing artifact to reconcile against.
 */
export function buildAssessmentReconciliationIssues({ courseGraph, blueprint, deliverables } = {}) {
  const graphAssessments = Array.isArray(courseGraph?.assessments) ? courseGraph.assessments : [];
  if (graphAssessments.length === 0) return [];
  const candidates = collectDownstreamAssessmentCandidates({ blueprint, deliverables });
  if (candidates.length === 0) return [];

  const issues = [];
  const inClassOnlyTitles = [];
  for (const assessment of graphAssessments) {
    const title = String(assessment?.title ?? '').trim();
    if (!title) continue;
    if (assessmentResolvesDownstream(assessment, candidates)) continue;
    const dueSession = Number.isInteger(assessment?.dueSession) ? assessment.dueSession : null;
    if (HIGH_STAKES_ASSESSMENT_RE.test(title)) {
      issues.push(
        normalizeReadinessIssue({
          severity: 'warning',
          featureId: 'courseMap',
          label: 'Assessment reconciliation',
          message: `${title} — promised in course map${
            dueSession !== null ? ` (Lesson ${dueSession})` : ''
          }, no matching assignment or exam was generated`,
          source: 'assessmentReconciliation',
          ...(dueSession !== null ? { lessonNumber: dueSession } : {}),
          retryable: false,
          autoFixable: false,
        }),
      );
    } else {
      inClassOnlyTitles.push(title);
    }
  }
  if (inClassOnlyTitles.length > 0) {
    issues.push({
      severity: 'info',
      featureId: 'courseMap',
      label: 'Assessment reconciliation',
      message: `${inClassOnlyTitles.length} additional map assessment${
        inClassOnlyTitles.length === 1 ? ' has' : 's have'
      } no dedicated artifact (in-class activities)`,
      source: 'assessmentReconciliation',
      assessmentTitles: inClassOnlyTitles.slice(0, 8),
      retryable: false,
      autoFixable: false,
    });
  }
  return issues;
}

function summarizeFinalizerStatus({ status, readiness, repairQueue, repairsApplied, retryActions }) {
  const repairText =
    repairsApplied > 0 ? `Auto-fixed ${repairsApplied} safe issue${repairsApplied === 1 ? '' : 's'}. ` : '';
  if (status === 'ready') return `${repairText}All selected materials are ready to download.`;
  if (status === 'needs_retry') {
    return `${repairText}Retrying ${retryActions.length} weak area${retryActions.length === 1 ? '' : 's'} before export.`;
  }
  if (status === 'blocked') {
    return `${repairText}${readiness.blockers.length} critical issue${readiness.blockers.length === 1 ? '' : 's'} still need review.`;
  }
  return `${repairText}${readiness.warnings.length || repairQueue?.broadIssueCount || 1} item${
    readiness.warnings.length === 1 ? '' : 's'
  } still need instructor review.`;
}

function getFinalizerStatus(readiness, repairQueue) {
  const retryActions = repairQueue?.retryActions || [];
  if (readiness.blockers.length > 0) return retryActions.length > 0 ? 'needs_retry' : 'blocked';
  if (readiness.warnings.length > 0) return retryActions.length > 0 ? 'needs_retry' : 'needs_review';
  if (retryActions.length > 0) return 'needs_retry';
  return 'ready';
}

export function runDeterministicPackageFinalizer({
  courseMap,
  deliverables = {},
  selectedFeatures = null,
  columns = [],
  lessonFilter = null,
  deliverableConfig = {},
  includeClassroomReadiness = true,
  blockOnClassroomWarnings = true,
  includePedagogicalValidation = true,
  blockOnValidationWarnings = false,
  maxRetryActions = 4,
  retryWarnings = true,
  enrichmentOutcome = null,
  courseGraph = null,
  blueprint = null,
} = {}) {
  const repairResult = applyDeterministicRepairs({
    courseMap,
    deliverables,
    selectedFeatures,
    columns,
    lessonFilter,
    deliverableConfig,
    includeClassroomReadiness,
  });
  const finalCourseMap = repairResult.courseMap || courseMap;
  const finalDeliverables = repairResult.deliverables || deliverables;
  // v0.12.1 P2: findings that survive the deterministic content repair need
  // authorship — surface them as readiness warnings HERE (not only in the
  // post-retry export verifier) so the repair queue can spend retry budget
  // on them.
  const contentQualityIssues = [];
  for (const featureId of contentRepairFeatureIds(selectedFeatures, finalDeliverables)) {
    if (featureId === 'courseMap') continue;
    const entry = finalDeliverables?.[featureId];
    if (entry?.status !== 'done' || !entry.data) continue;
    const audit = auditDeliverableContentQuality(featureId, entry.data);
    if (audit.findings.length === 0) continue;
    const codes = [...new Set(audit.findings.map((finding) => finding.code))];
    contentQualityIssues.push(
      normalizeReadinessIssue({
        severity: 'warning',
        featureId,
        label: featureLabel(featureId),
        message: `${audit.findings.length} content quality finding(s): ${codes.join(', ')} — e.g. "${audit.findings[0].sample}"`,
        source: 'contentQuality',
      }),
    );
  }
  const validationDeliverables = scopeDeliverablesForValidation(finalDeliverables, selectedFeatures);
  const healthReport = includePedagogicalValidation
    ? generateCourseHealthReport(finalCourseMap, validationDeliverables)
    : { findings: [], errorCount: 0, warningCount: 0, infoCount: 0, summary: '' };
  const baseReadiness = evaluateStrictPackageReadiness(
    {
      courseMap: finalCourseMap,
      deliverables: finalDeliverables,
      selectedFeatures,
      columns,
      lessonFilter,
    },
    {
      includeClassroomReadiness,
      blockOnClassroomWarnings,
      includePedagogicalValidation,
      blockOnValidationWarnings,
      healthReport,
    },
  );
  // Coverage stays out of readiness. The run digest records the
  // diagnostic fact; the finalizer only blocks real export/readiness defects.
  const enrichmentCoverageIssues = buildEnrichmentCoverageIssues(enrichmentOutcome);
  // v0.14.1 P2.5: graph assessments with no downstream artifact. Warnings
  // (high-stakes phantoms) join readiness at the same merge point as
  // coverage; the info aggregate stays out (the issue schema would coerce it
  // to a warning) and rides the result for the digest. Never in the retry
  // channel — no retry pass can mint a missing exam; Phase 3's assessment
  // registry fixes that by construction.
  const assessmentReconciliationIssues = buildAssessmentReconciliationIssues({
    courseGraph,
    blueprint,
    deliverables: finalDeliverables,
  });
  const reconciliationWarnings = assessmentReconciliationIssues.filter((issue) => issue.severity !== 'info');
  const readiness =
    contentQualityIssues.length === 0 && enrichmentCoverageIssues.length === 0 && reconciliationWarnings.length === 0
      ? baseReadiness
      : (() => {
          const issues = normalizeReadinessIssues(
            dedupeIssues([
              ...(baseReadiness.issues || []),
              ...contentQualityIssues,
              ...enrichmentCoverageIssues,
              ...reconciliationWarnings,
            ]),
          );
          const blockers = issues.filter((issue) => issue.severity === 'blocker');
          const warnings = issues.filter((issue) => issue.severity === 'warning');
          return {
            ...baseReadiness,
            status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warnings' : 'ready',
            isBlocked: blockers.length > 0,
            blockers,
            warnings,
            issues,
          };
        })();
  const retryReadiness = retryWarnings
    ? {
        ...readiness.workspaceReadiness,
        // Content-quality warnings ride the workspace channel into the
        // repair queue so retry budget can target them.
        warnings: [...(readiness.workspaceReadiness?.warnings || []), ...contentQualityIssues],
        issues: [...(readiness.workspaceReadiness?.issues || []), ...contentQualityIssues],
      }
    : {
        ...readiness.workspaceReadiness,
        warnings: [],
        issues: readiness.workspaceReadiness?.blockers || [],
      };
  const retryClassroomReadiness = retryWarnings
    ? readiness.classroomReadiness
    : {
        ...readiness.classroomReadiness,
        warnings: [],
        issues: readiness.classroomReadiness?.blockers || [],
      };
  const repairQueue = buildPackageRepairQueue({
    courseMap: finalCourseMap,
    deliverables: finalDeliverables,
    selectedFeatures,
    readiness: retryReadiness,
    classroomReadiness: retryClassroomReadiness,
    healthReport,
    maxActions: maxRetryActions,
  });
  const retryActions = (repairQueue.retryActions || []).slice(0, Math.max(0, Number(maxRetryActions) || 0));
  const status = getFinalizerStatus(readiness, { ...repairQueue, retryActions });

  return {
    status,
    ready: status === 'ready',
    changed: repairResult.changed,
    repairsApplied: repairResult.applied,
    repairs: repairResult.repairs,
    courseMap: finalCourseMap,
    deliverables: finalDeliverables,
    readiness,
    classroomReadiness: readiness.classroomReadiness,
    // v0.14.1 P2.5: the full reconciliation finding list (warnings + the
    // info aggregate) for callers that surface it in the run digest.
    assessmentReconciliationIssues,
    healthReport,
    repairQueue: {
      ...repairQueue,
      retryActions,
      retryActionCount: retryActions.length,
      actionCount: retryActions.length,
    },
    retryActions,
    message: summarizeFinalizerStatus({
      status,
      readiness,
      repairQueue,
      repairsApplied: repairResult.applied,
      retryActions,
    }),
  };
}
