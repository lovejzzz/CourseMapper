/**
 * runGenomeLinker.js — CurriculumOS V1: the Linker's pre-pass over generation.
 *
 * Before the model writes anything, resolve each in-scope lesson against the
 * loaded genome and the user's own-kernel cache. Three tiers, cheapest first:
 *   1. own-kernel cache  → reuse a previously generated lesson payload (free)
 *   2. genome concepts   → compose from source-anchored library kernels (free)
 *   3. miss              → hand back to the model kernel path (v0.9.11)
 *
 * Returns the composed lesson payloads (keyed `lesson-N`), the indices that
 * still need the model, and telemetry for the cost report. Pure orchestration
 * over injected resolver/library/cache — fully unit-testable.
 *
 * See docs/CURRICULUMOS_V1_DESIGN.md §5.1.
 */

import { resolveCourseConcepts } from './conceptResolver';
import { composeLessonFromConcepts } from './composeLessonFromConcepts';
import { auditPrerequisites } from './prerequisiteAudit';
import { buildGlossaryGraph } from './glossaryGraph';
import { buildArchetypeBridges } from './archetypeBridges';

function lessonIdFor(lessonIndex) {
  return `lesson-${lessonIndex + 1}`;
}

/**
 * @param {object} args
 *  - courseMap, lessonIndices
 *  - library  (getIndex/getKernel)
 *  - cache    (get/set) — optional own-kernel cache
 *  - itemPlan, courseLevel hint
 * @returns {{ lessonContent, missingIndices, telemetry }}
 */
export function runGenomeLinker({ courseMap, lessonIndices, library, cache = null, itemPlan = [], level = null } = {}) {
  const lessonContent = {};
  const missingIndices = [];
  const telemetry = {
    resolvedFromCache: 0,
    resolvedFromGenome: 0,
    misses: 0,
    conceptHits: 0,
    citationsRendered: 0,
    tierCounts: {},
  };

  const index = library?.getIndex ? library.getIndex() : null;
  const resolution = index ? resolveCourseConcepts(courseMap, index, { level }) : { perLesson: [] };
  const byLesson = new Map(resolution.perLesson.map((entry) => [entry.lessonIndex, entry]));

  for (const lessonIndex of lessonIndices) {
    const lesson = courseMap?.lessons?.[lessonIndex];
    if (!lesson) continue;
    const lessonId = lessonIdFor(lessonIndex);

    // Tier 1 — own-kernel cache (same course regenerated/revised).
    const cached = cache?.get ? cache.get(lesson) : null;
    if (cached) {
      lessonContent[lessonId] = { ...cached, enrichmentSource: cached.enrichmentSource || 'own-kernel-cache' };
      telemetry.resolvedFromCache += 1;
      continue;
    }

    // Tier 2 — genome concept composition.
    const refs = byLesson.get(lessonIndex)?.conceptRefs || [];
    const conceptKernels = refs.map((ref) => library.getKernel(ref.id)).filter(Boolean);
    if (conceptKernels.length > 0) {
      const composed = composeLessonFromConcepts(
        conceptKernels,
        {},
        {
          itemPlan,
          getArchetype: library.getArchetype ? (id) => library.getArchetype(id) : undefined,
        },
      );
      if (composed?.payload && (composed.payload.quizItems?.length || composed.payload.keyTerms?.length)) {
        lessonContent[lessonId] = { ...composed.payload, enrichmentSource: 'genome-linked' };
        telemetry.resolvedFromGenome += 1;
        telemetry.conceptHits += conceptKernels.length;
        const tier = composed.conceptProvenance.tier;
        telemetry.tierCounts[tier] = (telemetry.tierCounts[tier] || 0) + 1;
        telemetry.citationsRendered += composed.conceptProvenance.citations.length;
        continue;
      }
    }

    // Tier 3 — miss → model path.
    missingIndices.push(lessonIndex);
    telemetry.misses += 1;
  }

  telemetry.hitRate =
    lessonIndices.length > 0
      ? Number(((telemetry.resolvedFromCache + telemetry.resolvedFromGenome) / lessonIndices.length).toFixed(2))
      : 0;

  // Linker powers: prerequisite gap audit + glossary graph over the resolution.
  // These are deterministic observations, never auto-edits.
  const { findings: prerequisiteFindings } = auditPrerequisites(resolution.perLesson, library);
  const { glossary, spiralReferences } = buildGlossaryGraph(resolution.perLesson, library);
  // Layer 2: analogical bridges between concepts sharing a deep structure.
  const { bridges, observations, structureFindings } = buildArchetypeBridges(resolution.perLesson, library);
  // Attach each renderable bridge to its target lesson's payload so the study
  // guide (note string) and the slide deck (structured mapping pairs) can both
  // show the structural connection inline (student-facing).
  for (const bridge of bridges) {
    const targetId = `lesson-${bridge.toConcept.lessonIndex + 1}`;
    const payload = lessonContent[targetId];
    if (!payload) continue;
    payload.structuralConnections = [...(payload.structuralConnections || []), bridge.note];
    payload.structuralBridges = [
      ...(payload.structuralBridges || []),
      {
        archetypeName: bridge.archetypeName,
        fromTerm: bridge.fromConcept.term,
        fromLesson: bridge.fromConcept.lessonIndex + 1,
        toTerm: bridge.toConcept.term,
        mappingPairs: (bridge.mappingPairs || []).slice(0, 3).map((pair) => ({ from: pair.from, to: pair.to })),
        note: bridge.note,
      },
    ];
  }
  telemetry.prerequisiteFindingCount = prerequisiteFindings.length;
  telemetry.glossaryConceptCount = glossary.length;
  telemetry.bridgeCount = bridges.length;
  telemetry.structureFindingCount = structureFindings.length;

  return {
    lessonContent,
    missingIndices,
    telemetry,
    prerequisiteFindings,
    glossary,
    spiralReferences: Object.fromEntries(spiralReferences),
    bridges,
    bridgeObservations: observations,
    structureFindings,
  };
}
