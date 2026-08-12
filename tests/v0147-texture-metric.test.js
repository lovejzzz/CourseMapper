/**
 * v0147-texture-metric.test.js — WS-D D1 proof: templated-ness is MEASURABLE.
 *
 * The advisory judge has been scoring packages 5–6/10 for "too templated";
 * texture was never a scored dimension, so the refine loop never applied
 * pressure there. This suite proves the new deterministic texture metric
 * (src/lib/quality/textureMetric.js) and its light-weight wiring into the deep
 * quality grader:
 *
 *   (1) Synthetic calibration — ten slot-varied stamps of one sentence
 *       template must score ≥20 points BELOW the same facts written with
 *       varied sentence structures and openers.
 *   (2) Grounding calibration — per-doc DISTINCT real reading anchors
 *       ("Anchor your post in Antigone…") must outrank the same docs with
 *       one identical generic anchor line; the generic template tail is
 *       quoted verbatim in the evidence.
 *   (3) Scored wiring — on the same healthy geology fixture package
 *       the existing gate tests pin (≥85 overall, zero P0s), texture appears
 *       in scores/grades with a small weight and low texture becomes a real
 *       finding while legacy advisories remain separate.
 *   (4) Report rendering — the texture row appears in the dimension table
 *       with weight 25 and the overall weight sum is 135.
 *
 * Calibrated before gating (the v0.14.3 trap): texture is now lightly scored.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

import {
  computeTexture,
  computeVisibleUnitTexture,
  evaluateVisibleUnitTexture,
  maskSlots,
  buildTextureAdvisories,
  buildVisibleUnitTextureAdvisories,
  normalizeTextureText,
  VISIBLE_UNIT_MIN_WORDS,
} from '../src/lib/quality/textureMetric.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler';
import { lessonPlanIndependentInstructorRole } from '../src/lib/courseCompilerTextureCopy.js';
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
    const resourceMasked = maskSlots(
      'Use Required Assets/AUTHENTIC_LANGUAGE_DATA.csv and AUTHENTIC_LANGUAGE_DATA_GUIDE.md to compare the two records.',
    );
    expect(resourceMasked).not.toMatch(/AUTHENTIC_LANGUAGE_DATA/i);
    expect(resourceMasked).toContain('to compare the two records');
  });

  it('strips export structure labels while preserving repeated body prose for the judge', () => {
    const normalized = normalizeTextureText(
      [
        'Scoring Guidance Full credit requires evidence and a limitation.',
        'Rubric',
        'Beginning Lists ideas without source evidence.',
        'License and attribution: CC BY-SA 4.0 · Example Press metadata.',
        'Admitted visual specimen and attribution record for Composition; open photographic example.',
        'Active learning lowers failure rates across STEM disciplines (Freeman et al., 2014). doi:10.1073/pnas.1319030111',
      ].join('\n'),
    );

    expect(normalized).toContain('Full credit requires evidence and a limitation.');
    expect(normalized).toContain('Lists ideas without source evidence.');
    expect(normalized).not.toContain('Scoring Guidance');
    expect(normalized).not.toMatch(/^Rubric$/m);
    expect(normalized).not.toContain('Freeman et al.');
    expect(normalized).not.toContain('doi:');
    expect(normalized).not.toContain('License and attribution');
    expect(normalized).not.toContain('Admitted visual specimen');

    const labeledStamp = computeTexture(
      Array.from({ length: 5 }, (_, index) => ({
        id: `doc-${index}`,
        feature: 'rubrics',
        text: normalizeTextureText(
          `Scoring Guidance Full credit requires evidence and a limitation.\nBeginning Lists ideas without source evidence.`,
        ),
      })),
    );
    expect(labeledStamp.evidence.some((item) => /full credit requires evidence/.test(item.shingle))).toBe(true);
  });

  it('excludes locator-only package resource rows while measuring directions around them', () => {
    const normalized = normalizeTextureText(
      [
        'Required Assets/AUTHENTIC_LANGUAGE_DATA.csv and AUTHENTIC_LANGUAGE_DATA_GUIDE.md',
        'Use Required Assets/AUTHENTIC_LANGUAGE_DATA.csv to compare the selected records and explain the sampling limit.',
      ].join('\n'),
    );

    expect(normalized).not.toMatch(/^Required Assets\/AUTHENTIC_LANGUAGE_DATA\.csv and/m);
    expect(normalized).toContain('compare the selected records and explain the sampling limit');
  });

  it('measures quiz stem openers after removing question badges and Bloom metadata', () => {
    const normalized = normalizeTextureText(
      [
        'Q1 (Multiple choice, 2 pts, ~2 min): Classify C4–E♭4 from its spelling and semitone span.',
        'Q1: (Apply, Easy)',
        'Q2 (Multiple choice, 2 pts, ~2 min): Verify D4–F♯4 by counting semitones.',
        'Q2: (Analyze, Medium)',
        'Q3 (Multiple choice, 2 pts, ~2 min): Explain why the endpoint letters establish the generic number.',
        'Q4 (Multiple choice, 2 pts, ~2 min): Compare a minor third with an augmented second.',
      ].join('\n'),
    );

    expect(normalized).not.toMatch(/Q\d|Multiple choice|\(Apply, Easy\)|\(Analyze, Medium\)/i);
    expect(normalized).toContain('Classify C4–E♭4');
    expect(normalized).toContain('Verify D4–F♯4');
    expect(computeTexture([{ id: 'quiz', feature: 'quizBank', text: normalized }]).subScores.openers).toBe(100);
  });

  it('measures answer-key prose after removing answer badges and bound locator prefixes', () => {
    const normalized = normalizeTextureText(
      [
        'Q1 (ANALYZE, MEDIUM) · ANSWER — B — Evidence basis: Locate the visible relation before interpreting it.',
        'Q2 (ANALYZE, MEDIUM) · ANSWER — C — Evidence basis: Compare the two encoded entities before transferring the claim.',
        'CM-SRC-L01 identifies the evidence path before the decision.',
        'CM-SRC-L02 challenges the inference with a changed condition.',
      ].join('\n'),
    );

    expect(normalized).not.toMatch(/Q\d|ANALYZE|ANSWER|Evidence basis/i);
    expect(normalized).toContain('Locate the visible relation');
    expect(computeTexture([{ id: 'quiz-key', feature: 'quizBank', text: normalized }]).subScores.openers).toBe(100);
  });

  it('preserves real sentence leads while masking the following capitalized slot', () => {
    const masked = maskSlots(
      [
        'Upload Week Three Comparison through the course site.',
        'Organize Week Three Comparison so each criterion is easy to locate.',
        'Final Week Three Comparison should retain its evidence labels.',
        'Strong Week Three Comparison evidence names the deciding feature.',
        'Visual Hierarchy remains a masked lesson identity.',
      ].join('\n'),
    );

    expect(masked).toMatch(/^Upload\s+xslotx/m);
    expect(masked).toMatch(/^Organize\s+xslotx/m);
    expect(masked).toMatch(/^Final\s+xslotx/m);
    expect(masked).toMatch(/^Strong\s+xslotx/m);
    expect(masked).not.toContain('Visual Hierarchy');
  });

  it('ignores repeated lesson document titles and page footers as export chrome', () => {
    const normalized = normalizeTextureText(
      [
        'Interval Evidence Studio - Lesson 01 - Written and Heard Interval Classification',
        'Lesson 1: Written and Heard Interval Classification',
        'Students compare the pitch spelling before they count semitones.',
        'Interval Evidence Studio - Lesson 01 - Written and Heard Interval Classification — Lesson Plans Page of',
      ].join('\n'),
    );

    expect(normalized).toBe('Students compare the pitch spelling before they count semitones.');
  });

  it('ignores lesson schedule and Bloom ledgers without hiding repeated instructional prose', () => {
    const schedule = [
      'LESSON PLANS',
      'Lesson 1: Evidence Workshop',
      '75 MINUTES · WEEK 1',
      "Bloom's Levels: Remember, Understand, Apply, Analyze, Evaluate, Create",
      'LEARNING OBJECTIVES',
      'WARM-UP',
      'Retrieval and framing · 10 minutes',
      'SESSION OUTLINE',
      'Time',
      'Activity',
      'Description & Notes',
      '9 minutes',
      'Misconception poll · Warm-up · Bloom: Apply',
    ];
    const variedPlans = VARIED_WRITERS.slice(0, 8).map((write, index) => ({
      id: `plan-${index + 1}`,
      feature: 'lessonPlans',
      text: [...schedule, write(TOPICS[index])].join('\n'),
    }));
    const varied = computeTexture(variedPlans, { slotValues: TOPICS });
    const evidence = varied.evidence.map((item) => item.shingle).join('\n');

    expect(evidence).not.toMatch(/minutes week|bloom|misconception poll warm-up/i);
    expect(normalizeTextureText(schedule.join('\n'))).toBe('');

    const repeated = computeTexture(
      variedPlans.map((doc) => ({
        ...doc,
        text: `${doc.text}\nStudents compare the same evidence checklist, defend one claim, identify one limitation, and record one revision before leaving class.`,
      })),
      { slotValues: TOPICS },
    );
    expect(repeated.evidence.some((item) => /compare the same evidence checklist/.test(item.shingle))).toBe(true);
  });

  it('ignores assignment ledger metadata while still catching repeated assignment body prose', () => {
    const ledgerOnly = computeTexture(
      Array.from({ length: 12 }, (_, index) => ({
        id: `assignment-ledger-${index + 1}`,
        feature: 'assignments',
        text: normalizeTextureText(
          [
            `Prototype brief ${index + 1}`,
            `Create · Week ${index + 1} · 4 hours including class time · 100 pts · 8% · Course Map L${index + 1} · A${index + 1}.1 · 8%`,
            `Students produce a different local artifact for studio milestone ${index + 1}.`,
          ].join('\n'),
        ),
      })),
    );

    expect(ledgerOnly.evidence.some((item) => /course map|pts|week/.test(item.shingle))).toBe(false);

    const repeatedBody = computeTexture(
      Array.from({ length: 12 }, (_, index) => ({
        id: `assignment-body-${index + 1}`,
        feature: 'assignments',
        text: normalizeTextureText(
          [
            `Create · Week ${index + 1} · 4 hours including class time · 100 pts · 8% · Course Map L${index + 1} · A${index + 1}.1 · 8%`,
            'Students submit the same evidence checklist with one source detail, one decision claim, one limitation, and one revision note before studio critique.',
          ].join('\n'),
        ),
      })),
    );

    expect(
      repeatedBody.evidence.some((item) => /same evidence checklist|decision claim one limitation/.test(item.shingle)),
    ).toBe(true);
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

describe('D1(1b) — reader-visible unit occurrence metric', () => {
  const asDocs = (lines, feature = 'lessonPlans') =>
    lines.map((text, index) => ({ id: `${feature}-${index + 1}.docx`, feature, text }));

  it('catches a noun-swapped mail-merge frame that exact matching misses', () => {
    const slots = ['volcanic hazards', 'coastal erosion', 'groundwater contamination'];
    const docs = asDocs(
      slots.map(
        (slot) => `Use the ${slot} evidence packet to justify one bounded decision before the class discussion.`,
      ),
      'courseFaq',
    );
    const result = computeVisibleUnitTexture(docs, slots);

    expect(VISIBLE_UNIT_MIN_WORDS).toBe(8);
    expect(result.exact.extraDuplicateCount).toBe(0);
    expect(result.skeleton.extraDuplicateCount).toBe(2);
    expect(result.skeleton.extraDuplicateRate).toBeCloseTo(2 / 3);
    expect(result.skeleton.readerExposureRate).toBe(1);
    expect(result.skeleton.topClusters[0].locations).toEqual([
      { file: 'courseFaq-1.docx', unit: 1 },
      { file: 'courseFaq-2.docx', unit: 1 },
      { file: 'courseFaq-3.docx', unit: 1 },
    ]);
  });

  it('does not collapse genuinely different instructional moves after masking a shared slot', () => {
    const slot = 'coastal erosion';
    const result = computeVisibleUnitTexture(
      asDocs([
        `Compare the ${slot} case with a second shoreline and defend which evidence changes the decision.`,
        `Build a dated ${slot} process model, test its weakest causal link, and record the unresolved uncertainty.`,
        `Interview two stakeholders about ${slot}, map their competing constraints, and propose a reversible next step.`,
      ]),
      [slot],
    );

    expect(result.skeleton.clusterCount).toBe(0);
    expect(result.skeleton.extraDuplicateRate).toBe(0);
  });

  it('uses declared slots without harvesting arbitrary lowercase titles from body text', () => {
    const lines = [
      'Use the volcanic hazards evidence packet to justify one bounded decision before the class discussion.',
      'Use the coastal erosion evidence packet to justify one bounded decision before the class discussion.',
    ];
    const withoutManifestSlots = computeVisibleUnitTexture(asDocs(lines));
    const withManifestSlots = computeVisibleUnitTexture(asDocs(lines), ['volcanic hazards', 'coastal erosion']);

    expect(withoutManifestSlots.skeleton.clusterCount).toBe(0);
    expect(withManifestSlots.skeleton.clusterCount).toBe(1);
  });

  it('excludes structural chrome and short units before applying both pinned rate formulas', () => {
    const repeatedA = 'Students compare the source evidence before choosing a bounded conclusion for revision.';
    const repeatedB = 'Teams test the proposed interpretation against one counterexample before revising their claim.';
    const result = computeVisibleUnitTexture(
      asDocs([
        `Rubric\nShort note here\n${repeatedA}`,
        repeatedA,
        repeatedA,
        repeatedB,
        repeatedB,
        'Learners construct a distinct causal diagram and annotate the uncertainty in each connection.',
      ]),
    );

    expect(result.eligibleUnitCount).toBe(6);
    expect(result.exact.uniqueUnitCount).toBe(3);
    expect(result.exact.clusterCount).toBe(2);
    expect(result.exact.extraDuplicateCount).toBe(3);
    expect(result.exact.extraDuplicateRate).toBe(0.5);
    expect(result.exact.readerExposureCount).toBe(5);
    expect(result.exact.readerExposureRate).toBeCloseTo(5 / 6);
  });

  it('treats the repeated graded-work field label as rubric chrome, not prose', () => {
    const result = computeVisibleUnitTexture(
      asDocs(
        [
          'Graded Student Work: Evidence explanation: Linguistic Evidence Foundations',
          'Graded Student Work: Evidence explanation: Phonetic Observation',
          'Students justify one analysis from observable forms and name the evidence boundary.',
        ],
        'rubrics',
      ),
      ['Linguistic Evidence Foundations', 'Phonetic Observation'],
    );

    expect(result.eligibleUnitCount).toBe(1);
    expect(result.skeleton.extraDuplicateCount).toBe(0);
  });

  it('reports deterministic per-family clusters and locations', () => {
    const docs = [
      ...asDocs(
        [
          'Students annotate the supplied claim before identifying one evidence limit in their response.',
          'Students annotate the supplied claim before identifying one evidence limit in their response.',
        ],
        'discussions',
      ),
      ...asDocs(
        [
          'Use the grading criteria to revise one decision and explain the evidence behind it.',
          'Use the grading criteria to revise one decision and explain the evidence behind it.',
        ],
        'assignments',
      ),
    ];
    const first = computeVisibleUnitTexture(docs);
    const second = computeVisibleUnitTexture(docs);

    expect(second).toEqual(first);
    expect(first.families.map((family) => family.feature)).toEqual(['assignments', 'discussions']);
    expect(first.families.every((family) => family.exact.extraDuplicateCount === 1)).toBe(true);
    expect(first.exact.topClusters.flatMap((cluster) => cluster.locations)).toEqual(
      expect.arrayContaining([
        { file: 'assignments-1.docx', unit: 1 },
        { file: 'discussions-2.docx', unit: 1 },
      ]),
    );
  });

  it('makes calibrated lesson-plan repetition score-bearing', () => {
    const repeated = 'Provide targeted feedback on the weekly analysis and confirm readiness for submission.';
    const docs = asDocs([
      ...Array.from({ length: 16 }, () => repeated),
      ...Array.from(
        { length: 34 },
        (_, index) =>
          `Coach learners to test marker${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + (index % 26))} as an evidence boundary and record the resulting revision decision.`,
      ),
    ]);
    const evaluation = evaluateVisibleUnitTexture(computeVisibleUnitTexture(docs));
    const lessonPlans = evaluation.families.find((family) => family.family === 'lessonPlans');

    expect(evaluation).toMatchObject({
      policyVersion: 'visible-units.v2',
      evaluated: true,
      severity: 'P1',
      scorePenalty: 8,
    });
    expect(lessonPlans).toMatchObject({ evaluated: true, severity: 'P1', scorePenalty: 8 });
    expect(lessonPlans.observedRate).toBeCloseTo(15 / 50);
  });

  it('makes rubric repetition score-bearing instead of merely reportable', () => {
    const repeated = 'Use the grading criteria to revise one decision and explain the evidence behind it.';
    const evaluation = evaluateVisibleUnitTexture(
      computeVisibleUnitTexture(
        asDocs(
          Array.from({ length: 50 }, () => repeated),
          'rubrics',
        ),
      ),
    );

    expect(evaluation.families.find((family) => family.family === 'rubrics')).toMatchObject({
      eligibleUnitCount: 50,
      evaluated: true,
      severity: 'P1',
      scorePenalty: 8,
    });
    expect(evaluation.scorePenalty).toBe(8);
  });

  it('makes assignment repetition score-bearing at an ordinary-course sample size', () => {
    const repeated = 'Use the grading criteria to revise one decision and explain the evidence behind it.';
    const evaluation = evaluateVisibleUnitTexture(
      computeVisibleUnitTexture(
        asDocs(
          Array.from({ length: 8 }, () => repeated),
          'assignments',
        ),
      ),
    );

    expect(evaluation.families.find((family) => family.family === 'assignments')).toMatchObject({
      eligibleUnitCount: 8,
      evaluated: true,
      severity: 'P1',
      scorePenalty: 8,
    });
    expect(evaluation.scorePenalty).toBe(8);
  });

  it('reports repeated families separately but charges the strongest penalty once', () => {
    const repeated = 'Use the grading criteria to revise one decision and explain the evidence behind it.';
    const docs = ['lessonPlans', 'assignments', 'rubrics'].flatMap((feature) =>
      asDocs(
        Array.from({ length: 12 }, () => repeated),
        feature,
      ),
    );
    const evaluation = evaluateVisibleUnitTexture(computeVisibleUnitTexture(docs));

    expect(evaluation.families.filter((family) => family.severity === 'P1')).toHaveLength(3);
    expect(evaluation.scorePenalty).toBe(8);
  });

  it('does not penalize lesson-plan families below the calibrated rate', () => {
    const repeated = 'Provide targeted feedback on the weekly analysis and confirm readiness for submission.';
    const docs = asDocs([
      ...Array.from({ length: 7 }, () => repeated),
      ...Array.from(
        { length: 43 },
        (_, index) =>
          `Ask learners to inspect marker${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + (index % 26))} as a source cue and justify one bounded next step.`,
      ),
    ]);
    const evaluation = evaluateVisibleUnitTexture(computeVisibleUnitTexture(docs));

    expect(evaluation.evaluated).toBe(true);
    expect(evaluation.families.find((family) => family.family === 'lessonPlans').observedRate).toBeCloseTo(6 / 50);
    expect(evaluation.severity).toBeNull();
    expect(evaluation.scorePenalty).toBe(0);
  });

  it('pins the eligibility and severity boundaries', () => {
    const evaluationFor = (eligible, repeated) => {
      const repeatedLine = 'Provide targeted feedback on the weekly analysis and confirm readiness for submission.';
      const docs = asDocs([
        ...Array.from({ length: repeated }, () => repeatedLine),
        ...Array.from({ length: eligible - repeated }, (_, index) => {
          const marker = `marker${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + (index % 26))}`;
          return `Ask learners to inspect ${marker} as a source cue and justify one bounded next step.`;
        }),
      ]);
      return evaluateVisibleUnitTexture(computeVisibleUnitTexture(docs));
    };

    const belowFloor = evaluationFor(11, 6);
    expect(belowFloor).toMatchObject({ evaluated: false, severity: null, scorePenalty: 0 });
    expect(buildVisibleUnitTextureAdvisories(belowFloor)).toEqual([
      expect.objectContaining({
        advisory: true,
        severity: 'P2',
        detail: expect.stringMatching(/11 eligible units.*12-unit floor/),
      }),
    ]);
    expect(evaluationFor(20, 4).families[0]).toMatchObject({ evaluated: true, observedRate: 0.15, severity: 'P2' });
    expect(evaluationFor(20, 6).families[0]).toMatchObject({ observedRate: 0.25, severity: 'P2' });
    expect(evaluationFor(20, 7).families[0]).toMatchObject({ observedRate: 0.3, severity: 'P1' });
  });
});

describe('V0.17.04 — lesson-plan instructor-role realization', () => {
  it('composes course-sensitive coaching instead of stamping one submission sentence', () => {
    const lens = {
      evidenceNoun: 'source evidence',
      decisionNoun: 'interpretive decision',
    };
    const outputs = Array.from({ length: 16 }, (_, index) =>
      lessonPlanIndependentInstructorRole({
        lesson: { id: `L${index + 1}`, lessonNumber: index + 1, title: `Evidence boundary ${index + 1}` },
        lens,
        concept: `concept ${index + 1}`,
        artifact: `analysis ${index + 1}`,
      }),
    );

    expect(new Set(outputs).size).toBeGreaterThanOrEqual(8);
    expect(
      outputs.some((line) => /^Provide targeted feedback on .* and confirm readiness for submission\.$/.test(line)),
    ).toBe(false);
    expect(outputs.every((line) => /evidence|criterion|claim|decision|revision|limitation|coach/i.test(line))).toBe(
      true,
    );
  });
});

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
          learningObjectives: `Analyze ${concept} using published open-license diagram evidence.\nEvaluate how ${concept} changes a field decision.`,
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

function projectManagementTextureRegressionMap() {
  const topics = [
    'Project charter',
    'Stakeholder analysis',
    'Scope definition',
    'Work breakdown structure',
    'Schedule baseline',
    'Critical path',
    'Cost baseline',
    'Risk register',
    'Communication plan',
    'Change control',
    'Agile integration',
    'Closeout presentation',
  ];
  return {
    courseName: 'Project Management',
    semester: 'Fall 2026',
    lessons: topics.map((title, index) => ({
      title: `Lesson ${index + 1}: ${title}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${title}`,
          learningGoals: `Build project management skill for ${title.toLowerCase()} with sponsor constraints and milestone evidence.`,
          learningObjectives: `Analyze sponsor constraints using project evidence.\nDefend the next project milestone decision.`,
          weeklyAssessments: `${title} milestone brief with project charter evidence and risk review.`,
          asyncActivities: `Review assigned project documents and annotate sponsor constraints for ${title.toLowerCase()}.`,
          syncActivities: `Run project team review of milestone evidence, risks, and next deliverables for ${title.toLowerCase()}.`,
          supportingResources: `Project charter; PMBOK-style project management notes; sponsor brief ${index + 1}`,
        },
      ],
    })),
  };
}

function uxDesignTextureRegressionMap() {
  const topics = [
    'UX problem framing and studio orientation',
    'Design research planning',
    'User interviews and synthesis',
    'Personas and journey mapping',
    'Information architecture',
    'Interaction flows',
    'Wireframing',
    'Prototype critique',
    'Usability testing',
    'Accessibility review',
    'Portfolio case study',
    'Final studio presentation',
  ];
  return {
    courseName: 'User Experience Design Studio',
    semester: 'Fall 2026',
    lessons: topics.map((title, index) => ({
      title: `Lesson ${index + 1}: ${title}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${title}`,
          learningGoals: `Build studio-ready skill for ${title.toLowerCase()} with user evidence, critique notes, and prototype revision.`,
          learningObjectives: `Analyze ${title.toLowerCase()} using design evidence.\nRevise a UX artifact based on critique and user behavior.`,
          weeklyAssessments: `${title} studio artifact with critique evidence and revision rationale.`,
          asyncActivities: `Review assigned design examples and annotate user behavior for ${title.toLowerCase()}.`,
          syncActivities: `Run critique and prototype review for ${title.toLowerCase()} using user evidence and next-step revision notes.`,
          supportingResources: `UX methods note; studio critique checklist; prototype example ${index + 1}`,
        },
      ],
    })),
  };
}

function worldLiteratureTextureRegressionMap() {
  const topics = [
    'World Literature Scope',
    'Oral Epic Tradition',
    'Homeric Epic',
    'Classical Drama',
    'Tang Poetry',
    'Frame Narratives',
    'Medieval Journey Narrative',
    'Comparative Reading Methods',
    'Postcolonial Literature',
    'Magical Realism',
    'Modernist Poetry',
    'Fantastic Library',
    'Contemporary Fiction',
    'Course Synthesis',
  ];
  return {
    courseName: 'World Literature',
    semester: 'Fall 2026',
    lessons: topics.map((title, index) => ({
      title: `Lesson ${index + 1}: ${title}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${title}`,
          learningGoals: `Interpret ${title.toLowerCase()} through textual evidence and comparative context.`,
          learningObjectives: `Analyze a passage using ${title.toLowerCase()}.\nDefend an interpretation while naming its limits.`,
          weeklyAssessments: `${title} close-reading note with a passage, interpretive claim, and qualification.`,
          asyncActivities: `Read the assigned ${title.toLowerCase()} selection and annotate one consequential passage.`,
          syncActivities: `Compare interpretations of ${title.toLowerCase()} and revise one claim from textual evidence.`,
          supportingResources: `Assigned world-literature text; translation note; close-reading guide ${index + 1}`,
        },
      ],
    })),
  };
}

function countPhrase(haystack, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return haystack.match(new RegExp(escaped, 'g'))?.length || 0;
}

function countNormalizedPhrase(haystack, phrase) {
  return countPhrase(normalizeTextureText(haystack), normalizeTextureText(phrase));
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
      'discussions',
      'quizBank',
      'courseFaq',
    ]);
    const text = JSON.stringify(compiled).toLowerCase();

    expect(countPhrase(text, 'brief peer check on the professional decision')).toBe(0);
    expect(countPhrase(text, 'checklist before submitting or discussing your work')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'checkpoint response with clear headings')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'one example is enough to prove')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'concise worked example that shows how')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'independent work with spot coaching')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'a heading to copy')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'a limitation and avoids invented source detail')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'acknowledge a limitation or risk')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'a decision tool for the')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'as a label without showing what evidence makes it')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'limitation that would sharpen')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'bias check: check whether')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'use feedback to improve')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'marked revision, not just a conversation')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'memo, annotated outline')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'a next step that is feasible')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'extending, questioning, or refining')).toBeLessThanOrEqual(2);
    expect(countPhrase(text, 'apply the lesson concepts to a new scenario')).toBeLessThanOrEqual(2);
    expect(
      countNormalizedPhrase(text, 'a scorer can point to where it is satisfied and how it strengthens the work'),
    ).toBeLessThanOrEqual(2);
    expect(
      countNormalizedPhrase(text, 'turn into an observable performance target ask students what evidence would prove'),
    ).toBeLessThanOrEqual(2);
    expect(
      countNormalizedPhrase(text, 'a strong answer also names one limitation or alternative reading'),
    ).toBeLessThanOrEqual(2);
  });

  it('varies the latest Project Management package-wide texture stamps', () => {
    const blueprint = buildCourseBlueprint(projectManagementTextureRegressionMap());
    expect(blueprint.courseModalityProfile?.primaryMode).toBe('capstone-project');
    const compiled = compileBlueprintDeliverables(blueprint, [
      'lessonPlans',
      'slideDecks',
      'rubrics',
      'discussions',
      'quizBank',
      'studyGuides',
    ]);
    const text = JSON.stringify(compiled).toLowerCase();

    expect(
      countNormalizedPhrase(
        text,
        'a milestone design review where students connect sponsor constraints evidence risks and next deliverables',
      ),
    ).toBe(0);
    expect(countNormalizedPhrase(text, 'sponsor constraints evidence risks and next deliverables')).toBeLessThanOrEqual(
      3,
    );
    expect(
      countNormalizedPhrase(text, 'a scorer can point to where it is satisfied and how it strengthens the work'),
    ).toBeLessThanOrEqual(3);
    expect(
      countNormalizedPhrase(text, 'a strong answer also names one limitation or alternative reading'),
    ).toBeLessThanOrEqual(3);
    expect(
      countNormalizedPhrase(text, 'make the after-class task point directly back to this criterion'),
    ).toBeLessThanOrEqual(4);
    expect(
      countNormalizedPhrase(text, 'respond directly to one peer by building on or challenging their evidence'),
    ).toBeLessThanOrEqual(4);
    expect(countNormalizedPhrase(text, 'what evidence would make the transfer stronger')).toBeLessThanOrEqual(4);
    expect(
      countNormalizedPhrase(text, 'have students vote true or false then defend the vote with'),
    ).toBeLessThanOrEqual(4);
    expect(
      countNormalizedPhrase(text, 'exit ticket revisit the warm-up vote students explain in their own words'),
    ).toBeLessThanOrEqual(4);
  }, 30000);

  it('varies the latest UX provider texture stamps across study guides, quiz items, and lesson plans', () => {
    const blueprint = buildCourseBlueprint(uxDesignTextureRegressionMap());
    expect(blueprint.courseModalityProfile?.primaryMode).toBe('studio-lab');
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'quizBank', 'studyGuides']);
    const text = JSON.stringify(compiled).toLowerCase();

    expect(countNormalizedPhrase(text, 'students should connect those ideas to the weekly activity pattern')).toBe(0);
    expect(countNormalizedPhrase(text, 'ask students to justify why each wrong option misses')).toBe(0);
    expect(
      countNormalizedPhrase(text, 'artifact in front of students and ask what evidence justifies the change'),
    ).toBe(0);
    expect(countNormalizedPhrase(text, 'connect those ideas to the weekly activity pattern')).toBeLessThanOrEqual(2);
    expect(countNormalizedPhrase(text, 'wrong option misses the')).toBeLessThanOrEqual(2);
    expect(countNormalizedPhrase(text, 'what evidence justifies the change')).toBeLessThanOrEqual(2);
  }, 30000);

  it('varies the exact study-guide and objective-slide tails from the final World Literature browser package', () => {
    const blueprint = buildCourseBlueprint(worldLiteratureTextureRegressionMap());
    blueprint.lessons.forEach((lesson) => {
      lesson.modalityDecode = {
        ...(lesson.modalityDecode || {}),
        feedbackRoutine: `During ${lesson.title}, challenge the claim with a counter-reading, source limit, or context boundary before revision, then require students to identify the exact evidence change they will carry into the assessed artifact.`,
      };
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks', 'studyGuides']);
    const guides = compiled.studyGuides.studyGuides;
    const decks = compiled.slideDecks.decks;
    const text = JSON.stringify({ guides, decks }).toLowerCase();

    expect(guides).toHaveLength(14);
    expect(decks).toHaveLength(14);
    expect(countNormalizedPhrase(text, 'connects to the assessment artifact')).toBe(0);
    expect(countNormalizedPhrase(text, 'how would you explain the central idea of')).toBeLessThanOrEqual(3);
    expect(countNormalizedPhrase(text, 'to the evidence move students need for')).toBeLessThanOrEqual(3);
    expect(countNormalizedPhrase(text, 'one limitation and the revision it supports')).toBeLessThanOrEqual(3);
    expect(countNormalizedPhrase(text, 'use this slide to keep')).toBeLessThanOrEqual(3);
    expect(countNormalizedPhrase(text, 'as the continuity cue between prior work and')).toBeLessThanOrEqual(3);

    const texture = computeTexture([
      ...guides.map((guide, index) => ({
        id: `world-lit-guide-${index + 1}`,
        feature: 'studyGuides',
        text: JSON.stringify(guide),
      })),
      ...decks.map((deck, index) => ({
        id: `world-lit-deck-${index + 1}`,
        feature: 'slideDecks',
        text: JSON.stringify(deck),
      })),
    ]);
    const evidence = texture.evidence.map((item) => item.shingle).join('\n');
    expect(evidence).not.toMatch(/explain the central idea|connects to the assessment artifact/);
  }, 30000);

  it('does not multiply a model-authored lesson-title echo across quiz, FAQ, and study-guide surfaces', () => {
    const lessonTitle = 'Tang Poetry using Li Bai and Du Fu';
    const blueprint = buildCourseBlueprint({
      courseName: 'World Literature',
      semester: 'Fall 2026',
      lessons: [
        {
          title: `Lesson 1: ${lessonTitle}`,
          sections: [
            {
              topicSection: `1.1: ${lessonTitle}`,
              learningGoals: 'Interpret two Tang poems through precise textual evidence and comparative context.',
              learningObjectives:
                'Analyze imagery in a translated poem.\nSynthesize one comparative claim from two passages.',
              weeklyAssessments:
                'Comparative close-reading note with two quoted details, one synthesis claim, and one qualification.',
              asyncActivities: 'Annotate one translated poem by Li Bai and one by Du Fu.',
              syncActivities: 'Compare imagery and revise a synthesis claim from textual evidence.',
              supportingResources: 'Li Bai selection; Du Fu selection; translation note; close-reading guide',
            },
          ],
        },
      ],
    });
    const lesson = blueprint.lessons[0];
    lesson.keyConcepts = [lessonTitle, 'Poetic analysis', 'Comparative reasoning'];
    lesson.enrichment = {
      keyTerms: [
        {
          term: lessonTitle,
          definition: 'This entire schedule label was mistakenly returned as a reusable glossary concept.',
          example: 'A schedule row names the authors and the genre together.',
          misconception: 'Students may treat the full schedule label as a disciplinary term.',
          correction: 'Use a reusable analytic concept instead.',
        },
        {
          term: 'Poetic analysis',
          definition: 'Poetic analysis explains how formal choices create meaning in a specific passage.',
          example: 'Compare how an image changes the speaker’s stance in each translated poem.',
          misconception: 'Poetic analysis only paraphrases what a poem says.',
          correction: 'It connects formal evidence to an interpretive claim.',
        },
        {
          term: 'Comparative reasoning',
          definition: 'Comparative reasoning uses a shared criterion to explain a meaningful similarity or difference.',
          example: 'Use the treatment of distance as the same criterion in both passages.',
          misconception: 'A comparison is complete after listing one feature from each poem.',
          correction: 'The shared criterion must support a synthesis claim.',
        },
      ],
      kernel: {
        facts: [
          'Li Bai and Du Fu use images of distance to position the speaker differently.',
          'A translation choice can alter sound, image, and interpretive emphasis.',
        ],
        scenario: {
          setup: 'Two translations render the same image with different degrees of distance.',
          materials: 'Two short translated passages and their translators’ notes.',
          decision: 'Choose which translation better supports the synthesis claim and explain the limit.',
        },
      },
      assignmentCore: {
        taskDescription: 'Write a comparative close-reading note using one quoted detail from each poem.',
      },
    };

    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank', 'courseFaq', 'studyGuides']);
    const quizText = JSON.stringify(compiled.quizBank.quizzes[0].questions).toLowerCase();
    const faqText = JSON.stringify(compiled.courseFaq.faqs[0].qs).toLowerCase();
    const guide = compiled.studyGuides.studyGuides[0];
    const guideText = JSON.stringify({
      keyTerms: guide.keyTerms,
      commonMisconceptions: guide.commonMisconceptions,
      reviewQuestions: guide.reviewQuestions,
      practiceActivities: guide.practiceActivities,
    }).toLowerCase();
    const titlePhrase = lessonTitle.toLowerCase();

    expect(countPhrase(quizText, titlePhrase)).toBeLessThan(12);
    expect(countPhrase(faqText, titlePhrase)).toBeLessThan(12);
    expect(guideText).not.toContain('this entire schedule label was mistakenly returned');
    expect(guideText).toContain('poetic analysis');
    expect(guideText).toContain('comparative reasoning');
  }, 30000);
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

  it('keeps every pre-texture weight and gives texture a score-bearing weight that can cost the A band', () => {
    expect(GRADER_VERSION).toBe('1.16.4');
    expect(DIMENSION_WEIGHTS).toEqual({
      identity: 20,
      substance: 20,
      citations: 15,
      honesty: 15,
      discipline: 15,
      consistency: 10,
      structure: 10,
      format: 5,
      // v0.15.186: 10 → 25 — heavy templating must be able to pull the
      // overall score out of the A band on its own.
      texture: 25,
    });
  });

  it('matches the existing gate expectations and includes texture in the weighted overall', () => {
    // The exact pins crucible-grader-proof asserts on this fixture.
    expect(result.findings.filter((finding) => finding.severity === 'P0')).toEqual([]);
    expect(result.overall.score, JSON.stringify(result.scores)).toBeGreaterThanOrEqual(85);
    expect(result.scores.identity).toBeGreaterThanOrEqual(85);
    // Evidence dependencies now count as unresolved until an exact source
    // join is present. This synthetic fixture remains useful for texture, but
    // it must not impersonate a fully source-verified package.
    expect(result.scores.substance).toBeGreaterThanOrEqual(60);
    expect(
      result.findings.some(
        (finding) =>
          finding.dimension === 'substance' && /course process instead of subject knowledge/i.test(finding.detail),
      ),
    ).toBe(false);

    const entries = Object.entries(DIMENSION_WEIGHTS);
    const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
    expect(totalWeight).toBe(135);
    const recomputed = Math.round(
      entries.reduce((sum, [dimension, weight]) => sum + result.scores[dimension] * weight, 0) / totalWeight,
    );
    const severityCapped = result.findings.some((finding) => finding.severity === 'P0')
      ? Math.min(recomputed, 74)
      : result.findings.some((finding) => finding.severity === 'P1')
        ? Math.min(recomputed, 89)
        : recomputed;
    expect(result.overall.score).toBe(severityCapped);
  });

  it('scores texture from the metric and reports low texture as a finding while keeping advisories separate', () => {
    expect(typeof result.scores.texture).toBe('number');
    expect(result.scores.texture).toBeGreaterThanOrEqual(0);
    expect(result.scores.texture).toBeLessThanOrEqual(100);
    expect(result.grades.texture).toBe(letterGrade(result.scores.texture));
    expect(result.texture.score).toBe(result.scores.texture);
    expect(result.texture.measured).toBe(true);
    expect(Object.keys(result.texture.subScores).sort()).toEqual(['openers', 'sameness', 'tails']);
    expect(result.texture.visibleUnits.measured).toBe(true);
    expect(result.texture.visibleUnits.exact.eligibleUnitCount).toBeGreaterThan(0);
    expect(result.texture.visibleUnits.skeleton.eligibleUnitCount).toBe(
      result.texture.visibleUnits.exact.eligibleUnitCount,
    );
    expect(result.texture.visibleUnits.families.length).toBeGreaterThan(0);
    expect(result.texture.visibleUnitPolicy).toMatchObject({
      policyVersion: 'visible-units.v2',
      signal: 'skeleton.extraDuplicateRate',
    });
    expect(result.texture.visibleUnitPolicy.families.map((family) => family.family)).toEqual([
      'lessonPlans',
      'assignments',
      'rubrics',
    ]);
    expect(result.texture.visibleUnitPolicy.evaluatedFamilyCount).toBe(3);
    expect(
      Object.fromEntries(
        result.texture.visibleUnitPolicy.families.map((family) => [family.family, family.eligibleUnitCount]),
      ),
    ).toEqual({ lessonPlans: 54, assignments: 127, rubrics: 107 });
    expect(result.texture.score).toBe(
      Math.max(0, result.texture.baseScore - result.texture.visibleUnitPolicy.scorePenalty),
    );

    const textureFindings = result.findings.filter((finding) => finding.dimension === 'texture');
    expect(result.stats.byDimension.texture).toBe(textureFindings.length);
    expect(result.texture.baseScore).toBeGreaterThanOrEqual(90);
    expect(result.texture.score).toBe(result.texture.baseScore);
    expect(result.texture.visibleUnitPolicy.scorePenalty).toBe(0);
    expect(textureFindings).toEqual([]);
    const severities = { p0: 'P0', p1: 'P1', p2: 'P2' };
    for (const [key, severity] of Object.entries(severities)) {
      expect(result.stats[key]).toBe(result.findings.filter((finding) => finding.severity === severity).length);
    }
    for (const advisory of result.texture.advisories) {
      expect(advisory.severity).toBe('P2');
      expect(advisory.dimension).toBe('texture');
      expect(advisory.advisory).toBe(true);
    }
    for (const family of result.texture.visibleUnitPolicy.families) {
      if (!family.evaluated && family.eligibleUnitCount > 0) {
        expect(result.texture.advisories).toEqual(
          expect.arrayContaining([expect.objectContaining({ detail: expect.stringMatching(/did not evaluate/) })]),
        );
      }
    }
    expect(result.texture.evidence.length).toBeLessThanOrEqual(5);
  });

  it('renders the texture row in the dimension table with score-bearing weight', () => {
    const md = renderReportMarkdown(result, { courseTitle: 'Physical Geology' });
    // Existing rows and header are untouched…
    expect(md).toContain('| Dimension | Weight | Score | Grade |');
    expect(md).toContain('| identity | 20 |');
    expect(md).toContain('| format | 5 |');
    expect(md).toContain(`| texture | 25 | ${result.scores.texture} | ${result.grades.texture} |`);
    expect(md).toContain(`| **overall** | 135 | **${result.overall.score}** | **${result.overall.grade}** |`);
    expect(md).toContain('## Reader-visible texture policy receipt');
    expect(md).toContain('`visible-units.v2`');
    expect(md).toContain('`skeleton.extraDuplicateRate`');
    expect(md).toContain('| lessonPlans |');
    expect(md).toContain('| assignments |');
    expect(md).toContain('| rubrics |');
    expect(md).toContain('Any P1 finding caps package conformance at 89');
  });
});
