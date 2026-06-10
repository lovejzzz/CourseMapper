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
import { renderCourseMapFromGraph } from './renderCourseMap.js';

/**
 * Assemble the enrichment overlay from the graph: the stored overlay
 * (course-level lens, signature terms, per-session composed content) plus
 * any per-concept kernel payloads keyed to their sessions.
 */
export function enrichmentFromGraph(graph) {
  if (!graph || typeof graph !== 'object') return null;
  const overlay =
    graph.enrichmentOverlay && typeof graph.enrichmentOverlay === 'object' ? { ...graph.enrichmentOverlay } : {};
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
  graph.enrichmentOverlay = enrichment;

  const lessonContent =
    enrichment.lessonContent && typeof enrichment.lessonContent === 'object' ? enrichment.lessonContent : {};
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
      concept.source = concept.source || enrichment.quality?.source || enrichment.source || 'enrichment';
    }
  }
  return graph;
}

/** Compile a course blueprint from the graph (render + enrichment overlay). */
export function buildBlueprintFromGraph(graph, options = {}) {
  const courseMap = renderCourseMapFromGraph(graph);
  const graphEnrichment = enrichmentFromGraph(graph);
  const enrichment =
    options.enrichment && typeof options.enrichment === 'object'
      ? { ...graphEnrichment, ...options.enrichment }
      : graphEnrichment;
  return buildCourseBlueprint(courseMap, {
    ...options,
    ...(enrichment ? { enrichment } : {}),
  });
}
