// Intake — syllabus text → graph draft (one structured call) → V1–V7.
// The model proposes structure only (concepts, lessons, outcomes,
// assessments); kernel FACTS come from the genome/flywheel, and readings are
// proposed only as trust:'candidate' — intake can never mint a "verified"
// source (the trust classes stay honest from the first stage).

import { callModel } from './providers.mjs';
import { makeGraph } from './graph/schema.mjs';

const INTAKE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['course', 'concepts', 'outcomes', 'lessons', 'assessments'],
  properties: {
    course: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'subject', 'level', 'weeks', 'sessionsPerWeek'],
      properties: {
        title: { type: 'string' },
        subject: { type: 'string' },
        level: { type: 'string', enum: ['intro', 'intermediate', 'advanced'] },
        weeks: { type: 'integer', minimum: 1, maximum: 30 },
        sessionsPerWeek: { type: 'integer', minimum: 1, maximum: 5 },
      },
    },
    concepts: {
      type: 'array',
      minItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'requires'],
        properties: {
          id: { type: 'string', pattern: '^c-[a-z0-9-]+$' },
          name: { type: 'string', minLength: 3 },
          requires: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    outcomes: {
      type: 'array',
      minItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'statement', 'bloom', 'conceptIds'],
        properties: {
          id: { type: 'string', pattern: '^o[0-9]+$' },
          statement: { type: 'string', minLength: 15 },
          bloom: { type: 'string', enum: ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'] },
          conceptIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    lessons: {
      type: 'array',
      minItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'week', 'session', 'title', 'introduces', 'reinforces', 'outcomeIds'],
        properties: {
          id: { type: 'string', pattern: '^l[0-9]+$' },
          week: { type: 'integer', minimum: 1 },
          session: { type: 'integer', minimum: 1 },
          title: { type: 'string', minLength: 5 },
          introduces: { type: 'array', items: { type: 'string' } },
          reinforces: { type: 'array', items: { type: 'string' } },
          outcomeIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    assessments: {
      type: 'array',
      minItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'kindOf', 'registryKey', 'anchorLessonId', 'anchorWeek', 'outcomeIds', 'weightPct'],
        properties: {
          id: { type: 'string' },
          kindOf: { type: 'string', enum: ['quiz', 'exam', 'lab', 'project', 'essay', 'discussion'] },
          registryKey: { type: 'string', minLength: 4 },
          anchorLessonId: { type: ['string', 'null'] },
          anchorWeek: { type: ['integer', 'null'] },
          outcomeIds: { type: 'array', minItems: 1, items: { type: 'string' } },
          weightPct: { type: 'number', minimum: 0, maximum: 100 },
        },
      },
    },
  },
};

function validateIntake(parsed) {
  const errors = [];
  if (!parsed || typeof parsed !== 'object') return ['must be an object'];
  const conceptIds = new Set((parsed.concepts ?? []).map((c) => c.id));
  const outcomeIds = new Set((parsed.outcomes ?? []).map((o) => o.id));
  const lessonIds = new Set((parsed.lessons ?? []).map((l) => l.id));
  for (const c of parsed.concepts ?? []) {
    for (const r of c.requires) if (!conceptIds.has(r)) errors.push(`concept ${c.id} requires unknown "${r}"`);
  }
  for (const l of parsed.lessons ?? []) {
    for (const id of [...l.introduces, ...l.reinforces])
      if (!conceptIds.has(id)) errors.push(`lesson ${l.id} references unknown concept "${id}"`);
    for (const id of l.outcomeIds)
      if (!outcomeIds.has(id)) errors.push(`lesson ${l.id} references unknown outcome "${id}"`);
    if (l.introduces.length > 3)
      errors.push(
        `lesson ${l.id} introduces ${l.introduces.length} concepts — cap is 3; move the overflow to a later lesson's introduces or this lesson's reinforces`,
      );
    if (l.introduces.length === 0 && l.reinforces.length === 0) errors.push(`lesson ${l.id} teaches nothing`);
  }
  const assessed = new Set((parsed.assessments ?? []).flatMap((a) => a.outcomeIds));
  for (const o of parsed.outcomes ?? []) {
    if (!assessed.has(o.id)) errors.push(`outcome ${o.id} is never assessed — link it to a quiz or exam`);
  }
  for (const a of parsed.assessments ?? []) {
    if (a.anchorLessonId === null && a.anchorWeek === null)
      errors.push(`assessment ${a.id} needs anchorLessonId or anchorWeek`);
    if (a.anchorLessonId !== null && !lessonIds.has(a.anchorLessonId))
      errors.push(`assessment ${a.id} anchors to unknown lesson "${a.anchorLessonId}"`);
    for (const id of a.outcomeIds)
      if (!outcomeIds.has(id)) errors.push(`assessment ${a.id} references unknown outcome "${id}"`);
  }
  const weightSum = (parsed.assessments ?? []).reduce((s, a) => s + a.weightPct, 0);
  if (Math.abs(weightSum - 100) > 0.5)
    errors.push(`assessment weights sum to ${weightSum}; make them total exactly 100`);
  return errors;
}

export async function intakeSyllabus(
  syllabusText,
  { tier = 'cheap', ledger = null, budgetUsd = null, termStart = null } = {},
) {
  const { result } = await callModel({
    tier,
    stage: 'intake',
    ledger,
    budgetUsd,
    schema: INTAKE_SCHEMA,
    schemaName: 'course_graph_draft',
    validate: validateIntake,
    maxOutputTokens: 12000,
    system:
      `You convert a course syllabus into a typed course graph. Extract (never invent) the course shape: concepts with prerequisite edges, lessons in order, measurable outcomes with honest Bloom tags (the verb must match the tag), and the assessment registry with weights totaling 100. ` +
      `Rules: ≤3 concepts introduced per lesson (overflow goes to reinforces or a later lesson); every outcome must be assessed by something; registry keys are the assessment names a professor would print; ids: concepts "c-…", outcomes "oN", lessons "lN" in teaching order.`,
    user: syllabusText,
  });

  const graph = makeGraph({
    course: { id: 'course-intake', termStart, ...result.course },
    concepts: result.concepts.map((c) => ({ ...c, kernelFacts: [], misconceptionIds: [] })),
    misconceptions: [],
    outcomes: result.outcomes,
    lessons: result.lessons,
    assessments: result.assessments.map(({ anchorLessonId, anchorWeek, ...a }) => ({
      ...a,
      anchor: anchorLessonId !== null ? { lessonId: anchorLessonId } : { week: anchorWeek },
    })),
    sources: [],
  });
  return graph;
}
