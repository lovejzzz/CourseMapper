import { z } from 'zod';
import { FormattingSchema } from './richText';

const text = z.string().trim().min(1).max(12000);
const id = z.string().min(1).max(100);
export const SourceSchema = z.object({
  id,
  version: z.number().int().positive(),
  title: text,
  kind: z.enum(['provided', 'fictional']),
  text: z.string().min(1).max(60000),
});
export const EvidenceSchema = z.object({
  sourceId: id,
  quote: text,
  sourceVersion: z.number().int().positive().optional(),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().positive().optional(),
});
const MaterialOriginSchema = z.object({
  kind: z.enum(['source', 'fictional', 'adapted']),
  refs: z.array(EvidenceSchema).max(8),
});
export const CalculationSchema = z.object({
  dataset: id,
  operation: z.enum([
    'count',
    'sum',
    'mean',
    'median',
    'minimum',
    'maximum',
    'range',
    'iqr',
    'upperFence',
    'proportion',
  ]),
  expected: z.number().finite(),
});
export const DatasetSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  label: text,
  kind: z.enum(['observations', 'part-total']),
  values: z.array(z.number().finite()).min(1).max(100),
});
const numericFields = { datasets: z.array(DatasetSchema).max(4), calculations: z.array(CalculationSchema).max(10) };
export const AnswerPartSchema = z.object({
  title: text,
  text,
  length: z
    .object({
      unit: z.enum(['words', 'characters']),
      min: z.number().int().nonnegative(),
      max: z.number().int().positive().max(8000),
    })
    .nullable(),
});
export const ActivitySchema = z.object({
  title: text,
  kind: z.enum(['guided', 'independent', 'transfer']),
  minutes: z.number().int().min(3).max(90),
  material: text,
  materialOrigin: MaterialOriginSchema.optional(),
  ...numericFields,
  prompt: text,
  product: text,
  hint: text,
  answer: text,
  answerParts: z.array(AnswerPartSchema).min(1).max(5).optional(),
  reasoning: z.array(text).min(2).max(8),
  feedback: z
    .array(z.object({ error: text, diagnosis: text, nextStep: text }))
    .min(2)
    .max(4),
  rubric: z
    .array(
      z.object({
        criterion: text,
        fullCredit: text,
        partialCredit: text,
        noCredit: text,
        points: z.number().int().min(1).max(10),
      }),
    )
    .min(2)
    .max(4),
  evidence: z.array(EvidenceSchema).max(8),
});
export const LessonDraftSchema = z.object({
  title: text,
  objective: text,
  preparation: text,
  explanation: text,
  teachingMinutes: z.number().int().min(5).max(40),
  workedExample: z.object({
    material: text,
    materialOrigin: MaterialOriginSchema.optional(),
    prompt: text,
    steps: z.array(text).min(2).max(8),
    answer: text,
    evidence: z.array(EvidenceSchema).max(8),
    ...numericFields,
  }),
  activities: z.array(ActivitySchema).min(2).max(3),
  debrief: text,
  debriefMinutes: z.number().int().min(3).max(15),
  exitTicket: z.object({
    prompt: text,
    answer: text,
    nextLessonDecision: text,
    minutes: z.number().int().min(3).max(10),
    ...numericFields,
  }),
});
export const TeachingSchema = LessonDraftSchema.omit({ activities: true });
export const PracticeDesignSchema = z.object({
  demonstration: text.optional(),
  guided: text,
  independent: text,
  change: text,
});
export const ReviewFindingSchema = z.object({
  component: z.enum(['teaching', 'guided', 'independent']),
  quote: text,
  explanation: text,
  sourceIds: z.array(id).max(12),
  correction: text,
});
export const PedagogyReviewSchema = z.object({
  round: z.number().int().min(0).max(1),
  complete: z.boolean(),
  issues: z.array(ReviewFindingSchema).max(6),
});
export const PlanSchema = z.object({
  title: text,
  overview: text,
  prerequisites: text,
  finalProduct: text,
  goals: z.array(text).min(2).max(8),
  lessons: z
    .array(
      z.object({
        title: text,
        objective: text,
        scope: text,
        goalIndices: z.array(z.number().int().min(0).max(7)).min(1),
        sourceIds: z.array(id).max(12),
        buildsOn: z.array(z.number().int().min(0).max(11)).max(11),
        practice: PracticeDesignSchema.optional(),
      }),
    )
    .min(2)
    .max(12),
});
export const BriefSchema = z.object({
  description: z.string().trim().min(2).max(8000),
  audience: text,
  language: z.enum(['en', 'zh']),
  lessonCount: z.number().int().min(2).max(12),
  minutesPerLesson: z.number().int().min(30).max(120),
  allowFictional: z.boolean(),
});
const TaskSchema = ActivitySchema.extend({ id, version: z.number().int().positive() });
export const LessonSchema = LessonDraftSchema.omit({ activities: true }).extend({
  id,
  version: z.number().int().positive(),
  activities: z.array(TaskSchema).min(2).max(3),
  sourceVersions: z.record(id, z.number().int().positive()),
  review: z.enum(['pending', 'approved', 'stale']),
  pedagogy: PedagogyReviewSchema.optional(),
});
const RunSchema = z.object({
  id,
  stage: z.string(),
  lessonId: id.nullable(),
  promptVersion: text,
  seed: z.number().int(),
  temperature: z.number().optional(),
  thinking: z.boolean().optional(),
  maxTokens: z.number().int().optional(),
  requestHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  route: z.enum(['browser', 'server']),
  model: text,
  inputTokens: z.number(),
  outputTokens: z.number(),
  elapsedMs: z.number(),
  transportAttempts: z.number().int().min(1).max(3).optional(),
  finishReason: text,
  raw: z.string().max(120000),
  issues: z.array(z.string()),
  createdAt: text,
});
export const CourseSchema = z
  .object({
    schema: z.literal('edutool-course-v1'),
    id,
    revision: z.number().int().positive(),
    createdAt: text,
    updatedAt: text,
    brief: BriefSchema,
    sources: z.record(id, SourceSchema),
    plan: PlanSchema.nullable(),
    planLessonIds: z.array(id),
    lessonOrder: z.array(id),
    lessons: z.record(id, LessonSchema),
    drafts: z.record(
      id,
      z.object({
        teaching: TeachingSchema.nullable(),
        activities: z.array(ActivitySchema).max(2),
        pedagogy: PedagogyReviewSchema.optional(),
      }),
    ),
    status: z.enum(['planning', 'building', 'paused', 'review', 'ready']),
    runs: z.array(RunSchema),
    formatting: z.record(z.string().max(300), FormattingSchema).optional(),
    edits: z.array(
      z.object({ id, at: text, entityId: id, before: z.unknown(), after: z.unknown(), baseRevision: z.number() }),
    ),
  })
  .superRefine((course, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    const ids = course.planLessonIds;
    if (
      new Set(ids).size !== ids.length ||
      new Set(course.lessonOrder).size !== ids.length ||
      course.lessonOrder.length !== ids.length ||
      course.lessonOrder.some((id) => !ids.includes(id))
    )
      fail('Lesson order must contain each stable plan lesson exactly once.');
    if (
      course.plan
        ? course.plan.lessons.length !== ids.length || ids.length !== course.brief.lessonCount
        : ids.length !== 0
    )
      fail('The plan and its stable lesson IDs do not agree.');
    for (const [key, source] of Object.entries(course.sources))
      if (key !== source.id) fail('Source key does not match source identity.');
    const tasks = new Set<string>();
    for (const [key, lesson] of Object.entries(course.lessons)) {
      if (key !== lesson.id || !ids.includes(key)) fail('Lesson identity is outside the course plan.');
      for (const task of lesson.activities) {
        if (tasks.has(task.id)) fail('Task IDs must be unique across the course.');
        tasks.add(task.id);
      }
      if (Object.keys(lesson.sourceVersions).some((id) => !course.sources[id]))
        fail('Lesson has an unknown source dependency.');
    }
    if (Object.keys(course.drafts).some((id) => !ids.includes(id) || course.lessons[id]))
      fail('Draft must refer to an unfinished plan lesson.');
    course.plan?.lessons.forEach((lesson, index) => {
      if (lesson.buildsOn.some((i) => i >= index)) fail('A prerequisite must be an earlier lesson.');
      if (lesson.goalIndices.some((i) => i >= course.plan!.goals.length)) fail('Lesson has an unknown goal.');
      if (lesson.sourceIds.some((id) => !course.sources[id])) fail('Plan has an unknown source.');
    });
  });
export type Source = z.infer<typeof SourceSchema>;
export type Brief = z.infer<typeof BriefSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type LessonDraft = z.infer<typeof LessonDraftSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
export type Activity = z.infer<typeof ActivitySchema>;
export type Course = z.infer<typeof CourseSchema>;
export type Run = z.infer<typeof RunSchema>;
export type Calculation = z.infer<typeof CalculationSchema>;
export type Issue = { severity: 'block' | 'review'; code: string; lessonId?: string; taskId?: string; message: string };

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export function createCourse(brief: Brief, sources: Source[]): Course {
  BriefSchema.parse(brief);
  if (!sources.length && !brief.allowFictional)
    throw new Error('Add source material or allow clearly labelled fictional examples.');
  const now = new Date().toISOString();
  return CourseSchema.parse({
    schema: 'edutool-course-v1',
    id: newId('course'),
    revision: 1,
    createdAt: now,
    updatedAt: now,
    brief,
    sources: Object.fromEntries(sources.map((s) => [s.id, s])),
    plan: null,
    planLessonIds: [],
    lessonOrder: [],
    lessons: {},
    drafts: {},
    status: 'planning',
    runs: [],
    edits: [],
  });
}

export function revise(course: Course, patch: Partial<Course>): Course {
  return { ...course, ...patch, revision: course.revision + 1, updatedAt: new Date().toISOString() };
}

// Position is a view. It never determines the identity of lessons or their tasks.
export function reorderLessons(course: Course, order: string[], baseRevision: number): Course {
  if (baseRevision !== course.revision)
    throw new Error('The course changed. Reload the latest version before editing.');
  if (
    new Set(order).size !== order.length ||
    order.length !== course.lessonOrder.length ||
    order.some((id) => !course.lessonOrder.includes(id))
  )
    throw new Error('A reorder must contain each lesson exactly once.');
  return revise(course, {
    lessonOrder: [...order],
    edits: [
      ...course.edits,
      {
        id: newId('edit'),
        at: new Date().toISOString(),
        entityId: course.id,
        before: course.lessonOrder,
        after: order,
        baseRevision,
      },
    ],
  });
}

export function editLesson(course: Course, lesson: Lesson, baseRevision: number): Course {
  if (baseRevision !== course.revision) throw new Error('The course changed. Reload before editing.');
  const before = course.lessons[lesson.id];
  if (!before) throw new Error('Lesson not found.');
  if (
    lesson.activities.length !== before.activities.length ||
    lesson.activities.some((a) => !before.activities.some((t) => t.id === a.id)) ||
    new Set(lesson.activities.map((a) => a.id)).size !== lesson.activities.length
  )
    throw new Error('An edit must preserve task identities.');
  const activities = lesson.activities.map((task) => {
    const old = before.activities.find((a) => a.id === task.id)!;
    const unchanged = JSON.stringify({ ...task, version: 0 }) === JSON.stringify({ ...old, version: 0 });
    const materialOrigin =
      task.material !== old.material && old.materialOrigin?.kind === 'source'
        ? { ...old.materialOrigin, kind: 'adapted' as const }
        : old.materialOrigin;
    return { ...task, materialOrigin, version: old.version + (unchanged ? 0 : 1) };
  });
  const after = LessonSchema.parse({
    ...lesson,
    workedExample: {
      ...lesson.workedExample,
      materialOrigin:
        lesson.workedExample.material !== before.workedExample.material &&
        before.workedExample.materialOrigin?.kind === 'source'
          ? { ...before.workedExample.materialOrigin, kind: 'adapted' }
          : before.workedExample.materialOrigin,
    },
    activities,
    sourceVersions: before.sourceVersions,
    version: before.version + 1,
    review: 'pending',
  });
  return revise(course, {
    lessons: { ...course.lessons, [lesson.id]: after },
    plan: course.plan
      ? {
          ...course.plan,
          lessons: course.plan.lessons.map((spec, index) =>
            course.planLessonIds[index] === lesson.id
              ? { ...spec, title: after.title, objective: after.objective }
              : spec,
          ),
        }
      : null,
    status: Object.keys(course.lessons).length < course.brief.lessonCount ? 'paused' : 'review',
    edits: [
      ...course.edits,
      { id: newId('edit'), at: new Date().toISOString(), entityId: lesson.id, before, after, baseRevision },
    ],
  });
}

export function editSource(course: Course, sourceId: string, sourceText: string, baseRevision: number): Course {
  if (baseRevision !== course.revision) throw new Error('The course changed. Reload before editing.');
  const before = course.sources[sourceId];
  if (!before) throw new Error('Source not found.');
  const after = SourceSchema.parse({ ...before, text: sourceText, version: before.version + 1 });
  const lessons = Object.fromEntries(
    Object.entries(course.lessons).map(([id, lesson]) => [
      id,
      sourceId in lesson.sourceVersions ? { ...lesson, review: 'stale' as const } : lesson,
    ]),
  );
  const drafts = { ...course.drafts };
  // Every author/reviewer can now retrieve from every supplied source. A
  // partially authored draft must never resume against an old reading snapshot.
  for (const id of Object.keys(drafts)) delete drafts[id];
  return revise(course, {
    sources: { ...course.sources, [sourceId]: after },
    lessons,
    drafts,
    status: Object.keys(lessons).length < course.brief.lessonCount ? 'paused' : 'review',
    edits: [
      ...course.edits,
      {
        id: newId('edit'),
        at: new Date().toISOString(),
        entityId: sourceId,
        before,
        after,
        baseRevision,
      },
    ],
  });
}

export function materializeLesson(draft: LessonDraft, lessonId: string, course: Course): Lesson {
  const refs = new Set(
    [...draft.workedExample.evidence, ...draft.activities.flatMap((a) => a.evidence)].map((e) => e.sourceId),
  );
  // The explanation and review can depend on any retrieved reading even when
  // no answer quotes it and the plan accidentally omits its source ID.
  for (const id of Object.keys(course.sources)) refs.add(id);
  return {
    ...draft,
    id: lessonId,
    version: 1,
    review: 'pending',
    sourceVersions: Object.fromEntries(
      [...refs].filter((id) => course.sources[id]).map((id) => [id, course.sources[id].version]),
    ),
    activities: draft.activities.map((a) => ({ ...a, id: newId('task'), version: 1 })),
  };
}

export function rebuildLesson(course: Course, lessonId: string, baseRevision: number): Course {
  if (baseRevision !== course.revision) throw new Error('The course changed. Reload before rebuilding.');
  if (!course.planLessonIds.includes(lessonId)) throw new Error('Lesson not found.');
  const before = course.lessons[lessonId] ?? course.drafts[lessonId];
  const lessons = { ...course.lessons };
  delete lessons[lessonId];
  const drafts = { ...course.drafts };
  delete drafts[lessonId];
  return revise(course, {
    lessons,
    drafts,
    status: 'paused',
    edits: [
      ...course.edits,
      {
        id: newId('edit'),
        at: new Date().toISOString(),
        entityId: lessonId,
        before,
        after: null,
        baseRevision,
      },
    ],
  });
}
