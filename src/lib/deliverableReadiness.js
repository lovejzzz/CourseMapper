import { getArrayKey } from './syncDependencies';
import { classifyAssessmentKind } from './courseGraph/deriveFromCourseMap.js';
import { deriveEvaluateDesign } from './leanCourseMap.js';
import { findPublishabilityPlaceholders } from './publishabilityPlaceholders';
import { normalizeReadinessIssue, normalizeReadinessIssues } from './readinessIssueSchema';
import {
  normalizeAssignmentAssessmentAlignment,
  normalizeAssignmentGradeWeights,
  normalizeAssignmentLessonAlignment,
  normalizeCourseFaqCategories,
  normalizeCourseFaqQuestionCounts,
  normalizeCourseFaqQuestionVariety,
  normalizeDiscussionPromptFields,
  normalizeLessonPlanPublishability,
  normalizeLessonPlanTeachingSupport,
  normalizeQuizBankIndex,
  normalizeQuizBankQuestionCounts,
  normalizeQuizBankPointTotals,
  normalizeQuizBankPublishability,
  normalizeQuizBankQuestions,
  normalizeQuizBankRationales,
  normalizeQuizAssessmentAlignment,
  normalizeRubricCoverage,
  normalizeRubricAssessmentAlignment,
  normalizeRubricSupport,
  normalizeSlideDeckAccessibility,
  normalizeSlideDeckSpeakerNotes,
  normalizeStudyGuideQuestions,
  normalizeStudyGuideSupport,
  normalizeSyllabusCompleteness,
  normalizeSyllabusPublishability,
} from './deliverablePostProcess';

export const READINESS_BLOCKER = 'blocker';
export const READINESS_WARNING = 'warning';

export const READINESS_FEATURE_LABELS = {
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
};

const PER_LESSON_FEATURES = new Set([
  'lessonPlans',
  'slideDecks',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
]);

const DEFAULT_FEATURES = [
  'courseMap',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
  'syllabus',
];

const DEFAULT_COURSE_MAP_COLUMN_KEYS = [
  'learningGoals',
  'topicSection',
  'learningObjectives',
  'weeklyAssessments',
  'asyncActivities',
  'syncActivities',
  'technologyNeeded',
  'presentationFormat',
  'supportingResources',
  'evaluateDesign',
];

const FAQ_CATEGORIES = new Set([
  'Course Logistics',
  'Assignment Clarification',
  'Concept Explanation',
  'Technical Help',
  'Assessment Prep',
]);

function escapeRegexLiteral(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PROMPT_ARTIFACT_TOPIC_LABELS = [
  'course map',
  'syllabus',
  'evidence-rich lesson plans',
  'lesson plans',
  'lesson objectives',
  'learning objectives',
  'slide decks',
  'assignment briefs',
  'quiz,assignment',
  'quiz, assignment',
  'quiz assignment',
  'quiz/assignment',
  'quiz and assignment',
  'quiz & assignment',
  'assignments',
  'rubric-driven assignments',
  'rubrics',
  'discussion prompts',
  'scenario quizzes',
  'quizzes',
  'quiz and exam bank',
  'quiz & exam bank',
  'quiz bank',
  'study guides',
  'course faq',
  'final capstone presentation',
  'final capstone presentations',
  'capstone presentation',
  'capstone presentations',
  'worked examples',
  'misconceptions',
  'instructor handoff notes',
];

const PROMPT_ARTIFACT_TOPIC_SET = new Set(PROMPT_ARTIFACT_TOPIC_LABELS);
const PROMPT_ARTIFACT_RESOURCE_SET = new Set(
  PROMPT_ARTIFACT_TOPIC_LABELS.filter((label) => label !== 'worked examples'),
);
const NUMBERED_PROMPT_ARTIFACT_TOPIC_RE = new RegExp(
  `\\b\\d+(?:\\.\\d+)+\\s*:\\s*(?:${PROMPT_ARTIFACT_TOPIC_LABELS.map(escapeRegexLiteral).join('|')})\\b`,
  'i',
);
const ASSESSMENT_LABEL_COURSE_MAP_RE =
  /^(?:lesson\s+\d{1,3}\s*[:.]?\s*)?(?:(?:quiz|exam|assignment|lab|rubric)\s*[,/&]\s*(?:quiz|exam|assignment|lab|rubric)|(?:evidence check|quick evidence check|applied problem|practice brief|concept transfer|exit ticket|weekly assessment|practice response|assessment|quiz|exam|assignment brief|rubric)\b)/i;
const ASSESSMENT_WEIGHT_CUE_RE = /(?:\(\s*\d{1,3}\s*%\s*\)|\b\d{1,3}\s*%\b)/;
const ASSESSMENT_ACTIVITY_CUE_RE =
  /\b(?:studio critique|portfolio review|prototype presentation|usability test|design journal|critique session)\b/i;
const ASSESSMENT_WEEK_LABEL_CUE_RE =
  /\b(?:quiz|exam|assignment|lab|rubric)\s*[:—–-]\s*week\s*\d{1,3}\b(?:\s*[,/|&]\s*(?:quiz|exam|assignment|lab|rubric)\s*[:—–-]\s*week\s*\d{1,3}\b)+/i;
const ASSESSMENT_ARTIFACT_PAIR_RE =
  /^(?:lesson\s+\d{1,3}\s*[:.]?\s*)?(?:quiz|exam|assignment|lab|rubric)\s*[,/&]\s*(?:quiz|exam|assignment|lab|rubric)$/i;
const ASSESSMENT_LABEL_IDENTITY_REFERENCE_RE =
  /\b(?:evidence check|quick evidence check|applied problem|practice brief|concept transfer|exit ticket|weekly assessment|practice response|assessment|quiz|exam|assignment brief|rubric)\b\s*[:—–-]\s*[^.;\n]{0,160}(?:\(\s*\d{1,3}\s*%\s*\)|\b\d{1,3}\s*%\b)/i;
const ASSESSMENT_WEEK_LABEL_IDENTITY_REFERENCE_RE =
  /\b(?:quiz|exam|assignment|lab|rubric)\s*[:—–-]\s*week\s*\d{1,3}\b(?:\s*[,/|&]\s*(?:quiz|exam|assignment|lab|rubric)\s*[:—–-]\s*week\s*\d{1,3}\b)+/i;
const INSTRUCTIONAL_DESIGN_COURSE_RE =
  /\b(?:instructional design|course design|curriculum design|assessment design|teacher education|teaching methods|pedagogy|education)\b/i;
const PROMPT_ARTIFACT_EMBEDDED_COURSE_MAP_KEYS = new Set([
  'learningGoals',
  'learningObjectives',
  'weeklyAssessments',
  'asyncActivities',
  'syncActivities',
  'supportingResources',
  'evaluateDesign',
]);
const PROMPT_ARTIFACT_EMBEDDED_CONTEXT_RE =
  /\b(?:trace how|describe how|explain how|organize|relationship between|focus(?:es)? on|connect|apply|review|prepare notes?|key ideas?|course activities?|course-relevant decision|exit ticket|evidence check|source evidence|student-facing|teach(?:ing)?|learn(?:ing)?)\b/i;
const PROMPT_ARTIFACT_GENERIC_CONTEXT_RE =
  /\b(?:content|concepts?|lessons?|objectives?|assessments?|activities|materials?|readings?|resources?|examples?)\b/i;
const COURSE_MAP_REGISTRY_REFERENCE_SUFFIX_RE =
  /\s*(?:→|->)\s*(?:course\s+map|syllabus|lesson\s+plans|slide\s+decks|assignment\s+briefs|rubrics|discussion\s+prompts|quiz\s*(?:&|and)\s*exam\s*bank|study\s+guides|course\s+faq)(?:\s*\/\s*lesson\s*\d{1,2})?\b[^\n]*/gi;
const PROJECT_MANAGEMENT_COURSE_RE =
  /\bproject management\b|\bproject charter\b|\bstakeholder management\b|\bscope management\b|\brisk management\b|\bwork breakdown structure\b|\bcritical path\b|\bgantt\b|\bagile project\b|\bscrum\b|\bproject schedule\b|\bproject lifecycle\b|\bproject life cycle\b/i;
const PROJECT_MANAGEMENT_TOPIC_SEQUENCE = [
  'project life cycle and charter purpose',
  'stakeholder roles and sponsor needs',
  'scope management and requirements',
  'work breakdown structure and scheduling',
  'budgeting and earned value',
  'risk register and mitigation planning',
  'quality standards and deliverable acceptance',
  'resource planning and team roles',
  'stakeholder communication and reporting',
  'procurement and vendor decisions',
  'agile planning and retrospectives',
  'project closure and stakeholder presentation',
];
const UX_DESIGN_TOPIC_SEQUENCE = [
  'UX problem framing and studio orientation',
  'user research planning and interview notes',
  'affinity mapping and insight statements',
  'information architecture and navigation choices',
  'accessibility and interface content review',
  'usability test planning and task scenarios',
  'findings prioritization and issue severity',
  'microcopy and recovery-path revision',
  'interaction data and evidence brief',
  'revision planning from critique feedback',
  'design rationale and tradeoff defense',
  'portfolio case reflection and handoff',
];
const COMPUTER_SCIENCE_TOPIC_SEQUENCE = [
  'course orientation and computational thinking',
  'variables, expressions, and data types',
  'conditionals and boolean logic',
  'iteration with while and for loops',
  'functions and decomposition',
  'lists and sequence processing',
  'dictionaries and structured data',
  'strings and text processing',
  'files and exceptions',
  'modules and libraries',
  'testing and debugging',
  'data analysis with Python',
  'object-oriented programming basics',
  'final project design and implementation',
  'project presentation and code review',
];

function labelFor(featureId) {
  return READINESS_FEATURE_LABELS[featureId] || (featureId?.startsWith('custom_') ? 'Custom Deliverable' : featureId);
}

function makeIssue(severity, featureId, message, details = {}) {
  return normalizeReadinessIssue({ severity, featureId, label: labelFor(featureId), message, ...details });
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(' ');
  return String(value || '');
}

function getFeatureArray(featureId, data) {
  if (!data || typeof data !== 'object') return [];
  const directKey = getArrayKey(featureId, data);
  if (directKey && Array.isArray(data[directKey])) return data[directKey];

  const aliases = {
    lessonPlans: ['lessonPlans', 'plans'],
    slideDecks: ['decks', 'slideDecks'],
    discussions: ['discussions'],
    quizBank: ['quizzes', 'quizBank'],
    studyGuides: ['studyGuides', 'guides'],
    courseFaq: ['faqs', 'courseFaq'],
    assignments: ['assignments'],
    rubrics: ['rubrics'],
  };

  for (const key of aliases[featureId] || []) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

function getSelectedFeatureIds(selectedFeatures, deliverables = {}) {
  const selected = Array.isArray(selectedFeatures) && selectedFeatures.length > 0 ? selectedFeatures : null;
  if (selected) return [...new Set(selected)];
  const generated = Object.entries(deliverables)
    .filter(([, entry]) => entry?.status === 'done')
    .map(([featureId]) => featureId);
  return [...new Set(['courseMap', ...generated.filter((id) => DEFAULT_FEATURES.includes(id))])];
}

function getLessonIndices(courseMap, lessonFilter) {
  const lessons = asArray(courseMap?.lessons);
  if (Array.isArray(lessonFilter)) {
    return lessonFilter.filter((index) => index >= 0 && index < lessons.length);
  }
  return lessons.map((_, index) => index);
}

function filterLessonArray(items, lessonIndices) {
  if (!Array.isArray(items)) return items;
  return items.filter((_, index) => lessonIndices.includes(index));
}

/**
 * v0.14.1 (3.2): registry-mode deliverables break the one-item-per-lesson
 * positional assumption (N briefs per lesson, exam entries appended to the
 * quiz bank). Items that declare their own integer `lessonNumber` scope by
 * it. Older items often carry the same identity only in `lessonTitle`,
 * `week`, or `relatedLessons`; read those before using positional legacy
 * scoping so a repair-appended Lesson 5 item at array index 2 can never leak
 * into the Lesson 3 export.
 */
function lessonAwareItemNumber(item) {
  if (!item || typeof item !== 'object') return null;
  for (const value of [item.lessonNumber, item.ln, item.sourceLessonNumber]) {
    const number = Number(value);
    if (Number.isInteger(number) && number > 0) return number;
  }
  const identityText = [
    item.lessonTitle,
    item.lt,
    item.weekNumber,
    item.week,
    item.dueWeek,
    ...(Array.isArray(item.relatedLessons) ? item.relatedLessons : []),
    ...(Array.isArray(item.rl) ? item.rl : []),
  ]
    .filter(Boolean)
    .join(' ');
  const match = identityText.match(/\b(?:lesson|week|module|unit|session)\s*(\d{1,3})\b/i);
  return match ? Number(match[1]) : null;
}

function filterLessonAwareArray(items, lessonIndices, courseMap = null) {
  if (!Array.isArray(items)) return items;
  const lessonNumbers = new Set(
    lessonIndices.flatMap((index) => {
      const sourceNumber = Number(courseMap?.lessons?.[index]?.sourceLessonNumber);
      return Number.isInteger(sourceNumber) && sourceNumber > 0 ? [index + 1, sourceNumber] : [index + 1];
    }),
  );
  return items.filter((item, index) => {
    const explicitLessonNumber = lessonAwareItemNumber(item);
    return explicitLessonNumber ? lessonNumbers.has(explicitLessonNumber) : lessonIndices.includes(index);
  });
}

// Features whose registry-mode arrays can hold several items per lesson.
const LESSON_AWARE_SCOPE_KEYS = new Set(['assignments', 'rubrics', 'quizzes', 'quizBank']);

export function scopeCourseMapToLessons(courseMap, lessonFilter) {
  if (!Array.isArray(lessonFilter) || !courseMap?.lessons) return courseMap;
  return {
    ...courseMap,
    lessons: filterLessonArray(courseMap.lessons, lessonFilter),
  };
}

export function scopeDeliverableDataToLessons(featureId, data, lessonFilter, courseMap = null) {
  if (!Array.isArray(lessonFilter) || !data || typeof data !== 'object') return data;

  const scopedArrayKeys = {
    lessonPlans: ['lessonPlans', 'plans'],
    slideDecks: ['decks', 'slideDecks'],
    rubrics: ['rubrics'],
    quizBank: ['quizzes', 'quizBank'],
    discussions: ['discussions'],
    assignments: ['assignments'],
    studyGuides: ['studyGuides', 'guides'],
    courseFaq: ['faqs', 'courseFaq'],
  };

  const keys = scopedArrayKeys[featureId];
  if (!keys) return data;

  let scopedData = data;
  let changed = false;
  for (const key of keys) {
    if (!Array.isArray(scopedData[key])) continue;
    const filter = LESSON_AWARE_SCOPE_KEYS.has(key)
      ? (items, indices) => filterLessonAwareArray(items, indices, courseMap)
      : filterLessonArray;
    scopedData = {
      ...scopedData,
      [key]: filter(scopedData[key], lessonFilter),
    };
    changed = true;
  }

  return changed ? scopedData : data;
}

function stableJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return '';
  }
}

function humanizeRepairKey(key) {
  return String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
}

function summarizeRepairResult(result) {
  if (!result || typeof result !== 'object') return [];
  return Object.entries(result)
    .filter(([key]) => key !== 'data' && key !== 'arrayKey' && key !== 'target')
    .flatMap(([key, value]) => {
      if (typeof value === 'number' && value > 0) return [`${humanizeRepairKey(key)}: ${value}`];
      if (typeof value === 'boolean' && value) return [humanizeRepairKey(key)];
      if (Array.isArray(value) && value.length > 0) return [`${humanizeRepairKey(key)}: ${value.join(', ')}`];
      return [];
    });
}

function applyRepair(current, summaries, label, repairFn, ...args) {
  const before = stableJson(current);
  const result = repairFn(current, ...args);
  const next = result?.data ?? current;
  if (stableJson(next) !== before) {
    const details = summarizeRepairResult(result);
    summaries.push(details.length > 0 ? `${label} (${details.join('; ')})` : label);
  }
  return next;
}

function courseMapTopicList(value) {
  return String(value || '')
    .split(/\n|;|\||\u2022/)
    .map((item) => text(item))
    .filter(Boolean);
}

function titleCandidateFromCourseMapTopic(value) {
  const source = text(value);
  if (!source) return '';
  const slashParts = source
    .split('/')
    .map((part) => text(part))
    .filter(Boolean);
  let candidate =
    slashParts.length > 1
      ? /^(?:studio\s+seminar|clinical\s+placement|field\s+application)$/i.test(slashParts[0])
        ? slashParts[slashParts.length - 1]
        : slashParts.join(' and ')
      : source;
  const commaParts = candidate
    .split(',')
    .map((part) => text(part))
    .filter(Boolean);
  if (slashParts.length > 1 && commaParts.length >= 6) {
    candidate = commaParts.slice(-5).join(', ');
  }
  return text(candidate.replace(/^(?:studio\s+seminar|clinical\s+placement|field\s+application)\s*[:.-]?\s*/i, ''))
    .replace(/^(?:lesson|week|module|unit|session)\s*\d{1,3}\s*[:.-]?\s*/i, '')
    .replace(/^\d+(?:\.\d+)*\s*[:.)-]\s*/i, '')
    .replace(/^(?:and\s+)+/i, '')
    .replace(/[.?!;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isInstructionalDesignCourse(courseMap) {
  const context = [
    courseMap?.courseName,
    ...(Array.isArray(courseMap?.lessons) ? courseMap.lessons.map((lesson) => lesson?.title) : []),
  ]
    .map(text)
    .join(' ');
  return INSTRUCTIONAL_DESIGN_COURSE_RE.test(context);
}

function normalizePromptArtifactTopic(value) {
  return text(value)
    .replace(/^(?:lesson|week|module|unit|session)\s*\d{1,3}\s*[:.-]?\s*/i, '')
    .replace(/^\d+(?:\.\d+)*\s*[:.)-]\s*/i, '')
    .replace(/[^\w& -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function splitPromptArtifactResourceLines(value) {
  if (Array.isArray(value)) return value.flatMap(splitPromptArtifactResourceLines);
  return text(value)
    .split(/\n|;|\||\u2022|(?=\b\d+\s*[.)]\s*)/)
    .map((line) => normalizePromptArtifactTopic(line))
    .filter(Boolean);
}

function countEmbeddedPromptArtifactResourceLabels(value) {
  const normalized = normalizePromptArtifactTopic(value);
  if (!normalized) return 0;
  let count = 0;
  for (const label of PROMPT_ARTIFACT_RESOURCE_SET) {
    const pattern = new RegExp(`(?:^|\\b)${escapeRegexLiteral(label)}(?:\\b|$)`, 'i');
    if (pattern.test(normalized)) count += 1;
  }
  return count;
}

function stripCourseMapRegistryReferenceSuffix(value) {
  return text(value).replace(COURSE_MAP_REGISTRY_REFERENCE_SUFFIX_RE, '').trim();
}

function hasEmbeddedPromptArtifactTopic(value) {
  const raw = stripCourseMapRegistryReferenceSuffix(value);
  if (!raw) return false;
  const labelCount = countEmbeddedPromptArtifactResourceLabels(raw);
  if (labelCount >= 2) return true;
  if (labelCount === 0) return false;
  return PROMPT_ARTIFACT_EMBEDDED_CONTEXT_RE.test(raw) || PROMPT_ARTIFACT_GENERIC_CONTEXT_RE.test(raw);
}

function isPromptArtifactTopic(value, courseMap) {
  if (isInstructionalDesignCourse(courseMap)) return false;
  return PROMPT_ARTIFACT_TOPIC_SET.has(normalizePromptArtifactTopic(value));
}

function normalizeCourseMapTopicIdentity(value) {
  return genericTopicText(value).toLowerCase();
}

function isCourseTitleOnlyTopic(value, courseMap) {
  const courseTitle = normalizeCourseMapTopicIdentity(courseMap?.courseName);
  if (!courseTitle) return false;
  return normalizeCourseMapTopicIdentity(value) === courseTitle;
}

function isDomainCourseTitleOnlyWeakTopic(value, courseMap) {
  if (!isCourseTitleOnlyTopic(value, courseMap)) return false;
  return UX_DESIGN_COURSE_MAP_RE.test(text(courseMap?.courseName));
}

function isCourseTitlePrefixedFallbackTopic(value, courseMap) {
  const courseTitle = normalizeCourseMapTopicIdentity(courseMap?.courseName);
  if (!courseTitle || !UX_DESIGN_COURSE_MAP_RE.test(text(courseMap?.courseName))) return false;
  const candidate = normalizeCourseMapTopicIdentity(value);
  if (!candidate || candidate === courseTitle) return false;
  if (!candidate.startsWith(`${courseTitle} `)) return false;
  const suffix = candidate.slice(courseTitle.length).trim();
  const suffixWords = suffix.split(/\s+/).filter(Boolean);
  return suffixWords.length > 0 && suffixWords.length <= 8;
}

function isConjoinedAssessmentEventTopic(value) {
  const candidate = genericTopicText(value);
  if (!candidate || !/[,/]/.test(candidate)) return false;
  const parts = candidate
    .split(/\s*(?:,|\/|\||\band\b|&)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  const eventParts = parts.filter((part) =>
    /\b(?:weekly|final|midterm|presentation|critique|portfolio|prototype|journal|lab|studio|deliverable|assessment|quiz|exam|assignment|rubric)\b/i.test(
      part,
    ),
  );
  return eventParts.length >= 2;
}

function repeatedCourseTitleOnlyTopicCount(courseMap) {
  const lessons = asArray(courseMap?.lessons);
  if (lessons.length < 3) return 0;
  return lessons.reduce((count, lesson) => {
    const titleCount = isCourseTitleOnlyTopic(lesson?.title, courseMap) ? 1 : 0;
    const sectionCount = asArray(lesson?.sections).filter((section) =>
      isCourseTitleOnlyTopic(section?.topicSection || section?.topic, courseMap),
    ).length;
    return count + titleCount + sectionCount;
  }, 0);
}

function hasRepeatedCourseTitleOnlyTopics(courseMap) {
  const lessons = asArray(courseMap?.lessons);
  if (lessons.length < 3) return false;
  return repeatedCourseTitleOnlyTopicCount(courseMap) >= Math.min(lessons.length, 4);
}

function needsCourseTitleOnlyTopicRepair(value, courseMap) {
  return hasRepeatedCourseTitleOnlyTopics(courseMap) && isCourseTitleOnlyTopic(value, courseMap);
}

function repeatedShortCourseMapTopicIdentities(courseMap) {
  const lessons = asArray(courseMap?.lessons);
  if (lessons.length < 3) return new Set();
  const counts = new Map();
  const add = (value, lessonIndex) => {
    const normalized = normalizeCourseMapTopicIdentity(value);
    if (!normalized || isCourseTitleOnlyTopic(value, courseMap)) return;
    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 5) return;
    const current = counts.get(normalized) || { count: 0, lessonIndices: new Set() };
    current.count += 1;
    if (Number.isInteger(lessonIndex)) current.lessonIndices.add(lessonIndex);
    counts.set(normalized, current);
  };
  lessons.forEach((lesson, lessonIndex) => {
    add(lesson?.title, lessonIndex);
    asArray(lesson?.sections).forEach((section) => {
      add(section?.topicSection || section?.topic, lessonIndex);
      add(section?.weeklyAssessments, lessonIndex);
    });
  });
  const repeated = new Set();
  const lessonThreshold = Math.min(lessons.length, 4);
  for (const [identity, row] of counts.entries()) {
    if (row.lessonIndices.size >= lessonThreshold || row.count >= lessons.length) repeated.add(identity);
  }
  return repeated;
}

function needsRepeatedShortTopicRepair(value, courseMap) {
  const normalized = normalizeCourseMapTopicIdentity(value);
  if (!normalized) return false;
  return repeatedShortCourseMapTopicIdentities(courseMap).has(normalized);
}

function isAssessmentLabelCourseMapIdentity(value) {
  const candidate = text(value)
    .replace(/[_/|]+/g, ' ')
    .replace(/\s*[—–-]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^lesson\s+\d{1,3}\s*[:.]\s*/i, '');
  if (!candidate || !ASSESSMENT_LABEL_COURSE_MAP_RE.test(candidate)) return false;
  return (
    ASSESSMENT_ARTIFACT_PAIR_RE.test(candidate) ||
    ASSESSMENT_WEIGHT_CUE_RE.test(candidate) ||
    ASSESSMENT_ACTIVITY_CUE_RE.test(candidate) ||
    ASSESSMENT_WEEK_LABEL_CUE_RE.test(candidate)
  );
}

function hasAssessmentLabelCourseMapIdentityReference(value) {
  const raw = text(value);
  return ASSESSMENT_LABEL_IDENTITY_REFERENCE_RE.test(raw) || ASSESSMENT_WEEK_LABEL_IDENTITY_REFERENCE_RE.test(raw);
}

function hasRepeatedShortTopicReference(value, courseMap) {
  const normalized = normalizeCourseMapTopicIdentity(value);
  if (!normalized) return false;
  for (const identity of repeatedShortCourseMapTopicIdentities(courseMap)) {
    if (new RegExp(`(?:^|\\b)${escapeRegexLiteral(identity)}(?:\\b|$)`, 'i').test(normalized)) return true;
  }
  return false;
}

function weakCourseMapTopicIdentities(courseMap) {
  const identities = new Set([...repeatedShortCourseMapTopicIdentities(courseMap)]);
  asArray(courseMap?.lessons).forEach((lesson) => {
    // Only identity-bearing fields can establish a weak *topic* identity.
    // Weekly assessments are often complete sentences by design; feeding
    // them through isSentenceShapedCourseMapTopic made every substantive
    // assessment define itself as weak and then replace itself with a generic
    // application-check fallback. Assessments may still reference a weak
    // title/topic below, and explicit malformed assessment labels keep their
    // dedicated identity check.
    [lesson?.title, ...asArray(lesson?.sections).map((section) => section?.topicSection)]
      .map(normalizeCourseMapTopicIdentity)
      .filter(Boolean)
      .forEach((candidate) => {
        if (isWeakCourseMapTopic(candidate, courseMap)) identities.add(candidate);
      });
    [
      lesson?.title,
      ...asArray(lesson?.sections).flatMap((section) => [section?.topicSection, section?.weeklyAssessments]),
    ].forEach((candidate) => {
      if (isAssessmentLabelCourseMapIdentity(candidate)) identities.add(normalizeCourseMapTopicIdentity(candidate));
    });
  });
  return identities;
}

function hasWeakCourseMapTopicReference(value, courseMap) {
  const raw = text(value);
  if (!raw || stripCourseMapRegistryReferenceSuffix(raw) !== raw) return false;
  const normalized = normalizeCourseMapTopicIdentity(value);
  if (!normalized) return false;
  for (const identity of weakCourseMapTopicIdentities(courseMap)) {
    if (!identity || identity.length < 5) continue;
    if (new RegExp(`(?:^|\\b)${escapeRegexLiteral(identity)}(?:\\b|$)`, 'i').test(normalized)) return true;
  }
  return false;
}

function needsPromptArtifactCourseMapRepair(key, value, courseMap) {
  if (isInstructionalDesignCourse(courseMap)) return false;
  const raw = text(value);
  if (!raw) return false;
  if (key === 'topicSection' && isPromptArtifactTopic(raw, courseMap)) return true;
  if (NUMBERED_PROMPT_ARTIFACT_TOPIC_RE.test(raw)) return true;
  if (PROMPT_ARTIFACT_EMBEDDED_COURSE_MAP_KEYS.has(key) && hasEmbeddedPromptArtifactTopic(raw)) return true;
  if (key === 'supportingResources') {
    const lines = splitPromptArtifactResourceLines(value);
    if (lines.some((line) => PROMPT_ARTIFACT_RESOURCE_SET.has(line))) return true;
    const artifactLines = lines.filter((line) => PROMPT_ARTIFACT_TOPIC_SET.has(line)).length;
    if (artifactLines >= 3) return true;
    if (countEmbeddedPromptArtifactResourceLabels(raw) >= 2) return true;
  }
  return false;
}

function isWeakCourseMapTopic(value, courseMap) {
  const candidate = text(value);
  if (!candidate || findPublishabilityPlaceholders(candidate, { limit: 1 }).length > 0) return true;
  if (isGenericNumberedCourseMapTopic(candidate)) return true;
  if (isPromptArtifactTopic(candidate, courseMap) || NUMBERED_PROMPT_ARTIFACT_TOPIC_RE.test(candidate)) return true;
  if (hasEmbeddedPromptArtifactTopic(candidate)) return true;
  if (GENERIC_COURSE_MAP_FALLBACK_RE.test(candidate)) return true;
  if (needsCourseTitleOnlyTopicRepair(candidate, courseMap)) return true;
  if (isDomainCourseTitleOnlyWeakTopic(candidate, courseMap)) return true;
  if (isCourseTitlePrefixedFallbackTopic(candidate, courseMap)) return true;
  if (isConjoinedAssessmentEventTopic(candidate)) return true;
  if (isAssessmentLabelCourseMapIdentity(candidate)) return true;
  if (needsRepeatedShortTopicRepair(candidate, courseMap)) return true;
  if (isSentenceShapedCourseMapTopic(candidate)) return true;
  return /^(?:none|n\/a|not applicable|lesson|week|topic|focus|overview|foundations?|basics?|block|clinical|community|health|studio|seminar|placement)$/i.test(
    candidate,
  );
}

function genericTopicText(value) {
  return text(value)
    .replace(/^(?:lesson|week|module|unit)\s*\d{1,3}\s*[:.-]?\s*/i, '')
    .replace(/^\d+(?:\.\d+)*\s*[:.)-]\s*/i, '')
    .replace(/[.?!;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGenericNumberedCourseMapTopic(value) {
  const raw = text(value)
    .replace(/^\d+(?:\.\d+)*\s*[:.)-]\s*/i, '')
    .trim();
  if (/^(?:session|topic|lesson|week)(?:\s+\d{1,3})?$/i.test(raw)) return true;
  const candidate = genericTopicText(value);
  return /^(?:session|topic|lesson|week)(?:\s+\d{1,3})?$/i.test(candidate);
}

function isSentenceShapedCourseMapTopic(value) {
  const candidate = genericTopicText(value);
  if (!candidate) return false;
  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length > 10) return true;
  return (
    words.length > 6 &&
    /^(?:use|build|prepare|apply|interpret|create|critique|evaluate|review|compare|work\s+through|facilitate|discuss|analyze|connect|explain|trace|develop)\b/i.test(
      candidate,
    )
  );
}

function hasGenericNumberedCourseMapReference(value, lessonIndex) {
  const raw = text(value);
  if (!raw) return false;
  const lessonNumber = Number(lessonIndex) + 1;
  if (/\b(?:session|topic)\s+\d{1,3}\b/i.test(raw)) return true;
  const genericWeekOnlyRe = Number.isInteger(lessonNumber)
    ? new RegExp(`^\\s*(?:\\d+(?:\\.\\d+)*\\s*[:.)-]\\s*)?(?:lesson\\s*)?week\\s*${lessonNumber}\\s*$`, 'i')
    : /^\s*(?:\d+(?:\.\d+)*\s*[:.)-]\s*)?(?:lesson\s*)?week\s*\d{1,3}\s*$/i;
  if (genericWeekOnlyRe.test(raw)) return true;
  if (Number.isInteger(lessonNumber) && lessonNumber > 0) {
    const weakWeekRe = new RegExp(
      `\\b(?:key ideas|main concepts|assigned materials|examples?|course task|course activities|course problem|supporting evidence|new example|evidence needed)\\b[^.\\n]{0,80}\\bweek\\s*${lessonNumber}\\b`,
      'i',
    );
    if (weakWeekRe.test(raw)) return true;
  }
  if (!Number.isInteger(lessonNumber) || lessonNumber <= 0) {
    return isGenericNumberedCourseMapTopic(raw);
  }
  return (
    new RegExp(`\\b(?:session|topic)\\s*${lessonNumber}\\b`, 'i').test(raw) || isGenericNumberedCourseMapTopic(raw)
  );
}

function pickCourseMapTopic(candidates = [], courseMap) {
  return candidates
    .map(titleCandidateFromCourseMapTopic)
    .filter((candidate) => !isWeakCourseMapTopic(candidate, courseMap))
    .map((candidate, index) => {
      const wordLength = candidate.split(/\s+/).filter(Boolean).length;
      const punctuationPenalty = /[,;]/.test(candidate) ? 4 : 0;
      const lengthPenalty = wordLength > 8 ? wordLength - 8 : 0;
      const specificityBonus = /^[A-Z]/.test(candidate) && wordLength >= 2 && wordLength <= 8 ? -2 : 0;
      return {
        candidate,
        score: punctuationPenalty + lengthPenalty + specificityBonus + index * 0.01,
      };
    })
    .sort((a, b) => a.score - b.score)[0]?.candidate;
}

function getCourseMapTopic(courseMap, lesson, section, lessonIndex) {
  const sections = Array.isArray(lesson?.sections) && lesson.sections.length > 0 ? lesson.sections : [section || {}];
  const sectionTopicCandidates = courseMapTopicList(section?.topicSection || section?.topic);
  const sectionSupportingCandidates = [
    section?.learningObjectives,
    section?.learningGoals,
    section?.weeklyAssessments,
  ].flatMap(courseMapTopicList);
  const siblingTopicCandidates = sections
    .filter((sourceSection) => sourceSection !== section)
    .flatMap((sourceSection) => courseMapTopicList(sourceSection?.topicSection || sourceSection?.topic));
  const siblingSupportingCandidates = sections
    .filter((sourceSection) => sourceSection !== section)
    .flatMap((sourceSection) =>
      [sourceSection?.learningObjectives, sourceSection?.learningGoals, sourceSection?.weeklyAssessments].flatMap(
        courseMapTopicList,
      ),
    );
  const titleCandidates = courseMapTopicList(lesson?.title);
  const courseCandidates = courseMapTopicList(courseMap?.courseName);
  const raw =
    pickCourseMapTopic(sectionTopicCandidates, courseMap) ||
    pickCourseMapTopic(siblingTopicCandidates, courseMap) ||
    // A specific lesson title is a stronger identity source than an
    // objective or assessment sentence. The old order turned a weak section
    // label such as "Focus" into "Compare Li Bai and Du Fu" (or even a
    // generic assessment stem) instead of restoring the authored lesson
    // identity "Tang Poetry using Li Bai and Du Fu".
    pickCourseMapTopic(titleCandidates, courseMap) ||
    pickCourseMapTopic(sectionSupportingCandidates, courseMap) ||
    pickCourseMapTopic(siblingSupportingCandidates, courseMap);
  return (
    raw ||
    getCourseMapProgressionTopic(courseMap, lessonIndex) ||
    pickCourseMapTopic(courseCandidates, courseMap) ||
    `Lesson ${lessonIndex + 1}`
  );
}

function getCourseMapProgressionTopic(courseMap, lessonIndex) {
  const context = [
    courseMap?.courseName,
    ...asArray(courseMap?.lessons).flatMap((lesson) => [
      lesson?.title,
      ...asArray(lesson?.sections).flatMap((section) => [
        section?.topicSection,
        section?.learningGoals,
        section?.learningObjectives,
        section?.weeklyAssessments,
      ]),
    ]),
  ]
    .map(text)
    .join(' ');
  if (PROJECT_MANAGEMENT_COURSE_RE.test(context)) {
    return PROJECT_MANAGEMENT_TOPIC_SEQUENCE[lessonIndex % PROJECT_MANAGEMENT_TOPIC_SEQUENCE.length];
  }
  if (UX_DESIGN_COURSE_MAP_RE.test(context)) {
    return UX_DESIGN_TOPIC_SEQUENCE[lessonIndex % UX_DESIGN_TOPIC_SEQUENCE.length];
  }
  if (COMPUTER_SCIENCE_COURSE_MAP_RE.test(context)) {
    return COMPUTER_SCIENCE_TOPIC_SEQUENCE[lessonIndex % COMPUTER_SCIENCE_TOPIC_SEQUENCE.length];
  }
  return '';
}

const HISTORY_COURSE_MAP_RE =
  /\b(?:western civilization|civilization|world history|history|historical|ancient|medieval|middle ages|renaissance|reformation|mesopotamia|egypt|egyptian|greece|greek|rome|roman|byzantine|islamic|crusade|feudal|charlemagne|carolingian|empire|kingdom|primary[- ]source|source analysis)\b/i;

const LITERATURE_COURSE_MAP_RE =
  /\b(?:world literature|comparative literature|literary|literature|poetry|poem|epic|drama|novel|short stor(?:y|ies)|close reading|textual analysis|narrative|author|playwright)\b/i;

const UX_DESIGN_COURSE_MAP_RE =
  /\b(?:user experience|ux|design studio|design research|user research|usability|prototype|prototyping|wireframe|journey map|personas?|accessibility|portfolio review|case study|critique session|design journals?)\b/i;

// v0.16.1: the CS profile used to fire on generic tokens every quantitative
// course contains — "variables", "functions", "testing", "lists" — which is
// how a pure Linear Algebra course got a Python-programming course map
// ("Trace Python code using Linear equations", "Python interpreter or
// notebook" as required technology; the July 2026 field audit's worst P0).
// The profile now needs an UNAMBIGUOUS signal; weak tokens only count when
// at least two distinct ones appear alongside a mention of code. Python and
// "coding" are not unambiguous by themselves: research-methods courses use
// Python notebooks as instruments and qualitative coding is not software
// development. Treat those as programming only when the surrounding text
// names an actual software-building practice. "Algorithm" is also not an
// unambiguous signal: cognitive-psychology courses explicitly compare
// algorithms and heuristics. Let an algorithms COURSE name opt in below, but
// never let one psychology lesson relabel its fallback pedagogy as Python.
const COMPUTER_SCIENCE_STRONG_RE =
  /\b(?:computer\s+science|programming|software\s+(?:engineering|development)|data\s+structures?|debugging|file\s+(?:input|output|i\/o)|final\s+python\s+project|source\s+code|pseudocode|coding\s+(?:lab|course|exercise|project|assignment|challenge))\b/i;
const ALGORITHMS_COURSE_IDENTITY_RE =
  /\b(?:introduction\s+to\s+algorithms?|algorithm\s+(?:design|analysis|engineering)|analysis\s+of\s+algorithms?|algorithms?\s+and\s+data\s+structures?)\b/i;
const PYTHON_PROGRAMMING_CONTEXT_RE =
  /\b(?:introduction\s+to\s+python|python\s+(?:programming|fundamentals|basics|course|code|script|application|project)|(?:write|run|debug|test|refactor|execute)\s+(?:a\s+)?python\s+(?:program|script|code)|python\s+(?:function|class|module|package|syntax))\b/i;
const COMPUTER_SCIENCE_WEAK_RE =
  /\b(?:variables?|data\s+types?|conditionals?|loops?|functions?|lists?|dictionar(?:y|ies)|strings?|testing)\b/gi;
const COMPUTER_SCIENCE_COURSE_MAP_RE = {
  test(context) {
    const text = String(context || '');
    if (COMPUTER_SCIENCE_STRONG_RE.test(text) || PYTHON_PROGRAMMING_CONTEXT_RE.test(text)) return true;
    const weakHits = new Set((text.match(COMPUTER_SCIENCE_WEAK_RE) || []).map((hit) => hit.toLowerCase()));
    return weakHits.size >= 2 && /\bcode\b/i.test(text);
  },
};

const GENERIC_COURSE_MAP_FALLBACK_RE =
  /\b(?:course problem|course applications|next assessment|quick evidence check|application check|exit ticket using|practice response|review assigned materials|prepare notes|new example|one course decision|visible product|observe, label, calculate, or decide|course task or example|course activities|evidence of learning|lab materials|discipline-specific tools)\b/i;
const GENERIC_ASSESSMENT_SCAFFOLD_RE =
  /\b(?:quick evidence check|evidence check|application check|exit ticket using|practice response(?:\s+that\s+names)?|prepared response|applied response|practice checkpoint|review note|transfer task)\b/i;
const GENERIC_ASSESSMENT_NEW_EXAMPLE_RE = /\bapply\b[^.?!\n]{0,120}\bto a new example\b/i;
const GENERIC_ASSESSMENT_COURSE_DECISION_RE = /\busing\b[^.?!\n]{0,120}\bto justify one course-relevant decision\b/i;

function inferCourseMapFallbackProfile(courseMap, lesson, section) {
  const sections = Array.isArray(lesson?.sections) && lesson.sections.length > 0 ? lesson.sections : [section || {}];
  const context = [
    courseMap?.courseName,
    lesson?.title,
    section?.topicSection,
    section?.learningGoals,
    section?.learningObjectives,
    section?.weeklyAssessments,
    ...sections.flatMap((item) => [item?.topicSection, item?.learningGoals, item?.learningObjectives]),
  ]
    .map(text)
    .join(' ');
  if (PROJECT_MANAGEMENT_COURSE_RE.test(context)) return 'project-management';
  if (UX_DESIGN_COURSE_MAP_RE.test(context)) return 'ux-design';
  if (COMPUTER_SCIENCE_COURSE_MAP_RE.test(context) || ALGORITHMS_COURSE_IDENTITY_RE.test(text(courseMap?.courseName))) {
    return 'computer-science';
  }
  if (LITERATURE_COURSE_MAP_RE.test(context)) return 'literature';
  if (
    /\b(?:music theory|aural skills?|ear training|interval quality|semitones?|pitch(?:es)?|notated|notation|inversion number|compound intervals?)\b/i.test(
      context,
    )
  ) {
    return 'music-theory';
  }
  return HISTORY_COURSE_MAP_RE.test(context) ? 'history' : 'general';
}

function displayCourseMapTopic(topic) {
  const value = text(topic);
  return value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : 'Project decision';
}

function getHistoryCourseMapFallbacks(topic, pick) {
  return {
    learningGoals: pick([
      `Use ${topic} to explain change over time, continuity, and historical causation with course evidence.`,
      `Compare ${topic} across political, social, cultural, or religious contexts using source evidence.`,
      `Build an evidence-backed interpretation of ${topic} for a Western civilization survey question.`,
    ]),
    topicSection: topic,
    learningObjectives: pick([
      `Interpret ${topic} using chronology, context, and at least one relevant primary or secondary source.`,
      `Connect ${topic} to broader patterns in Western civilization before 1500.`,
      `Explain competing historical interpretations of ${topic} and identify evidence that supports them.`,
      `Analyze a source or map for ${topic} and state what it shows about the period.`,
    ]),
    weeklyAssessments: pick([
      `Source-analysis check: use evidence from ${topic} to support one historical claim.`,
      `Timeline or map exit ticket connecting ${topic} to a broader course pattern.`,
      `Short historical argument naming the evidence needed to interpret ${topic}.`,
    ]),
    asyncActivities: pick([
      `Annotate the assigned reading or source excerpt for claims, context, and evidence about ${topic}.`,
      `Prepare a brief chronology, map note, or source note for ${topic}.`,
      `Review the assigned background reading and write one evidence question about ${topic}.`,
    ]),
    syncActivities: pick([
      `Compare source evidence and historical interpretations of ${topic} in discussion.`,
      `Work through a map, timeline, or source excerpt to situate ${topic}.`,
      `Debate how evidence for ${topic} changes a historical explanation.`,
    ]),
    technologyNeeded: pick([
      'Course LMS, slide deck, digital reader, and map or timeline tool used for the lesson.',
      'LMS access plus assigned source excerpts, historical maps, and note-taking tools.',
      'Course platform, instructor-provided readings, and shared discussion workspace.',
    ]),
    presentationFormat: pick([
      'Historical question, source/context mini-lecture, evidence discussion, and synthesis.',
      'Map or chronology setup, guided source analysis, and short interpretive check.',
      'Opening historical problem, document work, comparison, and closing claim.',
    ]),
    supportingResources: pick([
      `Primary-source excerpt, historical map or timeline, and instructor-approved reading for ${topic}.`,
      `Course reader selection, visual source, map, or chronology handout aligned to ${topic}.`,
      `Source-analysis guide and background reading for ${topic}.`,
    ]),
    evaluateDesign: `Check that the ${topic} activity, source, and assessment ask students to support a historical claim with evidence.`,
  };
}

function getLiteratureCourseMapFallbacks(topic, pick) {
  const displayTopic = displayCourseMapTopic(topic);
  return {
    learningGoals: pick([
      `Use textual evidence from ${topic} to build an interpretation that attends to form, context, and language.`,
      `Compare how ${topic} develops a literary idea through structure, voice, imagery, or genre.`,
      `Develop an evidence-backed reading of ${topic} and connect it to a broader literary tradition.`,
    ]),
    topicSection: topic,
    learningObjectives: pick([
      `Analyze a passage from ${topic} and explain how one formal choice shapes its meaning.`,
      `Compare two moments in ${topic} using quoted textual evidence and a clear interpretive claim.`,
      `Interpret ${topic} in its literary or historical context and identify one meaningful tension.`,
      `Evaluate competing readings of ${topic} and defend the stronger interpretation with textual evidence.`,
    ]),
    weeklyAssessments: pick([
      `${displayTopic} comparative close-reading: compare two passages by the selected writers, synthesize one claim, and support it with quoted details.`,
      `${displayTopic} comparison: connect two passages, authors, or traditions through a defensible claim.`,
      `${displayTopic} evidence memo: explain how form, language, or context changes the reading.`,
      `${displayTopic} interpretive response: test one reading against a specific passage and one alternative.`,
    ]),
    asyncActivities: pick([
      `Annotate the assigned text for a recurring image, formal pattern, or interpretive tension in ${topic}.`,
      `Prepare two passage notes that could support different readings of ${topic}.`,
      `Read the assigned selection and mark one formal choice that changes how ${topic} can be interpreted.`,
    ]),
    syncActivities: pick([
      `Compare passage evidence for ${topic}, then revise one claim after hearing an alternative reading.`,
      `Work through a close reading of ${topic} and distinguish observation from interpretation.`,
      `Test two interpretations of ${topic} against the language and structure of the assigned text.`,
    ]),
    technologyNeeded: pick([
      'Course LMS, accessible assigned text, annotation workspace, and shared discussion notes.',
      'Digital or print course reader, passage-marking tools, and a workspace for comparative notes.',
      'Course platform, accessible reading files, and a shared space for evidence-backed discussion.',
    ]),
    presentationFormat: pick([
      'Passage framing, guided close reading, interpretive comparison, and claim revision.',
      'Context cue, textual analysis, competing readings, and evidence-backed synthesis.',
      'Opening passage question, annotation workshop, comparison, and short interpretive response.',
    ]),
    supportingResources: pick([
      `Assigned text or excerpt, contextual note, and close-reading guide for ${topic}.`,
      `Course-reader selection, passage annotation guide, and interpretive model aligned to ${topic}.`,
      `Primary literary text, brief context source, and evidence checklist for ${topic}.`,
    ]),
    evaluateDesign: `Check that the ${topic} reading, discussion, and assessment require students to support the same interpretive claim with textual evidence.`,
  };
}

function getProjectManagementCourseMapFallbacks(topic, pick) {
  const displayTopic = displayCourseMapTopic(topic);
  return {
    learningGoals: pick([
      `Use ${topic} to connect stakeholder needs, constraints, and project evidence to an implementation decision.`,
      `Build ${topic} evidence that separates scope, timing, cost, risk, and communication tradeoffs.`,
      `Prepare a project-management artifact for ${topic} that justifies the next team or sponsor decision.`,
    ]),
    topicSection: topic,
    learningObjectives: pick([
      `Apply ${topic} vocabulary to a project scenario and defend the chosen next action.`,
      `Interpret ${topic} evidence, identify the affected stakeholders, and explain the project tradeoff.`,
      `Create or critique a ${topic} artifact using scope, schedule, risk, or acceptance criteria.`,
      `Evaluate a ${topic} decision and name the assumption that would change the recommendation.`,
    ]),
    weeklyAssessments: pick([
      `${displayTopic} evidence check: choose the project decision the evidence supports.`,
      `${displayTopic} mini-brief with one stakeholder, one constraint, and one recommended action.`,
      `${displayTopic} scenario response that links the artifact to scope, schedule, risk, or quality evidence.`,
    ]),
    asyncActivities: pick([
      `Review the project scenario and annotate evidence that affects ${topic}.`,
      `Prepare a short ${topic} note naming the stakeholder, constraint, and decision point.`,
      `Compare a sample artifact with the ${topic} criteria before class.`,
    ]),
    syncActivities: pick([
      `Work through a ${topic} project case and decide which evidence changes the plan.`,
      `Facilitate a sponsor-team discussion that tests the ${topic} recommendation.`,
      `Critique project evidence in pairs, then revise the ${topic} decision.`,
    ]),
    technologyNeeded: pick([
      'Course LMS, shared project files, spreadsheet or scheduling tool, and team notes workspace.',
      'LMS access plus the project brief, decision log, and planning template for the lesson.',
      'Course platform, project artifact template, and collaboration space for team review.',
    ]),
    presentationFormat: pick([
      'Project scenario setup, worked decision example, team application, and sponsor-facing synthesis.',
      'Brief concept framing, artifact walkthrough, stakeholder tradeoff discussion, and evidence check.',
      'Opening project constraint, structured team practice, and closing decision memo.',
    ]),
    supportingResources: pick([
      `${displayTopic} template, sponsor brief, and project evidence checklist.`,
      `Sample project artifact, decision-log guide, and ${topic} rubric criteria.`,
      `Project scenario packet, planning worksheet, and ${topic} example for comparison.`,
    ]),
    evaluateDesign: `Check that the ${topic} activity, artifact, and assessment ask students to justify the same project decision with evidence.`,
  };
}

function getUxDesignCourseMapFallbacks(topic, pick) {
  const displayTopic = displayCourseMapTopic(topic);
  return {
    learningGoals: pick([
      `Use ${topic} to make one design choice traceable to user evidence and critique feedback.`,
      `Connect ${topic} to a prototype, research note, or portfolio case decision students can defend.`,
      `Build ${topic} evidence that moves from observation to design rationale.`,
      `Use ${topic} to explain how a user need changes the next design iteration.`,
    ]),
    topicSection: topic,
    learningObjectives: pick([
      `Apply ${topic} to a UX artifact and explain the design decision it changes.`,
      `Use ${topic} evidence to critique a prototype or portfolio case section.`,
      `Interpret a user signal in ${topic} and name the design implication.`,
      `Revise a UX artifact by connecting ${topic} evidence to one visible choice.`,
    ]),
    weeklyAssessments: pick([
      `${displayTopic} evidence memo: user signal and revision choice.`,
      `${displayTopic} annotation: research detail to design choice.`,
      `${displayTopic} studio defense: prototype move and evidence.`,
      `${displayTopic} rationale note: user need, tradeoff, and next revision.`,
    ]),
    asyncActivities: pick([
      `Review the UX example and mark where ${topic} changes the design rationale.`,
      `Prepare a design-journal note connecting ${topic} to one artifact decision.`,
      `Analyze a research or critique excerpt and bring one ${topic} revision question.`,
      `Compare the assigned UX example with the current studio artifact for ${topic}.`,
    ]),
    syncActivities: pick([
      `Run a critique round that tests how ${topic} changes the artifact.`,
      `Use studio feedback to revise the ${topic} decision and explain the evidence.`,
      `Compare artifact versions in pairs, then name the ${topic} evidence behind the stronger move.`,
      `Practice turning ${topic} observations into a portfolio-ready design rationale.`,
    ]),
    technologyNeeded: pick([
      'Course LMS, design journal, prototype board, and critique workspace.',
      'LMS access plus the UX example, research notes, and studio artifact workspace.',
      'Prototype or wireframe tool, shared critique notes, and the assigned UX example.',
      'Design file access, usability notes, and a workspace for annotated critique.',
      'Interview transcript, affinity board, critique timer, and design-journal workspace.',
      'Persona template, journey-map canvas, prototype board, and accessibility checklist.',
      'Research repository, usability-note capture, wireframe file, and peer-comment thread.',
      'Shared design file, screen-reader checklist, test script, and findings synthesis board.',
      'Portfolio case-study draft, artifact screenshots, critique log, and revision tracker.',
      'IA card-sort notes, sitemap board, navigation sketch, and rationale worksheet.',
      'Prototype link, task notes, observation sheet, and issue-prioritization board.',
      'Presentation deck, case-study evidence folder, critique rubric, and rehearsal notes.',
    ]),
    presentationFormat: pick([
      'UX example setup, artifact critique, revision decision, and short studio synthesis.',
      'Research cue, design-rationale model, paired artifact review, and next-iteration note.',
      'Critique question, worked UX example, studio application, and portfolio connection.',
      'User-evidence framing, prototype comparison, revision planning, and reflection.',
      'Interview finding, design implication, artifact mark-up, and revision commitment.',
      'Persona evidence, scenario walk-through, critique response, and design choice.',
      'Journey stage, pain-point evidence, opportunity note, and service-improvement move.',
      'IA decision, navigation tradeoff, card-sort evidence, and sitemap adjustment.',
      'Wireframe choice, usability concern, peer annotation, and layout revision.',
      'Prototype task, observed friction, interaction change, and test-ready rationale.',
      'Accessibility issue, standard or heuristic, remediation step, and verification plan.',
      'Portfolio claim, supporting artifact, critique takeaway, and presentation rehearsal.',
    ]),
    supportingResources: pick([
      `UX example, critique protocol, and design-journal prompt aligned to ${topic}.`,
      `Research-note excerpt, prototype sample, and rationale model for ${topic}.`,
      `Portfolio case excerpt, artifact version, and studio feedback guide for ${topic}.`,
      `Usability or critique notes, design example, and revision prompt for ${topic}.`,
    ]),
    evaluateDesign: pick([
      `Check that the ${topic} activity and assessment ask students to justify the same design revision.`,
      `Confirm the ${topic} resource, critique task, and artifact standard point to one user-evidence claim.`,
      `Make the ${topic} studio task produce evidence students can reuse in the portfolio case.`,
      `Align the ${topic} example and assessment around a visible artifact change.`,
    ]),
  };
}

function getMusicTheoryCourseMapFallbacks(topic, pick, lesson, section, courseMap = null) {
  const lessonText = [lesson?.title, topic, section?.learningObjectives].map(text).join(' ');
  const inversionLesson = /\b(?:simple|compound|invert|inversion|number pair|quality change)\b/i.test(lessonText);
  const courseName = text(courseMap?.courseName).toLowerCase();
  const rawSource = text(section?.supportingResources)
    .split(/\n|;/)
    .map((entry) => entry.replace(/^\s*\d+[.)]\s*/, '').trim())
    .find(
      (entry) =>
        entry.length > 0 &&
        entry.length <= 100 &&
        entry.toLowerCase() !== courseName &&
        !/\b(?:course site|course platform|instructor-provided materials?|supporting resources?)\b/i.test(entry),
    );
  const source = rawSource || (inversionLesson ? 'assigned notation or audio set' : 'assigned notation drill');
  const artifact = inversionLesson
    ? `${source} interval-classification and inversion analysis`
    : `${source} interval-classification and semitone-verification check`;
  return {
    learningGoals: inversionLesson
      ? `Use simple-interval reduction, inversion number pairs, and quality changes to classify notated and heard intervals.`
      : `Use inclusive letter-name counting and semitone evidence to classify notated and heard intervals.`,
    topicSection: topic,
    learningObjectives: inversionLesson
      ? `Reduce compound intervals, apply the sum-to-nine rule, and justify each inverted quality with pitch evidence.`
      : `Count generic interval numbers inclusively, identify quality, and verify each label by semitone count.`,
    weeklyAssessments: `${artifact}: classify each interval and justify the answer with inspectable pitch evidence.`,
    asyncActivities: `Annotate examples from ${source} with the interval number, quality, and supporting pitch evidence.`,
    syncActivities: inversionLesson
      ? `Compare compound-interval reductions and inversion labels, then correct each number or quality mismatch aloud.`
      : `Classify notated and heard intervals in pairs, then reconcile letter-name counts with semitone counts.`,
    technologyNeeded: `Accessible notation or audio playback for ${source}, plus a response sheet or shared annotation workspace.`,
    presentationFormat: inversionLesson
      ? 'Rule demonstration, guided inversion analysis, listening or notation practice, and evidence-backed correction.'
      : 'Inclusive-counting demonstration, semitone verification, guided classification, and a short listening or notation check.',
    supportingResources: source,
    evaluateDesign: `Confirm that instruction, practice, and ${artifact} require the same interval-classification rules and visible pitch evidence.`,
  };
}

function getComputerScienceCourseMapFallbacks(topic, pick) {
  const displayTopic = displayCourseMapTopic(topic);
  return {
    learningGoals: pick([
      `Use ${topic} to read, predict, and explain a small Python program.`,
      `Connect ${topic} to program state, data flow, and debugging evidence.`,
      `Build ${topic} practice from code tracing to an applied Python task.`,
      `Use ${topic} to decide how a program should store, transform, or report data.`,
    ]),
    topicSection: topic,
    learningObjectives: pick([
      `Trace Python code using ${topic} and explain the output before running it.`,
      `Write or revise a short Python example that uses ${topic} correctly.`,
      `Debug a ${topic} mistake by naming the input, state change, and expected result.`,
      `Choose the right ${topic} approach for a small programming problem and justify it.`,
      `Test a ${topic} example with at least one normal case and one edge case.`,
      `Explain how ${topic} changes control flow, data shape, or program output in a short snippet.`,
      `Refactor a small ${topic} example and describe the evidence that it still works.`,
      `Compare a working and broken ${topic} snippet, then name the rule that separates them.`,
    ]),
    weeklyAssessments: pick([
      `${displayTopic} trace memo: predict two lines, run the code, and annotate the changed variable.`,
      `${displayTopic} mini-program: add one feature and submit normal plus edge-case output.`,
      `${displayTopic} bug-fix note: locate the failing line, patch it, and include rerun evidence.`,
      `${displayTopic} implementation choice: compare two approaches and defend the cleaner Python version.`,
      `${displayTopic} partner review: execute a peer snippet and record one test result plus revision advice.`,
      `${displayTopic} transfer task: adapt the pattern to a new input and explain what stayed invariant.`,
      `${displayTopic} data-flow sketch: mark each value change and attach the matching console output.`,
      `${displayTopic} lab checkpoint: complete the starter file and explain the first failing test.`,
      `${displayTopic} rewrite challenge: simplify a working snippet without changing its observed behavior.`,
      `${displayTopic} edge-case probe: choose one boundary input and explain the result before submission.`,
      `${displayTopic} code review card: identify one readability issue and one correctness risk.`,
      `${displayTopic} concept application: build a tiny example and justify the design decision it shows.`,
    ]),
    asyncActivities: pick([
      `Trace a short Python example for ${topic} and note the inputs, variables, and output.`,
      `Run the starter code for ${topic}, change one value, and record what changes.`,
      `Read the ${topic} example and write one question about a possible bug or edge case.`,
      `Prepare a small test table for ${topic} before writing code in class.`,
      `Annotate the provided Python snippet to show where ${topic} affects program behavior.`,
      `Sketch the expected console output for a ${topic} snippet, then list what to verify in class.`,
      `Review the ${topic} reading and tag one line of code that could fail for a boundary input.`,
      `Draft a two-row test plan for ${topic} with the expected result beside each input.`,
    ]),
    syncActivities: pick([
      `Live-code a ${topic} example, then have students predict the next program state.`,
      `Debug a broken ${topic} snippet in pairs and compare fixes.`,
      `Work through a ${topic} coding prompt from pseudocode to tested Python code.`,
      `Compare two ${topic} implementations and discuss readability, correctness, and edge cases.`,
      `Use a short lab checkpoint to connect ${topic} syntax to program output.`,
      `Run a ${topic} example twice with different inputs and discuss why the outputs diverge.`,
      `Have pairs refactor a ${topic} solution, then explain the tradeoff they accepted.`,
      `Ask students to write one failing ${topic} test first, then repair the code together.`,
    ]),
    technologyNeeded: pick([
      'Python interpreter or notebook, starter file, LMS, and shared debugging notes workspace.',
      'Code editor, terminal or notebook, sample input file when needed, and test-output log.',
      'Course LMS, Python sandbox, instructor starter code, and a place to submit code traces.',
      'Python runtime, projected worked example, and shared space for test cases and fixes.',
    ]),
    presentationFormat: pick([
      'Concept cue, code trace, live example, pair debugging, and short tested submission.',
      'Starter problem, worked Python example, student coding pass, and evidence review.',
      'Prediction question, code execution, bug discussion, and edge-case check.',
      'Syntax model, guided practice, independent code edit, and output explanation.',
    ]),
    supportingResources: pick([
      `${displayTopic} starter code, worked example, and test-case checklist.`,
      `Python reference snippet, sample input/output, and debugging guide for ${topic}.`,
      `Annotated code example, short reading, and practice prompt aligned to ${topic}.`,
      `Instructor-provided notebook, trace table, and solution rubric for ${topic}.`,
      `${displayTopic} boundary-input table, starter notebook, and model explanation.`,
      `Short ${topic} reading, runnable example, and pair-review checklist.`,
      `Python style note, failing-test sample, and corrected ${topic} implementation.`,
      `Code-tracing worksheet, sandbox link, and ${topic} submission rubric.`,
    ]),
    evaluateDesign: pick([
      `For ${topic}, pair the trace prompt with the exact starter file students revise before grading.`,
      `Grade ${topic} with three separate marks: runnable code, observed output, and explanation quality.`,
      `Anchor the ${topic} class task to one named input so the assessment checks the same behavior.`,
      `Ask students to rerun the ${topic} fix and paste the changed output beside the patched line.`,
      `Use a boundary input for ${topic} in lab, then change one value for the submitted checkpoint.`,
      `Point the ${topic} resource to the syntax rule students must use in the graded snippet.`,
      `Turn ${topic} feedback into a before-and-after code cell students can compare during review.`,
      `Have students defend the ${topic} implementation by naming one rejected Python alternative.`,
      `Keep ${topic} practice centered on a tested snippet instead of a definition-only answer.`,
      `Split the ${topic} rubric into correctness, code clarity, and test evidence rows.`,
      `Move the ${topic} lesson from prediction to execution to revision without changing artifacts midstream.`,
      `Check ${topic} vocabulary by asking students to label the working line in their own program.`,
      `For ${topic}, require one normal-case run and one edge-case run in the same submission.`,
      `Ask pairs to inspect a ${topic} bug report, propose a patch, and compare rerun evidence.`,
      `Tie the ${topic} mini-program to a visible console result rather than a broad reflection prompt.`,
      `Use the ${topic} assessment to verify state changes, not just whether students remember syntax names.`,
      `Have students annotate the ${topic} trace table before they open the interpreter output.`,
      `Keep the ${topic} resource, lab step, and quiz item on the same variable or data example.`,
      `Ask students to explain the ${topic} failure mode that their final test is designed to catch.`,
      `Make the ${topic} review question point to a specific line number or expression in the snippet.`,
      `For ${topic}, collect a short commit note naming the behavior changed by the repair.`,
      `Require the ${topic} checkpoint to include one screenshot or copied output from a fresh run.`,
      `Use a peer-readable ${topic} example so reviewers can reproduce the result without instructor hints.`,
      `End the ${topic} section with one transfer question that changes the input but preserves the pattern.`,
    ]),
  };
}

// v0.15.187 (live crucible catch 3): the finish-pass repair replaced a
// midterm week's assessment cell with pool text minted from the lesson topic
// ("Midterm exam edge-case probe: choose one boundary input…") — REGISTERING
// A NEW EXAM after the package had already compiled. The re-derived registry
// then promised an exam paper no compile ever built and the grader blocked
// the package. Assessment identity is sacred once written:
//  - a weeklyAssessments cell whose atoms carry exam identity is never
//    template-repaired (the identity IS the content), and
//  - minted fallback text must never classify as an exam.
function assessmentAtomIdentity(atom) {
  return text(atom)
    .replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '')
    .replace(/→.*$/, '')
    .trim();
}

function assessmentCellCarriesExamIdentity(value) {
  if (Array.isArray(value)) return value.some(assessmentCellCarriesExamIdentity);
  return text(value)
    .split(/\n|;/)
    .map(assessmentAtomIdentity)
    .filter(Boolean)
    .some((atom) => classifyAssessmentKind(atom) === 'exam');
}

function stripExamNouns(topic) {
  return text(topic)
    .replace(/\b(?:midterms?|finals?|comprehensive|exams?|examinations?)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^(?:and|or)\s+|\s+(?:and|or)$/gi, '')
    .trim();
}

function getCourseMapFallbackValue(key, courseMap, lesson, section, lessonIndex) {
  if (key === 'weeklyAssessments' && assessmentCellCarriesExamIdentity(section?.[key])) {
    // Never re-author a promised exam. Returning the original value makes
    // the calling repair loop a no-op for this cell (at the cost of one
    // cosmetic repairedFields entry when a predicate flagged it).
    return section[key];
  }
  const rawTopic = getCourseMapTopic(courseMap, lesson, section, lessonIndex);
  // An exam-week lesson topic ("Midterm exam") must not seed an assessment
  // title that classifies as a new exam.
  const topic =
    key === 'weeklyAssessments' && classifyAssessmentKind(rawTopic) === 'exam'
      ? stripExamNouns(rawTopic) || 'review and practice'
      : rawTopic;
  // Rotate filler stems by section position so repaired sparse maps do not
  // stamp the identical sentence into every lesson and section — repeated
  // stems used to flow verbatim into every compiled deliverable.
  const sections = Array.isArray(lesson?.sections) ? lesson.sections : [];
  const sectionNumberMatch = text(section?.topicSection).match(/^\s*\d+\.(\d+)/);
  const inferredSectionIndex = sectionNumberMatch ? Math.max(0, Number(sectionNumberMatch[1]) - 1) : 0;
  const directSectionIndex = sections.indexOf(section);
  const matchedSectionIndex = sections.findIndex(
    (candidate) => text(candidate?.topicSection) && text(candidate?.topicSection) === text(section?.topicSection),
  );
  const sectionIndex =
    directSectionIndex >= 0
      ? directSectionIndex
      : matchedSectionIndex >= 0
        ? matchedSectionIndex
        : inferredSectionIndex;
  const variantIndex = (Number(lessonIndex) || 0) * Math.max(1, sections.length) + sectionIndex;
  const pick = (variants) => variants[variantIndex % variants.length];
  // One lesson-level submitted task is enough. Missing assessment cells in
  // later sections are formative checks, not new graded artifacts. Naming
  // that intent here keeps a late CourseMap→Graph derivation from promising
  // two extra assignment briefs the compiler never scheduled.
  const formativeAssessmentPrefix = sectionIndex > 0 ? 'In-class ' : '';
  const profile = inferCourseMapFallbackProfile(courseMap, lesson, section);
  const fieldFallbacks =
    profile === 'history'
      ? getHistoryCourseMapFallbacks(topic, pick)
      : profile === 'literature'
        ? getLiteratureCourseMapFallbacks(topic, pick)
        : profile === 'project-management'
          ? getProjectManagementCourseMapFallbacks(topic, pick)
          : profile === 'ux-design'
            ? getUxDesignCourseMapFallbacks(topic, pick)
            : profile === 'computer-science'
              ? getComputerScienceCourseMapFallbacks(topic, pick)
              : profile === 'music-theory'
                ? getMusicTheoryCourseMapFallbacks(topic, pick, lesson, section, courseMap)
                : {
                    learningGoals: pick([
                      `Use ${topic} to explain a course problem and prepare evidence for the next assessment.`,
                      `Trace how ${topic} changes what students can observe, label, calculate, or decide.`,
                      `Develop an evidence-backed account of ${topic} for course applications.`,
                    ]),
                    topicSection: topic,
                    learningObjectives: pick([
                      `Explain the key ideas in ${topic} and apply them in course activities.`,
                      `Apply the main concepts from ${topic} to a course task or example.`,
                      `Connect ${topic} to the week's work and explain one supporting evidence source.`,
                      `Analyze an example using ${topic} and name one limitation or open question.`,
                    ]),
                    weeklyAssessments: pick([
                      `${formativeAssessmentPrefix}${displayCourseMapTopic(topic)} evidence check: state one supported, bounded conclusion.`,
                      `${formativeAssessmentPrefix}Apply ${displayCourseMapTopic(topic)} to one example and name one limitation.`,
                      `${formativeAssessmentPrefix}${displayCourseMapTopic(topic)} exit reflection: connect evidence to the lesson task.`,
                      `${formativeAssessmentPrefix}${displayCourseMapTopic(topic)} short analysis: claim, evidence, and next question.`,
                    ]),
                    asyncActivities: pick([
                      `Annotate the instructor-provided resource for ${topic} and bring one usable example.`,
                      `Prepare a source note that names one claim, example, or question about ${topic}.`,
                      `Compare the lesson resource with a sample response and mark where ${topic} appears.`,
                      `Draft one question about ${topic} that can be answered with course evidence.`,
                    ]),
                    syncActivities: pick([
                      `Compare two examples of ${topic} and explain which evidence is stronger.`,
                      `Practice applying ${topic} in pairs, then revise one response from feedback.`,
                      `Use a guided case, text, dataset, or demonstration to test ${topic}.`,
                      `Share one ${topic} claim and identify the evidence that would make it stronger.`,
                    ]),
                    technologyNeeded: pick([
                      'Course site, instructor-provided resource, and the tool used for the lesson activity.',
                      'Shared reading, example file, or activity handout plus a workspace for responses.',
                      'Instructor-provided materials and the classroom tool named for the lesson task.',
                      'Course platform, accessible resource file, and response workspace for the checkpoint.',
                    ]),
                    presentationFormat: pick([
                      'Instructor framing, guided student work, and a short synthesis.',
                      'Brief setup, worked example or demonstration, then student application.',
                      'Opening question, structured practice, and a closing artifact review.',
                    ]),
                    supportingResources: pick([
                      `Instructor-selected ${topic} reading or evidence excerpt with an activity prompt.`,
                      `Short ${topic} reading, worked model, or practice handout.`,
                      `${topic} worked example and response guide for student reference.`,
                      `${topic} activity directions, reference note, and feedback guide.`,
                    ]),
                    evaluateDesign: pick([
                      `Check that the ${topic} resource, activity, and assessment all ask for one visible product.`,
                      `Confirm students use the same source detail or example for ${topic} practice and assessment.`,
                      `Align the ${topic} activity with one observable response, artifact, or explanation.`,
                      `Make the ${topic} practice task produce evidence students can reuse in the assessment.`,
                    ]),
                  };
  const value = fieldFallbacks[key] || `Instructor-confirmed material for ${topic}.`;
  // Belt: no minted assessment title may register as an exam, whatever the
  // frame pool produced.
  if (key === 'weeklyAssessments' && classifyAssessmentKind(value) === 'exam') {
    return `${displayCourseMapTopic(stripExamNouns(topic) || 'review and practice')} evidence check with instructor feedback.`;
  }
  return value;
}

function isShortCourseMapListCell(value) {
  const parts = text(value)
    .split(/\n|;/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.length > 6) return false;
  return parts.every((part) => {
    const words = part.split(/\s+/).filter(Boolean);
    return words.length <= 6 && !/[.?!:]$/.test(part);
  });
}

function needsGenericAssessmentScaffoldRepair(key, value) {
  if (key !== 'weeklyAssessments') return false;
  const raw = text(value);
  if (!raw) return false;
  return (
    GENERIC_ASSESSMENT_SCAFFOLD_RE.test(raw) ||
    GENERIC_ASSESSMENT_NEW_EXAMPLE_RE.test(raw) ||
    GENERIC_ASSESSMENT_COURSE_DECISION_RE.test(raw)
  );
}

function needsCourseMapSemanticRepair(key, value, courseMap, lesson, section) {
  const raw = text(value);
  if (!raw) return false;
  // A supporting-resource cell is a short source label, not a second copy of
  // the instructor's entire build request. Small models sometimes paste the
  // full brief here; that then leaks into every compiled surface as if it were
  // an assigned reading. Preserve concise titles/lists and replace only the
  // unmistakable paragraph-shaped prompt artifact.
  if (key === 'supportingResources' && raw.length > 240 && raw.split(/\s+/).length > 35) return true;
  if (needsCourseTitleOnlyTopicRepair(raw, courseMap)) return true;
  if (hasRepeatedShortTopicReference(raw, courseMap)) return true;
  const profile = inferCourseMapFallbackProfile(courseMap, lesson, section);
  if (profile === 'music-theory') {
    const unnumbered = raw.replace(/^\s*\d+[.)]\s*/, '').trim();
    const musicEvidenceCue = /\b(?:notation|notated|audio|listening|aural|pitch|semitone|staff|interval)\b/i;
    if (key === 'supportingResources' && unnumbered.toLowerCase() === text(courseMap?.courseName).toLowerCase()) {
      return true;
    }
    if (
      key === 'technologyNeeded' &&
      /\bLMS\b/i.test(raw) &&
      /video conferencing/i.test(raw) &&
      /shared documents?/i.test(raw) &&
      !musicEvidenceCue.test(raw)
    ) {
      return true;
    }
    if (
      ['asyncActivities', 'syncActivities'].includes(key) &&
      /\b(?:Practice|Draft|Workshop|Peer review):/i.test(raw)
    ) {
      return true;
    }
    if (key === 'presentationFormat' && /^Workshop\s*\+\s*guided practice\.?$/i.test(raw)) return true;
  }
  if (profile === 'history') {
    if (GENERIC_COURSE_MAP_FALLBACK_RE.test(raw)) return true;
    return key === 'weeklyAssessments' && isShortCourseMapListCell(raw);
  }
  return hasRepeatedCourseTitleOnlyTopics(courseMap) && GENERIC_COURSE_MAP_FALLBACK_RE.test(raw);
}

function stripCourseMapListPrefix(value) {
  const raw = text(value);
  // v0.14.1 (1.14): goal-reference labels ("1a.", "2b.") are load-bearing —
  // deriveFromCourseMap maps outcomes back to goals through them. Only bare
  // numbering ("1.", "a)", "-") is redundant and stripped.
  if (/^\s*\d+[a-z][.)]/i.test(raw)) return raw.trim();
  return raw.replace(/^\s*(?:[-*•]|\d+[.)]?|[a-z][.)])\s*/i, '');
}

function normalizeCourseMapObjectives(value) {
  if (Array.isArray(value)) return value.map(normalizeCourseMapObjectives).filter(Boolean);
  const raw = text(value);
  if (!raw) return value;
  const normalizedLines = raw
    .split(/\n|;/)
    .map((line) => {
      // v0.14.1 (1.14): keep goal-reference prefixes intact; strip only the
      // stem and redundant bare numbering, then enforce terminal punctuation.
      const goalMatch = text(line).match(/^\s*(\d+[a-z])[.)]\s*(.*)$/i);
      const label = goalMatch ? `${goalMatch[1]}.` : '';
      const body = (goalMatch ? goalMatch[2] : stripCourseMapListPrefix(line))
        .replace(/^students?\s+will\s+be\s+able\s+to:?\s*/i, '')
        .trim();
      if (!body) return '';
      // v0.12.1: deterministic terminal punctuation — the v0.12 audit shipped
      // one course with 120/120 objective lines missing periods while the
      // other three had them (same template, different-run drift).
      const punctuated = /[.?!:]$/.test(body) ? body : `${body}.`;
      return label ? `${label} ${punctuated}` : punctuated;
    })
    .filter(Boolean);
  const normalized = normalizedLines.join('\n');
  return normalized || raw.replace(/^students?\s+will\s+be\s+able\s+to:?\s*/i, '').trim();
}

function stripObjectiveStemText(value) {
  if (Array.isArray(value)) return value.map(stripObjectiveStemText);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stripObjectiveStemText(item)]));
  }
  if (typeof value !== 'string') return value;
  const stripped = value.replace(/\bstudents?\s+will\s+be\s+able\s+to:?\s*/gi, '');
  if (stripped === value) return value;
  return stripped
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeLessonRangeReferences(value, lessonCount) {
  if (Array.isArray(value)) return value.map((item) => normalizeLessonRangeReferences(item, lessonCount));
  const raw = text(value);
  if (!raw || !Number.isInteger(lessonCount) || lessonCount <= 0) return value;
  return raw.replace(/\bLessons?\s+1\s*([–-])\s*(\d{1,2})\b/gi, (match, dash, end) => {
    const endNumber = Number(end);
    return endNumber > lessonCount ? `Lessons 1${dash}${lessonCount}` : match;
  });
}

function normalizeCourseMapCellValue(key, value, lessonCount) {
  let next = key === 'learningObjectives' ? normalizeCourseMapObjectives(value) : value;
  next = normalizeLessonRangeReferences(next, lessonCount);
  return next;
}

function normalizeCourseMapLessonTitle(title, lessonIndex, lessonCount, sourceLessonNumber = null) {
  const raw = text(title);
  const match = raw.match(/^(lesson|week|module)\s*(\d{1,2})\s*[:.-]?\s*(.*)$/i);
  if (!match) return title;
  const currentNumber = Number(match[2]);
  const preservedNumber = Number(sourceLessonNumber);
  const hasSourceNumber = Number.isInteger(preservedNumber) && preservedNumber > 0;
  const expectedNumber = hasSourceNumber ? preservedNumber : lessonIndex + 1;
  if (currentNumber === expectedNumber && (hasSourceNumber || currentNumber <= lessonCount)) return title;
  const topic = match[3]?.trim() || `Topic ${expectedNumber}`;
  return `Lesson ${expectedNumber}: ${topic}`;
}

function needsCourseMapFieldRepair(value) {
  return !hasMeaningfulValue(value) || findPublishabilityPlaceholders(value, { limit: 1 }).length > 0;
}

// v0.14.1 (1.15b): final corruption assertion — repaired course-map output
// may never carry JSON syntax into a cell. The OUTPUT-V014 Mandarin run
// shipped 'topicSection": "' verbatim in row 26 and the corruption
// propagated into the brief and syllabus.
const CELL_JSON_SPLICE_RE = /(?:^|[^\\])"\s*:\s*["[]/;
const CELL_JSON_KEY_RE =
  /\b(?:topicSection|learningGoals|learningObjectives|weeklyAssessments|asyncActivities|syncActivities|technologyNeeded|presentationFormat|supportingResources|evaluateDesign)"/;

function courseMapCellIsCorrupted(value) {
  const raw = text(value);
  if (!raw) return false;
  return CELL_JSON_SPLICE_RE.test(raw) || CELL_JSON_KEY_RE.test(raw);
}

export function repairCourseMapReadiness({ courseMap, columns = [], lessonFilter = null } = {}) {
  const lessons = asArray(courseMap?.lessons);
  if (!courseMap || typeof courseMap !== 'object' || lessons.length === 0) {
    return { changed: false, courseMap, repairedFields: [] };
  }

  const lessonIndices = getLessonIndices(courseMap, lessonFilter);
  const requestedColumnKeys = enabledColumnKeys(columns);
  const columnsToRepair = requestedColumnKeys.length > 0 ? requestedColumnKeys : DEFAULT_COURSE_MAP_COLUMN_KEYS;
  const columnsToNormalize = columnsToRepair;
  const repairedFields = [];
  let changed = false;

  const nextLessons = lessons.map((lesson, lessonIndex) => {
    if (!lessonIndices.includes(lessonIndex)) return lesson;
    let nextLesson = lesson;

    if (
      needsCourseMapFieldRepair(lesson?.title) ||
      isGenericNumberedCourseMapTopic(lesson?.title) ||
      needsCourseTitleOnlyTopicRepair(lesson?.title, courseMap) ||
      isDomainCourseTitleOnlyWeakTopic(lesson?.title, courseMap) ||
      isCourseTitlePrefixedFallbackTopic(lesson?.title, courseMap) ||
      isConjoinedAssessmentEventTopic(lesson?.title) ||
      isAssessmentLabelCourseMapIdentity(lesson?.title) ||
      needsRepeatedShortTopicRepair(lesson?.title, courseMap)
    ) {
      const titleTopic = getCourseMapTopic(courseMap, lesson, asArray(lesson?.sections)[0], lessonIndex);
      nextLesson = {
        ...nextLesson,
        title: `Lesson ${lessonIndex + 1}: ${titleTopic}`,
      };
      repairedFields.push(`Lesson ${lessonIndex + 1} title`);
      changed = true;
    }

    const normalizedTitle = normalizeCourseMapLessonTitle(
      nextLesson.title,
      lessonIndex,
      lessons.length,
      nextLesson.sourceLessonNumber,
    );
    if (stableJson(normalizedTitle) !== stableJson(nextLesson.title)) {
      nextLesson = {
        ...nextLesson,
        title: normalizedTitle,
      };
      repairedFields.push(`Lesson ${lessonIndex + 1} title numbering`);
      changed = true;
    }

    if (!Array.isArray(nextLesson.sections) || nextLesson.sections.length === 0 || columnsToNormalize.length === 0) {
      return nextLesson;
    }

    const stemCleanedLesson = stripObjectiveStemText(nextLesson);
    if (stableJson(stemCleanedLesson) !== stableJson(nextLesson)) {
      nextLesson = stemCleanedLesson;
      repairedFields.push(`Lesson ${lessonIndex + 1} objective stem text`);
      changed = true;
    }

    let sectionsChanged = false;
    const sections = nextLesson.sections.map((section, sectionIndex) => {
      let nextSection = section;
      const originalAlignmentInputs = stableJson([
        section?.learningObjectives,
        section?.weeklyAssessments,
        section?.asyncActivities,
        section?.syncActivities,
      ]);
      for (const key of columnsToRepair) {
        if (!needsCourseMapFieldRepair(nextSection?.[key])) continue;
        nextSection = {
          ...nextSection,
          [key]: getCourseMapFallbackValue(key, courseMap, nextLesson, nextSection, lessonIndex),
        };
        repairedFields.push(`Lesson ${lessonIndex + 1}, Section ${sectionIndex + 1} ${columnLabel(columns, key)}`);
        sectionsChanged = true;
        changed = true;
      }
      for (const key of columnsToNormalize) {
        const normalizedValue = normalizeCourseMapCellValue(key, nextSection?.[key], lessons.length);
        if (stableJson(normalizedValue) === stableJson(nextSection?.[key])) continue;
        nextSection = {
          ...nextSection,
          [key]: normalizedValue,
        };
        // v0.14.1 (1.14): formatting normalizations are labeled distinctly
        // from genuine template fills so run logs stop reporting 30 fake
        // content "repairs" per run — consumers can filter on the suffix.
        repairedFields.push(
          `Lesson ${lessonIndex + 1}, Section ${sectionIndex + 1} ${columnLabel(columns, key)} (formatting)`,
        );
        sectionsChanged = true;
        changed = true;
      }
      // Sparse history maps can be "complete" but still carry generic
      // cross-discipline fallback text from an older repair pass. Treat that
      // as a semantic repair so history exports stop mentioning lab materials
      // or STEM-style observation verbs.
      for (const key of columnsToNormalize) {
        if (!needsCourseMapSemanticRepair(key, nextSection?.[key], courseMap, nextLesson, nextSection)) continue;
        nextSection = {
          ...nextSection,
          [key]: getCourseMapFallbackValue(key, courseMap, nextLesson, nextSection, lessonIndex),
        };
        repairedFields.push(
          `Lesson ${lessonIndex + 1}, Section ${sectionIndex + 1} ${columnLabel(columns, key)} (semantic)`,
        );
        sectionsChanged = true;
        changed = true;
      }
      // Native skeleton recovery can produce complete-looking cells whose
      // only "topic" is Session N / Topic N. Replace those before they become
      // exported file names, lesson concepts, or source-finder topics.
      for (const key of columnsToNormalize) {
        if (!hasGenericNumberedCourseMapReference(nextSection?.[key], lessonIndex)) continue;
        nextSection = {
          ...nextSection,
          [key]: getCourseMapFallbackValue(key, courseMap, nextLesson, nextSection, lessonIndex),
        };
        repairedFields.push(
          `Lesson ${lessonIndex + 1}, Section ${sectionIndex + 1} ${columnLabel(columns, key)} (generic session)`,
        );
        sectionsChanged = true;
        changed = true;
      }
      // Prompt requests often list artifact genres ("lesson plans, slide
      // decks, rubrics..."). If fallback authoring mistakes those labels for
      // content, replace the cell from the real lesson topic before compile.
      for (const key of columnsToNormalize) {
        if (!needsPromptArtifactCourseMapRepair(key, nextSection?.[key], courseMap)) continue;
        nextSection = {
          ...nextSection,
          [key]: getCourseMapFallbackValue(key, courseMap, nextLesson, nextSection, lessonIndex),
        };
        repairedFields.push(
          `Lesson ${lessonIndex + 1}, Section ${sectionIndex + 1} ${columnLabel(columns, key)} (prompt artifact)`,
        );
        sectionsChanged = true;
        changed = true;
      }
      // Generic assessment scaffolds can look complete enough to bypass blank
      // repair, then seed repeated "quick evidence" or "exit ticket using"
      // titles into every exported material. Repair them after prompt-artifact
      // cleanup so topic inference still uses the lesson concept, not the
      // scaffold sentence.
      for (const key of columnsToNormalize) {
        if (!needsGenericAssessmentScaffoldRepair(key, nextSection?.[key])) continue;
        nextSection = {
          ...nextSection,
          [key]: getCourseMapFallbackValue(key, courseMap, nextLesson, nextSection, lessonIndex),
        };
        repairedFields.push(
          `Lesson ${lessonIndex + 1}, Section ${sectionIndex + 1} ${columnLabel(columns, key)} (assessment scaffold)`,
        );
        sectionsChanged = true;
        changed = true;
      }
      // Assessment-registry labels with grade weights are valid assessment
      // metadata, but they are not lesson topics. When they appear inside
      // Course Map cells, they seed bad filenames and source concept links.
      for (const key of columnsToNormalize) {
        if (!hasAssessmentLabelCourseMapIdentityReference(nextSection?.[key])) continue;
        nextSection = {
          ...nextSection,
          [key]: getCourseMapFallbackValue(key, courseMap, nextLesson, nextSection, lessonIndex),
        };
        repairedFields.push(
          `Lesson ${lessonIndex + 1}, Section ${sectionIndex + 1} ${columnLabel(columns, key)} (assessment identity)`,
        );
        sectionsChanged = true;
        changed = true;
      }
      // If the map's weak topic is embedded in otherwise complete-looking
      // cells, repair those cells too. Otherwise a title-only fix still lets
      // the same skeleton label leak into exported Course Map rows and file
      // stems through objectives, assessments, and resource text.
      for (const key of columnsToNormalize) {
        if (!hasWeakCourseMapTopicReference(nextSection?.[key], courseMap)) continue;
        nextSection = {
          ...nextSection,
          [key]: getCourseMapFallbackValue(key, courseMap, nextLesson, nextSection, lessonIndex),
        };
        repairedFields.push(
          `Lesson ${lessonIndex + 1}, Section ${sectionIndex + 1} ${columnLabel(columns, key)} (weak topic)`,
        );
        sectionsChanged = true;
        changed = true;
      }
      // v0.14.1 (1.15b): no cell leaves the repair pass with JSON syntax in
      // it — corrupted cells are replaced through the same clean fallback
      // fill and logged loudly so the corruption stays visible upstream.
      for (const key of columnsToNormalize) {
        if (!courseMapCellIsCorrupted(nextSection?.[key])) continue;
        nextSection = {
          ...nextSection,
          [key]: getCourseMapFallbackValue(key, courseMap, nextLesson, nextSection, lessonIndex),
        };
        repairedFields.push(
          `Lesson ${lessonIndex + 1}, Section ${sectionIndex + 1} ${columnLabel(columns, key)} (corruption)`,
        );
        sectionsChanged = true;
        changed = true;
      }
      const repairedAlignmentInputs = stableJson([
        nextSection?.learningObjectives,
        nextSection?.weeklyAssessments,
        nextSection?.asyncActivities,
        nextSection?.syncActivities,
      ]);
      if (
        originalAlignmentInputs !== repairedAlignmentInputs &&
        asArray(nextLesson?.compilerDerived).includes('evaluateDesign')
      ) {
        const recalculatedEvaluateDesign = deriveEvaluateDesign(nextSection);
        if (stableJson(recalculatedEvaluateDesign) !== stableJson(nextSection?.evaluateDesign)) {
          nextSection = { ...nextSection, evaluateDesign: recalculatedEvaluateDesign };
          repairedFields.push(
            `Lesson ${lessonIndex + 1}, Section ${sectionIndex + 1} ${columnLabel(columns, 'evaluateDesign')} (alignment recompute)`,
          );
          sectionsChanged = true;
          changed = true;
        }
      }
      return nextSection;
    });

    return sectionsChanged ? { ...nextLesson, sections } : nextLesson;
  });

  return {
    changed,
    courseMap: changed ? { ...courseMap, lessons: nextLessons } : courseMap,
    repairedFields,
  };
}

function repairFeatureData(featureId, data, { courseMap, config, deliverables } = {}) {
  let current = data;
  const summaries = [];

  switch (featureId) {
    case 'syllabus':
      current = applyRepair(current, summaries, 'cleaned syllabus placeholders', normalizeSyllabusPublishability);
      current = applyRepair(
        current,
        summaries,
        'filled syllabus overview and schedule',
        normalizeSyllabusCompleteness,
        courseMap,
      );
      break;
    case 'lessonPlans':
      current = applyRepair(
        current,
        summaries,
        'cleaned lesson plan publishability',
        normalizeLessonPlanPublishability,
      );
      current = applyRepair(
        current,
        summaries,
        'added lesson plan teaching support',
        normalizeLessonPlanTeachingSupport,
      );
      break;
    case 'slideDecks':
      current = applyRepair(current, summaries, 'filled slide speaker notes', normalizeSlideDeckSpeakerNotes);
      current = applyRepair(current, summaries, 'improved slide accessibility', normalizeSlideDeckAccessibility);
      break;
    case 'assignments':
      current = applyRepair(
        current,
        summaries,
        'aligned assignments to lessons',
        normalizeAssignmentLessonAlignment,
        courseMap,
      );
      current = applyRepair(
        current,
        summaries,
        'aligned assignments to assessment objectives',
        normalizeAssignmentAssessmentAlignment,
        courseMap,
      );
      current = applyRepair(current, summaries, 'normalized assignment grade weights', normalizeAssignmentGradeWeights);
      break;
    case 'rubrics':
      current = applyRepair(current, summaries, 'filled assessed-lesson rubrics', normalizeRubricCoverage, courseMap);
      current = applyRepair(current, summaries, 'normalized rubric support', normalizeRubricSupport);
      current = applyRepair(
        current,
        summaries,
        'aligned rubrics to assessments',
        normalizeRubricAssessmentAlignment,
        courseMap,
        deliverables?.assignments?.data,
      );
      break;
    case 'discussions':
      current = applyRepair(current, summaries, 'normalized discussion guidance', normalizeDiscussionPromptFields);
      break;
    case 'quizBank':
      current = applyRepair(current, summaries, 'normalized quiz question metadata', normalizeQuizBankQuestions);
      current = applyRepair(current, summaries, 'filled quiz question counts', normalizeQuizBankQuestionCounts);
      current = applyRepair(current, summaries, 'filled quiz answer guidance', normalizeQuizBankRationales);
      current = applyRepair(current, summaries, 'fixed quiz point totals', normalizeQuizBankPointTotals);
      current = applyRepair(current, summaries, 'cleaned quiz publishability', normalizeQuizBankPublishability);
      current = applyRepair(
        current,
        summaries,
        'aligned quiz objectives to lessons',
        normalizeQuizAssessmentAlignment,
        courseMap,
      );
      current = applyRepair(current, summaries, 'rebuilt quiz index', normalizeQuizBankIndex);
      break;
    case 'studyGuides':
      current = applyRepair(current, summaries, 'cleaned study-guide questions', normalizeStudyGuideQuestions);
      current = applyRepair(current, summaries, 'filled study-guide support', normalizeStudyGuideSupport);
      break;
    case 'courseFaq':
      current = applyRepair(current, summaries, 'normalized FAQ categories', normalizeCourseFaqCategories);
      current = applyRepair(
        current,
        summaries,
        'normalized FAQ question counts',
        normalizeCourseFaqQuestionCounts,
        config,
        courseMap,
      );
      current = applyRepair(
        current,
        summaries,
        'tailored repeated FAQ questions',
        normalizeCourseFaqQuestionVariety,
        courseMap,
        deliverables,
      );
      break;
    default:
      break;
  }

  return { data: current, summaries };
}

export function repairWorkspaceReadiness({
  courseMap,
  deliverables = {},
  selectedFeatures = null,
  deliverableConfig = {},
} = {}) {
  const featureIds = getSelectedFeatureIds(selectedFeatures, deliverables).filter(
    (featureId) => featureId !== 'courseMap',
  );
  let nextDeliverables = deliverables;
  const repairs = [];

  for (const featureId of featureIds) {
    const entry = deliverables?.[featureId];
    if (entry?.status !== 'done' || !entry.data) continue;

    const { data, summaries } = repairFeatureData(featureId, entry.data, {
      courseMap,
      config: deliverableConfig?.[featureId] || {},
      deliverables: nextDeliverables,
    });
    if (summaries.length === 0 || stableJson(data) === stableJson(entry.data)) continue;

    if (nextDeliverables === deliverables) nextDeliverables = { ...deliverables };
    nextDeliverables[featureId] = { ...entry, data };
    repairs.push({
      featureId,
      label: labelFor(featureId),
      changes: summaries,
      message: `${labelFor(featureId)} repaired: ${summaries.join('; ')}`,
    });
  }

  return {
    changed: repairs.length > 0,
    applied: repairs.length,
    repairs,
    repairedFeatureIds: repairs.map((repair) => repair.featureId),
    deliverables: nextDeliverables,
  };
}

function enabledColumnKeys(columns) {
  return asArray(columns)
    .filter((column) => column?.enabled !== false)
    .map((column) => column.key)
    .filter(Boolean);
}

function columnLabel(columns, key) {
  const column = asArray(columns).find((item) => item?.key === key);
  const raw = column?.label || column?.title || key || 'field';
  // Only camelCase keys need splitting — applying the regex to a label that
  // already has spaces produced "Learning  Objectives" in repair logs.
  const spaced = raw.includes(' ') ? raw : raw.replace(/([A-Z])/g, ' $1');
  return spaced
    .replace(/\s{2,}/g, ' ')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function hasMeaningfulValue(value) {
  const raw = text(value).trim();
  return raw.length >= 5 && !/^(tbd|todo|n\/a|\?|to be determined)$/i.test(raw);
}

function extractLessonNumbersFromText(value) {
  const numbers = new Set();
  const raw = text(value);
  for (const match of raw.matchAll(/\b(?:lesson|week|module|unit|session)\s*(\d{1,2})\b/gi)) {
    numbers.add(Number(match[1]));
  }
  return [...numbers].filter(Number.isFinite);
}

function itemLessonNumbers(item) {
  return extractLessonNumbersFromText([
    item?.lessonTitle,
    item?.lt,
    item?.title,
    item?.t,
    item?.assessmentTitle,
    item?.assessment,
    item?.taskTitle,
    item?.taskDirections,
    item?.linkedAssignment,
    item?.weekNumber,
    item?.wk,
    item?.dueWeek,
    item?.dw,
    ...(Array.isArray(item?.relatedLessons) ? item.relatedLessons : []),
    ...(Array.isArray(item?.rl) ? item.rl : []),
    ...(Array.isArray(item?.tags) ? item.tags : []),
    ...(Array.isArray(item?.tg) ? item.tg : []),
  ]);
}

function getExpectedItemForLesson(items, lessonIndex, lessonIndices) {
  const lessonNumber = lessonIndex + 1;
  const explicit = items.find((item) => itemLessonNumbers(item).includes(lessonNumber));
  if (explicit) return explicit;

  if (items.length >= Math.max(...lessonIndices, 0) + 1) return items[lessonIndex] || null;
  const localIndex = lessonIndices.indexOf(lessonIndex);
  return localIndex >= 0 ? items[localIndex] || null : null;
}

function inferImplicitRubricLessonNumber(rubrics, rubricIndex, lessonIndices, assessedLessonNumbers) {
  if (!Array.isArray(rubrics) || rubricIndex < 0) return null;

  if (rubrics.length === lessonIndices.length) {
    const lessonIndex = lessonIndices[rubricIndex];
    return Number.isInteger(lessonIndex) ? lessonIndex + 1 : null;
  }

  if (rubrics.length === assessedLessonNumbers.length) {
    return assessedLessonNumbers[rubricIndex] || null;
  }

  if (rubrics.length > lessonIndices.length && lessonIndices.includes(rubricIndex)) {
    return rubricIndex + 1;
  }

  return null;
}

function lessonAssessmentText(lesson) {
  return asArray(lesson?.sections)
    .map((section) => text(section?.weeklyAssessments || section?.assessment))
    .filter(Boolean)
    .join('\n');
}

function lessonHasAssessment(lesson) {
  const assessment = lessonAssessmentText(lesson);
  if (!assessment.trim()) return false;
  if (/\b(no assessment|none|n\/a|not applicable|optional only)\b/i.test(assessment)) return false;
  return /\b(assignment|paper|project|presentation|exam|quiz|test|portfolio|brief|report|case study|problem set|reflection|proposal|analysis|essay|final|midterm|checklist)\b/i.test(
    assessment,
  );
}

function countQuestions(item) {
  return asArray(item?.questions || item?.qs).length;
}

function countSlides(item) {
  return asArray(item?.slides || item?.sl).length;
}

function getSlideNotes(slide) {
  return text(slide?.speakerNotes || slide?.notes || slide?.no).trim();
}

function hasQuizMetadata(question) {
  const type = text(question?.type || question?.ty).trim();
  const difficulty = text(question?.difficulty || question?.df).trim();
  const estimatedMinutes = Number(question?.estimatedMinutes ?? question?.em);
  return Boolean(type && difficulty && Number.isFinite(estimatedMinutes));
}

function hasQuizAnswerGuidance(question) {
  const type = text(question?.type || question?.ty)
    .trim()
    .toLowerCase();
  const guidance = [
    question?.explanation,
    question?.ex,
    question?.feedback,
    question?.fb,
    question?.sampleAnswer,
    question?.sa,
  ];
  if (type === 'multiple_choice') {
    guidance.push(question?.distractorRationale, question?.dr);
  }
  return guidance.some(hasMeaningfulValue);
}

function meaningfulArrayCount(value) {
  return asArray(value).filter(hasMeaningfulValue).length;
}

function collectDiscussionGuidanceGaps(item) {
  const gaps = [];
  if (!hasMeaningfulValue(item?.evidenceRequirement || item?.er)) {
    gaps.push('evidence requirement');
  }

  if (meaningfulArrayCount(item?.followUpProbes || item?.fp) < 3) {
    gaps.push('fewer than 3 follow-up probes');
  }

  if (meaningfulArrayCount(item?.evaluationCriteria || item?.ec) < 2) {
    gaps.push('fewer than 2 evaluation criteria');
  }

  const tips = item?.facilitationTips || item?.ft || {};
  const hasOpening = hasMeaningfulValue(tips.opening || tips.op);
  const hasStallPlan = hasMeaningfulValue(tips.ifStalls || tips.is);
  const hasClosure = hasMeaningfulValue(tips.closure || tips.cl);
  if (!hasOpening || !hasStallPlan || !hasClosure) {
    gaps.push('incomplete facilitation tips');
  }

  return gaps;
}

function getPercent(value) {
  const number = Number(text(value).match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(number) ? number : 0;
}

function checkPublishabilityPlaceholders(featureId, value, issues) {
  const placeholders = findPublishabilityPlaceholders(value);
  placeholders.forEach((placeholder) => {
    issues.push(
      makeIssue(
        READINESS_WARNING,
        featureId,
        `${labelFor(featureId)} still contains unresolved placeholder text (${placeholder}).`,
      ),
    );
  });
}

function checkCourseMap(courseMap, columns, lessonIndices, issues) {
  const lessons = asArray(courseMap?.lessons);
  if (lessons.length === 0) {
    issues.push(makeIssue(READINESS_BLOCKER, 'courseMap', 'Course Map has no lessons.'));
    return;
  }

  const columnsToCheck = enabledColumnKeys(columns);
  for (const lessonIndex of lessonIndices) {
    const lesson = lessons[lessonIndex];
    const label = lesson?.title || `Lesson ${lessonIndex + 1}`;
    if (!text(lesson?.title).trim()) {
      issues.push(
        makeIssue(READINESS_BLOCKER, 'courseMap', `Lesson ${lessonIndex + 1} is missing a title.`, {
          target: { type: 'courseMapCell', lessonIndex, field: 'title' },
        }),
      );
    }
    const sections = asArray(lesson?.sections);
    if (sections.length === 0) {
      issues.push(makeIssue(READINESS_BLOCKER, 'courseMap', `${label} has no course-map sections.`));
      continue;
    }
    for (const key of columnsToCheck) {
      const hasValue = sections.some((section) => hasMeaningfulValue(section?.[key]));
      const hasPlaceholderValue = sections.some(
        (section) => findPublishabilityPlaceholders(section?.[key], { limit: 1 }).length > 0,
      );
      if (!hasValue && !hasPlaceholderValue) {
        issues.push(
          makeIssue(READINESS_WARNING, 'courseMap', `${label} has an empty ${columnLabel(columns, key)} field.`, {
            target: { type: 'courseMapCell', lessonIndex, sectionIndex: 0, field: key },
          }),
        );
      }
    }
  }
}

function checkCourseMapPlaceholders(courseMap, columns, lessonIndices, issues) {
  const lessons = asArray(courseMap?.lessons);
  const columnsToCheck = enabledColumnKeys(columns);

  for (const lessonIndex of lessonIndices) {
    const lesson = lessons[lessonIndex];
    if (!lesson) continue;

    findPublishabilityPlaceholders(lesson.title, { limit: 3 }).forEach((placeholder) => {
      issues.push(
        makeIssue(
          READINESS_WARNING,
          'courseMap',
          `Lesson ${lessonIndex + 1} title contains unresolved placeholder text (${placeholder}).`,
          {
            target: { type: 'courseMapCell', lessonIndex, field: 'title' },
          },
        ),
      );
    });

    asArray(lesson.sections).forEach((section, sectionIndex) => {
      columnsToCheck.forEach((key) => {
        findPublishabilityPlaceholders(section?.[key], { limit: 3 }).forEach((placeholder) => {
          issues.push(
            makeIssue(
              READINESS_WARNING,
              'courseMap',
              `Lesson ${lessonIndex + 1}, Section ${sectionIndex + 1} — ${columnLabel(columns, key)} contains unresolved placeholder text (${placeholder}).`,
              {
                target: { type: 'courseMapCell', lessonIndex, sectionIndex, field: key },
              },
            ),
          );
        });
      });
    });
  }
}

function checkPerLessonFeature(featureId, data, courseMap, lessonIndices, issues) {
  const items = getFeatureArray(featureId, data);
  if (items.length === 0) {
    issues.push(makeIssue(READINESS_BLOCKER, featureId, `${labelFor(featureId)} has no generated lesson items.`));
    return;
  }

  const lessons = asArray(courseMap?.lessons);
  for (const lessonIndex of lessonIndices) {
    const lessonTitle = lessons[lessonIndex]?.title || `Lesson ${lessonIndex + 1}`;
    const item = getExpectedItemForLesson(items, lessonIndex, lessonIndices);
    if (!item) {
      issues.push(makeIssue(READINESS_WARNING, featureId, `${labelFor(featureId)} is missing ${lessonTitle}.`));
      continue;
    }

    if (featureId === 'slideDecks') {
      const slides = asArray(item.slides || item.sl);
      if (slides.length < 3) {
        issues.push(makeIssue(READINESS_WARNING, featureId, `${lessonTitle} slide deck has fewer than 3 slides.`));
      }
      const missingNotes = slides.filter((slide) => !getSlideNotes(slide)).length;
      if (slides.length > 0 && missingNotes > 0) {
        issues.push(
          makeIssue(
            READINESS_WARNING,
            featureId,
            `${lessonTitle} has ${missingNotes} slide${missingNotes === 1 ? '' : 's'} with missing or very short speaker notes.`,
          ),
        );
      }
      const shortNotes = slides.filter((slide) => {
        const notes = getSlideNotes(slide);
        return notes && notes.split(/\s+/).filter(Boolean).length < 10;
      }).length;
      if (shortNotes > 0) {
        issues.push(
          makeIssue(
            READINESS_WARNING,
            featureId,
            `${lessonTitle} has ${shortNotes} slide${shortNotes === 1 ? '' : 's'} with very short speaker notes.`,
          ),
        );
      }
    }

    if (featureId === 'quizBank') {
      const questions = asArray(item.questions || item.qs);
      if (questions.length < 5) {
        issues.push(makeIssue(READINESS_WARNING, featureId, `${lessonTitle} quiz bank has fewer than 5 questions.`));
      }
      const metadataDrift = questions.filter((question) => !hasQuizMetadata(question)).length;
      if (metadataDrift > 0) {
        issues.push(
          makeIssue(READINESS_WARNING, featureId, `${lessonTitle} has ${metadataDrift} quiz question metadata gap(s).`),
        );
      }
      const missingGuidance = questions.filter((question) => !hasQuizAnswerGuidance(question)).length;
      if (missingGuidance > 0) {
        issues.push(
          makeIssue(
            READINESS_WARNING,
            featureId,
            `${lessonTitle} has ${missingGuidance} quiz question${missingGuidance === 1 ? '' : 's'} missing answer guidance.`,
          ),
        );
      }
    }

    if (featureId === 'courseFaq') {
      const questions = asArray(item.questions || item.qs);
      if (questions.length < 3) {
        issues.push(makeIssue(READINESS_WARNING, featureId, `${lessonTitle} FAQ has fewer than 3 questions.`));
      } else if (questions.length < 5) {
        issues.push(makeIssue(READINESS_WARNING, featureId, `${lessonTitle} FAQ has fewer than 5 questions.`));
      }
      const badCategories = questions.filter(
        (question) => !FAQ_CATEGORIES.has(text(question.category || question.ca)),
      ).length;
      if (badCategories > 0) {
        issues.push(
          makeIssue(
            READINESS_WARNING,
            featureId,
            `${lessonTitle} has ${badCategories} unsupported FAQ categor${badCategories === 1 ? 'y' : 'ies'}.`,
          ),
        );
      }
    }

    if (featureId === 'discussions') {
      const gaps = collectDiscussionGuidanceGaps(item);
      if (gaps.length > 0) {
        issues.push(
          makeIssue(
            READINESS_WARNING,
            featureId,
            `${lessonTitle} discussion prompt is missing instructor guidance: ${gaps.join(', ')}.`,
          ),
        );
      }
    }
  }
}

// v0.16.1: the compiler deliberately gives exam-kind assessments an answer
// key in the Quiz & Exam Bank instead of a rubric (courseBlueprintCompiler
// filters kind === 'exam' out of compileRubrics). The readiness check used to
// disagree — a final-exam-only lesson warned "Rubrics are missing assessed
// lesson(s): 14" forever, a warning no generation could ever satisfy. A
// lesson whose ONLY assessment is an exam is not rubric-assessed.
function lessonAssessmentsAreExamOnly(lesson) {
  const assessment = lessonAssessmentText(lesson);
  if (!/\b(exam|midterm|final)\b/i.test(assessment)) return false;
  const withoutExamPhrases = assessment.replace(/[^.;\n]*\b(exam|midterm|final)\b[^.;\n]*/gi, ' ');
  return !/\b(assignment|paper|project|presentation|quiz|portfolio|brief|report|case study|problem set|reflection|proposal|essay|checklist)\b/i.test(
    withoutExamPhrases,
  );
}

function checkRubrics(data, courseMap, lessonIndices, issues) {
  const rubrics = getFeatureArray('rubrics', data);
  const lessons = asArray(courseMap?.lessons);
  const assessedLessonNumbers = lessonIndices
    .filter(
      (lessonIndex) => lessonHasAssessment(lessons[lessonIndex]) && !lessonAssessmentsAreExamOnly(lessons[lessonIndex]),
    )
    .map((lessonIndex) => lessonIndex + 1);

  if (assessedLessonNumbers.length === 0) return;
  if (rubrics.length === 0) {
    issues.push(makeIssue(READINESS_BLOCKER, 'rubrics', 'Rubrics are missing for assessed lessons.'));
    return;
  }

  const covered = new Set();
  rubrics.forEach((rubric, rubricIndex) => {
    const explicitLessonNumbers = itemLessonNumbers(rubric);
    if (explicitLessonNumbers.length > 0) {
      explicitLessonNumbers.forEach((number) => covered.add(number));
      return;
    }

    const implicitLessonNumber = inferImplicitRubricLessonNumber(
      rubrics,
      rubricIndex,
      lessonIndices,
      assessedLessonNumbers,
    );
    if (implicitLessonNumber) covered.add(implicitLessonNumber);
  });
  if (covered.size === 0 && rubrics.length >= assessedLessonNumbers.length) return;

  const missing = assessedLessonNumbers.filter((lessonNumber) => !covered.has(lessonNumber));
  if (missing.length > 0) {
    issues.push(
      makeIssue(READINESS_WARNING, 'rubrics', `Rubrics are missing assessed lesson(s): ${missing.join(', ')}.`),
    );
  }
}

function checkAssignments(data, courseMap, lessonIndices, issues) {
  const assignments = getFeatureArray('assignments', data);
  const lessons = asArray(courseMap?.lessons);
  const hasAssessments = lessonIndices.some((lessonIndex) => lessonHasAssessment(lessons[lessonIndex]));
  if (hasAssessments && assignments.length === 0) {
    issues.push(makeIssue(READINESS_BLOCKER, 'assignments', 'Assignment Briefs have no generated assignments.'));
    return;
  }

  const gradeTotal = assignments.reduce(
    (sum, assignment) => sum + getPercent(assignment.percentOfGrade || assignment.pg),
    0,
  );
  // Registry-linked briefs are only one projection of the authoritative
  // assessment registry: quizzes/exams live in Quiz & Exam Bank and may hold
  // the remaining course weight. Only legacy standalone brief collections
  // are expected to total 100% by themselves.
  const hasRegistryLinkedAssignments = assignments.some(
    (assignment) => assignment?.assessmentId || assignment?.courseMapRef || assignment?.cmr,
  );
  if (!hasRegistryLinkedAssignments && gradeTotal > 0 && (gradeTotal < 95 || gradeTotal > 105)) {
    issues.push(
      makeIssue(
        READINESS_WARNING,
        'assignments',
        `Assignment grade weights sum to ${Math.round(gradeTotal)}%, not about 100%.`,
      ),
    );
  }

  const missingLessonLinks = assignments.filter(
    (assignment) => asArray(assignment.relatedLessons || assignment.rl).length === 0,
  ).length;
  if (missingLessonLinks > 0) {
    issues.push(
      makeIssue(
        READINESS_WARNING,
        'assignments',
        `${missingLessonLinks} assignment${missingLessonLinks === 1 ? '' : 's'} missing related lesson links.`,
      ),
    );
  }
}

function checkSyllabus(data, issues) {
  const syllabus = data?.syllabus && typeof data.syllabus === 'object' ? data.syllabus : data;
  if (!syllabus || typeof syllabus !== 'object') {
    issues.push(makeIssue(READINESS_BLOCKER, 'syllabus', 'Syllabus has no generated data.'));
    return;
  }
  if (
    !hasMeaningfulValue(syllabus.courseDescription || syllabus.description) &&
    !hasMeaningfulValue(syllabus.schedule || syllabus.weeklySchedule || syllabus.courseAtAGlance)
  ) {
    issues.push(
      makeIssue(READINESS_WARNING, 'syllabus', 'Syllabus may be missing course description or schedule details.'),
    );
  }
}

export function evaluateWorkspaceReadiness({
  courseMap,
  deliverables = {},
  selectedFeatures = null,
  columns = [],
  lessonFilter = null,
} = {}) {
  const issues = [];
  const featureIds = getSelectedFeatureIds(selectedFeatures, deliverables);
  const lessonIndices = getLessonIndices(courseMap, lessonFilter);

  if (Array.isArray(lessonFilter) && lessonIndices.length === 0) {
    issues.push(makeIssue(READINESS_BLOCKER, 'courseMap', 'Select at least one lesson before exporting.'));
  }

  if (featureIds.includes('courseMap')) {
    checkCourseMap(courseMap, columns, lessonIndices, issues);
    checkCourseMapPlaceholders(courseMap, columns, lessonIndices, issues);
  }

  for (const featureId of featureIds) {
    if (featureId === 'courseMap') continue;
    const entry = deliverables?.[featureId];

    if (!entry) {
      issues.push(makeIssue(READINESS_BLOCKER, featureId, `${labelFor(featureId)} has not been generated.`));
      continue;
    }
    if (entry.status === 'error') {
      issues.push(makeIssue(READINESS_BLOCKER, featureId, `${labelFor(featureId)} failed to generate.`));
      continue;
    }
    if (entry.status !== 'done') {
      issues.push(
        makeIssue(READINESS_BLOCKER, featureId, `${labelFor(featureId)} is still ${entry.status || 'pending'}.`),
      );
      continue;
    }
    if (!entry.data) {
      issues.push(makeIssue(READINESS_BLOCKER, featureId, `${labelFor(featureId)} has no generated data.`));
      continue;
    }
    if (entry.stale) {
      issues.push(makeIssue(READINESS_WARNING, featureId, `${labelFor(featureId)} is out of sync after edits.`));
    }

    const scopedData = scopeDeliverableDataToLessons(featureId, entry.data, lessonIndices, courseMap);

    checkPublishabilityPlaceholders(featureId, scopedData, issues);

    if (PER_LESSON_FEATURES.has(featureId)) {
      checkPerLessonFeature(featureId, scopedData, courseMap, lessonIndices, issues);
    } else if (featureId === 'rubrics') {
      checkRubrics(scopedData, courseMap, lessonIndices, issues);
    } else if (featureId === 'assignments') {
      checkAssignments(scopedData, courseMap, lessonIndices, issues);
    } else if (featureId === 'syllabus') {
      checkSyllabus(scopedData, issues);
    }
  }

  const normalizedIssues = normalizeReadinessIssues(issues);
  const blockers = normalizedIssues.filter((issue) => issue.severity === READINESS_BLOCKER);
  const warnings = normalizedIssues.filter((issue) => issue.severity === READINESS_WARNING);
  const doneFeatures = featureIds.filter(
    (featureId) => featureId === 'courseMap' || deliverables?.[featureId]?.status === 'done',
  );

  return {
    status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warnings' : 'ready',
    isBlocked: blockers.length > 0,
    blockers,
    warnings,
    issues: normalizedIssues,
    lessonCount: lessonIndices.length,
    featureCount: featureIds.length,
    doneFeatureCount: doneFeatures.length,
  };
}

export function summarizeReadiness(readiness) {
  if (!readiness) return 'Readiness unavailable.';
  if (readiness.blockers?.length > 0) return readiness.blockers[0].message;
  if (readiness.warnings?.length > 0) return readiness.warnings[0].message;
  return 'All selected materials passed readiness checks.';
}

export function buildReadinessReport(readiness, { courseName = 'Course' } = {}) {
  const lines = [
    `${courseName} - Readiness Report`,
    `Generated: ${new Date().toISOString()}`,
    '',
    `Status: ${readiness?.status || 'unknown'}`,
    `Checked materials: ${readiness?.doneFeatureCount ?? 0}/${readiness?.featureCount ?? 0}`,
    `Lessons in scope: ${readiness?.lessonCount ?? 0}`,
    '',
  ];

  const blockers = readiness?.blockers || [];
  const warnings = readiness?.warnings || [];

  if (blockers.length === 0 && warnings.length === 0) {
    lines.push('No readiness issues were found.');
    return lines.join('\n');
  }

  if (blockers.length > 0) {
    lines.push(`Critical issues (${blockers.length})`);
    blockers.forEach((issue, index) => {
      lines.push(`${index + 1}. ${issue.label}: ${issue.message}`);
    });
    lines.push('');
  }

  if (warnings.length > 0) {
    lines.push(`Warnings (${warnings.length})`);
    warnings.forEach((issue, index) => {
      lines.push(`${index + 1}. ${issue.label}: ${issue.message}`);
    });
  }

  return lines.join('\n');
}
