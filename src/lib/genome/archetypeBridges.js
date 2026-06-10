/**
 * archetypeBridges.js — CurriculumOS Layer 2: analogical bridges.
 *
 * When two concepts IN THE SAME COURSE share a deep structure (the same
 * archetype), the compiler can render the single most-evidenced transfer
 * technique there is: an explicit structural analogy ("this is the same
 * structure as X — the price plays the role of concentration"). No
 * context-bound chat model can do this, because the other concept is not in
 * its window — only the genome graph holds both.
 *
 * Guardrail (design §6): a bridge RENDERS in student-facing output only when
 * both mappings are verified (or confidence ≥ 0.85). Weaker matches surface
 * only as TA observations — never as asserted analogies, because a forced
 * analogy actively harms learning.
 *
 * See docs/CURRICULUMOS_ARCHETYPE_LAYER_DESIGN.md §5.
 */

const RENDER_CONFIDENCE = 0.85;

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function instancesByArchetype(perLesson, library) {
  // archetypeId -> [{ lessonIndex, conceptId, term, instance }]
  const map = new Map();
  for (const entry of perLesson) {
    for (const ref of entry.conceptRefs || []) {
      const kernel = library.getKernel?.(ref.id);
      for (const instance of kernel?.edges?.instanceOf || []) {
        if (!map.has(instance.archetype)) map.set(instance.archetype, []);
        map.get(instance.archetype).push({
          lessonIndex: entry.lessonIndex,
          conceptId: ref.id,
          term: cleanText(kernel.term),
          instance,
        });
      }
    }
  }
  return map;
}

function bridgeIsRenderable(a, b) {
  const verified = a.instance.verified === true && b.instance.verified === true;
  const confident =
    (a.instance.confidence ?? 0) >= RENDER_CONFIDENCE && (b.instance.confidence ?? 0) >= RENDER_CONFIDENCE;
  return verified || confident;
}

/**
 * @param {object[]} perLesson — resolver output [{lessonIndex, conceptRefs:[{id}]}]
 * @param {object} library — getKernel / getArchetype
 * @returns {{ bridges, observations, structureFindings }}
 *   bridges: renderable analogies (student-facing)
 *   observations: candidate analogies for the TA only (below the gate)
 *   structureFindings: courses teaching ≥2 instances of one structure
 */
export function buildArchetypeBridges(perLesson = [], library) {
  const bridges = [];
  const observations = [];
  const structureFindings = [];
  if (!library?.getKernel) return { bridges, observations, structureFindings };

  for (const [archetypeId, instances] of instancesByArchetype(perLesson, library)) {
    // Distinct concepts only (a concept bridging to itself is not transfer).
    const distinct = [];
    const seen = new Set();
    for (const inst of instances) {
      if (seen.has(inst.conceptId)) continue;
      seen.add(inst.conceptId);
      distinct.push(inst);
    }
    if (distinct.length < 2) continue;

    const archetype = library.getArchetype?.(archetypeId);
    structureFindings.push({
      archetype: archetypeId,
      archetypeName: archetype?.name || archetypeId,
      conceptIds: distinct.map((d) => d.conceptId),
      lessonIndices: distinct.map((d) => d.lessonIndex),
      message: `This course teaches ${distinct.length} instances of ${archetype?.name || archetypeId} (${distinct
        .map((d) => d.term)
        .join(', ')}) — naming the shared structure is a high-value transfer opportunity.`,
    });

    // First introduction is the anchor; later concepts bridge back to it.
    distinct.sort((a, b) => a.lessonIndex - b.lessonIndex);
    const anchor = distinct[0];
    for (let i = 1; i < distinct.length; i += 1) {
      const target = distinct[i];
      const sharedSlots = archetype
        ? archetype.slots
            .map((slot) => ({
              slot,
              from: cleanText(anchor.instance.mapping?.[slot]),
              to: cleanText(target.instance.mapping?.[slot]),
            }))
            .filter((pair) => pair.from && pair.to)
        : [];
      const bridge = {
        archetype: archetypeId,
        archetypeName: archetype?.name || archetypeId,
        fromConcept: { id: anchor.conceptId, term: anchor.term, lessonIndex: anchor.lessonIndex },
        toConcept: { id: target.conceptId, term: target.term, lessonIndex: target.lessonIndex },
        mappingPairs: sharedSlots,
      };
      if (bridgeIsRenderable(anchor, target) && sharedSlots.length >= 2) {
        // "corresponds to" reads correctly whether a slot value is singular or
        // plural (avoids "the forward and reverse reactions plays the role…").
        bridge.note = `${target.term} shares the deep structure of ${anchor.term} (${archetype?.name || archetypeId}, Lesson ${anchor.lessonIndex + 1}): ${sharedSlots
          .slice(0, 3)
          .map((pair) => `${pair.to} corresponds to ${pair.from}`)
          .join('; ')}.`;
        bridges.push(bridge);
      } else {
        bridge.reason = 'below render threshold (unverified or low-confidence mapping)';
        observations.push(bridge);
      }
    }
  }

  return { bridges, observations, structureFindings };
}
