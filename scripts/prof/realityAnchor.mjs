/**
 * scripts/prof/realityAnchor.mjs — the Reality Anchor protocol machinery
 * (design §9, P4). Human anchor rounds themselves are OUT of this goal (they
 * need real instructors); this builds everything AROUND them:
 *   - the human-review packet template (same A1 schema personas use)
 *   - sim-to-real agreement computation (tier agreement + objection overlap)
 *   - the UNANCHORED stamp logic (a report older than two anchor rounds is
 *     stamped stale)
 * so that the moment a real instructor fills one template, the KPI computes.
 */

import { normalizeForQuoteMatch } from './verdictLedger.mjs';

const TIER_RANK = {
  blocked: 0,
  'export-safe': 1,
  'structured-complete': 2,
  'classroom-ready-draft': 3,
  'adoption-ready': 4,
  'university-proofed': 5,
};

/** The blank a human instructor fills — identical schema to a persona verdict
 *  so sim and human are directly comparable. */
export function humanAnchorTemplate({ scenarioId, packageDir }) {
  return {
    schema: 'reality-anchor-v1',
    scenarioId,
    packageDir,
    instructions:
      'Review this package as if deciding whether to adopt it. Fill every field. Quote the document exactly in each finding.',
    reviewer: { name: '', institution: '', discipline: '', yearsTeaching: null },
    verdict: {
      tier: `one of ${Object.keys(TIER_RANK).join(' | ')}`,
      teachAsIs: 'integer 1-10',
      summary: '',
      minimumEdits: [],
      findings: [{ taxonomy: '', severity: 'P0|P1|P2', file: '', quote: '', objection: '' }],
    },
  };
}

/** Objection overlap: fraction of human findings a persona also raised
 *  (matched by file + quote-token overlap). */
function objectionOverlap(humanFindings, simFindings) {
  if (!humanFindings.length) return null;
  const simTokens = simFindings.map((f) => ({
    file: f.file,
    tokens: new Set(
      normalizeForQuoteMatch(f.quote)
        .split(' ')
        .filter((t) => t.length > 3),
    ),
  }));
  let matched = 0;
  for (const human of humanFindings) {
    const humanTokens = new Set(
      normalizeForQuoteMatch(human.quote)
        .split(' ')
        .filter((t) => t.length > 3),
    );
    const hit = simTokens.some((sim) => {
      if (humanTokens.size === 0) return false;
      let shared = 0;
      for (const token of sim.tokens) if (humanTokens.has(token)) shared += 1;
      return shared / humanTokens.size >= 0.3;
    });
    if (hit) matched += 1;
  }
  return Math.round((matched / humanFindings.length) * 1000) / 1000;
}

/**
 * Compute sim-to-real agreement for one anchor round: tier agreement (within
 * one tier) and teach-as-is closeness against the multiverse mean, plus
 * objection overlap. `simVerdicts` are the active-pool adoption verdicts on
 * the same package; `humanVerdicts` are filled templates.
 */
export function computeSimToRealAgreement({ simVerdicts, humanVerdicts }) {
  if (!humanVerdicts.length || !simVerdicts.length) {
    return { status: 'no-data', tierAgreement: null, teachDelta: null, objectionOverlap: null };
  }
  const simTiers = simVerdicts.map((v) => TIER_RANK[v.tier]).filter((r) => r !== undefined);
  const simTeach = simVerdicts.map((v) => v.teachAsIs).filter(Number.isFinite);
  const simTierMean = simTiers.reduce((s, r) => s + r, 0) / simTiers.length;
  const simTeachMean = simTeach.reduce((s, r) => s + r, 0) / simTeach.length;

  let tierAgree = 0;
  let teachDeltaSum = 0;
  const allSimFindings = simVerdicts.flatMap((v) => v.findings || []);
  let overlapSum = 0;
  let overlapN = 0;
  for (const human of humanVerdicts) {
    const humanRank = TIER_RANK[human.verdict.tier];
    if (humanRank !== undefined && Math.abs(humanRank - simTierMean) <= 1) tierAgree += 1;
    if (Number.isFinite(human.verdict.teachAsIs)) teachDeltaSum += Math.abs(human.verdict.teachAsIs - simTeachMean);
    const overlap = objectionOverlap(human.verdict.findings || [], allSimFindings);
    if (overlap !== null) {
      overlapSum += overlap;
      overlapN += 1;
    }
  }
  return {
    status: 'computed',
    humanReviews: humanVerdicts.length,
    tierAgreement: Math.round((tierAgree / humanVerdicts.length) * 1000) / 1000,
    teachDelta: Math.round((teachDeltaSum / humanVerdicts.length) * 1000) / 1000,
    objectionOverlap: overlapN > 0 ? Math.round((overlapSum / overlapN) * 1000) / 1000 : null,
    simTierMean: Math.round(simTierMean * 1000) / 1000,
    simTeachMean: Math.round(simTeachMean * 1000) / 1000,
  };
}

/** UNANCHORED stamp: a report is stale if the newest anchor round is more than
 *  `maxAgeRounds` releases behind, or there is none. */
export function anchorFreshness({ anchorRounds = [], currentRelease, maxAgeRounds = 2 }) {
  if (!anchorRounds.length) return { anchored: false, stamp: 'UNANCHORED (no Reality Anchor round on record)' };
  const newest = anchorRounds[anchorRounds.length - 1];
  const behind = Number(currentRelease?.ordinal ?? 0) - Number(newest.releaseOrdinal ?? 0);
  if (behind > maxAgeRounds) {
    return { anchored: false, stamp: `UNANCHORED (last anchor ${behind} releases behind)` };
  }
  return { anchored: true, stamp: `anchored (last round: ${newest.date || 'unknown'})` };
}
