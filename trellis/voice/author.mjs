// Live authoring — docs/TRELLIS.md §14.3. One consolidated call per lesson
// (D2; the −36%/−22% consolidation lesson), schema-validated with retry
// feedback from validateAuthoredLesson. Slice assembly is pure and tested;
// this module owns only the prompt and the call.

import { callModel } from '../providers.mjs';
import {
  AUTHORED_LESSON_SCHEMA,
  COURSE_WIDE_SCHEMA,
  buildLessonSlice,
  validateAuthoredLesson,
  validateCourseWide,
} from './contracts.mjs';

function lessonSystemPrompt(slice) {
  return (
    `You are the course's own instructor writing week ${slice.lesson.week} of "${slice.course.title}" (${slice.course.level} ${slice.course.subject}). ` +
    `Author ALL student-facing content for this lesson as JSON matching the provided schema. Non-negotiables:\n` +
    `- Every factual claim must trace to the kernel facts provided; do not invent facts, citations, or readings.\n` +
    `- Quiz items: exactly ${slice.constraints.quizItems} items, 4 options each, application/transfer stems preferred over recall; use the documented misconceptions as distractors; VARY correctIndex across items.\n` +
    `- Slides: between ${slice.constraints.slides[0]} and ${slice.constraints.slides[1]} slides — count them before returning; fewer than ${slice.constraints.slides[0]} fails validation. plan.segments: 4-5 segments.\n` +
    `- When a concept has a documented misconception, at least one item's explanation must actively confront the corrective (paraphrase it, don't just assert the right answer).\n` +
    `- plan.segments must include one "reteach" segment that re-teaches the reading's core concept for students who arrived cold.\n` +
    `- rubricBands describe OBSERVABLE work: the top band applies a definition with an example; the lowest band exhibits the documented misconception. No adverb gradients ("thoroughly", "adequately").\n` +
    `- Write like a person who teaches this course: specific, direct, no template phrases ("In this lesson we will..."), no evidence-speak. Vary sentence openers.\n` +
    `- claims[]: for each factual passage, record {path, ref} where ref is "kernel:<conceptId>", "misconception:<id>", "source:<sourceId>", or null if it is your judgment.`
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
    schema: AUTHORED_LESSON_SCHEMA,
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

// Author all lessons with bounded parallelism (batch of 4 — provider-polite).
export async function authorAllLessons(graph, options) {
  const authored = {};
  const failures = [];
  const ids = graph.lessons.map((lesson) => lesson.id);
  const batchSize = 4;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((id) => authorLesson(graph, id, options)));
    results.forEach((result, j) => {
      if (result.status === 'fulfilled') authored[batch[j]] = result.value;
      else failures.push({ lessonId: batch[j], error: String(result.reason?.message ?? result.reason) });
    });
  }
  return { authored, failures };
}
