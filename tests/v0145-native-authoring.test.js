/**
 * v0.14.5 WS-B — native graph authoring (Pass A/B), the V0.13 deferred
 * contract, flag-gated end to end (B1–B4).
 *
 * Offline proof for:
 *  - B1: the Pass A skeleton prompt contract (json_object rule, verbatim
 *    traceability) + the defensive parser with the degraded-plan guard
 *    (malformed skeleton → typed NativeAuthoringError, never silent).
 *  - B2: the Pass B prompt riding the EXISTING kernel contract (linter
 *    reuse, out-of-chunk id rejection, content-sourced/genome lessons never
 *    displaced).
 *  - Assembly: skeleton + Pass B → a schema-valid CourseGraph through the
 *    prose path's own derive (walk test, registry kinds via the derive-time
 *    classifier, render→derive round-trip stability, authoredBy marker).
 *  - B4: the matchEntityIds stable-id matrix.
 *  - Budget: the nativeSkeletonCalls counter + the constructor-whitelist
 *    trap (a trailing event must not drop the field), and the
 *    nativeAuthoringFellBack pipeline line.
 *  - B3: the flag channel and the Crucible pairing/delta helpers
 *    (--authoring prose|native|both).
 *
 * The side-by-side LIVE proof is the release round's job — this file makes
 * the wiring sound without a browser or spend.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';

import { applyApiCallBudgetEvent, createApiCallBudget, getApiCallBudgetTotal } from '../src/lib/apiCallBudget';
import { deriveCourseGraphFromCourseMap } from '../src/lib/courseGraph/deriveFromCourseMap.js';
import { renderCourseMapFromGraph } from '../src/lib/courseGraph/renderCourseMap.js';
import { validateCourseGraph } from '../src/lib/courseGraph/schema.js';
import { buildBlueprintFromGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import {
  BLUEPRINT_COMPILE_CONTEXT,
  compactBlueprintForStorage,
  compileBlueprintDeliverables,
} from '../src/lib/courseBlueprintCompiler';
import { repairNativeFallbackWithCurriculumV1 } from '../src/lib/curriculumV1Repair';
import { assessProjectedKernelCoverage } from '../src/lib/blueprintEnrichmentPass';
import {
  AUTHORING_MODE_STORAGE_KEY,
  NativeAuthoringError,
  assembleNativeCourseGraph,
  briefNamesResources,
  buildNativePassBPrompt,
  buildNativeWireMap,
  completeNativeKernelSurfaces,
  completeNativeLessonSurfaces,
  isDegenerateNativeGraph,
  isNativeContentSourcedKernel,
  matchEntityIds,
  parseNativePassBResponse,
  parseNativeSkeletonResponse,
  recoverExplicitRecurringAssessmentCadences,
  recoverExplicitNamedReadings,
  pickNativeKernel,
  readAuthoringMode,
  recoverTruncatedSkeletonObject,
  recoverMissingSkeletonResources,
  resolveNativeAssembly,
  saveAuthoringMode,
  stashNativeSkeleton,
  takeNativeSkeleton,
} from '../src/lib/nativeGraphAuthoring';
import {
  NATIVE_PASS_B_AUTHORING_ADDITION,
  NATIVE_SKELETON_SYSTEM_PROMPT,
  buildNativeSkeletonUserPrompt,
} from '../src/lib/prompts';
import {
  AUTHORING_COST_CUT_TARGET,
  AUTHORING_SCORE_TOLERANCE,
  authoringEntryStats,
  buildAuthoringComparison,
  expandCoursesForAuthoring,
  kernelCoverageFromDigest,
  pairAuthoringEntries,
  parseAuthoringFlag,
  renderAuthoringSection,
} from '../scripts/lib/crucibleRound.mjs';

// ── Fixtures ────────────────────────────────────────────────────────────────

const SKELETON_RESPONSE = JSON.stringify({
  course: {
    name: 'Physical Geology',
    term: 'FA26',
    goals: ['Reason from rock and mineral evidence', 'Connect plate tectonics to surface processes'],
  },
  sessions: [
    {
      id: 's1',
      order: 1,
      title: 'Introduction and Earth Systems',
      sectionTitles: ['Earth as a System', 'Geologic Inquiry'],
    },
    { id: 's2', order: 2, title: 'Minerals and Identification', sectionTitles: ['Mineral Properties'] },
    {
      id: 's3',
      order: 3,
      title: 'Igneous Rocks and Volcanism',
      sectionTitles: ['Magma Formation', 'Volcanic Hazards'],
    },
  ],
  assessments: [
    { id: 'a1', title: 'Mineral ID Lab Report', kind: 'graded-artifact', dueSession: 2, weightPct: 20 },
    { id: 'a2', title: 'Midterm Exam', kind: 'exam', dueSession: 3 },
    { id: 'a3', title: 'Field Sketch Warm-up', kind: 'bogus-kind', dueSession: 99 },
  ],
  readings: [{ id: 'r1', title: 'OpenStax Ch. 4: Igneous Rocks', dueSession: 3 }],
  // v0.14.7 WS-B1: per-session supporting materials. The second entry tests
  // id defaulting (m2) and dueSession clamping (99 → 3).
  resources: [
    { id: 'm1', title: 'Mineral ID lab worksheet', dueSession: 2 },
    { title: 'Volcanic hazards case packet', dueSession: 99 },
  ],
});

function parsedSkeleton() {
  return parseNativeSkeletonResponse(SKELETON_RESPONSE);
}

const VALID_KEY_TERM = {
  term: 'Plate tectonics',
  definition:
    'A unifying framework holding that the lithosphere is divided into rigid plates that move slowly over the asthenosphere.',
  example: 'The Pacific Plate sliding past North America along the San Andreas Fault.',
  misconception: 'Continents plow through stationary ocean floor on their own.',
  correction: 'Plates carry both continental and oceanic lithosphere, moving together as single rigid units.',
};

const PASS_B_AUTHORING = {
  goal: 'Reason about earth systems from physical evidence',
  outcomes: ['Analyze the rock cycle as a set of linked processes', 'Evaluate mineral identification evidence'],
  async: ['Read: assigned chapter on earth systems', 'Complete: rock cycle diagram worksheet'],
  sync: ['Discussion: where does the rock cycle start?', 'Lab: hand-specimen stations'],
};

function passBResponse() {
  return JSON.stringify({
    lessons: [
      {
        lessonId: 'lesson-1',
        facts: ['The rock cycle links igneous, sedimentary, and metamorphic processes through time.'],
        keyTerms: [VALID_KEY_TERM, { term: 'Magma', definition: 'too short' }],
        mc: [],
        ...PASS_B_AUTHORING,
      },
      {
        lessonId: 'lesson-2',
        // Content-sourced lesson: kernel atoms returned anyway (the model
        // misbehaving) MUST be dropped — the genome is never displaced.
        keyTerms: [VALID_KEY_TERM],
        goal: 'Identify minerals from physical properties',
        outcomes: ['Classify minerals using hardness, streak, and luster'],
        async: ['Watch: mineral identification demo'],
        sync: ['Lab: Mohs hardness practice'],
      },
      {
        lessonId: 'lesson-9', // out of chunk — the v0.14.1 guard
        keyTerms: [VALID_KEY_TERM],
        outcomes: ['Should never be accepted'],
      },
    ],
  });
}

// ── B3: the flag channel ────────────────────────────────────────────────────

describe('authoring-mode flag (B3)', () => {
  afterEach(() => {
    delete globalThis.localStorage;
  });

  // v0.15.1 F1 — THE FLIP: native is the default; prose is the explicit
  // opt-out. Evidence: day-1 bar met (v0.14.7), day-2 mandarin failure
  // root-caused + fixed + validated, then all three courses 100/A · 0 P1 ·
  // −35% cost · ~2× faster (round-2026-06-12T22-27-07-743Z).
  it('defaults to NATIVE when localStorage is unavailable or unset', () => {
    expect(readAuthoringMode()).toBe('native');
    const store = new Map();
    globalThis.localStorage = {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    };
    expect(readAuthoringMode()).toBe('native');
  });

  it('reads prose only for the exact opt-out value, and save round-trips', () => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    };
    saveAuthoringMode('prose');
    expect(store.get(AUTHORING_MODE_STORAGE_KEY)).toBe('prose');
    expect(readAuthoringMode()).toBe('prose');
    store.set(AUTHORING_MODE_STORAGE_KEY, 'bogus');
    expect(readAuthoringMode()).toBe('native');
    saveAuthoringMode('native'); // the default clears the key
    expect(store.has(AUTHORING_MODE_STORAGE_KEY)).toBe(false);
  });
});

// ── B1: Pass A prompt + parser ──────────────────────────────────────────────

describe('Pass A skeleton contract (B1)', () => {
  it('user prompt contains the word JSON (the v0.13.1 json_object rule)', () => {
    const prompt = buildNativeSkeletonUserPrompt('Week 1: rocks. Week 2: minerals.', {
      expectedLessons: 2,
      confidence: 'high',
    });
    expect(prompt).toMatch(/JSON/);
    expect(prompt).toContain('exactly 2 sessions');
  });

  it('system prompt carries the verbatim traceability rules', () => {
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/VERBATIM/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/never invent/i);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/"sessions"/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/conceptual spine/i);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/Never use delivery modes/i);
  });

  it('parses a well-formed skeleton: ids, order, clamped dueSession, kind validation', () => {
    const skeleton = parsedSkeleton();
    expect(skeleton.course.name).toBe('Physical Geology');
    expect(skeleton.sessions.map((session) => session.id)).toEqual(['s1', 's2', 's3']);
    expect(skeleton.sessions.map((session) => session.order)).toEqual([1, 2, 3]);
    expect(skeleton.assessments).toHaveLength(3);
    expect(skeleton.assessments[0]).toMatchObject({
      title: 'Mineral ID Lab Report',
      kind: 'graded-artifact',
      weightPct: 20,
    });
    // Unknown kind dropped (the derive-time classifier decides); dueSession 99 clamped.
    expect(skeleton.assessments[2].kind).toBeUndefined();
    expect(skeleton.assessments[2].dueSession).toBe(3);
    expect(skeleton.readings[0]).toMatchObject({ title: 'OpenStax Ch. 4: Igneous Rocks', dueSession: 3 });
  });

  it('rejects copied schema-example titles and recovers a source-named bare midterm', () => {
    const sourceText =
      'Introduction to Astronomy, a 3-lesson course covering diurnal motion, seasons and axial tilt, and phases of the Moon, with a midterm.';
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'Introduction to Astronomy' },
        sessions: [
          { order: 1, title: 'Diurnal Motion Mechanics' },
          { order: 2, title: 'Axial Tilt Effects' },
          { order: 3, title: 'Lunar Phase Cycles' },
        ],
        assessments: [
          {
            id: 'a1',
            title: 'Assessment title VERBATIM as named in the source',
            kind: 'graded-artifact',
            dueSession: 3,
            weightPct: 100,
          },
        ],
        readings: [{ id: 'r1', title: 'Reading/work title VERBATIM as named in the source', dueSession: 3 }],
        resources: [
          {
            id: 'm1',
            title: 'Supporting material/resource title VERBATIM as named in the source',
            dueSession: 3,
          },
        ],
      }),
      { expectedLessons: 3, sourceText },
    );

    expect(skeleton.assessments).toEqual([expect.objectContaining({ title: 'midterm', kind: 'exam', dueSession: 2 })]);
    expect(skeleton.readings).toEqual([]);
    expect(skeleton.resources).toEqual([]);
    expect(JSON.stringify(skeleton)).not.toMatch(/VERBATIM|as named in the source/i);
  });

  it('lets one source-named midterm own both identity and placement over a model-expanded duplicate', () => {
    const sourceText =
      'Introduction to Astronomy, a 3-lesson course covering diurnal motion, seasons and axial tilt, and phases of the Moon, with evening observing sessions and a midterm.';
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'Introduction to Astronomy' },
        sessions: [
          { order: 1, title: 'Diurnal Motion Mechanics' },
          { order: 2, title: 'Seasons and Axial Tilt' },
          { order: 3, title: 'Phases of the Moon' },
        ],
        assessments: [
          {
            id: 'a1',
            title: 'Midterm Assessment (50%)',
            kind: 'exam',
            dueSession: 3,
            weightPct: 50,
          },
        ],
      }),
      { expectedLessons: 3, sourceText },
    );

    expect(skeleton.assessments).toEqual([expect.objectContaining({ title: 'midterm', kind: 'exam', dueSession: 2 })]);
  });

  it('rejects model-invented grading percentages when the source names artifacts but no weights', () => {
    const sourceText =
      'Build an 8-week World Literature Survey. Use weekly passage annotations, two comparative reading responses, a comparative essay proposal, and a final comparative paper.';
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'World Literature Survey' },
        sessions: [
          'Gilgamesh',
          'The Odyssey',
          'Antigone',
          'Li Bai and Du Fu',
          'The Thousand and One Nights',
          'Dante’s Inferno',
          'Things Fall Apart',
          'Borges',
        ].map((title, index) => ({ order: index + 1, title })),
        assessments: [
          {
            id: 'a1',
            title: 'Comparative Reading Responses (15%)',
            kind: 'graded-artifact',
            dueSession: 2,
            weightPct: 15,
          },
          {
            id: 'a2',
            title: 'Comparative Essay Proposal (20%)',
            kind: 'graded-artifact',
            dueSession: 3,
            weightPct: 20,
          },
          {
            id: 'a3',
            title: 'Final Comparative Paper (25%)',
            kind: 'graded-artifact',
            dueSession: 8,
            weightPct: 25,
          },
        ],
      }),
      { expectedLessons: 8, sourceText },
    );

    expect(skeleton.assessments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Comparative Reading Responses' }),
        expect.objectContaining({ title: 'Comparative Essay Proposal' }),
        expect.objectContaining({ title: 'Final Comparative Paper' }),
      ]),
    );
    expect(JSON.stringify(skeleton.assessments)).not.toMatch(/15%|20%|25%|weightPct/);
  });

  it('recovers an explicitly named close-reading sequence as the lesson-local reading registry', () => {
    const sourceText =
      'Build an 8-week survey. Include close reading of The Epic of Gilgamesh, The Odyssey, Antigone, selected poems by Li Bai and Du Fu, The Thousand and One Nights, Dante’s Inferno, Things Fall Apart, and Borges’s “The Library of Babel.”';
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'World Literature Survey' },
        sessions: [
          'Narrative Structure: Gilgamesh',
          'Narrative Structure: The Odyssey',
          'Narrative Structure: Antigone',
          'Poetry: Li Bai and Du Fu',
          'Narrative Structure: The Thousand and One Nights',
          'Narrative Structure: Dante’s Inferno',
          'Narrative Structure: Things Fall Apart',
          "Narrative Structure: Borges's Library",
        ].map((title, index) => ({ order: index + 1, title })),
      }),
      { expectedLessons: 8, sourceText },
    );

    expect(skeleton.readings).toEqual([
      { id: 'r1', title: 'The Epic of Gilgamesh', dueSession: 1 },
      { id: 'r2', title: 'The Odyssey', dueSession: 2 },
      { id: 'r3', title: 'Antigone', dueSession: 3 },
      { id: 'r4', title: 'selected poems by Li Bai and Du Fu', dueSession: 4 },
      { id: 'r5', title: 'The Thousand and One Nights', dueSession: 5 },
      { id: 'r6', title: 'Dante’s Inferno', dueSession: 6 },
      { id: 'r7', title: 'Things Fall Apart', dueSession: 7 },
      { id: 'r8', title: 'The Library of Babel', dueSession: 8 },
    ]);
    expect(skeleton.readingTopicRecovery).toMatchObject({
      kind: 'instructor-named-reading-topic-boundary',
      recoveredCount: 8,
    });
  });

  it('drops model-invented reading and resource titles when the source names neither', () => {
    const sourceText =
      'Introduction to Astronomy, a 3-lesson course covering diurnal motion, seasons and axial tilt, and phases of the Moon, with evening observing sessions and a midterm.';
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'Introduction to Astronomy' },
        sessions: [
          { order: 1, title: 'Diurnal Motion Mechanics' },
          { order: 2, title: 'Seasons and Axial Tilt' },
          { order: 3, title: 'Phases of the Moon' },
        ],
        readings: [
          {
            title: "Compare two examples of Earth's Rotation Vector and explain which evidence is stronger.",
            dueSession: 1,
          },
        ],
        resources: [{ title: 'Generic activity worksheet', dueSession: 1 }],
      }),
      { expectedLessons: 3, sourceText },
    );

    expect(skeleton.readings).toEqual([]);
    expect(skeleton.resources).toEqual([]);
  });

  it('drops modality-only section titles before they become course-map topics', () => {
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'Introduction to Psychology', term: 'FA26' },
        sessions: [
          { order: 1, title: 'Learning', sectionTitles: ['learning', 'lecture', 'lab'] },
          { order: 2, title: 'Memory', sectionTitles: ['Lecture/Lab'] },
        ],
      }),
    );

    expect(skeleton.sessions[0].sectionTitles).toEqual(['learning']);
    expect(skeleton.sessions[1].sectionTitles).toEqual([]);

    const wireMap = buildNativeWireMap(skeleton);
    expect(wireMap.lessons[0].sections.map((section) => section.topicSection)).toEqual(['1.1: learning']);
    expect(wireMap.lessons[1].sections.map((section) => section.topicSection)).toEqual(['2.1: Memory']);
    expect(JSON.stringify(wireMap)).not.toMatch(/\b(?:lecture|lab)\b/i);
  });

  it('presents a recovered character-writing assessment as a polished title', () => {
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'Elementary Mandarin Chinese I' },
        sessions: [{ order: 1, title: 'Pinyin and Tones' }],
        assessments: [
          {
            title: 'character writing homework: Pinyin and Tones',
            kind: 'graded-artifact',
            dueSession: 1,
          },
        ],
      }),
    );

    const wireMap = buildNativeWireMap(skeleton);
    expect(wireMap.lessons[0].sections[0].weeklyAssessments).toEqual(['Character Writing Homework: Pinyin and Tones']);
  });

  it('re-normalizes duplicate/gapped session orders to 1..N', () => {
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        sessions: [
          { order: 7, title: 'Later topic' },
          { order: 7, title: 'Earlier duplicate order' },
          { title: 'No order at all' },
        ],
        course: { name: 'X' },
      }),
    );
    expect(skeleton.sessions.map((session) => session.order)).toEqual([1, 2, 3]);
    expect(skeleton.sessions.map((session) => session.id)).toEqual(['s1', 's2', 's3']);
  });

  it('restores an explicit source lesson sequence when Pass A repeats a capstone title', () => {
    const sourceText =
      'Human Nutrition, a 14-lesson course. Lessons cover: the six classes of nutrients; carbohydrates, simple and complex; dietary fiber, soluble and insoluble; proteins and amino acids; lipids including saturated, unsaturated, and trans fats; fat-soluble and water-soluble vitamins; major minerals and electrolytes; water and hydration; digestion and absorption in the GI tract; energy balance and metabolism; healthy eating patterns and MyPlate; reading a Nutrition Facts label and percent daily value; a review of nutrient functions; and a final diet-analysis project.';
    const modelTitles = [
      'Nutrient classes',
      'Carbohydrates',
      'Proteins',
      'Lipids',
      'Minerals and water',
      'Digestion',
      'Energy balance',
      'Healthy eating',
      'Label reading',
      'Nutrient review',
      'Final project',
      'Midterm review',
      'Final project',
      'Final project',
    ];
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'Human Nutrition', term: 'FA26' },
        sessions: modelTitles.map((title, index) => ({
          id: `s${index + 1}`,
          order: index + 1,
          title,
          sectionTitles: [title],
        })),
      }),
      { expectedLessons: 14, sourceText },
    );

    expect(skeleton.sessions[2].title).toBe('dietary fiber, soluble and insoluble');
    expect(skeleton.sessions[5].title).toBe('fat-soluble and water-soluble vitamins');
    expect(skeleton.sessions[12].title).toBe('review of nutrient functions');
    expect(skeleton.sessions[13].title).toBe('final diet-analysis project');
    expect(skeleton.sessions.filter((session) => /final project/i.test(session.title))).toHaveLength(0);
    expect(skeleton.sessionSequenceRecovery).toMatchObject({
      kind: 'explicit-source-lesson-sequence',
      recoveredCount: 14,
      reason: 'repeated-titles',
      authoredTitles: expect.arrayContaining(['Final project']),
    });
  });

  it('keeps an exact source sequence authoritative when a model title looks aligned but its section is noisy', () => {
    const sourceText =
      'Elementary Mandarin Chinese I, a 2-lesson course. Lessons cover: Pinyin and Tones; and Greetings and Self-Introductions.';
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'Elementary Mandarin Chinese I' },
        sessions: [
          {
            order: 1,
            title: 'Pinyin and Tones',
            sectionTitles: ['Invasive Pinyin System', 'Four Tones Mechanism'],
          },
          {
            order: 2,
            title: 'Greetings and Self-Introductions',
            sectionTitles: ['Basic Salutations', 'Self-Introduction Formula'],
          },
        ],
      }),
      { expectedLessons: 2, sourceText },
    );

    expect(skeleton.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Pinyin and Tones',
          sectionTitles: ['Pinyin and Tones'],
        }),
        expect.objectContaining({
          title: 'Greetings and Self-Introductions',
          sectionTitles: ['Greetings and Self-Introductions'],
        }),
      ]),
    );
    expect(JSON.stringify(skeleton)).not.toMatch(/Invasive Pinyin System|Four Tones Mechanism/i);
    expect(skeleton.sessionSequenceRecovery).toMatchObject({
      kind: 'explicit-source-lesson-sequence',
      reason: 'source-authored-sequence',
    });
  });

  it('promotes distinct authored subtopics when a compact brief produces repeated titles and assessment filler', () => {
    const sourceText =
      'Introduction to Genetics, a 15-lesson undergraduate biology course with problem sets, a model-organism lab, two midterms, and a final. Covers Mendelian inheritance, meiosis, linkage and gene mapping, the molecular structure of DNA, gene expression, mutation, population genetics, epigenetics, and modern genetic technologies.';
    const titles = [
      'Mendelian inheritance',
      'Meiosis',
      'Linkage and mapping',
      'Molecular DNA structure',
      'Gene expression',
      'Mutation',
      'Population genetics',
      'Epigenetics',
      'Modern genetic technologies',
      'Mendelian inheritance',
      'Meiosis',
      'Linkage and mapping',
      'Molecular DNA structure',
      'Gene expression',
      'Final assessment',
    ];
    const sectionTitles = [
      ['Dominant and recessive alleles'],
      ['Gamete formation'],
      ['Recombination frequency'],
      ['Nucleotide sequence'],
      ['Translation mechanisms'],
      ['Mutational spectrum'],
      ['Hardy-Weinberg equilibrium'],
      ['DNA methylation'],
      ['Genome editing'],
      ['Review of complex traits', 'Application of Mendelian principles'],
      ['Advanced meiotic disorders', 'Cytogenetic analysis'],
      ['Advanced mapping problems', 'Population genetics review'],
      ['Molecular genetics applications', 'Structure-function relationship'],
      ['Regulatory elements', 'Systems biology overview'],
      ['Comprehensive final review', 'Final synthesis'],
    ];
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'Introduction to Genetics', term: 'TBD' },
        sessions: titles.map((title, index) => ({
          id: `s${index + 1}`,
          order: index + 1,
          title,
          sectionTitles: sectionTitles[index],
        })),
      }),
      { expectedLessons: 15, sourceText },
    );

    expect(skeleton.sessions.map((session) => session.title)).toEqual([
      ...titles.slice(0, 9),
      'complex traits',
      'meiotic disorders',
      'mapping problems',
      'Molecular genetics applications',
      'Regulatory elements',
      'Model-Organism Genetics Investigation',
    ]);
    expect(new Set(skeleton.sessions.map((session) => session.title.toLowerCase())).size).toBe(15);
    expect(skeleton.sessions.map((session) => session.title).join(' ')).not.toMatch(/final assessment/i);
    expect(skeleton.sessionSequenceRecovery).toMatchObject({
      kind: 'model-authored-distinct-subtopics',
      recoveredCount: 6,
      reason: 'repeated-titles',
    });
  });

  it('replaces compact-brief midterm reviews and repeated generic evaluations with teachable topic sessions', () => {
    const sourceText =
      'Introduction to Genetics, a 15-lesson undergraduate biology course with two midterms, a final, and a model-organism lab. Covers Mendelian inheritance, meiosis, linkage and mapping, DNA structure, gene expression, mutation, population genetics, epigenetics, and modern genetic technologies.';
    const baseTopics = [
      'Mendelian inheritance',
      'Meiosis',
      'Linkage and mapping',
      'DNA structure',
      'Gene expression',
      'Mutation',
      'Population genetics',
      'Epigenetics',
      'Modern genetic technologies',
    ];
    const sessions = [
      ...baseTopics.map((title, index) => ({ order: index + 1, title, sectionTitles: [title] })),
      {
        order: 10,
        title: 'Midterm 1 Review',
        sectionTitles: ['Review of inheritance', 'Review of molecular structure'],
      },
      {
        order: 11,
        title: 'Midterm 2 Review',
        sectionTitles: ['Review of meiosis and mapping', 'Review of gene expression'],
      },
      { order: 12, title: 'Model-organism lab', sectionTitles: ['Practical investigation'] },
      ...[13, 14, 15].map((order) => ({
        order,
        title: 'Comprehensive course evaluation',
        sectionTitles: ['Comprehensive course evaluation'],
      })),
    ];
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({ course: { name: 'Introduction to Genetics' }, sessions }),
      { expectedLessons: 15, sourceText },
    );

    expect(skeleton.sessions.slice(9).map((session) => session.title)).toEqual([
      'inheritance and molecular structure',
      'meiosis and mapping',
      'Model-organism lab',
      'gene expression: mechanisms and evidence',
      'mutation: methods and applications',
      'population genetics: interpretation and limitations',
    ]);
    expect(skeleton.sessions.slice(12).flatMap((session) => session.sectionTitles)).not.toContain(
      'Comprehensive course evaluation',
    );
  });

  it('promotes unused model-authored subtopics before using generic compact-brief deepening titles', () => {
    const sourceText =
      'Introduction to Genetics, a 15-lesson undergraduate biology course with problem sets, a model-organism lab, two midterms, and a final. Covers Mendelian inheritance, meiosis, linkage and mapping, DNA structure, gene expression, mutation, population genetics, epigenetics, and modern genetic technologies.';
    const authoredTopics = [
      ['Mendelian inheritance', ['Dominance patterns', 'Punnett square analysis']],
      ['Meiosis', ['Chromosome segregation', 'Recombination mechanisms']],
      ['Linkage and mapping', ['Recombination frequency', 'Gene mapping techniques']],
      ['DNA structure', ['Nucleotide structure', 'DNA replication']],
      ['Gene expression', ['Transcription regulation', 'Protein synthesis']],
      ['Mutation', ['DNA repair', 'Mutational effects']],
      ['Population genetics', ['Allele frequencies', 'Genetic drift']],
      ['Epigenetics', ['DNA methylation', 'Chromatin remodeling']],
      ['Modern genetic technologies', ['Genome editing', 'Sequencing methods']],
    ];
    const sessions = [
      ...authoredTopics.map(([title, sectionTitles], index) => ({
        order: index + 1,
        title,
        sectionTitles,
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        order: index + 10,
        title: index === 5 ? 'Comprehensive' : `Assessment ${index + 1}`,
        sectionTitles: ['Review'],
      })),
    ];

    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({ course: { name: 'Introduction to Genetics' }, sessions }),
      { expectedLessons: 15, sourceText },
    );

    expect(skeleton.sessions.slice(9).map((session) => session.title)).toEqual([
      'Model-Organism Genetics Investigation',
      'Dominance patterns',
      'Punnett square analysis',
      'Chromosome segregation',
      'Recombination mechanisms',
      'Recombination frequency',
    ]);
    expect(skeleton.sessions[0].sectionTitles).toEqual(['Mendelian inheritance']);
    expect(skeleton.sessions[1].sectionTitles).toEqual(['Meiosis']);
    expect(skeleton.sessions.map((session) => session.title).join(' ')).not.toMatch(
      /(?:synthesis|comprehensive|review|assessment)/i,
    );
  });

  it('restores omitted and shifted explicit topics even when every authored title is unique', () => {
    const sourceText =
      'Introduction to Astronomy, a 12-lesson course. Lessons cover: diurnal motion and the apparent daily motion of the sky; the celestial sphere and celestial coordinates; the seasons and axial tilt with solstice and equinox; phases of the Moon; Kepler’s third law and the laws of planetary motion; the electromagnetic spectrum and wavelengths of light; spectral lines, absorption and emission spectra of stars; telescope light-gathering power and aperture; stellar parallax and celestial distances measured in parsecs; apparent magnitude and the brightness of stars; the solar nebula hypothesis and the formation of the solar system; and Hubble’s law and the expanding universe with a course review.';
    const modelTitles = [
      'Diurnal motion',
      'Celestial coordinates',
      'Seasons and tilt',
      'Moon phases',
      'Planetary motion',
      'Electromagnetic spectrum',
      'Stellar spectra',
      'Stellar brightness',
      'Solar system formation',
      'Hubble’s law',
      'Course review',
      'Midterm exam',
    ];
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'Introduction to Astronomy', term: 'FA26' },
        sessions: modelTitles.map((title, index) => ({
          id: `s${index + 1}`,
          order: index + 1,
          title,
          sectionTitles: [title],
        })),
      }),
      { expectedLessons: 12, sourceText },
    );

    expect(skeleton.sessions[7].title).toBe('telescope light-gathering power and aperture');
    expect(skeleton.sessions[8].title).toBe('stellar parallax and celestial distances measured in parsecs');
    expect(skeleton.sessions[11].title).toBe('Hubble’s law and the expanding universe with a course review');
    expect(skeleton.sessionSequenceRecovery).toMatchObject({
      kind: 'explicit-source-lesson-sequence',
      reason: 'ordered-topic-misalignment',
      misalignedOrders: [8, 9, 10, 11, 12],
    });
  });

  it('fills the cited Mandarin review bridge when fifteen lessons name fourteen ordered topics', () => {
    const sourceText =
      'Elementary Mandarin Chinese I, a 15-lesson college language course. Lessons cover: the pinyin system and the four tones; greetings and self-introductions; classroom language; numbers, age, and dates; family members and possession with 的; daily routines and telling time; core SVO sentence patterns with 不, 没, and 吗; basic characters and short reading passages; food and dining; shopping and money; weather and clothing; transportation and directions; health and feelings; and a course review leading to a final oral performance.';
    const authoredTitles = [
      'Pinyin and Tones',
      'Phonetic System',
      'Greetings and Self-Introductions',
      'Social Etiquette',
      'Classroom Language',
      'Academic Discourse',
      'Numbers, Age, and Dates',
      'Numerals and Time',
      'Family and Possession with',
      'Possession Structures',
      'Daily Routines and Telling Time',
      'Temporal Expressions',
      'Core SVO Patterns: 不 and',
      'Negation Structures',
      'Core SVO Patterns',
    ];
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'Elementary Mandarin Chinese I' },
        sessions: authoredTitles.map((title, index) => ({
          order: index + 1,
          title,
          sectionTitles: [title],
        })),
      }),
      { expectedLessons: 15, sourceText },
    );

    expect(skeleton.sessions.map((session) => session.title)).toEqual([
      'Pinyin and Tones',
      'Greetings and Self-Introductions',
      'Classroom Expressions',
      'Numbers, Dates, and Age',
      'Family and Possession',
      'Daily Routines and Time',
      'Sentence Patterns and Negation',
      'Vocabulary and Grammar Review',
      'Basic Characters and Reading',
      'Food and Dining',
      'Shopping and Money',
      'Weather and Clothing',
      'Transportation and Directions',
      'Health and Feelings',
      'Course Review and Oral Performance',
    ]);
    expect(skeleton.sessionSequenceRecovery).toMatchObject({
      kind: 'explicit-source-lesson-sequence',
      recoveredCount: 15,
      reason: 'ordered-topic-misalignment',
      misalignedOrders: expect.arrayContaining([2, 3, 8, 15]),
    });
  });

  it('restores the exact “with these lessons” sequence before Pass B authors content', () => {
    const sourceText =
      'Create a 6-week college World Literature course with these lessons: World Literature Scope; Oral Epic Tradition using Gilgamesh; Homeric Epic using The Odyssey; Classical Drama using Antigone; Tang Poetry using selected poems by Li Bai and Du Fu; and Frame Narratives using The Thousand and One Nights. Focus on textual analysis.';
    const repeated = [
      'World Literature Scope',
      'Oral Epic Tradition',
      'Homeric Epic and Classical Drama',
      'World Literature Scope',
      'Oral Epic Tradition',
      'Homeric Epic and Classical Drama',
    ];
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'World Literature', term: 'TBD' },
        sessions: repeated.map((title, index) => ({
          id: `s${index + 1}`,
          order: index + 1,
          title,
          sectionTitles: [title],
        })),
      }),
      { expectedLessons: 6, sourceText },
    );

    expect(skeleton.sessions.map((session) => session.title)).toEqual([
      'World Literature Scope',
      'Oral Epic Tradition using Gilgamesh',
      'Homeric Epic using The Odyssey',
      'Classical Drama using Antigone',
      'Tang Poetry using selected poems by Li Bai and Du Fu',
      'Frame Narratives using The Thousand and One Nights',
    ]);
    expect(skeleton.sessionSequenceRecovery).toMatchObject({
      kind: 'explicit-source-lesson-sequence',
      recoveredCount: 6,
      reason: 'ordered-topic-misalignment',
    });
  });

  it('restores an explicit instructor reading list when Pass A omits the registry', () => {
    const sourceText =
      'World Literature, a 14-lesson seminar. Required readings as named on the syllabus: Week 2 reads Gilgamesh; Week 3 reads The Odyssey; Week 4 reads Antigone; Week 5 reads selected poems of Li Bai and Du Fu; Week 6 reads The Thousand and One Nights; Week 7 reads Inferno; Week 9 reads Things Fall Apart; Week 10 reads One Hundred Years of Solitude; Week 11 reads The Waste Land; Week 12 reads The Library of Babel.';
    const parsed = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'World Literature' },
        sessions: Array.from({ length: 14 }, (_, index) => ({
          order: index + 1,
          title: `Literature topic ${index + 1}`,
        })),
      }),
      { expectedLessons: 14, sourceText },
    );

    expect(parsed.readings).toHaveLength(10);
    expect(parsed.readings).toEqual(
      expect.arrayContaining([
        { id: 'r1', title: 'Gilgamesh', dueSession: 2 },
        { id: 'r4', title: 'selected poems of Li Bai and Du Fu', dueSession: 5 },
        { id: 'r10', title: 'The Library of Babel', dueSession: 12 },
      ]),
    );
    expect(parsed.readingRecovery).toEqual({
      kind: 'explicit-source-reading-list',
      recoveredCount: 10,
    });
    expect(parsed.sessions[2].sectionTitles[0]).toBe('The Odyssey');
    expect(parsed.readingTopicRecovery).toEqual({
      kind: 'instructor-named-reading-topic-boundary',
      recoveredCount: 10,
    });
  });

  it('drops a conflicting pre-reading subtopic before the named primary-text boundary', () => {
    const sourceText = 'World Literature, a 3-lesson seminar. Required readings: Week 3 reads The Odyssey.';
    const parsed = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'World Literature' },
        sessions: [
          { order: 1, title: 'World Literature Scope' },
          { order: 2, title: 'Oral Epic Tradition' },
          {
            order: 3,
            title: 'Homeric Epic',
            sectionTitles: ['Structure of the Iliad', 'Themes in the Odyssey', 'Epic Conventions'],
          },
        ],
      }),
      { expectedLessons: 3, sourceText },
    );

    expect(parsed.sessions[2].sectionTitles).toEqual(['Themes in the Odyssey', 'Epic Conventions']);
    expect(parsed.readingTopicRecovery).toMatchObject({ recoveredCount: 1 });
  });

  it('refuses to infer reading titles from unlabeled prose or a malformed explicit list', () => {
    expect(recoverExplicitNamedReadings('Weekly reading passages support discussion.', 14)).toEqual([]);
    expect(
      recoverExplicitNamedReadings(
        'Required readings: Week 2 reads Gilgamesh; a later text may be selected by the instructor.',
        14,
      ),
    ).toEqual([]);
  });

  it("restores the instructor's two weekly assessment streams and named milestones when Pass A invents one generic task per lesson", () => {
    const sourceText =
      'World Literature, a 14-lesson undergraduate seminar with weekly reading responses and close-reading checks; the syllabus assigns a named primary text nearly every week and course materials must name those texts. Lessons cover: what counts as world literature; the oral epic tradition; the Homeric epic; classical drama; Tang poetry; frame narratives; the medieval journey narrative; comparative reading methods culminating in a comparative essay proposal; postcolonial literature; magical realism; modernist poetry; the fantastic and the infinite library; contemporary global fiction; and a final paper with course synthesis.';
    const titles = [
      'What Counts as World Literature',
      'The Oral Epic Tradition',
      'The Homeric Epic',
      'Classical Drama',
      'Tang Poetry',
      'Frame Narratives',
      'The Medieval Journey Narrative',
      'Comparative Reading Methods',
      'Postcolonial Literature',
      'Magical Realism',
      'Modernist Poetry',
      'The Fantastic and the Infinite Library',
      'Contemporary Global Fiction',
      'Course Synthesis',
    ];
    const parsed = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'World Literature' },
        sessions: titles.map((title, index) => ({ order: index + 1, title })),
        assessments: titles.map((title, index) => ({
          title: `${title} ${['analysis', 'application', 'comparison', 'interpretation'][index % 4]}`,
          dueSession: index + 1,
        })),
      }),
      { expectedLessons: 14, sourceText },
    );

    expect(parsed.assessments).toHaveLength(30);
    expect(parsed.assessments.filter((entry) => entry.dueSession === 1).map((entry) => entry.title)).toEqual([
      'weekly reading responses: What Counts as World Literature',
      'close-reading checks: What Counts as World Literature',
    ]);
    expect(parsed.assessments.filter((entry) => entry.dueSession === 8).map((entry) => entry.title)).toEqual([
      'weekly reading responses: Comparative Reading Methods',
      'close-reading checks: Comparative Reading Methods',
      'comparative essay proposal',
    ]);
    expect(parsed.assessments.filter((entry) => entry.dueSession === 14).map((entry) => entry.title)).toEqual([
      'weekly reading responses: Course Synthesis',
      'close-reading checks: Course Synthesis',
      'final paper',
    ]);
    expect(parsed.assessments.map((entry) => entry.title).join(' ')).not.toMatch(
      /Homeric Epic comparison|Course Synthesis application/,
    );
    expect(parsed.assessmentCadenceRecovery).toEqual({
      kind: 'explicit-source-recurring-assessment-plan',
      cadenceCount: 2,
      recoveredItemCount: 30,
      oneOffCount: 2,
      droppedUnsupportedItemCount: 14,
    });
  });

  it('does not mistake assigned weekly readings or a one-off midterm for recurring assessment streams', () => {
    expect(
      recoverExplicitRecurringAssessmentCadences(
        'A seminar with weekly readings and a midterm. Students discuss each assigned text.',
      ),
    ).toEqual([]);
    expect(recoverExplicitRecurringAssessmentCadences('A seminar with weekly quizzes and a midterm.')).toEqual([
      'weekly quizzes',
    ]);
  });

  it('synthesizes one weighted assessment per session when Pass A omits assessments', () => {
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'Introductory Physics II', term: 'FA26' },
        sessions: [
          { order: 1, title: 'Electric charge' },
          { order: 2, title: 'Electric fields' },
          { order: 3, title: "Gauss's law" },
        ],
      }),
    );

    expect(skeleton.assessments).toHaveLength(3);
    expect(skeleton.assessments.map((assessment) => assessment.dueSession)).toEqual([1, 2, 3]);
    expect(skeleton.assessments.map((assessment) => assessment.kind)).toEqual([
      'graded-artifact',
      'graded-artifact',
      'graded-artifact',
    ]);
    expect(skeleton.assessments.reduce((sum, assessment) => sum + assessment.weightPct, 0)).toBe(100);

    const wireMap = buildNativeWireMap(skeleton);
    expect(wireMap.lessons.map((lesson) => lesson.sections[0].weeklyAssessments?.[0])).toEqual([
      'Evidence explanation: Electric charge',
      'Worked example: Electric fields',
      "Course synthesis: Gauss's law",
    ]);
    expect(wireMap.lessons.map((lesson) => lesson.sections[0].weeklyAssessments?.[0]).join(' ')).not.toMatch(
      /\(\d+%\)/,
    );
  });

  it('splits fused weighted assessment lists, rejects unsupported parts, and restores the registered midterm exam', () => {
    const sourceText =
      'Human Nutrition, a 14-lesson introductory college course with weekly diet-analysis labs and a midterm. Lessons cover nutrient functions and a final diet-analysis project.';
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'Human Nutrition', term: 'FA26' },
        sessions: Array.from({ length: 14 }, (_, index) => ({
          order: index + 1,
          title: `Nutrition topic ${index + 1}`,
        })),
        assessments: [
          {
            id: 'a1',
            title: 'weekly diet-analysis labs (20%) 2. weekly autograded quizzes (10%)',
            kind: 'graded-artifact',
            dueSession: 1,
            weightPct: 20,
          },
          {
            id: 'a7',
            title: 'midterm (20%) 2. weekly reading responses (10%)',
            kind: 'graded-artifact',
            dueSession: 7,
            weightPct: 20,
          },
          {
            id: 'a14',
            title: 'final diet-analysis project (30%)',
            kind: 'graded-artifact',
            dueSession: 14,
            weightPct: 30,
          },
        ],
      }),
      { expectedLessons: 14, sourceText },
    );

    expect(skeleton.assessments).toHaveLength(16);
    expect(skeleton.assessments.slice(0, 14).map(({ title, dueSession }) => ({ title, dueSession }))).toEqual(
      Array.from({ length: 14 }, (_, index) => ({
        title: `weekly diet-analysis labs: Nutrition topic ${index + 1}`,
        dueSession: index + 1,
      })),
    );
    expect(
      skeleton.assessments.slice(14).map(({ title, kind, dueSession, weightPct }) => ({
        title,
        kind,
        dueSession,
        weightPct,
      })),
    ).toEqual([
      { title: 'midterm', kind: 'exam', dueSession: 7, weightPct: undefined },
      { title: 'final diet-analysis project', kind: 'graded-artifact', dueSession: 14, weightPct: undefined },
    ]);
    expect(skeleton.assessmentListRecovery).toEqual({
      fusedEntryCount: 2,
      recoveredItemCount: 2,
      unsupportedItemCount: 2,
    });

    const graph = deriveCourseGraphFromCourseMap(buildNativeWireMap(skeleton));
    expect(graph.assessments).toHaveLength(16);
    expect(graph.assessments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'weekly diet-analysis labs: Nutrition topic 1', dueSession: 1 }),
        expect.objectContaining({ title: 'midterm', kind: 'exam', dueSession: 7 }),
        expect.objectContaining({
          title: 'final diet-analysis project',
          kind: 'graded-artifact',
          dueSession: 14,
        }),
      ]),
    );
    const compiled = compileBlueprintDeliverables(buildBlueprintFromGraph(graph), ['quizBank'], {
      enforceCompilerContract: false,
    });
    const exams = (compiled.quizBank.quizzes || []).filter((entry) => entry.kind === 'exam');
    expect(exams).toHaveLength(1);
    expect(exams[0].lessonTitle).toContain('midterm');
    expect(exams[0].questions.length).toBeGreaterThanOrEqual(5);
  });

  it('does not split an ordinary numbered project phase that is not a weighted list', () => {
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'Design Studio', term: 'FA26' },
        sessions: [{ order: 1, title: 'Capstone delivery' }],
        assessments: [
          {
            id: 'a1',
            title: 'Final project phase 2. Analysis and handoff (30%)',
            kind: 'graded-artifact',
            dueSession: 1,
            weightPct: 30,
          },
        ],
      }),
    );

    expect(skeleton.assessments).toHaveLength(1);
    expect(skeleton.assessments[0].title).toBe('Final project phase 2. Analysis and handoff (30%)');
    expect(skeleton.assessmentListRecovery).toBeUndefined();
  });

  it('tolerates code fences and surrounding prose', () => {
    const fenced = '```json\n' + SKELETON_RESPONSE + '\n```\nDone.';
    expect(parseNativeSkeletonResponse(fenced).sessions).toHaveLength(3);
  });

  it('recovers only complete top-level skeleton array items after a constrained-decoder early stop', () => {
    const truncated = JSON.stringify({
      course: { name: 'Business Ethics', goals: ['Analyze ethical decisions'] },
      sessions: [
        { order: 1, title: 'Ethical Frameworks' },
        { order: 2, title: 'Stakeholder Responsibility' },
      ],
      assessments: [{ title: 'Midterm', dueSession: 2, weightPct: 20 }],
    }).replace(/\]\}$/, ',');

    expect(recoverTruncatedSkeletonObject(truncated)).toMatchObject({
      course: { name: 'Business Ethics' },
      sessions: [{ title: 'Ethical Frameworks' }, { title: 'Stakeholder Responsibility' }],
      assessments: [{ title: 'Midterm' }],
    });
    const skeleton = parseNativeSkeletonResponse(truncated, { expectedLessons: 2 });
    expect(skeleton.responseRecovery).toMatchObject({
      kind: 'closed-complete-top-level-array-prefix',
      assessmentCadence: 'synthesized-per-session',
    });
    expect(skeleton.assessments).toHaveLength(2);
    expect(skeleton.assessments.reduce((sum, assessment) => sum + assessment.weightPct, 0)).toBe(100);
  });

  it('does not recover a skeleton that stops inside an unfinished array object', () => {
    const truncated =
      '{"course":{"name":"Business Ethics"},"sessions":[{"order":1,"title":"Frameworks"}],"assessments":[{"title":"Mid';
    expect(recoverTruncatedSkeletonObject(truncated)).toBeNull();
    expect(() => parseNativeSkeletonResponse(truncated)).toThrowError(NativeAuthoringError);
  });

  it('keeps a compact brief on the typed path when Gemma is one session short', () => {
    const sourceText =
      'Introduction to Genetics, a 15-lesson undergraduate biology course with problem sets, a model-organism lab, two midterms, and a final. Covers Mendelian inheritance, meiosis, linkage and mapping, DNA structure, gene expression, mutation, population genetics, epigenetics, and modern genetic technologies.';
    const sessions = Array.from({ length: 14 }, (_, index) => ({
      order: index + 1,
      title: `Genetics topic ${index + 1}`,
      sectionTitles: [`Genetics topic ${index + 1}`],
    }));
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'Introduction to Genetics, a 15-lesson undergraduate biology' },
        sessions,
        resources: [{ title: 'model-organism lab' }],
      }),
      { expectedLessons: 15, sourceText },
    );

    expect(skeleton.course.name).toBe('Introduction to Genetics');
    expect(skeleton.sessions).toHaveLength(15);
    expect(skeleton.sessions[14].title).toBe('Model-Organism Genetics Investigation');
    expect(skeleton.resources[0].dueSession).toBe(15);
    expect(skeleton.sessions.map((session) => session.title).join(' ')).not.toMatch(/Assessment 15/);
    expect(skeleton.sessionSequenceRecovery).toMatchObject({
      kind: 'model-authored-distinct-subtopics',
      countRecovered: 1,
    });
  });

  it('degraded-plan guard: malformed skeletons throw the TYPED error', () => {
    expect(() => parseNativeSkeletonResponse('total garbage')).toThrowError(NativeAuthoringError);
    try {
      parseNativeSkeletonResponse('total garbage');
    } catch (error) {
      expect(error.code).toBe('skeleton-unparseable');
    }
    expect(() => parseNativeSkeletonResponse('{"sessions": []}')).toThrowError(/no sessions/);
    expect(() => parseNativeSkeletonResponse(JSON.stringify({ sessions: [{ order: 1 }, { order: 2 }] }))).toThrowError(
      NativeAuthoringError,
    );
    try {
      parseNativeSkeletonResponse(SKELETON_RESPONSE, { expectedLessons: 14 });
    } catch (error) {
      expect(error).toBeInstanceOf(NativeAuthoringError);
      expect(error.code).toBe('skeleton-incomplete');
    }
  });
});

// ── The skeleton stash (Pass A → Pass B handoff) ────────────────────────────

describe('skeleton stash handoff', () => {
  it('is take-once and integrity-checked against the course map', () => {
    const skeleton = parsedSkeleton();
    const wireMap = buildNativeWireMap(skeleton);
    stashNativeSkeleton(skeleton);
    expect(takeNativeSkeleton({ courseName: 'A Different Course', lessons: wireMap.lessons })).toBeNull();
    stashNativeSkeleton(skeleton);
    expect(takeNativeSkeleton(wireMap)).toBe(skeleton);
    // Consumed: a second take returns nothing (regenerations use the prose path).
    expect(takeNativeSkeleton(wireMap)).toBeNull();
  });
});

// ── B2: Pass B prompt + parser ──────────────────────────────────────────────

describe('Pass B contract (B2)', () => {
  it('only exempts content with a real semantic core from kernel authoring', () => {
    const sparse = { enrichmentSource: 'own-kernel-cache', quizItems: [], keyTerms: [] };
    expect(isNativeContentSourcedKernel(sparse, null)).toBe(false);
    expect(isNativeContentSourcedKernel({ ...sparse, enrichmentSource: 'genome-linked' }, null)).toBe(false);
    expect(isNativeContentSourcedKernel({ ...sparse, enrichmentSource: 'genome-linked' }, {})).toBe(false);

    const complete = {
      quizItems: Array.from({ length: 4 }, () => ({ type: 'multiple_choice' })),
      keyTerms: [{}, {}, {}],
      slideContent: [{}, {}, {}],
      discussionPrompt: { positions: ['one', 'two', 'three'] },
      assignmentCore: { parameters: ['scope', 'format', 'evidence', 'length'] },
      kernel: { scenario: { setup: 'A concrete decision context.', materials: 'An inspectable evidence packet.' } },
      studyGuide: { summary: 'A substantive summary.', reviewStrategy: 'A specific review strategy.' },
    };
    expect(isNativeContentSourcedKernel(complete, null)).toBe(true);
    const oneFactGenome = {
      ...complete,
      keyTerms: complete.keyTerms.slice(0, 1),
      kernel: {
        ...complete.kernel,
        facts: ['我坐地铁去学校。 means I take the subway to school.'],
      },
      enrichmentSource: 'genome-linked',
    };
    expect(isNativeContentSourcedKernel(oneFactGenome, null)).toBe(false);
    const richPartial = {
      ...complete,
      quizItems: complete.quizItems.slice(0, 2),
      keyTerms: complete.keyTerms.slice(0, 1),
      slideContent: complete.slideContent.slice(0, 1),
      kernel: {
        ...complete.kernel,
        facts: ['fact one', 'fact two', 'fact three'],
      },
    };
    expect(isNativeContentSourcedKernel(richPartial, { cited: true })).toBe(true);
    expect(pickNativeKernel(complete, sparse)).toBe(complete);
    expect(pickNativeKernel(sparse, complete)).toBe(complete);
  });

  it('prefers a compact kernel that the compiler can complete over a higher-scoring unusable genome partial', () => {
    const thinGenomePartial = {
      enrichmentSource: 'genome-linked',
      quizItems: Array.from({ length: 4 }, () => ({ type: 'short_answer' })),
      keyTerms: [],
      slideContent: [{}, {}, {}],
      discussionPrompt: { positions: ['one', 'two', 'three'] },
      assignmentCore: { parameters: ['scope', 'format', 'evidence', 'length'] },
      kernel: { facts: [], scenario: { setup: 'A concrete decision context.', materials: 'Two records.' } },
      studyGuide: { summary: 'A substantive summary.', reviewStrategy: 'A specific review strategy.' },
    };
    const compactModelKernel = {
      quizItems: [{ type: 'short_answer' }, { type: 'essay' }],
      keyTerms: [
        {
          term: 'Orbital period',
          definition:
            'Orbital period distinguishes the time required to complete one revolution around a central body.',
          example: 'Two measured periods let students compare the observed revolutions.',
          misconception: 'A longer measured period always means the observed body is moving faster.',
          correction: 'The period records elapsed revolution time; speed requires a separate distance relation.',
        },
        {
          term: 'Distance relation',
          definition:
            'A distance relation connects a measured separation to another observable quantity in a defined system.',
          example: 'The recorded separation is compared with the measured orbital period.',
          misconception: 'Any two distance values establish the same relation without a shared system.',
          correction: 'The comparison is valid only when both values describe the defined orbital system.',
        },
        {
          term: 'Revolution',
          definition: 'A revolution is one completed path of an orbiting body around its central body.',
          example: 'The observation log marks one full path before recording the elapsed time.',
          misconception: 'A revolution is the same event as a body turning once on its axis.',
          correction: 'Revolution follows the orbital path; axial turning is a different motion.',
        },
      ],
      slideContent: [
        {
          title: 'Orbital period records one revolution',
          bullets: ['One path is completed', 'Elapsed time is recorded'],
        },
      ],
      kernel: {
        facts: [
          'Orbital period records the time required for one complete revolution.',
          'A revolution follows a path around a central body.',
          'Measured periods can be compared within the same orbital system.',
          'Distance and period are separate observed quantities.',
          'A defined relation connects those quantities without treating them as identical.',
        ],
        scenario: {
          setup: 'An observer compares two orbital records before choosing which relation the evidence supports.',
          materials: 'two elapsed-time records, two measured separations',
        },
      },
    };

    expect(assessProjectedKernelCoverage(thinGenomePartial).score).toBeGreaterThan(
      assessProjectedKernelCoverage(compactModelKernel).score,
    );
    expect(assessProjectedKernelCoverage(completeNativeKernelSurfaces(thinGenomePartial)).usable).toBe(false);
    expect(assessProjectedKernelCoverage(completeNativeKernelSurfaces(compactModelKernel)).usable).toBe(true);
    expect(pickNativeKernel(thinGenomePartial, compactModelKernel)).toBe(compactModelKernel);
    expect(pickNativeKernel(compactModelKernel, thinGenomePartial)).toBe(compactModelKernel);
  });

  const wireMap = buildNativeWireMap(parsedSkeleton());

  it('rides the existing kernel contract plus the native authoring addition', () => {
    const prompt = buildNativePassBPrompt(wireMap, [0, 1], {
      includeCourseLevel: true,
      contentSourcedLessonIds: ['lesson-2'],
    });
    expect(prompt.systemPrompt).toContain('Abbreviated JSON keys'); // kernel legend reused
    expect(prompt.systemPrompt).toContain(NATIVE_PASS_B_AUTHORING_ADDITION);
    expect(prompt.userPrompt).toMatch(/JSON/); // json_object rule (rides the kernel line)
    expect(prompt.userPrompt).toContain('CONTENT-SOURCED lessons');
    expect(prompt.userPrompt).toContain('lesson-2');
    expect(prompt.lessons.map((lesson) => lesson.lessonId)).toEqual(['lesson-1', 'lesson-2']);
  });

  it('hardens recovery prompts so missing kernels are not answered with short acknowledgements', () => {
    const prompt = buildNativePassBPrompt(wireMap, [0], {
      recoveryAttempt: 1,
      expectedLessonIds: ['lesson-1'],
    });

    expect(prompt.userPrompt).toContain('RECOVERY RETRY 1');
    expect(prompt.userPrompt).toContain('Return only strict JSON for these lesson ids: lesson-1');
    expect(prompt.userPrompt).toContain('include complete kernel atoms');
    expect(prompt.userPrompt).toContain('Do not summarize this request');
    expect(prompt.recoveryAttempt).toBe(1);
  });

  it('completes dropped authored surfaces from admitted facts without another model call', () => {
    const sparse = {
      keyTerms: [
        {
          term: 'Musical interval',
          definition: 'A musical interval is the pitch distance between two notes.',
          example: '',
          misconception: 'Students may treat every pitch distance as the same named interval.',
          correction: 'Interval names depend on the measured pitch relationship between the notes.',
        },
      ],
      kernel: {
        facts: ['An interval can be melodic when notes sound in sequence or harmonic when they sound together.'],
        scenario: {
          setup: 'A student compares two short melodies and must classify the heard intervals.',
          materials: 'two labeled audio clips and their notated excerpts',
        },
      },
      quizItems: [
        {
          index: 0,
          type: 'multiple_choice',
          question: 'What are the intervals between successive notes of a scale called?',
          options: ['Scale steps', 'Clef marks', 'Dynamic levels', 'Phrase endings'],
          answerIndex: 0,
          explanation: 'Intervals between successive notes of a scale are known as scale steps.',
        },
        {
          index: 1,
          type: 'multiple_choice',
          question: 'Which label describes two notes that sound at the same time?',
          options: ['Melodic interval', 'Harmonic interval', 'Scale degree', 'Key signature'],
          answerIndex: 1,
          explanation: 'A harmonic interval contains two notes that sound at the same time.',
        },
      ],
    };
    const completed = completeNativeKernelSurfaces(sparse, {
      title: 'Lesson 2: Intervals and Hearing',
      sections: [
        {
          topicSection: '2.1: Musical intervals',
          weeklyAssessments: ['Week 2 listening and notation exercise'],
        },
      ],
    });

    expect(completed.surfaceFallbacks).toEqual(['discussionPrompt', 'assignmentCore', 'studyGuide']);
    expect(completed.discussionPrompt.positions).toHaveLength(3);
    expect(completed.assignmentCore.parameters).toHaveLength(4);
    expect(completed.assignmentCore.taskDescription).toContain('Week 2 listening and notation exercise');
    expect(completed.assignmentCore.canonicalAssessment).toBe('Week 2 listening and notation exercise');
    expect(completed.studyGuide.summary).toContain('Musical interval');
    expect(completed.studyGuide.reviewStrategy).toContain('audio clips');
    expect(completed.keyTerms.filter((term) => term.example)).toHaveLength(3);
    expect(completed.keyTermFallbacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'example', term: 'Musical interval', source: 'admitted-scenario' }),
        expect.objectContaining({ type: 'term', term: 'Scale steps', source: 'verified-quiz-projection' }),
        expect.objectContaining({ type: 'term', term: 'Harmonic interval', source: 'verified-quiz-projection' }),
      ]),
    );

    const boundarySafe = completeNativeKernelSurfaces(
      {
        ...sparse,
        kernel: {
          ...sparse.kernel,
          scenario: {
            ...sparse.kernel.scenario,
            materials:
              'Interview transcript, annotated prototype, observation log, comparison worksheet, decision record, critique notes, accessibility review, task-flow map, evidence table, and the complete final synthesis artifact.',
          },
        },
      },
      { lessonNumber: 2, title: 'Lesson 2: Intervals and Hearing', sections: [] },
    );
    expect(boundarySafe.assignmentCore.taskDescription).not.toContain('form a compl');
    expect(boundarySafe.assignmentCore.taskDescription).not.toMatch(/\b\w{1,3}\s+artifact\b/);

    const variedFallbacks = Array.from({ length: 6 }, (_, index) =>
      completeNativeKernelSurfaces(sparse, {
        lessonNumber: index + 1,
        title: `Lesson ${index + 1}: Intervals and Hearing`,
        sections: [{ topicSection: 'Musical intervals' }],
      }),
    );
    const fallbackOpponents = variedFallbacks.map((fallback) => fallback.discussionPrompt.positions[1]);
    expect(new Set(fallbackOpponents).size).toBe(6);
    expect(new Set(variedFallbacks.map((fallback) => fallback.assignmentCore.taskDescription)).size).toBe(6);
    expect(new Set(variedFallbacks.map((fallback) => JSON.stringify(fallback.assignmentCore.parameters))).size).toBe(6);

    const authored = {
      ...completed,
      assignmentCore: { taskDescription: 'Instructor-authored assignment stays intact.', parameters: ['one', 'two'] },
      surfaceFallbacks: [],
    };
    expect(completeNativeKernelSurfaces(authored, {}).assignmentCore).toBe(authored.assignmentCore);

    const overlay = { 'lesson-1': sparse };
    expect(
      completeNativeLessonSurfaces(
        overlay,
        [{ title: 'Lesson 1: Intervals', sections: [{ weeklyAssessments: 'Listening check' }] }],
        [0],
      ),
    ).toBe('Completed 3 missing authored surfaces from admitted lesson evidence');
    expect(overlay['lesson-1']).toEqual(
      expect.objectContaining({ discussionPrompt: expect.any(Object), assignmentCore: expect.any(Object) }),
    );
  });

  it('projects a minimal terminology core when every adapter term is quarantined', () => {
    const completed = completeNativeKernelSurfaces(
      {
        keyTerms: [],
        quizItems: [],
        kernel: {
          facts: [
            'Audience analysis compares listener knowledge, attitudes, and expectations before a speech.',
            'Demographic evidence describes audience characteristics rather than argument quality.',
            'Situational evidence includes the occasion, setting, and reason listeners are assembled.',
          ],
          scenario: {
            setup:
              'A speaker compares a registration survey with observations from the event venue before revising an opening.',
            materials: 'registration survey, venue observation notes',
          },
        },
      },
      {
        title: 'Lesson 2: Audience Analysis',
        sections: [{ topicSection: 'Audience analysis and evidence' }],
      },
    );

    expect(completed.keyTerms).toHaveLength(1);
    expect(completed.keyTerms[0]).toMatchObject({
      term: 'Audience analysis and evidence',
      source: 'fact-ledger-projection',
    });
    expect(completed.keyTerms[0].definition).toBe(
      'Audience analysis compares listener knowledge, attitudes, and expectations before a speech.',
    );
    expect(completed.keyTerms[0].example).toContain('registration survey');
    expect(completed.keyTermFallbacks).toContainEqual(
      expect.objectContaining({ type: 'term', source: 'fact-ledger-projection' }),
    );
    expect(completed.quizItems).toHaveLength(2);
    expect(completed.slideContent.length).toBeGreaterThanOrEqual(1);
    expect(assessProjectedKernelCoverage(completed).usable).toBe(true);

    const mandarinFactsOnly = completeNativeKernelSurfaces(
      {
        targetLanguagePair: {
          hanzi: '我不喜欢苹果。',
          pinyin: 'Wǒ bù xǐhuān píngguǒ.',
          english: 'I do not like apples',
        },
        keyTerms: [],
        quizItems: [],
        kernel: {
          facts: [
            '我不喜欢苹果。 (Wǒ bù xǐhuān píngguǒ.) means "I do not like apples".',
            '不 (bù) appears before the verb 喜欢 (xǐhuān) to negate "like".',
            'The sentence follows subject-negation-verb-object order: 我 + 不 + 喜欢 + 苹果.',
          ],
          scenario: null,
        },
      },
      {
        title: 'Lesson 7: Core SVO Sentence Patterns with 不, 没, and 吗',
        sections: [{ topicSection: 'Core SVO sentence patterns with 不, 没, and 吗' }],
      },
    );
    expect(mandarinFactsOnly.keyTerms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          term: 'Core SVO sentence patterns with 不, 没, and 吗',
          source: 'fact-ledger-projection',
        }),
      ]),
    );
    expect(mandarinFactsOnly.quizItems).toHaveLength(2);
    expect(assessProjectedKernelCoverage(mandarinFactsOnly).usable).toBe(true);

    const factsOnly = completeNativeKernelSurfaces(
      {
        keyTerms: [],
        quizItems: [],
        kernel: {
          facts: [
            'Contemporary art includes artistic expressions created from the mid-twentieth century onward.',
            'Global art studies artistic production originating from various geographical regions.',
            'Contemporary art can be analyzed through painting, sculpture, and digital art.',
            'Contemporary global art examines relationships between local and international artistic scenes.',
            'Artistic media provide inspectable details for comparing contemporary practices.',
          ],
          scenario: null,
        },
      },
      {
        title: 'Lesson 14: Contemporary Global Art',
        sections: [{ topicSection: 'Contemporary and global art' }],
      },
    );
    expect(factsOnly.kernel.scenario).toMatchObject({ source: 'derived-kernel-fallback' });
    expect(factsOnly.kernel.scenario.setup).toContain(
      'Claim A: Contemporary global art examines relationships between local and international artistic scenes.',
    );
    expect(factsOnly.kernel.scenario.setup).toContain(
      'Claim B: Contemporary art includes artistic expressions created from the mid-twentieth century onward.',
    );
    expect(factsOnly.kernel.scenario.setup).toContain('Identify the course concept that best organizes these claims');
    expect(factsOnly.kernel.scenario.setup).not.toMatch(/learner compares|named reading or activity/i);
    expect(JSON.stringify(factsOnly.quizItems)).not.toMatch(/learner compares|named reading or activity/i);
    expect(
      JSON.stringify({
        discussionPrompt: factsOnly.discussionPrompt,
        assignmentCore: factsOnly.assignmentCore,
        studyGuide: factsOnly.studyGuide,
      }),
    ).not.toMatch(/named reading or activity/i);
    expect(factsOnly.discussionPrompt.prompt).toContain('two supplied claim cards');
    expect(factsOnly.quizItems).toHaveLength(2);
    expect(factsOnly.coreFallbacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'scenario', source: 'fact-ledger-projection' }),
        expect.objectContaining({ field: 'quizItems', source: 'fact-ledger-projection' }),
      ]),
    );
    expect(assessProjectedKernelCoverage(factsOnly).usable).toBe(true);

    const meaningFact = 'The meaning of life is a philosophical inquiry into purpose and value within existence.';
    const misorderedFacts = completeNativeKernelSurfaces(
      {
        keyTerms: [],
        quizItems: [],
        kernel: {
          facts: [
            'Existentialism asserts that individual existence precedes any predetermined essence.',
            'Argument analysis examines the logical structure and validity of a philosophical argument.',
            meaningFact,
            'Knowledge theory asks what constitutes justified belief.',
          ],
          scenario: null,
        },
      },
      {
        title: 'Lesson 11: Meaning of life',
        sections: [{ topicSection: 'Meaning of Life' }],
      },
    );
    expect(misorderedFacts.keyTerms[0]).toMatchObject({
      term: 'Meaning of Life',
      definition: meaningFact,
      source: 'fact-ledger-projection',
    });
    expect(misorderedFacts.kernel.scenario.setup).toContain(`Claim A: ${meaningFact}`);
    expect(misorderedFacts.quizItems.find((item) => item.type === 'short_answer')?.answer).not.toMatch(
      /Meaning of Life:\s*Existentialism/i,
    );
  });

  it('parses kernels through the existing linters and rejects out-of-chunk ids', () => {
    const prompt = buildNativePassBPrompt(wireMap, [0, 1], { contentSourcedLessonIds: ['lesson-2'] });
    const parsed = parseNativePassBResponse(passBResponse(), {
      prompt,
      expectedLessonIds: ['lesson-1', 'lesson-2'],
      contentSourcedLessonIds: ['lesson-2'],
    });
    // lesson-1 kernel kept (valid keyTerm), invalid keyTerm linted out.
    expect(Object.keys(parsed.kernels)).toEqual(['lesson-1']);
    expect(parsed.issues.some((issue) => issue.surface === 'keyTerms')).toBe(true);
    // lesson-2 is content-sourced: kernel dropped, never displaces the genome.
    expect(parsed.issues.some((issue) => issue.problems?.includes('content-sourced-kernel-dropped'))).toBe(true);
    // lesson-9 rejected on BOTH halves (the v0.14.1 out-of-chunk guard).
    expect(parsed.authored['lesson-9']).toBeUndefined();
    expect(parsed.kernels['lesson-9']).toBeUndefined();
    expect(
      parsed.issues.some(
        (issue) => issue.lessonId === 'lesson-9' && issue.problems?.includes('out-of-chunk-lesson-id'),
      ),
    ).toBe(true);
    // Authored outcomes/activities parsed for both in-chunk lessons.
    expect(parsed.authored['lesson-1'].outcomes).toEqual(PASS_B_AUTHORING.outcomes);
    expect(parsed.authored['lesson-1'].asyncActivities).toEqual(PASS_B_AUTHORING.async);
    expect(parsed.authored['lesson-2'].goal).toBe('Identify minerals from physical properties');
  });

  it('rejects foreign-language content from both the kernel and native authoring halves', () => {
    const prompt = {
      courseName: 'Elementary Mandarin Chinese I',
      lessons: [{ lessonId: 'lesson-1', title: 'Lesson 1: Mandarin numbers' }],
      itemPlan: [],
    };
    const response = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-1',
          goal: 'Use Hangul counters to state quantities.',
          outcomes: ['Choose between native Korean and Sino-Korean number systems.'],
          async: ['Review Korean number forms.'],
          sync: ['Practice Korean counters with a partner.'],
          facts: ['Korean commonly uses native Korean and Sino-Korean number systems in different contexts.'],
          keyTerms: [
            {
              tr: 'Hangul counters',
              df: 'Hangul is the Korean writing system represented in syllable blocks for written communication.',
              eg: 'A learner combines a native Korean number with the counter practiced in the dialogue.',
              mi: 'One Korean number form works in every grammatical context.',
              cx: 'The grammatical context determines the Korean number system and counter to use.',
            },
          ],
        },
      ],
    });

    const parsed = parseNativePassBResponse(response, {
      prompt,
      expectedLessonIds: ['lesson-1'],
    });
    expect(parsed.kernels).toEqual({});
    expect(parsed.authored).toEqual({});
    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lessonId: 'lesson-1',
          surface: 'authoring',
          reason: 'foreign-language-contamination',
          problems: ['foreign-language-contamination:korean'],
        }),
      ]),
    );
  });
});

// ── Assembly ────────────────────────────────────────────────────────────────

function assertNoDirectlyNestedArrays(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      // The Firestore rule: no array directly inside an array (the tuple-edge
      // encoding that broke cloud save the day v0.13.0 shipped).
      expect(Array.isArray(item), `${path}[${index}] is a directly nested array`).toBe(false);
      assertNoDirectlyNestedArrays(item, `${path}[${index}]`);
    });
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assertNoDirectlyNestedArrays(child, `${path}.${key}`);
    }
  }
}

function assembled() {
  return assembleNativeCourseGraph({
    skeleton: parsedSkeleton(),
    passBBySession: {
      'lesson-1': {
        goal: PASS_B_AUTHORING.goal,
        outcomes: PASS_B_AUTHORING.outcomes,
        asyncActivities: PASS_B_AUTHORING.async,
        syncActivities: PASS_B_AUTHORING.sync,
      },
      'lesson-2': {
        goal: 'Identify minerals from physical properties',
        outcomes: ['Classify minerals using hardness, streak, and luster'],
        asyncActivities: ['Watch: mineral identification demo'],
        syncActivities: ['Lab: Mohs hardness practice'],
      },
      'lesson-3': {
        goal: 'Connect magma composition to eruption style',
        outcomes: ['Compare magma compositions', 'Evaluate volcanic hazard scenarios'],
        asyncActivities: ['Read: volcanic hazards case study'],
        syncActivities: ['Case discussion: Mount St. Helens'],
      },
    },
  });
}

describe('native assembly → CourseGraph', () => {
  it('produces a schema-valid graph that passes the walk test, marked authoredBy native', () => {
    const { graph, courseMap } = assembled();
    expect(validateCourseGraph(graph).valid).toBe(true);
    expect(graph.authoredBy).toBe('native');
    assertNoDirectlyNestedArrays(graph);
    expect(graph.sessions).toHaveLength(3);
    expect(courseMap.lessons).toHaveLength(3);
    expect(courseMap.lessons[0].title).toBe('Lesson 1: Introduction and Earth Systems');
  });

  it('classifies registry kinds via the derive-time classifier and honors explicit weights', () => {
    const { graph } = assembled();
    const lab = graph.assessments.find((assessment) => assessment.title.startsWith('Mineral ID Lab Report'));
    const midterm = graph.assessments.find((assessment) => assessment.title.startsWith('Midterm Exam'));
    const warmup = graph.assessments.find((assessment) => assessment.title.startsWith('Field Sketch Warm-up'));
    expect(lab.kind).toBe('graded-artifact');
    expect(lab.id).toBe('A2.1');
    // Skeleton weightPct rides the atom as "(20%)" — the registry honors it.
    expect(lab.weightPct).toBe(20);
    expect(midterm.kind).toBe('exam');
    // 'bogus-kind' was dropped at parse; the classifier owns the decision.
    expect(['graded-artifact', 'in-class']).toContain(warmup.kind);
    const graded = graph.assessments.filter((assessment) => assessment.kind !== 'in-class');
    expect(graded.reduce((sum, assessment) => sum + (assessment.weightPct || 0), 0)).toBe(100);
    // Readings registry: verbatim title, classified kind, stable id.
    expect(graph.readings).toHaveLength(1);
    expect(graph.readings[0]).toMatchObject({ id: 'R3.1', title: 'OpenStax Ch. 4: Igneous Rocks', kind: 'chapter' });
  });

  it('render → derive round-trip is stable (sessions, registry, outcomes)', () => {
    const { graph } = assembled();
    const rederived = deriveCourseGraphFromCourseMap(renderCourseMapFromGraph(graph));
    expect(rederived.sessions.map((session) => [session.id, session.number, session.title])).toEqual(
      graph.sessions.map((session) => [session.id, session.number, session.title]),
    );
    const registryView = (entities) =>
      entities.map((entity) => [entity.id, entity.title, entity.dueSession, entity.kind, entity.weightPct]);
    expect(registryView(rederived.assessments)).toEqual(registryView(graph.assessments));
    expect(rederived.readings.map((reading) => [reading.id, reading.title])).toEqual(
      graph.readings.map((reading) => [reading.id, reading.title]),
    );
    expect(rederived.outcomes.map((outcome) => outcome.text)).toEqual(graph.outcomes.map((outcome) => outcome.text));
  });

  it('throws the typed error without a usable skeleton', () => {
    expect(() => assembleNativeCourseGraph({ skeleton: null })).toThrowError(NativeAuthoringError);
    expect(() => assembleNativeCourseGraph({ skeleton: { sessions: [] } })).toThrowError(/skeleton/);
  });
});

// ── v0.14.5 hotfix: round 2026-06-12T04-52 live-only failures ───────────────
// Both native runs (cs-python--native, geology--native) died in
// finalizing-package while their prose twins passed 100/A. Two defects:
//  1. ASSESSMENTS LOST: the assembled graph carried 1 assessment for 15
//     lessons. Hypothesis (a) — assembly drops atoms — is FALSIFIED below
//     (a 15×2-4 skeleton carries every atom through derive); the loss was
//     contract-side: Pass A's HARD TRACEABILITY transcribed "weekly
//     autograded quizzes" as ~1 entry (the recurring-cadence rule now
//     expands cadences per session).
//  2. SILENT HANG: the degenerate 1-assessment blueprint hit the compiler's
//     semantic-contract gate (assessmentCoverage blockers) which THROWS —
//     and nothing caught it. The throw is pinned below; the fix routes
//     degenerate skeletons through resolveNativeAssembly's CurriculumV1
//     repair BEFORE compile, plus the generateAll belt that marks features
//     errored instead of letting a compiler throw kill the run.

function makeSkeletonFixture({
  sessionCount = 15,
  assessmentsPerSession = null,
  assessments = null,
  readings = [],
  resources = [],
  sourceText = null,
} = {}) {
  const sessions = Array.from({ length: sessionCount }, (_, index) => ({
    id: `s${index + 1}`,
    order: index + 1,
    title: `Topic ${index + 1} Fundamentals`,
    sectionTitles: [`Concept ${index + 1}A`, `Concept ${index + 1}B`],
  }));
  let skeletonAssessments = assessments;
  if (!skeletonAssessments) {
    skeletonAssessments = [];
    let ordinal = 0;
    for (let sessionNumber = 1; sessionNumber <= sessionCount; sessionNumber += 1) {
      const perSession = assessmentsPerSession ?? 2 + (sessionNumber % 3); // 2-4 atoms
      for (let atom = 0; atom < perSession; atom += 1) {
        ordinal += 1;
        skeletonAssessments.push({
          id: `a${ordinal}`,
          title:
            sessionNumber === 8 && atom === 0 ? 'Midterm Exam' : `Autograded quiz ${atom + 1}: topic ${sessionNumber}`,
          kind: sessionNumber === 8 && atom === 0 ? 'exam' : 'graded-artifact',
          dueSession: sessionNumber,
        });
      }
    }
  }
  return parseNativeSkeletonResponse(
    JSON.stringify({
      course: { name: 'CS Python', term: 'FA26', goals: ['Reason with code'] },
      sessions,
      assessments: skeletonAssessments,
      readings,
      resources,
    }),
    sourceText ? { sourceText } : {},
  );
}

function makePassBFixture(sessionCount = 15) {
  const passB = {};
  for (let lessonNumber = 1; lessonNumber <= sessionCount; lessonNumber += 1) {
    passB[`lesson-${lessonNumber}`] = {
      goal: `Goal for lesson ${lessonNumber}`,
      outcomes: [
        `Analyze concept ${lessonNumber} alpha`,
        `Apply concept ${lessonNumber} beta`,
        `Evaluate concept ${lessonNumber} gamma`,
        `Compare concept ${lessonNumber} delta`,
      ],
      asyncActivities: [`Read: chapter ${lessonNumber}`],
      syncActivities: [`Lab: exercise ${lessonNumber}`],
    };
  }
  return passB;
}

describe('assembly carries every assessment atom (defect 1 — hypothesis (a) falsified)', () => {
  it('15 sessions × 2-4 assessment atoms ALL survive assembly + deriveFromCourseMap (count, ids, kinds)', () => {
    const skeleton = makeSkeletonFixture();
    expect(skeleton.assessments.length).toBeGreaterThanOrEqual(30); // 2-4 per session × 15

    // The skeleton→wire-map render places every atom (arrays pass through
    // splitCellAtoms atom-by-atom; first section of the due lesson).
    const wireMap = buildNativeWireMap(skeleton, makePassBFixture());
    const cellAtoms = wireMap.lessons.flatMap((lesson) =>
      (lesson.sections || []).flatMap((section) =>
        Array.isArray(section.weeklyAssessments) ? section.weeklyAssessments : [],
      ),
    );
    expect(cellAtoms).toHaveLength(skeleton.assessments.length);

    const { graph } = assembleNativeCourseGraph({ skeleton, passBBySession: makePassBFixture() });
    expect(graph.assessments).toHaveLength(skeleton.assessments.length);

    // Registry ids stay stable and unique: A<lesson>.<ordinal> in cell order.
    const ids = graph.assessments.map((assessment) => assessment.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let sessionNumber = 1; sessionNumber <= 15; sessionNumber += 1) {
      const expected = skeleton.assessments.filter((entry) => entry.dueSession === sessionNumber).length;
      const got = graph.assessments.filter((assessment) => assessment.dueSession === sessionNumber);
      expect(got).toHaveLength(expected);
      expect(got.map((assessment) => assessment.id)).toEqual(
        Array.from({ length: expected }, (_, index) => `A${sessionNumber}.${index + 1}`),
      );
    }
    // Kinds classify per atom (the registry, not a fused per-lesson blob).
    expect(graph.assessments.find((assessment) => assessment.title === 'Midterm Exam').kind).toBe('exam');
    expect(graph.assessments.filter((assessment) => assessment.kind === 'graded-artifact').length).toBe(
      skeleton.assessments.length - 1,
    );
    expect(isDegenerateNativeGraph(graph)).toBe(false);
  });
});

describe('degenerate-skeleton gate (defect 1 → CurriculumV1 repair)', () => {
  it('isDegenerateNativeGraph: assessments < sessions is degenerate; >= is healthy', () => {
    expect(isDegenerateNativeGraph({ sessions: Array(15).fill({}), assessments: [{}] })).toBe(true);
    expect(isDegenerateNativeGraph({ sessions: Array(3).fill({}), assessments: [{}, {}] })).toBe(true);
    expect(isDegenerateNativeGraph({ sessions: Array(3).fill({}), assessments: [{}, {}, {}] })).toBe(false);
    expect(isDegenerateNativeGraph({ sessions: [], assessments: [] })).toBe(false);
    expect(isDegenerateNativeGraph(null)).toBe(false);
  });

  it('1 assessment for 15 lessons → CourseIR-repaired resolution before compile', () => {
    const skeleton = makeSkeletonFixture({
      assessments: [{ id: 'a1', title: 'Final project integrating the full semester', dueSession: 15 }],
    });
    const resolution = resolveNativeAssembly({ skeleton, passBBySession: makePassBFixture() });
    expect(resolution.ok).toBe(true);
    expect(resolution.repaired).toBe(true);
    expect(resolution.repairReason).toBe('degenerate-skeleton (1 assessment for 15 lessons)');
    expect(resolution.graph.authoredBy).toBe('courseir-v1');
    expect(resolution.graph.nativeRepair).toMatchObject({
      code: 'degenerate-skeleton-repaired',
      source: 'curriculumv1',
    });
    expect(resolution.courseIRValidation.valid).toBe(true);
    expect(resolution.courseIRValidation.stats).toMatchObject({
      lessons: 15,
      concepts: 15,
      assessments: 15,
      sourceLedgerRows: 1,
    });
    expect(isDegenerateNativeGraph(resolution.graph)).toBe(false);
    expect(resolution.graph.outcomes.some((outcome) => outcome.text.startsWith('Analyze concept 7 alpha'))).toBe(true);
  });

  it('a healthy skeleton resolves ok through the CourseIR source-of-truth projection', () => {
    const resolution = resolveNativeAssembly({ skeleton: makeSkeletonFixture(), passBBySession: makePassBFixture() });
    expect(resolution.ok).toBe(true);
    expect(resolution.graph.authoredBy).toBe('courseir-v1');
    expect(resolution.graph.sessions).toHaveLength(15);
    expect(resolution.courseIRValidation.valid).toBe(true);
    expect(resolution.nativeCourseIR).toMatchObject({
      code: 'validated-native-courseir',
      source: 'curriculumv1',
    });
    expect(resolution.graph.courseIR).toMatchObject({
      version: 'courseir.v1',
      nativeAssembly: {
        source: 'native-wire-map',
        projectedThrough: 'curriculumv1',
      },
    });
  });

  it('an assembly throw resolves to a fellBack result — it never propagates', () => {
    const resolution = resolveNativeAssembly({ skeleton: null });
    expect(resolution.ok).toBe(false);
    expect(resolution.code).toBe('assembly-no-skeleton');
    expect(resolution.fallbackMap).toBeNull();
    expect(typeof resolution.reason).toBe('string');
  });

  it('caller seam: repaired native resolution is visible in the budget and compiles cleanly', () => {
    // The hook flow at the function seam (no React): resolve → on ok emit a
    // nativeAuthoring pipeline decision → compile. Recoverable degenerate
    // assessment structure no longer enters the prose fallback path.
    const skeleton = makeSkeletonFixture({
      assessments: [{ id: 'a1', title: 'Final project integrating the full semester', dueSession: 15 }],
    });
    const resolution = resolveNativeAssembly({ skeleton, passBBySession: makePassBFixture() });
    expect(resolution.ok).toBe(true);

    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, {
      type: 'pipelineDecision',
      stage: 'nativeAuthoring',
      label: 'Native graph authoring',
      detail: `assembled ${resolution.graph.sessions.length} sessions · CurriculumV1 repaired ${resolution.nativeRepair.stats.lessons} lessons / ${resolution.nativeRepair.stats.assessments} assessments`,
    });
    expect(budget.pipeline.nativeAuthoring).toContain('CurriculumV1 repaired');
    expect(budget.recentEvents.some((event) => event.type === 'nativeAuthoringFellBack')).toBe(false);
    expect(isDegenerateNativeGraph(resolution.graph)).toBe(false);

    // The compile gate the live runs died on now passes — invoked exactly
    // once with the repaired CourseIR graph, returns instead of throwing.
    const compileCalls = [];
    const compile = (blueprint, features, options) => {
      compileCalls.push(blueprint);
      return compileBlueprintDeliverables(blueprint, features, options);
    };
    const blueprint = compactBlueprintForStorage(buildBlueprintFromGraph(resolution.graph, {}));
    const compiled = compile(blueprint, ['syllabus', 'assignments', 'rubrics'], { configMap: {} });
    expect(compileCalls).toHaveLength(1);
    expect(Object.keys(compiled)).toEqual(['syllabus', 'assignments', 'rubrics']);
  }, 20_000);

  it('CurriculumV1 helper can still convert a raw degenerate assembly map into a valid compiler graph', () => {
    const skeleton = makeSkeletonFixture({
      assessments: [{ id: 'a1', title: 'Final project integrating the full semester', dueSession: 15 }],
    });
    const raw = assembleNativeCourseGraph({ skeleton, passBBySession: makePassBFixture() });
    expect(isDegenerateNativeGraph(raw.graph)).toBe(true);

    const repair = repairNativeFallbackWithCurriculumV1({
      fallbackMap: raw.courseMap,
      columns: [],
      lessonFilter: null,
    });
    expect(repair.ok).toBe(true);
    expect(repair.validation.valid).toBe(true);
    expect(repair.validation.stats).toMatchObject({
      lessons: 15,
      concepts: 15,
      assessments: 15,
      sourceLedgerRows: 1,
    });
    expect(repair.graph.authoredBy).toBe('courseir-v1');
    expect(repair.graph.nativeRepair).toMatchObject({
      code: 'degenerate-skeleton-repaired',
      source: 'curriculumv1',
    });
    expect(validateCourseGraph(repair.graph).valid).toBe(true);
    expect(isDegenerateNativeGraph(repair.graph)).toBe(false);
    expect(repair.graph.outcomes.some((outcome) => outcome.text.startsWith('Analyze concept 7 alpha'))).toBe(true);

    const blueprint = compactBlueprintForStorage(buildBlueprintFromGraph(repair.graph, {}));
    const compiled = compileBlueprintDeliverables(blueprint, ['syllabus', 'assignments', 'rubrics'], {
      configMap: {},
    });
    expect(Object.keys(compiled)).toEqual(['syllabus', 'assignments', 'rubrics']);
  }, 20_000);
});

describe('the hang class: contract-blocked compile (defect 2)', () => {
  it('repairs the former one-assessment hang input before contract validation', () => {
    // This is the exact former live failure state: assembly succeeds with one
    // registry assessment for 15 sessions. Compiler hydration must now repair
    // its coverage before validation so the package completes with no blocker.
    const skeleton = makeSkeletonFixture({
      assessments: [{ id: 'a1', title: 'Final project integrating the full semester', dueSession: 15 }],
    });
    const { graph } = assembleNativeCourseGraph({ skeleton, passBBySession: makePassBFixture() });
    expect(graph.assessments).toHaveLength(1);
    expect(isDegenerateNativeGraph(graph)).toBe(true);
    const blueprint = compactBlueprintForStorage(buildBlueprintFromGraph(graph, {}));
    const compiled = compileBlueprintDeliverables(blueprint, ['syllabus'], { configMap: {} });
    const compilerContext = compiled[BLUEPRINT_COMPILE_CONTEXT];

    expect(compiled.syllabus).toBeTruthy();
    expect(compilerContext.semanticContract).toMatchObject({ status: 'pass', blockerCount: 0 });
    expect(compilerContext.assessments).toHaveLength(15);
  });

  it('a healthy assembled graph compiles exactly once without throwing', () => {
    const { graph } = assembleNativeCourseGraph({
      skeleton: makeSkeletonFixture(),
      passBBySession: makePassBFixture(),
    });
    const compileCalls = [];
    const compile = (blueprint, features, options) => {
      compileCalls.push(blueprint);
      return compileBlueprintDeliverables(blueprint, features, options);
    };
    const blueprint = compactBlueprintForStorage(buildBlueprintFromGraph(graph, {}));
    const compiled = compile(blueprint, ['syllabus', 'assignments'], { configMap: {} });
    expect(compileCalls).toHaveLength(1);
    expect(Object.keys(compiled)).toEqual(['syllabus', 'assignments']);
  });
});

describe('Pass A recurring-cadence contract (defect 1, contract side)', () => {
  it('the skeleton prompt states the per-session assessment expectation', () => {
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/RECURRING ASSESSMENTS/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/one assessments\[\] entry PER SESSION/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/fewer entries than sessions/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/Never copy an assessment genre or cadence from these instructions/i);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).not.toMatch(/weekly autograded quizzes|weekly reading responses/i);
    // The cadence expansion must not weaken verbatim traceability for
    // one-off named titles.
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/one-off named titles stay verbatim/i);
  });
});

// ── v0.14.7 WS-B1: Pass A resource transcription ────────────────────────────
// The last side-by-side round's ONLY P1 class: 66 "unresolved source
// placeholder" findings, all from Pass A never transcribing supporting
// resources/materials — every empty resource surface compiled to the
// "Instructor-provided course materials" placeholder. Three seams die here:
//  - contract: skeleton.resources (verbatim titles + the RULE 4-style
//    cadence-expansion discipline) in NATIVE_SKELETON_SYSTEM_PROMPT;
//  - recovery: brief names resources + skeleton transcribed none →
//    resolveNativeAssembly keeps the native graph but creates explicit
//    instructor-confirmation resource placeholders;
//  - assembly: transcribed resources ride the wire map's supportingResources
//    cells → syllabus-origin graph.resources → every derived map render.

describe('Pass A resource transcription (v0.14.7 WS-B1)', () => {
  const RESOURCE_BRIEF =
    'A 15-lesson introductory college course with weekly autograded quizzes and hands-on coding labs.';
  const NO_RESOURCE_BRIEF =
    'A 15-lesson seminar on ethics, epistemology, and metaphysics with weekly discussion posts and a final essay.';

  it('the skeleton prompt carries the supporting-resources rule (verbatim + cadence expansion)', () => {
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/SUPPORTING RESOURCES/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/"resources"/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/one resources\[\] entry PER SESSION/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/transcription of the materials PLAN, not invention/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/Omit "resources" entries \(or the array\) entirely/);
    // Readings and resources are SEPARATE registries — never duplicated.
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/stay in "readings", never duplicated/);
    // Resource titles ride the HARD TRACEABILITY rule with the other two.
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/assessment, reading, and resource titles must be VERBATIM/);
  });

  it('parses resources: verbatim titles, defaulted ids, clamped dueSession', () => {
    const skeleton = parsedSkeleton();
    expect(skeleton.resources).toHaveLength(2);
    expect(skeleton.resources[0]).toMatchObject({ id: 'm1', title: 'Mineral ID lab worksheet', dueSession: 2 });
    // Missing id defaults from order; dueSession 99 clamps into range.
    expect(skeleton.resources[1]).toMatchObject({ id: 'm2', title: 'Volcanic hazards case packet', dueSession: 3 });
    // No sourceText option → the brief signal is UNKNOWN, never asserted.
    expect(skeleton.sourceNamesResources).toBeUndefined();
  });

  it('briefNamesResources: fires on the materials vocabulary, quiet on topic-only briefs', () => {
    expect(briefNamesResources('a 14-lesson undergraduate course with weekly labs using hand-specimen kits')).toBe(
      true,
    );
    expect(briefNamesResources(RESOURCE_BRIEF)).toBe(true);
    expect(briefNamesResources('Required readings as named on the syllabus: Week 2 reads Gilgamesh')).toBe(true);
    expect(briefNamesResources('each unit ships a dataset and a starter notebook')).toBe(true);
    expect(briefNamesResources(NO_RESOURCE_BRIEF)).toBe(false);
    // Topic words must not trip it: "templates" (the C++ sense) and bare
    // "software"/"reading passages" are course content, not named materials.
    expect(briefNamesResources('covers C++ templates and generic programming in a software design studio')).toBe(false);
    expect(briefNamesResources('basic characters and short reading passages; food and dining')).toBe(false);
    expect(briefNamesResources('')).toBe(false);
  });

  it('parse stamps sourceNamesResources from the brief only when sourceText is provided', () => {
    expect(makeSkeletonFixture({ sourceText: RESOURCE_BRIEF }).sourceNamesResources).toBe(true);
    expect(makeSkeletonFixture({ sourceText: NO_RESOURCE_BRIEF }).sourceNamesResources).toBe(false);
    expect(makeSkeletonFixture().sourceNamesResources).toBeUndefined();
  });

  it('recovery: brief names resources + skeleton transcribed none → review-only diagnostics, not export text', () => {
    const skeleton = makeSkeletonFixture({ sourceText: RESOURCE_BRIEF });
    const recovery = recoverMissingSkeletonResources(skeleton);
    expect(recovery.recoveredCount).toBe(15);
    expect(recovery.skeleton.resources[0]).toMatchObject({
      title: 'Course source materials for Topic 1 Fundamentals',
      reviewOnly: true,
      recovered: true,
    });

    const resolution = resolveNativeAssembly({ skeleton, passBBySession: makePassBFixture() });
    expect(resolution.ok).toBe(true);
    expect(resolution.resourceRecovery).toEqual({ code: 'missing-resources-recovered', recoveredCount: 15 });
    expect(resolution.graph.authoredBy).toBe('courseir-v1');
    expect(resolution.graph.courseIR.nativeAssembly.projectedThrough).toBe('curriculumv1');
    expect(resolution.graph.resources).toHaveLength(0);
    const serialized = JSON.stringify(resolution.courseMap);
    expect(serialized).not.toContain('Assigned resource to confirm');
    expect(serialized).not.toContain('Course source materials for Topic');
  });

  it('lint: a skeleton WITH transcribed resources passes', () => {
    const skeleton = makeSkeletonFixture({
      sourceText: RESOURCE_BRIEF,
      resources: Array.from({ length: 15 }, (_, index) => ({
        id: `m${index + 1}`,
        title: `Lab handout: topic ${index + 1}`,
        dueSession: index + 1,
      })),
    });
    const resolution = resolveNativeAssembly({ skeleton, passBBySession: makePassBFixture() });
    expect(resolution.ok).toBe(true);
    expect(resolution.graph.authoredBy).toBe('courseir-v1');
    expect(resolution.graph.courseIR.nativeAssembly.projectedThrough).toBe('curriculumv1');
    expect(JSON.stringify(resolution.courseMap)).toContain('Lab handout: topic 1');
  });

  it('lint: registry readings alone satisfy the resource surface (the render leads cells with them)', () => {
    const skeleton = makeSkeletonFixture({
      sourceText: 'Required readings as named on the syllabus: Week 2 reads Gilgamesh, Tablets I–IV.',
      readings: [{ id: 'r1', title: 'Gilgamesh, Tablets I–IV', dueSession: 2 }],
    });
    expect(skeleton.sourceNamesResources).toBe(true);
    const resolution = resolveNativeAssembly({ skeleton, passBBySession: makePassBFixture() });
    expect(resolution.ok).toBe(true);
    expect(resolution.graph.authoredBy).toBe('courseir-v1');
    expect(resolution.graph.readings.map((reading) => reading.title)).toContain('Gilgamesh, Tablets I–IV');
    expect(resolution.graph.resources.map((resource) => resource.citation)).not.toContain('Gilgamesh, Tablets I–IV');
  });

  it('lint: brief naming NO resources + empty skeleton resources passes (no false positive)', () => {
    const quiet = makeSkeletonFixture({ sourceText: NO_RESOURCE_BRIEF });
    expect(resolveNativeAssembly({ skeleton: quiet, passBBySession: makePassBFixture() }).ok).toBe(true);
    // A skeleton parsed WITHOUT sourceText (older call sites, stashed
    // skeletons from before the stamp) never arms the lint.
    const unstamped = makeSkeletonFixture();
    expect(resolveNativeAssembly({ skeleton: unstamped, passBBySession: makePassBFixture() }).ok).toBe(true);
  });

  it('source cadence recovery prevents a degenerate assessment plan before CourseIR repair is needed', () => {
    const skeleton = makeSkeletonFixture({
      sourceText: RESOURCE_BRIEF,
      assessments: [{ id: 'a1', title: 'Final project integrating the full semester', dueSession: 15 }],
    });
    const resolution = resolveNativeAssembly({ skeleton, passBBySession: makePassBFixture() });
    expect(resolution.ok).toBe(true);
    expect(skeleton.assessments).toHaveLength(30);
    expect(skeleton.assessmentCadenceRecovery).toMatchObject({ cadenceCount: 2, recoveredItemCount: 30 });
    expect(resolution.graph.nativeRepair).toBeUndefined();
    expect(isDegenerateNativeGraph(resolution.graph)).toBe(false);
  });

  it('assembly carries resources into graph.resources and the derived map supportingResources cells', () => {
    const { graph, courseMap } = assembled();
    const syllabusResources = graph.resources.filter((resource) => resource.origin === 'syllabus');
    expect(syllabusResources.map((resource) => resource.citation)).toEqual([
      'Mineral ID lab worksheet',
      'Volcanic hazards case packet',
    ]);
    expect(syllabusResources[0].sessionRefs).toEqual([2]);
    expect(syllabusResources[1].sessionRefs).toEqual([3]);
    // The derived map's cells — the surface the compiler's resource
    // extraction reads (empty here is what compiled to the placeholder).
    const lesson2Cell = String(courseMap.lessons[1].sections[0].supportingResources);
    expect(lesson2Cell).toContain('Mineral ID lab worksheet');
    const lesson3Cell = String(courseMap.lessons[2].sections[0].supportingResources);
    expect(lesson3Cell).toContain('Volcanic hazards case packet');
    // Provenance order holds: the instructor-named registry reading LEADS
    // the cell; transcribed materials follow.
    expect(lesson3Cell.indexOf('OpenStax Ch. 4: Igneous Rocks')).toBeGreaterThanOrEqual(0);
    expect(lesson3Cell.indexOf('OpenStax Ch. 4: Igneous Rocks')).toBeLessThan(
      lesson3Cell.indexOf('Volcanic hazards case packet'),
    );
  });

  it('the wire map places session resources on the FIRST section of the due lesson', () => {
    const wireMap = buildNativeWireMap(parsedSkeleton());
    expect(wireMap.lessons[1].sections[0].supportingResources).toEqual(['Mineral ID lab worksheet']);
    expect(wireMap.lessons[2].sections[0].supportingResources).toEqual(['Volcanic hazards case packet']);
    expect(wireMap.lessons[2].sections[1].supportingResources).toBeUndefined();
    expect(wireMap.lessons[0].sections[0].supportingResources).toBeUndefined();
    // Skeletons stashed before the field existed stay safe.
    const legacy = parsedSkeleton();
    delete legacy.resources;
    expect(() => buildNativeWireMap(legacy)).not.toThrow();
  });
});

// ── B4: stable-id matching ──────────────────────────────────────────────────

describe('matchEntityIds (B4)', () => {
  it('keeps ids for unchanged entities and carries authoredBy', () => {
    const { graph } = assembled();
    const rederived = deriveCourseGraphFromCourseMap(renderCourseMapFromGraph(graph));
    const matched = matchEntityIds(graph, rederived);
    expect(matched.sessions.map((session) => session.id)).toEqual(graph.sessions.map((session) => session.id));
    expect(matched.assessments.map((assessment) => assessment.id)).toEqual(
      graph.assessments.map((assessment) => assessment.id),
    );
    expect(matched.authoredBy).toBe('native');
    expect(validateCourseGraph(matched).valid).toBe(true);
  });

  it('an inserted assessment atom keeps the surviving atom id and frees a fresh one', () => {
    const { graph } = assembled();
    const editedMap = renderCourseMapFromGraph(graph);
    // Insert a NEW assessment atom BEFORE the existing lab in lesson 2 —
    // ordinal-derived ids shift (the new atom becomes A2.1, the lab A2.2).
    const lesson2Section = editedMap.lessons[1].sections[0];
    lesson2Section.weeklyAssessments = `1. Mineral Vocabulary Quiz\n2. Mineral ID Lab Report (20%)`;
    const rederived = deriveCourseGraphFromCourseMap(editedMap);
    expect(rederived.assessments.find((a) => a.title.startsWith('Mineral ID Lab Report')).id).toBe('A2.2');

    const matched = matchEntityIds(graph, rederived);
    const lab = matched.assessments.find((a) => a.title.startsWith('Mineral ID Lab Report'));
    const quiz = matched.assessments.find((a) => a.title.startsWith('Mineral Vocabulary Quiz'));
    expect(lab.id).toBe('A2.1'); // kept its old registry id
    expect(quiz.id).not.toBe('A2.1'); // the new entity moved aside — no collision
    const ids = matched.assessments.map((assessment) => assessment.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Edges and section refs follow the rename.
    expect(matched.edges.assesses.some((edge) => edge.from === lab.id)).toBe(true);
    const sectionRefs = matched.sessions[1].sections[0].assessmentRefs;
    expect(sectionRefs).toContain(lab.id);
    expect(sectionRefs).toContain(quiz.id);
    expect(validateCourseGraph(matched).valid).toBe(true);
  });

  it('matches sessions by (order, normalized title): a retitled session gets a fresh identity', () => {
    const { graph } = assembled();
    const editedMap = renderCourseMapFromGraph(graph);
    editedMap.lessons[2].title = 'Lesson 3: Volcanoes, Renamed Entirely';
    const rederived = deriveCourseGraphFromCourseMap(editedMap);
    const matched = matchEntityIds(graph, rederived);
    // Sessions 1-2 keep their ids; session 3 (title changed) is a new entity.
    expect(matched.sessions[0].id).toBe(graph.sessions[0].id);
    expect(matched.sessions[1].id).toBe(graph.sessions[1].id);
    expect(matched.sessions[2].title).toContain('Renamed');
    expect(validateCourseGraph(matched).valid).toBe(true);
  });

  it('matches readings by (dueSession, normalized title)', () => {
    const { graph } = assembled();
    const editedMap = renderCourseMapFromGraph(graph);
    // Add a new reading ahead of the existing one in lesson 3.
    editedMap.lessons[2].sections[0].readings = ['A Brand New Primer', 'OpenStax Ch. 4: Igneous Rocks'];
    const rederived = deriveCourseGraphFromCourseMap(editedMap);
    const matched = matchEntityIds(graph, rederived);
    const openstax = matched.readings.find((reading) => reading.title.startsWith('OpenStax'));
    expect(openstax.id).toBe('R3.1'); // survived the insertion
    const ids = matched.readings.map((reading) => reading.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is a pass-through when either graph is missing', () => {
    const { graph } = assembled();
    expect(matchEntityIds(null, graph)).toBe(graph);
    expect(matchEntityIds(graph, null)).toBeNull();
  });
});

// ── Budget: counter + the constructor-whitelist trap ───────────────────────

describe('apiCallBudget native fields', () => {
  it('keeps authored course-map surfaces distinct from admitted lesson kernels in the live source', () => {
    const source = fs.readFileSync('src/hooks/useDeliverables.js', 'utf8');
    expect(source).toContain('outcomes/activities ${authoredSurfaceCount}/${nativeLessonCount}');
    expect(source).toContain('knowledge kernels admitted ${admittedKernelCount}/${nativeLessonCount}');
    expect(source).not.toContain('· Pass B authored ${');
  });

  it('counts nativeSkeletonCall as a provider call and writes the courseMap pipeline line', () => {
    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, {
      type: 'nativeSkeletonCall',
      label: 'Native graph authoring — Pass A skeleton',
      detail: 'gpt-5.4-mini · typed skeleton',
    });
    expect(budget.nativeSkeletonCalls).toBe(1);
    expect(getApiCallBudgetTotal(budget)).toBe(1);
    expect(budget.pipeline.courseMap).toContain('typed skeleton');
  });

  it('TRAILING-EVENT TEST: the counter survives later events (constructor whitelist)', () => {
    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, { type: 'nativeSkeletonCall', label: 'Pass A' });
    budget = applyApiCallBudgetEvent(budget, { type: 'deliverableChunkCall', label: 'chunk' });
    budget = applyApiCallBudgetEvent(budget, { type: 'blueprintEnrichmentCall', label: 'Pass B batch' });
    expect(budget.nativeSkeletonCalls).toBe(1);
    expect(getApiCallBudgetTotal(budget)).toBe(3);
  });

  it('nativeAuthoringFellBack is loud in the pipeline trail and survives trailing events', () => {
    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, {
      type: 'nativeAuthoringFellBack',
      label: 'Native authoring fell back to prose',
      detail: 'skeleton-unparseable: Pass A returned no parseable JSON object',
    });
    budget = applyApiCallBudgetEvent(budget, { type: 'courseMapCall', label: 'Course-map generation' });
    expect(budget.pipeline.nativeAuthoring).toContain('fell back to prose');
    expect(budget.pipeline.nativeAuthoring).toContain('skeleton-unparseable');
    expect(budget.recentEvents.some((event) => event.type === 'nativeAuthoringFellBack')).toBe(true);
    // The fallback event itself is NOT a provider call.
    expect(getApiCallBudgetTotal(budget)).toBe(1);
  });
});

// ── B3: Crucible pairing/delta helpers ──────────────────────────────────────

function fakeEntry({ id, baseId, authoring, overall, p0 = 0, p1 = 0, costUsd, durationMs, coverage }) {
  return {
    course: { id, baseId, authoring, title: baseId },
    runResult: {
      status: 'passed',
      spendUsd: costUsd,
      attemptsDurationMs: durationMs,
      digest: { gates: { enrichmentCoverage: coverage }, cost: { totalUsd: costUsd } },
    },
    gradeResult: { graded: true, overall, p0Count: p0, p1Count: p1 },
  };
}

describe('crucible --authoring helpers (B3)', () => {
  const courses = [
    { id: 'cs-python', title: 'CS', lessonCount: 15 },
    { id: 'geology', title: 'Geo', lessonCount: 14 },
  ];

  it('parseAuthoringFlag: default prose, validates values', () => {
    expect(parseAuthoringFlag(undefined)).toBe('prose');
    expect(parseAuthoringFlag(true)).toBe('prose');
    expect(parseAuthoringFlag('native')).toBe('native');
    expect(parseAuthoringFlag('BOTH')).toBe('both');
    expect(() => parseAuthoringFlag('hybrid')).toThrowError(/--authoring/);
  });

  it('expandCoursesForAuthoring: prose keeps run-dir naming exactly; both doubles with suffixes', () => {
    const prose = expandCoursesForAuthoring(courses, 'prose');
    expect(prose.map((course) => course.id)).toEqual(['cs-python', 'geology']);
    // v0.15.1 post-flip: plain rounds carry NO authoring tag — the driver
    // seeds nothing and the app default (native) applies.
    expect(prose[0]).toMatchObject({ baseId: 'cs-python' });
    expect(prose[0].authoring).toBeUndefined();

    const both = expandCoursesForAuthoring(courses, 'both');
    expect(both.map((course) => course.id)).toEqual([
      'cs-python--prose',
      'cs-python--native',
      'geology--prose',
      'geology--native',
    ]);
    expect(both[1]).toMatchObject({ baseId: 'cs-python', authoring: 'native', lessonCount: 15 });

    const native = expandCoursesForAuthoring(courses, 'native');
    expect(native.map((course) => course.id)).toEqual(['cs-python--native', 'geology--native']);
  });

  it('pairs entries by baseId and computes the acceptance-bar deltas', () => {
    const entries = [
      fakeEntry({
        id: 'cs-python--prose',
        baseId: 'cs-python',
        authoring: 'prose',
        overall: 100,
        costUsd: 0.12,
        durationMs: 150_000,
        coverage: 1,
      }),
      fakeEntry({
        id: 'cs-python--native',
        baseId: 'cs-python',
        authoring: 'native',
        overall: 99,
        costUsd: 0.08,
        durationMs: 80_000,
        coverage: 1,
      }),
      fakeEntry({
        id: 'geology--prose',
        baseId: 'geology',
        authoring: 'prose',
        overall: 100,
        costUsd: 0.1,
        durationMs: 140_000,
        coverage: 0.93,
      }),
      fakeEntry({
        id: 'geology--native',
        baseId: 'geology',
        authoring: 'native',
        overall: 96,
        p1: 2,
        costUsd: 0.095,
        durationMs: 120_000,
        coverage: 0.5,
      }),
    ];
    const pairs = pairAuthoringEntries(entries);
    expect(pairs.map((pair) => pair.courseId)).toEqual(['cs-python', 'geology']);

    const comparison = buildAuthoringComparison(pairs);
    const cs = comparison[0];
    expect(cs.scoreDelta).toBe(-1);
    expect(cs.scoreWithinTolerance).toBe(true); // within AUTHORING_SCORE_TOLERANCE (2)
    expect(cs.costDeltaPct).toBeCloseTo(-0.333, 2);
    expect(cs.costCutMet).toBe(true); // ≥ AUTHORING_COST_CUT_TARGET (20%) cut
    expect(cs.durationDeltaMs).toBe(-70_000);

    const geo = comparison[1];
    expect(geo.scoreDelta).toBe(-4);
    expect(geo.scoreWithinTolerance).toBe(false);
    expect(geo.costCutMet).toBe(false); // only a 5% cut

    expect(AUTHORING_SCORE_TOLERANCE).toBe(2);
    expect(AUTHORING_COST_CUT_TARGET).toBe(0.2);
  });

  it('handles partial pairs and missing digests without lying', () => {
    const lonely = pairAuthoringEntries([
      fakeEntry({ id: 'x--native', baseId: 'x', authoring: 'native', overall: 90, costUsd: 0.05, durationMs: 60_000 }),
    ]);
    const comparison = buildAuthoringComparison(lonely);
    expect(comparison[0].complete).toBe(false);
    expect(comparison[0].scoreDelta).toBeNull();
    expect(kernelCoverageFromDigest(null)).toBeNull();
    expect(kernelCoverageFromDigest({ gates: { enrichmentCoverage: 0.75 } })).toBe(0.75);
    expect(authoringEntryStats(null)).toBeNull();
    // Plain rounds (no authoring tags) pair to nothing — section renders empty.
    expect(pairAuthoringEntries([{ course: { id: 'plain' }, gradeResult: { overall: 1 } }])).toEqual([]);
    expect(renderAuthoringSection([])).toBe('');
  });

  it('renders the side-by-side section with paired columns and the delta block', () => {
    const entries = [
      fakeEntry({
        id: 'cs-python--prose',
        baseId: 'cs-python',
        authoring: 'prose',
        overall: 100,
        costUsd: 0.12,
        durationMs: 150_000,
        coverage: 1,
      }),
      fakeEntry({
        id: 'cs-python--native',
        baseId: 'cs-python',
        authoring: 'native',
        overall: 99,
        costUsd: 0.08,
        durationMs: 80_000,
        coverage: 1,
      }),
    ];
    const section = renderAuthoringSection(buildAuthoringComparison(pairAuthoringEntries(entries)));
    expect(section).toContain('## Authoring side-by-side (prose vs native)');
    expect(section).toContain('| cs-python | 100 → 99 | $0.12 → $0.08 | 150s → 80s | 100% → 100% | 0/0 | 0/0 |');
    expect(section).toContain('score -1 (within 2: yes)');
    expect(section).toContain('cost -33% (≥20% cut: yes)');
    expect(section).toContain('wall-clock −70s');
  });
});
