// Items 1, 3, 4 of the quality plan: readings behind the trust ledger,
// kernel riches in the slice, and the new-template guard.

import { describe, it, expect } from 'vitest';
import { buildResearchMethods8 } from '../fixtures/graphs/researchMethods8.mjs';
import { findReadings, sourceInputFromGraph } from '../knowledge/sources.mjs';
import { loadShards, assembleKnowledge } from '../knowledge/assemble.mjs';
import { buildLessonSlice } from '../voice/contracts.mjs';
import { mockAuthorLesson } from '../voice/mockAuthor.mjs';
import { j7Echo } from '../judgment/checks/j7Echo.mjs';
import { makeGraph } from '../graph/schema.mjs';

function fakeProvider(results) {
  return async () => results;
}

describe('item 1 · readings via the borrowed source-finder (token-free, injected providers)', () => {
  it('keeps relevant candidates, drops keyword bycatch, never mints verified', async () => {
    const graph = buildResearchMethods8();
    graph.sources = []; // simulate an intake-born course with zero readings
    const relevant = {
      title: 'Research Methods in Psychology: Empirical Questions and Hypotheses',
      url: 'https://example.edu/research-methods-hypotheses',
      provider: 'openalex',
      license: 'CC BY 4.0',
      snippet: 'hypothesis testing and empirical research questions',
    };
    const junk = {
      title: '2025 Philippine general election',
      url: 'https://example.org/philippine-election',
      provider: 'wikipedia',
      license: 'CC BY-SA',
      snippet: 'election results by region',
    };
    const providers = {
      openalex: fakeProvider([relevant]),
      crossref: fakeProvider([junk]),
      wikipedia: fakeProvider([]),
      eric: fakeProvider([]),
      loc: fakeProvider([]),
      internetarchive: fakeProvider([]),
      openlibrary: fakeProvider([]),
    };
    const readings = await findReadings(graph, { providers, maxTopics: 3 });
    expect(readings.found).toBeGreaterThan(0);
    const urls = readings.sources.map((s) => s.url);
    expect(urls).toContain(relevant.url);
    expect(urls).not.toContain(junk.url);
    for (const source of readings.sources) {
      expect(source.trust).toBe('candidate'); // machine proposals never claim verification
      expect(source.conceptIds.length).toBeGreaterThan(0);
    }
    // The junk never surfaced: the borrowed finder's own v0.16.1 relevance
    // ranking pre-drops it before J10 (the second net) even runs — two
    // gates, either sufficient. J10's own drop behavior is unit-tested in
    // judgment.test.mjs.
    expect(readings.kept).toBe(readings.sources.length);
  });

  it('degrades honestly when providers are unreachable', async () => {
    const graph = buildResearchMethods8();
    graph.sources = [];
    const boom = async () => {
      throw new Error('network down');
    };
    const readings = await findReadings(graph, {
      providers: {
        openalex: boom,
        crossref: boom,
        wikipedia: boom,
        eric: boom,
        loc: boom,
        internetarchive: boom,
        openlibrary: boom,
      },
      maxTopics: 2,
    });
    expect(readings.sources).toEqual([]);
    expect(readings.kept).toBe(0);
  });

  it('maps the Trellis graph into the finder input shape', () => {
    const input = sourceInputFromGraph(buildResearchMethods8());
    expect(input.sessions).toHaveLength(8);
    expect(input.edges.teaches.length).toBeGreaterThan(8);
    expect(input.concepts[0].term).toBeTruthy();
  });
});

describe('item 3 · kernel riches ride into the slice', () => {
  it('assemble carries workedExamples and anchorQuotes; the slice exposes them', async () => {
    const shards = await loadShards();
    const graph = makeGraph({
      course: {
        id: 'c',
        title: 'Intro to Computer Science with Python',
        subject: 'computer science',
        level: 'intro',
        weeks: 1,
        sessionsPerWeek: 1,
      },
      concepts: [{ id: 'c-0', name: 'Conditionals and boolean logic' }],
      outcomes: [{ id: 'o1', statement: 'Apply conditionals', bloom: 'apply', conceptIds: [] }],
      lessons: [{ id: 'l1', week: 1, session: 1, title: 'Conditionals', introduces: ['c-0'], outcomeIds: ['o1'] }],
      assessments: [
        {
          id: 'a1',
          kindOf: 'quiz',
          registryKey: 'Quiz 1',
          anchor: { lessonId: 'l1' },
          outcomeIds: ['o1'],
          weightPct: 100,
        },
      ],
    });
    assembleKnowledge(graph, shards);
    const concept = graph.concepts[0];
    expect(concept.genomeRef).toMatch(/cs\//);
    expect(concept.workedExamples.length).toBeGreaterThanOrEqual(1);
    expect(concept.anchorQuotes.length).toBeGreaterThanOrEqual(1);
    expect(concept.anchorQuotes[0]).toHaveProperty('quote');
    const slice = buildLessonSlice(graph, 'l1');
    expect(slice.concepts[0].workedExamples).toEqual(concept.workedExamples);
    expect(slice.concepts[0].anchorQuotes).toEqual(concept.anchorQuotes);
  });
});

describe('item 4 · the new-template guard', () => {
  it('J7 blocks formulaic quiz explanations copied across lessons', () => {
    const graph = buildResearchMethods8();
    const authored = Object.fromEntries(
      graph.lessons.map((lesson) => [lesson.id, mockAuthorLesson(buildLessonSlice(graph, lesson.id))]),
    );
    const boiler =
      'The corrective sentence is quoted verbatim here and then the same application formula is appended to every single item in exactly the same words across the course.';
    for (const id of ['l2', 'l3']) {
      for (const item of authored[id].quizItems) item.explanation = boiler;
    }
    const findings = j7Echo(graph, authored);
    expect(findings.some((f) => f.severity === 'block' && f.path.includes('quizExplanations'))).toBe(true);
  });

  it('the golden mock package still passes J7 including the explanations surface', () => {
    const graph = buildResearchMethods8();
    const authored = Object.fromEntries(
      graph.lessons.map((lesson) => [lesson.id, mockAuthorLesson(buildLessonSlice(graph, lesson.id))]),
    );
    expect(j7Echo(graph, authored).filter((f) => f.severity === 'block')).toEqual([]);
  });
});

describe('item 6 · dedicated exam items + demand-driven FAQ', () => {
  it('mock pipeline ships dedicated transfer-level exam items and a logistics FAQ', async () => {
    const { runPipeline } = await import('../pipeline.mjs');
    const { buildResearchMethods8 } = await import('../fixtures/graphs/researchMethods8.mjs');
    await runPipeline({
      graph: buildResearchMethods8(),
      tier: 'draft',
      mockVoice: true,
      runId: 'test-item6-mock',
      generatedAt: '2026-07-03T00:00:00.000Z',
    });
    const { readFile } = await import('node:fs/promises');
    const midterm = await readFile('trellis/runs/test-item6-mock/package/Quiz & Exam Bank/Midterm Exam.md', 'utf8');
    expect(midterm).toMatch(/assesses /); // dedicated items, concept-tagged
    expect(midterm).not.toMatch(/drawn from lesson banks/); // no fallback note
    expect(midterm).toMatch(/transfer|apply/);
    const faq = await readFile(
      'trellis/runs/test-item6-mock/package/Course FAQ/Course FAQ - Introduction to Research Methods.md',
      'utf8',
    );
    expect(faq).toMatch(/## Grades, exams, and logistics/);
    expect(faq).toMatch(/How is my grade calculated\?/);
    expect(faq).toMatch(/Midterm Exam — 22%/);
  }, 30000);

  it('the render falls back honestly when an exam has no dedicated items', async () => {
    const { renderPackage } = await import('../render/deliverables.mjs');
    const { buildLessonSlice } = await import('../voice/contracts.mjs');
    const { mockAuthorLesson, mockAuthorCourseWide } = await import('../voice/mockAuthor.mjs');
    const graph = buildResearchMethods8();
    const authored = Object.fromEntries(
      graph.lessons.map((lesson) => [lesson.id, mockAuthorLesson(buildLessonSlice(graph, lesson.id))]),
    );
    const { files } = renderPackage({
      graph,
      authored,
      courseWide: mockAuthorCourseWide(graph),
      generatedAt: '2026-07-03T00:00:00.000Z',
    });
    expect(files.get('Quiz & Exam Bank/Midterm Exam.md')).toMatch(/drawn from lesson banks/);
  });
});

describe('item 2 · language-aware contract (the Mandarin/World-Lit breadth catch)', () => {
  it('accepts CJK terminal punctuation and closing quotes; still rejects clipped fragments', async () => {
    const { TERMINAL_PUNCT_RE, weightedLength } = await import('../voice/contracts.mjs');
    expect(TERMINAL_PUNCT_RE.test('声调决定意义。')).toBe(true);
    expect(TERMINAL_PUNCT_RE.test('你叫什么名字？')).toBe(true);
    expect(TERMINAL_PUNCT_RE.test('a canon that travels beyond its origin culture.”')).toBe(true);
    expect(TERMINAL_PUNCT_RE.test('ends mid clause without')).toBe(false);
    // One hanzi weighs ~a word: a short Chinese task passes the 60 floor.
    expect(weightedLength('用的表达所有格，写三句自我介绍并朗读。')).toBeGreaterThanOrEqual(60 * 0.9);
    expect(weightedLength('short latin')).toBeLessThan(60);
  });
});

describe('prerequisite-gap bridging (the seeded econ gap, graph-native)', () => {
  it('a forward prerequisite becomes a disclosed primer, not a hard block', async () => {
    const { runPipeline } = await import('../pipeline.mjs');
    const graph = buildResearchMethods8();
    // Seed the econ-style gap: lesson 2's concept requires one formally
    // introduced in week 6.
    graph.concepts.find((c) => c.id === 'c-hypothesis').requires.push('c-correlation-causation');
    const result = await runPipeline({
      graph,
      tier: 'draft',
      mockVoice: true,
      runId: 'test-bridge-mock',
      generatedAt: '2026-07-03T00:00:00.000Z',
    });
    expect(result.digest.prerequisiteBridges.join(' ')).toMatch(/Correlation versus causation/);
    expect(result.digest.judgment).toMatch(/prerequisite gap\(s\) bridged with inline primers/);
    const { readFile } = await import('node:fs/promises');
    const l2 = await readFile(
      'trellis/runs/test-bridge-mock/package/Lesson Plans/Lesson 02 - From Question to Hypothesis.md',
      'utf8',
    );
    expect(l2).toMatch(/Prerequisite gap bridged: this session opens with a primer/);
  }, 30000);
});

describe('slide layout normalization (the psych over-packed-deck failure)', () => {
  it('splits >5-bullet slides into continuation slides; never drops a bullet', async () => {
    const { normalizeSlides } = await import('../voice/contracts.mjs');
    const slides = normalizeSlides([
      { title: 'Memory systems', bullets: ['a.', 'b.', 'c.', 'd.', 'e.', 'f.', 'g.'], speakerNotes: 'n', altText: 't' },
      { title: 'Fine', bullets: ['x.'], speakerNotes: 'n', altText: 't' },
    ]);
    expect(slides).toHaveLength(3);
    expect(slides[0].bullets).toHaveLength(5);
    expect(slides[1].title).toBe('Memory systems (cont.)');
    expect(slides[1].bullets).toEqual(['f.', 'g.']);
    expect(slides[2].title).toBe('Fine');
  });
});
