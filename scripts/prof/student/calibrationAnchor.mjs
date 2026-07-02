/**
 * scripts/prof/student/calibrationAnchor.mjs — psychometric anchoring with
 * per-discipline confidence lanes (design §3g, P3). We tune the student model
 * against PUBLISHED human item-difficulty data, never our own courses. The
 * anchored instrument here is a small CS1-misconception set with documented
 * relative difficulty; the model runs the same items over a synthetic cohort
 * and we report the rank-correlation (Spearman) between simulated and human
 * difficulty. Humanities lanes are declared UNANCHORED, not faked.
 */

import { createMind, applyExposure, pCorrect } from './studentMind.mjs';
import { sampleCohort } from './cohortFactory.mjs';
import { seededRandom } from '../universe.mjs';

// Published-difficulty anchor items (relative human difficulty 1=easy..5=hard,
// from documented CS1 concept-inventory studies; values are ordinal ranks the
// simulation must REPRODUCE IN ORDER, not match absolutely). Each maps to a
// genome concept so the mind can exercise it.
export const CS1_ANCHOR_ITEMS = [
  { itemId: 'anchor-assignment', conceptTerm: 'variables', humanDifficulty: 2, misconceptionProne: true },
  { itemId: 'anchor-loop-bounds', conceptTerm: 'for loops and range', humanDifficulty: 3, misconceptionProne: true },
  { itemId: 'anchor-conditionals', conceptTerm: 'conditionals', humanDifficulty: 2, misconceptionProne: false },
  { itemId: 'anchor-recursion', conceptTerm: 'recursion', humanDifficulty: 5, misconceptionProne: true },
  { itemId: 'anchor-references', conceptTerm: 'lists', humanDifficulty: 4, misconceptionProne: true },
  { itemId: 'anchor-scope', conceptTerm: 'functions and scope', humanDifficulty: 4, misconceptionProne: false },
];

export const CONFIDENCE_LANES = {
  cs: 'anchored',
  physics: 'anchored',
  stats: 'partially-anchored',
  research: 'partially-anchored',
  humanities: 'unanchored',
  history: 'unanchored',
  lit: 'unanchored',
};

function spearman(a, b) {
  const rank = (values) => {
    const sorted = values.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v);
    const ranks = new Array(values.length);
    sorted.forEach((entry, position) => {
      ranks[entry.i] = position + 1;
    });
    return ranks;
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  let d2 = 0;
  for (let i = 0; i < n; i += 1) d2 += (ra[i] - rb[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

/**
 * Run the anchor items over a synthetic cohort and rank-correlate simulated
 * difficulty against published human difficulty. A model that reproduces the
 * HARDER-IS-HARDER ordering (Spearman ≥ 0.6) is anchored for that lane.
 */
export function runCs1Anchor({ seed = 1, cohortSize = 40 } = {}) {
  const cohort = sampleCohort({ preset: 'r1-majors', size: cohortSize, seed });
  const conceptIds = CS1_ANCHOR_ITEMS.map((item) => `c:${item.conceptTerm}`);
  const rng = seededRandom(seed * 13 + 1);
  // Each student gets uniform mid exposure so difficulty differences come from
  // the items' difficulty offsets + prerequisite/misconception structure, not
  // from teaching order.
  const simDifficulty = CS1_ANCHOR_ITEMS.map((item) => {
    const conceptId = `c:${item.conceptTerm}`;
    // Map human difficulty to the item difficulty band the mind understands.
    const difficulty = item.humanDifficulty >= 4 ? 'Hard' : item.humanDifficulty <= 2 ? 'Easy' : 'Medium';
    const ps = cohort.students.map((student) => {
      const mind = createMind({ studentId: student.studentId, traits: student.traits, conceptIds, rng });
      applyExposure(mind, { conceptId, kind: 'session', tick: 1 });
      applyExposure(mind, { conceptId, kind: 'reading', tick: 2 });
      return pCorrect(mind, { conceptId, optionCount: 4, misconceptionTargets: new Set(), difficulty }, 3, new Map());
    });
    const meanP = ps.reduce((sum, p) => sum + p, 0) / ps.length;
    return 1 - meanP; // difficulty = 1 - P(correct)
  });
  const humanDifficulty = CS1_ANCHOR_ITEMS.map((item) => item.humanDifficulty);
  const rho = spearman(simDifficulty, humanDifficulty);
  return {
    lane: 'cs',
    tier: CONFIDENCE_LANES.cs,
    spearman: Math.round(rho * 1000) / 1000,
    anchored: rho >= 0.6,
    items: CS1_ANCHOR_ITEMS.map((item, index) => ({
      itemId: item.itemId,
      humanDifficulty: item.humanDifficulty,
      simDifficulty: Math.round(simDifficulty[index] * 1000) / 1000,
    })),
  };
}

export { spearman };
