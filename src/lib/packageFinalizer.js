import { evaluateWorkspaceReadiness, repairCourseMapReadiness, repairWorkspaceReadiness } from './deliverableReadiness';
import { buildPackageRepairQueue, evaluateClassroomReadiness } from './classroomReadiness';
import { generateCourseHealthReport } from './pedagogicalValidator';
import { normalizeReadinessIssue, normalizeReadinessIssues } from './readinessIssueSchema';

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

  return {
    changed: repairs.length > 0,
    applied: repairs.length,
    repairs,
    courseMap: nextCourseMap,
    deliverables: nextDeliverables,
  };
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
  const validationDeliverables = scopeDeliverablesForValidation(finalDeliverables, selectedFeatures);
  const healthReport = includePedagogicalValidation
    ? generateCourseHealthReport(finalCourseMap, validationDeliverables)
    : { findings: [], errorCount: 0, warningCount: 0, infoCount: 0, summary: '' };
  const readiness = evaluateStrictPackageReadiness(
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
  const retryReadiness = retryWarnings
    ? readiness.workspaceReadiness
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
