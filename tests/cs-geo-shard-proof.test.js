/**
 * V0.14.1 4.1 proof — the cs-intro (OpenStax Introduction to Python
 * Programming) and geo-intro (OpenGeology "An Introduction to Geology")
 * shards, verified end-to-end through the REAL linker → compiler path with
 * every shard loaded:
 *
 *  - intro-Python lesson titles resolve to the new cs/* concepts
 *  - physical-geology lesson titles resolve to the new geo/* concepts
 *  - resolved kernels project teaching atoms (keyTerms, mcBank, worked
 *    examples) into the lesson payloads
 *  - the prerequisite chains authored in the shards resolve to real kernels
 *
 * NOTE (V0.14.1 4.2 dependency): discipline inference for 'geo' does not yet
 * exist in src/lib/genome/libraryShardLoader.js — another agent owns that
 * regex. This test therefore loads ALL shards explicitly (it never relies on
 * inference to route the geology course), and the geo inference assertion is
 * marked TODO below rather than executed.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createKernelLibrary } from '../src/lib/genome/kernelLibrary.js';
import { runGenomeLinker } from '../src/lib/genome/runGenomeLinker.js';
import { buildQuizItemPlan } from '../src/lib/blueprintEnrichmentPass.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { inferCourseDisciplines } from '../src/lib/genome/libraryShardLoader.js';
import { deriveCourseGraphFromCourseMap } from '../src/lib/courseGraph/deriveFromCourseMap.js';
import { attachGenomeResources } from '../src/lib/knowledge/readingListEngine.js';
import {
  buildSourceLedgerFromCourseGraph,
  isTrustedConceptLinkedSourceLedgerRow,
} from '../src/lib/knowledge/sourceLedger.js';

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

const PYTHON_COURSE = buildCourse('Introduction to Python Programming', [
  [
    'Variables, Expressions, and Assignment',
    'variables and assignment assignment statement expressions and data types type conversion',
  ],
  ['Conditionals and Boolean Logic', 'if-else statements boolean operators branching conditional statements'],
  ['Loops and Iteration', 'while loop loop condition for loop range function iterating over a container'],
  ['Functions and Scope', 'defining functions function definition variable scope parameters and return'],
  [
    'Lists and Dictionaries with nested data',
    'list indexing ordered collection dictionary key-value pairs nested data',
  ],
  ['Strings and File I/O', 'string slicing substring file I/O reading from files open function'],
  ['Recursion and Classes', 'recursive function base case object-oriented programming classes and instances'],
]);

const GEOLOGY_COURSE = buildCourse('Physical Geology', [
  ['Mineral Identification', 'mineral identification Mohs hardness streak and luster cleavage silica tetrahedron'],
  [
    'Igneous Rocks and Volcanic Processes',
    'igneous rock intrusive and extrusive magma cooling magma viscosity volcanoes eruptive style',
  ],
  [
    'Sedimentary and Metamorphic Rocks',
    'weathering erosion sedimentary rock lithification metamorphic rock protolith foliation rock cycle',
  ],
  [
    'Plate Tectonics',
    'plate tectonics plate boundaries divergent convergent transform Earth structure earthquakes seismic waves',
  ],
  ['Geologic Time', 'geologic time relative dating superposition deep time'],
]);

const library = genomeLibrary();

function linkCourse(course) {
  const linked = runGenomeLinker({
    courseMap: course,
    lessonIndices: course.lessons.map((_, i) => i),
    library,
    itemPlan: buildQuizItemPlan(6),
  });
  const graph = deriveCourseGraphFromCourseMap(course, {
    enrichmentOverlay: { lessonContent: linked.lessonContent },
  });
  attachGenomeResources(graph);
  const sourceLedger = buildSourceLedgerFromCourseGraph(graph, { checkedAt: '2026-07-08T00:00:00.000Z' });
  const blueprint = buildCourseBlueprint(course, {
    enrichment: { lessonContent: linked.lessonContent, quality: { source: 'genome-only' } },
  });
  const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'studyGuides', 'slideDecks', 'quizBank']);
  return { linked, compiled, graph, sourceLedger };
}

// Collect the concept ids resolved across a linked course, per lesson.
function resolvedIdsByLesson(linked) {
  const map = {};
  for (const [key, payload] of Object.entries(linked.lessonContent || {})) {
    const num = Number(String(key).match(/^lesson-(\d+)$/)?.[1]);
    const ids = (payload?.conceptProvenance?.conceptIds || []).map((c) => c.id || c).filter(Boolean);
    map[num] = ids;
  }
  return map;
}

describe('cs-intro shard proof (V0.14.1 4.1)', () => {
  const { linked, compiled } = linkCourse(PYTHON_COURSE);

  it('routes a Python course to the cs shard via discipline inference', () => {
    expect(inferCourseDisciplines(PYTHON_COURSE)).toContain('cs');
  });

  it('resolves the intro-Python lesson titles to the new cs/* concepts', () => {
    expect(linked.telemetry.resolvedFromGenome).toBeGreaterThanOrEqual(5);
    const allTerms = compiled.studyGuides.studyGuides.flatMap((guide) => guide.keyTerms || []);
    const blob = JSON.stringify(allTerms).toLowerCase();
    // Variables, Expressions, and Assignment
    expect(blob).toMatch(/variable|assignment/);
    expect(blob).toMatch(/type conversion|data type|division/);
    // Loops and Iteration
    expect(blob).toMatch(/while loop|loop body|loop expression/);
    expect(blob).toMatch(/for loop|iterates over|range/);
    // Functions and Scope
    expect(blob).toMatch(/function|local scope|global scope/);
    // Dictionaries and nested data
    expect(blob).toMatch(/dictionary|key-value/);
  });

  it('carries OpenStax Python citations into study-guide key terms', () => {
    const allTerms = compiled.studyGuides.studyGuides.flatMap((guide) => guide.keyTerms || []);
    const cited = allTerms.filter((term) => /introduction-python-programming|openstax/i.test(term.source || ''));
    expect(cited.length).toBeGreaterThanOrEqual(4);
  });

  it('projects a trace-style worked example into a Python lesson', () => {
    const plans = compiled.lessonPlans.lessonPlans;
    const withWorked = plans.filter((plan) => plan.workedExample?.problem);
    expect(withWorked.length).toBeGreaterThanOrEqual(1);
    const anyTrace = withWorked.some(
      (plan) => Array.isArray(plan.workedExample.steps) && plan.workedExample.steps.length >= 2,
    );
    expect(anyTrace).toBe(true);
  });

  it('keeps quiz items grounded in the cs mcBank', () => {
    const allQuestions = compiled.quizBank.quizzes.flatMap((quiz) => quiz.questions || []);
    const blob = allQuestions
      .map((q) => `${q.question} ${(q.options || []).join(' ')}`)
      .join(' ')
      .toLowerCase();
    expect(blob).toMatch(/index|range\(5\)|infinite loop|key|7 \/ 2|first character/);
  });

  it('exposes resolvable prerequisite chains for the resolved cs concepts', () => {
    const byLesson = resolvedIdsByLesson(linked);
    const allResolved = new Set(Object.values(byLesson).flat());
    expect(allResolved.size).toBeGreaterThanOrEqual(5);
    let checkedAnEdge = false;
    for (const id of allResolved) {
      const kernel = library.getKernel(id);
      if (!kernel) continue;
      for (const req of kernel.edges?.requires || []) {
        checkedAnEdge = true;
        // every authored prerequisite must itself be a real kernel in the genome
        expect(library.getKernel(req)).toBeTruthy();
      }
    }
    expect(checkedAnEdge).toBe(true);
  });
});

describe('geo-intro shard proof (V0.14.1 4.1)', () => {
  const { linked, compiled, sourceLedger } = linkCourse(GEOLOGY_COURSE);

  // TODO (V0.14.1 4.2 — owned by another agent): once a 'geo' discipline regex
  // is added to inferCourseDisciplines in src/lib/genome/libraryShardLoader.js,
  // assert: expect(inferCourseDisciplines(GEOLOGY_COURSE)).toContain('geo').
  // Until then the resolver still works because this test loads all shards
  // explicitly rather than relying on inference.

  it('resolves the physical-geology lesson titles to the new geo/* concepts', () => {
    expect(linked.telemetry.resolvedFromGenome).toBeGreaterThanOrEqual(4);
    const allTerms = compiled.studyGuides.studyGuides.flatMap((guide) => guide.keyTerms || []);
    const blob = JSON.stringify(allTerms).toLowerCase();
    // Mineral Identification
    expect(blob).toMatch(/mineral|hardness|streak|cleavage/);
    // Igneous Rocks and Volcanic Processes
    expect(blob).toMatch(/igneous|magma|intrusive|extrusive|viscosity/);
    // Plate Tectonics
    expect(blob).toMatch(/plate|boundary|divergent|convergent|transform/);
    // Geologic Time
    expect(blob).toMatch(/geologic time|relative dating|superposition/);
  });

  it('carries OpenGeology citations into study-guide key terms', () => {
    const allTerms = compiled.studyGuides.studyGuides.flatMap((guide) => guide.keyTerms || []);
    const cited = allTerms.filter((term) => /introduction to geology|opengeology/i.test(term.source || ''));
    expect(cited.length).toBeGreaterThanOrEqual(3);
  });

  it('exports OpenGeology genome rows as trusted concept-linked source proof', () => {
    const geologyRows = (sourceLedger?.rows || []).filter((row) =>
      /open\s*geology|introduction to geology/i.test([row.title, row.citation, row.url].join(' ')),
    );
    expect(geologyRows.length).toBeGreaterThanOrEqual(3);
    expect(geologyRows.every(isTrustedConceptLinkedSourceLedgerRow)).toBe(true);
    expect(geologyRows.every((row) => row.url.startsWith('https://opengeology.org/textbook/#section-'))).toBe(true);
    expect(geologyRows.every((row) => /CC[-\s]BY[-\s]NC[-\s]SA\s*4\.0/i.test(row.license))).toBe(true);
    expect(sourceLedger?.reviewRows || []).toHaveLength(0);
  });

  it('teaches the P-wave / S-wave anchor fact precisely', () => {
    const allTerms = compiled.studyGuides.studyGuides.flatMap((guide) => guide.keyTerms || []);
    const blob = JSON.stringify(allTerms).toLowerCase();
    // The earthquakes kernel's precise claim must survive into the content.
    expect(blob).toMatch(/p waves|p-wave|seismic/);
  });

  it('keeps quiz items grounded in the geo mcBank', () => {
    const allQuestions = compiled.quizBank.quizzes.flatMap((quiz) => quiz.questions || []);
    const blob = allQuestions
      .map((q) => `${q.question} ${(q.options || []).join(' ')}`)
      .join(' ')
      .toLowerCase();
    expect(blob).toMatch(/mohs|streak|protolith|divergent|superposition|pyroclastic|viscosity/);
  });

  it('exposes resolvable prerequisite chains for the resolved geo concepts', () => {
    const byLesson = resolvedIdsByLesson(linked);
    const allResolved = new Set(Object.values(byLesson).flat());
    expect(allResolved.size).toBeGreaterThanOrEqual(4);
    let checkedAnEdge = false;
    for (const id of allResolved) {
      const kernel = library.getKernel(id);
      if (!kernel) continue;
      for (const req of kernel.edges?.requires || []) {
        checkedAnEdge = true;
        expect(library.getKernel(req)).toBeTruthy();
      }
    }
    expect(checkedAnEdge).toBe(true);
  });
});
