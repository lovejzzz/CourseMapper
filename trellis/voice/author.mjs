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
  normalizeSlides,
  validateAuthoredLesson,
  validateCourseWide,
  validateExamItems,
} from './contracts.mjs';
import { orderedLessons, conceptsForLesson, misconceptionsForConcept } from '../graph/schema.mjs';
import { quizInstrumentErrors, introducedMisconceptions, ITEM_CATCH_SHARE } from './quizInstrument.mjs';
import { selectBankItems } from '../knowledge/itemBank.mjs';

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
    `- plan.segments must include one "reteach" segment that WALKS ONE WORKED EXAMPLE from the reading, naming the example it works through in its text (a validator checks for this), for students who arrived cold; every segment's minutes is an integer of at least 5.\n` +
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

// ── item-bank quiz plan (v0.1.3) ────────────────────────────────────────────
// Banked items are selected deterministically ($0) and the model authors
// only the remainder. Fresh claims' quizItems[N] paths shift by the banked
// offset so entailment and Prof's item→concept mapping stay correct.
export function bankQuizPlan(slice, bank) {
  if (!bank) return null;
  const banked = selectBankItems(slice, bank);
  if (banked.length === 0) return null;
  const bankedClaims = banked.map((item, index) => ({
    path: `quizItems[${index}].explanation`,
    ref: `kernel:${item.__bank.conceptId}`,
  }));
  return { banked, bankedClaims, freshCount: Math.max(slice.constraints.quizItems - banked.length, 0) };
}

function remapQuizClaimPaths(claims, offset) {
  return (claims ?? []).map((claim) => ({
    ...claim,
    path: String(claim.path ?? '').replace(/^quizItems\[(\d+)\]/, (_, n) => `quizItems[${Number(n) + offset}]`),
  }));
}

export function assembleQuizFromBank(plan, freshResult) {
  const fresh = freshResult?.quizItems ?? [];
  return {
    quizItems: [
      ...plan.banked.map((item) => {
        const clean = { ...item };
        delete clean.__bank;
        return clean;
      }),
      ...fresh,
    ],
    claims: [...plan.bankedClaims, ...remapQuizClaimPaths(freshResult?.claims, plan.banked.length)],
  };
}

export function partialQuizValidator(count) {
  return (parsed) => {
    const errors = [];
    if (!Array.isArray(parsed?.quizItems) || parsed.quizItems.length !== count) {
      errors.push(`quizItems must have exactly ${count} item(s)`);
    }
    for (const [i, item] of (parsed?.quizItems ?? []).entries()) {
      if (typeof item?.stem !== 'string' || item.stem.length < 20) errors.push(`quizItems[${i}].stem too short`);
      if (!Array.isArray(item?.options) || item.options.length !== 4)
        errors.push(`quizItems[${i}].options must have exactly 4`);
      if (!Number.isInteger(item?.correctIndex) || item.correctIndex < 0 || item.correctIndex > 3)
        errors.push(`quizItems[${i}].correctIndex out of range`);
      if (typeof item?.explanation !== 'string' || item.explanation.length < 30)
        errors.push(`quizItems[${i}].explanation too short`);
    }
    if (!Array.isArray(parsed?.claims)) errors.push('claims must be an array');
    return errors;
  };
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
const QUIZ_FIELDS = ['quizItems', 'claims'];
const CORE_SANS_QUIZ_FIELDS = ['plan', 'studyGuideSection', 'claims'];

function subSchema(fields, slice) {
  const full = lessonSchemaForSlice(slice);
  return {
    type: 'object',
    additionalProperties: false,
    required: fields,
    properties: Object.fromEntries(fields.map((f) => [f, full.properties[f]])),
  };
}

function subValidator(fields, slice = null) {
  // Validate the fragment by merging it over a shell that satisfies the
  // other half, then filtering the full validator's errors to our fields.
  // When the fragment owns quizItems and a slice is given, the classroom
  // instrument's own rules run in the same retry loop (quizInstrument.mjs).
  return (parsed) => {
    if (!parsed || typeof parsed !== 'object') return ['must be an object'];
    const errors = validateAuthoredLesson({ ...VALID_SHELL, ...parsed });
    const filtered = errors.filter((e) =>
      fields.some((f) => e.startsWith(f) || e.includes(`${f}.`) || e.includes(`${f}[`) || e.includes(f)),
    );
    if (slice && fields.includes('quizItems')) {
      filtered.push(...quizInstrumentErrors(parsed.quizItems, introducedMisconceptions(slice)));
    }
    return filtered;
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
    (correctives.length > 0
      ? `- PAIRING RULE: any item whose distractor states a misconception must have an explanation that confronts THAT misconception's corrective — the student who picks the wrong belief must read its repair.\n` +
        ''
      : '') +
    `- plan.segments: 4-5 segments, each an integer of at least 5 minutes, including one "reteach" segment that WALKS ONE WORKED EXAMPLE from the reading — name the example it works through in its text (a validator checks for this) — for students who arrived cold.\n` +
    (slice.primerConcepts?.length
      ? `- PRIMER REQUIRED: this lesson uses concepts the course formally teaches later (${slice.primerConcepts.map((p) => p.name).join(', ')}). Open plan.segments with a 5-10 minute primer that introduces just enough of each (kernel facts provided), saying explicitly it is a preview of a later lesson.\n`
      : '') +
    `- studyGuideSection: a markdown section of at least 300 characters — key terms with definitions, the misconceptions to watch for, 2-3 self-check prompts, and a "### If you missed the reading" catch-up block (3-4 sentences that stand alone).\n` +
    `- Every factual claim traces to the kernel facts provided; never invent facts or readings.\n` +
    `- Where a concept carries workedExamples or anchorQuotes, USE them: build the plan's worked-example segment and at least one quiz stem from a provided example, and let anchored quotes ground the study guide.\n` +
    `- For LANGUAGE courses at introductory level: instructions, briefs, and explanations are written in English (students are beginners); the target language appears as CONTENT — examples, vocabulary, prompts, dialogue — not as the instruction medium.\n` +
    `- Write like a person who teaches this course: specific, direct, no template phrases. claims[].ref: one of the schema enum values or null.`
  );
}

// The wrong-belief/corrective pairs, verbatim — the lexical gates (J11,
// J3b, Prof's catch matcher) check shared key terms, so the model must see
// the exact texts, not a summary of them.
function misconceptionBlocks(misconceptions) {
  return misconceptions
    .map((m, i) => {
      const belief = m.beliefForm ?? m.statement;
      const documented = m.beliefForm && m.beliefForm !== m.statement ? `\n     (documented as: "${m.statement}")` : '';
      return `  ${i + 1}. WRONG BELIEF (build a distractor from it): "${belief}"${documented}\n     CORRECTIVE (the catching item's explanation keeps ITS key terms): "${m.corrective}"`;
    })
    .join('\n');
}

function quizSystemPrompt(slice, count = slice.constraints.quizItems) {
  const misconceptions = introducedMisconceptions(slice);
  return (
    `You are the course's own instructor writing the week-${slice.lesson.week} quiz for "${slice.course.title}" (${slice.course.level} ${slice.course.subject}). ` +
    `Author quizItems + claims as JSON. Non-negotiables:\n` +
    `- Exactly ${count} items, 4 options each, application/transfer stems preferred over recall; VARY correctIndex across items; no two options in an item may be identical.\n` +
    `- DISTRACTOR CRAFT: every wrong option must be plausible to a student who half-learned the material — a real mistake with real reasoning behind it. Never joke options, never obviously-absurd claims, never two options that say the same thing in different words.\n` +
    (misconceptions.length > 0
      ? `- The distractors ARE the documented wrong beliefs below. At least ${Math.ceil(count * ITEM_CATCH_SHARE)} of the ${count} items must carry one as a wrong option.\n` +
        `- HOW TO WRITE A CATCHING DISTRACTOR: give the wrong value/claim WITH its wrong rationale, reusing the documented belief's own nouns and verbs — "3, because the operands look like whole numbers so Python does integer division", never the bare value "3". A lexical grader counts the belief's words inside the option, and the student who holds the belief must recognize their own reasoning.\n` +
        `- PAIRING: any item whose options state a wrong belief must confront that belief's corrective in its explanation — quote it or paraphrase it keeping its key terms. The student who picks the wrong belief reads its repair.\n` +
        `- Documented misconceptions:\n${misconceptionBlocks(misconceptions)}\n`
      : '') +
    `- Where a concept carries workedExamples, build at least one stem from a provided example (show the actual case, not a description of it).\n` +
    `- SPACED RETRIEVAL: put 1-2 items on the lesson's REINFORCED (prior) concepts, not only the new ones — retrieval of last week's material is where retention is won. Start those stems with "Review:" so nobody mistakes deliberate retrieval for topic drift.\n` +
    `- explanation: 2-3 tight sentences, at most ~50 words — say why the right answer is right and the tempting one is wrong; no preamble, no restating the stem.\n` +
    `- Every factual claim traces to the kernel facts provided; never invent facts. claims[]: {path like "quizItems[2].explanation", ref from the schema enum or null}.\n` +
    `- Write like a person who teaches this course: specific, direct, no template phrases; never open two explanations the same way.`
  );
}

// The quiz call's payload: only what items need (concepts with facts,
// examples and misconceptions, the outcomes, the constraints). Sources,
// neighbors, assessments and primers ride the OTHER calls — quiz input was
// 29k tokens/course of which a third was never used by items (run-7 trim).
function quizUserPrompt(slice) {
  return JSON.stringify(
    { lesson: slice.lesson, concepts: slice.concepts, outcomes: slice.outcomes, constraints: slice.constraints },
    null,
    1,
  );
}

function surfacesSystemPrompt(slice) {
  return (
    `You are the course's own instructor writing week ${slice.lesson.week} of "${slice.course.title}" (${slice.course.level} ${slice.course.subject}). ` +
    `Author the lesson's presentation surfaces as JSON: slides, discussion, assignment, faqEntries, claims. Non-negotiables:\n` +
    `- Slides: between ${slice.constraints.slides[0]} and ${slice.constraints.slides[1]} slides — count them; every slide has 1-5 bullets, speakerNotes, altText. Ground bullets in the kernel facts provided.\n` +
    `- NEVER more than 5 bullets on a slide (split the idea across slides instead). assignment.task: 2-4 full sentences.\n` +
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
  {
    tier,
    surfacesTier = null,
    quizTier = null,
    ledger,
    budgetUsd = null,
    mock = null,
    repairNotes = null,
    bank = null,
    bankStats = null,
  } = {},
) {
  const slice = buildLessonSlice(graph, lessonId);
  if (mock) return mock(slice, { repairNotes });

  // Split path: parallel calls on different tiers. With quizTier set
  // (roadmap 2.1) the quiz — the judgment-heaviest artifact — authors on
  // its own (usually stronger) tier while plan/guide and surfaces stay
  // cheap; three small schemas, all parallel.
  if (surfacesTier && !repairNotes) {
    const coreFields = quizTier ? CORE_SANS_QUIZ_FIELDS : CORE_FIELDS;
    const calls = [
      callModel({
        tier,
        stage: 'author',
        ledger,
        budgetUsd,
        schema: subSchema(coreFields, slice),
        schemaName: 'lesson_core',
        validate: subValidator(coreFields),
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
    ];
    if (quizTier) {
      // The quiz prompt states the instrument's rules (catch share, pairing,
      // reason-bearing distractors) but the VALIDATOR stays structural: run 4
      // died enforcing the instrument here (12/15 lessons), and run 5 paid
      // $0.93 in retries to satisfy it stochastically. The deterministic
      // splice + corrective-pairing passes own the instrument instead.
      //
      // v0.1.3: banked items (deterministic, $0) cover what they can; the
      // model authors only the remainder — or nothing at full coverage.
      const plan = bank ? bankQuizPlan(slice, bank) : null;
      if (plan && bankStats) {
        bankStats.selected += plan.banked.length;
        bankStats.fresh += plan.freshCount;
        if (plan.freshCount === 0) bankStats.lessonsFullyBanked += 1;
      }
      if (plan && plan.freshCount === 0) {
        calls.push(Promise.resolve({ result: assembleQuizFromBank(plan, null) }));
      } else if (plan) {
        calls.push(
          callModel({
            tier: quizTier,
            stage: 'authorQuiz',
            ledger,
            budgetUsd,
            schema: subSchema(QUIZ_FIELDS, slice),
            schemaName: 'lesson_quiz',
            validate: partialQuizValidator(plan.freshCount),
            maxOutputTokens: 6000,
            system: quizSystemPrompt(slice, plan.freshCount),
            user: quizUserPrompt(slice),
          }).then((r) => ({ result: assembleQuizFromBank(plan, r.result) })),
        );
      } else {
        calls.push(
          callModel({
            tier: quizTier,
            stage: 'authorQuiz',
            ledger,
            budgetUsd,
            schema: subSchema(QUIZ_FIELDS, slice),
            schemaName: 'lesson_quiz',
            validate: subValidator(QUIZ_FIELDS),
            maxOutputTokens: 6000,
            system: quizSystemPrompt(slice),
            user: quizUserPrompt(slice),
          }),
        );
      }
    }
    const [core, surfaces, quiz] = await Promise.all(calls);
    return mergeSplitLesson(core.result, surfaces.result, quizTier ? quiz.result : null);
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
  return { ...result, slides: normalizeSlides(result.slides) };
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

export function validateQuizRepair(constraints, misconceptions = []) {
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
    // NOTE: the classroom-instrument rules are deliberately NOT enforced
    // here — run 5 measured 73 repair calls thrashing against them. The
    // deterministic splice/pairing passes re-run after every repair round
    // (repairLoop's afterRound), so instrument guarantees are restored by
    // machine, not by retries. `misconceptions` stays for the prompt blocks.
    void misconceptions;
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
  const misconceptions = introducedMisconceptions(slice);
  const { result } = await callModel({
    tier,
    stage: 'repair',
    ledger,
    budgetUsd,
    schema,
    schemaName: 'quiz_repair',
    validate: validateQuizRepair(slice.constraints, misconceptions),
    maxOutputTokens: 5000,
    system:
      `You are repairing ONLY the quiz items of week ${slice.lesson.week} ("${slice.lesson.title}") in ${slice.course.title}. ` +
      `Return the full corrected quizItems array (${slice.constraints.quizItems} items) and quizClaims ({path:"quizItems[i]...", ref}). ` +
      `Rules: (1) for each documented misconception, at least one item carries a DISTRACTOR built from it — the wrong value/claim WITH its wrong rationale, reusing the belief's own nouns and verbs ("3, because the operands look like whole numbers", never the bare "3"); (2) at least ${Math.ceil(slice.constraints.quizItems * ITEM_CATCH_SHARE)} of the ${slice.constraints.quizItems} items must carry a wrong belief as an option — vary the wording, keep each belief's key terms; (3) PAIRING — any item whose options state a wrong belief must confront THAT belief's corrective in its explanation, keeping the corrective's key terms; (4) no two options in an item may be identical.` +
      (misconceptions.length > 0 ? ` Documented misconceptions:\n${misconceptionBlocks(misconceptions)}` : ''),
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

// Merge the split-authored parts into one lesson and hold it to the FULL
// contract — shared by the live path and the batch transport.
export function mergeSplitLesson(core, surfaces, quiz) {
  const merged = {
    ...core,
    ...surfaces,
    slides: normalizeSlides(surfaces.slides),
    plan: core.plan,
    quizItems: quiz ? quiz.quizItems : core.quizItems,
    studyGuideSection: core.studyGuideSection,
    claims: [...(core.claims ?? []), ...(surfaces.claims ?? []), ...(quiz ? (quiz.claims ?? []) : [])],
  };
  const errors = validateAuthoredLesson(merged);
  if (errors.length > 0) throw new Error(`split-authoring merge failed contract: ${errors.join('; ')}`);
  return merged;
}

// The overnight transport (v0.1.2+): every lesson's split calls ride ONE
// OpenAI batch at 50% token rates — identical models, identical schemas,
// identical validators, so the quality delta is zero by construction.
// Lessons whose batch parts fail after the batch's own retry rounds fall
// back to live authoring; a dead run is never the price of a discount.
export async function authorAllLessonsBatch(
  graph,
  { tier, surfacesTier, quizTier, ledger, budgetUsd, bank = null, bankStats = null },
) {
  const bankPlans = new Map();
  const { batchCallModels } = await import('../providers.mjs');
  const descriptors = [];
  const parts = [];
  for (const lesson of graph.lessons) {
    const slice = buildLessonSlice(graph, lesson.id);
    const coreFields = quizTier ? CORE_SANS_QUIZ_FIELDS : CORE_FIELDS;
    descriptors.push({
      tier,
      stage: 'author',
      schema: subSchema(coreFields, slice),
      schemaName: 'lesson_core',
      validate: subValidator(coreFields),
      maxOutputTokens: 8000,
      system: coreSystemPrompt(slice),
      user: lessonUserPrompt(slice),
    });
    parts.push({ lessonId: lesson.id, kind: 'core' });
    descriptors.push({
      tier: surfacesTier,
      stage: 'authorSurfaces',
      schema: subSchema(SURFACE_FIELDS, slice),
      schemaName: 'lesson_surfaces',
      validate: subValidator(SURFACE_FIELDS),
      maxOutputTokens: 8000,
      system: surfacesSystemPrompt(slice),
      user: lessonUserPrompt(slice),
    });
    parts.push({ lessonId: lesson.id, kind: 'surfaces' });
    if (quizTier) {
      const plan = bank ? bankQuizPlan(slice, bank) : null;
      if (plan) bankPlans.set(lesson.id, plan);
      if (plan && bankStats) {
        bankStats.selected += plan.banked.length;
        bankStats.fresh += plan.freshCount;
        if (plan.freshCount === 0) bankStats.lessonsFullyBanked += 1;
      }
      if (!plan || plan.freshCount > 0) {
        descriptors.push({
          tier: quizTier,
          stage: 'authorQuiz',
          schema: subSchema(QUIZ_FIELDS, slice),
          schemaName: 'lesson_quiz',
          validate: plan ? partialQuizValidator(plan.freshCount) : subValidator(QUIZ_FIELDS),
          maxOutputTokens: 6000,
          system: quizSystemPrompt(slice, plan ? plan.freshCount : undefined),
          user: quizUserPrompt(slice),
        });
        parts.push({ lessonId: lesson.id, kind: 'quiz' });
      }
    }
  }

  const outcomes = await batchCallModels(descriptors, { ledger, budgetUsd });
  const byLesson = new Map();
  parts.forEach((part, i) => {
    if (!byLesson.has(part.lessonId)) byLesson.set(part.lessonId, {});
    byLesson.get(part.lessonId)[part.kind] = outcomes[i];
  });

  const authored = {};
  const failures = [];
  const transport = {
    totalParts: descriptors.length,
    batchedParts: outcomes.filter((o) => o?.result).length,
    fallbackLessons: 0,
    firstError: outcomes.find((o) => o?.error)?.error ?? null,
  };
  for (const lesson of graph.lessons) {
    const group = byLesson.get(lesson.id) ?? {};
    try {
      const plan = bankPlans.get(lesson.id) ?? null;
      const quizNeeded = quizTier && (!plan || plan.freshCount > 0);
      if (!group.core?.result || !group.surfaces?.result || (quizNeeded && !group.quiz?.result)) {
        throw new Error(group.core?.error ?? group.surfaces?.error ?? group.quiz?.error ?? 'batch part missing');
      }
      const quizResult = quizTier
        ? plan
          ? assembleQuizFromBank(plan, group.quiz?.result ?? null)
          : group.quiz.result
        : null;
      authored[lesson.id] = mergeSplitLesson(group.core.result, group.surfaces.result, quizResult);
    } catch (batchError) {
      transport.fallbackLessons += 1;
      try {
        authored[lesson.id] = await authorLesson(graph, lesson.id, {
          tier,
          surfacesTier,
          quizTier,
          ledger,
          budgetUsd,
          bank,
        });
      } catch (liveError) {
        failures.push({
          lessonId: lesson.id,
          error: `batch: ${String(batchError?.message ?? batchError).slice(0, 120)}; live: ${String(liveError?.message ?? liveError).slice(0, 120)}`,
        });
      }
    }
  }
  return { authored, failures, transport };
}

export async function authorAllLessons(graph, options) {
  const authored = {};
  const failures = [];
  const ids = graph.lessons.map((lesson) => lesson.id);
  // One fresh re-author per failed lesson before giving up: a small model
  // occasionally exhausts its retry feedback on one contract line (run 6
  // died on a single reteach rule), and fresh sampling is ~$0.001 while a
  // dead run wastes the whole ledger.
  const authorWithRetry = (id) => authorLesson(graph, id, options).catch(() => authorLesson(graph, id, options));
  for (let i = 0; i < ids.length; i += AUTHOR_BATCH_SIZE) {
    const batch = ids.slice(i, i + AUTHOR_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((id) => authorWithRetry(id)));
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
  // Exposure enforced at the grammar (roadmap 1.3): an exam item can only
  // assess a concept the covered lessons actually taught.
  schema.properties.items.items.properties.conceptId = { type: 'string', enum: concepts.map((c) => c.id) };
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
      `Write ${itemCount} EXAM items — apply/transfer difficulty only, roughly 60% apply / 40% transfer, novel scenarios (never reworded practice questions), misconception distractors where documented, VARY correctIndex, ` +
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
