import { describe, it, expect } from 'vitest';
import { buildLessonSlice, validateAuthoredLesson, validateCourseWide } from '../voice/contracts.mjs';
import { mockAuthorLesson, mockAuthorCourseWide } from '../voice/mockAuthor.mjs';
import { buildResearchMethods8 } from '../fixtures/graphs/researchMethods8.mjs';

describe('lesson slice assembly', () => {
  const graph = buildResearchMethods8();

  it('assembles a complete slice for a mid-course lesson', () => {
    const slice = buildLessonSlice(graph, 'l3');
    expect(slice.lesson.number).toBe(3);
    expect(slice.concepts.map((c) => c.id)).toContain('c-operationalization');
    expect(slice.concepts.find((c) => c.id === 'c-operationalization').misconceptions[0].corrective).toMatch(
      /operational/i,
    );
    expect(slice.neighbors.prevTitle).toMatch(/Hypothesis/i);
    expect(slice.neighbors.nextTitle).toMatch(/Sampling/i);
    expect(slice.sources.length).toBeGreaterThan(0);
  });

  it('first lesson has no previous neighbor', () => {
    const slice = buildLessonSlice(graph, 'l1');
    expect(slice.neighbors.prevTitle).toBeNull();
  });

  it('throws on an unknown lesson id', () => {
    expect(() => buildLessonSlice(graph, 'nope')).toThrow(/unknown lesson/);
  });
});

describe('mock author meets the authoring contract', () => {
  const graph = buildResearchMethods8();

  it('every lesson authors valid content', () => {
    for (const lesson of graph.lessons) {
      const slice = buildLessonSlice(graph, lesson.id);
      const authored = mockAuthorLesson(slice);
      const errors = validateAuthoredLesson(authored);
      expect(errors, `lesson ${lesson.id}: ${errors.join('; ')}`).toEqual([]);
    }
  });

  it('includes the mandatory reteach segment (non-reader path)', () => {
    const authored = mockAuthorLesson(buildLessonSlice(graph, 'l2'));
    expect(authored.plan.segments.some((s) => s.mode === 'reteach')).toBe(true);
  });

  it('quiz explanations confront the documented corrective when one exists', () => {
    const authored = mockAuthorLesson(buildLessonSlice(graph, 'l6'));
    const corrective = graph.misconceptions.find((m) => m.id === 'm-correlation-causes').corrective;
    const confronting = authored.quizItems.filter((item) => item.explanation.includes(corrective.slice(0, 40)));
    expect(confronting.length).toBeGreaterThan(0);
  });

  it('rotates correct answers across items', () => {
    const authored = mockAuthorLesson(buildLessonSlice(graph, 'l3'));
    const indices = new Set(authored.quizItems.map((item) => item.correctIndex));
    expect(indices.size).toBeGreaterThan(1);
  });

  it('course-wide content meets its contract', () => {
    expect(validateCourseWide(mockAuthorCourseWide(graph))).toEqual([]);
  });

  it('validator reports specific errors for broken content', () => {
    const authored = mockAuthorLesson(buildLessonSlice(graph, 'l1'));
    authored.plan.segments = authored.plan.segments.filter((s) => s.mode !== 'reteach');
    authored.quizItems[0].options = ['only', 'three', 'options'];
    const errors = validateAuthoredLesson(authored);
    expect(errors.join(' ')).toMatch(/reteach/);
    expect(errors.join(' ')).toMatch(/exactly 4/);
  });
});
