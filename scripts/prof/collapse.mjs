/**
 * scripts/prof/collapse.mjs — the multiverse collapse stage (design doc §4c).
 * After universes complete: fingerprint-dedup findings across universes,
 * compute agreement scores, aggregate KPIs as means ± CI, and measure
 * persona-pair correlation (the "denied tenure" prune signal).
 */

import { normalizeForQuoteMatch } from './verdictLedger.mjs';

function tokenSet(value) {
  return new Set(normalizeForQuoteMatch(value).split(' ').filter(Boolean));
}

export function quoteOverlap(quoteA, quoteB) {
  const setA = tokenSet(quoteA);
  const setB = tokenSet(quoteB);
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  return shared / Math.min(setA.size, setB.size);
}

const FINGERPRINT_OVERLAP_BAR = 0.6;

/**
 * Dedup findings across universes: same file + same taxonomy + quote token
 * overlap ≥ bar → one finding with an agreement score (k of N universes).
 */
export function collapseFindings(entries, universeCount) {
  const groups = [];
  for (const entry of entries) {
    const match = groups.find(
      (group) =>
        group.file === entry.finding.file &&
        group.taxonomy === entry.finding.taxonomy &&
        quoteOverlap(group.quote, entry.finding.quote) >= FINGERPRINT_OVERLAP_BAR,
    );
    if (match) {
      match.universes.add(entry.universeId);
      match.personas.add(entry.personaId);
      match.instances.push(entry);
      // Keep the most severe severity across duplicates.
      const order = { P0: 0, P1: 1, P2: 2 };
      if (order[entry.finding.severity] < order[match.severity]) match.severity = entry.finding.severity;
    } else {
      groups.push({
        file: entry.finding.file,
        taxonomy: entry.finding.taxonomy,
        severity: entry.finding.severity,
        quote: entry.finding.quote,
        objection: entry.finding.objection,
        universes: new Set([entry.universeId]),
        personas: new Set([entry.personaId]),
        instances: [entry],
      });
    }
  }
  return groups
    .map((group) => ({
      file: group.file,
      taxonomy: group.taxonomy,
      severity: group.severity,
      quote: group.quote,
      objection: group.objection,
      agreement: group.universes.size,
      agreementFraction: round3(group.universes.size / universeCount),
      personas: [...group.personas],
      instanceCount: group.instances.length,
    }))
    .sort((a, b) => b.agreement - a.agreement || a.severity.localeCompare(b.severity));
}

/** Mean, sample SD, and 95% CI (t-distribution critical values for small N). */
const T_CRIT_95 = { 2: 12.71, 3: 4.303, 4: 3.182, 5: 2.776, 6: 2.571, 7: 2.447, 8: 2.365, 9: 2.306, 10: 2.262 };

export function meanWithCI(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  const n = clean.length;
  if (n === 0) return { n: 0, mean: null, sd: null, ci95: null };
  const mean = clean.reduce((sum, value) => sum + value, 0) / n;
  if (n === 1) return { n, mean: round3(mean), sd: null, ci95: null };
  const variance = clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  const tCrit = T_CRIT_95[Math.min(n, 10)] || 1.96;
  const half = (tCrit * sd) / Math.sqrt(n);
  return {
    n,
    mean: round3(mean),
    sd: round3(sd),
    ci95: [round3(mean - half), round3(mean + half)],
    ciWidth: round3(2 * half),
  };
}

/** Do two independent samples' 95% CIs overlap? (The variance-kill check.) */
export function ciSeparated(statsA, statsB) {
  if (!statsA?.ci95 || !statsB?.ci95) return false;
  return statsA.ci95[0] > statsB.ci95[1] || statsB.ci95[0] > statsA.ci95[1];
}

/**
 * Per-persona-pair tier agreement across verdicts on the same artifacts —
 * pairs agreeing above the prune bar are redundant (§4b).
 */
export function personaPairAgreement(verdictRows) {
  const byArtifact = new Map();
  for (const row of verdictRows) {
    if (!byArtifact.has(row.artifact)) byArtifact.set(row.artifact, []);
    byArtifact.get(row.artifact).push(row);
  }
  const pairs = new Map();
  for (const rows of byArtifact.values()) {
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        if (rows[i].personaId === rows[j].personaId) continue;
        const key = [rows[i].personaId, rows[j].personaId].sort().join('|');
        if (!pairs.has(key)) pairs.set(key, { same: 0, total: 0 });
        const pair = pairs.get(key);
        pair.total += 1;
        if (rows[i].tier === rows[j].tier) pair.same += 1;
      }
    }
  }
  return [...pairs.entries()].map(([pair, counts]) => ({
    pair,
    agreements: counts.same,
    comparisons: counts.total,
    rate: round3(counts.same / counts.total),
  }));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
