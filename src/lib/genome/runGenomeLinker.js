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
import { auditPrerequisites, buildPrerequisiteJudgment } from './prerequisiteAudit';
import { buildGlossaryGraph } from './glossaryGraph';
import { buildArchetypeBridges } from './archetypeBridges';
import { assessTargetLanguagePresence, detectForeignLanguageTeachingContent } from '../languageIdentityGuard';

function lessonIdFor(lessonIndex) {
  return `lesson-${lessonIndex + 1}`;
}

function isGenomeBackedPayload(payload) {
  const source = String(payload?.conceptProvenance?.source || payload?.enrichmentSource || '').toLowerCase();
  return source.includes('genome');
}

function respectsCourseLanguage(courseIdentity, payload) {
  const text = JSON.stringify(payload || {});
  return (
    !detectForeignLanguageTeachingContent({ courseIdentity, text }) &&
    assessTargetLanguagePresence({ courseIdentity, text }).complete
  );
}

export function describeGenomeLinkTelemetry(telemetry = {}, lessonCount = 0, shardIds = []) {
  const uncovered = telemetry.uncoveredDisciplines || [];
  let coverageNote =
    uncovered.length > 0
      ? ` (no shard for inferred discipline${uncovered.length === 1 ? '' : 's'} ${uncovered
          .map((discipline) => `'${discipline}'`)
          .join(', ')})`
      : '';
  const freeHits = (telemetry.resolvedFromGenome || 0) + (telemetry.resolvedFromCache || 0);
  if (!coverageNote && freeHits === 0 && shardIds.length > 0) {
    coverageNote = ` (shard${shardIds.length === 1 ? '' : 's'} ${shardIds
      .map((id) => `'${id}'`)
      .join(', ')} loaded but 0 lesson-concept overlap — likely a subfield not yet covered)`;
  }
  const languageNote = telemetry.languageIdentityRejects
    ? ` · ${telemetry.languageIdentityRejects} cross-language link${telemetry.languageIdentityRejects === 1 ? '' : 's'} rejected`
    : '';
  return `${telemetry.resolvedFromGenome || 0} genome + ${telemetry.resolvedFromCache || 0} cached (${telemetry.cachedGenomeBacked || 0} genome-backed) of ${lessonCount} lessons (${telemetry.conceptHits || 0} concepts, ${telemetry.citationsRendered || 0} citations, ${telemetry.bridgeCount || 0} bridges)${coverageNote}${languageNote}`;
}

// v0.14.1 (4.5): below this floor a genome match AUGMENTS the model instead
// of displacing it. One matched kernel projects one key term, so treating any
// match as full resolution shipped 1-term lessons next to 3-4-term model
// lessons (the v0.14 World Lit audit).
const FULL_RESOLUTION_MIN_KERNELS = 2;
const FULL_RESOLUTION_MIN_KEY_TERMS = 3;

/**
 * @param {object} args
 *  - courseMap, lessonIndices
 *  - library  (getIndex/getKernel)
 *  - cache    (get/set) — optional own-kernel cache
 *  - itemPlan, courseLevel hint
 *  - uncoveredDisciplines — inferred disciplines with no shard (P2.7), passed
 *    through so the budget event can explain a 0-link run
 * @returns {{ lessonContent, missingIndices, partialOverlays, telemetry }}
 */
export function runGenomeLinker({
  courseMap,
  lessonIndices,
  library,
  cache = null,
  itemPlan = [],
  level = null,
  uncoveredDisciplines = [],
  sourceReferences = {},
} = {}) {
  const lessonContent = {};
  const missingIndices = [];
  // v0.14.1 (4.5): thin genome matches, keyed `lesson-N`. These lessons ALSO
  // go to the model (they sit in missingIndices); the caller merges the two
  // payloads via mergeLessonPayloads — genome terms first, model fills to par.
  const partialOverlays = {};
  const telemetry = {
    resolvedFromCache: 0,
    cachedGenomeBacked: 0,
    resolvedFromGenome: 0,
    partialFromGenome: 0,
    misses: 0,
    conceptHits: 0,
    citationsRendered: 0,
    tierCounts: {},
    uncoveredDisciplines: [...uncoveredDisciplines],
  };

  const index = library?.getIndex ? library.getIndex() : null;
  const rawResolution = index ? resolveCourseConcepts(courseMap, index, { level }) : { perLesson: [] };
  const rejectedLanguageConceptIds = new Set();
  // The model boundary already rejects cross-language teaching content, but
  // the trusted genome used to bypass that firewall. Generic labels such as
  // "Say hello" then matched Korean kernels inside a Mandarin course. Filter
  // resolved references before composition AND before prerequisite/glossary
  // projection so no secondary surface can reintroduce the rejected concept.
  const perLesson = rawResolution.perLesson.map((entry) => {
    const conceptRefs = (entry.conceptRefs || []).filter((ref) => {
      const allowed = respectsCourseLanguage(courseMap?.courseName, library.getKernel(ref.id));
      if (!allowed) rejectedLanguageConceptIds.add(ref.id);
      return allowed;
    });
    return {
      ...entry,
      conceptRefs,
      unresolved: conceptRefs.length === 0 ? entry.unresolved : [],
    };
  });
  const lessonsWithHits = perLesson.filter((entry) => entry.conceptRefs.length > 0).length;
  const resolution = {
    ...rawResolution,
    perLesson,
    resolvedConceptCount: perLesson.reduce((sum, entry) => sum + entry.conceptRefs.length, 0),
    lessonsWithHits,
    hitRate: perLesson.length > 0 ? Number((lessonsWithHits / perLesson.length).toFixed(2)) : 0,
  };
  const byLesson = new Map(resolution.perLesson.map((entry) => [entry.lessonIndex, entry]));
  telemetry.languageIdentityRejects = rejectedLanguageConceptIds.size;

  // v0.14.1 (4.6): cross-lesson quiz dedupe. conceptResolver deliberately
  // allows the same concept in multiple lessons (coherence boost), but the
  // composition always drew mcBank items from index 0 — World Lit shipped
  // L7's Q1+Q2 byte-identical in L14. Track the next unused mcBank index per
  // concept across the WHOLE run so a repeated concept draws fresh items; an
  // exhausted bank yields fewer genome items and the compiler's deterministic
  // frames fill the un-overlaid slots. Worked examples are
  // first-occurrence-only (the v0.12.1 seenScaffolds rule for slides).
  const mcBankOffsets = new Map(); // conceptId → next unused mcBank index
  const shippedWorkedExampleConcepts = new Set(); // conceptIds whose example shipped

  for (const lessonIndex of lessonIndices) {
    const lesson = courseMap?.lessons?.[lessonIndex];
    if (!lesson) continue;
    const lessonId = lessonIdFor(lessonIndex);

    // Tier 1 — own-kernel cache (same course regenerated/revised).
    const cached = cache?.get ? cache.get(lesson) : null;
    if (cached && respectsCourseLanguage(courseMap?.courseName, cached)) {
      lessonContent[lessonId] = { ...cached, enrichmentSource: cached.enrichmentSource || 'own-kernel-cache' };
      telemetry.resolvedFromCache += 1;
      if (isGenomeBackedPayload(cached)) telemetry.cachedGenomeBacked += 1;
      continue;
    }
    if (cached) telemetry.languageIdentityRejects += 1;

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
          mcOffsets: mcBankOffsets,
          // One relevance-ranked concept owns the lesson's assessment bank.
          // This prevents a secondary concept from being exhausted on an
          // earlier lesson before it becomes the primary topic later.
          singleMcBank: true,
          excludeWorkedExampleConcepts: shippedWorkedExampleConcepts,
          sourceReferences,
        },
      );
      if (composed?.payload && (composed.payload.quizItems?.length || composed.payload.keyTerms?.length)) {
        // v0.14.1 (4.6): advance the course-level cursors only when the
        // composition actually ships (full resolution OR partial overlay —
        // both paths put these items in front of students). A rejected
        // composition leaves its bank items available to later lessons.
        for (const [conceptId, count] of Object.entries(composed.consumption?.mcConsumed || {})) {
          if (count > 0) mcBankOffsets.set(conceptId, (mcBankOffsets.get(conceptId) || 0) + count);
        }
        if (composed.consumption?.workedExampleConceptId) {
          shippedWorkedExampleConcepts.add(composed.consumption.workedExampleConceptId);
        }
        const payload = { ...composed.payload, enrichmentSource: 'genome-linked' };
        lessonContent[lessonId] = payload;
        telemetry.resolvedFromGenome += 1;
        telemetry.conceptHits += conceptKernels.length;
        const tier = composed.conceptProvenance.tier;
        telemetry.tierCounts[tier] = (telemetry.tierCounts[tier] || 0) + 1;
        telemetry.citationsRendered += composed.conceptProvenance.citations.length;
        // v0.14.1 (4.5): the genome augments, never displaces. A thin match
        // stays available here (genome-only runs still ship its cited terms),
        // but the lesson is NOT fully resolved: it keeps its place in
        // missingIndices so the model path runs, and the composed payload is
        // stashed as a partial overlay for the caller's merge.
        if (
          conceptKernels.length < FULL_RESOLUTION_MIN_KERNELS ||
          (composed.payload.keyTerms?.length || 0) < FULL_RESOLUTION_MIN_KEY_TERMS
        ) {
          partialOverlays[lessonId] = payload;
          telemetry.partialFromGenome += 1;
          missingIndices.push(lessonIndex);
        }
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
  const { findings: rawPrerequisiteFindings } = auditPrerequisites(resolution.perLesson, library);
  // V0.14 P1: detection → judgment. Classify each gap (bridgeable vs
  // assumed-background) and build cited prerequisite primers for the gaps the
  // genome can fill. Attach each primer to the lesson that needs it so the
  // overlay carries it into the compiler and exporters.
  const {
    findings: prerequisiteFindings,
    primers: prerequisitePrimers,
    summary: prerequisiteJudgmentSummary,
  } = buildPrerequisiteJudgment(rawPrerequisiteFindings, library);
  for (const primer of prerequisitePrimers) {
    const payload = lessonContent[lessonIdFor(primer.neededForLessonIndex)];
    if (!payload) continue;
    payload.prerequisitePrimers = [...(payload.prerequisitePrimers || []), primer];
  }
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
  telemetry.prerequisiteBridgesBuilt = prerequisitePrimers.length;
  telemetry.glossaryConceptCount = glossary.length;
  telemetry.bridgeCount = bridges.length;
  telemetry.structureFindingCount = structureFindings.length;

  return {
    lessonContent,
    missingIndices,
    partialOverlays,
    uncoveredDisciplines: [...uncoveredDisciplines],
    telemetry,
    prerequisiteFindings,
    prerequisitePrimers,
    prerequisiteJudgment: prerequisiteJudgmentSummary,
    glossary,
    spiralReferences: Object.fromEntries(spiralReferences),
    bridges,
    bridgeObservations: observations,
    structureFindings,
    genomeBackedLessonCount: (telemetry.resolvedFromGenome || 0) + (telemetry.cachedGenomeBacked || 0),
  };
}
