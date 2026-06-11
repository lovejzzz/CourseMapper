/**
 * CurriculumOS refine loop — iteration 7: coverage expansion.
 *
 * Widening the genome toward real-classroom A+ reach: the genesis library now
 * spans 6 disciplines and instantiates THREE archetype families across
 * departments, so more real courses get free cited content, template-priced
 * misconceptions, and analogical bridges:
 *   - equilibrium: chem/chemical-equilibrium ↔ econ/market-equilibrium
 *   - feedback loop: bio/homeostasis ↔ econ/wage-price-spiral
 *   - evidence vs claim: history/historical-argument ↔ lit/literary-argument
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createKernelLibrary } from '../kernelLibrary.js';
import { runGenomeLinker } from '../runGenomeLinker.js';
import { inferCourseDisciplines } from '../libraryShardLoader.js';
import { buildQuizItemPlan } from '../../blueprintEnrichmentPass.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../../courseBlueprintCompiler.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
}

function genesisLibrary() {
  const library = createKernelLibrary({ storage: memoryStorage() });
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
  for (const shard of manifest.shards) {
    const body = JSON.parse(readFileSync(join(process.cwd(), 'public/genome', shard.path), 'utf8'));
    library.addKernels(body.kernels, { source: 'shard' });
  }
  const archetypeShard = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/archetypes.json'), 'utf8'));
  library.addArchetypes(archetypeShard.archetypes);
  return library;
}

const library = genesisLibrary();

function bridgeFor(lessons) {
  return runGenomeLinker({
    courseMap: { courseName: 'Test', lessons },
    lessonIndices: lessons.map((_, i) => i),
    library,
    itemPlan: buildQuizItemPlan(6),
  });
}

describe('iteration 7 — genome spans 6 disciplines', () => {
  it('the manifest carries the expanded genome', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
    expect(manifest.conceptCount).toBeGreaterThanOrEqual(18);
    const disciplines = new Set(manifest.shards.map((s) => s.discipline));
    // v0.13.3: astronomy joined; v0.13.5: psychology, nursing, and nutrition
    // (the Open Knowledge Backbone flagship shards) joined; v0.14.1: cs and geo
    // joined (the two disciplines the V0.14 four-course audit found uncovered).
    expect(disciplines).toEqual(
      new Set(['astro', 'econ', 'stats', 'bio', 'chem', 'history', 'lit', 'psych', 'nursing', 'nutrition', 'cs', 'geo']),
    );
  });

  it('most genesis concepts carry a verified archetype mapping', () => {
    const ids = [];
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
    for (const shard of manifest.shards) {
      const body = JSON.parse(readFileSync(join(process.cwd(), 'public/genome', shard.path), 'utf8'));
      for (const k of body.kernels) if (k.edges?.instanceOf?.length) ids.push(k.id);
    }
    // demand-curve + photosynthesis are the only two without a confident mapping.
    expect(ids.length).toBeGreaterThanOrEqual(15);
  });
});

describe('iteration 7 — three cross-discipline bridge families render', () => {
  it('feedback loop bridges biology and economics', () => {
    const linked = bridgeFor([
      {
        title: 'Lesson 1: Homeostasis',
        sections: [
          {
            topicSection: 'homeostasis physiology set point negative feedback',
            learningObjectives: 'Explain homeostasis and negative feedback.',
          },
        ],
      },
      {
        title: 'Lesson 2: The Wage-Price Spiral',
        sections: [
          {
            topicSection: 'wage price spiral inflation positive feedback',
            learningObjectives: 'Explain the wage-price spiral.',
          },
        ],
      },
    ]);
    // v0.13.5: the nursing shard adds a second homeostasis (its own clinical
    // anchoring), so the full library now renders extra feedback-loop bridges.
    // Assert the targeted bio↔econ bridge is among them — the mechanism is
    // unchanged (production discipline-scoping wouldn't load nursing here).
    const bridge = linked.bridges.find(
      (b) =>
        b.archetype === 'structure/feedback-loop' &&
        [b.fromConcept.id, b.toConcept.id].sort().join() === 'bio/homeostasis,econ/wage-price-spiral',
    );
    expect(bridge).toBeTruthy();
    expect(bridge.note).toContain('↔');
  });

  it('evidence-vs-claim bridges history and literature', () => {
    const linked = bridgeFor([
      {
        title: 'Lesson 1: Historical Argument',
        sections: [
          {
            topicSection: 'historical argument primary source evidence',
            learningObjectives: 'Construct a historical argument from primary sources.',
          },
        ],
      },
      {
        title: 'Lesson 2: Literary Argument',
        sections: [
          {
            topicSection: 'literary argument close reading textual evidence',
            learningObjectives: 'Build a literary argument with textual evidence.',
          },
        ],
      },
    ]);
    const bridge = linked.bridges.find((b) => b.archetype === 'epistemic/evidence-vs-claim');
    expect(bridge).toBeTruthy();
    expect([bridge.fromConcept.id, bridge.toConcept.id].sort()).toEqual([
      'history/historical-argument',
      'lit/literary-argument',
    ]);
  });

  it('the feedback bridge renders into the compiled study guide', () => {
    const lessons = [
      {
        title: 'Lesson 1: Homeostasis',
        sections: [
          {
            topicSection: 'homeostasis physiology negative feedback set point',
            learningObjectives: 'Explain homeostasis.',
          },
        ],
      },
      {
        title: 'Lesson 2: Inflation Spiral',
        sections: [
          {
            topicSection: 'wage price spiral inflation positive feedback',
            learningObjectives: 'Explain inflation spirals.',
          },
        ],
      },
    ];
    const linked = bridgeFor(lessons);
    const enrichment = { source: 'iter7-test', lessonContent: linked.lessonContent };
    const blueprint = JSON.parse(
      JSON.stringify(buildCourseBlueprint({ courseName: 'Systems', lessons }, { enrichment })),
    );
    const compiled = compileBlueprintDeliverables(blueprint, ['studyGuides'], {});
    expect(JSON.stringify(compiled.studyGuides.studyGuides)).toContain('shares the deep structure');
  });
});

describe('iteration 7 — discipline inference covers the new disciplines', () => {
  it('routes biology, macroeconomics, history, and literature courses to their shards', () => {
    expect(inferCourseDisciplines({ courseName: 'Human Physiology', lessons: [{ title: 'Homeostasis' }] })).toContain(
      'bio',
    );
    expect(
      inferCourseDisciplines({ courseName: 'Principles of Macroeconomics', lessons: [{ title: 'Inflation' }] }),
    ).toContain('econ');
    expect(inferCourseDisciplines({ courseName: 'World History', lessons: [{ title: 'Primary Sources' }] })).toContain(
      'history',
    );
    expect(
      inferCourseDisciplines({
        courseName: 'Introduction to Literature',
        lessons: [{ title: 'Close Reading Poetry' }],
      }),
    ).toContain('lit');
  });
});
