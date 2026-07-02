/**
 * scripts/prof/student/studentMind.mjs — the mind as a state machine
 * (design §3a–3b). The LLM never decides what a student knows; this module
 * does, deterministically, from `learningRules.json`. Every number in a
 * student's head is inspectable JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const LEARNING_RULES = JSON.parse(fs.readFileSync(path.join(moduleDir, 'learningRules.json'), 'utf8'));

/**
 * A mind: per-concept records over the course's own inventory.
 * traits: { aptitude, intakeCapacity, decayHalfLife, conscientiousness,
 *           misconceptionSusceptibility, priorKnowledgeProb } (cohortFactory).
 */
export function createMind({ studentId, traits, conceptIds, seededMisconceptions = new Map(), rng }) {
  const concepts = new Map();
  for (const conceptId of conceptIds) {
    const prior = rng() < traits.priorKnowledgeProb;
    concepts.set(conceptId, {
      strength: prior ? LEARNING_RULES.masteryThresholds.comprehension : 0,
      lastTick: prior ? 0 : null,
      exposures: 0,
      misconceptions: new Set(seededMisconceptions.get(conceptId) || []),
      source: prior ? 'prior-knowledge' : 'unseen',
    });
  }
  return { studentId, traits, concepts };
}

function decayedStrength(record, tick, halfLife) {
  if (record.lastTick === null || record.strength === 0) return record.strength;
  const elapsed = Math.max(0, tick - record.lastTick);
  return record.strength * Math.pow(0.5, elapsed / halfLife);
}

/** Apply decay up to `tick` and return the record's current strength. */
export function strengthAt(mind, conceptId, tick) {
  const record = mind.concepts.get(conceptId);
  if (!record) return 0;
  return decayedStrength(record, tick, mind.traits.decayHalfLife);
}

/**
 * One exposure event. kind ∈ reading|session|generation|retrieval.
 * overflowed: the lesson exceeded the student's intake capacity and this
 * concept fell past the cutoff (design §3b intake rule).
 */
export function applyExposure(mind, { conceptId, kind, tick, overflowed = false }) {
  const record = mind.concepts.get(conceptId);
  if (!record) return;
  const rules = LEARNING_RULES;
  // Materialize decay before adding new strength.
  record.strength = decayedStrength(record, tick, mind.traits.decayHalfLife);
  const gap = record.lastTick === null ? null : tick - record.lastTick;
  let gain = rules.exposureStrength[kind] * mind.traits.aptitude;
  if (gap !== null && gap >= rules.spacing.minGapTicks) gain *= rules.spacing.bonusMultiplier;
  if (overflowed) gain *= rules.intake.overflowExposureMultiplier;
  record.strength += gain;
  record.lastTick = tick;
  record.exposures += 1;
  if (record.source === 'unseen') record.source = 'taught';
}

/** Effective strength after the prerequisite gate (design §3b). */
export function effectiveStrength(mind, conceptId, tick, prerequisitesByConcept) {
  const raw = strengthAt(mind, conceptId, tick);
  const prerequisites = prerequisitesByConcept.get(conceptId) || [];
  const rules = LEARNING_RULES.prerequisites;
  for (const prereqId of prerequisites) {
    if (!mind.concepts.has(prereqId)) continue; // outside the course inventory
    if (strengthAt(mind, prereqId, tick) < rules.gateStrength) {
      return Math.min(raw, rules.cappedMax);
    }
  }
  return raw;
}

export function masteryLevel(strength) {
  const t = LEARNING_RULES.masteryThresholds;
  if (strength >= t.transfer) return 3;
  if (strength >= t.comprehension) return 2;
  if (strength >= t.recognition) return 1;
  return 0;
}

/**
 * P(correct) for a multiple-choice item — pure arithmetic (design §3e
 * zero-token psychometrics). `item` needs { conceptId, optionCount,
 * misconceptionTargets: Set<misconceptionId> } (which held misconceptions its
 * distractors catch).
 */
export function pCorrect(mind, item, tick, prerequisitesByConcept) {
  const rules = LEARNING_RULES.answering;
  const strength = effectiveStrength(mind, item.conceptId, tick, prerequisitesByConcept);
  const guess = item.optionCount > 0 ? 1 / item.optionCount : rules.guessFloorFourOptions;
  const difficultyOffset = rules.difficultyOffsets?.[item.difficulty] ?? 0;
  let probability =
    guess +
    (1 - guess) / (1 + Math.exp(-rules.logisticK * (strength - rules.logisticMidpointStrength - difficultyOffset)));
  const record = mind.concepts.get(item.conceptId);
  if (record && item.misconceptionTargets?.size > 0) {
    const held = [...record.misconceptions].some((m) => item.misconceptionTargets.has(m));
    if (held && strength < rules.misconceptionImmunityStrength) {
      const pull = rules.misconceptionPullMax * (1 - strength / rules.misconceptionImmunityStrength);
      probability -= pull;
    }
  }
  return Math.max(rules.minProbability, Math.min(0.99, probability));
}

/**
 * Retrieval feedback: a quiz item whose distractor catches a HELD
 * misconception, with a good-enough explanation, repairs it (design §3d —
 * repair requires confrontation + feedback quality; re-reading never repairs).
 */
export function applyQuizFeedback(mind, { item, tick, feedbackQuality, rng, firstRetrievalOfConcept = true }) {
  const rules = LEARNING_RULES.misconceptionRepair;
  const record = mind.concepts.get(item.conceptId);
  if (!record) return { repaired: [] };
  const repaired = [];
  if (feedbackQuality >= rules.feedbackQualityBar && item.misconceptionTargets?.size > 0) {
    for (const misconception of [...record.misconceptions]) {
      if (item.misconceptionTargets.has(misconception) && rng() < rules.repairProbability) {
        record.misconceptions.delete(misconception);
        repaired.push(misconception);
      }
    }
  }
  if (firstRetrievalOfConcept) {
    applyExposure(mind, { conceptId: item.conceptId, kind: 'retrieval', tick });
  }
  return { repaired };
}

/** Full inspectable dump (design §3a: nothing hidden in a prompt). */
export function dumpMind(mind, tick, prerequisitesByConcept) {
  const out = {};
  for (const [conceptId, record] of mind.concepts) {
    const strength = strengthAt(mind, conceptId, tick);
    out[conceptId] = {
      strength: Math.round(strength * 1000) / 1000,
      effective: Math.round(effectiveStrength(mind, conceptId, tick, prerequisitesByConcept) * 1000) / 1000,
      mastery: masteryLevel(strength),
      exposures: record.exposures,
      misconceptions: [...record.misconceptions],
      source: record.source,
    };
  }
  return out;
}
