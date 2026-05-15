import { getArrayKey } from './syncDependencies';
import { READINESS_BLOCKER, READINESS_FEATURE_LABELS, READINESS_WARNING } from './deliverableReadiness';

const DEFAULT_FEATURES = [
  'courseMap',
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
];

const PER_LESSON_FEATURES = new Set([
  'lessonPlans',
  'slideDecks',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
]);

const RETRYABLE_FEATURES = new Set([
  'assignments',
  'quizBank',
  'discussions',
  'slideDecks',
  'lessonPlans',
  'rubrics',
  'studyGuides',
  'courseFaq',
]);

const ARRAY_ALIASES = {
  lessonPlans: ['lessonPlans', 'plans'],
  slideDecks: ['decks', 'slideDecks'],
  discussions: ['discussions'],
  quizBank: ['quizzes', 'quizBank'],
  studyGuides: ['studyGuides', 'guides'],
  courseFaq: ['faqs', 'courseFaq'],
  assignments: ['assignments'],
  rubrics: ['rubrics'],
};

const QUALITY_CUE_RE =
  /\b(success criteria|criteria|checklist|exemplar|model answer|sample answer|evidence|rubric|strong work|quality|feedback|revision|misconception|transfer|exit ticket)\b/i;
const ACTIVITY_CUE_RE =
  /\b(activity|discussion|practice|check for understanding|think-pair-share|exit ticket|poll|case|scenario|workshop|reflection|debrief|minute paper)\b/i;
const MILESTONE_CUE_RE =
  /\b(milestone|checkpoint|draft|proposal|submit|submission|due|deliverable|revision|peer review)\b/i;
const PERFORMANCE_BAND_RE =
  /\b(exemplary|proficient|developing|emerging|criterion|criteria|rubric|performance band|meets expectations|exceeds expectations)\b/i;
const REVIEW_CUE_RE =
  /\b(review question|self-check|practice question|key term|retrieval|concept check|study strategy)\b/i;

function labelFor(featureId) {
  return READINESS_FEATURE_LABELS[featureId] || (featureId?.startsWith('custom_') ? 'Custom Deliverable' : featureId);
}

function makeIssue(severity, featureId, message, classroomCriterion, details = {}) {
  return {
    severity,
    featureId,
    label: labelFor(featureId),
    message,
    classroomCriterion,
    ...details,
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function collectStrings(value, output = []) {
  if (value == null) return output;
  if (typeof value === 'string' || typeof value === 'number') {
    output.push(String(value));
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output));
    return output;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, output));
  }
  return output;
}

function itemText(value) {
  return collectStrings(value).join(' ').replace(/\s+/g, ' ').trim();
}

function hasMeaningfulValue(value) {
  const raw = itemText(value);
  return raw.length >= 5 && !/^(tbd|todo|n\/a|\?|to be determined|none)$/i.test(raw);
}

function getFeatureArray(featureId, data) {
  if (!data || typeof data !== 'object') return [];
  const directKey = getArrayKey(featureId, data);
  if (directKey && Array.isArray(data[directKey])) return data[directKey];

  for (const key of ARRAY_ALIASES[featureId] || []) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

function getSelectedFeatureIds(selectedFeatures, deliverables = {}) {
  if (Array.isArray(selectedFeatures) && selectedFeatures.length > 0) {
    return [...new Set(selectedFeatures)];
  }

  const generated = Object.entries(deliverables)
    .filter(([, entry]) => entry?.status === 'done')
    .map(([featureId]) => featureId)
    .filter((featureId) => DEFAULT_FEATURES.includes(featureId));
  return [...new Set(['courseMap', ...generated])];
}

function getLessonIndices(courseMap, lessonFilter) {
  const lessons = asArray(courseMap?.lessons);
  if (Array.isArray(lessonFilter)) {
    return lessonFilter.filter((index) => Number.isInteger(index) && index >= 0 && index < lessons.length);
  }
  return lessons.map((_, index) => index);
}

function getScopedPerLessonItems(items, courseMap, lessonIndices) {
  const lessons = asArray(courseMap?.lessons);
  if (!Array.isArray(items)) return [];
  if (items.length >= lessons.length && lessonIndices.length > 0) {
    return lessonIndices.map((index) => items[index]).filter(Boolean);
  }
  return items;
}

function normalizeForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function inferLessonIndicesFromText(courseMap, value) {
  const indices = new Set();
  const message = String(value || '');
  const lessons = asArray(courseMap?.lessons);
  const addLessonNumber = (number) => {
    const index = Number(number) - 1;
    if (Number.isInteger(index) && index >= 0 && index < lessons.length) indices.add(index);
  };

  for (const group of message.matchAll(/\blesson(?:s|\(s\))?\s*[:#-]?\s*((?:\d{1,2}|,|\band\b|&|\s)+)/gi)) {
    for (const number of String(group[1] || '').matchAll(/\d{1,2}/g)) {
      addLessonNumber(number[0]);
    }
  }

  for (const match of message.matchAll(/\blesson\s+(\d+)\b/gi)) {
    addLessonNumber(match[1]);
  }

  const normalizedMessage = normalizeForMatch(message);
  lessons.forEach((lesson, index) => {
    const title = normalizeForMatch(lesson?.title);
    if (title && normalizedMessage.includes(title)) indices.add(index);
  });

  return [...indices];
}

function addRetryCandidate(candidates, deliverables, courseMap, { featureId, lessonIndex, source, message, label }) {
  if (!featureId || !RETRYABLE_FEATURES.has(featureId)) return;
  const entry = deliverables?.[featureId];
  const items = getFeatureArray(featureId, entry?.data);
  const lessonCount = asArray(courseMap?.lessons).length;
  if (entry?.status !== 'done' || !items.length) return;
  if (!Number.isInteger(lessonIndex) || lessonIndex < 0 || lessonIndex >= Math.max(items.length, lessonCount)) return;

  const key = `${featureId}:${lessonIndex}`;
  if (!candidates.has(key)) {
    candidates.set(key, {
      featureId,
      label: label || labelFor(featureId),
      lessonIndex,
      lessonNumber: lessonIndex + 1,
      source,
      message,
    });
  }
}

function getQuestionArray(item) {
  return asArray(item?.questions || item?.qs);
}

function getSlideArray(item) {
  return asArray(item?.slides || item?.sl);
}

function getCriteriaArray(item) {
  return asArray(item?.criteria || item?.cr || item?.rows || item?.performanceCriteria);
}

function getPercent(value) {
  const number = Number(String(value ?? '').match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(number) ? number : 0;
}

function getWeightTotal(items, keys = ['weight', 'wt', 'points', 'pt', 'percent', 'percentage']) {
  return asArray(items).reduce((sum, item) => {
    const key = keys.find((candidate) => item?.[candidate] != null);
    return sum + (key ? getPercent(item[key]) : 0);
  }, 0);
}

function splitSentences(text) {
  return String(text || '')
    .split(/[.!?]\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.split(/\s+/).filter(Boolean).length >= 8 && sentence.length >= 55);
}

function normalizeSentence(sentence) {
  return sentence
    .toLowerCase()
    .replace(/\b\d+\b/g, '#')
    .replace(/[^a-z0-9#\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addBoilerplateWarning(featureId, items, issues) {
  if (!Array.isArray(items) || items.length < 4) return;

  const counts = new Map();
  for (const item of items) {
    const seenInItem = new Set();
    for (const sentence of splitSentences(itemText(item))) {
      const normalized = normalizeSentence(sentence);
      if (!normalized || normalized.length < 45) continue;
      seenInItem.add(normalized);
    }
    seenInItem.forEach((sentence) => counts.set(sentence, (counts.get(sentence) || 0) + 1));
  }

  const repeated = [...counts.entries()].find(([, count]) => count >= 3 && count >= Math.ceil(items.length * 0.4));
  if (!repeated) return;

  issues.push(
    makeIssue(
      READINESS_WARNING,
      featureId,
      `${labelFor(featureId)} repeats the same boilerplate across ${repeated[1]} items; revise with lesson-specific guidance before classroom handoff.`,
      'specificity',
    ),
  );
}

function addRatioWarning({ issues, featureId, missing, total, message, criterion, threshold = 0.4 }) {
  if (total <= 0 || missing / total <= threshold) return;
  issues.push(makeIssue(READINESS_WARNING, featureId, message(missing, total), criterion));
}

function checkCourseMap(courseMap, lessonIndices, issues) {
  const lessons = asArray(courseMap?.lessons);
  if (lessons.length === 0) {
    issues.push(makeIssue(READINESS_BLOCKER, 'courseMap', 'Course Map has no lessons to teach from.', 'coverage'));
    return;
  }

  let weakObjectiveCount = 0;
  let weakAssessmentCount = 0;
  lessonIndices.forEach((lessonIndex) => {
    const lesson = lessons[lessonIndex];
    const lessonText = itemText(lesson);
    const objectiveText = asArray(lesson?.sections)
      .map((section) => itemText(section?.learningObjectives || section?.learningGoals || section?.lo || section?.lg))
      .join(' ');
    const assessmentText = asArray(lesson?.sections)
      .map((section) => itemText(section?.weeklyAssessments || section?.assessment || section?.as))
      .join(' ');

    if (!hasMeaningfulValue(objectiveText)) weakObjectiveCount += 1;
    if (
      !hasMeaningfulValue(assessmentText) &&
      !/\b(quiz|assignment|project|reflection|discussion|exam)\b/i.test(lessonText)
    ) {
      weakAssessmentCount += 1;
    }
  });

  addRatioWarning({
    issues,
    featureId: 'courseMap',
    missing: weakObjectiveCount,
    total: lessonIndices.length,
    criterion: 'instructional alignment',
    message: (missing, total) =>
      `${missing}/${total} lessons have weak or missing learning objectives; strengthen objectives before classroom handoff.`,
    threshold: 0.25,
  });
  addRatioWarning({
    issues,
    featureId: 'courseMap',
    missing: weakAssessmentCount,
    total: lessonIndices.length,
    criterion: 'assessment alignment',
    message: (missing, total) =>
      `${missing}/${total} lessons have weak or missing assessment evidence; add checks for learning before classroom use.`,
    threshold: 0.25,
  });
}

function checkPerLessonCoverage(featureId, items, courseMap, lessonIndices, issues) {
  const expectedCount = lessonIndices.length;
  if (expectedCount === 0) return [];
  const scopedItems = getScopedPerLessonItems(items, courseMap, lessonIndices);

  if (scopedItems.length === 0) {
    issues.push(
      makeIssue(READINESS_BLOCKER, featureId, `${labelFor(featureId)} has no generated lesson items.`, 'coverage'),
    );
    return scopedItems;
  }
  if (scopedItems.length < expectedCount) {
    issues.push(
      makeIssue(
        READINESS_WARNING,
        featureId,
        `${labelFor(featureId)} covers ${scopedItems.length}/${expectedCount} lessons; regenerate missing sections before classroom handoff.`,
        'coverage',
      ),
    );
  }

  return scopedItems;
}

function checkLessonPlans(items, issues) {
  addBoilerplateWarning('lessonPlans', items, issues);
  const missingQualityCues = items.filter((item) => !QUALITY_CUE_RE.test(itemText(item))).length;
  addRatioWarning({
    issues,
    featureId: 'lessonPlans',
    missing: missingQualityCues,
    total: items.length,
    criterion: 'teaching usability',
    message: (missing, total) =>
      `${missing}/${total} lesson plans lack concrete quality criteria, evidence, or model-work guidance for instructors.`,
  });
}

function checkSlideDecks(items, issues) {
  addBoilerplateWarning('slideDecks', items, issues);
  const noInteraction = items.filter((deck) => {
    const slides = getSlideArray(deck);
    return slides.length > 0 && !slides.some((slide) => ACTIVITY_CUE_RE.test(itemText(slide)));
  }).length;
  addRatioWarning({
    issues,
    featureId: 'slideDecks',
    missing: noInteraction,
    total: items.length,
    criterion: 'active learning',
    message: (missing, total) =>
      `${missing}/${total} slide decks lack an activity, check for understanding, or debrief slide.`,
  });
}

function checkDiscussions(items, issues) {
  addBoilerplateWarning('discussions', items, issues);
  const weakFacilitation = items.filter((item) => {
    const probes = asArray(item?.followUpProbes || item?.fp);
    const criteria = asArray(item?.evaluationCriteria || item?.ec);
    return (
      probes.length < 2 || criteria.length < 2 || !/\b(evidence|example|source|claim|reason)\b/i.test(itemText(item))
    );
  }).length;
  addRatioWarning({
    issues,
    featureId: 'discussions',
    missing: weakFacilitation,
    total: items.length,
    criterion: 'facilitation readiness',
    message: (missing, total) =>
      `${missing}/${total} discussion prompts need stronger facilitation probes, evidence requirements, or evaluation criteria.`,
  });
}

function checkQuizBank(items, issues) {
  addBoilerplateWarning('quizBank', items, issues);
  const questions = items.flatMap(getQuestionArray);
  if (questions.length === 0) {
    issues.push(makeIssue(READINESS_BLOCKER, 'quizBank', 'Quiz & Exam Bank has no questions.', 'assessment coverage'));
    return;
  }

  const missingPoints = questions.filter((question) => getPercent(question?.points ?? question?.pt) <= 0).length;
  if (missingPoints > 0) {
    issues.push(
      makeIssue(
        READINESS_WARNING,
        'quizBank',
        `${missingPoints}/${questions.length} quiz questions have missing or zero point values.`,
        'scoring consistency',
      ),
    );
  }

  const weakAnswerGuidance = questions.filter((question) => {
    const text = itemText([
      question?.explanation,
      question?.ex,
      question?.rationale,
      question?.sampleAnswer,
      question?.sa,
    ]);
    return !hasMeaningfulValue(text);
  }).length;
  addRatioWarning({
    issues,
    featureId: 'quizBank',
    missing: weakAnswerGuidance,
    total: questions.length,
    criterion: 'grading usability',
    message: (missing, total) =>
      `${missing}/${total} quiz questions lack answer explanations, rationales, or sample-answer guidance.`,
  });
}

function checkStudyGuides(items, issues) {
  addBoilerplateWarning('studyGuides', items, issues);
  const weakRetrieval = items.filter((guide) => {
    const reviewQuestions = asArray(guide?.reviewQuestions || guide?.rq || guide?.questions || guide?.qs);
    const keyTerms = asArray(guide?.keyTerms || guide?.kt || guide?.terms);
    return reviewQuestions.length < 3 || keyTerms.length < 3 || !REVIEW_CUE_RE.test(itemText(guide));
  }).length;
  addRatioWarning({
    issues,
    featureId: 'studyGuides',
    missing: weakRetrieval,
    total: items.length,
    criterion: 'student study value',
    message: (missing, total) =>
      `${missing}/${total} study guides need stronger key terms, self-check questions, or retrieval practice.`,
  });
}

function checkCourseFaq(items, issues) {
  addBoilerplateWarning('courseFaq', items, issues);
  const weakQuestionCount = items.filter((faq) => getQuestionArray(faq).length < 3).length;
  addRatioWarning({
    issues,
    featureId: 'courseFaq',
    missing: weakQuestionCount,
    total: items.length,
    criterion: 'student support',
    message: (missing, total) => `${missing}/${total} FAQ sections have fewer than 3 student-facing questions.`,
  });
}

function checkAssignments(data, issues) {
  const assignments = getFeatureArray('assignments', data);
  if (assignments.length === 0) {
    issues.push(
      makeIssue(
        READINESS_BLOCKER,
        'assignments',
        'Assignment Briefs have no assignments to give students.',
        'coverage',
      ),
    );
    return;
  }

  addBoilerplateWarning('assignments', assignments, issues);

  const gradeTotal = assignments.reduce(
    (sum, assignment) => sum + getPercent(assignment?.percentOfGrade || assignment?.pg),
    0,
  );
  if (gradeTotal > 0 && (gradeTotal < 95 || gradeTotal > 105)) {
    issues.push(
      makeIssue(
        READINESS_WARNING,
        'assignments',
        `Assignment grade weights sum to ${Math.round(gradeTotal)}%, not about 100%.`,
        'scoring consistency',
      ),
    );
  }

  const missingMilestones = assignments.filter((assignment) => {
    const milestones = asArray(
      assignment?.milestones || assignment?.ms || assignment?.timeline || assignment?.checkpoints,
    );
    return milestones.length === 0 && !MILESTONE_CUE_RE.test(itemText(assignment));
  }).length;
  const missingBands = assignments.filter((assignment) => {
    const bands = asArray(
      assignment?.performanceBands ||
        assignment?.pb ||
        assignment?.evaluationCriteria ||
        assignment?.criteria ||
        assignment?.cr,
    );
    return bands.length < 3 && !PERFORMANCE_BAND_RE.test(itemText(assignment));
  }).length;

  addRatioWarning({
    issues,
    featureId: 'assignments',
    missing: missingMilestones,
    total: assignments.length,
    criterion: 'student execution',
    message: (missing, total) =>
      `${missing}/${total} assignment briefs need clearer milestones, submission steps, or checkpoints.`,
    threshold: 0.25,
  });
  addRatioWarning({
    issues,
    featureId: 'assignments',
    missing: missingBands,
    total: assignments.length,
    criterion: 'grading usability',
    message: (missing, total) =>
      `${missing}/${total} assignment briefs need performance bands or concrete grading criteria.`,
    threshold: 0.25,
  });
}

function checkRubrics(data, issues) {
  const rubrics = getFeatureArray('rubrics', data);
  if (rubrics.length === 0) {
    issues.push(makeIssue(READINESS_BLOCKER, 'rubrics', 'Rubrics have no criteria for grading.', 'grading usability'));
    return;
  }

  addBoilerplateWarning('rubrics', rubrics, issues);

  const thinCriteria = rubrics.filter((rubric) => getCriteriaArray(rubric).length < 3).length;
  addRatioWarning({
    issues,
    featureId: 'rubrics',
    missing: thinCriteria,
    total: rubrics.length,
    criterion: 'grading usability',
    message: (missing, total) => `${missing}/${total} rubrics have fewer than 3 criteria.`,
    threshold: 0.25,
  });

  const badWeights = rubrics.filter((rubric) => {
    const criteria = getCriteriaArray(rubric);
    const total = getWeightTotal(criteria);
    return total > 0 && (total < 95 || total > 105);
  }).length;
  if (badWeights > 0) {
    issues.push(
      makeIssue(
        READINESS_WARNING,
        'rubrics',
        `${badWeights}/${rubrics.length} rubrics have criterion weights that do not total about 100%.`,
        'scoring consistency',
      ),
    );
  }
}

function checkSyllabus(data, issues) {
  if (!data || typeof data !== 'object') {
    issues.push(makeIssue(READINESS_BLOCKER, 'syllabus', 'Syllabus has no generated content.', 'coverage'));
    return;
  }

  const raw = itemText(data);
  const missingSchedule = !/\b(week|lesson|module|schedule|calendar)\b/i.test(raw);
  const missingPolicy = !/\b(policy|attendance|late|ai|accessibility|accommodation|integrity)\b/i.test(raw);
  const missingGrading = !/\b(grade|grading|points|percent|rubric|assessment)\b/i.test(raw);

  if (missingSchedule || missingPolicy || missingGrading) {
    issues.push(
      makeIssue(
        READINESS_WARNING,
        'syllabus',
        'Syllabus needs schedule, grading, and policy language before it is classroom-ready.',
        'student support',
      ),
    );
  }
}

function runFeatureSpecificChecks(featureId, data, courseMap, lessonIndices, issues) {
  if (PER_LESSON_FEATURES.has(featureId)) {
    const items = checkPerLessonCoverage(featureId, getFeatureArray(featureId, data), courseMap, lessonIndices, issues);
    if (items.length === 0) return;

    if (featureId === 'lessonPlans') checkLessonPlans(items, issues);
    if (featureId === 'slideDecks') checkSlideDecks(items, issues);
    if (featureId === 'discussions') checkDiscussions(items, issues);
    if (featureId === 'quizBank') checkQuizBank(items, issues);
    if (featureId === 'studyGuides') checkStudyGuides(items, issues);
    if (featureId === 'courseFaq') checkCourseFaq(items, issues);
    return;
  }

  if (featureId === 'assignments') checkAssignments(data, issues);
  if (featureId === 'rubrics') checkRubrics(data, issues);
  if (featureId === 'syllabus') checkSyllabus(data, issues);
}

export function evaluateClassroomReadiness({
  courseMap,
  deliverables = {},
  selectedFeatures = null,
  lessonFilter = null,
} = {}) {
  const issues = [];
  const featureIds = getSelectedFeatureIds(selectedFeatures, deliverables);
  const lessonIndices = getLessonIndices(courseMap, lessonFilter);
  const checkedFeatures = [];

  if (Array.isArray(lessonFilter) && lessonIndices.length === 0) {
    issues.push(
      makeIssue(READINESS_BLOCKER, 'courseMap', 'Select at least one lesson before classroom handoff.', 'coverage'),
    );
  }

  if (featureIds.includes('courseMap')) {
    checkCourseMap(courseMap, lessonIndices, issues);
    checkedFeatures.push({ featureId: 'courseMap', label: labelFor('courseMap') });
  }

  for (const featureId of featureIds) {
    if (featureId === 'courseMap') continue;
    const entry = deliverables?.[featureId];

    if (!entry) {
      issues.push(
        makeIssue(READINESS_BLOCKER, featureId, `${labelFor(featureId)} has not been generated.`, 'coverage'),
      );
      continue;
    }
    if (entry.status === 'error') {
      issues.push(makeIssue(READINESS_BLOCKER, featureId, `${labelFor(featureId)} failed to generate.`, 'coverage'));
      continue;
    }
    if (entry.status !== 'done') {
      issues.push(
        makeIssue(
          READINESS_BLOCKER,
          featureId,
          `${labelFor(featureId)} is still ${entry.status || 'pending'}.`,
          'coverage',
        ),
      );
      continue;
    }
    if (!entry.data) {
      issues.push(makeIssue(READINESS_BLOCKER, featureId, `${labelFor(featureId)} has no generated data.`, 'coverage'));
      continue;
    }

    checkedFeatures.push({ featureId, label: labelFor(featureId) });
    runFeatureSpecificChecks(featureId, entry.data, courseMap, lessonIndices, issues);
  }

  const blockers = issues.filter((issue) => issue.severity === READINESS_BLOCKER);
  const warnings = issues.filter((issue) => issue.severity === READINESS_WARNING);

  return {
    status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warnings' : 'ready',
    isBlocked: blockers.length > 0,
    blockers,
    warnings,
    issues,
    lessonCount: lessonIndices.length,
    checkedFeatures,
    checkedFeatureCount: checkedFeatures.length,
    featureCount: featureIds.length,
  };
}

export function buildPackageRepairQueue({
  courseMap,
  deliverables = {},
  readiness,
  classroomReadiness,
  healthReport,
  maxActions = 6,
} = {}) {
  const candidates = new Map();
  const packageIssues = [
    ...(readiness?.blockers || []),
    ...(readiness?.warnings || []),
    ...(classroomReadiness?.blockers || []),
    ...(classroomReadiness?.warnings || []),
  ];

  packageIssues.forEach((issue) => {
    inferLessonIndicesFromText(courseMap, issue?.message).forEach((lessonIndex) => {
      addRetryCandidate(candidates, deliverables, courseMap, {
        featureId: issue.featureId,
        lessonIndex,
        label: issue.label,
        message: issue.message,
        source: 'readiness',
      });
    });
  });

  asArray(healthReport?.findings).forEach((finding) => {
    if (finding?.severity !== 'error' && finding?.severity !== 'warning') return;
    const lessonIndices =
      Number.isInteger(finding.lessonIndex) && finding.lessonIndex >= 0
        ? [finding.lessonIndex]
        : inferLessonIndicesFromText(courseMap, finding.message);
    lessonIndices.forEach((lessonIndex) => {
      addRetryCandidate(candidates, deliverables, courseMap, {
        featureId: finding.featureId,
        lessonIndex,
        message: finding.message,
        source: 'validation',
      });
    });
  });

  const limit = Math.max(1, Math.min(8, Number(maxActions) || 6));
  const retryActions = [...candidates.values()].slice(0, limit);
  const issueCount = (readiness?.issues?.length || 0) + (classroomReadiness?.issues?.length || 0);
  const broadIssueCount = Math.max(0, issueCount - retryActions.length);

  return {
    actionCount: retryActions.length,
    retryActionCount: retryActions.length,
    broadIssueCount,
    nextTool: retryActions.length > 0 ? 'retry_package_weak_spots' : null,
    nextAction:
      retryActions.length > 0
        ? `Regenerate ${retryActions.length} localized weak section${retryActions.length === 1 ? '' : 's'}, then finalize again.`
        : broadIssueCount > 0
          ? 'Resolve broad package issues with direct edits or instructor-facing assumptions, then finalize again.'
          : (healthReport?.errorCount || 0) + (healthReport?.warningCount || 0) > 0
            ? 'Fix validation findings, then finalize again.'
            : 'No concrete auto-repair target remains.',
    retryActions,
  };
}

export function summarizeClassroomReadiness(classroomReadiness) {
  if (!classroomReadiness) return 'Classroom readiness unavailable.';
  if (classroomReadiness.blockers?.length > 0) return classroomReadiness.blockers[0].message;
  if (classroomReadiness.warnings?.length > 0) return classroomReadiness.warnings[0].message;
  return 'Materials are ready for classroom handoff.';
}
