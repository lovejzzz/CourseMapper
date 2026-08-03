const PROTOCOL = 'rendered-assessment-coherence-v1';
const VERIFIER_VERSION = 'objective-task-evidence-rubric-bytes-v1';

const TOKEN_STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'and',
  'apply',
  'before',
  'check',
  'course',
  'example',
  'for',
  'from',
  'into',
  'lesson',
  'limitation',
  'name',
  'one',
  'the',
  'this',
  'through',
  'to',
  'using',
  'with',
]);

function cleanText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalized(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value) {
  return [
    ...new Set(
      normalized(value)
        .split(' ')
        .filter((token) => token.length >= 3 && !TOKEN_STOPWORDS.has(token)),
    ),
  ];
}

function tokenCoverage(needle, haystack) {
  const expected = tokens(needle);
  if (expected.length === 0) return 0;
  const actual = new Set(tokens(haystack));
  return expected.filter((token) => actual.has(token)).length / expected.length;
}

function exactVisible(needle, haystack) {
  const expected = normalized(needle);
  return Boolean(expected) && normalized(haystack).includes(expected);
}

function assessmentIdentityVisible(assessment, text) {
  const id = cleanText(assessment?.id);
  if (
    id &&
    new RegExp(`(?:^|[^\\p{L}\\p{N}])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(
      text,
    )
  ) {
    return { passed: true, method: 'assessment-id' };
  }
  if (exactVisible(assessment?.title, text)) return { passed: true, method: 'exact-title' };
  const coverage = tokenCoverage(assessment?.title, text);
  return { passed: coverage >= 0.6, method: 'title-token-coverage', coverage: Number(coverage.toFixed(3)) };
}

function lessonNumberFromArtifact(artifact = {}) {
  if (Number.isInteger(Number(artifact.lessonNumber))) return Number(artifact.lessonNumber);
  const match = cleanText(artifact.path).match(/\bLesson\s+(\d{1,3})\b/i);
  return match ? Number(match[1]) : null;
}

function check(id, passed, reason, extra = {}) {
  return { id, passed: Boolean(passed), reason, ...extra };
}

function artifactReceipt(artifact) {
  if (!artifact) return null;
  return {
    path: cleanText(artifact.path),
    ...(artifact.sha256 ? { sha256: cleanText(artifact.sha256) } : {}),
  };
}

function rubricArtifactFor(artifacts, lessonNumber) {
  return artifacts.find(
    (artifact) => artifact?.featureId === 'rubrics' && lessonNumberFromArtifact(artifact) === lessonNumber,
  );
}

function visibleStudentEvidence(text) {
  const value = cleanText(text);
  const hasEvidenceBoundary = /\b(?:deliverables?|student evidence|evidence|submission requirements?)\b/i.test(value);
  const hasObservableProduct =
    /\b(?:submit|turn in|prepare|produce|create|provide|record|write|present|attach|final file|revision trace|reflection)\b/i.test(
      value,
    );
  return hasEvidenceBoundary && hasObservableProduct;
}

function visibleRubricCriteria(text) {
  const value = cleanText(text);
  const levels = ['excellent', 'proficient', 'developing', 'beginning'].filter((level) =>
    new RegExp(`\\b${level}\\b`, 'i').test(value),
  ).length;
  const observable = /\b(?:criterion|criteria|evidence|reasoning|analysis|revision|decision|demonstrate)\b/i.test(
    value,
  );
  const weights = /\b\d{1,3}\s*%/.test(value);
  return levels >= 2 && observable && weights;
}

/**
 * Reconstruct the assessment-learning chain from the rendered artifacts.
 * Compiler objects are deliberately insufficient: every scored link must be
 * visible in the task/rubric Office bytes supplied by the caller.
 */
export function buildAssessmentCoherenceReceipt({ lessons = [], assessments = [], artifacts = [] } = {}) {
  const lessonByNumber = new Map(
    (Array.isArray(lessons) ? lessons : [])
      .filter((lesson) => Number.isInteger(Number(lesson?.lessonNumber)))
      .map((lesson) => [Number(lesson.lessonNumber), lesson]),
  );
  const artifactByPath = new Map(
    (Array.isArray(artifacts) ? artifacts : [])
      .filter((artifact) => cleanText(artifact?.path))
      .map((artifact) => [cleanText(artifact.path), artifact]),
  );
  const declaredEligible = (Array.isArray(assessments) ? assessments : []).filter(
    (assessment) => assessment?.kind !== 'in-class' && Number.isInteger(Number(assessment?.lesson)),
  );
  const declaredLessons = new Set(declaredEligible.map((assessment) => Number(assessment.lesson)));
  const assignmentLessons = new Set(
    (Array.isArray(artifacts) ? artifacts : [])
      .filter((artifact) => artifact?.featureId === 'assignments')
      .map(lessonNumberFromArtifact)
      .filter(Number.isInteger),
  );
  const rubricLessons = new Set(
    (Array.isArray(artifacts) ? artifacts : [])
      .filter((artifact) => artifact?.featureId === 'rubrics')
      .map(lessonNumberFromArtifact)
      .filter(Number.isInteger),
  );
  // The scoped lesson contract exists before assignment/rubric export and is
  // therefore the denominator root. Rendered artifacts add obligations but
  // can never remove them. Jointly deleting a declaration and both artifacts
  // still creates an explicit 0/5 row for the expected lesson.
  const expectedLessonNumbers = new Set(lessonByNumber.keys());
  const renderedObligationLessons = new Set([...expectedLessonNumbers, ...assignmentLessons, ...rubricLessons]);
  const missingDeclarations = [...renderedObligationLessons]
    .filter((lessonNumber) => !declaredLessons.has(lessonNumber))
    .sort((left, right) => left - right)
    .map((lessonNumber) => ({
      id: `missing-assessment-lesson-${lessonNumber}`,
      title: `Undeclared rendered assessment for lesson ${lessonNumber}`,
      kind: 'missing-declaration',
      lesson: lessonNumber,
      artifact: '',
      missingDeclaration: true,
    }));
  const eligible = [...declaredEligible, ...missingDeclarations];

  const rows = eligible.map((assessment) => {
    const lessonNumber = Number(assessment.lesson);
    const lesson = lessonByNumber.get(lessonNumber);
    const taskArtifact = artifactByPath.get(cleanText(assessment.artifact));
    const rubricArtifact = rubricArtifactFor(artifacts, lessonNumber);
    const taskText = cleanText(taskArtifact?.text);
    const rubricText = cleanText(rubricArtifact?.text);
    const objectives = (Array.isArray(lesson?.objectives) ? lesson.objectives : []).map(cleanText).filter(Boolean);
    const taskIdentity = assessmentIdentityVisible(assessment, taskText);
    const rubricIdentity = assessmentIdentityVisible(assessment, rubricText);
    const objectiveMatches = objectives.filter((objective) => exactVisible(objective, taskText));
    const checks = assessment.missingDeclaration
      ? [
          check(
            'task-identity-visible',
            false,
            'The scoped lesson contract requires an assessment, but its declaration is missing.',
          ),
          check(
            'lesson-objective-visible-in-task',
            false,
            'A missing assessment declaration cannot bind the rendered task to a declared lesson objective.',
          ),
          check(
            'student-evidence-visible',
            false,
            'A missing assessment declaration cannot establish the expected student-evidence contract.',
          ),
          check(
            'matching-rubric-identity-visible',
            false,
            'A missing assessment declaration cannot prove task-to-rubric identity.',
          ),
          check(
            'observable-rubric-criteria-visible',
            false,
            'A missing assessment declaration leaves the rendered rubric outside the declared assessment registry.',
          ),
        ]
      : [
          check(
            'task-identity-visible',
            Boolean(taskArtifact) && taskIdentity.passed,
            taskArtifact
              ? `Declared task identity is ${taskIdentity.passed ? '' : 'not '}visible in the task artifact.`
              : 'Declared task artifact is missing.',
            {
              method: taskIdentity.method,
              ...(taskIdentity.coverage !== undefined ? { coverage: taskIdentity.coverage } : {}),
            },
          ),
          check(
            'lesson-objective-visible-in-task',
            objectives.length > 0 && objectiveMatches.length > 0,
            objectives.length === 0
              ? 'The lesson declares no objective.'
              : `${objectiveMatches.length}/${objectives.length} declared lesson objectives are visible verbatim in the task artifact.`,
            { declaredObjectives: objectives.length, matchedObjectives: objectiveMatches.length },
          ),
          check(
            'student-evidence-visible',
            Boolean(taskArtifact) && visibleStudentEvidence(taskText),
            'The task must name both an evidence/deliverable boundary and an observable student product or action.',
          ),
          check(
            'matching-rubric-identity-visible',
            Boolean(rubricArtifact) && rubricIdentity.passed,
            rubricArtifact
              ? `The same assessment identity is ${rubricIdentity.passed ? '' : 'not '}visible in the lesson rubric.`
              : 'The lesson rubric artifact is missing.',
            {
              method: rubricIdentity.method,
              ...(rubricIdentity.coverage !== undefined ? { coverage: rubricIdentity.coverage } : {}),
            },
          ),
          check(
            'observable-rubric-criteria-visible',
            Boolean(rubricArtifact) && visibleRubricCriteria(rubricText),
            'The rubric must expose weighted observable criteria and at least two performance levels.',
          ),
        ];
    const passedChecks = checks.filter((entry) => entry.passed).length;
    return {
      assessmentId: cleanText(assessment.id),
      title: cleanText(assessment.title),
      lesson: lessonNumber,
      ...(assessment.missingDeclaration ? { missingDeclaration: true } : {}),
      taskArtifact: artifactReceipt(taskArtifact),
      rubricArtifact: artifactReceipt(rubricArtifact),
      checks,
      passedChecks,
      totalChecks: checks.length,
      passed: passedChecks === checks.length,
    };
  });

  const totalChecks = rows.reduce((sum, row) => sum + row.totalChecks, 0);
  const passedChecks = rows.reduce((sum, row) => sum + row.passedChecks, 0);
  return {
    protocol: PROTOCOL,
    verifierVersion: VERIFIER_VERSION,
    eligibleAssessments: rows.length,
    passedAssessments: rows.filter((row) => row.passed).length,
    passedChecks,
    totalChecks,
    coherenceRatio: Number((totalChecks > 0 ? passedChecks / totalChecks : 0).toFixed(3)),
    assessments: rows,
    claimBoundary:
      'This receipt proves visible linkage among declared objectives, task directions, student evidence, and rubric criteria; it does not judge pedagogical wisdom or disciplinary accuracy.',
    antiGaming: [
      'the pre-export scoped lesson contract, declared graded assessments, and rendered assignment/rubric obligations enter the denominator',
      'deleting a declaration for an exported assessment creates an explicit zero-of-five row',
      'jointly deleting a declaration and both rendered artifacts cannot shrink the scoped lesson denominator',
      'missing and wrong-lesson artifacts fail their checks',
      'compiler-only IDs and rubric links earn no credit',
      'each task must expose student evidence and each rubric must expose weighted performance criteria',
    ],
  };
}

export function buildAssessmentCoherenceFromPackage(pkg = {}) {
  return buildAssessmentCoherenceReceipt({
    lessons: pkg.manifest?.lessons || [],
    assessments: pkg.manifest?.assessments || [],
    artifacts: pkg.files,
  });
}

export const ASSESSMENT_COHERENCE_PROTOCOL = PROTOCOL;
export const ASSESSMENT_COHERENCE_VERIFIER_VERSION = VERIFIER_VERSION;
