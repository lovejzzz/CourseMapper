// E4 mechanics (token-free): the replan drill. Lock the taught weeks, drop a
// lesson (snow day), and prove: locked lessons untouched, registry intact,
// concepts redistributed under the pacing cap, dirty set minimal.

import { describe, it, expect } from 'vitest';
import { buildResearchMethods8 } from '../fixtures/graphs/researchMethods8.mjs';
import { replanGraph, parseLockWeeks } from '../graph/replan.mjs';
import { dirtyLessons } from '../graph/diff.mjs';
import { validateGraph, blockers } from '../graph/validate.mjs';

describe('parseLockWeeks', () => {
  it('parses ranges and lists', () => {
    expect([...parseLockWeeks('1-4')]).toEqual([1, 2, 3, 4]);
    expect([...parseLockWeeks('1,3,5')]).toEqual([1, 3, 5]);
    expect(parseLockWeeks(null).size).toBe(0);
  });
});

describe('diff: dirtyLessons', () => {
  it('identical graphs are fully clean', () => {
    const a = buildResearchMethods8();
    const b = buildResearchMethods8();
    const delta = dirtyLessons(a, b);
    expect(delta.dirty).toEqual([]);
    expect(delta.unchanged).toHaveLength(8);
  });

  it('editing one concept dirties only the lessons that teach it', () => {
    const a = buildResearchMethods8();
    const b = buildResearchMethods8();
    b.concepts.find((c) => c.id === 'c-sampling').kernelFacts.push('A new anchored fact about sampling frames.');
    const delta = dirtyLessons(a, b);
    expect(delta.dirty).toEqual(['l4']); // only the sampling lesson re-authors
    expect(delta.unchanged).toHaveLength(7);
  });
});

describe('replanGraph: the snow-day drill', () => {
  it('drops week 6, preserves locked weeks 1–4 untouched, keeps the registry intact', () => {
    const before = buildResearchMethods8();
    const {
      graph: after,
      delta,
      locked,
      lockedDirty,
    } = replanGraph(before, {
      lockWeeks: parseLockWeeks('1-4'),
      dropLessonId: 'l6',
    });

    // Locked lessons never re-author.
    expect(locked).toEqual(['l1', 'l2', 'l3', 'l4']);
    expect(lockedDirty).toEqual([]);

    // The dropped lesson is gone; its concept moved forward under the cap.
    expect(after.lessons.some((lesson) => lesson.id === 'l6')).toBe(false);
    const l7 = after.lessons.find((lesson) => lesson.id === 'l7');
    expect([...l7.introduces, ...l7.reinforces]).toContain('c-correlation-causation');
    expect(l7.introduces.length).toBeLessThanOrEqual(3);

    // Registry: same count, keys verbatim, weights untouched, quiz re-anchored.
    expect(after.assessments).toHaveLength(before.assessments.length);
    expect(after.assessments.map((a) => a.registryKey).sort()).toEqual(
      before.assessments.map((a) => a.registryKey).sort(),
    );
    expect(after.assessments.find((a) => a.id === 'a-q6').anchor).toEqual({ lessonId: 'l7' });
    expect(after.assessments.reduce((s, a) => s + a.weightPct, 0)).toBe(100);

    // The replanned graph is still valid, and the dirty set is bounded:
    // receiving lesson + its new outcome/assessment surface + neighbors.
    expect(blockers(validateGraph(after))).toEqual([]);
    expect(delta.removed).toEqual(['l6']);
    expect(delta.dirty).toContain('l7');
    expect(delta.dirty.length).toBeLessThanOrEqual(3);
    for (const lockedId of locked) expect(delta.dirty).not.toContain(lockedId);
  });

  it('refuses to drop a locked lesson', () => {
    expect(() =>
      replanGraph(buildResearchMethods8(), { lockWeeks: parseLockWeeks('1-6'), dropLessonId: 'l6' }),
    ).toThrow(/locked week/);
  });

  it('overflow beyond the pacing cap lands honestly in reinforces, never dropped', () => {
    const graph = buildResearchMethods8();
    // Make every later lesson full so the dropped concepts cannot be introduced.
    for (const lesson of graph.lessons.filter((l) => l.week >= 7)) {
      while (lesson.introduces.length < 3) {
        const donor = graph.concepts.find(
          (c) => !graph.lessons.some((l2) => l2.introduces.includes(c.id)) && !lesson.introduces.includes(c.id),
        );
        if (!donor) break;
        lesson.introduces.push(donor.id);
      }
    }
    const { graph: after } = replanGraph(graph, { lockWeeks: parseLockWeeks('1-5'), dropLessonId: 'l6' });
    const conceptStillTaught = after.lessons.some((lesson) =>
      [...lesson.introduces, ...lesson.reinforces].includes('c-correlation-causation'),
    );
    expect(conceptStillTaught).toBe(true);
  });
});
