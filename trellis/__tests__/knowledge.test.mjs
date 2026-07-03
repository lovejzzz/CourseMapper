import { describe, it, expect } from 'vitest';
import { loadShards, assembleKnowledge, linkConceptToKernel } from '../knowledge/assemble.mjs';
import { createRunLedger } from '../telemetry.mjs';
import { makeGraph } from '../graph/schema.mjs';

function bareGraph(conceptNames) {
  return makeGraph({
    course: {
      id: 'c',
      title: 'Intro Psych Research',
      subject: 'research methods',
      level: 'intro',
      weeks: 2,
      sessionsPerWeek: 1,
    },
    concepts: conceptNames.map((name, i) => ({ id: `c-${i}`, name })),
    outcomes: [{ id: 'o1', statement: 'Apply the concepts', bloom: 'apply', conceptIds: [] }],
    lessons: [
      { id: 'l1', week: 1, session: 1, title: 'One', introduces: ['c-0'], outcomeIds: ['o1'] },
      { id: 'l2', week: 2, session: 1, title: 'Two', introduces: conceptNames[1] ? ['c-1'] : [], outcomeIds: ['o1'] },
    ],
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
}

describe('knowledge assembly against the real genome shards', () => {
  it('links a shard-covered concept and fills kernel facts + misconceptions with correctives', async () => {
    const shards = await loadShards();
    expect(shards.length).toBeGreaterThan(10);
    const graph = bareGraph(['Research hypothesis', 'Quantum frobnication theory']);
    const { coverage } = assembleKnowledge(graph, shards);
    const hypothesis = graph.concepts.find((c) => c.id === 'c-0');
    expect(hypothesis.kernelFacts.length).toBeGreaterThanOrEqual(1);
    expect(hypothesis.genomeRef).toMatch(/hypothesis/);
    // Any genome-imported misconception carries its corrective (schema law).
    for (const id of hypothesis.misconceptionIds) {
      const m = graph.misconceptions.find((x) => x.id === id);
      expect(m.corrective.length).toBeGreaterThan(10);
    }
    expect(coverage.uncovered).toEqual(['c-1']);
    expect(coverage.note).toMatch(/genome gap/);
  });

  it('never links across unrelated vocabulary', async () => {
    const shards = await loadShards();
    const kernel = linkConceptToKernel(
      { id: 'x', name: 'Underwater basket weaving' },
      shards.flatMap((s) => s.kernels),
    );
    expect(kernel).toBeNull();
  });

  it('discipline gating: a Python course never links lang-shard kernels (the live attempt-3 bycatch)', async () => {
    const shards = await loadShards();
    const graph = makeGraph({
      course: {
        id: 'c',
        title: 'Introduction to Computer Science with Python',
        subject: 'computer science',
        level: 'intro',
        weeks: 2,
        sessionsPerWeek: 1,
      },
      concepts: [{ id: 'c-0', name: 'Expressions' }],
      outcomes: [{ id: 'o1', statement: 'Apply expressions', bloom: 'apply', conceptIds: [] }],
      lessons: [{ id: 'l1', week: 1, session: 1, title: 'Expressions', introduces: ['c-0'], outcomeIds: ['o1'] }],
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
    const { coverage } = assembleKnowledge(graph, shards);
    expect(coverage.disciplineGated).toBe(true);
    const concept = graph.concepts[0];
    if (concept.genomeRef) {
      expect(concept.genomeRef.startsWith('lang/')).toBe(false);
      for (const id of concept.misconceptionIds) {
        const m = graph.misconceptions.find((x) => x.id === id);
        expect(m.statement.toLowerCase()).not.toMatch(/korean|mandarin|tones/);
      }
    }
  });

  it('an unmatched discipline keeps all shards eligible and says so honestly', async () => {
    const shards = await loadShards();
    const graph = bareGraph(['Research hypothesis']);
    graph.course.subject = 'basket weaving';
    graph.course.title = 'Advanced Basket Weaving';
    const { coverage } = assembleKnowledge(graph, shards);
    expect(coverage.disciplineGated).toBe(false);
    expect(coverage.note).toMatch(/NO discipline match/);
  });
});

describe('telemetry ledger', () => {
  it('accumulates per-stage totals and renders a cost table', () => {
    const ledger = createRunLedger({ runId: 't' });
    ledger.record({ stage: 'author', model: 'm', tokensIn: 1000, tokensOut: 500, usd: 0.01 });
    ledger.record({ stage: 'author', model: 'm', tokensIn: 2000, tokensOut: 700, usd: 0.02 });
    ledger.record({ stage: 'intake', model: 'm', tokensIn: 500, tokensOut: 100, usd: 0.005 });
    const totals = ledger.totals();
    expect(totals.calls).toBe(3);
    expect(totals.tokensIn).toBe(3500);
    expect(totals.byStage.author.calls).toBe(2);
    expect(ledger.costTable()).toMatch(/\| author \| 2 \|/);
    expect(ledger.costTable()).toMatch(/\*\*\$0\.035/);
  });
});
