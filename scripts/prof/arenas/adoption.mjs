/**
 * scripts/prof/arenas/adoption.mjs — Arena A1 (design doc §2).
 *
 * For each universe: build the reading packet from the EXTRACTED export text
 * (Artifact Bridge), attach the workload account, run the persona's adoption
 * review, screen findings through quote-or-discard, and append to the ledger.
 */

import { loadPersona, runAdoptionReview, buildReadingPacket } from '../personaEngine.mjs';
import { runPool } from '../../lib/crucibleRound.mjs';

export async function runAdoptionArena({
  universes,
  extracted,
  workloadAccount,
  courseBrief,
  meter,
  ledger,
  artifactLabel,
  concurrency = 3,
}) {
  const errors = [];
  const results = await runPool(universes, concurrency, async (universe) => {
    try {
      return await reviewOneUniverse(universe);
    } catch (error) {
      // One persona failing (invalid JSON twice, provider outage) must not
      // void the term — spend-cap errors DO abort, they are the budget rule.
      if (/Spend cap/.test(String(error.message))) throw error;
      errors.push({ universeId: universe.universeId, error: String(error.message) });
      return null;
    }
  });

  async function reviewOneUniverse(universe) {
    const persona = await loadPersona(universe.instructor);
    const packet = buildReadingPacket({
      extracted,
      readingOrder: universe.readingOrder,
      hotSpot: persona.hotSpot,
    });
    const review = await runAdoptionReview({
      persona,
      packet,
      workloadAccount,
      model: universe.modelSeat,
      temperature: universe.temperature,
      meter,
      courseBrief,
    });
    const screened = ledger.screenVerdict(review.verdict, {
      universeId: universe.universeId,
      personaId: persona.id,
    });
    const entry = {
      arena: 'adoption',
      universeId: universe.universeId,
      personaId: persona.id,
      personaPool: persona.pool,
      model: review.model,
      artifact: artifactLabel,
      readingOrder: universe.readingOrder,
      verdict: screened,
      costUsd: review.costUsd,
    };
    ledger.append(entry);
    return entry;
  }

  return { reviews: results.filter(Boolean), errors };
}
