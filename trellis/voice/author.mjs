// Live authoring — docs/TRELLIS.md §14.3. One consolidated call per lesson
// (D2; the −36%/−22% consolidation lesson), schema-validated with retry
// feedback from validateAuthoredLesson. Slice assembly is pure and tested;
// this module owns only the prompt and the call.
//
// Cost/speed optimizations (attempt-4 ledger analysis): (1) the claims.ref
// enum is built per lesson from the slice's LEGAL refs, so a hallucinated
// citation is grammatically impossible (kills the J5 class at the source);
// (2) explanations must QUOTE the corrective verbatim, which satisfies J3's
// substring check by construction (first-pass compliance instead of repair
// rounds — repair was 53–59% of live spend); (3) authoring batches of 6.

import { callModel } from '../providers.mjs';
import {
  AUTHORED_LESSON_SCHEMA,
  COURSE_WIDE_SCHEMA,
  buildLessonSlice,
  validateAuthoredLesson,
  validateCourseWide,
} from './contracts.mjs';

export function legalRefsForSlice(slice) {
  return [
    ...slice.concepts.map((c) => `kernel:${c.id}`),
    ...slice.concepts.flatMap((c) => c.misconceptions.map((m) => `misconception:${m.id}`)),
    ...slice.sources.map((s) => `source:${s.id}`),
  ];
}

// Deep-clone the contract schema and pin claims.ref to the slice's legal
// refs (+ null). Strict mode grammar-enforces the enum.
export function lessonSchemaForSlice(slice) {
  const schema = structuredClone(AUTHORED_LESSON_SCHEMA);
  schema.properties.claims.items.properties.ref = {
    type: ['string', 'null'],
    enum: [...legalRefsForSlice(slice), null],
  };
  return schema;
}

function lessonSystemPrompt(slice) {
  const correctives = slice.concepts.flatMap((c) => c.misconceptions.map((m) => m.corrective));
  return (
    `You are the course's own instructor writing week ${slice.lesson.week} of "${slice.course.title}" (${slice.course.level} ${slice.course.subject}). ` +
    `Author ALL student-facing content for this lesson as JSON matching the provided schema. Non-negotiables:\n` +
    `- Every factual claim must trace to the kernel facts provided; do not invent facts, citations, or readings.\n` +
    `- Quiz items: exactly ${slice.constraints.quizItems} items, 4 options each, application/transfer stems preferred over recall; use the documented misconceptions as distractors; VARY correctIndex across items.\n` +
    `- Slides: between ${slice.constraints.slides[0]} and ${slice.constraints.slides[1]} slides — count them before returning; fewer than ${slice.constraints.slides[0]} fails validation. plan.segments: 4-5 segments.\n` +
    (correctives.length > 0
      ? `- For each documented misconception, at least one quiz item's explanation must include the corrective SENTENCE VERBATIM (copy it word-for-word, then add your own application to this item). The correctives are:\n${correctives.map((c) => `  • "${c}"`).join('\n')}\n`
      : '') +
    `- plan.segments must include one "reteach" segment that re-teaches the reading's core concept for students who arrived cold.\n` +
    `- rubricBands describe OBSERVABLE work: the top band applies a definition with an example; the lowest band exhibits the documented misconception. No adverb gradients ("thoroughly", "adequately").\n` +
    `- Write like a person who teaches this course: specific, direct, no template phrases ("In this lesson we will..."), no evidence-speak. Vary sentence openers.\n` +
    `- claims[]: for each factual passage, record {path, ref}; ref must be one of the enum values in the schema (the graph nodes this lesson actually has) or null for your own judgment.` +
    (slice.sources.length === 0
      ? `\n- This lesson has NO external sources: do not name any book, article, or URL in the prose.`
      : '')
  );
}

function lessonUserPrompt(slice) {
  return JSON.stringify(
    {
      lesson: slice.lesson,
      concepts: slice.concepts,
      outcomes: slice.outcomes,
      assessments: slice.assessments,
      sources: slice.sources,
      neighbors: slice.neighbors,
      constraints: slice.constraints,
    },
    null,
    1,
  );
}

export async function authorLesson(
  graph,
  lessonId,
  { tier, ledger, budgetUsd = null, mock = null, repairNotes = null } = {},
) {
  const slice = buildLessonSlice(graph, lessonId);
  if (mock) return mock(slice, { repairNotes });
  const { result } = await callModel({
    tier,
    stage: repairNotes ? 'repair' : 'author',
    ledger,
    budgetUsd,
    schema: lessonSchemaForSlice(slice),
    schemaName: 'authored_lesson',
    validate: validateAuthoredLesson,
    maxOutputTokens: 12000,
    system: lessonSystemPrompt(slice),
    user: repairNotes
      ? `${lessonUserPrompt(slice)}\n\nA deterministic review found these defects in the previous version — fix every one:\n${repairNotes}`
      : lessonUserPrompt(slice),
  });
  return result;
}

// Targeted quiz repair — J1/J3 findings implicate quizItems only; re-author
// just that section (~¼ the tokens of a full lesson) and splice.
export const QUIZ_REPAIR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['quizItems', 'quizClaims'],
  properties: {
    quizItems: AUTHORED_LESSON_SCHEMA.properties.quizItems,
    quizClaims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'ref'],
        properties: { path: { type: 'string' }, ref: { type: ['string', 'null'] } },
      },
    },
  },
};

export function validateQuizRepair(constraints) {
  return (parsed) => {
    const errors = [];
    if (!Array.isArray(parsed?.quizItems) || parsed.quizItems.length < Math.max(constraints.quizItems ?? 6, 3)) {
      errors.push(`quizItems needs ${constraints.quizItems ?? 6} items`);
    }
    for (const [i, item] of (parsed?.quizItems ?? []).entries()) {
      if (!Array.isArray(item?.options) || item.options.length !== 4)
        errors.push(`quizItems[${i}].options must have exactly 4`);
      if (!Number.isInteger(item?.correctIndex) || item.correctIndex < 0 || item.correctIndex > 3)
        errors.push(`quizItems[${i}].correctIndex out of range`);
      if (typeof item?.explanation !== 'string' || item.explanation.length < 30)
        errors.push(`quizItems[${i}].explanation too short`);
    }
    if (!Array.isArray(parsed?.quizClaims)) errors.push('quizClaims must be an array');
    return errors;
  };
}

export async function repairQuizSection(graph, lessonId, authoredLesson, findings, { tier, ledger, budgetUsd = null }) {
  const slice = buildLessonSlice(graph, lessonId);
  const schema = structuredClone(QUIZ_REPAIR_SCHEMA);
  schema.properties.quizClaims.items.properties.ref = {
    type: ['string', 'null'],
    enum: [...legalRefsForSlice(slice), null],
  };
  const correctives = slice.concepts.flatMap((c) => c.misconceptions.map((m) => m.corrective));
  const { result } = await callModel({
    tier,
    stage: 'repair',
    ledger,
    budgetUsd,
    schema,
    schemaName: 'quiz_repair',
    validate: validateQuizRepair(slice.constraints),
    maxOutputTokens: 5000,
    system:
      `You are repairing ONLY the quiz items of week ${slice.lesson.week} ("${slice.lesson.title}") in ${slice.course.title}. ` +
      `Return the full corrected quizItems array (${slice.constraints.quizItems} items) and quizClaims ({path:"quizItems[i]...", ref}). ` +
      `For each documented misconception, at least one explanation must include the corrective sentence VERBATIM, then apply it to the item. Correctives:\n${correctives
        .map((c) => `  • "${c}"`)
        .join('\n')}`,
    user: JSON.stringify(
      {
        concepts: slice.concepts,
        currentQuizItems: authoredLesson.quizItems,
        defectsFound: findings.map((f) => `[${f.code}] ${f.message}`),
      },
      null,
      1,
    ),
  });
  return {
    ...authoredLesson,
    quizItems: result.quizItems,
    claims: [
      ...(authoredLesson.claims ?? []).filter((c) => !String(c.path).startsWith('quizItems')),
      ...result.quizClaims,
    ],
  };
}

export async function authorCourseWide(graph, { tier, ledger, budgetUsd = null, mock = null } = {}) {
  if (mock) return mock(graph);
  const { result } = await callModel({
    tier,
    stage: 'author',
    ledger,
    budgetUsd,
    schema: COURSE_WIDE_SCHEMA,
    schemaName: 'course_wide',
    validate: validateCourseWide,
    maxOutputTokens: 4000,
    system:
      `You are the instructor of "${graph.course.title}" writing the course-wide prose: description, policies, materials, FAQ intro. ` +
      `Policies must include exam accommodations tied to the actual exams, a late-work rule, an explicit AI-use policy, and attendance. ` +
      `Materials must be procurement-grade: name the concrete item, version, cost/free status. No template phrases.`,
    user: JSON.stringify(
      {
        course: graph.course,
        outcomes: graph.outcomes.map((o) => o.statement),
        assessments: graph.assessments.map((a) => ({ key: a.registryKey, kind: a.kindOf, weight: a.weightPct })),
        verifiedSources: graph.sources.filter((s) => s.trust === 'verified').map((s) => `${s.title} — ${s.url}`),
      },
      null,
      1,
    ),
  });
  return result;
}

// Author all lessons with bounded parallelism.
export const AUTHOR_BATCH_SIZE = 6;

export async function authorAllLessons(graph, options) {
  const authored = {};
  const failures = [];
  const ids = graph.lessons.map((lesson) => lesson.id);
  for (let i = 0; i < ids.length; i += AUTHOR_BATCH_SIZE) {
    const batch = ids.slice(i, i + AUTHOR_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((id) => authorLesson(graph, id, options)));
    results.forEach((result, j) => {
      if (result.status === 'fulfilled') authored[batch[j]] = result.value;
      else failures.push({ lessonId: batch[j], error: String(result.reason?.message ?? result.reason) });
    });
  }
  return { authored, failures };
}
