import {
  instructionalIntentGraphReceiptMatches,
  validateInstructionalIntentGraph,
} from './instructionalIntentGraph.js';

function text(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function finding(severity, code, message, lessonNumber = null) {
  return { severity, code, message, ...(lessonNumber ? { lessonNumber } : {}) };
}

function status(findings) {
  if (findings.some((entry) => entry.severity === 'blocker')) return 'blocked';
  if (findings.some((entry) => entry.severity === 'warning')) return 'warnings';
  return 'pass';
}

// One replayable semantic admission contract for the normalized blueprint.
// The course compiler supplies only its legacy assessment lookup and stored-
// decision predicate; plan validation and lesson binding remain owned here.
export function validateBlueprintSemanticContractBase(
  blueprint = {},
  { findAssessmentForLesson, isUsableLessonCompilerDecision } = {},
) {
  const findings = [];
  const lessons = Array.isArray(blueprint.lessons) ? blueprint.lessons : [];
  const assessments = Array.isArray(blueprint.assessments) ? blueprint.assessments : [];
  const planAdmission = validateInstructionalIntentGraph(blueprint.instructionalIntentGraph);
  const expectedLessonCount = Number.isFinite(Number(blueprint.totalLessons))
    ? Number(blueprint.totalLessons)
    : lessons.length;

  if (!text(blueprint.courseName))
    findings.push(finding('blocker', 'courseName', 'Blueprint is missing a course name.'));
  if (lessons.length === 0) findings.push(finding('blocker', 'lessonCoverage', 'Blueprint has no lessons.'));
  if (expectedLessonCount !== lessons.length) {
    findings.push(
      finding(
        'blocker',
        'lessonCoverage',
        `Blueprint totalLessons is ${expectedLessonCount}, but ${lessons.length} lesson(s) are present.`,
      ),
    );
  }
  if (assessments.length === 0) {
    findings.push(finding('blocker', 'assessmentCoverage', 'Blueprint has no assessment anchors.'));
  }
  if (planAdmission.status !== 'approved') {
    findings.push(
      finding(
        'blocker',
        'instructionalIntentGraph',
        `Instructional planning has not earned draft admission: ${planAdmission.blockers.slice(0, 3).join(', ')}.`,
      ),
    );
  }
  if (!instructionalIntentGraphReceiptMatches(blueprint.instructionalIntentGraph)) {
    findings.push(
      finding(
        'blocker',
        'instructionalIntentReceipt',
        'Instructional planning receipt is missing or does not match the exact approved plan.',
      ),
    );
  }

  lessons.forEach((lesson, index) => {
    const lessonNumber = lesson.lessonNumber || (Number.isFinite(lesson.lessonIndex) ? lesson.lessonIndex + 1 : null);
    const sourceFields = Array.isArray(lesson.sourceEvidenceTrace?.sourceFields)
      ? lesson.sourceEvidenceTrace.sourceFields
      : [];
    const sourceAnchors = Array.isArray(lesson.sourceAnchors) ? lesson.sourceAnchors : [];
    const assessment = findAssessmentForLesson?.(assessments, lesson, index);
    const plannedIntent = blueprint.instructionalIntentGraph?.lessonIntents?.find((intent) => intent?.id === lesson.id);

    if (!lesson.id || !lessonNumber || !text(lesson.title)) {
      findings.push(finding('blocker', 'lessonIdentity', 'Lesson is missing id, number, or title.', lessonNumber));
    }
    if (!Array.isArray(lesson.outcomes) || lesson.outcomes.length === 0) {
      findings.push(finding('blocker', 'outcomes', 'Lesson is missing learning outcomes.', lessonNumber));
    }
    if (!Array.isArray(lesson.keyConcepts) || lesson.keyConcepts.length === 0) {
      findings.push(finding('blocker', 'keyConcepts', 'Lesson is missing source-grounded concepts.', lessonNumber));
    }
    if (!text(lesson.studentArtifact)) {
      findings.push(
        finding('blocker', 'studentArtifact', 'Lesson is missing the student-facing artifact.', lessonNumber),
      );
    }
    if (!Array.isArray(lesson.successCriteria) || lesson.successCriteria.length < 2) {
      findings.push(finding('blocker', 'successCriteria', 'Lesson is missing success criteria.', lessonNumber));
    }
    if (
      !plannedIntent ||
      lesson.instructionalIntentReceiptSha256 !== blueprint.instructionalIntentGraph?.receipt?.exactInputSha256
    ) {
      findings.push(
        finding(
          'blocker',
          'lessonInstructionalIntent',
          'Lesson is not bound to the exact approved instructional plan.',
          lessonNumber,
        ),
      );
    }
    if (!lesson.confidence?.level || !Number.isFinite(lesson.confidence?.score)) {
      findings.push(finding('blocker', 'confidence', 'Lesson is missing source confidence.', lessonNumber));
    }
    if (
      sourceAnchors.length === 0 ||
      sourceFields.length < 4 ||
      !lesson.sourceEvidenceTrace?.sourceRowLabel ||
      !lesson.sourceEvidenceTrace?.unsupportedInferencePolicy ||
      sourceFields.some((field) => !field?.field || !field.sourceColumn || !field.source || !field.compiledValue)
    ) {
      findings.push(
        finding(
          'blocker',
          'sourceTrace',
          'Lesson is missing inspectable source anchors and field-level provenance.',
          lessonNumber,
        ),
      );
    }
    if (
      !lesson.evidencePlan?.sourceCue ||
      !lesson.evidencePlan?.evidenceRequirement ||
      !lesson.evidencePlan?.limitationCue
    ) {
      findings.push(finding('blocker', 'evidencePlan', 'Lesson is missing evidence plan.', lessonNumber));
    }
    if (
      !Array.isArray(lesson.sourceUsePlan?.approvedSources) ||
      lesson.sourceUsePlan.approvedSources.length === 0 ||
      !lesson.sourceUsePlan?.citationExpectation ||
      !lesson.sourceUsePlan?.noInventedSources ||
      !lesson.sourceUsePlan?.localReplacementCue ||
      !lesson.sourceUsePlan?.copyrightReviewCue
    ) {
      findings.push(
        finding(
          'blocker',
          'sourceUsePlan',
          'Lesson is missing source-use, citation, and no-invention boundaries.',
          lessonNumber,
        ),
      );
    }
    if (lesson.compilerDecision && !isUsableLessonCompilerDecision?.(lesson.compilerDecision)) {
      findings.push(
        finding(
          'warning',
          'compilerDecision',
          'Stored compiler decision is incomplete; the compiler will rebuild it during hydration.',
          lessonNumber,
        ),
      );
    }
    if (!assessment) {
      const registryCoversLesson =
        Array.isArray(blueprint.assessmentRegistry) &&
        blueprint.assessmentRegistry.some((entry) => entry.dueSession === lessonNumber);
      if (!registryCoversLesson) {
        findings.push(
          finding(
            'blocker',
            'assessmentCoverage',
            'Lesson has no assessment anchor for downstream assignments and rubrics.',
            lessonNumber,
          ),
        );
      }
    } else if (!text(assessment.artifact || lesson.studentArtifact)) {
      findings.push(finding('blocker', 'assessmentAnchor', 'Assessment anchor is missing an artifact.', lessonNumber));
    } else if (!Array.isArray(assessment.criteria) || assessment.criteria.length < 3) {
      findings.push(
        finding(
          'warning',
          'assessmentCriteria',
          'Assessment anchor has sparse criteria; compiler will derive rubric structure from lesson criteria.',
          lessonNumber,
        ),
      );
    }
  });

  const blockerCount = findings.filter((entry) => entry.severity === 'blocker').length;
  const warningCount = findings.filter((entry) => entry.severity === 'warning').length;
  return {
    version: 1,
    contractType: 'semantic-blueprint',
    status: status(findings),
    blockerCount,
    warningCount,
    lessonCount: lessons.length,
    assessmentCount: assessments.length,
    minimumBlueprintFields: [
      'courseName',
      'lessons.id',
      'lessons.title',
      'lessons.outcomes',
      'lessons.keyConcepts',
      'lessons.studentArtifact',
      'lessons.successCriteria',
      'lessons.sourceEvidenceTrace',
      'lessons.sourceUsePlan',
      'lessons.evidencePlan',
      'instructionalIntentGraph.lessonIntents',
      'instructionalIntentGraph.receipt.exactInputSha256',
      'assessments.artifact',
    ],
    compilerOwnedFields: [
      'courseArc',
      'conceptDependencyGraph',
      'masteryEvidenceMap',
      'evidenceResponseMap',
      'objectiveEvidenceMap',
      'courseWorkload',
      'assessmentArchitecture',
      'classroomHandoffPlan',
      'classroomDryRunPlan',
      'classroomEvidenceLoopPlan',
      'instructorFeedbackLoadPlan',
      'blueprintAssumptionLedger',
      'packageCoherenceMatrix',
      'blueprintReviewSurface',
      'compilerDecisionMatrix',
      'receipts',
    ],
    instructionalPlanStatus: planAdmission.status,
    instructionalPlanReceiptSha256: blueprint.instructionalIntentGraph?.receipt?.exactInputSha256 || null,
    findings,
  };
}
