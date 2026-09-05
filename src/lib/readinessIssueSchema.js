export const READINESS_ISSUE_SCHEMA_VERSION = 1;

const FEATURE_LABELS = {
  courseMap: 'Course Map',
  syllabus: 'Syllabus',
  lessonPlans: 'Lesson Plans',
  slideDecks: 'Slide Decks',
  assignments: 'Assignment Briefs',
  rubrics: 'Rubrics',
  discussions: 'Discussion Prompts',
  quizBank: 'Quiz & Exam Bank',
  studyGuides: 'Study Guides',
  courseFaq: 'Course FAQ',
  export: 'Export',
};

const RETRYABLE_FEATURES = new Set([
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
]);

const SAFE_REPAIR_RE =
  /\b(empty|missing|placeholder|grade weights?|related lesson|metadata gap|speaker notes?|unsupported FAQ|fewer than|rationale|point|alt text|deadline|category|coverage)\b/i;

function getLabel(featureId, fallback) {
  if (fallback) return fallback;
  return (
    FEATURE_LABELS[featureId] || (featureId?.startsWith?.('custom_') ? 'Custom Deliverable' : featureId || 'Material')
  );
}

function getLessonIndex(issue = {}) {
  if (Number.isInteger(issue.lessonIndex)) return issue.lessonIndex;
  if (Number.isInteger(issue.target?.lessonIndex)) return issue.target.lessonIndex;
  if (Number.isInteger(issue.lessonNumber)) return issue.lessonNumber - 1;
  return null;
}

function inferAutoFixable(issue = {}) {
  if (typeof issue.autoFixable === 'boolean') return issue.autoFixable;
  if (issue.safeAutoRepair === true || issue.repairable === true) return true;
  if (issue.featureId === 'courseMap' && issue.target?.type === 'courseMapCell') return true;
  if (SAFE_REPAIR_RE.test(issue.message || '')) return true;
  return false;
}

function inferRetryable(issue = {}) {
  if (typeof issue.retryable === 'boolean') return issue.retryable;
  if (issue.source === 'finalizerRetry') return true;
  if (!RETRYABLE_FEATURES.has(issue.featureId)) return false;
  if (Number.isInteger(getLessonIndex(issue))) return true;
  return issue.severity === 'blocker' || issue.severity === 'warning';
}

export function normalizeReadinessIssue(issue = {}) {
  const severity = issue.severity === 'blocker' || issue.severity === 'error' ? 'blocker' : 'warning';
  const featureId = issue.featureId || 'courseMap';
  const lessonIndex = getLessonIndex(issue);
  const autoFixable = inferAutoFixable({ ...issue, severity, featureId });
  const retryable = inferRetryable({ ...issue, severity, featureId, lessonIndex });
  const requiresInstructorDecision =
    typeof issue.requiresInstructorDecision === 'boolean'
      ? issue.requiresInstructorDecision
      : !autoFixable && !retryable;

  return {
    ...issue,
    issueSchemaVersion: READINESS_ISSUE_SCHEMA_VERSION,
    severity,
    featureId,
    lessonIndex,
    label: getLabel(featureId, issue.label),
    message: issue.message || 'Readiness issue found.',
    autoFixable,
    retryable,
    requiresInstructorDecision,
  };
}

export function normalizeReadinessIssues(issues = []) {
  return issues.filter(Boolean).map((issue) => normalizeReadinessIssue(issue));
}
