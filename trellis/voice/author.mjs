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
  EXAM_ITEMS_SCHEMA,
  buildLessonSlice,
  validateAuthoredLesson,
  validateCourseWide,
  validateExamItems,
} from './contracts.mjs';
import { orderedLessons, conceptsForLesson, misconceptionsForConcept } from '../graph/schema.mjs';

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
      ? `- For each documented misconception, at least one quiz item's explanation must CONFRONT its corrective: quote it, or paraphrase it faithfully keeping its key terms (a grader checks word overlap). Vary how you weave it in. The correctives are:\n${correctives.map((c) => `  • "${c}"`).join('\n')}\n`
      : '') +
    `- plan.segments must include one "reteach" segment that re-teaches the reading's core concept for students who arrived cold; every segment's minutes is an integer of at least 5.\n` +
    (slice.primerConcepts?.length
      ? `- PRIMER REQUIRED: this lesson uses concepts formally taught later (${slice.primerConcepts.map((p) => p.name).join(', ')}). Open the plan with a 5-10 minute primer introducing just enough of each.\n`
      : '') +
    `- rubricBands describe OBSERVABLE work: the top band applies a definition with an example; the lowest band exhibits the documented misconception. No adverb gradients ("thoroughly", "adequately").\n` +
    `- For LANGUAGE courses at introductory level: instructions, briefs, and explanations are written in English (students are beginners); the target language appears as CONTENT — examples, vocabulary, prompts, dialogue — not as the instruction medium.\n` +
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
      primerConcepts: slice.primerConcepts ?? [],
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

// ── split-tier authoring (the cost lever) ───────────────────────────────────
// Output tokens dominate cost (~90%), so the lesson splits into two parallel
// calls: the judgment CORE (plan, quiz items with misconception work, study
// guide — everything the teach-as-is judge actually scores) stays on the
// author tier; the presentation SURFACES (slides, discussion, assignment,
// FAQ — the volume) go to the nano tier at ~1/11th the output rate. The
// merged result must still pass the FULL contract validator.

const CORE_FIELDS = ['plan', 'quizItems', 'studyGuideSection', 'claims'];
const SURFACE_FIELDS = ['slides', 'discussion', 'assignment', 'faqEntries', 'claims'];

function subSchema(fields, slice) {
  const full = lessonSchemaForSlice(slice);
  return {
    type: 'object',
    additionalProperties: false,
    required: fields,
    properties: Object.fromEntries(fields.map((f) => [f, full.properties[f]])),
  };
}

function subValidator(fields) {
  // Validate the fragment by merging it over a shell that satisfies the
  // other half, then filtering the full validator's errors to our fields.
  return (parsed) => {
    if (!parsed || typeof parsed !== 'object') return ['must be an object'];
    const errors = validateAuthoredLesson({ ...VALID_SHELL, ...parsed });
    return errors.filter((e) =>
      fields.some((f) => e.startsWith(f) || e.includes(`${f}.`) || e.includes(`${f}[`) || e.includes(f)),
    );
  };
}

// A minimal contract-satisfying shell used only to let the full validator
// run against fragments (never rendered, never sent to a model).
const VALID_SHELL = {
  plan: {
    segments: [
      { minutes: 10, mode: 'teach', text: 'shell segment text long enough to satisfy the validator minimum.' },
      { minutes: 10, mode: 'reteach', text: 'shell segment text long enough to satisfy the validator minimum.' },
      { minutes: 10, mode: 'activity', text: 'shell segment text long enough to satisfy the validator minimum.' },
    ],
  },
  slides: Array.from({ length: 6 }, (_, i) => ({
    title: `Shell ${i}`,
    bullets: ['shell bullet'],
    speakerNotes: 'shell notes long enough to satisfy minimum.',
    altText: 'shell alt text.',
  })),
  quizItems: Array.from({ length: 6 }, (_, i) => ({
    stem: 'Shell stem long enough to satisfy the validator?',
    options: ['a', 'b', 'c', 'd'],
    correctIndex: i % 4,
    explanation: 'Shell explanation long enough to satisfy the validator.',
    bloom: 'apply',
    difficulty: 'apply',
  })),
  studyGuideSection: 'S'.repeat(200),
  discussion: {
    prompt: 'Shell prompt long enough to satisfy the validator minimum.',
    tension: 'Shell tension text.',
    followUps: ['Shell follow-up one.', 'Shell follow-up two.'],
  },
  assignment: {
    task: 'Shell task long enough to satisfy the validator minimum for the assignment field.',
    steps: ['Shell step one.', 'Shell step two.', 'Shell step three.'],
    rubricBands: [
      { band: 'A', observableBehavior: 'Shell observable behavior long enough to pass.' },
      { band: 'B', observableBehavior: 'Shell observable behavior long enough to pass.' },
      { band: 'C', observableBehavior: 'Shell observable behavior long enough to pass.' },
    ],
  },
  faqEntries: [{ q: 'Shell question?', a: 'Shell answer long enough to satisfy the validator.' }],
  claims: [],
};

function coreSystemPrompt(slice) {
  const correctives = slice.concepts.flatMap((c) => c.misconceptions.map((m) => m.corrective));
  return (
    `You are the course's own instructor writing week ${slice.lesson.week} of "${slice.course.title}" (${slice.course.level} ${slice.course.subject}). ` +
    `Author the lesson CORE as JSON: plan, quizItems, studyGuideSection, claims. Non-negotiables:\n` +
    `- Quiz items: exactly ${slice.constraints.quizItems} items, 4 options each, application/transfer stems preferred; VARY correctIndex across items.\n` +
    `- For each documented misconception, at least one item must carry a distractor that IS that misconception — state the wrong belief in the student's own words, keeping the statement's key terms (a distractor that merely gestures at it does not catch the students who hold it).\n` +
    (correctives.length > 0
      ? `- For each documented misconception, at least one quiz item's explanation must CONFRONT its corrective: quote it, or paraphrase it faithfully keeping its key terms (a grader checks word overlap — do not water it down). Vary how you weave it in; never open two explanations the same way. Correctives:\n${correctives.map((c) => `  • "${c}"`).join('\n')}\n`
      : '') +
    `- plan.segments: 4-5 segments, each an integer of at least 5 minutes, including one "reteach" segment that re-teaches the reading's core concept for students who arrived cold.\n` +
    (slice.primerConcepts?.length
      ? `- PRIMER REQUIRED: this lesson uses concepts the course formally teaches later (${slice.primerConcepts.map((p) => p.name).join(', ')}). Open plan.segments with a 5-10 minute primer that introduces just enough of each (kernel facts provided), saying explicitly it is a preview of a later lesson.\n`
      : '') +
    `- studyGuideSection: a markdown section of at least 300 characters — key terms with definitions, the misconceptions to watch for, and 2-3 self-check prompts.\n` +
    `- Every factual claim traces to the kernel facts provided; never invent facts or readings.\n` +
    `- Where a concept carries workedExamples or anchorQuotes, USE them: build the plan's worked-example segment and at least one quiz stem from a provided example, and let anchored quotes ground the study guide.\n` +
    `- For LANGUAGE courses at introductory level: instructions, briefs, and explanations are written in English (students are beginners); the target language appears as CONTENT — examples, vocabulary, prompts, dialogue — not as the instruction medium.\n` +
    `- Write like a person who teaches this course: specific, direct, no template phrases. claims[].ref: one of the schema enum values or null.`
  );
}

function surfacesSystemPrompt(slice) {
  return (
    `You are the course's own instructor writing week ${slice.lesson.week} of "${slice.course.title}" (${slice.course.level} ${slice.course.subject}). ` +
    `Author the lesson's presentation surfaces as JSON: slides, discussion, assignment, faqEntries, claims. Non-negotiables:\n` +
    `- Slides: between ${slice.constraints.slides[0]} and ${slice.constraints.slides[1]} slides — count them; every slide has 1-5 bullets, speakerNotes, altText. Ground bullets in the kernel facts provided.\n` +
    `- Every bullet is a COMPLETE statement ending with terminal punctuation — . ! ? : or the CJK equivalents 。！？： when writing in that language — never a clipped fragment ending mid-clause.\n` +
    `- Where a concept carries workedExamples, at least one slide walks one example concretely (show the actual case, not a description of it).\n` +
    `- rubricBands describe OBSERVABLE work: the top band applies a definition with an example; the lowest band exhibits the documented misconception. No adverb gradients.\n` +
    `- Every factual claim traces to the kernel facts provided; never invent facts, citations, or readings.` +
    (slice.sources.length === 0 ? ` This lesson has NO external sources: do not name any book, article, or URL.` : '') +
    `\n` +
    `- For LANGUAGE courses at introductory level: instructions, briefs, and explanations are written in English (students are beginners); the target language appears as CONTENT — examples, vocabulary, prompts, dialogue — not as the instruction medium.\n` +
    `- Write like a person who teaches this course: specific, direct, no template phrases. claims[].ref: one of the schema enum values or null.`
  );
}

export async function authorLesson(
  graph,
  lessonId,
  { tier, surfacesTier = null, ledger, budgetUsd = null, mock = null, repairNotes = null } = {},
) {
  const slice = buildLessonSlice(graph, lessonId);
  if (mock) return mock(slice, { repairNotes });

  // Split path: parallel core + surfaces calls on different tiers.
  if (surfacesTier && surfacesTier !== tier && !repairNotes) {
    const [core, surfaces] = await Promise.all([
      callModel({
        tier,
        stage: 'author',
        ledger,
        budgetUsd,
        schema: subSchema(CORE_FIELDS, slice),
        schemaName: 'lesson_core',
        validate: subValidator(CORE_FIELDS),
        maxOutputTokens: 8000,
        system: coreSystemPrompt(slice),
        user: lessonUserPrompt(slice),
      }),
      callModel({
        tier: surfacesTier,
        stage: 'authorSurfaces',
        ledger,
        budgetUsd,
        schema: subSchema(SURFACE_FIELDS, slice),
        schemaName: 'lesson_surfaces',
        validate: subValidator(SURFACE_FIELDS),
        maxOutputTokens: 8000,
        system: surfacesSystemPrompt(slice),
        user: lessonUserPrompt(slice),
      }),
    ]);
    const merged = {
      ...core.result,
      ...surfaces.result,
      plan: core.result.plan,
      quizItems: core.result.quizItems,
      studyGuideSection: core.result.studyGuideSection,
      claims: [...(core.result.claims ?? []), ...(surfaces.result.claims ?? [])],
    };
    const errors = validateAuthoredLesson(merged);
    if (errors.length > 0) throw new Error(`split-authoring merge failed contract: ${errors.join('; ')}`);
    return merged;
  }

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
      `Materials must be procurement-grade: name the concrete item, version, cost/free status. No template phrases. ` +
      `logisticsFaq: at least 4 Q&As answering what students actually ask about THIS course's logistics — grading weights and what each assessment is, exam timing and format, the late-work rule, weekly workload — grounded in the registry provided, never generic.`,
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

// ── dedicated exam items (item 6) ───────────────────────────────────────────
// One authored call per exam over the covered lessons' concepts: transfer-
// and apply-level stems, misconception distractors, never recycled quiz
// items. Falls back to the quiz-pull render path only on failure, disclosed.
export async function authorExamItems(
  graph,
  exam,
  coveredLessons,
  { tier, ledger, budgetUsd = null, mock = null } = {},
) {
  const concepts = [];
  const seen = new Set();
  for (const lesson of coveredLessons) {
    for (const concept of conceptsForLesson(graph, lesson)) {
      if (seen.has(concept.id)) continue;
      seen.add(concept.id);
      concepts.push({
        id: concept.id,
        name: concept.name,
        kernelFacts: concept.kernelFacts,
        workedExamples: concept.workedExamples ?? [],
        misconceptions: misconceptionsForConcept(graph, concept.id).map(({ id, statement, corrective }) => ({
          id,
          statement,
          corrective,
        })),
      });
    }
  }
  if (mock) return mock(graph, exam, concepts);
  const itemCount = Math.min(Math.max(coveredLessons.length, 6), 12);
  const schema = structuredClone(EXAM_ITEMS_SCHEMA);
  schema.properties.claims.items.properties.ref = {
    type: ['string', 'null'],
    enum: [
      ...concepts.map((c) => `kernel:${c.id}`),
      ...concepts.flatMap((c) => c.misconceptions.map((m) => `misconception:${m.id}`)),
      null,
    ],
  };
  const { result } = await callModel({
    tier,
    stage: 'authorExams',
    ledger,
    budgetUsd,
    schema,
    schemaName: 'exam_items',
    validate: validateExamItems(Math.min(itemCount, 6)),
    maxOutputTokens: 8000,
    system:
      `You are writing "${exam.registryKey}" for ${graph.course.title} (${exam.weightPct}% of the grade), covering ${coveredLessons.length} lessons. ` +
      `Write ${itemCount} EXAM items — apply/transfer difficulty only, novel scenarios (never reworded practice questions), misconception distractors where documented, VARY correctIndex, ` +
      `each item tagged with the conceptId it assesses, and explanations that confront the documented corrective when one exists.`,
    user: JSON.stringify({ concepts, coveredLessonTitles: coveredLessons.map((l) => l.title) }, null, 1),
  });
  return result.items;
}

export async function authorAllExams(graph, options) {
  const lessons = orderedLessons(graph);
  const exams = graph.assessments
    .filter((a) => a.kindOf === 'exam')
    .sort((a, b) => (a.anchor.week ?? 0) - (b.anchor.week ?? 0));
  const authoredExams = {};
  const failures = [];
  // Pools are computed sequentially (coverage windows chain), then the
  // authoring calls run in parallel.
  let coveredFrom = 0;
  const jobs = exams.map((exam) => {
    const upTo = exam.anchor.week ?? graph.course.weeks;
    const cumulative = exam.registryKey.toLowerCase().includes('final');
    const pool = lessons.filter((lesson) => lesson.week <= upTo && (cumulative || lesson.week > coveredFrom));
    coveredFrom = upTo;
    return { exam, pool };
  });
  await Promise.allSettled(
    jobs.map(async ({ exam, pool }) => {
      try {
        authoredExams[exam.id] = await authorExamItems(graph, exam, pool, options);
      } catch (error) {
        failures.push({ examId: exam.id, error: String(error?.message ?? error).slice(0, 160) });
      }
    }),
  );
  return { authoredExams, failures };
}
