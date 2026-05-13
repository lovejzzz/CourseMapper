import { getArrayKey } from './syncDependencies';
import { findPublishabilityPlaceholders } from './publishabilityPlaceholders';
import {
  normalizeAssignmentLessonAlignment,
  normalizeCourseFaqCategories,
  normalizeCourseFaqQuestionCounts,
  normalizeDiscussionPromptFields,
  normalizeLessonPlanPublishability,
  normalizeQuizBankIndex,
  normalizeQuizBankPointTotals,
  normalizeQuizBankPublishability,
  normalizeQuizBankQuestions,
  normalizeQuizBankRationales,
  normalizeRubricCoverage,
  normalizeRubricSupport,
  normalizeSlideDeckAccessibility,
  normalizeSlideDeckSpeakerNotes,
  normalizeStudyGuideQuestions,
  normalizeStudyGuideSupport,
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

const FAQ_CATEGORIES = new Set([
  'Course Logistics',
  'Assignment Clarification',
  'Concept Explanation',
  'Technical Help',
  'Assessment Prep',
]);

function labelFor(featureId) {
  return READINESS_FEATURE_LABELS[featureId] || (featureId?.startsWith('custom_') ? 'Custom Deliverable' : featureId);
}

function makeIssue(severity, featureId, message, details = {}) {
  return { severity, featureId, label: labelFor(featureId), message, ...details };
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

export function scopeCourseMapToLessons(courseMap, lessonFilter) {
  if (!Array.isArray(lessonFilter) || !courseMap?.lessons) return courseMap;
  return {
    ...courseMap,
    lessons: filterLessonArray(courseMap.lessons, lessonFilter),
  };
}

export function scopeDeliverableDataToLessons(featureId, data, lessonFilter) {
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
    scopedData = {
      ...scopedData,
      [key]: filterLessonArray(scopedData[key], lessonFilter),
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

function repairFeatureData(featureId, data, { courseMap, config } = {}) {
  let current = data;
  const summaries = [];

  switch (featureId) {
    case 'syllabus':
      current = applyRepair(current, summaries, 'cleaned syllabus placeholders', normalizeSyllabusPublishability);
      break;
    case 'lessonPlans':
      current = applyRepair(
        current,
        summaries,
        'cleaned lesson plan publishability',
        normalizeLessonPlanPublishability,
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
      break;
    case 'rubrics':
      current = applyRepair(current, summaries, 'filled assessed-lesson rubrics', normalizeRubricCoverage, courseMap);
      current = applyRepair(current, summaries, 'normalized rubric support', normalizeRubricSupport);
      break;
    case 'discussions':
      current = applyRepair(current, summaries, 'normalized discussion guidance', normalizeDiscussionPromptFields);
      break;
    case 'quizBank':
      current = applyRepair(current, summaries, 'normalized quiz question metadata', normalizeQuizBankQuestions);
      current = applyRepair(current, summaries, 'filled quiz answer guidance', normalizeQuizBankRationales);
      current = applyRepair(current, summaries, 'fixed quiz point totals', normalizeQuizBankPointTotals);
      current = applyRepair(current, summaries, 'cleaned quiz publishability', normalizeQuizBankPublishability);
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
        'trimmed FAQ question counts',
        normalizeCourseFaqQuestionCounts,
        config,
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
      issues.push(makeIssue(READINESS_BLOCKER, 'courseMap', `Lesson ${lessonIndex + 1} is missing a title.`));
    }
    const sections = asArray(lesson?.sections);
    if (sections.length === 0) {
      issues.push(makeIssue(READINESS_BLOCKER, 'courseMap', `${label} has no course-map sections.`));
      continue;
    }
    for (const key of columnsToCheck) {
      const hasValue = sections.some((section) => hasMeaningfulValue(section?.[key]));
      if (!hasValue) {
        issues.push(makeIssue(READINESS_WARNING, 'courseMap', `${label} has an empty ${key} field.`));
      }
    }
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

function checkRubrics(data, courseMap, lessonIndices, issues) {
  const rubrics = getFeatureArray('rubrics', data);
  const lessons = asArray(courseMap?.lessons);
  const assessedLessonNumbers = lessonIndices
    .filter((lessonIndex) => lessonHasAssessment(lessons[lessonIndex]))
    .map((lessonIndex) => lessonIndex + 1);

  if (assessedLessonNumbers.length === 0) return;
  if (rubrics.length === 0) {
    issues.push(makeIssue(READINESS_BLOCKER, 'rubrics', 'Rubrics are missing for assessed lessons.'));
    return;
  }

  const covered = new Set();
  rubrics.forEach((rubric) => itemLessonNumbers(rubric).forEach((number) => covered.add(number)));
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
  if (gradeTotal > 0 && (gradeTotal < 95 || gradeTotal > 105)) {
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
  if (!data || typeof data !== 'object') {
    issues.push(makeIssue(READINESS_BLOCKER, 'syllabus', 'Syllabus has no generated data.'));
    return;
  }
  if (
    !hasMeaningfulValue(data.courseDescription || data.description) &&
    !hasMeaningfulValue(data.schedule || data.weeklySchedule)
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
  const scopedCourseMap = scopeCourseMapToLessons(courseMap, lessonIndices);

  if (Array.isArray(lessonFilter) && lessonIndices.length === 0) {
    issues.push(makeIssue(READINESS_BLOCKER, 'courseMap', 'Select at least one lesson before exporting.'));
  }

  if (featureIds.includes('courseMap')) {
    checkCourseMap(
      scopedCourseMap,
      columns,
      lessonIndices.map((_, index) => index),
      issues,
    );
    checkPublishabilityPlaceholders('courseMap', scopedCourseMap, issues);
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

    const scopedData = scopeDeliverableDataToLessons(featureId, entry.data, lessonIndices);

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

  const blockers = issues.filter((issue) => issue.severity === READINESS_BLOCKER);
  const warnings = issues.filter((issue) => issue.severity === READINESS_WARNING);
  const doneFeatures = featureIds.filter(
    (featureId) => featureId === 'courseMap' || deliverables?.[featureId]?.status === 'done',
  );

  return {
    status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warnings' : 'ready',
    isBlocked: blockers.length > 0,
    blockers,
    warnings,
    issues,
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
    `Checked sections: ${readiness?.doneFeatureCount ?? 0}/${readiness?.featureCount ?? 0}`,
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
