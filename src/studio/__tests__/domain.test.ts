import { describe, expect, it } from 'vitest';
import { CourseSchema, editLesson, editSource, reorderLessons } from '../domain';
import { sourceSpans, bindEvidence, evidenceSelectionSchema } from '../evidence';
import { approveLesson, auditCourse, calculate, resolveCalculations, verifyActivity } from '../verify';
import { courseBlocks, exportCourse } from '../export';

import { source, draft, completeCourse } from './fixtures';

describe('stable course entities', () => {
  it('moves complete lessons without attaching another lesson’s tasks or annotations', () => {
    const c = completeCourse();
    const [first, second] = c.lessonOrder;
    c.lessons[first].activities[0].answer = 'FIRST teacher edit';
    c.lessons[second].activities[0].answer = 'SECOND teacher edit';
    const moved = reorderLessons(c, [second, first], c.revision);
    expect(moved.lessons).toBe(c.lessons);
    expect(moved.planLessonIds).toEqual([first, second]);
    expect(moved.lessons[moved.lessonOrder[0]].activities[0].answer).toBe('SECOND teacher edit');
    expect(() => reorderLessons(c, [first, first], c.revision)).toThrow();
    expect(() => reorderLessons(c, [second, first], c.revision - 1)).toThrow();
  });
  it('invalidates only dependent lessons when a source changes and preserves human content', () => {
    const c = completeCourse();
    const [first, second] = c.lessonOrder;
    c.lessons[first].review = 'approved';
    c.lessons[second].review = 'approved';
    c.lessons[second].sourceVersions = {};
    const next = editSource(c, source.id, 'A revised record.', c.revision);
    expect(next.lessons[first].review).toBe('stale');
    expect(next.lessons[second]).toBe(c.lessons[second]);
    expect(next.lessons[first].activities).toBe(c.lessons[first].activities);
    expect(() => approveLesson(next, next.lessons[first])).toThrow();
    expect(next.edits[0].before).toEqual(source);
  });
  it('keeps task IDs and records the real before/after of an instructor edit', () => {
    const c = completeCourse();
    const old = c.lessons[c.lessonOrder[0]];
    const edited = editLesson(c, { ...old, explanation: 'A teacher-authored explanation.' }, c.revision);
    expect(edited.lessons[old.id].activities[0].id).toBe(old.activities[0].id);
    expect(edited.edits[0].before).toEqual(old);
    expect(edited.lessons[old.id].review).toBe('pending');
  });
  it('uses the instructor’s revised objective on a later rebuild and preserves incomplete status', () => {
    const c = completeCourse();
    const old = c.lessons[c.lessonOrder[0]];
    delete c.lessons[c.lessonOrder[1]];
    const edited = editLesson(
      c,
      { ...old, title: 'New focus', objective: 'Compare sensitivity using changed data.' },
      c.revision,
    );
    expect(edited.plan!.lessons[0].objective).toBe('Compare sensitivity using changed data.');
    expect(edited.plan!.lessons[0].title).toBe('New focus');
    expect(edited.status).toBe('paused');
  });
  it('drops source-dependent partial generation so resume cannot silently reuse old material', () => {
    const c = completeCourse();
    const id = c.lessonOrder[0];
    const { activities, ...teaching } = draft();
    delete c.lessons[id];
    c.drafts[id] = { teaching, activities: [activities[0]] };
    const next = editSource(c, source.id, 'A revised record.', c.revision);
    expect(next.drafts[id]).toBeUndefined();
    expect(next.status).toBe('paused');
  });
  it('increments edited task versions once per save and rejects changing their identity', () => {
    const c = completeCourse();
    const old = c.lessons[c.lessonOrder[0]];
    const changed = {
      ...old,
      activities: old.activities.map((a, i) =>
        i ? a : { ...a, answer: 'A complete instructor correction.', version: 100 },
      ),
    };
    const next = editLesson(c, changed, c.revision).lessons[old.id];
    expect(next.activities[0].version).toBe(2);
    expect(next.activities[1].version).toBe(1);
    changed.activities[0].id = 'another-task';
    expect(() => editLesson(c, changed, c.revision)).toThrow('identities');
  });
  it('rejects imported identity corruption while permitting a genuinely partial course', () => {
    const c = completeCourse();
    expect(CourseSchema.safeParse(c).success).toBe(true);
    const corrupt = structuredClone(c);
    corrupt.lessonOrder[0] = 'outside-plan';
    expect(CourseSchema.safeParse(corrupt).success).toBe(false);
    delete c.lessons[c.lessonOrder[0]];
    expect(CourseSchema.safeParse(c).success).toBe(true);
  });
});

describe('source span selection', () => {
  it('keeps explicitly labelled records separately selectable without changing their text', () => {
    const reading = {
      ...source,
      text: 'Fictional packet. [L1] The room closes at eight. [L2] No opening time is recorded.',
    };
    const spans = sourceSpans([reading]);
    expect(spans.map((s) => s.quote)).toEqual([
      'Fictional packet.',
      '[L1] The room closes at eight.',
      '[L2] No opening time is recorded.',
    ]);
    expect(reading.text.slice(spans[2].start, spans[2].end)).toBe(spans[2].quote);
  });
  it('prefers an earlier sentence ending over cutting the next source record at a space', () => {
    const first = 'A full recorded statement with context. '.repeat(14);
    const reading = {
      ...source,
      text: first + 'The next record has details that must stay together until its final punctuation.',
    };
    const spans = sourceSpans([reading]);
    expect(spans[0].quote.endsWith('.')).toBe(true);
    expect(spans[1].quote).toBe('The next record has details that must stay together until its final punctuation.');
  });
  it('binds source addresses to exact stored text in both languages, including leading spaces and repeated sentences', () => {
    const reading = { ...source, text: '  First fact. Second fact.\n\n第一条记录。第二条记录！\nFirst fact.' };
    const spans = sourceSpans([reading]);
    expect(spans.length).toBe(3);
    for (const span of spans) expect(reading.text.slice(span.start, span.end)).toBe(span.quote);
    const bound = bindEvidence([{ spanId: spans[1].spanId }], spans)[0];
    expect(bound.quote).toBe('第一条记录。第二条记录！');
    expect(bound.sourceVersion).toBe(1);
    expect(() => bindEvidence([{ spanId: 'fabricated' }], spans)).toThrow('Unknown');
    expect(evidenceSelectionSchema(spans).safeParse([{ spanId: 'fabricated' }]).success).toBe(false);
    expect(sourceSpans([{ ...reading, version: 2 }])[0].spanId).not.toBe(spans[0].spanId);
  });
});

describe('executable mathematical answers', () => {
  it('uses median-of-halves with an excluded central observation and preserves input order', () => {
    const values = [11, 1, 4, 2, 3, 2, 4, 3];
    expect(calculate('mean', values)).toBe(3.75);
    expect(calculate('median', values)).toBe(3);
    expect(calculate('iqr', values)).toBe(2);
    expect(calculate('upperFence', values)).toBe(7);
    expect(values).toEqual([11, 1, 4, 2, 3, 2, 4, 3]);
    expect(calculate('iqr', [1, 2, 3, 4, 5])).toBe(3);
  });
  it('binds results to the actual dataset and re-renders after an input change', () => {
    const a = draft().activities[0];
    expect(resolveCalculations(a.answer, a)).toContain('Mean 4 and median 2.5');
    const edited = { ...a, datasets: [{ ...a.datasets[0], values: [1, 2, 3, 4] }] };
    expect(resolveCalculations(a.answer, edited)).toContain('Mean 2.5 and median 2.5');
    expect(resolveCalculations(a.answer, a)).toContain('Mean 4');
  });
  it('rejects incorrect operand types, nonexistent references and incorrect expected answers', () => {
    const a = draft().activities[0];
    expect(
      verifyActivity(
        { ...a, calculations: [{ dataset: 'missing', operation: 'mean', expected: 4 }] },
        { [source.id]: source },
        true,
      ).join(' '),
    ).toContain('Unknown');
    expect(
      verifyActivity(
        { ...a, calculations: [{ dataset: 'delays', operation: 'proportion', expected: 1 }] },
        { [source.id]: source },
        true,
      ).join(' '),
    ).toContain('part-total');
    expect(
      verifyActivity(
        {
          ...a,
          calculations: a.calculations.map((c) => ({ ...c, expected: c.operation === 'mean' ? 100 : c.expected })),
        },
        { [source.id]: source },
        true,
      ).join(' '),
    ).toContain('independently calculated answer is 4');
    expect(() => calculate('proportion', [16, 0])).toThrow();
  });
});

describe('classroom export boundary', () => {
  it('includes worked solutions but keeps independent answers and diagnostic feedback in the teacher guide', () => {
    const c = completeCourse();
    c.lessons[c.lessonOrder[0]].activities[0].answer += ' TEACHER_ONLY_ANSWER';
    c.lessons[c.lessonOrder[0]].activities[0].feedback[0].diagnosis = 'TEACHER_ONLY_DIAGNOSIS';
    const student = courseBlocks(c, 'student')
      .map((b) => b.text)
      .join('\n');
    const teacher = courseBlocks(c, 'teacher')
      .map((b) => b.text)
      .join('\n');
    expect(student).not.toContain('TEACHER_ONLY');
    expect(teacher).toContain('TEACHER_ONLY_ANSWER');
    expect(teacher).toContain('TEACHER_ONLY_DIAGNOSIS');
    expect(student).toContain('Mean 4 minutes; median 2.5 minutes.');
    expect(student).not.toMatch(/\{\{/);
  });
  it('refuses complete-course export for missing lessons or stale source dependencies', async () => {
    const c = completeCourse();
    delete c.lessons[c.lessonOrder[1]];
    expect(auditCourse(c).some((i) => i.code === 'missing-lesson')).toBe(true);
    await expect(exportCourse(c)).rejects.toThrow('before exporting');
  });
});
