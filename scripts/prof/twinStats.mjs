/**
 * scripts/prof/twinStats.mjs — pure statistics + blinding for the
 * same-generation twin protocol (Prof design: the C2 lesson).
 *
 * The confound the twin kills: two INDEPENDENT generations differ by model
 * variance before the compiler ever runs, so independent adoption rounds
 * measure noise. A twin compiles ONE captured generation under two compiler
 * versions; each universe judges both packages blind, and the statistic is
 * the CI on the per-universe DELTA — generation variance and judge harshness
 * cancel within each pair.
 */
import { meanWithCI } from './collapse.mjs';
import { seededRandom } from './universe.mjs';

/**
 * Deterministic per-universe blind assignment. Returns, for each universe
 * index, whether package A is presented first ("Packet One"). Seeded and
 * balanced: alternates from a seeded start so N universes split as evenly as
 * parity allows — a lopsided assignment would let position bias masquerade
 * as a compiler effect.
 */
export function blindAssignments(count, seed) {
  const rng = seededRandom(seed);
  const startWithA = rng() < 0.5;
  return Array.from({ length: count }, (_, index) => ({
    index,
    aIsPacketOne: index % 2 === 0 ? startWithA : !startWithA,
  }));
}

/**
 * Paired statistics over per-universe deltas (teachB − teachA, positive =
 * candidate compiler better). Uses the same t-based CI as the rest of Prof.
 */
export function pairedDeltaStats(pairs) {
  const deltas = pairs.map((pair) => pair.teachB - pair.teachA);
  const stats = meanWithCI(deltas);
  const wins = pairs.filter((pair) => pair.preference === 'B').length;
  const losses = pairs.filter((pair) => pair.preference === 'A').length;
  const ties = pairs.length - wins - losses;
  const significant = Boolean(stats.ci95 && (stats.ci95[0] > 0 || stats.ci95[1] < 0));
  return { n: pairs.length, deltaMean: stats.mean, deltaCi95: stats.ci95 ?? null, wins, losses, ties, significant };
}

/**
 * Refuse to compare packages that are not a true twin. Both fixtures must
 * declare the SAME generationId (hash of the captured project) — otherwise
 * this is exactly the confounded comparison the harness exists to prevent.
 */
export function assertTwinProvenance(fixtureA, fixtureB) {
  const idA = fixtureA?.twin?.generationId;
  const idB = fixtureB?.twin?.generationId;
  if (!idA || !idB) {
    throw new Error('Twin fixtures must carry twin.generationId (built by twinCompile from ONE captured project).');
  }
  if (idA !== idB) {
    throw new Error(
      `NOT A TWIN: generationId mismatch (${idA.slice(0, 12)}… vs ${idB.slice(0, 12)}…) — these packages come from different generations; the comparison would be confounded by generation variance.`,
    );
  }
  if (fixtureA?.twin?.compilerRef && fixtureA.twin.compilerRef === fixtureB?.twin?.compilerRef) {
    throw new Error(`Twin sides were compiled at the SAME ref (${fixtureA.twin.compilerRef}) — nothing to measure.`);
  }
  return { generationId: idA, refA: fixtureA?.twin?.compilerRef ?? null, refB: fixtureB?.twin?.compilerRef ?? null };
}
