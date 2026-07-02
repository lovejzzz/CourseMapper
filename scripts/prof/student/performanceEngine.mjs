/**
 * scripts/prof/student/performanceEngine.mjs — the mouth, under quarantine
 * (design §3e). The knowledge card is a WHITELIST: the LLM renders
 * performances strictly conditioned on it. Leakage detection is
 * deterministic (no judge-of-judges): a response using course concepts that
 * are neither on the card nor in the task text is a quarantine violation,
 * and the leakage rate is a standing validity KPI of the student model
 * itself (kill bar: ≥5% suspends mouth instruments).
 */

import { callModel } from '../modelClient.mjs';
import { strengthAt, masteryLevel } from './studentMind.mjs';
import { normalizeTerm } from './misconceptionCast.mjs';

const MASTERY_BEHAVIOR = {
  0: 'you have NEVER seen this concept — you cannot name or use it',
  1: 'recognition only — you might pick a familiar phrase but you CANNOT explain it and you garble details',
  2: 'you can explain it in your own words but you CANNOT transfer it to novel cases',
  3: 'solid — you can apply it to new situations',
};

/** The whitelist card: what this student knows, at what level, with which
 *  misconceptions — everything else is out of bounds. */
export function buildKnowledgeCard({ mind, conceptsById, misconceptionsByConcept, tick }) {
  const known = [];
  const held = [];
  for (const [conceptId, record] of mind.concepts) {
    const strength = strengthAt(mind, conceptId, tick);
    const level = masteryLevel(strength);
    const term = conceptsById.get(conceptId)?.term || conceptId;
    if (level > 0) known.push({ term, level, behavior: MASTERY_BEHAVIOR[level] });
    for (const misconceptionId of record.misconceptions) {
      const meta = (misconceptionsByConcept.get(conceptId) || []).find((entry) => entry.id === misconceptionId);
      if (meta) held.push({ term, claim: meta.claim });
    }
  }
  return { known, held };
}

function cardPrompt(card, register) {
  return [
    `You are simulating a real student. This card is a HARD WHITELIST of everything you know:`,
    card.known.length > 0
      ? card.known.map((entry) => `- ${entry.term} (level ${entry.level}: ${entry.behavior})`).join('\n')
      : '- (you know nothing from this course yet)',
    card.held.length > 0
      ? `You genuinely BELIEVE these (they are wrong, but you do not know that — answer THROUGH them):\n${card.held
          .map((entry) => `- about ${entry.term}: ${entry.claim}`)
          .join('\n')}`
      : '',
    `RULES: never use course concepts absent from this card; never correct your own misconceptions; do not sound like an assistant.`,
    `Register: ${register}.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function renderPerformance({
  card,
  task,
  register,
  model,
  temperature = 0.7,
  maxTokens = 500,
  meter,
  role,
}) {
  const response = await callModel({
    model,
    system: cardPrompt(card, register),
    user: task,
    maxTokens,
    temperature,
    meter,
    role,
  });
  return response;
}

/**
 * Deterministic leakage detector: course inventory terms that are (a) NOT on
 * the card, (b) NOT present in the task text (a student can echo the
 * question), and (c) multi-word or long enough to be unambiguous — appearing in
 * the response.
 */
export function detectLeakage({ responseText, card, courseTerms, taskText }) {
  const response = ` ${normalizeTerm(responseText)} `;
  const task = ` ${normalizeTerm(taskText)} `;
  const cardTerms = new Set(card.known.map((entry) => normalizeTerm(entry.term)));
  const leaked = [];
  for (const term of courseTerms) {
    const normalized = normalizeTerm(term);
    // Single generic words false-positive wildly; require 2+ words or 10+ chars.
    if (!normalized || (normalized.split(' ').length < 2 && normalized.length < 10)) continue;
    if (cardTerms.has(normalized)) continue;
    if (task.includes(` ${normalized} `)) continue;
    if (response.includes(` ${normalized} `)) leaked.push(term);
  }
  return leaked;
}
