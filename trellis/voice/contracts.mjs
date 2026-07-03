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
  return {
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
    need(typeof seg?.text === 'string' && seg.text.length >= 40, `plan.segments[${i}].text too short`);
  }
  need(
    (segments || []).some((seg) => seg?.mode === 'reteach'),
    'plan must include one reteach segment (the non-reader path)',
  );

  need(Array.isArray(authored.slides) && authored.slides.length >= 6, 'slides needs ≥6 entries');
  for (const [i, slide] of (authored.slides || []).entries()) {
    need(typeof slide?.title === 'string' && slide.title.length >= 3, `slides[${i}].title missing`);
    need(
      Array.isArray(slide?.bullets) && slide.bullets.length >= 1 && slide.bullets.length <= 5,
      `slides[${i}].bullets must have 1–5 entries`,
    );
    for (const [bi, bullet] of (Array.isArray(slide?.bullets) ? slide.bullets : []).entries()) {
      need(
        typeof bullet === 'string' && /[.!?:]$/.test(bullet.trim()),
        `slides[${i}].bullets[${bi}] must be a complete statement ending with . ! ? or : (no clipped fragments)`,
      );
    }
    need(
      typeof slide?.speakerNotes === 'string' && slide.speakerNotes.length >= 20,
      `slides[${i}].speakerNotes too short`,
    );
    need(typeof slide?.altText === 'string' && slide.altText.length >= 10, `slides[${i}].altText missing`);
  }

  need(Array.isArray(authored.quizItems) && authored.quizItems.length >= 3, 'quizItems needs ≥3 items');
  for (const [i, item] of (authored.quizItems || []).entries()) {
    need(typeof item?.stem === 'string' && item.stem.length >= 20, `quizItems[${i}].stem too short`);
    need(Array.isArray(item?.options) && item.options.length === 4, `quizItems[${i}].options must have exactly 4`);
    need(
      Number.isInteger(item?.correctIndex) && item.correctIndex >= 0 && item.correctIndex <= 3,
      `quizItems[${i}].correctIndex out of range`,
    );
    need(
      typeof item?.explanation === 'string' && item.explanation.length >= 30,
      `quizItems[${i}].explanation too short`,
    );
  }

  need(
    typeof authored.studyGuideSection === 'string' && authored.studyGuideSection.length >= 200,
    'studyGuideSection too short (≥200 chars)',
  );
  need(
    typeof authored.discussion?.prompt === 'string' && authored.discussion.prompt.length >= 40,
    'discussion.prompt too short',
  );
  need(
    Array.isArray(authored.discussion?.followUps) && authored.discussion.followUps.length >= 2,
    'discussion.followUps needs ≥2',
  );
  need(
    typeof authored.assignment?.task === 'string' && authored.assignment.task.length >= 60,
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
  required: ['courseDescription', 'policies', 'materials', 'faqIntro'],
  properties: {
    courseDescription: { type: 'string', minLength: 200 },
    policies: { type: 'string', minLength: 200 },
    materials: { type: 'array', minItems: 1, items: { type: 'string', minLength: 10 } },
    faqIntro: { type: 'string', minLength: 60 },
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
  return errors;
}
