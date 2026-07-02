/**
 * scripts/prof/student/cohortFactory.mjs — a classroom is a distribution,
 * not archetypes (design §3c). Correlated trait sampling from institutional
 * presets, fully seeded.
 */

import { seededRandom } from '../universe.mjs';
import { LEARNING_RULES } from './studentMind.mjs';

// Trait means per preset. aptitude multiplies exposure gain; decayHalfLife in
// ticks; priorKnowledgeProb = chance a concept is already known on day one.
export const COHORT_PRESETS = {
  'r1-majors': {
    aptitude: 1.15,
    aptitudeSd: 0.18,
    conscientiousness: 0.75,
    conscientiousnessSd: 0.15,
    priorKnowledgeProb: 0.18,
    misconceptionSusceptibility: 0.45,
    decayHalfLife: LEARNING_RULES.decay.halfLifeTicksMean * 1.15,
  },
  'cc-night-class': {
    aptitude: 0.95,
    aptitudeSd: 0.22,
    conscientiousness: 0.55,
    conscientiousnessSd: 0.2,
    priorKnowledgeProb: 0.08,
    misconceptionSusceptibility: 0.6,
    decayHalfLife: LEARNING_RULES.decay.halfLifeTicksMean * 0.9,
  },
  'gen-ed-fillers': {
    aptitude: 0.85,
    aptitudeSd: 0.2,
    conscientiousness: 0.45,
    conscientiousnessSd: 0.2,
    priorKnowledgeProb: 0.04,
    misconceptionSusceptibility: 0.7,
    decayHalfLife: LEARNING_RULES.decay.halfLifeTicksMean * 0.8,
  },
};

/** Box-Muller from a seeded uniform rng. */
function gaussian(rng) {
  const u = Math.max(rng(), 1e-9);
  const v = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/**
 * Sample a cohort. Correlation by construction: conscientiousness and
 * aptitude share a common factor (0.4 loading) — diligent students tend to
 * be stronger, imperfectly, like real rosters.
 */
export function sampleCohort({ preset = 'cc-night-class', size = 25, seed = 1 }) {
  const spec = COHORT_PRESETS[preset];
  if (!spec) throw new Error(`Unknown cohort preset "${preset}" (${Object.keys(COHORT_PRESETS).join(', ')})`);
  const rng = seededRandom(seed);
  const students = [];
  for (let index = 0; index < size; index += 1) {
    const commonFactor = gaussian(rng);
    const aptitude = clamp(spec.aptitude + spec.aptitudeSd * (0.4 * commonFactor + 0.9 * gaussian(rng)), 0.4, 1.8);
    const conscientiousness = clamp(
      spec.conscientiousness + spec.conscientiousnessSd * (0.4 * commonFactor + 0.9 * gaussian(rng)),
      0.1,
      0.98,
    );
    students.push({
      studentId: `${preset}-s${index + 1}`,
      traits: {
        aptitude,
        conscientiousness,
        intakeCapacity: Math.max(
          2,
          Math.round(
            LEARNING_RULES.intake.capacityMeanNewConceptsPerLesson + LEARNING_RULES.intake.capacitySd * gaussian(rng),
          ),
        ),
        decayHalfLife: Math.max(1.5, spec.decayHalfLife + 0.8 * gaussian(rng)),
        priorKnowledgeProb: spec.priorKnowledgeProb,
        misconceptionSusceptibility: clamp(spec.misconceptionSusceptibility + 0.15 * gaussian(rng), 0.05, 0.95),
      },
    });
  }
  return { preset, seed, students };
}
