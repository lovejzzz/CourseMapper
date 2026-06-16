/**
 * v0147-texture-metric.test.js — WS-D D1 proof: templated-ness is MEASURABLE.
 *
 * The advisory judge has been scoring packages 5–6/10 for "too templated";
 * texture was never a scored dimension, so the refine loop never applied
 * pressure there. This suite proves the new deterministic texture metric
 * (src/lib/quality/textureMetric.js) and its weight-0 wiring into the deep
 * quality grader:
 *
 *   (1) Synthetic calibration — ten slot-varied stamps of one sentence
 *       template must score ≥20 points BELOW the same facts written with
 *       varied sentence structures and openers.
 *   (2) Grounding calibration — per-doc DISTINCT real reading anchors
 *       ("Anchor your post in Antigone…") must outrank the same docs with
 *       one identical generic anchor line; the generic template tail is
 *       quoted verbatim in the evidence.
 *   (3) Weight-0 invariance — on the same healthy geology fixture package
 *       the existing gate tests pin (≥85 overall, zero P0s), texture appears
 *       in scores/grades at weight 0 while the overall score recomputed
 *       WITHOUT texture is byte-identical, no finding carries the texture
 *       dimension, and severity counts are untouched by texture advisories.
 *   (4) Report rendering — the texture row appears in the dimension table
 *       with weight 0 and the overall weight sum stays 110.
 *
 * Calibrate before gating (the v0.14.3 trap): texture ships advisory-only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

import { computeTexture, maskSlots, buildTextureAdvisories } from '../src/lib/quality/textureMetric.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler';
import {
  buildBlueprintFromGraph,
  deriveCourseGraphFromCourseMap,
  renderCourseMapFromGraph,
} from '../src/lib/courseGraph';
import { buildCourseMaterialsZip } from '../src/lib/packageZipExporter.js';
import { buildRunDigest, formatRunDigest } from '../src/lib/runDigest.js';
import { formatEnrichmentOutcomeLabel } from '../src/lib/apiCallBudget.js';
import {
  grade,
  renderReportMarkdown,
  letterGrade,
  DIMENSION_WEIGHTS,
  GRADER_VERSION,
} from './lib/deepQualityGrader.js';

// ── (1) Synthetic calibration: stamps vs varied prose ───────────────────────

const TOPICS = [
  'minerals',
  'igneous rocks',
  'sedimentary rocks',
  'metamorphic rocks',
  'plate tectonics',
  'earthquakes',
  'volcanoes',
  'weathering',
  'glaciers',
  'groundwater',
];

// SET A: ONE sentence template family, ten stamps, only the slot word varies.
function templatedSet() {
  return TOPICS.map((topic, index) => ({
    id: `stamp-${index + 1}`,
    feature: 'lessonPlans',
    text: [
      `In this lesson, students will explore ${topic} through guided practice with the class set.`,
      `In this lesson, students will connect ${topic} to the weekly assessment so the rubric criteria stay visible.`,
      `In this lesson, students will reflect on ${topic} in a short journal entry before the next class meeting.`,
      `Use the rubric to guide the evidence you select for ${topic} in the graded artifact this week.`,
      `Use the rubric to check your work on ${topic} before submitting the assignment for instructor feedback.`,
    ].join(' '),
  }));
}

// SET B: the same facts (same topics, same rubric/assessment/journal beats),
// written the way ten different humans would write them.
const VARIED_WRITERS = [
  (topic) =>
    `Start with a hand sample tied to ${topic} and let the class argue about what they actually see. Nothing anchors a definition like a disagreement over evidence. By Friday each group defends one claim aloud. Keep the vocabulary list short because the specimens do the teaching this week.`,
  (topic) =>
    `Why should a city planner care about ${topic}? Open on that question and collect first hunches on the board. Lab data then gets a chance to embarrass those hunches. A two-line exit ticket closes the loop on the day's misconception.`,
  (topic) =>
    `Most students arrive convinced they already understand ${topic}, which is exactly the problem. Spend the first ten minutes surfacing what they think they know. The journal prompt asks where that belief came from. Grade generously here; the honesty is the point.`,
  (topic) =>
    `This week belongs to ${topic}, and the pacing is deliberately uneven. Linger on the worked example until the room goes quiet with attention. Rush nothing before the quiz. The rubric rewards a defensible chain of evidence over a tidy answer.`,
  (topic) =>
    `A field photo opens class: somewhere in it hides the signature of ${topic}. Whoever finds it must say how they knew. Small groups then swap photos and repeat the hunt. Journals capture the one clue they will look for next time.`,
  (topic) =>
    `Resist the urge to lecture through ${topic}; the dataset carries the argument better than slides do. Hand out the measurements cold. Ask what pattern refuses to go away. The weekly assessment simply asks them to name that pattern and defend it.`,
  (topic) =>
    `There is one mistake nearly everyone makes with ${topic}, and the lesson is built to trigger it early. Let the error happen in the warm-up. Name it together without ceremony. The rest of the period rebuilds the idea from the broken version.`,
  (topic) =>
    `Pair the strongest skeptic with the fastest believer when ${topic} hits the table. Their argument is the lesson plan. Your job is to referee with specimen evidence only. End on a silent minute where each student writes the sentence they would defend.`,
  (topic) =>
    `Today's quiz on ${topic} comes FIRST, before any instruction, and counts for nothing. The wrong answers become the agenda. Work backward from the most popular error to the principle it violates. Homework asks for one paragraph on what changed their mind.`,
  (topic) =>
    `Borrow five minutes from next week if ${topic} runs long; this is where the course usually loses people. Slow down at the diagram and ask for predictions before revealing each layer. Reward the prediction, not the accuracy. The journal entry is a letter to a confused friend.`,
];

function variedSet() {
  return TOPICS.map((topic, index) => ({
    id: `varied-${index + 1}`,
    feature: 'lessonPlans',
    text: VARIED_WRITERS[index](topic),
  }));
}

describe('D1(1) — synthetic calibration: slot-varied stamps vs varied prose', () => {
  it('scores the templated set ≥20 points below the varied set', () => {
    const templated = computeTexture(templatedSet(), { slotValues: TOPICS });
    const varied = computeTexture(variedSet(), { slotValues: TOPICS });

    expect(templated.measured).toBe(true);
    expect(varied.measured).toBe(true);
    expect(
      varied.score - templated.score,
      `templated=${JSON.stringify(templated.subScores)} varied=${JSON.stringify(varied.subScores)}`,
    ).toBeGreaterThanOrEqual(20);

    // The signals point the right way individually too.
    expect(templated.subScores.sameness).toBeLessThan(varied.subScores.sameness);
    expect(templated.subScores.openers).toBeLessThan(varied.subScores.openers);
    expect(templated.subScores.tails).toBeLessThan(varied.subScores.tails);

    // Worst evidence quotes the actual template, slot masked.
    expect(templated.evidence.length).toBeGreaterThan(0);
    expect(templated.evidence.length).toBeLessThanOrEqual(5);
    expect(templated.evidence[0].docCount).toBe(10);
    expect(templated.evidence.some((item) => /in this lesson students will|use the rubric/.test(item.shingle))).toBe(
      true,
    );

    // Advisory builder: P2-style, dimension texture, advisory-flagged.
    const advisories = buildTextureAdvisories(templated);
    expect(advisories.length).toBeGreaterThan(0);
    for (const advisory of advisories) {
      expect(advisory.severity).toBe('P2');
      expect(advisory.dimension).toBe('texture');
      expect(advisory.advisory).toBe(true);
    }
  });

  it('slot masking erases known slot values, capitalized runs, and digits', () => {
    const masked = maskSlots('Lesson 3 covers Igneous Rocks before the midterm on mineral identification.', [
      'mineral identification',
    ]);
    expect(masked).not.toMatch(/3/);
    expect(masked).not.toMatch(/Igneous Rocks/);
    expect(masked).not.toMatch(/mineral identification/i);
    // Single capitalized words survive — honest specificity is not masked.
    expect(maskSlots('Anchor your post in Antigone tonight.')).toContain('Antigone');
  });
});

// ── (2) Grounding calibration: distinct real anchors vs one generic anchor ──

const READING_TITLES = [
  'Antigone',
  'Beloved',
  'Hamlet',
  'Medea',
  'Macbeth',
  'Persepolis',
  'Frankenstein',
  'Candide',
  'Siddhartha',
  'Kindred',
];

// Varied surrounding prose, identical between the two sets per index — the
// ONLY difference is the anchor line.
const DISCUSSION_PROSE = [
  'Trace how fate gets framed before any character speaks of choice. The opening scene plants the argument you will need later. Bring one moment where the text undercuts its own warning.',
  'Memory behaves like a character of its own in this week’s pages. Notice which rooms the narration refuses to enter. Your claim should name the cost of that refusal.',
  'Delay is the engine here, not indecision. Track three places where action is available and declined. Say what each refusal purchases for the play.',
  'Rage gets the headlines, but watch the negotiations instead. Every bargain in the text prices a relationship. Choose the bargain you find least forgivable and argue the price.',
  'Prophecy works on the listener, not the future. Find the line where hearing the prediction changes the hearer. Your post should separate what was foretold from what was caused.',
  'The panels carry meaning the captions never admit. Pick one page where image and text disagree. Build your argument from that gap, not from the plot summary.',
  'Sympathy keeps switching addresses in this novel. Mark the exact paragraph where yours moved. Defend the craft choice that moved it, not the morality of the characters.',
  'Optimism takes a beating chapter after chapter, yet the prose stays light. Explain how the tone survives the body count. Quote a sentence where the comedy does serious work.',
  'The river teaches differently than the teachers do. Contrast one spoken lesson with one learned in silence. Your post should say which pedagogy the book finally trusts.',
  'Time travel here is not a device; it is an argument about inheritance. Identify what the protagonist cannot leave behind in either era. Ground the claim in a single scene.',
];

function groundedDiscussionSet({ generic }) {
  return READING_TITLES.map((title, index) => ({
    id: `discussion-${index + 1}`,
    feature: 'discussions',
    text: [
      DISCUSSION_PROSE[index],
      generic
        ? 'Anchor your post in the assigned reading for this week and quote one passage that supports your central claim.'
        : `Anchor your post in ${title} and quote one short passage.`,
    ].join(' '),
  }));
}

describe('D1(2) — grounding calibration: distinct anchors outrank generic anchors', () => {
  it('ranks per-doc real reading anchors above one identical generic anchor', () => {
    const distinct = computeTexture(groundedDiscussionSet({ generic: false }));
    const generic = computeTexture(groundedDiscussionSet({ generic: true }));

    expect(
      distinct.score,
      `distinct=${JSON.stringify(distinct.subScores)} generic=${JSON.stringify(generic.subScores)}`,
    ).toBeGreaterThan(generic.score);
    expect(distinct.subScores.sameness).toBeGreaterThan(generic.subScores.sameness);

    // The generic set's worst evidence quotes the shared anchor template.
    expect(generic.evidence.some((item) => /anchor your post in the assigned reading/.test(item.shingle))).toBe(true);
    // The distinct set carries no package-wide template tail at all.
    expect(distinct.evidence).toEqual([]);
  });
});

// ── (3)+(4) Weight-0 invariance + report row, on the real fixture package ───
// Mirrors the crucible-grader-proof healthy geology fixture and its pinned
// expectations (≥85 overall, ZERO P0s) — proving the texture dimension adds
// information without moving a single existing number.

const GEO_FEATURES = ['syllabus', 'lessonPlans', 'slideDecks', 'assignments', 'rubrics', 'quizBank', 'studyGuides'];
const GEO_COURSE = { id: 'geology', title: 'Physical Geology', featureIds: GEO_FEATURES };

function geologyCourseMap() {
  const topics = [
    ['Minerals', 'mineral identification'],
    ['Igneous Rocks', 'igneous textures'],
    ['Sedimentary Rocks', 'sedimentary environments'],
    ['Metamorphic Rocks', 'metamorphic grade'],
  ];
  return {
    courseName: 'Physical Geology',
    semester: 'Fall 2026',
    lessons: topics.map(([title, concept], index) => ({
      title: `Lesson ${index + 1}: ${title}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${title}`,
          learningGoals: `1. Build field-ready understanding of ${concept}.`,
          learningObjectives: `Analyze ${concept} using specimen evidence.\nEvaluate how ${concept} changes a field decision.`,
          weeklyAssessments: `Quiz: ${concept} problems`,
          asyncActivities: `Read the assigned chapter on ${title.toLowerCase()}.`,
          syncActivities: `Workshop: ${concept} case analysis.`,
          supportingResources: `OpenStax geology chapter on ${title.toLowerCase()}`,
        },
      ],
    })),
  };
}

function geologyTextureRegressionMap() {
  const topics = [
    ['Minerals', 'mineral identification'],
    ['Igneous Rocks', 'igneous textures'],
    ['Sedimentary Rocks', 'sedimentary environments'],
    ['Metamorphic Rocks', 'metamorphic grade'],
    ['Plate Tectonics', 'plate boundary evidence'],
    ['Earthquakes', 'seismic risk interpretation'],
    ['Volcanoes', 'eruption hazard evidence'],
    ['Groundwater', 'aquifer flow decisions'],
  ];
  return {
    courseName: 'Physical Geology',
    semester: 'Fall 2026',
    lessons: topics.map(([title, concept], index) => ({
      title: `Lesson ${index + 1}: ${title}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${title}`,
          learningGoals: `Build field-ready understanding of ${concept}.`,
          learningObjectives: `Analyze ${concept} using field evidence.\nEvaluate how ${concept} changes a local decision.`,
          weeklyAssessments: `${title} checkpoint with evidence, interpretation, and revision note.`,
          asyncActivities: `Read the assigned chapter on ${title.toLowerCase()} and annotate one example.`,
          syncActivities: `Workshop ${concept} with peer evidence checks and instructor debrief.`,
          supportingResources: `OpenStax geology chapter on ${title.toLowerCase()}; field photo set ${index + 1}`,
        },
      ],
    })),
  };
}

function countPhrase(haystack, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return haystack.match(new RegExp(escaped, 'g'))?.length || 0;
}

describe('D1(2b) — compiler prose texture regression guard', () => {
  it('keeps known stock phrases from becoming package-wide stamps again', () => {
    const blueprint = buildCourseBlueprint(geologyTextureRegressionMap());
    expect(blueprint.courseModalityProfile?.primaryMode).not.toBe('clinical-simulation');
    const compiled = compileBlueprintDeliverables(blueprint, [
      'lessonPlans',
      'slideDecks',
      'assignments',
      'rubrics',
      'courseFaq',
    ]);
    const text = JSON.stringify(compiled).toLowerCase();

    expect(countPhrase(text, 'brief peer check on the professional decision')).toBe(0);
    expect(countPhrase(text, 'checklist before submitting or discussing your work')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'checkpoint response with clear headings')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'one example is enough to prove')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'concise worked example that shows how')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'independent work with spot coaching')).toBeLessThanOrEqual(2);
  });
});

function healthyConsoleLog() {
  const digest = buildRunDigest({
    budget: {
      runId: 'run-geo-1',
      usageLedger: [],
      pipeline: {
        courseMap: 'compiled',
        genomeLinker: '2 genome + 0 cached of 4 lessons (8 concepts, 6 citations, 1 bridges)',
        enrichmentModelStage: 'ran',
        judgment: 'no gaps across 8 linked concepts',
      },
    },
    exportVerification: { status: 'passed', checked: 12, failed: 0, warningCount: 0, checks: [] },
    finish: { finalStatus: 'ready', blockers: 0, warnings: 0, repairsApplied: 0, retryCallCount: 0 },
    generation: { provider: 'anthropic', lessonCount: 4, featureIds: GEO_FEATURES },
  });
  const enrichment = formatEnrichmentOutcomeLabel({
    modelStage: 'ran',
    enrichedLessons: 4,
    requestedLessons: 4,
    missingLessons: [],
  });
  return [
    formatRunDigest(digest),
    `[CM][API] genomeLink {"label":"CurriculumOS linker","detail":"2 genome + 0 cached of 4 lessons (8 concepts, 6 citations, 1 bridges)"}`,
    `[CM][API] pipelineDecision {"label":"Course judgment","detail":"no gaps across 8 linked concepts"}`,
    `[CM][FINISH][finish-x] export_verify_done {"checked":12,"failed":0}`,
    `2/4 lessons genome-linked · 6 cited open resources`,
    `enrichment: ${enrichment}`,
    `[CM][DIGEST] ${JSON.stringify(digest)}`,
  ].join('\n');
}

function healthyDigest() {
  return buildRunDigest({
    budget: { runId: 'run-geo-1', usageLedger: [], pipeline: { genomeLinker: '2 genome + 0 cached of 4 lessons' } },
    exportVerification: { status: 'passed', checked: 12, failed: 0, warningCount: 0, checks: [] },
    finish: { finalStatus: 'ready', blockers: 0, warnings: 0 },
    generation: { provider: 'anthropic', lessonCount: 4, featureIds: GEO_FEATURES },
  });
}

describe('D1(3)+(4) — weight-0 invariance and the report row on a real package', () => {
  let healthyDir;
  let result;

  beforeAll(async () => {
    const context = { font: '', measureText: (text) => ({ width: String(text || '').length * 7 }) };
    globalThis.OffscreenCanvas = class OffscreenCanvas {
      getContext() {
        return context;
      }
    };
    const courseMap = geologyCourseMap();
    const graph = deriveCourseGraphFromCourseMap(courseMap);
    const blueprint = buildBlueprintFromGraph(graph);
    const compiled = compileBlueprintDeliverables(blueprint, GEO_FEATURES);
    const deliverables = {};
    for (const featureId of GEO_FEATURES) {
      deliverables[featureId] = { status: 'done', data: compiled[featureId] };
    }
    const { blob } = await buildCourseMaterialsZip({
      courseMap: renderCourseMapFromGraph(graph, { assessmentReferences: true }),
      courseName: 'Physical Geology',
      deliverables,
      featureIds: ['courseMap', ...GEO_FEATURES],
      courseGraph: graph,
    });
    healthyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v0147-texture-'));
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    for (const name of Object.keys(zip.files)) {
      const entry = zip.files[name];
      if (entry.dir) continue;
      const dest = path.join(healthyDir, name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, await entry.async('nodebuffer'));
    }
    result = await grade({
      extractedDir: healthyDir,
      consoleLogText: healthyConsoleLog(),
      digest: healthyDigest(),
      course: GEO_COURSE,
    });
  }, 120000);

  afterAll(() => {
    if (healthyDir) fs.rmSync(healthyDir, { recursive: true, force: true });
  });

  it('keeps every pre-texture weight and pins texture at WEIGHT 0', () => {
    expect(GRADER_VERSION).toBe('1.4.0');
    expect(DIMENSION_WEIGHTS).toEqual({
      identity: 20,
      substance: 20,
      citations: 15,
      honesty: 15,
      discipline: 15,
      consistency: 10,
      structure: 10,
      format: 5,
      texture: 0,
    });
  });

  it('matches the existing gate expectations and is byte-identical without texture', () => {
    // The exact pins crucible-grader-proof asserts on this fixture.
    expect(result.findings.filter((finding) => finding.severity === 'P0')).toEqual([]);
    expect(result.overall.score, JSON.stringify(result.scores)).toBeGreaterThanOrEqual(85);
    expect(result.scores.identity).toBeGreaterThanOrEqual(85);
    expect(result.scores.substance).toBe(100);

    // Recompute the overall WITHOUT the texture dimension: at weight 0 the
    // result must be byte-identical — texture can never move the needle.
    const legacy = Object.entries(DIMENSION_WEIGHTS).filter(([dimension]) => dimension !== 'texture');
    const totalWeight = legacy.reduce((sum, [, weight]) => sum + weight, 0);
    expect(totalWeight).toBe(110);
    const recomputed = Math.round(
      legacy.reduce((sum, [dimension, weight]) => sum + result.scores[dimension] * weight, 0) / totalWeight,
    );
    expect(result.overall.score).toBe(recomputed);
  });

  it('scores texture from the metric, never from findings, and counts no advisory in p0/p1/p2', () => {
    expect(typeof result.scores.texture).toBe('number');
    expect(result.scores.texture).toBeGreaterThanOrEqual(0);
    expect(result.scores.texture).toBeLessThanOrEqual(100);
    expect(result.grades.texture).toBe(letterGrade(result.scores.texture));
    expect(result.texture.score).toBe(result.scores.texture);
    expect(result.texture.measured).toBe(true);
    expect(Object.keys(result.texture.subScores).sort()).toEqual(['openers', 'sameness', 'tails']);

    // The hard requirement: texture NEVER reaches the findings list, so it
    // can never subtract points or shift a severity count.
    expect(result.findings.filter((finding) => finding.dimension === 'texture')).toEqual([]);
    expect(result.stats.byDimension.texture).toBe(0);
    const severities = { p0: 'P0', p1: 'P1', p2: 'P2' };
    for (const [key, severity] of Object.entries(severities)) {
      expect(result.stats[key]).toBe(result.findings.filter((finding) => finding.severity === severity).length);
    }
    for (const advisory of result.texture.advisories) {
      expect(advisory.severity).toBe('P2');
      expect(advisory.dimension).toBe('texture');
      expect(advisory.advisory).toBe(true);
    }
    expect(result.texture.evidence.length).toBeLessThanOrEqual(5);
  });

  it('renders the texture row in the dimension table at weight 0, sum unchanged', () => {
    const md = renderReportMarkdown(result, { courseTitle: 'Physical Geology' });
    // Existing rows and header are untouched…
    expect(md).toContain('| Dimension | Weight | Score | Grade |');
    expect(md).toContain('| identity | 20 |');
    expect(md).toContain('| format | 5 |');
    // …the texture row is ADDED with weight 0…
    expect(md).toContain(`| texture | 0 | ${result.scores.texture} | ${result.grades.texture} |`);
    // …and the overall weight sum stays 110 (texture contributes nothing).
    expect(md).toContain(`| **overall** | 110 | **${result.overall.score}** | **${result.overall.grade}** |`);
  });
});
