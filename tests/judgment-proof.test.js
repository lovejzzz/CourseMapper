/**
 * v0.14 Judgment proof — the genome reasons about teaching, not just stores
 * facts. Verifies the full prerequisite-judgment loop and the competency
 * crosswalk, end-to-end, with zero network:
 *
 *  P1 detection      — a course teaching a concept whose genome prerequisite
 *                      it omits is flagged (missing-prerequisite).
 *  P1 classification — the gap is 'bridgeable' (the prereq IS in the genome).
 *  P1 bridge         — a cited prerequisite primer is built from the missing
 *                      kernel (definition + fact + real OpenStax citation).
 *  P1 surfacing      — the primer becomes a genome-prerequisite Resource and a
 *                      lesson-plan Prerequisite Check; a sound course yields none.
 *  P2 crosswalk      — the syllabus Competency Map maps concepts to Bloom and
 *                      the curated NGSS standard (Kepler → HS-ESS1-4).
 */
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createKernelLibrary } from '../src/lib/genome/kernelLibrary.js';
import { runGenomeLinker } from '../src/lib/genome/runGenomeLinker.js';
import { buildQuizItemPlan } from '../src/lib/blueprintEnrichmentPass.js';
import { compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import {
  deriveCourseGraphFromCourseMap,
  attachEnrichmentToGraph,
  buildBlueprintFromGraph,
} from '../src/lib/courseGraph/index.js';
import { attachGenomeResources } from '../src/lib/knowledge/index.js';

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
          learningObjectives: `Analyze ${topics} using observations.`,
          weeklyAssessments: `Week ${index + 1} quiz.`,
        },
      ],
    })),
  };
}

// Teaches spectral lines (requires the electromagnetic spectrum) WITHOUT ever
// teaching the spectrum — a real, genome-detectable prerequisite hole. Also
// teaches Kepler's laws so the competency map carries the NGSS standard.
const GAPPED = fixtureCourse('Stellar Spectroscopy', [
  ['Spectral Lines', 'spectral lines emission absorption line formation'],
  ['Orbits and Kepler', 'Kepler third law orbital period semimajor axis'],
]);

// The sound version teaches the electromagnetic spectrum first.
const SOUND = fixtureCourse('Light and Spectra', [
  ['The Electromagnetic Spectrum', 'electromagnetic spectrum wavelength light gathering'],
  ['Spectral Lines', 'spectral lines emission absorption line formation'],
]);

const library = genomeLibrary();

function link(course) {
  return runGenomeLinker({
    courseMap: course,
    lessonIndices: course.lessons.map((_, i) => i),
    library,
    itemPlan: buildQuizItemPlan(6),
  });
}

function compile(course, linked) {
  const graph = attachEnrichmentToGraph(deriveCourseGraphFromCourseMap(course), {
    lessonContent: linked.lessonContent,
    quality: { source: 'genome-only' },
  });
  const genomeResourceCount = attachGenomeResources(graph);
  const compiled = compileBlueprintDeliverables(buildBlueprintFromGraph(graph), ['syllabus', 'lessonPlans']);
  return { graph, compiled, genomeResourceCount };
}

describe('judgment proof (v0.14)', () => {
  beforeAll(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('network call in judgment proof — the judgment path must be offline');
      }),
    );
  });

  it('detects the prerequisite gap and classifies it bridgeable (P1)', () => {
    const linked = link(GAPPED);
    const missing = linked.prerequisiteFindings.filter((f) => f.type === 'missing-prerequisite');
    expect(missing.length).toBeGreaterThanOrEqual(1);
    const emGap = missing.find((f) => f.prerequisiteId === 'astro/electromagnetic-spectrum');
    expect(emGap).toBeTruthy();
    expect(emGap.gapClass).toBe('bridgeable');
    expect(linked.prerequisiteJudgment.bridgeable).toBeGreaterThanOrEqual(1);
    expect(linked.prerequisiteJudgment.primersBuilt).toBeGreaterThanOrEqual(1);
  });

  it('builds a cited prerequisite primer from the missing genome kernel (P1)', () => {
    const linked = link(GAPPED);
    const primer = linked.prerequisitePrimers.find((p) => p.prerequisiteId === 'astro/electromagnetic-spectrum');
    expect(primer).toBeTruthy();
    expect(primer.definition.length).toBeGreaterThan(20);
    expect(primer.source).toMatch(/openstax/i);
    expect(primer.whyNote).toMatch(/Lesson 1/);
    // Anchored to the lesson that needs it (spectral lines = lesson index 0).
    expect(primer.neededForLessonIndex).toBe(0);
  });

  it('surfaces the primer as a genome-prerequisite resource and a lesson-plan check (P1)', () => {
    const linked = link(GAPPED);
    const { graph, compiled } = compile(GAPPED, linked);
    const primerResource = graph.resources.find((r) => r.origin === 'genome-prerequisite');
    expect(primerResource).toBeTruthy();
    expect(primerResource.citation).toMatch(/Prerequisite primer/i);
    expect(primerResource.kind).toBe('prerequisite primer');
    const spectralPlan = compiled.lessonPlans.lessonPlans.find((p) => /spectral/i.test(p.lessonTitle));
    expect(spectralPlan.prerequisiteCheck).toBeTruthy();
    expect(spectralPlan.prerequisiteCheck.primers.length).toBeGreaterThanOrEqual(1);
    expect(spectralPlan.prerequisiteCheck.primers[0].source).toMatch(/openstax/i);
  });

  it('a soundly-sequenced course produces no prerequisite gaps or primers (P1, no false positives)', () => {
    const linked = link(SOUND);
    expect(linked.prerequisiteFindings.filter((f) => f.type === 'missing-prerequisite')).toEqual([]);
    expect(linked.prerequisitePrimers).toEqual([]);
    const { graph } = compile(SOUND, linked);
    expect(graph.resources.some((r) => r.origin === 'genome-prerequisite')).toBe(false);
  });

  it('renders a competency map mapping concepts to Bloom and the NGSS standard (P2)', () => {
    const linked = link(GAPPED);
    const { compiled } = compile(GAPPED, linked);
    const map = compiled.syllabus.syllabus.competencyMap;
    expect(map).toBeTruthy();
    expect(map.rows.length).toBeGreaterThanOrEqual(1);
    // Bloom comes from owned kernel data.
    expect(map.bloomSpan.lowest).toBeTruthy();
    expect(map.rows.every((row) => row.bloom)).toBe(true);
    // The curated NGSS standard on Kepler renders with its code.
    const kepler = map.rows.find((row) => /kepler/i.test(row.concept));
    expect(kepler).toBeTruthy();
    expect(kepler.standards.some((s) => s.framework === 'NGSS' && s.code === 'HS-ESS1-4')).toBe(true);
    expect(map.frameworks).toContain('NGSS');
  });

  it('ships the competency map into the syllabus DOCX-bound data with a Bloom span (P2)', () => {
    const linked = link(GAPPED);
    const { compiled } = compile(GAPPED, linked);
    const serialized = JSON.stringify(compiled.syllabus.syllabus.competencyMap);
    expect(serialized).toContain('HS-ESS1-4');
    expect(serialized).toContain('NGSS');
  });
});
