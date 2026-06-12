/**
 * V0.14.7 WS-E (E1) proof — the math-intro shard (OpenStax Calculus Volume 1
 * foundry run), verified end-to-end through the REAL linker → compiler path
 * with every shard loaded — the same per-shard proof pattern as
 * astronomy-shard-proof.test.js and cs-geo-shard-proof.test.js.
 *
 *  - the shard ships ≥ 15 admitted concepts, every definition source-anchored
 *    (tier 2 with a verbatim OpenStax quote — "verified citations")
 *  - a Calculus I course infers 'math' (the live audit's 5/15-linked course
 *    inferred NOTHING — no math regex existed)
 *  - the roadmap E4 bar, statically: 12+ of 15 Calculus I lessons
 *    genome-linked
 *  - resolved kernels project teaching atoms (citations, worked examples,
 *    mcBank items) into the compiled deliverables
 *  - every authored prerequisite edge resolves to a real kernel
 *
 * The LIVE half of E4 (browser run, budget log line, grader regression) is
 * the release agent's Crucible round — deliberately not here.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createKernelLibrary } from '../src/lib/genome/kernelLibrary.js';
import { runGenomeLinker } from '../src/lib/genome/runGenomeLinker.js';
import { buildQuizItemPlan } from '../src/lib/blueprintEnrichmentPass.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { inferCourseDisciplines } from '../src/lib/genome/libraryShardLoader.js';

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

// The roadmap's proving case: a 15-lesson Calculus I course.
const CALCULUS_COURSE = buildCourse('Calculus I', [
  ['Limits of Functions', 'limit of a function two-sided limit estimating limits one-sided limits'],
  ['The Limit Laws', 'limit laws evaluating limits algebraically limits of polynomial functions'],
  ['Continuity', 'continuity at a point intermediate value theorem removable discontinuity jump discontinuity'],
  ['Defining the Derivative', 'derivative at a point tangent line instantaneous rate of change'],
  ['The Derivative as a Function', 'derivative function graphing the derivative differentiability and continuity'],
  ['Differentiation Rules', 'power rule constant rule sum and difference rules basic differentiation rules'],
  ['The Chain Rule', 'chain rule derivative of a composite function differentiating compositions power rule'],
  ['Implicit Differentiation', 'implicit differentiation implicitly defined curves differentiating implicit equations'],
  ['Related Rates', 'related rates problems rate relationships over time dependent rates chain rule'],
  ['Maxima and Minima', 'critical points absolute extrema extreme value theorem critical number'],
  [
    'Derivatives and the Shape of a Graph',
    'first derivative test increasing and decreasing intervals concavity second derivative test inflection points',
  ],
  [
    'Applied Optimization',
    'applied optimization optimization problems constraint equations for extrema critical points',
  ],
  ['Antiderivatives', 'antiderivatives general antiderivative indefinite integral derivative function'],
  [
    'Riemann Sums and the Definite Integral',
    'riemann sum left-endpoint approximation definite integral net signed area',
  ],
  [
    'The Fundamental Theorem of Calculus',
    'fundamental theorem of calculus evaluation theorem antiderivatives definite integral',
  ],
]);

const library = genomeLibrary();

function linkCourse(course) {
  const linked = runGenomeLinker({
    courseMap: course,
    lessonIndices: course.lessons.map((_, i) => i),
    library,
    itemPlan: buildQuizItemPlan(6),
  });
  const blueprint = buildCourseBlueprint(course, {
    enrichment: { lessonContent: linked.lessonContent, quality: { source: 'genome-only' } },
  });
  const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'studyGuides', 'slideDecks', 'quizBank']);
  return { linked, compiled };
}

describe('math-intro shard contents (E1 bar: ≥15 concepts, verified citations)', () => {
  const shard = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/math-intro.json'), 'utf8'));

  it('ships at least 15 admitted concepts under the math discipline', () => {
    expect(shard.discipline).toBe('math');
    expect(shard.conceptCount).toBeGreaterThanOrEqual(15);
    expect(shard.kernels.length).toBe(shard.conceptCount);
    for (const kernel of shard.kernels) expect(kernel.id).toMatch(/^math\//);
  });

  it('every definition is source-anchored to OpenStax Calculus Volume 1 (tier 2)', () => {
    for (const kernel of shard.kernels) {
      expect(kernel.definition.tier).toBe(2);
      expect(kernel.definition.anchor?.src).toMatch(/^openstax:calculus-volume-1#\d$/);
      expect(kernel.definition.anchor?.quote?.length).toBeGreaterThanOrEqual(12);
    }
  });

  it('covers the mandated Calculus I core', () => {
    const ids = new Set(shard.kernels.map((kernel) => kernel.id));
    for (const required of [
      'math/limit-of-function',
      'math/limit-laws',
      'math/continuity',
      'math/derivative-at-point',
      'math/constant-and-power-rules',
      'math/chain-rule',
      'math/implicit-differentiation',
      'math/related-rates',
      'math/optimization-problem-setup',
      'math/first-derivative-test',
      'math/antiderivative',
      'math/definite-integral-definition',
    ]) {
      expect(ids.has(required), `missing ${required}`).toBe(true);
    }
  });
});

describe('math-intro shard proof through the real linker (E1/E4 static bar)', () => {
  const { linked, compiled } = linkCourse(CALCULUS_COURSE);

  it("routes a Calculus I course to the math shard via discipline inference (the live course's gap)", () => {
    expect(inferCourseDisciplines(CALCULUS_COURSE)).toContain('math');
    expect(inferCourseDisciplines({ courseName: 'Calculus I', lessons: [] })).toContain('math');
  });

  it('genome-links 12+ of the 15 Calculus I lessons (was 5/15 live)', () => {
    expect(linked.telemetry.resolvedFromGenome).toBeGreaterThanOrEqual(12);
    expect(linked.telemetry.misses).toBeLessThanOrEqual(3);
  });

  it('carries OpenStax Calculus citations into study-guide key terms', () => {
    const allTerms = compiled.studyGuides.studyGuides.flatMap((guide) => guide.keyTerms || []);
    const cited = allTerms.filter((term) => /calculus-volume-1|openstax/i.test(term.source || ''));
    expect(cited.length).toBeGreaterThanOrEqual(4);
  });

  it('projects a quantitative worked example into a calculus lesson', () => {
    const plans = compiled.lessonPlans.lessonPlans;
    const withWorked = plans.filter((plan) => plan.workedExample?.problem);
    expect(withWorked.length).toBeGreaterThanOrEqual(1);
    expect(
      withWorked.some((plan) => Array.isArray(plan.workedExample.steps) && plan.workedExample.steps.length >= 2),
    ).toBe(true);
  });

  it('keeps quiz items grounded in the math mcBank', () => {
    const allQuestions = compiled.quizBank.quizzes.flatMap((quiz) => quiz.questions || []);
    const blob = allQuestions
      .map((q) => `${q.question} ${(q.options || []).join(' ')}`)
      .join(' ')
      .toLowerCase();
    expect(blob).toMatch(/limit|derivative|continuous|critical|integral/);
  });

  it('exposes resolvable prerequisite chains for the resolved math concepts', () => {
    const allResolved = new Set(
      Object.values(linked.lessonContent || {})
        .flatMap((payload) => payload?.conceptProvenance?.conceptIds || [])
        .map((c) => c.id || c)
        .filter(Boolean),
    );
    expect(allResolved.size).toBeGreaterThanOrEqual(10);
    let checkedAnEdge = false;
    for (const id of allResolved) {
      const kernel = library.getKernel(id);
      if (!kernel) continue;
      for (const req of kernel.edges?.requires || []) {
        checkedAnEdge = true;
        expect(library.getKernel(req), `dangling prerequisite ${req} of ${id}`).toBeTruthy();
      }
    }
    expect(checkedAnEdge).toBe(true);
  });
});
