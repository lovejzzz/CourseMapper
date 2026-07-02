/**
 * scripts/prof/student/engagementSampler.mjs — the nobody-did-the-reading
 * machine (design §3c). Weekly behavior per student, seeded: reading
 * compliance responds to conscientiousness, the workload accountant's
 * pressure, and a week-of-term fatigue curve.
 */

import { seededRandom } from '../universe.mjs';

// Fatigue: enthusiasm start, mid-term slump after week 4, deeper slump near
// the end with a small pre-exam rebound on the final week.
export function fatigueFactor(week, totalWeeks) {
  if (week <= 2) return 1.0;
  if (week >= totalWeeks) return 0.9; // finals rebound
  const progress = week / totalWeeks;
  return 1.0 - 0.35 * Math.sin(Math.PI * Math.max(0, progress - 0.15));
}

/** Overloaded weeks depress compliance; trivially light weeks don't boost it. */
export function workloadPressure(weekRatio) {
  if (!Number.isFinite(weekRatio) || weekRatio <= 1) return 1.0;
  return Math.max(0.35, 1 - 0.4 * (weekRatio - 1));
}

/**
 * Sample one student's week. fullCompliance short-circuits everything to
 * done — the counterfactual arm of the compliance-robustness metric.
 */
export function sampleWeek({ student, week, totalWeeks, weekWorkloadRatio, rng, fullCompliance = false }) {
  if (fullCompliance) {
    return { didReading: true, attended: true, didAssignment: true, tookQuiz: true };
  }
  const base = student.traits.conscientiousness * fatigueFactor(week, totalWeeks) * workloadPressure(weekWorkloadRatio);
  return {
    didReading: rng() < base,
    attended: rng() < Math.min(0.97, base + 0.25), // showing up is easier than reading
    didAssignment: rng() < Math.min(0.95, base + 0.15), // it's graded
    tookQuiz: rng() < Math.min(0.98, base + 0.3), // also graded, and short
  };
}

/** A seeded sampler bound to one cohort run. */
export function createEngagement({ seed }) {
  const rng = seededRandom(seed);
  return { rng, sampleWeek: (args) => sampleWeek({ ...args, rng }) };
}
