/**
 * projectRestoreCompiler.js — v0.15.1 C1: the compact-restore compiler,
 * extracted from AppFlow (pure: snapshot in, deliverable state out).
 *
 * A compact snapshot (deliverableSaveMode 'recompile-on-open') carries no
 * deliverable data — this rebuilds the package on open. v0.15: it compiles
 * FROM the saved CourseGraph (enrichment included) whenever the graph rode
 * along; the bare-map path is the belt for v1 snapshots only (compiling
 * from the bare map silently dropped the enrichment overlay — a restored
 * package once drifted 237 registry changes from its own graph).
 */
import { warn } from './logger';

export async function compileCompactProjectDeliverables(saved) {
  if (saved?.deliverableSaveMode !== 'recompile-on-open') return {};
  if (!saved?.courseMap || !Array.isArray(saved.courseMap.lessons)) return {};
  const selectedFeatureIds = Array.isArray(saved.selectedFeatures)
    ? saved.selectedFeatures.filter((featureId) => featureId && featureId !== 'courseMap')
    : [];
  const featureIds =
    Array.isArray(saved.deliverableFeatureIds) && saved.deliverableFeatureIds.length > 0
      ? saved.deliverableFeatureIds
      : selectedFeatureIds;
  if (featureIds.length === 0) return {};

  try {
    const {
      buildCourseBlueprint,
      compactBlueprintForStorage,
      compileBlueprintDeliverables,
      getBlueprintCompiledFeatures,
    } = await import('./courseBlueprintCompiler');
    const compiledFeatureIds = getBlueprintCompiledFeatures(featureIds);
    if (compiledFeatureIds.length === 0) return {};
    // v0.15.3 D1: restore compiles with the CURRENT depth flag — same
    // injection as generation and sync, so a restored package never drifts
    // from what a fresh compile would produce.
    const { applyLessonDepthToConfigMap } = await import('./lessonDepth');
    const configMap = applyLessonDepthToConfigMap(
      Object.fromEntries(
        compiledFeatureIds.map((featureId) => [featureId, saved.deliverableConfig?.[featureId] || {}]),
      ),
    );
    // v0.15 (sync-test finding): a compact restore used to compile from
    // the BARE course map, silently dropping the saved graph's enrichment
    // overlay — the restored package drifted 237 registry changes from
    // the graph, and a post-restore ZIP shipped the degraded tier. The
    // saved CourseGraph is the source of truth: compile FROM it whenever
    // it rode along (formatVersion 2); the bare-map path stays as the
    // legacy belt for v1 snapshots only.
    let blueprint = null;
    if (saved.courseGraph && Array.isArray(saved.courseGraph.sessions)) {
      try {
        const { buildBlueprintFromGraph } = await import('./courseGraph');
        blueprint = compactBlueprintForStorage(buildBlueprintFromGraph(saved.courseGraph));
      } catch (graphErr) {
        warn('[Project] compact restore: graph compile failed, falling back to map:', graphErr);
        blueprint = null;
      }
    }
    if (!blueprint) {
      blueprint = compactBlueprintForStorage(
        buildCourseBlueprint(saved.courseMap, {
          compilerPath: {
            mode: 'compact-restore',
            reason: 'Restored from a compact CourseMapper project.',
          },
        }),
      );
    }
    const compiled = compileBlueprintDeliverables(blueprint, compiledFeatureIds, { configMap });
    return Object.fromEntries(
      compiledFeatureIds
        .filter((featureId) => compiled[featureId])
        .map((featureId) => [
          featureId,
          {
            ...(saved.deliverableManifest?.[featureId] || {}),
            status: 'done',
            data: compiled[featureId],
            restoredFrom: 'compact-project',
          },
        ]),
    );
  } catch (e) {
    warn('[Project] compact restore failed:', e);
    return {};
  }
}
