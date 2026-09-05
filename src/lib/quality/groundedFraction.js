/**
 * v0.15.187 — grounded-fraction measurement.
 *
 * The July 1 compiler audit estimated grounding per deliverable by hand
 * (courseFaq 0% … studyGuides ~45%); nothing in the pipeline measured it.
 * This walks a compiled deliverable and reports how many student-facing
 * prose bytes sit inside enrichment-tagged subtrees versus total.
 *
 * Counting rule (documented, deliberately conservative): a string counts as
 * GROUNDED when it or an ancestor object carries an `enrichmentSource`
 * marker. Surfaces that consume kernel/genome atoms without tagging
 * UNDERCOUNT — the fix is to tag them (`enrichmentSource:
 * 'lesson-content-enrichment' | 'genome-linked' | …`) when grounding them,
 * which is exactly what the atom-routing work does. The metric is a trend
 * ruler for that work, not an absolute truth claim.
 *
 * Internal/provenance subtrees (grounding traces, plans, export metadata)
 * never render to students and are excluded from BOTH sides of the ratio.
 */

import { isProvenanceMirrorKey } from '../compiledLanguageFinalizer';

// Non-rendering metadata beyond the provenance mirrors: identity/config keys
// whose strings are not student-facing prose.
const NON_PROSE_KEY_RE =
  /^(?:id|key|slug|registryId|assessmentId|courseMapRef|relatedLessons|lessonNumbers|tags|type|category|difficulty|bloomsLevel|bloomsLevels|format|enrichmentSource|source|tier|anchor|sourceColumns)$/i;

function measureNode(node, insideGrounded, totals) {
  if (typeof node === 'string') {
    const bytes = node.length;
    totals.totalBytes += bytes;
    if (insideGrounded) totals.groundedBytes += bytes;
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) measureNode(item, insideGrounded, totals);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const grounded = insideGrounded || Boolean(node.enrichmentSource);
  for (const [key, value] of Object.entries(node)) {
    if (isProvenanceMirrorKey(key) || NON_PROSE_KEY_RE.test(key)) continue;
    measureNode(value, grounded, totals);
  }
}

/** Measure one compiled deliverable. Returns { groundedBytes, totalBytes, fraction }. */
export function measureGroundedFraction(data) {
  const totals = { groundedBytes: 0, totalBytes: 0 };
  measureNode(data, false, totals);
  return {
    groundedBytes: totals.groundedBytes,
    totalBytes: totals.totalBytes,
    fraction: totals.totalBytes > 0 ? Number((totals.groundedBytes / totals.totalBytes).toFixed(4)) : 0,
  };
}

/**
 * Measure a compiled package (featureId → data map, as returned by
 * compileBlueprintDeliverables). Symbol keys (the compile-error channel) are
 * naturally excluded by Object.entries.
 */
export function measurePackageGroundedFraction(compiled = {}) {
  const perFeature = {};
  let groundedBytes = 0;
  let totalBytes = 0;
  for (const [featureId, data] of Object.entries(compiled)) {
    const measured = measureGroundedFraction(data);
    perFeature[featureId] = measured;
    groundedBytes += measured.groundedBytes;
    totalBytes += measured.totalBytes;
  }
  return {
    perFeature,
    overall: {
      groundedBytes,
      totalBytes,
      fraction: totalBytes > 0 ? Number((groundedBytes / totalBytes).toFixed(4)) : 0,
    },
  };
}
