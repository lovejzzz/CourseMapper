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
import { inferCourseDisciplines, strictGenomeDisciplineBoundary } from '../libraryShardLoader.js';
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

describe('iteration 7 — genome spans deployed disciplines', () => {
  it('the manifest carries the expanded genome', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
    expect(manifest.conceptCount).toBeGreaterThanOrEqual(18);
    const disciplines = new Set(manifest.shards.map((s) => s.discipline));
    // v0.13.3: astronomy joined; v0.13.5: psychology, nursing, and nutrition
    // (the Open Knowledge Backbone flagship shards) joined; v0.14.1: cs and geo
    // joined (the two disciplines the V0.14 four-course audit found uncovered);
    // V0.14.7 WS-E E1: math joined (OpenStax Calculus Volume 1 — the live
    // Calculus I course that linked only 5/15); v0.15 F3: lang joined — the
    // FIRST shard the genome taught itself (the Beginning Korean extraction
    // contributed through the commons round-trip); v0.15.5 adds physics for
    // the live Electricity and Magnetism miss; v0.15.6 adds anatomy for the
    // live Anatomy and Physiology miss; v0.15.14+ adds research-methods for
    // common methods courses; v0.16.2 adds music theory with a source-backed
    // assessment bank and production fixture coverage; v0.16.3 adds UX from
    // retained government and W3C guidance.
    expect(disciplines).toEqual(
      new Set([
        'anatomy',
        'astro',
        'econ',
        // v0.16.80: environmental policy (OpenStax Microeconomics 3e ch.12).
        'envpolicy',
        // v0.16.80: world literature (Wikipedia, CC BY-SA) — tradition-level
        // concepts the English-canon 'lit' shard does not carry.
        'worldlit',
        // v0.16.81: business ethics (OpenStax Business Ethics, CC BY 4.0) —
        // authored so Algi stops filling an uncovered course's teaching slots
        // with publication boilerplate.
        'bizethics',
        'stats',
        'bio',
        'chem',
        'history',
        'lit',
        'psych',
        'nursing',
        'nutrition',
        'cs',
        'geo',
        'math',
        'music',
        'lang',
        'physics',
        'research-methods',
        'ux',
      ]),
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

// v0.14.4 C3b: the generic "language" clause requires a language-COURSE shape.
// The old pattern (`\blanguage\b.*\b(?:…|i{1,3}|[12])\b`) matched the stats
// lesson title "Probability language and sample spaces" whenever a standalone
// i/1/2 appeared anywhere later in the joined titles.
describe('v0.14.4 C3b — lang inference requires course-shaped "language", never prose', () => {
  it('does NOT route "Probability language and sample spaces" prose to lang', () => {
    const disciplines = inferCourseDisciplines({
      courseName: 'Introductory Statistics',
      lessons: [
        { title: 'Probability language and sample spaces' },
        // A standalone roman-numeral token later in the joined text — the
        // exact shape that satisfied the old `.*\b(?:i{1,3}|[12])\b` tail.
        { title: 'Type I and Type II errors' },
        { title: 'Sampling distributions, lesson 2' },
      ],
    });
    expect(disciplines).not.toContain('lang');
    expect(disciplines).toContain('stats');
  });

  it('still routes named-language course titles to lang', () => {
    expect(
      inferCourseDisciplines({
        courseName: 'Elementary Mandarin Chinese I',
        lessons: [{ title: 'Greetings and Self-Introductions' }, { title: 'The Pinyin System and Four Tones' }],
      }),
    ).toEqual(['lang']);
    expect(inferCourseDisciplines({ courseName: 'Beginning French II', lessons: [] })).toContain('lang');
  });

  it('routes course-shaped generic "language" phrases to lang', () => {
    expect(inferCourseDisciplines({ courseName: 'Second Language Acquisition', lessons: [] })).toContain('lang');
    expect(inferCourseDisciplines({ courseName: 'World Languages Survey', lessons: [] })).toContain('lang');
    expect(inferCourseDisciplines({ courseName: 'Foreign Language Pedagogy', lessons: [] })).toContain('lang');
    expect(inferCourseDisciplines({ courseName: 'American Sign Language I', lessons: [] })).toContain('lang');
    expect(inferCourseDisciplines({ courseName: 'Language Learning and Technology', lessons: [] })).toContain('lang');
  });

  it('leaves other "X language and Y" prose alone', () => {
    expect(
      inferCourseDisciplines({
        courseName: 'Introduction to Psychology',
        lessons: [{ title: 'Body language and nonverbal communication, part 1' }],
      }),
    ).not.toContain('lang');
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

  it('routes quantum computing to computer science before generic concepts can cross disciplines', () => {
    expect(
      inferCourseDisciplines({
        courseName: 'Introduction to Quantum Computing',
        lessons: [{ title: 'Superposition and measurement' }, { title: 'Quantum gates and circuits' }],
      }),
    ).toContain('cs');
  });

  it('routes database-system vocabulary to computer science', () => {
    expect(
      inferCourseDisciplines({
        courseName: 'Database Systems',
        lessons: [
          { title: 'Relational Database Implementation' },
          { title: 'Database Normalization' },
          { title: 'Query Optimization' },
        ],
      }),
    ).toEqual(['cs']);
  });

  it('fails closed when no course discipline can be inferred', () => {
    expect(strictGenomeDisciplineBoundary([])).toEqual(['__unclassified__']);
    expect(strictGenomeDisciplineBoundary([' CS ', 'cs'])).toEqual(['cs']);
  });

  it('does not route visual composition into the literature shard', () => {
    expect(
      inferCourseDisciplines({
        courseName: 'Visual Evidence and Image Analysis',
        lessons: [{ title: 'Composition' }, { title: 'Visual hierarchy' }],
      }),
    ).not.toContain('lit');
    expect(
      inferCourseDisciplines({
        courseName: 'College Writing',
        lessons: [{ title: 'Academic composition and rhetorical revision' }],
      }),
    ).toContain('lit');
  });

  it('routes digital accessibility terminology to the UX evidence shard', () => {
    expect(
      inferCourseDisciplines({
        courseName: 'Digital Accessibility for Product Teams',
        lessons: [{ title: 'WCAG principles' }, { title: 'semantic HTML' }, { title: 'accessible forms' }],
      }),
    ).toContain('ux');
  });
});
