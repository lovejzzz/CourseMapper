// v0.20.08: put the teacher's material and the questions written from it into
// the compiled materials.
//
// The compiler stays deterministic. This overlay runs after each material is
// compiled (compileFeatureInto) and is derived from the brief every time, so
// a rebuild, a restored project or an export all show the same result:
//   - Quiz & Exam Bank: the lesson's questions come from the material
//     (Scion-written when available, otherwise built directly from it);
//   - Lesson Plans, Study Guides, Assignments: the material itself is shown,
//     verbatim, where students and teachers work with it.
// Scion-written questions are cached by material + lesson title so a rebuild
// does not ask the model again.

import { extractSuppliedMaterial, hasSuppliedMaterial, normalizeMaterialText } from './suppliedMaterial.js';
import { buildMaterialFallbackItems } from './materialQuizItems.js';

const CACHE_KEY = 'coursemapper-material-items-v1';
const CACHE_LIMIT = 40;
const memoryCache = new Map();

function hashText(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function lessonTitleKey(title) {
  return normalizeMaterialText(String(title || '').replace(/^(?:lesson|week|session)\s*\d+\s*[:.-]\s*/i, ''));
}

export function materialItemsCacheKey(material, lessonTitle) {
  return hashText(`${material?.text || ''}|${lessonTitleKey(lessonTitle)}`);
}

function readStoredCache() {
  try {
    if (typeof localStorage === 'undefined') return {};
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function readCachedMaterialItems(key) {
  if (memoryCache.has(key)) return memoryCache.get(key);
  const stored = readStoredCache()[key];
  if (Array.isArray(stored?.items)) {
    memoryCache.set(key, stored.items);
    return stored.items;
  }
  return null;
}

export function writeCachedMaterialItems(key, items) {
  if (!Array.isArray(items) || items.length === 0) return;
  memoryCache.set(key, items);
  try {
    if (typeof localStorage === 'undefined') return;
    const stored = readStoredCache();
    stored[key] = { items, savedAt: Date.now() };
    const keys = Object.keys(stored).sort((a, b) => (stored[b].savedAt || 0) - (stored[a].savedAt || 0));
    for (const stale of keys.slice(CACHE_LIMIT)) delete stored[stale];
    localStorage.setItem(CACHE_KEY, JSON.stringify(stored));
  } catch {
    /* the cache is a convenience; the fallback questions still work */
  }
}

export function clearMaterialItemsCache() {
  memoryCache.clear();
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function tokens(text) {
  return new Set(
    normalizeMaterialText(text)
      .split(/\s+|(?=[一-鿿])/u)
      .filter((token) => token.length >= 2 || /[一-鿿]/u.test(token)),
  );
}

/**
 * Which lessons use which material blocks. A one-lesson course gets all of
 * it. In a longer course each block goes to the lesson it names ("Lesson 2")
 * or whose title shares the most words with it; otherwise to no lesson.
 */
export function assignMaterialToLessons(material, lessons = []) {
  const byLesson = new Map();
  if (!hasSuppliedMaterial(material) || lessons.length === 0) return byLesson;
  if (lessons.length === 1) {
    byLesson.set(lessons[0].lessonNumber, material.blocks);
    return byLesson;
  }
  for (const block of material.blocks) {
    const blockText = `${block.title} ${block.lines.join(' ')}`;
    // An explicit reference wins: "Lesson 2", "Session 3", "第2节/课".
    const reference = blockText.match(
      /\b(?:lesson|session|week|class)\s+(\d{1,2})\b|第\s*(\d{1,2})\s*(?:节|课|讲|周)/i,
    );
    const referenced = reference ? Number(reference[1] || reference[2]) : null;
    let best = lessons.find((lesson) => lesson.lessonNumber === referenced) || null;
    if (!best) {
      const blockTokens = tokens(blockText);
      let bestScore = 0;
      for (const lesson of lessons) {
        let score = 0;
        for (const token of tokens(lesson.title)) if (blockTokens.has(token)) score += 1;
        if (score > bestScore) {
          best = lesson;
          bestScore = score;
        }
      }
    }
    // In a longer course, material that names no lesson is shown nowhere
    // rather than replacing an unrelated lesson's quiz.
    if (best) byLesson.set(best.lessonNumber, [...(byLesson.get(best.lessonNumber) || []), block]);
  }
  return byLesson;
}

/** Lessons that should get material questions, for the Scion authoring step. */
export function materialAuthoringTargets(sourceBrief, lessons = []) {
  const material = extractSuppliedMaterial(sourceBrief);
  const assigned = assignMaterialToLessons(material, lessons);
  return lessons
    .filter((lesson) => assigned.has(lesson.lessonNumber))
    .map((lesson) => {
      const lessonMaterial = { ...material, blocks: assigned.get(lesson.lessonNumber) };
      lessonMaterial.text = lessonMaterial.blocks.flatMap((block) => block.lines).join('\n');
      return { lesson, material: lessonMaterial, cacheKey: materialItemsCacheKey(lessonMaterial, lesson.title) };
    });
}

/**
 * Build the overlay for a compiled blueprint. Returns null when the brief
 * gives no material, so the compiled materials pass through unchanged.
 */
export function resolveMaterialOverlay(blueprint, options = {}) {
  const sourceBrief = options.sourceBrief ?? blueprint?.explicitTeachingRequirements?.sourceBrief ?? '';
  // A lesson with a reviewed teaching task already binds the teacher's
  // material into checked questions and keys (v0.20.05); leave it alone.
  const lessons = (blueprint?.lessons || [])
    .filter((lesson) => !lesson.teachingTask)
    .map((lesson) => ({ lessonNumber: lesson.lessonNumber, title: lesson.title }));
  const targets = materialAuthoringTargets(sourceBrief, lessons);
  if (targets.length === 0) return null;
  const byLesson = {};
  for (const { lesson, material, cacheKey } of targets) {
    const topicText = `${blueprint?.courseName || ''} ${lesson.title} ${sourceBrief}`;
    const pool = buildMaterialFallbackItems(material, { count: 12, topicText });
    const authored = readCachedMaterialItems(cacheKey) || [];
    byLesson[lesson.lessonNumber] = { material, authored, pool };
  }
  return { version: 1, language: targets[0].material.language, byLesson };
}

// ─── Projection into each material ───────────────────────────────────────

function materialCard(material) {
  return {
    language: material.language,
    blocks: material.blocks.map((block) => ({ kind: block.kind, title: block.title, lines: [...block.lines] })),
  };
}

function similarQuestion(a, b) {
  return normalizeMaterialText(a) === normalizeMaterialText(b);
}

/** Exactly computed questions first, then Scion's, then other built ones. */
export function lessonMaterialQuestions(entry, count) {
  const chosen = [];
  const computed = entry.pool.filter((item) => item.computed);
  const built = entry.pool.filter((item) => !item.computed);
  for (const item of [...computed, ...entry.authored, ...built]) {
    if (chosen.length >= count) break;
    if (chosen.some((prior) => similarQuestion(prior.question, item.question))) continue;
    chosen.push(item);
  }
  return chosen;
}

function toQuizQuestion(item, lessonNumber, index) {
  const multipleChoice = item.type === 'multiple_choice';
  const bloom = item.bloomsLevel || (multipleChoice ? 'Remember' : 'Apply');
  const difficulty = index < 2 ? 'Easy' : index < 4 ? 'Medium' : 'Hard';
  return {
    id: `lesson-${lessonNumber}-q${index + 1}`,
    type: multipleChoice ? 'multiple_choice' : 'short_answer',
    bloomsLevel: bloom,
    difficulty,
    estimatedMinutes: multipleChoice ? 2 : 4,
    points: multipleChoice ? 2 : 4,
    objectiveAligned: '',
    question: item.question,
    ...(multipleChoice ? { options: item.options } : {}),
    answer: item.answer,
    ...(item.explanation ? { explanation: item.explanation } : {}),
    ...(item.reviewNote ? { scoringGuidance: item.reviewNote } : {}),
    ...(item.materialQuote ? { materialQuote: item.materialQuote } : {}),
    tags: ['supplied-material', multipleChoice ? 'multiple_choice' : 'short_answer', bloom],
    enrichmentSource: item.source === 'scion-material-item' ? 'scion-material-item' : 'material-built-item',
    quizPlan: {
      source: 'supplied-material-item',
      role: `material-${String(bloom).toLowerCase()}`,
      bloom,
      difficulty,
      questionIndex: index,
      bloomSource:
        item.source === 'scion-material-item' ? 'Scion item from supplied material' : 'built from supplied material',
    },
  };
}

function questionUsesMaterial(question, material) {
  const said = normalizeMaterialText(
    [question?.question, question?.answer, ...(Array.isArray(question?.options) ? question.options : [])].join(' '),
  );
  const body = normalizeMaterialText(material.text);
  const raw = [
    question?.question,
    question?.answer,
    ...(Array.isArray(question?.options) ? question.options : []),
  ].join(' ');
  // Only distinctive numbers count (1912, 1,200, 3.5), never a lone "1" that
  // also appears in "Week 1".
  const numbers = (String(material.text).match(/\d[\d,.]*\d|\d{2,}/g) || []).filter((number) => number.length >= 2);
  if (numbers.some((number) => new RegExp(`(?<![\\d.,])${number.replace(/[.,]/g, '\\$&')}(?![\\d])`).test(raw)))
    return true;
  if (material.language === 'zh') {
    const chars = body.replace(/[^\u4e00-\u9fff]/gu, '');
    for (let i = 0; i + 4 <= chars.length; i += 1) if (said.includes(chars.slice(i, i + 4))) return true;
    return false;
  }
  const words = body.split(' ');
  for (let i = 0; i + 3 <= words.length; i += 1) if (said.includes(words.slice(i, i + 3).join(' '))) return true;
  return false;
}

// The compiler already writes checked, material-bound questions for some
// briefs (for example a named data set it can compute from). Keep those; only
// a quiz that ignores the material is replaced.
export function compiledQuizUsesMaterial(entry, material) {
  const questions = Array.isArray(entry?.questions) ? entry.questions : [];
  if (questions.length === 0 || entry?.practiceRecord) return false;
  const grounded = questions.filter((question) => questionUsesMaterial(question, material)).length;
  return grounded * 2 >= questions.length;
}

function overlayQuizEntry(entry, overlayEntry) {
  if (overlayEntry.authored.length === 0 && compiledQuizUsesMaterial(entry, overlayEntry.material))
    return { ...entry, suppliedMaterial: materialCard(overlayEntry.material), materialQuestionSource: 'compiler' };
  const count = Math.max(1, Array.isArray(entry.questions) ? entry.questions.length : 4);
  const items = lessonMaterialQuestions(overlayEntry, count);
  if (items.length === 0) return entry;
  const questions = items.map((item, index) => toQuizQuestion(item, entry.lessonNumber, index));
  const totalPoints = questions.reduce((sum, question) => sum + question.points, 0);
  const totalMinutes = questions.reduce((sum, question) => sum + question.estimatedMinutes, 0);
  const next = { ...entry };
  delete next.practiceRecord;
  delete next.gradingSpec;
  const zh = overlayEntry.material.language === 'zh';
  const count_ = (type) => questions.filter((question) => question.type === type).length;
  return {
    ...next,
    suppliedMaterial: materialCard(overlayEntry.material),
    questions,
    totalQuestions: questions.length,
    totalPoints,
    bloomsCoverage: [...new Set(questions.map((question) => question.bloomsLevel))],
    pointPlan: zh
      ? `${count_('multiple_choice')} 道选择题（每题 2 分），${count_('short_answer')} 道简答题（每题 4 分），共 ${totalPoints} 分，约 ${totalMinutes} 分钟。`
      : `${count_('multiple_choice')} multiple-choice item(s) at 2 points and ${count_('short_answer')} short-answer item(s) at 4 points, ${totalPoints} points total, about ${totalMinutes} minutes.`,
    quizBlueprint: {
      ...(entry.quizBlueprint || {}),
      source: 'supplied-material-quiz',
      questionPlan: questions.map((question) => question.quizPlan),
    },
    materialQuestionSource: items.some((item) => item.source === 'scion-material-item') ? 'scion' : 'built',
  };
}

function overlayStudyGuide(guide, overlayEntry, quizQuestions) {
  // Practice uses questions the quiz does not already ask.
  const practice = overlayEntry.pool
    .filter((item) => !quizQuestions.some((question) => similarQuestion(question, item.question)))
    .slice(0, 3);
  return {
    ...guide,
    suppliedMaterial: materialCard(overlayEntry.material),
    ...(practice.length
      ? {
          objectivePractice: practice.map((item) => item.question),
          // The compiler's generic practice list says nothing about this
          // material; the questions above replace it.
          practiceActivities: [],
          practiceAnswers: practice.map((item) =>
            item.type === 'multiple_choice'
              ? `${item.answer}${item.explanation ? ` — ${item.explanation}` : ''}`
              : item.answer,
          ),
        }
      : {}),
  };
}

function lessonNumberOf(entry) {
  const direct = Number(entry?.lessonNumber);
  if (Number.isInteger(direct) && direct > 0) return direct;
  const numbers = Array.isArray(entry?.lessonNumbers) ? entry.lessonNumbers.map(Number) : [];
  return numbers.find((value) => Number.isInteger(value) && value > 0) || null;
}

/**
 * Apply the overlay to one compiled material. Unknown shapes pass through.
 */
export function applyMaterialOverlay(featureId, data, overlay) {
  if (!overlay || !data || typeof data !== 'object') return data;
  const entryFor = (item) => overlay.byLesson[lessonNumberOf(item)];
  if (featureId === 'quizBank' && Array.isArray(data.quizzes)) {
    return {
      ...data,
      quizzes: data.quizzes.map((quiz) =>
        quiz?.kind !== 'exam' && entryFor(quiz) ? overlayQuizEntry(quiz, entryFor(quiz)) : quiz,
      ),
    };
  }
  if (featureId === 'studyGuides' && Array.isArray(data.studyGuides)) {
    return {
      ...data,
      studyGuides: data.studyGuides.map((guide) => {
        const entry = entryFor(guide);
        if (!entry) return guide;
        const quizQuestions = lessonMaterialQuestions(entry, 8).map((item) => item.question);
        return overlayStudyGuide(guide, entry, quizQuestions);
      }),
    };
  }
  if (featureId === 'lessonPlans' && Array.isArray(data.lessonPlans)) {
    return {
      ...data,
      lessonPlans: data.lessonPlans.map((plan) =>
        entryFor(plan) ? { ...plan, suppliedMaterial: materialCard(entryFor(plan).material) } : plan,
      ),
    };
  }
  if (featureId === 'assignments' && Array.isArray(data.assignments)) {
    return {
      ...data,
      assignments: data.assignments.map((assignment) =>
        entryFor(assignment)
          ? { ...assignment, suppliedMaterial: materialCard(entryFor(assignment).material) }
          : assignment,
      ),
    };
  }
  return data;
}
