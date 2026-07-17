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
// Infrastructure failures are best-effort. An item independently confirmed
// invalid twice is different: it is repaired or quarantined, never trusted.

import { assessScionKeyTerm, assessScionMcItem } from './scionPreferenceGate.js';
import { isAppliedQuizStem } from './quality/quizItemDepth.js';

const APPLIED_MCQ_TARGET_PER_LESSON = 2;
const INVALID_MC_ANSWER = '__INVALID_OR_AMBIGUOUS__';
const INVALID_MC_ANSWER_INDEX = -1;

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

// These words can make a stem look evidence-based without carrying any of the
// scenario's actual information. They cannot satisfy the grounding contract.
const GENERIC_GROUNDING_WORDS = new Set([
  ...TOPIC_STOPWORDS,
  'above',
  'and',
  'below',
  'claim',
  'evidence',
  'excerpt',
  'given',
  'must',
  'lines',
  'material',
  'materials',
  'notes',
  'provided',
  'question',
  'scenario',
  'short',
  'shows',
  'showing',
  'staff',
  'the',
  'they',
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

function groundingWords(lesson = {}) {
  const scenario = lesson?.scenario || {};
  return [
    ...new Set(`${scenario.su || ''} ${scenario.ma || ''}`.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) || []),
  ].filter((word) => !GENERIC_GROUNDING_WORDS.has(word));
}

function matchingGroundingWords(stem, words) {
  const value = String(stem || '').toLowerCase();
  return words.filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(value));
}

function normalizeRepairedStem(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!](['’"])\?$/, '$1?');
}

function completeSentencePrefix(value) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/[.!?][\])}"']?$/.test(text)) return text;
  const matches = [...text.matchAll(/[.!?](?=\s|$)/g)];
  const end = matches.at(-1)?.index;
  return Number.isInteger(end) && end >= 19 ? text.slice(0, end + 1) : text;
}

function normalizeOptionLabels(options) {
  return Array.isArray(options)
    ? options.map((option) =>
        String(option || '')
          .replace(/^\s*[A-D][.)]\s+/i, '')
          .trim(),
      )
    : options;
}

function normalizeMcOptionLabels(lesson) {
  for (const item of Array.isArray(lesson?.mc) ? lesson.mc : []) {
    if (!Array.isArray(item?.op)) continue;
    item.op = normalizeOptionLabels(item.op);
  }
}

async function blindSolve(items, generateJson) {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      answers: {
        type: 'array',
        prefixItems: items.map((item) => ({
          type: 'string',
          enum: [...normalizeOptionLabels(item.op), INVALID_MC_ANSWER],
        })),
        items: false,
        minItems: items.length,
        maxItems: items.length,
      },
    },
    required: ['answers'],
  };
  const reply = await generateJson({
    system: `You are validating a quiz cold, without seeing its answer key or explanation. For each question, copy the exact text of the ONE uniquely supported option. Return ${INVALID_MC_ANSWER} when the stem lacks necessary facts, no option is supported, multiple options are defensible, or the requested causal/inferential claim is not established. Do not choose a merely least-wrong option. Return no labels, indices, or explanations.`,
    user: JSON.stringify(items.map((item) => ({ q: item.q, op: item.op }))),
    schemaProfile: { name: 'blind_solve', schema, strict: true },
    maxOutputTokens: 200,
  });
  const parsed = JSON.parse(reply)?.answers;
  if (!Array.isArray(parsed) || parsed.length !== items.length) return null;
  const normalized = parsed.map((answer, index) => {
    // Numeric answers remain accepted for stored probes and older compatible
    // endpoints, but the live schema constrains new solves to exact option
    // text so weak models do not have to translate a proposition into an
    // error-prone zero-based index.
    if (answer === INVALID_MC_ANSWER) return INVALID_MC_ANSWER_INDEX;
    if (Number.isInteger(answer) && answer >= 0 && answer <= 3) return answer;
    const value = String(answer || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const optionIndex = normalizeOptionLabels(items[index]?.op).findIndex(
      (option) =>
        String(option || '')
          .normalize('NFKC')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim() === value,
    );
    return optionIndex >= 0 ? optionIndex : null;
  });
  return normalized.every(
    (answer) => answer === INVALID_MC_ANSWER_INDEX || (Number.isInteger(answer) && answer >= 0 && answer <= 3),
  )
    ? normalized
    : null;
}

async function generateVerifiedReplacementBatch({ targets, promptLesson, topicTokens = [], generateJson }) {
  const accepted = new Map();
  let pending = [...targets];
  for (let attempt = 1; attempt <= 2 && pending.length > 0; attempt += 1) {
    const indices = pending.map(({ index }) => index);
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        repairs: {
          type: 'array',
          minItems: pending.length,
          maxItems: pending.length,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { index: { type: 'integer', enum: indices }, ...MC_ITEM_SCHEMA.properties },
            required: ['index', ...MC_ITEM_SCHEMA.required],
          },
        },
      },
      required: ['repairs'],
    };
    const system =
      'You write flawless quiz items. Replace every faulty multiple-choice item that two blind validators found invalid, ambiguous, or incorrectly keyed. Preserve each listed concept and difficulty; test ONLY the listed lesson topics. Supply every fact needed by the stem, make exactly one option defensible, and ensure every answer key (ai) is verifiably correct. Return only JSON.';
    const user = JSON.stringify({
      lesson: promptLesson || null,
      attempt,
      faultyItems: pending.map(({ item, index }) => ({ index, item })),
    });
    try {
      const reply = await generateJson({
        system,
        user,
        schemaProfile: { name: 'mc_verify_repair_batch', schema, strict: true },
        maxOutputTokens: Math.max(1800, pending.length * 650),
        temperature: 0.7,
      });
      const repairs = JSON.parse(reply)?.repairs;
      if (!Array.isArray(repairs)) continue;
      const byIndex = new Map(repairs.map((repair) => [repair?.index, repair]));
      const candidates = pending
        .map((target) => {
          const repair = byIndex.get(target.index);
          if (!repair) return null;
          const fresh = {
            q: normalizeRepairedStem(repair.q),
            op: normalizeOptionLabels(repair.op),
            ai: repair.ai,
            ex: completeSentencePrefix(repair.ex),
          };
          const admission = assessScionMcItem(fresh, { topicWords: topicTokens, semanticProfile: 'strict' });
          return admission.eligible ? { ...target, fresh, admission } : null;
        })
        .filter(Boolean);
      if (candidates.length === 0) continue;
      const first = await blindSolve(
        candidates.map(({ fresh }) => fresh),
        generateJson,
      ).catch(() => null);
      const second = await blindSolve(
        candidates.map(({ fresh }) => fresh),
        generateJson,
      ).catch(() => null);
      if (!first || !second) continue;
      candidates.forEach((candidate, candidateIndex) => {
        const expected = Number(candidate.fresh.ai);
        const answers = [first[candidateIndex], second[candidateIndex]];
        if (!Number.isInteger(expected) || !answers.every((answer) => answer === expected)) return;
        accepted.set(candidate.index, {
          ...candidate,
          prompt: `System: ${system}\nUser: ${user}`,
          keyVerification: { verified: true, answers },
          attempt,
        });
      });
      pending = pending.filter(({ index }) => !accepted.has(index));
    } catch {
      /* retry only the still-unverified seats once */
    }
  }
  return accepted;
}

/**
 * Verify a lesson's mc answer keys by blind re-solving; regenerate an item
 * only when TWO independent blind solves agree on the same non-key answer
 * or both independently abstain because the item is invalid/ambiguous
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
  if (!second) return;
  const targets = items
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => disagreements[index] && second[index] === first[index]);
  if (targets.length === 0) return;
  const replacements = await generateVerifiedReplacementBatch({
    targets,
    promptLesson,
    generateJson,
  });
  for (const { item, index } of targets) {
    const replacement = replacements.get(index);
    if (!replacement) {
      // A twice-confirmed bad item must not silently survive because repair
      // generation failed. Quarantine the seat; the following admission gate
      // gets one bounded chance to backfill it, and projection drops a null if
      // even that independently verified repair cannot be earned.
      items[index] = null;
      events.push({
        pass: 'mcVerify',
        lessonId: lesson.lessonId,
        item: index,
        action: 'quarantined',
        reason:
          first[index] === INVALID_MC_ANSWER_INDEX
            ? 'double-blind-invalid-or-ambiguous'
            : 'double-blind-key-disagreement',
        rejected: item,
        trainingEligible: false,
      });
      continue;
    }
    const { fresh, prompt, keyVerification, attempt } = replacement;
    events.push({
      pass: 'mcVerify',
      lessonId: lesson.lessonId,
      item: index,
      action: 'regenerated',
      rejected: item,
      chosen: fresh,
      prompt,
      trainingEligible: true,
      preferenceEvidence: {
        kind: first[index] === INVALID_MC_ANSWER_INDEX ? 'double-blind-validity-repair' : 'double-blind-key-repair',
        verified: true,
        rejectedAnswers: [first[index], second[index]],
        chosenAnswers: keyVerification.answers,
        attempt,
      },
    });
    items[index] = fresh;
  }
}

/** Regenerate items that share zero vocabulary with the lesson's own topics. */
async function topicGate(lesson, promptLesson, generateJson, events) {
  const items = Array.isArray(lesson?.mc) ? lesson.mc : [];
  const words = topicWords(promptLesson);
  if (items.length === 0 || words.length === 0) return;
  const targets = items.map((item, index) => ({ item, index })).filter(({ item }) => item && !onTopic(item, words));
  if (targets.length === 0) return;
  const indices = targets.map(({ index }) => index);
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      repairs: {
        type: 'array',
        minItems: targets.length,
        maxItems: targets.length,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: { index: { type: 'integer', enum: indices }, ...MC_ITEM_SCHEMA.properties },
          required: ['index', ...MC_ITEM_SCHEMA.required],
        },
      },
    },
    required: ['repairs'],
  };
  const system =
    'You repair multiple-choice items that remain off-topic after the main admission pass. Test ONLY the listed lesson topics at the same difficulty. Write a complete stem, exactly four parallel options without A/B/C/D labels, one uniquely correct answer, and a complete contrastive explanation. Avoid meta-language, unsupported inference, trailing fragments, and answer cues. Return only JSON.';
  const user = JSON.stringify({
    lesson: promptLesson || null,
    topics: words,
    items: targets.map(({ item, index }) => ({ index, item })),
  });
  try {
    const reply = await generateJson({
      system,
      user,
      schemaProfile: { name: 'topic_repair_batch', schema, strict: true },
      maxOutputTokens: Math.max(1800, targets.length * 650),
      temperature: 0.5,
    });
    const repairs = JSON.parse(reply)?.repairs;
    if (!Array.isArray(repairs)) return;
    const byIndex = new Map(repairs.map((repair) => [repair?.index, repair]));
    const candidates = targets
      .map(({ item, index }) => {
        const repair = byIndex.get(index);
        if (!repair) {
          events.push({
            pass: 'topicGate',
            lessonId: lesson.lessonId,
            item: index,
            action: 'rejected',
            reason: 'missing-repair',
          });
          return null;
        }
        const fresh = {
          q: normalizeRepairedStem(repair.q),
          op: normalizeOptionLabels(repair.op),
          ai: repair.ai,
          ex: completeSentencePrefix(repair.ex),
        };
        const admission = assessScionMcItem(fresh, { topicWords: words, semanticProfile: 'strict' });
        if (!admission.eligible || !onTopic(fresh, words)) {
          events.push({
            pass: 'topicGate',
            lessonId: lesson.lessonId,
            item: index,
            action: 'rejected',
            reason: [...new Set([...admission.issues, ...(!onTopic(fresh, words) ? ['off-topic'] : [])])].join(','),
            draft: fresh,
          });
          return null;
        }
        return { fresh, item, index };
      })
      .filter(Boolean);
    if (candidates.length === 0) return;
    const first = await blindSolve(
      candidates.map(({ fresh }) => fresh),
      generateJson,
    ).catch(() => null);
    const second = await blindSolve(
      candidates.map(({ fresh }) => fresh),
      generateJson,
    ).catch(() => null);
    if (!first || !second) return;
    candidates.forEach(({ fresh, item, index }, candidateIndex) => {
      const expected = Number(fresh.ai);
      if (first[candidateIndex] !== expected || second[candidateIndex] !== expected) {
        events.push({
          pass: 'topicGate',
          lessonId: lesson.lessonId,
          item: index,
          action: 'rejected',
          reason: `key-verification:${first[candidateIndex]},${second[candidateIndex]}!=${expected}`,
        });
        return;
      }
      items[index] = fresh;
      events.push({
        pass: 'topicGate',
        lessonId: lesson.lessonId,
        item: index,
        action: 'regenerated',
        rejected: item,
        chosen: fresh,
        prompt: `System: ${system}\nUser: ${user}`,
        trainingEligible: true,
        preferenceEvidence: {
          kind: 'topic-and-key-repair',
          verified: true,
          chosenAnswers: [first[candidateIndex], second[candidateIndex]],
          attempt: 1,
        },
      });
    });
  } catch {
    events.push({ pass: 'topicGate', lessonId: lesson.lessonId, action: 'failed', reason: 'generation-or-parse' });
  }
}

/**
 * Replace atoms that the canonical admission boundary would otherwise drop.
 * This is a coverage gate, not cosmetic polish: each accepted replacement is
 * contract-clean and independently solved twice before it can occupy a quiz
 * seat or enter the preference corpus.
 */
async function admissionGate(lesson, promptLesson, generateJson, events, expectedMcCount = 0) {
  const items = Array.isArray(lesson?.mc) ? lesson.mc : [];
  const topicTokens = topicWords(promptLesson);
  const targets = items
    .map((item, index) => ({
      item,
      index,
      admission: item
        ? assessScionMcItem(item, { topicWords: topicTokens, semanticProfile: 'strict' })
        : { eligible: false, issues: ['missing-item'], score: 0 },
    }))
    .filter(({ admission }) => !admission.eligible);
  for (let index = items.length; index < expectedMcCount; index += 1) {
    targets.push({ item: null, index, admission: { eligible: false, issues: ['missing-item'], score: 0 } });
  }
  if (targets.length === 0) return;
  const indices = targets.map(({ index }) => index);
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      repairs: {
        type: 'array',
        minItems: targets.length,
        maxItems: targets.length,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            index: { type: 'integer', enum: indices },
            ...MC_ITEM_SCHEMA.properties,
          },
          required: ['index', ...MC_ITEM_SCHEMA.required],
        },
      },
    },
    required: ['repairs'],
  };
  const system =
    'You repair or backfill multiple-choice seats that would otherwise be missing after a strict admission gate. Author each complete item from the listed lesson topics; when an original exists, test the same concept at the same cognitive level. Use exactly four parallel, plausible options of 5-80 characters; make one answer uniquely correct; write a complete stem of 50-180 characters and a complete one- or two-sentence explanation of 60-180 characters. Avoid answer cues, meta-language, unsupported inference, ellipses, and trailing fragments. Return only JSON.';
  const user = JSON.stringify({
    lesson: promptLesson || null,
    repairs: targets.map(({ item, index, admission }) => ({ index, issues: admission.issues, item })),
  });
  try {
    const reply = await generateJson({
      system,
      user,
      schemaProfile: { name: 'mc_admission_batch', schema, strict: true },
      maxOutputTokens: Math.max(1800, targets.length * 650),
      temperature: 0.4,
    });
    const repairs = JSON.parse(reply)?.repairs;
    if (!Array.isArray(repairs)) return;
    const byIndex = new Map(repairs.map((repair) => [repair?.index, repair]));
    const candidates = targets
      .map(({ item, index, admission: rejectedAdmission }) => {
        const repair = byIndex.get(index);
        if (!repair) {
          events.push({
            pass: 'admissionGate',
            lessonId: lesson.lessonId,
            item: index,
            action: 'rejected',
            reason: 'missing-repair',
          });
          return null;
        }
        const fresh = {
          q: normalizeRepairedStem(repair.q),
          op: normalizeOptionLabels(repair.op),
          ai: repair.ai,
          ex: completeSentencePrefix(repair.ex),
        };
        const admission = assessScionMcItem(fresh, { topicWords: topicTokens, semanticProfile: 'strict' });
        if (!admission.eligible) {
          events.push({
            pass: 'admissionGate',
            lessonId: lesson.lessonId,
            item: index,
            action: 'rejected',
            reason: admission.issues.join(','),
            draft: fresh,
          });
          return null;
        }
        return { fresh, item, index, rejectedAdmission };
      })
      .filter(Boolean);
    if (candidates.length === 0) return;
    const first = await blindSolve(
      candidates.map(({ fresh }) => fresh),
      generateJson,
    ).catch(() => null);
    const second = await blindSolve(
      candidates.map(({ fresh }) => fresh),
      generateJson,
    ).catch(() => null);
    if (!first || !second) return;
    candidates.forEach(({ fresh, item, index, rejectedAdmission }, candidateIndex) => {
      const expected = Number(fresh.ai);
      if (first[candidateIndex] !== expected || second[candidateIndex] !== expected) {
        events.push({
          pass: 'admissionGate',
          lessonId: lesson.lessonId,
          item: index,
          action: 'rejected',
          reason: `key-verification:${first[candidateIndex]},${second[candidateIndex]}!=${expected}`,
        });
        return;
      }
      items[index] = fresh;
      events.push({
        pass: 'admissionGate',
        lessonId: lesson.lessonId,
        item: index,
        action: 'regenerated',
        rejected: item,
        chosen: fresh,
        prompt: `System: ${system}\nUser: ${user}`,
        trainingEligible: Boolean(item),
        ...(item
          ? {
              preferenceEvidence: {
                kind: 'admission-and-key-repair',
                verified: true,
                rejectedIssues: rejectedAdmission.issues,
                chosenAnswers: [first[candidateIndex], second[candidateIndex]],
              },
            }
          : {}),
      });
    });
  } catch {
    events.push({ pass: 'admissionGate', lessonId: lesson.lessonId, action: 'failed', reason: 'generation-or-parse' });
  }
}

/**
 * Preserve each named concept while repairing malformed definition/example/
 * misconception/correction atoms before the parser can drop them. These
 * structural repairs ship only; they are not preference data because there
 * is no independent semantic verifier for an open-ended definition.
 */
async function keyTermAdmissionGate(lesson, promptLesson, generateJson, events, minimumKeyTermCount = 0) {
  if (!Array.isArray(lesson?.keyTerms)) return;
  const terms = lesson.keyTerms;
  const knownFacts = (Array.isArray(lesson?.facts) ? lesson.facts : [])
    .map((fact) => (typeof fact === 'string' ? fact : fact?.text || fact?.tx || ''))
    .filter(Boolean);
  const assessed = terms.map((term, index) => ({
    term,
    index,
    result: assessScionKeyTerm(term, {
      lessonTitle: promptLesson?.title,
      knownFacts,
      semanticProfile: 'source-strict',
    }),
  }));
  const targets = assessed.filter(({ result }) => !result.eligible);
  for (let index = terms.length; index < minimumKeyTermCount; index += 1) {
    targets.push({ term: null, index, result: { eligible: false, issues: ['missing-term'], score: 0 } });
  }
  if (targets.length === 0) return;
  const indices = targets.map(({ index }) => index);
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      repairs: {
        type: 'array',
        minItems: targets.length,
        maxItems: targets.length,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            index: { type: 'integer', enum: indices },
            tr: { type: 'string', minLength: 3, maxLength: 60 },
            df: { type: 'string', minLength: 45, maxLength: 380 },
            eg: { type: 'string', minLength: 12, maxLength: 300 },
            mi: { type: 'string', minLength: 12, maxLength: 300 },
            cx: { type: 'string', minLength: 12, maxLength: 300 },
          },
          required: ['index', 'tr', 'df', 'eg', 'mi', 'cx'],
        },
      },
    },
    required: ['repairs'],
  };
  const system =
    'You repair or backfill key-term atoms for the listed lesson. Preserve an existing source-grounded disciplinary concept name; when the term is missing, invalid, or absent from the supplied facts, replace it with a precise concept explicitly named by those facts. For each term, write a precise disciplinary definition, concrete example, plausible misconception, and correction that directly resolves that misconception. Do not repeat the term name in the first six words of its definition. Use complete concise sentences and return only JSON.';
  const user = JSON.stringify({
    lesson: promptLesson || null,
    facts: lesson.facts || [],
    terms: targets.map(({ term, index, result }) => ({ index, term, issues: result.issues })),
  });
  try {
    const reply = await generateJson({
      system,
      user,
      schemaProfile: { name: 'key_term_admission_batch', schema, strict: true },
      maxOutputTokens: Math.max(1600, targets.length * 500),
      temperature: 0.35,
    });
    const repairs = JSON.parse(reply)?.repairs;
    if (!Array.isArray(repairs)) return;
    const byIndex = new Map(repairs.map((repair) => [repair?.index, repair]));
    const topicTokens = topicWords(promptLesson);
    targets.forEach(({ term, index, result }) => {
      const repair = byIndex.get(index);
      if (!repair) {
        events.push({
          pass: 'keyTermAdmission',
          lessonId: lesson.lessonId,
          item: index,
          action: 'rejected',
          reason: 'missing-repair',
        });
        return;
      }
      const mayRename =
        !term ||
        result.issues.some((issue) =>
          ['tr-length', 'term-is-lesson-title', 'term-not-source-anchored'].includes(issue),
        );
      const fresh = {
        ...term,
        tr: mayRename ? repair.tr : term.tr,
        df: completeSentencePrefix(repair.df),
        eg: completeSentencePrefix(repair.eg),
        mi: completeSentencePrefix(repair.mi),
        cx: completeSentencePrefix(repair.cx),
      };
      const admission = assessScionKeyTerm(fresh, {
        lessonTitle: promptLesson?.title,
        knownFacts,
        semanticProfile: 'source-strict',
      });
      const duplicate = terms.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          String(other?.tr || '')
            .trim()
            .toLowerCase() ===
            String(fresh.tr || '')
              .trim()
              .toLowerCase(),
      );
      const combined = Object.values(fresh).join(' ').toLowerCase();
      const onLessonTopic = topicTokens.length === 0 || topicTokens.some((token) => combined.includes(token));
      if (!admission.eligible || duplicate || !onLessonTopic) {
        events.push({
          pass: 'keyTermAdmission',
          lessonId: lesson.lessonId,
          item: index,
          action: 'rejected',
          reason: [
            ...admission.issues,
            ...(duplicate ? ['duplicate-term'] : []),
            ...(!onLessonTopic ? ['off-topic'] : []),
          ].join(','),
          draft: fresh,
        });
        return;
      }
      terms[index] = fresh;
      events.push({
        pass: 'keyTermAdmission',
        lessonId: lesson.lessonId,
        item: index,
        action: 'regenerated',
        rejected: term,
        chosen: fresh,
        trainingEligible: false,
      });
    });
  } catch {
    events.push({
      pass: 'keyTermAdmission',
      lessonId: lesson.lessonId,
      action: 'failed',
      reason: 'generation-or-parse',
    });
  }
}

/**
 * Rewrite the non-Remember MC seats around the lesson's admitted scenario.
 * Options, answer indices, and admitted explanations are immutable: the pass
 * may improve the evidence students reason from, but it cannot silently swap
 * the tested proposition or hallucinate a new rationale.
 * Accepted repairs pass deterministic depth/topic/admission gates and two
 * independent cold solves, making the pair eligible for the verified corpus.
 */
async function appliedDepthGate(lesson, promptLesson, generateJson, events) {
  const items = Array.isArray(lesson?.mc) ? lesson.mc : [];
  const topicTokens = topicWords(promptLesson);
  const desiredAppliedCount = Math.min(APPLIED_MCQ_TARGET_PER_LESSON, items.length);
  const existingAppliedCount = items.filter((item) => isAppliedQuizStem(item?.q)).length;
  const neededRepairs = Math.max(0, desiredAppliedCount - existingAppliedCount);
  const targets = items
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item, index }) =>
        item &&
        index > 0 &&
        !isAppliedQuizStem(item?.q) &&
        assessScionMcItem(item, { topicWords: topicTokens, semanticProfile: 'strict' }).eligible,
    )
    .slice(0, neededRepairs);
  const grounding = groundingWords(lesson);
  if (targets.length === 0 || grounding.length === 0) return;
  const indices = targets.map(({ index }) => index);
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      repairs: {
        type: 'array',
        minItems: targets.length,
        maxItems: targets.length,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            index: { type: 'integer', enum: indices },
            q: { type: 'string', minLength: 45, maxLength: 300 },
          },
          required: ['index', 'q'],
        },
      },
    },
    required: ['repairs'],
  };
  const system =
    'You repair multiple-choice depth without changing what is correct. Rewrite ONLY each stem so students must inspect the supplied scenario evidence before choosing. Include at least TWO distinctive facts from the supplied scenario (such as its actor, instrument, named artifact, measured value, or observed detail); merely saying scenario, excerpt, evidence, staff, notes, or materials is not grounding. Every option, answer index, and explanation is immutable. Never repeat option text, answer labels, or the correct answer in the stem. Use an open reasoning frame such as "Based on these observations, which response..." or "What is the most likely outcome/risk/impact...?" The evidence must make the existing key uniquely defensible. Write ONE complete question of 80-190 characters per repair and end it with a question mark. Never turn the answer into a statement, trail off, use an ellipsis, or approach the schema length limit. Return only JSON.';
  const user = JSON.stringify({
    lesson: promptLesson || null,
    scenario: lesson.scenario,
    items: targets.map(({ item, index }) => ({ index, q: item.q, op: item.op, ai: item.ai, ex: item.ex })),
  });
  try {
    const reply = await generateJson({
      system,
      user,
      schemaProfile: { name: 'applied_mc_batch', schema, strict: true },
      maxOutputTokens: 2200,
      temperature: 0.4,
    });
    const repairs = JSON.parse(reply)?.repairs;
    if (!Array.isArray(repairs)) return;
    const byIndex = new Map(repairs.map((repair) => [repair?.index, repair]));
    const candidates = targets
      .map(({ item, index }) => {
        const repair = byIndex.get(index);
        if (!repair) {
          events.push({
            pass: 'appliedDepth',
            lessonId: lesson.lessonId,
            item: index,
            action: 'rejected',
            reason: 'missing-repair',
          });
          return null;
        }
        const fresh = { ...item, q: normalizeRepairedStem(repair.q) };
        const admission = assessScionMcItem(fresh, { topicWords: topicTokens, semanticProfile: 'strict' });
        const matchedGrounding = matchingGroundingWords(fresh.q, grounding);
        const reasons = [
          ...admission.issues,
          ...(!isAppliedQuizStem(fresh.q) ? ['not-applied'] : []),
          ...(matchedGrounding.length < 2 ? ['not-distinctively-scenario-grounded'] : []),
          ...(!onTopic(fresh, topicTokens) ? ['off-topic'] : []),
        ];
        if (reasons.length > 0) {
          events.push({
            pass: 'appliedDepth',
            lessonId: lesson.lessonId,
            item: index,
            action: 'rejected',
            reason: [...new Set(reasons)].join(','),
            draft: fresh,
          });
          return null;
        }
        return { fresh, item, index, admission, matchedGrounding };
      })
      .filter(Boolean);
    if (candidates.length === 0) return;
    const first = await blindSolve(
      candidates.map(({ fresh }) => fresh),
      generateJson,
    ).catch(() => null);
    const second = await blindSolve(
      candidates.map(({ fresh }) => fresh),
      generateJson,
    ).catch(() => null);
    if (!first || !second) return;
    candidates.forEach(({ fresh, item, index, admission, matchedGrounding }, candidateIndex) => {
      const expected = Number(fresh.ai);
      if (first[candidateIndex] !== expected || second[candidateIndex] !== expected) {
        events.push({
          pass: 'appliedDepth',
          lessonId: lesson.lessonId,
          item: index,
          action: 'rejected',
          reason: `key-verification:${first[candidateIndex]},${second[candidateIndex]}!=${expected}`,
        });
        return;
      }
      items[index] = fresh;
      events.push({
        pass: 'appliedDepth',
        lessonId: lesson.lessonId,
        item: index,
        action: 'regenerated',
        rejected: item,
        chosen: fresh,
        prompt: `System: ${system}\nUser: ${user}`,
        trainingEligible: true,
        preferenceEvidence: {
          kind: 'applied-depth-and-key-repair',
          verified: true,
          rejectedApplied: false,
          chosenApplied: true,
          chosenAnswers: [first[candidateIndex], second[candidateIndex]],
          groundingTokens: matchedGrounding.slice(0, 8),
          admissionIssues: admission.issues,
        },
      });
    });
  } catch {
    events.push({ pass: 'appliedDepth', lessonId: lesson.lessonId, action: 'failed', reason: 'generation-or-parse' });
  }
}

const POLISH_FIELDS = ['scenario', 'discussionPrompt', 'assignmentCore', 'studyGuide'];
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
        po: { type: 'array', items: { type: 'string', minLength: 8, maxLength: 200 }, minItems: 3, maxItems: 3 },
      },
      required: ['pr', 'tn', 'po'],
    },
    assignmentCore: {
      type: 'object',
      additionalProperties: false,
      properties: {
        td: { type: 'string', minLength: 45, maxLength: 500 },
        pa: { type: 'array', items: { type: 'string', minLength: 8, maxLength: 160 }, minItems: 4, maxItems: 4 },
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
 * @param {object} options { promptLessons, generateJson, contentSourcedLessonIds, expectedMcCount, minimumKeyTermCount }
 * @returns {{ text: string, events: Array }}
 */
export async function applyScionKernelPasses(
  rawText,
  { promptLessons = [], generateJson, contentSourcedLessonIds = [], expectedMcCount = 0, minimumKeyTermCount = 0 } = {},
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

  // Scion Pass B is intentionally a one-lesson call. Small local models can
  // still omit the identifier even though the schema pins it. Recover only
  // when both sides are unambiguous; never guess across a batch.
  if (
    lessons.length === 1 &&
    promptLessons.length === 1 &&
    !lessons[0]?.lessonId &&
    typeof promptLessons[0]?.lessonId === 'string' &&
    promptLessons[0].lessonId.trim()
  ) {
    lessons[0].lessonId = promptLessons[0].lessonId;
    events.push({
      pass: 'identityRepair',
      lessonId: lessons[0].lessonId,
      action: 'inferred',
      reason: 'single-lesson-call',
      trainingEligible: false,
    });
  }

  for (const lesson of lessons) {
    if (contentSourced.has(lesson?.lessonId)) continue; // library content — never touched
    normalizeMcOptionLabels(lesson);
    const promptLesson = promptLessons.find((entry) => entry?.lessonId === lesson?.lessonId) ?? null;
    await verifyMcAnswers(lesson, promptLesson, generateJson, events);
    await admissionGate(lesson, promptLesson, generateJson, events, expectedMcCount);
    await topicGate(lesson, promptLesson, generateJson, events);
    await appliedDepthGate(lesson, promptLesson, generateJson, events);
    await keyTermAdmissionGate(lesson, promptLesson, generateJson, events, minimumKeyTermCount);
    await polishProse(lesson, generateJson, events);
    // A bounded replacement can arrive after the initial normalization. Keep
    // exporter-owned A/B/C/D labels out of the stored options regardless of
    // which repair pass authored the final item.
    normalizeMcOptionLabels(lesson);
  }
  return { text: JSON.stringify(parsed), events };
}
