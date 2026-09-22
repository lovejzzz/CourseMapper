// v0.20.06 quiz-bank coherence pass.
//
// Lessons that draw on the same source packet could project identical question
// stems into several lessons, and difficulty labels followed item position
// rather than the work an item asks for. This pass keeps every question ID,
// point value and total unchanged (other materials reference them) and makes
// two honest corrections:
//  1. A stem already asked in an earlier lesson becomes an explicit retrieval
//     item ("Retrieval from Lesson 1: …") instead of silently reappearing as new.
//  2. A difficulty label that contradicts the item is corrected: multi-step
//     design/production items are not "Easy", recall items are not "Hard".

const IMPERATIVE_SENTENCE_RE =
  /(?:^|[.!?]\s+)(?:identify|propose|state|explain|compare|design|write|correct|evaluate|describe|calculate|justify|construct|label|predict|decide|report|distinguish|give|show|trace|solve)\b/gi;
const PRODUCTION_RE = /\b(?:propose|design|construct|write an?|build|plan)\b/i;
const RETRIEVAL_PREFIX_RE = /^Retrieval from Lesson \d+:\s*/;

function normalizeStem(value) {
  return String(value || '')
    .replace(RETRIEVAL_PREFIX_RE, '')
    .toLowerCase()
    .replace(/[“”"'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function correctedQuestionDifficulty(question = {}) {
  const current = String(question.difficulty || '');
  const bloom = String(question.bloomsLevel || '').toLowerCase();
  const stem = String(question.question || '');
  const steps = (stem.match(IMPERATIVE_SENTENCE_RE) || []).length;
  if (/^easy$/i.test(current)) {
    if (['evaluate', 'create'].includes(bloom) || question.type === 'essay') return 'Medium';
    if (steps >= 3 || (steps >= 2 && PRODUCTION_RE.test(stem))) return 'Medium';
  }
  if (/^hard$/i.test(current) && ['remember', 'understand'].includes(bloom) && steps <= 1) return 'Medium';
  return current;
}

export function applyQuizBankCoherence(data) {
  const quizzes = Array.isArray(data?.quizzes) ? data.quizzes : null;
  if (!quizzes) return data;
  const firstLessonForStem = new Map();
  const indexById = new Map(
    (Array.isArray(data.bankIndex) ? data.bankIndex : []).filter((row) => row?.id).map((row) => [row.id, row]),
  );
  quizzes.forEach((quiz, quizIndex) => {
    const lessonNumber = Number(quiz?.lessonNumber) || quizIndex + 1;
    for (const question of Array.isArray(quiz?.questions) ? quiz.questions : []) {
      if (!question || typeof question.question !== 'string') continue;
      const key = normalizeStem(question.question);
      if (!key) continue;
      const earlier = firstLessonForStem.get(key);
      const indexRow = indexById.get(question.id);
      if (earlier !== undefined && earlier !== lessonNumber) {
        if (!RETRIEVAL_PREFIX_RE.test(question.question)) {
          question.question = `Retrieval from Lesson ${earlier}: ${question.question}`;
        }
        question.difficulty = 'Easy';
        question.intendedUse = 'retrieval';
        question.retrievalOfLesson = earlier;
        question.tags = [...new Set([...(Array.isArray(question.tags) ? question.tags : []), 'retrieval'])];
        if (indexRow) {
          indexRow.difficulty = 'Easy';
          indexRow.intendedUse = 'retrieval';
        }
        continue;
      }
      if (earlier === undefined) firstLessonForStem.set(key, lessonNumber);
      const corrected = correctedQuestionDifficulty(question);
      if (corrected && corrected !== question.difficulty) {
        question.difficulty = corrected;
        if (indexRow) indexRow.difficulty = corrected;
      }
    }
  });
  return data;
}
