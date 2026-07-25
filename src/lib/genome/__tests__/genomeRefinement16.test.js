/**
 * CurriculumOS refine loop — iteration 16.
 *
 * (a) Coverage: an ELEVENTH bridge family lights up the epistemic archetype
 *     epistemic/operationalization — turning an abstract construct into a
 *     concrete measure, and minding what the measure misses. econ/proxy-variable
 *     (GDP for economic well-being) ↔ bio/bioindicator (an indicator species for
 *     ecosystem health). Genome: 28 concepts / 14 archetypes / 11 bridge families.
 *
 * (b) Guardrail: a foundry alias-collision lint (findAliasCollisions) that
 *     systematizes the iter-15 fix — it flags every surface of a kernel whose
 *     token set is FULLY CONTAINED in a kernel of another discipline (the
 *     condition under which that discipline's lesson always cross-resolves the
 *     surface, regardless of phrasing). Running it caught a real latent
 *     collision: "model assumptions" lived on BOTH econ/economic-model and
 *     stats/statistical-model; this iteration disjoints them, and the lint is now
 *     clean on the whole genome. (The softer partial-overlap class — e.g. the
 *     shared single token "model" between those two terms — is phrasing-dependent
 *     and intentionally out of the full-containment lint's scope.)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createKernelLibrary } from '../kernelLibrary.js';
import { runGenomeLinker } from '../runGenomeLinker.js';
import { findAliasCollisions } from '../foundryAdmission.js';
import { buildQuizItemPlan } from '../../blueprintEnrichmentPass.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../../courseBlueprintCompiler.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
}

function loadShardKernels() {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
  const kernels = [];
  for (const shard of manifest.shards) {
    const body = JSON.parse(readFileSync(join(process.cwd(), 'public/genome', shard.path), 'utf8'));
    kernels.push(...body.kernels);
  }
  return { manifest, kernels };
}

function genesisLibrary() {
  const library = createKernelLibrary({ storage: memoryStorage() });
  const { kernels } = loadShardKernels();
  library.addKernels(kernels, { source: 'shard' });
  const archetypeShard = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/archetypes.json'), 'utf8'));
  library.addArchetypes(archetypeShard.archetypes);
  return library;
}

const library = genesisLibrary();

const COURSE = {
  courseName: 'Operationalizing Constructs Across Disciplines',
  lessons: [
    {
      title: 'Lesson 1: GDP as a Proxy',
      sections: [
        {
          topicSection: 'proxy variable proxy measure stand-in variable GDP economic well-being',
          learningObjectives: 'Critique GDP as a proxy for well-being.',
        },
      ],
    },
    {
      title: 'Lesson 2: Bioindicators',
      sections: [
        {
          topicSection: 'bioindicator indicator species biomarker ecosystem health water quality',
          learningObjectives: 'Evaluate a bioindicator of ecosystem health.',
        },
      ],
    },
  ],
};

function linkCourse() {
  return runGenomeLinker({ courseMap: COURSE, lessonIndices: [0, 1], library, itemPlan: buildQuizItemPlan(6) });
}

describe('iteration 16a — operationalization bridges economics and biology', () => {
  it('resolves each concept with citations and bridges the exact pair', () => {
    const linked = linkCourse();
    expect(linked.lessonContent['lesson-1'].conceptProvenance.conceptIds).toContain('econ/proxy-variable');
    expect(linked.lessonContent['lesson-2'].conceptProvenance.conceptIds).toContain('bio/bioindicator');
    expect(linked.lessonContent['lesson-1'].conceptProvenance.citations.length).toBeGreaterThan(0);
    const bridge = linked.bridges.find((b) => b.archetype === 'epistemic/operationalization');
    expect(bridge).toBeTruthy();
    expect([bridge.fromConcept.id, bridge.toConcept.id].sort()).toEqual(['bio/bioindicator', 'econ/proxy-variable']);
    expect(bridge.note).toContain('↔');
    expect(bridge.note).not.toMatch(/\{[a-z]/);
  });

  it('keeps the two lessons from cross-resolving each other (disjoint surfaces)', () => {
    const linked = linkCourse();
    expect(linked.lessonContent['lesson-1'].conceptProvenance.conceptIds).not.toContain('bio/bioindicator');
    expect(linked.lessonContent['lesson-2'].conceptProvenance.conceptIds).not.toContain('econ/proxy-variable');
  });

  it('renders the bridge prose and the operationalization reasoning routine in the study guide', () => {
    const linked = linkCourse();
    const enrichment = { source: 'iter16-test', lessonContent: linked.lessonContent };
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(COURSE, { enrichment })));
    const compiled = compileBlueprintDeliverables(blueprint, ['studyGuides'], {});
    const serialized = JSON.stringify(compiled.studyGuides.studyGuides);
    expect(serialized).toContain('shares the deep structure');
    const guide = compiled.studyGuides.studyGuides.find(
      (g) =>
        Array.isArray(g.reasoningRoutine) && g.reasoningRoutine.some((r) => /Operationalization/i.test(r.structure)),
    );
    expect(guide).toBeTruthy();
    expect(guide.reasoningRoutine.some((r) => /separate the construct from its measure/i.test(r.howToReason))).toBe(
      true,
    );
    expect(serialized).not.toMatch(/\{[a-z][a-z ]{2,}\}/);
  });
});

describe('iteration 16b — the alias-collision lint (foundry guardrail)', () => {
  it('reports the live genome as free of UNINTENDED cross-discipline collisions', () => {
    const { kernels } = loadShardKernels();
    // v0.13.5: the nursing shard (OpenStax A&P 2e) and the biology shard both
    // legitimately carry the SAME concept — homeostasis / negative feedback —
    // anchored to their own discipline's textbook. That is real shared
    // knowledge, not the generic-vocabulary contamination this lint guards
    // against (iter 15's "p-value" ⊆ "percent daily value", caught and fixed
    // before shipping). Whitelist that one same-concept pair; any NEW
    // collision still fails the test.
    const ALLOWED = new Set([
      'bio/homeostasis<->nursing/homeostasis',
      'nursing/homeostasis<->bio/homeostasis',
      'anatomy/homeostasis-feedback<->bio/homeostasis',
      'bio/homeostasis<->anatomy/homeostasis-feedback',
      'anatomy/homeostasis-feedback<->nursing/homeostasis',
      'nursing/homeostasis<->anatomy/homeostasis-feedback',
      'anatomy/levels-of-organization<->nursing/levels-of-organization',
      'nursing/levels-of-organization<->anatomy/levels-of-organization',
      // v0.16.80: physics's single-token alias "charge" is contained in the
      // two-token policy term "pollution charge". Benign: the resolver scores
      // whole-lesson vocabulary overlap, so an electricity lesson cannot prefer
      // the policy kernel on one shared token. Kept visible rather than
      // renamed, because "pollution charge" is the source's own term.
      'physics/electric-charge<->envpolicy/pollution-charge',
    ]);
    const unexpected = findAliasCollisions(kernels).filter((c) => !ALLOWED.has(`${c.of}<->${c.containedIn}`));
    expect(unexpected).toEqual([]);
  });

  it('flags a cross-discipline surface whose tokens are fully contained in another', () => {
    const collisions = findAliasCollisions([
      { id: 'history/source', term: 'Source criticism', aliases: ['provenance and bias'] },
      { id: 'stats/data', term: 'Data provenance', aliases: ['source provenance bias measure'] },
    ]);
    // "provenance and bias" {provenance, bias} ⊆ the stats kernel's tokens.
    expect(collisions.some((c) => c.of === 'history/source' && c.containedIn === 'stats/data')).toBe(true);
  });

  it('does not flag same-discipline overlap or genuinely disjoint surfaces', () => {
    expect(
      findAliasCollisions([
        { id: 'econ/a', term: 'Demand curve', aliases: ['demand schedule'] },
        { id: 'econ/b', term: 'Demand shift', aliases: ['demand curve shift'] }, // same discipline → ignored
      ]),
    ).toEqual([]);
    expect(
      findAliasCollisions([
        { id: 'chem/x', term: 'Titration', aliases: ['equivalence point'] },
        { id: 'lit/y', term: 'Close reading', aliases: ['textual evidence'] }, // disjoint tokens
      ]),
    ).toEqual([]);
  });
});

describe('iteration 16c — genome coverage milestone', () => {
  it('spans at least 28 concepts and 14 instantiated archetypes incl. operationalization', () => {
    const { manifest, kernels } = loadShardKernels();
    expect(manifest.conceptCount).toBeGreaterThanOrEqual(28);
    const used = new Set();
    for (const k of kernels) for (const e of k.edges?.instanceOf || []) used.add(e.archetype);
    expect(used.has('epistemic/operationalization')).toBe(true);
    expect(used.size).toBeGreaterThanOrEqual(14);
  });
});
