/**
 * v0.14.1 Phase 4 — knowledge activation (items 4.2, 2.7, 4.4, 4.5, 4.6).
 *
 * The V0.14 audit's genome findings, locked in as tests:
 *  - 4.2 CS Python / Physical Geology / Mandarin courses inferred NO
 *    discipline (cs shard missing, no geo regex, no language pattern) →
 *    inference now covers geo + lang.
 *  - 2.7 selectShardsForDisciplines returned [] silently on a coverage miss
 *    → uncovered disciplines surface through the loader, the linker result,
 *    and the genomeLink budget event.
 *  - 4.4 graph.edges.genomeLink had NO writer (the "(0 genome-linked)"
 *    digest lie) → attachEnrichmentToGraph writes { from, to } OBJECT edges
 *    (never tuples — Firestore rejects nested arrays, v0.13.1 rule).
 *  - 4.5 any kernel match fully resolved a lesson (World Lit shipped 1 key
 *    term vs 3-4 on model lessons) → thin matches stay on the model path as
 *    partial overlays and merge genome-first via mergeLessonPayloads.
 *  - 4.6 no course-level seen-set for kernel mcBank items (World Lit shipped
 *    L7's Q1+Q2 byte-identical in L14) → the linker tracks the next unused
 *    mcBank index per concept across the run; repeats draw fresh items,
 *    exhausted banks fall back to compiler frames, and worked examples ship
 *    first-occurrence-only.
 */
import { describe, expect, it } from 'vitest';

import {
  hydrateLibraryForDisciplines,
  inferCourseDisciplines,
  uncoveredDisciplinesForManifest,
} from '../src/lib/genome/libraryShardLoader.js';
import { runGenomeLinker } from '../src/lib/genome/runGenomeLinker.js';
import { composeLessonFromConcepts, mergeLessonPayloads } from '../src/lib/genome/composeLessonFromConcepts.js';
import { createKernelLibrary } from '../src/lib/genome/kernelLibrary.js';
import { buildQuizItemPlan } from '../src/lib/blueprintEnrichmentPass.js';
import { attachEnrichmentToGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import { courseGraphStats, createEmptyCourseGraph, validateCourseGraph } from '../src/lib/courseGraph/schema.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}

function makeKernel(id, term, { bankSize = 1, workedExample = false } = {}) {
  return {
    id,
    term,
    aliases: [],
    level: 'intro',
    definition: {
      text: `${term} is a core mechanism of the fixture discipline.`,
      anchor: { src: 'openstax:fixture-text', loc: '1.1', quote: `${term} definition quote.` },
      tier: 2,
    },
    facts: [
      {
        text: `${term} behaves predictably under fixture conditions.`,
        anchor: { src: 'openstax:fixture-text', loc: '1.2', quote: `${term} fact quote.` },
        tier: 2,
      },
    ],
    misconceptions: [
      {
        text: `Students assume ${term} is arbitrary.`,
        corrective: `${term} follows from the fixture evidence.`,
        tier: 2,
      },
    ],
    examples: [{ text: `${term} appears in the fixture field example.` }],
    mcBank: Array.from({ length: bankSize }, (_, position) =>
      position === 0
        ? {
            stem: `Which statement best describes ${term}?`,
            options: ['the right one', 'a near miss', 'a common myth', 'an off-topic claim'],
            answerIndex: 0,
            explanationFactRef: 0,
          }
        : {
            stem: `${term} bank item ${position}: which claim holds?`,
            options: [`right ${position}`, `miss ${position}`, `myth ${position}`, `offtopic ${position}`],
            answerIndex: 0,
            explanationFactRef: 0,
          },
    ),
    ...(workedExample
      ? {
          workedExamples: [
            {
              problem: `Compute the ${term} rate for the fixture sample.`,
              steps: ['Identify the inputs.', 'Apply the fixture relation.'],
              result: 'The rate is 2 fixture units.',
            },
          ],
        }
      : {}),
  };
}

const itemPlan = buildQuizItemPlan(6);

describe('4.2 discipline inference — geo, lang, cs', () => {
  it('routes Physical Geology to the geo shard key', () => {
    const disciplines = inferCourseDisciplines({
      courseName: 'Physical Geology',
      lessons: [{ title: 'Minerals and the Rock Cycle' }, { title: 'Plate Tectonics and Earthquakes' }],
    });
    expect(disciplines).toEqual(['geo']);
  });

  it('routes Elementary Mandarin Chinese I to the lang key (shard pending — visible gap, not silence)', () => {
    const disciplines = inferCourseDisciplines({
      courseName: 'Elementary Mandarin Chinese I',
      lessons: [{ title: 'Greetings and Self-Introductions' }, { title: 'Numbers, Dates, and Time' }],
    });
    expect(disciplines).toEqual(['lang']);
  });

  it('still routes Intro to Computer Science with Python to cs', () => {
    const disciplines = inferCourseDisciplines({
      courseName: 'Introduction to Computer Science with Python',
      lessons: [{ title: 'Variables and Expressions' }, { title: 'Loops and Conditionals' }],
    });
    expect(disciplines).toEqual(['cs']);
  });
});

describe('2.7 no-shard visibility', () => {
  const manifest = {
    version: 'test',
    shards: [{ id: 'econ-intro', discipline: 'econ', path: 'econ.json' }],
  };

  it('names the inferred disciplines the manifest does not cover', () => {
    expect(uncoveredDisciplinesForManifest(manifest, ['cs', 'econ'])).toEqual(['cs']);
    expect(uncoveredDisciplinesForManifest(manifest, ['geo', 'lang'])).toEqual(['geo', 'lang']);
    expect(uncoveredDisciplinesForManifest(manifest, [])).toEqual([]);
    // No genome deployed → every inferred discipline is uncovered.
    expect(uncoveredDisciplinesForManifest(null, ['cs'])).toEqual(['cs']);
  });

  it('hydration reports uncovered disciplines even when no genome is deployed', async () => {
    // Node has no served public/genome → loadGenomeManifest resolves null.
    const hydration = await hydrateLibraryForDisciplines({ addKernels: () => 0 }, ['cs']);
    expect(hydration.added).toBe(0);
    expect(hydration.uncoveredDisciplines).toEqual(['cs']);
  });

  it('the linker result carries uncoveredDisciplines for the budget event detail', () => {
    const library = createKernelLibrary({ storage: memoryStorage() });
    const result = runGenomeLinker({
      courseMap: { courseName: 'Intro to CS', lessons: [{ title: 'Lesson 1: Variables' }] },
      lessonIndices: [0],
      library,
      itemPlan,
      uncoveredDisciplines: ['cs'],
    });
    expect(result.uncoveredDisciplines).toEqual(['cs']);
    expect(result.telemetry.uncoveredDisciplines).toEqual(['cs']);
    expect(result.telemetry.resolvedFromGenome).toBe(0);
  });
});

describe('4.4 genomeLink edge writer', () => {
  function graphWithOneTaughtConcept() {
    const graph = createEmptyCourseGraph({ courseName: 'Edge Writer Test' });
    graph.sessions.push({ id: 's1', number: 1, title: 'Lesson 1' });
    graph.concepts.push({ id: 'c1', name: 'Plate Tectonics' });
    graph.edges.teaches.push({ from: 's1', to: 'c1' });
    return graph;
  }

  const genomeLinkedEnrichment = {
    lessonContent: {
      'lesson-1': {
        enrichmentSource: 'genome-linked',
        keyTerms: [{ term: 'Plate tectonics', definition: 'cited', source: 'OpenStax fixture text §1.1' }],
        quizItems: [],
        conceptProvenance: {
          source: 'genome-linked',
          conceptIds: ['geo/plate-tectonics', 'geo/seafloor-spreading'],
          citations: ['OpenStax fixture text §1.1'],
        },
      },
    },
  };

  it('writes one { from, to } object edge per provenance concept', () => {
    const graph = attachEnrichmentToGraph(graphWithOneTaughtConcept(), genomeLinkedEnrichment);
    expect(graph.edges.genomeLink).toEqual([
      { from: 'c1', to: 'geo/plate-tectonics' },
      { from: 'c1', to: 'geo/seafloor-spreading' },
    ]);
    expect(validateCourseGraph(graph).valid).toBe(true);

    // courseGraphStats picks them up: 1 linked concept, and the kernel-bearing
    // concept no longer counts as "authored" (the v0.14 overcount).
    const stats = courseGraphStats(graph);
    expect(stats.genomeLinkedConcepts).toBe(1);
    expect(stats.authoredConcepts).toBe(0);
  });

  it('also writes edges for genome-augmented payloads (4.5 merge keeps provenance)', () => {
    const graph = attachEnrichmentToGraph(graphWithOneTaughtConcept(), {
      lessonContent: {
        'lesson-1': {
          enrichmentSource: 'genome-augmented',
          keyTerms: [],
          quizItems: [],
          conceptProvenance: { source: 'genome-linked', conceptIds: ['geo/plate-tectonics'] },
        },
      },
    });
    expect(graph.edges.genomeLink).toEqual([{ from: 'c1', to: 'geo/plate-tectonics' }]);
  });

  it('is idempotent, initializes legacy graphs, and skips model payloads', () => {
    const graph = graphWithOneTaughtConcept();
    delete graph.edges.genomeLink; // pre-v0.13 graphs lack the collection
    attachEnrichmentToGraph(graph, genomeLinkedEnrichment);
    attachEnrichmentToGraph(graph, genomeLinkedEnrichment); // re-attach (re-derive path)
    expect(graph.edges.genomeLink).toHaveLength(2);

    const modelOnly = attachEnrichmentToGraph(graphWithOneTaughtConcept(), {
      lessonContent: { 'lesson-1': { enrichmentSource: 'lesson-content-enrichment', keyTerms: [], quizItems: [] } },
    });
    expect(modelOnly.edges.genomeLink).toEqual([]);
  });

  it('leaves NO nested arrays anywhere in the graph (Firestore-safe walk)', () => {
    const graph = attachEnrichmentToGraph(graphWithOneTaughtConcept(), genomeLinkedEnrichment);
    const offenders = [];
    const walk = (node, path) => {
      if (Array.isArray(node)) {
        node.forEach((item, index) => {
          if (Array.isArray(item)) offenders.push(`${path}[${index}]`);
          walk(item, `${path}[${index}]`);
        });
      } else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
      }
    };
    walk(graph, '$');
    expect(offenders, offenders.join(', ')).toEqual([]);
  });
});

describe('4.5 genome augments, never displaces', () => {
  const oneKernelLibrary = () => {
    const library = createKernelLibrary({ storage: memoryStorage() });
    library.addKernel(makeKernel('geo/plate-tectonics', 'Plate Tectonics'));
    return library;
  };
  const oneKernelCourse = {
    courseName: 'Physical Geology',
    lessons: [
      {
        title: 'Lesson 1: Plate Tectonics',
        sections: [{ topicSection: '1.1: plate tectonics', learningObjectives: 'Explain plate tectonics evidence.' }],
      },
    ],
  };

  it('a 1-kernel match stays unresolved (model path runs) with the composition stashed as a partial overlay', () => {
    const linked = runGenomeLinker({
      courseMap: oneKernelCourse,
      lessonIndices: [0],
      library: oneKernelLibrary(),
      itemPlan,
    });
    expect(linked.missingIndices).toContain(0);
    expect(linked.partialOverlays['lesson-1']).toBeTruthy();
    expect(linked.partialOverlays['lesson-1'].enrichmentSource).toBe('genome-linked');
    expect(linked.partialOverlays['lesson-1'].conceptProvenance.conceptIds).toEqual(['geo/plate-tectonics']);
    expect(linked.telemetry.partialFromGenome).toBe(1);
    // Genome-only runs (enrichment off / no model) still ship the cited
    // composition: the partial stays visible in lessonContent too.
    expect(linked.lessonContent['lesson-1']).toBe(linked.partialOverlays['lesson-1']);
  });

  it('mergeLessonPayloads: genome term first with its citation, model fills to par, dedup by name and stem', () => {
    const linked = runGenomeLinker({
      courseMap: oneKernelCourse,
      lessonIndices: [0],
      library: oneKernelLibrary(),
      itemPlan,
    });
    const genomePartial = linked.partialOverlays['lesson-1'];
    const modelPayload = {
      quizItems: [
        {
          index: 0,
          type: 'multiple_choice',
          // Byte-different case, same stem → deduped against the genome item.
          question: 'Which statement best describes plate tectonics?',
          options: ['w', 'x', 'y', 'z'],
          answerIndex: 1,
        },
        {
          index: 1,
          type: 'multiple_choice',
          question: 'What drives mantle convection?',
          options: ['a', 'b', 'c', 'd'],
          answerIndex: 0,
        },
        {
          index: 2,
          type: 'multiple_choice',
          question: 'Where do transform faults occur?',
          options: ['a', 'b', 'c', 'd'],
          answerIndex: 2,
        },
        { index: 3, type: 'short_answer', question: 'Explain subduction zone volcanism.', options: [], answerIndex: 0 },
      ],
      keyTerms: [
        { term: 'PLATE TECTONICS', definition: 'model definition, uncited' }, // dup of the genome term
        { term: 'Subduction', definition: 'model definition' },
        { term: 'Convergent boundary', definition: 'model definition' },
        { term: 'Transform fault', definition: 'model definition' },
      ],
      kernel: {
        facts: ['Model fact about mantle convection.'],
        scenario: { setup: 'Model scenario.', materials: 'maps' },
      },
      enrichmentSource: 'lesson-content-enrichment',
    };

    const merged = mergeLessonPayloads(genomePartial, modelPayload);
    expect(merged.enrichmentSource).toBe('genome-augmented');
    // Provenance preserved → 4.4 still writes the genomeLink edges.
    expect(merged.conceptProvenance).toBe(genomePartial.conceptProvenance);

    // Genome term leads and keeps its citation; model terms fill to 4 total.
    expect(merged.keyTerms).toHaveLength(4);
    expect(merged.keyTerms[0].term.toLowerCase()).toBe('plate tectonics');
    expect(merged.keyTerms[0].source).toMatch(/openstax/i);
    expect(merged.keyTerms.filter((term) => /plate tectonics/i.test(term.term))).toHaveLength(1);
    expect(merged.keyTerms.map((term) => term.term)).toContain('Subduction');

    // Quiz stems are unique, the genome's cited MC wins its slot, and every
    // item still carries a numeric index for the overlay's slot mapping.
    const stems = merged.quizItems.map((item) => item.question.toLowerCase());
    expect(new Set(stems).size).toBe(stems.length);
    const tectonicsItem = merged.quizItems.find((item) => /describes plate tectonics/i.test(item.question));
    expect(tectonicsItem.options).toContain('the right one'); // genome version, not the model dup
    expect(merged.quizItems.every((item) => Number.isFinite(item.index))).toBe(true);

    // Null-side behavior: a missing model payload leaves the genome partial
    // standing; a missing genome partial leaves the model payload untouched.
    expect(mergeLessonPayloads(genomePartial, null)).toBe(genomePartial);
    expect(mergeLessonPayloads(null, modelPayload)).toBe(modelPayload);
  });

  it('full resolution is unchanged for rich matches (>=2 kernels, >=3 composed key terms)', () => {
    const library = createKernelLibrary({ storage: memoryStorage() });
    library.addKernel(makeKernel('geo/plate-tectonics', 'Plate Tectonics'));
    library.addKernel(makeKernel('geo/seafloor-spreading', 'Seafloor Spreading'));
    library.addKernel(makeKernel('geo/continental-drift', 'Continental Drift'));
    const course = {
      courseName: 'Physical Geology',
      lessons: [
        {
          title: 'Lesson 1: Plate Tectonics, Seafloor Spreading, and Continental Drift',
          sections: [
            {
              topicSection: '1.1: plate tectonics and seafloor spreading',
              learningObjectives: 'Explain continental drift and plate tectonics evidence.',
            },
            { topicSection: '1.2: continental drift' },
          ],
        },
      ],
    };

    const linked = runGenomeLinker({ courseMap: course, lessonIndices: [0], library, itemPlan });
    expect(linked.lessonContent['lesson-1'].enrichmentSource).toBe('genome-linked');
    expect(linked.lessonContent['lesson-1'].keyTerms.length).toBeGreaterThanOrEqual(3);
    expect(linked.missingIndices).toEqual([]);
    expect(linked.partialOverlays).toEqual({});
    expect(linked.telemetry.resolvedFromGenome).toBe(1);
    expect(linked.telemetry.partialFromGenome).toBe(0);
  });
});

describe('4.6 cross-lesson quiz dedupe — mcBank offsets + first-occurrence worked example', () => {
  // conceptResolver deliberately resolves the same concept in multiple
  // lessons (coherence boost) — the fix is in what each repeat DRAWS, not in
  // the resolution. itemPlan(6) has 4 MC slots. v0.14.3 D1(b)+D3: a lesson
  // with unused bank items beyond its slots now ALSO consumes a contiguous
  // prefix of the tail — one mcWalkthrough (deck application slide) and up
  // to two extension quiz items — so a 6-item bank is fully consumed by one
  // lesson (4 slots + walkthrough + 1 extension) and splits 6 / 0 / 0.
  const bankStems = (term, size) =>
    Array.from({ length: size }, (_, position) =>
      position === 0 ? `Which statement best describes ${term}?` : `${term} bank item ${position}: which claim holds?`,
    );

  const repeatedConceptCourse = (lessonCount) => ({
    courseName: 'World Literature',
    lessons: Array.from({ length: lessonCount }, (_, position) => ({
      title: `Lesson ${position + 1}: Literary Argument ${['Foundations', 'in the Novel', 'Capstone'][position] || 'Revisited'}`,
      sections: [{ topicSection: `${position + 1}.1: literary argument` }],
    })),
  });

  const litLibrary = () => {
    const library = createKernelLibrary({ storage: memoryStorage() });
    library.addKernel(makeKernel('lit/literary-argument', 'Literary Argument', { bankSize: 6, workedExample: true }));
    return library;
  };

  const mcStemsOf = (payload) =>
    (payload?.quizItems || []).filter((item) => item.type === 'multiple_choice').map((item) => item.question);

  it('a repeated concept draws the NEXT unused mcBank items — zero verbatim stem overlap (the WL L7=L14 dup)', () => {
    // v0.14.3 depth slice: a 6-item bank is fully drained by lesson A
    // (slots + walkthrough + extension), so exercising the cross-lesson
    // cursor now needs a deeper bank — 12 items leave lesson B real draws.
    const library = createKernelLibrary({ storage: memoryStorage() });
    library.addKernel(makeKernel('lit/literary-argument', 'Literary Argument', { bankSize: 12, workedExample: true }));
    const linked = runGenomeLinker({
      courseMap: repeatedConceptCourse(2),
      lessonIndices: [0, 1],
      library,
      itemPlan,
    });
    const stems = bankStems('Literary Argument', 12);
    // Lesson A: items 0..3 fill the 4 MC slots; item 4 becomes the deck
    // walkthrough (v0.14.3 D1b); items 5..6 become extension quiz items
    // (v0.14.3 D3) — 7 consumed in total.
    expect(mcStemsOf(linked.lessonContent['lesson-1'])).toEqual([...stems.slice(0, 4), ...stems.slice(5, 7)]);
    expect(linked.lessonContent['lesson-1'].mcWalkthrough.question).toBe(stems[4]);
    // Lesson B starts at the course-level cursor (item 7): slots take 7..10,
    // item 11 becomes ITS walkthrough, nothing reused.
    expect(mcStemsOf(linked.lessonContent['lesson-2'])).toEqual(stems.slice(7, 11));
    expect(linked.lessonContent['lesson-2'].mcWalkthrough.question).toBe(stems[11]);
    const stemsA = new Set([
      ...mcStemsOf(linked.lessonContent['lesson-1']),
      linked.lessonContent['lesson-1'].mcWalkthrough.question,
    ]);
    expect(mcStemsOf(linked.lessonContent['lesson-2']).filter((stem) => stemsA.has(stem))).toEqual([]);
    // Lesson B's items keep numeric slot indices for the quiz overlay.
    expect(linked.lessonContent['lesson-2'].quizItems.every((item) => Number.isFinite(item.index))).toBe(true);
  });

  it('bank exhaustion: the third lesson gets NO genome MC items and no crash — compiler frames fill its slots', () => {
    const linked = runGenomeLinker({
      courseMap: repeatedConceptCourse(3),
      lessonIndices: [0, 1, 2],
      library: litLibrary(),
      itemPlan,
    });
    const third = linked.lessonContent['lesson-3'];
    expect(third).toBeTruthy();
    expect(mcStemsOf(third)).toEqual([]);
    // The composition still ships its cited key term (a legitimate recap) —
    // empty quiz slots fall back to the compiler's deterministic frames
    // because overlayEnrichedQuizItems maps by index and skips absent ones.
    expect(third.keyTerms).toHaveLength(1);
    expect(third.keyTerms[0].term).toBe('Literary Argument');
  });

  it('the worked example ships first-occurrence-only (the v0.12.1 seenScaffolds rule)', () => {
    const linked = runGenomeLinker({
      courseMap: repeatedConceptCourse(2),
      lessonIndices: [0, 1],
      library: litLibrary(),
      itemPlan,
    });
    expect(linked.lessonContent['lesson-1'].workedExample).toBeTruthy();
    expect(linked.lessonContent['lesson-1'].workedExample.problem).toMatch(/Literary Argument rate/);
    expect(linked.lessonContent['lesson-2'].workedExample).toBeUndefined();
    // The repeat still re-states its key term — only the walkthrough is
    // first-occurrence-only.
    expect(linked.lessonContent['lesson-2'].keyTerms[0].term).toBe('Literary Argument');
  });

  it('distinct concepts are unaffected: each bank has its own independent cursor', () => {
    const library = createKernelLibrary({ storage: memoryStorage() });
    library.addKernel(makeKernel('geo/plate-tectonics', 'Plate Tectonics', { bankSize: 6, workedExample: true }));
    library.addKernel(makeKernel('geo/seafloor-spreading', 'Seafloor Spreading', { bankSize: 6, workedExample: true }));
    const linked = runGenomeLinker({
      courseMap: {
        courseName: 'Physical Geology',
        lessons: [
          { title: 'Lesson 1: Plate Tectonics', sections: [{ topicSection: '1.1: plate tectonics' }] },
          { title: 'Lesson 2: Seafloor Spreading', sections: [{ topicSection: '2.1: seafloor spreading' }] },
        ],
      },
      lessonIndices: [0, 1],
      library,
      itemPlan,
    });
    // Lesson 2's concept was never consumed before — it starts at item 0,
    // even though lesson 1 advanced the cursor for ITS concept. v0.14.3
    // depth slice: items 0..3 fill the slots, item 4 becomes the deck
    // walkthrough, item 5 the lone extension quiz item.
    const spreadingStems = bankStems('Seafloor Spreading', 6);
    expect(mcStemsOf(linked.lessonContent['lesson-2'])).toEqual([...spreadingStems.slice(0, 4), spreadingStems[5]]);
    expect(linked.lessonContent['lesson-2'].mcWalkthrough.question).toBe(spreadingStems[4]);
    // And its own worked example ships — the seen-set is per concept.
    expect(linked.lessonContent['lesson-2'].workedExample.problem).toMatch(/Seafloor Spreading rate/);
  });

  it('merge backstop: a genome item that survived lesson A’s model merge cannot reappear in lesson B', () => {
    const linked = runGenomeLinker({
      courseMap: repeatedConceptCourse(2),
      lessonIndices: [0, 1],
      library: litLibrary(),
      itemPlan,
    });
    // Thin matches (1 kernel) ride the model path: merge lesson A's partial
    // overlay with a model payload, exactly as useDeliverables does.
    const mergedA = mergeLessonPayloads(linked.partialOverlays['lesson-1'], {
      quizItems: [
        { index: 3, type: 'short_answer', question: 'Model short answer for lesson A.', options: [], answerIndex: 0 },
      ],
      keyTerms: [{ term: 'Counterargument', definition: 'model definition' }],
      enrichmentSource: 'lesson-content-enrichment',
    });
    const mergedStemsA = new Set(mergedA.quizItems.map((item) => item.question));
    // The offset is the primary guarantee; mergeLessonPayloads' stem dedupe
    // is only the within-lesson backstop. Nothing lesson A shipped — merged
    // or not — can recur in lesson B's composition.
    for (const stem of mcStemsOf(linked.partialOverlays['lesson-2'])) {
      expect(mergedStemsA.has(stem)).toBe(false);
    }
  });

  it('composeLessonFromConcepts honors mcOffsets directly and reports true consumption', () => {
    const kernel = makeKernel('lit/literary-argument', 'Literary Argument', { bankSize: 6 });
    const composed = composeLessonFromConcepts([kernel], {}, { itemPlan, mcOffsets: new Map([[kernel.id, 4]]) });
    expect(mcStemsOf(composed.payload)).toEqual(bankStems('Literary Argument', 6).slice(4, 6));
    // Consumption reports what the projection EMITTED (2 items), not the
    // 4-slot capacity — the linker advances cursors by truth.
    expect(composed.consumption.mcConsumed[kernel.id]).toBe(2);
    expect(composed.consumption.workedExampleConceptId).toBeNull();
  });
});
