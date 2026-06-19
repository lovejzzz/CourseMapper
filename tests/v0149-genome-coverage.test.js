/**
 * v0.14.9 Lane 1 proof — COVERAGE: the deepened history and literature
 * shards (A1/A2), the tightened history inference (A1), and the honest
 * genome chip (A4), all through the REAL loader → linker path with every
 * shard loaded (the same per-shard proof pattern as math-shard-proof).
 *
 *  - history-intro: 3 genesis method concepts + 51 OpenStax U.S. History
 *    era concepts (verbatim-anchored, the unmodified admission gate);
 *    the US History fixture links 10+/15 (roadmap A1 bar).
 *  - lit-intro: 2 genesis + 20 Steinberg (Milne, "Literature, the
 *    Humanities, and Humanity") + 12 poetry-craft (Milne, "Naming the
 *    Unnameable"); the world-lit fixture links 8+/14 (roadmap A2 bar).
 *  - inference: the old `\bhistory|historical|\bwar\b|revolution` pattern
 *    tripped on art-history surveys, "War and Peace", and CS "image
 *    reconstruction" — the tight pattern must not.
 *  - A4: the ribbon's genome chip distinguishes ABSENCE (no shard for the
 *    subject — muted, no zero) from a real 0/N and from a healthy N/M.
 *
 * The LIVE half (browser run, budget log line) is the release round.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createKernelLibrary } from '../src/lib/genome/kernelLibrary.js';
import { runGenomeLinker } from '../src/lib/genome/runGenomeLinker.js';
import { inferCourseDisciplines } from '../src/lib/genome/libraryShardLoader.js';
import { buildBuildRibbonModel, parseGenomeLinkerDetail } from '../src/lib/buildRibbonModel.js';
import { applyApiCallBudgetEvent, createApiCallBudget } from '../src/lib/apiCallBudget.js';

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

function buildCourse(courseName, lessons) {
  return {
    courseName,
    lessons: lessons.map(([title, topics], index) => {
      const tokens = topics.split(' ');
      const mid = Math.ceil(tokens.length / 2);
      const sectionTopics = [tokens.slice(0, mid).join(' '), tokens.slice(mid).join(' ')];
      return {
        title: `Lesson ${index + 1}: ${title}`,
        sections: sectionTopics.map((topic, sectionIndex) => ({
          topicSection: `${index + 1}.${sectionIndex + 1}: ${topic}`,
          learningObjectives: `Apply ${topic} in practice.`,
          weeklyAssessments: `Quiz ${index + 1}.`,
          asyncActivities: 'Read the assigned chapter.',
          syncActivities: 'Guided practice.',
        })),
      };
    }),
  };
}

// The live miss: the user's U.S. History run linked 0/15 against the old
// 3-concept method-only shard. The fixture mirrors a standard survey.
const US_HISTORY_COURSE = buildCourse('U.S. History Since Reconstruction', [
  ['Restoring the Union', 'ten percent plan presidential reconstruction thirteenth amendment freedmen'],
  [
    'Radical Reconstruction',
    'radical republicans reconstruction acts military districts impeachment of andrew johnson',
  ],
  ['The West', 'manifest destiny homestead act overland migration trails westward'],
  ['Industrialization', 'railroads big business robber barons carnegie gospel of wealth'],
  ['Urbanization and Immigration', 'urbanization drivers urban infrastructure innovations class inequality'],
  ['The Populist Era', 'farmers revolt grange granger laws populist party omaha platform'],
  ['Progressivism', 'square deal roosevelt trustbusting taft progressive agenda'],
  ['An Age of Empire', 'spanish american war overseas empire smoked yankees'],
  ['America and the Great War', 'isolationism european alliance system wilson moral foreign policy'],
  ['The Jazz Age', 'talkies hollywood studio system fordism assembly line model t'],
  ['The Great Depression', 'stock market crash 1929 speculation buying on margin black thursday'],
  ['The New Deal', 'first new deal emergency banking act work relief programs'],
  ['The Road to World War II', 'rise of fascism nazism appeasement munich pact interwar isolationism'],
  ['Cold War America and Civil Rights', 'cold war containment marshall plan brown v board little rock nine'],
  ['Conservatism to the Present', 'reagan revolution reaganomics supply side september 11 bush doctrine war on terror'],
]);

const WORLD_LIT_COURSE = buildCourse('Introduction to World Literature', [
  ['Why Literature', 'teach and delight literature on a pedestal'],
  ['The Oral Epic', 'oral formulaic composition composite authorship homeric epic'],
  ['Epic Conventions', 'in medias res epic heroism odyssey versus iliad focus'],
  ['The Odyssey at Home', 'domesticity family plot mystery of paternity telemachos'],
  ['How to Read a Poem', 'total response negative capability title as doorway'],
  ['The Poetic Image', 'language of images sensory understanding genres and imagery'],
  ['Sound and Meter', 'scansion metrical feet rhyme scheme internal rhyme'],
  ['Poetic Forms', 'ballad ghazal abecedarian poetic form'],
  ['Shakespeare and Drama', 'shakespeare drama and poetry directorial reading wordplay'],
  ['The Rise of the Novel', 'novel versus romance realism epistolary novel picaresque satire'],
  ['Austen and the Reader', 'reader response interaction austen prose style wit'],
  ['The Victorian Novel', 'serialization novel length dickens magician realism illusion'],
  ['Gender and the Canon', 'gender bias literary publication canon formation'],
  ['Writing About Literature', 'literary argument close reading evidence'],
]);

const PHYSICS_E_AND_M_COURSE = buildCourse('Introductory Physics II: Electricity and Magnetism', [
  ['Electric Charge', 'electric charge conservation of charge positive and negative charge'],
  ['Electric Fields', 'electric field field lines force per unit charge test charge'],
  ["Gauss's Law", 'Gauss law electric flux Gaussian surface enclosed charge symmetry'],
  ['Electric Potential', 'electric potential voltage potential difference potential energy per unit charge'],
  ['Capacitance', 'capacitance capacitor parallel plate charge potential difference'],
  ['Electric Current', 'electric current charge flow rate current and resistance'],
  ["Resistance and Ohm's Law", 'resistance Ohm law voltage current resistance ohmic conductor'],
  ['DC Circuits', 'DC circuits series parallel Kirchhoff junction loop resistor network'],
  ['Magnetic Fields', 'magnetic field magnetism field lines compass charged particle'],
  ['Magnetic Force', 'magnetic force Lorentz force right hand rule charge velocity field'],
  ["Faraday's Law", 'Faraday law electromagnetic induction magnetic flux induced emf'],
  ['Inductance', 'inductance inductor magnetic field energy current change'],
  ["Maxwell's Equations", 'Maxwell equations displacement current electromagnetic waves electric magnetic fields'],
  ['RC Circuit Transients', 'capacitor resistance current voltage circuit time constant'],
  ['Electromagnetic Synthesis', 'electric field magnetic field induction Maxwell equations electromagnetic waves'],
]);

const ANATOMY_PHYSIOLOGY_COURSE = buildCourse('Human Anatomy and Physiology I', [
  ['Introduction to Anatomy and Physiology', 'anatomy and physiology levels of structural organization'],
  ['Homeostasis', 'homeostasis feedback regulation negative feedback physiological set point control'],
  ['Tissue Types', 'histology tissue types epithelial connective muscle nervous'],
  ['Epithelial Tissue', 'epithelial tissue body surfaces internal cavities glands'],
  ['Connective Tissue', 'connective tissue protection support integration binds organs'],
  ['Integumentary System', 'integumentary system skin layers epidermis dermis'],
  ['Skeletal System', 'skeletal system bone functions cartilage support movement protection'],
  ['Synovial Joints', 'synovial joints joint cavity articular cartilage ligaments mobility'],
  ['Muscle Tissue', 'muscle tissue skeletal cardiac smooth muscle contractility'],
  ['Nervous Tissue', 'nervous tissue neurons neuroglia action potentials'],
  ['Sensory Physiology', 'sensory physiology sensory receptors perception special senses'],
  ['Endocrine Signaling', 'endocrine system hormones target cells hormone receptors'],
  ['Lab Practical Preparation', 'microscope labs histology images anatomical models lab practicals'],
  ['Structure Function Review', 'structure function organization homeostasis tissue systems'],
  ['Final Integration', 'homeostasis skeletal muscular nervous endocrine sensory physiology'],
]);

const RESEARCH_METHODS_COURSE = buildCourse('Introduction to Research Methods', [
  ['Research Questions and Hypotheses', 'hypothesis testable prediction research hypothesis'],
  ['Operational Definitions', 'operational definition operationalization variable measurement'],
  ['Variables and Study Design', 'independent variable dependent variable experimental design'],
  ['Correlation and Causation', 'correlation causation confounding variable causal inference'],
  ['Research Ethics', 'informed consent institutional review board voluntary participation'],
]);

function linkCourse(course) {
  const library = genomeLibrary();
  const lessonIndices = course.lessons.map((_, index) => index);
  return runGenomeLinker({ courseMap: course, lessonIndices, library });
}

describe('A1 — the history shard carries the survey, not just the method', () => {
  it('ships 50+ concepts, every definition verbatim-anchored', () => {
    const shard = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/history-intro.json'), 'utf8'));
    expect(shard.kernels.length).toBeGreaterThanOrEqual(50);
    for (const kernel of shard.kernels) {
      expect(kernel.definition?.text, kernel.id).toBeTruthy();
    }
    const anchored = shard.kernels.filter((kernel) => kernel.definition?.anchor?.quote);
    // The 3 genesis method concepts carry curated reference anchors; every
    // OpenStax era concept quotes its snapshot verbatim.
    expect(anchored.length).toBeGreaterThanOrEqual(50);
  });

  it('a U.S. History survey infers the history discipline and links 10+/15 lessons', () => {
    expect(inferCourseDisciplines(US_HISTORY_COURSE)).toContain('history');
    const linked = linkCourse(US_HISTORY_COURSE);
    const resolved = linked.telemetry.resolvedFromGenome + linked.telemetry.resolvedFromCache;
    expect(resolved).toBeGreaterThanOrEqual(10);
  });
});

describe('A2 — the literature shard deepens from 2 to 30+ concepts', () => {
  it('ships 30+ concepts spanning fiction, poetry craft, and drama', () => {
    const shard = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/lit-intro.json'), 'utf8'));
    expect(shard.kernels.length).toBeGreaterThanOrEqual(30);
    const ids = shard.kernels.map((kernel) => kernel.id);
    // The roadmap's named families: epic/oral tradition, the novel, drama,
    // poetry craft — present by id.
    expect(ids).toContain('lit/oral-formulaic-composition');
    expect(ids).toContain('lit/in-medias-res');
    expect(ids).toContain('lit/novel-vs-romance-realism');
    expect(ids).toContain('lit/scansion');
    expect(ids).toContain('lit/close-reading'); // genesis kernel untouched
  });

  it('a world-literature survey links 8+/14 lessons', () => {
    expect(inferCourseDisciplines(WORLD_LIT_COURSE)).toContain('lit');
    const linked = linkCourse(WORLD_LIT_COURSE);
    const resolved = linked.telemetry.resolvedFromGenome + linked.telemetry.resolvedFromCache;
    expect(resolved).toBeGreaterThanOrEqual(8);
  });
});

describe('A2b — the physics shard covers introductory electricity and magnetism', () => {
  it('ships the E&M concept family used by the live Physics II course', () => {
    const shard = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/physics-intro.json'), 'utf8'));
    expect(shard.kernels).toHaveLength(13);
    expect(shard.kernels.map((kernel) => kernel.id)).toEqual(
      expect.arrayContaining([
        'physics/electric-charge',
        'physics/electric-field',
        'physics/electric-potential',
        'physics/dc-circuits',
        'physics/faradays-law',
        'physics/maxwell-equations',
      ]),
    );
  });

  it('an Electricity and Magnetism survey infers physics and links 10+/15 lessons', () => {
    expect(inferCourseDisciplines(PHYSICS_E_AND_M_COURSE)).toContain('physics');
    const linked = linkCourse(PHYSICS_E_AND_M_COURSE);
    const resolved = linked.telemetry.resolvedFromGenome + linked.telemetry.resolvedFromCache;
    expect(resolved).toBeGreaterThanOrEqual(10);
    expect(linked.telemetry.conceptHits).toBeGreaterThanOrEqual(10);
  });
});

describe('A2c — the anatomy shard covers Anatomy and Physiology I', () => {
  it('ships the A&P I backbone used by the live anatomy course', () => {
    const shard = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/anatomy-intro.json'), 'utf8'));
    expect(shard.kernels).toHaveLength(12);
    expect(shard.kernels.map((kernel) => kernel.id)).toEqual(
      expect.arrayContaining([
        'anatomy/homeostasis-feedback',
        'anatomy/tissue-types',
        'anatomy/integumentary-skin-layers',
        'anatomy/skeletal-system-functions',
        'anatomy/muscle-tissue-types',
        'anatomy/nervous-tissue',
        'anatomy/sensory-perception',
        'anatomy/endocrine-hormone-signaling',
      ]),
    );
  });

  it('an Anatomy and Physiology I course infers anatomy and links 10+/15 lessons', () => {
    expect(inferCourseDisciplines(ANATOMY_PHYSIOLOGY_COURSE)).toContain('anatomy');
    const linked = linkCourse(ANATOMY_PHYSIOLOGY_COURSE);
    const resolved = linked.telemetry.resolvedFromGenome + linked.telemetry.resolvedFromCache;
    expect(resolved).toBeGreaterThanOrEqual(10);
    expect(linked.telemetry.conceptHits).toBeGreaterThanOrEqual(10);
  });
});

describe('A2d — the research-methods shard covers the methods backbone', () => {
  it('ships high-signal methods concepts for common Research Methods courses', () => {
    const shard = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/research-methods-intro.json'), 'utf8'));
    expect(shard.kernels).toHaveLength(5);
    expect(shard.kernels.map((kernel) => kernel.id)).toEqual(
      expect.arrayContaining([
        'research-methods/hypothesis',
        'research-methods/operational-definition',
        'research-methods/independent-dependent-variables',
        'research-methods/correlation-causation',
        'research-methods/informed-consent',
      ]),
    );
  });

  it('a Research Methods course infers the shard and links all five fixture lessons', () => {
    expect(inferCourseDisciplines(RESEARCH_METHODS_COURSE)).toContain('research-methods');
    const linked = linkCourse(RESEARCH_METHODS_COURSE);
    const resolved = linked.telemetry.resolvedFromGenome + linked.telemetry.resolvedFromCache;
    expect(resolved).toBeGreaterThanOrEqual(5);
    expect(linked.telemetry.conceptHits).toBeGreaterThanOrEqual(5);
  });
});

describe('A1 — the tightened history inference', () => {
  it('still fires on explicit history courses and era markers', () => {
    expect(inferCourseDisciplines({ courseName: 'U.S. History Since 1877', lessons: [] })).toContain('history');
    expect(inferCourseDisciplines({ courseName: 'American History I', lessons: [] })).toContain('history');
    expect(inferCourseDisciplines({ courseName: 'History of Jazz', lessons: [] })).toContain('history');
    expect(
      inferCourseDisciplines({
        courseName: 'America Since 1865',
        lessons: [{ title: 'The Reconstruction Era' }, { title: 'The Gilded Age' }],
      }),
    ).toContain('history');
    expect(inferCourseDisciplines({ courseName: 'Western Civilization', lessons: [] })).toContain('history');
  });

  it('no longer trips on art history, historical novels, or image reconstruction', () => {
    // \bhistory matched "Art History"; the survey belongs to no shard we ship.
    expect(inferCourseDisciplines({ courseName: 'Survey of Art History', lessons: [] })).not.toContain('history');
    // \bwar\b matched "War and Peace" in a literature course.
    expect(
      inferCourseDisciplines({
        courseName: 'The Russian Novel',
        lessons: [{ title: 'War and Peace' }, { title: 'Revolution in fiction' }],
      }),
    ).not.toContain('history');
    // Bare "reconstruction" belongs to CS/medical imaging as much as 1867.
    expect(
      inferCourseDisciplines({
        courseName: 'Computer Vision',
        lessons: [{ title: 'Image reconstruction' }],
      }),
    ).not.toContain('history');
  });
});

describe('A4 — the genome chip tells the truth kindly', () => {
  const DONE_GENERATION = { progressStep: 'done', isStreaming: false, streamDetail: '' };
  const READY_DELIVERABLES = { isGenerating: false, doneCount: 9, totalCount: 9 };
  const READY_PASS = { status: 'ready', phase: 'finish', message: '', blockers: 0 };

  function modelWithLinkerDetail(detail) {
    let budget = createApiCallBudget();
    for (const event of [
      { type: 'reset', runId: 'run-a4' },
      { type: 'courseMapCall', label: 'Course map', detail: 'single-call course map' },
      { type: 'genomeLink', label: 'CurriculumOS linker', detail },
    ]) {
      budget = applyApiCallBudgetEvent(budget, event);
    }
    return buildBuildRibbonModel({
      budget,
      generation: DONE_GENERATION,
      deliverables: READY_DELIVERABLES,
      packageQualityPass: READY_PASS,
    });
  }

  it('state 1 — shard + links: the familiar Genome n/m chip, emphasized', () => {
    const model = modelWithLinkerDetail('8 genome + 2 cached of 15 lessons (31 concepts, 24 citations, 1 bridge)');
    const chip = model.pipelineChips.find((entry) => entry.id === 'genome');
    expect(chip).toEqual({ id: 'genome', label: 'Genome 10/15', emphasis: true });
  });

  it('state 2 — no shard for the subject: absence, muted, never a zero', () => {
    const model = modelWithLinkerDetail(
      "0 genome + 0 cached of 15 lessons (0 concepts, 0 citations, 0 bridges) (no shard for inferred discipline 'lang')",
    );
    const chip = model.pipelineChips.find((entry) => entry.id === 'genome');
    expect(chip.muted).toBe(true);
    expect(chip.label).toBe('No knowledge shard yet · lang');
    expect(chip.label).not.toContain('0/');
  });

  it('state 3 — shard exists but nothing matched: the honest zero stays', () => {
    const model = modelWithLinkerDetail('0 genome + 0 cached of 15 lessons (0 concepts, 0 citations, 0 bridges)');
    const chip = model.pipelineChips.find((entry) => entry.id === 'genome');
    expect(chip.label).toBe('Genome 0/15');
    expect(chip.muted).toBeFalsy();
  });

  it('the parser reports multiple uncovered disciplines', () => {
    const parsed = parseGenomeLinkerDetail(
      "0 genome + 0 cached of 12 lessons (0 concepts) (no shard for inferred disciplines 'lang', 'cs')",
    );
    expect(parsed.uncovered).toEqual(['lang', 'cs']);
  });
});

describe('A3 — on-miss extraction is wired at the linker seam (flag-gated)', () => {
  const hookSource = readFileSync(join(process.cwd(), 'src/hooks/useDeliverables.js'), 'utf8');

  it('the seam gates on shouldOfferExtraction and persists admitted kernels to the local cache', () => {
    expect(hookSource).toContain("await import('../lib/knowledge/genomeExtraction')");
    expect(hookSource).toContain('extraction.shouldOfferExtraction({ flagValue, linkResult: linked })');
    expect(hookSource).toContain('library.persistLocalKernels(extracted.entries)');
    // Disclosure: the run's budget trail carries the verdict, rejections named.
    expect(hookSource).toContain("stage: 'genomeExtraction'");
    expect(hookSource).toContain('candidates admitted');
  });

  it('extraction NEVER fires flag-off — shouldOfferExtraction is the single gate (module pin)', async () => {
    const { shouldOfferExtraction, runOnMissGenomeExtraction } =
      await import('../src/lib/knowledge/genomeExtraction.js');
    const missLink = { telemetry: { misses: 5 }, missingIndices: [0, 1] };
    expect(shouldOfferExtraction({ flagValue: null, linkResult: missLink })).toBe(false);
    expect(shouldOfferExtraction({ flagValue: 'off', linkResult: missLink })).toBe(false);
    expect(shouldOfferExtraction({ flagValue: 'on', linkResult: missLink })).toBe(true);
    // Even with the gate forced open by a caller bug, no model call happens
    // flag-off: runOnMissGenomeExtraction re-checks internally.
    let called = 0;
    const result = await runOnMissGenomeExtraction({
      flagValue: null,
      linkResult: missLink,
      callModel: async () => {
        called += 1;
        return '[]';
      },
    });
    expect(called).toBe(0);
    expect(result.offered).toBe(false);
  });
});
