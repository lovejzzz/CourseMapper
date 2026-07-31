import {
  READINESS_FEATURE_LABELS,
  evaluateWorkspaceReadiness,
  repairCourseMapReadiness,
  repairWorkspaceReadiness,
} from './deliverableReadiness';
import { buildPackageRepairQueue, evaluateClassroomReadiness } from './classroomReadiness';
import { auditDeliverableContentQuality } from './contentQualityChecks';
import { repairDeliverableContentQuality } from './contentQualityRepair';
import { generateCourseHealthReport } from './pedagogicalValidator';
import { repairMisappliedObservationProtocols } from './observationProtocols';
import { normalizeReadinessIssue, normalizeReadinessIssues } from './readinessIssueSchema';
import { compactCompilerOwnedAssessmentIdentity } from './compilerAssessmentIdentity';
import { compactAssignmentBriefBodyReferences } from './courseCompilerCopyVariants';
import { countBlockingQualityFindings } from './qualityFindingPolicy';

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
      const semanticBlocker = ['semanticQuality', 'timing'].includes(finding.category) && finding.severity === 'error';
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

function compactFinalizerText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Deliberately WIDER than compilerText.stripLessonPrefix (module/unit/session
// prefixes, optional separator, en/em dashes) — calibrated to finalizer
// surfaces; do not swap for the shared primitive without re-running the
// byte-sensitive harnesses.
function stripLessonPrefixText(value) {
  return compactFinalizerText(value).replace(/^(?:lesson|week|module|unit|session)\s*\d+\s*[:.\-–—]?\s*/i, '');
}

function stripFinalizerTerminalPunctuation(value) {
  return compactFinalizerText(value).replace(/[.!?]+$/g, '');
}

const COURSE_MAP_IDENTITY_STOPWORDS = new Set([
  'lesson',
  'week',
  'course',
  'assignment',
  'brief',
  'assessment',
  'evidence',
  'check',
  'note',
  'notes',
  'that',
  'with',
  'from',
  'using',
  'students',
  'student',
]);

function identityTokenList(value) {
  return stripLessonPrefixText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !COURSE_MAP_IDENTITY_STOPWORDS.has(token));
}

function courseMapLessonTitle(lesson, index) {
  const raw = compactFinalizerText(lesson?.title);
  if (raw) return raw;
  return `Lesson ${index + 1}`;
}

function courseMapLessonFocus(lesson, index) {
  const fromTitle = stripLessonPrefixText(courseMapLessonTitle(lesson, index));
  if (fromTitle) return fromTitle;
  const section = Array.isArray(lesson?.sections) ? lesson.sections[0] || {} : {};
  return (
    compactFinalizerText(section.topicSection || section.learningGoals || section.learningObjectives) ||
    `Lesson ${index + 1}`
  );
}

function courseMapAssessmentTitle(lesson, index) {
  const section = Array.isArray(lesson?.sections) ? lesson.sections[0] || {} : {};
  const raw = compactFinalizerText(section.weeklyAssessments || lesson?.weeklyAssessments);
  if (raw) {
    const firstLine = raw
      .split(/\n|;/)
      .map((part) => compactFinalizerText(part))
      .find(Boolean);
    const concise = firstLine
      ?.replace(/\s+that\s+.+$/i, '')
      .replace(/:\s+.+$/i, '')
      .trim();
    if (concise && concise.length >= 8) return stripFinalizerTerminalPunctuation(concise);
    if (firstLine) return stripFinalizerTerminalPunctuation(firstLine);
  }
  return `${courseMapLessonFocus(lesson, index)} evidence check`;
}

function assignmentLessonIndex(assignment, lessons) {
  const explicit =
    parseLessonNumberFromText(assignment?.dueWeek || assignment?.dw) ||
    parseLessonNumberFromText(assignment?.courseMapRef || assignment?.cmr) ||
    parseLessonNumberFromText(assignment?.title || assignment?.t);
  if (explicit && explicit >= 1 && explicit <= lessons.length) return explicit - 1;
  return null;
}

function assignmentMatchesCourseMapIdentity(assignment, lesson, index) {
  const focusTokens = identityTokenList(courseMapLessonFocus(lesson, index));
  if (focusTokens.length === 0) return true;
  const visibleIdentity = [
    assignment?.title || assignment?.t,
    ...(Array.isArray(assignment?.relatedLessons) ? assignment.relatedLessons : []),
    ...(Array.isArray(assignment?.rl) ? assignment.rl : []),
  ]
    .map(compactFinalizerText)
    .join(' ')
    .toLowerCase();
  return focusTokens.every((token) => visibleIdentity.includes(token));
}

function repairAssignmentBriefIdentity(assignment, lesson, index) {
  const expectedLessonTitle = courseMapLessonTitle(lesson, index);
  const expectedFocus = courseMapLessonFocus(lesson, index);
  const expectedTitle = courseMapAssessmentTitle(lesson, index);
  const titleKey = assignment?.title !== undefined ? 'title' : assignment?.t !== undefined ? 't' : 'title';
  const relatedKey =
    assignment?.relatedLessons !== undefined
      ? 'relatedLessons'
      : assignment?.rl !== undefined
        ? 'rl'
        : 'relatedLessons';
  const overviewKey =
    assignment?.overview !== undefined ? 'overview' : assignment?.ov !== undefined ? 'ov' : 'overview';
  const submissionProfile =
    assignment?.submissionProfile && typeof assignment.submissionProfile === 'object'
      ? {
          ...assignment.submissionProfile,
          artifact: expectedTitle,
          evidenceRequirement:
            assignment.submissionProfile.evidenceRequirement ||
            `Use the Course Map lesson evidence for ${expectedFocus}; keep the submitted work tied to the current lesson.`,
        }
      : assignment?.submissionProfile;

  return {
    ...assignment,
    [titleKey]: expectedTitle,
    [relatedKey]: [expectedLessonTitle],
    [overviewKey]: `${expectedTitle} asks students to use ${expectedFocus} evidence from the Course Map. Review for ${assignment?.submissionProfile?.qualityFocus || 'concept accuracy, evidence use, and a clear next decision'}.`,
    ...(submissionProfile ? { submissionProfile } : {}),
    portfolioConnection: `This artifact documents how students apply ${expectedLessonTitle} to a course-relevant decision.`,
    enrichmentSource:
      assignment?.enrichmentSource === 'lesson-content-enrichment'
        ? 'course-map-identity-repaired'
        : assignment?.enrichmentSource,
  };
}

function repairAssignmentIdentitiesFromCourseMap(courseMap, deliverables = {}) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const assignmentEntry = deliverables?.assignments;
  const data = assignmentEntry?.status === 'done' ? assignmentEntry.data : null;
  const assignments = Array.isArray(data?.assignments) ? data.assignments : null;
  if (!assignments || lessons.length === 0) {
    return { changed: false, deliverables, repairedCount: 0 };
  }

  let repairedCount = 0;
  const nextAssignments = assignments.map((assignment) => {
    // Activity packets already carry a controlled briefing → roles → update
    // → artifact sequence. The generic assignment texture reducer can turn
    // concrete activity names into awkward "<topic> focus" placeholders and
    // obscure that sequence, so preserve them exactly as compiled.
    if (assignment?.activityPacket) return assignment;
    const lessonIndex = assignmentLessonIndex(assignment, lessons);
    if (lessonIndex === null) return assignment;
    const lesson = lessons[lessonIndex];
    if (assignmentMatchesCourseMapIdentity(assignment, lesson, lessonIndex)) return assignment;
    repairedCount += 1;
    return repairAssignmentBriefIdentity(assignment, lesson, lessonIndex);
  });

  if (repairedCount === 0) {
    return { changed: false, deliverables, repairedCount: 0 };
  }

  return {
    changed: true,
    repairedCount,
    deliverables: {
      ...deliverables,
      assignments: {
        ...assignmentEntry,
        data: {
          ...data,
          assignments: nextAssignments,
        },
      },
    },
  };
}

function repairAssignmentBriefTextureFromCourseMap(courseMap, deliverables = {}) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const assignmentEntry = deliverables?.assignments;
  const data = assignmentEntry?.status === 'done' ? assignmentEntry.data : null;
  const assignments = Array.isArray(data?.assignments) ? data.assignments : null;
  if (!assignments || lessons.length === 0) {
    return { changed: false, deliverables, repairedCount: 0 };
  }

  let repairedCount = 0;
  const nextAssignments = assignments.map((assignment) => {
    const lessonIndex = assignmentLessonIndex(assignment, lessons);
    if (lessonIndex === null) return assignment;
    const lesson = lessons[lessonIndex];
    const compacted = compactAssignmentBriefBodyReferences({
      brief: assignment,
      lesson: {
        ...lesson,
        lessonNumber: Number(lesson?.lessonNumber) || lessonIndex + 1,
      },
      fullFocus: courseMapLessonFocus(lesson, lessonIndex),
      fallbackArtifact: compactFinalizerText(assignment?.title || assignment?.t || 'assignment'),
    });
    if (JSON.stringify(compacted) === JSON.stringify(assignment)) return assignment;
    repairedCount += 1;
    return compacted;
  });

  if (repairedCount === 0) {
    return { changed: false, deliverables, repairedCount: 0 };
  }

  return {
    changed: true,
    repairedCount,
    deliverables: {
      ...deliverables,
      assignments: {
        ...assignmentEntry,
        data: {
          ...data,
          assignments: nextAssignments,
        },
      },
    },
  };
}

function applyDeterministicRepairs({
  courseMap,
  sourceBrief = '',
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
  const observations = [];

  let workspaceReadiness = evaluateWorkspaceReadiness({
    courseMap: nextCourseMap,
    deliverables: nextDeliverables,
    selectedFeatures,
    columns,
    lessonFilter,
    deliverableConfig,
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
        deliverableConfig,
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
    observations.push(...(deliverableRepair.observations || []));
    if (deliverableRepair.changed) {
      nextDeliverables = deliverableRepair.deliverables;
      repairs.push(...deliverableRepair.repairs);
    }
  }

  const assignmentIdentityRepair = repairAssignmentIdentitiesFromCourseMap(nextCourseMap, nextDeliverables);
  if (assignmentIdentityRepair.changed) {
    nextDeliverables = assignmentIdentityRepair.deliverables;
    repairs.push({
      featureId: 'assignments',
      label: featureLabel('assignments'),
      changes: [`course-map identity: ${assignmentIdentityRepair.repairedCount} assignment brief(s) repaired`],
      message: `${featureLabel('assignments')} repaired: ${assignmentIdentityRepair.repairedCount} assignment brief identity mismatch(es) aligned to the Course Map`,
    });
  }

  // Saved projects can predate the compiler's current repetition controls.
  // Re-run the same body-only compactor during finalization so legacy
  // assignments receive current learner-facing copy without touching their
  // canonical heading/Related Lessons identity or spending a provider call.
  const assignmentTextureRepair = repairAssignmentBriefTextureFromCourseMap(nextCourseMap, nextDeliverables);
  if (assignmentTextureRepair.changed) {
    nextDeliverables = assignmentTextureRepair.deliverables;
    repairs.push({
      featureId: 'assignments',
      label: featureLabel('assignments'),
      changes: [`legacy copy texture: ${assignmentTextureRepair.repairedCount} assignment brief(s) compacted`],
      message: `${featureLabel('assignments')} repaired: ${assignmentTextureRepair.repairedCount} legacy repeated-title surface(s) compacted`,
    });
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
    let entry = nextDeliverables?.[featureId];
    if (entry?.status !== 'done' || !entry.data) continue;
    if (featureId === 'lessonPlans') {
      const protocolRepair = repairMisappliedObservationProtocols({
        courseName: nextCourseMap?.courseName,
        lessons: selectedCourseMapLessons(nextCourseMap, lessonFilter),
        sourceText: sourceBrief,
        data: entry.data,
      });
      if (protocolRepair.changed) {
        if (nextDeliverables === deliverables) nextDeliverables = { ...deliverables };
        entry = { ...entry, data: protocolRepair.data };
        nextDeliverables[featureId] = entry;
        repairs.push({
          featureId,
          label: featureLabel(featureId),
          changes: [`removed ${protocolRepair.removedCount} misapplied sky-observation protocol(s)`],
          message: `${featureLabel(featureId)} repaired: removed ${protocolRepair.removedCount} misapplied sky-observation protocol(s) from non-sky lesson plan(s)`,
        });
      }
    }
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
    observations,
    courseMap: nextCourseMap,
    deliverables: nextDeliverables,
  };
}

export function buildEnrichmentCoverageIssues(enrichmentOutcome) {
  if (!enrichmentOutcome) return [];
  const required = enrichmentOutcome.required === true || enrichmentOutcome.route === 'algi-evidence';
  if (!required && enrichmentOutcome.modelStage !== 'ran') return [];
  const requested = Number(enrichmentOutcome.requestedLessons) || 0;
  const enriched = Number(enrichmentOutcome.enrichedLessons) || 0;
  if (requested <= 0 || enriched >= requested) return [];
  const missingLessons = Array.isArray(enrichmentOutcome.missingLessons)
    ? enrichmentOutcome.missingLessons
        .filter((lesson) => Number.isFinite(Number(lesson)))
        .map((lesson) => Number(lesson))
    : [];
  const missingCount = Math.max(0, requested - enriched);
  const lessonText =
    missingLessons.length > 0
      ? `lesson${missingLessons.length === 1 ? '' : 's'} ${missingLessons.join(', ')}`
      : `${missingCount} lesson${missingCount === 1 ? '' : 's'}`;
  return [
    normalizeReadinessIssue({
      severity: 'blocker',
      featureId: 'courseMap',
      label: 'Enrichment coverage',
      message: required
        ? `Course evidence covered ${enriched}/${requested} lessons; ${lessonText} could not be grounded. Research or attach sources before exporting.`
        : `Enrichment covered ${enriched}/${requested} lessons; ${lessonText} fell back to template. Retry or repair enrichment before exporting a clean package.`,
      source: 'enrichmentCoverage',
      retryable: false,
      autoFixable: false,
      requiresInstructorDecision: false,
    }),
  ];
}

/**
 * P0 findings from the finalize-time quality grade surface through readiness
 * as blockers. They mean the package is structurally exportable but not safe
 * to hand to an instructor; a retry pass cannot repair them because the grader
 * reads frozen compiled output.
 */
export function buildQualityGateIssues(quality) {
  if (quality?.status !== 'graded') return [];
  const blockingP0 = countBlockingQualityFindings(quality);
  if (blockingP0 <= 0) return [];
  return [
    normalizeReadinessIssue({
      severity: 'blocker',
      featureId: 'courseMap',
      label: 'Quality grade',
      message: `Package quality grader found ${blockingP0} blocking P0 finding${blockingP0 === 1 ? '' : 's'} (score ${quality.score}/100, grade ${quality.grade}) — review the quality report before downloading`,
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
  const push = (title, lessons, assessmentId = '') => {
    const normalized = normalizeAssessmentTitle(title);
    if (!normalized) return;
    const lessonNumbers = (Array.isArray(lessons) ? lessons : [lessons]).filter(Number.isInteger);
    candidates.push({
      normalized,
      tokens: new Set(normalized.split(' ')),
      assessmentId: String(assessmentId || '').trim(),
      // null = course-level surface (syllabus grading row): matches any lesson.
      lessonNumbers: lessonNumbers.length > 0 ? lessonNumbers : null,
    });
  };

  for (const assessment of blueprint?.assessments || []) {
    push(assessment?.title, assessment?.lessonNumbers, assessment?.registryId || assessment?.assessmentId);
    if (assessment?.artifact && assessment.artifact !== assessment.title) {
      push(assessment.artifact, assessment?.lessonNumbers, assessment?.registryId || assessment?.assessmentId);
    }
  }

  const doneData = (featureId) => {
    const entry = deliverables?.[featureId];
    return entry?.status === 'done' && entry.data ? entry.data : null;
  };

  const assignments = doneData('assignments');
  for (const brief of assignments?.assignments || []) {
    push(brief?.title, parseLessonNumberFromText(brief?.dueWeek), brief?.assessmentId);
  }
  for (const row of assignments?.courseAssignmentMap || []) {
    push(row?.artifact, parseLessonNumberFromText(row?.week), row?.assessmentId);
  }

  const rubrics = doneData('rubrics');
  for (const rubric of rubrics?.rubrics || []) {
    push(rubric?.title, parseLessonNumberFromText(rubric?.lessonTitle), rubric?.assessmentId);
  }

  const syllabus = doneData('syllabus');
  for (const row of syllabus?.requirements || []) push(row?.name, null, row?.assessmentId);

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
    if (assessment?.id && candidate.assessmentId === assessment.id) return true;
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
 * assessment and lesson); zero-weight in-class checks are satisfied by lesson
 * plans and do not require standalone artifacts. Remaining low-stakes unknowns
 * fold into ONE info-level aggregate. Info issues are NOT merged into readiness
 * (the schema would coerce them to warnings) — they surface through the
 * finalizer result and the run digest.
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
    // The browser authoring route can preserve an older registry kind even
    // after the compiler has recognized one of its own formative sentence
    // signatures. Reconcile against the same semantic classifier used by the
    // manifest/export boundary so a lesson-plan check is not misreported as a
    // missing standalone artifact.
    if (assessment?.kind === 'in-class' || compactCompilerOwnedAssessmentIdentity(title) !== title) {
      continue;
    }
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
  sourceBrief = '',
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
  retryContentQualityWarnings = false,
  enrichmentOutcome = null,
  courseGraph = null,
  blueprint = null,
  expectedSessionMinutes = null,
} = {}) {
  const repairResult = applyDeterministicRepairs({
    courseMap,
    sourceBrief,
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
    ? generateCourseHealthReport(finalCourseMap, validationDeliverables, { expectedSessionMinutes })
    : { findings: [], errorCount: 0, warningCount: 0, infoCount: 0, summary: '' };
  const baseReadiness = evaluateStrictPackageReadiness(
    {
      courseMap: finalCourseMap,
      deliverables: finalDeliverables,
      selectedFeatures,
      columns,
      lessonFilter,
      deliverableConfig,
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
    : retryContentQualityWarnings && contentQualityIssues.length > 0
      ? {
          ...readiness.workspaceReadiness,
          // Keep broad classroom/readability warnings out of the retry queue,
          // but do retry content-quality defects that survived deterministic
          // repair. These are visible export warnings the app can name and
          // often fix with a localized regeneration pass before the user sees
          // a caveated package.
          warnings: contentQualityIssues,
          issues: [...(readiness.workspaceReadiness?.blockers || []), ...contentQualityIssues],
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
    repairObservations: repairResult.observations || [],
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
