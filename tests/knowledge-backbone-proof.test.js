/**
 * v0.13.5 Open Knowledge Backbone proof — the before/after quality delta.
 *
 * The v0.12 audit's flagship subjects (astronomy, nutrition, nursing,
 * ed-psych) compiled with ZERO genome-linked lessons, zero citations, and
 * placeholder readings everywhere except astronomy (added in v0.13.3).
 * This harness compiles each course twice:
 *
 *   BEFORE — the bare deterministic path (no genome, no backbone), the
 *            v0.12-equivalent output;
 *   AFTER  — the full v0.13.5 pipeline: genome linker → Course Graph →
 *            genome anchor resources → (stubbed) open readings →
 *            blueprint-from-graph → compiled deliverables;
 *
 * and asserts the deltas the roadmap promised:
 *   P1: each flagship course resolves ≥60% of lessons from the genome
 *   P2: zero placeholder citations after; ≥2 resources/lesson with runtime
 *   P3: every lesson plan carries DOI-cited "why this works" notes
 *   P4: syllabus ships Methods Statement + Sources & Licenses (CC BY)
 *
 * Runtime readings use injected fixture providers — this proves plumbing,
 * never network: ZERO fetch calls in this file.
 */
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createKernelLibrary } from '../src/lib/genome/kernelLibrary.js';
import { runGenomeLinker } from '../src/lib/genome/runGenomeLinker.js';
import { buildQuizItemPlan } from '../src/lib/blueprintEnrichmentPass.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { inferCourseDisciplines } from '../src/lib/genome/libraryShardLoader.js';
import {
  deriveCourseGraphFromCourseMap,
  attachEnrichmentToGraph,
  buildBlueprintFromGraph,
} from '../src/lib/courseGraph/index.js';
import { attachGenomeResources, attachOpenReadings, knowledgeCoverage } from '../src/lib/knowledge/index.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
}

function genomeLibrary() {
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

function fixtureCourse(courseName, lessonSpecs) {
  return {
    courseName,
    lessons: lessonSpecs.map(([title, topics], index) => ({
      title: `Lesson ${index + 1}: ${title}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${topics}`,
          learningObjectives: `Analyze ${topics} using course evidence.`,
          weeklyAssessments: `Week ${index + 1} quiz and applied artifact.`,
          asyncActivities: 'Read the assigned open-textbook chapter.',
          syncActivities: 'Case discussion and guided practice.',
        },
      ],
    })),
  };
}

// The four v0.12-audit flagship subjects. Topic strings use the shards'
// terms and aliases the way a real instructor's map would.
const FLAGSHIPS = [
  {
    expectDiscipline: 'astro',
    course: fixtureCourse('Introduction to Astronomy', [
      ['The Celestial Sphere', 'celestial sphere sky dome observation'],
      ['Seasons and Sky Motions', 'seasons axial tilt diurnal motion'],
      ['Telescopes and Light', 'telescope light gathering aperture'],
      ['Kepler’s Laws and Orbits', 'Kepler third law orbital period semimajor axis'],
      ['The Moon and Eclipses', 'phases of the moon lunar cycle'],
      ['Measuring Stars', 'apparent magnitude stellar parallax parsec'],
      ['The Expanding Universe', 'Hubble law expanding universe recession velocity'],
    ]),
  },
  {
    expectDiscipline: 'nutrition',
    course: fixtureCourse('Introduction to Human Nutrition', [
      ['The Six Classes of Nutrients', 'six classes of nutrients macronutrients micronutrients'],
      ['Carbohydrates', 'carbohydrates simple sugars complex carbohydrates'],
      ['Dietary Fiber', 'dietary fiber soluble fiber insoluble fiber'],
      ['Proteins and Amino Acids', 'proteins amino acids essential amino acids'],
      ['Lipids and Fats', 'lipids saturated fat unsaturated fat trans fat'],
      ['Vitamins', 'vitamins fat-soluble vitamins water-soluble vitamins'],
      ['Major Minerals', 'major minerals calcium electrolytes'],
      ['Water and Hydration', 'water hydration status body water'],
      ['Digestion and Absorption', 'digestion absorption digestive system'],
      ['Energy Balance and Metabolism', 'energy balance metabolism kilocalories'],
      ['Dietary Guidelines', 'dietary guidelines MyPlate healthy eating patterns'],
      ['Reading Nutrition Labels', 'nutrition labels percent DV serving size'],
    ]),
  },
  {
    expectDiscipline: 'nursing',
    course: fixtureCourse('Foundations of Nursing Practice', [
      ['Homeostasis and Patient Stability', 'homeostasis stable internal conditions patient care'],
      ['Levels of Structural Organization', 'levels of organization cells tissues organs'],
      ['Blood and Its Components', 'blood components plasma formed elements'],
      ['The Cardiac Cycle and Cardiac Output', 'cardiac cycle cardiac output stroke volume'],
      ['Blood Pressure Regulation', 'blood pressure systolic diastolic resistance'],
      ['Gas Exchange', 'gas exchange respiration alveoli oxygen'],
      ['Fluid and Electrolyte Balance', 'fluid balance electrolyte balance body fluid compartments'],
      ['Innate and Adaptive Immunity', 'innate immunity adaptive immunity immune defenses'],
      ['Inflammation', 'inflammation inflammatory response clinical signs'],
      ['Bacterial Structure and Gram Staining', 'bacterial cell structure gram-positive gram-negative'],
      ['Viral Replication', 'viral replication virus life cycle'],
      ['Antimicrobial Resistance', 'antimicrobial resistance antibiotic resistance'],
      ['The Chain of Infection', 'disease transmission chain of infection infection control'],
    ]),
  },
  {
    expectDiscipline: 'psych',
    course: fixtureCourse('Educational Psychology', [
      ['Classical Conditioning', 'classical conditioning stimulus response learning theory'],
      ['Operant Conditioning', 'operant conditioning reinforcement punishment'],
      ['Observational Learning', 'observational learning modeling imitation'],
      ['How Memory Works', 'memory model encoding storage retrieval'],
      ['Working Memory in the Classroom', 'working memory short-term memory cognitive load'],
      ['Long-Term Memory', 'long-term memory semantic episodic'],
      ['Why Students Forget', 'forgetting retrieval failure memory decay'],
      ['Cognitive Development', 'Piaget stages cognitive development child development'],
      ['Psychosocial Development', 'Erikson psychosocial development stages'],
      ['Intelligence', 'intelligence theories multiple intelligences IQ'],
      ['Motivation in Learning', 'intrinsic motivation extrinsic motivation engagement'],
      ['Teaching Problem Solving', 'problem solving strategies heuristics algorithm'],
    ]),
  },
];

// Fixture runtime providers — prove the plumbing without the network.
const stubProviders = {
  searchScholarlyReadings: async (query) => [
    {
      title: `Open-access study of ${query}`,
      authors: 'A. Scholar, B. Researcher',
      year: 2022,
      url: `https://doi.org/10.9999/${encodeURIComponent(query.slice(0, 20))}`,
      license: 'cc-by',
      attribution: 'OpenAlex (CC0 metadata)',
    },
  ],
  searchBookMetadata: async (query) => [
    {
      title: `${query} (Open Textbook)`,
      authors: 'Open Authors',
      year: 2020,
      publisher: 'OpenStax',
      isbn: '9780000000000',
      url: 'https://openlibrary.org/works/OL0000W',
    },
  ],
};

const PLACEHOLDER_READING_PACKET = 'Instructor-provided course reading packet';
const PLACEHOLDER_MATERIALS = 'Instructor-provided course materials and notes';

function placeholderMetrics(compiled) {
  const requiredTextsPlaceholder = (compiled.syllabus.syllabus.requiredTexts || []).filter((text) =>
    text.title.includes(PLACEHOLDER_READING_PACKET),
  ).length;
  const lessonPlaceholders = compiled.lessonPlans.lessonPlans.filter((plan) =>
    (plan.sourceUsePlan?.approvedSources || []).some((source) => source.includes(PLACEHOLDER_MATERIALS)),
  ).length;
  return { requiredTextsPlaceholder, lessonPlaceholders };
}

function citedKeyTermCount(compiled) {
  return compiled.studyGuides.studyGuides
    .flatMap((guide) => guide.keyTerms || [])
    .filter((term) => /openstax|uh oer/i.test(term.source || '')).length;
}

const library = genomeLibrary();
const FEATURES = ['syllabus', 'lessonPlans', 'studyGuides', 'quizBank'];
const deltas = [];

describe('open knowledge backbone proof (v0.13.5)', () => {
  beforeAll(() => {
    // The deterministic + stub-provider pipeline must never touch the network.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('network call in knowledge-backbone proof — the deterministic path must be offline');
      }),
    );
  });

  for (const { course, expectDiscipline } of FLAGSHIPS) {
    describe(course.courseName, () => {
      const lessonCount = course.lessons.length;

      // BEFORE: the bare deterministic compile (v0.12-equivalent).
      const beforeBlueprint = buildCourseBlueprint(course);
      const beforeCompiled = compileBlueprintDeliverables(beforeBlueprint, FEATURES);

      // AFTER: linker → graph → resources → stubbed readings → compile.
      const linked = runGenomeLinker({
        courseMap: course,
        lessonIndices: course.lessons.map((_, i) => i),
        library,
        itemPlan: buildQuizItemPlan(6),
      });
      const graph = attachEnrichmentToGraph(deriveCourseGraphFromCourseMap(course), {
        lessonContent: linked.lessonContent,
        quality: { source: 'genome-only' },
      });
      const genomeResources = attachGenomeResources(graph);
      let openReadings = 0;
      const afterCompiledPromise = attachOpenReadings(graph, { providers: stubProviders }).then((count) => {
        openReadings = count;
        return compileBlueprintDeliverables(buildBlueprintFromGraph(graph), FEATURES);
      });

      it(`routes to the ${expectDiscipline} shard and genome-links ≥60% of lessons (P1)`, () => {
        expect(inferCourseDisciplines(course)).toContain(expectDiscipline);
        expect(linked.telemetry.resolvedFromGenome / lessonCount).toBeGreaterThanOrEqual(0.6);
      });

      it('replaces every placeholder citation (P2) and ships ≥2 resources/lesson', async () => {
        const afterCompiled = await afterCompiledPromise;
        const before = placeholderMetrics(beforeCompiled);
        const after = placeholderMetrics(afterCompiled);
        // The BEFORE path is the placeholder world this release retires.
        expect(before.requiredTextsPlaceholder).toBeGreaterThan(0);
        expect(after.requiredTextsPlaceholder).toBe(0);
        expect(after.lessonPlaceholders).toBe(0);

        const coverage = knowledgeCoverage(graph);
        expect(coverage.sessionsWithResources).toBe(lessonCount);
        // genome § + one open reading per lesson + course book.
        expect(coverage.openResources).toBeGreaterThanOrEqual(lessonCount * 2 * 0.6);

        const before2 = citedKeyTermCount(beforeCompiled);
        const after2 = citedKeyTermCount(afterCompiled);
        expect(before2).toBe(0);
        expect(after2).toBeGreaterThanOrEqual(5);

        deltas.push({
          course: course.courseName,
          lessons: lessonCount,
          genomeLinked: linked.telemetry.resolvedFromGenome,
          citedTermsBefore: before2,
          citedTermsAfter: after2,
          resourcesAttached: genomeResources + openReadings,
          placeholdersBefore: before.requiredTextsPlaceholder + before.lessonPlaceholders,
          placeholdersAfter: after.requiredTextsPlaceholder + after.lessonPlaceholders,
        });
      });

      it('every lesson plan cites its teaching moves with real DOIs (P3)', async () => {
        const afterCompiled = await afterCompiledPromise;
        for (const plan of afterCompiled.lessonPlans.lessonPlans) {
          expect(plan.evidenceBase.length).toBeGreaterThanOrEqual(2);
          expect(plan.evidenceBase.every((entry) => /doi:10\./.test(entry.note))).toBe(true);
        }
      });

      it('syllabus ships the Methods Statement and Sources & Licenses appendix (P4)', async () => {
        const afterCompiled = await afterCompiledPromise;
        const syl = afterCompiled.syllabus.syllabus;
        expect(syl.methodsStatement.methods.length).toBeGreaterThanOrEqual(3);
        expect(JSON.stringify(syl.methodsStatement)).toContain('https://doi.org/');
        const groups = syl.sourcesAndLicenses.groups.map((group) => group.origin);
        expect(groups).toContain('genome');
        expect(groups).toContain('openalex');
        expect(JSON.stringify(syl.sourcesAndLicenses)).toMatch(/CC BY 4\.0/);
        expect(
          syl.requiredTexts.some((text) => /openstax|hawai|open textbook/i.test(`${text.title} ${text.note}`)),
        ).toBe(true);
      });
    });
  }

  it('reports the quality delta across all four flagship courses', () => {
    expect(deltas).toHaveLength(4);
    const totals = deltas.reduce(
      (sum, row) => ({
        lessons: sum.lessons + row.lessons,
        genomeLinked: sum.genomeLinked + row.genomeLinked,
        citedTermsAfter: sum.citedTermsAfter + row.citedTermsAfter,
        resourcesAttached: sum.resourcesAttached + row.resourcesAttached,
        placeholdersBefore: sum.placeholdersBefore + row.placeholdersBefore,
        placeholdersAfter: sum.placeholdersAfter + row.placeholdersAfter,
      }),
      {
        lessons: 0,
        genomeLinked: 0,
        citedTermsAfter: 0,
        resourcesAttached: 0,
        placeholdersBefore: 0,
        placeholdersAfter: 0,
      },
    );
    // The release-defining numbers.
    expect(totals.genomeLinked / totals.lessons).toBeGreaterThanOrEqual(0.6);
    expect(totals.placeholdersAfter).toBe(0);
    expect(totals.placeholdersBefore).toBeGreaterThanOrEqual(4);
    // The release-report numbers (vitest silences console; drop a file).
    writeFileSync(
      join(tmpdir(), 'knowledge-backbone-delta.json'),
      JSON.stringify({ courses: deltas, totals }, null, 2),
    );
  });
});
