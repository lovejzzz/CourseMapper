import { describe, it, expect } from 'vitest';
import { FormattingSchema, RichDocumentSchema, plainDocument, richHtml, richPlainText } from '../richText';
import { editLinkedText, linkedHistory, referenceFormatting, referenceText, type FieldReference } from '../references';
import { completeCourse } from './fixtures';

describe('linked rich edits', () => {
  it('saves a formatted teacher edit against a stable task identity and invalidates its approval', () => {
    const course = completeCourse();
    const lesson = course.lessons[course.lessonOrder[0]];
    lesson.review = 'approved';
    const task = lesson.activities[0];
    const ref: FieldReference = { kind: 'task', lessonId: lesson.id, taskId: task.id, path: ['prompt'] };
    const document = plainDocument('Explain what changes when the largest delay doubles.');
    document.content![0].content![0].marks = [{ type: 'bold' }];
    const next = editLinkedText(course, ref, richPlainText(document), course.revision, document);
    expect(next.lessons[lesson.id].activities[0].id).toBe(task.id);
    expect(next.lessons[lesson.id].review).toBe('pending');
    expect(referenceText(next, ref)).toContain('largest delay doubles');
    expect(richHtml(referenceFormatting(next, ref)!)).toContain('<strong>Explain');
    const previous = linkedHistory(next, ref)[0];
    expect(previous.text).toBe(task.prompt);
    const restored = editLinkedText(next, ref, previous.text, next.revision, previous.document);
    expect(referenceText(restored, ref)).toBe(task.prompt);
    expect(linkedHistory(restored, ref)[0].text).toContain('largest delay doubles');
    // A later generated/field edit must never display an obsolete formatted answer.
    next.lessons[lesson.id].activities[0].prompt = 'A different question.';
    expect(referenceFormatting(next, ref)).toBeUndefined();
    expect(() => editLinkedText(next, ref, 'Another question.', course.revision)).toThrow('changed');
  });
  it('rejects executable links, hidden text mismatches and unbounded imported document trees', () => {
    const document = plainDocument('A safe statement.');
    expect(FormattingSchema.safeParse({ text: 'An unrelated claim.', document }).success).toBe(false);
    document.content![0].content![0].marks = [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }];
    expect(RichDocumentSchema.safeParse(document).success).toBe(false);
    const deep = plainDocument('Text');
    let node = deep;
    for (let i = 0; i < 20; i++) {
      node.content = [{ type: 'blockquote' }];
      node = node.content[0];
    }
    expect(RichDocumentSchema.safeParse(deep).success).toBe(false);
    expect(richHtml(plainDocument('<script>alert(1)</script>'))).not.toContain('<script>');
  });
});
