import { getArrayKey } from './syncDependencies';

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
    return { data, arrayKey, patchedNotes: 0 };
  }

  let patchedNotes = 0;
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
    return deckChanged ? { ...deck, [slideKey]: slides } : deck;
  });

  return {
    data: patchedNotes > 0 ? { ...data, [arrayKey]: nextDecks } : data,
    arrayKey,
    patchedNotes,
  };
}
