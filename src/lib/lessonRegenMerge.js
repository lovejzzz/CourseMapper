/**
 * lessonRegenMerge.js — merge a single-lesson regeneration result into an
 * existing deliverable array without destroying anything outside that lesson.
 *
 * Extracted from useDeliverables.js for v0.14.1 round 2 (Crucible Round-2
 * live failure): the CS Python finish-pass regen for the Lesson 11 quiz
 * replaced the ENTIRE compiled quiz bank (15 weekly quizzes + 2 registry
 * exams) with the model's single regenerated entry, because the hook's
 * render-closure snapshot of deliverable state was stale (the whole
 * generation → finish → retry chain ran inside one synchronous task, so no
 * re-render ever refreshed the closure) and the no-snapshot branch dispatched
 * the bare regen result as the feature's full data.
 *
 * The merge itself is now lesson-aware and defensive for the quiz bank:
 *  - registry exam entries (kind 'exam') are NEVER replaced or dropped by a
 *    lesson regen — they are separate documents that merely share the
 *    lessonNumber with the weekly quiz;
 *  - the regenerated weekly entry must be renderable (a questions array with
 *    at least four items, multiple-choice items keyed) or it is rejected and
 *    the original entry kept — the live run exported a Lesson 11 docx that
 *    contained nothing but the title.
 */
import { getArrayKey } from './syncDependencies.js';

export const PER_ASSESSMENT_REGEN_FEATURES = new Set(['rubrics', 'assignments']);

/** Minimum question count for a regenerated quiz entry to be renderable. */
export const MIN_RENDERABLE_QUIZ_QUESTIONS = 4;

function normalizeLessonMatch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(?:lesson|week|module|unit|session)\s*\d{1,2}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLessonNumbersFromText(value) {
  const numbers = new Set();
  const raw = String(value || '');
  for (const match of raw.matchAll(/\b(?:lesson|week|module|unit|session)\s*(\d{1,2})\b/gi)) {
    const number = Number(match[1]);
    if (Number.isFinite(number)) numbers.add(number);
  }
  return [...numbers];
}

function collectLessonIdentityText(item) {
  const values = [
    item?.lessonTitle,
    item?.lt,
    item?.title,
    item?.t,
    item?.assessmentTitle,
    item?.assessment,
    item?.assessmentType,
    item?.at,
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
  ];
  return values.filter(Boolean).join(' ');
}

function getItemLessonNumbers(item) {
  return extractLessonNumbersFromText(collectLessonIdentityText(item));
}

export function getCourseLessonTitle(courseMap, lessonIndex) {
  return courseMap?.lessons?.[lessonIndex]?.title || `Lesson ${lessonIndex + 1}`;
}

function itemMatchesLesson(item, lessonNumber, normalizedLessonTitle) {
  const numbers = getItemLessonNumbers(item);
  if (numbers.includes(lessonNumber)) return true;
  if (!normalizedLessonTitle) return false;
  return normalizeLessonMatch(collectLessonIdentityText(item)).includes(normalizedLessonTitle);
}

export function addTargetLessonIdentity(item, courseMap, lessonIndex) {
  if (!item || typeof item !== 'object') return item;
  const lessonNumber = lessonIndex + 1;
  const lessonTitle = getCourseLessonTitle(courseMap, lessonIndex);
  const explicitTitle = `Lesson ${lessonNumber}: ${lessonTitle}`;
  const next = { ...item };
  const numbers = getItemLessonNumbers(next);
  const titleText = String(next.lessonTitle || next.lt || '');

  if (!numbers.includes(lessonNumber) || !titleText.trim()) {
    next.lessonTitle = explicitTitle;
  }
  return next;
}

function sortLessonScopedItems(items) {
  return [...items].sort((a, b) => {
    const aNumber = getItemLessonNumbers(a)[0] || 9999;
    const bNumber = getItemLessonNumbers(b)[0] || 9999;
    return aNumber - bNumber;
  });
}

/** Registry exam entries share a lessonNumber with the weekly quiz but are
 *  separate documents — a lesson regen may never replace or drop them. */
export function isExamQuizEntry(entry) {
  return Boolean(entry && typeof entry === 'object' && entry.kind === 'exam');
}

/**
 * A regenerated quiz entry is renderable only when it carries a questions
 * array with at least MIN_RENDERABLE_QUIZ_QUESTIONS items and an answer key:
 * every multiple-choice item keyed, or (for banks without MC items) an
 * answerKey/model-answer present. The Round-2 live run accepted a stub whose
 * docx rendered as a bare title.
 */
export function isRenderableQuizEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const questions = Array.isArray(entry.questions) ? entry.questions : Array.isArray(entry.items) ? entry.items : [];
  if (questions.length < MIN_RENDERABLE_QUIZ_QUESTIONS) return false;
  const multipleChoice = questions.filter(
    (question) => Array.isArray(question?.options) || /multiple[-_ ]?choice/i.test(String(question?.type || '')),
  );
  if (multipleChoice.length > 0) {
    return multipleChoice.every(
      (question) => String(question?.answer ?? question?.correctAnswer ?? '').trim().length > 0,
    );
  }
  const hasAnswerKey = Array.isArray(entry.answerKey) && entry.answerKey.length > 0;
  return (
    hasAnswerKey ||
    questions.some(
      (question) => String(question?.answer || question?.sampleAnswer || question?.rubricHints || '').trim().length > 0,
    )
  );
}

/**
 * Quiz-bank lesson merge: replace ONLY the weekly (non-exam) entry for the
 * target lesson, validate the replacement, and leave every exam entry — and
 * every other lesson's entry — untouched.
 */
function mergeQuizBankLessonEntry(existing, incoming, lessonIndex, courseMap, options = {}) {
  const reject = (reason) => {
    if (typeof options.onReject === 'function') options.onReject(reason);
    return existing;
  };
  const lessonNumber = lessonIndex + 1;
  // A regen result may never carry exam entries into the bank — exams are
  // compiled from the assessment registry, not regenerated per lesson.
  const replacement = incoming.find((item) => !isExamQuizEntry(item));
  if (!replacement) {
    return reject('regenerated result contained no weekly (non-exam) quiz entry');
  }
  if (!isRenderableQuizEntry(replacement)) {
    return reject(
      `regenerated Lesson ${lessonNumber} quiz entry is not renderable (needs >=${MIN_RENDERABLE_QUIZ_QUESTIONS} questions and an answer key) — keeping the original entry`,
    );
  }
  const normalizedLessonTitle = normalizeLessonMatch(getCourseLessonTitle(courseMap, lessonIndex));
  // Carry an explicit integer lessonNumber so the per-lesson export slice
  // routes the entry by identity, never by array position.
  const prepared = { ...addTargetLessonIdentity(replacement, courseMap, lessonIndex), lessonNumber };

  let targetIndex = existing.findIndex(
    (item) =>
      !isExamQuizEntry(item) &&
      (Number.isInteger(item?.lessonNumber)
        ? item.lessonNumber === lessonNumber
        : itemMatchesLesson(item, lessonNumber, normalizedLessonTitle)),
  );
  if (targetIndex < 0 && lessonIndex < existing.length && !isExamQuizEntry(existing[lessonIndex])) {
    targetIndex = lessonIndex;
  }
  const merged = [...existing];
  if (targetIndex >= 0) merged[targetIndex] = prepared;
  else merged.push(prepared);
  return merged;
}

/**
 * Exam cards have their own Regen control. They share a lessonNumber with a
 * weekly quiz, so lesson identity alone is not enough: replace the exact
 * registry assessment and preserve every weekly entry and sibling exam.
 */
function mergeQuizBankExamEntry(existing, incoming, lessonIndex, options = {}) {
  const reject = (reason) => {
    if (typeof options.onReject === 'function') options.onReject(reason);
    return existing;
  };
  const lessonNumber = lessonIndex + 1;
  const assessmentId = String(options.assessmentId || '').trim();
  const examCandidates = incoming.filter(isExamQuizEntry);
  const replacement =
    (assessmentId &&
      examCandidates.find((item) => String(item?.assessmentId || item?.registryId || '').trim() === assessmentId)) ||
    examCandidates.find((item) => Number(item?.lessonNumber) === lessonNumber) ||
    examCandidates[0];
  if (!replacement) return reject('regenerated result contained no exam entry');
  if (!isRenderableQuizEntry(replacement)) {
    return reject(`regenerated exam entry is not renderable — keeping the original entry`);
  }

  let targetIndex = assessmentId
    ? existing.findIndex(
        (item) => isExamQuizEntry(item) && String(item?.assessmentId || item?.registryId || '').trim() === assessmentId,
      )
    : -1;
  if (
    targetIndex < 0 &&
    Number.isInteger(options.deliverableItemIndex) &&
    isExamQuizEntry(existing[options.deliverableItemIndex])
  ) {
    targetIndex = options.deliverableItemIndex;
  }
  if (targetIndex < 0) {
    targetIndex = existing.findIndex((item) => isExamQuizEntry(item) && Number(item?.lessonNumber) === lessonNumber);
  }
  if (targetIndex < 0) return reject('could not locate the target exam entry in the current quiz bank');

  const merged = [...existing];
  merged[targetIndex] = { ...replacement, lessonNumber };
  return merged;
}

export function mergeRegeneratedLessonItems(featureId, existingArr, newArr, lessonIndex, courseMap, options = {}) {
  const incoming = Array.isArray(newArr) ? newArr.filter(Boolean) : [];
  const existing = Array.isArray(existingArr) ? [...existingArr] : [];
  if (incoming.length === 0) return existing;

  if (featureId === 'quizBank') {
    if (options.targetKind === 'exam') {
      return mergeQuizBankExamEntry(existing, incoming, lessonIndex, options);
    }
    return mergeQuizBankLessonEntry(existing, incoming, lessonIndex, courseMap, options);
  }

  if (!PER_ASSESSMENT_REGEN_FEATURES.has(featureId)) {
    const merged = [...existing];
    if (lessonIndex < merged.length) merged[lessonIndex] = incoming[0];
    else merged.push(incoming[0]);
    for (let i = 1; i < incoming.length; i++) {
      const itemTitle = incoming[i]?.lessonTitle || incoming[i]?.title || '';
      const matchIdx = itemTitle
        ? merged.findIndex((m, idx) => idx !== lessonIndex && (m?.lessonTitle === itemTitle || m?.title === itemTitle))
        : -1;
      if (matchIdx >= 0) merged[matchIdx] = incoming[i];
    }
    return merged;
  }

  const lessonNumber = lessonIndex + 1;
  const normalizedLessonTitle = normalizeLessonMatch(getCourseLessonTitle(courseMap, lessonIndex));
  const preparedIncoming = incoming.map((item) => addTargetLessonIdentity(item, courseMap, lessonIndex));
  const firstMatchIndex = existing.findIndex((item) => itemMatchesLesson(item, lessonNumber, normalizedLessonTitle));
  const keptExisting = existing.filter((item) => !itemMatchesLesson(item, lessonNumber, normalizedLessonTitle));

  if (firstMatchIndex < 0) {
    return sortLessonScopedItems([...keptExisting, ...preparedIncoming]);
  }

  const insertIndex = Math.min(firstMatchIndex, keptExisting.length);
  return [...keptExisting.slice(0, insertIndex), ...preparedIncoming, ...keptExisting.slice(insertIndex)];
}

/**
 * Guard for the no-snapshot path: a single-lesson regeneration result must
 * never be accepted as a feature's FULL data when the course clearly has more
 * lessons than the result covers — that is exactly how the Round-2 live run
 * shipped a one-entry quiz bank for a 15-lesson course.
 */
export function isUnsafeFullReplacement(featureId, parsed, courseMap) {
  if (!parsed || typeof parsed !== 'object') return false;
  const lessonCount = Array.isArray(courseMap?.lessons) ? courseMap.lessons.length : 0;
  if (lessonCount <= 1) return false;
  const arrayKey = getArrayKey(featureId, parsed);
  const items = arrayKey && Array.isArray(parsed[arrayKey]) ? parsed[arrayKey] : [];
  return items.length > 0 && items.length < lessonCount;
}
