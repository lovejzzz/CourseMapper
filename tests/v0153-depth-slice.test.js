/**
 * v0.15.3 D1 — the depth slice, pinned (docs/V0.15.3_MEASURED_DEPTH_ROADMAP.md).
 *
 * DEEP lesson plans carry the kernel INSIDE the back-half activity steps:
 *  - the collaborative segment runs the kernel's discussion tension (with
 *    the genome citation named in the step that uses it),
 *  - the independent sprint checks drafts against the worked example's
 *    moves and the term misconception/correction,
 *  - the exit ticket closes the loop on the warm-up misconception.
 *
 * The contract under test:
 *  1. deep mode places each atom inside the segment that teaches it;
 *  2. FLAT is the default and stays byte-identical to the pre-flag output;
 *  3. deep without kernel atoms compiles byte-identical to flat (no
 *     fabrication — every deep line falls back per-atom);
 *  4. the compile is deterministic (same inputs → same output);
 *  5. the flag module: default 'flat' under no storage, configMap injection
 *     is immutable and rides ONLY lessonPlans.
 */
import { describe, expect, it } from 'vitest';

import { buildCourseBlueprint, compileBlueprintDeliverable } from '../src/lib/courseBlueprintCompiler';
import { applyLessonDepthToConfigMap, readLessonDepthMode } from '../src/lib/lessonDepth';

// ── fixtures ────────────────────────────────────────────────────────────────

function geologyCourseMap(lessonCount = 3) {
  return {
    courseName: 'Physical Geology',
    lessons: Array.from({ length: lessonCount }, (_, index) => ({
      title: `Lesson ${index + 1}: Mineral Topic ${index + 1}`,
      sections: [
        {
          topicSection: `${index + 1}.1: mineral identification`,
          learningObjectives:
            'Analyze mineral properties with hand-specimen evidence.\nEvaluate streak and hardness tradeoffs in identification.',
          weeklyAssessments: `1. Week ${index + 1} quiz: applied mineral identification problems.`,
          asyncActivities: 'Read the minerals chapter.',
          syncActivities: 'Lab: identify hand specimens.',
          supportingResources: 'Mineral kit guide',
        },
      ],
    })),
  };
}

// A kernel payload carrying every atom the deep outline can place: worked
// example, discussion tension, misconception/correction terms, and a
// genome citation on the provenance block.
function deepKernelPayload() {
  return {
    quizItems: [],
    keyTerms: [
      {
        term: 'Streak',
        definition: 'The color of a mineral in powdered form.',
        example: 'Hematite streaks red-brown.',
        misconception: 'Streak always matches the specimen color.',
        correction: 'Powder color is often different from the hand-specimen color.',
      },
      {
        term: 'Hardness',
        definition: 'Resistance to scratching measured on the Mohs scale.',
        example: 'Quartz scratches glass.',
        misconception: 'A heavier mineral is always harder.',
        correction: 'Density and hardness are independent properties.',
      },
    ],
    workedExample: {
      problem: 'Identify an unknown glassy mineral that scratches glass but leaves no streak.',
      steps: ['Test hardness against glass', 'Run the porcelain streak test', 'Check cleavage angles'],
      result: 'The specimen keys out as quartz.',
    },
    discussionPrompt: {
      prompt: 'Is streak or hardness the more trustworthy first test for field identification',
      tension: 'Speed of testing versus diagnostic certainty.',
      positions: [
        'Streak first: powder color survives weathering and habit changes',
        'Hardness first: the glass plate is faster and needs no porcelain',
      ],
    },
    conceptProvenance: {
      source: 'genome-linked',
      conceptIds: ['geo/mineral-identification'],
      tier: 2,
      tierLabel: 'source-anchored',
      citations: ['OpenStax Geology §3.5 (CC BY 4.0)'],
    },
    kernel: {
      facts: ['Minerals are identified by repeatable physical tests, not appearance.'],
      scenario: {
        setup: 'A student finds a metallic-gray specimen that leaves a red-brown powder line.',
        materials: 'hand specimen, porcelain plate, glass plate',
      },
    },
  };
}

const DEEP_CONFIG = { configMap: { lessonPlans: { depth: 'deep' } } };
const FLAT_CONFIG = { configMap: { lessonPlans: { depth: 'flat' } } };

function compilePlans(blueprint, options) {
  return compileBlueprintDeliverable('lessonPlans', blueprint, options || {});
}

function enrichedBlueprint() {
  return buildCourseBlueprint(geologyCourseMap(), {
    enrichment: { source: 'test-enrichment', lessonContent: { 'lesson-1': deepKernelPayload() } },
  });
}

// ── (1) deep places each kernel atom inside the segment that teaches it ─────

describe('deep mode — kernel atoms inside the back-half steps', () => {
  const plans = compilePlans(enrichedBlueprint(), DEEP_CONFIG).lessonPlans;
  const outline = plans[0].outline;
  const collaborative = outline[3];
  const sprint = outline[4];
  const debrief = outline[5];

  it('the collaborative segment runs the kernel discussion with the citation in the step', () => {
    expect(collaborative.description).toContain('more trustworthy first test');
    expect(collaborative.description).toContain('OpenStax Geology §3.5');
    expect(collaborative.instructorNotes).toContain('Streak first');
    expect(collaborative.instructorNotes).toContain('Hardness first');
  });

  it('the sprint mirrors the worked example and corrects the misconception in the conference note', () => {
    expect(sprint.description).toContain('worked example');
    expect(sprint.instructorNotes).toContain('Streak always matches the specimen color');
    expect(sprint.instructorNotes).toContain('Powder color is often different');
  });

  it('the closure note closes the warm-up misconception loop', () => {
    expect(debrief.description).toContain('Closure note');
    expect(debrief.description).toContain('Streak always matches the specimen color');
    expect(debrief.instructorNotes).toContain('OpenStax Geology §3.5');
  });

  it('the front half keeps its v0.13.3 kernel script (depth adds, never moves)', () => {
    expect(outline[0].description).toContain('Misconception poll');
    expect(outline[1].instructorNotes).toContain('Test hardness against glass');
  });
});

// ── (2) flat is the default and the flag only changes lessonPlans ───────────

describe('flat default', () => {
  it('no configMap compiles byte-identical to an explicit flat compile', () => {
    expect(compilePlans(enrichedBlueprint(), {})).toEqual(compilePlans(enrichedBlueprint(), FLAT_CONFIG));
  });

  it('flat back-half segments carry no kernel debate or exit-ticket loop', () => {
    const outline = compilePlans(enrichedBlueprint(), FLAT_CONFIG).lessonPlans[0].outline;
    expect(outline[3].description).not.toContain('more trustworthy first test');
    expect(outline[5].description).not.toContain('Exit ticket');
  });
});

// ── (3) deep without kernel atoms = flat (no fabrication) ───────────────────

describe('deep mode without kernel atoms', () => {
  it('a kernel-less course compiles byte-identical under deep and flat', () => {
    const bare = () => buildCourseBlueprint(geologyCourseMap());
    expect(compilePlans(bare(), DEEP_CONFIG)).toEqual(compilePlans(bare(), FLAT_CONFIG));
  });

  it('the unenriched lessons of a mixed course stay flat even in deep mode', () => {
    const deep = compilePlans(enrichedBlueprint(), DEEP_CONFIG).lessonPlans;
    const flat = compilePlans(enrichedBlueprint(), FLAT_CONFIG).lessonPlans;
    expect(deep[1]).toEqual(flat[1]);
    expect(deep[2]).toEqual(flat[2]);
  });
});

// ── (4) determinism ─────────────────────────────────────────────────────────

describe('determinism', () => {
  it('two deep compiles of the same inputs are identical', () => {
    expect(compilePlans(enrichedBlueprint(), DEEP_CONFIG)).toEqual(compilePlans(enrichedBlueprint(), DEEP_CONFIG));
  });
});

// ── (5) the flag module ─────────────────────────────────────────────────────

describe('lessonDepth flag module', () => {
  it('defaults to DEEP (the v0.15.3 flip) with explicit flat as the opt-out', () => {
    // THE FLIP PIN — cashed June 12, 2026 on the first valid aggregate trial
    // (scripts/depthSliceAb.mjs: 8 pairs, deep 3W-0L-5T, structural 99/A and
    // texture held on every twin). If this fails because the default moved,
    // that is a deliberate un-flip and needs its own evidence trail.
    expect(readLessonDepthMode()).toBe('deep');
  });

  it('applyLessonDepthToConfigMap injects immutably and rides only lessonPlans', () => {
    const original = { quizBank: { count: 8 }, lessonPlans: { tone: 'warm' } };
    const injected = applyLessonDepthToConfigMap(original, 'deep');
    expect(injected.lessonPlans).toEqual({ tone: 'warm', depth: 'deep' });
    expect(injected.quizBank).toBe(original.quizBank);
    expect(original.lessonPlans).toEqual({ tone: 'warm' });
  });
});
