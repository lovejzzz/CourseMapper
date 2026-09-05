import { CourseSchema, editLesson, editSource, newId, revise, type Course } from './domain';
import { FormattingSchema, richPlainText, type RichNode } from './richText';
import { joinAnswerParts } from './answer';

export type FieldReference =
  | { kind: 'plan'; path: (string | number)[] }
  | { kind: 'lesson'; lessonId: string; path: (string | number)[] }
  | { kind: 'task'; lessonId: string; taskId: string; path: (string | number)[] }
  | { kind: 'source'; sourceId: string; path: ['text'] };
export function referenceKey(ref: FieldReference): string {
  const id =
    ref.kind === 'source'
      ? ref.sourceId
      : ref.kind === 'plan'
        ? ''
        : `${ref.lessonId}${ref.kind === 'task' ? '/' + ref.taskId : ''}`;
  return [ref.kind, id, ...ref.path].map((part) => encodeURIComponent(String(part))).join('/');
}
function entity(course: Course, ref: FieldReference): unknown {
  if (ref.kind === 'plan') return course.plan;
  if (ref.kind === 'source') return course.sources[ref.sourceId];
  const lesson = course.lessons[ref.lessonId];
  return ref.kind === 'lesson' ? lesson : lesson?.activities.find((task) => task.id === ref.taskId);
}
const forbidden = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'id',
  'version',
  'sourceVersions',
  'evidence',
  'materialOrigin',
  'kind',
]);
function access(object: unknown, path: (string | number)[], replacement?: string): string {
  if (!path.length) throw new Error('Select a material field to edit.');
  let cursor = object as Record<string | number, unknown>;
  for (const [index, part] of path.entries()) {
    if (forbidden.has(String(part)) || !cursor || typeof cursor !== 'object' || !Object.hasOwn(cursor, part))
      throw new Error('This material reference is no longer available.');
    if (index === path.length - 1) {
      if (typeof cursor[part] !== 'string') throw new Error('This field is not editable text.');
      if (replacement !== undefined) cursor[part] = replacement;
      return cursor[part] as string;
    }
    cursor = cursor[part] as Record<string | number, unknown>;
  }
  throw new Error('Invalid material reference.');
}
export function referenceText(course: Course, ref: FieldReference): string {
  return access(entity(course, ref), ref.path);
}
export function referenceFormatting(course: Course, ref: FieldReference): RichNode | undefined {
  const format = course.formatting?.[referenceKey(ref)];
  return format?.text === referenceText(course, ref) ? format.document : undefined;
}

export function editLinkedText(
  course: Course,
  ref: FieldReference,
  text: string,
  baseRevision: number,
  document?: RichNode,
): Course {
  if (baseRevision !== course.revision)
    throw new Error('The course changed. Reopen this edit against the latest version.');
  const oldText = referenceText(course, ref);
  const format = document ? FormattingSchema.parse({ text, document }) : undefined;
  if (format && richPlainText(format.document) !== text)
    throw new Error('The formatted document and its text must agree.');
  let next = course;
  if (text !== oldText) {
    if (ref.kind === 'source') next = editSource(course, ref.sourceId, text, baseRevision);
    else if (ref.kind === 'plan') {
      if (ref.path[0] === 'lessons')
        throw new Error('Edit the corresponding lesson so all linked materials update together.');
      const plan = structuredClone(course.plan!);
      access(plan, ref.path, text);
      next = revise(course, {
        plan,
        lessons: Object.fromEntries(
          Object.entries(course.lessons).map(([id, lesson]) => [id, { ...lesson, review: 'pending' as const }]),
        ),
        status: Object.keys(course.lessons).length < course.brief.lessonCount ? 'paused' : 'review',
        edits: [
          ...course.edits,
          {
            id: newId('edit'),
            at: new Date().toISOString(),
            entityId: course.id,
            before: course.plan,
            after: plan,
            baseRevision,
          },
        ],
      });
    } else {
      const lesson = structuredClone(course.lessons[ref.lessonId]);
      const target = ref.kind === 'lesson' ? lesson : lesson.activities.find((task) => task.id === ref.taskId);
      access(target, ref.path, text);
      for (const task of lesson.activities) {
        if (ref.kind === 'task' && task.id === ref.taskId && ref.path[0] === 'answer' && task.answerParts?.length)
          throw new Error('Edit the individual answer parts so their length requirements stay attached.');
        if (task.answerParts) task.answer = joinAnswerParts(task.answerParts);
      }
      next = editLesson(course, lesson, baseRevision);
    }
  }
  const key = referenceKey(ref);
  const formatting = { ...course.formatting };
  if (format) formatting[key] = format;
  else delete formatting[key];
  if (next === course) next = revise(course, {});
  return CourseSchema.parse({
    ...next,
    formatting,
    edits: [
      ...next.edits,
      {
        id: newId('edit'),
        at: new Date().toISOString(),
        entityId: ref.kind === 'plan' ? course.id : ref.kind === 'source' ? ref.sourceId : ref.lessonId,
        before: { reference: ref, text: oldText, formatting: course.formatting?.[key] ?? null },
        after: { reference: ref, text, formatting: format ?? null },
        baseRevision,
      },
    ],
  });
}

export function linkedHistory(course: Course, ref: FieldReference) {
  const key = referenceKey(ref);
  return course.edits
    .flatMap((edit) => {
      const before = edit.before as { reference?: FieldReference; text?: string; formatting?: unknown } | null;
      try {
        if (!before?.reference || typeof before.text !== 'string' || referenceKey(before.reference) !== key) return [];
        const format = FormattingSchema.safeParse(before.formatting);
        return [
          { id: edit.id, at: edit.at, text: before.text, document: format.success ? format.data.document : undefined },
        ];
      } catch {
        return [];
      }
    })
    .reverse();
}
