// Judgment layer — docs/TRELLIS.md §14.4. Deterministic checks only; the
// machine never writes, it checks. runChecks aggregates J1–J10.
import { j1KeyValid } from './checks/j1KeyValid.mjs';
import { j2BloomMatch } from './checks/j2BloomMatch.mjs';
import { j3RepairConfronts } from './checks/j3RepairConfronts.mjs';
import { j4Coverage } from './checks/j4Coverage.mjs';
import { j5CiteResolves } from './checks/j5CiteResolves.mjs';
import { j6Xref } from './checks/j6Xref.mjs';
import { j7Echo } from './checks/j7Echo.mjs';
import { j8Pacing } from './checks/j8Pacing.mjs';
import { j9Dates } from './checks/j9Dates.mjs';
import { j10Relevance } from './checks/j10Relevance.mjs';
import { j11Catch } from './checks/j11Catch.mjs';
import { j3bPairing } from './checks/j3bPairing.mjs';
import { j12Exposure } from './checks/j12Exposure.mjs';
import { j13CoverageSpread } from './checks/j13CoverageSpread.mjs';

export const CHECKS = [
  j1KeyValid,
  j2BloomMatch,
  j3RepairConfronts,
  j4Coverage,
  j5CiteResolves,
  j6Xref,
  j7Echo,
  j8Pacing,
  j9Dates,
  j10Relevance,
  j11Catch,
  j3bPairing,
  j12Exposure,
  j13CoverageSpread,
];

export function runChecks(graph, authored, options = {}) {
  const findings = [];
  for (const check of CHECKS) {
    findings.push(...check(graph, authored, options));
  }
  return findings;
}

export function blockingFindings(findings) {
  return findings.filter((f) => f.severity === 'block');
}

// Findings grouped by the authored lesson they implicate — the repair loop's
// work list. Non-lesson findings (graph-level) are keyed '__graph__'.
export function findingsByLesson(findings) {
  const byLesson = {};
  for (const f of findings) {
    const match = /^authored\/([^/+]+)/.exec(f.path);
    const key = match ? match[1] : '__graph__';
    byLesson[key] = byLesson[key] || [];
    byLesson[key].push(f);
  }
  return byLesson;
}
