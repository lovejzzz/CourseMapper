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

export function getCourseFaqQuestionTarget(config = {}) {
  const raw = Number(config?.questionsPerLesson);
  if (!Number.isFinite(raw)) return 5;
  return Math.max(3, Math.min(8, Math.round(raw)));
}

export function normalizeCourseFaqQuestionCounts(data, config = {}) {
  const arrayKey = getArrayKey('courseFaq', data) || (data?.faqs ? 'faqs' : data?.courseFaq ? 'courseFaq' : null);
  const lessons = arrayKey ? data?.[arrayKey] : null;
  const target = getCourseFaqQuestionTarget(config);

  if (!Array.isArray(lessons) || lessons.length === 0) {
    return { data, arrayKey, target, trimmedQuestions: 0, underfilledIndices: [] };
  }

  let trimmedQuestions = 0;
  const underfilledIndices = [];
  const nextLessons = lessons.map((lesson, index) => {
    const questionKey = Array.isArray(lesson?.questions) ? 'questions' : Array.isArray(lesson?.qs) ? 'qs' : null;
    const questions = questionKey ? lesson[questionKey] : [];
    if (questions.length > target) {
      trimmedQuestions += questions.length - target;
      return { ...lesson, [questionKey]: questions.slice(0, target) };
    }
    if (questions.length > 0 && questions.length < target) {
      underfilledIndices.push(index);
    }
    return lesson;
  });

  const changed = trimmedQuestions > 0;
  return {
    data: changed ? { ...data, [arrayKey]: nextLessons } : data,
    arrayKey,
    target,
    trimmedQuestions,
    underfilledIndices,
  };
}

function isInvalidFaqCategory(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (CATEGORY_SET.has(text)) return false;
  if (text.length > 40) return true;
  return /[.!?;:]|\b(this|because|supports|addresses|matches|helps|students?)\b/i.test(text);
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
    const questionKey = Array.isArray(quiz?.questions) ? 'questions' : Array.isArray(quiz?.qs) ? 'qs' : null;
    if (!questionKey) return quiz;

    let quizChanged = false;
    const questions = quiz[questionKey].map((question) => {
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

export function normalizeQuizBankRationales(data) {
  const arrayKey = getArrayKey('quizBank', data) || (data?.quizzes ? 'quizzes' : data?.quizBank ? 'quizBank' : null);
  const quizzes = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(quizzes) || quizzes.length === 0) {
    return { data, arrayKey, patchedExplanations: 0, patchedDistractorRationales: 0 };
  }

  let patchedExplanations = 0;
  let patchedDistractorRationales = 0;
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

      return nextQuestion;
    });
    return quizChanged ? { ...quiz, [questionKey]: questions } : quiz;
  });

  return {
    data: patchedExplanations > 0 || patchedDistractorRationales > 0 ? { ...data, [arrayKey]: nextQuizzes } : data,
    arrayKey,
    patchedExplanations,
    patchedDistractorRationales,
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
  return /\b(assignment|paper|project|presentation|exam|quiz|test|portfolio|brief|report|case study|problem set|reflection|proposal|analysis|essay|final|midterm)\b/i.test(
    text,
  );
}

function extractLessonNumbersFromRubric(rubric) {
  const haystack = [
    rubric?.lessonTitle,
    rubric?.lt,
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
  const text = getLessonAssessmentText(lesson);
  const line = text
    .split(/\n|;/)
    .map((part) => part.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .find(Boolean);
  return line || 'Lesson Assessment';
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
        criterion: 'Objective alignment and task completion',
        objectiveAligned: objective,
        weight: 30,
        points: 30,
        exemplary:
          'The student completes every required component and explicitly connects the work to the target learning objective with precise evidence. e.g., The submission names the objective and uses course evidence to justify each major claim.',
        proficient:
          'The student completes the required components and connects the work to the target learning objective with relevant evidence. e.g., The submission links the main claim to course concepts and includes supporting details.',
        developing:
          'The student completes major components but the connection to the target learning objective is uneven or partly implicit. e.g., The submission references the topic but leaves some required reasoning unstated.',
        beginning:
          'The student attempts the task but omits required components or gives only a limited connection to the learning objective. e.g., The submission summarizes the topic without showing how it meets the objective.',
      },
      {
        criterion: 'Use of course concepts and evidence',
        objectiveAligned: objective,
        weight: 30,
        points: 30,
        exemplary:
          'The student applies course concepts accurately and supports claims with specific, relevant evidence. e.g., The response integrates named methods, readings, or examples to explain the decision made.',
        proficient:
          'The student applies course concepts accurately with enough evidence to support the central claim. e.g., The response cites a relevant concept and uses it to interpret the example.',
        developing:
          'The student uses course concepts but evidence is thin, broad, or only partly connected to the claim. e.g., The response names a concept but provides limited explanation of its relevance.',
        beginning:
          'The student attempts to use course concepts but shows confusion or relies mostly on unsupported description. e.g., The response lists terms without applying them to the assigned task.',
      },
      {
        criterion: 'Analysis, reasoning, and judgment',
        objectiveAligned: objective,
        weight: 25,
        points: 25,
        exemplary:
          'The student develops a clear, logical line of reasoning that considers implications, limits, or alternatives. e.g., The response explains why one approach is stronger while acknowledging a credible limitation.',
        proficient:
          'The student presents a logical line of reasoning that supports the conclusion. e.g., The response explains the main choice and connects it to the evidence provided.',
        developing:
          'The student presents reasoning, but some links between evidence and conclusion are incomplete. e.g., The response makes a plausible claim but does not fully explain why the evidence supports it.',
        beginning:
          'The student offers a conclusion with minimal reasoning or unsupported assertions. e.g., The response states an answer but provides little explanation for the choice.',
      },
      {
        criterion: 'Communication and submission quality',
        objectiveAligned: objective,
        weight: 15,
        points: 15,
        exemplary:
          'The student communicates in a polished, organized format that follows all stated submission requirements. e.g., The work uses headings, citations, and formatting that make the argument easy to evaluate.',
        proficient:
          'The student communicates clearly and follows the major submission requirements. e.g., The work is organized, readable, and includes required format elements.',
        developing:
          'The student communicates the main ideas but organization, clarity, or formatting inconsistencies slow evaluation. e.g., The work is understandable but misses one format requirement.',
        beginning:
          'The student submits work that is difficult to follow or misses multiple submission requirements. e.g., The work lacks structure or omits required formatting details.',
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
    return { data, arrayKey, normalizedSupportFields: 0, patchedCriterionPoints: 0 };
  }

  let normalizedSupportFields = 0;
  let patchedCriterionPoints = 0;
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
    const totalPoints = Number(nextRubric.totalPoints || nextRubric.tp);
    if (criteriaKey && Number.isFinite(totalPoints) && totalPoints > 0) {
      const criteria = nextRubric[criteriaKey].map((criterion) => {
        const weight = Number(criterion?.weight || criterion?.wt);
        if (!Number.isFinite(weight) || weight <= 0) return criterion;
        const pointsKey = criterion.points !== undefined ? 'points' : criterion.pt !== undefined ? 'pt' : 'points';
        const expectedPoints = Math.round((weight / 100) * totalPoints);
        if (criterion[pointsKey] === expectedPoints) return criterion;
        patchedCriterionPoints++;
        changed = true;
        return { ...criterion, [pointsKey]: expectedPoints };
      });
      nextRubric[criteriaKey] = criteria;
    }

    return changed ? nextRubric : rubric;
  });

  return {
    data: normalizedSupportFields > 0 || patchedCriterionPoints > 0 ? { ...data, [arrayKey]: nextRubrics } : data,
    arrayKey,
    normalizedSupportFields,
    patchedCriterionPoints,
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
    'A likely student question is how this point applies in practice; answer with a brief example from the lesson context.',
    'TRANSITION: Link this idea to the next slide by naming the next concept or activity students will use.',
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

export function normalizeSlideDeckAccessibility(data) {
  const arrayKey = getArrayKey('slideDecks', data) || (data?.decks ? 'decks' : data?.slideDecks ? 'slideDecks' : null);
  const decks = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(decks) || decks.length === 0) {
    return { data, arrayKey, patchedAltText: 0, patchedDuePlaceholders: 0, addedSequenceGuides: 0 };
  }

  let patchedAltText = 0;
  let patchedDuePlaceholders = 0;
  let addedSequenceGuides = 0;
  const nextDecks = decks.map((deck) => {
    const slideKey = Array.isArray(deck?.slides) ? 'slides' : Array.isArray(deck?.sl) ? 'sl' : null;
    if (!slideKey) return deck;

    let deckChanged = false;
    const slides = deck[slideKey].map((slide) => {
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

    const guideKey = deck.slideDeckSequenceGuide !== undefined ? 'slideDeckSequenceGuide' : 'slideDeckSequenceGuide';
    const needsGuide = !deck[guideKey] || typeof deck[guideKey] !== 'object';
    if (needsGuide) {
      addedSequenceGuides++;
      deckChanged = true;
    }

    return deckChanged
      ? {
          ...deck,
          [slideKey]: slides,
          ...(needsGuide
            ? {
                [guideKey]: {
                  accessibilityStandards:
                    'All instructional content is available as text for screen readers. Visual suggestions include alt text and should not rely on color alone.',
                  cumulativeAssessmentMap:
                    'Use the objectives, practice slides, and closing prompts as checkpoints before related quizzes, assignments, or exams.',
                },
              }
            : {}),
        }
      : deck;
  });

  return {
    data:
      patchedAltText > 0 || patchedDuePlaceholders > 0 || addedSequenceGuides > 0
        ? { ...data, [arrayKey]: nextDecks }
        : data,
    arrayKey,
    patchedAltText,
    patchedDuePlaceholders,
    addedSequenceGuides,
  };
}

export function normalizeStudyGuideQuestions(data) {
  const arrayKey =
    getArrayKey('studyGuides', data) || (data?.guides ? 'guides' : data?.studyGuides ? 'studyGuides' : null);
  const guides = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(guides) || guides.length === 0) {
    return { data, arrayKey, splitCombinedQuestions: 0 };
  }

  let splitCombinedQuestions = 0;
  const nextGuides = guides.map((guide) => {
    const questionKey = Array.isArray(guide?.reviewQuestions)
      ? 'reviewQuestions'
      : Array.isArray(guide?.rq)
        ? 'rq'
        : null;
    if (!questionKey) return guide;
    let changed = false;
    const questions = [];

    guide[questionKey].forEach((question) => {
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

    return changed ? { ...guide, [questionKey]: questions } : guide;
  });

  return {
    data: splitCombinedQuestions > 0 ? { ...data, [arrayKey]: nextGuides } : data,
    arrayKey,
    splitCombinedQuestions,
  };
}

export function normalizeLessonPlanPublishability(data) {
  const arrayKey =
    getArrayKey('lessonPlans', data) || (data?.plans ? 'plans' : data?.lessonPlans ? 'lessonPlans' : null);
  const plans = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(plans) || plans.length === 0) {
    return { data, arrayKey, patchedReviewDates: 0, patchedOwnerGroups: 0 };
  }

  let patchedReviewDates = 0;
  let patchedOwnerGroups = 0;
  const nextPlans = plans.map((plan) => {
    let nextPlan = plan;
    const reviewKey =
      plan?.suggestedReviewDate !== undefined ? 'suggestedReviewDate' : plan?.rd !== undefined ? 'rd' : null;
    const ownerKey = plan?.contentOwnerGroup !== undefined ? 'contentOwnerGroup' : plan?.cg !== undefined ? 'cg' : null;

    if (
      reviewKey &&
      /fall\s+\d{4}|spring\s+\d{4}|summer\s+\d{4}|\b\d{4}\b|tbd|to be confirmed/i.test(plan[reviewKey])
    ) {
      nextPlan = {
        ...nextPlan,
        [reviewKey]: 'Instructor confirms the local review cycle before publishing this lesson plan.',
      };
      patchedReviewDates++;
    }

    if (
      ownerKey &&
      /\bdepartment of|school of|college of|program office|content team|tbd|to be confirmed/i.test(plan[ownerKey])
    ) {
      nextPlan = {
        ...nextPlan,
        [ownerKey]: 'Instructor-selected program, course team, or department owner.',
      };
      patchedOwnerGroups++;
    }

    return nextPlan;
  });

  return {
    data: patchedReviewDates > 0 || patchedOwnerGroups > 0 ? { ...data, [arrayKey]: nextPlans } : data,
    arrayKey,
    patchedReviewDates,
    patchedOwnerGroups,
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

  patch('semester', 'Term to be confirmed');
  patch('credits', '3 credits');
  patch('meetingPattern', 'Meeting pattern to be confirmed');
  patch('location', 'Location to be confirmed');
  patch('prerequisites', 'No formal prerequisites listed; students should review program requirements.');
  patch('instructor', 'Instructor to be announced');
  patch('instructorEmail', 'Use the contact method listed in the course site.');
  patch('officeHours', 'Office hours will be announced in the course site.');
  patch('officeLocation', 'Office location or meeting link will be announced in the course site.');
  patch('suggestedReviewDate', 'Review before the next offering.');

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
          note: 'Suggested text; instructor should verify adoption before assigning.',
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
        next = { ...next, dates: 'Date to be confirmed' };
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
        next = { ...next, date: 'Date to be confirmed' };
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
