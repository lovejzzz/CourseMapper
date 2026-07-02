/**
 * scripts/prof/universe.mjs — the universe and term records.
 *
 * Design doc §4: the universe is the unit of execution. §11 term modes:
 * every term declares what is under test — `instrument` (testing Project
 * Prof itself; course findings quarantined) or `course` (testing CourseMapper
 * output). Mode "both" is DELIBERATELY rejected here, in code, because
 * implementation pressure blurs the distinction otherwise.
 */

export const TERM_MODES = new Set(['instrument', 'course']);

export function createTerm({ mode, scenarioId, arena, capUsd, seed }) {
  if (!TERM_MODES.has(mode)) {
    throw new Error(
      `Term mode must be "instrument" or "course" (got "${mode}"). ` +
        'Mode "both" is not allowed by design — run twice under the two modes.',
    );
  }
  if (!scenarioId) throw new Error('Term requires a scenarioId.');
  if (!Number.isFinite(capUsd) || capUsd <= 0) throw new Error('Term requires a positive capUsd.');
  const startedAt = new Date().toISOString();
  return {
    termId: `term-${startedAt.replace(/[:.]/g, '-')}-${scenarioId}`,
    mode,
    scenarioId,
    arena,
    capUsd,
    seed: Number.isFinite(seed) ? seed : 1,
    startedAt,
    quarantined: mode === 'instrument',
  };
}

/** Deterministic PRNG (mulberry32) — replayable universes, no Math.random. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const READING_ORDERS = ['syllabus-first', 'exam-first', 'lesson-plan-first'];

/**
 * Build N universes for a scenario: rotate personas, model seats, and reading
 * orders so no two universes share (persona, model, order) — independence by
 * construction (§4b).
 */
export function buildUniverses({ scenario, count, seed }) {
  const rng = seededRandom(seed);
  const cast = scenario.instructorCast;
  if (!Array.isArray(cast) || cast.length === 0) throw new Error('Scenario needs instructorCast.');
  const seats = scenario.modelSeats;
  if (!Array.isArray(seats) || seats.length === 0) throw new Error('Scenario needs modelSeats.');
  const universes = [];
  for (let index = 0; index < count; index += 1) {
    // Diagonal rotation: each axis advances at a different stride so aligned
    // lists (3 personas × 3 seats × 3 orders) never lock into the same 3
    // combinations — that alignment IS the photocopied-universe trap (§4b).
    const cycle = Math.floor(index / cast.length);
    universes.push({
      universeId: `${scenario.id}/u${index + 1}`,
      courseArtifact: scenario.packageDir,
      instructor: cast[index % cast.length],
      modelSeat: seats[(index + cycle) % seats.length],
      readingOrder: READING_ORDERS[(index + 2 * cycle) % READING_ORDERS.length],
      temperature: 0.3 + Math.round(rng() * 4) / 10, // 0.3–0.7, seeded
      universeSeed: Math.floor(rng() * 1e9),
    });
  }
  return universes;
}
