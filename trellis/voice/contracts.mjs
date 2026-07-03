// The authoring contract — docs/TRELLIS.md §13.3.
// buildLessonSlice is pure (a bad slice is a graph bug, not a prompt bug).
// AUTHORED_LESSON_SCHEMA doubles as the provider's json_schema response
// format and as documentation. validateAuthoredLesson is a hand-rolled
// structural check (no schema-lib dependency) whose error strings are fed
// back to the model on retry.

import {
  orderedLessons,
  conceptsForLesson,
  misconceptionsForConcept,
  assessmentsForLesson,
  sourcesForConcepts,
  indexById,
} from '../graph/schema.mjs';

// Language-aware text metrics (the Mandarin/World-Lit breadth lesson):
// CJK text is denser than Latin (one hanzi carries roughly a word), so
// length floors weight CJK chars ×3; and terminal punctuation includes the
// CJK forms plus trailing closing quotes/brackets ("…literature.”").
const CJK_RE = /[\u2E80-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/;
export function weightedLength(text) {
  let n = 0;
  for (const ch of String(text)) n += CJK_RE.test(ch) ? 3 : 1;
  return n;
}
export const TERMINAL_PUNCT_RE = /[.!?:;。！？：；…][\s"'"”’」』）)\]]*$/u;

export const DEFAULT_CONSTRAINTS = Object.freeze({
  quizItems: 6,
  slides: [8, 15],
  discussionFollowUps: 3,
  assignmentSteps: 4,
  rubricBands: 3,
  faqEntries: 2,
});

export function buildLessonSlice(graph, lessonId, { constraints = DEFAULT_CONSTRAINTS } = {}) {
  const ordered = orderedLessons(graph);
  const index = ordered.findIndex((lesson) => lesson.id === lessonId);
  if (index === -1) throw new Error(`buildLessonSlice: unknown lesson "${lessonId}"`);
  const lesson = ordered[index];
  const concepts = conceptsForLesson(graph, lesson).map((concept) => ({
    id: concept.id,
    name: concept.name,
    kernelFacts: concept.kernelFacts,
    workedExamples: concept.workedExamples ?? [],
    anchorQuotes: concept.anchorQuotes ?? [],
    declaredGap: concept.declaredGap,
    misconceptions: misconceptionsForConcept(graph, concept.id).map(({ id, statement, corrective }) => ({
      id,
      statement,
      corrective,
    })),
  }));
  const outcomesById = indexById(graph.outcomes);
  const conceptById = new Map(graph.concepts.map((c) => [c.id, c]));
  const primerConcepts = (lesson.bridgePrimers ?? []).map((id) => ({
    id,
    name: conceptById.get(id)?.name ?? id,
    kernelFacts: conceptById.get(id)?.kernelFacts ?? [],
  }));
  return {
    primerConcepts,
    course: {
      title: graph.course.title,
      subject: graph.course.subject,
      level: graph.course.level,
    },
    lesson: { id: lesson.id, week: lesson.week, session: lesson.session, title: lesson.title, number: index + 1 },
    concepts,
    outcomes: lesson.outcomeIds.map((id) => outcomesById.get(id)).filter(Boolean),
    assessments: assessmentsForLesson(graph, lesson).map(({ id, kindOf, registryKey, weightPct }) => ({
      id,
      kindOf,
      registryKey,
      weightPct,
    })),
    sources: sourcesForConcepts(graph, [...lesson.introduces, ...lesson.reinforces]).map(({ id, title, url }) => ({
      id,
      title,
      url,
      whyRelevant: null,
    })),
    neighbors: {
      prevTitle: index > 0 ? ordered[index - 1].title : null,
      nextTitle: index < ordered.length - 1 ? ordered[index + 1].title : null,
    },
    constraints,
  };
}

// ── JSON Schema (sent as the provider response_format) ─────────────────────

export const AUTHORED_LESSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['plan', 'slides', 'quizItems', 'studyGuideSection', 'discussion', 'assignment', 'faqEntries', 'claims'],
  properties: {
    plan: {
      type: 'object',
      additionalProperties: false,
      required: ['segments'],
      properties: {
        segments: {
          type: 'array',
          minItems: 3,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['minutes', 'mode', 'text'],
            properties: {
              minutes: { type: 'integer', minimum: 5 },
              mode: { type: 'string', enum: ['teach', 'worked-example', 'activity', 'reteach'] },
              text: { type: 'string', minLength: 40 },
            },
          },
        },
      },
    },
    slides: {
      type: 'array',
      minItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'bullets', 'speakerNotes', 'altText'],
        properties: {
          title: { type: 'string', minLength: 3 },
          bullets: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string', minLength: 5 } },
          speakerNotes: { type: 'string', minLength: 20 },
          altText: { type: 'string', minLength: 10 },
        },
      },
    },
    quizItems: {
      type: 'array',
      minItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['stem', 'options', 'correctIndex', 'explanation', 'bloom', 'difficulty'],
        properties: {
          stem: { type: 'string', minLength: 20 },
          options: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string', minLength: 2 } },
          correctIndex: { type: 'integer', minimum: 0, maximum: 3 },
          explanation: { type: 'string', minLength: 30 },
          bloom: { type: 'string', enum: ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'] },
          difficulty: { type: 'string', enum: ['recall', 'apply', 'transfer'] },
        },
      },
    },
    studyGuideSection: { type: 'string', minLength: 200 },
    discussion: {
      type: 'object',
      additionalProperties: false,
      required: ['prompt', 'tension', 'followUps'],
      properties: {
        prompt: { type: 'string', minLength: 40 },
        tension: { type: 'string', minLength: 20 },
        followUps: { type: 'array', minItems: 2, items: { type: 'string', minLength: 15 } },
      },
    },
    assignment: {
      type: 'object',
      additionalProperties: false,
      required: ['task', 'steps', 'rubricBands'],
      properties: {
        task: { type: 'string', minLength: 60 },
        steps: { type: 'array', minItems: 3, items: { type: 'string', minLength: 15 } },
        rubricBands: {
          type: 'array',
          minItems: 3,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['band', 'observableBehavior'],
            properties: {
              band: { type: 'string', minLength: 2 },
              observableBehavior: { type: 'string', minLength: 30 },
            },
          },
        },
      },
    },
    faqEntries: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['q', 'a'],
        properties: { q: { type: 'string', minLength: 10 }, a: { type: 'string', minLength: 30 } },
      },
    },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'ref'],
        properties: {
          path: { type: 'string', minLength: 1 },
          ref: { type: ['string', 'null'] },
        },
      },
    },
  },
};

// ── structural validator (errors are retry feedback) ───────────────────────

export function validateAuthoredLesson(authored) {
  const errors = [];
  const need = (cond, msg) => {
    if (!cond) errors.push(msg);
  };
  need(authored && typeof authored === 'object', 'authored lesson must be an object');
  if (!authored || typeof authored !== 'object') return errors;

  const segments = authored.plan?.segments;
  need(Array.isArray(segments) && segments.length >= 3, 'plan.segments needs ≥3 segments');
  for (const [i, seg] of (segments || []).entries()) {
    need(Number.isInteger(seg?.minutes) && seg.minutes >= 5, `plan.segments[${i}].minutes must be an integer ≥5`);
    need(
      ['teach', 'worked-example', 'activity', 'reteach'].includes(seg?.mode),
      `plan.segments[${i}].mode invalid ("${seg?.mode}")`,
    );
    need(typeof seg?.text === 'string' && weightedLength(seg.text) >= 40, `plan.segments[${i}].text too short`);
  }
  need(
    (segments || []).some((seg) => seg?.mode === 'reteach'),
    'plan must include one reteach segment (the non-reader path)',
  );

  need(Array.isArray(authored.slides) && authored.slides.length >= 6, 'slides needs ≥6 entries');
  for (const [i, slide] of (authored.slides || []).entries()) {
    need(typeof slide?.title === 'string' && slide.title.length >= 3, `slides[${i}].title missing`);
    need(
      Array.isArray(slide?.bullets) && slide.bullets.length >= 1 && slide.bullets.length <= 8,
      `slides[${i}].bullets must have 1-5 entries (up to 8 tolerated; the renderer splits long slides)`,
    );
    for (const [bi, bullet] of (Array.isArray(slide?.bullets) ? slide.bullets : []).entries()) {
      need(
        typeof bullet === 'string' && TERMINAL_PUNCT_RE.test(bullet.trim()),
        `slides[${i}].bullets[${bi}] must be a complete statement ending with terminal punctuation — . ! ? : or the CJK equivalents 。！？： (closing quotes after it are fine; no clipped fragments)`,
      );
    }
    need(
      typeof slide?.speakerNotes === 'string' && weightedLength(slide.speakerNotes) >= 20,
      `slides[${i}].speakerNotes too short`,
    );
    need(typeof slide?.altText === 'string' && slide.altText.length >= 10, `slides[${i}].altText missing`);
  }

  need(Array.isArray(authored.quizItems) && authored.quizItems.length >= 3, 'quizItems needs ≥3 items');
  for (const [i, item] of (authored.quizItems || []).entries()) {
    need(typeof item?.stem === 'string' && weightedLength(item.stem) >= 20, `quizItems[${i}].stem too short`);
    need(Array.isArray(item?.options) && item.options.length === 4, `quizItems[${i}].options must have exactly 4`);
    need(
      Number.isInteger(item?.correctIndex) && item.correctIndex >= 0 && item.correctIndex <= 3,
      `quizItems[${i}].correctIndex out of range`,
    );
    need(
      typeof item?.explanation === 'string' && weightedLength(item.explanation) >= 30,
      `quizItems[${i}].explanation too short`,
    );
  }

  need(
    typeof authored.studyGuideSection === 'string' && weightedLength(authored.studyGuideSection) >= 200,
    'studyGuideSection too short (≥200 chars)',
  );
  need(
    typeof authored.discussion?.prompt === 'string' && weightedLength(authored.discussion.prompt) >= 40,
    'discussion.prompt too short',
  );
  need(
    Array.isArray(authored.discussion?.followUps) && authored.discussion.followUps.length >= 2,
    'discussion.followUps needs ≥2',
  );
  need(
    typeof authored.assignment?.task === 'string' && weightedLength(authored.assignment.task) >= 60,
    'assignment.task too short',
  );
  need(Array.isArray(authored.assignment?.steps) && authored.assignment.steps.length >= 3, 'assignment.steps needs ≥3');
  need(
    Array.isArray(authored.assignment?.rubricBands) && authored.assignment.rubricBands.length >= 3,
    'assignment.rubricBands needs ≥3 bands',
  );
  need(Array.isArray(authored.faqEntries) && authored.faqEntries.length >= 1, 'faqEntries needs ≥1');
  need(Array.isArray(authored.claims), 'claims must be an array');
  return errors;
}

// ── course-wide contract (syllabus prose, policies, FAQ intro) ──────────────

export const COURSE_WIDE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['courseDescription', 'policies', 'materials', 'faqIntro', 'logisticsFaq'],
  properties: {
    courseDescription: { type: 'string', minLength: 200 },
    policies: { type: 'string', minLength: 200 },
    materials: { type: 'array', minItems: 1, items: { type: 'string', minLength: 10 } },
    faqIntro: { type: 'string', minLength: 60 },
    logisticsFaq: {
      type: 'array',
      minItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['q', 'a'],
        properties: { q: { type: 'string', minLength: 10 }, a: { type: 'string', minLength: 30 } },
      },
    },
  },
};

export function validateCourseWide(authored) {
  const errors = [];
  if (!authored || typeof authored !== 'object') return ['course-wide must be an object'];
  if (typeof authored.courseDescription !== 'string' || authored.courseDescription.length < 200)
    errors.push('courseDescription too short (≥200 chars)');
  if (typeof authored.policies !== 'string' || authored.policies.length < 200) errors.push('policies too short');
  if (!Array.isArray(authored.materials) || authored.materials.length < 1) errors.push('materials needs ≥1 entry');
  if (typeof authored.faqIntro !== 'string' || authored.faqIntro.length < 60) errors.push('faqIntro too short');
  if (!Array.isArray(authored.logisticsFaq) || authored.logisticsFaq.length < 4)
    errors.push('logisticsFaq needs >=4 entries (grading, exams, late work, workload)');
  return errors;
}

// ── dedicated exam items (item 6 of the quality plan) ──────────────────────
// Exams get their own authored, transfer-level items drawn from the covered
// lessons' concepts — never recycled quiz items with rotated keys.

export const EXAM_ITEMS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'claims'],
  properties: {
    items: {
      type: 'array',
      minItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['stem', 'options', 'correctIndex', 'explanation', 'bloom', 'difficulty', 'conceptId'],
        properties: {
          stem: { type: 'string', minLength: 30 },
          options: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string', minLength: 2 } },
          correctIndex: { type: 'integer', minimum: 0, maximum: 3 },
          explanation: { type: 'string', minLength: 30 },
          bloom: { type: 'string', enum: ['understand', 'apply', 'analyze', 'evaluate', 'create'] },
          difficulty: { type: 'string', enum: ['apply', 'transfer'] },
          conceptId: { type: 'string' },
        },
      },
    },
    claims: {
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

export function validateExamItems(minItems = 6) {
  return (parsed) => {
    const errors = [];
    if (!Array.isArray(parsed?.items) || parsed.items.length < minItems) errors.push(`items needs >=${minItems}`);
    for (const [i, item] of (parsed?.items ?? []).entries()) {
      if (!Array.isArray(item?.options) || item.options.length !== 4)
        errors.push(`items[${i}].options must have exactly 4`);
      if (!Number.isInteger(item?.correctIndex) || item.correctIndex < 0 || item.correctIndex > 3)
        errors.push(`items[${i}].correctIndex out of range`);
      if (!['apply', 'transfer'].includes(item?.difficulty))
        errors.push(`items[${i}].difficulty must be apply|transfer`);
    }
    const indices = new Set((parsed?.items ?? []).map((item) => item.correctIndex));
    if ((parsed?.items ?? []).length >= 4 && indices.size < 3)
      errors.push('vary correctIndex across items (>=3 distinct positions)');
    if (!Array.isArray(parsed?.claims)) errors.push('claims must be an array');
    return errors;
  };
}

// Layout normalization (machine-legal: structure, never prose): a slide the
// model over-packs (>5 bullets) splits into continuation slides.
export function normalizeSlides(slides) {
  const out = [];
  for (const slide of slides) {
    if (!Array.isArray(slide.bullets) || slide.bullets.length <= 5) {
      out.push(slide);
      continue;
    }
    for (let i = 0; i < slide.bullets.length; i += 5) {
      out.push({
        ...slide,
        title: i === 0 ? slide.title : `${slide.title} (cont.)`,
        bullets: slide.bullets.slice(i, i + 5),
      });
    }
  }
  return out;
}
