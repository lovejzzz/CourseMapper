/**
 * v0.13 P0 golden equivalence harness.
 *
 * The non-negotiable gate from docs/V0.13_COURSE_GRAPH_IR_ROADMAP.md: for
 * real fixture course maps, compiling deliverables through the graph path
 * (derive → render → blueprint) must produce results equivalent to the
 * legacy map-driven path. The graph earns every later phase by holding this
 * gate — any divergence is either a derivation bug or an explicitly
 * allowlisted improvement.
 */
import { describe, expect, it } from 'vitest';

import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  getBlueprintCompiledFeatures,
} from '../src/lib/courseBlueprintCompiler';
import { repairCourseMapReadiness } from '../src/lib/deliverableReadiness';
import { deriveCourseGraphFromCourseMap, buildBlueprintFromGraph, validateCourseGraph } from '../src/lib/courseGraph';
import { makeScenarioCourseMap } from './lib/blueprintQualityScenarioFactory';

const ALL_FEATURES = [
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
];

const FIXTURES = [
  makeScenarioCourseMap({
    courseName: 'Principles of Microeconomics',
    lessonCount: 8,
    theme: 'microeconomics',
    lens: 'market analysis',
    artifact: 'policy memo',
    evidence: 'market evidence',
    asyncTask: 'Read the assigned chapter',
    syncTask: 'Workshop a pricing case',
    resource: 'OpenStax microeconomics chapter',
    evaluation: 'Objectives align to weekly problem sets',
    topics: [
      'Scarcity and Opportunity Cost',
      'Demand and Supply',
      'Elasticity',
      'Consumer Choice',
      'Production Costs',
      'Perfect Competition',
      'Monopoly',
      'Externalities',
    ],
  }),
  makeScenarioCourseMap({
    courseName: 'Fundamentals of Nursing',
    lessonCount: 6,
    theme: 'clinical nursing practice',
    lens: 'patient-safety decision making',
    artifact: 'care plan',
    evidence: 'patient assessment evidence',
    asyncTask: 'Review the skills checklist',
    syncTask: 'Run a simulation debrief',
    resource: 'Clinical skills handbook chapter',
    evaluation: 'Objectives align to skills checkoffs',
    topics: [
      'Foundations of Practice',
      'Vital Signs and Assessment',
      'Infection Control',
      'Medication Safety',
      'Documentation',
      'Clinical Judgment',
    ],
  }),
];

// Volatile or derivation-order metadata allowed to differ between paths.
// Everything else must match exactly. Keep this list SHORT and justified:
//  - sourceGrounding/receipt traces embed raw cell text whose canonical
//    rendering (numbering) the graph path normalizes earlier than the map
//    path does.
const ALLOWLISTED_KEY_RE = /^(sourceGrounding|sourceEvidenceTrace|blueprintQualityReceipt|qualityReceipt)$/;

function normalizeForComparison(node) {
  if (Array.isArray(node)) return node.map(normalizeForComparison);
  if (node && typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (ALLOWLISTED_KEY_RE.test(key)) continue;
      out[key] = normalizeForComparison(value);
    }
    return out;
  }
  return node;
}

describe('course graph golden equivalence (v0.13 P0)', () => {
  it('feeds concept kernels to the compiler identically to the legacy enrichment overlay', () => {
    const fixture = FIXTURES[0];
    const repaired = repairCourseMapReadiness({ courseMap: fixture }).courseMap || fixture;
    const kernel = {
      tm: 'Opportunity cost',
      fs: [{ tx: 'Opportunity cost is the value of the next-best alternative forgone.' }],
    };

    // Legacy path: overlay passed through options.enrichment.lessonContent.
    // v0.14.1 Phase 3: the assessment registry is shared infrastructure —
    // both paths consume the SAME registry (deriveCourseGraphFromCourseMap
    // is the single derivation), so equivalence continues to prove that the
    // graph render/derive round trip adds no divergence of its own.
    const mapBlueprint = buildCourseBlueprint(repaired, {
      enrichment: { lessonContent: { 'lesson-1': kernel } },
      assessmentRegistry: deriveCourseGraphFromCourseMap(repaired).assessments,
    });
    const mapCompiled = compileBlueprintDeliverables(mapBlueprint, ['studyGuides', 'quizBank']);

    // Graph path: the kernel lives on the Concept entity (Concept ≡ kernel).
    const graph = deriveCourseGraphFromCourseMap(repaired);
    const lessonOneConceptId = graph.edges.teaches.find((edge) => edge.from === graph.sessions[0].id)?.to;
    const concept = graph.concepts.find((entry) => entry.id === lessonOneConceptId);
    concept.kernel = kernel;
    const graphBlueprint = buildBlueprintFromGraph(graph);
    const graphCompiled = compileBlueprintDeliverables(graphBlueprint, ['studyGuides', 'quizBank']);

    for (const featureId of ['studyGuides', 'quizBank']) {
      expect(normalizeForComparison(graphCompiled[featureId])).toEqual(normalizeForComparison(mapCompiled[featureId]));
    }
  }, 120000);

  for (const fixture of FIXTURES) {
    it(`compiles ${fixture.courseName} identically via map path and graph path`, () => {
      // The pipeline repairs maps before compiling — both paths start from
      // the same canonical map, exactly as generateAll does.
      const repaired = repairCourseMapReadiness({ courseMap: fixture }).courseMap || fixture;
      const features = getBlueprintCompiledFeatures(ALL_FEATURES, { enabled: true });

      // v0.14.1 Phase 3: production compiles through the registry (graph
      // path always passes graph.assessments). The map path receives the
      // registry from the SAME shared derivation, so this gate keeps
      // proving the render/derive round trip is divergence-free — the
      // documented adaptation mechanism for an allowlisted improvement.
      const mapBlueprint = buildCourseBlueprint(repaired, {
        assessmentRegistry: deriveCourseGraphFromCourseMap(repaired).assessments,
      });
      const mapCompiled = compileBlueprintDeliverables(mapBlueprint, features);

      const graph = deriveCourseGraphFromCourseMap(repaired);
      expect(validateCourseGraph(graph).valid).toBe(true);
      const graphBlueprint = buildBlueprintFromGraph(graph);
      const graphCompiled = compileBlueprintDeliverables(graphBlueprint, features);

      for (const featureId of features) {
        expect(
          normalizeForComparison(graphCompiled[featureId]),
          `feature ${featureId} diverged between map path and graph path`,
        ).toEqual(normalizeForComparison(mapCompiled[featureId]));
      }
    }, 120000);
  }
});
