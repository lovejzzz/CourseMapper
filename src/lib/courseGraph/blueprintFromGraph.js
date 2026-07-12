/**
 * courseGraph/blueprintFromGraph.js — v0.13 P0: compile FROM the graph.
 *
 * The blueprint compiler stays the proven projection engine; this adapter
 * feeds it from the graph instead of from prose. Concept entities that
 * carry authored or genome-linked kernels are assembled into the
 * lessonContent enrichment overlay the compiler already consumes — Concept
 * ≡ kernel, so the graph IS the enrichment source.
 *
 * P6 progressively bypasses the compiler's prose-inference heuristics where
 * graph data answers directly; until then equivalence with the map-driven
 * path is guaranteed by construction (render → same compile path).
 */

import { buildCourseBlueprint } from '../courseBlueprintCompiler.js';
import { repairScionEnrichmentAnswerKeys } from '../scionAnswerKeyAlignment.js';
import { renderCourseMapFromGraph } from './renderCourseMap.js';

/**
 * Assemble the enrichment overlay from the graph: the stored overlay
 * (course-level lens, signature terms, per-session composed content) plus
 * any per-concept kernel payloads keyed to their sessions.
 */
export function enrichmentFromGraph(graph) {
  if (!graph || typeof graph !== 'object') return null;
  const storedOverlay =
    graph.enrichmentOverlay && typeof graph.enrichmentOverlay === 'object' ? { ...graph.enrichmentOverlay } : {};
  const { enrichment: overlay } = repairScionEnrichmentAnswerKeys(storedOverlay);
  const lessonContent = { ...(overlay.lessonContent || {}) };

  // Concepts carrying kernels contribute to the sessions that teach them.
  const sessionById = new Map((graph.sessions || []).map((session) => [session.id, session]));
  for (const edge of graph.edges?.teaches || []) {
    const session = sessionById.get(edge?.from);
    const concept = (graph.concepts || []).find((entry) => entry.id === edge?.to);
    if (!session || !concept?.kernel || typeof concept.kernel !== 'object') continue;
    const key = `lesson-${session.number}`;
    // Session-level composed content (from the overlay) wins; per-concept
    // kernels fill sessions the overlay does not cover.
    if (!lessonContent[key]) lessonContent[key] = concept.kernel;
  }

  const hasOverlayContent = Object.keys(lessonContent).length > 0;
  if (!hasOverlayContent && Object.keys(overlay).length === 0) return null;
  return {
    ...overlay,
    ...(hasOverlayContent ? { lessonContent } : {}),
  };
}

// v0.14.1 (4.4): payloads from these sources carry conceptProvenance with
// genome concept ids — the linker's full compositions ('genome-linked',
// including ones replayed from the own-kernel cache) and the 4.5 merge of a
// genome partial with a model kernel ('genome-augmented').
const GENOME_PAYLOAD_SOURCES = new Set(['genome-linked', 'genome-augmented']);

/**
 * Attach a generation-time enrichment result to the graph: the full object
 * becomes the overlay (so enrichmentFromGraph reproduces it exactly — the
 * compile path stays byte-equivalent with the legacy options.enrichment
 * call), and per-lesson kernel payloads are ALSO distributed onto each
 * session's primary Concept entity so agent operations, stats, and future
 * entity-level features see Concept ≡ kernel.
 */
export function attachEnrichmentToGraph(graph, enrichment) {
  if (!graph || typeof graph !== 'object') return graph;
  if (!enrichment || typeof enrichment !== 'object') return graph;
  const { enrichment: alignedEnrichment } = repairScionEnrichmentAnswerKeys(enrichment);
  graph.enrichmentOverlay = alignedEnrichment;

  const lessonContent =
    alignedEnrichment.lessonContent && typeof alignedEnrichment.lessonContent === 'object'
      ? alignedEnrichment.lessonContent
      : {};
  const sessionByNumber = new Map((graph.sessions || []).map((session) => [session.number, session]));
  const sessionById = new Map((graph.sessions || []).map((session) => [session.id, session]));
  const conceptsById = new Map((graph.concepts || []).map((concept) => [concept.id, concept]));
  const primaryConceptBySessionId = new Map();
  for (const edge of graph.edges?.teaches || []) {
    if (edge?.from && !primaryConceptBySessionId.has(edge.from)) primaryConceptBySessionId.set(edge.from, edge.to);
  }

  for (const [key, payload] of Object.entries(lessonContent)) {
    if (!payload || typeof payload !== 'object') continue;
    const numberMatch = String(key).match(/^lesson-(\d+)$/);
    const session = numberMatch ? sessionByNumber.get(Number(numberMatch[1])) : sessionById.get(key);
    const conceptId = session ? primaryConceptBySessionId.get(session.id) : null;
    const concept = conceptId ? conceptsById.get(conceptId) : null;
    if (concept) {
      concept.kernel = payload;
      concept.source = concept.source || alignedEnrichment.quality?.source || alignedEnrichment.source || 'enrichment';
      // v0.14.1 (4.4): write the genomeLink edges. Created empty at
      // schema.js:41 and read by courseGraphStats, but written by nobody —
      // the v0.14 audit's "(0 genome-linked)" digest lie while the linker
      // had resolved 3 lessons. Edges are { from, to } OBJECTS, never
      // tuples: Firestore rejects directly nested arrays and the cloud
      // project snapshot carries the graph (v0.13.1 production rule).
      const provenanceIds = GENOME_PAYLOAD_SOURCES.has(payload.enrichmentSource)
        ? payload.conceptProvenance?.conceptIds || []
        : [];
      if (provenanceIds.length > 0) {
        if (!graph.edges || typeof graph.edges !== 'object') graph.edges = {};
        // Older graphs predate the genomeLink collection — initialize.
        if (!Array.isArray(graph.edges.genomeLink)) graph.edges.genomeLink = [];
        for (const genomeConceptId of provenanceIds) {
          if (typeof genomeConceptId !== 'string' || genomeConceptId.length === 0) continue;
          const exists = graph.edges.genomeLink.some(
            (edge) => edge?.from === concept.id && edge?.to === genomeConceptId,
          );
          if (!exists) graph.edges.genomeLink.push({ from: concept.id, to: genomeConceptId });
        }
      }
    }
  }
  return graph;
}

// Origins minted by the knowledge backbone (v0.13.5). Cell-parsed
// 'syllabus'-origin resources are NOT included: they already render in
// supportingResources, and passing them would make the graph path diverge
// from the map path (golden equivalence).
const KNOWLEDGE_BACKBONE_ORIGINS = new Set([
  'genome',
  'genome-prerequisite',
  'openalex',
  'openlibrary',
  'openstax',
  'source-finder',
]);

/** Compile a course blueprint from the graph (render + enrichment overlay). */
export function buildBlueprintFromGraph(graph, options = {}) {
  // The compile render is CANONICAL (no display reference suffixes) — the
  // registry, not cell text, carries assessment identity into the compiler.
  const courseMap = renderCourseMapFromGraph(graph);
  const graphEnrichment = enrichmentFromGraph(graph);
  const knowledgeResources = (graph?.resources || []).filter((resource) =>
    KNOWLEDGE_BACKBONE_ORIGINS.has(resource?.origin),
  );
  // v0.14.1 (3.2): the assessment registry IS the blueprint's assessment
  // identity — one brief per graded artifact, real exam documents, oral
  // prompt sheets. Entries must carry a title and an integer dueSession;
  // legacy graphs whose assessments predate the registry (no kind) still
  // pass through and default to graded-artifact in the compiler.
  const assessmentRegistry = (graph?.assessments || []).filter(
    (assessment) =>
      assessment && typeof assessment === 'object' && assessment.title && Number.isInteger(assessment.dueSession),
  );
  // v0.14.5 (A2): the readings registry rides into the blueprint the same
  // way — instructor-named titles become the leading items of every readings
  // surface (lesson-plan materials, syllabus week rows, briefs, discussion
  // anchors). Strictly additive: an empty registry changes nothing.
  const readingsRegistry = (graph?.readings || []).filter(
    (reading) => reading && typeof reading === 'object' && reading.title && Number.isInteger(reading.dueSession),
  );
  const enrichment =
    options.enrichment && typeof options.enrichment === 'object'
      ? { ...graphEnrichment, ...options.enrichment }
      : graphEnrichment;
  return buildCourseBlueprint(courseMap, {
    ...options,
    ...(enrichment ? { enrichment } : {}),
    // v0.13.5: Resource entities (genome anchor sections, open readings,
    // book metadata) ride into the blueprint for the syllabus appendix and
    // required texts. Explicit options win.
    ...(knowledgeResources.length > 0 && !options.knowledgeResources ? { knowledgeResources } : {}),
    ...(assessmentRegistry.length > 0 && !options.assessmentRegistry ? { assessmentRegistry } : {}),
    ...(readingsRegistry.length > 0 && !options.readingsRegistry ? { readingsRegistry } : {}),
  });
}
