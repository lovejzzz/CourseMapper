/**
 * scripts/prof/profReport.mjs — per-term report (design doc §4c/§9).
 * Headlines always carry: SIMULATED, the term mode, the quarantine notice for
 * instrument mode, and the UNANCHORED stamp (no Reality Anchor round has run
 * yet — P4 removes it only when anchor data exists).
 */

import { meanWithCI } from './collapse.mjs';

const TIER_RANK = {
  blocked: 0,
  'export-safe': 1,
  'structured-complete': 2,
  'classroom-ready-draft': 3,
  'adoption-ready': 4,
  'university-proofed': 5,
};

export function adoptionKpis(reviews) {
  const activeReviews = reviews.filter((review) => review.personaPool === 'active');
  const pool = activeReviews.length > 0 ? activeReviews : reviews;
  const teachAsIs = meanWithCI(pool.map((review) => review.verdict.teachAsIs));
  const adopted = pool.filter((review) => TIER_RANK[review.verdict.tier] >= TIER_RANK['classroom-ready-draft']);
  return {
    reviews: pool.length,
    holdoutExcluded: reviews.length - pool.length,
    adoptionRate: pool.length > 0 ? Math.round((adopted.length / pool.length) * 100) / 100 : null,
    teachAsIs,
    tiers: pool.map((review) => ({
      persona: review.personaId,
      tier: review.verdict.tier,
      teachAsIs: review.verdict.teachAsIs,
    })),
  };
}

export function renderTermReport({ term, scenario, kpis, findings, workloadAccount, spend, errors, pairAgreement }) {
  const lines = [];
  lines.push(`# Prof Report — ${term.termId}`);
  lines.push('');
  lines.push(
    `**SIMULATED verdicts — mode: ${term.mode.toUpperCase()}${
      term.quarantined
        ? ' (instrument validation: course findings QUARANTINED — they inform nothing until reproduced in a course-mode term)'
        : ''
    } — UNANCHORED (no Reality Anchor round yet)**`,
  );
  lines.push('');
  lines.push(
    `Scenario: ${scenario.id} · artifact: \`${scenario.packageDir}\` · universes: ${kpis.reviews}${kpis.holdoutExcluded ? ` (+${kpis.holdoutExcluded} holdout, excluded from KPIs)` : ''}`,
  );
  lines.push('');
  lines.push('## KPIs (multiverse statistics)');
  lines.push('');
  lines.push(
    `- Adoption rate (≥ classroom-ready-draft): **${kpis.adoptionRate === null ? 'n/a' : kpis.adoptionRate * 100 + '%'}**`,
  );
  const t = kpis.teachAsIs;
  lines.push(
    `- Teach-as-is: **${t.mean ?? 'n/a'}**${t.ci95 ? ` (95% CI ${t.ci95[0]}–${t.ci95[1]}, n=${t.n})` : ` (n=${t.n})`}`,
  );
  lines.push('');
  lines.push('| Persona | Tier | Teach-as-is |');
  lines.push('| --- | --- | --- |');
  for (const row of kpis.tiers) lines.push(`| ${row.persona} | ${row.tier} | ${row.teachAsIs} |`);
  lines.push('');
  if (workloadAccount) {
    lines.push('## Workload account (deterministic)');
    lines.push('');
    lines.push(
      `Expected ${workloadAccount.expectedWeeklyHours}h/week (${workloadAccount.expectedSource}); mean ratio ${workloadAccount.meanRatio}; overloaded lessons: ${
        workloadAccount.overloadedWeeks.join(', ') || 'none'
      }.`,
    );
    if (workloadAccount.finding)
      lines.push(`- **[${workloadAccount.finding.severity}]** ${workloadAccount.finding.detail}`);
    lines.push('');
  }
  lines.push(`## Findings (agreement-ranked, quote-backed; ${findings.length})`);
  lines.push('');
  for (const finding of findings) {
    lines.push(
      `- **[${finding.severity}] ${finding.taxonomy}** (${finding.agreement}/${kpis.reviews + kpis.holdoutExcluded} universes) — ${finding.file}`,
    );
    lines.push(`  - quote: "${finding.quote.slice(0, 200)}"`);
    lines.push(`  - objection: ${finding.objection}`);
  }
  if (findings.length === 0) lines.push('_No quote-backed findings survived the ledger screen._');
  lines.push('');
  if (pairAgreement?.length) {
    lines.push('## Persona-pair tier agreement (prune bar 0.95)');
    lines.push('');
    for (const pair of pairAgreement)
      lines.push(`- ${pair.pair}: ${pair.rate} (${pair.agreements}/${pair.comparisons})`);
    lines.push('');
  }
  if (errors?.length) {
    lines.push('## Universe errors');
    lines.push('');
    for (const error of errors) lines.push(`- ${error.universeId}: ${error.error}`);
    lines.push('');
  }
  lines.push('## Spend');
  lines.push('');
  lines.push(`$${spend.spentUsd.toFixed(3)} of $${spend.capUsd} cap · ${spend.callCount} calls`);
  lines.push('');
  return lines.join('\n');
}
