import { getArrayKey } from './syncDependencies';
import { findPublishabilityPlaceholders } from './publishabilityPlaceholders';

export const COURSE_FAQ_CATEGORIES = [
  'Course Logistics',
  'Assignment Clarification',
  'Concept Explanation',
  'Technical Help',
  'Assessment Prep',
];

const CATEGORY_SET = new Set(COURSE_FAQ_CATEGORIES);
const QUIZ_TYPES = new Set(['multiple_choice', 'short_answer', 'essay']);
const QUIZ_DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard']);
const BLOOMS_LEVELS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
const QUIZ_NOISE_KEYS = new Set([
  'blm',
  'blt',
  'bls',
  'blm2',
  'qg',
  'cs',
  'hint',
  'tag',
  'lev',
  'oa2',
  'an2',
  'dr2',
  'qv',
]);
const ARRAY_DELIVERABLES = new Set([
  'lessonPlans',
  'slideDecks',
  'rubrics',
  'quizBank',
  'discussions',
  'assignments',
  'studyGuides',
  'courseFaq',
]);
const STRICT_LESSON_COUNT_DELIVERABLES = new Set([
  'lessonPlans',
  'slideDecks',
  'quizBank',
  'discussions',
  'studyGuides',
  'courseFaq',
]);
const MIN_GENERATED_ITEM_WORDS = 30;

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getMeaningfulWordCount(value) {
  return (JSON.stringify(value || {}).match(/[A-Za-z0-9]+/g) || []).length;
}

function getPrimaryArray(featureId, data) {
  const arrayKey = getArrayKey(featureId, data);
  const items = arrayKey && Array.isArray(data?.[arrayKey]) ? data[arrayKey] : null;
  return { arrayKey, items };
}

function getQuestionKey(quiz) {
  return Array.isArray(quiz?.questions) ? 'questions' : Array.isArray(quiz?.qs) ? 'qs' : null;
}

function getNumericValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function getDefaultQuizPoints(type) {
  if (type === 'multiple_choice') return 2;
  if (type === 'essay') return 8;
  return 4;
}

function getQuestionPoints(question) {
  const key = question?.points !== undefined ? 'points' : question?.pt !== undefined ? 'pt' : null;
  return key ? getNumericValue(question[key]) : null;
}

function getQuizTotalPoints(quiz) {
  const key = quiz?.totalPoints !== undefined ? 'totalPoints' : quiz?.tp !== undefined ? 'tp' : null;
  return key ? getNumericValue(quiz[key]) : null;
}

function summarizeQuizPointPlan(questions, sum) {
  const groups = new Map();
  questions.forEach((question) => {
    const type = normalizeQuizType(question);
    const points = getQuestionPoints(question);
    const key = `${type}:${points ?? 'unscored'}`;
    const current = groups.get(key) || { type, points, count: 0, total: 0 };
    current.count += 1;
    current.total += Number(points || 0);
    groups.set(key, current);
  });

  const parts = [...groups.values()].map((group) => {
    const label = group.type.replace(/_/g, ' ');
    if (!Number.isFinite(group.points)) return `${group.count} ${label} item(s) without point values`;
    return `${group.count} ${label} x ${group.points} = ${group.total}`;
  });
  return `Point check: ${parts.join('; ')}; total = ${sum}.`;
}

export function getCourseFaqQuestionTarget(config = {}) {
  const raw = Number(config?.questionsPerLesson);
  if (!Number.isFinite(raw)) return 5;
  return Math.max(3, Math.min(8, Math.round(raw)));
}

function getCourseLesson(courseMap, index) {
  return Array.isArray(courseMap?.lessons) ? courseMap.lessons[index] || null : null;
}

function asVerboseFaqQuestion(question) {
  return {
    question: question.q,
    answer: question.an,
    category: question.ca,
    relatedConcepts: question.rc,
    difficulty: question.df,
  };
}

export function normalizeCourseFaqQuestionCounts(data, config = {}, courseMap = null) {
  const arrayKey = getArrayKey('courseFaq', data) || (data?.faqs ? 'faqs' : data?.courseFaq ? 'courseFaq' : null);
  const lessons = arrayKey ? data?.[arrayKey] : null;
  const target = getCourseFaqQuestionTarget(config);

  if (!Array.isArray(lessons) || lessons.length === 0) {
    return { data, arrayKey, target, trimmedQuestions: 0, addedQuestions: 0, underfilledIndices: [] };
  }

  let trimmedQuestions = 0;
  let addedQuestions = 0;
  const underfilledIndices = [];
  const nextLessons = lessons.map((lesson, index) => {
    const questionKey = Array.isArray(lesson?.questions)
      ? 'questions'
      : Array.isArray(lesson?.qs)
        ? 'qs'
        : lesson?.qs !== undefined
          ? 'qs'
          : 'questions';
    const questions = Array.isArray(lesson?.[questionKey]) ? lesson[questionKey] : [];
    if (questions.length > target) {
      trimmedQuestions += questions.length - target;
      return { ...lesson, [questionKey]: questions.slice(0, target) };
    }
    if (questions.length < target) {
      const courseLesson = getCourseLesson(courseMap, index);
      if (courseLesson) {
        const rawTitle = lesson?.lessonTitle || lesson?.lt || courseLesson.title || `Lesson ${index + 1}`;
        const shortTitle = stripLessonPrefix(rawTitle) || `Lesson ${index + 1}`;
        const fallbackQuestions = buildFallbackFaqQuestions({
          lesson: courseLesson,
          title: rawTitle,
          shortTitle,
          target,
        });
        const additions = fallbackQuestions.slice(questions.length, target);
        if (additions.length > 0) {
          addedQuestions += additions.length;
          const normalizedAdditions = questionKey === 'questions' ? additions.map(asVerboseFaqQuestion) : additions;
          return { ...lesson, [questionKey]: [...questions, ...normalizedAdditions] };
        }
      }
      underfilledIndices.push(index);
    }
    return lesson;
  });

  const changed = trimmedQuestions > 0 || addedQuestions > 0;
  return {
    data: changed ? { ...data, [arrayKey]: nextLessons } : data,
    arrayKey,
    target,
    trimmedQuestions,
    addedQuestions,
    underfilledIndices,
  };
}

function isInvalidFaqCategory(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (CATEGORY_SET.has(text)) return false;
  return true;
}

function inferFaqCategory(question = {}) {
  const haystack = [
    question.question,
    question.q,
    question.answer,
    question.an,
    ...(Array.isArray(question.relatedConcepts) ? question.relatedConcepts : []),
    ...(Array.isArray(question.rc) ? question.rc : []),
  ]
    .join(' ')
    .toLowerCase();

  if (
    /\b(canvas|lms|course site|upload|download|login|zoom|software|technology|technical|browser|file)\b/.test(haystack)
  ) {
    return 'Technical Help';
  }
  if (/\b(assignment|paper|project|submission|submit|rubric|draft|presentation|brief|portfolio)\b/.test(haystack)) {
    return 'Assignment Clarification';
  }
  if (/\b(exam|quiz|test|midterm|final|study|prepare|review|assessment|grade|points)\b/.test(haystack)) {
    return 'Assessment Prep';
  }
  if (
    /\b(define|concept|mean|difference|why|how does|method|theory|framework|model|variable|evidence)\b/.test(haystack)
  ) {
    return 'Concept Explanation';
  }
  return 'Course Logistics';
}

export function normalizeCourseFaqCategories(data) {
  const arrayKey = getArrayKey('courseFaq', data) || (data?.faqs ? 'faqs' : data?.courseFaq ? 'courseFaq' : null);
  const lessons = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(lessons) || lessons.length === 0) {
    return { data, arrayKey, normalizedCategories: 0 };
  }

  let normalizedCategories = 0;
  const nextLessons = lessons.map((lesson) => {
    const questionKey = Array.isArray(lesson?.questions) ? 'questions' : Array.isArray(lesson?.qs) ? 'qs' : null;
    if (!questionKey) return lesson;

    let changed = false;
    const questions = lesson[questionKey].map((question) => {
      const categoryKey =
        question?.category !== undefined ? 'category' : question?.ca !== undefined ? 'ca' : 'category';
      const category = question?.[categoryKey];
      if (!isInvalidFaqCategory(category)) return question;

      normalizedCategories++;
      changed = true;
      return { ...question, [categoryKey]: inferFaqCategory(question) };
    });

    return changed ? { ...lesson, [questionKey]: questions } : lesson;
  });

  return {
    data: normalizedCategories > 0 ? { ...data, [arrayKey]: nextLessons } : data,
    arrayKey,
    normalizedCategories,
  };
}

function compactText(value, fallback = '', maxLength = 220) {
  const text = String(value || fallback || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  const clipped = text
    .slice(0, maxLength)
    .replace(/\s+\S*$/, '')
    .trim();
  return clipped || text.slice(0, maxLength).trim();
}

function cleanListItem(value) {
  return String(value || '')
    .replace(/^\s*(?:[-*]|\d{1,2}[.)])\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+[.;:,]\s*$/g, '')
    .trim();
}

function splitStructuredListItems(value) {
  const text = String(value || '').replace(/\r/g, '\n');
  if (!text.trim()) return [];
  return text
    .split(/\n|;/)
    .flatMap((segment) => {
      const matches = [
        ...String(segment || '').matchAll(
          /(?:^|\s)(?:[-*]|\d{1,2}[.)])\s+([\s\S]*?)(?=(?:\s(?:[-*]|\d{1,2}[.)])\s+)|$)/g,
        ),
      ];
      return matches.length > 0 ? matches.map((match) => match[1]) : [segment];
    })
    .map(cleanListItem)
    .filter(Boolean);
}

function firstStructuredListItem(value, fallback = '') {
  return splitStructuredListItems(value)[0] || fallback;
}

function stripLessonPrefix(title) {
  return String(title || '')
    .replace(/^Lesson\s+\d+\s*[:.-]\s*/i, '')
    .replace(/^Week\s+\d+\s*[:.-]\s*/i, '')
    .trim();
}

function getLessonField(lesson, field) {
  if (lesson?.[field]) return lesson[field];
  if (!Array.isArray(lesson?.sections)) return '';
  return lesson.sections
    .map((section) => section?.[field])
    .filter(Boolean)
    .join(' ');
}

function extractCourseFaqConcepts(lesson, title) {
  const sources = [
    title,
    getLessonField(lesson, 'topicSection'),
    getLessonField(lesson, 'learningObjectives'),
    getLessonField(lesson, 'learningGoals'),
    getLessonField(lesson, 'weeklyAssessments'),
  ];
  const banned = new Set([
    'lesson',
    'week',
    'course',
    'students',
    'student',
    'learning',
    'objectives',
    'goals',
    'assessment',
    'activity',
  ]);
  const seen = new Set();
  const concepts = [];
  sources
    .join(' ')
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length >= 4 && !banned.has(word))
    .forEach((word) => {
      if (seen.has(word)) return;
      seen.add(word);
      concepts.push(word);
    });
  return concepts.slice(0, 5);
}

function buildFallbackFaqQuestions({ lesson, title, shortTitle, target }) {
  const topic = compactText(getLessonField(lesson, 'topicSection'), shortTitle, 140);
  const objectives = compactText(
    getLessonField(lesson, 'learningObjectives') || getLessonField(lesson, 'learningGoals'),
    `explain the central ideas in ${shortTitle}, use evidence, and connect the lesson to course outcomes`,
    260,
  );
  const assessmentText = getLessonField(lesson, 'weeklyAssessments');
  const assessment = compactText(
    assessmentText,
    'the lesson activities, discussion prompts, and checks for understanding',
    220,
  );
  const activities = compactText(
    getLessonField(lesson, 'asyncActivities') || getLessonField(lesson, 'syncActivities'),
    'the assigned materials, class activities, and practice tasks',
    220,
  );
  const concepts = extractCourseFaqConcepts(lesson, title);
  const related = concepts.length > 0 ? concepts : [shortTitle.toLowerCase()];
  const assessmentLabel = compactText(
    firstStructuredListItem(assessmentText, 'the lesson assessment'),
    'the lesson assessment',
    90,
  );

  const questions = [
    {
      q: `What should I focus on first in ${shortTitle}?`,
      an: `Start by identifying the main topic: ${topic}. Then connect it to the lesson objectives: ${objectives}. Use your notes to write one clear question you can bring to class or office hours.`,
      ca: 'Course Logistics',
      rc: related.slice(0, 3),
      df: 'Basic',
    },
    {
      q: `How does ${shortTitle} connect to the course goals?`,
      an: `This lesson builds toward the course goals by asking you to use core concepts in a specific context. The strongest connection is to ${objectives}. When reviewing, explain the concept in your own words and give one evidence-based example.`,
      ca: 'Concept Explanation',
      rc: related.slice(0, 4),
      df: 'Basic',
    },
    {
      q: `How should I prepare for ${assessmentLabel} in ${shortTitle}?`,
      an: `Use the assessment prompt as a checklist: ${assessment}. A prepared response should name the relevant concept, apply it to the lesson case or activity, and explain why the evidence supports your answer.`,
      ca: 'Assessment Prep',
      rc: related.slice(0, 4),
      df: 'Intermediate',
      sa: `Mark the required evidence for ${assessmentLabel}, then draft one claim that uses ${shortTitle} vocabulary.`,
      ac: `${assessmentLabel} should show the lesson concept, evidence choice, and reasoning link before submission.`,
      ce: `For ${shortTitle}, strong work names the relevant concept and explains why the chosen evidence supports the answer.`,
    },
    {
      q: `What should strong submitted work include for ${shortTitle}?`,
      an: `Strong work should answer the prompt directly, use lesson vocabulary accurately, and connect claims to evidence from the assigned materials. Before submitting, check that your response includes a clear point, a concrete example, and a short explanation of how the example supports your point.`,
      ca: 'Assignment Clarification',
      rc: related.slice(0, 4),
      df: 'Intermediate',
    },
    {
      q: `What should I do if I get stuck during ${shortTitle}?`,
      an: `First, return to the assigned learning materials and locate the part that matches the confusing term or task. Then review the activity directions: ${activities}. If the problem is technical, document what you tried and ask for help with the exact step that failed.`,
      ca: 'Technical Help',
      rc: related.slice(0, 3),
      df: 'Basic',
    },
    {
      q: `What is a common misunderstanding about ${shortTitle}?`,
      an: `A common mistake is to memorize isolated terms without explaining how they work in a course example. To avoid that, define the concept, show how it appears in the lesson activity, and explain what evidence would change your interpretation.`,
      ca: 'Concept Explanation',
      rc: related.slice(0, 4),
      df: 'Intermediate',
    },
    {
      q: `How can I check whether my ${shortTitle} answer is specific enough?`,
      an: `Your answer is specific enough when another reader can identify the concept, the evidence you used, and the reasoning that links them. Replace vague statements with a lesson example, and make sure each claim answers the question being asked.`,
      ca: 'Assessment Prep',
      rc: related.slice(0, 4),
      df: 'Intermediate',
    },
    {
      q: `What should I bring from this lesson into the next one?`,
      an: `Carry forward the vocabulary, examples, and evidence habits from this lesson. In the next lesson, look for how ${shortTitle} either extends, complicates, or gives a new use for the same course concepts.`,
      ca: 'Course Logistics',
      rc: related.slice(0, 3),
      df: 'Basic',
    },
  ];

  return questions.slice(0, target);
}

function normalizeFaqQuestionText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCourseFaqQuestionArrayKey(lesson) {
  if (Array.isArray(lesson?.questions)) return 'questions';
  if (Array.isArray(lesson?.qs)) return 'qs';
  return null;
}

function getFaqQuestionCategory(question = {}) {
  return question.category || question.ca || inferFaqCategory(question);
}

function buildFaqQuestionRepair({ question, courseLesson, lessonTitle, lessonIndex }) {
  const shortTitle = stripLessonPrefix(lessonTitle) || `Lesson ${lessonIndex + 1}`;
  const topic = compactText(getLessonField(courseLesson, 'topicSection'), shortTitle, 90);
  const assessmentText = getLessonField(courseLesson, 'weeklyAssessments');
  const assessment = compactText(assessmentText, 'the lesson assessment', 120);
  const objective = compactText(
    getLessonField(courseLesson, 'learningObjectives') || getLessonField(courseLesson, 'learningGoals'),
    `apply ${shortTitle} concepts`,
    120,
  );
  const assessmentLabel = compactText(
    firstStructuredListItem(assessmentText, 'the lesson assessment'),
    'the lesson assessment',
    90,
  );
  const category = getFaqQuestionCategory(question);
  const templates = {
    'Course Logistics': {
      q: `What should I review first for ${shortTitle}?`,
      an: `Start with ${topic}, then compare your notes to the lesson objective: ${objective}. Bring one specific question about the topic or assessment to class, office hours, or a study group.`,
    },
    'Assignment Clarification': {
      q: `What does strong work on ${assessmentLabel} look like?`,
      an: `Strong work answers the prompt directly, uses ${shortTitle} vocabulary accurately, and connects each claim to a concrete piece of lesson evidence. Before submitting, check that the final artifact matches the posted directions and rubric language.`,
    },
    'Concept Explanation': {
      q: `What is the main confusion to avoid about ${topic}?`,
      an: `Do not stop at a definition. Explain how ${topic} works in the lesson context, then use one example or data point to show why the distinction matters.`,
    },
    'Technical Help': {
      q: `What should I do if the ${shortTitle} file, tool, or workflow step does not work?`,
      an: `Write down the exact step that failed, the input you used, and what result you expected. Then retry the step with the course example before asking for help, so the instructor can see where the workflow broke.`,
    },
    'Assessment Prep': {
      q: `How should I prepare for ${assessmentLabel} in ${shortTitle}?`,
      an: `Use ${assessmentLabel} as a checklist. A prepared response names the relevant ${shortTitle} concept, applies it to the required case or task, and explains why the evidence supports the answer.`,
    },
  };
  return templates[category] || templates['Concept Explanation'];
}

export function normalizeCourseFaqQuestionVariety(data, courseMap = null) {
  const arrayKey = getArrayKey('courseFaq', data) || (data?.faqs ? 'faqs' : data?.courseFaq ? 'courseFaq' : null);
  const lessons = arrayKey ? data?.[arrayKey] : null;
  const courseLessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];

  if (!Array.isArray(lessons) || lessons.length === 0) {
    return { data, arrayKey, rewrittenQuestions: 0 };
  }

  const questionCounts = new Map();
  const answerCounts = new Map();
  lessons.forEach((lesson) => {
    const questionKey = getCourseFaqQuestionArrayKey(lesson);
    const questions = questionKey ? lesson[questionKey] : [];
    questions.forEach((question) => {
      const questionText = question?.question || question?.q || '';
      const key = normalizeFaqQuestionText(questionText);
      if (key) questionCounts.set(key, (questionCounts.get(key) || 0) + 1);
      const answerText = question?.answer || question?.an || '';
      const answerKey = normalizeFaqQuestionText(answerText);
      if (answerKey) answerCounts.set(answerKey, (answerCounts.get(answerKey) || 0) + 1);
    });
  });

  let rewrittenQuestions = 0;
  const nextLessons = lessons.map((lesson, lessonIndex) => {
    const questionKey = getCourseFaqQuestionArrayKey(lesson);
    if (!questionKey) return lesson;
    const courseLesson = courseLessons[lessonIndex] || null;
    const lessonTitle = lesson?.lessonTitle || lesson?.lt || courseLesson?.title || `Lesson ${lessonIndex + 1}`;
    let changed = false;
    const questions = lesson[questionKey].map((question, questionIndex) => {
      const qKey = question?.question !== undefined ? 'question' : question?.q !== undefined ? 'q' : 'q';
      const answerKey = question?.answer !== undefined ? 'answer' : question?.an !== undefined ? 'an' : 'an';
      const currentQuestion = question?.[qKey] || '';
      const currentAnswer = question?.[answerKey] || '';
      const normalized = normalizeFaqQuestionText(currentQuestion);
      const repeated = normalized && questionCounts.get(normalized) > 1;
      const normalizedAnswer = normalizeFaqQuestionText(currentAnswer);
      const repeatedBoilerplateAnswer =
        normalizedAnswer &&
        answerCounts.get(normalizedAnswer) > 2 &&
        /\bstrong work should answer the prompt directly\b/i.test(String(currentAnswer || ''));
      const genericPrep = /^how should i prepare for the assessment in this lesson\??$/i.test(
        String(currentQuestion || '').trim(),
      );
      if (!repeated && !genericPrep && !repeatedBoilerplateAnswer) return question;

      const repair = buildFaqQuestionRepair({ question, courseLesson, lessonTitle, lessonIndex });
      rewrittenQuestions++;
      changed = true;
      const nextQuestion = {
        ...question,
        [qKey]: repeated || genericPrep ? repair.q : currentQuestion,
        [answerKey]: repair.an,
      };
      const actionKey =
        question?.studentAction !== undefined ? 'studentAction' : question?.sa !== undefined ? 'sa' : null;
      const connectionKey =
        question?.assessmentConnection !== undefined
          ? 'assessmentConnection'
          : question?.ac !== undefined
            ? 'ac'
            : null;
      const exampleKey =
        question?.concreteExample !== undefined ? 'concreteExample' : question?.ce !== undefined ? 'ce' : null;
      if (actionKey)
        nextQuestion[actionKey] =
          `Use the ${lessonTitle} prompt as a checklist and mark one evidence point before drafting.`;
      if (connectionKey)
        nextQuestion[connectionKey] = `Connects directly to ${repair.q.replace(/\?$/, '').toLowerCase()}.`;
      if (exampleKey)
        nextQuestion[exampleKey] =
          `A strong ${lessonTitle} answer names the concept, cites lesson evidence, and explains the decision made.`;
      return nextQuestion;
    });
    return changed ? { ...lesson, [questionKey]: questions } : lesson;
  });

  return {
    data: rewrittenQuestions > 0 ? { ...data, [arrayKey]: nextLessons } : data,
    arrayKey,
    rewrittenQuestions,
  };
}

export function buildFallbackCourseFaq(courseMap, config = {}, scopeIndices = null) {
  const sourceLessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const target = getCourseFaqQuestionTarget(config);
  const scopedLessons =
    Array.isArray(scopeIndices) && scopeIndices.length > 0
      ? scopeIndices
          .map((originalIndex, position) => ({
            originalIndex: Number.isInteger(originalIndex) ? originalIndex : position,
            lesson: sourceLessons[originalIndex] || sourceLessons[position] || null,
          }))
          .filter(({ lesson }) => lesson)
      : sourceLessons.map((lesson, index) => ({ originalIndex: index, lesson }));

  const faqs = scopedLessons.map(({ lesson, originalIndex }) => {
    const rawTitle = lesson?.title || lesson?.lessonTitle || lesson?.lt || `Lesson ${originalIndex + 1}`;
    const shortTitle = stripLessonPrefix(rawTitle) || `Lesson ${originalIndex + 1}`;
    const title = `Lesson ${originalIndex + 1}: ${shortTitle}`;

    return {
      lt: title,
      tg: extractCourseFaqConcepts(lesson, title),
      qs: buildFallbackFaqQuestions({ lesson, title, shortTitle, target }),
    };
  });

  const fallback = {
    faqGuide: {
      purpose: 'First-pass student support FAQ generated from the course map when the model output could not be used.',
      reviewGuidance:
        'Review local policies, dates, platform names, and instructor-specific expectations before publishing.',
      categories: COURSE_FAQ_CATEGORIES,
    },
    faqs,
  };

  const normalizedCounts = normalizeCourseFaqQuestionCounts(fallback, config);
  return normalizeCourseFaqCategories(normalizedCounts.data).data;
}

function isBlankOrRepairPlaceholder(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  return /explanation needed|rationale needed|model response required|review this question/i.test(text);
}

function getAnswerOptionText(question) {
  const answer = String(question?.answer || question?.an || '').trim();
  const options = question?.options || question?.op;
  if (!answer || !Array.isArray(options)) return answer;
  const answerLetter = answer.match(/^[A-D]/i)?.[0]?.toUpperCase();
  if (!answerLetter) return answer;
  const option = options.find((value) =>
    String(value || '')
      .trim()
      .toUpperCase()
      .startsWith(`${answerLetter}.`),
  );
  return option ? String(option).trim() : answer;
}

function buildQuizExplanation(question) {
  const type = String(question?.type || question?.ty || '').trim();
  const objective = String(question?.objectiveAligned || question?.oa || '').trim();
  const answer = String(question?.answer || question?.an || '').trim();
  const sampleAnswer = String(question?.sampleAnswer || question?.sa || '').trim();
  const rubricHints = String(question?.rubricHints || question?.rh || '').trim();

  if (type === 'multiple_choice') {
    const answerText = getAnswerOptionText(question);
    const objectiveText = objective ? ` It assesses: ${objective}` : '';
    return `The correct answer is ${answerText || 'the keyed option'} because it best matches the lesson concept and question stem.${objectiveText}`;
  }

  if (type === 'short_answer') {
    if (sampleAnswer)
      return `A complete response should include the key elements shown in the sample answer: ${sampleAnswer}`;
    if (answer) return `A complete response should include these required elements: ${answer}`;
    if (rubricHints) return `Use the rubric hints to evaluate the required reasoning: ${rubricHints}`;
  }

  if (type === 'essay') {
    if (rubricHints) return `A strong essay should address these rubric criteria: ${rubricHints}`;
    if (sampleAnswer)
      return `Use the sample answer as the benchmark for scope, evidence, and reasoning: ${sampleAnswer}`;
  }

  return objective
    ? `Evaluate the response against the aligned objective: ${objective}`
    : 'Evaluate the response against the task verb, prompt constraints, and expected evidence.';
}

function buildDistractorRationale(question) {
  const answerLetter = String(question?.answer || question?.an || '')
    .trim()
    .match(/^[A-D]/i)?.[0]
    ?.toUpperCase();
  const options = question?.options || question?.op;
  const wrongOptions = Array.isArray(options)
    ? options
        .map((option) => String(option || '').trim())
        .filter((option) => option && (!answerLetter || !option.toUpperCase().startsWith(`${answerLetter}.`)))
    : [];

  if (wrongOptions.length > 0) {
    return wrongOptions
      .map((option) => {
        const label = option.match(/^[A-D]/i)?.[0]?.toUpperCase() || option.slice(0, 1);
        const optionText = option.replace(/^[A-D]\.\s*/i, '').trim();
        return `${label}: This option is plausible if students overgeneralize or misread "${optionText}", but it does not best answer the stem.`;
      })
      .join('; ');
  }

  return 'Each incorrect option should map to a common misconception and should be reviewed against the keyed answer before publishing.';
}

function getLetterOption(options, letter) {
  if (!Array.isArray(options)) return null;
  const index = letter.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
  if (index < 0 || index >= options.length) return null;
  return (
    String(options[index] || '')
      .replace(/^[A-D]\.\s*/i, '')
      .trim() || null
  );
}

function hasLabeledOptions(options) {
  return Array.isArray(options) && options.some((option) => /^[A-D]\.\s+/i.test(String(option || '').trim()));
}

function buildQuizObjective(quiz, question) {
  const lessonTitle = String(quiz?.lessonTitle || quiz?.lt || 'the lesson')
    .replace(/^Lesson\s+\d+:\s*/i, '')
    .trim();
  const bloom = normalizeBloomLevel(question?.bloomsLevel || question?.bl, normalizeQuizType(question)).toLowerCase();
  return `Use ${lessonTitle || 'the lesson'} concepts to ${bloom} the scenario, choose defensible evidence, and explain the method decision.`;
}

function buildFallbackQuizQuestion(quiz, questionIndex, compact = false) {
  const lessonTitle = String(quiz?.lessonTitle || quiz?.lt || 'this lesson')
    .replace(/^Lesson\s+\d+:\s*/i, '')
    .trim();
  const focus = lessonTitle || 'the lesson concept';
  const prompts = [
    `Apply ${focus} to a brief course scenario. What decision would you make, and what evidence supports it?`,
    `Identify one likely misconception about ${focus}, then explain how you would correct it using course evidence.`,
    `Compare two possible interpretations of ${focus}. Which is stronger, and what limitation should be named?`,
    `Use ${focus} to explain a current example, case, or student-facing problem from the lesson.`,
    `What evidence would show that a student can transfer ${focus} to a new context?`,
  ];
  const answers = [
    `A strong answer names the relevant concept, applies it to the scenario, cites concrete lesson evidence, and explains why that evidence supports the decision.`,
    `A strong answer identifies the misconception, states the accurate concept, and gives a targeted correction strategy grounded in the lesson materials.`,
    `A strong answer compares both interpretations, selects the better-supported one, and names at least one limitation or uncertainty.`,
    `A strong answer connects the concept to a specific example and explains the reasoning rather than only defining the term.`,
    `A strong answer describes observable evidence of transfer, such as accurate concept use, justified method choices, and explanation in a new example.`,
  ];
  const bloom = questionIndex % 3 === 0 ? 'Apply' : questionIndex % 3 === 1 ? 'Analyze' : 'Evaluate';
  const difficulty = questionIndex % 2 === 0 ? 'Medium' : 'Hard';
  const prompt = prompts[questionIndex % prompts.length];
  const answer = answers[questionIndex % answers.length];
  const explanation = `Use this as retrieval practice after ${focus}. The response should include a claim, lesson evidence, and reasoning that connects the evidence to the prompt.`;

  if (compact) {
    return {
      q: prompt,
      ty: 'short_answer',
      df: difficulty,
      em: 4,
      bl: bloom,
      an: answer,
      ex: explanation,
      pt: 4,
      oa: `Apply and explain ${focus} with evidence.`,
      iu: `Retrieval practice and formative check after ${focus}.`,
      tg: [focus, 'retrieval practice', bloom],
    };
  }

  return {
    question: prompt,
    type: 'short_answer',
    difficulty,
    estimatedMinutes: 4,
    bloomsLevel: bloom,
    answer,
    explanation,
    points: 4,
    objectiveAligned: `Apply and explain ${focus} with evidence.`,
    intendedUse: `Retrieval practice and formative check after ${focus}.`,
    tags: [focus, 'retrieval practice', bloom],
  };
}

function normalizeQuizType(question = {}) {
  const raw = String(question.type || question.ty || '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
  const aliases = {
    mc: 'multiple_choice',
    multiple: 'multiple_choice',
    multiple_choice_question: 'multiple_choice',
    multiplechoice: 'multiple_choice',
    short: 'short_answer',
    shortanswer: 'short_answer',
    short_response: 'short_answer',
    constructed_response: 'short_answer',
    open_response: 'short_answer',
    long_answer: 'essay',
    essay_question: 'essay',
    written_response: 'essay',
  };
  const normalized = aliases[raw] || raw;
  if (QUIZ_TYPES.has(normalized)) return normalized;
  if (Array.isArray(question.options || question.op) && (question.options || question.op).length >= 3)
    return 'multiple_choice';

  const prompt = String(question.question || question.q || '').toLowerCase();
  if (/\b(essay|argue|evaluate|critique|synthesize|compare and contrast|in 500|in 750)\b/.test(prompt)) return 'essay';
  return 'short_answer';
}

function normalizeQuizDifficulty(question = {}, type = 'short_answer') {
  const raw = String(question.difficulty || question.df || '')
    .trim()
    .toLowerCase();
  const aliases = {
    easy: 'Easy',
    basic: 'Easy',
    beginner: 'Easy',
    low: 'Easy',
    medium: 'Medium',
    intermediate: 'Medium',
    moderate: 'Medium',
    hard: 'Hard',
    advanced: 'Hard',
    challenging: 'Hard',
  };
  if (aliases[raw]) return aliases[raw];

  const bloom = String(question.bloomsLevel || question.bl || '').trim();
  if (/\b(evaluate|create)\b/i.test(bloom) || type === 'essay') return 'Hard';
  if (/\b(analyze|apply)\b/i.test(bloom)) return 'Medium';
  return 'Easy';
}

function normalizeQuizMinutes(value, type) {
  const raw = Number(String(value ?? '').match(/\d+(?:\.\d+)?/)?.[0]);
  let minutes = Number.isFinite(raw) ? raw : null;

  if (minutes !== null && minutes > 45 && minutes <= 600) {
    minutes = Math.ceil(minutes / 60);
  }

  if (minutes === null || minutes <= 0) {
    if (type === 'multiple_choice') minutes = 2;
    else if (type === 'essay') minutes = 12;
    else minutes = 4;
  }

  minutes = Math.round(minutes);
  if (type === 'multiple_choice') return Math.max(1, Math.min(3, minutes));
  if (type === 'essay') return Math.max(8, Math.min(20, minutes));
  return Math.max(2, Math.min(8, minutes));
}

function normalizeBloomLevel(value, type) {
  const raw = String(value || '').trim();
  const match = BLOOMS_LEVELS.find((level) => level.toLowerCase() === raw.toLowerCase());
  if (match) return match;
  const aliases = {
    knowledge: 'Remember',
    recall: 'Remember',
    comprehension: 'Understand',
    application: 'Apply',
    analysis: 'Analyze',
    synthesis: 'Create',
    evaluation: 'Evaluate',
  };
  if (aliases[raw.toLowerCase()]) return aliases[raw.toLowerCase()];
  if (type === 'essay') return 'Evaluate';
  if (type === 'multiple_choice') return 'Apply';
  return 'Understand';
}

function getQuizBloomCoverage(questions) {
  return [...new Set(questions.map((question) => question.bloomsLevel || question.bl).filter(Boolean))];
}

function sameStringArray(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function normalizeQuizBankQuestions(data) {
  const arrayKey = getArrayKey('quizBank', data) || (data?.quizzes ? 'quizzes' : data?.quizBank ? 'quizBank' : null);
  const quizzes = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(quizzes) || quizzes.length === 0) {
    return {
      data,
      arrayKey,
      patchedTypes: 0,
      patchedDifficulties: 0,
      patchedEstimatedMinutes: 0,
      patchedBloomLevels: 0,
      patchedTotals: 0,
      patchedBloomCoverages: 0,
    };
  }

  let patchedTypes = 0;
  let patchedDifficulties = 0;
  let patchedEstimatedMinutes = 0;
  let patchedBloomLevels = 0;
  let patchedTotals = 0;
  let patchedBloomCoverages = 0;

  const nextQuizzes = quizzes.map((quiz) => {
    const questionKey = Array.isArray(quiz?.questions)
      ? 'questions'
      : Array.isArray(quiz?.qs)
        ? 'qs'
        : quiz?.qs !== undefined
          ? 'qs'
          : 'questions';

    let quizChanged = false;
    const sourceQuestions = Array.isArray(quiz?.[questionKey]) ? quiz[questionKey] : [];
    const questions = sourceQuestions.map((question) => {
      const nextQuestion = { ...question };

      const typeKey = nextQuestion.type !== undefined ? 'type' : nextQuestion.ty !== undefined ? 'ty' : 'type';
      const nextType = normalizeQuizType(nextQuestion);
      if (nextQuestion[typeKey] !== nextType) {
        patchedTypes++;
        quizChanged = true;
        nextQuestion[typeKey] = nextType;
      }

      const difficultyKey =
        nextQuestion.difficulty !== undefined ? 'difficulty' : nextQuestion.df !== undefined ? 'df' : 'difficulty';
      const nextDifficulty = normalizeQuizDifficulty(nextQuestion, nextType);
      if (
        !QUIZ_DIFFICULTIES.has(String(nextQuestion[difficultyKey] || '').trim()) ||
        nextQuestion[difficultyKey] !== nextDifficulty
      ) {
        patchedDifficulties++;
        quizChanged = true;
        nextQuestion[difficultyKey] = nextDifficulty;
      }

      const minutesKey =
        nextQuestion.estimatedMinutes !== undefined
          ? 'estimatedMinutes'
          : nextQuestion.em !== undefined
            ? 'em'
            : 'estimatedMinutes';
      const nextMinutes = normalizeQuizMinutes(nextQuestion[minutesKey], nextType);
      if (nextQuestion[minutesKey] !== nextMinutes) {
        patchedEstimatedMinutes++;
        quizChanged = true;
        nextQuestion[minutesKey] = nextMinutes;
      }

      const bloomKey =
        nextQuestion.bloomsLevel !== undefined ? 'bloomsLevel' : nextQuestion.bl !== undefined ? 'bl' : 'bloomsLevel';
      const nextBloom = normalizeBloomLevel(nextQuestion[bloomKey], nextType);
      if (nextQuestion[bloomKey] !== nextBloom) {
        patchedBloomLevels++;
        quizChanged = true;
        nextQuestion[bloomKey] = nextBloom;
      }

      return nextQuestion;
    });

    const totalKey =
      quiz.totalQuestions !== undefined
        ? 'totalQuestions'
        : quiz.tq !== undefined || questionKey === 'qs'
          ? 'tq'
          : 'totalQuestions';
    const nextQuiz = quizChanged ? { ...quiz, [questionKey]: questions } : { ...quiz };
    if (totalKey && nextQuiz[totalKey] !== questions.length) {
      patchedTotals++;
      nextQuiz[totalKey] = questions.length;
      quizChanged = true;
    }

    const coverage = getQuizBloomCoverage(questions);
    const coverageKey =
      nextQuiz.bloomsCoverage !== undefined
        ? 'bloomsCoverage'
        : nextQuiz.bc !== undefined || questionKey === 'qs'
          ? 'bc'
          : 'bloomsCoverage';
    if (coverage.length > 0 && !sameStringArray(nextQuiz[coverageKey], coverage)) {
      patchedBloomCoverages++;
      nextQuiz[coverageKey] = coverage;
      quizChanged = true;
    }

    return quizChanged ? nextQuiz : quiz;
  });

  const changed =
    patchedTypes > 0 ||
    patchedDifficulties > 0 ||
    patchedEstimatedMinutes > 0 ||
    patchedBloomLevels > 0 ||
    patchedTotals > 0 ||
    patchedBloomCoverages > 0;

  return {
    data: changed ? { ...data, [arrayKey]: nextQuizzes } : data,
    arrayKey,
    patchedTypes,
    patchedDifficulties,
    patchedEstimatedMinutes,
    patchedBloomLevels,
    patchedTotals,
    patchedBloomCoverages,
  };
}

export function normalizeQuizBankQuestionCounts(data, minimumQuestions = 5) {
  const arrayKey = getArrayKey('quizBank', data) || (data?.quizzes ? 'quizzes' : data?.quizBank ? 'quizBank' : null);
  const quizzes = arrayKey ? data?.[arrayKey] : null;
  const target = Math.max(1, Number(minimumQuestions) || 5);

  if (!Array.isArray(quizzes) || quizzes.length === 0) {
    return { data, arrayKey, target, addedQuestions: 0 };
  }

  let addedQuestions = 0;
  const nextQuizzes = quizzes.map((quiz) => {
    const questionKey = Array.isArray(quiz?.questions)
      ? 'questions'
      : Array.isArray(quiz?.qs)
        ? 'qs'
        : quiz?.qs !== undefined
          ? 'qs'
          : 'questions';
    const compact = questionKey === 'qs';
    let questions = Array.isArray(quiz?.[questionKey]) ? quiz[questionKey] : [];
    if (questions.length >= target) return quiz;

    while (questions.length < target) {
      questions = [...questions, buildFallbackQuizQuestion(quiz, questions.length, compact)];
      addedQuestions++;
    }

    const totalKey =
      quiz.totalQuestions !== undefined
        ? 'totalQuestions'
        : quiz.tq !== undefined || questionKey === 'qs'
          ? 'tq'
          : 'totalQuestions';
    return { ...quiz, [questionKey]: questions, [totalKey]: questions.length };
  });

  return {
    data: addedQuestions > 0 ? { ...data, [arrayKey]: nextQuizzes } : data,
    arrayKey,
    target,
    addedQuestions,
  };
}

export function normalizeQuizBankPointTotals(data) {
  const arrayKey = getArrayKey('quizBank', data) || (data?.quizzes ? 'quizzes' : data?.quizBank ? 'quizBank' : null);
  const quizzes = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(quizzes) || quizzes.length === 0) {
    return { data, arrayKey, patchedQuestionPoints: 0, patchedQuizTotals: 0, patchedPointPlans: 0 };
  }

  let patchedQuestionPoints = 0;
  let patchedQuizTotals = 0;
  let patchedPointPlans = 0;

  const nextQuizzes = quizzes.map((quiz) => {
    const questionKey = getQuestionKey(quiz);
    if (!questionKey) return quiz;

    let quizChanged = false;
    const questions = quiz[questionKey].map((question) => {
      const pointKey = question.points !== undefined ? 'points' : question.pt !== undefined ? 'pt' : 'points';
      const currentPoints = getQuestionPoints(question);
      if (currentPoints !== null && currentPoints > 0) return question;

      patchedQuestionPoints++;
      quizChanged = true;
      return { ...question, [pointKey]: getDefaultQuizPoints(normalizeQuizType(question)) };
    });

    const pointSum = questions.reduce((sum, question) => sum + Number(getQuestionPoints(question) || 0), 0);
    const totalKey = quiz.totalPoints !== undefined ? 'totalPoints' : quiz.tp !== undefined ? 'tp' : 'totalPoints';
    const currentTotal = getQuizTotalPoints(quiz);
    const nextQuiz = quizChanged ? { ...quiz, [questionKey]: questions } : { ...quiz };
    if (pointSum > 0 && currentTotal !== pointSum) {
      nextQuiz[totalKey] = pointSum;
      patchedQuizTotals++;
      quizChanged = true;
    }

    const pointPlanKey =
      nextQuiz.pointPlan !== undefined ? 'pointPlan' : nextQuiz.pp !== undefined ? 'pp' : 'pointPlan';
    const pointPlan = String(nextQuiz[pointPlanKey] || '').trim();
    const expectedPlan = summarizeQuizPointPlan(questions, pointSum);
    if (pointSum > 0 && (!pointPlan || !String(pointPlan).includes(String(pointSum)))) {
      nextQuiz[pointPlanKey] = expectedPlan;
      patchedPointPlans++;
      quizChanged = true;
    }

    return quizChanged ? nextQuiz : quiz;
  });

  const changed = patchedQuestionPoints > 0 || patchedQuizTotals > 0 || patchedPointPlans > 0;
  return {
    data: changed ? { ...data, [arrayKey]: nextQuizzes } : data,
    arrayKey,
    patchedQuestionPoints,
    patchedQuizTotals,
    patchedPointPlans,
  };
}

export function validateDeliverableGeneration(featureId, data, options = {}) {
  const expectedLessonCount = Number(options.expectedLessonCount) || 0;
  const config = options.config || {};
  const blockers = [];
  const warnings = [];
  const retryableLessonIndices = [];

  if (!isPlainObject(data)) {
    blockers.push('No usable JSON object was returned.');
    return { valid: false, blockers, warnings, retryableLessonIndices, arrayKey: null, itemCount: 0 };
  }

  if (Object.keys(data).length === 0 || getMeaningfulWordCount(data) < 4) {
    blockers.push('The generated JSON object is empty.');
    return { valid: false, blockers, warnings, retryableLessonIndices, arrayKey: null, itemCount: 0 };
  }

  if (!ARRAY_DELIVERABLES.has(featureId)) {
    return { valid: true, blockers, warnings, retryableLessonIndices, arrayKey: null, itemCount: 0 };
  }

  const { arrayKey, items } = getPrimaryArray(featureId, data);
  if (!arrayKey || !Array.isArray(items)) {
    blockers.push(`Missing the required ${featureId} item array.`);
    return { valid: false, blockers, warnings, retryableLessonIndices, arrayKey, itemCount: 0 };
  }

  if (items.length === 0) {
    blockers.push(`The ${featureId} item array is empty.`);
    return { valid: false, blockers, warnings, retryableLessonIndices, arrayKey, itemCount: 0 };
  }

  const nearEmpty = items
    .map((item, index) => ({ index, words: getMeaningfulWordCount(item) }))
    .filter(({ words }) => words < MIN_GENERATED_ITEM_WORDS);
  if (nearEmpty.length > 0) {
    blockers.push(`${nearEmpty.length} generated item(s) are too thin to publish.`);
    nearEmpty.forEach(({ index }) => retryableLessonIndices.push(index));
  }

  if (
    STRICT_LESSON_COUNT_DELIVERABLES.has(featureId) &&
    expectedLessonCount > 0 &&
    items.length < expectedLessonCount
  ) {
    const missingCount = expectedLessonCount - items.length;
    blockers.push(`Expected ${expectedLessonCount} lesson item(s), but received ${items.length}.`);
    for (let i = items.length; i < expectedLessonCount; i++) retryableLessonIndices.push(i);
    warnings.push(`${missingCount} lesson item(s) need retry.`);
  }

  if (featureId === 'courseFaq') {
    const target = getCourseFaqQuestionTarget(config);
    items.forEach((lesson, index) => {
      const questionKey = Array.isArray(lesson?.questions) ? 'questions' : Array.isArray(lesson?.qs) ? 'qs' : null;
      const questions = questionKey ? lesson[questionKey] : [];
      if (questions.length < target) {
        blockers.push(`FAQ lesson ${index + 1} has ${questions.length}/${target} question(s).`);
        retryableLessonIndices.push(index);
      }
    });
  }

  if (featureId === 'quizBank') {
    items.forEach((quiz, index) => {
      const questionKey = getQuestionKey(quiz);
      const questions = questionKey ? quiz[questionKey] : [];
      const points = questions.map(getQuestionPoints);
      const hasMissingPoints = points.some((point) => point === null || point <= 0);
      const pointSum = points.reduce((sum, point) => sum + Number(point || 0), 0);
      const total = getQuizTotalPoints(quiz);
      if (hasMissingPoints) {
        blockers.push(`Quiz lesson ${index + 1} has question(s) without valid point values.`);
        retryableLessonIndices.push(index);
      } else if (total !== null && pointSum > 0 && total !== pointSum) {
        blockers.push(`Quiz lesson ${index + 1} point total is ${total}, but questions sum to ${pointSum}.`);
        retryableLessonIndices.push(index);
      }
    });
  }

  return {
    valid: blockers.length === 0,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    retryableLessonIndices: [...new Set(retryableLessonIndices)].sort((a, b) => a - b),
    arrayKey,
    itemCount: items.length,
  };
}

export function normalizeQuizBankRationales(data) {
  const arrayKey = getArrayKey('quizBank', data) || (data?.quizzes ? 'quizzes' : data?.quizBank ? 'quizBank' : null);
  const quizzes = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(quizzes) || quizzes.length === 0) {
    return {
      data,
      arrayKey,
      patchedExplanations: 0,
      patchedDistractorRationales: 0,
      patchedConstructedResponseGuidance: 0,
    };
  }

  let patchedExplanations = 0;
  let patchedDistractorRationales = 0;
  let patchedConstructedResponseGuidance = 0;
  const nextQuizzes = quizzes.map((quiz) => {
    const questionKey = Array.isArray(quiz?.questions) ? 'questions' : Array.isArray(quiz?.qs) ? 'qs' : null;
    if (!questionKey) return quiz;
    let quizChanged = false;
    const questions = quiz[questionKey].map((question) => {
      const nextQuestion = { ...question };
      const isCompactQuestion =
        nextQuestion.ex !== undefined ||
        nextQuestion.dr !== undefined ||
        nextQuestion.ty !== undefined ||
        nextQuestion.op !== undefined ||
        nextQuestion.an !== undefined;
      const explanationKey =
        nextQuestion.explanation !== undefined
          ? 'explanation'
          : nextQuestion.ex !== undefined
            ? 'ex'
            : isCompactQuestion
              ? 'ex'
              : 'explanation';
      const distractorKey =
        nextQuestion.distractorRationale !== undefined
          ? 'distractorRationale'
          : nextQuestion.dr !== undefined || isCompactQuestion
            ? 'dr'
            : 'distractorRationale';
      const isMc = normalizeQuizType(nextQuestion) === 'multiple_choice';
      const type = normalizeQuizType(nextQuestion);
      const answerKey = nextQuestion.answer !== undefined ? 'answer' : nextQuestion.an !== undefined ? 'an' : 'an';
      const sampleAnswerKey =
        nextQuestion.sampleAnswer !== undefined ? 'sampleAnswer' : nextQuestion.sa !== undefined ? 'sa' : 'sa';
      const rubricHintsKey =
        nextQuestion.rubricHints !== undefined ? 'rubricHints' : nextQuestion.rh !== undefined ? 'rh' : 'rh';
      const scoringGuidanceKey =
        nextQuestion.scoringGuidance !== undefined ? 'scoringGuidance' : nextQuestion.sg !== undefined ? 'sg' : 'sg';

      if (isBlankOrRepairPlaceholder(nextQuestion[explanationKey])) {
        patchedExplanations++;
        quizChanged = true;
        nextQuestion[explanationKey] = buildQuizExplanation(nextQuestion);
      }

      if (isMc && isBlankOrRepairPlaceholder(nextQuestion[distractorKey])) {
        patchedDistractorRationales++;
        quizChanged = true;
        nextQuestion[distractorKey] = buildDistractorRationale(nextQuestion);
      }

      if (type === 'short_answer') {
        if (isBlankOrRepairPlaceholder(nextQuestion[answerKey])) {
          patchedConstructedResponseGuidance++;
          quizChanged = true;
          nextQuestion[answerKey] =
            nextQuestion[sampleAnswerKey] ||
            `A complete response should name the method decision, justify it with lesson evidence, and state one limitation.`;
        }
        if (isBlankOrRepairPlaceholder(nextQuestion[sampleAnswerKey])) {
          patchedConstructedResponseGuidance++;
          quizChanged = true;
          nextQuestion[sampleAnswerKey] = String(nextQuestion[answerKey] || '').trim();
        }
        if (isBlankOrRepairPlaceholder(nextQuestion[scoringGuidanceKey])) {
          patchedConstructedResponseGuidance++;
          quizChanged = true;
          nextQuestion[scoringGuidanceKey] =
            'Award full credit for a specific method claim, accurate evidence, and a clear limitation; partial credit requires at least two of those elements.';
        }
      }

      if (type === 'essay') {
        if (isBlankOrRepairPlaceholder(nextQuestion[rubricHintsKey])) {
          patchedConstructedResponseGuidance++;
          quizChanged = true;
          nextQuestion[rubricHintsKey] =
            'Score the essay for methodological accuracy, evidence use, ethical reasoning, limitation awareness, and clarity of recommendation.';
        }
        if (isBlankOrRepairPlaceholder(nextQuestion[sampleAnswerKey])) {
          patchedConstructedResponseGuidance++;
          quizChanged = true;
          nextQuestion[sampleAnswerKey] =
            'A strong response makes a defensible claim, cites the relevant course method, explains the evidence needed, addresses one limitation, and connects the decision to the research question.';
        }
        if (isBlankOrRepairPlaceholder(nextQuestion[scoringGuidanceKey])) {
          patchedConstructedResponseGuidance++;
          quizChanged = true;
          nextQuestion[scoringGuidanceKey] =
            'Use the rubric hints as required elements; give partial credit for accurate method choice plus incomplete evidence or limitation discussion.';
        }
      }

      return nextQuestion;
    });
    return quizChanged ? { ...quiz, [questionKey]: questions } : quiz;
  });

  return {
    data:
      patchedExplanations > 0 || patchedDistractorRationales > 0 || patchedConstructedResponseGuidance > 0
        ? { ...data, [arrayKey]: nextQuizzes }
        : data,
    arrayKey,
    patchedExplanations,
    patchedDistractorRationales,
    patchedConstructedResponseGuidance,
  };
}

export function normalizeQuizBankPublishability(data) {
  const arrayKey = getArrayKey('quizBank', data) || (data?.quizzes ? 'quizzes' : data?.quizBank ? 'quizBank' : null);
  const quizzes = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(quizzes) || quizzes.length === 0) {
    return { data, arrayKey, removedNoiseFields: 0, normalizedAnswerKeys: 0, patchedObjectiveAlignment: 0 };
  }

  let removedNoiseFields = 0;
  let normalizedAnswerKeys = 0;
  let patchedObjectiveAlignment = 0;
  const nextQuizzes = quizzes.map((quiz) => {
    const questionKey = Array.isArray(quiz?.questions) ? 'questions' : Array.isArray(quiz?.qs) ? 'qs' : null;
    if (!questionKey) return quiz;

    let quizChanged = false;
    const questions = quiz[questionKey].map((question) => {
      if (!question || typeof question !== 'object' || Array.isArray(question)) return question;
      const nextQuestion = { ...question };
      let questionChanged = false;

      Object.keys(nextQuestion).forEach((key) => {
        if (QUIZ_NOISE_KEYS.has(key)) {
          delete nextQuestion[key];
          removedNoiseFields++;
          questionChanged = true;
        }
      });

      const type = normalizeQuizType(nextQuestion);
      const answerKey = nextQuestion.answer !== undefined ? 'answer' : nextQuestion.an !== undefined ? 'an' : null;
      const options = nextQuestion.options || nextQuestion.op;
      const answer = answerKey ? String(nextQuestion[answerKey] || '').trim() : '';
      const answerLetter = answer.match(/^[A-D]$/i)?.[0];
      if (type === 'multiple_choice' && answerKey && answerLetter && !hasLabeledOptions(options)) {
        const optionText = getLetterOption(options, answerLetter);
        if (optionText && optionText !== answer) {
          nextQuestion[answerKey] = optionText;
          normalizedAnswerKeys++;
          questionChanged = true;
        }
      }

      const objectiveKey =
        nextQuestion.objectiveAligned !== undefined ? 'objectiveAligned' : nextQuestion.oa !== undefined ? 'oa' : null;
      const objective = objectiveKey ? String(nextQuestion[objectiveKey] || '').trim() : '';
      if (objectiveKey && /^[A-D]$/i.test(objective)) {
        nextQuestion[objectiveKey] = buildQuizObjective(quiz, nextQuestion);
        patchedObjectiveAlignment++;
        questionChanged = true;
      }

      if (questionChanged) quizChanged = true;
      return questionChanged ? nextQuestion : question;
    });

    return quizChanged ? { ...quiz, [questionKey]: questions } : quiz;
  });

  const changed = removedNoiseFields > 0 || normalizedAnswerKeys > 0 || patchedObjectiveAlignment > 0;
  return {
    data: changed ? { ...data, [arrayKey]: nextQuizzes } : data,
    arrayKey,
    removedNoiseFields,
    normalizedAnswerKeys,
    patchedObjectiveAlignment,
  };
}

function slugifyId(value, fallback = 'item') {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return slug || fallback;
}

export function normalizeQuizBankIndex(data) {
  const arrayKey = getArrayKey('quizBank', data) || (data?.quizzes ? 'quizzes' : data?.quizBank ? 'quizBank' : null);
  const quizzes = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(quizzes) || quizzes.length === 0) {
    return { data, arrayKey, addedIds: 0, addedQuestionTags: 0, addedIntendedUses: 0, rebuiltIndex: false };
  }

  let addedIds = 0;
  let addedQuestionTags = 0;
  let addedIntendedUses = 0;
  let changed = false;

  const bankIndex = [];
  const nextQuizzes = quizzes.map((quiz, quizIndex) => {
    const questionKey = Array.isArray(quiz?.questions) ? 'questions' : Array.isArray(quiz?.qs) ? 'qs' : null;
    if (!questionKey) return quiz;

    const isCompact = questionKey === 'qs';
    const lessonTitle = quiz?.lessonTitle || quiz?.lt || `Lesson ${quizIndex + 1}`;
    const lessonId = slugifyId(lessonTitle, `lesson-${quizIndex + 1}`);
    const quizTags = Array.isArray(quiz?.tags) ? quiz.tags : Array.isArray(quiz?.tg) ? quiz.tg : [];
    let quizChanged = false;

    const questions = quiz[questionKey].map((question, questionIndex) => {
      const nextQuestion = { ...question };
      const idKey = nextQuestion.id !== undefined ? 'id' : 'id';
      const tagKey =
        nextQuestion.tags !== undefined ? 'tags' : nextQuestion.tg !== undefined ? 'tg' : isCompact ? 'tg' : 'tags';
      const useKey =
        nextQuestion.intendedUse !== undefined
          ? 'intendedUse'
          : nextQuestion.iu !== undefined
            ? 'iu'
            : isCompact
              ? 'iu'
              : 'intendedUse';
      const type = nextQuestion.type || nextQuestion.ty || 'short_answer';
      const bloom = nextQuestion.bloomsLevel || nextQuestion.bl || '';
      const difficulty = nextQuestion.difficulty || nextQuestion.df || '';
      const id = nextQuestion[idKey] || `${lessonId}-q${questionIndex + 1}`;

      if (!nextQuestion[idKey]) {
        nextQuestion[idKey] = id;
        addedIds++;
        quizChanged = true;
      }

      const tags = [
        ...quizTags,
        type,
        bloom,
        difficulty,
        lessonTitle,
        questionIndex < 2 ? 'retrieval practice' : 'exam preparation',
      ]
        .filter(Boolean)
        .map((tag) => String(tag).trim())
        .filter(Boolean);
      const uniqueTags = [...new Set(tags)].slice(0, 8);
      if (!Array.isArray(nextQuestion[tagKey]) || nextQuestion[tagKey].length === 0) {
        nextQuestion[tagKey] = uniqueTags;
        addedQuestionTags++;
        quizChanged = true;
      }

      if (!String(nextQuestion[useKey] || '').trim()) {
        nextQuestion[useKey] =
          type === 'essay'
            ? `Use as a summative or exam-prep prompt after ${lessonTitle}; score with the provided rubric hints.`
            : `Use as retrieval practice after ${lessonTitle}; review explanations before moving to higher-stakes assessment.`;
        addedIntendedUses++;
        quizChanged = true;
      }

      bankIndex.push({
        id,
        lessonTitle,
        type,
        bloomsLevel: bloom,
        difficulty,
        estimatedMinutes: nextQuestion.estimatedMinutes || nextQuestion.em || null,
        intendedUse: nextQuestion[useKey],
        tags: Array.isArray(nextQuestion[tagKey]) ? nextQuestion[tagKey] : uniqueTags,
      });

      return quizChanged ? nextQuestion : question;
    });

    if (quizChanged) changed = true;
    return quizChanged ? { ...quiz, [questionKey]: questions } : quiz;
  });

  const existingIndex = Array.isArray(data?.bankIndex) ? data.bankIndex : null;
  const rebuiltIndex =
    bankIndex.length > 0 &&
    (!existingIndex ||
      existingIndex.length !== bankIndex.length ||
      existingIndex.some((entry, index) => entry?.id !== bankIndex[index]?.id));

  if (rebuiltIndex) changed = true;

  return {
    data: changed ? { ...data, [arrayKey]: nextQuizzes, bankIndex } : data,
    arrayKey,
    addedIds,
    addedQuestionTags,
    addedIntendedUses,
    rebuiltIndex,
  };
}

function stripObjectiveCodes(value) {
  return String(value || '')
    .replace(/\b\d+[a-z]\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getLessonNumberFromText(value) {
  const text = String(value || '');
  const match = text.match(/\b(?:lesson|week|module|unit|session)\s*(\d{1,2})\b/i);
  if (match) return Number(match[1]);
  return null;
}

function getLessonTitle(courseMap, lessonIndex) {
  return courseMap?.lessons?.[lessonIndex]?.title || `Lesson ${lessonIndex + 1}`;
}

function getLessonAssessmentText(lesson) {
  return (lesson?.sections || [])
    .map((section) => section?.weeklyAssessments || section?.assessment || '')
    .filter(Boolean)
    .join('\n');
}

function lessonHasRubricWorthyAssessment(lesson) {
  const text = getLessonAssessmentText(lesson);
  if (!text.trim()) return false;
  if (/\b(no assessment|none|n\/a|not applicable|optional only)\b/i.test(text)) return false;
  return /\b(assignment|paper|project|presentation|exam|quiz|test|portfolio|brief|report|case study|problem set|reflection|proposal|analysis|essay|final|midterm|checklist|critique|exercise|worksheet|model|dashboard|memo|checkpoint|exit ticket|lab)\b/i.test(
    text,
  );
}

function extractLessonNumbersFromRubric(rubric) {
  const haystack = [
    rubric?.lessonTitle,
    rubric?.lt,
    rubric?.gradedWork,
    rubric?.gw,
    rubric?.title,
    rubric?.t,
    rubric?.assessmentType,
    rubric?.at,
    ...(Array.isArray(rubric?.tags) ? rubric.tags : []),
    ...(Array.isArray(rubric?.tg) ? rubric.tg : []),
  ].join(' ');
  const explicit = getLessonNumberFromText(haystack);
  return explicit ? [explicit] : [];
}

function firstAssessmentLine(lesson) {
  return firstStructuredListItem(getLessonAssessmentText(lesson), 'Lesson Assessment');
}

function firstObjective(lesson) {
  const text = (lesson?.sections || [])
    .map((section) => section?.learningObjectives || '')
    .find((value) => String(value || '').trim());
  return (
    String(text || '')
      .split(/\n/)
      .map((line) => line.replace(/^students will be able to:\s*/i, '').trim())
      .find((line) => line && !/^students will be able to:?$/i.test(line)) ||
    'Assess the stated lesson learning objectives.'
  );
}

function buildFallbackRubric(lesson, lessonIndex) {
  const lessonTitle = getLessonTitle({ lessons: [lesson] }, 0).startsWith('Lesson ')
    ? getLessonTitle({ lessons: [lesson] }, 0)
    : `Lesson ${lessonIndex + 1}: ${getLessonTitle({ lessons: [lesson] }, 0)}`;
  const assessmentName = firstAssessmentLine(lesson);
  const objective = firstObjective(lesson);
  const title = `${assessmentName} Rubric`;

  return {
    title,
    lessonTitle,
    gradedWork: assessmentName,
    assessmentType: 'Analytic Rubric',
    totalPoints: 100,
    bloomsLevel: 'Evaluate',
    gradingScale: {
      exemplary: '90-100%',
      proficient: '75-89%',
      developing: '60-74%',
      beginning: 'Below 60%',
    },
    criteria: [
      {
        criterion: `${assessmentName} requirements and accuracy`,
        objectiveAligned: objective,
        weight: 30,
        points: 30,
        exemplary: `The student completes every required component of ${assessmentName} and connects the work to ${objective} with precise evidence. e.g., The submission names the required decision, method, or artifact and justifies each major choice.`,
        proficient: `The student completes the major ${assessmentName} requirements and links the work to ${objective} with relevant evidence. e.g., The submission explains the main choice and includes supporting details from the lesson task.`,
        developing: `The student addresses ${assessmentName}, but one required component or objective link is incomplete. e.g., The submission identifies the topic but leaves part of the evidence or reasoning unstated.`,
        beginning: `The student attempts ${assessmentName}, but key required work is missing or disconnected from ${objective}. e.g., The submission summarizes the topic without showing how it satisfies the assigned task.`,
      },
      {
        criterion: `${assessmentName} concept and evidence use`,
        objectiveAligned: objective,
        weight: 30,
        points: 30,
        exemplary: `The student applies the relevant concepts in ${assessmentName} accurately and supports claims with specific evidence. e.g., The work integrates named methods, readings, examples, or data to explain the decision made.`,
        proficient: `The student applies the main concepts in ${assessmentName} accurately with enough evidence to support the claim. e.g., The work cites a relevant concept and uses it to interpret the required example.`,
        developing: `The student uses course concepts in ${assessmentName}, but evidence is thin, broad, or only partly connected. e.g., The work names a concept but gives limited explanation of its relevance to the submitted artifact.`,
        beginning: `The student attempts to use concepts in ${assessmentName}, but shows confusion or relies mostly on unsupported description. e.g., The work lists terms without applying them to the assigned task.`,
      },
      {
        criterion: `${assessmentName} analysis and decision quality`,
        objectiveAligned: objective,
        weight: 25,
        points: 25,
        exemplary: `The student develops a clear line of reasoning in ${assessmentName} that considers implications, limits, or alternatives. e.g., The work explains why one approach is stronger while acknowledging a credible limitation.`,
        proficient: `The student presents reasoning in ${assessmentName} that supports the conclusion. e.g., The work explains the main choice and connects it to the evidence provided.`,
        developing: `The student presents reasoning in ${assessmentName}, but some links between evidence and conclusion are incomplete. e.g., The work makes a plausible claim but does not fully explain why the evidence supports it.`,
        beginning: `The student offers a conclusion in ${assessmentName} with minimal reasoning or unsupported assertions. e.g., The work states an answer but provides little explanation for the choice.`,
      },
      {
        criterion: `${assessmentName} communication and submission format`,
        objectiveAligned: objective,
        weight: 15,
        points: 15,
        exemplary: `The student presents ${assessmentName} in a polished, organized format that follows all stated submission requirements. e.g., The work uses headings, citations, visuals, or formatting that make the artifact easy to evaluate.`,
        proficient: `The student presents ${assessmentName} clearly and follows the major submission requirements. e.g., The work is organized, readable, and includes the required format elements.`,
        developing: `The student communicates the main ideas in ${assessmentName}, but organization, clarity, or formatting inconsistencies slow evaluation. e.g., The work is understandable but misses one format requirement.`,
        beginning: `The student submits ${assessmentName} in a form that is difficult to follow or misses multiple submission requirements. e.g., The work lacks structure or omits required formatting details.`,
      },
    ],
    gradePolicyConnection:
      'Use this rubric to score the lesson assessment within the grading category named in the course map. If the syllabus assigns a different weight, apply that official weight in the gradebook.',
    teacherNotes:
      'Distribute this rubric before students begin the assessment. Calibrate by reviewing one sample submission against each criterion, then give feedback that names the criterion and the next concrete improvement.',
    tags: ['rubric', 'assessment', lessonTitle, 'objective alignment', 'feedback'],
  };
}

export function normalizeRubricCoverage(data, courseMap) {
  const arrayKey = getArrayKey('rubrics', data) || (data?.rubrics ? 'rubrics' : null);
  const rubrics = arrayKey ? data?.[arrayKey] : null;
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];

  if (!Array.isArray(rubrics) || rubrics.length === 0 || lessons.length === 0) {
    return { data, arrayKey, addedRubrics: 0, missingLessonNumbers: [] };
  }

  const expectedLessonNumbers = lessons
    .map((lesson, index) => (lessonHasRubricWorthyAssessment(lesson) ? index + 1 : null))
    .filter(Boolean);

  if (expectedLessonNumbers.length === 0) {
    return { data, arrayKey, addedRubrics: 0, missingLessonNumbers: [] };
  }

  const covered = new Set();
  rubrics.forEach((rubric) => extractLessonNumbersFromRubric(rubric).forEach((num) => covered.add(num)));
  const missingLessonNumbers = expectedLessonNumbers.filter((num) => !covered.has(num));

  if (missingLessonNumbers.length === 0) {
    return { data, arrayKey, addedRubrics: 0, missingLessonNumbers: [] };
  }

  const fallbackRubrics = missingLessonNumbers.map((num) => buildFallbackRubric(lessons[num - 1], num - 1));
  const nextRubrics = [...rubrics, ...fallbackRubrics].sort((a, b) => {
    const aNum = extractLessonNumbersFromRubric(a)[0] || 9999;
    const bNum = extractLessonNumbersFromRubric(b)[0] || 9999;
    return aNum - bNum;
  });

  return {
    data: { ...data, [arrayKey]: nextRubrics },
    arrayKey,
    addedRubrics: fallbackRubrics.length,
    missingLessonNumbers,
  };
}

function moveAlias(source, target, aliases) {
  for (const alias of aliases) {
    if (source[target] === undefined && source[alias] !== undefined) {
      source[target] = source[alias];
      delete source[alias];
      return true;
    }
  }
  return false;
}

export function normalizeRubricSupport(data) {
  const arrayKey = getArrayKey('rubrics', data) || (data?.rubrics ? 'rubrics' : null);
  const rubrics = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(rubrics) || rubrics.length === 0) {
    return { data, arrayKey, normalizedSupportFields: 0, patchedCriterionPoints: 0, addedCriteria: 0 };
  }

  let normalizedSupportFields = 0;
  let patchedCriterionPoints = 0;
  let addedCriteria = 0;
  const nextRubrics = rubrics.map((rubric) => {
    const nextRubric = { ...rubric };
    let changed = false;

    if (moveAlias(nextRubric, 'taskDirections', ['td'])) {
      normalizedSupportFields++;
      changed = true;
    }
    if (moveAlias(nextRubric, 'instructorFacilitationNote', ['ifn', 'ia'])) {
      normalizedSupportFields++;
      changed = true;
    }
    if (moveAlias(nextRubric, 'accessibilityAndUDL', ['udl', 'au'])) {
      normalizedSupportFields++;
      changed = true;
    }
    if (moveAlias(nextRubric, 'anchorExamples', ['ax'])) {
      normalizedSupportFields++;
      changed = true;
    }

    const criteriaKey = Array.isArray(nextRubric.criteria) ? 'criteria' : Array.isArray(nextRubric.cr) ? 'cr' : null;
    if (criteriaKey) {
      let criteria = nextRubric[criteriaKey];
      let addedCriteriaForRubric = false;
      const fallbackCriteria = [
        {
          criterion: 'Use of course concepts and evidence',
          weight: 35,
          exemplary: 'Applies relevant course concepts accurately and supports claims with specific evidence.',
          proficient: 'Applies relevant course concepts with enough evidence to support the main claim.',
          developing: 'Uses course concepts unevenly or supports claims with limited evidence.',
          beginning: 'Names course concepts without applying them or relies on unsupported description.',
        },
        {
          criterion: 'Reasoning, organization, and communication',
          weight: 25,
          exemplary: 'Presents a clear, organized response with logical reasoning and polished communication.',
          proficient: 'Presents an organized response with understandable reasoning and clear communication.',
          developing: 'Presents understandable ideas, but reasoning or organization is uneven.',
          beginning: 'Presents limited reasoning or organization that makes the work difficult to evaluate.',
        },
      ];
      while (criteria.length < 3) {
        criteria = [...criteria, fallbackCriteria[criteria.length % fallbackCriteria.length]];
        addedCriteria++;
        addedCriteriaForRubric = true;
        changed = true;
      }

      const totalPoints = Number(nextRubric.totalPoints || nextRubric.tp);
      const weightTotal = criteria.reduce((sum, criterion) => sum + Number(criterion?.weight || criterion?.wt || 0), 0);
      const shouldRebalanceWeights = addedCriteriaForRubric || weightTotal < 95 || weightTotal > 105;
      const baseWeight = Math.floor(100 / criteria.length);

      if (shouldRebalanceWeights) {
        criteria = criteria.map((criterion, index) => {
          const weightKey = criterion?.wt !== undefined && criterion?.weight === undefined ? 'wt' : 'weight';
          const weight = index === criteria.length - 1 ? 100 - baseWeight * (criteria.length - 1) : baseWeight;
          if (criterion?.[weightKey] === weight) return criterion;
          changed = true;
          return { ...criterion, [weightKey]: weight };
        });
      }

      if (Number.isFinite(totalPoints) && totalPoints > 0) {
        criteria = criteria.map((criterion) => {
          const weight = Number(criterion?.weight || criterion?.wt);
          if (!Number.isFinite(weight) || weight <= 0) return criterion;
          const pointsKey = criterion.points !== undefined ? 'points' : criterion.pt !== undefined ? 'pt' : 'points';
          const expectedPoints = Math.round((weight / 100) * totalPoints);
          if (criterion[pointsKey] === expectedPoints) return criterion;
          patchedCriterionPoints++;
          changed = true;
          return { ...criterion, [pointsKey]: expectedPoints };
        });
      }
      nextRubric[criteriaKey] = criteria;
    }

    return changed ? nextRubric : rubric;
  });

  return {
    data:
      normalizedSupportFields > 0 || patchedCriterionPoints > 0 || addedCriteria > 0
        ? { ...data, [arrayKey]: nextRubrics }
        : data,
    arrayKey,
    normalizedSupportFields,
    patchedCriterionPoints,
    addedCriteria,
  };
}

function listFromValue(value) {
  if (Array.isArray(value))
    return value
      .filter(Boolean)
      .map((item) => String(item).trim())
      .filter(Boolean);
  return String(value || '')
    .split(/\n|;/)
    .map((item) => item.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

function getLessonObjectiveLines(lesson) {
  const lines = (lesson?.sections || []).flatMap((section) => listFromValue(section?.learningObjectives));
  const cleaned = lines
    .map((line) =>
      line
        .replace(/^students will be able to:\s*/i, '')
        .replace(/^\s*\d+[a-z]?[.)]\s*/i, '')
        .trim(),
    )
    .filter((line) => line && !/^students will be able to:?$/i.test(line));
  return cleaned.length > 0 ? cleaned : [firstObjective(lesson)];
}

function fieldKey(item, verboseKey, compactKey, fallbackKey = verboseKey) {
  if (item?.[verboseKey] !== undefined) return verboseKey;
  if (item?.[compactKey] !== undefined) return compactKey;
  return fallbackKey;
}

function normalizedComparable(value) {
  return stripObjectiveCodes(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleLooksGeneric(value) {
  const text = normalizedComparable(value);
  if (!text) return true;
  return /^(analytic )?(rubric|assessment rubric|lesson assessment rubric|lesson rubric|assignment rubric|quiz rubric|assignment brief|assessment brief)$/.test(
    text,
  );
}

function getAssignmentTitle(assignment) {
  return (
    assignment?.title ||
    assignment?.t ||
    assignment?.taskTitle ||
    assignment?.assessmentTitle ||
    assignment?.assignment ||
    ''
  );
}

function getAssignmentAssessmentType(assignment) {
  return assignment?.assignmentType || assignment?.at || assignment?.type || assignment?.assessmentType || '';
}

function getAssignmentObjectives(assignment) {
  const objectives = assignment?.objectives || assignment?.ob || assignment?.learningObjectives || assignment?.lo;
  return Array.isArray(objectives) ? objectives.filter(Boolean) : [];
}

function getAssignmentPercent(assignment) {
  return (
    assignment?.percentOfGrade ||
    assignment?.pg ||
    assignment?.weight ||
    assignment?.wt ||
    assignment?.percent ||
    assignment?.percentage ||
    ''
  );
}

function getAssignmentPoints(assignment) {
  return getNumericValue(assignment?.totalPoints ?? assignment?.tp ?? assignment?.points ?? assignment?.pts);
}

function compactGradedWorkTitle(value, fallback = 'Lesson Assessment') {
  const title = compactText(value, fallback, 140)
    .replace(/\s+(rubric|grading rubric)$/i, '')
    .trim();
  return title || fallback;
}

function getAssignmentsByLesson(assignmentsData, courseMap) {
  const assignmentKey =
    getArrayKey('assignments', assignmentsData) || (assignmentsData?.assignments ? 'assignments' : null);
  const assignments = assignmentKey ? assignmentsData?.[assignmentKey] : null;
  const byLesson = new Map();
  if (!Array.isArray(assignments) || assignments.length === 0) return byLesson;

  assignments.forEach((assignment, originalIndex) => {
    const lessonIndex = inferAssignmentLessonIndex(assignment, courseMap);
    if (lessonIndex === null) return;
    const existing = byLesson.get(lessonIndex) || [];
    existing.push({ assignment, originalIndex });
    byLesson.set(lessonIndex, existing);
  });
  return byLesson;
}

function makeAssessmentAnchor(courseMap, lesson, lessonIndex, assignmentEntry = null, assessmentTitleOverride = '') {
  const assignmentTitle = assignmentEntry ? getAssignmentTitle(assignmentEntry) : '';
  const assessmentTitle = compactGradedWorkTitle(
    assignmentTitle || assessmentTitleOverride || firstAssessmentLine(lesson),
  );
  const objectives = [...getAssignmentObjectives(assignmentEntry), ...getLessonObjectiveLines(lesson)]
    .map((objective) => String(objective || '').trim())
    .filter(Boolean);
  const uniqueObjectives = [...new Set(objectives)];
  const lessonTitle = getLessonTitle(courseMap, lessonIndex);
  const assessmentType =
    getAssignmentAssessmentType(assignmentEntry) ||
    assessmentTitle.split(':')[0]?.replace(/\s+/g, ' ').trim() ||
    'Assessment';

  return {
    lessonIndex,
    lessonNumber: lessonIndex + 1,
    lessonTitle,
    assessmentTitle,
    gradedWork: assessmentTitle,
    assessmentType,
    totalPoints: getAssignmentPoints(assignmentEntry) || 100,
    gradeWeight: getAssignmentPercent(assignmentEntry),
    objectives: uniqueObjectives.length > 0 ? uniqueObjectives : [firstObjective(lesson)],
    haystack: [lessonTitle, assessmentTitle, getLessonAssessmentText(lesson), ...uniqueObjectives].join(' '),
  };
}

function buildAssessmentAnchors(courseMap, assignmentsData = null) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const assignmentsByLesson = getAssignmentsByLesson(assignmentsData, courseMap);

  return lessons.map((lesson, lessonIndex) => {
    const assignmentEntry = assignmentsByLesson.get(lessonIndex)?.[0]?.assignment || null;
    return makeAssessmentAnchor(courseMap, lesson, lessonIndex, assignmentEntry);
  });
}

function buildRubricAssessmentAnchors(courseMap, assignmentsData = null) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const assignmentsByLesson = getAssignmentsByLesson(assignmentsData, courseMap);
  let anchorIndex = 0;

  return lessons.flatMap((lesson, lessonIndex) => {
    const assignmentEntries = assignmentsByLesson.get(lessonIndex) || [];
    const assignmentAnchors = assignmentEntries.map(({ assignment }) =>
      makeAssessmentAnchor(courseMap, lesson, lessonIndex, assignment),
    );
    const assessmentAnchors = splitStructuredListItems(getLessonAssessmentText(lesson))
      .filter((item) => lessonHasRubricWorthyAssessment({ sections: [{ weeklyAssessments: item }] }))
      .map((item) => makeAssessmentAnchor(courseMap, lesson, lessonIndex, null, item));
    const anchorsByAssessment = new Map();
    [...assignmentAnchors, ...assessmentAnchors].forEach((anchor) => {
      const key = `${anchor.lessonNumber}:${normalizedComparable(anchor.gradedWork || anchor.assessmentTitle)}`;
      if (!anchorsByAssessment.has(key)) anchorsByAssessment.set(key, anchor);
    });
    const anchors = [...anchorsByAssessment.values()];
    const fallbackAnchors = anchors.length > 0 ? anchors : [makeAssessmentAnchor(courseMap, lesson, lessonIndex)];
    return fallbackAnchors.map((anchor, localAssessmentIndex) => ({
      ...anchor,
      anchorIndex: anchorIndex++,
      localAssessmentIndex,
    }));
  });
}

function getRubricHaystack(rubric) {
  return [
    rubric?.lessonTitle,
    rubric?.lt,
    rubric?.title,
    rubric?.t,
    rubric?.gradedWork,
    rubric?.gw,
    rubric?.assessmentType,
    rubric?.at,
    rubric?.taskDirections,
    rubric?.td,
    rubric?.gradePolicyConnection,
    rubric?.gp,
    ...(Array.isArray(rubric?.tags) ? rubric.tags : []),
    ...(Array.isArray(rubric?.tg) ? rubric.tg : []),
  ].join(' ');
}

function scoreRubricAnchor(rubric, anchor) {
  const haystack = normalizedComparable(getRubricHaystack(rubric));
  const explicit = getLessonNumberFromText(haystack);
  const anchorLesson = normalizedComparable(anchor.lessonTitle);
  const anchorAssessment = normalizedComparable(anchor.assessmentTitle);
  let score = 0;
  if (explicit === anchor.lessonNumber) score += 1000;
  if (anchorLesson && haystack.includes(anchorLesson)) score += 80;
  if (anchorAssessment && haystack.includes(anchorAssessment)) score += 70;
  const anchorGradedWork = normalizedComparable(anchor.gradedWork);
  if (anchorGradedWork && haystack.includes(anchorGradedWork)) score += 90;
  const rubricTokens = tokenize(haystack);
  tokenize(anchor.haystack).forEach((token) => {
    if (rubricTokens.has(token)) score += 1;
  });
  return score;
}

function inferRubricAnchorIndex(rubric, anchors, rubricIndex, rubricCount) {
  const explicit = getLessonNumberFromText(getRubricHaystack(rubric));
  const candidates =
    explicit && anchors.some((anchor) => anchor.lessonNumber === explicit)
      ? anchors.filter((anchor) => anchor.lessonNumber === explicit)
      : anchors;

  let best = { index: null, score: 0 };
  candidates.forEach((anchor) => {
    const score = scoreRubricAnchor(rubric, anchor);
    if (score > best.score) best = { index: anchor.anchorIndex ?? anchor.lessonIndex, score };
  });
  if (best.score > 0) return best.index;
  if (explicit && candidates[0]) return candidates[0].anchorIndex ?? candidates[0].lessonIndex;
  if (rubricCount === anchors.length && anchors[rubricIndex]) {
    return anchors[rubricIndex].anchorIndex ?? anchors[rubricIndex].lessonIndex;
  }
  return null;
}

function valueIsMissingOrShort(value, minWords = 8) {
  const text = String(value || '').trim();
  return text.split(/\s+/).filter(Boolean).length < minWords;
}

function rubricGradedWorkLooksUsable(value) {
  const raw = String(value || '').trim();
  const cleaned = compactGradedWorkTitle(raw, '');
  if (valueIsMissingOrShort(cleaned, 3)) return false;
  if (titleLooksGeneric(cleaned)) return false;
  if (/\brubric$/i.test(raw)) return false;
  return true;
}

function inferAssessmentTypeFromGradedWork(gradedWork, fallback = '') {
  const text = normalizedComparable(gradedWork);
  const patterns = [
    ['Discussion Post', /\b(discussion|forum|post|reply|thread)\b/],
    ['Quiz', /\b(quiz|check quiz|knowledge check)\b/],
    ['Problem Set', /\b(problem set|problems|calculation|worksheet)\b/],
    ['Reflection', /\b(reflection|reflective|journal)\b/],
    ['Memo', /\b(memo|memorandum)\b/],
    ['Brief', /\b(brief|case brief|policy brief)\b/],
    ['Report', /\b(report|lab report)\b/],
    ['Presentation', /\b(presentation|oral|slides|pitch)\b/],
    ['Project', /\b(project|prototype|portfolio|capstone)\b/],
    ['Research Paper', /\b(research paper|paper)\b/],
    ['Written Essay', /\b(essay|written response)\b/],
    ['Case Study', /\b(case study|case analysis)\b/],
    ['Lab', /\b(lab|experiment)\b/],
    ['Dataset/File Submission', /\b(dataset|workbook|spreadsheet|file|notebook|log)\b/],
    ['Exam', /\b(exam|midterm|final test|test)\b/],
    ['Checklist', /\b(checklist|checkpoint)\b/],
    ['Analysis', /\b(analysis|critique|evaluation|audit)\b/],
    ['Demonstration', /\b(demonstration|demo)\b/],
  ];
  const match = patterns.find(([, pattern]) => pattern.test(text));
  if (match) return match[0];

  const fallbackText = String(fallback || '').trim();
  if (fallbackText && !titleLooksGeneric(fallbackText) && !/\brubric$/i.test(fallbackText)) return fallbackText;
  return 'Assessment';
}

function assessmentTypeMatchesGradedWork(assessmentType, inferredType) {
  const current = normalizedComparable(assessmentType);
  const inferred = normalizedComparable(inferredType);
  if (!current || !inferred) return false;
  if (current.includes(inferred) || inferred.includes(current)) return true;
  return false;
}

function sentenceFragment(value) {
  return String(value || '')
    .replace(/[.!?]+$/g, '')
    .trim();
}

function objectiveNeedsAlignment(value) {
  const stripped = stripObjectiveCodes(value);
  return !stripped || stripped.split(/\s+/).filter(Boolean).length < 5;
}

const GENERIC_RUBRIC_CRITERION_RE =
  /^(objective alignment and task completion|use of course concepts and evidence|analysis,? reasoning,? and judgment|reasoning,? organization,? and communication|communication and submission quality|concept use|evidence quality|reasoning|communication)$/i;

const GENERIC_RUBRIC_DESCRIPTOR_RE =
  /\b(target learning objective|required components|course concepts accurately|central claim|relevant concept|course evidence|the response cites|the submission names|clear,\s*logical line of reasoning|evidence and conclusion|unsupported assertions|submission requirements|format elements|understandable reasoning|polished communication)\b/i;

function rubricCriterionNeedsSpecificity(criterion, nameKey) {
  const name = String(criterion?.[nameKey] || '').trim();
  if (!name || GENERIC_RUBRIC_CRITERION_RE.test(name)) return true;
  return ['exemplary', 'proficient', 'developing', 'beginning', 'ex', 'pr', 'dv', 'bg'].some((key) =>
    GENERIC_RUBRIC_DESCRIPTOR_RE.test(String(criterion?.[key] || '')),
  );
}

function compactCriterionFocus(value, fallback) {
  const words = String(value || fallback || '')
    .replace(/^students will be able to:\s*/i, '')
    .replace(/^\s*\d+[a-z]?[.)]\s*/i, '')
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 7);
  return words.join(' ') || fallback;
}

function buildSpecificRubricCriterionName(anchor, index, currentName) {
  const assessment = compactCriterionFocus(
    anchor.canonicalGradedWork || anchor.gradedWork || anchor.assessmentTitle,
    anchor.assessmentType || 'assessment',
  );
  const objective = compactCriterionFocus(anchor.objectives[index % anchor.objectives.length], assessment);
  const lesson = stripLessonPrefix(anchor.lessonTitle);
  const names = [
    `${assessment} requirements and accuracy`,
    `${objective} evidence use`,
    `${lesson || assessment} reasoning and interpretation`,
    `${assessment} communication and format`,
    `${objective} transfer and limitation awareness`,
    `${assessment} revision and feedback use`,
  ];
  const selected = names[index % names.length];
  if (!currentName || GENERIC_RUBRIC_CRITERION_RE.test(String(currentName).trim())) return selected;
  return `${String(currentName).trim()} for ${lesson || assessment}`;
}

function buildSpecificRubricDescriptors(anchor, criterionName, objective) {
  const assessment = sentenceFragment(anchor.canonicalGradedWork || anchor.gradedWork || anchor.assessmentTitle);
  const lesson = sentenceFragment(stripLessonPrefix(anchor.lessonTitle) || anchor.lessonTitle);
  const objectiveText = sentenceFragment(objective || anchor.objectives[0]);
  return {
    exemplary: `Completes ${assessment} with strong ${criterionName.toLowerCase()}. Uses clear ${lesson} evidence and explains how it shows ${objectiveText}.`,
    proficient: `Completes most of ${assessment}. Uses relevant ${lesson} evidence and explains the main link to ${objectiveText}.`,
    developing: `Addresses ${assessment}, but evidence or explanation is incomplete. Some links to ${lesson} are unclear.`,
    beginning: `Attempts ${assessment}, but key evidence is missing or not connected to ${lesson}.`,
  };
}

function patchRubricToAnchor(rubric, anchor) {
  let next = rubric;
  let patchedLessonLinks = 0;
  let patchedTitles = 0;
  let patchedObjectiveLinks = 0;
  let patchedWeights = 0;
  let patchedSupport = 0;

  const lessonTitleKey = fieldKey(next, 'lessonTitle', 'lt', 'lessonTitle');
  if (next[lessonTitleKey] !== anchor.lessonTitle) {
    next = { ...next, [lessonTitleKey]: anchor.lessonTitle };
    patchedLessonLinks++;
  }

  const titleKey = fieldKey(next, 'title', 't', 'title');
  const currentTitle = next[titleKey];
  const gradedWorkKey =
    next.gradedWork !== undefined ? 'gradedWork' : next.gw !== undefined || next.t !== undefined ? 'gw' : 'gradedWork';
  const currentGradedWork = String(next[gradedWorkKey] || '').trim();
  const canonicalGradedWork = rubricGradedWorkLooksUsable(currentGradedWork)
    ? compactGradedWorkTitle(currentGradedWork, anchor.gradedWork)
    : anchor.gradedWork;

  if (next[gradedWorkKey] !== canonicalGradedWork) {
    next = { ...next, [gradedWorkKey]: canonicalGradedWork };
    patchedTitles++;
  }

  if (titleLooksGeneric(currentTitle)) {
    next = { ...next, [titleKey]: `${canonicalGradedWork} Rubric` };
    patchedTitles++;
  }

  const typeKey = fieldKey(next, 'assessmentType', 'at', 'assessmentType');
  const inferredAssessmentType = inferAssessmentTypeFromGradedWork(canonicalGradedWork, anchor.assessmentType);
  if (
    valueIsMissingOrShort(next[typeKey], 1) ||
    !assessmentTypeMatchesGradedWork(next[typeKey], inferredAssessmentType)
  ) {
    next = { ...next, [typeKey]: inferredAssessmentType };
    patchedTitles++;
  }

  const pointsKey = fieldKey(next, 'totalPoints', 'tp', 'totalPoints');
  const currentPoints = getNumericValue(next[pointsKey]);
  if (!Number.isFinite(currentPoints) || currentPoints <= 0) {
    next = { ...next, [pointsKey]: anchor.totalPoints };
    patchedWeights++;
  }

  const policyKey = fieldKey(next, 'gradePolicyConnection', 'gp', 'gradePolicyConnection');
  const policy = String(next[policyKey] || '').trim();
  const policyNeedsWork =
    valueIsMissingOrShort(policy, anchor.gradeWeight ? 12 : 8) ||
    !normalizedComparable(policy).includes(normalizedComparable(canonicalGradedWork));
  if (policyNeedsWork) {
    const weightText = anchor.gradeWeight ? ` It contributes ${anchor.gradeWeight} to the course grade.` : '';
    next = {
      ...next,
      [policyKey]: `Use this rubric to score the graded student work "${canonicalGradedWork}" for ${anchor.lessonTitle}.${weightText} Apply the course syllabus if the local grade policy differs.`,
    };
    patchedWeights++;
  }

  const directionsKey = fieldKey(next, 'taskDirections', 'td', 'taskDirections');
  const directions = String(next[directionsKey] || '').trim();
  const cleanDirections = directions.replace(/\bExisting task focus:\s*\.\s*/gi, '').trim();
  const directionsNeedWork =
    cleanDirections !== directions ||
    valueIsMissingOrShort(cleanDirections, 10) ||
    !normalizedComparable(cleanDirections).includes(normalizedComparable(canonicalGradedWork)) ||
    !/\b(graded student work|rubric evaluates|students submit|student work)\b/i.test(cleanDirections);
  if (directionsNeedWork) {
    next = {
      ...next,
      [directionsKey]: `This rubric evaluates the graded student work: ${canonicalGradedWork}. Students submit it for ${anchor.lessonTitle} and must directly demonstrate the listed lesson objectives.`,
    };
    patchedSupport++;
  }

  const criteriaKey = Array.isArray(next?.criteria) ? 'criteria' : Array.isArray(next?.cr) ? 'cr' : null;
  if (criteriaKey) {
    let criteriaChanged = false;
    const criterionAnchor = { ...anchor, canonicalGradedWork };
    const criteria = next[criteriaKey].map((criterion, index) => {
      let nextCriterion = criterion;
      const objectiveKey = fieldKey(criterion, 'objectiveAligned', 'oa', 'objectiveAligned');
      const objective = anchor.objectives[index % anchor.objectives.length];
      if (objectiveNeedsAlignment(nextCriterion?.[objectiveKey])) {
        patchedObjectiveLinks++;
        criteriaChanged = true;
        nextCriterion = { ...nextCriterion, [objectiveKey]: objective };
      }

      const criterionNameKey = fieldKey(nextCriterion, 'criterion', 'cn', 'criterion');
      if (rubricCriterionNeedsSpecificity(nextCriterion, criterionNameKey)) {
        const criterionName = buildSpecificRubricCriterionName(
          criterionAnchor,
          index,
          nextCriterion?.[criterionNameKey],
        );
        const descriptors = buildSpecificRubricDescriptors(
          criterionAnchor,
          criterionName,
          nextCriterion?.[objectiveKey],
        );
        const exemplaryKey = fieldKey(nextCriterion, 'exemplary', 'ex', 'exemplary');
        const proficientKey = fieldKey(nextCriterion, 'proficient', 'pr', 'proficient');
        const developingKey = fieldKey(nextCriterion, 'developing', 'dv', 'developing');
        const beginningKey = fieldKey(nextCriterion, 'beginning', 'bg', 'beginning');
        nextCriterion = {
          ...nextCriterion,
          [criterionNameKey]: criterionName,
          [exemplaryKey]: descriptors.exemplary,
          [proficientKey]: descriptors.proficient,
          [developingKey]: descriptors.developing,
          [beginningKey]: descriptors.beginning,
        };
        patchedSupport++;
        criteriaChanged = true;
      }

      return nextCriterion;
    });
    if (criteriaChanged) next = { ...next, [criteriaKey]: criteria };
  }

  const tagKey = Array.isArray(next?.tags) ? 'tags' : Array.isArray(next?.tg) ? 'tg' : null;
  if (tagKey) {
    const tags = [
      ...new Set([...next[tagKey], anchor.lessonTitle, anchor.assessmentTitle, canonicalGradedWork, 'rubric']),
    ].filter(Boolean);
    if (tags.length !== next[tagKey].length) {
      next = { ...next, [tagKey]: tags };
      patchedSupport++;
    }
  }

  return {
    rubric: next,
    changed: next !== rubric,
    patchedLessonLinks,
    patchedTitles,
    patchedObjectiveLinks,
    patchedWeights,
    patchedSupport,
  };
}

export function normalizeRubricAssessmentAlignment(data, courseMap, assignmentsData = null) {
  const arrayKey = getArrayKey('rubrics', data) || (data?.rubrics ? 'rubrics' : null);
  const rubrics = arrayKey ? data?.[arrayKey] : null;
  const anchors = buildRubricAssessmentAnchors(courseMap, assignmentsData).filter((anchor) =>
    lessonHasRubricWorthyAssessment(courseMap?.lessons?.[anchor.lessonIndex]),
  );

  if (!Array.isArray(rubrics) || rubrics.length === 0 || anchors.length === 0) {
    return {
      data,
      arrayKey,
      patchedLessonLinks: 0,
      patchedTitles: 0,
      patchedObjectiveLinks: 0,
      patchedWeights: 0,
      patchedSupport: 0,
      reorderedRubrics: false,
    };
  }

  const rows = rubrics.map((rubric, originalIndex) => {
    const anchorIndex = inferRubricAnchorIndex(rubric, anchors, originalIndex, rubrics.length);
    const anchor =
      anchorIndex === null ? null : anchors.find((item) => (item.anchorIndex ?? item.lessonIndex) === anchorIndex);
    if (!anchor) return { rubric, originalIndex, anchorIndex: null, patch: null };
    const patch = patchRubricToAnchor(rubric, anchor);
    return { rubric: patch.rubric, originalIndex, anchorIndex, patch };
  });

  const sorted = [...rows].sort((a, b) => {
    const aKey = a.anchorIndex ?? 9999;
    const bKey = b.anchorIndex ?? 9999;
    if (aKey !== bKey) return aKey - bKey;
    return a.originalIndex - b.originalIndex;
  });

  const counts = rows.reduce(
    (acc, row) => {
      if (!row.patch) return acc;
      acc.patchedLessonLinks += row.patch.patchedLessonLinks;
      acc.patchedTitles += row.patch.patchedTitles;
      acc.patchedObjectiveLinks += row.patch.patchedObjectiveLinks;
      acc.patchedWeights += row.patch.patchedWeights;
      acc.patchedSupport += row.patch.patchedSupport;
      return acc;
    },
    {
      patchedLessonLinks: 0,
      patchedTitles: 0,
      patchedObjectiveLinks: 0,
      patchedWeights: 0,
      patchedSupport: 0,
    },
  );
  const reorderedRubrics = sorted.some((entry, index) => entry.originalIndex !== index);
  const changed =
    reorderedRubrics ||
    Object.values(counts).some((count) => count > 0) ||
    sorted.some((entry) => entry.rubric !== rubrics[entry.originalIndex]);

  return {
    data: changed ? { ...data, [arrayKey]: sorted.map((entry) => entry.rubric) } : data,
    arrayKey,
    ...counts,
    reorderedRubrics,
  };
}

function patchAssignmentToAnchor(assignment, anchor) {
  let next = assignment;
  let patchedTitles = 0;
  let patchedObjectives = 0;
  let patchedSupport = 0;

  const titleKey = fieldKey(next, 'title', 't', 'title');
  if (titleLooksGeneric(next[titleKey])) {
    next = { ...next, [titleKey]: anchor.assessmentTitle };
    patchedTitles++;
  }

  const objectivesKey = Array.isArray(next?.objectives) ? 'objectives' : Array.isArray(next?.ob) ? 'ob' : 'objectives';
  const objectives = Array.isArray(next[objectivesKey]) ? next[objectivesKey] : [];
  if (objectives.length === 0 || objectives.every(objectiveNeedsAlignment)) {
    next = { ...next, [objectivesKey]: anchor.objectives.slice(0, 3) };
    patchedObjectives++;
  }

  const overviewKey = fieldKey(next, 'overview', 'ov', 'overview');
  if (valueIsMissingOrShort(next[overviewKey], 12)) {
    const assessmentTitle = sentenceFragment(anchor.assessmentTitle);
    const primaryObjective = sentenceFragment(anchor.objectives[0]);
    next = {
      ...next,
      [overviewKey]: `Students complete ${assessmentTitle} for ${anchor.lessonTitle}. They explain how ${primaryObjective} guides their evidence, decisions, or recommendation.`,
    };
    patchedSupport++;
  }

  const criteriaKey = fieldKey(next, 'gradingCriteria', 'gc', 'gradingCriteria');
  if (gradingCriteriaNeedsSupport(next[criteriaKey])) {
    const assessmentTitle = sentenceFragment(anchor.assessmentTitle);
    const primaryObjective = sentenceFragment(anchor.objectives[0]);
    next = {
      ...next,
      [criteriaKey]: `Score ${assessmentTitle} for accurate use of ${primaryObjective}. Check lesson-specific evidence from ${anchor.lessonTitle}, analytical reasoning, and clear communication.`,
    };
    patchedSupport++;
  }

  return { assignment: next, changed: next !== assignment, patchedTitles, patchedObjectives, patchedSupport };
}

function gradingCriteriaNeedsSupport(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (
    /\b(evidence|recommendation|criteria|criterion|score|scored|rubric|quality|analysis|reasoning|communication|specific|actionable|accuracy|complete|completion|alignment|feedback|revision)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  return valueIsMissingOrShort(text, 12);
}

export function normalizeAssignmentAssessmentAlignment(data, courseMap) {
  const arrayKey = getArrayKey('assignments', data) || (data?.assignments ? 'assignments' : null);
  const assignments = arrayKey ? data?.[arrayKey] : null;
  const anchors = buildAssessmentAnchors(courseMap);

  if (!Array.isArray(assignments) || assignments.length === 0 || anchors.length === 0) {
    return { data, arrayKey, patchedTitles: 0, patchedObjectives: 0, patchedSupport: 0 };
  }

  const counts = { patchedTitles: 0, patchedObjectives: 0, patchedSupport: 0 };
  let changed = false;
  const nextAssignments = assignments.map((assignment) => {
    const lessonIndex = inferAssignmentLessonIndex(assignment, courseMap);
    const anchor = lessonIndex === null ? null : anchors[lessonIndex];
    if (!anchor) return assignment;
    const patch = patchAssignmentToAnchor(assignment, anchor);
    counts.patchedTitles += patch.patchedTitles;
    counts.patchedObjectives += patch.patchedObjectives;
    counts.patchedSupport += patch.patchedSupport;
    if (patch.changed) changed = true;
    return patch.assignment;
  });

  return {
    data: changed ? { ...data, [arrayKey]: nextAssignments } : data,
    arrayKey,
    ...counts,
  };
}

function inferQuizLessonIndex(quiz, courseMap, quizIndex, quizCount) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  // v0.14.1 round 2 (bug 1): registry-mode entries carry their own integer
  // lessonNumber — trust it before any text sniffing. The live geology
  // midterm's tags listed its covered lessons ("Lesson 1: Introduction…"),
  // so the haystack probe below re-homed the exam to lesson 1.
  const ownLessonNumber = Number(quiz?.lessonNumber ?? quiz?.ln);
  if (Number.isInteger(ownLessonNumber) && ownLessonNumber >= 1 && ownLessonNumber <= lessons.length) {
    return ownLessonNumber - 1;
  }
  const haystack = [
    quiz?.lessonTitle,
    quiz?.lt,
    quiz?.title,
    quiz?.t,
    quiz?.topic,
    quiz?.tp,
    ...(Array.isArray(quiz?.tags) ? quiz.tags : []),
    ...(Array.isArray(quiz?.tg) ? quiz.tg : []),
  ].join(' ');
  const explicit = getLessonNumberFromText(haystack);
  if (explicit && explicit >= 1 && explicit <= lessons.length) return explicit - 1;
  const normalized = normalizedComparable(haystack);
  let best = { index: null, score: 0 };
  lessons.forEach((lesson, index) => {
    const title = normalizedComparable(getLessonTitle(courseMap, index));
    let score = title && normalized.includes(title) ? 80 : 0;
    const quizTokens = tokenize(normalized);
    tokenize(getCourseLessonHaystack(lesson)).forEach((token) => {
      if (quizTokens.has(token)) score += 1;
    });
    if (score > best.score) best = { index, score };
  });
  if (best.score > 0) return best.index;
  if (quizCount === lessons.length && lessons[quizIndex]) return quizIndex;
  return null;
}

export function normalizeQuizAssessmentAlignment(data, courseMap) {
  const arrayKey = getArrayKey('quizBank', data) || (data?.quizzes ? 'quizzes' : null);
  const quizzes = arrayKey ? data?.[arrayKey] : null;
  const anchors = buildAssessmentAnchors(courseMap);

  if (!Array.isArray(quizzes) || quizzes.length === 0 || anchors.length === 0) {
    return { data, arrayKey, patchedLessonTitles: 0, patchedObjectiveAlignment: 0 };
  }

  let patchedLessonTitles = 0;
  let patchedObjectiveAlignment = 0;
  let changed = false;
  const nextQuizzes = quizzes.map((quiz, quizIndex) => {
    // v0.14.1 round 2 (bug 1): registry exam entries keep their own identity.
    // This very normalizer retitled the live geology midterm/final and both
    // cs-python exams to "Lesson 1: …" (their covered-lesson tags fooled
    // inferQuizLessonIndex), decapitating the exam inside the exported docx —
    // PACKAGE_MANIFEST promised an exam the document never named. An exam
    // spans a RANGE of lessons, so single-week title/objective alignment
    // never applies to it.
    if (quiz?.kind === 'exam') return quiz;
    const lessonIndex = inferQuizLessonIndex(quiz, courseMap, quizIndex, quizzes.length);
    const anchor = lessonIndex === null ? null : anchors[lessonIndex];
    if (!anchor) return quiz;
    let nextQuiz = quiz;

    const lessonTitleKey = fieldKey(nextQuiz, 'lessonTitle', 'lt', 'lessonTitle');
    if (nextQuiz[lessonTitleKey] !== anchor.lessonTitle) {
      nextQuiz = { ...nextQuiz, [lessonTitleKey]: anchor.lessonTitle };
      patchedLessonTitles++;
      changed = true;
    }

    const questionKey = getQuestionKey(nextQuiz);
    if (questionKey) {
      let questionsChanged = false;
      const questions = nextQuiz[questionKey].map((question, index) => {
        const objectiveKey = fieldKey(question, 'objectiveAligned', 'oa', 'objectiveAligned');
        if (!objectiveNeedsAlignment(question?.[objectiveKey])) return question;
        patchedObjectiveAlignment++;
        questionsChanged = true;
        return { ...question, [objectiveKey]: anchor.objectives[index % anchor.objectives.length] };
      });
      if (questionsChanged) {
        nextQuiz = { ...nextQuiz, [questionKey]: questions };
        changed = true;
      }
    }

    return nextQuiz;
  });

  return {
    data: changed ? { ...data, [arrayKey]: nextQuizzes } : data,
    arrayKey,
    patchedLessonTitles,
    patchedObjectiveAlignment,
  };
}

function getCourseLessonHaystack(lesson) {
  return [
    lesson?.title,
    ...(lesson?.sections || []).flatMap((section) => [
      section?.weeklyAssessments,
      section?.learningObjectives,
      section?.topicSection,
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function tokenize(value) {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'that',
    'this',
    'assignment',
    'brief',
    'lesson',
    'week',
    'students',
    'student',
  ]);
  return new Set(
    stripObjectiveCodes(value)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 3 && !stopWords.has(token)),
  );
}

function scoreAssignmentLesson(assignment, lesson, index) {
  const related = Array.isArray(assignment?.relatedLessons)
    ? assignment.relatedLessons.join(' ')
    : Array.isArray(assignment?.rl)
      ? assignment.rl.join(' ')
      : '';
  const explicit =
    getLessonNumberFromText(related) ||
    getLessonNumberFromText(assignment?.dueWeek || assignment?.dw) ||
    getLessonNumberFromText(assignment?.title || assignment?.t);
  if (explicit === index + 1) return 1000;

  const assignmentText = [
    assignment?.title || assignment?.t,
    assignment?.assignmentType || assignment?.at,
    assignment?.overview || assignment?.ov,
    assignment?.gradingCriteria || assignment?.gc,
    related,
    ...(Array.isArray(assignment?.objectives) ? assignment.objectives : []),
    ...(Array.isArray(assignment?.ob) ? assignment.ob : []),
  ].join(' ');
  const tokens = tokenize(assignmentText);
  const haystack = getCourseLessonHaystack(lesson);
  let score = 0;
  tokens.forEach((token) => {
    if (haystack.includes(token)) score++;
  });
  return score;
}

function inferAssignmentLessonIndex(assignment, courseMap) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  if (lessons.length === 0) return null;

  const related = Array.isArray(assignment?.relatedLessons)
    ? assignment.relatedLessons.join(' ')
    : Array.isArray(assignment?.rl)
      ? assignment.rl.join(' ')
      : '';
  const explicit =
    getLessonNumberFromText(related) ||
    getLessonNumberFromText(assignment?.dueWeek || assignment?.dw) ||
    getLessonNumberFromText(assignment?.title || assignment?.t);
  if (explicit && explicit >= 1 && explicit <= lessons.length) return explicit - 1;

  let best = { index: null, score: 0 };
  lessons.forEach((lesson, index) => {
    const score = scoreAssignmentLesson(assignment, lesson, index);
    if (score > best.score) best = { index, score };
  });
  return best.score > 0 ? best.index : null;
}

function relatedLessonsNeedRepair(relatedLessons = []) {
  if (!Array.isArray(relatedLessons) || relatedLessons.length === 0) return true;
  const joined = relatedLessons.join(' ').trim();
  if (!joined) return true;
  if (/^(?:\d+[a-z](?:\s*,\s*)?)+$/i.test(joined)) return true;
  return relatedLessons.every((value) => !/\b(?:lesson|week|module|unit|session)\s*\d+/i.test(String(value || '')));
}

function getPercentValue(value) {
  const number = Number(String(value || '').match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(number) ? number : 0;
}

function distributePercentWeights(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) return values.map(() => 0);

  const exact = values.map((value) => (value / total) * 100);
  const floors = exact.map(Math.floor);
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const result = [...floors];
  for (let i = 0; i < order.length && remainder > 0; i++) {
    result[order[i].index] += 1;
    remainder--;
  }
  return result;
}

export function normalizeAssignmentGradeWeights(data) {
  const arrayKey = getArrayKey('assignments', data) || (data?.assignments ? 'assignments' : null);
  const assignments = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(assignments) || assignments.length === 0) {
    return { data, arrayKey, normalizedGradeWeights: false, previousTotal: 0, newTotal: 0 };
  }

  const weightKeys = ['percentOfGrade', 'pg', 'weight', 'wt', 'percent', 'percentage'];
  const values = assignments.map((assignment) => {
    const key = weightKeys.find((candidate) => assignment?.[candidate] !== undefined);
    return getPercentValue(key ? assignment[key] : null);
  });
  const previousTotal = values.reduce((sum, value) => sum + value, 0);
  if (previousTotal <= 0 || Math.abs(previousTotal - 100) <= 2) {
    return { data, arrayKey, normalizedGradeWeights: false, previousTotal, newTotal: previousTotal };
  }

  const normalized = distributePercentWeights(values);
  const nextAssignments = assignments.map((assignment, index) => {
    const weightKey = weightKeys.find((candidate) => assignment?.[candidate] !== undefined) || 'pg';
    return { ...assignment, [weightKey]: `${normalized[index]}%` };
  });

  return {
    data: { ...data, [arrayKey]: nextAssignments },
    arrayKey,
    normalizedGradeWeights: true,
    previousTotal,
    newTotal: normalized.reduce((sum, value) => sum + value, 0),
  };
}

export function normalizeAssignmentLessonAlignment(data, courseMap) {
  const arrayKey = getArrayKey('assignments', data) || (data?.assignments ? 'assignments' : null);
  const assignments = arrayKey ? data?.[arrayKey] : null;
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];

  if (!Array.isArray(assignments) || assignments.length === 0 || lessons.length === 0) {
    return { data, arrayKey, patchedRelatedLessons: 0, reorderedAssignments: false };
  }

  let patchedRelatedLessons = 0;
  const withSortKeys = assignments.map((assignment, originalIndex) => {
    const lessonIndex = inferAssignmentLessonIndex(assignment, courseMap);
    let nextAssignment = assignment;
    const relatedLessons = Array.isArray(assignment?.relatedLessons) ? assignment.relatedLessons : assignment?.rl;
    if (lessonIndex !== null && relatedLessonsNeedRepair(relatedLessons)) {
      patchedRelatedLessons++;
      const relatedLessonsKey =
        assignment?.relatedLessons !== undefined
          ? 'relatedLessons'
          : assignment?.rl !== undefined
            ? 'rl'
            : 'relatedLessons';
      nextAssignment = { ...assignment, [relatedLessonsKey]: [getLessonTitle(courseMap, lessonIndex)] };
    }
    return { assignment: nextAssignment, lessonIndex, originalIndex };
  });

  const sorted = [...withSortKeys].sort((a, b) => {
    const aKey = a.lessonIndex ?? 9999;
    const bKey = b.lessonIndex ?? 9999;
    if (aKey !== bKey) return aKey - bKey;
    return a.originalIndex - b.originalIndex;
  });
  const reorderedAssignments = sorted.some((entry, index) => entry.originalIndex !== index);

  if (patchedRelatedLessons === 0 && !reorderedAssignments) {
    return { data, arrayKey, patchedRelatedLessons: 0, reorderedAssignments: false };
  }

  return {
    data: { ...data, [arrayKey]: sorted.map((entry) => entry.assignment) },
    arrayKey,
    patchedRelatedLessons,
    reorderedAssignments,
  };
}

function buildFallbackSlideNotes(deck, slide, index) {
  const lessonTitle = deck?.lessonTitle || deck?.lt || 'this lesson';
  const slideTitle = slide?.title || slide?.t || `slide ${index + 1}`;
  const slideType = slide?.type || slide?.ty || 'slide';
  const firstBullet = Array.isArray(slide?.bullets || slide?.bu) ? (slide.bullets || slide.bu)[0] : '';
  const anchor = firstBullet || slideTitle;

  return [
    `Use this ${slideType} slide to connect "${slideTitle}" to the larger purpose of ${lessonTitle}.`,
    `Emphasize ${anchor} in concrete language and tie it back to the lesson objective.`,
    `For "${slideTitle}", a likely student question asks how the idea works in ${lessonTitle}; answer with a brief lesson-specific example.`,
    `TRANSITION: From "${slideTitle}", name the next concept or activity students will use in ${lessonTitle}.`,
  ].join(' ');
}

export function normalizeSlideDeckSpeakerNotes(data) {
  const arrayKey = getArrayKey('slideDecks', data) || (data?.decks ? 'decks' : data?.slideDecks ? 'slideDecks' : null);
  const decks = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(decks) || decks.length === 0) {
    return { data, arrayKey, patchedNotes: 0, patchedSlideTotals: 0 };
  }

  let patchedNotes = 0;
  let patchedSlideTotals = 0;
  const nextDecks = decks.map((deck) => {
    const slideKey = Array.isArray(deck?.slides) ? 'slides' : Array.isArray(deck?.sl) ? 'sl' : null;
    if (!slideKey) return deck;
    let deckChanged = false;
    const slides = deck[slideKey].map((slide, index) => {
      const notes = String(slide?.notes || slide?.speakerNotes || slide?.no || '').trim();
      if (notes.length >= 40) return slide;
      patchedNotes++;
      deckChanged = true;
      const noteKey =
        slide?.notes !== undefined
          ? 'notes'
          : slide?.speakerNotes !== undefined
            ? 'speakerNotes'
            : slide?.no !== undefined
              ? 'no'
              : 'notes';
      return { ...slide, [noteKey]: buildFallbackSlideNotes(deck, slide, index) };
    });
    const totalKey =
      deck?.totalSlides !== undefined
        ? 'totalSlides'
        : deck?.ts !== undefined || slideKey === 'sl'
          ? 'ts'
          : 'totalSlides';
    const nextDeck = deckChanged ? { ...deck, [slideKey]: slides } : { ...deck };
    if (nextDeck[totalKey] !== slides.length) {
      patchedSlideTotals++;
      nextDeck[totalKey] = slides.length;
      deckChanged = true;
    }
    return deckChanged ? nextDeck : deck;
  });

  return {
    data: patchedNotes > 0 || patchedSlideTotals > 0 ? { ...data, [arrayKey]: nextDecks } : data,
    arrayKey,
    patchedNotes,
    patchedSlideTotals,
  };
}

function isDuePlaceholder(value) {
  return /\b(to be confirmed|tbd|to be announced|date to be confirmed|due date)\b/i.test(String(value || ''));
}

function cleanDuePlaceholder(value) {
  return String(value || '').replace(
    /\b(?:due date\s*)?(?:to be confirmed|tbd|to be announced|date to be confirmed)\b/gi,
    'set by the instructor in the local LMS',
  );
}

function buildSlideAltText(deck, slide) {
  const title = slide?.title || slide?.t || 'this slide';
  const kind = slide?.visual?.kind || slide?.visual?.k || slide?.vi?.k || 'visual';
  const description = slide?.visual?.description || slide?.visual?.d || slide?.vi?.d || '';
  if (description) return `${description} This visual supports the slide titled "${title}".`;
  return `Text-only ${kind} slide for "${title}"; all instructional content is available in the slide title, bullets, and speaker notes.`;
}

function getDeckAnchor(deck, slides = []) {
  const lessonTitle = String(deck?.lessonTitle || deck?.lt || deck?.title || deck?.t || '').trim();
  const firstSlideTitle = String(slides?.[0]?.title || slides?.[0]?.t || '').trim();
  return lessonTitle || firstSlideTitle || 'this lesson';
}

function buildSlideDeckSequenceGuide(deck, slides = []) {
  const anchor = getDeckAnchor(deck, slides);
  return {
    accessibilityStandards: `For ${anchor}, all instructional content is available as text for screen readers. Visual suggestions for ${anchor} include alt text and should not rely on color alone.`,
    cumulativeAssessmentMap: `Use the ${anchor} objectives, practice slides, and closing prompts as checkpoints before related quizzes, assignments, or exams.`,
  };
}

function needsLessonSpecificSequenceGuide(guide, deck, slides = []) {
  if (!guide || typeof guide !== 'object') return true;
  const anchor = getDeckAnchor(deck, slides).toLowerCase();
  const text = JSON.stringify(guide || {}).toLowerCase();
  if (!text.trim()) return true;
  return anchor !== 'this lesson' && !text.includes(anchor);
}

function repairGenericSlideNotes(note, deck, slide, index) {
  const raw = String(note || '');
  if (!raw) return raw;
  const lessonTitle = deck?.lessonTitle || deck?.lt || 'this lesson';
  const slideTitle = slide?.title || slide?.t || `slide ${index + 1}`;
  return raw
    .replace(
      /A likely student question is how this point applies in practice; answer with a brief example from the lesson context\./g,
      `For "${slideTitle}", a likely student question asks how the idea works in ${lessonTitle}; answer with a brief lesson-specific example.`,
    )
    .replace(
      /TRANSITION:\s*Link this idea to the next slide by naming the next concept or activity students will use\./g,
      `TRANSITION: From "${slideTitle}", name the next concept or activity students will use in ${lessonTitle}.`,
    );
}

export function normalizeSlideDeckAccessibility(data) {
  const arrayKey = getArrayKey('slideDecks', data) || (data?.decks ? 'decks' : data?.slideDecks ? 'slideDecks' : null);
  const decks = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(decks) || decks.length === 0) {
    return {
      data,
      arrayKey,
      patchedAltText: 0,
      patchedDuePlaceholders: 0,
      addedSequenceGuides: 0,
      patchedSequenceGuides: 0,
      addedActivityPrompts: 0,
      patchedBoilerplateNotes: 0,
    };
  }

  let patchedAltText = 0;
  let patchedDuePlaceholders = 0;
  let addedSequenceGuides = 0;
  let patchedSequenceGuides = 0;
  let addedActivityPrompts = 0;
  let patchedBoilerplateNotes = 0;
  const nextDecks = decks.map((deck) => {
    const slideKey = Array.isArray(deck?.slides) ? 'slides' : Array.isArray(deck?.sl) ? 'sl' : null;
    if (!slideKey) return deck;

    let deckChanged = false;
    const slides = deck[slideKey].map((slide, index) => {
      let nextSlide = slide;
      const visualKey = slide?.visual !== undefined ? 'visual' : slide?.vi !== undefined ? 'vi' : null;
      if (visualKey && slide[visualKey] && typeof slide[visualKey] === 'object') {
        const visual = slide[visualKey];
        const altKey = visual.altText !== undefined ? 'altText' : visual.at !== undefined ? 'at' : 'altText';
        if (!String(visual[altKey] || '').trim()) {
          patchedAltText++;
          deckChanged = true;
          nextSlide = {
            ...nextSlide,
            [visualKey]: {
              ...visual,
              [altKey]: buildSlideAltText(deck, slide),
            },
          };
        }
      }

      const noteKey =
        nextSlide?.notes !== undefined
          ? 'notes'
          : nextSlide?.speakerNotes !== undefined
            ? 'speakerNotes'
            : nextSlide?.no !== undefined
              ? 'no'
              : null;
      if (noteKey) {
        const repairedNotes = repairGenericSlideNotes(nextSlide[noteKey], deck, nextSlide, index);
        if (repairedNotes !== nextSlide[noteKey]) {
          nextSlide = { ...nextSlide, [noteKey]: repairedNotes };
          patchedBoilerplateNotes++;
          deckChanged = true;
        }
      }

      const fields = ['title', 't', 'notes', 'speakerNotes', 'no'];
      for (const field of fields) {
        if (nextSlide[field] !== undefined && isDuePlaceholder(nextSlide[field])) {
          nextSlide = { ...nextSlide, [field]: cleanDuePlaceholder(nextSlide[field]) };
          patchedDuePlaceholders++;
          deckChanged = true;
        }
      }

      const bulletKey = Array.isArray(nextSlide?.bullets) ? 'bullets' : Array.isArray(nextSlide?.bu) ? 'bu' : null;
      if (bulletKey) {
        let bulletChanged = false;
        const bullets = nextSlide[bulletKey].map((bullet) => {
          if (!isDuePlaceholder(bullet)) return bullet;
          bulletChanged = true;
          patchedDuePlaceholders++;
          return cleanDuePlaceholder(bullet);
        });
        if (bulletChanged) {
          nextSlide = { ...nextSlide, [bulletKey]: bullets };
          deckChanged = true;
        }
      }

      return nextSlide;
    });

    const hasActivityCue = slides.some((slide) =>
      /\b(activity|discussion|practice|check for understanding|concept check|debrief|reflection|poll|case|scenario)\b/i.test(
        JSON.stringify(slide || {}),
      ),
    );
    if (!hasActivityCue && slides.length > 0) {
      const lastIndex = slides.length - 1;
      const lastSlide = slides[lastIndex];
      const bulletKey = Array.isArray(lastSlide?.bullets) ? 'bullets' : Array.isArray(lastSlide?.bu) ? 'bu' : 'bullets';
      const bullets = Array.isArray(lastSlide?.[bulletKey]) ? lastSlide[bulletKey] : [];
      slides[lastIndex] = {
        ...lastSlide,
        [bulletKey]: [
          ...bullets,
          `Concept check activity for ${getDeckAnchor(deck, slides)}: students apply the main idea to a brief example, then debrief the evidence used.`,
        ],
      };
      addedActivityPrompts++;
      deckChanged = true;
    }

    const guideKey = deck.slideDeckSequenceGuide !== undefined ? 'slideDeckSequenceGuide' : 'slideDeckSequenceGuide';
    const needsGuide = !deck[guideKey] || typeof deck[guideKey] !== 'object';
    const needsSpecificGuide = !needsGuide && needsLessonSpecificSequenceGuide(deck[guideKey], deck, slides);
    if (needsGuide) {
      addedSequenceGuides++;
      deckChanged = true;
    } else if (needsSpecificGuide) {
      patchedSequenceGuides++;
      deckChanged = true;
    }

    return deckChanged
      ? {
          ...deck,
          [slideKey]: slides,
          ...(needsGuide || needsSpecificGuide ? { [guideKey]: buildSlideDeckSequenceGuide(deck, slides) } : {}),
        }
      : deck;
  });

  return {
    data:
      patchedAltText > 0 ||
      patchedDuePlaceholders > 0 ||
      addedSequenceGuides > 0 ||
      patchedSequenceGuides > 0 ||
      addedActivityPrompts > 0 ||
      patchedBoilerplateNotes > 0
        ? { ...data, [arrayKey]: nextDecks }
        : data,
    arrayKey,
    patchedAltText,
    patchedDuePlaceholders,
    addedSequenceGuides,
    patchedSequenceGuides,
    addedActivityPrompts,
    patchedBoilerplateNotes,
  };
}

export function normalizeStudyGuideQuestions(data) {
  const arrayKey =
    getArrayKey('studyGuides', data) || (data?.guides ? 'guides' : data?.studyGuides ? 'studyGuides' : null);
  const guides = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(guides) || guides.length === 0) {
    return {
      data,
      arrayKey,
      splitCombinedQuestions: 0,
      deduplicatedQuestions: 0,
      addedReviewQuestions: 0,
      addedKeyTerms: 0,
      addedRetrievalPrompts: 0,
    };
  }

  let splitCombinedQuestions = 0;
  let deduplicatedQuestions = 0;
  let addedReviewQuestions = 0;
  let addedKeyTerms = 0;
  let addedRetrievalPrompts = 0;
  const nextGuides = guides.map((guide) => {
    const questionKey = Array.isArray(guide?.reviewQuestions)
      ? 'reviewQuestions'
      : Array.isArray(guide?.rq)
        ? 'rq'
        : guide?.rq !== undefined || guide?.lt !== undefined
          ? 'rq'
          : 'reviewQuestions';
    let changed = false;
    let questions = [];

    const sourceQuestions = Array.isArray(guide?.[questionKey]) ? guide[questionKey] : [];
    sourceQuestions.forEach((question) => {
      if (!question || typeof question !== 'object' || Array.isArray(question)) {
        questions.push(question);
        return;
      }

      const secondQuestion = question.q2 || question.question2;
      if (!secondQuestion) {
        questions.push(question);
        return;
      }

      const first = { ...question };
      delete first.q2;
      delete first.question2;
      delete first.bl2;
      delete first.bloomsLevel2;
      delete first.ht2;
      delete first.hint2;

      const usesCompact = question.q !== undefined || question.bl !== undefined || question.ht !== undefined;
      const second = usesCompact
        ? {
            q: secondQuestion,
            bl: question.bl2 || question.bloomsLevel2 || question.bl || question.bloomsLevel || 'Apply',
            ht:
              question.ht2 ||
              question.hint2 ||
              question.ht ||
              question.hint ||
              'Identify the concept, then explain how the evidence supports it.',
          }
        : {
            question: secondQuestion,
            bloomsLevel: question.bl2 || question.bloomsLevel2 || question.bloomsLevel || 'Apply',
            hint:
              question.ht2 ||
              question.hint2 ||
              question.hint ||
              'Identify the concept, then explain how the evidence supports it.',
          };

      questions.push(first, second);
      splitCombinedQuestions++;
      changed = true;
    });

    const seen = new Map();
    questions = questions.map((question, questionIndex) => {
      if (!question || typeof question !== 'object' || Array.isArray(question)) return question;
      const key = question.q !== undefined ? 'q' : question.question !== undefined ? 'question' : null;
      if (!key) return question;
      const normalized = normalizeQuestionText(question[key]);
      if (!normalized) return question;
      const previousCount = seen.get(normalized) || 0;
      seen.set(normalized, previousCount + 1);
      if (previousCount === 0) return question;

      const usesCompact = question.q !== undefined || question.bl !== undefined || question.ht !== undefined;
      deduplicatedQuestions++;
      changed = true;
      return {
        ...question,
        ...(usesCompact
          ? {
              q: buildReplacementReviewQuestion(guide, questionIndex),
              bl: question.bl || 'Analyze',
              ht:
                question.ht ||
                'Name the method decision first, then explain the evidence or assumption that supports it.',
            }
          : {
              question: buildReplacementReviewQuestion(guide, questionIndex),
              bloomsLevel: question.bloomsLevel || 'Analyze',
              hint:
                question.hint ||
                'Name the method decision first, then explain the evidence or assumption that supports it.',
            }),
      };
    });

    while (questions.length < 3) {
      const usesCompact = questionKey === 'rq';
      const questionIndex = questions.length;
      questions.push(
        usesCompact
          ? {
              q: buildReplacementReviewQuestion(guide, questionIndex),
              bl: questionIndex === 0 ? 'Apply' : 'Analyze',
              ht: 'Answer from memory first, then check the guide and revise with one piece of evidence.',
            }
          : {
              question: buildReplacementReviewQuestion(guide, questionIndex),
              bloomsLevel: questionIndex === 0 ? 'Apply' : 'Analyze',
              hint: 'Answer from memory first, then check the guide and revise with one piece of evidence.',
            },
      );
      addedReviewQuestions++;
      changed = true;
    }

    let nextGuide = changed ? { ...guide, [questionKey]: questions } : guide;
    const termKey = Array.isArray(nextGuide?.keyTerms)
      ? 'keyTerms'
      : Array.isArray(nextGuide?.kt)
        ? 'kt'
        : questionKey === 'rq'
          ? 'kt'
          : 'keyTerms';
    const existingTerms = Array.isArray(nextGuide?.[termKey]) ? nextGuide[termKey] : [];
    if (existingTerms.length < 3) {
      const titleWords = String(nextGuide?.lessonTitle || nextGuide?.lt || 'lesson evidence transfer')
        .replace(/^Lesson\s+\d+:\s*/i, '')
        .replace(/[^A-Za-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length >= 4)
        .slice(0, 4);
      const nextTerms = [...new Set([...existingTerms, ...titleWords, 'evidence', 'application', 'transfer'])].slice(
        0,
        6,
      );
      addedKeyTerms += Math.max(0, nextTerms.length - existingTerms.length);
      nextGuide = { ...nextGuide, [termKey]: nextTerms };
    }

    const retrievalText = JSON.stringify(nextGuide || {});
    if (
      !/\b(review question|self-check|practice question|key term|retrieval|concept check|study strategy)\b/i.test(
        retrievalText,
      )
    ) {
      const retrievalKey = questionKey === 'rq' ? 'rp' : 'retrievalPractice';
      nextGuide = {
        ...nextGuide,
        [retrievalKey]:
          'Retrieval practice: close the guide, answer the self-check questions from memory, then reopen the guide and correct your answer with one specific piece of lesson evidence.',
      };
      addedRetrievalPrompts++;
    }

    return nextGuide !== guide ? nextGuide : guide;
  });

  return {
    data:
      splitCombinedQuestions > 0 ||
      deduplicatedQuestions > 0 ||
      addedReviewQuestions > 0 ||
      addedKeyTerms > 0 ||
      addedRetrievalPrompts > 0
        ? { ...data, [arrayKey]: nextGuides }
        : data,
    arrayKey,
    splitCombinedQuestions,
    deduplicatedQuestions,
    addedReviewQuestions,
    addedKeyTerms,
    addedRetrievalPrompts,
  };
}

function normalizeQuestionText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildReplacementReviewQuestion(guide, questionIndex) {
  const title = String(guide?.lessonTitle || guide?.lt || 'this lesson')
    .replace(/^Lesson\s+\d+:\s*/i, '')
    .trim();
  const focus = title || 'the lesson concept';
  const prompts = [
    `Apply ${focus} to a new course case: what decision would you make, and what evidence would justify it?`,
    `Compare two possible choices in ${focus}; which is stronger, and what limitation would you name?`,
    `Use ${focus} to diagnose a likely student error, then write one correction strategy.`,
  ];
  return prompts[questionIndex % prompts.length];
}

function looksLikeResourceFragment(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (/[.!?]\s*$/.test(text) && text.split(/\s+/).length >= 18) return false;
  return text.length < 120 && text.split(',').length >= 2 && !/\b(use|bring|ask|review|practice|support)\b/i.test(text);
}

function buildStudyGuideSupport(guide) {
  const title = String(guide?.lessonTitle || guide?.lt || 'this lesson')
    .replace(/^Lesson\s+\d+:\s*/i, '')
    .trim();
  const resources = String(guide?.studyResources || guide?.sr || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);
  const resourceText =
    resources.length > 0
      ? resources.join(', ')
      : 'the course site examples, lesson checklist, and instructor-provided practice materials';
  return `Use ${resourceText} as your first supports while reviewing ${title || 'this lesson'}. Bring one draft answer, note, or question to office hours or a study group so you can test your reasoning against course criteria. If you need an alternate format, convert the guide to text-to-speech or a screen-reader-friendly document and use the checklist to review one step at a time.`;
}

export function normalizeStudyGuideSupport(data) {
  const arrayKey =
    getArrayKey('studyGuides', data) || (data?.guides ? 'guides' : data?.studyGuides ? 'studyGuides' : null);
  const guides = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(guides) || guides.length === 0) {
    return { data, arrayKey, patchedSupportGuidance: 0 };
  }

  let patchedSupportGuidance = 0;
  const nextGuides = guides.map((guide) => {
    if (!guide || typeof guide !== 'object' || Array.isArray(guide)) return guide;
    const supportKey = guide.studyResources !== undefined ? 'studyResources' : guide.sr !== undefined ? 'sr' : null;
    if (!supportKey || !looksLikeResourceFragment(guide[supportKey])) return guide;
    patchedSupportGuidance++;
    return { ...guide, [supportKey]: buildStudyGuideSupport(guide) };
  });

  return {
    data: patchedSupportGuidance > 0 ? { ...data, [arrayKey]: nextGuides } : data,
    arrayKey,
    patchedSupportGuidance,
  };
}

function looksLikeEquityList(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  const joined = value.join(' ').toLowerCase();
  const equityHits = (
    joined.match(/\b(equity|equitable|diverse|support|invite|quieter|perspectives|identity|access|participation)\b/g) ||
    []
  ).length;
  const criteriaHits = (
    joined.match(/\b(criteria|evidence|reasoning|peer|respond|specific|course concept|method|analysis|claim)\b/g) || []
  ).length;
  return equityHits >= 2 && criteriaHits <= 2;
}

function looksLikeTagList(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  const shortItems = value.filter(
    (item) =>
      String(item || '')
        .trim()
        .split(/\s+/).length <= 4,
  ).length;
  const sentenceItems = value.filter((item) => /[.!?]\s*$/.test(String(item || '').trim())).length;
  return shortItems >= Math.max(3, Math.ceil(value.length * 0.75)) && sentenceItems === 0;
}

function buildDiscussionCriteria(discussion) {
  const prompt = String(discussion?.prompt || discussion?.pr || 'the discussion prompt').trim();
  return [
    `Uses specific evidence from the lesson case, reading, or activity to answer: ${prompt}`,
    'Explains the methodological reasoning behind the claim instead of only stating an opinion.',
    'Responds to at least one peer by extending, questioning, or refining the evidence used.',
    'Names one limitation, ethical concern, alternative interpretation, or next revision step.',
  ];
}

function buildDiscussionGuidelines(discussion) {
  const format = String(discussion?.format || discussion?.fm || 'discussion').trim();
  const duration = String(discussion?.estimatedDuration || discussion?.ed || '20-25 min').trim();
  return `Use this as a ${format} lasting about ${duration}. Prepare one evidence-based initial response before speaking or posting, cite at least one course concept or scenario detail, and make one substantive peer response that extends the analysis rather than simply agreeing. Keep examples de-identified and respectful, and connect your final comment to one method decision or revision you would make.`;
}

function mergeEquityGuidance(existing, movedCriteria) {
  const base = String(existing || '').trim();
  const moved = Array.isArray(movedCriteria) ? movedCriteria.join(' ') : '';
  const combined = [base, moved].filter(Boolean).join(' ');
  return (
    combined ||
    'Begin with two minutes of written think time, invite multiple participation modes, and provide sentence frames so students can enter the discussion with evidence.'
  );
}

function isGenericDiscussionArtifactTitle(value) {
  const title = String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!title) return true;
  return /^(?:week\s*\d+\s*)?(?:artifact|source|document|item|evidence|packet)\s*(?:[A-Z]|\d+)?$/i.test(title);
}

function getDiscussionArtifactKey(discussion) {
  if (Array.isArray(discussion?.sourceArtifacts)) return 'sourceArtifacts';
  if (Array.isArray(discussion?.artifacts)) return 'artifacts';
  if (Array.isArray(discussion?.af)) return 'af';
  return null;
}

function getDiscussionArtifactField(artifact, fullKey, compactKey, aliases = []) {
  for (const key of [fullKey, compactKey, ...aliases]) {
    const value = artifact?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function cleanDiscussionArtifactLocator(value) {
  return compactText(value, '', 180)
    .replace(/^(?:week\s*\d+\s*)?(?:artifact|source|document|item|evidence|packet)\s*(?:[A-Z]|\d+)?\s*[:.-]?\s*/i, '')
    .trim();
}

function inferDiscussionArtifactTitle(discussion, artifact, artifactIndex) {
  const raw =
    typeof artifact === 'string'
      ? artifact
      : [
          artifact?.title,
          artifact?.at,
          artifact?.name,
          artifact?.label,
          artifact?.locator,
          artifact?.lo,
          artifact?.use,
          artifact?.ut,
        ]
          .filter(Boolean)
          .join(' ');
  const artifactHaystack = raw.toLowerCase();
  const haystack = [
    raw,
    discussion?.lessonTitle,
    discussion?.lt,
    discussion?.context,
    discussion?.cx,
    discussion?.prompt,
    discussion?.pr,
    discussion?.evidenceRequirement,
    discussion?.er,
  ]
    .join(' ')
    .toLowerCase();

  const rules = [
    [/recruit|flyer/, 'Recruitment Flyer Excerpt'],
    [/sampling|sample[-\s]frame/, 'Sampling Plan Excerpt'],
    [/attendance|trend|time series|table/, 'Attendance Trend Table'],
    [/interview|transcript/, 'Interview Excerpt Set'],
    [/consent/, 'Consent Paragraph Excerpt'],
    [/finding|report excerpt|results excerpt/, 'Findings Report Excerpt'],
    [/survey|instrument|questionnaire/, 'Survey Instrument Excerpt'],
    [/codebook|coding|theme table/, 'Codebook Excerpt'],
    [/policy|brief|memo/, 'Policy Brief Excerpt'],
    [/case|scenario|vignette/, 'Case Scenario Excerpt'],
    [/rubric|criteria|scoring/, 'Scoring Criteria Excerpt'],
    [/dataset|variable|spreadsheet|csv/, 'Dataset Excerpt'],
  ];

  const match =
    rules.find(([pattern]) => pattern.test(artifactHaystack)) || rules.find(([pattern]) => pattern.test(haystack));
  if (match) return match[1];

  const lessonTitle = stripLessonPrefix(discussion?.lessonTitle || discussion?.lt || '').trim();
  const base = lessonTitle || 'Lesson Evidence';
  return `${base} Evidence Packet ${artifactIndex + 1}`;
}

function normalizeDiscussionArtifactsForItem(discussion) {
  const artifactKey = getDiscussionArtifactKey(discussion);
  const artifacts = artifactKey ? discussion?.[artifactKey] : null;
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return { discussion, patchedArtifacts: 0 };
  }

  let patchedArtifacts = artifactKey === 'sourceArtifacts' ? 0 : 1;
  const nextArtifacts = artifacts.map((artifact, artifactIndex) => {
    const source = artifact && typeof artifact === 'object' && !Array.isArray(artifact) ? artifact : {};
    const currentTitle =
      typeof artifact === 'string' ? '' : getDiscussionArtifactField(source, 'title', 'at', ['name', 'label', 't']);
    const nextTitle = isGenericDiscussionArtifactTitle(currentTitle)
      ? inferDiscussionArtifactTitle(discussion, artifact, artifactIndex)
      : currentTitle;
    const locator =
      typeof artifact === 'string'
        ? cleanDiscussionArtifactLocator(artifact)
        : cleanDiscussionArtifactLocator(
            getDiscussionArtifactField(source, 'locator', 'lo', ['section', 'excerpt', 'range', 'source']),
          );
    const use = getDiscussionArtifactField(source, 'use', 'ut', ['purpose', 'instruction']);
    const nextArtifact = {
      title: nextTitle,
      locator:
        locator ||
        compactText(
          discussion?.evidenceRequirement || discussion?.er,
          `Evidence named in the ${nextTitle} discussion prompt.`,
          180,
        ),
      use: use || `Use this source to ground one claim in the main prompt and to answer at least one follow-up probe.`,
    };

    if (
      artifactKey !== 'sourceArtifacts' ||
      currentTitle !== nextArtifact.title ||
      source.locator !== nextArtifact.locator ||
      source.use !== nextArtifact.use
    ) {
      patchedArtifacts++;
    }
    return nextArtifact;
  });

  if (patchedArtifacts === 0) return { discussion, patchedArtifacts: 0 };
  const nextDiscussion = { ...discussion, sourceArtifacts: nextArtifacts };
  if (artifactKey !== 'sourceArtifacts') delete nextDiscussion[artifactKey];
  return { discussion: nextDiscussion, patchedArtifacts };
}

export function normalizeDiscussionPromptFields(data) {
  const arrayKey =
    getArrayKey('discussions', data) ||
    (data?.discussions ? 'discussions' : data?.discussionPrompts ? 'discussionPrompts' : null);
  const discussions = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(discussions) || discussions.length === 0) {
    return {
      data,
      arrayKey,
      patchedCriteria: 0,
      patchedGuidelines: 0,
      patchedEquity: 0,
      patchedLanguageArtifacts: 0,
      patchedArtifacts: 0,
    };
  }

  let patchedCriteria = 0;
  let patchedGuidelines = 0;
  let patchedEquity = 0;
  let patchedLanguageArtifacts = 0;
  let patchedArtifacts = 0;
  const nextDiscussions = discussions.map((discussion) => {
    if (!discussion || typeof discussion !== 'object' || Array.isArray(discussion)) return discussion;
    const nextDiscussion = { ...discussion };
    let changed = false;

    const criteriaKey =
      nextDiscussion.evaluationCriteria !== undefined
        ? 'evaluationCriteria'
        : nextDiscussion.ec !== undefined
          ? 'ec'
          : null;
    const equityKey =
      nextDiscussion.equityConsiderations !== undefined
        ? 'equityConsiderations'
        : nextDiscussion.eq !== undefined
          ? 'eq'
          : null;
    const guidelinesKey =
      nextDiscussion.guidelines !== undefined ? 'guidelines' : nextDiscussion.gl !== undefined ? 'gl' : null;

    if (criteriaKey && looksLikeEquityList(nextDiscussion[criteriaKey])) {
      if (equityKey) {
        nextDiscussion[equityKey] = mergeEquityGuidance(nextDiscussion[equityKey], nextDiscussion[criteriaKey]);
        patchedEquity++;
      }
      nextDiscussion[criteriaKey] = buildDiscussionCriteria(nextDiscussion);
      patchedCriteria++;
      changed = true;
    }

    if (
      guidelinesKey &&
      (looksLikeTagList(nextDiscussion[guidelinesKey]) || Array.isArray(nextDiscussion[guidelinesKey]))
    ) {
      nextDiscussion[guidelinesKey] = buildDiscussionGuidelines(nextDiscussion);
      patchedGuidelines++;
      changed = true;
    }

    const artifactResult = normalizeDiscussionArtifactsForItem(nextDiscussion);
    if (artifactResult.patchedArtifacts > 0) {
      patchedArtifacts += artifactResult.patchedArtifacts;
      changed = true;
    }

    const cleaned = cleanDiscussionLanguageArtifacts(artifactResult.discussion);
    if (cleaned.patched > 0) {
      patchedLanguageArtifacts += cleaned.patched;
      changed = true;
      return cleaned.value;
    }

    return changed ? artifactResult.discussion : discussion;
  });

  return {
    data:
      patchedCriteria > 0 ||
      patchedGuidelines > 0 ||
      patchedEquity > 0 ||
      patchedLanguageArtifacts > 0 ||
      patchedArtifacts > 0
        ? { ...data, [arrayKey]: nextDiscussions }
        : data,
    arrayKey,
    patchedCriteria,
    patchedGuidelines,
    patchedEquity,
    patchedLanguageArtifacts,
    patchedArtifacts,
  };
}

function cleanDiscussionLanguageArtifacts(value) {
  if (typeof value === 'string') {
    const cleaned = value
      .replace(/\bmore\s+निर्णितive\b/gi, 'more decisive')
      .replace(/\bनिर्णितive\b/gi, 'decisive')
      .replace(/\uFFFD/g, '');
    return { value: cleaned, patched: cleaned === value ? 0 : 1 };
  }
  if (Array.isArray(value)) {
    let patched = 0;
    const next = value.map((item) => {
      const result = cleanDiscussionLanguageArtifacts(item);
      patched += result.patched;
      return result.value;
    });
    return { value: patched > 0 ? next : value, patched };
  }
  if (value && typeof value === 'object') {
    let patched = 0;
    const next = {};
    for (const [key, item] of Object.entries(value)) {
      const result = cleanDiscussionLanguageArtifacts(item);
      patched += result.patched;
      next[key] = result.value;
    }
    return { value: patched > 0 ? next : value, patched };
  }
  return { value, patched: 0 };
}

function looksLikeLessonClosureFragment(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (/^short lecture,\s*guided lab,\s*structured peer review,\s*and applied case discussion\.?$/i.test(text)) {
    return true;
  }
  return text.length < 90 && text.split(',').length >= 2 && !/\b(close|end|preview|remind|ask|connect)\b/i.test(text);
}

function buildLessonClosure(plan, index, plans) {
  const title = String(plan?.lessonTitle || plan?.lt || `Lesson ${index + 1}`)
    .replace(/^Lesson\s+\d+:\s*/i, '')
    .trim();
  const nextTitle = plans?.[index + 1]?.lessonTitle || plans?.[index + 1]?.lt || '';
  const nextCue = nextTitle
    ? ` Preview that the next lesson moves into ${String(nextTitle)
        .replace(/^Lesson\s+\d+:\s*/i, '')
        .trim()}.`
    : ' Preview how this work carries into the final course evidence package.';
  return `Close by asking students to name one ${title || 'lesson'} method decision they can defend with evidence and one point that still needs peer or instructor feedback.${nextCue} Remind students to use the homework artifact as evidence of progress, not just as a completion task.`;
}

function isToolTag(value) {
  return /\b(course site|shared document|spreadsheet|library database|statistical software|template|handout|slide|video|software)\b/i.test(
    String(value || ''),
  );
}

function buildLessonTags(plan) {
  const source = [
    plan?.lessonTitle || plan?.lt,
    ...(Array.isArray(plan?.objectives) ? plan.objectives : []),
    ...(Array.isArray(plan?.ob) ? plan.ob : []),
    ...(Array.isArray(plan?.outline) ? plan.outline.map((item) => item?.activity || item?.ac) : []),
    ...(Array.isArray(plan?.ol) ? plan.ol.map((item) => item?.activity || item?.ac) : []),
  ]
    .filter(Boolean)
    .join(' ');
  const tokens = tokenize(source);
  return [...tokens].slice(0, 8);
}

const LESSON_PLAN_QUALITY_CUE_RE =
  /\b(success criteria|criteria|checklist|exemplar|model answer|sample answer|evidence|rubric|strong work|quality|feedback|revision|misconception|transfer|exit ticket)\b/i;

function firstText(values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const item = value.find((entry) => String(entry || '').trim());
      if (item) return String(item).trim();
    } else if (String(value || '').trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function lessonPlanTitle(plan, index) {
  return String(plan?.lessonTitle || plan?.lt || plan?.title || `Lesson ${index + 1}`)
    .replace(/^Lesson\s+\d+:\s*/i, '')
    .trim();
}

function buildLessonPlanSupportText(plan, index) {
  const title = lessonPlanTitle(plan, index) || `Lesson ${index + 1}`;
  const objective = firstText([plan?.objectives, plan?.ob, plan?.learningObjectives, plan?.lo]);
  const objectiveCue = objective ? ` tied to "${objective}"` : '';
  return `Success criteria for ${title}: students use accurate course vocabulary, cite lesson evidence, and explain reasoning with one concrete example${objectiveCue}. Model-work guidance for ${title}: show a brief exemplar, name what makes it strong work, then have students revise one response using feedback.`;
}

function buildReadyToTeachSupport(plan, index) {
  const title = lessonPlanTitle(plan, index) || `Lesson ${index + 1}`;
  return {
    workedExample: `Use a short exemplar for ${title} and ask students to mark the evidence, reasoning, and revision move that make it strong work.`,
    methodSpecificMiniRubric: `Mini-rubric for ${title}: accurate concept use, relevant evidence, clear reasoning, and one actionable revision step.`,
    instructorPrep: `Prepare one model answer, one common misconception, and one feedback prompt for ${title} before class.`,
  };
}

export function normalizeLessonPlanTeachingSupport(data) {
  const arrayKey =
    getArrayKey('lessonPlans', data) || (data?.plans ? 'plans' : data?.lessonPlans ? 'lessonPlans' : null);
  const plans = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(plans) || plans.length === 0) {
    return { data, arrayKey, patchedTeachingSupport: 0 };
  }

  let patchedTeachingSupport = 0;
  const nextPlans = plans.map((plan, index) => {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return plan;
    if (LESSON_PLAN_QUALITY_CUE_RE.test(JSON.stringify(plan))) return plan;

    const compact = plan?.lt !== undefined || plan?.fc !== undefined || plan?.rts !== undefined;
    const formativeKey =
      plan?.formativeCheck !== undefined
        ? 'formativeCheck'
        : plan?.fc !== undefined || compact
          ? 'fc'
          : 'formativeCheck';
    const supportKey =
      plan?.readyToTeachSupport !== undefined
        ? 'readyToTeachSupport'
        : plan?.rts !== undefined || compact
          ? 'rts'
          : 'readyToTeachSupport';
    const existingFormative =
      plan?.[formativeKey] && typeof plan[formativeKey] === 'object' && !Array.isArray(plan[formativeKey])
        ? plan[formativeKey]
        : {};
    const typeKey = compact ? 'ty' : 'type';
    const promptKey = compact ? 'pr' : 'prompt';
    const alignedKey = compact ? 'oa' : 'objectiveAligned';
    const actionKey = compact ? 'ia' : 'instructorAction';
    const support = buildLessonPlanSupportText(plan, index);

    patchedTeachingSupport++;
    return {
      ...plan,
      [formativeKey]: {
        ...existingFormative,
        [typeKey]: existingFormative[typeKey] || 'Exit ticket',
        [promptKey]:
          existingFormative[promptKey] ||
          `What evidence from ${lessonPlanTitle(plan, index) || 'today'} best supports your answer?`,
        [alignedKey]: existingFormative[alignedKey] || firstText([plan?.objectives, plan?.ob]) || 'Lesson objective',
        [actionKey]: existingFormative[actionKey] ? `${existingFormative[actionKey]} ${support}` : support,
      },
      [supportKey]: {
        ...(plan?.[supportKey] && typeof plan[supportKey] === 'object' ? plan[supportKey] : {}),
        ...buildReadyToTeachSupport(plan, index),
      },
    };
  });

  return {
    data: patchedTeachingSupport > 0 ? { ...data, [arrayKey]: nextPlans } : data,
    arrayKey,
    patchedTeachingSupport,
  };
}

export function normalizeLessonPlanPublishability(data) {
  const arrayKey =
    getArrayKey('lessonPlans', data) || (data?.plans ? 'plans' : data?.lessonPlans ? 'lessonPlans' : null);
  const plans = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(plans) || plans.length === 0) {
    return {
      data,
      arrayKey,
      patchedReviewDates: 0,
      patchedOwnerGroups: 0,
      removedPublishingMetadata: 0,
      patchedClosures: 0,
      patchedTags: 0,
    };
  }

  let patchedReviewDates = 0;
  let patchedOwnerGroups = 0;
  let removedPublishingMetadata = 0;
  let patchedClosures = 0;
  let patchedTags = 0;
  const nextPlans = plans.map((plan, index) => {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return plan;
    const nextPlan = { ...plan };
    let changed = false;
    for (const key of ['suggestedReviewDate', 'rd']) {
      if (Object.prototype.hasOwnProperty.call(nextPlan, key)) {
        delete nextPlan[key];
        patchedReviewDates++;
        removedPublishingMetadata++;
        changed = true;
      }
    }
    for (const key of ['contentOwnerGroup', 'cg']) {
      if (Object.prototype.hasOwnProperty.call(nextPlan, key)) {
        delete nextPlan[key];
        patchedOwnerGroups++;
        removedPublishingMetadata++;
        changed = true;
      }
    }

    const closureKey =
      nextPlan.closureAssessment !== undefined ? 'closureAssessment' : nextPlan.ca !== undefined ? 'ca' : null;
    if (closureKey && looksLikeLessonClosureFragment(nextPlan[closureKey])) {
      nextPlan[closureKey] = buildLessonClosure(nextPlan, index, plans);
      patchedClosures++;
      changed = true;
    }

    const tagsKey = Array.isArray(nextPlan.tags) ? 'tags' : Array.isArray(nextPlan.tg) ? 'tg' : null;
    if (tagsKey) {
      const tags = nextPlan[tagsKey].map((tag) => String(tag || '').trim()).filter(Boolean);
      const toolTagCount = tags.filter(isToolTag).length;
      if (tags.length > 0 && toolTagCount >= Math.max(2, Math.ceil(tags.length / 2))) {
        const nextTags = buildLessonTags(nextPlan);
        if (nextTags.length > 0) {
          nextPlan[tagsKey] = nextTags;
          patchedTags++;
          changed = true;
        }
      }
    }

    return changed ? nextPlan : plan;
  });

  return {
    data:
      removedPublishingMetadata > 0 || patchedClosures > 0 || patchedTags > 0
        ? { ...data, [arrayKey]: nextPlans }
        : data,
    arrayKey,
    patchedReviewDates,
    patchedOwnerGroups,
    removedPublishingMetadata,
    patchedClosures,
    patchedTags,
  };
}

function hasPublishabilityMarker(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return findPublishabilityPlaceholders(raw, { limit: 1 }).length > 0 || /\[[^\]]+\]/.test(raw);
}

function cleanSyllabusText(value, fallback = '') {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  const withoutBrackets = raw
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\bTBD\b/gi, '')
    .replace(/\bTODO\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!withoutBrackets || hasPublishabilityMarker(withoutBrackets)) return fallback;
  return withoutBrackets;
}

function patchSyllabusField(syllabus, key, fallback) {
  if (!hasPublishabilityMarker(syllabus[key])) return { syllabus, patched: 0 };
  return { syllabus: { ...syllabus, [key]: cleanSyllabusText(syllabus[key], fallback) }, patched: 1 };
}

function syllabusHasMeaningfulValue(value) {
  if (Array.isArray(value)) return value.some(syllabusHasMeaningfulValue);
  if (value && typeof value === 'object') return Object.values(value).some(syllabusHasMeaningfulValue);
  const raw = String(value || '').trim();
  return raw.length >= 8 && !hasPublishabilityMarker(raw);
}

function lessonTopic(lesson, index) {
  const raw = String(lesson?.title || `Lesson ${index + 1}`).trim();
  return raw.replace(/^lesson\s*\d+\s*:\s*/i, '').trim() || raw || `Lesson ${index + 1}`;
}

function lessonField(lesson, keys) {
  const sections = Array.isArray(lesson?.sections) ? lesson.sections : [];
  for (const section of sections) {
    for (const key of keys) {
      const value = section?.[key];
      if (syllabusHasMeaningfulValue(value)) return Array.isArray(value) ? value.join('; ') : String(value);
    }
  }
  return '';
}

function buildSyllabusDescription(courseMap) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const courseName = String(courseMap?.courseName || 'this course').trim();
  const topics = lessons.slice(0, 4).map(lessonTopic).filter(Boolean);
  const topicText =
    topics.length > 1
      ? `${topics.slice(0, -1).join(', ')}, and ${topics[topics.length - 1]}`
      : topics[0] || 'the major course topics';
  return `${courseName} is organized as a coherent learning sequence through ${topicText}. Students connect weekly concepts to applied tasks, checks for understanding, and course assessments so they can build usable knowledge over the full term. The course map provides the official week-by-week structure, and this syllabus translates that structure into student-facing expectations for preparation, participation, assessment, and support.`;
}

function buildSyllabusWeeklySchedule(courseMap) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  return lessons.map((lesson, index) => {
    const topic = lessonTopic(lesson, index);
    const readings =
      lessonField(lesson, ['supportingResources', 'resources', 'asyncActivities']) || 'Assigned course materials';
    const assignments =
      lessonField(lesson, ['weeklyAssessments', 'assessments', 'assessment']) ||
      'Weekly preparation, participation, and progress checks';
    return {
      week: `Week ${index + 1}`,
      dates: `Week ${index + 1}`,
      topic,
      readings,
      assignments,
    };
  });
}

export function normalizeSyllabusCompleteness(data, courseMap) {
  const wrapperKey = data?.syllabus && typeof data.syllabus === 'object' ? 'syllabus' : null;
  let syllabus = wrapperKey ? data.syllabus : data;

  if (!syllabus || typeof syllabus !== 'object' || Array.isArray(syllabus)) {
    return { data, patchedDescription: false, patchedSchedule: false };
  }

  let patchedDescription = false;
  let patchedSchedule = false;
  let patchedPolicies = false;

  if (!syllabusHasMeaningfulValue(syllabus.courseDescription || syllabus.description)) {
    syllabus = { ...syllabus, courseDescription: buildSyllabusDescription(courseMap) };
    patchedDescription = true;
  }

  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const weeklySchedule = Array.isArray(syllabus.weeklySchedule) ? syllabus.weeklySchedule : null;
  const expectedWeeks = lessons.length || weeklySchedule?.length || 0;
  const hasUsefulSchedule =
    weeklySchedule &&
    weeklySchedule.length >= Math.max(1, expectedWeeks) &&
    weeklySchedule.some((week) => syllabusHasMeaningfulValue(week?.topic || week?.assignments || week?.readings));

  if (!hasUsefulSchedule && lessons.length > 0) {
    syllabus = { ...syllabus, weeklySchedule: buildSyllabusWeeklySchedule(courseMap) };
    patchedSchedule = true;
  }

  if (
    !syllabusHasMeaningfulValue(
      syllabus.courseRequirements || syllabus.gradingPolicy || syllabus.grading || syllabus.assessmentPolicy,
    )
  ) {
    syllabus = {
      ...syllabus,
      courseRequirements: [
        {
          name: 'Aligned course assessments',
          weight: '100%',
          description:
            'Grades are based on the aligned assessments, rubrics, participation expectations, and instructor feedback cycles described in the course materials.',
        },
      ],
    };
    patchedPolicies = true;
  }

  if (!syllabusHasMeaningfulValue(syllabus.coursePolicies || syllabus.policies)) {
    syllabus = {
      ...syllabus,
      coursePolicies:
        'Course policies cover attendance, late work, academic integrity, accessibility accommodations, and responsible AI or technology use. Students should follow the official LMS and institutional policy pages for final details.',
    };
    patchedPolicies = true;
  }

  const normalized = wrapperKey ? { ...data, [wrapperKey]: syllabus } : syllabus;
  return {
    data: patchedDescription || patchedSchedule || patchedPolicies ? normalized : data,
    patchedDescription,
    patchedSchedule,
    patchedPolicies,
  };
}

export function normalizeSyllabusPublishability(data) {
  const wrapperKey = data?.syllabus && typeof data.syllabus === 'object' ? 'syllabus' : null;
  let syllabus = wrapperKey ? data.syllabus : data;

  if (!syllabus || typeof syllabus !== 'object' || Array.isArray(syllabus)) {
    return { data, patchedFields: 0 };
  }

  let patchedFields = 0;
  const patch = (key, fallback) => {
    const result = patchSyllabusField(syllabus, key, fallback);
    syllabus = result.syllabus;
    patchedFields += result.patched;
  };

  patch('semester', '12-week term');
  patch('credits', '3 credits');
  patch('meetingPattern', 'Weekly course meeting pattern listed in the official course schedule.');
  patch('location', 'Official course site and assigned class meeting space.');
  patch('prerequisites', 'No formal prerequisites listed; students should review program requirements.');
  patch('instructor', 'Course instructor');
  patch('instructorEmail', 'Use the contact method listed in the course site.');
  patch('officeHours', 'Office hours are available through the course communication channel.');
  patch('officeLocation', 'Office hours location or meeting link is available in the course site.');
  if (Object.prototype.hasOwnProperty.call(syllabus, 'suggestedReviewDate')) {
    const { suggestedReviewDate, ...rest } = syllabus;
    void suggestedReviewDate;
    syllabus = rest;
    patchedFields++;
  }
  if (Object.prototype.hasOwnProperty.call(syllabus, 'contentOwnerGroup')) {
    const { contentOwnerGroup, ...rest } = syllabus;
    void contentOwnerGroup;
    syllabus = rest;
    patchedFields++;
  }

  if (Array.isArray(syllabus.requiredTexts)) {
    let changed = false;
    const requiredTexts = syllabus.requiredTexts.map((text) => {
      if (!text || typeof text !== 'object') return text;
      let next = text;
      if (hasPublishabilityMarker(text.isbn)) {
        next = { ...next, isbn: '' };
        changed = true;
      }
      if (hasPublishabilityMarker(text.note) || /suggested\s*-\s*verify/i.test(String(text.note || ''))) {
        next = {
          ...next,
          note: 'Suggested alternative text for instructor adoption.',
        };
        changed = true;
      }
      return next;
    });
    if (changed) {
      syllabus = { ...syllabus, requiredTexts };
      patchedFields++;
    }
  }

  if (Array.isArray(syllabus.weeklySchedule)) {
    let changed = false;
    const weeklySchedule = syllabus.weeklySchedule.map((week) => {
      if (!week || typeof week !== 'object') return week;
      let next = week;
      if (hasPublishabilityMarker(week.dates)) {
        next = { ...next, dates: String(week.week || '').trim() || 'Course week' };
        changed = true;
      }
      if (hasPublishabilityMarker(week.assignments)) {
        next = { ...next, assignments: cleanSyllabusText(week.assignments, 'Course milestone to be confirmed') };
        changed = true;
      }
      return next;
    });
    if (changed) {
      syllabus = { ...syllabus, weeklySchedule };
      patchedFields++;
    }
  }

  if (Array.isArray(syllabus.importantDates)) {
    let changed = false;
    const importantDates = syllabus.importantDates.map((date) => {
      if (!date || typeof date !== 'object') return date;
      let next = date;
      if (hasPublishabilityMarker(date.date)) {
        next = {
          ...next,
          date: String(date.event || '')
            .toLowerCase()
            .includes('final')
            ? 'Final week'
            : 'Course milestone week',
        };
        changed = true;
      }
      if (hasPublishabilityMarker(date.event)) {
        next = { ...next, event: cleanSyllabusText(date.event, 'Course milestone') };
        changed = true;
      }
      return next;
    });
    if (changed) {
      syllabus = { ...syllabus, importantDates };
      patchedFields++;
    }
  }

  const normalized = wrapperKey ? { ...data, [wrapperKey]: syllabus } : syllabus;
  return { data: patchedFields > 0 ? normalized : data, patchedFields };
}
