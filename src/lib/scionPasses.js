// src/lib/scionPasses.js — the Scion quality passes, promoted from the local
// server into the compiler (V2.1 Workstream D3). These are the three passes
// the V2 campaign measured moving the judge: blind-solve quiz-key
// verification with regeneration (a 5:4 ratio keyed "Minor Third" shipped to
// a ZIP before this existed), the lexical topic gate (fugue items inside an
// intervals lesson cost every quiz seat), and the self-refine polish pass
// (the pass that took study guides past the paid baseline).
//
// They run on the RAW Pass B batch JSON — the kernel contract shape — before
// parsing, exactly where the server used to apply them invisibly. Every
// mutation is returned as a telemetry event; D4 forwards accepted/regenerated
// pairs to the local flywheel.
//
// All passes are best-effort: any failure ships the draft unchanged.

const TOPIC_STOPWORDS = new Set([
  'lesson',
  'week',
  'music',
  'musical',
  'theory',
  'course',
  'with',
  'that',
  'this',
  'from',
  'what',
  'which',
  'into',
  'their',
  'between',
  'using',
  'based',
]);

const MC_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    q: { type: 'string', minLength: 25, maxLength: 300 },
    op: { type: 'array', items: { type: 'string', minLength: 5, maxLength: 95 }, minItems: 4, maxItems: 4 },
    ai: { type: 'integer', minimum: 0, maximum: 3 },
    ex: { type: 'string', minLength: 20, maxLength: 300 },
  },
  required: ['q', 'op', 'ai', 'ex'],
};

function topicWords(promptLesson) {
  const text = `${promptLesson?.title ?? ''} ${promptLesson?.topics ?? ''}`.toLowerCase();
  return [...new Set(text.match(/[a-z]{4,}/g) ?? [])].filter((word) => !TOPIC_STOPWORDS.has(word));
}

function onTopic(item, words) {
  const text = `${item.q} ${(item.op ?? []).join(' ')} ${item.ex ?? ''}`.toLowerCase();
  return words.some((word) => text.includes(word));
}

async function blindSolve(items, generateJson) {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      answers: {
        type: 'array',
        items: { type: 'integer', minimum: 0, maximum: 3 },
        minItems: items.length,
        maxItems: items.length,
      },
    },
    required: ['answers'],
  };
  const reply = await generateJson({
    system:
      'You are answering a quiz cold. For each question pick the index (0-3) of the correct option. Return ONLY {"answers":[...]} in question order.',
    user: JSON.stringify(items.map((item) => ({ q: item.q, op: item.op }))),
    schemaProfile: { name: 'blind_solve', schema, strict: true },
    maxOutputTokens: 200,
  });
  const parsed = JSON.parse(reply)?.answers;
  return Array.isArray(parsed) ? parsed : null;
}

/**
 * Verify a lesson's mc answer keys by blind re-solving; regenerate an item
 * only when TWO independent blind solves agree on the same non-key answer
 * (single-solve regeneration measurably swapped good items for hastier ones).
 */
async function verifyMcAnswers(lesson, promptLesson, generateJson, events) {
  const items = Array.isArray(lesson?.mc) ? lesson.mc : [];
  if (items.length === 0) return;
  const first = await blindSolve(items, generateJson).catch(() => null);
  if (!first) return;
  const disagreements = items.map((item, index) => first[index] !== undefined && first[index] !== item.ai);
  if (!disagreements.some(Boolean)) return;
  const second = await blindSolve(items, generateJson).catch(() => null);
  for (const [index, item] of items.entries()) {
    if (!disagreements[index]) continue;
    if (!second || second[index] !== first[index]) continue; // solves disagree — keep the item
    try {
      const reply = await generateJson({
        system:
          'You write flawless quiz items. Replace a faulty multiple-choice item (its key disagreed with two blind solves). Same concept, same difficulty, tests ONLY the listed lesson topics. The answer key (ai) MUST be verifiably correct. Return ONLY the item JSON object.',
        user: `Lesson: ${JSON.stringify(promptLesson ?? {})}\nFaulty item: ${JSON.stringify(item)}`,
        schemaProfile: { name: 'mc_item', schema: MC_ITEM_SCHEMA, strict: true },
        maxOutputTokens: 2000,
        temperature: 0.7,
      });
      const fresh = JSON.parse(reply);
      if (fresh?.q && Array.isArray(fresh.op) && fresh.op.length === 4) {
        events.push({
          pass: 'mcVerify',
          lessonId: lesson.lessonId,
          item: index,
          action: 'regenerated',
          rejected: item,
          chosen: fresh,
        });
        items[index] = fresh;
      }
    } catch {
      /* keep the original item */
    }
  }
}

/** Regenerate items that share zero vocabulary with the lesson's own topics. */
async function topicGate(lesson, promptLesson, generateJson, events) {
  const items = Array.isArray(lesson?.mc) ? lesson.mc : [];
  const words = topicWords(promptLesson);
  if (items.length === 0 || words.length === 0) return;
  for (const [index, item] of items.entries()) {
    if (onTopic(item, words)) continue;
    try {
      const reply = await generateJson({
        system:
          'You write flawless quiz items. Replace an OFF-TOPIC item with one testing ONLY the listed lesson topics, same difficulty. The answer key (ai) MUST be verifiably correct. Return ONLY the item JSON object.',
        user: `Lesson topics: ${words.join(', ')}\nOff-topic item: ${JSON.stringify(item)}`,
        schemaProfile: { name: 'mc_item', schema: MC_ITEM_SCHEMA, strict: true },
        maxOutputTokens: 2000,
        temperature: 0.7,
      });
      const fresh = JSON.parse(reply);
      if (fresh?.q && Array.isArray(fresh.op) && fresh.op.length === 4 && onTopic(fresh, words)) {
        events.push({
          pass: 'topicGate',
          lessonId: lesson.lessonId,
          item: index,
          action: 'regenerated',
          rejected: item,
          chosen: fresh,
        });
        items[index] = fresh;
      }
    } catch {
      /* keep the original item */
    }
  }
}

const POLISH_FIELDS = ['scenario', 'discussionPrompt', 'assignmentCore', 'studyGuide'];
const MC_EXPLANATION_MIN_LENGTH = 40;
const MC_EXPLANATION_CAUSAL_PATTERN =
  /\b(because|since|as|therefore|so|which|that|when|means|defines|explains|shows|signals|anchors|requires|matches)\b/i;

function contentWords(value) {
  return String(value || '')
    .toLowerCase()
    .match(/[a-z][a-z-]{3,}/g);
}

function explanationMentionsKey(item, explanation) {
  const keyText = Array.isArray(item?.op) ? item.op[item.ai] : '';
  const words = contentWords(keyText)?.filter((word) => !TOPIC_STOPWORDS.has(word)) || [];
  if (words.length === 0) return true;
  const text = String(explanation || '').toLowerCase();
  return words.some((word) => text.includes(word));
}

function needsMcExplanationPolish(item) {
  const explanation = String(item?.ex || '').trim();
  if (explanation.length < MC_EXPLANATION_MIN_LENGTH) return true;
  if (!MC_EXPLANATION_CAUSAL_PATTERN.test(explanation)) return true;
  return !explanationMentionsKey(item, explanation);
}

function mcExplanationSchema(count) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      ex: {
        type: 'array',
        items: { type: 'string', minLength: MC_EXPLANATION_MIN_LENGTH, maxLength: 300 },
        minItems: count,
        maxItems: count,
      },
    },
    required: ['ex'],
  };
}

async function polishMcExplanations(lesson, generateJson, events) {
  const items = Array.isArray(lesson?.mc) ? lesson.mc : [];
  if (items.length === 0) return;
  if (!items.some(needsMcExplanationPolish)) return;
  try {
    const reply = await generateJson({
      system:
        'You improve quiz answer explanations. For each item, write ONE self-contained sentence teaching WHY the keyed option is correct, in subject terms a student reading alone understands. Never contradict the key. Return ONLY {"ex":[...]} in item order.',
      user: JSON.stringify(items.map((item) => ({ q: item.q, op: item.op, ai: item.ai, currentEx: item.ex }))),
      schemaProfile: { name: 'mc_explanations', schema: mcExplanationSchema(items.length), strict: true },
      maxOutputTokens: 1600,
    });
    const fresh = JSON.parse(reply)?.ex;
    if (!Array.isArray(fresh) || fresh.length !== items.length) return;
    let changed = 0;
    for (const [index, item] of items.entries()) {
      const next = String(fresh[index] || '').trim();
      if (next.length < MC_EXPLANATION_MIN_LENGTH || next === item.ex) continue;
      item.ex = next;
      changed += 1;
    }
    if (changed > 0) events.push({ pass: 'mcExplanationPolish', lessonId: lesson.lessonId, action: 'done', changed });
  } catch {
    /* explanations ship unchanged */
  }
}

const POLISH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scenario: {
      type: 'object',
      additionalProperties: false,
      properties: {
        su: { type: 'string', minLength: 45, maxLength: 500 },
        ma: { type: 'string', minLength: 10, maxLength: 300 },
      },
      required: ['su', 'ma'],
    },
    discussionPrompt: {
      type: 'object',
      additionalProperties: false,
      properties: {
        pr: { type: 'string', minLength: 20, maxLength: 300 },
        tn: { type: 'string', minLength: 12, maxLength: 300 },
        po: { type: 'array', items: { type: 'string', minLength: 8, maxLength: 200 }, minItems: 2, maxItems: 3 },
      },
      required: ['pr', 'tn', 'po'],
    },
    assignmentCore: {
      type: 'object',
      additionalProperties: false,
      properties: {
        td: { type: 'string', minLength: 45, maxLength: 500 },
        pa: { type: 'array', items: { type: 'string', minLength: 8, maxLength: 160 }, minItems: 2, maxItems: 4 },
      },
      required: ['td', 'pa'],
    },
    studyGuide: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sm: { type: 'string', minLength: 70, maxLength: 550 },
        rs: { type: 'string', minLength: 35, maxLength: 380 },
      },
      required: ['sm', 'rs'],
    },
  },
  required: POLISH_FIELDS,
};

/** Self-refine the wordy prose atoms; content pinned by the length band. */
async function polishProse(lesson, generateJson, events) {
  if (!POLISH_FIELDS.every((field) => lesson?.[field])) return;
  const fields = Object.fromEntries(POLISH_FIELDS.map((field) => [field, lesson[field]]));
  try {
    const reply = await generateJson({
      system:
        'You are a veteran professor polishing draft course text. Rewrite each value MINIMALLY so it reads as natural, confident teaching prose — one voice, plain sentences, no filler. NEVER change technical content, terms, numbers, or the meaning; never add new claims. Return ONLY the JSON object with the same shape.',
      user: JSON.stringify(fields),
      schemaProfile: { name: 'prose_polish', schema: POLISH_SCHEMA, strict: true },
      maxOutputTokens: 4000,
    });
    const polished = JSON.parse(reply);
    for (const field of POLISH_FIELDS) {
      const before = JSON.stringify(fields[field] ?? '');
      const after = JSON.stringify(polished[field] ?? '');
      if (after.length >= before.length * 0.6 && after.length <= before.length * 1.4) {
        lesson[field] = polished[field];
      }
    }
    events.push({ pass: 'polish', lessonId: lesson.lessonId, action: 'done' });
  } catch {
    /* draft ships unchanged */
  }
}

/**
 * Apply all Scion passes to a raw Pass B batch response.
 * @param {string} rawText the model's batch JSON
 * @param {object} options { promptLessons, generateJson, contentSourcedLessonIds }
 * @returns {{ text: string, events: Array }}
 */
export async function applyScionKernelPasses(
  rawText,
  { promptLessons = [], generateJson, contentSourcedLessonIds = [] } = {},
) {
  let parsed = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { text: rawText, events: [] };
  }
  const lessons = Array.isArray(parsed?.lessons) ? parsed.lessons : [];
  if (lessons.length === 0 || typeof generateJson !== 'function') return { text: rawText, events: [] };
  const contentSourced = new Set(contentSourcedLessonIds);
  const events = [];
  for (const lesson of lessons) {
    if (contentSourced.has(lesson?.lessonId)) continue; // library content — never touched
    const promptLesson = promptLessons.find((entry) => entry?.lessonId === lesson?.lessonId) ?? null;
    await verifyMcAnswers(lesson, promptLesson, generateJson, events);
    await topicGate(lesson, promptLesson, generateJson, events);
    await polishMcExplanations(lesson, generateJson, events);
    await polishProse(lesson, generateJson, events);
  }
  return { text: JSON.stringify(parsed), events };
}
