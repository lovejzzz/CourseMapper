import { getArrayKey } from './syncDependencies';

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
    const questions = Array.isArray(lesson?.questions) ? lesson.questions : [];
    if (questions.length > target) {
      trimmedQuestions += questions.length - target;
      return { ...lesson, questions: questions.slice(0, target) };
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

function isBlankOrRepairPlaceholder(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  return /explanation needed|rationale needed|model response required|review this question/i.test(text);
}

function getAnswerOptionText(question) {
  const answer = String(question?.answer || '').trim();
  if (!answer || !Array.isArray(question?.options)) return answer;
  const answerLetter = answer.match(/^[A-D]/i)?.[0]?.toUpperCase();
  if (!answerLetter) return answer;
  const option = question.options.find((value) =>
    String(value || '')
      .trim()
      .toUpperCase()
      .startsWith(`${answerLetter}.`),
  );
  return option ? String(option).trim() : answer;
}

function buildQuizExplanation(question) {
  const type = String(question?.type || '').trim();
  const objective = String(question?.objectiveAligned || '').trim();
  const answer = String(question?.answer || '').trim();
  const sampleAnswer = String(question?.sampleAnswer || '').trim();
  const rubricHints = String(question?.rubricHints || '').trim();

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
  const answerLetter = String(question?.answer || '')
    .trim()
    .match(/^[A-D]/i)?.[0]
    ?.toUpperCase();
  const wrongOptions = Array.isArray(question?.options)
    ? question.options
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

export function normalizeQuizBankRationales(data) {
  const arrayKey = getArrayKey('quizBank', data) || (data?.quizzes ? 'quizzes' : data?.quizBank ? 'quizBank' : null);
  const quizzes = arrayKey ? data?.[arrayKey] : null;

  if (!Array.isArray(quizzes) || quizzes.length === 0) {
    return { data, arrayKey, patchedExplanations: 0, patchedDistractorRationales: 0 };
  }

  let patchedExplanations = 0;
  let patchedDistractorRationales = 0;
  const nextQuizzes = quizzes.map((quiz) => {
    if (!Array.isArray(quiz?.questions)) return quiz;
    let quizChanged = false;
    const questions = quiz.questions.map((question) => {
      const nextQuestion = { ...question };
      const isMc = nextQuestion.type === 'multiple_choice';

      if (isBlankOrRepairPlaceholder(nextQuestion.explanation)) {
        patchedExplanations++;
        quizChanged = true;
        nextQuestion.explanation = buildQuizExplanation(nextQuestion);
      }

      if (isMc && isBlankOrRepairPlaceholder(nextQuestion.distractorRationale)) {
        patchedDistractorRationales++;
        quizChanged = true;
        nextQuestion.distractorRationale = buildDistractorRationale(nextQuestion);
      }

      return nextQuestion;
    });
    return quizChanged ? { ...quiz, questions } : quiz;
  });

  return {
    data: patchedExplanations > 0 || patchedDistractorRationales > 0 ? { ...data, [arrayKey]: nextQuizzes } : data,
    arrayKey,
    patchedExplanations,
    patchedDistractorRationales,
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
    if (!Array.isArray(deck?.slides)) return deck;
    let deckChanged = false;
    const slides = deck.slides.map((slide, index) => {
      const notes = String(slide?.notes || slide?.speakerNotes || '').trim();
      if (notes.length >= 40) return slide;
      patchedNotes++;
      deckChanged = true;
      return { ...slide, notes: buildFallbackSlideNotes(deck, slide, index) };
    });
    return deckChanged ? { ...deck, slides } : deck;
  });

  return {
    data: patchedNotes > 0 ? { ...data, [arrayKey]: nextDecks } : data,
    arrayKey,
    patchedNotes,
  };
}
